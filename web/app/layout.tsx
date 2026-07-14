import type { Metadata } from "next";
import Link from "next/link";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";

// Display: Space Grotesk — modern, geometric, with character in the large numbers.
// Used ONLY in headings and figures (never in small text, which was the legibility
// problem of the previous serif).
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

// Body/UI: Inter — designed to read crisply at 12-14px, with tabular-nums for data.
const body = Inter({
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
