import { getRecords } from "@/lib/db";
import { STAT_BY_KEY, formatValue, type StatDef } from "@/lib/stats";

export default function Home() {
  const records = getRecords();

  return (
    <>
      <h1>Libro de récords</h1>
      <p className="subtitle">
        Los registros históricos del League of Legends profesional — como un almanaque deportivo.
      </p>

      {records.length === 0 ? (
        <p className="help">
          Todavía no hay datos cargados. Corré el ETL (<code>python -m etl.run</code>) y
          reconstruí el sitio.
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
              <div className="record-card" key={rec.record_key}>
                <div className="label">{rec.label}</div>
                <div className="holder">{rec.display_id}</div>
                <div className="value">{formatValue(kind, rec.value)}</div>
                {games != null && <div className="meta">{games} partidas</div>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
