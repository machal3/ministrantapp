-- Permanently removes the retired module's subscriptions and delivery history.
-- Does not remove altar servers, events, attendance, or administrator sessions.
begin;
do $$
declare job record;
begin
 if to_regclass('cron.job') is not null then
   for job in execute 'select jobid from cron.job where jobname in (''liturgy-push-every-minute'',''liturgy-push-every-30-minutes'')' loop
     perform cron.unschedule(job.jobid);
   end loop;
 end if;
 if to_regclass('vault.secrets') is not null then
   execute 'delete from vault.secrets where name in (''push_function_url'',''push_cron_secret'')';
 end if;
end $$;

drop function if exists public.admin_queue_push_broadcast(uuid,uuid,text,text);
drop function if exists public.claim_push_broadcasts();
drop function if exists public.finish_push_broadcast(uuid,uuid,text);
drop function if exists public.save_push_subscription(uuid,text,text,text,uuid,boolean,boolean,boolean);
drop function if exists public.get_push_preferences(uuid);
drop function if exists public.remove_push_subscription(uuid);
drop function if exists public.claim_push_notifications();
drop function if exists public.finish_push_notification(uuid,uuid,text);
drop table if exists liturgy_private.push_broadcast_deliveries;
drop table if exists liturgy_private.push_broadcasts;
drop table if exists liturgy_private.push_deliveries;
drop table if exists liturgy_private.push_subscriptions;
notify pgrst, 'reload schema';
commit;
