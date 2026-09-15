import { useEffect, useRef, useState } from 'react';
import { Check, Search, ChevronDown, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import type { AltarServer, AdminSession } from '../types/database';

import Modal from './Modal';

const STORAGE_KEY = 'liturgy.active-server';

export function readSelectedServer(): string {
  try { return localStorage.getItem(STORAGE_KEY) ?? ''; } catch { return ''; }
}

interface Props {
  servers: AltarServer[];
  ready?: boolean;
  selectedId: string;
  onChange: (id: string) => void;
  adminSession: AdminSession | null;
  onAdminToggle: () => void;
}

export default function UserSelector({ servers, selectedId, onChange, adminSession, onAdminToggle, ready = true }: Props) {
  const [storageError, setStorageError] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const checkedInitialSelection = useRef(false);
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
    if (!ready || checkedInitialSelection.current) return;
    checkedInitialSelection.current = true;
    if (!activeServer) setOpen(true);
  }, [ready, activeServer]);

  function openPanel() {
    setQuery('');
    setOpen(true);
  }

  function closePanel() {
    checkedInitialSelection.current = true;
    setOpen(false);
  }

  function select(id: string) {
    onChange(id);
    closePanel();
    try {
      localStorage.setItem(STORAGE_KEY, id);
      setStorageError(false);
    } catch { setStorageError(true); }
  }

  const normalize = (value: string) => value.toLocaleLowerCase('pl').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');
  const filtered = servers.filter(server => normalize(server.name + ' ' + server.rank).includes(normalize(query.trim())));

  return <div className="user-selector-wrap">
    <div className="user-selector user-selector--full">
      <div className="user-select-custom">
        <button
          type="button"
          className="user-select-trigger"
          onClick={openPanel}
          aria-haspopup="dialog"
          aria-expanded={open}
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
          <ChevronDown size={15} aria-hidden="true" className={open ? 'chevron-open' : ''} />
        </button>

      </div>
      <button type="button" className={`admin-toggle-btn ${adminSession ? 'active' : ''}`} onClick={onAdminToggle} aria-label={adminSession ? 'Wyłącz tryb admina' : 'Administrator'} title={adminSession ? 'Wyłącz tryb administratora' : 'Włącz tryb administratora'}>
        {adminSession ? <LogOut size={15} /> : <ShieldCheck size={15} />}
        <span>{adminSession ? 'Wyłącz tryb admina' : 'Administrator'}</span>
      </button>
    </div>

    {open && <Modal title="Wybierz ministranta" onClose={closePanel} className="person-modal">
      <p className="person-intro">Wybierz siebie, aby zapisywać się na służby i zobaczyć swoje dyżury. Możesz też przeglądać grafik bez wyboru osoby.</p>
      <label className="person-search">
        <Search size={18} aria-hidden="true" />
        <input type="search" aria-label="Szukaj ministranta" placeholder="Szukaj po imieniu lub stopniu…" value={query} onChange={event => setQuery(event.target.value)} />
      </label>
      <div className="person-list" aria-label="Ministranci">
        {!ready ? <p className="person-empty" role="status">Wczytywanie listy ministrantów…</p> : filtered.length === 0 ? <p className="person-empty" role="status">{servers.length ? 'Nie znaleziono osoby. Spróbuj wpisać inne imię.' : 'Lista ministrantów jest na razie pusta.'}</p> : filtered.map(server => {
          const selected = server.id === selectedId;
          return <button key={server.id} type="button" className={`person-option ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={() => select(server.id)}>
            <span className={`avatar ${selected ? 'own-avatar' : ''}`} aria-hidden="true">{server.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}</span>
            <span className="person-option-text"><strong>{server.name}</strong><small>{server.rank}</small></span>
            {selected && <Check size={18} aria-hidden="true" />}
          </button>;
        })}
      </div>
      <div className="person-footer"><button type="button" className="button secondary" onClick={() => select('')}>Kontynuuj bez wyboru osoby</button><p>Osobę możesz zmienić w każdej chwili w nagłówku.</p></div>
    </Modal>}
    {storageError && <p className="text-xs text-amber-800" role="status">Wybór działa, ale przeglądarka nie pozwala go zapamiętać.</p>}
  </div>;
}
