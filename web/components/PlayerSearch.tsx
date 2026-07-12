"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PlayerRow } from "@/lib/db";
import { playerPhoto } from "@/lib/player";

export default function PlayerSearch({ players }: { players: PlayerRow[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? players.filter((p) =>
          [p.display_id, p.name, p.team, p.role]
            .filter(Boolean)
            .some((f) => (f as string).toLowerCase().includes(needle)),
        )
      : players;
    return list.slice(0, 120);
  }, [q, players]);

  return (
    <>
      <input
        className="search"
        type="search"
        placeholder="Search a player, team or role…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search players"
      />
      <div className="player-grid">
        {filtered.map((p) => (
          <Link href={`/players/${p.slug}`} className="pcard" key={p.player_id}>
            <div className="pcard-head">
              <span
                className="avatar"
                style={
                  playerPhoto(p.image_filename)
                    ? { backgroundImage: `url(${playerPhoto(p.image_filename)})` }
                    : undefined
                }
                aria-hidden="true"
              >
                {!p.image_filename && (p.display_id?.[0] ?? "?")}
              </span>
              <div className="pcard-id">
                <div className="pcard-top">
                  <span className="pcard-name">{p.display_id}</span>
                  {p.intl_titles > 0 && (
                    <span className="pcard-titles" title="International titles">
                      ★ {p.intl_titles}
                    </span>
                  )}
                </div>
                <div className="pcard-meta">
                  {[p.role, p.team].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
            </div>
            <div className="pcard-stats">
              <span>{p.games} games</span>
              <span className="pcard-kda">{p.kda.toFixed(2)} KDA</span>
            </div>
          </Link>
        ))}
      </div>
      {filtered.length === 0 && <p className="empty">No players match “{q}”.</p>}
    </>
  );
}
