# Oracle's Elixir (OE) integration — design spike

> **Status:** §0–§7 are the original 2026-07-14 research spike, written before any OE data was on
> disk. The silver layer and the identity crosswalk have since been built (`etl/oe_ingest.py`), and
> **§8 records what was actually decided and shipped** — read it first; where it disagrees with the
> spike, §8 wins.
>
> Goal: complement Leaguepedia's international data (Worlds/MSI/First Stand, 2011–2026) with Oracle's
> Elixir's **regional / 2nd-tier** coverage (LCK, LPL, LEC, LTA, LLA, CBLoL, PCS, VCS, LJL, tier-2
> leagues, etc.).

## 0. Where the data for this analysis came from

- The user's Drive folder `1gLSw0RLjBbtaNy0dgnGQDAZOHIgCe-HH` → **"OE Public Match Data"**, owned by
  `tsevenhuysen@oracleselixir.com`. It is the **same** folder the official OE site
  (`oracleselixir.com/tools/downloads`) links to for downloads — verified by reading the site's JS bundle.
- It holds one CSV per year: **2014 … 2026** (13 files). Current naming (no date suffix):
  `<YEAR>_LoL_esports_match_data_from_OraclesElixir.csv`. They are refreshed **once a day**.
- **The full CSV could not be downloaded automatically**: anonymous Drive downloads return
  *"Quota exceeded"* (the public-download cap on popular files) and the old S3 bucket
  `oracleselixir-downloadable-match-data.s3-us-west-2.amazonaws.com` **no longer exists** (`NoSuchBucket`).
- The real schema and ~1,600 sample rows from the **2025** file (plus the **2026** header) **were**
  obtained through the authenticated Google Drive integration (`get_file_metadata.contentSnippet` +
  `read_file_content`, which left ~1 MB of raw CSV in the tool results). Everything below is
  **verified against real 2025 data**, not recalled from memory.

Drive file IDs (in case this is ever automated or access is requested):

| Year | File ID | Size |
|------|---------|------|
| 2024 | `1IjIEhLc9n8eLKeY-yh_YigKVWbhgGBsN` | — |
| 2025 | `1v6LRphp2kYciU4SXp0PCjEMuev1bDejc` | ~79 MB |
| 2026 | `1hnpbrUpBMS1TZI7IovfpKeZfWJH1Aptm` | ~49 MB (partial) |

> IDs for 2014–2023 were captured too; see that session's `scratchpad/folderview.html` if needed.

---

## 1. OE's real schema

**Format:** one flat CSV per year, UTF-8, with a header. **164 columns** in 2025.
**Schema drift:** the **2026 file has 165 columns** — it adds `firstPick` (0/1, did the team pick
first?) between `teamid` and `champion`. Conclusion: the column set **grows over the years** (recent
seasons also added `void_grubs`, `atakhans`, `turretplates`, etc.; older years have fewer columns).
The loader **cannot** assume a fixed header — read columns by name and tolerate missing ones.

### Row structure — CRITICAL

**12 rows per game** = **10 players + 2 team rows**, distinguished by `participantid`:

- `participantid` **1–5** → **Blue** side players (`position` = `top, jng, mid, bot, sup`).
- `participantid` **6–10** → **Red** side players (same 5 positions).
- `participantid` **100** → Blue **team** row; **200** → Red team row. On these rows
  `position = 'team'`, `playername` and `playerid` are **empty**, and the metrics are **team
  aggregates** (kills = total team kills, `totalgold`/`goldat15`/`damagetochampions` = team sum,
  `total cs` comes back empty on the team row, etc.). Bans and objectives (`dragons`, `barons`,
  `towers`, `firstblood`…) only make sense at team level.

**How to filter team rows:** `position = 'team'` **⇔** `participantid IN ('100','200')`. Verified: in
the sample, 100% of the 270 team rows have empty `playername`/`playerid`.

**Careful (12 is not guaranteed):** some games have missing rows (found an LEC game with **7 rows**,
participantids 1–7, no team rows). Aggregate by `gameid` without assuming fixed cardinality.

### Columns (grouped). Fields that matter to us marked with ★

**Game identity / context**
- ★`gameid` — game id. **Mostly the Riot platform game id** (`LOLTMNT03_179647`, `LOLTMNT06_96134`),
  which is exactly the format of **Leaguepedia `ScoreboardGames.RiotPlatformGameId`** → **the join/dedup key**.
  But **some** are OE-internal ids (`11715-11715_game_1`) for leagues without a platform id → those do **not** join.
