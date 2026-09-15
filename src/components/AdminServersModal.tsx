import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { BarChart3, Check, Edit2, LoaderCircle, Plus, Repeat2, Save, Search, Trash2, UserPlus, Users } from 'lucide-react';
import Modal from './Modal';
import { DAY_SHORT } from '../lib/dates';
import { RANKS } from '../types/database';
import type { AltarServer, EffectiveAttendee, Rank, RecurringRule } from '../types/database';

interface Props {
  servers: AltarServer[];
  rules: RecurringRule[];
  attendees: EffectiveAttendee[];
  recentAttendance?: Record<string, number>;
  onClose: () => void;
  onSave: (server: AltarServer) => Promise<void>;
  onAdd: (server: Omit<AltarServer, 'id'>) => Promise<string>;
  onDelete: (id: string) => Promise<void>;
}

export default function AdminServersModal({ servers, rules, attendees, recentAttendance, onClose, onSave, onAdd, onDelete }: Props) {
  const [tab, setTab] = useState<'list' | 'add' | 'stats'>('list');
  const [search, setSearch] = useState('');
  const [rankFilter, setRankFilter] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);

  // New server form state
  const [newName, setNewName] = useState('');
  const [newRank, setNewRank] = useState<Rank>('Ministrant');

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editRank, setEditRank] = useState<Rank>('Ministrant');

  function startEdit(server: AltarServer) {
    setEditingId(server.id);
    setEditName(server.name);
    setEditRank(server.rank);
    setError('');
    setNotice('');
  }

  function cancelEdit() {
    setEditingId(null);
    setError('');
  }

  async function handleAddSubmit(e: FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    const name = newName.trim();
    if (!name) { setError('Wpisz imię i nazwisko ministranta.'); return; }
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await onAdd({ name, rank: newRank });
      setNotice(`Dodano ministranta: ${name}.`);
      setNewName('');
      setNewRank('Ministrant');
      setTab('list');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nie udało się dodać ministranta.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function handleEditSubmit(e: FormEvent, id: string) {
    e.preventDefault();
    if (lock.current) return;
    const name = editName.trim();
    if (!name) { setError('Wpisz imię i nazwisko.'); return; }
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await onSave({ id, name, rank: editRank });
      setNotice(`Zapisano dane: ${name}.`);
      setEditingId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nie udało się zaktualizować danych.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await onDelete(id);
      setNotice('Ministrant został usunięty.');
      setDeletingId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nie udało się usunąć ministranta.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  // Statistics calculation
  const stats = useMemo(() => {
    const totalServers = servers.length;
    const serversWithRules = new Set(rules.map(r => r.server_id)).size;

    // Activity counts in the last 30 days
    const attendanceCount = recentAttendance ?? attendees.reduce<Record<string, number>>((acc, a) => {
      acc[a.server_id] = (acc[a.server_id] ?? 0) + 1;
      return acc;
    }, {});

    // Active servers ranked by attendance
    const topActive = [...servers]
      .map(s => ({
        server: s,
        count: attendanceCount[s.id] ?? 0,
        rulesCount: rules.filter(r => r.server_id === s.id).length,
      }))
      .sort((a, b) => b.count - a.count || b.rulesCount - a.rulesCount || a.server.name.localeCompare(b.server.name, 'pl'));

    return { totalServers, serversWithRules, topActive, totalRules: rules.length };
  }, [servers, rules, attendees, recentAttendance]);


  // Filtered servers
  const filteredServers = useMemo(() => {
    return servers.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase());
      const matchesRank = rankFilter === 'all' || s.rank === rankFilter;
      return matchesSearch && matchesRank;
    });
  }, [servers, search, rankFilter]);

  return <Modal title="Zarządzanie ministrantami" onClose={onClose} busy={busy}>
    <div className="recurrence-mode-tabs mb-4">
      <button
        type="button"
        className={`recurrence-tab ${tab === 'list' ? 'active' : ''}`}
        onClick={() => { setTab('list'); setError(''); }}
        disabled={busy}
      >
        <Users size={15} /> Lista ({servers.length})
      </button>
      <button
        type="button"
        className={`recurrence-tab ${tab === 'add' ? 'active' : ''}`}
        onClick={() => { setTab('add'); setError(''); }}
        disabled={busy}
      >
        <UserPlus size={15} /> + Dodaj ministranta
      </button>
      <button
        type="button"
        className={`recurrence-tab ${tab === 'stats' ? 'active' : ''}`}
        onClick={() => { setTab('stats'); setError(''); }}
        disabled={busy}
      >
        <BarChart3 size={15} /> Statystyki służby
      </button>
    </div>

    {notice && <p className="mb-3 text-xs text-[var(--green)] flex items-center gap-1 font-medium" role="status"><Check size={14} />{notice}</p>}
    {error && <p className="form-error mb-3" role="alert">{error}</p>}

    {tab === 'list' && (
      <div className="servers-list-view">
        <div className="servers-filter-bar mb-3">
          <div className="search-field">
            <Search size={15} className="search-icon" />
            <input
              type="search"
              placeholder="Szukaj ministranta…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="rank-filter-pills">
            <button
              type="button"
              className={`rank-pill ${rankFilter === 'all' ? 'active' : ''}`}
              onClick={() => setRankFilter('all')}
            >
              Wszyscy
            </button>
            {RANKS.map(r => (
              <button
                type="button"
                key={r}
                className={`rank-pill ${rankFilter === r ? 'active' : ''}`}
                onClick={() => setRankFilter(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {filteredServers.length === 0 ? (
          <p className="text-sm text-[var(--muted)] py-6 text-center">
            {servers.length === 0 ? 'Brak ministrantów. Dodaj pierwszego ministranta.' : 'Nie znaleziono ministrantów dla podanych filtrów.'}
          </p>
        ) : (
          <ul className="servers-cards-list">
            {filteredServers.map(server => {
              const serverRules = rules.filter(r => r.server_id === server.id);
              const serverAttendances = (recentAttendance ? recentAttendance[server.id] : attendees.filter(a => a.server_id === server.id).length) ?? 0;
              const isEditing = editingId === server.id;
              const isDeleting = deletingId === server.id;

              return (
                <li key={server.id} className="server-admin-card">
                  {isEditing ? (
                    <form onSubmit={e => handleEditSubmit(e, server.id)} className="server-edit-inline">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                        <label className="field">Imię i nazwisko
                          <input
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            maxLength={100}
                            required
                            autoFocus
                            disabled={busy}
                          />
                        </label>
                        <label className="field">Stopień
                          <select
                            value={editRank}
                            onChange={e => setEditRank(e.target.value as Rank)}
                            disabled={busy}
                          >
                            {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </label>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button type="button" className="button secondary" onClick={cancelEdit} disabled={busy}>Anuluj</button>
                        <button type="submit" className="button primary" disabled={busy}>
                          {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />} Zapisz
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="server-card-content">
                      <div className="server-card-info">
                        <div className="server-header-row">
                          <span className="server-avatar" aria-hidden="true">
                            {server.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                          </span>
                          <div>
                            <strong>{server.name}</strong>
                            <span className="server-rank-badge">{server.rank}</span>
                          </div>
                        </div>

                        <div className="server-stats-pills">
                          <span title="Stałe dyżury co tydzień">
                            <Repeat2 size={13} />
                            {serverRules.length === 0
                              ? 'Brak stałych dyżurów'
                              : `${serverRules.length} ${serverRules.length === 1 ? 'stały dyżur' : 'stałe dyżury'} (${serverRules.map(r => `${DAY_SHORT[r.day_of_week]} ${r.time_slot.slice(0, 5)}`).join(', ')})`}
                          </span>
                          <span title="Służby w ciągu ostatniego miesiąca (30 dni)">
                            <Users size={13} /> {serverAttendances} {serverAttendances === 1 ? 'służba (ost. 30 dni)' : 'służb (ost. 30 dni)'}
                          </span>
                        </div>
                      </div>

                      <div className="server-card-actions">
                        {isDeleting ? (
                          <div className="delete-confirm-box">
                            <span className="text-xs text-red-700">Usunąć {server.name}?</span>
                            <div className="flex gap-1 mt-1">
                              <button type="button" className="button secondary text-xs py-1 px-2" onClick={() => setDeletingId(null)} disabled={busy}>Nie</button>
                              <button type="button" className="button danger text-xs py-1 px-2" onClick={() => handleDelete(server.id)} disabled={busy}>
                                {busy ? <LoaderCircle size={12} className="animate-spin" /> : 'Tak, usuń'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="icon-button"
                              title="Edytuj ministranta"
                              onClick={() => startEdit(server)}
                              disabled={busy}
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              type="button"
                              className="icon-button delete-icon"
                              title="Usuń ministranta"
                              onClick={() => setDeletingId(server.id)}
                              disabled={busy}
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    )}

    {tab === 'add' && (
      <form onSubmit={handleAddSubmit} className="space-y-4">
        <div className="field">
          <label htmlFor="new-server-name">Imię i nazwisko nowego ministranta</label>
          <input
            id="new-server-name"
            placeholder="np. Jan Kowalski"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            maxLength={100}
            required
            autoFocus
            disabled={busy}
          />
        </div>

        <div className="field">
          <label htmlFor="new-server-rank">Stopień liturgiczny</label>
          <select
            id="new-server-rank"
            value={newRank}
            onChange={e => setNewRank(e.target.value as Rank)}
            disabled={busy}
          >
            {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <span className="field-hint">Dostępne stopnie: Kandydat, Ministrant, Lektor, Ceremoniarz, Szafarz.</span>
        </div>

        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={() => setTab('list')} disabled={busy}>Anuluj</button>
          <button type="submit" className="button primary" disabled={busy || !newName.trim()}>
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}
            Dodaj ministranta
          </button>
        </div>
      </form>
    )}

    {tab === 'stats' && (
      <div className="servers-stats-tab space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="stat-card">
            <span className="stat-label">Wspólnota</span>
            <strong className="stat-value">{stats.totalServers}</strong>
            <span className="stat-sub">ministrantów</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Stałe dyżury</span>
            <strong className="stat-value">{stats.serversWithRules}<small>/{stats.totalServers}</small></strong>
            <span className="stat-sub">{stats.totalServers ? Math.round((stats.serversWithRules / stats.totalServers) * 100) : 0}% osób z dyżurem</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Wszystkie reguły</span>
            <strong className="stat-value">{stats.totalRules}</strong>
            <span className="stat-sub">dyżurów tygodniowo</span>
          </div>
        </div>

        <div className="stat-section">
          <h4>Aktywność w ciągu ostatniego miesiąca (30 dni)</h4>
          <ul className="active-ranking-list space-y-2">
            {stats.topActive.slice(0, 5).map(({ server, count, rulesCount }) => (
              <li key={server.id} className="active-ranking-item">
                <span className="ranking-name font-medium text-xs">{server.name} <small className="text-[var(--muted)]">({server.rank})</small></span>
                <span className="ranking-score text-xs">
                  <strong>{count}</strong> {count === 1 ? 'służba' : 'służb'} · {rulesCount} {rulesCount === 1 ? 'stały dyżur' : 'stałe dyżury'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={() => setTab('list')}>Wróć do listy</button>
        </div>
      </div>
    )}
  </Modal>;
}
