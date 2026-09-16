import { AlertCircle, CalendarDays, HeartHandshake, LoaderCircle, RefreshCw, UserRound } from 'lucide-react';
import { personalServices } from '../lib/myServices';
import type { AltarServer, Mass, RecurringRule, ScheduleData } from '../types/database';
import type { MassAction } from './MassCard';
import MyRecurringRules from './MyRecurringRules';
import ServiceCard from './ServiceCard';

interface Props {
  server?: AltarServer;
  data: ScheduleData | null;
  loading: boolean;
  error: string;
  now: Date;
  busy: boolean;
  onRetry: () => void;
  onAction: (mass: Mass, action: MassAction) => void;
  onOpenDay: (day?: string) => void;
  onEditRule: (rule: RecurringRule) => void;
  onDeleteRule: (rule: RecurringRule) => void;
}

export default function MyServicesView({ server, data, loading, error, now, busy, onRetry, onAction, onOpenDay, onEditRule, onDeleteRule }: Props) {
  const services = data && server ? personalServices(data, server.id, now) : [];
  const next = services.find(service => !service.excused);
  const upcoming = services.filter(service => service !== next);
  return <section className="my-services" aria-label="Moje służby">
    {!server ? <div className="empty-state"><UserRound size={36} /><h3>Wybierz swoje imię</h3><p>Wybierz ministranta w nagłówku, aby zobaczyć swoje najbliższe służby i stałe dyżury.</p></div> : <>
      {error && <div className="error-banner" role="alert"><AlertCircle size={20} /><div><strong>Nie udało się pobrać służb</strong><p>{error}</p>{data && <p>Wyświetlane dane mogą być nieaktualne.</p>}</div><button className="button secondary" disabled={loading} onClick={onRetry}><RefreshCw size={16} />Ponów</button></div>}
      {loading && <div className="services-loading" role="status"><LoaderCircle size={22} className="animate-spin" />{data ? 'Odświeżamy Twoje służby…' : 'Wczytujemy Twoje służby…'}</div>}
      {data && <div className="dashboard-layout services-layout"><div className="services-content">
        {next ? <ServiceCard service={next} activeId={server.id} featured now={now} busy={busy || loading || !!error} onAction={onAction} onOpenDay={onOpenDay} />
          : <div className="empty-state"><CalendarDays size={36} /><h3>Nie masz obecnie żadnych zaplanowanych służb.</h3><p>Sprawdziliśmy najbliższe 30 dni.{services.length > 0 && ' Zgłoszone nieobecności znajdziesz poniżej.'}</p><button className="button primary" onClick={() => onOpenDay()}>Przejdź do grafiku</button></div>}
        <section className="upcoming-services" aria-labelledby="upcoming-heading"><div className="services-section-heading"><h2 id="upcoming-heading">Nadchodzące służby</h2><p>Najbliższe 30 dni · razem z nieobecnościami</p></div>
          {upcoming.length ? <ul>{upcoming.map(service => <li key={service.mass.id}><ServiceCard service={service} activeId={server.id} now={now} busy={busy || loading || !!error} onAction={onAction} onOpenDay={onOpenDay} /></li>)}</ul> : <p className="sidebar-empty">Brak kolejnych terminów w tym okresie.</p>}
        </section>
        </div><aside className="sidebar services-sidebar" aria-label="Twoje dyżury i podsumowanie">
          <section className="personal-panel">
            <div className="personal-icon"><HeartHandshake size={22} strokeWidth={1.5} /></div>
            <h2>Dobrze, że jesteś, {server.name.split(' ')[0]}.</h2>
            <div className="personal-summary"><span>Twoje służby w ostatnich 30 dniach</span><strong>{data.recentAttendance ? data.recentAttendance[server.id] ?? 0 : '—'}</strong></div>
          </section>
          <MyRecurringRules rules={data.rules} activeId={server.id} busy={busy || loading || !!error} onEdit={onEditRule} onDelete={onDeleteRule} />
        </aside>
      </div>}
    </>}
  </section>;
}
