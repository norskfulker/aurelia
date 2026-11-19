export type Leg = 'L' | 'R';
export type WalletKind = 'package' | 'free';
export type KycStatus = 'none' | 'pending' | 'verified' | 'rejected';

export interface Settings {
  min_active: number; qualify_directs: number; binary_pct: number; fast_start_pct: number; fast_start_count: number;
  matching_pct: number; cap_multiple: number; cap_cycle_days: number; leader_directs: number; leader_share_pct: number;
  refund_days: number; leaderboard_prizes: number[]; bot_price: number; bot_days: number; bot_max_running: number;
  bot_trading_mode: 'real' | 'paper'; bot_profit_share_pct: number; bot_company_fee_pct: number;
  bot_min_capital: number; bot_max_capital: number; bot_auto_distribute: boolean; bot_profit_destination: 'free' | 'compound';
}

export const DEFAULT_SETTINGS: Settings = {
  min_active: 100, qualify_directs: 3, binary_pct: 0.1, fast_start_pct: 0.1, fast_start_count: 3, matching_pct: 0.1,
  cap_multiple: 3, cap_cycle_days: 14, leader_directs: 10, leader_share_pct: 0.001, refund_days: 14, leaderboard_prizes: [300, 150, 75],
  bot_price: 25, bot_days: 60, bot_max_running: 50,
  bot_trading_mode: 'real', bot_profit_share_pct: 80, bot_company_fee_pct: 20,
  bot_min_capital: 50, bot_max_capital: 100000, bot_auto_distribute: true, bot_profit_destination: 'free',
};

export interface Member {
  id: string; code: string; name: string; email: string; country: string | null; phone: string | null;
  role: 'member' | 'admin'; kyc: KycStatus; sponsor_id: string | null; parent_id: string | null; leg: Leg | null;
  left_id: string | null; right_id: string | null; pv: number; lv: number; rv: number; lt: number; rt: number;
  cycle_start: string; cycle_earned: number; fs_paid: number; wallet_package: number; wallet_free: number; claimable: number; created_at: string;
}

export interface TeamRow {
  id: string; code: string; name: string; country: string | null; sponsor_id: string | null; parent_id: string | null; leg: Leg | null;
  left_id: string | null; right_id: string | null; pv: number; lt: number; rt: number; kyc: KycStatus; created_at: string; depth: number; root_leg: Leg | null;
}

export interface Product { id: string; name: string; price: number; bv: number; tagline: string; includes: string[]; sort: number }

export interface Order { id: string; member_id: string; product_id: string; amount: number; bv: number; wallet: WalletKind; status: 'paid' | 'refunded'; created_at: string }

export interface Tx { id: number; member_id: string; type: string; wallet: WalletKind | null; amount: number; note: string; ref: string | null; status: 'pending' | 'completed' | 'rejected'; created_at: string }

export interface CryptoMethod {
  code: string; asset: string; network: string; deposit_address: string | null; deposit_enabled: boolean; withdraw_enabled: boolean;
  min_deposit: number; min_withdraw: number; withdraw_fee_flat: number; withdraw_fee_pct: number; confirmations: number; eta: string; address_pattern: string; sort: number; listed?: boolean;
}

export interface PayoutMethod { id: string; member_id: string; method_code: string; label: string | null; address: string; created_at: string }

export interface Payout {
  id: string; member_id: string; kind: 'deposit' | 'withdrawal'; method_code: string; amount: number; fee: number; address: string;
  tx_hash: string | null; status: 'pending' | 'completed' | 'rejected'; admin_note: string | null; created_at: string; settled_at: string | null;
}

export interface KycSubmission {
  id: string; member_id: string; doc_type: string; doc_number: string; full_name: string; dob: string | null; nationality: string | null;
  expiry: string | null; doc_path: string; selfie_path: string; status: 'pending' | 'verified' | 'rejected'; reviewer_note: string | null; created_at: string;
}

