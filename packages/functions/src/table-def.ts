import {
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
  UpdateTimeToLiveCommand,
  type CreateTableCommandInput,
  type DynamoDBClient,
} from '@aws-sdk/client-dynamodb';

export const GSI1 = 'GSI1';

export function pricingTableInput(tableName: string): CreateTableCommandInput {
  return {
    TableName: tableName,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'GSI1PK', AttributeType: 'S' },
      { AttributeName: 'GSI1SK', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: GSI1,
        KeySchema: [
          { AttributeName: 'GSI1PK', KeyType: 'HASH' },
          { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    StreamSpecification: { StreamEnabled: true, StreamViewType: 'NEW_AND_OLD_IMAGES' },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function ensureTable(client: DynamoDBClient, tableName: string): Promise<{ streamArn: string }> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
  } catch (e) {
    if (!(e instanceof ResourceNotFoundException)) throw e;
    await client.send(new CreateTableCommand(pricingTableInput(tableName)));
  }
  const deadline = Date.now() + 30_000;
  for (;;) {
    const { Table } = await client.send(new DescribeTableCommand({ TableName: tableName }));
    if (Table?.TableStatus === 'ACTIVE' && Table.LatestStreamArn) {
      try {
        await client.send(new UpdateTimeToLiveCommand({ TableName: tableName, TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true } }));
      } catch {
        // DynamoDB Local may not support TTL updates; not required.
      }
      return { streamArn: Table.LatestStreamArn };
    }
    if (Date.now() > deadline) throw new Error(`table ${tableName} did not become ACTIVE within 30s`);
    await sleep(200);
  }
}
