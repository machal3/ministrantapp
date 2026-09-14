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
  await db.exec('create role anon;');
  const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  await db.exec(schema);
  await db.exec(schema);
});
afterAll(async () => { await db?.close(); });

describe.sequential('PostgreSQL model with actual RLS and SQL view', () => {
  it('supports anonymous CRUD and joins recurring attendance without materializing rows', async () => {
    await db.exec('set role anon;');
    await db.query('insert into altar_servers (id, name, rank) values ($1, $2, $3)', [server, 'Jan Testowy', 'Lektor']);
    await db.query("insert into recurring_rules (server_id, day_of_week, time_slot) values ($1, 0, '10:30')", [server]);
    await db.query("insert into masses (id, start_time, suggested_spots) values ($1, '2026-03-22 10:30 Europe/Warsaw', 1), ($2, '2026-03-29 10:30 Europe/Warsaw', 1)", [mass1, mass2]);
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
    await db.query("insert into altar_servers (id, name, rank) values ($1, 'Piotr Testowy', 'Kandydat')", [second]);
    await db.query("insert into mass_attendees (mass_id, server_id, type) values ($1, $2, 'single')", [mass1, second]);
    expect((await db.query('select * from effective_attendees where mass_id = $1', [mass1])).rows).toHaveLength(2);
    await db.query('delete from masses where id = $1', [mass1]);
    expect((await db.query('select * from mass_attendees')).rows).toHaveLength(0);
    expect((await db.query('select * from recurring_rules')).rows).toHaveLength(1);
  });
  it('validates ranks, weekdays, positive suggested spots and uniqueness', async () => {
    await expect(db.exec("insert into altar_servers (name, rank) values ('X', 'Nieznany')")).rejects.toThrow();
    await expect(db.query("insert into recurring_rules (server_id, day_of_week, time_slot) values ($1, 7, '10:30')", [server])).rejects.toThrow();
    await expect(db.query("insert into recurring_rules (server_id, day_of_week, time_slot) values ($1, 0, '10:30')", [server])).rejects.toThrow();
    await expect(db.exec("insert into masses (start_time, suggested_spots) values (now(), 0)")).rejects.toThrow();
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
