import { ArrowRight, Repeat2, Undo2, UserMinus, UserRound, Users } from 'lucide-react';
import { dateKey, polishDate, shiftDate, timeSlot } from '../lib/dates';
import { eventCategory } from '../lib/eventCategory';
import { peopleWord } from '../lib/people';
import type { PersonalService } from '../lib/myServices';
import type { Mass } from '../types/database';
import type { MassAction } from './MassCard';

interface Props {
  service: PersonalService;
  activeId: string;
  featured?: boolean;
  now: Date;
  busy: boolean;
  onAction: (mass: Mass, action: MassAction) => void;
  onOpenDay: (day: string) => void;
}

export default function ServiceCard({ service, activeId, featured, now, busy, onAction, onOpenDay }: Props) {
  const { mass, attendees, hasRule, excused, action } = service;
  const companions = attendees.filter(person => person.server_id !== activeId);
  const day = dateKey(mass.start_time);
  const category = eventCategory(mass);
  const categoryLabel = category === 'other' ? 'Inne wydarzenie' : category === 'devotion' ? 'Nabożeństwo' : 'Msza Święta';
  const relative = day === dateKey(now) ? 'Dzisiaj' : day === shiftDate(dateKey(now), 1) ? 'Jutro' : '';
  return <article className={`mass-card service-card ${category === 'other' ? 'other-card' : category === 'devotion' ? 'devotion-card' : 'eucharist-card'} ${featured ? 'next-service my-mass' : ''} ${excused ? 'service-excused' : ''}`} aria-label={`${mass.title}, ${day}, ${timeSlot(mass.start_time).slice(0, 5)}`} aria-busy={busy}>
    {featured && <h2>Najbliższa służba</h2>}
    <div className="service-date mass-heading">
      <div className="mass-time"><time className="mass-time-digits" dateTime={mass.start_time}>{timeSlot(mass.start_time).slice(0, 5)}</time><span className="mass-type-label">{categoryLabel}</span></div>
      <div className="service-calendar mass-meta">
        <h3>{mass.title}</h3>
        <div className="service-calendar-date"><strong>{polishDate(day, { weekday: 'long' })}</strong><span>{polishDate(day, { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
        {relative && <span className="today-badge">{relative}</span>}
      </div>
      {!featured && <button className="icon-button service-open-day" aria-label="Zobacz dzień w grafiku" title="Zobacz dzień w grafiku" onClick={() => onOpenDay(day)}><ArrowRight size={18} /></button>}
    </div>
    <div className="service-main">
      <div className="service-description">
        {mass.celebrant && <p><UserRound size={15} aria-hidden="true" />{mass.celebrant}</p>}
        {mass.liturgy_type && <p>{mass.liturgy_type}</p>}
        <p><Users size={15} aria-hidden="true" />{attendees.length}{mass.suggested_spots !== null && ` / ${mass.suggested_spots}`} {peopleWord(mass.suggested_spots ?? attendees.length)}</p>
      </div>
    </div>
    <div className="service-companions">
      <h4><Users size={14} aria-hidden="true" />{excused ? 'Zadeklarowani na ten termin' : 'Służą z Tobą'}</h4>
      {companions.length ? <ul className="attendee-list" aria-label={excused ? 'Zadeklarowani na ten termin' : 'Służą z Tobą'}>{companions.map(person => <li key={person.server_id}><span className="avatar" aria-hidden="true">{person.name.split(' ').map(part => part[0]).slice(0, 2).join('')}</span><div className="attendee-person"><span>{person.name}</span><span>{person.rank}</span></div></li>)}</ul>
        : <p>{excused ? 'Nikt jeszcze nie jest zapisany.' : 'Na razie tylko Ty jesteś zapisany.'}</p>}
    </div>
    <div className="service-status">{hasRule && <Repeat2 size={14} aria-hidden="true" />}{hasRule ? 'Twój stały dyżur' : 'Jednorazowy zapis'}{excused && <strong>Zgłoszono nieobecność</strong>}</div>
    <div className="service-actions"><button className="button registered" disabled={busy} onClick={() => onAction(mass, action)}>
      {excused ? <Undo2 size={16} /> : <UserMinus size={16} />}{excused ? 'Przywróć obecność' : hasRule ? 'Zgłoś nieobecność w tym dniu' : 'Wypisz się'}
    </button>{featured && <button className="button secondary" onClick={() => onOpenDay(day)}>Zobacz dzień w grafiku<ArrowRight size={16} /></button>}</div>
  </article>;
}
