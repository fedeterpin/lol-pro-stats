/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export (SSG) so Cloudflare Pages can serve it with no server runtime.
  // The SQLite DB is read at build time (server components / generateStaticParams).
  output: "export",
  images: { unoptimized: true },
  // better-sqlite3 is native and only used at build time (never bundled for the client).
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
