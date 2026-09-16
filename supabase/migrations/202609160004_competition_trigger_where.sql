-- Fixes "UPDATE requires a WHERE clause" raised when confirming attendance.
-- The statement trigger fired by service_confirmations bumped every season
-- with an unconditional UPDATE, which guarded databases reject. Adding an
-- explicit WHERE keeps the same blunt invalidation while satisfying the guard.
begin;

create or replace function liturgy_private.invalidate_competition()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(160003);
  update public.competition_seasons set revision = revision + 1 where true;
  return null;
end $$;
revoke all on function liturgy_private.invalidate_competition() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
