import { ReactNode, useEffect, useState } from 'react';
import { useData, useToast } from '../lib/data';
import { useMarket } from '../lib/market';
import { PRESETS, Preset, stats, useBotSim, usePoolSim } from '../lib/bot';
import { supabase, errText } from '../lib/supabase';
import { Coupon, PoolRow, PoolTotals, botCapital, botDaysLeft, fmt, fmt0, fmtDate, fmtDateTime, isActive } from '../lib/types';
import { AreaChart, Badge, Card, Empty, Icon, Marker, Modal, Seg, useConfirm } from '../ui/kit';
import { usd } from './GoldChart';
import BotTimeline from './BotTimeline';

export default function BotPanel({ onGetPack }: { onGetPack: () => void }) {
  const { me, settings, bots, refresh } = useData();
  const toast = useToast();
  const confirm = useConfirm();
  const { price } = useMarket();
  const [creating, setCreating] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const bot = bots.find((b) => b.id === sel) || bots[0];
  const { sim, candles, status, lastEvent, bot: live } = useBotSim(bot);
  const running = live?.status === 'running';
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  if (!me || !isActive(me, settings)) {
    return (
      <Card title={<><span className="icon-box em"><Icon name="bot" size={16} /></span>Live Gold Trading Bot</>}>
        <Empty icon="bot" title="Included with every academy pack" action={<button className="btn primary" onClick={onGetPack}>Get a pack</button>}>
          Deploy an automated gold trading bot on the live market with real capital. Each bot is a {settings.bot_days}-day licence that generates daily performance, with profits shared directly to your Free Balance every day.
        </Empty>
      </Card>
    );
  }

  const stop = async () => {
    if (!bot || !(await confirm({
      title: `Stop ${bot.name}?`,
      body: `The open position (if any) will be closed at the current price, and your trading capital (${fmt(bot.capital)}) will be returned directly to your Free Balance. The licence fee is not refunded.`,
      confirm: 'Stop & return capital',
      tone: 'danger'
    }))) return;
    const { error } = await supabase.rpc('stop_bot', { p_id: bot.id });
    if (error) toast(errText(error), 'err');
    else {
      toast(`Bot stopped. ${fmt(bot.capital)} returned to your Free Balance.`);
      refresh(['me', 'bots', 'txs']);
    }
  };

  const st = sim && bot ? stats(sim, botCapital(bot), running ? price : null) : null;
  const last = candles.slice(-288);
  const t0 = last[0]?.t ?? 0;
  const markers: Marker[] = sim ? sim.trades.flatMap((t) => [
    { t: t.openedAt, v: t.entry, kind: t.side === 'long' ? 'buy' : 'sell' } as Marker,
    { t: t.closedAt, v: t.exit, kind: t.pnl >= 0 ? 'exit-win' : 'exit-loss' } as Marker,
  ]).filter((m) => m.t >= t0) : [];
  if (sim?.position && sim.position.openedAt >= t0) markers.push({ t: sim.position.openedAt, v: sim.position.entry, kind: sim.position.side === 'long' ? 'buy' : 'sell' });
  const nextCandle = 300 - Math.floor((now / 1000) % 300);

  return (
    <Card
      title={<><span className="icon-box em"><Icon name="bot" size={16} /></span>Gold Trading Bot <Badge tone="gold">Live Trading</Badge>{running && <span className="live-pill"><span className="dot live" />Live</span>}</>}
      hint={`Each bot is a ${settings.bot_days}-day licence (${fmt0(settings.bot_price)}) trading real allocated capital in the shared community pool. Profits are settled daily and shared (${settings.bot_profit_share_pct}% to you) into your Free Balance.`}
      action={<button className="btn primary sm" onClick={() => setCreating(true)}><Icon name="plus" size={15} />Launch bot</button>}>
      <PoolCard />
      {!bot && <Empty icon="bot" title="No bots yet">Launch an automated gold bot to trade 5-minute gold candles in real time. Capital is returned when stopped, and profits are distributed daily.</Empty>}
      {bot && (
        <div className="stack" style={{ gap: 16 }}>
          {bots.length > 1 && <Seg size="sm" value={bot.id} onChange={setSel} options={bots.map((b) => ({ v: b.id, l: <>{b.name}{b.status !== 'running' || botDaysLeft(b) === 0 ? ` · ${b.status === 'stopped' ? 'stopped' : 'expired'}` : ` · ${botDaysLeft(b)}d`}</> }))} />}
          {status === 'error' && <div className="notice bad"><Icon name="alert" size={16} />Couldn't load market history for this bot. Check your connection.</div>}
          <div className="grid g4">
            <Mini label="Live equity" value={st ? fmt(st.equity) : null} />
            <Mini label="Strategy P&L" value={st ? <span className={st.pnl >= 0 ? 'up' : 'down'}>{st.pnl >= 0 ? '+' : ''}{fmt(st.pnl)} <small>({(st.ret * 100).toFixed(2)}%)</small></span> : null} />
            <Mini label="Profit shared" value={<span className="em-text">{fmt(bot.total_profit_earned || 0)}</span>} />
            <Mini label="Win rate" value={st ? `${(st.winRate * 100).toFixed(0)}% · ${st.trades} trades` : null} />
          </div>
          <div className="grid g3">
            <div className="span2">
              <div className="row between wrap" style={{ marginBottom: 8 }}>
                <span className="eyebrow">Price · last 24h · ◆ entries · ● exits</span>
                <span className="row">
                  {lastEvent && <span key={lastEvent.t} className="badge ok event-pop">{lastEvent.text}</span>}
                  {running && <span className="dim mono" style={{ fontSize: 11.5 }}>next candle {Math.floor(nextCandle / 60)}:{String(nextCandle % 60).padStart(2, '0')}</span>}
                </span>
              </div>
              <AreaChart
                data={last.map((c) => ({ t: c.t, v: c.c }))} height={210} format={usd} loading={status === 'loading'}
                tone={st && st.pnl < 0 ? 'red' : 'em'} markers={markers}
                lines={sim?.position && running ? [
                  { v: sim.position.tp, label: 'TP', tone: 'em' }, { v: sim.position.entry, label: 'Entry', tone: 'gold' }, { v: sim.position.sl, label: 'SL', tone: 'red' },
                ] : []}
              />
            </div>
            <div className="stack">
              <span className="eyebrow">Live position</span>
              {sim?.position && running ? (
                <dl className="kv">
                  <dt>Side</dt><dd><Badge tone={sim.position.side === 'long' ? 'ok' : 'bad'}>{sim.position.side}</Badge></dd>
                  <dt>Size</dt><dd className="mono">{sim.position.size} oz</dd>
                  <dt>Entry</dt><dd className="mono">{sim.position.entry.toFixed(2)}</dd>
                  <dt>Mark</dt><dd className="mono">{price ? price.toFixed(2) : '—'}</dd>
                  <dt>Unrealised</dt><dd className={`mono ${st && st.unrealized >= 0 ? 'up' : 'down'}`}>{st ? `${st.unrealized >= 0 ? '+' : ''}${fmt(st.unrealized)}` : '—'}</dd>
                </dl>
              ) : <div className="muted" style={{ fontSize: 13 }}>{running ? 'Flat — waiting for the next crossover signal.' : live?.status === 'expired' ? `Licence ended after ${settings.bot_days} days.` : 'Bot stopped.'}</div>}
              <dl className="kv" style={{ marginTop: 6 }}>
                <dt>Profile</dt><dd>{PRESETS[bot.preset].label} · {(PRESETS[bot.preset].riskPct * 100).toFixed(1)}%</dd>
                <dt>Capital</dt><dd className="mono">{fmt(bot.capital)}</dd>
                {bot.bonus_capital > 0 && <><dt>Coupon bonus</dt><dd className="mono em-text">+{fmt0(bot.bonus_capital)} · {bot.coupon_code}</dd></>}
                <dt>Started</dt><dd>{fmtDateTime(bot.started_at)}</dd>
                <dt>Licence</dt><dd>{running ? <>{botDaysLeft(bot)} of {settings.bot_days} days left · ends {fmtDate(bot.expires_at)}</> : `Ended ${fmtDate(bot.stopped_at || bot.expires_at)}`}</dd>
              </dl>
              {running && <button className="btn sm danger" onClick={stop}><Icon name="stop" size={14} />Stop bot</button>}
            </div>
          </div>
          {live && <BotTimeline bot={live} days={settings.bot_days} running={running} liveEquity={st ? st.equity : null} now={now} />}
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Trade log</div>
            <div className="table-wrap" style={{ margin: 0 }}>
              <table>
                <thead><tr><th>Closed</th><th>Side</th><th className="r">Entry</th><th className="r">Exit</th><th className="r">Size</th><th>Reason</th><th className="r">P&L</th></tr></thead>
                <tbody>
                  {sim?.trades.slice(0, 15).map((t, i) => (
                    <tr key={t.closedAt + '-' + i}>
                      <td className="muted">{fmtDateTime(new Date(t.closedAt).toISOString())}</td>
                      <td><Badge tone={t.side === 'long' ? 'ok' : 'bad'}>{t.side}</Badge></td>
                      <td className="r mono">{t.entry.toFixed(2)}</td>
                      <td className="r mono">{t.exit.toFixed(2)}</td>
                      <td className="r mono">{t.size}</td>
                      <td className="muted">{{ tp: 'Take profit', sl: 'Stop loss', signal: 'Reverse signal', stop: 'Manual stop' }[t.reason]}</td>
                      <td className={`r mono ${t.pnl >= 0 ? 'up' : 'down'}`}>{t.pnl >= 0 ? '+' : ''}{fmt(t.pnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sim && !sim.trades.length && <Empty icon="chart">No closed trades yet. New bots usually trade within a few hours.</Empty>}
            </div>
          </div>
        </div>
      )}
      {creating && <NewBot onClose={() => setCreating(false)} onCreated={(id) => { setSel(id); setCreating(false); }} />}
    </Card>
  );
}

function PoolCard() {
  const { bots, settings } = useData();
  const [totals, setTotals] = useState<PoolTotals | null>(null);
  const [rows, setRows] = useState<PoolRow[] | null>(null);
  const key = bots.map((b) => b.id + b.status).join();
  useEffect(() => {
    supabase.rpc('bot_pool').then(({ data }) => setTotals((data as PoolTotals) ?? { bots: 0, members: 0, capital: 0, mine_bots: 0, mine_capital: 0, by_preset: {} }));
    supabase.rpc('bot_pool_rows').then(({ data }) => setRows(((data as PoolRow[]) ?? []).map((r) => ({ ...r, capital: Number(r.capital) }))));
  }, [key]);
  const { status, totals: live } = usePoolSim(rows);
  const cap = Number(totals?.capital ?? 0);
  const share = cap ? Number(totals!.mine_capital) / cap : 0;
  return (
    <div className="card flat pool-card" style={{ padding: 14, marginBottom: 16 }}>
      <div className="row between wrap" style={{ marginBottom: 10 }}>
        <span className="eyebrow">Community trading pool · every active bot</span>
        <span className="row" style={{ gap: 8 }}>
          <Badge tone="gold">Live Pool</Badge>
          <span className="dim" style={{ fontSize: 12 }}>{settings.bot_profit_share_pct}% member profit share</span>
        </span>
      </div>
      <div className="grid g4">
        <Mini label="Pool capital" value={totals ? fmt0(cap) : null} />
        <Mini label="Pool P&L" value={!totals ? null : !rows?.length ? '—' : live ? <span className={live.pnl >= 0 ? 'up' : 'down'}>{live.pnl >= 0 ? '+' : ''}{fmt(live.pnl)} <small>({(live.ret * 100).toFixed(2)}%)</small></span> : status === 'error' ? 'Unavailable' : null} />
        <Mini label="Active bots · members" value={totals ? `${totals.bots} · ${totals.members}` : null} />
        <Mini label="Your pool share" value={totals ? `${(share * 100).toFixed(share && share < 0.01 ? 2 : 1)}% · ${totals.mine_bots} bot${totals.mine_bots === 1 ? '' : 's'}` : null} />
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: ReactNode | null }) {
  return <div className="leg"><div className="eyebrow">{label}</div><div className="mono" style={{ fontWeight: 620, fontSize: 16, marginTop: 4 }}>{value ?? <div className="skeleton" style={{ height: 20, width: '70%' }} />}</div></div>;
}

function couponBonus(c: Coupon | undefined, capital: number) {
  if (!c || capital < c.min_capital) return 0;
  const raw = c.bonus_type === 'fixed' ? c.bonus_value : Math.round(capital * c.bonus_value) / 100;
  return c.max_bonus != null ? Math.min(raw, c.max_bonus) : raw;
}

function NewBot({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { refresh, me, settings } = useData();
  const [wallet, setWallet] = useState<'package' | 'free'>(me && me.wallet_package < (settings.bot_min_capital + settings.bot_price) && me.wallet_free >= (settings.bot_min_capital + settings.bot_price) ? 'free' : 'package');
  const bal = me ? (wallet === 'package' ? me.wallet_package : me.wallet_free) : 0;
  const toast = useToast();
  const [name, setName] = useState('');
  const [preset, setPreset] = useState<Preset>('balanced');
  const [capital, setCapital] = useState(settings.bot_min_capital || 100);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('coupons').select('*').eq('public', true).eq('active', true).order('created_at', { ascending: false })
      .then(({ data }) => data && setCoupons(data.map((c) => ({ ...c, bonus_value: Number(c.bonus_value), max_bonus: c.max_bonus == null ? null : Number(c.max_bonus), min_capital: Number(c.min_capital) })) as Coupon[]));
  }, []);

  const selected = coupons.find((c) => c.code === code.trim().toUpperCase());
  const bonus = couponBonus(selected, capital);
  const totalRequired = capital + settings.bot_price;

  const submit = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('create_bot', { p_name: name, p_preset: preset, p_capital: capital, p_coupon: code.trim() || null, p_wallet: wallet });
    setBusy(false);
    if (error) return toast(errText(error), 'err');
    const b = Number((data as { bonus: number }).bonus || 0);
    toast(b > 0 ? `Trading bot launched with ${fmt0(capital)} capital and a ${fmt0(b)} coupon bonus!` : `Trading bot launched with ${fmt0(capital)} capital for ${settings.bot_days} days!`);
    await refresh(['me', 'txs', 'bots']);
    onCreated((data as { id: string }).id);
  };

  return (
    <Modal title={<><span className="icon-box em"><Icon name="bot" size={16} /></span>Launch Gold Trading Bot</>} onClose={onClose} wide>
      <div className="stack" style={{ gap: 16 }}>
        <div className="grid g2" style={{ gap: 12 }}>
          <div className="field"><label>Bot Name</label><input className="input" maxLength={40} placeholder={`${PRESETS[preset].label} bot`} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field">
            <label className="row between">
              <span>Trading Capital (USD)</span>
              <span className="dim" style={{ fontSize: 12 }}>Min {fmt0(settings.bot_min_capital)}</span>
            </label>
            <input className="input mono" type="number" min={settings.bot_min_capital} max={settings.bot_max_capital} step={10} value={capital} onChange={(e) => setCapital(Number(e.target.value))} />
          </div>
        </div>

        <div className="field"><label>Risk Profile & Strategy</label>
          <Seg value={preset} onChange={setPreset} options={(Object.keys(PRESETS) as Preset[]).map((k) => ({ v: k, l: PRESETS[k].label }))} />
          <span className="help">Risks {(PRESETS[preset].riskPct * 100).toFixed(1)}% of equity per trade · EMA {PRESETS[preset].fast}/{PRESETS[preset].slow} on 5-minute candles · 2.2R target</span>
        </div>

        <div className="field"><label>Fund Capital & Licence from Wallet</label>
          <Seg value={wallet} onChange={setWallet} options={[{ v: 'package', l: `Package · ${fmt(me?.wallet_package ?? 0)}` }, { v: 'free', l: `Free Balance · ${fmt(me?.wallet_free ?? 0)}` }]} />
          <span className="help">Available in selected wallet: <b className="mono">{fmt(bal)}</b>. Total required: <b className="mono">{fmt(totalRequired)}</b> ({fmt0(capital)} capital + {fmt0(settings.bot_price)} licence).</span>
        </div>

        <div className="field">
          <label>Coupon Code <span className="dim">optional</span></label>
          <input className="input mono code-input" value={code} placeholder="Enter or pick a coupon" onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24))} />
          {coupons.length > 0 && (
            <div className="coupon-list">
              {coupons.map((c) => {
                const b = couponBonus(c, capital);
                const on = c.code === code.trim().toUpperCase();
                return (
                  <button type="button" key={c.code} className={`coupon ${on ? 'on' : ''}`} onClick={() => setCode(on ? '' : c.code)}>
                    <span className="coupon-code mono">{c.code}</span>
                    <span className="coupon-desc">{c.description || (c.bonus_type === 'percent' ? `${c.bonus_value}% extra capital` : `${fmt0(c.bonus_value)} extra capital`)}</span>
                    <span className="coupon-bonus">{b > 0 ? `+${fmt0(b)}` : `min ${fmt0(c.min_capital)}`}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="card flat" style={{ padding: 14 }}>
          <dl className="kv">
            <dt>Trading capital</dt><dd className="mono">{fmt(capital)}</dd>
            <dt>Licence fee ({settings.bot_days} days)</dt><dd className="mono">{fmt0(settings.bot_price)}</dd>
            {bonus > 0 && <><dt>Coupon bonus</dt><dd className="mono em-text">+{fmt(bonus)}</dd></>}
            <dt><b style={{ color: 'var(--text)' }}>Total debited now</b></dt><dd className="mono" style={{ fontWeight: 700 }}>{fmt(totalRequired)}</dd>
            <dt>Profit share</dt><dd className="mono em-text">{settings.bot_profit_share_pct}% to your Free Balance daily</dd>
          </dl>
        </div>

        <div className="notice">
          <Icon name="shield" size={16} />
          <b>Real Trading:</b> Your trading capital ({fmt(capital)}) trades live gold and is returned directly to your Free Balance when you stop the bot or when the {settings.bot_days}-day period ends. Daily profits are credited directly to your Free Balance every night.
        </div>

        <button className="btn primary block" disabled={busy || capital < settings.bot_min_capital || capital > settings.bot_max_capital || bal < totalRequired} onClick={submit}>
          {busy && <span className="spinner" />}
          {bal < totalRequired ? `Insufficient balance (needs ${fmt(totalRequired)}, available ${fmt(bal)})` : `Confirm & Launch Bot · ${fmt(totalRequired)}`}
        </button>
      </div>
    </Modal>
  );
}
