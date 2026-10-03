import { marshall } from '@aws-sdk/util-dynamodb';
import type { DynamoDBRecord, DynamoDBStreamEvent } from 'aws-lambda';

type EventName = 'INSERT' | 'MODIFY' | 'REMOVE';

export function inputRecord(sku: string, source: string, seqNo: string, eventName: EventName = 'MODIFY'): DynamoDBRecord {
  return {
    eventName,
    dynamodb: {
      Keys: marshall({ PK: `SKU#${sku}`, SK: `INPUT#${source}` }) as never,
      NewImage: marshall({ PK: `SKU#${sku}`, SK: `INPUT#${source}`, value: 1, seq: 1 }) as never,
      SequenceNumber: seqNo,
    },
  };
}

export function priceRecord(sku: string, oldPrice: Record<string, unknown> | undefined, newPrice: Record<string, unknown>, seqNo: string, eventName?: EventName): DynamoDBRecord {
  const keys = { PK: `SKU#${sku}`, SK: 'PRICE#CURRENT' };
  return {
    eventName: eventName ?? (oldPrice ? 'MODIFY' : 'INSERT'),
    dynamodb: {
      Keys: marshall(keys) as never,
      NewImage: marshall({ ...keys, sku, ...newPrice }) as never,
      ...(oldPrice ? { OldImage: marshall({ ...keys, sku, ...oldPrice }) as never } : {}),
      SequenceNumber: seqNo,
    },
  };
}

export function rawRecord(pk: string, sk: string, seqNo: string): DynamoDBRecord {
  return { eventName: 'MODIFY', dynamodb: { Keys: marshall({ PK: pk, SK: sk }) as never, SequenceNumber: seqNo } };
}

export const event = (...records: DynamoDBRecord[]): DynamoDBStreamEvent => ({ Records: records });
