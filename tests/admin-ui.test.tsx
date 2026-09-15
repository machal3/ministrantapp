import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { dateKey, zonedIso } from '../src/lib/dates';
import type { ScheduleData } from '../src/types/database';

const api = vi.hoisted(() => ({ loginAdmin: vi.fn(), logoutAdmin: vi.fn(), loadWeek: vi.fn(), subscribe: vi.fn(), updateServer: vi.fn(), addServer: vi.fn(), deleteServer: vi.fn(), updateMass: vi.fn(), updateMassTime: vi.fn(), addRecurringMasses: vi.fn(), deleteMass: vi.fn() }));
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
  data = { servers: [{ id: 'jan', name: 'Jan Kowalski', rank: 'Lektor' }], masses: [{ id: 'mass', title: 'Msza Święta', start_time: zonedIso(dateKey(), '18:00'), suggested_spots: 4, is_extra: false }], rules: [], attendees: [], exceptions: [] };
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
  fireEvent.click(screen.getByTitle('Edytuj ministranta'));
  fireEvent.change(screen.getByLabelText('Imię i nazwisko'), { target: { value: 'Jan Nowy' } });
  fireEvent.change(screen.getByLabelText('Stopień'), { target: { value: 'Ceremoniarz' } });
  fireEvent.click(screen.getByRole('button', { name: /Zapisz/ }));
  await screen.findByText('Zapisano dane: Jan Nowy.');
  expect(api.updateServer).toHaveBeenCalledWith({ id: 'jan', name: 'Jan Nowy', rank: 'Ceremoniarz' }, session);
  fireEvent.click(screen.getByRole('button', { name: 'Zamknij okno' }));
  expect(screen.getByRole('option', { name: 'Jan Nowy · Ceremoniarz' })).toBeTruthy();
});

it('adds a new server with one of the 5 ranks', async () => {
  api.addServer.mockImplementation(async (server) => {
    const id = 'new-id';
    data.servers.push({ id, ...server });
    return id;
  });
  render(<App />);
  await screen.findByRole('heading', { name: 'Msza Święta' });
  await unlock();
  fireEvent.click(screen.getByRole('button', { name: 'Edytuj ministrantów' }));
  fireEvent.click(screen.getByRole('button', { name: /\+ Dodaj ministranta/ }));
  fireEvent.change(screen.getByLabelText('Imię i nazwisko nowego ministranta'), { target: { value: 'Adam Nowy' } });
  fireEvent.change(screen.getByLabelText('Stopień liturgiczny'), { target: { value: 'Szafarz' } });
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj ministranta' }));
  await waitFor(() => expect(api.addServer).toHaveBeenCalledWith({ name: 'Adam Nowy', rank: 'Szafarz' }, session));
  expect((await screen.findAllByText('Dodano ministranta: Adam Nowy.')).length).toBeGreaterThan(0);
});

it('displays community statistics in admin servers modal without rank breakdown', async () => {
  render(<App />);
  await screen.findByRole('heading', { name: 'Msza Święta' });
  expect(screen.getByText('Twoje służby w ciągu ostatnich 30 dni')).toBeTruthy();
  await unlock();
  fireEvent.click(screen.getByRole('button', { name: 'Edytuj ministrantów' }));
  fireEvent.click(screen.getByRole('button', { name: /Statystyki służby/ }));
  expect(screen.queryByText('Podział według stopni liturgicznych')).toBeNull();
  expect(screen.getByText('Aktywność w ciągu ostatniego miesiąca (30 dni)')).toBeTruthy();
});

