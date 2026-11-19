-- 8-character referral codes, placement only after email confirmation (with sponsor-chosen open slots),
-- pending-invite listing, and one-time rank achievement bonuses.

-- ---------------------------------------------------------------- referral codes
create or replace function private.new_code() returns text language plpgsql as $$
declare abc text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text;
begin
  loop
    c := '';
    for i in 1..8 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
    exit when c ~ '[A-Z]' and c ~ '[0-9]' and not exists (select 1 from public.members where code = c);
  end loop;
  return c;
end $$;

update public.members set code = private.new_code() where code !~ '^[A-Z0-9]{8}$';

-- ---------------------------------------------------------------- placement on confirmation
create or replace function private.place_member(u auth.users) returns void
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(u.raw_user_meta_data, '{}'::jsonb);
  v_root uuid; v_sponsor uuid; v_leg char(1); v_node uuid; v_next uuid; v_parent uuid; v_walk uuid; v_ok boolean := false;
begin
  perform pg_advisory_xact_lock(4242);
  if exists (select 1 from public.members where id = u.id) then return; end if;
  select id into v_root from public.members where parent_id is null order by created_at limit 1;
  if v_root is null then
    insert into public.members (id, code, name, email, country, phone, role, kyc)
    values (u.id, private.new_code(), coalesce(nullif(trim(meta->>'name'), ''), 'Aurelia HQ'), u.email,
            nullif(meta->>'country', ''), nullif(meta->>'phone', ''), 'admin', 'verified');
    return;
  end if;

  select id into v_sponsor from public.members where code = upper(trim(meta->>'ref'));
  v_sponsor := coalesce(v_sponsor, v_root);
  v_leg := case upper(coalesce(meta->>'leg', '')) when 'L' then 'L' when 'R' then 'R' else null end;

  -- Sponsor-chosen slot: parent must be the sponsor or inside the sponsor's own downline
  if v_leg is not null and nullif(meta->>'parent', '') is not null then
    select id into v_parent from public.members where code = upper(trim(meta->>'parent'));
    v_walk := v_parent;
    while v_walk is not null loop
      if v_walk = v_sponsor then v_ok := true; exit; end if;
      select parent_id into v_walk from public.members where id = v_walk;
    end loop;
  end if;

  if v_leg is null then
    select case when lt <= rt then 'L' else 'R' end into v_leg from public.members where id = v_sponsor;
  end if;

  -- Start from the chosen parent (or the sponsor) and drop to the lowest open slot on that side
  v_node := case when v_ok then v_parent else v_sponsor end;
  loop
    select case when v_leg = 'L' then left_id else right_id end into v_next from public.members where id = v_node;
    exit when v_next is null;
    v_node := v_next;
  end loop;

  insert into public.members (id, code, name, email, country, phone, sponsor_id, parent_id, leg)
  values (u.id, private.new_code(), coalesce(nullif(trim(meta->>'name'), ''), split_part(u.email, '@', 1)), u.email,
          nullif(meta->>'country', ''), nullif(meta->>'phone', ''), v_sponsor, v_node, v_leg);
  if v_leg = 'L' then update public.members set left_id = u.id where id = v_node;
  else update public.members set right_id = u.id where id = v_node; end if;
end $$;

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null then perform private.place_member(new); end if;
  return new;
end $$;

create or replace function private.handle_user_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform private.place_member(new);
  return new;
end $$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function private.handle_user_confirmed();

-- Invites the caller sent that are still waiting for email confirmation
create or replace function public.get_pending_invites()
returns table (email text, name text, parent_code text, leg text, invited_at timestamptz)
language sql stable security definer set search_path = public as $$
  select u.email::text, coalesce(u.raw_user_meta_data->>'name', ''), upper(coalesce(u.raw_user_meta_data->>'parent', '')),
         upper(coalesce(u.raw_user_meta_data->>'leg', '')), u.created_at
  from auth.users u
  where u.email_confirmed_at is null
    and upper(u.raw_user_meta_data->>'ref') = (select code from public.members where id = auth.uid())
    and u.created_at > now() - interval '30 days'
  order by u.created_at desc;
$$;

-- ---------------------------------------------------------------- ranks
create table public.rank_rewards (
  id text primary key,
  track text not null check (track in ('business', 'recruitment')),
  name text not null,
  target numeric(14,2) not null,
  bonus numeric(14,2) not null,
  sort int not null
);
insert into public.rank_rewards (id, track, name, target, bonus, sort) values
  ('b1', 'business', 'Bronze',   1000,    25,  1),
  ('b2', 'business', 'Silver',   5000,    100, 2),
  ('b3', 'business', 'Gold',     15000,   300, 3),
  ('b4', 'business', 'Platinum', 50000,   1000, 4),
  ('b5', 'business', 'Diamond',  150000,  3000, 5),
  ('b6', 'business', 'Crown',    500000,  10000, 6),
  ('r1', 'recruitment', 'Connector',  3,  15,  1),
  ('r2', 'recruitment', 'Builder',    5,  40,  2),
  ('r3', 'recruitment', 'Leader',     10, 100, 3),
  ('r4', 'recruitment', 'Mentor',     20, 250, 4),
  ('r5', 'recruitment', 'Ambassador', 35, 600, 5),
  ('r6', 'recruitment', 'Legend',     50, 1200, 6);

create table public.rank_achievements (
  member_id uuid not null references public.members (id) on delete cascade,
  reward_id text not null references public.rank_rewards (id),
  bonus numeric(14,2) not null,
  achieved_at timestamptz not null default now(),
  primary key (member_id, reward_id)
);

alter table public.rank_rewards enable row level security;
alter table public.rank_achievements enable row level security;
create policy "ranks readable" on public.rank_rewards for select using (true);
create policy "own achievements" on public.rank_achievements for select to authenticated using (member_id = auth.uid() or public.is_admin());

-- Business = lifetime BV on the weaker team; recruitment = paid direct referrals. Each rank pays its bonus once.
create or replace function public.claim_rank_rewards()
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.members; v_weak numeric; v_directs int; r record; v_total numeric := 0; v_names text[] := '{}';
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  perform pg_advisory_xact_lock(7);
  select * into m from public.members where id = auth.uid() for update;
  if m.pv < (select min_active from public.settings where id = 1) then raise exception 'Buy an academy pack to unlock rank bonuses'; end if;
  v_weak := least(m.lt, m.rt);
  v_directs := private.paid_directs(m.id);
  for r in
    select * from public.rank_rewards rr
    where ((rr.track = 'business' and v_weak >= rr.target) or (rr.track = 'recruitment' and v_directs >= rr.target))
      and not exists (select 1 from public.rank_achievements a where a.member_id = m.id and a.reward_id = rr.id)
    order by rr.track, rr.sort
  loop
    insert into public.rank_achievements (member_id, reward_id, bonus) values (m.id, r.id, r.bonus);
    perform private.credit(m.id, 'free', r.bonus, 'rank_bonus', format('%s rank bonus · %s', r.name, case when r.track = 'business' then 'business target' else 'recruitment target' end));
    v_total := v_total + r.bonus;
    v_names := v_names || r.name;
  end loop;
  if v_total = 0 then raise exception 'No new ranks to claim yet'; end if;
  return jsonb_build_object('total', v_total, 'ranks', v_names);
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.get_pending_invites() from public, anon;
revoke execute on function public.claim_rank_rewards() from public, anon;
grant execute on function public.get_pending_invites(), public.claim_rank_rewards() to authenticated;

-- Legacy AU###### codes (already 8 characters) are converted explicitly
update public.members set code = private.new_code() where code ~ '^AU[0-9]{6}$';
