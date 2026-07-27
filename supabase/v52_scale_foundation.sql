-- PERPHOOD V52 product-completion and scale foundation.
-- This database stores user configuration, durable command admission, read models,
-- service coordination and audit history. It MUST NOT become the authoritative
-- BattlePool reserve, collateral, debt, liquidation or payout ledger.

create extension if not exists pgcrypto;

create table if not exists public.perphood_v52_trading_presets (
  profile_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('new-pairs','cooking','migrated','movers','most-liked','highest-market-cap')),
  action text not null check (action in ('buy','long','short')),
  amount_wei numeric(78,0) not null default 0 check (amount_wei >= 0),
  leverage smallint not null default 1 check (leverage between 1 and 20),
  enabled boolean not null default false,
  slippage_bps integer not null default 200 check (slippage_bps between 0 and 5000),
  execution_preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (profile_id, category, action),
  check (action = 'buy' or leverage >= 2),
  check (not enabled or amount_wei > 0)
);
comment on table public.perphood_v52_trading_presets is 'Independent Markets/Movers Buy, Long and Short presets. Unconfigured Long/Short actions remain disabled.';

create table if not exists public.perphood_v52_workspaces (
  workspace_id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Default',
  is_default boolean not null default false,
  active_market_slug text,
  markets_category text not null default 'movers',
  left_sidecars jsonb not null default '[]'::jsonb,
  right_sidecars jsonb not null default '[]'::jsonb,
  floating_panels jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_id, name),
  check (jsonb_typeof(left_sidecars) = 'array'),
  check (jsonb_array_length(left_sidecars) <= 3),
  check (jsonb_typeof(right_sidecars) = 'array'),
  check (jsonb_typeof(floating_panels) = 'array')
);
create unique index if not exists perphood_v52_one_default_workspace
  on public.perphood_v52_workspaces(profile_id) where is_default;

create table if not exists public.perphood_v52_watchlist (
  profile_id uuid not null references auth.users(id) on delete cascade,
  chain_id bigint not null,
  market_address text not null,
  liked boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(profile_id, chain_id, market_address)
);

create table if not exists public.perphood_v52_command_outbox (
  command_id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  owner_address text not null,
  market_address text not null,
  partition_key integer not null check (partition_key >= 0),
  command_type text not null check (command_type in ('spot-buy','spot-sell','open-long','open-short','close-long','close-short','cancel-order')),
  payload jsonb not null,
  session_id text,
  session_nonce numeric(78,0),
  status text not null default 'accepted' check (status in ('accepted','leased','submitted','confirmed','rejected','failed','cancelled')),
  lease_owner text,
  lease_expires_at timestamptz,
  transaction_hash text,
  confirmed_block bigint,
  failure_code text,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists perphood_v52_command_partition_status_idx
  on public.perphood_v52_command_outbox(partition_key, status, requested_at);
create index if not exists perphood_v52_command_owner_idx
  on public.perphood_v52_command_outbox(lower(owner_address), requested_at desc);
comment on table public.perphood_v52_command_outbox is 'Durable command admission only. Confirmation must reconcile to authoritative chain events.';

create table if not exists public.perphood_v52_market_events (
  partition_key integer not null,
  event_id uuid not null default gen_random_uuid(),
  chain_id bigint not null,
  market_address text not null,
  market_sequence numeric(78,0) not null,
  event_type text not null,
  block_number bigint not null,
  block_hash text not null,
  transaction_hash text not null,
  log_index integer not null,
  payload jsonb not null,
  finalized boolean not null default false,
  observed_at timestamptz not null default now(),
  primary key(partition_key, event_id),
  unique(partition_key, chain_id, market_address, market_sequence),
  unique(partition_key, chain_id, transaction_hash, log_index)
) partition by hash(partition_key);

-- Sixteen physical partitions are a safe initial database layout. Application
-- market shards can be more granular and map deterministically into these tables.
do $$
begin
  for i in 0..15 loop
    execute format(
      'create table if not exists public.perphood_v52_market_events_p%s partition of public.perphood_v52_market_events for values with (modulus 16, remainder %s)',
      i, i
    );
  end loop;
end $$;
create index if not exists perphood_v52_market_events_market_idx
  on public.perphood_v52_market_events(chain_id, market_address, market_sequence desc);
create index if not exists perphood_v52_market_events_finality_idx
  on public.perphood_v52_market_events(finalized, block_number);

create table if not exists public.perphood_v52_service_heartbeats (
  service_role text not null,
  instance_id text not null,
  region text not null default 'unknown',
  partition_start integer,
  partition_end integer,
  status text not null check (status in ('starting','healthy','degraded','draining','stopped')),
  last_sequence numeric(78,0),
  last_block bigint,
  metadata jsonb not null default '{}'::jsonb,
  heartbeat_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  primary key(service_role, instance_id)
);
create index if not exists perphood_v52_heartbeat_role_idx
  on public.perphood_v52_service_heartbeats(service_role, heartbeat_at desc);

create table if not exists public.perphood_v52_recovery_checkpoints (
  checkpoint_id uuid primary key default gen_random_uuid(),
  service_role text not null,
  partition_key integer,
  chain_id bigint,
  finalized_block bigint,
  last_sequence numeric(78,0),
  snapshot_uri text,
  snapshot_sha256 text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists perphood_v52_checkpoint_role_idx
  on public.perphood_v52_recovery_checkpoints(service_role, partition_key, created_at desc);

alter table public.perphood_v52_trading_presets enable row level security;
alter table public.perphood_v52_workspaces enable row level security;
alter table public.perphood_v52_watchlist enable row level security;
alter table public.perphood_v52_command_outbox enable row level security;
alter table public.perphood_v52_market_events enable row level security;
alter table public.perphood_v52_service_heartbeats enable row level security;
alter table public.perphood_v52_recovery_checkpoints enable row level security;

create policy "v52 owners manage presets" on public.perphood_v52_trading_presets
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy "v52 owners manage workspaces" on public.perphood_v52_workspaces
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy "v52 owners manage watchlist" on public.perphood_v52_watchlist
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

-- No browser policies are created for commands, canonical events, service leases
-- or recovery checkpoints. Trusted server-side workers use the service role.
-- High-frequency market data must be fanned out by dedicated stream gateways;
-- do not subscribe 100K clients directly to raw Postgres Changes.
