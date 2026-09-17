import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CompetitionView from '../src/components/CompetitionView';
import type { ScheduleData } from '../src/types/database';

const now = new Date('2026-09-17T12:00:00Z');
function fixture(): ScheduleData {
  return {
    servers: [{ id: 'jan', name: 'Jan Kowalski', rank: 'Lektor' }, { id: 'piotr', name: 'Piotr Nowak', rank: 'Ministrant' }],
    masses: [{ id: 'm', title: 'Msza', start_time: '2026-09-16T10:00:00Z', is_extra: false, suggested_spots: 4 }],
    rules: [], exceptions: [], attendees: [{ mass_id: 'm', server_id: 'jan', name: 'Jan Kowalski', rank: 'Lektor', attendance_type: 'single' }],
    confirmations: [{ mass_id: 'm', server_id: 'jan', attended: true, confirmed_at: '2026-09-16T11:00:00Z' }],
  };
}
const props = { activeId: 'piotr', now, loading: false, error: '', offline: false, onRetry: vi.fn() };
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

it('keeps the larger collection compact and filters earned and pending badges', () => {
  render(<CompetitionView {...props} activeId="jan" data={fixture()} />);
  const collection = within(screen.getByRole('region', { name: 'Twoje odznaki' }));
  expect(collection.getAllByRole('listitem')).toHaveLength(6);
  fireEvent.click(collection.getByRole('button', { name: 'Pokaż wszystkie odznaki (25)' }));
  expect(collection.getAllByRole('listitem')).toHaveLength(25);
  expect(collection.getByRole('heading', { name: 'Chwila przed Panem' })).toBeTruthy();
  fireEvent.click(collection.getByRole('button', { name: 'Zdobyte' }));
  expect(collection.getAllByRole('listitem')).toHaveLength(1);
  expect(collection.getByRole('heading', { name: 'Pierwszy krok' })).toBeTruthy();
  fireEvent.click(collection.getByRole('button', { name: 'W drodze' }));
  expect(collection.queryByRole('heading', { name: 'Pierwszy krok' })).toBeNull();
  expect(collection.getAllByRole('listitem')).toHaveLength(6);
});

it('requires closing the panel and clicking another ranking icon to inspect another person', () => {
  const data = fixture();
  data.attendees.push({ mass_id: 'm', server_id: 'piotr', name: 'Piotr Nowak', rank: 'Ministrant', attendance_type: 'single' });
  data.confirmations!.push({ mass_id: 'm', server_id: 'piotr', attended: true, confirmed_at: '2026-09-16T11:00:00Z' });
  render(<CompetitionView {...props} data={data} />);
  fireEvent.click(screen.getByRole('button', { name: 'Zobacz odznaki: Jan Kowalski' }));
  const dialog = screen.getByRole('dialog', { name: 'Zdobyte odznaki' });
  expect(within(dialog).getByRole('heading', { name: 'Jan Kowalski' })).toBeTruthy();
  expect(within(dialog).getByRole('heading', { name: 'Pierwszy krok' })).toBeTruthy();
  expect(within(dialog).queryByRole('heading', { name: 'Pomocna dłoń' })).toBeNull();
  expect(within(dialog).queryByRole('progressbar')).toBeNull();
  expect(within(dialog).queryByRole('combobox')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Odznaki wspólnoty' })).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Zamknij' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Zobacz odznaki: Piotr Nowak' }));
  expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Piotr Nowak' })).toBeTruthy();
  expect(within(screen.getByRole('dialog')).queryByRole('heading', { name: 'Jan Kowalski' })).toBeNull();
});

it('retains earned badges in the open panel after a points reset, even without an active identity', () => {
  const view = render(<CompetitionView {...props} activeId="" data={fixture()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Zobacz odznaki: Jan Kowalski' }));
  const data = { ...fixture(), competitionState: { season: '2025-11-30', reset_at: '2026-09-17T00:00:00Z', reset_revision: 1, revision: 1 } };
  view.rerender(<CompetitionView {...props} activeId="" data={data} />);
  expect(screen.queryByRole('button', { name: 'Zobacz odznaki: Jan Kowalski' })).toBeNull();
  expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Pierwszy krok' })).toBeTruthy();
});

it('updates the open collection and removes access when a participant opts out', () => {
  const data = fixture();
  const view = render(<CompetitionView {...props} data={data} />);
  fireEvent.click(screen.getByRole('button', { name: 'Zobacz odznaki: Jan Kowalski' }));
  view.rerender(<CompetitionView {...props} data={{ ...data, confirmations: [] }} />);
  expect(within(screen.getByRole('dialog')).getByText('Pierwsza odznaka jeszcze przed nami')).toBeTruthy();
  view.rerender(<CompetitionView {...props} data={{ ...data, competitionParticipants: ['piotr'] }} />);
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).queryByRole('option', { name: 'Jan Kowalski' })).toBeNull();
  expect(within(dialog).queryByRole('heading', { name: 'Pierwszy krok' })).toBeNull();
  expect(within(dialog).getByRole('status')).toBeTruthy();
});
