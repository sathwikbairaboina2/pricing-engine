import { createClient } from 'graphql-ws';
import WebSocket from 'ws';

export interface WatchOptions {
  wsUrl: string;
  httpUrl: string;
  category?: string;
  skus?: string[];
  seconds?: number;
  print: (line: string) => void;
  signal?: AbortSignal;
}

const CATEGORIES = ['coffee', 'tea', 'cocoa'];

async function skusFor(httpUrl: string, categories: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const category of categories) {
    const res = await fetch(httpUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'query($c: String!) { pricesByCategory(category: $c, limit: 100) { sku } }', variables: { c: category } }),
    });
    const json = (await res.json()) as { data?: { pricesByCategory?: Array<{ sku: string }> } };
    out.push(...(json.data?.pricesByCategory ?? []).map((p) => p.sku));
  }
  return out;
}

const clock = (d: Date) => d.toISOString().slice(11, 23);

export async function watch(opts: WatchOptions): Promise<number> {
  const skus = opts.skus ?? (await skusFor(opts.httpUrl, opts.category ? [opts.category] : CATEGORIES));
  const client = createClient({ url: opts.wsUrl, webSocketImpl: WebSocket });
  const last = new Map<string, number>();
  let ticks = 0;
  const disposers = skus.map((sku) =>
    client.subscribe(
      { query: 'subscription($sku: ID!) { onPriceChanged(sku: $sku) { sku priceMinor currency inputsVersion } }', variables: { sku } },
      {
        next: (msg) => {
          const p = msg.data?.['onPriceChanged'] as { sku: string; priceMinor: number; currency: string; inputsVersion: number } | undefined;
          if (!p) return;
          const prev = last.get(p.sku);
          const arrow = prev === undefined ? ' ' : p.priceMinor > prev ? '▲' : p.priceMinor < prev ? '▼' : '=';
          last.set(p.sku, p.priceMinor);
          ticks++;
          opts.print(`${clock(new Date())}  ${p.sku}  ${(p.priceMinor / 100).toFixed(2)} ${p.currency}  ${arrow} v${p.inputsVersion}`);
        },
        error: () => {},
        complete: () => {},
      },
    ),
  );
  await new Promise<void>((resolve) => {
    if (opts.seconds !== undefined) setTimeout(resolve, opts.seconds * 1000);
    opts.signal?.addEventListener('abort', () => resolve());
  });
  for (const d of disposers) d();
  await client.dispose();
  return ticks;
}
