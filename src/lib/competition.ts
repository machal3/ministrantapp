import { dateKey, polishDate, shiftDate, shiftMonth, timeSlot, weekday, zonedIso } from './dates';
import { eventCategory } from './eventCategory';
import type { Mass, ScheduleData } from '../types/database';

export const POINTS = {
  weekday: 15,
  sunday: 10,
  weekly: 10,
  streakStep: 5,
  maxWeekly: 30,
  badges: {
    first: 10,
    ten: 25,
    morning: 30,
    four: 40,
    christmas: 50,
    vigil: 50,
    sundays: 60,
    twelve: 100,
    fifty: 120,
    firstFridays: 35,
    nineFridays: 100,
    firstSaturdays: 35,
    adoration: 15,
    adorationFive: 40,
    rosary: 35,
    may: 25,
    june: 25,
    stations: 35,
    lamentations: 25,
    rorate: 35,
    corpusChristi: 30,
    mercySunday: 25,
    palmSunday: 25,
    ashWednesday: 25,
    chaplet: 25,
  },
} as const;

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
export type Badge = { id: string; name: string; description: string; icon: 'sunrise' | 'star' | 'flame' | 'calendar' | 'medal' | 'heart'; value: number; target: number; earned: boolean; points: number };

function badge(id: string, name: string, description: string, icon: Badge['icon'], value: number, target: number, points: number): Badge {
  return { id, name, description, icon, value: Math.min(value, target), target, earned: value >= target, points };
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pl').replace(/ł/g, 'l').replace(/\s+/g, ' ');
}

