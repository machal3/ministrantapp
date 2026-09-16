import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { aggregateAttendees } from '../src/lib/attendance';
import { personalServices } from '../src/lib/myServices';
import { dateKey, shiftDate, zonedIso } from '../src/lib/dates';
import type { ScheduleData } from '../src/types/database';

const repository = vi.hoisted(() => ({ loadWeek: vi.fn(), loadUpcomingServices: vi.fn(), subscribe: vi.fn(), setAttendance: vi.fn(), removeAttendance: vi.fn(), updateRule: vi.fn() }));
vi.mock('../src/lib/repository', () => repository);
vi.mock('../src/lib/supabase', () => ({ isDemo: false }));
import App from '../src/App';
import MyServicesView from '../src/components/MyServicesView';

const now = new Date();
const futureDay = shiftDate(dateKey(now), 9);
function fixture(): ScheduleData {
  const data: ScheduleData = {
    servers: [{ id: 'jan', name: 'Jan Kowalski', rank: 'Lektor' }, { id: 'piotr', name: 'Piotr Nowak', rank: 'Ministrant' }],
    masses: [
      { id: 'single', start_time: zonedIso(futureDay, '19:00'), title: 'Spotkanie', category: 'other', is_extra: false, suggested_spots: null },
      { id: 'regular', start_time: zonedIso(futureDay, '10:30'), title: 'Msza z dyżurem', is_extra: false, suggested_spots: 4, celebrant: 'ks. Jan' },
      { id: 'devotion', start_time: zonedIso(shiftDate(futureDay, 1), '18:00'), title: 'Różaniec', category: 'devotion', is_extra: true, suggested_spots: 2 },
      { id: 'past', start_time: zonedIso(shiftDate(dateKey(now), -1), '07:00'), title: 'Miniona Msza', is_extra: false, suggested_spots: 4 },
    ],
    rules: [{ id: 'rule', server_id: 'jan', day_of_week: new Date(`${futureDay}T12:00:00Z`).getUTCDay(), time_slot: '10:30:00' }],
    exceptions: ['single', 'devotion', 'past'].map(mass_id => ({ id: mass_id, mass_id, server_id: 'jan', type: 'single' as const })),
    attendees: [], recentAttendance: { jan: 6 },
  };
  data.attendees = aggregateAttendees(data.masses, data.servers, data.rules, data.exceptions);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.setItem('liturgy.active-server', 'jan');
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  repository.loadWeek.mockResolvedValue(fixture());
  repository.loadUpcomingServices.mockResolvedValue(fixture());
  repository.subscribe.mockReturnValue(() => {});
});
afterEach(() => { cleanup(); localStorage.clear(); });

async function openServices() {
  render(<App />);
  await screen.findByRole('button', { name: /Wybrano: Jan/ });
  fireEvent.click(screen.getByRole('button', { name: 'Moje służby' }));
}

it('selects recurring and single services, sorts same-day events and removes past events', () => {
  const data = fixture();
  expect(personalServices(data, 'jan', now).map(s => [s.mass.id, s.action])).toEqual([
    ['regular', 'excuse'], ['single', 'withdraw'], ['devotion', 'withdraw'],
  ]);
  expect(personalServices(data, 'piotr', now)).toEqual([]);
  data.exceptions = [];
  data.attendees = aggregateAttendees(data.masses, data.servers, data.rules, []);
  expect(personalServices(data, 'jan', now).map(s => s.mass.id)).toEqual(['regular']);
  data.rules = [];
  data.exceptions = fixture().exceptions;
  data.attendees = aggregateAttendees(data.masses, data.servers, [], data.exceptions);
  expect(personalServices(data, 'jan', now).map(s => s.mass.id)).toEqual(['single', 'devotion']);
});

