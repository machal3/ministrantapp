import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import UserSelector from '../src/components/UserSelector';

afterEach(() => { cleanup(); localStorage.clear(); document.documentElement.removeAttribute('data-accent'); });

it('changes and remembers the accent from the appearance panel without changing identity or mode', () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  localStorage.setItem('liturgy.theme', 'dark');
  let selected = 'jan';
  const props = { servers: [{ id: 'jan', name: 'Jan Testowy', rank: 'Lektor' as const }], selectedId: 'jan', onChange: (id: string) => { selected = id; }, adminSession: null, onAdminToggle: () => {} };
  const view = render(<UserSelector {...props} />);
  fireEvent.click(screen.getByRole('button', { name: /Wygląd:/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Lawenda' }));
  expect(document.documentElement.dataset.accent).toBe('purple');
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(screen.getByRole('button', { name: 'Lawenda' }).getAttribute('aria-pressed')).toBe('true');
  expect(localStorage.getItem('liturgy.accent')).toBe('purple');
  expect(selected).toBe('jan');
  view.unmount();
  render(<UserSelector {...props} />);
  expect(document.documentElement.dataset.accent).toBe('purple');
  act(() => {
    localStorage.setItem('liturgy.accent', 'blue');
    window.dispatchEvent(new StorageEvent('storage', { key: 'liturgy.accent' }));
  });
  expect(document.documentElement.dataset.accent).toBe('blue');
});
