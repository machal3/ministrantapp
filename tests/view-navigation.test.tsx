import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ViewNavigation from '../src/components/ViewNavigation';

afterEach(cleanup);

it('changes the view and closes the dropdown with focus returned to its trigger', () => {
  const onChange = vi.fn();
  const { rerender } = render(<ViewNavigation view="schedule" onChange={onChange} onPreload={() => {}} />);
  const trigger = screen.getByRole('button', { name: 'Widok: Grafik. Wybierz widok' });
  fireEvent.click(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Moje służby' }));
  expect(onChange).toHaveBeenCalledWith('services');
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(trigger);
  rerender(<ViewNavigation view="services" onChange={onChange} onPreload={() => {}} />);
  expect(screen.getByRole('button', { name: 'Moje służby' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('button', { name: 'Widok: Moje służby. Wybierz widok' })).toBeTruthy();
});

it('dismisses the dropdown with Escape, an outside click or focus leaving navigation', () => {
  render(<ViewNavigation view="schedule" onChange={() => {}} onPreload={() => {}} />);
  const trigger = screen.getByRole('button', { name: 'Widok: Grafik. Wybierz widok' });
  fireEvent.click(trigger);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  fireEvent.pointerDown(document.body);
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(trigger);
  fireEvent.blur(trigger, { relatedTarget: document.body });
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});

it('renders view options and dismisses when tapping backdrop', () => {
  const { container } = render(<ViewNavigation view="schedule" onChange={() => {}} onPreload={() => {}} />);
  const trigger = screen.getByRole('button', { name: 'Widok: Grafik. Wybierz widok' });
  fireEvent.click(trigger);
  expect(screen.getByRole('button', { name: 'Grafik' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Moje służby' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Rywalizacja' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Ustawienia' })).toBeTruthy();

  const backdrop = container.querySelector('.view-navigation-backdrop')!;
  expect(backdrop).toBeTruthy();
  fireEvent.pointerDown(backdrop);
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});
