# tools/lib/model/edit: the built-in model and animation editor (contract)

Owner's decision 2026-11-10: everything SOEdit does is built into ARSENAL, in the Models tab, so the
SOEdit exe is no longer needed. The list of what "everything" means is `tools/soedit/parity.md` (219 rows, 12 groups).
This file is the contract between the sessions that build it. One session owns the core; one session owns each domain.
A session edits only its own files.

## The document

A document is one model opened for editing: the `.mdl`, the `.ply`, `.vol`, `.anm`, `.mtl` files it uses and, when present,
the unit's `.def`. Files are read with the mod folder laid over the game (`tools/lib/model/sceneload.js`). The game is never
written. Nothing is written anywhere until Save.

```
core.open({ mod, target | mdl, game }) -> doc
doc.id, doc.rev (number, +1 per applied change), doc.mod, doc.mdl (rel path of the .mdl)
doc.files: Map rel -> { rel, kind: 'mdl'|'ply'|'vol'|'anm'|'mtl'|'def'|'other', bytes: Buffer (current), bytes0: Buffer (as opened),
                         from: 'mod'|'game'|'new', dirty: boolean }
doc.read(rel) -> the object tools/lib/model/<kind>.js parse() gives for the current bytes (cached per rev; never mutate it in place:
                 copy what you change, then write)
doc.apply(opName, args) -> { rev, changed: [rel], info }      // runs the registered op, records one undo step
doc.undo() / doc.redo() -> { rev, changed }      doc.canUndo, doc.canRedo, doc.dirty()
doc.scene({ anm, frame, meshes }) -> the scene/1 JSON of scene.js, built from the CURRENT bytes (unsaved edits show in the 3D view)
doc.save({ dry }) -> { writes: [{ rel, bytes, was: 'new'|'changed' }], refused: [..], check }   // mod folder only, through writeguard;
                 a changed file that came from the game is written into the mod at the same rel path; `dry` writes nothing
core.close(id)
```

Added by the core (2026-11-10, nothing above changed):

```
core.get(id) -> doc | null      core.list() -> [{ doc, mdl, mod, rev, dirty }]      core.MAX = 8 open documents (the least recently
                 used one without unsaved changes is closed for a new one; when all 8 have unsaved changes open() refuses)
core.register(name, { apply, check? })    core.registerState(name, fn)    // by hand (tests); domain files just export ops/state
core.ops() / core.states() -> [names]     core.problems() -> [{ file, error }]   // a domain file missing pieces or throwing on load is
                 skipped and listed here; the core and the other domains keep working.   core.reload()
core.kindOf(rel)      core.normRel(rel) -> 'resource/..' forward slashes (throws on '..' out, a drive or a leading '/')
doc.game, doc.target, doc.entity (the .def key | null), doc.unresolved (names the .mdl/.ply use that were not found)
doc.has(rel), doc.bytes(rel) -> Buffer | null (current), doc.fetch(rel) -> Buffer | null: that file as the mod over the game has it on
                 disk now, for an op that brings in a file that is not in the document yet
doc.read(rel) for mtl, def and other: mdl.js parse() (the SDL tree with byte spans, so mdl.edit() works on them too). rel is matched
                 without regard to case; an unknown rel gives null
doc.state(what, query), doc.summary() (the /open reply), doc.history() -> { undo: [op names], redo: [op names] }
doc.scene(q) also carries { rev, anm (rel), frame (clamped), frames }; q.anm may be a rel or a name relative to the .mdl
doc.apply(): an op may return a rel that is not in the document yet; it joins as from 'mod' (on disk in the mod), 'game' or 'new'.
                 An op that returns nothing new (same bytes) makes no undo step. Errors carry e.code 'CHECK' (check said no),
                 'UNKNOWN_OP', or none (apply threw); e.status = 400
doc.save({ dry, force }) -> { writes: [{ rel, bytes, was, size }], removes: [{ rel, to }], refused: [{ rel, reason }], notes: [string],
                 check, written }   all or nothing: any refusal writes nothing. A mod file changed on disk by another program since it
                 was opened is refused unless force. A removed mod file is moved to <mod>/.arsenal/model-edit/removed/<time>/<rel>
                 (never deleted); a removed game file stays in the game (a note). Temp file next to each target, then rename; a
                 failed rename puts back what was replaced. check = { findings: [{ file, line, code, msg }] } from
                 tools/soedit/check.js mdlLoss / anmLoss / plyLoss on each changed file (as opened -> as saved); null if check.js is missing.
```

Added later (W6, nothing above changed):

