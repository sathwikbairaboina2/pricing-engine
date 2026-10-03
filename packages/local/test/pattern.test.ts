import { describe, expect, it } from 'vitest';
import { PUBLISHER_FILTERS, RECOMPUTE_FILTERS } from '@pricing-engine/functions';
import { matchesAny, matchesPattern } from '../src/pattern.js';

const rec = (sk: string, eventName = 'MODIFY', pk = 'SKU#A1') => ({ eventName, dynamodb: { Keys: { PK: { S: pk }, SK: { S: sk } } } });

describe('filter matcher', () => {
  it('routes an INPUT#COST record to recompute only', () => {
    expect(matchesAny(rec('INPUT#COST'), RECOMPUTE_FILTERS)).toBe(true);
    expect(matchesAny(rec('INPUT#COST'), PUBLISHER_FILTERS)).toBe(false);
  });
  it('routes OVERRIDE to recompute', () => { expect(matchesAny(rec('OVERRIDE'), RECOMPUTE_FILTERS)).toBe(true); });
  it('routes META to neither', () => {
    expect(matchesAny(rec('META'), RECOMPUTE_FILTERS)).toBe(false);
    expect(matchesAny(rec('META'), PUBLISHER_FILTERS)).toBe(false);
  });
  it('routes PRICE#CURRENT MODIFY and INSERT to the publisher, not REMOVE', () => {
    expect(matchesAny(rec('PRICE#CURRENT', 'MODIFY'), PUBLISHER_FILTERS)).toBe(true);
    expect(matchesAny(rec('PRICE#CURRENT', 'INSERT'), PUBLISHER_FILTERS)).toBe(true);
    expect(matchesAny(rec('PRICE#CURRENT', 'REMOVE'), PUBLISHER_FILTERS)).toBe(false);
  });
  it('routes history items to neither', () => {
    const h = rec('v1#r1', 'INSERT', 'HIST#A1');
    expect(matchesAny(h, RECOMPUTE_FILTERS)).toBe(false);
    expect(matchesAny(h, PUBLISHER_FILTERS)).toBe(false);
  });
  it('throws on an unsupported operator', () => {
    expect(() => matchesPattern(rec('INPUT#COST'), { dynamodb: { Keys: { SK: { S: [{ numeric: ['>', 1] }] } } } })).toThrow(/unsupported filter operator: numeric/);
  });
});
