# pricing-rules-core

A deterministic pricing rule engine. Integer money only, JSON Schema rule sets, and a full decision trace for every price.

It is pure: no I/O, no clock, no randomness. The caller passes `now`. The same request always gives the same decision.

## Install

```
npm i pricing-rules-core
```

Not yet published. In this monorepo it is consumed from source.

## Usage

```ts
import { evaluate, validateRuleSet } from 'pricing-rules-core';

const checked = validateRuleSet(ruleSetJson);
if (!checked.ok) throw new Error(checked.errors.map((e) => `${e.pointer} ${e.message}`).join('\n'));

const decision = evaluate({
  inputs: { COST: { value: 1000, seq: 1 }, COMPETITOR: { value: 1500, seq: 2 } },
  previousPriceMinor: 1450,
  ruleSet: checked.ruleSet,
  now: Date.now(),
});
if (decision.kind === 'PRICE') console.log(decision.priceMinor, decision.trace);
```

## Pipeline and precedence

Base price from cost and markup, then rules in order, then an active override, then the clamp to the allowed interval, then the price ending. The price band beats the step limit, which beats the price ending. See [ADR 0003](../../docs/adr/0003-evaluation-pipeline-and-precedence.md).

## Guarantees

| Guarantee | Property test |
| --- | --- |
| A price is always inside `[floor, ceiling]` and a safe integer | `test/bounds.property.test.ts` |
| A price never moves more than `maxStepBps` when the step band meets the price band | `test/step-limit.property.test.ts` |
| The configured ending is applied whenever one fits the allowed interval | `test/ending.property.test.ts` |
| Key order never changes the decision; repeated calls are identical | `test/determinism.property.test.ts` |

Each runs 10,000 cases by default (`FC_NUM_RUNS` overrides).

## Benchmark

Written by `pnpm bench:core` to `bench/results/core-latest.json`: see that file for the current numbers (calls per second, p50 and p99 per call).

## Limits

The engine accepts money and versions up to 1e12. The surrounding pricing-engine API uses GraphQL `Int` (32 bit, at most 2,147,483,647 minor units, about 21.4M EUR), so larger values are rejected before they reach the engine.
