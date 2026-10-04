import { describe, expect, it } from 'vitest';
import { historyItem, priceItem } from '../src/ddb-store.js';
import type { PriceWrite } from '../src/store.js';

const w = {
  sku: 'A1',
  meta: { name: 'A1', category: 'tools', currency: 'EUR', ruleSetId: 'default' },
  ruleSetId: 'default',
  decision: { kind: 'PRICE', priceMinor: 1299, inputsVersion: 3, ruleSetVersion: 1, band: { floor: 1000, ceiling: 3000 }, trace: [] },
  computedAt: '2026-10-04T00:00:00.000Z',
  ttlEpochSeconds: 1_800_000_000,
} as unknown as PriceWrite;

describe('ttl placement', () => {
  it('PRICE#CURRENT has no ttl', () => {
    expect('ttl' in priceItem(w)).toBe(false);
  });
  it('history items carry the ttl', () => {
    expect(historyItem(w)['ttl']).toBe(1_800_000_000);
  });
});
