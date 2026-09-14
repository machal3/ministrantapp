import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { LoaderCircle, Save } from 'lucide-react';
import Modal from './Modal';
import { RANKS } from '../types/database';
import type { AltarServer, Rank } from '../types/database';

interface Props { servers: AltarServer[]; onClose: () => void; onSave: (server: AltarServer) => Promise<void> }

export default function AdminServersModal({ servers, onClose, onSave }: Props) {
  const [selectedId, setSelectedId] = useState(servers[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const lock = useRef(false);
  const selected = servers.find(s => s.id === selectedId);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || lock.current) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name')).trim();
    if (!name) { setError('Wpisz imię i nazwisko.'); return; }
    lock.current = true;
    setBusy(true); setError(''); setSaved('');
    try {
      await onSave({ id: selected.id, name, rank: String(form.get('rank')) as Rank });
      setSaved('Zapisano dane ministranta.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Nie udało się zapisać danych.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Modal title="Edytuj ministrantów" onClose={onClose} busy={busy}>
    <label className="field mb-5">Wybierz ministranta do edycji
      <select value={selected ? selectedId : ''} disabled={busy} onChange={e => { setSelectedId(e.target.value); setError(''); setSaved(''); }}>
        {!selected && <option value="">Wybierz ministranta</option>}
        {servers.map(s => <option value={s.id} key={s.id}>{s.name} · {s.rank}</option>)}
      </select>
    </label>
    {selected ? <form key={selected.id} onSubmit={submit}>
      <fieldset disabled={busy} className="space-y-5">
        <label className="field">Imię i nazwisko<input name="name" maxLength={100} defaultValue={selected.name} required /></label>
        <label className="field">Stopień<select name="rank" defaultValue={selected.rank}>{RANKS.map(rank => <option key={rank}>{rank}</option>)}</select></label>
      </fieldset>
      <p className="mt-4 text-xs text-[var(--muted)]">Zmiana danych zachowuje wszystkie zapisy i stałe dyżury tej osoby.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {saved && <p className="mt-4 text-sm text-[var(--green)]" role="status">{saved}</p>}
      <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Zamknij</button>
        <button className="button primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}Zapisz dane</button></div>
    </form> : <p className="text-sm text-[var(--muted)]">Brak ministrantów do edycji.</p>}
  </Modal>;
}
