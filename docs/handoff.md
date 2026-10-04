# Handoff

## 2026-10-04, Claude (Sonnet builder), branch main

**What changed:** built v0.1 per `docs/superpowers/plans/2026-10-04-pricing-engine.md` (tasks 1 to 24): `pricing-rules-core` with property tests and a pack check, recompute and publisher handlers, DynamoDB store with versioned transactional writes, GraphQL schema and APPSYNC_JS resolvers, CDK stack with cdk-nag, local stream runner and GraphQL shim, CLI, latency benchmark, React grid, compose demo, CI, README and DEVDOCS draft.

**What is left:** v0.2 items (OpenSearch, rule-set editor, `setOverride`, category subscription, AWS deploy and AWS latency run). The UI was not visually checked. Re-run `pnpm bench` on a quiet machine before quoting the headline (it was measured under varying host load; see the ledger Rulings). Some early commit subjects in git history are wrong because a shared temp script was overwritten by another session; the ledger lines are authoritative.

**How to verify:** see the Task 25 gate list in the plan: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm synth`, `pnpm --filter pricing-rules-core pack:check`, `docker compose up -d dynamodb && pnpm test:int`, `pnpm bench`, `node scripts/check-readme-headline.mjs`, actionlint, and the compose smoke.

## 2026-10-04, Claude (Sonnet builder, review fixes), branch main

**What changed:** fixed the review findings: `ttl` now only on `HIST#` items; ADR 0007 and the spec amended to the shipped 5/s benchmark with the 20/s and 50/s runs in `bench/results/2026-10-04T00-2*.json`; the bench splits `superseded` from `lost` and records the achieved rate; the web grid keeps polling and subscribes to new SKUs (`packages/web/src/feed.ts`); `requireDynamoLocal` retries, compose has a DynamoDB healthcheck, CI waits for port 5360; the publisher stops a SKU group after its first failure; `pnpm local override` added; known limits documented. README headline now comes from the new `latest.json`.

**Git history labels:** some commit subjects do not match their content (a shared `/tmp/done.sh` was overwritten by sibling sessions). Content to task: `959903a` is Task 3 (rule-set schema and validation), `9b7fde1` is Task 7 (core pack check, bench, README), `15f4869` and `bc3560e` carry only foreign ledger lines (Task 11 and 14 lines from a Python project, not this repo's tasks). The ledger's own Task lines are authoritative. Sibling repo `durable-multi-agent` has `81ba3fd` (subject from this repo, content from that one) and `9ee234b` (a stray "task 15" ledger line); its owner should be told. History was not rewritten.

**How to verify:** same gates as above. Open http://127.0.0.1:5362 during `docker compose up -d --build` and watch prices flash.
