import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarPlus, LoaderCircle } from 'lucide-react';
import Modal from './Modal';
import { zonedIso } from '../lib/dates';
import type { NewMass } from '../types/database';

interface Props { initialDate: string; onClose: () => void; onSubmit: (mass: NewMass) => Promise<void> }

export default function AddMassModal({ initialDate, onClose, onSubmit }: Props) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    setError('');
    try {
      const title = String(form.get('title')).trim();
      const rawSpots = String(form.get('spots')).trim();
      const suggestedSpots = rawSpots === '' ? 4 : Number(rawSpots);
      if (!title) throw new Error('Wpisz nazwę nabożeństwa.');
      if (!Number.isInteger(suggestedSpots) || suggestedSpots < 1 || suggestedSpots > 2147483647) throw new Error('Sugerowana liczba miejsc musi być dodatnią liczbą całkowitą.');
      const startTime = zonedIso(String(form.get('date')), String(form.get('time')));
      submitting.current = true;
      setBusy(true);
      await onSubmit({ title, start_time: startTime, suggested_spots: suggestedSpots, is_extra: true });
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Nie udało się dodać nabożeństwa.'); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <Modal title="Dodaj Mszę / Nabożeństwo" onClose={onClose} busy={busy}>
    <p className="mb-6 text-sm text-[var(--muted)]">Dodatkowy termin dla naszej wspólnoty. Stałe dyżury o tej samej porze zostaną uwzględnione automatycznie.</p>
    <form onSubmit={submit}>
      <fieldset disabled={busy} className="space-y-5">
        <label className="field">Nazwa nabożeństwa
          <input name="title" required maxLength={160} defaultValue="Msza Święta" autoFocus />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="field">Data<input type="date" name="date" required defaultValue={initialDate} /></label>
          <label className="field">Godzina<input type="time" name="time" required defaultValue="18:00" step={60} /></label>
        </div>
        <label className="field">Sugerowana liczba miejsc <span className="field-optional">opcjonalnie</span>
          <input type="number" name="spots" min={1} max={2147483647} step={1} placeholder="4" />
          <span className="field-hint">To wskazówka, nie limit. Każdy chętny może się dopisać.</span>
        </label>
        <p className="text-xs text-[var(--muted)]">Wszystkie godziny podajemy w czasie polskim (Europe/Warsaw).</p>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Anuluj</button>
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? <LoaderCircle size={17} className="animate-spin" /> : <CalendarPlus size={17} />}
          {busy ? 'Dodawanie…' : 'Dodaj nabożeństwo'}
        </button>
      </div>
    </form>
  </Modal>;
}
