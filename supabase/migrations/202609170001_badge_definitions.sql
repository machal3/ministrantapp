-- Odznaki edytowalne przez administratora (v1: cel = liczba służb w sezonie).
-- Apply after the existing migrations. Safe to rerun: keeps existing definitions.
-- Przyszłe warunki (poranne Msze, niedziele, serie) dojdą jako kolejne kolumny/rodzaje.
begin;

create table if not exists public.badge_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  description text not null default '' check (length(description) <= 240),
  icon text not null default 'medal' check (icon in ('sunrise', 'star', 'flame', 'calendar', 'medal', 'heart')),
  points integer not null default 10 check (points between 0 and 1000),
  target integer not null default 1 check (target between 1 and 1000)
);

alter table public.badge_definitions enable row level security;
revoke all on public.badge_definitions from public, anon, authenticated;
grant select on public.badge_definitions to anon;
drop policy if exists anon_read on public.badge_definitions;
create policy anon_read on public.badge_definitions for select to anon using (true);

-- Podstawowy zestaw startowy: administrator może go edytować, usunąć lub rozbudować.
insert into public.badge_definitions (id, name, description, icon, points, target)
values
  ('11111111-1111-4111-8111-111111111111', 'Pierwszy krok', 'Zdobądź punkty za pierwszą służbę w sezonie.', 'heart', 10, 1),
  ('22222222-2222-4222-8222-222222222222', 'Pomocna dłoń', 'Podejmij 10 służb w jednym sezonie.', 'medal', 25, 10),
  ('33333333-3333-4333-8333-333333333333', 'Filar wspólnoty', 'Podejmij 50 służb w jednym sezonie.', 'medal', 120, 50)
on conflict (id) do nothing;

create or replace function public.admin_upsert_badge(p_token uuid, p_id uuid, p_name text, p_description text, p_icon text, p_points integer, p_target integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare badge_id uuid;
begin
  perform liturgy_private.require_admin(p_token);
  if p_name is null or length(btrim(p_name)) < 1 or length(btrim(p_name)) > 80 then raise exception 'Wpisz nazwę odznaki.'; end if;
  if p_description is null or length(p_description) > 240 then raise exception 'Opis może mieć do 240 znaków.'; end if;
  if p_icon is null or p_icon not in ('sunrise', 'star', 'flame', 'calendar', 'medal', 'heart') then raise exception 'Wybierz ikonę odznaki.'; end if;
  if p_points is null or p_points < 0 or p_points > 1000 then raise exception 'Nagroda musi wynosić od 0 do 1000 punktów.'; end if;
  if p_target is null or p_target < 1 or p_target > 1000 then raise exception 'Cel musi wynosić od 1 do 1000 służb.'; end if;
  if p_id is null then
    insert into public.badge_definitions (name, description, icon, points, target)
    values (btrim(p_name), btrim(p_description), p_icon, p_points, p_target)
    returning id into badge_id;
  else
    update public.badge_definitions
    set name = btrim(p_name), description = btrim(p_description), icon = p_icon, points = p_points, target = p_target
    where id = p_id
    returning id into badge_id;
    if not found then raise exception 'Ta odznaka już nie istnieje.'; end if;
  end if;
  return badge_id;
end $$;

create or replace function public.admin_delete_badge(p_token uuid, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform liturgy_private.require_admin(p_token);
  delete from public.badge_definitions where id = p_id;
end $$;

create or replace function public.admin_clear_badges(p_token uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform liturgy_private.require_admin(p_token);
  delete from public.badge_definitions;
end $$;

revoke all on function public.admin_upsert_badge(uuid, uuid, text, text, text, integer, integer),
  public.admin_delete_badge(uuid, uuid), public.admin_clear_badges(uuid) from public, anon, authenticated;
grant execute on function public.admin_upsert_badge(uuid, uuid, text, text, text, integer, integer),
  public.admin_delete_badge(uuid, uuid), public.admin_clear_badges(uuid) to anon;

do $$
declare t text;
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array['badge_definitions'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
        execute format('alter publication supabase_realtime add table public.%I',t);
      end if;
    end loop;
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
