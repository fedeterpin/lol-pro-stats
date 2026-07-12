/** @type {import('next').NextConfig} */
const nextConfig = {
  // Export estático (SSG) para servir desde Cloudflare Pages sin runtime de servidor.
  // La DB SQLite se lee en build time (server components / generateStaticParams).
  output: "export",
  images: { unoptimized: true },
  // better-sqlite3 es nativo y solo se usa en build (no se bundlea al cliente).
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
