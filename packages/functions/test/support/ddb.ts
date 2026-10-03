import { randomUUID } from 'node:crypto';
import { DeleteTableCommand, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { RuleSet } from 'pricing-rules-core';
import { createDynamoClients, type DynamoClients } from '../../src/clients.js';
import { ensureTable } from '../../src/table-def.js';

export const DDB_ENDPOINT = process.env['PRICING_DDB_ENDPOINT'] ?? 'http://127.0.0.1:5360';
export const localClients = (): DynamoClients => createDynamoClients({ endpoint: DDB_ENDPOINT });

export async function requireDynamoLocal(clients: DynamoClients): Promise<void> {
  try {
    await clients.ddb.send(new ListTablesCommand({}));
  } catch {
    throw new Error(`DynamoDB Local not reachable at ${DDB_ENDPOINT}. Start it with: docker compose up -d dynamodb`);
  }
}

export async function tempTable(clients: DynamoClients): Promise<{ name: string; streamArn: string; drop: () => Promise<void> }> {
  const name = `Pricing-test-${randomUUID().slice(0, 8)}`;
  const { streamArn } = await ensureTable(clients.ddb, name);
  return { name, streamArn, drop: async () => { await clients.ddb.send(new DeleteTableCommand({ TableName: name })); } };
}

export const defaultRuleSet: RuleSet = {
  id: 'default', version: 1, currency: 'EUR', defaultMarkupBps: 2500,
  floor: { type: 'costPlusBps', bps: 500 }, ceiling: { type: 'multipleOfCost', factorBps: 30000 },
  rounding: { mode: 'HALF_EVEN', endingMinor: 99 }, maxStepBps: 1500,
  rules: [
    { id: 'match-competitor', when: { input: 'COMPETITOR', op: 'exists' }, then: { op: 'setTo', input: 'COMPETITOR', offsetMinor: -10 } },
    { id: 'low-stock-surge', when: { input: 'INVENTORY', op: 'lt', value: 20 }, then: { op: 'adjustBps', bps: 800 } },
  ],
};

export async function seedSku(
  doc: DynamoDBDocumentClient,
  table: string,
  sku: string,
  opts: { category?: string; cost?: number; competitor?: number; ruleSet?: RuleSet } = {},
): Promise<void> {
  const rs = opts.ruleSet ?? defaultRuleSet;
  const put = (Item: Record<string, unknown>) => doc.send(new PutCommand({ TableName: table, Item }));
  await put({ PK: `SKU#${sku}`, SK: 'META', name: `Item ${sku}`, category: opts.category ?? 'tools', currency: rs.currency, ruleSetId: rs.id });
  await put({ PK: `RULESET#${rs.id}`, SK: `v${rs.version}`, ruleSet: rs });
  await put({ PK: `RULESET#${rs.id}`, SK: 'ACTIVE', version: rs.version });
  if (opts.cost !== undefined) await put({ PK: `SKU#${sku}`, SK: 'INPUT#COST', value: opts.cost, seq: 1 });
  if (opts.competitor !== undefined) await put({ PK: `SKU#${sku}`, SK: 'INPUT#COMPETITOR', value: opts.competitor, seq: 1 });
}
