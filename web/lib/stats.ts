// Catálogo de leaderboards/récords: define cómo se muestran y formatean.
export interface StatDef {
  key: string;
  label: string;
  short: string;
  kind: "ratio" | "count" | "percent";
  help: string;
}

export const STAT_CATALOG: StatDef[] = [
  { key: "career_kda", label: "Mejor KDA histórico", short: "KDA", kind: "ratio",
    help: "(Kills + Asistencias) / Muertes acumuladas. Mínimo 200 partidas." },
  { key: "intl_titles", label: "Más títulos internacionales", short: "Títulos int.", kind: "count",
    help: "Worlds + MSI + First Stand ganados estando en el roster con ≥1 partida." },
  { key: "worlds_titles", label: "Más títulos de Worlds", short: "Worlds", kind: "count",
    help: "Campeonatos del Mundo ganados en el roster ganador." },
  { key: "games_played", label: "Más partidas jugadas", short: "Partidas", kind: "count",
    help: "Total de partidas oficiales disputadas (récord de longevidad)." },
  { key: "career_kills", label: "Más kills de carrera", short: "Kills", kind: "count",
    help: "Total de asesinatos en toda la carrera." },
  { key: "win_rate", label: "Mejor win rate", short: "Win %", kind: "percent",
    help: "Victorias / partidas. Mínimo 200 partidas." },
];

export const STAT_BY_KEY: Record<string, StatDef> = Object.fromEntries(
  STAT_CATALOG.map((s) => [s.key, s]),
);

export function formatValue(kind: StatDef["kind"], value: number): string {
  if (value == null) return "—";
  if (kind === "ratio") return value.toFixed(2);
  if (kind === "percent") return `${(value * 100).toFixed(1)}%`;
  return Math.round(value).toLocaleString("es");
}
