# Deploy — Cloudflare (Workers Builds) + GitHub

The site is **static** (Next.js `output: export`) and is built from
`data/web.sqlite` (a slim, gold-only SQLite, committed, ~2 MB).

**Cloudflare Workers Builds** is connected to the GitHub repo: on every push to
`main`, Cloudflare clones, builds and publishes. The `wrangler.jsonc` serves `web/out`
as a static-assets Worker.

## Cloudflare setup (one-time)
When connecting the repo (Workers & Pages → Import a repository):
- **Project name**: `lol-pro-stats`
- **Build command**: `cd web && npm ci && npm run build`
- **Deploy command**: `npx wrangler deploy` (default — uses `wrangler.jsonc`)
- Deploy.

The site lives at `https://lol-pro-stats.<subdomain>.workers.dev` (or the domain
Cloudflare assigns / a custom one).

## Updating data (after a Worlds/MSI)
The **`.github/workflows/update-data.yml`** workflow (GitHub Actions, manual dispatch)
runs the ETL, regenerates `data/web.sqlite` and commits it → the push triggers the
Cloudflare rebuild. Requires secrets in the GitHub repo:
- `LEAGUEPEDIA_USERNAME` — `YourUser@lol-pro-stats`
- `LEAGUEPEDIA_PASSWORD` — the bot password

Or run the ETL locally and push:
```bash
python -m etl.backfill --leagues "World Championship,Mid-Season Invitational,First Stand"
python -m etl.fetch_images
python -m etl.build_web_db
git add -f data/web.sqlite && git commit -m "chore(data): refresh" && git push
```

## Notes
- The full ETL DB (`data/site.sqlite`) and the bronze (`data/raw/`) are
  gitignored; only `data/web.sqlite` (~2 MB) is committed.
- Local build: `cd web && npm run build && npx serve out`.
- `wrangler.jsonc` uses `not_found_handling: "404-page"` to serve `out/404.html`.
