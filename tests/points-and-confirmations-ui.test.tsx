import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { competitionSeason } from '../src/lib/competition';
import { dateKey, shiftDate, zonedIso } from '../src/lib/dates';
import type { Mass, ScheduleData } from '../src/types/database';

const api = vi.hoisted(() => ({ loadWeek: vi.fn(), loadCompetition: vi.fn(), loadUpcomingServices: vi.fn(), subscribe: vi.fn(), loadPendingConfirmations: vi.fn(), confirmService: vi.fn(), removeAttendance: vi.fn(), adjustPoints: vi.fn(), resetPoints: vi.fn(), loginAdmin: vi.fn(), joinCompetition: vi.fn(), leaveCompetition: vi.fn() }));
vi.mock('../src/lib/repository', () => api);
vi.mock('../src/lib/admin', () => ({ loginAdmin: api.loginAdmin }));
vi.mock('../src/lib/supabase', () => ({ isDemo: false }));
import App from '../src/App';

let data: ScheduleData;
let pending: Mass[];
const session = { token: 'admin-token', expires_at: new Date(Date.now() + 1800000).toISOString() };

beforeEach(() => {
  vi.resetAllMocks();
  // Freeze midday: the fixture masses stay in the past and a 07:00 mass lands on the selected day.
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(zonedIso(dateKey(), '12:00')));
  session.expires_at = new Date(Date.now() + 1800000).toISOString();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  localStorage.setItem('liturgy.active-server', 'jan');
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  data = {
    servers: [{ id: 'jan', name: 'Jan Testowy', rank: 'Lektor' }, { id: 'piotr', name: 'Piotr Testowy', rank: 'Ministrant' }],
    masses: ['Pierwsza Msza', 'Druga Msza'].map((title, index) => ({ id: `m${index}`, title, start_time: zonedIso(shiftDate(dateKey(), -2 + index), '07:00'), is_extra: false, suggested_spots: 4 })),
    rules: [], exceptions: [], attendees: [], confirmations: [],
    competitionState: { season: competitionSeason(new Date()).start, revision: 0, reset_revision: 0, reset_at: null },
    competitionParticipants: ['jan'],
  };
  pending = [];
  api.loadWeek.mockResolvedValue(data);
  api.loadUpcomingServices.mockResolvedValue(data);
  api.loadCompetition.mockResolvedValue(data);
  api.loadPendingConfirmations.mockImplementation(async (id: string) => ({ masses: id === 'jan' ? [...pending] : [], total: id === 'jan' ? pending.length : 0 }));
  api.confirmService.mockImplementation(async (id: string) => { pending = pending.filter(m => m.id !== id); });
  api.subscribe.mockReturnValue(() => {});
  api.loginAdmin.mockResolvedValue(session);
});
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

it('allows closing the confirmation modal to postpone it, and finishes after saving each answer', async () => {
  pending = [...data.masses];
  const { unmount } = render(<App />);
  let dialog = await screen.findByRole('dialog', { name: 'Potwierdź swoją obecność' });
  expect(within(dialog).getByText('Służba 1 z 2')).toBeTruthy();
  expect(within(dialog).getByRole('button', { name: 'Zamknij okno' })).toBeTruthy();
  expect(within(dialog).getByRole('button', { name: 'Przypomnij później' })).toBeTruthy();

  // Closing via "Przypomnij później" dismisses the modal for the current session without answering
  fireEvent.click(within(dialog).getByRole('button', { name: 'Przypomnij później' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Potwierdź swoją obecność' })).toBeNull());
  expect(api.confirmService).not.toHaveBeenCalled();

  // Next opening of the application: dialog pops up again with the pending confirmations
  unmount();
  render(<App />);
  dialog = await screen.findByRole('dialog', { name: 'Potwierdź swoją obecność' });
  expect(within(dialog).getByText('Służba 1 z 2')).toBeTruthy();

  // Answering sequentially
  fireEvent.click(within(dialog).getByRole('button', { name: 'Tak, byłem' }));
  await waitFor(() => expect(within(dialog).getByRole('heading', { name: 'Druga Msza' })).toBeTruthy());
  expect(within(dialog).getByText('Służba 2 z 2')).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Nie byłem' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Potwierdź swoją obecność' })).toBeNull());
  expect(api.confirmService.mock.calls).toEqual([['m0', 'jan', true], ['m1', 'jan', false]]);
});

