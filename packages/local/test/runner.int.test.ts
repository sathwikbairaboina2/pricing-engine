import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { PriceMessage } from '@pricing-engine/functions';
import { evaluate } from 'pricing-rules-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultRuleSet, localClients, requireDynamoLocal, seedSku, tempTable } from '../../functions/test/support/ddb.js';
import { startRunner } from '../src/runner.js';

const wait = async (cond: () => boolean | Promise<boolean>, ms = 5000) => {
  const end = Date.now() + ms;
  while (!(await cond()) && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(process.env['PRICING_INTEGRATION'] !== '1')('local runner (DynamoDB Local)', () => {
  const clients = localClients();
  let table: Awaited<ReturnType<typeof tempTable>>;
  let runner: { stop: () => Promise<void> } | undefined;
  const messages: PriceMessage[] = [];

  beforeAll(async () => {
    await requireDynamoLocal(clients);
    table = await tempTable(clients);
  });
  afterAll(async () => {
    await runner?.stop();
    await table?.drop();
  });

  const putInput = (sku: string, source: string, value: number, seq: number) =>
    clients.doc.send(new PutCommand({ TableName: table.name, Item: { PK: `SKU#${sku}`, SK: `INPUT#${source}`, value, seq } }));
  const current = async () =>
    (await clients.doc.send(new GetCommand({ TableName: table.name, Key: { PK: 'SKU#RUN1', SK: 'PRICE#CURRENT' }, ConsistentRead: true }))).Item;

  it('turns input writes into one price, then one publish per changed price', async () => {
    await seedSku(clients.doc, table.name, 'RUN1', { cost: 1000, competitor: 1500 });
    runner = await startRunner({
      clients,
      tableName: table.name,
      publisher: { publish: async (m) => { messages.push(m); } },
      pollIntervalMs: 50,
      dlqDir: mkdtempSync(join(tmpdir(), 'pe-dlq-')),
      startAt: 'TRIM_HORIZON',
      log: () => {},
    });

    await wait(async () => (await current()) !== undefined);
    expect(await current()).toBeDefined();
    await wait(() => messages.length >= 1);
    await sleep(500);
    const expected = evaluate({ inputs: { COST: { value: 1000, seq: 1 }, COMPETITOR: { value: 1500, seq: 1 } }, ruleSet: defaultRuleSet, now: Date.now() });
    expect(expected.kind).toBe('PRICE');
    expect(messages).toHaveLength(1);
    expect(messages[0]!.priceMinor).toBe(expected.kind === 'PRICE' ? expected.priceMinor : -1);

    await putInput('RUN1', 'COMPETITOR', 1600, 2);
    await wait(() => messages.length >= 2);
    expect(messages).toHaveLength(2);
    expect(messages[1]!.priceMinor).not.toBe(messages[0]!.priceMinor);

    // INVENTORY 500 is not below 20, so the price is unchanged; the version still moves, the publish must not.
    const before = (await current())!['inputsVersion'] as number;
    await putInput('RUN1', 'INVENTORY', 500, 1);
    await wait(async () => ((await current())!['inputsVersion'] as number) > before);
    await sleep(2000);
    expect(((await current())!['inputsVersion'] as number)).toBeGreaterThan(before);
    expect(messages).toHaveLength(2);
  });
});
