# pricing-engine v0.1 spec (2026-10-04)

Planner: Claude Opus. Builder: Sonnet. Source design: `taskarinchu/docs/devdocs/pricing-engine.md` (read-only, outside this repo).
This spec narrows that design to what v0.1 ships and records where v0.1 deviates from it. Decisions are in `docs/adr/0001`-`0007`.

## 1. What v0.1 is

A price input changes in DynamoDB. A stream consumer runs a pure, deterministic rule engine and writes the new price with an optimistic-concurrency check. A second stream consumer publishes the price through a GraphQL mutation, and every subscribed client receives it over a GraphQL subscription.

Two targets share the same handler and resolver code:

- **AWS shape (synth only).** CDK v2 stack: DynamoDB table with stream, two Lambda functions with event source mappings, SQS DLQs, AppSync GraphQL API (Cognito default auth plus IAM) with APPSYNC_JS resolvers. Proven by CDK assertion tests and a cdk-nag `AwsSolutions` synth gate. Never deployed in v0.1 (no AWS account, no LocalStack token; AppSync is Ultimate-only on LocalStack anyway).
- **Local pipeline (runs for real).** DynamoDB Local 3.3.1 in Docker (its Streams API works; measured during planning), a local stream runner that emulates the Lambda event source mapping, and a GraphQL shim (graphql-yoga + graphql-ws) that executes the **same** APPSYNC_JS resolver files against DynamoDB Local. This is where the tests, the demo and the headline benchmark run. See ADR 0001.

## 2. The portfolio bar, and how v0.1 meets it

| Bar | v0.1 answer |
|---|---|
| 30-second wow | `docker compose up -d` then open `http://localhost:5362`: a live price grid that flashes as the simulator moves competitor prices. A terminal alternative, `pnpm watch`, prints live ticks. |
| Measured headline number | `pnpm bench` measures input `PutItem` to subscription message received, p50/p95/p99, at 5 updates/s over 100 SKUs for 60 s (default; `--rate` overrides, higher rates queue on DynamoDB Local, see ADR 0007), plus superseded and lost updates, the achieved send rate and invariant violations. The README's first line quotes `bench/results/latest.json`. Nothing is typed by hand. |
| Something installable | `packages/core` is the publish-ready npm package `pricing-rules-core` (pure TypeScript, zero AWS imports, JSON Schema for rule sets). `pnpm --filter pricing-rules-core pack` produces the tarball. Not published in v0.1 (no credentials; never push). |
| Honest ADRs | `docs/adr/0001`-`0007`, each with "what we gave up". |
| CI with tests | GitHub Actions: lint, typecheck, unit + property tests, cdk-nag synth, pack check, and an integration job that runs DynamoDB Local as a service container (no token needed). Linted locally with actionlint 1.7.12 in Docker. |

## 3. Scope

In v0.1:

- `pricing-rules-core`: integer money, rounding modes, rule-set JSON Schema + semantic validation, `evaluate()` with decision trace, overrides with injected clock, property tests.
- Recompute and publisher handlers with batch item failure reporting; DynamoDB store with conditional `TransactWriteItems`; AppSync SigV4 publisher (AWS) and shim publisher (local).
- GraphQL SDL + APPSYNC_JS resolvers: `price`, `decision`, `pricesByCategory`, `putInput`, `publishPrice` (`@aws_iam`), `onPriceChanged(sku)`.
- CDK stack + assertions + cdk-nag gate.
- Local stream runner, GraphQL shim, table/seed tooling, simulator, `watch`, latency benchmark, core micro-benchmark.
- React + Vite live price grid with decision trace panel.
- `docker-compose.yml` (all containers `pricing-engine-*`, host ports 5360-5362), CI workflow, README, DEVDOCS, handoff.

