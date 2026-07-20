"use client";

import { useMemo, useState } from "react";
import type { ChampionStatRow } from "@/lib/db";
import { championSquare } from "@/lib/champion";
import { useI18n } from "@/lib/i18n";
import { formatValue } from "@/lib/stats";

type SortKey = "games" | "win_rate" | "kda";
const MIN_OPTIONS = [1, 20, 50, 100];

export default function ChampionTable({ champions }: { champions: ChampionStatRow[] }) {
  const { t, locale } = useI18n();
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
        <span className="ctrl-label">{t("champions.minGames")}</span>
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
              <th>{t("champions.champion")}</th>
              {header("games", t("common.games"))}
              {header("win_rate", t("common.winRate"))}
              {header("kda", t("common.kda"))}
              <th className="num">{t("champions.players")}</th>
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
                <td className="num">{c.games.toLocaleString(locale)}</td>
                <td className="num val">
                  {formatValue("percent", c.win_rate, locale)}
                </td>
                <td className="num">{formatValue("ratio", c.kda, locale)}</td>
                <td className="num games">{c.n_players}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <p className="empty">{t("champions.empty", { n: minGames })}</p>
      )}
    </>
  );
}
