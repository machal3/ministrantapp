import { useMemo, useState } from 'react';
import { AlertCircle, Award, CalendarDays, Check, ChevronDown, Flame, HeartHandshake, Info, LoaderCircle, Medal, RefreshCw, Sparkles, Star, Sunrise, Trophy, UserMinus, UserRound } from 'lucide-react';
import { buildCompetition, competitionSeason, POINTS, type Badge, type CompetitionProfile } from '../lib/competition';
import { polishDate, shiftDate } from '../lib/dates';
import type { ScheduleData } from '../types/database';
import Modal from './Modal';
import BackgroundSyncNotice from './BackgroundSyncNotice';

interface Props {
  data: ScheduleData | null;
  activeId: string;
  now: Date;
  loading: boolean;
  error: string;
  offline: boolean;
  onRetry: () => void;
  onJoinCompetition?: (serverId: string) => Promise<void> | void;
  onLeaveCompetition?: (serverId: string) => Promise<void> | void;
}

const badgeIcons = { sunrise: Sunrise, star: Star, flame: Flame, calendar: CalendarDays, medal: Medal, heart: HeartHandshake };
const displayDate = (day: string) => polishDate(day, { day: 'numeric', month: 'long', year: 'numeric' });

function BadgeCard({ badge, showProgress = true }: { badge: Badge; showProgress?: boolean }) {
  const Icon = badgeIcons[badge.icon];
  return <li className={`competition-badge ${badge.earned ? 'is-earned' : ''}`}>
    <div className="competition-badge-header">
      <span className={`competition-badge-icon badge-${badge.icon}`}><Icon size={24} strokeWidth={1.6} aria-hidden="true" /></span>
      <span className="competition-badge-reward">+{badge.points} pkt</span>
    </div>
    <div className="competition-badge-copy"><h4>{badge.name}</h4><p>{badge.description}</p></div>
    <div className="competition-badge-progress"><span>{badge.earned ? <><Check size={14} />Zdobyta</> : 'W drodze'}</span>{showProgress && <strong>{badge.value} / {badge.target}</strong>}</div>
    {showProgress && <progress max={badge.target} value={badge.value} aria-label={`Postęp odznaki ${badge.name}`} />}
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

function PersonalProgress({ profile }: { profile: CompetitionProfile }) {
  const { level } = profile;
  const remaining = Math.max(0, 2 - profile.weekCount);
  return <>
    <section className="personal-panel competition-level" aria-labelledby="level-heading">
      <div className="competition-level-top"><span><Sparkles size={19} />Twój rozwój w tym sezonie</span><span className="competition-level-number">Poziom {level.level}</span></div>
      <h3 id="level-heading">{level.name}</h3>
      <div className="competition-points"><strong>{profile.points.toLocaleString('pl-PL')}</strong><span>punktów</span></div>
      <progress max={level.required} value={level.progress} aria-label="Postęp do następnego poziomu" />
      <div className="competition-level-caption"><span>Do poziomu {level.level + 1}</span><strong>{profile.points.toLocaleString('pl-PL')} / {level.next.toLocaleString('pl-PL')} pkt</strong></div>
      <div className="competition-point-breakdown"><span>Służby <strong>{profile.servicePoints} pkt</strong></span><span>Regularność <strong>+{profile.bonusPoints} pkt</strong></span><span>Odznaki <strong>+{profile.badgePoints} pkt</strong></span>{profile.adjustmentPoints !== 0 && <span>Korekty <strong>{profile.adjustmentPoints > 0 ? '+' : ''}{profile.adjustmentPoints} pkt</strong></span>}</div>
    </section>
    <section className="sidebar-panel competition-streak" aria-labelledby="streak-heading">
      <div className="competition-streak-header">
        <h3 id="streak-heading"><Flame size={19} />Twój rytm</h3>
        <div className="competition-streak-total"><strong>{profile.streak}</strong><span>tygodni w aktualnej serii</span></div>
      </div>
      <div className="competition-streak-progress">
        <div className="competition-week-goal"><span>Ten tydzień · pon.–niedz.</span><strong>{profile.weekCount} / 2 służby</strong></div>
        <progress max={2} value={Math.min(profile.weekCount, 2)} aria-label="Cel dwóch służb w tym tygodniu" />
        <p>{remaining ? `Jeszcze ${remaining === 1 ? '1 potwierdzona służba' : '2 potwierdzone służby'}, aby ${profile.streak ? 'przedłużyć' : 'rozpocząć'} serię. Niedziela też się liczy!` : 'Cel obecności osiągnięty! W tym tygodniu masz już co najmniej dwie potwierdzone służby.'}</p>
      </div>
      <div className="competition-best"><span>Najdłuższa seria</span><strong>{profile.bestStreak} tyg.</strong></div>
    </section>
  </>;
}

export default function CompetitionView({ data, activeId, now, loading, error, offline, onRetry, onJoinCompetition, onLeaveCompetition }: Props) {
  const result = useMemo(() => data ? buildCompetition(data, now) : null, [data, now]);
  const profile = result?.profiles.find(person => person.server.id === activeId);
  const isParticipant = profile?.isParticipant ?? false;
  const season = result?.season ?? competitionSeason(now);
  const [historyLimit, setHistoryLimit] = useState(8);
  const [rankingLimit, setRankingLimit] = useState(10);
  const [badgeFilter, setBadgeFilter] = useState<'all' | 'earned' | 'pending'>('all');
  const [showAllBadges, setShowAllBadges] = useState(false);
  const filteredBadges = profile?.badges.filter(badge => badgeFilter === 'all' || badge.earned === (badgeFilter === 'earned')) ?? [];
  const [badgesPersonId, setBadgesPersonId] = useState<string | null>(null);
  const badgesPerson = result?.profiles.find(person => person.isParticipant && person.server.id === badgesPersonId);
  const communityBadges = badgesPerson?.badges.filter(badge => badge.earned) ?? [];
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
    {error && !data && <div className="error-banner" role="alert"><AlertCircle size={20} /><div><strong>Nie udało się odświeżyć rywalizacji</strong><p>{error}</p>{data && <p>Wyświetlane wyniki mogą być nieaktualne.</p>}</div><button className="button secondary" disabled={loading} onClick={onRetry}><RefreshCw size={16} />Ponów</button></div>}
    {loading && !data && <p className="services-loading" role="status"><LoaderCircle className="animate-spin" size={20} />{data ? 'Odświeżamy wyniki…' : 'Przygotowujemy rywalizację…'}</p>}
    {data && <BackgroundSyncNotice loading={loading} offline={offline} error={error} staleMessage="Wyświetlane wyniki mogą być nieaktualne." onRetry={onRetry} />}
    {result && <div className="competition-layout">
      <div className="competition-main">
        {profile ? (
          isParticipant ? (
            <div className="competition-personal-grid"><PersonalProgress profile={profile} /></div>
          ) : (
            <div className="competition-personal-grid"><OptedOutPanel profile={profile} onJoin={() => void onJoinCompetition?.(profile.server.id)} busy={loading} /></div>
          )
        ) : <div className="empty-state competition-selection"><UserRound size={32} /><h3>Odkryj swój postęp</h3><p>Wybierz swoje imię w nagłówku, aby zobaczyć poziom, serię i odznaki. Ranking wspólnoty znajdziesz obok.</p></div>}
        {profile && isParticipant && <section className="competition-badges" aria-labelledby="badges-heading"><div className="competition-section-heading"><div><h3 id="badges-heading"><Award size={19} />Twoje odznaki</h3><p>Każda opowiada inną historię Twojej służby.</p></div><span>{earned} / {profile.badges.length} zdobytych</span></div>
          <div className="competition-badge-filters" role="group" aria-label="Filtr odznak">{([
            ['all', 'Wszystkie'], ['earned', 'Zdobyte'], ['pending', 'W drodze'],
          ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={badgeFilter === value} onClick={() => { setBadgeFilter(value); setShowAllBadges(false); }}>{label}</button>)}</div>
          <ul>{(showAllBadges ? filteredBadges : filteredBadges.slice(0, 6)).map(badge => <BadgeCard key={badge.id} badge={badge} />)}</ul>
          {!filteredBadges.length && <p className="sidebar-empty">{badgeFilter === 'earned' ? 'Pierwsza odznaka jeszcze przed Tobą. Zobacz cele w zakładce „W drodze”.' : 'Wszystkie odznaki w tym sezonie są już Twoje!'}</p>}
          {filteredBadges.length > 6 && <button type="button" className="button secondary competition-more" onClick={() => setShowAllBadges(value => !value)}>{showAllBadges ? 'Pokaż mniej' : `Pokaż wszystkie odznaki (${filteredBadges.length})`}</button>}
          <p className="competition-month-note"><CalendarDays size={15} />Niedziele w tym miesiącu: <strong>{profile.monthProgress} / {profile.monthTarget}</strong>. Liczy się każda niedziela, niezależnie od liczby służb tego dnia.</p>
        </section>}
        {profile && isParticipant && <section className="sidebar-panel competition-history" aria-labelledby="points-heading"><div className="competition-section-heading"><h3 id="points-heading">Historia punktów</h3><span>{profile.serviceCount} służb w sezonie</span></div>
          {profile.entries.length ? <><ul>{profile.entries.slice(0, historyLimit).map(entry => <li key={entry.id}><span className={`competition-history-icon ${entry.id.startsWith('badge-') ? 'is-badge' : entry.id.startsWith('week-') ? 'is-bonus' : ''}`}>{entry.id.startsWith('badge-') ? <Award size={17} /> : entry.id.startsWith('week-') ? <Flame size={17} /> : <HeartHandshake size={17} />}</span><div><strong>{entry.title}</strong><span>{polishDate(entry.day, { day: 'numeric', month: 'short' })} · {entry.detail}</span></div><strong className="competition-earned-points">{entry.points >= 0 ? '+' : ''}{entry.points}<small> pkt</small></strong></li>)}</ul>{historyLimit < profile.entries.length && <button className="button secondary competition-more" onClick={() => setHistoryLimit(value => value + 12)}><ChevronDown size={16} />Pokaż więcej</button>}</> : <p className="sidebar-empty">Punkty pojawią się po potwierdzeniu obecności na odbytej służbie. Przyszłe i niepotwierdzone terminy jeszcze nie dają punktów.</p>}
        </section>}
      </div>
      <aside className="competition-sidebar" aria-label="Ranking i zasady rywalizacji">
        <section className="sidebar-panel competition-ranking" aria-labelledby="ranking-heading"><h3 id="ranking-heading"><Trophy size={18} />Ranking wspólnoty</h3>
          {profile && <div className="competition-own-place"><span>Twoje miejsce</span><strong>{!isParticipant ? 'Wypisany z rywalizacji' : profile.points ? `#${profile.place}` : 'Start przed Tobą'}</strong></div>}
          {result.profiles.some(person => person.isParticipant && person.points > 0) ? <><ol>{result.profiles.filter(person => person.isParticipant && person.points > 0).slice(0, rankingLimit).map(person => <li key={person.server.id} className={person.server.id === activeId ? 'is-own' : ''} aria-current={person.server.id === activeId ? 'true' : undefined}>
            <span className={`competition-place place-${person.place}`} aria-label={`Miejsce ${person.place}`}>{person.place <= 3 ? <Medal size={18} /> : null}{person.place}</span>
            <div><strong>{person.server.name}{person.server.id === activeId && <small> Ty</small>}</strong><span>Poziom {person.level.level} · {person.serviceCount} służb</span></div>
            <button type="button" className="competition-person-badges" aria-label={`Zobacz odznaki: ${person.server.name}`} aria-haspopup="dialog" title={`Odznaki: ${person.badges.filter(badge => badge.earned).length}`} onClick={() => setBadgesPersonId(person.server.id)}><Award size={15} aria-hidden="true" /><span>{person.badges.filter(badge => badge.earned).length}</span></button>
            <strong className="competition-ranking-points">{person.points}<small>pkt</small></strong>
          </li>)}</ol>{rankingLimit < result.profiles.filter(person => person.isParticipant && person.points > 0).length && <button className="button secondary competition-more" onClick={() => setRankingLimit(value => value + 20)}>Pokaż kolejne osoby</button>}</> : <p className="sidebar-empty">Nowy sezon, czysta karta. Ranking otworzą pierwsze służby.</p>}
          <p className="competition-ranking-note">Tyle samo punktów oznacza wspólne miejsce.</p>
        </section>
        <section className="sidebar-panel competition-rules" aria-labelledby="competition-rules-heading"><h3 id="competition-rules-heading"><Info size={18} />Jak zdobywać punkty?</h3>
          <dl>
            <div><dt>Dzień powszedni (pn. – sob.)</dt><dd>+{POINTS.weekday} pkt</dd></div>
            <div><dt>Niedziela</dt><dd>+{POINTS.sunday} pkt</dd></div>
            <div><dt>Cel tygodniowy (min. 2 służby)</dt><dd>+{POINTS.weekly} pkt</dd></div>
            <div><dt>Kolejny tydzień w serii</dt><dd>+{POINTS.streakStep} do bonusu</dd></div>
            <div><dt>Odznaki i osiągnięcia</dt><dd>+10 do +120 pkt</dd></div>
          </dl>
          <p>Bonus tygodniowy rośnie wraz z Twoją regularnością: 10, 15, 20, 25, aż do 30 pkt. Przyznajemy go po drugiej służbie w danym tygodniu (od poniedziałku do niedzieli).</p>
          <details><summary>Szczegółowe zasady i poziomy</summary><div className="competition-rule-details">
            <p><strong>Potwierdzanie obecności</strong>Punkty otrzymujesz za każdą potwierdzoną służbę na Mszy Świętej lub nabożeństwie (wystarczy zaznaczyć „Byłem”). Dwie służby tego samego dnia również wliczają się do celu tygodniowego.</p>
            <p><strong>Serie i regularność</strong>Służąc co najmniej 2 razy w tygodniu, budujesz serię tygodniową. Każdy kolejny tydzień podnosi Twój bonus o 5 punktów, co ułatwia zdobywanie kolejnych stopni.</p>
            <p><strong>Poziomy formacji</strong>Wraz ze wzrostem liczby punktów awansujesz na wyższe poziomy (progi to m.in. 100, 300, 600, 1000, 1500 pkt). To widoczny znak Twojej wierności posłudze przy ołtarzu.</p>
            <p><strong>Odznaki i uroczystości</strong>25 odznak za regularną służbę, pierwsze piątki i soboty, adorację, różaniec, Koronkę, roraty, nabożeństwa majowe i czerwcowe, Drogę Krzyżową, Gorzkie Żale i wybrane uroczystości. Każda odznaka podaje swój cel i nagrodę.</p>
            <p><strong>Co zalicza się do odznaki?</strong>Potwierdzona obecność w bieżącym sezonie. Przy odznakach nabożeństw liczymy różne dni, a przy pierwszych piątkach i sobotach — różne miesiące. Nazwa lub okazja wydarzenia powinna wskazywać nabożeństwo, np. „Adoracja”, „Różaniec” czy „Boże Ciało”. Liczy się też właściwa kategoria i data wydarzenia.</p>
            <p><strong>Pierwsze piątki i soboty</strong>Odznaki opisują udział w wydarzeniach. Nie potwierdzają spowiedzi, Komunii, intencji ani wypełnienia warunków praktyk religijnych. Seria dziewięciu piątków dotyczy dziewięciu kolejnych miesięcy w jednym sezonie aplikacji.</p>
            <p><strong>Sezon liturgiczny</strong>Rywalizacja trwa przez cały rok liturgiczny – od I Niedzieli Adwentu do kolejnego Adwentu, kiedy to wspólnie podsumowujemy osiągnięcia.</p>
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
    {badgesPersonId !== null && <Modal title="Zdobyte odznaki" className="community-badges-modal" onClose={() => setBadgesPersonId(null)}>
      <p className="community-badges-intro">Sezon {season.label}</p>
      {badgesPerson ? <section className="competition-badges community-badges-collection" aria-labelledby="community-person-heading">
        <div className="competition-section-heading"><div><h3 id="community-person-heading">{badgesPerson.server.name}</h3><p>{badgesPerson.server.rank}</p></div><span>{communityBadges.length} / {badgesPerson.badges.length} zdobytych</span></div>
        {communityBadges.length ? <ul>{communityBadges.map(badge => <BadgeCard key={badge.id} badge={badge} showProgress={false} />)}</ul> : <div className="community-badges-empty"><Award size={32} strokeWidth={1.5} aria-hidden="true" /><h4>Pierwsza odznaka jeszcze przed nami</h4><p>Gdy ta osoba zdobędzie odznakę w tym sezonie, zobaczysz ją tutaj.</p></div>}
      </section> : <p className="rule-help" role="status">Ta osoba nie jest już dostępna w rywalizacji. Zamknij panel, aby wrócić do rankingu.</p>}
      <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setBadgesPersonId(null)}>Zamknij</button></div>
    </Modal>}
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
