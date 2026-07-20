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
import ScoreBreakdown from "@/components/ScoreBreakdown";
import { championSquare } from "@/lib/champion";
import { roleIcon, countryFlag } from "@/lib/icons";
import { STAT_BY_KEY, statLabelKey } from "@/lib/stats";
import { T, Num, StatValue, ScopeLabel } from "@/lib/i18n";
import type { MsgKey } from "@/lib/i18n/messages";

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
  const held = getPlayerRankings(player.player_id, 10)
    .filter((r) => STAT_BY_KEY[r.stat])
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 8);

  const tiles: { key: MsgKey; value: React.ReactNode; accent?: boolean }[] = [
    { key: "player.tile.games", value: <Num value={player.games} /> },
    {
      key: "player.tile.careerKda",
      value: <StatValue kind="ratio" value={player.kda} />,
      accent: true,
    },
    {
      key: "player.tile.winRate",
      value: <StatValue kind="percent" value={player.win_rate} />,
    },
    { key: "player.tile.intlTitles", value: <Num value={player.intl_titles} /> },
    {
      key: "player.tile.worldsTitles",
      value: <Num value={player.worlds_titles} />,
    },
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
            {player.is_retired ? (
              <span className="pm-item retired">
                <T k="player.retired" />
              </span>
            ) : null}
          </p>
        </div>
      </header>

      <section className="score-panel">
        <div className="score-main">
          <div className="score-num">
            <Num value={player.score} />
          </div>
          <div className="score-cap">
            <div className="score-label">
              <T k="player.legacyScore" />
            </div>
            {scoreRank.rank > 0 && (
              <div className="score-rank">
                <T
                  k="player.rank"
                  vars={{ rank: scoreRank.rank, total: scoreRank.total }}
                />
              </div>
            )}
          </div>
        </div>
        <ScoreBreakdown breakdown={breakdown} />
      </section>

      <div className="tile-row">
        {tiles.map((tile) => (
          <div className="tile" key={tile.key}>
            <div className={`tile-val${tile.accent ? " accent" : ""}`}>
              {tile.value}
            </div>
            <div className="tile-label">
              <T k={tile.key} />
            </div>
          </div>
        ))}
      </div>

      {held.length > 0 && (
        <section className="block">
          <h2 className="block-title">
            <T k="player.recordsHeld" />
          </h2>
          <div className="held-grid">
            {held.map((r) => {
              const def = STAT_BY_KEY[r.stat];
              return (
                <div className="held" key={`${r.stat}-${r.scope}`}>
                  <span className={`held-rank r${r.rank <= 3 ? r.rank : "n"}`}>
                    #{r.rank}
                  </span>
                  <span className="held-label">
                    <T k={statLabelKey(r.stat)} />
                    {r.scope !== "all" && (
                      <em>
                        {" · "}
                        <ScopeLabel scope={r.scope} />
                      </em>
                    )}
                    <b>
                      <StatValue kind={def.kind} value={r.value} />
                    </b>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {teams.length > 0 && (
        <section className="block">
          <h2 className="block-title">
            <T k="player.teamHistory" />
          </h2>
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
                    · <T k="common.gamesCount" vars={{ n: t.games }} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {titles.length > 0 && (
        <section className="block">
          <h2 className="block-title">
            <T k="player.trophyCase" /> · {titles.length}
          </h2>
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
          <h2 className="block-title">
            <T k="player.championPool" />
          </h2>
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
                    <T k="common.gamesCount" vars={{ n: c.games }} /> · {c.wins}
                    <T k="common.winShort" /> {c.games - c.wins}
                    <T k="common.lossShort" /> ·{" "}
                    <b>
                      <StatValue kind="ratio" value={c.kda} />
                    </b>{" "}
                    KDA
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
