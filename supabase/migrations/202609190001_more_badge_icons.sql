-- Rozszerzenie listy dostępnych ikon odznak o 12 nowych symboli oraz obsługa rodzajów odznak (kind: total, single_week, streak).
-- Apply after 202609180001_badge_filters.sql. Safe to rerun: keeps existing definitions.
begin;

-- Zaktualizowanie ograniczenia CHECK w tabeli badge_definitions
alter table public.badge_definitions
  drop constraint if exists badge_definitions_icon_check;

alter table public.badge_definitions
  add constraint badge_definitions_icon_check
  check (icon in (
    'sunrise', 'star', 'flame', 'calendar', 'medal', 'heart',
    'trophy', 'crown', 'sparkles', 'bell', 'church', 'book',
    'cross', 'shield', 'zap', 'target', 'award', 'clock'
  ));

-- Zaktualizowanie funkcji RPC admin_upsert_badge z nową listą dozwolonych ikon i rodzajami odznak
create or replace function public.admin_upsert_badge(p_token uuid, p_id uuid, p_name text, p_description text, p_icon text, p_points integer, p_target integer, p_filters jsonb default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare badge_id uuid; f jsonb := coalesce(p_filters, '{}'); v text; d jsonb;
begin
  perform liturgy_private.require_admin(p_token);
  if p_name is null or length(btrim(p_name)) < 1 or length(btrim(p_name)) > 80 then raise exception 'Wpisz nazwę odznaki.'; end if;
  if p_description is null or length(p_description) > 240 then raise exception 'Opis może mieć do 240 znaków.'; end if;
  if p_icon is null or p_icon not in (
    'sunrise', 'star', 'flame', 'calendar', 'medal', 'heart',
    'trophy', 'crown', 'sparkles', 'bell', 'church', 'book',
    'cross', 'shield', 'zap', 'target', 'award', 'clock'
  ) then raise exception 'Wybierz ikonę odznaki.'; end if;
  if p_points is null or p_points < 0 or p_points > 1000 then raise exception 'Nagroda musi wynosić od 0 do 1000 punktów.'; end if;
  if p_target is null or p_target < 1 or p_target > 1000 then raise exception 'Cel musi wynosić od 1 do 1000 służb.'; end if;
  if jsonb_typeof(f) <> 'object' then raise exception 'Nieprawidłowy warunek odznaki.'; end if;
  -- Rodzaj odznaki: suma w sezonie, w jednym tygodniu lub seria.
  if f ? 'kind' and not (f->>'kind' in ('total', 'single_week', 'streak')) then raise exception 'Nieprawidłowy rodzaj odznaki.'; end if;
  -- Dni tygodnia: 0 (niedziela) … 6 (sobota).
  if f ? 'weekdays' then
    if jsonb_typeof(f->'weekdays') <> 'array' or (select count(*) from jsonb_array_elements(f->'weekdays')) = 0 then raise exception 'Wybierz co najmniej jeden dzień tygodnia.'; end if;
    if exists(select 1 from jsonb_array_elements(f->'weekdays') d where jsonb_typeof(d.value) <> 'number' or d.value::int < 0 or d.value::int > 6) then raise exception 'Nieprawidłowy dzień tygodnia.'; end if;
  end if;
  -- Godziny w formacie HH:MM.
  for v in select * from unnest(array['timeFrom', 'timeTo']) loop
    if f ? v and (jsonb_typeof(f->v) <> 'string' or (f->>v) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception 'Podaj prawidłową godzinę w formacie GG:MM.'; end if;
  end loop;
  if f ? 'timeFrom' and f ? 'timeTo' and f->>'timeFrom' = f->>'timeTo' then raise exception 'Godzina „od” i „do” nie mogą być takie same.'; end if;
  -- Konkretne daty RRRR-MM-DD (maks. 366).
  if f ? 'dates' then
    if jsonb_typeof(f->'dates') <> 'array' or (select count(*) from jsonb_array_elements(f->'dates')) = 0 then raise exception 'Dodaj co najmniej jedną datę.'; end if;
    if (select count(*) from jsonb_array_elements(f->'dates')) > 366 then raise exception 'Można wybrać maks. 366 dat.'; end if;
    if exists(select 1 from jsonb_array_elements(f->'dates') d where jsonb_typeof(d.value) <> 'string' or (d.value #>> '{}') !~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$') then raise exception 'Nieprawidłowa data. Użyj formatu RRRR-MM-DD.'; end if;
  end if;
  -- Teksty do wyszukiwania (nazwa, celebrans, okazja, oznaczenie dnia).
  for v in select * from unnest(array['title', 'celebrant', 'occasion']) loop
    if f ? v and (jsonb_typeof(f->v) <> 'string' or length(btrim(f->>v)) < 1 or length(f->>v) > 60) then raise exception 'Tekst wyszukiwania może mieć od 1 do 60 znaków.'; end if;
  end loop;
  if f ? 'dayMarkText' and (jsonb_typeof(f->'dayMarkText') <> 'string' or length(btrim(f->>'dayMarkText')) < 1 or length(f->>'dayMarkText') > 120) then raise exception 'Tekst oznaczenia może mieć od 1 do 120 znaków.'; end if;
  if f ? 'category' and not (f->>'category' in ('mass', 'devotion')) then raise exception 'Nieprawidłowy rodzaj wydarzenia.'; end if;
  if f ? 'dayMark' and not (f->>'dayMark' in ('sunday', 'solemnity', 'feast', 'memorial', 'annotated')) then raise exception 'Nieprawidłowe oznaczenie dnia.'; end if;
  if f ? 'perDay' and jsonb_typeof(f->'perDay') <> 'boolean' then raise exception 'Nieprawidłowa opcja liczenia.'; end if;
  select jsonb_object_agg(key, value) into f from jsonb_each(f)
    where key in ('kind', 'weekdays', 'timeFrom', 'timeTo', 'dates', 'title', 'celebrant', 'occasion', 'category', 'dayMark', 'dayMarkText', 'perDay');
  f := coalesce(f, '{}');
  if p_id is null then
    insert into public.badge_definitions (name, description, icon, points, target, filters)
    values (btrim(p_name), btrim(p_description), p_icon, p_points, p_target, f)
    returning id into badge_id;
  else
    update public.badge_definitions
    set name = btrim(p_name), description = btrim(p_description), icon = p_icon, points = p_points, target = p_target, filters = f
    where id = p_id
    returning id into badge_id;
    if not found then raise exception 'Ta odznaka już nie istnieje.'; end if;
  end if;
  return badge_id;
end $$;

revoke all on function public.admin_upsert_badge(uuid, uuid, text, text, text, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.admin_upsert_badge(uuid, uuid, text, text, text, integer, integer, jsonb) to anon;

notify pgrst, 'reload schema';
commit;
