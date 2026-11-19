# Aurelia: Gold Academy Network

Green-and-gold, Geist-typed platform. React + Vite on the front end, Supabase (Postgres, Auth, Realtime, Storage, pg_cron) for live data.

## Setup
1. Create a Supabase project and run `supabase/migrations/0001_aurelia.sql` (SQL editor or `supabase db push`).
2. Add `.env.local`:
   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon or publishable key>
   ```
3. In Supabase → Auth → URL configuration, add your site URL (e.g. `http://localhost:5180`) to the redirect URLs.
4. `npm install && npm run dev`, then sign up. **The first account becomes the company root and admin.**
5. As admin: open **Admin → Payment methods**, paste a treasury address for each network you accept, and enable deposits.

## What's live
- **Auth:** sign up (with referral code and team side), log in, log out, forgot and reset password (PKCE).
- **Team-tree compensation plan on academy-pack sales.** All money logic lives in `SECURITY DEFINER` Postgres functions: `purchase`, `refund_order`, `request_withdrawal`, `close_day`, and others. Clients can only read their own rows (RLS).
  - Placement trigger: new members always go to the bottom of the chosen leg.
  - Fast start 10% (first 3 paid directs), tree bonus 10% (needs 3 paid directs), matching 10%, reward share +0.1% (10 paid directs), cap 3× business per 14 days, weekly leaderboard, 14-day refunds with clawback.
  - `close_day()` runs every day at 00:05 UTC via pg_cron.
- **Wallets:** a package wallet (crypto deposits, buys packs) and a free balance (commissions; withdraw after KYC or buy packs). Realtime updates over Supabase channels.
- **Deposits:** USDT TRC20/BEP20/ERC20, USDC ERC20/Solana, BTC. The member sends to the treasury address shown with a QR code and submits the tx hash; an admin checks it on the explorer and confirms. Each hash can only be claimed once.
- **Payouts:** members save validated addresses per network. Withdrawals need KYC and show fees up front. An admin sends from treasury and records the on-chain hash.
- **KYC:** a 3-step dialog. (1) Document photo with in-browser OCR and MRZ auto-scan, (2) confirm and edit the details, (3) selfie, consent and submit. Images go to a private Storage bucket; an admin reviews them with signed URLs.
- **Market:** live XAU/USD from Binance PAXG/USDT (REST history and WebSocket), with 1H/1D/1W/1M charts. Fallback: gold-api.com polling.
- **Real Trading Bot & Daily Profit Sharing:** members allocate real capital from their package or free wallet into algorithmic gold bots trading live 5-minute PAXG/USDT candles. Daily closes (21:00 IST / 15:30 UTC via Edge Function and `admin_distribute_daily_profit`) calculate performance and distribute profits directly into members' Free Balance wallets. Admins have comprehensive preferences: configure member profit share % (e.g. 80%), company fee %, minimum capital, auto-distribution, or apply custom performance rate overrides. Stopping or expiring a bot returns the full principal capital to the member's Free Balance.
- **UI:** light/dark mode, collapsible sidebar, mobile drawer, landing page.

## Before going to production
- Automatic deposit detection: plug a processor (NOWPayments, Coinbase Commerce or similar) into an Edge Function that calls `admin_confirm_deposit`.
- A custody and treasury process for payouts, and 2FA for admins.
- A KYC/AML provider if your jurisdiction requires liveness checks or sanctions screening.
- Legal review of the compensation plan, earnings disclosures and terms in each country.
