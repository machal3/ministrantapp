import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ThemeSelector from '../src/components/ThemeSelector';

let media: MediaQueryList;
let change: (() => void) | undefined;
beforeEach(() => {
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  media = { matches: false, addEventListener: vi.fn((_event, listener) => { change = listener; }), removeEventListener: vi.fn() } as unknown as MediaQueryList;
  vi.stubGlobal('matchMedia', vi.fn(() => media));
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); document.documentElement.removeAttribute('data-theme'); document.documentElement.style.colorScheme = ''; });

it('follows the device live, allows overriding it, and restores a saved preference', () => {
  const view = render(<ThemeSelector />);
  expect(document.documentElement.dataset.theme).toBe('light');
  act(() => { Object.assign(media, { matches: true }); change?.(); });
  expect(document.documentElement.dataset.theme).toBe('dark');
  fireEvent.click(screen.getByRole('button', { name: /Wygląd:/ }));
  fireEvent.click(screen.getByRole('button', { name: /Jasny Jasne/ }));
  expect(document.documentElement.dataset.theme).toBe('light');
  act(() => change?.());
  expect(document.documentElement.dataset.theme).toBe('light');
  fireEvent.click(screen.getByRole('button', { name: /Ciemny Głębokie/ }));
  expect(document.documentElement.style.colorScheme).toBe('dark');
  expect(localStorage.getItem('liturgy.theme')).toBe('dark');
  view.unmount();
  Object.assign(media, { matches: false });
  render(<ThemeSelector />);
  expect(document.documentElement.dataset.theme).toBe('dark');
  fireEvent.click(screen.getByRole('button', { name: /Wygląd:/ }));
  fireEvent.click(screen.getByRole('button', { name: /Zgodny z urządzeniem Automatycznie/ }));
  expect(document.documentElement.dataset.theme).toBe('light');
});

it('keeps switching usable when storage is blocked', () => {
  const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  render(<ThemeSelector />);
  fireEvent.click(screen.getByRole('button', { name: /Wygląd:/ }));
  fireEvent.click(screen.getByRole('button', { name: /Ciemny Głębokie/ }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(screen.getByRole('status').textContent).toContain('nie pozwala go zapamiętać');
  blocked.mockRestore();
});
