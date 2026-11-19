// Daily pool close at 21:00 IST (15:30 UTC). Replays every bot that was alive during the IST day on real
// PAXG/USDT 5-minute candles (same strategy as src/lib/bot.ts) and settles real performance for that day.
// Real trading: automatically distributes profits to members' Free Balance according to admin preferences.
// Callers: the pg_cron job (x-cron-secret header) or a signed-in admin (re-run a day).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ---------------------------------------------------------------- strategy (mirror of src/lib/bot.ts)
type Preset = 'conservative' | 'balanced' | 'aggressive';
const PRESETS: Record<Preset, { riskPct: number; fast: number; slow: number }> = {
  conservative: { riskPct: 0.005, fast: 12, slow: 34 },
  balanced: { riskPct: 0.01, fast: 9, slow: 26 },
  aggressive: { riskPct: 0.02, fast: 6, slow: 18 },
};
const TF = 300_000;
const SPREAD = 0.6;
const DAY = 86_400_000;
interface Candle { t: number; o: number; h: number; l: number; c: number }
interface Pos { side: 'long' | 'short'; entry: number; size: number; sl: number; tp: number }

function ema(v: number[], n: number) {
  const k = 2 / (n + 1); const out = new Array<number>(v.length);
  v.forEach((x, i) => { out[i] = i === 0 ? x : x * k + out[i - 1] * (1 - k); });
  return out;
}

/** Equity of a bot at time `at` (only candles closed by then), honouring its stop time. */
function equityAt(candles: Candle[], e: { f: number[]; s: number[] }, preset: Preset, capital: number, startMs: number, stopMs: number, at: number) {
  const p = PRESETS[preset];
  const end = Math.min(stopMs, at);
  let cash = capital; let pos: Pos | null = null; let trades = 0; let last = 0;
  const close = (price: number) => {
    const dir = pos!.side === 'long' ? 1 : -1;
    cash = Math.round((cash + Math.round((dir * (price - pos!.entry) * pos!.size - SPREAD * pos!.size) * 100) / 100) * 100) / 100;
    pos = null; trades++;
  };
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    if (c.t + TF > end) break;
    if (c.t < startMs) continue;
    last = c.c;
    if (pos) {
      const hitSl = pos.side === 'long' ? c.l <= pos.sl : c.h >= pos.sl;
      const hitTp = pos.side === 'long' ? c.h >= pos.tp : c.l <= pos.tp;
      if (hitSl) close(pos.sl); else if (hitTp) close(pos.tp);
    }
    if (i >= p.slow) {
      const up = e.f[i - 1] <= e.s[i - 1] && e.f[i] > e.s[i];
      const dn = e.f[i - 1] >= e.s[i - 1] && e.f[i] < e.s[i];
      if (up || dn) {
        const side = up ? 'long' : 'short';
        if (pos && pos.side !== side) close(c.c);
        if (!pos && cash > 0) {
          let atr = 0;
          for (let j = Math.max(1, i - 13); j <= i; j++) atr += Math.max(candles[j].h - candles[j].l, Math.abs(candles[j].c - candles[j - 1].c));
          atr /= Math.min(14, i);
          const dist = Math.max(atr * 1.6, c.c * 0.0012);
          const size = Math.floor(((cash * p.riskPct) / dist) * 1000) / 1000;
          if (size > 0) pos = { side, entry: c.c, size, sl: +(side === 'long' ? c.c - dist : c.c + dist).toFixed(2), tp: +(side === 'long' ? c.c + dist * 2.2 : c.c - dist * 2.2).toFixed(2) };
        }
      }
    }
  }
  if (pos && last) {
    if (stopMs <= at) close(last); // stopped/expired bots are flat at their stop
    else { const dir = (pos as Pos).side === 'long' ? 1 : -1; return { equity: Math.round((cash + dir * (last - (pos as Pos).entry) * (pos as Pos).size) * 100) / 100, trades }; }
  }
  return { equity: cash, trades };
}

async function klines(from: number, to: number): Promise<Candle[]> {
  const out: Candle[] = [];
  const bases = ['https://data-api.binance.vision/api/v3', 'https://api.binance.com/api/v3'];
  let start = from;
  for (let page = 0; page < 25 && start < to; page++) {
    const q = `symbol=PAXGUSDT&interval=5m&limit=1000&startTime=${start}&endTime=${to}`;
    let rows: unknown[][] | null = null; let err: unknown;
    for (const b of bases) {
      try { const r = await fetch(`${b}/klines?${q}`); if (!r.ok) throw new Error(`Binance HTTP ${r.status}`); rows = await r.json(); break; } catch (e) { err = e; }
    }
    if (!rows) throw err;
    if (!rows.length) break;
    out.push(...rows.map((k) => ({ t: Number(k[0]), o: +(k[1] as string), h: +(k[2] as string), l: +(k[3] as string), c: +(k[4] as string) })));
    start = out[out.length - 1].t + TF;
    if (rows.length < 1000) break;
  }
  return out;
}

