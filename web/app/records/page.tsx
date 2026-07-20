import Link from "next/link";
import type { Metadata } from "next";
import { getRecords } from "@/lib/db";
import { STAT_BY_KEY, statLabelKey, type StatDef } from "@/lib/stats";
import { T, StatValue } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Hall of Records — LoL Pro Stats",
  description:
    "The all-time record book of professional League of Legends: single-game and career headline records.",
};

export default function RecordsPage() {
  const records = getRecords();

  return (
    <>
      <section className="hero">
        <p className="eyebrow">
          <T k="records.eyebrow" />
        </p>
        <h1>
          <T k="records.title" />
        </h1>
        <p className="subtitle">
          <T k="records.subtitle" />
        </p>
      </section>
      <div className="divider">
        <span className="hex-node" aria-hidden="true" />
      </div>

      {records.length === 0 ? (
        <p className="empty">
          <T k="records.empty" />
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
                <span className="label">
                  {def ? <T k={statLabelKey(statKey)} /> : rec.label}
                </span>
                <div className="holder">
                  {rec.slug ? (
                    <Link href={`/players/${rec.slug}`} className="plink">
                      {rec.display_id}
                    </Link>
                  ) : (
                    rec.display_id
                  )}
                </div>
                <div className="value">
                  <StatValue kind={kind} value={rec.value} />
                </div>
                {games != null && (
                  <div className="meta">
                    <T k="common.gamesCount" vars={{ n: games }} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
