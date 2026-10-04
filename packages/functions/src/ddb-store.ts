import { GetCommand, QueryCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { InvalidRuleSetError, parseRuleSet, INPUT_SOURCES, type InputSource, type Inputs, type Override, type RuleSet } from 'pricing-rules-core';
import { categoryPk, histPk, histSk, ruleSetPk, ruleSetVersionSk, SK, skuPk } from './keys.js';
import { RuleSetNotFoundError, type CurrentPrice, type PriceWrite, type PricingStore, type SkuMeta, type SkuState, type WriteResult } from './store.js';

export interface DynamoDBStoreOptions { doc: DynamoDBDocumentClient; tableName: string; now?: () => number; ruleSetCacheMs?: number }

export function priceItem(w: PriceWrite): Record<string, unknown> {
  return {
    PK: skuPk(w.sku),
    SK: SK.PRICE_CURRENT,
    sku: w.sku,
    category: w.meta.category,
    currency: w.meta.currency,
    priceMinor: w.decision.priceMinor,
    inputsVersion: w.decision.inputsVersion,
    ruleSetId: w.ruleSetId,
    ruleSetVersion: w.decision.ruleSetVersion,
    floorMinor: w.decision.band.floor,
    ceilingMinor: w.decision.band.ceiling,
    decisionTrace: w.decision.trace,
    computedAt: w.computedAt,
    GSI1PK: categoryPk(w.meta.category),
    GSI1SK: skuPk(w.sku),
  };
}

// Only history items expire; PRICE#CURRENT must never carry a ttl (spec section 5).
export function historyItem(w: PriceWrite): Record<string, unknown> {
  const rest = priceItem(w);
  delete rest['GSI1PK'];
  delete rest['GSI1SK'];
  return { ...rest, PK: histPk(w.sku), SK: histSk(w.decision.inputsVersion, w.decision.ruleSetVersion), ttl: w.ttlEpochSeconds };
}

export class DynamoDBStore implements PricingStore {
  private readonly doc: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly now: () => number;
  private readonly cacheMs: number;
  private readonly cache = new Map<string, { ruleSet: RuleSet; loadedAt: number }>();

  constructor(opts: DynamoDBStoreOptions) {
    this.doc = opts.doc;
    this.tableName = opts.tableName;
    this.now = opts.now ?? (() => Date.now());
    this.cacheMs = opts.ruleSetCacheMs ?? 30000;
  }

  async loadSku(sku: string): Promise<SkuState | undefined> {
    const items: Record<string, unknown>[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const res = await this.doc.send(new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': skuPk(sku) },
        ConsistentRead: true,
        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      }));
      items.push(...(res.Items ?? []));
      startKey = res.LastEvaluatedKey;
    } while (startKey);

    let meta: SkuMeta | undefined;
    const inputs: Inputs = {};
    let override: Override | undefined;
    let current: CurrentPrice | undefined;
    for (const it of items) {
      const sk = String(it['SK']);
      if (sk === SK.META) {
        meta = { name: String(it['name']), category: String(it['category']), currency: String(it['currency']), ruleSetId: String(it['ruleSetId']) };
      } else if (sk.startsWith('INPUT#')) {
        const source = sk.slice(6) as InputSource;
        if ((INPUT_SOURCES as readonly string[]).includes(source)) inputs[source] = { value: Number(it['value']), seq: Number(it['seq']) };
      } else if (sk === SK.OVERRIDE) {
        override = { priceMinor: Number(it['priceMinor']), expiresAt: Number(it['expiresAt']), seq: Number(it['seq']) };
      } else if (sk === SK.PRICE_CURRENT) {
        current = { priceMinor: Number(it['priceMinor']), inputsVersion: Number(it['inputsVersion']), ruleSetVersion: Number(it['ruleSetVersion']), computedAt: String(it['computedAt']) };
      }
    }
    if (!meta) return undefined;
    return { sku, meta, inputs, ...(override ? { override } : {}), ...(current ? { current } : {}) };
  }

  async loadActiveRuleSet(id: string): Promise<RuleSet> {
    const cached = this.cache.get(id);
    if (cached && this.now() - cached.loadedAt < this.cacheMs) return cached.ruleSet;
    const active = await this.doc.send(new GetCommand({ TableName: this.tableName, Key: { PK: ruleSetPk(id), SK: SK.ACTIVE }, ConsistentRead: true }));
    if (!active.Item) throw new RuleSetNotFoundError(id);
    const version = Number(active.Item['version']);
    const rsItem = await this.doc.send(new GetCommand({ TableName: this.tableName, Key: { PK: ruleSetPk(id), SK: ruleSetVersionSk(version) }, ConsistentRead: true }));
    if (!rsItem.Item) throw new RuleSetNotFoundError(`${id}@v${version}`);
    const ruleSet = parseRuleSet(rsItem.Item['ruleSet']);
    if (ruleSet.version !== version) {
      throw new InvalidRuleSetError([{ pointer: '/version', message: `rule set version ${ruleSet.version} does not match ACTIVE pointer ${version}` }]);
    }
    this.cache.set(id, { ruleSet, loadedAt: this.now() });
    return ruleSet;
  }

  async writePrice(w: PriceWrite): Promise<WriteResult> {
    try {
      await this.doc.send(new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.tableName,
              Item: priceItem(w),
              ConditionExpression: 'attribute_not_exists(PK) OR inputsVersion < :v OR (inputsVersion = :v AND ruleSetVersion < :r)',
              ExpressionAttributeValues: { ':v': w.decision.inputsVersion, ':r': w.decision.ruleSetVersion },
            },
          },
          {
            Put: {
              TableName: this.tableName,
              Item: historyItem(w),
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
        ],
      }));
      return 'WRITTEN';
    } catch (e) {
      const reasons = (e as { CancellationReasons?: Array<{ Code?: string }> }).CancellationReasons;
      if ((e as Error).name === 'TransactionCanceledException' && reasons?.some((r) => r.Code === 'ConditionalCheckFailed')) return 'STALE';
      throw e;
    }
  }
}
