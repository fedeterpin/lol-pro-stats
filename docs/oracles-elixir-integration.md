# Integración de Oracle's Elixir (OE) — spike de diseño

> Documento de investigación/diseño. **No** se implementó ETL todavía. Objetivo:
> complementar la data internacional de Leaguepedia (Worlds/MSI/First Stand, 2011–2026)
> con la cobertura **regional / 2nd-tier** de Oracle's Elixir (LCK, LPL, LEC, LTA, LLA,
> CBLoL, PCS, VCS, LJL, ligas tier-2, etc.).

## 0. De dónde salió la data para este análisis

- Carpeta de Drive del usuario: `1gLSw0RLjBbtaNy0dgnGQDAZOHIgCe-HH` → **"OE Public Match Data"**,
  owner `tsevenhuysen@oracleselixir.com`. Es la **misma** carpeta que la web oficial de OE
  (`oracleselixir.com/tools/downloads`) enlaza para las descargas — verificado leyendo el bundle JS del sitio.
- Contiene un CSV por año: **2014 … 2026** (13 archivos). Nombre actual (sin sufijo de fecha):
  `<AÑO>_LoL_esports_match_data_from_OraclesElixir.csv`. Se actualizan **una vez por día**.
- **No se pudo bajar el CSV completo automáticamente**: la descarga anónima de Drive devuelve
  *"Quota exceeded"* (límite de descargas públicas de archivos populares) y el viejo bucket S3
  `oracleselixir-downloadable-match-data.s3-us-west-2.amazonaws.com` ya **no existe** (`NoSuchBucket`).
- **Sí** se obtuvo el esquema real y ~1.600 filas de muestra del archivo **2025** (y el header del **2026**)
  vía la integración de Google Drive autenticada (`get_file_metadata.contentSnippet` +
  `read_file_content`, que dejó ~1 MB de CSV crudo en el tool-results). Todo lo de abajo está
  **verificado sobre data real de 2025**, no de memoria.

File IDs de Drive (por si se quiere automatizar/pedir acceso):

| Año | File ID | Tamaño |
|-----|---------|--------|
| 2024 | `1IjIEhLc9n8eLKeY-yh_YigKVWbhgGBsN` | — |
| 2025 | `1v6LRphp2kYciU4SXp0PCjEMuev1bDejc` | ~79 MB |
| 2026 | `1hnpbrUpBMS1TZI7IovfpKeZfWJH1Aptm` | ~49 MB (parcial) |

> IDs 2014–2023 también capturados; ver `scratchpad/folderview.html` de la sesión si hacen falta.

---

## 1. Esquema real de OE

**Formato:** un CSV plano por año, UTF-8, con encabezado. **164 columnas** en 2025.
**Drift de esquema:** el archivo **2026 tiene 165 columnas** — agrega `firstPick` (0/1, ¿el equipo eligió
primero?) entre `teamid` y `champion`. Conclusión: el conjunto de columnas **crece con los años** (también
se agregaron `void_grubs`, `atakhans`, `turretplates`, etc. en temporadas recientes; los años viejos tienen
menos columnas). El loader **no puede** asumir un header fijo — hay que leer columnas por nombre y tolerar
faltantes.

### Estructura de filas — CRÍTICO

**12 filas por juego** = **10 jugadores + 2 filas de equipo**. Se distingue por `participantid`:

- `participantid` **1–5** → jugadores del lado **Blue** (`position` = `top, jng, mid, bot, sup`).
- `participantid` **6–10** → jugadores del lado **Red** (mismas 5 posiciones).
- `participantid` **100** → fila **de equipo** Blue; **200** → fila de equipo Red. En estas filas
  `position = 'team'`, `playername` y `playerid` están **vacíos**, y las métricas son **agregados del equipo**
  (kills = kills totales del equipo, `totalgold`/`goldat15`/`damagetochampions` = suma del equipo, `total cs`
  viene vacío en la fila team, etc.). Los bans y objetivos (`dragons`, `barons`, `towers`, `firstblood`…) sólo
  tienen sentido a nivel equipo.

**Cómo filtrar filas team:** `position = 'team'` **⇔** `participantid IN ('100','200')`. Verificado: en la
muestra las 270 filas team tienen `playername`/`playerid` vacíos al 100 %.

