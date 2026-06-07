'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Locale, AppTranslations, TRANSLATIONS } from '@/lib/translations';

const STORAGE_KEY = 'nova_locale';

interface LanguageContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: AppTranslations;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (stored && stored in TRANSLATIONS) setLocaleState(stored);
    } catch { /* storage unavailable */ }
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* storage unavailable */ }
  }, []);

  const t = TRANSLATIONS[locale];

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}
