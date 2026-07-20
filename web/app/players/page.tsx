import { listPlayers } from "@/lib/db";
import { T } from "@/lib/i18n";
import PlayerSearch from "@/components/PlayerSearch";

export default function PlayersPage() {
  const players = listPlayers(2000);
  return (
    <>
      <section className="hero">
        <p className="eyebrow">
          <T k="players.eyebrow" />
        </p>
        <h1>
          <T k="players.title" />
        </h1>
        <p className="subtitle">
          <T k="players.subtitle" vars={{ count: players.length }} />
        </p>
      </section>
      <div className="divider">
        <span className="hex-node" aria-hidden="true" />
      </div>
      <PlayerSearch players={players} />
    </>
  );
}
