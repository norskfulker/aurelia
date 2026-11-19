import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { navigate } from '../App';
import { LivePrice } from '../components/GoldChart';
import { useAuth, useToast } from '../lib/data';
import { errText, supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { BrandMark, Icon, Seg } from '../ui/kit';
import { Country, detectCountry, fullPhone, isPhoneComplete } from '../lib/countries';
import { CountrySelect, PasswordMeter, PhoneInput, cleanCode, strength } from '../ui/fields';

export function SetupNotice() {
  return (
    <div className="auth-main" style={{ minHeight: '100vh' }}>
      <div className="card auth-card" style={{ width: 'min(560px, 100%)' }}>
        <div className="row" style={{ marginBottom: 18 }}><BrandMark /><b className="brand-name">Aurelia</b></div>
        <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Connect Supabase to continue</h1>
        <p className="muted" style={{ lineHeight: 1.6 }}>Accounts, wallets and the partner plan run on Supabase. Create a <code>.env.local</code> file in the project root with your project's URL and anon key, apply <code>supabase/migrations/0001_aurelia.sql</code>, then restart the dev server.</p>
        <pre className="card flat mono" style={{ fontSize: 12, overflowX: 'auto' }}>{`VITE_SUPABASE_URL=https://<project>.supabase.co\nVITE_SUPABASE_ANON_KEY=<anon or publishable key>`}</pre>
        <button className="btn mt" onClick={() => navigate('/')}><Icon name="chevronLeft" size={16} />Back to home</button>
      </div>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { theme, toggle } = useTheme();
  return (
    <div className="auth">
      <aside className="auth-side">
        <a href="#/" className="row" style={{ color: '#eef5f0', textDecoration: 'none' }}><BrandMark /><b style={{ fontSize: 19, letterSpacing: '-0.02em' }}>Aurelia</b></a>
        <div>
          <h2>The gold academy<br />for <span style={{ color: '#e8c46f' }}>curious</span> minds.</h2>
          <p style={{ opacity: 0.75, maxWidth: 380, lineHeight: 1.6 }}>Courses, live analytics, automated gold trading bots with daily profit sharing, and a transparent partner plan.</p>
        </div>
        <div className="card" style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(232,196,111,0.25)', color: '#eef5f0', maxWidth: 340 }}>
          <div className="row between"><span className="eyebrow" style={{ color: 'rgba(238,245,240,0.6)' }}>XAU/USD live</span><span className="dot live" /></div>
          <LivePrice />
        </div>
      </aside>
      <main className="auth-main">
        <button className="btn icon ghost" style={{ position: 'absolute', top: 18, right: 18 }} onClick={toggle} aria-label="Toggle theme"><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
        <a href="#/" className="row" style={{ position: 'absolute', top: 18, left: 20, color: 'var(--muted)', fontSize: 13 }}><Icon name="chevronLeft" size={16} />Home</a>
        <div className="auth-card">{children}</div>
      </main>
    </div>
  );
}

function PasswordInput({ value, onChange, autoComplete, placeholder }: { value: string; onChange: (v: string) => void; autoComplete: string; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-wrap">
      <input className="input" type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} placeholder={placeholder} required minLength={8} />
      <button type="button" className="btn sm icon ghost suffix" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}><Icon name={show ? 'eyeOff' : 'eye'} size={16} /></button>
    </div>
  );
}

export function AuthPage({ mode, params }: { mode: 'login' | 'signup' | 'forgot' | 'reset'; params: URLSearchParams }) {
  if (mode === 'signup') return <Shell><Signup params={params} /></Shell>;
  if (mode === 'forgot') return <Shell><Forgot /></Shell>;
  if (mode === 'reset') return <Shell><Reset /></Shell>;
  return <Shell><Login /></Shell>;
}