it('allows closing via the header X close button and via cancel event', async () => {
  pending = [...data.masses];
  const { unmount } = render(<App />);
  let dialog = await screen.findByRole('dialog', { name: 'Potwierdź swoją obecność' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Zamknij okno' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Potwierdź swoją obecność' })).toBeNull());
  expect(api.confirmService).not.toHaveBeenCalled();

  unmount();
  render(<App />);
  dialog = await screen.findByRole('dialog', { name: 'Potwierdź swoją obecność' });
  fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Potwierdź swoją obecność' })).toBeNull());
});

it('keeps the current question on write failure and never submits it twice while busy', async () => {
  pending = [...data.masses];
  let fail!: (cause: Error) => void;
  api.confirmService.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; }));
  render(<App />);
  const yes = await screen.findByRole('button', { name: 'Tak, byłem' });
  fireEvent.click(yes); fireEvent.click(yes);
  expect(api.confirmService).toHaveBeenCalledTimes(1);
  await act(async () => fail(new Error('Brak połączenia')));
  const dialog = screen.getByRole('dialog', { name: 'Potwierdź swoją obecność' });
  expect(within(dialog).getByRole('alert').textContent).toContain('Brak połączenia');
  expect(within(dialog).getByRole('heading', { name: 'Pierwsza Msza' })).toBeTruthy();
  expect(within(dialog).getByText('Służba 1 z 2')).toBeTruthy();
});

it('allows switching a mistaken identity without answering on their behalf', async () => {
  pending = [...data.masses];
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'To nie ja — zmień osobę' }));
  expect(localStorage.getItem('liturgy.active-server')).toBeNull();
  fireEvent.click(await screen.findByRole('button', { name: /Piotr Testowy Ministrant/ }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Potwierdź swoją obecność' })).toBeNull());
  expect(api.confirmService).not.toHaveBeenCalled();
});

it('reports a pending-load failure and can retry without replacing the schedule', async () => {
  api.loadPendingConfirmations.mockRejectedValueOnce(new Error('Nie można pobrać kolejki'));
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Nie można pobrać kolejki'));
  expect(screen.getByRole('region', { name: 'Grafik tygodniowy' })).toBeTruthy();
  pending = [data.masses[0]];
  fireEvent.click(screen.getByRole('button', { name: 'Ponów sprawdzanie' }));
  expect(await screen.findByRole('dialog', { name: 'Potwierdź swoją obecność' })).toBeTruthy();
});

