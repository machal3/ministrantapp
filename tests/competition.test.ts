import { describe, expect, it } from 'vitest';
import { advent, buildCompetition, competitionSeason, competitionWeek, easter, levelFor } from '../src/lib/competition';
import { aggregateAttendees } from '../src/lib/attendance';
import { shiftDate, zonedIso } from '../src/lib/dates';
import type { Mass, ScheduleData } from '../src/types/database';

function fixture(events: { day: string; time?: string; title?: string; category?: Mass['category']; liturgy_type?: string }[]): ScheduleData {
  const servers: ScheduleData['servers'] = [{ id: 'a', name: 'Jan Kowalski', rank: 'Lektor' }, { id: 'b', name: 'Piotr Nowak', rank: 'Ministrant' }];
  const masses = events.map((event, index) => ({ id: `m${index}`, start_time: zonedIso(event.day, event.time ?? '10:30'), title: event.title ?? 'Msza Święta', category: event.category ?? 'mass' as const, liturgy_type: event.liturgy_type, is_extra: false, suggested_spots: 4 }));
  const exceptions: ScheduleData['exceptions'] = masses.map(mass => ({ id: mass.id, mass_id: mass.id, server_id: 'a', type: 'single' }));
  return { servers, masses, exceptions, rules: [], attendees: aggregateAttendees(masses, servers, [], exceptions), confirmations: masses.map(mass => ({ mass_id: mass.id, server_id: 'a', attended: true, confirmed_at: mass.start_time })) };
}
const at = (day: string, time = '23:00') => new Date(zonedIso(day, time));
const own = (data: ScheduleData, now: Date) => buildCompetition(data, now).profiles.find(profile => profile.server.id === 'a')!;

describe('liturgical seasons and levels', () => {
  it('finds Advent including both extremes of its possible dates', () => {
    expect(advent(2022)).toBe('2022-11-27');
    expect(advent(2023)).toBe('2023-12-03');
    expect(advent(2025)).toBe('2025-11-30');
    expect(advent(2026)).toBe('2026-11-29');
  });
  it('resets at Polish midnight, not UTC midnight or January 1', () => {
    expect(competitionSeason(at('2026-11-28', '23:59')).label).toBe('2025/2026');
    expect(competitionSeason(at('2026-11-29', '00:00')).label).toBe('2026/2027');
    expect(competitionSeason(at('2026-01-01')).label).toBe('2025/2026');
  });
  it('uses Monday to Sunday for series regardless of schedule navigation', () => {
    expect(competitionWeek('2026-09-20')).toBe('2026-09-14');
    expect(competitionWeek('2026-09-21')).toBe('2026-09-21');
  });
  it('calculates every level boundary and keeps progressing beyond named levels', () => {
    for (const [points, expected] of [[0, 1], [99, 1], [100, 2], [299, 2], [300, 3], [1000, 5], [5500, 11]]) {
      const result = levelFor(points);
      expect(result.level).toBe(expected);
      expect(result.progress).toBeGreaterThanOrEqual(0);
      expect(result.progress).toBeLessThan(result.required);
    }
  });
});

