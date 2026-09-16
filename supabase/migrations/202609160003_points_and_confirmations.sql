-- Apply after the existing migrations. Keeps schedules, attendance and admin PINs.
begin;

create table if not exists public.service_confirmations (
  mass_id uuid not null references public.masses(id) on delete cascade,
  server_id uuid not null references public.altar_servers(id) on delete cascade,
  attended boolean not null,
  confirmed_at timestamptz not null default now(),
  primary key (mass_id, server_id)
);
create index if not exists service_confirmations_server_idx on public.service_confirmations(server_id);
create table if not exists public.competition_seasons (
  season date primary key,
  reset_at timestamptz,
  reset_revision bigint not null default 0,
  revision bigint not null default 0
);
create table if not exists public.point_adjustments (
  id uuid primary key default gen_random_uuid(),
  season date not null references public.competition_seasons(season),
  server_id uuid not null references public.altar_servers(id) on delete cascade,
  delta integer not null,
  mode text not null check (mode in ('add','subtract','set')),
  reason text not null default '' check (length(reason) <= 240),
  created_at timestamptz not null default now(),
  revision bigint not null
);
create index if not exists point_adjustments_season_idx on public.point_adjustments(season, server_id);

alter table public.service_confirmations enable row level security;
alter table public.competition_seasons enable row level security;
alter table public.point_adjustments enable row level security;
revoke all on public.service_confirmations, public.competition_seasons, public.point_adjustments from public, anon, authenticated;
grant select on public.service_confirmations, public.competition_seasons, public.point_adjustments to anon;
drop policy if exists anon_read on public.service_confirmations;
create policy anon_read on public.service_confirmations for select to anon using (true);
drop policy if exists anon_read on public.competition_seasons;
create policy anon_read on public.competition_seasons for select to anon using (true);
drop policy if exists anon_read on public.point_adjustments;
create policy anon_read on public.point_adjustments for select to anon using (true);

create or replace function liturgy_private.competition_season(p_day date)
returns date language plpgsql immutable set search_path = '' as $$
declare y integer := extract(year from p_day); d date;
begin
  d := make_date(y,11,27);
  d := d + ((7-extract(dow from d)::integer)%7);
  if p_day < d then
    d := make_date(y-1,11,27);
    d := d + ((7-extract(dow from d)::integer)%7);
  end if;
  return d;
end $$;
revoke all on function liturgy_private.competition_season(date) from public, anon, authenticated;

-- Serializes confirmations, score edits and resets. Historical Mass edits also
-- invalidate an administrator's displayed total before an absolute score edit.
create or replace function liturgy_private.invalidate_competition()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(160003);
  update public.competition_seasons set revision = revision + 1 where true;
  return null;
end $$;
revoke all on function liturgy_private.invalidate_competition() from public, anon, authenticated;
drop trigger if exists competition_mass_changed on public.masses;
create trigger competition_mass_changed before update or delete on public.masses
for each statement execute function liturgy_private.invalidate_competition();
drop trigger if exists competition_confirmation_changed on public.service_confirmations;
create trigger competition_confirmation_changed after insert or update or delete on public.service_confirmations
for each statement execute function liturgy_private.invalidate_competition();

