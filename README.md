# LoL Pro Stats — Almanaque de récords

Sitio estilo **referencia deportiva** (Basketball-Reference / Transfermarkt) con
estadísticas históricas de jugadores profesionales de League of Legends: mejor KDA
histórico, récord de KDA en un Worlds, más títulos internacionales ganados, más
partidas, mejor win rate, y más.

Fuente primaria: **Leaguepedia** (lol.fandom.com) vía su API **Cargo** — la misma
fuente que renderiza el wiki. Fuente complementaria (Fase 2): **Oracle's Elixir**
(economía avanzada + pentakills, 2014→hoy).

## Arquitectura

"Computar al actualizar, servir estático desde el edge". El dato es chico, cambia
lento y es read-heavy → precomputamos todo en el ETL y servimos estático.

```
etl/   (Python)   Extract (mwcleric/Cargo) -> bronze JSON gzip -> SQLite silver
                  -> transform (tiers, player_career_stats, leaderboards, records) = GOLD
web/   (Next.js)  output:export (SSG). Lee data/site.sqlite en build time.
                  Rankings interactivos con TanStack Table.
db/    schema.sql  Esquema SQLite (silver + gold).
data/  site.sqlite + raw/ (bronze)
```

Deploy previsto: ETL en **GitHub Actions** (cron diario + full semanal) → dispara un
**deploy hook de Cloudflare Pages** que reconstruye el sitio con datos frescos.

## Setup

### ETL (Python 3.12)
```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt

# Slice de un torneo (desarrollo/verificación):
python -m etl.run --tournament "2025 First Stand" --fresh
```

> **⚠️ Rate limit / cuenta de bot.** La API **anónima** de Fandom limita muy fuerte
> (en la práctica ~1 query cada 30-40 s; el cliente hace backoff automático pero es
> lento). Para el backfill histórico completo es **casi imprescindible** una cuenta
> de bot de Leaguepedia: da páginas de 5.000 filas (vs 500) y límites más altos.
> Configurá las credenciales y el ETL las usa automáticamente:
> ```bash
> export LEAGUEPEDIA_USERNAME="TuUsuario@TuBot"
> export LEAGUEPEDIA_PASSWORD="..."   # bot password de Special:BotPasswords
> ```

### Web (Next.js)
```bash
cd web
npm install
npm run build      # SSG: lee ../data/site.sqlite
npx serve out      # o `npm run dev` para desarrollo
```

## Estado

- ✅ ETL slice por torneo (extract + bronze + SQLite + gold) funcionando.
- ✅ Rankings: KDA de carrera, títulos internacionales, títulos de Worlds, partidas,
  kills, win rate (con umbrales mínimos de muestra).
- ✅ Web SSG con record book + rankings interactivos.
- ⏳ Backfill completo (todas las regiones desde 2011), Oracle's Elixir, páginas de
  jugador/equipo/campeón, más récords (KP%, KDA de un solo torneo, por rol). Ver
  el plan en `~/.claude/plans/`.

### Notas de datos verificadas (Fase 0)
- Liga del Mundial: `Tournaments.League = 'World Championship'` (NO `'Worlds'`).
- MSI: `'Mid-Season Invitational'`. Nuevo evento: `'First Stand'` (2025+).
- Eventos internacionales: `Tournaments.Region = 'International'`.
- Identidad de jugador: agregar por `ScoreboardPlayers.Link` (canónico); resolver
  nombres tipeados vía `PlayerRedirects.AllName -> OverviewPage`.

## Referencias

- [Help:Leaguepedia API](https://lol.fandom.com/wiki/Help:Leaguepedia_API) — rate-limits, bot password, paquetes Python
- [Help:ACS archive](https://lol.fandom.com/wiki/Help:ACS_archive) — archivo ACS/JSON de partidas
- mwcleric: [repo](https://github.com/RheingoldRiver/mwcleric) · [docs](https://mwcleric.readthedocs.io/) — usamos el fork `arbolitoloco1/mwcleric@empty_string_fix`
- mwrogue: [repo](https://github.com/RheingoldRiver/mwrogue) · [docs](https://mwrogue.readthedocs.io/)
- [MediaWiki API](https://www.mediawiki.org/wiki/API:Main_page)

> **Rate limits (Cargo).** Fandom limita fuerte cargoquery para cuentas sin el grupo
> `bot`: token-bucket de ~5, refill ~1/4s; golpearlo mientras estás limitado extiende
> el castigo. El cliente usa throttle adaptativo (AIMD) + esperas quietas. Para
> full-speed (sin límite) hace falta el flag `bot` de Leaguepedia (se pide a River).

## Créditos y licencia de datos

- **Leaguepedia** (lol.fandom.com) — datos bajo **CC BY-SA 4.0**.
- **Oracle's Elixir** (Tim "Magic" Sevenhuysen) — uso con atribución.
- Proyecto no oficial, sin afiliación con Riot Games.
