import { marshall } from '@aws-sdk/util-dynamodb';
import type { DynamoDBRecord } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { newImage, oldImage, recordSku } from '../src/stream.js';

const rec = (pk: string, sk: string, eventName: 'INSERT' | 'MODIFY' = 'MODIFY', image?: Record<string, unknown>): DynamoDBRecord => ({
  eventName,
  dynamodb: {
    Keys: marshall({ PK: pk, SK: sk }) as never,
    ...(image ? { NewImage: marshall(image) as never } : {}),
    SequenceNumber: '1',
  },
});

describe('stream helpers', () => {
  it('extracts the sku only from SKU# partitions', () => {
    expect(recordSku(rec('SKU#A1', 'INPUT#COST'))).toBe('A1');
    expect(recordSku(rec('RULESET#x', 'ACTIVE'))).toBeUndefined();
    expect(recordSku(rec('HIST#A1', 'v1#r1'))).toBeUndefined();
    expect(recordSku(rec('SKU#a#b', 'INPUT#COST'))).toBeUndefined();
  });
  it('unmarshalls numbers to JS numbers', () => {
    const r = rec('SKU#A1', 'INPUT#COST', 'INSERT', { value: 1000, seq: 3 });
    expect(newImage<{ value: number }>(r)?.value).toBe(1000);
  });
  it('has no old image on INSERT', () => {
    expect(oldImage(rec('SKU#A1', 'INPUT#COST', 'INSERT', { value: 1 }))).toBeUndefined();
  });
});
