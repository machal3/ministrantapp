import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AdminBadgesModal from '../src/components/AdminBadgesModal';
import { DEFAULT_BADGE_DEFINITIONS } from '../src/lib/competition';
import type { ScheduleData } from '../src/types/database';

const api = vi.hoisted(() => ({ saveBadge: vi.fn(), deleteBadge: vi.fn(), clearBadges: vi.fn() }));
vi.mock('../src/lib/repository', () => api);

const session = { token: 'admin-token', expires_at: new Date(Date.now() + 1800000).toISOString() };
const props = {
  data: { servers: [], masses: [], rules: [], exceptions: [], attendees: [] } as ScheduleData,
  session,
  onRefresh: vi.fn(async () => {}),
  onClose: vi.fn(),
  onSaved: vi.fn(),
};

beforeEach(() => {
  vi.resetAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

function goToStep2() {
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj odznakę' }));
  fireEvent.change(screen.getByLabelText('Nazwa odznaki'), { target: { value: 'Wierna służba' } });
  fireEvent.change(screen.getByLabelText(/Opis/), { target: { value: 'Za wytrwałość' } });
  fireEvent.click(screen.getByRole('radio', { name: 'Gwiazdka' }));
  fireEvent.change(screen.getByLabelText('Nagroda (pkt)'), { target: { value: '40' } });
  fireEvent.click(screen.getByRole('button', { name: /Dalej/ }));
}

it('lists the basic set when nothing was customized yet', () => {
  render(<AdminBadgesModal {...props} />);
  for (const def of DEFAULT_BADGE_DEFINITIONS) {
    expect(screen.getByText(def.name)).toBeTruthy();
  }
  expect(screen.getByText(/zestaw podstawowy/)).toBeTruthy();
});

it('walks through two steps: basics first, condition second', () => {
  render(<AdminBadgesModal {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj odznakę' }));
  expect(screen.getByText('Podstawy')).toBeTruthy();
  expect(screen.getByText('Za co')).toBeTruthy();
  // Condition fields are not visible yet.
  expect(screen.queryByLabelText('Cel (liczba służb)')).toBeNull();
  fireEvent.change(screen.getByLabelText('Nazwa odznaki'), { target: { value: 'Wierna służba' } });
  fireEvent.click(screen.getByRole('button', { name: /Dalej/ }));
  expect(screen.getByLabelText('Cel (liczba służb)')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Wstecz/ }));
  expect(screen.getByLabelText('Nazwa odznaki')).toHaveProperty('value', 'Wierna służba');
});

it('blocks step 2 without a name and keeps the entered reward', () => {
  render(<AdminBadgesModal {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj odznakę' }));
  fireEvent.click(screen.getByRole('button', { name: /Dalej/ }));
  expect(screen.getByRole('alert')).toHaveProperty('textContent', expect.stringContaining('nazwę'));
  expect(screen.queryByLabelText('Cel (liczba służb)')).toBeNull();
});

it('saves a badge with weekday, time and title conditions', async () => {
  api.saveBadge.mockResolvedValue('new-id');
  render(<AdminBadgesModal {...props} />);
  goToStep2();
  fireEvent.change(screen.getByLabelText('Cel (liczba służb)'), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ni' }));
  fireEvent.change(screen.getByLabelText('Od'), { target: { value: '17:00' } });
  fireEvent.change(screen.getByLabelText('Do'), { target: { value: '20:00' } });
  fireEvent.change(screen.getByLabelText(/Nazwa zawiera/), { target: { value: 'Msza' } });
  expect(screen.getByText(/Cel: 5 służb/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj odznakę' }));
  await waitFor(() => expect(api.saveBadge).toHaveBeenCalledWith(
    {
      id: undefined, name: 'Wierna służba', description: 'Za wytrwałość', icon: 'star', points: 40, target: 5,
      filters: { weekdays: [0], timeFrom: '17:00', timeTo: '20:00', title: 'Msza' },
    },
    session,
  ));
  expect(props.onSaved).toHaveBeenCalledWith('Dodano nową odznakę.');
});

it('saves celebrant, occasion, day mark and per-day counting', async () => {
  api.saveBadge.mockResolvedValue('new-id');
  render(<AdminBadgesModal {...props} />);
  goToStep2();
  fireEvent.change(screen.getByLabelText(/Celebrans zawiera/), { target: { value: 'ks. Proboszcz' } });
  fireEvent.change(screen.getByLabelText(/Okazja zawiera/), { target: { value: 'Chrzciny' } });
  fireEvent.change(screen.getByLabelText('Rodzaj oznaczenia'), { target: { value: 'solemnity' } });
  fireEvent.change(screen.getByLabelText(/Tekst oznaczenia zawiera/), { target: { value: 'Wszystkich' } });
  fireEvent.click(screen.getByRole('button', { name: 'Max 1 dziennie' }));
  fireEvent.click(screen.getByRole('button', { name: 'Nabożeństwa' }));
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj odznakę' }));
  await waitFor(() => expect(api.saveBadge).toHaveBeenCalledWith(
    expect.objectContaining({
      target: 5,
      filters: {
        category: 'devotion', celebrant: 'ks. Proboszcz', occasion: 'Chrzciny',
        dayMark: 'solemnity', dayMarkText: 'Wszystkich', perDay: true,
      },
    }),
    session,
  ));
});

it('adds and removes specific dates', async () => {
  api.saveBadge.mockResolvedValue('new-id');
  render(<AdminBadgesModal {...props} />);
  goToStep2();
  fireEvent.change(screen.getByLabelText('Dodaj datę'), { target: { value: '2026-12-25' } });
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj' }));
  expect(screen.getByText('2026-12-25')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Usuń datę 2026-12-25' }));
  expect(screen.queryByText('2026-12-25')).toBeNull();
  fireEvent.change(screen.getByLabelText('Dodaj datę'), { target: { value: '2026-12-25' } });
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj' }));
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj odznakę' }));
  await waitFor(() => expect(api.saveBadge).toHaveBeenCalledWith(
    expect.objectContaining({ filters: expect.objectContaining({ dates: ['2026-12-25'] }) }),
    session,
  ));
});

it('edits an existing badge keeping its identity and filters', async () => {
  api.saveBadge.mockResolvedValue('first');
  const data: ScheduleData = {
    ...props.data,
    badgeDefinitions: [{ id: 'x', name: 'Stara', description: '', icon: 'star', points: 5, target: 3, filters: { weekdays: [0] } }],
  };
  render(<AdminBadgesModal {...props} data={data} />);
  expect(screen.getByText(/Niedz/)).toBeTruthy();
  const card = screen.getByText('Stara').closest('li')!;
  fireEvent.click(within(card).getByRole('button', { name: 'Edytuj' }));
  fireEvent.change(screen.getByLabelText('Nazwa odznaki'), { target: { value: 'Nowa' } });
  fireEvent.click(screen.getByRole('button', { name: /Dalej/ }));
  expect(screen.getByLabelText('Cel (liczba służb)')).toHaveProperty('value', '3');
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }));
  await waitFor(() => expect(api.saveBadge).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'x', name: 'Nowa', filters: expect.objectContaining({ weekdays: [0] }) }),
    session,
  ));
});

it('shows a save error without closing the wizard', async () => {
  api.saveBadge.mockRejectedValue(new Error('Cel musi wynosić od 1 do 1000 służb.'));
  render(<AdminBadgesModal {...props} />);
  goToStep2();
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj odznakę' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('1000 służb'));
  expect(api.saveBadge).toHaveBeenCalledTimes(1);
});

it('deletes a badge after confirmation', async () => {
  api.deleteBadge.mockResolvedValue(undefined);
  const data: ScheduleData = { ...props.data, badgeDefinitions: DEFAULT_BADGE_DEFINITIONS.map(b => ({ ...b })) };
  render(<AdminBadgesModal {...props} data={data} />);
  const card = screen.getByText('Pomocna dłoń').closest('li')!;
  fireEvent.click(within(card).getByRole('button', { name: 'Usuń odznakę Pomocna dłoń' }));
  fireEvent.click(within(card).getByRole('button', { name: 'Tak, usuń' }));
  await waitFor(() => expect(api.deleteBadge).toHaveBeenCalledWith('ten', session));
});

it('does not display bulk delete all badges option', () => {
  const data: ScheduleData = { ...props.data, badgeDefinitions: DEFAULT_BADGE_DEFINITIONS.map(b => ({ ...b })) };
  render(<AdminBadgesModal {...props} data={data} />);
  expect(screen.queryByRole('button', { name: /Usuń wszystkie odznaki/i })).toBeNull();
  expect(screen.queryByText('Usuń wszystkie')).toBeNull();
});

it('shows an empty state with guidance when the list is empty', () => {
  render(<AdminBadgesModal {...props} data={{ ...props.data, badgeDefinitions: [] }} />);
  expect(screen.getByText('Brak odznak')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Usuń wszystkie/i })).toBeNull();
});