it('keeps an excused occurrence for restoration and re-evaluates a changed or deleted mass', () => {
  const data = fixture();
  data.exceptions.push({ id: 'excuse', mass_id: 'regular', server_id: 'jan', type: 'excused' });
  data.attendees = aggregateAttendees(data.masses, data.servers, data.rules, data.exceptions);
  expect(personalServices(data, 'jan', now)[0]).toMatchObject({ excused: true, action: 'restore', attendees: [] });
  data.exceptions.pop();
  data.masses.find(m => m.id === 'regular')!.start_time = zonedIso(futureDay, '11:00');
  data.attendees = aggregateAttendees(data.masses, data.servers, data.rules, data.exceptions);
  expect(personalServices(data, 'jan', now).map(s => s.mass.id)).toEqual(['single', 'devotion']);
  data.masses = data.masses.filter(m => m.id !== 'single');
  expect(personalServices(data, 'jan', now)[0].mass.id).toBe('devotion');
});

it('loads a single 30-day range and shows categories, optional capacity, celebrant and recent count', async () => {
  await openServices();
  expect(await screen.findByRole('heading', { name: 'Najbliższa służba' })).toBeTruthy();
  expect(repository.loadUpcomingServices).toHaveBeenCalledTimes(1);
  const [from, to] = repository.loadUpcomingServices.mock.calls[0];
  expect(Math.abs(Date.parse(from) - now.getTime())).toBeLessThan(60_000);
  expect(to).toBe(zonedIso(shiftDate(dateKey(), 30), '00:00'));
  expect(screen.getByText('ks. Jan')).toBeTruthy();
  expect(screen.getByText('Inne wydarzenie')).toBeTruthy();
  expect(screen.getByText('Nabożeństwo')).toBeTruthy();
  expect(screen.getByText('1 osoba')).toBeTruthy();
  expect(screen.getByText('6')).toBeTruthy();
  expect(screen.queryByText('Miniona Msza')).toBeNull();
});

it('uses existing writes for absence and restore, keeping the recurring rule', async () => {
  let data = fixture();
  repository.loadUpcomingServices.mockImplementation(async () => data);
  repository.setAttendance.mockImplementation(async (mass_id, server_id, type) => {
    data = { ...data, exceptions: [...data.exceptions, { id: 'new', mass_id, server_id, type }] };
    data.attendees = aggregateAttendees(data.masses, data.servers, data.rules, data.exceptions);
  });
  repository.removeAttendance.mockImplementation(async (massId) => {
    data = { ...data, exceptions: data.exceptions.filter(e => e.mass_id !== massId) };
    data.attendees = aggregateAttendees(data.masses, data.servers, data.rules, data.exceptions);
  });
  await openServices();
  fireEvent.click(await screen.findByRole('button', { name: 'Zgłoś nieobecność w tym dniu' }));
  const restore = await screen.findByRole('button', { name: 'Przywróć obecność' });
  await waitFor(() => expect(restore.hasAttribute('disabled')).toBe(false));
  expect(repository.setAttendance).toHaveBeenCalledWith('regular', 'jan', 'excused');
  expect(screen.getByText('Zgłoszono nieobecność')).toBeTruthy();
  fireEvent.click(restore);
  await screen.findByRole('button', { name: 'Zgłoś nieobecność w tym dniu' });
  expect(repository.removeAttendance).toHaveBeenCalledWith('regular', 'jan');
  expect(data.rules).toHaveLength(1);
});

it('withdraws only a single signup and opens the selected future day in the schedule', async () => {
  await openServices();
  const single = await screen.findByRole('article', { name: /Spotkanie,/ });
  fireEvent.click(within(single).getByRole('button', { name: 'Wypisz się' }));
  await waitFor(() => expect(repository.removeAttendance).toHaveBeenCalledWith('single', 'jan'));
  fireEvent.click(within(single).getByRole('button', { name: 'Zobacz dzień w grafiku' }));
  await screen.findByRole('region', { name: 'Grafik tygodniowy' });
  expect(screen.getByRole('heading', { name: 'Spotkanie' })).toBeTruthy();
});