/** Input contains only eligible, attended events in the current season, in time order. */
function devotionalBadges(services: Mass[]) {
  const events = services.map(mass => {
    const day = dateKey(mass.start_time);
    return { mass, day, month: day.slice(0, 7), title: normalize(`${mass.title} ${mass.liturgy_type ?? ''}`), category: eventCategory(mass), easterDay: easter(Number(day.slice(0, 4))) };
  });
  type Event = typeof events[number];
  // Separate times on one date count as one day of a devotional practice.
  const distinctDays = (predicate: (event: Event) => boolean) => {
    const days = new Map<string, Event>();
    for (const event of events) if (predicate(event) && !days.has(event.day)) days.set(event.day, event);
    return [...days.values()];
  };
  const counted = (id: keyof typeof POINTS.badges, name: string, description: string, icon: Badge['icon'], target: number, matches: Event[]) => ({
    badge: badge(id, name, description, icon, matches.length, target, POINTS.badges[id]), earnedAt: matches[target - 1]?.mass.start_time,
  });
  const firstFridays = distinctDays(event => weekday(event.day) === 5 && Number(event.day.slice(-2)) <= 7);
  let run = 0, best = 0, previous = '', nineEarnedAt: string | undefined;
  for (const event of firstFridays) {
    run = previous && shiftMonth(previous, 1) === event.month ? run + 1 : 1;
    best = Math.max(best, run);
    previous = event.month;
    if (run === 9 && !nineEarnedAt) nineEarnedAt = event.mass.start_time;
  }
  const adoration = distinctDays(event => event.category === 'devotion' && /\badoracj\w*/.test(event.title) && !/\bkrzyz\w*/.test(event.title));
  const inLent = (event: Event) => event.day >= shiftDate(event.easterDay, -46) && event.day <= shiftDate(event.easterDay, -2);
  return [
    counted('firstFridays', 'Rytm pierwszych piątków', 'Służ na Mszy lub nabożeństwie w pierwsze piątki 3 różnych miesięcy w sezonie.', 'calendar', 3, firstFridays),
    { badge: badge('nineFridays', 'Dziewięć spotkań przy ołtarzu', 'Służ na Mszy lub nabożeństwie w 9 kolejnych pierwszych piątkach w jednym sezonie. Odznaka dotyczy służby, nie potwierdza spełnienia warunków praktyki religijnej.', 'heart', best, 9, POINTS.badges.nineFridays), earnedAt: nineEarnedAt },
    counted('firstSaturdays', 'Soboty z Maryją', 'Weź udział w nabożeństwie pierwszosobotnim w 3 różnych miesiącach sezonu.', 'heart', 3, distinctDays(event => event.category === 'devotion' && weekday(event.day) === 6 && Number(event.day.slice(-2)) <= 7 && /\b(pierwsz\w* sobot\w*|pierwszosobot\w*)/.test(event.title))),
    counted('adoration', 'Chwila przed Panem', 'Weź udział w pierwszej adoracji eucharystycznej w sezonie.', 'star', 1, adoration),
    counted('adorationFive', 'Wierność w ciszy', 'Weź udział w adoracji eucharystycznej w 5 różnych dniach sezonu.', 'star', 5, adoration),
    counted('rosary', 'Z Maryją przez tajemnice', 'Weź udział w nabożeństwie różańcowym w 5 różnych dniach sezonu.', 'heart', 5, distinctDays(event => event.category === 'devotion' && /\brozan\w*/.test(event.title))),
    counted('may', 'Maj z Maryją', 'Weź udział w nabożeństwie majowym w 3 różnych dniach maja.', 'heart', 3, distinctDays(event => event.category === 'devotion' && event.day.slice(5, 7) === '05' && /\b(majow\w*|litani\w* loretansk\w*)/.test(event.title))),
    counted('june', 'Blisko Serca Jezusa', 'Weź udział w nabożeństwie czerwcowym w 3 różnych dniach czerwca.', 'heart', 3, distinctDays(event => event.category === 'devotion' && event.day.slice(5, 7) === '06' && /\b(czerwcow\w*|litani\w* do (najswietszego )?serca (pana )?jezusa)/.test(event.title))),
    counted('stations', 'Śladami Krzyża', 'Weź udział w Drodze Krzyżowej w 3 różnych dniach od Środy Popielcowej do Wielkiego Piątku.', 'heart', 3, distinctDays(event => event.category === 'devotion' && inLent(event) && /\bdrog\w* krzyzow\w*/.test(event.title))),
    counted('lamentations', 'Przy Tobie w Męce', 'Weź udział w Gorzkich Żalach w 2 różnych dniach od Środy Popielcowej do Wielkiego Piątku.', 'heart', 2, distinctDays(event => event.category === 'devotion' && inLent(event) && /\bgorzki\w* zal\w*/.test(event.title))),
    counted('rorate', 'Światło oczekiwania', 'Służ na roratach w 3 różnych dniach Adwentu, najpóźniej 24 grudnia.', 'sunrise', 3, distinctDays(event => event.category === 'mass' && /\brorat\w*/.test(event.title) && event.day >= advent(Number(event.day.slice(0, 4))) && event.day <= `${event.day.slice(0, 4)}-12-24`)),
    counted('corpusChristi', 'Przy eucharystycznym stole', 'Służ na Mszy oznaczonej jako Boże Ciało, w czwartek 60 dni po Wielkanocy.', 'star', 1, distinctDays(event => event.category === 'mass' && event.day === shiftDate(event.easterDay, 60) && /\bboz\w* cial\w*/.test(event.title))),
    counted('mercySunday', 'Niedziela nadziei', 'Służ na Mszy oznaczonej jako Niedziela Miłosierdzia, tydzień po Wielkanocy.', 'heart', 1, distinctDays(event => event.category === 'mass' && event.day === shiftDate(event.easterDay, 7) && /\bmilosierdz\w*/.test(event.title))),
    counted('palmSunday', 'Hosanna', 'Służ na Mszy oznaczonej jako Niedziela Palmowa, tydzień przed Wielkanocą.', 'star', 1, distinctDays(event => event.category === 'mass' && event.day === shiftDate(event.easterDay, -7) && /\bpalmow\w*/.test(event.title))),
    counted('ashWednesday', 'Początek drogi', 'Służ na Mszy oznaczonej jako Środa Popielcowa, 46 dni przed Wielkanocą.', 'flame', 1, distinctDays(event => event.category === 'mass' && event.day === shiftDate(event.easterDay, -46) && /\bpopiel\w*/.test(event.title))),
    counted('chaplet', 'Jezu, ufam Tobie', 'Weź udział w Koronce do Miłosierdzia Bożego w 3 różnych dniach sezonu.', 'heart', 3, distinctDays(event => event.category === 'devotion' && /\bkoronk\w*/.test(event.title) && /\bmilosierdz\w*/.test(event.title))),
  ];
}

