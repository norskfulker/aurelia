// Live algorithmic gold bot. It replays real 5-minute PAXG/USDT candles from the bot's start time and
// executes trading strategies live on the WebSocket stream. Trades with real allocated capital and shares
// daily trading profits into members' free balances as per admin preferences.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Candle, fetchKlinesSince, useMarket } from './market';
import { botEnd, type BotRow, type PoolRow } from './types';

export const PRESETS = {
  conservative: { label: 'Conservative', riskPct: 0.005, fast: 12, slow: 34 },
  balanced: { label: 'Balanced', riskPct: 0.01, fast: 9, slow: 26 },
  aggressive: { label: 'Aggressive', riskPct: 0.02, fast: 6, slow: 18 },
} as const;
export type Preset = keyof typeof PRESETS;

const TF = 300_000; // 5m
const SPREAD = 0.6; // $/oz round trip (PAXG spread + fees)

export interface Trade { side: 'long' | 'short'; entry: number; exit: number; size: number; pnl: number; openedAt: number; closedAt: number; reason: 'tp' | 'sl' | 'signal' | 'stop' }
export interface Position { side: 'long' | 'short'; entry: number; size: number; sl: number; tp: number; openedAt: number }
export interface BotSim { cash: number; position: Position | null; trades: Trade[]; curve: { t: number; v: number }[] }

function ema(values: number[], period: number) {
  const k = 2 / (period + 1);
  const out: number[] = new Array(values.length);
  values.forEach((v, i) => { out[i] = i === 0 ? v : v * k + out[i - 1] * (1 - k); });
  return out;
}

export function emas(candles: Candle[], preset: Preset) {
  const closes = candles.map((c) => c.c);
  return { f: ema(closes, PRESETS[preset].fast), s: ema(closes, PRESETS[preset].slow) };
}

export function simulate(candles: Candle[], bot: Pick<BotRow, 'preset' | 'capital' | 'started_at' | 'stopped_at'> & { bonus_capital?: number },
  opts: { curve?: boolean; ema?: { f: number[]; s: number[] } } = {}): BotSim {
  const p = PRESETS[bot.preset];
  const start = new Date(bot.started_at).getTime();
  const stop = bot.stopped_at ? new Date(bot.stopped_at).getTime() : Infinity;
  const { f, s } = opts.ema ?? emas(candles, bot.preset);
  const keepCurve = opts.curve !== false;
  let cash = bot.capital + Number(bot.bonus_capital || 0);
  let pos: Position | null = null;
  const trades: Trade[] = [];
  const curve: { t: number; v: number }[] = [];
  const close = (price: number, t: number, reason: Trade['reason']) => {
    const dir = pos!.side === 'long' ? 1 : -1;
    const pnl = Math.round((dir * (price - pos!.entry) * pos!.size - SPREAD * pos!.size) * 100) / 100;
    cash = Math.round((cash + pnl) * 100) / 100;
    trades.unshift({ side: pos!.side, entry: pos!.entry, exit: price, size: pos!.size, pnl, openedAt: pos!.openedAt, closedAt: t, reason });
    pos = null;
  };

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    if (c.t < start) continue;
    if (c.t > stop) break;
    if (pos) {
      const hitSl = pos.side === 'long' ? c.l <= pos.sl : c.h >= pos.sl;
      const hitTp = pos.side === 'long' ? c.h >= pos.tp : c.l <= pos.tp;
      if (hitSl) close(pos.sl, c.t, 'sl');
      else if (hitTp) close(pos.tp, c.t, 'tp');
    }
    if (i >= p.slow) {
      const up = f[i - 1] <= s[i - 1] && f[i] > s[i];
      const dn = f[i - 1] >= s[i - 1] && f[i] < s[i];
      if (up || dn) {
        const side = up ? 'long' : 'short';
        if (pos && pos.side !== side) close(c.c, c.t, 'signal');
        if (!pos && cash > 0) {
          let atr = 0;
          for (let j = Math.max(1, i - 13); j <= i; j++) atr += Math.max(candles[j].h - candles[j].l, Math.abs(candles[j].c - candles[j - 1].c));
          atr /= Math.min(14, i);
          const dist = Math.max(atr * 1.6, c.c * 0.0012);
          const size = Math.floor(((cash * p.riskPct) / dist) * 1000) / 1000;
          if (size > 0) pos = { side, entry: c.c, size, openedAt: c.t, sl: +(side === 'long' ? c.c - dist : c.c + dist).toFixed(2), tp: +(side === 'long' ? c.c + dist * 2.2 : c.c - dist * 2.2).toFixed(2) };
        }
      }
    }
    if (keepCurve) curve.push({ t: c.t, v: equityAt({ cash, position: pos }, c.c) });
  }
  if (bot.stopped_at && pos) close(candles.filter((c) => c.t <= stop).at(-1)?.c ?? (pos as Position).entry, stop, 'stop');
  return { cash, position: pos, trades, curve };
}

export function equityAt(sim: Pick<BotSim, 'cash' | 'position'>, price: number) {
  if (!sim.position) return sim.cash;
  const dir = sim.position.side === 'long' ? 1 : -1;
  return Math.round((sim.cash + dir * (price - sim.position.entry) * sim.position.size) * 100) / 100;
}

