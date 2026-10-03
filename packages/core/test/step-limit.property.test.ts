import fc from 'fast-check';
import { describe, it } from 'vitest';
import { evaluate } from '../src/evaluate.js';
import { floorMulDiv } from '../src/money.js';
import { arbRequest, NUM_RUNS } from './arbitraries.js';

describe('properties: step limit', () => {
  it('a price never moves more than maxStepBps when the step band meets the price band', () => {
    fc.assert(
      fc.property(arbRequest(), (req) => {
        const prev = req.previousPriceMinor;
        const maxStep = req.ruleSet.maxStepBps;
        const overrideActive = req.override !== undefined && req.override.expiresAt > req.now;
        if (prev === undefined || maxStep === undefined || overrideActive) return true;
        const d = evaluate(req);
        if (d.kind !== 'PRICE') return true;
        const step = floorMulDiv(prev, maxStep, 10000);
        if (Math.max(d.band.floor, prev - step) <= Math.min(d.band.ceiling, prev + step)) {
          return Math.abs(d.priceMinor - prev) <= step;
        }
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
