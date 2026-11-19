import { FormEvent, useState } from 'react';
import KycDialog from '../components/KycDialog';
import { useData, useTeamStats, useToast } from '../lib/data';
import { errText, supabase } from '../lib/supabase';
import { fmt, fmtDate, initials, isActive } from '../lib/types';
import { Badge, Card, Icon, useConfirm } from '../ui/kit';
import { navigate } from '../App';
import { rankOf } from './Affiliate';
import { countryByName, fullPhone, isPhoneComplete, nationalFrom } from '../lib/countries';
import { CountrySelect, PasswordMeter, PhoneInput } from '../ui/fields';

export default function Profile() {
  const { me, kyc, settings: s, rpc } = useData();
  const ts = useTeamStats();
  const toast = useToast();
  const confirm = useConfirm();
  const logout = async () => { if (await confirm({ title: 'Log out of Aurelia?', confirm: 'Log out' })) { await supabase.auth.signOut(); navigate('/'); } };
  const [country, setCountry] = useState(() => countryByName(me?.country));
  const [f, setF] = useState(() => ({ name: me?.name || '', phone: nationalFrom(me?.phone, countryByName(me?.country)) }));
  const [kycOpen, setKycOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState('');
  if (!me) return null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    if (f.phone && !isPhoneComplete(f.phone, country)) { setSaving(false); return toast(`Enter a complete ${country.name} phone number`, 'err'); }
    await rpc('update_profile', { p_name: f.name, p_phone: fullPhone(f.phone, country), p_country: country.name }, 'Profile saved');
    setSaving(false);
  };
  const changePw = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return toast('Use at least 8 characters', 'err');
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) toast(errText(error), 'err'); else { toast('Password updated'); setPw(''); }
  };

  return (
    <div className="page">
      <div className="grid g3">
        <div className="stack gap18">
          <Card className="gold">
            <div className="row" style={{ gap: 14 }}>
              <div className="avatar" style={{ width: 56, height: 56, fontSize: 18 }}>{initials(me.name)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 660, fontSize: 18, letterSpacing: '-0.02em' }}>{me.name}</div>
                <div className="mono dim" style={{ fontSize: 12 }}>{me.code}</div>
              </div>
            </div>
            <dl className="kv mt">
              <dt>Rank</dt><dd className="gold-text" style={{ fontWeight: 620 }}>{rankOf(me, ts.paid.length, s).name}</dd>
              <dt>Status</dt><dd>{isActive(me, s) ? <Badge tone="ok">Active</Badge> : <Badge>Not activated</Badge>}</dd>
              <dt>Business</dt><dd className="mono">{fmt(me.pv)}</dd>
              <dt>Email</dt><dd>{me.email}</dd>
              <dt>Member since</dt><dd>{fmtDate(me.created_at)}</dd>
              <dt>Identity</dt><dd><KycBadge k={me.kyc} /></dd>
            </dl>
          </Card>
          <Card title="Session">
            <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>Signed in as {me.email}</div>
            <button className="btn danger" onClick={logout}><Icon name="logout" size={15} />Log out</button>
          </Card>
          <Card title="Change password">
            <form className="stack" onSubmit={changePw}>
              <input className="input" type="password" autoComplete="new-password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} />
              <PasswordMeter password={pw} />
              <button className="btn" disabled={pw.length < 8}><Icon name="lock" size={15} />Update password</button>
            </form>
          </Card>
        </div>

        <div className="span2 stack gap18">
          <Card title="Identity verification" hint="Required before withdrawals" action={<KycBadge k={me.kyc} />} className={me.kyc === 'verified' ? 'em' : ''}>
            {me.kyc === 'verified' && <div className="notice em"><Icon name="check" size={16} />Your identity is verified. Withdrawals are enabled.</div>}
            {me.kyc === 'pending' && (
              <div className="notice"><Icon name="info" size={16} />
                <div>Submitted {kyc ? `${kyc.doc_type} · ${kyc.doc_number.replace(/.(?=.{4})/g, '•')} on ${fmtDate(kyc.created_at)}` : ''}. Reviews usually finish within one business day. This page updates automatically.</div>
              </div>
            )}
            {(me.kyc === 'none' || me.kyc === 'rejected') && (
              <div className="stack" style={{ gap: 16 }}>
                {me.kyc === 'rejected' && <div className="notice bad"><Icon name="alert" size={16} />Your last submission was declined{kyc?.reviewer_note ? `: ${kyc.reviewer_note}` : ''}. Please try again with clearer photos.</div>}
                <div className="grid g3" style={{ gap: 10 }}>
                  {[['scan', 'Scan your ID', 'We read it automatically'], ['check', 'Confirm details', 'Fix anything we missed'], ['camera', 'Take a selfie', 'Holding your document']].map(([i, t, d], n) => (
                    <div key={t} className="leg"><span className="icon-box em"><Icon name={i} size={16} /></span><div style={{ fontWeight: 620, marginTop: 10 }}>{n + 1}. {t}</div><div className="muted" style={{ fontSize: 12.5 }}>{d}</div></div>
                  ))}
                </div>
                <div><button className="btn primary" onClick={() => setKycOpen(true)}><Icon name="shield" size={16} />Start verification</button></div>
              </div>
            )}
          </Card>

          <Card title="Personal details">
            <form className="stack" onSubmit={save}>
              <div className="grid g2" style={{ gap: 12 }}>
                <div className="field"><label>Full name {me.kyc === 'verified' && <span className="dim">locked after verification</span>}</label><input className="input" disabled={me.kyc === 'verified'} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
                <div className="field"><label>Email</label><input className="input" value={me.email} disabled /></div>
                <div className="field"><label>Country</label><CountrySelect value={country} onChange={(c) => { setCountry(c); setF({ ...f, phone: '' }); }} /></div>
                <div className="field"><label>Mobile</label><PhoneInput country={country} value={f.phone} onChange={(v) => setF({ ...f, phone: v })} invalid={!!f.phone && !isPhoneComplete(f.phone, country)} /></div>
              </div>
              <div><button className="btn primary" disabled={saving}>{saving && <span className="spinner" />}Save changes</button></div>
            </form>
          </Card>
        </div>
      </div>
      {kycOpen && <KycDialog onClose={() => setKycOpen(false)} />}
    </div>
  );
}

function KycBadge({ k }: { k: string }) {
  return k === 'verified' ? <Badge tone="ok">Verified</Badge> : k === 'pending' ? <Badge tone="gold">Under review</Badge> : k === 'rejected' ? <Badge tone="bad">Declined</Badge> : <Badge>Not started</Badge>;
}
