import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { dateKey, monday, shiftDate, zonedIso } from '../src/lib/dates';
import type { ScheduleData } from '../src/types/database';

const repository = vi.hoisted(() => ({
  loadPendingConfirmations: vi.fn(),
  updateRule: vi.fn(), loadWeek: vi.fn(), setAttendance: vi.fn(), addRule: vi.fn(), removeAttendance: vi.fn(),
  addMass: vi.fn(), deleteMass: vi.fn(), deleteRule: vi.fn(), subscribe: vi.fn(),
}));
vi.mock('../src/lib/repository', () => repository);
vi.mock('../src/lib/supabase', () => ({ isDemo: false }));
import App from '../src/App';

const todayKey = dateKey();
const start = monday();
const next = shiftDate(start, 7);
function weekData(week: string): ScheduleData {
  const massDate = week === start ? todayKey : week;
  return {
    servers: [{ id: 'jan', name: 'Jan Kowalski', rank: 'Lektor' }],
    masses: [{ id: week, start_time: zonedIso(massDate, '18:00'), title: `Nabożeństwo ${week}`, suggested_spots: 4, is_extra: false }],
    rules: [], exceptions: [], attendees: [],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  // Freeze mid-morning: fixtures at 18:00 stay signable (presence confirmation opens an hour after start).
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(zonedIso(todayKey, '10:00')));
  repository.loadPendingConfirmations.mockResolvedValue({ masses: [], total: 0 });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  localStorage.setItem('liturgy.active-server', 'jan');
  repository.loadWeek.mockImplementation(async (week: string) => weekData(week));
  repository.subscribe.mockReturnValue(() => {});
});
afterEach(() => { cleanup(); localStorage.clear(); });

it('refreshes the currently selected week after a delayed signup completes', async () => {
  let finish!: () => void;
  repository.setAttendance.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  render(<App />);
  fireEvent.click(await screen.findByRole('heading', { name: `Nabożeństwo ${start}` }));
  fireEvent.click(await screen.findByRole('button', { name: 'Zadeklaruj się jednorazowo' }));
  fireEvent.click(screen.getByRole('button', { name: 'Następny tydzień' }));
  await screen.findByRole('heading', { name: `Nabożeństwo ${next}` });
  await act(async () => finish());
  await waitFor(() => expect(repository.loadWeek).toHaveBeenLastCalledWith(next));
  expect(screen.getByRole('heading', { name: `Nabożeństwo ${next}` })).toBeTruthy();
  expect(repository.setAttendance).toHaveBeenCalledWith(start, 'jan', 'single');
});

it('ignores an old week response that arrives after a newer response', async () => {
  let finish!: (data: ScheduleData) => void;
  repository.loadWeek.mockImplementation((week: string) => week === start
    ? new Promise<ScheduleData>(resolve => { finish = resolve; })
    : Promise.resolve(weekData(week)));
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Następny tydzień' }));
  await screen.findByRole('heading', { name: `Nabożeństwo ${next}` });
  await act(async () => finish(weekData(start)));
  expect(screen.getByRole('heading', { name: `Nabożeństwo ${next}` })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: `Nabożeństwo ${start}` })).toBeNull();
});

it('shows a failed write without a false success and allows retrying', async () => {
  repository.setAttendance.mockRejectedValueOnce(new Error('Brak połączenia z bazą.'));
  render(<App />);
  fireEvent.click(await screen.findByRole('heading', { name: `Nabożeństwo ${start}` }));
  fireEvent.click(await screen.findByRole('button', { name: 'Zadeklaruj się jednorazowo' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Brak połączenia z bazą.');
  expect(screen.queryByRole('status')).toBeNull();
  expect((screen.getByRole('button', { name: 'Zadeklaruj się jednorazowo' }) as HTMLButtonElement).disabled).toBe(false);
});


it('refreshes when the realtime subscription reports a change and disposes the subscription', async () => {
  let notify!: () => void;
  const dispose = vi.fn();
  repository.subscribe.mockImplementation((callback: () => void) => { notify = callback; return dispose; });
  const { unmount } = render(<App />);
  await screen.findByRole('heading', { name: `Nabożeństwo ${start}` });
  const updated = weekData(start);
  updated.masses[0].title = 'Zmienione nabożeństwo';
  repository.loadWeek.mockResolvedValue(updated);
  act(() => notify());
  expect(await screen.findByRole('heading', { name: 'Zmienione nabożeństwo' })).toBeTruthy();
  unmount();
  expect(dispose).toHaveBeenCalledOnce();
});


it('opens the personal rule editor and refreshes the schedule after saving', async () => {
  repository.loadWeek.mockImplementation(async (week: string) => ({ ...weekData(week), rules: [{ id: 'rule', server_id: 'jan', day_of_week: 0, time_slot: '18:00:00' }] }));
  repository.updateRule.mockResolvedValue(undefined);
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edytuj stały dyżur: Niedziela 18:00' }));
  fireEvent.change(screen.getByLabelText('Częstotliwość'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz dyżur' }));
  await waitFor(() => expect(repository.updateRule).toHaveBeenCalledWith(expect.objectContaining({ id: 'rule', interval_weeks: 2, start_date: dateKey() })));
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Edytuj stały dyżur' })).toBeNull());
  expect(repository.loadWeek.mock.calls.length).toBeGreaterThan(1);
});
