"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import type { LeaderboardRow } from "@/lib/db";
import { formatValue, scopeLabel, ROLES, type StatDef } from "@/lib/stats";
import { roleIcon } from "@/lib/icons";

const col = createColumnHelper<LeaderboardRow>();

export default function LeaderboardExplorer({
  boards,
  catalog,
}: {
  boards: Record<string, Record<string, LeaderboardRow[]>>;
  catalog: StatDef[];
}) {
  const [statKey, setStatKey] = useState(catalog[0]?.key ?? "");
  const [scope, setScope] = useState("all");
  const [sorting, setSorting] = useState<SortingState>([{ id: "rank", desc: false }]);

  const def = catalog.find((s) => s.key === statKey) ?? catalog[0];
  const effScope = def?.roleScoped ? scope : "all";
  const data = boards[statKey]?.[effScope] ?? [];

  const columns = useMemo(
    () => [
      col.accessor("rank", {
        header: "#",
        cell: (c) => {
          const r = c.getValue() as number;
          return r <= 3 ? (
            <span>
              <i>{r}</i>
            </span>
          ) : (
            r
          );
        },
      }),
      col.accessor("display_id", {
        header: "Player",
        cell: (c) => {
          const slug = c.row.original.slug;
          const name = c.getValue() as string;
          return slug ? (
            <Link href={`/players/${slug}`} className="plink">
              {name}
            </Link>
          ) : (
            name
          );
        },
      }),
      col.accessor("value", {
        header: def?.short ?? "Value",
        cell: (c) => formatValue(def?.kind ?? "count", c.getValue() as number),
      }),
      col.accessor("games", {
        header: "Games",
        cell: (c) => (c.getValue() == null ? "—" : (c.getValue() as number)),
      }),
    ],
    [def],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const numericCols = new Set(["value", "games", "rank"]);

  return (
    <>
      <div className="controls">
        {catalog.map((s) => (
          <button
            key={s.key}
            className="chip"
            data-active={s.key === statKey}
            onClick={() => setStatKey(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {def?.roleScoped && (
        <div className="controls roles">
          {["all", ...ROLES.map((r) => `role:${r}`)].map((sc) => {
            const icon = sc === "all" ? null : roleIcon(sc.replace("role:", ""));
            return (
              <button
                key={sc}
                className="chip role-chip"
                data-active={sc === scope}
                onClick={() => setScope(sc)}
              >
                {icon && (
                  <span
                    className="ic role sm"
                    style={{ backgroundImage: `url(${icon})` }}
                  />
                )}
                {scopeLabel(sc)}
              </button>
            );
          })}
        </div>
      )}

      {def?.help && <p className="help">{def.help}</p>}

      {data.length === 0 ? (
        <p className="empty">
          Not enough data for this leaderboard yet. The ETL is still loading — try
          reloading in a little while.
        </p>
      ) : (
        <div className="board-wrap">
          <table className="board">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => {
                    const isNum = numericCols.has(h.column.id);
                    const sorted = h.column.getIsSorted();
                    return (
                      <th
                        key={h.id}
                        className={isNum ? "num" : ""}
                        onClick={h.column.getToggleSortingHandler()}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sorted === "asc" ? " ▲" : sorted === "desc" ? " ▼" : ""}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const rank = row.getValue("rank") as number;
                return (
                  <tr key={row.id}>
                    {row.getVisibleCells().map((cell) => {
                      const id = cell.column.id;
                      let cls = numericCols.has(id) ? "num" : "";
                      if (id === "rank") cls = `rank ${rank <= 3 ? `top${rank}` : ""}`;
                      if (id === "display_id") cls = "player";
                      if (id === "value") cls = "num val";
                      if (id === "games") cls = "num games";
                      return (
                        <td key={cell.id} className={cls}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
