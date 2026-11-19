-- Rotating deposit-address pool, paper-bot coupons (virtual capital only), bot RPCs, admin analytics,
-- and "tree" wording for the volume bonus.

-- ---------------------------------------------------------------- deposit address pool (round-robin)
create table public.deposit_addresses (
  id uuid primary key default gen_random_uuid(),
  method_code text not null references public.crypto_methods (code),
  address text not null,
  label text,
  active boolean not null default true,
  uses int not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (method_code, address)
);
alter table public.deposit_addresses enable row level security;
create policy "addresses admin" on public.deposit_addresses for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.deposit_addresses (method_code, address, label)
select code, deposit_address, 'Primary' from public.crypto_methods where deposit_address is not null
on conflict do nothing;

alter table public.payouts add column if not exists expires_at timestamptz;

-- Networks members can deposit on right now (enabled + at least one active pool address)
create or replace function public.available_deposit_methods()
returns setof text language sql stable security definer set search_path = public as $$
  select cm.code from public.crypto_methods cm
  where cm.deposit_enabled and exists (select 1 from public.deposit_addresses a where a.method_code = cm.code and a.active);
$$;

-- Step 1: reserve the least-recently-used active address for this member's deposit (valid 24h)
create or replace function public.start_deposit(p_method text, p_amount numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cm public.crypto_methods; a public.deposit_addresses; v_id uuid; v_exp timestamptz := now() + interval '24 hours';
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into cm from public.crypto_methods where code = p_method;
  if not found or not cm.deposit_enabled then raise exception 'This deposit method is not available'; end if;
  if p_amount < cm.min_deposit then raise exception 'Minimum deposit is $%', cm.min_deposit; end if;
  select * into a from public.deposit_addresses
  where method_code = p_method and active
  order by last_used_at nulls first, uses, created_at
  limit 1 for update skip locked;
  if not found then raise exception 'This deposit method is not available'; end if;
  update public.deposit_addresses set uses = uses + 1, last_used_at = now() where id = a.id;
  insert into public.payouts (member_id, kind, method_code, amount, address, status, expires_at)
  values (auth.uid(), 'deposit', cm.code, round(p_amount, 2), a.address, 'pending', v_exp) returning id into v_id;
  return jsonb_build_object('id', v_id, 'address', a.address, 'expires_at', v_exp);
end $$;

-- Step 2: member submits the on-chain hash for that reserved deposit
create or replace function public.submit_deposit_hash(p_id uuid, p_tx_hash text)
returns void language plpgsql security definer set search_path = public as $$
declare p public.payouts; cm public.crypto_methods;
begin
  select * into p from public.payouts where id = p_id and member_id = auth.uid() and kind = 'deposit' for update;
  if not found or p.status <> 'pending' then raise exception 'Deposit not found'; end if;
  if p.tx_hash is not null then raise exception 'A transaction hash was already submitted for this deposit'; end if;
  if length(trim(coalesce(p_tx_hash, ''))) < 16 then raise exception 'Paste the transaction hash from your wallet'; end if;
  select * into cm from public.crypto_methods where code = p.method_code;
  update public.payouts set tx_hash = trim(p_tx_hash), expires_at = null where id = p.id;
  insert into public.txs (member_id, type, wallet, amount, note, ref, status)
  values (p.member_id, 'deposit', 'package', p.amount, cm.asset || ' · ' || cm.network || ' deposit', p.id, 'pending');
exception when unique_violation then
  raise exception 'This transaction hash was already submitted';
end $$;

-- admin_confirm_deposit: also create the ledger row if the member never submitted a hash
create or replace function public.admin_confirm_deposit(p_id uuid, p_amount numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare p public.payouts; v_amt numeric; cm public.crypto_methods;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into p from public.payouts where id = p_id and kind = 'deposit' and status = 'pending' for update;
  if not found then raise exception 'Deposit not pending'; end if;
  v_amt := round(coalesce(p_amount, p.amount), 2);
  update public.payouts set status = 'completed', amount = v_amt, settled_at = now(), expires_at = null where id = p.id;
  if exists (select 1 from public.txs where ref = p.id and type = 'deposit') then
    update public.txs set status = 'completed', amount = v_amt where ref = p.id and type = 'deposit';
  else
    select * into cm from public.crypto_methods where code = p.method_code;
    insert into public.txs (member_id, type, wallet, amount, note, ref, status)
    values (p.member_id, 'deposit', 'package', v_amt, cm.asset || ' · ' || cm.network || ' deposit', p.id, 'completed');
  end if;
  update public.members set wallet_package = wallet_package + v_amt where id = p.member_id;
end $$;

-- ---------------------------------------------------------------- paper-bot coupons (virtual capital)
create table public.coupons (
  code text primary key check (code ~ '^[A-Z0-9-]{3,24}$'),
  description text,
  bonus_type text not null check (bonus_type in ('fixed', 'percent')),
  bonus_value numeric(14,2) not null check (bonus_value > 0),
  max_bonus numeric(14,2),
  min_capital numeric(14,2) not null default 1000,
  max_uses int,
  uses int not null default 0,
  per_member int not null default 1,
  public boolean not null default true,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.coupons (code) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  bot_id uuid,
  bonus numeric(14,2) not null,
  created_at timestamptz not null default now()
);
create index on public.coupon_redemptions (member_id);
alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
create policy "public coupons visible" on public.coupons for select to authenticated
  using ((public and active and (expires_at is null or expires_at > now()) and (max_uses is null or uses < max_uses)) or public.is_admin());
create policy "coupons admin write" on public.coupons for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "own redemptions" on public.coupon_redemptions for select to authenticated using (member_id = auth.uid() or public.is_admin());

alter table public.bots add column if not exists bonus_capital numeric(14,2) not null default 0;
alter table public.bots add column if not exists coupon_code text;

-- Bots are created and stopped only through these functions now (prevents self-granted bonus capital)
drop policy if exists "create own bots" on public.bots;
drop policy if exists "update own bots" on public.bots;
drop policy if exists "own bots" on public.bots;
create policy "own bots" on public.bots for select to authenticated using (member_id = auth.uid() or public.is_admin());

create or replace function public.create_bot(p_name text, p_preset text, p_capital numeric, p_coupon text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.members; c public.coupons; v_bonus numeric := 0; v_id uuid; v_code text := nullif(upper(trim(coalesce(p_coupon, ''))), '');
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into m from public.members where id = auth.uid();
  if m.pv < (select min_active from public.settings where id = 1) then raise exception 'Buy an academy pack to unlock the bot'; end if;
  if p_preset not in ('conservative', 'balanced', 'aggressive') then raise exception 'Unknown risk profile'; end if;
  if p_capital < 1000 or p_capital > 1000000 then raise exception 'Virtual capital must be between $1,000 and $1,000,000'; end if;
  if (select count(*) from public.bots where member_id = m.id and status = 'running') >= 5 then raise exception 'You can run up to 5 bots at once'; end if;
  if v_code is not null then
    select * into c from public.coupons where code = v_code for update;
    if not found or not c.active then raise exception 'Coupon code not found'; end if;
    if c.expires_at is not null and c.expires_at <= now() then raise exception 'This coupon has expired'; end if;
    if c.max_uses is not null and c.uses >= c.max_uses then raise exception 'This coupon has been fully used'; end if;
    if p_capital < c.min_capital then raise exception 'This coupon needs at least $% virtual capital', c.min_capital; end if;
    if (select count(*) from public.coupon_redemptions where code = c.code and member_id = m.id) >= c.per_member then raise exception 'You already used this coupon'; end if;
    v_bonus := case when c.bonus_type = 'fixed' then c.bonus_value else round(p_capital * c.bonus_value / 100, 2) end;
    if c.max_bonus is not null then v_bonus := least(v_bonus, c.max_bonus); end if;
  end if;
  insert into public.bots (member_id, name, preset, capital, bonus_capital, coupon_code)
  values (m.id, left(coalesce(nullif(trim(p_name), ''), initcap(p_preset) || ' bot'), 40), p_preset, round(p_capital, 2), v_bonus, v_code)
  returning id into v_id;
  if v_code is not null then
    update public.coupons set uses = uses + 1 where code = v_code;
    insert into public.coupon_redemptions (code, member_id, bot_id, bonus) values (v_code, m.id, v_id, v_bonus);
  end if;
  return jsonb_build_object('id', v_id, 'bonus', v_bonus);
end $$;

create or replace function public.stop_bot(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.bots set status = 'stopped', stopped_at = now() where id = p_id and member_id = auth.uid() and status = 'running';
  if not found then raise exception 'Bot not found or already stopped'; end if;
end $$;

-- ---------------------------------------------------------------- "tree" wording for the volume bonus
update public.txs set note = replace(note, 'Binary · ', 'Tree bonus · ') where type = 'binary' and note like 'Binary · %';
do $$
declare d text;
begin
  select pg_get_functiondef('public.close_day(date)'::regprocedure) into d;
  d := replace(d, 'Binary · %s BV matched', 'Tree bonus · %s BV matched');
  execute d;
end $$;

-- ---------------------------------------------------------------- admin analytics
create or replace function public.admin_overview(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_min numeric; r jsonb; v_days int := greatest(7, least(coalesce(p_days, 30), 180));
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select min_active into v_min from public.settings where id = 1;
  select jsonb_build_object(
    'members', (select count(*) from public.members),
    'active', (select count(*) from public.members where pv >= v_min),
    'new_7d', (select count(*) from public.members where created_at > now() - interval '7 days'),
    'new_30d', (select count(*) from public.members where created_at > now() - interval '30 days'),
    'kyc', (select jsonb_build_object('pending', count(*) filter (where kyc = 'pending'), 'verified', count(*) filter (where kyc = 'verified'), 'rejected', count(*) filter (where kyc = 'rejected'), 'none', count(*) filter (where kyc = 'none')) from public.members),
    'sales_total', (select coalesce(sum(amount), 0) from public.orders where status = 'paid'),
    'sales_period', (select coalesce(sum(amount), 0) from public.orders where status = 'paid' and created_at > now() - make_interval(days => v_days)),
    'orders_total', (select count(*) from public.orders where status = 'paid'),
    'refunds_total', (select coalesce(sum(amount), 0) from public.orders where status = 'refunded'),
    'deposits_total', (select coalesce(sum(amount), 0) from public.payouts where kind = 'deposit' and status = 'completed'),
    'deposits_pending', (select count(*) from public.payouts where kind = 'deposit' and status = 'pending' and tx_hash is not null),
    'deposits_awaiting', (select count(*) from public.payouts where kind = 'deposit' and status = 'pending' and tx_hash is null and (expires_at is null or expires_at > now())),
    'withdrawals_total', (select coalesce(sum(amount), 0) from public.payouts where kind = 'withdrawal' and status = 'completed'),
    'withdrawals_fees', (select coalesce(sum(fee), 0) from public.payouts where kind = 'withdrawal' and status = 'completed'),
    'withdrawals_pending', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(amount), 0)) from public.payouts where kind = 'withdrawal' and status = 'pending'),
    'liabilities', (select jsonb_build_object('free', coalesce(sum(wallet_free), 0), 'package', coalesce(sum(wallet_package), 0), 'claimable', coalesce(sum(claimable), 0)) from public.members),
    'commissions', (select coalesce(jsonb_object_agg(type, total), '{}') from (
        select type, sum(amount) total from public.txs
        where status = 'completed' and type in ('fast_start', 'binary', 'matching', 'reward_share', 'leaderboard', 'rank_bonus', 'clawback') group by type) x),
    'products', (select coalesce(jsonb_agg(x order by x.sort), '[]') from (
        select p.name, p.sort, count(o.id) as orders, coalesce(sum(o.amount), 0) as revenue
        from public.products p left join public.orders o on o.product_id = p.id and o.status = 'paid' group by p.name, p.sort) x),
    'daily', (select jsonb_agg(jsonb_build_object(
        'day', d::date,
        'signups', (select count(*) from public.members m where m.created_at >= d and m.created_at < d + interval '1 day'),
        'sales', (select coalesce(sum(amount), 0) from public.orders o where o.status = 'paid' and o.created_at >= d and o.created_at < d + interval '1 day'),
        'deposits', (select coalesce(sum(amount), 0) from public.payouts p where p.kind = 'deposit' and p.status = 'completed' and p.settled_at >= d and p.settled_at < d + interval '1 day'),
        'withdrawals', (select coalesce(sum(amount), 0) from public.payouts p where p.kind = 'withdrawal' and p.status = 'completed' and p.settled_at >= d and p.settled_at < d + interval '1 day'),
        'commissions', (select coalesce(sum(amount), 0) from public.txs t where t.status = 'completed' and t.type in ('fast_start', 'binary', 'matching', 'reward_share', 'leaderboard', 'rank_bonus', 'clawback') and t.created_at >= d and t.created_at < d + interval '1 day')
      ) order by d)
      from generate_series((now() at time zone 'utc')::date - (v_days - 1), (now() at time zone 'utc')::date, interval '1 day') d),
    'top_sponsors', (select coalesce(jsonb_agg(x), '[]') from (
        select m.name, m.code, count(d.id) as directs, count(d.id) filter (where d.pv >= v_min) as paid, coalesce(sum(d.pv), 0) as volume
        from public.members m join public.members d on d.sponsor_id = m.id
        group by m.id order by volume desc, directs desc limit 8) x),
    'countries', (select coalesce(jsonb_agg(x), '[]') from (
        select coalesce(country, 'Unknown') as country, count(*) as members from public.members group by 1 order by 2 desc limit 8) x),
    'methods', (select coalesce(jsonb_agg(x), '[]') from (
        select p.method_code, count(*) filter (where p.kind = 'deposit' and p.status = 'completed') as deposits,
               coalesce(sum(p.amount) filter (where p.kind = 'deposit' and p.status = 'completed'), 0) as deposit_volume,
               coalesce(sum(p.amount) filter (where p.kind = 'withdrawal' and p.status = 'completed'), 0) as withdrawal_volume
        from public.payouts p group by p.method_code order by deposit_volume desc) x),
    'bots', (select jsonb_build_object('running', count(*) filter (where status = 'running'), 'total', count(*), 'bonus_capital', coalesce(sum(bonus_capital), 0)) from public.bots),
    'coupons', (select jsonb_build_object('active', count(*) filter (where active), 'redemptions', (select count(*) from public.coupon_redemptions)) from public.coupons),
    'last_close', (select to_jsonb(dc) from public.day_closes dc order by day desc limit 1)
  ) into r;
  return r;
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.available_deposit_methods(), public.start_deposit(text, numeric), public.submit_deposit_hash(uuid, text),
  public.create_bot(text, text, numeric, text), public.stop_bot(uuid), public.admin_overview(int), public.admin_confirm_deposit(uuid, numeric) from public, anon;
grant execute on function public.available_deposit_methods(), public.start_deposit(text, numeric), public.submit_deposit_hash(uuid, text),
  public.create_bot(text, text, numeric, text), public.stop_bot(uuid), public.admin_overview(int), public.admin_confirm_deposit(uuid, numeric) to authenticated;
