// DEV-ONLY design preview (#/preview/<page>): renders the signed-in app with sample data so layouts can be
// reviewed without an account. Never bundled into production routes (guarded by import.meta.env.DEV in App).
import { ReactNode, useMemo } from 'react';
import { Data, DataCtx, useToast } from './data';
import { CryptoMethod, DEFAULT_SETTINGS, FALLBACK_PRODUCTS, Member, RankReward, TeamRow, Tx } from './types';

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60000).toISOString();

export const RANKS_FALLBACK: RankReward[] = [
  { id: 'b1', track: 'business', name: 'Bronze', target: 1000, bonus: 25, sort: 1 },
  { id: 'b2', track: 'business', name: 'Silver', target: 5000, bonus: 100, sort: 2 },
  { id: 'b3', track: 'business', name: 'Gold', target: 15000, bonus: 300, sort: 3 },
  { id: 'b4', track: 'business', name: 'Platinum', target: 50000, bonus: 1000, sort: 4 },
  { id: 'b5', track: 'business', name: 'Diamond', target: 150000, bonus: 3000, sort: 5 },
  { id: 'b6', track: 'business', name: 'Crown', target: 500000, bonus: 10000, sort: 6 },
  { id: 'r1', track: 'recruitment', name: 'Connector', target: 3, bonus: 15, sort: 1 },
  { id: 'r2', track: 'recruitment', name: 'Builder', target: 5, bonus: 40, sort: 2 },
  { id: 'r3', track: 'recruitment', name: 'Leader', target: 10, bonus: 100, sort: 3 },
  { id: 'r4', track: 'recruitment', name: 'Mentor', target: 20, bonus: 250, sort: 4 },
  { id: 'r5', track: 'recruitment', name: 'Ambassador', target: 35, bonus: 600, sort: 5 },
  { id: 'r6', track: 'recruitment', name: 'Legend', target: 50, bonus: 1200, sort: 6 },
];

const ME: Member = {
  id: 'me', code: 'K7Q2M9XA', name: 'Jordan Reyes', email: 'jordan@example.com', country: 'United Arab Emirates', phone: '+971 50 123 4567',
  role: 'admin', kyc: 'pending', sponsor_id: 'root', parent_id: 'root', leg: 'L', left_id: 't1', right_id: 't2',
  pv: 300, lv: 1200, rv: 800, lt: 3400, rt: 2600, cycle_start: new Date(now - 5 * 86400000).toISOString().slice(0, 10), cycle_earned: 145,
  fs_paid: 3, wallet_package: 200, wallet_free: 312.5, claimable: 0, created_at: iso(60 * 24 * 12),
};

const t = (id: string, name: string, parent: string, leg: 'L' | 'R', pv: number, depth: number, root_leg: 'L' | 'R', sponsor = 'me', left: string | null = null, right: string | null = null, lt = 0, rt = 0): TeamRow =>
  ({ id, code: id.toUpperCase().padEnd(8, 'X'), name, country: 'India', sponsor_id: sponsor, parent_id: parent, leg, left_id: left, right_id: right, pv, lt, rt, kyc: 'none', created_at: iso(depth * 900), depth, root_leg });

const TEAM: TeamRow[] = [
  { ...ME, depth: 0, root_leg: null } as unknown as TeamRow,
  t('t1', 'Ava Okafor', 'me', 'L', 500, 1, 'L', 'me', 't3', 't4', 1100, 900),
  t('t2', 'Liam Chen', 'me', 'R', 300, 1, 'R', 'me', 't5', null, 600, 0),
  t('t3', 'Mia Patel', 't1', 'L', 100, 2, 'L', 'me', 't6', null, 300, 0),
  t('t4', 'Omar Haddad', 't1', 'R', 300, 2, 'L', 't1'),
  t('t5', 'Zara Novak', 't2', 'L', 0, 2, 'R', 'me'),
  t('t6', 'Kai Silva', 't3', 'L', 300, 3, 'L', 't3'),
];

const TXS: Tx[] = [
  { id: 1, member_id: 'me', type: 'binary', wallet: 'free', amount: 80, note: 'Binary · 800 BV matched', ref: null, status: 'completed', created_at: iso(60) },
  { id: 2, member_id: 'me', type: 'fast_start', wallet: 'free', amount: 30, note: 'Fast start 3/3 · Liam Chen', ref: null, status: 'completed', created_at: iso(900) },
  { id: 3, member_id: 'me', type: 'purchase', wallet: 'package', amount: -300, note: 'Sovereign pack', ref: null, status: 'completed', created_at: iso(2000) },
  { id: 4, member_id: 'me', type: 'deposit', wallet: 'package', amount: 500, note: 'USDT · Tron (TRC20) deposit', ref: null, status: 'completed', created_at: iso(2100) },
];

const m = (code: string, asset: string, network: string, sort: number, pattern: string, listed = true, dep = true): CryptoMethod => ({
  code, asset, network, deposit_address: null, deposit_enabled: dep, withdraw_enabled: listed, min_deposit: 20, min_withdraw: 20, withdraw_fee_flat: 1,
  withdraw_fee_pct: 0.01, confirmations: 20, eta: '~3 min', address_pattern: pattern, sort, listed,
});
const METHODS: CryptoMethod[] = [
  m('USDT_TRC20', 'USDT', 'Tron (TRC20)', 1, '^T.+'), m('USDT_BEP20', 'USDT', 'BNB Smart Chain (BEP20)', 2, '^0x.+'), m('USDT_ERC20', 'USDT', 'Ethereum (ERC20)', 3, '^0x.+', true, false),
  m('USDC_TRC20', 'USDC', 'Tron (TRC20)', 4, '^T.+'), m('USDC_BEP20', 'USDC', 'BNB Smart Chain (BEP20)', 5, '^0x.+'), m('USDC_ERC20', 'USDC', 'Ethereum (ERC20)', 6, '^0x.+'),
  m('SOL', 'SOL', 'Solana', 7, '^.+'), m('BTC', 'BTC', 'Bitcoin', 90, '^.+', false, false),
];

const BOTS: Data['bots'] = [{
  id: 'preview-bot', member_id: 'me', name: 'Balanced bot', preset: 'balanced', capital: 1000, bonus_capital: 0, coupon_code: null,
  status: 'running', started_at: iso(12 * 1440), stopped_at: null, expires_at: iso(-48 * 1440), licence_fee: 25, licence_wallet: 'package',
  wallet_source: 'package', initial_capital: 1000, total_profit_earned: 142.50, capital_returned: 0,
}];

export function PreviewData({ children }: { children: ReactNode }) {
  const toast = useToast();
  const value = useMemo<Data>(() => ({
    loading: false, me: ME, settings: DEFAULT_SETTINGS, products: FALLBACK_PRODUCTS, methods: METHODS, txs: TXS, orders: [], payouts: [],
    payoutMethods: [], kyc: null, bots: BOTS, team: TEAM, leaderboard: [], ranks: RANKS_FALLBACK,
    achievements: [{ member_id: 'me', reward_id: 'r1', bonus: 15, achieved_at: iso(3000) }],
    invites: [{ email: 'sam@example.com', name: 'Sam Lee', parent_code: 'T2XXXXXX', leg: 'R', invited_at: iso(30) }],
    refresh: async () => {},
    rpc: async () => { toast('Preview mode: nothing was saved', 'err'); return undefined; },
  }), [toast]);
  return (
    <DataCtx.Provider value={value}>
      <div className="preview-ribbon">Design preview · sample data</div>
      {children}
    </DataCtx.Provider>
  );
}
