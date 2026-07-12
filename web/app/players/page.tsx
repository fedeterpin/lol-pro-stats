import { listPlayers } from "@/lib/db";
import PlayerSearch from "@/components/PlayerSearch";

export default function PlayersPage() {
  const players = listPlayers(2000);
  return (
    <>
      <section className="hero">
        <p className="eyebrow">Every name on the stage</p>
        <h1>Players</h1>
        <p className="subtitle">
          {players.length.toLocaleString("en")} players who have set foot on an
          international stage. Search by name, team or role.
        </p>
      </section>
      <div className="divider">
        <span className="hex-node" aria-hidden="true" />
      </div>
      <PlayerSearch players={players} />
    </>
  );
}
