import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isDemo = !url && !key;
function configure() {
  if (isDemo) return { client: null, error: null };
  try {
    if (!url || !key) throw new Error('Brak zmiennych połączenia.');
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) throw new Error('Niepoprawny URL.');
    return {
      client: createClient<Database>(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }),
      error: null,
    };
  } catch {
    return { client: null, error: 'Uzupełnij poprawnie VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY w pliku .env, a następnie uruchom aplikację ponownie.' };
  }
}

const config = configure();
export const configurationError = config.error;
export const supabase = config.client;