Deferred to v0.2 (documented as known limits): OpenSearch indexer and `searchProducts`; rule-set editor, `upsertRuleSet`/`activateRuleSet`/`previewRuleSet` and bulk reprice; `setOverride` mutation (overrides are in core and the recompute path, written by `pnpm local override` only; an override's expiry emits no stream event, so the price stays at the override value until an input of that SKU changes; deleting an `INPUT#` or `OVERRIDE` item lowers `inputsVersion` and makes later recomputes STALE until the sum climbs back); category subscription; real AWS deploy and the AWS latency run; AppSync Events comparison; Bedrock rule proposals.

## 4. Deviations from the design doc (each recorded in an ADR)

1. LocalStack is not used. DynamoDB Local + stream runner + GraphQL shim replace it (ADR 0001).
2. Ceiling is `{ "type": "multipleOfCost", "factorBps": 30000 }`, not `factor: 3.0`, so the rule set holds no floats (ADR 0002).
3. Rules start from a fresh **base price** (`cost + defaultMarkupBps`) on every evaluation, not from the current price. Starting from the current price would compound `adjustBps` on every recompute. The previous price is used only for the step limit (ADR 0003).
4. Precedence when limits conflict is fixed: band (floor/ceiling) > step limit > price ending. The step-limit property is conditional on the step band intersecting the price band (ADR 0003).
5. The concurrency token is the pair `(inputsVersion, ruleSetVersion)`, compared lexicographically, and `inputsVersion` includes the override `seq` (ADR 0004).
6. Input items store `value` (integer), not `valueMinor`, because INVENTORY and DEMAND are not money. COST and COMPETITOR values are minor units.
7. `putInput` returns `false` (not an error) when `seq` is not greater than the stored one.

## 5. Data model (DynamoDB table `Pricing`, PK/SK strings, on-demand, stream NEW_AND_OLD_IMAGES, TTL attribute `ttl`)

| PK | SK | Attributes |
|---|---|---|
| `SKU#<sku>` | `META` | `name`, `category`, `currency`, `ruleSetId` |
| `SKU#<sku>` | `INPUT#<source>` | `value` (int), `seq` (int, strictly increasing per source), `observedAt` (ISO) |
| `SKU#<sku>` | `OVERRIDE` | `priceMinor`, `expiresAt` (epoch ms), `reason`, `actor`, `seq` |
| `SKU#<sku>` | `PRICE#CURRENT` | `sku`, `category`, `priceMinor`, `currency`, `inputsVersion`, `ruleSetId`, `ruleSetVersion`, `floorMinor`, `ceilingMinor`, `decisionTrace` (list), `computedAt` (ISO), `GSI1PK = CATEGORY#<category>`, `GSI1SK = SKU#<sku>` |
| `HIST#<sku>` | `v<inputsVersion>#r<ruleSetVersion>` | same as current minus GSI keys, plus `ttl` (now + 30 days, epoch seconds). History lives under its own PK so the per-SKU Query never grows with history. |
| `RULESET#<id>` | `v<n>` | `ruleSet` (map, the validated JSON), `status` |
| `RULESET#<id>` | `ACTIVE` | `version` |

`source` is one of `COST`, `COMPETITOR`, `INVENTORY`, `DEMAND`. `sku` matches `^[A-Za-z0-9-]{1,64}$`.
`inputsVersion = sum(seq of every INPUT# item) + (OVERRIDE.seq or 0)`. Because every `seq` only grows, two states with equal sums have equal seqs.
GSI1 projects ALL, keys `GSI1PK`/`GSI1SK`.

## 6. Rule set format (`packages/core/src/ruleset-schema.ts` exports the JSON Schema object, draft 2020-12, validated with ajv `Ajv2020`)

```json
{
  "id": "default",
  "version": 1,
  "currency": "EUR",
  "defaultMarkupBps": 2500,
  "floor": { "type": "costPlusBps", "bps": 500 },
  "ceiling": { "type": "multipleOfCost", "factorBps": 30000 },
  "rounding": { "mode": "HALF_EVEN", "endingMinor": 99 },
  "maxStepBps": 1500,
  "rules": [
    { "id": "match-competitor", "when": { "input": "COMPETITOR", "op": "exists" },
      "then": { "op": "setTo", "input": "COMPETITOR", "offsetMinor": -10 } },
    { "id": "low-stock-surge", "when": { "input": "INVENTORY", "op": "lt", "value": 20 },
      "then": { "op": "adjustBps", "bps": 800 } }
  ]
}
```

- `id` `^[a-z0-9-]{1,64}$`; `version` integer >= 1; `currency` `^[A-Z]{3}$`; all numbers are integers.
- `defaultMarkupBps` 0..100000; `floor.bps` 0..100000; `ceiling.factorBps` 10000..1000000; `maxStepBps` optional, 1..10000; `rounding.mode` `HALF_EVEN` or `HALF_UP`; `rounding.endingMinor` optional 0..99.
- `when.op`: `exists`, `missing`, `lt`, `lte`, `gt`, `gte`, `eq` (`value` required except for `exists`/`missing`). `then.op`: `setTo` (`input` COST or COMPETITOR, `offsetMinor` integer) or `adjustBps` (`bps` -10000..100000). At most 50 rules. `additionalProperties: false` everywhere.
- Semantic checks (`validateRuleSet`): rule ids unique; `ceiling.factorBps >= 10000 + floor.bps`; `setTo` input must not be INVENTORY or DEMAND. Errors are `{ pointer: string, message: string }` with JSON pointers (e.g. `/rules/1/id`).

## 7. `evaluate()` contract (pure; `packages/core/src/evaluate.ts`)

```ts
evaluate(req: {
  inputs: Partial<Record<InputSource, { value: number; seq: number }>>;
  override?: { priceMinor: number; expiresAt: number; seq: number };
  previousPriceMinor?: number;
  ruleSet: RuleSet;      // already validated
  now: number;           // epoch ms, injected
}): PriceDecision
// PriceDecision = { kind: 'PRICE', priceMinor, inputsVersion, ruleSetVersion, band: {floor, ceiling}, trace: TraceStep[] }
//               | { kind: 'NO_PRICE', reason: 'MISSING_COST' | 'NON_POSITIVE_COST', inputsVersion, ruleSetVersion, trace: [] }
// TraceStep = { ruleId: string; beforeMinor: number; afterMinor: number; note?: string }
```

Pipeline, in this exact order:

1. `cost = inputs.COST.value`; missing → `NO_PRICE/MISSING_COST`; `<= 0` → `NO_PRICE/NON_POSITIVE_COST`.
2. `floor = ceilDiv(cost * (10000 + floor.bps), 10000)`; `rawCeiling = floorDiv(cost * ceiling.factorBps, 10000)`; `ceiling = max(floor, rawCeiling)` (trace `band` note `"ceiling raised to floor"` when they differ).
3. `base = cost + mulDivRound(cost, defaultMarkupBps, 10000, mode)`; trace step `ruleId: "base"`.
4. Rules in array order. A rule fires when its `when` holds (`exists`/`missing` test presence; comparisons are false when the input is missing). `setTo`: price = input value + `offsetMinor` (skipped with note `"input missing"` if absent). `adjustBps`: price += `mulDivRound(price, bps, 10000, mode)`. Every fired rule adds a trace step. After each rule the intermediate price saturates to `[0, 1e12]` (no trace note), so chained rules can never overflow; the band clamp in step 7 still decides the final price.
5. Override: if `override` and `override.expiresAt > now`, price = `override.priceMinor`, trace `ruleId: "override"`. An active override bypasses the step limit, never the band.
6. Allowed interval: `band = [floor, ceiling]`. If `previousPriceMinor` is set, no active override, and `maxStepBps` is set: `step = floorDiv(prev * maxStepBps, 10000)`, `stepBand = [prev - step, prev + step]`; interval = `band ∩ stepBand` if non-empty, else `band` with trace note `"step limit skipped: outside band"`.
7. Clamp price into the interval (trace `ruleId: "clamp"` if it moved).
8. Ending: if `endingMinor` is set, candidates are integers `c` in the interval with `c mod 100 == endingMinor`. Pick the candidate nearest the clamped price; on a tie pick the lower one. If there is none, keep the clamped price and add trace note `"ending skipped: no candidate in interval"`.
9. `inputsVersion = sum(seq) + (override?.seq ?? 0)`.

All arithmetic is integer. Products go through `BigInt` in `mulDivRound`, `ceilDiv`, `floorDiv`; inputs must be safe integers in `[0, 1e12]` or `evaluate` throws `RangeError`. `core` must not use `Date`, `Math.random` or `parseFloat` (ESLint rule, proven by a test).

## 8. Invariants and their proving tests

| Invariant | Test |
|---|---|
| `band.floor <= price <= band.ceiling` for every PRICE decision | `packages/core/test/bounds.property.test.ts` (fast-check, 10,000 runs) |
| If prev set, no active override, and `stepBand ∩ band` non-empty, then `abs(price - prev) <= step` | `packages/core/test/step-limit.property.test.ts` |
| If `endingMinor` set and the interval holds a candidate, `price mod 100 == endingMinor` | `packages/core/test/ending.property.test.ts` |
| Same request (keys shuffled) gives deep-equal decisions | `packages/core/test/determinism.property.test.ts` |
| HALF_EVEN / HALF_UP behave per table | `packages/core/test/money.table.test.ts` |
| Expired override has no effect; active override clamped | `packages/core/test/override.test.ts` |
| `core` cannot use `Date`, `Math.random`, `parseFloat` | `packages/core/test/purity-lint.test.ts` |
| Stale computation never overwrites a newer price (both orders) | `packages/functions/test/concurrency.int.test.ts` (DynamoDB Local) |
| Replaying a batch 3x adds no history items and no publishes | `packages/functions/test/replay.int.test.ts` + publisher unit test |
| Resolvers use only APPSYNC_JS-supported syntax | `pnpm lint` with `@aws-appsync/eslint-plugin` base config on `packages/api/resolvers/**` |
| README headline equals `bench/results/latest.json` | `node scripts/check-readme-headline.mjs` (CI) |
| Publisher skips unchanged prices | `packages/functions/test/publisher.test.ts` |
| `publishPrice` is `@aws_iam` only; money fields are `Int` | `packages/api/test/schema.test.ts`, `infra/test/appsync.test.ts` |
| Every event source mapping has bisect, 3 retries, batch item failures, SQS on-failure, a filter | `infra/test/esm.test.ts` |
| No IAM action contains `*` | `infra/test/iam.test.ts` |
| Shim rejects `publishPrice` without the local publisher token | `packages/local/test/shim.int.test.ts` |
| Bench: 0 lost updates, 0 invariant violations in `HIST#<sku>` history | `pnpm bench` exits non-zero otherwise |

## 9. Ports, names and environment

- Host ports: 5360 DynamoDB Local, 5361 GraphQL shim (HTTP + WS at `/graphql`), 5362 web. 5363-5368 spare; 5369 is the planning prototype (stopped after planning).
- Compose project `pricing-engine`; containers `pricing-engine-dynamodb`, `pricing-engine-gql`, `pricing-engine-runner`, `pricing-engine-sim`, `pricing-engine-web`.
- Env: `PRICING_DDB_ENDPOINT` (default `http://127.0.0.1:5360`), `PRICING_TABLE` (default `Pricing`), `PRICING_GQL_URL` (default `http://127.0.0.1:5361/graphql`), `PRICING_PUBLISH_TOKEN` (default `local-dev-only`, dev emulation of `@aws_iam`, not a secret), `PRICING_INTEGRATION=1` enables integration tests (otherwise they skip cleanly), `FC_NUM_RUNS` (default 10000).
- No `.env` file is needed. No secrets exist in this project.

## 10. Headline metric

`pnpm bench` (needs DynamoDB Local on 5360) starts the runner and shim in-process, seeds 100 SKUs with the `bench` rule set (no step limit, no ending, `setTo COMPETITOR`), opens one graphql-ws client subscribed to all 100 SKUs, writes 5 COMPETITOR updates/s for 60 s (300 samples) with values that always change the price, and records `receivedAt - beforePutItem` per `(sku, inputsVersion)`. A missing version is `superseded` when a newer version of the same SKU arrived (the handler prices the latest state, ADR 0004) and `lost` otherwise; only lost, mismatches and violations fail the run. It writes `bench/results/<UTC timestamp>.json` and `bench/results/latest.json` with p50/p95/p99/max, sample count, superseded and lost counts, achieved rate, invariant violations, poll interval, machine (`os.cpus()[0].model`, `os.platform()`), Node and DynamoDB Local versions. Runner poll interval defaults to 250 ms when a shard is idle, matching Lambda's documented 4 polls per second per shard. The README labels the number as **local pipeline, not AWS**.

Secondary: `pnpm bench:core` measures `evaluate()` throughput and p99 per call over 100,000 calls.
