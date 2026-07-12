import { getLeaderboard, type LeaderboardRow } from "@/lib/db";
import { STAT_CATALOG, ROLES } from "@/lib/stats";
import LeaderboardExplorer from "@/components/LeaderboardExplorer";

export type Boards = Record<string, Record<string, LeaderboardRow[]>>;

export default function LeaderboardsPage() {
  const boards: Boards = {};
  for (const s of STAT_CATALOG) {
    boards[s.key] = { all: getLeaderboard(s.key, "all", 100) };
    if (s.roleScoped) {
      for (const r of ROLES) {
        boards[s.key][`role:${r}`] = getLeaderboard(s.key, `role:${r}`, 100);
      }
    }
  }
  return (
    <>
      <section className="hero">
        <p className="eyebrow">The main stage, ranked</p>
        <h1>Leaderboards</h1>
        <p className="subtitle">
          Pick a category, filter by role and sort the table. Every record shows its
          minimum-games threshold to keep it honest.
        </p>
      </section>
      <div className="divider">
        <span className="hex-node" aria-hidden="true" />
      </div>
      <LeaderboardExplorer boards={boards} catalog={STAT_CATALOG} />
    </>
  );
}
