# ext view: file viewers (contract for viewer kinds)

Every game file opens to something useful. A kind with a home page jumps there (models to Models, map files to Maps). Every other
kind opens as a read-only viewer tab in the Editor. A file that no kind claims opens as bytes (the hex kind), never as the
"binary file" error. The ext has no tab of its own (`tab:false`, no `nav`). Its script runs on every page and sets `window.VIEW`.
Nothing here writes into a mod or the game. One route starts a program: `POST /api/x/view/video/play` (PC only, never a phone; the page asks first
with the confirm box) opens a video in the PC's own player; a video inside a pak is first unpacked read-only to `tmpRoot/view-video`
(removed after a day).

## Files

| file | what |
|---|---|
| index.js | the ext: literal requires of every kind (a missing kind file is skipped), strings, routes, `remote` |
| ref.js | where bytes come from: `resolve`, `readRef`, `readRange`, `readKey`, `listKeys`, `refOfQuery` (over ../files/lib, not copied) |
| server.js | framework routes: bytes, info, hex; `guess` (magic bytes to a type code), `kindFor` |
| client.js | `window.VIEW` (browser, ES5) and the framework css |
| lang.js | framework strings `view.*` |
| kinds/hex.* | the reference kind: a paged hex and text dump |
| test.js | framework test; runs every kinds/*.test.js |

## A kind = up to four drop-in files in kinds/

The kind names are fixed in index.js: hex, sound, picture, model, map, video, font, shader, misc. Every file is optional.

### `kinds/<kind>.server.js`

```js
module.exports = {
  exts: ['wav', 'ogg'],                  // lower case, no dot; what info.kind reports for callers without a page
  match: (name, key) => bool,            // optional, checked before exts
  routes: { 'GET /api/x/view/<kind>/<name>': async (url, body, ctx) => json },   // only under /api/x/view/<kind>/
  remote: ['GET /api/x/view/<kind>/<name>'],   // the GET routes a phone may call (read only). Default: none
};
```

- Read bytes only through `require('../ref')`:
  - `R.resolve(ctx, R.refOfQuery(url))` -> `{name, key, rel, file, inPak, entry, size, where, layer, src}`
  - `await R.readRange(r.src, off, len)` -> Buffer (one slice; a deflated pak entry is streamed, never loaded whole)
  - `R.readRef(ctx, q, {max})` -> `{buf, name, key, rel, file, inPak, entry, size, where, layer}`. Loads the whole file; 413 above max (64 MB by default).
  - `R.readKey(ctx, mod, key)` -> Buffer | null. Reads a neighbour file in the game's layered view (the copy the game loads).
  - `R.listKeys(ctx, mod, prefix)` -> [key]. Sorted, at most 5000.
- These functions check paths for you: escapes, the game and other mods stay read-only, and a phone is asked through `ctx.pathOk` (403).
- Errors are `Error` objects with `.status`, as in every ext route.
- Never write into a mod or the game, and never spawn the game. Starting an outside program needs the confirm box and a POST route that is not in `remote` (see video).
- A server-side converter (for example DDS to PNG) answers JSON with base64 inside; it never writes a cache into a mod.

### `kinds/<kind>.client.js`

```js
module.exports = { script: String.raw`...ES5...`, css: '.vw-<kind>-x{...}' };
```

The script runs on every page, inside the page (h, tx, api, S, show, toast and LS are in scope). It registers itself:

```js
VIEW.reg('<kind>', {
  where: 'tab',                       // 'tab' = a viewer tab in the Editor; 'page' = jump to a page of its own
  label: 'view.<kind>.label',         // lang key: the tab mark, the explorer mark, the status bar
  exts: ['wav'], match: function (name, key) { return false },   // the page table (VIEW.kindOf); match first
  open: function (host, item) { ...; return {close, focus, refresh, hide, show} },   // where:'tab'
  go: function (item) { show('models'); ...; return true }        // where:'page'; false = open the bytes instead
});
```

- `item` = `{ref, name, key, rel, kind, q, api, size}`. `q` is the ref as a query string, for example `api('/api/x/view/<kind>/x?' + item.q)`.
- The handle methods are all optional:
  - `close()` runs when the tab closes and on a mod change.
  - `hide()` runs when another tab is shown. Stop sound and timers there.
  - `show()` runs when the tab is shown again.
  - `focus()` puts the keys on the viewer.
  - `refresh()` runs when the file changed on disk (a restore).
- A hidden viewer keeps its DOM and state.
- Helpers:
  - `VIEW.bytes(item)` -> Promise<Uint8Array> (the whole file, at most 32 MB)
  - `VIEW.info(item)` -> Promise<info> (asked once per item)
  - `VIEW.head(item, info, [[label, value]])`: the header card
  - `VIEW.size(n)`
  - `VIEW.b64(s)` -> Uint8Array
  - `VIEW.where(info)`
  - `VIEW.typeText(info)`
  - `VIEW.extOf(name)`
  - `VIEW.qs(obj)`
- Rules:
  - ES5 only: no backtick, no dollar-brace, no innerHTML, insertAdjacentHTML or document.write.
  - Build the DOM with h() and textContent. Every visible string goes through tx().
  - Do not put `data-blk` blocks inside a viewer: the Editor's host is a leaf block.
  - Prefix css classes with `vw-<kind>-`, and use page tokens (`var(--fg)`, `--card`, `--line`, `--hint`, `--pri`, ...).
  - The css is injected the first time any viewer is drawn.

### `kinds/<kind>.lang.js`

Rows `[key, en, ru, uk, zh]`. Every key starts with `view.<kind>.` (index.js throws otherwise). Every string comes in all four languages, in plain words.

### `kinds/<kind>.test.js`

- Takes a scratch dir argument and builds its own fixture.
- Prints PASS on its last line; view/test.js runs it.
- See kinds/hex.test.js: the route on a fixture, plus the page script in `tools/gui/test/fakedom.js`.

## Framework routes (GET, read only, open to a phone, each file checked)

`<ref>` = `mod=&rel=` | `mod=&key=[&idx=]` | `[mod=&]path=`.

- `rel` may be `<pak>::<entry>`: an entry of one of the mod's own paks.
- `key` without `idx` means the copy the game loads.

| route | answer |
|---|---|
| `/api/x/view/bytes?<ref>` | `{name, size, b64}`. The whole file, 32 MB at most (413 above) |
| `/api/x/view/info?<ref>` | `{name, key, rel, size, ext, kind, magic, text, type, where, layer, inPak, entry, file}`. `magic` = the first 16 bytes in hex. `type` = a guess code from the magic bytes (worded by `view.t.<code>`). `where` = mine, othermod, vanilla or outside |
| `/api/x/view/hex?<ref>&off=&len=` | `{off, len, size, b64}`. One slice, len 1..65536 (400 outside that range, 416 past the end) |
| `/api/x/view/hex/find?<ref>&from=&text=\|hex=` | `{at, len, next, size, done}` (hex kind). At most 64 MB or 2 s per call; call again from `next` |

## The page table: `VIEW.kindOf(name, key)`

The checks run in this order:
1. A kind's `match`.
2. A kind's `exts`.
3. The text table: null, meaning the Editor edits it. This covers .set, .def, .mdl, .lng, .lua and the like, plus files with no extension under set/ or entity/.
4. The bytes table: 'hex'. This covers pak, ply, anm, dds, wav, pso, exe and the like.
5. Anything else: null.

When /api/x/files/open answers 415 for a null file (binary, or UTF-16), the Editor and the Files page open it as bytes.

## Opening

| call | what it does |
|---|---|
| `VIEW.open(ref, name?, {kind?, line?})` | from any page. A page kind calls `go`. Otherwise the Editor opens it (`IDE_PENDING` + `show('ide')`): a viewer tab for a kind, a text tab for text. A page without the Editor, or a game whose tabs have no Editor (`INGAME.ide` false; `VIEW.ideHere()`), shows the viewer in a dialog box: opening a file never switches the game |
| `IDE.open(ref, line, col, {view})` | `view` = 'kind' opens that viewer; false opens the text; leaving it out lets `VIEW.kindOf` decide. A page kind jumps only for a plain open (not quiet, no line); otherwise the bytes tab opens |
| `IDE.openView(ref, kind)` | the same as `IDE.open(ref, 0, 0, {view: kind})` |
| `VIEW.mount(host, ref, name, {kind})` | a viewer inside any element. Returns a handle with `{kind, item, el, close, focus, refresh, hide, show}` |

Viewer docs in the Editor:
- Fields: `d.view` = kind, `d.kind` = 'view', `editable:false`, no CodeMirror buffer, `d.size`, `d.info`.
- Tab strip, history, the session (it keeps `view`), crumb, status (kind + size), copies, which and copy-in all work.
- Text actions are off: save, problems, explain, info, line, compare, side, Notepad++.
- The explorer marks viewer files and offers "Open as bytes" (for any file and for a mod's pak) and "Open as text".

## Games (AS64, MoW:AS2, Gates of Hell)

- Every route reads the page's game from ctx (`ctx.gameId`, `ctx.exe`, `ctx.curDir`; `api()` sends it). The file and its layered view come from files/lib in that game (MoW:AS2: exe mowas_2, no as64/core; GoH: the GoH install). Mods are checked in read mode, so a GoH mod in `<GoH>/mods` can be viewed; nothing is ever written.
- sound: GoH plays with the GoH rules (model `game:'goh'`) and the GoH profile volumes; the page shows a Play rules row. picture: GoH also loads BC5 (ATI2, BC5U, BC5S; note bc5goh). shader: `.gso .hso .dso .cso` too; the cache line is worded per game.
- Page jumps go only to pages the game shows: a model file with no Models page opens as bytes; a map file with no Maps page opens the Map Viewer (`S.mapKey`, `show('mapviz')`).
- Test: kinds/parity.test.js.
