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

  const header = (key: SortKey, label: string) => (
    <th
      className="num"
      data-active={sort === key}
      onClick={() => setSort(key)}
      role="button"
    >
      {label}
      {sort === key ? " ▼" : ""}
    </th>
  );

  return (
    <>
      <div className="controls">
        <span className="ctrl-label">Min. games</span>
        {MIN_OPTIONS.map((m) => (
          <button
            key={m}
            className="chip role-chip"
            data-active={m === minGames}
            onClick={() => setMinGames(m)}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="board-wrap">
        <table className="board">
          <thead>
            <tr>
              <th>Champion</th>
              {header("games", "Games")}
              {header("win_rate", "Win %")}
              {header("kda", "KDA")}
              <th className="num">Players</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.champion}>
                <td className="champ-cell">
                  <span
                    className="champ-icon sm"
                    style={{ backgroundImage: `url(${championSquare(c.champion)})` }}
                    aria-hidden="true"
                  />
                  <span className="player">{c.champion}</span>
                </td>
                <td className="num">{c.games}</td>
                <td className="num val">{(c.win_rate * 100).toFixed(1)}%</td>
                <td className="num">{c.kda.toFixed(2)}</td>
                <td className="num games">{c.n_players}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="empty">No champions above {minGames} games yet.</p>}
    </>
  );
}
