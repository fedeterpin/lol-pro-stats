import type { Metadata } from "next";
import Link from "next/link";
import { Cinzel, Barlow } from "next/font/google";
import "./globals.css";

const display = Cinzel({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const body = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LoL Pro Stats — Hall of Records",
  description:
    "The record book of professional League of Legends: best career KDA, international titles, Worlds appearances and more.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <div className="atmosphere" aria-hidden="true" />
        <header className="site-header">
          <div className="inner">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden="true" />
              <span className="brand-name">
                LoL <em>Pro Stats</em>
              </span>
            </Link>
            <nav className="nav">
              <Link href="/">Search</Link>
              <Link href="/leaderboards">Leaderboards</Link>
              <Link href="/players">Players</Link>
              <Link href="/champions">Champions</Link>
              <Link href="/records">Records</Link>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
        <footer className="site-footer">
          <div className="container">
            <span className="hex-node" aria-hidden="true" />
            Data from Leaguepedia (CC BY-SA 4.0) · Oracle&apos;s Elixir (Tim
            Sevenhuysen) · A fan project, not affiliated with Riot Games.
          </div>
        </footer>
      </body>
    </html>
  );
}
