import { useEffect, useRef, useState } from 'react';
import { CalendarDays, HeartHandshake, Trophy } from 'lucide-react';

type View = 'schedule' | 'services' | 'competition';
const views = [
  { id: 'schedule', label: 'Grafik', Icon: CalendarDays },
  { id: 'services', label: 'Moje służby', Icon: HeartHandshake },
  { id: 'competition', label: 'Rywalizacja', Icon: Trophy },
] as const;

export default function ViewNavigation({ view, onChange, onPreload }: {
  view: View;
  onChange: (view: View) => void;
  onPreload: (view: View) => void;
}) {
  const [open, setOpen] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const active = views.find(item => item.id === view)!;

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!nav.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return <nav ref={nav} className="view-navigation" aria-label="Widoki aplikacji"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" className="view-navigation-trigger"
      aria-label={`Widok: ${active.label}. Wybierz widok`} aria-expanded={open}
      aria-controls="view-navigation-options" title={`Widok: ${active.label}`}
      onClick={() => setOpen(current => !current)}>
      <active.Icon size={18} aria-hidden="true" />
      <span>{active.label}</span>
    </button>
    <div id="view-navigation-options" className={`view-navigation-options${open ? ' is-open' : ''}`}>
      {views.map(({ id, label, Icon }) => <button key={id} type="button"
        className={`button ${view === id ? 'primary' : 'secondary'}`}
        aria-current={view === id ? 'page' : undefined}
        onClick={() => { onChange(id); setOpen(false); if (open) trigger.current?.focus(); }}
        onMouseEnter={() => onPreload(id)} onFocus={() => onPreload(id)} onTouchStart={() => onPreload(id)}>
        <Icon size={18} aria-hidden="true" />{label}
      </button>)}
    </div>
  </nav>;
}