**Ojo (no es 12 garantizado):** aparecen juegos con filas faltantes (encontré uno de LEC con **7 filas**,
participantids 1–7, sin equipo). Hay que agregar por `gameid` sin asumir cardinalidad fija.

### Columnas (agrupadas). Campos clave para nosotros marcados con ★

**Identidad / contexto del juego**
- ★`gameid` — id del juego. **Mayoría = Riot platform game id** (`LOLTMNT03_179647`, `LOLTMNT06_96134`),
  que es exactamente el formato de **Leaguepedia `ScoreboardGames.RiotPlatformGameId`** → **clave de join/dedup**.
  Pero **algunos** son ids internos de OE (`11715-11715_game_1`) para ligas sin platform id → esos **no** joinean.
- `datacompleteness` — `complete` | `partial`. **`partial`** (mucho en **LPL**) = faltan stats detalladas
  (economía/timings vienen null; kills/deaths/assists sí están). Filtrar/segmentar por esto.
- `url` — link a la fuente del match (a veces vacío).
- ★`league` — string de liga (ver §2). ★`year` (int). ★`split` — `Winter`, `Spring`, `Summer`, `Split 1`,
  `Kickoff`, `Cup`, `Playoffs`… ★`playoffs` — 0/1. ★`date` — `YYYY-MM-DD HH:MM:SS` (UTC).
- `game` — nº de mapa dentro de la serie (Bo). `patch` — ej. `15.01`.
- ★`participantid`, ★`side` (`Blue`/`Red`), ★`position` (`top/jng/mid/bot/sup/team`).

**Identidad de jugador / equipo**
- ★`playername` — handle mostrado en ese juego (puede ser alias viejo).
- ★`playerid` — **id nativo estable de OE**: `oe:player:<hash>` (persiste aunque cambie el handle). Vacío en filas team.
- ★`teamname` — nombre del equipo. ★`teamid` — `oe:team:<hash>` (id nativo estable de OE).
- `champion` (del jugador); `ban1..ban5`, `pick1..pick5` (a nivel equipo).

**Resultado y combate**
- ★`gamelength` (segundos), ★`result` (0/1 = derrota/victoria), ★`kills`/`deaths`/`assists`,
  `teamkills`/`teamdeaths`, `doublekills…pentakills`, `firstblood*`, `team kpm`, `ckpm`.

**Objetivos (nivel equipo):** `firstdragon`, `dragons`, `opp_dragons`, `elementaldrakes`, `infernals/
mountains/clouds/oceans/chemtechs/hextechs`, `dragons (type unknown)`, `elders`, `firstherald`/`heralds`,
`void_grubs`, `firstbaron`/`barons`, `atakhans`, `firsttower`/`towers`, `firstmidtower`,
`firsttothreetowers`, `turretplates`, `inhibitors` (+ sus `opp_*`).

**Daño / visión / oro**
- `damagetochampions`, `dpm`, `damageshare`, `damagetakenperminute`, `damagemitigatedperminute`, `damagetotowers`.
- `wardsplaced`/`wpm`, `wardskilled`/`wcpm`, `controlwardsbought`, `visionscore`/`vspm`.
- `totalgold`, `earnedgold`, `earned gpm`, `earnedgoldshare`, `goldspent`, `gspd`, `gpr`.
- `total cs`, `minionkills`, `monsterkills`, `monsterkillsownjungle`, `monsterkillsenemyjungle`, `cspm`.

**Economía por timing (★ el gran valor agregado que Leaguepedia no tiene)** — para `@10/@15/@20/@25`:
- ★`goldat{N}`, ★`xpat{N}`, ★`csat{N}`, `opp_goldat{N}`/`opp_xpat{N}`/`opp_csat{N}`,
  ★`golddiffat{N}`, `xpdiffat{N}`, `csdiffat{N}`,
  ★`killsat{N}`, `assistsat{N}`, `deathsat{N}` (+ `opp_*`).

**Naming problemático (rompe el invariante "columna == campo verbatim"):** varias columnas tienen
**espacios** (`team kpm`, `total cs`, `earned gpm`) o **paréntesis** (`dragons (type unknown)`) y muchos
prefijos `opp_`. SQLite las acepta entre comillas, pero conviene una **capa de rename curada** (ver §3).

### Mapeo OE → campos que ya usamos (scoreboard_players)

