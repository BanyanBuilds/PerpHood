-- Leverage X V65 — GMGN-first canonical Uniswap V3 pools.
-- Run after v55_production_launch.sql and v63_gmgn_compatibility.sql.

alter table public.leveragex_v55_launches
  add column if not exists launchpad_version text not null default 'V55',
  add column if not exists pool_type text,
  add column if not exists dex_factory text,
  add column if not exists pair_token text,
  add column if not exists position_manager text,
  add column if not exists liquidity_locker text,
  add column if not exists launch_position_id numeric(78,0),
  add column if not exists final_position_id numeric(78,0),
  add column if not exists pool_fee integer,
  add column if not exists token_is_token0 boolean,
  add column if not exists opening_fdv_eth_wad numeric(78,0),
  add column if not exists target_fdv_eth_wad numeric(78,0),
  add column if not exists graduated_at_block bigint;

alter table public.leveragex_v55_launches
  drop constraint if exists leveragex_v55_launches_migration_target_usd_wad_check;
alter table public.leveragex_v55_launches
  add constraint leveragex_v55_launches_migration_target_usd_wad_check check (migration_target_usd_wad >= 0);

alter table public.leveragex_v55_launches
  drop constraint if exists leveragex_v55_launches_pool_fee_check;
alter table public.leveragex_v55_launches
  add constraint leveragex_v55_launches_pool_fee_check check (pool_fee is null or pool_fee in (100, 500, 3000, 10000));

create index if not exists leveragex_v55_launches_version_block_idx
  on public.leveragex_v55_launches (launchpad_version, chain_id, block_number desc);
create index if not exists leveragex_v55_launches_dex_pool_idx
  on public.leveragex_v55_launches (dex_factory, market_address);

create table if not exists public.leveragex_v65_pool_events (
  chain_id integer not null check (chain_id = 4663),
  pool_address text not null check (pool_address ~ '^0x[0-9a-f]{40}$'),
  token_address text not null check (token_address ~ '^0x[0-9a-f]{40}$'),
  factory_address text not null check (factory_address ~ '^0x[0-9a-f]{40}$'),
  block_number bigint not null,
  block_hash text not null check (block_hash ~ '^0x[0-9a-f]{64}$'),
  transaction_hash text not null check (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  transaction_index integer not null,
  log_index integer not null,
  event_name text not null check (event_name in ('Initialize','Mint','Burn','Collect','Swap','Flash','IncreaseObservationCardinalityNext')),
  payload jsonb not null default '{}'::jsonb,
  canonical boolean not null default true,
  observed_at timestamptz not null default now(),
  primary key (chain_id, transaction_hash, log_index)
);
create index if not exists leveragex_v65_pool_events_pool_order_idx
  on public.leveragex_v65_pool_events (pool_address, block_number, transaction_index, log_index)
  where canonical = true;
create index if not exists leveragex_v65_pool_events_token_order_idx
  on public.leveragex_v65_pool_events (token_address, block_number, transaction_index, log_index)
  where canonical = true;

alter table public.leveragex_v65_pool_events enable row level security;
drop policy if exists "Public can read canonical V65 pool events" on public.leveragex_v65_pool_events;
create policy "Public can read canonical V65 pool events"
  on public.leveragex_v65_pool_events
  for select
  to anon, authenticated
  using (canonical = true);

create table if not exists public.leveragex_v65_indexer_checkpoints (
  chain_id integer not null check (chain_id = 4663),
  factory_address text not null check (factory_address ~ '^0x[0-9a-f]{40}$'),
  last_finalized_block bigint not null,
  last_finalized_hash text not null check (last_finalized_hash ~ '^0x[0-9a-f]{64}$'),
  updated_at timestamptz not null default now(),
  primary key (chain_id, factory_address)
);
alter table public.leveragex_v65_indexer_checkpoints enable row level security;

comment on table public.leveragex_v65_pool_events is
  'Canonical Uniswap V3 pool events for every Leverage X V65 token. Used by charts, GMGN handoff, and reorg-safe historical replay.';
