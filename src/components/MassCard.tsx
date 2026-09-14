import { Check, CirclePlus, Repeat2, Trash2, UserMinus, Users, Undo2, LoaderCircle, Clock3 } from 'lucide-react';
import type { EffectiveAttendee, Mass, MassAttendee, RecurringRule } from '../types/database';
import { dateKey, DAY_NAMES, timeSlot, weekday } from '../lib/dates';
import { matchesRule } from '../lib/attendance';

export type MassAction = 'single' | 'recurring' | 'withdraw' | 'excuse' | 'restore';
interface Props {
  mass: Mass;
  attendees: EffectiveAttendee[];
  rules: RecurringRule[];
  exceptions: MassAttendee[];
  activeId: string;
  busy: boolean;
  onAction: (mass: Mass, action: MassAction) => void;
  onDelete: (mass: Mass) => void;
  isAdmin?: boolean;
  onEdit?: (mass: Mass) => void;
  onEditTime?: (mass: Mass) => void;
}

export default function MassCard({ mass, attendees, rules, exceptions, activeId, busy, onAction, onDelete, isAdmin = false, onEdit, onEditTime }: Props) {
  const handleEdit = onEdit ?? onEditTime;
  const attendance = attendees.find(a => a.server_id === activeId);
  const hasRule = rules.some(r => r.server_id === activeId && matchesRule(mass, r));
  const excused = exceptions.some(a => a.mass_id === mass.id && a.server_id === activeId && a.type === 'excused');
  const count = attendees.length;
  const full = count >= mass.suggested_spots;
  const extra = count - mass.suggested_spots;
  const time = timeSlot(mass.start_time).slice(0, 5);
  const recurringLabel = `${DAY_NAMES[weekday(dateKey(mass.start_time))]} · ${time}`;
  const isDevotion = mass.is_extra;
  const capacityState = count === 0 ? 'empty' : full ? 'filled' : 'partial';

  return <article className={`mass-card ${attendance ? 'my-mass' : ''}`} aria-label={`${mass.title}, ${time}`} aria-busy={busy}>
    <div className="mass-heading">
      <div className="mass-time">
        <span className="mass-time-digits">{time}</span>
        <span className="mass-type-label">{isDevotion ? 'NABOŻEŃSTWO' : 'MSZA ŚW.'}</span>
      </div>
      <div className="mass-meta">
        <h4>{mass.title}</h4>
        <div className={`capacity ${capacityState} ${full ? 'filled' : 'open'}`}>
          <span className="status-dot" />
          <span>{count}/{mass.suggested_spots} {extra > 0 ? `(+${extra} dodatkowy${extra > 1 ? 'ch' : ''})` : full ? '(pełna obstawa)' : 'miejsc'}</span>
        </div>
      </div>
      {isAdmin && <button className="icon-button delete-mass" aria-label={`Usuń ${isDevotion ? 'nabożeństwo' : 'Mszę Świętą'}: ${mass.title}, ${time}`} disabled={busy} onClick={() => onDelete(mass)}><Trash2 size={17} /></button>}
    </div>
    {isAdmin && handleEdit && <button className="edit-time-button" disabled={busy} onClick={() => handleEdit(mass)}><Clock3 size={14} />Edytuj {isDevotion ? 'nabożeństwo' : 'Mszę'}</button>}
    <div className="attendance-section">
      <div className="attendance-label"><Users size={14} /><span>Zadeklarowani</span><span>{count}</span>
        {attendance && <span className="you-attend"><Check size={12} />Służysz</span>}
      </div>
      {attendees.length ? <ul className="attendee-list">
        {attendees.map(person => <li key={person.server_id}>
          <span className={`avatar ${person.server_id === activeId ? 'own-avatar' : ''}`} aria-hidden="true">{person.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</span>
          <div className="attendee-person"><span>{person.name}{person.server_id === activeId && <small> Ty</small>}</span><span>{person.rank}</span></div>
          <span className={`type-badge ${person.attendance_type === 'recurring' ? 'recurring' : ''}`}>
            {person.attendance_type === 'recurring' && <Repeat2 size={11} />}
            {person.attendance_type === 'recurring' ? 'Stały' : 'Jednorazowy'}
          </span>
        </li>)}
      </ul> : <div className="no-attendees"><Users size={22} strokeWidth={1.3} /><p>Jeszcze nikt się nie zapisał.<br /><span>Możesz być pierwszy.</span></p></div>}
    </div>
    <div className="mass-actions">
      {!activeId ? <p className="select-prompt">Wybierz ministranta w nagłówku, aby się zapisać.</p> : <>
        {excused && <p className="excused-note">Zgłoszono Twoją nieobecność w tym terminie.</p>}
        {excused ? <button className="button secondary w-full" disabled={busy} onClick={() => onAction(mass, 'restore')}><Undo2 size={16} />{hasRule ? 'Przywróć obecność w tym dniu' : 'Zapisz się jednorazowo'}</button>
          : attendance ? <button className="button registered w-full" disabled={busy} onClick={() => onAction(mass, hasRule ? 'excuse' : 'withdraw')}>
            <UserMinus size={16} />{hasRule ? 'Zgłoś nieobecność w tym dniu' : 'Wypisz się'}
          </button> : <button className="button primary w-full" disabled={busy} onClick={() => onAction(mass, 'single')}>
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <CirclePlus size={16} />}Zapisz się jednorazowo
          </button>}
        {!hasRule && (
          <button
            type="button"
            className="button secondary recurring-button w-full"
            disabled={busy}
            onClick={() => onAction(mass, 'recurring')}
          >
            <Repeat2 size={16} />Ustaw jako mój stały dyżur
          </button>
        )}
        {hasRule && <p className="recurring-note"><Repeat2 size={13} />Twój stały dyżur · {recurringLabel}</p>}
      </>}
    </div>
  </article>;
}
