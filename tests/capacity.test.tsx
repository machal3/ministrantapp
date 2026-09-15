import { expect, it, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { peopleWord } from '../src/lib/people';
import MassCard from '../src/components/MassCard';
import AddMassModal from '../src/components/AddMassModal';
afterEach(cleanup);
it.each([[0,'osób'],[1,'osoba'],[2,'osoby'],[5,'osób'],[12,'osób'],[14,'osób'],[21,'osób'],[22,'osoby'],[112,'osób']])('inflects %s as %s', (n,word)=>expect(peopleWord(Number(n))).toBe(word));
it('shows an unbounded count without a full-capacity state',()=>{
 render(<MassCard mass={{id:'m',title:'Spotkanie',start_time:'2026-10-01T16:00:00Z',suggested_spots:null,is_extra:false}} attendees={[]} rules={[]} exceptions={[]} activeId="" busy={false} onAction={vi.fn()} onDelete={vi.fn()}/>);
 expect(screen.getByText('0 osób')).toBeTruthy();
 expect(screen.queryByText(/pełna obstawa/)).toBeNull();
});
it('submits null capacity when the optional-capacity checkbox is selected',async()=>{
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
 HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 const save=vi.fn().mockResolvedValue(undefined);
 render(<AddMassModal initialDate="2026-10-01" onClose={vi.fn()} onSubmit={save}/>);
 fireEvent.click(screen.getByLabelText('Bez określonej liczby osób'));
 fireEvent.click(screen.getByRole('button',{name:'Dodaj Mszę Świętą'}));
 await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({suggested_spots:null})));
});
