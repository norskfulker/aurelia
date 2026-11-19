-- Aurelia: binary compensation plan on academy-pack sales.
-- All money movement happens inside SECURITY DEFINER functions; clients can only read their own rows.
-- The paper-trading bot stores configuration only — it never touches wallets.

create schema if not exists private;

-- ---------------------------------------------------------------- reference data
create table public.settings (
  id int primary key default 1 check (id = 1),
  min_active numeric(12,2) not null default 100,
  qualify_directs int not null default 3,
  binary_pct numeric(6,4) not null default 0.10,
  fast_start_pct numeric(6,4) not null default 0.10,
  fast_start_count int not null default 3,
  matching_pct numeric(6,4) not null default 0.10,
  cap_multiple numeric(6,2) not null default 3,
  cap_cycle_days int not null default 14,
  leader_directs int not null default 10,
  leader_share_pct numeric(8,5) not null default 0.001,
  refund_days int not null default 14,
  leaderboard_prizes numeric[] not null default '{300,150,75}'
);
insert into public.settings default values;

create table public.products (
  id text primary key,
  name text not null,
  price numeric(12,2) not null check (price > 0),
  bv numeric(12,2) not null check (bv >= 0),
  tagline text,
  includes text[] not null default '{}',
  sort int not null default 0,
  active boolean not null default true
);
insert into public.products (id, name, price, bv, tagline, includes, sort) values
  ('p100', 'Bullion Basics', 100, 100, 'Gold market fundamentals', '{"12-lesson gold fundamentals course","Market analytics terminal · 30 days","Paper-trading bot sandbox"}', 1),
  ('p300', 'Sovereign', 300, 300, 'Strategy & risk masterclass', '{"Everything in Bullion Basics","Strategy & risk masterclass","Price-alert suite · 90 days","Bot strategy builder"}', 2),
  ('p500', 'Reserve', 500, 500, 'Pro tools + mentorship', '{"Everything in Sovereign","2 live mentorship sessions","Macro research reports · 6 months"}', 3),
  ('p1000', 'Vault', 1000, 1000, 'The complete academy', '{"Everything in Reserve","6 mentorship sessions","Lifetime course updates","Priority support"}', 4);

create table public.crypto_methods (
  code text primary key,
  asset text not null,
  network text not null,
  deposit_address text,            -- platform treasury address, set by admin
  deposit_enabled boolean not null default false,
  withdraw_enabled boolean not null default true,
  min_deposit numeric(12,2) not null default 20,
  min_withdraw numeric(12,2) not null default 20,
  withdraw_fee_flat numeric(12,2) not null default 1,
  withdraw_fee_pct numeric(6,4) not null default 0.01,
  confirmations int not null default 12,
  eta text not null default '~5 min',
  address_pattern text not null,
  sort int not null default 0
);
insert into public.crypto_methods (code, asset, network, min_deposit, min_withdraw, withdraw_fee_flat, withdraw_fee_pct, confirmations, eta, address_pattern, sort) values
  ('USDT_TRC20', 'USDT', 'Tron (TRC20)', 20, 20, 1, 0.01, 20, '~3 min', '^T[1-9A-HJ-NP-Za-km-z]{33}$', 1),
  ('USDT_BEP20', 'USDT', 'BNB Smart Chain (BEP20)', 20, 20, 0.5, 0.01, 15, '~1 min', '^0x[0-9a-fA-F]{40}$', 2),
  ('USDT_ERC20', 'USDT', 'Ethereum (ERC20)', 50, 50, 5, 0.01, 12, '~5 min', '^0x[0-9a-fA-F]{40}$', 3),
  ('USDC_ERC20', 'USDC', 'Ethereum (ERC20)', 50, 50, 5, 0.01, 12, '~5 min', '^0x[0-9a-fA-F]{40}$', 4),
  ('USDC_SOL', 'USDC', 'Solana', 20, 20, 0.5, 0.01, 32, '~1 min', '^[1-9A-HJ-NP-Za-km-z]{32,44}$', 5),
  ('BTC', 'BTC', 'Bitcoin', 50, 50, 3, 0.01, 2, '~30 min', '^(bc1[02-9ac-hj-np-z]{11,71}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$', 6);

