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
  const management = await readFile(new URL('../supabase/migrations/202609140003_altar_servers_management.sql', import.meta.url), 'utf8');
  await db.exec(management);
  await db.exec(management);
  const seriesAndDistinction = await readFile(new URL('../supabase/migrations/202609140004_series_and_mass_distinction.sql', import.meta.url), 'utf8');
  await db.exec(seriesAndDistinction);
  await db.exec(seriesAndDistinction);
  const noLockout = await readFile(new URL('../supabase/migrations/202609150001_admin_login_no_lockout.sql', import.meta.url), 'utf8');
  await db.exec("update liturgy_private.admin_config set failures = 5, window_start = now()");
  await db.exec(noLockout);
  await db.exec(noLockout);
  const patterns = await readFile(new URL('../supabase/migrations/202609150002_recurring_patterns.sql', import.meta.url), 'utf8');
  await db.exec(patterns);
  await db.exec(patterns);
  const massPatterns = await readFile(new URL('../supabase/migrations/202609150003_mass_patterns.sql', import.meta.url), 'utf8');
  await db.exec(massPatterns);
  await db.exec(massPatterns);
  const categories = await readFile(new URL('../supabase/migrations/202609150004_event_categories.sql', import.meta.url), 'utf8');
  await db.exec(categories);
  await db.exec(categories);
  const capacity = await readFile(new URL('../supabase/migrations/202609150005_optional_capacity.sql', import.meta.url), 'utf8');
  await db.exec(capacity);
  await db.exec(capacity);
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

  it('enforces expiry and accepts correct PIN immediately after repeated failures', async () => {
    const { rows } = await db.query<{ token: string }>("select * from admin_login('0403')");
    await db.exec("reset role; update liturgy_private.admin_sessions set expires_at = now() - interval '1 second'; set role anon;");
    await expect(db.query("select admin_update_server($1, $2, 'Jan', 'Lektor')", [rows[0].token, server])).rejects.toThrow('Sesja administratora');
    for (let i = 0; i < 12; i++) expect((await db.query("select * from admin_login('9999')")).rows).toHaveLength(0);
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
    // Deletes both the Monday and the Wednesday of that week since they share the same series_id!
    const secondMonday = recurringMasses.rows[2];
    const delRes = await db.query<{ admin_delete_future_masses: number }>(
      "select admin_delete_future_masses($1, $2)",
      [token, secondMonday.id]
    );
    expect(delRes.rows[0].admin_delete_future_masses).toBe(2);

    await db.exec("reset role; delete from masses where title = 'Msza Wieczorna'; set role anon;");
  });

  it('updates single mass and entire series without removing attendee declarations', async () => {
    const { rows } = await db.query<{ token: string }>("select * from admin_login('0403')");
    const token = rows[0].token;

    // Create a series on Mon (1), Wed (3), Fri (5)
    await db.query(
      "select admin_add_recurring_masses($1, 'Msza Poranna', 4, false, array[1, 3, 5], time '07:00', date '2026-06-01', date '2026-06-07')",
      [token]
    );

    const seriesMasses = await db.query<{ id: string; start_time: string; title: string; series_id: string }>(
      "select id, start_time, title, series_id from masses where title = 'Msza Poranna' order by start_time"
    );
    expect(seriesMasses.rows).toHaveLength(3); // Mon, Wed, Fri
    const firstMass = seriesMasses.rows[0];
    const secondMass = seriesMasses.rows[1];

    // Verify all 3 masses share the exact same series_id
    expect(seriesMasses.rows[0].series_id).toBeTruthy();
    expect(seriesMasses.rows[1].series_id).toBe(seriesMasses.rows[0].series_id);
    expect(seriesMasses.rows[2].series_id).toBe(seriesMasses.rows[0].series_id);

    // Register an altar server for the second mass (Wed)
    await db.query("insert into mass_attendees (mass_id, server_id, type) values ($1, $2, 'single')", [secondMass.id, server]);

    // 1. Single edit on firstMass (Mon): change title to 'Msza Wotywna' and time to 07:30
    const singleUpdateRes = await db.query<{ admin_update_mass: number }>(
      "select admin_update_mass($1, $2, 'single', 'Msza Wotywna', time '07:30', 5, false)",
      [token, firstMass.id]
    );
    expect(singleUpdateRes.rows[0].admin_update_mass).toBe(1);

    const firstCheck = await db.query<{ title: string; start_time: string; suggested_spots: number }>(
      "select title, start_time, suggested_spots from masses where id = $1",
      [firstMass.id]
    );
    expect(firstCheck.rows[0].title).toBe('Msza Wotywna');
    expect(firstCheck.rows[0].suggested_spots).toBe(5);

    // 2. Future series edit starting from secondMass (Wed): change title to 'Msza Wspólna' and time to 08:00
    // Should update Wed and Fri (2 masses), leaving Mon untouched
    const futureUpdateRes = await db.query<{ admin_update_mass: number }>(
      "select admin_update_mass($1, $2, 'future', 'Msza Wspólna', time '08:00', 6, false)",
      [token, secondMass.id]
    );
    expect(futureUpdateRes.rows[0].admin_update_mass).toBe(2);

    const afterFuture = await db.query<{ id: string; title: string; start_time: string }>(
      "select id, title, start_time from masses where series_id = $1 order by start_time",
      [firstMass.series_id]
    );
    expect(afterFuture.rows[0].title).toBe('Msza Wotywna'); // Mon stayed as single edit
    expect(afterFuture.rows[1].title).toBe('Msza Wspólna'); // Wed updated
    expect(afterFuture.rows[2].title).toBe('Msza Wspólna'); // Fri updated

    // Verify attendee declaration is STILL intact on Wed mass
    const attendeeCheck = await db.query(
      "select * from mass_attendees where mass_id = $1 and server_id = $2",
      [secondMass.id, server]
    );
    expect(attendeeCheck.rows).toHaveLength(1);

    await db.exec("reset role; delete from masses where series_id is not null; set role anon;");
  });
  it('adds and deletes altar servers via admin RPCs', async () => {
    const { rows } = await db.query<{ token: string }>("select * from admin_login('0403')");
    const token = rows[0].token;

    const addRes = await db.query<{ admin_add_server: string }>(
      "select admin_add_server($1, 'Nowy Ministrant', 'Szafarz')",
      [token]
    );
    const newId = addRes.rows[0].admin_add_server;
    expect(newId).toBeTruthy();

    const serverCheck = await db.query("select * from altar_servers where id = $1", [newId]);
    expect(serverCheck.rows).toHaveLength(1);
    expect(serverCheck.rows[0]).toMatchObject({ name: 'Nowy Ministrant', rank: 'Szafarz' });

    await db.query("select admin_delete_server($1, $2)", [token, newId]);
    const deletedCheck = await db.query("select * from altar_servers where id = $1", [newId]);
    expect(deletedCheck.rows).toHaveLength(0);
  });

  it('seeds five ranks and only the current week idempotently', async () => {
    await db.exec('reset role; truncate altar_servers, masses cascade;');
    const seed = await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8');
    await db.exec(seed);
    await db.exec(seed);
    expect((await db.query('select distinct rank from altar_servers')).rows).toHaveLength(5);
    expect((await db.query('select * from masses')).rows).toHaveLength(16);
    expect((await db.query('select * from mass_attendees')).rows).toHaveLength(0);
    expect((await db.query("select * from masses where date_trunc('week', start_time at time zone 'Europe/Warsaw') <> date_trunc('week', now() at time zone 'Europe/Warsaw')")).rows).toHaveLength(0);
  });
});

