import { describe, expect, it } from 'vitest';
import { histSk, inputSk, InvalidSkuError, skuPk } from '../src/keys.js';

describe('keys', () => {
  it('builds SKU partition keys', () => { expect(skuPk('A-1')).toBe('SKU#A-1'); });
  it.each(['a#b', 'a b', '', 'x'.repeat(65)])('rejects hostile sku %j', (sku) => {
    expect(() => skuPk(sku)).toThrow(InvalidSkuError);
  });
  it('builds history and input sort keys', () => {
    expect(histSk(10, 2)).toBe('v10#r2');
    expect(inputSk('COST')).toBe('INPUT#COST');
  });
});
