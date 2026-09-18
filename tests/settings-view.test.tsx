import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SettingsView from '../src/components/SettingsView';
import ViewNavigation from '../src/components/ViewNavigation';

afterEach(cleanup);

it('renders settings panel with theme options, pwa install and admin trigger', () => {
  const onAdminToggle = vi.fn();
  render(
    <SettingsView
      adminSession={null}
      onAdminToggle={onAdminToggle}
    />
  );

  expect(screen.getByRole('heading', { level: 2, name: 'Ustawienia' })).toBeTruthy();
  expect(screen.getByRole('heading', { level: 3, name: 'Wygląd i motyw' })).toBeTruthy();
  expect(screen.getByRole('heading', { level: 3, name: 'Aplikacja na telefon' })).toBeTruthy();
  expect(screen.getByRole('heading', { level: 3, name: 'Tryb administratora' })).toBeTruthy();

  // Test admin login trigger
  const adminBtn = screen.getByRole('button', { name: 'Administrator' });
  expect(adminBtn).toBeTruthy();
  fireEvent.click(adminBtn);
  expect(onAdminToggle).toHaveBeenCalledTimes(1);
});

it('shows active admin tools and logout button when admin session is active', () => {
  const onAdminToggle = vi.fn();
  const onOpenAdminModal = vi.fn();
  render(
    <SettingsView
      adminSession={{ token: 'mock-token', expires_at: '2027-01-01' }}
      onAdminToggle={onAdminToggle}
      onOpenAdminModal={onOpenAdminModal}
    />
  );

  expect(screen.getByText('Tryb administratora aktywny')).toBeTruthy();
  const logoutBtn = screen.getByRole('button', { name: 'Wyłącz tryb administratora' });
  fireEvent.click(logoutBtn);
  expect(onAdminToggle).toHaveBeenCalledTimes(1);

  // Shortcut buttons
  const addMassBtn = screen.getByRole('button', { name: 'Dodaj Mszę' });
  fireEvent.click(addMassBtn);
  expect(onOpenAdminModal).toHaveBeenCalledWith('add');
});

it('allows navigating to settings view via ViewNavigation', () => {
  const onChange = vi.fn();
  render(<ViewNavigation view="schedule" onChange={onChange} onPreload={() => {}} />);

  const trigger = screen.getByRole('button', { name: 'Widok: Grafik. Wybierz widok' });
  fireEvent.click(trigger);

  const settingsBtn = screen.getByRole('button', { name: 'Ustawienia' });
  expect(settingsBtn).toBeTruthy();
  fireEvent.click(settingsBtn);
  expect(onChange).toHaveBeenCalledWith('settings');
});
