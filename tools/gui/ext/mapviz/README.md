# Map Viewer page parts (tools/gui/ext/mapviz)

The Map Viewer page for AS64, MoW:AS2 and Gates of Hell. Contract: tools/mapviz/README.md section 1.10 (parts, page API, part
order), 5.5 (colour rule), 6.1 (routes), 9.3 (page rules), 9.4 (tests). Behaviour: section 11.
`index.js` and `test.js` here are the coordinator's; each part in `sub/` has one owner (tools/mapviz/README.md section 1).

## How a part plugs in

`index.js` holds a literal parts table, one line per part, in this order:
shell, list, base, game, water, hover, measure, profile, layers, objects, card, strong, checks, pictures, export, style.
Each line spells out three requires (`./sub/<part>.client`, `./sub/<part>.lang.json`, `./sub/<part>.server`) so the
single-exe build keeps them. A part needs no change in `index.js`: dropping its files into `sub/` is enough.

- A part file that is absent is skipped: that part is not built yet.
- A part file that exists and throws, or that requires a module that is missing, stops the GUI with its error. A broken part is
  never skipped in silence. A file that exports null (or a lang file that holds `null`) is broken too, not absent.
- script = the skeleton's own script, then each built part's client string in table order.
- lang = the skeleton's keys (`mapviz.nav`, `mapviz.page.*`) plus every part's keys. A key defined twice is an error.
- routes = every part's routes. A route defined twice is an error.
- While `sub/shell.client.js` is absent, the skeleton's own script is the "not built yet" screen: one hint leaf in the page
  language, no call. It also sets `EXT_SCREENS.mapviz.parts = []`, so a part built before the shell does not stop the page.
  Once the shell is there, the skeleton adds nothing to the script: the shell defines `EXT_SCREENS.mapviz` and the page API `V`.
- A new part name (not in the table above) is a contract change (tools/mapviz/README.md section 11): the coordinator adds its line.

## The files of a part

| File | Shape |
|---|---|
| `sub/<part>.client.js` | `module.exports = String.raw` + a backtick string of ES5 browser code. Inside it: no backtick, no dollar-brace, no innerHTML; DOM through `h()` and `textContent`; text through `tx(key)`; leaf blocks `h(tag, {blk: id})`; colours only through `V.token(name)` and palette.json (no colour literal). The shell sets `EXT_SCREENS.mapviz` and `V`; every other part only pushes `{id, init(V)}` to `EXT_SCREENS.mapviz.parts`. |
| `sub/<part>.lang.json` | `{"en": {...}, "ru": {...}, "uk": {...}, "zh": {...}}`, the same keys in all four, each starting `mapviz.<part>.` (route error texts `mapviz.err.<code>`, README 6.1). No value starts with `TODO:`. AS64 in capitals; no dash as a separator. |
| `sub/<part>.server.js` | `module.exports = { routes: { 'GET /api/x/mapviz/<path>': async (url, body, ctx) => answer } }`. Every route under `/api/x/mapviz/`. Reads only; nothing is written by a page route except through the jobs of README section 6. |
| `sub/<part>.test.js` | runs alone: `node sub/<part>.test.js [scratch dir]`; sets ARSENAL_CACHE inside its scratch dir; plants at least one bad input; last line `PASS mapviz <part> (N)`, a failure prints `FAIL mapviz <part>: <what>` and exits 1. |

`node tools/gui/ext/mapviz/test.js [scratch dir]` checks the joined page (the rules tools/gui/test/test-ext.js applies to every
ext, the four languages, the script rules, colour literals, the table against README 1.10 and the files in `sub/`, the hint
screen) and runs every `sub/*.test.js` alone. Its last line is `PASS mapviz page (N)`. The GUI suite reaches it through
tools/gui/test/test-ext.js once the page is registered.

## What a part may rely on

The shell (`sub/shell.client.js`, its header lists the whole page API `V`) promises these to every other part:

- **The map pick request.** A part asks for a map with `V.emit('map', {key, mode?, pick: true})`. The shell takes that
  request itself and never hands it on: it sets the map (and the mode when given), loads the map document, and then emits
  its own form. A `'map'` listener only ever sees `{key, mode, side, kind, doc}`: `doc` is null while the document loads,
  and the event comes again once it is there. The same form follows every change of mode, side or kind. The form also
  carries `user`: true only for a map the user picked (the list, a pick request), false for a map opened from `S.mapKey`
  on a refresh or from a permalink. A part may start a job by itself only on `user: true` (the base part does for the
  Topographic picture; design 11.1 keeps "a refresh never starts a job").
- **Closing a map.** When the page game, the game folder or the mod changes, the shell closes the open map: map, mode,
  document, layer data, tiles, cursor, tool, readout and permalink go, and the parts get `'map'` with `key: null` (W2).
  The `S.mapKey` the old game left is not opened in the new one; a new `S.mapKey` written later is. A permalink opens only
  in the game it names: for another game it waits and the page says which game it needs, and it opens when the page game
  becomes that one.
