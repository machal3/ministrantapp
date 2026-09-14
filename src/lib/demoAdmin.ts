import type { AdminSession } from '../types/database';

// Imported only by builds without Supabase configuration. Production checks live in SQL.
let current: AdminSession | null = null;

export function demoLogin(pin: string): AdminSession {
  if (pin !== '0403') {
    throw new Error('Nieprawidłowy PIN. Spróbuj ponownie.');
  }
  current = { token: crypto.randomUUID(), expires_at: new Date(Date.now() + 1800000).toISOString() };
  return current;
}

export function demoLogout() { current = null; }
export function assertDemoSession(session: AdminSession) {
  if (!current || current.token !== session.token || Date.parse(current.expires_at) <= Date.now()) {
    throw new Error('Sesja administratora wygasła. Wpisz PIN ponownie.');
  }
}
