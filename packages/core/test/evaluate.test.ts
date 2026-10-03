import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/evaluate.js';
import type { RuleSet } from '../src/types.js';
import { defaultRuleSet } from './fixtures.js';

const now = 1_700_000_000_000;
const ids = (d: ReturnType<typeof evaluate>) => d.trace.map((t) => t.ruleId);

describe('evaluate', () => {
  it('returns NO_PRICE for missing COST', () => {
    const d = evaluate({ inputs: {}, ruleSet: defaultRuleSet, now });
    expect(d).toMatchObject({ kind: 'NO_PRICE', reason: 'MISSING_COST', trace: [] });
  });
  it('returns NO_PRICE for COST 0', () => {
    const d = evaluate({ inputs: { COST: { value: 0, seq: 1 } }, ruleSet: defaultRuleSet, now });
    expect(d).toMatchObject({ kind: 'NO_PRICE', reason: 'NON_POSITIVE_COST' });
  });
  it('prices from COST only with base markup and ending', () => {
    const d = evaluate({ inputs: { COST: { value: 1000, seq: 1 } }, ruleSet: defaultRuleSet, now });
    expect(d).toMatchObject({ kind: 'PRICE', priceMinor: 1299, inputsVersion: 1, ruleSetVersion: 1, band: { floor: 1050, ceiling: 3000 } });
    expect(ids(d)).toEqual(['base', 'ending']);
  });
  it('matches the competitor', () => {
    const d = evaluate({ inputs: { COST: { value: 1000, seq: 1 }, COMPETITOR: { value: 1500, seq: 2 } }, ruleSet: defaultRuleSet, now });
    expect(d).toMatchObject({ kind: 'PRICE', priceMinor: 1499, inputsVersion: 3 });
    expect(ids(d)).toEqual(['base', 'match-competitor', 'ending']);
  });
  it('applies the low-stock surge after the competitor match', () => {
    const d = evaluate({ inputs: { COST: { value: 1000, seq: 1 }, COMPETITOR: { value: 1500, seq: 2 }, INVENTORY: { value: 10, seq: 1 } }, ruleSet: defaultRuleSet, now });
    expect(d).toMatchObject({ kind: 'PRICE', priceMinor: 1599 });
  });
  it('clamps a competitor below the floor', () => {
    const d = evaluate({ inputs: { COST: { value: 1000, seq: 1 }, COMPETITOR: { value: 900, seq: 2 } }, ruleSet: defaultRuleSet, now });
    expect(d).toMatchObject({ kind: 'PRICE', priceMinor: 1099 });
    expect(ids(d)).toContain('clamp');
  });
  it('applies the step limit', () => {
    const d = evaluate({ inputs: { COST: { value: 1000, seq: 1 }, COMPETITOR: { value: 2500, seq: 2 } }, previousPriceMinor: 1500, ruleSet: defaultRuleSet, now });
    expect(d).toMatchObject({ kind: 'PRICE', priceMinor: 1699 });
  });
  it('skips the step limit when its band misses the price band', () => {
    const d = evaluate({ inputs: { COST: { value: 1000, seq: 1 } }, previousPriceMinor: 500, ruleSet: defaultRuleSet, now });
    expect(d).toMatchObject({ kind: 'PRICE', priceMinor: 1299 });
    expect(d.trace.find((t) => t.ruleId === 'step')?.note).toBe('step limit skipped: outside band');
  });
  it('skips the ending when no candidate fits', () => {
    const rs: RuleSet = { ...defaultRuleSet, floor: { type: 'costPlusBps', bps: 0 }, ceiling: { type: 'multipleOfCost', factorBps: 10050 } };
    const d = evaluate({ inputs: { COST: { value: 1000, seq: 1 } }, ruleSet: rs, now });
    expect(d).toMatchObject({ kind: 'PRICE', priceMinor: 1005 });
    expect(d.trace.find((t) => t.ruleId === 'ending')?.note).toBe('ending skipped: no candidate in interval');
  });
  it('raises the ceiling to the floor', () => {
    const rs: RuleSet = { ...defaultRuleSet, ceiling: { type: 'multipleOfCost', factorBps: 10500 } };
    const d = evaluate({ inputs: { COST: { value: 1, seq: 1 } }, ruleSet: rs, now });
    expect(d).toMatchObject({ kind: 'PRICE', priceMinor: 2, band: { floor: 2, ceiling: 2 } });
    expect(d.trace.find((t) => t.ruleId === 'band')?.note).toBe('ceiling raised to floor');
  });
  it('saturates instead of overflowing', () => {
    const rs: RuleSet = {
      ...defaultRuleSet, ceiling: { type: 'multipleOfCost', factorBps: 1000000 },
      rules: [0, 1, 2].map((i) => ({ id: `r${i}`, when: { input: 'COST' as const, op: 'exists' as const }, then: { op: 'adjustBps' as const, bps: 100000 } })),
    };
    const d = evaluate({ inputs: { COST: { value: 1e12, seq: 1 } }, ruleSet: rs, now });
    expect(d.kind).toBe('PRICE');
    if (d.kind === 'PRICE') {
      expect(d.priceMinor).toBe(1050000000099);
      expect(d.band.floor <= d.priceMinor && d.priceMinor <= d.band.ceiling).toBe(true);
    }
  });
  it('range-checks inputs', () => {
    expect(() => evaluate({ inputs: { COST: { value: 1.5, seq: 1 } }, ruleSet: defaultRuleSet, now })).toThrow(RangeError);
    expect(() => evaluate({ inputs: { COST: { value: 1e12 + 1, seq: 1 } }, ruleSet: defaultRuleSet, now })).toThrow(RangeError);
    expect(() => evaluate({ inputs: { COST: { value: 100, seq: -1 } }, ruleSet: defaultRuleSet, now })).toThrow(RangeError);
  });
  it('never emits a note key without a note', () => {
    const d = evaluate({ inputs: { COST: { value: 1000, seq: 1 } }, ruleSet: defaultRuleSet, now });
    for (const t of d.trace) expect('note' in t).toBe(false);
  });
});
