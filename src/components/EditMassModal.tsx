import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Church, Flame, LoaderCircle, Save } from 'lucide-react';
import Modal from './Modal';
import { dateKey, polishDate, timeSlot } from '../lib/dates';
import type { Mass, MassEditInput } from '../types/database';

interface Props {
  mass: Mass;
  onClose: () => void;
  onSave: (id: string, input: MassEditInput) => Promise<number>;
}

export default function EditMassModal({ mass, onClose, onSave }: Props) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [isExtra, setIsExtra] = useState(mass.is_extra);
  const [isOther, setIsOther] = useState(mass.category === 'other');
  const [title, setTitle] = useState(mass.title);
  const [celebrant, setCelebrant] = useState(mass.celebrant ?? '');
  const [liturgyType, setLiturgyType] = useState(mass.liturgy_type ?? '');
  const [time, setTime] = useState(() => timeSlot(mass.start_time).slice(0, 5));
  const [spots, setSpots] = useState(mass.suggested_spots ?? 4);
  const [noSpots, setNoSpots] = useState(mass.suggested_spots === null);
  const [scope, setScope] = useState<'single' | 'future'>('single');
  const lock = useRef(false);

  function handleTypeChange(devotion: boolean) {
    setIsOther(false);
    setIsExtra(devotion);
    if (devotion) {
      if (title === 'Msza Święta' || title === '') setTitle('Różaniec');
    } else {
      if (title === 'Różaniec' || title === '') setTitle('Msza Święta');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(isOther ? 'Wpisz nazwę wydarzenia.' : isExtra ? 'Wpisz nazwę nabożeństwa.' : 'Wpisz nazwę Mszy Świętej.');
      return;
    }
    if (!noSpots && (!Number.isInteger(spots) || spots < 1)) {
      setError('Sugerowana liczba miejsc musi być dodatnią liczbą całkowitą.');
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(time)) {
      setError('Podaj prawidłową godzinę w formacie GG:MM.');
      return;
    }

    lock.current = true;
    setBusy(true);
    setError('');

    try {
      await onSave(mass.id, {
        title: trimmedTitle,
        time,
        suggested_spots: noSpots ? null : spots,
        is_extra: isExtra, category: isOther ? 'other' : isExtra ? 'devotion' : 'mass',
        celebrant: celebrant.trim() || null,
        liturgy_type: liturgyType.trim() || null,
        scope,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nie udało się zapisać zmian.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal title={isOther ? 'Edytuj wydarzenie' : isExtra ? 'Edytuj nabożeństwo' : 'Edytuj Mszę Świętą'} onClose={onClose} busy={busy}>
      <p className="mb-4 text-sm text-[var(--muted)]">
        {mass.title} · {polishDate(dateKey(mass.start_time), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, godz. {timeSlot(mass.start_time).slice(0, 5)}
      </p>

      <div className="recurrence-mode-tabs mb-4">
        <button
          type="button"
          className={`recurrence-tab ${!isExtra && !isOther ? 'active' : ''}`}
          onClick={() => handleTypeChange(false)}
          disabled={busy}
        >
          <Church size={15} /> Msza Święta
        </button>
        <button
          type="button"
          className={`recurrence-tab ${isExtra ? 'active' : ''}`}
          onClick={() => handleTypeChange(true)}
          disabled={busy}
        >
          <Flame size={15} /> Nabożeństwo
        </button>
        <button type="button" className={`recurrence-tab ${isOther ? 'active' : ''}`} disabled={busy} onClick={() => { setIsOther(true); setIsExtra(false); if (['Msza Święta','Różaniec',''].includes(title)) setTitle('Spotkanie'); }}>Inne</button>
      </div>

      <form onSubmit={submit}>
        <fieldset disabled={busy} className="space-y-4">
          <div>
            <label className="field">
              {isOther ? 'Nazwa wydarzenia' : isExtra ? 'Nazwa nabożeństwa' : 'Nazwa Mszy Świętej'}
              <input
                name="title"
                required
                maxLength={160}
                value={title}
                onChange={e => setTitle(e.target.value)}
                autoFocus
              />
            </label>
            <div className="preset-chips">
              {(isOther ? ['Spotkanie', 'Zbiórka ministrantów', 'Próba', 'Wyjazd'] : !isExtra
                ? ['Msza Święta', 'Msza roratnia', 'Msza niedzielna', 'Msza z udziałem dzieci']
                : ['Różaniec', 'Droga Krzyżowa', 'Gorzkie Żale', 'Nabożeństwo majowe', 'Adoracja']
              ).map(preset => (
                <button
                  type="button"
                  key={preset}
                  onClick={() => setTitle(preset)}
                  disabled={busy}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field">
                Ksiądz celebrujący (lub księża) <span className="field-optional">opcjonalnie</span>
                <input
                  name="celebrant"
                  maxLength={100}
                  placeholder="np. ks. Proboszcz lub ks. Jan, ks. Marek"
                  value={celebrant}
                  onChange={e => setCelebrant(e.target.value)}
                />
              </label>
              <div className="preset-chips">
                {['ks. Proboszcz', 'ks. Wikariusz'].map(preset => (
                  <button
                    type="button"
                    key={preset}
                    onClick={() => setCelebrant(prev => prev === preset ? '' : preset)}
                    disabled={busy}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="field">
                Okazja tego wydarzenia <span className="field-optional">opcjonalnie</span>
                <input
                  name="liturgyType"
                  maxLength={60}
                  placeholder="np. Chrzciny, ślub..."
                  value={liturgyType}
                  onChange={e => setLiturgyType(e.target.value)}
                />
              </label>
              <div className="preset-chips">
                {(isOther
                  ? ['Spotkanie', 'Próba', 'Zbiórka']
                  : isExtra
                  ? ['Nowenna', 'Czuwanie']
                  : ['Chrzcielna', 'Ślubna', 'Pogrzebowa', 'Jubileuszowa']
                ).map(preset => (
                  <button
                    type="button"
                    key={preset}
                    onClick={() => setLiturgyType(prev => prev === preset ? '' : preset)}
                    disabled={busy}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="field-hint">Okazja zmienia się tylko w tym terminie, również przy edycji serii. Uroczystość lub święto ustaw w „Oznacz dzień” nad wydarzeniami.</p>
          <label className="capacity-option"><input type="checkbox" checked={noSpots} onChange={e => setNoSpots(e.target.checked)} />Bez określonej liczby osób</label>
          <div className="grid grid-cols-2 gap-4">
            <label className="field">
              Godzina
              <input
                type="time"
                name="time"
                required
                value={time}
                onChange={e => setTime(e.target.value)}
                step={60}
              />
            </label>
            <label className="field">
              Sugerowana liczba miejsc
              <input
                type="number"
                disabled={noSpots}
                name="spots"
                min={1}
                max={2147483647}
                step={1}
                value={spots}
                onChange={e => setSpots(Number(e.target.value))}
                required={!noSpots}
              />
            </label>
          </div>

          <div>
            <span className="field-label mb-2 block font-medium text-xs text-[#43543d]">Zakres zmian</span>
            <div className="delete-scope-options">
              <label className="radio-label">
                <input
                  type="radio"
                  name="edit-scope"
                  value="single"
                  checked={scope === 'single'}
                  onChange={() => setScope('single')}
                  disabled={busy}
                />
                <span>
                  <strong>Tylko ten termin</strong>
                  <small>
                    Zmiana dotyczy wyłącznie nabożeństwa {polishDate(dateKey(mass.start_time), { day: 'numeric', month: 'long' })} o godz. {timeSlot(mass.start_time).slice(0, 5)}.
                  </small>
                </span>
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="edit-scope"
                  value="future"
                  checked={scope === 'future'}
                  onChange={() => setScope('future')}
                  disabled={busy}
                />
                <span>
                  <strong>Ten i wszystkie przyszłe terminy z serii</strong>
                  <small>
                    Zmiany zostaną zastosowane do wszystkich przyszłych terminów tej serii (niezależnie od tego, w które dni tygodnia wypadają).
                  </small>
                </span>
              </label>
            </div>
          </div>

          <div className="info-banner">
            Zadeklarowane obecności ministrantów na te terminy pozostają zachowane (nie ulegają skasowaniu).
          </div>
        </fieldset>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            Anuluj
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
            {scope === 'future' ? 'Zapisz serię terminów' : 'Zapisz zmiany'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
