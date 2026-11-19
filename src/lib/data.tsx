import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { errText, supabase, supabaseConfigured } from './supabase';
import {
  BotRow, CryptoMethod, DEFAULT_SETTINGS, FALLBACK_PRODUCTS, KycSubmission, LeaderRow, Member, Order, Payout, PayoutMethod,
  PendingInvite, Product, RankAchievement, RankReward, Settings, TeamRow, Tx, num,
} from './types';

// ---------------------------------------------------------------- toasts
interface Toast { id: number; text: string; tone: 'ok' | 'err' }
const ToastCtx = createContext<(t: string, tone?: 'ok' | 'err') => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------------------------------------------------------------- auth
interface AuthCtx { session: Session | null; ready: boolean; recovery: boolean; clearRecovery: () => void }
const AuthContext = createContext<AuthCtx>({ session: null, ready: false, recovery: false, clearRecovery: () => {} });
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabaseConfigured);
  const [recovery, setRecovery] = useState(false);
  const toast = useToast();
  useEffect(() => {
    if (!supabaseConfigured) return;
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') { setRecovery(true); location.hash = '/reset'; }
      // Signing in from anywhere outside the app (landing, login, signup) goes straight to the dashboard
      if (event === 'SIGNED_IN' && !location.hash.startsWith('#/app') && !location.hash.startsWith('#/reset')) location.hash = '/app/dashboard';
    });

    (async () => {
      // Email links arrive as #access_token=…&refresh_token=…&type=signup|magiclink|recovery (or #error=…)
      const frag = new URLSearchParams(location.hash.replace(/^#\/?/, ''));
      if (frag.get('error_description')) {
        toast(frag.get('error_code') === 'otp_expired' ? 'That email link has expired. Request a new one.' : frag.get('error_description')!.replace(/\+/g, ' '), 'err');
        history.replaceState(null, '', location.pathname + '#/login');
      } else if (frag.get('access_token') && frag.get('refresh_token')) {
        const type = frag.get('type');
        const { error } = await supabase.auth.setSession({ access_token: frag.get('access_token')!, refresh_token: frag.get('refresh_token')! });
        if (error) toast(error.message, 'err');
        else if (type === 'recovery') { setRecovery(true); history.replaceState(null, '', location.pathname + '#/reset'); }
        else {
          history.replaceState(null, '', location.pathname + '#/app/dashboard');
          toast(type === 'signup' || type === 'magiclink' || type === 'invite' ? 'Email confirmed. Welcome to Aurelia!' : 'Signed in');
        }
        dispatchEvent(new HashChangeEvent('hashchange'));
      }
      const { data: d } = await supabase.auth.getSession();
      setSession(d.session);
      setReady(true);
    })();
    return () => data.subscription.unsubscribe();
  }, [toast]);
  return <AuthContext.Provider value={{ session, ready, recovery, clearRecovery: () => setRecovery(false) }}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------- member data
export interface Data {
  loading: boolean;
  me: Member | null;
  settings: Settings;
  products: Product[];
  methods: CryptoMethod[];
  txs: Tx[];
  orders: Order[];
  payouts: Payout[];
  payoutMethods: PayoutMethod[];
  kyc: KycSubmission | null;
  bots: BotRow[];
  team: TeamRow[];
  leaderboard: LeaderRow[];
  ranks: RankReward[];
  achievements: RankAchievement[];
  invites: PendingInvite[];
  refresh: (what?: Part[]) => Promise<void>;
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>, success?: string) => Promise<T | undefined>;
}
export type Part = 'me' | 'txs' | 'orders' | 'payouts' | 'payoutMethods' | 'kyc' | 'bots' | 'team' | 'leaderboard' | 'static' | 'ranks' | 'invites';

export const DataCtx = createContext<Data>(null as unknown as Data);
export const useData = () => useContext(DataCtx);

