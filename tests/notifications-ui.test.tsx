import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
const api=vi.hoisted(()=>({installedApp:vi.fn(()=>false),loadPushPreferences:vi.fn(),savePushPreferences:vi.fn()}));
vi.mock('../src/lib/push',()=>api);
import AppNotifications from '../src/components/AppNotifications';
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('does not show notification preferences in a normal browser tab',()=>{
 api.installedApp.mockReturnValue(false);
 render(<AppNotifications servers={[]} selectedId=""/>);
 expect(screen.queryByRole('button',{name:'Powiadomienia'})).toBeNull();
 expect(screen.queryByRole('button',{name:'Zainstaluj aplikację'})).toBeNull();
 expect(api.loadPushPreferences).not.toHaveBeenCalled();
});
it('loads and saves independent choices only in the installed app',async()=>{
 api.installedApp.mockReturnValue(true);api.loadPushPreferences.mockResolvedValue(null);api.savePushPreferences.mockResolvedValue(undefined);
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 render(<AppNotifications servers={[{id:'jan',name:'Jan',rank:'Lektor'}]} selectedId="jan"/>);
 fireEvent.click(screen.getByRole('button',{name:'Powiadomienia'}));
 await waitFor(()=>expect((screen.getByRole('button',{name:'Zapisz ustawienia'}) as HTMLButtonElement).disabled).toBe(false));
 fireEvent.click(screen.getByLabelText(/Moja służba/));
 fireEvent.click(screen.getByLabelText(/Nabożeństwo bez zapisanych osób/));
 fireEvent.click(screen.getByRole('button',{name:'Zapisz ustawienia'}));
 await waitFor(()=>expect(api.savePushPreferences).toHaveBeenCalledWith({server_id:'jan',own:true,empty_mass:false,empty_devotion:true}));
});
