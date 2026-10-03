import { describe, expect, it } from 'vitest';
import { applyPrice, direction, formatMinor, type Price, type Rows } from '../src/priceStore.js';

const p = (priceMinor: number, inputsVersion: number, ruleSetVersion = 1): Price => ({
  sku: 'A1', priceMinor, currency: 'EUR', inputsVersion, ruleSetVersion, computedAt: '2026-10-04T00:00:00.000Z',
});

describe('applyPrice', () => {
  it('creates a row without a previous price', () => {
    const rows = applyPrice({}, p(1299, 2), 100);
    expect(rows['A1']).toMatchObject({ priceMinor: 1299 });
    expect(rows['A1']?.previousMinor).toBeUndefined();
  });
  it('records the previous price and change time for a newer version', () => {
    const rows = applyPrice(applyPrice({}, p(1299, 2), 100), p(1399, 3), 200);
    expect(rows['A1']).toMatchObject({ priceMinor: 1399, previousMinor: 1299, changedAt: 200 });
  });
  it('ignores an older version (Review Focus 5)', () => {
    const rows: Rows = applyPrice({}, p(1399, 5), 100);
    expect(applyPrice(rows, p(1299, 4), 200)).toBe(rows);
  });
  it('ignores a duplicate', () => {
    const rows: Rows = applyPrice({}, p(1399, 5), 100);
    expect(applyPrice(rows, p(1399, 5), 200)).toBe(rows);
  });
  it('applies a higher rule set version at the same inputs version', () => {
    const rows: Rows = applyPrice({}, p(1399, 5, 1), 100);
    expect(applyPrice(rows, p(1499, 5, 2), 200)['A1']).toMatchObject({ priceMinor: 1499 });
  });
});

describe('direction / formatMinor', () => {
  it('reports up, down and none', () => {
    const base = p(1299, 2);
    expect(direction({ ...base, previousMinor: 1000 })).toBe('up');
    expect(direction({ ...base, previousMinor: 1500 })).toBe('down');
    expect(direction({ ...base })).toBe('none');
    expect(direction({ ...base, previousMinor: 1299 })).toBe('none');
  });
  it('formats minor units', () => { expect(formatMinor(1299, 'EUR')).toContain('12.99'); });
});