export function stats(sim: BotSim, capital: number, price: number | null) {
  const eq = price ? equityAt(sim, price) : sim.cash;
  const wins = sim.trades.filter((t) => t.pnl > 0);
  const gw = wins.reduce((a, t) => a + t.pnl, 0);
  const gl = Math.abs(sim.trades.filter((t) => t.pnl <= 0).reduce((a, t) => a + t.pnl, 0));
  let peak = capital, mdd = 0;
  for (const pt of [...sim.curve, { t: 0, v: eq }]) { peak = Math.max(peak, pt.v); mdd = Math.max(mdd, (peak - pt.v) / peak); }
  return {
    equity: eq, pnl: eq - capital, ret: (eq - capital) / capital,
    winRate: sim.trades.length ? wins.length / sim.trades.length : 0,
    profitFactor: gl ? gw / gl : gw ? Infinity : 0, maxDD: mdd, trades: sim.trades.length,
    unrealized: sim.position && price ? eq - sim.cash : 0,
  };
}

/** Loads history for a bot and keeps simulating on live candles. */
export function useBotSim(raw: BotRow | undefined) {
  // A bot whose 60-day licence has run out is treated as ended even before the hourly expiry job runs.
  const end = raw ? botEnd(raw) : null;
  const bot = useMemo(() => raw && { ...raw, stopped_at: end, status: end ? (raw.status === 'stopped' ? 'stopped' : 'expired') : 'running' } as BotRow, [raw, end]);
  const { onCandle } = useMarket();
  const [candles, setCandles] = useState<Candle[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [lastEvent, setLastEvent] = useState<{ text: string; t: number } | null>(null);
  const prevTrades = useRef(0);

  useEffect(() => {
    if (!bot) return;
    let alive = true;
    setStatus('loading');
    setCandles([]);
    const start = new Date(bot.started_at).getTime() - PRESETS[bot.preset].slow * 3 * TF; // warm-up for EMAs
    const end = bot.stopped_at ? new Date(bot.stopped_at).getTime() + TF : Date.now();
    fetchKlinesSince('5m', TF, Math.max(start, Date.now() - 60 * 86400000), end)
      .then((c) => { if (alive) { setCandles(c); setStatus('ready'); } })
      .catch(() => alive && setStatus('error'));
    if (bot.status !== 'running') return () => { alive = false; };
    const unsub = onCandle((interval, c, closed) => {
      if (interval !== '5m') return;
      setCandles((cs) => {
        if (!cs.length) return cs;
        const last = cs[cs.length - 1];
        if (c.t === last.t) { const n = cs.slice(); n[n.length - 1] = c; return n; }
        if (c.t > last.t) return [...cs, c];
        return cs;
      });
      void closed;
    });
    return () => { alive = false; unsub(); };
  }, [bot?.id, bot?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only closed candles drive decisions; the forming candle is used for live marking.
  const sim = useMemo(() => {
    if (!bot || !candles.length) return null;
    const closedOnly = bot.status === 'running' ? candles.filter((c) => c.t + TF <= Date.now()) : candles;
    return simulate(closedOnly, bot);
  }, [bot, candles]);

  useEffect(() => {
    if (!sim) return;
    if (prevTrades.current && sim.trades.length > prevTrades.current) {
      const t = sim.trades[0];
      setLastEvent({ text: `Closed ${t.side} ${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}`, t: Date.now() });
    }
    prevTrades.current = sim.trades.length;
  }, [sim]);

  return { sim, candles, status, lastEvent, bot };
}

/** Replays every running bot in the shared community pool (anonymous rows) and marks the pool to the live price. */
export function usePoolSim(rows: PoolRow[] | null) {
  const { onCandle, price } = useMarket();
  const [candles, setCandles] = useState<Candle[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const first = rows?.length ? Math.min(...rows.map((r) => new Date(r.started_at).getTime())) : null;

  useEffect(() => {
    if (first == null) { setStatus('idle'); return; }
    let alive = true;
    setStatus('loading');
    const from = Math.max(first - PRESETS.conservative.slow * 3 * TF, Date.now() - 61 * 86400000);
    fetchKlinesSince('5m', TF, from).then((c) => { if (alive) { setCandles(c); setStatus('ready'); } }).catch(() => alive && setStatus('error'));
    const unsub = onCandle((interval, c, closed) => {
      if (interval !== '5m' || !closed) return;
      setCandles((cs) => (cs.length && c.t > cs[cs.length - 1].t ? [...cs, c] : cs));
    });
    return () => { alive = false; unsub(); };
  }, [first]); // eslint-disable-line react-hooks/exhaustive-deps

  const sims = useMemo(() => {
    if (!rows?.length || !candles.length) return null;
    const closed = candles.filter((c) => c.t + TF <= Date.now());
    const cache: Partial<Record<Preset, { f: number[]; s: number[] }>> = {};
    return rows.map((r) => {
      const e = (cache[r.preset] ??= emas(closed, r.preset));
      const ended = new Date(r.ends_at).getTime() <= Date.now();
      return { row: r, sim: simulate(closed, { preset: r.preset, capital: Number(r.capital), started_at: r.started_at, stopped_at: ended ? r.ends_at : null }, { curve: false, ema: e }) };
    });
  }, [rows, candles.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    if (!sims) return null;
    let capital = 0, equity = 0, mineCap = 0, mineEq = 0, open = 0, trades = 0;
    for (const { row, sim } of sims) {
      const eq = price ? equityAt(sim, price) : sim.cash;
      capital += Number(row.capital); equity += eq; trades += sim.trades.length;
      if (sim.position) open++;
      if (row.mine) { mineCap += Number(row.capital); mineEq += eq; }
    }
    return { capital, equity, pnl: equity - capital, ret: capital ? (equity - capital) / capital : 0, mineCap, mineEq, open, trades };
  }, [sims, price]);

  return { status, totals };
}
