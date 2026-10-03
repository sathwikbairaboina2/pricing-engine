/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ShimPublisher } from '@pricing-engine/functions';
import { createClient } from 'graphql-ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { localClients, requireDynamoLocal, seedSku, tempTable } from '../../functions/test/support/ddb.js';
import { startRunner } from '../src/runner.js';
import { startShim } from '../src/shim.js';

const TOKEN = 'test-token';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const wait = async (cond: () => boolean, ms = 5000) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await sleep(25); };

describe.skipIf(process.env['PRICING_INTEGRATION'] !== '1')('GraphQL shim + runner end to end (DynamoDB Local)', () => {
  const clients = localClients();
  let table: Awaited<ReturnType<typeof tempTable>>;
  let shim: Awaited<ReturnType<typeof startShim>>;
  let runner: { stop: () => Promise<void> };
  let wsClient: ReturnType<typeof createClient>;
  const events: any[] = [];

  const gql = async (query: string, headers: Record<string, string> = {}) => {
    const res = await fetch(shim.url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ query }) });
    return { status: res.status, body: (await res.json()) as any };
  };

  beforeAll(async () => {
    await requireDynamoLocal(clients);
    table = await tempTable(clients);
    shim = await startShim({ ddb: clients.ddb, tableName: table.name, publishToken: TOKEN, host: '127.0.0.1', port: 0 });
    runner = await startRunner({
      clients,
      tableName: table.name,
      publisher: new ShimPublisher({ url: shim.url, token: TOKEN }),
      pollIntervalMs: 50,
      dlqDir: mkdtempSync(join(tmpdir(), 'pe-dlq-')),
      startAt: 'TRIM_HORIZON',
      log: () => {},
    });
    wsClient = createClient({ url: shim.wsUrl, webSocketImpl: WebSocket });
  });
  afterAll(async () => {
    await wsClient?.dispose();
    await runner?.stop();
    await shim?.close();
    await table?.drop();
  });

  it('(a) answers a trivial query over HTTP', async () => {
    const r = await gql('{ __typename }');
    expect(r.status).toBe(200);
    expect(r.body.data.__typename).toBe('Query');
  });

  it('(b)-(c) streams a computed price to a subscriber and ignores a repeated seq', async () => {
    await seedSku(clients.doc, table.name, 'E2E-1', { category: 'e2e' });
    wsClient.subscribe(
      { query: 'subscription { onPriceChanged(sku: "E2E-1") { sku priceMinor inputsVersion } }' },
      { next: (m) => events.push(m.data?.['onPriceChanged']), error: () => {}, complete: () => {} },
    );
    await sleep(300);
    const first = await gql('mutation { putInput(sku: "E2E-1", source: COST, value: 1000, seq: 1) }');
    expect(first.body.data.putInput).toBe(true);
    await wait(() => events.length >= 1);
    expect(events[0]).toMatchObject({ sku: 'E2E-1', priceMinor: 1299 });

    const again = await gql('mutation { putInput(sku: "E2E-1", source: COST, value: 1000, seq: 1) }');
    expect(again.body.data.putInput).toBe(false);
    await sleep(1500);
    expect(events).toHaveLength(1);
  });

  it('(d) publishPrice needs the publish token', async () => {
    const m = 'mutation { publishPrice(input: { sku: "X1", priceMinor: 1, currency: "EUR", inputsVersion: 1, ruleSetVersion: 1, computedAt: "2026-10-04T00:00:00.000Z" }) { sku priceMinor } }';
    const denied = await gql(m);
    expect(denied.body.errors[0].extensions.errorType).toBe('Unauthorized');
    const ok = await gql(m, { 'x-pricing-publish-token': TOKEN });
    expect(ok.body.data.publishPrice).toEqual({ sku: 'X1', priceMinor: 1 });
  });

  it('(e) serves price, decision and pricesByCategory', async () => {
    const p = await gql('{ price(sku: "E2E-1") { sku priceMinor currency inputsVersion ruleSetVersion computedAt } }');
    expect(Object.keys(p.body.data.price).sort()).toEqual(['computedAt', 'currency', 'inputsVersion', 'priceMinor', 'ruleSetVersion', 'sku']);
    const d = await gql('{ decision(sku: "E2E-1") { price { sku } trace { ruleId } } }');
    expect(d.body.data.decision.trace.map((t: any) => t.ruleId)).toContain('base');
    const c = await gql('{ pricesByCategory(category: "e2e") { sku } }');
    expect(c.body.data.pricesByCategory.map((x: any) => x.sku)).toContain('E2E-1');
  });

  it('(f) rejects a hostile sku with BadRequest (Review Focus 2)', async () => {
    const r = await gql('mutation { putInput(sku: "bad#sku", source: COST, value: 1, seq: 1) }');
    expect(r.body.errors[0].extensions.errorType).toBe('BadRequest');
  });
});
