# pricing-engine v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v0.1 of a stream-driven, deterministic pricing engine. It has:

- a publishable pure rule engine (`pricing-rules-core`);
- DynamoDB-stream Lambda handlers with exactly-once-effect writes;
- an AppSync GraphQL API with live subscriptions, defined in CDK and gated by cdk-nag;
- a fully runnable local pipeline (DynamoDB Local + stream runner + GraphQL shim + React grid);
- a measured latency headline.

**Architecture:**

- A pnpm workspace, all ESM TypeScript:
  - `packages/core` (pure, no AWS);
  - `packages/functions` (recompute and publisher handlers, DynamoDB store, AppSync SigV4 publisher, esbuild bundles);
  - `packages/api` (SDL and APPSYNC_JS resolvers);
  - `packages/local` (stream runner that emulates the Lambda event source mapping, a GraphQL shim that runs the same resolver files, plus CLI, simulator and benchmark);
  - `packages/web` (React + Vite);
  - `infra` (CDK v2).
- The AWS shape is proven by synth plus assertions. The local pipeline runs for real on DynamoDB Local 3.3.1 in Docker.

**Tech Stack:**

- Runtime and tooling: Node 24, pnpm 9.12.0, TypeScript 5.9.3, Vitest 4.1.11, fast-check 4.10.2, ajv 8.20.0, tsx 4.23.15, esbuild 0.28.2.
- AWS: AWS SDK v3, aws-cdk-lib 2.272.0, aws-cdk 2.1144.0, cdk-nag 3.0.2.
- GraphQL: graphql 16.14.2, graphql-yoga 5.24.1, graphql-ws 6.3.0.
- Web: React 19.3.0, Vite 8.3.2.
- Lint: ESLint 9.39.5 with typescript-eslint 8.71.0 and @aws-appsync/eslint-plugin 2.0.2.
- Docker images: amazon/dynamodb-local:3.3.1, node:24.19.0-alpine, rhysd/actionlint:1.7.12.

**Spec:** `docs/superpowers/specs/2026-10-04-pricing-engine.md`. Decisions: `docs/adr/0001`–`0007`. Read the spec and ADRs 0001, 0003 and 0004 before Task 1. The spec wins over this plan if they disagree; record the conflict as a `Ruling:` line in the ledger.

**Ledger:** `.superpowers/sdd/2026-10-04-pricing-engine/progress.md`. After each task, append `Task N: complete (<real test counts / outputs>) | commit: "<subject>"`. Record every deviation as `Ruling: <what> - <why> - <cost>`.

**Status at plan time:** the repo has `git init -b main` and holds only the spec, the ADRs, this plan and the ledger. No code exists yet.

## Planning-time facts (measured 2026-10-04, keep them in mind)

- DynamoDB Local 3.3.1 supports Streams: `DescribeStream`, `GetShardIterator` and `GetRecords` work, and the stream has 1 shard. A `TransactWriteItems` with `attribute_not_exists(PK) OR inputsVersion < :v` throws `TransactionCanceledException` with `CancellationReasons[0].Code === "ConditionalCheckFailed"` for stale and equal versions.
- `@aws-appsync/utils` is **types only** at runtime (`util` is `undefined`). Resolvers run locally only through an esbuild bundle that aliases `@aws-appsync/utils` to `packages/api/src/appsync-utils-shim.js`, or through a Vitest `resolve.alias` to the same file.
- APPSYNC_JS forbids `try`, `for(;;)`, `while`, `continue`, `++`/`--`, regex literals, classes and `throw`. Use `util.matches(pattern, value)` instead of regex literals, and `util.error()` instead of `throw`. `@aws-appsync/eslint-plugin@2.0.2` `configs.base` flags these, and its peer range is ESLint `^8.57 || ^9`, so **ESLint 9.39.5, not 10**.
- cdk-nag 3.0.2 is registered with `Validations.of(app).addPlugins(new AwsSolutionsChecks(app))`. Synth then throws `Validation failed` and prints a huge minified stack, so always pipe synth output through `grep -E "ERROR|WARNING|Acknowledge with" | head -40`. Acknowledge with `Validations.of(scope).acknowledge({ id, reason })`. For `IAM4`/`IAM5` the id must be the **full finding id** printed after "Acknowledge with", e.g. `AwsSolutions::AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole]`. Fixes verified at planning: `Runtime.NODEJS_24_X` clears L1; `logConfig: { fieldLogLevel: FieldLogLevel.ERROR }` clears ASC3. AppSync `logConfig` creates a LogRetention helper whose `IAM5[Resource::*]` must be acknowledged.
- `import { Ajv2020 } from 'ajv/dist/2020.js'` passes both `tsc` (NodeNext) and `tsx`.
- graphql-yoga + graphql-ws: wire the WS server with `useServer({ execute: (a) => a.rootValue.execute(a), subscribe: (a) => a.rootValue.subscribe(a), onSubscribe: ... yoga.getEnveloped(...) }, wss)` and import `useServer` from `graphql-ws/use/ws` (the code is in Task 18).
- Host: Windows 11, Node v24.18.0, pnpm 9.12.0 and Docker 29.5.3 are on PATH. Run commands from Git Bash in the repo root unless a step says PowerShell.

## Global Constraints

- Repo root: `C:\Users\sathwik\projects\taskarinchu\pricing-engine`. Edit nothing outside it. Never push and never add remotes.
- Host ports **5360-5369 only**: 5360 DynamoDB Local, 5361 GraphQL shim, 5362 web, 5363 bench shim, 5364 test shim when a fixed port is needed. 5369 is the planning prototype; stop it with `docker rm -f pricing-engine-proto` in Task 1.
- Docker container and compose names start with `pricing-engine-`. Stop every container you start before finishing a task, except `pricing-engine-dynamodb`, which may stay up between tasks and is stopped in Task 25.
- Pin these exact versions (no `^`/`~`): `typescript@5.9.3`, `vitest@4.1.11`, `fast-check@4.10.2`, `ajv@8.20.0`, `tsx@4.23.15`, `esbuild@0.28.2`, `@types/node@24.19.1`, `@types/aws-lambda@8.10.164`, `eslint@9.39.5`, `typescript-eslint@8.71.0`, `@aws-appsync/eslint-plugin@2.0.2`, `@aws-appsync/utils@2.1.1`, `@aws-sdk/client-dynamodb@3.1146.0`, `@aws-sdk/lib-dynamodb@3.1146.0`, `@aws-sdk/client-dynamodb-streams@3.1146.0`, `@aws-sdk/util-dynamodb@3.996.9`, `@aws-sdk/credential-provider-node@3.972.84`, `@smithy/signature-v4@5.7.4`, `@aws-crypto/sha256-js@5.2.0`, `aws-cdk-lib@2.272.0`, `constructs@10.8.1`, `aws-cdk@2.1144.0`, `cdk-nag@3.0.2`, `graphql@16.14.2`, `graphql-yoga@5.24.1`, `graphql-ws@6.3.0`, `ws@8.22.0`, `@types/ws@8.18.2`, `react@19.3.0`, `react-dom@19.3.0`, `@types/react@19.3.0`, `@types/react-dom@19.3.0`, `vite@8.3.2`, `@vitejs/plugin-react@6.1.1`.
- Every package is ESM (`"type": "module"`), with TS `module`/`moduleResolution` `NodeNext` (web uses `Bundler`). **Every relative import in `.ts` ends in `.js`.**
- Money is integer minor units everywhere. `packages/core/src` must not use `Date`, `Math.random` or `parseFloat` (lint-enforced).
- `pnpm test` needs no Docker, no network and no AWS credentials. Integration tests are named `*.int.test.ts`, run only via `pnpm test:int` (which sets `PRICING_INTEGRATION=1` through `vitest.int.config.ts`), and use `describe.skipIf(process.env.PRICING_INTEGRATION !== '1')`.
- With `PRICING_INTEGRATION=1` and DynamoDB Local down, tests **fail** with `DynamoDB Local not reachable at <url>. Start it with: docker compose up -d dynamodb`.
- Never deploy to AWS. No `.env` file. No secrets exist. `PRICING_PUBLISH_TOKEN` defaults to `local-dev-only` and is documented as not a secret.
- Numbers in README/DEVDOCS come only from files the commands wrote: `bench/results/latest.json`, `bench/results/core-latest.json` and test output. Never type a number by hand.
- Commits: one small conventional commit per task with the subject given, a body line if useful, then a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Local commits are authorized. Never amend, squash or push. Never commit `node_modules`, `dist`, `cdk.out`, `.dlq` files or `.env*`. If a permission check blocks a commit, stop and report it; do not work around it.
- Keep output small: pipe through `tail -n 30` or `grep`.
- Windows: `package.json` scripts must be cross-platform. No inline `VAR=x cmd` and no `rm -rf`; use Node scripts or tool flags.

## Review Focus

These are the input classes the spec implies but a happy-path test would miss. Each has a test in its owning task.

1. **Non-increasing `seq` on an input write** (duplicate or older). `putInput` returns `false`, the stored `seq` and the price are unchanged, and the simulator skips instead of crashing. Tests: Task 13 (resolver response), Task 18 (e2e: the same `seq` twice gives `true` then `false`), Task 19 (sim ledger resync).
2. **Hostile SKU strings** (`a#b`, a space, an empty string, 65 characters). `skuPk()` throws `InvalidSkuError`. The `putInput` resolver errors with `BadRequest` before touching DynamoDB. Tests: Task 8, Task 13.
3. **No COST, or COST = 0.** `evaluate` returns `NO_PRICE`. Recompute writes nothing, publishes nothing, and **acks** the record so it is not retried forever. Tests: Task 5, Task 9.
4. **An invalid or missing rule set in the table** (hand-edited). `DynamoDBStore.loadActiveRuleSet` throws `InvalidRuleSetError`, recompute reports the record in `batchItemFailures`, and the local runner parks it in the DLQ after 3 retries. No price is ever written. Tests: Task 10, Task 16.
5. **Out-of-order or duplicate subscription messages** (publisher retry). The web reducer ignores a message whose `(inputsVersion, ruleSetVersion)` is not newer than the row's. Test: Task 21.

---

## File Structure

```
pricing-engine/
  package.json  pnpm-workspace.yaml  tsconfig.base.json  eslint.config.js  .gitignore  .npmrc  .dockerignore  LICENSE
  docker-compose.yml  docker/app.Dockerfile
  scripts/check-readme-headline.mjs
  bench/results/                      # latest.json, core-latest.json, <timestamp>.json (committed)
  .github/workflows/ci.yml
  packages/core/        (name: pricing-rules-core, publishable)
    src/index.ts money.ts types.ts ruleset-schema.ts validate.ts ending.ts evaluate.ts
    test/purity-lint.test.ts money.table.test.ts validate.test.ts ending.test.ts evaluate.test.ts override.test.ts
         arbitraries.ts bounds.property.test.ts step-limit.property.test.ts ending.property.test.ts determinism.property.test.ts
    bench/evaluate.bench.ts  README.md  LICENSE
  packages/functions/   (@pricing-engine/functions)
    src/index.ts keys.ts filters.ts stream.ts table-def.ts clients.ts store.ts ddb-store.ts recompute.ts
        publisher.ts appsync-publisher.ts shim-publisher.ts lambda/recompute.ts lambda/publisher.ts
    scripts/bundle.mjs
    test/support/memory-store.ts test/support/ddb.ts test/support/events.ts
    test/keys.test.ts stream.test.ts recompute.test.ts publisher.test.ts appsync-publisher.test.ts bundle.test.ts
    test/ddb-store.int.test.ts concurrency.int.test.ts replay.int.test.ts
  packages/api/         (@pricing-engine/api)
    schema.graphql  resolvers/{Query.price,Query.decision,Query.pricesByCategory,Mutation.putInput,Mutation.publishPrice}.js
    src/index.ts src/appsync-utils-shim.js
    test/schema.test.ts test/resolvers.test.ts
  packages/local/       (@pricing-engine/local)
    src/cli.ts env.ts pattern.ts deliver.ts stream-reader.ts runner.ts resolver-runtime.ts shim.ts seed.ts rulesets.ts sim.ts watch.ts
        bench/stats.ts bench/latency.ts
    test/pattern.test.ts deliver.test.ts stream-reader.test.ts stats.test.ts sim.test.ts
    test/runner.int.test.ts shim.int.test.ts
  packages/web/         (@pricing-engine/web)
    index.html vite.config.ts src/main.tsx App.tsx gql.ts priceStore.ts styles.css test/priceStore.test.ts
  infra/                (@pricing-engine/infra)
    cdk.json bin/app.ts src/app.ts src/pricing-stack.ts src/nag-acknowledgements.ts
    test/esm.test.ts appsync.test.ts iam.test.ts nag.test.ts
  docs/  README.md
```

Workspace packages consume `pricing-rules-core` from source. Its `exports` point at `./src/index.ts`, and `publishConfig.exports` points at `dist` for packing (Task 7). Vitest, tsx and esbuild all read TS directly. `tsc` typechecks it as source.

---

### Task 1: Workspace scaffold, lint config and the core purity rule

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js`, `.gitignore`, `.npmrc`, `LICENSE`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/purity-lint.test.ts`

**Interfaces:**
- Produces: root scripts `build`, `lint`, `typecheck`, `test`, `test:int` (later tasks add `synth`, `bench`, `bench:core`, `local`, `watch`, `demo`); the ESLint flat config later tasks extend.

- [ ] **Step 1: Stop the planning prototype container and write the root files**

Run: `docker rm -f pricing-engine-proto` (expected: prints `pricing-engine-proto`, or "No such container").

`package.json`:
```json
{
  "name": "pricing-engine",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=24" },
  "scripts": {
    "build": "pnpm -r --workspace-concurrency=1 --if-present run build",
    "lint": "eslint .",
    "typecheck": "pnpm -r --if-present run typecheck",
    "test": "pnpm -r --workspace-concurrency=1 --if-present run test",
    "test:int": "pnpm -r --workspace-concurrency=1 --if-present run test:int"
  },
  "devDependencies": {
    "@aws-appsync/eslint-plugin": "2.0.2",
    "eslint": "9.39.5",
    "typescript": "5.9.3",
    "typescript-eslint": "8.71.0"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - packages/*
  - infra
```

`.npmrc`:
```
auto-install-peers=true
strict-peer-dependencies=false
```

`.gitignore`:
```
node_modules/
dist/
cdk.out/
coverage/
*.tsbuildinfo
*.tgz
.dlq/
.env
.env.*
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "types": ["node"]
  }
}
```

`eslint.config.js`:
```js
import tseslint from 'typescript-eslint';
import appsync from '@aws-appsync/eslint-plugin';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/cdk.out/**', '**/coverage/**', 'bench/results/**'] },
  { files: ['**/*.ts', '**/*.tsx'], extends: [tseslint.configs.recommended] },
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error',
        { name: 'Date', message: 'core must be pure: inject time as a parameter' },
        { name: 'parseFloat', message: 'core uses integer minor units only' }],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'core must be deterministic' },
        { object: 'Number', property: 'parseFloat', message: 'core uses integer minor units only' }],
    },
  },
  { ...appsync.configs.base, files: ['packages/api/resolvers/**/*.js'] },
);
```

`LICENSE`: the MIT license text, `Copyright (c) 2026 sathwikbairaboina2`.

- [ ] **Step 2: Create the core package skeleton**

`packages/core/package.json`:
```json
{
  "name": "pricing-rules-core",
  "version": "0.1.0",
  "description": "Deterministic, integer-money pricing rule engine with JSON Schema rule sets and a decision trace.",
  "license": "MIT",
  "type": "module",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "ajv": "8.20.0" },
  "devDependencies": {
    "@types/node": "24.19.1",
    "eslint": "9.39.5",
    "fast-check": "4.10.2",
    "tsx": "4.23.15",
    "typescript": "5.9.3",
    "typescript-eslint": "8.71.0",
    "vitest": "4.1.11"
  }
}
```
`packages/core/tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "include": ["src", "test", "bench"] }`.
`packages/core/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['test/**/*.test.ts'], exclude: ['test/**/*.int.test.ts'], testTimeout: 60000 } });
```
`packages/core/src/index.ts`: `export {};` (later tasks add exports).

- [ ] **Step 3: Write the failing purity test**

`packages/core/test/purity-lint.test.ts`:
```ts
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const code = 'export const a = Date.now();\nexport const b = Math.random();\nexport const c = parseFloat("1.5");\n';

async function ruleIds(filePath: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: repoRoot });
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'fatal');
}

describe('core purity lint rule', () => {
  it('rejects Date, Math.random and parseFloat inside packages/core/src', async () => {
    const ids = await ruleIds(`${repoRoot}packages/core/src/__purity_fixture__.ts`);
    expect(ids.filter((i) => i === 'no-restricted-globals')).toHaveLength(2);
    expect(ids.filter((i) => i === 'no-restricted-properties')).toHaveLength(1);
  });
  it('does not apply outside core', async () => {
    const ids = await ruleIds(`${repoRoot}packages/functions/src/__purity_fixture__.ts`);
    expect(ids).not.toContain('no-restricted-globals');
    expect(ids).not.toContain('no-restricted-properties');
  });
});
```

