import { describe, expect, it } from 'vitest';
import { snapToEnding } from '../src/ending.js';

describe('snapToEnding', () => {
  it.each([
    [1234, 0, 10000, 99, 1199], [1249, 0, 10000, 99, 1199], [1250, 0, 10000, 99, 1299], [1299, 0, 10000, 99, 1299],
    [1250, 1150, 1298, 99, 1199], [1250, 1200, 1400, 99, 1299], [50, 0, 1000, 99, 99], [1000, 1000, 1000, 0, 1000],
    [1234, 0, 10000, 0, 1200],
  ])('snap(%i, [%i,%i], .%i) = %i', (p, lo, hi, e, want) => expect(snapToEnding(p, lo, hi, e)).toBe(want));
  it('returns undefined when no candidate fits', () => {
    expect(snapToEnding(1250, 1200, 1298, 99)).toBeUndefined();
    expect(snapToEnding(1000, 1000, 1000, 99)).toBeUndefined();
  });
});
