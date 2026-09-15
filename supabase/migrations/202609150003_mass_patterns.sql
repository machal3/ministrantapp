-- Regular Masses and devotions with weekly and monthly patterns.
begin;
create or replace function public.admin_add_pattern_masses(
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
  p_month_weeks integer[]
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
      insert into public.masses (start_time, title, suggested_spots, is_extra, series_id)
      values (curr_ts, btrim(p_title), p_suggested_spots, coalesce(p_is_extra, false), v_series_id);
      added_count := added_count + 1;
    end if;
    curr_date := curr_date + 1;
  end loop;

  if added_count = 0 then raise exception 'Brak pasujących terminów w wybranym okresie.'; end if;
  return added_count;
end $$;

revoke all on function public.admin_add_pattern_masses(uuid,text,integer,boolean,integer[],time,date,date,text,integer,integer,integer[]) from public, anon, authenticated;
grant execute on function public.admin_add_pattern_masses(uuid,text,integer,boolean,integer[],time,date,date,text,integer,integer,integer[]) to anon;
commit;
