"use client";

import { useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import type { LeaderboardRow } from "@/lib/db";
import { formatValue, type StatDef } from "@/lib/stats";

const col = createColumnHelper<LeaderboardRow>();

export default function LeaderboardExplorer({
  boards,
  catalog,
}: {
  boards: Record<string, LeaderboardRow[]>;
  catalog: StatDef[];
}) {
  const [statKey, setStatKey] = useState(catalog[0]?.key ?? "");
  const [sorting, setSorting] = useState<SortingState>([{ id: "rank", desc: false }]);

  const def = catalog.find((s) => s.key === statKey) ?? catalog[0];
  const data = boards[statKey] ?? [];

  const columns = useMemo(
    () => [
      col.accessor("rank", { header: "#", cell: (c) => c.getValue() }),
      col.accessor("display_id", { header: "Jugador" }),
      col.accessor("value", {
        header: def?.short ?? "Valor",
        cell: (c) => formatValue(def?.kind ?? "count", c.getValue() as number),
      }),
      col.accessor("games", {
        header: "Partidas",
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
      {def?.help && <p className="help">{def.help}</p>}

      {data.length === 0 ? (
        <p className="help">Sin datos para este ranking todavía.</p>
      ) : (
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
                    const isNum = numericCols.has(id);
                    let cls = isNum ? "num" : "";
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
      )}
    </>
  );
}