export interface BotRow {
  id: string; member_id: string; name: string; preset: 'conservative' | 'balanced' | 'aggressive';
  capital: number; bonus_capital: number; coupon_code: string | null; status: 'running' | 'stopped' | 'expired';
  started_at: string; stopped_at: string | null; expires_at: string; licence_fee: number; licence_wallet: 'package' | 'free' | null;
  wallet_source?: 'package' | 'free'; initial_capital?: number; total_profit_earned?: number; capital_returned?: number;
}
export interface BotClose {
  bot_id: string; day: string; day_no: number; equity: number; day_pnl: number;
  trades: number; closed_at: string; profit_shared?: number; company_fee?: number; distributed?: boolean;
}
export interface PoolClose {
  day: string; bots: number; capital: number; equity: number; day_pnl: number;
  profit_shared?: number; company_fee?: number; custom_rate_pct?: number | null;
  status: 'ok' | 'error'; error: string | null; source: string; closed_at: string; payout_status?: string;
}
export interface Coupon { code: string; description: string | null; bonus_type: 'fixed' | 'percent'; bonus_value: number; max_bonus: number | null; min_capital: number; max_uses: number | null; uses: number; per_member: number; public: boolean; active: boolean; expires_at: string | null; created_at: string }
export const botEnd = (b: { stopped_at: string | null; expires_at: string }) => b.stopped_at ?? (new Date(b.expires_at).getTime() <= Date.now() ? b.expires_at : null);
export const botDaysLeft = (b: { expires_at: string }) => Math.max(0, Math.ceil((new Date(b.expires_at).getTime() - Date.now()) / 86400000));
export interface PoolRow { preset: 'conservative' | 'balanced' | 'aggressive'; capital: number; started_at: string; ends_at: string; mine: boolean }
export interface PoolTotals { bots: number; members: number; capital: number; mine_bots: number; mine_capital: number; by_preset: Partial<Record<'conservative' | 'balanced' | 'aggressive', number>> }
export const botCapital = (b: { capital: number; bonus_capital?: number | null }) => Number(b.capital) + Number(b.bonus_capital || 0);

export interface RankReward { id: string; track: 'business' | 'recruitment'; name: string; target: number; bonus: number; sort: number }
export interface RankAchievement { member_id: string; reward_id: string; bonus: number; achieved_at: string }
export interface PendingInvite { email: string; name: string; parent_code: string; leg: string; invited_at: string }

export interface LeaderRow { week_start: string; member_id: string; display_name: string; rank: number; sales: number; prize: number }

// ---------- helpers ----------
export const num = (v: unknown) => Number(v ?? 0);
export const fmt = (n: number) =>
  (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmt0 = (n: number) => fmt(n).replace(/\.00$/, '');
export const short = (a: string, n = 6) => (a.length > n * 2 + 2 ? `${a.slice(0, n)}…${a.slice(-n + 1)}` : a);
export const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
export const isActive = (m: { pv: number } | null | undefined, s: Settings) => !!m && num(m.pv) >= s.min_active;
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function cycleDaysLeft(m: Member, s: Settings) {
  const start = new Date(m.cycle_start + 'T00:00:00Z').getTime();
  return Math.max(0, s.cap_cycle_days - Math.floor((Date.now() - start) / 86400000));
}

export const EXPLORERS: Record<string, (h: string) => string> = {
  USDT_TRC20: (h) => `https://tronscan.org/#/transaction/${h}`,
  USDT_BEP20: (h) => `https://bscscan.com/tx/${h}`,
  USDT_ERC20: (h) => `https://etherscan.io/tx/${h}`,
  USDC_ERC20: (h) => `https://etherscan.io/tx/${h}`,
  USDC_SOL: (h) => `https://solscan.io/tx/${h}`,
  USDC_TRC20: (h) => `https://tronscan.org/#/transaction/${h}`,
  USDC_BEP20: (h) => `https://bscscan.com/tx/${h}`,
  SOL: (h) => `https://solscan.io/tx/${h}`,
  BTC: (h) => `https://mempool.space/tx/${h}`,
};

export const FALLBACK_PRODUCTS: Product[] = [
  { id: 'p100', name: 'Bullion Basics', price: 100, bv: 100, tagline: 'Gold market fundamentals', includes: ['12-lesson gold fundamentals course', 'Market analytics terminal · 30 days', 'Live gold trading bot access'], sort: 1 },
  { id: 'p300', name: 'Sovereign', price: 300, bv: 300, tagline: 'Strategy & risk masterclass', includes: ['Everything in Bullion Basics', 'Strategy & risk masterclass', 'Price-alert suite · 90 days', 'Automated strategy trading bot'], sort: 2 },
  { id: 'p500', name: 'Reserve', price: 500, bv: 500, tagline: 'Pro tools + mentorship', includes: ['Everything in Sovereign', '2 live mentorship sessions', 'Macro research reports · 6 months'], sort: 3 },
  { id: 'p1000', name: 'Vault', price: 1000, bv: 1000, tagline: 'The complete academy', includes: ['Everything in Reserve', '6 mentorship sessions', 'Lifetime course updates', 'Priority support'], sort: 4 },
];
