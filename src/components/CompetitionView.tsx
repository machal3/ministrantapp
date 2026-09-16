import { useMemo, useState } from 'react';
import { AlertCircle, Award, CalendarDays, Check, ChevronDown, Flame, HeartHandshake, Info, LoaderCircle, Medal, RefreshCw, Sparkles, Star, Sunrise, Trophy, UserMinus, UserRound } from 'lucide-react';
import { buildCompetition, competitionSeason, POINTS, type Badge, type CompetitionProfile } from '../lib/competition';
import { polishDate, shiftDate } from '../lib/dates';
import type { ScheduleData } from '../types/database';
import Modal from './Modal';

interface Props {
  data: ScheduleData | null;
  activeId: string;
  now: Date;
  loading: boolean;
  error: string;
  offline: boolean;
  onRetry: () => void;
  onOpenSchedule: () => void;
  onJoinCompetition?: (serverId: string) => Promise<void> | void;
  onLeaveCompetition?: (serverId: string) => Promise<void> | void;
}

const badgeIcons = { sunrise: Sunrise, star: Star, flame: Flame, calendar: CalendarDays, medal: Medal, heart: HeartHandshake };
const displayDate = (day: string) => polishDate(day, { day: 'numeric', month: 'long', year: 'numeric' });

function BadgeCard({ badge }: { badge: Badge }) {
  const Icon = badgeIcons[badge.icon];
  return <li className={`competition-badge ${badge.earned ? 'is-earned' : ''}`}>
    <div className="competition-badge-header">
      <span className={`competition-badge-icon badge-${badge.icon}`}><Icon size={24} strokeWidth={1.6} aria-hidden="true" /></span>
      <span className="competition-badge-reward">+{badge.points} pkt</span>
    </div>
    <div className="competition-badge-copy"><h4>{badge.name}</h4><p>{badge.description}</p></div>
    <div className="competition-badge-progress"><span>{badge.earned ? <><Check size={14} />Zdobyta</> : 'W drodze'}</span><strong>{badge.value} / {badge.target}</strong></div>
    <progress max={badge.target} value={badge.value} aria-label={`Postęp odznaki ${badge.name}`} />
  </li>;
}

function OptedOutPanel({ profile, onJoin, busy }: { profile: CompetitionProfile; onJoin?: () => void; busy?: boolean }) {
  return <div className="personal-panel competition-opted-out" aria-labelledby="opted-out-heading">
    <div className="competition-opted-out-header">
      <div className="competition-opted-out-icon"><Trophy size={28} strokeWidth={1.5} /></div>
      <div>
        <h3 id="opted-out-heading">Nie bierzesz udziału w rywalizacji</h3>
        <p>{profile.server.name}, jesteś obecnie wypisany z rywalizacji.</p>
      </div>
    </div>
    <div className="competition-opted-out-body">
      <p>Twoje punkty za odbyte służby naliczają się w tle, ale Twój profil nie jest widoczny w rankingu wspólnoty i nie otrzymujesz powiadomień o potwierdzenie obecności.</p>
      <p>W każdej chwili możesz dołączyć do rywalizacji — wszystkie Twoje punkty zostaną od razu uwzględnione bez konieczności ponownego potwierdzania zaległych Mszy.</p>
    </div>
    <div className="competition-opted-out-actions">
      <button className="button primary competition-join-btn" disabled={busy} onClick={onJoin}>
        <Trophy size={16} />Zapisz się do rywalizacji
      </button>
    </div>
  </div>;
}

