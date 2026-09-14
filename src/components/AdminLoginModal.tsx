import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { LoaderCircle, ShieldCheck } from 'lucide-react';
import Modal from './Modal';
import { loginAdmin } from '../lib/admin';
import type { AdminSession } from '../types/database';

export default function AdminLoginModal({ onClose, onLogin }: { onClose: () => void; onLogin: (session: AdminSession) => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try { onLogin(await loginAdmin(pin)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Nie udało się sprawdzić PIN-u.'); setPin(''); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Modal title="Tryb administratora" onClose={onClose} busy={busy}>
    <p className="mb-5 text-sm text-[var(--muted)]">Wpisz PIN, aby edytować ministrantów i zarządzać nabożeństwami. Sesja trwa 30 minut.</p>
    <form onSubmit={submit}>
      <label className="field">PIN administratora
        <input type="password" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4}
          autoComplete="off" required autoFocus value={pin} disabled={busy}
          onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Anuluj</button>
        <button className="button primary" disabled={busy || pin.length !== 4}>{busy ? <LoaderCircle size={17} className="animate-spin" /> : <ShieldCheck size={17} />}Odblokuj</button></div>
    </form>
  </Modal>;
}
