import { eventCategory } from './eventCategory';
import { massOccurrenceDates } from './massRecurrence';
import { configurationError, isDemo, supabase } from './supabase';
import { demoWeek, writeDemo } from './demo';
import { dateKey, shiftDate, timeSlot, weekday, weekBounds, zonedIso } from './dates';
import { requireAdminSession } from './admin';
import { RANKS } from '../types/database';
import type { AdminSession, AltarServer, AttendanceType, MassEditInput, NewMass, RecurringMassesInput, RecurringRule, ScheduleData } from '../types/database';

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
  const attendees: ScheduleData['attendees'] = [];
  // Chunk IDs to keep REST URLs bounded. Ordering is stable for pagination.
  for (let index = 0; index < masses.length; index += 80) {
    attendees.push(...await allRows((a, b) => db.from('effective_attendees').select('*')
      .in('mass_id', masses.slice(index, index + 80).map(m => m.id))
      .order('mass_id').order('server_id').range(a, b)));
  }
  attendees.sort((a, b) => a.name.localeCompare(b.name, 'pl'));

  const recentMasses = recentMassesResult.value;
  const recentAttendance: Record<string, number> = {};
  for (let index = 0; index < recentMasses.length; index += 80) {
    const batch = recentMasses.slice(index, index + 80).map(m => m.id);
    const rows = await allRows((a, b) => db.from('effective_attendees').select('server_id')
      .in('mass_id', batch)
      .range(a, b));
    for (const row of rows) {
      recentAttendance[row.server_id] = (recentAttendance[row.server_id] ?? 0) + 1;
    }
  }

  const annotations = await db.from('day_annotations').select('*').gte('day', start).lt('day', shiftDate(start, 7));
  check(annotations.error);
  return { dayAnnotations: annotations.data ?? [], servers: serversResult.value, masses, rules: rulesResult.value, exceptions: exceptionsResult.value, attendees, recentAttendance };
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
  if (isDemo) return writeDemo(state => { state.rules = state.rules.filter(r => r.id !== id); });
  check((await client().from('recurring_rules').delete().eq('id', id)).error);
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
      if (input.scope === 'future') {
        const targets = target.series_id
          ? state.masses.filter(m => m.series_id === target.series_id && m.start_time >= target.start_time)
          : state.masses.filter(m => m.start_time >= target.start_time && m.title === target.title && timeSlot(m.start_time).slice(0, 5) === timeSlot(target.start_time).slice(0, 5));
        for (const m of targets) {
          const date = dateKey(m.start_time);
          m.start_time = zonedIso(date, time);
          m.title = title;
          m.suggested_spots = input.suggested_spots;
          m.is_extra = input.is_extra; m.category = eventCategory(input);
          m.celebrant = input.celebrant ? input.celebrant.trim() : null;
          if (m.id === id) m.liturgy_type = input.liturgy_type ? input.liturgy_type.trim() : null;
          updatedCount++;
        }
      } else {
        const date = dateKey(target.start_time);
        target.start_time = zonedIso(date, time);
        target.title = title;
        target.suggested_spots = input.suggested_spots;
        target.is_extra = input.is_extra; target.category = eventCategory(input);
        target.celebrant = input.celebrant ? input.celebrant.trim() : null;
        target.liturgy_type = input.liturgy_type ? input.liturgy_type.trim() : null;
        updatedCount = 1;
      }
    });
    return updatedCount;
  }

  const { data, error } = await client().rpc('admin_update_event', { p_category: eventCategory(input),
    p_token: admin.token,
    p_id: id,
    p_scope: input.scope,
    p_title: title,
    p_time: time.length === 5 ? `${time}:00` : time,
    p_suggested_spots: input.suggested_spots,
    p_is_extra: input.is_extra,
    p_celebrant: input.celebrant ? input.celebrant.trim() : null,
    p_liturgy_type: input.liturgy_type ? input.liturgy_type.trim() : null,
  });
  check(error);
  return data ?? 1;
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
    for (const table of ['altar_servers', 'masses', 'recurring_rules', 'mass_attendees', 'day_annotations']) {
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
