import { useCallback, useEffect, useRef, useState } from 'react';
import { loadUpcomingServices } from '../lib/repository';
import { dateKey, shiftDate, zonedIso } from '../lib/dates';
import type { ScheduleData } from '../types/database';

export function useUpcomingServices(enabled: boolean, serverId: string) {
  const [snapshot, setSnapshot] = useState<{ serverId: string; data: ScheduleData } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    if (!enabled || !serverId) return;
    const request = ++requestId.current;
    setLoading(true);
    const current = new Date();
    setNow(current);
    try {
      const data = await loadUpcomingServices(current.toISOString(), zonedIso(shiftDate(dateKey(current), 30), '00:00'));
      if (request === requestId.current) { setSnapshot({ serverId, data }); setError(''); }
    } catch (cause) {
      if (request === requestId.current) setError(cause instanceof Error ? cause.message : 'Nie udało się pobrać służb.');
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [enabled, serverId]);

  useEffect(() => {
    setError('');
    setSnapshot(null);
    setLoading(true);
    // App invokes refresh through its single shared subscription and mutation path.
    // Remove elapsed services even while offline; refresh uses the shared subscription.
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => { ++requestId.current; window.clearInterval(timer); };
  }, [refresh]);

  return { data: snapshot?.serverId === serverId ? snapshot.data : null, loading, error, now, refresh };
}
