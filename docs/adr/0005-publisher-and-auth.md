# ADR 0005: A separate publisher consumer calls an IAM-only mutation; locally a dev token stands in for IAM

Status: accepted, 2026-10-04

## Context

AppSync subscriptions fire only on mutations. Lambdas must be able to publish, and browsers must not.

## Decision

- A second stream consumer, the publisher, reads `PRICE#CURRENT` records. It skips records whose `priceMinor` did not change and calls `publishPrice(input: PriceInput!)` for the rest.
- In AWS:
  - `publishPrice` carries `@aws_iam` only, and the API's default auth is the Cognito user pool;
  - the publisher signs its requests with SigV4 (`@smithy/signature-v4@5.7.4`, `@aws-crypto/sha256-js@5.2.0`);
  - its role gets `appsync:GraphQL` on `.../types/Mutation/fields/publishPrice` only;
  - `publishPrice` resolves on a `NONE` data source.
- The publisher depends on a `PricePublisher` interface with two implementations:
  - `AppSyncPublisher` signs with SigV4 and is used in Lambda;
  - `ShimPublisher` posts to the local shim with the header `x-pricing-publish-token`.
- The shim rejects `publishPrice` unless that header equals `PRICING_PUBLISH_TOKEN` (default `local-dev-only`). Queries and `putInput` are open on the shim. This is a dev emulation of `@aws_iam`, not security. Outside Docker the shim binds to 127.0.0.1.

## Consequences

- What we gave up: a real Cognito login flow in the local web app. In v0.1, browser auth is proven only by synth assertions. The test "call `publishPrice` with a Cognito token and expect `Unauthorized`" needs AWS and moves to v0.2.
- Publishing costs one extra Lambda and one extra stream read per price change. In exchange, recompute makes no network calls to AppSync, and it can be retried without duplicate publishes.
