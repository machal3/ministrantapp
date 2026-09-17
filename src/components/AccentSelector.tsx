import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

export const accentOptions = [
  { id: 'green', label: 'Leśny', color: '#245c46' },
  { id: 'blue', label: 'Ocean', color: '#245b91' },
  { id: 'purple', label: 'Lawenda', color: '#6a4592' },
  { id: 'rose', label: 'Róża', color: '#963f63' },
  { id: 'amber', label: 'Bursztyn', color: '#87551f' },
] as const;
type Accent = typeof accentOptions[number]['id'];
function readAccent(): Accent {
  try {
    const saved = localStorage.getItem('liturgy.accent');
    return accentOptions.find(option => option.id === saved)?.id ?? 'green';
  } catch { return 'green'; }
}

export function useAccent() {
  const [accent, setAccent] = useState<Accent>(readAccent);
  const [error, setError] = useState(false);
  useEffect(() => { document.documentElement.dataset.accent = accent; }, [accent]);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === 'liturgy.accent' || event.key === null) setAccent(readAccent()); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return { accent, error, selectAccent: (value: Accent) => {
    setAccent(value);
    try { localStorage.setItem('liturgy.accent', value); setError(false); } catch { setError(true); }
  } };
}

export default function AccentSelector({ accent, error, selectAccent }: ReturnType<typeof useAccent>) {
  return <fieldset className="accent-selector">
    <legend>Kolor przewodni</legend>
    <p>Twój akcent w jasnym i ciemnym trybie.</p>
    <div className="accent-options">
      {accentOptions.map(option => <button key={option.id} type="button" aria-pressed={accent === option.id} className="accent-option" onClick={() => selectAccent(option.id)}>
        <span className="accent-swatch" style={{ backgroundColor: option.color }} aria-hidden="true">{accent === option.id && <Check size={18} />}</span>
        <span>{option.label}</span>
      </button>)}
    </div>
    {error && <p role="status">Kolor działa, ale przeglądarka nie pozwala go zapamiętać.</p>}
  </fieldset>;
}