- **Jobs on the page.** `V.q('jobs')` gives the page jobs queued or running: `{id, what, state, stage, done, total, queue,
  target, map, args, text}`. `args` holds the job's own key fields as it was posted (map, mode, side, kind, size), and
  `text` is the job line words (stage and progress). The `'job'` event carries the same form on every answer, and once
  more with `end: true` when the job ends. A part whose product is not made shows the words of a running job in place of
  its Make button only when that job is of the same `what`, target and map and its `args` fit the need's args: every key
  field the need names has the same value in the job (the map field is matched leniently). So a pass job of kind inf
  leaves the Make button on the pass layer of kind tank, and a topo job of size 1024 leaves it on a 2048 picture. A second
  press of a matching row never posts a second job (W3). `V.q('jobs')` is absent on a stub V: parts read it as no job.
- **One poll per job.** When the runner joins a request to a running job (the same id comes back), `V.job` gives the same
  promise again: one poll chain per id and one `end` event. An id that ended is never written or told again.
- **Asking again.** The `'products'` event `{}` comes once when a page job ends done, and when the cache answer (entries,
  bytes) changes on a refresh. Then every row, status and list in the "not made" state asks once more; one whose own job
  still runs waits for it (W1). The shell does this for its layer rows and tile headers itself. The base part asks for
  the current choice with no draw: at a map open with its document, on a refresh, on the `'doc'` event, on `'products'`,
  after the user's own Make and whenever its status finds no entry for the current choice (once the page is live: a
  refresh or a map event came). One fetch per key; none while the document is read or while that choice's own job runs
  (its words show instead). So its status never stays on "Reading the picture" when the base layer or its group is off
  or no canvas draws.
- **Hidden (quiet).** The page is quiet only while it is hidden (the section is hidden, or the page shows another screen).
  While hidden nothing is drawn, no "not made" row asks again and no `'products'` event comes; a job that ends done
  meanwhile is remembered and the page asks once when it is shown. A read a part asks for through `V.api` while hidden is
  held: it goes when the page is shown, or it is rejected with `{stale: true}` (key `mapviz.err.MV_CANCELLED`) when the map
  was closed or the context changed meanwhile. Job polls and cancels still go. A refresh while hidden takes in a change of
  game, folder or mod: it closes the open map and reads nothing; the next show reads the map list of the new context.
- **Shown, context changed, no refresh yet.** The GUI sets the game folder before its own refresh (it waits for a server
  answer first). A shown page is never frozen in that window: the moment it sees the game, folder or mod differ from the
  context of its open map (on a map pick, on any `V.api` read or `V.job`, on a draw, on a user action: pan, zoom, cursor,
  mode, side, kind, tick, tool, clear cache, copy link) it takes the change in first, exactly as a refresh does (closes the
  map, drops held reads as stale, asks the map list of the new context once), and then goes on with that action. A pick
  that takes the change in (a map or mode button of the list the old context drew, or any part's pick request) is dropped:
  no map is set, `S.mapKey` is not written, no document is read and no job is posted; the page says the closed-map line
  and the list of the new context is drawn in place of the old one. A pick made after that opens as usual and stays open
  through the GUI's refresh that follows. A read of the
  open map (doc, layer, hover, tiles) or a job (not the map list job) asked in the old context is rejected with
  `{stale: true}` and never sent; any other read (map list, cache line, palette) goes on in the new context. A mode picked
  for the map the change closed is dropped with it.
- **Job polls.** A poll that gets no answer (a network blip, a server fault) is tried again up to 3 times in a row, 1 second
  apart (a good answer resets the count), before the job ends on the page as failed; an answer of the server that refuses
  the poll (4xx) ends it at once. 20 answers in a row whose state the page does not know (not queued, running, done,
  failed, cancelled or timeout) end it as failed too, so a poll never loops for ever. Every failed end says the job-failed
  line (`mapviz.shell.jobFailed`) before the promise rejects, so a caller that ignores the rejection still leaves a line.
- **Fetch keys.** Every layer and tile key holds the context (game, folder, mod): the shell's own, and the parts' own
  caches (base entries, water item lists, the hover pack). A tile answer is taken only while the tile store it was asked
  for is the page's (a closed map, a cleared cache or another map starts a new store), so an answer that comes late from
  an old context never lands.
- **`V.q('mod')`.** The page's mod folder, or null when there is none or the page's game is not the viewer's target. A
  part keys its own caches on target, game and mod (`V.q('target')`, `V.q('game')`, `V.q('mod')`).
- **A held read dropped.** A part that gets `{stale: true}` for a read held while the page was hidden treats it as no
  fault: the map list asks once more at once (a second stale answer leaves no status, and the next refresh asks).
- **Layers wait for the document.** While the open map's document is being read (its GET, or the doc job a pick started)
  no layer and no tile header is fetched: the mode comes with the document. A failed read lets them fetch. The parts see
  the same state as `V.q('docBusy')` (true from the pick until the document landed or failed) and hold every fetch of
  their own that carries the mode while it is true (base: tile header, tiles, contours, ground layers; water: the
  labels and checks lists). The `'doc'` event `{key, ok}` comes once when the read ended (`ok: false` when it failed or
  is not made), after the `'map'` event of a document that landed; a part that waited asks then, once. The hover part
  waits on `V.doc` itself and asks for its pack on the `'map'` event that carries the document; on `'doc'` it only says
  its status again (after a failed read it asks nothing). While its status asks for a Make, a job makes the pack, or the
  read failed, its rows show the position only, never "reading...". The game, measure, profile and list parts fetch
  nothing that carries the mode. The water list
  still fetches `water.labels` itself next to the shell's own fetch of the same layer: the shell gives a part no way to
  read the layer envelope it holds (no `V.env`, and `list()` gets no view).
- **Panel names.** `V.addPanel({id, side, name?, tab?, build})` names its block by `name` (a key or words), else by the
  key `mapviz.<id>.title` when it exists, else "Panel". Every `mv` block of the page carries a block name in words.
- **Panel places.** A panel whose id is a tool id is a tool card on the stage (block `mv.tc.<id>`, docked top left, at
  most 340 pixels wide and 45 % of the stage high, scrolling inside; under 900 pixels it sits below the stage), shown only
  while that tool is in use; its close button ends the tool. A panel whose first element is a heading (or a leaf whose first
  element is one) keeps that heading as the card's one title: the shell's title text hides, the close button sits at the
  card's top right and the card keeps its aria-label. This holds whether the panel or the tool is added first
  (measure, profile). The `list` panel goes into the map picker. A right or bottom panel goes to the tab its `tab` option
  names (layers, inspect, analysis, pictures), else to the tab the shell's table `TABOF` gives its id (base, water,
  layers: Layers; hover, card, objects: Inspect; strong, checks: Analysis; pictures, style, export: Pictures), else a right
  panel goes to Inspect and a bottom panel to the bottom row. A left panel (game) stays in the left column.
  `_t.placeOf(panel, isTool)` is the rule. Sightview's panel `layers` is not a tool id and stays in the Layers tab.
