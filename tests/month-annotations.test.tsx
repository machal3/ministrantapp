import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { dateKey } from '../src/lib/dates';

const repository = vi.hoisted(() => ({ loadMonthAnnotations: vi.fn() }));
vi.mock('../src/lib/repository', () => repository);

import MonthAnnotationsModal from '../src/components/MonthAnnotationsModal';

const MONTH = '2026-09';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  repository.loadMonthAnnotations.mockReset();
});

afterEach(() => { cleanup(); });

describe('MonthAnnotationsModal', () => {
  it('prefills labels and keeps save disabled without changes', async () => {
    repository.loadMonthAnnotations.mockResolvedValue([{ day: `${MONTH}-13`, label: 'Niedziela' }]);
    render(<MonthAnnotationsModal initialMonth={MONTH} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(await screen.findByDisplayValue('Niedziela')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Zapisz oznaczenia' }) as HTMLButtonElement).disabled).toBe(true);
    expect(repository.loadMonthAnnotations).toHaveBeenCalledWith(MONTH);
  });

  it('saves only the changed day', async () => {
    repository.loadMonthAnnotations.mockResolvedValue([]);
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<MonthAnnotationsModal initialMonth={MONTH} onClose={onClose} onSave={onSave} />);
    const input = await screen.findByLabelText('Oznaczenie dnia 1 wrzesień') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Uroczystość' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz oznaczenia (1)' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith([{ day: `${MONTH}-01`, label: 'Uroczystość' }]);
    expect(onClose).toHaveBeenCalled();
  });

  it('fills the focused day from the shared preset chips', async () => {
    repository.loadMonthAnnotations.mockResolvedValue([]);
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<MonthAnnotationsModal initialMonth={MONTH} onClose={vi.fn()} onSave={onSave} />);
    const input = await screen.findByLabelText('Oznaczenie dnia 15 wrzesień') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole('button', { name: 'Święto' }));
    expect(input.value).toBe('Święto');
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz oznaczenia (1)' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith([{ day: `${MONTH}-15`, label: 'Święto' }]));
  });

  it('colors a recognized rank like the calendar and keeps unknown labels green', async () => {
    repository.loadMonthAnnotations.mockResolvedValue([]);
    render(<MonthAnnotationsModal initialMonth={MONTH} onClose={vi.fn()} onSave={vi.fn()} />);
    const input = await screen.findByLabelText('Oznaczenie dnia 1 wrzesień') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Uroczystość' } });
    const row = input.closest('li')!;
    expect(row.classList.contains('is-sunday')).toBe(true);
    expect(row.classList.contains('changed')).toBe(false);
    expect(row.classList.contains('changed-rank')).toBe(true);
    fireEvent.change(input, { target: { value: 'Zwykły dzień' } });
    expect(row.classList.contains('is-sunday')).toBe(false);
    expect(row.classList.contains('changed')).toBe(true);
  });

  it('selects a day by clicking its tile', async () => {
    repository.loadMonthAnnotations.mockResolvedValue([]);
    render(<MonthAnnotationsModal initialMonth={MONTH} onClose={vi.fn()} onSave={vi.fn()} />);
    fireEvent.click(await screen.findByText('Wtorek · 1 wrzesień'));
    fireEvent.click(screen.getByRole('button', { name: 'Uroczystość' }));
    expect((screen.getByLabelText('Oznaczenie dnia 1 wrzesień') as HTMLInputElement).value).toBe('Uroczystość');
  });

  it('switches months and reloads', async () => {
    repository.loadMonthAnnotations.mockResolvedValue([]);
    render(<MonthAnnotationsModal initialMonth={MONTH} onClose={vi.fn()} onSave={vi.fn()} />);
    await screen.findByText('Wrzesień 2026');
    fireEvent.click(screen.getByRole('button', { name: 'Następny miesiąc' }));
    expect(await screen.findByText('Październik 2026')).toBeTruthy();
    expect(repository.loadMonthAnnotations).toHaveBeenLastCalledWith('2026-10');
    fireEvent.click(screen.getByRole('button', { name: 'Poprzedni miesiąc' }));
    fireEvent.click(screen.getByRole('button', { name: 'Poprzedni miesiąc' }));
    expect(await screen.findByText('Sierpień 2026')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dziś' }));
    expect(repository.loadMonthAnnotations).toHaveBeenLastCalledWith(dateKey().slice(0, 7));
  });
});
