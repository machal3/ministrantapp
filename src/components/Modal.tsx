import { useId, useLayoutEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { X } from 'lucide-react';

interface Props { title: string; children: ReactNode; onClose: () => void; busy?: boolean; className?: string; initialFocusRef?: RefObject<HTMLElement | null>; dismissible?: boolean }

export default function Modal({ title, children, onClose, busy = false, className = '', initialFocusRef, dismissible = true }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useLayoutEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    // Focus after opening, in the same commit as the user's opening gesture.
    initialFocusRef?.current?.focus();
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      previousFocus?.focus();
    };
  }, [initialFocusRef]);
  const handleDialogClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (busy || !dismissible) return;
    const dialog = ref.current;
    if (!dialog || event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const isInDialog = (
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width
      );
      if (isInDialog) return;
    }
    onClose();
  };

  return <dialog ref={ref} className={`modal ${className}`} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy && dismissible) onClose(); }}
    onClick={handleDialogClick}>
    <div className="modal-content" onClick={event => event.stopPropagation()}>
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        {dismissible && <button type="button" className="icon-button" aria-label="Zamknij okno" onClick={onClose} disabled={busy}><X size={20} /></button>}
      </div>
      {children}
    </div>
  </dialog>;
}
