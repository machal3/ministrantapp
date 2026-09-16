import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { competitionSeason } from '../src/lib/competition';
import { dateKey, shiftDate, zonedIso } from '../src/lib/dates';
import type { ScheduleData } from '../src/types/database';

const repository = vi.hoisted(() => ({ loadWeek: vi.fn(), loadUpcomingServices: vi.fn(), loadCompetition: vi.fn(), subscribe: vi.fn() }));
vi.mock('../src/lib/repository', () => ({ ...repository, loadPendingConfirmations: vi.fn(async () => ({ masses: [], total: 0 })) }));
vi.mock('../src/lib/supabase', () => ({ isDemo: false }));
import App from '../src/App';

function fixture(): ScheduleData {
  const day = shiftDate(dateKey(), -1);
  return {
    servers: [{ id: 'jan', name: 'Jan Kowalski', rank: 'Lektor' }, { id: 'piotr', name: 'Piotr Nowak', rank: 'Ministrant' }],
    masses: [{ id: 'm', title: 'Msza poranna', start_time: zonedIso(day, '07:00'), is_extra: false, category: 'mass', suggested_spots: 4 }],
    rules: [], exceptions: [], attendees: [{ mass_id: 'm', server_id: 'jan', name: 'Jan Kowalski', rank: 'Lektor', attendance_type: 'single' }], confirmations: [{ mass_id: 'm', server_id: 'jan', attended: true, confirmed_at: new Date().toISOString() }],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  localStorage.setItem('liturgy.active-server', 'jan');
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  repository.loadWeek.mockResolvedValue(fixture());
  repository.loadCompetition.mockResolvedValue(fixture());
  repository.loadUpcomingServices.mockResolvedValue(fixture());
  repository.subscribe.mockReturnValue(() => {});
});
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

async function openCompetition() {
  render(<App />);
  await screen.findByRole('button', { name: /Wybrano: Jan/ });
  expect(repository.loadCompetition).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Rywalizacja' }));
}

it('loads one bounded season only on opening, while keeping both existing views functional', async () => {
  await openCompetition();
  await screen.findByRole('heading', { name: 'Twoje odznaki' });
  expect(repository.loadCompetition).toHaveBeenCalledTimes(1);
  const [from, to] = repository.loadCompetition.mock.calls[0];
  expect(from).toBe(zonedIso(competitionSeason(new Date()).start, '00:00'));
  expect(Math.abs(Date.parse(to) - Date.now())).toBeLessThan(5000);
  const history = screen.getByRole('region', { name: 'Historia punktów' });
  expect(within(history).getByText('Msza poranna')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Zaplanuj kolejną służbę' }));
  expect(await screen.findByRole('region', { name: 'Grafik tygodniowy' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Moje służby' }));
  expect(await screen.findByText('Nie masz obecnie żadnych zaplanowanych służb.')).toBeTruthy();
  expect(repository.subscribe).toHaveBeenCalledTimes(1);
});

it('switches personal progress with the existing user selector without reloading the season', async () => {
  await openCompetition();
  await screen.findByText('Jan Kowalski, każda służba ma znaczenie.');
  fireEvent.click(screen.getByRole('button', { name: /Wybrano: Jan/ }));
  fireEvent.click(screen.getByRole('button', { name: /Piotr Nowak Ministrant/ }));
  expect(await screen.findByText('Piotr Nowak, każda służba ma znaczenie.')).toBeTruthy();
  expect(screen.getByText('Start przed Tobą')).toBeTruthy();
  expect(repository.loadCompetition).toHaveBeenCalledTimes(1);
});

it('shows a retryable error without claiming an empty ranking and retains stale results on refresh failure', async () => {
  repository.loadCompetition.mockRejectedValueOnce(new Error('Brak sieci'));
  await openCompetition();
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Brak sieci'));
  expect(screen.queryByRole('heading', { name: 'Ranking wspólnoty' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Ponów' }));
  await screen.findByRole('heading', { name: 'Ranking wspólnoty' });
  repository.loadCompetition.mockRejectedValue(new Error('Offline'));
  act(() => repository.subscribe.mock.calls[0][0]());
  expect(await screen.findByText('Wyświetlane wyniki mogą być nieaktualne.')).toBeTruthy();
  expect(screen.getByText('Jan Kowalski, każda służba ma znaczenie.')).toBeTruthy();
});

it('refreshes points and badges after an absence using the existing realtime subscription', async () => {
  await openCompetition();
  await screen.findByRole('heading', { name: 'Historia punktów' });
  expect(screen.getByText('Zdobyta')).toBeTruthy();
  repository.loadCompetition.mockResolvedValue({ ...fixture(), attendees: [], confirmations: [] });
  act(() => repository.subscribe.mock.calls[0][0]());
  await waitFor(() => expect(screen.queryByText('Zdobyta')).toBeNull());
  expect(screen.getByText('Start przed Tobą')).toBeTruthy();
});

it('displays community ranking without selecting a person and without another selector', async () => {
  localStorage.clear();
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Rywalizacja' }));
  await screen.findByRole('heading', { name: 'Odkryj swój postęp' });
  expect(screen.getByRole('heading', { name: 'Ranking wspólnoty' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Twoje odznaki' })).toBeNull();
});

it('ignores a stale season request after leaving and reopening the panel', async () => {
  let finish!: (data: ScheduleData) => void;
  repository.loadCompetition.mockImplementationOnce(() => new Promise<ScheduleData>(resolve => { finish = resolve; }));
  await openCompetition();
  fireEvent.click(screen.getByRole('button', { name: 'Grafik' }));
  repository.loadCompetition.mockResolvedValue({ ...fixture(), attendees: [], confirmations: [] });
  fireEvent.click(screen.getByRole('button', { name: 'Rywalizacja' }));
  await screen.findByText('Start przed Tobą');
  await act(async () => finish(fixture()));
  expect(screen.getByText('Start przed Tobą')).toBeTruthy();
  expect(screen.queryByText('Zdobyta')).toBeNull();
});
