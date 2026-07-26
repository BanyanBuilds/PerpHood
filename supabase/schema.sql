-- PERPHOOD V20 adaptive BattlePool production-shaped persistence foundation.
-- This schema does not implement custody, trading, settlement, or smart-contract accounting.
-- Contract and indexer data must be written by trusted server-side processes.

create extension if not exists pgcrypto;

create type public.perphood_order_side as enum ('buy', 'sell', 'long', 'short');
create type public.perphood_order_kind as enum ('market', 'limit', 'trigger');
create type public.perphood_order_status as enum ('open', 'filled', 'cancelled', 'expired', 'rejected');
create type public.perphood_position_side as enum ('long', 'short');
create type public.perphood_alert_kind as enum ('price', 'market_cap', 'volume', 'funding', 'liquidation', 'wallet', 'order');
create type public.perphood_reward_kind as enum ('referral');
create type public.perphood_fee_kind as enum ('battle_execution', 'liquidation', 'borrow');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  wallet_address text unique,
  display_name text,
  avatar_url text,
  referral_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10)),
  referred_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (referred_by is null or referred_by <> id)
);

create table public.wallet_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  chain_id bigint not null default 4663,
  wallet_address text not null,
  session_key_hash text,
  permissions jsonb not null default '{"spot":true,"perps":true,"launch":true}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

-- One active trading wallet session per profile. Tracked wallets are stored separately and are read-only.
create unique index wallet_sessions_one_active_per_profile
  on public.wallet_sessions(profile_id)
  where active and revoked_at is null;
create index wallet_sessions_wallet_idx on public.wallet_sessions(lower(wallet_address));

create table public.terminal_layouts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'Default',
  layout jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_id, name)
);
create unique index terminal_layouts_one_default
  on public.terminal_layouts(profile_id)
  where is_default;

create table public.watchlist_items (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  chain_id bigint not null default 4663,
  market_address text not null,
  created_at timestamptz not null default now(),
  primary key(profile_id, chain_id, market_address)
);

create table public.tracked_wallets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  chain_id bigint not null default 4663,
  tracked_address text not null,
  label text,
  alert_enabled boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  unique(profile_id, chain_id, tracked_address)
);
comment on table public.tracked_wallets is 'Read-only intelligence. Rows never authorize execution, bundling, mirroring, or multiwallet trading.';

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind public.perphood_alert_kind not null,
  chain_id bigint not null default 4663,
  market_address text,
  tracked_address text,
  condition jsonb not null,
  enabled boolean not null default true,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.launch_drafts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default '',
  ticker text not null default '',
  description text not null default '',
  image_url text,
  website_url text,
  x_url text,
  genesis_buy_wei numeric(78,0) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.markets (
  id uuid primary key default gen_random_uuid(),
  chain_id bigint not null default 4663,
  token_address text not null,
  market_address text not null,
  creator_profile_id uuid references public.profiles(id) on delete set null,
  normalized_name text not null,
  normalized_ticker text not null,
  image_exact_hash text,
  image_perceptual_hash text,
  metadata_fingerprint text not null,
  og_status text not null check (og_status in ('og', 'copy')),
  first_seen_market_id uuid references public.markets(id) on delete set null,
  launch_block bigint not null,
  launched_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(chain_id, token_address),
  unique(chain_id, market_address),
  unique(chain_id, metadata_fingerprint, launch_block)
);
create index markets_identity_idx on public.markets(chain_id, metadata_fingerprint, launch_block);
create index markets_name_ticker_idx on public.markets(chain_id, normalized_name, normalized_ticker);

