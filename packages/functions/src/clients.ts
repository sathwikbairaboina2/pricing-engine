import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBStreamsClient } from '@aws-sdk/client-dynamodb-streams';

export interface DynamoClients { ddb: DynamoDBClient; doc: DynamoDBDocumentClient; streams: DynamoDBStreamsClient }

export function createDynamoClients(opts: { endpoint?: string; region?: string } = {}): DynamoClients {
  const local = opts.endpoint
    ? { endpoint: opts.endpoint, region: opts.region ?? 'us-east-1', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } }
    : opts.region
      ? { region: opts.region }
      : {};
  const ddb = new DynamoDBClient(local);
  const doc = DynamoDBDocumentClient.from(ddb, { marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: false } });
  const streams = new DynamoDBStreamsClient(local);
  return { ddb, doc, streams };
}
