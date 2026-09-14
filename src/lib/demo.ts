import type { AltarServer, Mass, MassAttendee, RecurringRule, ScheduleData } from '../types/database';
import { aggregateAttendees } from './attendance';
import { monday, shiftDate, weekday, zonedIso } from './dates';

export type DemoState = Pick<ScheduleData, 'servers' | 'masses' | 'rules' | 'exceptions'>;
const KEY = 'liturgy.demo.v1';

function initialDemo(): DemoState {
  const people: [string, AltarServer['rank']][] = [
    ['Jan Kowalski', 'Lektor'], ['Piotr Nowak', 'Ceremoniarz'],
    ['Antoni Wiśniewski', 'Ministrant Światła'], ['Jakub Wójcik', 'Ministrant Krzyża'],
    ['Michał Kamiński', 'Choirzysta'], ['Franciszek Zieliński', 'Kandydat'],
  ];
  const servers = people.map(([name, rank], i) => ({ id: `demo-server-${i}`, name, rank }));
  const rules: RecurringRule[] = [
    ...servers.slice(0, 5).map(s => ({ id: crypto.randomUUID(), server_id: s.id, day_of_week: 0, time_slot: '10:30:00' })),
    ...servers.slice(0, 2).map(s => ({ id: crypto.randomUUID(), server_id: s.id, day_of_week: 1, time_slot: '18:00:00' })),
    { id: crypto.randomUUID(), server_id: servers[2].id, day_of_week: 3, time_slot: '18:00:00' },
    { id: crypto.randomUUID(), server_id: servers[5].id, day_of_week: 5, time_slot: '18:00:00' },
  ];
  const masses: Mass[] = Array.from({ length: 7 }, (_, i) => shiftDate(monday(), i)).flatMap(day =>
    (weekday(day) === 0 ? ['08:00', '10:30', '12:00', '18:00'] : ['07:00', '18:00']).map(time => ({
      id: crypto.randomUUID(), start_time: zonedIso(day, time), title: 'Msza Święta', suggested_spots: 4, is_extra: false,
    })),
  );
  return { servers, masses, rules, exceptions: [] };
}

export function readDemo(): DemoState {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    const data: unknown = JSON.parse(raw);
    if (data && typeof data === 'object' && ['servers', 'masses', 'rules', 'exceptions'].every(key =>
      Array.isArray((data as Record<string, unknown>)[key]))) return data as DemoState;
    throw new Error('Dane podglądu są uszkodzone. Usuń klucz liturgy.demo.v1 z pamięci przeglądarki.');
  }
  const data = initialDemo();
  localStorage.setItem(KEY, JSON.stringify(data));
  return data;
}

export function writeDemo(change: (state: DemoState) => void): void {
  const state = readDemo();
  change(state);
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new Event('liturgy-demo-change'));
}

export function demoWeek(from: string, to: string): ScheduleData {
  const data = readDemo();
  const masses = data.masses.filter(m => m.start_time >= from && m.start_time < to)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const exceptions: MassAttendee[] = data.exceptions.filter(a => masses.some(m => m.id === a.mass_id));
  return { ...data, masses, exceptions, attendees: aggregateAttendees(masses, data.servers, data.rules, exceptions) };
}