| Nuestro campo (Leaguepedia) | OE | Nota |
|---|---|---|
| `Link` (identidad) | `playerid` (`oe:player:…`) | espacios de identidad distintos → §4 |
| `Name` | `playername` | handle del juego |
| `Champion` | `champion` | mapear nombres irregulares |
| `Kills/Deaths/Assists` | `kills/deaths/assists` | directo |
| `Gold` | `totalgold` (o `earnedgold`) | decidir cuál |
| `CS` | `total cs` (o `minionkills+monsterkills`) | directo |
| `DamageToChampions` | `damagetochampions` | directo |
| `VisionScore` | `visionscore` | directo |
| `Role` | `position` (`top/jng/mid/bot/sup`) | normalizar a `Top/Jungle/Mid/Bot/Support` |
| `Side` | `side` (`Blue/Red` → 1/2) | |
| `Team` | `teamname` | |
| `TeamKills` | `teamkills` | |
| `PlayerWin` (`Yes/No`) | `result` (1/0) | traducir |
| `GameId`/`RiotPlatformGameId` | `gameid` | clave de join §5 |

OE **cubre todos** nuestros campos actuales **y agrega** economía por-timing, objetivos, visión y daño que
Leaguepedia `ScoreboardPlayers` no expone.

---

## 2. Cobertura (ligas y años)

- **Años: 2014 → 2026** (13 archivos). Leaguepedia internacional arranca en 2011, así que hay complementariedad
  simétrica: OE cubre lo regional desde 2014; Leaguepedia cubre los internacionales viejos (2011–2013) que OE no tiene.
- **Ligas (confirmado en la muestra real 2025):** `LPL`, `LCK`, `LCKC` (LCK Challengers, tier-2 KR), `LEC`,
  `LCP` (nueva liga APAC 2025), `LFL2` (Francia 2ª div), `LVP SL` (SuperLiga España), `NLC` (Nordics/UK)…
  y por documentación de OE + búsqueda web también: `LTA`/`LTA N`/`LTA S`, `CBLOL`, `CBLOLA`, `LLA`, `LDL`,
  `PCS`, `VCS`, `LJL`, `LCO`, `TCL`, `LFL`, `PRM`, `Ultraliga`, `Hitpoint`, `Elite Series`, `Arabian League`,
  `EWC`/internacionales (`MSI`, `Worlds`), academies, etc. → **OE cubre tier-1, tier-2 y muchas secundarias**.
- **¿LLA?** Sí, pero con un matiz de naming: **LLA existió como liga propia ~2019–2024**. Desde **2025** Riot
  fusionó NA/LatAm/Brasil en **LTA**: `LTA N` (Norteamérica) y `LTA S` (LatAm+Brasil). O sea, buscar récords de
  la región LatAm significa `LLA` (histórico) **+** `LTA S` (2025+). Igual con `LCS` → `LTA N`.
- **Completitud desigual:** `datacompleteness = partial` es común en LPL (sin timings), y ligas tier-2 pueden no
  tener economía por-timing. Los leaderboards de economía deben exigir `datacompleteness='complete'`.

---

## 3. Mapeo al modelo medallion (bronze → silver → gold)

**Bronze:** guardar cada CSV anual crudo (gzip) en `data/raw/oe/<año>.csv.gz`, igual criterio que los pulls de
Cargo (poder reconstruir silver sin re-descargar). Registrar en `etl_meta` el `modifiedTime`/fecha del archivo.

**Silver:** una (o dos) tablas nuevas con **columnas = nombres OE** (respetando el espíritu verbatim), **pero**
con una **excepción documentada**: OE trae nombres con espacios/paréntesis, así que hace falta un pequeño
**rename map** en el `TableSpec` (p. ej. `"team kpm"→team_kpm`, `"total cs"→total_cs`,
`"dragons (type unknown)"→dragons_unknown`). Esto **rompe** la regla actual de "el loader inserta sin mapeo"
(Cargo tenía nombres limpios); es una desviación consciente y acotada.

Recomendación: **partir por tipo de fila en la carga** (más limpio que una tabla ancha con nulls):
- `oe_player_games` — filas `position != 'team'` (subset curado de columnas: identidad + KDA + economía/timings que
  querramos exponer). Grano: `gameid + participantid`.
- `oe_team_games` — filas `position = 'team'` (objetivos, oro de equipo, resultado). Grano: `gameid + side`.

