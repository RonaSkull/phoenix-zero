'use client';

import { useCallback, useEffect, useState } from 'react';

type Mode = 'standard' | 'advanced';

const STORAGE_KEY = 'phoenix-zero:mode';
const EVENT_NAME = 'phoenix-zero:mode-change';

function parseMode(v: unknown): Mode {
  return v === 'advanced' ? 'advanced' : 'standard';
}

export function useAdvancedMode(): { advanced: boolean; setAdvanced: (v: boolean) => void } {
  const [advanced, setAdvancedState] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setAdvancedState(parseMode(raw) === 'advanced');
    } catch {
    }

    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      setAdvancedState(parseMode(e.newValue) === 'advanced');
    }

    function onCustom(ev: Event) {
      const e = ev as CustomEvent<{ mode?: Mode }>;
      const next = parseMode(e.detail?.mode);
      setAdvancedState(next === 'advanced');
    }

    window.addEventListener('storage', onStorage);
    window.addEventListener(EVENT_NAME, onCustom);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(EVENT_NAME, onCustom);
    };
  }, []);

  const setAdvanced = useCallback((v: boolean) => {
    setAdvancedState(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? 'advanced' : 'standard');
    } catch {
    }

    try {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { mode: v ? 'advanced' : 'standard' } }));
    } catch {
    }
  }, []);

  return { advanced, setAdvanced };
}
