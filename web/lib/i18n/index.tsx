"use client";

// Client-side i18n for a statically exported site.
//
// `output: "export"` means there is no server runtime to negotiate
// Accept-Language, so every page is built once in DEFAULT_LOCALE and the
// translation is applied in the browser. The provider therefore *must* start on
// DEFAULT_LOCALE and only switch inside an effect — reading navigator or
// localStorage during render would produce markup that doesn't match the
// prerendered HTML.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  LOCALES,
  MESSAGES,
  type Locale,
  type MsgKey,
} from "./messages";
import { formatValue, type StatDef } from "@/lib/stats";

const STORAGE_KEY = "lps.locale";

export type Vars = Record<string, string | number>;

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MsgKey, vars?: Vars) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

// Explicit choice wins over the browser; browser wins over the default.
function detectLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* storage can be blocked (private mode, cookie settings) */
  }
  const tags = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  for (const tag of tags) {
    // "es-AR" → "es"; region is irrelevant, we only ship one Spanish.
    const base = tag?.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => setLocaleState(detectLocale()), []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* not persisting is survivable; the session still switches */
    }
  }, []);

  const value = useMemo<I18nValue>(() => {
    const dict = MESSAGES[locale];
    return {
      locale,
      setLocale,
      t: (key, vars) => {
        const raw = dict[key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key;
        if (!vars) return raw;
        return raw.replace(/\{(\w+)\}/g, (match, name: string) => {
          const v = vars[name];
          if (v == null) return match;
          return typeof v === "number" ? v.toLocaleString(locale) : v;
        });
      },
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <LocaleProvider>");
  return ctx;
}

/**
 * Translated text usable from server components — they can't call hooks, but
 * they can render this client component in place of a literal string.
 */
export function T({ k, vars }: { k: MsgKey; vars?: Vars }) {
  const { t } = useI18n();
  return <>{t(k, vars)}</>;
}

/** A bare number formatted with the active locale's separators. */
export function Num({ value }: { value: number }) {
  const { locale } = useI18n();
  return <>{value.toLocaleString(locale)}</>;
}

/** A leaderboard/record value (ratio, percent or count) in the active locale. */
export function StatValue({
  kind,
  value,
}: {
  kind: StatDef["kind"];
  value: number;
}) {
  const { locale } = useI18n();
  return <>{formatValue(kind, value, locale)}</>;
}

/** "All roles" or the role name — roles themselves are not translated. */
export function ScopeLabel({ scope }: { scope: string }) {
  const { t } = useI18n();
  return <>{scope === "all" ? t("scope.all") : scope.replace(/^role:/, "")}</>;
}
