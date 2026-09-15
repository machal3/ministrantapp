import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import Modal from './Modal';
import type { AltarServer } from '../types/database';
import { installedApp, loadPushPreferences, savePushPreferences, type PushPreferences } from '../lib/push';
export default function AppNotifications({ servers, selectedId }: {servers:AltarServer[];selectedId:string}) {
 const [installed,setInstalled]=useState(installedApp);
 const [open,setOpen]=useState(false);
 useEffect(()=>{
   const media=window.matchMedia?.('(display-mode: standalone)');
   const update=()=>setInstalled(installedApp());
   media?.addEventListener('change',update);window.addEventListener('appinstalled',update);
   return ()=>{media?.removeEventListener('change',update);window.removeEventListener('appinstalled',update);};
 },[]);
 if (!installed) return null;
 return <>
 <button type="button" className="button secondary app-notifications-button" aria-haspopup="dialog" onClick={()=>setOpen(true)}><Bell size={18} aria-hidden="true"/><span>Powiadomienia</span></button>
 {installed&&open&&<NotificationSettings servers={servers} selectedId={selectedId} onClose={()=>setOpen(false)}/>}
 </>;
}
function NotificationSettings({servers,selectedId,onClose}:{servers:AltarServer[];selectedId:string;onClose:()=>void}) {
 const [prefs,setPrefs]=useState<PushPreferences>({server_id:selectedId||null,own:false,empty_mass:false,empty_devotion:false});
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');const lock=useRef(false);
 useEffect(()=>{let active=true;loadPushPreferences().then(saved=>{if(active){if(saved)setPrefs(saved);setLoading(false);}}).catch(()=>{if(active)setError('Nie udało się odczytać ustawień. Zamknij okno i spróbuj ponownie.');});return()=>{active=false;};},[]);
 return <Modal title="Powiadomienia" onClose={onClose} busy={busy}>
 <p className="rule-intro">Wybierz powiadomienia dla tego urządzenia. Wysyłamy je około 30 minut przed rozpoczęciem.</p>
 <form onSubmit={async e=>{e.preventDefault();if(lock.current||loading)return;lock.current=true;setBusy(true);setError('');setSuccess('');try{await savePushPreferences(prefs);setSuccess('Zapisano ustawienia powiadomień.');}catch(c){setError(c instanceof Error?c.message:'Nie udało się zapisać.');}finally{lock.current=false;setBusy(false);}}}>
 <fieldset className="notification-options" disabled={loading||busy}>
 <label className="field">Powiadomienia dla ministranta<select value={prefs.server_id??''} onChange={e=>setPrefs({...prefs,server_id:e.target.value||null})}><option value="">Wybierz ministranta</option>{servers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
 <p className="rule-help">Ten wybór dotyczy powiadomień na tym urządzeniu. Zmiana imienia w grafiku go nie zmienia.</p>
 {([{key:'own',title:'Moja służba',description:'Msza, nabożeństwo lub inne wydarzenie, na które jesteś zapisany — także w ramach stałego dyżuru.'},{key:'empty_mass',title:'Msza bez zapisanych osób',description:'Gdy na Mszę Świętą nikt się jeszcze nie zapisał.'},{key:'empty_devotion',title:'Nabożeństwo bez zapisanych osób',description:'Gdy na nabożeństwo nikt się jeszcze nie zapisał.'}] as const).map(option=><label className="notification-option" key={option.key}><input type="checkbox" checked={prefs[option.key]} onChange={e=>setPrefs({...prefs,[option.key]:e.target.checked})}/><span><strong>{option.title}</strong><small>{option.description}</small></span></label>)}
 </fieldset>
 <p className="rule-help">Odznacz wszystkie opcje, aby wyłączyć powiadomienia. Dostarczenie zależy od połączenia i ustawień telefonu.</p>
 {error&&<p className="form-error" role="alert">{error}</p>}{success&&<p className="info-banner" role="status">{success}</p>}
 <div className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Zamknij</button><button className="button primary" disabled={busy||loading}>{busy?'Zapisywanie…':'Zapisz ustawienia'}</button></div>
 </form></Modal>;
}
