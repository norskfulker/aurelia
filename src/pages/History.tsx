import { useState } from 'react';
import { useData } from '../lib/data';
import { fmt, fmtDateTime } from '../lib/types';
import { Badge, Card, Empty, Seg } from '../ui/kit';

const LABEL: Record<string, string> = {
  deposit: 'Deposit', purchase: 'Pack purchase', bot_licence: 'Bot licence', bot_capital: 'Trading capital', bot_profit: 'Trading profit', bot_capital_return: 'Capital return',
  fast_start: 'Fast start', binary: 'Tree bonus', matching: 'Matching', reward_share: 'Reward share', leaderboard: 'Leaderboard', rank_bonus: 'Rank bonus',
  withdrawal: 'Withdrawal', refund: 'Refund', clawback: 'Clawback',
};
const GROUPS: Record<string, string[] | null> = {
  all: null,
  commissions: ['fast_start', 'binary', 'matching', 'reward_share', 'leaderboard', 'rank_bonus', 'clawback', 'bot_profit'],
  wallet: ['deposit', 'withdrawal', 'refund', 'bot_capital_return'],
  purchases: ['purchase', 'bot_licence', 'bot_capital'],
};

export default function History() {
  const { txs, loading } = useData();
  const [g, setG] = useState('all');
  const [wallet, setWallet] = useState<'any' | 'package' | 'free'>('any');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(50);
  const rows = txs
    .filter((t) => !GROUPS[g] || GROUPS[g]!.includes(t.type))
    .filter((t) => wallet === 'any' || t.wallet === wallet)
    .filter((t) => !q || (t.note + LABEL[t.type]).toLowerCase().includes(q.toLowerCase()));
  const valid = rows.filter((t) => t.status === 'completed');
  const inflow = valid.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
  const outflow = valid.filter((t) => t.amount < 0).reduce((a, t) => a + t.amount, 0);

  const exportCsv = () => {
    const csv = ['date,type,wallet,amount,status,details', ...rows.map((t) => [t.created_at, LABEL[t.type] || t.type, t.wallet, t.amount, t.status, `"${(t.note || '').replace(/"/g, "'")}"`].join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `aurelia-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="page">
      <div className="grid g3">
        <div className="card stat"><div className="label">Entries</div><div className="value">{rows.length}</div></div>
        <div className="card stat"><div className="label">Money in</div><div className="value up">{fmt(inflow)}</div></div>
        <div className="card stat"><div className="label">Money out</div><div className="value down">{fmt(outflow)}</div></div>
      </div>
      <Card title="Transaction history" hint="Updates in real time" action={<div className="row wrap">
        <Seg size="sm" value={g} onChange={(v) => { setG(v); setLimit(50); }} options={[{ v: 'all', l: 'All' }, { v: 'commissions', l: 'Commissions' }, { v: 'wallet', l: 'Deposits & payouts' }, { v: 'purchases', l: 'Purchases' }]} />
        <select className="input" style={{ width: 150, height: 34 }} value={wallet} onChange={(e) => setWallet(e.target.value as typeof wallet)}>
          <option value="any">Any wallet</option><option value="package">Package wallet</option><option value="free">Free balance</option>
        </select>
        <input className="input" style={{ width: 170, height: 34 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn sm" onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
      </div>}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Type</th><th>Details</th><th>Wallet</th><th>Status</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {loading && [0, 1, 2, 3].map((i) => <tr key={i}><td colSpan={6}><div className="skeleton" style={{ height: 18 }} /></td></tr>)}
              {rows.slice(0, limit).map((t) => (
                <tr key={t.id}>
                  <td className="muted">{fmtDateTime(t.created_at)}</td>
                  <td><Badge tone={t.type === 'clawback' ? 'bad' : t.amount >= 0 ? 'ok' : 'mute'}>{LABEL[t.type] || t.type}</Badge></td>
                  <td style={{ whiteSpace: 'normal', minWidth: 220 }}>{t.note}</td>
                  <td className="muted">{t.wallet === 'package' ? 'Package' : t.wallet === 'free' ? 'Free' : '—'}</td>
                  <td>{t.status === 'pending' ? <Badge tone="gold">Pending</Badge> : t.status === 'rejected' ? <Badge tone="bad">Rejected</Badge> : <Badge tone="ok">Completed</Badge>}</td>
                  <td className={`r mono ${t.amount >= 0 ? 'up' : ''}`} style={t.status === 'rejected' ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>{t.amount >= 0 ? '+' : ''}{fmt(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !rows.length && <Empty icon="history" title="Nothing here yet">Deposits, purchases and commissions will appear here as they happen.</Empty>}
          {rows.length > limit && <div style={{ padding: 16, textAlign: 'center' }}><button className="btn sm" onClick={() => setLimit(limit + 50)}>Load more</button></div>}
        </div>
      </Card>
    </div>
  );
}
