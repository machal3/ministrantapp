begin;

insert into public.altar_servers (id, name, rank) values
  ('00000000-0000-4000-8000-000000000001', 'Jan Kowalski', 'Lektor'),
  ('00000000-0000-4000-8000-000000000002', 'Piotr Nowak', 'Ceremoniarz'),
  ('00000000-0000-4000-8000-000000000003', 'Antoni Wiśniewski', 'Ministrant'),
  ('00000000-0000-4000-8000-000000000004', 'Jakub Wójcik', 'Ministrant'),
  ('00000000-0000-4000-8000-000000000005', 'Michał Kamiński', 'Szafarz'),
  ('00000000-0000-4000-8000-000000000006', 'Franciszek Zieliński', 'Kandydat')
on conflict (id) do nothing;

insert into public.recurring_rules (server_id, day_of_week, time_slot) values
  ('00000000-0000-4000-8000-000000000001', 0, '10:30'),
  ('00000000-0000-4000-8000-000000000002', 0, '10:30'),
  ('00000000-0000-4000-8000-000000000003', 0, '10:30'),
  ('00000000-0000-4000-8000-000000000004', 0, '10:30'),
  ('00000000-0000-4000-8000-000000000005', 0, '10:30'),
  ('00000000-0000-4000-8000-000000000001', 1, '18:00'),
  ('00000000-0000-4000-8000-000000000002', 1, '18:00'),
  ('00000000-0000-4000-8000-000000000003', 3, '18:00'),
  ('00000000-0000-4000-8000-000000000006', 5, '18:00')
on conflict (server_id, day_of_week, time_slot) do nothing;

-- Only the current Warsaw week. No eight-week materialization or recurring signups.
with days as (
  select date_trunc('week', now() at time zone 'Europe/Warsaw')::date + n as day
  from generate_series(0, 6) n
), slots as (
  select day, slot
  from days
  cross join lateral unnest(
    case when extract(dow from day) = 0
      then array[time '08:00', time '10:30', time '12:00', time '18:00']
      else array[time '07:00', time '18:00'] end
  ) as slot
)
insert into public.masses (id, start_time, title, suggested_spots, is_extra)
select md5('liturgy-seed-' || day::text || '-' || slot::text)::uuid,
  (day + slot) at time zone 'Europe/Warsaw', 'Msza Święta', 4, false
from slots
on conflict (id) do nothing;

commit;
