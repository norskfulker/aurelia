import { COUNTRIES, Country, formatNational } from '../lib/countries';

/** Country picker that drives the phone prefix. */
export function CountrySelect({ value, onChange }: { value: Country; onChange: (c: Country) => void }) {
  return (
    <select className="input" value={value.iso} onChange={(e) => onChange(COUNTRIES.find((c) => c.iso === e.target.value)!)}>
      {COUNTRIES.map((c) => <option key={c.iso} value={c.iso}>{c.name} (+{c.dial})</option>)}
    </select>
  );
}

/** Phone input with a fixed +dial prefix and live national formatting. */
export function PhoneInput({ country, value, onChange, invalid }: { country: Country; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  return (
    <div className={`phone-input ${invalid ? 'invalid' : ''}`}>
      <span className="phone-prefix" title={country.name}><b style={{ fontSize: 10.5, color: 'var(--dim)' }}>{country.iso}</b>+{country.dial}</span>
      <input
        type="tel" inputMode="tel" autoComplete="tel-national"
        value={value}
        placeholder={country.mask.replace(/#/g, '0')}
        onChange={(e) => onChange(formatNational(e.target.value, country))}
      />
    </div>
  );
}

export const strength = (p: string) =>
  [p.length >= 8, /[A-Z]/.test(p) && /[a-z]/.test(p), /\d/.test(p), /[^A-Za-z0-9]/.test(p) || p.length >= 14].filter(Boolean).length;

const LEVELS = [
  { label: 'Too short', tone: 'var(--dim)' },
  { label: 'Weak', tone: 'var(--red)' },
  { label: 'Fair', tone: '#f59e0b' },
  { label: 'Good', tone: 'var(--gold)' },
  { label: 'Strong', tone: 'var(--em)' },
];

/** Strength bar that changes colour with the score: red → amber → gold → emerald. */
export function PasswordMeter({ password }: { password: string }) {
  const s = password ? Math.max(1, strength(password)) : 0;
  const lvl = LEVELS[s];
  return (
    <div className="pw-wrap" aria-live="polite">
      <div className="pw-meter">{[1, 2, 3, 4].map((i) => <i key={i} style={{ background: i <= s ? lvl.tone : undefined }} />)}</div>
      {password && <span style={{ color: lvl.tone }}>{lvl.label}</span>}
    </div>
  );
}

/** Referral code input: uppercase letters/digits only, max 8. */
export const cleanCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
