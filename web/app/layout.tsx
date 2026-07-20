import type { Metadata } from "next";
import Link from "next/link";
import { Space_Grotesk, Inter } from "next/font/google";
import { LocaleProvider, T } from "@/lib/i18n";
import { DEFAULT_LOCALE } from "@/lib/i18n/messages";
import LocaleSwitch from "@/components/LocaleSwitch";
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
  // `lang` is the build-time locale; LocaleProvider rewrites it in the browser
  // once the visitor's language is known.
  return (
    <html
      lang={DEFAULT_LOCALE}
      className={`${display.variable} ${body.variable}`}
    >
      <body>
        <LocaleProvider>
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
                <Link href="/">
                  <T k="nav.search" />
                </Link>
                <Link href="/leaderboards">
                  <T k="nav.leaderboards" />
                </Link>
                <Link href="/players">
                  <T k="nav.players" />
                </Link>
                <Link href="/champions">
                  <T k="nav.champions" />
                </Link>
                <Link href="/records">
                  <T k="nav.records" />
                </Link>
              </nav>
              <LocaleSwitch />
            </div>
          </header>
          <main className="container">{children}</main>
          <footer className="site-footer">
            <div className="container">
              <span className="hex-node" aria-hidden="true" />
              <T k="footer.credits" />
            </div>
          </footer>
        </LocaleProvider>
      </body>
    </html>
  );
}
