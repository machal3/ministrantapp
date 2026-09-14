import type { AdminSession } from '../types/database';

// Imported only by builds without Supabase configuration. Production checks live in SQL.
let current: AdminSession | null = null;
let failures = 0;
let windowStart = Date.now();

export function demoLogin(pin: string): AdminSession {
  if (Date.now() - windowStart >= 600000) { failures = 0; windowStart = Date.now(); }
  if (failures >= 5 || pin !== '0403') {
    failures++;
    throw new Error('Nieprawidłowy PIN lub czasowa blokada. Po 5 błędnych próbach odczekaj 10 minut.');
  }
  failures = 0;
  current = { token: crypto.randomUUID(), expires_at: new Date(Date.now() + 1800000).toISOString() };
  return current;
}

export function demoLogout() { current = null; }
export function assertDemoSession(session: AdminSession) {
  if (!current || current.token !== session.token || Date.parse(current.expires_at) <= Date.now()) {
    throw new Error('Sesja administratora wygasła. Wpisz PIN ponownie.');
  }
}
