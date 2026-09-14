import { useEffect, useState } from 'react';
import { ChevronDown, UserRound } from 'lucide-react';
import type { AltarServer } from '../types/database';

const STORAGE_KEY = 'liturgy.active-server';

export function readSelectedServer(): string {
  try { return localStorage.getItem(STORAGE_KEY) ?? ''; } catch { return ''; }
}

interface Props {
  servers: AltarServer[];
  selectedId: string;
  onChange: (id: string) => void;
}

export default function UserSelector({ servers, selectedId, onChange }: Props) {
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
      <div className="min-w-0 flex-1">
        <label htmlFor="active-server">Służę jako</label>
        <div className="relative">
          <select id="active-server" value={servers.some(s => s.id === selectedId) ? selectedId : ''}
            onChange={event => select(event.target.value)}>
            <option value="">Wybierz ministranta</option>
            {servers.map(server => <option key={server.id} value={server.id}>{server.name} · {server.rank}</option>)}
          </select>
          <ChevronDown size={15} className="pointer-events-none absolute right-0 top-1.5" />
        </div>
      </div>
    </div>
    {storageError && <p className="text-xs text-amber-800" role="status">Wybór działa, ale przeglądarka nie pozwala go zapamiętać.</p>}
  </div>;
}
