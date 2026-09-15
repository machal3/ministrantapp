import { dateKey, DAY_SHORT, shiftDate, weekday } from '../lib/dates';

import type { ScheduleData } from '../types/database';

interface Props {
  week: string;
  selected: string;
  onChange: (day: string) => void;
  counts: Record<string, number>;
  dayAnnotations?: ScheduleData['dayAnnotations'];
}

export default function DaySelector({ week, selected, onChange, counts, dayAnnotations = [] }: Props) {
  const todayKey = dateKey();
  return (
    <nav className="day-selector" aria-label="Wybor dnia tygodnia">
      {Array.from({ length: 7 }, (_, i) => shiftDate(week, i)).map(day => {
        const label = dayAnnotations.find(annotation => annotation.day === day)?.label;
        const normalizedLabel = label?.trim().toLocaleLowerCase('pl');
        const isSolemnity = /^uroczystość(?:$|[\s:–—-])/u.test(normalizedLabel ?? '');
        const isFeast = /^święto(?:$|[\s:–—-])/u.test(normalizedLabel ?? '');
        const dayStyle = weekday(day) === 0 || isSolemnity ? 'is-sunday' : isFeast ? 'is-feast' : '';
        return (
        <button
          key={day}
          className={`day-tab ${selected === day ? 'selected' : ''} ${day === todayKey ? 'is-today' : ''} ${dayStyle}`}
          aria-pressed={selected === day}
          aria-label={`${DAY_SHORT[weekday(day)]}, ${day}, ${counts[day] ?? 0} liturgii${label ? `, ${label}` : ''}`}
          title={label}
          onClick={() => onChange(day)}
        >
          <span>{DAY_SHORT[weekday(day)]}</span>
          <strong>{Number(day.slice(-2))}</strong>
        </button>
        );
      })}
    </nav>
  );
}
