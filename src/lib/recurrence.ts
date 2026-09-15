import type { RecurringRule } from '../types/database';
export function describeRule(rule: RecurringRule): string {
  if (rule.frequency === 'monthly') return 'W miesiącu: ' + (rule.month_weeks ?? [1]).map(n => n === -1 ? 'ostatni' : n + '.').join(', ') + ' tydzień';
  const n = rule.interval_weeks ?? 1;
  return n === 1 ? 'Co tydzień' : n < 5 ? 'Co ' + n + ' tygodnie' : 'Co ' + n + ' tygodni';
}