No hace falta materializar las 164 columnas: elegir un **subset** (identidad, core KDA, `goldat/xpat/csat/…diff`,
`damageshare`, `visionscore`, `cspm`, objetivos de equipo) y dejar el resto en bronze por si se agregan boards.

Además una tabla de **crosswalk de identidad** (ver §4): `oe_player_map(oe_playerid, link, method, confidence)`
y `oe_team_map(oe_teamid, lp_team)`.

**Gold que alimenta / crea:**
- `player_career_stats`: **nuevos scopes** — `regional_tier1`, `regional_tier2`, y quizá `all_competitive`
  (internacional + regional). *Decisión de diseño:* mantener el scope `all` actual = **sólo internacional**
  (para no cambiar el significado de récords existentes) y agregar scopes nuevos aparte. **Abierto** (§8).
- `leaderboards`: nuevos boards habilitados por OE — KDA/kills/win-rate **regional** (muestras enormes),
  y **boards de economía** inéditos: mejor `golddiffat15` promedio, `csat10`, `goldat15`, etc.
  Agregar cada uno = tocar `aggregate.py` **y** `STAT_CATALOG` (`web/lib/stats.ts`).
- `champion_stats` / `player_champions`: opción de versión "all-competitive" con muestra mucho mayor
  (mantener la internacional separada).
- `records` (headline): **sin cambios** — siguen siendo premier (Worlds/MSI/First Stand).
- `player_index` / `player_titles` / `player_teams`: OE **no** aporta títulos ni rosters ni bios (ver §6);
  puede aportar `games` regionales y equipos adicionales al historial.

---

## 4. Reconciliación de identidad (lo más importante)

Dos sistemas de identidad **independientes**, sin crosswalk provisto:
- **Leaguepedia:** canónico `Link` = `Players.OverviewPage`; alias vía `PlayerRedirects.AllName → OverviewPage`.
- **OE:** canónico `playerid` = `oe:player:<hash>` (estable ante cambios de handle); `playername` = handle del juego.
  Equipos: `oe:team:<hash>` vs `teamname`.

**Estrategia en dos carriles:**

**A) Juegos que se solapan (internacionales, y regionales que Leaguepedia también tenga) → join por game id.**
`OE.gameid == Leaguepedia ScoreboardGames.RiotPlatformGameId`. Dentro de un juego matcheado, **alinear por
`(side, position)`**: el `top`/`Blue` de OE es el `top`/`Blue` de Leaguepedia → se deduce el par
`oe:player:<hash> ↔ Link` **sin matchear nombres** (robusto, inmune a alias). Ídem equipos por `side`.
Acumular estos pares sobre **todos** los juegos solapados y quedarse con el **voto mayoritario** por `oe:playerid`
(cubre errores de lado/observer). Esto **construye el crosswalk automáticamente** y es la parte fuerte del diseño.

**B) Jugadores/equipos sólo en OE (ligas regionales que Leaguepedia no cubre, o juegos sin platform id) →
identidad nativa + fallback por nombre.** Clave canónica = `oe:playerid`. Intentar resolver a Leaguepedia por
`playername → PlayerRedirects.AllName → OverviewPage`, desambiguando por equipo/temporada/residencia. Los que no
matchean quedan **OE-native** (sin bio/foto de Leaguepedia, ver §6).

**Riesgos:**
- **Cambios de handle:** mitigados por usar los ids estables (`oe:player`, `Link`) como clave, no el handle.
- **Ambigüedad de nombres** en el carril B (handles reusados, romanizaciones distintas): el match por nombre es
  frágil → sólo fallback, marcar `confidence` y preferir siempre el carril A.
- **Colisiones/errores de datos** (lados mal cargados, smurfs, filas faltantes como el juego de 7 filas):
  el voto mayoritario del carril A los absorbe; loguear conflictos.
- **Un `oe:playerid` ↔ varios `Link`** o viceversa (merges/splits de páginas en Leaguepedia): resolver por
  mayoría y dejar tabla de excepciones para revisión manual.

---

## 5. Dedup (no doble-contar juegos)

Leaguepedia **ya** tiene todos los internacionales (Worlds/MSI/First Stand) y OE **también** los trae. Sin dedup,
cada juego internacional se contaría dos veces.

- **Clave de dedup:** el **Riot platform game id**. En Leaguepedia es `ScoreboardGames.RiotPlatformGameId`
  (ya indexado: `idx_sg_riotpgid`); en OE es `gameid` (cuando tiene formato platform).
