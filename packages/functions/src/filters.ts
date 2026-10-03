// EventBridge-style filter patterns, shared by the CDK event source mappings and the local stream runner.
export const RECOMPUTE_FILTERS: ReadonlyArray<Record<string, unknown>> = [
  { dynamodb: { Keys: { SK: { S: [{ prefix: 'INPUT#' }] } } } },
  { dynamodb: { Keys: { SK: { S: ['OVERRIDE'] } } } },
];

export const PUBLISHER_FILTERS: ReadonlyArray<Record<string, unknown>> = [
  { eventName: ['INSERT', 'MODIFY'], dynamodb: { Keys: { SK: { S: ['PRICE#CURRENT'] } } } },
];
