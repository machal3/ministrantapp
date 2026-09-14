import { useId, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarDays, CalendarPlus, Church, Flame, LoaderCircle, Repeat } from 'lucide-react';
import Modal from './Modal';
import { shiftDate, weekday, zonedIso } from '../lib/dates';
import type { NewMass, RecurringMassesInput } from '../types/database';

interface Props {
  initialDate: string;
  onClose: () => void;
  onSubmit: (mass: NewMass) => Promise<void>;
  onSubmitRecurring?: (input: RecurringMassesInput) => Promise<number>;
}

const WEEKDAY_BUTTONS: { dow: number; label: string }[] = [
  { dow: 1, label: 'Pn' },
  { dow: 2, label: 'Wt' },
  { dow: 3, label: 'Śr' },
  { dow: 4, label: 'Czw' },
  { dow: 5, label: 'Pt' },
  { dow: 6, label: 'Sob' },
  { dow: 0, label: 'Nd' },
];

function countOccurrences(start: string, end: string, days: number[]): number {
  if (!start || !end || end < start || !days.length) return 0;
  let count = 0;
  let curr = start;
  for (let i = 0; i <= 366 && curr <= end; i++) {
    if (days.includes(weekday(curr))) count++;
    curr = shiftDate(curr, 1);
  }
  return count;
}

