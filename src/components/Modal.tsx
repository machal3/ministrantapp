import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props { title: string; children: ReactNode; onClose: () => void; busy?: boolean }

export default function Modal({ title, children, onClose, busy = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
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
  }, []);
  return <dialog ref={ref} className="modal" aria-labelledby="modal-title"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="modal-content" onClick={event => event.stopPropagation()}>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 id="modal-title">{title}</h2>
        <button type="button" className="icon-button" aria-label="Zamknij okno" onClick={onClose} disabled={busy}><X size={20} /></button>
      </div>
      {children}
    </div>
  </dialog>;
}
