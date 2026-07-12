# Deploy — Cloudflare Pages + GitHub Actions

El sitio es **estático** (Next.js `output: export`) y se buildea desde
`data/web.sqlite` (una SQLite slim solo-gold, commiteada, ~2 MB). GitHub Actions
buildea y publica en **Cloudflare Pages**.

## Qué automatiza cada workflow
- **`.github/workflows/deploy.yml`** — en cada push a `main` que toque `web/` o
  `data/web.sqlite`: `npm run build` → deploy de `web/out` a Cloudflare Pages.
- **`.github/workflows/update-data.yml`** — manual (o cron): corre el ETL de
  internacionales, regenera `data/web.sqlite` y la commitea (lo que dispara el deploy).
  Tarda ~40-50 min por el rate limit de Leaguepedia.

## Pasos (una sola vez)

### 1. Subir el repo a GitHub
```bash
gh repo create lol-pro-stats --private --source=. --remote=origin --push
# o: crear el repo en github.com y luego:
#   git remote add origin git@github.com:<usuario>/lol-pro-stats.git && git push -u origin main
```
> El branch por defecto acá es `master`; renombralo a `main` (o ajustá el workflow):
> `git branch -m master main`.

### 2. Cloudflare
1. Cuenta en <https://dash.cloudflare.com>.
2. **Account ID**: está en la home del dashboard (panel derecho) o en la URL.
3. **API Token**: My Profile → API Tokens → *Create Token* → plantilla
   **"Edit Cloudflare Pages"** (o permiso `Account · Cloudflare Pages · Edit`).
4. **Proyecto Pages**: Workers & Pages → Create → Pages → *Direct Upload*,
   nombre **`lol-pro-stats`** (así se llama en el workflow). Con eso alcanza; el
   deploy sube el build.

### 3. Secrets en GitHub
Repo → Settings → Secrets and variables → Actions → *New repository secret*:
- `CLOUDFLARE_API_TOKEN` — el token del paso 2.3
- `CLOUDFLARE_ACCOUNT_ID` — el account id del paso 2.2
- (para el ETL) `LEAGUEPEDIA_USERNAME` — tu bot user `Usuario@lol-pro-stats`
- (para el ETL) `LEAGUEPEDIA_PASSWORD` — el bot password

### 4. Deploy
- Push a `main` → corre `deploy.yml` y publica. El sitio queda en
  `https://lol-pro-stats.pages.dev` (+ dominio custom si configurás uno).
- Para refrescar datos tras un Worlds/MSI: Actions → *Update data (ETL)* → *Run workflow*.

## Notas
- La DB completa del ETL (`data/site.sqlite`) y el bronze (`data/raw/`) están
  gitignorados; solo se commitea `data/web.sqlite`.
- Regenerar la web DB localmente: `python -m etl.build_web_db`.
- Build local: `cd web && npm run build && npx serve out`.
