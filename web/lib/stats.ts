// Catalog of leaderboards/records: how each one is shown and formatted.
// The human-readable copy (label, short header, help text) lives in
// lib/i18n/messages.ts under `stat.<key>.*` so it can be translated; this file
// only keeps what is structural.
import { DEFAULT_LOCALE, type Locale, type MsgKey } from "@/lib/i18n/messages";

export interface StatDef {
  key: string;
  kind: "ratio" | "count" | "percent";
  roleScoped?: boolean; // has per-role variants (scope = role:Top, …)
}

export const STAT_CATALOG: StatDef[] = [
  { key: "legacy_score", kind: "count" },
  { key: "career_kda", kind: "ratio", roleScoped: true },
  { key: "career_kda_intl", kind: "ratio" },
  { key: "intl_titles", kind: "count" },
  { key: "worlds_titles", kind: "count" },
  { key: "msi_titles", kind: "count" },
  { key: "worlds_appearances", kind: "count" },
  { key: "games_played", kind: "count", roleScoped: true },
  { key: "career_kills", kind: "count", roleScoped: true },
  { key: "win_rate", kind: "percent", roleScoped: true },
];

export const STAT_BY_KEY: Record<string, StatDef> = Object.fromEntries(
  STAT_CATALOG.map((s) => [s.key, s]),
);

// Stat keys are data-driven (they come from the gold tables), so message keys
// are built at runtime; every catalog entry has all three in messages.ts.
export const statLabelKey = (key: string) => `stat.${key}.label` as MsgKey;
export const statShortKey = (key: string) => `stat.${key}.short` as MsgKey;
export const statHelpKey = (key: string) => `stat.${key}.help` as MsgKey;

export const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"] as const;

export function formatValue(
  kind: StatDef["kind"],
  value: number,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (value == null) return "—";
  if (kind === "ratio")
    return value.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  if (kind === "percent")
    return `${(value * 100).toLocaleString(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}%`;
  return Math.round(value).toLocaleString(locale);
}
