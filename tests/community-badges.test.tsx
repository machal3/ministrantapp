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

it('opens earned badges from ranking without switching the active person, then switches to an empty collection', () => {
  render(<CompetitionView {...props} data={fixture()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Zobacz odznaki: Jan Kowalski' }));
  const dialog = screen.getByRole('dialog', { name: 'Odznaki wspólnoty' });
  expect(within(dialog).getByRole('heading', { name: 'Pierwszy krok' })).toBeTruthy();
  expect(within(dialog).queryByRole('heading', { name: 'Pomocna dłoń' })).toBeNull();
  expect(within(dialog).queryByRole('progressbar')).toBeNull();
  expect(screen.getByText('Start przed Tobą')).toBeTruthy();
  fireEvent.change(within(dialog).getByRole('combobox', { name: 'Uczestnik' }), { target: { value: 'piotr' } });
  expect(within(dialog).getByText('Pierwsza odznaka jeszcze przed nami')).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Zamknij' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('keeps earned badges accessible after a points reset, even without an active identity', () => {
  const data = { ...fixture(), competitionState: { season: '2025-11-30', reset_at: '2026-09-17T00:00:00Z', reset_revision: 1, revision: 1 } };
  render(<CompetitionView {...props} activeId="" data={data} />);
  expect(screen.queryByRole('button', { name: 'Zobacz odznaki: Jan Kowalski' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Odznaki wspólnoty' }));
  expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Pierwszy krok' })).toBeTruthy();
});

it('updates the open collection and removes access when a participant opts out', () => {
  const data = fixture();
  const view = render(<CompetitionView {...props} data={data} />);
  fireEvent.click(screen.getByRole('button', { name: 'Odznaki wspólnoty' }));
  view.rerender(<CompetitionView {...props} data={{ ...data, confirmations: [] }} />);
  expect(within(screen.getByRole('dialog')).getByText('Pierwsza odznaka jeszcze przed nami')).toBeTruthy();
  view.rerender(<CompetitionView {...props} data={{ ...data, competitionParticipants: ['piotr'] }} />);
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).queryByRole('option', { name: 'Jan Kowalski' })).toBeNull();
  expect(within(dialog).queryByRole('heading', { name: 'Pierwszy krok' })).toBeNull();
  expect(within(dialog).getByRole('status')).toBeTruthy();
});
