import fc from 'fast-check';
import { describe, it } from 'vitest';
import { evaluate } from '../src/evaluate.js';
import { floorMulDiv } from '../src/money.js';
import { arbRequest, NUM_RUNS } from './arbitraries.js';

describe('properties: ending', () => {
  it('the price carries the configured ending whenever one fits the allowed interval', () => {
    fc.assert(
      fc.property(arbRequest(), (req) => {
        const ending = req.ruleSet.rounding.endingMinor;
        if (ending === undefined) return true;
        const d = evaluate(req);
        if (d.kind !== 'PRICE') return true;
        let lo = d.band.floor;
        let hi = d.band.ceiling;
        const prev = req.previousPriceMinor;
        const maxStep = req.ruleSet.maxStepBps;
        const overrideActive = req.override !== undefined && req.override.expiresAt > req.now;
        if (prev !== undefined && maxStep !== undefined && !overrideActive) {
          const step = floorMulDiv(prev, maxStep, 10000);
          const sLo = Math.max(lo, prev - step);
          const sHi = Math.min(hi, prev + step);
          if (sLo <= sHi) { lo = sLo; hi = sHi; }
        }
        const first = lo + ((ending - (lo % 100) + 100) % 100);
        if (first <= hi) return d.priceMinor % 100 === ending;
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
