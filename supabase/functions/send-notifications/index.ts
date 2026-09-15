import { createClient } from 'npm:@supabase/supabase-js@2.57.0';
import webpush from 'npm:web-push@3.6.7';

const required = (key: string) => { const value = Deno.env.get(key); if (!value) throw new Error(`Missing ${key}`); return value; };
const allowedEndpoint = (endpoint: string) => {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && (
      url.hostname === 'fcm.googleapis.com' || /^[a-z0-9-]+\.push\.services\.mozilla\.com$/.test(url.hostname) || /^[a-z0-9-]+\.push\.apple\.com$/.test(url.hostname) || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname)
    );
  } catch { return false; }
};
Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', {status:405});
  const secret = Deno.env.get('PUSH_CRON_SECRET');
  if (!secret || request.headers.get('x-cron-secret') !== secret) return new Response('Unauthorized', {status:401});
  try {
    const db = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {auth:{persistSession:false}});
    webpush.setVapidDetails(required('VAPID_SUBJECT'), required('VAPID_PUBLIC_KEY'), required('VAPID_PRIVATE_KEY'));
    const {data, error} = await db.rpc('claim_push_notifications');
    if (error) throw error;
    let sent=0,failed=0;
    // Bounded concurrency keeps the job short and avoids flooding push services.
    const jobs = [...(data ?? [])];
    await Promise.all(Array.from({length:10}, async () => {
      while (jobs.length) {
        const job = jobs.shift(); if (!job) break;
        let result = 'failed';
        try {
          if (!allowedEndpoint(job.endpoint)) { result='expired'; throw new Error('Unsupported endpoint'); }
          const time = new Intl.DateTimeFormat('pl-PL',{timeZone:'Europe/Warsaw',hour:'2-digit',minute:'2-digit'}).format(new Date(job.start_time));
          const day = new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(job.start_time));
          const payload = {
            title: job.kind === 'own' ? 'Przypomnienie o Twojej służbie' : job.kind === 'empty_mass' ? 'Msza bez zapisanych osób' : 'Nabożeństwo bez zapisanych osób',
            body: `${job.title} o ${time}. ${job.kind === 'own' ? 'Zbliża się Twój termin.' : 'Sprawdź grafik — może możesz pomóc?'}`,
            url: `/?day=${day}#grafik`, tag: `${job.mass_id}-${job.kind}-${job.start_time}`,
          };
          const ttl = Math.max(0,Math.min(1800,Math.floor((Date.parse(job.start_time)-Date.now())/1000)));
          if (ttl === 0) { result='sent'; } else {
            await webpush.sendNotification({endpoint:job.endpoint,keys:{p256dh:job.p256dh,auth:job.auth}},JSON.stringify(payload),{TTL:ttl,urgency:'high',timeout:5000});
            result='sent'; sent++;
          }
        } catch (cause) {
          const status=(cause as {statusCode?:number}).statusCode;
          if (status===404 || status===410) result='expired';
          failed++;
        }
        const {error: ackError}=await db.rpc('finish_push_notification',{p_id:job.delivery_id,p_lease:job.lease_token,p_result:result});
        if (ackError) throw ackError;
      }
    }));
    return Response.json({sent,failed});
  } catch { return Response.json({error:'Notification dispatch failed'}, {status:500}); }
});
