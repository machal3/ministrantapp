-- Run once in the Supabase SQL Editor as the database owner, after 202609140002_recurring_masses.sql.
-- Safe to rerun: keeps existing sessions, users, masses and signups.
begin;

-- 1. Drop old constraint first so we can assign 'Ministrant' without violating the old constraint
alter table public.altar_servers
  drop constraint if exists altar_servers_rank_check;

-- 2. Map existing legacy ranks if any exist in the database
update public.altar_servers
set rank = 'Ministrant'
where rank not in ('Kandydat', 'Ministrant', 'Lektor', 'Ceremoniarz', 'Szafarz');

-- 3. Apply updated check constraint with the 5 ranks
alter table public.altar_servers
  add constraint altar_servers_rank_check
  check (rank in ('Kandydat', 'Ministrant', 'Lektor', 'Ceremoniarz', 'Szafarz'));

-- RPC: admin_add_server
create or replace function public.admin_add_server(p_token uuid, p_name text, p_rank text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
begin
  perform liturgy_private.require_admin(p_token);
  if p_name is null or length(btrim(p_name)) = 0 or length(btrim(p_name)) > 100 then
    raise exception 'Wpisz imię i nazwisko (1-100 znaków).';
  end if;
  if p_rank not in ('Kandydat', 'Ministrant', 'Lektor', 'Ceremoniarz', 'Szafarz') then
    raise exception 'Nieprawidłowy stopień liturgiczny.';
  end if;
  insert into public.altar_servers (name, rank)
  values (btrim(p_name), p_rank)
  returning id into new_id;
  return new_id;
end $$;

-- RPC: admin_delete_server
create or replace function public.admin_delete_server(p_token uuid, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform liturgy_private.require_admin(p_token);
  delete from public.altar_servers where id = p_id;
  if not found then raise exception 'Ten ministrant już nie istnieje.'; end if;
end $$;

revoke all on function public.admin_add_server(uuid, text, text),
  public.admin_delete_server(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.admin_add_server(uuid, text, text),
  public.admin_delete_server(uuid, uuid)
  to anon;

notify pgrst, 'reload schema';
commit;
