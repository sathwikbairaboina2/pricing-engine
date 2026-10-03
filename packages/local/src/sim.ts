import { PutCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SimSource = 'COST' | 'COMPETITOR' | 'INVENTORY';
export interface SimLedger {
  get(sku: string, source: SimSource): { value: number; seq: number } | undefined;
  set(sku: string, source: SimSource, value: number, seq: number): void;
}

export class MapLedger implements SimLedger {
  private readonly m = new Map<string, { value: number; seq: number }>();
  get(sku: string, source: SimSource) { return this.m.get(`${sku}:${source}`); }
  set(sku: string, source: SimSource, value: number, seq: number) { this.m.set(`${sku}:${source}`, { value, seq }); }
}

export interface SimChange { sku: string; source: SimSource; value: number; seq: number }
export type SimMix = Record<SimSource, number>;

const between = (rng: () => number, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

export function nextChange(rng: () => number, ledger: SimLedger, skus: string[], mix: SimMix): SimChange {
  const sku = skus[Math.floor(rng() * skus.length)]!;
  const total = mix.COST + mix.COMPETITOR + mix.INVENTORY;
  const pick = rng() * total;
  const source: SimSource = pick < mix.COST ? 'COST' : pick < mix.COST + mix.COMPETITOR ? 'COMPETITOR' : 'INVENTORY';
  const prev = ledger.get(sku, source);
  const cost = ledger.get(sku, 'COST')?.value ?? 1000;
  let value: number;
  if (source === 'COMPETITOR') value = Math.floor((cost * between(rng, 110, 180)) / 100);
  else if (source === 'COST') value = Math.max(1, Math.floor(((prev?.value ?? cost) * between(rng, 95, 105)) / 100));
  else value = between(rng, 0, 150);
  return { sku, source, value, seq: (prev?.seq ?? 0) + 1 };
}

async function loadSkuInto(doc: DynamoDBDocumentClient, table: string, sku: string, ledger: SimLedger): Promise<void> {
  const res = await doc.send(new QueryCommand({
    TableName: table,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)',
    ExpressionAttributeValues: { ':pk': `SKU#${sku}`, ':p': 'INPUT#' },
    ConsistentRead: true,
  }));
  for (const it of res.Items ?? []) {
    const source = String(it['SK']).slice(6);
    if (source === 'COST' || source === 'COMPETITOR' || source === 'INVENTORY') ledger.set(sku, source, Number(it['value']), Number(it['seq']));
  }
}

export interface SimOptions {
  doc: DynamoDBDocumentClient;
  table: string;
  skus: string[];
  rate: number;
  durationS: number;
  seed: number;
  mix: SimMix;
  log: (line: string) => void;
  signal?: AbortSignal;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runSim(opts: SimOptions): Promise<{ writes: number; skipped: number }> {
  const ledger = new MapLedger();
  for (const sku of opts.skus) await loadSkuInto(opts.doc, opts.table, sku, ledger);
  const rng = mulberry32(opts.seed);
  const t0 = Date.now();
  const total = opts.durationS > 0 ? Math.floor(opts.rate * opts.durationS) : Number.POSITIVE_INFINITY;
  let writes = 0;
  let skipped = 0;
  for (let i = 0; i < total && !opts.signal?.aborted; i++) {
    const delay = t0 + (i * 1000) / opts.rate - Date.now();
    if (delay > 0) await sleep(delay);
    const c = nextChange(rng, ledger, opts.skus, opts.mix);
    try {
      await opts.doc.send(new PutCommand({
        TableName: opts.table,
        Item: { PK: `SKU#${c.sku}`, SK: `INPUT#${c.source}`, value: c.value, seq: c.seq, observedAt: new Date().toISOString() },
        ConditionExpression: 'attribute_not_exists(SK) OR #seq < :seq',
        ExpressionAttributeNames: { '#seq': 'seq' },
        ExpressionAttributeValues: { ':seq': c.seq },
      }));
      ledger.set(c.sku, c.source, c.value, c.seq);
      writes++;
      opts.log(`${c.sku} ${c.source}=${c.value} seq=${c.seq}`);
    } catch (e) {
      if ((e as Error).name !== 'ConditionalCheckFailedException') throw e;
      skipped++;
      await loadSkuInto(opts.doc, opts.table, c.sku, ledger);
      opts.log(`resync ${c.sku}`);
    }
  }
  return { writes, skipped };
}
