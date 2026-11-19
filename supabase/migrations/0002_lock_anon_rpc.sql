-- Member and admin RPCs are callable only by signed-in users (lookup_sponsor stays public for the signup form).
revoke execute on function public.add_payout_method(text, text, text) from public, anon;
revoke execute on function public.claim_leaderboard() from public, anon;
revoke execute on function public.get_team() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.purchase(text, text) from public, anon;
revoke execute on function public.refund_order(uuid) from public, anon;
revoke execute on function public.request_deposit(text, numeric, text) from public, anon;
revoke execute on function public.request_withdrawal(uuid, numeric) from public, anon;
revoke execute on function public.submit_kyc(text, text, text, date, text, date, text, text, text) from public, anon;
revoke execute on function public.update_profile(text, text, text) from public, anon;
grant execute on function public.add_payout_method(text, text, text), public.claim_leaderboard(), public.get_team(), public.is_admin(),
  public.purchase(text, text), public.refund_order(uuid), public.request_deposit(text, numeric, text), public.request_withdrawal(uuid, numeric),
  public.submit_kyc(text, text, text, date, text, date, text, text, text), public.update_profile(text, text, text),
  public.close_day(date), public.admin_confirm_deposit(uuid, numeric), public.admin_settle_payout(uuid, boolean, text, text), public.admin_review_kyc(uuid, boolean, text)
  to authenticated;
