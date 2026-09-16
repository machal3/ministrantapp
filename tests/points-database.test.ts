// @vitest-environment node
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildCompetition } from '../src/lib/competition';
import type { ScheduleData, PendingConfirmations } from '../src/types/database';

let db: PGlite;
let token: string;
let season: string;
const server = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const mass = '20000000-0000-4000-8000-000000000001';
const absent = '20000000-0000-4000-8000-000000000002';
const future = '20000000-0000-4000-8000-000000000003';

beforeAll(async () => {
  db = new PGlite();
  await db.exec('create role anon; create role authenticated;');
  await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  const dir = new URL('../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(dir)).filter(name => name.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(file, dir), 'utf8'));
  await db.query("insert into altar_servers(id,name,rank) values($1,'Jan Testowy','Lektor'),($2,'Piotr Testowy','Ministrant')", [server, other]);
  await db.query("insert into masses(id,start_time,title,category) values($1,now()-interval '2 hours','Pierwsza','mass'),($2,now()-interval '90 minutes','Druga','mass'),($3,now()+interval '1 hour','Przyszła','mass')", [mass, absent, future]);
  await db.query("insert into mass_attendees(mass_id,server_id,type) values($1,$4,'single'),($2,$4,'single'),($3,$4,'single')", [mass, absent, future, server]);
  season = (await db.query<{ season: string }>("select liturgy_private.competition_season((now() at time zone 'Europe/Warsaw')::date)::text season")).rows[0].season;
  await db.exec('set role anon');
  token = (await db.query<{ token: string }>("select * from admin_login('0403')")).rows[0].token;
});
afterAll(async () => { await db?.close(); });
async function revision() {
  return Number((await db.query<{ revision: number }>('select revision from competition_seasons where season=$1', [season])).rows[0]?.revision ?? 0);
}
async function pending() {
  return (await db.query<{ data: PendingConfirmations }>('select pending_service_confirmations($1) data', [server])).rows[0].data;
}
async function score(id = server) {
  const data: ScheduleData = {
    servers: (await db.query<ScheduleData['servers'][number]>('select * from altar_servers')).rows,
    masses: (await db.query<ScheduleData['masses'][number]>('select * from masses')).rows,
    rules: [], exceptions: [], attendees: [],
    confirmations: (await db.query<NonNullable<ScheduleData['confirmations']>[number]>('select * from service_confirmations')).rows,
    pointAdjustments: (await db.query<NonNullable<ScheduleData['pointAdjustments']>[number]>('select id,season::text,server_id,delta,mode,reason,created_at,revision from point_adjustments')).rows,
    competitionState: (await db.query<NonNullable<ScheduleData['competitionState']>>('select season::text,reset_at,reset_revision,revision from competition_seasons where season=$1', [season])).rows[0],
  };
  // PGlite decodes timestamp columns as Date objects; the REST API returns strings.
  return buildCompetition(JSON.parse(JSON.stringify(data)), new Date()).profiles.find(p => p.server.id === id)!;
}

describe.sequential('persistent confirmations and protected point management', () => {
  it('lists past declarations oldest first, without giving unconfirmed points', async () => {
    expect((await pending()).masses.map(m => m.id)).toEqual([mass, absent]);
    expect((await pending()).total).toBe(2);
    expect((await score()).points).toBe(0);
    await expect(db.query('select confirm_service($1,$2,true)', [server, future])).rejects.toThrow('godzinę');
    await expect(db.query('select confirm_service($1,$2,false)', [other, mass])).rejects.toThrow('zapisu');
  });
  it('persists yes, is idempotent on retries and allows correcting the answer', async () => {
    await db.query('select confirm_service($1,$2,true)', [server, mass]);
    await db.query('select confirm_service($1,$2,true)', [server, mass]);
    expect((await db.query('select * from service_confirmations')).rows).toHaveLength(1);
    expect((await pending()).total).toBe(1);
    expect((await score()).points).toBeGreaterThan(0);
    await db.query('select confirm_service($1,$2,false)', [server, mass]);
    expect((await db.query('select * from service_confirmations')).rows).toHaveLength(1);
    expect((await db.query<{ attended: boolean }>('select attended from service_confirmations where mass_id=$1 and server_id=$2', [mass, server])).rows[0].attended).toBe(false);
    expect((await db.query<{ type: string }>('select type from mass_attendees where mass_id=$1 and server_id=$2', [mass, server])).rows[0].type).toBe('single');
    expect((await db.query('select * from effective_attendees where mass_id=$1 and server_id=$2', [mass, server])).rows).toHaveLength(1);
    expect((await pending()).total).toBe(1);
    expect((await score()).points).toBe(0);
    await db.query('select confirm_service($1,$2,true)', [server, mass]);
    expect((await score()).points).toBeGreaterThan(0);
  });
  it('persists no without touching the declaration and without scoring it', async () => {
    const before = (await score()).points;
    await db.query('select confirm_service($1,$2,false)', [server, absent]);
    expect((await pending()).total).toBe(0);
    expect((await db.query<{ type: string }>('select type from mass_attendees where mass_id=$1', [absent])).rows[0].type).toBe('single');
    expect((await db.query('select * from effective_attendees where mass_id=$1 and server_id=$2', [absent, server])).rows).toHaveLength(1);
    expect((await score()).points).toBe(before);
  });
  it('blocks direct writes, forged and expired sessions', async () => {
    await expect(db.exec('delete from service_confirmations')).rejects.toThrow('permission denied');
    await expect(db.exec('update competition_seasons set revision=0')).rejects.toThrow('permission denied');
    await expect(db.exec("insert into point_adjustments(season,server_id,delta,mode,revision) values(current_date,gen_random_uuid(),1,'add',1)")).rejects.toThrow('permission denied');
    await expect(db.query("select admin_adjust_points(null,$1,$2,'add',10,0,$3,'')", [server, season, await revision()])).rejects.toThrow('Sesja');
    await expect(db.query('select admin_reset_points(gen_random_uuid(),$1,$2)', [season, await revision()])).rejects.toThrow('Sesja');
  });
  it('adds, subtracts and sets an exact score, preserving presence', async () => {
    let current = await score();
    const original = current.points;
    await db.query("select admin_adjust_points($1,$2,$3,'add',40,$4,$5,'Pomoc')", [token, server, season, current.rawPoints, await revision()]);
    current = await score();
    expect(current.points).toBe(original + 40);
    await db.query("select admin_adjust_points($1,$2,$3,'subtract',10,$4,$5,'Korekta')", [token, server, season, current.rawPoints, await revision()]);
    current = await score();
    expect(current.points).toBe(original + 30);
    await db.query("select admin_adjust_points($1,$2,$3,'set',250,$4,$5,'Ustawienie')", [token, server, season, current.rawPoints, await revision()]);
    current = await score();
    expect(current.points).toBe(250);
    expect(current.level.level).toBe(2);
    expect(current.serviceCount).toBe(1);
    expect(current.entries.filter(e => e.id.startsWith('adjustment-'))).toHaveLength(3);
  });
  it('rejects stale revisions, invalid values and the previous season', async () => {
    await expect(db.query("select admin_adjust_points($1,$2,$3,'set',10,250,0,'')", [token, server, season])).rejects.toThrow('zmieniły');
    await expect(db.query("select admin_adjust_points($1,$2,$3,'subtract',251,250,$4,'')", [token, server, season, await revision()])).rejects.toThrow('Wynik');
    await expect(db.query("select admin_adjust_points($1,$2,$3,'set',-1,250,$4,'')", [token, server, season, await revision()])).rejects.toThrow('liczbę');
    await expect(db.query("select admin_reset_points($1,'2020-11-29',$2)", [token, await revision()])).rejects.toThrow('Sezon');
  });
  it('invalidates a point editor when historical event data changes', async () => {
    const oldRevision = await revision();
    await db.exec('reset role');
    await db.query("update masses set title='Zmieniona' where id=$1", [mass]);
    await db.exec('set role anon');
    await expect(db.query("select admin_adjust_points($1,$2,$3,'set',100,250,$4,'')", [token, server, season, oldRevision])).rejects.toThrow('zmieniły');
  });
  it('scores retroactive claims without a declaration and never touches the roster', async () => {
    const retro = '30000000-0000-4000-8000-000000000001';
    await db.exec('reset role');
    await db.query("insert into masses(id,start_time,title,category) values($1,now()-interval '2 hours','Retro','mass')", [retro]);
    await db.exec('set role anon');
    await db.query('select confirm_service($1,$2,true)', [other, retro]);
    expect((await db.query<{ attended: boolean }>('select attended from service_confirmations where mass_id=$1 and server_id=$2', [retro, other])).rows[0].attended).toBe(true);
    expect((await db.query('select * from mass_attendees where mass_id=$1 and server_id=$2', [retro, other])).rows).toHaveLength(0);
    expect((await db.query('select * from effective_attendees where mass_id=$1 and server_id=$2', [retro, other])).rows).toHaveLength(0);
    expect((await score(other)).points).toBeGreaterThan(0);
    await db.query('select confirm_service($1,$2,false)', [other, retro]);
    expect((await db.query('select * from service_confirmations where mass_id=$1 and server_id=$2', [retro, other])).rows).toHaveLength(1);
    expect((await db.query('select * from mass_attendees where mass_id=$1 and server_id=$2', [retro, other])).rows).toHaveLength(0);
    expect((await score(other)).points).toBe(0);
    await db.exec('reset role');
    await db.query('delete from masses where id=$1', [retro]);
    await db.exec('set role anon');
  });
  it('resets points durably, keeping attendance, badges and the adjustment audit', async () => {
    await db.query('select admin_reset_points($1,$2,$3)', [token, season, await revision()]);
    const current = await score();
    expect(current.points).toBe(0);
    expect(current.serviceCount).toBe(1);
    expect(current.badges.find(b => b.id === 'first')!.earned).toBe(true);
    expect((await db.query('select * from point_adjustments')).rows).toHaveLength(3);
    expect((await db.query('select * from service_confirmations')).rows).toHaveLength(2);
    await db.query('select confirm_service($1,$2,true)', [server, mass]);
    expect((await score()).points).toBe(0);
    await db.query("select admin_adjust_points($1,$2,$3,'add',20,0,$4,'Nowy start')", [token, server, season, await revision()]);
    expect((await score()).points).toBe(20);
  });
  it('allows joining and leaving competition, auto-confirming past declared masses upon joining', async () => {
    const testServer = '40000000-0000-4000-8000-000000000001';
    const pastMass = '40000000-0000-4000-8000-000000000002';
    await db.exec('reset role');
    await db.query("insert into altar_servers(id,name,rank) values($1,'Michał Testowy','Ministrant')", [testServer]);
    await db.query("insert into masses(id,start_time,title,category) values($1,now()-interval '3 hours','Przeszła deklaracja','mass')", [pastMass]);
    await db.query("insert into mass_attendees(mass_id,server_id,type) values($1,$2,'single')", [pastMass, testServer]);
    await db.exec('set role anon');

    // Default: not in competition_participants
    expect((await db.query('select * from competition_participants where server_id=$1', [testServer])).rows).toHaveLength(0);
    expect((await db.query('select * from service_confirmations where server_id=$1', [testServer])).rows).toHaveLength(0);

    // Joining competition inserts participant and auto-confirms the past mass as attended
    await db.query('select join_competition($1)', [testServer]);
    expect((await db.query('select * from competition_participants where server_id=$1', [testServer])).rows).toHaveLength(1);
    const confirms = (await db.query<{ attended: boolean }>('select attended from service_confirmations where mass_id=$1 and server_id=$2', [pastMass, testServer])).rows;
    expect(confirms).toHaveLength(1);
    expect(confirms[0].attended).toBe(true);

    // Leaving competition removes from participants
    await db.query('select leave_competition($1)', [testServer]);
    expect((await db.query('select * from competition_participants where server_id=$1', [testServer])).rows).toHaveLength(0);
  });
});

