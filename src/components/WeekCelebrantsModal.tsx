import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, LoaderCircle, Save, X } from 'lucide-react';
import Modal from './Modal';
import { dateKey, DAY_NAMES, polishDate, shiftDate, timeSlot, weekday, weekStart } from '../lib/dates';
import { loadWeek } from '../lib/repository';
import type { Mass } from '../types/database';

export const CELEBRANT_PRESETS = ['ks. Proboszcz', 'ks. Jarosław', 'ks. Dominik', 'ks. Grzegorz', 'ks. Jerzy', 'ks. Jacek'];

export type CelebrantUpdate = { mass: Mass; celebrant: string | null };

interface Props {
  initialWeek: string;
  onClose: () => void;
  onSave: (updates: CelebrantUpdate[]) => Promise<void>;
}

export default function WeekCelebrantsModal({ initialWeek, onClose, onSave }: Props) {
  const [navWeek, setNavWeek] = useState(initialWeek);
  const [masses, setMasses] = useState<Mass[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [loadingWeek, setLoadingWeek] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const dataListId = useId();

  useEffect(() => {
    let cancelled = false;
    setLoadingWeek(true);
    setLoadError('');
    setFocusedId(null);
    void loadWeek(navWeek).then(
      data => {
        if (cancelled) return;
        const sorted = [...data.masses].sort((a, b) => a.start_time.localeCompare(b.start_time));
        setMasses(sorted);
        setValues(Object.fromEntries(sorted.map(m => [m.id, m.celebrant ?? ''])));
        setLoadingWeek(false);
      },
      cause => {
        if (cancelled) return;
        setMasses([]);
        setValues({});
        setLoadError(cause instanceof Error ? cause.message : 'Nie udało się wczytać Mszy z tego tygodnia.');
        setLoadingWeek(false);
      },
    );
    return () => { cancelled = true; };
  }, [navWeek]);

  const focusedMass = masses.find(m => m.id === focusedId) ?? null;

  function pickPriest(preset: string) {
    const target = focusedMass ?? masses.find(m => !(values[m.id] ?? '').trim()) ?? masses[0] ?? null;
    if (!target) return;
    setFocusedId(target.id);
    setValues(prev => ({ ...prev, [target.id]: (prev[target.id] ?? '') === preset ? '' : preset }));
  }

  const dirty = masses.filter(m => (values[m.id] ?? '') !== (m.celebrant ?? ''));

  const groups = masses.reduce<{ day: string; items: Mass[] }[]>((acc, mass) => {
    const day = dateKey(mass.start_time);
    const group = acc[acc.length - 1];
    if (group && group.day === day) group.items.push(mass);
    else acc.push({ day, items: [mass] });
    return acc;
  }, []);

  async function submit() {
    if (lock.current || dirty.length === 0) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await onSave(dirty.map(mass => ({ mass, celebrant: values[mass.id].trim() || null })));
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nie udało się zapisać księży.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const end = shiftDate(navWeek, 6);
  const sameMonth = navWeek.slice(0, 7) === end.slice(0, 7);
  const range = `${polishDate(navWeek, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })} – ${polishDate(end, { day: 'numeric', month: 'long', year: 'numeric' })}`;

  return <Modal title="Księża na tydzień" onClose={onClose} busy={busy} className="celebrants-modal">
    <div className="celebrants-week-nav">
      <span className="celebrants-week-label"><CalendarDays size={16} aria-hidden="true" />{range}</span>
      <nav className="week-controls" aria-label="Wybór tygodnia">
        <button type="button" className="icon-button" aria-label="Poprzedni tydzień" disabled={busy} onClick={() => setNavWeek(shiftDate(navWeek, -7))}><ChevronLeft size={20} /></button>
        <button type="button" className="today-button" disabled={busy} onClick={() => setNavWeek(weekStart())}>Dziś</button>
        <button type="button" className="icon-button" aria-label="Następny tydzień" disabled={busy} onClick={() => setNavWeek(shiftDate(navWeek, 7))}><ChevronRight size={20} /></button>
      </nav>
    </div>

    {loadingWeek ? <div className="celebrants-scroll"><p className="person-empty" role="status">Wczytywanie Mszy z tego tygodnia…</p></div>
      : loadError ? <div className="celebrants-scroll"><p className="form-error" role="alert">{loadError}</p></div>
      : masses.length === 0 ? <div className="celebrants-scroll"><p className="person-empty" role="status">Brak Mszy i nabożeństw w tym tygodniu.</p></div>
      : <>
        <div className="celebrants-presets">
          <span className="celebrants-presets-label">Księża do wyboru</span>
          <div className="preset-chips">
            {CELEBRANT_PRESETS.map(preset => (
              <button type="button" key={preset} disabled={busy} onClick={() => pickPriest(preset)}>{preset}</button>
            ))}
          </div>
          {focusedMass && <p className="celebrants-presets-hint">Wstawiane do: {timeSlot(focusedMass.start_time).slice(0, 5)} · {focusedMass.title}</p>}
        </div>
        <div className="celebrants-scroll">
          <div className="celebrants-days">
          {groups.map(group => (
            <section key={group.day} className="celebrants-day-group" aria-label={`${DAY_NAMES[weekday(group.day)]} ${polishDate(group.day, { day: 'numeric', month: 'long' })}`}>
              <h3 className="celebrants-day-heading">{DAY_NAMES[weekday(group.day)]} · {polishDate(group.day, { day: 'numeric', month: 'long' })}</h3>
              <ul className="celebrants-list" aria-label="Msze w tym dniu">
                {group.items.map(mass => {
                  const time = timeSlot(mass.start_time).slice(0, 5);
                  const value = values[mass.id] ?? '';
                  const changed = value !== (mass.celebrant ?? '');
                  return <li key={mass.id} className={`celebrant-row ${focusedId === mass.id ? 'focused' : ''} ${changed ? 'changed' : ''}`} onClick={() => setFocusedId(mass.id)}>
                    <div className="celebrant-row-info">
                      <strong>{time} · {mass.title}</strong>
                    </div>
                    <div className="celebrant-row-field">
                      <input
                        aria-label={`Celebrans: ${mass.title}, ${DAY_NAMES[weekday(group.day)]} ${time}`}
                        maxLength={100}
                        disabled={busy}
                        list={dataListId}
                        placeholder="—"
                        value={value}
                        onFocus={() => setFocusedId(mass.id)}
                        onChange={e => setValues(prev => ({ ...prev, [mass.id]: e.target.value }))}
                      />
                      {value && <button type="button" className="icon-button" aria-label={`Wyczyść celebransa: ${mass.title}, ${time}`} disabled={busy} onClick={() => setValues(prev => ({ ...prev, [mass.id]: '' }))}><X size={16} /></button>}
                    </div>
                  </li>;
                })}
              </ul>
            </section>
          ))}
          </div>
          <datalist id={dataListId}>
            {CELEBRANT_PRESETS.map(preset => <option key={preset} value={preset} />)}
          </datalist>
        </div>
      </>}

    {error && <p className="form-error" role="alert">{error}</p>}

    <div className="modal-actions">
      <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Anuluj</button>
      <button type="button" className="button primary" disabled={busy || loadingWeek || dirty.length === 0} onClick={() => void submit()}>
        {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
        {dirty.length === 0 ? 'Zapisz księży' : `Zapisz księży (${dirty.length})`}
      </button>
    </div>
  </Modal>;
}
