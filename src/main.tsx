import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Update installed copies to the offline-only worker, including older versions.
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
}
try { localStorage.removeItem('liturgy.push-device'); } catch { /* Storage may be disabled. */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
