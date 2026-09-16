import { eventCategory } from './eventCategory';
import { aggregateAttendees, ruleHistoryToPreserve } from './attendance';
import { buildCompetition, competitionSeason } from './competition';
import { massOccurrenceDates } from './massRecurrence';
import { configurationError, isDemo, supabase } from './supabase';
import { demoWeek, readDemo, writeDemo } from './demo';
import { dateKey, shiftDate, shiftMonth, timeSlot, weekday, weekBounds, zonedIso } from './dates';
import { requireAdminSession } from './admin';
import { RANKS } from '../types/database';
import type { AdminSession, AltarServer, AttendanceType, CompetitionState, MassEditInput, NewMass, PendingConfirmations, RecurringMassesInput, RecurringRule, ScheduleData } from '../types/database';

function client() {
  if (!supabase) throw new Error(configurationError || 'Brak połączenia z Supabase.');
  return supabase;
}

function check(error: { message: string; code?: string } | null): void {
  if (error?.code === 'PGRST202') throw new Error('Ta operacja wymaga aktualizacji bazy. Uruchom najnowsze migracje Supabase, w tym 202609150005_optional_capacity.sql.');
  if (error) throw new Error(error.message);
}

// Read all pages, including parishes exceeding the PostgREST default of 1,000 rows.
async function allRows<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query(offset, offset + 499);
    check(error);
    result.push(...(data ?? []));
    if (!data || data.length < 500) return result;
  }
}

export async function loadWeek(start: string): Promise<ScheduleData> {
  const [from, to] = weekBounds(start);
  return loadScheduleRange(from, to);
}

/** One bounded date range, using the same SQL attendance view as the weekly schedule.
 * Keep the whole roster in this range so capacity counts include every server.
 * `to` is exclusive. Existing pagination prevents silently truncated rosters.
 */
export async function loadUpcomingServices(from: string, to: string): Promise<ScheduleData> {
  return loadScheduleRange(from, to);
}

const COMPETITION_MIGRATION = 'Uruchom migrację 202609160003_points_and_confirmations.sql w Supabase, aby włączyć potwierdzanie obecności i zarządzanie punktami.';
function checkCompetition(error: { message: string; code?: string } | null) {
  if (error && ['PGRST202', 'PGRST205', '42P01'].includes(error.code ?? '')) throw new Error(COMPETITION_MIGRATION);
  check(error);
}

/** Revision checks avoid composing scores from different concurrent snapshots. */
export async function loadCompetition(from: string, to: string): Promise<ScheduleData> {
  const season = dateKey(from);
  const emptyState: CompetitionState = { season, reset_at: null, revision: 0, reset_revision: 0 };
  if (isDemo) {
    const state = readDemo();
    return { ...demoWeek(from, to), confirmations: state.confirmations ?? [], pointAdjustments: state.pointAdjustments ?? [], competitionState: state.competitionSeasons?.find(item => item.season === season) ?? emptyState };
  }
  const db = client();
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = await db.from('competition_seasons').select('*').eq('season', season).maybeSingle();
    checkCompetition(before.error);
    const state = before.data ?? emptyState;
    const [schedule, adjustments] = await Promise.all([
      loadScheduleRange(from, to),
      allRows((a, b) => db.from('point_adjustments').select('*').eq('season', season).order('revision').order('id').range(a, b)),
    ]);
    const confirmations = schedule.confirmations ?? [];
    const after = await db.from('competition_seasons').select('*').eq('season', season).maybeSingle();
    checkCompetition(after.error);
    if (state.revision === (after.data?.revision ?? 0)) return { ...schedule, confirmations, pointAdjustments: adjustments, competitionState: state };
  }
  throw new Error('Wyniki są właśnie aktualizowane. Spróbuj ponownie.');
}