it('changes mass details with scope choice, then locks management on logout', async () => {
  api.updateMass.mockImplementation(async (_id, input) => {
    data.masses[0].start_time = zonedIso(dateKey(), input.time);
    data.masses[0].title = input.title;
    return 1;
  });
  render(<App />);
  await screen.findByRole('heading', { name: 'Msza Święta' });
  await unlock();
  fireEvent.click(screen.getByRole('heading', { name: 'Msza Święta' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edytuj Mszę' }));
  fireEvent.change(screen.getByLabelText('Godzina'), { target: { value: '19:30' } });
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }));
  await screen.findByText('19:30');
  expect(api.updateMass).toHaveBeenCalledWith('mass', {
    title: 'Msza Święta',
    time: '19:30',
    suggested_spots: 4,
    is_extra: false,
    scope: 'single',
  }, session);
  fireEvent.click(screen.getByRole('button', { name: 'Wyłącz tryb admina' }));
  await waitFor(() => expect(api.logoutAdmin).toHaveBeenCalledWith(session));
  expect(screen.queryByRole('button', { name: 'Edytuj Mszę' })).toBeNull();
  expect(localStorage.length).toBe(0);
});

it('edits entire future series when future scope is selected in EditMassModal', async () => {
  api.updateMass.mockResolvedValue(5);
  render(<App />);
  await screen.findByRole('heading', { name: 'Msza Święta' });
  await unlock();
  fireEvent.click(screen.getByRole('heading', { name: 'Msza Święta' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edytuj Mszę' }));
  fireEvent.change(screen.getByLabelText('Godzina'), { target: { value: '18:30' } });
  fireEvent.click(screen.getByLabelText(/Ten i wszystkie przyszłe terminy z serii/));
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz serię terminów' }));
  await waitFor(() => expect(api.updateMass).toHaveBeenCalledWith('mass', {
    title: 'Msza Święta',
    time: '18:30',
    suggested_spots: 4,
    is_extra: false,
    scope: 'future',
  }, session));
  expect(await screen.findByText(/Zaktualizowano całą serię/)).toBeTruthy();
});

it('retains the editing dialog and entered values if the backend rejects a write', async () => {
  api.updateMass.mockRejectedValue(new Error('Sesja administratora wygasła.'));
  render(<App />);
  await screen.findByRole('heading', { name: 'Msza Święta' });
  await unlock();
  fireEvent.click(screen.getByRole('heading', { name: 'Msza Święta' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edytuj Mszę' }));
  fireEvent.change(screen.getByLabelText('Godzina'), { target: { value: '19:30' } });
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Sesja administratora wygasła.');
  expect(screen.getByLabelText('Godzina')).toHaveProperty('value', '19:30');
});

it('adds recurring masses via calendar mode and refreshes schedule', async () => {
  api.addRecurringMasses.mockResolvedValue(12);
  render(<App />);
  await screen.findByRole('heading', { name: 'Msza Święta' });
  await unlock();
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj Mszę / Nabożeństwo' }));
  fireEvent.click(screen.getByRole('button', { name: /Seria regularna/ }));
  expect(screen.getByText('Podsumowanie serii:')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Utwórz \d+ Msz/ }));
  await waitFor(() => expect(api.addRecurringMasses).toHaveBeenCalled());
  expect(await screen.findByText(/Utworzono serię/)).toBeTruthy();
});

it('offers delete scope choice and deletes future masses when selected', async () => {
  render(<App />);
  await screen.findByRole('heading', { name: 'Msza Święta' });
  await unlock();
  fireEvent.click(screen.getByRole('heading', { name: 'Msza Święta' }));
  fireEvent.click(screen.getByRole('button', { name: /Usuń Mszę Świętą/ }));
  expect(screen.getByLabelText(/Tylko ten termin/)).toBeTruthy();
  const futureRadio = screen.getByLabelText(/Ten i wszystkie przyszłe terminy/);
  expect(futureRadio).toBeTruthy();
  fireEvent.click(futureRadio);
  fireEvent.click(screen.getByRole('button', { name: /Usuń przyszłe/ }));
  await waitFor(() => expect(api.deleteMass).toHaveBeenCalledWith('mass', session, 'future'));
});

