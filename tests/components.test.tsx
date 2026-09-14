import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MassCard from '../src/components/MassCard';
import UserSelector from '../src/components/UserSelector';
import WeekNavigator from '../src/components/WeekNavigator';
import type { EffectiveAttendee, Mass } from '../src/types/database';

afterEach(() => { cleanup(); localStorage.clear(); });
const mass: Mass = { id: 'm', title: 'Msza Święta', start_time: '2026-09-20T08:30:00Z', suggested_spots: 4, is_extra: false };
const attendees: EffectiveAttendee[] = Array.from({ length: 5 }, (_, i) => ({ mass_id: 'm', server_id: `${i}`, name: `Osoba ${i}`, rank: 'Lektor', attendance_type: 'single' }));

describe('MassCard', () => {
  it('keeps the signup enabled above capacity and shows every attendee and rank', () => {
    const onAction = vi.fn();
    render(<MassCard mass={mass} attendees={attendees} rules={[]} exceptions={[]} activeId="new" busy={false} onAction={onAction} onDelete={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Zapisz się jednorazowo' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(screen.getByText('5/4 (+1 dodatkowy)')).toBeTruthy();
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
  it('offers deletion only for an extra Mass', () => {
    const props = { attendees: [], rules: [], exceptions: [], activeId: '', busy: false, onAction: vi.fn(), onDelete: vi.fn(), isAdmin: true };
    const { rerender } = render(<MassCard {...props} mass={mass} />);
    expect(screen.queryByRole('button', { name: /Usuń nabożeństwo/ })).toBeNull();
    rerender(<MassCard {...props} mass={{ ...mass, is_extra: true }} />);
    expect(screen.getByRole('button', { name: /Usuń nabożeństwo/ })).toBeTruthy();
    rerender(<MassCard {...props} isAdmin={false} mass={{ ...mass, is_extra: true }} />);
    expect(screen.queryByRole('button', { name: /Usuń nabożeństwo/ })).toBeNull();
  });
});

it('remembers identity in localStorage', () => {
  const onChange = vi.fn();
  render(<UserSelector servers={[{ id: 'jan', name: 'Jan Kowalski', rank: 'Lektor' }]} selectedId="" onChange={onChange} />);
  fireEvent.change(screen.getByLabelText('Służę jako'), { target: { value: 'jan' } });
  expect(onChange).toHaveBeenCalledWith('jan');
  expect(localStorage.getItem('liturgy.active-server')).toBe('jan');
});

it('navigates across a year boundary', () => {
  const onChange = vi.fn();
  render(<WeekNavigator week="2026-12-28" onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Następny tydzień' }));
  expect(onChange).toHaveBeenCalledWith('2027-01-04');
});