export async function loadPendingConfirmations(serverId: string): Promise<PendingConfirmations> {
  if (isDemo) {
    const state = readDemo();
    const cutoff = Date.now() - 3600000;
    const declared = new Set(aggregateAttendees(state.masses, state.servers, state.rules, state.exceptions).filter(a => a.server_id === serverId).map(a => a.mass_id));
    const answered = new Set((state.confirmations ?? []).filter(a => a.server_id === serverId).map(a => a.mass_id));
    const pending = state.masses.filter(m => Date.parse(m.start_time) <= cutoff && declared.has(m.id) && !answered.has(m.id)).sort((a, b) => a.start_time.localeCompare(b.start_time) || a.id.localeCompare(b.id));
    return { masses: pending.slice(0, 50), total: pending.length };
  }
  const { data, error } = await client().rpc('pending_service_confirmations', { p_server_id: serverId });
  checkCompetition(error);
  return data ?? { masses: [], total: 0 };
}

export async function confirmService(massId: string, serverId: string, attended: boolean): Promise<void> {
  if (isDemo) return writeDemo(state => {
    const mass = state.masses.find(m => m.id === massId);
    if (!mass || Date.parse(mass.start_time) > Date.now() - 3600000) throw new Error('Służbę można potwierdzić godzinę po jej rozpoczęciu.');
    const declared = aggregateAttendees([mass], state.servers, state.rules, state.exceptions).some(a => a.server_id === serverId);
    const existing = state.confirmations?.find(c => c.mass_id === massId && c.server_id === serverId);
    if (existing) {
      if (existing.attended === attended) return;
      // Correcting an earlier answer keeps a single durable record.
      // Answers never rewrite declarations; the roster stays intact.
      existing.attended = attended;
      existing.confirmed_at = new Date().toISOString();
    } else {
      if (!attended && !declared) throw new Error('Nie masz już zapisu na tę służbę. Odśwież listę.');
      (state.confirmations ??= []).push({ mass_id: massId, server_id: serverId, attended, confirmed_at: new Date().toISOString() });
      const season = competitionSeason(new Date(mass.start_time)).start;
      const seasons = state.competitionSeasons ??= [];
      if (!seasons.some(s => s.season === season)) seasons.push({ season, reset_at: null, reset_revision: 0, revision: 0 });
    }
    for (const s of state.competitionSeasons ?? []) s.revision++;
  });
  checkCompetition((await client().rpc('confirm_service', { p_mass_id: massId, p_server_id: serverId, p_attended: attended })).error);
}

export type PointEdit = { serverId: string; mode: 'add' | 'subtract' | 'set'; value: number; reason: string };
export async function adjustPoints(edit: PointEdit, snapshot: ScheduleData, session: AdminSession | null): Promise<void> {
  const admin = await requireAdminSession(session);
  const now = new Date();
  const { season, profiles } = buildCompetition(snapshot, now);
  const person = profiles.find(p => p.server.id === edit.serverId);
  if (!person || !snapshot.competitionState || snapshot.competitionState.season !== season.start) throw new Error('Odśwież wyniki przed zapisem.');
  const target = edit.mode === 'set' ? edit.value : person.points + (edit.mode === 'add' ? edit.value : -edit.value);
  if (!Number.isSafeInteger(edit.value) || edit.value < 0 || edit.value > 1000000 || target < 0 || target > 1000000) throw new Error('Wynik musi wynosić od 0 do 1000000 punktów.');
  if (edit.reason.length > 240) throw new Error('Opis może mieć do 240 znaków.');
  if (isDemo) return writeDemo(state => {
    const seasons = state.competitionSeasons ??= [];
    let current = seasons.find(s => s.season === season.start);
    if (!current) { current = { season: season.start, reset_at: null, reset_revision: 0, revision: 0 }; seasons.push(current); }
    if (current.revision !== snapshot.competitionState!.revision) throw new Error('Wyniki zmieniły się. Odśwież i spróbuj ponownie.');
    current.revision++;
    (state.pointAdjustments ??= []).push({ id: crypto.randomUUID(), season: season.start, server_id: edit.serverId, delta: target - person.rawPoints, mode: edit.mode, reason: edit.reason.trim(), created_at: now.toISOString(), revision: current.revision });
  });
  checkCompetition((await client().rpc('admin_adjust_points', { p_token: admin.token, p_server_id: edit.serverId, p_season: season.start, p_mode: edit.mode, p_value: edit.value, p_current_points: person.rawPoints, p_revision: snapshot.competitionState.revision, p_reason: edit.reason })).error);
}