export default function AddMassModal({ initialDate, onClose, onSubmit, onSubmitRecurring }: Props) {
  const [mode, setMode] = useState<'single' | 'recurring'>('single');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  // Liturgy type: false = Msza Święta, true = Nabożeństwo
  const [isExtra, setIsExtra] = useState(false);
  const [title, setTitle] = useState('Msza Święta');

  // Recurring form state
  const [startDate, setStartDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(() => shiftDate(initialDate, 90));
  const [selectedDays, setSelectedDays] = useState<number[]>([weekday(initialDate)]);

  const titleId = useId();
  const timeId = useId();
  const spotsId = useId();

  const occurrences = useMemo(
    () => countOccurrences(startDate, endDate, selectedDays),
    [startDate, endDate, selectedDays]
  );

  function handleTypeChange(devotion: boolean) {
    setIsExtra(devotion);
    if (devotion) {
      if (title === 'Msza Święta' || title === '') setTitle('Różaniec');
    } else {
      if (title === 'Różaniec' || title === '') setTitle('Msza Święta');
    }
  }

  function toggleDay(dow: number) {
    setSelectedDays(prev => {
      if (prev.includes(dow)) {
        if (prev.length === 1) return prev; // keep at least 1 day
        return prev.filter(d => d !== dow);
      }
      return [...prev, dow].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    });
  }

  function setEndPreset(days: number) {
    setEndDate(shiftDate(startDate, days));
  }

  function setEndYear() {
    const year = startDate.slice(0, 4);
    setEndDate(`${year}-12-31`);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    setError('');

    try {
      const finalTitle = String(form.get('title')).trim();
      const rawSpots = String(form.get('spots')).trim();
      const suggestedSpots = rawSpots === '' ? 4 : Number(rawSpots);
      const time = String(form.get('time'));

      if (!finalTitle) throw new Error(isExtra ? 'Wpisz nazwę nabożeństwa.' : 'Wpisz nazwę Mszy Świętej.');
      if (!Number.isInteger(suggestedSpots) || suggestedSpots < 1 || suggestedSpots > 2147483647) {
        throw new Error('Sugerowana liczba miejsc musi być dodatnią liczbą całkowitą.');
      }

      submitting.current = true;
      setBusy(true);

      if (mode === 'single') {
        const startTime = zonedIso(String(form.get('date')), time);
        await onSubmit({ title: finalTitle, start_time: startTime, suggested_spots: suggestedSpots, is_extra: isExtra });
      } else {
        if (!onSubmitRecurring) throw new Error('Dodawanie cyklicznych Mszy jest niedostępne.');
        if (!selectedDays.length) throw new Error('Wybierz co najmniej jeden dzień tygodnia.');
        if (endDate < startDate) throw new Error('Data końcowa nie może być wcześniejsza niż data początkowa.');
        if (occurrences === 0) throw new Error('W wybranym przedziale dat nie wypada żaden ze wskazanych dni tygodnia.');

        await onSubmitRecurring({
          title: finalTitle,
          suggested_spots: suggestedSpots,
          is_extra: isExtra,
          days: selectedDays,
          time,
          start_date: startDate,
          end_date: endDate,
        });
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nie udało się dodać terminu.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const modalTitle = mode === 'recurring'
    ? (isExtra ? 'Dodaj regularne nabożeństwa' : 'Dodaj regularne Msze Święte')
    : (isExtra ? 'Dodaj nabożeństwo' : 'Dodaj Mszę Świętą');

  return <Modal title={modalTitle} onClose={onClose} busy={busy}>
    <div className="recurrence-mode-tabs mb-3">
      <button
        type="button"
        className={`recurrence-tab ${mode === 'single' ? 'active' : ''}`}
        onClick={() => { setMode('single'); setError(''); }}
        disabled={busy}
      >
        <CalendarDays size={15} /> Pojedynczy termin
      </button>
      <button
        type="button"
        className={`recurrence-tab ${mode === 'recurring' ? 'active' : ''}`}
        onClick={() => { setMode('recurring'); setError(''); }}
        disabled={busy}
      >
        <Repeat size={15} /> Seria regularna (kalendarz)
      </button>
    </div>

    <div className="recurrence-mode-tabs mb-4">
      <button
        type="button"
        className={`recurrence-tab ${!isExtra ? 'active' : ''}`}
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
    </div>

    <form onSubmit={submit}>
      <fieldset disabled={busy} className="space-y-4">
        <div>
          <label className="field" htmlFor={titleId}>{isExtra ? 'Nazwa nabożeństwa' : 'Nazwa Mszy Świętej'}
            <input
              id={titleId}
              name="title"
              required
              maxLength={160}
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
            />
          </label>
          <div className="preset-chips">
            {(!isExtra
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

        {mode === 'single' ? (
          <div className="grid grid-cols-2 gap-4">
            <label className="field">Data<input type="date" name="date" required defaultValue={initialDate} /></label>
            <label className="field" htmlFor={timeId}>Godzina
              <input id={timeId} type="time" name="time" required defaultValue="18:00" step={60} />
            </label>
          </div>
        ) : (
          <>
            <div>
              <span className="field-label">Dni tygodnia</span>
              <div className="weekday-selector-grid">
                {WEEKDAY_BUTTONS.map(btn => {
                  const isSelected = selectedDays.includes(btn.dow);
                  return (
                    <button
                      type="button"
                      key={btn.dow}
                      className={`weekday-pill ${isSelected ? 'active' : ''}`}
                      onClick={() => toggleDay(btn.dow)}
                      aria-pressed={isSelected}
                    >
                      {btn.label}
                    </button>
                  );
                })}
              </div>
              <p className="field-hint mt-1">Zaznacz dni powtarzania (np. Pn, Wt, Śr).</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="field">Godzina
                <input type="time" name="time" required defaultValue="18:00" step={60} />
              </label>
              <label className="field">Od dnia
                <input
                  type="date"
                  name="start_date"
                  required
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </label>
            </div>

            <div>
              <label className="field">Powtarzaj do (koniec serii)
                <input
                  type="date"
                  name="end_date"
                  required
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </label>
              <div className="preset-chips">
                <button type="button" onClick={() => setEndPreset(30)}>+1 mies.</button>
                <button type="button" onClick={() => setEndPreset(90)}>+3 mies.</button>
                <button type="button" onClick={() => setEndPreset(180)}>+6 mies.</button>
                <button type="button" onClick={setEndYear}>Do końca roku</button>
              </div>
            </div>

            <div className="recurrence-summary-box">
              <strong>Podsumowanie serii:</strong>
              <span>
                {occurrences === 0
                  ? 'Brak pasujących dni w wybranym przedziale dat.'
                  : `Zostanie utworzonych ${occurrences} ${occurrences === 1 ? 'termin' : occurrences < 5 ? 'terminy' : 'terminów'} w strefie Europe/Warsaw.`}
              </span>
            </div>
          </>
        )}

        <label className="field" htmlFor={spotsId}>Sugerowana liczba miejsc <span className="field-optional">opcjonalnie</span>
          <input id={spotsId} type="number" name="spots" min={1} max={2147483647} step={1} placeholder="4" />
          <span className="field-hint">To wskazówka, nie limit. Każdy chętny może się dopisać.</span>
        </label>
        <p className="text-xs text-[var(--muted)]">Wszystkie godziny podajemy w czasie polskim (Europe/Warsaw).</p>
      </fieldset>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="modal-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Anuluj</button>
        <button type="submit" className="button primary" disabled={busy || (mode === 'recurring' && occurrences === 0)}>
          {busy ? <LoaderCircle size={17} className="animate-spin" /> : <CalendarPlus size={17} />}
          {busy ? 'Zapisywanie…' : mode === 'recurring'
            ? `Utwórz ${occurrences} ${isExtra ? (occurrences === 1 ? 'nabożeństwo' : occurrences < 5 ? 'nabożeństwa' : 'nabożeństw') : (occurrences === 1 ? 'Mszę' : occurrences < 5 ? 'Msze' : 'Mszy')}`
            : isExtra ? 'Dodaj nabożeństwo' : 'Dodaj Mszę Świętą'}
        </button>
      </div>
    </form>
  </Modal>;
}
