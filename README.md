# LoL Pro Stats — Records Almanac

A **sports-reference**-style site (Basketball-Reference / Transfermarkt) with
historical statistics of professional League of Legends players: best all-time KDA,
KDA record at a Worlds, most international titles won, most games played, best win
rate, and more.

Primary source: **Leaguepedia** (lol.fandom.com) via its **Cargo** API — the same
source that renders the wiki. Complementary source (Phase 2): **Oracle's Elixir**
(advanced economy + pentakills, 2014→today).

## Architecture

"Compute on update, serve static from the edge". The data is small, changes slowly
and is read-heavy → we precompute everything in the ETL and serve static.

```
etl/   (Python)   Extract (mwcleric/Cargo) -> bronze JSON gzip -> SQLite silver
                  -> transform (tiers, player_career_stats, leaderboards, records) = GOLD
web/   (Next.js)  output:export (SSG). Reads data/site.sqlite at build time.
                  Interactive rankings with TanStack Table.
db/    schema.sql  SQLite schema (silver + gold).
data/  site.sqlite + raw/ (bronze)
```

Planned deploy: ETL on **GitHub Actions** (daily cron + weekly full) → triggers a
**Cloudflare Pages deploy hook** that rebuilds the site with fresh data.

## Setup

### ETL (Python 3.12)
```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt

# Single-tournament slice (development/verification):
python -m etl.run --tournament "2025 First Stand" --fresh
```

> **⚠️ Rate limit / bot account.** Fandom's **anonymous** API limits very hard
> (in practice ~1 query every 30-40 s; the client does automatic backoff but it is
> slow). For the complete historical backfill a Leaguepedia bot account is **almost
> indispensable**: it gives 5,000-row pages (vs 500) and higher limits.
> Set the credentials and the ETL uses them automatically:
> ```bash
> export LEAGUEPEDIA_USERNAME="YourUser@YourBot"
> export LEAGUEPEDIA_PASSWORD="..."   # bot password from Special:BotPasswords
> ```

### Web (Next.js)
```bash
cd web
npm install
npm run build      # SSG: reads ../data/site.sqlite
npx serve out      # or `npm run dev` for development
```

## Status

- ✅ Per-tournament ETL slice (extract + bronze + SQLite + gold) working.
- ✅ Rankings: career KDA, international titles, Worlds titles, games,
  kills, win rate (with minimum sample thresholds).
- ✅ SSG web with record book + interactive rankings.
- ⏳ Complete backfill (all regions since 2011), Oracle's Elixir, player/team/champion
  pages, more records (KP%, single-tournament KDA, per role). See
  the plan in `~/.claude/plans/`.

### Legacy Score (player score)

A composite, **interpretable** score of greatness on the big stage (see
`etl/transform/aggregate.py::_legacy_score`). Since the v1 dataset is international,
it measures legacy at Worlds/MSI/First Stand:

```
score = 110·worlds_titles + 45·msi_titles + 25·other_intl_titles
      + 9·worlds_appearances
      + 0.5·intl_games
      + max(0, intl_KDA − 3.0) · min(intl_games, 120) · 0.35   (performance bonus)
```

The **breakdown** (titles / stage / longevity / performance) is shown on each
player page so it is transparent and defensible. E.g.: Faker leads.

### Verified data notes (Phase 0)
- World Championship league: `Tournaments.League = 'World Championship'` (NOT `'Worlds'`).
- MSI: `'Mid-Season Invitational'`. New event: `'First Stand'` (2025+).
- International events: `Tournaments.Region = 'International'`.
- Player identity: aggregate by `ScoreboardPlayers.Link` (canonical); resolve typed
  names via `PlayerRedirects.AllName -> OverviewPage`.

## References

- [Help:Leaguepedia API](https://lol.fandom.com/wiki/Help:Leaguepedia_API) — rate-limits, bot password, Python packages
- [Help:ACS archive](https://lol.fandom.com/wiki/Help:ACS_archive) — ACS/JSON match archive
- mwcleric: [repo](https://github.com/RheingoldRiver/mwcleric) · [docs](https://mwcleric.readthedocs.io/) — we use the fork `arbolitoloco1/mwcleric@empty_string_fix`
- mwrogue: [repo](https://github.com/RheingoldRiver/mwrogue) · [docs](https://mwrogue.readthedocs.io/)
- [MediaWiki API](https://www.mediawiki.org/wiki/API:Main_page)

> **Rate limits (Cargo).** Fandom limits cargoquery hard for accounts without the
> `bot` group: token-bucket of ~5, refill ~1/4s; hitting it while you are limited
> extends the penalty. The client uses adaptive throttle (AIMD) + quiet waits. For
> full-speed (no limit) you need Leaguepedia's `bot` flag (request it from River).

## Credits and data license

- **Leaguepedia** (lol.fandom.com) — data under **CC BY-SA 4.0**.
- **Oracle's Elixir** (Tim "Magic" Sevenhuysen) — used with attribution.
- Unofficial project, not affiliated with Riot Games.
