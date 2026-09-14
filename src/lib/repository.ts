import { configurationError, isDemo, supabase } from './supabase';
import { demoWeek, writeDemo } from './demo';
import { dateKey, shiftDate, timeSlot, weekday, weekBounds, zonedIso } from './dates';
import { requireAdminSession } from './admin';
import { RANKS } from '../types/database';
import type { AdminSession, AltarServer, AttendanceType, NewMass, RecurringMassesInput, RecurringRule, ScheduleData } from '../types/database';

function client() {
  if (!supabase) throw new Error(configurationError || 'Brak połączenia z Supabase.');
  return supabase;
}

function check(error: { message: string } | null): void {
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
  const results = await Promise.allSettled([
    allRows((a, b) => db.from('altar_servers').select('*').order('name').order('id').range(a, b)),
    allRows((a, b) => db.from('masses').select('*').gte('start_time', from).lt('start_time', to).order('start_time').order('id').range(a, b)),
    allRows((a, b) => db.from('recurring_rules').select('*').order('id').range(a, b)),
    allRows((a, b) => db.from('mass_attendees').select('*, masses!inner(start_time)')
      .gte('masses.start_time', from).lt('masses.start_time', to).order('id').range(a, b)),
  ] as const);
  for (const result of results) if (result.status === 'rejected') throw result.reason;
  const [serversResult, massesResult, rulesResult, exceptionsResult] = results;
  if (serversResult.status !== 'fulfilled' || massesResult.status !== 'fulfilled' || rulesResult.status !== 'fulfilled' || exceptionsResult.status !== 'fulfilled') throw new Error('Nie udało się pobrać grafiku.');
  const masses = massesResult.value;
  const attendees: ScheduleData['attendees'] = [];
  // Chunk IDs to keep REST URLs bounded. Ordering is stable for pagination.
  for (let index = 0; index < masses.length; index += 80) {
    attendees.push(...await allRows((a, b) => db.from('effective_attendees').select('*')
      .in('mass_id', masses.slice(index, index + 80).map(m => m.id))
      .order('mass_id').order('server_id').range(a, b)));
  }
  attendees.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  return { servers: serversResult.value, masses, rules: rulesResult.value, exceptions: exceptionsResult.value, attendees };
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

export async function deleteRule(id: string): Promise<void> {
  if (isDemo) return writeDemo(state => { state.rules = state.rules.filter(r => r.id !== id); });
  check((await client().from('recurring_rules').delete().eq('id', id)).error);
}

export async function addMass(mass: NewMass, session: AdminSession | null): Promise<void> {
  const admin = await requireAdminSession(session);
  if (isDemo) return writeDemo(state => { state.masses.push({ ...mass, id: crypto.randomUUID() }); });
  check((await client().rpc('admin_add_mass', { p_token: admin.token, p_start_time: mass.start_time, p_title: mass.title, p_suggested_spots: mass.suggested_spots })).error);
}

export async function addRecurringMasses(input: RecurringMassesInput, session: AdminSession | null): Promise<number> {
  const admin = await requireAdminSession(session);
  const title = input.title.trim();
  if (!title) throw new Error('Wpisz nazwę nabożeństwa.');
  if (input.suggested_spots < 1) throw new Error('Sugerowana liczba miejsc musi być dodatnią liczbą całkowitą.');
  if (!input.days.length) throw new Error('Wybierz co najmniej jeden dzień tygodnia.');
  if (input.end_date < input.start_date) throw new Error('Data końcowa musi być późniejsza lub równa dacie początkowej.');

  if (isDemo) {
    let count = 0;
    writeDemo(state => {
      let curr = input.start_date;
      while (curr <= input.end_date) {
        if (input.days.includes(weekday(curr))) {
          const startTime = zonedIso(curr, input.time);
          state.masses.push({
            id: crypto.randomUUID(),
            title,
            start_time: startTime,
            suggested_spots: input.suggested_spots,
            is_extra: input.is_extra,
          });
          count++;
        }
        curr = shiftDate(curr, 1);
      }
    });
    return count;
  }

  const { data, error } = await client().rpc('admin_add_recurring_masses', {
    p_token: admin.token,
    p_title: title,
    p_suggested_spots: input.suggested_spots,
    p_is_extra: input.is_extra,
    p_days: input.days,
    p_time: input.time.length === 5 ? `${input.time}:00` : input.time,
    p_start_date: input.start_date,
    p_end_date: input.end_date,
  });
  check(error);
  return data ?? 0;
}

export async function deleteMass(id: string, session: AdminSession | null, scope: 'single' | 'future' = 'single'): Promise<void> {
  const admin = await requireAdminSession(session);
  if (isDemo) return writeDemo(state => {
    const target = state.masses.find(m => m.id === id);
    if (!target) throw new Error('Nie znaleziono nabożeństwa do usunięcia.');
    if (scope === 'future') {
      const targetTime = timeSlot(target.start_time);
      const targetDow = weekday(dateKey(target.start_time));
      state.masses = state.masses.filter(m => !(
        m.start_time >= target.start_time &&
        dateKey(m.start_time) >= dateKey(target.start_time) &&
        weekday(dateKey(m.start_time)) === targetDow &&
        timeSlot(m.start_time) === targetTime &&
        m.title === target.title
      ));
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

export async function updateMassTime(id: string, startTime: string, session: AdminSession | null): Promise<void> {
  const admin = await requireAdminSession(session);
  if (!Number.isFinite(Date.parse(startTime))) throw new Error('Podaj prawidłową godzinę.');
  if (isDemo) return writeDemo(state => {
    const found = state.masses.find(m => m.id === id);
    if (!found) throw new Error('To nabożeństwo już nie istnieje.');
    found.start_time = startTime;
  });
  check((await client().rpc('admin_update_mass_time', { p_token: admin.token, p_id: id, p_start_time: startTime })).error);
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
    for (const table of ['altar_servers', 'masses', 'recurring_rules', 'mass_attendees']) {
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