it('allows selecting new icons like Church or Bell', async () => {
  api.saveBadge.mockResolvedValue('church-badge');
  render(<AdminBadgesModal {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj odznakę' }));
  fireEvent.change(screen.getByLabelText('Nazwa odznaki'), { target: { value: 'Służba w parafii' } });
  fireEvent.click(screen.getByRole('radio', { name: 'Kościół' }));
  fireEvent.change(screen.getByLabelText('Nagroda (pkt)'), { target: { value: '50' } });
  fireEvent.click(screen.getByRole('button', { name: /Dalej/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Dodaj odznakę' }));
  await waitFor(() => expect(api.saveBadge).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Służba w parafii', icon: 'church', points: 50 }),
    session,
  ));
});

it('allows selecting time-frame and streak badge kinds with custom targets', async () => {
  api.saveBadge.mockResolvedValue('weekly-badge');
  render(<AdminBadgesModal {...props} />);
  goToStep2();

  // Test time-frame selection
  fireEvent.click(screen.getByRole('radio', { name: /W jakimś czasie/ }));
  expect(screen.getByLabelText('Cel (liczba służb w jednym tygodniu)')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '3 służby' }));
  expect(screen.getByText(/Cel: 3 służby · w jednym tygodniu/)).toBeTruthy();

  // Test month sub-selection
  fireEvent.click(screen.getByRole('radio', { name: /W jednym miesiącu/ }));
  expect(screen.getByLabelText('Cel (liczba służb w jednym miesiącu)')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '8 służb' }));
  expect(screen.getByText(/Cel: 8 służb · w jednym miesiącu/)).toBeTruthy();

  // Test custom period sub-selection
  fireEvent.click(screen.getByRole('radio', { name: /Wybrany okres/ }));
  expect(screen.getByLabelText('Cel (liczba służb w wybranym okresie)')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Data początkowa (od)'), { target: { value: '2026-12-01' } });
  fireEvent.change(screen.getByLabelText('Data końcowa (do)'), { target: { value: '2026-12-24' } });
  expect(screen.getByText(/w okresie 1 gru–24 gru/)).toBeTruthy();

  // Test streak selection
  fireEvent.click(screen.getByRole('radio', { name: /Seria „Twój rytm”/ }));
  expect(screen.getByLabelText('Cel (liczba tygodni w serii)')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '6 tygodni' }));
  expect(screen.getByText(/Cel: 6 tygodni w serii · seria „Twój rytm”/)).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Dodaj odznakę' }));
  await waitFor(() => expect(api.saveBadge).toHaveBeenCalledWith(
    expect.objectContaining({
      target: 6,
      filters: { kind: 'streak' },
    }),
    session,
  ));
});

