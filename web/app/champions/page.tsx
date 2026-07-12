import { getChampionStats } from "@/lib/db";
import ChampionTable from "@/components/ChampionTable";

export default function ChampionsPage() {
  const champions = getChampionStats(1, 300);
  return (
    <>
      <section className="hero">
        <p className="eyebrow">The pick &amp; ban stage</p>
        <h1>Champions</h1>
        <p className="subtitle">
          Every champion on the international stage — most picked, best win rate and
          KDA. Sort the table or raise the minimum games.
        </p>
      </section>
      <div className="divider">
        <span className="hex-node" aria-hidden="true" />
      </div>
      <ChampionTable champions={champions} />
    </>
  );
}
