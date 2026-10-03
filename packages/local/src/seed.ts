import { PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { RuleSet } from 'pricing-rules-core';

export async function putRuleSet(doc: DynamoDBDocumentClient, table: string, rs: RuleSet): Promise<void> {
  await doc.send(new PutCommand({ TableName: table, Item: { PK: `RULESET#${rs.id}`, SK: `v${rs.version}`, ruleSet: rs, status: 'ACTIVE' } }));
  await doc.send(new PutCommand({ TableName: table, Item: { PK: `RULESET#${rs.id}`, SK: 'ACTIVE', version: rs.version } }));
}

const isConditionalFailure = (e: unknown) => (e as Error).name === 'ConditionalCheckFailedException';

export async function seedCatalog(
  doc: DynamoDBDocumentClient,
  table: string,
  opts: { skus: number; prefix: string; ruleSetId: string; categories?: string[] },
): Promise<{ created: number }> {
  const categories = opts.categories ?? ['coffee', 'tea', 'cocoa'];
  let created = 0;
  for (let i = 1; i <= opts.skus; i++) {
    const sku = `${opts.prefix}-${String(i).padStart(4, '0')}`;
    const cost = 400 + ((i * 37) % 600);
    const inputs: Array<[string, number]> = [
      ['COST', cost],
      ['COMPETITOR', cost + Math.floor((cost * 4) / 10)],
      ['INVENTORY', 50 + ((i * 13) % 100)],
    ];
    try {
      await doc.send(new PutCommand({
        TableName: table,
        Item: { PK: `SKU#${sku}`, SK: 'META', name: `Product ${i}`, category: categories[(i - 1) % categories.length], currency: 'EUR', ruleSetId: opts.ruleSetId },
        ConditionExpression: 'attribute_not_exists(PK)',
      }));
      created++;
    } catch (e) {
      if (!isConditionalFailure(e)) throw e;
    }
    for (const [source, value] of inputs) {
      try {
        await doc.send(new PutCommand({
          TableName: table,
          Item: { PK: `SKU#${sku}`, SK: `INPUT#${source}`, value, seq: 1, observedAt: new Date().toISOString() },
          ConditionExpression: 'attribute_not_exists(SK) OR #seq < :seq',
          ExpressionAttributeNames: { '#seq': 'seq' },
          ExpressionAttributeValues: { ':seq': 1 },
        }));
      } catch (e) {
        if (!isConditionalFailure(e)) throw e;
      }
    }
  }
  return { created };
}