- **Layout.** The shell puts one style in the document (W4): the view area (block `mv.top`: the head row `mv.head` and the
  main row) is one column of the window height under the page header. The head row (one row at 1600 pixels; it wraps when
  narrower) holds the title (for screen readers only: the GUI's own tab names the page), the map button (the map name, or
  "Choose a map", with a caret; it or F2 opens the picker), mode, phase, the side and unit kind button groups (`aria-pressed`;
  their lead words are for screen readers and the group's title, each button names itself; a press sends the same `'map'`
  event the old selects sent) and the toolbar `mv.bar` (the left column's fold button first, then Fit, zoom, the tools,
  Full screen, Copy link with "Include analysis" next to it, Keys). The main row takes what is left (at least 320 pixels):
  the left column (220 to 250 pixels: the game panel and the item lists fold at its end), the stage, and the right column
  (340 to 370 pixels) with four tabs, Layers, Inspect, Analysis and Pictures (role tablist, the arrows, Home and End move,
  the tab picked is kept in `as2gui.maps.viewer.tab`). The tab row stays put and the tab shown scrolls under it; in the
  Layers tab the filter stays at the top while the rest scrolls (the views and On now scroll: fixed too they would take
  more than 150 pixels). The Layers tab holds the layer list (see Layer list); the cache
  line closes the Pictures tab. A click on the map that finds something puts a dot on the Inspect tab (only Inspect has a dot, hidden and empty until
  then, so no tab's text holds a dot at load; the tab is never switched for the user). Each side column has a fold button
  (the left one is the toolbar's first item, the right one is in the tab row; a folded left column takes no width; keys `[` and `]`, kept in `maps.viewer.foldLeft` and
  `foldRight`). Full screen (key F) uses the Fullscreen API, else the class `mvfull` fills the window; Esc leaves it.
  The stage holds the canvas (a scale bar of round metres at its bottom left; a double-click zooms in at the pointer,
  Shift+double-click out), the first-time help (three steps, while no map is open), the tool cards, the cursor strip (x, y
  in metres and the first value rows of the hover providers in their order on one line, `aria-hidden`; the readout keeps
  every row for screen readers). A state row is not a value: a provider marks it `state: true`, or its value is one of the
  shell's state words (not made yet, loading, reading the map, the map not read yet, being made: ...); the strip leaves it
  out. `V.addHover(fn, {quiet: true})` gives rows to the strip only, for a part whose own panel is aria-live already (the
  hover part may add its height, ground and water rows this way) and the
  job line with a thin bar while a job reports done of total, seen without scrolling. Under 900 pixels the column grows
  with its content: the stage, then the tabs, then the left column; the picker goes full width. None of it applies while
  blocks are arranged (`body.arranging`).
- **Map picker.** A popover under the map button (block `mv.picker`, role dialog, about 420 pixels wide, at most 70 % of
  the window high, scrolling inside) holds the `list` panel. It opens by itself when the page is shown with no map, with
  the focus on its first field; Esc, a press outside it (not in a GUI dialog such as Browse) or a map the user picks closes
  it and gives the focus back to the button. The `'picker'` event `{open}` and `V.q('picker')` follow it. The
  `mv.list.maps` pick form `V.emit('map', {key, mode?, pick: true})` is unchanged.
- **Page keys.** F2 (picker), `[` `]` (folds), F (full screen), `/` (the layer filter: shows the Layers tab, not kept, and
  opens a folded right column) and ? (the key list) come through the screen's `keys(e)`
  and the canvas; none fires while typing in an input, select, textarea or editable text, nor when a tool has the key
  (F2 still closes the picker from its search box, Esc still closes the picker or the window fill).
- **`V.tab(id)`.** Shows that tab without keeping it (true, or false for an unknown tab); `V.q('tab')` is the tab shown.
- **Visible.** A layer is visible when its own tick and its group tick are both on. The `layers` event `{visible}`,
  `V.q('layers')`, `V.q('allLayers')` and the permalink all use that rule.
- **Tool layers.** A layer marked `tool: true`, or whose id is the id of a tool added with `V.addTool`, is a tool layer
  (measure, profile). It is never in the permalink, `V.q('layers')` or `V.q('allLayers')`, since nothing is saved behind it,
  and opening a permalink leaves its tick alone. It still counts as visible in the `layers` event.
- **Layer list.** The Layers tab, top to bottom: the filter (block `mv.filter`, the GUI's `searchKit` beside the list:
  history `mapviz.layerFilter`, the layers as its index, Browse = the file picker in the product cache, a file picked gives
  its name), one line that explains the two marks (`mv.markkey`), the views (`mv.views`), On now (`mv.onnow`), then the
  groups (`mv.groups`). The filter keeps a row when every word of it is in the row's label, group name, help text or id
  (any case); a group with a match is open while it filters, a group with none is hidden, and clearing it gives every group
  its own fold back. Down or Enter in the box go to the first row shown, Esc clears it.
  - Rows: the tick and the label, then a small mark: a diamond (U+25C6) for the game's own rule (`engineTrue`, or
    `engineTrueGoh` on the Gates of Hell page) or an almost-equal sign (U+2248) for an estimate. The mark's title
    explains it and its words are visually hidden text for screen readers. The help text of a layer (`mapviz.shell.tip.l.<id>`) or a group (`mapviz.shell.tip.g.<group>`) is the label's
    (or the fold button's) title and the text the tick (or fold button) is described by (`aria-describedby`); it shows
    over the rows below (it never pushes them) while the row has the keyboard focus (`:focus-visible`, not a mouse click). There is no ? button.
    A rebuild of the column holds the control in use at the same place on the screen (`holdAt`), so a tick that adds a row to On now does not move the list.
  - On now: every visible layer (a tool layer only while its tool is in use) by group in list order, with an untick, its group's opacity (the same
    value as the group head slider), its make state and its legend rows inline (only what is drawn now, as the old legend
    block did; that block is gone). Nothing visible: "Nothing is on. Tick a layer below or pick a view." No map open: one line, "Choose a map to see its
    layers.", no row and no "Make these". When two or more
    visible layers are not made and no job of theirs runs, "Make these (n)" posts their jobs in list order, one per need.
  - Views: Plain map, Terrain, Movement, Water, Cover and sight, Strong points (`_t.VIEWS`). A press only changes ticks: the
    view's layers and the game marks (`_t.MARKS`) on, with their groups; every other layer that is not a tool layer off;
    tool layers keep theirs. It starts no job. The view the ticks match is pressed (`aria-pressed`); pressing it again
    changes nothing. Strong points layers are still left out of the permalink unless "Include analysis" is ticked.
  - Make on tick: a user tick of a layer known as not made starts its job at once (the same call as its Make button, W3:
    nothing is posted while a matching job runs). A tick of a layer not read yet starts it once its answer says not made.
    The row then shows the job's words; a failed or stopped job leaves the row ticked with the reason and "Try again".
    Untick cancels nothing. A refresh, a permalink, the stored state or a view never starts a job: their rows show one
    small inline Make on the row line.
  - Folds: until the user folds or unfolds a group (kept in `maps.viewer.fold.<group>`, which wins), a group with nothing on
    starts folded and a group with something on starts open; a tick inside a group keeps it open for the session, so it
    never folds under the pointer. Fold all and Unfold all stay. Only a fold button, Fold all and Unfold all write a fold; no
    draw, tick, view, tool, map or refresh does. The GUI's `LS.get` reads its settings file before localStorage, so a fold
    kept there wins even after localStorage was cleared; the page never drops a stored fold.
