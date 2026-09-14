// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let db: PGlite;
const server = '10000000-0000-4000-8000-000000000001';
const mass1 = '20000000-0000-4000-8000-000000000001';
const mass2 = '20000000-0000-4000-8000-000000000002';

beforeAll(async () => {
  db = new PGlite();
  await db.exec('create role anon; create role authenticated;');
  const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  await db.exec(schema);
  await db.exec(schema);
  const admin = await readFile(new URL('../supabase/migrations/202609140001_admin.sql', import.meta.url), 'utf8');
  await db.exec(admin);
  await db.exec(admin);
  const recurring = await readFile(new URL('../supabase/migrations/202609140002_recurring_masses.sql', import.meta.url), 'utf8');
  await db.exec(recurring);
  await db.exec(recurring);
});
afterAll(async () => { await db?.close(); });

describe.sequential('PostgreSQL model with actual RLS and SQL view', () => {
  it('supports anonymous attendance and joins recurring rules without materializing rows', async () => {
    await db.query('insert into altar_servers (id, name, rank) values ($1, $2, $3)', [server, 'Jan Testowy', 'Lektor']);
    await db.query("insert into recurring_rules (server_id, day_of_week, time_slot) values ($1, 0, '10:30')", [server]);
    await db.query("insert into masses (id, start_time, suggested_spots) values ($1, '2026-03-22 10:30 Europe/Warsaw', 1), ($2, '2026-03-29 10:30 Europe/Warsaw', 1)", [mass1, mass2]);
    await db.exec('set role anon;');
    const effective = await db.query('select * from effective_attendees order by mass_id');
    expect(effective.rows).toHaveLength(2);
    expect((await db.query('select * from mass_attendees')).rows).toHaveLength(0);
  });
  it('upserts an absence, preserves the next date across DST, and restores attendance', async () => {
    await db.query("insert into mass_attendees (mass_id, server_id, type) values ($1, $2, 'single')", [mass1, server]);
    expect((await db.query('select * from effective_attendees')).rows).toHaveLength(2);
    await db.query("insert into mass_attendees (mass_id, server_id, type) values ($1, $2, 'excused') on conflict (mass_id, server_id) do update set type = excluded.type", [mass1, server]);
    expect((await db.query<{ mass_id: string }>('select * from effective_attendees')).rows.map(r => r.mass_id)).toEqual([mass2]);
    await db.query('delete from mass_attendees where mass_id = $1 and server_id = $2', [mass1, server]);
    expect((await db.query('select * from effective_attendees')).rows).toHaveLength(2);
  });
  it('does not enforce a capacity cap and cascades instance deletion without removing the rule', async () => {
    const second = '10000000-0000-4000-8000-000000000002';
    await db.exec('reset role;');
    await db.query("insert into altar_servers (id, name, rank) values ($1, 'Piotr Testowy', 'Kandydat')", [second]);
    await db.exec('set role anon;');
    await db.query("insert into mass_attendees (mass_id, server_id, type) values ($1, $2, 'single')", [mass1, second]);
    expect((await db.query('select * from effective_attendees where mass_id = $1', [mass1])).rows).toHaveLength(2);
    await db.exec('reset role;');
    await db.query('delete from masses where id = $1', [mass1]);
    await db.exec('set role anon;');
    expect((await db.query('select * from mass_attendees')).rows).toHaveLength(0);
    expect((await db.query('select * from recurring_rules')).rows).toHaveLength(1);
  });
  it('validates ranks, weekdays, positive suggested spots and uniqueness', async () => {
    await db.exec('reset role;');
    await expect(db.exec("insert into altar_servers (name, rank) values ('X', 'Nieznany')")).rejects.toThrow();
    await expect(db.query("insert into recurring_rules (server_id, day_of_week, time_slot) values ($1, 7, '10:30')", [server])).rejects.toThrow();
    await expect(db.query("insert into recurring_rules (server_id, day_of_week, time_slot) values ($1, 0, '10:30')", [server])).rejects.toThrow();
    await expect(db.exec("insert into masses (start_time, suggested_spots) values (now(), 0)")).rejects.toThrow();
    await db.exec('set role anon;');
  });

  it('rejects direct management writes, private reads and forged admin sessions', async () => {
    await expect(db.query("update altar_servers set name = 'Nieuprawniony' where id = $1", [server])).rejects.toThrow('permission denied');
    await expect(db.exec('delete from altar_servers')).rejects.toThrow('permission denied');
    await expect(db.exec("insert into masses (start_time) values (now())")).rejects.toThrow('permission denied');
    await expect(db.exec('update masses set start_time = now()')).rejects.toThrow('permission denied');
    await expect(db.exec('delete from masses')).rejects.toThrow('permission denied');
    await expect(db.exec('select * from liturgy_private.admin_config')).rejects.toThrow('permission denied');
    await expect(db.query("select admin_update_server(null, $1, 'Nieuprawniony', 'Lektor')", [server])).rejects.toThrow('Sesja administratora');
    await expect(db.query("select admin_update_mass_time(gen_random_uuid(), $1, now())", [mass2])).rejects.toThrow('Sesja administratora');
  });

  it('verifies PIN including leading zero and edits without losing single attendance', async () => {
    expect((await db.query("select * from admin_login('403')")).rows).toHaveLength(0);
    const { rows } = await db.query<{ token: string }>("select * from admin_login('0403')");
    expect(rows).toHaveLength(1);
    const token = rows[0].token;
    const second = '10000000-0000-4000-8000-000000000002';
    await db.query("insert into mass_attendees (mass_id, server_id, type) values ($1, $2, 'single')", [mass2, second]);
    await db.query("select admin_update_server($1, $2, '  Piotr Zmieniony  ', 'Ceremoniarz')", [token, second]);
    await db.query("select admin_update_mass_time($1, $2, '2026-03-29 12:00 Europe/Warsaw')", [token, mass2]);
    const attendees = await db.query<{ server_id: string; name: string; rank: string }>('select * from effective_attendees where mass_id = $1', [mass2]);
    expect(attendees.rows).toHaveLength(1);
    expect(attendees.rows[0]).toMatchObject({ server_id: second, name: 'Piotr Zmieniony', rank: 'Ceremoniarz' });
    expect((await db.query('select * from recurring_rules where server_id = $1', [server])).rows).toHaveLength(1);
    await db.query('select admin_logout($1)', [token]);
    await expect(db.query("select admin_update_mass_time($1, $2, '2026-03-29 10:30 Europe/Warsaw')", [token, mass2])).rejects.toThrow('Sesja administratora');
  });

  it('enforces expiry and preserves failure counters for shared PIN throttling', async () => {
    const { rows } = await db.query<{ token: string }>("select * from admin_login('0403')");
    await db.exec("reset role; update liturgy_private.admin_sessions set expires_at = now() - interval '1 second'; set role anon;");
    await expect(db.query("select admin_update_server($1, $2, 'Jan', 'Lektor')", [rows[0].token, server])).rejects.toThrow('Sesja administratora');
    for (let i = 0; i < 5; i++) expect((await db.query("select * from admin_login('9999')")).rows).toHaveLength(0);
    expect((await db.query("select * from admin_login('0403')")).rows).toHaveLength(0);
    await db.exec("reset role; update liturgy_private.admin_config set window_start = now() - interval '11 minutes'; set role anon;");
    expect((await db.query("select * from admin_login('0403')")).rows).toHaveLength(1);
  });

  it('requires a session to add/delete masses and manages recurring series', async () => {
    await expect(db.exec("select admin_add_mass(null, now(), 'Dodatkowa', 4)")).rejects.toThrow('Sesja administratora');
    const { rows } = await db.query<{ token: string }>("select * from admin_login('0403')");
    const token = rows[0].token;
    await db.query("select admin_add_mass($1, '2026-04-01 18:00 Europe/Warsaw', 'Dodatkowa', 4)", [token]);
    const masses = await db.query<{ id: string }>("select id from masses where title = 'Dodatkowa'");
    expect(masses.rows).toHaveLength(1);
    await db.query('select admin_delete_mass($1, $2)', [token, masses.rows[0].id]);
    expect((await db.query("select id from masses where title = 'Dodatkowa'")).rows).toHaveLength(0);

    // Test recurring series: Mondays (1) and Wednesdays (3) from 2026-05-04 to 2026-05-17 -> 4 masses
    const addedRes = await db.query<{ admin_add_recurring_masses: number }>(
      "select admin_add_recurring_masses($1, 'Msza Wieczorna', 4, false, array[1, 3], time '18:00', date '2026-05-04', date '2026-05-17')",
      [token]
    );
    expect(addedRes.rows[0].admin_add_recurring_masses).toBe(4);

    const recurringMasses = await db.query<{ id: string; start_time: string }>(
      "select id, start_time from masses where title = 'Msza Wieczorna' order by start_time"
    );
    expect(recurringMasses.rows).toHaveLength(4);

    // Delete future masses starting from the second Monday (index 2: 2026-05-11 18:00)
    const secondMonday = recurringMasses.rows[2];
    const delRes = await db.query<{ admin_delete_future_masses: number }>(
      "select admin_delete_future_masses($1, $2)",
      [token, secondMonday.id]
    );
    expect(delRes.rows[0].admin_delete_future_masses).toBe(1);

    await db.exec("reset role; delete from masses where title = 'Msza Wieczorna'; set role anon;");
  });
  it('seeds six ranks and only the current week idempotently', async () => {
    await db.exec('reset role; truncate altar_servers, masses cascade;');
    const seed = await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8');
    await db.exec(seed);
    await db.exec(seed);
    expect((await db.query('select distinct rank from altar_servers')).rows).toHaveLength(6);
    expect((await db.query('select * from masses')).rows).toHaveLength(16);
    expect((await db.query('select * from mass_attendees')).rows).toHaveLength(0);
    expect((await db.query("select * from masses where date_trunc('week', start_time at time zone 'Europe/Warsaw') <> date_trunc('week', now() at time zone 'Europe/Warsaw')")).rows).toHaveLength(0);
  });
});
