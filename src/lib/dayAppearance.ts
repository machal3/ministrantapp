import { weekday } from './dates';

/** Shared liturgical color for a calendar day and its annotation. */
export function dayAppearance(day: string, label = ''): string {
  const normalized = label.trim().toLocaleLowerCase('pl');
  if (weekday(day) === 0 || /^uroczystość(?:$|[\s:–—-])/u.test(normalized)) return 'is-sunday';
  if (/^święto(?:$|[\s:–—-])/u.test(normalized)) return 'is-feast';
  return 'is-ordinary';
}
