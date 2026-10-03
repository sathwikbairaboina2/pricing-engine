import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DynamoDBStore } from '../src/ddb-store.js';
import { createRecomputeHandler } from '../src/recompute.js';
import { localClients, requireDynamoLocal, seedSku, tempTable } from './support/ddb.js';
import { event, inputRecord } from './support/events.js';

describe.skipIf(process.env['PRICING_INTEGRATION'] !== '1')('stream replay (DynamoDB Local)', () => {
  const clients = localClients();
  let table: Awaited<ReturnType<typeof tempTable>>;

  beforeAll(async () => {
    await requireDynamoLocal(clients);
    table = await tempTable(clients);
  });
  afterAll(async () => { await table?.drop(); });

  it('replaying the same batch three times writes one history item and keeps computedAt', async () => {
    await seedSku(clients.doc, table.name, 'R1', { cost: 1000, competitor: 1500 });
    let t = 1_700_000_000_000;
    const handler = createRecomputeHandler({ store: new DynamoDBStore({ doc: clients.doc, tableName: table.name }), now: () => (t += 1000), log: () => {} });
    const batch = event(inputRecord('R1', 'COST', '1'), inputRecord('R1', 'COMPETITOR', '2'), inputRecord('R1', 'INVENTORY', '3'));
    const computed: string[] = [];
    const store = new DynamoDBStore({ doc: clients.doc, tableName: table.name });
    for (let i = 0; i < 3; i++) {
      const res = await handler(batch);
      expect(res.batchItemFailures).toEqual([]);
      computed.push((await store.loadSku('R1'))?.current?.computedAt ?? '');
    }
    const hist = await clients.doc.send(new QueryCommand({ TableName: table.name, KeyConditionExpression: 'PK = :p', ExpressionAttributeValues: { ':p': 'HIST#R1' } }));
    expect(hist.Items).toHaveLength(1);
    expect(computed[1]).toBe(computed[2]);
    expect(computed[0]).not.toBe('');
  });
});
