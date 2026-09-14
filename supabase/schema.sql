begin;

create table if not exists public.altar_servers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  rank text not null check (rank in (
    'Kandydat', 'Ministrant', 'Lektor', 'Ceremoniarz', 'Szafarz'
  ))
);

create table if not exists public.masses (
  id uuid primary key default gen_random_uuid(),
  start_time timestamptz not null,
  title text not null default 'Msza Święta' check (length(btrim(title)) between 1 and 160),
  suggested_spots integer not null default 4 check (suggested_spots > 0),
  is_extra boolean not null default false,
  series_id uuid
);

create table if not exists public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.altar_servers(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  time_slot time not null check (extract(second from time_slot) = 0 and time_slot < time '24:00'),
  unique (server_id, day_of_week, time_slot)
);

create table if not exists public.mass_attendees (
  id uuid primary key default gen_random_uuid(),
  mass_id uuid not null references public.masses(id) on delete cascade,
  server_id uuid not null references public.altar_servers(id) on delete cascade,
  type text not null check (type in ('single', 'excused')),
  unique (mass_id, server_id)
);

create index if not exists masses_start_time_idx on public.masses (start_time);
create index if not exists masses_series_id_idx on public.masses (series_id);
create index if not exists recurring_rules_slot_idx on public.recurring_rules (day_of_week, time_slot);
create index if not exists mass_attendees_server_id_idx on public.mass_attendees (server_id);

-- Warsaw wall time, never the browser/session time zone. Rules remain correct through DST.
-- UNION removes duplicate identities when a single entry overlaps a recurring rule.
-- The final left join gives recurring attendance precedence and excludes excused dates.
create or replace view public.effective_attendees with (security_invoker = true) as
with candidates as (
  select m.id as mass_id, r.server_id
  from public.masses m
  join public.recurring_rules r
    on r.day_of_week = extract(dow from m.start_time at time zone 'Europe/Warsaw')::integer
    and r.time_slot = (m.start_time at time zone 'Europe/Warsaw')::time
  union
  select a.mass_id, a.server_id from public.mass_attendees a where a.type = 'single'
)
select c.mass_id, c.server_id, s.name, s.rank,
  case when r.id is not null then 'recurring'::text else 'single'::text end as attendance_type
from candidates c
join public.masses m on m.id = c.mass_id
join public.altar_servers s on s.id = c.server_id
left join public.recurring_rules r
  on r.server_id = c.server_id
  and r.day_of_week = extract(dow from m.start_time at time zone 'Europe/Warsaw')::integer
  and r.time_slot = (m.start_time at time zone 'Europe/Warsaw')::time
left join public.mass_attendees a on a.mass_id = c.mass_id and a.server_id = c.server_id
where a.type is distinct from 'excused';

grant usage on schema public to anon;
-- Management writes require the admin migration and a server-verified session.
revoke insert, update, delete on public.altar_servers, public.masses from anon;
grant select on public.altar_servers, public.masses to anon;
grant select, insert, update, delete on public.recurring_rules, public.mass_attendees to anon;
grant select on public.effective_attendees to anon;

alter table public.altar_servers enable row level security;
alter table public.masses enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.mass_attendees enable row level security;

drop policy if exists anon_full_access on public.altar_servers;
drop policy if exists anon_read on public.altar_servers;
create policy anon_read on public.altar_servers for select to anon using (true);
drop policy if exists anon_full_access on public.masses;
drop policy if exists anon_read on public.masses;
create policy anon_read on public.masses for select to anon using (true);
drop policy if exists anon_full_access on public.recurring_rules;
create policy anon_full_access on public.recurring_rules for all to anon using (true) with check (true);
drop policy if exists anon_full_access on public.mass_attendees;
create policy anon_full_access on public.mass_attendees for all to anon using (true) with check (true);

alter table public.altar_servers replica identity full;
alter table public.masses replica identity full;
alter table public.recurring_rules replica identity full;
alter table public.mass_attendees replica identity full;

-- Supabase owns this publication. Keep the script usable in vanilla PostgreSQL as well.
do $$
declare table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['altar_servers', 'masses', 'recurring_rules', 'mass_attendees'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;

commit;
