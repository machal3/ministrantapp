-- Run once in the Supabase SQL Editor as the database owner, after 202609140003_altar_servers_management.sql.
-- Safe to rerun: keeps existing sessions, users, masses and signups.
begin;

-- 1. Add series_id column to masses table
alter table public.masses
  add column if not exists series_id uuid;

create index if not exists masses_series_id_idx
  on public.masses (series_id);

-- 2. Update admin_add_recurring_masses to assign a shared series_id to all masses in the batch
create or replace function public.admin_add_recurring_masses(
  p_token uuid,
  p_title text,
  p_suggested_spots integer,
  p_is_extra boolean,
  p_days integer[],
  p_time time,
  p_start_date date,
  p_end_date date
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  curr_date date;
  curr_ts timestamptz;
  added_count integer := 0;
  v_series_id uuid := gen_random_uuid();
begin
  perform liturgy_private.require_admin(p_token);
  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'Wpisz nazwę.';
  end if;
  if p_suggested_spots is null or p_suggested_spots < 1 then
    raise exception 'Sugerowana liczba miejsc musi być dodatnią liczbą całkowitą.';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Data końcowa musi być późniejsza lub równa dacie początkowej.';
  end if;
  if p_end_date - p_start_date > 366 then
    raise exception 'Maksymalny okres powtarzania to 1 rok.';
  end if;
  if p_days is null or cardinality(p_days) = 0 then
    raise exception 'Wybierz co najmniej jeden dzień tygodnia.';
  end if;
  if p_time is null or extract(second from p_time) <> 0 then
    raise exception 'Podaj prawidłową godzinę z dokładnością do minuty.';
  end if;

  curr_date := p_start_date;
  while curr_date <= p_end_date loop
    if extract(dow from curr_date)::integer = any(p_days) then
      curr_ts := (curr_date + p_time) at time zone 'Europe/Warsaw';
      insert into public.masses (start_time, title, suggested_spots, is_extra, series_id)
      values (curr_ts, btrim(p_title), p_suggested_spots, coalesce(p_is_extra, false), v_series_id);
      added_count := added_count + 1;
    end if;
    curr_date := curr_date + 1;
  end loop;

  return added_count;
end $$;

-- 3. RPC: admin_update_mass (single instance or entire future series)
create or replace function public.admin_update_mass(
  p_token uuid,
  p_id uuid,
  p_scope text,
  p_title text,
  p_time time,
  p_suggested_spots integer,
  p_is_extra boolean
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  target_mass public.masses%rowtype;
  target_time time;
  target_dow integer;
  updated_count integer := 0;
begin
  perform liturgy_private.require_admin(p_token);
  select * into target_mass from public.masses where id = p_id;
  if not found then raise exception 'Nie znaleziono terminu do edycji.'; end if;

  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'Wpisz nazwę.';
  end if;
  if p_suggested_spots is null or p_suggested_spots < 1 then
    raise exception 'Sugerowana liczba miejsc musi być dodatnią liczbą całkowitą.';
  end if;
  if p_time is null or extract(second from p_time) <> 0 then
    raise exception 'Podaj prawidłową godzinę z dokładnością do minuty.';
  end if;
  if p_scope not in ('single', 'future') then
    raise exception 'Nieprawidłowy zakres edycji.';
  end if;

  if p_scope = 'single' then
    update public.masses
    set title = btrim(p_title),
        suggested_spots = p_suggested_spots,
        is_extra = coalesce(p_is_extra, false),
        start_time = ((start_time at time zone 'Europe/Warsaw')::date + p_time) at time zone 'Europe/Warsaw'
    where id = p_id;
    return 1;
  else
    if target_mass.series_id is not null then
      update public.masses
      set title = btrim(p_title),
          suggested_spots = p_suggested_spots,
          is_extra = coalesce(p_is_extra, false),
          start_time = ((start_time at time zone 'Europe/Warsaw')::date + p_time) at time zone 'Europe/Warsaw'
      where series_id = target_mass.series_id
        and start_time >= target_mass.start_time;
      get diagnostics updated_count = row_count;
      return updated_count;
    else
      -- Fallback for legacy records without series_id: match title, time slot and start_time >= target
      target_time := (target_mass.start_time at time zone 'Europe/Warsaw')::time;
      target_dow := extract(dow from target_mass.start_time at time zone 'Europe/Warsaw')::integer;
      update public.masses
      set title = btrim(p_title),
          suggested_spots = p_suggested_spots,
          is_extra = coalesce(p_is_extra, false),
          start_time = ((start_time at time zone 'Europe/Warsaw')::date + p_time) at time zone 'Europe/Warsaw'
      where start_time >= target_mass.start_time
        and title = target_mass.title
        and (start_time at time zone 'Europe/Warsaw')::time = target_time;
      get diagnostics updated_count = row_count;
      return updated_count;
    end if;
  end if;
end $$;

-- 4. Update admin_delete_future_masses to respect series_id across all days of the series
create or replace function public.admin_delete_future_masses(p_token uuid, p_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  target_mass public.masses%rowtype;
  target_time time;
  target_dow integer;
  deleted_count integer := 0;
begin
  perform liturgy_private.require_admin(p_token);
  select * into target_mass from public.masses where id = p_id;
  if not found then raise exception 'Nie znaleziono terminu do usunięcia.'; end if;

  if target_mass.series_id is not null then
    delete from public.masses
    where series_id = target_mass.series_id
      and start_time >= target_mass.start_time;
    get diagnostics deleted_count = row_count;
    return deleted_count;
  else
    target_time := (target_mass.start_time at time zone 'Europe/Warsaw')::time;
    target_dow := extract(dow from target_mass.start_time at time zone 'Europe/Warsaw')::integer;

    delete from public.masses
    where start_time >= target_mass.start_time
      and extract(dow from start_time at time zone 'Europe/Warsaw')::integer = target_dow
      and (start_time at time zone 'Europe/Warsaw')::time = target_time
      and title = target_mass.title;
    get diagnostics deleted_count = row_count;
    return deleted_count;
  end if;
end $$;

revoke all on function public.admin_update_mass(uuid, uuid, text, text, time, integer, boolean)
  from public, anon, authenticated;

grant execute on function public.admin_update_mass(uuid, uuid, text, text, time, integer, boolean)
  to anon;

notify pgrst, 'reload schema';
commit;
