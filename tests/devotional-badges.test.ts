import { describe, expect, it } from 'vitest';
import { buildCompetition } from '../src/lib/competition';
import { zonedIso } from '../src/lib/dates';
import type { Mass, ScheduleData } from '../src/types/database';

type Event = { day: string; title: string; category?: Mass['category']; time?: string; liturgy_type?: string };
function fixture(events: Event[]): ScheduleData {
  const masses = events.map((event, i) => ({ id: `m${i}`, title: event.title, category: event.category ?? 'devotion' as const, start_time: zonedIso(event.day, event.time ?? '18:00'), liturgy_type: event.liturgy_type, is_extra: true, suggested_spots: 4 }));
  return { servers: [{ id: 'a', name: 'Jan', rank: 'Lektor' }], masses, rules: [], exceptions: [], attendees: [], confirmations: masses.map(m => ({ mass_id: m.id, server_id: 'a', attended: true, confirmed_at: m.start_time })) };
}
const profile = (data: ScheduleData, now = '2026-11-20T20:00:00Z') => buildCompetition(data, new Date(now)).profiles[0];
const badge = (data: ScheduleData, id: string) => profile(data).badges.find(b => b.id === id)!;

describe('devotional badges', () => {
  it.each([
    ['adoration', 'Adoracja Najświętszego Sakramentu', ['2026-01-10'], 'devotion'],
    ['adorationFive', 'Adoracja', ['2026-01-10', '2026-01-11', '2026-01-12', '2026-01-13', '2026-01-14'], 'devotion'],
    ['rosary', 'Nabożeństwo różańcowe', ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'], 'devotion'],
    ['may', 'Nabożeństwo majowe', ['2026-05-01', '2026-05-02', '2026-05-03'], 'devotion'],
    ['june', 'Nabożeństwo czerwcowe', ['2026-06-01', '2026-06-02', '2026-06-03'], 'devotion'],
    ['stations', 'Droga Krzyżowa', ['2026-02-20', '2026-02-27', '2026-03-06'], 'devotion'],
    ['lamentations', 'Gorzkie Żale', ['2026-02-22', '2026-03-01'], 'devotion'],
    ['rorate', 'Msza roratnia', ['2025-12-01', '2025-12-02', '2025-12-03'], 'mass'],
    ['corpusChristi', 'Boże Ciało', ['2026-06-04'], 'mass'],
    ['mercySunday', 'Niedziela Miłosierdzia Bożego', ['2026-04-12'], 'mass'],
    ['palmSunday', 'Niedziela Palmowa', ['2026-03-29'], 'mass'],
    ['ashWednesday', 'Środa Popielcowa', ['2026-02-18'], 'mass'],
    ['chaplet', 'Koronka do Miłosierdzia Bożego', ['2026-09-01', '2026-09-02', '2026-09-03'], 'devotion'],
    ['firstSaturdays', 'Nabożeństwo pierwszosobotnie', ['2026-01-03', '2026-02-07', '2026-03-07'], 'devotion'],
  ] as const)('awards %s once on the day the target is reached', (id, title, days, category) => {
    const data = fixture(days.map(day => ({ day, title, category })));
    expect(badge(data, id)).toMatchObject({ earned: true, value: days.length });
    const entry = profile(data).entries.filter(e => e.id === `badge-${id}`);
    expect(entry).toHaveLength(1);
    expect(entry[0].day).toBe(days[days.length - 1]);
    expect(entry[0].points).toBe(badge(data, id).points);
    data.confirmations!.pop();
    expect(badge(data, id).earned).toBe(false);
  });

  it('requires distinct first Fridays, counts Polish dates and ignores ordinary Fridays', () => {
    const data = fixture([
      { day: '2026-02-06', title: 'Msza', category: 'mass' },
      { day: '2026-02-06', title: 'Adoracja' },
      { day: '2026-02-13', title: 'Msza', category: 'mass' },
      { day: '2026-03-06', title: 'Msza', category: 'mass' },
      { day: '2026-05-01', time: '00:30', title: 'Czuwanie' },
    ]);
    expect(data.masses[4].start_time).toContain('2026-04-30');
    expect(badge(data, 'firstFridays')).toMatchObject({ earned: true, value: 3 });
    expect(badge(data, 'nineFridays')).toMatchObject({ earned: false, value: 2 });
  });

  it('requires nine consecutive months and preserves the first award time', () => {
    const days = ['2025-12-05', '2026-01-02', '2026-02-06', '2026-03-06', '2026-04-03', '2026-05-01', '2026-06-05', '2026-07-03', '2026-08-07', '2026-09-04'];
    const data = fixture(days.map(day => ({ day, title: 'Nabożeństwo' })));
    expect(badge(data, 'nineFridays')).toMatchObject({ earned: true, value: 9 });
    expect(profile(data).entries.find(e => e.id === 'badge-nineFridays')?.day).toBe('2026-08-07');
    data.confirmations = data.confirmations!.filter(c => c.mass_id !== 'm3');
    expect(badge(data, 'nineFridays')).toMatchObject({ earned: false, value: 6 });
  });

  it('does not multiply devotional progress for several events on one date', () => {
    const data = fixture(Array.from({ length: 5 }, (_, i) => ({ day: '2026-09-10', title: 'Adoracja', time: `${12 + i}:00` })));
    expect(badge(data, 'adorationFive')).toMatchObject({ earned: false, value: 1 });
    expect(profile(data).entries.filter(e => e.id === 'badge-adoration')).toHaveLength(1);
  });

  it.each([
    ['adoration', 'Adoracja Krzyża', '2026-04-03', 'devotion'],
    ['adoration', 'Adoracja', '2026-09-10', 'mass'],
    ['adoration', 'Spotkanie o adoracji', '2026-09-10', 'other'],
    ['firstSaturdays', 'Nabożeństwo pierwszosobotnie', '2026-03-14', 'devotion'],
    ['may', 'Nabożeństwo majowe', '2026-06-01', 'devotion'],
    ['june', 'Nabożeństwo czerwcowe', '2026-05-01', 'devotion'],
    ['stations', 'Droga Krzyżowa', '2026-04-10', 'devotion'],
    ['lamentations', 'Gorzkie Żale', '2026-02-15', 'devotion'],
    ['rorate', 'Roraty', '2025-12-25', 'mass'],
    ['corpusChristi', 'Boże Ciało', '2026-06-05', 'mass'],
    ['mercySunday', 'Niedziela Miłosierdzia', '2026-04-19', 'mass'],
    ['palmSunday', 'Niedziela Palmowa', '2026-04-05', 'mass'],
    ['ashWednesday', 'Środa Popielcowa', '2026-02-25', 'mass'],
    ['chaplet', 'Koronka do św. Michała', '2026-09-10', 'devotion'],
  ] as const)('rejects mismatched event for %s (%s)', (id, title, day, category) => {
    expect(badge(fixture([{ title, day, category }]), id).value).toBe(0);
  });

  it('uses occasion, ignores case and Polish accents, and excludes missing/negative confirmations', () => {
    const data = fixture([{ day: '2026-03-01', title: 'Nabożeństwo', liturgy_type: 'GORZKIE   ŻALE' }, { day: '2026-03-08', title: 'gorzkie zale' }]);
    expect(badge(data, 'lamentations').earned).toBe(true);
    data.confirmations![0].attended = false;
    expect(badge(data, 'lamentations').value).toBe(1);
    data.confirmations = [];
    expect(badge(data, 'lamentations').value).toBe(0);
  });

  it('excludes future and previous-season events and respects reset timestamps', () => {
    const data = fixture([{ day: '2025-11-29', title: 'Adoracja' }, { day: '2026-09-01', title: 'Adoracja' }, { day: '2026-09-02', title: 'Adoracja' }]);
    expect(profile(data, '2026-09-01T20:00:00Z').badges.find(b => b.id === 'adorationFive')?.value).toBe(1);
    data.competitionState = { season: '2025-11-30', reset_at: '2026-09-02T00:00:00Z', reset_revision: 1, revision: 1 };
    expect(badge(data, 'adoration').earned).toBe(true);
    expect(profile(data).entries.find(e => e.id === 'badge-adoration')).toBeUndefined();
    expect(profile(data, '2026-12-01T20:00:00Z').badges.find(b => b.id === 'adoration')?.earned).toBe(false);
  });
});
