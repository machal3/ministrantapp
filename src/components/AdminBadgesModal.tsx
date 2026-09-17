import { useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  Anchor, ArrowLeft, ArrowRight, ArrowUpDown, Award, Bell, Bird, BookOpen, Calendar, CalendarCheck, CalendarDays, CalendarRange, Check,
  ChevronDown, Church, Clock, Compass, Cross, Crown, Dog, Feather, Fish, Flame, Footprints, Gem, HeartHandshake, Info, LoaderCircle,
  Medal, Moon, Mountain, Plus, Save, Shield, Shirt, Sparkles, Star, Sun, Sunrise, Sword, Target, Trash2, Trophy,
  UserRound, Users, X, Zap,
} from 'lucide-react';
import Wolf from './WolfIcon';
import { BADGE_ICONS, DAY_MARK_KINDS, DAY_MARK_LABELS, DEFAULT_BADGE_DEFINITIONS, describeBadgeFilter, type BadgeFilter, type BadgeIcon, type BadgeKind, type DayMarkKind } from '../lib/competition';
import { deleteBadge, saveBadge } from '../lib/repository';
import { DAY_NAMES } from '../lib/dates';
import type { AdminSession, BadgeDefinition, ScheduleData } from '../types/database';
import { CELEBRANT_PRESETS } from './WeekCelebrantsModal';
import { ANNOTATION_PRESETS } from './MonthAnnotationsModal';
import Modal from './Modal';

const ICONS: Record<BadgeIcon, React.ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string; [key: string]: unknown }>> = {
  sunrise: Sunrise,
  star: Star,
  flame: Flame,
  calendar: CalendarDays,
  medal: Medal,
  heart: HeartHandshake,
  trophy: Trophy,
  crown: Crown,
  sparkles: Sparkles,
  bell: Bell,
  church: Church,
  book: BookOpen,
  cross: Cross,
  shield: Shield,
  zap: Zap,
  target: Target,
  award: Award,
  clock: Clock,
  wolf: Wolf,
  dog: Dog,
  bird: Bird,
  fish: Fish,
  sword: Sword,
  anchor: Anchor,
  gem: Gem,
  compass: Compass,
  feather: Feather,
  mountain: Mountain,
  sun: Sun,
  moon: Moon,
  footprints: Footprints,
  shirt: Shirt,
};

const ICON_LABELS: Record<BadgeIcon, string> = {
  sunrise: 'Wschód słońca',
  star: 'Gwiazdka',
  flame: 'Płomień',
  calendar: 'Kalendarz',
  medal: 'Medal',
  heart: 'Serce',
  trophy: 'Puchar',
  crown: 'Korona',
  sparkles: 'Błysk',
  bell: 'Dzwon',
  church: 'Kościół',
  book: 'Księga',
  cross: 'Krzyż',
  shield: 'Tarcza',
  zap: 'Błyskawica',
  target: 'Cel',
  award: 'Order',
  clock: 'Zegar',
  wolf: 'Wilk',
  dog: 'Pies',
  bird: 'Ptak',
  fish: 'Ryba',
  sword: 'Miecz',
  anchor: 'Kotwica',
  gem: 'Diament',
  compass: 'Kompas',
  feather: 'Pióro',
  mountain: 'Góra',
  sun: 'Słońce',
  moon: 'Księżyc',
  footprints: 'Ślady',
  shirt: 'Alba / Szata',
};

const WEEKDAY_BUTTONS = [1, 2, 3, 4, 5, 6, 0];
const TIME_PRESETS: { label: string; from: string; to: string }[] = [
  { label: 'Rano', from: '04:00', to: '09:00' },
  { label: 'Dzień', from: '09:00', to: '17:00' },
  { label: 'Wieczór', from: '17:00', to: '22:00' },
];

const POINTS_PRESETS = [5, 10, 20, 30, 50, 100];
const TARGET_PRESETS = [3, 5, 10, 15, 20, 30];
const WEEKLY_TARGET_PRESETS = [2, 3, 4, 5, 7];
const MONTHLY_TARGET_PRESETS = [4, 6, 8, 10, 12, 15];
const PERIOD_TARGET_PRESETS = [3, 5, 10, 15, 20, 30];
const STREAK_TARGET_PRESETS = [2, 3, 4, 6, 8, 12];
const TITLE_PRESETS = ['Roraty', 'Pasterka', 'Droga Krzyżowa', 'Gorzkie Żale', 'Rezurekcja'];
const OCCASION_PRESETS = ['Chrzcielna', 'Ślubna', 'Pogrzebowa', 'Odpustowa', 'Prymicyjna'];

function getPeriodPresets(): { label: string; from: string; to: string }[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');

  const firstDayThisMonth = `${year}-${pad(month + 1)}-01`;
  const lastDate = new Date(year, month + 1, 0).getDate();
  const lastDayThisMonth = `${year}-${pad(month + 1)}-${pad(lastDate)}`;

  const todayStr = `${year}-${pad(month + 1)}-${pad(now.getDate())}`;
  const p14 = new Date(now.getTime() + 13 * 86400000);
  const plus14 = `${p14.getFullYear()}-${pad(p14.getMonth() + 1)}-${pad(p14.getDate())}`;

  const p30 = new Date(now.getTime() + 29 * 86400000);
  const plus30 = `${p30.getFullYear()}-${pad(p30.getMonth() + 1)}-${pad(p30.getDate())}`;

  return [
    { label: 'Bieżący miesiąc', from: firstDayThisMonth, to: lastDayThisMonth },
    { label: 'Najbliższe 14 dni', from: todayStr, to: plus14 },
    { label: 'Najbliższe 30 dni', from: todayStr, to: plus30 },
    { label: 'Adwent / Roraty', from: `${year}-12-01`, to: `${year}-12-24` },
    { label: 'Wakacje', from: `${year}-07-01`, to: `${year}-08-31` },
  ];
}

const BADGE_KINDS = [
  {
    id: 'total',
    title: 'W całym sezonie',
    subtitle: 'Suma służb zebranych w trakcie całego sezonu',
    icon: Trophy,
  },
  {
    id: 'time_frame',
    title: 'W jakimś czasie',
    subtitle: 'W tygodniu, miesiącu lub wybranym okresie',
    icon: CalendarDays,
  },
  {
    id: 'streak',
    title: 'Seria „Twój rytm”',
    subtitle: 'Kolejne tygodnie z rzędu z min. 2 służbami (od niedzieli do soboty)',
    icon: Flame,
  },
];

interface Props {
  data: ScheduleData | null;
  session: AdminSession;
  onRefresh: () => Promise<void>;
  onClose: () => void;
  onSaved: (message: string) => void;
}