it('applies monthly patterns and intervals in the actual view while retaining single signups and absences', async () => {
  await db.exec('reset role;');
  const { rows: people } = await db.query<{id:string}>("insert into altar_servers(name, rank) values ('Rytm', 'Lektor') returning id");
  const person = people[0].id;
  const { rows: masses } = await db.query<{id:string}>("insert into masses(start_time) values ('2028-02-06 10:30 Europe/Warsaw'), ('2028-02-13 10:30 Europe/Warsaw'), ('2028-02-20 10:30 Europe/Warsaw'), ('2028-02-27 10:30 Europe/Warsaw') returning id");
  await db.exec('set role anon;');
  await db.query("insert into recurring_rules(server_id,day_of_week,time_slot,frequency,month_weeks) values ($1,0,'10:30','monthly',array[1,3,-1])", [person]);
  const actual = async () => (await db.query<{mass_id:string}>('select mass_id from effective_attendees where server_id=$1 and mass_id = any($2::uuid[])', [person, masses.map(m => m.id)])).rows.map(r => r.mass_id).sort();
  expect(await actual()).toEqual([masses[0].id,masses[2].id,masses[3].id].sort());
  await db.query("update recurring_rules set frequency='weekly', interval_weeks=2, start_date='2028-02-06', end_date='2028-02-20' where server_id=$1",[person]);
  expect(await actual()).toEqual([masses[0].id,masses[2].id].sort());
  await db.query("insert into mass_attendees(mass_id,server_id,type) values ($1,$3,'excused'),($2,$3,'single')",[masses[0].id,masses[1].id,person]);
  expect(await actual()).toEqual([masses[1].id,masses[2].id].sort());
  await expect(db.query("update recurring_rules set month_weeks=array[]::integer[] where server_id=$1",[person])).rejects.toThrow();
  await expect(db.query("update recurring_rules set interval_weeks=0 where server_id=$1",[person])).rejects.toThrow();
  await expect(db.query("update recurring_rules set end_date='2028-02-01' where server_id=$1",[person])).rejects.toThrow();
});

