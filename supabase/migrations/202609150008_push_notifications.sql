begin;
create table if not exists liturgy_private.push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 token_hash bytea not null unique,
 endpoint text not null unique,
 p256dh text not null,
 auth text not null,
 server_id uuid references public.altar_servers(id) on delete cascade,
 own boolean not null default false,
 empty_mass boolean not null default false,
 empty_devotion boolean not null default false,
 updated_at timestamptz not null default now()
);
create table if not exists liturgy_private.push_deliveries (
 id uuid primary key default gen_random_uuid(),
 subscription_id uuid not null references liturgy_private.push_subscriptions(id) on delete cascade,
 mass_id uuid not null references public.masses(id) on delete cascade,
 start_time timestamptz not null,
 kind text not null check(kind in ('own','empty_mass','empty_devotion')),
 attempts integer not null default 1,
 lease uuid not null default gen_random_uuid(),
 lease_until timestamptz not null default now()+interval '2 minutes',
 sent_at timestamptz,
 constraint push_delivery_once unique(subscription_id,mass_id,start_time,kind)
);
revoke all on liturgy_private.push_subscriptions,liturgy_private.push_deliveries from public,anon,authenticated;
alter table liturgy_private.push_subscriptions enable row level security;
alter table liturgy_private.push_deliveries enable row level security;
create or replace function public.save_push_subscription(p_token uuid,p_endpoint text,p_p256dh text,p_auth text,p_server uuid,p_own boolean,p_empty_mass boolean,p_empty_devotion boolean)
returns void language plpgsql security definer set search_path='' as $$
declare token_digest bytea;
begin
 if p_token is null or p_endpoint is null or length(p_endpoint)>2048
   or p_endpoint !~ '^https://(fcm\.googleapis\.com|[a-zA-Z0-9-]+\.push\.services\.mozilla\.com|[a-zA-Z0-9-]+\.push\.apple\.com|[a-zA-Z0-9-]+\.notify\.windows\.com)/[^[:space:]]+$'
   or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{87}=?$'
   or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{22}(==)?$'
   or p_own is null or p_empty_mass is null or p_empty_devotion is null
 then raise exception 'Nieprawidłowa subskrypcja powiadomień.'; end if;
 if p_own and p_server is null then raise exception 'Wybierz ministranta.'; end if;
 token_digest := sha256(convert_to(p_token::text,'UTF8'));
 -- Endpoints cannot be claimed by another device token.
 if exists(select 1 from liturgy_private.push_subscriptions where endpoint=p_endpoint and token_hash<>token_digest) then
   raise exception 'Subskrypcja należy do innego urządzenia.';
 end if;
 insert into liturgy_private.push_subscriptions(token_hash,endpoint,p256dh,auth,server_id,own,empty_mass,empty_devotion)
 values(token_digest,p_endpoint,p_p256dh,p_auth,p_server,p_own,p_empty_mass,p_empty_devotion)
 on conflict(token_hash) do update set endpoint=excluded.endpoint,p256dh=excluded.p256dh,auth=excluded.auth,server_id=excluded.server_id,own=excluded.own,empty_mass=excluded.empty_mass,empty_devotion=excluded.empty_devotion,updated_at=now();
end $$;
create or replace function public.get_push_preferences(p_token uuid)
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('server_id',server_id,'own',own,'empty_mass',empty_mass,'empty_devotion',empty_devotion)
 from liturgy_private.push_subscriptions where token_hash=sha256(convert_to(p_token::text,'UTF8'));
$$;
create or replace function public.remove_push_subscription(p_token uuid)
returns void language sql security definer set search_path='' as $$
 delete from liturgy_private.push_subscriptions where token_hash=sha256(convert_to(p_token::text,'UTF8'));
$$;
revoke all on function public.save_push_subscription(uuid,text,text,text,uuid,boolean,boolean,boolean),public.get_push_preferences(uuid),public.remove_push_subscription(uuid) from public,anon,authenticated;
grant execute on function public.save_push_subscription(uuid,text,text,text,uuid,boolean,boolean,boolean),public.get_push_preferences(uuid),public.remove_push_subscription(uuid) to anon;

create or replace function public.claim_push_notifications()
returns table(delivery_id uuid,lease_token uuid,endpoint text,p256dh text,auth text,mass_id uuid,title text,start_time timestamptz,kind text)
language plpgsql security definer set search_path='' as $$
begin
 delete from liturgy_private.push_deliveries d where d.start_time<now()-interval '7 days';
 return query
 with upcoming as (
   select m.*,coalesce(m.category,case when m.is_extra then 'devotion' else 'mass' end) as event_category
   from public.masses m where m.start_time>now() and m.start_time<=now()+interval '30 minutes'
 ), candidates as (
   select s.id as subscription_id,m.id as event_id,m.start_time as event_time,
     case when s.own and exists(select 1 from public.effective_attendees a where a.mass_id=m.id and a.server_id=s.server_id) then 'own'
       when s.empty_mass and m.event_category='mass' and not exists(select 1 from public.effective_attendees a where a.mass_id=m.id) then 'empty_mass'
       when s.empty_devotion and m.event_category='devotion' and not exists(select 1 from public.effective_attendees a where a.mass_id=m.id) then 'empty_devotion'
     end as notification_kind
   from upcoming m cross join liturgy_private.push_subscriptions s
   where s.own or s.empty_mass or s.empty_devotion
 ), eligible as (
   select c.* from candidates c left join liturgy_private.push_deliveries d
     on d.subscription_id=c.subscription_id and d.mass_id=c.event_id and d.start_time=c.event_time and d.kind=c.notification_kind
   where c.notification_kind is not null and (d.id is null or (d.sent_at is null and d.attempts<3 and d.lease_until<now()))
   order by c.event_time,c.subscription_id limit 100
 ), claimed as (
   insert into liturgy_private.push_deliveries as d(subscription_id,mass_id,start_time,kind)
   select e.subscription_id,e.event_id,e.event_time,e.notification_kind from eligible e
   on conflict on constraint push_delivery_once do update set attempts=d.attempts+1,lease=gen_random_uuid(),lease_until=now()+interval '2 minutes'
   where d.sent_at is null and d.attempts<3 and d.lease_until<now()
   returning d.*
 )
 select d.id,d.lease,s.endpoint,s.p256dh,s.auth,m.id,m.title,m.start_time,d.kind
 from claimed d join liturgy_private.push_subscriptions s on s.id=d.subscription_id join public.masses m on m.id=d.mass_id;
end $$;
create or replace function public.finish_push_notification(p_id uuid,p_lease uuid,p_result text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_result='expired' then
   delete from liturgy_private.push_subscriptions s using liturgy_private.push_deliveries d where d.id=p_id and d.lease=p_lease and s.id=d.subscription_id;
 elsif p_result='sent' then
   update liturgy_private.push_deliveries set sent_at=now() where id=p_id and lease=p_lease;
 elsif p_result='failed' then
   update liturgy_private.push_deliveries set lease_until=now()+interval '2 minutes' where id=p_id and lease=p_lease;
 else raise exception 'Nieprawidłowy wynik.'; end if;
end $$;
revoke all on function public.claim_push_notifications(),public.finish_push_notification(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_push_notifications(),public.finish_push_notification(uuid,uuid,text) to service_role;
commit;
