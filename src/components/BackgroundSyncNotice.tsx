import { useEffect, useState } from 'react';
import { CloudOff, LoaderCircle, RefreshCw } from 'lucide-react';

interface Props {
  loading?: boolean;
  offline?: boolean;
  error?: string;
  staleMessage?: string;
  onRetry: () => void;
}

/** Background status never occupies space in the page layout. */
export default function BackgroundSyncNotice({ loading = false, offline = false, error = '', staleMessage = 'Wyświetlane dane mogą być nieaktualne.', onRetry }: Props) {
  const [offlineVisible, setOfflineVisible] = useState(false);
  const [loadingVisible, setLoadingVisible] = useState(false);
  useEffect(() => {
    if (!offline) { setOfflineVisible(false); return; }
    const timer = window.setTimeout(() => setOfflineVisible(true), 8000);
    return () => window.clearTimeout(timer);
  }, [offline]);
  useEffect(() => {
    if (!loading) { setLoadingVisible(false); return; }
    const timer = window.setTimeout(() => setLoadingVisible(true), 1500);
    return () => window.clearTimeout(timer);
  }, [loading]);
  const warning = !!error || (offline && offlineVisible);
  if (!warning && !(loading && loadingVisible)) return null;
  return <div className="background-sync-notice" role="status">
    {warning ? <CloudOff size={17} aria-hidden="true" /> : <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />}
    <span title={error || undefined}>{error ? staleMessage : warning ? 'Połączenie na żywo przerwane. Odświeżamy okresowo.' : 'Aktualizowanie…'}</span>
    {warning && <button type="button" disabled={loading} onClick={onRetry}><RefreshCw size={14} aria-hidden="true" />Ponów</button>}
  </div>;
}
