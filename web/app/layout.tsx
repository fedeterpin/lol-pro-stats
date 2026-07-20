import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Cinzel, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { LocaleProvider, T } from "@/lib/i18n";
import { DEFAULT_LOCALE } from "@/lib/i18n/messages";
import LocaleSwitch from "@/components/LocaleSwitch";
import SiteNav from "@/components/SiteNav";
import ScrollReset from "@/components/ScrollReset";
import "./globals.css";

// Display: Cinzel — ceremony only (page titles, hero names, rank numerals).
// Never below 13px, never for running text.
const display = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

// Body/UI: IBM Plex Sans for all data, labels and copy.
const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

// Numbers: IBM Plex Mono for every numeric value.
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LoL Pro Stats — Hall of Records",
  description:
    "The record book of professional League of Legends: best career KDA, international titles, Worlds appearances and more.",
};

export const viewport: Viewport = {
  themeColor: "#0a0e1a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // `lang` is the build-time locale; LocaleProvider rewrites it in the browser
  // once the visitor's language is known.
  return (
    <html
      lang={DEFAULT_LOCALE}
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body>
        <LocaleProvider>
          <ScrollReset />
          <header className="site-header">
            <div className="header-inner">
              <Link href="/" className="brand">
                <span className="logo-mark" aria-hidden="true">
                  <i />
                </span>
                <span className="wordmark">
                  LOL PRO <em>STATS</em>
                </span>
              </Link>
              <div className="header-tools">
                <SiteNav />
                <LocaleSwitch />
              </div>
            </div>
          </header>
          <div className="app-scroll">
            <main className="container">{children}</main>
            <footer className="site-footer">
              <div className="container">
                <T k="footer.credits" />
              </div>
            </footer>
          </div>
        </LocaleProvider>
      </body>
    </html>
  );
}
