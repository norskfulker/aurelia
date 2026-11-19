import { FormEvent, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Legs } from './Dashboard';
import { useData, useTeamStats, useToast } from '../lib/data';
import { Country, detectCountry, fullPhone, isPhoneComplete } from '../lib/countries';
import { errText, supabase } from '../lib/supabase';
import { Leg, Member, RankReward, Settings, TeamRow, cycleDaysLeft, fmt, fmt0, fmtDate, initials, isActive } from '../lib/types';
import { Badge, Card, CopyBox, CopyButton, Empty, Icon, Logo, Modal, Progress, Seg } from '../ui/kit';
import { CountrySelect, PhoneInput } from '../ui/fields';
import { RANKS_FALLBACK } from '../lib/preview';
import TreeCanvas from '../components/TreeCanvas';
import EarnDialog, { earnIntroHidden } from '../components/EarnDialog';

type Tab = 'tree' | 'volume' | 'ranks' | 'members' | 'invite' | 'leaderboard' | 'certificate' | 'marketing';

export const refLink = (code: string, leg?: Leg) => `${location.origin}/#/signup?ref=${code}${leg ? `&leg=${leg}` : ''}`;

export default function Affiliate() {
  const [tab, setTab] = useState<Tab>(() => { try { return (sessionStorage.getItem('aurelia.afftab') as Tab) || 'tree'; } catch { return 'tree'; } });
  useEffect(() => { try { sessionStorage.setItem('aurelia.afftab', tab); } catch { /* ignore */ } }, [tab]);
  const { settings } = useData();
  const [intro, setIntro] = useState(() => !earnIntroHidden());
  return (
    <div className="page">
      <KpiStrip onTab={setTab} />
      <div className="row between" style={{ gap: 12 }}>
      <div className="aff-tabs" style={{ minWidth: 0, flex: 1 }}>
        <Seg value={tab} onChange={setTab} options={[
          { v: 'tree', l: 'Team tree' }, { v: 'volume', l: 'Volume & cap' }, { v: 'ranks', l: 'Ranks & bonuses' }, { v: 'members', l: 'Members' },
          { v: 'invite', l: 'Referral links' }, { v: 'leaderboard', l: 'Leaderboard' }, { v: 'certificate', l: 'Certificate' }, { v: 'marketing', l: 'Marketing' },
        ]} />
      </div>
      <button className="btn sm" onClick={() => setIntro(true)}><Icon name="info" size={14} />How you earn</button>
      </div>
      {intro && <EarnDialog s={settings} onClose={() => setIntro(false)} />}
      <div key={tab} className="page" style={{ gap: 18 }}>
        {tab === 'tree' && <TreeTab />}
        {tab === 'volume' && <VolumeTab />}
        {tab === 'ranks' && <RanksTab />}
        {tab === 'members' && <MembersTab />}
        {tab === 'invite' && <InviteTab />}
        {tab === 'leaderboard' && <LeaderboardTab />}
        {tab === 'certificate' && <CertificateTab />}
        {tab === 'marketing' && <MarketingTab />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- KPI strip
function KpiStrip({ onTab }: { onTab: (t: Tab) => void }) {
  const { me, settings: s } = useData();
  const ts = useTeamStats();
  if (!me) return null;
  const cap = s.cap_multiple * me.pv;
  const r = rankOf(me, ts.paid.length, s);
  return (
    <div className="aff-hero">
      <button className="aff-kpi" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => onTab('ranks')}>
        <span className="k"><Icon name="crown" size={13} />Rank</span><span className="v gold-text">{r.name.replace(' Partner', '')}</span><span className="s">{r.next ? `Next: ${r.next.name}` : 'Top rank'}</span>
      </button>
      <div className="aff-kpi"><span className="k"><Icon name="users" size={13} />Team</span><span className="v">{ts.members.length}</span><span className="s">{ts.paid.length} paid directs</span></div>
      <button className="aff-kpi" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => onTab('volume')}>
        <span className="k"><Icon name="affiliate" size={13} />Left · Right BV</span><span className="v mono">{me.lv.toLocaleString()} · {me.rv.toLocaleString()}</span><span className="s">carry forward</span>
      </button>
      <div className="aff-kpi"><span className="k"><Icon name="target" size={13} />Tree bonus</span><span className="v">{ts.qualified ? <span className="em-text">Qualified</span> : `${ts.paid.length}/${s.qualify_directs}`}</span><span className="s">{ts.qualified ? 'pairs nightly' : 'paid directs needed'}</span></div>
      <button className="aff-kpi" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => onTab('volume')}>
        <span className="k"><Icon name="shield" size={13} />Cap used</span><span className="v mono">{fmt0(me.cycle_earned)}<span className="dim" style={{ fontSize: 13 }}> / {fmt0(cap)}</span></span><span className="s">{cycleDaysLeft(me, s)} days left in cycle</span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- tree

function TreeTab() {
  const { me, team, settings: s, invites } = useData();
  const ts = useTeamStats();
  const byId = useMemo(() => new Map(team.map((t) => [t.id, t])), [team]);
  const self = useMemo(() => byId.get(me!.id) || ({ ...me!, depth: 0, root_leg: null } as unknown as TeamRow), [byId, me]);
  const fullTeam = useMemo(() => (byId.has(me!.id) ? team : [self, ...team]), [byId, team, self, me]);
  const [rootId, setRootId] = useState(me!.id);
  const [selected, setSelected] = useState<TeamRow | null>(null);
  const [q, setQ] = useState('');
  const [placing, setPlacing] = useState<{ parent: TeamRow; leg: Leg } | null>(null);
  const matches = q.length > 1 ? ts.members.filter((m) => (m.name + m.code).toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];
  const names = useMemo(() => new Map(fullTeam.map((t) => [t.id, t.name])), [fullTeam]);
  const sel = selected || self;
  const selActive = isActive(sel, s);

  return (
    <div className="grid g3">
      <div className="span2">
        <Card title={<><span className="icon-box"><Icon name="affiliate" size={16} /></span>Team tree</>}
          hint="Drag to explore, scroll to zoom. Tap a green spot to register someone exactly there."
          action={<div className="row">
            {rootId !== me!.id && <button className="btn sm" onClick={() => { setRootId(me!.id); setSelected(null); }}><Icon name="target" size={14} />Back to my tree</button>}
          </div>}>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <input className="input" placeholder="Find a team member by name or ID…" value={q} onChange={(e) => setQ(e.target.value)} />
            {matches.length > 0 && (
              <div className="card" style={{ position: 'absolute', top: 46, left: 0, right: 0, zIndex: 6, padding: 6, background: 'var(--surface-solid)' }}>
                {matches.map((m) => (
                  <button key={m.id} className="nav-item" onClick={() => { setRootId(m.id); setSelected(m); setQ(''); }}>
                    <span className="avatar sm">{initials(m.name)}</span>{m.name}<span className="mono dim" style={{ marginLeft: 'auto', fontSize: 11 }}>{m.code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <TreeCanvas team={fullTeam} rootId={rootId} invites={invites} settings={s} paidDirectsOf={ts.paidDirectsOf}
            selectedId={selected?.id || null} onSelect={setSelected} onPlace={(parent, leg) => setPlacing({ parent, leg })} />
          <div className="tree-legend">
            <span><i style={{ background: 'var(--gold)' }} />Top of view</span>
            <span><i style={{ background: 'var(--em-soft)', border: '1px dashed var(--em)' }} />Open spot · tap to place</span>
            <span><i style={{ background: 'var(--gold-soft)', border: '1px dashed var(--gold)' }} />Invited · awaiting confirmation</span>
          </div>
        </Card>
      </div>
      <div className="stack gap18">
        <Card title={sel.id === me!.id ? 'You' : 'Member details'} action={selActive ? <Badge tone="ok">Active</Badge> : <Badge>Unpaid</Badge>}>
          <div className="row" style={{ gap: 12, marginBottom: 14 }}>
            <span className="avatar">{initials(sel.name)}</span>
            <div style={{ minWidth: 0 }}><div style={{ fontWeight: 650 }}>{sel.name}</div><div className="mono dim" style={{ fontSize: 11.5 }}>{sel.code}</div></div>
          </div>
          <dl className="kv">
            <dt>Business</dt><dd className="mono">{fmt(sel.pv)}</dd>
            <dt>Left · right volume</dt><dd className="mono">{sel.lt.toLocaleString()} · {sel.rt.toLocaleString()}</dd>
            <dt>Paid directs</dt><dd className="mono">{ts.paidDirectsOf(sel.id)}</dd>
            {sel.id !== me!.id && <><dt>Sponsor</dt><dd>{sel.sponsor_id === me!.id ? 'You' : names.get(sel.sponsor_id || '') || '—'}</dd></>}
            {sel.id !== me!.id && <><dt>Your side</dt><dd>{sel.root_leg === 'L' ? 'Left' : sel.root_leg === 'R' ? 'Right' : '—'}</dd></>}
            <dt>Joined</dt><dd>{fmtDate(sel.created_at)}</dd>
          </dl>
          {sel.id !== rootId && <div className="card-actions"><button className="btn sm" onClick={() => setRootId(sel.id)}><Icon name="affiliate" size={14} />View their tree</button></div>}
        </Card>
        <Card title="Tree bonus qualification" action={ts.qualified ? <Badge tone="ok">Qualified</Badge> : <Badge tone="gold">In progress</Badge>}>
          <Progress value={Math.min(ts.paid.length, s.qualify_directs) / s.qualify_directs} tone="em" />
          <dl className="kv mt">
            <dt>Paid directs</dt><dd className="mono">{ts.paid.length} / {s.qualify_directs}</dd>
            <dt>Split L : R</dt><dd className="mono">{ts.split.L} : {ts.split.R}</dd>
            <dt>Fast start used</dt><dd className="mono">{me!.fs_paid} / {s.fast_start_count}</dd>
          </dl>
        </Card>
        <Card title={`Pending invites · ${invites.length}`} hint="Added to the tree once they confirm their email.">
          {invites.length ? (
            <div className="stack" style={{ gap: 8 }}>
              {invites.map((iv) => (
                <div key={iv.email} className="step"><span className="n"><Icon name="clock" size={14} /></span>
                  <div className="t" style={{ minWidth: 0 }}>{iv.name || iv.email}<div className="d" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{iv.email}{iv.leg ? ` · ${iv.leg === 'L' ? 'left' : 'right'}` : ''}</div></div>
                </div>
              ))}
            </div>
          ) : <div className="muted" style={{ fontSize: 13 }}>No pending invites. Tap a green spot in your tree to register someone.</div>}
        </Card>
      </div>
      {placing && <PlaceModal parent={placing.parent} leg={placing.leg} onClose={() => setPlacing(null)} />}
    </div>
  );
}

function PlaceModal({ parent, leg, onClose }: { parent: TeamRow; leg: Leg; onClose: () => void }) {
  const { me, refresh } = useData();
  const toast = useToast();
  const [country, setCountry] = useState<Country>(() => detectCountry().country);
  const [f, setF] = useState({ name: '', email: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (f.name.trim().length < 2) return toast('Enter their full name', 'err');
    if (f.phone && !isPhoneComplete(f.phone, country)) return toast(`Enter a complete ${country.name} number`, 'err');
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: f.email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: location.origin + '/',
        data: { name: f.name.trim(), country: country.name, phone: fullPhone(f.phone, country), ref: me!.code, parent: parent.code, leg, invited: true },
      },
    });
    setBusy(false);
    if (error) {
      const m = errText(error);
      return toast(/not authorized|rate limit/i.test(m) ? `${m}. Email delivery needs a custom SMTP provider in Supabase.` : m, 'err');
    }
    setSent(true);
    refresh(['invites']);
  };

  return (
    <Modal title={<><span className="icon-box em"><Icon name="userPlus" size={16} /></span>Register a member here</>} onClose={onClose}>
      {sent ? (
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 14 }}>
          <span className="icon-box em lg float"><Icon name="mail" size={22} /></span>
          <div style={{ fontWeight: 650, fontSize: 16 }}>Confirmation email sent</div>
          <div className="muted">{f.email} must open the link to confirm. They'll then appear under <b style={{ color: 'var(--text)' }}>{parent.name}</b> on the {leg === 'L' ? 'left' : 'right'}.</div>
          <button className="btn block" onClick={onClose}>Done</button>
        </div>
      ) : (
        <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
          <div className="notice em"><Icon name="info" size={16} /><span>Placing under <b style={{ color: 'var(--text)' }}>{parent.name}</b> · {leg === 'L' ? 'left' : 'right'} side. You'll be their sponsor.</span></div>
          <div className="field"><label>Full name</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus required /></div>
          <div className="field"><label>Email</label><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></div>
          <div className="grid g2" style={{ gap: 12 }}>
            <div className="field"><label>Country</label><CountrySelect value={country} onChange={(c) => { setCountry(c); setF({ ...f, phone: '' }); }} /></div>
            <div className="field"><label>Mobile <span className="dim">optional</span></label><PhoneInput country={country} value={f.phone} onChange={(v) => setF({ ...f, phone: v })} /></div>
          </div>
          <div className="dim" style={{ fontSize: 12 }}>They're only added once they confirm through the email link. If someone fills this slot first, they're placed at the next open spot below it on the same side.</div>
          <button className="btn em block" disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="mail" size={15} />}Send confirmation email</button>
        </form>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- volume & cap
function VolumeTab() {
  const { me, settings: s } = useData();
  const ts = useTeamStats();
  if (!me) return null;
  const cap = s.cap_multiple * me.pv;
  return (
    <div className="grid g2 stretch">
      <Card title={<><span className="icon-box"><Icon name="affiliate" size={16} /></span>Tree volume</>} hint={ts.qualified ? 'Tree bonus pays every night at 00:05 UTC' : `Introduce ${s.qualify_directs} paid members to unlock the tree bonus`}
        action={ts.qualified ? <Badge tone="ok">Qualified</Badge> : <Badge tone="gold">{ts.paid.length}/{s.qualify_directs} directs</Badge>}>
        <Legs />
        <div className="notice mt"><Icon name="info" size={16} />Each night your smaller team's volume is matched with the larger team and pays a {s.binary_pct * 100}% tree bonus. Unmatched volume carries forward.</div>
      </Card>
      <Card title={<><span className="icon-box em"><Icon name="shield" size={16} /></span>Earnings cap</>} hint={`${s.cap_multiple}× your business, resets every ${s.cap_cycle_days} days`} action={<span className="chip">{cycleDaysLeft(me, s)}d left</span>}>
        <div className="row between" style={{ alignItems: 'baseline' }}>
          <div className="balance">{fmt(me.cycle_earned)}</div>
          <div className="muted">of <span className="mono" style={{ color: 'var(--text)' }}>{fmt(cap)}</span></div>
        </div>
        <Progress value={cap ? me.cycle_earned / cap : 0} />
        <dl className="kv mt">
          <dt>Your business</dt><dd className="mono">{fmt(me.pv)}</dd>
          <dt>Remaining this cycle</dt><dd className="mono up">{fmt(Math.max(0, cap - me.cycle_earned))}</dd>
          <dt>Counts toward cap</dt><dd>Tree bonus + matching</dd>
        </dl>
        <div className="notice mt"><Icon name="info" size={16} />Buy a bigger pack to raise your cap. For example, {fmt0(300)} of business gives a {fmt0(900)} cap per cycle.</div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- ranks
function RanksTab() {
  const { me, ranks, achievements, settings: s, rpc } = useData();
  const ts = useTeamStats();
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const list = ranks.length ? ranks : RANKS_FALLBACK;
  const weak = Math.min(me.lt, me.rt);
  const got = new Map(achievements.map((a) => [a.reward_id, a]));
  const valueOf = (r: RankReward) => (r.track === 'business' ? weak : ts.paid.length);
  const ready = list.filter((r) => !got.has(r.id) && valueOf(r) >= r.target);
  const readyTotal = ready.reduce((a, r) => a + r.bonus, 0);
  const earned = achievements.reduce((a, x) => a + x.bonus, 0);
  const active = isActive(me, s);

  const Table = ({ track, title, icon, unit }: { track: 'business' | 'recruitment'; title: string; icon: string; unit: string }) => {
    const items = list.filter((r) => r.track === track).sort((a, b) => a.sort - b.sort);
    const now = valueOf(items[0] || ({ track } as RankReward));
    return (
      <Card title={<><span className={`icon-box ${track === 'recruitment' ? 'em' : ''}`}><Icon name={icon} size={16} /></span>{title}</>}
        hint={track === 'business' ? `Lifetime volume on your smaller side · you have ${now.toLocaleString()} BV` : `Paid direct referrals · you have ${now}`}>
        <div className="table-wrap">
          <table className="targets">
            <thead><tr><th>Rank</th><th className="r">Target</th><th style={{ width: '34%' }}>Your progress</th><th className="r">Bonus</th><th className="r">Status</th></tr></thead>
            <tbody>
              {items.map((r) => {
                const v = valueOf(r);
                const p = Math.min(1, v / r.target);
                const a = got.get(r.id);
                const isReady = !a && v >= r.target;
                return (
                  <tr key={r.id} className={a ? 'done' : isReady ? 'ready' : ''}>
                    <td><div className="row" style={{ gap: 10 }}><span className={`icon-box ${a ? 'em' : ''}`} style={{ width: 26, height: 26 }}><Icon name={track === 'business' ? 'medal' : 'users'} size={14} /></span><b>{r.name}</b></div></td>
                    <td className="r mono">{r.target.toLocaleString()} <span className="dim" style={{ fontSize: 11 }}>{unit}</span></td>
                    <td><div className="row" style={{ gap: 10 }}><div style={{ flex: 1 }}><Progress value={p} tone={a ? 'em' : undefined} /></div><span className="mono dim" style={{ fontSize: 11, width: 38, textAlign: 'right' }}>{Math.floor(p * 100)}%</span></div></td>
                    <td className={`r mono ${a ? 'em-text' : ''}`} style={{ fontWeight: 650 }}>{fmt0(r.bonus)}</td>
                    <td className="r">{a ? <Badge tone="ok"><Icon name="check" size={11} />Paid {fmtDate(a.achieved_at)}</Badge> : isReady ? <Badge tone="gold">Ready to claim</Badge> : <Badge><Icon name="lock" size={11} />{(r.target - v).toLocaleString()} to go</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    );
  };

  return (
    <>
      <Card className={readyTotal ? 'gold' : ''}>
        <div className="row between wrap" style={{ gap: 16 }}>
          <div className="row" style={{ gap: 14 }}>
            <span className="icon-box lg"><Icon name="trophy" size={22} /></span>
            <div>
              <div style={{ fontWeight: 650, fontSize: 16 }}>{readyTotal ? `${fmt0(readyTotal)} in rank bonuses ready to claim` : 'Rank achievement bonuses'}</div>
              <div className="muted" style={{ fontSize: 13 }}>Each rank pays a one-time bonus to your free balance, which you can withdraw. Earned so far: <b style={{ color: 'var(--text)' }}>{fmt(earned)}</b></div>
            </div>
          </div>
          <button className="btn primary" disabled={busy || !readyTotal || !active} onClick={async () => { setBusy(true); await rpc('claim_rank_rewards', {}, 'Rank bonus added to your free balance'); setBusy(false); }}>
            {busy ? <span className="spinner" /> : <Icon name="gift" size={16} />}{active ? 'Claim bonuses' : 'Buy a pack to unlock'}
          </button>
        </div>
      </Card>
      <Table track="business" title="Business targets" icon="medal" unit="BV" />
      <Table track="recruitment" title="Recruitment targets" icon="users" unit="directs" />
    </>
  );
}

// ---------------------------------------------------------------- members
function MembersTab() {
  const { me, team, settings: s } = useData();
  const ts = useTeamStats();
  const [filter, setFilter] = useState<'all' | 'direct' | 'L' | 'R'>('all');
  const [q, setQ] = useState('');
  const names = useMemo(() => new Map(team.map((t) => [t.id, t.name])), [team]);
  const rows = ts.members
    .filter((m) => filter === 'all' || (filter === 'direct' ? m.sponsor_id === me!.id : m.root_leg === filter))
    .filter((m) => !q || (m.name + m.code).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <Card title={`Team members · ${ts.members.length}`} hint={`${ts.active.length} active · ${ts.paid.length} paid directs`}
      action={<div className="row wrap">
        <Seg size="sm" value={filter} onChange={setFilter} options={[{ v: 'all', l: 'All' }, { v: 'direct', l: 'Directs' }, { v: 'L', l: 'Left' }, { v: 'R', l: 'Right' }]} />
        <input className="input" style={{ width: 190, height: 34 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>}>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Member</th><th>ID</th><th>Sponsor</th><th>Team</th><th>Joined</th><th className="r">Business</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td><div className="row"><span className="avatar sm">{initials(m.name)}</span><div><div style={{ fontWeight: 560 }}>{m.name}</div><div className="dim" style={{ fontSize: 11.5 }}>{m.country || '—'}</div></div></div></td>
                <td className="mono muted">{m.code}</td>
                <td>{m.sponsor_id === me!.id ? <Badge tone="gold">You</Badge> : <span className="muted">{names.get(m.sponsor_id || '') || '—'}</span>}</td>
                <td><Badge>{m.root_leg === 'L' ? 'Left' : 'Right'}</Badge></td>
                <td className="muted">{fmtDate(m.created_at)}</td>
                <td className="r mono">{fmt(m.pv)}</td>
                <td>{isActive(m, s) ? <Badge tone="ok">Active</Badge> : <Badge>Unpaid</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty icon="users">{ts.members.length ? 'No members match.' : 'No team members yet. Place someone from the tree or share your link.'}</Empty>}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- referral links
function InviteTab() {
  const { me, settings: s } = useData();
  const [leg, setLeg] = useState<'auto' | Leg>('auto');
  const [qr, setQr] = useState('');
  const link = refLink(me!.code, leg === 'auto' ? undefined : leg);
  useEffect(() => { QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: '#04100b', light: '#ffffff' } }).then(setQr).catch(() => setQr('')); }, [link]);
  const msg = `Join me at Aurelia, a gold-market academy with live analytics and automated gold trading bots with daily profit sharing: ${link}`;
  return (
    <div className="grid g2 stretch">
      <Card title={<><span className="icon-box em"><Icon name="link" size={16} /></span>Your referral link</>} hint="Anyone who signs up through it joins your tree after confirming their email.">
        <div className="stack" style={{ gap: 16 }}>
          <Seg value={leg} onChange={setLeg} options={[{ v: 'auto', l: 'Automatic' }, { v: 'L', l: 'Left team' }, { v: 'R', l: 'Right team' }]} />
          <CopyBox value={link} />
          <div className="row wrap" style={{ gap: 18, alignItems: 'flex-start' }}>
            {qr ? <img src={qr} alt="Referral QR code" className="qr" /> : <div className="qr skeleton" />}
            <div className="stack" style={{ flex: 1, minWidth: 200 }}>
              <div className="field"><label>Your referral code</label><div className="row"><span className="mono" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.16em' }}>{me!.code}</span><CopyButton text={me!.code} /></div></div>
              <div className="row wrap">
                <a className="btn sm" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">WhatsApp</a>
                <a className="btn sm" href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Join me at Aurelia')}`} target="_blank" rel="noreferrer">Telegram</a>
                <a className="btn sm" href={`mailto:?subject=${encodeURIComponent('Join me at Aurelia')}&body=${encodeURIComponent(msg)}`}>Email</a>
              </div>
            </div>
          </div>
        </div>
      </Card>
      <Card title="Placement rules">
        <div className="steps">
          {[
            ['Email confirmation required', 'New members are only placed after they open the confirmation link.'],
            ['Place anywhere in your tree', 'Tap any open slot below you in the tree to register someone exactly there.'],
            ['Always below, never above', 'New members always join at the bottom. Nobody can be inserted above an existing member.'],
            ['Paid referrers only', `Fast start, matching and ranks count only members with a ${fmt0(s.min_active)}+ pack.`],
          ].map(([t, d], i) => <div key={i} className="step"><span className="n">{i + 1}</span><div className="t">{t}<div className="d">{d}</div></div></div>)}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- leaderboard
function LeaderboardTab() {
  const { me, leaderboard, settings: s, rpc } = useData();
  const [busy, setBusy] = useState(false);
  const weeks = [...new Set(leaderboard.map((l) => l.week_start))];
  const latest = leaderboard.filter((l) => l.week_start === weeks[0]);
  const dayOfWeek = new Date().getUTCDay();
  const daysLeft = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  return (
    <div className="grid g3">
      <div className="span2">
        <Card title={weeks[0] ? `Week of ${fmtDate(weeks[0])}` : 'Weekly leaderboard'} hint={`Ranked by paid sales of direct referrals · next results in ${daysLeft || '<1'} day(s)`}
          action={<span className="chip"><Icon name="trophy" size={14} />{s.leaderboard_prizes.map((p) => fmt0(p)).join(' / ')}</span>}>
          {latest.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>#</th><th>Partner</th><th className="r">Direct sales</th><th className="r">Prize</th></tr></thead>
                <tbody>
                  {latest.map((r) => (
                    <tr key={r.member_id} style={r.member_id === me!.id ? { background: 'var(--gold-soft)' } : undefined}>
                      <td>{r.rank <= 3 ? <span className="gold-text" style={{ fontWeight: 750 }}>{r.rank}</span> : <span className="dim">{r.rank}</span>}</td>
                      <td><div className="row"><span className="avatar sm">{initials(r.display_name)}</span>{r.display_name}{r.member_id === me!.id && <Badge tone="gold">You</Badge>}</div></td>
                      <td className="r mono">{fmt(r.sales)}</td>
                      <td className="r mono">{r.prize ? fmt(r.prize) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty icon="trophy" title="No results yet">The first leaderboard is published at the end of the week (Sunday, UTC).</Empty>}
        </Card>
      </div>
      <Card title="Your rewards" className="gold">
        <div className="eyebrow">Claimable</div>
        <div className="balance gold-text">{fmt(me!.claimable)}</div>
        <p className="muted" style={{ fontSize: 13, margin: '0 0 14px' }}>Claimed rewards go straight to your free balance.</p>
        <button className="btn primary" disabled={busy || me!.claimable <= 0} onClick={async () => { setBusy(true); await rpc('claim_leaderboard', {}, 'Claimed to your free balance'); setBusy(false); }}>
          {busy ? <span className="spinner" /> : <Icon name="gift" size={16} />}Claim to free balance
        </button>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- certificate
export function rankOf(m: Member, paidDirects: number, s: Settings) {
  const weak = Math.min(m.lt, m.rt);
  if (weak >= 50000) return { name: 'Platinum Partner', next: null as null | { name: string; need: string; p: number } };
  if (weak >= 15000) return { name: 'Gold Partner', next: { name: 'Platinum', need: `${(50000 - weak).toLocaleString()} BV on the weaker team`, p: weak / 50000 } };
  if (weak >= 5000) return { name: 'Silver Partner', next: { name: 'Gold', need: `${(15000 - weak).toLocaleString()} BV on the weaker team`, p: weak / 15000 } };
  if (weak >= 1000 || paidDirects >= s.qualify_directs) return { name: 'Bronze Partner', next: { name: 'Silver', need: `${Math.max(0, 5000 - weak).toLocaleString()} BV on the weaker team`, p: weak / 5000 } };
  if (isActive(m, s)) return { name: 'Academy Member', next: { name: 'Bronze', need: `${(1000 - weak).toLocaleString()} BV weaker team or ${s.qualify_directs - paidDirects} paid direct(s)`, p: Math.max(weak / 1000, paidDirects / s.qualify_directs) } };
  return { name: 'Registered Member', next: { name: 'Academy Member', need: 'choose an academy pack', p: 0 } };
}

function CertificateTab() {
  const { me, settings: s } = useData();
  const ts = useTeamStats();
  const r = rankOf(me!, ts.paid.length, s);
  const need = s.qualify_directs;
  const unlocked = ts.paid.length >= need;
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div className="grid g3">
      <div className="span2">
        <div className={`cert-wrap ${unlocked ? '' : 'locked'}`}>
          <div className="certificate">
            <Logo size={44} />
            <div className="c-eyebrow">Aurelia Gold Academy</div>
            <div className="c-title">Certificate of Achievement</div>
            <div className="c-body">This certifies that</div>
            <div className="c-name">{me!.name}</div>
            <div className="c-body">has achieved the rank of <b>{r.name}</b> through dedication to learning and building a community of gold-market students.</div>
            <div className="c-foot"><span>Member ID · {me!.code}</span><span>Issued · {date}</span></div>
            <div className="seal">AURELIA<br />SEAL</div>
          </div>
          {!unlocked && (
            <div className="cert-lock">
              <span className="icon-box lg float"><Icon name="lock" size={22} /></span>
              <div style={{ fontWeight: 700, fontSize: 17 }}>Certificate locked</div>
              <div className="muted" style={{ maxWidth: 320, textAlign: 'center' }}>Unlocks when {need} people you introduced have bought an academy pack.</div>
              <div style={{ width: 240 }}><Progress value={ts.paid.length / need} tone="em" /></div>
              <div className="mono" style={{ fontWeight: 650 }}>{ts.paid.length} / {need} paid referrals</div>
            </div>
          )}
        </div>
      </div>
      <div className="stack gap18">
        <Card title="Current rank" className="gold">
          <div className="balance gold-text" style={{ fontSize: 26 }}>{r.name}</div>
          {r.next && <><div className="muted" style={{ fontSize: 13, margin: '6px 0 10px' }}>Next: <b style={{ color: 'var(--text)' }}>{r.next.name}</b> · {r.next.need}</div><Progress value={r.next.p} /></>}
          <div className="card-actions"><button className="btn primary" disabled={!unlocked} onClick={() => window.print()}><Icon name={unlocked ? 'print' : 'lock'} size={16} />{unlocked ? 'Print or save as PDF' : `Locked · ${need - ts.paid.length} more`}</button></div>
        </Card>
        {me!.kyc !== 'verified' && <div className="notice"><Icon name="shield" size={16} />Verify your identity so the certificate shows your legal name.</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- marketing
export const inviteLink = (code: string, v: 1 | 2 | 3) => `${location.origin}/#/join/${code}?v=${v}`;

function MarketingTab() {
  const { me } = useData();
  const link = refLink(me!.code);
  const first = me!.name.split(' ')[0];
  const posts = [
    { tag: 'Story', text: `Learning how the gold market really works. Aurelia's academy covers fundamentals, risk management and automated trading bots with daily performance profit sharing. Join me: ${link}` },
    { tag: 'News hook', text: `Gold is in the headlines again. If you want to understand the "why" behind the moves, I've been using Aurelia's courses and live analytics. ${link}` },
    { tag: 'Bot', text: `Automated algorithmic trading on live gold markets with daily performance profit sharing. Every Aurelia pack unlocks bot access. ${link}` },
    { tag: 'Question', text: `Quick question: do you actually know what moves the price of gold? I didn't, until I started Aurelia's fundamentals course. Short lessons, live charts, zero fluff. ${link}` },
    { tag: 'Routine', text: `My morning routine now: coffee, check the gold news bias on Aurelia, see what my trading bot did overnight. Learning by watching real markets. ${link}` },
    { tag: 'Beginner', text: `If you've ever wanted to learn trading but felt overwhelmed, start with gold. One market, clear lessons, and automated bots with daily profit shares. Here's where I'm learning: ${link}` },
    { tag: 'Community', text: `Building a small community around gold markets. We use Aurelia for the courses and the live trading bot. Want in? Join with my link: ${link}` },
    { tag: 'Short', text: `Gold. Explained properly. 📈 Courses + live analytics + automated trading bot → ${link}` },
    { tag: 'WhatsApp', text: `Hey! I've been learning about gold markets on Aurelia. They have short courses and automated trading bots with daily profit sharing. Thought you might like it: ${link}` },
  ];
  const pages: { v: 1 | 2 | 3; name: string; desc: string; cls: string }[] = [
    { v: 1, name: 'Academy invite', desc: 'Warm personal invitation focused on learning gold.', cls: 'lp1' },
    { v: 2, name: 'Trading bot', desc: 'Leads with the live automated trading bot and charts.', cls: 'lp2' },
    { v: 3, name: 'Personal letter', desc: 'Minimal letter-style page signed with your name.', cls: 'lp3' },
  ];
  const banners = [
    { c: 'b1', t: <>Understand gold.<br /><span className="gold-text">Trade smarter.</span></>, s: 'Courses · analytics · automated bot' },
    { c: 'b2', t: <>The gold academy<br />for curious minds</>, s: 'Start with Bullion Basics' },
    { c: 'b3', t: <>Trade with a<br /><span style={{ color: '#6ee7b7' }}>live gold bot</span></>, s: 'Real capital · daily profit sharing' },
  ];
  return (
    <>
      <div className="notice"><Icon name="shield" size={16} />Promote the academy and tools. Don't promise income, returns or "passive profits". Earnings depend on real product sales and most members earn little or nothing.</div>
      <Card title={<><span className="icon-box em"><Icon name="globe" size={16} /></span>Your personal landing pages</>} hint={`Each page greets visitors with "Invited by ${first}" and signs them up under your ID ${me!.code}.`}>
        <div className="grid g3">
          {pages.map((p) => (
            <div key={p.v} className="lp-card">
              <div className={`lp-thumb ${p.cls}`}>
                <span className="lp-chip">Invited by {first}</span>
                <b>{p.v === 1 ? 'Learn gold with me' : p.v === 2 ? 'Watch a bot trade gold' : `A note from ${first}`}</b>
                <i /><i /><i className="short" />
              </div>
              <div style={{ fontWeight: 650 }}>{p.name}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>{p.desc}</div>
              <div className="row wrap" style={{ marginTop: 'auto' }}>
                <CopyButton text={inviteLink(me!.code, p.v)} label="Copy link" />
                <a className="btn sm" href={inviteLink(me!.code, p.v)} target="_blank" rel="noreferrer"><Icon name="external" size={13} />Preview</a>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <div className="grid g3">
        {banners.map((b, i) => (
          <Card key={i}>
            <div className={`banner ${b.c}`}>
              <div className="row"><Logo size={20} /><b style={{ letterSpacing: '-0.02em' }}>Aurelia</b></div>
              <h4>{b.t}</h4>
              <div style={{ fontSize: 12, opacity: 0.8 }}>{b.s}</div>
            </div>
            <div className="row between mt"><span className="muted" style={{ fontSize: 12 }}>1600 × 900 · social</span><CopyButton text={link} label="Copy link" /></div>
          </Card>
        ))}
      </div>
      <Card title={`Ready-to-post captions · ${posts.length}`} hint="Your referral link is already included">
        <div className="grid g3">
          {posts.map((p, i) => (
            <div key={i} className="post-card">
              <span className="badge gold" style={{ alignSelf: 'flex-start' }}>{p.tag}</span>
              <p>{p.text}</p>
              <div className="row" style={{ marginTop: 'auto' }}>
                <CopyButton text={p.text} />
                <a className="btn sm ghost" href={`https://wa.me/?text=${encodeURIComponent(p.text)}`} target="_blank" rel="noreferrer">WhatsApp</a>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
