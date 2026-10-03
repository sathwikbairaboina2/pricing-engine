# Ledger: pricing-engine v0.1 (2026-10-04)

Plan: `docs/superpowers/plans/2026-10-04-pricing-engine.md` (25 tasks)
Spec: `docs/superpowers/specs/2026-10-04-pricing-engine.md`
ADRs: `docs/adr/0001`-`0007`
Roles: Opus plans and reviews; the Sonnet builder implements. Local commits are authorized. Never push.
Format: `Task N: complete (<real outputs>) | commit: "<subject>"`, `Ruling: <what> - <why> - <cost>`, and at the end `DONE` or `BLOCKED: <reason>`.

## Planning (Opus, 2026-10-04)

These prototypes were run in the session scratchpad, not in this repo:

- **DynamoDB Local** (`amazon/dynamodb-local:latest`; its digest `sha256:ff89bd48...0dab` equals tag 3.3.1, checked with `docker buildx imagetools inspect`). The Streams API works with 1 shard. PutItem to stream record: p50 7.5 ms, max 13.5 ms over 50 writes. A conditional TransactWrite rejects stale and equal versions with `TransactionCanceledException` / `ConditionalCheckFailed`.
- **graphql-yoga 5.24.1 + graphql-ws 6.3.0**: a mutation-to-subscription message took 21.3 ms.
- **CDK**: `aws-cdk-lib 2.272.0` synth works, with the event source mapping filter, bisect, retries, the DLQ destination and an APPSYNC_JS resolver.
- **cdk-nag 3.0.2**: registered with `Validations.of(app).addPlugins`. `IAM4`/`IAM5` findings need the full finding id.
- **AppSync resolvers**: a resolver importing `@aws-appsync/utils` runs after an esbuild bundle that aliases the import to a util shim. `@aws-appsync/utils` is types-only at runtime.
- **ESLint**: `@aws-appsync/eslint-plugin 2.0.2` `configs.base` on ESLint 9.39.5 flags try, for, `++`, continue and regex literals.
- **ajv**: `import { Ajv2020 } from 'ajv/dist/2020.js'` passes tsc NodeNext and tsx.
- **Task 5**: all `evaluate()` expectations (12 cases and 4 override cases) were run against the plan's exact code, and they match.

Rulings:

- Ruling: no LocalStack; the local pipeline is DynamoDB Local + stream runner + GraphQL shim (ADR 0001) - no LocalStack token, and AppSync is Ultimate-only on LocalStack - the headline is local-only, not AWS.
- Ruling: ceiling uses `factorBps` instead of `factor: 3.0` (ADR 0002) - no floats in rule sets - none.
- Ruling: rules start from a fresh base price, and precedence is band > step > ending (ADR 0003) - avoids compounding and conflicting limits - "momentum" pricing is dropped.
- Ruling: the concurrency token is (inputsVersion, ruleSetVersion), and history lives under `PK = HIST#<sku>` (ADR 0004, spec §5) - the per-SKU Query must not grow with history - none.
- Ruling: input items use `value`, not `valueMinor` - INVENTORY and DEMAND are not money - deviates from the design doc.
- Ruling: ESLint 9.39.5, not 10 - `@aws-appsync/eslint-plugin` peers stop at ESLint ^9 - none.
- Ruling: `setOverride`, OpenSearch, rule-set activation and the category subscription are v0.2 (spec §3) - keeps v0.1 to at most 25 tasks - documented as known limits.
- Ruling: there are 5 Review Focus items (plan header), and each is pinned to an owning task test.
