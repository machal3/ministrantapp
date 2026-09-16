-- Confirming absence no longer rewrites declarations. The roster
-- (effective_attendees) stays intact; only service_confirmations records
-- whether the person was actually there, and the schedule card renders
-- presence badges from it. Attending still materializes a single entry so a
-- retroactive claim without a prior declaration joins the roster and a
-- confirmed presence survives later changes of recurring rules.
-- Safe to rerun.
begin;

create or replace function public.confirm_service(p_server_id uuid, p_mass_id uuid, p_attended boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.masses%rowtype; existing boolean; has_answer boolean; s date; declared boolean;
begin
  perform pg_advisory_xact_lock(160003);
  if p_attended is null then raise exception 'Wybierz odpowiedź o obecności.'; end if;
  select attended into existing from public.service_confirmations where mass_id=p_mass_id and server_id=p_server_id;
  has_answer := found;
  select * into m from public.masses where id=p_mass_id for share;
  if not found or m.start_time > now() - interval '1 hour' then raise exception 'Służbę można potwierdzić godzinę po jej rozpoczęciu.'; end if;
  declared := exists(select 1 from public.effective_attendees where mass_id=p_mass_id and server_id=p_server_id);
  if has_answer then
    if existing=p_attended then return; end if;
    -- Correcting an earlier answer keeps a single durable record.
    -- An absence never touches declarations; a presence materializes one.
    update public.service_confirmations set attended=p_attended, confirmed_at=now() where mass_id=p_mass_id and server_id=p_server_id;
    if p_attended then
      insert into public.mass_attendees(mass_id,server_id,type)
      values(p_mass_id,p_server_id,'single')
      on conflict(mass_id,server_id) do update set type=excluded.type;
    end if;
    return;
  end if;
  if not p_attended and not declared then raise exception 'Nie masz zapisu na tę służbę. Odśwież listę.'; end if;
  s := liturgy_private.competition_season((m.start_time at time zone 'Europe/Warsaw')::date);
  insert into public.competition_seasons(season) values(s) on conflict do nothing;
  insert into public.service_confirmations(mass_id,server_id,attended) values(p_mass_id,p_server_id,p_attended);
  -- Materialize a presence so later changes of recurring rules do not erase it.
  if p_attended then
    insert into public.mass_attendees(mass_id,server_id,type)
    values(p_mass_id,p_server_id,'single')
    on conflict(mass_id,server_id) do update set type=excluded.type;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
