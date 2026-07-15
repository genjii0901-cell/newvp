-- Run this in the Supabase SQL editor before deploying the matching application code.
-- It does not change existing TOTP values. The application migrates a legacy plaintext
-- TOTP secret to AES-256-GCM on its first authenticated read.

begin;

-- app_settings contains server-only values, including the admin TOTP secret. Do not
-- expose it through the Supabase Data API to anon/authenticated roles.
create table if not exists public.app_settings (
  key text primary key,
  value text
);
alter table public.app_settings enable row level security;
revoke all on table public.app_settings from anon, authenticated;
grant all on table public.app_settings to service_role;

create table if not exists public.admin_totp_replay (
  secret_fingerprint text not null,
  totp_counter bigint not null,
  used_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (secret_fingerprint, totp_counter)
);

alter table public.admin_totp_replay enable row level security;
revoke all on table public.admin_totp_replay from anon, authenticated;
grant all on table public.admin_totp_replay to service_role;
create index if not exists admin_totp_replay_expires_at_idx
  on public.admin_totp_replay (expires_at);

create table if not exists public.admin_auth_rate_limits (
  key_hash text primary key,
  failures integer not null default 0 check (failures >= 0),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.admin_auth_rate_limits enable row level security;
revoke all on table public.admin_auth_rate_limits from anon, authenticated;
grant all on table public.admin_auth_rate_limits to service_role;
create index if not exists admin_auth_rate_limits_updated_at_idx
  on public.admin_auth_rate_limits (updated_at);

create or replace function public.admin_auth_rate_limit(
  p_key_hash text,
  p_action text,
  p_max_failures integer,
  p_window_seconds integer,
  p_lock_seconds integer
)
returns table (locked boolean, remaining_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.admin_auth_rate_limits%rowtype;
begin
  if p_key_hash is null or length(p_key_hash) <> 64 then
    raise exception 'invalid rate-limit key';
  end if;
  if p_action not in ('check', 'failure', 'success') then
    raise exception 'invalid rate-limit action';
  end if;
  if p_max_failures < 1 or p_window_seconds < 1 or p_lock_seconds < 1 then
    raise exception 'invalid rate-limit configuration';
  end if;

  if p_action = 'success' then
    delete from public.admin_auth_rate_limits where key_hash = p_key_hash;
    return query select false, 0;
    return;
  end if;

  if p_action = 'failure' then
    insert into public.admin_auth_rate_limits as limits (
      key_hash,
      failures,
      window_started_at,
      locked_until,
      updated_at
    )
    values (
      p_key_hash,
      1,
      v_now,
      case when p_max_failures <= 1 then v_now + make_interval(secs => p_lock_seconds) end,
      v_now
    )
    on conflict (key_hash) do update
    set
      failures = case
        when limits.locked_until is not null and limits.locked_until > v_now then limits.failures
        when limits.window_started_at <= v_now - make_interval(secs => p_window_seconds) then 1
        else limits.failures + 1
      end,
      window_started_at = case
        when limits.locked_until is not null and limits.locked_until > v_now then limits.window_started_at
        when limits.window_started_at <= v_now - make_interval(secs => p_window_seconds) then v_now
        else limits.window_started_at
      end,
      locked_until = case
        when limits.locked_until is not null and limits.locked_until > v_now then limits.locked_until
        when (
          case
            when limits.window_started_at <= v_now - make_interval(secs => p_window_seconds) then 1
            else limits.failures + 1
          end
        ) >= p_max_failures then v_now + make_interval(secs => p_lock_seconds)
        else null
      end,
      updated_at = v_now;
  end if;

  select *
  into v_row
  from public.admin_auth_rate_limits
  where key_hash = p_key_hash;

  if not found then
    return query select false, 0;
    return;
  end if;

  if v_row.locked_until is not null and v_row.locked_until > v_now then
    return query
      select true, greatest(1, ceil(extract(epoch from (v_row.locked_until - v_now)))::integer);
    return;
  end if;

  if v_row.window_started_at <= v_now - make_interval(secs => p_window_seconds) then
    delete from public.admin_auth_rate_limits where key_hash = p_key_hash;
  end if;
  return query select false, 0;
end;
$$;

revoke all on function public.admin_auth_rate_limit(text, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.admin_auth_rate_limit(text, text, integer, integer, integer)
  to service_role;

commit;
