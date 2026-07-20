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

const BD_PARTS = [
  { key: "titles", label: "Titles" },
  { key: "stage", label: "Stage" },
  { key: "longevity", label: "Longevity" },
  { key: "performance", label: "Performance" },
];

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
  const rankings = getPlayerRankings(player.player_id, 10).filter(
    (r) => STAT_BY_KEY[r.stat],
  );
  const held = rankings.sort((a, b) => a.rank - b.rank).slice(0, 8);
  // Gold-gradient name is earned: only for players holding a #1 record.
  const hasFirst = rankings.some((r) => r.rank === 1);
  const maxPoolGames = Math.max(...champs.map((c) => c.games), 1);

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

      <header className="player-hero">
        <span
          className="avatar av-96"
          style={
            player.image_url ? { backgroundImage: `url(${player.image_url})` } : undefined
          }
          aria-hidden="true"
        >
          {!player.image_url && (player.display_id?.[0] ?? "?")}
        </span>
        <div>
          <h1 className={`player-name${hasFirst ? " gold-text" : ""}`}>
            {player.display_id}
          </h1>
          {player.name && player.name !== player.display_id && (
            <p className="player-real">{player.name}</p>
          )}
          <p className="player-chips">
            {player.role && (
              <span className="pchip" title={player.role}>
                {roleIcon(player.role) && (
                  <span
                    className="ic role"
                    style={{ backgroundImage: `url(${roleIcon(player.role)})` }}
                  />
                )}
                {player.role}
              </span>
            )}
            {player.team && (
              <span className="pchip">
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
              <span className="pchip">
                {countryFlag(player.country) && (
                  <span
                    className="ic flag"
                    style={{ backgroundImage: `url(${countryFlag(player.country)})` }}
                  />
                )}
                {player.country}
              </span>
            )}
            {player.is_retired ? <span className="pchip retired">Retired</span> : null}
          </p>
        </div>
      </header>

      <section className="cutp featured score-panel">
        <div className="cutp-in">
          <div className="score-main">
            <div className="score-num gold-text">
              {player.score.toLocaleString("en")}
            </div>
            <div className="score-cap">
              <div className="score-label">Legacy score</div>
              {scoreRank.rank > 0 && (
                <div className="score-rank">
                  #{scoreRank.rank} of {scoreRank.total.toLocaleString("en")}
                </div>
              )}
            </div>
          </div>
          <div className="score-parts">
            {BD_PARTS.map((p) => (
              <div className="spart" key={p.key}>
                <span className="spart-label">{p.label}</span>
                <span className="spart-val">{breakdown[p.key] || 0}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="tile-row">
        {tiles.map((t) => (
          <div className="cutp cut14 tile" key={t.label}>
            <div className="cutp-in">
              <div className={`tile-val${t.accent ? " accent" : ""}`}>{t.value}</div>
              <div className="tile-label">{t.label}</div>
            </div>
          </div>
        ))}
      </div>

      {held.length > 0 && (
        <section className="block">
          <h2 className="block-title">Records held</h2>
          <div className="held-list">
            {held.map((r) => {
              const def = STAT_BY_KEY[r.stat];
              return (
                <div className="held-row" key={`${r.stat}-${r.scope}`}>
                  <span className={`rank-chip${r.rank <= 3 ? ` r${r.rank}` : ""}`}>
                    #{r.rank}
                  </span>
                  <span className="held-name">
                    {def.label}
                    {r.scope !== "all" && <em> · {scopeLabel(r.scope)}</em>}
                  </span>
                  <span className="held-val">{formatValue(def.kind, r.value)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {teams.length > 0 && (
        <section className="block">
          <h2 className="block-title">Team history</h2>
          <div className="th-list">
            {teams.map((t) => (
              <div className="th-row" key={t.team}>
                {t.team_logo_url && (
                  <span
                    className="th-logo"
                    style={{ backgroundImage: `url(${t.team_logo_url})` }}
                    aria-hidden="true"
                  />
                )}
                <span className="th-name">{t.team}</span>
                <span className="th-years">
                  {t.first_year === t.last_year
                    ? t.first_year
                    : `${t.first_year}–${t.last_year}`}{" "}
                  · {t.games} games
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {titles.length > 0 && (
        <section className="block">
          <h2 className="block-title">
            Trophy case <em>· {titles.length}</em>
          </h2>
          <div className="trophy-list">
            {titles.map((t) => (
              <div className="trophy-row" key={t.overview_page}>
                <span className="diamond" aria-hidden="true" />
                <span className="trophy-event">
                  {t.event}
                  {t.team && <em>{t.team}</em>}
                </span>
                <span className="trophy-year">{t.year}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {champs.length > 0 && (
        <section className="block">
          <h2 className="block-title">Champion pool</h2>
          <div className="pool-list">
            {champs.map((c) => (
              <div className="pool-row" key={c.champion}>
                <span
                  className="champ-icon"
                  style={{ backgroundImage: `url(${championSquare(c.champion)})` }}
                  aria-hidden="true"
                />
                <span className="pool-name">{c.champion}</span>
                <span className="pool-num">{c.games} games</span>
                <span className="pool-num pool-wl">
                  {c.wins}W {c.games - c.wins}L
                </span>
                <span className="pool-num pool-kda">
                  <b>{c.kda.toFixed(2)}</b> KDA
                </span>
                <span className="pool-bar" aria-hidden="true">
                  <i style={{ width: `${(c.games / maxPoolGames) * 100}%` }} />
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
