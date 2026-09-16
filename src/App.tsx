import DayAnnotationModal from './components/DayAnnotationModal';
import { setDayAnnotation } from './lib/repository';
import { eventCategory } from './lib/eventCategory';
import { dayAppearance } from './lib/dayAppearance';
import EditRuleModal from './components/EditRuleModal';
import MyServicesView from './components/MyServicesView';
import CompetitionView from './components/CompetitionView';
import AdminPointsModal from './components/AdminPointsModal';
import ConfirmServicesModal from './components/ConfirmServicesModal';
import { useServiceConfirmations } from './hooks/useServiceConfirmations';
import { useCompetition } from './hooks/useCompetition';
import MyRecurringRules from './components/MyRecurringRules';
import { useUpcomingServices } from './hooks/useUpcomingServices';
import { Pencil } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, CalendarDays, CalendarPlus, Check, Church, HeartHandshake, LoaderCircle, Plus, RefreshCw, Trash2, Trophy, UserRound, Users, X, ShieldCheck } from 'lucide-react';
import UserSelector, { readSelectedServer } from './components/UserSelector';
import WeekNavigator from './components/WeekNavigator';
import DaySelector from './components/DaySelector';
import MassCard from './components/MassCard';
import type { MassAction } from './components/MassCard';
import AddMassModal from './components/AddMassModal';
import Modal from './components/Modal';
import AdminLoginModal from './components/AdminLoginModal';
import AdminServersModal from './components/AdminServersModal';
import EditMassModal from './components/EditMassModal';
import WeekCelebrantsModal from './components/WeekCelebrantsModal';
import type { CelebrantUpdate } from './components/WeekCelebrantsModal';
import MonthAnnotationsModal from './components/MonthAnnotationsModal';
import type { AnnotationUpdate } from './components/MonthAnnotationsModal';
import { logoutAdmin } from './lib/admin';
import { dateKey, DAY_NAMES, weekStart, polishDate, shiftDate, timeSlot, weekday } from './lib/dates';
import { matchesRule } from './lib/attendance';
import { addMass, addRecurringMasses, addRule, addServer, confirmService, deleteMass, deleteRule, deleteServer, loadWeek, removeAttendance, setAttendance, subscribe, updateServer, updateMass, updateRule } from './lib/repository';
import type { SyncStatus } from './lib/repository';
import { isDemo } from './lib/supabase';
import type { AdminSession, AltarServer, Mass, MassEditInput, NewMass, RecurringMassesInput, RecurringRule, ScheduleData } from './types/database';

const EMPTY: ScheduleData = { servers: [], masses: [], rules: [], exceptions: [], attendees: [] };
const EMPTY_PRESENCE: Map<string, boolean> = new Map();
type Confirmation = { kind: 'mass'; mass: Mass } | { kind: 'rule'; rule: RecurringRule };

function formatLiturgyCount(masses: Mass[]): string {
  const total = masses.length;
  const others = masses.filter(m => eventCategory(m) === 'other').length;
  if (others) return [masses.filter(m => eventCategory(m) === 'mass').length + ' Mszy', masses.filter(m => eventCategory(m) === 'devotion').length + ' nabożeństw', others + ' innych'].join(', ');
  const devotions = masses.filter(m => m.is_extra).length;
  const eucharists = total - devotions;
  if (devotions === 0) {
    return `${eucharists} ${eucharists === 1 ? 'Msza Święta' : eucharists < 5 ? 'Msze Święte' : 'Mszy Świętych'}`;
  }
  if (eucharists === 0) {
    return `${devotions} ${devotions === 1 ? 'nabożeństwo' : devotions < 5 ? 'nabożeństwa' : 'nabożeństw'}`;
  }
  return `${eucharists} ${eucharists === 1 ? 'Msza' : eucharists < 5 ? 'Msze' : 'Mszy'}, ${devotions} ${devotions === 1 ? 'nabożeństwo' : devotions < 5 ? 'nabożeństwa' : 'nabożeństw'}`;
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Nie udało się wykonać operacji. Spróbuj ponownie.';
}