- **`V.relist()`.** The shell draws the DOM item lists of the visible layers again. A part calls it when its `list()`
  answer changed outside the shell's own fetch: after its own fetch lands, or after a draw that found new items. The
  shell itself lists again when a layer it fetched lands, on a map, mode, side or kind change and on a tick change.
- **No canvas context.** The page still builds and still fetches the visible `source` layers, so the item lists work in the
  fake DOM and for screen readers. Nothing is drawn and no layer `draw` is called.
- **`EXT_SCREENS.mapviz.kit`.** `{colour, colourCss, b64, decode, gridDraw, vectorDraw, toScreen, toWorld, tileBox}`.
  `kit.b64(text)` gives the bytes of a base64 text as a Uint8Array. `kit.tileBox(hd, z, tx, ty, view, w, h)` gives a
  tile's screen rectangle `[x, y, w, h]` snapped to whole pixels by its edges (both edges round from the world edge they
  share with the neighbour), so a tile mosaic shows no seam and no overlap at any zoom or pan; the shell's tiles and the
  base part's tiles are drawn with it. Parts read and draw envelopes through the kit; `EXT_SCREENS.mapviz._t` is for tests.
- **Job stage words.** The job line has a word for the stages wait, read, write, tiles, draw, build, place, masks, defs,
  picture, and for the wave C and D stages of jobs.md: solids, grid, fire, view, edges, probes, lip, conceal, obstacles,
  travel, routes, frame, candidates, factors, refine, classify, ensemble, fair, checks, plan, compose, encode, commit,
  and the render stages catalog, pack and textures. Any other stage name shows the plain word "working". `sub/shell.test.js` lists every stage the job runner and
  the part commands emit today and fails on a new one, so a new stage gets a word or is listed as working on purpose.