-- ---------------------------------------------------------------- members
create table public.members (
  id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique,
  name text not null,
  email text not null,
  country text,
  phone text,
  role text not null default 'member' check (role in ('member', 'admin')),
  kyc text not null default 'none' check (kyc in ('none', 'pending', 'verified', 'rejected')),
  sponsor_id uuid references public.members (id),
  parent_id uuid references public.members (id),
  leg char(1) check (leg in ('L', 'R')),
  left_id uuid references public.members (id),
  right_id uuid references public.members (id),
  pv numeric(14,2) not null default 0,
  lv numeric(14,2) not null default 0,
  rv numeric(14,2) not null default 0,
  lt numeric(14,2) not null default 0,
  rt numeric(14,2) not null default 0,
  cycle_start date not null default (now() at time zone 'utc')::date,
  cycle_earned numeric(14,2) not null default 0,
  fs_paid int not null default 0,
  wallet_package numeric(14,2) not null default 0 check (wallet_package >= 0),
  wallet_free numeric(14,2) not null default 0,
  claimable numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
create index on public.members (sponsor_id);
create index on public.members (parent_id);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  product_id text not null references public.products (id),
  amount numeric(12,2) not null,
  bv numeric(12,2) not null,
  wallet text not null check (wallet in ('package', 'free')),
  status text not null default 'paid' check (status in ('paid', 'refunded')),
  created_at timestamptz not null default now()
);
create index on public.orders (member_id, created_at desc);
create index on public.orders (created_at);

create table public.txs (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.members (id) on delete cascade,
  type text not null,
  wallet text check (wallet in ('package', 'free')),
  amount numeric(14,2) not null,
  note text,
  ref uuid,
  status text not null default 'completed' check (status in ('pending', 'completed', 'rejected')),
  created_at timestamptz not null default now()
);
create index on public.txs (member_id, created_at desc);
create index on public.txs (ref);

