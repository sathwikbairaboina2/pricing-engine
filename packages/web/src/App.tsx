import { useEffect, useMemo, useReducer, useState } from 'react';
import { onConnection, query, subscribePrices, type ConnectionState } from './gql.js';
import { applyPrice, direction, formatMinor, type Price, type Rows } from './priceStore.js';

const CATEGORIES = ['coffee', 'tea', 'cocoa'] as const;
const FLASH_MS = 800;

interface TraceStep { ruleId: string; beforeMinor: number; afterMinor: number; note: string | null }

type Action = { type: 'price'; price: Price; at: number } | { type: 'reset'; rows: Price[] };
function reducer(rows: Rows, a: Action): Rows {
  if (a.type === 'reset') return a.rows.reduce<Rows>((acc, p) => applyPrice(acc, p, 0), {});
  return applyPrice(rows, a.price, a.at);
}

const PRICES_QUERY = 'query($c: String!) { pricesByCategory(category: $c, limit: 100) { sku priceMinor currency inputsVersion ruleSetVersion computedAt } }';
const DECISION_QUERY = 'query($sku: ID!) { decision(sku: $sku) { trace { ruleId beforeMinor afterMinor note } } }';

export function App() {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('coffee');
  const [rows, dispatch] = useReducer(reducer, {});
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [conn, setConn] = useState<ConnectionState>('connecting');
  const [selected, setSelected] = useState<string | undefined>();
  const [trace, setTrace] = useState<TraceStep[] | undefined>();
  const [, tick] = useReducer((n: number) => n + 1, 0);

  useEffect(() => onConnection(setConn), []);

  useEffect(() => {
    let off = () => {};
    let cancelled = false;
    setStatus('loading');
    setSelected(undefined);
    query<{ pricesByCategory: Price[] }>(PRICES_QUERY, { c: category })
      .then((d) => {
        if (cancelled) return;
        dispatch({ type: 'reset', rows: d.pricesByCategory });
        off = subscribePrices(d.pricesByCategory.map((p) => p.sku), (price) => dispatch({ type: 'price', price, at: Date.now() }));
        setStatus('ready');
      })
      .catch((e: unknown) => { if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setStatus('error'); } });
    return () => { cancelled = true; off(); };
  }, [category]);

  useEffect(() => {
    if (!selected) { setTrace(undefined); return; }
    let cancelled = false;
    setTrace(undefined);
    query<{ decision: { trace: TraceStep[] } | null }>(DECISION_QUERY, { sku: selected })
      .then((d) => { if (!cancelled) setTrace(d.decision?.trace ?? []); })
      .catch(() => { if (!cancelled) setTrace([]); });
    return () => { cancelled = true; };
  }, [selected, rows[selected ?? '']?.inputsVersion]);

  // Re-render once the flash window of the newest change has passed so the highlight clears.
  const newest = useMemo(() => Math.max(0, ...Object.values(rows).map((r) => r.changedAt ?? 0)), [rows]);
  useEffect(() => {
    if (!newest) return;
    const t = setTimeout(tick, FLASH_MS + 50);
    return () => clearTimeout(t);
  }, [newest]);

  const list = Object.values(rows).sort((a, b) => a.sku.localeCompare(b.sku));
  const now = Date.now();

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Live prices</h1>
          <p className="sub">local pipeline: DynamoDB Local + stream runner + GraphQL shim</p>
        </div>
        <div className={`conn conn-${conn}`} role="status">{conn === 'live' ? 'connected' : conn === 'connecting' ? 'connecting' : 'disconnected'}</div>
      </header>

      <nav className="tabs" aria-label="Category">
        {CATEGORIES.map((c) => (
          <button key={c} className={c === category ? 'tab active' : 'tab'} onClick={() => setCategory(c)}>{c}</button>
        ))}
      </nav>

      <main className={selected ? 'layout with-panel' : 'layout'}>
        <section aria-live="off">
          {status === 'loading' && <div className="grid" aria-busy="true">{Array.from({ length: 8 }, (_, i) => <div key={i} className="card skeleton" />)}</div>}
          {status === 'error' && <p className="error">Could not load prices: {error}. Is the shim running on port 5361?</p>}
          {status === 'ready' && list.length === 0 && <p className="empty">No prices yet. Run <code>pnpm local sim</code> to generate input changes.</p>}
          {status === 'ready' && list.length > 0 && (
            <div className="grid">
              {list.map((r) => {
                const dir = direction(r);
                const flashing = r.changedAt !== undefined && now - r.changedAt < FLASH_MS;
                return (
                  <button key={r.sku} className={`card${flashing ? ` flash-${dir}` : ''}${selected === r.sku ? ' selected' : ''}`} onClick={() => setSelected(r.sku)}>
                    <span className="sku">{r.sku}</span>
                    <span className="price">{formatMinor(r.priceMinor, r.currency)}</span>
                    <span className="meta">
                      <span className={`dir dir-${dir}`}>{dir === 'up' ? '▲' : dir === 'down' ? '▼' : ''}</span>
                      <span>v{r.inputsVersion}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {selected && (
          <aside className="panel" aria-label={`Decision trace for ${selected}`}>
            <div className="panel-head">
              <h2>{selected}</h2>
              <button className="close" onClick={() => setSelected(undefined)} aria-label="Close panel">Close</button>
            </div>
            {trace === undefined && <p className="empty">Loading trace</p>}
            {trace && trace.length === 0 && <p className="empty">No trace stored for this SKU.</p>}
            {trace && trace.length > 0 && (
              <table>
                <thead><tr><th>rule</th><th>before</th><th>after</th><th>note</th></tr></thead>
                <tbody>
                  {trace.map((t, i) => (
                    <tr key={`${t.ruleId}-${i}`}>
                      <td>{t.ruleId}</td>
                      <td className="num">{(t.beforeMinor / 100).toFixed(2)}</td>
                      <td className="num">{(t.afterMinor / 100).toFixed(2)}</td>
                      <td>{t.note ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </aside>
        )}
      </main>

      <footer className="foot">No sign-in in the local demo. The AWS stack uses Cognito; see ADR 0005.</footer>
    </div>
  );
}
