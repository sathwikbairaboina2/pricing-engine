import fc from 'fast-check';
import { describe, it } from 'vitest';
import { evaluate } from '../src/evaluate.js';
import { validateRuleSet } from '../src/validate.js';
import { arbRequest, arbRuleSet, NUM_RUNS } from './arbitraries.js';

describe('properties: bounds', () => {
  it('generated rule sets are valid', () => {
    fc.assert(fc.property(arbRuleSet(), (rs) => validateRuleSet(rs).ok === true), { numRuns: 1000 });
  });
  it('every PRICE lies inside its band and is a safe integer', () => {
    fc.assert(
      fc.property(arbRequest(), (req) => {
        const d = evaluate(req);
        if (d.kind !== 'PRICE') return true;
        return d.band.floor <= d.band.ceiling && d.band.floor <= d.priceMinor && d.priceMinor <= d.band.ceiling && Number.isSafeInteger(d.priceMinor);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
