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
      <section className="hero">
        <p className="eyebrow">The all-time record book</p>
        <h1>Hall of Records</h1>
        <p className="subtitle">
          The headline marks of international League of Legends — the very best on the
          game&apos;s biggest stages.
        </p>
      </section>
      <div className="divider">
        <span className="hex-node" aria-hidden="true" />
      </div>

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
    </>
  );
}
