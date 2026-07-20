import { getChampionStats } from "@/lib/db";
import ChampionTable from "@/components/ChampionTable";

export default function ChampionsPage() {
  const champions = getChampionStats(1, 300);
  return (
    <>
      <section className="page-head">
        <p className="kicker">The pick &amp; ban stage</p>
        <h1 className="page-title gold-text">Champions</h1>
        <div className="divider" aria-hidden="true">
          <span className="diamond" />
        </div>
        <p className="page-sub">
          Every champion on the international stage — most picked, best win rate and
          KDA. Sort the table or raise the minimum games.
        </p>
      </section>
      <ChampionTable champions={champions} />
    </>
  );
}
