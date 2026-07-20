"use client";

import { useState } from "react";
import Link from "next/link";
import type { LeaderboardRow } from "@/lib/db";
import {
  formatValue,
  statHelpKey,
  statLabelKey,
  statShortKey,
  ROLES,
  type StatDef,
} from "@/lib/stats";
import { useI18n } from "@/lib/i18n";
import type { MsgKey } from "@/lib/i18n/messages";

const RANK_WORDS: MsgKey[] = ["podium.first", "podium.second", "podium.third"];
// Role names are not translated (scene convention); only shortened.
const ROLE_SHORT: Record<string, string> = {
  all: "All",
  Top: "Top",
  Jungle: "Jng",
  Mid: "Mid",
  Bot: "ADC",
  Support: "Sup",
};

type SortCol = "rank" | "value" | "games";
interface SortState {
  col: SortCol;
  desc: boolean;
}

const DEFAULT_SORT: SortState = { col: "rank", desc: false };
const COLLAPSED_ROWS = 17; // ranks 4–20 while the table is collapsed

function Avatar({ row, size }: { row: LeaderboardRow; size: 30 | 56 | 68 }) {
  return (
    <span
      className={`avatar av-${size}`}
      style={row.image_url ? { backgroundImage: `url(${row.image_url})` } : undefined}
      aria-hidden="true"
    >
      {!row.image_url && (row.display_id?.[0] ?? "?")}
    </span>
  );
}

function PodiumCard({ row, def }: { row: LeaderboardRow; def: StatDef }) {
  const { t, locale } = useI18n();
  const pos = row.rank;
  const meta = [row.role, row.team].filter(Boolean).join(" · ");
  const body = (
    <span className="cutp-in">
      <span className="podium-rankword">{t(RANK_WORDS[pos - 1])}</span>
      <Avatar row={row} size={pos === 1 ? 68 : 56} />
      <span className="podium-name">{row.display_id}</span>
      {meta && <span className="podium-meta">{meta}</span>}
      <span className={`podium-score${pos === 1 ? " gold-text" : ""}`}>
        {formatValue(def.kind, row.value, locale)}
      </span>
      {pos === 1 && <span className="podium-unit">{t(statShortKey(def.key))}</span>}
    </span>
  );
  const cls = `cutp podium-card p${pos}${pos === 1 ? " featured" : ""}`;
  return row.slug ? (
    <Link href={`/players/${row.slug}`} className={cls}>
      {body}
    </Link>
  ) : (
    <span className={cls}>{body}</span>
  );
}

