export const env = {
  ddbEndpoint: process.env['PRICING_DDB_ENDPOINT'] ?? 'http://127.0.0.1:5360',
  table: process.env['PRICING_TABLE'] ?? 'Pricing',
  gqlUrl: process.env['PRICING_GQL_URL'] ?? 'http://127.0.0.1:5361/graphql',
  // Not a secret: it only keeps a browser tab from calling publishPrice on the local shim.
  publishToken: process.env['PRICING_PUBLISH_TOKEN'] ?? 'local-dev-only',
  pollIntervalMs: Number(process.env['PRICING_POLL_MS'] ?? 250),
  dlqDir: process.env['PRICING_DLQ_DIR'] ?? '.dlq',
};
