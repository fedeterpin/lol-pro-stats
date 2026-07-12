# Deploy — Cloudflare (Workers Builds) + GitHub

El sitio es **estático** (Next.js `output: export`) y se buildea desde
`data/web.sqlite` (una SQLite slim solo-gold, commiteada, ~2 MB).

**Cloudflare Workers Builds** está conectado al repo de GitHub: en cada push a
`main`, Cloudflare clona, buildea y publica. El `wrangler.jsonc` sirve `web/out`
como Worker de assets estáticos.

## Configuración en Cloudflare (una vez)
Al conectar el repo (Workers & Pages → Import a repository):
- **Project name**: `lol-pro-stats`
- **Build command**: `cd web && npm ci && npm run build`
- **Deploy command**: `npx wrangler deploy` (default — usa `wrangler.jsonc`)
- Deploy.

El sitio queda en `https://lol-pro-stats.<subdominio>.workers.dev` (o el dominio
que asigne Cloudflare / uno custom).

## Actualizar datos (tras un Worlds/MSI)
El workflow **`.github/workflows/update-data.yml`** (GitHub Actions, dispatch manual)
corre el ETL, regenera `data/web.sqlite` y la commitea → el push dispara el rebuild
de Cloudflare. Requiere secrets en el repo de GitHub:
- `LEAGUEPEDIA_USERNAME` — `TuUsuario@lol-pro-stats`
- `LEAGUEPEDIA_PASSWORD` — el bot password

O correr el ETL localmente y pushear:
```bash
python -m etl.backfill --leagues "World Championship,Mid-Season Invitational,First Stand"
python -m etl.fetch_images
python -m etl.build_web_db
git add -f data/web.sqlite && git commit -m "chore(data): refresh" && git push
```

## Notas
- La DB completa del ETL (`data/site.sqlite`) y el bronze (`data/raw/`) están
  gitignorados; solo se commitea `data/web.sqlite` (~2 MB).
- Build local: `cd web && npm run build && npx serve out`.
- `wrangler.jsonc` usa `not_found_handling: "404-page"` para servir `out/404.html`.
