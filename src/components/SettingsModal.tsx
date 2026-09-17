import { useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, ChevronRight, Download, LogOut, Palette, Settings, ShieldCheck } from 'lucide-react';
import Modal from './Modal';
import AccentSelector, { useAccent } from './AccentSelector';
import { useTheme, themeOptions } from './ThemeSelector';
import { usePwaInstall } from '../hooks/usePwaInstall';
import AppLogo from './AppLogo';
import type { AdminSession } from '../types/database';

type SettingsView = 'menu' | 'appearance' | 'install';

interface SettingsModalProps {
  adminSession?: AdminSession | null;
  onAdminToggle?: () => void;
}

export default function SettingsModal({ adminSession, onAdminToggle }: SettingsModalProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<SettingsView>('menu');

  const { theme, changeTheme, storageError } = useTheme();
  const accentSettings = useAccent();
  const { installed, ios, canInstall, promptInstall } = usePwaInstall();

  const handleOpen = () => {
    setView('menu');
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const modalTitle = view === 'appearance'
    ? 'Wygląd aplikacji'
    : view === 'install'
      ? 'Pobierz aplikację'
      : 'Ustawienia';

  return (
    <>
      <button
        type="button"
        className="settings-toggle"
        onClick={handleOpen}
        aria-label="Ustawienia i opcje"
        title="Ustawienia i opcje"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Settings size={19} aria-hidden="true" />
      </button>

      {open && (
        <Modal title={modalTitle} onClose={handleClose} className="settings-modal">
          {view === 'menu' && (
            <>
              <div className="settings-menu-list" aria-label="Menu ustawień">
                <button
                  type="button"
                  className="settings-menu-item"
                  onClick={() => setView('appearance')}
                >
                  <span className="settings-item-icon settings-icon-palette" aria-hidden="true">
                    <Palette size={22} />
                  </span>
                  <span className="settings-item-text">
                    <strong>Wygląd aplikacji</strong>
                  </span>
                  <ChevronRight size={18} className="settings-item-arrow" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  className="settings-menu-item"
                  onClick={() => setView('install')}
                >
                  <span className="settings-item-icon settings-icon-download" aria-hidden="true">
                    <Download size={22} />
                  </span>
                  <span className="settings-item-text">
                    <strong>Pobierz aplikację</strong>
                  </span>
                  <ChevronRight size={18} className="settings-item-arrow" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  className="settings-menu-item"
                  onClick={() => {
                    handleClose();
                    onAdminToggle?.();
                  }}
                  aria-label={adminSession ? 'Wyłącz tryb administratora' : 'Administrator'}
                >
                  <span className={`settings-item-icon ${adminSession ? 'settings-icon-admin-active' : 'settings-icon-admin'}`} aria-hidden="true">
                    {adminSession ? <LogOut size={22} /> : <ShieldCheck size={22} />}
                  </span>
                  <span className="settings-item-text">
                    <strong>{adminSession ? 'Wyłącz tryb administratora' : 'Administrator'}</strong>
                  </span>
                  <ChevronRight size={18} className="settings-item-arrow" aria-hidden="true" />
                </button>
              </div>

              <div className="modal-actions">
                <button type="button" className="button secondary" onClick={handleClose}>
                  Zamknij
                </button>
              </div>
            </>
          )}

          {view === 'appearance' && (
            <div className="settings-subview">
              <div className="settings-back-bar">
                <button
                  type="button"
                  className="settings-back-link"
                  onClick={() => setView('menu')}
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  <span>Wróć do ustawień</span>
                </button>
              </div>

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

              {storageError && <p role="status">Tryb działa, ale przeglądarka nie pozwala go zapamiętać.</p>}

              <AccentSelector {...accentSettings} />

              <div className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setView('menu')}
                >
                  <ArrowLeft size={16} />
                  <span>Wróć</span>
                </button>
                <button type="button" className="button primary" onClick={handleClose}>
                  Gotowe
                </button>
              </div>
            </div>
          )}

          {view === 'install' && (
            <div className="settings-subview">
              <div className="settings-back-bar">
                <button
                  type="button"
                  className="settings-back-link"
                  onClick={() => setView('menu')}
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  <span>Wróć do ustawień</span>
                </button>
              </div>

              <div className="install-view-content">
                <div className="install-app-preview">
                  <AppLogo className="app-logo" width={44} height={44} />
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
                      <p>Działa w trybie pełnoekranowym na tym urządzeniu. Możesz uruchamiać ją bezpośrednio z ekranu głównego.</p>
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

              <div className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setView('menu')}
                >
                  <ArrowLeft size={16} />
                  <span>Wróć</span>
                </button>
                <button type="button" className="button primary" onClick={handleClose}>
                  Zamknij
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
