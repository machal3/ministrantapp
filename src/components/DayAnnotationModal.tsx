import { useRef, useState } from 'react';
import Modal from './Modal';
import { polishDate } from '../lib/dates';
export default function DayAnnotationModal({ day, label, onClose, onSave }: {day:string;label:string;onClose:()=>void;onSave:(label:string)=>Promise<void>}) {
 const [value,setValue]=useState(label),[busy,setBusy]=useState(false),[error,setError]=useState(''); const lock=useRef(false);
 return <Modal title="Oznacz dzień" onClose={onClose} busy={busy}>
 <p className="rule-intro">{polishDate(day,{weekday:'long',day:'numeric',month:'long',year:'numeric'})} — oznaczenie dotyczy całego dnia.</p>
 <form onSubmit={async e=>{e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await onSave(value);onClose();}catch(c){setError(c instanceof Error?c.message:'Nie udało się zapisać.');}finally{lock.current=false;setBusy(false);}}}>
 <label className="field">Oznaczenie dnia<input value={value} maxLength={120} disabled={busy} onChange={e=>setValue(e.target.value)} placeholder="np. Uroczystość Wszystkich Świętych"/></label>
 <div className="preset-chips">{['Uroczystość','Święto','Wspomnienie','Wspomnienie dowolne','Niedziela'].map(text=><button type="button" key={text} disabled={busy} onClick={()=>setValue(text)}>{text}</button>)}</div>
 <p className="rule-help">Możesz dopisać nazwę obchodu. Puste pole usuwa oznaczenie.</p>
 {error&&<p className="form-error" role="alert">{error}</p>}
 <div className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={()=>setValue('')}>Wyczyść</button><button className="button primary" disabled={busy}>Zapisz oznaczenie</button></div>
 </form></Modal>;
}
