import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, LoaderCircle, Save, X } from 'lucide-react';
import Modal from './Modal';
import { dateKey, DAY_NAMES, polishDate, shiftMonth, weekday } from '../lib/dates';
import { dayAppearance } from '../lib/dayAppearance';
import { loadMonthAnnotations } from '../lib/repository';

export const ANNOTATION_PRESETS = ['Uroczystość', 'Święto', 'Wspomnienie', 'Wspomnienie dowolne'];

export type AnnotationUpdate = { day: string; label: string };

interface Props {
  initialMonth: string;
  onClose: () => void;
  onSave: (updates: AnnotationUpdate[]) => Promise<void>;
}

function daysInMonth(month: string): string[] {
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7));
  const count = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

export default function MonthAnnotationsModal({ initialMonth, onClose, onSave }: Props) {
  const [navMonth, setNavMonth] = useState(initialMonth);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [focusedDay, setFocusedDay] = useState<string | null>(null);
  const [loadingMonth, setLoadingMonth] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const dataListId = useId();
  const today = dateKey();

  const days = daysInMonth(navMonth);

  useEffect(() => {
    let cancelled = false;
    setLoadingMonth(true);
    setLoadError('');
    setFocusedDay(null);
    void loadMonthAnnotations(navMonth).then(
      rows => {
        if (cancelled) return;
        const byDay = Object.fromEntries(rows.map(r => [r.day, r.label]));
        setLabels(byDay);
        setValues(Object.fromEntries(daysInMonth(navMonth).map(day => [day, byDay[day] ?? ''])));
        setLoadingMonth(false);
      },
      cause => {
        if (cancelled) return;
        setLabels({});
        setValues({});
        setLoadError(cause instanceof Error ? cause.message : 'Nie udało się wczytać oznaczeń tego miesiąca.');
        setLoadingMonth(false);
      },
    );
    return () => { cancelled = true; };
  }, [navMonth]);

  const dirty = days.filter(day => (values[day] ?? '') !== (labels[day] ?? ''));
  const focusedLabel = focusedDay && values[focusedDay] !== undefined
    ? `${Number(focusedDay.slice(8, 10))} ${polishDate(focusedDay, { month: 'long' })}`
    : null;

  function pickPreset(preset: string) {
    const target = (focusedDay && values[focusedDay] !== undefined)
      ? focusedDay
      : days.find(day => !(values[day] ?? '').trim()) ?? days[0] ?? null;
    if (!target) return;
    setFocusedDay(target);
    setValues(prev => ({ ...prev, [target]: (prev[target] ?? '') === preset ? '' : preset }));
  }

  async function submit() {
    if (lock.current || dirty.length === 0) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await onSave(dirty.map(day => ({ day, label: values[day].trim() })));
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nie udało się zapisać oznaczeń.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const monthName = polishDate(`${navMonth}-15`, { month: 'long', year: 'numeric' });
  const monthTitle = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  return <Modal title="Oznaczanie dni" onClose={onClose} busy={busy} className="annotations-modal">
    <div className="celebrants-week-nav">
      <span className="celebrants-week-label"><CalendarDays size={16} aria-hidden="true" />{monthTitle}</span>
      <nav className="week-controls" aria-label="Wybór miesiąca">
        <button type="button" className="icon-button" aria-label="Poprzedni miesiąc" disabled={busy} onClick={() => setNavMonth(shiftMonth(navMonth, -1))}><ChevronLeft size={20} /></button>
        <button type="button" className="today-button" disabled={busy} onClick={() => setNavMonth(dateKey().slice(0, 7))}>Dziś</button>
        <button type="button" className="icon-button" aria-label="Następny miesiąc" disabled={busy} onClick={() => setNavMonth(shiftMonth(navMonth, 1))}><ChevronRight size={20} /></button>
      </nav>
    </div>

    {loadingMonth ? <div className="celebrants-scroll"><p className="person-empty" role="status">Wczytywanie oznaczeń tego miesiąca…</p></div>
      : loadError ? <div className="celebrants-scroll"><p className="form-error" role="alert">{loadError}</p></div>
      : <>
        <div className="celebrants-presets">
          <span className="celebrants-presets-label">Oznaczenia do wyboru</span>
          <div className="preset-chips">
            {ANNOTATION_PRESETS.map(preset => (
              <button type="button" key={preset} disabled={busy} onClick={() => pickPreset(preset)}>{preset}</button>
            ))}
          </div>
          {focusedLabel && <p className="celebrants-presets-hint">Wstawiane do: {focusedLabel}</p>}
        </div>

        <div className="celebrants-scroll">
          <ul className="annotations-list" aria-label={`Dni miesiąca ${monthTitle}`}>
          {days.map(day => {
            const value = values[day] ?? '';
            const changed = value !== (labels[day] ?? '');
            const appearance = value.trim() ? dayAppearance(day, value) : 'is-ordinary';
            const recognized = appearance !== 'is-ordinary';
            return <li key={day} className={`celebrant-row ${focusedDay === day ? 'focused' : ''} ${day === today ? 'is-today' : ''} ${recognized ? appearance : ''} ${changed && recognized ? 'changed-rank' : ''} ${changed && !recognized ? 'changed' : ''}`} onClick={() => setFocusedDay(day)}>
              <div className="celebrant-row-info">
                <strong>{DAY_NAMES[weekday(day)]} · {Number(day.slice(8, 10))} {polishDate(day, { month: 'long' })}</strong>
              </div>
              <div className="celebrant-row-field">
                <input
                  aria-label={`Oznaczenie dnia ${Number(day.slice(8, 10))} ${polishDate(day, { month: 'long' })}`}
                  maxLength={120}
                  disabled={busy}
                  list={dataListId}
                  placeholder="—"
                  value={value}
                  onFocus={() => setFocusedDay(day)}
                  onChange={e => setValues(prev => ({ ...prev, [day]: e.target.value }))}
                />
                {value && <button type="button" className="icon-button" aria-label={`Wyczyść oznaczenie dnia ${Number(day.slice(8, 10))}`} disabled={busy} onClick={() => setValues(prev => ({ ...prev, [day]: '' }))}><X size={16} /></button>}
              </div>
            </li>;
          })}
          </ul>
          <datalist id={dataListId}>
            {ANNOTATION_PRESETS.map(preset => <option key={preset} value={preset} />)}
          </datalist>
        </div>
      </>}

    {error && <p className="form-error" role="alert">{error}</p>}

    <div className="modal-actions">
      <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Anuluj</button>
      <button type="button" className="button primary" disabled={busy || loadingMonth || dirty.length === 0} onClick={() => void submit()}>
        {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
        {dirty.length === 0 ? 'Zapisz oznaczenia' : `Zapisz oznaczenia (${dirty.length})`}
      </button>
    </div>
  </Modal>;
}
