import { memo } from 'react';
import { peopleWord } from '../lib/people';
import { eventCategory } from '../lib/eventCategory';
import { Check, CirclePlus, Repeat2, Trash2, UserMinus, Users, Undo2, LoaderCircle, Clock3, UserRound, X } from 'lucide-react';
import type { AltarServer, EffectiveAttendee, Mass, MassAttendee, RecurringRule } from '../types/database';
import { dateKey, DAY_NAMES, timeSlot, weekday } from '../lib/dates';
import { attendanceState, isPastEvent } from '../lib/attendance';

export type MassAction = 'single' | 'recurring' | 'withdraw' | 'excuse' | 'restore' | 'attended' | 'absent' | 'undeclare';
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
  /** Presence answers for this mass by server id; undefined means unanswered. */
  presence?: Map<string, boolean>;
  now?: number;
  /** Full roster, used to display retroactive confirmations made without a declaration. */
  servers?: AltarServer[];
}

export default memo(function MassCard({ mass, attendees, rules, exceptions, activeId, busy, onAction, onDelete, isAdmin = false, onEdit, onEditTime, presence, now, servers }: Props) {
  const handleEdit = onEdit ?? onEditTime;
  const attendance = attendees.find(a => a.server_id === activeId);
  const hasSlotRule = rules.some(r => r.server_id === activeId && r.day_of_week === weekday(dateKey(mass.start_time)) && r.time_slot === timeSlot(mass.start_time));
  const { hasRule, excused } = attendanceState(mass, activeId, rules, exceptions);
  const past = isPastEvent(mass, now ?? Date.now());
  const confirmed = presence?.get(activeId);
  // Retroactive "Byłem" without a prior declaration (allowed by confirm_service)
  // is not part of effective_attendees. Show it so the roster stays truthful.
  const rosterIds = new Set(attendees.map(a => a.server_id));
  const extraConfirmed = past && presence && servers
    ? [...presence.entries()].filter(([serverId, attended]) => attended && !rosterIds.has(serverId))
      .map(([serverId]) => servers.find(s => s.id === serverId)).filter((s): s is AltarServer => !!s)
      .sort((a, b) => a.name.localeCompare(b.name, 'pl'))
    : [];
  const count = attendees.length;
  const full = mass.suggested_spots !== null && count >= mass.suggested_spots;
  const extra = mass.suggested_spots === null ? 0 : count - mass.suggested_spots;
  const time = timeSlot(mass.start_time).slice(0, 5);
  const recurringLabel = `${DAY_NAMES[weekday(dateKey(mass.start_time))]} · ${time}`;
  const isOther = eventCategory(mass) === 'other';
  const isDevotion = eventCategory(mass) === 'devotion';
  const capacityState = count === 0 ? 'empty' : full ? 'filled' : 'partial';

  return <article className={`mass-card ${isOther ? 'other-card' : isDevotion ? 'devotion-card' : 'eucharist-card'} ${attendance ? 'my-mass' : ''}`} aria-label={`${mass.title}, ${time}`} aria-busy={busy}>
    <div className="mass-heading">
      <div className="mass-time">
        <span className="mass-time-digits">{time}</span>
        <span className="mass-type-label">{isOther ? 'INNE' : isDevotion ? 'NABOŻEŃSTWO' : 'MSZA ŚW.'}</span>
      </div>
      <div className="mass-meta">
        <div className="mass-title-row">
          <h4>{mass.title}</h4>
        </div>
        <div className={`capacity ${capacityState} ${full ? 'filled' : 'open'}`}>
          <span className="status-dot" />
          <span>{mass.suggested_spots === null ? `${count} ${peopleWord(count)}` : `${count}/${mass.suggested_spots} ${peopleWord(mass.suggested_spots)}`}{extra > 0 ? ` (+${extra})` : full ? ' (pełna obstawa)' : ''}</span>
        </div>
      </div>
      {isAdmin && <button className="icon-button delete-mass" aria-label={`Usuń ${isOther ? 'wydarzenie' : isDevotion ? 'nabożeństwo' : 'Mszę Świętą'}: ${mass.title}, ${time}`} disabled={busy} onClick={() => onDelete(mass)}><Trash2 size={17} /></button>}
    </div>
    {isAdmin && handleEdit && <button className="edit-time-button" disabled={busy} onClick={() => handleEdit(mass)}><Clock3 size={14} />Edytuj {isOther ? 'wydarzenie' : isDevotion ? 'nabożeństwo' : 'Mszę'}</button>}
    {(mass.celebrant || mass.liturgy_type) && <div className="mass-details">
      {mass.celebrant && <div className="mass-celebrant" title={mass.celebrant}><UserRound size={13} aria-hidden="true" /><span>{mass.celebrant}</span></div>}
      {mass.liturgy_type && <span className="liturgy-rank-badge" title={mass.liturgy_type}>{mass.liturgy_type}</span>}
    </div>}
    <div className="attendance-section">
      <div className="attendance-label"><Users size={14} /><span>Zadeklarowani</span><span>{count}</span>
        {attendance && <span className="you-attend"><Check size={12} />Służysz</span>}
      </div>
      {attendees.length || extraConfirmed.length ? <ul className="attendee-list">
        {attendees.map(person => <li key={person.server_id}>
          <span className={`avatar ${person.server_id === activeId ? 'own-avatar' : ''}`} aria-hidden="true">{person.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</span>
          <div className="attendee-person"><span>{person.name}{person.server_id === activeId && <small> Ty</small>}</span><span>{person.rank}</span></div>
          <span className={`type-badge ${person.attendance_type === 'recurring' ? 'recurring' : ''}`}>
            {person.attendance_type === 'recurring' && <Repeat2 size={11} />}
            {person.attendance_type === 'recurring' ? 'Stały' : 'Jednorazowy'}
          </span>
          {past && presence?.get(person.server_id) === true && <span className="presence-badge is-present"><Check size={11} />Był</span>}
          {past && presence?.get(person.server_id) === false && <span className="presence-badge is-absent"><X size={11} />Nie był</span>}
          {past && presence && !presence.has(person.server_id) && <span className="presence-badge is-pending">Niepotwierdzona</span>}
        </li>)}
        {extraConfirmed.map(person => <li key={`confirmed-${person.id}`}>
          <span className={`avatar ${person.id === activeId ? 'own-avatar' : ''}`} aria-hidden="true">{person.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</span>
          <div className="attendee-person"><span>{person.name}{person.id === activeId && <small> Ty</small>}</span><span>{person.rank}</span></div>
          <span className="presence-badge is-present"><Check size={11} />Był</span>
        </li>)}
      </ul> : <div className="no-attendees"><Users size={22} strokeWidth={1.3} /><p>Jeszcze nikt się nie zapisał.<br /><span>Możesz być pierwszy.</span></p></div>}
    </div>
    <div className="mass-actions">
      {!activeId ? <p className="select-prompt">Wybierz ministranta w nagłówku, aby się zapisać.</p> : past ? <>
        {confirmed === true && <p className="confirmed-note"><Check size={13} />Potwierdziłeś: byłeś na tej służbie.</p>}
        {confirmed === undefined && excused && <p className="excused-note">Zgłoszono Twoją nieobecność w tym terminie.</p>}
        {confirmed === undefined && attendance && !excused && <p className="past-confirm-hint">Ta służba już się odbyła. Potwierdź swoją obecność:</p>}
        {confirmed === undefined && !attendance && !excused && <p className="past-confirm-hint">Ta służba już się odbyła. Nie byłeś zapisany? Możesz dopisać swoją obecność wstecz.</p>}
        {confirmed === undefined && attendance && !excused && <button className="button primary w-full" disabled={busy} onClick={() => onAction(mass, 'attended')}><Check size={16} />Byłem</button>}
        {confirmed === undefined && attendance && !excused && <button className="button secondary w-full" disabled={busy} onClick={() => onAction(mass, 'absent')}><X size={16} />Nie byłem</button>}
        {confirmed === undefined && !attendance && <button className="button primary w-full" disabled={busy} onClick={() => onAction(mass, 'attended')}><Check size={16} />Byłem</button>}
        {confirmed === true && <button className="button secondary w-full" disabled={busy} onClick={() => onAction(mass, 'absent')}><X size={16} />Zmień na nie byłem</button>}
        {confirmed === false && <button className="button secondary w-full" disabled={busy} onClick={() => onAction(mass, 'attended')}><Check size={16} />Byłem</button>}
        {excused && confirmed === undefined && <button type="button" className="button secondary w-full" disabled={busy} onClick={() => onAction(mass, 'restore')}><Undo2 size={16} />Cofnij zgłoszenie nieobecności</button>}
        {attendance && <button type="button" className="link-button" disabled={busy} onClick={() => onAction(mass, 'undeclare')}>{hasRule ? 'Zgłoś nieobecność w tym terminie' : 'Wypisz się z tego terminu'}</button>}
        {!attendance && !excused && confirmed === undefined && <button type="button" className="link-button" disabled={busy} onClick={() => onAction(mass, 'excuse')}>Zgłoś nieobecność wstecz</button>}
      </> : <>
        {excused && <p className="excused-note">Zgłoszono Twoją nieobecność w tym terminie.</p>}
        {excused ? <button className="button secondary w-full" disabled={busy} onClick={() => onAction(mass, 'restore')}><Undo2 size={16} />{hasRule ? 'Przywróć obecność w tym dniu' : 'Zadeklaruj się jednorazowo'}</button>
          : attendance ? <button className="button registered w-full" disabled={busy} onClick={() => onAction(mass, hasRule ? 'excuse' : 'withdraw')}>
            <UserMinus size={16} />{hasRule ? 'Zgłoś nieobecność w tym dniu' : 'Wypisz się'}
          </button> : <button className="button primary w-full" disabled={busy} onClick={() => onAction(mass, 'single')}>
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <CirclePlus size={16} />}Zadeklaruj się jednorazowo
          </button>}
        {!hasRule && (
          <button
            type="button"
            className="button secondary recurring-button w-full"
            disabled={busy}
            onClick={() => onAction(mass, 'recurring')}
          >
            <Repeat2 size={16} />{hasSlotRule ? 'Edytuj rytm mojego dyżuru' : 'Ustaw jako mój stały dyżur'}
          </button>
        )}
        {hasRule && <p className="recurring-note"><Repeat2 size={13} />Twój stały dyżur · {recurringLabel}</p>}
      </>}
    </div>
  </article>;
});
