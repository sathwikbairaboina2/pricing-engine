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
Task 1: complete (pnpm --filter pricing-rules-core test -> 2 passed; lint+typecheck OK) | commit: "chore: scaffold pnpm workspace with core purity lint rule"
Task 2: complete (core vitest -> 28 passed) | commit: "feat(core): add integer money arithmetic with HALF_EVEN and HALF_UP rounding"
Task 3: complete (core vitest -> 40 passed; lint+typecheck clean) | commit: "feat(core): add rule-set JSON Schema and semantic validation with JSON pointers"
Task 4: complete (ending.test.ts passes within core vitest 68 passed total) | commit: "feat(core): snap prices to a configured ending inside an interval"
Task 5: complete (core vitest -> 68 passed (6 files); lint+typecheck clean) | commit: "feat(core): evaluate rules with band, step limit, ending and decision trace"
Task 6: complete (core vitest -> 73 passed (10 files, 10000 runs/property, 2.08s); lint+typecheck clean) | commit: "test(core): add fast-check properties for bounds, step limit, ending and determinism"
Task 7: complete (pack:check -> pack-check OK: 17 files, 7302 bytes; bench:core -> evaluate(): 1571376 calls/s, p50 0.5 us, p99 1.5 us) | commit: "build(core): make pricing-rules-core publish-ready and add evaluate micro-benchmark"
Task 8: complete (functions vitest -> 9 passed; lint+typecheck clean) | commit: "feat(functions): add key helpers, stream decoding, shared filters and table definition"
Task 9: complete (functions vitest -> 18 passed; lint+typecheck clean) | commit: "feat(functions): add recompute stream handler with per-SKU dedupe and batch item failures"
Ruling: bundle externals are @aws-sdk/client-*, lib-dynamodb, util-dynamodb only; credential-provider-node, @smithy/*, @aws-crypto/* are bundled - plan allowed bundling when unsure about runtime provision; publisher bundle is 961863 bytes (< 1 MB gate) - cost: larger publisher zip
Task 10: complete (functions test:int -> 11 passed (3 files); with DDB down: unit test 18 passed exit 0, test:int -> 'DynamoDB Local not reachable at http://127.0.0.1:5360. Start it with: docker compose up -d dynamodb') | commit: "feat(functions): add DynamoDB store with versioned transactional price writes"
Task 11: complete (functions vitest -> 27 passed (5 files); lint+typecheck clean) | commit: "feat(functions): add price publisher handler with SigV4 AppSync and local shim publishers"
Task 12: complete (functions vitest -> 31 passed; pnpm build -> bundled recompute: 310380 bytes, bundled publisher: 961863 bytes) | commit: "build(functions): bundle recompute and publisher Lambdas with esbuild"
Task 13: complete (api vitest -> 18 passed; lint+typecheck clean; AppSync lint proof: temporary for-loop in Query.price.js -> grep -c @aws-appsync/no-for = 1, reverted) | commit: "feat(api): add GraphQL schema and APPSYNC_JS resolvers with unit tests"
Task 14: complete (infra vitest -> 9 passed (3 files); lint+typecheck clean) | commit: "feat(infra): add CDK stack with streams, Lambdas, DLQs and AppSync API"
Task 15: complete (pnpm synth exit 0; 10 acknowledgements; infra vitest 10 passed (4 files); resources {DynamoDB::GlobalTable:1,SQS::Queue:2,Cognito::UserPool:1,IAM::Role:5,AppSync::GraphQLApi:1,AppSync::Resolver:5,Lambda::Function:3,Lambda::EventSourceMapping:2,Custom::LogRetention:1,...}) | commit: "feat(infra): gate synth with cdk-nag AwsSolutions and documented acknowledgements"
Ruling: shared /tmp/done.sh was overwritten by sibling builder sessions, so some commits in this repo (959903a, 9b7fde1, 15f4869, bc3560e) carry foreign subjects (feat: researcher subgraph etc.) and contain my files, and my Task 15 commit message landed in ../durable-multi-agent - history not rewritten (never amend) - commit subjects in the log for tasks 3-7 are unreliable; use the ledger lines. Foreign "uv run pytest" ledger lines were removed from this file. From here commits use explicit git commands, not /tmp scripts.
Task 16: complete (local vitest -> 11 passed (2 files); lint+typecheck clean) | commit: "feat(local): emulate event source mapping filters, retries, bisect and DLQ"