export default function App() {
  const [view, setView] = useState<'schedule' | 'services' | 'competition'>('schedule');
  const [week, setWeek] = useState(() => weekStart());
  const [selectedDay, setSelectedDay] = useState<string>(() => {
    const today = dateKey();
    const currentWeekStart = weekStart();
    const daysInCurrentWeek = Array.from({ length: 7 }, (_, i) => shiftDate(currentWeekStart, i));
    return daysInCurrentWeek.includes(today) ? today : currentWeekStart;
  });
  const [selectedId, setSelectedId] = useState(readSelectedServer);
  const [selectionRequest, setSelectionRequest] = useState(0);
  const [snapshot, setSnapshot] = useState<{ week: string; data: ScheduleData } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('connecting');
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null);
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [deleteScope, setDeleteScope] = useState<'single' | 'future'>('single');
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [editingServers, setEditingServers] = useState(false);
  const [editingMass, setEditingMass] = useState<Mass | null>(null);
  const [celebrantsOpen, setCelebrantsOpen] = useState(false);
  const [annotationsOpen, setAnnotationsOpen] = useState(false);
  const [pointsOpen, setPointsOpen] = useState(false);
  const mutationLock = useRef(false);
  const requestId = useRef(0);
  const resetScrollOnDayOpen = useRef(false);

  useLayoutEffect(() => {
    if (view !== 'schedule' || !resetScrollOnDayOpen.current) return;
    resetScrollOnDayOpen.current = false;
    // Reset after mounting the destination, before paint, regardless of data loading.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [view, selectedDay]);
  const data = snapshot?.week === week ? snapshot.data : EMPTY;
  const servers = snapshot?.data.servers ?? [];
  const activeServer = servers.find(server => server.id === selectedId);
  const activeId = activeServer?.id ?? '';
  const upcoming = useUpcomingServices(view === 'services', view === 'services' ? activeId : '');
  const competition = useCompetition(view === 'competition' || pointsOpen);
  const serviceConfirmations = useServiceConfirmations(adminSession ? '' : activeId);
  const pendingRefresh = useRef(serviceConfirmations.refresh);
  useEffect(() => { pendingRefresh.current = serviceConfirmations.refresh; }, [serviceConfirmations.refresh]);
  const actionRules = view === 'services' ? upcoming.data?.rules ?? [] : data.rules;

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    const onVisible = () => setNowMs(Date.now());
    window.addEventListener('focus', onVisible);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onVisible); };
  }, []);

  useEffect(() => {
    if (!adminSession) return;
    const expire = () => {
      if (Date.parse(adminSession.expires_at) <= Date.now()) {
        setAdminSession(null);
        setEditingServers(false); setEditingMass(null); setAdding(false); setCelebrantsOpen(false); setAnnotationsOpen(false); setPointsOpen(false);
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
    setEditingServers(false); setEditingMass(null); setAdding(false); setCelebrantsOpen(false); setAnnotationsOpen(false); setPointsOpen(false);
    setConfirmation(current => current?.kind === 'mass' ? null : current);
    if (session) {
      try { await logoutAdmin(session); }
      catch { setActionError('Tryb administratora wyłączono w tej karcie. Brak połączenia uniemożliwił unieważnienie sesji w bazie; wygaśnie po 30 minutach od logowania.'); }
    }
  }

  const refreshWeek = useCallback(async () => {
    const request = ++requestId.current;
    try {
      const next = await loadWeek(week);
      if (request === requestId.current) { setSnapshot({ week, data: next }); setLoadError(''); }
    } catch (error) {
      if (request === requestId.current) setLoadError(messageFrom(error));
    } finally { if (request === requestId.current) setLoading(false); }
  }, [week]);

  const refresh = useCallback(async () => {
    await Promise.all([refreshWeek(), upcoming.refresh(), competition.refresh()]);
  }, [refreshWeek, upcoming.refresh, competition.refresh]);

  const latestRefresh = useRef(refresh);
  useEffect(() => { latestRefresh.current = refresh; }, [refresh]);

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    void refresh();
    return () => { ++requestId.current; };
  }, [refresh]);

  useEffect(() => {
    let debounce: number | undefined;
    const unsubscribe = subscribe(() => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => { void latestRefresh.current(); void pendingRefresh.current(); }, 150);
    }, setSyncStatus);
    return () => { unsubscribe(); window.clearTimeout(debounce); };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 5500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function changeWeek(next: string) {
    setWeek(next);
    const today = dateKey();
    const nextWeekDays = Array.from({ length: 7 }, (_, i) => shiftDate(next, i));
    setSelectedDay(nextWeekDays.includes(today) ? today : next);
  }

  const mutate = useCallback(async (action: () => Promise<void>, success: string): Promise<boolean> => {
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
  }, []);

  // Optimistic roster + presence update so signup feels instant.
  // The server refresh right after reconciles any difference.
  const applyOptimistic = useCallback((mass: Mass, action: MassAction, serverId: string) => {
    setSnapshot(current => {
      if (!current) return current;
      const data = current.data;
      const rule = data.rules.find(r => r.server_id === serverId && matchesRule(mass, r));
      const hasRule = !!rule;
      let exceptions = data.exceptions;
      let attendees = data.attendees;
      let confirmations = data.confirmations;
      const me = data.servers.find(s => s.id === serverId);
      const attendeeFor = (type: 'recurring' | 'single') => me
        ? [{ mass_id: mass.id, server_id: serverId, name: me.name, rank: me.rank, attendance_type: type } as const]
        : [];
      if (action === 'single' || action === 'excuse' || action === 'recurring') {
        const type = action === 'excuse' ? 'excused' : 'single';
        const found = exceptions.some(e => e.mass_id === mass.id && e.server_id === serverId);
        exceptions = found
          ? exceptions.map(e => e.mass_id === mass.id && e.server_id === serverId ? { ...e, type } : e)
          : [...exceptions, { id: `optimistic-${mass.id}`, mass_id: mass.id, server_id: serverId, type }];
        if (type === 'excused') attendees = attendees.filter(a => !(a.mass_id === mass.id && a.server_id === serverId));
        else if (!attendees.some(a => a.mass_id === mass.id && a.server_id === serverId)) {
          attendees = [...attendees, ...attendeeFor(hasRule || action === 'recurring' ? 'recurring' : 'single')];
        }
      } else if (action === 'withdraw' || action === 'restore' || action === 'undeclare') {
        if (action === 'undeclare' && hasRule) {
          const found = exceptions.some(e => e.mass_id === mass.id && e.server_id === serverId);
          exceptions = found
            ? exceptions.map(e => e.mass_id === mass.id && e.server_id === serverId ? { ...e, type: 'excused' as const } : e)
            : [...exceptions, { id: `optimistic-${mass.id}`, mass_id: mass.id, server_id: serverId, type: 'excused' as const }];
          attendees = attendees.filter(a => !(a.mass_id === mass.id && a.server_id === serverId));
        } else {
          exceptions = exceptions.filter(e => !(e.mass_id === mass.id && e.server_id === serverId));
          if (hasRule && !attendees.some(a => a.mass_id === mass.id && a.server_id === serverId)) {
            attendees = [...attendees, ...attendeeFor('recurring')];
          } else if (!hasRule) {
            attendees = attendees.filter(a => !(a.mass_id === mass.id && a.server_id === serverId));
          }
        }
      } else if (action === 'attended' || action === 'absent') {
        const attended = action === 'attended';
        const entry = { mass_id: mass.id, server_id: serverId, attended, confirmed_at: new Date().toISOString() };
        confirmations = [...(confirmations ?? []).filter(c => !(c.mass_id === mass.id && c.server_id === serverId)), entry];
        // Presence never touches the roster: no signups, no excuse changes.
      }
      return { ...current, data: { ...data, exceptions, attendees, confirmations } };
    });
  }, []);

  const handleAction = useCallback(async (mass: Mass, action: MassAction) => {
    if (!activeId) return;
    const serverId = activeId;
    if (action === 'recurring') {
      const existing = actionRules.find(r => r.server_id === serverId && r.day_of_week === weekday(dateKey(mass.start_time)) && r.time_slot === timeSlot(mass.start_time));
      if (existing) { setEditingRule(existing); return; }
    }
    const hasRule = actionRules.some(rule => rule.server_id === serverId && matchesRule(mass, rule));
    const isDevotion = mass.is_extra;
    const noun = eventCategory(mass) === 'other' ? 'wydarzenie' : isDevotion ? 'nabożeństwo' : 'Mszę Świętą';
    const messages: Record<MassAction, string> = {
      single: `Zapisano Cię na ${noun}.`,
      recurring: 'Stały dyżur został ustawiony. Obowiązuje również dla nowych terminów.',
      withdraw: 'Usunięto Twój jednorazowy zapis.',
      excuse: 'Zgłoszono nieobecność tylko w tym terminie. Twój stały dyżur pozostaje aktywny.',
      restore: 'Twoja obecność została przywrócona.',
      attended: 'Zapisano Twoją obecność.',
      absent: 'Zapisano Twoją nieobecność.',
      undeclare: 'Usunięto Twój zapis z tego terminu. Stały dyżur pozostał bez zmian.',
    };
    applyOptimistic(mass, action, serverId);
    const ok = await mutate(async () => {
      if (action === 'attended' || action === 'absent') await confirmService(mass.id, serverId, action === 'attended');
      else if (action === 'undeclare') {
        if (hasRule) await setAttendance(mass.id, serverId, 'excused');
        else await removeAttendance(mass.id, serverId);
      }
      else if (action === 'recurring') await addRule({ server_id: serverId, day_of_week: weekday(dateKey(mass.start_time)), time_slot: timeSlot(mass.start_time) });
      else if (action === 'withdraw' || (action === 'restore' && hasRule)) await removeAttendance(mass.id, serverId);
      else await setAttendance(mass.id, serverId, action === 'excuse' ? 'excused' : 'single');
    }, messages[action]);
    if (ok && (action === 'attended' || action === 'absent' || action === 'undeclare')) void pendingRefresh.current();
    if (!ok) void latestRefresh.current();
  }, [activeId, actionRules, mutate, applyOptimistic]);

  const requestMassDeletion = useCallback((mass: Mass) => {
    setActionError('');
    setDeleteScope('single');
    setConfirmation({ kind: 'mass', mass });
  }, []);

  async function handleAdd(mass: NewMass) {
    await addMass(mass, adminSession);
    const day = dateKey(mass.start_time);
    const noun = eventCategory(mass) === 'other' ? 'wydarzenie' : mass.is_extra ? 'nabożeństwo' : 'Mszę Świętą';
    setNotice(`Dodano ${noun}. Stałe dyżury są już uwzględnione.`);
    if (weekStart(day) !== week) setWeek(weekStart(day));
    else await refresh();
    setSelectedDay(day);
  }


  async function handleAddRecurring(input: RecurringMassesInput): Promise<number> {
    const count = await addRecurringMasses(input, adminSession);
    const noun = eventCategory(input) === 'other' ? 'wydarzeń' : input.is_extra
      ? (count === 1 ? 'nabożeństwo' : count < 5 ? 'nabożeństwa' : 'nabożeństw')
      : (count === 1 ? 'Mszę Świętą' : count < 5 ? 'Msze Święte' : 'Mszy Świętych');
    setNotice(`Utworzono serię (${count} ${noun}). Stałe dyżury są już uwzględnione.`);
    await latestRefresh.current();
    return count;
  }

  async function handleServerEdit(server: AltarServer) {
    await updateServer(server, adminSession);
    await latestRefresh.current();
  }

  async function handleAddServer(server: Omit<AltarServer, 'id'>): Promise<string> {
    const id = await addServer(server, adminSession);
    setNotice(`Dodano ministranta: ${server.name}.`);
    await latestRefresh.current();
    return id;
  }

  async function handleDeleteServer(id: string): Promise<void> {
    await deleteServer(id, adminSession);
    setNotice('Usunięto ministranta ze wspólnoty.');
    if (selectedId === id) {
      setSelectedId('');
    }
    await latestRefresh.current();
  }

  async function handleMassEdit(id: string, input: MassEditInput): Promise<number> {
    const count = await updateMass(id, input, adminSession);
    if (input.scope !== 'single') {
      const noun = input.is_extra
        ? (count === 1 ? 'nabożeństwo' : count < 5 ? 'nabożeństwa' : 'nabożeństw')
        : (count === 1 ? 'Mszę Świętą' : count < 5 ? 'Msze Święte' : 'Mszy Świętych');
      const where = input.scope === 'future_day_time'
        ? 'w tym dniu tygodnia o tej godzinie'
        : 'o tej godzinie';
      setNotice(`Zaktualizowano terminy ${where} (${count} ${noun}). Zadeklarowane obecności pozostały zachowane.`);
    } else {
      const noun = input.is_extra ? 'nabożeństwo' : 'Mszę Świętą';
      setNotice(`Zapisano zmiany: ${noun}.`);
    }
    await latestRefresh.current();
    return count;
  }

  async function handleWeekCelebrants(updates: CelebrantUpdate[]): Promise<void> {
    for (const { mass, celebrant } of updates) {
      await updateMass(mass.id, {
        title: mass.title,
        time: timeSlot(mass.start_time).slice(0, 5),
        suggested_spots: mass.suggested_spots,
        is_extra: mass.is_extra,
        category: mass.category ?? (mass.is_extra ? 'devotion' : 'mass'),
        celebrant,
        liturgy_type: mass.liturgy_type ?? null,
        scope: 'single',
      }, adminSession);
    }
    const count = updates.length;
    setNotice(`Zapisano księży na ${count} ${count === 1 ? 'termin' : count < 5 ? 'terminy' : 'terminów'}.`);
    await latestRefresh.current();
  }

  async function handleMonthAnnotations(updates: AnnotationUpdate[]): Promise<void> {
    for (const { day, label } of updates) {
      await setDayAnnotation(day, label, adminSession);
    }
    const count = updates.length;
    setNotice(`Zapisano oznaczenia na ${count} ${count === 1 ? 'dzień' : 'dni'}.`);
    await latestRefresh.current();
  }

  async function confirmDelete() {
    if (!confirmation) return;
    const target = confirmation;
    const isDevotion = target.kind === 'mass' && target.mass.is_extra;
    const ok = await mutate(
      () => target.kind === 'mass'
        ? deleteMass(target.mass.id, adminSession, deleteScope)
        : deleteRule(target.rule.id),
      target.kind === 'mass'
        ? (deleteScope === 'future'
            ? (target.kind === 'mass' && eventCategory(target.mass) === 'other' ? 'Wydarzenia z tej serii zostały usunięte.' : isDevotion ? 'Nabożeństwa z tej serii zostały usunięte.' : 'Msze Święte z tej serii zostały usunięte.')
            : (target.kind === 'mass' && eventCategory(target.mass) === 'other' ? 'Wydarzenie zostało usunięte.' : isDevotion ? 'Nabożeństwo zostało usunięte.' : 'Msza Święta została usunięta.'))
        : 'Stały dyżur został usunięty z przyszłych terminów. Poprzednie obecności zostały w kalendarzu.'
    );
    if (ok) setConfirmation(null);
  }

  // Index each snapshot once instead of scanning all attendees for every card.
  const attendeesByMass = useMemo(() => {
    const grouped = new Map<string, ScheduleData['attendees']>();
    for (const mass of data.masses) grouped.set(mass.id, []);
    for (const attendee of data.attendees) grouped.get(attendee.mass_id)?.push(attendee);
    return grouped;
  }, [data.masses, data.attendees]);
  const confirmationsByMass = useMemo(() => {
    const grouped = new Map<string, Map<string, boolean>>();
    for (const confirmation of data.confirmations ?? []) {
      let own = grouped.get(confirmation.mass_id);
      if (!own) { own = new Map(); grouped.set(confirmation.mass_id, own); }
      own.set(confirmation.server_id, confirmation.attended);
    }
    return grouped;
  }, [data.confirmations]);
  const ownMasses = useMemo(() => {
    const ids = new Set(data.attendees.filter(a => a.server_id === activeId).map(a => a.mass_id));
    return data.masses.filter(mass => ids.has(mass.id));
  }, [data.masses, data.attendees, activeId]);
  const fullMasses = useMemo(() => data.masses.filter(m => m.suggested_spots !== null &&
    (attendeesByMass.get(m.id)?.length ?? 0) >= m.suggested_spots).length, [data.masses, attendeesByMass]);
  const { massesByDay, counts } = useMemo(() => {
    const massesByDay = new Map<string, Mass[]>();
    const counts: Record<string, number> = {};
    for (const mass of data.masses) {
      const day = dateKey(mass.start_time);
      const group = massesByDay.get(day);
      if (group) group.push(mass);
      else massesByDay.set(day, [mass]);
      counts[day] = (counts[day] ?? 0) + 1;
    }
    return { massesByDay, counts };
  }, [data.masses]);
  const dayMasses = massesByDay.get(selectedDay) ?? EMPTY.masses;
  const dayLabel = data.dayAnnotations?.find(annotation => annotation.day === selectedDay)?.label;

  return <div className="app-shell">
    <main className="main-container" id="grafik">
      {isDemo && <div className="demo-banner"><span><strong>Tryb demonstracyjny</strong> · Dane przykładowe zapisują się tylko w tej przeglądarce.</span><span>Podłącz Supabase zgodnie z README, aby udostępnić grafik wspólnocie.</span></div>}
      <section className="page-heading">
        <div className="page-heading-titles"><h1>Ministrantappka</h1></div>
        <div className="page-heading-controls">
          <UserSelector ready={snapshot !== null} servers={servers} selectedId={selectedId} onChange={setSelectedId} selectionRequest={selectionRequest} adminSession={adminSession} onAdminToggle={() => adminSession ? void leaveAdmin() : setAdminLoginOpen(true)} />
        </div>
      </section>

      <nav className="view-navigation" aria-label="Widoki aplikacji">
        <button className={`button ${view === 'schedule' ? 'primary' : 'secondary'}`} aria-current={view === 'schedule' ? 'page' : undefined} onClick={() => setView('schedule')}><CalendarDays size={18} />Grafik</button>
        <button className={`button ${view === 'services' ? 'primary' : 'secondary'}`} aria-current={view === 'services' ? 'page' : undefined} onClick={() => setView('services')}><HeartHandshake size={18} />Moje służby</button>
        <button className={`button ${view === 'competition' ? 'primary' : 'secondary'}`} aria-current={view === 'competition' ? 'page' : undefined} onClick={() => setView('competition')}><Trophy size={18} />Rywalizacja</button>
      </nav>

      {serviceConfirmations.error && !serviceConfirmations.pending?.masses.length && !adminSession && <div className="error-banner" role="alert"><AlertCircle size={18} /><div><strong>Nie udało się sprawdzić obecności</strong><p>{serviceConfirmations.error}</p></div><button className="button secondary" onClick={() => void serviceConfirmations.refresh()}><RefreshCw size={16} />Ponów sprawdzanie</button></div>}

      {adminSession && <div className="admin-toolbar"><span><ShieldCheck size={18} />Tryb administratora aktywny</span>
        <div className="admin-toolbar-actions">
          <button className="button secondary" onClick={() => setAdding(true)} disabled={loading || !!loadError}><Plus size={16} />Dodaj Mszę / wydarzenie</button>
          <button className="button secondary" onClick={() => setPointsOpen(true)}><Trophy size={16} />Zarządzaj punktacją</button>
          <button className="button secondary" onClick={() => setCelebrantsOpen(true)} disabled={loading || !!loadError}><UserRound size={16} />Księża na tydzień</button>
          <button className="button secondary" onClick={() => setAnnotationsOpen(true)} disabled={loading || !!loadError}><CalendarDays size={16} />Oznaczanie dni</button>
          <button className="button secondary" disabled={loading || !!loadError} onClick={() => setEditingServers(true)}><Users size={16} />Edytuj ministrantów</button>
        </div></div>}

      {view === 'competition' && <CompetitionView key={activeId} data={competition.data} activeId={activeId} now={competition.now} loading={competition.loading} error={competition.error} offline={syncStatus === 'offline'} onRetry={() => void competition.refresh()} onOpenSchedule={() => { resetScrollOnDayOpen.current = true; setView('schedule'); }} />}
      {view === 'services' && <>
        {syncStatus === 'offline' && <div className="info-banner" role="status">Połączenie na żywo jest niedostępne. Służby odświeżają się co minutę oraz po powrocie do karty.</div>}
        {actionError && !confirmation && <div className="error-banner" role="alert"><AlertCircle size={18} /><p>{actionError}</p><button className="icon-button" aria-label="Zamknij komunikat" onClick={() => setActionError('')}><X size={17} /></button></div>}
        {!snapshot && loadError && <div className="error-banner" role="alert"><p>{loadError}</p><button className="button secondary" onClick={() => void refresh()}>Ponów pobieranie ministrantów</button></div>}
        <MyServicesView server={activeServer} data={upcoming.data} loading={upcoming.loading} error={upcoming.error} now={upcoming.now} busy={busy}
          onRetry={() => void upcoming.refresh()} onAction={handleAction}
          onOpenDay={(day = dateKey()) => { resetScrollOnDayOpen.current = true; setWeek(weekStart(day)); setSelectedDay(day); setView('schedule'); }}
          onEditRule={setEditingRule} onDeleteRule={rule => { setActionError(''); setConfirmation({ kind: 'rule', rule }); }} />
      </>}
      {view === 'schedule' && <div className="dashboard-layout">
        <section className="schedule-panel" aria-label="Grafik tygodniowy">
          <WeekNavigator week={week} onChange={changeWeek} />
          <DaySelector week={week} selected={selectedDay} onChange={setSelectedDay} counts={counts} dayAnnotations={data.dayAnnotations} />

          {syncStatus === 'offline' && <div className="info-banner" role="status">Połączenie na żywo jest niedostępne. Grafik odświeża się co minutę oraz po powrocie do karty.</div>}
          {loadError && <div className="error-banner" role="alert"><AlertCircle size={19} /><div><strong>Nie udało się odświeżyć grafiku</strong><p>{loadError}</p>{snapshot?.week === week && <p>Wyświetlane dane mogą być nieaktualne.</p>}</div><button className="button secondary" onClick={() => void refresh()}><RefreshCw size={14} />Ponów</button></div>}
          {actionError && !confirmation && <div className="error-banner" role="alert"><AlertCircle size={18} /><p>{actionError}</p><button className="icon-button" aria-label="Zamknij komunikat" onClick={() => setActionError('')}><X size={17} /></button></div>}

          <div className="day-summary">
            <div className="day-heading">
              <h3>{DAY_NAMES[weekday(selectedDay)]}{' '}<span>{polishDate(selectedDay, { day: 'numeric', month: 'long' })}</span></h3>
              {selectedDay === dateKey() && <span className="today-badge">Dzisiaj</span>}
              <div className="day-heading-line" />
              {!loading && <span className="day-count">{formatLiturgyCount(dayMasses)}</span>}
            </div>
            {(adminSession || dayLabel) && <div className={`day-annotation-bar ${dayAppearance(selectedDay, dayLabel)}`}>
              <span className="day-annotation-label"><CalendarDays size={18} aria-hidden="true" /><span>{dayLabel || 'Dzień bez oznaczenia'}</span></span>
              {adminSession && <button className="button secondary" disabled={loading || !!loadError} onClick={() => setEditingDay(selectedDay)}><Pencil size={14}/>Oznacz dzień</button>}
            </div>}
          </div>

          {loading && snapshot?.week !== week ? (
            <div className="loading-state" role="status"><LoaderCircle className="animate-spin" size={28} /><p>Przygotowujemy grafik…</p></div>
          ) : dayMasses.length === 0 ? (
            <div className="empty-state">
              <CalendarPlus size={36} strokeWidth={1.3} />
              <h3>{loadError ? 'Grafik jest niedostępny' : 'Brak zaplanowanych Mszy i nabożeństw'}</h3>
              <p>{loadError ? 'Sprawdź połączenie i spróbuj ponownie.' : 'Nie dodano jeszcze terminów w tym dniu.'}</p>
              {!loadError && adminSession && <button className="button secondary" onClick={() => setAdding(true)}><Plus size={16} />Dodaj Mszę / wydarzenie</button>}
            </div>
          ) : (
            <div className="day-groups">
              <section className="day-group" key={selectedDay} aria-label={DAY_NAMES[weekday(selectedDay)]}>
                <div className="mass-grid">
                  {dayMasses.map(mass => (
                    <MassCard
                      key={mass.id}
                      mass={mass}
                      attendees={attendeesByMass.get(mass.id)!}
                      rules={data.rules}
                      exceptions={data.exceptions}
                      isAdmin={!!adminSession}
                      onEdit={setEditingMass}
                      onEditTime={setEditingMass}
                      activeId={activeId}
                      busy={busy}
                      presence={confirmationsByMass.get(mass.id) ?? EMPTY_PRESENCE}
                      now={nowMs}
                      servers={servers}
                      onAction={handleAction}
                      onDelete={requestMassDeletion}
                    />
                  ))}
                </div>
              </section>
            </div>
          )}
        </section>

        <aside className="sidebar" aria-label="Twoja służba i informacje">
          <section className="personal-panel">
            <div className="personal-icon"><HeartHandshake size={22} strokeWidth={1.5} /></div>
            <h2>{activeServer ? `Dobrze, że jesteś, ${activeServer.name.split(' ')[0]}.` : 'Dobrze, że jesteś.'}</h2>
            {!activeServer && <p>Wybierz swoje imię w nagłówku, aby zaplanować służbę i zobaczyć swoje dyżury.</p>}
            <div className="personal-summary"><span>Twoje służby w ciągu ostatnich 30 dni</span><strong>{activeId ? ((data.recentAttendance ? data.recentAttendance[activeId] : ownMasses.length) ?? 0).toString().padStart(2, '0') : '—'}</strong></div>
            {ownMasses.length > 0 && <button className="personal-link" onClick={() => { const d = dateKey(ownMasses[0].start_time); if (weekStart(d) !== week) setWeek(weekStart(d)); setSelectedDay(d); }}>Zobacz pierwszy termin<ArrowRight size={15} /></button>}
          </section>

          <MyRecurringRules rules={data.rules} activeId={activeId} busy={busy} onEdit={setEditingRule} onDelete={rule => { setActionError(''); setConfirmation({ kind: 'rule', rule }); }} />

          <section className="sidebar-panel week-summary"><h2>Ten tydzień w parafii</h2><div><span><CalendarDays size={16} />Msze, nabożeństwa i inne</span><strong>{data.masses.length}</strong></div><div><span><Users size={16} />Ministranci w naszej wspólnocie</span><strong>{servers.length}</strong></div><div><span><Check size={16} />Pełna obstawa</span><strong>{fullMasses}<small> / {data.masses.length}</small></strong></div></section>
          <div className="open-invitation"><Church size={28} strokeWidth={1.2} /><p>„Służcie Panu z weselem!”</p><span>Ps 100, 2</span></div>
        </aside>
      </div>}
    </main>

    {adminSession && pointsOpen && <AdminPointsModal data={competition.data} now={competition.now} loading={competition.loading} error={competition.error} session={adminSession} onRefresh={competition.refresh} onClose={() => setPointsOpen(false)} onSaved={setNotice} />}
    {!adminSession && !adminLoginOpen && !editingRule && !confirmation && activeServer && serviceConfirmations.pending?.masses[0] && <ConfirmServicesModal
      mass={serviceConfirmations.pending.masses[0]} name={activeServer.name} remaining={serviceConfirmations.pending.total} completed={serviceConfirmations.completed}
      busy={serviceConfirmations.busy} error={serviceConfirmations.error} onRetry={() => void serviceConfirmations.refresh()} onChangePerson={() => { setSelectedId(''); setSelectionRequest(value => value + 1); try { localStorage.removeItem('liturgy.active-server'); } catch { /* The identity is cleared for this tab even without storage. */ } }}
      onAnswer={attended => { const mass = serviceConfirmations.pending?.masses[0]; if (mass) void serviceConfirmations.answer(mass.id, attended).then(saved => { if (saved) void latestRefresh.current(); }); }} />}

    {notice && <div className="toast" role="status"><span><Check size={17} /></span><p>{notice}</p><button className="icon-button" aria-label="Zamknij powiadomienie" onClick={() => setNotice('')}><X size={16} /></button></div>}
    {adminSession && editingDay && <DayAnnotationModal day={editingDay} label={data.dayAnnotations?.find(a=>a.day===editingDay)?.label ?? ''} onClose={()=>setEditingDay(null)} onSave={async label=>{await setDayAnnotation(editingDay,label,adminSession);setNotice('Zapisano oznaczenie dnia.');await latestRefresh.current();}}/>}
    {editingRule && <EditRuleModal rule={editingRule} onClose={() => setEditingRule(null)} onSave={async rule => { await updateRule(rule); setNotice('Zapisano zmiany stałego dyżuru.'); await refresh(); }} />}
    {adminLoginOpen && <AdminLoginModal onClose={() => setAdminLoginOpen(false)} onLogin={session => { setAdminSession(session); setAdminLoginOpen(false); setActionError(''); try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* Środowisko bez przewijania. */ } }} />}
    {adminSession && editingServers && (
      <AdminServersModal
        servers={servers}
        rules={data.rules}
        attendees={data.attendees}
        recentAttendance={data.recentAttendance}
        onClose={() => setEditingServers(false)}
        onSave={handleServerEdit}
        onAdd={handleAddServer}
        onDelete={handleDeleteServer}
      />
    )}
    {adminSession && editingMass && <EditMassModal mass={editingMass} onClose={() => setEditingMass(null)} onSave={handleMassEdit} />}
    {adminSession && celebrantsOpen && <WeekCelebrantsModal initialWeek={week} onClose={() => setCelebrantsOpen(false)} onSave={handleWeekCelebrants} />}
    {adminSession && annotationsOpen && <MonthAnnotationsModal initialMonth={week.slice(0, 7)} onClose={() => setAnnotationsOpen(false)} onSave={handleMonthAnnotations} />}
    {adminSession && adding && <AddMassModal initialDate={selectedDay} onClose={() => setAdding(false)} onSubmit={handleAdd} onSubmitRecurring={handleAddRecurring} />}

    {confirmation && <Modal title={confirmation.kind === 'mass' ? (eventCategory(confirmation.mass) === 'other' ? 'Usunąć wydarzenie?' : confirmation.mass.is_extra ? 'Usunąć nabożeństwo?' : 'Usunąć Mszę Świętą?') : 'Usunąć stały dyżur?'} onClose={() => { setConfirmation(null); setActionError(''); }} busy={busy}>
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
              <strong>Ten i wszystkie przyszłe terminy z serii</strong>
              <small>Usunięte zostaną wszystkie przyszłe terminy „{confirmation.mass.title}” z tej serii od tej daty w przód (niezależnie od dnia tygodnia).</small>
            </span>
          </label>
        </div>
        <p className="confirmation-footnote">Jednorazowe zapisy na usuwane terminy zostaną skasowane. Stałe dyżury ministrantów pozostaną zachowane w bazie.</p>
      </> : <p className="confirmation-description">
        {DAY_NAMES[confirmation.rule.day_of_week]} o {confirmation.rule.time_slot.slice(0, 5)}. Przestaniesz automatycznie pojawiać się na liście obecności o tej porze w przyszłych tygodniach. Poprzednie obecności z tego dyżuru zostaną w kalendarzu jako zapisy jednorazowe. Twoje osobne zapisy jednorazowe i zgłoszenia nieobecności pozostaną zapisane.
      </p>}
      {actionError && <p className="form-error" role="alert">{actionError}</p>}
      <div className="modal-actions"><button className="button secondary" disabled={busy} onClick={() => setConfirmation(null)}>Anuluj</button><button className="button danger" disabled={busy} onClick={() => void confirmDelete()}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}{confirmation.kind === 'mass' ? (deleteScope === 'future' ? (eventCategory(confirmation.mass) === 'other' ? 'Usuń przyszłe wydarzenia z serii' : confirmation.mass.is_extra ? 'Usuń przyszłe nabożeństwa z serii' : 'Usuń przyszłe Msze z serii') : (eventCategory(confirmation.mass) === 'other' ? 'Usuń wydarzenie' : confirmation.mass.is_extra ? 'Usuń nabożeństwo' : 'Usuń Mszę Świętą')) : 'Usuń dyżur'}</button></div>
    </Modal>}
  </div>;
}
