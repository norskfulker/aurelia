-- Automatic daily pool close at 21:00 IST (15:30 UTC). The pool-close Edge Function replays every bot on real
-- PAXG/USDT candles and stores each bot's PAPER equity for the day. Virtual only: nothing here touches wallets.

create extension if not exists pg_net;

-- One closing row per bot per IST day; the 60 rows of a bot make up its 60-day timeline.
create table if not exists public.bot_closes (
  bot_id uuid not null references public.bots (id) on delete cascade,
  day date not null,                -- IST date whose 21:00 close this is
  day_no int not null check (day_no between 1 and 61),
  equity numeric(16,2) not null,
  day_pnl numeric(16,2) not null,
  trades int not null default 0,
  closed_at timestamptz not null default now(),
  primary key (bot_id, day)
);
alter table public.bot_closes enable row level security;
drop policy if exists "own bot closes" on public.bot_closes;
create policy "own bot closes" on public.bot_closes for select to authenticated
  using (public.is_admin() or exists (select 1 from public.bots b where b.id = bot_id and b.member_id = auth.uid()));

create table if not exists public.pool_closes (
  day date primary key,
  bots int not null default 0,
  capital numeric(16,2) not null default 0,
  equity numeric(16,2) not null default 0,
  day_pnl numeric(16,2) not null default 0,
  status text not null default 'ok' check (status in ('ok', 'error')),
  error text,
  source text not null default 'cron' check (source in ('cron', 'admin')),
  closed_at timestamptz not null default now()
);
alter table public.pool_closes enable row level security;
drop policy if exists "read pool closes" on public.pool_closes;
create policy "read pool closes" on public.pool_closes for select to authenticated using (true);
revoke insert, update, delete on public.bot_closes, public.pool_closes from anon, authenticated;

-- Shared secret so only the cron job (or a signed-in admin) can trigger the function.
create table if not exists private.cron_secret (id int primary key default 1 check (id = 1), secret text not null);
insert into private.cron_secret (secret) values (replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')) on conflict (id) do nothing;

create or replace function public.verify_cron_secret(p_secret text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from private.cron_secret where secret = p_secret);
$$;
revoke execute on function public.verify_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_cron_secret(text) to service_role;

create or replace function private.trigger_pool_close() returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  select net.http_post(
    url := 'https://kamdgidchqltcrhzteix.supabase.co/functions/v1/pool-close',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select secret from private.cron_secret where id = 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into v_id;
  return v_id;
end $$;
revoke execute on function private.trigger_pool_close() from public, anon, authenticated;

select cron.unschedule('aurelia-pool-close') where exists (select 1 from cron.job where jobname = 'aurelia-pool-close');
select cron.schedule('aurelia-pool-close', '30 15 * * *', $$select private.trigger_pool_close()$$);
