import { describe, expect, it } from 'vitest';
import { benchValue, percentile, summarize } from '../src/bench/stats.js';

const hundred = Array.from({ length: 100 }, (_, i) => i + 1);

describe('percentile', () => {
  it('uses nearest rank', () => {
    expect(percentile(hundred, 50)).toBe(50);
    expect(percentile(hundred, 99)).toBe(99);
    expect(percentile(hundred, 100)).toBe(100);
    expect(percentile(hundred, 0)).toBe(1);
    expect(percentile([5], 99)).toBe(5);
  });
  it('throws on an empty sample or a bad p', () => {
    expect(() => percentile([], 50)).toThrow(RangeError);
    expect(() => percentile([1], 101)).toThrow(RangeError);
    expect(() => percentile([1], -1)).toThrow(RangeError);
  });
});

describe('summarize', () => {
  it('rounds to 0.1 ms', () => {
    const s = summarize([10.04, 10.06, 20.24]);
    expect(s.count).toBe(3);
    expect(s.max).toBe(20.2);
    expect(s.p50).toBe(10.1);
    expect(s.mean).toBe(13.4);
  });
});

describe('benchValue', () => {
  it('always changes and stays inside the band', () => {
    for (let n = 0; n <= 2000; n++) {
      expect(benchValue(n)).not.toBe(benchValue(n + 1));
      expect(benchValue(n)).toBeGreaterThanOrEqual(1100);
      expect(benchValue(n)).toBeLessThanOrEqual(1899);
    }
  });
});
