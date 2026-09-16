import { useRef, useState } from 'react';
import { AlertCircle, LoaderCircle, RefreshCw, RotateCcw, Save, Trophy } from 'lucide-react';
import { buildCompetition } from '../lib/competition';
import { adjustPoints, resetPoints, type PointEdit } from '../lib/repository';
import type { AdminSession, ScheduleData } from '../types/database';
import Modal from './Modal';

interface Props { data: ScheduleData | null; now: Date; loading: boolean; error: string; session: AdminSession; onRefresh: () => Promise<void>; onClose: () => void; onSaved: (message: string) => void }
export default function AdminPointsModal({ data, now, loading, error, session, onRefresh, onClose, onSaved }: Props) {
  const [serverId, setServerId] = useState('');
  const [mode, setMode] = useState<PointEdit['mode']>('add');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState('');
  const lock = useRef(false);
  const result = data ? buildCompetition(data, now) : null;
  const person = result?.profiles.find(p => p.server.id === serverId);
  const numeric = value.trim() ? Number(value) : NaN;
  const target = person ? mode === 'set' ? numeric : person.points + (mode === 'add' ? numeric : -numeric) : NaN;
  const valid = Number.isSafeInteger(numeric) && numeric >= 0 && numeric <= 1000000 && target >= 0 && target <= 1000000;
  async function save(reset: boolean) {
    if (lock.current || !data || loading || error || (reset ? resetText !== 'RESET' : !valid || !person)) return;
    lock.current = true; setBusy(true); setSaveError('');
    try {
      if (reset) await resetPoints(data, session);
      else await adjustPoints({ serverId, mode, value: numeric, reason }, data, session);
      setValue(''); setReason(''); setResetOpen(false); setResetText('');
      onSaved(reset ? 'Zresetowano punktację bieżącego sezonu.' : `Zapisano punktację: ${person!.server.name}.`);
      await onRefresh();
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Nie udało się zmienić punktacji.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Modal title="Zarządzanie punktacją" onClose={onClose} busy={busy} className="admin-points-modal">
    <p className="field-hint">Sezon {result?.season.label ?? '…'}. Zmiany są widoczne dla całej wspólnoty i zapisywane w historii punktów.</p>
    {(error || saveError) && <div className="error-banner" role="alert"><AlertCircle size={18} /><p>{saveError || error}</p><button className="button secondary" disabled={busy || loading} onClick={() => { setSaveError(''); void onRefresh(); }}><RefreshCw size={15} />Odśwież</button></div>}
    {loading && <p className="services-loading" role="status"><LoaderCircle size={18} className="animate-spin" />Odświeżamy punktację…</p>}
    <form onSubmit={event => { event.preventDefault(); void save(false); }}>
      <fieldset disabled={busy || loading || !!error || !data || resetOpen}>
        <label className="field">Ministrant<select value={serverId} onChange={event => setServerId(event.target.value)} required><option value="">Wybierz osobę</option>{result?.profiles.map(p => <option key={p.server.id} value={p.server.id}>{p.server.name}</option>)}</select></label>
        {person && <div className="points-current"><Trophy size={22} /><span>Aktualny wynik<strong>{person.points.toLocaleString('pl-PL')} pkt</strong></span></div>}
        <label className="field">Rodzaj zmiany<select value={mode} onChange={event => setMode(event.target.value as PointEdit['mode'])}><option value="add">Dodaj punkty</option><option value="subtract">Odejmij punkty</option><option value="set">Ustaw dokładny wynik</option></select></label>
        <label className="field">{mode === 'set' ? 'Nowy wynik' : 'Liczba punktów'}<input type="number" inputMode="numeric" min="0" max="1000000" step="1" value={value} onChange={event => setValue(event.target.value)} required /></label>
        <label className="field">Powód zmiany <span className="field-optional">(opcjonalnie)</span><input value={reason} maxLength={240} onChange={event => setReason(event.target.value)} placeholder="Np. pomoc przy przygotowaniu liturgii" /></label>
        {person && value && <p className={valid ? 'points-preview' : 'field-hint'} aria-live="polite">{valid ? `Po zapisaniu: ${person.points} → ${target} pkt` : 'Podaj całkowitą liczbę. Wynik nie może być ujemny ani przekroczyć 1 000 000 pkt.'}</p>}
        <p className="field-hint">Korekta zmienia punkty i poziom. Obecności, serie i odznaki pozostają zachowane; kolejne potwierdzenia dalej naliczają punkty.</p>
        <button type="submit" className="button primary points-save" disabled={!valid || !person}><Save size={16} />{busy ? 'Zapisywanie…' : 'Zapisz punktację'}</button>
      </fieldset>
    </form>
    <section className="points-reset"><h3>Reset punktacji</h3><p>Wyzeruj punkty wszystkich osób w bieżącym sezonie. Po resecie punkty dają tylko służby rozpoczynające się po resecie. Wcześniejsze służby i korekty nie przywrócą starego wyniku. Historia obecności, serie i odznaki pozostaną zachowane.</p>
      {!resetOpen ? <button className="button secondary" disabled={busy || loading || !!error || !data} onClick={() => setResetOpen(true)}><RotateCcw size={16} />Resetuj punktację wszystkich</button> : <div className="points-reset-confirmation">
        <label className="field">Aby potwierdzić reset całej wspólnoty, wpisz RESET<input value={resetText} onChange={event => setResetText(event.target.value)} disabled={busy} autoComplete="off" /></label>
        <div className="modal-actions"><button className="button secondary" disabled={busy} onClick={() => { setResetOpen(false); setResetText(''); }}>Anuluj reset</button><button className="button danger" disabled={busy || loading || !!error || resetText !== 'RESET'} onClick={() => void save(true)}>Wyzeruj wszystkim punkty</button></div>
      </div>}
    </section>
  </Modal>;
}
