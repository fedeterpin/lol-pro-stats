import Link from "next/link";
import { getRecords, listPlayers } from "@/lib/db";
import { STAT_BY_KEY, formatValue, type StatDef } from "@/lib/stats";
import HomeSearch, { type SearchPlayer } from "@/components/HomeSearch";

export default function Home() {
  const players: SearchPlayer[] = listPlayers(2000).map((p) => ({
    player_id: p.player_id,
    display_id: p.display_id,
    name: p.name,
    team: p.team,
    slug: p.slug,
    role: p.role,
    image_url: p.image_url,
    score: p.score,
  }));
  const records = getRecords();

  return (
    <>
      <section className="home-hero">
        <p className="eyebrow">League of Legends · Esports almanac</p>
        <h1>Every pro, every record</h1>
        <p className="subtitle">
          Search any professional player to open their profile — legacy score, titles,
          KDA and champion pool. Or browse the all-time record book below.
        </p>
        <HomeSearch players={players} />
        <div className="home-links">
          <Link href="/leaderboards">Leaderboards</Link>
          <Link href="/players">All players</Link>
          <Link href="/champions">Champions</Link>
        </div>
      </section>

      <section className="records-section" id="records">
        <h2 className="section-title">
          <span className="hex-node" aria-hidden="true" />
          Hall of Records
        </h2>
        {records.length === 0 ? (
          <p className="empty">
            No data yet. The ETL is filling the hall of records — reload in a little
            while.
          </p>
        ) : (
          <div className="record-grid">
            {records.map((rec) => {
              const statKey = rec.record_key.replace(/^most_/, "");
              const def: StatDef | undefined = STAT_BY_KEY[statKey];
              const kind = def?.kind ?? "count";
              let games: number | null = null;
              try {
                games = JSON.parse(rec.context ?? "{}")?.games ?? null;
              } catch {
                /* noop */
              }
              return (
                <article className="record-card" key={rec.record_key}>
                  <span className="label">{def?.label ?? rec.label}</span>
                  <div className="holder">
                    {rec.slug ? (
                      <Link href={`/players/${rec.slug}`} className="plink">
                        {rec.display_id}
                      </Link>
                    ) : (
                      rec.display_id
                    )}
                  </div>
                  <div className="value">{formatValue(kind, rec.value)}</div>
                  {games != null && <div className="meta">{games} games</div>}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
