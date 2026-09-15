-- Run after earlier migrations. Keeps the configured PIN and existing sessions.
begin;

create or replace function public.admin_login(p_pin text)
returns table(token uuid, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare config liturgy_private.admin_config%rowtype; session_token uuid; expiry timestamptz;
begin
  select * into strict config from liturgy_private.admin_config where id;
  if p_pin is null or p_pin !~ '^[0-9]{4}$'
    or sha256(convert_to(config.salt || ':' || p_pin, 'UTF8')) <> config.pin_hash then
    return;
  end if;
  delete from liturgy_private.admin_sessions s where s.expires_at <= now();
  session_token := gen_random_uuid();
  expiry := now() + interval '30 minutes';
  insert into liturgy_private.admin_sessions values (sha256(convert_to(session_token::text, 'UTF8')), expiry);
  return query select session_token, expiry;
end $$;

revoke all on function public.admin_login(text) from public, anon, authenticated;
grant execute on function public.admin_login(text) to anon;

commit;
