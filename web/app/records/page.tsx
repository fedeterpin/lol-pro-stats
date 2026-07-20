import Link from "next/link";
import type { Metadata } from "next";
import { getRecords } from "@/lib/db";
import { STAT_BY_KEY, formatValue, type StatDef } from "@/lib/stats";

export const metadata: Metadata = {
  title: "Hall of Records — LoL Pro Stats",
  description:
    "The all-time record book of professional League of Legends: single-game and career headline records.",
};

export default function RecordsPage() {
  const records = getRecords();

  return (
    <>
      <section className="page-head">
        <p className="kicker">The all-time record book</p>
        <h1 className="page-title gold-text">Hall of Records</h1>
        <div className="divider" aria-hidden="true">
          <span className="diamond" />
        </div>
        <p className="page-sub">
          The headline marks of international League of Legends — the very best on
          the game&apos;s biggest stages.
        </p>
      </section>

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
            const featured = statKey === "legacy_score";
            let games: number | null = null;
            try {
              games = JSON.parse(rec.context ?? "{}")?.games ?? null;
            } catch {
              /* noop */
            }
            return (
              <article
                className={`cutp record-card${featured ? " featured" : " cut14"}`}
                key={rec.record_key}
              >
                <div className="cutp-in">
                  <span className="rec-label">{def?.label ?? rec.label}</span>
                  <div className="rec-holder">
                    {rec.slug ? (
                      <Link href={`/players/${rec.slug}`}>{rec.display_id}</Link>
                    ) : (
                      rec.display_id
                    )}
                  </div>
                  <div className="rec-value gold-text">
                    {formatValue(kind, rec.value)}
                  </div>
                  {games != null && <div className="rec-meta">{games} games</div>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
