-- Run this in Supabase SQL editor.
--
-- ai-paywall is fully wallet-based — there is no tenant identity any more.
-- Analytics rows are keyed by `wallet_address`. Replay protection is
-- globally unique by tx signature (one Solana tx → one ATA → one wallet).

create extension if not exists pgcrypto;

-- ─── Payments ───────────────────────────────────────────────────────────────
create table if not exists public.payments (
  id              bigserial primary key,
  tx              text not null unique,
  wallet_address  text,
  network         text,
  bot_name        text,
  user_agent      text,
  path            text,
  page_hash       text,
  lamports        bigint,
  relevance_score integer,
  content_type    text,
  bot_multiplier  double precision,
  exclusivity_mod double precision,
  timestamp       timestamptz not null default now()
);

-- Forward-compatible additions (idempotent).
alter table public.payments add column if not exists wallet_address text;
alter table public.payments add column if not exists network text;

create index if not exists payments_timestamp_idx on public.payments (timestamp desc);
create index if not exists payments_path_idx      on public.payments (path);
create index if not exists payments_bot_name_idx  on public.payments (bot_name);
create index if not exists payments_wallet_idx    on public.payments (wallet_address);

-- ─── Verified tx cache (replay protection) ──────────────────────────────────
create table if not exists public.verified_tx_cache (
  tx              text primary key,
  wallet_address  text,
  cached_at       timestamptz not null default now()
);

alter table public.verified_tx_cache add column if not exists wallet_address text;
create index if not exists verified_tx_cache_wallet_idx on public.verified_tx_cache (wallet_address);

-- The legacy `tenants` table is no longer used and can be dropped manually
-- once any historical rows are migrated:
--   drop table if exists public.tenants;
