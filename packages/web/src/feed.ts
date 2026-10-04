import type { Price } from './priceStore.js';

export interface FeedOptions {
  load: () => Promise<Price[]>;
  /** Subscribes to the given SKUs and returns one function that cancels all of them. */
  subscribe: (skus: string[]) => () => void;
  onRows: (rows: Price[]) => void;
  /** 'ready' after any successful load, `error:<message>` after a failed one. */
  onStatus: (status: string) => void;
  /** Poll interval while no SKU has been seen yet. */
  emptyRetryMs: number;
  /** Poll interval once rows exist, to pick up SKUs priced after the page loaded. */
  refreshMs: number;
}

/**
 * Loads the price list, subscribes to every SKU it has not seen before, and keeps polling so a grid opened before the
 * runner has priced anything (or SKUs priced later) still fills in. Retries after errors.
 */
export function startFeed(opts: FeedOptions): { stop: () => void; reconnect: () => void } {
  const known = new Set<string>();
  const offs: Array<() => void> = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(() => void poll(), known.size === 0 ? opts.emptyRetryMs : opts.refreshMs);
  };

  async function poll(): Promise<void> {
    if (timer) clearTimeout(timer);
    try {
      const rows = await opts.load();
      if (stopped) return;
      opts.onRows(rows);
      const fresh = rows.map((r) => r.sku).filter((s) => !known.has(s));
      if (fresh.length > 0) {
        fresh.forEach((s) => known.add(s));
        offs.push(opts.subscribe(fresh));
      }
      opts.onStatus('ready');
    } catch (e) {
      if (stopped) return;
      opts.onStatus(`error:${e instanceof Error ? e.message : String(e)}`);
    }
    schedule();
  }

  void poll();

  return {
    stop: () => { stopped = true; if (timer) clearTimeout(timer); offs.forEach((off) => off()); offs.length = 0; },
    // graphql-ws reopens the socket but does not resume subscriptions, so subscribe again to everything known.
    reconnect: () => {
      if (stopped) return;
      offs.forEach((off) => off());
      offs.length = 0;
      if (known.size > 0) offs.push(opts.subscribe([...known]));
      void poll();
    },
  };
}
