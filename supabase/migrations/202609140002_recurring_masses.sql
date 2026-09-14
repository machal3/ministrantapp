-- Run once in the Supabase SQL Editor as the database owner, after 202609140001_admin.sql.
-- Safe to rerun: keeps existing sessions, users, masses and signups.
begin;

create or replace function public.admin_delete_mass(p_token uuid, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform liturgy_private.require_admin(p_token);
  delete from public.masses where id = p_id;
  if not found then raise exception 'Nie znaleziono nabożeństwa do usunięcia.'; end if;
end $$;

create or replace function public.admin_delete_future_masses(p_token uuid, p_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  target_mass public.masses%rowtype;
  target_time time;
  target_dow integer;
  deleted_count integer;
begin
  perform liturgy_private.require_admin(p_token);
  select * into target_mass from public.masses where id = p_id;
  if not found then raise exception 'Nie znaleziono nabożeństwa do usunięcia.'; end if;

  target_time := (target_mass.start_time at time zone 'Europe/Warsaw')::time;
  target_dow := extract(dow from target_mass.start_time at time zone 'Europe/Warsaw')::integer;

  delete from public.masses
  where start_time >= target_mass.start_time
    and extract(dow from start_time at time zone 'Europe/Warsaw')::integer = target_dow
    and (start_time at time zone 'Europe/Warsaw')::time = target_time
    and title = target_mass.title;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end $$;

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
begin
  perform liturgy_private.require_admin(p_token);
  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'Wpisz nazwę nabożeństwa.';
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
      insert into public.masses (start_time, title, suggested_spots, is_extra)
      values (curr_ts, btrim(p_title), p_suggested_spots, coalesce(p_is_extra, false));
      added_count := added_count + 1;
    end if;
    curr_date := curr_date + 1;
  end loop;

  return added_count;
end $$;

revoke all on function public.admin_delete_mass(uuid, uuid),
  public.admin_delete_future_masses(uuid, uuid),
  public.admin_add_recurring_masses(uuid, text, integer, boolean, integer[], time, date, date)
  from public, anon, authenticated;

grant execute on function public.admin_delete_mass(uuid, uuid),
  public.admin_delete_future_masses(uuid, uuid),
  public.admin_add_recurring_masses(uuid, text, integer, boolean, integer[], time, date, date)
  to anon;

notify pgrst, 'reload schema';
commit;