export async function resetPoints(snapshot: ScheduleData, session: AdminSession | null): Promise<void> {
  const admin = await requireAdminSession(session);
  const season = competitionSeason(new Date()).start;
  if (!snapshot.competitionState || snapshot.competitionState.season !== season) throw new Error('Odśwież wyniki przed resetem.');
  if (isDemo) return writeDemo(state => {
    const seasons = state.competitionSeasons ??= [];
    let current = seasons.find(s => s.season === season);
    if (!current) { current = { season, reset_at: null, reset_revision: 0, revision: 0 }; seasons.push(current); }
    if (current.revision !== snapshot.competitionState!.revision) throw new Error('Wyniki zmieniły się. Odśwież przed resetem.');
    current.revision++;
    current.reset_revision = current.revision;
    current.reset_at = new Date().toISOString();
  });
  checkCompetition((await client().rpc('admin_reset_points', { p_token: admin.token, p_season: season, p_revision: snapshot.competitionState.revision })).error);
}

async function loadScheduleRange(from: string, to: string): Promise<ScheduleData> {
  if (isDemo) return demoWeek(from, to);
  const db = client();
  const from30 = zonedIso(shiftDate(dateKey(), -30), '00:00');
  const to30 = zonedIso(shiftDate(dateKey(), 1), '00:00');
  const results = await Promise.allSettled([
    allRows((a, b) => db.from('altar_servers').select('*').order('name').order('id').range(a, b)),
    allRows((a, b) => db.from('masses').select('*').gte('start_time', from).lt('start_time', to).order('start_time').order('id').range(a, b)),
    allRows((a, b) => db.from('recurring_rules').select('*').order('id').range(a, b)),
    allRows((a, b) => db.from('mass_attendees').select('*, masses!inner(start_time)')
      .gte('masses.start_time', from).lt('masses.start_time', to).order('id').range(a, b)),
    allRows((a, b) => db.from('masses').select('id').gte('start_time', from30).lt('start_time', to30).range(a, b)),
  ] as const);
  for (const result of results) if (result.status === 'rejected') throw result.reason;
  const [serversResult, massesResult, rulesResult, exceptionsResult, recentMassesResult] = results;
  if (serversResult.status !== 'fulfilled' || massesResult.status !== 'fulfilled' || rulesResult.status !== 'fulfilled' || exceptionsResult.status !== 'fulfilled' || recentMassesResult.status !== 'fulfilled') throw new Error('Nie udało się pobrać grafiku.');
  const masses = massesResult.value;
  // Chunk IDs to keep REST URLs bounded. Batches run in parallel so a week
  // with many masses loads in ~1 round-trip wave instead of N sequential ones.
  const massIdChunks: string[][] = [];
  for (let index = 0; index < masses.length; index += 80) {
    massIdChunks.push(masses.slice(index, index + 80).map(m => m.id));
  }
  const [attendeeChunks, confirmationChunks, annotations] = await Promise.all([
    Promise.all(massIdChunks.map(chunk =>
      allRows((a, b) => db.from('effective_attendees').select('*')
        .in('mass_id', chunk)
        .order('mass_id').order('server_id').range(a, b)),
    )),
    Promise.all(massIdChunks.map(chunk => loadConfirmationsBatch(chunk))),
    db.from('day_annotations').select('*').gte('day', dateKey(from)).lt('day', dateKey(to)),
  ]);
  const attendees: ScheduleData['attendees'] = attendeeChunks.flat();
  attendees.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  const confirmations = confirmationChunks.flat();

  const recentMasses = recentMassesResult.value;
  const recentIdChunks: string[][] = [];
  for (let index = 0; index < recentMasses.length; index += 80) {
    recentIdChunks.push(recentMasses.slice(index, index + 80).map(m => m.id));
  }
  const recentChunks = await Promise.all(recentIdChunks.map(batch =>
    allRows<{ server_id: string }>((a, b) => db.from('effective_attendees').select('server_id')
      .in('mass_id', batch)
      .range(a, b)),
  ));
  const recentAttendance: Record<string, number> = {};
  for (const rows of recentChunks) {
    for (const row of rows) {
      recentAttendance[row.server_id] = (recentAttendance[row.server_id] ?? 0) + 1;
    }
  }

  check(annotations.error);
  return { dayAnnotations: annotations.data ?? [], servers: serversResult.value, masses, rules: rulesResult.value, exceptions: exceptionsResult.value, attendees, recentAttendance, confirmations };
}

