import { createContext, ReactNode, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const paths: Record<string, ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></>,
  affiliate: <><circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="19" r="2.5" /><circle cx="19" cy="19" r="2.5" /><path d="M12 7.5v4M12 11.5l-6 5M12 11.5l6 5" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></>,
  wallet: <><path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5" /><circle cx="16.5" cy="13.5" r="1.2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  bot: <><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 4v4M9 13v1M15 13v1M9 17h6" /><circle cx="12" cy="3.5" r="1" /></>,
  arrowUp: <path d="M7 17 17 7M8 7h9v9" />,
  arrowDown: <path d="M17 7 7 17M16 17H7V8" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
  check: <path d="M5 12.5 10 17 19 7" />,
  shield: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17h.01" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6" /></>,
  gift: <><rect x="3" y="8" width="18" height="5" rx="1" /><path d="M5 13v8h14v-8M12 8v13M12 8S10 3 7.5 4.5 9 8 12 8zM12 8s2-5 4.5-3.5S15 8 12 8z" /></>,
  zap: <path d="M13 3 4 14h7l-1 7 9-11h-7z" />,
  coin: <><circle cx="12" cy="12" r="9" /><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.7 0-2.8.9-2.8 2s1 1.7 2.8 2 2.8.9 2.8 2-1.2 2-2.8 2c-1.1 0-2.1-.5-2.6-1.5M12 6.5V8M12 16v1.5" /></>,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  upload: <path d="M12 20V9M7 14l5-5 5 5M5 4h14" />,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  print: <><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z" /></>,
  cart: <><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M3 4h2l2.5 11h11L21 8H6.5" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  logout: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5M5 12h11" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></>,
  scan: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M4 12h16" /></>,
  id: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M6 16c.5-1.5 1.7-2 3-2s2.5.5 3 2M14 10h4M14 13h3" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.3 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5M8 7h8" /></>,
  chart: <><path d="M3 20h18" /><path d="m5 16 4-5 4 3 6-8" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  panelClose: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16M16 10l-2 2 2 2" /></>,
  panelOpen: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16M14 10l2 2-2 2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  news: <><path d="M4 5h13v14H6a2 2 0 0 1-2-2z" /><path d="M17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5M8 16h3" /></>,
  share: <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></>,
  crown: <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" />,
  userPlus: <><circle cx="10" cy="8" r="4" /><path d="M3 21a7 7 0 0 1 14 0M19 8v6M16 11h6" /></>,
  medal: <><circle cx="12" cy="15" r="6" /><path d="M8.5 10 6 3h4l2 4 2-4h4l-2.5 7M12 12.5l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z" /></>,
  trendUp: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  trendDown: <><path d="M3 7l6 6 4-4 8 8" /><path d="M15 17h6v-6" /></>,
  minus: <path d="M5 12h14" />,
};

export function Icon({ name, size = 18, stroke = 1.75 }: { name: string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name]}
    </svg>
  );
}

