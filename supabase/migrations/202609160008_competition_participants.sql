begin;

create table if not exists public.competition_participants (
  server_id uuid primary key references public.altar_servers(id) on delete cascade,
  joined_at timestamptz not null default now()
);

alter table public.competition_participants enable row level security;
revoke all on public.competition_participants from public, anon, authenticated;
grant select, insert, delete on public.competition_participants to anon;
drop policy if exists anon_all on public.competition_participants;
create policy anon_all on public.competition_participants for all to anon using (true) with check (true);

drop trigger if exists competition_participant_changed on public.competition_participants;
create trigger competition_participant_changed after insert or delete on public.competition_participants
for each statement execute function liturgy_private.invalidate_competition();

create or replace function public.join_competition(p_server_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.competition_participants(server_id) values(p_server_id) on conflict do nothing;
  insert into public.service_confirmations(mass_id, server_id, attended)
  select m.id, p_server_id, true
  from public.masses m
  join public.effective_attendees a on a.mass_id = m.id and a.server_id = p_server_id
  where m.start_time <= now() - interval '1 hour'
    and not exists (
      select 1 from public.service_confirmations c
      where c.mass_id = m.id and c.server_id = p_server_id
    )
  on conflict (mass_id, server_id) do nothing;

  insert into public.mass_attendees(mass_id, server_id, type)
  select m.id, p_server_id, 'single'
  from public.masses m
  join public.effective_attendees a on a.mass_id = m.id and a.server_id = p_server_id
  where m.start_time <= now() - interval '1 hour'
  on conflict (mass_id, server_id) do nothing;
end $$;

create or replace function public.leave_competition(p_server_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.competition_participants where server_id = p_server_id;
end $$;

revoke all on function public.join_competition(uuid), public.leave_competition(uuid) from public, anon, authenticated;
grant execute on function public.join_competition(uuid), public.leave_competition(uuid) to anon;

do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='competition_participants') then
      alter publication supabase_realtime add table public.competition_participants;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
