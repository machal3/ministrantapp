import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { monday, zonedIso } from '../src/lib/dates';
import type { ScheduleData } from '../src/types/database';

const api = vi.hoisted(() => ({ loginAdmin: vi.fn(), logoutAdmin: vi.fn(), loadWeek: vi.fn(), subscribe: vi.fn(), updateServer: vi.fn(), updateMassTime: vi.fn(), addRecurringMasses: vi.fn(), deleteMass: vi.fn() }));
vi.mock('../src/lib/admin', () => ({ loginAdmin: api.loginAdmin, logoutAdmin: api.logoutAdmin }));
vi.mock('../src/lib/repository', () => ({ ...api, addMass: vi.fn(), addRule: vi.fn(), deleteRule: vi.fn(), removeAttendance: vi.fn(), setAttendance: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ isDemo: false }));
import App from '../src/App';

let data: ScheduleData;
const session = { token: 'test-session', expires_at: new Date(Date.now() + 1800000).toISOString() };
beforeEach(() => {
  vi.resetAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  data = { servers: [{ id: 'jan', name: 'Jan Kowalski', rank: 'Lektor' }], masses: [{ id: 'mass', title: 'Msza Święta', start_time: zonedIso(monday(), '18:00'), suggested_spots: 4, is_extra: false }], rules: [], attendees: [], exceptions: [] };
  api.loadWeek.mockImplementation(async () => structuredClone(data));
  api.subscribe.mockReturnValue(() => {});
  api.loginAdmin.mockResolvedValue(session);
});
afterEach(() => { cleanup(); localStorage.clear(); });

async function unlock() {
  fireEvent.click(screen.getByRole('button', { name: 'Administrator' }));
  fireEvent.change(screen.getByLabelText('PIN administratora'), { target: { value: '0403' } });
  fireEvent.click(screen.getByRole('button', { name: 'Odblokuj' }));
  await screen.findByRole('button', { name: 'Edytuj ministrantów' });
}

it('hides management before PIN verification and shows errors without unlocking', async () => {
  api.loginAdmin.mockRejectedValue(new Error('Nieprawidłowy PIN.'));
  render(<App />);
  await screen.findByRole('heading', { name: 'Msza Święta' });
  expect(screen.queryByRole('button', { name: 'Edytuj godzinę Mszy' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Dodaj Mszę / Nabożeństwo' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Administrator' }));
  fireEvent.change(screen.getByLabelText('PIN administratora'), { target: { value: '0000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Odblokuj' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Nieprawidłowy PIN.');
  expect(screen.queryByRole('button', { name: 'Edytuj ministrantów' })).toBeNull();
});

it('edits name and rank with the verified session and updates the identity selector', async () => {
  api.updateServer.mockImplementation(async (server) => { data.servers[0] = server; });
  render(<App />);
  await screen.findByRole('heading', { name: 'Msza Święta' });
  await unlock();
  expect(api.loginAdmin).toHaveBeenCalledWith('0403');
  fireEvent.click(screen.getByRole('button', { name: 'Edytuj ministrantów' }));
  fireEvent.change(screen.getByLabelText('Imię i nazwisko'), { target: { value: 'Jan Nowy' } });
  fireEvent.change(screen.getByLabelText('Stopień'), { target: { value: 'Ceremoniarz' } });
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz dane' }));
  await screen.findByText('Zapisano dane ministranta.');
  expect(api.updateServer).toHaveBeenCalledWith({ id: 'jan', name: 'Jan Nowy', rank: 'Ceremoniarz' }, session);
  fireEvent.click(screen.getByRole('button', { name: 'Zamknij' }));
  expect(screen.getByRole('option', { name: 'Jan Nowy · Ceremoniarz' })).toBeTruthy();
});

it('changes one mass hour using Polish time, then locks management on logout', async () => {
  api.updateMassTime.mockImplementation(async (_id, startTime) => { data.masses[0].start_time = startTime; });
  render(<App />);
  await screen.findByRole('heading', { name: 'Msza Święta' });
  await unlock();
  fireEvent.click(screen.getByRole('button', { name: 'Edytuj godzinę Mszy' }));
  fireEvent.change(screen.getByLabelText('Nowa godzina'), { target: { value: '19:30' } });
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz godzinę' }));
  await screen.findByRole('article', { name: 'Msza Święta, 19:30' });
  expect(api.updateMassTime).toHaveBeenCalledWith('mass', zonedIso(monday(), '19:30'), session);
  fireEvent.click(screen.getByRole('button', { name: 'Wyjdź z trybu admina' }));
  await waitFor(() => expect(api.logoutAdmin).toHaveBeenCalledWith(session));
  expect(screen.queryByRole('button', { name: 'Edytuj godzinę Mszy' })).toBeNull();
  expect(localStorage.length).toBe(0);
});

it('retains the editing dialog and entered values if the backend rejects a write', async () => {
  api.updateMassTime.mockRejectedValue(new Error('Sesja administratora wygasła.'));
  render(<App />);
  await screen.findByRole('heading', { name: 'Msza Święta' });
  await unlock();
  fireEvent.click(screen.getByRole('button', { name: 'Edytuj godzinę Mszy' }));
  fireEvent.change(screen.getByLabelText('Nowa godzina'), { target: { value: '19:30' } });
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz godzinę' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Sesja administratora wygasła.');
  expect(screen.getByLabelText('Nowa godzina')).toHaveProperty('value', '19:30');
});

it('adds recurring masses via calendar mode and refreshes schedule', async () => {
  api.addRecurringMasses.mockResolvedValue(12);
  render(<App />);
  await screen.findByRole('heading', { name: 'Msza Święta' });
  await unlock();
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj Mszę / Nabożeństwo' }));
  fireEvent.click(screen.getByRole('button', { name: /Seria regularna/ }));
  expect(screen.getByText('Podsumowanie serii:')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Utwórz \d+ nabożeństw/ }));
  await waitFor(() => expect(api.addRecurringMasses).toHaveBeenCalled());
  expect(await screen.findByText(/Utworzono serię nabożeństw/)).toBeTruthy();
});

it('offers delete scope choice and deletes future masses when selected', async () => {
  render(<App />);
  await screen.findByRole('heading', { name: 'Msza Święta' });
  await unlock();
  fireEvent.click(screen.getByRole('button', { name: /Usuń nabożeństwo/ }));
  expect(screen.getByLabelText(/Tylko ten termin/)).toBeTruthy();
  const futureRadio = screen.getByLabelText(/Ten i wszystkie przyszłe terminy/);
  expect(futureRadio).toBeTruthy();
  fireEvent.click(futureRadio);
  fireEvent.click(screen.getByRole('button', { name: 'Usuń przyszłe terminy' }));
  await waitFor(() => expect(api.deleteMass).toHaveBeenCalledWith('mass', session, 'future'));
});

