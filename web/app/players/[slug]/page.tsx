import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getPlayerBySlug,
  getPlayerChampions,
  getPlayerTitles,
  getPlayerRankings,
  getScoreRank,
  listPlayers,
} from "@/lib/db";
import { championSquare } from "@/lib/champion";
import { playerPhoto } from "@/lib/player";
import { STAT_BY_KEY, formatValue, scopeLabel } from "@/lib/stats";

export function generateStaticParams() {
  return listPlayers(5000).map((p) => ({ slug: p.slug }));
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const player = getPlayerBySlug(slug);
  if (!player) notFound();

  const champs = getPlayerChampions(player.player_id, 12);
  const titles = getPlayerTitles(player.player_id);
  const scoreRank = getScoreRank(player.score);
  const breakdown: Record<string, number> = (() => {
    try {
      return JSON.parse(player.score_breakdown ?? "{}");
    } catch {
      return {};
    }
  })();
  const BD_PARTS = [
    { key: "titles", label: "Titles", color: "var(--gold)" },
    { key: "stage", label: "Stage", color: "var(--teal)" },
    { key: "longevity", label: "Longevity", color: "#6f86b8" },
    { key: "performance", label: "Performance", color: "#b6784a" },
  ];
  const bdTotal = BD_PARTS.reduce((s, p) => s + (breakdown[p.key] || 0), 0) || 1;
  const held = getPlayerRankings(player.player_id, 10)
    .filter((r) => STAT_BY_KEY[r.stat])
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 8);

  const meta = [
    player.role,
    player.team,
    player.country,
    player.is_retired ? "Retired" : null,
  ].filter(Boolean);

  const tiles = [
    { label: "Games", value: player.games.toLocaleString("en") },
    { label: "Career KDA", value: player.kda.toFixed(2), accent: true },
    { label: "Win rate", value: `${(player.win_rate * 100).toFixed(1)}%` },
    { label: "Intl. titles", value: player.intl_titles },
    { label: "Worlds titles", value: player.worlds_titles },
  ];

  return (
    <>
      <Link href="/leaderboards" className="back">
        ← Leaderboards
      </Link>

      <header className="player-head">
        {playerPhoto(player.image_filename) && (
          <span
            className="portrait"
            style={{ backgroundImage: `url(${playerPhoto(player.image_filename)})` }}
            aria-hidden="true"
          />
        )}
        <div className="player-headinfo">
          <h1 className="player-name">{player.display_id}</h1>
          {player.name && player.name !== player.display_id && (
            <p className="player-real">{player.name}</p>
          )}
          {meta.length > 0 && (
            <p className="player-meta">
              {meta.map((m, i) => (
                <span key={i}>{m}</span>
              ))}
            </p>
          )}
        </div>
      </header>

      <section className="score-panel">
        <div className="score-main">
          <div className="score-num">{player.score.toLocaleString("en")}</div>
          <div className="score-cap">
            <div className="score-label">Legacy score</div>
            {scoreRank.rank > 0 && (
              <div className="score-rank">
                #{scoreRank.rank} of {scoreRank.total.toLocaleString("en")}
              </div>
            )}
          </div>
        </div>
        <div className="score-break">
          <div className="score-bar">
            {BD_PARTS.map((p) => {
              const v = breakdown[p.key] || 0;
              if (v <= 0) return null;
              return (
                <span
                  key={p.key}
                  style={{ width: `${(v / bdTotal) * 100}%`, background: p.color }}
                  title={`${p.label}: ${v}`}
                />
              );
            })}
          </div>
          <div className="score-legend">
            {BD_PARTS.map((p) => (
              <span key={p.key}>
                <i style={{ background: p.color }} />
                {p.label} <b>{breakdown[p.key] || 0}</b>
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="tile-row">
        {tiles.map((t) => (
          <div className="tile" key={t.label}>
            <div className={`tile-val${t.accent ? " accent" : ""}`}>{t.value}</div>
            <div className="tile-label">{t.label}</div>
          </div>
        ))}
      </div>

      {held.length > 0 && (
        <section className="block">
          <h2 className="block-title">Records held</h2>
          <div className="held-grid">
            {held.map((r) => {
              const def = STAT_BY_KEY[r.stat];
              return (
                <div className="held" key={`${r.stat}-${r.scope}`}>
                  <span className={`held-rank r${r.rank <= 3 ? r.rank : "n"}`}>
                    #{r.rank}
                  </span>
                  <span className="held-label">
                    {def.label}
                    {r.scope !== "all" && (
                      <em> · {scopeLabel(r.scope)}</em>
                    )}
                    <b>{formatValue(def.kind, r.value)}</b>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {titles.length > 0 && (
        <section className="block">
          <h2 className="block-title">Trophy case · {titles.length}</h2>
          <div className="trophy-grid">
            {titles.map((t) => (
              <div className="trophy" key={t.overview_page}>
                <span className="trophy-year">{t.year}</span>
                <span className="trophy-event">{t.event}</span>
                <span className="trophy-league">{t.league}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {champs.length > 0 && (
        <section className="block">
          <h2 className="block-title">Champion pool</h2>
          <div className="champ-grid">
            {champs.map((c) => (
              <div className="champ" key={c.champion}>
                <span
                  className="champ-icon"
                  style={{ backgroundImage: `url(${championSquare(c.champion)})` }}
                  aria-hidden="true"
                />
                <div className="champ-body">
                  <div className="champ-name">{c.champion}</div>
                  <div className="champ-stat">
                    {c.games} games · {c.wins}W {c.games - c.wins}L ·{" "}
                    <b>{c.kda.toFixed(2)}</b> KDA
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
