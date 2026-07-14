import Link from "next/link";
import { notFound } from "next/navigation";
import BackLink from "@/components/BackLink";
import {
  getPlayerBySlug,
  getPlayerChampions,
  getPlayerTitles,
  getPlayerTeams,
  getPlayerRankings,
  getScoreRank,
  listPlayers,
} from "@/lib/db";
import { championSquare } from "@/lib/champion";
import { roleIcon, countryFlag } from "@/lib/icons";
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
  const teams = getPlayerTeams(player.player_id);
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

  const tiles = [
    { label: "Games", value: player.games.toLocaleString("en") },
    { label: "Career KDA", value: player.kda.toFixed(2), accent: true },
    { label: "Win rate", value: `${(player.win_rate * 100).toFixed(1)}%` },
    { label: "Intl. titles", value: player.intl_titles },
    { label: "Worlds titles", value: player.worlds_titles },
  ];

  return (
    <>
      <BackLink />

      <header className="player-head">
        {player.image_url && (
          <span
            className="portrait"
            style={{ backgroundImage: `url(${player.image_url})` }}
            aria-hidden="true"
          />
        )}
        <div className="player-headinfo">
          <h1 className="player-name">{player.display_id}</h1>
          {player.name && player.name !== player.display_id && (
            <p className="player-real">{player.name}</p>
          )}
          <p className="player-meta">
            {player.role && roleIcon(player.role) && (
              <span className="pm-item" title={player.role}>
                <span
                  className="ic role"
                  style={{ backgroundImage: `url(${roleIcon(player.role)})` }}
                />
                {player.role}
              </span>
            )}
            {player.team && (
              <span className="pm-item">
                {player.team_logo_url && (
                  <span
                    className="ic team"
                    style={{ backgroundImage: `url(${player.team_logo_url})` }}
                  />
                )}
                {player.team}
              </span>
            )}
            {player.country && (
              <span className="pm-item">
                {countryFlag(player.country) && (
                  <span
                    className="ic flag"
                    style={{ backgroundImage: `url(${countryFlag(player.country)})` }}
                  />
                )}
                {player.country}
              </span>
            )}
            {player.is_retired ? <span className="pm-item retired">Retired</span> : null}
          </p>
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

      {teams.length > 0 && (
        <section className="block">
          <h2 className="block-title">Team history</h2>
          <div className="teamhist">
            {teams.map((t) => (
              <div className="th-item" key={t.team}>
                {t.team_logo_url && (
                  <span
                    className="th-logo"
                    style={{ backgroundImage: `url(${t.team_logo_url})` }}
                    aria-hidden="true"
                  />
                )}
                <div className="th-info">
                  <span className="th-name">{t.team}</span>
                  <span className="th-years">
                    {t.first_year === t.last_year
                      ? t.first_year
                      : `${t.first_year}–${t.last_year}`}{" "}
                    · {t.games} games
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {titles.length > 0 && (
        <section className="block">
          <h2 className="block-title">Trophy case · {titles.length}</h2>
          <div className="trophy-grid">
            {titles.map((t) => (
              <div className="trophy" key={t.overview_page}>
                {t.team_logo_url && (
                  <span
                    className="trophy-logo"
                    style={{ backgroundImage: `url(${t.team_logo_url})` }}
                    aria-hidden="true"
                  />
                )}
                <div className="trophy-info">
                  <span className="trophy-year">
                    {t.year} · {t.league}
                  </span>
                  <span className="trophy-event">{t.event}</span>
                  {t.team && <span className="trophy-team">{t.team}</span>}
                </div>
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