type Step1 = { name: string; description: string; icon: BadgeIcon; points: string };
type Step2 = {
  kind: BadgeKind;
  target: string;
  perDay: boolean;
  category: 'all' | 'mass' | 'devotion';
  weekdays: number[];
  timeFrom: string;
  timeTo: string;
  dates: string[];
  dateDraft: string;
  dateFrom: string;
  dateTo: string;
  minServers: string;
  maxServers: string;
  serverCountPreset: 'any' | 'solo' | 'duo' | 'small_group' | 'large_group' | 'custom';
  title: string;
  celebrant: string;
  occasion: string;
  dayMark: '' | DayMarkKind;
  dayMarkText: string;
};

const EMPTY_STEP1: Step1 = { name: '', description: '', icon: 'medal', points: '10' };
const EMPTY_STEP2: Step2 = {
  kind: 'total',
  target: '5', perDay: false, category: 'all', weekdays: [],
  timeFrom: '', timeTo: '', dates: [], dateDraft: '',
  dateFrom: '', dateTo: '',
  minServers: '', maxServers: '', serverCountPreset: 'any',
  title: '', celebrant: '', occasion: '', dayMark: '', dayMarkText: '',
};

function step2FromFilters(filters: BadgeFilter | undefined, target: number): Step2 {
  const f = filters ?? {};
  let serverCountPreset: 'any' | 'solo' | 'duo' | 'small_group' | 'large_group' | 'custom' = 'any';
  if (f.minServers === 1 && f.maxServers === 1) serverCountPreset = 'solo';
  else if (f.minServers === 2 && f.maxServers === 2) serverCountPreset = 'duo';
  else if (f.minServers === 3 && f.maxServers === 4) serverCountPreset = 'small_group';
  else if (f.minServers === 4 && (!f.maxServers || f.maxServers <= 0)) serverCountPreset = 'large_group';
  else if (f.minServers || f.maxServers) serverCountPreset = 'custom';

  return {
    kind: f.kind ?? 'total',
    target: String(target),
    perDay: f.perDay === true,
    category: f.category ?? 'all',
    weekdays: [...(f.weekdays ?? [])],
    timeFrom: f.timeFrom ?? '',
    timeTo: f.timeTo ?? '',
    dates: [...(f.dates ?? [])],
    dateDraft: '',
    dateFrom: f.dateFrom ?? '',
    dateTo: f.dateTo ?? '',
    minServers: f.minServers ? String(f.minServers) : '',
    maxServers: f.maxServers ? String(f.maxServers) : '',
    serverCountPreset,
    title: f.title ?? '',
    celebrant: f.celebrant ?? '',
    occasion: f.occasion ?? '',
    dayMark: f.dayMark ?? '',
    dayMarkText: f.dayMarkText ?? '',
  };
}

function buildFilters(step: Step2): BadgeFilter {
  const filters: BadgeFilter = {};
  if (step.kind && step.kind !== 'total') filters.kind = step.kind;
  if (step.kind === 'streak') {
    return filters;
  }
  if (step.kind === 'custom_period') {
    if (step.dateFrom.trim()) filters.dateFrom = step.dateFrom.trim();
    if (step.dateTo.trim()) filters.dateTo = step.dateTo.trim();
  }
  if (step.serverCountPreset !== 'any' && (step.minServers.trim() || step.maxServers.trim())) {
    if (step.minServers.trim()) {
      const n = Number(step.minServers.trim());
      if (Number.isSafeInteger(n) && n >= 1) filters.minServers = n;
    }
    if (step.maxServers.trim()) {
      const n = Number(step.maxServers.trim());
      if (Number.isSafeInteger(n) && n >= 1) filters.maxServers = n;
    }
  }
  if (step.weekdays.length) filters.weekdays = [...step.weekdays].sort((a, b) => a - b);
  if (step.timeFrom.trim()) filters.timeFrom = step.timeFrom.trim();
  if (step.timeTo.trim()) filters.timeTo = step.timeTo.trim();
  if (step.dates.length) filters.dates = [...step.dates].sort();
  if (step.title.trim()) filters.title = step.title.trim();
  if (step.celebrant.trim()) filters.celebrant = step.celebrant.trim();
  if (step.occasion.trim()) filters.occasion = step.occasion.trim();
  if (step.category !== 'all') filters.category = step.category;
  if (step.dayMark) filters.dayMark = step.dayMark;
  if (step.dayMarkText.trim()) filters.dayMarkText = step.dayMarkText.trim();
  if (step.perDay) filters.perDay = true;
  return filters;
}

function summaryFor(target: string, filters: BadgeFilter): string {
  const count = Number(target);
  const kind = filters.kind ?? 'total';
  let base = 'Cel: …';
  if (Number.isSafeInteger(count) && count >= 1) {
    if (kind === 'streak') {
      base = `Cel: ${count} ${count === 1 ? 'tydzień' : (count >= 2 && count <= 4 ? 'tygodnie' : 'tygodni')} w serii`;
    } else {
      base = `Cel: ${count} ${count === 1 ? 'służba' : (count >= 2 && count <= 4 ? 'służby' : 'służb')}`;
    }
  }
  const condition = describeBadgeFilter(filters);
  return condition ? `${base} · ${condition}` : `${base} · dowolne służby`;
}

export type AdminBadgeSort =
  | 'default'
  | 'name_asc'
  | 'name_desc'
  | 'points_desc'
  | 'points_asc'
  | 'target_asc'
  | 'target_desc'
  | 'kind';

const ADMIN_SORT_LABELS: Record<AdminBadgeSort, string> = {
  default: 'Domyślnie',
  name_asc: 'Nazwa (A – Z)',
  name_desc: 'Nazwa (Z – A)',
  points_desc: 'Punkty (najwięcej)',
  points_asc: 'Punkty (najmniej)',
  target_asc: 'Cel (od najmniejszego)',
  target_desc: 'Cel (od największego)',
  kind: 'Rodzaj warunku',
};