/** Single bounded batch of presence answers. Missing table means the
 * competition migration has not been applied yet; the schedule still works
 * and the pending queue surfaces the migration hint. */
async function loadConfirmationsBatch(batch: string[]): Promise<NonNullable<ScheduleData['confirmations']>> {
  const result: NonNullable<ScheduleData['confirmations']> = [];
  const db = client();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from('service_confirmations').select('*')
      .in('mass_id', batch).order('mass_id').order('server_id').range(offset, offset + 499);
    if (error) {
      if (['PGRST202', 'PGRST205', '42P01'].includes(error.code ?? '')) return [];
      throw new Error(error.message);
    }
    result.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  return result;
}

export async function setAttendance(massId: string, serverId: string, type: AttendanceType): Promise<void> {
  if (isDemo) return writeDemo(state => {
    if (!state.masses.some(m => m.id === massId)) throw new Error('To nabożeństwo zostało usunięte.');
    const found = state.exceptions.find(a => a.mass_id === massId && a.server_id === serverId);
    if (found) found.type = type;
    else state.exceptions.push({ id: crypto.randomUUID(), mass_id: massId, server_id: serverId, type });
  });
  check((await client().from('mass_attendees').upsert({ mass_id: massId, server_id: serverId, type }, { onConflict: 'mass_id,server_id' })).error);
}

export async function removeAttendance(massId: string, serverId: string): Promise<void> {
  if (isDemo) return writeDemo(state => { state.exceptions = state.exceptions.filter(a => a.mass_id !== massId || a.server_id !== serverId); });
  check((await client().from('mass_attendees').delete().eq('mass_id', massId).eq('server_id', serverId)).error);
}

export async function addRule(rule: Omit<RecurringRule, 'id'>): Promise<void> {
  if (isDemo) return writeDemo(state => {
    if (!state.rules.some(r => r.server_id === rule.server_id && r.day_of_week === rule.day_of_week && r.time_slot === rule.time_slot)) {
      state.rules.push({ ...rule, id: crypto.randomUUID() });
    }
  });
  check((await client().from('recurring_rules').upsert(rule, { onConflict: 'server_id,day_of_week,time_slot', ignoreDuplicates: true })).error);
}

export async function updateRule(rule: RecurringRule): Promise<void> {
  const { id, server_id, ...changes } = rule;
  if (isDemo) return writeDemo(state => {
    const found = state.rules.find(r => r.id === id && r.server_id === server_id);
    if (!found) throw new Error('Ten dyżur już nie istnieje.');
    if (state.rules.some(r => r.id !== id && r.server_id === server_id && r.day_of_week === rule.day_of_week && r.time_slot === rule.time_slot)) throw new Error('Masz już dyżur w tym dniu o tej godzinie. Edytuj istniejący dyżur.');
    Object.assign(found, changes);
  });
  const { data, error } = await client().from('recurring_rules').update(changes).eq('id', id).eq('server_id', server_id).select('id');
  if (error?.code === '23505') throw new Error('Masz już dyżur w tym dniu o tej godzinie. Edytuj istniejący dyżur.');
  if (error?.code === 'PGRST204') throw new Error('Edycja częstotliwości wymaga migracji 202609150002_recurring_patterns.sql w Supabase.');
  check(error);
  if (!data?.length) throw new Error('Ten dyżur już nie istnieje.');
}

