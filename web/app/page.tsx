import Link from "next/link";
import { listPlayers } from "@/lib/db";
import { T } from "@/lib/i18n";
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
      <p className="eyebrow">
        <T k="home.eyebrow" />
      </p>
      <h1>
        <T k="home.title" />
      </h1>
      <p className="subtitle">
        <T k="home.subtitle" />
      </p>
      <HomeSearch players={players} />
      <div className="home-links">
        <Link href="/records">
          <T k="home.link.records" />
        </Link>
        <Link href="/leaderboards">
          <T k="home.link.leaderboards" />
        </Link>
        <Link href="/players">
          <T k="home.link.players" />
        </Link>
        <Link href="/champions">
          <T k="home.link.champions" />
        </Link>
      </div>
    </section>
  );
}