create or replace function public.pending_service_confirmations(p_server_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  with pending as materialized (
    select m.* from public.masses m
    where m.start_time <= now() - interval '1 hour'
      and exists (select 1 from public.effective_attendees a where a.mass_id=m.id and a.server_id=p_server_id)
      and not exists (select 1 from public.service_confirmations c where c.mass_id=m.id and c.server_id=p_server_id)
  )
  select jsonb_build_object('masses', coalesce((select jsonb_agg(to_jsonb(batch)) from
    (select * from pending order by start_time, id limit 50) batch), '[]'::jsonb), 'total', (select count(*) from pending));
$$;

create or replace function public.confirm_service(p_server_id uuid, p_mass_id uuid, p_attended boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.masses%rowtype; existing boolean; s date;
begin
  perform pg_advisory_xact_lock(160003);
  if p_attended is null then raise exception 'Wybierz odpowiedź o obecności.'; end if;
  select attended into existing from public.service_confirmations where mass_id=p_mass_id and server_id=p_server_id;
  if found then
    if existing=p_attended then return; end if;
    raise exception 'Ta służba została już potwierdzona na innym urządzeniu. Odśwież listę.';
  end if;
  select * into m from public.masses where id=p_mass_id for share;
  if not found or m.start_time > now() - interval '1 hour' then raise exception 'Służbę można potwierdzić godzinę po jej rozpoczęciu.'; end if;
  if not exists(select 1 from public.effective_attendees where mass_id=p_mass_id and server_id=p_server_id) then
    raise exception 'Nie masz już zapisu na tę służbę. Odśwież listę.';
  end if;
  s := liturgy_private.competition_season((m.start_time at time zone 'Europe/Warsaw')::date);
  insert into public.competition_seasons(season) values(s) on conflict do nothing;
  insert into public.service_confirmations(mass_id,server_id,attended) values(p_mass_id,p_server_id,p_attended);
  -- Materialize the answer so later changes of recurring rules do not erase it.
  insert into public.mass_attendees(mass_id,server_id,type)
  values(p_mass_id,p_server_id,case when p_attended then 'single' else 'excused' end)
  on conflict(mass_id,server_id) do update set type=excluded.type;
end $$;

create or replace function public.admin_adjust_points(p_token uuid, p_server_id uuid, p_season date,
  p_mode text, p_value integer, p_current_points integer, p_revision bigint, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.competition_seasons%rowtype; target integer; difference integer;
begin
  perform liturgy_private.require_admin(p_token);
  perform pg_advisory_xact_lock(160003);
  if p_season is distinct from liturgy_private.competition_season((now() at time zone 'Europe/Warsaw')::date) then raise exception 'Sezon się zmienił. Odśwież wyniki.'; end if;
  if p_mode is null or p_mode not in ('add','subtract','set') or p_value is null or p_value < 0 or p_value > 1000000 or p_current_points is null or abs(p_current_points::bigint)>10000000 then raise exception 'Podaj poprawną liczbę punktów (0–1000000).'; end if;
  if p_reason is null or length(p_reason)>240 then raise exception 'Opis może mieć do 240 znaków.'; end if;
  insert into public.competition_seasons(season) values(p_season) on conflict do nothing;
  select * into s from public.competition_seasons where season=p_season for update;
  if s.revision is distinct from p_revision then raise exception 'Wyniki zmieniły się na innym urządzeniu. Odśwież i spróbuj ponownie.'; end if;
  target := case p_mode when 'set' then p_value when 'add' then greatest(0,p_current_points)+p_value else greatest(0,p_current_points)-p_value end;
  if target<0 or target>1000000 then raise exception 'Wynik musi wynosić od 0 do 1000000 punktów.'; end if;
  difference := target-p_current_points;
  -- p_current_points is a trusted admin snapshot, protected by the revision.
  update public.competition_seasons set revision=revision+1 where season=p_season returning * into s;
  insert into public.point_adjustments(season,server_id,delta,mode,reason,revision)
  values(p_season,p_server_id,difference,p_mode,btrim(p_reason),s.revision);
end $$;

create or replace function public.admin_reset_points(p_token uuid, p_season date, p_revision bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.competition_seasons%rowtype;
begin
  perform liturgy_private.require_admin(p_token);
  perform pg_advisory_xact_lock(160003);
  if p_season is distinct from liturgy_private.competition_season((now() at time zone 'Europe/Warsaw')::date) then raise exception 'Sezon się zmienił. Odśwież wyniki.'; end if;
  insert into public.competition_seasons(season) values(p_season) on conflict do nothing;
  select * into s from public.competition_seasons where season=p_season for update;
  if s.revision is distinct from p_revision then raise exception 'Wyniki zmieniły się. Odśwież przed resetem.'; end if;
  update public.competition_seasons set reset_at=clock_timestamp(), revision=revision+1, reset_revision=revision+1 where season=p_season;
end $$;

revoke all on function public.pending_service_confirmations(uuid), public.confirm_service(uuid,uuid,boolean),
  public.admin_adjust_points(uuid,uuid,date,text,integer,integer,bigint,text), public.admin_reset_points(uuid,date,bigint) from public, anon, authenticated;
grant execute on function public.pending_service_confirmations(uuid), public.confirm_service(uuid,uuid,boolean),
  public.admin_adjust_points(uuid,uuid,date,text,integer,integer,bigint,text), public.admin_reset_points(uuid,date,bigint) to anon;

do $$
declare t text;
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array['service_confirmations','competition_seasons','point_adjustments'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
        execute format('alter publication supabase_realtime add table public.%I',t);
      end if;
    end loop;
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
