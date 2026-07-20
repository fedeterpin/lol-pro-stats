"use client";

import { useMemo, useState } from "react";
import type { ChampionStatRow } from "@/lib/db";
import { championSquare } from "@/lib/champion";

type SortKey = "games" | "win_rate" | "kda";
const MIN_OPTIONS = [1, 20, 50, 100];

export default function ChampionTable({ champions }: { champions: ChampionStatRow[] }) {
  const [sort, setSort] = useState<SortKey>("games");
  const [minGames, setMinGames] = useState(20);

  const rows = useMemo(
    () =>
      champions
        .filter((c) => c.games >= minGames)
        .sort((a, b) => b[sort] - a[sort])
        .slice(0, 200),
    [champions, sort, minGames],
  );

  const header = (key: SortKey, label: string, extra = "") => (
    <button
      type="button"
      className={`th-btn th-num${extra}${sort === key ? " active" : ""}`}
      onClick={() => setSort(key)}
    >
      {label}
      {sort === key ? " ▼" : ""}
    </button>
  );

  return (
    <>
      <div className="controls">
        <span className="ctrl-label">Min. games</span>
        <div className="chips">
          {MIN_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              className={`chip${m === minGames ? " active" : ""}`}
              onClick={() => setMinGames(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="empty">No champions above {minGames} games yet.</p>
      ) : (
        <div className="tbl tbl-champs">
          <div className="tbl-head">
            <span className="th-lab">Champion</span>
            {header("games", "Games")}
            {header("win_rate", "Win %")}
            {header("kda", "KDA", " col-kda")}
            <span className="th-lab th-num col-players">Players</span>
          </div>
          {rows.map((c, i) => (
            <div className={`tbl-row${i === 0 ? " first" : ""}`} key={c.champion}>
              <span className="pcell">
                <span
                  className="champ-icon"
                  style={{ backgroundImage: `url(${championSquare(c.champion)})` }}
                  aria-hidden="true"
                />
                <span className="pname">{c.champion}</span>
              </span>
              <span className="cell-games cell-num">{c.games}</span>
              <span className="cell-score cell-num">
                {(c.win_rate * 100).toFixed(1)}%
              </span>
              <span className="cell-num col-kda">{c.kda.toFixed(2)}</span>
              <span className="cell-games cell-num col-players">{c.n_players}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
