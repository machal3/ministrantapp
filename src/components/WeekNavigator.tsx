import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { polishDate, shiftDate, weekStart } from '../lib/dates';

interface Props { week: string; onChange: (week: string) => void }

export default function WeekNavigator({ week, onChange }: Props) {
  const end = shiftDate(week, 6);
  const sameMonth = week.slice(0, 7) === end.slice(0, 7);
  const range = `${polishDate(week, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short', ...(week.slice(0, 4) !== end.slice(0, 4) ? { year: 'numeric' as const } : {}) })} – ${polishDate(end, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  return <div className="week-navigator">
    <div className="flex items-center gap-3">
      <CalendarDays size={19} className="text-[var(--green)]" />
      <h2 aria-live="polite">{range}</h2>
      {week === weekStart() && <span className="current-week-label">Bieżący tydzień</span>}
    </div>
    <nav className="week-controls" aria-label="Wybór tygodnia">
      <button className="icon-button" aria-label="Poprzedni tydzień" onClick={() => onChange(shiftDate(week, -7))}><ChevronLeft size={18} /></button>
      <button className="today-button" onClick={() => onChange(weekStart())}>Bieżący</button>
      <button className="icon-button" aria-label="Następny tydzień" onClick={() => onChange(shiftDate(week, 7))}><ChevronRight size={18} /></button>
    </nav>
  </div>;
}