- [ ] **Step 4: Install and run**

Run: `pnpm install` then `pnpm --filter pricing-rules-core test 2>&1 | tail -n 15`
Expected: `2 passed`. If the first case fails because ESLint cannot find the config, check that `cwd` resolves to the repo root. If the rule did not fire, check the `files` glob. A failing test here is a real config bug; fix the config, not the test.

- [ ] **Step 5: Gates**

Run: `pnpm lint && pnpm typecheck && echo OK`
Expected: `OK`.

- [ ] **Step 6: Commit**

`git add -A && git commit` with subject `chore: scaffold pnpm workspace with core purity lint rule` (stage everything, including `pnpm-lock.yaml`, the docs and the ledger already in the repo, if they are not committed yet).

---

### Task 2: core money arithmetic

**Files:**
- Create: `packages/core/src/money.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/money.table.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type RoundingMode = 'HALF_EVEN' | 'HALF_UP';
  export const MAX_MINOR = 1_000_000_000_000;
  export function assertMinor(n: number, name: string): void;            // RangeError unless safe int in [0, MAX_MINOR]
  export function assertSafeInt(n: number, name: string, min: number, max: number): void;
  export function mulDivRound(a: number, b: number, d: number, mode: RoundingMode): number; // round(a*b/d), BigInt inside
  export function ceilMulDiv(a: number, b: number, d: number): number;   // a,b >= 0, d > 0
  export function floorMulDiv(a: number, b: number, d: number): number;  // a,b >= 0, d > 0
  export function saturate(n: number, lo: number, hi: number): number;
  ```
  `HALF_UP` rounds ties away from zero, `HALF_EVEN` rounds ties to the even neighbour, and both are symmetric for negative values.

- [ ] **Step 1: Write the failing table test**

```ts
import { describe, expect, it } from 'vitest';
import { assertMinor, ceilMulDiv, floorMulDiv, mulDivRound, saturate, MAX_MINOR } from '../src/money.js';

describe('mulDivRound', () => {
  const cases: Array<[number, number, number, 'HALF_EVEN' | 'HALF_UP', number]> = [
    [5, 1, 2, 'HALF_EVEN', 2], [7, 1, 2, 'HALF_EVEN', 4], [5, 1, 2, 'HALF_UP', 3], [7, 1, 2, 'HALF_UP', 4],
    [-5, 1, 2, 'HALF_EVEN', -2], [-5, 1, 2, 'HALF_UP', -3], [-7, 1, 2, 'HALF_EVEN', -4],
    [1, 1, 3, 'HALF_EVEN', 0], [2, 1, 3, 'HALF_EVEN', 1],
    [1000, 800, 10000, 'HALF_EVEN', 80], [1005, 500, 10000, 'HALF_EVEN', 50],
    [1010, 500, 10000, 'HALF_EVEN', 50], [1010, 500, 10000, 'HALF_UP', 51], [1030, 500, 10000, 'HALF_EVEN', 52],
    [1999, -1500, 10000, 'HALF_EVEN', -300], [MAX_MINOR, 100000, 10000, 'HALF_EVEN', 10 * MAX_MINOR],
  ];
  it.each(cases)('%i * %i / %i (%s) = %i', (a, b, d, mode, want) => {
    expect(mulDivRound(a, b, d, mode)).toBe(want);
  });
  it('throws when the result is not a safe integer', () => {
    expect(() => mulDivRound(Number.MAX_SAFE_INTEGER, 2, 1, 'HALF_EVEN')).toThrow(RangeError);
  });
  it('throws on a non-positive divisor or non-integer operand', () => {
    expect(() => mulDivRound(1, 1, 0, 'HALF_EVEN')).toThrow(RangeError);
    expect(() => mulDivRound(1.5, 1, 1, 'HALF_EVEN')).toThrow(RangeError);
  });
});

describe('ceilMulDiv / floorMulDiv', () => {
  it.each([[1, 10500, 10000, 2], [1000, 10500, 10000, 1050], [999, 10001, 10000, 1000]])('ceil %i*%i/%i = %i', (a, b, d, w) => expect(ceilMulDiv(a, b, d)).toBe(w));
  it.each([[1, 10600, 10000, 1], [999, 30000, 10000, 2997], [1, 9999, 10000, 0]])('floor %i*%i/%i = %i', (a, b, d, w) => expect(floorMulDiv(a, b, d)).toBe(w));
});

describe('assertMinor / saturate', () => {
  it('accepts 0 and MAX_MINOR, rejects negatives, fractions and above max', () => {
    expect(() => assertMinor(0, 'x')).not.toThrow();
    expect(() => assertMinor(MAX_MINOR, 'x')).not.toThrow();
    for (const bad of [-1, 1.5, MAX_MINOR + 1, Number.NaN]) expect(() => assertMinor(bad, 'x')).toThrow(RangeError);
  });
  it('saturates', () => { expect(saturate(-5, 0, 10)).toBe(0); expect(saturate(50, 0, 10)).toBe(10); expect(saturate(5, 0, 10)).toBe(5); });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm --filter pricing-rules-core exec vitest run test/money.table.test.ts 2>&1 | tail -n 5`
Expected: FAIL, `Cannot find module '../src/money.js'` or a similar message.

- [ ] **Step 3: Implement `packages/core/src/money.ts`**

```ts
export type RoundingMode = 'HALF_EVEN' | 'HALF_UP';
export const MAX_MINOR = 1_000_000_000_000;

export function assertSafeInt(n: number, name: string, min: number, max: number): void {
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw new RangeError(`${name} must be an integer in [${min}, ${max}], got ${n}`);
  }
}
export function assertMinor(n: number, name: string): void { assertSafeInt(n, name, 0, MAX_MINOR); }

function toSafe(b: bigint): number {
  if (b > BigInt(Number.MAX_SAFE_INTEGER) || b < BigInt(Number.MIN_SAFE_INTEGER)) throw new RangeError('result is not a safe integer');
  return Number(b);
}
function checkOperands(a: number, b: number, d: number): void {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) throw new RangeError('operands must be safe integers');
  if (!Number.isSafeInteger(d) || d <= 0) throw new RangeError('divisor must be a positive safe integer');
}

export function mulDivRound(a: number, b: number, d: number, mode: RoundingMode): number {
  checkOperands(a, b, d);
  const n = BigInt(a) * BigInt(b);
  const D = BigInt(d);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  let q = abs / D;
  const twice = (abs % D) * 2n;
  if (twice > D || (twice === D && (mode === 'HALF_UP' || q % 2n === 1n))) q += 1n;
  return toSafe(neg ? -q : q);
}
export function ceilMulDiv(a: number, b: number, d: number): number {
  checkOperands(a, b, d);
  if (a < 0 || b < 0) throw new RangeError('ceilMulDiv needs non-negative operands');
  const n = BigInt(a) * BigInt(b);
  const D = BigInt(d);
  return toSafe((n + D - 1n) / D);
}
export function floorMulDiv(a: number, b: number, d: number): number {
  checkOperands(a, b, d);
  if (a < 0 || b < 0) throw new RangeError('floorMulDiv needs non-negative operands');
  return toSafe((BigInt(a) * BigInt(b)) / BigInt(d));
}
export function saturate(n: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, n)); }
```
`index.ts`: `export * from './money.js';`

- [ ] **Step 4: Run it**

Run: `pnpm --filter pricing-rules-core test 2>&1 | tail -n 6`
Expected: all pass (about 33 tests).

- [ ] **Step 5: Commit**: `feat(core): add integer money arithmetic with HALF_EVEN and HALF_UP rounding`

---

### Task 3: core rule-set types, JSON Schema and validation

**Files:**
- Create: `packages/core/src/types.ts`, `packages/core/src/ruleset-schema.ts`, `packages/core/src/validate.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/validate.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  import type { RoundingMode } from './money.js';
  export const INPUT_SOURCES = ['COST', 'COMPETITOR', 'INVENTORY', 'DEMAND'] as const;
  export type InputSource = (typeof INPUT_SOURCES)[number];
  export interface InputValue { value: number; seq: number }
  export type Inputs = Partial<Record<InputSource, InputValue>>;
  export type Condition =
    | { input: InputSource; op: 'exists' | 'missing' }
    | { input: InputSource; op: 'lt' | 'lte' | 'gt' | 'gte' | 'eq'; value: number };
  export type Action = { op: 'setTo'; input: 'COST' | 'COMPETITOR'; offsetMinor: number } | { op: 'adjustBps'; bps: number };
  export interface Rule { id: string; when: Condition; then: Action }
  export interface RuleSet {
    id: string; version: number; currency: string; defaultMarkupBps: number;
    floor: { type: 'costPlusBps'; bps: number };
    ceiling: { type: 'multipleOfCost'; factorBps: number };
    rounding: { mode: RoundingMode; endingMinor?: number };
    maxStepBps?: number;
    rules: Rule[];
  }
  export interface Override { priceMinor: number; expiresAt: number; seq: number }
  export interface TraceStep { ruleId: string; beforeMinor: number; afterMinor: number; note?: string }
  export interface EvaluateRequest { inputs: Inputs; override?: Override; previousPriceMinor?: number; ruleSet: RuleSet; now: number }
  export type PriceDecision =
    | { kind: 'PRICE'; priceMinor: number; inputsVersion: number; ruleSetVersion: number; band: { floor: number; ceiling: number }; trace: TraceStep[] }
    | { kind: 'NO_PRICE'; reason: 'MISSING_COST' | 'NON_POSITIVE_COST'; inputsVersion: number; ruleSetVersion: number; trace: TraceStep[] };
  ```
- Produces (`validate.ts`):
  ```ts
  export interface RuleSetError { pointer: string; message: string }
  export type RuleSetValidation = { ok: true; ruleSet: RuleSet } | { ok: false; errors: RuleSetError[] };
  export function validateRuleSet(input: unknown): RuleSetValidation;
  export class InvalidRuleSetError extends Error { constructor(public readonly errors: RuleSetError[]) }
  export function parseRuleSet(input: unknown): RuleSet; // throws InvalidRuleSetError
  ```
- `ruleset-schema.ts` exports `ruleSetSchema` (a plain object, `as const`).

- [ ] **Step 1: Write the failing tests** (`validate.test.ts`). Use the spec §6 example as `valid` (with `factorBps: 30000`). Cases:
  - the example is `ok: true`, and the returned `ruleSet` deep-equals the input;
  - a float `defaultMarkupBps: 2.5` gives an error at pointer `/defaultMarkupBps`;
  - an unknown top-level key `foo` gives `ok: false` (`additionalProperties`);
  - `when: { input: 'INVENTORY', op: 'lt' }` with no `value` gives `ok: false` with a pointer starting `/rules/1/when`;
  - duplicate rule ids give the error `{ pointer: '/rules/1/id', message: 'duplicate rule id "match-competitor"' }`;
  - `ceiling.factorBps: 10400` with `floor.bps: 500` gives an error at `/ceiling/factorBps` whose message contains `must be >= 10500`;
  - `then: { op: 'setTo', input: 'INVENTORY', offsetMinor: 0 }` gives `ok: false`, with a pointer starting `/rules/0/then`;
  - `currency: 'eur'` gives `ok: false`;
  - 51 rules give `ok: false`;
  - `maxStepBps: 0` gives `ok: false`;
  - `rounding.endingMinor: 100` gives `ok: false`;
  - `parseRuleSet(bad)` throws `InvalidRuleSetError`, and `.errors.length > 0`.

```ts
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
```

- [ ] **Step 2: Run it and see it fail** (module not found).

- [ ] **Step 3: Implement.**
  - `ruleset-schema.ts`: `$schema: 'https://json-schema.org/draft/2020-12/schema'`, `type: 'object'`, `additionalProperties: false`, required `['id','version','currency','defaultMarkupBps','floor','ceiling','rounding','rules']`. Properties:
    - `id {type:'string', pattern:'^[a-z0-9-]{1,64}$'}`, `version {type:'integer', minimum:1}`, `currency {type:'string', pattern:'^[A-Z]{3}$'}`, `defaultMarkupBps {type:'integer', minimum:0, maximum:100000}`;
    - `floor {type:'object', additionalProperties:false, required:['type','bps'], properties:{type:{const:'costPlusBps'}, bps:{type:'integer',minimum:0,maximum:100000}}}`;
    - `ceiling` likewise with `factorBps` 10000..1000000;
    - `rounding {required:['mode'], properties:{mode:{enum:['HALF_EVEN','HALF_UP']}, endingMinor:{type:'integer',minimum:0,maximum:99}}, additionalProperties:false}`;
    - `maxStepBps {type:'integer', minimum:1, maximum:10000}`;
    - `rules {type:'array', maxItems:50, items: {$ref:'#/$defs/rule'}}`.
  - `$defs`:
    - `source {enum:[...INPUT_SOURCES]}`;
    - `rule {type:'object', additionalProperties:false, required:['id','when','then'], properties:{id:{type:'string',pattern:'^[a-z0-9-]{1,64}$'}, when:{$ref:'#/$defs/condition'}, then:{$ref:'#/$defs/action'}}}`;
    - `condition {oneOf:[{type:'object',additionalProperties:false,required:['input','op'],properties:{input:{$ref:'#/$defs/source'},op:{enum:['exists','missing']}}},{type:'object',additionalProperties:false,required:['input','op','value'],properties:{input:{$ref:'#/$defs/source'},op:{enum:['lt','lte','gt','gte','eq']},value:{type:'integer'}}}]}`;
    - `action {oneOf:[{type:'object',additionalProperties:false,required:['op','input','offsetMinor'],properties:{op:{const:'setTo'},input:{enum:['COST','COMPETITOR']},offsetMinor:{type:'integer',minimum:-1000000000000,maximum:1000000000000}}},{type:'object',additionalProperties:false,required:['op','bps'],properties:{op:{const:'adjustBps'},bps:{type:'integer',minimum:-10000,maximum:100000}}}]}`.
  - `validate.ts`: `import { Ajv2020 } from 'ajv/dist/2020.js'`. Create one module-level `new Ajv2020({ allErrors: true, strict: true })` and `compile(ruleSetSchema)` once.
    - Map ajv errors to `{ pointer: e.instancePath || '/', message: e.message ?? 'invalid' }`. For `additionalProperties`, append `: ${e.params.additionalProperty}`.
    - Only when the schema passes, run the semantic checks: duplicate ids (message `duplicate rule id "<id>"`, pointer `/rules/<i>/id` of the second occurrence), and `factorBps >= 10000 + floor.bps` (message `must be >= ${10000 + bps} (100% + floor.bps)`).
  - Export everything from `index.ts`, including `ruleSetSchema` and the types.

- [ ] **Step 4: Run** `pnpm --filter pricing-rules-core test 2>&1 | tail -n 6`. Expected: all pass. Also run `pnpm lint && pnpm typecheck`.

- [ ] **Step 5: Commit**: `feat(core): add rule-set JSON Schema and semantic validation with JSON pointers`

---

### Task 4: core price-ending snap

**Files:** Create `packages/core/src/ending.ts`. Test `packages/core/test/ending.test.ts`. Modify `index.ts`.

**Interfaces:** Produces `export function snapToEnding(price: number, lo: number, hi: number, endingMinor: number): number | undefined`. Precondition: `lo <= price <= hi`. The result is the candidate `c` with `c % 100 === endingMinor` and `lo <= c <= hi` that is nearest to `price`; a tie picks the lower one. Returns `undefined` if no candidate exists.

- [ ] **Step 1: Failing test**
```ts
import { describe, expect, it } from 'vitest';
import { snapToEnding } from '../src/ending.js';
describe('snapToEnding', () => {
  it.each([
    [1234, 0, 10000, 99, 1199], [1249, 0, 10000, 99, 1199], [1250, 0, 10000, 99, 1299], [1299, 0, 10000, 99, 1299],
    [1250, 1150, 1298, 99, 1199], [1250, 1200, 1400, 99, 1299], [50, 0, 1000, 99, 99], [1000, 1000, 1000, 0, 1000],
    [1234, 0, 10000, 0, 1200],
  ])('snap(%i, [%i,%i], .%i) = %i', (p, lo, hi, e, want) => expect(snapToEnding(p, lo, hi, e)).toBe(want));
  it('returns undefined when no candidate fits', () => {
    expect(snapToEnding(1250, 1200, 1298, 99)).toBeUndefined();
    expect(snapToEnding(1000, 1000, 1000, 99)).toBeUndefined();
  });
});
```
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Implement**
```ts
export function snapToEnding(price: number, lo: number, hi: number, endingMinor: number): number | undefined {
  const below = price - ((((price - endingMinor) % 100) + 100) % 100);
  const above = below === price ? price : below + 100;
  const fits = [below, above].filter((c) => c >= lo && c <= hi);
  if (fits.length === 0) return undefined;
  if (fits.length === 1) return fits[0];
  return price - below <= above - price ? below : above;
}
```
- [ ] **Step 4: Run it and see it pass.** `pnpm --filter pricing-rules-core test 2>&1 | tail -n 4`
- [ ] **Step 5: Commit**: `feat(core): snap prices to a configured ending inside an interval`