- `datacompleteness` — `complete` | `partial`. **`partial`** (very common in the **LPL**) = detailed
  stats missing (economy/timings come back null; kills/deaths/assists are present). Filter/segment on this.
- `url` — link to the match source (sometimes empty).
- ★`league` — league string (see §2). ★`year` (int). ★`split` — `Winter`, `Spring`, `Summer`, `Split 1`,
  `Kickoff`, `Cup`, `Playoffs`… ★`playoffs` — 0/1. ★`date` — `YYYY-MM-DD HH:MM:SS` (UTC).
- `game` — map number within the series (Bo). `patch` — e.g. `15.01`.
- ★`participantid`, ★`side` (`Blue`/`Red`), ★`position` (`top/jng/mid/bot/sup/team`).

**Player / team identity**
- ★`playername` — the handle shown in that game (may be an old alias).
- ★`playerid` — **OE's stable native id**: `oe:player:<hash>` (survives handle changes). Empty on team rows.
- ★`teamname` — team name. ★`teamid` — `oe:team:<hash>` (OE's stable native id).
- `champion` (the player's); `ban1..ban5`, `pick1..pick5` (team level).

**Result and combat**
- ★`gamelength` (seconds), ★`result` (0/1 = loss/win), ★`kills`/`deaths`/`assists`,
  `teamkills`/`teamdeaths`, `doublekills…pentakills`, `firstblood*`, `team kpm`, `ckpm`.

**Objectives (team level):** `firstdragon`, `dragons`, `opp_dragons`, `elementaldrakes`, `infernals/
mountains/clouds/oceans/chemtechs/hextechs`, `dragons (type unknown)`, `elders`, `firstherald`/`heralds`,
`void_grubs`, `firstbaron`/`barons`, `atakhans`, `firsttower`/`towers`, `firstmidtower`,
`firsttothreetowers`, `turretplates`, `inhibitors` (plus their `opp_*`).

**Damage / vision / gold**
- `damagetochampions`, `dpm`, `damageshare`, `damagetakenperminute`, `damagemitigatedperminute`, `damagetotowers`.
- `wardsplaced`/`wpm`, `wardskilled`/`wcpm`, `controlwardsbought`, `visionscore`/`vspm`.
- `totalgold`, `earnedgold`, `earned gpm`, `earnedgoldshare`, `goldspent`, `gspd`, `gpr`.
- `total cs`, `minionkills`, `monsterkills`, `monsterkillsownjungle`, `monsterkillsenemyjungle`, `cspm`.

**Per-timing economy (★ the big thing Leaguepedia does not have)** — for `@10/@15/@20/@25`:
- ★`goldat{N}`, ★`xpat{N}`, ★`csat{N}`, `opp_goldat{N}`/`opp_xpat{N}`/`opp_csat{N}`,
  ★`golddiffat{N}`, `xpdiffat{N}`, `csdiffat{N}`,
  ★`killsat{N}`, `assistsat{N}`, `deathsat{N}` (plus `opp_*`).

**Problematic naming (breaks the "column == field verbatim" invariant):** several columns contain
**spaces** (`team kpm`, `total cs`, `earned gpm`) or **parentheses** (`dragons (type unknown)`), and
many carry an `opp_` prefix. SQLite accepts them quoted, but a **curated rename layer** is preferable (see §3).

### Mapping OE → the fields we already use (scoreboard_players)

| Our field (Leaguepedia) | OE | Note |
|---|---|---|
| `Link` (identity) | `playerid` (`oe:player:…`) | different identity spaces → §4 |
| `Name` | `playername` | in-game handle |
| `Champion` | `champion` | map irregular names |
| `Kills/Deaths/Assists` | `kills/deaths/assists` | direct |
| `Gold` | `totalgold` (or `earnedgold`) | decide which |
| `CS` | `total cs` (or `minionkills+monsterkills`) | direct |
| `DamageToChampions` | `damagetochampions` | direct |
| `VisionScore` | `visionscore` | direct |
| `Role` | `position` (`top/jng/mid/bot/sup`) | normalize to `Top/Jungle/Mid/Bot/Support` |
| `Side` | `side` (`Blue/Red` → 1/2) | |
| `Team` | `teamname` | |
| `TeamKills` | `teamkills` | |
| `PlayerWin` (`Yes/No`) | `result` (1/0) | translate |
| `GameId`/`RiotPlatformGameId` | `gameid` | join key, §5 |

OE **covers every** field we use today **and adds** per-timing economy, objectives, vision and damage
that Leaguepedia's `ScoreboardPlayers` does not expose.

---

## 2. Coverage (leagues and years)

- **Years: 2014 → 2026** (13 files). Leaguepedia's international data starts in 2011, so the two
  sources are symmetrically complementary: OE covers regional play from 2014; Leaguepedia covers the
  old internationals (2011–2013) that OE lacks.
- **Leagues (confirmed in the real 2025 sample):** `LPL`, `LCK`, `LCKC` (LCK Challengers, KR tier-2),
  `LEC`, `LCP` (the new 2025 APAC league), `LFL2` (French 2nd div), `LVP SL` (Spanish SuperLiga),
  `NLC` (Nordics/UK)… and per OE's own documentation plus web search also: `LTA`/`LTA N`/`LTA S`,
  `CBLOL`, `CBLOLA`, `LLA`, `LDL`, `PCS`, `VCS`, `LJL`, `LCO`, `TCL`, `LFL`, `PRM`, `Ultraliga`,
  `Hitpoint`, `Elite Series`, `Arabian League`, `EWC`/internationals (`MSI`, `Worlds`), academies,
  etc. → **OE covers tier-1, tier-2 and many secondary leagues**.
- **What about LLA?** Yes, with a naming wrinkle: **LLA existed as its own league ~2019–2024**. From
  **2025** Riot merged NA/LatAm/Brazil into **LTA**: `LTA N` (North America) and `LTA S`
  (LatAm+Brazil). So looking up LatAm records means `LLA` (historical) **+** `LTA S` (2025+). Same
  story for `LCS` → `LTA N`.
- **Uneven completeness:** `datacompleteness = partial` is common in the LPL (no timings), and tier-2
  leagues may lack per-timing economy entirely. Economy leaderboards must require `datacompleteness='complete'`.

---

## 3. Mapping onto the medallion model (bronze → silver → gold)

**Bronze:** keep each raw yearly CSV (gzip) in `data/raw/oe/<year>.csv.gz`, same rationale as the Cargo
pulls (rebuild silver without re-downloading). Record the file's `modifiedTime`/date in `etl_meta`.

**Silver:** one (or two) new tables with **columns = OE names** (honoring the verbatim spirit), **but**
with a **documented exception**: OE ships names with spaces/parentheses, so the `TableSpec` needs a small
**rename map** (e.g. `"team kpm"→team_kpm`, `"total cs"→total_cs`,
`"dragons (type unknown)"→dragons_unknown`). This **breaks** the current "the loader inserts without
mapping" rule (Cargo had clean names); it is a deliberate, bounded deviation.

Recommendation: **split by row type at load time** (cleaner than one wide table full of nulls):
- `oe_player_games` — rows where `position != 'team'` (curated column subset: identity + KDA +
  economy/timings we want to expose). Grain: `gameid + participantid`.
- `oe_team_games` — rows where `position = 'team'` (objectives, team gold, result). Grain: `gameid + side`.

There is no need to materialize all 164 columns: pick a **subset** (identity, core KDA,
`goldat/xpat/csat/…diff`, `damageshare`, `visionscore`, `cspm`, team objectives) and leave the rest in
bronze in case more boards are added later.

Plus an **identity crosswalk** table (see §4): `oe_player_map(oe_playerid, link, method, confidence)`
and `oe_team_map(oe_teamid, lp_team)`.

**Gold it feeds / creates:**
- `player_career_stats`: **new scopes** — `regional_tier1`, `regional_tier2`, and maybe
  `all_competitive` (international + regional). *Design decision:* keep the current `all` scope =
  **international only** (so the meaning of existing records does not change) and add the new scopes
  alongside. **Open** (§8).
- `leaderboards`: new boards enabled by OE — **regional** KDA/kills/win-rate (huge samples), and
  unprecedented **economy boards**: best average `golddiffat15`, `csat10`, `goldat15`, etc.
  Adding each one = touch `aggregate.py` **and** `STAT_CATALOG` (`web/lib/stats.ts`).
- `champion_stats` / `player_champions`: optionally an "all-competitive" version with a much larger
  sample (keeping the international one separate).
- `records` (headline): **unchanged** — still premier only (Worlds/MSI/First Stand).
- `player_index` / `player_titles` / `player_teams`: OE contributes **no** titles, rosters or bios
  (see §6); it can contribute regional `games` and extra teams for the history timeline.

---

## 4. Identity reconciliation (the hard part)

Two **independent** identity systems, with no crosswalk provided:
- **Leaguepedia:** canonical `Link` = `Players.OverviewPage`; aliases via `PlayerRedirects.AllName → OverviewPage`.
- **OE:** canonical `playerid` = `oe:player:<hash>` (stable across handle changes); `playername` = the
  in-game handle. Teams: `oe:team:<hash>` vs `teamname`.

**Two-track strategy:**

**A) Overlapping games (internationals, and any regional games Leaguepedia also has) → join by game id.**
`OE.gameid == Leaguepedia ScoreboardGames.RiotPlatformGameId`. Within a matched game, **align by
`(side, position)`**: OE's `top`/`Blue` is Leaguepedia's `top`/`Blue`, so the pair
`oe:player:<hash> ↔ Link` is derived **without matching names** (robust, immune to aliases). Same for
teams by `side`. Accumulate these pairs across **all** overlapping games and keep the **majority vote**
per `oe:playerid` (absorbing side/observer errors). This **builds the crosswalk automatically** and is
the strong part of the design.

**B) Players/teams only in OE (regional leagues Leaguepedia does not cover, or games with no platform
id) → native identity + name fallback.** Canonical key = `oe:playerid`. Try to resolve to Leaguepedia
via `playername → PlayerRedirects.AllName → OverviewPage`, disambiguating by team/season/residency.
Whatever does not match stays **OE-native** (no Leaguepedia bio/photo, see §6).

