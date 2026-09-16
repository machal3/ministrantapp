begin;
-- Edycja serii: „wszystkie przyszłe o tej godzinie" oraz „wszystkie przyszłe w tym dniu tygodnia o tej godzinie".
-- Dopasowanie jest globalne (tytuł + godzina ściany Europe/Warsaw [+ dzień tygodnia]), niezależnie od series_id,
-- dzięki czemu obejmuje też terminy spoza pierwotnej serii i naprawia прежni zakres 'future'.
-- Starszy 'future' traktujemy jak 'future_time' dla zgodności wstecz.
-- Okazja (liturgy_type) idzie z zakresem serii; celebrans zmienia się tylko w wybranym terminie.
-- suggested_spots może być NULL (bez określonej liczby osób).
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
  v_scope text;
begin
  perform liturgy_private.require_admin(p_token);
  if p_category is null or p_category not in ('mass','devotion','other') then raise exception 'Nieprawidłowa kategoria wydarzenia.'; end if;

  select * into target_mass from public.masses where id = p_id;
  if not found then raise exception 'Nie znaleziono terminu do edycji.'; end if;

  if p_title is null or length(btrim(p_title)) = 0 then
    raise exception 'Wpisz nazwę.';
  end if;
  if p_suggested_spots is not null and p_suggested_spots < 1 then
    raise exception 'Sugerowana liczba miejsc musi być dodatnią liczbą całkowitą.';
  end if;
  if p_time is null or extract(second from p_time) <> 0 then
    raise exception 'Podaj prawidłową godzinę z dokładnością do minuty.';
  end if;

  -- Zgodność wstecz: stary UI wysyłał 'future' = wszystkie przyszłe o tej godzinie.
  if p_scope = 'future' then v_scope := 'future_time';
  else v_scope := p_scope;
  end if;
  if v_scope not in ('single', 'future_time', 'future_day_time') then
    raise exception 'Nieprawidłowy zakres edycji.';
  end if;

  if v_scope = 'single' then
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
    target_time := (target_mass.start_time at time zone 'Europe/Warsaw')::time;
    target_dow := extract(dow from target_mass.start_time at time zone 'Europe/Warsaw')::integer;
    if v_scope = 'future_day_time' then
      update public.masses
      set title = btrim(p_title),
          suggested_spots = p_suggested_spots,
          category = p_category, is_extra = (p_category = 'devotion'),
          liturgy_type = nullif(btrim(p_liturgy_type),''),
          start_time = ((start_time at time zone 'Europe/Warsaw')::date + p_time) at time zone 'Europe/Warsaw'
      where start_time >= target_mass.start_time
        and title = target_mass.title
        and (start_time at time zone 'Europe/Warsaw')::time = target_time
        and extract(dow from start_time at time zone 'Europe/Warsaw')::integer = target_dow;
    else
      update public.masses
      set title = btrim(p_title),
          suggested_spots = p_suggested_spots,
          category = p_category, is_extra = (p_category = 'devotion'),
          liturgy_type = nullif(btrim(p_liturgy_type),''),
          start_time = ((start_time at time zone 'Europe/Warsaw')::date + p_time) at time zone 'Europe/Warsaw'
      where start_time >= target_mass.start_time
        and title = target_mass.title
        and (start_time at time zone 'Europe/Warsaw')::time = target_time;
    end if;
    get diagnostics updated_count = row_count;
    if updated_count = 0 then raise exception 'Nie znaleziono przyszłych terminów do edycji.'; end if;
    update public.masses set celebrant = nullif(btrim(p_celebrant),'') where id = p_id;
    return updated_count;
  end if;
end $$;
revoke all on function public.admin_update_event(uuid,uuid,text,text,time,integer,boolean,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_update_event(uuid,uuid,text,text,time,integer,boolean,text,text,text) to anon;

-- Utrzymaj starszą sygnaturę admin_update_mass (bez kategorii), aby nie rozbić wdrożeń
-- korzystających jeszcze ze starego frontendu: mapujemy ją na nowe zakresy.
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
  v_scope text;
begin
  perform liturgy_private.require_admin(p_token);
  select * into target_mass from public.masses where id = p_id;
  if not found then raise exception 'Nie znaleziono terminu do edycji.'; end if;
  if p_title is null or length(btrim(p_title)) = 0 then raise exception 'Wpisz nazwę.'; end if;
  if p_suggested_spots is not null and p_suggested_spots < 1 then
    raise exception 'Sugerowana liczba miejsc musi być dodatnią liczbą całkowitą.';
  end if;
  if p_time is null or extract(second from p_time) <> 0 then raise exception 'Podaj prawidłową godzinę z dokładnością do minuty.'; end if;
  if p_scope = 'future' then v_scope := 'future_time';
  else v_scope := p_scope;
  end if;
  if v_scope not in ('single', 'future_time', 'future_day_time') then raise exception 'Nieprawidłowy zakres edycji.'; end if;
  if v_scope = 'single' then
    update public.masses
    set title = btrim(p_title),
        suggested_spots = p_suggested_spots,
        is_extra = coalesce(p_is_extra, false),
        start_time = ((start_time at time zone 'Europe/Warsaw')::date + p_time) at time zone 'Europe/Warsaw'
    where id = p_id;
    return 1;
  else
    target_time := (target_mass.start_time at time zone 'Europe/Warsaw')::time;
    target_dow := extract(dow from target_mass.start_time at time zone 'Europe/Warsaw')::integer;
    if v_scope = 'future_day_time' then
      update public.masses
      set title = btrim(p_title),
          suggested_spots = p_suggested_spots,
          is_extra = coalesce(p_is_extra, false),
          start_time = ((start_time at time zone 'Europe/Warsaw')::date + p_time) at time zone 'Europe/Warsaw'
      where start_time >= target_mass.start_time
        and title = target_mass.title
        and (start_time at time zone 'Europe/Warsaw')::time = target_time
        and extract(dow from start_time at time zone 'Europe/Warsaw')::integer = target_dow;
    else
      update public.masses
      set title = btrim(p_title),
          suggested_spots = p_suggested_spots,
          is_extra = coalesce(p_is_extra, false),
          start_time = ((start_time at time zone 'Europe/Warsaw')::date + p_time) at time zone 'Europe/Warsaw'
      where start_time >= target_mass.start_time
        and title = target_mass.title
        and (start_time at time zone 'Europe/Warsaw')::time = target_time;
    end if;
    get diagnostics updated_count = row_count;
    if updated_count = 0 then raise exception 'Nie znaleziono przyszłych terminów do edycji.'; end if;
    return updated_count;
  end if;
end $$;
revoke all on function public.admin_update_mass(uuid, uuid, text, text, time, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_update_mass(uuid, uuid, text, text, time, integer, boolean)
  to anon;

notify pgrst, 'reload schema';
commit;