---

### Task 5: core `evaluate()` with trace and overrides

**Files:** Create `packages/core/src/evaluate.ts`. Modify `index.ts`. Tests: `packages/core/test/evaluate.test.ts`, `packages/core/test/override.test.ts`.

**Interfaces:**
- Consumes: money (Task 2), types (Task 3), `snapToEnding` (Task 4).
- Produces: `export function evaluate(req: EvaluateRequest): PriceDecision` and `export function computeInputsVersion(inputs: Inputs, override?: Override): number`.

- [ ] **Step 1: Write the failing tests.** `evaluate.test.ts` uses the `default` rule set from spec §6 (the "valid" fixture of Task 3) and `now = 1_700_000_000_000`. Name each case after the behavior, and assert the exact `priceMinor` and the `trace` ruleIds:
  1. **Missing COST:** `NO_PRICE`, reason `MISSING_COST`, `trace: []`.
  2. **COST 0:** `NO_PRICE`, reason `NON_POSITIVE_COST`.
  3. **COST only:** `{COST: {value: 1000, seq: 1}}`. floor = ceil(1000*10500/10000) = 1050, ceiling = 3000, base = 1000 + 250 = 1250, and no rule fires (no competitor; INVENTORY missing, so `lt` is false). Interval [1050, 3000]. Ending .99: candidates 1199 (distance 51) and 1299 (distance 49) give **1299**. Trace ruleIds `['base', 'ending']`. `band = {floor: 1050, ceiling: 3000}`, `inputsVersion 1`, `ruleSetVersion 1`.
  4. **Competitor match:** COST 1000/seq 1, COMPETITOR 1500/seq 2. setTo gives 1490, then ending gives 1499 (1499-1490 = 9 against 1490-1399 = 91). Trace `['base', 'match-competitor', 'ending']`, `inputsVersion 3`.
  5. **Low-stock surge after match:** add INVENTORY 10/seq 1. 1490, then +8% = 1490 + mulDivRound(1490, 800, 10000) = 1490 + 119 (119.2) = 1609, then ending gives 1599 (10) against 1699 (90). Result **1599**.
  6. **Competitor below the floor:** COMPETITOR 900. setTo 890, clamp to 1050, then ending in [1050, 3000] gives 1099 (49) against 999 (outside), so **1099**. Trace includes `clamp`.
  7. **Step limit:** COST 1000, COMPETITOR 2500, previousPriceMinor 1500. setTo 2490. step = floor(1500*1500/10000) = 225, so stepBand is [1275, 1725] and the interval is [1275, 1725]. Clamp gives 1725, then the ending gives 1699 (26) against 1799 (outside). **1699**.
  8. **Step band outside the band:** COST 1000, previousPriceMinor 500. step = 75, stepBand [425, 575] does not meet [1050, 3000], so the step is skipped (trace note `step limit skipped: outside band`), and the price lands in the band. base 1250 gives 1299.
  9. **Ending skipped:** a rule set with floor bps 0, factorBps 10050 and COST 1000 gives band [1000, 1005]. base 1250 clamps to 1005. No `.99` candidate exists in [1000, 1005], so the price is 1005 with trace note `ending skipped: no candidate in interval`.
  10. **Ceiling raised to floor:** COST 1, floor bps 500, factorBps 10500. floor = ceil(1.05) = 2 and rawCeiling = floor(1.05) = 1, so the band is [2, 2] and the trace has `band` with note `ceiling raised to floor`. The price is 2 (no ending candidate, so the ending is skipped).
  11. **Saturation:** COST 1e12, a rule `adjustBps 100000` (condition `COST exists`) repeated 3 times (ids r0..r2), factorBps 1000000. This must not throw. Intermediates saturate at MAX_MINOR (1e12), which is below floor 1.05e12, so the clamp lifts the price to the floor and the ending gives **1050000000099** (verified at planning). Assert that exact value and that `band.floor <= priceMinor <= band.ceiling`.
  12. **Range checks:** COST 1.5 or 1e12+1 throws `RangeError`; `seq: -1` throws `RangeError`.

  `override.test.ts`: COST 1000, COMPETITOR 1500, override `{priceMinor: 2000, expiresAt: now + 1, seq: 4}`:
  - active: the price is the override snapped, 1999 (2000-1999 = 1 against 2099), the trace has `override`, `inputsVersion = 1 + 1 + 4 = 6`;
  - at `now === expiresAt`, and after it: the override has no effect (the price equals case 4, 1499) but `inputsVersion` still includes the override seq (6);
  - an override of 99999 with an active previousPriceMinor 1500 and maxStepBps: the step is bypassed, the price is clamped to the ceiling 3000 and snapped down to 2999;
  - an override of 10 is clamped up to the floor and snapped to 1099.

- [ ] **Step 2: Run them and see them fail.**

- [ ] **Step 3: Implement `evaluate.ts`**
```ts
import { assertMinor, assertSafeInt, ceilMulDiv, floorMulDiv, MAX_MINOR, mulDivRound, saturate } from './money.js';
import { snapToEnding } from './ending.js';
import { INPUT_SOURCES, type Condition, type EvaluateRequest, type Inputs, type Override, type PriceDecision, type TraceStep } from './types.js';

const BPS = 10000;

export function computeInputsVersion(inputs: Inputs, override?: Override): number {
  let v = override?.seq ?? 0;
  for (const s of INPUT_SOURCES) v += inputs[s]?.seq ?? 0;
  return v;
}

function checkRequest(req: EvaluateRequest): void {
  for (const s of INPUT_SOURCES) {
    const iv = req.inputs[s];
    if (!iv) continue;
    assertSafeInt(iv.seq, `${s}.seq`, 0, Number.MAX_SAFE_INTEGER);
    if (s === 'COST' || s === 'COMPETITOR') assertMinor(iv.value, `${s}.value`);
    else assertSafeInt(iv.value, `${s}.value`, -MAX_MINOR, MAX_MINOR);
  }
  if (req.previousPriceMinor !== undefined) assertMinor(req.previousPriceMinor, 'previousPriceMinor');
  if (req.override) { assertMinor(req.override.priceMinor, 'override.priceMinor'); assertSafeInt(req.override.seq, 'override.seq', 0, Number.MAX_SAFE_INTEGER); }
}

function holds(c: Condition, inputs: Inputs): boolean {
  const iv = inputs[c.input];
  if (c.op === 'exists') return iv !== undefined;
  if (c.op === 'missing') return iv === undefined;
  if (iv === undefined) return false;
  switch (c.op) {
    case 'lt': return iv.value < c.value;
    case 'lte': return iv.value <= c.value;
    case 'gt': return iv.value > c.value;
    case 'gte': return iv.value >= c.value;
    case 'eq': return iv.value === c.value;
  }
}

export function evaluate(req: EvaluateRequest): PriceDecision {
  checkRequest(req);
  const { inputs, override, previousPriceMinor, ruleSet, now } = req;
  const inputsVersion = computeInputsVersion(inputs, override);
  const ruleSetVersion = ruleSet.version;
  const cost = inputs.COST?.value;
  if (cost === undefined) return { kind: 'NO_PRICE', reason: 'MISSING_COST', inputsVersion, ruleSetVersion, trace: [] };
  if (cost <= 0) return { kind: 'NO_PRICE', reason: 'NON_POSITIVE_COST', inputsVersion, ruleSetVersion, trace: [] };
  const mode = ruleSet.rounding.mode;
  const trace: TraceStep[] = [];

  const floor = ceilMulDiv(cost, BPS + ruleSet.floor.bps, BPS);
  const rawCeiling = floorMulDiv(cost, ruleSet.ceiling.factorBps, BPS);
  const ceiling = Math.max(floor, rawCeiling);
  if (ceiling !== rawCeiling) trace.push({ ruleId: 'band', beforeMinor: rawCeiling, afterMinor: ceiling, note: 'ceiling raised to floor' });

  let price = saturate(cost + mulDivRound(cost, ruleSet.defaultMarkupBps, BPS, mode), 0, MAX_MINOR);
  trace.push({ ruleId: 'base', beforeMinor: cost, afterMinor: price });

  for (const rule of ruleSet.rules) {
    if (!holds(rule.when, inputs)) continue;
    const before = price;
    if (rule.then.op === 'setTo') {
      const src = inputs[rule.then.input];
      if (!src) { trace.push({ ruleId: rule.id, beforeMinor: before, afterMinor: before, note: 'input missing' }); continue; }
      price = src.value + rule.then.offsetMinor;
    } else {
      price = price + mulDivRound(price, rule.then.bps, BPS, mode);
    }
    price = saturate(price, 0, MAX_MINOR);
    trace.push({ ruleId: rule.id, beforeMinor: before, afterMinor: price });
  }

  const overrideActive = override !== undefined && override.expiresAt > now;
  if (overrideActive) { trace.push({ ruleId: 'override', beforeMinor: price, afterMinor: override.priceMinor }); price = override.priceMinor; }

  let lo = floor;
  let hi = ceiling;
  if (previousPriceMinor !== undefined && !overrideActive && ruleSet.maxStepBps !== undefined) {
    const step = floorMulDiv(previousPriceMinor, ruleSet.maxStepBps, BPS);
    const sLo = Math.max(lo, previousPriceMinor - step);
    const sHi = Math.min(hi, previousPriceMinor + step);
    if (sLo <= sHi) { lo = sLo; hi = sHi; }
    else trace.push({ ruleId: 'step', beforeMinor: price, afterMinor: price, note: 'step limit skipped: outside band' });
  }

  const clamped = saturate(price, lo, hi);
  if (clamped !== price) trace.push({ ruleId: 'clamp', beforeMinor: price, afterMinor: clamped });
  price = clamped;

  const ending = ruleSet.rounding.endingMinor;
  if (ending !== undefined) {
    const snapped = snapToEnding(price, lo, hi, ending);
    if (snapped === undefined) trace.push({ ruleId: 'ending', beforeMinor: price, afterMinor: price, note: 'ending skipped: no candidate in interval' });
    else { if (snapped !== price) trace.push({ ruleId: 'ending', beforeMinor: price, afterMinor: snapped }); price = snapped; }
  }
  return { kind: 'PRICE', priceMinor: price, inputsVersion, ruleSetVersion, band: { floor, ceiling }, trace };
}
```
Note: a trace step has **no** `note` key unless a note exists. Never write `note: undefined`, because DynamoDB marshalling rejects `undefined`.
All Step 1 expectations (cases 1-12 and the 4 override cases) were run against exactly this code at planning time and match. If a test disagrees, the test was typed wrong; recompute it by hand. The pipeline in spec §7 is the source of truth; fix whichever is wrong and record a `Ruling:`.

- [ ] **Step 4: Run it.** `pnpm --filter pricing-rules-core test 2>&1 | tail -n 6` → all pass. `pnpm lint` → clean (no `Date` in core).
- [ ] **Step 5: Commit**: `feat(core): evaluate rules with band, step limit, ending and decision trace`

---

### Task 6: core property tests

**Files:** Create `packages/core/test/arbitraries.ts`, `bounds.property.test.ts`, `step-limit.property.test.ts`, `ending.property.test.ts`, `determinism.property.test.ts`.

**Interfaces:**
- Consumes: `evaluate`, `validateRuleSet`, `floorMulDiv`.
- Produces: `arbRuleSet()`, `arbRequest()` and `NUM_RUNS = Number(process.env.FC_NUM_RUNS ?? 10000)`.

- [ ] **Step 1: Write the arbitraries.** They are valid by construction, using `fc.record`:
  - `floor.bps` 0..5000;
  - `ceiling.factorBps` = 10000 + floor.bps + `fc.integer({min: 0, max: 40000})`;
  - `defaultMarkupBps` 0..10000;
  - `maxStepBps` `fc.option(1..10000, {nil: undefined})`;
  - `rounding` `{mode: constantFrom('HALF_EVEN','HALF_UP'), endingMinor: option(0..99)}`;
  - `rules`: an array of 0..5 with unique ids `r0..rN`. Conditions come from all ops with `value` -100..1000. Actions are setTo COST/COMPETITOR with an offset of -500..500, or adjustBps -10000..20000.

  `arbRequest`:
  - inputs: COST with `fc.option(1..1_000_000_000, {freq: 20})`; COMPETITOR, INVENTORY and DEMAND optional (COMPETITOR 0..2e9, INVENTORY/DEMAND -1000..1000);
  - seq 0..1000;
  - previousPriceMinor optional 1..2e9;
  - override optional `{priceMinor 0..2e9, expiresAt 0..2e12, seq 0..10}`;
  - `now` 0..2e12.

  Optional keys must be **omitted**, not set to `undefined`. Build objects by filtering out undefined entries, because the determinism test shuffles keys.
- [ ] **Step 2: Write the properties** (each `fc.assert(fc.property(...), { numRuns: NUM_RUNS })`):
  - generator sanity: `validateRuleSet(rs).ok === true` (numRuns 1000);
  - bounds: for `kind === 'PRICE'`, `band.floor <= priceMinor <= band.ceiling`; also `band.floor <= band.ceiling`, and `priceMinor` is a safe integer;
  - step limit: if `previousPriceMinor !== undefined && maxStepBps !== undefined && !(override && override.expiresAt > now)`, compute `step = floorMulDiv(prev, maxStepBps, 10000)`. If `max(floor, prev-step) <= min(ceiling, prev+step)`, then `Math.abs(price - prev) <= step`;
  - ending: compute the allowed interval exactly as spec §7 step 6. If `endingMinor !== undefined` and `firstCandidate = lo + ((endingMinor - (lo % 100)) + 100) % 100` is `<= hi`, then `price % 100 === endingMinor`;
  - determinism: build a key-shuffled deep copy (reverse `Object.keys` order at every level, recursively, for plain objects; keep arrays in order) and assert `expect(evaluate(copy)).toEqual(evaluate(req))`, and that `JSON.stringify(evaluate(req)) === JSON.stringify(evaluate(req))`.
- [ ] **Step 3: Run.** `pnpm --filter pricing-rules-core test 2>&1 | tail -n 8`. Expected: all pass. Record the wall time Vitest prints in the ledger. If a property fails:
  - copy the counterexample from fast-check's output into `packages/core/test/regressions.test.ts` as an explicit example;
  - fix the code (or the property, only if the property misstates the spec), using superpowers:systematic-debugging;
  - keep the regression test.
- [ ] **Step 4: Commit**: `test(core): add fast-check properties for bounds, step limit, ending and determinism`

---

### Task 7: Make `pricing-rules-core` publish-ready, and add its micro-benchmark

**Files:**
- Create: `packages/core/tsconfig.build.json`, `packages/core/README.md`, `packages/core/LICENSE` (a copy of the root one), `packages/core/scripts/pack-check.mjs`, `packages/core/bench/evaluate.bench.ts`
- Modify: `packages/core/package.json`, root `package.json` (`bench:core`), `.gitignore` (already ignores `dist`, `*.tgz`)

**Interfaces:** Produces `pnpm --filter pricing-rules-core build` → `packages/core/dist/*.js` + `*.d.ts`; `pnpm --filter pricing-rules-core pack:check`; `pnpm bench:core` → `bench/results/core-latest.json`.

- [ ] **Step 1: Configure the build.**
  - `tsconfig.build.json`: `{ "extends": "./tsconfig.json", "compilerOptions": { "outDir": "dist", "rootDir": "src", "declaration": true, "noEmit": false }, "include": ["src"] }`.
  - Scripts:
    - `"build": "tsc -p tsconfig.build.json"`;
    - `"pack:check": "node scripts/pack-check.mjs"`;
    - `"bench": "tsx bench/evaluate.bench.ts"`.
  - Add `"publishConfig": { "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } } }`, plus `"repository"`, `"keywords": ["pricing","rules","deterministic","money","json-schema"]` and `"engines": {"node": ">=20"}`.
