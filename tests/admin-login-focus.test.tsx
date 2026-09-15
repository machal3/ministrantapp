import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AdminLoginModal from '../src/components/AdminLoginModal';
import { loginAdmin } from '../src/lib/admin';

vi.mock('../src/lib/admin', () => ({ loginAdmin: vi.fn() }));

beforeEach(() => {
  vi.mocked(loginAdmin).mockReset();
  // Model the native dialog's default focus on its first button.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
    this.querySelector('button')?.focus();
  };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

it('focuses the PIN after opening and each time the login dialog is reopened', () => {
  const first = render(<AdminLoginModal onClose={vi.fn()} onLogin={vi.fn()} />);
  expect(document.activeElement).toBe(screen.getByLabelText('PIN administratora'));
  first.unmount();
  render(<AdminLoginModal onClose={vi.fn()} onLogin={vi.fn()} />);
  expect(document.activeElement).toBe(screen.getByLabelText('PIN administratora'));
});

it('keeps the PIN focused and enabled during requests and after repeated failures', async () => {
  const onLogin = vi.fn();
  render(<AdminLoginModal onClose={vi.fn()} onLogin={onLogin} />);
  const input = screen.getByLabelText('PIN administratora') as HTMLInputElement;
  for (let attempt = 0; attempt < 2; attempt++) {
    let reject!: (error: Error) => void;
    vi.mocked(loginAdmin).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    fireEvent.change(input, { target: { value: '0000' } });
    const submit = screen.getByRole('button', { name: 'Odblokuj' });
    submit.focus();
    fireEvent.click(submit);
    expect(document.activeElement).toBe(input);
    expect(input.disabled).toBe(false);
    fireEvent.change(input, { target: { value: '1234' } });
    expect(input.value).toBe('0000');
    reject(new Error('Nieprawidłowy PIN.'));
    await waitFor(() => expect(input.value).toBe(''));
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole('alert').textContent).toBe('Nieprawidłowy PIN.');
  }
  expect(loginAdmin).toHaveBeenCalledTimes(2);
  expect(onLogin).not.toHaveBeenCalled();
});