function PersonalProgress({ profile, onOpenSchedule }: { profile: CompetitionProfile; onOpenSchedule: () => void }) {
  const { level } = profile;
  const remaining = Math.max(0, 2 - profile.weekCount);
  return <>
    <section className="personal-panel competition-level" aria-labelledby="level-heading">
      <div className="competition-level-top"><span><Sparkles size={16} />Twój rozwój w tym sezonie</span><span className="competition-level-number">Poziom {level.level}</span></div>
      <h3 id="level-heading">{level.name}</h3>
      <p>{profile.server.name}, każda służba ma znaczenie.</p>
      <div className="competition-points"><strong>{profile.points.toLocaleString('pl-PL')}</strong><span>punktów</span></div>
      <progress max={level.required} value={level.progress} aria-label="Postęp do następnego poziomu" />
      <div className="competition-level-caption"><span>Do poziomu {level.level + 1}</span><strong>{level.next - profile.points} pkt</strong></div>
      <div className="competition-point-breakdown"><span>Służby <strong>{profile.servicePoints} pkt</strong></span><span>Regularność <strong>+{profile.bonusPoints} pkt</strong></span><span>Odznaki <strong>+{profile.badgePoints} pkt</strong></span>{profile.adjustmentPoints !== 0 && <span>Korekty <strong>{profile.adjustmentPoints > 0 ? '+' : ''}{profile.adjustmentPoints} pkt</strong></span>}</div>
    </section>
    <section className="sidebar-panel competition-streak" aria-labelledby="streak-heading">
      <h3 id="streak-heading"><Flame size={19} />Twój rytm</h3>
      <div className="competition-streak-total"><strong>{profile.streak}</strong><span>tygodni w aktualnej serii</span></div>
      <div className="competition-week-goal"><span>Ten tydzień · pon.–niedz.</span><strong>{profile.weekCount} / 2 służby</strong></div>
      <progress max={2} value={Math.min(profile.weekCount, 2)} aria-label="Cel dwóch służb w tym tygodniu" />
      <p>{remaining ? `Jeszcze ${remaining === 1 ? '1 potwierdzona służba' : '2 potwierdzone służby'}, aby ${profile.streak ? 'przedłużyć' : 'rozpocząć'} serię. Niedziela też się liczy!` : 'Cel obecności osiągnięty! W tym tygodniu masz już co najmniej dwie potwierdzone służby.'}</p>
      <div className="competition-best"><span>Najdłuższa seria</span><strong>{profile.bestStreak} tyg.</strong></div>
      <button className="button secondary" onClick={onOpenSchedule}><CalendarDays size={16} />Zaplanuj kolejną służbę</button>
    </section>
  </>;
}

