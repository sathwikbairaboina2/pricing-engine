import type { DynamoDBBatchResponse, DynamoDBStreamEvent } from 'aws-lambda';
import { SK } from './keys.js';
import { DEFAULT_CONCURRENCY, mapLimit } from './concurrency.js';
import { newImage, oldImage, recordKeys, recordSku } from './stream.js';

export interface PriceMessage { sku: string; priceMinor: number; currency: string; inputsVersion: number; ruleSetVersion: number; computedAt: string }
export interface PricePublisher { publish(msg: PriceMessage): Promise<void> }

export const PUBLISH_PRICE_MUTATION =
  'mutation PublishPrice($input: PriceInput!) { publishPrice(input: $input) { sku priceMinor currency inputsVersion ruleSetVersion computedAt } }';

export class PublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublishError';
  }
}

function pick(n: Record<string, unknown>): PriceMessage {
  return {
    sku: String(n['sku']),
    priceMinor: Number(n['priceMinor']),
    currency: String(n['currency']),
    inputsVersion: Number(n['inputsVersion']),
    ruleSetVersion: Number(n['ruleSetVersion']),
    computedAt: String(n['computedAt']),
  };
}

export function createPublisherHandler(deps: {
  publisher: PricePublisher;
  log?: (e: Record<string, unknown>) => void;
  concurrency?: number;
}): (event: DynamoDBStreamEvent) => Promise<DynamoDBBatchResponse> {
  const log = deps.log ?? ((e: Record<string, unknown>) => console.log(JSON.stringify(e)));
  return async (event) => {
    // Records of one SKU stay in order; different SKUs are published concurrently.
    const groups = new Map<string, number[]>();
    event.Records.forEach((r, idx) => {
      const k = recordSku(r) ?? `#${idx}`;
      const list = groups.get(k) ?? [];
      list.push(idx);
      groups.set(k, list);
    });
    const failedIdx = new Set<number>();
    const lists = [...groups.values()];
    await mapLimit(lists.length, deps.concurrency ?? DEFAULT_CONCURRENCY, async (g) => {
      const group = lists[g]!;
      for (let pos = 0; pos < group.length; pos++) {
        const idx = group[pos]!;
        const r = event.Records[idx]!;
        if (r.eventName !== 'INSERT' && r.eventName !== 'MODIFY') continue;
        if (recordKeys(r)?.SK !== SK.PRICE_CURRENT) continue;
        const n = newImage(r);
        if (!n) continue;
        const o = oldImage(r);
        const sku = String(n['sku']);
        if (o && o['priceMinor'] === n['priceMinor']) { log({ msg: 'publish', sku, outcome: 'UNCHANGED' }); continue; }
        try {
          await deps.publisher.publish(pick(n));
          log({ msg: 'publish', sku, outcome: 'PUBLISHED' });
        } catch (e) {
          log({ msg: 'publish', sku, outcome: 'ERROR', error: e instanceof Error ? e.message : String(e) });
          // Retry restarts at the lowest failed sequence number; fail the rest of the group so a newer price is not published before the older one.
          for (const rest of group.slice(pos)) failedIdx.add(rest);
          break;
        }
      }
    });
    const batchItemFailures = [...failedIdx].sort((a, b) => a - b)
      .map((idx) => event.Records[idx]!.dynamodb?.SequenceNumber)
      .filter((s): s is string => s !== undefined)
      .map((itemIdentifier) => ({ itemIdentifier }));
    return { batchItemFailures };
  };
}

export async function postGraphql(
  doFetch: typeof fetch,
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<void> {
  const res = await doFetch(url, { method: 'POST', headers, body });
  let json: { errors?: Array<{ message?: string }> } = {};
  try {
    json = (await res.json()) as typeof json;
  } catch {
    // non-JSON body; the status decides below
  }
  if (!res.ok || (json.errors && json.errors.length > 0)) {
    const msgs = (json.errors ?? []).map((e) => e.message ?? 'error').join('; ');
    throw new PublishError(`publish failed: HTTP ${res.status}${msgs ? ` ${msgs}` : ''}`);
  }
}

export function publishBody(msg: PriceMessage): string {
  return JSON.stringify({ query: PUBLISH_PRICE_MUTATION, variables: { input: msg } });
}
