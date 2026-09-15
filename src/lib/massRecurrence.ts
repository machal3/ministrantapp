import { shiftDate, weekday } from './dates';
import type { RecurringMassesInput } from '../types/database';
type Pattern = Pick<RecurringMassesInput, 'days' | 'start_date' | 'end_date' | 'frequency' | 'interval_weeks' | 'interval_months' | 'month_weeks'>;
export function massOccurrenceDates(input: Pattern): string[] {
  const { start_date: start, end_date: end, days } = input;
  const validDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
  if (!validDate(start) || !validDate(end) || end < start || (Date.parse(end) - Date.parse(start)) / 86400000 > 366) return [];
  if (!days.length || days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) return [];
  const weeks = input.interval_weeks ?? 1, months = input.interval_months ?? 1;
  const ordinals = input.month_weeks ?? [1];
  if (![weeks, months].every(n => Number.isInteger(n) && n >= 1 && n <= 12)) return [];
  if (input.frequency === 'monthly' && (!ordinals.length || ordinals.some(n => ![-1,1,2,3,4,5].includes(n)))) return [];
  const dates: string[] = [];
  for (let date = start, i = 0; date <= end; date = shiftDate(date, 1), i++) {
    if (!days.includes(weekday(date))) continue;
    if (input.frequency === 'monthly') {
      const delta = (Number(date.slice(0,4)) - Number(start.slice(0,4))) * 12 + Number(date.slice(5,7)) - Number(start.slice(5,7));
      if (delta % months !== 0) continue;
      const ordinal = Math.ceil(Number(date.slice(8)) / 7);
      if (!ordinals.includes(ordinal) && !(ordinals.includes(-1) && shiftDate(date,7).slice(0,7) !== date.slice(0,7))) continue;
    } else if (Math.floor(i / 7) % weeks !== 0) continue;
    dates.push(date);
  }
  return dates;
}