function Login() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return toast(error.message === 'Email not confirmed' ? 'Confirm your email first. Check your inbox for the link.' : errText(error), 'err');
    navigate('/app/dashboard');
  };
  return (
    <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
      <div><h1>Welcome back</h1><p className="muted" style={{ margin: 0 }}>Log in to your Aurelia account.</p></div>
      <div className="field"><label>Email</label><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></div>
      <div className="field"><label>Password <a href="#/forgot" style={{ fontSize: 12 }}>Forgot?</a></label><PasswordInput value={password} onChange={setPassword} autoComplete="current-password" /></div>
      <button className="btn primary lg block" disabled={busy}>{busy && <span className="spinner" />}Log in</button>
      <p className="muted" style={{ textAlign: 'center', margin: 0 }}>New to Aurelia? <a href="#/signup">Create an account</a></p>
    </form>
  );
}

function Signup({ params }: { params: URLSearchParams }) {
  const toast = useToast();
  const [detected] = useState(detectCountry);
  const [country, setCountry] = useState<Country>(detected.country);
  const [countryTouched, setCountryTouched] = useState(false);
  const [f, setF] = useState({ name: '', email: '', password: '', phone: '', ref: cleanCode(params.get('ref') || ''), leg: ((params.get('leg') || '').toUpperCase() === 'L' ? 'L' : (params.get('leg') || '').toUpperCase() === 'R' ? 'R' : 'auto') as 'L' | 'R' | 'auto' });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [sponsor, setSponsor] = useState<{ name: string } | null | 'none'>(null);

  useEffect(() => {
    if (f.ref.length < 8) { setSponsor(null); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('lookup_sponsor', { p_code: f.ref });
      setSponsor(data?.[0] ? { name: data[0].name } : 'none');
    }, 350);
    return () => clearTimeout(t);
  }, [f.ref]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (strength(f.password) < 2) return toast('Choose a stronger password (mix letters, numbers or symbols)', 'err');
    if (sponsor === 'none') return toast('That referral code was not found', 'err');
    if (f.ref && f.ref.length !== 8) return toast('Referral codes are 8 characters', 'err');
    if (f.phone && !isPhoneComplete(f.phone, country)) return toast(`Enter a complete ${country.name} phone number`, 'err');
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: f.email.trim(), password: f.password,
      options: { emailRedirectTo: location.origin + '/', data: { name: f.name.trim(), country: country.name, phone: fullPhone(f.phone, country), ref: f.ref, leg: f.leg === 'auto' ? '' : f.leg } },
    });
    setBusy(false);
    if (error) return toast(errText(error), 'err');
    if (data.session) navigate('/app/dashboard'); else setSent(true);
  };

  if (sent) return (
    <div className="stack" style={{ gap: 16, textAlign: 'center', alignItems: 'center' }}>
      <span className="icon-box em lg"><Icon name="mail" size={22} /></span>
      <h1>Check your inbox</h1>
      <p className="muted" style={{ margin: 0 }}>We sent a confirmation link to <b style={{ color: 'var(--text)' }}>{f.email}</b>. Open it to activate your account.</p>
      <a href="#/login" className="btn block">Back to log in</a>
    </div>
  );

  return (
    <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
      <div><h1>Create your account</h1><p className="muted" style={{ margin: 0 }}>Free to join. Buy a pack when you're ready.</p></div>
      <div className="field"><label>Full name</label><input className="input" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} autoFocus /></div>
      <div className="field"><label>Email</label><input className="input" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></div>
      <div className="field">
        <label>Password</label>
        <PasswordInput value={f.password} onChange={(v) => setF({ ...f, password: v })} autoComplete="new-password" placeholder="At least 8 characters" />
        <PasswordMeter password={f.password} />
      </div>
      <div className="grid g2" style={{ gap: 12 }}>
        <div className="field"><label>Country {!countryTouched && detected.source !== 'default' && <span className="badge ok" title={detected.source === 'timezone' ? 'Detected from your device time zone' : 'Detected from your browser language'}><Icon name="globe" size={11} />Detected</span>}</label><CountrySelect value={country} onChange={(c) => { setCountry(c); setCountryTouched(true); setF({ ...f, phone: '' }); }} /></div>
        <div className="field"><label>Mobile <span className="dim">optional</span></label><PhoneInput country={country} value={f.phone} onChange={(v) => setF({ ...f, phone: v })} invalid={!!f.phone && !isPhoneComplete(f.phone, country)} /></div>
      </div>
      <div className="field">
        <label>Referral code <span className="dim">optional</span></label>
        <input className={`input mono code-input ${sponsor === 'none' ? 'invalid' : ''}`} value={f.ref} maxLength={8} autoCapitalize="characters" spellCheck={false} onChange={(e) => setF({ ...f, ref: cleanCode(e.target.value) })} placeholder="e.g. K7Q2M9XA" />
        {sponsor && sponsor !== 'none' && <span className="help em-text">Sponsored by {sponsor.name}</span>}
        {sponsor === 'none' && <span className="err">Code not found</span>}
        {f.ref && f.ref.length < 8 && <span className="help">{8 - f.ref.length} more character{8 - f.ref.length === 1 ? '' : 's'}</span>}
      </div>
      {f.ref && sponsor !== 'none' && (
        <div className="field"><label>Team side</label><Seg value={f.leg} onChange={(v) => setF({ ...f, leg: v })} options={[{ v: 'auto', l: 'Automatic' }, { v: 'L', l: 'Left' }, { v: 'R', l: 'Right' }]} /></div>
      )}
      <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />I'm 18 or older, I accept the terms, and I understand that partner earnings aren't guaranteed and depend on real product sales.</label>
      <button className="btn primary lg block" disabled={busy || !agree}>{busy && <span className="spinner" />}Create account</button>
      <p className="muted" style={{ textAlign: 'center', margin: 0 }}>Already a member? <a href="#/login">Log in</a></p>
    </form>
  );
}

