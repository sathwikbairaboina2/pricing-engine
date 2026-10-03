# Handoff

## 2026-10-04, Claude (Sonnet builder), branch main

**What changed:** built v0.1 per `docs/superpowers/plans/2026-10-04-pricing-engine.md` (tasks 1 to 24): `pricing-rules-core` with property tests and a pack check, recompute and publisher handlers, DynamoDB store with versioned transactional writes, GraphQL schema and APPSYNC_JS resolvers, CDK stack with cdk-nag, local stream runner and GraphQL shim, CLI, latency benchmark, React grid, compose demo, CI, README and DEVDOCS draft.

**What is left:** v0.2 items (OpenSearch, rule-set editor, `setOverride`, category subscription, AWS deploy and AWS latency run). The UI was not visually checked. Re-run `pnpm bench` on a quiet machine before quoting the headline (it was measured under varying host load; see the ledger Rulings). Some early commit subjects in git history are wrong because a shared temp script was overwritten by another session; the ledger lines are authoritative.

**How to verify:** see the Task 25 gate list in the plan: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm synth`, `pnpm --filter pricing-rules-core pack:check`, `docker compose up -d dynamodb && pnpm test:int`, `pnpm bench`, `node scripts/check-readme-headline.mjs`, actionlint, and the compose smoke.
