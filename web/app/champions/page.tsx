import { getChampionStats } from "@/lib/db";
import { T } from "@/lib/i18n";
import ChampionTable from "@/components/ChampionTable";

export default function ChampionsPage() {
  const champions = getChampionStats(1, 300);
  return (
    <>
      <section className="hero">
        <p className="eyebrow">
          <T k="champions.eyebrow" />
        </p>
        <h1>
          <T k="champions.title" />
        </h1>
        <p className="subtitle">
          <T k="champions.subtitle" />
        </p>
      </section>
      <div className="divider">
        <span className="hex-node" aria-hidden="true" />
      </div>
      <ChampionTable champions={champions} />
    </>
  );
}
