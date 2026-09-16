import { useCallback, useEffect, useRef, useState } from 'react';
import { confirmService, loadPendingConfirmations } from '../lib/repository';
import type { PendingConfirmations } from '../types/database';

export function useServiceConfirmations(serverId: string) {
  const [snapshot, setSnapshot] = useState<{ serverId: string; pending: PendingConfirmations } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(0);
  const requestId = useRef(0);
  const lock = useRef(false);
  const currentServer = useRef(serverId);
  currentServer.current = serverId;
  const refresh = useCallback(async () => {
    if (!serverId) return;
    const request = ++requestId.current;
    try {
      const pending = await loadPendingConfirmations(serverId);
      if (request === requestId.current && currentServer.current === serverId) { setSnapshot({ serverId, pending }); setError(''); }
    } catch (cause) {
      if (request === requestId.current && currentServer.current === serverId) setError(cause instanceof Error ? cause.message : 'Nie udało się pobrać służb do potwierdzenia.');
    }
  }, [serverId]);

  useEffect(() => {
    setSnapshot(null); setCompleted(0); setError('');
    void refresh();
    return () => { ++requestId.current; };
  }, [refresh]);

  const answer = async (massId: string, attended: boolean): Promise<boolean> => {
    if (lock.current || !serverId) return false;
    lock.current = true; setBusy(true); setError('');
    ++requestId.current;
    try {
      await confirmService(massId, serverId, attended);
      if (currentServer.current === serverId) {
        setCompleted(value => value + 1);
        setSnapshot(current => current?.serverId === serverId ? { serverId, pending: { masses: current.pending.masses.filter(m => m.id !== massId), total: Math.max(0, current.pending.total - 1) } } : current);
        await refresh();
      }
      return true;
    } catch (cause) {
      if (currentServer.current === serverId) setError(cause instanceof Error ? cause.message : 'Nie udało się zapisać odpowiedzi.');
      return false;
    } finally { lock.current = false; setBusy(false); }
  };

  return { pending: snapshot?.serverId === serverId ? snapshot.pending : null, completed, error, busy, answer, refresh };
}
