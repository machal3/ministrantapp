begin;
-- Przy edycji serii nazwa, godzina i miejsca idą z zakresem.
-- Okazja i celebrans: p_liturgy_scope / p_celebrant_scope = 'series' albo tylko wybrany termin ('single', domyślnie).
drop function if exists public.admin_update_event(uuid,uuid,text,text,time,integer,boolean,text,text,text);
drop function if exists public.admin_update_event(uuid,uuid,text,text,time,integer,boolean,text,text,text,text);
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
  p_liturgy_type text default null,
  p_liturgy_scope text default 'single',
  p_celebrant_scope text default 'single'
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  target_mass public.masses%rowtype;
  target_time time;
  target_dow integer;
  updated_count integer := 0;
  v_scope text;
  v_liturgy_scope text;
  v_celebrant_scope text;
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

  if p_scope = 'future' then v_scope := 'future_time';
  else v_scope := p_scope;
  end if;
  if v_scope not in ('single', 'future_time', 'future_day_time') then
    raise exception 'Nieprawidłowy zakres edycji.';
  end if;

  if p_liturgy_scope is null then v_liturgy_scope := 'single';
  else v_liturgy_scope := p_liturgy_scope;
  end if;
  if v_liturgy_scope not in ('single', 'series') then
    raise exception 'Nieprawidłowy zakres okazji.';
  end if;

  if p_celebrant_scope is null then v_celebrant_scope := 'single';
  else v_celebrant_scope := p_celebrant_scope;
  end if;
  if v_celebrant_scope not in ('single', 'series') then
    raise exception 'Nieprawidłowy zakres celebransa.';
  end if;
  if v_scope = 'single' then
    v_liturgy_scope := 'single';
    v_celebrant_scope := 'single';
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
  end if;

  target_time := (target_mass.start_time at time zone 'Europe/Warsaw')::time;
  target_dow := extract(dow from target_mass.start_time at time zone 'Europe/Warsaw')::integer;
  if v_scope = 'future_day_time' then
    update public.masses
    set title = btrim(p_title),
        suggested_spots = p_suggested_spots,
        category = p_category, is_extra = (p_category = 'devotion'),
        celebrant = case when v_celebrant_scope = 'series' then nullif(btrim(p_celebrant),'') else celebrant end,
        liturgy_type = case when v_liturgy_scope = 'series' then nullif(btrim(p_liturgy_type),'') else liturgy_type end,
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
        celebrant = case when v_celebrant_scope = 'series' then nullif(btrim(p_celebrant),'') else celebrant end,
        liturgy_type = case when v_liturgy_scope = 'series' then nullif(btrim(p_liturgy_type),'') else liturgy_type end,
        start_time = ((start_time at time zone 'Europe/Warsaw')::date + p_time) at time zone 'Europe/Warsaw'
    where start_time >= target_mass.start_time
      and title = target_mass.title
      and (start_time at time zone 'Europe/Warsaw')::time = target_time;
  end if;
  get diagnostics updated_count = row_count;
  if updated_count = 0 then raise exception 'Nie znaleziono przyszłych terminów do edycji.'; end if;
  update public.masses
  set celebrant = nullif(btrim(p_celebrant),''),
      liturgy_type = nullif(btrim(p_liturgy_type),'')
  where id = p_id;
  return updated_count;
end $$;
revoke all on function public.admin_update_event(uuid,uuid,text,text,time,integer,boolean,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_update_event(uuid,uuid,text,text,time,integer,boolean,text,text,text,text,text) to anon;

notify pgrst, 'reload schema';
commit;
