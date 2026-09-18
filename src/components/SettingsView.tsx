import {
  Award,
  CalendarDays,
  Check,
  CheckCircle2,
  Download,
  LogOut,
  Palette,
  Plus,
  Shield,
  ShieldCheck,
  Smartphone,
  Trophy,
  UserRound,
  Users,
} from 'lucide-react';
import AccentSelector, { useAccent } from './AccentSelector';
import { themeOptions, useTheme } from './ThemeSelector';
import { usePwaInstall } from '../hooks/usePwaInstall';
import AppLogo from './AppLogo';
import type { AdminSession } from '../types/database';

interface Props {
  adminSession: AdminSession | null;
  onAdminToggle: () => void;
  onOpenAdminModal?: (modal: 'add' | 'points' | 'badges' | 'celebrants' | 'annotations' | 'servers') => void;
}

export default function SettingsView({ adminSession, onAdminToggle, onOpenAdminModal }: Props) {
  const { theme, changeTheme, storageError } = useTheme();
  const accentSettings = useAccent();
  const { installed, ios, canInstall, promptInstall } = usePwaInstall();

  return (
    <section className="settings-view" aria-label="Ustawienia">
      <div className="settings-heading">
        <h2>Ustawienia</h2>
        <p>Dostosuj wygląd aplikacji, pobierz ją na telefon lub zarządzaj grafikiem jako administrator.</p>
      </div>

      <div className="settings-grid">
        {/* Karta 1: Wygląd aplikacji */}
        <div className="settings-card appearance-section">
          <div className="settings-card-header">
            <span className="settings-card-icon settings-icon-palette" aria-hidden="true">
              <Palette size={20} />
            </span>
            <div>
              <h3>Wygląd i motyw</h3>
              <p>Wybierz tryb kolorów i kolor akcentu dopasowany do Ciebie</p>
            </div>
          </div>

          <div className="settings-card-body">
            <div className="settings-field-group">
              <span className="settings-group-label">Tryb kolorów</span>
              <div className="theme-options" role="group" aria-label="Tryb kolorów">
                {themeOptions.map(({ value, label, description, Icon: OptionIcon }) => (
                  <button
                    key={value}
                    type="button"
                    className="theme-option"
                    aria-pressed={theme === value}
                    onClick={() => changeTheme(value)}
                  >
                    <span className={`theme-preview theme-preview-${value}`}>
                      <OptionIcon size={22} />
                    </span>
                    <span>
                      <strong>{label}</strong>
                      <small>{description}</small>
                    </span>
                    {theme === value && <Check size={18} />}
                  </button>
                ))}
              </div>
              {storageError && (
                <p className="settings-error-note" role="status">
                  Tryb działa, ale przeglądarka nie pozwala go zapamiętać.
                </p>
              )}
            </div>

            <div className="settings-field-group">
              <AccentSelector {...accentSettings} />
            </div>
          </div>
        </div>

        {/* Karta 2: Pobierz aplikację */}
        <div className="settings-card install-section">
          <div className="settings-card-header">
            <span className="settings-card-icon settings-icon-download" aria-hidden="true">
              <Smartphone size={20} />
            </span>
            <div>
              <h3>Aplikacja na telefon</h3>
              <p>Zainstaluj jako PWA, aby mieć szybki dostęp z ekranu głównego</p>
            </div>
          </div>

          <div className="settings-card-body">
            <div className="install-app-preview">
              <AppLogo className="app-logo" width={42} height={42} />
              <div>
                <strong>Ministrantappka</strong>
                <p>Grafik służby liturgicznej</p>
              </div>
            </div>

            {installed ? (
              <div className="install-status-box success">
                <CheckCircle2 size={24} className="install-success-icon" aria-hidden="true" />
                <div>
                  <strong>Aplikacja jest już zainstalowana</strong>
                  <p>Działa w trybie pełnoekranowym na tym urządzeniu i jest dostępna z ekranu głównego.</p>
                </div>
              </div>
            ) : canInstall && !ios ? (
              <div className="install-prompt-card">
                <p>
                  Zainstaluj aplikację na telefonie lub komputerze, aby mieć natychmiastowy dostęp do grafiku – działa szybciej i bez paska adresu przeglądarki.
                </p>
                <button
                  type="button"
                  className="button primary install-action-btn"
                  onClick={() => void promptInstall()}
                >
                  <Download size={18} />
                  <span>Zainstaluj aplikację</span>
                </button>
              </div>
            ) : ios ? (
              <div className="ios-install-guide">
                <p>Aby dodać aplikację do ekranu głównego na iPhone lub iPad:</p>
                <ol className="ios-steps">
                  <li>Dotknij ikony <strong>Udostępnij</strong> (kwadrat ze strzałką w górę) na dolnym pasku Safari.</li>
                  <li>Przewiń listę opcji w dół i wybierz <strong>Do ekranu początkowego</strong>.</li>
                  <li>Kliknij <strong>Dodaj</strong> w prawym górnym rogu ekranu.</li>
                </ol>
              </div>
            ) : (
              <div className="generic-install-guide">
                <p>
                  Aby dodać aplikację do ekranu głównego, otwórz menu swojej przeglądarki (np. ikonę trzech kropek) i wybierz <strong>Zainstaluj aplikację</strong> lub <strong>Dodaj do ekranu głównego</strong>.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Karta 3: Strefa administratora */}
        <div className="settings-card admin-section">
          <div className="settings-card-header">
            <span
              className={`settings-card-icon ${adminSession ? 'settings-icon-admin-active' : 'settings-icon-admin'}`}
              aria-hidden="true"
            >
              {adminSession ? <ShieldCheck size={20} /> : <Shield size={20} />}
            </span>
            <div>
              <h3>Tryb administratora</h3>
              <p>Zarządzanie mszami, punktacją, odznakami i listą ministrantów</p>
            </div>
          </div>

          <div className="settings-card-body">
            <div className={`admin-status-box ${adminSession ? 'is-active' : ''}`}>
              <div className="admin-status-badge">
                <span className={`admin-status-dot ${adminSession ? 'active' : ''}`} />
                <span>{adminSession ? 'Tryb administratora aktywny' : 'Brak uprawnień administratora'}</span>
              </div>
              <p>
                {adminSession
                  ? 'Masz pełne uprawnienia do edycji grafiku, zarządzania punktami i modyfikacji bazy ministrantów.'
                  : 'Wymaga autoryzacji kodem PIN. Po zalogowaniu możesz dodawać nabożeństwa, przyznawać punkty i odznaki.'}
              </p>

              <button
                type="button"
                className={`button ${adminSession ? 'secondary' : 'primary'} admin-auth-btn`}
                onClick={onAdminToggle}
                aria-label={adminSession ? 'Wyłącz tryb administratora' : 'Administrator'}
              >
                {adminSession ? <LogOut size={18} /> : <ShieldCheck size={18} />}
                <span>{adminSession ? 'Wyłącz tryb administratora' : 'Zaloguj jako administrator'}</span>
              </button>
            </div>

            {adminSession && onOpenAdminModal && (
              <div className="admin-quick-actions">
                <span className="settings-group-label">Szybkie narzędzia administratora</span>
                <div className="admin-quick-grid">
                  <button type="button" className="button secondary" onClick={() => onOpenAdminModal('add')}>
                    <Plus size={16} />
                    <span>Dodaj Mszę</span>
                  </button>
                  <button type="button" className="button secondary" onClick={() => onOpenAdminModal('points')}>
                    <Trophy size={16} />
                    <span>Punktacja</span>
                  </button>
                  <button type="button" className="button secondary" onClick={() => onOpenAdminModal('badges')}>
                    <Award size={16} />
                    <span>Odznaki</span>
                  </button>
                  <button type="button" className="button secondary" onClick={() => onOpenAdminModal('celebrants')}>
                    <UserRound size={16} />
                    <span>Księża</span>
                  </button>
                  <button type="button" className="button secondary" onClick={() => onOpenAdminModal('annotations')}>
                    <CalendarDays size={16} />
                    <span>Oznacz dni</span>
                  </button>
                  <button type="button" className="button secondary" onClick={() => onOpenAdminModal('servers')}>
                    <Users size={16} />
                    <span>Ministranci</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Karta 4: O aplikacji */}
        <div className="settings-card about-section">
          <div className="settings-card-header">
            <AppLogo className="app-logo" width={28} height={28} />
            <div>
              <h3>O aplikacji</h3>
              <p>Informacje o systemie i wspólnocie</p>
            </div>
          </div>

          <div className="settings-card-body about-body">
            <div className="about-info-row">
              <span className="about-label">Aplikacja</span>
              <strong>Ministrantappka</strong>
            </div>
            <div className="about-info-row">
              <span className="about-label">Przeznaczenie</span>
              <span>Grafik służby liturgicznej i rywalizacja</span>
            </div>
            <div className="about-info-row">
              <span className="about-label">Działanie offline</span>
              <span>Automatyczne buforowanie i synchronizacja w tle</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
