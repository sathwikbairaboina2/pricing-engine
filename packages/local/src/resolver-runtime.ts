/* eslint-disable @typescript-eslint/no-explicit-any */
import { fileURLToPath } from 'node:url';
import { GetItemCommand, PutItemCommand, QueryCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { build } from 'esbuild';

export interface LoadedResolver { request: (ctx: any) => any; response: (ctx: any) => any }

/**
 * Bundles an APPSYNC_JS resolver with `@aws-appsync/utils` aliased to the local util shim, then imports it from a data: URL.
 * Nothing is external: a data: module cannot resolve bare imports, so the shim and util-dynamodb are inlined.
 */
export async function loadResolver(file: string): Promise<LoadedResolver> {
  const result = await build({
    entryPoints: [file],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    alias: { '@aws-appsync/utils': fileURLToPath(import.meta.resolve('@pricing-engine/api/appsync-utils-shim')) },
    logLevel: 'silent',
  });
  const text = result.outputFiles[0]!.text;
  const mod = await import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'));
  return { request: mod.request, response: mod.response };
}

export interface ResolverContext { ddb: DynamoDBClient; tableName: string }

/** AppSyncError instances come from the bundled copy of the shim, so identify them by name instead of instanceof. */
export function isAppSyncError(e: unknown): e is Error & { type: string } {
  return e instanceof Error && e.constructor.name === 'AppSyncError';
}

export async function runResolver(
  r: LoadedResolver,
  dataSource: 'TABLE' | 'NONE',
  args: Record<string, unknown>,
  rc: ResolverContext,
): Promise<unknown> {
  const ctx: any = { args, arguments: args, identity: null, source: null, stash: {}, prev: {}, request: { headers: {} } };
  const req = r.request(ctx);
  if (dataSource === 'NONE') {
    ctx.result = req.payload;
    return r.response(ctx);
  }
  try {
    switch (req.operation) {
      case 'GetItem': {
        const res = await rc.ddb.send(new GetItemCommand({ TableName: rc.tableName, Key: req.key, ConsistentRead: !!req.consistentRead }));
        ctx.result = res.Item ? unmarshall(res.Item) : undefined;
        break;
      }
      case 'PutItem': {
        const item = { ...req.key, ...req.attributeValues };
        await rc.ddb.send(new PutItemCommand({
          TableName: rc.tableName,
          Item: item,
          ConditionExpression: req.condition?.expression,
          ExpressionAttributeNames: req.condition?.expressionNames,
          ExpressionAttributeValues: req.condition?.expressionValues,
        }));
        ctx.result = unmarshall(item);
        break;
      }
      case 'Query': {
        const res = await rc.ddb.send(new QueryCommand({
          TableName: rc.tableName,
          IndexName: req.index,
          KeyConditionExpression: req.query.expression,
          ExpressionAttributeNames: req.query.expressionNames,
          ExpressionAttributeValues: req.query.expressionValues,
          Limit: req.limit,
          ScanIndexForward: req.scanIndexForward ?? true,
        }));
        ctx.result = { items: (res.Items ?? []).map((i) => unmarshall(i)), nextToken: null };
        break;
      }
      default:
        throw new Error('shim: unsupported operation ' + req.operation);
    }
  } catch (e) {
    if (!(e instanceof Error) || e.message.startsWith('shim:')) throw e;
    ctx.error = { message: e.message, type: 'DynamoDB:' + e.name };
  }
  return r.response(ctx);
}
