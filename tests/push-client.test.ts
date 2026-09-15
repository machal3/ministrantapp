import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../src/lib/supabase',()=>({supabase:{rpc}}));
import {loadPushPreferences,savePushPreferences} from '../src/lib/push';
const permission=vi.fn(),unsubscribe=vi.fn(),subscribe=vi.fn();
const subscription={endpoint:'https://fcm.googleapis.com/test',toJSON:()=>({keys:{auth:'auth',p256dh:'key'}}),unsubscribe};
beforeEach(()=>{
 localStorage.clear();rpc.mockReset().mockResolvedValue({data:null,error:null});permission.mockReset().mockResolvedValue('granted');unsubscribe.mockReset().mockResolvedValue(true);subscribe.mockReset().mockResolvedValue(subscription);
 const registration={pushManager:{getSubscription:vi.fn().mockResolvedValue(null),subscribe}};
 vi.stubGlobal('navigator',{standalone:true,serviceWorker:{register:vi.fn().mockResolvedValue(registration),ready:Promise.resolve(registration),getRegistration:vi.fn().mockResolvedValue({pushManager:{getSubscription:vi.fn().mockResolvedValue(subscription)}})}});
 vi.stubGlobal('isSecureContext',true);vi.stubGlobal('PushManager',class{});vi.stubGlobal('Notification',{requestPermission:permission});
 vi.stubEnv('VITE_VAPID_PUBLIC_KEY','public-key');
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();localStorage.clear();});
it('does not ask for permission when loading preferences',async()=>{await loadPushPreferences();expect(permission).not.toHaveBeenCalled();});
it('does not save or subscribe after permission is denied',async()=>{
 permission.mockResolvedValue('denied');
 await expect(savePushPreferences({server_id:'jan',own:true,empty_mass:false,empty_devotion:false})).rejects.toThrow('Brak zgody');
 expect(subscribe).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
});
it('deletes the backend subscription and unsubscribes without asking for permission when switched off',async()=>{
 localStorage.setItem('liturgy.push-device','80000000-0000-4000-8000-000000000001');
 await savePushPreferences({server_id:'jan',own:false,empty_mass:false,empty_devotion:false});
 expect(rpc).toHaveBeenCalledWith('remove_push_subscription',{p_token:'80000000-0000-4000-8000-000000000001'});expect(unsubscribe).toHaveBeenCalledOnce();expect(permission).not.toHaveBeenCalled();
});
it('registers only the chosen notification categories after consent',async()=>{
 await savePushPreferences({server_id:'jan',own:true,empty_mass:false,empty_devotion:true});
 expect(subscribe).toHaveBeenCalledWith({userVisibleOnly:true,applicationServerKey:'public-key'});
 expect(rpc).toHaveBeenCalledWith('save_push_subscription',expect.objectContaining({p_server:'jan',p_own:true,p_empty_mass:false,p_empty_devotion:true}));
});
it('replaces a subscription created with a previous VAPID key',async()=>{
 localStorage.setItem('liturgy.push-device','80000000-0000-4000-8000-000000000001');
 const registration=await navigator.serviceWorker.ready;
 vi.mocked(registration.pushManager.getSubscription).mockResolvedValue({...subscription,
   options:{applicationServerKey:new Uint8Array([1,2,3]).buffer,userVisibleOnly:true},
 } as unknown as PushSubscription);
 await savePushPreferences({server_id:'jan',own:true,empty_mass:false,empty_devotion:false});
 expect(unsubscribe).toHaveBeenCalledOnce();
 expect(subscribe).toHaveBeenCalledOnce();
 expect(rpc).toHaveBeenCalledWith('save_push_subscription',expect.anything());
});
it('identifies a missing notification migration',async()=>{
 rpc.mockResolvedValue({error:{code:'PGRST202',message:'missing function'}});
 await expect(savePushPreferences({server_id:'jan',own:true,empty_mass:false,empty_devotion:false})).rejects.toThrow('migrację powiadomień');
});
