import { describe, expect, it } from 'vitest';
import { assertMinor, ceilMulDiv, floorMulDiv, mulDivRound, saturate, MAX_MINOR } from '../src/money.js';

describe('mulDivRound', () => {
  const cases: Array<[number, number, number, 'HALF_EVEN' | 'HALF_UP', number]> = [
    [5, 1, 2, 'HALF_EVEN', 2], [7, 1, 2, 'HALF_EVEN', 4], [5, 1, 2, 'HALF_UP', 3], [7, 1, 2, 'HALF_UP', 4],
    [-5, 1, 2, 'HALF_EVEN', -2], [-5, 1, 2, 'HALF_UP', -3], [-7, 1, 2, 'HALF_EVEN', -4],
    [1, 1, 3, 'HALF_EVEN', 0], [2, 1, 3, 'HALF_EVEN', 1],
    [1000, 800, 10000, 'HALF_EVEN', 80], [1005, 500, 10000, 'HALF_EVEN', 50],
    [1010, 500, 10000, 'HALF_EVEN', 50], [1010, 500, 10000, 'HALF_UP', 51], [1030, 500, 10000, 'HALF_EVEN', 52],
    [1999, -1500, 10000, 'HALF_EVEN', -300], [MAX_MINOR, 100000, 10000, 'HALF_EVEN', 10 * MAX_MINOR],
  ];
  it.each(cases)('%i * %i / %i (%s) = %i', (a, b, d, mode, want) => {
    expect(mulDivRound(a, b, d, mode)).toBe(want);
  });
  it('throws when the result is not a safe integer', () => {
    expect(() => mulDivRound(Number.MAX_SAFE_INTEGER, 2, 1, 'HALF_EVEN')).toThrow(RangeError);
  });
  it('throws on a non-positive divisor or non-integer operand', () => {
    expect(() => mulDivRound(1, 1, 0, 'HALF_EVEN')).toThrow(RangeError);
    expect(() => mulDivRound(1.5, 1, 1, 'HALF_EVEN')).toThrow(RangeError);
  });
});

describe('ceilMulDiv / floorMulDiv', () => {
  it.each([[1, 10500, 10000, 2], [1000, 10500, 10000, 1050], [999, 10001, 10000, 1000]])('ceil %i*%i/%i = %i', (a, b, d, w) => expect(ceilMulDiv(a, b, d)).toBe(w));
  it.each([[1, 10600, 10000, 1], [999, 30000, 10000, 2997], [1, 9999, 10000, 0]])('floor %i*%i/%i = %i', (a, b, d, w) => expect(floorMulDiv(a, b, d)).toBe(w));
});

describe('assertMinor / saturate', () => {
  it('accepts 0 and MAX_MINOR, rejects negatives, fractions and above max', () => {
    expect(() => assertMinor(0, 'x')).not.toThrow();
    expect(() => assertMinor(MAX_MINOR, 'x')).not.toThrow();
    for (const bad of [-1, 1.5, MAX_MINOR + 1, Number.NaN]) expect(() => assertMinor(bad, 'x')).toThrow(RangeError);
  });
  it('saturates', () => { expect(saturate(-5, 0, 10)).toBe(0); expect(saturate(50, 0, 10)).toBe(10); expect(saturate(5, 0, 10)).toBe(5); });
});
