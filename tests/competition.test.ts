import { describe, expect, it } from 'vitest';
import { advent, buildCompetition, competitionSeason, competitionWeek, DEFAULT_BADGE_DEFINITIONS, describeBadgeFilter, easter, encodeBadgeFilterFallback, levelFor, matchingBadgeServices, normalizeBadgeDefinition, normalizeBadgeFilter, sundayWeek, validateBadgeInput } from '../src/lib/competition';
import { aggregateAttendees } from '../src/lib/attendance';
import { shiftDate, zonedIso } from '../src/lib/dates';
import type { Mass, ScheduleData } from '../src/types/database';

function fixture(events: { day: string; time?: string; title?: string; category?: Mass['category']; liturgy_type?: string; celebrant?: string }[]): ScheduleData {
  const servers: ScheduleData['servers'] = [{ id: 'a', name: 'Jan Kowalski', rank: 'Lektor' }, { id: 'b', name: 'Piotr Nowak', rank: 'Ministrant' }];
  const masses = events.map((event, index) => ({ id: `m${index}`, start_time: zonedIso(event.day, event.time ?? '10:30'), title: event.title ?? 'Msza Święta', category: event.category ?? 'mass' as const, liturgy_type: event.liturgy_type, celebrant: event.celebrant ?? null, is_extra: false, suggested_spots: 4 }));
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
  it('uses Sunday to Saturday for series and Twój rytm', () => {
    expect(competitionWeek('2026-09-20')).toBe('2026-09-20');
    expect(competitionWeek('2026-09-21')).toBe('2026-09-20');
    expect(competitionWeek('2026-09-26')).toBe('2026-09-20');
    expect(competitionWeek('2026-09-27')).toBe('2026-09-27');
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
      { day: '2026-09-13' }, { day: '2026-09-14' }, { day: '2026-09-21' },
      { day: '2025-11-29' }, { day: '2026-09-16', category: 'other' }, { day: '2026-09-17' },
    ]);
    data.exceptions[5].type = 'excused';
    data.confirmations![5].attended = false;
    data.attendees = aggregateAttendees(data.masses, data.servers, data.rules, data.exceptions);
    const result = own(data, at('2026-09-20'));
    expect(result.serviceCount).toBe(2);
    expect(result.servicePoints).toBe(25);
    expect(result.bonusPoints).toBe(10);
    expect(result.badgePoints).toBe(10);
    expect(result.points).toBe(45);
  });
  it('counts recurring declarations, excluding their excused occurrence', () => {
    const data = fixture([{ day: '2026-09-14' }, { day: '2026-09-21' }]);
    data.rules = [{ id: 'r', server_id: 'a', day_of_week: 1, time_slot: '10:30:00' }];
    data.exceptions = [{ id: 'e', mass_id: 'm1', server_id: 'a', type: 'excused' }];
    data.confirmations![1].attended = false;
    data.attendees = aggregateAttendees(data.masses, data.servers, data.rules, data.exceptions);
    expect(own(data, at('2026-09-22')).points).toBe(25);
  });
  it('deduplicates the same event but allows two different services on one day', () => {
    const data = fixture([{ day: '2026-09-14' }, { day: '2026-09-14', time: '18:00' }]);
    data.attendees.push(data.attendees[0]);
    data.confirmations!.push(data.confirmations![0]);
    expect(own(data, at('2026-09-15'))).toMatchObject({ serviceCount: 2, bonusPoints: 10, badgePoints: 10, points: 50, streak: 1 });
  });
  it('counts by Polish local day during summer time', () => {
    const data = fixture([{ day: '2026-07-05', time: '00:30' }]);
    expect(own(data, at('2026-07-05')).points).toBe(20);
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
    expect(own(data, at('2026-11-28')).points).toBe(50);
    const fresh = own(data, at('2026-11-29', '08:00'));
    expect(fresh).toMatchObject({ points: 20, streak: 0, bonusPoints: 0, badgePoints: 10, serviceCount: 1 });
    expect(fresh.level.level).toBe(1);
    expect(data.masses).toHaveLength(3);
  });
  it('ranks ties equally and orders the history by date with bonuses included', () => {
    const data = fixture(['2026-09-14', '2026-09-15', '2026-09-18'].map(day => ({ day })));
    data.attendees.push(...data.attendees.map(row => ({ ...row, server_id: 'b', name: 'Piotr Nowak' })));
    data.confirmations!.push(...data.confirmations!.map(row => ({ ...row, server_id: 'b' })));
    const result = buildCompetition(data, at('2026-09-20'));
    expect(result.profiles.map(profile => profile.place)).toEqual([1, 1]);
    expect(result.profiles[0].entries.map(entry => entry.day)).toEqual(['2026-09-18', '2026-09-15', '2026-09-15', '2026-09-14', '2026-09-14']);
  });
});