// ---------------------------------------------------------------- handler
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // Auth: cron secret, or a signed-in admin
  let source: 'cron' | 'admin';
  const secret = req.headers.get('x-cron-secret');
  if (secret) {
    const { data } = await db.rpc('verify_cron_secret', { p_secret: secret });
    if (data !== true) return json({ error: 'Forbidden' }, 403);
    source = 'cron';
  } else {
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await db.auth.getUser(jwt);
    if (!u?.user) return json({ error: 'Not signed in' }, 401);
    const { data: m } = await db.from('members').select('role').eq('id', u.user.id).single();
    if (m?.role !== 'admin') return json({ error: 'Admins only' }, 403);
    source = 'admin';
  }

  // Which IST day: the latest 21:00 IST that has passed, or the one asked for
  const body = await req.json().catch(() => ({})) as {
    day?: string;
    custom_rate_pct?: number;
    profit_share_pct?: number;
    distribute?: boolean;
  };

  let day: string;
  if (body.day && /^\d{4}-\d{2}-\d{2}$/.test(body.day)) day = body.day;
  else {
    const now = Date.now(); const today = new Date(now).toISOString().slice(0, 10);
    const cut = Date.parse(`${today}T15:30:00Z`);
    day = now >= cut ? today : new Date(cut - DAY).toISOString().slice(0, 10);
  }
  const cutoff = Date.parse(`${day}T15:30:00Z`);
  const prevCut = cutoff - DAY;
  if (cutoff > Date.now()) return json({ error: `The ${day} close is at 21:00 IST and has not happened yet` }, 400);

  try {
    // Read platform settings for profit sharing
    const { data: s } = await db.from('settings').select('*').eq('id', 1).single();
    const sharePct = Number(body.profit_share_pct ?? s?.bot_profit_share_pct ?? 80);
    const autoDistribute = body.distribute ?? (s?.bot_auto_distribute ?? true);

    const { data: rows, error } = await db.from('bots').select('id, preset, capital, bonus_capital, started_at, stopped_at, expires_at').lt('started_at', new Date(cutoff).toISOString());
    if (error) throw error;
    const bots = (rows || []).map((b) => {
      const start = Date.parse(b.started_at);
      const stop = Math.min(b.stopped_at ? Date.parse(b.stopped_at) : Infinity, Date.parse(b.expires_at));
      return { id: b.id as string, preset: b.preset as Preset, capital: Number(b.capital) + Number(b.bonus_capital || 0), start, stop };
    }).filter((b) => b.stop > prevCut);

    let capital = 0, equity = 0, dayPnl = 0;
    const out: {
      bot_id: string; day: string; day_no: number; equity: number; day_pnl: number;
      trades: number; closed_at: string; profit_shared: number; company_fee: number; distributed: boolean;
    }[] = [];

    if (bots.length) {
      const from = Math.max(Math.min(...bots.map((b) => b.start)) - 34 * 3 * TF, cutoff - 62 * DAY);
      const candles = await klines(from, cutoff);
      if (!candles.length) throw new Error('No market data for that day');
      const closes = candles.map((c) => c.c);
      const cache: Partial<Record<Preset, { f: number[]; s: number[] }>> = {};

      for (const b of bots) {
        let pnl: number;
        let nowEq: number;
        let tradesCount = 0;

        if (body.custom_rate_pct != null) {
          // Admin specified custom performance rate for this run
          pnl = Math.round(b.capital * (body.custom_rate_pct / 100) * 100) / 100;
          nowEq = b.capital + pnl;
        } else {
          const e = (cache[b.preset] ??= { f: ema(closes, PRESETS[b.preset].fast), s: ema(closes, PRESETS[b.preset].slow) });
          const now = equityAt(candles, e, b.preset, b.capital, b.start, b.stop, cutoff);
          const prev = b.start >= prevCut ? b.capital : equityAt(candles, e, b.preset, b.capital, b.start, b.stop, prevCut).equity;
          pnl = Math.round((now.equity - prev) * 100) / 100;
          nowEq = now.equity;
          tradesCount = now.trades;
        }

        const memberShare = pnl > 0 ? Math.round(pnl * (sharePct / 100) * 100) / 100 : 0;
        const fee = pnl > 0 ? Math.round((pnl - memberShare) * 100) / 100 : 0;

        out.push({
          bot_id: b.id,
          day,
          day_no: Math.min(60, Math.max(1, Math.floor((cutoff - b.start) / DAY) + 1)),
          equity: nowEq,
          day_pnl: pnl,
          trades: tradesCount,
          closed_at: new Date().toISOString(),
          profit_shared: memberShare,
          company_fee: fee,
          distributed: false,
        });

        capital += b.capital;
        equity += nowEq;
        dayPnl += pnl;
      }

      for (let i = 0; i < out.length; i += 500) {
        const { error: e2 } = await db.from('bot_closes').upsert(out.slice(i, i + 500), { onConflict: 'bot_id,day' });
        if (e2) throw e2;
      }
    }

    const pool = {
      day,
      bots: out.length,
      capital: Math.round(capital * 100) / 100,
      equity: Math.round(equity * 100) / 100,
      day_pnl: Math.round(dayPnl * 100) / 100,
      custom_rate_pct: body.custom_rate_pct ?? null,
      status: 'ok',
      error: null,
      source,
      closed_at: new Date().toISOString(),
    };

    const { error: e3 } = await db.from('pool_closes').upsert(pool, { onConflict: 'day' });
    if (e3) throw e3;

    // Distribute profits if auto-distribution is enabled or requested
    let distributionResult: unknown = null;
    if (autoDistribute && dayPnl > 0) {
      const { data: dist, error: distErr } = await db.rpc('admin_distribute_daily_profit', {
        p_day: day,
        p_custom_rate: body.custom_rate_pct ?? null,
        p_share_pct: sharePct,
      });
      if (distErr) console.error('Auto profit distribution error:', distErr);
      else distributionResult = dist;
    }

    return json({ ...pool, distribution: distributionResult });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from('pool_closes').upsert({ day, status: 'error', error: msg.slice(0, 500), source, closed_at: new Date().toISOString() }, { onConflict: 'day' });
    return json({ error: msg, day }, 500);
  }
});
