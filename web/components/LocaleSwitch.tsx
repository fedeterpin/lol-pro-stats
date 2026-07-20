"use client";

import { useI18n } from "@/lib/i18n";
import { LOCALES, LOCALE_NAMES } from "@/lib/i18n/messages";

// Segmented EN/ES control in the header. The browser language decides the first
// visit; clicking here pins the choice for every visit after it.
export default function LocaleSwitch() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="lang-switch" role="group" aria-label={t("locale.label")}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          className="lang-opt"
          data-active={l === locale}
          aria-pressed={l === locale}
          title={LOCALE_NAMES[l]}
          onClick={() => setLocale(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