describe('badges', () => {
  it('ships three basic badges editable by the administrator', () => {
    expect(DEFAULT_BADGE_DEFINITIONS.map(b => b.id)).toEqual(['first', 'ten', 'fifty']);
    const pointsById = Object.fromEntries(DEFAULT_BADGE_DEFINITIONS.map(b => [b.id, b.points]));
    expect(pointsById).toMatchObject({ first: 10, ten: 25, fifty: 120 });
    expect(DEFAULT_BADGE_DEFINITIONS.every(b => b.target >= 1 && ['sunrise', 'star', 'flame', 'calendar', 'medal', 'heart'].includes(b.icon))).toBe(true);
  });
  it('awards the first badge after one service and adds a history entry', () => {
    const data = fixture([{ day: '2026-09-14', time: '07:00' }]);
    const profile = own(data, at('2026-09-20'));
    expect(profile.badges.find(b => b.id === 'first')).toMatchObject({ earned: true, value: 1, target: 1 });
    expect(profile.badges.find(b => b.id === 'ten')).toMatchObject({ earned: false, value: 1, target: 10 });
    expect(profile.badgePoints).toBe(10);
    const entry = profile.entries.find(e => e.id === 'badge-first');
    expect(entry).toBeDefined();
    expect(entry?.points).toBe(10);
    expect(entry?.title).toBe('Odznaka: Pierwszy krok');
  });
  it('awards the ten-services badge exactly at the target', () => {
    const days = Array.from({ length: 10 }, (_, i) => ({ day: shiftDate('2026-09-07', i), time: '18:00' }));
    const profile = own(fixture(days), at('2026-09-20'));
    expect(profile.badges.find(b => b.id === 'ten')).toMatchObject({ earned: true, value: 10 });
    // first (10) + ten (25) = 35
    expect(profile.badgePoints).toBe(35);
    expect(profile.entries.some(e => e.id === 'badge-ten' && e.points === 25)).toBe(true);
  });
  it('respects administrator definitions, including an empty list', () => {
    const base = fixture([{ day: '2026-09-14' }, { day: '2026-09-15' }]);
    const custom = {
      ...base,
      badgeDefinitions: [{ id: 'custom', name: 'Własna', description: 'Opis', icon: 'star' as const, points: 7, target: 2, filters: {} }],
    };
    const profile = own(custom, at('2026-09-20'));
    expect(profile.badges).toHaveLength(1);
    expect(profile.badges[0]).toMatchObject({ id: 'custom', earned: true, points: 7 });
    expect(profile.badgePoints).toBe(7);
    const empty = own({ ...base, badgeDefinitions: [] }, at('2026-09-20'));
    expect(empty.badges).toHaveLength(0);
    expect(empty.badgePoints).toBe(0);
    expect(empty.entries.some(e => e.id.startsWith('badge-'))).toBe(false);
  });
  it('validates administrator input and normalizes stored rows', () => {
    expect(() => validateBadgeInput({ name: '  ', description: '', icon: 'medal', points: 10, target: 5 })).toThrow('Wpisz nazwę odznaki.');
    expect(() => validateBadgeInput({ name: 'X', description: '', icon: 'medal', points: -1, target: 5 })).toThrow();
    expect(() => validateBadgeInput({ name: 'X', description: '', icon: 'medal', points: 10, target: 0 })).toThrow();
    expect(() => validateBadgeInput({ name: 'X', description: '', icon: 'rocket' as never, points: 10, target: 5 })).toThrow('Wybierz ikonę');
    expect(validateBadgeInput({ name: '  Nazwa  ', description: ' Opis ', icon: 'star', points: 10, target: 5 }))
      .toMatchObject({ name: 'Nazwa', description: 'Opis', icon: 'star' });
    expect(validateBadgeInput({ name: 'Kościelna', description: 'Opis', icon: 'church', points: 20, target: 5 }))
      .toMatchObject({ name: 'Kościelna', icon: 'church' });
    expect(validateBadgeInput({ name: 'Dzwonnik', description: '', icon: 'bell', points: 15, target: 3 }))
      .toMatchObject({ name: 'Dzwonnik', icon: 'bell' });
    expect(normalizeBadgeDefinition({ id: 'a', name: 'A', description: '', icon: 'star', points: 5, target: 2 })).toMatchObject({ id: 'a' });
    expect(normalizeBadgeDefinition({ id: 'a', name: '', description: '', icon: 'star', points: 5, target: 2 })).toBeNull();
    expect(normalizeBadgeDefinition({ id: 'a', name: 'A', description: '', icon: 'star', points: 5, target: 0 })).toBeNull();
  });
  it('keeps the Easter helper for future badge conditions', () => {
    expect(easter(2026)).toBe('2026-04-05');
    expect(easter(2027)).toBe('2027-03-28');
  });
});

