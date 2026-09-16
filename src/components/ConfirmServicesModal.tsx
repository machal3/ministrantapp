import { useEffect, useRef } from 'react';
import { CalendarDays, Check, Clock, HeartHandshake, LoaderCircle, RefreshCw, UserRound, X } from 'lucide-react';
import { dateKey, polishDate, timeSlot } from '../lib/dates';
import type { Mass } from '../types/database';
import Modal from './Modal';

interface Props { mass: Mass; name: string; remaining: number; completed: number; busy: boolean; error: string; onAnswer: (attended: boolean) => void; onRetry: () => void; onChangePerson: () => void; onClose: () => void }
export default function ConfirmServicesModal({ mass, name, remaining, completed, busy, error, onAnswer, onRetry, onChangePerson, onClose }: Props) {
  const focus = useRef<HTMLDivElement>(null);
  useEffect(() => { focus.current?.focus(); }, [mass.id]);
  return <Modal title="Potwierdź swoją obecność" onClose={onClose} dismissible={!busy} busy={busy} className="confirmation-queue-modal" initialFocusRef={focus}>
    <p className="confirmation-person"><UserRound size={16} />{name}</p>
    <div className="confirmation-queue-progress"><span>Służba {completed + 1} z {completed + remaining}</span><span>Pozostało: {remaining}</span></div>
    <progress max={completed + remaining} value={completed} aria-label="Postęp potwierdzania obecności" />
    <div className="confirmation-event" ref={focus} tabIndex={-1} aria-live="polite">
      <HeartHandshake size={26} strokeWidth={1.6} aria-hidden="true" />
      <h3>{mass.title}</h3>
      <p><CalendarDays size={16} />{polishDate(dateKey(mass.start_time), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      <strong>{timeSlot(mass.start_time).slice(0, 5)}</strong>
    </div>
    <p className="confirmation-question">Czy byłeś na tej służbie?</p>
    <p className="field-hint">Potwierdzone obecności z bieżącego sezonu liczą się do punktów, serii i odznak. Starsze zapisujemy w historii. Jeśli Cię nie było, zapiszemy nieobecność tylko dla tego terminu.</p>
    {error && <div className="error-banner" role="alert"><p>{error}</p><button className="button secondary" disabled={busy} onClick={onRetry}><RefreshCw size={16} />Odśwież listę</button></div>}
    <div className="confirmation-answer-buttons"><button className="button primary" disabled={busy} onClick={() => onAnswer(true)}>{busy ? <LoaderCircle className="animate-spin" size={18} /> : <Check size={18} />}Tak, byłem</button><button className="button secondary" disabled={busy} onClick={() => onAnswer(false)}><X size={18} />Nie byłem</button></div>
    <p className="confirmation-footnote">Służby pokazujemy po godzinie od rozpoczęcia. Zaległe odpowiedzi zapisujesz po kolei; nie musisz odpowiadać ponownie na innym urządzeniu.</p>
    <div className="confirmation-secondary-actions">
      <button type="button" className="button secondary confirmation-later" disabled={busy} onClick={onClose}><Clock size={16} />Przypomnij później</button>
      <button type="button" className="button secondary confirmation-change-person" disabled={busy} onClick={onChangePerson}><UserRound size={16} />To nie ja — zmień osobę</button>
    </div>
  </Modal>;
}