- [ ] **Step 2: Write `scripts/pack-check.mjs`.** It:
  - runs `pnpm build`;
  - runs `pnpm pack --pack-destination <os.tmpdir()>` via `execFileSync` (`shell: true` on win32);
  - lists the tarball with `tar -tzf` (Git Bash and Windows 11 both ship `tar`);
  - asserts `package/dist/index.js`, `package/dist/index.d.ts`, `package/README.md` and `package/LICENSE` are present and that no `package/src/` or `package/test/` entries exist;
  - extracts `package/package.json` with `tar -xzf <tgz> -C <tmp> package/package.json` and asserts `exports["."].default === "./dist/index.js"` (proving `publishConfig` was applied);
  - prints `pack-check OK: <n> files, <bytes> bytes`, deletes the tarball, and exits 1 with a clear message on any failure.
- [ ] **Step 3: Run** `pnpm --filter pricing-rules-core pack:check 2>&1 | tail -n 5`. Expected: `pack-check OK: ...`. If pnpm did not apply `publishConfig.exports`, record a `Ruling:` and switch to `exports` → dist plus a `"development"` condition. Do not hand-edit tarballs.
- [ ] **Step 4: Write `bench/evaluate.bench.ts`** (run with tsx; it is outside `src`, so `Date` is allowed here).
  - It builds the `default` rule set (spec §6), runs a warm-up of 10,000 calls, then 100,000 calls over a rotating set of 1,000 deterministic requests (prices derived from the index; no `Math.random`).
  - It times each call with `performance.now()`, then writes `../../bench/results/core-latest.json` (relative to the package, i.e. repo `bench/results/core-latest.json`) as `{ kind: 'core-evaluate', at: ISO, calls: 100000, callsPerSec, p50Us, p99Us, maxUs, node: process.version, cpu: os.cpus()[0]?.model, platform: os.platform() }`.
  - It prints `evaluate(): <callsPerSec> calls/s, p50 <x> us, p99 <y> us`.
  - Root script: `"bench:core": "pnpm --filter pricing-rules-core run bench"`.
- [ ] **Step 5: Run** `pnpm bench:core`. Expected: the line above and the JSON file. Paste the real line into the ledger.
- [ ] **Step 6: Write `packages/core/README.md`.** Cover:
  - what it is;
  - install (`npm i pricing-rules-core`, marked "not yet published");
  - a 15-line usage example with `validateRuleSet` + `evaluate`;
  - the pipeline order and precedence (link ADR 0003 by its relative GitHub path `../../docs/adr/0003-evaluation-pipeline-and-precedence.md`);
  - the guarantees, each pointing to its property test;
  - the benchmark line read from `core-latest.json`.
- [ ] **Step 7: Commit**: `build(core): make pricing-rules-core publish-ready and add evaluate micro-benchmark` (include `bench/results/core-latest.json`).

---

### Task 8: functions package: keys, stream helpers, filters, table definition, clients

**Files:**
- Create: `packages/functions/package.json`, `tsconfig.json`, `vitest.config.ts`, `vitest.int.config.ts`
- Create: `src/index.ts`, `src/keys.ts`, `src/stream.ts`, `src/filters.ts`, `src/table-def.ts`, `src/clients.ts`
- Tests: `test/keys.test.ts`, `test/stream.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // keys.ts
  export class InvalidSkuError extends Error {}
  export const SKU_RE = /^[A-Za-z0-9-]{1,64}$/;
  export function assertSku(sku: string): void;               // throws InvalidSkuError
  export function skuPk(sku: string): string;                  // 'SKU#'+sku, validates
  export function histPk(sku: string): string;                 // 'HIST#'+sku
  export function histSk(inputsVersion: number, ruleSetVersion: number): string; // `v${iv}#r${rv}`
  export function ruleSetPk(id: string): string;               // 'RULESET#'+id
  export const SK = { META: 'META', OVERRIDE: 'OVERRIDE', PRICE_CURRENT: 'PRICE#CURRENT', ACTIVE: 'ACTIVE' } as const;
  export function inputSk(source: InputSource): string;        // 'INPUT#'+source
  export function ruleSetVersionSk(v: number): string;         // 'v'+v
  export function categoryPk(category: string): string;        // 'CATEGORY#'+category
  // stream.ts  (types from @types/aws-lambda: DynamoDBRecord, DynamoDBStreamEvent, DynamoDBBatchResponse)
  export function recordKeys(r: DynamoDBRecord): { PK: string; SK: string } | undefined;
  export function recordSku(r: DynamoDBRecord): string | undefined;      // from PK 'SKU#x' only
  export function newImage<T = Record<string, unknown>>(r: DynamoDBRecord): T | undefined; // unmarshall
  export function oldImage<T = Record<string, unknown>>(r: DynamoDBRecord): T | undefined;
  // filters.ts (EventBridge-style patterns, shared by CDK and the local runner)
  export const RECOMPUTE_FILTERS: ReadonlyArray<Record<string, unknown>>;
  //   [ { dynamodb: { Keys: { SK: { S: [ { prefix: 'INPUT#' } ] } } } },
  //     { dynamodb: { Keys: { SK: { S: [ 'OVERRIDE' ] } } } } ]
  export const PUBLISHER_FILTERS: ReadonlyArray<Record<string, unknown>>;
  //   [ { eventName: ['INSERT', 'MODIFY'], dynamodb: { Keys: { SK: { S: [ 'PRICE#CURRENT' ] } } } } ]
  // table-def.ts
  export const GSI1 = 'GSI1';
  export function pricingTableInput(tableName: string): CreateTableCommandInput; // PK/SK S, GSI1 (GSI1PK/GSI1SK, ALL), PAY_PER_REQUEST, stream NEW_AND_OLD_IMAGES
  export async function ensureTable(client: DynamoDBClient, tableName: string): Promise<{ streamArn: string }>; // create if missing, wait ACTIVE (poll DescribeTable 200ms, max 30s), best-effort UpdateTimeToLive('ttl') ignoring errors
  // clients.ts
  export interface DynamoClients { ddb: DynamoDBClient; doc: DynamoDBDocumentClient; streams: DynamoDBStreamsClient }
  export function createDynamoClients(opts?: { endpoint?: string; region?: string }): DynamoClients;
  //   with endpoint: credentials {accessKeyId:'local', secretAccessKey:'local'}, region default 'us-east-1';
  //   doc marshallOptions { removeUndefinedValues: true, convertClassInstanceToMap: false }
  ```
- `package.json`:
  - deps: `pricing-rules-core: workspace:*`, the AWS SDK packages at their pins, `@smithy/signature-v4`, `@aws-crypto/sha256-js`;
  - devDeps: vitest, typescript, @types/node, @types/aws-lambda, esbuild, tsx;
  - scripts: `typecheck`, `test` (`vitest run`), `test:int` (`vitest run --config vitest.int.config.ts`).
- `vitest.int.config.ts`: `include: ['test/**/*.int.test.ts']`, `env: { PRICING_INTEGRATION: '1' }`, `testTimeout: 30000`, `hookTimeout: 30000`, `fileParallelism: false`.

- [ ] **Step 1: Failing tests.**
  - `keys.test.ts`:
    - `skuPk('A-1') === 'SKU#A-1'`;
    - each of `'a#b'`, `'a b'`, `''`, `'x'.repeat(65)` throws `InvalidSkuError`;
    - `histSk(10, 2) === 'v10#r2'`;
    - `inputSk('COST') === 'INPUT#COST'`.
  - `stream.test.ts` builds records with marshalled images (use `marshall` from `@aws-sdk/util-dynamodb`):
    - `recordSku` returns `'A1'` for PK `SKU#A1` and `undefined` for `RULESET#x` and `HIST#A1`;
    - `newImage` unmarshalls numbers to JS numbers;
    - `oldImage` returns `undefined` on INSERT.
- [ ] **Step 2: Run them and see them fail.** `pnpm install` first.
- [ ] **Step 3: Implement.** `recordSku` must also run `SKU_RE` on the extracted SKU and return `undefined` if it does not match. That way a hostile key in the table cannot reach the store.
- [ ] **Step 4: Run.** `pnpm --filter @pricing-engine/functions test 2>&1 | tail -n 5` → pass. Run `pnpm typecheck`.
- [ ] **Step 5: Commit**: `feat(functions): add key helpers, stream decoding, shared filters and table definition`

---

### Task 9: Recompute handler over a `PricingStore` port

**Files:** Create `packages/functions/src/store.ts`, `src/recompute.ts`, `test/support/memory-store.ts`, `test/support/events.ts`. Test `test/recompute.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  // store.ts
  export interface SkuMeta { name: string; category: string; currency: string; ruleSetId: string }
  export interface CurrentPrice { priceMinor: number; inputsVersion: number; ruleSetVersion: number; computedAt: string }
  export interface SkuState { sku: string; meta: SkuMeta; inputs: Inputs; override?: Override; current?: CurrentPrice }
  export type PricedDecision = Extract<PriceDecision, { kind: 'PRICE' }>;
  export interface PriceWrite { sku: string; meta: SkuMeta; ruleSetId: string; decision: PricedDecision; computedAt: string; ttlEpochSeconds: number }
  export type WriteResult = 'WRITTEN' | 'STALE';
  export interface PricingStore {
    loadSku(sku: string): Promise<SkuState | undefined>;              // undefined when META is missing
    loadActiveRuleSet(ruleSetId: string): Promise<RuleSet>;          // throws InvalidRuleSetError / RuleSetNotFoundError
    writePrice(w: PriceWrite): Promise<WriteResult>;
  }
  export class RuleSetNotFoundError extends Error {}
  export function isNewer(a: { inputsVersion: number; ruleSetVersion: number }, b: { inputsVersion: number; ruleSetVersion: number }): boolean; // a > b lexicographically
  // recompute.ts
  export type RecomputeOutcome = 'WRITTEN' | 'STALE' | 'NO_META' | 'NO_PRICE';
  export interface RecomputeDeps { store: PricingStore; now: () => number; log?: (entry: Record<string, unknown>) => void }
  export async function recomputeSku(sku: string, deps: RecomputeDeps): Promise<RecomputeOutcome>;
  export function createRecomputeHandler(deps: RecomputeDeps): (event: DynamoDBStreamEvent) => Promise<DynamoDBBatchResponse>;
  ```
- `recomputeSku`:
  1. load the state; with no META → `NO_META`;
  2. load the rule set by `meta.ruleSetId`;
  3. `evaluate({ inputs, override, previousPriceMinor: current?.priceMinor, ruleSet, now: deps.now() })`;
  4. `NO_PRICE` → log and return `NO_PRICE`;
  5. if `current` exists and `!isNewer(decision, current)` → return `STALE` without writing;
  6. otherwise `writePrice({ ..., computedAt: new Date(now).toISOString(), ttlEpochSeconds: Math.floor(now / 1000) + 30 * 86400 })`;
  7. log one JSON line `{ msg: 'recompute', sku, outcome, priceMinor, inputsVersion, ruleSetVersion, trace }`.
- Handler:
  - group `event.Records` by `recordSku` (records with no SKU are logged and acked);
  - call `recomputeSku` once per SKU, sequentially, in first-seen order;
  - if it throws, add `{ itemIdentifier: r.dynamodb!.SequenceNumber! }` for **every** record of that SKU;
  - return `{ batchItemFailures }`;
  - the default `log` is `(e) => console.log(JSON.stringify(e))`.
- `MemoryStore` (test support) implements `PricingStore` with Maps and the **same** version condition as ADR 0004. It exposes `history: PriceWrite[]`, `failNextWrite(err)` and `setRuleSet(rs)`.
- `events.ts`: `inputRecord(sku, source, seqNo: string, eventName = 'MODIFY'): DynamoDBRecord` and `priceRecord(sku, oldPrice | undefined, newPrice, seqNo)`.

- [ ] **Step 1: Failing tests (`recompute.test.ts`)**:
  - (a) one INPUT record for a SKU with COST/COMPETITOR → `WRITTEN`, MemoryStore current price = the evaluate result, history length 1, empty `batchItemFailures`;
  - (b) the same event delivered 3 times → history still 1 (the second and third return `STALE` before writing);
  - (c) three records for the same SKU in one batch → exactly one `writePrice` call;
  - (d) SKU without META → acked, no write;
  - (e) **Review Focus 3:** COST 0 → `NO_PRICE`, no write, not in failures;
  - (f) store throws `new Error('throttled')` for SKU B in a batch with SKUs A and B → failures contain exactly B's two sequence numbers, and A is written;
  - (g) the rule set loader throws `InvalidRuleSetError` → that SKU's records are in failures;
  - (h) a `RULESET#x` record (no SKU) → acked, no load;
  - (i) the log receives a `recompute` entry with a `trace` array.
- [ ] **Step 2: Run and fail. Step 3: Implement. Step 4: Run and pass** (`pnpm --filter @pricing-engine/functions test 2>&1 | tail -n 5`).
- [ ] **Step 5: Commit**: `feat(functions): add recompute stream handler with per-SKU dedupe and batch item failures`

---

### Task 10: `DynamoDBStore` and integration tests on DynamoDB Local

**Files:** Create `packages/functions/src/ddb-store.ts`, `test/support/ddb.ts`. Tests: `test/ddb-store.int.test.ts`, `test/concurrency.int.test.ts`, `test/replay.int.test.ts`. Create root `docker-compose.yml` with only the `dynamodb` service for now.

**Interfaces:**
- Produces:
  ```ts
  export interface DynamoDBStoreOptions { doc: DynamoDBDocumentClient; tableName: string; now?: () => number; ruleSetCacheMs?: number /* default 30000 */ }
  export class DynamoDBStore implements PricingStore { constructor(opts: DynamoDBStoreOptions) }
  export function priceItem(w: PriceWrite): Record<string, unknown>;   // PRICE#CURRENT item (exported for tests and the local seed)
  // test/support/ddb.ts
  export const DDB_ENDPOINT: string; // process.env.PRICING_DDB_ENDPOINT ?? 'http://127.0.0.1:5360'
  export async function requireDynamoLocal(clients: DynamoClients): Promise<void>; // ListTables; on failure throw Error(`DynamoDB Local not reachable at ${DDB_ENDPOINT}. Start it with: docker compose up -d dynamodb`)
  export async function tempTable(clients: DynamoClients): Promise<{ name: string; streamArn: string; drop: () => Promise<void> }>; // `Pricing-test-${randomUUID().slice(0, 8)}`
  export async function seedSku(doc, table, sku, opts: { category?: string; cost?: number; competitor?: number; ruleSet?: RuleSet }): Promise<void>; // META + RULESET v<n> + ACTIVE (ruleSet defaults to the spec §6 'default' set) + an INPUT item at seq 1 only for each of cost/competitor that is given
  ```
- `docker-compose.yml` (start):
  ```yaml
  name: pricing-engine
  services:
    dynamodb:
      image: amazon/dynamodb-local:3.3.1
      container_name: pricing-engine-dynamodb
      command: ["-jar", "DynamoDBLocal.jar", "-sharedDb", "-inMemory"]
      ports: ["127.0.0.1:5360:8000"]
  ```
- `DynamoDBStore` behavior:
  - `loadSku`: a `Query` with `KeyConditionExpression: 'PK = :pk'`, `ConsistentRead: true`, paginated over `LastEvaluatedKey`. Map `META` → meta, `INPUT#X` → `inputs[X] = { value, seq }` (ignore unknown sources), `OVERRIDE` → override, `PRICE#CURRENT` → current.
  - `loadActiveRuleSet(id)`:
    - use the cache if it is fresh, keyed by id and holding `{ruleSet, version, loadedAt}`;
    - else `GetCommand` `RULESET#id/ACTIVE` (ConsistentRead) → `version`, then `RULESET#id/v<version>` → `ruleSet`;
    - a missing item → `RuleSetNotFoundError`;
    - `parseRuleSet(item.ruleSet)` → may throw `InvalidRuleSetError`;
    - also require `ruleSet.version === version` (else `InvalidRuleSetError` with pointer `/version`).
  - `writePrice`: `TransactWriteCommand` with
    - (1) a Put of `priceItem(w)` with the condition `attribute_not_exists(PK) OR inputsVersion < :v OR (inputsVersion = :v AND ruleSetVersion < :r)`;
    - (2) a Put of the history item `{ PK: histPk, SK: histSk, ...same fields minus GSI1PK/GSI1SK, ttl }` with the condition `attribute_not_exists(PK)`.

    A `TransactionCanceledException` whose `CancellationReasons` contains `Code === 'ConditionalCheckFailed'` → `'STALE'`. Rethrow anything else.
  - `priceItem` fields: `PK, SK: 'PRICE#CURRENT', sku, category, currency, priceMinor, inputsVersion, ruleSetId, ruleSetVersion, floorMinor: band.floor, ceilingMinor: band.ceiling, decisionTrace: trace, computedAt, GSI1PK: categoryPk(category), GSI1SK: skuPk(sku)`.

