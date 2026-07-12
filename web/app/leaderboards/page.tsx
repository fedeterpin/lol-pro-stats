import { getLeaderboard, type LeaderboardRow } from "@/lib/db";
import { STAT_CATALOG } from "@/lib/stats";
import LeaderboardExplorer from "@/components/LeaderboardExplorer";

export default function LeaderboardsPage() {
  const boards: Record<string, LeaderboardRow[]> = Object.fromEntries(
    STAT_CATALOG.map((s) => [s.key, getLeaderboard(s.key, "all", 100)]),
  );
  return (
    <>
      <h1>Rankings</h1>
      <p className="subtitle">Elegí una métrica; hacé click en las columnas para ordenar.</p>
      <LeaderboardExplorer boards={boards} catalog={STAT_CATALOG} />
    </>
  );
}