**Risks:**
- **Handle changes:** mitigated by keying on the stable ids (`oe:player`, `Link`), not the handle.
- **Name ambiguity** on track B (reused handles, different romanizations): name matching is fragile →
  fallback only, flag `confidence`, and always prefer track A.
- **Collisions / data errors** (sides loaded wrong, smurfs, missing rows like the 7-row game): track
  A's majority vote absorbs them; log conflicts.
- **One `oe:playerid` ↔ several `Link`s** or vice versa (page merges/splits on Leaguepedia): resolve by
  majority and keep an exceptions table for manual review.

> **What was actually built** (`etl/oe_ingest.py`): track A, but aligned by **`(normalized gameid,
> champion)`** instead of `(side, position)` — the champion uniquely identifies a player within a game
> in either source, which sidesteps each source's side/role encoding entirely. 824 international
> players mapped, only 2 ambiguous. Track B's name fallback was not needed and is not implemented:
> OE-only players simply get `link = NULL`.

---

## 5. Dedup (do not double-count games)

Leaguepedia **already** has every international (Worlds/MSI/First Stand) and OE ships them too. Without
dedup, each international game would be counted twice.

- **Dedup key:** the **Riot platform game id**. On Leaguepedia it is `ScoreboardGames.RiotPlatformGameId`
  (already indexed: `idx_sg_riotpgid`); on OE it is `gameid` (when it has the platform format).
