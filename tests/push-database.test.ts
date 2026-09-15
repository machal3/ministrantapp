// @vitest-environment node
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('registers a private device subscription and queues its reminder only once', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
    const directory = new URL('../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
      await db.exec(await readFile(new URL(name, directory), 'utf8'));
    }
    // Reapplying the notification migration must preserve existing installations.
    await db.exec(await readFile(new URL('202609150008_push_notifications.sql', directory), 'utf8'));
    await db.exec(`insert into public.masses(id,title,start_time,is_extra,category)
      values ('20000000-0000-4000-8000-000000000001','Test',now()+interval '31 minutes',false,'mass');
      set role anon;`);
    await db.query('select public.save_push_subscription($1,$2,$3,$4,null,false,true,false)', [
      '80000000-0000-4000-8000-000000000001', 'https://fcm.googleapis.com/test', 'a'.repeat(87), 'b'.repeat(22),
    ]);
    const preferences = await db.query<{ prefs: { empty_mass: boolean } }>(
      "select public.get_push_preferences('80000000-0000-4000-8000-000000000001') as prefs");
    expect(preferences.rows[0].prefs.empty_mass).toBe(true);
    await expect(db.query('select * from liturgy_private.push_subscriptions')).rejects.toThrow('permission denied');
    await db.exec('reset role; set role service_role;');
    expect((await db.query('select * from public.claim_push_notifications()')).rows).toHaveLength(0);
    await db.exec(`reset role;
      update public.masses set start_time=now()+interval '30 minutes'
      where id='20000000-0000-4000-8000-000000000001';
      set role service_role;`);
    const jobs = await db.query<{ delivery_id: string; lease_token: string; kind: string }>('select * from public.claim_push_notifications()');
    expect(jobs.rows).toHaveLength(1);
    expect(jobs.rows[0].kind).toBe('empty_mass');
    expect((await db.query('select * from public.claim_push_notifications()')).rows).toHaveLength(0);
    await db.query("select public.finish_push_notification($1,$2,'sent')", [jobs.rows[0].delivery_id, jobs.rows[0].lease_token]);
    expect((await db.query('select * from public.claim_push_notifications()')).rows).toHaveLength(0);
  } finally {
    await db.close();
  }
}, 20000);