- [ ] **Step 1: Start DynamoDB Local.** `docker compose up -d dynamodb`, then `docker ps --filter name=pricing-engine-dynamodb --format "{{.Names}} {{.Ports}}"`. Expected: `pricing-engine-dynamodb 127.0.0.1:5360->8000/tcp`.
- [ ] **Step 2: Failing integration tests** (each file: `describe.skipIf(process.env.PRICING_INTEGRATION !== '1')`, `beforeAll(requireDynamoLocal + tempTable)`, `afterAll(drop)`):
  - `ddb-store.int.test.ts`:
    - after `seedSku`, `loadSku` returns meta + inputs, and `undefined` for an unknown SKU;
    - `loadActiveRuleSet` returns the rule set and the second call within 30 s does not hit DynamoDB (spy on `doc.send` call count);
    - an invalid `ruleSet` map in the table (e.g. `defaultMarkupBps: 1.5`) throws `InvalidRuleSetError` (**Review Focus 4**);
    - a missing ACTIVE throws `RuleSetNotFoundError`.
  - `concurrency.int.test.ts`: build `PriceWrite`s with decisions at (10, r1) and (11, r1) on two fresh SKUs:
    - order 10 then 11 → `['WRITTEN','WRITTEN']`, final current `inputsVersion 11`;
    - order 11 then 10 → `['WRITTEN','STALE']`, final 11;
    - (11, r1) then (11, r1) again → second `STALE`;
    - (11, r1) then (11, r2) → `WRITTEN`;
    - (11, r2) then (11, r1) → `STALE`;
    - the HIST# item count equals the number of `WRITTEN`;
    - fire 10 `writePrice` calls concurrently with versions 1..10 in shuffled order via `Promise.all` → final current `inputsVersion 10`.
  - `replay.int.test.ts`: seed a SKU, build a 3-record event (`events.ts`) and call `createRecomputeHandler({ store: DynamoDBStore, now })` three times → `Query HIST#<sku>` count is 1, and `PRICE#CURRENT.computedAt` is identical after runs 2 and 3.
- [ ] **Step 3: Run and fail.** `pnpm --filter @pricing-engine/functions test:int 2>&1 | tail -n 15`
- [ ] **Step 4: Implement `ddb-store.ts`** and re-run until it passes. Also run `pnpm --filter @pricing-engine/functions test` (unit; int files are excluded) and confirm it does not need Docker.
- [ ] **Step 5: Prove the skip path.** `docker compose stop dynamodb`, then `pnpm --filter @pricing-engine/functions exec vitest run test/replay.int.test.ts --config vitest.config.ts 2>&1 | tail -n 3` → `No test files found` or `skipped`, exit 0. Then `pnpm --filter @pricing-engine/functions test:int 2>&1 | grep -m1 "not reachable"` → the BLOCKER message. Then `docker compose up -d dynamodb`. Record both outputs in the ledger.
- [ ] **Step 6: Commit**: `feat(functions): add DynamoDB store with versioned transactional price writes`

---

### Task 11: Publisher handler and the two publishers

**Files:** Create `packages/functions/src/publisher.ts`, `src/appsync-publisher.ts`, `src/shim-publisher.ts`. Tests: `test/publisher.test.ts`, `test/appsync-publisher.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  export interface PriceMessage { sku: string; priceMinor: number; currency: string; inputsVersion: number; ruleSetVersion: number; computedAt: string }
  export interface PricePublisher { publish(msg: PriceMessage): Promise<void> }
  export const PUBLISH_PRICE_MUTATION = 'mutation PublishPrice($input: PriceInput!) { publishPrice(input: $input) { sku priceMinor currency inputsVersion ruleSetVersion computedAt } }';
  export function createPublisherHandler(deps: { publisher: PricePublisher; log?: (e: Record<string, unknown>) => void }): (event: DynamoDBStreamEvent) => Promise<DynamoDBBatchResponse>;
  export class AppSyncPublisher implements PricePublisher {
    constructor(opts: { url: string; region: string; credentials?: AwsCredentialIdentity | AwsCredentialIdentityProvider; fetch?: typeof fetch });
  }
  export class ShimPublisher implements PricePublisher { constructor(opts: { url: string; token: string; fetch?: typeof fetch }) }
  export class PublishError extends Error {}
  ```
- Publisher handler, per record in order:
  - skip unless `eventName` is INSERT or MODIFY and the SK is `PRICE#CURRENT`;
  - `n = newImage`, `o = oldImage`; if `o && o.priceMinor === n.priceMinor` → skip (`UNCHANGED`);
  - else `publish(pick(n))`;
  - on a throw, add that record's sequence number to `batchItemFailures` and continue;
  - log `{msg:'publish', sku, outcome}`.
- `AppSyncPublisher.publish`:
  - `const u = new URL(url)`;
  - `signer = new SignatureV4({ service: 'appsync', region, credentials: this.credentials ?? defaultProvider(), sha256: Sha256 })` with `defaultProvider` from `@aws-sdk/credential-provider-node` and `Sha256` from `@aws-crypto/sha256-js`;
  - `signed = await signer.sign({ method: 'POST', protocol: u.protocol, hostname: u.hostname, path: u.pathname, headers: { host: u.hostname, 'content-type': 'application/json' }, body })`;
  - `res = await fetch(url, { method: 'POST', headers: signed.headers, body })`;
  - if `!res.ok` or the JSON has `errors` → throw `PublishError` with the status and the joined messages.
- `ShimPublisher` does the same with headers `{ 'content-type': 'application/json', 'x-pricing-publish-token': token }`.

- [ ] **Step 1: Failing tests.**
  - `publisher.test.ts`:
    - INSERT → published once with exactly the 6 fields (no `decisionTrace`, no GSI keys);
    - MODIFY with the same `priceMinor` → not published;
    - MODIFY with a changed price → published;
    - REMOVE → skipped;
    - publisher throws for record 2 of 3 → failures = [seq2], records 1 and 3 published;
    - replaying the same MODIFY event 3 times → published 3 times (ADR 0004 prevents the replay upstream; this test documents that the publisher itself is at-least-once).
  - `appsync-publisher.test.ts`: with credentials `{ accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' }` and a fake fetch capturing `(url, init)`:
    - `init.headers.authorization` starts with `AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/` and contains `/eu-west-1/appsync/aws4_request`;
    - `x-amz-date` exists;
    - `host` is the URL host;
    - the body JSON has `query === PUBLISH_PRICE_MUTATION` and `variables.input.sku`;
    - a response `{ errors: [{ message: 'Unauthorized' }] }` makes `publish` reject with `PublishError` matching `/Unauthorized/`;
    - the ShimPublisher sends `x-pricing-publish-token`.
- [ ] **Step 2: Run and fail. Step 3: Implement. Step 4: Run and pass.**
- [ ] **Step 5: Commit**: `feat(functions): add price publisher handler with SigV4 AppSync and local shim publishers`

---

### Task 12: Lambda entrypoints and esbuild bundles

**Files:** Create `packages/functions/src/lambda/recompute.ts`, `src/lambda/publisher.ts`, `scripts/bundle.mjs`. Test `test/bundle.test.ts`. Modify `package.json` (`"bundle": "node scripts/bundle.mjs"`, `"build": "node scripts/bundle.mjs"`) and root `package.json`.

**Interfaces:**
- Produces `packages/functions/dist/recompute/index.mjs` and `dist/publisher/index.mjs`, each exporting `handler`.
- `lambda/recompute.ts`:
  ```ts
  import { createDynamoClients } from '../clients.js';
  import { DynamoDBStore } from '../ddb-store.js';
  import { createRecomputeHandler } from '../recompute.js';
  const tableName = process.env.TABLE_NAME;
  if (!tableName) throw new Error('TABLE_NAME is required');
  const { doc } = createDynamoClients();
  export const handler = createRecomputeHandler({ store: new DynamoDBStore({ doc, tableName }), now: () => Date.now() });
  ```
