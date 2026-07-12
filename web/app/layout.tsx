import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "LoL Pro Stats — Almanaque de récords",
  description:
    "Récords y rankings históricos de jugadores profesionales de League of Legends: KDA, títulos internacionales, partidas y más.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="site-header">
          <div className="inner container">
            <Link href="/" className="brand">
              LoL<span className="accent"> Pro Stats</span>
            </Link>
            <nav className="nav">
              <Link href="/">Récords</Link>
              <Link href="/leaderboards">Rankings</Link>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
        <footer className="footer container">
          Data: Leaguepedia (lol.fandom.com), CC BY-SA 4.0 · Data courtesy of Oracle&apos;s
          Elixir (Tim Sevenhuysen) · Proyecto no oficial, no afiliado a Riot Games.
        </footer>
      </body>
    </html>
  );
}
