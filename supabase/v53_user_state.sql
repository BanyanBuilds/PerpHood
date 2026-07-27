-- PERPHOOD V53 cross-device user-state synchronization.
-- This stores settings only. Recovery keys never authorize trades, withdrawals,
-- custody actions, sequencer commands, keeper execution, or BattlePool settlement.

create extension if not exists pgcrypto;

create table if not exists public.perphood_v53_profiles (
  profile_id uuid primary key,
  sync_key_hash text not null unique check (length(sync_key_hash) = 64),
  display_name text,
  verified_wallet_address text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.perphood_v53_user_state (
  profile_id uuid primary key references public.perphood_v53_profiles(profile_id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  state jsonb not null default '{"version":53,"sections":{}}'::jsonb,
  last_device_id uuid,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(state) = 'object'),
  check ((state ->> 'version')::integer = 53),
  check (jsonb_typeof(state -> 'sections') = 'object')
);

create table if not exists public.perphood_v53_devices (
  profile_id uuid not null references public.perphood_v53_profiles(profile_id) on delete cascade,
  device_id uuid not null,
  label text not null default 'Browser',
  user_agent_hash text,
  last_revision bigint not null default 0,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key(profile_id, device_id)
);

create table if not exists public.perphood_v53_state_events (
  event_id bigint generated always as identity primary key,
  profile_id uuid not null references public.perphood_v53_profiles(profile_id) on delete cascade,
  device_id uuid,
  previous_revision bigint not null,
  next_revision bigint not null,
  section_keys text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists perphood_v53_state_events_profile_idx
  on public.perphood_v53_state_events(profile_id, event_id desc);
create index if not exists perphood_v53_devices_seen_idx
  on public.perphood_v53_devices(last_seen_at desc);

alter table public.perphood_v53_profiles enable row level security;
alter table public.perphood_v53_user_state enable row level security;
alter table public.perphood_v53_devices enable row level security;
alter table public.perphood_v53_state_events enable row level security;

-- No browser policies are created. The same-origin PERPHOOD API verifies a
-- 256-bit recovery key, stores only its SHA-256 hash, and uses the server-only
-- service-role credential. This prevents raw database access with a recovery key.

create or replace function public.perphood_v53_save_user_state(
  p_profile_id uuid,
  p_expected_revision bigint,
  p_state jsonb,
  p_device_id uuid
)
returns table(revision bigint, state jsonb, updated_at timestamptz, conflict boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.perphood_v53_user_state%rowtype;
  v_next_revision bigint;
  v_section_keys text[];
  v_inserted integer;
begin
  if jsonb_typeof(p_state) <> 'object'
     or (p_state ->> 'version')::integer <> 53
     or jsonb_typeof(p_state -> 'sections') <> 'object' then
    raise exception 'Invalid V53 user-state document';
  end if;

  select * into v_current
  from public.perphood_v53_user_state
  where profile_id = p_profile_id
  for update;

  if not found then
    if p_expected_revision <> 0 then
      return query select 0::bigint, '{"version":53,"sections":{}}'::jsonb, now(), true;
      return;
    end if;
    v_next_revision := 1;
    insert into public.perphood_v53_user_state(profile_id, revision, state, last_device_id, updated_at)
    values(p_profile_id, v_next_revision, p_state, p_device_id, now())
    on conflict (profile_id) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      select * into v_current
      from public.perphood_v53_user_state
      where profile_id = p_profile_id
      for update;
      return query select v_current.revision, v_current.state, v_current.updated_at, true;
      return;
    end if;
    v_section_keys := array(select jsonb_object_keys(p_state -> 'sections'));
    insert into public.perphood_v53_state_events(profile_id, device_id, previous_revision, next_revision, section_keys)
    values(p_profile_id, p_device_id, 0, v_next_revision, coalesce(v_section_keys, '{}'));
  elsif v_current.revision <> p_expected_revision then
    return query select v_current.revision, v_current.state, v_current.updated_at, true;
    return;
  else
    v_next_revision := v_current.revision + 1;
    update public.perphood_v53_user_state
      set revision = v_next_revision, state = p_state, last_device_id = p_device_id, updated_at = now()
      where profile_id = p_profile_id;
    v_section_keys := array(select jsonb_object_keys(p_state -> 'sections'));
    insert into public.perphood_v53_state_events(profile_id, device_id, previous_revision, next_revision, section_keys)
    values(p_profile_id, p_device_id, v_current.revision, v_next_revision, coalesce(v_section_keys, '{}'));
  end if;

  update public.perphood_v53_devices
    set last_revision = v_next_revision, last_seen_at = now()
    where profile_id = p_profile_id and device_id = p_device_id;

  return query
  select s.revision, s.state, s.updated_at, false
  from public.perphood_v53_user_state s
  where s.profile_id = p_profile_id;
end;
$$;

revoke all on function public.perphood_v53_save_user_state(uuid,bigint,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.perphood_v53_save_user_state(uuid,bigint,jsonb,uuid) to service_role;

comment on table public.perphood_v53_user_state is
  'Cross-device settings snapshot only: presets, layouts, watchlists, likes, alert rules and preferences. Never custody or settlement truth.';