## Waves C and D: what the shell adds (page-pg2 S1 to S12, page-pg3 N1 to N9, page-pg4 section 8, jobs.md)

- **Layer source and query.** `V.addLayer({source, query, why, ...})`: `source` is a layer name or a function
  `source(V.q) -> name | null`; `query` is `{field: value}` or a function `query(V.q) -> that`, added to the GET layer
  fields; `why(V.q) -> key` says why a source that names nothing shows nothing (default `mapviz.shell.noSource`). The row
  shows that hint while the layer is on, and nothing is fetched. The fetch key is the page context (with the phase), the
  name and the query, so a name or field that changes asks again.
- **Phase.** The head row has a phase select (block `mv.phase`, "First phase", "Phase n") shown when the mode has two or
  more phases (from the document's spawns, flags, points and clipsBySide). `V.q('phase')` is the phase or null (first),
  `V.q('phases')` the list. A mode or map change resets it. The `'map'` event carries `phase`. The phase is added to GET
  layer, strong, checks and json (not to card, hover or tiles), to every `V.job` body and to the job key args. It is not in
  the permalink.
- **Page fields.** GET card, strong, checks and json get the page fields (target, game, mods, map, mode, side, kind).
- **Job fields.** `V.job(what, args)` takes `phase`, `at` ("x,y"), `pose` (stand, kneel, prone) and `light` (clean, mode)
  next to the wave B fields. The job key args (`V.q('jobs')[i].args`, the `'job'` event) hold map, mode, side, kind, size,
  phase, at, pose and light.
- **`V.go({x, y, box?})`** sets the cursor at (x, y); with a box `[x0, y0, x1, y1]` the view fits it (never more than 4 times
  the current zoom), else it centres at the current zoom. It sends `'view'` and `'cursor'` `{x, y, px, py}` (no click) and
  returns false for a bad point. The screen object has `go(o)` and `pick(key, mode)` (sends `'map'` `{key, mode, pick: true}`)
  for other pages.
- **`V.q('tool')`** is the id of the tool in use, or null.
- **Hits carry their part.** A click hit (and each hit of a list) gets `part` (the id of the part whose init added the
  layer) and `layer` (the layer id), unless the part set them itself, so a part acts only on its own hits.
- **Server.** `shell.server.js` exports `lib` for part servers: `fail, wrap, query, bodyOf, request, fieldsOf, entry,
  needOf, readJson, palOf, palPart, whatOfLayer, whatOfJson, whatOfTiles, gridEnvelope, vectorEnvelope, runner, mod,
  partBuilt, COMMON, BODY_JOB, STATUS`. COMMON and BODY_JOB take phase, at, pose and light; `fieldsOf` checks them
  (phase whole 0 to 99, at two numbers rounded to 2 decimals, pose and light from their lists) and refuses with MV_USAGE.
- **GET layer** finds a layer by the table products, then the row's `also` patterns of the asked kind (strong.a.inf.*),
  and answers 400 MV_USAGE naming the kind when the name belongs to another unit kind. `sight.rings` is an alias: it reads
  `sight.view.json` of the view entry (jobs.md names that file).
- **GET json** `?<page fields>&name=` answers a JSON product as stored (sight, strong.<kind>, routes, pack ...) or a
  picture sidecar `pic.<base>`. It never starts a job: not made gives 404 with `need`.

## Mission places, the place picker and the deep link (game part)

- **Units and axes.** Every place and every pick is in world units u as the map files hold them: 20 u = 1 m, x grows
  east, y grows north (screen up), the same frame as the viewer (tools/mapviz/README.md 3.1). A pick returns both u and
  metres (`m`, u / 20), rounded to 0.01.
- **GET places** `?target&game&modDir&map&mode?` (game.server.js) -> `{v:1, kind:'places', target, map, mode (null: every
  .mi of the map), modes, upm:20, bounds:[x0,y0,x1,y1]|null, play:[x0,y0,x1,y1]|null, places:[{id, kind, lab:{k,n}, x, y, team?, r?, pts?, group?,
  mode, dup?}], more}`. kind: `zone` (a Helpers zone: circle radius `r` in u, or `pts`, absolute), `flag`, `start` (map
  point visor SpawnPoint), `point`, `waypoint` (id `group/name`). `lab` is the label form the page words in its language
  (`mapviz.game.pk.<k>`: Flag B2, Player base, Path point ..., Start point ...). `dup` marks a `X_capture` ring beside zone X:
  drawn, never listed, searched or hit. `map` may be written as the missions, bots and maps pages name it (`map/...`,
  `resource/map/...`). Reads only; never starts a job; bounds come from the cached document, else the map file's world boxes (their union). `play` is the playable area: the FIRST Clips
  world box, the rule spmis refuses a place by (SPMIS_POINT_OUTSIDE), so a spot the picker takes passes the mission check.
- **Why the viewer said "Flags: 0".** mapdoc/1 reads a mode's map point entities only. Single-player missions keep every
  place in `{Helpers {zone ...} {waypoints ...}}` (vanilla MoW:AS2: 53 missions, 898 zones, about 12000 waypoints, no map
  point at all), multiplayer frontline modes keep their zones there too, and combat modes hold start points and no flag.
  So the document had nothing to draw. The layer `mission` (group game, on by default, a game mark kept by every view)
  now draws them from GET places after the map document lands: zone outlines (dashed), waypoints (dots, one list row per
  group), map points the mode marks do not draw already. The panel counts flag and base zones as flags and adds the
  mission zones and waypoints. Two shell bugs hid places too: a pick sent before the viewer was ever shown was dropped by
  its first refresh (the bots page opened an empty viewer), and the bots page sends no mode (the first mode then opens).
- **Deep link.** `show('mapviz', 'page:mapviz/<target>~<map key>~<mode>')` (or `#go=` + the link URL-encoded, or
  `as2Link(link)`): three fields, mode may be empty. It opens the map and mode as the user's own pick (an unmade map
  document starts its read job), keeps the layer ticks and fits the map; the 5-field permalink is unchanged. The map key
  is the viewer's (`single/<campaign>/<mission folder>`, `multi/<name>`: no `map/` prefix); the mode is the `.mi` file
  name without `.mi`. Or `S.screens.mapviz.pick(<map key>, <mode>)` then `show('mapviz')`; that pick is now kept when the
  viewer was never shown.
