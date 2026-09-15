import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AddMassModal from '../src/components/AddMassModal';
import EditMassModal from '../src/components/EditMassModal';
import MassCard from '../src/components/MassCard';
afterEach(cleanup);
function dialogs() {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
}
it('creates a single event in the other category', async () => {
  dialogs(); const save=vi.fn().mockResolvedValue(undefined);
  render(<AddMassModal initialDate="2026-10-01" onClose={vi.fn()} onSubmit={save}/>);
  fireEvent.click(screen.getByRole('button',{name:'Inne'}));
  expect(screen.getByLabelText('Nazwa wydarzenia')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Dodaj wydarzenie'}));
  await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({category:'other',is_extra:false})));
});
it('preserves other category when editing and renders a text-only category on its card', async () => {
  dialogs(); const save=vi.fn().mockResolvedValue(1);
  const mass={id:'other',title:'Zbiórka',start_time:'2026-10-01T16:00:00Z',suggested_spots:4,is_extra:false,category:'other' as const};
  const {unmount}=render(<EditMassModal mass={mass} onClose={vi.fn()} onSave={save}/>);
  fireEvent.click(screen.getByRole('button',{name:'Zapisz zmiany'}));
  await waitFor(()=>expect(save).toHaveBeenCalledWith('other',expect.objectContaining({category:'other'})));
  unmount();
  render(<MassCard mass={mass} attendees={[]} rules={[]} exceptions={[]} activeId="" busy={false} onAction={vi.fn()} onDelete={vi.fn()} isAdmin/>);
  expect(screen.getByText('INNE').querySelector('svg')).toBeNull();
  expect(screen.getByRole('button',{name:/Usuń wydarzenie/})).toBeTruthy();
});
