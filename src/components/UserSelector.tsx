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
  const [fullOpen, setFullOpen] = useState(false);
  const [compactOpen, setCompactOpen] = useState(false);
  const activeServer = servers.find(s => s.id === selectedId);
  const initials = activeServer
    ? activeServer.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : '';
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) onChange(event.newValue ?? '');
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [onChange]);

  useEffect(() => {
    if (!compactOpen && !fullOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setCompactOpen(false); setFullOpen(false); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [compactOpen, fullOpen]);

  function select(id: string) {
    onChange(id);
    setCompactOpen(false);
    setFullOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, id);
      setStorageError(false);
    } catch { setStorageError(true); }
  }

  function renderOptions() {
    return <>
      <button type="button" role="option" aria-selected={!selectedId} className={`compact-option ${!selectedId ? 'selected' : ''}`} onClick={() => select('')}>
        <span className="avatar" aria-hidden="true"><UserRound size={14} /></span>
        <span className="compact-option-text"><strong>Wybierz ministranta</strong><small>Brak wyboru</small></span>
      </button>
      {servers.map(server => {
        const tag = server.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
        const selected = server.id === selectedId;
        return <button key={server.id} type="button" role="option" aria-selected={selected} className={`compact-option ${selected ? 'selected' : ''}`} onClick={() => select(server.id)}>
          <span className={`avatar ${selected ? 'own-avatar' : ''}`} aria-hidden="true">{tag}</span>
          <span className="compact-option-text"><strong>{server.name}</strong><small>{server.rank}</small></span>
        </button>;
      })}
    </>;
  }

  return <div className="user-selector-wrap">
    <div className="user-selector user-selector--full">
      <div className="user-select-custom">
        <button
          type="button"
          className="user-select-trigger"
          onClick={() => { setCompactOpen(false); setFullOpen(open => !open); }}
          aria-haspopup="listbox"
          aria-expanded={fullOpen}
          aria-label={activeServer ? `Wybrano: ${activeServer.name}. Zmień ministranta` : 'Wybierz ministranta'}
          title={activeServer ? activeServer.name : 'Wybierz ministranta'}
        >
          <span className={`user-trigger-avatar ${activeServer ? 'has-selection' : ''}`} aria-hidden="true">
            {activeServer ? initials : <UserRound size={18} strokeWidth={1.7} />}
          </span>
          <span className="user-trigger-text">
            <strong>{activeServer ? activeServer.name : 'Wybierz ministranta'}</strong>
            <small>{activeServer ? activeServer.rank : 'Kto dziś służy?'}</small>
          </span>
          <ChevronDown size={15} aria-hidden="true" className={fullOpen ? 'chevron-open' : ''} />
        </button>
        {fullOpen && <>
          <button type="button" className="compact-backdrop" aria-label="Zamknij wybór ministranta" onClick={() => setFullOpen(false)} tabIndex={-1} />
          <div className="compact-panel compact-panel--full" role="listbox" aria-label="Wybierz ministranta">
            {renderOptions()}
          </div>
        </>}
      </div>
      <button type="button" className={`admin-toggle-btn ${adminSession ? 'active' : ''}`} onClick={onAdminToggle} aria-label={adminSession ? 'Wyłącz tryb admina' : 'Administrator'} title={adminSession ? 'Wyłącz tryb administratora' : 'Włącz tryb administratora'}>
        {adminSession ? <LogOut size={15} /> : <ShieldCheck size={15} />}
        <span>{adminSession ? 'Wyłącz tryb admina' : 'Administrator'}</span>
      </button>
    </div>

    <div className="user-selector-compact">
      <button
        type="button"
        className={`compact-avatar ${activeServer ? 'has-selection' : ''}`}
        onClick={() => setCompactOpen(open => !open)}
        aria-label={activeServer ? `Wybrano: ${activeServer.name}. Zmień ministranta` : 'Wybierz ministranta'}
        aria-expanded={compactOpen}
        title={activeServer ? activeServer.name : 'Wybierz ministranta'}
      >
        {activeServer ? initials : <UserRound size={18} strokeWidth={1.7} />}
      </button>
      <button
        type="button"
        className={`compact-admin-btn ${adminSession ? 'active' : ''}`}
        onClick={onAdminToggle}
        aria-label={adminSession ? 'Wyłącz tryb admina' : 'Administrator'}
        title={adminSession ? 'Wyłącz tryb administratora' : 'Włącz tryb administratora'}
      >
        {adminSession ? <LogOut size={17} /> : <ShieldCheck size={17} />}
      </button>
      {compactOpen && <>
        <button type="button" className="compact-backdrop" aria-label="Zamknij wybór ministranta" onClick={() => setCompactOpen(false)} tabIndex={-1} />
        <div className="compact-panel" role="listbox" aria-label="Wybierz ministranta">
          {renderOptions()}
        </div>
      </>}
    </div>
    {storageError && <p className="text-xs text-amber-800" role="status">Wybór działa, ale przeglądarka nie pozwala go zapamiętać.</p>}
  </div>;
}
