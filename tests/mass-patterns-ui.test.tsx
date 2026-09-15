import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AddMassModal from '../src/components/AddMassModal';
afterEach(cleanup);
it('applies first Friday preset, allows combinations, and submits the exact pattern', async () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const save=vi.fn().mockResolvedValue(6);
  render(<AddMassModal initialDate="2026-01-01" onClose={vi.fn()} onSubmit={vi.fn()} onSubmitRecurring={save}/>);
  fireEvent.click(screen.getByRole('button',{name:'Seria regularna (kalendarz)'}));
  fireEvent.click(screen.getByRole('button',{name:'Pierwszy piątek'}));
  expect((screen.getByLabelText('Rytm serii') as HTMLSelectElement).value).toBe('monthly');
  expect(screen.getByRole('button',{name:'Pt'}).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByLabelText('Trzecie'));
  fireEvent.click(screen.getByRole('button',{name:/^Utwórz /}));
  await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({frequency:'monthly',days:[5],month_weeks:[1,3]})));
});