describe('badge conditions', () => {
  const def = (filters: Record<string, unknown>, target = 1) => ({
    id: 't', name: 'Test', description: '', icon: 'medal' as const, points: 10, target, filters,
  });
  const valueOf = (data: ScheduleData, filters: Record<string, unknown>, target = 1) =>
    own({ ...data, badgeDefinitions: [def(filters, target)] }, at('2026-09-21')).badges[0];

  it('counts only services on selected weekdays', () => {
    // 2026-09-14 = Monday, 2026-09-20 = Sunday.
    const data = fixture([{ day: '2026-09-14' }, { day: '2026-09-15' }, { day: '2026-09-20' }]);
    expect(valueOf(data, { weekdays: [0] })).toMatchObject({ value: 1, earned: true });
    expect(valueOf(data, { weekdays: [0] }, 2)).toMatchObject({ value: 1, earned: false });
    expect(valueOf(data, { weekdays: [1, 2] }, 2)).toMatchObject({ value: 2, earned: true });
  });

  it('counts services in a time range, including overnight ranges', () => {
    const data = fixture([
      { day: '2026-09-14', time: '07:00' },
      { day: '2026-09-15', time: '18:00' },
      { day: '2026-09-16', time: '21:30' },
    ]);
    expect(valueOf(data, { timeFrom: '17:00', timeTo: '22:00' }, 2)).toMatchObject({ value: 2, earned: true });
    expect(valueOf(data, { timeFrom: '04:00', timeTo: '09:00' })).toMatchObject({ value: 1, earned: true });
    expect(valueOf(data, { timeFrom: '22:00', timeTo: '23:59' })).toMatchObject({ value: 0, earned: false });
    const night = fixture([{ day: '2026-12-24', time: '22:00' }, { day: '2026-12-24', time: '10:30' }]);
    const nightProfile = own({ ...night, badgeDefinitions: [def({ timeFrom: '18:00', timeTo: '04:00' })] }, at('2026-12-25'));
    expect(nightProfile.badges[0]).toMatchObject({ value: 1, earned: true });
  });

  it('counts services on specific dates only', () => {
    const data = fixture([{ day: '2026-09-14' }, { day: '2026-09-15' }]);
    expect(valueOf(data, { dates: ['2026-09-15'] })).toMatchObject({ value: 1, earned: true });
    expect(valueOf(data, { dates: ['2026-09-16'] })).toMatchObject({ value: 0, earned: false });
  });

  it('matches event names ignoring case and Polish characters', () => {
    const data = fixture([
      { day: '2026-09-14', title: 'Msza roratnia' },
      { day: '2026-09-15', title: 'RÓŻANIEC' },
      { day: '2026-09-16', title: 'Msza Święta' },
    ]);
    expect(valueOf(data, { title: 'rorat' })).toMatchObject({ value: 1, earned: true });
    expect(valueOf(data, { title: 'rozaniec' })).toMatchObject({ value: 1, earned: true });
    expect(valueOf(data, { title: 'droga krzyżowa' })).toMatchObject({ value: 0, earned: false });
  });

  it('matches celebrant and occasion only when the event has them', () => {
    const data = fixture([
      { day: '2026-09-14', celebrant: 'ks. Proboszcz' },
      { day: '2026-09-15', celebrant: 'ks. Jan, ks. Marek', liturgy_type: 'Chrzcielna' },
      { day: '2026-09-16' },
    ]);
    expect(valueOf(data, { celebrant: 'proboszcz' })).toMatchObject({ value: 1, earned: true });
    expect(valueOf(data, { celebrant: 'marek' })).toMatchObject({ value: 1, earned: true });
    expect(valueOf(data, { celebrant: 'wikariusz' })).toMatchObject({ value: 0, earned: false });
    expect(valueOf(data, { occasion: 'chrzcielna' })).toMatchObject({ value: 1, earned: true });
    expect(valueOf(data, { occasion: 'ślub' })).toMatchObject({ value: 0, earned: false });
  });

  it('filters by event kind (Mass vs devotion)', () => {
    const data = fixture([
      { day: '2026-09-14', title: 'Msza Święta', category: 'mass' },
      { day: '2026-09-15', title: 'Różaniec', category: 'devotion' },
    ]);
    expect(valueOf(data, { category: 'mass' })).toMatchObject({ value: 1, earned: true });
    expect(valueOf(data, { category: 'devotion' })).toMatchObject({ value: 1, earned: true });
    expect(valueOf(data, {}, 2)).toMatchObject({ value: 2, earned: true });
  });

  it('matches day marks: Sundays, solemnities, feasts, memorials and annotated days', () => {
    const data = fixture([{ day: '2026-09-14' }, { day: '2026-09-15' }, { day: '2026-09-20' }]);
    data.dayAnnotations = [
      { day: '2026-09-14', label: 'Uroczystość Podwyższenia Krzyża' },
      { day: '2026-09-15', label: 'Wspomnienie' },
    ];
    expect(valueOf(data, { dayMark: 'sunday' })).toMatchObject({ value: 1, earned: true });
    expect(valueOf(data, { dayMark: 'solemnity' })).toMatchObject({ value: 1, earned: true });
    expect(valueOf(data, { dayMark: 'feast' })).toMatchObject({ value: 0, earned: false });
    expect(valueOf(data, { dayMark: 'memorial' })).toMatchObject({ value: 1, earned: true });
    expect(valueOf(data, { dayMark: 'annotated' }, 2)).toMatchObject({ value: 2, earned: true });
    expect(valueOf(data, { dayMarkText: 'krzyża' })).toMatchObject({ value: 1, earned: true });
    expect(valueOf(data, { dayMark: 'solemnity', dayMarkText: 'wszystkich świętych' })).toMatchObject({ value: 0, earned: false });
  });

  it('combines filters with AND and optionally counts distinct days', () => {
    const data = fixture([
      { day: '2026-09-13', time: '18:00', title: 'Msza Święta' },
      { day: '2026-09-13', time: '19:30', title: 'Msza Święta' },
      { day: '2026-09-20', time: '18:00', title: 'Msza Święta' },
      { day: '2026-09-20', time: '18:00', title: 'Różaniec', category: 'devotion' },
    ]);
    // 2026-09-13 and 2026-09-20 are Sundays.
    const sundayEvening = { weekdays: [0], timeFrom: '17:00', timeTo: '20:00' };
    expect(valueOf(data, sundayEvening, 4)).toMatchObject({ value: 4, earned: true });
    expect(valueOf(data, { ...sundayEvening, perDay: true }, 3)).toMatchObject({ value: 2, earned: false });
    expect(valueOf(data, { ...sundayEvening, perDay: true }, 2)).toMatchObject({ value: 2, earned: true });
  });

  it('awards the badge at the target-th matching service', () => {
    const data = fixture([{ day: '2026-09-14' }, { day: '2026-09-16' }, { day: '2026-09-18' }]);
    const profile = own({ ...data, badgeDefinitions: [def({ weekdays: [1, 3, 5] }, 2)] }, at('2026-09-21'));
    expect(profile.badges[0]).toMatchObject({ earned: true, value: 2 });
    expect(profile.entries.find(e => e.id === 'badge-t')?.day).toBe('2026-09-16');
    expect(profile.badgePoints).toBe(10);
  });

  it('skips corrupted definitions instead of breaking the whole ranking', () => {
    const base = fixture([{ day: '2026-09-14' }]);
    const profile = own({ ...base, badgeDefinitions: [
      { id: '', name: '', description: '', icon: 'medal', points: 5, target: 1, filters: {} },
      { id: 'ok', name: 'Dobra', description: '', icon: 'star', points: 5, target: 1, filters: {} },
    ] as never }, at('2026-09-21'));
    expect(profile.badges.map(b => b.id)).toEqual(['ok']);
  });

  it('describes conditions briefly for lists and cards', () => {
    expect(describeBadgeFilter({})).toBe('');
    expect(describeBadgeFilter({ kind: 'single_week' })).toBe('w jednym tygodniu (nd–sob)');
    expect(describeBadgeFilter({ kind: 'single_week', title: 'Roraty' })).toBe('w jednym tygodniu (nd–sob) · „Roraty”');
    expect(describeBadgeFilter({ kind: 'single_month' })).toBe('w jednym miesiącu');
    expect(describeBadgeFilter({ kind: 'custom_period', dateFrom: '2026-12-01', dateTo: '2026-12-24' })).toBe('w okresie 1 gru–24 gru');
    expect(describeBadgeFilter({ kind: 'streak' })).toBe('seria „Twój rytm” (min. 2/tydz.)');
    expect(describeBadgeFilter({ kind: 'streak', category: 'mass' })).toBe('seria „Twój rytm” (min. 2/tydz.) · Msze Święte');
    expect(describeBadgeFilter({ weekdays: [0], timeFrom: '17:00', timeTo: '20:00' })).toContain('Niedz');
    expect(describeBadgeFilter({ title: 'Roraty' })).toContain('Roraty');
    expect(describeBadgeFilter({ minServers: 1, maxServers: 1 })).toBe('służba solo (samemu)');
    expect(describeBadgeFilter({ minServers: 2, maxServers: 2 })).toBe('w duecie (2 osoby)');
    expect(describeBadgeFilter({ minServers: 4 })).toBe('liczna asysta (min. 4 służących)');
    expect(describeBadgeFilter({ kind: 'single_month', minServers: 3, maxServers: 5 })).toBe('w jednym miesiącu · asysta 3–5 służących');
    expect(describeBadgeFilter({ dayMark: 'solemnity' })).toContain('uroczysto');
    expect(describeBadgeFilter({ perDay: true })).toContain('1 dziennie');
  });

  it('evaluates single_week badge within Sunday-Saturday boundaries', () => {
    // Week 1 (2026-09-06..2026-09-12): 2 services
    // Week 2 (2026-09-13..2026-09-19): 3 services (Monday, Tuesday, Wednesday)
    const data = fixture([
      { day: '2026-09-07' }, { day: '2026-09-09' },
      { day: '2026-09-14' }, { day: '2026-09-15' }, { day: '2026-09-16' },
    ]);
    expect(valueOf(data, { kind: 'single_week' }, 3)).toMatchObject({ value: 3, earned: true });
    expect(valueOf(data, { kind: 'single_week' }, 4)).toMatchObject({ value: 3, earned: false });

    const profile = own({ ...data, badgeDefinitions: [def({ kind: 'single_week' }, 3)] }, at('2026-09-21'));
    expect(profile.entries.find(e => e.id === 'badge-t')?.day).toBe('2026-09-16');
  });

  it('evaluates single_month badge within calendar month boundaries', () => {
    // September: 2 services
    // October: 4 services
    const data = fixture([
      { day: '2026-09-10' }, { day: '2026-09-20' },
      { day: '2026-10-02' }, { day: '2026-10-05' }, { day: '2026-10-15' }, { day: '2026-10-25' },
    ]);
    const earnedProfile = own({ ...data, badgeDefinitions: [def({ kind: 'single_month' }, 4)] }, at('2026-10-30'));
    expect(earnedProfile.badges[0]).toMatchObject({ value: 4, earned: true });
    expect(earnedProfile.entries.find(e => e.id === 'badge-t')?.day).toBe('2026-10-25');

    const unearnedProfile = own({ ...data, badgeDefinitions: [def({ kind: 'single_month' }, 5)] }, at('2026-10-30'));
    expect(unearnedProfile.badges[0]).toMatchObject({ value: 4, earned: false });
  });

  it('evaluates custom_period badge with dateFrom and dateTo boundaries', () => {
    const data = fixture([
      { day: '2026-11-28' }, // Before period (and in previous season)
      { day: '2026-12-02' }, // In period
      { day: '2026-12-10' }, // In period
      { day: '2026-12-20' }, // In period
      { day: '2026-12-25' }, // After period
    ]);
    const filter = { kind: 'custom_period' as const, dateFrom: '2026-12-01', dateTo: '2026-12-24' };
    const earned = own({ ...data, badgeDefinitions: [def(filter, 3)] }, at('2026-12-26'));
    expect(earned.badges[0]).toMatchObject({ value: 3, earned: true });

    const unearned = own({ ...data, badgeDefinitions: [def(filter, 4)] }, at('2026-12-26'));
    expect(unearned.badges[0]).toMatchObject({ value: 3, earned: false });
  });

  it('evaluates streak badge for Twój rytm (min. 2 services per consecutive week)', () => {
    // Week 1 (2026-09-06..): 2 services
    // Week 2 (2026-09-13..): 2 services
    // Week 3 (2026-09-20..): 2 services
    const continuousData = fixture([
      { day: '2026-09-07' }, { day: '2026-09-09' },
      { day: '2026-09-14' }, { day: '2026-09-16' },
      { day: '2026-09-21' }, { day: '2026-09-22' },
    ]);
    const profile = own({ ...continuousData, badgeDefinitions: [def({ kind: 'streak' }, 3)] }, at('2026-09-25'));
    expect(profile.badges[0]).toMatchObject({ value: 3, earned: true });
    expect(profile.entries.find(e => e.id === 'badge-t')?.day).toBe('2026-09-22');

    // Broken streak: Week 2 has only 1 service
    const brokenData = fixture([
      { day: '2026-09-07' }, { day: '2026-09-09' },
      { day: '2026-09-14' },
      { day: '2026-09-21' }, { day: '2026-09-22' },
    ]);
    const brokenProfile = own({ ...brokenData, badgeDefinitions: [def({ kind: 'streak' }, 2)] }, at('2026-09-25'));
    expect(brokenProfile.badges[0]).toMatchObject({ value: 1, earned: false });
  });

  it('evaluates server count filter (solo, duo, and large group) in whole season and time frames', () => {
    const data = fixture([{ day: '2026-09-14' }, { day: '2026-09-15' }, { day: '2026-09-16' }]);
    data.servers.push({ id: 'c', name: 'Adam', rank: 'Ministrant' }, { id: 'd', name: 'Tomasz', rank: 'Ministrant' });

    data.confirmations!.push(
      { mass_id: 'm1', server_id: 'b', attended: true, confirmed_at: data.masses[1].start_time },
      { mass_id: 'm2', server_id: 'b', attended: true, confirmed_at: data.masses[2].start_time },
      { mass_id: 'm2', server_id: 'c', attended: true, confirmed_at: data.masses[2].start_time },
      { mass_id: 'm2', server_id: 'd', attended: true, confirmed_at: data.masses[2].start_time },
    );

    const solo = own({ ...data, badgeDefinitions: [def({ minServers: 1, maxServers: 1 }, 1)] }, at('2026-09-21'));
    expect(solo.badges[0]).toMatchObject({ value: 1, earned: true });

    const duo = own({ ...data, badgeDefinitions: [def({ kind: 'single_month', minServers: 2, maxServers: 2 }, 1)] }, at('2026-09-21'));
    expect(duo.badges[0]).toMatchObject({ value: 1, earned: true });

    const large = own({ ...data, badgeDefinitions: [def({ minServers: 4 }, 1)] }, at('2026-09-21'));
    expect(large.badges[0]).toMatchObject({ value: 1, earned: true });

    data.confirmations!.find(c => c.mass_id === 'm2' && c.server_id === 'd')!.attended = false;
    const largeAfterAbsence = own({ ...data, badgeDefinitions: [def({ minServers: 4 }, 1)] }, at('2026-09-21'));
    expect(largeAfterAbsence.badges[0]).toMatchObject({ value: 0, earned: false });
  });

  it('normalizes stored filters and validates new ones', () => {
    expect(normalizeBadgeFilter(null)).toEqual({});
    expect(normalizeBadgeFilter({ kind: 'single_week' })).toEqual({ kind: 'single_week' });
    expect(normalizeBadgeFilter({ kind: 'single_month' })).toEqual({ kind: 'single_month' });
    expect(normalizeBadgeFilter({ kind: 'custom_period', dateFrom: '2026-12-01', dateTo: '2026-12-24' })).toEqual({ kind: 'custom_period', dateFrom: '2026-12-01', dateTo: '2026-12-24' });
    expect(normalizeBadgeFilter({ minServers: 2, maxServers: 2 })).toEqual({ minServers: 2, maxServers: 2 });
    expect(normalizeBadgeFilter({ kind: 'single_month', minServers: 2, maxServers: 2 })).toEqual({ kind: 'single_month', minServers: 2, maxServers: 2 });
    expect(normalizeBadgeFilter({ kind: 'streak' })).toEqual({ kind: 'streak' });
    expect(normalizeBadgeFilter({ kind: 'total' })).toEqual({});
    expect(normalizeBadgeFilter({ kind: 'invalid' })).toEqual({});
    expect(normalizeBadgeFilter({ weekdays: [0, 8, -1, 'x', 0], unknown: 1 })).toEqual({ weekdays: [0] });
    expect(normalizeBadgeFilter({ weekdays: [0, 1, 2, 3, 4, 5, 6] })).toEqual({});
    expect(normalizeBadgeFilter({ timeFrom: '25:00', timeTo: '18:00' })).toEqual({ timeTo: '18:00' });
    expect(normalizeBadgeFilter({ dates: ['2026-09-14', 'nope'] })).toEqual({ dates: ['2026-09-14'] });
    expect(normalizeBadgeFilter({ category: 'other' })).toEqual({});
    expect(normalizeBadgeFilter({ dayMark: 'party' })).toEqual({});
    expect(validateBadgeInput({ name: 'X', description: '', icon: 'medal', points: 10, target: 2, filters: { weekdays: [0] } }).filters)
      .toEqual({ weekdays: [0] });
    expect(() => validateBadgeInput({ name: 'X', description: '', icon: 'medal', points: 10, target: 1, filters: { minServers: 5, maxServers: 2 } }))
      .toThrow('Minimalna liczba służących nie może być większa niż maksymalna');
    expect(() => validateBadgeInput({ name: 'X', description: '', icon: 'medal', points: 10, target: 1, filters: { dates: ['2026-02-30'] } }))
      .toThrow('Nieprawidłowa data');
    expect(() => validateBadgeInput({ name: 'X', description: '', icon: 'medal', points: 10, target: 1, filters: { timeFrom: '18:00', timeTo: '18:00' } }))
      .toThrow('nie mogą być takie same');
  });

  it('encodes and decodes fallback metadata when kind is stripped by unmigrated database', () => {
    // 1. Kind streak with no user dayMarkText
    const payload1 = encodeBadgeFilterFallback({ kind: 'streak' }, 'flame');
    expect(payload1).toMatchObject({ kind: 'streak', dayMarkText: '__meta:k=streak' });

    // Simulate Supabase stripping 'kind' because of old RPC whitelist
    const { kind: _, ...dbRow1 } = payload1;
    expect(dbRow1).not.toHaveProperty('kind');
    const normalized1 = normalizeBadgeFilter(dbRow1);
    expect(normalized1.kind).toBe('streak');
    expect(normalized1.dayMarkText).toBeUndefined();

    // 2. Kind streak with user dayMarkText
    const payload2 = encodeBadgeFilterFallback({ kind: 'streak', dayMarkText: 'Roraty' });
    expect(payload2.dayMarkText).toBe('__meta:k=streak|Roraty');
    const { kind: __, ...dbRow2 } = payload2;
    const normalized2 = normalizeBadgeFilter(dbRow2);
    expect(normalized2.kind).toBe('streak');
    expect(normalized2.dayMarkText).toBe('Roraty');

    // 3. New icon fallback encoding for unmigrated database
    const payload3 = encodeBadgeFilterFallback({ kind: 'streak' }, 'trophy');
    expect(payload3.dayMarkText).toBe('__meta:k=streak;i=trophy');
    const def = normalizeBadgeDefinition({
      id: 'custom-streak',
      name: 'Mistrz serii',
      description: 'Test',
      icon: 'medal', // Database fell back to medal
      points: 25,
      target: 2,
      filters: { dayMarkText: '__meta:k=streak;i=trophy' }, // 'kind' stripped
    });
    expect(def).toBeTruthy();
    expect(def?.icon).toBe('trophy');
    expect(def?.filters.kind).toBe('streak');
    expect(def?.filters.dayMarkText).toBeUndefined();

    // 4. Legacy __kind: prefix fallback is also supported
    const legacyNormalized = normalizeBadgeFilter({ dayMarkText: '__kind:streak|Święto' });
    expect(legacyNormalized.kind).toBe('streak');
    expect(legacyNormalized.dayMarkText).toBe('Święto');

    // 5. servers count fallback encoding
    const payloadServers = encodeBadgeFilterFallback({ kind: 'single_month', minServers: 2, maxServers: 2 }, 'trophy');
    expect(payloadServers.dayMarkText).toContain('k=single_month');
    expect(payloadServers.dayMarkText).toContain('smin=2');
    expect(payloadServers.dayMarkText).toContain('smax=2');
    const { kind: ___, ...dbRowServers } = payloadServers;
    const normalizedServers = normalizeBadgeFilter(dbRowServers);
    expect(normalizedServers.kind).toBe('single_month');
    expect(normalizedServers.minServers).toBe(2);
    expect(normalizedServers.maxServers).toBe(2);
  });

  it('correctly evaluates a streak badge recovered from unmigrated database fallback', () => {
    // 2 consecutive weeks of 2+ services
    const data = fixture([
      { day: '2026-09-07' }, { day: '2026-09-09' },
      { day: '2026-09-14' }, { day: '2026-09-16' },
    ]);
    // The definition has NO kind in filters object, only the fallback in dayMarkText (as stored by PostgreSQL)
    const rawDef = {
      id: 'streak-badge',
      name: 'Seria Twój rytm',
      description: 'Min. 2 tygodnie',
      icon: 'flame' as const,
      points: 30,
      target: 2,
      filters: { dayMarkText: '__meta:k=streak' },
    };
    const comp = buildCompetition({ ...data, badgeDefinitions: [rawDef] }, at('2026-09-20'));
    const profile = comp.profiles.find(p => p.server.id === 'a')!;
    expect(profile.badges[0]).toMatchObject({
      id: 'streak-badge',
      name: 'Seria Twój rytm',
      value: 2,
      target: 2,
      earned: true,
      points: 30,
    });
    expect(profile.badgePoints).toBe(30);
  });

  it('groups weeks correctly for sundayWeek helper', () => {
    // Sunday 2026-09-06 to Saturday 2026-09-12 should all map to 2026-09-06
    expect(sundayWeek('2026-09-06')).toBe('2026-09-06');
    expect(sundayWeek('2026-09-07')).toBe('2026-09-06');
    expect(sundayWeek('2026-09-12')).toBe('2026-09-06');
    // Sunday 2026-09-13 starts the next week
    expect(sundayWeek('2026-09-13')).toBe('2026-09-13');
  });

  it('exposes matching services for previews', () => {
    const data = fixture([{ day: '2026-09-14' }, { day: '2026-09-15' }]);
    const services = data.masses;
    expect(matchingBadgeServices({ filters: { weekdays: [1] } }, services, new Map())).toHaveLength(1);
    expect(matchingBadgeServices({ filters: {} }, services, new Map())).toHaveLength(2);
  });

  it('keeps the Easter helper for date-based conditions', () => {
    expect(easter(2026)).toBe('2026-04-05');
    expect(easter(2027)).toBe('2027-03-28');
  });
});