export async function deleteRule(id: string): Promise<void> {
  if (isDemo) return writeDemo(state => {
    const rule = state.rules.find(r => r.id === id);
    if (rule) {
      for (const massId of ruleHistoryToPreserve(state.masses, state.exceptions, rule)) {
        state.exceptions.push({ id: crypto.randomUUID(), mass_id: massId, server_id: rule.server_id, type: 'single' });
      }
    }
    state.rules = state.rules.filter(r => r.id !== id);
  });
  const db = client();
  const { data: found, error: ruleError } = await db.from('recurring_rules').select('*').eq('id', id);
  check(ruleError);
  const rule = (found ?? [])[0] as RecurringRule | undefined;
  if (rule) {
    const nowIso = new Date().toISOString();
    const past = await allRows<{ id: string; start_time: string }>((a, b) =>
      db.from('masses').select('id,start_time').lt('start_time', nowIso).order('start_time').order('id').range(a, b));
    const candidates = past.filter(mass => mass.start_time < nowIso);
    const candidateChunks: { id: string; start_time: string }[][] = [];
    for (let index = 0; index < candidates.length; index += 80) {
      candidateChunks.push(candidates.slice(index, index + 80));
    }
    const occupiedChunks = await Promise.all(candidateChunks.map(batch =>
      allRows<{ mass_id: string; server_id: string }>((a, b) =>
        db.from('mass_attendees').select('mass_id,server_id').eq('server_id', rule.server_id)
          .in('mass_id', batch.map(mass => mass.id)).range(a, b))));
    const occupied = occupiedChunks.flat();
    const freshIds = ruleHistoryToPreserve(candidates, occupied, rule, nowIso);
    const freshChunks: string[][] = [];
    for (let index = 0; index < freshIds.length; index += 80) {
      freshChunks.push(freshIds.slice(index, index + 80));
    }
    const upserts = await Promise.all(freshChunks.map(chunk =>
      db.from('mass_attendees').upsert(
        chunk.map(mass_id => ({ mass_id, server_id: rule.server_id, type: 'single' as const })),
        { onConflict: 'mass_id,server_id' },
      )));
    for (const upsert of upserts) check(upsert.error);
  }
  check((await db.from('recurring_rules').delete().eq('id', id)).error);
}

export async function addMass(mass: NewMass, session: AdminSession | null): Promise<void> {
  const admin = await requireAdminSession(session);
  if (isDemo) return writeDemo(state => { state.masses.push({ ...mass, id: crypto.randomUUID() }); });
  check((await client().rpc('admin_add_event', {
    p_category: eventCategory(mass),
    p_token: admin.token,
    p_start_time: mass.start_time,
    p_title: mass.title,
    p_suggested_spots: mass.suggested_spots,
    p_celebrant: mass.celebrant ?? null,
    p_liturgy_type: mass.liturgy_type ?? null,
  })).error);
}

export async function addRecurringMasses(input: RecurringMassesInput, session: AdminSession | null): Promise<number> {
  const admin = await requireAdminSession(session);
  const title = input.title.trim();
  if (!title) throw new Error('Wpisz nazwę nabożeństwa.');
  if (input.suggested_spots !== null && (!Number.isInteger(input.suggested_spots) || input.suggested_spots < 1)) throw new Error('Sugerowana liczba miejsc musi być dodatnią liczbą całkowitą.');
  if (!input.days.length) throw new Error('Wybierz co najmniej jeden dzień tygodnia.');
  if (input.end_date < input.start_date) throw new Error('Data końcowa musi być późniejsza lub równa dacie początkowej.');

  const dates = massOccurrenceDates(input);
  if (!dates.length) throw new Error('Brak pasujących terminów. Sprawdź rytm i zakres dat (maksymalnie 366 dni).');
  if (isDemo) {
    let count = 0;
    writeDemo(state => {
      const series_id = crypto.randomUUID();
      for (const curr of dates) {
          const startTime = zonedIso(curr, input.time);
          state.masses.push({
            id: crypto.randomUUID(),
            title,
            start_time: startTime,
            suggested_spots: input.suggested_spots,
            is_extra: input.is_extra, category: eventCategory(input),
            celebrant: input.celebrant ? input.celebrant.trim() : null,
            liturgy_type: null,
            series_id,
          });
          count++;
      }
    });
    return count;
  }

  const { data, error } = await client().rpc('admin_add_pattern_events', { p_category: eventCategory(input),
    p_frequency: input.frequency ?? 'weekly',
    p_interval_weeks: input.interval_weeks ?? 1,
    p_interval_months: input.interval_months ?? 1,
    p_month_weeks: input.month_weeks ?? [1],
    p_token: admin.token,
    p_title: title,
    p_suggested_spots: input.suggested_spots,
    p_is_extra: input.is_extra,
    p_days: input.days,
    p_time: input.time.length === 5 ? `${input.time}:00` : input.time,
    p_start_date: input.start_date,
    p_end_date: input.end_date,
    p_celebrant: input.celebrant ? input.celebrant.trim() : null,
    p_liturgy_type: input.liturgy_type ? input.liturgy_type.trim() : null,
  });
  if (error?.code === 'PGRST202') throw new Error('Ta operacja wymaga aktualizacji bazy. Uruchom najnowsze migracje Supabase, w tym 202609150006_mass_details.sql.');
  check(error);
  return data ?? 0;
}

