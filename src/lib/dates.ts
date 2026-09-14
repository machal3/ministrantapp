import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const TIME_ZONE = 'Europe/Warsaw';
export const DAY_NAMES = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
export const DAY_SHORT = ['Niedz', 'Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob'];

export function dateKey(value: string | Date = new Date()): string {
  return formatInTimeZone(value, TIME_ZONE, 'yyyy-MM-dd');
}

export function timeSlot(value: string): string {
  return formatInTimeZone(value, TIME_ZONE, 'HH:mm:ss');
}

export function weekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function shiftDate(date: string, days: number): string {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function weekStart(date = dateKey()): string {
  return shiftDate(date, -(weekday(date)));
}
/** @deprecated use weekStart */
export const monday = weekStart;

export function polishDate(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('pl-PL', { ...options, timeZone: 'UTC' })
    .format(new Date(`${date}T12:00:00Z`));
}

export function zonedIso(date: string, time: string): string {
  const wallTime = `${date}T${time.length === 5 ? `${time}:00` : time}`;
  const result = fromZonedTime(wallTime, TIME_ZONE);
  if (Number.isNaN(result.getTime()) || formatInTimeZone(result, TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ss") !== wallTime) {
    throw new Error('Ta data lub godzina nie istnieje w strefie Europe/Warsaw (zmiana czasu). Wybierz inną godzinę.');
  }
  return result.toISOString();
}

export function weekBounds(start: string): [string, string] {
  return [zonedIso(start, '00:00'), zonedIso(shiftDate(start, 7), '00:00')];
}
