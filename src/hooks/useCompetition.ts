import { useCallback, useEffect, useRef, useState } from 'react';
import { loadCompetition } from '../lib/repository';
import { competitionSeason } from '../lib/competition';
import { zonedIso } from '../lib/dates';
import type { ScheduleData } from '../types/database';

export function useCompetition(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<{ season: string; data: ScheduleData } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const request = ++requestId.current;
    const current = new Date();
    const season = competitionSeason(current);
    setNow(current);
    setLoading(true);
    try {
      const data = await loadCompetition(zonedIso(season.start, '00:00'), current.toISOString());
      if (request === requestId.current) { setSnapshot({ season: season.start, data }); setError(''); }
    } catch (cause) {
      if (request === requestId.current) setError(cause instanceof Error ? cause.message : 'Nie udało się pobrać rywalizacji.');
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [enabled]);

  // App owns refreshes, polling and the single realtime subscription.
  useEffect(() => {
    setError('');
    return () => { ++requestId.current; };
  }, [refresh]);

  return { data: snapshot?.season === competitionSeason(now).start ? snapshot.data : null, loading, error, now, refresh };
}
