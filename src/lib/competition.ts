import { dateKey, polishDate, shiftDate, shiftMonth, timeSlot, weekday, zonedIso } from './dates';
import { eventCategory } from './eventCategory';
import type { Mass, ScheduleData } from '../types/database';

export const POINTS = { weekday: 15, sunday: 10, weekly: 10, streakStep: 5, maxWeekly: 30 };

/** The season changes at 00:00 Europe/Warsaw on the first Sunday of Advent. */
export function advent(year: number): string {
  const first = `${year}-11-27`;
  return shiftDate(first, (7 - weekday(first)) % 7);
}

export function competitionSeason(now: Date) {
  const day = dateKey(now);
  const year = Number(day.slice(0, 4));
  const startYear = day >= advent(year) ? year : year - 1;
  return { start: advent(startYear), end: advent(startYear + 1), label: `${startYear}/${startYear + 1}` };
}

// Gregorian Easter (Meeus/Jones/Butcher); used to distinguish the Easter Vigil
// from other events with similar names, without treating every Saturday as a vigil.
export function easter(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = (h + l - 7 * m + 114) % 31 + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function competitionWeek(day: string): string {
  return shiftDate(day, -((weekday(day) + 6) % 7));
}

export function levelFor(points: number) {
  const level = Math.floor((1 + Math.sqrt(1 + Math.max(0, points) * .08)) / 2);
  const floor = 50 * level * (level - 1);
  const next = 50 * level * (level + 1);
  const names = ['Pierwszy krok', 'Dobry rytm', 'Stała obecność', 'Siła wytrwałości', 'Inspiracja', 'Mistrz regularności'];
  return { level, name: names[Math.min(level - 1, names.length - 1)], floor, next, progress: points - floor, required: next - floor };
}

export type PointEntry = { id: string; day: string; title: string; detail: string; points: number; occurred_at: string };
export type Badge = { id: string; name: string; description: string; icon: 'sunrise' | 'star' | 'flame' | 'calendar' | 'medal' | 'heart'; value: number; target: number; earned: boolean };

function badge(id: string, name: string, description: string, icon: Badge['icon'], value: number, target: number): Badge {
  return { id, name, description, icon, value: Math.min(value, target), target, earned: value >= target };
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pl');
}

export function buildCompetition(data: Pick<ScheduleData, 'servers' | 'masses' | 'attendees' | 'confirmations' | 'pointAdjustments' | 'competitionState'>, now: Date) {
  const season = competitionSeason(now);
  const from = Date.parse(zonedIso(season.start, '00:00'));
  const until = Math.min(now.getTime(), Date.parse(zonedIso(season.end, '00:00')));
  const masses = new Map(data.masses.filter(mass => {
    const time = Date.parse(mass.start_time);
    return time >= from && time < until && eventCategory(mass) !== 'other';
  }).map(mass => [mass.id, mass]));
  const byServer = new Map<string, Map<string, Mass>>();
  for (const attendee of data.confirmations ?? []) {
    if (!attendee.attended) continue;
    const mass = masses.get(attendee.mass_id);
    if (!mass) continue;
    const own = byServer.get(attendee.server_id) ?? new Map<string, Mass>();
    own.set(mass.id, mass); // One event is never counted twice for the same person.
    byServer.set(attendee.server_id, own);
  }
  const currentWeek = competitionWeek(dateKey(now));
  const state = data.competitionState?.season === season.start ? data.competitionState : undefined;
  const pointsFrom = state?.reset_at ? Date.parse(state.reset_at) : from;
  const profiles = data.servers.map(server => {
    const services = [...(byServer.get(server.id)?.values() ?? [])].sort((a, b) => a.start_time.localeCompare(b.start_time));
    const weeks = new Map<string, Mass[]>();
    const entries: PointEntry[] = [];
    const sundayDays = new Set<string>();
    let mornings = 0, christmas = 0, vigils = 0;
    for (const mass of services) {
      const day = dateKey(mass.start_time);
      const sunday = weekday(day) === 0;
      const week = competitionWeek(day);
      weeks.set(week, [...(weeks.get(week) ?? []), mass]);
      if (Date.parse(mass.start_time) >= pointsFrom) entries.push({ id: mass.id, day, occurred_at: mass.start_time, title: mass.title, detail: `${timeSlot(mass.start_time).slice(0, 5)} · ${sunday ? 'Niedziela' : 'Służba w tygodniu'}`, points: sunday ? POINTS.sunday : POINTS.weekday });
      if (sunday) sundayDays.add(day);
      if (eventCategory(mass) === 'mass') {
        const time = timeSlot(mass.start_time);
        if (time >= '04:00:00' && time < '09:00:00') mornings++;
        const title = normalize(`${mass.title} ${mass.liturgy_type ?? ''}`);
        if (/pasterk/.test(title) && ((day.endsWith('-12-24') && time >= '18:00:00') || (day.endsWith('-12-25') && time < '04:00:00'))) christmas++;
        const easterDay = easter(Number(day.slice(0, 4)));
        if (/wigili\w* paschal/.test(title) && ((day === shiftDate(easterDay, -1) && time >= '18:00:00') || (day === easterDay && time < '04:00:00'))) vigils++;
      }
    }
    let run = 0, bestStreak = 0, previous = '', bonusPoints = 0;
    const runs = new Map<string, number>();
    for (const [week, events] of [...weeks].sort(([a], [b]) => a.localeCompare(b))) {
      if (events.length < 2) { run = 0; previous = week; continue; }
      run = previous && shiftDate(previous, 7) === week ? run + 1 : 1;
      previous = week;
      bestStreak = Math.max(bestStreak, run);
      runs.set(week, run);
      const points = Math.min(POINTS.maxWeekly, POINTS.weekly + (run - 1) * POINTS.streakStep);
      if (Date.parse(events[1].start_time) >= pointsFrom) {
        bonusPoints += points;
        entries.push({ id: `week-${week}`, day: dateKey(events[1].start_time), occurred_at: events[1].start_time, title: 'Bonus za regularność', detail: `${run}. tydzień serii · ${polishDate(week, { day: 'numeric', month: 'short' })} – ${polishDate(shiftDate(week, 6), { day: 'numeric', month: 'short' })}`, points });
      }
    }
    // An unfinished current week does not break last week's streak.
    const streak = runs.get(currentWeek) ?? runs.get(shiftDate(currentWeek, -7)) ?? 0;
    let fullMonths = 0, monthProgress = 0, monthTarget = 0;
    for (let month = season.start.slice(0, 7); month <= dateKey(now).slice(0, 7); month = shiftMonth(month, 1)) {
      const sundays: string[] = [];
      for (let day = `${month}-01`; day.slice(0, 7) === month; day = shiftDate(day, 1)) {
        if (weekday(day) === 0) sundays.push(day);
      }
      const eligible = sundays.every(day => day >= season.start && day < season.end);
      const count = sundays.filter(day => sundayDays.has(day)).length;
      if (eligible && count === sundays.length) fullMonths++;
      if (month === dateKey(now).slice(0, 7)) { monthProgress = eligible ? count : 0; monthTarget = sundays.length; }
    }
    const badges = [
      badge('first', 'Pierwszy krok', 'Zdobądź punkty za pierwszą służbę w sezonie.', 'heart', services.length, 1),
      badge('ten', 'Pomocna dłoń', 'Podejmij 10 służb w jednym sezonie.', 'medal', services.length, 10),
      badge('fifty', 'Filar wspólnoty', 'Podejmij 50 służb w jednym sezonie.', 'medal', services.length, 50),
      badge('morning', 'Jutrzenka', 'Służ na 5 Mszach rozpoczynających się od 4:00 do 8:59.', 'sunrise', mornings, 5),
      badge('christmas', 'Blask Betlejem', 'Służ na Pasterce: 24 grudnia od 18:00 lub 25 grudnia przed 4:00.', 'star', christmas, 1),
      badge('vigil', 'Światło Paschy', 'Służ na Wigilii Paschalnej: od 18:00 w Wielką Sobotę do 4:00 w Niedzielę Wielkanocną.', 'flame', vigils, 1),
      badge('sundays', 'Wierny niedzielom', 'Służ w każdą niedzielę jednego miesiąca kalendarzowego w sezonie.', 'calendar', fullMonths, 1),
      badge('four', 'Dobry rytm', 'Utrzymaj serię 4 tygodni, w każdym co najmniej 2 służby.', 'flame', bestStreak, 4),
      badge('twelve', 'Niezłomny', 'Utrzymaj serię 12 tygodni, w każdym co najmniej 2 służby.', 'medal', bestStreak, 12),
    ];
    const earnedPoints = entries.reduce((total, entry) => total + entry.points, 0);
    const adjustments = (data.pointAdjustments ?? []).filter(item => item.season === season.start && item.server_id === server.id && item.revision > (state?.reset_revision ?? 0));
    const adjustmentPoints = adjustments.reduce((sum, item) => sum + item.delta, 0);
    entries.push(...adjustments.map(item => ({ id: `adjustment-${item.id}`, day: dateKey(item.created_at), occurred_at: item.created_at, title: item.mode === 'set' ? 'Ustawienie wyniku przez administratora' : 'Korekta administratora', detail: item.reason || 'Zmiana punktacji', points: item.delta })));
    const rawPoints = earnedPoints + adjustmentPoints;
    const points = Math.max(0, rawPoints);
    return { server, points, rawPoints, adjustmentPoints, bonusPoints, servicePoints: earnedPoints - bonusPoints, serviceCount: services.length, streak, bestStreak, weekCount: weeks.get(currentWeek)?.length ?? 0, monthProgress, monthTarget, badges, level: levelFor(points), entries: entries.reverse().sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)), place: 0 };
  }).sort((a, b) => b.points - a.points || a.server.name.localeCompare(b.server.name, 'pl'));
  let place = 0;
  profiles.forEach((profile, index) => { if (!index || profile.points !== profiles[index - 1].points) place = index + 1; profile.place = place; });
  return { season, profiles };
}

export type CompetitionProfile = ReturnType<typeof buildCompetition>['profiles'][number];
