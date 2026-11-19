// Live gold market data. Primary source: Binance PAXG/USDT (PAX Gold, 1 token = 1 troy oz of LBMA gold),
// which gives real 1D history and a realtime WebSocket. Fallback: gold-api.com spot polling.
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';

export interface Candle { t: number; o: number; h: number; l: number; c: number }
export type Range = '1H' | '1D' | '1W' | '1M';
export const RANGES: Record<Range, { interval: string; ms: number; limit: number }> = {
  '1H': { interval: '1m', ms: 60_000, limit: 60 },
  '1D': { interval: '5m', ms: 300_000, limit: 288 },
  '1W': { interval: '1h', ms: 3_600_000, limit: 168 },
  '1M': { interval: '4h', ms: 14_400_000, limit: 180 },
};

const REST = ['https://data-api.binance.vision/api/v3', 'https://api.binance.com/api/v3'];
const WS = ['wss://data-stream.binance.vision/stream', 'wss://stream.binance.com:9443/stream'];
const SYMBOL = 'PAXGUSDT';

export async function fetchKlines(interval: string, opts: { limit?: number; startTime?: number; endTime?: number } = {}): Promise<Candle[]> {
  const q = new URLSearchParams({ symbol: SYMBOL, interval, limit: String(opts.limit ?? 500) });
  if (opts.startTime) q.set('startTime', String(opts.startTime));
  if (opts.endTime) q.set('endTime', String(opts.endTime));
  let lastErr: unknown;
  for (const base of REST) {
    try {
      const r = await fetch(`${base}/klines?${q}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const rows = (await r.json()) as unknown[][];
      return rows.map((k) => ({ t: Number(k[0]), o: +(k[1] as string), h: +(k[2] as string), l: +(k[3] as string), c: +(k[4] as string) }));
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

/** Paginates klines from startTime to now (max ~20 pages). */
export async function fetchKlinesSince(interval: string, ms: number, startTime: number, endTime = Date.now()): Promise<Candle[]> {
  const out: Candle[] = [];
  let from = startTime;
  for (let page = 0; page < 20 && from < endTime; page++) {
    const batch = await fetchKlines(interval, { startTime: from, endTime, limit: 1000 });
    if (!batch.length) break;
    out.push(...batch);
    from = batch[batch.length - 1].t + ms;
    if (batch.length < 1000) break;
  }
  return out;
}

interface MarketState {
  price: number | null;
  open24: number | null;
  high24: number | null;
  low24: number | null;
  source: 'live' | 'polling' | 'connecting' | 'offline';
  lastTick: number | null;
  subscribe: (fn: (price: number, t: number) => void) => () => void;
  onCandle: (fn: (interval: string, c: Candle, closed: boolean) => void) => () => void;
}

const Ctx = createContext<MarketState>(null as unknown as MarketState);
export const useMarket = () => useContext(Ctx);

export function MarketProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<MarketState, 'subscribe' | 'onCandle'>>({ price: null, open24: null, high24: null, low24: null, source: 'connecting', lastTick: null });
  const tickSubs = useRef(new Set<(p: number, t: number) => void>());
  const candleSubs = useRef(new Set<(i: string, c: Candle, closed: boolean) => void>());

  useEffect(() => {
    let ws: WebSocket | null = null;
    let alive = true;
    let attempt = 0;
    let pollTimer: number | undefined;
    let lastPush = 0;

    const emitTick = (p: number, t: number) => {
      tickSubs.current.forEach((f) => f(p, t));
      if (t - lastPush > 900) { lastPush = t; setState((s) => ({ ...s, price: p, lastTick: t, source: 'live' })); }
    };

    const poll = async () => {
      try {
        const r = await fetch('https://api.gold-api.com/price/XAU');
        const j = await r.json();
        const p = Number(j.price);
        if (p > 0 && alive) { tickSubs.current.forEach((f) => f(p, Date.now())); setState((s) => ({ ...s, price: p, lastTick: Date.now(), source: 'polling' })); }
      } catch { if (alive) setState((s) => ({ ...s, source: s.price ? s.source : 'offline' })); }
    };

    const connect = () => {
      const url = `${WS[attempt % WS.length]}?streams=${SYMBOL.toLowerCase()}@kline_1m/${SYMBOL.toLowerCase()}@kline_5m/${SYMBOL.toLowerCase()}@ticker`;
      ws = new WebSocket(url);
      const failTimer = window.setTimeout(() => ws?.close(), 8000);
      ws.onopen = () => { clearTimeout(failTimer); clearInterval(pollTimer); pollTimer = undefined; };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        const d = msg.data;
        if (!d) return;
        if (d.e === '24hrTicker') {
          setState((s) => ({ ...s, open24: +d.o, high24: +d.h, low24: +d.l }));
          emitTick(+d.c, d.E);
        } else if (d.e === 'kline') {
          const k = d.k;
          const c: Candle = { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c };
          candleSubs.current.forEach((f) => f(k.i, c, k.x));
          if (k.i === '1m') emitTick(c.c, d.E);
        }
      };
      ws.onclose = () => {
        clearTimeout(failTimer);
        if (!alive) return;
        attempt++;
        if (!pollTimer) { poll(); pollTimer = window.setInterval(poll, 30_000); }
        window.setTimeout(connect, Math.min(30_000, 1500 * attempt));
      };
    };

    // Seed 24h stats and price from REST immediately
    (async () => {
      for (const base of REST) {
        try {
          const r = await fetch(`${base}/ticker/24hr?symbol=${SYMBOL}`);
          if (!r.ok) continue;
          const j = await r.json();
          if (alive) setState((s) => ({ ...s, price: s.price ?? +j.lastPrice, open24: +j.openPrice, high24: +j.highPrice, low24: +j.lowPrice }));
          return;
        } catch { /* try next */ }
      }
      poll();
    })();
    connect();
    return () => { alive = false; clearInterval(pollTimer); ws?.close(); };
  }, []);

  const subscribe = useCallback((fn: (p: number, t: number) => void) => { tickSubs.current.add(fn); return () => { tickSubs.current.delete(fn); }; }, []);
  const onCandle = useCallback((fn: (i: string, c: Candle, closed: boolean) => void) => { candleSubs.current.add(fn); return () => { candleSubs.current.delete(fn); }; }, []);

  return <Ctx.Provider value={{ ...state, subscribe, onCandle }}>{children}</Ctx.Provider>;
}

/** Candles for a range, kept live from the tick stream. */
export function useCandles(range: Range) {
  const { subscribe } = useMarket();
  const [candles, setCandles] = useState<Candle[]>([]);
  const [error, setError] = useState(false);
  const cfg = RANGES[range];

  useEffect(() => {
    let alive = true;
    setCandles([]);
    setError(false);
    fetchKlines(cfg.interval, { limit: cfg.limit }).then((c) => alive && setCandles(c)).catch(() => alive && setError(true));
    const refetch = window.setInterval(() => fetchKlines(cfg.interval, { limit: cfg.limit }).then((c) => alive && setCandles(c)).catch(() => {}), 5 * 60_000);
    const unsub = subscribe((p, t) => {
      setCandles((cs) => {
        if (!cs.length) return error ? [{ t, o: p, h: p, l: p, c: p }] : cs;
        const last = cs[cs.length - 1];
        if (t >= last.t + cfg.ms) {
          const bucket = last.t + Math.floor((t - last.t) / cfg.ms) * cfg.ms;
          return [...cs.slice(cs.length >= cfg.limit ? 1 : 0), { t: bucket, o: p, h: p, l: p, c: p }];
        }
        if (last.c === p) return cs;
        const next = cs.slice();
        next[next.length - 1] = { ...last, c: p, h: Math.max(last.h, p), l: Math.min(last.l, p) };
        return next;
      });
    });
    return () => { alive = false; clearInterval(refetch); unsub(); };
  }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  return { candles, error };
}
