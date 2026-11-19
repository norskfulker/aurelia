import { useState } from 'react';
import { navigate, type Page } from '../App';
import BotPanel from '../components/BotPanel';
import { GoldChartCard } from '../components/GoldChart';
import NewsBoard from '../components/NewsBoard';
import { useData, useTeamStats } from '../lib/data';
import { Leg, fmt, fmt0, isActive } from '../lib/types';
import { Card, CopyButton, Icon, Seg, Stat } from '../ui/kit';
import { refLink } from './Affiliate';

export default function Dashboard({ go }: { go: (p: Page) => void }) {
  const { me, txs, loading } = useData();
  const ts = useTeamStats();
  if (!me) return null;
  const earned = txs.filter((t) => ['fast_start', 'binary', 'matching', 'reward_share', 'leaderboard', 'rank_bonus', 'clawback'].includes(t.type) && t.status === 'completed').reduce((a, t) => a + t.amount, 0);

  return (
    <div className="page">
      <div className="action-bar">
        <button className="btn primary" onClick={() => navigate('/app/wallet?deposit=1')}><Icon name="download" size={16} />Deposit crypto</button>
        <button className="btn" onClick={() => go('wallet')}><Icon name="cart" size={16} />Academy store</button>
        <button className="btn em" onClick={() => go('affiliate')}><Icon name="userPlus" size={16} />Invite & place</button>
        <button className="btn" onClick={() => go('wallet')}><Icon name="upload" size={16} />Withdraw <span className="btn-meta">{fmt(me.wallet_free)}</span></button>
      </div>

      <div className="grid g4">
        <Stat icon="coin" label="Free balance" value={<span className="em-text">{fmt(me.wallet_free)}</span>} foot="Withdraw or buy packs" tone="em" loading={loading} />
        <Stat icon="wallet" label="Package wallet" value={fmt(me.wallet_package)} foot="For academy purchases" loading={loading} />
        <Stat icon="zap" label="Total earnings" value={fmt(earned)} foot={`On ${fmt0(me.pv)} personal business`} loading={loading} />
        <Stat icon="users" label="Team" value={ts.members.length.toLocaleString()} foot={`${ts.paid.length} paid directs · ${ts.active.length} active`} tone="em" loading={loading} />
      </div>

      <div className="dash-grid">
        <div className="dash-col">
          <GoldChartCard />
          <BotPanel onGetPack={() => go('wallet')} />
        </div>
        <div className="dash-col">
          <GetStarted go={go} />
          <ReferralCard />
          <NewsBoard limit={9} />
        </div>
      </div>
    </div>
  );
}

type StepState = 'done' | 'wait' | 'todo';