export function buildCompetition(data: Pick<ScheduleData, 'servers' | 'masses' | 'attendees' | 'confirmations' | 'pointAdjustments' | 'competitionState' | 'competitionParticipants'>, now: Date) {
  const season = competitionSeason(now);
  const from = Date.parse(zonedIso(season.start, '00:00'));
  const until = Math.min(now.getTime(), Date.parse(zonedIso(season.end, '00:00')));
  const masses = new Map(data.masses.filter(mass => {
    const time = Date.parse(mass.start_time);
    return time >= from && time < until && eventCategory(mass) !== 'other';
  }).map(mass => [mass.id, mass]));
  const participants = data.competitionParticipants !== undefined
    ? new Set(data.competitionParticipants)
    : new Set(data.servers.map(s => s.id));
  const byServer = new Map<string, Map<string, Mass>>();
  for (const attendee of data.confirmations ?? []) {
    if (!attendee.attended) continue;
    const mass = masses.get(attendee.mass_id);
    if (!mass) continue;
    const own = byServer.get(attendee.server_id) ?? new Map<string, Mass>();
    own.set(mass.id, mass); // One event is never counted twice for the same person.
    byServer.set(attendee.server_id, own);
  }
  const negativeConfirmations = new Set(
    (data.confirmations ?? []).filter(c => !c.attended).map(c => `${c.server_id}:${c.mass_id}`)
  );
  for (const server of data.servers) {
    if (!participants.has(server.id)) {
      const own = byServer.get(server.id) ?? new Map<string, Mass>();
      for (const attendee of data.attendees ?? []) {
        if (attendee.server_id !== server.id) continue;
        const mass = masses.get(attendee.mass_id);
        if (!mass) continue;
        if (negativeConfirmations.has(`${server.id}:${mass.id}`)) continue;
        own.set(mass.id, mass);
      }
      if (own.size > 0) byServer.set(server.id, own);
    }
  }
  const currentWeek = competitionWeek(dateKey(now));
  const state = data.competitionState?.season === season.start ? data.competitionState : undefined;
  const pointsFrom = state?.reset_at ? Date.parse(state.reset_at) : from;
  const profiles = data.servers.map(server => {
    const services = [...(byServer.get(server.id)?.values() ?? [])].sort((a, b) => a.start_time.localeCompare(b.start_time));
    const weeks = new Map<string, Mass[]>();
    const entries: PointEntry[] = [];
    const sundayDays = new Set<string>();
    const morningMasses: Mass[] = [];
    const christmasMasses: Mass[] = [];
    const vigilMasses: Mass[] = [];
    for (const mass of services) {
      const day = dateKey(mass.start_time);
      const sunday = weekday(day) === 0;
      const week = competitionWeek(day);
      weeks.set(week, [...(weeks.get(week) ?? []), mass]);
      if (Date.parse(mass.start_time) >= pointsFrom) entries.push({ id: mass.id, day, occurred_at: mass.start_time, title: mass.title, detail: `${timeSlot(mass.start_time).slice(0, 5)} · ${sunday ? 'Niedziela' : 'Służba w tygodniu'}`, points: sunday ? POINTS.sunday : POINTS.weekday });
      if (sunday) sundayDays.add(day);
      if (eventCategory(mass) === 'mass') {
        const time = timeSlot(mass.start_time);
        if (time >= '04:00:00' && time < '09:00:00') morningMasses.push(mass);
        const title = normalize(`${mass.title} ${mass.liturgy_type ?? ''}`);
        if (/pasterk/.test(title) && ((day.endsWith('-12-24') && time >= '18:00:00') || (day.endsWith('-12-25') && time < '04:00:00'))) christmasMasses.push(mass);
        const easterDay = easter(Number(day.slice(0, 4)));
        if (/wigili\w* paschal/.test(title) && ((day === shiftDate(easterDay, -1) && time >= '18:00:00') || (day === easterDay && time < '04:00:00'))) vigilMasses.push(mass);
      }
    }
    let run = 0, bestStreak = 0, previous = '', bonusPoints = 0;
    const runs = new Map<string, number>();
    let fourStreakEarnedAt: string | undefined;
    let twelveStreakEarnedAt: string | undefined;
    for (const [week, events] of [...weeks].sort(([a], [b]) => a.localeCompare(b))) {
      if (events.length < 2) { run = 0; previous = week; continue; }
      run = previous && shiftDate(previous, 7) === week ? run + 1 : 1;
      previous = week;
      bestStreak = Math.max(bestStreak, run);
      runs.set(week, run);
      if (run >= 4 && !fourStreakEarnedAt) fourStreakEarnedAt = events[1].start_time;
      if (run >= 12 && !twelveStreakEarnedAt) twelveStreakEarnedAt = events[1].start_time;
      const points = Math.min(POINTS.maxWeekly, POINTS.weekly + (run - 1) * POINTS.streakStep);
      if (Date.parse(events[1].start_time) >= pointsFrom) {
        bonusPoints += points;
        entries.push({ id: `week-${week}`, day: dateKey(events[1].start_time), occurred_at: events[1].start_time, title: 'Bonus za regularność', detail: `${run}. tydzień serii · ${polishDate(week, { day: 'numeric', month: 'short' })} – ${polishDate(shiftDate(week, 6), { day: 'numeric', month: 'short' })}`, points });
      }
    }
    // An unfinished current week does not break last week's streak.
    const streak = runs.get(currentWeek) ?? runs.get(shiftDate(currentWeek, -7)) ?? 0;
    let fullMonths = 0, monthProgress = 0, monthTarget = 0;
    let sundaysBadgeEarnedAt: string | undefined;
    for (let month = season.start.slice(0, 7); month <= dateKey(now).slice(0, 7); month = shiftMonth(month, 1)) {
      const sundays: string[] = [];
      for (let day = `${month}-01`; day.slice(0, 7) === month; day = shiftDate(day, 1)) {
        if (weekday(day) === 0) sundays.push(day);
      }
      const eligible = sundays.every(day => day >= season.start && day < season.end);
      const count = sundays.filter(day => sundayDays.has(day)).length;
      if (eligible && count === sundays.length) {
        fullMonths++;
        if (!sundaysBadgeEarnedAt) {
          const lastSunday = sundays[sundays.length - 1];
          const massOnLastSunday = services.find(m => dateKey(m.start_time) === lastSunday);
          sundaysBadgeEarnedAt = massOnLastSunday?.start_time ?? zonedIso(lastSunday, '12:00');
        }
      }
      if (month === dateKey(now).slice(0, 7)) { monthProgress = eligible ? count : 0; monthTarget = sundays.length; }
    }
    const badgeDefinitions = [
      { badge: badge('first', 'Pierwszy krok', 'Zdobądź punkty za pierwszą służbę w sezonie.', 'heart', services.length, 1, POINTS.badges.first), earnedAt: services[0]?.start_time },
      { badge: badge('ten', 'Pomocna dłoń', 'Podejmij 10 służb w jednym sezonie.', 'medal', services.length, 10, POINTS.badges.ten), earnedAt: services[9]?.start_time },
      { badge: badge('morning', 'Jutrzenka', 'Służ na 5 Mszach rozpoczynających się od 4:00 do 8:59.', 'sunrise', morningMasses.length, 5, POINTS.badges.morning), earnedAt: morningMasses[4]?.start_time },
      { badge: badge('four', 'Dobry rytm', 'Utrzymaj serię 4 tygodni, w każdym co najmniej 2 służby.', 'flame', bestStreak, 4, POINTS.badges.four), earnedAt: fourStreakEarnedAt },
      { badge: badge('christmas', 'Blask Betlejem', 'Służ na Pasterce: 24 grudnia od 18:00 lub 25 grudnia przed 4:00.', 'star', christmasMasses.length, 1, POINTS.badges.christmas), earnedAt: christmasMasses[0]?.start_time },
      { badge: badge('vigil', 'Światło Paschy', 'Służ na Wigilii Paschalnej: od 18:00 w Wielką Sobotę do 4:00 w Niedzielę Wielkanocną.', 'flame', vigilMasses.length, 1, POINTS.badges.vigil), earnedAt: vigilMasses[0]?.start_time },
      { badge: badge('sundays', 'Wierny niedzielom', 'Służ w każdą niedzielę jednego miesiąca kalendarzowego w sezonie.', 'calendar', fullMonths, 1, POINTS.badges.sundays), earnedAt: sundaysBadgeEarnedAt },
      { badge: badge('twelve', 'Niezłomny', 'Utrzymaj serię 12 tygodni, w każdym co najmniej 2 służby.', 'medal', bestStreak, 12, POINTS.badges.twelve), earnedAt: twelveStreakEarnedAt },
      { badge: badge('fifty', 'Filar wspólnoty', 'Podejmij 50 służb w jednym sezonie.', 'medal', services.length, 50, POINTS.badges.fifty), earnedAt: services[49]?.start_time },
      ...devotionalBadges(services),
    ];
    const badges = badgeDefinitions.map(def => def.badge);
    let badgePoints = 0;
    for (const { badge: b, earnedAt } of badgeDefinitions) {
      if (b.earned && earnedAt && Date.parse(earnedAt) >= pointsFrom) {
        badgePoints += b.points;
        entries.push({
          id: `badge-${b.id}`,
          day: dateKey(earnedAt),
          occurred_at: earnedAt,
          title: `Odznaka: ${b.name}`,
          detail: b.description,
          points: b.points,
        });
      }
    }
    const earnedPoints = entries.reduce((total, entry) => total + entry.points, 0);
    const adjustments = (data.pointAdjustments ?? []).filter(item => item.season === season.start && item.server_id === server.id && item.revision > (state?.reset_revision ?? 0));
    const adjustmentPoints = adjustments.reduce((sum, item) => sum + item.delta, 0);
    entries.push(...adjustments.map(item => ({ id: `adjustment-${item.id}`, day: dateKey(item.created_at), occurred_at: item.created_at, title: item.mode === 'set' ? 'Ustawienie wyniku przez administratora' : 'Korekta administratora', detail: item.reason || 'Zmiana punktacji', points: item.delta })));
    const rawPoints = earnedPoints + adjustmentPoints;
    const points = Math.max(0, rawPoints);
    const isParticipant = participants.has(server.id);
    return { server, isParticipant, points, rawPoints, adjustmentPoints, bonusPoints, badgePoints, servicePoints: earnedPoints - bonusPoints - badgePoints, serviceCount: services.length, streak, bestStreak, weekCount: weeks.get(currentWeek)?.length ?? 0, monthProgress, monthTarget, badges, level: levelFor(points), entries: entries.reverse().sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)), place: 0 };
  }).sort((a, b) => b.points - a.points || a.server.name.localeCompare(b.server.name, 'pl'));
  let place = 0;
  const participantProfiles = profiles.filter(p => p.isParticipant);
  participantProfiles.forEach((profile, index) => { if (!index || profile.points !== participantProfiles[index - 1].points) place = index + 1; profile.place = place; });
  return { season, profiles };
}

export type CompetitionProfile = ReturnType<typeof buildCompetition>['profiles'][number];
