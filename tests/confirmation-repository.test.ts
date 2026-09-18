import { beforeEach, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const backend = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({
  isDemo: false,
  configurationError: null,
  supabase: createClient('https://test.supabase.co', 'test-key', {
    auth: { persistSession: false }, global: { fetch: backend.fetch },
  }),
}));
import { confirmService } from '../src/lib/repository';

let declared: boolean;
let exception: 'single' | 'excused' | null;
let legacy: boolean;
let confirmed: boolean;
let failRepair: boolean;

beforeEach(() => {
  declared = false;
  exception = null;
  legacy = true;
  confirmed = false;
  failRepair = false;
  backend.fetch.mockReset();
  backend.fetch.mockImplementation(async (input: string, init: RequestInit) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url.pathname.endsWith('/rpc/confirm_service')) {
      confirmed = JSON.parse(init.body as string).p_attended;
      if (legacy && confirmed) exception = 'single';
      return new Response(null, { status: 204 });
    }
    expect(url.searchParams.get('mass_id')).toBe('eq.mass');
    expect(url.searchParams.get('server_id')).toBe('eq.server');
    if (url.pathname.endsWith('/effective_attendees')) return reply(declared ? [{ server_id: 'server' }] : []);
    expect(url.pathname).toMatch(/\/mass_attendees$/);
    if (method === 'GET') return reply(exception ? [{ type: exception }] : []);
    expect(url.searchParams.get('type')).toBe('eq.single');
    if (failRepair) return new Response(JSON.stringify({ message: 'Naprawa niedostępna' }), { status: 500 });
    if (exception === 'single') exception = method === 'DELETE' ? null : JSON.parse(init.body as string).type;
    return new Response(null, { status: 204 });
  });
});

it.each([true, false])('keeps undeclared presence separate with legacy backend = %s', async oldBackend => {
  legacy = oldBackend;
  await confirmService('mass', 'server', true);
  expect(confirmed).toBe(true);
  expect(exception).toBeNull();
});

it('preserves a real prior declaration', async () => {
  declared = true;
  exception = 'single';
  await confirmService('mass', 'server', true);
  expect(confirmed).toBe(true);
  expect(exception).toBe('single');
  expect(backend.fetch.mock.calls.some(([, init]) => ['DELETE', 'PATCH'].includes(init.method))).toBe(false);
});

it('restores an excuse overwritten by the legacy confirmation function', async () => {
  exception = 'excused';
  await confirmService('mass', 'server', true);
  expect(confirmed).toBe(true);
  expect(exception).toBe('excused');
});

it('reports a failed repair instead of claiming complete success', async () => {
  failRepair = true;
  await expect(confirmService('mass', 'server', true)).rejects.toThrow('Obecność została zapisana, ale');
});
