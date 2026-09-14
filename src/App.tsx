import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, CalendarDays, CalendarPlus, Check, Church, CircleHelp, HeartHandshake, LoaderCircle, Plus, RefreshCw, Repeat2, Trash2, Users, X, ShieldCheck, LogOut } from 'lucide-react';
import UserSelector, { readSelectedServer } from './components/UserSelector';
import WeekNavigator from './components/WeekNavigator';
import DaySelector from './components/DaySelector';
import MassCard from './components/MassCard';
import type { MassAction } from './components/MassCard';
import AddMassModal from './components/AddMassModal';
import Modal from './components/Modal';
import AdminLoginModal from './components/AdminLoginModal';
import AdminServersModal from './components/AdminServersModal';
import EditMassTimeModal from './components/EditMassTimeModal';
import { logoutAdmin } from './lib/admin';
import { dateKey, DAY_NAMES, monday, polishDate, shiftDate, timeSlot, weekday } from './lib/dates';
import { matchesRule } from './lib/attendance';
import { addMass, addRecurringMasses, addRule, deleteMass, deleteRule, loadWeek, removeAttendance, setAttendance, subscribe, updateServer, updateMassTime } from './lib/repository';
import type { SyncStatus } from './lib/repository';
import { isDemo } from './lib/supabase';
import type { AdminSession, AltarServer, Mass, NewMass, RecurringMassesInput, RecurringRule, ScheduleData } from './types/database';

const EMPTY: ScheduleData = { servers: [], masses: [], rules: [], exceptions: [], attendees: [] };
type Confirmation = { kind: 'mass'; mass: Mass } | { kind: 'rule'; rule: RecurringRule };

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Nie udało się wykonać operacji. Spróbuj ponownie.';
}