- **The place picker.** `MAPVIZ_PICK.open(o)` (also `window.MAPVIZ_PICK`, `EXT_SCREENS.mapviz.picker`) opens a modal
  dialog over any page; `MAPVIZ_PICK.close()` closes it; `MAPVIZ_PICK.isOpen()`. One at a time (a new open replaces it).
  `o`: `target` or `gameId` (as64, mowas2, goh) or `game` when it is one of those (default the page game); `gameDir`
  (default `gohDir()` for goh, else `S.gameOv`); `modDir` or `mod` (default `S.mod` when the game is the page's); `map`
  (as above; a path to a `.mi` gives the mission too); `mission` (the mode / `.mi` name, optional: none = every mission
  file); `places` `[{id, label, x, y, kind, r?, pts?}]` in u (optional, shown at once, kept over a server place of the same
  id); `title`; `onPick(r)`; `onCancel()`. `r = {x, y, units:'u', upm:20, m:{x, y}, place, map, mission, target, inside}`; `place`
  is null for a spot, else a copy of the place with its `label`. A click near a mark (10 px) returns that place, inside a
  zone the smallest zone, else the spot. The dialog shows a sketch at once (frame of the map's world box, else of the
  places), the places with labels (overlaps left out, waypoint labels only while few are in view), and asks for the relief
  picture (GET tiles base topo; the level that shows the whole map in at most 16 tiles). Not made: it posts the job the 404
  names and shows its stage and progress while the sketch stays usable, then swaps the picture in. Keys: arrows move the
  choice, Shift+arrows pan, + - zoom, 0 fits, Enter takes the choice, Esc cancels, Tab stays inside. The search box is a
  searchKit (`mapviz.pick`): the index is the place labels and ids, History, Browse opens the map folder's `.mi` files (a
  picked file switches the mission). On a remote page it shows the sketch with the given places only, no call.