- **Regla:** al cargar OE, si `OE.gameid` coincide con un `RiotPlatformGameId` ya presente en `scoreboard_games`,
  ese juego es **duplicado** → **Leaguepedia es autoritativo** para él (ya driva tiers/títulos/récords headline).
  Opciones: (a) no cargar las filas OE de ese juego a los hechos que se agregan, o (b) cargarlas en la tabla OE pero
  **excluirlas de los agregados** que ya cuentan la versión Leaguepedia. La agregación de carrera/leaderboards debe
  **contar cada juego una sola vez** (dedupear por platform id al hacer el `COUNT(DISTINCT …)`).
- **Casos sin platform id** (`11715-11715_game_1`): no colisionan por id; si además la liga no está en Leaguepedia,
  no hay riesgo de duplicado. Si llegara a haber solapamiento sin platform id compartido, caer a una heurística
  `(fecha, equipos, gamelength)` — improbable y de bajo impacto.

---

## 6. Tiers y Legacy Score

- **Nuevo tier NO premier.** Hoy `classify_tier` deriva el tier del **Tournaments** de Leaguepedia
  (`intl_premier / intl_legacy / regional_playoffs / regional_regular / exhibition`) y — dato importante — el
  dataset actual **sólo tiene internacionales**, así que los tiers regionales existen en el código pero están
  **vacíos**. OE es lo que los va a poblar, pero el tier de un juego OE hay que derivarlo de **`OE.league` +
  `OE.playoffs`**, no del Tournaments. Hace falta un **branch OE** en la clasificación: un mapa
  `league → (region, tier)` (p. ej. `LCK/LPL/LEC/LTA*/LLA/CBLOL/PCS/VCS/LJL → regional_tier1`;
  `LCKC/LDL/LFL*/NLC/LVP SL/… → regional_tier2`), y `playoffs` para separar regular vs playoffs.
- **Récords headline intactos:** los récords (`records`) y el peso mayor del ranking siguen siendo **premier**.
  La grandeza "de escenario" no se diluye con volumen regional.
- **Legacy Score:** OE aporta **juegos**, no **títulos/placements** (ver abajo), así que el componente `titles`
  del score **no** cambia con OE por sí solo. Implicancias/decisiones:
  - `longevity` (0.5/partida internacional) — **no** tocar con partidas regionales, o crear un componente
    regional aparte con peso mucho menor (para no inflar a jugadores de ligas menores por encima de leyendas intl).
  - `performance` (KDA intl elite) — mantener **internacional**.
  - **Títulos regionales** (ej. campeón de LCK Spring) **no** vienen de OE directamente: OE no tiene tabla de
    placements/ganadores; habría que **derivarlos** del último juego de playoffs por split (winner) o seguir
    tomándolos de Leaguepedia `TournamentResults`. Decisión sugerida v1: **Legacy Score internacional-only**;
    títulos/logros regionales como métrica **separada**, no dentro del score headline. **Abierto** (§8).
- **OE no reemplaza a Leaguepedia para:** bios (`Country`, `Birthdate`, rol canónico, `Image`/foto), rosters
  (`tournament_players`), placements/campeones (`tournament_results`), redirects de nombres. Todo eso sigue siendo
  Leaguepedia. OE es **aditivo**: volumen de juegos + economía + cobertura regional.

---

## 7. Licencia / atribución

- OE se distribuye **gratis** para uso de la comunidad (analistas, casters, fans) por **Tim "Magic" Sevenhuysen**
  (oracleselixir.com). Requerimiento: **dar crédito a Oracle's Elixir / Tim Sevenhuysen**.
- Las estadísticas de juego subyacentes son **propiedad de Riot Games**; su uso debe respetar los términos de Riot
  (uso fan, no oficial, sin afiliación). No revender la data ni presentarla como producto competidor de OE.
- **Ya está cubierto en el repo:**
  - Footer: `web/app/layout.tsx` (líneas 52–53) — *"Data from Leaguepedia (CC BY-SA 4.0) · Oracle's Elixir (Tim
    Sevenhuysen) · A fan project, not affiliated with Riot Games."*
  - `etl/config.py::ATTRIBUTION["oracles_elixir"]` = *"Data courtesy of Oracle's Elixir (Tim Sevenhuysen)"*.