- `lambda/publisher.ts`: requires `APPSYNC_URL` and `AWS_REGION` and exports `createPublisherHandler({ publisher: new AppSyncPublisher({ url, region }) })`.
- `scripts/bundle.mjs`: esbuild `build` for both entries with `bundle: true, platform: 'node', target: 'node24', format: 'esm'`, `outfile: dist/<name>/index.mjs`, `external: ['@aws-sdk/*', '@smithy/*', '@aws-crypto/*']`, `banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" }`, `minify: false`, `sourcemap: false`, `metafile: true`. Print `bundled <name>: <bytes> bytes` for each.
  - Note: the Node 24 Lambda runtime ships AWS SDK v3, including `@smithy/signature-v4` and `@aws-crypto/sha256-js` as SDK dependencies. If you are unsure whether `@aws-sdk/credential-provider-node` is provided, **bundle it**: only `@aws-sdk/client-*`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/util-dynamodb` and `@smithy/*` stay external. Record the final list as a `Ruling:`.

- [ ] **Step 1: Failing test `bundle.test.ts`.**
  - `beforeAll` runs `node scripts/bundle.mjs` via `execFileSync(process.execPath, ['scripts/bundle.mjs'], { cwd: pkgDir })`;
  - asserts both files exist and are under 1 MB, and that no `pricing-rules-core` import specifier remains in the output (the core is inlined): `expect(text).not.toMatch(/from ['"]pricing-rules-core['"]/)`;
  - sets `process.env.TABLE_NAME = 'T'`, imports `dist/recompute/index.mjs` with `pathToFileURL`, and expects `typeof mod.handler === 'function'`;
  - sets `APPSYNC_URL = 'https://example.appsync-api.eu-west-1.amazonaws.com/graphql'` and `AWS_REGION = 'eu-west-1'` and does the same for the publisher.
- [ ] **Step 2: Run and fail. Step 3: Implement. Step 4: Run and pass**, then `pnpm build 2>&1 | tail -n 5` → two `bundled` lines.
- [ ] **Step 5: Commit**: `build(functions): bundle recompute and publisher Lambdas with esbuild`

---

### Task 13: GraphQL SDL and APPSYNC_JS resolvers

**Files:**
- Create: `packages/api/package.json`, `tsconfig.json`, `vitest.config.ts`, `schema.graphql`, `src/index.ts`, `src/appsync-utils-shim.js`
- Create: `resolvers/Query.price.js`, `resolvers/Query.decision.js`, `resolvers/Query.pricesByCategory.js`, `resolvers/Mutation.putInput.js`, `resolvers/Mutation.publishPrice.js`
- Tests: `test/schema.test.ts`, `test/resolvers.test.ts`

**Interfaces:**
- Produces from `@pricing-engine/api`:
  ```ts
  export const schemaPath: string;                       // absolute path to schema.graphql
  export const RESOLVERS: ReadonlyArray<{ typeName: 'Query' | 'Mutation'; fieldName: string; file: string; dataSource: 'TABLE' | 'NONE' }>;
  export function resolverPath(typeName: string, fieldName: string): string;
  export const LOCAL_PRELUDE: string;                    // scalar + directive declarations AppSync provides implicitly
  export function loadSdl(): string;                     // readFileSync(schemaPath)
  ```
  The package `exports`: `"."` → `./src/index.ts`, `"./appsync-utils-shim"` → `./src/appsync-utils-shim.js`, `"./schema.graphql"` → `./schema.graphql`, `"./resolvers/*"` → `./resolvers/*`.
- `schema.graphql`:
  ```graphql
  schema { query: Query mutation: Mutation subscription: Subscription }

  enum InputSource { COST COMPETITOR INVENTORY DEMAND }

  type Price @aws_cognito_user_pools @aws_iam {
    sku: ID!
    priceMinor: Int!
    currency: String!
    inputsVersion: Int!
    ruleSetVersion: Int!
    computedAt: AWSDateTime!
  }

  type TraceStep { ruleId: String! beforeMinor: Int! afterMinor: Int! note: String }
  type Decision { price: Price! trace: [TraceStep!]! }

  input PriceInput { sku: ID! priceMinor: Int! currency: String! inputsVersion: Int! ruleSetVersion: Int! computedAt: AWSDateTime! }

  type Query {
    price(sku: ID!): Price
    decision(sku: ID!): Decision
    pricesByCategory(category: String!, limit: Int): [Price!]!
  }

  type Mutation {
    putInput(sku: ID!, source: InputSource!, value: Int!, seq: Int!): Boolean! @aws_cognito_user_pools(cognito_groups: ["admin"])
    publishPrice(input: PriceInput!): Price @aws_iam
  }

  type Subscription {
    onPriceChanged(sku: ID!): Price @aws_subscribe(mutations: ["publishPrice"])
  }
  ```
- `LOCAL_PRELUDE`:
  ```graphql
  scalar AWSDateTime
  directive @aws_iam on FIELD_DEFINITION | OBJECT
  directive @aws_cognito_user_pools(cognito_groups: [String]) on FIELD_DEFINITION | OBJECT
  directive @aws_subscribe(mutations: [String!]!) on FIELD_DEFINITION
  ```
- `appsync-utils-shim.js` (ESM, plain JS):
  ```js
  import { marshall } from '@aws-sdk/util-dynamodb';
  export class AppSyncError extends Error { constructor(message, type) { super(message); this.type = type; } }
  export const util = {
    error(message, type) { throw new AppSyncError(message, type); },
    matches(pattern, value) { return new RegExp(pattern).test(String(value)); },
    time: { nowISO8601: () => new Date().toISOString() },
    dynamodb: { toMapValues: (obj) => marshall(obj, { removeUndefinedValues: true }) },
  };
  export const runtime = { earlyReturn(value) { const e = new Error('earlyReturn'); e.earlyReturn = value; throw e; } };
  ```
- Resolver contracts. Use only `util.*`; no regex literals, no try/for/while/throw.
  - `Query.price`: request `{ operation: 'GetItem', key: util.dynamodb.toMapValues({ PK: 'SKU#' + sku, SK: 'PRICE#CURRENT' }), consistentRead: true }`. Response: `null` if `!ctx.result`, else the 6 Price fields. Invalid sku → `util.error('invalid sku', 'BadRequest')`.
  - `Query.decision`: the same GetItem. Response: `null` or `{ price: {6 fields}, trace: ctx.result.decisionTrace ?? [] }`.
  - `Query.pricesByCategory`: `limit` defaults to 50; `limit < 1 || limit > 100` → `util.error('limit must be 1..100', 'BadRequest')`. Request `{ operation: 'Query', index: 'GSI1', query: { expression: 'GSI1PK = :pk', expressionValues: util.dynamodb.toMapValues({ ':pk': 'CATEGORY#' + category }) }, limit }`. Response: `ctx.result.items.map(...)` with the 6 fields.
  - `Mutation.putInput`:
    - validate the sku with `util.matches('^[A-Za-z0-9-]{1,64}$', sku)` and `seq >= 1`, else `util.error(..., 'BadRequest')`;
    - request PutItem with key `{PK, SK: 'INPUT#' + source}`, attributeValues `{ value, seq, observedAt: util.time.nowISO8601() }`, condition `{ expression: 'attribute_not_exists(SK) OR #seq < :seq', expressionNames: { '#seq': 'seq' }, expressionValues: util.dynamodb.toMapValues({ ':seq': seq }) }`;
    - response: `ctx.error?.type === 'DynamoDB:ConditionalCheckFailedException'` → `false`; any other `ctx.error` → `util.error(ctx.error.message, ctx.error.type)`; else `true`.
  - `Mutation.publishPrice` (NONE): request `{ payload: ctx.args.input }`, response `ctx.result`.
- `vitest.config.ts`: `resolve: { alias: { '@aws-appsync/utils': fileURLToPath(new URL('./src/appsync-utils-shim.js', import.meta.url)) } }`.
- deps: `@aws-sdk/util-dynamodb`. devDeps: `@aws-appsync/utils` (types for editors), `graphql`, vitest, typescript, @types/node. tsconfig: `allowJs: true, checkJs: false`, include `src`, `test`.

- [ ] **Step 1: Failing tests.**
  - `schema.test.ts`:
    - `buildSchema(LOCAL_PRELUDE + loadSdl())` succeeds;
    - every field named `priceMinor|beforeMinor|afterMinor|inputsVersion|ruleSetVersion` has named type `Int`, walking all object and input types;
    - the SDL text matches `/publishPrice\(input: PriceInput!\): Price @aws_iam\s*$/m` and `publishPrice` has no `@aws_cognito_user_pools`;
    - `RESOLVERS` covers exactly the 5 resolver files, and each `resolverPath` exists on disk.
  - `resolvers.test.ts`: import each resolver module and call `request`/`response` with fake `ctx` objects:
    - `putInput.request` with a valid sku has the exact key/condition shape (`{"PK":{"S":"SKU#A1"},"SK":{"S":"INPUT#COST"}}`, and `condition.expressionValues[":seq"]` is `{N:"3"}`);
    - **Review Focus 2:** `sku: 'a#b'`, `''` and 65 characters → throws `AppSyncError` with type `BadRequest`; `seq: 0` → BadRequest;
    - **Review Focus 1:** `putInput.response` with `ctx.error.type 'DynamoDB:ConditionalCheckFailedException'` → `false`; with no error → `true`; with `{type:'DynamoDB:ProvisionedThroughputExceededException'}` → throws;
    - `price.response({result: undefined})` → `null`, and with a full item it returns exactly the 6 fields (no GSI keys, no trace);
    - `decision.response` maps the trace;
    - `pricesByCategory.request` with `limit: 101` → BadRequest, with no limit → 50;
    - `publishPrice` round-trips the input.
- [ ] **Step 2: Run and fail. Step 3: Implement. Step 4: Run and pass.**
- [ ] **Step 5: Lint gate.** `pnpm lint 2>&1 | tail -n 5` → clean. Prove the AppSync rule fires: temporarily add `for (let i = 0; i < 1; i++) {}` to `Query.price.js`, run `pnpm lint 2>&1 | grep -c "@aws-appsync/no-for"` → `1`, then revert. Record it in the ledger.
- [ ] **Step 6: Commit**: `feat(api): add GraphQL schema and APPSYNC_JS resolvers with unit tests`

---

### Task 14: CDK stack and assertion tests

**Files:**
- Create: `infra/package.json`, `infra/tsconfig.json`, `infra/vitest.config.ts`, `infra/cdk.json`
- Create: `infra/src/pricing-stack.ts`, `infra/src/app.ts`, `infra/bin/app.ts`
- Tests: `infra/test/esm.test.ts`, `infra/test/appsync.test.ts`, `infra/test/iam.test.ts`

**Interfaces:**
- Consumes: `RECOMPUTE_FILTERS`, `PUBLISHER_FILTERS` from `@pricing-engine/functions`; `schemaPath`, `RESOLVERS`, `resolverPath` from `@pricing-engine/api`; bundles at `packages/functions/dist/{recompute,publisher}`.
- Produces:
  ```ts
  export interface PricingStackProps extends StackProps { functionsDistDir?: string }
  export class PricingStack extends Stack { readonly table: TableV2; readonly api: GraphqlApi; readonly recompute: Function; readonly publisher: Function }
  export function buildApp(opts?: { nag?: boolean }): { app: App; stack: PricingStack }  // src/app.ts; nag defaults to true (Task 15 adds it)
  ```
- Stack contents:
  - **Table:** `TableV2` `Pricing` with PK/SK strings, `dynamoStream: NEW_AND_OLD_IMAGES`, `timeToLiveAttribute: 'ttl'`, `globalSecondaryIndexes: [{ indexName: 'GSI1', partitionKey GSI1PK S, sortKey GSI1SK S }]`, `pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true }`, `removalPolicy: DESTROY`.
  - **DLQs:** two `Queue`s, `RecomputeDlq` and `PublisherDlq`, with `enforceSSL: true` and `retentionPeriod: Duration.days(14)`.
  - **recompute:** `Function` with `Runtime.NODEJS_24_X`, `Architecture.ARM_64`, `Code.fromAsset(join(dist,'recompute'))`, handler `index.handler`, memory 512, timeout 30 s, env `TABLE_NAME`, `addToRolePolicy(new PolicyStatement({ actions: ['dynamodb:Query','dynamodb:GetItem','dynamodb:PutItem','dynamodb:ConditionCheckItem'], resources: [table.tableArn] }))`.
  - **publisher:** the same settings with `Code.fromAsset(join(dist,'publisher'))`, env `APPSYNC_URL: api.graphqlUrl`, and `api.grantMutation(publisher, 'publishPrice')`.
  - **Event sources** (both): `new DynamoEventSource(table, { startingPosition: LATEST, batchSize: 100, bisectBatchOnError: true, retryAttempts: 3, reportBatchItemFailures: true, onFailure: new SqsDlq(dlq), filters: FILTERS.map((f) => FilterCriteria.filter(f as Record<string, unknown>)) })`.
  - **Cognito:** `UserPool` with `selfSignUpEnabled: false`, `passwordPolicy: { minLength: 12, requireDigits/Lowercase/Uppercase/Symbols: true }`, `mfa: Mfa.OPTIONAL`, `mfaSecondFactor: { otp: true, sms: false }`, plus `CfnUserPoolGroup` `admin`.
  - **AppSync:** `GraphqlApi` `pricing-engine` with `definition: Definition.fromFile(schemaPath)`, `authorizationConfig: { defaultAuthorization: { authorizationType: USER_POOL, userPoolConfig: { userPool } }, additionalAuthorizationModes: [{ authorizationType: IAM }] }`, `logConfig: { fieldLogLevel: FieldLogLevel.ERROR, retention: RetentionDays.ONE_MONTH }`, `xrayEnabled: true`. Data sources: `api.addDynamoDbDataSource('TableDs', table)` and `api.addNoneDataSource('NoneDs')`. For each `RESOLVERS` entry, `ds.createResolver(id, { typeName, fieldName, runtime: FunctionRuntime.JS_1_0_0, code: Code.fromAsset(resolverPath(...)) })`.
  - **Outputs:** `GraphqlUrl`, `TableName`.
- `infra/cdk.json`: `{ "app": "tsx bin/app.ts", "output": "cdk.out" }`.
- `infra/package.json` scripts:
  - `"test": "pnpm --filter @pricing-engine/functions bundle && vitest run"`;
  - `"synth": "pnpm --filter @pricing-engine/functions bundle && cdk synth --no-notices -q"`;
  - `"typecheck": "tsc -p tsconfig.json --noEmit"`.

  deps: aws-cdk-lib, constructs, cdk-nag, the workspace packages. devDeps: aws-cdk, tsx, vitest, typescript, @types/node.

- [ ] **Step 1: Failing tests.** Use `Template.fromStack(buildApp({ nag: false }).stack)`.
  - `esm.test.ts`:
    - exactly 2 `AWS::Lambda::EventSourceMapping`;
    - each has `BisectBatchOnFunctionError: true`, `MaximumRetryAttempts: 3`, `FunctionResponseTypes: ['ReportBatchItemFailures']`, `StartingPosition: 'LATEST'`, a `DestinationConfig.OnFailure.Destination`;
    - the recompute mapping's `FilterCriteria.Filters` patterns equal `RECOMPUTE_FILTERS.map((f) => JSON.stringify(f))` exactly, and the same for the publisher.
  - `appsync.test.ts`:
    - `AWS::AppSync::GraphQLApi` has `AuthenticationType: 'AMAZON_COGNITO_USER_POOLS'` and `AdditionalAuthenticationProviders: [{ AuthenticationType: 'AWS_IAM' }]`;
    - the schema `Definition` contains `publishPrice(input: PriceInput!): Price @aws_iam`;
    - 5 resolvers, all `Runtime: { Name: 'APPSYNC_JS', RuntimeVersion: '1.0.0' }`;
    - the `publishPrice` resolver's DataSourceName refers to the NONE data source;
    - 2 Lambda functions on `nodejs24.x` / `arm64` (filter by `Handler: 'index.handler'`; there may be a LogRetention helper function).
  - `iam.test.ts`:
    - walk every `AWS::IAM::Policy` and `AWS::IAM::Role` inline policy statement; no `Action` string contains `*`;
    - the publisher role's policy has `appsync:GraphQL` with a resource ending in `/types/Mutation/fields/publishPrice` (stringify the `Fn::Join` and match);
    - the recompute role has no `dynamodb:Scan` and no `dynamodb:DeleteItem`.
- [ ] **Step 2: Run and fail. Step 3: Implement. Step 4: Run and pass** (`pnpm --filter @pricing-engine/infra test 2>&1 | tail -n 8`).
- [ ] **Step 5: Commit**: `feat(infra): add CDK stack with streams, Lambdas, DLQs and AppSync API`

---

### Task 15: cdk-nag gate and `pnpm synth`

**Files:** Create `infra/src/nag-acknowledgements.ts`, `infra/test/nag.test.ts`. Modify `infra/src/app.ts` and root `package.json` (`"synth": "pnpm --filter @pricing-engine/infra synth"`).

**Interfaces:** Produces `export function applyNagAcknowledgements(stack: PricingStack): void`. `buildApp({ nag: true })` calls `Validations.of(app).addPlugins(new AwsSolutionsChecks(app))` and then `applyNagAcknowledgements(stack)`.

- [ ] **Step 1: Failing test `nag.test.ts`**: `expect(() => buildApp({ nag: true }).app.synth()).not.toThrow()` (synth into a temp `outdir`: `new App({ outdir: mkdtempSync(...) })`, so make `buildApp` accept `outdir?`).
- [ ] **Step 2: Run it and read the findings.** `pnpm --filter @pricing-engine/infra exec vitest run test/nag.test.ts 2>&1 | grep -E "ERROR|WARNING|Acknowledge with" | sort | uniq | head -40`
- [ ] **Step 3: Fix first, acknowledge second.**
  - Fix what you can in the stack: e.g. `COG3` → `featurePlan: FeaturePlan.PLUS` with `standardThreatProtectionMode` (only if the property exists in 2.272.0, else acknowledge); `SQS3` on DLQs → acknowledge ("this queue is the DLQ").
  - Acknowledge the rest in `nag-acknowledgements.ts` with `Validations.of(scope).acknowledge({ id: '<exact id printed after "Acknowledge with">', reason: '<one honest sentence>' })`, at the narrowest scope (the construct, not the stack) where possible.
  - Expected leftovers seen at planning: `IAM4[Policy::...AWSLambdaBasicExecutionRole]` on both function roles, `IAM4[Policy::...AWSAppSyncPushToCloudWatchLogs]` on the API log role, `IAM5[Resource::*]` on the LogRetention helper, and `IAM5` on the AppSync table data-source role (`<TableArn>/index/*`).
  - **Never** acknowledge a finding on resources you wrote IAM for (recompute/publisher inline policies) without first trying to narrow it.
- [ ] **Step 4: Run and pass.** Then `pnpm synth 2>&1 | tail -n 5` → exit 0, and `ls infra/cdk.out/*.template.json` lists `PricingEngine.template.json`. Record in the ledger the number of acknowledgements and the resource counts: `node -e "const t=require('./infra/cdk.out/PricingEngine.template.json');const c={};for(const r of Object.values(t.Resources))c[r.Type]=(c[r.Type]||0)+1;console.log(JSON.stringify(c))"`.
- [ ] **Step 5: Commit**: `feat(infra): gate synth with cdk-nag AwsSolutions and documented acknowledgements`

---

### Task 16: local runner core: filter matcher and delivery semantics

**Files:** Create `packages/local/package.json`, `tsconfig.json`, `vitest.config.ts`, `vitest.int.config.ts`, `src/pattern.ts`, `src/deliver.ts`. Tests: `test/pattern.test.ts`, `test/deliver.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  // pattern.ts — the subset of EventBridge patterns used by RECOMPUTE_FILTERS/PUBLISHER_FILTERS
  export function matchesPattern(event: unknown, pattern: Record<string, unknown>): boolean;
  export function matchesAny(event: unknown, patterns: ReadonlyArray<Record<string, unknown>>): boolean;
  //  object  -> every key must match recursively; array -> event value equals any literal, or matches any {prefix} object;
  //  any other operator object (e.g. {numeric}, {exists}) -> throw Error('unsupported filter operator: <key>')
  // deliver.ts
  export interface DeliveryOptions { maxRetries: number /*3*/; bisectOnError: boolean /*true*/; onDeadLetter: (records: DynamoDBRecord[], reason: string) => Promise<void> }
  export type StreamHandler = (event: DynamoDBStreamEvent) => Promise<DynamoDBBatchResponse | void>;
  export async function deliver(records: DynamoDBRecord[], handler: StreamHandler, opts: DeliveryOptions): Promise<{ invocations: number; deadLettered: number }>;
  export function jsonlDeadLetter(filePath: string): DeliveryOptions['onDeadLetter']; // appends {at, reason, record} lines; mkdir -p
  ```
- `deliver` algorithm (write it exactly):
  ```
  deliverRange(records, attempt):
    if records empty: return
    invocations++
    try: res = await handler({ Records: records })
    catch e:
      if bisectOnError and records.length > 1: mid = ceil(len/2); deliverRange(first half, attempt); deliverRange(second half, attempt); return
      if attempt >= maxRetries: onDeadLetter(records, 'handler error: ' + e.message); return
      return deliverRange(records, attempt + 1)
    failures = res?.batchItemFailures ?? []
    if failures empty: return
    idx = min index i where records[i].dynamodb.SequenceNumber is in failures (unknown id -> idx 0)
    if attempt >= maxRetries: onDeadLetter(records.slice(idx), 'batchItemFailures after retries'); return
    return deliverRange(records.slice(idx), attempt + 1)
  ```
  This mirrors the Lambda ESM: retries restart at the lowest failed record, bisect splits on a thrown error, and after `maxRetries` retries the records are parked. A record is delivered at most `1 + maxRetries` times per bisect branch.

- [ ] **Step 1: Failing tests.**
  - `pattern.test.ts`, for each filter in `RECOMPUTE_FILTERS`/`PUBLISHER_FILTERS`:
    - an INPUT#COST record matches recompute and not publisher;
    - OVERRIDE matches recompute;
    - META matches neither;
    - PRICE#CURRENT MODIFY matches publisher, and REMOVE does not;
    - a `HIST#A1` record matches neither;
    - an unsupported operator `{ numeric: ['>', 1] }` throws.
  - `deliver.test.ts` with a scripted handler:
    - (a) success → 1 invocation;
    - (b) `batchItemFailures` on record 2 of 4 once → the second invocation gets records 2..4;
    - (c) always throws for a batch containing record X (poison) among 8 → after bisecting, only X is dead-lettered and the other 7 are delivered successfully (**Review Focus 4**);
    - (d) always returns a failure for record 1 → dead-lettered after exactly `1 + 3` invocations on that range;
    - (e) `jsonlDeadLetter` writes one JSON line per record into a temp file.
- [ ] **Step 2: Run and fail. Step 3: Implement. Step 4: Run and pass.**
- [ ] **Step 5: Commit**: `feat(local): emulate event source mapping filters, retries, bisect and DLQ`

---

### Task 17: local stream reader and runner

**Files:** Create `packages/local/src/env.ts`, `src/stream-reader.ts`, `src/runner.ts`. Tests: `test/stream-reader.test.ts`, `test/runner.int.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  // env.ts
  export const env: { ddbEndpoint: string; table: string; gqlUrl: string; publishToken: string; pollIntervalMs: number; dlqDir: string };
  //   PRICING_DDB_ENDPOINT ?? 'http://127.0.0.1:5360', PRICING_TABLE ?? 'Pricing', PRICING_GQL_URL ?? 'http://127.0.0.1:5361/graphql',
  //   PRICING_PUBLISH_TOKEN ?? 'local-dev-only', PRICING_POLL_MS ?? 250, PRICING_DLQ_DIR ?? '.dlq'
  // stream-reader.ts
  export interface StreamReaderOptions { streams: DynamoDBStreamsClient; streamArn: string; pollIntervalMs: number; startAt: 'TRIM_HORIZON' | 'LATEST'; discoverEveryMs?: number /* 5000 */ }
  export class StreamReader {
    constructor(opts: StreamReaderOptions);
    start(onRecords: (records: DynamoDBRecord[]) => Promise<void>): void;   // loop until stop()
    stop(): Promise<void>;                                                   // resolves after the current poll finishes
  }
  export function toLambdaRecord(r: _Record /* SDK */, streamArn: string): DynamoDBRecord; // eventSource 'aws:dynamodb', eventSourceARN, ApproximateCreationDateTime as epoch seconds
  // runner.ts
  export interface RunnerOptions { clients: DynamoClients; tableName: string; publisher: PricePublisher; pollIntervalMs: number; dlqDir: string; startAt?: 'TRIM_HORIZON' | 'LATEST'; now?: () => number; log?: (e: Record<string, unknown>) => void }
  export async function startRunner(opts: RunnerOptions): Promise<{ stop: () => Promise<void> }>;
  ```
- StreamReader loop:
  - DescribeStream (paginate `ExclusiveStartShardId`) and get iterators for open shards (`startAt`; default TRIM_HORIZON for local, because idempotency makes re-processing safe);
  - each poll calls `GetRecords` per shard (`Limit: 1000`), then `onRecords` with the shard's records converted by `toLambdaRecord`, in order;
  - a `NextShardIterator` of `undefined`/`null` means the shard closed: drop it and trigger discovery;
  - discovery every `discoverEveryMs` adds new shards with TRIM_HORIZON, but only when their `ParentShardId` is not still being read;
  - if any shard returned records, poll again immediately, else sleep `pollIntervalMs`;
  - catch and log transient errors (e.g. `ExpiredIteratorException` → re-acquire with `AFTER_SEQUENCE_NUMBER` of the last seen record, else TRIM_HORIZON), then sleep and continue.
