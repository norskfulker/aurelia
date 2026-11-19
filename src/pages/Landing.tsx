import { useEffect, useState } from 'react';
import { navigate } from '../App';
import { GoldChartCard, LivePrice, SourceChip } from '../components/GoldChart';
import { useAuth } from '../lib/data';
import { useMarket } from '../lib/market';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { DEFAULT_SETTINGS, FALLBACK_PRODUCTS, Product, fmt0 } from '../lib/types';
import { BrandMark, Icon } from '../ui/kit';

export default function Landing() {
  const { session } = useAuth();
  const { theme, toggle } = useTheme();
  const { price, open24 } = useMarket();
  const [products, setProducts] = useState<Product[]>(FALLBACK_PRODUCTS);
  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.from('products').select('*').eq('active', true).order('sort').then(({ data }) => {
      if (data?.length) setProducts(data.map((p) => ({ ...p, price: Number(p.price), bv: Number(p.bv) })) as Product[]);
    });
  }, []);
  const s = DEFAULT_SETTINGS;
  const change = price && open24 ? ((price - open24) / open24) * 100 : null;
  const primary = session ? { label: 'Open dashboard', to: '/app/dashboard' } : { label: 'Create free account', to: '/signup' };

  return (
    <div>
      <nav className="land-nav">
        <div className="in">
          <a href="#/" className="row" style={{ color: 'var(--text)', textDecoration: 'none' }}>
            <BrandMark /><span className="brand-name">Aurelia</span>
          </a>
          <div className="links">
            <a href="#academy" onClick={(e) => { e.preventDefault(); document.getElementById('academy')?.scrollIntoView({ behavior: 'smooth' }); }}>Academy</a>
            <a href="#bot" onClick={(e) => { e.preventDefault(); document.getElementById('bot')?.scrollIntoView({ behavior: 'smooth' }); }}>Trading bot</a>
            <a href="#plan" onClick={(e) => { e.preventDefault(); document.getElementById('plan')?.scrollIntoView({ behavior: 'smooth' }); }}>Partner plan</a>
            <a href="#faq" onClick={(e) => { e.preventDefault(); document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' }); }}>FAQ</a>
          </div>
          <div style={{ flex: 1 }} />
          <span className="chip hide-sm"><span className="mono" style={{ color: 'var(--text)' }}>XAU {price ? price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}</span>
            {change != null && <span className={change >= 0 ? 'up' : 'down'}>{change >= 0 ? '+' : ''}{change.toFixed(2)}%</span>}</span>
          <button className="btn icon ghost" onClick={toggle} aria-label="Toggle theme"><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
          {!session && <button className="btn ghost hide-sm" onClick={() => navigate('/login')}>Log in</button>}
          <button className="btn primary" onClick={() => navigate(primary.to)}>{session ? 'Dashboard' : 'Get started'}</button>
        </div>
      </nav>

      <header className="container hero">
        <div>
          <span className="kicker"><span className="dot live" />Live gold market · {price ? `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : 'connecting'}</span>
          <h1>Understand gold.<br /><span className="gold-text">Trade with skill.</span><br /><span className="em-text">Grow together.</span></h1>
          <p className="lead">Aurelia is a gold-market academy with professional analytics, live algorithmic trading bots with daily performance profit sharing, and a transparent partner plan.</p>
          <div className="row wrap">
            <button className="btn primary lg" onClick={() => navigate(primary.to)}>{primary.label}<Icon name="arrowRight" size={17} /></button>
            <button className="btn lg" onClick={() => document.getElementById('academy')?.scrollIntoView({ behavior: 'smooth' })}>Explore the academy</button>
          </div>
          <div className="row wrap muted" style={{ gap: 20, marginTop: 28, fontSize: 13 }}>
            <span className="row" style={{ gap: 6 }}><Icon name="shield" size={16} />KYC-verified payouts</span>
            <span className="row" style={{ gap: 6 }}><Icon name="coin" size={16} />USDT · USDC · SOL</span>
            <span className="row" style={{ gap: 6 }}><Icon name="check" size={16} />{s.refund_days}-day refunds</span>
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <GoldChartCard height={240} />
          <div className="card hero-float" style={{ position: 'absolute', left: -36, bottom: -56, width: 250, padding: 16, boxShadow: 'var(--shadow-lg)' }}>
            <div className="row between"><span className="eyebrow">Trading bot</span><span className="live-pill"><span className="dot live" />Live</span></div>
            <div className="row" style={{ marginTop: 10, gap: 12 }}>
              <span className="icon-box em"><Icon name="bot" size={16} /></span>
              <div><div style={{ fontWeight: 620 }}>EMA 9/26 · 5m</div><div className="dim" style={{ fontSize: 12 }}>Live capital · daily profit share</div></div>
            </div>
          </div>
        </div>
      </header>

      <section className="section" id="academy">
        <div className="container">
          <div className="section-h">
            <span className="eyebrow">The academy</span>
            <h2>Everything you need to read the gold market</h2>
            <p>Structured courses, live analytics and a risk-free sandbox. Pick a pack once. There's no subscription.</p>
          </div>
          <div className="grid g3" style={{ marginBottom: 32 }}>
            {[
              { i: 'book', t: 'Structured courses', d: 'From what moves gold to building and testing your own strategies, with clear lessons and quizzes.' },
              { i: 'chart', t: 'Live analytics', d: 'Real-time XAU charts, 24h ranges and alerts in a clean terminal built for focus.' },
              { i: 'bot', t: 'Bot sandbox', d: 'Run automated strategies on the live market with virtual capital and see every trade.' },
            ].map((f) => (
              <div key={f.t} className="card"><div className="feature-ico"><Icon name={f.i} size={22} /></div><h3 style={{ margin: '0 0 8px', fontSize: 17, letterSpacing: '-0.02em' }}>{f.t}</h3><p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>{f.d}</p></div>
            ))}
          </div>
          <div className="grid g4">
            {products.map((p, i) => (
              <div key={p.id} className={`card product ${i === 1 ? 'feature' : ''}`}>
                <div className="row between"><b style={{ fontSize: 15 }}>{p.name}</b>{i === 1 && <span className="badge gold">Most popular</span>}</div>
                <div className="price-tag">{fmt0(p.price)}<span className="dim" style={{ fontSize: 13, fontWeight: 500 }}> one-time</span></div>
                <div className="muted" style={{ fontSize: 13, marginTop: -6 }}>{p.tagline}</div>
                <ul>{p.includes.map((x) => <li key={x}><Icon name="check" size={15} stroke={2.2} />{x}</li>)}</ul>
                <button className={`btn block ${i === 1 ? 'primary' : ''}`} style={{ marginTop: 'auto' }} onClick={() => navigate(session ? '/app/wallet' : '/signup')}>Choose {p.name}</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="bot" style={{ background: 'var(--surface-2)', borderBlock: '1px solid var(--line-2)' }}>
        <div className="container hero" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <div>
            <span className="eyebrow">Trading Bot</span>
            <div className="section-h" style={{ marginBottom: 24 }}>
              <h2>Automated gold trading with <span className="em-text">daily profit sharing</span></h2>
              <p>Every pack includes access to our automated trading bots. Allocate capital to a chosen risk profile and receive daily trading profits credited directly to your Free Balance.</p>
            </div>
            <div className="steps">
              {['Runs on real 5-minute gold candles, 24/7', 'Shows every position with entry, stop and target', 'Transparent performance: wins, losses and daily settlement', 'Daily profit sharing credited directly to your Free Balance'].map((t) => (
                <div key={t} className="step"><span className="n" style={{ background: 'var(--em-grad)', color: 'var(--em-ink)', border: 'none' }}><Icon name="check" size={14} stroke={2.4} /></span><span className="t">{t}</span></div>
              ))}
            </div>
          </div>
          <div className="card gold" style={{ padding: 28 }}>
            <div className="row between"><span className="eyebrow">Gold spot</span><SourceChip /></div>
            <LivePrice />
            <div className="grid g3 mt" style={{ gap: 10 }}>
              {Object.entries({ Conservative: '0.5%', Balanced: '1.0%', Aggressive: '2.0%' }).map(([k, v]) => (
                <div key={k} className="leg"><div className="eyebrow">{k}</div><div className="mono" style={{ fontWeight: 650, marginTop: 4 }}>{v} risk</div></div>
              ))}
            </div>
            <div className="notice mt"><Icon name="info" size={16} />Trading capital is deployed to real strategies. Results reflect live market performance and daily profit sharing.</div>
          </div>
        </div>
      </section>

      <section className="section" id="plan">
        <div className="container">
          <div className="section-h">
            <span className="eyebrow">Partner plan</span>
            <h2>Share the academy, earn on real sales</h2>
            <p>Partners earn commissions only when the people they introduce buy academy packs. Nothing is paid for sign-ups alone, and there are no investment returns.</p>
          </div>
          <div className="grid g4">
            {[
              { i: 'zap', t: `${s.fast_start_pct * 100}% fast start`, d: `On the first pack of each of your first ${s.fast_start_count} paid referrals.` },
              { i: 'affiliate', t: `${s.binary_pct * 100}% tree bonus`, d: `On matched sales volume across the two sides of your team tree once you have ${s.qualify_directs} paid referrals.` },
              { i: 'users', t: `${s.matching_pct * 100}% matching`, d: "On the tree bonuses earned by your direct referrals." },
              { i: 'trophy', t: 'Weekly leaderboard', d: `Top partners by referral sales share ${s.leaderboard_prizes.map((p) => '$' + p).join(' / ')} each week.` },
            ].map((f) => (
              <div key={f.t} className="card"><div className="feature-ico" style={{ background: 'var(--gold-soft)', color: 'var(--gold)', borderColor: 'var(--line)' }}><Icon name={f.i} size={22} /></div><h3 style={{ margin: '0 0 8px', fontSize: 17 }}>{f.t}</h3><p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>{f.d}</p></div>
            ))}
          </div>
          <div className="notice mt" style={{ fontSize: 13 }}><Icon name="shield" size={16} />Earnings are capped at {s.cap_multiple}× your own pack purchases every {s.cap_cycle_days} days. Income isn't guaranteed and depends entirely on genuine product sales. Most partners earn little or nothing.</div>
        </div>
      </section>

      <section className="section" id="faq" style={{ paddingTop: 24 }}>
        <div className="container" style={{ maxWidth: 860 }}>
          <div className="section-h"><span className="eyebrow">FAQ</span><h2>Questions, answered</h2></div>
          <div className="faq">
            {[
              ['Is the trading bot trading my money?', 'No. The bot sandbox uses virtual capital only. It runs on the real live gold market so you can learn how automated strategies behave, but it never touches your wallets.'],
              ['How do I pay?', 'Deposit USDT or USDC on TRC20, BEP20 or ERC20, or SOL on Solana, to your package wallet, then buy a pack. Deposits are credited after network confirmations.'],
              ['How do withdrawals work?', 'Commissions land in your free balance. After identity verification you can save payout addresses and withdraw to them. Each network shows its fee and minimum up front.'],
              ['Can I get a refund?', `Yes. Every pack has a ${s.refund_days}-day refund window. Refunding a pack also reverses the sales volume and any fast-start bonus it generated.`],
              ['Do I have to recruit anyone?', 'No. The academy and sandbox are the product. The partner plan is optional and only pays on real pack sales.'],
            ].map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="cta-band">
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', letterSpacing: '-0.035em', margin: '0 0 12px' }}>Start learning gold today</h2>
            <p style={{ opacity: 0.8, margin: '0 auto 26px', maxWidth: 520, fontSize: 16 }}>Create your free account in a minute. Explore the dashboard and live market before you buy anything.</p>
            <button className="btn primary lg" onClick={() => navigate(primary.to)}>{primary.label}<Icon name="arrowRight" size={17} /></button>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <div className="row between wrap" style={{ marginBottom: 16 }}>
            <div className="row"><BrandMark /><b style={{ color: 'var(--text)' }}>Aurelia Gold Academy</b></div>
            <div className="row" style={{ gap: 18 }}><a href="#/login">Log in</a><a href="#/signup">Sign up</a></div>
          </div>
          <p style={{ maxWidth: 900 }}>Aurelia sells educational products and software tools. It isn't a broker, investment adviser or fund, and doesn't accept money for investment. The bot sandbox uses virtual funds. Gold prices are a PAX Gold (PAXG/USDT) reference and may differ from spot. Partner commissions depend on product sales and aren't guaranteed.</p>
          <p>© {new Date().getFullYear()} Aurelia. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
