"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PlayerRow } from "@/lib/db";
import { ROLES } from "@/lib/stats";

const ROLE_SHORT: Record<string, string> = {
  Top: "Top",
  Jungle: "Jng",
  Mid: "Mid",
  Bot: "ADC",
  Support: "Sup",
};

const MAX_ROWS = 100;

export default function PlayerSearch({ players }: { players: PlayerRow[] }) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return players.filter((p) => {
      if (role !== "all" && p.role !== role) return false;
      if (!needle) return true;
      return [p.display_id, p.name, p.team, p.role]
        .filter(Boolean)
        .some((f) => (f as string).toLowerCase().includes(needle));
    });
  }, [q, role, players]);

  const rows = filtered.slice(0, MAX_ROWS);

  return (
    <>
      <div className="players-tools">
        <div className="cutp cut14 search-frame">
          <div className="cutp-in">
            <span className="search-icon" aria-hidden="true">
              ⌕
            </span>
            <input
              className="search-input"
              type="search"
              placeholder="Search a player, team or role…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search players"
            />
          </div>
        </div>
        <div className="chips">
          {["all", ...ROLES].map((r) => (
            <button
              key={r}
              type="button"
              className={`chip${r === role ? " active" : ""}`}
              onClick={() => setRole(r)}
            >
              {r === "all" ? "All" : ROLE_SHORT[r] ?? r}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="empty">No players match “{q}”.</p>
      ) : (
        <div className="tbl tbl-players">
          <div className="tbl-head">
            <span className="th-lab">Player</span>
            <span className="th-lab col-role">Role</span>
            <span className="th-lab col-team">Team</span>
            <span className="th-lab th-num col-games">Games</span>
            <span className="th-lab th-num">KDA</span>
            <span className="th-lab th-num">Win rate</span>
          </div>
          {rows.map((p, i) => (
            <Link
              href={`/players/${p.slug}`}
              className={`tbl-row${i === 0 ? " first" : ""}`}
              key={p.player_id}
            >
              <span className="pcell">
                <span
                  className="avatar av-30"
                  style={
                    p.image_url ? { backgroundImage: `url(${p.image_url})` } : undefined
                  }
                  aria-hidden="true"
                >
                  {!p.image_url && (p.display_id?.[0] ?? "?")}
                </span>
                <span className="pcell-id">
                  <span className="pname">{p.display_id}</span>
                  {p.intl_titles > 0 && (
                    <span className="ptag" title="International titles">
                      ★ {p.intl_titles}
                    </span>
                  )}
                </span>
              </span>
              <span className="cell-role col-role">{p.role ?? "—"}</span>
              <span className="cell-role col-team">{p.team ?? "—"}</span>
              <span className="cell-games cell-num col-games">{p.games}</span>
              <span className="cell-score cell-num">{p.kda.toFixed(2)}</span>
              <span className="cell-num">{(p.win_rate * 100).toFixed(1)}%</span>
            </Link>
          ))}
        </div>
      )}
      {filtered.length > MAX_ROWS && (
        <p className="tbl-count">
          Showing {MAX_ROWS} of {filtered.length.toLocaleString("en")} — refine your
          search to narrow it down.
        </p>
      )}
    </>
  );
}