create table public.payout_methods (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  method_code text not null references public.crypto_methods (code),
  label text,
  address text not null,
  created_at timestamptz not null default now(),
  unique (member_id, method_code, address)
);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null check (kind in ('deposit', 'withdrawal')),
  method_code text not null references public.crypto_methods (code),
  amount numeric(14,2) not null check (amount > 0),
  fee numeric(14,2) not null default 0,
  address text not null,
  tx_hash text,
  status text not null default 'pending' check (status in ('pending', 'completed', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index on public.payouts (member_id, created_at desc);
create unique index payouts_deposit_hash_once on public.payouts (method_code, lower(tx_hash)) where kind = 'deposit' and status <> 'rejected';

create table public.kyc_submissions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  doc_type text not null,
  doc_number text not null,
  full_name text not null,
  dob date,
  nationality text,
  expiry date,
  doc_path text not null,
  selfie_path text not null,
  ocr_raw text,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  reviewer_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index on public.kyc_submissions (member_id, created_at desc);

create table public.bots (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  name text not null check (length(name) between 1 and 40),
  preset text not null check (preset in ('conservative', 'balanced', 'aggressive')),
  capital numeric(14,2) not null check (capital between 1000 and 1000000),
  status text not null default 'running' check (status in ('running', 'stopped')),
  started_at timestamptz not null default now(),
  stopped_at timestamptz
);
create index on public.bots (member_id);

create table public.leaderboard (
  id bigint generated always as identity primary key,
  week_start date not null,
  member_id uuid not null references public.members (id) on delete cascade,
  display_name text not null,
  rank int not null,
  sales numeric(14,2) not null,
  prize numeric(14,2) not null default 0,
  unique (week_start, member_id)
);

create table public.day_closes (
  day date primary key,
  binary_total numeric(14,2) not null default 0,
  matching_total numeric(14,2) not null default 0,
  reward_total numeric(14,2) not null default 0,
  sales numeric(14,2) not null default 0,
  closed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- helpers
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where id = auth.uid() and role = 'admin');
$$;

create or replace function private.paid_directs(p uuid) returns int
language sql stable set search_path = public as $$
  select count(*)::int from public.members
  where sponsor_id = p and pv >= (select min_active from public.settings where id = 1);
$$;

create or replace function private.credit(p_member uuid, p_wallet text, p_amount numeric, p_type text, p_note text, p_ref uuid default null, p_status text default 'completed')
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_wallet = 'package' then
    update public.members set wallet_package = wallet_package + p_amount where id = p_member;
  elsif p_wallet = 'free' then
    update public.members set wallet_free = wallet_free + p_amount where id = p_member;
  end if;
  insert into public.txs (member_id, type, wallet, amount, note, ref, status)
  values (p_member, p_type, p_wallet, round(p_amount, 2), p_note, p_ref, p_status);
end $$;

create or replace function private.pay_capped(p_member uuid, p_gross numeric, p_type text, p_note text)
returns numeric language plpgsql security definer set search_path = public as $$
declare m public.members; s public.settings; v_pay numeric;
begin
  select * into s from public.settings where id = 1;
  select * into m from public.members where id = p_member for update;
  v_pay := round(least(p_gross, greatest(0, s.cap_multiple * m.pv - m.cycle_earned)), 2);
  if v_pay > 0 then
    update public.members set cycle_earned = cycle_earned + v_pay where id = p_member;
    perform private.credit(p_member, 'free', v_pay, p_type,
      case when v_pay < p_gross then p_note || format(' · capped ($%s flushed)', round(p_gross - v_pay, 2)) else p_note end);
  end if;
  return v_pay;
end $$;

create or replace function private.add_volume(p_member uuid, p_bv numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_parent uuid; v_leg char(1);
begin
  select parent_id, leg into v_parent, v_leg from public.members where id = p_member;
  while v_parent is not null loop
    if v_leg = 'L' then
      update public.members set lv = greatest(0, lv + p_bv), lt = greatest(0, lt + p_bv) where id = v_parent;
    else
      update public.members set rv = greatest(0, rv + p_bv), rt = greatest(0, rt + p_bv) where id = v_parent;
    end if;
    select parent_id, leg into v_parent, v_leg from public.members where id = v_parent;
  end loop;
end $$;

-- ---------------------------------------------------------------- signup + placement
-- New members always attach at the bottom of the chosen leg (outer spillover), so nobody can be
-- inserted above an existing member. The very first account becomes the company root (admin).
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_root uuid; v_sponsor uuid; v_leg char(1); v_node uuid; v_next uuid; v_code text;
begin
  perform pg_advisory_xact_lock(4242);
  select id into v_root from public.members where parent_id is null order by created_at limit 1;
  if v_root is null then
    insert into public.members (id, code, name, email, role, kyc)
    values (new.id, 'AU000001', coalesce(nullif(meta->>'name', ''), 'Aurelia HQ'), new.email, 'admin', 'verified');
    return new;
  end if;

  select id into v_sponsor from public.members where code = upper(trim(meta->>'ref'));
  v_sponsor := coalesce(v_sponsor, v_root);
  v_leg := case upper(coalesce(meta->>'leg', '')) when 'L' then 'L' when 'R' then 'R' else null end;
  if v_leg is null then
    select case when lt <= rt then 'L' else 'R' end into v_leg from public.members where id = v_sponsor;
  end if;

  v_node := v_sponsor;
  loop
    select case when v_leg = 'L' then left_id else right_id end into v_next from public.members where id = v_node;
    exit when v_next is null;
    v_node := v_next;
  end loop;

  loop
    v_code := 'AU' || (100000 + floor(random() * 900000))::int::text;
    exit when not exists (select 1 from public.members where code = v_code);
  end loop;

  insert into public.members (id, code, name, email, country, phone, sponsor_id, parent_id, leg)
  values (new.id, v_code, coalesce(nullif(trim(meta->>'name'), ''), split_part(new.email, '@', 1)), new.email,
          nullif(meta->>'country', ''), nullif(meta->>'phone', ''), v_sponsor, v_node, v_leg);
  if v_leg = 'L' then update public.members set left_id = new.id where id = v_node;
  else update public.members set right_id = new.id where id = v_node; end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Lets the signup form show who the sponsor is before creating an account
create or replace function public.lookup_sponsor(p_code text)
returns table (code text, name text) language sql stable security definer set search_path = public as $$
  select code, split_part(name, ' ', 1) || coalesce(' ' || left(nullif(split_part(name, ' ', 2), ''), 1) || '.', '')
  from public.members where code = upper(trim(p_code));
$$;

-- ---------------------------------------------------------------- member actions
create or replace function public.update_profile(p_name text, p_phone text, p_country text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.members set
    name = case when kyc = 'verified' then name else coalesce(nullif(trim(p_name), ''), name) end,
    phone = nullif(trim(p_phone), ''),
    country = nullif(trim(p_country), '')
  where id = auth.uid();
end $$;

create or replace function public.purchase(p_product text, p_wallet text)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.settings; m public.members; pr public.products; sp public.members; v_order uuid; v_was boolean;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_wallet not in ('package', 'free') then raise exception 'Invalid wallet'; end if;
  perform pg_advisory_xact_lock(7);
  select * into s from public.settings where id = 1;
  select * into pr from public.products where id = p_product and active;
  if not found then raise exception 'Unknown product'; end if;
  select * into m from public.members where id = auth.uid() for update;
  if (case when p_wallet = 'package' then m.wallet_package else m.wallet_free end) < pr.price then
    raise exception 'Insufficient % balance', case when p_wallet = 'package' then 'package wallet' else 'free' end;
  end if;

  v_was := m.pv >= s.min_active;
  insert into public.orders (member_id, product_id, amount, bv, wallet) values (m.id, pr.id, pr.price, pr.bv, p_wallet) returning id into v_order;
  perform private.credit(m.id, p_wallet, -pr.price, 'purchase', pr.name || ' pack', v_order);
  update public.members set pv = pv + pr.price where id = m.id;

  if not v_was and m.pv + pr.price >= s.min_active and m.sponsor_id is not null then
    select * into sp from public.members where id = m.sponsor_id for update;
    if sp.pv >= s.min_active and sp.fs_paid < s.fast_start_count then
      update public.members set fs_paid = fs_paid + 1 where id = sp.id;
      perform private.credit(sp.id, 'free', round(pr.price * s.fast_start_pct, 2), 'fast_start',
        format('Fast start %s/%s · %s', sp.fs_paid + 1, s.fast_start_count, m.name), v_order);
    end if;
  end if;

  perform private.add_volume(m.id, pr.bv);
  return v_order;
end $$;

create or replace function public.refund_order(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.settings; o public.orders; t record;
begin
  perform pg_advisory_xact_lock(7);
  select * into s from public.settings where id = 1;
  select * into o from public.orders where id = p_order and member_id = auth.uid() for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status <> 'paid' or o.created_at < now() - make_interval(days => s.refund_days) then
    raise exception 'Refund window has closed';
  end if;
  update public.orders set status = 'refunded' where id = o.id;
  update public.members set pv = greatest(0, pv - o.amount) where id = o.member_id;
  perform private.credit(o.member_id, o.wallet, o.amount, 'refund', 'Refund · ' || (select name from public.products where id = o.product_id) || ' pack', o.id);
  perform private.add_volume(o.member_id, -o.bv);
  for t in select * from public.txs where ref = o.id and type = 'fast_start' loop
    update public.members set fs_paid = greatest(0, fs_paid - 1) where id = t.member_id;
    perform private.credit(t.member_id, 'free', -t.amount, 'clawback', 'Fast start reversed · refunded order', o.id);
  end loop;
end $$;

create or replace function public.claim_leaderboard()
returns numeric language plpgsql security definer set search_path = public as $$
declare v numeric;
begin
  select claimable into v from public.members where id = auth.uid() for update;
  if coalesce(v, 0) <= 0 then raise exception 'Nothing to claim'; end if;
  update public.members set claimable = 0 where id = auth.uid();
  perform private.credit(auth.uid(), 'free', v, 'leaderboard', 'Leaderboard reward claimed');
  return v;
end $$;

-- ---------------------------------------------------------------- deposits & withdrawals
create or replace function public.request_deposit(p_method text, p_amount numeric, p_tx_hash text)
returns uuid language plpgsql security definer set search_path = public as $$
declare cm public.crypto_methods; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into cm from public.crypto_methods where code = p_method;
  if not found or not cm.deposit_enabled or cm.deposit_address is null then raise exception 'This deposit method is not available'; end if;
  if p_amount < cm.min_deposit then raise exception 'Minimum deposit is $%', cm.min_deposit; end if;
  if length(trim(coalesce(p_tx_hash, ''))) < 16 then raise exception 'Paste the transaction hash from your wallet'; end if;
  insert into public.payouts (member_id, kind, method_code, amount, address, tx_hash)
  values (auth.uid(), 'deposit', cm.code, round(p_amount, 2), cm.deposit_address, trim(p_tx_hash)) returning id into v_id;
  insert into public.txs (member_id, type, wallet, amount, note, ref, status)
  values (auth.uid(), 'deposit', 'package', round(p_amount, 2), cm.asset || ' · ' || cm.network || ' deposit', v_id, 'pending');
  return v_id;
exception when unique_violation then
  raise exception 'This transaction hash was already submitted';
end $$;

create or replace function public.add_payout_method(p_method text, p_address text, p_label text)
returns uuid language plpgsql security definer set search_path = public as $$
declare cm public.crypto_methods; v_id uuid;
begin
  select * into cm from public.crypto_methods where code = p_method;
  if not found or not cm.withdraw_enabled then raise exception 'Payout method unavailable'; end if;
  if trim(p_address) !~ cm.address_pattern then raise exception 'That is not a valid % address', cm.network; end if;
  if (select count(*) from public.payout_methods where member_id = auth.uid()) >= 10 then raise exception 'You can save up to 10 payout addresses'; end if;
  insert into public.payout_methods (member_id, method_code, address, label)
  values (auth.uid(), cm.code, trim(p_address), nullif(trim(p_label), '')) returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'That address is already saved';
end $$;

create or replace function public.request_withdrawal(p_payout_method uuid, p_amount numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare m public.members; pm public.payout_methods; cm public.crypto_methods; v_fee numeric; v_id uuid;
begin
  perform pg_advisory_xact_lock(7);
  select * into m from public.members where id = auth.uid() for update;
  if m.kyc <> 'verified' then raise exception 'Complete KYC before withdrawing'; end if;
  select * into pm from public.payout_methods where id = p_payout_method and member_id = m.id;
  if not found then raise exception 'Choose a saved payout address'; end if;
  select * into cm from public.crypto_methods where code = pm.method_code;
  if not cm.withdraw_enabled then raise exception 'Withdrawals on % are paused', cm.network; end if;
  if p_amount < cm.min_withdraw then raise exception 'Minimum withdrawal is $%', cm.min_withdraw; end if;
  if p_amount > m.wallet_free then raise exception 'Insufficient free balance'; end if;
  v_fee := round(cm.withdraw_fee_flat + p_amount * cm.withdraw_fee_pct, 2);
  if v_fee >= p_amount then raise exception 'Amount is below the network fee'; end if;
  insert into public.payouts (member_id, kind, method_code, amount, fee, address)
  values (m.id, 'withdrawal', cm.code, round(p_amount, 2), v_fee, pm.address) returning id into v_id;
  perform private.credit(m.id, 'free', -p_amount, 'withdrawal',
    format('%s · %s to %s… · fee $%s', cm.asset, cm.network, left(pm.address, 8), v_fee), v_id, 'pending');
  return v_id;
end $$;

-- ---------------------------------------------------------------- KYC
create or replace function public.submit_kyc(p_doc_type text, p_doc_number text, p_full_name text, p_dob date,
  p_nationality text, p_expiry date, p_doc_path text, p_selfie_path text, p_ocr_raw text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_kyc text;
begin
  select kyc into v_kyc from public.members where id = auth.uid();
  if v_kyc in ('pending', 'verified') then raise exception 'KYC already %', v_kyc; end if;
  if length(trim(p_doc_number)) < 4 or length(trim(p_full_name)) < 3 then raise exception 'Check your document details'; end if;
  if p_expiry is not null and p_expiry < current_date then raise exception 'This document has expired'; end if;
  if p_dob is not null and p_dob > current_date - interval '18 years' then raise exception 'You must be 18 or older'; end if;
  if split_part(p_doc_path, '/', 1) <> auth.uid()::text or split_part(p_selfie_path, '/', 1) <> auth.uid()::text then
    raise exception 'Invalid upload';
  end if;
  insert into public.kyc_submissions (member_id, doc_type, doc_number, full_name, dob, nationality, expiry, doc_path, selfie_path, ocr_raw)
  values (auth.uid(), p_doc_type, upper(trim(p_doc_number)), trim(p_full_name), p_dob, nullif(trim(p_nationality), ''), p_expiry, p_doc_path, p_selfie_path, left(p_ocr_raw, 4000))
  returning id into v_id;
  update public.members set kyc = 'pending' where id = auth.uid();
  return v_id;
end $$;

-- ---------------------------------------------------------------- team
create or replace function public.get_team()
returns table (id uuid, code text, name text, country text, sponsor_id uuid, parent_id uuid, leg char(1),
  left_id uuid, right_id uuid, pv numeric, lt numeric, rt numeric, kyc text, created_at timestamptz, depth int, root_leg char(1))
language sql stable security definer set search_path = public as $$
  with recursive t as (
    select m.id, m.code, m.name, m.country, m.sponsor_id, m.parent_id, m.leg, m.left_id, m.right_id, m.pv, m.lt, m.rt, m.kyc, m.created_at,
           0 as depth, null::char(1) as root_leg
    from public.members m where m.id = auth.uid()
    union all
    select c.id, c.code, c.name, c.country, c.sponsor_id, c.parent_id, c.leg, c.left_id, c.right_id, c.pv, c.lt, c.rt, c.kyc, c.created_at,
           t.depth + 1, coalesce(t.root_leg, c.leg)
    from public.members c join t on c.parent_id = t.id
    where t.depth < 40
  )
  select * from t;
$$;

-- ---------------------------------------------------------------- admin
create or replace function public.admin_confirm_deposit(p_id uuid, p_amount numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare p public.payouts; v_amt numeric;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into p from public.payouts where id = p_id and kind = 'deposit' and status = 'pending' for update;
  if not found then raise exception 'Deposit not pending'; end if;
  v_amt := round(coalesce(p_amount, p.amount), 2);
  update public.payouts set status = 'completed', amount = v_amt, settled_at = now() where id = p.id;
  update public.txs set status = 'completed', amount = v_amt where ref = p.id and type = 'deposit';
  update public.members set wallet_package = wallet_package + v_amt where id = p.member_id;
end $$;

create or replace function public.admin_settle_payout(p_id uuid, p_approve boolean, p_tx_hash text default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare p public.payouts;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into p from public.payouts where id = p_id and status = 'pending' for update;
  if not found then raise exception 'Not pending'; end if;
  if p.kind = 'deposit' then
    if p_approve then perform public.admin_confirm_deposit(p_id); return; end if;
    update public.payouts set status = 'rejected', admin_note = p_note, settled_at = now() where id = p.id;
    update public.txs set status = 'rejected' where ref = p.id and type = 'deposit';
    return;
  end if;
  if p_approve then
    if length(trim(coalesce(p_tx_hash, ''))) < 16 then raise exception 'Enter the on-chain transaction hash'; end if;
    update public.payouts set status = 'completed', tx_hash = trim(p_tx_hash), admin_note = p_note, settled_at = now() where id = p.id;
    update public.txs set status = 'completed' where ref = p.id and type = 'withdrawal';
  else
    update public.payouts set status = 'rejected', admin_note = p_note, settled_at = now() where id = p.id;
    update public.txs set status = 'rejected' where ref = p.id and type = 'withdrawal';
    perform private.credit(p.member_id, 'free', p.amount, 'refund', 'Withdrawal rejected · returned to free balance', p.id);
  end if;
end $$;

create or replace function public.admin_review_kyc(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare k public.kyc_submissions;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into k from public.kyc_submissions where id = p_id and status = 'pending' for update;
  if not found then raise exception 'Not pending'; end if;
  update public.kyc_submissions set status = case when p_approve then 'verified' else 'rejected' end,
    reviewer_note = p_note, reviewed_at = now() where id = k.id;
  update public.members set kyc = case when p_approve then 'verified' else 'rejected' end,
    name = case when p_approve then k.full_name else name end where id = k.member_id;
end $$;

-- ---------------------------------------------------------------- daily close (cron closes the UTC day that just ended; admins may pass a date) (binary, matching, reward share, leaderboard, caps)
create or replace function public.close_day(p_day date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.settings; r record; v_matched numeric; v_pay numeric;
  v_bin numeric := 0; v_mat numeric := 0; v_rew numeric := 0; v_sales numeric;
  v_day date := coalesce(p_day, (now() at time zone 'utc')::date - 1); v_root uuid; v_week date;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Admins only'; end if;
  if exists (select 1 from public.day_closes where day = v_day) then return jsonb_build_object('skipped', true, 'day', v_day); end if;
  perform pg_advisory_xact_lock(7);
  select * into s from public.settings where id = 1;
  select id into v_root from public.members where parent_id is null order by created_at limit 1;

  create temp table _bin (member_id uuid primary key, amount numeric) on commit drop;
  create temp table _mat (member_id uuid primary key, amount numeric) on commit drop;

  -- 1. binary pairing on the weaker leg
  for r in
    select m.id, least(m.lv, m.rv) as matched from public.members m
    where m.pv >= s.min_active and least(m.lv, m.rv) > 0 and private.paid_directs(m.id) >= s.qualify_directs
  loop
    update public.members set lv = lv - r.matched, rv = rv - r.matched where id = r.id;
    v_pay := private.pay_capped(r.id, r.matched * s.binary_pct, 'binary', format('Binary · %s BV matched', r.matched::int));
    v_bin := v_bin + v_pay;
    if v_pay > 0 then insert into _bin values (r.id, v_pay); end if;
  end loop;

  -- 2. matching bonus on directs' binary
  for r in select b.member_id, b.amount, m.sponsor_id, m.name from _bin b join public.members m on m.id = b.member_id where m.sponsor_id is not null loop
    if (select pv from public.members where id = r.sponsor_id) < s.min_active then continue; end if;
    v_pay := private.pay_capped(r.sponsor_id, r.amount * s.matching_pct, 'matching', 'Matching · ' || r.name);
    v_mat := v_mat + v_pay;
    if v_pay > 0 then
      insert into _mat values (r.sponsor_id, v_pay) on conflict (member_id) do update set amount = _mat.amount + excluded.amount;
    end if;
  end loop;

  -- 3. reward share: sponsors with 10+ paid directs earn 0.1% of each direct's daily rewards
  for r in
    select e.member_id, sum(e.amount) as amount, m.sponsor_id, m.name
    from (select * from _bin union all select * from _mat) e join public.members m on m.id = e.member_id
    where m.sponsor_id is not null group by e.member_id, m.sponsor_id, m.name
  loop
    if private.paid_directs(r.sponsor_id) < s.leader_directs then continue; end if;
    v_pay := round(r.amount * s.leader_share_pct, 2);
    if v_pay > 0 then
      perform private.credit(r.sponsor_id, 'free', v_pay, 'reward_share', 'Reward share · ' || r.name);
      v_rew := v_rew + v_pay;
    end if;
  end loop;

  select coalesce(sum(amount), 0) into v_sales from public.orders
  where status = 'paid' and created_at >= v_day::timestamp at time zone 'utc' and created_at < (v_day + 1)::timestamp at time zone 'utc';

  -- 4. weekly leaderboard on Sundays (UTC): ranked by paid sales of direct referrals
  if extract(isodow from v_day) = 7 then
    v_week := v_day - 6;
    insert into public.leaderboard (week_start, member_id, display_name, rank, sales, prize)
    select v_week, x.sponsor_id,
           split_part(sm.name, ' ', 1) || coalesce(' ' || left(nullif(split_part(sm.name, ' ', 2), ''), 1) || '.', ''),
           x.rk, x.sales, coalesce(s.leaderboard_prizes[x.rk], 0)
    from (
      select m.sponsor_id, sum(o.amount) as sales, row_number() over (order by sum(o.amount) desc) as rk
      from public.orders o join public.members m on m.id = o.member_id
      where o.status = 'paid' and m.sponsor_id is not null and m.sponsor_id <> v_root
        and o.created_at >= v_week::timestamp at time zone 'utc' and o.created_at < (v_day + 1)::timestamp at time zone 'utc'
      group by m.sponsor_id
    ) x join public.members sm on sm.id = x.sponsor_id
    where x.rk <= 10
    on conflict do nothing;
    update public.members m set claimable = claimable + l.prize
    from public.leaderboard l where l.week_start = v_week and l.member_id = m.id and l.prize > 0;
  end if;

  -- 5. 14-day cap cycle reset
  update public.members set cycle_start = v_day + 1, cycle_earned = 0 where v_day + 1 - cycle_start >= s.cap_cycle_days;

  insert into public.day_closes (day, binary_total, matching_total, reward_total, sales) values (v_day, v_bin, v_mat, v_rew, v_sales);
  return jsonb_build_object('day', v_day, 'binary', v_bin, 'matching', v_mat, 'reward_share', v_rew, 'sales', v_sales);
end $$;

-- ---------------------------------------------------------------- row level security
alter table public.settings enable row level security;
alter table public.products enable row level security;
alter table public.crypto_methods enable row level security;
alter table public.members enable row level security;
alter table public.orders enable row level security;
alter table public.txs enable row level security;
alter table public.payout_methods enable row level security;
alter table public.payouts enable row level security;
alter table public.kyc_submissions enable row level security;
alter table public.bots enable row level security;
alter table public.leaderboard enable row level security;
alter table public.day_closes enable row level security;

create policy "settings readable" on public.settings for select using (true);
create policy "products readable" on public.products for select using (true);
create policy "methods readable" on public.crypto_methods for select to authenticated using (true);
create policy "methods admin update" on public.crypto_methods for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "own member or admin" on public.members for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "own orders" on public.orders for select to authenticated using (member_id = auth.uid() or public.is_admin());
create policy "own txs" on public.txs for select to authenticated using (member_id = auth.uid() or public.is_admin());
create policy "own payouts" on public.payouts for select to authenticated using (member_id = auth.uid() or public.is_admin());
create policy "own payout methods" on public.payout_methods for select to authenticated using (member_id = auth.uid());
create policy "delete own payout methods" on public.payout_methods for delete to authenticated using (member_id = auth.uid());
create policy "own kyc" on public.kyc_submissions for select to authenticated using (member_id = auth.uid() or public.is_admin());
create policy "own bots" on public.bots for select to authenticated using (member_id = auth.uid());
create policy "create own bots" on public.bots for insert to authenticated with check (member_id = auth.uid());
create policy "update own bots" on public.bots for update to authenticated using (member_id = auth.uid()) with check (member_id = auth.uid());
create policy "leaderboard readable" on public.leaderboard for select to authenticated using (true);
create policy "day closes admin" on public.day_closes for select to authenticated using (public.is_admin());

-- Internal helpers are never callable from the API
revoke all on schema private from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.close_day(date) from public, anon;
revoke execute on function public.admin_confirm_deposit(uuid, numeric) from public, anon;
revoke execute on function public.admin_settle_payout(uuid, boolean, text, text) from public, anon;
revoke execute on function public.admin_review_kyc(uuid, boolean, text) from public, anon;

-- ---------------------------------------------------------------- storage for KYC images (private)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kyc', 'kyc', false, 8388608, '{image/jpeg,image/png,image/webp,image/heic}')
on conflict (id) do nothing;

create policy "kyc upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'kyc' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "kyc read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'kyc' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------------------------------------------------------------- realtime
alter publication supabase_realtime add table public.members, public.txs, public.payouts, public.orders, public.kyc_submissions;

-- ---------------------------------------------------------------- schedule the daily close (00:05 UTC)
create extension if not exists pg_cron;
select cron.schedule('aurelia-close-day', '5 0 * * *', $$select public.close_day()$$);
