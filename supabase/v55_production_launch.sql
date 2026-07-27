-- Leverage X V55 — real Robinhood Chain token metadata and confirmed launch registry.
-- Run after v52_scale_foundation.sql and v53_user_state.sql.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'leveragex-token-media',
  'leveragex-token-media',
  true,
  4194304,
  array['image/png','image/jpeg','image/webp','image/gif','image/avif','application/json']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.leveragex_v55_launches (
  id uuid primary key default gen_random_uuid(),
  chain_id integer not null check (chain_id in (46630, 4663)),
  network text not null check (network in ('testnet', 'mainnet')),
  factory_address text not null check (factory_address ~ '^0x[0-9a-f]{40}$'),
  market_address text not null check (market_address ~ '^0x[0-9a-f]{40}$'),
  token_address text not null check (token_address ~ '^0x[0-9a-f]{40}$'),
  creator_address text not null check (creator_address ~ '^0x[0-9a-f]{40}$'),
  transaction_hash text not null check (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  block_number bigint not null check (block_number > 0),
  name text not null check (char_length(name) between 2 and 64),
  symbol text not null check (symbol ~ '^[A-Z0-9]{1,12}$'),
  description text not null check (char_length(description) between 4 and 1000),
  metadata_uri text not null,
  metadata_hash text not null check (metadata_hash ~ '^0x[0-9a-f]{64}$'),
  image_url text not null,
  website text,
  x_handle text,
  telegram text,
  creator_buy_wei numeric(78,0) not null check (creator_buy_wei > 0),
  creator_tokens_out_wad numeric(78,0) not null check (creator_tokens_out_wad > 0),
  market_cap_eth_wad numeric(78,0) not null check (market_cap_eth_wad > 0),
  migration_target_usd_wad numeric(78,0) not null check (migration_target_usd_wad > 0),
  status text not null default 'confirmed' check (status in ('confirmed','reorged','paused','migrated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chain_id, token_address),
  unique (chain_id, market_address),
  unique (chain_id, transaction_hash)
);

create index if not exists leveragex_v55_launches_chain_block_idx
  on public.leveragex_v55_launches (chain_id, block_number desc);
create index if not exists leveragex_v55_launches_creator_idx
  on public.leveragex_v55_launches (creator_address, block_number desc);
create index if not exists leveragex_v55_launches_symbol_idx
  on public.leveragex_v55_launches (symbol, block_number desc);

alter table public.leveragex_v55_launches enable row level security;

drop policy if exists "Public can read confirmed V55 launches" on public.leveragex_v55_launches;
create policy "Public can read confirmed V55 launches"
  on public.leveragex_v55_launches
  for select
  to anon, authenticated
  using (status in ('confirmed','paused','migrated'));

-- Uploads and registry writes are server-only through the Supabase service role.
-- Public token images and metadata are readable because leveragex-token-media is a public bucket.
