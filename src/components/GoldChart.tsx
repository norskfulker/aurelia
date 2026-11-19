import { useEffect, useRef, useState } from 'react';
import { Range, RANGES, useCandles, useMarket } from '../lib/market';
import { AreaChart, Icon, Seg } from '../ui/kit';

export const usd = (v: number) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function SourceChip() {
  const { source } = useMarket();
  if (source === 'live') return <span className="chip"><span className="dot live" />Live</span>;
  if (source === 'polling') return <span className="chip"><span className="dot warn" />Delayed · 30s</span>;
  if (source === 'offline') return <span className="chip"><span className="dot off" />Offline</span>;
  return <span className="chip"><span className="spinner" style={{ width: 10, height: 10 }} />Connecting</span>;
}

/** Big price with a green/red flash on every tick. */
export function LivePrice({ className = 'price-big' }: { className?: string }) {
  const { price } = useMarket();
  const prev = useRef<number | null>(null);
  const [flash, setFlash] = useState('');
  useEffect(() => {
    if (price && prev.current && price !== prev.current) {
      setFlash(price > prev.current ? 'flash-up' : 'flash-down');
      const t = setTimeout(() => setFlash(''), 600);
      prev.current = price;
      return () => clearTimeout(t);
    }
    prev.current = price;
  }, [price]);
  return <div className={`${className} ${flash}`}>{price ? usd(price) : <span className="skeleton" style={{ display: 'inline-block', width: 220, height: 38 }} />}</div>;
}

export function GoldChartCard({ height = 230, compact = false }: { height?: number; compact?: boolean }) {
  const { price, open24, high24, low24 } = useMarket();
  const [range, setRange] = useState<Range>('1D');
  const { candles, error } = useCandles(range);
  const base = range === '1D' && open24 ? open24 : candles[0]?.o;
  const change = price && base ? price - base : 0;
  const pct = base ? change / base : 0;
  const timeFmt = (t: number) => range === '1H' || range === '1D'
    ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' });

  return (
    <section className="card">
      <div className="card-h">
        <div>
          <h3><span className="icon-box"><Icon name="coin" size={16} /></span>Gold · XAU/USD</h3>
          <div className="hint">PAX Gold reference price (1 token = 1 troy oz)</div>
        </div>
        <div className="row"><SourceChip />{!compact && <Seg size="sm" value={range} onChange={setRange} options={(Object.keys(RANGES) as Range[]).map((r) => ({ v: r, l: r }))} />}</div>
      </div>
      <div className="row wrap" style={{ alignItems: 'flex-end', gap: 16, marginBottom: 14 }}>
        <LivePrice />
        {price && base ? (
          <div className={change >= 0 ? 'up' : 'down'} style={{ fontWeight: 620, paddingBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name={change >= 0 ? 'arrowUp' : 'arrowDown'} size={15} />{change >= 0 ? '+' : ''}{change.toFixed(2)} ({(pct * 100).toFixed(2)}%)
            <span className="dim" style={{ fontWeight: 400 }}>{range === '1D' ? '24h' : range}</span>
          </div>
        ) : null}
      </div>
      {error && !candles.length ? (
        <div className="notice"><Icon name="info" size={16} />Market history is unavailable from your network. The live price above still updates.</div>
      ) : (
        <AreaChart data={candles.map((c) => ({ t: c.t, v: c.c }))} tone={change >= 0 ? 'gold' : 'red'} format={usd} timeFmt={timeFmt} height={height} loading={!candles.length} />
      )}
      {!compact && (
        <div className="ticker-row mt">
          <span>24h high <b>{high24 ? usd(high24) : '—'}</b></span>
          <span>24h low <b>{low24 ? usd(low24) : '—'}</b></span>
          <span>Open <b>{open24 ? usd(open24) : '—'}</b></span>
        </div>
      )}
    </section>
  );
}
