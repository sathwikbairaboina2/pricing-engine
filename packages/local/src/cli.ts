import { parseArgs } from 'node:util';
import { createDynamoClients, ensureTable, ShimPublisher } from '@pricing-engine/functions';
import { env } from './env.js';
import { BENCH_RULESET, DEFAULT_RULESET } from './rulesets.js';
import { startRunner } from './runner.js';
import { putOverride, putRuleSet, seedCatalog } from './seed.js';
import { startShim } from './shim.js';
import { runSim } from './sim.js';
import { watch } from './watch.js';

const USAGE = `usage: pnpm local <command> [options]
  table                                       create the table if missing
  seed   [--skus 30] [--prefix SKU] [--ruleset default]
  runner                                      stream runner (needs the shim)
  shim   [--host 127.0.0.1] [--port 5361]     GraphQL shim
  up                                          table + seed + shim + runner in one process
  sim    [--rate 5] [--duration 0] [--seed 42] [--prefix SKU] [--skus 30]
  override --sku SKU-0001 --price 799 [--minutes 5]   price override in minor units (expires; expiry itself emits no event)
  watch  [--category coffee] [--seconds N]    print live price ticks`;

const argv = process.argv.slice(2).filter((a) => a !== '--');
const command = argv[0];
const { values } = parseArgs({
  args: argv.slice(1),
  allowPositionals: true,
  options: {
    skus: { type: 'string', default: '30' },
    prefix: { type: 'string', default: 'SKU' },
    ruleset: { type: 'string', default: 'default' },
    host: { type: 'string', default: '127.0.0.1' },
    port: { type: 'string', default: '5361' },
    rate: { type: 'string', default: '5' },
    duration: { type: 'string', default: '0' },
    seed: { type: 'string', default: '42' },
    category: { type: 'string' },
    seconds: { type: 'string' },
    sku: { type: 'string' },
    price: { type: 'string' },
    minutes: { type: 'string', default: '5' },
  },
});

const clients = createDynamoClients({ endpoint: env.ddbEndpoint });
const abort = new AbortController();
const stops: Array<() => Promise<void>> = [];
const shutdown = async () => {
  abort.abort();
  for (const s of stops.reverse()) await s();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

const skuList = () => Array.from({ length: Number(values.skus) }, (_, i) => `${values.prefix}-${String(i + 1).padStart(4, '0')}`);
const forever = () => new Promise<never>(() => {});

async function seedAll(): Promise<void> {
  await putRuleSet(clients.doc, env.table, DEFAULT_RULESET);
  await putRuleSet(clients.doc, env.table, BENCH_RULESET);
  const { created } = await seedCatalog(clients.doc, env.table, { skus: Number(values.skus), prefix: String(values.prefix), ruleSetId: String(values.ruleset) });
  console.log(`seeded ${created} new SKUs into ${env.table}`);
}

switch (command) {
  case 'table': {
    const { streamArn } = await ensureTable(clients.ddb, env.table);
    console.log(`table ${env.table} ready, stream ${streamArn}`);
    break;
  }
  case 'seed':
    await ensureTable(clients.ddb, env.table);
    await seedAll();
    break;
  case 'shim': {
    const shim = await startShim({ ddb: clients.ddb, tableName: env.table, publishToken: env.publishToken, host: String(values.host), port: Number(values.port) });
    stops.push(shim.close);
    console.log(`shim listening: ${shim.url} (subscriptions ${shim.wsUrl})`);
    await forever();
    break;
  }
  case 'runner': {
    const runner = await startRunner({
      clients,
      tableName: env.table,
      publisher: new ShimPublisher({ url: env.gqlUrl, token: env.publishToken }),
      pollIntervalMs: env.pollIntervalMs,
      dlqDir: env.dlqDir,
    });
    stops.push(runner.stop);
    await forever();
    break;
  }
  case 'up': {
    await ensureTable(clients.ddb, env.table);
    await seedAll();
    const shim = await startShim({ ddb: clients.ddb, tableName: env.table, publishToken: env.publishToken, host: String(values.host), port: Number(values.port) });
    stops.push(shim.close);
    const runner = await startRunner({
      clients,
      tableName: env.table,
      publisher: new ShimPublisher({ url: shim.url, token: env.publishToken }),
      pollIntervalMs: env.pollIntervalMs,
      dlqDir: env.dlqDir,
    });
    stops.push(runner.stop);
    console.log(`GraphQL: ${shim.url}\nSubscriptions: ${shim.wsUrl}\nTry: pnpm local sim, pnpm local watch`);
    await forever();
    break;
  }
  case 'sim': {
    const res = await runSim({
      doc: clients.doc,
      table: env.table,
      skus: skuList(),
      rate: Number(values.rate),
      durationS: Number(values.duration),
      seed: Number(values.seed),
      mix: { COST: 1, COMPETITOR: 3, INVENTORY: 2 },
      log: (l) => console.log(l),
      signal: abort.signal,
    });
    console.log(`sim done: ${res.writes} writes, ${res.skipped} resynced`);
    break;
  }
  case 'override': {
    const priceMinor = Number(values.price);
    if (!values.sku || !Number.isInteger(priceMinor) || priceMinor < 0) {
      console.error('override needs --sku and an integer --price in minor units');
      process.exit(2);
    }
    const r = await putOverride(clients.doc, env.table, { sku: values.sku, priceMinor, minutes: Number(values.minutes) });
    console.log(`override on ${values.sku}: ${priceMinor} minor units until ${new Date(r.expiresAt).toISOString()} (seq ${r.seq})`);
    break;
  }
  case 'watch': {
    const httpUrl = env.gqlUrl;
    const wsUrl = httpUrl.replace(/^http/, 'ws');
    const ticks = await watch({
      wsUrl,
      httpUrl,
      ...(values.category ? { category: values.category } : {}),
      ...(values.seconds ? { seconds: Number(values.seconds) } : {}),
      print: (l) => console.log(l),
      signal: abort.signal,
    });
    console.log(`watch done: ${ticks} ticks`);
    break;
  }
  default:
    console.error(USAGE);
    process.exit(2);
}
process.exit(0);
