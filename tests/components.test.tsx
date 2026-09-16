import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MassCard from '../src/components/MassCard';
import UserSelector from '../src/components/UserSelector';
import WeekNavigator from '../src/components/WeekNavigator';
import { dateKey, shiftDate, weekday, zonedIso } from '../src/lib/dates';
import type { AltarServer, EffectiveAttendee, Mass } from '../src/types/database';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});

afterEach(() => { cleanup(); localStorage.clear(); });
// Next Sunday 10:30 stays in the future on any run day; the rule test relies on Sunday + 10:30.
const sunday = shiftDate(dateKey(), (7 - weekday(dateKey())) % 7 || 7);
const mass: Mass = { id: 'm', title: 'Msza Święta', start_time: zonedIso(sunday, '10:30'), suggested_spots: 4, is_extra: false };
const pastMass: Mass = { ...mass, id: 'past', start_time: '2020-09-20T08:30:00Z' };
const attendees: EffectiveAttendee[] = Array.from({ length: 5 }, (_, i) => ({ mass_id: 'm', server_id: `${i}`, name: `Osoba ${i}`, rank: 'Lektor', attendance_type: 'single' }));

describe('MassCard', () => {
  it('keeps the signup enabled above capacity and shows every attendee and rank', () => {
    const onAction = vi.fn();
    render(<MassCard mass={mass} attendees={attendees} rules={[]} exceptions={[]} activeId="new" busy={false} onAction={onAction} onDelete={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Zadeklaruj się jednorazowo' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(screen.getByText('5/4 osoby (+1)')).toBeTruthy();
    expect(screen.getAllByText('Lektor')).toHaveLength(5);
    for (let i = 0; i < 5; i++) expect(screen.getByText(`Osoba ${i}`)).toBeTruthy();
    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledWith(mass, 'single');
  });
  it('offers an absence and restoration for recurring attendance, without deleting the rule', () => {
    const onAction = vi.fn();
    const props = { mass, attendees: [{ ...attendees[0], attendance_type: 'recurring' as const }], rules: [{ id: 'r', server_id: '0', day_of_week: 0, time_slot: '10:30:00' }], exceptions: [], activeId: '0', busy: false, onAction, onDelete: vi.fn() };
    const { rerender } = render(<MassCard {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Zgłoś nieobecność w tym dniu' }));
    expect(onAction).toHaveBeenLastCalledWith(mass, 'excuse');
    rerender(<MassCard {...props} attendees={[]} exceptions={[{ id: 'e', mass_id: 'm', server_id: '0', type: 'excused' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Przywróć obecność w tym dniu' }));
    expect(onAction).toHaveBeenLastCalledWith(mass, 'restore');
  });
  it('shows a single toggle button after the term passes', () => {
    const onAction = vi.fn();
    const declared = [{ ...attendees[0], server_id: 'jan', name: 'Jan Kowalski' }];
    render(<MassCard mass={pastMass} attendees={declared} rules={[]} exceptions={[]} activeId="jan" busy={false} onAction={onAction} onDelete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Zadeklaruj się jednorazowo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ustaw jako mój stały dyżur' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Zmień na nie byłem' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Byłem' }));
    expect(onAction).toHaveBeenCalledWith(pastMass, 'attended');
  });
  it('offers a single retroactive claim without a declaration and allows correcting an answer', () => {
    const onAction = vi.fn();
    const props = { mass: pastMass, attendees: [], rules: [], exceptions: [], activeId: 'jan', busy: false, onAction, onDelete: vi.fn() };
    const { rerender } = render(<MassCard {...props} />);
    expect(screen.queryByRole('button', { name: 'Zmień na nie byłem' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Byłem' }));
    expect(onAction).toHaveBeenCalledWith(pastMass, 'attended');
    rerender(<MassCard {...props} presence={new Map([['jan', true]])} />);
    expect(screen.getByText('Potwierdziłeś: byłeś na tej służbie.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Byłem' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Zmień na „Byłem”' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Zmień na nie byłem' }));
    expect(onAction).toHaveBeenCalledWith(pastMass, 'absent');
    rerender(<MassCard {...props} presence={new Map([['jan', false]])} />);
    expect(screen.queryByText('Zapisano: nie było Cię na tej służbie.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Zmień na nie byłem' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Byłem' }));
    expect(onAction).toHaveBeenCalledWith(pastMass, 'attended');
  });
  it('offers past declaration removal without touching presence', () => {
    const onAction = vi.fn();
    const declared = [{ ...attendees[0], server_id: 'jan', name: 'Jan Kowalski' }];
    const { rerender } = render(<MassCard mass={pastMass} attendees={declared} rules={[]} exceptions={[]} activeId="jan" busy={false} onAction={onAction} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Wypisz się z tego terminu' }));
    expect(onAction).toHaveBeenCalledWith(pastMass, 'undeclare');
    rerender(<MassCard mass={pastMass} attendees={[]} rules={[]} exceptions={[]} activeId="jan" busy={false} onAction={onAction} onDelete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Wypisz się z tego terminu' })).toBeNull();
    rerender(<MassCard mass={mass} attendees={declared} rules={[]} exceptions={[]} activeId="jan" busy={false} onAction={onAction} onDelete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Wypisz się z tego terminu' })).toBeNull();
  });
  it('marks presence on the roster without removing declarations', () => {
    const props = {
      mass: pastMass,
      attendees: [
        { mass_id: 'past', server_id: 'jan', name: 'Jan Kowalski', rank: 'Lektor' as const, attendance_type: 'single' as const },
        { mass_id: 'past', server_id: 'piotr', name: 'Piotr Nowak', rank: 'Ministrant' as const, attendance_type: 'single' as const },
      ],
      rules: [], exceptions: [], activeId: 'jan', busy: false, onAction: vi.fn(), onDelete: vi.fn(),
    };
    const { rerender, container } = render(<MassCard {...props} />);
    expect(container.querySelectorAll('.attendee-list > li')).toHaveLength(2);
    expect(screen.queryByText('Był')).toBeNull();
    expect(screen.queryByText('Nie był')).toBeNull();
    rerender(<MassCard {...props} presence={new Map([['jan', true], ['piotr', false]])} />);
    expect(container.querySelectorAll('.attendee-list > li')).toHaveLength(2);
    expect(screen.getByText('Był')).toBeTruthy();
    expect(screen.getByText('Nie był')).toBeTruthy();
  });
  it('distinguishes a confirmed presence from an unconfirmed declaration on past masses', () => {
    const props = {
      mass: pastMass,
      attendees: [
        { mass_id: 'past', server_id: 'jan', name: 'Jan Kowalski', rank: 'Lektor' as const, attendance_type: 'single' as const },
        { mass_id: 'past', server_id: 'piotr', name: 'Piotr Nowak', rank: 'Ministrant' as const, attendance_type: 'single' as const },
      ],
      rules: [], exceptions: [], activeId: 'jan', busy: false, onAction: vi.fn(), onDelete: vi.fn(),
    };
    const { rerender, container } = render(<MassCard {...props} presence={new Map()} />);
    expect(container.querySelectorAll('.presence-badge.is-pending')).toHaveLength(2);
    expect(screen.queryByText('Był')).toBeNull();
    rerender(<MassCard {...props} presence={new Map([['jan', true]])} />);
    expect(screen.getByText('Był')).toBeTruthy();
    expect(screen.getByText('Niepotwierdzona')).toBeTruthy();
    expect(container.querySelectorAll('.presence-badge.is-pending')).toHaveLength(1);
  });
  it('shows no presence badges before the term passes', () => {
    render(<MassCard mass={mass} attendees={[{ mass_id: 'm', server_id: 'jan', name: 'Jan Kowalski', rank: 'Lektor', attendance_type: 'single' }]} rules={[]} exceptions={[]} activeId="jan" busy={false} onAction={vi.fn()} onDelete={vi.fn()} presence={new Map([['jan', true]])} />);
    expect(screen.queryByText('Był')).toBeNull();
    expect(screen.queryByText('Nie był')).toBeNull();
  });
  it('offers only the Byłem correction for an excused past term', () => {
    const onAction = vi.fn();
    render(<MassCard mass={pastMass} attendees={[]} rules={[]} exceptions={[{ id: 'e', mass_id: 'past', server_id: 'jan', type: 'excused' }]} activeId="jan" busy={false} onAction={onAction} onDelete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Zmień na nie byłem' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Zadeklaruj się jednorazowo' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Byłem' }));
    expect(onAction).toHaveBeenCalledWith(pastMass, 'attended');
  });
  it('offers deletion for any Mass when administrator, but hides for standard users, and distinguishes Mass vs Devotion', () => {
    const props = { attendees: [], rules: [], exceptions: [], activeId: '', busy: false, onAction: vi.fn(), onDelete: vi.fn(), isAdmin: true };
    const { rerender } = render(<MassCard {...props} mass={mass} />);
    expect(screen.getByText('MSZA ŚW.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Usuń Mszę Świętą/ })).toBeTruthy();

    const devotion: Mass = { ...mass, is_extra: true, title: 'Droga Krzyżowa' };
    rerender(<MassCard {...props} mass={devotion} />);
    expect(screen.getByText('NABOŻEŃSTWO')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Usuń nabożeństwo/ })).toBeTruthy();

    rerender(<MassCard {...props} isAdmin={false} mass={mass} />);
    expect(screen.queryByRole('button', { name: /Usuń Mszę Świętą/ })).toBeNull();
  });

  it('sets capacity indicator class to empty (0), partial (50%), and filled (100%)', () => {
    const props = { mass: { ...mass, suggested_spots: 4 }, rules: [], exceptions: [], activeId: '', busy: false, onAction: vi.fn(), onDelete: vi.fn() };
    const { rerender, container } = render(<MassCard {...props} attendees={[]} />);
    const capacityBadge = container.querySelector('.capacity');
    expect(capacityBadge?.classList.contains('empty')).toBe(true);

    // 2 out of 4 (50%)
    rerender(<MassCard {...props} attendees={attendees.slice(0, 2)} />);
    expect(capacityBadge?.classList.contains('partial')).toBe(true);

    // 4 out of 4 (100%)
    rerender(<MassCard {...props} attendees={attendees.slice(0, 4)} />);
    expect(capacityBadge?.classList.contains('filled')).toBe(true);
  });

  it('renders celebrant and liturgy rank badge when provided', () => {
    const detailedMass: Mass = {
      ...mass,
      celebrant: 'ks. Jan Kowalski',
      liturgy_type: 'Uroczystość',
    };
    render(<MassCard mass={detailedMass} attendees={[]} rules={[]} exceptions={[]} activeId="" busy={false} onAction={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('ks. Jan Kowalski')).toBeTruthy();
    expect(screen.getByText('Uroczystość')).toBeTruthy();
  });
});

it('remembers identity in localStorage', () => {
  const onChange = vi.fn();
  render(<UserSelector servers={[{ id: 'jan', name: 'Jan Kowalski', rank: 'Lektor' }]} selectedId="" onChange={onChange} adminSession={null} onAdminToggle={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Jan Kowalski Lektor/ }));
  expect(onChange).toHaveBeenCalledWith('jan');
  expect(localStorage.getItem('liturgy.active-server')).toBe('jan');
});

it('navigates across a year boundary', () => {
  const onChange = vi.fn();
  render(<WeekNavigator week="2026-12-28" onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Następny tydzień' }));
  expect(onChange).toHaveBeenCalledWith('2027-01-04');
});

const people: AltarServer[] = [{ id: 'jan', name: 'Jan Kowalski', rank: 'Lektor' }, { id: 'lukasz', name: 'Łukasz Żółć', rank: 'Ministrant' }];
const selectorProps = { servers: people, selectedId: '', onChange: vi.fn(), adminSession: null, onAdminToggle: vi.fn() };

it('waits for the initial list, opens for an invalid identity and keeps guest dismissal across updates', () => {
  const onChange = vi.fn();
  const { rerender } = render(<UserSelector {...selectorProps} onChange={onChange} selectedId="removed" ready={false} servers={[]} />);
  expect(screen.queryByRole('dialog')).toBeNull();
  rerender(<UserSelector {...selectorProps} onChange={onChange} selectedId="removed" ready />);
  expect(screen.getByRole('dialog', { name: 'Wybierz ministranta' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Kontynuuj bez wyboru osoby' }));
  expect(onChange).toHaveBeenCalledWith('');
  expect(localStorage.getItem('liturgy.active-server')).toBe('');
  rerender(<UserSelector {...selectorProps} servers={[...people]} />);
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getAllByRole('button', { name: 'Wybierz ministranta' })[0]);
  expect(screen.getByRole('dialog')).toBeTruthy();
});

it('uses the same panel from both header buttons and filters Polish names without accents', () => {
  render(<UserSelector {...selectorProps} selectedId="jan" />);
  expect(screen.queryByRole('dialog')).toBeNull();
  const triggers = screen.getAllByRole('button', { name: /Zmień ministranta/ });
  for (const trigger of triggers) {
    fireEvent.click(trigger);
    expect(screen.getByRole('button', { name: /Jan Kowalski Lektor/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'lukasz zolc' } });
    expect(screen.queryByRole('button', { name: /Jan Kowalski Lektor/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Łukasz Żółć Ministrant/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij okno' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  }
});
