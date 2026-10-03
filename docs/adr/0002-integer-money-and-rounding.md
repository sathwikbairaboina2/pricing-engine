# ADR 0002: Integer minor units everywhere, BigInt for products, no floats in rule sets

Status: accepted, 2026-10-04

## Context

The design says no floating-point value is ever persisted or published, but its example rule set has `"ceiling": { "factor": 3.0 }`. Also, a price times a basis-point value can exceed 2^53 (1e12 minor units times 100,000 bps).

## Decision

- Money is an integer number of minor units: a `number` checked with `Number.isSafeInteger`, in the range 0..1e12. Inputs outside that range make `evaluate()` throw `RangeError`.
- Ratios are integer basis points. The ceiling is `{ "type": "multipleOfCost", "factorBps": 30000 }`.
- `mulDivRound(a, b, d, mode)`, `ceilDiv` and `floorDiv` compute in `BigInt` and convert back with a safe-integer check.
- There are two rounding modes, `HALF_EVEN` (the default, banker's rounding) and `HALF_UP`. A hand-written table test pins both.
- The floor rounds up (`ceilDiv`) and the ceiling rounds down (`floorDiv`). Rounding can then never push a price outside the intended band.
- GraphQL money fields are `Int`. GraphQL `Int` is 32-bit, so the API caps a price at 2,147,483,647 minor units, while `evaluate()` itself allows up to 1e12.
- An ESLint rule bans `Date`, `Math.random` and `parseFloat` inside `packages/core/src`, and a test proves the rule fires.

## Consequences

- What we gave up:
  - currencies with three minor digits (KWD, BHD);
  - prices above about 21 million in two-digit currencies through the GraphQL API.

  Multi-currency is a stretch goal.
- `BigInt` arithmetic is slower than plain numbers. `pnpm bench:core` measures the real cost.
