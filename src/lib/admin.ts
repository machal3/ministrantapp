import { supabase, configurationError } from './supabase';
import type { AdminSession } from '../types/database';

export async function loginAdmin(pin: string): Promise<AdminSession> {
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN musi składać się z 4 cyfr.');
  if (!import.meta.env.VITE_SUPABASE_URL && !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    return (await import('./demoAdmin')).demoLogin(pin);
  }
  if (!supabase) throw new Error(configurationError ?? 'Brak połączenia z bazą.');
  const { data, error } = await supabase.rpc('admin_login', { p_pin: pin });
  if (error) {
    if (error.code === 'PGRST202') throw new Error('Tryb administratora wymaga aktualizacji bazy. Uruchom skrypt 202609140001_admin.sql w Supabase.');
    throw new Error(error.message);
  }
  if (!data?.[0]) throw new Error('Nieprawidłowy PIN. Spróbuj ponownie.');
  return data[0];
}

export async function logoutAdmin(session: AdminSession): Promise<void> {
  if (!import.meta.env.VITE_SUPABASE_URL && !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    (await import('./demoAdmin')).demoLogout();
    return;
  }
  if (!supabase) throw new Error(configurationError ?? 'Brak połączenia z bazą.');
  const { error } = await supabase.rpc('admin_logout', { p_token: session.token });
  if (error) throw new Error(error.message);
}

export async function requireAdminSession(session: AdminSession | null): Promise<AdminSession> {
  if (!session?.token || !Number.isFinite(Date.parse(session.expires_at)) || Date.parse(session.expires_at) <= Date.now()) {
    throw new Error('Sesja administratora wygasła. Wpisz PIN ponownie.');
  }
  if (!import.meta.env.VITE_SUPABASE_URL && !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    (await import('./demoAdmin')).assertDemoSession(session);
  }
  return session;
}