export function DataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const toast = useToast();
  const uid = session?.user.id;
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Member | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [products, setProducts] = useState<Product[]>(FALLBACK_PRODUCTS);
  const [methods, setMethods] = useState<CryptoMethod[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [payoutMethods, setPayoutMethods] = useState<PayoutMethod[]>([]);
  const [kyc, setKyc] = useState<KycSubmission | null>(null);
  const [bots, setBots] = useState<BotRow[]>([]);
  const [team, setTeam] = useState<TeamRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [ranks, setRanks] = useState<RankReward[]>([]);
  const [achievements, setAchievements] = useState<RankAchievement[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);

  const load = useCallback(async (parts: Part[]) => {
    if (!uid) return;
    const has = (p: Part) => parts.includes(p);
    const jobs: PromiseLike<unknown>[] = [];
    if (has('static')) {
      jobs.push(supabase.from('settings').select('*').single().then(({ data }) => data && setSettings({ ...DEFAULT_SETTINGS, ...numObj(data) })));
      jobs.push(supabase.from('products').select('*').eq('active', true).order('sort').then(({ data }) => data?.length && setProducts(data.map(numObj) as Product[])));
      jobs.push(supabase.from('crypto_methods').select('*').order('sort').then(({ data }) => data && setMethods(data.map(numObj) as CryptoMethod[])));
    }
    if (has('me')) {
      jobs.push((async () => {
        for (let i = 0; i < 5; i++) {
          const { data } = await supabase.from('members').select('*').eq('id', uid).maybeSingle();
          if (data) { setMe(numObj(data) as Member); return; }
          await new Promise((r) => setTimeout(r, 600)); // trigger may still be placing a brand-new account
        }
      })());
    }
    if (has('txs')) jobs.push(supabase.from('txs').select('*').eq('member_id', uid).order('created_at', { ascending: false }).limit(500).then(({ data }) => data && setTxs(data.map(numObj) as Tx[])));
    if (has('orders')) jobs.push(supabase.from('orders').select('*').eq('member_id', uid).order('created_at', { ascending: false }).then(({ data }) => data && setOrders(data.map(numObj) as Order[])));
    if (has('payouts')) jobs.push(supabase.from('payouts').select('*').eq('member_id', uid).order('created_at', { ascending: false }).limit(200).then(({ data }) => data && setPayouts(data.map(numObj) as Payout[])));
    if (has('payoutMethods')) jobs.push(supabase.from('payout_methods').select('*').eq('member_id', uid).order('created_at').then(({ data }) => data && setPayoutMethods(data as PayoutMethod[])));
    if (has('kyc')) jobs.push(supabase.from('kyc_submissions').select('*').eq('member_id', uid).order('created_at', { ascending: false }).limit(1).then(({ data }) => setKyc((data?.[0] as KycSubmission) || null)));
    if (has('bots')) jobs.push(supabase.from('bots').select('*').eq('member_id', uid).order('started_at', { ascending: false }).then(({ data }) => data && setBots(data.map(numObj) as BotRow[])));
    if (has('team')) jobs.push(supabase.rpc('get_team').then(({ data }) => data && setTeam((data as TeamRow[]).map(numObj) as TeamRow[])));
    if (has('leaderboard')) jobs.push(supabase.from('leaderboard').select('*').order('week_start', { ascending: false }).order('rank').limit(20).then(({ data }) => data && setLeaderboard(data.map(numObj) as LeaderRow[])));
    if (has('ranks')) {
      jobs.push(supabase.from('rank_rewards').select('*').order('track').order('sort').then(({ data }) => data && setRanks(data.map(numObj) as RankReward[])));
      jobs.push(supabase.from('rank_achievements').select('*').eq('member_id', uid).then(({ data }) => data && setAchievements(data.map(numObj) as RankAchievement[])));
    }
    if (has('invites')) jobs.push(supabase.rpc('get_pending_invites').then(({ data }) => data && setInvites(data as PendingInvite[])));
    await Promise.all(jobs);
  }, [uid]);

  const ALL: Part[] = ['static', 'me', 'txs', 'orders', 'payouts', 'payoutMethods', 'kyc', 'bots', 'team', 'leaderboard', 'ranks', 'invites'];
  useEffect(() => {
    if (!uid) { setMe(null); setLoading(true); return; }
    setLoading(true);
    load(ALL).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, load]);

  // Realtime: refetch the affected slices when the server changes our rows
  const pending = useRef(new Set<Part>());
  const timer = useRef<number>();
  useEffect(() => {
    if (!uid) return;
    const queue = (...p: Part[]) => {
      p.forEach((x) => pending.current.add(x));
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => { const parts = [...pending.current]; pending.current.clear(); load(parts); }, 250);
    };
    const ch = supabase.channel(`member-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `id=eq.${uid}` }, () => queue('me', 'team'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'txs', filter: `member_id=eq.${uid}` }, () => queue('txs', 'me'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payouts', filter: `member_id=eq.${uid}` }, () => queue('payouts', 'me'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `member_id=eq.${uid}` }, () => queue('orders'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kyc_submissions', filter: `member_id=eq.${uid}` }, () => queue('kyc', 'me'))
      .subscribe();
    const iv = window.setInterval(() => queue('team', 'leaderboard', 'invites'), 60_000);
    return () => { supabase.removeChannel(ch); clearInterval(iv); };
  }, [uid, load]);

  const refresh = useCallback(async (what?: Part[]) => { await load(what || ALL); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const rpc = useCallback(async <T,>(fn: string, args?: Record<string, unknown>, success?: string) => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) { toast(errText(error), 'err'); return undefined; }
    if (success) toast(success);
    await load(ALL);
    return (data ?? true) as T;
  }, [load, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<Data>(() => ({
    loading, me, settings, products, methods, txs, orders, payouts, payoutMethods, kyc, bots, team, leaderboard, ranks, achievements, invites, refresh, rpc,
  }), [loading, me, settings, products, methods, txs, orders, payouts, payoutMethods, kyc, bots, team, leaderboard, ranks, achievements, invites, refresh, rpc]);

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

/** Postgres numerics arrive as strings; convert number-looking fields. */
function numObj<T>(row: T): T {
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && !/(code|address|hash|phone|number|id)$/.test(k) && k !== 'id') out[k] = num(v);
    if (Array.isArray(v) && v.every((x) => typeof x === 'string' && /^-?\d+(\.\d+)?$/.test(x))) out[k] = v.map(num);
  }
  return out as T;
}

// ---------------------------------------------------------------- derived helpers
export function useTeamStats() {
  const { me, team, settings } = useData();
  return useMemo(() => {
    const members = team.filter((t) => t.depth > 0);
    const directs = members.filter((t) => t.sponsor_id === me?.id);
    const paid = directs.filter((d) => d.pv >= settings.min_active);
    const split = { L: paid.filter((d) => d.root_leg === 'L').length, R: paid.filter((d) => d.root_leg === 'R').length };
    const qualified = !!me && me.pv >= settings.min_active && paid.length >= settings.qualify_directs;
    const paidDirectsOf = (id: string) => team.filter((t) => t.sponsor_id === id && t.pv >= settings.min_active).length;
    return { members, directs, paid, split, qualified, paidDirectsOf, active: members.filter((m) => m.pv >= settings.min_active) };
  }, [me, team, settings]);
}
