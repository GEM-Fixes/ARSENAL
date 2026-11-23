# testplan: test every recent change of a mod (contract, version 1)

Code name testplan. One document (`plan.json`) says what a mod changed, which test rows that makes, how each row is tested
(without a game, by a game run, or by the player), and what each row's result is. Games: as64, mowas2, goh.
Reads the game and the mod; writes only to `--out`, to `--state`, and nothing else. Starts no game (the runners do).
GUI: page `testplan` (tools/gui/ext/testplan) and the pair picker on the core Test Run page; both under Test, Share & Play > Test Run.

Builders: this file is frozen. A gap or a contradiction goes into your report (`contract:` lines), not into another part's file.

## Words
- stack: game dir + exe word (`as64` | `mowas_2` | `goh`; `mowas2` accepted and mapped) + mods (mount list) + the mod under test (`folder`).
- item: one thing the mod changed or that depends on a change (an entity, a weapon, a model, a card ...).
- row: one check of one item. Stable id. A row is tested one way (`how`).
- state dir: `<mod>/.arsenal/testplan/` by default, `--state <dir>` overrides (the GUI passes one for a mod it may not write into).

## Parts and owners (one builder each; a part writes only its own files)
| part | files | exports |
|---|---|---|
| changes | lib/changes.js, lib/state.js, test/changes.test.js | changes, state |
| items | lib/items.js, test/items.test.js | items |
| rows | lib/catalog.js, lib/rows.js, lib/checklist.js, test/rows.test.js | catalog, rows, checklist |
| emit | lib/emit.js, lib/pairs.js, test/emit.test.js | emit, pairs |
| verdict | lib/static.js, lib/results.js, test/verdict.test.js | static, results |
| cli | testplan.js, lib/stack.js, test/run.sh, test/cli.test.js, test/fx/** (fixture mod and fake game, made by test/mkfx.js) | CLI |
| page | tools/gui/ext/testplan/** | GUI page + routes |
| picker | tools/gui/page.js (screenTest only), tools/gui/lang/*.json (new keys only), tools/gui/test/*.js | Test Run page |

Every lib file is `'use strict'`, CommonJS, no dependency outside node and this repo, no sync work at require time.
Other tools are used through their exports where they have them (overdiff.check, conflicts.check, entityindex, lib/modtree, lib/vfs, lib/games,
edrun/pack.js, edrun/preflight.js, prove/batch.js, firecheck, logtriage.check, milint.check, bootcheck, preloadsweep) and as a child process where they do not
(refcheck, check, lnglint, statsheet --units-json). A child process gets `--exe` for a stack that is not as64. Never edit another tool.
Each part's test builds its own small inputs in a scratch dir given as argv[2] (or os.tmpdir), needs no game install, prints `<n> passed, <m> failed`, exits 1 on a fail.
Each test holds at least one seeded defect (a wrong input that must be caught).

## lib/stack.js (cli part; every other part takes a `stack` object and never resolves one itself)
`stack.resolve({game, exe, mods, folder, state})` -> `{gameDir, exe:'as64'|'mowas_2'|'goh', gid:'as64'|'mowas2'|'goh', kind:'as2'|'goh', mods:[..], folder, name, state, canRun:{edrun:'run'|'dry'|'no', prove:'run'|'plan'|'score', sweep:'plan'}, why:{edrun,prove}}`
- canRun: as64 = edrun run, prove run. mowas2 = edrun dry, prove plan (TST-19). goh = edrun no, prove score (the GoH editor never starts the mission; no control pipe:, goh-drive.md).
- `stack.index(stack)` -> Promise of the entityindex `{idx, keys, src}` for the stack (cached by entityindex's own cache; one build per process).
- `stack.units(stack)` -> Promise of statsheet `--units-json` `.units` (child process; cached in `<state>/units.json` with the modtree stamp of areas set, entity; `[]` and a warning when it fails).
- gameDir may be empty: then only `changes` and the file-level parts of `items` work; everything else answers with `needsGame:true`.

## changes (lib/changes.js, lib/state.js)
`state.open(dir)` -> `{dir, read(name), write(name, obj), snapshot(tree), lastSnapshot(), ticks(), setTick(rowId, {v:'pass'|'fail'|'skip', note}), marks()}`; files `last.json` (snapshot), `ticks.json`, `history.json` (one line per `mark`), JSON, LF. `state.open` creates the dir on the first write only.
`changes.find(stack, {since})` -> Promise of
`{since, base:{kind:'last'|'time'|'git'|'vanilla'|'all', at, ref}, files:[{rel, state:'added'|'changed'|'removed', area, size, mtimeMs}], counts:{added,changed,removed}, notes:[..]}`
- `rel` = path inside the mod, forward slashes, as on disk (case kept); `area` = the lib/modtree area word (set entity map properties interface script text pak other).
- since `last` (default): compare lib/modtree's file list (size + mtime, then sha1 of the file when one differs) with the snapshot in the state dir. No snapshot yet: falls to `vanilla` and says so in notes.
- since `<N>h|<N>d|<ISO time>`: files whose mtime is newer. No removed files in this mode (note says so).
- since `git:<ref>` (also `git` = `git:HEAD`): `git -C <mod> diff --name-status <ref>` plus untracked files; refused with a plain message when the mod is not in a git work tree.
- since `vanilla`: every mod file that is new or differs from the game's own file of the same key (lib/vfs chain; overdiff.check gives the key-level detail into `notes` only).
- since `all`: every file of the mod, state `added`.
- a `.pak` in the mod: listed as one file (area pak) and, when it changed, its entries are diffed against the snapshot's entry list (lib/pak) and reported as `rel` = `<pak>!<entry>`.
- skips `.git`, `.arsenal`, links. Text compare ignores nothing (a CRLF change is a change).
`changes.mark(stack)` writes the snapshot of now (`last.json`) and a history line `{at, files, rowsPassed, rowsFailed, rowsOpen}`.

## items (lib/items.js)
`items.from(stack, changes, {deps:true})` -> Promise of `{items:[item], unmapped:[rel], notes}`
item = `{id, kind, key, name, cls, source:'changed'|'depends', why:[{rel, state}], via:[itemId], weapons:[stuffKey], carriers:[entityKey], cards:[{card, army, buyable}], file}`
- kind: `entity` (a .def and its folder), `model` (mdl ply vol anm and the textures a model names), `weapon` (set/stuff file with a weapon), `ammo`, `breed`, `squad`, `card` (set/multiplayer/units rows), `mission` (a map or .mi/.mission), `text` (.lng, GoH .pot), `interface` (icons, panels), `sound`, `script` (lua, interaction, .inc used by entities), `properties`, `other`.
- id = `<kind>:<key>` where key is the lower-case game path without `resource/` for a file item, the entity or stuff name for entity, weapon, ammo.
- cls for an entity: `vehicle` | `gun` | `human` | `static` | `other` (edrun/pack.js groupOfKey and classOf where a card exists; else the def folder: `-vehicle/` -> vehicle, `/cannon/` or card class gun, `humanskin/` or breed -> human, else static).
- deps (source `depends`): a changed model, texture, weapon, ammo, .inc or breed pulls in every entity (and every squad/card of a breed) that uses it through the index (`idx.usersOf`, `idx.models[..].refs`, extenders/inherits). `via` names the changed item. A changed entity pulls in its cards.
- weapons of an entity: index refs of kind weapon (vehicle, gun) and, for a human, the weapon items of its breed inventory. carriers of a weapon: the reverse.
- GoH: card ids carry the period (`mp/ger/early/tankman`), the vehicle is the first word of `{content}`; no bot rows.
- a file that maps to no item goes to `unmapped` and gets one `other` item per area so that it still gets rows.

## rows (lib/catalog.js, lib/rows.js)
`catalog.CHECKS` = list of `{id, title, kinds:[item kind], cls:[..]|null, how, tool, proves, limits:[row ids], games:{as64,mowas2,goh: how|'no'}, group}`; the table below is its content. `catalog.get(id)`.
`rows.build(stack, items, {only:[check ids], everything:false})` -> `{rows:[row], summary}`
row = `{id, code, item, check, how, runner, title, target:{entity, weapon, ammo, card, army, file}, expect, status:'todo', result:null, why, limits}`
- id = `<check>|<item id>[|<weapon>]`. code = `T-` + 5 chars base32 of sha1(id) (the short name people say and search).
- how: `static` (no game, now) | `run` (a game run; `runner` = edrun | prove | sweep) | `player` (only a person can judge). A `run` check whose game cannot run it becomes `player` with `why` (goh, and real runs on mowas2) and keeps `runner` as the dry or plan form where one exists.
- one fire row and one damage-out row per weapon of an entity (`|<weapon>` in the id), not one per entity: every gun fires, every gun does damage.
- everything:true ignores changes and makes rows for every entity and weapon of the mod (the caller passes items made from since `all`).
- status values: `todo`, `pass`, `fail`, `unproven` (ran, the log cannot tell: TST-47, TST-59, TST-112, TST-114), `void` (the run's control failed), `held` (preflight held it back), `skip` (player skipped), `na`.

Checks (id | item kinds | how | tool | what it proves):
| id | kinds | how | tool | proves |
|---|---|---|---|---|
| refs | entity model weapon ammo breed squad card | static | refcheck | every model, weapon, ammo, item, animation, sound, texture, fsm the item names exists in the stack |
| parse | every text file item | static | sdllint, binhdr (binary heads) | the file reads |
| load | entity model | static | check (wouldload) | the mod's load verdict for the exe; LIKELY_CRASH and REFUSED fail the rows of the named file |
| aim | entity (vehicle gun) | static | firecheck | the gun can aim (aim bone, MG swap) |
| faults | entity (vehicle gun human) | static | edrun preflight faultsIn | NOWEAPON NOBONE AMMO MORTARRANGE |
| card | card squad entity with a card | static | statsheet units | buyable, a price, a name text, crew breeds exist |
| text | text card | static | lnglint | keys read, no key lost |
| mission | mission | static | milint | the map and mission read |
| over | every changed file | static | overdiff, conflicts | what it replaces in the game and in the other mods of the stack (info, fail only on OVR_FILE_DELETED of a file something still names) |
| spawn | entity | run sweep/prove(spawn) | preloadsweep plan, prove --depth spawn, bootcheck spawn | the entity loads and appears in a match |
| move | entity vehicle | run prove(move) | prove --depth move | it drives |
| fire | entity x weapon | run edrun | edrun fo pair | the gun fires: fireProof muzzle or hit, shots > 0 |
| dmgout | entity x weapon | run edrun | edrun fo pair | the gun does damage: kill, or parts/damaged/hp on the foe |
| dmgin | entity | run edrun | edrun di pair | the model takes damage: it is the foe; parts break, it dies, a man loses health |
| crew | entity vehicle gun | run edrun | edrun task aiuse | crew boards and the gun is manned |
| log | the whole run | run | logtriage | no new error line in game.log of the run |
| sync | the mod | static | mpsync (as64 only) | multiplayer-safe |
| look | entity model | player | - | model, textures, wheels and tracks, wreck, in the right place and size |
| sound | weapon entity sound | player | - | shot, reload, engine, voice |
| anim | entity model | player | - | reload, recoil, walk, hatch (TST-121: a clean log proves load at most) |
| icon | card interface | player | - | buy menu icon, name and description, price shown |
| feel | weapon ammo | player | - | range, accuracy, penetration against the foe named in `expect` (TST-72: no shell-impact log) |
| play | mission script | player | - | the mission starts, the trigger or script does what changed |

## checklist (lib/checklist.js)
`checklist.build(plan, {lang:'en'})` -> `{sessions:[{id:'editor'|'skirmish'|'mission', title, setup:[steps], entries:[{row, code, item, do, look, expect, status}]}], counts}`
- every `player` row, every `run` row the game cannot run, and every row with status `fail` or `unproven` after a run (so the player rechecks it).
- grouped so that one setup serves many entries (one editor session per about 12 units, same army together); `do` and `look` are plain sentences built from the check and the target (unit name in game when the units list has it, id always), `expect` holds numbers from the units list (range, damage, penetration, crew, price).
- `checklist.md(list)` -> markdown with `- [ ] T-xxxxx ...` lines. Texts are English keys with `{}` slots in `lib/checklist.js` (`TEXT`), so the page can translate: each entry also carries `key` and `args`.

## emit (lib/emit.js) and pairs (lib/pairs.js)
`pairs.id(pair)` -> `P-` + 5 chars base32 of sha1(shooter|foe|dist|ammo|flags). `pairs.name(pair)` -> `fo_<shooter>__<foe>` / `di_<unit>__<shooter>` (edrun `name`, ASCII, unique in a file).
`pairs.describe(pair, units)` -> `{id, name, text:'T-34 (t34_0) fires at GAZ-67 (gaz67b) from 15 m', shooter:{id,name,army,cls}, foe:{..}, dist, flags}`.
`pairs.suggest(stack, {shooter, foe?, cls?})` -> Promise of a full edrun pair: crew from the card (pack.crewOf), foe by class (pack defaults: gaz67b, mp/ger/rifle; a heavy foe for a heavy gun), dist by class (edrun DIST; mindist when the gun needs more: TST-73, TST-74), `watch:true`.
`pairs.check(stack, pairs)` -> preflight result per pair (`{id, status, notes, warns}`), no game.
`pairs.lib(state)` -> `{list(), get(name), save(name, pairs), remove(name)}`: pair files in `<state>/pairs/<name>.json` (edrun pairs.json form, each pair also carries `id`, which edrun ignores).
`emit.write(stack, plan, {out})` -> Promise of `{out, files:[{path, kind, rows:[row ids]}], commands:[{id, how, runner, cmd, argv, dry:boolean, needsLaunch:boolean, rows}], notes}`
- edrun: fire, dmgout, dmgin, crew rows -> pairs by pack.buildPairs/packGames (7 pairs + a control per game) -> `<out>/edrun/g<n>.json`, a run list `<out>/edrun/run-list.md` for edrun-runlist, one command per game; as64 real (`needsLaunch`), mowas2 `--dry`. `--pipe "dbg_blast 1;dbg_health 1"` on fire and damage games. Each pair's `name` is recorded against its row ids in `<out>/map.json`.
- prove: spawn and move rows -> `--units a,b:human --depth spawn|move --tiny` lines by army, chunks of at most 12; as64 real, mowas2 `--plan`.
- sweep: spawn rows also -> a preloadsweep `plan` command with a names file (`<out>/sweep/names.txt`); for goh this is the only game step and its commands (modswitch, uidrive play) are printed as text for the player to start, `needsLaunch:false`, tag [T].
- goh: no edrun, no prove files. Those rows stay `player` (rows part) and go to the checklist.
- nothing is started here. A command is argv for `node`, relative to tools/.

## verdict (lib/static.js, lib/results.js)
`static.run(stack, plan, {only, onProgress})` -> Promise of `{rows:[{id, status, result:{tool, findings:[{file, line, code, msg, severity}], note}}], tools:[{tool, ms, ok, error}]}`
- one run of each tool for the whole plan, findings mapped to rows by file (and by entity name where the finding names one). A tool that cannot run (no game dir, GoH refusal) leaves its rows `todo` with a note; never a pass by silence.
`results.read(stack, plan, {out, dirs:[..]})` -> same row shape, from: edrun `report.json` (per pair through `<out>/map.json`), prove `report.json`/`result.json`, preloadsweep `read` output, bootcheck spawn, logtriage on the run's game.log.
- fire: pass = fireProof `muzzle` or `hit` or shots > 0 with shotsRead; noBlast guns and shots not read = `unproven`. dmgout: pass = kill counted, or proof in muzzle|damage|hp, or parts/damaged/hits > 0; NOKILL = `unproven` when the shooter is under the foe's class (TST-47), else `fail`. dmgin: the same on the di pair.
- a void game = `void`; a preflight hold = `held` with the status word; NOSPAWN and ERROR = `fail`; a control failure never fails a row.
`results.apply(plan, rowResults)` -> plan with statuses merged and `summary` recounted; a `tick` of the player wins over nothing: it sets only `player` rows and rows listed in the checklist.

## plan.json (the document; cli part assembles it)
`{v:1, tool:'testplan', made, stack:{gid, exe, gameDir, folder, name, mods, canRun, why}, changes, items, unmapped, rows, summary:{rows, byHow:{static,run,player}, byStatus:{..}, byCheck:{..}, items}, emitted:null|{..}, checklist:null|{..}, notes}`

## CLI (testplan.js)
`node tools/testplan/testplan.js <verb> <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [--state dir] [--out dir] [--since last|Nh|Nd|ISO|git[:ref]|vanilla|all] [--only check,check] [--json]`
- `changes` prints the change list. `plan` = changes + items + rows + checklist, writes `<out>/plan.json` (default out `<state>/run`), prints the summary. `--everything` = since all, every model and gun.
- `static` runs the no-game checks into the plan. `emit` writes the runner files and prints the commands. `read [--dirs a,b]` reads run reports into the plan.
- `list [--how h] [--status s] [--q words]` prints rows (code, status, check, item). `checklist [--md file]`. `tick <code> pass|fail|skip [--note text]`. `mark` records the snapshot (the mod as tested now).
- `pairs suggest --shooter a [--foe b]`, `pairs check <file>`, `pairs id <file>`.
- `--json` prints one JSON document on stdout and nothing else. exit 0 ok, 1 a row failed (static, read), 2 usage, 3 could not run. `--help` before anything is read (lib/help).

## GUI routes (page part; all through the CLI with `ctx.runTool`, results in the cache store keyed by game, mod, since; PERF.md part 1)
`POST /api/x/testplan/plan {mod, since, everything}` -> plan.json. `POST .../static` (bg job, progress). `POST .../emit` -> commands. `POST .../read`. `POST .../tick {code, v, note}`. `POST .../mark`.
`GET .../state?mod=` -> last mark, counts. `POST .../pairs/suggest {shooter, foe}`, `POST .../pairs/check {pairs}`, `GET|POST .../pairs/lib` (list, get, save, remove), `POST .../pairs/describe {pairs}`.
A game run is started by the existing `edrun` and `prove` contract commands (runCard / streamRun), with the pairs file and out dir from `emit`; the launch gate stays as it is.

## Changes
| n | what |
|---|---|
| 1 | `plan --in-game`: only rows a game run or the player answers (catalog how != static). The GUI page always passes it; file checks stay on Mods > Check & Fix |
| 2 | `static --check-json <file>`: reuse one `check --json` report; static runs check once, never each checker again |
| 3 | `map.json` of emit: `{pairs:{name:{id,game,rows}}, prove:{card:[rows]}, sweep:{name:[rows]}}` |
| 4 | `pairs describe <file>`: id + sentence per pair from the pair alone (no game read); distance in the sentence is metres (dist / 20) |
| 5 | changes: files under a dot folder of the mod (`.arsenal`, `.arsenal-undo`, `.git`) are never changes |
| 6 | GUI: a mod never marked as tested answers `since last` with the last week (`first:true` in the view); the whole mod is the choice `all` |
| 7 | GUI pair picker: unit search = units ext index of game + mod; a mod with no buy cards of its own (RobZ) searches the game units; other units by id or Browse (.def) |
| 8 | stack.units: a mod in `<game>/mods` goes into `--mods` in lower case (VFS-12) [T] |
