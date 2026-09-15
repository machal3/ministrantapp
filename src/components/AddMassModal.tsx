import { massOccurrenceDates } from '../lib/massRecurrence';
import { useId, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarDays, CalendarPlus, Church, Flame, LoaderCircle, Repeat } from 'lucide-react';
import Modal from './Modal';
import { CELEBRANT_PRESETS } from './WeekCelebrantsModal';
import { shiftDate, weekday, zonedIso, polishDate } from '../lib/dates';
import type { NewMass, RecurringMassesInput } from '../types/database';

interface Props {
  initialDate: string;
  initialTime?: string;
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

export default function AddMassModal({ initialDate, initialTime, onClose, onSubmit, onSubmitRecurring }: Props) {
  const [mode, setMode] = useState<'single' | 'recurring'>('single');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [noSpots, setNoSpots] = useState(false);
  const submitting = useRef(false);

  // Liturgy type: false = Msza Święta, true = Nabożeństwo
  const [isExtra, setIsExtra] = useState(false);
  const [isOther, setIsOther] = useState(false);
  const [title, setTitle] = useState('Msza Święta');
  const [celebrant, setCelebrant] = useState('');
  const [liturgyType, setLiturgyType] = useState('');

  // Recurring form state
  const [startDate, setStartDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(() => shiftDate(initialDate, 90));
  const [selectedDays, setSelectedDays] = useState<number[]>([weekday(initialDate)]);

  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [intervalWeeks, setIntervalWeeks] = useState(1);
  const [intervalMonths, setIntervalMonths] = useState(1);
  const [monthWeeks, setMonthWeeks] = useState<number[]>([1]);
  function applyPreset(day: number, ordinal: number) {
    setFrequency('monthly'); setIntervalMonths(1); setSelectedDays([day]); setMonthWeeks([ordinal]);
  }
  const titleId = useId();
  const timeId = useId();
  const spotsId = useId();

  const dates = useMemo(() => massOccurrenceDates({ start_date: startDate, end_date: endDate, days: selectedDays, frequency, interval_weeks: intervalWeeks, interval_months: intervalMonths, month_weeks: monthWeeks }), [startDate, endDate, selectedDays, frequency, intervalWeeks, intervalMonths, monthWeeks]);
  const occurrences = dates.length;

  function handleTypeChange(devotion: boolean) {
    setIsOther(false);
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
      const suggestedSpots = noSpots ? null : rawSpots === '' ? 4 : Number(rawSpots);
      const time = String(form.get('time'));

      if (!finalTitle) throw new Error(isOther ? 'Wpisz nazwę wydarzenia.' : isExtra ? 'Wpisz nazwę nabożeństwa.' : 'Wpisz nazwę Mszy Świętej.');
      if (suggestedSpots !== null && (!Number.isInteger(suggestedSpots) || suggestedSpots < 1 || suggestedSpots > 2147483647)) {
        throw new Error('Sugerowana liczba miejsc musi być dodatnią liczbą całkowitą.');
      }

      submitting.current = true;
      setBusy(true);

      const finalCelebrant = celebrant.trim() || null;
      const finalLiturgyType = mode === 'single' ? liturgyType.trim() || null : null;

      if (mode === 'single') {
        const startTime = zonedIso(String(form.get('date')), time);
        await onSubmit({
          title: finalTitle,
          start_time: startTime,
          suggested_spots: suggestedSpots,
          is_extra: isExtra,
          category: isOther ? 'other' : isExtra ? 'devotion' : 'mass',
          celebrant: finalCelebrant,
          liturgy_type: finalLiturgyType,
        });
      } else {
        if (!onSubmitRecurring) throw new Error('Dodawanie cyklicznych Mszy jest niedostępne.');
        if (!selectedDays.length) throw new Error('Wybierz co najmniej jeden dzień tygodnia.');
        if (endDate < startDate) throw new Error('Data końcowa nie może być wcześniejsza niż data początkowa.');
        if (occurrences === 0) throw new Error('W wybranym przedziale dat nie wypada żaden ze wskazanych dni tygodnia.');

        await onSubmitRecurring({
          frequency, interval_weeks: intervalWeeks, interval_months: intervalMonths, month_weeks: monthWeeks,
          title: finalTitle,
          suggested_spots: suggestedSpots,
          is_extra: isExtra, category: isOther ? 'other' : isExtra ? 'devotion' : 'mass',
          celebrant: finalCelebrant,
          liturgy_type: finalLiturgyType,
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
    ? (isOther ? 'Dodaj regularne wydarzenia' : isExtra ? 'Dodaj regularne nabożeństwa' : 'Dodaj regularne Msze Święte')
    : (isOther ? 'Dodaj wydarzenie' : isExtra ? 'Dodaj nabożeństwo' : 'Dodaj Mszę Świętą');

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
          <label className="field" htmlFor={titleId}>{isOther ? 'Nazwa wydarzenia' : isExtra ? 'Nazwa nabożeństwa' : 'Nazwa Mszy Świętej'}
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
              {CELEBRANT_PRESETS.map(preset => (
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
                disabled={mode === 'recurring'}
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
                  disabled={busy || mode === 'recurring'}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="field-hint">Okazja dotyczy jednego terminu. W serii dodaj ją później przez edycję wybranej Mszy. Uroczystość lub święto ustaw w „Oznacz dzień” nad wydarzeniami.</p>
        {mode === 'single' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="field">Data<input type="date" name="date" required defaultValue={initialDate} /></label>
            <label className="field" htmlFor={timeId}>Godzina
              <input id={timeId} type="time" name="time" required defaultValue={initialTime ?? '18:00'} step={60} />
            </label>
          </div>
        ) : (
          <>
            <div>
              <span className="field-label">Popularne rytmy w parafii</span>
              <div className="preset-chips">
                <button type="button" onClick={() => applyPreset(5, 1)}>Pierwszy piątek</button>
                <button type="button" onClick={() => applyPreset(6, 1)}>Pierwsza sobota</button>
                <button type="button" onClick={() => applyPreset(3, 3)}>Trzecia środa</button>
                <button type="button" onClick={() => applyPreset(0, -1)}>Ostatnia niedziela</button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="field">Rytm serii<select value={frequency} onChange={e => setFrequency(e.target.value as 'weekly' | 'monthly')}><option value="weekly">Co określoną liczbę tygodni</option><option value="monthly">Wybrane dni miesiąca</option></select></label>
              {frequency === 'weekly' ? <label className="field">Częstotliwość<select value={intervalWeeks} onChange={e => setIntervalWeeks(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n === 1 ? 'Co tydzień' : n < 5 ? 'Co ' + n + ' tygodnie' : 'Co ' + n + ' tygodni'}</option>)}</select></label>
                : <label className="field">Częstotliwość<select value={intervalMonths} onChange={e => setIntervalMonths(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n === 1 ? 'Co miesiąc' : n < 5 ? 'Co ' + n + ' miesiące' : 'Co ' + n + ' miesięcy'}</option>)}</select></label>}
            </div>
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

            {frequency === 'monthly' ? <fieldset className="month-week-options"><legend>Które wystąpienia wybranych dni?</legend><div>{[1,2,3,4,5,-1].map(n => <label key={n}><input type="checkbox" checked={monthWeeks.includes(n)} onChange={e => setMonthWeeks(prev => e.target.checked ? [...prev,n] : prev.filter(v => v !== n))} /><span>{n === -1 ? 'Ostatnie' : ['Pierwsze','Drugie','Trzecie','Czwarte','Piąte'][n-1]}</span></label>)}</div><p>Możesz łączyć opcje, np. pierwszy i trzeci piątek. Wybór dotyczy każdego zaznaczonego dnia tygodnia. Piąte wystąpienie jest pomijane, jeśli nie wypada w danym miesiącu.</p></fieldset>
              : intervalWeeks > 1 && <p className="field-hint">Pierwszy cykl to 7 dni od daty „Od dnia”. Kolejne aktywne tygodnie powtarzają się z wybraną częstotliwością.</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="field">Godzina
                <input type="time" name="time" required defaultValue={initialTime ?? '18:00'} step={60} />
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
                  min={startDate}
                  max={startDate ? shiftDate(startDate, 366) : undefined}
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </label>
              <p className="field-hint">Maksymalnie 366 dni. Cykl miesięczny liczy się od miesiąca daty początkowej.</p>
              <div className="preset-chips">
                <button type="button" onClick={() => setEndPreset(30)}>+1 mies.</button>
                <button type="button" onClick={() => setEndPreset(90)}>+3 mies.</button>
                <button type="button" onClick={() => setEndPreset(180)}>+6 mies.</button>
                <button type="button" onClick={setEndYear}>Do końca roku</button>
              </div>
            </div>

            <div className="recurrence-summary-box">
              <strong>Podsumowanie serii:</strong>
              <span>{frequency === 'monthly' ? `Wystąpienia: ${monthWeeks.map(n => n === -1 ? 'ostatnie' : n + '.').join(', ')} · co ${intervalMonths} mies.` : `Co ${intervalWeeks} tyg.`} · {WEEKDAY_BUTTONS.filter(d => selectedDays.includes(d.dow)).map(d => d.label).join(', ')}</span>
              {dates.length > 0 && <span>Najbliższe: {dates.slice(0, 4).map(d => polishDate(d, { day: 'numeric', month: 'short', year: 'numeric' })).join(' · ')}</span>}
              <span>
                {occurrences === 0
                  ? 'Brak pasujących dni w wybranym przedziale dat.'
                  : `Liczba terminów do utworzenia: ${occurrences}.`}
              </span>
            </div>
          </>
        )}

        <label className="capacity-option"><input type="checkbox" checked={noSpots} onChange={e => setNoSpots(e.target.checked)} />Bez określonej liczby osób</label>
        {!noSpots && <label className="field" htmlFor={spotsId}>Sugerowana liczba miejsc <span className="field-optional">opcjonalnie</span>
          <input id={spotsId} type="number" name="spots" min={1} max={2147483647} step={1} placeholder="4" />
          <span className="field-hint">To wskazówka, nie limit. Każdy chętny może się dopisać.</span>
        </label>}
        <p className="text-xs text-[var(--muted)]">Wszystkie godziny podajemy w czasie polskim (Europe/Warsaw).</p>
      </fieldset>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="modal-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Anuluj</button>
        <button type="submit" className="button primary" disabled={busy || (mode === 'recurring' && occurrences === 0)}>
          {busy ? <LoaderCircle size={17} className="animate-spin" /> : <CalendarPlus size={17} />}
          {busy ? 'Zapisywanie…' : mode === 'recurring'
            ? `Utwórz ${occurrences} ${isOther ? (occurrences === 1 ? 'wydarzenie' : 'wydarzeń') : isExtra ? (occurrences === 1 ? 'nabożeństwo' : occurrences < 5 ? 'nabożeństwa' : 'nabożeństw') : (occurrences === 1 ? 'Mszę' : occurrences < 5 ? 'Msze' : 'Mszy')}`
            : isOther ? 'Dodaj wydarzenie' : isExtra ? 'Dodaj nabożeństwo' : 'Dodaj Mszę Świętą'}
        </button>
      </div>
    </form>
  </Modal>;
}
