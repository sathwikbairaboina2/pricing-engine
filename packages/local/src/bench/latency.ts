import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DeleteTableCommand } from '@aws-sdk/client-dynamodb';
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { createDynamoClients, ensureTable, ShimPublisher } from '@pricing-engine/functions';
import { createClient } from 'graphql-ws';
import WebSocket from 'ws';
import { env } from '../env.js';
import { BENCH_RULESET } from '../rulesets.js';
import { startRunner } from '../runner.js';
import { putRuleSet } from '../seed.js';
import { startShim } from '../shim.js';
import { benchValue, summarize } from './stats.js';

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    rate: { type: 'string', default: '5' },
    duration: { type: 'string', default: '60' },
    skus: { type: 'string', default: '100' },
    port: { type: 'string', default: '5363' },
    'no-latest': { type: 'boolean', default: false },
  },
});
const rate = Number(values.rate);
const durationS = Number(values.duration);
const skuCount = Number(values.skus);
const port = Number(values.port);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clients = createDynamoClients({ endpoint: env.ddbEndpoint });
const table = `PricingBench-${Date.now()}`;
const skus = Array.from({ length: skuCount }, (_, i) => `B-${String(i + 1).padStart(4, '0')}`);
const put = (Item: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  clients.doc.send(new PutCommand({ TableName: table, Item, ...extra }));

await ensureTable(clients.ddb, table);
await putRuleSet(clients.doc, table, BENCH_RULESET);
for (const sku of skus) {
  await put({ PK: `SKU#${sku}`, SK: 'META', name: sku, category: 'bench', currency: 'EUR', ruleSetId: 'bench' });
  await put({ PK: `SKU#${sku}`, SK: 'INPUT#COST', value: 1000, seq: 1 });
  await put({ PK: `SKU#${sku}`, SK: 'INPUT#COMPETITOR', value: 1100, seq: 1 });
}

const shim = await startShim({ ddb: clients.ddb, tableName: table, publishToken: env.publishToken, host: '127.0.0.1', port });
const received = new Map<string, { at: number; priceMinor: number }>();
const ws = createClient({ url: shim.wsUrl, webSocketImpl: WebSocket });
await new Promise<void>((resolve, reject) => {
  ws.on('connected', () => resolve());
  ws.on('error', (e) => reject(e));
  // a subscription forces the lazy connection to open
  ws.subscribe({ query: 'subscription { onPriceChanged(sku: "__warmup__") { sku } }' }, { next: () => {}, error: () => {}, complete: () => {} });
});
for (const sku of skus) {
  ws.subscribe(
    { query: 'subscription($sku: ID!) { onPriceChanged(sku: $sku) { sku priceMinor inputsVersion } }', variables: { sku } },
    {
      next: (m) => {
        const p = m.data?.['onPriceChanged'] as { sku: string; priceMinor: number; inputsVersion: number } | undefined;
        if (p) received.set(`${p.sku}:${p.inputsVersion}`, { at: performance.now(), priceMinor: p.priceMinor });
      },
      error: () => {},
      complete: () => {},
    },
  );
}
await sleep(1000);

// Warm-up: the runner prices and publishes every SKU once. Start measuring only after all of those have been received,
// so the first samples do not queue behind the initial backlog.

const runner = await startRunner({
  clients,
  tableName: table,
  publisher: new ShimPublisher({ url: shim.url, token: env.publishToken }),
  pollIntervalMs: env.pollIntervalMs,
  dlqDir: mkdtempSync(join(os.tmpdir(), 'pe-bench-dlq-')),
  startAt: 'TRIM_HORIZON',
  log: () => {},
});


const warmDeadline = Date.now() + 120_000;
while (received.size < skuCount) {
  if (Date.now() > warmDeadline) throw new Error(`warm-up: only ${received.size}/${skuCount} initial prices received after 120s`);
  await sleep(100);
}
await sleep(1000);
received.clear();

const sent = new Map<string, { at: number; value: number }>();
const counts = new Map<string, number>(skus.map((s) => [s, 0]));
const total = Math.floor(rate * durationS);
const inflight = new Set<Promise<unknown>>();
const t0 = performance.now();
for (let i = 0; i < total; i++) {
  const delay = t0 + (i * 1000) / rate - performance.now();
  if (delay > 0) await sleep(delay);
  const sku = skus[i % skuCount]!;
  const n = (counts.get(sku) ?? 0) + 1;
  counts.set(sku, n);
  const value = benchValue(n);
  const seq = 1 + n;
  sent.set(`${sku}:${1 + seq}`, { at: performance.now(), value });
  const p = put(
    { PK: `SKU#${sku}`, SK: 'INPUT#COMPETITOR', value, seq },
    { ConditionExpression: 'attribute_not_exists(SK) OR #seq < :seq', ExpressionAttributeNames: { '#seq': 'seq' }, ExpressionAttributeValues: { ':seq': seq } },
  ).finally(() => inflight.delete(p));
  inflight.add(p);
  if (inflight.size >= 20) await Promise.race(inflight);
}
await Promise.all(inflight);

const drainDeadline = Date.now() + 10_000;
while (Date.now() < drainDeadline && [...sent.keys()].some((k) => !received.has(k))) await sleep(50);

const latencies: number[] = [];
let mismatches = 0;
for (const [key, s] of sent) {
  const r = received.get(key);
  if (!r) continue;
  latencies.push(r.at - s.at);
  if (r.priceMinor !== s.value) mismatches++;
}
const lost = sent.size - latencies.length;

let violations = 0;
for (const sku of skus) {
  const res = await clients.doc.send(new QueryCommand({
    TableName: table, KeyConditionExpression: 'PK = :p', ExpressionAttributeValues: { ':p': `HIST#${sku}` },
  }));
  for (const it of res.Items ?? []) {
    if (Number(it['priceMinor']) < Number(it['floorMinor']) || Number(it['priceMinor']) > Number(it['ceilingMinor'])) violations++;
  }
}

const latency = latencies.length > 0 ? summarize(latencies) : undefined;
const at = new Date();
const result = {
  kind: 'pipeline-latency',
  scope: 'local pipeline (DynamoDB Local + stream runner + GraphQL shim), not AWS',
  at: at.toISOString(),
  table,
  ddbImage: 'amazon/dynamodb-local:3.3.1',
  rate,
  durationS,
  skus: skuCount,
  pollIntervalMs: env.pollIntervalMs,
  samples: sent.size,
  received: latencies.length,
  lost,
  mismatches,
  invariantViolations: violations,
  latencyMs: latency,
  machine: { cpu: os.cpus()[0]?.model.trim(), platform: os.platform(), node: process.version },
};

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'bench', 'results');
mkdirSync(outDir, { recursive: true });
const stamp = at.toISOString().replace(/[:.]/g, '-');
writeFileSync(join(outDir, `${stamp}.json`), JSON.stringify(result, null, 2) + '\n');
if (!values['no-latest']) writeFileSync(join(outDir, 'latest.json'), JSON.stringify(result, null, 2) + '\n');

console.log(
  `bench: p50 ${latency?.p50} ms, p95 ${latency?.p95} ms, p99 ${latency?.p99} ms, max ${latency?.max} ms | samples ${sent.size}, lost ${lost}, mismatches ${mismatches}, invariant violations ${violations} | rate ${rate}/s, poll ${env.pollIntervalMs} ms`,
);

await ws.dispose();
await runner.stop();
await shim.close();
await clients.ddb.send(new DeleteTableCommand({ TableName: table }));
process.exit(lost + mismatches + violations > 0 ? 1 : 0);
