import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import EditRuleModal from '../src/components/EditRuleModal';
afterEach(cleanup);
it('edits a monthly combination, keeps errors editable, and saves successfully on retry', async () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const save = vi.fn().mockRejectedValueOnce(new Error('Brak połączenia')).mockResolvedValue(undefined);
  const close = vi.fn();
  render(<EditRuleModal rule={{id:'r',server_id:'s',day_of_week:0,time_slot:'10:30:00'}} onSave={save} onClose={close} />);
  fireEvent.change(screen.getByLabelText('Powtarzanie'), {target:{value:'monthly'}});
  fireEvent.click(screen.getByLabelText('Trzeci'));
  fireEvent.click(screen.getByRole('button',{name:'Zapisz dyżur'}));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent','Brak połączenia');
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Zapisz dyżur'}));
  await waitFor(()=>expect(close).toHaveBeenCalledOnce());
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({frequency:'monthly',month_weeks:[1,3]}));
});
