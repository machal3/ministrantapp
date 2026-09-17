import { dateKey, DAY_SHORT, polishDate, shiftDate, timeSlot, weekday, zonedIso } from './dates';
import { eventCategory } from './eventCategory';
import type { Mass, ScheduleData } from '../types/database';

export const POINTS = {
  weekday: 15,
  sunday: 10,
  weekly: 10,
  streakStep: 5,
  maxWeekly: 30,
} as const;

/** The season changes at 00:00 Europe/Warsaw on the first Sunday of Advent. */
export function advent(year: number): string {
  const first = `${year}-11-27`;
  return shiftDate(first, (7 - weekday(first)) % 7);
}

export function competitionSeason(now: Date) {
  const day = dateKey(now);
  const year = Number(day.slice(0, 4));
  const startYear = day >= advent(year) ? year : year - 1;
  return { start: advent(startYear), end: advent(startYear + 1), label: `${startYear}/${startYear + 1}` };
}

// Gregorian Easter (Meeus/Jones/Butcher). Zachowane na potrzeby przyszłych
// warunków odznak (np. Wigilia Paschalna, Boże Ciało) — v1 liczy tylko służby.
export function easter(year: number): string {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = (h + l - 7 * m + 114) % 31 + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Tydzień od niedzieli do soboty (dla rywalizacji, serii „Twój rytm” i odznak). */
export function competitionWeek(day: string): string {
  return shiftDate(day, -weekday(day));
}

/** Tydzień od niedzieli do soboty (dla odznak w jednym tygodniu nd–sob). */
export function sundayWeek(day: string): string {
  return shiftDate(day, -weekday(day));
}

export function levelFor(points: number) {
  const level = Math.floor((1 + Math.sqrt(1 + Math.max(0, points) * .08)) / 2);
  const floor = 50 * level * (level - 1);
  const next = 50 * level * (level + 1);
  const names = ['Pierwszy krok', 'Dobry rytm', 'Stała obecność', 'Siła wytrwałości', 'Inspiracja', 'Mistrz regularności'];
  return { level, name: names[Math.min(level - 1, names.length - 1)], floor, next, progress: points - floor, required: next - floor };
}

export type PointEntry = { id: string; day: string; title: string; detail: string; points: number; occurred_at: string };

export type BadgeIcon =
  | 'sunrise'
  | 'star'
  | 'flame'
  | 'calendar'
  | 'medal'
  | 'heart'
  | 'trophy'
  | 'crown'
  | 'sparkles'
  | 'bell'
  | 'church'
  | 'book'
  | 'cross'
  | 'shield'
  | 'zap'
  | 'target'
  | 'award'
  | 'clock'
  | 'wolf'
  | 'dog'
  | 'bird'
  | 'fish'
  | 'sword'
  | 'anchor'
  | 'gem'
  | 'compass'
  | 'feather'
  | 'mountain'
  | 'sun'
  | 'moon'
  | 'footprints'
  | 'shirt';

export const BADGE_ICONS: BadgeIcon[] = [
  'sunrise',
  'star',
  'flame',
  'calendar',
  'medal',
  'heart',
  'trophy',
  'crown',
  'sparkles',
  'bell',
  'church',
  'book',
  'cross',
  'shield',
  'zap',
  'target',
  'award',
  'clock',
  'wolf',
  'dog',
  'bird',
  'fish',
  'sword',
  'anchor',
  'gem',
  'compass',
  'feather',
  'mountain',
  'sun',
  'moon',
  'footprints',
  'shirt',
];

export const LEGACY_BADGE_ICONS: readonly BadgeIcon[] = [
  'sunrise',
  'star',
  'flame',
  'calendar',
  'medal',
  'heart',
];

export function isLegacyBadgeIcon(value: unknown): value is BadgeIcon {
  return typeof value === 'string' && (LEGACY_BADGE_ICONS as readonly string[]).includes(value);
}

export function legacyFallbackIcon(icon: BadgeIcon): BadgeIcon {
  switch (icon) {
    case 'trophy':
    case 'award':
    case 'target':
    case 'shield':
    case 'sword':
    case 'gem':
    case 'anchor':
      return 'medal';
    case 'crown':
    case 'sparkles':
    case 'zap':
    case 'sun':
    case 'moon':
    case 'wolf':
    case 'dog':
    case 'bird':
    case 'fish':
      return 'star';
    case 'church':
    case 'bell':
    case 'book':
    case 'cross':
    case 'feather':
    case 'shirt':
      return 'heart';
    case 'clock':
    case 'compass':
    case 'mountain':
    case 'footprints':
      return 'calendar';
    default:
      return 'medal';
  }
}

export type Badge = { id: string; name: string; description: string; icon: BadgeIcon; value: number; target: number; earned: boolean; points: number; summary: string };

/** Rodzaj oznaczenia dnia (etykieta z „Oznacz dzień”, np. „Uroczystość …”). */
export type DayMarkKind = 'sunday' | 'solemnity' | 'feast' | 'memorial' | 'annotated';
export const DAY_MARK_KINDS: DayMarkKind[] = ['sunday', 'solemnity', 'feast', 'memorial', 'annotated'];
export const DAY_MARK_LABELS: Record<DayMarkKind, string> = {
  sunday: 'Niedziele',
  solemnity: 'Uroczystości',
  feast: 'Święta',
  memorial: 'Wspomnienia',
  annotated: 'Dni z dowolnym oznaczeniem',
};

export type BadgeKind = 'total' | 'single_week' | 'single_month' | 'custom_period' | 'streak';

/**
 * Warunek odznaki: które służby wliczają się do celu. Wszystkie pola są
 * opcjonalne i łączą się logicznym AND; puste filtry oznaczają dowolne służby.
 */
export type BadgeFilter = {
  /** Typ celu odznaki: 'total' (w sezonie, domyślny), 'single_week' (w jednym tygodniu), 'single_month' (w jednym miesiącu), 'custom_period' (w wybranym okresie), 'streak' (seria w Twój rytm). */
  kind?: BadgeKind;
  /** Dni tygodnia służby (0 = niedziela … 6 = sobota). */
  weekdays?: number[];
  /** Przedział godzin (HH:MM); od > do oznacza przedział przez północ. */
  timeFrom?: string;
  timeTo?: string;
  /** Konkretne daty służby (YYYY-MM-DD). */
  dates?: string[];
  /** Zakres dat od - do (YYYY-MM-DD). */
  dateFrom?: string;
  dateTo?: string;
  /** Liczba osób służących na Mszy (min / max). */
  minServers?: number;
  maxServers?: number;
  /** Nazwa wydarzenia zawiera tekst. */
  title?: string;
  /** Celebrans zawiera tekst. */
  celebrant?: string;
  /** Okazja / opis wydarzenia (liturgy_type) zawiera tekst. */
  occasion?: string;
  /** Rodzaj wydarzenia. Brak = Msze i nabożeństwa. */
  category?: 'mass' | 'devotion';
  /** Oznaczenie dnia służby. */
  dayMark?: DayMarkKind;
  /** Oznaczenie dnia zawiera tekst. */
  dayMarkText?: string;
  /** Gdy true, wiele służb jednego dnia liczy się jako jedna. */
  perDay?: boolean;
};

/**
 * Definicja odznaki edytowalna przez administratora.
 * Cel (target) to liczba pasujących służb; filtry wybierają, które służby się liczą.
 */
export type BadgeDefinition = {
  id: string;
  name: string;
  description: string;
  icon: BadgeIcon;
  points: number;
  target: number;
  filters: BadgeFilter;
};

/** Podstawowy zestaw startowy — administrator może go edytować, usunąć lub rozbudować. */
export const DEFAULT_BADGE_DEFINITIONS: BadgeDefinition[] = [
  { id: 'first', name: 'Pierwszy krok', description: 'Zdobądź punkty za pierwszą służbę w sezonie.', icon: 'heart', points: 10, target: 1, filters: {} },
  { id: 'ten', name: 'Pomocna dłoń', description: 'Podejmij 10 służb w jednym sezonie.', icon: 'medal', points: 25, target: 10, filters: {} },
  { id: 'fifty', name: 'Filar wspólnoty', description: 'Podejmij 50 służb w jednym sezonie.', icon: 'medal', points: 120, target: 50, filters: {} },
];

export function isBadgeIcon(value: unknown): value is BadgeIcon {
  return typeof value === 'string' && (BADGE_ICONS as string[]).includes(value);
}

function isDayMarkKind(value: unknown): value is DayMarkKind {
  return typeof value === 'string' && (DAY_MARK_KINDS as string[]).includes(value);
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Porównanie tekstów bez polskich znaków i bez względu na wielkość liter. */
export function foldText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLocaleLowerCase('pl');
}

/**
 * Koduje kind i opcjonalnie nową ikonę w polu dayMarkText jako zabezpieczenie
 * na wypadek, gdyby funkcja RPC w Supabase nie miała jeszcze zaktualizowanej białej listy kluczy.
 */
export function encodeBadgeFilterFallback(filters: BadgeFilter, icon?: BadgeIcon): Record<string, unknown> {
  const out: Record<string, unknown> = { ...filters };
  const parts: string[] = [];
  if (filters.kind && filters.kind !== 'total') {
    parts.push(`k=${filters.kind}`);
  }
  if (filters.dateFrom) {
    parts.push(`df=${filters.dateFrom}`);
  }
  if (filters.dateTo) {
    parts.push(`dt=${filters.dateTo}`);
  }
  if (filters.minServers !== undefined) {
    parts.push(`smin=${filters.minServers}`);
  }
  if (filters.maxServers !== undefined) {
    parts.push(`smax=${filters.maxServers}`);
  }
  if (icon && !isLegacyBadgeIcon(icon)) {
    parts.push(`i=${icon}`);
  }
  if (parts.length > 0) {
    const metaStr = `__meta:${parts.join(';')}`;
    const userText = filters.dayMarkText?.trim() ?? '';
    out.dayMarkText = userText ? `${metaStr}|${userText}` : metaStr;
  }
  return out;
}

/** Czyści filtry z bazy/formularza; uszkodzone pola są pomijane. Nigdy nie rzuca. */
export function normalizeBadgeFilter(raw: unknown): BadgeFilter & { _encodedIcon?: BadgeIcon } {
  if (!raw || typeof raw !== 'object') return {};
  const row = raw as Record<string, unknown>;
  const out: BadgeFilter & { _encodedIcon?: BadgeIcon } = {};
  if (row.kind === 'single_week' || row.kind === 'single_month' || row.kind === 'custom_period' || row.kind === 'streak') {
    out.kind = row.kind;
  }
  if (typeof row.dateFrom === 'string' && DATE_RE.test(row.dateFrom.trim())) {
    out.dateFrom = row.dateFrom.trim();
  }
  if (typeof row.dateTo === 'string' && DATE_RE.test(row.dateTo.trim())) {
    out.dateTo = row.dateTo.trim();
  }
  if (typeof row.minServers === 'number' && Number.isInteger(row.minServers) && row.minServers >= 1) {
    out.minServers = row.minServers;
  }
  if (typeof row.maxServers === 'number' && Number.isInteger(row.maxServers) && row.maxServers >= 1) {
    out.maxServers = row.maxServers;
  }
  let encodedKind: BadgeKind | undefined;
  let decodedDayMarkText: string | undefined;
  if (typeof row.dayMarkText === 'string' && row.dayMarkText.trim()) {
    const trimmed = row.dayMarkText.trim();
    if (trimmed.startsWith('__meta:')) {
      const barIdx = trimmed.indexOf('|');
      const metaPart = barIdx >= 0 ? trimmed.slice(7, barIdx) : trimmed.slice(7);
      const userPart = barIdx >= 0 ? trimmed.slice(barIdx + 1).trim() : '';
      for (const item of metaPart.split(';')) {
        const [k, v] = item.split('=');
        if (k === 'k' && (v === 'streak' || v === 'single_week' || v === 'single_month' || v === 'custom_period')) {
          encodedKind = v;
        }
        if (k === 'df' && DATE_RE.test(v)) {
          out.dateFrom = v;
        }
        if (k === 'dt' && DATE_RE.test(v)) {
          out.dateTo = v;
        }
        if (k === 'smin' && /^\d+$/.test(v)) {
          out.minServers = Number(v);
        }
        if (k === 'smax' && /^\d+$/.test(v)) {
          out.maxServers = Number(v);
        }
        if (k === 'i' && isBadgeIcon(v)) {
          out._encodedIcon = v;
        }
      }
      if (userPart) {
        decodedDayMarkText = userPart.slice(0, 120);
      }
    } else if (trimmed.startsWith('__kind:')) {
      const match = /^__kind:(streak|single_week|single_month|custom_period)(?:\|(.*))?$/.exec(trimmed);
      if (match) {
        encodedKind = match[1] as BadgeKind;
        if (match[2]?.trim()) decodedDayMarkText = match[2].trim().slice(0, 120);
      } else {
        decodedDayMarkText = trimmed.slice(0, 120);
      }
    } else {
      decodedDayMarkText = trimmed.slice(0, 120);
    }
  }
  if (!out.kind && encodedKind) {
    out.kind = encodedKind;
  }
  if (decodedDayMarkText) {
    out.dayMarkText = decodedDayMarkText;
  }
  if (Array.isArray(row.weekdays)) {
    const days = [...new Set(row.weekdays.filter((d): d is number =>
      typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    if (days.length && days.length < 7) out.weekdays = days;
  }
  if (typeof row.timeFrom === 'string' && TIME_RE.test(row.timeFrom.trim())) out.timeFrom = row.timeFrom.trim();
  if (typeof row.timeTo === 'string' && TIME_RE.test(row.timeTo.trim())) out.timeTo = row.timeTo.trim();
  if (Array.isArray(row.dates)) {
    const dates = [...new Set(
      (row.dates as unknown[]).filter((d): d is string => typeof d === 'string' && DATE_RE.test(d.trim())).map(d => d.trim()),
    )].sort().slice(0, 366);
    if (dates.length) out.dates = dates;
  }
  for (const key of ['title', 'celebrant', 'occasion'] as const) {
    if (typeof row[key] === 'string' && row[key].trim()) out[key] = row[key].trim().slice(0, 60);
  }
  if (row.category === 'mass' || row.category === 'devotion') out.category = row.category;
  if (isDayMarkKind(row.dayMark)) out.dayMark = row.dayMark;
  if (row.perDay === true) out.perDay = true;
  return out;
}

/** Krótki, czytelny opis warunku do list i kart ('' = dowolne służby). */
export function describeBadgeFilter(filters: BadgeFilter): string {
  const parts: string[] = [];
  if (filters.kind === 'single_week') parts.push('w jednym tygodniu (nd–sob)');
  if (filters.kind === 'single_month') parts.push('w jednym miesiącu');
  if (filters.kind === 'custom_period' || filters.dateFrom || filters.dateTo) {
    if (filters.dateFrom && filters.dateTo) {
      parts.push(`w okresie ${polishDate(filters.dateFrom, { day: 'numeric', month: 'short' })}–${polishDate(filters.dateTo, { day: 'numeric', month: 'short' })}`.replace(/\s*r\.?$/g, ''));
    } else if (filters.dateFrom) {
      parts.push(`od ${polishDate(filters.dateFrom, { day: 'numeric', month: 'short' })}`.replace(/\s*r\.?$/g, ''));
    } else if (filters.dateTo) {
      parts.push(`do ${polishDate(filters.dateTo, { day: 'numeric', month: 'short' })}`.replace(/\s*r\.?$/g, ''));
    }
  }
  if (filters.kind === 'streak') parts.push('seria „Twój rytm” (min. 2/tydz.)');
  if (filters.minServers !== undefined && filters.maxServers !== undefined && filters.minServers === filters.maxServers) {
    if (filters.minServers === 1) parts.push('służba solo (samemu)');
    else if (filters.minServers === 2) parts.push('w duecie (2 osoby)');
    else parts.push(`dokładnie ${filters.minServers} służących`);
  } else if (filters.minServers !== undefined && filters.maxServers !== undefined) {
    parts.push(`asysta ${filters.minServers}–${filters.maxServers} służących`);
  } else if (filters.minServers !== undefined) {
    if (filters.minServers >= 4) parts.push(`liczna asysta (min. ${filters.minServers} służących)`);
    else parts.push(`min. ${filters.minServers} służących`);
  } else if (filters.maxServers !== undefined) {
    parts.push(`maks. ${filters.maxServers} służących`);
  }
  if (filters.weekdays?.length) parts.push(filters.weekdays.map(d => DAY_SHORT[d]).join(', '));
  if (filters.timeFrom || filters.timeTo) parts.push(`godz. ${filters.timeFrom ?? '00:00'}–${filters.timeTo ?? '23:59'}`);
  if (filters.dates?.length) {
    const show = filters.dates.slice(0, 3).map(d => polishDate(d, { day: 'numeric', month: 'short' }).replace(/\s*r\.?$/, ''));
    parts.push(filters.dates.length > 3 ? `${show.join(', ')} (+${filters.dates.length - 3})` : show.join(', '));
  }
  if (filters.category === 'mass') parts.push('Msze Święte');
  if (filters.category === 'devotion') parts.push('nabożeństwa');
  if (filters.title) parts.push(`„${filters.title}”`);
  if (filters.occasion) parts.push(`okazja: ${filters.occasion}`);
  if (filters.celebrant) parts.push(`celebrans: ${filters.celebrant}`);
  if (filters.dayMark) parts.push(DAY_MARK_LABELS[filters.dayMark].toLocaleLowerCase('pl'));
  if (filters.dayMarkText) parts.push(`oznaczenie: „${filters.dayMarkText}”`);
  if (filters.perDay) parts.push('max 1 dziennie');
  return parts.join(' · ');
}

/** Zwraca definicję lub null, gdy wiersz z bazy jest uszkodzony. Przycina teksty i ogranicza liczby. */
export function normalizeBadgeDefinition(raw: unknown): BadgeDefinition | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id.trim().slice(0, 64) : '';
  const name = typeof row.name === 'string' ? row.name.trim().slice(0, 80) : '';
  const description = typeof row.description === 'string' ? row.description.trim().slice(0, 240) : '';
  const points = typeof row.points === 'number' ? Math.trunc(row.points) : NaN;
  const target = typeof row.target === 'number' ? Math.trunc(row.target) : NaN;
  if (!id || !name || !Number.isSafeInteger(points) || points < 0 || points > 1000) return null;
  if (!Number.isSafeInteger(target) || target < 1 || target > 1000) return null;
  const rawFilters = normalizeBadgeFilter(row.filters);
  const icon = (rawFilters._encodedIcon && isBadgeIcon(rawFilters._encodedIcon))
    ? rawFilters._encodedIcon
    : (isBadgeIcon(row.icon) ? row.icon : 'medal');
  const { _encodedIcon, ...filters } = rawFilters;
  return { id, name, description, icon, points, target, filters };
}

export type BadgeInput = { name: string; description: string; icon: BadgeIcon; points: number; target: number; filters?: unknown };

/** Walidacja formularza administratora. Rzuca błąd z polskim komunikatem. */
export function validateBadgeInput(input: BadgeInput): BadgeInput & { filters: BadgeFilter } {
  const name = input.name.trim().slice(0, 80);
  const description = input.description.trim().slice(0, 240);
  if (!name) throw new Error('Wpisz nazwę odznaki.');
  if (!isBadgeIcon(input.icon)) throw new Error('Wybierz ikonę odznaki.');
  if (!Number.isSafeInteger(input.points) || input.points < 0 || input.points > 1000) {
    throw new Error('Nagroda musi wynosić od 0 do 1000 punktów.');
  }
  if (!Number.isSafeInteger(input.target) || input.target < 1 || input.target > 1000) {
    throw new Error('Cel musi wynosić od 1 do 1000 służb.');
  }
  const rawFilters = normalizeBadgeFilter(input.filters ?? {});
  const { _encodedIcon, ...filters } = rawFilters;
  if (filters.minServers !== undefined && filters.maxServers !== undefined && filters.minServers > filters.maxServers) {
    throw new Error('Minimalna liczba służących nie może być większa niż maksymalna.');
  }
  // Daty z przeszłości i przyszłości są dozwolone, ale muszą być prawdziwe.
  for (const day of filters.dates ?? []) {
    const [y, m, d] = day.split('-').map(Number);
    const check = new Date(Date.UTC(y, m - 1, d));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
      throw new Error(`Nieprawidłowa data: ${day}.`);
    }
  }
  if (filters.timeFrom && filters.timeTo && filters.timeFrom === filters.timeTo) {
    throw new Error('Godzina „od” i „do” nie mogą być takie same.');
  }
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
    throw new Error('Data „od” nie może być późniejsza niż data „do”.');
  }
  return { name, description, icon: input.icon, points: input.points, target: input.target, filters };
}

function badge(id: string, name: string, description: string, icon: BadgeIcon, value: number, target: number, points: number, summary: string): Badge {
  return { id, name, description, icon, value: Math.min(value, target), target, earned: value >= target, points, summary };
}

function dayMarkMatches(kind: DayMarkKind, day: string, label: string): boolean {
  const normalized = label.trim().toLocaleLowerCase('pl');
  switch (kind) {
    case 'sunday': return weekday(day) === 0;
    case 'solemnity': return /^uroczystość(?:$|[\s:–—-])/u.test(normalized);
    case 'feast': return /^święto(?:$|[\s:–—-])/u.test(normalized);
    case 'memorial': return /^wspomnienie(?:$|[\s:–—-])/u.test(normalized);
    case 'annotated': return normalized !== '';
  }
}

/** Służby spełniające warunek odznaki (w kolejności czasu). */
export function matchingBadgeServices(
  def: Pick<BadgeDefinition, 'filters'>,
  services: Mass[],
  annotations: Map<string, string>,
  serverCounts?: Map<string, number>,
): Mass[] {
  const f = def.filters;
  const titleNeedle = f.title ? foldText(f.title) : '';
  const celebrantNeedle = f.celebrant ? foldText(f.celebrant) : '';
  const occasionNeedle = f.occasion ? foldText(f.occasion) : '';
  const markNeedle = f.dayMarkText ? foldText(f.dayMarkText) : '';
  const matched = services.filter(mass => {
    if (f.minServers !== undefined || f.maxServers !== undefined) {
      const count = serverCounts?.get(mass.id) ?? 1;
      if (f.minServers !== undefined && count < f.minServers) return false;
      if (f.maxServers !== undefined && count > f.maxServers) return false;
    }
    const day = dateKey(mass.start_time);
    if (f.weekdays && !f.weekdays.includes(weekday(day))) return false;
    if (f.timeFrom || f.timeTo) {
      const slot = timeSlot(mass.start_time).slice(0, 5);
      const from = f.timeFrom ?? '00:00';
      const to = f.timeTo ?? '23:59';
      if (from <= to ? (slot < from || slot > to) : (slot < from && slot > to)) return false;
    }
    if (f.dates && !f.dates.includes(day)) return false;
    if (f.dateFrom && day < f.dateFrom) return false;
    if (f.dateTo && day > f.dateTo) return false;
    if (f.category && eventCategory(mass) !== f.category) return false;
    if (titleNeedle && !foldText(mass.title).includes(titleNeedle)) return false;
    if (celebrantNeedle && !(mass.celebrant && foldText(mass.celebrant).includes(celebrantNeedle))) return false;
    if (occasionNeedle && !(mass.liturgy_type && foldText(mass.liturgy_type).includes(occasionNeedle))) return false;
    if (f.dayMark && !dayMarkMatches(f.dayMark, day, annotations.get(day) ?? '')) return false;
    if (markNeedle && !foldText(annotations.get(day) ?? '').includes(markNeedle)) return false;
    return true;
  });
  if (!f.perDay) return matched;
  const seen = new Set<string>();
  return matched.filter(mass => {
    const day = dateKey(mass.start_time);
    if (seen.has(day)) return false;
    seen.add(day);
    return true;
  });
}

function customBadge(
  def: BadgeDefinition,
  services: Mass[],
  annotations: Map<string, string>,
  serverCounts?: Map<string, number>,
): { badge: Badge; earnedAt: string | undefined } {
  const kind: BadgeKind = def.filters.kind ?? 'total';
  const matched = matchingBadgeServices(def, services, annotations, serverCounts);
  const summary = describeBadgeFilter(def.filters);

  if (kind === 'single_week') {
    const weekMap = new Map<string, Mass[]>();
    for (const mass of matched) {
      const w = sundayWeek(dateKey(mass.start_time));
      const list = weekMap.get(w) ?? [];
      list.push(mass);
      weekMap.set(w, list);
    }
    let maxInWeek = 0;
    let earnedAt: string | undefined;
    const sortedWeeks = [...weekMap.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [, events] of sortedWeeks) {
      if (events.length > maxInWeek) {
        maxInWeek = events.length;
      }
      if (!earnedAt && events.length >= def.target) {
        earnedAt = events[def.target - 1]?.start_time;
      }
    }
    return {
      badge: badge(def.id, def.name, def.description, def.icon, maxInWeek, def.target, def.points, summary),
      earnedAt,
    };
  }

  if (kind === 'single_month') {
    const monthMap = new Map<string, Mass[]>();
    for (const mass of matched) {
      const m = dateKey(mass.start_time).slice(0, 7);
      const list = monthMap.get(m) ?? [];
      list.push(mass);
      monthMap.set(m, list);
    }
    let maxInMonth = 0;
    let earnedAt: string | undefined;
    const sortedMonths = [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [, events] of sortedMonths) {
      if (events.length > maxInMonth) {
        maxInMonth = events.length;
      }
      if (!earnedAt && events.length >= def.target) {
        earnedAt = events[def.target - 1]?.start_time;
      }
    }
    return {
      badge: badge(def.id, def.name, def.description, def.icon, maxInMonth, def.target, def.points, summary),
      earnedAt,
    };
  }

  if (kind === 'streak') {
    const weekMap = new Map<string, Mass[]>();
    for (const mass of matched) {
      const w = competitionWeek(dateKey(mass.start_time));
      const list = weekMap.get(w) ?? [];
      list.push(mass);
      weekMap.set(w, list);
    }
    let run = 0;
    let bestStreak = 0;
    let previous = '';
    let earnedAt: string | undefined;
    const sortedWeeks = [...weekMap.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [week, events] of sortedWeeks) {
      if (events.length < 2) {
        run = 0;
        previous = '';
        continue;
      }
      run = previous && shiftDate(previous, 7) === week ? run + 1 : 1;
      previous = week;
      if (run > bestStreak) {
        bestStreak = run;
      }
      if (!earnedAt && run >= def.target) {
        earnedAt = events[1]?.start_time;
      }
    }
    return {
      badge: badge(def.id, def.name, def.description, def.icon, bestStreak, def.target, def.points, summary),
      earnedAt,
    };
  }

  return {
    badge: badge(def.id, def.name, def.description, def.icon, matched.length, def.target, def.points, summary),
    earnedAt: matched[def.target - 1]?.start_time,
  };
}

export function buildCompetition(data: Pick<ScheduleData, 'servers' | 'masses' | 'attendees' | 'confirmations' | 'pointAdjustments' | 'competitionState' | 'competitionParticipants' | 'badgeDefinitions' | 'dayAnnotations'>, now: Date) {
  const season = competitionSeason(now);
  const from = Date.parse(zonedIso(season.start, '00:00'));
  const until = Math.min(now.getTime(), Date.parse(zonedIso(season.end, '00:00')));
  const masses = new Map(data.masses.filter(mass => {
    const time = Date.parse(mass.start_time);
    return time >= from && time < until && eventCategory(mass) !== 'other';
  }).map(mass => [mass.id, mass]));
  const participants = data.competitionParticipants !== undefined
    ? new Set(data.competitionParticipants)
    : new Set(data.servers.map(s => s.id));
  const byServer = new Map<string, Map<string, Mass>>();
  for (const attendee of data.confirmations ?? []) {
    if (!attendee.attended) continue;
    const mass = masses.get(attendee.mass_id);
    if (!mass) continue;
    const own = byServer.get(attendee.server_id) ?? new Map<string, Mass>();
    own.set(mass.id, mass); // One event is never counted twice for the same person.
    byServer.set(attendee.server_id, own);
  }
  const negativeConfirmations = new Set(
    (data.confirmations ?? []).filter(c => !c.attended).map(c => `${c.server_id}:${c.mass_id}`)
  );
  for (const server of data.servers) {
    if (!participants.has(server.id)) {
      const own = byServer.get(server.id) ?? new Map<string, Mass>();
      for (const attendee of data.attendees ?? []) {
        if (attendee.server_id !== server.id) continue;
        const mass = masses.get(attendee.mass_id);
        if (!mass) continue;
        if (negativeConfirmations.has(`${server.id}:${mass.id}`)) continue;
        own.set(mass.id, mass);
      }
      if (own.size > 0) byServer.set(server.id, own);
    }
  }
  const currentWeek = competitionWeek(dateKey(now));
  const state = data.competitionState?.season === season.start ? data.competitionState : undefined;
  const pointsFrom = state?.reset_at ? Date.parse(state.reset_at) : from;

  const massServerCounts = new Map<string, number>();
  const massServers = new Map<string, Set<string>>();
  for (const attendee of data.confirmations ?? []) {
    if (!attendee.attended) continue;
    let set = massServers.get(attendee.mass_id);
    if (!set) {
      set = new Set<string>();
      massServers.set(attendee.mass_id, set);
    }
    set.add(attendee.server_id);
  }
  for (const attendee of data.attendees ?? []) {
    if (negativeConfirmations.has(`${attendee.server_id}:${attendee.mass_id}`)) continue;
    let set = massServers.get(attendee.mass_id);
    if (!set) {
      set = new Set<string>();
      massServers.set(attendee.mass_id, set);
    }
    set.add(attendee.server_id);
  }
  for (const [mid, set] of massServers) {
    massServerCounts.set(mid, set.size);
  }

  // Pusta lista od administratora oznacza brak odznak; brak listy — zestaw podstawowy.
  // Uszkodzone wiersze są pomijane, aby jedna zła definicja nie psuła całej rywalizacji.
  const definitions = (data.badgeDefinitions ?? DEFAULT_BADGE_DEFINITIONS)
    .map(normalizeBadgeDefinition)
    .filter((def): def is BadgeDefinition => def !== null);
  const annotations = new Map((data.dayAnnotations ?? []).map(a => [a.day, a.label] as const));
  const profiles = data.servers.map(server => {
    const services = [...(byServer.get(server.id)?.values() ?? [])].sort((a, b) => a.start_time.localeCompare(b.start_time));
    const weeks = new Map<string, Mass[]>();
    const entries: PointEntry[] = [];
    for (const mass of services) {
      const day = dateKey(mass.start_time);
      const sunday = weekday(day) === 0;
      const week = competitionWeek(day);
      weeks.set(week, [...(weeks.get(week) ?? []), mass]);
      if (Date.parse(mass.start_time) >= pointsFrom) entries.push({ id: mass.id, day, occurred_at: mass.start_time, title: mass.title, detail: `${timeSlot(mass.start_time).slice(0, 5)} · ${sunday ? 'Niedziela' : 'Służba w tygodniu'}`, points: sunday ? POINTS.sunday : POINTS.weekday });
    }
    let run = 0, bestStreak = 0, previous = '', bonusPoints = 0;
    const runs = new Map<string, number>();
    for (const [week, events] of [...weeks].sort(([a], [b]) => a.localeCompare(b))) {
      if (events.length < 2) { run = 0; previous = week; continue; }
      run = previous && shiftDate(previous, 7) === week ? run + 1 : 1;
      previous = week;
      bestStreak = Math.max(bestStreak, run);
      runs.set(week, run);
      const points = Math.min(POINTS.maxWeekly, POINTS.weekly + (run - 1) * POINTS.streakStep);
      if (Date.parse(events[1].start_time) >= pointsFrom) {
        bonusPoints += points;
        entries.push({ id: `week-${week}`, day: dateKey(events[1].start_time), occurred_at: events[1].start_time, title: 'Bonus za regularność', detail: `${run}. tydzień serii · ${polishDate(week, { day: 'numeric', month: 'short' })} – ${polishDate(shiftDate(week, 6), { day: 'numeric', month: 'short' })}`, points });
      }
    }
    // An unfinished current week does not break last week's streak.
    const streak = runs.get(currentWeek) ?? runs.get(shiftDate(currentWeek, -7)) ?? 0;
    const badgeDefinitions = definitions.map(def => customBadge(def, services, annotations, massServerCounts));
    const badges = badgeDefinitions.map(def => def.badge);
    let badgePoints = 0;
    for (const { badge: b, earnedAt } of badgeDefinitions) {
      if (b.earned && earnedAt && Date.parse(earnedAt) >= pointsFrom) {
        badgePoints += b.points;
        entries.push({
          id: `badge-${b.id}`,
          day: dateKey(earnedAt),
          occurred_at: earnedAt,
          title: `Odznaka: ${b.name}`,
          detail: b.description,
          points: b.points,
        });
      }
    }
    const earnedPoints = entries.reduce((total, entry) => total + entry.points, 0);
    const adjustments = (data.pointAdjustments ?? []).filter(item => item.season === season.start && item.server_id === server.id && item.revision > (state?.reset_revision ?? 0));
    const adjustmentPoints = adjustments.reduce((sum, item) => sum + item.delta, 0);
    entries.push(...adjustments.map(item => ({ id: `adjustment-${item.id}`, day: dateKey(item.created_at), occurred_at: item.created_at, title: item.mode === 'set' ? 'Ustawienie wyniku przez administratora' : 'Korekta administratora', detail: item.reason || 'Zmiana punktacji', points: item.delta })));
    const rawPoints = earnedPoints + adjustmentPoints;
    const points = Math.max(0, rawPoints);
    const isParticipant = participants.has(server.id);
    return { server, isParticipant, points, rawPoints, adjustmentPoints, bonusPoints, badgePoints, servicePoints: earnedPoints - bonusPoints - badgePoints, serviceCount: services.length, streak, bestStreak, weekCount: weeks.get(currentWeek)?.length ?? 0, badges, level: levelFor(points), entries: entries.reverse().sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)), place: 0 };
  }).sort((a, b) => b.points - a.points || a.server.name.localeCompare(b.server.name, 'pl'));
  let place = 0;
  const participantProfiles = profiles.filter(p => p.isParticipant);
  participantProfiles.forEach((profile, index) => { if (!index || profile.points !== participantProfiles[index - 1].points) place = index + 1; profile.place = place; });
  return { season, profiles };
}

export type CompetitionProfile = ReturnType<typeof buildCompetition>['profiles'][number];