-- Trusted indexers mirror authoritative BattlePool contract configuration and state.
create table public.battle_pool_configs (
  market_id uuid primary key references public.markets(id) on delete cascade,
  version text not null,
  total_supply numeric(78,0) not null,
  curve_allocation numeric(78,0) not null,
  short_inventory_allocation numeric(78,0) not null,
  safety_inventory_allocation numeric(78,0) not null,
  opening_fdv_wei numeric(78,0) not null,
  curve_exponent numeric(20,10) not null,
  max_curve_sold_bps integer not null,
  protected_weth_bps integer not null,
  max_pool_utilization_bps integer not null,
  adaptive_min_safety_bps integer not null,
  adaptive_max_short_inventory_bps integer not null,
  adaptive_release_trigger_bps integer not null,
  adaptive_reclaim_trigger_bps integer not null,
  adaptive_target_utilization_bps integer not null,
  adaptive_release_step_bps integer not null,
  adaptive_min_depth_wei numeric(78,0) not null,
  execution_fee_bps integer not null,
  created_at timestamptz not null default now(),
  check (curve_allocation + short_inventory_allocation + safety_inventory_allocation = total_supply),
  check (curve_exponent > 1),
  check (max_curve_sold_bps between 1 and 9999),
  check (protected_weth_bps between 0 and 10000),
  check (max_pool_utilization_bps between 0 and 10000),
  check (adaptive_min_safety_bps between 0 and 10000),
  check (adaptive_max_short_inventory_bps between 0 and 10000),
  check (adaptive_release_trigger_bps between 0 and 10000),
  check (adaptive_reclaim_trigger_bps between 0 and 10000),
  check (adaptive_target_utilization_bps between 1 and 10000),
  check (adaptive_release_step_bps between 1 and 10000),
  check (adaptive_reclaim_trigger_bps < adaptive_release_trigger_bps)
);

create table public.battle_pool_snapshots (
  id bigint generated always as identity primary key,
  market_id uuid not null references public.markets(id) on delete cascade,
  state_sequence bigint not null,
  state_hash text not null,
  block_number bigint not null,
  transaction_hash text not null,
  log_index integer not null,
  curve_token_reserve numeric(78,0) not null,
  real_weth_balance_wei numeric(78,0) not null,
  locked_collateral_wei numeric(78,0) not null,
  locked_long_collateral_wei numeric(78,0) not null,
  locked_short_collateral_wei numeric(78,0) not null,
  locked_short_proceeds_wei numeric(78,0) not null,
  synthetic_long_credit_wei numeric(78,0) not null,
  short_inventory_reserve numeric(78,0) not null,
  safety_inventory_reserve numeric(78,0) not null,
  adaptive_short_inventory_released numeric(78,0) not null default 0,
  adaptive_rebalance_count bigint not null default 0,
  short_inventory_utilization_bps integer not null default 0,
  locked_long_tokens numeric(78,0) not null,
  circulating_spot_tokens numeric(78,0) not null,
  borrowed_short_tokens numeric(78,0) not null,
  reserved_position_equity_wei numeric(78,0) not null,
  free_weth_wei numeric(78,0) not null,
  accumulated_pool_fees_wei numeric(78,0) not null,
  retained_liquidation_equity_wei numeric(78,0) not null,
  bad_debt_wei numeric(78,0) not null,
  marginal_price_wei numeric(78,0) not null,
  block_timestamp timestamptz not null,
  created_at timestamptz not null default now(),
  unique(market_id, transaction_hash, log_index),
  unique(market_id, state_sequence)
);
create index battle_pool_snapshots_market_block_idx on public.battle_pool_snapshots(market_id, block_number desc);
create index battle_pool_snapshots_market_sequence_idx on public.battle_pool_snapshots(market_id, state_sequence desc);

create table public.open_battle_positions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  market_id uuid not null references public.markets(id) on delete cascade,
  onchain_position_id numeric(78,0) not null,
  side public.perphood_position_side not null,
  leverage numeric(10,4) not null,
  collateral_wei numeric(78,0) not null,
  notional_wei numeric(78,0) not null,
  locked_token_amount numeric(78,0) not null default 0,
  long_debt_wei numeric(78,0) not null default 0,
  borrowed_token_amount numeric(78,0) not null default 0,
  locked_short_proceeds_wei numeric(78,0) not null default 0,
  entry_fee_wei numeric(78,0) not null default 0,
  maintenance_margin_bps integer not null default 200,
  entry_price_wei numeric(78,0) not null,
  liquidation_price_wei numeric(78,0) not null,
  opened_transaction_hash text not null,
  opened_at timestamptz not null,
  updated_at timestamptz not null default now(),
  unique(market_id, onchain_position_id),
  check (leverage >= 1 and leverage <= 20)
);
create index open_battle_positions_profile_idx on public.open_battle_positions(profile_id, opened_at desc);
create index open_battle_positions_market_side_idx on public.open_battle_positions(market_id, side, opened_at);

