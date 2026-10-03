import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import type { DynamoDBRecord } from 'aws-lambda';
import { SKU_RE } from './keys.js';

export function recordKeys(r: DynamoDBRecord): { PK: string; SK: string } | undefined {
  const k = r.dynamodb?.Keys;
  const PK = k?.['PK']?.S;
  const SK = k?.['SK']?.S;
  if (PK === undefined || SK === undefined) return undefined;
  return { PK, SK };
}

export function recordSku(r: DynamoDBRecord): string | undefined {
  const keys = recordKeys(r);
  if (!keys || !keys.PK.startsWith('SKU#')) return undefined;
  const sku = keys.PK.slice(4);
  return SKU_RE.test(sku) ? sku : undefined;
}

function image<T>(raw: unknown): T | undefined {
  if (!raw) return undefined;
  return unmarshall(raw as Record<string, AttributeValue>) as T;
}

export function newImage<T = Record<string, unknown>>(r: DynamoDBRecord): T | undefined {
  return image<T>(r.dynamodb?.NewImage);
}
export function oldImage<T = Record<string, unknown>>(r: DynamoDBRecord): T | undefined {
  return image<T>(r.dynamodb?.OldImage);
}