- `startRunner`:
  - waits up to 60 s for `DescribeTable` to return a `LatestStreamArn` (retry every 1 s, so compose services can start in any order);
  - builds `recompute = createRecomputeHandler({ store: new DynamoDBStore({ doc, tableName }), now })` and `publish = createPublisherHandler({ publisher })`;
  - for each batch of records from one poll: `deliver(records.filter(r => matchesAny(r, RECOMPUTE_FILTERS)), recompute, { maxRetries: 3, bisectOnError: true, onDeadLetter: jsonlDeadLetter(join(dlqDir, 'recompute.jsonl')) })`, then the same for publisher with `PUBLISHER_FILTERS` and `publisher.jsonl`;
  - logs `runner started table=<t> stream=<arn> poll=<ms>ms`.

- [ ] **Step 1: Failing tests.**
  - `stream-reader.test.ts` with a fake `streams.send` that dispatches on the command class name:
    - (a) records from one shard arrive in order and the reader polls immediately after a non-empty response (count calls);
    - (b) when shard `s1` closes (`NextShardIterator: undefined`) and DescribeStream then lists `s2` with `ParentShardId: 's1'`, the records of `s2` are delivered after those of `s1`;
    - (c) idle polling waits about `pollIntervalMs` (use `vi.useFakeTimers()` or a 20 ms interval and assert at most 6 GetRecords calls in 100 ms);
    - (d) `stop()` resolves.
  - `runner.int.test.ts` (int; temp table; capture publisher):
    - seed META + rule set + COST/COMPETITOR inputs with `seedSku`, then start the runner with `startAt: 'TRIM_HORIZON'` and `pollIntervalMs: 50` → within 5 s `PRICE#CURRENT` exists, and within 5 s the capture publisher has received exactly 1 message whose `priceMinor` equals `evaluate(...)` for the seeded inputs;
    - write a new COMPETITOR value with seq 2 (PutCommand with the seq condition) → a second message;
    - write an INVENTORY change that leaves the price unchanged (INVENTORY 500 with the `default` rule set) → after 2 s no third message, and `PRICE#CURRENT.inputsVersion` was bumped (the publisher skipped an unchanged price);
    - stop the runner.
- [ ] **Step 2: Run and fail. Step 3: Implement. Step 4: Run and pass** (`pnpm --filter @pricing-engine/local test` and `pnpm --filter @pricing-engine/local test:int`).
- [ ] **Step 5: Commit**: `feat(local): poll DynamoDB Local streams and drive recompute and publisher handlers`

---

### Task 18: resolver runtime and GraphQL shim

**Files:** Create `packages/local/src/resolver-runtime.ts`, `src/shim.ts`. Test: `test/shim.int.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  // resolver-runtime.ts
  export interface LoadedResolver { request: (ctx: any) => any; response: (ctx: any) => any }
  export async function loadResolver(file: string): Promise<LoadedResolver>; // esbuild.build({ entryPoints: [file], bundle: true, format: 'esm', platform: 'node', write: false, alias: { '@aws-appsync/utils': fileURLToPath(import.meta.resolve('@pricing-engine/api/appsync-utils-shim')) } }), then import('data:text/javascript;base64,' + base64(outputFiles[0].text)). Mark NOTHING external: a data: URL module cannot resolve bare imports, so util-dynamodb must be inlined (verified at planning).
  export interface ResolverContext { ddb: DynamoDBClient; tableName: string }
  export async function runResolver(r: LoadedResolver, dataSource: 'TABLE' | 'NONE', args: Record<string, unknown>, rc: ResolverContext): Promise<unknown>;
  // shim.ts
  export interface ShimOptions { ddb: DynamoDBClient; tableName: string; publishToken: string; host: string; port: number /* 0 = random */ }
  export async function startShim(opts: ShimOptions): Promise<{ url: string; wsUrl: string; close: () => Promise<void> }>;
  ```
- `runResolver`:
  1. `ctx = { args, arguments: args, identity: null, source: null, stash: {}, prev: {}, request: { headers: {} } }`;
  2. `req = r.request(ctx)` (an `AppSyncError` propagates);
  3. for `NONE`: `ctx.result = req.payload`;
  4. for `TABLE`, switch on `req.operation`:
     - `GetItem` → `GetItemCommand({ TableName, Key: req.key, ConsistentRead: !!req.consistentRead })`, `ctx.result = Item ? unmarshall(Item) : undefined`;
     - `PutItem` → `PutItemCommand({ TableName, Item: { ...req.key, ...req.attributeValues }, ConditionExpression: req.condition?.expression, ExpressionAttributeNames: req.condition?.expressionNames, ExpressionAttributeValues: req.condition?.expressionValues })`, `ctx.result = unmarshall(Item)`;
     - `Query` → `QueryCommand({ TableName, IndexName: req.index, KeyConditionExpression: req.query.expression, ExpressionAttributeNames: req.query.expressionNames, ExpressionAttributeValues: req.query.expressionValues, Limit: req.limit, ScanIndexForward: req.scanIndexForward ?? true })`, `ctx.result = { items: Items.map(unmarshall), nextToken: null }`;
     - anything else → `throw new Error('shim: unsupported operation ' + op)`;
  5. a DynamoDB error sets `ctx.error = { message: e.message, type: 'DynamoDB:' + e.name }`;
  6. return `r.response(ctx)`.
- `startShim`:
  - loads `LOCAL_PRELUDE + loadSdl()` and all `RESOLVERS` once;
  - `createSchema({ typeDefs, resolvers })`. Query and Mutation fields map to `runResolver`, and an `AppSyncError` becomes `new GraphQLError(e.message, { extensions: { errorType: e.type } })`;
  - `Mutation.publishPrice` first checks `context.request.headers.get('x-pricing-publish-token') === publishToken`, else throws `GraphQLError('Unauthorized: publishPrice requires IAM (local publish token missing or wrong)', { extensions: { errorType: 'Unauthorized' } })`. Then it runs the resolver and `pubSub.publish('price:' + result.sku, result)`;
  - `Subscription.onPriceChanged = { subscribe: (_, { sku }) => pubSub.subscribe('price:' + sku), resolve: (p) => p }`;
  - `const yoga = createYoga({ schema, graphqlEndpoint: '/graphql', logging: false })` (CORS is on by default; `/health` exists), `http.createServer(yoga)`, `new WebSocketServer({ server, path: '/graphql' })`;
  - wire graphql-ws exactly as the planning prototype did:
  ```ts
  useServer({
    execute: (a: any) => a.rootValue.execute(a),
    subscribe: (a: any) => a.rootValue.subscribe(a),
    onSubscribe: async (ctx: any, _id: string, params: any) => {
      const { schema, execute, subscribe, contextFactory, parse, validate } = yoga.getEnveloped({ ...ctx, req: ctx.extra.request, socket: ctx.extra.socket, params });
      const args = { schema, operationName: params.operationName, document: parse(params.query), variableValues: params.variables, contextValue: await contextFactory(), rootValue: { execute, subscribe } };
      const errors = validate(args.schema, args.document);
      return errors.length ? errors : args;
    },
  }, wss);
  ```
  - listen on `host:port` and return URLs that use the bound port.
- deps for `packages/local`: `@pricing-engine/functions`, `@pricing-engine/api`, `pricing-rules-core` (all `workspace:*`), graphql, graphql-yoga, graphql-ws, ws, esbuild, AWS SDK clients, util-dynamodb, tsx. devDeps: @types/ws, vitest, typescript, @types/node.

- [ ] **Step 1: Failing test `shim.int.test.ts`** (temp table, shim on port 0, runner with `ShimPublisher({ url: shim.url, token: 'test-token' })` and `pollIntervalMs: 50`):
  - (a) `{ __typename }` over HTTP POST → 200;
  - (b) seed META + rule set; open a graphql-ws client (`createClient({ url: wsUrl, webSocketImpl: WebSocket })`) subscribed to `onPriceChanged(sku: "E2E-1") { sku priceMinor inputsVersion }`; wait 300 ms; POST `putInput(sku:"E2E-1", source: COST, value: 1000, seq: 1)` → `true`, and within 5 s the subscription yields `priceMinor` equal to `evaluate` for COST 1000 with the `default` rule set (1299 per Task 5 case 3);
  - (c) **Review Focus 1:** POST the same `putInput` with `seq: 1` again → `false`, and no second subscription message within 1.5 s;
  - (d) `publishPrice` without the header → `errors[0].extensions.errorType === 'Unauthorized'`, and with the header → data echoed;
  - (e) `price(sku:"E2E-1")` → the 6 fields; `decision(sku:"E2E-1")` → the trace includes `base`; `pricesByCategory(category:"<seeded category>")` → contains E2E-1;
  - (f) `putInput(sku:"bad#sku", ...)` → `errors[0].extensions.errorType === 'BadRequest'`.
- [ ] **Step 2: Run and fail. Step 3: Implement. Step 4: Run and pass.**
- [ ] **Step 5: Commit**: `feat(local): add GraphQL shim that executes the AppSync resolvers against DynamoDB Local`

---

### Task 19: local CLI: table, seed, up, runner, shim, sim, watch

**Files:** Create `packages/local/src/cli.ts`, `src/rulesets.ts`, `src/seed.ts`, `src/sim.ts`, `src/watch.ts`. Test: `test/sim.test.ts`. Modify `packages/local/package.json` (`"cli": "tsx src/cli.ts"`) and root `package.json`:
- `"local": "pnpm --filter @pricing-engine/local exec tsx src/cli.ts"`;
- `"dev": "pnpm local up"`;
- `"watch": "pnpm local watch"`.

**Interfaces:**
- `rulesets.ts`: `export const DEFAULT_RULESET: RuleSet` (spec §6 example, version 1) and `export const BENCH_RULESET: RuleSet` (`id: 'bench', version: 1, currency: 'EUR', defaultMarkupBps: 2500, floor: {type:'costPlusBps', bps: 0}, ceiling: {type:'multipleOfCost', factorBps: 100000}, rounding: {mode:'HALF_EVEN'}, rules: [{ id: 'match-competitor', when: { input: 'COMPETITOR', op: 'exists' }, then: { op: 'setTo', input: 'COMPETITOR', offsetMinor: 0 } }]`). Both must pass `parseRuleSet` (asserted in `sim.test.ts`).
- `seed.ts`:
  - `export async function putRuleSet(doc, table, rs: RuleSet): Promise<void>` writes `RULESET#id/v<n>` with `{ruleSet: rs, status: 'ACTIVE'}` and `RULESET#id/ACTIVE {version}`;
  - `export async function seedCatalog(doc, table, opts: { skus: number; prefix: string; ruleSetId: string; categories?: string[] }): Promise<{ created: number }>`. SKU `i` (1-based) is `${prefix}-${String(i).padStart(4,'0')}`, name `Product ${i}`, category `categories[(i-1) % n]` (default `['coffee','tea','cocoa']`), currency `EUR`. META uses `attribute_not_exists(PK)`. Inputs: COST = `400 + ((i * 37) % 600)`, COMPETITOR = `cost + Math.floor(cost * 4 / 10)`, INVENTORY = `50 + ((i * 13) % 100)`, all seq 1 with the seq condition. A `ConditionalCheckFailedException` → skip (idempotent).
- `sim.ts`:
  - `export function mulberry32(seed: number): () => number` (deterministic PRNG; allowed outside core);
  - `export interface SimLedger { get(sku: string, source: InputSource): { value: number; seq: number } | undefined; set(...) }`;
  - `export function nextChange(rng, ledger, skus: string[], mix: Record<'COST'|'COMPETITOR'|'INVENTORY', number>): { sku; source; value; seq }`. It picks the SKU uniformly and the source by the mix weights. Values: competitor = cost * (110..180)/100 floored; cost = prev cost * (95..105)/100 floored, min 1; inventory = 0..150. `seq = ledger seq + 1`;
  - `export async function runSim(opts: { doc; table; skus: string[]; rate: number; durationS: number /* 0 = forever */; seed: number; mix; log })`. It loads the ledger with a Query per SKU, then writes on a drift-corrected schedule. On `ConditionalCheckFailedException` it re-reads that SKU's seqs, logs `resync <sku>` and continues (**Review Focus 1**).
- `watch.ts`: `export async function watch(opts: { wsUrl; httpUrl; category?: string; skus?: string[]; seconds?: number; print })`. It resolves SKUs via `pricesByCategory` (all 3 categories if none given), subscribes to each, and prints `HH:MM:SS.mmm  SKU-0001  12.99 EUR  ▲ v42` (▲/▼ against the last seen price). It exits after `seconds` if given.
- `cli.ts` (`node:util` `parseArgs` on `process.argv.slice(2).filter((a) => a !== '--')`, because nested `pnpm` scripts may forward a literal `--`; `latency.ts` does the same), subcommands:
  - `table` (`ensureTable`);
  - `seed [--skus 30] [--prefix SKU] [--ruleset default]` (puts both rule sets, then the catalog);
  - `runner` (`startRunner` with `ShimPublisher(env.gqlUrl, env.publishToken)`);
  - `shim [--host 127.0.0.1] [--port 5361]`;
  - `up` (table + seed 30 + shim + runner in one process; prints the URLs);
  - `sim [--rate 5] [--duration 0] [--seed 42] [--prefix SKU]`;
  - `watch [--category coffee] [--seconds N]`.

  Each long-running command handles SIGINT/SIGTERM by stopping cleanly. An unknown command prints usage and exits 2.

- [ ] **Step 1: Failing `sim.test.ts`**:
  - `mulberry32(42)` gives the same first 5 numbers twice;
  - `nextChange` never returns seq <= the ledger seq, competitor values stay within `[cost*1.1, cost*1.8]`, and the mix weights are respected within ±5% over 10,000 draws;
  - `DEFAULT_RULESET` and `BENCH_RULESET` pass `parseRuleSet`.
- [ ] **Step 2: Run and fail. Step 3: Implement. Step 4: Run and pass.**
- [ ] **Step 5: Manual smoke** (DynamoDB Local up). In Git Bash:
  ```bash
  PRICING_TABLE=PricingSmoke pnpm local up > /tmp/pe-up.log 2>&1 &
  sleep 8
  PRICING_TABLE=PricingSmoke pnpm local sim --rate 5 --duration 10 --prefix SKU
  pnpm local watch --seconds 10 | head -n 5
  kill %1
  ```
  Expected: `up` prints the shim URL `http://127.0.0.1:5361/graphql`, and `watch` prints at least one tick line. Paste 2 real lines into the ledger. If port 5361 is busy, stop whatever you started on it; never touch other projects' containers.
- [ ] **Step 6: Commit**: `feat(local): add CLI to create, seed, run, simulate and watch the local pipeline`

---

### Task 20: Latency benchmark (the headline number)

**Files:** Create `packages/local/src/bench/stats.ts`, `src/bench/latency.ts`. Test: `test/stats.test.ts`. Modify `packages/local/package.json` (`"bench": "tsx src/bench/latency.ts"`) and root (`"bench": "pnpm --filter @pricing-engine/local run bench"`; extra flags pass through, e.g. `pnpm bench --duration 10`). Output: `bench/results/<UTC>.json` and `bench/results/latest.json`.

**Interfaces:**
- `stats.ts`:
  - `export function percentile(sortedAsc: number[], p: number): number` (nearest rank: `sorted[Math.ceil(p/100 * n) - 1]`; throws on an empty array or `p` outside 0..100, where `p = 0` → `sorted[0]`);
  - `export function summarize(samples: number[]): { count; p50; p95; p99; max; mean }`, rounded to 0.1 ms;
  - `export function benchValue(n: number): number` → `1100 + (n % 800)`. It always differs from `benchValue(n-1)` and lies in [1100, 1899], inside the bench band [1000, 10000] for COST 1000.
