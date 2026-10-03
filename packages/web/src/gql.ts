import { createClient } from 'graphql-ws';
import type { Price } from './priceStore.js';

export const HTTP_URL: string = import.meta.env['VITE_GQL_HTTP'] ?? 'http://localhost:5361/graphql';
export const WS_URL: string = import.meta.env['VITE_GQL_WS'] ?? 'ws://localhost:5361/graphql';

export async function query<T>(doc: string, vars: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(HTTP_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: doc, variables: vars }) });
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
  return json.data as T;
}

const client = createClient({ url: WS_URL, retryAttempts: Infinity });
export type ConnectionState = 'connecting' | 'live' | 'down';

export function onConnection(cb: (s: ConnectionState) => void): () => void {
  const offs = [
    client.on('connecting', () => cb('connecting')),
    client.on('connected', () => cb('live')),
    client.on('closed', () => cb('down')),
  ];
  return () => offs.forEach((off) => off());
}

const SUBSCRIPTION = 'subscription($sku: ID!) { onPriceChanged(sku: $sku) { sku priceMinor currency inputsVersion ruleSetVersion computedAt } }';

export function subscribePrices(skus: string[], onPrice: (p: Price) => void): () => void {
  const offs = skus.map((sku) =>
    client.subscribe<{ onPriceChanged: Price }>(
      { query: SUBSCRIPTION, variables: { sku } },
      { next: (m) => { if (m.data?.onPriceChanged) onPrice(m.data.onPriceChanged); }, error: () => {}, complete: () => {} },
    ),
  );
  return () => offs.forEach((off) => off());
}
