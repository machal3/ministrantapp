import type { EffectiveAttendee, Mass, MassAttendee, RecurringRule, AltarServer } from '../types/database';
import { dateKey, timeSlot, weekday } from './dates';

export function matchesRule(mass: Mass, rule: RecurringRule): boolean {
  return rule.day_of_week === weekday(dateKey(mass.start_time)) && rule.time_slot === timeSlot(mass.start_time);
}

// Used by the explicit local demonstration. Supabase uses the equivalent SQL view.
export function aggregateAttendees(
  masses: Mass[], servers: AltarServer[], rules: RecurringRule[], exceptions: MassAttendee[],
): EffectiveAttendee[] {
  return masses.flatMap(mass => servers.flatMap(server => {
    const entry = exceptions.find(item => item.mass_id === mass.id && item.server_id === server.id);
    if (entry?.type === 'excused') return [];
    const recurring = rules.some(rule => rule.server_id === server.id && matchesRule(mass, rule));
    if (!recurring && entry?.type !== 'single') return [];
    return [{ mass_id: mass.id, server_id: server.id, name: server.name, rank: server.rank,
      attendance_type: recurring ? 'recurring' as const : 'single' as const }];
  })).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
}
