import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DynamoDBStore } from '../src/ddb-store.js';
import type { PriceWrite } from '../src/store.js';
import { localClients, requireDynamoLocal, seedSku, tempTable } from './support/ddb.js';

describe.skipIf(process.env['PRICING_INTEGRATION'] !== '1')('versioned price writes (DynamoDB Local)', () => {
  const clients = localClients();
  let table: Awaited<ReturnType<typeof tempTable>>;
  let store: DynamoDBStore;
  let n = 0;

  beforeAll(async () => {
    await requireDynamoLocal(clients);
    table = await tempTable(clients);
    store = new DynamoDBStore({ doc: clients.doc, tableName: table.name });
  });
  afterAll(async () => { await table?.drop(); });

  const write = (sku: string, iv: number, rv: number): PriceWrite => ({
    sku,
    meta: { name: sku, category: 'tools', currency: 'EUR', ruleSetId: 'default' },
    ruleSetId: 'default',
    decision: { kind: 'PRICE', priceMinor: 1000 + iv, inputsVersion: iv, ruleSetVersion: rv, band: { floor: 900, ceiling: 3000 }, trace: [{ ruleId: 'base', beforeMinor: 1, afterMinor: 2 }] },
    computedAt: '2026-10-04T00:00:00.000Z',
    ttlEpochSeconds: 2_000_000_000,
  });
  const fresh = async () => { const sku = `C${++n}`; await seedSku(clients.doc, table.name, sku, { cost: 1000 }); return sku; };
  const current = async (sku: string) => (await store.loadSku(sku))?.current;
  const histCount = async (sku: string) =>
    (await clients.doc.send(new QueryCommand({ TableName: table.name, KeyConditionExpression: 'PK = :p', ExpressionAttributeValues: { ':p': `HIST#${sku}` } }))).Items?.length;

  it('accepts ascending versions', async () => {
    const sku = await fresh();
    expect([await store.writePrice(write(sku, 10, 1)), await store.writePrice(write(sku, 11, 1))]).toEqual(['WRITTEN', 'WRITTEN']);
    expect((await current(sku))?.inputsVersion).toBe(11);
  });
  it('rejects an older version', async () => {
    const sku = await fresh();
    expect([await store.writePrice(write(sku, 11, 1)), await store.writePrice(write(sku, 10, 1))]).toEqual(['WRITTEN', 'STALE']);
    expect((await current(sku))?.inputsVersion).toBe(11);
  });
  it('rejects an equal version', async () => {
    const sku = await fresh();
    expect([await store.writePrice(write(sku, 11, 1)), await store.writePrice(write(sku, 11, 1))]).toEqual(['WRITTEN', 'STALE']);
  });
  it('accepts a newer rule set at the same inputs version, and rejects the reverse', async () => {
    const a = await fresh();
    expect([await store.writePrice(write(a, 11, 1)), await store.writePrice(write(a, 11, 2))]).toEqual(['WRITTEN', 'WRITTEN']);
    const b = await fresh();
    expect([await store.writePrice(write(b, 11, 2)), await store.writePrice(write(b, 11, 1))]).toEqual(['WRITTEN', 'STALE']);
  });
  it('keeps one history item per WRITTEN', async () => {
    const sku = await fresh();
    const results = [await store.writePrice(write(sku, 5, 1)), await store.writePrice(write(sku, 4, 1)), await store.writePrice(write(sku, 6, 1)), await store.writePrice(write(sku, 6, 1))];
    expect(await histCount(sku)).toBe(results.filter((r) => r === 'WRITTEN').length);
  });
  it('converges under 10 concurrent shuffled writes', async () => {
    const sku = await fresh();
    const versions = [7, 3, 10, 1, 9, 2, 8, 4, 6, 5];
    await Promise.all(versions.map((v) => store.writePrice(write(sku, v, 1))));
    expect((await current(sku))?.inputsVersion).toBe(10);
  });
});
