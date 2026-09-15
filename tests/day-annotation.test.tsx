import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import DayAnnotationModal from '../src/components/DayAnnotationModal';
afterEach(cleanup);
it('saves a day label and allows clearing it',async()=>{
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 const save=vi.fn().mockResolvedValue(undefined);
 render(<DayAnnotationModal day="2026-11-01" label="" onClose={vi.fn()} onSave={save}/>);
 fireEvent.click(screen.getByRole('button',{name:'Uroczystość'}));
 fireEvent.click(screen.getByRole('button',{name:'Zapisz oznaczenie'}));
 await waitFor(()=>expect(save).toHaveBeenCalledWith('Uroczystość'));
 fireEvent.click(screen.getByRole('button',{name:'Wyczyść'}));
 fireEvent.click(screen.getByRole('button',{name:'Zapisz oznaczenie'}));
 await waitFor(()=>expect(save).toHaveBeenLastCalledWith(''));
});
