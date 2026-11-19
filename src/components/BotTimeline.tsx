// 60-day licence timeline. One cell per day; each day is settled by the automatic 21:00 IST pool close
// (pool-close Edge Function), and the current day shows live trading P&L since the last close.
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { BotClose, BotRow, botCapital, fmt, fmtDate } from '../lib/types';

const DAY = 86_400_000;

/** The first 21:00 IST (15:30 UTC) at or after t. */
export function nextClose(t: number) {
  const d = new Date(t);
  const c = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 15, 30);
  return c >= t ? c : c + DAY;
}
const istDate = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });

export default function BotTimeline({ bot, days, running, liveEquity, now }: { bot: BotRow; days: number; running: boolean; liveEquity: number | null; now: number }) {
  const [closes, setCloses] = useState<BotClose[] | null>(null);
  const start = new Date(bot.started_at).getTime();
  const end = new Date(bot.stopped_at || bot.expires_at).getTime();
  const firstClose = nextClose(start);

  useEffect(() => {
    let alive = true;
    supabase.from('bot_closes').select('*').eq('bot_id', bot.id).order('day').then(({ data }) => {
      if (alive) setCloses((data || []).map((c) => ({ ...c, equity: Number(c.equity), day_pnl: Number(c.day_pnl), profit_shared: Number(c.profit_shared || 0) })) as BotClose[]);
    });
    return () => { alive = false; };
  }, [bot.id, Math.floor(now / 600_000)]); // re-check every 10 min so tonight's close appears

  const byNo = new Map((closes || []).map((c) => [c.day_no, c]));
  const cutOf = (n: number) => firstClose + (n - 1) * DAY; // 21:00 IST that settles day n
  const today = running ? Math.min(days, Math.max(1, Math.floor((nextClose(now) - firstClose) / DAY) + 1)) : null;
  const lastClosed = [...(closes || [])].sort((a, b) => b.day_no - a.day_no)[0];
  const base = lastClosed ? lastClosed.equity : botCapital(bot);
  const todayPnl = running && liveEquity != null ? liveEquity - base : null;
  const settled = closes?.length ?? 0;
  const green = closes?.filter((c) => c.day_pnl > 0).length ?? 0;
  const best = closes?.length ? closes.reduce((a, c) => (c.day_pnl > a.day_pnl ? c : a)) : null;
  const worst = closes?.length ? closes.reduce((a, c) => (c.day_pnl < a.day_pnl ? c : a)) : null;
  const msLeft = running ? nextClose(now) - now : 0;
  const elapsed = Math.min(1, Math.max(0, (Math.min(now, end) - start) / (days * DAY)));

  return (
    <div className="timeline">
      <div className="row between wrap" style={{ gap: 8 }}>
        <span className="eyebrow">{days}-day timeline · settles daily at 9:00 PM IST</span>
        <span className="dim mono" style={{ fontSize: 11.5 }}>
          {running ? <>Day {today} of {days} · next close in {Math.floor(msLeft / 3_600_000)}h {String(Math.floor((msLeft % 3_600_000) / 60_000)).padStart(2, '0')}m</> : `Ended ${fmtDate(new Date(end).toISOString())}`}
        </span>
      </div>
      <div className="tl-bar"><span style={{ width: `${elapsed * 100}%` }} /></div>
      <div className="tl-grid" style={{ ['--tl-days' as string]: days }}>
        {Array.from({ length: days }, (_, i) => {
          const n = i + 1;
          const c = byNo.get(n);
          const cut = cutOf(n);
          const isToday = n === today;
          const after = cut - DAY >= end; // day never reached (stopped early)
          const cls = c ? (c.day_pnl > 0 ? 'win' : c.day_pnl < 0 ? 'loss' : 'flat') : isToday ? 'today' : after || cut <= now ? 'off' : 'future';
          const tip = `Day ${n} · closes ${istDate(cut)} 9:00 PM IST` + (c ? ` · ${c.day_pnl >= 0 ? '+' : ''}${fmt(c.day_pnl)}${c.profit_shared ? ` (${fmt(c.profit_shared)} paid)` : ''} · equity ${fmt(c.equity)}` : isToday && todayPnl != null ? ` · live ${todayPnl >= 0 ? '+' : ''}${fmt(todayPnl)}` : after ? ' · not run' : cut <= now ? ' · awaiting close' : '');
          return <span key={n} className={`tl-cell ${cls}`} title={tip}>{(n === 1 || n % 10 === 0) && <i>{n}</i>}</span>;
        })}
      </div>
      <div className="row between wrap tl-foot">
        <span>Start · {istDate(start)}</span>
        <span>Day 30 · {istDate(cutOf(30))}</span>
        <span>Ends · {istDate(new Date(bot.expires_at).getTime())}</span>
      </div>
      <div className="tl-stats">
        <span>Settled <b>{settled}/{days}</b></span>
        <span>Green days <b>{green}</b></span>
        {todayPnl != null && <span>{lastClosed ? 'Since last close' : 'Since start'} (live) <b className={todayPnl >= 0 ? 'up' : 'down'}>{todayPnl >= 0 ? '+' : ''}{fmt(todayPnl)}</b></span>}
        {best && <span>Best <b className="up">{best.day_pnl >= 0 ? '+' : ''}{fmt(best.day_pnl)}</b></span>}
        {worst && <span>Worst <b className={worst.day_pnl < 0 ? 'down' : 'up'}>{fmt(worst.day_pnl)}</b></span>}
      </div>
    </div>
  );
}