export async function deleteMass(id: string, session: AdminSession | null, scope: 'single' | 'future' = 'single'): Promise<void> {
  const admin = await requireAdminSession(session);
  if (isDemo) return writeDemo(state => {
    const target = state.masses.find(m => m.id === id);
    if (!target) throw new Error('Nie znaleziono terminu do usunięcia.');
    if (scope === 'future') {
      if (target.series_id) {
        state.masses = state.masses.filter(m => !(m.series_id === target.series_id && m.start_time >= target.start_time));
      } else {
        const targetTime = timeSlot(target.start_time);
        const targetDow = weekday(dateKey(target.start_time));
        state.masses = state.masses.filter(m => !(
          m.start_time >= target.start_time &&
          dateKey(m.start_time) >= dateKey(target.start_time) &&
          weekday(dateKey(m.start_time)) === targetDow &&
          timeSlot(m.start_time) === targetTime &&
          m.title === target.title
        ));
      }
    } else {
      state.masses = state.masses.filter(m => m.id !== id);
    }
    state.exceptions = state.exceptions.filter(a => state.masses.some(m => m.id === a.mass_id));
  });
  if (scope === 'future') {
    check((await client().rpc('admin_delete_future_masses', { p_token: admin.token, p_id: id })).error);
  } else {
    check((await client().rpc('admin_delete_mass', { p_token: admin.token, p_id: id })).error);
  }
}

export async function addServer(server: Omit<AltarServer, 'id'>, session: AdminSession | null): Promise<string> {
  const admin = await requireAdminSession(session);
  const name = server.name.trim();
  if (!name || name.length > 100 || !RANKS.includes(server.rank)) throw new Error('Podaj imię, nazwisko i prawidłowy stopień.');
  if (isDemo) {
    const id = `demo-server-${crypto.randomUUID()}`;
    writeDemo(state => {
      state.servers.push({ id, name, rank: server.rank });
      state.servers.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
    });
    return id;
  }
  const { data, error } = await client().rpc('admin_add_server', { p_token: admin.token, p_name: name, p_rank: server.rank });
  check(error);
  return data!;
}

export async function updateServer(server: AltarServer, session: AdminSession | null): Promise<void> {
  const admin = await requireAdminSession(session);
  const name = server.name.trim();
  if (!name || name.length > 100 || !RANKS.includes(server.rank)) throw new Error('Podaj imię, nazwisko i prawidłowy stopień.');
  if (isDemo) return writeDemo(state => {
    const found = state.servers.find(s => s.id === server.id);
    if (!found) throw new Error('Ten ministrant już nie istnieje.');
    found.name = name;
    found.rank = server.rank;
  });
  check((await client().rpc('admin_update_server', { p_token: admin.token, p_id: server.id, p_name: name, p_rank: server.rank })).error);
}

export async function deleteServer(id: string, session: AdminSession | null): Promise<void> {
  const admin = await requireAdminSession(session);
  if (isDemo) return writeDemo(state => {
    state.servers = state.servers.filter(s => s.id !== id);
    state.rules = state.rules.filter(r => r.server_id !== id);
    state.exceptions = state.exceptions.filter(e => e.server_id !== id);
  });
  check((await client().rpc('admin_delete_server', { p_token: admin.token, p_id: id })).error);
}

