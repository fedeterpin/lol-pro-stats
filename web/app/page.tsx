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
      <p className="eyebrow">League of Legends · Esports almanac</p>
      <h1>Every pro, every record</h1>
      <p className="subtitle">
        Search any professional player to open their profile — legacy score, titles,
        KDA and champion pool.
      </p>
      <HomeSearch players={players} />
      <div className="home-links">
        <Link href="/records">Hall of Records</Link>
        <Link href="/leaderboards">Leaderboards</Link>
        <Link href="/players">All players</Link>
        <Link href="/champions">Champions</Link>
      </div>
    </section>
  );
}