export default function App() {
  const [week, setWeek] = useState(() => monday());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(readSelectedServer);
  const [snapshot, setSnapshot] = useState<{ week: string; data: ScheduleData } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('connecting');
  const [adding, setAdding] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [deleteScope, setDeleteScope] = useState<'single' | 'future'>('single');
  const [busy, setBusy] = useState(false);
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [editingServers, setEditingServers] = useState(false);
  const [editingMass, setEditingMass] = useState<Mass | null>(null);
  const mutationLock = useRef(false);
  const requestId = useRef(0);
  const data = snapshot?.week === week ? snapshot.data : EMPTY;
  const servers = snapshot?.data.servers ?? [];
  const activeServer = servers.find(server => server.id === selectedId);
  const activeId = activeServer?.id ?? '';

  useEffect(() => {
    if (!adminSession) return;
    const expire = () => {
      if (Date.parse(adminSession.expires_at) <= Date.now()) {
        setAdminSession(null);
        setEditingServers(false); setEditingMass(null); setAdding(false);
        setConfirmation(current => current?.kind === 'mass' ? null : current);
        setNotice('Sesja administratora wygasła. Aby edytować, wpisz PIN ponownie.');
      }
    };
    const timer = window.setTimeout(expire, Math.max(0, Date.parse(adminSession.expires_at) - Date.now()));
    window.addEventListener('focus', expire);
    return () => { window.clearTimeout(timer); window.removeEventListener('focus', expire); };
  }, [adminSession]);

  async function leaveAdmin() {
    const session = adminSession;
    setAdminSession(null);
    setEditingServers(false); setEditingMass(null); setAdding(false);
    setConfirmation(current => current?.kind === 'mass' ? null : current);
    if (session) {
      try { await logoutAdmin(session); }
      catch { setActionError('Tryb administratora wyłączono w tej karcie. Brak połączenia uniemożliwił unieważnienie sesji w bazie; wygaśnie po 30 minutach od logowania.'); }
    }
  }

  const refresh = useCallback(async () => {
    const request = ++requestId.current;
    try {
      const next = await loadWeek(week);
      if (request === requestId.current) { setSnapshot({ week, data: next }); setLoadError(''); }
    } catch (error) {
      if (request === requestId.current) setLoadError(messageFrom(error));
    } finally { if (request === requestId.current) setLoading(false); }
  }, [week]);

  const latestRefresh = useRef(refresh);
  useEffect(() => { latestRefresh.current = refresh; }, [refresh]);

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    void refresh();
    let debounce: number | undefined;
    const unsubscribe = subscribe(() => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => void refresh(), 150);
    }, setSyncStatus);
    return () => { ++requestId.current; unsubscribe(); window.clearTimeout(debounce); };
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 5500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function changeWeek(next: string) { setWeek(next); setSelectedDay(null); }

  async function mutate(action: () => Promise<void>, success: string): Promise<boolean> {
    if (mutationLock.current) return false;
    mutationLock.current = true;
    setBusy(true);
    setActionError('');
    try {
      await action();
      setNotice(success);
      await latestRefresh.current();
      return true;
    } catch (error) { setActionError(messageFrom(error)); return false; }
    finally { mutationLock.current = false; setBusy(false); }
  }

  async function handleAction(mass: Mass, action: MassAction) {
    if (!activeId) return;
    const serverId = activeId;
    const hasRule = data.rules.some(rule => rule.server_id === serverId && matchesRule(mass, rule));
    const messages: Record<MassAction, string> = {
      single: 'Zapisano Cię na nabożeństwo. Do zobaczenia!',
      recurring: 'Stały dyżur został ustawiony. Obowiązuje również dla nowych terminów.',
      withdraw: 'Usunięto Twój jednorazowy zapis.',
      excuse: 'Zgłoszono nieobecność tylko w tym terminie. Twój stały dyżur pozostaje aktywny.',
      restore: 'Twoja obecność została przywrócona.',
    };
    await mutate(async () => {
      if (action === 'recurring') await addRule({ server_id: serverId, day_of_week: weekday(dateKey(mass.start_time)), time_slot: timeSlot(mass.start_time) });
      else if (action === 'withdraw' || (action === 'restore' && hasRule)) await removeAttendance(mass.id, serverId);
      else await setAttendance(mass.id, serverId, action === 'excuse' ? 'excused' : 'single');
    }, messages[action]);
  }

  async function handleAdd(mass: NewMass) {
    await addMass(mass, adminSession);
    const day = dateKey(mass.start_time);
    setNotice('Dodano nabożeństwo. Stałe dyżury są już uwzględnione.');
    if (monday(day) !== week) setWeek(monday(day));
    else await refresh();
    setSelectedDay(day);
  }

  async function handleAddRecurring(input: RecurringMassesInput): Promise<number> {
    const count = await addRecurringMasses(input, adminSession);
    setNotice(`Utworzono serię nabożeństw (${count} ${count === 1 ? 'termin' : count < 5 ? 'terminy' : 'terminów'}). Stałe dyżury są już uwzględnione.`);
    await latestRefresh.current();
    return count;
  }

  async function handleServerEdit(server: AltarServer) {
    await updateServer(server, adminSession);
    await latestRefresh.current();
  }

  async function handleTimeEdit(id: string, startTime: string) {
    await updateMassTime(id, startTime, adminSession);
    setNotice('Zmieniono godzinę Mszy. Stałe dyżury dopasowano do nowej godziny.');
    await latestRefresh.current();
  }

  async function confirmDelete() {
    if (!confirmation) return;
    const target = confirmation;
    const ok = await mutate(
      () => target.kind === 'mass'
        ? deleteMass(target.mass.id, adminSession, deleteScope)
        : deleteRule(target.rule.id),
      target.kind === 'mass'
        ? (deleteScope === 'future' ? 'Nabożeństwa z tej serii zostały usunięte.' : 'Nabożeństwo zostało usunięte.')
        : 'Stały dyżur został usunięty.'
    );
    if (ok) setConfirmation(null);
  }

  const ownRules = data.rules.filter(rule => rule.server_id === activeId).sort((a, b) =>
    ((a.day_of_week + 6) % 7) - ((b.day_of_week + 6) % 7) || a.time_slot.localeCompare(b.time_slot));
  const ownMasses = data.masses.filter(mass => data.attendees.some(a => a.mass_id === mass.id && a.server_id === activeId));
  const fullMasses = data.masses.filter(m => data.attendees.filter(a => a.mass_id === m.id).length >= m.suggested_spots).length;
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(week, i));
  const counts = Object.fromEntries(days.map(day => [day, data.masses.filter(m => dateKey(m.start_time) === day).length]));
  const shownDays = selectedDay ? [selectedDay] : days.filter(day => counts[day]);
  const syncLabel: Record<SyncStatus, string> = { connecting: 'Łączenie…', live: 'Grafik na żywo', offline: 'Synchronizacja opóźniona', demo: 'Podgląd lokalny' };

  return <div className="app-shell">
    <header className="site-header">
      <div className="header-inner">
        <a href="#grafik" className="brand" aria-label="Służba liturgiczna — grafik">
          <span className="brand-mark"><Church size={25} strokeWidth={1.5} /></span>
          <span><strong>Służba liturgiczna</strong><small>Wspólnie przy ołtarzu</small></span>
        </a>
        <div className="header-right"><span className="trust-label">Jedna wspólnota. Wspólna służba.</span>
          <UserSelector servers={servers} selectedId={selectedId} onChange={setSelectedId} />
          <button className="button secondary admin-toggle" onClick={() => adminSession ? void leaveAdmin() : setAdminLoginOpen(true)}>
            {adminSession ? <LogOut size={16} /> : <ShieldCheck size={16} />}{adminSession ? 'Wyjdź z trybu admina' : 'Administrator'}
          </button>
        </div>
      </div>
    </header>

    <main className="main-container" id="grafik">
      {isDemo && <div className="demo-banner"><span><strong>Tryb demonstracyjny</strong> · Dane przykładowe zapisują się tylko w tej przeglądarce.</span><span>Podłącz Supabase zgodnie z README, aby udostępnić grafik wspólnocie.</span></div>}
      <section className="page-heading">
        <div><div className="eyebrow"><span />GRAFIK WSPÓLNOTY</div><h1>Mała służba.<br className="mobile-break" /> Wielka sprawa.</h1>
          <p>Grafik Służby Liturgicznej — znajdź swój czas przy ołtarzu.</p></div>
        {adminSession && <button className="button primary add-mass-button" onClick={() => setAdding(true)} disabled={loading || !!loadError}><Plus size={18} />Dodaj Mszę / Nabożeństwo</button>}
      </section>

      {adminSession && <div className="admin-toolbar"><span><ShieldCheck size={18} />Tryb administratora aktywny</span>
        <button className="button secondary" disabled={loading || !!loadError} onClick={() => setEditingServers(true)}><Users size={16} />Edytuj ministrantów</button></div>}

      <div className="dashboard-layout">
        <section className="schedule-panel" aria-label="Grafik tygodniowy">
          <div className="schedule-toolbar"><span className="section-title"><CalendarDays size={17} />Plan służby</span>
            <span className={`sync-status ${syncStatus}`}><span />{syncLabel[syncStatus]}</span>
          </div>
          <WeekNavigator week={week} onChange={changeWeek} />
          <DaySelector week={week} selected={selectedDay} onChange={setSelectedDay} counts={counts} />

          {syncStatus === 'offline' && <div className="info-banner" role="status">Połączenie na żywo jest niedostępne. Grafik odświeża się co minutę oraz po powrocie do karty.</div>}
          {loadError && <div className="error-banner" role="alert"><AlertCircle size={19} /><div><strong>Nie udało się odświeżyć grafiku</strong><p>{loadError}</p>{snapshot?.week === week && <p>Wyświetlane dane mogą być nieaktualne.</p>}</div><button className="button secondary" onClick={() => void refresh()}><RefreshCw size={14} />Ponów</button></div>}
          {actionError && !confirmation && <div className="error-banner" role="alert"><AlertCircle size={18} /><p>{actionError}</p><button className="icon-button" aria-label="Zamknij komunikat" onClick={() => setActionError('')}><X size={17} /></button></div>}

          {loading && snapshot?.week !== week ? <div className="loading-state" role="status"><LoaderCircle className="animate-spin" size={28} /><p>Przygotowujemy grafik…</p></div>
            : !data.masses.length || (selectedDay && !counts[selectedDay]) ? <div className="empty-state"><CalendarPlus size={36} strokeWidth={1.3} /><h3>{loadError ? 'Grafik jest niedostępny' : 'Jeszcze bez nabożeństw'}</h3><p>{loadError ? 'Sprawdź połączenie i spróbuj ponownie.' : 'Nie dodano jeszcze terminów w tym widoku.'}</p>{!loadError && adminSession && <button className="button secondary" onClick={() => setAdding(true)}><Plus size={16} />Dodaj nabożeństwo</button>}</div>
            : <div className="day-groups">{shownDays.map(day => <section className="day-group" key={day} aria-label={DAY_NAMES[weekday(day)]}>
              <div className="day-heading"><h3>{DAY_NAMES[weekday(day)]}{' '}<span>{polishDate(day, { day: 'numeric', month: 'long' })}</span></h3>{day === dateKey() && <span className="today-badge">Dzisiaj</span>}<div className="day-heading-line" /><span className="day-count">{counts[day]} {counts[day] === 1 ? 'nabożeństwo' : counts[day] < 5 ? 'nabożeństwa' : 'nabożeństw'}</span></div>
              <div className="mass-grid">{data.masses.filter(m => dateKey(m.start_time) === day).map(mass => <MassCard key={mass.id} mass={mass}
                attendees={data.attendees.filter(a => a.mass_id === mass.id)} rules={data.rules} exceptions={data.exceptions}
                isAdmin={!!adminSession} onEditTime={setEditingMass}
                activeId={activeId} busy={busy} onAction={(m, action) => void handleAction(m, action)} onDelete={m => { setActionError(''); setDeleteScope('single'); setConfirmation({ kind: 'mass', mass: m }); }} />)}</div>
            </section>)}</div>}
          <div className="schedule-footnote"><HeartHandshake size={16} />Sugerowane miejsca to wskazówka. Dla Ciebie zawsze znajdzie się miejsce.</div>
        </section>

        <aside className="sidebar" aria-label="Twoja służba i informacje">
          <section className="personal-panel">
            <div className="personal-intro"><span className="personal-icon"><HeartHandshake size={23} strokeWidth={1.5} /></span><span>TWÓJ CZAS, TWOJA SŁUŻBA</span></div>
            <h2>{activeServer ? `Dobrze, że jesteś, ${activeServer.name.split(' ')[0]}.` : 'Dobrze, że jesteś.'}</h2>
            <p>{activeServer ? 'Każda obecność ma znaczenie. Dziękujemy, że współtworzysz naszą wspólnotę.' : 'Wybierz swoje imię w nagłówku, aby zaplanować służbę i zobaczyć swoje dyżury.'}</p>
            <div className="personal-summary"><span>Twoje nabożeństwa w tym tygodniu</span><strong>{activeId ? ownMasses.length.toString().padStart(2, '0') : '—'}</strong></div>
            {ownMasses.length > 0 && <button className="personal-link" onClick={() => setSelectedDay(dateKey(ownMasses[0].start_time))}>Zobacz pierwszy termin<ArrowRight size={15} /></button>}
          </section>

          <section className="sidebar-panel rules-panel"><h2><Repeat2 size={18} />Moje stałe dyżury<span>{ownRules.length}</span></h2>
            {ownRules.length ? <ul>{ownRules.map(rule => <li key={rule.id}><span className="rule-marker"><Repeat2 size={15} /></span><div><strong>{DAY_NAMES[rule.day_of_week]}</strong><span>Co tydzień o {rule.time_slot.slice(0, 5)}</span></div><button className="icon-button" disabled={busy} aria-label={`Usuń stały dyżur: ${DAY_NAMES[rule.day_of_week]} ${rule.time_slot.slice(0, 5)}`} onClick={() => { setActionError(''); setConfirmation({ kind: 'rule', rule }); }}><X size={16} /></button></li>)}</ul>
              : <p className="sidebar-empty">{activeId ? 'Nie masz jeszcze stałego dyżuru. Ustaw go przy wybranej Mszy.' : 'Tutaj pojawią się Twoje stałe dyżury po wybraniu imienia.'}</p>}
            <div className="rules-tip"><CircleHelp size={15} /><p>Nie możesz przyjść? Zgłoś nieobecność przy danej Mszy. Pozostałe dyżury zostaną bez zmian.</p></div>
          </section>

          <section className="sidebar-panel week-summary"><h2>Ten tydzień we wspólnocie</h2><div><span><CalendarDays size={16} />Nabożeństwa</span><strong>{data.masses.length}</strong></div><div><span><Users size={16} />Ministranci w naszej wspólnocie</span><strong>{servers.length}</strong></div><div><span><Check size={16} />Pełna obstawa</span><strong>{fullMasses}<small> / {data.masses.length}</small></strong></div></section>
          <div className="open-invitation"><Church size={28} strokeWidth={1.2} /><p>„Służcie Panu z weselem!”</p><span>Ps 100, 2</span></div>
        </aside>
      </div>
      <footer className="site-footer"><span><Church size={15} />Grafik Służby Liturgicznej</span><span>Razem tworzymy wspólnotę.<span className="footer-dot">·</span>Czas polski</span></footer>
    </main>

    {notice && <div className="toast" role="status"><span><Check size={17} /></span><p>{notice}</p><button className="icon-button" aria-label="Zamknij powiadomienie" onClick={() => setNotice('')}><X size={16} /></button></div>}
    {adminLoginOpen && <AdminLoginModal onClose={() => setAdminLoginOpen(false)} onLogin={session => { setAdminSession(session); setAdminLoginOpen(false); setActionError(''); }} />}
    {adminSession && editingServers && <AdminServersModal servers={servers} onClose={() => setEditingServers(false)} onSave={handleServerEdit} />}
    {adminSession && editingMass && <EditMassTimeModal mass={editingMass} onClose={() => setEditingMass(null)} onSave={handleTimeEdit} />}
    {adminSession && adding && <AddMassModal initialDate={selectedDay ?? (week === monday() ? dateKey() : week)} onClose={() => setAdding(false)} onSubmit={handleAdd} onSubmitRecurring={handleAddRecurring} />}
    {confirmation && <Modal title={confirmation.kind === 'mass' ? 'Usunąć nabożeństwo?' : 'Usunąć stały dyżur?'} onClose={() => { setConfirmation(null); setActionError(''); }} busy={busy}>
      {confirmation.kind === 'mass' ? <>
        <p className="confirmation-description">
          {confirmation.mass.title} · {polishDate(dateKey(confirmation.mass.start_time), { day: 'numeric', month: 'long' })}, {timeSlot(confirmation.mass.start_time).slice(0, 5)}.
        </p>
        <div className="delete-scope-options mt-4 mb-4">
          <label className="radio-label">
            <input
              type="radio"
              name="delete-scope"
              value="single"
              checked={deleteScope === 'single'}
              onChange={() => setDeleteScope('single')}
              disabled={busy}
            />
            <span>
              <strong>Tylko ten termin</strong>
              <small>Usunięty zostanie wyłącznie termin {polishDate(dateKey(confirmation.mass.start_time), { day: 'numeric', month: 'long' })}, {timeSlot(confirmation.mass.start_time).slice(0, 5)}.</small>
            </span>
          </label>
          <label className="radio-label">
            <input
              type="radio"
              name="delete-scope"
              value="future"
              checked={deleteScope === 'future'}
              onChange={() => setDeleteScope('future')}
              disabled={busy}
            />
            <span>
              <strong>Ten i wszystkie przyszłe terminy o tej porze</strong>
              <small>Usunięte zostaną wszystkie przyszłe Msze „{confirmation.mass.title}” w każdy {DAY_NAMES[weekday(dateKey(confirmation.mass.start_time))]} o {timeSlot(confirmation.mass.start_time).slice(0, 5)} od tej daty w przód.</small>
            </span>
          </label>
        </div>
        <p className="confirmation-footnote">Jednorazowe zapisy na usuwane terminy zostaną skasowane. Stałe dyżury ministrantów pozostaną zachowane w bazie.</p>
      </> : <p className="confirmation-description">
        {DAY_NAMES[confirmation.rule.day_of_week]} o {confirmation.rule.time_slot.slice(0, 5)}. Przestaniesz automatycznie pojawiać się na liście obecności o tej porze we wszystkich tygodniach. Twoje osobne zapisy jednorazowe i zgłoszenia nieobecności pozostaną zapisane.
      </p>}
      {actionError && <p className="form-error" role="alert">{actionError}</p>}
      <div className="modal-actions"><button className="button secondary" disabled={busy} onClick={() => setConfirmation(null)}>Anuluj</button><button className="button danger" disabled={busy} onClick={() => void confirmDelete()}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}{confirmation.kind === 'mass' ? (deleteScope === 'future' ? 'Usuń przyszłe terminy' : 'Usuń nabożeństwo') : 'Usuń dyżur'}</button></div>
    </Modal>}
  </div>;
}
