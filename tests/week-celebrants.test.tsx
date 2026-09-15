import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { shiftDate, weekStart, zonedIso } from '../src/lib/dates';

const loadWeek = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/repository', () => ({ loadWeek }));

import WeekCelebrantsModal from '../src/components/WeekCelebrantsModal';

const WEEK = '2026-09-13';

function mass(id: string, day: string, time: string, celebrant?: string) {
  return { id, start_time: zonedIso(day, time), title: `Msza ${time}`, suggested_spots: 4, is_extra: false, celebrant: celebrant ?? null };
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  loadWeek.mockReset();
});

afterEach(() => { cleanup(); });

describe('WeekCelebrantsModal', () => {
  it('prefills celebrants and keeps save disabled without changes', async () => {
    loadWeek.mockResolvedValue({ masses: [mass('a', WEEK, '08:00', 'ks. Proboszcz'), mass('b', shiftDate(WEEK, 1), '18:00')] });
    const onSave = vi.fn();
    render(<WeekCelebrantsModal initialWeek={WEEK} onClose={vi.fn()} onSave={onSave} />);
    expect(await screen.findByDisplayValue('ks. Proboszcz')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Zapisz księży' }) as HTMLButtonElement).disabled).toBe(true);
    expect(loadWeek).toHaveBeenCalledWith(WEEK);
  });

  it('saves only the changed mass', async () => {
    const masses = [mass('a', WEEK, '08:00', 'ks. Proboszcz'), mass('b', shiftDate(WEEK, 1), '18:00')];
    loadWeek.mockResolvedValue({ masses });
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<WeekCelebrantsModal initialWeek={WEEK} onClose={onClose} onSave={onSave} />);
    const input = await screen.findByLabelText(/Msza 18:00/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ks. Jarosław' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz księży (1)' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith([{ mass: masses[1], celebrant: 'ks. Jarosław' }]);
    expect(onClose).toHaveBeenCalled();
  });

  it('groups masses by day', async () => {
    loadWeek.mockResolvedValue({ masses: [mass('a', WEEK, '08:00'), mass('b', WEEK, '10:00'), mass('c', shiftDate(WEEK, 1), '18:00')] });
    render(<WeekCelebrantsModal initialWeek={WEEK} onClose={vi.fn()} onSave={vi.fn()} />);
    const headings = await screen.findAllByText(/· \d+ /);
    expect(headings).toHaveLength(2);
    expect(screen.getByLabelText(/Msza 08:00/)).toBeTruthy();
    expect(screen.getByLabelText(/Msza 18:00/)).toBeTruthy();
  });

  it('selects a mass by clicking its tile', async () => {
    loadWeek.mockResolvedValue({ masses: [mass('a', WEEK, '08:00'), mass('b', WEEK, '10:00')] });
    render(<WeekCelebrantsModal initialWeek={WEEK} onClose={vi.fn()} onSave={vi.fn()} />);
    fireEvent.click(await screen.findByText('10:00 · Msza 10:00'));
    fireEvent.click(screen.getByRole('button', { name: 'ks. Grzegorz' }));
    expect((screen.getByLabelText('Celebrans: Msza 10:00, Niedziela 10:00') as HTMLInputElement).value).toBe('ks. Grzegorz');
    expect((screen.getByLabelText('Celebrans: Msza 08:00, Niedziela 08:00') as HTMLInputElement).value).toBe('');
  });
  it('fills the focused mass from the shared priest chips', async () => {
    loadWeek.mockResolvedValue({ masses: [mass('a', WEEK, '08:00'), mass('b', WEEK, '10:00')] });
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<WeekCelebrantsModal initialWeek={WEEK} onClose={vi.fn()} onSave={onSave} />);
    const input = await screen.findByLabelText(/Msza 10:00/) as HTMLInputElement;
    fireEvent.focus(input);
    expect(screen.getByText(/Wstawiane do: 10:00/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ks. Jarosław' }));
    expect(input.value).toBe('ks. Jarosław');
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz księży (1)' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0][0].celebrant).toBe('ks. Jarosław');
  });

  it('switches the week and reloads masses', async () => {
    loadWeek.mockImplementation(async (week: string) => ({ masses: week === WEEK ? [mass('a', WEEK, '08:00')] : [] }));
    render(<WeekCelebrantsModal initialWeek={WEEK} onClose={vi.fn()} onSave={vi.fn()} />);
    await screen.findByText(/08:00/);
    fireEvent.click(screen.getByRole('button', { name: 'Następny tydzień' }));
    expect(await screen.findByText('Brak Mszy i nabożeństw w tym tygodniu.')).toBeTruthy();
    expect(loadWeek).toHaveBeenLastCalledWith(shiftDate(WEEK, 7));
    fireEvent.click(screen.getByRole('button', { name: 'Dziś' }));
    expect(loadWeek).toHaveBeenLastCalledWith(weekStart());
  });
});