export async function updateMass(id: string, input: MassEditInput, session: AdminSession | null): Promise<number> {
  const admin = await requireAdminSession(session);
  const title = input.title.trim();
  if (!title || title.length > 160) throw new Error('Wpisz nazwę (1-160 znaków).');
  if (input.suggested_spots !== null && (!Number.isInteger(input.suggested_spots) || input.suggested_spots < 1)) {
    throw new Error('Sugerowana liczba miejsc musi być dodatnią liczbą całkowitą.');
  }
  const time = input.time.trim();
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error('Podaj prawidłową godzinę w formacie GG:MM.');

  if (isDemo) {
    let updatedCount = 0;
    writeDemo(state => {
      const target = state.masses.find(m => m.id === id);
      if (!target) throw new Error('Ten termin już nie istnieje.');
      if (input.scope === 'single') {
        const date = dateKey(target.start_time);
        target.start_time = zonedIso(date, time);
        target.title = title;
        target.suggested_spots = input.suggested_spots;
        target.is_extra = input.is_extra; target.category = eventCategory(input);
        target.celebrant = input.celebrant ? input.celebrant.trim() : null;
        target.liturgy_type = input.liturgy_type ? input.liturgy_type.trim() : null;
        updatedCount = 1;
      } else {
        // 'future' (starszy zakres) traktujemy jak 'future_time' dla zgodności wstecz.
        // Dopasowanie globalne po tytule i godzinie (ściana Europe/Warsaw), niezależnie od series_id,
        // dzięki czemu edycja obejmuje też terminy spoza pierwotnej serii.
        const targetTime = timeSlot(target.start_time).slice(0, 5);
        const targetDow = weekday(dateKey(target.start_time));
        const narrowByDow = input.scope === 'future_day_time';
        const targets = state.masses.filter(m =>
          m.start_time >= target.start_time &&
          m.title === target.title &&
          timeSlot(m.start_time).slice(0, 5) === targetTime &&
          (!narrowByDow || weekday(dateKey(m.start_time)) === targetDow),
        );
        if (!targets.length) throw new Error('Nie znaleziono przyszłych terminów do edycji.');
        const liturgyValue = input.liturgy_type ? input.liturgy_type.trim() : null;
        const celebrantValue = input.celebrant ? input.celebrant.trim() : null;
        const applyLiturgyToSeries = input.liturgy_scope === 'series';
        const applyCelebrantToSeries = input.celebrant_scope === 'series';
        for (const m of targets) {
          const date = dateKey(m.start_time);
          m.start_time = zonedIso(date, time);
          m.title = title;
          m.suggested_spots = input.suggested_spots;
          m.is_extra = input.is_extra; m.category = eventCategory(input);
          if (applyCelebrantToSeries || m.id === id) m.celebrant = celebrantValue;
          if (applyLiturgyToSeries || m.id === id) m.liturgy_type = liturgyValue;
          updatedCount++;
        }
      }
    });
    return updatedCount;
  }

  const liturgyScope = input.scope === 'single' ? 'single' : (input.liturgy_scope ?? 'single');
  const celebrantScope = input.scope === 'single' ? 'single' : (input.celebrant_scope ?? 'single');

  async function callUpdate(scope: string, extras: 'both' | 'liturgy' | 'none') {
    const base = { p_category: eventCategory(input),
      p_token: admin.token,
      p_id: id,
      p_scope: scope,
      p_title: title,
      p_time: time.length === 5 ? `${time}:00` : time,
      p_suggested_spots: input.suggested_spots,
      p_is_extra: input.is_extra,
      p_celebrant: input.celebrant ? input.celebrant.trim() : null,
      p_liturgy_type: input.liturgy_type ? input.liturgy_type.trim() : null,
    };
    if (extras === 'both') {
      return client().rpc('admin_update_event', { ...base, p_liturgy_scope: liturgyScope, p_celebrant_scope: celebrantScope });
    }
    if (extras === 'liturgy') {
      return client().rpc('admin_update_event', { ...base, p_liturgy_scope: liturgyScope });
    }
    return client().rpc('admin_update_event', base);
  }

  let { data, error } = await callUpdate(input.scope, 'both');
  if (error && error.code === 'PGRST202') {
    if (celebrantScope === 'series') {
      throw new Error('Seryjny zapis celebransa wymaga aktualizacji bazy. Uruchom migrację 202609160002_mass_liturgy_scope.sql w Supabase.');
    }
    ({ data, error } = await callUpdate(input.scope, 'liturgy'));
  }
  if (error && error.code === 'PGRST202') {
    if (liturgyScope === 'series') {
      throw new Error('Seryjny zapis okazji wymaga aktualizacji bazy. Uruchom migrację 202609160002_mass_liturgy_scope.sql w Supabase.');
    }
    ({ data, error } = await callUpdate(input.scope, 'none'));
  }
  if (error && (/Nieprawidłowy zakres edycji/.test(error.message)) && input.scope === 'future_time') {
    ({ data, error } = await callUpdate('future', 'both'));
    if (error && error.code === 'PGRST202') {
      ({ data, error } = await callUpdate('future', 'liturgy'));
    }
    if (error && error.code === 'PGRST202') {
      ({ data, error } = await callUpdate('future', 'none'));
    }
  }
  if (error?.code === 'PGRST202') throw new Error('Ta operacja wymaga aktualizacji bazy. Uruchom najnowsze migracje Supabase, w tym 202609160002_mass_liturgy_scope.sql.');
  check(error);
  const count = data ?? 1;
  if (count === 0) throw new Error('Nie znaleziono przyszłych terminów do edycji. Sprawdź godzinę i dzień tygodnia.');
  return count;
}

