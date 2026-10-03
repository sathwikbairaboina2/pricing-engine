/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { AppSyncError } from '../src/appsync-utils-shim.js';
import * as price from '../resolvers/Query.price.js';
import * as decision from '../resolvers/Query.decision.js';
import * as byCategory from '../resolvers/Query.pricesByCategory.js';
import * as putInput from '../resolvers/Mutation.putInput.js';
import * as publishPrice from '../resolvers/Mutation.publishPrice.js';

const item = {
  PK: 'SKU#A1', SK: 'PRICE#CURRENT', sku: 'A1', category: 'tools', currency: 'EUR', priceMinor: 1299, inputsVersion: 3, ruleSetVersion: 1,
  computedAt: '2026-10-04T00:00:00.000Z', GSI1PK: 'CATEGORY#tools', GSI1SK: 'SKU#A1', floorMinor: 1, ceilingMinor: 2,
  decisionTrace: [{ ruleId: 'base', beforeMinor: 1000, afterMinor: 1250 }],
};
const six = ['computedAt', 'currency', 'inputsVersion', 'priceMinor', 'ruleSetVersion', 'sku'];
const put = (args: any) => (putInput as any).request({ args });

function badRequest(fn: () => unknown) {
  try { fn(); } catch (e) { expect(e).toBeInstanceOf(AppSyncError); expect((e as AppSyncError).type).toBe('BadRequest'); return; }
  expect.unreachable('should have thrown');
}

describe('Mutation.putInput', () => {
  it('builds the exact key and seq condition', () => {
    const r = put({ sku: 'A1', source: 'COST', value: 1000, seq: 3 });
    expect(JSON.stringify(r.key)).toBe('{"PK":{"S":"SKU#A1"},"SK":{"S":"INPUT#COST"}}');
    expect(r.condition.expressionValues[':seq']).toEqual({ N: '3' });
    expect(r.condition.expression).toBe('attribute_not_exists(SK) OR #seq < :seq');
  });
  it.each(['a#b', '', 'x'.repeat(65), 'a b'])('rejects hostile sku %j before touching DynamoDB', (sku) => {
    badRequest(() => put({ sku, source: 'COST', value: 1, seq: 1 }));
  });
  it('rejects seq 0', () => { badRequest(() => put({ sku: 'A1', source: 'COST', value: 1, seq: 0 })); });
  it('maps a conditional failure to false (non-increasing seq)', () => {
    expect((putInput as any).response({ error: { type: 'DynamoDB:ConditionalCheckFailedException', message: 'x' } })).toBe(false);
  });
  it('returns true on success', () => { expect((putInput as any).response({})).toBe(true); });
  it('propagates other errors', () => {
    expect(() => (putInput as any).response({ error: { type: 'DynamoDB:ProvisionedThroughputExceededException', message: 'slow' } })).toThrow('slow');
  });
});

describe('queries', () => {
  it('price.response maps null and exactly six fields', () => {
    expect((price as any).response({ result: undefined })).toBeNull();
    const out = (price as any).response({ result: item });
    expect(Object.keys(out).sort()).toEqual(six);
  });
  it('price.request rejects a hostile sku', () => { badRequest(() => (price as any).request({ args: { sku: 'a#b' } })); });
  it('decision.response maps the trace', () => {
    const out = (decision as any).response({ result: item });
    expect(Object.keys(out.price).sort()).toEqual(six);
    expect(out.trace).toEqual(item.decisionTrace);
    expect((decision as any).response({ result: { ...item, decisionTrace: undefined } }).trace).toEqual([]);
  });
  it('pricesByCategory validates and defaults the limit', () => {
    badRequest(() => (byCategory as any).request({ args: { category: 'tools', limit: 101 } }));
    expect((byCategory as any).request({ args: { category: 'tools' } }).limit).toBe(50);
    const out = (byCategory as any).response({ result: { items: [item] } });
    expect(Object.keys(out[0]).sort()).toEqual(six);
  });
  it('publishPrice round-trips its input', () => {
    const input = { sku: 'A1', priceMinor: 1 };
    expect((publishPrice as any).request({ args: { input } }).payload).toEqual(input);
    expect((publishPrice as any).response({ result: input })).toEqual(input);
  });
});
