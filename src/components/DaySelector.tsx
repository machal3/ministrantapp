import { dateKey, DAY_SHORT, shiftDate, weekday } from '../lib/dates';

interface Props { week: string; selected: string | null; onChange: (day: string | null) => void; counts: Record<string, number> }

export default function DaySelector({ week, selected, onChange, counts }: Props) {
  return <nav className="day-selector" aria-label="Filtr dnia tygodnia">
    <button className={`day-tab all-days ${selected === null ? 'selected' : ''}`} aria-pressed={selected === null} onClick={() => onChange(null)}>
      <span>Cały</span><strong>tydzień</strong>
    </button>
    {Array.from({ length: 7 }, (_, i) => shiftDate(week, i)).map(day =>
      <button key={day} className={`day-tab ${selected === day ? 'selected' : ''} ${day === dateKey() ? 'is-today' : ''}`}
        aria-pressed={selected === day} aria-label={`${DAY_SHORT[weekday(day)]}, ${day}, ${counts[day] ?? 0} nabożeństw`}
        onClick={() => onChange(day)}>
        <span>{DAY_SHORT[weekday(day)]}</span><strong>{Number(day.slice(-2))}</strong>
        <i className={counts[day] ? 'has-masses' : ''} aria-hidden="true" />
      </button>,
    )}
  </nav>;
}
