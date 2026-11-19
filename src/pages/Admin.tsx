import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useData, useToast } from '../lib/data';
import { errText, supabase } from '../lib/supabase';
import { Coupon, CryptoMethod, EXPLORERS, KycSubmission, Member, Order, Payout, Settings, Tx, fmt, fmt0, fmtDate, fmtDateTime, initials, short } from '../lib/types';
import { AreaChart, Badge, Card, CoinIcon, CopyButton, Drawer, Empty, Icon, Modal, Progress, Seg, useConfirm } from '../ui/kit';

type Tab = 'overview' | 'queue' | 'members' | 'ledger' | 'addresses' | 'coupons' | 'ops';
const TX_LABEL: Record<string, string> = {
  deposit: 'Deposit', purchase: 'Pack purchase', fast_start: 'Fast start', binary: 'Tree bonus', matching: 'Matching', reward_share: 'Reward share',
  leaderboard: 'Leaderboard', rank_bonus: 'Rank bonus', withdrawal: 'Withdrawal', refund: 'Refund', clawback: 'Clawback',
  bot_licence: 'Bot licence', bot_profit: 'Trading profit', bot_capital: 'Trading capital', bot_capital_return: 'Capital return',
};
const num = (v: unknown) => Number(v ?? 0);

function useAdminCounts() {
  const [c, setC] = useState({ kyc: 0, deposits: 0, withdrawals: 0, awaiting: 0, loaded: false });
  const load = useCallback(async () => {
    const now = new Date().toISOString();
    const [k, d, w, a] = await Promise.all([
      supabase.from('kyc_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('payouts').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('kind', 'deposit').not('tx_hash', 'is', null),
      supabase.from('payouts').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('kind', 'withdrawal'),
      supabase.from('payouts').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('kind', 'deposit').is('tx_hash', null).gt('expires_at', now),
    ]);
    setC({ kyc: k.count || 0, deposits: d.count || 0, withdrawals: w.count || 0, awaiting: a.count || 0, loaded: true });
  }, []);
  useEffect(() => {
    load();
    const ch = supabase.channel('admin-counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payouts' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kyc_submissions' }, load)
      .subscribe();
    const t = setInterval(load, 60_000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [load]);
  return c;
}

export default function Admin() {
  const [tab, setTab] = useState<Tab>(() => { try { return (sessionStorage.getItem('aurelia.admintab') as Tab) || 'overview'; } catch { return 'overview'; } });
  useEffect(() => { try { sessionStorage.setItem('aurelia.admintab', tab); } catch { /* ignore */ } }, [tab]);
  const counts = useAdminCounts();
  const todo = counts.kyc + counts.deposits + counts.withdrawals;
  const label = (text: string, n?: number) => <span className="tab-label">{text}{n ? <span className="tab-count">{n}</span> : null}</span>;
  return (
    <div className="page">
      <div className={`admin-alerts ${todo ? '' : 'clear'}`}>
        <span className="row" style={{ gap: 10, fontWeight: 650 }}>
          <span className={`icon-box ${todo ? '' : 'em'}`}><Icon name={todo ? 'alert' : 'check'} size={16} /></span>
          {!counts.loaded ? 'Checking the queue…' : todo ? `${todo} item${todo === 1 ? '' : 's'} need${todo === 1 ? 's' : ''} your attention` : 'All caught up'}
        </span>
        <div className="row wrap">
          {counts.kyc > 0 && <button className="btn sm" onClick={() => setTab('queue')}><Icon name="shield" size={14} />{counts.kyc} identity review{counts.kyc === 1 ? '' : 's'}</button>}
          {counts.deposits > 0 && <button className="btn sm" onClick={() => setTab('queue')}><Icon name="download" size={14} />{counts.deposits} deposit{counts.deposits === 1 ? '' : 's'} to confirm</button>}
          {counts.withdrawals > 0 && <button className="btn sm primary" onClick={() => setTab('queue')}><Icon name="upload" size={14} />{counts.withdrawals} withdrawal{counts.withdrawals === 1 ? '' : 's'} to send</button>}
          {counts.awaiting > 0 && <span className="chip"><Icon name="clock" size={13} />{counts.awaiting} awaiting payment</span>}
        </div>
      </div>
      <div className="aff-tabs">
        <Seg value={tab} onChange={setTab} options={[
          { v: 'overview', l: label('Overview') }, { v: 'queue', l: label('Approvals', todo) }, { v: 'members', l: label('Members') }, { v: 'ledger', l: label('Ledger') },
          { v: 'addresses', l: label('Networks & addresses') }, { v: 'coupons', l: label('Bot coupons') }, { v: 'ops', l: label('Operations') },
        ]} />
      </div>
      <div key={tab} className="page" style={{ gap: 18 }}>
        {tab === 'overview' && <Overview go={setTab} />}
        {tab === 'queue' && <Queue />}
        {tab === 'members' && <Members />}
        {tab === 'ledger' && <Ledger />}
        {tab === 'addresses' && <Addresses />}
        {tab === 'coupons' && <Coupons />}
        {tab === 'ops' && <Ops />}
      </div>
    </div>
  );
}

// ================================================================ overview
interface OverviewData {
  members: number; active: number; new_7d: number; new_30d: number;
  kyc: { pending: number; verified: number; rejected: number; none: number };
  sales_total: number; sales_period: number; orders_total: number; refunds_total: number;
  deposits_total: number; deposits_pending: number; deposits_awaiting: number;
  withdrawals_total: number; withdrawals_fees: number; withdrawals_pending: { count: number; amount: number };
  liabilities: { free: number; package: number; claimable: number };
  commissions: Record<string, number>;
  products: { name: string; orders: number; revenue: number }[];
  daily: { day: string; signups: number; sales: number; deposits: number; withdrawals: number; commissions: number }[];
  top_sponsors: { name: string; code: string; directs: number; paid: number; volume: number }[];
  countries: { country: string; members: number }[];
  methods: { method_code: string; deposits: number; deposit_volume: number; withdrawal_volume: number }[];
  bots: { running: number; total: number; bonus_capital: number; capital?: number; licence_revenue?: number };
  coupons: { active: number; redemptions: number };
  last_close: { day: string; binary_total: number; matching_total: number; reward_total: number; sales: number } | null;
}

function Kpi({ icon, label, value, sub, tone, onClick }: { icon: string; label: string; value: ReactNode; sub?: ReactNode; tone?: 'em' | 'red'; onClick?: () => void }) {
  return (
    <button className="aff-kpi" style={{ textAlign: 'left', cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <span className="k"><Icon name={icon} size={13} />{label}</span>
      <span className={`v mono ${tone === 'em' ? 'em-text' : tone === 'red' ? 'down' : ''}`}>{value}</span>
      {sub && <span className="s">{sub}</span>}
    </button>
  );
}

function Bars({ rows, format = (v: number) => v.toLocaleString(), tone }: { rows: { label: ReactNode; value: number; extra?: ReactNode }[]; format?: (v: number) => string; tone?: 'em' }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  if (!rows.length) return <Empty icon="chart">No data yet.</Empty>;
  return (
    <div className="bars">
      {rows.map((r, i) => (
        <div key={i} className="bar-row">
          <div className="row between" style={{ fontSize: 12.5 }}><span>{r.label}</span><span className="mono">{format(r.value)}{r.extra}</span></div>
          <Progress value={Math.abs(r.value) / max} tone={tone} />
        </div>
      ))}
    </div>
  );
}

function Overview({ go }: { go: (t: Tab) => void }) {
  const toast = useToast();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const [d, setD] = useState<OverviewData | null>(null);
  const [series, setSeries] = useState<'sales' | 'signups' | 'deposits' | 'commissions'>('sales');
  const load = useCallback(() => {
    supabase.rpc('admin_overview', { p_days: Number(days) }).then(({ data, error }) => { if (error) toast(errText(error), 'err'); else setD(data as OverviewData); });
  }, [days, toast]);
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);
  if (!d) return <div className="grid g3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" style={{ height: 110 }} />)}</div>;

  const comm = d.commissions || {};
  const commTotal = Object.values(comm).reduce((a, v) => a + num(v), 0);
  const payoutRatio = d.sales_total ? commTotal / num(d.sales_total) : 0;
  const pts = d.daily.map((x) => ({ t: Date.parse(x.day + 'T00:00:00Z'), v: num(x[series]) }));
  const periodSum = d.daily.reduce((a, x) => a + num(x[series]), 0);

  return (
    <>
      <div className="row between wrap">
        <div className="muted" style={{ fontSize: 13 }}>Live platform figures · refreshes every minute</div>
        <div className="row"><Seg size="sm" value={days} onChange={setDays} options={[{ v: '7', l: '7 days' }, { v: '30', l: '30 days' }, { v: '90', l: '90 days' }]} /><button className="btn sm icon" onClick={load} aria-label="Refresh"><Icon name="history" size={14} /></button></div>
      </div>
      <div className="aff-hero">
        <Kpi icon="users" label="Members" value={num(d.members).toLocaleString()} sub={`${num(d.active)} active · +${d.new_7d} this week`} onClick={() => go('members')} />
        <Kpi icon="cart" label="Sales" value={fmt0(num(d.sales_total))} sub={`${fmt0(num(d.sales_period))} in ${days} days · ${d.orders_total} orders`} tone="em" />
        <Kpi icon="download" label="Deposits" value={fmt0(num(d.deposits_total))} sub={`${d.deposits_pending} to confirm · ${d.deposits_awaiting} awaiting payment`} onClick={() => go('queue')} />
        <Kpi icon="upload" label="Withdrawn" value={fmt0(num(d.withdrawals_total))} sub={`${d.withdrawals_pending.count} pending · ${fmt0(num(d.withdrawals_pending.amount))}`} onClick={() => go('queue')} />
        <Kpi icon="zap" label="Commissions paid" value={fmt0(commTotal)} sub={`${(payoutRatio * 100).toFixed(1)}% of sales`} tone={payoutRatio > 0.6 ? 'red' : undefined} />
        <Kpi icon="wallet" label="Member balances" value={fmt0(num(d.liabilities.free) + num(d.liabilities.package))} sub={`${fmt0(num(d.liabilities.free))} free · ${fmt0(num(d.liabilities.package))} package`} />
        <Kpi icon="shield" label="KYC queue" value={d.kyc.pending} sub={`${d.kyc.verified} verified · ${d.kyc.rejected} declined`} onClick={() => go('queue')} />
        <Kpi icon="bot" label="Trading bots" value={`${d.bots.running} running`} sub={`${fmt0(num(d.bots.capital))} in pool · ${fmt0(num(d.bots.licence_revenue))} licences · ${d.bots.total} total`} onClick={() => go('coupons')} />
      </div>

      <Card title={<><span className="icon-box"><Icon name="chart" size={16} /></span>Daily activity</>} hint={`${series === 'signups' ? periodSum.toLocaleString() + ' signups' : fmt(periodSum)} over the last ${days} days`}
        action={<Seg size="sm" value={series} onChange={setSeries} options={[{ v: 'sales', l: 'Sales' }, { v: 'signups', l: 'Signups' }, { v: 'deposits', l: 'Deposits' }, { v: 'commissions', l: 'Commissions' }]} />}>
        <AreaChart data={pts} height={220} tone={series === 'commissions' ? 'gold' : 'em'} format={(v) => (series === 'signups' ? String(Math.round(v)) : fmt0(v))} timeFmt={(t) => new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' })} />
      </Card>

      <div className="grid g3">
        <Card title="Pack mix" hint="Paid orders by pack">
          <Bars rows={d.products.map((p) => ({ label: p.name, value: num(p.revenue), extra: <span className="dim"> · {p.orders}</span> }))} format={(v) => fmt0(v)} />
        </Card>
        <Card title="Commission breakdown" hint={`Payout ratio ${(payoutRatio * 100).toFixed(1)}% of lifetime sales`}>
          <Bars tone="em" rows={Object.entries(comm).sort((a, b) => num(b[1]) - num(a[1])).map(([k, v]) => ({ label: TX_LABEL[k] || k, value: num(v) }))} format={(v) => fmt0(v)} />
        </Card>
        <Card title="Treasury" hint="What the platform owes members">
          <dl className="kv">
            <dt>Free balances</dt><dd className="mono">{fmt(num(d.liabilities.free))}</dd>
            <dt>Package wallets</dt><dd className="mono">{fmt(num(d.liabilities.package))}</dd>
            <dt>Unclaimed rewards</dt><dd className="mono">{fmt(num(d.liabilities.claimable))}</dd>
            <dt>Pending withdrawals</dt><dd className="mono">{fmt(num(d.withdrawals_pending.amount))}</dd>
            <dt>Withdrawal fees earned</dt><dd className="mono up">{fmt(num(d.withdrawals_fees))}</dd>
            <dt>Refunded sales</dt><dd className="mono">{fmt(num(d.refunds_total))}</dd>
          </dl>
          {d.last_close && <div className="notice em mt"><Icon name="check" size={16} />Last close {d.last_close.day}: {fmt0(num(d.last_close.binary_total))} tree bonus · {fmt0(num(d.last_close.matching_total))} matching</div>}
        </Card>
      </div>

      <div className="grid g3">
        <div className="span2">
          <Card title="Top sponsors" hint="By business volume of direct referrals">
            {d.top_sponsors.length ? (
              <div className="table-wrap"><table>
                <thead><tr><th>Member</th><th>ID</th><th className="r">Directs</th><th className="r">Paid</th><th className="r">Volume</th></tr></thead>
                <tbody>{d.top_sponsors.map((t) => <tr key={t.code}><td><div className="row"><span className="avatar sm">{initials(t.name)}</span>{t.name}</div></td><td className="mono muted">{t.code}</td><td className="r mono">{t.directs}</td><td className="r mono">{t.paid}</td><td className="r mono">{fmt0(num(t.volume))}</td></tr>)}</tbody>
              </table></div>
            ) : <Empty icon="users">No referrals yet.</Empty>}
          </Card>
        </div>
        <Card title="Members by country">
          <Bars rows={d.countries.map((c) => ({ label: c.country, value: num(c.members) }))} />
        </Card>
      </div>

      <Card title="Payment networks" hint="Completed volume per network">
        {d.methods.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Network</th><th className="r">Deposits</th><th className="r">Deposit volume</th><th className="r">Withdrawal volume</th></tr></thead>
            <tbody>{d.methods.map((m) => <tr key={m.method_code}><td>{m.method_code.replace('_', ' · ')}</td><td className="r mono">{m.deposits}</td><td className="r mono">{fmt(num(m.deposit_volume))}</td><td className="r mono">{fmt(num(m.withdrawal_volume))}</td></tr>)}</tbody>
          </table></div>
        ) : <Empty icon="wallet">No payments yet.</Empty>}
      </Card>
    </>
  );
}

// ================================================================ approvals
function Queue() {
  const toast = useToast();
  const confirm = useConfirm();
  const [kyc, setKyc] = useState<(KycSubmission & { member: { name: string; code: string; email: string } })[]>([]);
  const [payouts, setPayouts] = useState<(Payout & { expires_at?: string | null; member: { name: string; code: string } })[]>([]);
  const [view, setView] = useState<string | null>(null);
  const [settle, setSettle] = useState<Payout | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [k, p] = await Promise.all([
      supabase.from('kyc_submissions').select('*, member:members(name, code, email)').eq('status', 'pending').order('created_at'),
      supabase.from('payouts').select('*, member:members(name, code)').eq('status', 'pending').order('created_at'),
    ]);
    setKyc((k.data || []) as typeof kyc);
    setPayouts(((p.data || []) as typeof payouts).map((x) => ({ ...x, amount: num(x.amount), fee: num(x.fee) })));
  }, []);
  useEffect(() => {
    load();
    const ch = supabase.channel('admin-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payouts' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kyc_submissions' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const call = async (fn: string, args: Record<string, unknown>, ok: string) => {
    const { error } = await supabase.rpc(fn, args);
    if (error) toast(errText(error), 'err'); else { toast(ok); load(); }
  };
  const live = payouts.filter((p) => !(p.kind === 'deposit' && !p.tx_hash && p.expires_at && new Date(p.expires_at) < new Date()));
  const toConfirm = live.filter((p) => p.kind === 'deposit' && p.tx_hash);
  const awaiting = live.filter((p) => p.kind === 'deposit' && !p.tx_hash);
  const withdrawals = live.filter((p) => p.kind === 'withdrawal');

  const PayTable = ({ rows, kind }: { rows: typeof payouts; kind: 'confirm' | 'await' | 'withdraw' }) => rows.length ? (
    <div className="table-wrap"><table>
      <thead><tr><th>Requested</th><th>Member</th><th>Network</th><th>{kind === 'withdraw' ? 'Send to' : kind === 'await' ? 'Assigned address' : 'Transaction'}</th><th className="r">Amount</th><th className="r">Action</th></tr></thead>
      <tbody>{rows.map((p) => (
        <tr key={p.id}>
          <td className="muted">{fmtDateTime(p.created_at)}</td>
          <td>{p.member?.name}<div className="dim mono" style={{ fontSize: 11 }}>{p.member?.code}</div></td>
          <td className="muted">{p.method_code.replace('_', ' · ')}</td>
          <td className="mono">{kind === 'confirm' && p.tx_hash ? <a href={EXPLORERS[p.method_code]?.(p.tx_hash)} target="_blank" rel="noreferrer">{short(p.tx_hash, 6)} <Icon name="external" size={12} /></a>
            : <span title={p.address}>{short(p.address, 6)} <CopyButton text={p.address} label="" /></span>}</td>
          <td className="r mono">{fmt(p.amount)}{p.fee > 0 && <div className="dim" style={{ fontSize: 11 }}>send {fmt(p.amount - p.fee)}</div>}</td>
          <td className="r"><div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn sm em" onClick={() => setSettle(p)}>{p.kind === 'deposit' ? 'Confirm' : 'Mark sent'}</button>
            <button className="btn sm danger" onClick={async () => { if (await confirm({ title: `Reject this ${p.kind}?`, body: p.kind === 'withdrawal' ? 'The amount returns to the member\'s free balance.' : 'The deposit will be marked as rejected.', confirm: 'Reject', tone: 'danger' })) call('admin_settle_payout', { p_id: p.id, p_approve: false, p_note: 'Rejected by admin' }, 'Rejected'); }}>Reject</button>
          </div></td>
        </tr>
      ))}</tbody>
    </table></div>
  ) : <Empty icon="check">Nothing here.</Empty>;

  return (
    <>
      <div className="aff-hero">
        <Kpi icon="shield" label="KYC to review" value={kyc.length} />
        <Kpi icon="download" label="Deposits to confirm" value={toConfirm.length} sub={fmt0(toConfirm.reduce((a, p) => a + p.amount, 0))} />
        <Kpi icon="clock" label="Awaiting payment" value={awaiting.length} sub="address reserved, no hash yet" />
        <Kpi icon="upload" label="Withdrawals to send" value={withdrawals.length} sub={fmt0(withdrawals.reduce((a, p) => a + p.amount - p.fee, 0))} />
      </div>
      <Card title={`Identity reviews · ${kyc.length}`}>
        {kyc.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Submitted</th><th>Member</th><th>Document</th><th>Details</th><th className="r">Action</th></tr></thead>
            <tbody>{kyc.map((k) => (
              <tr key={k.id}>
                <td className="muted">{fmtDateTime(k.created_at)}</td>
                <td>{k.member?.name}<div className="dim mono" style={{ fontSize: 11 }}>{k.member?.code}</div></td>
                <td>{k.doc_type}<div className="mono dim" style={{ fontSize: 11 }}>{k.doc_number}</div></td>
                <td style={{ whiteSpace: 'normal' }}>{k.full_name}<div className="dim" style={{ fontSize: 11 }}>DOB {k.dob || '—'} · exp {k.expiry || '—'} · {k.nationality || '—'}</div></td>
                <td className="r"><div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn sm" onClick={() => setView(k.id)}><Icon name="eye" size={14} />View</button>
                  <button className="btn sm em" onClick={() => call('admin_review_kyc', { p_id: k.id, p_approve: true }, 'KYC approved')}>Approve</button>
                  <button className="btn sm danger" onClick={() => setDeclining(k.id)}>Decline</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty icon="shield">No identity reviews waiting.</Empty>}
      </Card>
      <Card title={`Deposits to confirm · ${toConfirm.length}`} hint="Check each hash on the explorer reached your pool address before confirming."><PayTable rows={toConfirm} kind="confirm" /></Card>
      <Card title={`Withdrawals to send · ${withdrawals.length}`} hint="Send from treasury, then record the on-chain hash."><PayTable rows={withdrawals} kind="withdraw" /></Card>
      <Card title={`Awaiting payment · ${awaiting.length}`} hint="Members reserved an address but haven't submitted a hash yet. These expire after 24 hours. You can still confirm if you see the funds arrive."><PayTable rows={awaiting} kind="await" /></Card>
      {view && <KycViewer sub={kyc.find((k) => k.id === view)!} onClose={() => setView(null)} />}
      {settle && <SettleModal p={settle} onClose={() => setSettle(null)} onDone={load} />}
      {declining && <DeclineModal onClose={() => setDeclining(null)} onSubmit={(note) => { call('admin_review_kyc', { p_id: declining, p_approve: false, p_note: note }, 'KYC declined'); setDeclining(null); }} />}
    </>
  );
}

function DeclineModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState('Photo is blurry or cropped. Please retake in good light.');
  return (
    <Modal title="Decline verification" onClose={onClose}>
      <div className="stack">
        <div className="field"><label>Reason shown to the member</label><textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <button className="btn danger block" onClick={() => onSubmit(note)}>Decline</button>
      </div>
    </Modal>
  );
}

function KycViewer({ sub, onClose }: { sub: KycSubmission; onClose: () => void }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => { supabase.storage.from('kyc').createSignedUrls([sub.doc_path, sub.selfie_path], 300).then(({ data }) => setUrls((data || []).map((d) => d.signedUrl || ''))); }, [sub]);
  return (
    <Modal title={`${sub.full_name} · ${sub.doc_type}`} onClose={onClose} wide>
      <div className="grid g2" style={{ gap: 12 }}>
        {[0, 1].map((i) => urls[i] ? <img key={i} src={urls[i]} alt={i ? 'Selfie' : 'Document'} className="preview-img" style={{ maxHeight: 340 }} /> : <div key={i} className="skeleton" style={{ height: 240 }} />)}
      </div>
      <dl className="kv mt"><dt>Number</dt><dd className="mono">{sub.doc_number}</dd><dt>Date of birth</dt><dd>{sub.dob || '—'}</dd><dt>Expiry</dt><dd>{sub.expiry || '—'}</dd><dt>Nationality</dt><dd>{sub.nationality || '—'}</dd></dl>
    </Modal>
  );
}

function SettleModal({ p, onClose, onDone }: { p: Payout; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState(p.amount);
  const [hash, setHash] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const { error } = p.kind === 'deposit'
      ? await supabase.rpc('admin_confirm_deposit', { p_id: p.id, p_amount: amount })
      : await supabase.rpc('admin_settle_payout', { p_id: p.id, p_approve: true, p_tx_hash: hash });
    setBusy(false);
    if (error) return toast(errText(error), 'err');
    toast(p.kind === 'deposit' ? 'Deposit credited' : 'Withdrawal marked as sent');
    onDone(); onClose();
  };
  return (
    <Modal title={p.kind === 'deposit' ? 'Confirm deposit' : 'Record withdrawal'} onClose={onClose}>
      <div className="stack" style={{ gap: 14 }}>
        {p.kind === 'deposit' ? (
          <>
            <dl className="kv"><dt>Pool address</dt><dd className="mono" style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>{p.address}</dd><dt>Network</dt><dd>{p.method_code.replace('_', ' · ')}</dd></dl>
            {p.tx_hash ? <a className="btn sm" href={EXPLORERS[p.method_code]?.(p.tx_hash)} target="_blank" rel="noreferrer"><Icon name="external" size={14} />Open transaction in explorer</a>
              : <div className="notice"><Icon name="info" size={16} />No hash submitted. Confirm only if you can see the funds on this address.</div>}
            <div className="field"><label>Amount received (USD)</label><input className="input mono" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
          </>
        ) : (
          <>
            <dl className="kv"><dt>Send</dt><dd className="mono up">{fmt(p.amount - p.fee)}</dd><dt>To</dt><dd className="mono" style={{ wordBreak: 'break-all', whiteSpace: 'normal' }}>{p.address}</dd><dt>Network</dt><dd>{p.method_code.replace('_', ' · ')}</dd></dl>
            <div className="field"><label>On-chain transaction hash</label><input className="input mono" value={hash} onChange={(e) => setHash(e.target.value.trim())} /></div>
          </>
        )}
        <button className="btn em block" disabled={busy || (p.kind === 'withdrawal' && hash.length < 16) || amount <= 0} onClick={go}>{busy && <span className="spinner" />}{p.kind === 'deposit' ? 'Credit package wallet' : 'Mark as sent'}</button>
      </div>
    </Modal>
  );
}

// ================================================================ members
function Members() {
  const { settings } = useData();
  const [rows, setRows] = useState<Member[]>([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'kyc' | 'unpaid' | 'admin'>('all');
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState<Member | null>(null);
  const PAGE = 50;

  useEffect(() => {
    const t = setTimeout(async () => {
      let query = supabase.from('members').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
      const term = q.trim().replace(/[%,()]/g, '');
      if (term) query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,code.ilike.%${term}%`);
      if (filter === 'active') query = query.gte('pv', settings.min_active);
      if (filter === 'unpaid') query = query.lt('pv', settings.min_active);
      if (filter === 'kyc') query = query.eq('kyc', 'pending');
      if (filter === 'admin') query = query.eq('role', 'admin');
      const { data, count: c } = await query;
      setRows(((data || []) as Member[]).map((m) => ({ ...m, pv: num(m.pv), lt: num(m.lt), rt: num(m.rt), lv: num(m.lv), rv: num(m.rv), wallet_free: num(m.wallet_free), wallet_package: num(m.wallet_package), cycle_earned: num(m.cycle_earned), claimable: num(m.claimable) })));
      setCount(c || 0);
    }, 250);
    return () => clearTimeout(t);
  }, [q, filter, page, settings.min_active]);
  const names = useMemo(() => new Map(rows.map((r) => [r.id, r.name])), [rows]);

  return (
    <Card title={`Members · ${count.toLocaleString()}`} hint="Search by name, email or ID. Click a row for full details."
      action={<div className="row wrap">
        <Seg size="sm" value={filter} onChange={(v) => { setFilter(v); setPage(0); }} options={[{ v: 'all', l: 'All' }, { v: 'active', l: 'Active' }, { v: 'unpaid', l: 'Unpaid' }, { v: 'kyc', l: 'KYC pending' }, { v: 'admin', l: 'Admins' }]} />
        <input className="input" style={{ width: 220, height: 34 }} placeholder="Search members…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
      </div>}>
      <div className="table-wrap">
        <table className="clickable">
          <thead><tr><th>Member</th><th>ID</th><th>Sponsor</th><th>Joined</th><th className="r">Business</th><th className="r">L · R volume</th><th className="r">Free</th><th className="r">Package</th><th>KYC</th></tr></thead>
          <tbody>{rows.map((m) => (
            <tr key={m.id} onClick={() => setOpen(m)}>
              <td><div className="row"><span className="avatar sm">{initials(m.name)}</span><div style={{ minWidth: 0 }}><div style={{ fontWeight: 560 }}>{m.name}{m.role === 'admin' && <Badge tone="gold">admin</Badge>}</div><div className="dim" style={{ fontSize: 11.5 }}>{m.email}</div></div></div></td>
              <td className="mono muted">{m.code}</td>
              <td className="muted">{m.sponsor_id ? names.get(m.sponsor_id) || '…' : '—'}</td>
              <td className="muted">{fmtDate(m.created_at)}</td>
              <td className="r mono">{fmt0(m.pv)}</td>
              <td className="r mono">{m.lt.toLocaleString()} · {m.rt.toLocaleString()}</td>
              <td className="r mono">{fmt(m.wallet_free)}</td>
              <td className="r mono">{fmt(m.wallet_package)}</td>
              <td>{m.kyc === 'verified' ? <Badge tone="ok">Verified</Badge> : m.kyc === 'pending' ? <Badge tone="gold">Pending</Badge> : m.kyc === 'rejected' ? <Badge tone="bad">Declined</Badge> : <Badge>—</Badge>}</td>
            </tr>
          ))}</tbody>
        </table>
        {!rows.length && <Empty icon="users">No members match.</Empty>}
        {count > PAGE && (
          <div className="row between" style={{ padding: '12px 20px' }}>
            <span className="muted" style={{ fontSize: 12.5 }}>{page * PAGE + 1}–{Math.min(count, page * PAGE + PAGE)} of {count}</span>
            <div className="row"><button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}><Icon name="chevronLeft" size={14} />Prev</button><button className="btn sm" disabled={(page + 1) * PAGE >= count} onClick={() => setPage(page + 1)}>Next<Icon name="chevronRight" size={14} /></button></div>
          </div>
        )}
      </div>
      {open && <MemberDetail m={open} onClose={() => setOpen(null)} />}
    </Card>
  );
}

function MemberDetail({ m, onClose }: { m: Member; onClose: () => void }) {
  const [tab, setTab] = useState<'txs' | 'orders' | 'payouts' | 'team'>('txs');
  const [txs, setTxs] = useState<Tx[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [sponsor, setSponsor] = useState<string>('—');
  const [directs, setDirects] = useState<Member[]>([]);
  useEffect(() => {
    supabase.from('txs').select('*').eq('member_id', m.id).order('created_at', { ascending: false }).limit(100).then(({ data }) => setTxs((data || []).map((t) => ({ ...t, amount: num(t.amount) })) as Tx[]));
    supabase.from('orders').select('*').eq('member_id', m.id).order('created_at', { ascending: false }).then(({ data }) => setOrders((data || []).map((o) => ({ ...o, amount: num(o.amount) })) as Order[]));
    supabase.from('payouts').select('*').eq('member_id', m.id).order('created_at', { ascending: false }).then(({ data }) => setPayouts((data || []).map((p) => ({ ...p, amount: num(p.amount), fee: num(p.fee) })) as Payout[]));
    supabase.from('members').select('*').eq('sponsor_id', m.id).then(({ data }) => setDirects((data || []) as Member[]));
    if (m.sponsor_id) supabase.from('members').select('name, code').eq('id', m.sponsor_id).single().then(({ data }) => data && setSponsor(`${data.name} · ${data.code}`));
  }, [m]);
  const earned = txs.filter((t) => ['fast_start', 'binary', 'matching', 'reward_share', 'leaderboard', 'rank_bonus', 'clawback'].includes(t.type) && t.status === 'completed').reduce((a, t) => a + t.amount, 0);
  return (
    <Drawer title={<><span className="avatar sm">{initials(m.name)}</span>{m.name}</>} onClose={onClose}>
      <div className="grid g2 drawer-grid" style={{ gap: 14 }}>
        <dl className="kv">
          <dt>Member ID</dt><dd className="mono">{m.code}</dd>
          <dt>Email</dt><dd>{m.email}</dd>
          <dt>Phone</dt><dd>{m.phone || '—'}</dd>
          <dt>Country</dt><dd>{m.country || '—'}</dd>
          <dt>Sponsor</dt><dd>{sponsor}</dd>
          <dt>Joined</dt><dd>{fmtDateTime(m.created_at)}</dd>
          <dt>KYC</dt><dd>{m.kyc}</dd>
        </dl>
        <dl className="kv">
          <dt>Business</dt><dd className="mono">{fmt(m.pv)}</dd>
          <dt>Left · right volume</dt><dd className="mono">{m.lt.toLocaleString()} · {m.rt.toLocaleString()}</dd>
          <dt>Carry L · R</dt><dd className="mono">{m.lv.toLocaleString()} · {m.rv.toLocaleString()}</dd>
          <dt>Cap used</dt><dd className="mono">{fmt(m.cycle_earned)} / {fmt(m.pv * 3)}</dd>
          <dt>Free balance</dt><dd className="mono em-text">{fmt(m.wallet_free)}</dd>
          <dt>Package wallet</dt><dd className="mono">{fmt(m.wallet_package)}</dd>
          <dt>Total earned</dt><dd className="mono">{fmt(earned)}</dd>
        </dl>
      </div>
      <div className="mt"><Seg size="sm" value={tab} onChange={setTab} options={[{ v: 'txs', l: `Ledger · ${txs.length}` }, { v: 'orders', l: `Orders · ${orders.length}` }, { v: 'payouts', l: `Payments · ${payouts.length}` }, { v: 'team', l: `Directs · ${directs.length}` }]} /></div>
      <div className="table-wrap mt" style={{ margin: '14px 0 0', maxHeight: 320, overflowY: 'auto' }}>
        <table>
          {tab === 'txs' && <><thead><tr><th>Date</th><th>Type</th><th>Details</th><th className="r">Amount</th><th>Status</th></tr></thead>
            <tbody>{txs.map((t) => <tr key={t.id}><td className="muted">{fmtDateTime(t.created_at)}</td><td>{TX_LABEL[t.type] || t.type}</td><td style={{ whiteSpace: 'normal' }}>{t.note}</td><td className={`r mono ${t.amount >= 0 ? 'up' : ''}`}>{fmt(t.amount)}</td><td>{t.status}</td></tr>)}</tbody></>}
          {tab === 'orders' && <><thead><tr><th>Date</th><th>Pack</th><th>Wallet</th><th className="r">Amount</th><th>Status</th></tr></thead>
            <tbody>{orders.map((o) => <tr key={o.id}><td className="muted">{fmtDateTime(o.created_at)}</td><td>{o.product_id}</td><td>{o.wallet}</td><td className="r mono">{fmt(o.amount)}</td><td>{o.status}</td></tr>)}</tbody></>}
          {tab === 'payouts' && <><thead><tr><th>Date</th><th>Type</th><th>Network</th><th>Address / hash</th><th className="r">Amount</th><th>Status</th></tr></thead>
            <tbody>{payouts.map((p) => <tr key={p.id}><td className="muted">{fmtDateTime(p.created_at)}</td><td>{p.kind}</td><td>{p.method_code}</td><td className="mono">{short(p.tx_hash || p.address, 6)}</td><td className="r mono">{fmt(p.amount)}</td><td>{p.status}</td></tr>)}</tbody></>}
          {tab === 'team' && <><thead><tr><th>Member</th><th>ID</th><th className="r">Business</th><th>Joined</th></tr></thead>
            <tbody>{directs.map((d) => <tr key={d.id}><td>{d.name}</td><td className="mono">{d.code}</td><td className="r mono">{fmt0(num(d.pv))}</td><td className="muted">{fmtDate(d.created_at)}</td></tr>)}</tbody></>}
        </table>
      </div>
    </Drawer>
  );
}

// ================================================================ ledger
function Ledger() {
  const [rows, setRows] = useState<(Tx & { member: { name: string; code: string } | null })[]>([]);
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(200);
  useEffect(() => {
    let query = supabase.from('txs').select('*, member:members(name, code)').order('created_at', { ascending: false }).limit(limit);
    if (type !== 'all') query = query.eq('type', type);
    if (status !== 'all') query = query.eq('status', status);
    query.then(({ data }) => setRows(((data || []) as typeof rows).map((t) => ({ ...t, amount: num(t.amount) }))));
  }, [type, status, limit]);
  const shown = rows.filter((t) => !q || `${t.member?.name} ${t.member?.code} ${t.note}`.toLowerCase().includes(q.toLowerCase()));
  const totalIn = shown.filter((t) => t.amount > 0 && t.status === 'completed').reduce((a, t) => a + t.amount, 0);
  const totalOut = shown.filter((t) => t.amount < 0 && t.status === 'completed').reduce((a, t) => a + t.amount, 0);
  const csv = () => {
    const lines = ['date,member,code,type,wallet,amount,status,details', ...shown.map((t) => [t.created_at, `"${t.member?.name || ''}"`, t.member?.code || '', t.type, t.wallet, t.amount, t.status, `"${(t.note || '').replace(/"/g, "'")}"`].join(','))];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = `aurelia-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };
  return (
    <Card title="Platform ledger" hint={`${shown.length} entries · in ${fmt(totalIn)} · out ${fmt(totalOut)}`}
      action={<div className="row wrap">
        <select className="input" style={{ width: 160, height: 34 }} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>{Object.entries(TX_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input" style={{ width: 130, height: 34 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Any status</option><option value="completed">Completed</option><option value="pending">Pending</option><option value="rejected">Rejected</option>
        </select>
        <input className="input" style={{ width: 180, height: 34 }} placeholder="Member or note…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn sm" onClick={csv} disabled={!shown.length}><Icon name="download" size={14} />CSV</button>
      </div>}>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Member</th><th>Type</th><th>Details</th><th>Wallet</th><th>Status</th><th className="r">Amount</th></tr></thead>
          <tbody>{shown.map((t) => (
            <tr key={t.id}>
              <td className="muted">{fmtDateTime(t.created_at)}</td>
              <td>{t.member?.name || '—'}<div className="dim mono" style={{ fontSize: 11 }}>{t.member?.code}</div></td>
              <td><Badge tone={t.type === 'clawback' ? 'bad' : t.amount >= 0 ? 'ok' : 'mute'}>{TX_LABEL[t.type] || t.type}</Badge></td>
              <td style={{ whiteSpace: 'normal', minWidth: 200 }}>{t.note}</td>
              <td className="muted">{t.wallet || '—'}</td>
              <td>{t.status === 'completed' ? <Badge tone="ok">Completed</Badge> : t.status === 'pending' ? <Badge tone="gold">Pending</Badge> : <Badge tone="bad">Rejected</Badge>}</td>
              <td className={`r mono ${t.amount >= 0 ? 'up' : ''}`}>{t.amount >= 0 ? '+' : ''}{fmt(t.amount)}</td>
            </tr>
          ))}</tbody>
        </table>
        {!shown.length && <Empty icon="history">No ledger entries.</Empty>}
        {rows.length >= limit && <div style={{ padding: 16, textAlign: 'center' }}><button className="btn sm" onClick={() => setLimit(limit + 200)}>Load more</button></div>}
      </div>
    </Card>
  );
}

// ================================================================ deposit addresses (rotating pool)
interface PoolAddress { id: string; method_code: string; address: string; label: string | null; active: boolean; uses: number; last_used_at: string | null; created_at: string }

function Addresses() {
  const { methods, refresh } = useData();
  const toast = useToast();
  const confirm = useConfirm();
  const [pool, setPool] = useState<PoolAddress[]>([]);
  const [edit, setEdit] = useState<Record<string, Partial<CryptoMethod>>>({});
  const [draft, setDraft] = useState<Record<string, { address: string; label: string }>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const load = useCallback(() => { supabase.from('deposit_addresses').select('*').order('created_at').then(({ data }) => setPool((data || []) as PoolAddress[])); }, []);
  useEffect(() => { load(); }, [load]);

  const saveMethod = async (m: CryptoMethod, patch = edit[m.code]) => {
    if (!patch) return;
    const { error } = await supabase.from('crypto_methods').update(patch).eq('code', m.code);
    if (error) return toast(errText(error), 'err');
    toast(`${m.asset} · ${m.network} saved`);
    setEdit((e) => { const n = { ...e }; delete n[m.code]; return n; });
    refresh(['static']);
  };
  const addAddress = async (m: CryptoMethod) => {
    const d = draft[m.code];
    if (!d?.address) return;
    if (!new RegExp(m.address_pattern).test(d.address.trim())) return toast(`That isn't a valid ${m.network} address`, 'err');
    const { error } = await supabase.from('deposit_addresses').insert({ method_code: m.code, address: d.address.trim(), label: d.label.trim() || null });
    if (error) return toast(/duplicate/.test(error.message) ? 'That address is already in the pool' : errText(error), 'err');
    toast('Address added to the rotation');
    setDraft((x) => ({ ...x, [m.code]: { address: '', label: '' } }));
    load();
  };
  const toggle = async (a: PoolAddress) => { await supabase.from('deposit_addresses').update({ active: !a.active }).eq('id', a.id); load(); };
  const remove = async (a: PoolAddress) => {
    if (!(await confirm({ title: 'Remove this address from the pool?', body: <><span className="mono">{a.address}</span><br />Past deposits keep their record. Pause it instead if funds may still arrive.</>, confirm: 'Remove', tone: 'danger' }))) return;
    await supabase.from('deposit_addresses').delete().eq('id', a.id);
    load();
  };

  const listed = methods.filter((m) => m.listed !== false);
  const hidden = methods.filter((m) => m.listed === false);

  const section = (m: CryptoMethod) => {
    const e = { ...m, ...edit[m.code] };
    const set = (p: Partial<CryptoMethod>) => setEdit((x) => ({ ...x, [m.code]: { ...x[m.code], ...p } }));
    const list = pool.filter((a) => a.method_code === m.code);
    const activeCount = list.filter((a) => a.active).length;
    const d = draft[m.code] || { address: '', label: '' };
    const next = [...list].filter((a) => a.active).sort((a, b) => (a.last_used_at || '').localeCompare(b.last_used_at || '') || a.uses - b.uses)[0];
    const live = m.listed !== false && m.deposit_enabled && activeCount > 0;
    const isOpen = open === m.code;
    return (
      <section key={m.code} className={`acc ${isOpen ? 'open' : ''}`}>
        <button className="acc-h" onClick={() => setOpen(isOpen ? null : m.code)} aria-expanded={isOpen}>
          <CoinIcon asset={m.asset} />
          <span className="acc-title"><b>{m.asset}</b><span className="muted">{m.network}</span></span>
          <span className="acc-meta hide-sm">{activeCount} address{activeCount === 1 ? '' : 'es'}</span>
          {m.listed === false ? <Badge>Hidden</Badge> : live ? <Badge tone="ok">Deposits live</Badge> : !activeCount ? <Badge tone="gold">Needs address</Badge> : <Badge>Deposits off</Badge>}
          {m.listed !== false && (m.withdraw_enabled ? <Badge tone="ok">Payouts on</Badge> : <Badge>Payouts off</Badge>)}
          <Icon name="chevronRight" size={16} />
        </button>
        {isOpen && (
          <div className="acc-body">
            <div className="row wrap" style={{ gap: 18 }}>
              <label className="switch"><input type="checkbox" checked={e.deposit_enabled} onChange={(ev) => saveMethod(m, { deposit_enabled: ev.target.checked })} /><span />Accept deposits</label>
              <label className="switch"><input type="checkbox" checked={e.withdraw_enabled} onChange={(ev) => saveMethod(m, { withdraw_enabled: ev.target.checked })} /><span />Allow payouts</label>
              <label className="switch"><input type="checkbox" checked={m.listed !== false} onChange={(ev) => saveMethod(m, { listed: ev.target.checked })} /><span />Show to members</label>
            </div>
            {e.deposit_enabled && !activeCount && <div className="notice"><Icon name="alert" size={16} />Deposits are on, but members won't see this network until you add an address below.</div>}
            <div className="grid g4" style={{ gap: 10 }}>
              <div className="field"><label>Min deposit $</label><input className="input mono" type="number" value={e.min_deposit} onChange={(ev) => set({ min_deposit: Number(ev.target.value) })} /></div>
              <div className="field"><label>Min payout $</label><input className="input mono" type="number" value={e.min_withdraw} onChange={(ev) => set({ min_withdraw: Number(ev.target.value) })} /></div>
              <div className="field"><label>Payout fee $</label><input className="input mono" type="number" step="0.1" value={e.withdraw_fee_flat} onChange={(ev) => set({ withdraw_fee_flat: Number(ev.target.value) })} /></div>
              <div className="field"><label>Payout fee %</label><input className="input mono" type="number" step="0.1" value={Math.round(e.withdraw_fee_pct * 1000) / 10} onChange={(ev) => set({ withdraw_fee_pct: Number(ev.target.value) / 100 })} /></div>
            </div>
            {edit[m.code] && <div className="row"><button className="btn sm primary" onClick={() => saveMethod(m)}>Save limits & fees</button><button className="btn sm ghost" onClick={() => setEdit((x) => { const n = { ...x }; delete n[m.code]; return n; })}>Discard</button></div>}
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Address rotation</div>
              {list.length ? (
                <div className="addr-list">
                  {list.map((a) => (
                    <div key={a.id} className={`addr ${a.active ? '' : 'paused'}`}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="row" style={{ gap: 8 }}><span className="mono addr-text" title={a.address}>{a.address}</span>{next?.id === a.id && <Badge tone="gold">Next up</Badge>}</div>
                        <div className="dim" style={{ fontSize: 11.5 }}>{a.label || 'No label'} · {a.uses} deposit{a.uses === 1 ? '' : 's'} · last {a.last_used_at ? fmtDateTime(a.last_used_at) : 'never'}</div>
                      </div>
                      <div className="row">
                        <CopyButton text={a.address} label="" />
                        <button className="btn sm" onClick={() => toggle(a)}>{a.active ? 'Pause' : 'Resume'}</button>
                        <button className="btn sm icon ghost" onClick={() => remove(a)} aria-label="Remove"><Icon name="trash" size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div className="muted" style={{ fontSize: 13 }}>No addresses yet.</div>}
            </div>
            <div className="row wrap" style={{ alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: '2 1 260px' }}><label>Add treasury address</label><input className="input mono" placeholder={m.code.includes('TRC20') ? 'T…' : m.code === 'BTC' ? 'bc1…' : m.code.includes('SOL') ? 'Solana address' : '0x…'} value={d.address} onChange={(ev) => setDraft((x) => ({ ...x, [m.code]: { ...d, address: ev.target.value } }))} /></div>
              <div className="field" style={{ flex: '1 1 140px' }}><label>Label</label><input className="input" placeholder="e.g. Hot wallet 2" value={d.label} onChange={(ev) => setDraft((x) => ({ ...x, [m.code]: { ...d, label: ev.target.value } }))} /></div>
              <button className="btn em" disabled={!d.address} onClick={() => addAddress(m)}><Icon name="plus" size={15} />Add</button>
            </div>
          </div>
        )}
      </section>
    );
  };

  return (
    <>
      <div className="notice em"><Icon name="info" size={16} /><span>Each network can hold several treasury addresses. Every new deposit gets the <b style={{ color: 'var(--text)' }}>least recently used</b> active address, reserved for 24 hours.</span></div>
      <Card title={<><span className="icon-box"><Icon name="globe" size={16} /></span>Networks</>} hint={`${listed.length} networks offered to members · tap one to manage it`}>
        <div className="acc-list">{listed.map(section)}</div>
        {hidden.length > 0 && (
          <div className="mt">
            <button className="btn sm ghost" onClick={() => setShowHidden(!showHidden)}><Icon name={showHidden ? 'chevronLeft' : 'chevronRight'} size={14} />{showHidden ? 'Hide' : 'Show'} {hidden.length} hidden network{hidden.length === 1 ? '' : 's'}</button>
            {showHidden && <div className="acc-list mt">{hidden.map(section)}</div>}
          </div>
        )}
      </Card>
    </>
  );
}

// ================================================================ coupons
function Coupons() {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<Coupon[]>([]);
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => { supabase.from('coupons').select('*').order('created_at', { ascending: false }).then(({ data }) => setList((data || []) as Coupon[])); }, []);
  useEffect(() => { load(); }, [load]);
  const update = async (c: Coupon, patch: Partial<Coupon>) => { const { error } = await supabase.from('coupons').update(patch).eq('code', c.code); if (error) toast(errText(error), 'err'); load(); };
  const remove = async (c: Coupon) => { if (await confirm({ title: `Delete coupon ${c.code}?`, body: 'Bots that already used it keep their bonus.', confirm: 'Delete', tone: 'danger' })) { await supabase.from('coupons').delete().eq('code', c.code); load(); } };
  return (
    <Card title={<><span className="icon-box em"><Icon name="gift" size={16} /></span>Bot coupons</>} hint="Coupons add bonus virtual capital to a member's paper bot when they launch it. Public coupons are listed in the launch dialog."
      action={<button className="btn primary sm" onClick={() => setCreating(true)}><Icon name="plus" size={14} />New coupon</button>}>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Code</th><th>Bonus</th><th className="r">Min capital</th><th className="r">Used</th><th>Expires</th><th>Visibility</th><th>Status</th><th className="r"></th></tr></thead>
          <tbody>{list.map((c) => (
            <tr key={c.code}>
              <td><span className="mono" style={{ fontWeight: 700, letterSpacing: '0.08em' }}>{c.code}</span><div className="dim" style={{ fontSize: 11.5 }}>{c.description || '—'}</div></td>
              <td className="mono">{c.bonus_type === 'percent' ? `${num(c.bonus_value)}%` : fmt0(num(c.bonus_value))}{c.max_bonus != null && <span className="dim"> · max {fmt0(num(c.max_bonus))}</span>}</td>
              <td className="r mono">{fmt0(num(c.min_capital))}</td>
              <td className="r mono">{c.uses}{c.max_uses != null ? ` / ${c.max_uses}` : ''}</td>
              <td className="muted">{c.expires_at ? fmtDate(c.expires_at) : 'Never'}</td>
              <td>{c.public ? <Badge tone="gold">Listed</Badge> : <Badge>Secret code</Badge>}</td>
              <td><button className={`btn sm ${c.active ? 'em' : ''}`} onClick={() => update(c, { active: !c.active })}>{c.active ? 'Active' : 'Paused'}</button></td>
              <td className="r"><button className="btn sm icon ghost" onClick={() => remove(c)} aria-label="Delete"><Icon name="trash" size={14} /></button></td>
            </tr>
          ))}</tbody>
        </table>
        {!list.length && <Empty icon="gift" title="No coupons yet">Create one to give members extra virtual capital when they launch a bot.</Empty>}
      </div>
      {creating && <CouponModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
    </Card>
  );
}

function CouponModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ code: '', description: '', bonus_type: 'percent' as 'percent' | 'fixed', bonus_value: 10, max_bonus: '', min_capital: 1000, max_uses: '', per_member: 1, public: true, expires: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!/^[A-Z0-9-]{3,24}$/.test(f.code)) return toast('Code must be 3-24 letters, numbers or dashes', 'err');
    setBusy(true);
    const { error } = await supabase.from('coupons').insert({
      code: f.code, description: f.description || null, bonus_type: f.bonus_type, bonus_value: f.bonus_value,
      max_bonus: f.max_bonus ? Number(f.max_bonus) : null, min_capital: f.min_capital, max_uses: f.max_uses ? Number(f.max_uses) : null,
      per_member: f.per_member, public: f.public, expires_at: f.expires ? new Date(f.expires + 'T23:59:59').toISOString() : null,
    });
    setBusy(false);
    if (error) return toast(/duplicate/.test(error.message) ? 'That code already exists' : errText(error), 'err');
    toast(`Coupon ${f.code} created`);
    onSaved();
  };
  return (
    <Modal title="New bot coupon" onClose={onClose} wide>
      <div className="stack" style={{ gap: 14 }}>
        <div className="grid g2" style={{ gap: 12 }}>
          <div className="field"><label>Code</label><input className="input mono code-input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24) })} placeholder="GOLD20" /></div>
          <div className="field"><label>Description <span className="dim">shown to members</span></label><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="20% extra capital for new bots" /></div>
        </div>
        <div className="field"><label>Bonus type</label><Seg value={f.bonus_type} onChange={(v) => setF({ ...f, bonus_type: v })} options={[{ v: 'percent', l: '% of capital' }, { v: 'fixed', l: 'Fixed amount' }]} /></div>
        <div className="grid g3" style={{ gap: 12 }}>
          <div className="field"><label>{f.bonus_type === 'percent' ? 'Bonus %' : 'Bonus $'}</label><input className="input mono" type="number" value={f.bonus_value} onChange={(e) => setF({ ...f, bonus_value: Number(e.target.value) })} /></div>
          <div className="field"><label>Max bonus $ <span className="dim">optional</span></label><input className="input mono" type="number" value={f.max_bonus} onChange={(e) => setF({ ...f, max_bonus: e.target.value })} /></div>
          <div className="field"><label>Min bot capital $</label><input className="input mono" type="number" value={f.min_capital} onChange={(e) => setF({ ...f, min_capital: Number(e.target.value) })} /></div>
          <div className="field"><label>Total uses <span className="dim">blank = unlimited</span></label><input className="input mono" type="number" value={f.max_uses} onChange={(e) => setF({ ...f, max_uses: e.target.value })} /></div>
          <div className="field"><label>Uses per member</label><input className="input mono" type="number" min={1} value={f.per_member} onChange={(e) => setF({ ...f, per_member: Math.max(1, Number(e.target.value)) })} /></div>
          <div className="field"><label>Expires <span className="dim">optional</span></label><input className="input" type="date" value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} /></div>
        </div>
        <label className="check"><input type="checkbox" checked={f.public} onChange={(e) => setF({ ...f, public: e.target.checked })} />List this coupon in the bot launch dialog (untick for a secret code you share yourself)</label>
        <div className="notice"><Icon name="info" size={16} />Coupons add virtual capital to paper bots only. They never credit wallets.</div>
        <button className="btn primary block" disabled={busy || !f.code} onClick={save}>{busy && <span className="spinner" />}Create coupon</button>
      </div>
    </Modal>
  );
}

// ================================================================ operations
function Ops() {
  const toast = useToast();
  const confirm = useConfirm();
  const { settings: s, refresh } = useData();
  const [closes, setCloses] = useState<{ day: string; binary_total: number; matching_total: number; reward_total: number; sales: number; closed_at: string }[]>([]);
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [editingPrefs, setEditingPrefs] = useState(false);

  const load = useCallback(() => { supabase.from('day_closes').select('*').order('day', { ascending: false }).limit(30).then(({ data }) => setCloses((data || []) as typeof closes)); }, []);
  useEffect(() => { load(); }, [load]);
  const close = async () => {
    if (!(await confirm({ title: `Close ${day}?`, body: 'Pays the tree bonus, matching and reward share for that UTC day. Each day can only be closed once. The scheduled job closes yesterday automatically at 00:05 UTC.', confirm: 'Run daily close' }))) return;
    const { data, error } = await supabase.rpc('close_day', { p_day: day });
    if (error) return toast(errText(error), 'err');
    toast(data?.skipped ? 'That day was already closed' : `Closed: tree bonus ${fmt(num(data.binary))}, matching ${fmt(num(data.matching))}`);
    load();
  };

  return (
    <div className="grid g3">
      <div className="span2">
        <Card title="Daily close · Affiliate & Network" hint="Runs automatically every day at 00:05 UTC. Run manually only to close a specific date.">
          <div className="row wrap">
            <input className="input" type="date" style={{ width: 180 }} value={day} onChange={(e) => setDay(e.target.value)} />
            <button className="btn primary" onClick={close}><Icon name="zap" size={15} />Run close</button>
          </div>
          <div className="table-wrap mt">
            <table>
              <thead><tr><th>Day</th><th className="r">Sales</th><th className="r">Tree bonus</th><th className="r">Matching</th><th className="r">Reward share</th><th>Closed at</th></tr></thead>
              <tbody>{closes.map((c) => <tr key={c.day}><td className="mono">{c.day}</td><td className="r mono">{fmt(num(c.sales))}</td><td className="r mono">{fmt(num(c.binary_total))}</td><td className="r mono">{fmt(num(c.matching_total))}</td><td className="r mono">{fmt(num(c.reward_total))}</td><td className="muted">{fmtDateTime(c.closed_at)}</td></tr>)}</tbody>
            </table>
            {!closes.length && <Empty icon="history">No days closed yet.</Empty>}
          </div>
        </Card>
        <PoolCloses />
      </div>
      <div className="stack" style={{ gap: 18 }}>
        <Card
          title={<><span className="icon-box em"><Icon name="bot" size={16} /></span>Trading Preferences</>}
          hint="Admin controls for live trading & daily performance profit sharing"
          action={<button className="btn sm primary" onClick={() => setEditingPrefs(true)}><Icon name="settings" size={14} />Preferences</button>}>
          <dl className="kv">
            <dt>Trading mode</dt><dd><Badge tone={s.bot_trading_mode === 'real' ? 'ok' : 'gold'}>{s.bot_trading_mode === 'real' ? 'Real live trading' : 'Paper sandbox'}</Badge></dd>
            <dt>Member profit share</dt><dd className="mono em-text" style={{ fontWeight: 700 }}>{s.bot_profit_share_pct ?? 80}%</dd>
            <dt>Company retention fee</dt><dd className="mono">{s.bot_company_fee_pct ?? 20}%</dd>
            <dt>Min bot capital</dt><dd className="mono">{fmt0(s.bot_min_capital ?? 50)}</dd>
            <dt>Max bot capital</dt><dd className="mono">{fmt0(s.bot_max_capital ?? 100000)}</dd>
            <dt>Daily auto-distribute</dt><dd>{(s.bot_auto_distribute ?? true) ? <Badge tone="ok">Auto 9:00 PM IST</Badge> : <Badge tone="bad">Manual only</Badge>}</dd>
            <dt>Profit destination</dt><dd className="mono">Free balance (withdrawable)</dd>
          </dl>
        </Card>

        <Card title="Plan settings" hint="Stored in the settings table">
          <dl className="kv">
            <dt>Referrer minimum pack</dt><dd className="mono">{fmt0(s.min_active)}</dd>
            <dt>Fast start</dt><dd className="mono">{s.fast_start_pct * 100}% × first {s.fast_start_count}</dd>
            <dt>Tree bonus</dt><dd className="mono">{s.binary_pct * 100}% · needs {s.qualify_directs} paid directs</dd>
            <dt>Matching</dt><dd className="mono">{s.matching_pct * 100}%</dd>
            <dt>Reward share</dt><dd className="mono">{s.leader_share_pct * 100}% · {s.leader_directs} directs</dd>
            <dt>Earnings cap</dt><dd className="mono">{s.cap_multiple}× / {s.cap_cycle_days} days</dd>
            <dt>Refund window</dt><dd className="mono">{s.refund_days} days</dd>
            <dt>Bot licence</dt><dd className="mono">{fmt0(s.bot_price)} · {s.bot_days} days · max {s.bot_max_running} running</dd>
            <dt>Leaderboard prizes</dt><dd className="mono">{s.leaderboard_prizes.map((p) => fmt0(p)).join(' / ')}</dd>
          </dl>
        </Card>
      </div>
      {editingPrefs && <TradingPrefsModal s={s} onClose={() => setEditingPrefs(false)} onSaved={() => { setEditingPrefs(false); refresh(['static']); }} />}
    </div>
  );
}

function TradingPrefsModal({ s, onClose, onSaved }: { s: Settings; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [sharePct, setSharePct] = useState(s.bot_profit_share_pct ?? 80);
  const [minCap, setMinCap] = useState(s.bot_min_capital ?? 50);
  const [mode, setMode] = useState(s.bot_trading_mode ?? 'real');
  const [autoDist, setAutoDist] = useState(s.bot_auto_distribute ?? true);
  const [busy, setBusy] = useState(false);
  const companyFee = Math.max(0, 100 - sharePct);

  const save = async () => {
    setBusy(true);
    let { error } = await supabase.rpc('admin_save_trading_preferences', {
      p_profit_share_pct: Number(sharePct),
      p_company_fee_pct: Number(companyFee),
      p_min_capital: Number(minCap),
      p_trading_mode: mode,
      p_auto_distribute: autoDist,
    });
    if (error) {
      const { error: e2 } = await supabase.from('settings').update({
        bot_profit_share_pct: Number(sharePct),
        bot_company_fee_pct: Number(companyFee),
        bot_min_capital: Number(minCap),
        bot_trading_mode: mode,
        bot_auto_distribute: autoDist,
      }).eq('id', 1);
      error = e2;
    }
    setBusy(false);
    if (error) return toast(errText(error), 'err');
    toast('Trading preferences and profit sharing terms saved');
    onSaved();
  };

  return (
    <Modal title={<><span className="icon-box em"><Icon name="settings" size={16} /></span>Trading & Profit Sharing Preferences</>} onClose={onClose} wide>
      <div className="stack" style={{ gap: 16 }}>
        <div className="field">
          <label>Trading Platform Mode</label>
          <Seg value={mode} onChange={(v) => setMode(v as 'real' | 'paper')} options={[{ v: 'real', l: 'Real Live Trading' }, { v: 'paper', l: 'Paper Simulation Sandbox' }]} />
          <span className="help">In Real mode, bots trade funded capital and distribute daily profits into member free balances.</span>
        </div>

        <div className="field">
          <div className="row between">
            <label>Member Profit Share (%)</label>
            <span className="mono em-text" style={{ fontWeight: 700, fontSize: 16 }}>{sharePct}% Member · {companyFee}% Company</span>
          </div>
          <input
            className="input mono"
            type="range"
            min={10}
            max={100}
            step={5}
            value={sharePct}
            onChange={(e) => setSharePct(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--em)' }}
          />
          <div className="row between dim mono" style={{ fontSize: 12 }}>
            <span>50% (50/50 split)</span>
            <span>70% (Conservative)</span>
            <span>80% (Standard)</span>
            <span>90% (Generous)</span>
            <span>100% (Full payout)</span>
          </div>
          <span className="help">When bots generate a profit on daily close, this percentage of gross profit is credited to the member's Free Balance. The rest ({companyFee}%) is retained by company treasury.</span>
        </div>

        <div className="grid g2" style={{ gap: 12 }}>
          <div className="field">
            <label>Minimum Bot Capital ($)</label>
            <input className="input mono" type="number" min={10} max={10000} step={10} value={minCap} onChange={(e) => setMinCap(Number(e.target.value))} />
            <span className="help">Minimum real capital a member must allocate to launch a bot.</span>
          </div>
          <div className="field">
            <label>Daily Auto-Distribution</label>
            <Seg value={autoDist ? '1' : '0'} onChange={(v) => setAutoDist(v === '1')} options={[{ v: '1', l: 'Automatic (9:00 PM IST)' }, { v: '0', l: 'Admin Manual Run' }]} />
            <span className="help">If automatic, scheduled close credits profits immediately.</span>
          </div>
        </div>

        <div className="card flat" style={{ padding: 14 }}>
          <span className="eyebrow" style={{ marginBottom: 6 }}>Example payout preview</span>
          <dl className="kv">
            <dt>On a daily profit of $1,000 across pool</dt>
            <dd className="mono"><b>${fmt0(1000 * (sharePct / 100))}</b> to members · <b>${fmt0(1000 * (companyFee / 100))}</b> to company</dd>
            <dt>Member wallet destination</dt>
            <dd className="mono">Free Balance (immediately withdrawable)</dd>
          </dl>
        </div>

        <button className="btn primary block" disabled={busy} onClick={save}>
          {busy && <span className="spinner" />}Save Preferences
        </button>
      </div>
    </Modal>
  );
}

// ================================================================ daily pool close & profit sharing (21:00 IST, automatic)
function PoolCloses() {
  const toast = useToast();
  const confirm = useConfirm();
  const { settings: s } = useData();
  const [rows, setRows] = useState<{
    day: string; bots: number; capital: number; equity: number; day_pnl: number;
    profit_shared?: number; company_fee?: number; custom_rate_pct?: number | null;
    status: 'ok' | 'error'; error: string | null; source: string; closed_at: string;
  }[]>([]);
  const [busy, setBusy] = useState(false);
  const [distBusy, setDistBusy] = useState(false);
  const istToday = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const [day, setDay] = useState(istToday);
  const [customRate, setCustomRate] = useState<string>('');
  const [sharePct, setSharePct] = useState<number>(s.bot_profit_share_pct ?? 80);

  const load = useCallback(() => {
    supabase.from('pool_closes').select('*').order('day', { ascending: false }).limit(30)
      .then(({ data }) => {
        if (!data) return;
        setRows(data.map((r) => ({
          ...r,
          capital: Number(r.capital),
          equity: Number(r.equity),
          day_pnl: Number(r.day_pnl),
          profit_shared: Number(r.profit_shared || 0),
          company_fee: Number(r.company_fee || 0),
        })) as typeof rows);
      });
  }, []);
  useEffect(() => { load(); }, [load]);

  const cutPassed = Date.now() >= Date.parse(`${istToday}T15:30:00Z`);
  const todayRow = rows.find((r) => r.day === istToday);

  // 1. Run 21:00 IST close (market strategy replay or custom rate)
  const runClose = async () => {
    setBusy(true);
    const body: Record<string, unknown> = { day, profit_share_pct: sharePct, distribute: true };
    if (customRate.trim()) body.custom_rate_pct = Number(customRate);
    const { data, error } = await supabase.functions.invoke('pool-close', { body });
    setBusy(false);
    if (error) {
      let msg = error.message;
      try { msg = (await (error as { context?: Response }).context?.json())?.error || msg; } catch { /* keep */ }
      toast(msg, 'err');
    } else {
      toast(`Closed ${data.day}: ${data.bots} bots, day P&L ${fmt(num(data.day_pnl))}. Profits distributed!`);
      load();
    }
  };

  // 2. Distribute profits directly
  const distributeProfits = async () => {
    const rateVal = customRate.trim() ? Number(customRate) : null;
    if (!(await confirm({
      title: `Distribute profits for ${day}?`,
      body: `This will calculate performance${rateVal != null ? ` at ${rateVal >= 0 ? '+' : ''}${rateVal}% override` : ' from the strategy'} and credit ${sharePct}% of net profits directly to active bot owners' Free Balances.`,
      confirm: 'Distribute profits now',
    }))) return;

    setDistBusy(true);
    const { data, error } = await supabase.rpc('admin_distribute_daily_profit', {
      p_day: day,
      p_custom_rate: rateVal,
      p_share_pct: sharePct,
    });
    setDistBusy(false);
    if (error) return toast(errText(error), 'err');
    toast(`Distributed: ${fmt(num(data?.profit_shared))} credited to ${data?.bots_paid || 0} bots (Company fee: ${fmt(num(data?.company_fee))})`);
    load();
  };

  return (
    <Card
      title={<><span className="icon-box em"><Icon name="coin" size={16} /></span>Daily Pool Performance & Profit Sharing · 9:00 PM IST</>}
      hint="Settles live trading performance on PAXG/USDT and distributes daily profits into members' Free Balance wallets.">
      <div className={`notice ${todayRow?.status === 'ok' ? '' : cutPassed ? 'bad' : ''}`} style={{ marginBottom: 14 }}>
        <Icon name={todayRow?.status === 'ok' ? 'check' : 'info'} size={16} />
        {todayRow?.status === 'ok'
          ? `Today's close ran at ${fmtDateTime(todayRow.closed_at)} (${todayRow.source}). Day P&L: ${fmt(todayRow.day_pnl)} · Member share: ${fmt(todayRow.profit_shared || 0)}.`
          : todayRow?.status === 'error'
          ? `Today's close failed: ${todayRow.error}. Re-run it below.`
          : cutPassed
          ? "Today's 9:00 PM IST close hasn't run yet. Trigger it below."
          : "Today's close runs automatically at 9:00 PM IST (15:30 UTC)."}
      </div>

      <div className="card flat" style={{ padding: 14, marginBottom: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Daily Profit Distribution Controls</div>
        <div className="row wrap" style={{ gap: 12, alignItems: 'flex-end' }}>
          <div className="field" style={{ minWidth: 150 }}>
            <label>Close Day (IST)</label>
            <input className="input" type="date" value={day} max={istToday} onChange={(e) => setDay(e.target.value)} />
          </div>
          <div className="field" style={{ minWidth: 150 }}>
            <label>Performance % Override <span className="dim">optional</span></label>
            <input className="input mono" type="number" step="0.05" placeholder="Auto strategy" value={customRate} onChange={(e) => setCustomRate(e.target.value)} />
          </div>
          <div className="field" style={{ minWidth: 140 }}>
            <label>Member Share %</label>
            <input className="input mono" type="number" min={10} max={100} value={sharePct} onChange={(e) => setSharePct(Number(e.target.value))} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary" disabled={busy} onClick={runClose}>
              {busy && <span className="spinner" />}<Icon name="zap" size={15} />Run Close & Settle
            </button>
            <button className="btn em" disabled={distBusy} onClick={distributeProfits}>
              {distBusy && <span className="spinner" />}<Icon name="coin" size={15} />Distribute Profits
            </button>
          </div>
        </div>
        <span className="help" style={{ marginTop: 8, display: 'block' }}>
          Leave "Performance % Override" blank to use the live algorithmic strategy result from Binance PAXG/USDT candles, or type a custom rate (e.g. 1.2 for +1.2%) to set today's return rate explicitly.
        </span>
      </div>

      <div className="table-wrap mt">
        <table>
          <thead>
            <tr>
              <th>IST Day</th>
              <th className="r">Active Bots</th>
              <th className="r">Pool Capital</th>
              <th className="r">Day P&L</th>
              <th className="r">Member Profit Paid</th>
              <th className="r">Company Fee</th>
              <th>Status</th>
              <th className="r">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.day}>
                <td className="mono">{r.day}</td>
                <td className="r mono">{r.bots}</td>
                <td className="r mono">{fmt(num(r.capital))}</td>
                <td className={`r mono ${num(r.day_pnl) >= 0 ? 'up' : 'down'}`}>
                  {num(r.day_pnl) >= 0 ? '+' : ''}{fmt(num(r.day_pnl))}
                  {r.custom_rate_pct != null && <span className="dim" style={{ fontSize: 11, marginLeft: 4 }}>({r.custom_rate_pct}%)</span>}
                </td>
                <td className="r mono em-text" style={{ fontWeight: 650 }}>{num(r.profit_shared) > 0 ? fmt(num(r.profit_shared)) : '—'}</td>
                <td className="r mono muted">{num(r.company_fee) > 0 ? fmt(num(r.company_fee)) : '—'}</td>
                <td>
                  {r.status === 'ok' ? (
                    <Badge tone={num(r.profit_shared) > 0 ? 'ok' : 'gold'}>
                      {num(r.profit_shared) > 0 ? 'Distributed' : 'Settled'}
                    </Badge>
                  ) : (
                    <span title={r.error || ''}><Badge tone="bad">error</Badge></span>
                  )}
                </td>
                <td className="r">
                  {num(r.day_pnl) > 0 && num(r.profit_shared) === 0 && (
                    <button className="btn xs primary" onClick={() => { setDay(r.day); distributeProfits(); }}>Pay</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty icon="history">No daily closes recorded yet.</Empty>}
      </div>
    </Card>
  );
}