it('creates monthly Mass series with matching preview dates and requires an admin session', async () => {
  await db.exec('reset role;');
  const {rows} = await db.query<{token:string}>("select * from admin_login('0403')");
  await db.exec('set role anon;');
  const sql = "select admin_add_pattern_masses($1,'Pierwszy piątek test',4,false,array[5],'18:00','2026-01-01','2026-03-31','monthly',1,1,array[1])";
  await expect(db.query(sql,[null])).rejects.toThrow('Sesja administratora');
  await db.query(sql,[rows[0].token]);
  const created = await db.query<{day:string,series_id:string}>("select to_char(start_time at time zone 'Europe/Warsaw','YYYY-MM-DD') as day, series_id from masses where title='Pierwszy piątek test' order by start_time");
  expect(created.rows.map(r=>r.day)).toEqual(['2026-01-02','2026-02-06','2026-03-06']);
  expect(new Set(created.rows.map(r=>r.series_id)).size).toBe(1);
  await expect(db.query("select admin_add_pattern_masses($1,'Invalid',4,false,array[5],'18:00','2026-01-01','2026-03-31','monthly',1,1,array[]::integer[])",[rows[0].token])).rejects.toThrow();
  await db.query("select admin_add_pattern_masses($1,'Ostatnia test',4,true,array[0],'18:00','2028-02-01','2028-03-31','monthly',1,1,array[5,-1])",[rows[0].token]);
  expect((await db.query("select id from masses where title='Ostatnia test'")).rows).toHaveLength(2);
});

it('persists all event categories and changes a whole series category', async () => {
  await db.exec('reset role;');
  const {rows} = await db.query<{token:string}>("select * from admin_login('0403')");
  await db.exec('set role anon;');
  const token=rows[0].token;
  for (const category of ['mass','devotion','other']) {
    await db.query("select admin_add_event($1,'2026-10-01 18:00 Europe/Warsaw',$2,4,$3)",[token,'Category '+category,category]);
    const result=await db.query<{category:string,is_extra:boolean}>("select category,is_extra from masses where title=$1",['Category '+category]);
    expect(result.rows).toEqual([{category,is_extra:category==='devotion'}]);
  }
  await db.query("select admin_add_pattern_events($1,'Other series',4,false,array[5],'18:00','2026-01-01','2026-03-31','monthly',1,1,array[1],'other')",[token]);
  const series=await db.query<{id:string}>("select id from masses where title='Other series' order by start_time");
  expect(series.rows).toHaveLength(3);
  await db.query("select admin_update_event($1,$2,'future','Updated other', '18:00',4,false,'devotion')",[token,series.rows[0].id]);
  expect((await db.query("select id from masses where title='Updated other' and category='devotion' and is_extra")).rows).toHaveLength(3);
  await expect(db.query("select admin_add_event(null,now(),'Bad',4,'other')")).rejects.toThrow();
  await expect(db.query("select admin_add_event($1,now(),'Bad',4,'invalid')",[token])).rejects.toThrow();
});

it('allows optional capacity for single events, series and edits while rejecting zero', async () => {
  await db.exec('reset role;');
  const {rows}=await db.query<{token:string}>("select * from admin_login('0403')");
  await db.exec('set role anon;');
  const token=rows[0].token;
  await db.query("select admin_add_event($1,now(),'No capacity',null,'other')",[token]);
  const result=await db.query<{id:string,suggested_spots:number|null}>("select id,suggested_spots from masses where title='No capacity'");
  expect(result.rows[0].suggested_spots).toBeNull();
  await db.query("select admin_update_event($1,$2,'single','No capacity','18:00',2,false,'other')",[token,result.rows[0].id]);
  await db.query("select admin_update_event($1,$2,'single','No capacity','18:00',null,false,'other')",[token,result.rows[0].id]);
  expect((await db.query<{suggested_spots:null}>("select suggested_spots from masses where id=$1",[result.rows[0].id])).rows[0].suggested_spots).toBeNull();
  await db.query("select admin_add_pattern_events($1,'Open series',null,false,array[5],'18:00','2026-01-01','2026-03-31','monthly',1,1,array[1],'other')",[token]);
  expect((await db.query("select id from masses where title='Open series' and suggested_spots is null")).rows).toHaveLength(3);
  await expect(db.query("select admin_add_event($1,now(),'Invalid capacity',0,'other')",[token])).rejects.toThrow();
});
