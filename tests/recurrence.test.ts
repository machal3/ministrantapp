import { describe, expect, it } from 'vitest';
import { matchesRule } from '../src/lib/attendance';
import { zonedIso } from '../src/lib/dates';
import type { RecurringRule } from '../src/types/database';
const base: RecurringRule = { id: 'r', server_id: 's', day_of_week: 0, time_slot: '10:30:00' };
const match = (date: string, changes: Partial<RecurringRule>) => matchesRule({ id: 'm', title: '', is_extra: false, suggested_spots: 1, start_time: zonedIso(date, '10:30') }, { ...base, ...changes });
describe('recurrence calendar', () => {
  it('keeps fortnightly rhythm through DST with inclusive date bounds', () => {
    const r = { interval_weeks: 2, start_date: '2026-03-22', end_date: '2026-04-19' };
    expect(['2026-03-15','2026-03-22','2026-03-29','2026-04-05','2026-04-19','2026-05-03'].map(d => match(d, r))).toEqual([false,true,false,true,true,false]);
  });
  it('selects first and third Sundays, and last Sunday across leap February', () => {
    expect(['2026-03-01','2026-03-08','2026-03-15','2026-03-22'].map(d => match(d, { frequency: 'monthly', month_weeks: [1,3] }))).toEqual([true,false,true,false]);
    expect(match('2028-02-27', { frequency: 'monthly', month_weeks: [-1] })).toBe(true);
    expect(match('2028-02-20', { frequency: 'monthly', month_weeks: [-1] })).toBe(false);
    expect(match('2028-02-27', { frequency: 'monthly', month_weeks: [5] })).toBe(false);
    expect(match('2026-03-29', { frequency: 'monthly', month_weeks: [5,-1] })).toBe(true);
  });
  it('anchors a multiweek cycle to its starting date across a year boundary', () => {
    expect(match('2027-01-03', { interval_weeks: 3, start_date: '2026-12-28' })).toBe(true);
    expect(match('2027-01-10', { interval_weeks: 3, start_date: '2026-12-28' })).toBe(false);
    expect(match('2027-01-24', { interval_weeks: 3, start_date: '2026-12-28' })).toBe(true);
  });
});