export default function LeaderboardExplorer({
  boards,
  catalog,
}: {
  boards: Record<string, Record<string, LeaderboardRow[]>>;
  catalog: StatDef[];
}) {
  const { t, locale } = useI18n();
  const [statKey, setStatKey] = useState(catalog[0]?.key ?? "");
  const [scope, setScope] = useState("all");
  const [expanded, setExpanded] = useState(false);
  // Sort direction persists per category.
  const [sortMap, setSortMap] = useState<Record<string, SortState>>({});

  const def = catalog.find((s) => s.key === statKey) ?? catalog[0];
  const effScope = def?.roleScoped ? scope : "all";
  const data = boards[statKey]?.[effScope] ?? [];
  const sort = sortMap[statKey] ?? DEFAULT_SORT;

  const podium = data.filter((r) => r.rank <= 3).sort((a, b) => a.rank - b.rank);
  const rest = data
    .filter((r) => r.rank > 3)
    .sort((a, b) => {
      const av = (a[sort.col] ?? -Infinity) as number;
      const bv = (b[sort.col] ?? -Infinity) as number;
      return sort.desc ? bv - av : av - bv;
    });
  const rows = expanded ? rest : rest.slice(0, COLLAPSED_ROWS);

  const toggleSort = (col: SortCol) => {
    setSortMap((m) => {
      const prev = m[statKey] ?? DEFAULT_SORT;
      const next: SortState =
        prev.col === col ? { col, desc: !prev.desc } : { col, desc: col !== "rank" };
      return { ...m, [statKey]: next };
    });
  };

  const arrow = (col: SortCol) => (sort.col === col ? (sort.desc ? " ▼" : " ▲") : "");

  const boardKey = `${statKey}:${effScope}`;

  return (
    <>
      {podium.length > 0 && (
        <div key={`podium-${boardKey}`} className="podium fade-swap">
          {[podium[1], podium[0], podium[2]]
            .filter((r): r is LeaderboardRow => Boolean(r))
            .map((r) => (
              <PodiumCard key={r.player_id} row={r} def={def} />
            ))}
        </div>
      )}

      <div className="lb-layout">
        <aside className="rail">
          <div className="rail-group categories">
            <p className="rail-label">{t("leaderboards.category")}</p>
            <div className="rail-items">
              {catalog.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={`rail-item${s.key === statKey ? " active" : ""}`}
                  onClick={() => {
                    setStatKey(s.key);
                    setExpanded(false);
                  }}
                >
                  {t(statLabelKey(s.key))}
                </button>
              ))}
            </div>
          </div>

          {def?.roleScoped && (
            <div className="rail-group">
              <p className="rail-label">{t("leaderboards.role")}</p>
              <div className="chips">
                {["all", ...ROLES].map((r) => {
                  const sc = r === "all" ? "all" : `role:${r}`;
                  return (
                    <button
                      key={r}
                      type="button"
                      className={`chip${sc === scope ? " active" : ""}`}
                      onClick={() => {
                        setScope(sc);
                        setExpanded(false);
                      }}
                    >
                      {ROLE_SHORT[r] ?? r}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {def && <p className="rail-note">{t(statHelpKey(def.key))}</p>}
        </aside>

        {data.length === 0 ? (
          <p className="empty">{t("leaderboards.empty")}</p>
        ) : (
          <div key={boardKey} className="tbl fade-swap">
            <div className="tbl-head">
              <button
                type="button"
                className={`th-btn${sort.col === "rank" ? " active" : ""}`}
                onClick={() => toggleSort("rank")}
              >
                #{arrow("rank")}
              </button>
              <span className="th-lab">{t("common.player")}</span>
              <span className="th-lab col-role">{t("common.role")}</span>
              <button
                type="button"
                className={`th-btn th-num${sort.col === "value" ? " active" : ""}`}
                onClick={() => toggleSort("value")}
              >
                {t(statShortKey(def.key))}
                {arrow("value")}
              </button>
              <button
                type="button"
                className={`th-btn th-num col-games${sort.col === "games" ? " active" : ""}`}
                onClick={() => toggleSort("games")}
              >
                {t("common.games")}
                {arrow("games")}
              </button>
            </div>

            {rows.map((r, i) => {
              const cells = (
                <>
                  <span className={`cell-rank${r.rank <= 10 ? " hot" : ""}`}>
                    {r.rank}
                  </span>
                  <span className="pcell">
                    <Avatar row={r} size={30} />
                    <span className="pcell-id">
                      <span className="pname">{r.display_id}</span>
                      {r.team && <span className="ptag">{r.team}</span>}
                    </span>
                  </span>
                  <span className="cell-role col-role">{r.role ?? "—"}</span>
                  <span className="cell-score cell-num">
                    {formatValue(def.kind, r.value, locale)}
                  </span>
                  <span className="cell-games cell-num col-games">{r.games ?? "—"}</span>
                </>
              );
              const cls = `tbl-row${i === 0 ? " first" : ""}`;
              return r.slug ? (
                <Link key={r.player_id} href={`/players/${r.slug}`} className={cls}>
                  {cells}
                </Link>
              ) : (
                <div key={r.player_id} className={cls}>
                  {cells}
                </div>
              );
            })}

            {rest.length > COLLAPSED_ROWS && (
              <div className="tbl-foot">
                <button type="button" onClick={() => setExpanded(!expanded)}>
                  {expanded
                    ? t("leaderboards.showTop")
                    : t("leaderboards.showAll", { n: data.length })}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