describe('competition participation and opting out', () => {
  it('marks users as not participating by default when competitionParticipants is empty', () => {
    const data = fixture([{ day: '2026-09-14' }, { day: '2026-09-15' }]);
    data.competitionParticipants = [];
    const comp = buildCompetition(data, at('2026-09-20'));
    const profileA = comp.profiles.find(p => p.server.id === 'a')!;
    const profileB = comp.profiles.find(p => p.server.id === 'b')!;
    expect(profileA.isParticipant).toBe(false);
    expect(profileB.isParticipant).toBe(false);
    expect(profileA.place).toBe(0);
    expect(profileB.place).toBe(0);
  });

  it('calculates points in background for declared masses even when opted out', () => {
    const data = fixture([{ day: '2026-09-14' }, { day: '2026-09-15' }]);
    data.confirmations = [];
    data.competitionParticipants = [];
    const comp = buildCompetition(data, at('2026-09-20'));
    const profileA = comp.profiles.find(p => p.server.id === 'a')!;
    expect(profileA.isParticipant).toBe(false);
    expect(profileA.points).toBe(50);
    expect(profileA.place).toBe(0);
  });

  it('ranks only active participants while preserving background points for non-participants', () => {
    const data = fixture([{ day: '2026-09-14' }, { day: '2026-09-15' }]);
    data.competitionParticipants = ['b'];
    const comp = buildCompetition(data, at('2026-09-20'));
    const profileA = comp.profiles.find(p => p.server.id === 'a')!;
    const profileB = comp.profiles.find(p => p.server.id === 'b')!;
    expect(profileA.isParticipant).toBe(false);
    expect(profileA.place).toBe(0);
    expect(profileB.isParticipant).toBe(true);
    expect(profileB.place).toBe(1);
  });

  it('immediately surfaces full calculated points upon joining the competition with auto-confirmations', () => {
    const data = fixture([{ day: '2026-09-14' }, { day: '2026-09-15' }]);
    data.confirmations = [];
    data.competitionParticipants = [];
    let comp = buildCompetition(data, at('2026-09-20'));
    const optedOut = comp.profiles.find(p => p.server.id === 'a')!;
    expect(optedOut.isParticipant).toBe(false);
    expect(optedOut.points).toBe(50);
    expect(optedOut.place).toBe(0);

    data.competitionParticipants = ['a'];
    data.confirmations = data.masses.map(m => ({ mass_id: m.id, server_id: 'a', attended: true, confirmed_at: m.start_time }));
    comp = buildCompetition(data, at('2026-09-20'));
    const joined = comp.profiles.find(p => p.server.id === 'a')!;
    expect(joined.isParticipant).toBe(true);
    expect(joined.place).toBe(1);
    expect(joined.points).toBe(50);
  });
});
