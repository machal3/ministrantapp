import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mediaMatches = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  const navStandalone = Boolean((window.navigator as unknown as { standalone?: boolean })?.standalone);
  const referrerApp = Boolean(typeof document !== 'undefined' && document.referrer?.includes('android-app://'));
  return mediaMatches || navStandalone || referrerApp;
}

export function isIosSafari(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  const isIos = /iphone|ipad|ipod/i.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  const isSafari = /safari/i.test(ua) && !/chrome|crios|crmo|android/i.test(ua);
  return isIos && isSafari;
}

export function usePwaInstall() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [ios, setIos] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    if (isIosSafari()) {
      setIos(true);
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const canInstall = !installed && (Boolean(promptEvent) || ios);

  const promptInstall = async () => {
    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice.outcome === 'accepted') {
          setInstalled(true);
          setPromptEvent(null);
        }
      } catch {
        // user dismissed or browser cancelled
      }
      return;
    }

    if (ios) {
      setShowIosGuide(true);
    }
  };

  const closeIosGuide = () => setShowIosGuide(false);

  return {
    installed,
    ios,
    canInstall,
    promptInstall,
    showIosGuide,
    closeIosGuide,
  };
}