describe('scoring and weekly streaks', () => {
  it('scores weekdays and Sundays, skips future, previous season, other events and absences', () => {
    const data = fixture([
      { day: '2026-09-14' }, { day: '2026-09-20' }, { day: '2026-09-21' },
      { day: '2025-11-29' }, { day: '2026-09-16', category: 'other' }, { day: '2026-09-17' },
    ]);
    data.exceptions[5].type = 'excused';
    data.confirmations![5].attended = false;
    data.attendees = aggregateAttendees(data.masses, data.servers, data.rules, data.exceptions);
    const result = own(data, at('2026-09-20'));
    expect(result.serviceCount).toBe(2);
    expect(result.servicePoints).toBe(25);
    expect(result.bonusPoints).toBe(10);
    expect(result.points).toBe(35);
  });
  it('counts recurring declarations, excluding their excused occurrence', () => {
    const data = fixture([{ day: '2026-09-14' }, { day: '2026-09-21' }]);
    data.rules = [{ id: 'r', server_id: 'a', day_of_week: 1, time_slot: '10:30:00' }];
    data.exceptions = [{ id: 'e', mass_id: 'm1', server_id: 'a', type: 'excused' }];
    data.confirmations![1].attended = false;
    data.attendees = aggregateAttendees(data.masses, data.servers, data.rules, data.exceptions);
    expect(own(data, at('2026-09-22')).points).toBe(15);
  });
  it('deduplicates the same event but allows two different services on one day', () => {
    const data = fixture([{ day: '2026-09-14' }, { day: '2026-09-14', time: '18:00' }]);
    data.attendees.push(data.attendees[0]);
    data.confirmations!.push(data.confirmations![0]);
    expect(own(data, at('2026-09-15'))).toMatchObject({ serviceCount: 2, bonusPoints: 10, points: 40, streak: 1 });
  });
  it('counts by Polish local day during summer time', () => {
    const data = fixture([{ day: '2026-07-05', time: '00:30' }]);
    expect(own(data, at('2026-07-05')).points).toBe(10);
  });
  it('increases the bonus once per week, caps it, and retains the streak in an unfinished week', () => {
    const data = fixture(Array.from({ length: 6 }, (_, index) => [
      { day: shiftDate('2026-08-03', index * 7) }, { day: shiftDate('2026-08-04', index * 7) }, { day: shiftDate('2026-08-05', index * 7) },
    ]).flat());
    expect(own(data, at('2026-09-14'))).toMatchObject({ bonusPoints: 130, bestStreak: 6, streak: 6, weekCount: 0 });
    expect(own(data, at('2026-09-21')).streak).toBe(0);
  });
  it('breaks the series after a missed week and starts its bonus from 10 again', () => {
    const data = fixture(['2026-08-03', '2026-08-04', '2026-08-10', '2026-08-11', '2026-08-24', '2026-08-25'].map(day => ({ day })));
    expect(own(data, at('2026-08-26'))).toMatchObject({ bonusPoints: 35, bestStreak: 2, streak: 1 });
  });
  it('resets points, streak, level and seasonal badges without deleting history', () => {
    const data = fixture([{ day: '2026-11-27' }, { day: '2026-11-28' }, { day: '2026-11-29', time: '07:00' }]);
    expect(own(data, at('2026-11-28')).points).toBe(40);
    const fresh = own(data, at('2026-11-29', '08:00'));
    expect(fresh).toMatchObject({ points: 10, streak: 0, bonusPoints: 0, serviceCount: 1 });
    expect(fresh.level.level).toBe(1);
    expect(data.masses).toHaveLength(3);
  });
  it('ranks ties equally and orders the history by date with bonuses included', () => {
    const data = fixture(['2026-09-14', '2026-09-15', '2026-09-18'].map(day => ({ day })));
    data.attendees.push(...data.attendees.map(row => ({ ...row, server_id: 'b', name: 'Piotr Nowak' })));
    data.confirmations!.push(...data.confirmations!.map(row => ({ ...row, server_id: 'b' })));
    const result = buildCompetition(data, at('2026-09-20'));
    expect(result.profiles.map(profile => profile.place)).toEqual([1, 1]);
    expect(result.profiles[0].entries.map(entry => entry.day)).toEqual(['2026-09-18', '2026-09-15', '2026-09-15', '2026-09-14']);
  });
});

describe('badges', () => {
  it('counts only morning Masses, not devotions or midnight celebrations', () => {
    const data = fixture([{ day: '2026-09-14', time: '04:00' }, { day: '2026-09-15', time: '08:59' }, { day: '2026-09-16', time: '09:00' }, { day: '2026-09-17', time: '00:00' }, { day: '2026-09-18', time: '07:00', category: 'devotion' }]);
    expect(own(data, at('2026-09-20')).badges.find(b => b.id === 'morning')).toMatchObject({ value: 2, earned: false });
  });
  it('requires every distinct Sunday in the month, including a fifth Sunday', () => {
    const data = fixture(['2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22', '2026-03-22'].map(day => ({ day })));
    expect(own(data, at('2026-03-30')).badges.find(b => b.id === 'sundays')!.earned).toBe(false);
    const full = fixture(['2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22', '2026-03-29'].map(day => ({ day })));
    expect(own(full, at('2026-03-29')).badges.find(b => b.id === 'sundays')!.earned).toBe(true);
  });
  it('does not award a full month for the single Sunday at the season boundary', () => {
    expect(own(fixture([{ day: '2025-11-30' }]), at('2025-11-30')).badges.find(b => b.id === 'sundays')!.earned).toBe(false);
  });
  it('identifies Pasterka from name or occasion only on the Christmas night', () => {
    const yes = fixture([{ day: '2025-12-24', time: '22:00', liturgy_type: 'Pasterka' }]);
    expect(own(yes, at('2025-12-25')).badges.find(b => b.id === 'christmas')!.earned).toBe(true);
    const no = fixture([{ day: '2026-01-10', time: '22:00', title: 'Pasterka' }, { day: '2025-12-25', time: '10:00', title: 'Pasterka' }]);
    expect(own(no, at('2026-01-11')).badges.find(b => b.id === 'christmas')!.earned).toBe(false);
  });
  it('identifies Easter Vigil even after midnight, excluding wrong dates and ordinary Easter Mass', () => {
    expect(easter(2026)).toBe('2026-04-05');
    expect(easter(2027)).toBe('2027-03-28');
    for (const event of [{ day: '2026-04-04', time: '20:00' }, { day: '2026-04-05', time: '00:30' }]) {
      const data = fixture([{ ...event, title: 'Liturgia Wigilii Paschalnej' }]);
      expect(own(data, at('2026-04-06')).badges.find(b => b.id === 'vigil')!.earned).toBe(true);
    }
    const data = fixture([{ day: '2026-04-05', title: 'Msza Zmartwychwstania' }, { day: '2026-04-11', time: '20:00', title: 'Wigilia Paschalna' }]);
    expect(own(data, at('2026-04-12')).badges.find(b => b.id === 'vigil')!.earned).toBe(false);
  });
});
