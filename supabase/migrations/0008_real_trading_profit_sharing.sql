-- ----------------------------------------------------------------
-- 0008_real_trading_profit_sharing.sql
-- Transition Aurelia from paper trading to REAL trading:
-- 1. Real capital allocation from package or free wallet.
-- 2. Principal returned to free balance upon bot stop or expiration.
-- 3. Admin preferences for profit sharing (member share %, company fee %, min capital, auto-distribute).
-- 4. Daily performance profit distribution to members' free balance.
-- ----------------------------------------------------------------

-- 1. Admin Preferences & Settings for Trading
alter table public.settings add column if not exists bot_trading_mode text not null default 'real';
alter table public.settings add column if not exists bot_profit_share_pct numeric(5,2) not null default 80.00;
alter table public.settings add column if not exists bot_company_fee_pct numeric(5,2) not null default 20.00;
alter table public.settings add column if not exists bot_min_capital numeric(12,2) not null default 50.00;
alter table public.settings add column if not exists bot_max_capital numeric(12,2) not null default 100000.00;
alter table public.settings add column if not exists bot_auto_distribute boolean not null default true;
alter table public.settings add column if not exists bot_profit_destination text not null default 'free';

-- Allow admin to update settings
drop policy if exists "settings admin update" on public.settings;
create policy "settings admin update" on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 2. Bot table enhancements for real capital and profit accounting
alter table public.bots add column if not exists wallet_source text check (wallet_source in ('package', 'free')) default 'package';
alter table public.bots add column if not exists initial_capital numeric(14,2) not null default 0;
alter table public.bots add column if not exists total_profit_earned numeric(14,2) not null default 0;
alter table public.bots add column if not exists capital_returned numeric(14,2) not null default 0;

-- Backfill initial_capital
update public.bots set initial_capital = capital where initial_capital = 0;

-- 3. Daily closing & profit sharing columns
alter table public.bot_closes add column if not exists profit_shared numeric(14,2) not null default 0;
alter table public.bot_closes add column if not exists company_fee numeric(14,2) not null default 0;
alter table public.bot_closes add column if not exists distributed boolean not null default false;

alter table public.pool_closes add column if not exists profit_shared numeric(14,2) not null default 0;
alter table public.pool_closes add column if not exists company_fee numeric(14,2) not null default 0;
alter table public.pool_closes add column if not exists custom_rate_pct numeric(6,3);
alter table public.pool_closes add column if not exists payout_status text not null default 'settled';

