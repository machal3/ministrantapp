import { useEffect, useState } from 'react';
import { Check, Monitor, Moon, Palette, Sun } from 'lucide-react';
import Modal from './Modal';
import AccentSelector, { useAccent } from './AccentSelector';

type Theme = 'light' | 'dark' | 'system';
const options = [
  { value: 'light', label: 'Jasny', description: 'Jasne tło i subtelne akcenty', Icon: Sun },
  { value: 'dark', label: 'Ciemny', description: 'Głębokie barwy i łagodne kontrasty', Icon: Moon },
  { value: 'system', label: 'Zgodny z urządzeniem', description: 'Automatycznie podąża za ustawieniami ekranu', Icon: Monitor },
] as const;
function readTheme(): Theme {
  try { const value = localStorage.getItem('liturgy.theme'); return value === 'light' || value === 'dark' ? value : 'system'; }
  catch { return 'system'; }
}

export default function ThemeSelector() {
  const accentSettings = useAccent();
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [open, setOpen] = useState(false);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media?.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#101a17' : '#234f41');
    };
    apply();
    media?.addEventListener('change', apply);
    return () => media?.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === 'liturgy.theme' || event.key === null) setTheme(readTheme()); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const selected = options.find(option => option.value === theme)!;
  return <>
    <button type="button" className="theme-toggle" onClick={() => setOpen(true)} aria-label={`Wygląd: ${selected.label}`} title="Zmień wygląd" aria-haspopup="dialog" aria-expanded={open}><Palette size={19} aria-hidden="true" /></button>
    {open && <Modal title="Wygląd aplikacji" onClose={() => setOpen(false)} className="theme-modal">
      <div className="theme-options" role="group" aria-label="Tryb kolorów">
        {options.map(({ value, label, description, Icon: OptionIcon }) => <button key={value} type="button" className="theme-option" aria-pressed={theme === value} onClick={() => {
          setTheme(value);
          try { localStorage.setItem('liturgy.theme', value); setStorageError(false); } catch { setStorageError(true); }
        }}><span className={`theme-preview theme-preview-${value}`}><OptionIcon size={22} /></span><span><strong>{label}</strong><small>{description}</small></span>{theme === value && <Check size={18} />}</button>)}
      </div>
      {storageError && <p role="status">Tryb działa, ale przeglądarka nie pozwala go zapamiętać.</p>}
      <AccentSelector {...accentSettings} />
      <div className="modal-actions"><button type="button" className="button primary" onClick={() => setOpen(false)}>Gotowe</button></div>
    </Modal>}
  </>;
}
