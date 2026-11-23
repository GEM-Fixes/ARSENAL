# Models page parts (tools/gui/ext/models/sub)

One part = one owner = up to four files: `<name>.client.js`, `<name>.lang.json`, `<name>.server.js`, `<name>.test.js`.
`../index.js` joins them (parts, in this order: `doc`, `tree`, `vol`, `ply`, `anim`, `timeline`, `viewer`, `gizmo`, `file`, `armor`, `shot`, `find`, `look`;
the requires are spelled out there for the single-exe build, so a new part name is added to that list); a part that is not there is
skipped. Nothing in `../client.js`, `../server.js` or `../lang.json` is edited by a part.

`doc` is the editable model document every editing part works through: `EXT_SCREENS.models.doc` (= `ctx.doc`), contract in
`tools/lib/model/edit/README.md` "The page side". It is set before any other part's script runs. Picking a model opens a document
when a mod folder is chosen. Its bar (Undo, Redo, Save, the unsaved mark) sits above the sub-tabs. A listener a part adds with
`D.on` while it is being drawn is dropped at the next draw, so add it again each time the part is drawn.

## The parts

| Part | Sub-tab or place | What it does | Server routes |
|---|---|---|---|
| `doc` | bar above the sub-tabs | the document (open, op, undo, redo, save with the dry check, lint and backups), `go`, `setHidden`, the key table | `doc/open op undo redo state scene save close dir` |
| `tree` | Model: Skeleton tree | bones, their form, sequences, show boxes, bone menu | none (ops and states only) |
| `vol` | Volumes | collision volumes, obstacles and areas list | none |
| `ply` | Mesh | meshes, materials, OBJ import and export | `ply/import-read` |
| `anim` | Animation | the animation editor (keys, frames, clips, interpolation) | `anim/info run undo` |
| `timeline` | under Animation | frame strip and playback | none |
| `viewer` | in Model, Volumes, Mesh, Animation | the 3D view | `viewer/scene texture` |
| `gizmo` | inside the 3D view | move, rotate and scale handles | none |
| `file` | Files and the Start card | new model, save as, recent, export, preferences, key list (F2) | `file/new write export source autosave lint backup whoami` |
| `armor` | Armor | armor table, shot simulator, armor map (its 3D view shoots from the camera, the default, or the side chosen for the map: LS `models.armor.from3d`; a click on the ground beside the model shoots at the ground), what happens behind the armour (warns when the gun does not load the shell; crew notes in the page words; Open goes to the exact copy a value came from, `layer` + `rel`, through the Editor ref `{ mod, path }`; a copy inside a pak opens the load order winner and the button title names the pak) | `armor/table shot map edit guns shells` |
| `shot` | Model: toggle in the 3D view's tool row (`v.addTool`), bar under the canvas (`v.addUnder`) | "Shot" tool: gun, shell, range (the Armor keys), from the camera (a click shoots along the click's ray at the hit point; Shoot uses `v.camera()`; a click on the ground beside the model shoots at the ground), a side, or azimuth and elevation, on the open document, result with the Armor renderer (and its shell warning, crew notes), the result over the model through `v.showShot`, rerun on an edit; its shell list, like Armor's, lists every shell the route sends with its kind in words (`kindWord`: heat also for a cumulative word or `cumulative` > 0, an unknown kind by its own word) | none (uses `armor/guns shells effects`) |
| `look` | Model: control above the 3D view (`parts.look`, blocks `model.look.*`); page: card "Soldier skins" (`parts.skins`, blocks `skins.*`) | texture variants of the open model (None first, the def's own marked "set in the file"; a pick redraws the view with `viewer.setVariant`, nothing is written), Gates of Hell mesh variants as a small line-up picture, the list of soldier skins with one skin standing; file reading shared with the Units page (`../../units/texvar.js`); links both ways with Units (`S.screens.units.pick(id)`, `S.screens.models.pick(name, {variant})`) | `look`, `look/skins`, `look/pose` |
| `find` | the "Pick a model" card | search every model of the game with the mod folder laid on top (its loose files and its own paks, active or not): entities of every kind, breeds, .mdl files no definition names; list the models of any folder or .pak on disk. A unit is also found by its display name (its name in the game, from the .lng texts of the game and the mod, the mod's text winning), with the Units page's common-name folding ("Panzer IV H" finds "PzKpfw IV Ausf.H"; a folded query under 4 letters is dropped, and it matches only from a word start). A query of a name and a number ("kv-1", "kv 1", "IS-2") ends where a word ends in a display name, and in a file name its number does not run on into more digits, so KV-122 and IS-10 stay out. A CJK character counts as 2 letters for the 4-letter rules. Display names come from AS2 and AS64 .lng texts only: on Gates of Hell none are found. An exact or starting file name ranks first, then display names, then a folded match from a word start, then file names and display names that only hold the text; a row found by its display name carries `title` and `byTitle` and the card shows it as "title (name)". `soedit find` prints the display name at the end of each row (`in game: "..."`). Each row's `target` goes unchanged to every route (`tools/soedit/target.js` forms: name, game path or disk path of a .mdl / .def / breed .set, `breed:<key>`, `pak:<pak>!<entry>`). The index is built by `soedit index` in a child process and cached per game + mod + what changed; a search answers `building: true` while it runs | `find`, `folder` (`/api/x/models/find`, `/api/x/models/folder`) |

Targets: every route that takes `target` (stage, `doc/open`, `viewer/scene`, `viewer/texture`, the Armor routes) reads it through
`tools/soedit/target.js` (parse, canonical, resolve): the chosen mod folder is a layer over the game whether or not it is active,
so a model only in the mod's paks, a breed (its skin, plus the shared `humanskin/human/human.mdl` and its clip list), a .def that
names its model, a pak entry and a file outside any resource tree all open. The Armor routes pass the unit's name (armorsim finds
the def). A human in the 3D view: the skin's bones, posed by the shared human clips; the mesh is not skinned (bind pose).

## Files

- `<name>.client.js`: `module.exports = String.raw` + a backtick string of browser code, appended after `../client.js`. Page rules as
  there: no backtick, no dollar-brace, no innerHTML inside the string; DOM through `h()` and `textContent`; text through `tx(key)`;
  calls through `api(url, body)`; colours only from the page's CSS variables. Everything lives inside one function: no new global names.
- `<name>.lang.json`: `{ "en": {...}, "ru": {...}, "uk": {...}, "zh": {...} }`, the same keys in all four, all starting
  `models.<name>.` (a new sub-tab also gives `models.sub.<id>`). Plain words, no dashes as punctuation.
- `<name>.server.js`: `module.exports = { routes: { 'POST /api/x/models/<name>/<verb>': handler } }`, handlers written like those in
  `../server.js` (same `wrap`, same checks on the mod folder). Reading the game is fine; writing only inside the chosen mod folder.
- `<name>.test.js`: runs alone with `node`, last line `PASS models <name> (N)`; stubs `ctx.runTool` the way `../test.js` does.
  `../test.js` runs every `sub/*.test.js` and then `../e2e.test.js` (one modder's whole run, last line `PASS models e2e (N)`).

## Blocks

Every visible part of the page sits in exactly one leaf block; containers hold blocks only, so Arrange can move and hide each part
and nothing overlaps (a row of leaves wraps). The contract is the page's; here is how the parts follow it.

- `el` (= `ctx.el`, = the page's `h()`) makes the blocks: `el(tag, {blk: id})` a leaf, `el(tag, {blk: id, box: 'col'|'row'|'grid'|'cols'})`
  a container, `'data-blkname': tx(key)` its name in the Arrange bar (needed where the first 40 characters of text read badly or are
  empty). No page-only helper (`blk`, `fld`, `card`) is used in a part, so a part test's own stub `h` keeps working (it sees `blk` and
  `box` as plain attributes). Code outside the page may use `window.as2Blocks` instead.
- Ids: lower case, from code constants, dotted from the owning container. Each sub-tab is drawn into a pane container `tab.<sub id>`
  (in `ed.sub`, in the card `ed`); `ctx.body` is that pane. A part's card is the container named after the part (`armor`, `vol`,
  `ply`, `tree`, `file`, `anim.ed`, `shot`), its blocks `<part>.<what>`. Page shell: `title`, `intro`, `pk` (pick), `ed` (editor card:
  `doc` bar, `ed.tabs`, `ed.sub`, `ed.msg`), `ext` (SOEdit fold), `start` (the Files part's Start card, on the screen root).
- An element the code re-classes (`say(box, cls, t)`, `className=`) or empties with `textContent=''` is wrapped in a leaf; the variable
  keeps pointing at the inner element. An element only cleared with `clear()` (removeChild) may be the block itself.
- One leaf each: a list or table of data rows, a result area, the save check panel, the armour edit box, a canvas.
- A form the code draws again as a whole (the selected volume `vol.form`, obstacles `vol.obst`, the selected mesh `ply.form`, import
  `ply.import`, materials `ply.mats`) is a container built from blocks directly: each section a container, fields side by side in
  a row container, one fld leaf per field (its text, control(s), unit and the field's own button), a button group one leaf. Ids are
  code constants, the same whichever volume or mesh is selected (`vol.form.ident.name`, `vol.form.shape.length`,
  `ply.form.shape.tr.move`, ...); a field drawn from the data's own list (a mesh flag, a part, a material key) takes its place in
  that list (`ply.form.flags.pick.f0`, `ply.form.pmat.p1.mat`, `ply.mats.sel.k0`). Such a container is drawn again through
  `EXT_SCREENS.models.redo(c, prefix, fn)` (../client.js): its own blocks go (a block the user moved into it stays), fn draws, a
  block of ours the user moved elsewhere that fn no longer draws is dropped (blkDrop), and the profile is applied, so a moved
  field stays where the user put it. The 3D view (`parts.viewer`) is a container with the id
  `opts.blk` (default `view`; the Model tab passes `model.view`, others `<part>.view`): its toolbar `<id>.bar` and show row `<id>.show`
  are rows with one leaf per labelled control, `<id>.more` a fold, and the canvas with its overlay labels and menu one leaf
  `<id>.canvas`; the handles' bar (`parts.gizmo`, `host.blk` = `<id>.gizmo`) is a row container put in before the canvas: the mode
  buttons one leaf, then one leaf per field. The timeline is the container `opts.blk` (default `tl`).
- One leaf per field: a leaf never holds two labelled controls side by side. A field (its text, control(s) and unit) is built in the
  page's fld shape (`div.fld > label.f > span.n + control + after`) so its text stays in its leaf. Parts that draw rows of fields
  (anim, timeline, armor, shot, tree form) call `EXT_SCREENS.models.blockify(node)` (../client.js) after a draw: it
  turns such a leaf into a row of fld leaves (ids `<leaf>.<n>`, positional in a code-built row) and the plain rows of a container
  into blocks; it leaves the 3D view and a fold's summary alone. Not there in a part test's stubs: the part draws as before.
- Insert next to a block only when the reference is still a child (the profile may have moved it), else append (`shot` does this).
- Shot in the Model view: the toggle leaf `shot.tool` goes in the view's tool row (`model.view.gizmo` after `model.view.gizmo.modes`,
  or `model.view.tools` without the handles), the bar container `shot.bar` (a card, hidden while off) right under `model.view.canvas`.
  No container `shot` then, so a saved profile that lists the old card `shot` is ignored for them. A view without the slots gets the
  old card `shot` (toggle and bar) right after the view.
- A redraw needs nothing in a browser (the page re-applies the profile on any added block); `../client.js` calls `blkApply(root)`
  after each draw for the fake DOM.
- Test: `../blocks.test.js` builds the whole page in the fake DOM with this page's routes, opens a model, draws every sub-tab (and the
  Shot bar, a bone, a volume) and runs each state through the block rules of `tools/gui/test/test-blocks.js`; `MODELS_BLK_SOFT=1`
  lists the problems instead of stopping. A new part or control must keep it passing.

## Hooks (set by the part, read by ../client.js when the page is built)

```
EXT_SCREENS.models.subs.<id> = function (ctx) { ... }      // a sub-tab; 'anim' adds below the built-in Animation view, a new id is a new tab
EXT_SCREENS.models.parts.viewer = function (ctx, opts) { return element }
EXT_SCREENS.models.parts.gizmo  = function (host) { return G }      // used by the viewer, see "The handles"
EXT_SCREENS.models.prefs = { get(name), set(name, value), on(fn(name)), names() }   // set by `file`, see "Preferences"
EXT_SCREENS.models.keys  = [{ keys: 'Ctrl+S', key: '<lang key>', area: 'page'|'view'|'tree'|'anim' }]   // rows for the F2 key list
EXT_SCREENS.models.go(subId, sel?) -> boolean               // set by `doc`; ../client.js gives it the tab switch through D._setGo
```

`ctx = { body, set, mod, el, clear, say, msg, k2, fileRow, redraw(), restage(), doc, onPick }` (`doc` = `EXT_SCREENS.models.doc`, or null
when the doc part is missing). `ctx.onPick(fn) -> off()`: `fn(hit)` for each click in the Model sub-tab's 3D view, `hit` as the
viewer's `onPick` gives it (below); the view's own click (selection, readout, pose following) stays. `../client.js` builds that view
with `{ onHit }` and passes each hit on; listeners are dropped at the next draw, so join again each time the part is drawn. `set` is the file set of the chosen model:
`{ target, mdl (path of the staged .mdl inside the mod, when staged), staged, files: [{ rel, group, inMod, missing }], groups, order }`.

Calls between parts, all on `D = EXT_SCREENS.models.doc`:

```
D.go(sub, sel)          switch to sub-tab `sub` ('model', 'vol', 'ply', 'anim', ...) and select sel ({ bone, volume, anm, frame });
                        false when there is no such tab. The tree's "Open the Mesh tab" and a double click on a volume row use it.
D.setHidden({ bones: [path], volumes: [id] })     display only, never saved; emits { type: 'hidden' }; D.hidden holds the lists.
                        A hidden bone hides everything under it in the 3D view. Reset to nothing hidden on open and close.
D.dir({ dir?, ext? }) -> Promise({ dir: 'resource/.../', files: [rel] })   the files of a folder (document, mod, game), default the
                        .mdl's folder and '.anm' (Page Up / Page Down in the Animation tab)
D.beforeSave(fn)        fn() runs before every save (the Files part stamps the header and writes full matrices here)
D.askSave()             the bar's Save flow (dry check, list, confirm per the prefs, backups, write); Ctrl+S anywhere calls it
D.pref(name, default)   a preference through EXT_SCREENS.models.prefs, or the default
D.area(el) -> 'text'|'view'|'tree'|'anim'|'page'   which key area an element is in (nearest [data-keys] holder)
D.keymap                the table below
```

## Keys

A key goes to the area that has the focus. A text field takes every key except Ctrl+S. The page level handlers skip a key event
another handler already took (`e.defaultPrevented`), so the focused area wins.

| Area | Holder | Keys |
|---|---|---|
| text | any input, textarea, select | typing; Ctrl+S still saves |
| view | `data-keys="view"` (3D view) | W, E, R (move, rotate, scale handles), Q, F (fit), A (fit all), 1, 3, 7 (front, side, top), 4, 5 (ortho), F6 (panes), Esc, right button + W A S D Q E (fly) |
| tree | `data-keys="tree"` (Skeleton tree) | Up, Down, Left, Right, Home, End, Enter, F2, Delete, Menu |
| anim | `data-keys="anim"` (Animation editor) | Space, Left, Right, Up, Down, Home, End, K, I, Delete, Shift+Delete, Shift+D, [, ], Page Up, Page Down, Ctrl+A, Ctrl+C, Ctrl+V |
| page | anywhere else on the Models page | Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z, Ctrl+S (doc); Ctrl+Shift+S (save as), F2 (key list), Ctrl+C, Ctrl+X, Ctrl+V on bones (file) |

Each part pushes its rows to `EXT_SCREENS.models.keys` with a lang key (`models.<part>.key.<name>`) so the F2 list shows them in the
user's language.

## Preferences

Kept by the `file` part in the ARSENAL settings file as each one changes. `prefs.on(fn)` calls `fn(name)` after a change.

| Name | Kind, default | Used by |
|---|---|---|
| author | text, the Windows user name | header stamp |
| stamp | yes/no, no | header stamp on save |
| gemi | yes/no, no | full matrices on save |
| backup | yes/no, yes | copies to `<mod>/.arsenal/model-edit/backup/<time>/<rel>` before a save replaces them |
| confirmSave, confirmRemove | yes/no, yes | the Save and remove questions |
| autosave | minutes 0 to 120, 0 (off) | Files part |
| recentMax | 1 to 50, 10 | recent list |
| newFolder, exportFolder | text, entity/props, export | new model and export forms |
| units | engine or m, engine | kept and offered, not read by any part yet (forms and the 3D view readouts show game units, metres beside them) |
| grid | game units per grid cell 1 to 2000, 20 | 3D view grid |
| snapMove | 0 to 1000 game units, 1 | handles (move step) |
| snapTurn | 0 to 180 degrees, 15 | handles (rotate step) |
| fov | 20 to 120 degrees, 60 | 3D view perspective panes |

## The 3D view, as other parts use it

`var v = EXT_SCREENS.models.parts.viewer && EXT_SCREENS.models.parts.viewer(ctx, opts)`; append `v` where it should show.
With no `opts` it shows the open document (or the staged model) at rest and follows the document's selection, animation and frame.

```
opts = {
  height: 420,                       // px
  compact: false,                    // true = canvas only (no toolbar, no side lists): small panes inside another page (Units: 3D view of a buy)
  scene: { url, body },              // a ready-made scene of many models (a line-up) from another part's route, see below
  onFigure: function (index) {},     // scene only: a click on a mesh that carries `figure` (a number) -> that number
  show: { meshes, volumes, bones, names, volNames, entities, obstacles, areas, grid, axes, bounds, meshWire, volWire, entWire,
          paintSel, vecSel, vectors, onlySel, volColor: 'one'|..., gridN: 20, shot, shotLabels },
          // defaults: meshes, volumes, grid, shot and shotLabels on
          // volNames: the volume's name (scene v.name, else v.id) at its centre, only for volumes drawn (Volumes on, not
          // hidden in the tree, Only the selection respected); a halo in the background colour; clipped to its pane
  anm: 'fire.anm' | null,            // animation file name as listed in set.files (rel), posed at `frame`; given = fixed pose
  frame: 0,
  pose: false,                       // do not follow D.sel's animation and frame
  colors: { '<volume id>': '#rrggbb' },          // volume colours (armor map); others keep the default
  faceColors: { '<volume id>': ['#..' x6] },     // per box side, order front, top, left, right, rear, bottom
  onPick: function (hit) {}          // click: { volume: id, side: 0..5 | -1, point: [x,y,z], origin: [x,y,z], dir: [x,y,z] }
  onHit: function (hit) {}           // the same hit, only told: the view keeps following the pose, D.select and its readout
                                     // (onPick takes the click over: rest pose, no readout). The Model sub-tab uses it, see ctx.onPick
                                     // hit.hits: every volume under the click, nearest first: [{ volume, name, side, point, aim }]
                                     // (aim = the entry point moved a little into the volume). onPick may return { volume }: the
                                     // view selects that one instead (Armor: the volume the shot took)
                                     // hit.ground: [x, y, 0] where the click ray meets the plane z = 0, only when the ray goes
                                     // down, the point is in front of its start and within max(4 x bounding radius, 400) of the
                                     // scene middle; else null
}
Shots from a click (Armor, Shot): the first entry of `hit.hits` that shells hit is aimed at (its `aim`); volumes the trace leaves
out (ram volumes, bullet ability off: armorsim `join.notHit`, route `/api/x/models/armor/nothit`, or the table's `join.notHit`)
are passed through. Nothing shells hit under the click: a shot at `hit.ground` when there is one, else a plain message, no shot.
The ground also wins when it is nearer along the ray than that volume. Camera ways use the click ray; a side way needs
elevation > 0 to reach the ground (else a message, no shot). Every shot / effects body sends `ground: 0`; the line ends at the
answer's `groundPoint` / `engine.end.point` (end `ground`) with a cross there. Ordinary selection still picks every volume.
v.setPose(anm, frame)      v.setColors(colors, faceColors)      v.highlight(volumeId | null)
v.setShow({ ... same names as opts.show })      v.addLine(from, to, '#rrggbb')      v.clearLines()      v.reload()
v.camera() -> { eye: [x,y,z], dir: [x,y,z] (unit, the way the active pane looks), ortho }      // read only
v.sceneInfo() -> { world: root bone world (12), middle: [x,y,z], radius, ctr: { volumeId: [x,y,z] } } | null   // read only;
// Armor's camera shots: frame for aeFromDir, the middle of the unit and the centre of the part clicked last
// a hit's origin and dir are the click's ray in the pane clicked: dir is the view direction at that pixel (perspective or flat)
v.setMode('shaded'|'textured'|'solid'|'wire'|'solidwire'|'paint'|'normals')     // the active pane's draw mode
v.showShot(result) -> { missing: [field], volumes, jets, fires, blasts } | null   // an armorsim effects result over the model
v.addTool(leaf) -> leaf       // a tool button leaf of another part in the row right above the canvas: after <id>.gizmo.modes when the
                              // handles are there, else in a row container <id>.tools (made once, before the canvas). Also without WebGL
v.addUnder(block) -> block    // another part's block right under the canvas, before the readout, help, legend, shot key and keys
v.clearShot()                                                                    // the overlay gone (also when a model opens)
v.setScene({ url, body }) -> true | false (no url)      // show another ready-made scene (also on a view made without opts.scene)
v.focusFigure(index | null) -> true when shown now      // scene only: fit the active pane to that figure's meshes; null = fit all
```

A ready-made scene of many models (`opts.scene`, the Units page line-up of a buy):
- the view POSTs `body` plus `mod` (the page's mod, when there is one, over a `mod` in the body) to `url` through the page's `api`
  helper. The answer is `{ scene, ... }` or `{ ok: false, error }`; `scene` is scene/1, the JSON the view's own scene route returns
  under `scene`. `bones`, `volumes` and `bounds` may be absent; a mesh without `world` is drawn where its positions are. An error is
  one plain sentence in place of the picture, and the picture comes back with the next scene that arrives.
- no document following, no handles, no animation list, no LOD stepping, no `set.target` needed. `v.reload()` asks the route again
  (pictures too); `v.setScene(...)` asks with the new route and body: the old picture stays until the answer arrives, the angle the
  user chose is kept, pictures still named are not asked again and the ones no part names any more are freed.
- every mesh may carry `target` (string): the pictures of its parts are asked from `POST /api/x/models/viewer/texture` with that
  target (`{ mod, target, rel, mesh }`); a mesh without one is drawn untextured. Meshes are drawn with their `world` as given
  (skinned meshes whose positions are already final included).
- one picture per (target, folder of the mesh file, name) is loaded and every part that names it uses it; at most 4 picture
  requests run at once, the rest follow as they answer.
- the camera fits the bounds of the meshes (every corner inside the pane, so a long row fills the width; `fitBox`). The first
  scene sets the angle of the perspective pane: models face +X, so the eye is in front, a little to the side and above; a row
  across (along Y) more from the front, a column (along X) more from the side (`rowView`). A double click on the picture or the
  key A fits all again, the angle kept. A scene that arrives before the canvas has a size is fitted again at the first draw.
- every mesh may carry `figure` (number). A click calls `opts.onFigure(n)` with the figure of the mesh under it, else of the first
  figure bounding box the click ray meets; a mesh without `figure` and the background call nothing. `opts.onHit` / `opts.onPick`
  get the usual hit with `hit.figure` (number | null). A click selects nothing in a scene. Note: a double click is also two clicks.
- `v.focusFigure(n)` keeps the scene's radius for the clip planes, so the rest of the row stays in the picture behind the figure.
  Called before the scene arrived it returns false and is applied when it arrives (dropped when the scene has no such figure).
- with `compact` the view is still canvas only: drag turns, the wheel zooms, a double click fits all, and the picture's tooltip
  says so (`models.viewer.sceneTip`).

The shot overlay (Armor sub-tab and Shot tool call `clearShot()` when a run starts and `showShot(result)` with its answer):
- volumes coloured by the worst result with a chance above 0: pierced (`--cthru`), damaged (`--cbounce`), held (`--cstop`); untouched
  volumes keep their own colours. Sources: `engine.plates` (penetrate = pierced, any other hit = held), `engine.events`
  (`pierce` = pierced, `break_armor*` = damaged), `blasts[].hits[].result`, `jets[].hits[].events`. Short volume names in the result
  match the view's ids by the volume name or the last part of the id.
- each jet a line (`--cline`) from `jets[].point` (its start, in the frame of `engine.end.point` and `blasts[].point`) along `jets[].dir`
  (unit vector) for `distance` metres (`distanceM` when given); each one absent falls back: the start to `engine.end.burst` (else
  `engine.end.point`), the way to `ray.dir`, where the jet flies on from the burst.
- each fire a marker (`--err`) at `fires[].point` when given; when it is absent or null, at the middle of each of its `volumes` with a
  chance.
- each blast a wire sphere (`--s5`, three rings) of `radius.outer` (units; `radiusM.outer` metres) at `blasts[].point`.
- a drawing whose fields are absent is skipped; `missing` names them (`jets[].point`, `jets[].dir`, `jets[].distance`,
  `blasts[].point`, `blasts[].radius`, `fires[].volumes`).
- leaf `<view id>.shot`: the switch "Show the shot result" (`show.shot`, on by default; `setShow({ shot })`) and the colour key of
  the kinds drawn; empty while there is no shot.
- labels (`show.shotLabels`, on by default; `setShow({ shotLabels })`; the switch "Labels on blasts, jets and fires" is the leaf
  `<view id>.shotlabels` right after `<view id>.shot`, empty while there is no shot): on the overlay canvas, the same technique as the
  volume names (halo in the background colour, clipped to its pane), a small square in the kind's colour before each line, a thin
  line from the place to its label. A blast: shell burst, or the script event that made it (`by.event`); radius m (`radiusM.outer`,
  else `radius.outer` / 20) 1 decimal, energy whole, chance in percent only below 100, parts reached (hits with a chance). A jet
  (shaped charge jet, at its start): damage whole, reach m, chance. A fire (at its point, else its first volume with a chance):
  radius m, heating, burn time s when present, chance. Things within half a unit of one another share one label, one line each;
  a label that would cover one already drawn goes under it. The switch hides the labels only, the shapes stay. Pure helpers on
  `_t`: `shotLabels(result, vols, tx)`, `placeTags(boxes, pad)`.

The colours a caller passes (armor map) are data colours; everything else the view draws comes from the page's CSS variables
(background `--card`), read again when the theme changes. Volume ids are `<bone path>/<volume name>` (tools/lib/model/README.md).
Sides here count from 0 (front, top, left, right, rear, bottom), as `tools/lib/model/trace.js` returns them. World space: forward +X,
up +Z, 20 units per metre.

The view gets its data from the document (`D.scene({ anm, frame, meshes, lod })`, which also gives `lod, lodCount, obstacles,
areas`) and redraws on `D.on` events, fetching only what changed. Without a document: `POST /api/x/models/viewer/scene
{ mod, target, anm, frame, meshes }` -> the `scene/1` JSON of `tools/lib/model/scene.js` `toJSON`, read through
`tools/lib/model/sceneload.js` with the mod laid over the game. Textures: `POST /api/x/models/viewer/texture`.
The server keeps the 8 models used last (the same freshness check per model: names, sizes and mtimes of the model's folder), so a
line-up that asks pictures for several targets in turn does not read a model per request; a decoded picture is kept once by the
bytes of its file, so every mesh, material and target that shows the same `.dds` decodes it once (`viewer.server.js` `_t.stat()`).

### Pictures of models (the Units page draws inventory items with them)

The game has no icon file per item: it renders the item's model into a picture when the inventory opens.
A page that wants the same picture asks the 3D view for it.

- `v.snapshot({ width, height, camera?, wait? }, cb)` -> `cb(url | null, { camera, error? })`. `url` is a PNG data URL of
  `width` x `height` pixels with a see-through background, so it sits on any tile colour in the light and the dark theme. Only the
  meshes are drawn (no grid, axes, bones, volumes, labels), shaded, with their textures. The picture is taken when the scene and
  the textures it asked have arrived, or after `wait` ms (default 8000) with what is there. `null`: the model could not be read,
  has no mesh, or there is no WebGL. One at a time: a second call waits for the first. The view may be hidden or 0 x 0; its own
  size, switches and camera are as before afterwards.
- `camera`: the name of a preview camera of the model's `.mdl` (default `'stuff'`, the one the game's inventory uses; an absent
  name falls back to `stuff`, then to the first one), or `false` for the fitted angle. The scene route returns them as
  `scene.preview = { <name, lower case>: { origin, lookat, fov, horizon } }` (`viewer.server.js` `previewCams`, read from
  `{Extender "preview" {"Stuff" {camera ..}}}`).
  `info.camera` says what was used:
  - `'preview'`: the game's camera as it is. The frame is the engine's (right = world z crossed
    with the view direction, turned about it by `horizon`; `_t.engineFrame`), `fov` is the angle across the width.
  - `'preview-fit'`: the camera's angle and roll, but the eye moved along the view direction until the model fills the picture. Used
    when the camera as written would cut the model off or leave it under a third of the picture, or its `fov` is not an angle
    between 5 and 120 (Gates of Hell writes values like 2.17 there; what they mean in that exe was not read).
  - `'fit'`: no preview camera: the angle of the engine's stand-in preview, fitted.
  Whether the mesh coordinates the view draws are the engine's world coordinates one to one (so `'preview'` is the game's picture
  and not its mirror image) is inferred, not compared with a game screenshot. The game's preview lights are not read.
- `v.setTarget(target)` -> true: another model in the same view (a view made with `doc: false` and `ctx.set.target`).
- `viewer.pictures({ sig, mod, wait? })` -> `{ get(target, width, height, cb, camera?), peek(target, width, height, camera?),
  clear(), stats() }`: the render queue. One hidden view (one WebGL context) renders the asked models one after the other, and
  each picture is kept in memory for the page session under `sig()` + target + size + camera, so a model is rendered once.
  `sig()` is a string that changes with the game and the mod (the caller's data signature); `mod()` gives the mod folder of the
  requests (the scene route needs one: without a mod folder there is no picture and `cb` gets null). `get` never blocks: `cb` runs
  at once for a kept picture, else when its turn has come; the same picture asked twice while it waits is rendered once. Draw the
  tile with its label first and set the picture in `cb`. `peek` -> the kept url, null (tried, no picture) or undefined (not made).

## The handles (gizmo host API)

The view calls `G = EXT_SCREENS.models.parts.gizmo(host)` once per view:

```
host.target() -> { kind: 'bone'|'volume', id, world (12), parent (12), vol, posed } | null    the selected thing
host.preview({ kind, id, world } | null)    draw it (a bone with all below it) at `world` while dragging
host.op(name, args) -> Promise              one document op
host.say(text), host.redraw()
G.lines(V)  G.hit(V, x, y)  G.down(V, hit, x, y, e)  G.move(V, x, y, e)  G.up() -> the op's Promise  G.cancel()  G.setMode(m)  G.sync()
V = one pane: { e, f, r, u, ortho, project(p) -> [x, y], ray(x, y) -> { o, d }, upp(p) }, x and y in pane pixels
```

A drag only previews; letting go sends exactly one op: a bone `bone.setMatrix { bone, matrix: world, space: 'world' }`; a volume
`vol.setMatrix { volume, matrix: local }` (move, rotate) or `vol.transform { volume, scale }` (scale). Bones are not moved while an
animation frame is shown. Steps come from the `snapMove` and `snapTurn` preferences and follow a change.
