import { listPlayers } from "@/lib/db";
import PlayerSearch from "@/components/PlayerSearch";

export default function PlayersPage() {
  const players = listPlayers(2000);
  return (
    <>
      <section className="page-head">
        <p className="kicker">Every name on the stage</p>
        <h1 className="page-title gold-text">Players</h1>
        <div className="divider" aria-hidden="true">
          <span className="diamond" />
        </div>
        <p className="page-sub">
          {players.length.toLocaleString("en")} players who have set foot on an
          international stage. Search by name, team or role.
        </p>
      </section>
      <PlayerSearch players={players} />
    </>
  );
}
