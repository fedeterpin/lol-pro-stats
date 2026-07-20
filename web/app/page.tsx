import Link from "next/link";
import { listPlayers } from "@/lib/db";
import HomeSearch, { type SearchPlayer } from "@/components/HomeSearch";

export default function Home() {
  const players: SearchPlayer[] = listPlayers(2000).map((p) => ({
    player_id: p.player_id,
    display_id: p.display_id,
    name: p.name,
    team: p.team,
    slug: p.slug,
    role: p.role,
    image_url: p.image_url,
    score: p.score,
  }));

  return (
    <section className="home-hero">
      <div className="home-logo" aria-hidden="true">
        <i />
      </div>
      <p className="kicker">League of Legends · Esports almanac</p>
      <h1 className="page-title gold-text">Every pro, every record</h1>
      <div className="divider" aria-hidden="true">
        <span className="diamond" />
      </div>
      <p className="page-sub">
        Search any professional player to open their profile — legacy score, titles,
        KDA and champion pool.
      </p>
      <HomeSearch players={players} />
      <div className="home-links">
        <Link href="/records" className="btn">
          <span>Hall of Records</span>
        </Link>
        <Link href="/leaderboards" className="btn">
          <span>Leaderboards</span>
        </Link>
        <Link href="/players" className="btn">
          <span>All players</span>
        </Link>
        <Link href="/champions" className="btn">
          <span>Champions</span>
        </Link>
      </div>
    </section>
  );
}
