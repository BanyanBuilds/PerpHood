-- PERPHOOD V48 finalized read-model replica.
-- Robinhood Chain contracts and the canonical V48 event index remain authoritative.
-- Only a trusted service-role process may write these tables.

create table if not exists public.perphood_v48_markets (
  chain_id bigint not null,
  market_address text not null,
  token_address text not null,
  creator_address text not null,
  metadata_hash text not null,
  creator_genesis_buy_wei numeric(78,0) not null,
  migration_target_usd_wad numeric(78,0) not null,
  created_block bigint not null,
  created_transaction_hash text not null,
  active integer not null,
  phase integer not null,
  migration_gate_digest text,
  migrated_at bigint,
  migration_started_block bigint,
  migration_committed_block bigint,
  primary key(chain_id,market_address)
);

create table if not exists public.perphood_v48_market_metrics (
  chain_id bigint not null,
  market_address text not null,
  source_block bigint not null,
  market_cap_wei numeric(78,0) not null,
  free_weth_wei numeric(78,0) not null,
  open_interest_long_wei numeric(78,0) not null,
  open_interest_short_wei numeric(78,0) not null,
  active_positions numeric(78,0) not null,
  volume_10s_wei numeric(78,0) not null,
  volume_60s_wei numeric(78,0) not null,
  volume_5m_wei numeric(78,0) not null,
  volume_1h_wei numeric(78,0) not null,
  buys_60s integer not null,
  sells_60s integer not null,
  traders_5m integer not null,
  change_60s_bps integer not null,
  change_5m_bps integer not null,
  digest text not null,
  updated_at bigint not null,
  primary key(chain_id,market_address)
);

create table if not exists public.perphood_v48_market_candles (
  chain_id bigint not null,
  market_address text not null,
  interval_seconds integer not null check(interval_seconds in (1,15,30)),
  bucket_start bigint not null,
  open_market_cap_wei numeric(78,0) not null,
  high_market_cap_wei numeric(78,0) not null,
  low_market_cap_wei numeric(78,0) not null,
  close_market_cap_wei numeric(78,0) not null,
  volume_weth_wei numeric(78,0) not null,
  buy_volume_weth_wei numeric(78,0) not null,
  sell_volume_weth_wei numeric(78,0) not null,
  trade_count integer not null,
  buy_count integer not null,
  sell_count integer not null,
  first_block bigint not null,
  last_block bigint not null,
  updated_at bigint not null,
  primary key(chain_id,market_address,interval_seconds,bucket_start)
);
create index if not exists perphood_v48_candles_recent_idx on public.perphood_v48_market_candles(chain_id,market_address,interval_seconds,bucket_start desc);

create table if not exists public.perphood_v48_sessions (
  chain_id bigint not null,
  session_id text not null,
  owner_address text not null,
  public_key_hash text not null,
  valid_until bigint not null,
  next_nonce numeric(78,0) not null,
  max_notional_wei numeric(78,0) not null,
  max_cumulative_notional_wei numeric(78,0) not null,
  spent_notional_wei numeric(78,0) not null,
  action_bitmap numeric(78,0) not null,
  active integer not null,
  source_block bigint not null,
  source_transaction_hash text not null,
  primary key(chain_id,session_id)
);

create table if not exists public.perphood_v48_orders (
  order_id text primary key,
  client_order_id text not null unique,
  owner_address text not null,
  market_address text not null,
  session_id text not null,
  status text not null,
  order_hash text not null unique,
  payload_json text not null,
  created_at bigint not null,
  updated_at bigint not null,
  lease_owner text,
  lease_expires_at bigint,
  transaction_hash text,
  block_number bigint
);

create table if not exists public.perphood_v48_events (
  sequence bigint primary key,
  chain_id bigint not null,
  event_type text not null,
  market_address text,
  owner_address text,
  block_number bigint not null,
  payload_json text not null,
  created_at bigint not null
);
create index if not exists perphood_v48_events_market_idx on public.perphood_v48_events(chain_id,market_address,sequence desc);

alter table public.perphood_v48_markets enable row level security;
alter table public.perphood_v48_market_metrics enable row level security;
alter table public.perphood_v48_market_candles enable row level security;
alter table public.perphood_v48_sessions enable row level security;
alter table public.perphood_v48_orders enable row level security;
alter table public.perphood_v48_events enable row level security;

-- Public market data is readable. Account/session/order data requires server-side access until wallet-auth policies are audited.
create policy "v48 public markets read" on public.perphood_v48_markets for select using (true);
create policy "v48 public metrics read" on public.perphood_v48_market_metrics for select using (true);
create policy "v48 public candles read" on public.perphood_v48_market_candles for select using (true);
create policy "v48 public market events read" on public.perphood_v48_events for select using (owner_address is null);
