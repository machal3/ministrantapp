-- Run once in the Supabase SQL Editor as the database owner, after schema.sql.
-- Safe to rerun: keeps existing PIN, sessions, users, masses and signups.
begin;

create schema if not exists liturgy_private;
revoke all on schema liturgy_private from public, anon, authenticated;

create table if not exists liturgy_private.admin_config (
  id boolean primary key default true check (id),
  salt text not null,
  pin_hash bytea not null,
  failures integer not null default 0,
  window_start timestamptz not null default now()
);
create table if not exists liturgy_private.admin_sessions (
  token_hash bytea primary key,
  expires_at timestamptz not null
);
revoke all on all tables in schema liturgy_private from public, anon, authenticated;
alter table liturgy_private.admin_config enable row level security;
alter table liturgy_private.admin_sessions enable row level security;

insert into liturgy_private.admin_config (id, salt, pin_hash)
select true, salt, sha256(convert_to(salt || ':0403', 'UTF8'))
from (select gen_random_uuid()::text as salt) s
on conflict (id) do nothing;

-- No direct API writes to people or Masses, including deletion/reinsertion bypasses.
revoke insert, update, delete, truncate, references, trigger on public.altar_servers, public.masses
  from public, anon, authenticated;
grant select on public.altar_servers, public.masses to anon;
drop policy if exists anon_full_access on public.altar_servers;
drop policy if exists anon_full_access on public.masses;
drop policy if exists anon_read on public.altar_servers;
drop policy if exists anon_read on public.masses;
create policy anon_read on public.altar_servers for select to anon using (true);
create policy anon_read on public.masses for select to anon using (true);

create or replace function public.admin_login(p_pin text)
returns table(token uuid, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare config liturgy_private.admin_config%rowtype; session_token uuid; expiry timestamptz;
begin
  select * into strict config from liturgy_private.admin_config where id for update;
  if config.window_start <= now() - interval '10 minutes' then
    update liturgy_private.admin_config set failures = 0, window_start = now() where id;
    config.failures := 0;
  end if;
  -- Shared PIN means a shared attempt budget. Invalid attempts return no row so
  -- the transaction commits its counter instead of rolling it back via RAISE.
  if config.failures >= 5 then return; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$'
    or sha256(convert_to(config.salt || ':' || p_pin, 'UTF8')) <> config.pin_hash then
    update liturgy_private.admin_config set failures = failures + 1 where id;
    return;
  end if;
  update liturgy_private.admin_config set failures = 0, window_start = now() where id;
  delete from liturgy_private.admin_sessions s where s.expires_at <= now();
  session_token := gen_random_uuid();
  expiry := now() + interval '30 minutes';
  insert into liturgy_private.admin_sessions values (sha256(convert_to(session_token::text, 'UTF8')), expiry);
  return query select session_token, expiry;
end $$;

create or replace function liturgy_private.require_admin(p_token uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from liturgy_private.admin_sessions
    where token_hash = sha256(convert_to(p_token::text, 'UTF8')) and expires_at > now()) then
    raise exception 'Sesja administratora wygasła. Wpisz PIN ponownie.' using errcode = '42501';
  end if;
end $$;
revoke all on function liturgy_private.require_admin(uuid) from public, anon, authenticated;

create or replace function public.admin_logout(p_token uuid)
returns void language sql security definer set search_path = '' as $$
  delete from liturgy_private.admin_sessions where token_hash = sha256(convert_to(p_token::text, 'UTF8'));
$$;

create or replace function public.admin_update_server(p_token uuid, p_id uuid, p_name text, p_rank text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform liturgy_private.require_admin(p_token);
  update public.altar_servers set name = btrim(p_name), rank = p_rank where id = p_id;
  if not found then raise exception 'Ten ministrant już nie istnieje.'; end if;
end $$;

create or replace function public.admin_update_mass_time(p_token uuid, p_id uuid, p_start_time timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform liturgy_private.require_admin(p_token);
  if p_start_time is null or extract(second from p_start_time) <> 0 then
    raise exception 'Podaj prawidłową godzinę z dokładnością do minuty.';
  end if;
  update public.masses set start_time = p_start_time where id = p_id;
  if not found then raise exception 'To nabożeństwo już nie istnieje.'; end if;
end $$;

create or replace function public.admin_add_mass(p_token uuid, p_start_time timestamptz, p_title text, p_suggested_spots integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform liturgy_private.require_admin(p_token);
  insert into public.masses (start_time, title, suggested_spots, is_extra)
  values (p_start_time, btrim(p_title), p_suggested_spots, true);
end $$;

create or replace function public.admin_delete_mass(p_token uuid, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform liturgy_private.require_admin(p_token);
  delete from public.masses where id = p_id and is_extra;
  if not found then raise exception 'Nie znaleziono dodatkowego nabożeństwa do usunięcia.'; end if;
end $$;

revoke all on function public.admin_login(text), public.admin_logout(uuid),
  public.admin_update_server(uuid, uuid, text, text), public.admin_update_mass_time(uuid, uuid, timestamptz),
  public.admin_add_mass(uuid, timestamptz, text, integer), public.admin_delete_mass(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_login(text), public.admin_logout(uuid),
  public.admin_update_server(uuid, uuid, text, text), public.admin_update_mass_time(uuid, uuid, timestamptz),
  public.admin_add_mass(uuid, timestamptz, text, integer), public.admin_delete_mass(uuid, uuid) to anon;

notify pgrst, 'reload schema';
commit;
