import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { LoaderCircle, Save } from 'lucide-react';
import Modal from './Modal';
import { dateKey, polishDate, timeSlot, zonedIso } from '../lib/dates';
import type { Mass } from '../types/database';

interface Props { mass: Mass; onClose: () => void; onSave: (id: string, startTime: string) => Promise<void> }

export default function EditMassTimeModal({ mass, onClose, onSave }: Props) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = new FormData(event.currentTarget);
    lock.current = true; setBusy(true); setError('');
    try {
      const startTime = zonedIso(dateKey(mass.start_time), String(form.get('time')));
      await onSave(mass.id, startTime);
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Nie udało się zmienić godziny.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Modal title="Edytuj godzinę Mszy" onClose={onClose} busy={busy}>
    <p className="mb-5 text-sm text-[var(--muted)]">{mass.title} · {polishDate(dateKey(mass.start_time), { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    <form onSubmit={submit}>
      <label className="field">Nowa godzina<input type="time" name="time" defaultValue={timeSlot(mass.start_time).slice(0, 5)} step={60} required disabled={busy} /></label>
      <div className="info-banner">Zmiana dotyczy tylko tej Mszy. Zapisy jednorazowe i nieobecności pozostaną. Lista osób ze stałych dyżurów zostanie przeliczona dla nowej godziny.</div>
      <p className="mt-4 text-xs text-[var(--muted)]">Godzina w strefie Europe/Warsaw.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Anuluj</button>
        <button className="button primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}Zapisz godzinę</button></div>
    </form>
  </Modal>;
}