function GetStarted({ go }: { go: (p: Page) => void }) {
  const { me, settings: s, txs, bots, kyc } = useData();
  const ts = useTeamStats();
  if (!me) return null;
  const depDone = txs.some((t) => t.type === 'deposit' && t.status === 'completed');
  const depWait = txs.some((t) => t.type === 'deposit' && t.status === 'pending');
  const steps: { title: string; detail: string; state: StepState; page?: Page; cta?: string; deposit?: boolean }[] = [
    { title: 'Account created', detail: `Email verified · member ID ${me.code}`, state: 'done' },
    {
      title: 'Verify your identity',
      detail: me.kyc === 'verified' ? 'Identity verified, withdrawals unlocked' : me.kyc === 'pending' ? `Under review since ${kyc ? new Date(kyc.created_at).toLocaleDateString() : 'recently'}` : me.kyc === 'rejected' ? 'Declined, please resubmit clearer photos' : 'A 2-minute scan unlocks withdrawals',
      state: me.kyc === 'verified' ? 'done' : me.kyc === 'pending' ? 'wait' : 'todo', page: 'profile', cta: me.kyc === 'rejected' ? 'Retry' : 'Verify',
    },
    { title: 'Fund your package wallet', detail: depDone ? 'Deposit confirmed on-chain' : depWait ? 'Deposit awaiting confirmations' : 'USDT, USDC or SOL', state: depDone ? 'done' : depWait ? 'wait' : 'todo', deposit: true, cta: 'Deposit' },
    { title: `Choose an academy pack`, detail: isActive(me, s) ? `${fmt0(me.pv)} business · courses unlocked` : `From ${fmt0(s.min_active)} · unlocks tools and the bot`, state: isActive(me, s) ? 'done' : 'todo', page: 'wallet', cta: 'Browse' },
    { title: 'Launch a gold trading bot', detail: bots.length ? `${bots.length} bot${bots.length > 1 ? 's' : ''} active on the live market` : 'Trade live gold with daily profit sharing', state: bots.length ? 'done' : 'todo', cta: 'Below ↓' },
    { title: `Introduce ${s.qualify_directs} paid members`, detail: `${Math.min(ts.paid.length, s.qualify_directs)}/${s.qualify_directs} paid directs · unlocks the tree bonus`, state: ts.paid.length >= s.qualify_directs ? 'done' : ts.paid.length > 0 ? 'wait' : 'todo', page: 'affiliate', cta: 'Invite' },
  ];
  const done = steps.filter((x) => x.state === 'done').length;
  const pct = Math.round((done / steps.length) * 100);
  const currentIdx = steps.findIndex((x) => x.state !== 'done');
  const label = { done: 'Verified', wait: 'In progress', todo: 'To do' } as const;

  return (
    <Card className={pct === 100 ? 'em' : 'gold'}>
      <div className="onboard-head">
        <div className="ring" style={{ background: `conic-gradient(var(--em) ${pct * 3.6}deg, var(--inset) 0)` }}><b>{pct}%</b></div>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, letterSpacing: '-0.015em' }}>{pct === 100 ? 'All set. You are fully verified' : 'Your setup checklist'}</h3>
          <div className="muted" style={{ fontSize: 12.5 }}>{done} of {steps.length} verified{currentIdx >= 0 ? ` · next: ${steps[currentIdx].title.toLowerCase()}` : ''}</div>
        </div>
      </div>
      <div className="steps">
        {steps.map((st, i) => (
          <div key={st.title} className={`step ${st.state === 'done' ? 'done' : ''} ${i === currentIdx ? 'current' : ''} ${st.state === 'wait' ? 'waiting' : ''}`}>
            <span className="n">{st.state === 'done' ? <Icon name="check" size={14} stroke={2.6} /> : st.state === 'wait' ? <Icon name="clock" size={14} /> : i + 1}</span>
            <div className="t">{st.title}<div className="d">{st.detail}</div></div>
            {st.state === 'done' || (!st.page && !st.deposit)
              ? <span className={`state ${st.state}`}>{st.state === 'done' && <Icon name="shield" size={11} />}{label[st.state]}</span>
              : <button className={`btn sm ${i === currentIdx ? 'primary' : ''}`} onClick={() => (st.deposit ? navigate('/app/wallet?deposit=1') : go(st.page!))}>{st.cta}</button>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function ReferralCard() {
  const { me } = useData();
  const [leg, setLeg] = useState<'auto' | Leg>('auto');
  if (!me) return null;
  const link = refLink(me.code, leg === 'auto' ? undefined : leg);
  const msg = `Join me at Aurelia, a gold-market academy with live analytics and automated gold trading bots with daily profit sharing: ${link}`;
  const share = () => (navigator.share ? navigator.share({ title: 'Aurelia', text: msg, url: link }).catch(() => {}) : navigator.clipboard?.writeText(msg));
  return (
    <Card title={<><span className="icon-box em"><Icon name="link" size={16} /></span>Your referral link</>} hint="New members who join through it are placed in your tree after confirming their email."
      action={<span className="chip mono" style={{ color: 'var(--text)', letterSpacing: '0.12em' }}>{me.code}</span>}>
      <div className="stack">
        <Seg size="sm" value={leg} onChange={setLeg} options={[{ v: 'auto', l: 'Auto side' }, { v: 'L', l: 'Left team' }, { v: 'R', l: 'Right team' }]} />
        <div className="ref-url"><span>{link}</span><CopyButton text={link} /></div>
        <div className="row wrap">
          <button className="btn sm em" onClick={share}><Icon name="share" size={14} />Share</button>
          <a className="btn sm" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">WhatsApp</a>
          <a className="btn sm" href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Join me at Aurelia')}`} target="_blank" rel="noreferrer">Telegram</a>
        </div>
      </div>
    </Card>
  );
}

export function Legs() {
  const { me, settings: s } = useData();
  const ts = useTeamStats();
  if (!me) return null;
  const weaker = Math.min(me.lv, me.rv);
  return (
    <>
      <div className="legs">
        {([['L', 'Left team', me.lv, me.lt, ts.split.L], ['R', 'Right team', me.rv, me.rt, ts.split.R]] as const).map(([k, label, carry, total, d]) => (
          <div key={k} className="leg">
            <div className="eyebrow">{label}</div>
            <div className="balance mono" style={{ fontSize: 24 }}>{carry.toLocaleString()} <span className="dim" style={{ fontSize: 13 }}>BV</span></div>
            <div className="muted" style={{ fontSize: 12 }}>Lifetime {total.toLocaleString()} BV · {d} paid direct{d === 1 ? '' : 's'}</div>
          </div>
        ))}
      </div>
      <dl className="kv mt">
        <dt>Pairable tonight</dt><dd className="mono">{weaker.toLocaleString()} BV</dd>
        <dt>Estimated tree bonus ({s.binary_pct * 100}%)</dt><dd className="mono up">{ts.qualified ? fmt(Math.min(weaker * s.binary_pct, Math.max(0, s.cap_multiple * me.pv - me.cycle_earned))) : '—'}</dd>
      </dl>
    </>
  );
}