create table public.battle_pool_events (
  id bigint generated always as identity primary key,
  market_id uuid not null references public.markets(id) on delete cascade,
  state_sequence bigint not null,
  state_hash text not null,
  transaction_hash text not null,
  log_index integer not null,
  block_number bigint not null,
  actor_address text not null,
  action text not null check (action in ('spot_buy','spot_sell','long_open','long_close','short_open','short_close','long_liquidation','short_liquidation','safety_release','safety_reclaim','migration')),
  gross_weth_wei numeric(78,0) not null default 0,
  token_amount numeric(78,0) not null default 0,
  collateral_wei numeric(78,0) not null default 0,
  payout_wei numeric(78,0) not null default 0,
  retained_equity_wei numeric(78,0) not null default 0,
  bad_debt_wei numeric(78,0) not null default 0,
  internal_execution_steps integer not null default 1,
  liquidation_count integer not null default 0,
  price_before_wei numeric(78,0) not null,
  price_after_wei numeric(78,0) not null,
  created_at timestamptz not null,
  unique(market_id, transaction_hash, log_index)
);
create index battle_pool_events_market_time_idx on public.battle_pool_events(market_id, created_at desc);

-- One user-visible action may execute through many internal curve boundaries.
-- The batch row proves that every sub-step and liquidation settled atomically.
create table public.battle_execution_batches (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete cascade,
  start_state_sequence bigint not null,
  end_state_sequence bigint not null,
  end_state_hash text not null,
  transaction_hash text not null,
  actor_address text not null,
  side text not null check (side in ('spot_buy','spot_sell','long_open','short_open')),
  requested_weth_wei numeric(78,0) not null default 0,
  requested_token_amount numeric(78,0) not null default 0,
  filled_weth_wei numeric(78,0) not null default 0,
  filled_token_amount numeric(78,0) not null default 0,
  internal_step_count integer not null,
  liquidation_count integer not null default 0,
  retained_liquidation_equity_wei numeric(78,0) not null default 0,
  realized_bad_debt_wei numeric(78,0) not null default 0,
  start_price_wei numeric(78,0) not null,
  end_price_wei numeric(78,0) not null,
  created_at timestamptz not null,
  unique(market_id, transaction_hash),
  check (internal_step_count > 0),
  check (end_state_sequence >= start_state_sequence),
  check (realized_bad_debt_wei = 0)
);
create index battle_execution_batches_market_time_idx on public.battle_execution_batches(market_id, created_at desc);

create table public.pending_orders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  chain_id bigint not null default 4663,
  market_address text not null,
  side public.perphood_order_side not null,
  kind public.perphood_order_kind not null,
  status public.perphood_order_status not null default 'open',
  collateral_wei numeric(78,0) not null default 0,
  notional_wei numeric(78,0) not null default 0,
  leverage numeric(10,4) not null default 1,
  trigger_market_cap_usd numeric(38,8),
  take_profit_market_cap_usd numeric(38,8),
  stop_loss_market_cap_usd numeric(38,8),
  client_order_id text,
  transaction_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  filled_at timestamptz,
  check (leverage >= 1 and leverage <= 20)
);
create index pending_orders_profile_status_idx on public.pending_orders(profile_id, status, created_at desc);

create table public.position_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  chain_id bigint not null default 4663,
  market_address text not null,
  side public.perphood_position_side not null,
  leverage numeric(10,4) not null,
  collateral_wei numeric(78,0) not null,
  notional_wei numeric(78,0) not null,
  token_amount numeric(78,0) not null default 0,
  long_debt_wei numeric(78,0) not null default 0,
  borrowed_token_amount numeric(78,0) not null default 0,
  locked_short_proceeds_wei numeric(78,0) not null default 0,
  entry_price_wei numeric(78,0),
  exit_price_wei numeric(78,0),
  entry_market_cap_usd numeric(38,8) not null,
  exit_market_cap_usd numeric(38,8),
  realized_pnl_wei numeric(78,0),
  fees_wei numeric(78,0) not null default 0,
  funding_wei numeric(78,0) not null default 0,
  close_reason text,
  opened_at timestamptz not null,
  closed_at timestamptz,
  transaction_hash text,
  check (leverage >= 1 and leverage <= 20)
);
create index position_history_profile_idx on public.position_history(profile_id, opened_at desc);
create index position_history_perp_leaderboard_idx on public.position_history(closed_at desc, realized_pnl_wei desc)
  where closed_at is not null;

