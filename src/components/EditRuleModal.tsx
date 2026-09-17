import { useRef, useState } from 'react';
import { Save, LoaderCircle } from 'lucide-react';
import Modal from './Modal';
import type { RecurringRule } from '../types/database';
import { DAY_NAMES, dateKey, shiftDate, polishDate, zonedIso } from '../lib/dates';
import { matchesRule } from '../lib/attendance';
import { describeRule } from '../lib/recurrence';

export default function EditRuleModal({ rule, onClose, onSave }: { rule: RecurringRule; onClose: () => void; onSave: (rule: RecurringRule) => Promise<void> }) {
  const [draft, setDraft] = useState<RecurringRule>({ ...rule, frequency: rule.frequency ?? 'weekly', interval_weeks: rule.interval_weeks ?? 1, month_weeks: rule.month_weeks ?? [1] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const patch = (changes: Partial<RecurringRule>) => setDraft(previous => ({ ...previous, ...changes }));
  const next: string[] = [];
  for (let i = 0; i < 740 && next.length < 3; i++) {
    const date = shiftDate(draft.start_date && draft.start_date > dateKey() ? draft.start_date : dateKey(), i);
    try {
      if (matchesRule({ id: '', title: '', is_extra: false, suggested_spots: 1, start_time: zonedIso(date, draft.time_slot) }, draft)) next.push(date);
    } catch { /* Skip a wall time that does not exist during DST. */ }
  }
  return <Modal title="Edytuj stały dyżur" onClose={onClose} busy={busy}>
    <p className="rule-intro">Ustaw rytm, który pasuje do Twojej służby.</p>
    <form onSubmit={async event => {
      event.preventDefault();
      if (lock.current) return;
      if (draft.frequency === 'monthly' && !draft.month_weeks?.length) { setError('Wybierz przynajmniej jeden tydzień miesiąca.'); return; }
      if (draft.start_date && draft.end_date && draft.end_date < draft.start_date) { setError('Data końcowa nie może poprzedzać daty początkowej.'); return; }
      lock.current = true; setBusy(true); setError('');
      try { await onSave(draft); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Nie udało się zapisać dyżuru.'); }
      finally { lock.current = false; setBusy(false); }
    }}>
      <fieldset disabled={busy} className="rule-fields">
        <div className="rule-form-grid">
          <label className="field">Dzień tygodnia<select value={draft.day_of_week} onChange={e => patch({ day_of_week: Number(e.target.value) })}>{DAY_NAMES.map((name, i) => <option key={name} value={i}>{name}</option>)}</select></label>
          <label className="field">Godzina<input type="time" required step={60} value={draft.time_slot.slice(0, 5)} onChange={e => patch({ time_slot: e.target.value + ':00' })} /></label>
        </div>
        <label className="field">Powtarzanie<select value={draft.frequency} onChange={e => patch({ frequency: e.target.value as 'weekly' | 'monthly' })}><option value="weekly">Co określoną liczbę tygodni</option><option value="monthly">Wybrane tygodnie miesiąca</option></select></label>
        {draft.frequency === 'weekly' ? <label className="field">Częstotliwość<select value={draft.interval_weeks} onChange={e => patch({ interval_weeks: Number(e.target.value), start_date: Number(e.target.value) > 1 ? draft.start_date || dateKey() : draft.start_date })}>{Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{describeRule({ ...draft, interval_weeks: n })}</option>)}</select></label>
          : <fieldset className="month-week-options"><legend>Tygodnie miesiąca</legend><div>{[1, 2, 3, 4, 5, -1].map(n => <label key={n}><input type="checkbox" checked={draft.month_weeks?.includes(n) ?? false} onChange={e => patch({ month_weeks: e.target.checked ? [...(draft.month_weeks ?? []), n].sort((a, b) => a - b) : draft.month_weeks?.filter(v => v !== n) })} /><span>{n === -1 ? 'Ostatni' : ['Pierwszy', 'Drugi', 'Trzeci', 'Czwarty', 'Piąty'][n - 1]}</span></label>)}</div><p>Pierwszy oznacza dni 1–7, drugi 8–14 itd. Ostatni to ostatnie wystąpienie wybranego dnia w miesiącu. Piąty jest pomijany, jeśli nie występuje.</p></fieldset>}
        <div className="rule-form-grid">
          <label className="field">{draft.frequency === 'weekly' && (draft.interval_weeks ?? 1) > 1 ? 'Początek pierwszego cyklu' : 'Obowiązuje od (opcjonalnie)'}<input type="date" required={draft.frequency === 'weekly' && (draft.interval_weeks ?? 1) > 1} value={draft.start_date ?? ''} onChange={e => patch({ start_date: e.target.value || null })} /></label>
          <label className="field">Do kiedy (opcjonalnie)<input type="date" min={draft.start_date ?? undefined} value={draft.end_date ?? ''} onChange={e => patch({ end_date: e.target.value || null })} /></label>
        </div>
        {draft.frequency === 'weekly' && (draft.interval_weeks ?? 1) > 1 && <p className="rule-help">Pierwszy dyżur przypada w ciągu 7 dni od początku cyklu. Kolejne powtarzają się z wybraną częstotliwością.</p>}
      </fieldset>
      <div className="rule-preview" aria-live="polite"><strong>{DAY_NAMES[draft.day_of_week]} o {draft.time_slot.slice(0, 5)}</strong><span>{describeRule(draft)}</span><p>Najbliższe daty: {next.length ? next.map(d => polishDate(d, { day: 'numeric', month: 'short', year: 'numeric' })).join(' · ') : 'brak w wybranym okresie'}.</p><small>Dyżur pojawi się przy Mszach i nabożeństwach zaplanowanych na te daty i godzinę.</small></div>
      <p className="rule-help">Zmiana przeliczy dyżury również w przeszłości. Zapisy jednorazowe i zgłoszone nieobecności pozostaną zachowane.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Anuluj</button><button className="button primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}Zapisz dyżur</button></div>
    </form>
  </Modal>;
}
