import { describe, expect, it } from 'vitest';
import { aggregateAttendees, ruleHistoryToPreserve } from '../src/lib/attendance';
import { dateKey, monday, shiftDate, timeSlot, weekBounds, zonedIso } from '../src/lib/dates';
import type { AltarServer, Mass, MassAttendee, RecurringRule } from '../src/types/database';

const servers: AltarServer[] = [{ id: 'jan', name: 'Jan Kowalski', rank: 'Lektor' }];
const mass: Mass = { id: 'm1', title: 'Msza Święta', start_time: zonedIso('2026-03-22', '10:30'), suggested_spots: 4, is_extra: false };
const rule: RecurringRule = { id: 'r1', server_id: 'jan', day_of_week: 0, time_slot: '10:30:00' };
const entry: MassAttendee = { id: 'a1', mass_id: 'm1', server_id: 'jan', type: 'single' };

describe('presence model', () => {
  it('counts an overlapping single and recurring signup exactly once as recurring', () => {
    expect(aggregateAttendees([mass], servers, [rule], [entry])).toEqual([
      { mass_id: 'm1', server_id: 'jan', name: 'Jan Kowalski', rank: 'Lektor', attendance_type: 'recurring' },
    ]);
  });
  it('excuses one date while keeping the rule for the next date, including DST', () => {
    const next = { ...mass, id: 'm2', start_time: zonedIso('2026-03-29', '10:30') };
    const result = aggregateAttendees([mass, next], servers, [rule], [{ ...entry, type: 'excused' }]);
    expect(result.map(a => a.mass_id)).toEqual(['m2']);
    expect(mass.start_time).toContain('09:30');
    expect(next.start_time).toContain('08:30');
  });
  it('does not assign a recurring rule to another hour or day', () => {
    expect(aggregateAttendees([{ ...mass, start_time: zonedIso('2026-03-23', '10:30') }], servers, [rule], [])).toEqual([]);
    expect(aggregateAttendees([{ ...mass, start_time: zonedIso('2026-03-22', '12:00') }], servers, [rule], [])).toEqual([]);
  });
  it('preserves a single signup after a rule is removed', () => {
    expect(aggregateAttendees([mass], servers, [], [entry])[0].attendance_type).toBe('single');
  });
});

describe('rule history preservation', () => {
  const nowIso = '2026-03-22T12:00:00.000Z';
  const past = { id: 'past', start_time: zonedIso('2026-03-15', '10:30') };
  const earlierToday = { id: 'today', start_time: zonedIso('2026-03-22', '10:30') };
  const future = { id: 'future', start_time: zonedIso('2026-03-29', '10:30') };
  const otherHour = { id: 'hour', start_time: zonedIso('2026-03-15', '12:00') };
  it('keeps past matching masses and skips future, other hours and existing entries', () => {
    expect(ruleHistoryToPreserve([past, earlierToday, future, otherHour], [], rule, nowIso)).toEqual(['past', 'today']);
    expect(ruleHistoryToPreserve([past], [{ mass_id: 'past', server_id: 'jan' }], rule, nowIso)).toEqual([]);
    expect(ruleHistoryToPreserve([past], [{ mass_id: 'past', server_id: 'other' }], rule, nowIso)).toEqual(['past']);
  });
});

describe('Polish calendar', () => {
  it('uses Warsaw instead of the machine timezone around midnight', () => {
    expect(dateKey('2026-09-20T22:30:00Z')).toBe('2026-09-21');
    expect(timeSlot('2026-09-20T22:30:00Z')).toBe('00:30:00');
    expect(monday('2026-09-20')).toBe('2026-09-20');
  });
  it('handles year boundaries and leap days', () => {
    expect(monday('2027-01-01')).toBe('2026-12-27');
    expect(shiftDate('2028-02-28', 1)).toBe('2028-02-29');
  });
  it('uses exclusive next-Monday boundaries even in a 167-hour week', () => {
    const [from, to] = weekBounds('2026-03-23');
    expect((Date.parse(to) - Date.parse(from)) / 3600000).toBe(167);
  });
  it('rejects nonexistent local times at the spring DST transition', () => {
    expect(() => zonedIso('2026-03-29', '02:30')).toThrow('nie istnieje');
  });
});
