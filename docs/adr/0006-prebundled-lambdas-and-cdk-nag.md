# ADR 0006: Prebundle Lambdas with esbuild and gate synth with cdk-nag through CDK Validations

Status: accepted, 2026-10-04

## Context

`NodejsFunction` bundles at synth time and may fall back to Docker. Tests and CI should synth fast, offline and without Docker.

cdk-nag 3.x runs through CDK's `Validations` API. We checked this during planning with `aws-cdk-lib@2.272.0` and `cdk-nag@3.0.2`: you register it with `Validations.of(app).addPlugins(new AwsSolutionsChecks(app))`, and synth throws `Validation failed` on any finding that is not acknowledged.

## Decision

- `packages/functions` builds `dist/recompute/index.mjs` and `dist/publisher/index.mjs` with esbuild 0.28.2: ESM, Node 24, with the AWS SDK v3 kept external because the Lambda runtime provides it.
- CDK uses `lambda.Code.fromAsset(<dist dir>)` with `Runtime.NODEJS_24_X` on ARM64. `infra` runs the bundle step before its tests and synth.
- cdk-nag `AwsSolutionsChecks` is added to the app in `infra/bin/app.ts`, and to the infra test that synthesizes the app.
- Findings are fixed where possible: `enforceSSL` on queues, AppSync field logging, the latest runtime.
- The remaining findings are acknowledged with their exact finding ids, each with a written reason, in one place: `infra/src/nag-acknowledgements.ts`. The short id does not cover `IAM4[Policy::...]` and `IAM5[Resource::*]` findings; we checked this during planning.

## Consequences

- What we gave up: per-function tree-shaking of the AWS SDK, and automatic rebundling on synth. Running `pnpm build` first is required and is scripted.
- Every acknowledgement is visible in one file and listed in DEVDOCS.