export function Logo({ size = 22 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fbe7a6" /><stop offset="0.6" stopColor="#e8c46f" /><stop offset="1" stopColor="#b8892b" /></linearGradient></defs>
      <path d="M16 4 L27 28 H21.5 L16 16 L10.5 28 H5 Z" fill={`url(#${id})`} />
      <path d="M12.6 23 H19.4" stroke="#34d399" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function BrandMark() {
  return <div className="brand-mark"><Logo /></div>;
}

export function Card({ title, hint, action, children, className = '' }: { title?: ReactNode; hint?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-h">
          <div>{title && <h3>{title}</h3>}{hint && <div className="hint">{hint}</div>}</div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ icon, label, value, foot, tone, loading }: { icon: string; label: string; value: ReactNode; foot?: ReactNode; tone?: 'em'; loading?: boolean }) {
  return (
    <div className="card stat">
      <div className="label"><span className={`icon-box ${tone || ''}`}><Icon name={icon} size={16} /></span>{label}</div>
      <div className="value">{loading ? <div className="skeleton" style={{ height: 30, width: '60%' }} /> : value}</div>
      {foot && <div className="foot">{foot}</div>}
    </div>
  );
}

export function Badge({ tone = 'mute', children }: { tone?: 'ok' | 'gold' | 'bad' | 'mute'; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Seg<T extends string>({ value, options, onChange, size }: { value: T; options: { v: T; l: ReactNode }[]; onChange: (v: T) => void; size?: 'sm' }) {
  return (
    <div className={`seg ${size || ''}`} role="tablist">
      {options.map((o) => <button type="button" key={o.v} role="tab" aria-selected={o.v === value} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>{o.l}</button>)}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  return createPortal(
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`card modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="card-h" style={{ alignItems: 'center' }}><h3>{title}</h3><button className="btn sm icon ghost" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button></div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Right-hand slide-over panel (full screen on phones). */
export function Drawer({ title, onClose, children, actions }: { title: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, []);
  return createPortal(
    <div className="drawer-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true">
        <header className="drawer-h">
          <h3>{title}</h3>
          <div className="row">{actions}<button className="btn sm icon ghost" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button></div>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- confirm dialog
type ConfirmOpts = { title: string; body?: ReactNode; confirm?: string; tone?: 'primary' | 'danger' | 'em' };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<(v: boolean) => void>();
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((res) => { resolver.current = res; setOpts(o); }), []);
  const done = (v: boolean) => { resolver.current?.(v); setOpts(null); };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {opts && (
        <Modal title={opts.title} onClose={() => done(false)}>
          {opts.body && <div className="muted" style={{ marginBottom: 18, lineHeight: 1.6 }}>{opts.body}</div>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => done(false)}>Cancel</button>
            <button className={`btn ${opts.tone || 'primary'}`} onClick={() => done(true)} autoFocus>{opts.confirm || 'Confirm'}</button>
          </div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}

export function Busy({ busy, children }: { busy: boolean; children: ReactNode }) {
  return <>{busy ? <span className="spinner" /> : null}{children}</>;
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="btn sm" onClick={() => { navigator.clipboard?.writeText(text).catch(() => {}); setOk(true); setTimeout(() => setOk(false), 1400); }}>
      <Icon name={ok ? 'check' : 'copy'} size={14} />{ok ? 'Copied' : label}
    </button>
  );
}

export function CopyBox({ value, label }: { value: string; label?: string }) {
  return <div className="copy-box" title={value}><span>{label || value}</span><CopyButton text={value} /></div>;
}

export function Progress({ value, tone }: { value: number; tone?: 'em' }) {
  return <div className={`progress ${tone || ''}`}><i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></div>;
}

export function Empty({ icon = 'info', title, children, action }: { icon?: string; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="icon-box em lg"><Icon name={icon} size={20} /></span>
      {title && <div style={{ fontWeight: 620, color: 'var(--text)' }}>{title}</div>}
      {children && <div style={{ maxWidth: 420 }}>{children}</div>}
      {action}
    </div>
  );
}

export function CoinIcon({ asset }: { asset: string }) {
  const bg = asset === 'BTC' ? '#f7931a' : asset === 'USDC' ? '#2775ca' : asset === 'SOL' ? 'linear-gradient(135deg, #9945ff, #14f195)' : '#26a17b';
  return <span className="coin" style={{ background: bg }}>{asset === 'BTC' ? '₿' : asset === 'USDC' ? '$' : asset === 'SOL' ? '◎' : '₮'}</span>;
}

// ---------------------------------------------------------------- chart
export interface Pt { t: number; v: number }
export interface Marker { t: number; v: number; kind: 'buy' | 'sell' | 'exit-win' | 'exit-loss' }
export interface RefLine { v: number; label: string; tone: 'gold' | 'em' | 'red' }

export function AreaChart({ data, height = 220, tone = 'gold', format = (v) => v.toFixed(2), timeFmt, markers = [], lines = [], loading }: {
  data: Pt[]; height?: number; tone?: 'gold' | 'em' | 'red'; format?: (v: number) => string; timeFmt?: (t: number) => string;
  markers?: Marker[]; lines?: RefLine[]; loading?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const W = 800, H = height, PT = 10, PB = 22;
  const d = data.length === 1 ? [data[0], { ...data[0], t: data[0].t + 1 }] : data;
  const geo = useMemo(() => {
    if (!d.length) return null;
    const vals = [...d.map((p) => p.v), ...lines.map((l) => l.v)];
    const min = Math.min(...vals), max = Math.max(...vals);
    const pad = (max - min) * 0.1 || Math.abs(max) * 0.001 || 1;
    const lo = min - pad, hi = max + pad, t0 = d[0].t, t1 = d[d.length - 1].t || t0 + 1;
    const x = (t: number) => (t1 === t0 ? W / 2 : ((t - t0) / (t1 - t0)) * W);
    const y = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);
    return { min: Math.min(...d.map((p) => p.v)), max: Math.max(...d.map((p) => p.v)), x, y, t0, t1 };
  }, [d, H, lines]);

  if (loading || !geo) return <div className="skeleton" style={{ height }} />;
  const color = tone === 'em' ? 'var(--em)' : tone === 'red' ? 'var(--red)' : 'var(--gold)';
  const pts = d.map((p) => [geo.x(p.t), geo.y(p.v)] as const);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H - PB} L0,${H - PB} Z`;
  const h = hover != null ? pts[hover] : null;
  const last = pts[pts.length - 1];
  const tf = timeFmt || ((t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const ticks = [0.02, 0.35, 0.68, 0.98].map((f) => geo.t0 + (geo.t1 - geo.t0) * f);

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block', overflow: 'visible' }}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const tx = geo.t0 + ((e.clientX - r.left) / r.width) * (geo.t1 - geo.t0);
          let best = 0;
          for (let i = 0; i < d.length; i++) if (Math.abs(d[i].t - tx) < Math.abs(d[best].t - tx)) best = i;
          setHover(best);
        }}
        onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={`a${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: color, stopOpacity: 0.3 }} />
            <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={PT + (H - PT - PB) * f} y2={PT + (H - PT - PB) * f} style={{ stroke: 'var(--chart-grid)' }} strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />)}
        {lines.map((l) => (
          <line key={l.label} x1="0" x2={W} y1={geo.y(l.v)} y2={geo.y(l.v)} style={{ stroke: l.tone === 'em' ? 'var(--em)' : l.tone === 'red' ? 'var(--red)' : 'var(--gold)' }} strokeDasharray="6 4" strokeOpacity="0.7" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill={`url(#a${id})`} />
        <path d={line} fill="none" style={{ stroke: color }} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {h && <line x1={h[0]} x2={h[0]} y1="0" y2={H - PB} style={{ stroke: 'var(--muted)' }} strokeOpacity="0.4" vectorEffect="non-scaling-stroke" />}
      </svg>
      {/* HTML overlays keep circles round despite preserveAspectRatio=none */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {markers.filter((m) => m.t >= geo.t0 && m.t <= geo.t1).map((m, i) => (
          <span key={i} title={m.kind} style={{
            position: 'absolute', left: `${(geo.x(m.t) / W) * 100}%`, top: geo.y(m.v), width: 10, height: 10, marginLeft: -5, marginTop: -5,
            borderRadius: m.kind === 'buy' || m.kind === 'sell' ? 2 : '50%', transform: m.kind === 'buy' || m.kind === 'sell' ? 'rotate(45deg)' : undefined,
            background: m.kind === 'buy' || m.kind === 'exit-win' ? 'var(--em)' : m.kind === 'sell' || m.kind === 'exit-loss' ? 'var(--red)' : 'var(--gold)',
            border: '2px solid var(--surface-solid)',
          }} />
        ))}
        {lines.map((l) => (
          <span key={l.label} className="mono" style={{ position: 'absolute', right: 4, top: geo.y(l.v) - 18, fontSize: 10.5, padding: '1px 6px', borderRadius: 6, background: 'var(--surface-solid)', color: l.tone === 'em' ? 'var(--em)' : l.tone === 'red' ? 'var(--red)' : 'var(--gold)', border: '1px solid var(--line-2)' }}>{l.label} {format(l.v)}</span>
        ))}
        {!h && <span className="dot live" style={{ position: 'absolute', left: `calc(${(last[0] / W) * 100}% - 4px)`, top: last[1] - 4, width: 8, height: 8, background: color }} />}
        {h && hover != null && (
          <div className="chip mono" style={{ position: 'absolute', top: 0, left: `clamp(0px, calc(${(h[0] / W) * 100}% - 70px), calc(100% - 170px))`, background: 'var(--surface-solid)', color: 'var(--text)', boxShadow: 'var(--shadow)' }}>
            {format(d[hover].v)} <span className="dim">{tf(d[hover].t)}</span>
          </div>
        )}
        <div className="row between dim mono" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, fontSize: 10.5 }}>
          {ticks.map((t, i) => <span key={i}>{tf(t)}</span>)}
        </div>
      </div>
    </div>
  );
}