it('does not save or close the wizard on Enter in step 2 fields', async () => {
  api.saveBadge.mockResolvedValue('new-id');
  render(<AdminBadgesModal {...props} />);
  goToStep2();
  const title = screen.getByLabelText(/Nazwa zawiera/);
  fireEvent.change(title, { target: { value: 'Msza' } });
  const cancelled = fireEvent.keyDown(title, { key: 'Enter', code: 'Enter' });
  expect(cancelled).toBe(false);
  expect(api.saveBadge).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Cel (liczba słu\u017Cb)')).toBeTruthy();
  expect(props.onClose).not.toHaveBeenCalled();
});

it('adds the date on Enter in the date field instead of saving', () => {
  render(<AdminBadgesModal {...props} />);
  goToStep2();
  const dateInput = screen.getByLabelText('Dodaj dat\u0119');
  fireEvent.change(dateInput, { target: { value: '2026-12-25' } });
  fireEvent.keyDown(dateInput, { key: 'Enter', code: 'Enter' });
  expect(screen.getByText('2026-12-25')).toBeTruthy();
  expect(api.saveBadge).not.toHaveBeenCalled();
});

it('opens legacy definitions without filters and keeps them editable', () => {
  const legacy = [{ id: 'old', name: 'Stara odznaka', description: '', icon: 'medal', points: 10, target: 3 }];
  const data = { ...props.data, badgeDefinitions: legacy } as unknown as ScheduleData;
  render(<AdminBadgesModal {...props} data={data} />);
  expect(screen.getByText('Stara odznaka')).toBeTruthy();
  const card = screen.getByText('Stara odznaka').closest('li')!;
  fireEvent.click(within(card).getByRole('button', { name: 'Edytuj' }));
  fireEvent.change(screen.getByLabelText('Nazwa odznaki'), { target: { value: 'Stara odznaka' } });
  fireEvent.click(screen.getByRole('button', { name: /Dalej/ }));
  expect(screen.getByLabelText('Cel (liczba słu\u017Cb)')).toHaveProperty('value', '3');
  expect(screen.getByText(/Cel: 3 słu\u017Cby/)).toBeTruthy();
});