- `latency.ts` CLI flags: `--rate 50 --duration 60 --skus 100 --port 5363 --no-latest`.
  1. `ensureTable` on table `PricingBench-<Date.now()>` (fresh, so no backlog) at `env.ddbEndpoint`;
  2. `putRuleSet(BENCH_RULESET)`, then META for `B-0001..B-0100` (ruleSetId `bench`, category `bench`), COST 1000 seq 1, COMPETITOR 1100 seq 1;
  3. `startShim({ port })` and `startRunner({ publisher: ShimPublisher, pollIntervalMs: env.pollIntervalMs, startAt: 'TRIM_HORIZON' })`;
  4. wait until all 100 `PRICE#CURRENT` items exist (timeout 30 s);
  5. one graphql-ws client with 100 subscriptions; record `received.set(sku + ':' + inputsVersion, { at: performance.now(), priceMinor })`; wait for `connected`, plus 1,000 ms for the subscriptions to register;
  6. for `i` in `0..rate*duration-1`: at `t0 + i * 1000/rate` (drift-corrected `setTimeout`), take `sku = skus[i % 100]` and `n = ++count[sku]`, `value = benchValue(n)`, `seq = 1 + n`; record `sent.set(sku + ':' + (1 + seq), { at: performance.now(), value })` **before** sending `PutCommand` (seq condition), without awaiting in series (keep at most 20 in flight);
  7. after the last send, wait until `received` covers `sent` or 10 s pass;
  8. compute `latencies = received.at - sent.at` for matched keys, `lost = sent - matched`, and `mismatches = matched where priceMinor !== sent.value`;
  9. invariant scan: Query `HIST#<sku>` for every SKU; a violation is any item with `priceMinor < floorMinor || priceMinor > ceilingMinor`;
  10. write the JSON (spec §10 fields plus `table`, `ddbImage: 'amazon/dynamodb-local:3.3.1'`, `samples: sent.size`, `received: matched`, `latencyMs: summarize(latencies)`). Write `latest.json` unless `--no-latest`. Print one line: `bench: p50 X ms, p95 Y ms, p99 Z ms, max M ms | samples S, lost L, mismatches K, invariant violations V | rate R/s, poll P ms`;
  11. stop the runner and shim, delete the table, and exit 1 if `lost + mismatches + violations > 0`.
- [ ] **Step 1: Failing `stats.test.ts`**:
  - `percentile([1..100], 50) === 50`, `(…, 99) === 99`, `(…, 100) === 100`, `([5], 99) === 5`;
  - an empty array throws;
  - `summarize` rounds;
  - `benchValue(n) !== benchValue(n+1)` for n in 0..2000, and the range holds.
- [ ] **Step 2: Run and fail. Step 3: Implement. Step 4: Run and pass.**
- [ ] **Step 5: Run the benchmark for real.** Close other heavy apps you started; DynamoDB Local must be up.
  - `pnpm bench --duration 10 --no-latest 2>&1 | tail -n 3` is the smoke run. It must exit 0 with lost 0.
  - Then the real run: `pnpm bench 2>&1 | tail -n 3`. Expected: the `bench:` line, exit 0, and `bench/results/latest.json` written. Paste the line into the ledger verbatim.
  - If lost > 0, debug with superpowers:systematic-debugging (common causes: subscriptions not registered yet, or a seq race). **Never** relax the 0-lost exit condition.
- [ ] **Step 6: Commit**: `perf(local): measure input-to-subscriber latency on the local pipeline` (include `bench/results/*.json`).

---

### Task 21: Web live price grid

**Files:** Create `packages/web/package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `src/main.tsx`, `src/App.tsx`, `src/gql.ts`, `src/priceStore.ts`, `src/styles.css`. Test: `test/priceStore.test.ts`.

**Interfaces:**
- `priceStore.ts` (pure):
  ```ts
  export interface Price { sku: string; priceMinor: number; currency: string; inputsVersion: number; ruleSetVersion: number; computedAt: string }
  export interface PriceRow extends Price { previousMinor?: number; changedAt?: number }
  export type Rows = Readonly<Record<string, PriceRow>>;
  export function applyPrice(rows: Rows, p: Price, nowMs: number): Rows; // returns the same object if p is not newer (inputsVersion, then ruleSetVersion)
  export function direction(row: PriceRow): 'up' | 'down' | 'none';
  export function formatMinor(minor: number, currency: string): string;    // Intl currency with 2 fraction digits; display only
  ```
- `gql.ts`: `HTTP_URL = import.meta.env.VITE_GQL_HTTP ?? 'http://localhost:5361/graphql'`, `WS_URL` likewise (`ws://localhost:5361/graphql`); `query<T>(doc, vars)` via fetch; `subscribePrices(skus, onPrice): () => void` via a graphql-ws `createClient`.
- `App.tsx`:
  - category tabs `coffee | tea | cocoa`; loads `pricesByCategory`, subscribes to those SKUs, and renders a responsive card grid (SKU, price, ▲/▼, `v<inputsVersion>`);
  - a card flashes for 800 ms after `changedAt` (CSS class; green up, red down);
  - clicking a card opens a side panel that queries `decision(sku)` and shows a table `ruleId | before | after | note`;
  - a header shows a connection status dot and "local pipeline: DynamoDB Local + stream runner + GraphQL shim";
  - no Cognito login (ADR 0005); say so in a footer line.
- `vite.config.ts`: the react plugin, `server: { port: 5362, strictPort: true }`, `preview: { port: 5173 }`, `test: { environment: 'node', include: ['test/**/*.test.ts'] }`.
- Scripts: `dev` (`vite`), `build` (`tsc -p tsconfig.json --noEmit && vite build`), `preview`, `typecheck`, `test`. tsconfig: `module ESNext`, `moduleResolution Bundler`, `jsx react-jsx`, `lib ["ES2023","DOM","DOM.Iterable"]`, `types ["vite/client"]`.
- Load the `taste` frontend skill (`design-taste-frontend`) before writing the UI, and keep it small and clean.

- [ ] **Step 1: Failing `priceStore.test.ts`** (**Review Focus 5**):
  - the first price → a row with no `previousMinor`;
  - a newer `inputsVersion` → `previousMinor` set, `changedAt = now`;
  - an older `inputsVersion` → the same object returned (`toBe`);
  - a duplicate (equal versions) → the same object;
  - equal `inputsVersion` with a higher `ruleSetVersion` → applied;
  - `direction` is up/down/none;
  - `formatMinor(1299, 'EUR')` contains `12.99`.
- [ ] **Step 2: Run and fail. Step 3: Implement. Step 4: Run and pass**, then `pnpm --filter @pricing-engine/web build 2>&1 | tail -n 3` succeeds.
- [ ] **Step 5: Manual check.** With `pnpm local up` and `pnpm local sim --rate 5` running, `pnpm --filter @pricing-engine/web dev`, then `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5362/` → `200`. Stop all three.
- [ ] **Step 6: Commit**: `feat(web): add live price grid with flash-on-change and decision trace panel`

---

### Task 22: Docker image and compose demo

**Files:** Create `docker/app.Dockerfile`, `.dockerignore`. Modify `docker-compose.yml` and root `package.json` (`"demo": "docker compose up -d --build"`, `"demo:down": "docker compose down"`).

- [ ] **Step 1: Write `.dockerignore`**: `**/node_modules`, `**/dist`, `**/cdk.out`, `.git`, `.dlq`, `**/*.tgz`, `bench/results`.
- [ ] **Step 2: Write `docker/app.Dockerfile`**:
  ```dockerfile
  FROM node:24.19.0-alpine
  WORKDIR /app
  RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
  COPY . .
  RUN pnpm install --frozen-lockfile && pnpm --filter @pricing-engine/web build
  ENV PRICING_DDB_ENDPOINT=http://dynamodb:8000 PRICING_TABLE=Pricing PRICING_GQL_URL=http://gql:4000/graphql
  ```
- [ ] **Step 3: Extend `docker-compose.yml`.** Keep `dynamodb`, and add these services, all with `image: pricing-engine-app:local` (only `gql` has `build: { context: ., dockerfile: docker/app.Dockerfile }`), `depends_on: [dynamodb]` and `restart: on-failure`:
  - `gql`: `container_name: pricing-engine-gql`, `command: ["pnpm","local","shim","--host","0.0.0.0","--port","4000"]`, `ports: ["127.0.0.1:5361:4000"]`;
  - `runner`: `container_name: pricing-engine-runner`, `command: ["pnpm","local","runner"]`, `depends_on: [dynamodb, gql]`;
  - `sim`: `container_name: pricing-engine-sim`, `command: ["sh","-c","pnpm local table && pnpm local seed --skus 30 && pnpm local sim --rate 5 --duration 0"]`;
  - `web`: `container_name: pricing-engine-web`, `command: ["pnpm","--filter","@pricing-engine/web","preview","--host","0.0.0.0","--port","5173","--strictPort"]`, `ports: ["127.0.0.1:5362:5173"]`.

  The runner waits for the table (Task 17), so the start order does not matter.
- [ ] **Step 4: Smoke.** In PowerShell or Git Bash:
  ```bash
  docker compose up -d --build 2>&1 | tail -n 5
  docker compose ps --format "{{.Name}} {{.State}}"
  sleep 20
  curl -s -X POST http://127.0.0.1:5361/graphql -H "content-type: application/json" -d '{"query":"{ price(sku: \"SKU-0001\") { sku priceMinor currency inputsVersion } }"}'
  curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5362/
  pnpm watch --seconds 10 | head -n 5
  docker compose logs --no-color runner | tail -n 5
  docker compose down
  ```
  Expected:
  - five containers named `pricing-engine-*` are `running`;
  - the price query returns `{"data":{"price":{"sku":"SKU-0001","priceMinor":<int>,...}}}`;
  - the web check prints `200`;
  - `watch` prints tick lines;
  - after `down`, `docker ps --filter name=pricing-engine-` lists nothing.

  Paste the real outputs (trimmed) into the ledger. If the image build fails on `pnpm install --frozen-lockfile`, fix the lockfile by running `pnpm install` on the host (dependencies did not change, so this is a config bug); never use `--no-frozen-lockfile` in the image.
- [ ] **Step 5: Commit**: `feat(docker): add one-command compose demo with DynamoDB Local, shim, runner, simulator and web`

---

### Task 23: CI workflow

**Files:** Create `.github/workflows/ci.yml`, `scripts/check-readme-headline.mjs` (the check runs in Task 24 once the README exists; write it now with a test).

- [ ] **Step 1: Write `scripts/check-readme-headline.mjs`.** It reads `bench/results/latest.json` and `README.md`, and asserts that one of the first 5 README lines contains `p99 ${Math.round(latencyMs.p99)} ms` **and** `${samples.toLocaleString('en-US')}`. It prints `headline OK: p99 <n> ms, <samples> samples` or exits 1 with a message showing what it expected.
- [ ] **Step 2: Write `ci.yml`.**
  ```yaml
  name: ci
  on: { push: {}, pull_request: {} }
  jobs:
    check:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v4
        - uses: actions/setup-node@v4
          with: { node-version: 24, cache: pnpm }
        - run: pnpm install --frozen-lockfile
        - run: pnpm lint
        - run: pnpm typecheck
        - run: pnpm test
        - run: pnpm synth
        - run: pnpm --filter pricing-rules-core pack:check
        - run: node scripts/check-readme-headline.mjs
    integration:
      runs-on: ubuntu-latest
      needs: check
      services:
        dynamodb:
          image: amazon/dynamodb-local:3.3.1
          ports: ["5360:8000"]
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v4
        - uses: actions/setup-node@v4
          with: { node-version: 24, cache: pnpm }
        - run: pnpm install --frozen-lockfile
        - run: pnpm build
        - run: pnpm test:int
        - run: pnpm bench --duration 10 --rate 20 --no-latest
  ```
  The service container uses the image's default command, which runs in-memory without `-sharedDb`. The tests use one region and fixed credentials, so that is fine. If the tests fail because of per-credential databases, add a `Ruling:` and pass `options` to run with `-sharedDb`.
- [ ] **Step 3: Lint the workflow.** PowerShell: `docker run --rm -v "${PWD}:/repo" -w /repo rhysd/actionlint:1.7.12 -color`. Git Bash: `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/repo" -w /repo rhysd/actionlint:1.7.12`. Expected: no output, exit 0.
- [ ] **Step 4: Commit**: `ci: run lint, tests, cdk-nag synth, pack check and DynamoDB Local integration`

---

### Task 24: README, DEVDOCS draft and handoff

**Files:** Create `README.md`, `docs/DEVDOCS.md`, `docs/handoff.md`.

- [ ] **Step 1: README.md.**
  - Line 1: `# pricing-engine`.
  - Line 3: the headline, built from `bench/results/latest.json` with a one-off node command (do not type numbers). The form is `**p99 <p99 rounded> ms from input change to live subscriber at <rate> updates/s, <lost> lost of <samples formatted en-US>** (local pipeline: DynamoDB Local + stream runner + GraphQL shim, <date>; [method](docs/adr/0007-measured-headline-benchmark.md)).`
  - Then:
    - a one-paragraph pitch;
    - **30-second demo** (`pnpm install && pnpm demo`, then open http://localhost:5362; `pnpm watch` for the terminal);
    - a real 5-line `pnpm watch` transcript captured in Task 22 or now;
    - the mermaid architecture diagram (AWS shape and local shape, two subgraphs);
    - **What's proven and how** (the invariant table from spec §8, with test file links);
    - **Install the rule engine** (`pricing-rules-core`, "publish-ready, not yet published", usage snippet);
    - **Numbers** (bench latest + core bench, both quoted from the JSON files with their machine line);
    - **Honest limits** (local pipeline ≠ AWS; AppSync/Cognito proven by synth only; v0.2 list from spec §3);
    - **ADRs** (the list);
    - **License** MIT.
  - Run `node scripts/check-readme-headline.mjs` → `headline OK`.
- [ ] **Step 2: `docs/DEVDOCS.md` draft** in the brief's order:
  1. what it is plus the number;
  2. a 5-minute quickstart with exact commands;
  3. architecture with one mermaid diagram;
  4. a project layout table;
  5. run, test and bench commands;
  6. key decisions and what they gave up (ADR links);
  7. known limits and what's left.

  Include the "every writer must respect the seq condition" rule (ADR 0004) and the list of cdk-nag acknowledgements (from `infra/src/nag-acknowledgements.ts`). Opus rewrites this in the verify step, so keep it accurate rather than polished.
- [ ] **Step 3: `docs/handoff.md`**: an entry dated 2026-10-04, harness Claude (Sonnet builder), branch `main`, covering what changed, what's left (v0.2 list plus anything BLOCKED) and how to verify (the Task 25 gate list).
- [ ] **Step 4: Commit**: `docs: add README with measured headline, DEVDOCS draft and handoff`

---

### Task 25: Final gates from a clean tree

- [ ] **Step 1: Clean and reinstall.**
  `git status --short` must be empty. Then delete the build outputs: `node -e "for (const p of ['packages/core/dist','packages/functions/dist','packages/web/dist','infra/cdk.out']) require('fs').rmSync(p,{recursive:true,force:true})"`.
  Then `pnpm install --frozen-lockfile 2>&1 | tail -n 2`.
- [ ] **Step 2: Run every gate and record the real output in the ledger.**
  ```bash
  pnpm lint 2>&1 | tail -n 3
  pnpm typecheck 2>&1 | tail -n 3
  pnpm test 2>&1 | grep -E "Test Files|Tests " | head -n 12
  pnpm synth 2>&1 | tail -n 3
  pnpm --filter pricing-rules-core pack:check 2>&1 | tail -n 1
  docker compose up -d dynamodb
  pnpm test:int 2>&1 | grep -E "Test Files|Tests " | head -n 6
  pnpm bench --duration 10 --no-latest 2>&1 | tail -n 1
  node scripts/check-readme-headline.mjs
  MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/repo" -w /repo rhysd/actionlint:1.7.12
  docker compose down
  docker ps --filter name=pricing-engine- --format "{{.Names}}"
  ```
  Expected: every command exits 0, test counts are non-zero per package, the bench smoke shows lost 0, and the final `docker ps` prints nothing.
- [ ] **Step 3: Write the summary.** Append `Task 25: complete (...)` with the per-package test counts, synth resource counts, the bench headline line and the core bench line. Add a final ledger line `DONE` (or `BLOCKED: <reason>`).
- [ ] **Step 4: Commit**: `chore: record v0.1 verification results` (ledger and handoff only).

---

## Self-review (planner)

- Spec coverage: §3 scope is covered by Tasks 2-24. Overrides are in core (Task 5) and the recompute path (Task 9 loads `OVERRIDE`). `setOverride` is deferred (spec §3). §8 invariants each map to a task test. §10 bench is Task 20.
- Type names used across tasks: `PricingStore`, `PriceWrite`, `PricedDecision`, `PricePublisher`, `PriceMessage`, `DynamoClients`, `createDynamoClients`, `ensureTable`, `RECOMPUTE_FILTERS`, `PUBLISHER_FILTERS`, `startRunner`, `startShim`, `ShimPublisher`, `DEFAULT_RULESET`, `BENCH_RULESET`, `benchValue`. These are defined in Tasks 8, 9, 11, 17, 18, 19 and 20.
- The Review Focus items are pinned in Tasks 5, 8, 9, 10, 13, 16, 18, 19 and 21.
