import type { EffectiveAttendee, Mass, MassAttendee, RecurringRule, AltarServer } from '../types/database';
import { dateKey, timeSlot, weekday, shiftDate } from './dates';

/** Shared by the schedule and personal services; an exception wins over a rule. */
export function attendanceState(mass: Mass, serverId: string, rules: RecurringRule[], exceptions: MassAttendee[]) {
  const hasRule = rules.some(rule => rule.server_id === serverId && matchesRule(mass, rule));
  const excused = exceptions.some(entry => entry.mass_id === mass.id && entry.server_id === serverId && entry.type === 'excused');
  return { hasRule, excused, action: excused ? 'restore' as const : hasRule ? 'excuse' as const : 'withdraw' as const };
}

/** Events count as finished one hour after start: signups close and presence confirmation opens. */
export function isPastEvent(mass: Pick<Mass, 'start_time'>, now: number = Date.now()): boolean {
  return Date.parse(mass.start_time) <= now - 3600000;
}

export function matchesRule(mass: Mass, rule: RecurringRule): boolean {
  const date = dateKey(mass.start_time);
  if (rule.day_of_week !== weekday(date) || rule.time_slot !== timeSlot(mass.start_time)) return false;
  if (rule.start_date && date < rule.start_date || rule.end_date && date > rule.end_date) return false;
  if (rule.frequency === 'monthly') {
    const ordinal = Math.ceil(Number(date.slice(8)) / 7);
    return (rule.month_weeks ?? [1]).includes(ordinal) || ((rule.month_weeks ?? []).includes(-1) && shiftDate(date, 7).slice(0, 7) !== date.slice(0, 7));
  }
  const interval = rule.interval_weeks ?? 1;
  if (interval === 1) return true;
  if (!rule.start_date) return false;
  const days = (Date.parse(date) - Date.parse(rule.start_date)) / 86400000;
  return Math.floor(days / 7) % interval === 0;
}

// Masses whose recurring attendance must be materialized as single entries
// before their rule is deleted, so past presence stays in the calendar while
// future dates disappear. Uses the same predicate as the SQL view.
export function ruleHistoryToPreserve(
  masses: Pick<Mass, 'id' | 'start_time'>[],
  exceptions: Pick<MassAttendee, 'mass_id' | 'server_id'>[],
  rule: RecurringRule,
  nowIso = new Date().toISOString(),
): string[] {
  return masses
    .filter(mass => mass.start_time < nowIso
      && matchesRule(mass as Mass, rule)
      && !exceptions.some(entry => entry.mass_id === mass.id && entry.server_id === rule.server_id))
    .map(mass => mass.id);
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
