import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { InvalidRuleSetError } from 'pricing-rules-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DynamoDBStore } from '../src/ddb-store.js';
import { RuleSetNotFoundError } from '../src/store.js';
import { defaultRuleSet, localClients, requireDynamoLocal, seedSku, tempTable } from './support/ddb.js';

describe.skipIf(process.env['PRICING_INTEGRATION'] !== '1')('DynamoDBStore (DynamoDB Local)', () => {
  const clients = localClients();
  let table: Awaited<ReturnType<typeof tempTable>>;

  beforeAll(async () => {
    await requireDynamoLocal(clients);
    table = await tempTable(clients);
  });
  afterAll(async () => { await table?.drop(); });

  it('loads meta and inputs, and undefined for an unknown sku', async () => {
    await seedSku(clients.doc, table.name, 'S1', { cost: 1000, competitor: 1500 });
    const store = new DynamoDBStore({ doc: clients.doc, tableName: table.name });
    const state = await store.loadSku('S1');
    expect(state?.meta).toMatchObject({ category: 'tools', ruleSetId: 'default' });
    expect(state?.inputs).toEqual({ COST: { value: 1000, seq: 1 }, COMPETITOR: { value: 1500, seq: 1 } });
    expect(await store.loadSku('NOPE')).toBeUndefined();
  });

  it('caches the active rule set', async () => {
    await seedSku(clients.doc, table.name, 'S2', { cost: 1000 });
    const store = new DynamoDBStore({ doc: clients.doc, tableName: table.name });
    expect(await store.loadActiveRuleSet('default')).toEqual(defaultRuleSet);
    let sends = 0;
    const orig = clients.doc.send.bind(clients.doc);
    (clients.doc as unknown as { send: unknown }).send = (...a: unknown[]) => { sends++; return (orig as (...x: unknown[]) => unknown)(...a); };
    try {
      await store.loadActiveRuleSet('default');
    } finally {
      (clients.doc as unknown as { send: unknown }).send = orig;
    }
    expect(sends).toBe(0);
  });

  it('throws InvalidRuleSetError for a hand-edited rule set (Review Focus 4)', async () => {
    const bad = { ...defaultRuleSet, id: 'broken', defaultMarkupBps: 1.5 };
    await clients.doc.send(new PutCommand({ TableName: table.name, Item: { PK: 'RULESET#broken', SK: 'v1', ruleSet: bad } }));
    await clients.doc.send(new PutCommand({ TableName: table.name, Item: { PK: 'RULESET#broken', SK: 'ACTIVE', version: 1 } }));
    const store = new DynamoDBStore({ doc: clients.doc, tableName: table.name });
    await expect(store.loadActiveRuleSet('broken')).rejects.toBeInstanceOf(InvalidRuleSetError);
  });

  it('throws RuleSetNotFoundError when ACTIVE is missing', async () => {
    const store = new DynamoDBStore({ doc: clients.doc, tableName: table.name });
    await expect(store.loadActiveRuleSet('missing')).rejects.toBeInstanceOf(RuleSetNotFoundError);
  });
});
