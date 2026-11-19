import { useEffect, useState } from 'react';
import { DataProvider, useAuth, useData } from './lib/data';
import { PreviewData } from './lib/preview';
import { supabase, supabaseConfigured } from './lib/supabase';
import { useTheme } from './lib/theme';
import { fmt, initials, isActive } from './lib/types';
import { BrandMark, Icon, Modal } from './ui/kit';
import { PasswordMeter, strength } from './ui/fields';
import { useToast } from './lib/data';
import Landing from './pages/Landing';
import { AuthPage, SetupNotice } from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Affiliate from './pages/Affiliate';
import History from './pages/History';
import Wallet from './pages/Wallet';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import Join from './pages/Join';

export type Page = 'dashboard' | 'affiliate' | 'history' | 'wallet' | 'profile' | 'admin';

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(query) };
}

export function navigate(to: string) {
  location.hash = to.startsWith('/') ? to : '/' + to;
}

export function useRoute() {
  const [r, setR] = useState(parseHash);
  useEffect(() => {
    const on = () => { setR(parseHash()); window.scrollTo({ top: 0 }); };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return r;
}

export default function App() {
  const { parts, params } = useRoute();
  const { session, ready } = useAuth();
  const top = parts[0] || '';

  if (/access_token=|error_description=/.test(location.hash)) return <FullLoader />;
  if (import.meta.env.DEV && top === 'preview') return <PreviewData><Shell page={(parts[1] as Page) || 'dashboard'} /></PreviewData>;
  if (top === 'join' && parts[1]) return <Join code={parts[1]} variant={Number(params.get('v') || 1)} />;
  if (['login', 'signup', 'forgot', 'reset'].includes(top)) {
    if (!supabaseConfigured) return <SetupNotice />;
    if (session && top !== 'reset') { navigate('/app/dashboard'); return null; }
    return <AuthPage mode={top as 'login' | 'signup' | 'forgot' | 'reset'} params={params} />;
  }
  if (top === 'app') {
    if (!supabaseConfigured) return <SetupNotice />;
    if (!ready) return <FullLoader />;
    if (!session) { navigate('/login'); return null; }
    return <DataProvider><Shell page={(parts[1] as Page) || 'dashboard'} /></DataProvider>;
  }
  return <Landing />;
}

function FullLoader() {
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><div className="row muted"><span className="spinner" />Loading…</div></div>;
}

const NAV: { id: Page; label: string; icon: string; sub: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', sub: 'Live gold market, your bot and your progress' },
  { id: 'affiliate', label: 'Affiliate', icon: 'affiliate', sub: 'Your team tree, ranks and growth tools' },
  { id: 'history', label: 'History', icon: 'history', sub: 'Every movement in your wallets' },
  { id: 'wallet', label: 'Wallet', icon: 'wallet', sub: 'Deposits, payouts and the academy store' },
];

function Shell({ page }: { page: Page }) {
  const { me, settings, loading, bots } = useData();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  // Tablets default to the compact icon rail; an explicit choice is remembered
  const [collapsed, setCollapsed] = useState(() => {
    try { const v = localStorage.getItem('aurelia.side'); if (v === '1' || v === '0') return v === '1'; } catch { /* ignore */ }
    return innerWidth > 860 && innerWidth < 1200;
  });
  const toggleSide = () => setCollapsed((c) => { try { localStorage.setItem('aurelia.side', c ? '0' : '1'); } catch { /* ignore */ } return !c; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const go = (p: Page) => { navigate('/app/' + p); setOpen(false); };
  const current = page === 'profile' ? { label: 'Profile', sub: 'Account details and identity verification' }
    : page === 'admin' ? { label: 'Admin', sub: 'Approvals, payment methods and daily operations' }
    : NAV.find((n) => n.id === page) || NAV[0];

  if (loading || !me) return <FullLoader />;
  const pageEl = { dashboard: <Dashboard go={go} />, affiliate: <Affiliate />, history: <History />, wallet: <Wallet />, profile: <Profile />, admin: me.role === 'admin' ? <Admin /> : <Dashboard go={go} /> }[page] || <Dashboard go={go} />;

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
        <div className="brand">
          <BrandMark />
          <div className="brand-text"><div className="brand-name">Aurelia</div><div className="brand-sub">Gold Academy</div></div>
          <button className="btn sm icon ghost side-toggle" onClick={toggleSide} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <Icon name={collapsed ? 'panelOpen' : 'panelClose'} size={17} />
          </button>
          <button className="btn sm icon ghost drawer-close" onClick={() => setOpen(false)} aria-label="Close menu"><Icon name="x" size={16} /></button>
        </div>
        <div className="nav-label">Menu</div>
        {NAV.map((n) => (
          <button key={n.id} className={`nav-item ${page === n.id ? 'active' : ''}`} onClick={() => go(n.id)} title={collapsed ? n.label : undefined}>
            <Icon name={n.icon} /><span className="lbl">{n.label}</span>
          </button>
        ))}
        {me.role === 'admin' && (
          <>
            <div className="nav-label">Manage</div>
            <button className={`nav-item ${page === 'admin' ? 'active' : ''}`} onClick={() => go('admin')} title={collapsed ? 'Admin' : undefined}>
              <Icon name="settings" /><span className="lbl">Admin</span>
            </button>
          </>
        )}
        <button className={`sidebar-foot profile-card ${page === 'profile' ? 'active' : ''}`} onClick={() => go('profile')} title="Open profile">
          <div className="row">
            <div className="avatar sm">{initials(me.name)}</div>
            <div className="foot-text" style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
              <div style={{ fontWeight: 620, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.name}</div>
              <div className="mono dim" style={{ fontSize: 11 }}>{me.code}</div>
            </div>
            {me.kyc !== 'verified' && <span className="count foot-text">{me.kyc === 'pending' ? 'Review' : 'KYC'}</span>}
          </div>
          <div className="row between foot-text" style={{ marginTop: 10, fontSize: 12 }}>
            <span className="muted">Free balance</span><span className="mono em-text">{fmt(me.wallet_free)}</span>
          </div>
        </button>
      </aside>
      {open && <div className="drawer-bg" onClick={() => setOpen(false)} aria-hidden />}

      <main className="main">
        <header className="topbar">
          <button className="btn icon menu-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" /></button>
          <div style={{ minWidth: 0 }}>
            <h1>{current.label}</h1>
            <div className="sub">{current.sub}</div>
          </div>
          <div className="spacer" />
          {isActive(me, settings) && bots.some((b) => b.status === 'running') && <span className="chip hide-sm"><span className="dot live" />Bot active</span>}
          <button className="btn primary sm" onClick={() => navigate('/app/wallet?deposit=1')} aria-label="Deposit" title="Deposit"><Icon name="download" size={15} />Deposit</button>
          <button className="btn icon" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <button className="avatar" onClick={() => go('profile')} style={{ cursor: 'pointer' }} aria-label="Profile">{initials(me.name)}</button>
        </header>
        <div key={page}>{pageEl}</div>
      </main>
      <SetPasswordPrompt />
    </div>
  );
}

/** Members invited from the tree sign in through the email link and have no password yet. */
function SetPasswordPrompt() {
  const { session } = useAuth();
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const meta = session?.user.user_metadata || {};
  if (!session || done || !meta.invited || meta.password_set) return null;
  const save = async () => {
    if (strength(pw) < 2) return toast('Choose a stronger password', 'err');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw, data: { password_set: true, invited: false } });
    setBusy(false);
    if (error) return toast(error.message, 'err');
    toast('Password saved. Welcome to Aurelia!');
    setDone(true);
  };
  return (
    <Modal title="Set your password" onClose={() => setDone(true)}>
      <div className="stack" style={{ gap: 14 }}>
        <p className="muted" style={{ margin: 0 }}>Your account was created from an invitation. Choose a password so you can log in with your email next time.</p>
        <input className="input" type="password" autoComplete="new-password" placeholder="At least 8 characters" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        <PasswordMeter password={pw} />
        <button className="btn primary block" disabled={busy || pw.length < 8} onClick={save}>{busy && <span className="spinner" />}Save password</button>
      </div>
    </Modal>
  );
}