- **Rule:** when loading OE, if `OE.gameid` matches a `RiotPlatformGameId` already present in
  `scoreboard_games`, that game is a **duplicate** → **Leaguepedia is authoritative** for it (it already
  drives tiers/titles/headline records). Options: (a) do not load those OE rows into the aggregated
  facts, or (b) load them into the OE table but **exclude them from the aggregates** that already count
  the Leaguepedia version. Career/leaderboard aggregation must **count each game exactly once** (dedup
  by platform id in the `COUNT(DISTINCT …)`).
- **Cases with no platform id** (`11715-11715_game_1`): they cannot collide by id; and if the league is
  not in Leaguepedia either, there is no duplicate risk. Should an overlap ever occur without a shared
  platform id, fall back to a `(date, teams, gamelength)` heuristic — unlikely and low impact.

---

## 6. Tiers and Legacy Score

- **A new, non-premier tier.** Today `classify_tier` derives the tier from Leaguepedia's **Tournaments**
  table (`intl_premier / intl_legacy / regional_playoffs / regional_regular / exhibition`) and — an
  important detail — the current dataset **only has internationals**, so the regional tiers exist in
  code but are **empty**. OE is what will populate them, but an OE game's tier has to be derived from
  **`OE.league` + `OE.playoffs`**, not from Tournaments. That needs an **OE branch** in the
  classification: a `league → (region, tier)` map (e.g. `LCK/LPL/LEC/LTA*/LLA/CBLOL/PCS/VCS/LJL →
  regional_tier1`; `LCKC/LDL/LFL*/NLC/LVP SL/… → regional_tier2`), plus `playoffs` to separate regular
  season from playoffs.
