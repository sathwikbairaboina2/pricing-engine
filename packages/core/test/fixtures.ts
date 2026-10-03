import type { RuleSet } from '../src/types.js';

export const defaultRuleSet: RuleSet = {
  id: 'default', version: 1, currency: 'EUR', defaultMarkupBps: 2500,
  floor: { type: 'costPlusBps', bps: 500 }, ceiling: { type: 'multipleOfCost', factorBps: 30000 },
  rounding: { mode: 'HALF_EVEN', endingMinor: 99 }, maxStepBps: 1500,
  rules: [
    { id: 'match-competitor', when: { input: 'COMPETITOR', op: 'exists' }, then: { op: 'setTo', input: 'COMPETITOR', offsetMinor: -10 } },
    { id: 'low-stock-surge', when: { input: 'INVENTORY', op: 'lt', value: 20 }, then: { op: 'adjustBps', bps: 800 } },
  ],
};
