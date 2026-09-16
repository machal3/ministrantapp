import { CircleHelp, Pencil, Repeat2, X } from 'lucide-react';
import { DAY_NAMES } from '../lib/dates';
import { describeRule } from '../lib/recurrence';
import type { RecurringRule } from '../types/database';

interface Props {
  rules: RecurringRule[];
  activeId: string;
  busy: boolean;
  onEdit: (rule: RecurringRule) => void;
  onDelete: (rule: RecurringRule) => void;
}

export default function MyRecurringRules({ rules, activeId, busy, onEdit, onDelete }: Props) {
  const ownRules = rules.filter(rule => rule.server_id === activeId).sort((a, b) =>
    ((a.day_of_week + 6) % 7) - ((b.day_of_week + 6) % 7) || a.time_slot.localeCompare(b.time_slot));
  return <section className="sidebar-panel rules-panel"><h2><Repeat2 size={18} />Moje stałe dyżury<span>{ownRules.length}</span></h2>
    {ownRules.length ? <ul>{ownRules.map(rule => <li key={rule.id}>
      <span className="rule-marker"><Repeat2 size={15} /></span>
      <div><strong>{DAY_NAMES[rule.day_of_week]}</strong><span>{describeRule(rule)} · {rule.time_slot.slice(0, 5)}</span></div>
      <button className="icon-button rule-edit" disabled={busy} aria-label={`Edytuj stały dyżur: ${DAY_NAMES[rule.day_of_week]} ${rule.time_slot.slice(0, 5)}`} onClick={() => onEdit(rule)}><Pencil size={15} /></button>
      <button className="icon-button" disabled={busy} aria-label={`Usuń stały dyżur: ${DAY_NAMES[rule.day_of_week]} ${rule.time_slot.slice(0, 5)}`} onClick={() => onDelete(rule)}><X size={16} /></button>
    </li>)}</ul> : <p className="sidebar-empty">{activeId ? 'Nie masz jeszcze stałego dyżuru. Stały dyżur możesz ustawić przy wybranej Mszy w grafiku.' : 'Tutaj pojawią się Twoje stałe dyżury po wybraniu imienia.'}</p>}
    <div className="rules-tip"><CircleHelp size={15} /><p>Nie możesz przyjść? Zgłoś nieobecność przy danej Mszy. Pozostałe dyżury zostaną bez zmian.</p></div>
  </section>;
}