-- 4. Hourly expiry returns principal to member wallet
create or replace function private.expire_bots() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id, member_id, name, capital, capital_returned
    from public.bots
    where status = 'running' and expires_at <= now()
    for update
  loop
    update public.bots
    set status = 'expired', stopped_at = expires_at, capital_returned = r.capital
    where id = r.id;

    -- Return principal to member's free balance wallet if real capital
    if r.capital > 0 and r.capital_returned = 0 then
      perform private.credit(
        r.member_id,
        'free',
        r.capital,
        'bot_capital_return',
        format('Principal returned from expired bot · %s', r.name),
        r.id
      );
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- 5. Real capital bot launch: debits real funds from member's chosen wallet
drop function if exists public.create_bot(text, text, numeric, text, text);
drop function if exists public.create_bot(text, text, numeric, text);
create or replace function public.create_bot(
  p_name text,
  p_preset text,
  p_capital numeric,
  p_coupon text default null,
  p_wallet text default 'package'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.members;
  s public.settings;
  c public.coupons;
  v_bonus numeric := 0;
  v_id uuid;
  v_exp timestamptz;
  v_code text := nullif(upper(trim(coalesce(p_coupon, ''))), '');
  v_cap numeric := round(p_capital, 2);
  v_total_required numeric;
  v_wallet_bal numeric;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_wallet not in ('package', 'free') then raise exception 'Invalid wallet'; end if;

  perform private.expire_bots();
  select * into s from public.settings where id = 1;
  select * into m from public.members where id = auth.uid() for update;

  if m.pv < s.min_active then raise exception 'Buy an academy pack to unlock the trading bot'; end if;
  if p_preset not in ('conservative', 'balanced', 'aggressive') then raise exception 'Unknown risk profile'; end if;
  if v_cap < s.bot_min_capital or v_cap > s.bot_max_capital then
    raise exception 'Trading capital must be between $% and $%', s.bot_min_capital, s.bot_max_capital;
  end if;

  if (select count(*) from public.bots where member_id = m.id and status = 'running') >= s.bot_max_running then
    raise exception 'You can run up to % bots at once', s.bot_max_running;
  end if;

  v_total_required := v_cap + s.bot_price;
  v_wallet_bal := case when p_wallet = 'package' then m.wallet_package else m.wallet_free end;

  if v_wallet_bal < v_total_required then
    raise exception 'Insufficient % balance. Total required: $% ($% capital + $% licence fee)',
      case when p_wallet = 'package' then 'package wallet' else 'free' end,
      v_total_required, v_cap, s.bot_price;
  end if;

  -- Coupon validation for bonus capital if provided
  if v_code is not null then
    select * into c from public.coupons where code = v_code for update;
    if not found or not c.active then raise exception 'Coupon code not found'; end if;
    if c.expires_at is not null and c.expires_at <= now() then raise exception 'This coupon has expired'; end if;
    if c.max_uses is not null and c.uses >= c.max_uses then raise exception 'This coupon has been fully used'; end if;
    if v_cap < c.min_capital then raise exception 'This coupon needs at least $% trading capital', c.min_capital; end if;
    if (select count(*) from public.coupon_redemptions where code = c.code and member_id = m.id) >= c.per_member then
      raise exception 'You already used this coupon';
    end if;
    v_bonus := case when c.bonus_type = 'fixed' then c.bonus_value else round(v_cap * c.bonus_value / 100, 2) end;
    if c.max_bonus is not null then v_bonus := least(v_bonus, c.max_bonus); end if;
  end if;

  v_exp := now() + make_interval(days => s.bot_days);

  -- Insert bot record
  insert into public.bots (
    member_id, name, preset, capital, bonus_capital, coupon_code,
    expires_at, licence_fee, licence_wallet, wallet_source, initial_capital
  )
  values (
    m.id,
    left(coalesce(nullif(trim(p_name), ''), initcap(p_preset) || ' bot'), 40),
    p_preset,
    v_cap,
    v_bonus,
    v_code,
    v_exp,
    s.bot_price,
    p_wallet,
    p_wallet,
    v_cap
  )
  returning id into v_id;

  -- 1. Debit real trading capital from member's wallet
  perform private.credit(
    m.id,
    p_wallet,
    -v_cap,
    'bot_capital',
    format('Capital allocated to gold bot · %s', left(coalesce(nullif(trim(p_name), ''), initcap(p_preset) || ' bot'), 40)),
    v_id
  );

  -- 2. Debit licence fee if configured (> 0)
  if s.bot_price > 0 then
    perform private.credit(
      m.id,
      p_wallet,
      -s.bot_price,
      'bot_licence',
      format('Bot licence fee · %s days', s.bot_days),
      v_id
    );
  end if;

  if v_code is not null then
    update public.coupons set uses = uses + 1 where code = v_code;
    insert into public.coupon_redemptions (code, member_id, bot_id, bonus) values (v_code, m.id, v_id, v_bonus);
  end if;

  return jsonb_build_object(
    'id', v_id,
    'capital', v_cap,
    'bonus', v_bonus,
    'expires_at', v_exp,
    'fee', s.bot_price
  );
end $$;

-- 6. Stop bot: stops real trading and returns the principal back to the user's free balance wallet
drop function if exists public.stop_bot(uuid);
create or replace function public.stop_bot(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b public.bots;
  v_refund numeric := 0;
begin
  select * into b from public.bots where id = p_id and member_id = auth.uid() and status = 'running' for update;
  if not found then raise exception 'Bot not found or already stopped'; end if;

  v_refund := b.capital;

  update public.bots
  set status = 'stopped', stopped_at = now(), capital_returned = v_refund
  where id = b.id;

  if v_refund > 0 then
    perform private.credit(
      b.member_id,
      'free',
      v_refund,
      'bot_capital_return',
      format('Principal returned from stopped bot · %s', b.name),
      b.id
    );
  end if;

  return jsonb_build_object('id', b.id, 'refunded', v_refund);
end $$;

-- 7. Procedure to distribute daily profits to members as per admin profit-sharing preferences
create or replace function public.admin_distribute_daily_profit(
  p_day date,
  p_custom_rate numeric default null,
  p_share_pct numeric default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.settings;
  r record;
  v_share_pct numeric;
  v_day_pnl numeric;
  v_member_share numeric;
  v_company_fee numeric;
  v_total_profit numeric := 0;
  v_total_shared numeric := 0;
  v_total_fees numeric := 0;
  v_bots_count int := 0;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Admins only';
  end if;

  select * into s from public.settings where id = 1;
  v_share_pct := coalesce(p_share_pct, s.bot_profit_share_pct);

  -- For each bot that closed on that day
  for r in
    select bc.bot_id, bc.day, bc.day_no, bc.day_pnl, bc.equity, bc.distributed,
           b.member_id, b.name, b.capital, b.bonus_capital, b.preset
    from public.bot_closes bc
    join public.bots b on b.id = bc.bot_id
    where bc.day = p_day and bc.distributed = false
    for update of bc
  loop
    -- Calculate profit for this bot
    if p_custom_rate is not null then
      v_day_pnl := round((r.capital + r.bonus_capital) * (p_custom_rate / 100), 2);
    else
      v_day_pnl := r.day_pnl;
    end if;

    if v_day_pnl > 0 then
      v_member_share := round(v_day_pnl * (v_share_pct / 100), 2);
      v_company_fee := round(v_day_pnl - v_member_share, 2);

      -- Credit member's free balance wallet
      perform private.credit(
        r.member_id,
        'free',
        v_member_share,
        'bot_profit',
        format('Daily trading profit share (%s%% of +$%s) · %s (Day %s)', v_share_pct, v_day_pnl, r.name, r.day_no),
        r.bot_id
      );

      -- Update cumulative bot profit
      update public.bots
      set total_profit_earned = total_profit_earned + v_member_share
      where id = r.bot_id;

      v_total_profit := v_total_profit + v_day_pnl;
      v_total_shared := v_total_shared + v_member_share;
      v_total_fees := v_total_fees + v_company_fee;
      v_bots_count := v_bots_count + 1;
    else
      v_member_share := 0;
      v_company_fee := 0;
    end if;

    -- Mark this bot day close as distributed
    update public.bot_closes
    set profit_shared = v_member_share, company_fee = v_company_fee, distributed = true
    where bot_id = r.bot_id and day = p_day;
  end loop;

  -- Update pool_closes record
  update public.pool_closes
  set profit_shared = v_total_shared,
      company_fee = v_total_fees,
      custom_rate_pct = p_custom_rate,
      payout_status = 'settled'
  where day = p_day;

  return jsonb_build_object(
    'day', p_day,
    'bots_paid', v_bots_count,
    'total_profit', v_total_profit,
    'profit_shared', v_total_shared,
    'company_fee', v_total_fees,
    'share_pct', v_share_pct
  );
end $$;

-- 8. Admin RPC to save trading and profit-sharing preferences
create or replace function public.admin_save_trading_preferences(
  p_profit_share_pct numeric,
  p_company_fee_pct numeric,
  p_min_capital numeric,
  p_trading_mode text,
  p_auto_distribute boolean
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_profit_share_pct < 0 or p_profit_share_pct > 100 then raise exception 'Invalid profit share percentage'; end if;
  if p_min_capital < 1 then raise exception 'Minimum capital must be at least $1'; end if;

  update public.settings
  set bot_profit_share_pct = round(p_profit_share_pct, 2),
      bot_company_fee_pct = round(coalesce(p_company_fee_pct, 100 - p_profit_share_pct), 2),
      bot_min_capital = round(p_min_capital, 2),
      bot_trading_mode = coalesce(p_trading_mode, 'real'),
      bot_auto_distribute = coalesce(p_auto_distribute, true)
  where id = 1;
end $$;

revoke execute on function public.create_bot(text, text, numeric, text, text), public.stop_bot(uuid) from public, anon;
grant execute on function public.create_bot(text, text, numeric, text, text), public.stop_bot(uuid) to authenticated;
grant execute on function public.admin_distribute_daily_profit(date, numeric, numeric), public.admin_save_trading_preferences(numeric, numeric, numeric, text, boolean) to authenticated;
