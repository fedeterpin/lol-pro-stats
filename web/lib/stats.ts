// Catalog of leaderboards/records: how each one is shown and formatted.
export interface StatDef {
  key: string;
  label: string;
  short: string;
  kind: "ratio" | "count" | "percent";
  help: string;
  roleScoped?: boolean; // has per-role variants (scope = role:Top, …)
}

export const STAT_CATALOG: StatDef[] = [
  { key: "career_kda", label: "Best career KDA", short: "KDA", kind: "ratio",
    help: "(Kills + Assists) / Deaths, from career totals. Minimum 200 games.",
    roleScoped: true },
  { key: "career_kda_intl", label: "Best KDA at internationals", short: "KDA · intl", kind: "ratio",
    help: "Career KDA counting only Worlds / MSI / First Stand games. Minimum 30 games." },
  { key: "intl_titles", label: "Most international titles", short: "Titles", kind: "count",
    help: "Worlds + MSI + First Stand won while on the roster with at least one game played." },
  { key: "worlds_titles", label: "Most Worlds titles", short: "Worlds", kind: "count",
    help: "World Championships won on the winning roster." },
  { key: "msi_titles", label: "Most MSI titles", short: "MSI", kind: "count",
    help: "Mid-Season Invitationals won on the winning roster." },
  { key: "worlds_appearances", label: "Most Worlds appearances", short: "Worlds apps", kind: "count",
    help: "Distinct years with at least one Worlds main-event game." },
  { key: "games_played", label: "Most games played", short: "Games", kind: "count",
    help: "Total official games played — the longevity record.", roleScoped: true },
  { key: "career_kills", label: "Most career kills", short: "Kills", kind: "count",
    help: "Total kills across an entire career.", roleScoped: true },
  { key: "win_rate", label: "Best win rate", short: "Win %", kind: "percent",
    help: "Wins / games. Minimum 200 games.", roleScoped: true },
];

export const STAT_BY_KEY: Record<string, StatDef> = Object.fromEntries(
  STAT_CATALOG.map((s) => [s.key, s]),
);

export const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"] as const;

export function scopeLabel(scope: string): string {
  if (scope === "all") return "All roles";
  return scope.replace(/^role:/, "");
}

export function formatValue(kind: StatDef["kind"], value: number): string {
  if (value == null) return "—";
  if (kind === "ratio") return value.toFixed(2);
  if (kind === "percent") return `${(value * 100).toFixed(1)}%`;
  return Math.round(value).toLocaleString("en");
}