export default function CompetitionView({ data, activeId, now, loading, error, offline, onRetry, onOpenSchedule, onJoinCompetition, onLeaveCompetition }: Props) {
  const result = useMemo(() => data ? buildCompetition(data, now) : null, [data, now]);
  const profile = result?.profiles.find(person => person.server.id === activeId);
  const isParticipant = profile?.isParticipant ?? false;
  const season = result?.season ?? competitionSeason(now);
  const [historyLimit, setHistoryLimit] = useState(8);
  const [rankingLimit, setRankingLimit] = useState(10);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  const earned = profile?.badges.filter(badge => badge.earned).length ?? 0;
  return <section className="competition-view" aria-label="Rywalizacja">
    <header className="competition-heading">
      <span className="competition-season"><CalendarDays size={15} />Sezon {season.label}</span>
      <span className="competition-season-dates">{displayDate(season.start)} – {displayDate(shiftDate(season.end, -1))}</span>
    </header>
    {data?.competitionState?.reset_at && <div className="info-banner">Administrator zresetował punktację {new Date(data.competitionState.reset_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}. Punkty naliczają się za służby rozpoczynające się po resecie. Serie i odznaki są zachowane.</div>}
    {offline && <div className="info-banner" role="status">Połączenie na żywo jest niedostępne. Wyniki odświeżają się co minutę oraz po powrocie do karty.</div>}
    {error && <div className="error-banner" role="alert"><AlertCircle size={20} /><div><strong>Nie udało się odświeżyć rywalizacji</strong><p>{error}</p>{data && <p>Wyświetlane wyniki mogą być nieaktualne.</p>}</div><button className="button secondary" disabled={loading} onClick={onRetry}><RefreshCw size={16} />Ponów</button></div>}
    {loading && <p className="services-loading" role="status"><LoaderCircle className="animate-spin" size={20} />{data ? 'Odświeżamy wyniki…' : 'Przygotowujemy rywalizację…'}</p>}
    {result && <div className="competition-layout">
      <div className="competition-main">
        {profile ? (
          isParticipant ? (
            <div className="competition-personal-grid"><PersonalProgress profile={profile} onOpenSchedule={onOpenSchedule} /></div>
          ) : (
            <div className="competition-personal-grid"><OptedOutPanel profile={profile} onJoin={() => void onJoinCompetition?.(profile.server.id)} busy={loading} /></div>
          )
        ) : <div className="empty-state competition-selection"><UserRound size={32} /><h3>Odkryj swój postęp</h3><p>Wybierz swoje imię w nagłówku, aby zobaczyć poziom, serię i odznaki. Ranking wspólnoty znajdziesz obok.</p></div>}
        {profile && isParticipant && <section className="competition-badges" aria-labelledby="badges-heading"><div className="competition-section-heading"><div><h3 id="badges-heading"><Award size={19} />Twoje odznaki</h3><p>Każda opowiada inną historię Twojej służby.</p></div><span>{earned} / {profile.badges.length} zdobytych</span></div>
          <ul>{profile.badges.map(badge => <BadgeCard key={badge.id} badge={badge} />)}</ul>
          <p className="competition-month-note"><CalendarDays size={15} />Niedziele w tym miesiącu: <strong>{profile.monthProgress} / {profile.monthTarget}</strong>. Liczy się każda niedziela, niezależnie od liczby służb tego dnia.</p>
        </section>}
        {profile && isParticipant && <section className="sidebar-panel competition-history" aria-labelledby="points-heading"><div className="competition-section-heading"><h3 id="points-heading">Historia punktów</h3><span>{profile.serviceCount} służb w sezonie</span></div>
          {profile.entries.length ? <><ul>{profile.entries.slice(0, historyLimit).map(entry => <li key={entry.id}><span className={`competition-history-icon ${entry.id.startsWith('badge-') ? 'is-badge' : entry.id.startsWith('week-') ? 'is-bonus' : ''}`}>{entry.id.startsWith('badge-') ? <Award size={17} /> : entry.id.startsWith('week-') ? <Flame size={17} /> : <HeartHandshake size={17} />}</span><div><strong>{entry.title}</strong><span>{polishDate(entry.day, { day: 'numeric', month: 'short' })} · {entry.detail}</span></div><strong className="competition-earned-points">{entry.points >= 0 ? '+' : ''}{entry.points}<small> pkt</small></strong></li>)}</ul>{historyLimit < profile.entries.length && <button className="button secondary competition-more" onClick={() => setHistoryLimit(value => value + 12)}><ChevronDown size={16} />Pokaż więcej</button>}</> : <p className="sidebar-empty">Punkty pojawią się po potwierdzeniu obecności na odbytej służbie. Przyszłe i niepotwierdzone terminy jeszcze nie dają punktów.</p>}
        </section>}
      </div>
      <aside className="competition-sidebar" aria-label="Ranking i zasady rywalizacji">
        <section className="sidebar-panel competition-ranking" aria-labelledby="ranking-heading"><h3 id="ranking-heading"><Trophy size={18} />Ranking wspólnoty</h3><p className="competition-panel-caption">Kibicujemy sobie nawzajem.</p>
          {profile && <div className="competition-own-place"><span>Twoje miejsce</span><strong>{!isParticipant ? 'Wypisany z rywalizacji' : profile.points ? `#${profile.place}` : 'Start przed Tobą'}</strong></div>}
          {result.profiles.some(person => person.isParticipant && person.points > 0) ? <><ol>{result.profiles.filter(person => person.isParticipant && person.points > 0).slice(0, rankingLimit).map(person => <li key={person.server.id} className={person.server.id === activeId ? 'is-own' : ''} aria-current={person.server.id === activeId ? 'true' : undefined}><span className={`competition-place place-${person.place}`} aria-label={`Miejsce ${person.place}`}>{person.place <= 3 ? <Medal size={18} /> : null}{person.place}</span><div><strong>{person.server.name}{person.server.id === activeId && <small> Ty</small>}</strong><span>Poziom {person.level.level} · {person.serviceCount} służb</span></div><strong className="competition-ranking-points">{person.points}<small>pkt</small></strong></li>)}</ol>{rankingLimit < result.profiles.filter(person => person.isParticipant && person.points > 0).length && <button className="button secondary competition-more" onClick={() => setRankingLimit(value => value + 20)}>Pokaż kolejne osoby</button>}</> : <p className="sidebar-empty">Nowy sezon, czysta karta. Ranking otworzą pierwsze służby.</p>}
          <p className="competition-ranking-note">Tyle samo punktów oznacza wspólne miejsce.</p>
        </section>
        <section className="sidebar-panel competition-rules" aria-labelledby="competition-rules-heading"><h3 id="competition-rules-heading"><Info size={18} />Jak zdobywasz punkty?</h3>
          <dl>
            <div><dt>Poniedziałek – sobota</dt><dd>+{POINTS.weekday} pkt</dd></div>
            <div><dt>Niedziela</dt><dd>+{POINTS.sunday} pkt</dd></div>
            <div><dt>Co najmniej 2 służby w tygodniu</dt><dd>+{POINTS.weekly} pkt</dd></div>
            <div><dt>Każdy kolejny tydzień serii</dt><dd>+{POINTS.streakStep} do bonusu</dd></div>
            <div><dt>Zdobyte odznaki</dt><dd>+10 do +120 pkt</dd></div>
          </dl>
          <p>Bonus tygodniowy rośnie: 10, 15, 20, 25, maksymalnie 30 pkt. Przyznajemy go raz w tygodniu, po drugiej służbie. Tydzień trwa od poniedziałku do niedzieli; trwający tydzień nie przerywa serii.</p>
          <details><summary>Pełne zasady i poziomy</summary><div className="competition-rule-details">
            <p>Liczymy Msze i nabożeństwa z odpowiedzią „Tak, byłem”. Pytanie o obecność pojawia się godzinę po rozpoczęciu służby. Zaległe terminy potwierdzasz po kolei. Nieobecności, brak odpowiedzi i „inne wydarzenia” nie dają punktów ani postępu odznak. Dwie różne służby tego samego dnia też realizują cel tygodniowy.</p>
            <p>Poziomy rozpoczynają się od 0, 100, 300, 600, 1000, 1500 punktów. Każdy kolejny wymaga o 100 punktów więcej niż poprzedni. Odznaki nagradzają wyjątkowe osiągnięcia i dodają od 10 do 120 punktów w zależności od trudności (np. Pierwszy krok +10 pkt, Pasterka i Pascha po +50 pkt, Filar wspólnoty +120 pkt).</p>
            <p>Wyniki, serie, poziomy i odznaki dotyczą bieżącego sezonu. Reset następuje o północy w pierwszą niedzielę Adwentu, według czasu polskiego. W pierwszym, niepełnym tygodniu liczą się tylko służby nowego sezonu. Dane grafiku pozostają zachowane.</p>
            <p>Odznaka niedzielna wymaga wszystkich niedziel pełnego miesiąca w sezonie. Pasterkę i Wigilię Paschalną rozpoznajemy po nazwie wydarzenia lub okazji liturgicznej oraz odpowiedniej dacie i godzinie.</p>
            <p>Administrator może dodać lub odjąć punkty, ustawić konkretny wynik albo zresetować punktację wspólnoty. Korekty zapisujemy w historii. Reset punktów nie usuwa obecności, serii ani odznak; wcześniejsze służby nie przywracają punktów po resecie. Edycja lub usunięcie historycznego wydarzenia może zmienić wynik. Potwierdzenia obecności pozostają niezależne od późniejszych zmian stałych dyżurów.</p>
          </div></details>
        </section>
        {profile && isParticipant && onLeaveCompetition && (
          <div className="competition-leave-wrap">
            <button
              className="competition-leave-btn"
              disabled={loading || leaveBusy}
              onClick={() => { setLeaveError(''); setConfirmLeaveOpen(true); }}
            >
              <UserMinus size={15} />Wypisz się z rywalizacji
            </button>
          </div>
        )}
      </aside>
    </div>}
    {confirmLeaveOpen && profile && (
      <Modal
        title="Wypisanie z rywalizacji"
        onClose={() => { if (!leaveBusy) setConfirmLeaveOpen(false); }}
        busy={leaveBusy}
        className="leave-competition-modal"
      >
        <p className="confirmation-description">
          Czy na pewno chcesz wypisać się z rywalizacji punktowej?
        </p>
        <div className="leave-competition-box">
          <p className="leave-competition-box-title">
            <Info size={16} />Co oznacza wypisanie?
          </p>
          <ul className="leave-competition-list">
            <li>Twoje punkty i historia służb <strong>nadal będą naliczane w tle</strong>.</li>
            <li>Twój profil <strong>nie będzie widoczny</strong> w rankingu wspólnoty.</li>
            <li>Nie będą pojawiać się powiadomienia z prośbą o potwierdzenie obecności po służbie.</li>
            <li>W każdej chwili możesz powrócić do rywalizacji — punkty nie przepadną.</li>
          </ul>
        </div>
        {leaveError && <p className="form-error" role="alert">{leaveError}</p>}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={leaveBusy}
            onClick={() => setConfirmLeaveOpen(false)}
          >
            Anuluj
          </button>
          <button
            type="button"
            className="button danger"
            disabled={leaveBusy}
            onClick={async () => {
              setLeaveBusy(true);
              setLeaveError('');
              try {
                await onLeaveCompetition?.(profile.server.id);
                setConfirmLeaveOpen(false);
              } catch (err) {
                setLeaveError(err instanceof Error ? err.message : 'Nie udało się wypisać z rywalizacji.');
              } finally {
                setLeaveBusy(false);
              }
            }}
          >
            {leaveBusy ? <LoaderCircle size={16} className="animate-spin" /> : <UserMinus size={16} />}
            Potwierdź wypisanie
          </button>
        </div>
      </Modal>
    )}
  </section>;
}
