import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/evaluate.js';
import { defaultRuleSet } from './fixtures.js';

const now = 1_700_000_000_000;
const inputs = { COST: { value: 1000, seq: 1 }, COMPETITOR: { value: 1500, seq: 1 } };

describe('override', () => {
  it('applies an active override, snapped, with the seq in inputsVersion', () => {
    const d = evaluate({ inputs, override: { priceMinor: 2000, expiresAt: now + 1, seq: 4 }, ruleSet: defaultRuleSet, now });
    expect(d).toMatchObject({ kind: 'PRICE', priceMinor: 1999, inputsVersion: 6 });
    expect(d.trace.map((t) => t.ruleId)).toContain('override');
  });
  it.each([now, now - 1])('has no effect when expired (expiresAt %i)', (expiresAt) => {
    const d = evaluate({ inputs, override: { priceMinor: 2000, expiresAt, seq: 4 }, ruleSet: defaultRuleSet, now });
    expect(d).toMatchObject({ kind: 'PRICE', priceMinor: 1499, inputsVersion: 6 });
  });
  it('bypasses the step limit and clamps to the ceiling', () => {
    const d = evaluate({ inputs, override: { priceMinor: 99999, expiresAt: now + 1, seq: 4 }, previousPriceMinor: 1500, ruleSet: defaultRuleSet, now });
    expect(d).toMatchObject({ kind: 'PRICE', priceMinor: 2999 });
  });
  it('clamps a tiny override up to the floor', () => {
    const d = evaluate({ inputs, override: { priceMinor: 10, expiresAt: now + 1, seq: 4 }, ruleSet: defaultRuleSet, now });
    expect(d).toMatchObject({ kind: 'PRICE', priceMinor: 1099 });
  });
});
