-- Run once after deploying send-notifications and creating Vault secrets:
-- push_function_url = https://YOUR_PROJECT.supabase.co/functions/v1/send-notifications
-- push_cron_secret = the same random secret configured as PUSH_CRON_SECRET on the function.
-- Create these in Supabase Dashboard > Integrations > Vault; never put them in VITE_*.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$ begin
 if not exists(select 1 from vault.decrypted_secrets where name='push_function_url')
 or not exists(select 1 from vault.decrypted_secrets where name='push_cron_secret') then
   raise exception 'Create push_function_url and push_cron_secret in Vault first.';
 end if;
end $$;
select cron.schedule('liturgy-push-every-minute','* * * * *', $job$
 select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name='push_function_url'),
   headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='push_cron_secret')),
   body := '{}'::jsonb,
   timeout_milliseconds := 60000
 );
$job$);
