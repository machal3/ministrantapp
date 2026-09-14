import { dateKey, DAY_SHORT, shiftDate, weekday } from '../lib/dates';

interface Props {
  week: string;
  selected: string;
  onChange: (day: string) => void;
  counts: Record<string, number>;
}

export default function DaySelector({ week, selected, onChange, counts }: Props) {
  const todayKey = dateKey();
  return (
    <nav className="day-selector" aria-label="Wybor dnia tygodnia">
      {Array.from({ length: 7 }, (_, i) => shiftDate(week, i)).map(day => (
        <button
          key={day}
          className={`day-tab ${selected === day ? 'selected' : ''} ${day === todayKey ? 'is-today' : ''} ${weekday(day) === 0 ? 'is-sunday' : ''}`}
          aria-pressed={selected === day}
          aria-label={`${DAY_SHORT[weekday(day)]}, ${day}, ${counts[day] ?? 0} liturgii`}
          onClick={() => onChange(day)}
        >
          <span>{DAY_SHORT[weekday(day)]}</span>
          <strong>{Number(day.slice(-2))}</strong>
        </button>
      ))}
    </nav>
  );
}