- **Headline records untouched:** `records` and the bulk of the ranking weight stay **premier**.
  Stage greatness does not get diluted by regional volume.
- **Legacy Score:** OE contributes **games**, not **titles/placements** (see below), so the score's
  `titles` component does **not** change from OE alone. Implications/decisions:
  - `longevity` (0.5 per international game) — do **not** feed regional games into it, or create a
    separate regional component with a far smaller weight (so players from minor leagues do not get
    inflated past international legends).
  - `performance` (elite international KDA) — keep it **international**.
  - **Regional titles** (e.g. LCK Spring champion) do **not** come from OE directly: OE has no
    placements/winners table, so they would have to be **derived** from the last playoff game per split
    (winner) or keep coming from Leaguepedia `TournamentResults`. Suggested v1: **international-only
    Legacy Score**; regional titles/achievements as a **separate** metric, not inside the headline
    score. **Open** (§8).
- **OE does not replace Leaguepedia for:** bios (`Country`, `Birthdate`, canonical role, `Image`/photo),
  rosters (`tournament_players`), placements/champions (`tournament_results`), name redirects. All of
  that stays Leaguepedia. OE is **additive**: game volume + economy + regional coverage.

---

## 7. License / attribution

- OE is distributed **free** for community use (analysts, casters, fans) by **Tim "Magic" Sevenhuysen**
  (oracleselixir.com). Requirement: **credit Oracle's Elixir / Tim Sevenhuysen**.
- The underlying game statistics are **Riot Games' property**; use must respect Riot's terms (fan use,
  unofficial, unaffiliated). Do not resell the data or present it as a product competing with OE.
- **Already covered in the repo:**
  - Footer: `web/app/layout.tsx` (lines 52–53) — *"Data from Leaguepedia (CC BY-SA 4.0) · Oracle's
    Elixir (Tim Sevenhuysen) · A fan project, not affiliated with Riot Games."*
  - `etl/config.py::ATTRIBUTION["oracles_elixir"]` = *"Data courtesy of Oracle's Elixir (Tim Sevenhuysen)"*.
- **Action:** when integrating, link `oracleselixir.com` from the footer and, if economy stats are
  shown, state the source per datum. Confirm the current terms on the downloads page (they are
  good-faith terms, not a formal CC-style license).

---

## 8. Implementation plan and decisions

### Steps

1. **Ingest / bronze.** Sort out reliable CSV access (anonymous download is rate-limited, see §0).
   Download the desired years, store gzip in `data/raw/oe/`, record the file date in `etl_meta`.
2. **Silver.** An OE `TableSpec` with a rename map (§3); a loader that **splits rows** into
   `oe_player_games` / `oe_team_games`, coerces numerics, translates `result→PlayerWin`, `side→1/2`,
   `position→Role`. Tables + indexes in `db/schema.sql` (by `gameid`, `playerid`, `teamid`, `league`).
3. **Identity crosswalk.** A job that walks the overlapping games (`gameid == RiotPlatformGameId`),
   builds pairs by `(side, position)`, takes a majority vote → `oe_player_map` / `oe_team_map`. Name
   fallback for OE-only players.
4. **OE tiers.** A `league → (region, tier)` map + `playoffs`; extend `classify_tier` with an OE branch.
5. **Dedup.** Flag OE games whose `gameid` already exists as a `RiotPlatformGameId`; exclude them from aggregates.
6. **Gold.** New scopes in `player_career_stats`, regional + economy leaderboards, (optionally) an
   all-competitive `champion_stats`. Touch `STAT_CATALOG` to expose them.
7. **Web.** New tabs/filters (international vs regional vs all-competitive), new economy boards, OE credit.
8. **Verification.** Run a league/year slice, check the counts and spot-check a known player (his
   international KDA must not move, and his regional games must show up).

Steps 1–3 are **done** (`etl/oe_ingest.py`; see the note in §4 on how the crosswalk actually works).
Step 4 became the league allowlist below. Steps 5–8 are the remaining work.

### Decisions (all six open questions are now settled)

1. **Data access** — resolved manually: the 13 per-year CSVs (2014-2026, 790 MB) live in
   `data/raw/oe/` (gitignored). No automated download; a refresh means dropping in the new CSV.
