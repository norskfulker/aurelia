import { useEffect, useState } from 'react';
import { navigate } from '../App';
import { GoldChartCard, LivePrice } from '../components/GoldChart';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { FALLBACK_PRODUCTS, fmt0 } from '../lib/types';
import { BrandMark, Icon } from '../ui/kit';

/** Personal invite pages: #/join/<CODE>?v=1|2|3 — greet the visitor with the inviter's name and sign them up under that code. */
export default function Join({ code, variant }: { code: string; variant: number }) {
  const { theme, toggle } = useTheme();
  const [inviter, setInviter] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');
  const ref = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

  useEffect(() => {
    if (!supabaseConfigured) { setState('missing'); return; }
    supabase.rpc('lookup_sponsor', { p_code: ref }).then(({ data }) => {
      if (data?.[0]) { setInviter(data[0].name); setState('ok'); } else setState('missing');
    });
  }, [ref]);

  const join = () => navigate(`/signup?ref=${ref}`);
  const first = inviter?.split(' ')[0] || 'a friend';
  const v = variant === 2 || variant === 3 ? variant : 1;

  const Nav = () => (
    <nav className="land-nav"><div className="in">
      <a href="#/" className="row" style={{ color: 'var(--text)', textDecoration: 'none' }}><BrandMark /><span className="brand-name">Aurelia</span></a>
      <div style={{ flex: 1 }} />
      <button className="btn icon ghost" onClick={toggle} aria-label="Toggle theme"><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
      <button className="btn primary" onClick={join}>Join {first !== 'a friend' ? first : ''}</button>
    </div></nav>
  );

  if (state === 'loading') return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><span className="spinner" /></div>;
  if (state === 'missing') return (
    <div className="auth-main" style={{ minHeight: '100vh' }}>
      <div className="card auth-card" style={{ textAlign: 'center' }}>
        <span className="icon-box lg" style={{ margin: '0 auto 12px' }}><Icon name="link" size={22} /></span>
        <h1 style={{ fontSize: 22 }}>This invite link isn't valid</h1>
        <p className="muted">Ask the person who shared it for a new link, or explore Aurelia on your own.</p>
        <a className="btn primary" href="#/">Visit Aurelia</a>
      </div>
    </div>
  );

  if (v === 3) return (
    <div className="join-letter-page">
      <Nav />
      <main className="container" style={{ maxWidth: 680, padding: '56px 24px 80px' }}>
        <div className="card join-letter">
          <div className="eyebrow">A personal note</div>
          <h1>Hi there, it's {first}.</h1>
          <p>I've been learning how the gold market works with <b>Aurelia</b>, an academy with short courses, live analytics and automated trading bots with daily performance profit sharing.</p>
          <p>I thought you'd enjoy it too. Creating an account is free, and you can look around the live dashboard before deciding anything.</p>
          <div className="join-sign"><span className="avatar">{first[0]}</span><div><b>{inviter}</b><div className="mono dim" style={{ fontSize: 12 }}>Member · {ref}</div></div></div>
          <button className="btn primary lg" onClick={join}>Accept {first}'s invitation<Icon name="arrowRight" size={17} /></button>
          <p className="dim" style={{ fontSize: 12, marginTop: 18 }}>Trading involves market risk. Daily profit sharing reflects real strategy performance. Earnings aren't guaranteed.</p>
        </div>
      </main>
    </div>
  );

  if (v === 2) return (
    <div>
      <Nav />
      <header className="container hero">
        <div>
          <span className="kicker"><span className="dot live" />Invited by {inviter}</span>
          <h1>Watch a bot trade <span className="gold-text">gold</span>, <span className="em-text">live</span>.</h1>
          <p className="lead">{first} invited you to Aurelia's automated gold trading network. Deploy an automated strategy on the real gold market and earn daily profit shares credited directly to your account.</p>
          <div className="row wrap">
            <button className="btn primary lg" onClick={join}>Start free with {first}<Icon name="arrowRight" size={17} /></button>
          </div>
          <div className="row wrap muted" style={{ gap: 20, marginTop: 24, fontSize: 13 }}>
            <span className="row" style={{ gap: 6 }}><Icon name="bot" size={16} />Real 5-minute candles</span>
            <span className="row" style={{ gap: 6 }}><Icon name="shield" size={16} />Daily profit sharing</span>
            <span className="row" style={{ gap: 6 }}><Icon name="chart" size={16} />Every trade logged</span>
          </div>
        </div>
        <GoldChartCard height={240} />
      </header>
    </div>
  );

  return (
    <div>
      <Nav />
      <header className="container hero">
        <div>
          <span className="kicker"><span className="avatar sm" style={{ width: 22, height: 22, fontSize: 10 }}>{first[0]}</span>{inviter} invited you</span>
          <h1>Learn gold with <span className="gold-text">{first}</span>.</h1>
          <p className="lead">Join {first} at Aurelia, the gold-market academy with structured courses, live analytics and automated gold trading bots with daily profit sharing.</p>
          <button className="btn primary lg" onClick={join}>Join {first} on Aurelia<Icon name="arrowRight" size={17} /></button>
          <div className="card flat join-price">
            <span className="eyebrow">Gold right now</span>
            <LivePrice className="price-big" />
          </div>
        </div>
        <div className="grid g2">
          {FALLBACK_PRODUCTS.slice(0, 4).map((p, i) => (
            <div key={p.id} className={`card product ${i === 1 ? 'feature' : ''}`}>
              <b>{p.name}</b>
              <div className="price-tag" style={{ fontSize: 24 }}>{fmt0(p.price)}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>{p.tagline}</div>
            </div>
          ))}
        </div>
      </header>
    </div>
  );
}
