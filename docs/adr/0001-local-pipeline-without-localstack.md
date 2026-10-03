# ADR 0001: Run the pipeline locally on DynamoDB Local, a stream runner and a GraphQL shim

Status: accepted, 2026-10-04

## Context

The design doc made LocalStack the dev and integration target. Since 2026-03, LocalStack needs an auth token to start, and neither this machine nor CI has one. On LocalStack's licensing page AppSync is Ultimate-only, Cognito is Base, and OpenSearch Serverless is not listed. So even with a Hobby token, the AppSync half of the system would not run.

During planning (2026-10-04) we checked `amazon/dynamodb-local` in Docker with `@aws-sdk/client-dynamodb-streams@3.1146.0`:

- `CreateTable` with `StreamViewType: NEW_AND_OLD_IMAGES` returns a stream ARN, and `DescribeStream`, `GetShardIterator` and `GetRecords` work.
- Latency from `PutItem` to the stream record was 7.5 ms p50 and 13.5 ms max over 50 writes with tight polling.
- A `TransactWriteItems` with `attribute_not_exists(PK) OR inputsVersion < :v` rejects both a stale and an equal version with `TransactionCanceledException` / `ConditionalCheckFailed`.

A graphql-yoga 5.24.1 + graphql-ws 6.3.0 prototype delivered a mutation-triggered subscription message in 21 ms.
An APPSYNC_JS resolver file that imports `@aws-appsync/utils` ran in Node after an esbuild bundle that aliases that import to a small `util` shim.

## Decision

- **DynamoDB Local 3.3.1** in Docker (host port 5360) is the real database for tests, the demo and the benchmark.
- **The `packages/local` stream runner** emulates the Lambda event source mapping. It:
  - polls the stream;
  - applies the same filter as the CDK `FilterCriteria`;
  - batches records and calls the real handler;
  - honors `batchItemFailures` by retrying from the first failed record;
  - bisects on error, stops after 3 retries, and parks the record in a JSON-lines DLQ file.

  It polls every 250 ms when idle, which matches Lambda's documented 4 polls per second per shard, and polls again immediately when records arrive.
- **The `packages/local` GraphQL shim** serves `packages/api/schema.graphql` with graphql-yoga and graphql-ws. It runs the **same** resolver files that are deployed to AppSync:
  - it interprets their `GetItem`, `PutItem` and `Query` requests against DynamoDB Local;
  - it treats the `NONE` data source as a pass-through;
  - `@aws_subscribe(mutations: ["publishPrice"])` becomes one pub/sub topic per SKU.
- The AWS shape is proven by CDK assertion tests and a cdk-nag `AwsSolutions` synth gate, never by a deploy.

## Consequences

- What we gave up:
  - real AppSync behavior: auth, subscription fan-out limits and resolver runtime limits;
  - real Lambda behavior: concurrency, cold starts and parallelization factor;
  - IAM enforcement;
  - an AWS latency number.

  The headline number is labelled "local pipeline". The real AWS run moves to v0.2.
- The shim can drift from AppSync. Mitigations:
  - it executes the same resolver files;
  - resolver unit tests pin the request shapes;
  - it implements only the operations the resolvers use and throws on anything else.
- What we gained: the whole pipeline runs with only Docker and Node, in CI too (DynamoDB Local as a service container), with no account, no token and no cost.