```
doc.exists(rel) -> boolean          in the document, in the mod on disk, or in the game (key lookup, no read)
doc.listDir(dir, ext) -> [rel]      the files of one folder with that extension (document, mod, game), sorted
doc.state('doc.dir', { dir?, ext? }) -> { dir: 'resource/.../' (trailing slash), files: [rel] }   default: the .mdl's folder, '.anm'
doc.scene({ anm, frame, meshes, lod }) also gives lod (clamped), lodCount, obstacles, areas (scene.js shapes2)
doc.save({ dry, force, backup, lint }):
    backup: the mod's own copy of each file about to be replaced is copied first to
            <mod>/.arsenal/model-edit/backup/<time>/<rel>; the result gives backups: [{ rel, to }]
    lint:   true, or a run function as tools/soedit/check.js linters takes: binhdr and expcheck run on the new bytes and the result
            gives check.lint (findings on the changed files) and check.ran; a linter that cannot run gives LINTER_FAILED
An op whose info names { mdl: rel } of a .mdl in the document makes that the main file (save as, rename, new model in place);
    undo and redo put the main file back.
A new file of the document that nothing names any more (for example the .mtl an OBJ import made before mat.set pointed the mesh
    elsewhere) is still written on save; a reopened document does not load it (tools/gui/ext/models/e2e.test.js shows it).
```

Error codes have plain-words texts in `tools/lib/explain.js`: UNKNOWN_OP, UNKNOWN_STATE, LOSS_CHECK_FAILED, LINTER_FAILED,
NO_SKELETON, VOLUME_NO_BONE, PLY_ERROR, VOL_ERROR, ANM_ERROR, REF_DISK_PATH, REF_MISSING.

## An operation

A domain module is `tools/lib/model/edit/<domain>.js`. The core loads every `.js` file in this folder except `core.js`.

```
module.exports = {
  ops: {
    '<domain>.<verb>': {
      // bytes in, bytes out. Read with doc.read(rel) or the lib parsers, build the new bytes with the lib writers
      // (mdl.js edit(), ply.js / vol.js / anm.js write()). Return only the files that change. Never touch the disk.
      apply(doc, args) -> { files: { '<rel>': Buffer | null }, info? }     // null = the file is removed from the document
      check?(doc, args) -> string | null                                   // a plain-words reason the op cannot run
    }
  },
  state: {                                                                 // read-only views for the page, JSON only
    '<domain>.<what>': function (doc, query) -> object
  }
}
```

Rules: an op is one undo step; the core keeps the old bytes of every file an op returns, so a domain module writes no undo code.
An op that fails throws an Error with a plain-words message and changes nothing. Untouched files stay byte-identical.
Names, matrices, sides and units as in `tools/lib/model/README.md`. Volume ids are `<bone path>/<volume name>`.
Op names in use: `tree.*`, `bone.*`, `vol.*`, `obst.*`, `ply.*`, `mat.*`, `anm.*`, `tl.*`, `file.*`, `pref.*`.

## Routes (tools/gui/ext/models/sub/doc.server.js, owned by the core session)

```
POST /api/x/models/doc/open   { mod, target | mdl }            -> { doc, rev, mdl, files: [{ rel, kind, from, dirty }] }
POST /api/x/models/doc/op     { doc, op, args }                -> { rev, changed, info, canUndo, canRedo, dirty }
POST /api/x/models/doc/undo   { doc }   /redo                   -> { rev, changed, canUndo, canRedo, dirty }
POST /api/x/models/doc/state  { doc, what, query }             -> the JSON of the registered state function
POST /api/x/models/doc/scene  { doc, anm, frame, meshes }      -> scene/1 JSON of the current bytes
POST /api/x/models/doc/save   { doc, dry }                     -> { writes, refused, check }
POST /api/x/models/doc/close  { doc }
POST /api/x/models/doc/dir    { doc, dir?, ext? }              -> { dir, files: [rel] }
```

`/scene` also takes `lod` and gives `lod, lodCount, obstacles, areas`; `/save` also takes `backup` and `lint` and gives `backups`
(and `check.lint`, `check.ran` with lint).

Added fields: `/open` also gives `target, mod, canUndo, canRedo, dirty, unresolved, ops, problems`, and each file `size` (and
`removed: true` for a file an op took out); `/op`, `/undo`, `/redo`, `/save` also give `files` (the same list) so the page stays
current; `/undo` and `/redo` give `op` (the name undone or redone); `/save` takes `force` and gives `removes, notes, written, rev`
(writes without the bytes: `{ rel, was, size }`); `/close` gives `{ closed }`. Refusals are status 400 with a plain sentence.

A domain part needs no server file of its own unless it does something that is not an op or a state read.

## The page side (tools/gui/ext/models/sub/doc.client.js, owned by the core session)

