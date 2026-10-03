/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { LOCAL_PRELUDE, loadSdl, RESOLVERS, resolverPath } from '@pricing-engine/api';
import { GraphQLError } from 'graphql';
import { createPubSub, createSchema, createYoga } from 'graphql-yoga';
import { useServer } from 'graphql-ws/use/ws';
import { WebSocketServer } from 'ws';
import { isAppSyncError, loadResolver, runResolver, type LoadedResolver } from './resolver-runtime.js';

export interface ShimOptions { ddb: DynamoDBClient; tableName: string; publishToken: string; host: string; port: number }

export async function startShim(opts: ShimOptions): Promise<{ url: string; wsUrl: string; close: () => Promise<void> }> {
  const loaded = new Map<string, { resolver: LoadedResolver; dataSource: 'TABLE' | 'NONE' }>();
  for (const r of RESOLVERS) {
    loaded.set(`${r.typeName}.${r.fieldName}`, { resolver: await loadResolver(resolverPath(r.typeName, r.fieldName)), dataSource: r.dataSource });
  }
  const pubSub = createPubSub<Record<string, [any]>>();

  const run = async (type: string, field: string, args: Record<string, unknown>) => {
    const l = loaded.get(`${type}.${field}`)!;
    try {
      return await runResolver(l.resolver, l.dataSource, args, { ddb: opts.ddb, tableName: opts.tableName });
    } catch (e) {
      if (isAppSyncError(e)) throw new GraphQLError(e.message, { extensions: { errorType: e.type } });
      throw e;
    }
  };

  const schema = createSchema({
    typeDefs: LOCAL_PRELUDE + loadSdl(),
    resolvers: {
      Query: {
        price: (_: unknown, args: any) => run('Query', 'price', args),
        decision: (_: unknown, args: any) => run('Query', 'decision', args),
        pricesByCategory: (_: unknown, args: any) => run('Query', 'pricesByCategory', args),
      },
      Mutation: {
        putInput: (_: unknown, args: any) => run('Mutation', 'putInput', args),
        publishPrice: async (_: unknown, args: any, context: any) => {
          if (context.request.headers.get('x-pricing-publish-token') !== opts.publishToken) {
            throw new GraphQLError('Unauthorized: publishPrice requires IAM (local publish token missing or wrong)', { extensions: { errorType: 'Unauthorized' } });
          }
          const result = (await run('Mutation', 'publishPrice', args)) as { sku: string };
          pubSub.publish('price:' + result.sku, result);
          return result;
        },
      },
      Subscription: {
        onPriceChanged: {
          subscribe: (_: unknown, args: any) => pubSub.subscribe('price:' + args.sku),
          resolve: (payload: unknown) => payload,
        },
      },
    },
  });

  const yoga = createYoga({ schema, graphqlEndpoint: '/graphql', logging: false, maskedErrors: false });
  const server = createServer(yoga);
  const wss = new WebSocketServer({ server, path: '/graphql' });
  useServer(
    {
      execute: (a: any) => a.rootValue.execute(a),
      subscribe: (a: any) => a.rootValue.subscribe(a),
      onSubscribe: async (ctx: any, _id: string, params: any) => {
        const { schema, execute, subscribe, contextFactory, parse, validate } = yoga.getEnveloped({ ...ctx, req: ctx.extra.request, socket: ctx.extra.socket, params });
        const args = {
          schema,
          operationName: params.operationName,
          document: parse(params.query),
          variableValues: params.variables,
          contextValue: await contextFactory(),
          rootValue: { execute, subscribe },
        };
        const errors = validate(args.schema, args.document);
        return errors.length ? errors : args;
      },
    },
    wss,
  );

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, opts.host, () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://${opts.host}:${port}/graphql`,
    wsUrl: `ws://${opts.host}:${port}/graphql`,
    close: async () => {
      for (const c of wss.clients) c.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
