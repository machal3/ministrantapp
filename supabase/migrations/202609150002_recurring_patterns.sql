-- Run after previous migrations. Existing rules continue to repeat every week.
begin;
alter table public.recurring_rules
  add column if not exists frequency text not null default 'weekly',
  add column if not exists interval_weeks integer not null default 1,
  add column if not exists month_weeks integer[] not null default array[1],
  add column if not exists start_date date,
  add column if not exists end_date date;
alter table public.recurring_rules drop constraint if exists recurring_pattern_valid;
alter table public.recurring_rules add constraint recurring_pattern_valid check (
  frequency in ('weekly', 'monthly') and interval_weeks between 1 and 12
  and cardinality(month_weeks) between 1 and 6
  and month_weeks <@ array[-1,1,2,3,4,5] and array_position(month_weeks, null) is null
  and (start_date is null or end_date is null or end_date >= start_date)
  and (frequency <> 'weekly' or interval_weeks = 1 or start_date is not null)
);
create or replace function public.recurring_rule_matches(r public.recurring_rules, d date)
returns boolean language sql immutable set search_path = '' as $$
  select (r.start_date is null or d >= r.start_date)
    and (r.end_date is null or d <= r.end_date)
    and case when r.frequency = 'monthly' then
      (((extract(day from d)::integer - 1) / 7 + 1) = any(r.month_weeks)
        or (-1 = any(r.month_weeks) and extract(month from d + 7) <> extract(month from d)))
    else r.interval_weeks = 1 or (floor((d - r.start_date)::numeric / 7)::integer % r.interval_weeks = 0)
    end;
$$;
revoke all on function public.recurring_rule_matches(public.recurring_rules, date) from public;
grant execute on function public.recurring_rule_matches(public.recurring_rules, date) to anon;

create or replace view public.effective_attendees with (security_invoker = true) as
with candidates as (
  select m.id as mass_id, r.server_id
  from public.masses m
  join public.recurring_rules r
    on r.day_of_week = extract(dow from m.start_time at time zone 'Europe/Warsaw')::integer
    and r.time_slot = (m.start_time at time zone 'Europe/Warsaw')::time
    and public.recurring_rule_matches(r, (m.start_time at time zone 'Europe/Warsaw')::date)
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
    and public.recurring_rule_matches(r, (m.start_time at time zone 'Europe/Warsaw')::date)
left join public.mass_attendees a on a.mass_id = c.mass_id and a.server_id = c.server_id
where a.type is distinct from 'excused';

commit;
