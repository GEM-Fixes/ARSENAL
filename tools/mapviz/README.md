# mapviz (contract, frozen 2026-11-14)

Contract version: 4. Changes (section 11 says how a change is made; each version changes every cache key, section 8.2,
so no cached product of an earlier version is reused). R1 to R13 made version 2; R14 to R23 (rulings of 2026-11-14 after
wave B) make version 3; R24 and R25 record what was built under R16 and the wave B rules and change no contract version; R26 (2026-11-15, waves C and D) makes version 4:

| Date | Ruling | Section | What | Parts that must follow |
|---|---|---|---|---|
| 2026-11-14 | R1 | 1.2 | png.encode deflates at zlib level 6, not 9 (still deterministic, no time chunk) | MV-RAS (png.js); every golden that hashes PNG bytes |
| 2026-11-14 | R2 | 3.2, 4.4, 12 | an unknown version-2 ground type name: as64 and mowas2 engine id 0 (blocked), goh 15; note MAPKIT_TYPE_UNKNOWN | MV-KIT (doc, gtype grid); MV-WAT, MV-PAS read gtype 0 as blocked |
| 2026-11-14 | R3 | 3.2 | new note MAPKIT_PARSE_ERROR, one per map or .mi file the strict reader refuses | MV-KIT (doc, grids); page parts translate the code |
| 2026-11-14 | R4 | 3.2 | a .mi under a `single/` map is that mission's file: mode id = file stem, no MAPKIT_MODE_UNKNOWN, generic points | MV-KIT |
| 2026-11-14 | R5 | 3.2 | stack.hash formula written down (as built) | none |
| 2026-11-14 | R6 | 3.2, 12 | GoH engine type id = index in map.net types[] (as built, [I]) | none |
| 2026-11-14 | R7 | 12 | version 0 heights stay u16 (as built) | none |
| 2026-11-14 | R8 | 4.2 | a picture from a lattice grid: one pixel per lattice point, the cell frame (as built) | none (MV-R1 keeps the same frame for pic.l0) |
| 2026-11-14 | R9 | 1.2, 12 | raster exports, costField, contour levels, paths, sidecar made, info --json, hillshade (as built) | none |
| 2026-11-14 | R10 | 1.5, 1.9, 6.2, 7, 8.1, 8.2, 8.4, 12 | jobs as built: sizes, tiles.cut folder, clear and MV_BUSY, ms times, timeout code, --json, paint style kernel folders, locks/index | every part's product command accepts --json; MV-R1 (l0 with no --size) |
| 2026-11-14 | R11 | 1.6, 9.1 | edshot as built: preflight record, moveout(record), codes, flags, io, shapes; reg export through gamedir | page parts translate the edshot codes; MV-EDR builds on it |
| 2026-11-14 | R12 | 1.3, 1.4 | bc1 and scenecache as built: DXGI 82, 83 as BC5; source get, origin, entityModel; L.read null; codes; extras | none |
| 2026-11-14 | R13 | 9.4 | tests find installs through gamedir.js only; no env variable for MoW:AS2 or GoH | every part's tests |
| 2026-11-14 | R14 | 1.2, 12; design 3 | relief look as built: hillshade defaults main light 315 at 45 with fills 270, 360, 225 (weights 0.6, 0.15, 0.15, 0.1), z from relief, a fine and a coarse scale; shade meta key zFine (and weights, zAuto, flat, reliefDeg, smooth, block, coarse); heights extended past the map edge by odd reflection; a nodata height is flat (128); raster VERSION 2 (raster is VERSION 3 since R16, R24) | none (as built) |
| 2026-11-14 | R15 | 1.7, 5.3 | entcat as built: place(doc, catalog, links?) with notes as a non-enumerable array property; `entcat map --json` body.notes; fp kind 'none' with one point; several obstacle zones = one hull of kind 'poly' in objects.json; a part with no map record of its own takes the root's uid; no --mode = no mode records; extra entry fields; cover.band a string; crushBy = obstacles.reg costs; decals zMin = zMax = 0; catalog keys = lower-case def names; note ENTCAT_LINK_NESTED; the GoH whole-stack test runs only with MAPVIZ_SLOW=1 | MV-PG2 (objects: skip or dot 'none', uids may repeat); MV-R2 (decal heights) |
| 2026-11-14 | R16 | 3.2, 4.4, 1.1 | mapdoc/1 additive: entities[].link `{root, place}` and entities[].seats `{<place>: {unlinked, entity, def}}`, note MAPKIT_LINK_NESTED; with it, as built at the close: the height grid marks lattice points past the ground mesh as nodata (-32768; meta.offGround), heightAt drops nodata corners; mapkit VERSION 2 | MV-ENT (reads them, as built); rules/water and page height readers treat height nodata as no value (fix row) |
| 2026-11-14 | R17 | 1.8, 4.4, 5.3 | water and pass as built: BLOCKED_NOT_DEADLY check items carry cls; check items carry cells, area, box; profile class rows may carry chain[]; water.depth = round(W - h), negative on water-typed cells above W; masks, labels, checks and pass mask take a last argument o {tick}; water.drown meta.sources | MV-PG1 water part (as built); MV-PAS keeps the exports |
| 2026-11-14 | R18 | 1.1, 1.2, 1.8, 7 | progress: lib/raster slopeClass, regions, distance (and the other grid functions listed in 1.2) and lib/mapkit grids take o.tick(done, total), as built | none (as built) |
| 2026-11-14 | R19 | 1.9 | render as built: gap codes (RENDER_MATERIAL_BAD among them), the l1 sampling rules of the close (texture level from texel density, trilinear premix, file mips on AS2 and AS64, level 0 + box chain on GoH, o.mips, barycentric alpha, mirror edge fill to 64 u), --pool, stats | MV-R2, MV-R3 keep plan(), the frame and the sidecar |
| 2026-11-14 | R20 | 1.10 | page as built: the shell takes the pick request itself; visible = layer tick and group tick; V.relist(); addLayer source and tool; kit.b64; the permalink skips tool layers; the stage word list (a new stage name needs a key mapviz.shell.stage.<name>) | MV-PG2, MV-PG3, MV-PG4; every part that emits a new stage name |
| 2026-11-14 | R21 | 9.5 | page part reports live at tools/gui/ext/mapviz/REPORT-<builder>.json | page parts |
| 2026-11-14 | R22 | 1.2, 4.4, 6.2 | the pic.topo sidecar carries target, stackHash and mapHashes, read from the --in folders; job topo needs doc and grids | MV-JOB table (done) |
| 2026-11-14 | R23 | design 7 | decal size (L2a): px x 0.5859375 only when the sprite has no scale channel (PreScaleX, PreScaleY, Scale, ScaleX, ScaleY); otherwise px x the channels [I] | MV-R2 (L2a); entcat as built |
| 2026-11-14 | R24 | 1.2, 1.8, 1.9, 1.10, 4.2, 4.4, 5.6, 8.2, 8.5, 12 | built under R16, CONTRACT stays 3: part versions mapkit 2, raster 3, water 2, pass 2, render 2 (render is VERSION 4 since R25); a cell or pixel whose own south-west lattice point is height nodata is off ground (4.2): water.band 0, water.drown 0, water.depth nodata, pass 0 and cost -1, pic.topo and pic.l0 alpha 0; a shade mean uses only the corners that hold a height; hillshade fills nodata ring by ring before the blurs; meta.offGround on water.band, pass.<kind> and pic.l0 only when not 0, counts.offGround always in the water masks and pass mask counts; pass --in reads height.mvg beside gtype.mvg; the hover pack sends the header nodata; page: the job and products events, V.q('jobs'), the map form's user and key null, a permalink waits for its game, the layout style; the cache key gains a needs line and the manifest needVersions (every key of a job with needs changed once) | none (as built); MV-PG2 to MV-PG4 follow the page rules of 1.10; fix rows MAPVIZ_WAT_OFFGROUND, MAPVIZ_PAS_OFFGROUND, MAPVIZ_RENDER_L0_RIM |
| 2026-11-14 | R25 | 1.9, 1.10, 8.2 | built after R24, CONTRACT stays 3: render VERSION 3 (the l1 map-scale detail rule DETAIL, o.detail 'map' default or 'gpu') then 4 (pic.l1.json and the l1 stats carry detail, keep, detailTextures, detailChanged; approx keeps its meaning; `render l1 --detail map\|gpu`, a bad word or --detail on l0 or c0 exits 2); the jobs runner passes no --detail (map rule); c0 needs line render@4; page: the doc event `{key, ok}` and V.q('docBusy') (no layer, tile or mode-carrying part fetch while the document is read), V.q('jobs') and the job event carry args, one poll chain and one end event per job id, a need matches a running job only when its args fit, a shown page takes a game, folder or mod change in at once (old-context map reads and jobs rejected stale; a pick from the old context's list, mode buttons and part pick requests included, is dropped with the closed-map line and the new list is asked once), reads held only while hidden (a map-list read rejected stale on the show is asked once more), the base part asks its choice with no draw, the base and water part keys hold game and mod, a poll that fails with no 4xx status (no answer, a 5xx) is tried again up to 3 times in a row 1 s apart, then the job ends failed and the promise rejects with that poll's error (a 4xx ends it at once), 20 unknown poll states in a row end it failed too, every end that is not done says the jobFailed line before the reject, kit.tileBox (tiles snapped to whole pixels by their edges), addPanel name, the view-area layout with the job line at the stage bottom | none (as built); fix rows MAPVIZ_RENDER_DETAIL, MAPVIZ_RENDER_DETAIL_JOBS; MV-PG2 to MV-PG4 follow the page rules of 1.10 |
| 2026-11-15 | R26 | 1, 4.4, 6.1, 6.2, 8.2 | version 4, waves C and D built and not yet closed: CONTRACT 4 (every cache key changes once). New parts sight, cover, strong, paint, previews; new commands of pass (obstacles, travel, routes; VERSION 3) and render (l2, pack, l3, l4; VERSION 5); entcat VERSION 2 with solids, placeSolids, docForMode; 16 job rows (sight, view, cover, obstacles, travel, routes, strong, checks, l2, pack, l3, l4, staff, painted, recon, sketch); request fields phase, pose, light; page parts layers, objects, card, strong, checks, pictures, style, export. Their sections are NOT yet written into this file: until they are, the contract of these parts is the set of drafts*.md (a draft's "Late changes" section first; jobs.md wins on names) with the rulings and the built differences listed |

mapviz is the Map Viewer of the toolkit: map data readers, engine-true layers (water, passability, sight, cover),
pictures (topographic, realistic, painted styles) and the files a game loads as map previews, in AS64, MoW:AS2 and
Gates of Hell. This file freezes the formats and interfaces every part builds against. Behaviour (rules, thresholds,
algorithms) lives; this file cites its sections as "design N". The owner decisions in
design 0a are final. Where design.md and this file differ on a format, field name, path or number, this file wins; on
behaviour the design wins.

Words: target = the game id the page and the CLI use (as64, mowas2, goh). exe id = what vfs is given (as64, mowas_2,
goh). stack = the ordered mod list (last wins). map key = the map folder under resource/map/ (section 3.1). u = world
unit, 20 u = 1 m. cell = one map.net cell. product = a file a part writes into its --out folder. entry = one cache
folder (section 8).

Contents
- 1. Parts and owned paths
- 2. Common CLI flags and rules
- 3. mapdoc/1
- 4. Grid files (.mvg) and layer names
- 5. Data the page reads
- 6. Routes and the job protocol
- 7. Progress and cancel
- 8. Cache
- 9. Rules for every part
- 10. Fixture map
- 11. How this contract changes
- 12. Left open by wave 0

## 1. Parts and owned paths

| Part | Id | Wave | Owned paths | CLI name in mapviz.js |
|---|---|---|---|---|
| skeleton | coordinator | 0 | tools/mapviz/{mapviz.js, README.md, palette.json}, tools/mapviz/test/** (incl. fxmake.js, fxanswers.json), the folders below, tools/mapviz/lib/raster/{gridfile.js, png.js, test/gridfile.test.js} (written in wave 0, then MV-RAS's: bug fixes only, exports frozen), tools/gui/ext/mapviz/{index.js, README.md, test.js} | parts |
| mapkit | MV-KIT | A | tools/mapviz/lib/mapkit/** | mapkit |
| raster | MV-RAS | A | tools/mapviz/lib/raster/** | raster |
| bc1 | MV-BC1 | A | tools/lib/model/ddsenc.js, tools/lib/model/dds.js (BC5 decode only), tools/lib/test/model-ddsenc.test.js, tools/lib/test/model-dds-bc5.test.js | none (library) |
| scenecache | MV-SCN | A | tools/lib/model/scenecache.js, one optional field `o.source` in tools/lib/model/sceneload.js, tools/lib/test/model-scenecache.test.js | none (library) |
| jobs | MV-JOB | A | tools/mapviz/jobs/** | jobs, work |
| edshot dry | MV-EDC | A | tools/mapviz/edshot/** (own entry edshot/edshot.js) | none: never loaded by mapviz.js |
| entcat | MV-ENT | B | tools/mapviz/entcat/** | entcat |
| water + terrain pass | MV-WAT | B | tools/mapviz/rules/water/**, tools/mapviz/rules/pass/** | water, pass |
| render R0 C0 L0 L1 | MV-R1 | B | tools/mapviz/render/** | render |
| page shell | MV-PG1 | B | tools/gui/ext/mapviz/sub/{shell,list,base,game,water,hover,measure,profile}.{client.js,lang.json,server.js,test.js} | none (GUI) |
| sight | MV-SIG | C | tools/mapviz/rules/sight/** | sight |
| cover | MV-COV | C | tools/mapviz/rules/cover/** | cover |
| obstacles + travel | MV-PAS | C | tools/mapviz/rules/pass/** (second owner) | pass |
| render L2 L3 | MV-R2 | C | tools/mapviz/render/** | render |
| paint Staff + marks | MV-PNT1 | C | tools/mapviz/paint/** shared files + paint/staff/** | paint |
| previews | MV-PRV | C | tools/mapviz/previews/** | previews |
| page layers | MV-PG2 | C | ext/mapviz/sub/{layers,objects,card}.*, ext/view/kinds/map.*, button in ext/maps/client.js | none (GUI) |
| strong + checks | MV-STR | D | tools/mapviz/strong/** | strong |
| render L4 | MV-R3 | D | tools/mapviz/render/** | render |
| paint Recon + Painted | MV-PNT2 | D | tools/mapviz/paint/recon/**, paint/painted/** | paint |
| paint Field sketch | MV-PNT3 | D | tools/mapviz/paint/sketch/** | paint |
| page strong | MV-PG3 | D | ext/mapviz/sub/{strong,checks}.* | none (GUI) |
| page pictures | MV-PG4 | D | ext/mapviz/sub/{pictures,export,style}.*, ext/help/script.js, help/lang.js | none (GUI) |
| editor routes | MV-EDR | E | tools/mapviz/edshot/**, tools/uidrive/** extension | none |

Coordinator-only files: tools/gui/groups.js, tools/gui/ext/index.js, tools/gui/test/test-gui2.js,
tools/gui/lang/{en,ru,uk,zh}.json, tools/gui/contract.js (command mapshot), tools/gui/test/test-theme.js ALLOW list,
tools/lib/test/test.js registrations, tools/lib/model/README.md, tools/mapport/carry.js, OWNERS.md, tools/INDEX.md,
tools/index/maps.md. Never touched by anyone in this build: tools/test-all.sh,
tools/gui/remote.js. A part never edits a file outside its owned paths; it asks the coordinator.

Folders (sessions cannot make folders): the coordinator creates in wave 0, each with a `.gitkeep`:
tools/mapviz/{lib/mapkit, lib/raster, jobs, edshot, entcat, rules/water, rules/pass, rules/sight, rules/cover, render,
previews, strong, paint, paint/staff, paint/painted, paint/recon, paint/sketch}/test/ and tools/gui/ext/mapviz/sub/.
Each part gets exactly its folder and `<folder>/test/`, no other subfolder: kernels, goldens and fixtures sit flat
(goldens as `test/<what>.golden.<ext>`). Code makes folders at run time only under --out, a scratch dir and the cache.

### 1.0 The dispatcher and the part CLI interface

`node tools/mapviz/mapviz.js <part> <command> [flags]` (exe: `ARSENAL.exe mapviz <part> <command> [flags]`). A brief's
run line allows `node tools/mapviz/mapviz.js *` only. The parts table in mapviz.js is literal; each entry is
`{ part, id, wave, dir, lead?, load: () => opt(() => require('./<dir>/cli'), './<dir>/cli') }`.

| Call | Prints | Exit |
|---|---|---|
| `mapviz.js` (no args), `--help`, `-h` | header + one line per part: name, id, wave, built / not built / broken + credit line | 0 |
| `mapviz.js --version` | credit line | 0 |
| `mapviz.js parts [--json]` | text: `part<TAB>id<TAB>wave X<TAB>dir<TAB>state`; JSON `{v:1, contract:3, parts:[{part,id,wave,dir,state}]}` | 0 |
| `mapviz.js <part> ...` for a part whose cli.js is absent | stderr `mapviz <part>: not built (<id>, wave <W>)`; with --json stdout `{"v":1,"error":{"code":"MV_NOT_BUILT",...}}` | 4 |
| `mapviz.js <part> --help` (built part) | `mapviz <part> (<id>, wave W)` + one line per command from `commands` | 0 |
| `mapviz.js <name>` unknown part | stderr `mapviz <name>: no part named <name>; ...` | 2 |
| a part's cli.js loads but a module it needs is missing, or it throws | stderr `mapviz <part>: fault: <message>` | 2 |

Rules:
- "not built" means exactly: the part's own cli.js cannot be found. A missing module deeper down is a fault (exit 2).
  "broken" means: the cli.js loads but throws, or lacks `run` or an integer `version`.
- `work` is the jobs cli with the lead command `work`: `mapviz work <kernel> --task <file>` calls jobs cli.run(['work', kernel, ...]).
  The jobs cli.commands therefore holds `work`; `mapviz jobs work ...` reaches the same command.
- edshot, bc1 and scenecache are not in the table. mapviz.js never requires anything under edshot/.

A part's cli.js (light at load time: no game read, no heavy require at top):
```
module.exports = {
  part: 'mapkit',
  version: 1,                                            // = index.js VERSION, a literal integer (cache key, section 8.2)
  summary: 'map list, mapdoc and base grids',            // optional, plain words
  commands: { list: { args: '--target T [--game G] [--mods a,b] [--json]', summary: 'maps of a game and stack' }, ... },
  run(argv) -> number | Promise<number>                    // argv[0] = command; flags after it
};
```
- The dispatcher handles --help and -h (never passed to run), an absent command and a command not in `commands` (exit 2).
- run returns an exit code from section 2.4 or throws `MvError(code, msg, detail)` (exported by mapviz.js); the
  dispatcher prints it (section 2.5) and maps it to the exit code. Any other throw = fault, exit 2.
- Shared helpers come from `require('../../mapviz')` (depth as needed): `CONTRACT, EXIT, CODES, TARGETS, SIDES, KINDS,
  PARTS, MvError, opt, findPart, partState, usage, parseArgs(argv, spec), gameFolder(o), checkOut(dir, o),
  writeAtomic(file, data), findIn(dirs, name), progress(o, now?), dispatch(argv, parts?)`. They are frozen with this contract.
  checkOut(dir, o) gives writeguard the game folder o.gameDir, else o.game, else gameFolder(o) when o.target is set.
- `parseArgs(argv, spec)` -> `{pos:[], target, exe, game, mods:[], modDirs:[], map, mode, phase, side, kind, out,
  in:[], json, progress, cancelFlag, size, seed, q, extra:{<camelName>: value}}`; spec `{name: 'str'|'num'|'bool'|'multi'}`
  adds a part's own flags (they land in `extra`). Unknown flag, missing value or bad value -> MvError MV_USAGE.
  Defaults: side 'both', kind 'inf', seed 1, mods [], modDirs [], in [].

### 1.1 mapkit (MV-KIT, wave A): map list, mapdoc/1, base grids

Module: tools/mapviz/lib/mapkit/index.js. All sync.

| Export | Shape |
|---|---|
| `VERSION` | integer part version (starts at 1; bump when a product changes) |
| `TARGETS` | same table as mapviz.js |
| `source(o)` | o = `{target, game?, mods?, modDirs?, vfs?}` -> src `{target, exe, game, mods, modDirs, vfs, has(key), read(key) -> Buffer, keys(prefix) -> [key], rec(key) -> vfs rec, reads() -> [input], stackHash}`. Builds vfs with `exe` explicit; `vfs` given = reused. reads() = deduped inputs for the manifest (section 8.3) |
| `list(src)` | -> `[{key, group, source:'pak'\|'loose', container, mod, modes:[id], files:[name], pictures:[stem]}]` sorted by key |
| `doc(src, key, o)` | o = `{mode?, entities?}` -> mapdoc/1 object (section 3); entities are included unless o.entities === false. Throws MvError MV_NOT_FOUND when the map has no map.net |
| `grids(src, key, o)` | o = `{mode?, tick?}` -> `{height, gtype, gtypeStored, material, notes}`; each a grid object (section 4.3). height, gtype and material are after the land patches (design 2); gtype is also after the load re-type with the W of the mode (section 3.2); gtypeStored is the file's type after the patches, before the re-type. A patch not applied gives note MAPKIT_PATCH_SKIPPED with `at`. height marks lattice points past the ground mesh as nodata (R16, section 4.4). o.tick(done, total): total 1000, done never falls, called at each stage start, after each read and at least every 100 ms of work between (one map.net inflate, sdlx parse or map.ply parse cannot be split); a throw from it goes through (R18) |
| `worldToCell(net, x, y)` | -> `{i, j}` by truncation (floor), or null outside the grid; reads net.cell (callers pass doc.net) |
| `cellToWorld(net, i, j)` | -> `{x, y}` of the cell's south-west corner (= lattice point i, j); reads net.cell |
| `heightAt(grid, x, y)` | bilinear height in u from the lattice grid; null outside; nodata corners drop out and the others are weighted again, null when every weighted corner is nodata (R16) |
| `retype(stored, h, W)` | -> engine type id after the load re-type (design 2) |

Grid files and PNG: `require('../raster/gridfile')` and `require('../raster/png')`; never a second encoder.

CLI (`mapviz mapkit <command>`):

| Command | Flags | Prints / writes | Exit |
|---|---|---|---|
| `list` | --target --game --mods --mod-dir [--out D] [--json] | text: `key<TAB>source<TAB>modes`; JSON `{v:1, target, game, stack:{mods, hash}, maps:[list rows]}`; with --out writes that JSON as maps.json + reads.json (inputs = every pak and loose map folder read) | 0, 3 no install |
| `doc` | common + --map (req) [--mode] [--out \| --json] | --out: writes `mapdoc.json` + `reads.json`; else with --json the doc on stdout. Always with entities (no switch) | 0, 3 no map |
| `grids` | common + --map --out (req) [--mode] | writes height.mvg, gtype.mvg, gtype.stored.mvg, material.mvg, `grids.json` `{v:1, map, mode, w:<W in u>, files:[name], notes}`, reads.json | 0, 3 |
| `cell` | common + --map --at x,y | text `cell i,j h <m> type <id> material <id> stored <id>`; JSON `{v:1, i, j, h, hM, type, typeStored, material}`; h and hM null on a nodata height point (R16) | 0, 3 outside |

Cache: reads none, writes none (the job runner commits --out). Never: guess the exe from the folder; round a world
coordinate to a cell; reuse tools/edrun/mappick.js heightAt or waterOf; write outside --out; read an install by any path but vfs.

### 1.2 raster (MV-RAS, wave A): grids, kernels, grid files, PNG

Modules: tools/mapviz/lib/raster/index.js (grid functions), gridfile.js (section 4 file IO), png.js. All sync.
gridfile.js and png.js are written by the coordinator in wave 0 and frozen with this contract: MV-RAS may fix bugs in
them but not change their exports. The functions below run in process; a pool kernel file (section 1.5) is separate.

| Export | Shape |
|---|---|
| `VERSION` | integer (3 as built: R16, R24) |
| `make(o)` | o = `{name, w, h, cell, ox, oy, etype, sample?, scale?, offset?, nodata?, meta?}` -> grid object, data zeroed |
| `gridfile.write(file, grid)`, `encode(grid) -> Buffer`, `decode(buf) -> grid`, `read(file) -> grid`, `readHeader(file) -> grid without data`, `ETYPES` | section 4 |
| `slopeClass(height, o?) -> grid` | u8 'slopecls', cell sample, design 3 port; o.noNormals = u8 grid or array, nonzero = the cell has no normals (class 0, skipped as a neighbour, as land patch cells); nodata heights count as no normals [I] |
| `hillshade(height, o?) -> grid` | u8 'shade', lattice (R14, as built). Defaults: main light 315 at altitude 45 with fill lights 270, 360, 225, fixed weights [0.6, 0.15, 0.15, 0.1] (o = `{dirs, alt, weights (same length as dirs), z}`); z absent or 'auto' = chosen from relief (tan 30 deg / tan of the 90th percentile slope at a 10 m base, slopes under 0.5 deg ignored, clamped 1..8); a fine scale (tent blur, radius from z so 1 u steps stay under 5 deg, at most 2 m; past that cap the fine scale is lit with zFine = min(z, tan 5 deg x cell x (2 radius + 1))) and a coarse scale (8 m blocks, the full z) mixed 0.5 : 0.5; heights are extended past the map edge by odd reflection for both scales, so a slope shades the same at the edge; a nodata height is flat; before the blurs the nodata points within the reach of the fine scale and of one coarse block are filled ring by ring by linear extrapolation from the heights beside them (the coarse blocks likewise, 4 blocks deep), so a slope shades the same up to the edge of the ground mesh, while the nodata points themselves stay flat (R24); flat ground = 128. meta `{dirs, alt, z, weights, zAuto, zFine, flat, reliefDeg, smooth, block, coarse}` |
| `tint(height, stops, o?) -> grid` | rgba8 'tint', stops from palette.json height.stops (the whole height entry adds below / above for o.min / o.max); default range the grid's min..max; meta `{min, max}`; a pixel of a lattice grid is its cell (4.2): the mean of the corners that hold a value, alpha 0 where its own lattice point is nodata (R24) |
| `contourInterval(height) -> metres` | 0.5, 1, 2 or 5 |
| `contours(height, o) -> {interval, lines:[{level, index:bool, pts:[[x,y]..]}], labels:[{x, y, level, angle}]}` | level in m; levels = every multiple L of the interval with lo < L <= hi (lo, hi = the grid's min and max); a corner >= L counts as above, so a level equal to the maximum gives a line along that edge; a line is closed or runs from map edge to map edge or to a nodata hole; pts, x, y in world u; angle in degrees counter-clockwise from +x in the world frame (the yaw rule; the page negates it for the screen); o = `{interval, simplify (u, default 0.2 cell), labels (default true)}` |
| `contoursVector(result) -> {v:1, kind:'vector', name:'contours', items}` | the contours.json product (section 5.3) |
| `landform(height, r) -> grid` | u8 'landform.r<r>' on the 1 m grid (section 4.2), codes section 4.4 |
| `regions(mask, o?) -> {grid (u32 'regions'), list:[{id, area, cx, cy, ax, ay}]}` | ax, ay = label anchor; o.conn 4 (default) or 8 |
| `distance(mask, o?) -> grid` | f32 'distance', u; o.edge counts the cells just outside the map as zero |
| `costField(cost, seeds, o?) -> {dist, back, cost, seeds}` | dist f32 '<name>.dist' (u x factor, nodata -1); back u8 '<name>.back': 0 none (seed or unreached), 1..8 = the neighbour the cell is reached from (1 east, 2 north-east, 3 north, 4 north-west, 5 west, 6 south-west, 7 south, 8 south-east); cost and seeds are carried for paths(). cost = numeric cell grid of factors (< 0, nodata or not finite = blocked); seeds = `[[x,y]` or `{x,y}` (world u) or `{i,j}` (cell)`]`, blocked or outside seeds skipped, none left = RASTER_ARG; o.name = layer stem (default 'costfield') |
| `paths(costField, from, to, k, seed) -> [[x,y]..][]` | up to k distinct paths, points = cell centres where the direction changes; path 1 = the least-cost path; each further path = weighted A* (heuristic 1.5 x) over cost x (1 + value noise, lattice 16 cells, integer hash of cell and seed) x 2 on cells an earlier path used; up to 4 k attempts, duplicates dropped, so fewer than k can come back; [] when `to` is unreachable |
| `minFilter(grid, r)`, `resample(grid, w, h, mode)` | mode 'nearest' or 'box' |
| `png.encode(rgbaGrid or {w,h,rgba}) -> Buffer`, `png.decode(buf) -> {w, h, rgba}` | deterministic, zlib level 6, no time chunk |
| `cutTile(rgbaGrid, z, tx, ty) -> {w:256, h:256, rgba}` | section 5.2 tile rule |
| `tileLevels(w, h) -> {zmax, levels:[{z, w, h, nx, ny}]}` | the level sizes and tile counts of section 5.2 (jobs tiles.cut loops over it) |
| `topo(height, o?) -> {grid (rgba8 'pic.topo'), sidecar}` | height tint x shade; o = `{shade, size, palette, made, target, stackHash, mapHashes, tick}` (target, stackHash and mapHashes go into the sidecar as given, null when absent); default shade = hillshade(height); a version-1 shade grid is still accepted (flat taken as round(255 sin alt)); pic meta gains shadeZ; frame section 4.2; a pixel whose own lattice point is height nodata is off ground, alpha 0, and the shade of a pixel is the mean of its corners that hold a height (R24) |
| `o.tick(done, total)` | optional progress hook (R18) of slopeClass, hillshade, tint, contours, regions, distance, costField, minFilter(grid, r, o?), resample(grid, w, h, mode, o?) and topo: called at least every 100 ms of work and once at the end with (total, total), done never falls; anything but a function or null is RASTER_ARG; a throw from it (the CLI cancel, MV_CANCELLED) ends the call. Bytes are unchanged by it |
| `render(grid, palette?) -> rgba8 grid` | a grid as a picture for `raster png` |
| also | `TILE` 256, `KERNELS` (this part's pool kernels), `LANDFORM`, `gridfile`, `png`, `palette()`, `color(s)`, `premul(c, a)`, `unpremul(p, a)` |

CLI: `raster terrain --in D --out D [--json]` (reads height.mvg; writes slopecls.mvg, shade.mvg, landform.r10.mvg,
landform.r50.mvg; JSON `{v:1, out, files}`); `raster topo --in D --out D [--size px] [--json]` (writes pic.topo.mvg,
pic.topo.json sidecar, contours.json vector; pic.topo = height tint x shade only, contours are never baked in: the page
draws contours.json; JSON `{v:1, out, files, w, h, interval, lines, labels}`). The sidecar's `made` is an ISO time
stamp and the only field that differs between runs (pic.topo.mvg and contours.json are the same bytes). Sidecar sources
(R22; raster never reads a game): target = mapdoc.json game (a doc in --in whose key is the grids map), else the grids
entry's manifest.json target, else --target; stackHash = mapdoc.json stack.hash, else mapkit's stack hash of the
manifest's mods and mod folders, else of --mods and --mod-dir; mapHashes = the mapHashes of mapdoc.json and grids.json
when they carry them, plus height.mvg = sha1 of the height file. Job topo needs doc and grids (section 6.2), so the doc
reaches --in.
`raster info <file.mvg> [--json]` (header + count, nodataCount, nan, min, max, mean of the valid values; JSON `{v:1,
file, name, w, h, cell, ox, oy, etype, sample, scale, offset, nodata, meta, count, nodataCount, nan, min, max, mean}`;
rgba8: count and `channels:{r, g, b, a}`, each `{min, max, mean}`); `raster png <file.mvg> --out <file.png>`.
Exit 0, 2 a bad grid (detail.code RASTER_*, GRIDFILE_*, PNG_*), 3 when an input file is absent. Cache: none. Never: read a game (works only on grids), use Math.random, keep
state between calls.

### 1.3 bc1 (MV-BC1, wave A): DXT1 encoder, BC5 decode

tools/lib/model/ddsenc.js, sync: `encode(rgba, w, h, {mips:true, best:false}) -> Buffer` (DX9 DDS, DXT1, full mip chain
to 1x1, box-filtered, mip count and linear size in the header; w and h multiples of 4 else throws Error with code
DDSENC_SIZE); `encodeBlock(rgba16px, best) -> Buffer(8)`; `mipChain(rgba, w, h) -> [{w, h, rgba}]`. Integer maths,
4-colour mode only, no dithering (design 10). tools/lib/model/dds.js: decode gains format 'BC5' (fourCC ATI2 or BC5U,
and DX10 headers with DXGI 82 BC5 typeless or 83 BC5 unorm): r, g from the two channels, b = 0, a = 255; the caller
rebuilds z. Signed BC5 (fourCC BC5S, DXGI 84) stays refused (the error names the format). No CLI, no cache. Never: change the output of an existing format;
float maths in the encoder. Its brief runs every suite that requires dds.js.

### 1.4 scenecache (MV-SCN, wave A): one loader per game + stack

tools/lib/model/scenecache.js, sync: `open({target, game, mods, modDirs?, vfs?}) -> L`. target (as64 | mowas2 | goh)
is required, else it throws an Error with code SCENECACHE_TARGET; game = the install folder (default gamedir.resolve().dir,
GoH gamedir.goh()); vfs given = reused (MV-ENT passes src.vfs, so both read one stack). Errors (Error with `code`):
SCENECACHE_TARGET (no or bad target, or a given vfs built for another exe), SCENECACHE_GAME (no game folder anywhere),
MOD_NOT_MOUNTED (mods given and no vfs: L builds its vfs in open, and a named mod, the part before ':', that does not
mount throws; `.unmounted = [{name, why}]`, why from vfs.dropped). A given vfs is the caller's and is not checked again.
L has:
- `L.load(model)`: model = a sceneload target string (model key, file path or entity name) -> the result of
  `sceneload.load(model, {game, mods, source})` with L's file source; an entity name resolves through L.entity (the
  engine's winner); results are remembered per model string and the same object comes back;
- `L.read(key) -> Buffer | null` (null for an absent key); `L.entity(name) -> {name, key (vfs key of the winning .def),
  mdl (vfs key or null), layer} | null`;
- `L.reads() -> [input]` (section 8.3 shape); `L.invalidate()`: forgets models, entities and reads; L's own vfs is built
  again on next use, a given vfs is kept; open pak handles are closed (vfs.closeRecs);
- extras: `L.stats() -> {reads, loads, hits, entities}`, `L.vfs() -> vfs`, `L.source`, `L.target`, `L.exe`, `L.game`,
  `L.mods`, `L.modDirs`.
Results (L.load, L.entity) are shared objects, read-only for callers. One file source and one index per L.
L.source = `{read(key) -> Buffer | null, has(key), keys(prefix) -> [key], get(key) -> {buf, origin} | null, origin(key),
entityModel(name) -> {key, def} | {error}}`. sceneload.js gains only the optional field `o.source` (a file source
`{read(key), has(key), keys(prefix)}`; it uses get and entityModel when present); without it sceneload behaves as today.
Opt-in: Models, soedit and armorsim keep their path.
No CLI, no cache folder (memory only). Never: change sceneload's results for callers that do not pass o.source.

### 1.5 jobs (MV-JOB, wave A): runner, pool, cache, map list, tiles

Modules under tools/mapviz/jobs/: index.js (runner), cache.js (section 8), pool.js, tiles.js, table.js (the job table).

| Export | Shape |
|---|---|
| `index.create(o) -> runner` | o = `{root?, cap?, run?(argv, opt) -> Promise<{code, stdout, stderr, timedOut}>, light?:2}`; run defaults to spawning mapviz.js (exe: the exe with `mapviz`); opt = `{cancelFlag, progress, cwd, ctl}`, run sets ctl.kill. Test seams: jobs, parts, entry, killWaitMs (10000), pollMs, lockPollMs, timeoutUnitMs (1000), now |
| `runner.submit(req) -> {id, shared:bool, state, queue}` | req = section 6.2 body; identical canonical requests share one job; throws MV_USAGE, MV_NOT_FOUND, MV_NOT_BUILT, MV_FAULT (need cycle) |
| `runner.status(id) -> job` | section 6.3 shape, null when unknown |
| `runner.cancel(id) -> bool` | writes the cancel flag |
| `runner.list() -> {running:[job], queued:[job], done:[job]}` | done = the last 20 |
| `runner.wait(id) -> Promise<job>`, `runner.problems` | resolves when the job ends; table.check() of the job table in use |
| `runner.watch(fn) -> unwatch()` | fn({id, what, state, stage, done, total, target, map}) on every change of a queued job; a watcher that throws is ignored (the GUI job list uses it) |
| `runner.close()` | cancels all, waits for children |
| `table.JOBS` | section 6.2 table: `{what: {part, cmd, heavy, timeoutS, needs:[what], keys:[field], products:[name]}}`; also `SIZE` (size defaults, section 6.2), `DEFAULTS`, `defaults(what)`, `reduce`, `productFiles`, `tilesOf`, `check` |
| `cache.*` | section 8.5 |
| `pool.create({n}) -> {run(kernel, task) -> Promise<{code}>, close()}` | children = `mapviz work <kernel> --task <file> --cancel-flag <file>`; n = min(availableParallelism - 1, RAM budget) |
| `tiles.cut(picFile, outDir, o) -> {zmax, count}` | outDir = the tile set folder (the runner gives `<entry>/tiles/<base>`); writes `outDir/<z>/<x>_<y>.png`; o = `{z?: 'all'\|n, progress?}`; levels and tile counts from raster tileLevels, pixels from raster cutTile, no tile maths of its own (section 5.2) |
| `tiles.batch(dir, z, list) -> [{t, png?: base64, missing?: true}]` | dir = the tile set folder; up to 16 |

CLI: `jobs run <what> [common flags] [--json]` (runs one job in this process through the cache; prints `{v:1, what,
key, dir, cached}`); `jobs list-what [--json]`; `jobs cache [--json] [--clear all|map --map K [--target T]] [--evict]`
(stats `{v:1, root, bytes, cap, entries, jobs}`; --clear prints `{v:1, removed, bytes}`; --evict `{v:1, removed:[key]}`);
`jobs tiles --in <pic.mvg> --out D [--z n|all]` (prints `{v:1, zmax, count}`); `work <kernel> --task <file>` (pool
child, below). cli.commands = run, list-what, cache,
tiles, work. Cache: owns it (reads and writes everything under section 8). Never: start a game or editor; run more than
one heavy job at a time; keep a job's partial output in the cache.

Kernels (the pool's unit of work):
- kernel = a path under tools/mapviz without `.js`, matching `/^[a-z0-9_]+(\/[a-z0-9_]+)+$/`, naming a file that sits
  directly in its owning part's folder (for example `render/l1tile`, `lib/raster/kshade`). The paint style folders
  paint/staff, paint/painted, paint/recon and paint/sketch count as kernel owning folders too. `work` requires
  path.join(<mapviz folder>, kernel) and refuses (MV_USAGE, exit 2) a kernel outside tools/mapviz, with `..`, or under edshot/.
- task file `{v:1, kernel, inputs:[file], args:{}, out}`. The kernel writes only into task.out. `work` checks task.out
  with checkOut before the kernel runs (inside an install: MV_REFUSED, exit 6).
- A kernel module exports `run(task, io) -> exit code` (sync; 0 ok; MV_CANCELLED = exit 5; any other throw = exit 2,
  MV_REFUSED from io, a write outside task.out, included). It holds no
  relative require (node built-ins only), so a later in-process worker can start it from source text (design 3). io is
  given by `work`: `{readGrid(file), writeGrid(file, grid), readPng(file), writePng(file, rgbaGrid), progress}`, built on
  gridfile.js and png.js; progress = mapviz progress({cancelFlag}).
- MV-JOB's test runs `tools/dist/sea.js --manifest-only` and checks that it lists every non-test mapviz file.

### 1.6 edshot dry (MV-EDC, wave A): preflight, walker, move-out, import

Entry tools/mapviz/edshot/edshot.js (own `--help`, own literal command table); module edshot/index.js, sync.

| Command / export | Shape |
|---|---|
| `preflight({exe, root, instance?, profile?}, io?) -> record` | record = `{v:1, ok, refuse:[code], absent:{name: bool}, running:[exe], exe, root, instance, profile, at (ms since 1970), seen:[lower case name in root], notes:[{code, text}]}`. root is required (MV_USAGE; MV_NOT_FOUND when not a folder). Refusal codes EDSHOT_RUNNING (a blocking exe runs, or no process list), EDSHOT_FILE_PRESENT, EDSHOT_NOT_WRITABLE (checked without a test file), EDSHOT_INSTANCE0. Note codes: the refusal codes and EDSHOT_NO_PROCESS_LIST, EDSHOT_EXE_ABSENT, EDSHOT_PROFILE_ABSENT, EDSHOT_NO_INSTANCE, EDSHOT_UNLISTED, EDSHOT_MAYBE_UNWRITABLE |
| `processList(io?) -> [lower case image name] \| null` | through tools/lib/platform processList (`tasklist /fo csv /nh`, no shell); null = no list |
| io | `{tasklist() -> CSV text \| [name] \| null, spawn (platform's runner seam), env, rename(from, to)}`; tests inject it; default the real calls |
| `walk(root, {links:true, skip:[]}) -> [{rel, size, mtimeMs, dir:bool, link?, followed?, why?, broken?, err?}]` | own stat walker, follows a directory link once; why = 'inside' (target inside the tree), 'cycle', 'seen' (followed through another link) or 'off' (links off) |
| `diff(before, after, expected:[pattern]) -> {added, removed, changed, unexpected, limits}` | added, removed = walk entries; changed = `[{rel, what:['kind'\|'size'\|'time'\|'link'], before, after}]`; unexpected = `[{rel, change:'added'\|'removed'\|'changed', what?}]` sorted by rel; limits = `[text]` (a rewrite that keeps size and time is not seen). Patterns: '/' separated, '*' '?' in one name, '**' any depth, no case. `EXPECTED`, `expectedFor({scope, route?, bak?}) -> [pattern]` = the design 8 list as data |
| `moveout(root, runDir, record, io?) -> [{name, to}]` | record = the whole preflight record; a bare `{name: bool}` map is refused with EDSHOT_RECORD. Moves only minimap_render.png, minimap_render.png.temp, dialogs.txt that the record says were absent. Refused: MvError MV_REFUSED, detail `{moved, refused:[{name, code, why}]}`, codes EDSHOT_RECORD, EDSHOT_NOT_OURS, EDSHOT_NOT_FILE, EDSHOT_TARGET_UNWRITABLE, EDSHOT_TARGET_EXISTS, EDSHOT_SOURCE_LOCKED, EDSHOT_RUNNING |
| `importPicture(file, doc) -> grid` | rgba8 'pic.edshot' over the world box, resampled (box) to square pixels: cell = max(box width, box height) / max(png w, png h), w = round(box width / cell), h = round(box height / cell); rows as section 4.2 "Pictures read from files"; meta `{from:[png w, png h], resample:'raster'\|'edshot'\|'none'}` |
| `sidecar(grid, doc, made?) -> sidecar` | section 4.4 sidecar; box = doc.boxes.world; mapHashes, rung, env, gaps, approx, brightness null |
| CLI `preflight`, `walk`, `diff`, `moveout`, `import` | flags `--exe as64_ed\|mowas_2_ed\|goh_ed --root <folder> --run <id> --file <png> --out D --json`, and `--instance N`, `--profile <folder>` (preflight), `--label <name>`, `--skip <glob>` (repeatable), `--no-links` (walk), `--scope install\|profile`, `--route editor\|console`, `--bak <name>`, `--expect <glob>` (repeatable) (diff); import reads mapdoc.json from `--in` or the map from `--target --map`, writes to `--out` or the run folder with `--run`. preflight needs --root (no folder lookup). Exit 0; 1 only when a change is off the expected list (expected changes alone exit 0); 2 usage or fault; 3 not found; 6 refused |
| CLI `shot`, `calibrate` | wave E: answer "not built", exit 4 |

Writes: `<cache>/runs/<run id>/` only. Never: start a game, an editor or uidrive (waves A to D; reading the process
list with tasklist is allowed), write into an install, or write, change or read the contents of a file in a profile.
walk() may list a profile folder (stat only).

### 1.7 entcat (MV-ENT, wave B): what an object is

Module tools/mapviz/entcat/index.js, sync. Entry shape = design 4 (frozen there, with `category` from the list below).

| Export | Shape |
|---|---|
| `VERSION` | integer |
| `CATEGORIES` | ['building', 'building_part', 'wall', 'fence', 'emplacement', 'tree', 'bush', 'rock', 'wreck', 'bridge', 'water_surface', 'ground_decal', 'road_decal', 'crater', 'service', 'placed_unit', 'other'] |
| `catalog(src, {defs, loader, progress?, release?, stage?}) -> {v:1, target, stackHash, entries:{def: entry}, failed:[{def, code, msg}]}` | loader = scenecache L; release = n drops the loader's scenes after every n defs (the stack command; memory bounded) |
| `entry(src, def, loader) -> entry` | |
| `footprintOf(entry, placed) -> {kind, pts:[[x,y]..]}` | world polygon of a placed entity; kind 'none' with one point [[x, y]] (the entity origin) for a def with no obstacle shape, no volumes and no meshes (R15) |
| `place(doc, catalog, links?) -> [{uid, def, category, fp, zMin, zMax}]` | objects of a map (R15). A mapdoc from mapkit carries its links (entities[].link, .seats, section 3.2) and links is left out; an old doc with neither needs links = links.js linksOf (linksFor gives it). Notes ENTCAT_PART_UNPLACED, ENTCAT_BAD_POSITION ride on the returned array as a non-enumerable `notes` |
| `forDoc(src, doc, o?)`, `linksFor(src, key, doc, {mode?})`, `docHasLinks(doc)`, `loaderFor(src)`, `readsOf(L)`, `release(L)` | extras, as built (entcat/index.js header) |

catalog.entries is keyed by the lower-case def name (the entity name as mapdoc writes it, entities[].def, section 3.2),
also when a vfs key was asked for; entry.path = the vfs key of the winning .def. Entry fields beyond design 4, as built
(R15): categoryRule, notes [{code, msg}], props, mdl, path, cover.top, vaultable, enterable, footprint.source,
footprint.zones, footprint.scaled, footprint.sprite, sight {enters, hard}, structure.parts; traverse = {bone, min, max,
full} and depression = {bone, min, max} (mdl Limits in degrees, as stored); cover.band is a string id (none, lie, low,
kneel, squat, stand); crushBy = {tank, tankLight, armored, car} of obstacles.reg pather costs (>= 0 passes, -1 blocks,
null unknown). Road and ground decals: zMin = zMax = 0 and entry.height null. Decal size (design 7 L2a, R23): sprite px x
the scale channels x entity scale when the sprite has a scale channel, else px x 0.5859375 x entity scale.
Objects of a map (objects.json): several obstacle zones of one def (several {Obstacle} blocks, CompoundObstacles) give one
hull of kind 'poly'; entcat.json keeps every zone (footprint.zones). A structure part with no map record of its own takes
the root's uid, so uids can repeat [I]. Without --mode the .mi (mode) records are left out; with --mode M that mode's
records and links are added.
CLI: `entcat def --def <name or vfs key> [common] [--json]`; `entcat map --map K [--mode M] [common] --out D` (writes
entcat.json, objects.json vector file (section 5.3), reads.json; --json body.notes = the place notes and the doc's
MAPKIT_LINK_NESTED, text mode prints them on stderr); `entcat stack [common] --out D`. Exit 0, 1 when some defs failed
(listed), 3. Notes and codes: ENTCAT_* (tools/OWNERS.md); ENTCAT_LINK_NESTED from links.js for an old doc. Cache: reads
mapdoc.json from --in or computes it; writes nothing but --out. Tests: the whole GoH stack runs only with MAPVIZ_SLOW=1
(about 4 min). Never: regex-parse SDL (use tools/lib/sdlx.js); name a category in words in products (ids only).

### 1.8 water and pass (MV-WAT, wave B): engine-true water bands, terrain passability

rules/water/index.js, sync: `VERSION` (2); `profile(src) -> {classes:[{id, depthM, source:'stack'|'vanilla'}], game}`;
`masks(doc, grids, prof, mode?) -> {band, drown, depth}` grids (section 4.4), with the W of the mode (section 3.2);
`labels(doc, masks, prof) -> [vector item]` (section 5.3 kind 'waterLabel'); `checks(doc, grids, masks, which) -> [item]`
(codes BLOCKED_NOT_DEADLY, WET_LOOK_DRY_PLAY, SWAMP, PAINTED_ABOVE_LEVEL). As built (R17, R18): masks, labels and checks
take an optional last argument o = {tick(done, total)} (done never falls, last call (total, total), at most about 100 ms
of work between calls; a throw ends the call); profile class rows may carry chain = [handler file:line, top first] when
an inherit chain decided the depth; classes beyond the list below (a drowning block no vanilla class uses) are added with
source 'stack', boats skipped with WATER_BOAT_SKIPPED; check items carry cells, area (m2) and box beside code, x, y,
region, one per connected region of the code, and BLOCKED_NOT_DEADLY is one item per (drown class, region) with the class
id in `cls`; `water masks` exits 0 also when checks find something (checks are data). Notes and codes: WATER_* (tools/OWNERS.md).
Off ground (R16, as built R24; water VERSION 2): a water-typed cell whose own south-west lattice point is height nodata
(section 4.2; the grid header's nodata value, -32768 for i16, 65535 for u16) holds no unit: water.band 0, water.drown 0,
water.depth nodata; labels and every check skip it. masks() returns counts `{noProne, swim, drownAny, dryWater,
offGround}` (offGround always there, 0 when none; the --json body carries counts); water.band meta.offGround = that count,
only when not 0 [I: fix row MAPVIZ_WAT_OFFGROUND].
Class ids are an open list, in profile order. AS2 vanilla: car, truck, moto, armored_car, tank_light, gun_unlinked,
tank_medium, tank_heavy, amphibious (depthM null). GoH adds gun_goh_a (1.3 m, cannon.inc:410) and gun_goh_b (1.0 m,
cannon.inc:1313); boats never drown (depthM null). A class read from a `water_level` condition of the stack takes its
interaction file stem as id. The page and the palette read class ids only from water.drown meta.bits.
CLI: `water masks --map K [--mode m] [common] [--in D] --out D` (water.band.mvg, water.drown.mvg, water.depth.mvg,
water.labels.json, water.checks.json, reads.json); `water profile [common] [--json]`.

rules/pass/index.js, sync: `VERSION` (2); `profiles(src) -> [{patherId, blockDeg, costFromDeg, ground:{<engine type id>:
{k, accepted}}}]` from the stack's PATHER.SET; `kindProfile(profiles, kind, src) -> profile`; `mask(grids, prof, o?) -> {pass,
cost}` (o.tick as water's, R17). A kind whose unit def is absent falls back to the vanilla PatherID of that kind (source
'vanilla'); a def with no PatherID takes profile 0. Notes and codes: PASS_* (tools/OWNERS.md). CLI: `pass terrain --map K --kind k [--mode m] [common] [--in D] --out D` (pass.<kind>.mvg, cost.<kind>.mvg,
reads.json);
`pass profiles [common] [--json]`. Off ground (R16, as built R24; pass VERSION 2): mask() reads grids.height when given
(also beside a given slopecls); a cell whose own south-west lattice point is height nodata is pass 0 (nodata) and cost -1;
counts = `{open, slow, blockedSlope, blockedGround, nodata, offGround}` (offGround always there, also counted in nodata;
the --json body carries counts); pass.<kind> meta.offGround = that count, only when not 0 [I: fix row
MAPVIZ_PAS_OFFGROUND]. `pass terrain --in D` reads height.mvg beside gtype.mvg, also when slopecls.mvg is there.
Wave C (MV-PAS) adds obstacles, travel and routes in the same folder without changing
these exports. Exit 0, 3. Never: choose a profile by a kind's name (always by PatherID); read heights other than the
re-typed grid.

### 1.9 render (MV-R1, wave B): R0, C0, L0, L1

render/index.js: `VERSION` (4 as built: R24, R25); `plan(doc, {size, guard?}) -> {size:[w,h], tile:2048, tiles:[{x, y, w,
h, guard}], box, cell, cellY, guard}` sync; `l0(doc, grids, o) -> {grid, sidecar}` sync (grids = mapkit grids of the mode
+ raster shade; o = `{size?, mode?, src?, target?, made?, palette?}`); `l1(src, doc, o) -> Promise<{grid, sidecar,
stats}>` (o = `{size (default 2048), mode?, pool?, progress?, made?, gain?, band?, cancelFlag?, workDir?, mips?, detail?}`;
mips R19, detail R25; pool = a jobs pool or a number of children); `c0(src, doc, pic, o?) -> {dx, dy, gain, classMeans,
ssim, used:bool, why, size, shiftRange, classes}` sync (o = `{grids?, mode?, range?}`: c0 reads the grids of the mode
itself when none are given; range = the shift range in px, default 8). l0 and l1 take o.mode but do not read it (the
grids of l0 are already of the mode; the l1 ground does not change with the mode). No rung takes o.env. grid = rgba8
'pic.l0' / 'pic.l1'.
Sidecar `pic.<rung>.json`: the common sidecar of section 4.4 with every field known, plus `size`; on l1 also `cellY` when
it is not cell, `notes` (at most 50) when there are any, and the R25 detail fields below. GoH materials: the
.ebm reference follower is MV-R1's own (section 12). l0 = ground types + shade + water by the W of the mode.
Off ground in l0 (R16, as built R24 at render VERSION 2): a cell whose own south-west lattice point is height nodata
(section 4.2) is alpha 0, as pic.topo draws it; the shade of the cells beside it is the mean of their corners that hold a
height; pic.l0 meta.offGround = the transparent cells, only when not 0. l1 fills up to 64 u past the mesh box (below),
so it covers that rim, but l1 is drawn in the plan frame (the world box) and l0 with no --size in the cell frame of the
grids: where the ground mesh reaches past the world box, topo and l0 draw it and l1 does not (fix row
MAPVIZ_RENDER_L0_RIM; the owner decides at milestone M1 whether layers clip to the world box).
CLI: `render l0|l1 --map K [--mode m] [--size px] [common] [--in D] --out D` (pic.<rung>.mvg + pic.<rung>.json +
reads.json; l1 also `--pool n`: n `mapviz work render/l1tile` children, default 0 = in process, and `--detail map|gpu`,
R25); `render c0 --map K
[common] --out D` (c0.json; GoH: no picture, exit 1, RENDER_C0_GOH). Size with no --size: section 12 (l0 at cell
resolution, l1 2048). Exit 0; 1 picture made with gaps (c0: the minimap left out of the fit, used false); 2 a bad flag
(such as --detail, below) or a bad map.ply (section 2.4); 3; 5 cancelled; 6 --out refused. Never: write BC1 or a
preview (that is previews); read the GPU or start the game.
As built (R19): l1 o also takes `mips` ('file' | 'box', below) and gives `stats` (in the --json body: textures = distinct
names, texturesRead = every texture decoded, the GoH Global Diffuse included, mips, edgeFilled, edgeTransparent; the
stats are not the sidecar, except the four detail fields of R25, which go in both). L1 = the ground mesh only: per mesh part two layers blended by vertex alpha (layer 0 x a + layer 1 x
(1 - a)), alpha interpolated barycentrically as the GPU does; texture level per texture and part = log2(texels per
sample) at the 2 x 2 supersample, trilinear between the two nearest levels (premixed into one texture at the finer
level's size), bilinear with wrap; level chain: AS2 and AS64 the file's mips while its bytes hold them, then 2 x 2 box
filters to 1 x 1 [V]; GoH level 0 from the file, then box filters (its shipped mips are sharpened) [I]
o.mips overrides. Pixels the mesh border cuts or that lie at most 64 u past the mesh box take the colour of their mirror
image inside the mesh, farther ones stay transparent (a note, never a gap; the game draws nothing there). No bump,
parallax, specular, water or entities. Gap codes (sidecar gaps): RENDER_MATERIAL_MISSING, RENDER_MATERIAL_BAD (material
text unreadable, e.g. a quote never closed), RENDER_TEXTURE_MISSING, RENDER_TEXTURE_BAD, RENDER_LAYERS_SHORT,
RENDER_NO_VCOLOR, RENDER_GLOBAL_MISSING, RENDER_GLOBAL_NORMAL (GoH Global Normalmap not drawn), RENDER_UNCOVERED (a hole
wholly inside the mesh box); l0: RENDER_NO_SHADE. A part with an unreadable material or texture is drawn flat (the mean of
the textures read, else the palette ground fill). Errors: MV_NOT_FOUND (RENDER_PLY_MISSING), MV_FAULT (RENDER_PLY_BAD,
RENDER_KERNEL), MV_USAGE (RENDER_SIZE); c0 codes RENDER_C0_* (tools/OWNERS.md).
As built (R25; render VERSION 3 added the map-scale detail rule, 4 its sidecar fields and --detail): l1 o also takes
`detail`: 'map' (the default) or 'gpu'. 'gpu' is the sampling rule above alone; the default moves l1 away from that R19
rule (fix row MAPVIZ_RENDER_R19_DEFAULT [I]; the owner sees it at milestone M1). In process any value other than 'gpu' is
taken as 'map'; only the CLI refuses a bad word. 'map' adds the rule DETAIL = {fine 1, coarse 4, cutU 10, sigma 8}
(render/l1.js) [I: a look choice, fix row MAPVIZ_RENDER_DETAIL]:
- The picture keep is 1 at a cell of 1 u per pixel or finer (the larger cell side), 0 at 4 u per pixel or coarser,
  log-linear between, in 1/64 steps.
- The coarse band of a tiled ground texture is the coarsest chain level whose texel (repeat / level size) is 10 u or
  less; level 0 when no level is; the last chain level when the repeat or the texture size is not known. The texture's
  own k = keep + (1 - keep) x min(1, (8 / sigma)^2), in 1/64 steps, at most 1; sigma = the luminance std of the chain
  level max(coarse band, sampled level). So a texture with sigma 8 or less is drawn as the GPU rule draws it.
- A texture with k < 1 whose coarse band is coarser than its sampled level is drawn as itself - (1 - k) x (band - the
  band's mean colour), band = the coarse band level read back bilinear with wrap at the sampled level's size: the grain
  finer than 10 u stays, the blotches of the repeat go toward the texture's mean colour. A texture sampled at or past
  its coarse band (small pictures) goes to mean + k x (texel - mean), mean = the mean colour of the sampled level: nothing
  finer than 10 u stays.
`render l1 --detail map|gpu` = o.detail, default map; any other word, or --detail on l0 or c0, exits 2 (MV_USAGE). The
l1 stats (--json body) and pic.l1.json both carry `detail` ('map' | 'gpu'), `keep` (the picture keep; always 1 with gpu), `detailTextures`
(`[{name, k}]`: only the textures the rule drew with k < 1; k = the lowest over that texture's uses; name = the texture as
the map's material names it, e.g. /texture/land/..., never a file path; sorted by name, plain string compare; [] when
none, so always [] with gpu) and `detailChanged` (true only when detail is 'map' and detailTextures is not empty). approx
keeps its meaning (GoH, or a gap other than RENDER_UNCOVERED); pic.l1.mvg bytes do not depend on these fields. A cached
version 3 sidecar lacks them; each bump (3, 4) changed every render key once (section 8.2). The jobs runner passes no
--detail: a job l1 always uses the map rule, and so does a c0 that draws its own picture (fix row
MAPVIZ_RENDER_DETAIL_JOBS).

### 1.10 page shell (MV-PG1, wave B)

Files per part: `ext/mapviz/sub/<part>.{client.js, lang.json, server.js, test.js}` (pattern tools/gui/ext/models/sub/README.md).
- client.js: exports one string (a String.raw template) holding an ES5 script; inside it no backtick, no dollar-brace,
  no innerHTML.
- lang.json: `{en:{}, ru:{}, uk:{}, zh:{}}`, keys prefixed `mapviz.<part>.`; no value starts with `TODO:`.
- server.js: `module.exports = { routes: { 'GET /api/x/mapviz/<path>': async (url, body, ctx) => answer } }`; shell.server.js
  holds every wave A/B route of section 6 on jobs/index.js and jobs/cache.js.
- test.js: runnable with node alone (`node <file> [scratch dir]`); last line `PASS mapviz <part> (N)`.
  tools/gui/ext/mapviz/test.js (coordinator, written before wave B) runs every sub/*.test.js alone with a scratch dir,
  the way ext/models/test.js does; it fails when one exits non-zero or lacks that last line, and ends with
  `PASS mapviz page (N)`. The GUI suite runs it (tools/gui/test/test-ext.js runs ext/<id>/test.js only).

Page API (shell.client.js defines it; other parts use only this):
```
EXT_SCREENS.mapviz = function (host) {...}; EXT_SCREENS.mapviz.parts = [];      // parts push {id, init(V)}
V = { q(name) -> query value, api(method, path, body) -> Promise,
      job(what, args) -> Promise<result> (polls section 6.3; a poll that fails with no 4xx status, such as no answer or
        a 5xx, is tried again up to 3 times in a row, 1 s apart (a good answer resets the count); then the job ends on
        the page as failed and the promise rejects with that poll's error; a 4xx ends it the same way at once; 20 answers
        in a row whose state the page does not know (not queued, running, done, failed, cancelled or timeout) end it as
        failed too, rejecting with mapviz.err.MV_FAULT whose message is mapviz.shell.oddState; every end that is not done
        says the job-failed line mapviz.shell.jobFailed before the promise rejects, R25),
      doc -> current mapdoc or null, pal -> palette.json object,
      on(event, fn), emit(event, data),        // events: map, view, cursor, layers, theme, tool, refresh, job, products, doc
      addLayer({id, group, label, legend, engineTrue:bool, engineTrueGoh?:bool, defaultOn:bool, draw(ctx2d, view), tiles?:base, hit?(x,y), list?()}),
        (engineTrueGoh: the mark on the Gates of Hell page when the rule is untested on AS64 and MoW:AS2 but only inferred on GoH)
      addTool({id, label, key, start, move, click, end}), addHover(fn(x, y) -> [{label, value}]),
      addPanel({id, side, build, name?, tab?}), tab(id) -> bool,
      view -> {cx, cy, zoom}, toWorld(px, py), toScreen(x, y), redraw(), token(name) -> CSS token value, say(key, args) }
```
The screen object that EXT_SCREENS.mapviz returns is `{refresh, focus, view(v), pick, go, keys(e)}`; v = everything after `page:mapviz/`
(map keys hold slashes, so the whole rest).
As built (R20; the shell.client.js header is the full list):
- Events: also `refresh {target}` and `doc {key, ok}` (R25): once each time a document read of the open map ends (a
  pick, a permalink, a refresh that finds the open map with no document, or the Read button after a 'not made' answer,
  which sends a second 'doc' for the same key; `ok: false` when the read failed or the document is not made), after the
  'map' event that carries a document that landed. `V.q('docBusy')` is true while that read runs (from a pick until its
  end); parts hold every fetch that carries the mode while it is true and ask once on 'doc' (a part that needs the
  document itself, as the hover part, may instead wait for V.doc and ask on the 'map' event that carries it; it then
  asks nothing after a failed read; the hover part listens to 'doc' only to say its status again). A part asks for a map with `V.emit('map', {key, mode?, pick: true})`; the shell takes
  that request itself and never hands it on, so a 'map' listener only sees the shell's `{key, mode, side, kind, doc}`
  (doc null while loading). A layer is visible only when its own tick and its group tick are both on (the layers event
  `{visible}`, V.q('layers') and the permalink).
- `V.q('mod')`: the page's mod folder, or null when there is none or the page's game is not the viewer's target; a part
  keys its own map-list or pack cache on target, game and mod (the list and hover parts do).
- addLayer also takes `source` (the product name): a layer with no draw and no tiles is fetched (GET layer
  name=<source or id>) and drawn by the shell, view.env holds the envelope; with no canvas context the visible source
  layers are still fetched so the item lists fill. `tool: true`, or a layer whose id is a tool id, marks a tool layer:
  never in the permalink or V.q('layers'), and a permalink leaves its tick alone. No layer and no tile header is
  fetched while the open map's document is read (its GET, or the doc job a pick started): the mode comes with the
  document; a failed read lets them fetch (R25). Every layer and tile key holds the context (game, folder, mod), and a
  tile answer is taken only while the tile store it was asked for is the page's, so a late answer from an old context
  or a closed map never lands. The parts' own keys hold it too (R25): the base part's entries and its topographic tile
  header key carry game and mod, and the water list key is target, game, mod, map, mode, side and kind. Tiles are drawn
  snapped to whole pixels by their edges (kit.tileBox), so neighbouring tiles share an edge with no gap and no overlap.
- `addPanel` also takes `name` (R25): the panel's block is named by name (words or a mapviz.* key), else by the key
  mapviz.<id>.title when it exists, else 'Panel'. Its place (`_t.placeOf`): a panel whose id is a tool id is a tool card
  on the stage, shown only while that tool is in use; `list` goes into the map picker; a right or bottom panel goes to
  its `tab` (layers, inspect, analysis, pictures), else to the tab TABOF gives its id, else right to inspect and bottom
  to the bottom row; a left panel stays in the left column. `V.tab(id)` shows a tab without keeping it; `V.q('tab')`,
  `V.q('picker')` and the `'picker' {open}` event follow the right column tab and the map picker.
- `V.relist()`: the shell draws the item lists of the visible layers again (a part calls it when its list() answer
  changed outside the shell's fetch).
- Outside V: `EXT_SCREENS.mapviz.kit = {colour, colourCss, b64, decode, gridDraw, vectorDraw, toScreen, toWorld,
  tileBox}` (b64(text) -> Uint8Array; tileBox(hd, z, tx, ty, view, w, h) -> [x, y, w, h], the tile's screen rectangle
  snapped to whole pixels by its edges, R25), `.keys`, `._t` (pure helpers for tests; tileBox is there too).
- Job stages shown in words: wait, read, write, tiles, draw, build, place, masks, defs, picture; any other stage shows
  the plain 'working' word. A part that emits a new stage name adds the key `mapviz.shell.stage.<name>` (en, ru, uk, zh)
  and the name to the shell's list, or lists it in shell.test.js as deliberately 'working'.
- Routes as built: the mod folder goes as `modDir` (GET, repeatable) and `modDirs` (POST job body), never in a link;
  error status per code: MV_USAGE 400, MV_NOT_FOUND 404 (params.need), MV_BUSY 409, MV_CANCELLED 409, MV_REFUSED 403,
  MV_NOT_BUILT 501, MV_FAULT 500.
As built after R16 (R24; additive, no server, route or job change; tools/gui/ext/mapviz/README.md "What a part may rely
on" has the long form):
- `V.q('jobs')` = the page jobs queued or running, `[{id, what, state, stage, done, total, queue, target, map, args,
  text}]`, args = the fields map, mode, side, kind and size of the job's request as it was posted, those that are set
  (the page adds mode, side and kind to every job but maps, whether the job keys them or not; R25), text = the job line
  words of that job; absent on a stub V (read as no job). Event `job`: the same form once when the job is posted, on
  every poll answer of a page job, and once more with `end: true` when it ends; there is one poll chain and one end event per job id: a request the runner
  joins to a running job (the same id) gets that job's promise, and an id that ended is never written or told again
  (R25). A row or status whose product is not made shows the words of a running job in place of its Make button only
  when the job has the same what, target and map and its args fit the need's args (every key field the need names has
  the same value in the job; the map field is matched leniently; R25). So a pass job of kind inf leaves Make it on the
  pass layer of kind tank, and a second press of a matching row posts nothing.
- Event `products {}`: once when a page job ends done (when it ends while the page is hidden, once when the page is
  shown again), and when the cache answer (entries, bytes) changes on a refresh. Every row, tile header, status, hover
  pack and list in the "not made" state then asks once again; one whose own job still runs waits for it. The base part
  also asks its current choice with no draw (R25): on a map open with its document, a refresh, the 'doc' event, a
  'products' event, after its own Make, and whenever its status finds no entry (one fetch per key; none while the
  document is read or while a job of that choice's what runs).
- The 'map' form gains `user` (true only for a map the user picked: the list or a pick request). A part may start a job
  by itself only on `user: true` (the base part starts the topographic picture once per open; a refresh, S.mapKey or a
  permalink never starts one, design 11.1). The shell starts a layer's job by itself only on the user's own tick of a
  layer not made (the call its Make button makes; never on a refresh, a permalink, the stored state or a view of the
  layer list, tools/gui/ext/mapviz/README.md Layer list). A change of game, game folder or mod closes the open map (map, mode,
  document, layer data, tiles, cursor, tool, readout, permalink, item lists) and emits 'map' with key null; the S.mapKey
  the old game left is not opened in the new game. A permalink opens only in the game it names: for another game it
  waits, the page says which game it needs, and it opens once the page game becomes that one (before R24 it switched the
  viewer's game). A shown page takes such a change in at once, without waiting for the GUI's refresh (R25): on any
  `V.api` read or `V.job`, a draw or a user action (pan, zoom, cursor, mode, side, kind, tick, tool, clear cache, copy
  link) it first closes the map, drops held reads as stale and asks the map list of the new context once, then goes on.
  A map pick that takes the change in this way came from the list of the old context, so it is dropped: no map set,
  S.mapKey not written, no document read, no job; the page says the closed-map line (mapviz.shell.closed), and the
  list draws the new context's list in place of the old one. This holds for the list's mode buttons and for any part's
  pick request too; a mode picked in the shell's select for the map the change closed is dropped the same way. A map
  picked after that (from the new list) opens in the new context. A read of the closed map (doc, layer, hover, tiles)
  or a job other than maps asked in the old context is rejected `{stale: true}` and never sent.
- The base part's own memory key of the topographic picture leaves the mode out (job topo has no mode key, section 6.2),
  so a mode change does not turn it back into "not made".
- Layout: the shell adds one page style, off while blocks are arranged (body.arranging): the view area (the head row
  mv.head with title, map picker button, mode, phase, side and kind button groups and the view buttons, then the main
  row; block mv.top) is one column of the window height under the page header; the main row takes what is left (at
  least 320 px): left column 220 to 250 px, right column 340 to 370 px with the tabs Layers, Inspect, Analysis and
  Pictures, both scrolling inside and each with a fold button, the stage between them; the stage holds the scale bar,
  the first-time help, the tool cards, the cursor strip and the job line (a strip at the bottom, seen without scrolling,
  R25). Under 900 px the column grows with its content: the stage, then the tabs, then the left column. The item lists
  are a fold at the end of the left column. ext/mapviz/README.md (Layout, Map picker, Page keys) has the details. Every block carries a plain-word name (data-blkname) in the page language for the Arrange view.
- A hidden Map Viewer reads nothing (no palette, cache, map list, document, layer, tile or hover call; only the polls and
  cancels of its running jobs go); the first read comes when the screen is shown, and every later show refreshes it.
  While hidden nothing is drawn or asked again, and a read a part asks for through V.api waits until the show, or is
  rejected `{stale: true}` (mapviz.err.MV_CANCELLED) when the map was closed or the context changed meanwhile. Reads are
  held only while the page is hidden; a shown page is never held or frozen (R25). A refresh while hidden takes in a
  change of game, folder or mod: it closes the open map with no read, and the next show reads the map list of the new
  context. A map-list read held while hidden and rejected stale on the show is no fault: the list part clears its busy
  state and asks once more at once; a second stale answer leaves no status, and the next refresh asks (no loop, R25).
Layer groups: base, height, game, water, objects, cover, sight, strong, fairness, checks. Groups strong and fairness hold
every layer of design 6, the mortar and artillery danger layer included (group strong). Part order (ext/mapviz/index.js,
coordinator): shell, list, base, game, water, hover, measure, profile, then layers, objects, card, strong, checks,
pictures, export, style. Permalink `#go=page:mapviz/<target>~<map key>~<mode>~<layers>~<x,y,zoom>`; never a mod path.
The shell builds the permalink and the view export from the visible layers minus every layer of groups strong and
fairness, unless the shell's "include analysis" tick is set (off by default, never saved in the permalink; owner
decision 13). Later parts get this without a shell change.
Shared state: S.mapKey keeps the Maps page form `map/<map key>`. The shell reads key = S.mapKey without its leading
`map/` and writes S.mapKey = 'map/' + key, only while the page's game is the viewer's target. No other part touches S.mapKey.
On a LAN Remote device (page RMT true) the page makes no mapviz call and shows the view-only note.
Never: a colour literal (section 5.5); a write.

### 1.11 Waves C, D, E (frozen at the start of that wave)

| Part | Short entry |
|---|---|
| sight MV-SIG | rules/sight: sight grid (7 u, GoH 5 u), viewshed and fire line; products sight.*.mvg; CLI `sight` |
| cover MV-COV | rules/cover: edges, engine port, terrain lip, concealment; products cover.*.mvg, cover.edges.json; CLI `cover` |
| obstacles + travel MV-PAS | rules/pass: obstacle masks, travel.<side>.<kind>.mvg, routes.json; CLI `pass obstacles\|travel\|routes` |
| render L2 L3 MV-R2 | render: decals, water planes, objects; scene pack; CLI `render l2\|l3\|pack` |
| paint MV-PNT1 | paint: style table (staff, painted, recon, sketch -> paint/<id>/index.js `draw(input, opts)`), marks, paper, thumbnail; CLI `paint styles\|draw\|marks`; a style without index.js lists as not built |
| previews MV-PRV | previews: targets per game, composition, BC1 writers, backups, dry run; CLI `previews plan\|write\|check`; own GoH mods write rule (writeguard refuses every GoH path) |
| page MV-PG2 MV-PG3 MV-PG4 | page parts of section 1 table |
| strong MV-STR | strong: estimator and checks; CLI `strong` |
| render L4 MV-R3 | render: light and shadow; CLI `render l4` |
| paint MV-PNT2, MV-PNT3 | paint/recon, paint/painted, paint/sketch: `draw(input, opts)` only |
| editor routes MV-EDR | edshot `shot`, `calibrate` + uidrive extension (game wave) |

## 2. Common CLI flags and rules

### 2.1 Game naming

| Target (CLI, page, routes) | exe id given to vfs | Default folder |
|---|---|---|
| `as64` | `as64` | gamedir.resolve().dir (the MoW:AS2 install; AS64 shares it) |
| `mowas2` | `mowas_2` | gamedir.resolve().dir |
| `goh` | `goh` | gamedir.goh() |

The exe id is never guessed from the folder: `--target` is required by every command that reads a game. The AS64 build
folder ("<AS64 build folder>") is only needed by edshot (its own --root).

### 2.2 Flags

| Flag | Value | Meaning |
|---|---|---|
| `--target` | as64, mowas2, goh | game id; required to read a game |
| `--game` | folder | install folder of that target; default per 2.1 |
| `--mods` | a,b,c | stack in mount order, last wins; `name:ver` allowed; default none (vanilla) |
| `--mod-dir` | folder, repeatable | one mod folder (it holds resource/ or mod.info), mounted on top of --mods in the order given (vfs opts.modDirs); never searched for --mods names |
| `--map` | map key | section 3.1 |
| `--mode` | mode id | the .mi stem (combat, battle_zones, ...); default: every mode |
| `--phase` | n | frontline phase; default all |
| `--side` | a, b, both | default both |
| `--kind` | inf, mg, at, tank | unit kind; default inf |
| `--in` | folder, repeatable | earlier products searched for inputs by file name; a missing input is computed in process through the owner's exports |
| `--out` | folder | where products go; required by product commands; refused inside any install (checkOut) |
| `--json` | | stdout = one JSON value; errors as JSON too (2.5) |
| `--progress` | file | progress lines (section 7) |
| `--cancel-flag` | file | cancel when this file exists (section 7) |
| `--size` | px | picture long side |
| `--seed` | n | random seed for anything randomised; default 1 |
| `-q` | | no text on stderr except errors |

Every product command also writes `<out>/reads.json` = `{v:1, inputs:[input]}` (section 8.3) so the runner can build the
manifest.

### 2.3 Map key

The map folder path under `resource/map/`, forward slashes, lower case as stored: `multi/1v1_road`,
`multi/a_frontlines/<map>`, `multi/0_frontlines/1v1_barbarossa` (GoH), `single/<campaign>/<mission>`. Never with the
`map/` prefix, never assumed to be `multi/<map>`. The vfs key of a file is `resource/map/<map key>/<file>`.

### 2.4 Exit codes

| Code | Name | Error code | When |
|---|---|---|---|
| 0 | OK | | done |
| 1 | FINDINGS | | done, and the product lists problems (failed defs, gaps, check hits, differences) |
| 2 | USAGE | MV_USAGE, MV_FAULT | bad flag or value; or an unexpected fault |
| 3 | NOT_FOUND | MV_NOT_FOUND | game, map, mode, def, file or input absent |
| 4 | NOT_BUILT | MV_NOT_BUILT | part or command not built yet |
| 5 | CANCELLED | MV_CANCELLED | cancel flag seen |
| 6 | REFUSED | MV_REFUSED | write guard, preflight or a rule refused |
| 7 | BUSY | MV_BUSY | a lock is held (section 8.4) |

### 2.5 stdout and stderr

stdout carries data only: the text table of a command, or with --json exactly one JSON value (a line or a pretty block).
stderr carries messages: `mapviz <part>: <message>`. With --json an error also goes to stdout as
`{"v":1,"error":{"code":"MV_NOT_FOUND","msg":"no map multi/x","part":"mapkit","detail":{...}}}`. Messages are plain
English for the console; the page translates by error code, never by message text. MAPVIZ_DEBUG=1 adds the stack on stderr.

## 3. mapdoc/1

One JSON document per map, game and stack: `mapdoc.json`, written by mapkit. Grids stay binary (section 4).

### 3.1 Frame and units

- Positions are world units (u), 20 u = 1 m. x east, y north, z up. map.ply Y = -y.
- Cell of a point: `i = floor((x + net.offX) / cell)`, `j = floor((y + net.offY) / cell)`; row j = 0 is min world y.
  Truncate, never round. Lattice point (i, j) = world `(i * cell - offX, j * cell - offY)`.
- Yaw in degrees: 0 faces +x, +90 faces +y.
- Radii in u (AS2 zone radius = max(1, zone) x 20; GoH zone radius raw u, never x 20).
- Boxes `[x0, y0, x1, y1]` with x0 <= x1, y0 <= y1, in u.

### 3.2 Document

```
{ v: 1,                                  // mapdoc format version (mapdoc/1), not the contract version
  game: 'as64'|'mowas2'|'goh',           // target
  key: 'multi/1v1_road',                 // map key
  stack: { mods: ['a','b:1'], hash: 'hex16' },
  cell: 10,                              // u per cell (net.cell)
  upm: 20,                               // u per metre
  net: { w, h, offX, offY, cell, version,     // net.cell === cell
         types:     [{ id, name, engine }],   // id = file-local id in map.net, engine = engine type id or null
         materials: [{ id, name, engine }] }, // engine = engine material id (fixed 0..8, terrains.set from 9) or null
  boxes: { world:  [x0,y0,x1,y1],        // union of every Clips world box (minimap frame, design 0)
           auto:   [x0,y0,x1,y1] | null, // the [auto] (default) clip's world box
           camera: [..] | null, pather: [..] | null,   // of the default clip
           named:  [{ name, world, camera, pather, water }] },   // every clip; water = its {water} or null
  water: { level: -58,                   // W of the map file in u (field rules)
           source: 'map'|'none',
           ocean: { zlevel, kind: 'lake'|'sea'|'river'|null, active: bool } | null },
  modes: [ { id: 'battle_zones', file: 'battle_zones.mi', env: 'name'|null,
             water: number|null,          // the mode's own {water} in its .mi Clips, else null
             spawns: [{ name, uid, team, order, x, y, z, yaw, player: int|null, phase: int|null }],
             flags:  [{ name, def, uid, team: 'a'|'b'|null, order, x, y, z, phase: int|null, slaveOf: name|null,
                        zoneId: string|null,
                        zone: { kind: 'circle', rA, rB } | { kind: 'poly', pts: [[x,y]..] } | null,   // pts absolute world u
                        fort: [{ x, y, yaw, kind }] }],
             points: [{ kind: 'ammo'|'base'|'evac'|'spawn_ext'|'other', name, uid, x, y, z, team, phase }],
             clipsBySide: [{ team, phase, clip }] } ],
  entities: [{ uid, name: string|null, def, x, y, z: number|null, yaw, scale, texmod: string|null, unlinked: bool,
               player: int|null, src: 'map'|'mi', mode: string|null,
               decal: { order, color: [r,g,b,a], opacity } | null,
               link?: { root: uid, place },                                   // R16: only on a part a {Link} seats
               seats?: { <place>: { unlinked: bool, entity: uid|null, def: string|null } } }],   // R16: only on a root with seats
  covers: [{ mode, sector, x, y, raw }],     // SP {Covers}; raw = the record's text form; [] for MP maps
  pictures: { minimap: P|null, preview: P|null, preview_small: P|null, header: P|null, header_interface: P|null },
              // P = { file, ext, size: [w,h], bytes, format, mips, shownAs, mount: 'pak'|'mod', shadowed: [file] }
  notes: [{ code, text, at: [x,y]|null }] }
```

Field rules:
- null: a value the files do not hold is null, never 0 or '' (exceptions: water.level 0 when absent with source 'none';
  lists are [] when empty). Unknown keys from the files are dropped, except `raw` in covers.
- stack.hash = sha16 (the first 16 hex of sha1) of: '' when there are no mods and no mod folders; else the mod names
  joined by ',' + "\n" + the resolved mod folders (lower case, forward slashes) joined by ';'.
- types: AS2 and AS64 map.net names map to engine ids 1..7 by name. GoH engine type id = the index as read from map.net
  types[] when the name is in the fixed GoH table (1 ground, 2 no_pass, 3 shallow_water, 4 water, 5 deep_water, 6 swamp,
  7 road, 8 no_pass_human, 9 snow, 10 forest, 11 slope; the same in every GoH map, scan of the 166 maps in GoH
  resource/map/multi.pak) [V data]. A version-2 name outside these tables: target as64 and mowas2 give engine id 0, as the
  engine's FindGroundType does, and type 0 is blocked ground; target goh gives 15 (other)
  [I]; both with note MAPKIT_TYPE_UNKNOWN.
- materials: matched by name, never by id across games (AS2 and GoH ids differ); an unknown name gives engine null and
  note MAPKIT_MATERIAL_UNKNOWN. The material layer's meta.names gives each id its name; colours are looked up by name.
- water: water.level = the last `{water N}` among all Clips of the map file, in file order; 0 and source 'none' when
  there is none. modes[i].water = the last `{water N}` among that mode's .mi Clips, else null. The W of a mode =
  modes[i].water when not null, else water.level; with no mode given, W = water.level (design 0). Every rule, picture
  and depth of a mode uses that W. water.ocean.zlevel is never W.
- spawns: map_point entities with `{visor SpawnPoint}`, plus spawn_point entities with `Extender "spawn_point"
  {mapPoint m}{pos n}` (frontline modes, AS2 and GoH): x, y, z, yaw from the spawn_point entity, team and phase from
  map_point m, order = n. team 'a' / 'b' as in the file.
- flags AS2: zone circle, rA = max(1, zoneA) x 20, rB = max(1, zoneB) x 20; the entity's xform scale is ignored (design
  2; the 1v1_road flag has scale 0.75 and r 240).
- flags GoH: when zoneId is not empty and a Helpers `{zone "poly"}` has Name == zoneId -> poly, pts = that zone's own
  `{position}` (x, y) + each `{Point dx dy}`; else when `{zone {radius r}}` has r > 0 -> circle rA = rB = r (raw u); else
  zone null. Match by zoneId, never by the flag name (they differ: name center1, zoneId f1). Vanilla GoH zones all have
  radius 0 and their polys a position of their own, not the flag's [V data].
- entities: def = the entity name as written in the map or .mi record (`{Entity "flag_point_1" ...}` -> 'flag_point_1'),
  lower case, no folder, no extension. z null when the record has none (the engine snaps it to ground); src 'mi'
  entities carry mode.
- boxes.named[].world is design 2's named[].box.
- pictures: always the five keys minimap, preview, preview_small, header, header_interface, in every game; a stem with
  no file in the map folder is null. Resolved by the order of
  tools/lib/model/picture.js winner() (.tex, then .ebm, then the last existing of the image extensions; never hand-rolled);
  shownAs = the extension the engine will load; shadowed = losing files.
- Notes (stable codes, text plain English): MAPKIT_PATCH_SKIPPED, MAPKIT_TYPE_UNKNOWN, MAPKIT_MATERIAL_UNKNOWN,
  MAPKIT_MODE_UNKNOWN (multiplayer maps only), MAPKIT_WORLD_UNION_DIFFERS, MAPKIT_ENTITY_OUTSIDE, MAPKIT_NO_CLIPS,
  MAPKIT_PICTURE_UNREAD, MAPKIT_PARSE_ERROR, MAPKIT_LINK_NESTED.
- link and seats (R16, additive, mapdoc stays v 1): a row gets `link {root, place}` when a {Link} puts that part on a
  seat of root `root` (uid), and a root with {Placer {State}} records gets `seats {<place>: {unlinked, entity, def}}`:
  entity = the uid of the record linked there or null, def = the seat's {Entity} swap (lower-case def name) or null.
  Both keys are present only on rows that have them (the fixture has none). place names are lower case. Each row takes
  the links of its own file (map or .mi). A Link through more than one seat, or with no plain part uid, gives note
  MAPKIT_LINK_NESTED (none on vanilla maps). A doc with neither key on any row is an old doc: entcat reads the map file
  for its links (section 1.7).
- MAPKIT_PARSE_ERROR: one note per map or .mi file the strict reader (tools/lib/sdlx.js) refuses, in doc() and in
  grids(); text names the file, the first error's line and its code; at null. The flags and spawns that could be read
  are still given.

Per-game notes:
- AS2 and AS64: cell 10; uid u16; zones zoneA/zoneB; modes combat, battle_zones, captureflag, frontline,
  battle_zones_8x8 (id = file stem).
- GoH: cell 5 or 10 (read the header); uid u32; modes battle_zones, ammunition, evacuation, campaign_capture_the_flag,
  frontlines; .mi files may `(include "../x.inc")`; water.ocean from `{Ocean}` (draw only; rules use level); flags carry
  fort slots from the fortification extender.
- On a multiplayer map an unknown mode gives a generic points list and note MAPKIT_MODE_UNKNOWN, never a failure.
- A .mi under a single-player map (map key starting `single/`) is that mission's own file, not a multiplayer mode: its
  mode id is the file stem, lower case like every vfs key (for example '0'), it gets no MAPKIT_MODE_UNKNOWN note, and its points are read
  with the generic rules.

### 3.3 Known answers (tests)

| Game | Map | Query | Answer |
|---|---|---|---|
| mowas2 | multi/1v1_road | battle_zones flag f1 (def flag_point_1, xform scale 0.75) at (-183.5, 304.88) | cell (366, 259), circle rA = rB = 240 u, height 0, type 7 road |
| mowas2 | multi/1v1_road | spawn a1 (2501.09, 1228.63) yaw 177.45 | cell (635, 351) |
| mowas2 | multi/1v1_road | net | cell 10, w 727, h 505, offX 3849.5276, offY 2289.5276; water none (level 0) |
| mowas2 | multi/8v8_winter_walk | water.level | -58, source 'map' |
| any | fixture | section 10.4 | |

## 4. Grid files (.mvg) and layer names

### 4.1 File layout

One layer per file, little endian. Header then data.

| Offset | Type | Field | Value |
|---|---|---|---|
| 0 | 4 bytes | magic | ASCII `MVG1` |
| 4 | u16 | version | 1 |
| 6 | u16 | hdrBytes | header size incl. name and meta, multiple of 8 |
| 8 | u32 | w | columns |
| 12 | u32 | h | rows |
| 16 | f64 | cell | u per column and per row |
| 24 | f64 | ox | world x of column 0 west edge (cell sample) or of lattice column 0 (lattice sample) |
| 32 | f64 | oy | world y of row 0 south edge / lattice row 0; row 0 = min world y |
| 40 | u8 | etype | 1 u8, 2 i8, 3 u16, 4 i16, 5 u32, 6 i32, 7 f32, 8 rgba8 (4 bytes per element, r g b a) |
| 41 | u8 | sample | 0 cell (value covers [ox+i*cell, ox+(i+1)*cell)), 1 lattice (value at ox+i*cell) |
| 42 | u16 | flags | bit 0 nodata valid, bit 1 bit mask (u8/u32 bits are flags, meta.bits names them) |
| 44 | f32 | scale | physical value = raw * scale + offset (1 when unused) |
| 48 | f32 | offset | 0 when unused |
| 52 | u32 | reserved | 0 |
| 56 | f64 | nodata | raw value meaning no data (compared before scale) |
| 64 | u16 | nameLen | bytes of name |
| 66 | u16 | metaLen | bytes of meta |
| 68 | u32 | reserved | 0 |
| 72 | nameLen bytes | name | ASCII layer name (4.4) |
| .. | metaLen bytes | meta | JSON, ASCII (non-ASCII escaped), `{}` when none |
| .. | zero pad | | to hdrBytes |
| hdrBytes | w*h elements | data | row-major, row 0 first (min world y), column 0 first (min world x) |

A reader refuses a file with another magic, version > 1, a size that is not hdrBytes + w*h*elementSize, or an etype
outside 1..8. File name = `<layer name>.mvg`.

### 4.2 Lattice versus cell

map.net heights are lattice samples: w = net.w, h = net.h, sample 1, ox = -offX, oy = -offY; heights between samples are
bilinear. Cell layers (types, materials, classes, masks) use the same w, h, ox, oy with sample 0, except where design 3
sets another grid: landform.* has cell = 20 u (1 m), the same ox, oy, w = ceil(net.w * net.cell / 20), h likewise.
Readers take w, h, cell, ox, oy from the header, never from net.

A cell rule (re-type, water bands, depth) uses h = the lattice sample at (i, j), the cell's south-west corner: map.net
stores height, type and material in one record per (i, j).

Off ground (R16, as built R24): a cell, or a pixel of a lattice picture, whose own south-west lattice point (i, j) is
height nodata (the raw value equal to the height grid header's nodata: -32768 for i16, 65535 for u16 of map.net version
0) is off ground, past the ground mesh: no water (water.band 0, water.drown 0, water.depth nodata), pass 0 and cost -1,
alpha 0 in pic.topo and pic.l0. Only the cell's own point decides; a nodata point at another corner does not make the cell
off ground, it only drops out of a mean (shade, tint, heightAt). The page's hover readout uses the same rule: it shows "no
ground" when the cell's own sample is nodata, while measure and profile read heightAt (section 1.1), which weights the
other corners.

Pictures made from a lattice grid (pic.topo, pic.l0): one pixel per lattice point, pixel (i, j) covering the cell whose
south-west corner is lattice point (i, j), the same frame every cell layer uses (w = net.w, h = net.h, sample 0, the
same ox, oy). So the sidecar box is [ox, oy, ox + w * cell, oy + h * cell], the last row and column lie past the last
lattice point, and the relief sits half a cell from the true lattice position; accepted in version 1.

Pictures read from files (shipped minimaps, editor shots, imported PNG): file row 0 = min world y (design 0, texture
row 0 = min world y [V]; for the editor PNG [T -> G1]), so file row 0 is grid row 0 with no flip. A picture a
reader cannot decode (dds.js before BC5, a broken file) is left out with a note (MAPKIT_PICTURE_UNREAD in mapdoc).

### 4.3 In-memory grid object

`{ name, w, h, cell, ox, oy, etype: 'u8'|'i8'|'u16'|'i16'|'u32'|'i32'|'f32'|'rgba8', sample: 'cell'|'lattice',
scale, offset, nodata: number|null, meta: {}, data: TypedArray }` (rgba8 data = Uint8ClampedArray of w*h*4).

### 4.4 Layers (waves A to D)

| Layer | etype | sample | Owner | Values |
|---|---|---|---|---|
| height | i16 (u16 for map.net version 0, as mapnet.parse reads it) | lattice | mapkit | u; scale 1; meta `{unit:'u', upm:20}`; after the land patches. R16: a lattice point no face of the ground mesh (map.ply) covers, and no land patch wrote, is nodata (-32768; 65535 for u16), as is a covered rim point more than 2 u off the mesh height [I]; meta.offGround = the count, present only when map.ply was read; nodata stays null when nothing is marked (the fixture: no map.ply). Readers treat nodata as no value, comparing the raw value with the header's nodata field, never with a fixed number (R24; off-ground cells: 4.2) |
| gtype | u8 | cell | mapkit | engine type id after the land patches and the load re-type (0 = unknown name in AS2 and AS64, blocked; 1..7 AS2; 1..11 GoH; 15 other; section 3.2) |
| gtype.stored | u8 | cell | mapkit | engine type id after the land patches, before the re-type |
| material | u8 | cell | mapkit | engine material id; meta `{names:{id: name}}` |
| slopecls | u8 | cell | raster | 0..14 (class x 6 deg) |
| shade | u8 | lattice | raster | 0..255 |
| landform.r10, landform.r50 | u8 | cell, 1 m grid (4.2) | raster | 0 flat, 1 ridge, 2 hollow, 3 slope, 4 peak, 5 pit; radius in m in the name |
| regions | u32 | cell | raster | region id, 0 none |
| water.band | u8 | cell | water | 0 none, 1 no prone, 2 swim; 0 on an off-ground cell (4.2, R24); meta.offGround = the water-typed off-ground cells, only when not 0 |
| water.drown | u32 | cell | water | bit mask (flags bit 1), meta `{bits:[class id], sources:['stack'\|'vanilla']}`: bit k set = class meta.bits[k] drowns; meta.bits = the class ids whose depthM is not null, in profile order, at most 32; sources = where each bit's depth comes from, in bit order (R17); 0 on an off-ground cell (R24) |
| water.depth | i16 | cell | water | round(W - h) in u (W of the mode) where the re-typed gtype is 3..5, negative where such a cell lies above W (no band, no drown bit there; R17), else nodata -32768; nodata on an off-ground cell (R24) |
| pass.<kind> | u8 | cell | pass | 0 nodata, 1 open, 2 slow, 3 blocked by slope, 4 blocked by ground; 0 on an off-ground cell (R24); meta.offGround = those cells, only when not 0 |
| cost.<kind> | f32 | cell | pass | path cost factor (groundCost + 1 + heightCost); nodata -1; -1 on an off-ground cell (R24) |
| pic.topo, pic.l0 .. pic.l4, pic.edshot, pic.<style> | rgba8 | cell | raster, render, edshot, paint | picture; cell = u per pixel; sidecar `<name>.json`; pic.topo and pic.l0: alpha 0 on an off-ground pixel (R24); pic.l0 meta.offGround = those pixels, only when not 0 |
| sight.*, cover.*, travel.<side>.<kind>, strong.* | | | waves C, D | named at that wave's start |

Grid file IO is lib/raster/gridfile.js and PNG is lib/raster/png.js (both written in wave 0, section 1.2); every other
part uses them and never writes a second encoder.

Picture sidecar `pic.<x>.json` (every picture, whoever makes it): `{v:1, layer, w, h, box:[x0,y0,x1,y1], cell,
rowOrder:'minY-first', target, stackHash, mapHashes:{name: sha1}, rung, env, gaps:[code], approx:bool,
brightness:'fitted'|'unverified', made}`; v, layer, w, h, box, cell, rowOrder and made are always set,
made = ISO 8601 time stamp (not the ms of the cache manifest), the others are null when the producer does not know them.
pic.topo sets target, stackHash and mapHashes from its --in folders (R22, section 1.2); render sets them from the doc
and the files it read.

### 4.5 A map's set in the cache

All layers of one job sit in one cache entry folder `e/<key>/` (section 8) as `<layer>.mvg`, with JSON products beside
them (mapdoc.json, contours.json, water.labels.json, `pic.<x>.json` sidecars) and tiles under `tiles/<base>/`.

## 5. Data the page reads

All answers are JSON. Binary data is base64. The page decodes grids with DataView (little endian).

### 5.1 Grid envelope (GET layer)

```
{ v:1, kind:'grid', name:'water.band', map:'multi/1v1_road', target:'mowas2',
  w, h, cell, ox, oy, etype:'u8', sample:'cell', scale, offset, nodata, meta:{},
  data:'<base64 of the raw data block, LE>',
  pal:'water.bands', palette:<that part of palette.json> | null }
```

### 5.2 Tiles (pictures)

- Tile size 256 px, PNG RGBA. Screen orientation: tile row 0 = max world y (north on top), so a tile is the picture rows
  flipped. Level z = 0 is full resolution. Level z has w_z = ceil(w / 2^z), h_z = ceil(h / 2^z); a level-z pixel is the
  mean of the existing level-(z-1) pixels in its 2 x 2 (premultiplied, section 9.2). zmax = the smallest z with
  w_z <= 256 and h_z <= 256.
- The tile grid is anchored at the north-west corner: tile x.y = 0.0 holds picture row h_z - 1 in its top row and
  column 0 in its left column. Padding (alpha 0) is on the east and south edges. Tile count = ceil(w_z / 256) x
  ceil(h_z / 256). raster cutTile is the only code with this maths; jobs tiles.cut calls it.
- Name: `tiles/<base>/<z>/<x>_<y>.png`, base = picture name without `pic.` (topo, l0, l1, edshot, staff, ...), x from
  west, y from north.
- Batch answer (GET tiles): `{v:1, kind:'tiles', base, z, zmax, w, h, ox, oy, cell, box, tiles:[{t:'3.1',
  png:'<base64>'} | {t:'9.9', missing:true}]}`; w, h, ox, oy, cell from the pic.<base>.mvg header (z 0), box from its
  sidecar; at most 16 tiles per answer, in the order asked.

### 5.3 Vector envelope

`{v:1, kind:'vector', name, map, target, items:[item], pal, palette}`. Items hold ids, codes and numbers, never words
(the page translates). Positions in world u; angles in degrees counter-clockwise from +x in the world frame.
A vector product file on disk (contours.json, water.labels.json, water.checks.json, objects.json) is exactly
`{v:1, kind:'vector', name, items:[item]}` with the items of this table; the route adds map, target, pal and palette
when it answers. spawns, flags and boxes have no file: the route builds them from mapdoc.json (section 6.1).

| name | item |
|---|---|
| spawns | `{kind:'spawn', mode, name, team, order, x, y, z, yaw}` |
| flags | `{kind:'flag', mode, name, team, x, y, z, zone:{kind:'circle', rA, rB} \| {kind:'poly', pts} \| null, phase}` |
| water.labels | `{kind:'waterLabel', band, region, x, y, area (m2), depthMin, depthMax (m), drown:[class id], merged:[band]}` |
| boxes | `{kind:'box', box:'world'\|'camera'\|'pather'\|'auto', clip, b:[x0,y0,x1,y1]}` |
| contours | `{kind:'contour', level (m), index:bool, pts}` and `{kind:'contourLabel', level (m), x, y, angle}` |
| water.checks | `{kind:'check', code, x, y, region, cells, area (m2), box:[x0,y0,x1,y1], cls?}` (codes of section 1.8; cls = the drown class id, on BLOCKED_NOT_DEADLY only; R17) |
| objects | `{kind:'object', uid, def, category, fp:{kind, pts}, zMin, zMax}`; fp.kind 'none' = one point (skip it or draw a dot); uids can repeat (R15) |
| checks | `{kind:'check', code, x, y, region}` |

### 5.4 Palette (palette.json)

Colours are `#RRGGBB` or `#RRGGBBAA`. Hatch = `{color, angle (deg), gap (px), width (px)}`. Stops = `[{at 0..1, color}]`
over the map's own height range (or the layer's value range). Entries:

| Key | Holds |
|---|---|
| v, about | version 1 and one line |
| sides | a (blue `#0072B2`, filled shapes), b (vermilion `#D55E00`, outlined shapes), neutral; each `{fill, line, wash, text, shape}` |
| water | bands[] by water.band code (none, noProne, swim) with fill and hatch; drown, check (fill + hatch); label (text, halo) |
| cover | bands[] by code 0..5 (none, lie, low, kneel, squat, stand); conceal (fill + hatch, never shielding); lip; tick (protected side) |
| height | stops (tint), below, above, shade (light, dark, strength), contour (line, index, width, indexWidth, label, halo) |
| slope | classDeg 6, blockDeg (wheeled 24, tracked 30, infantry 42), classes[15] by slope class (class 0 clear) |
| ground | types[] by engine type id 0..11 (8..11 occur in GoH only), other (any other id, 15 included), materials by name (land-cover tint for maps and painted fallback) |
| pass | codes[] by pass code 0..4 (fill, hatch on blocked), travel (stops, iso line), route (line, casing) |
| masks | outsidePather, outsideWorld, noData, blocked, degraded, approx: fill and hatch (every mask is hatched, in every style) |
| sight | seen, hidden, partly, ring, fan (wave C) |
| danger | stops (wave D) |
| strong | stops, symbol (wave D) |
| marks | flagRing, flagRingWidth, spawnArrow, measure, measureCasing, profile, scaleBar, northArrow, halo, cursor |
| styles.staff | paper, ink, relief, tint stops, contour, contourIndex, water, waterLine, wood, woodStamp, building, buildingLine, road, roadCasing, grain |
| styles.painted | landCover by material name (+ wood, building, water, other), relief, posterize 6, kuwahara 8 sectors, canvas, grain |
| styles.recon | ramp (grey stops), curve (pairs in 0..1), grain, vignette, pencil (a, b, mark, width) |
| styles.field_sketch | paper (grey as the stock GoH minimaps), graphite, light, hachureFromClass, roadSmudge, buildingFill, buildingLine, waterHatch, crest, crestDash [6,3,1,3], tree, thumbnail (pencil, hachureFromClass 3, minStroke 2) |

Style ids: the paint table and the page use `staff`, `painted`, `recon`, `sketch`; palette entry for `sketch` is
`styles.field_sketch`. A part reads palette.json and never writes it; a new key goes through section 11. No palette key
is a CSS colour name (red, grey, ...): tools/gui/test/test-theme.js flags `strokeStyle = pal.x.red` in page code.

### 5.5 The colour rule

Page code holds no colour literal (#hex, rgb(), hsl(), named colours): tools/gui/test/test-theme.js sweeps every file
under tools/gui/ext/ outside its ALLOW list. Chrome (panels, buttons, text, focus) uses the CSS tokens (--bg, --fg,
--card, --line, --acc, --hint, --ok, --err, --warnfg, --sel, --s1..--s12) through `V.token(name)` and redraws on the
`theme` event. Data colours come only from palette.json, through `GET palette` once and the `palette` field of each
envelope. Pictures made by a CLI part take their colours from palette.json too.

### 5.6 Hover pack (GET hover)

```
{ v:1, kind:'hover', map, target, mode, step:k, w, h, cell:<cell*k>, ox, oy, waterLevel,   // waterLevel = W of the mode
  layers:{ height:{etype:'i16'|'u16', scale:1, nodata:<header nodata>, data}, slopecls:{etype:'u8', data},
           gtype:{etype:'u8', data}, material:{etype:'u8', data, names}, 'water.band':{etype:'u8', data} } }
```
k = the smallest integer with ceil(w/k) * ceil(h/k) <= 2^21; nearest sample (every k-th cell from 0). Depth = waterLevel
- height, computed in the page. height.nodata = the height grid header's nodata (R24): -32768 (i16) or 65535 (u16) when
the grid marks points past the ground mesh, null when it marks none. 'water.band' is left out while the water part is not
built. The page shows "no ground" for the height (and the depth of a water cell) when the cell's own sample is nodata
(section 4.2).

## 6. Routes and the job protocol

### 6.1 Routes

All under `/api/x/mapviz/`, served by ext/mapviz (shell.server.js in wave B). GET reads query, POST takes
`application/json`. Common parameters: `target` (as64 | mowas2 | goh, required where a game is read), `game` (install
folder of that target; the server default otherwise, as section 2.1), `mods` (comma list in mount order), `map`, `mode`,
`side`, `kind`. A LAN Remote device never reaches these routes: no mapviz route is on remote.js ALLOW, so gui.js
answers 403 `{error, key:'rmt.viewOnly'}` before dispatch (and the page makes no call there, section 1.10).

| Method, path | Query / body | Answer | Errors |
|---|---|---|---|
| GET palette | | palette.json | |
| GET parts | | `{v:1, parts:[{part, id, wave, state}], styles:[{id, state}]}` | |
| GET maps | target, game, mods | the `maps` job result if cached: `{v:1, maps:[...]}`; else 404 need | 400 MV_USAGE |
| POST job | `{what, target, game?, mods?, map?, mode?, side?, kind?, size?, args?}` | `{id, shared, state, queue}` | 400 MV_USAGE, 404 MV_NOT_FOUND |
| GET job | id | job (6.3) | 404 MV_NOT_FOUND |
| POST cancel | `{id}` | `{id, state}` | 404 |
| GET jobs | | `{running:[job], queued:[job], done:[job]}` | |
| GET doc | target, game, mods, map, entities=0\|1 | mapdoc.json; with entities=0 the route strips them (entities []) | 404 need |
| GET layer | ..., name | grid or vector envelope (5.1, 5.3); name spawns, flags or boxes is built by the route from mapdoc.json, filtered by mode and phase (need = `{what:'doc'}`) | 404 need |
| GET hover | target, game, mods, map, mode | hover pack (5.6) | 404 need |
| GET tiles | ..., base, z, t=x.y,x.y (at most 16) | tile batch (5.2) | 400 over 16, 404 need |
| GET cache | | `{v:1, root, bytes, cap, entries, jobs}` | |
| POST cache/clear | `{scope:'all'\|'map', target?, map?}` | `{removed, bytes}` | 409 MV_BUSY while a job runs on it |
| later waves | export, previews/plan, previews/write, import, probe | frozen at that wave | |
| POST previews/deploy-list | common, mod, source?, marks?, compose?, set?, title?, minimapSize? | `{v, target, map, kind, size, files[{id,file,path,size,format,mips,action,source,marks,compose,problem}], skipped[{id,file,path,why}], needs[{what,args}]}`: what "Write all previews into the mod" would write; mod folder only | |
| POST previews/plan, previews/write | ..., all:true | every file the game reads for the map at its own size (not with targets) | PRV_SET |
| GET pictures/export | ..., out=WxH (64..8192 per side), fit=stretch\|backdrop\|crop (default stretch) | the PNG at exactly that size; the long side may then be up to 8192 (4096 without out) | 400 MV_USAGE PRV_SIZE |

Error answer: a route throws `Object.assign(new Error('<code>'), {status, key:'mapviz.err.<code>', params:{msg,
need?:{what, args}}})`; gui.js answers that status with `{error:'<code>', key, params}`. The page reads the code from
the reply's error and the need from params.need. "need" = the product is not in the cache; the page shows a button
that POSTs that job. A GET never starts a job; a page refresh never starts a job.

### 6.2 Jobs

Request key = the cache key of section 8.2: target, game, mods, modDirs and map (not for maps) always enter it; of the
other request fields only those in the row's Keys column do (defaults filled). Identical requests share one job while it
is queued or running; once done they share the cache entry. The GUI routes compute keys only through jobs/cache.js
entryKey(o) with the table.JOBS row; no route builds a key itself. A need is requested with the same request reduced
to its own keys.

| what | Runs | Heavy | Timeout s | Needs | Keys | Products |
|---|---|---|---|---|---|---|
| maps | mapkit list --out | no | 120 | | | maps.json |
| doc | mapkit doc (every mode, entities) | no | 120 | | | mapdoc.json |
| grids | mapkit grids | no | 120 | | mode | height, gtype, gtype.stored, material |
| terrain | raster terrain | yes | 120 | grids | | slopecls, shade, landform.r10, landform.r50 |
| topo | raster topo + tiles | yes | 600 | doc, grids | size | pic.topo + tiles/topo |
| water | water masks | yes | 120 | doc, grids | mode | water.band, water.drown, water.depth, water.labels, water.checks |
| pass | pass terrain (per kind) | yes | 120 | grids, terrain | mode, kind | pass.<kind>, cost.<kind> |
| entcat | entcat map | yes | 600 | doc | | entcat.json, objects.json |
| l0 | render l0 + tiles | yes | 600 | doc, grids, terrain, water | mode, size | pic.l0 + tiles/l0 |
| l1 | render l1 + tiles | yes | 600 | doc | mode, size | pic.l1 + tiles/l1 |
| c0 | render c0 | yes | 600 | l1 | mode, size | c0.json |

size defaults (table.SIZE, filled into the key): topo and l0 null = run with no --size, one pixel per cell (cell
resolution); l1 and c0 2048.
mode enters grids, water, pass and l0 because W is the mode's (section 3.2); no mode = the map file's W. entcat has
600 s, not design 11.1's 120 s for analysis, on purpose: a cold GoH index takes 47 s and a def 1.45-3.9 s (design 4).
Heavy jobs run one at a time in submit order (visible queue); light jobs up to 2 at once beside it. A job's needs run
first as their own jobs (shared when identical). The hover pack is assembled by the route from grids, terrain and water
of the asked mode.

### 6.3 Job record

`{id, what, key, state:'queued'|'running'|'done'|'failed'|'cancelled'|'timeout', stage, done, total, elapsed (ms),
queue (position, 0 running), error?:{code, msg}, result?:{entry, products:[name]}}`. The page polls GET job every 500 ms
while it shows a job, every 2 s otherwise.

## 7. Progress and cancel

- The runner starts the CLI with `--progress <jobs/<id>/progress.jsonl> --cancel-flag <jobs/<id>/cancel> -q --json`,
  the part command and the tiles step (`jobs tiles --in <out>/pic.<base>.mvg --out <out>/tiles/<base>`) alike; every
  part's product command must accept --json. A failed job's error code comes from the stdout error line (section 2.5),
  checked against the exit code, else from the exit code alone.
- Progress line (JSON, one per line, appended): `{"t":1234,"stage":"tiles","done":12,"total":64}`; t = ms since start.
  Written on every stage change, at most 4 per second otherwise, and at least every 2 s of work (heartbeat). The
  dispatcher appends the end line `{"t":..,"end":"done"|"failed"|"cancelled","code":n}` after run returns.
- Parts use `progress(o)` from mapviz.js: `p.stage(name, total)`, `p.step(n)`, `p.set(done, total)`, `p.check()`. Each
  call checks the cancel flag; a part calls one of them between tiles, between stages and at least once per second of work.
- Library calls report through an optional `o.tick(done, total)` (R18, as built): lib/raster grid functions (section
  1.2), lib/mapkit grids (1.1), rules/water masks, labels, checks and rules/pass mask (1.8). done never falls, the last
  call is (total, total); a CLI binds tick to its reporter, so a cancel throws MV_CANCELLED out of the call. Known gap:
  one sdlx parse of a large GoH map file is about 326 ms without a call (fix row).
- Cancel: the flag file exists -> the call throws MvError MV_CANCELLED -> exit 5, end line "cancelled". The runner waits
  10 s, then kills the child. Timeout: the runner writes the flag, waits 10 s, kills; state 'timeout', error code
  MV_CANCELLED (a cancel and a timeout share the code; the state tells them apart).
- After a cancel, a timeout or a failure nothing enters the cache: products go to `jobs/<id>/out/`, which is deleted; an
  entry exists only after its manifest.json is written (8.2). Earlier finished needs stay cached.
- Pool children (`work`) get only `--cancel-flag` (the job's flag file), never `--progress`. The parent part reports
  progress with p.step() as children finish; a child's exit code is its only result channel.

## 8. Cache

### 8.1 Root and tree

Root = `toolcache.dir('mapviz')` (tools/lib/toolcache.js; ARSENAL_CACHE replaces the root, every test sets it).
```
<root>/index.json                       {v:1, cap, entries:{key:{what, part, target, map, bytes, made, used}}}
<root>/e/<key>/manifest.json            written last: the entry is complete only when it exists
<root>/e/<key>/<layer>.mvg, *.json      products (section 4.5)
<root>/e/<key>/tiles/<base>/<z>/<x>_<y>.png
<root>/jobs/<id>/{job.json, progress.jsonl, cancel, stdout.txt, stderr.txt, out/}
<root>/runs/<run id>/                   edshot files moved out of an install
<root>/locks/heavy, <root>/locks/<key>  mkdir locks
<root>/locks/index                      short mkdir lock around every index.json update (2 s wait, 10 s stale)
```
made and used are ms since 1970 (Date.now()). index.json may lag the disk: evict, clear, size and stats merge the
complete entries on disk that it lacks, and an index failure never fails a commit.

### 8.2 Key and manifest

key = first 16 hex of sha1 of the lines `mapviz/<CONTRACT>`, `<part>@<part VERSION>`, for a job with needs
`needs:<part>@<part VERSION>,...`, `<what>`, `<target>`, `<game folder, resolved, lower case, forward slashes>`, `<mods
joined by ,>`, `<modDirs joined by ;>`, `<map key or ->`, `<variant: the canonical JSON (keys sorted) of the request
fields in the job's Keys column, section 6.2>`, joined by "\n".
`<part VERSION>` = the `version` of that part's cli.js (`mapviz.findPart(part).load().version`); a cli.js without an
integer version is "broken" (section 1.0).
The needs line (R24, as built; no contract version change) names the parts of every job below this one in the job table
(section 6.2 Needs, followed all the way down; a need that is not a job is skipped, a cycle ends the walk), sorted by
name, each once, the job's own part included when a need runs on it; for example l0 has `needs:mapkit@2,raster@3,water@2`
and c0 `needs:mapkit@2,render@4` (render@2 at R24). A job with no needs (maps, doc, grids) has no such line, so its key is as before. So a
version bump of mapkit alone changes the key of every job built on its doc or grids (terrain, topo, water, pass, entcat,
l0, l1, c0), and a bump of raster alone that of terrain, topo, pass and l0; nothing made on the old grids is reused. Every key of a job with needs changed once with this
line; the entries made before it are no longer found and go by LRU eviction. A need part whose version is not an integer
is MV_FAULT; a submit whose job or any job below it has a part that is not built is refused with MV_NOT_BUILT, also when
the job itself is cached.

manifest.json: `{v:1, part, partVersion, needVersions:{<part>: <version>}, contract, what, variant, target, game, mods,
modDirs, map, made, inputs:[input], deps:[{what, key, made}], files:[{name, bytes}], notes:[], complete:true}`; made = ms
since 1970; needVersions = the needs line as an object, {} for a job with no needs.

### 8.3 Inputs and the stat check

input = `{kind:'pak'|'loose', file (absolute), key?, size, mtimeMs}`; a pak counts once whatever entries were read.
Opening an entry stats every input and every dep's manifest; any size or mtime change, a missing file or a dep made later
than this entry makes it stale (re-run). Known gap: a new loose file that would now shadow an input is not seen
(section 12).

### 8.4 Locks, cap, clear

- Locks are directories (mkdir is atomic); a lock older than 10 min is stale and taken over. `locks/heavy` = the heavy slot.
- Cap 2 GB (`cap` in index.json). After each commit, whole entries are removed least recently used first (index `used`),
  skipping locked ones, until the total is under the cap.
- "Clear map cache" (POST cache/clear, `jobs cache --clear`): removes e/, index.json and finished jobs/; keeps runs/
  and running jobs. Scope 'map' removes only that map's entries. Clear refuses with MV_BUSY while a fresh key lock
  (locks/<key>) is held: scope 'all' on any, scope 'map' on one whose owner is that map (and target, when given) or has
  no owner; locks/heavy alone does not block. So nothing a running job uses is touched.

### 8.5 jobs/cache.js exports

`root(o)`, `entryKey(o) -> key` (o also takes `jobs`, the table the needs are followed in, `needVersions` already worked
out, and `versionOf(part) -> integer`, the version reader, default partVersion; R24), `needParts(row, jobs?) -> [part]`,
`needVersions(row, jobs?, versionOf?) -> {part: version}`, `keyLines(c, part, version, needs?)`, `open(key) -> {dir, manifest} | null (absent or stale)`, `commit(key, outDir, manifest)
-> dir` (rename into e/<key>, write manifest last, update index), `use(key)`, `size() -> bytes`,
`evict(cap?, {keep}) -> [key]`, `clear('all' | {scope:'all'|'map', map, target?}) -> {removed, bytes}` (MV_BUSY,
section 8.4), `fresh(manifest) -> bool`, `CAP` (2 GB), `stats() -> {v:1, root, bytes, cap, entries, jobs}`,
`lock(name, owner) -> {release, refresh} | null`, `locked(name)`, `at(root, {now, cap})` (the same functions bound to
one root and clock).

## 9. Rules for every part

### 9.1 Writes

- Installs and vanilla data are read-only. The only writes in an install: edshot's run files (design 8), moved out.
- Products go to --out; --out is checked by `checkOut` (writeguard.refuseWrite, allowGameMods false). Previews (wave C)
  write only under a mod the owner names, with its own GoH rule.
- `previews write --all [--yes | --plan-hash h]`: every file the game reads for the map, each at its own size and form,
  in one journal entry (undo --n N puts it all back in one step). A file that fails is listed in
  `failed[{id,path,code,why}]`, the rest are written, exit 1. --all with --targets: exit 2 PRV_SET.
- Text data a part writes for a game: CRLF; string values UTF-8; identifiers ASCII. mapviz's own JSON products: LF.
- Never put a user name, a home folder or a drive path into a source, test or fixture: write `<game>`, `<AS64 build
  folder>`, `<cache>`.
- No part and no test starts a game, an editor or the GUI server, and no part spawns anything but process.execPath
  running mapviz.js (the jobs pool and the page route). Exceptions: edshot preflight reads the process list with
  tasklist (1.6); besides tasklist, a read-only `reg export` may run through tools/lib/gamedir.js when a command
  resolves a game folder, as it does for every part through checkOut; edshot `shot` and `calibrate` in wave E
  (MV-EDR), under its brief.
- No part depends on an engine change: nothing calls, waits for or tests a command that the shipped exes and the
  existing as64_ed lack (design 14).
- Outside test/ folders a part ships only .js, .json, .txt, .yaml, .md and .set files (the exe embeds only these,
  design 3): no PNG or other binary asset; textures and paper are generated in code. No folder may be named test,
  cache, node_modules, dist, out, work or _retired except a part's test/ folder (the exe build skips them).

### 9.2 Determinism and golden tests

- Same inputs give the same bytes: fixed tile grid, no accumulators across tiles, sorted blending in a tile, noise from a
  hash of world position and --seed, no Math.random, no Date in products except `made` fields (left out of hashes).
- Colour maths on stored values, never sRGB-converted (design 7). Every downsample, resample, mip and blend of our own
  premultiplies by alpha first and un-premultiplies after, with integer rounding (x * a + 127) / 255. Sampling that must
  match the engine uses the file's straight alpha.
- Golden test: integer stages compare a byte hash (sha1 of the data block); float stages allow a difference of at most 1
  level on at most 0.1% of pixels. Goldens live flat in the part's test/ folder.

### 9.3 Page parts

ES5, no backtick, no dollar-brace, no innerHTML; leaf blocks (el(tag, {blk:id})); every visible string in en, ru, uk, zh;
no engine file names in window text; the page builds with no canvas context (test DOM) and shows a hint leaf; every
canvas, image and animation-frame call is guarded; one seeded-defect test per part; a lang value starting with `TODO:`
fails the test. Lang values write AS64 in capitals, never a bare as64 (tools/gui/test/test-lang.js); ids and keys are
unaffected.

### 9.4 Tests

- Each mapviz part has its own `test/*.test.js` under its folder. A test runs alone: `node <file> [scratch dir]`; it
  makes its scratch dir (default under os.tmpdir()), sets ARSENAL_CACHE inside it before requiring anything that
  caches, and writes nowhere else.
- The last line is `PASS mapviz <part> (N)` with N = checks passed; a failure prints `FAIL mapviz <part>: <what>` lines
  and exits 1. tools/mapviz/test/run.sh runs them all (`sh tools/mapviz/test/run.sh [scratch]`) and ends with `PASS`.
  Page parts: section 1.10 (ext/mapviz/test.js runs them).
- lib/model parts (MV-BC1, MV-SCN) follow the tools/lib/test form instead: `tools/lib/test/model-<x>.test.js` exports
  `module.exports = (t, assert) => {...}` (sync, no scratch argument, temp files under os.tmpdir()) with the standalone
  tail of model-dds.test.js (run alone it prints `N passed` then `PASS`). The coordinator adds
  `require('./model-<x>.test')(t, assert)` to tools/lib/test/test.js; mapviz run.sh does not run them.
- Seeded defects: each test plants at least one bad input (a corrupt header, a wrong frame, an out-of-range code) and
  checks it is caught.
- Tests use the fixture (section 10) first. A test that needs an installed game finds it through tools/lib/gamedir.js
  only and otherwise prints `skip <what>: no <game> install` and still passes: MoW:AS2 / AS64 data =
  `gamedir.resolve().dir` holding resource/map.pak; GoH = `gamedir.goh()` holding resource/map/multi.pak. No test needs
  an env variable to find MoW:AS2 or GoH. AS64 build folder = env MAPVIZ_AS64_DIR only. MAPVIZ_NO_GAME=1 skips them all.

### 9.5 Reports and fix rows

Each part writes `tools/mapviz/<part dir>/REPORT.json` (lib/model parts: `tools/lib/REPORT-<part>.json`):
`{tool:'mapviz <part>', id, rows, files:[path], tests:'PASS'|'FAIL', real:[...], specIssues:[...], libGaps:[...],
tags:{V, I, T}, notes, indexLine:'<name> | <run line> | <rows> | <what>', fixRows:['- what | where | how to check']}`.
Page parts have no folder under tools/mapviz and ext/mapviz/test.js refuses any non-part file in sub/: their reports
live at `tools/gui/ext/mapviz/REPORT-<builder>.json`, same shape (R21).
The coordinator copies indexLine into tools/index/maps.md and fixRows (prefix MAPVIZ_) for every [T].

## 10. Fixture map

### 10.1 Where and how

Both files are the coordinator's and are written before wave A. They sit flat in tools/mapviz/test/ (testdeps counts
test/*.js as source; a file in a test/ subfolder would choose no suite under test-all --changed).
- `fxmake.js`: `make(dir, {form:'as2'|'goh'}) -> {gameDir, target, map:'multi/mv_fixture', mods:[], modDirs:[<dir>/mods/mvfx]}`
  builds a fake install into dir, a scratch dir the test gives (deterministic, loose files, CRLF text).
  `node tools/mapviz/test/fxmake.js --check <scratch>` checks fxanswers.json against a fresh make().
- `fxanswers.json`: route answers for page tests (doc, layer water.band, hover, maps), hand-written from the fixture's
  own definition and 10.4. A page test that needs a tile makes a flat one with png.js.
- Page tests read fxanswers.json; part tests compare against 10.4. So an answer never depends on a part's output.
  Nothing under test/ is embedded in the exe (test folders are skipped).

### 10.2 AS2 form (target mowas2)

- Install: `<dir>/as2/mowas_2.exe` (empty file), `resource/map/multi/mv_fixture/{map, map.net, combat.mi, battle_zones.mi,
  frontline.mi}`, `resource/set/interaction_terrain/terrains.set` (ground, road, country_road). No pather.set and no
  interaction files: parts fall back to their vanilla tables and say so. No map.ply (section 12).
- Entity defs, in the form tools/lib/sdlx.js and the shared mdl reader parse: `resource/entity/fx/{fx_tree, fx_wall,
  fx_house, fx_bush}.def` + .mdl (+ the volume files the mdl names), each with one box volume and an `{Obstacle}` Obb2:
  tree trunk r 0.3 m h 8 m (able visible, bullet, obstacle); wall 4 x 0.3 x 1.2 m (visible, bullet, obstacle); house
  8 x 6 x 6 m (visible, bullet, obstacle); bush r 1 m h 1.2 m (visible only, no Obstacle). Road decal:
  `resource/entity/landscape/stamp/road/fx_road.def` (sprite 64 px, Scale 1).
- map.net: cell 10, w 128, h 96, offX 640, offY 480 (world x -640..640, y -480..480), types and materials in AS2 order.
- Clips: `[auto]` world [-600,-440,600,440], camera [-560,-400,560,400], pather [-580,-420,580,420], `{water -20}` in every clip.
- Ridge: crest along x = -200; height h = 60 x max(0, 1 - |x + 200| / 100) u (3 m crest).
- Pond: centre (300, -200); ring by distance r from the centre to lattice point (i, j):

| r (u) | h (u) | stored type | load type | depth |
|---|---|---|---|---|
| 0 to 60 | -200 | 5 | 5 deep water | 9 m |
| 60 to 90 | -80 | 4 | 4 water | 3 m |
| 90 to 120 | -50 | 4 | 4 water | 1.5 m |
| 120 to 160 | -28 | 3 | 3 shallow | 0.4 m |
| 160 to 180 | -10 | 3 | 1 ground (PAINTED_ABOVE_LEVEL) | none |

- Road: rows j 67..69 (y 190 to 220) type 7, material road (engine 9).
- Modes: combat.mi (spawns a1, b1), battle_zones.mi (spawns a1, b1 + flags f1, f2, f3; f3 has xform scale 2),
  frontline.mi (map_point fa1 at (-400, 0) team a phase 1; spawn_point entity sp1 at (-450, 20) with
  `Extender "spawn_point" {mapPoint fa1}{pos 1}`).
- Entities (map file, uids 0x1001..0x1008): fx_tree at (-400,300), (-420,340), (-380,360); fx_wall (100,-100) yaw 90;
  fx_house (-450,-300) yaw 30; fx_road decal (0,200) scale 2; fx_bush (150,300), (170,320).
- Mod `mvfx` (folder `<dir>/mods/mvfx`, given as --mod-dir, no --mods): shadows combat.mi with spawn a1 moved to
  (-503.7, 52.2).

### 10.3 GoH form (target goh)

`<dir>/goh/binaries/x64/call_to_arms.exe` (empty); cell 5, w 256, h 192, same offsets and world; same ridge, pond, road,
defs and entities. Modes battle_zones.mi and frontlines.mi (the same records as AS2's battle_zones.mi and frontline.mi
except the zone keys). f1 `{zone {radius 240}{zoneId ""}}` (raw u); f2 `{zone {radius 0}{zoneId "zf2"}}` with a Helpers
`{zone "poly" {position -180 260 0}{Name "zf2"} {Point ..}}`, points relative to that position
[[-100,-80],[100,-80],[140,40],[0,120],[-120,40]]; f3 `{zone {radius 200}{zoneId ""}}`.

### 10.4 Known answers

| Query | AS2 form | GoH form |
|---|---|---|
| spawn a1 (-503.7, 12.2) yaw 0 | cell (13, 49) | cell (27, 98) |
| spawn b1 (497.5, -15.5) yaw 179.5 | cell (113, 46) | cell (227, 92) |
| flag f1 (0, 0) zone 12/12 | cell (64, 48), circle r 240 | cell (128, 96), circle r 240 |
| flag f2 (-200, 300) zone 8 | cell (44, 78), circle r 160 | poly (zoneId zf2), 5 points absolute (-280,180), (-80,180), (-40,300), (-180,380), (-300,300) |
| flag f3 (300, 200) zoneA 10 zoneB 6, xform scale 2 | cell (94, 68), rA 200, rB 120 (scale ignored) | circle r 200 |
| frontline spawn sp1 (-450, 20) via mapPoint fa1 | team a, phase 1, order 1, cell (19, 50) | cell (38, 100) |
| height at x -200 / -250 (any y) | 60 u / 30 u | same |
| slopecls cell (39, 48) / (64, 48) | 5 / 0 | (78, 96) 5 / (128, 96) 0 |
| cell (94, 28) | type 5, band 2, drown: every class with a depth | (188, 56) same |
| cell (101, 28) | type 4, band 2, drown: every class with a depth (3 m) | |
| cell (104, 28) | type 4, band 2, depth 1.5 m, drown 1.2 m classes only | |
| cell (107, 28) | type 3, band 1, no drown | |
| cell (111, 28) | type 1 ground, band 0, check PAINTED_ABOVE_LEVEL | |
| water.level | -20, source 'map' | -20 |
| with --mod-dir `<dir>/mods/mvfx`, combat a1 | cell (13, 53) | |

## 11. How this contract changes

- Frozen from the start of wave A. A part that needs a change stops, writes the need in its REPORT.json specIssues and
  tells the coordinator; it does not change the format on its own.
- The coordinator edits this file, bumps "Contract version" at the top (and CONTRACT in mapviz.js when a format or
  interface changes), adds one line to "Changes" (date, section, what), and names the parts that must follow.
- Adding a layer name, a palette key, a note code, a job what or a route in a later wave is the coordinator's edit at
  that wave's start (section 1.11) and needs no version bump when nothing existing changes.
- Wave C, D and E entries in 1.11 are filled in at the start of that wave.

## 12. Left open by wave 0

| Point | Default taken (until the coordinator or a game check says otherwise) |
|---|---|
| boxes.world is the union of Clips world boxes (design 0) while the engine's default clip is [auto] | keep both: world = union, auto = [auto]; note MAPKIT_WORLD_UNION_DIFFERS when they differ; G1 settles which frames the minimap |
| a GoH or mod ground type name outside the fixed tables | settled (R2): as64 and mowas2 engine id 0 (blocked, as FindGroundType); goh 15 (other) [I]; note MAPKIT_TYPE_UNKNOWN (section 3.2) |
| GoH engine type id | settled (R6): the index in map.net types[] when the name is in the fixed GoH table, as built [I] |
| map.net version 0 heights | settled (R7): u16 as built (section 4.4); no vanilla map is version 0 |
| hillshade lights | settled (R14): main light 315 at 45 with fills 270, 360, 225 (weights 0.6, 0.15, 0.15, 0.1), z from relief, fine and coarse scales, odd reflection at the map edge, nodata flat and filled ring by ring before the blurs (R24, section 1.2) [I]; the look is shown to the owner at milestone M1 (fix row MAPVIZ_RAS_SHADE) |
| landform radii | 10 m and 50 m (layers landform.r10, landform.r50) [I] |
| render default size | settled (R10): l1 and c0 2048 px long side (design 7 R0 tile size), 4096 on request; l0 with no --size at cell resolution |
| AS64 build folder for tests | env MAPVIZ_AS64_DIR only; skipped when unset |
| cache staleness when a new loose file shadows an input | not detected; "Clear map cache" fixes it; the manifest stores winners so a later check can add it |
| covers field list (SP {Covers}) | `{mode, sector, x, y, raw}` with raw text; fields named after a reader is written |
| unit def per kind for PatherID | pass picks the first vanilla unit def of each kind (inf rifleman, mg team, at gun, medium tank) and names it in the profile; a kind setting per mod later |
| previews GoH mods write rule | previews (wave C) writes its own rule: `<GoH>/mods/<id>` only, never resource/ or Workshop |
| picture sizes per job | settled (R10): topo and l0 run with no --size, at the map's cell resolution (1 px per cell); l1 and c0 default 2048 px (section 6.2) |
| light job parallelism | 2 beside the heavy slot |
| fixture map.ply | absent in version 1 of the fixture; L1 tests use a real game or a ply the render test writes itself |
| GoH fixture .mi records | same records as AS2 except the zone keys and the Helpers polys (10.3); GoH `.info` files left out |
| carry.js .ebm reference follower (design 7 L1) | not exported in wave 0: MV-R1 re-writes it inside render/ and reuses only the exported `parse` of tools/mapport/carry.js. Wave B close (coordinator): parse ends a token at an unclosed quote at the end of the text instead of recursing forever; render still guards it (RENDER_MATERIAL_BAD) |
| width of water.drown | u32 bit mask, class ids from meta.bits only (section 4.4) |
| which request fields enter a job key | the Keys column of section 6.2 |
| pool kernel interface | sync `run(task, io)`, files flat in the part folder, no relative require (section 1.5) |
| tile grid anchor and odd sizes | north-west anchor, ceil sizes, padding east and south (section 5.2) |
| editor shot or imported PNG over a non-square world box | box resample to square pixels (section 1.6) |
| spawn_point spawns | position from the spawn_point entity, team and phase from its map_point (section 3.2) |
| grid file and PNG code needed by parallel wave A parts | gridfile.js and png.js written in wave 0 (section 1.2) |
