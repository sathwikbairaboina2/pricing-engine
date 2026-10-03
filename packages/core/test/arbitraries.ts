import fc from 'fast-check';
import type { Condition, EvaluateRequest, InputSource, Inputs, Override, Rule, RuleSet } from '../src/types.js';

export const NUM_RUNS = Number(process.env['FC_NUM_RUNS'] ?? 10000);

function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

const source = fc.constantFrom<InputSource>('COST', 'COMPETITOR', 'INVENTORY', 'DEMAND');
const moneySource = fc.constantFrom<'COST' | 'COMPETITOR'>('COST', 'COMPETITOR');

const condition: fc.Arbitrary<Condition> = fc.oneof(
  fc.record({ input: source, op: fc.constantFrom('exists' as const, 'missing' as const) }),
  fc.record({ input: source, op: fc.constantFrom('lt' as const, 'lte' as const, 'gt' as const, 'gte' as const, 'eq' as const), value: fc.integer({ min: -100, max: 1000 }) }),
);
const action = fc.oneof(
  fc.record({ op: fc.constant('setTo' as const), input: moneySource, offsetMinor: fc.integer({ min: -500, max: 500 }) }),
  fc.record({ op: fc.constant('adjustBps' as const), bps: fc.integer({ min: -10000, max: 20000 }) }),
);

export function arbRuleSet(): fc.Arbitrary<RuleSet> {
  return fc
    .record({
      floorBps: fc.integer({ min: 0, max: 5000 }),
      extra: fc.integer({ min: 0, max: 40000 }),
      defaultMarkupBps: fc.integer({ min: 0, max: 10000 }),
      maxStepBps: fc.option(fc.integer({ min: 1, max: 10000 }), { nil: undefined }),
      mode: fc.constantFrom('HALF_EVEN' as const, 'HALF_UP' as const),
      endingMinor: fc.option(fc.integer({ min: 0, max: 99 }), { nil: undefined }),
      parts: fc.array(fc.record({ when: condition, then: action }), { minLength: 0, maxLength: 5 }),
    })
    .map((r): RuleSet => {
      const rules: Rule[] = r.parts.map((p, i) => ({ id: `r${i}`, when: p.when, then: p.then }));
      return compact({
        id: 'gen',
        version: 1,
        currency: 'EUR',
        defaultMarkupBps: r.defaultMarkupBps,
        floor: { type: 'costPlusBps' as const, bps: r.floorBps },
        ceiling: { type: 'multipleOfCost' as const, factorBps: 10000 + r.floorBps + r.extra },
        rounding: compact({ mode: r.mode, endingMinor: r.endingMinor }),
        maxStepBps: r.maxStepBps,
        rules,
      });
    });
}

const optional = <T>(a: fc.Arbitrary<T>, freq = 3) => fc.option(a, { nil: undefined, freq });

export function arbRequest(): fc.Arbitrary<EvaluateRequest> {
  const seq = fc.integer({ min: 0, max: 1000 });
  const iv = (v: fc.Arbitrary<number>) => fc.record({ value: v, seq });
  return fc
    .record({
      cost: fc.option(iv(fc.integer({ min: 1, max: 1_000_000_000 })), { nil: undefined, freq: 20 }),
      competitor: optional(iv(fc.integer({ min: 0, max: 2_000_000_000 }))),
      inventory: optional(iv(fc.integer({ min: -1000, max: 1000 }))),
      demand: optional(iv(fc.integer({ min: -1000, max: 1000 }))),
      previousPriceMinor: optional(fc.integer({ min: 1, max: 2_000_000_000 })),
      override: optional(
        fc.record({ priceMinor: fc.integer({ min: 0, max: 2_000_000_000 }), expiresAt: fc.integer({ min: 0, max: 2_000_000_000_000 }), seq: fc.integer({ min: 0, max: 10 }) }) as fc.Arbitrary<Override>,
      ),
      now: fc.integer({ min: 0, max: 2_000_000_000_000 }),
      ruleSet: arbRuleSet(),
    })
    .map((r): EvaluateRequest => {
      const inputs: Inputs = compact({ COST: r.cost, COMPETITOR: r.competitor, INVENTORY: r.inventory, DEMAND: r.demand });
      return compact({ inputs, override: r.override, previousPriceMinor: r.previousPriceMinor, ruleSet: r.ruleSet, now: r.now });
    });
}
