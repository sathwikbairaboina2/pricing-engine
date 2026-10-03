import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/evaluate.js';
import { arbRequest, NUM_RUNS } from './arbitraries.js';

function reverseKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(reverseKeys);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).reverse()) out[k] = reverseKeys((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

describe('properties: determinism', () => {
  it('key order does not change the decision, and repeated calls are byte-identical', () => {
    fc.assert(
      fc.property(arbRequest(), (req) => {
        const a = evaluate(req);
        expect(evaluate(reverseKeys(req) as typeof req)).toEqual(a);
        expect(JSON.stringify(evaluate(req))).toBe(JSON.stringify(a));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
