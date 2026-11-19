-- Supported networks: USDT and USDC on TRC20, BEP20 and ERC20, plus native SOL.
-- Methods that aren't offered are hidden (listed = false) rather than deleted, so their history and pool addresses survive.
alter table public.crypto_methods add column if not exists listed boolean not null default true;

insert into public.crypto_methods (code, asset, network, min_deposit, min_withdraw, withdraw_fee_flat, withdraw_fee_pct, confirmations, eta, address_pattern, sort) values
  ('USDC_TRC20', 'USDC', 'Tron (TRC20)', 20, 20, 1, 0.01, 20, '~3 min', '^T[1-9A-HJ-NP-Za-km-z]{33}$', 4),
  ('USDC_BEP20', 'USDC', 'BNB Smart Chain (BEP20)', 20, 20, 0.5, 0.01, 15, '~1 min', '^0x[0-9a-fA-F]{40}$', 5),
  ('SOL', 'SOL', 'Solana', 20, 20, 0.5, 0.01, 32, '~1 min', '^[1-9A-HJ-NP-Za-km-z]{32,44}$', 7)
on conflict (code) do nothing;

update public.crypto_methods set sort = 1 where code = 'USDT_TRC20';
update public.crypto_methods set sort = 2 where code = 'USDT_BEP20';
update public.crypto_methods set sort = 3 where code = 'USDT_ERC20';
update public.crypto_methods set sort = 6 where code = 'USDC_ERC20';
update public.crypto_methods set listed = false, deposit_enabled = false, withdraw_enabled = false, sort = 90 where code in ('USDC_SOL', 'BTC');

create or replace function public.available_deposit_methods()
returns setof text language sql stable security definer set search_path = public as $$
  select cm.code from public.crypto_methods cm
  where cm.listed and cm.deposit_enabled and exists (select 1 from public.deposit_addresses a where a.method_code = cm.code and a.active)
  order by cm.sort;
$$;

-- Guard member-facing flows against hidden networks
create or replace function private.assert_listed(p_code text) returns void language plpgsql as $$
begin
  if not exists (select 1 from public.crypto_methods where code = p_code and listed) then raise exception 'This network is not supported'; end if;
end $$;

do $$
declare d text; f text;
begin
  foreach f in array array['public.start_deposit(text, numeric)', 'public.add_payout_method(text, text, text)'] loop
    select pg_get_functiondef(f::regprocedure) into d;
    d := regexp_replace(d, 'begin\n', E'begin\n  perform private.assert_listed(p_method);\n', '');
    execute d;
  end loop;
end $$;

revoke execute on all functions in schema private from public, anon, authenticated;