- **Acción:** al integrar, enlazar `oracleselixir.com` desde el footer y, si se muestran stats de economía, aclarar
  la fuente por-dato. Confirmar los términos vigentes en la página de descargas (son términos "de buena fe", no una
  licencia formal tipo CC).

---

## 8. Plan de implementación (alto nivel) y preguntas abiertas

### Pasos

1. **Ingesta / bronze.** Resolver el acceso confiable al CSV (la descarga anónima está rate-limiteada, ver §0).
   Bajar los años deseados, guardar gzip en `data/raw/oe/`, registrar fecha de archivo en `etl_meta`.
2. **Silver.** `TableSpec` OE con rename map (§3); loader que **parte filas** en `oe_player_games` /
   `oe_team_games`, coacciona numéricos, traduce `result→PlayerWin`, `side→1/2`, `position→Role`. Tablas +
   índices en `db/schema.sql` (por `gameid`, `playerid`, `teamid`, `league`).
3. **Crosswalk de identidad.** Job que recorre juegos solapados (`gameid == RiotPlatformGameId`), arma pares por
   `(side, position)`, vota mayoría → `oe_player_map` / `oe_team_map`. Fallback por nombre para OE-only.
4. **Tiers OE.** Mapa `league → (region, tier)` + `playoffs`; extender `classify_tier` con branch OE.
5. **Dedup.** Marcar juegos OE cuyo `gameid` ya está como `RiotPlatformGameId`; excluirlos de agregados.
6. **Gold.** Nuevos scopes en `player_career_stats`, leaderboards regionales + de economía, (opcional)
   `champion_stats` all-competitive. Tocar `STAT_CATALOG` para exponerlos.
7. **Web.** Nuevas pestañas/filtros (internacional vs regional vs all-competitive), nuevos boards de economía,
   crédito a OE.
8. **Verificación.** Correr un slice de una liga/año, chequear conteos y spot-check de un jugador conocido
   (que su KDA internacional no cambie y que aparezcan sus juegos regionales).

### Preguntas abiertas para el usuario

1. **Acceso a la data.** La descarga pública de Drive está bloqueada por quota y el bucket S3 murió. ¿Preferís
   (a) bajar los CSV a mano y ponerlos en `data/raw/oe/`, (b) compartir de nuevo/mirrorear la carpeta, o (c) que
   armemos un ingester que loguee con tu cuenta? Sin esto, el ETL de OE no puede automatizarse.
2. **¿Qué ligas incluir?** ¿Todas (incluye tier-2/academies → explota el volumen a millones de filas-jugador) o
   una **allowlist** curada (tier-1 + un puñado de tier-2 relevantes)?
3. **Semántica del scope `all`.** ¿Se mantiene `all` = internacional (no cambia récords existentes) y lo regional
   va en scopes nuevos, o querés un `all_competitive` que combine todo?
4. **Legacy Score / títulos regionales.** ¿El score headline queda **solo internacional** (recomendado), o querés
   que títulos/longevidad regionales sumen (con peso menor)? Si suman títulos regionales, hay que derivar campeones
   de playoffs (OE no los trae) o cruzarlos con Leaguepedia.
5. **Alcance de economía.** ¿Qué leaderboards de economía valen la pena (golddiff@15, CS@10, gold@15…)? Definen qué
   columnas materializar en silver.
6. **Rango temporal.** ¿Backfill completo 2014→2026 o arrancar con años recientes (2023–2026) para validar?

---

### Apéndice — hechos verificados sobre data real 2025 (muestra ~1.600 filas)

- 164 columnas (2025) / 165 (2026, agrega `firstPick`).
- 12 filas/juego = 10 jugadores (`participantid` 1–10) + 2 equipos (100/200, `position='team'`, sin playerid).
- Ligas en la muestra: LPL, LCK, LCKC, LEC, LCP, LFL2, LVP SL, NLC.
- `datacompleteness`: `complete` vs `partial` (LPL parcial, sin timings).
- `gameid` mayormente Riot platform id (`LOLTMNT03_179647`) — joinea con `RiotPlatformGameId` — pero algunos son
  ids internos de OE (`11715-11715_game_1`).
- `playerid`/`teamid` estables (`oe:player:…`, `oe:team:…`); en filas team `playername`/`playerid` vacíos.
- Cardinalidad no garantizada: encontrado un juego de LEC con 7 filas.
</content>
</invoke>
