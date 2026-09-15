import { supabase } from './supabase';
export type PushPreferences = { server_id: string | null; own: boolean; empty_mass: boolean; empty_devotion: boolean };
const DEVICE_KEY = 'liturgy.push-device';
export function installedApp(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
export function pushSupported(): boolean { return isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
export async function registerWorker() { return navigator.serviceWorker.register('/sw.js', { scope: '/' }); }
function deviceToken(create: boolean): string | null {
  let token = localStorage.getItem(DEVICE_KEY);
  if (!token && create) { token = crypto.randomUUID(); localStorage.setItem(DEVICE_KEY, token); }
  return token;
}
function database() { if (!supabase) throw new Error('Powiadomienia nie są dostępne w podglądzie demonstracyjnym.'); return supabase; }
function check(error: {message:string} | null) { if (error) throw new Error('Nie udało się zapisać ustawień powiadomień. Spróbuj ponownie.'); }
export async function loadPushPreferences(): Promise<PushPreferences | null> {
  const token = deviceToken(false);
  if (!token) return null;
  const { data, error } = await database().rpc('get_push_preferences', { p_token: token });
  check(error); return data ?? null;
}
export async function savePushPreferences(preferences: PushPreferences): Promise<void> {
  if (!installedApp()) throw new Error('Otwórz stronę z ikony zainstalowanej aplikacji.');
  const enabled = preferences.own || preferences.empty_mass || preferences.empty_devotion;
  if (!enabled) {
    const token = deviceToken(false);
    if (token) { const { error } = await database().rpc('remove_push_subscription', { p_token: token }); check(error); }
    const registration = await navigator.serviceWorker?.getRegistration('/');
    const subscription = await registration?.pushManager?.getSubscription();
    await subscription?.unsubscribe();
    return;
  }
  if (preferences.own && !preferences.server_id) throw new Error('Wybierz ministranta dla przypomnień o Twojej służbie.');
  if (!pushSupported()) throw new Error('Ten system lub przeglądarka nie obsługuje powiadomień w aplikacji.');
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();
  if (!key) throw new Error('Powiadomienia nie zostały jeszcze uruchomione przez administratora strony.');
  const db = database();
  const previousToken = deviceToken(false);
  const token = deviceToken(true)!;
  // Ask only as the direct result of the user's Save click (required on iOS).
  if (await Notification.requestPermission() !== 'granted') throw new Error('Brak zgody na powiadomienia. Możesz ją zmienić w ustawieniach aplikacji w telefonie.');
  await registerWorker();
  const registration = await navigator.serviceWorker.ready;
  let previous = await registration.pushManager.getSubscription();
  if (previous && !previousToken) { await previous.unsubscribe(); previous = null; }
  const subscription = previous ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const json = subscription.toJSON();
  if (!json.keys?.p256dh || !json.keys.auth) throw new Error('Nie udało się zarejestrować urządzenia.');
  const { error } = await db.rpc('save_push_subscription', { p_token: token, p_endpoint: subscription.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth, p_server: preferences.server_id, p_own: preferences.own, p_empty_mass: preferences.empty_mass, p_empty_devotion: preferences.empty_devotion });
  check(error);
}