function Forgot() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + '/' });
    setBusy(false);
    if (error) return toast(errText(error), 'err');
    setSent(true);
  };
  return sent ? (
    <div className="stack" style={{ gap: 14, textAlign: 'center', alignItems: 'center' }}>
      <span className="icon-box em lg"><Icon name="mail" size={22} /></span>
      <h1>Reset link sent</h1>
      <p className="muted" style={{ margin: 0 }}>If an account exists for {email}, you'll receive a link to set a new password.</p>
      <a href="#/login" className="btn block">Back to log in</a>
    </div>
  ) : (
    <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
      <div><h1>Forgot password</h1><p className="muted" style={{ margin: 0 }}>We'll email you a secure reset link.</p></div>
      <div className="field"><label>Email</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></div>
      <button className="btn primary lg block" disabled={busy}>{busy && <span className="spinner" />}Send reset link</button>
      <a href="#/login" style={{ textAlign: 'center' }}>Back to log in</a>
    </form>
  );
}

function Reset() {
  const toast = useToast();
  const { session, clearRecovery } = useAuth();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (strength(pw) < 2) return toast('Choose a stronger password', 'err');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast(errText(error), 'err');
    clearRecovery();
    toast('Password updated');
    navigate('/app/dashboard');
  };
  if (!session) return <div className="stack"><h1>Link expired</h1><p className="muted">Request a new reset link.</p><a className="btn" href="#/forgot">Reset password</a></div>;
  return (
    <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
      <div><h1>Set a new password</h1><p className="muted" style={{ margin: 0 }}>For {session.user.email}</p></div>
      <div className="field"><label>New password</label><PasswordInput value={pw} onChange={setPw} autoComplete="new-password" /><PasswordMeter password={pw} /></div>
      <button className="btn primary lg block" disabled={busy}>{busy && <span className="spinner" />}Update password</button>
    </form>
  );
}
