import { useEffect, useState } from 'react';
import { ChevronDown, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import type { AltarServer, AdminSession } from '../types/database';

const STORAGE_KEY = 'liturgy.active-server';

export function readSelectedServer(): string {
  try { return localStorage.getItem(STORAGE_KEY) ?? ''; } catch { return ''; }
}

interface Props {
  servers: AltarServer[];
  selectedId: string;
  onChange: (id: string) => void;
  adminSession: AdminSession | null;
  onAdminToggle: () => void;
}

export default function UserSelector({ servers, selectedId, onChange, adminSession, onAdminToggle }: Props) {
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) onChange(event.newValue ?? '');
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [onChange]);

  function select(id: string) {
    onChange(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
      setStorageError(false);
    } catch { setStorageError(true); }
  }

  return <div className="user-selector-wrap">
    <div className="user-selector">
      <span className="user-icon"><UserRound size={20} strokeWidth={1.7} /></span>
      <div className="user-select-field">
          <select id="active-server" aria-label="Wybierz ministranta" value={servers.some(s => s.id === selectedId) ? selectedId : ''}
            onChange={event => select(event.target.value)}>
            <option value="">Wybierz ministranta</option>
            {servers.map(server => <option key={server.id} value={server.id}>{server.name} · {server.rank}</option>)}
          </select>
          <ChevronDown size={15} aria-hidden="true" />
      </div>
      <button type="button" className={`admin-toggle-btn ${adminSession ? 'active' : ''}`} onClick={onAdminToggle} aria-label={adminSession ? 'Wyłącz tryb admina' : 'Administrator'} title={adminSession ? 'Wyłącz tryb administratora' : 'Włącz tryb administratora'}>
        {adminSession ? <LogOut size={15} /> : <ShieldCheck size={15} />}
        <span>{adminSession ? 'Wyłącz tryb admina' : 'Administrator'}</span>
      </button>
    </div>
    {storageError && <p className="text-xs text-amber-800" role="status">Wybór działa, ale przeglądarka nie pozwala go zapamiętać.</p>}
  </div>;
}