export async function updateMassTime(id: string, startTime: string, session: AdminSession | null): Promise<void> {
  const time = timeSlot(startTime).slice(0, 5);
  await updateMass(id, { title: 'Msza Święta', time, suggested_spots: 4, is_extra: false, scope: 'single' }, session);
}

export type SyncStatus = 'connecting' | 'live' | 'offline' | 'demo';

export function subscribe(onChange: () => void, onStatus: (status: SyncStatus) => void): () => void {
  const onFocus = () => onChange();
  window.addEventListener('focus', onFocus);
  window.addEventListener('online', onFocus);
  const timer = window.setInterval(onChange, 60000);
  let cleanup = () => {};
  if (isDemo) {
    onStatus('demo');
    const onStorage = (event: StorageEvent) => { if (event.key === 'liturgy.demo.v1') onChange(); };
    window.addEventListener('liturgy-demo-change', onChange);
    window.addEventListener('storage', onStorage);
    cleanup = () => {
      window.removeEventListener('liturgy-demo-change', onChange);
      window.removeEventListener('storage', onStorage);
    };
  } else if (supabase) {
    onStatus('connecting');
    const channel = supabase.channel(`schedule-${crypto.randomUUID()}`);
    for (const table of ['altar_servers', 'masses', 'recurring_rules', 'mass_attendees', 'day_annotations', 'service_confirmations', 'competition_seasons', 'point_adjustments']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
    }
    channel.subscribe(status => {
      onStatus(status === 'SUBSCRIBED' ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED' ? 'offline' : 'connecting');
      if (status === 'SUBSCRIBED') onChange();
    });
    cleanup = () => { void supabase!.removeChannel(channel); };
  } else onStatus('offline');
  return () => {
    cleanup();
    window.clearInterval(timer);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('online', onFocus);
  };
}

export async function setDayAnnotation(day: string, label: string, session: AdminSession | null): Promise<void> {
  const admin = await requireAdminSession(session);
  if (isDemo) return writeDemo(state => {
    state.dayAnnotations = (state.dayAnnotations ?? []).filter(item => item.day !== day);
    if (label.trim()) state.dayAnnotations.push({ day, label: label.trim() });
  });
  check((await client().rpc('admin_set_day_annotation', {p_token:admin.token,p_day:day,p_label:label.trim()})).error);
}

export async function loadMonthAnnotations(month: string): Promise<{ day: string; label: string }[]> {
  const from = `${month}-01`;
  const to = `${shiftMonth(month, 1)}-01`;
  if (isDemo) {
    return (readDemo().dayAnnotations ?? [])
      .filter(item => item.day >= from && item.day < to)
      .sort((a, b) => a.day.localeCompare(b.day));
  }
  const { data, error } = await client().from('day_annotations').select('*').gte('day', from).lt('day', to).order('day');
  check(error);
  return data ?? [];
}
