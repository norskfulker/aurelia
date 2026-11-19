-- Paper bots become 60-day licences that members can buy as many times as they like.
-- The licence fee is product revenue: it is debited from a wallet, never returned, never paid out,
-- earns no BV and triggers no commissions. Bot capital stays VIRTUAL and every running bot's
-- virtual capital is reported as one shared paper pool (bot_pool / bot_pool_members).

-- ---------------------------------------------------------------- settings
alter table public.settings add column if not exists bot_price numeric(12,2) not null default 25;
alter table public.settings add column if not exists bot_days int not null default 60;
alter table public.settings add column if not exists bot_max_running int not null default 50;

-- ---------------------------------------------------------------- bots
alter table public.bots add column if not exists expires_at timestamptz;
alter table public.bots add column if not exists licence_fee numeric(12,2) not null default 0;
alter table public.bots add column if not exists licence_wallet text check (licence_wallet in ('package', 'free'));
update public.bots set expires_at = started_at + make_interval(days => (select bot_days from public.settings where id = 1)) where expires_at is null;
alter table public.bots alter column expires_at set not null;
alter table public.bots drop constraint if exists bots_status_check;
alter table public.bots add constraint bots_status_check check (status in ('running', 'stopped', 'expired'));
create index if not exists bots_running_idx on public.bots (status, expires_at);

-- Ends every licence whose 60 days are up. Runs hourly and before each pool read.
create or replace function private.expire_bots() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.bots set status = 'expired', stopped_at = expires_at where status = 'running' and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function private.expire_bots() from public, anon, authenticated;

-- ---------------------------------------------------------------- buy a licence
drop function if exists public.create_bot(text, text, numeric, text);
create or replace function public.create_bot(p_name text, p_preset text, p_capital numeric, p_coupon text default null, p_wallet text default 'package')
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.members; s public.settings; c public.coupons; v_bonus numeric := 0; v_id uuid; v_exp timestamptz;
  v_code text := nullif(upper(trim(coalesce(p_coupon, ''))), '');
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_wallet not in ('package', 'free') then raise exception 'Invalid wallet'; end if;
  perform private.expire_bots();
  select * into s from public.settings where id = 1;
  select * into m from public.members where id = auth.uid() for update;
  if m.pv < s.min_active then raise exception 'Buy an academy pack to unlock the bot'; end if;
  if p_preset not in ('conservative', 'balanced', 'aggressive') then raise exception 'Unknown risk profile'; end if;
  if p_capital < 1000 or p_capital > 1000000 then raise exception 'Virtual capital must be between $1,000 and $1,000,000'; end if;
  if (select count(*) from public.bots where member_id = m.id and status = 'running') >= s.bot_max_running then
    raise exception 'You can run up to % bots at once', s.bot_max_running;
  end if;
  if (case when p_wallet = 'package' then m.wallet_package else m.wallet_free end) < s.bot_price then
    raise exception 'Insufficient % balance for the $% bot licence', case when p_wallet = 'package' then 'package wallet' else 'free' end, s.bot_price;
  end if;
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
  v_exp := now() + make_interval(days => s.bot_days);
  insert into public.bots (member_id, name, preset, capital, bonus_capital, coupon_code, expires_at, licence_fee, licence_wallet)
  values (m.id, left(coalesce(nullif(trim(p_name), ''), initcap(p_preset) || ' bot'), 40), p_preset, round(p_capital, 2), v_bonus, v_code, v_exp, s.bot_price, p_wallet)
  returning id into v_id;
  -- Licence fee: a plain debit. No BV, no PV, no commissions.
  if s.bot_price > 0 then
    perform private.credit(m.id, p_wallet, -s.bot_price, 'bot_licence', format('Bot licence · %s days', s.bot_days), v_id);
  end if;
  if v_code is not null then
    update public.coupons set uses = uses + 1 where code = v_code;
    insert into public.coupon_redemptions (code, member_id, bot_id, bonus) values (v_code, m.id, v_id, v_bonus);
  end if;
  return jsonb_build_object('id', v_id, 'bonus', v_bonus, 'expires_at', v_exp, 'fee', s.bot_price);
end $$;

-- ---------------------------------------------------------------- shared paper pool
-- Totals for the pool: every running bot's virtual capital, across all members.
create or replace function public.bot_pool()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  perform private.expire_bots();
  return (
    select jsonb_build_object(
      'bots', count(*),
      'members', count(distinct member_id),
      'capital', coalesce(sum(capital + bonus_capital), 0),
      'mine_bots', count(*) filter (where member_id = auth.uid()),
      'mine_capital', coalesce(sum(capital + bonus_capital) filter (where member_id = auth.uid()), 0),
      'by_preset', coalesce((select jsonb_object_agg(preset, cap) from (
        select preset, sum(capital + bonus_capital) cap from public.bots where status = 'running' group by preset) x), '{}'::jsonb)
    ) from public.bots where status = 'running'
  );
end $$;

-- Anonymous pool rows so the client can replay every bot in the pool and show pooled equity.
-- No names or member ids: preset, virtual capital and the time window only.
create or replace function public.bot_pool_rows()
returns table (preset text, capital numeric, started_at timestamptz, ends_at timestamptz, mine boolean)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  perform private.expire_bots();
  return query select b.preset, b.capital + b.bonus_capital, b.started_at, b.expires_at, b.member_id = auth.uid()
    from public.bots b where b.status = 'running' order by b.started_at desc limit 500;
end $$;

revoke execute on function public.create_bot(text, text, numeric, text, text), public.bot_pool(), public.bot_pool_rows() from public, anon;
grant execute on function public.create_bot(text, text, numeric, text, text), public.bot_pool(), public.bot_pool_rows() to authenticated;

-- ---------------------------------------------------------------- admin: licence revenue in the overview
do $$
declare d text;
begin
  select pg_get_functiondef('public.admin_overview(int)'::regprocedure) into d;
  if position('licence_revenue' in d) = 0 then
    d := replace(d,
      $r$'bonus_capital', coalesce(sum(bonus_capital), 0)) from public.bots)$r$,
      $r$'bonus_capital', coalesce(sum(bonus_capital), 0), 'capital', coalesce(sum(capital + bonus_capital) filter (where status = 'running'), 0), 'licence_revenue', coalesce(sum(licence_fee), 0)) from public.bots)$r$);
    execute d;
  end if;
end $$;

-- ---------------------------------------------------------------- hourly expiry
select cron.schedule('aurelia-expire-bots', '7 * * * *', $$select private.expire_bots()$$);