async function openPoints() {
  render(<App />);
  await screen.findByRole('button', { name: /Wybrano: Jan/ });
  expect(screen.queryByRole('button', { name: 'Zarządzaj punktacją' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Ustawienia i opcje' }));
  fireEvent.click(screen.getByRole('button', { name: 'Administrator' }));
  fireEvent.change(screen.getByLabelText('PIN administratora'), { target: { value: '0403' } });
  fireEvent.click(screen.getByRole('button', { name: 'Odblokuj' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Zarządzaj punktacją' }));
  await screen.findByRole('option', { name: 'Jan Testowy' });
  fireEvent.change(screen.getByLabelText('Ministrant'), { target: { value: 'jan' } });
}

it('confirms a past service from the schedule card instead of signing up', async () => {
  const todayMass = { id: 'm0', title: 'Poranna Msza', start_time: zonedIso(dateKey(), '07:00'), is_extra: false, suggested_spots: 4 };
  data.masses = [todayMass];
  data.attendees = [{ mass_id: 'm0', server_id: 'jan', name: 'Jan Testowy', rank: 'Lektor', attendance_type: 'single' }];
  pending = [todayMass];
  render(<App />);
  const card = await screen.findByRole('article', { name: /Poranna Msza/ });
  expect(within(card).queryByRole('button', { name: 'Zadeklaruj się jednorazowo' })).toBeNull();
  expect(within(card).queryByRole('button', { name: 'Ustaw jako mój stały dyżur' })).toBeNull();
  expect(within(card).queryByRole('button', { name: 'Zmień na nie byłem' })).toBeNull();
  fireEvent.click(within(card).getByRole('button', { name: 'Byłem' }));
  await waitFor(() => expect(api.confirmService).toHaveBeenCalledWith('m0', 'jan', true));
  expect(await screen.findByText('Zapisano Twoją obecność.')).toBeTruthy();
});

it('immediately lists an undeclared attendee separately and keeps them there after saving', async () => {
  data.masses = [{ id: 'm0', title: 'Poranna Msza', start_time: zonedIso(dateKey(), '07:00'), is_extra: false, suggested_spots: 4 }];
  let finishSave!: () => void;
  api.confirmService.mockImplementationOnce(() => new Promise<void>(resolve => {
    finishSave = () => {
      data.confirmations = [{ mass_id: 'm0', server_id: 'jan', attended: true, confirmed_at: new Date().toISOString() }];
      resolve();
    };
  }));
  const { unmount } = render(<App />);
  const card = await screen.findByRole('article', { name: /Poranna Msza/ });
  fireEvent.click(within(card).getByRole('button', { name: 'Byłem' }));

  const expectUndeclaredPresence = (element: HTMLElement) => {
    const section = within(element).getByText('Obecni bez deklaracji').closest('.attendance-section') as HTMLElement;
    expect(within(section).getByText('Jan Testowy')).toBeTruthy();
    expect(within(section).getByText('Był')).toBeTruthy();
    expect(within(element).getByText('Zadeklarowani').closest('.attendance-section')?.querySelector('.attendee-list')).toBeNull();
    expect(within(element).queryByText('Jednorazowy')).toBeNull();
    expect(element.querySelector('.capacity')?.textContent).toMatch(/^0\//);
  };
  // The roster updates before the request completes, without creating a declaration.
  expectUndeclaredPresence(card);
  expect(api.confirmService).toHaveBeenCalledWith('m0', 'jan', true);
  await act(async () => finishSave());
  expectUndeclaredPresence(card);

  unmount();
  render(<App />);
  const restoredCard = await screen.findByRole('article', { name: /Poranna Msza/ });
  expectUndeclaredPresence(restoredCard);
  fireEvent.click(within(restoredCard).getByRole('button', { name: 'Zmień na nie byłem' }));
  expect(within(restoredCard).queryByText('Obecni bez deklaracji')).toBeNull();
  await waitFor(() => expect(api.confirmService).toHaveBeenLastCalledWith('m0', 'jan', false));
});

it('does not allow removing a past declaration from the schedule card', async () => {
  const todayMass = { id: 'm0', title: 'Poranna Msza', start_time: zonedIso(dateKey(), '07:00'), is_extra: false, suggested_spots: 4 };
  data.masses = [todayMass];
  data.attendees = [{ mass_id: 'm0', server_id: 'jan', name: 'Jan Testowy', rank: 'Lektor', attendance_type: 'single' }];
  pending = [];
  render(<App />);
  const card = await screen.findByRole('article', { name: /Poranna Msza/ });
  expect(within(card).queryByRole('button', { name: 'Wypisz się z tego terminu' })).toBeNull();
  expect(within(card).queryByRole('button', { name: 'Zgłoś nieobecność w tym terminie' })).toBeNull();
});

it('opens the protected points editor beside existing admin controls and sets a specific value', async () => {
  await openPoints();
  expect(screen.getAllByRole('button', { name: 'Dodaj Mszę / wydarzenie' }).length).toBeGreaterThan(0);
  fireEvent.change(screen.getByLabelText('Rodzaj zmiany'), { target: { value: 'set' } });
  fireEvent.change(screen.getByLabelText('Nowy wynik'), { target: { value: '125' } });
  fireEvent.change(screen.getByLabelText(/Powód zmiany/), { target: { value: 'Pomoc przy liturgii' } });
  expect(screen.getByText('Po zapisaniu: 0 → 125 pkt')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz punktację' }));
  await waitFor(() => expect(api.adjustPoints).toHaveBeenCalledWith({ serverId: 'jan', mode: 'set', value: 125, reason: 'Pomoc przy liturgii' }, data, session));
});

it('blocks a negative result, handles save errors and requires typed confirmation for reset', async () => {
  await openPoints();
  fireEvent.change(screen.getByLabelText('Rodzaj zmiany'), { target: { value: 'subtract' } });
  fireEvent.change(screen.getByLabelText('Liczba punktów'), { target: { value: '5' } });
  expect(screen.getByRole('button', { name: 'Zapisz punktację' })).toHaveProperty('disabled', true);
  fireEvent.change(screen.getByLabelText('Rodzaj zmiany'), { target: { value: 'add' } });
  api.adjustPoints.mockRejectedValueOnce(new Error('Wyniki zmieniły się'));
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz punktację' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Wyniki zmieniły się'));
  fireEvent.click(screen.getByRole('button', { name: 'Resetuj punktację wszystkich' }));
  const reset = screen.getByRole('button', { name: 'Wyzeruj wszystkim punkty' });
  expect(reset).toHaveProperty('disabled', true);
  expect(api.resetPoints).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Aby potwierdzić reset całej wspólnoty, wpisz RESET'), { target: { value: 'RESET' } });
  fireEvent.click(reset);
  await waitFor(() => expect(api.resetPoints).toHaveBeenCalledWith(data, session));
});

it('does not display the confirmation popup when opted out even if past masses are pending', async () => {
  data.competitionParticipants = [];
  pending = [...data.masses];
  render(<App />);
  await screen.findByRole('region', { name: 'Grafik tygodniowy' });
  expect(screen.queryByRole('dialog', { name: 'Potwierdź swoją obecność' })).toBeNull();
});

it('allows joining the competition from the competition view and calls joinCompetition', async () => {
  data.competitionParticipants = [];
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /Rywalizacja/ }));
  expect(await screen.findByText('Nie bierzesz udziału w rywalizacji')).toBeTruthy();
  expect(screen.getByText('Wypisany z rywalizacji')).toBeTruthy();
  const joinBtn = screen.getByRole('button', { name: 'Zapisz się do rywalizacji' });
  fireEvent.click(joinBtn);
  await waitFor(() => expect(api.joinCompetition).toHaveBeenCalledWith('jan'));
});

it('opens confirmation modal before leaving the competition and calls leaveCompetition on confirm', async () => {
  data.competitionParticipants = ['jan'];
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /Rywalizacja/ }));
  const leaveBtn = await screen.findByRole('button', { name: 'Wypisz się z rywalizacji' });
  fireEvent.click(leaveBtn);

  expect(screen.getByRole('dialog', { name: 'Wypisanie z rywalizacji' })).toBeTruthy();
  expect(screen.getByText(/Czy na pewno chcesz wypisać się z rywalizacji/)).toBeTruthy();

  // Cancel action closes modal without calling api
  fireEvent.click(screen.getByRole('button', { name: 'Anuluj' }));
  expect(api.leaveCompetition).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog', { name: 'Wypisanie z rywalizacji' })).toBeNull();

  // Re-open and confirm
  fireEvent.click(screen.getByRole('button', { name: 'Wypisz się z rywalizacji' }));
  const confirmBtn = screen.getByRole('button', { name: 'Potwierdź wypisanie' });
  fireEvent.click(confirmBtn);
  await waitFor(() => expect(api.leaveCompetition).toHaveBeenCalledWith('jan'));
});
