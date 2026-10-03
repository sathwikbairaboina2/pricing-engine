/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { parseRuleSet, validateRuleSet, InvalidRuleSetError } from '../src/validate.js';

const valid = {
  id: 'default', version: 1, currency: 'EUR', defaultMarkupBps: 2500,
  floor: { type: 'costPlusBps', bps: 500 }, ceiling: { type: 'multipleOfCost', factorBps: 30000 },
  rounding: { mode: 'HALF_EVEN', endingMinor: 99 }, maxStepBps: 1500,
  rules: [
    { id: 'match-competitor', when: { input: 'COMPETITOR', op: 'exists' }, then: { op: 'setTo', input: 'COMPETITOR', offsetMinor: -10 } },
    { id: 'low-stock-surge', when: { input: 'INVENTORY', op: 'lt', value: 20 }, then: { op: 'adjustBps', bps: 800 } },
  ],
};
const clone = () => structuredClone(valid) as any;
const pointers = (x: unknown) => { const r = validateRuleSet(x); return r.ok ? [] : r.errors.map((e) => e.pointer); };

describe('validateRuleSet', () => {
  it('accepts the spec example', () => { const r = validateRuleSet(valid); expect(r.ok).toBe(true); if (r.ok) expect(r.ruleSet).toEqual(valid); });
  it('rejects floats', () => { const x = clone(); x.defaultMarkupBps = 2.5; expect(pointers(x)).toContain('/defaultMarkupBps'); });
  it('rejects unknown keys', () => { const x = clone(); x.foo = 1; expect(validateRuleSet(x).ok).toBe(false); });
  it('requires value for comparisons', () => { const x = clone(); delete x.rules[1].when.value; expect(pointers(x).some((p) => p.startsWith('/rules/1/when'))).toBe(true); });
  it('rejects duplicate rule ids', () => {
    const x = clone(); x.rules[1].id = 'match-competitor';
    const r = validateRuleSet(x); expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContainEqual({ pointer: '/rules/1/id', message: 'duplicate rule id "match-competitor"' });
  });
  it('rejects a ceiling below the floor', () => {
    const x = clone(); x.ceiling.factorBps = 10400; const r = validateRuleSet(x); expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.find((e) => e.pointer === '/ceiling/factorBps')?.message).toContain('must be >= 10500');
  });
  it('rejects setTo on non-money inputs', () => { const x = clone(); x.rules[0].then = { op: 'setTo', input: 'INVENTORY', offsetMinor: 0 }; expect(pointers(x).some((p) => p.startsWith('/rules/0/then'))).toBe(true); });
  it.each([
    ['lowercase currency', (x: any) => { x.currency = 'eur'; }],
    ['51 rules', (x: any) => { x.rules = Array.from({ length: 51 }, (_, i) => ({ ...valid.rules[1], id: `r${i}` })); }],
    ['maxStepBps 0', (x: any) => { x.maxStepBps = 0; }],
    ['endingMinor 100', (x: any) => { x.rounding.endingMinor = 100; }],
  ])('rejects %s', (_n, mutate) => { const x = clone(); mutate(x); expect(validateRuleSet(x).ok).toBe(false); });
  it('parseRuleSet throws InvalidRuleSetError', () => {
    try { parseRuleSet({}); expect.unreachable(); } catch (e) { expect(e).toBeInstanceOf(InvalidRuleSetError); expect((e as InvalidRuleSetError).errors.length).toBeGreaterThan(0); }
  });
});