create table public.referral_relationships (
  referred_profile_id uuid primary key references public.profiles(id) on delete cascade,
  referrer_profile_id uuid not null references public.profiles(id) on delete restrict,
  referral_code text not null,
  starts_at timestamptz not null default now(),
  trader_discount_ends_at timestamptz not null default (now() + interval '30 days'),
  blocked_reason text,
  created_at timestamptz not null default now(),
  check (referred_profile_id <> referrer_profile_id)
);
create index referral_relationships_referrer_idx on public.referral_relationships(referrer_profile_id, created_at desc);

create table public.reward_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind public.perphood_reward_kind not null,
  chain_id bigint not null default 4663,
  market_address text,
  source_fee_event_id uuid,
  amount_wei numeric(78,0) not null,
  settlement_asset text not null default 'ETH',
  qualified_volume_usd numeric(38,8) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'claimable', 'paid', 'rejected')),
  available_at timestamptz not null default (now() + interval '7 days'),
  paid_transaction_hash text,
  created_at timestamptz not null default now()
);
create index reward_events_profile_idx on public.reward_events(profile_id, status, created_at desc);

create table public.protocol_fee_events (
  id uuid primary key default gen_random_uuid(),
  chain_id bigint not null default 4663,
  market_address text not null,
  transaction_hash text not null,
  log_index integer not null,
  trader_address text not null,
  fee_kind public.perphood_fee_kind not null,
  executed_volume_usd numeric(38,8) not null,
  total_fee_wei numeric(78,0) not null,
  battle_pool_wei numeric(78,0) not null default 0,
  treasury_wei numeric(78,0) not null default 0,
  operations_wei numeric(78,0) not null default 0,
  referral_wei numeric(78,0) not null default 0,
  block_number bigint not null,
  block_timestamp timestamptz not null,
  created_at timestamptz not null default now(),
  unique(chain_id, transaction_hash, log_index)
);
create index protocol_fee_events_time_idx on public.protocol_fee_events(block_timestamp desc);
create index protocol_fee_events_market_idx on public.protocol_fee_events(chain_id, market_address, block_timestamp desc);

create view public.protocol_revenue_daily as
select
  date_trunc('day', block_timestamp) as day,
  chain_id,
  sum(executed_volume_usd) as executed_volume_usd,
  sum(total_fee_wei) as total_fee_wei,
  sum(battle_pool_wei) as battle_pool_wei,
  sum(treasury_wei) as treasury_wei,
  sum(operations_wei) as operations_wei,
  sum(referral_wei) as referral_wei
from public.protocol_fee_events
group by 1, 2;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger terminal_layouts_set_updated_at before update on public.terminal_layouts for each row execute function public.set_updated_at();
create trigger alerts_set_updated_at before update on public.alerts for each row execute function public.set_updated_at();
create trigger launch_drafts_set_updated_at before update on public.launch_drafts for each row execute function public.set_updated_at();
create trigger pending_orders_set_updated_at before update on public.pending_orders for each row execute function public.set_updated_at();
create trigger open_battle_positions_set_updated_at before update on public.open_battle_positions for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.wallet_sessions enable row level security;
alter table public.terminal_layouts enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.tracked_wallets enable row level security;
alter table public.alerts enable row level security;
alter table public.launch_drafts enable row level security;
alter table public.markets enable row level security;
alter table public.pending_orders enable row level security;
alter table public.position_history enable row level security;
alter table public.referral_relationships enable row level security;
alter table public.reward_events enable row level security;
alter table public.protocol_fee_events enable row level security;
alter table public.battle_pool_configs enable row level security;
alter table public.battle_pool_snapshots enable row level security;
alter table public.open_battle_positions enable row level security;
alter table public.battle_pool_events enable row level security;
alter table public.battle_execution_batches enable row level security;