- **The inline view.** `MAPVIZ_PICK.embed(o)` (also `EXT_SCREENS.mapviz.picker.embed`) gives the same map view as a piece
  another page keeps inside its own card (the single-player mission generator draws the mission on it). It returns a
  handle, or null where there is no document. `o`: `target`/`gameId`/`game`, `gameDir`, `modDir`/`mod`, `map`, `mission`,
  `mapName`, `places` as for `open(o)`; `height` in px (default 360; the width is the container's); `marks`; `legend`
  `[{side, text}]` (a DOM row under the canvas: a swatch by side and the text); `onPick(r)` with the same `r` as the
  dialog (one click picks, no Choose and no Cancel; the view stays as it is; a click outside the playable area calls
  nothing and shows the "outside" line); `makePicture: true` lets it start the picture job by itself as the dialog does.
  Handle: `el` (canvas, one status line, the legend row, a toolbar: zoom in, zoom out, Whole map); `update(p)` (`p` may
  hold any field of `o`: a changed map, game, game folder or mod reads the places and the picture again and fits, a
  changed mission reads the places again, anything else keeps pan and zoom and asks for nothing; one draw per frame);
  `fit()`; `close()` (listeners, the size watch and late answers go, `el` leaves the page, later calls do nothing);
  `state()` -> `{map, target, places, marks, picture: 'none'|'loading'|'ready'|'missing', view: {cx, cy, zoom}}`, null
  after `close()`. The caller appends `el` and may take it out and put it into new DOM any number of times: view, places
  and picture live in the handle. The canvas takes its container's size through a ResizeObserver when the browser has
  one, on the window's resize and on every `update`; a view the user has not moved is fitted again, a moved one is kept.
  The dialog and any number of inline views work side by side, each with its own state.
  - **Marks** (world u), drawn in this order: zones, routes, the places, units, goals and the start, labels.
    `{type:'zone', x, y, r}` or `{type:'zone', pts}`: filled lightly and outlined. `{type:'route', pts, dashed?, arrow?}`:
    a line with an arrow head at its end and one mid-way on each leg of 120 px and more (`arrow: false`: none).
    `{type:'unit', x, y, n?}`: a round badge with the count inside; several on one spot are fanned out on a small ring.
    `{type:'goal', x, y, n}`: a numbered diamond in the accent colour. `{type:'start', x, y}`: a square with a ring.
    Each takes `label` and (not goal and start) `side`: `player` and `ally` use token s1 (an ally badge is hollow), `enemy`
    s2, `neutral` or none hint. A mark with no finite place is left out. Mark labels are written after every place label
    under the same no-overlap rule, so a mark never takes a place label away.
  - **Pointer and keys.** Drag pans, the wheel zooms. The status line names the place under the pointer, else the
    labelled mark (a badge first, then a route within 6 px, then the smallest zone) with the spot in metres; with nothing
    under the pointer it shows the places and picture words. Keys on the canvas: arrows pan, Shift+arrows move the
    choice (the dialog has these two the other way round), + - zoom, 0 fits, Enter takes what the pointer is over, else
    the choice.
  - **Which picture.** `o.base` (dialog and inline view): `topo` (default, the relief) or a render rung `l0`..`l4`. The mission
    generator asks `l3`: the map with its object models and no sun light or shadow. A base other than topo that cannot be
    read or made falls back to topo once (status key picRelief with the reason). Zoomed in, the level where one picture
    pixel is about one screen pixel is read for the tiles in view (16 per request, 300 ms after the view last moved) and
    drawn over the whole-map level.
  - **The picture.** An inline view is drawn with its card, also on a refresh, so it never starts a job by itself: when
    the picture is not made it says so, keeps the sketch (`picture: 'missing'`) and shows a "Make the map picture"
    button; that click posts the job the 404 named and the stage shows on the status line. `update` with the same map
    does not ask again.
- **Playable area in the picker.** The area (GET places `play`, else `bounds`, else the picture's box) is outlined and the
  rest dimmed. Hovering outside says so in plain words; a click, Enter or Choose on a spot or place outside is refused at
  once with a plain line and the picker stays open. So `r.inside` is `true`, or `null` when no area could be read (no map,
  a remote page, a failed read: nothing is refused then and the caller's own check still applies).
- **Header words.** The first line says "This mission's places" (or the places of every mission on this map); the map
  folder and `.mi` file name come only as small secondary text under it. Helpers waypoints are called path points and
  zones areas in every page language.

Page part reports live at `tools/gui/ext/mapviz/REPORT-<builder>.json` (page-shell, page-layers, page-tools), not in `sub/`:
`test.js` allows only part files there.

## Registering the page (coordinator, when the page shell MV-PG1 is merged)

Applied at the close of wave B. The lines below are what the registration holds.

1. tools/gui/ext/index.js: add after `require('./missions'),`. Both carry `after: 'maps'` and the later one in the list is put
   in first after Maps, so the screen sits just before Missions (tab and sub-tab order come from groups.js anyway):

   ```
     require('./mapviz'),   // the Map Viewer (tools/mapviz): map list, layers and pictures, all three games
   ```

2. tools/gui/groups.js, AS64: the `maps` tab gets three sub-tabs.

   ```
       tab('maps', [
         sub('maps', 'grp.s.maps', ['maps'], 'map-clone --target as64'),
         sub('viewer', 'grp.s.viewer', ['mapviz'], 'mapviz --target as64: map list, layers and pictures (lib/vfs exe as64)'),
         sub('missions', 'grp.s.missions', ['missions'], 'mission-clone --target as64, misdiff, milint'),
       ]),
   ```

3. tools/gui/groups.js, MoW:AS2: a `maps` tab (Alt+5) between `mods` and `share`:

   ```
       tab('maps', [sub('viewer', 'grp.s.viewer', ['mapviz'], 'mapviz --target mowas2: map list, layers and pictures (lib/vfs exe mowas_2)')]),
   ```

4. tools/gui/groups.js, GoH: a `maps` tab (Alt+5) between `mods` and `units`:

   ```
       tab('maps', [sub('viewer', 'grp.s.viewer', ['mapviz'], 'mapviz --target goh: map list, layers and pictures (lib/vfs exe goh)')]),
   ```

   The tab keeps its label `grp.maps` and Alt+5 in every game: test-gui2.js checks one label and one key per tab across the
   games. A tab named only "Maps" in MoW:AS2 and GoH would need a new tab id with its own label and key, which that check and
   the nine-tab rule forbid; the single sub-tab Map Viewer shows no sub-tab row.

5. tools/gui/lang/{en,ru,uk,zh}.json, next to `grp.s.missions`:

   ```
   en.json   "grp.s.viewer": "Map Viewer",
   ru.json   "grp.s.viewer": "\u041f\u0440\u043e\u0441\u043c\u043e\u0442\u0440 \u043a\u0430\u0440\u0442",
   uk.json   "grp.s.viewer": "\u041f\u0435\u0440\u0435\u0433\u043b\u044f\u0434 \u043c\u0430\u043f",
   zh.json   "grp.s.viewer": "\u5730\u56fe\u67e5\u770b\u5668",
   ```

   The escapes are valid JSON as written; the files hold UTF-8 text, so the characters may be written out instead.

6. tools/gui/test/test-gui2.js, the MoW:AS2 tab list (line 141 today) changes from
   `'help,mods,share,tools'` to `'help,mods,maps,share,tools'`:

   ```
     ok(navIds(doc) === 'help,mods,maps,share,tools', 'MoW:AS2: tabs Help & Docs, Mods, Maps & Missions, Test, Share & Play, Tools & Settings', navIds(doc));
   ```

   Two texts near it then read wrong but test nothing: the comment above it ("Test, Share & Play is its 3rd tab") and the message of
   the Alt+8 check ("(3rd tab)"); Test, Share & Play becomes the 4th tab, still Alt+8.

After registering: `node tools/gui/test/test-ext.js`, `node tools/gui/test/test-lang.js`, `node tools/gui/test/test-theme.js`,
`node tools/gui/test/test-gui2.js` (or `sh tools/test-all.sh --changed`).

## JOBS: the GUI job list (tools/gui/README.md "JOBS")

- Runner jobs (POST job): `sub/shell.server.js` watches the runner (`runner.watch`, tools/mapviz/jobs/index.js) and lists every queued or running job as one `bg` job (`job.w.mapviz {map}`, `job.w.mapslist` for the map list; game = the target). A part never registers a runner job itself. One stop: `lib.cancelJob(id)`.
- Preview runs (write, undo, deploy): `sub/export.server.js` `listRun` (`job.w.previews {map}`, writes). One stop: `stopRun(rec)`.
- A route that awaits its own child (previews plan, check) makes its request stoppable while the child lives (`runReq`); a route with no child cannot be stopped.
- Page: `V.api(method, path, body, opt)`; `opt` is the third argument of the GUI `api()` (`{what}` names the request, `{job:false}` keeps it out). With no `what` the shell names the request by route (`mapviz.shell.w.*`). A part that polls with POST passes `{job:false}`; the polls here are GETs `job?id=` and `previews/run?id=`, never listed. A request stopped from the list rejects with `e.cancelled`: show the plain stopped state.
