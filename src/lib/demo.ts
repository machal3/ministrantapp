import { RANKS } from '../types/database';
import type { AltarServer, Mass, MassAttendee, RecurringRule, ScheduleData } from '../types/database';
import { aggregateAttendees } from './attendance';
import { dateKey, monday, shiftDate, weekday, zonedIso } from './dates';

export type DemoState = Pick<ScheduleData, 'servers' | 'masses' | 'rules' | 'exceptions' | 'dayAnnotations'>;
const KEY = 'liturgy.demo.v1';

function initialDemo(): DemoState {
  const people: [string, AltarServer['rank']][] = [
    ['Jan Kowalski', 'Lektor'], ['Piotr Nowak', 'Ceremoniarz'],
    ['Antoni Wiśniewski', 'Ministrant'], ['Jakub Wójcik', 'Ministrant'],
    ['Michał Kamiński', 'Szafarz'], ['Franciszek Zieliński', 'Kandydat'],
  ];
  const servers = people.map(([name, rank], i) => ({ id: `demo-server-${i}`, name, rank }));
  const rules: RecurringRule[] = [
    ...servers.slice(0, 5).map(s => ({ id: crypto.randomUUID(), server_id: s.id, day_of_week: 0, time_slot: '10:30:00' })),
    ...servers.slice(0, 2).map(s => ({ id: crypto.randomUUID(), server_id: s.id, day_of_week: 1, time_slot: '18:00:00' })),
    { id: crypto.randomUUID(), server_id: servers[2].id, day_of_week: 3, time_slot: '18:00:00' },
    { id: crypto.randomUUID(), server_id: servers[5].id, day_of_week: 5, time_slot: '18:00:00' },
  ];
  const weekdaySeriesId = crypto.randomUUID();
  const startDay = shiftDate(monday(), -35);
  const masses: Mass[] = Array.from({ length: 56 }, (_, i) => shiftDate(startDay, i)).flatMap(day => {
    const isSun = weekday(day) === 0;
    const isFri = weekday(day) === 5;
    const times = isSun ? ['08:00', '10:30', '12:00', '18:00'] : ['07:00', '18:00'];
    const items: Mass[] = times.map(time => ({
      id: crypto.randomUUID(),
      start_time: zonedIso(day, time),
      title: 'Msza Święta',
      suggested_spots: 4,
      is_extra: false,
      celebrant: isSun && time === '10:30' ? 'ks. Proboszcz' : isSun && time === '12:00' ? 'ks. Wikariusz' : undefined,
      liturgy_type: isSun && time === '12:00' ? 'Chrzcielna' : undefined,
      series_id: isSun ? undefined : weekdaySeriesId,
    }));
    if (isFri) {
      items.push({
        id: crypto.randomUUID(),
        start_time: zonedIso(day, '17:15'),
        title: 'Droga Krzyżowa',
        suggested_spots: 2,
        is_extra: true,
        liturgy_type: 'Nabożeństwo',
      });
    }
    return items;
  });
  return { servers, masses, rules, exceptions: [] };
}

export function readDemo(): DemoState {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    const data: unknown = JSON.parse(raw);
    if (data && typeof data === 'object' && ['servers', 'masses', 'rules', 'exceptions'].every(key =>
      Array.isArray((data as Record<string, unknown>)[key]))) {
      const state = data as DemoState;
      for (const s of state.servers) {
        if (!RANKS.includes(s.rank)) s.rank = 'Ministrant';
      }
      return state;
    }
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
  const attendees = aggregateAttendees(masses, data.servers, data.rules, exceptions);

  const from30 = zonedIso(shiftDate(dateKey(), -30), '00:00');
  const to30 = zonedIso(shiftDate(dateKey(), 1), '00:00');
  const recentMasses = data.masses.filter(m => m.start_time >= from30 && m.start_time < to30);
  const recentExceptions = data.exceptions.filter(a => recentMasses.some(m => m.id === a.mass_id));
  const recentAttendees = aggregateAttendees(recentMasses, data.servers, data.rules, recentExceptions);
  const recentAttendance: Record<string, number> = {};
  for (const a of recentAttendees) {
    recentAttendance[a.server_id] = (recentAttendance[a.server_id] ?? 0) + 1;
  }

  return { ...data, masses, exceptions, attendees, recentAttendance };
}