2. **Which leagues** — a curated allowlist, `config.OE_LEAGUES`, materialized into the
   `oe_leagues` dimension table (see below). 25 league codes / 37.9k games — 38% of OE's 99k.
3. **`all` scope semantics** — unchanged: `all` stays international (Worlds/MSI/First Stand from
   Leaguepedia), so no existing record moves. Regional data lands in NEW scopes.
4. **Legacy Score** — international-only. Regional titles and longevity do NOT feed it.
5. **Economy scope** — GD@15, gold@15, CS/min, computed over `datacompleteness='complete'` games
   only, gated by `config.OE_MIN_COMPLETE_GAMES`. Plus a pentakills record (OE-only).
6. **Time range** — full 2014-2026 backfill, already loaded.

### The league allowlist (`config.OE_LEAGUES` → `oe_leagues`)

OE ships 122 league codes, mostly academy (LDL, LCKC, CK, NACL, LCSA) and ERL (LFL, PRM, NLC, EM)
tiers that do not belong in a records almanac. The allowlist keeps the top-level league of each
major region and **chains renames** under a stable `region` key, so a career reads continuously
across rebrands:

| Region | OE league codes |
|---|---|
| Korea | `OGN` (2015) → `LCK` (2016-) |
| China | `LPL` (2016-) |
| Europe | `EU LCS` (2014-18) → `LEC` (2019-) |
| North America | `NA LCS` (2014-18) → `LCS` (2019-24, 2026) → `LTA N` (2025-) |
| Latin America | `CLS`+`LLN` (2016-18) → `LLA` (2019-24) → `LTA S` (2025-) |
| Brazil | `CBLOL` (2015-) |
| Americas | `LTA` (2025 cross-conference championship) |
| Pacific | `LMS` (2015-19) → `PCS` (2020-) · `LCP` (2025-) |
| Vietnam · Japan · Turkey · Oceania | `VCS` · `LJL` · `TCL` · `OPL`→`LCO` |
| International (secondary) | `EWC`, `IEM`, `IWCI` |

The last row is scope `intl_secondary`: real international events the Leaguepedia backfill does not
cover, kept apart from premier and excluded from the Legacy Score. The 2020 **Mid-Season Cup**
(`MSC`) is deliberately NOT in the list — `'mid-season cup'` is in `EXHIBITION_SUBSTRINGS`, so
Leaguepedia-sourced data already treats it as an exhibition; including it would contradict that.

The allowlist is a dimension table rather than an ingest-time filter on purpose: the silver layer
stays faithful to the source, so revising the list is a `--no-load` re-run, not a 790 MB re-ingest.

### Two traps found while building it

- **`partial` means no timings AND no multikills.** Kills/deaths/assists/damage/gold/CS totals are
  all present; `goldat10/15`, the `*diffat*` columns and `pentakills` are NULL. The **LPL has no
  timings at all from 2022 on** (0% complete), and LDL/LSPL/DCup are mostly partial. So partial
  games still count for appearances/KDA/win rate but are invisible to the economy leaderboards and
  the pentakills record — hence the min-games gate plus a coverage note in the UI.
- **The pre-2019 `LCS`/`LEC` rows are not league games.** They are the Worlds regional finals /
  gauntlets (4 teams, 8-14 games a year), which OE labels with the modern league code. Leaguepedia
  carries the same games under `League='World Championship'` with a regional `Region`. 286
  allowlisted OE games overlap Leaguepedia this way (LEC 98, LCK 75, LCS 56, LMS 45, OGN 12) — the
  gold layer must exclude them from OE aggregation by `gameid_norm`, or they double-count.

---

### Appendix — facts verified against real 2025 data (~1,600-row sample)

- 164 columns (2025) / 165 (2026, adds `firstPick`).
- 12 rows/game = 10 players (`participantid` 1–10) + 2 teams (100/200, `position='team'`, no playerid).
- Leagues in the sample: LPL, LCK, LCKC, LEC, LCP, LFL2, LVP SL, NLC.
- `datacompleteness`: `complete` vs `partial` (LPL partial, no timings).
- `gameid` mostly a Riot platform id (`LOLTMNT03_179647`) — joins with `RiotPlatformGameId` — but some
  are OE-internal ids (`11715-11715_game_1`).
- `playerid`/`teamid` stable (`oe:player:…`, `oe:team:…`); on team rows `playername`/`playerid` are empty.
- Cardinality not guaranteed: found an LEC game with 7 rows.
</content>
</invoke>