```
var D = EXT_SCREENS.models.doc
D.open(ctx) -> Promise          D.id, D.rev, D.files
D.op(name, args) -> Promise({ rev, changed, info })        D.undo()   D.redo()   D.save(dry)
D.state(what, query) -> Promise(json)                      D.scene(q) -> Promise(scene/1)
D.on(function (ev) {})         // ev = { type: 'change', rev, changed } | { type: 'select', sel } | { type: 'open' } | { type: 'saved' }
D.sel = { bone: path | null, volume: id | null, anm: rel | null, frame: number }      D.select({ bone, volume, anm, frame })
```

The core part also draws the bar above the sub-tabs: Undo, Redo, Save (with the list of files it will write, shown before it
writes), the "changed, not saved" mark, and the warning before leaving with unsaved changes.

Added on the page side: `D.mdl, D.mod, D.dirty (boolean), D.canUndo, D.canRedo, D.ops (op names the server knows), D.problems,
D.opening (the open Promise while it runs)`; `D.on(fn)` returns a function that removes the listener, and a listener added while the
page draws its sub-tabs (between `D._begin()` and `D._end()`, which `../client.js` calls around every draw) is dropped at the next
draw, so a part adds its listener each time it is drawn; a listener added at load time stays. `D.close()`, `D.confirmLeave()` (true
when nothing is unsaved or the user says to drop it), `D.bar(root)` (used by `../client.js`). `D.open(c)` takes the page ctx or
`{ mod, target | mdl }`. Change events also carry `info`, and `undo: true` / `redo: true` when they come from undo or redo. The page
passes `ctx.doc = D` to every part. Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z work while the Models page has the focus and no text field does.

Added later (W6): `D.save(opts | dry, force)` (opts `{ dry, force, backup, lint }`), `D.beforeSave(fn)`, `D.askSave()` (the bar's
whole Save flow; Ctrl+S calls it from anywhere on the page, text fields too), `D.close()` emits `{ type: 'close' }`,
`D.setHidden({ bones, volumes })` with `D.hidden` and the `{ type: 'hidden' }` event, `D.dir(q)`, `D.pref(name, default)`,
`D.go(sub, sel)` (and `EXT_SCREENS.models.go`), `D.keymap`, `D.area(el)`, `D.scene({ lod })`. Written out with the keys table and the
preferences in `tools/gui/ext/models/sub/README.md`.

A domain part is `tools/gui/ext/models/sub/<name>.client.js` + `.lang.json` + `.test.js` (rules: `tools/gui/ext/models/sub/README.md`).
It adds a sub-tab or a panel, reads through `D.state`, changes through `D.op`, redraws on `D.on`. It never keeps its own copy
of the model as the truth. Colours come from the page's tokens (`var(--fg)`, `var(--card)`, `var(--line)`, `var(--acc)` ...), so
the part follows the light and dark theme; no fixed hex colours for surfaces or text.

## Parity record

Each session writes `tools/soedit/parity-done/<GROUP>.json`: `{ "<ROW ID>": { "state": "done"|"partial"|"not owed"|"missing",
"where": "<file>:<line or function>", "test": "<test name>", "note": "" } }` for every row of its groups. The coordinator
merges these into the Replacement column of `tools/soedit/parity.md`. A row SOEdit has greyed out, dead or without a handler
is "not owed". A row SOEdit does wrongly (the "broken" ones, and the save losses section 3) is done RIGHT here,
and the note says what differs.

## Sessions and files

| Session | Rows | Owns |
|---|---|---|
| E0 core | (none; serves all) | `edit/core.js`, `edit/README.md`, `test/model-edit-core.test.js`, `sub/doc.*`, `sub/README.md`, `ext/models/{index,client,server,test}.js`, `ext/models/lang.json` |
| E1 tree and bones | TREE, BONE | `edit/tree.js`, `test/model-edit-tree.test.js`, `sub/tree.*` |
| E2 volumes | VOL, OBST | `edit/vol.js`, `test/model-edit-vol.test.js`, `sub/vol.*` |
| E3 meshes and materials | PLY, MAT | `edit/ply.js`, `test/model-edit-ply.test.js`, `sub/ply.*` |
| E4 animation | ANM, TL | `edit/anm.js`, `test/model-edit-anm.test.js`, `sub/anim.*`, `sub/timeline.*` |
| E5 views | VIEW | `sub/viewer.*`, `sub/gizmo.*` |
| E6 files and preferences | FILE, PREF, MISC | `edit/file.js`, `test/model-edit-file.test.js`, `sub/file.*` |

(`test/` here is `tools/lib/test/`: the lib tests are `tools/lib/test/model-edit-<domain>.test.js`, written like `model-anm.test.js`
(`module.exports = (t, assert) => {..}` plus a `require.main` block so it also runs alone), joined to `tools/lib/test/test.js` by one
`require('./model-edit-<domain>.test')(t, assert);` line. `sub/` is `tools/gui/ext/models/sub/`.)
