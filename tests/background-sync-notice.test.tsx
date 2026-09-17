import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import BackgroundSyncNotice from '../src/components/BackgroundSyncNotice';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('ignores short disconnects and starts a fresh grace period after reconnecting', () => {
  const retry = vi.fn();
  const view = render(<BackgroundSyncNotice offline onRetry={retry} />);
  act(() => vi.advanceTimersByTime(7000));
  expect(screen.queryByRole('status')).toBeNull();
  view.rerender(<BackgroundSyncNotice onRetry={retry} />);
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.queryByRole('status')).toBeNull();
  view.rerender(<BackgroundSyncNotice offline onRetry={retry} />);
  act(() => vi.advanceTimersByTime(7999));
  expect(screen.queryByRole('status')).toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole('status')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Ponów' }));
  expect(retry).toHaveBeenCalledTimes(1);
  view.rerender(<BackgroundSyncNotice onRetry={retry} />);
  expect(screen.queryByRole('status')).toBeNull();
});

it('avoids flashing a loader on quick updates and clears it on completion', () => {
  const retry = vi.fn();
  const view = render(<BackgroundSyncNotice loading onRetry={retry} />);
  act(() => vi.advanceTimersByTime(1000));
  view.rerender(<BackgroundSyncNotice onRetry={retry} />);
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByRole('status')).toBeNull();
  view.rerender(<BackgroundSyncNotice loading onRetry={retry} />);
  act(() => vi.advanceTimersByTime(1500));
  expect(screen.getByText('Aktualizowanie…')).toBeTruthy();
  view.rerender(<BackgroundSyncNotice onRetry={retry} />);
  expect(screen.queryByRole('status')).toBeNull();
});

it('keeps a stale-data warning during retries and clears it after recovery', () => {
  const retry = vi.fn();
  const view = render(<BackgroundSyncNotice error="Offline" onRetry={retry} />);
  expect(screen.getByText('Wyświetlane dane mogą być nieaktualne.')).toBeTruthy();
  view.rerender(<BackgroundSyncNotice error="Offline" loading onRetry={retry} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ponów' }));
  expect(retry).not.toHaveBeenCalled();
  view.rerender(<BackgroundSyncNotice onRetry={retry} />);
  expect(screen.queryByRole('status')).toBeNull();
});