create policy profiles_select_own on public.profiles for select using (auth.uid() = id);
create policy profiles_update_own on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy wallet_sessions_own on public.wallet_sessions for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy terminal_layouts_own on public.terminal_layouts for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy watchlist_items_own on public.watchlist_items for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy tracked_wallets_own on public.tracked_wallets for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy alerts_own on public.alerts for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy launch_drafts_own on public.launch_drafts for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy pending_orders_read_own on public.pending_orders for select using (auth.uid() = profile_id);
create policy position_history_read_own on public.position_history for select using (auth.uid() = profile_id);
create policy open_battle_positions_read_own on public.open_battle_positions for select using (auth.uid() = profile_id);
create policy referral_relationships_read_parties on public.referral_relationships for select using (auth.uid() = referred_profile_id or auth.uid() = referrer_profile_id);
create policy reward_events_read_own on public.reward_events for select using (auth.uid() = profile_id);

-- Public market metadata can be read by anyone. Trusted indexers write it with the service role.
create policy markets_public_read on public.markets for select using (true);
create policy battle_pool_configs_public_read on public.battle_pool_configs for select using (true);
create policy battle_pool_snapshots_public_read on public.battle_pool_snapshots for select using (true);
create policy battle_pool_events_public_read on public.battle_pool_events for select using (true);
create policy battle_execution_batches_public_read on public.battle_execution_batches for select using (true);

-- No browser insert/update policies exist for protocol_fee_events, position_history, or executed order state.
-- Trusted service-role indexers mirror authoritative contract events into these tables.

-- Creator/holder reward routing is absent in V20. Referral/reward rows are inactive future placeholders and are not authoritative BattlePool economics.

-- V41 launchpad lifecycle registry. Service-role indexers are the only writers.
create table if not exists public.launchpad_markets (
  market_address text primary key,
  token_address text not null unique,
  creator_wallet text not null,
  metadata_hash text not null,
  normalized_name text not null,
  normalized_symbol text not null,
  launchpad_version text not null default 'v41-launchpad-test-alpha',
  total_supply numeric(78, 0) not null,
  total_launch_spend_wei numeric(78, 0) not null,
  gas_reserve_wei numeric(78, 0) not null,
  creator_genesis_buy_wei numeric(78, 0) not null,
  migration_target_market_cap_usd numeric(30, 8) not null,
  phase text not null check (phase in ('bonding', 'migrating', 'migrated', 'paused')),
  migration_gate_digest text,
  migrated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_supply = 1000000000000000000000000000),
  check (total_launch_spend_wei >= gas_reserve_wei + creator_genesis_buy_wei)
);

create table if not exists public.launchpad_migration_checks (
  id bigint generated always as identity primary key,
  market_address text not null references public.launchpad_markets(market_address) on delete cascade,
  block_number bigint not null,
  market_cap_usd numeric(30, 8) not null,
  real_weth_wei numeric(78, 0) not null,
  free_weth_wei numeric(78, 0) not null,
  required_free_weth_wei numeric(78, 0) not null,
  short_capacity_wei numeric(78, 0) not null,
  bad_debt_wei numeric(78, 0) not null,
  independent_traders integer not null,
  active_liquidation boolean not null,
  gate_digest text not null,
  ready boolean not null,
  checked_at timestamptz not null default now(),
  unique (market_address, block_number)
);

create table if not exists public.launchpad_test_runs (
  id uuid primary key default gen_random_uuid(),
  market_address text,
  scenario text not null,
  seed integer,
  attempted_actions integer not null default 0,
  successful_actions integer not null default 0,
  rejected_actions integer not null default 0,
  bad_debt_wei numeric(78, 0) not null default 0,
  supply_conserved boolean not null default false,
  event_log jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists launchpad_markets_creator_idx on public.launchpad_markets(creator_wallet, created_at desc);
create index if not exists launchpad_markets_phase_idx on public.launchpad_markets(phase, created_at desc);
create index if not exists launchpad_migration_checks_market_idx on public.launchpad_migration_checks(market_address, block_number desc);

create trigger launchpad_markets_set_updated_at before update on public.launchpad_markets for each row execute function public.set_updated_at();

alter table public.launchpad_markets enable row level security;
alter table public.launchpad_migration_checks enable row level security;
alter table public.launchpad_test_runs enable row level security;

create policy launchpad_markets_public_read on public.launchpad_markets for select using (true);
create policy launchpad_migration_checks_public_read on public.launchpad_migration_checks for select using (true);

-- Test runs and all protocol lifecycle writes remain service-role only.
