begin;
alter table public.masses add column if not exists celebrant text;
alter table public.masses add column if not exists liturgy_type text;

create or replace function public.admin_add_event(
  p_token uuid,
  p_start_time timestamptz,
  p_title text,
  p_suggested_spots integer,
  p_category text,
  p_celebrant text default null,
  p_liturgy_type text default null
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform liturgy_private.require_admin(p_token);
  if p_category is null or p_category not in ('mass','devotion','other') then raise exception 'Nieprawidłowa kategoria wydarzenia.'; end if;
  insert into public.masses(start_time,title,suggested_spots,is_extra,category,celebrant,liturgy_type)
  values (p_start_time,btrim(p_title),p_suggested_spots,p_category='devotion',p_category,nullif(btrim(p_celebrant),''),nullif(btrim(p_liturgy_type),''));
end $$;
revoke all on function public.admin_add_event(uuid,timestamptz,text,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_add_event(uuid,timestamptz,text,integer,text,text,text) to anon;

create or replace function public.admin_add_pattern_events(
  p_token uuid,
  p_title text,
  p_suggested_spots integer,
  p_is_extra boolean,
  p_days integer[],
  p_time time,
  p_start_date date,
  p_end_date date,
  p_frequency text,
  p_interval_weeks integer,
  p_interval_months integer,
  p_month_weeks integer[],
  p_category text,
  p_celebrant text default null,
  p_liturgy_type text default null
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  curr_date date;
  curr_ts timestamptz;
  added_count integer := 0;
  v_series_id uuid := gen_random_uuid();
begin
  perform liturgy_private.require_admin(p_token);
  if p_category is null or p_category not in ('mass','devotion','other') then raise exception 'Nieprawidłowa kategoria wydarzenia.'; end if;

  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'Wpisz nazwę.';
  end if;
  if p_suggested_spots < 1 then
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

  if p_frequency is null or p_frequency not in ('weekly','monthly')
    or p_interval_weeks is null or p_interval_weeks not between 1 and 12
    or p_interval_months is null or p_interval_months not between 1 and 12
    or not (p_days <@ array[0,1,2,3,4,5,6]) or array_position(p_days,null) is not null then
    raise exception 'Nieprawidłowy rytm powtarzania.';
  end if;
  if p_frequency = 'monthly' and (p_month_weeks is null or cardinality(p_month_weeks) = 0
    or not (p_month_weeks <@ array[-1,1,2,3,4,5]) or array_position(p_month_weeks,null) is not null) then
    raise exception 'Wybierz wystąpienia dni w miesiącu.';
  end if;
  if p_time >= time '24:00' then raise exception 'Nieprawidłowa godzina.'; end if;
  curr_date := p_start_date;
  while curr_date <= p_end_date loop
    if extract(dow from curr_date)::integer = any(p_days) and (
      (p_frequency = 'weekly' and ((curr_date - p_start_date) / 7) % p_interval_weeks = 0)
      or (p_frequency = 'monthly'
        and ((extract(year from curr_date)::integer - extract(year from p_start_date)::integer) * 12 + extract(month from curr_date)::integer - extract(month from p_start_date)::integer) % p_interval_months = 0
        and (((extract(day from curr_date)::integer - 1) / 7 + 1) = any(p_month_weeks)
          or (-1 = any(p_month_weeks) and extract(month from curr_date + 7) <> extract(month from curr_date))))
    ) then
      curr_ts := (curr_date + p_time) at time zone 'Europe/Warsaw';
      if curr_ts at time zone 'Europe/Warsaw' <> curr_date + p_time then
        raise exception 'Wybrana godzina nie istnieje w jednym z terminów (zmiana czasu). Zmień godzinę lub zakres dat.';
      end if;
      insert into public.masses (start_time, title, suggested_spots, is_extra, series_id, category, celebrant, liturgy_type)
      values (curr_ts, btrim(p_title), p_suggested_spots, p_category = 'devotion', v_series_id, p_category, nullif(btrim(p_celebrant),''), nullif(btrim(p_liturgy_type),''));
      added_count := added_count + 1;
    end if;
    curr_date := curr_date + 1;
  end loop;

  if added_count = 0 then raise exception 'Brak pasujących terminów w wybranym okresie.'; end if;
  return added_count;
end $$;
revoke all on function public.admin_add_pattern_events(uuid,text,integer,boolean,integer[],time,date,date,text,integer,integer,integer[],text,text,text) from public,anon,authenticated;
grant execute on function public.admin_add_pattern_events(uuid,text,integer,boolean,integer[],time,date,date,text,integer,integer,integer[],text,text,text) to anon;

create or replace function public.admin_update_event(
  p_token uuid,
  p_id uuid,
  p_scope text,
  p_title text,
  p_time time,
  p_suggested_spots integer,
  p_is_extra boolean,
  p_category text,
  p_celebrant text default null,
  p_liturgy_type text default null
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  target_mass public.masses%rowtype;
  target_time time;
  target_dow integer;
  updated_count integer := 0;
begin
  perform liturgy_private.require_admin(p_token);
  if p_category is null or p_category not in ('mass','devotion','other') then raise exception 'Nieprawidłowa kategoria wydarzenia.'; end if;

  select * into target_mass from public.masses where id = p_id;
  if not found then raise exception 'Nie znaleziono terminu do edycji.'; end if;

  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'Wpisz nazwę.';
  end if;
  if p_suggested_spots < 1 then
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
        category = p_category, is_extra = (p_category = 'devotion'),
        celebrant = nullif(btrim(p_celebrant),''),
        liturgy_type = nullif(btrim(p_liturgy_type),''),
        start_time = ((start_time at time zone 'Europe/Warsaw')::date + p_time) at time zone 'Europe/Warsaw'
    where id = p_id;
    return 1;
  else
    if target_mass.series_id is not null then
      update public.masses
      set title = btrim(p_title),
          suggested_spots = p_suggested_spots,
          category = p_category, is_extra = (p_category = 'devotion'),
          celebrant = nullif(btrim(p_celebrant),''),
          liturgy_type = nullif(btrim(p_liturgy_type),''),
          start_time = ((start_time at time zone 'Europe/Warsaw')::date + p_time) at time zone 'Europe/Warsaw'
      where series_id = target_mass.series_id
        and start_time >= target_mass.start_time;
      get diagnostics updated_count = row_count;
      return updated_count;
    else
      target_time := (target_mass.start_time at time zone 'Europe/Warsaw')::time;
      target_dow := extract(dow from target_mass.start_time at time zone 'Europe/Warsaw')::integer;
      update public.masses
      set title = btrim(p_title),
          suggested_spots = p_suggested_spots,
          category = p_category, is_extra = (p_category = 'devotion'),
          celebrant = nullif(btrim(p_celebrant),''),
          liturgy_type = nullif(btrim(p_liturgy_type),''),
          start_time = ((start_time at time zone 'Europe/Warsaw')::date + p_time) at time zone 'Europe/Warsaw'
      where start_time >= target_mass.start_time
        and title = target_mass.title
        and (start_time at time zone 'Europe/Warsaw')::time = target_time;
      get diagnostics updated_count = row_count;
      return updated_count;
    end if;
  end if;
end $$;
revoke all on function public.admin_update_event(uuid,uuid,text,text,time,integer,boolean,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_update_event(uuid,uuid,text,text,time,integer,boolean,text,text,text) to anon;
commit;