export default function AdminBadgesModal({ data, session, onRefresh, onClose, onSaved }: Props) {
  const isDefault = data?.badgeDefinitions === undefined;
  const definitions = data?.badgeDefinitions ?? DEFAULT_BADGE_DEFINITIONS;
  const [sortOrder, setSortOrder] = useState<AdminBadgeSort>('default');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [step1, setStep1] = useState<Step1>(EMPTY_STEP1);
  const [step2, setStep2] = useState<Step2>(EMPTY_STEP2);
  const [stepError, setStepError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const lock = useRef(false);

  const sortedDefinitions = useMemo(() => {
    const list = [...definitions];
    switch (sortOrder) {
      case 'name_asc':
        return list.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
      case 'name_desc':
        return list.sort((a, b) => b.name.localeCompare(a.name, 'pl'));
      case 'points_desc':
        return list.sort((a, b) => b.points - a.points || a.target - b.target || a.name.localeCompare(b.name, 'pl'));
      case 'points_asc':
        return list.sort((a, b) => a.points - b.points || a.target - b.target || a.name.localeCompare(b.name, 'pl'));
      case 'target_asc':
        return list.sort((a, b) => a.target - b.target || a.name.localeCompare(b.name, 'pl'));
      case 'target_desc':
        return list.sort((a, b) => b.target - a.target || a.name.localeCompare(b.name, 'pl'));
      case 'kind': {
        const kindOrder: Record<string, number> = {
          total: 1,
          single_week: 2,
          single_month: 3,
          custom_period: 4,
          streak: 5,
        };
        return list.sort((a, b) => {
          const ka = kindOrder[a.filters?.kind ?? 'total'] ?? 99;
          const kb = kindOrder[b.filters?.kind ?? 'total'] ?? 99;
          return ka - kb || a.target - b.target || a.name.localeCompare(b.name, 'pl');
        });
      }
      default:
        return list;
    }
  }, [definitions, sortOrder]);

  const preview = summaryFor(step2.target, buildFilters(step2));

  const serverFiltersActive = step2.serverCountPreset !== 'any' && Boolean(step2.minServers.trim() || step2.maxServers.trim());

  const timeFiltersCount = (step2.category !== 'all' ? 1 : 0) +
    (step2.weekdays.length > 0 ? 1 : 0) +
    (step2.timeFrom.trim() || step2.timeTo.trim() ? 1 : 0) +
    (step2.dates.length > 0 ? 1 : 0);

  const liturgicalFiltersCount = (step2.title.trim() ? 1 : 0) +
    (step2.celebrant.trim() ? 1 : 0) +
    (step2.dayMark || step2.dayMarkText.trim() ? 1 : 0) +
    (step2.occasion.trim() ? 1 : 0);

  const PreviewIcon = ICONS[step1.icon] ?? Medal;
  const pointsNum = Number(step1.points);
  const displayPoints = Number.isFinite(pointsNum) && pointsNum >= 0 ? pointsNum : 0;

  function startAdd() {
    setEditingId(null);
    setStep1(EMPTY_STEP1);
    setStep2(EMPTY_STEP2);
    setStep(1);
    setStepError('');
    setWizardOpen(true);
    setError('');
  }

  function startEdit(def: BadgeDefinition) {
    setEditingId(def.id);
    setStep1({ name: def.name, description: def.description, icon: def.icon, points: String(def.points) });
    setStep2(step2FromFilters(def.filters, def.target));
    setStep(1);
    setStepError('');
    setWizardOpen(true);
    setError('');
  }

  function goStep2() {
    setStepError('');
    if (!step1.name.trim()) { setStepError('Wpisz nazwę odznaki.'); return; }
    const points = step1.points.trim() === '' ? NaN : Number(step1.points);
    if (!Number.isSafeInteger(points) || points < 0 || points > 1000) {
      setStepError('Nagroda musi wynosić od 0 do 1000 punktów.');
      return;
    }
    (document.activeElement as HTMLElement | null)?.blur();
    setStep(2);
  }

  const handleModalClose = () => {
    if (busy) return;
    if (wizardOpen) {
      setWizardOpen(false);
      setEditingId(null);
      setStep(1);
      setStepError('');
    } else {
      onClose();
    }
  };

  async function handleSubmit(event?: FormEvent | React.MouseEvent) {
    if (event) event.preventDefault();
    if (step === 1) {
      goStep2();
      return;
    }
    if (lock.current) return;
    const points = step1.points.trim() === '' ? NaN : Number(step1.points);
    const target = step2.target.trim() === '' ? NaN : Number(step2.target);
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const id = await saveBadge(
        { id: editingId ?? undefined, name: step1.name, description: step1.description, icon: step1.icon, points, target, filters: buildFilters(step2) },
        session,
      );
      void id;
      setWizardOpen(false);
      setEditingId(null);
      onSaved(editingId ? 'Zapisano odznakę.' : 'Dodano nową odznakę.');
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nie udało się zapisać odznaki.');
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
    try {
      await deleteBadge(id, session);
      setDeleteId(null);
      onSaved('Usunięto odznakę.');
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nie udało się usunąć odznaki.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function toggleWeekday(dow: number) {
    setStep2(prev => prev.weekdays.includes(dow)
      ? { ...prev, weekdays: prev.weekdays.filter(d => d !== dow) }
      : { ...prev, weekdays: [...prev.weekdays, dow] });
  }

  function addDate() {
    const value = step2.dateDraft;
    if (!value) return;
    setStep2(prev => prev.dates.includes(value)
      ? { ...prev, dateDraft: '' }
      : { ...prev, dates: [...prev.dates, value].sort(), dateDraft: '' });
  }

  /**
   * Enter w polu tekstowym przeglądarka zamienia na niejawną wysyłkę formularza,
   * co na kroku 2 zapisywało odznakę i zamykało kreator (np. po wpisaniu daty).
   * Zapis jest możliwy tylko jawnym przyciskiem „Dodaj odznakę / Zapisz zmiany”,
   * a Enter w polu daty dodaje datę do listy.
   */
  function handleWizardKeyDown(event: ReactKeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement | null;
    if (!target || target.tagName !== 'INPUT') return;
    event.preventDefault();
    if (target.getAttribute('data-enter') === 'add-date') addDate();
  }

  return <Modal title={wizardOpen ? (editingId ? 'Edycja odznaki' : 'Nowa odznaka') : 'Odznaki — edycja administratora'} onClose={handleModalClose} busy={busy} className="admin-badges-modal">
    {isDefault && !wizardOpen && <p className="field-hint">Wyświetlany jest zestaw podstawowy. Pierwsza zmiana zapisze go jako listę edytowalną.</p>}
    {error && <p className="form-error mb-3" role="alert">{error}</p>}

    {!wizardOpen ? (
      <div className="badge-list-view">
        <div className="badge-list-toolbar">
          <button type="button" className="button primary" disabled={busy} onClick={startAdd}><Plus size={16} />Dodaj odznakę</button>
          {definitions.length > 1 && (
            <div className="badge-sort-control">
              <div className="badge-sort-display" aria-hidden="true">
                <ArrowUpDown size={14} />
                <span className="badge-sort-prefix">Sortuj:</span>
                <span className="badge-sort-value">{ADMIN_SORT_LABELS[sortOrder]}</span>
                <ChevronDown size={14} className="badge-sort-chevron" />
              </div>
              <select
                id="admin-badge-sort"
                className="badge-sort-select"
                value={sortOrder}
                onChange={e => setSortOrder(e.target.value as AdminBadgeSort)}
                aria-label="Sortowanie odznak"
              >
                <option value="default">Domyślnie</option>
                <option value="name_asc">Nazwa: A – Z</option>
                <option value="name_desc">Nazwa: Z – A</option>
                <option value="points_desc">Punkty: od najwyższych</option>
                <option value="points_asc">Punkty: od najniższych</option>
                <option value="target_asc">Cel: od najmniejszego</option>
                <option value="target_desc">Cel: od największego</option>
                <option value="kind">Rodzaj warunku</option>
              </select>
            </div>
          )}
        </div>
        <div className="badge-list-body">
          {definitions.length === 0 ? (
            <div className="community-badges-empty">
              <Award size={32} strokeWidth={1.5} aria-hidden="true" />
              <h4>Brak odznak</h4>
              <p>Lista jest pusta. Dodaj pierwszą odznakę przyciskiem powyżej — w kroku 1 wybierzesz nazwę, opis, ikonę i nagrodę, a w kroku 2 warunek.</p>
            </div>
          ) : (
            <ul className="servers-cards-list badge-items-list">
              {sortedDefinitions.map(def => {
                const Icon = ICONS[def.icon] ?? Medal;
                const isDeleting = deleteId === def.id;
                // Starsze wiersze (sprzed filtrów) nie mają filters — traktuj jak dowolne służby.
                const defFilters = def.filters ?? {};
                const condition = describeBadgeFilter(defFilters);
                return <li key={def.id} className="server-admin-card">
                  <div className="server-card-content">
                    <div className="server-card-info">
                      <div className="server-header-row">
                        <span className="competition-badge-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.6} /></span>
                        <div>
                          <strong>{def.name}</strong>
                          <span className="server-rank-badge">
                            Cel: {defFilters.kind === 'streak'
                              ? `${def.target} ${def.target === 1 ? 'tydzień' : def.target < 5 ? 'tygodnie' : 'tygodni'} w serii`
                              : (defFilters.kind === 'single_week'
                                ? `${def.target} ${def.target === 1 ? 'służba' : def.target < 5 ? 'służby' : 'służb'} w tyg.`
                                : (defFilters.kind === 'single_month'
                                  ? `${def.target} ${def.target === 1 ? 'służba' : def.target < 5 ? 'służby' : 'służb'} w mies.`
                                  : (defFilters.kind === 'custom_period'
                                    ? `${def.target} ${def.target === 1 ? 'służba' : def.target < 5 ? 'służby' : 'służb'} w okresie`
                                    : `${def.target} ${def.target === 1 ? 'służba' : def.target < 5 ? 'służby' : 'służb'}`)))} · +{def.points} pkt
                          </span>
                        </div>
                      </div>
                      {def.description && <p className="text-xs text-[var(--muted)] mt-1">{def.description}</p>}
                      <p className="badge-condition-admin">{condition || 'Dowolne służby w sezonie'}</p>
                    </div>
                    <div className="server-card-actions">
                      {isDeleting ? (
                        <div className="delete-confirm-box">
                          <span className="text-xs text-red-700">Usunąć „{def.name}”?</span>
                          <div className="flex gap-1 mt-1">
                            <button type="button" className="button secondary text-xs py-1 px-2" onClick={() => setDeleteId(null)} disabled={busy}>Nie</button>
                            <button type="button" className="button danger text-xs py-1 px-2" onClick={() => void handleDelete(def.id)} disabled={busy}>
                              {busy ? <LoaderCircle size={12} className="animate-spin" /> : 'Tak, usuń'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button type="button" className="button secondary text-xs" disabled={busy} onClick={() => startEdit(def)}>Edytuj</button>
                          <button type="button" className="icon-button delete-icon" title={`Usuń odznakę ${def.name}`} disabled={busy} onClick={() => setDeleteId(def.id)}>
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>;
              })}
            </ul>
          )}
        </div>
      </div>
    ) : (
      <form onSubmit={handleSubmit} onKeyDown={handleWizardKeyDown} className="badge-wizard-form">
        <div className="badge-wizard-header">
          <ol className="badge-steps" aria-label="Postęp dodawania odznaki">
            <li
              aria-current={step === 1 ? 'step' : undefined}
              className={step === 1 ? 'is-active' : 'is-done'}
              onClick={() => { if (step === 2 && !busy) setStep(1); }}
              style={{ cursor: step === 2 ? 'pointer' : 'default' }}
            >
              <span aria-hidden="true">{step === 2 ? <Check size={14} strokeWidth={2.5} /> : '1'}</span>
              <div className="badge-step-content">
                <strong className="badge-step-name">Podstawy</strong>
                <span className="badge-step-desc">Wygląd i nagroda</span>
              </div>
            </li>
            <li
              aria-current={step === 2 ? 'step' : undefined}
              className={step === 2 ? 'is-active' : ''}
            >
              <span aria-hidden="true">2</span>
              <div className="badge-step-content">
                <strong className="badge-step-name">Za co</strong>
                <span className="badge-step-desc">Warunki i kryteria</span>
              </div>
            </li>
          </ol>
        </div>

        <div className="badge-wizard-body">
          {step === 1 ? (
            <div className="badge-step-content-area space-y-4">
              <div className="badge-live-preview-box">
                <div className="preview-header">
                  <span className="flex items-center gap-1.5"><Sparkles size={14} />Podgląd na żywo</span>
                  <span className="text-[11px] font-normal text-[var(--muted)]">Widok odznaki na profilu</span>
                </div>
                <div className="badge-preview-card">
                  <div className="badge-preview-top">
                    <div className="badge-preview-icon-wrapper">
                      <span className={`competition-badge-icon badge-${step1.icon}`}>
                        <PreviewIcon size={24} strokeWidth={1.6} aria-hidden="true" />
                      </span>
                      <div className="badge-preview-titles">
                        <strong>{step1.name.trim() || 'Nazwa nowej odznaki…'}</strong>
                        <p>{step1.description.trim() || 'Krótki opis za co przyznawana jest ta odznaka…'}</p>
                      </div>
                    </div>
                    <span className="competition-badge-reward">+{displayPoints} pkt</span>
                  </div>
                </div>
              </div>

              <div className="badge-form-card">
                <div className="badge-form-card-header">
                  <h3 className="badge-form-card-title"><BookOpen size={16} />Podstawowe dane</h3>
                </div>

                <label className="field">
                  <span className="field-label">Nazwa odznaki</span>
                  <input value={step1.name} maxLength={80} required autoFocus disabled={busy} onChange={e => setStep1(f => ({ ...f, name: e.target.value }))} placeholder="np. Wierny ministrant, Poranny ptaszek" />
                </label>

                <label className="field">
                  <span className="field-label">Opis <span className="field-optional">(opcjonalnie)</span></span>
                  <textarea value={step1.description} maxLength={240} rows={2} disabled={busy} onChange={e => setStep1(f => ({ ...f, description: e.target.value }))} placeholder="Np. za regularną służbę w sezonie lub niedziele" />
                </label>
              </div>

              <div className="badge-form-card">
                <div className="badge-form-card-header">
                  <h3 className="badge-form-card-title"><Sparkles size={16} />Wygląd i nagroda</h3>
                </div>

                <fieldset className="field" disabled={busy}>
                  <legend>Ikona</legend>
                  <div className="badge-icon-picker" role="radiogroup" aria-label="Wybierz ikonę odznaki">
                    {BADGE_ICONS.map(icon => {
                      const Icon = ICONS[icon];
                      const selected = step1.icon === icon;
                      return <button key={icon} type="button" role="radio" aria-checked={selected} title={ICON_LABELS[icon]} aria-label={ICON_LABELS[icon]} disabled={busy}
                        className={`badge-icon-option${selected ? ' is-selected' : ''}`} onClick={() => setStep1(f => ({ ...f, icon }))}>
                        <Icon size={22} strokeWidth={1.6} aria-hidden="true" />
                        <span className="badge-icon-title">{ICON_LABELS[icon]}</span>
                      </button>;
                    })}
                  </div>
                </fieldset>

                <div className="space-y-2">
                  <label className="field">
                    <span className="field-label">Nagroda (pkt)</span>
                    <input type="number" inputMode="numeric" min={0} max={1000} step={1} value={step1.points} required disabled={busy} onChange={e => setStep1(f => ({ ...f, points: e.target.value }))} />
                  </label>
                  <div className="preset-chips" role="group" aria-label="Szybki wybór punktów">
                    {POINTS_PRESETS.map(pts => (
                      <button
                        key={pts}
                        type="button"
                        disabled={busy}
                        className={step1.points === String(pts) ? 'is-active' : ''}
                        onClick={() => setStep1(f => ({ ...f, points: String(pts) }))}
                      >
                        +{pts} pkt
                      </button>
                    ))}
                  </div>
                  <p className="field-hint">Punkty zostaną dopisane ministrantowi w momencie zdobycia odznaki.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="badge-step-content-area space-y-4">
              <div className="badge-summary-card">
                <div className="badge-summary-box" aria-live="polite"><strong>Podsumowanie:</strong><span>{preview}</span></div>
                <p className="badge-summary-hint">
                  <Info size={13} className="shrink-0" />
                  Puste filtry oznaczają dowolne służby. Uzupełnij tylko te kryteria, które muszą być spełnione.
                </p>
              </div>

              <div className="badge-form-card">
                <div className="badge-form-card-header">
                  <h3 className="badge-form-card-title"><Target size={16} />Rodzaj celu odznaki</h3>
                </div>

                <div className="badge-kind-selector" role="radiogroup" aria-label="Wybierz rodzaj celu odznaki">
                  {BADGE_KINDS.map(k => {
                    const Icon = k.icon;
                    const isTimeFrameKind = step2.kind === 'single_week' || step2.kind === 'single_month' || step2.kind === 'custom_period';
                    const isSelected = k.id === 'total'
                      ? step2.kind === 'total'
                      : (k.id === 'time_frame'
                        ? isTimeFrameKind
                        : step2.kind === 'streak');
                    return (
                      <button
                        key={k.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        disabled={busy}
                        className={`badge-kind-card${isSelected ? ' is-active' : ''}`}
                        onClick={() => {
                          setStep2(f => {
                            if (k.id === 'total') {
                              return { ...f, kind: 'total', target: Number(f.target) < 3 ? '10' : f.target };
                            }
                            if (k.id === 'streak') {
                              return { ...f, kind: 'streak', target: Number(f.target) > 20 || Number(f.target) <= 1 ? '4' : f.target };
                            }
                            const currentTfKind = (f.kind === 'single_week' || f.kind === 'single_month' || f.kind === 'custom_period')
                              ? f.kind
                              : 'single_week';
                            let target = f.target;
                            if (currentTfKind === 'single_week' && (Number(f.target) > 7 || Number(f.target) <= 1)) target = '3';
                            if (currentTfKind === 'single_month' && (Number(f.target) > 20 || Number(f.target) <= 1)) target = '8';
                            return { ...f, kind: currentTfKind, target };
                          });
                        }}
                      >
                        <div className="badge-kind-header">
                          <div className="badge-kind-icon">
                            <Icon size={18} strokeWidth={1.8} />
                          </div>
                          <div className="badge-kind-check">
                            {isSelected && <Check size={13} strokeWidth={2.5} />}
                          </div>
                        </div>
                        <strong className="badge-kind-title">{k.title}</strong>
                        <p className="badge-kind-desc">{k.subtitle}</p>
                      </button>
                    );
                  })}
                </div>

                {(step2.kind === 'single_week' || step2.kind === 'single_month' || step2.kind === 'custom_period') && (
                  <div className="badge-timeframe-box p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] space-y-3">
                    <div>
                      <span className="field-label block mb-1 text-xs font-semibold text-[var(--ink)]">Okres do zaliczenia celu:</span>
                      <div className="preset-chips" role="radiogroup" aria-label="Wybierz ramy czasowe">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={step2.kind === 'single_week'}
                          className={step2.kind === 'single_week' ? 'is-active' : ''}
                          disabled={busy}
                          onClick={() => setStep2(f => ({
                            ...f,
                            kind: 'single_week',
                            target: Number(f.target) > 7 || Number(f.target) <= 1 ? '3' : f.target,
                          }))}
                        >
                          <CalendarRange size={14} /> W jednym tygodniu
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={step2.kind === 'single_month'}
                          className={step2.kind === 'single_month' ? 'is-active' : ''}
                          disabled={busy}
                          onClick={() => setStep2(f => ({
                            ...f,
                            kind: 'single_month',
                            target: Number(f.target) > 20 || Number(f.target) <= 1 ? '8' : f.target,
                          }))}
                        >
                          <Calendar size={14} /> W jednym miesiącu
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={step2.kind === 'custom_period'}
                          className={step2.kind === 'custom_period' ? 'is-active' : ''}
                          disabled={busy}
                          onClick={() => setStep2(f => ({
                            ...f,
                            kind: 'custom_period',
                            target: Number(f.target) < 2 ? '5' : f.target,
                          }))}
                        >
                          <CalendarCheck size={14} /> Wybrany okres
                        </button>
                      </div>
                      <p className="field-hint mt-1 text-xs">
                        {step2.kind === 'single_week' && 'Najlepszy wynik w dowolnym 1 tygodniu (od niedzieli do soboty) w sezonie.'}
                        {step2.kind === 'single_month' && 'Najlepszy wynik w dowolnym 1 miesiącu kalendarzowym w sezonie.'}
                        {step2.kind === 'custom_period' && 'Zliczane są tylko służby zrealizowane w wybranym przedziale dat (np. Adwent, wakacje).'}
                      </p>
                    </div>

                    {step2.kind === 'custom_period' && (
                      <div className="pt-2 border-t border-[var(--border)] space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <label className="field">
                            Data początkowa (od)
                            <input
                              type="date"
                              value={step2.dateFrom}
                              disabled={busy}
                              onChange={e => setStep2(f => ({ ...f, dateFrom: e.target.value }))}
                            />
                          </label>
                          <label className="field">
                            Data końcowa (do)
                            <input
                              type="date"
                              value={step2.dateTo}
                              disabled={busy}
                              onChange={e => setStep2(f => ({ ...f, dateTo: e.target.value }))}
                            />
                          </label>
                        </div>
                        <div>
                          <span className="field-hint mb-1 block">Szybkie propozycje okresu:</span>
                          <div className="preset-chips" role="group" aria-label="Szybki wybór zakresu dat">
                            {getPeriodPresets().map(preset => (
                              <button
                                key={preset.label}
                                type="button"
                                disabled={busy}
                                className={step2.dateFrom === preset.from && step2.dateTo === preset.to ? 'is-active' : ''}
                                onClick={() => setStep2(f => ({ ...f, dateFrom: preset.from, dateTo: preset.to }))}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className={`grid grid-cols-1 ${step2.kind !== 'streak' ? 'sm:grid-cols-2' : ''} gap-4`}>
                  <div className="space-y-2">
                    <label className="field">
                      {step2.kind === 'streak'
                        ? 'Cel (liczba tygodni w serii)'
                        : (step2.kind === 'single_week'
                          ? 'Cel (liczba służb w jednym tygodniu)'
                          : (step2.kind === 'single_month'
                            ? 'Cel (liczba służb w jednym miesiącu)'
                            : (step2.kind === 'custom_period'
                              ? 'Cel (liczba służb w wybranym okresie)'
                              : 'Cel (liczba służb)')))}
                      <input type="number" inputMode="numeric" min={1} max={1000} step={1} value={step2.target} required disabled={busy} onChange={e => setStep2(f => ({ ...f, target: e.target.value }))} />
                    </label>
                    <div className="preset-chips" role="group" aria-label="Szybki wybór celu">
                      {(step2.kind === 'streak'
                        ? STREAK_TARGET_PRESETS
                        : (step2.kind === 'single_week'
                          ? WEEKLY_TARGET_PRESETS
                          : (step2.kind === 'single_month'
                            ? MONTHLY_TARGET_PRESETS
                            : (step2.kind === 'custom_period'
                              ? PERIOD_TARGET_PRESETS
                              : TARGET_PRESETS)))).map(preset => (
                        <button
                          key={preset}
                          type="button"
                          disabled={busy}
                          className={step2.target === String(preset) ? 'is-active' : ''}
                          onClick={() => setStep2(f => ({ ...f, target: String(preset) }))}
                        >
                          {preset} {step2.kind === 'streak'
                            ? (preset === 1 ? 'tydzień' : preset < 5 ? 'tygodnie' : 'tygodni')
                            : (preset === 1 ? 'służba' : preset < 5 ? 'służby' : 'służb')}
                        </button>
                      ))}
                    </div>
                  </div>
                  {step2.kind !== 'streak' && (
                    <div className="field">
                      <span className="field-label">Liczenie służb</span>
                      <div className="preset-chips" role="group" aria-label="Liczenie służb">
                        <button type="button" aria-pressed={!step2.perDay} disabled={busy} className={step2.perDay ? '' : 'is-active'} onClick={() => setStep2(f => ({ ...f, perDay: false }))}>Każda służba</button>
                        <button type="button" aria-pressed={step2.perDay} disabled={busy} className={step2.perDay ? 'is-active' : ''} onClick={() => setStep2(f => ({ ...f, perDay: true }))}>Max 1 dziennie</button>
                      </div>
                      <p className="field-hint">
                        {step2.perDay ? 'Maksymalnie 1 zaliczona służba każdego dnia.' : 'Każda obecność na służbie przybliża do celu.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {step2.kind !== 'streak' && (
                <>
                  <div className="badge-form-card">
                    <div className="badge-form-card-header">
                      <h3 className="badge-form-card-title"><Users size={16} />Liczba służących (wielkość asysty)</h3>
                      {serverFiltersActive ? (
                        <span className="badge-active-filter-pill">Aktywne</span>
                      ) : (
                        <span className="field-optional">Dowolna liczba</span>
                      )}
                    </div>

                    <fieldset className="badge-filter-group" disabled={busy}>
                      <legend>Wymagana liczba służących na Mszy / nabożeństwie</legend>
                      <div className="preset-chips" role="radiogroup" aria-label="Wybierz wielkość asysty">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={step2.serverCountPreset === 'any'}
                          className={step2.serverCountPreset === 'any' ? 'is-active' : ''}
                          disabled={busy}
                          onClick={() => setStep2(f => ({ ...f, serverCountPreset: 'any', minServers: '', maxServers: '' }))}
                        >
                          Dowolna asysta
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={step2.serverCountPreset === 'solo'}
                          className={step2.serverCountPreset === 'solo' ? 'is-active' : ''}
                          disabled={busy}
                          onClick={() => setStep2(f => ({ ...f, serverCountPreset: 'solo', minServers: '1', maxServers: '1' }))}
                        >
                          <UserRound size={14} /> Solo (samemu – 1 osoba)
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={step2.serverCountPreset === 'duo'}
                          className={step2.serverCountPreset === 'duo' ? 'is-active' : ''}
                          disabled={busy}
                          onClick={() => setStep2(f => ({ ...f, serverCountPreset: 'duo', minServers: '2', maxServers: '2' }))}
                        >
                          <Users size={14} /> W duecie (2 osoby)
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={step2.serverCountPreset === 'small_group'}
                          className={step2.serverCountPreset === 'small_group' ? 'is-active' : ''}
                          disabled={busy}
                          onClick={() => setStep2(f => ({ ...f, serverCountPreset: 'small_group', minServers: '3', maxServers: '4' }))}
                        >
                          <Users size={14} /> 3–4 osoby
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={step2.serverCountPreset === 'large_group'}
                          className={step2.serverCountPreset === 'large_group' ? 'is-active' : ''}
                          disabled={busy}
                          onClick={() => setStep2(f => ({ ...f, serverCountPreset: 'large_group', minServers: '4', maxServers: '' }))}
                        >
                          <Users size={14} /> Duża asysta (min. 4)
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={step2.serverCountPreset === 'custom'}
                          className={step2.serverCountPreset === 'custom' ? 'is-active' : ''}
                          disabled={busy}
                          onClick={() => setStep2(f => ({ ...f, serverCountPreset: 'custom' }))}
                        >
                          Własna liczba…
                        </button>
                      </div>

                      <p className="field-hint mt-2 text-xs">
                        {step2.serverCountPreset === 'any' && 'Zliczane są wszystkie służby niezależnie od liczby służących.'}
                        {step2.serverCountPreset === 'solo' && 'Zliczane są tylko służby, na których ministrant służył samemu (brak innych potwierdzonych służących).'}
                        {step2.serverCountPreset === 'duo' && 'Zliczane są tylko służby dokładnie we dwóch służących.'}
                        {step2.serverCountPreset === 'small_group' && 'Zliczane są tylko służby w zespole 3 lub 4 służących.'}
                        {step2.serverCountPreset === 'large_group' && 'Zliczane są tylko służby z liczną asystą (co najmniej 4 służących na Mszy).'}
                        {step2.serverCountPreset === 'custom' && 'Własny zakres lub dokładna liczba służących na Mszy.'}
                      </p>

                      {step2.serverCountPreset === 'custom' && (
                        <div className="pt-3 mt-2 border-t border-[var(--border)] space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label className="field">
                              Minimalna liczba osób (od)
                              <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={50}
                                placeholder="Dowolna"
                                value={step2.minServers}
                                disabled={busy}
                                onChange={e => setStep2(f => ({ ...f, minServers: e.target.value }))}
                              />
                            </label>
                            <label className="field">
                              Maksymalna liczba osób (do)
                              <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={50}
                                placeholder="Dowolna"
                                value={step2.maxServers}
                                disabled={busy}
                                onChange={e => setStep2(f => ({ ...f, maxServers: e.target.value }))}
                              />
                            </label>
                          </div>
                          <p className="field-hint text-xs">
                            Wpisz tę samą liczbę w obu polach dla dokładnej liczby (np. dokładnie 3) lub pozostaw jedno pole puste dla progu otwartego (np. od 5 osób).
                          </p>
                        </div>
                      )}
                    </fieldset>
                  </div>
                  <div className="badge-form-card">
                    <div className="badge-form-card-header">
                      <h3 className="badge-form-card-title"><CalendarDays size={16} />Czas i kalendarz</h3>
                      {timeFiltersCount > 0 ? (
                        <span className="badge-active-filter-pill">Aktywne: {timeFiltersCount}</span>
                      ) : (
                        <span className="field-optional">Dowolny termin</span>
                      )}
                    </div>

                    <fieldset className="badge-filter-group" disabled={busy}>
                      <legend>Rodzaj wydarzenia</legend>
                      <div className="preset-chips" role="group" aria-label="Rodzaj wydarzenia">
                        {([['all', 'Wszystkie'], ['mass', 'Msze Święte'], ['devotion', 'Nabożeństwa']] as const).map(([value, label]) => (
                          <button key={value} type="button" aria-pressed={step2.category === value} disabled={busy}
                            className={step2.category === value ? 'is-active' : ''} onClick={() => setStep2(f => ({ ...f, category: value }))}>{label}</button>
                        ))}
                      </div>
                    </fieldset>

                    <fieldset className="badge-filter-group" disabled={busy}>
                      <legend>Dni tygodnia <span className="field-optional">(puste = wszystkie)</span></legend>
                      <div className="weekday-selector-grid">
                        {WEEKDAY_BUTTONS.map(dow => {
                          const isSelected = step2.weekdays.includes(dow);
                          return <button key={dow} type="button" aria-pressed={isSelected} disabled={busy}
                            className={`weekday-pill${isSelected ? ' active' : ''}`} onClick={() => toggleWeekday(dow)}>
                            {DAY_NAMES[dow].slice(0, 2)}
                          </button>;
                        })}
                      </div>
                      <div className="preset-chips mt-2">
                        <button type="button" disabled={busy} className={step2.weekdays.length === 0 ? 'is-active' : ''} onClick={() => setStep2(f => ({ ...f, weekdays: [] }))}>Wszystkie dni</button>
                        <button type="button" disabled={busy} className={step2.weekdays.length === 6 && !step2.weekdays.includes(0) ? 'is-active' : ''} onClick={() => setStep2(f => ({ ...f, weekdays: [1, 2, 3, 4, 5, 6] }))}>Dni powszednie</button>
                        <button type="button" disabled={busy} className={step2.weekdays.length === 1 && step2.weekdays.includes(0) ? 'is-active' : ''} onClick={() => setStep2(f => ({ ...f, weekdays: [0] }))}>Tylko niedziele</button>
                      </div>
                    </fieldset>

                    <fieldset className="badge-filter-group" disabled={busy}>
                      <legend>Godziny służby <span className="field-optional">(puste = cały dzień)</span></legend>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="field">Od<input type="time" value={step2.timeFrom} disabled={busy} onChange={e => setStep2(f => ({ ...f, timeFrom: e.target.value }))} /></label>
                        <label className="field">Do<input type="time" value={step2.timeTo} disabled={busy} onChange={e => setStep2(f => ({ ...f, timeTo: e.target.value }))} /></label>
                      </div>
                      <div className="preset-chips">
                        {TIME_PRESETS.map(preset => (
                          <button key={preset.label} type="button" disabled={busy}
                            className={step2.timeFrom === preset.from && step2.timeTo === preset.to ? 'is-active' : ''}
                            onClick={() => setStep2(f => ({ ...f, timeFrom: preset.from, timeTo: preset.to }))}>{preset.label} {preset.from}–{preset.to}</button>
                        ))}
                        <button type="button" disabled={busy} className={!step2.timeFrom && !step2.timeTo ? 'is-active' : ''} onClick={() => setStep2(f => ({ ...f, timeFrom: '', timeTo: '' }))}>Cały dzień</button>
                      </div>
                      <p className="field-hint">Zakres „od” późniejszy niż „do” liczy służby przez północ (np. Pasterka 18:00–04:00).</p>
                    </fieldset>

                    <fieldset className="badge-filter-group" disabled={busy}>
                      <legend>Konkretne daty <span className="field-optional">(opcjonalnie)</span></legend>
                      {step2.dates.length > 0 && <ul className="badge-date-list">
                        {step2.dates.map(day => <li key={day}><span>{day}</span>
                          <button type="button" className="icon-button" aria-label={`Usuń datę ${day}`} disabled={busy}
                            onClick={() => setStep2(f => ({ ...f, dates: f.dates.filter(d => d !== day) }))}><X size={15} /></button>
                        </li>)}
                      </ul>}
                      <div className="badge-date-add">
                        <label className="field">Dodaj datę<input type="date" value={step2.dateDraft} disabled={busy} data-enter="add-date" onChange={e => setStep2(f => ({ ...f, dateDraft: e.target.value }))} /></label>
                        <button type="button" className="button secondary" disabled={busy || !step2.dateDraft} onClick={addDate}><Plus size={15} />Dodaj</button>
                      </div>
                    </fieldset>
                  </div>

                  <div className="badge-form-card">
                    <div className="badge-form-card-header">
                      <h3 className="badge-form-card-title"><Sparkles size={16} />Szczegóły liturgiczne</h3>
                      {liturgicalFiltersCount > 0 ? (
                        <span className="badge-active-filter-pill">Aktywne: {liturgicalFiltersCount}</span>
                      ) : (
                        <span className="field-optional">Opcjonalne filtry</span>
                      )}
                    </div>

                    <fieldset className="badge-filter-group" disabled={busy}>
                      <legend>Nazwa wydarzenia <span className="field-optional">(zawiera tekst)</span></legend>
                      <label className="field">Nazwa zawiera<input value={step2.title} maxLength={60} disabled={busy} onChange={e => setStep2(f => ({ ...f, title: e.target.value }))} placeholder="np. Roraty, Pasterka, Droga Krzyżowa" /></label>
                      <div className="preset-chips">
                        {TITLE_PRESETS.map(preset => (
                          <button key={preset} type="button" disabled={busy} className={step2.title === preset ? 'is-active' : ''} onClick={() => setStep2(f => ({ ...f, title: f.title === preset ? '' : preset }))}>{preset}</button>
                        ))}
                      </div>
                      <p className="field-hint">Wielkość liter i polskie znaki nie mają znaczenia.</p>
                    </fieldset>

                    <fieldset className="badge-filter-group" disabled={busy}>
                      <legend>Celebrans <span className="field-optional">(służba u danego księdza)</span></legend>
                      <label className="field">Celebrans zawiera<input value={step2.celebrant} maxLength={60} disabled={busy} onChange={e => setStep2(f => ({ ...f, celebrant: e.target.value }))} placeholder="np. ks. Proboszcz" /></label>
                      <div className="preset-chips">
                        {CELEBRANT_PRESETS.map(preset => (
                          <button key={preset} type="button" disabled={busy} className={step2.celebrant === preset ? 'is-active' : ''} onClick={() => setStep2(f => ({ ...f, celebrant: f.celebrant === preset ? '' : preset }))}>{preset}</button>
                        ))}
                      </div>
                    </fieldset>

                    <fieldset className="badge-filter-group" disabled={busy}>
                      <legend>Oznaczenie dnia <span className="field-optional">(uroczystość, święto…)</span></legend>
                      <div className="space-y-3">
                        <label className="field">Rodzaj oznaczenia
                          <select value={step2.dayMark} disabled={busy} onChange={e => setStep2(f => ({ ...f, dayMark: e.target.value as Step2['dayMark'] }))}>
                            <option value="">Dowolne dni</option>
                            {DAY_MARK_KINDS.map(kind => <option key={kind} value={kind}>{DAY_MARK_LABELS[kind]}</option>)}
                          </select>
                        </label>
                        <label className="field">Tekst oznaczenia zawiera <span className="field-optional">(opcjonalnie)</span>
                          <input value={step2.dayMarkText} maxLength={120} disabled={busy} onChange={e => setStep2(f => ({ ...f, dayMarkText: e.target.value }))} placeholder="np. Wszystkich Świętych" />
                        </label>
                        <div className="preset-chips">
                          {ANNOTATION_PRESETS.map(preset => (
                            <button key={preset} type="button" disabled={busy} className={step2.dayMarkText === preset ? 'is-active' : ''} onClick={() => setStep2(f => ({ ...f, dayMarkText: f.dayMarkText === preset ? '' : preset }))}>{preset}</button>
                          ))}
                        </div>
                      </div>
                      <p className="field-hint">Oznaczenia ustawia administrator w „Oznaczaniu dni” nad grafikiem.</p>
                    </fieldset>

                    <fieldset className="badge-filter-group" disabled={busy}>
                      <legend>Okazja / opis wydarzenia <span className="field-optional">(zawiera tekst)</span></legend>
                      <label className="field">Okazja zawiera<input value={step2.occasion} maxLength={60} disabled={busy} onChange={e => setStep2(f => ({ ...f, occasion: e.target.value }))} placeholder="np. Chrzciny, ślub, Nowenna" /></label>
                      <div className="preset-chips">
                        {OCCASION_PRESETS.map(preset => (
                          <button key={preset} type="button" disabled={busy} className={step2.occasion === preset ? 'is-active' : ''} onClick={() => setStep2(f => ({ ...f, occasion: f.occasion === preset ? '' : preset }))}>{preset}</button>
                        ))}
                      </div>
                      <p className="field-hint">Chodzi o pole „Okazja” przy wydarzeniu (np. Chrzcielna, Ślubna).</p>
                    </fieldset>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="modal-actions badge-wizard-actions">
          {stepError && <p className="form-error w-full mb-1" role="alert">{stepError}</p>}
          <div className="badge-wizard-action-buttons">
            {step === 1 ? (
              <>
                <button type="button" key="btn-step1-cancel" className="button secondary" disabled={busy} onClick={handleModalClose}><X size={15} />Anuluj</button>
                <button type="button" key="btn-step1-next" className="button primary" disabled={busy} onClick={goStep2}>Dalej: za co<ArrowRight size={16} /></button>
              </>
            ) : (
              <>
                <button type="button" key="btn-step2-back" className="button secondary" disabled={busy} onClick={() => { setStep(1); setStepError(''); }}><ArrowLeft size={15} />Wstecz</button>
                <button type="button" key="btn-step2-submit" className="button primary" disabled={busy} onClick={handleSubmit}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}{editingId ? 'Zapisz zmiany' : 'Dodaj odznakę'}</button>
              </>
            )}
          </div>
        </div>
      </form>
    )}
  </Modal>;
}