it('shows load failure instead of false emptiness, retries, and preserves stale data on refresh failure', async () => {
  repository.loadUpcomingServices.mockRejectedValueOnce(new Error('Brak połączenia'));
  await openServices();
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Brak połączenia'));
  expect(screen.queryByText('Nie masz obecnie żadnych zaplanowanych służb.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Ponów' }));
  await screen.findByRole('heading', { name: 'Najbliższa służba' });
  repository.loadUpcomingServices.mockRejectedValue(new Error('Offline'));
  act(() => repository.subscribe.mock.calls[0][0]());
  await screen.findByText('Wyświetlane dane mogą być nieaktualne.');
  expect(screen.getByRole('heading', { name: 'Najbliższa służba' })).toBeTruthy();
});

it('ignores an old request when the selected server changes and keeps one realtime subscription', async () => {
  let finish!: (data: ScheduleData) => void;
  repository.loadUpcomingServices.mockImplementationOnce(() => new Promise<ScheduleData>(resolve => { finish = resolve; }));
  await openServices();
  fireEvent.click(screen.getByRole('button', { name: /Wybrano: Jan/ }));
  fireEvent.click(screen.getByRole('button', { name: /Piotr Nowak Ministrant/ }));
  await screen.findByText('Nie masz obecnie żadnych zaplanowanych służb.');
  await act(async () => finish(fixture()));
  expect(screen.getByText('Dobrze, że jesteś, Piotr.')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Najbliższa służba' })).toBeNull();
  expect(repository.subscribe).toHaveBeenCalledTimes(1);
});

it('updates the personal screen from realtime after deleting the nearest service', async () => {
  await openServices();
  await screen.findByRole('heading', { name: 'Najbliższa służba' });
  const data = fixture();
  data.masses = data.masses.filter(m => m.id !== 'regular');
  repository.loadUpcomingServices.mockResolvedValue(data);
  act(() => repository.subscribe.mock.calls[0][0]());
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Msza z dyżurem' })).toBeNull());
  expect(within(screen.getAllByRole('article')[0]).getByRole('heading', { name: 'Spotkanie' })).toBeTruthy();
});

it('shows the no-selection state without a duplicated selector', () => {
  render(<MyServicesView data={null} now={now} loading={false} error="" busy={false} onRetry={vi.fn()} onAction={vi.fn()} onOpenDay={vi.fn()} onEditRule={vi.fn()} onDeleteRule={vi.fn()} />);
  expect(screen.getByRole('heading', { name: 'Wybierz swoje imię' })).toBeTruthy();
  expect(screen.queryByRole('combobox')).toBeNull();
});

it('shows companions on each service, excludes self, and refreshes the roster after an absence', async () => {
  const data = fixture();
  data.exceptions.push(...['regular', 'single'].map(mass_id => ({ id: `piotr-${mass_id}`, mass_id, server_id: 'piotr', type: 'single' as const })));
  data.attendees = aggregateAttendees(data.masses, data.servers, data.rules, data.exceptions);
  repository.loadUpcomingServices.mockResolvedValue(data);
  await openServices();
  for (const title of [/Msza z dyżurem,/, /Spotkanie,/]) {
    const card = await screen.findByRole('article', { name: title });
    const roster = within(card).getByRole('list', { name: 'Służą z Tobą' });
    expect(within(roster).getByText('Piotr Nowak')).toBeTruthy();
    expect(within(roster).queryByText('Jan Kowalski')).toBeNull();
  }
  expect(within(screen.getByRole('article', { name: /Różaniec,/ })).getByText('Na razie tylko Ty jesteś zapisany.')).toBeTruthy();
  const changed = { ...data, exceptions: data.exceptions.map(e => e.id === 'piotr-regular' ? { ...e, type: 'excused' as const } : e) };
  changed.attendees = aggregateAttendees(changed.masses, changed.servers, changed.rules, changed.exceptions);
  repository.loadUpcomingServices.mockResolvedValue(changed);
  act(() => repository.subscribe.mock.calls[0][0]());
  const regular = within(screen.getByRole('article', { name: /Msza z dyżurem,/ }));
  await waitFor(() => expect(regular.queryByText('Piotr Nowak')).toBeNull());
  expect(regular.getByText('Na razie tylko Ty jesteś zapisany.')).toBeTruthy();
});
