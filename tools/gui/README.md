# tools/gui: shared page parts

## searchKit: every search or filter box

Owner rules, verbatim:
- 2026-11-19: "every single search bar in the gui needs to have; a manual browse, indexed search, and history list". Text filters count too.
- 2026-11-19: "browse should always be a file directory browse".
- 2026-11-19: "normal index search is what the search bar is for".

So every box made with `searchKit` (tools/gui/page.js) has exactly three parts:
1. the bar itself = the **indexed search** while typing (ArrowDown on an empty box shows the first rows of the whole index; a "Show N more" row pages on, nothing is cut silently);
2. **Browse** = always the folder / file browser (the picker `dialog#pk`), opened where the things the box searches for live; what is chosen there goes into the box;
3. **History** = what was searched in this box before.

There is no list popup and no third button. A new search box uses the kit; the kit refuses to start without an input, a history key and an index.

### Contract

```
var kit = searchKit(input, {
  key:    'mypage.q',                  // required: history key, kept in LS 'sk.hist.' + key (20 newest, case-insensitive dedupe)
  index:  function (q, done) { ... },  // required (or list): done(rows, more), rows [{label, value, hint}], may answer late
                                       //   (stale answers dropped). q is the text (token mode: the word at the caret), '' when
                                       //   ArrowDown asks on an empty box. more = hits not sent (shown as a note)
  browse: {                            // optional: where Browse opens and what a pick puts in the box (table below)
    mode:    'file',                   //   'file' (default) | 'dir': pick a file, or a folder ("Use this folder")
    start:   'map',                    //   string or function () -> string, read at each click. disk: a full folder path, '' = the
                                       //   mod, else the game folder, else the roots; data: a game path like 'map' or 'entity/tank'
                                       //   ('resource/' in front is dropped), '' = the top of the game's files
    view:    'disk',                   //   'disk' (default: real folders, GET /api/ls) | 'data' (the game's layered files: its paks
                                       //   and loose files with the current mod on top, GET /api/x/ide/vdir)
    exts:    ['def', 'set'],           //   optional: only files with these extensions are listed (folders always are)
    game: 'mowas2',                    //   optional, data view only: the id of another game than the header's, whose data is browsed (the header's mod is left out)
    toValue: function (path, entry) {},//   optional: what goes into the box (default: path). '' or null = nothing changes
    out:     false                     //   disk, mode 'dir': picking a folder to write to (home and drives first)
  },
  list:   function (done) { ... },     // older form, still accepted: with no index, its items [{group,label,value,hint}] are the index
                                       //   (read once, again after kit.refresh(); filtered by the text). It never opens a popup
  onPick: function (value, item, from) {},// optional: from = 'index' | 'history' | 'browse'; default sets input.value, fires input + change.
                                       //   For a Browse pick, item = the entry below
  mode:   'replace',                   // or 'token': a pick replaces only the word at the caret (filter languages like "army=ger cost>500")
  arrows: true,                        // false: ArrowDown on a closed list is left to the page (a list beside the box)
  beside: false,                       // true: the page draws its own index view right under the box (a pick list, Go to file):
                                       //   typing shows only the matching history rows (index not asked), arrows and Enter stay with
                                       //   the page's list (they close the kit's list), History opens the whole history; implies arrows:false
  cap:    30                           // index rows shown at a time; the "Show N more" row adds `cap` more
});
```

- **No `browse`**: Browse still opens the picker: file mode, disk, at the current mod folder (else the game folder, else the roots); the chosen path's base name without its extension goes into the box. So no box is ever without a file directory browse.
- **`browse` as a function** `browse(done)` is allowed only for a box that opens this same picker itself (e.g. the picker's own filter box, or a page that calls `pick(...)` with options the spec cannot say); `done(value, item)`.
- **Entry** (second argument of `toValue`, and `item` of `onPick` for a Browse pick): disk `{view:'disk', path}`; data `{view:'data', path, key, name, where, layer, pak}` where `path` is the game path without `resource/` (`map/single/m1`), `key` the full view key (`resource/map/single/m1`), `where` `mine` | `othermod` | `vanilla`, `pak` the game pak's file name or null.
- **Data view needs the game folder** of the page's game tab (AS2, AS64, GoH; the page's game header picks it). With no game folder, or when the view cannot be read, the picker says so in its hint line and shows the disk at the mod (else the game folder). A mod the route refuses (not a mod of this game) is dropped and the game alone is shown. The first open after a GUI start builds the layered view on the server (seconds on a big install; it is then cached): the list says "Reading the game data ..." meanwhile and the page stays usable; folders are read in pages of 2,000 rows with a "N more in this folder" row.
- **Picker header** has a switch "Game data" / "Folders on disk" (`#pkview`); recent picks are kept per view (`pk.recent.dir|file` for the disk, `pk.recent.ddir|dfile` for game paths).
- **LAN Remote (view only, `RMT`)**: the disk is closed there (`/api/ls` is not in tools/gui/remote.js ALLOW), so a box that asks for `view:'disk'` shows the view-only toast; the default Browse (no `browse` given) opens the data view instead, whose route (`GET /api/x/ide/vdir`) is allowed (it checks every path against the folders the PC page shows). The view switch is hidden there.
- Missing `input`, `key` or `index` (and no `list`): the kit writes the reason to the console and throws.

### How to choose start / view / toValue

| the box holds | Browse spec | example |
|---|---|---|
| a path on disk (folder or file box) | `{mode:'dir' or 'file', start:function(){return box value or its folder}}`, no toValue (the path) | forms `path` fields; `{mode:'dir', start:function(){return inp.value.trim()}, out:true}` for an output folder |
| the name of a game thing (unit, weapon, map, sound, texture) | `view:'data'`, `start` = the game folder of those things, `exts`, `toValue` = the name the box expects | unit: `{mode:'file', view:'data', start:'entity', exts:['def','set','ext'], toValue:function(p){return base name without extension}}`; map: `{mode:'dir', view:'data', start:'map', toValue:function(p){return 'single/m1' from 'map/single/m1/...'}}` |
| a mod name | disk, `mode:'dir'`, start = the game's `mods` folder, `toValue` = the folder name | forms `name` / `mods` fields, Mods page filter |
| a text filter over files (a file list, a tree) | the same place the list shows, `toValue` = the file name (or the path the list matches) | files filter: `{mode:'file', view:'data', start:function(){return current folder}, toValue:function(p,e){return e.name}}` |
| a text filter over rows that come from files (findings, log lines, table rows read from files) | Browse picks the file; `toValue` = what the rows carry of that file (its name), and the page's filter also matches that field, so the pick filters to that file | Check filter: `{mode:'file', start:function(){return r.mod}, toValue:function(p){return file name}}`, and the filter matches the findings' sample files |
| no file behind it at all (free text, numbers, settings words) | none: the default Browse (file mode at the mod, base name in the box) | a box with only `key` and `index` |

### What it does

- wraps the input in place in `span.sk[data-sk=<key>]` with a Browse button, a History button and a `div.sk-dd` list (role listbox; the input becomes a combobox);
- on typing: asks `index` for the text (in token mode, the word at the caret), draws in the next animation frame, matching history first (marked "recent", each with an x to forget it), then "clear history", then up to `cap` index rows and a "Show N more" row (`.sk-more`; click or Enter adds `cap` more and keeps the text), then a note for hits the index did not send;
- ArrowDown on a closed list (when `arrows` is on) opens it; on an empty box it asks the index for `''` (the first rows of the whole index);
- arrows, Enter, Escape work on the list; a key the kit used is marked `e._sk = 1`, default-prevented and stopped (`stopPropagation`), so a window or form around the box (the guided task's Enter = Next) never sees it. A page's own keydown handler on the same box starts with `if (e._sk) return;` and is assigned after the kit is made. An Enter the kit did not use (list shut or no row chosen) bubbles as usual: a box whose own Enter means Find stops it itself in that handler;
- the open list is `position: fixed` at the box (class `sk-fix`; measured, so a transformed ancestor is allowed for), so a parent with `overflow: hidden` (the editor's small include windows, the CodeMirror wrapper) does not cut it; it opens upward (`sk-up`) when there is little room below and more above, and follows scroll and resize while open. Without `getBoundingClientRect` or `window` (test DOMs) it stays absolute under the box. Known limit: a transformed ancestor that also clips (overflow) still clips it;
- a click on a list row is default-prevented, so a box inside a `<label>` (form fields) does not get the label's click and reopen the list;
- remembers the text on Enter, change, blur and every pick;
- Browse calls `searchKit.picker(spec, done)`, which page.js sets (it calls `pick(mode, start, cb, {view, exts, out})`). In ext test DOMs that run only the kit's source (`kitSrc()`) there is no picker: Browse logs "no file browser" on the console and does nothing; a test can set `searchKit.picker = function (spec, done) {...}` to check its spec.

Returns `{el, input, remember, refresh, focus, close, isOpen, history, flush, items, browse, browseButton, historyButton, list}`; `input._sk` is the kit. `kit.browse()` = a click on Browse. Call `kit.refresh()` when the data behind `index`/`list` changes. Use `kit.el` where the input used to go, and `kit.focus()` to focus without opening the list.

### The picker on its own

`pick(mode, start, cb, opt)` (page.js): `mode` 'dir' | 'file'; `opt.view` 'disk' | 'data', `opt.exts`, `opt.out`; `cb(path, entry)` (entry as above). Data view route: `GET /api/x/ide/vdir?mod=<S.mod>&dir=<game path>&lim=2000[&off=&ver=]` -> `{dir, dirs:[name], files:[{name, key, where, layer, size, idx?, pak?}], total, off, next, ver, notes?}` (ext/ide/routes.js; `notes` holds `no-game` when there is no game folder). Disk route: `GET /api/ls`.

### Adoption on an ext page

```
var q=el('input',{type:'text',autocomplete:'off','aria-label':tx('mypage.q')});
q.addEventListener('input',function(){draw()});                // the page's own filtering stays as it was
var items=function(){return ROWS.map(function(r){return {label:r.name,value:r.id,hint:r.file}})};
var qKit=searchKit(q,{key:'mypage.q',
  index:function(s,done){s=s.toLowerCase();var a=items().filter(function(i){return (i.label+' '+i.value).toLowerCase().indexOf(s)>=0});done(a)},
  browse:{mode:'file',view:'data',start:'set/stuff',exts:['set'],toValue:function(p,e){return e.name.replace(/\.set$/,'')}}});
root.appendChild(blk('filter.q',[qKit.el],{name:tx('mypage.q')}));   // the wrapper, not the bare input
```

Ext tests that run page scripts in `ext/units/fakedom.js` get the real kit through `require('../../test/blockcheck').kitSrc()` (the Balance SHIM does this).

### Styles and texts

CSS classes (page.js): `.sk`, `.sk-btn` (`.sk-browse`, `.sk-hist`), `.sk-dd` (`.sk-fix`, `.sk-up`), `.sk-o` (`.sk-hist`, `.sk-index`, `.sk-clear`, `.sk-more`), `.sk-lab`, `.sk-tag`, `.sk-hint`, `.sk-x`, `.sk-clr`, `.sk-note`. Below 700 px wide the input takes its own line.

Texts: `sk.*` and the picker's `pk.*` in `tools/gui/lang/{en,ru,uk,zh}.json`.

### Known limit

History lives in the browser's localStorage under `as2gui.sk.hist.<key>`. `tools/gui/settings.js` does not yet let `sk.*` (or the folder picker's `pk.*`) through to the server, so history is lost when the GUI starts on another port.

### Where it is used

Every search and filter box of the GUI (main page and every ext page, every game tab). Each has an explicit `browse` spec; none uses a browse function of its own, a name-list popup or a legacy `list`. Find them with `grep -rn "searchKit(" tools/gui`.

| where the things live | Browse | boxes (examples) |
|---|---|---|
| game data, `entity` | data view, file, `.def` | unit boxes: `units.search`, `logs.unit`, `art.unit`, `balance.q`, `bots.add.unit`, `maps.place.entity`, `mapviz.objectsFind`, `models.q`, `goh.unit` (GoH data at `entity/-vehicle`), the unit pair picker on Test Run (`test.pair.shooter`, `test.pair.target`, and its list filter `test.pairs.filter`) |
| game data of another game | data view with `game:'<game id>'` | `goh.donor` (the AS2 data from the GoH tab: `game:'mowas2'`, at `entity`) |
| game data, `set/stuff` | data view, file | weapon and gun boxes: `art.weapon`, `units.rc.weapon`, `models.armor.gun`, `models.shot.gun` |
| game data, `set/breed/mp`, `set/multiplayer/units` | data view, file | `balance.breeds.q` (pick gives `side/breed`), `balance.cards.q` (pick gives the card file) |
| game data, `map` | data view, folder | `maps.filter`, `maps.place.map`, `missions.filter`, `mapviz.listSearch`, `pro.map` |
| the open model's folder | data view, file (`ply`, `anm`, `vol`, `mtl`, textures) | the Models sub-tab boxes (`models.tree.*`, `models.anim.ed.read`, `models.vol.q`, `models.ply.*`) |
| the documents the page shows | disk, file, `.md` | `docs.*`, `guides.*`, `help.limit`, `help.glossary`, `doctrine.rules.q` |
| the mod on disk | disk, file | `files.filter`, `check.filter`, `ide.gofile`, `ide.x.filter`, `task.sk.x-mod.search` |
| a folder the box names | disk, folder | `pro.game`, `pro.mod` (the folder one tool reads, not the program's mod), `share.out`, `share.upGame`, `mapviz.exportEdRoot`, `goh.out`, `ide.search.other` |
| the game's `mods` folder | disk, folder; pick gives the folder name | `mods.filter`, `pro.mods`, `share.creditMod`, `task.sk.release.mods`, `task.sk.x-mod.pick` |
| nothing in a file (tool catalog, outline of the open document, task rows) | the default picker | `ide.pieces.q`, `ide.outline`, `ide.fix`, `task.row.filter` |

No page has a "Mod folder" box of its own that sets the program's mod (owner 2026-11-19: "this is redundant when its in the header"): Balance, Units, Maps, Missions and Models follow the mod in the header.

### Forms (buildForm)

Every form `buildForm` makes (run cards, the Tools page's "Copy as command" `copy.c.*`) gives a kit to each box that takes the path or name of a thing that already exists (`fkKind` in page.js):

| field | index | Browse |
|---|---|---|
| any `path` field named in `DIRNAMES` (mod, game, goh, out, ...) | recent folder picks, this mod, the game folders, the installed mods (`/api/installed`) | the folder picker (disk, where the box points) |
| any other `path` field | recent file picks | the file picker (disk, the folder of the box's file, else the mod) |
| `map` | the game's maps (`/api/x/pro/names`) | game data at `map/`, folder mode; the pick gives `multi/<name>` or `single/<name>` |
| `donor`, `unit` | the game's unit and weapon names (same route) | game data at `entity/`, `.def .set .ext` files; the pick gives the base name |
| `mods` (comma list) | installed mod names; a pick replaces the part after the last comma | the game's `mods` folder on disk, folder mode; the pick gives the folder name |
| `name` of uninstall, e2e, dev-loop | installed mod names | the game's `mods` folder on disk; the folder name |

History key `form.<field name>`, shared by every form with that field. Fields for new names, numbers and free text stay plain. The lists are read once per mod and game folder. Texts `fk.g.*`.

## JUMPS: the jump back bar

A floating bar at the bottom centre (`#jmpbar`, page.js) shows once a click took the user somewhere else: "Back to: <tab> › <sub-tab> › <item> (<block title>)" and, with more than one jump kept, their number. Each click goes back one jump, newest first (game, page, view, then the scroll position); the x forgets them. In memory only, 30 places, no two equal in a row. Every page of every game tab gets it with no code of its own:

- A change of game, page, sub-tab, item or view is a jump: `show`, `switchGame` and `viewSet` report the place left. A page that changes its own view must call `viewSet(page, view)` (as before) to be seen and to come back in that view through its `view(v)`.
- A position jump on the same page is found by watching: after a click (or Enter in a box) the window or any scroll container that moves by more than half its height within 1.5 s, without a wheel, touch or scroll key, makes a jump back to where the click was. `scrollIntoView`, anchor links and "go to" buttons need nothing.
- Not seen by the watch: a jump that starts later than 1.5 s after the click, a change of state inside a page that neither scrolls nor calls `viewSet` (own inner tabs, a map pan, a selection), and a container that is replaced by a new element (the window position still comes back). For those call `JUMPS.mark(label)` just before the jump: it keeps the current place now; `label` is the text shown in brackets.
- `window.JUMPS`: `mark(label)`, `back()` (true when it went back), `clear()`, `size()`.
- While the bar shows, `body` has class `jmpon` (bottom padding, the toast moves up). z-index 45: over a page shown full window, under tooltips and menus (50+), the search lists (1000) and the map place picker (2000).
- Test: `node tools/gui/test/test-jumps.js`.

## JOBS: the current job list in the footer (contract 1)

Every piece of work the GUI was told to do is a job: listed in the floating footer (the bar that also holds jump back), with a Cancel button. One registry on the server, one tracker in the page.

### Job record (server `GET /api/jobs` -> `{jobs:[...]}`, newest last)
`{id, kind, what, whatP, page, game, state, stage, done, total, startedMs, endedMs, canCancel, writes, cmd, interactive}`
- `id` string. `/api/run` jobs keep their `r...` id; an extension request uses the id the page sent in the header `x-arsenal-job` (`[A-Za-z0-9_-]{6,40}`, else the server makes one `x...`); a background job gets `b...` unless it names its own.
- `kind`: `run` (`/api/run`), `req` (one extension request), `bg` (background job a page polls).
- `what`: a language key of the page (`job.w.*`, or any key the page's lang has), `whatP` its params; empty for `req` (the page names those from the clicked button). `cmd` and `interactive` as before for `run`, else `''` and `false`.
- `page`: the page id to go to (`maps`, `mapviz`, ...), `''` when unknown. `game`: `as64|mowas2|goh` (the old field name stays).
- `state`: `running|done|failed|cancelled|timeout`. A finished job stays listed 10 s, then goes.
- `stage` free text or key, `done`/`total` numbers or null. `canCancel` false = cannot be interrupted. `writes` true = it writes into a mod (the page asks twice before stopping it).
- The old fields `id, cmd, interactive, startedMs, game` keep their meaning (tests and remote devices read them).

### Server (`tools/gui/joblist.js`, made once in `start()`)
- `jobs.add({id?, kind, what, whatP?, page?, game?, canCancel?, writes?, cancel?})` -> handle `{id, set({stage?,done?,total?,what?,whatP?}), end(state='done'), cancelled}`. `cancel()` is the job's own stop function; it may return a promise. `end` twice is harmless.
- `jobs.cancel(id)` -> `false` when there is no such running job, else calls its `cancel`, sets `handle.cancelled`, returns `true`. `jobs.list()`, `jobs.cancelAll()` (server close).
- `POST /api/cancel {id}`: any registered job. 404 `no such running job`, 409 `{error, key:'job.e.nostop'}` when `canCancel` is false, else `{ok:true}`.
- Extension dispatch: every `/api/x/...` request is a `req` job for as long as it runs. `ctx.jobs` is the registry; `ctx.job` is this request's handle. `ctx.runTool` of that request attaches each child to it: cancel kills the child's process tree (`killTree`), `runTool` then resolves `{code:null, stdout, stderr, timedOut:false, cancelled:true}`, later `ctx.runTool` calls of the same request resolve the same at once, and the dispatcher answers 499 `{error:'cancelled', key:'job.cancelled'}` whatever the handler returned. A request is `canCancel` only while it has a live child. Its children die too when the client goes away and when the server closes.
- A route marks its request with `ctx.job.set({what, whatP, page})`, and `ctx.job.writes = true` before it writes. `ctx.job.hidden = true` keeps a request off the list (a later page of one walk, a slice of a background job); status polls and held polls are hidden by the dispatcher (the same table as `JOBSKIP` in page.js). `ctx.job.onCancel(fn)` + `ctx.job.canCancel = true` make a request with its own work stoppable; a live `ctx.runTool` child does so by itself.
- New routes of batch 2: `POST /api/x/bots/botmatch/stop`, `GET /api/x/maps/clone/status?mod=`, `POST /api/x/docs/history/joinstop`.
- A background job outlives its request: the page's server code calls `ctx.jobs.add({kind:'bg', ...})` itself and `end()`s it. To attach a child started with `ctx.runTool` to a background job pass `{job: handle}` in the runTool options.

### Page (`page.js`)
- `window.JOBS`: `list()`, `cancel(id)`, `on(fn)` (called on every change), `track(promise, {what?, page?, cancel?})` for work that goes around `api()`.
- `api(url, body, opt)` tracks every request that is still pending after 600 ms. `opt.job === false` keeps it out (status polls, held long polls). `opt.what` (a ready text) names it; else the name is "<page name>: <text of the clicked button>". The request carries `x-arsenal-job`.
- `streamRun` jobs are tracked under their run id.
- The tracker reads `GET /api/jobs` every 1.5 s while anything is listed, every 15 s when idle, once on load; entries with the same id merge (the server's state and progress win, the page's name wins for `req`).
- Footer: `#jmpbar` holds `#jobbtn` (left: newest running job, its progress or seconds, `+N`), then the jump back part. `#joblist` opens above it: a row per job (`data-job=<id>`) with name, game, seconds, progress, `button[data-jcancel]`; "Cancel all" with two or more. The bar shows when there is a job or a jump; `body.jmpon` as before.
- Cancel: `canCancel` -> `POST /api/cancel`; `writes` -> first click arms ("Stop anyway?"), second click stops; not `canCancel` -> greyed with the reason. A `req` job the server does not know (finished or never registered) cannot be stopped.
- Language keys `job.*` in the four languages. Tests: `node tools/gui/test/test-jobs.js` (page), `node tools/gui/test/test-jobsrv.js` (server).

Page notes (how page.js built it):
- Also on `window.JOBS`: `fetch(url, init, opt)` (fetch with the header and the list rules; `api()` and the Editor's `call()` go through it), `skip` (the poll table `JOBSKIP`), `sync()` (read the server list now), `tune({wait, keep, fast, slow})` (the times in ms, for tests). `track` also takes `id`, `kind`, `cmd`, `now` (list at once) and `state(value)`; tracked work waits 600 ms like a request.
- Polls never listed: a GET whose path ends in `/status`, `/progress`, `/joblist`, `/jobs`; `/job` or `/run` with `id=` in the query; `/api/jobs`, `/api/health`, `/api/settings`; any GET with `wait=1`. A POST is always work: a page that polls with POST passes `{job:false}`. Every request still carries the header, so the page can tell its own unlisted requests in the server list and leave them out.
- A request ends for the list when its answer starts (status 499 = stopped, other errors = failed). A run is listed from its start event. A `req` of another window is listed on the second read that sees it running, named "<page> (another window)".
- A stopped request (499, key `job.cancelled`) rejects from `api()` with `message` and `text` "Stopped" and `cancelled: true`.

## CACHE: the shared store, the Prepare screen, updates (contract 1)

One store for everything the GUI has already made. Rule: an entry whose stamps differ from the asked stamps is never served.

### `tools/lib/cachestore.js`
- `open({root, cap, release, now}) -> S`. Defaults: root `toolcache.dir('store')` (so `ARSENAL_CACHE` redirects it), cap 2 GB, release `lib/credit.js version()`. One `S` per root in a process (`open` memoises).
- An entry is named by its identity: `section` (string, `a-z0-9.-`) plus `parts` (plain JSON: game folder, exe, game id, mod path, request parameters; no times). It lives at `<root>/e/<sha1(section, parts)>/` as `meta.json` `{section, parts, ver, release, stamps, at, bytes, raw}` and `value.json` (or `value.bin` for a Buffer). One entry per identity; a put replaces it. Writes go to a temp name and are renamed.
- `S.get(section, ver, parts, stamps) -> {value, at, bytes} | null`. null when there is no entry, or `ver`, the release or any stamp differs, or the entry does not parse (a damaged entry is removed).
- `S.put(section, ver, parts, stamps, value) -> {bytes}`. value: JSON data or a Buffer. Best effort: a failed write warns once (lib/cachewrite) and returns `{bytes: 0}`.
- `S.wrap(section, ver, parts, stamps, make) -> Promise<value>`. get, else `await make()` then put. Two calls for one identity at a time share one `make`. A `make` that throws stores nothing.
- `S.state(section, ver, parts, stamps) -> {state: 'ready' | 'none' | 'stale', why: [..], at, bytes}`. why holds `'release'`, `'version'`, and the first word of each stamp name that differs (`'mod'`, `'game'`, ...).
- `S.clear(section?) -> {removed, bytes}`, `S.stats() -> {bytes, entries, cap, root, sections: {name: {bytes, entries}}}`, `S.sweep() -> {removed}` (entries of another release; the server calls it once at start), `S.evict()` (oldest use first until under the cap; runs after a put).
- `ver`: a small integer the owner bumps when the shape or the maker changes. In a source checkout the release is `dev`, so `ver` is what retires old entries there.
- As built: `meta.json` also holds `sum` (a check of the value; a mismatch is a damaged entry), last use is a `use` file beside it, temp files live in `<root>/t/` and per-entry locks in `<root>/l/<key>/`. Also `S.key(section, parts)`, `S.root`, `S.cap`, `S.release`, `S.evict(keep?)`; module exports `{open, CAP, canon, testRoot, isTestMain, _reset}`.
- Index: `stats`, `sweep`, `clear`, `evict` and the total a put keeps do not open every `meta.json`. They read `<root>/index.json` (`{v, j, e: {key: [section, bytes, release, at, mod?]}}`) plus `<root>/j.log`, one line per put or removal since byte `j`, appended under the entry's lock. The index only counts and is trusted only against the `e/` folder listing: a listed key it does not know is read from its `meta.json` (a damaged or foreign one is removed), a key not listed is forgotten, and every scan checks the next 8 entries against their `meta.json` in turn. `get` and `state` always read the entry's own meta and value, so a damaged or foreign entry is never served. Both files may be deleted at any time (the next scan reads the metas once and writes them again).
- `sweep()` also removes `modtree` entries whose mod folder (`parts.mod`) no longer exists: such a T can never be served as fresh.
- Tests never get the user's store: with no `root` and no `ARSENAL_CACHE`, a process whose main script is a test (`test.js`, `test-x.js`, `x.test.js`, `guardtest.js`, `cachetest.js`, `testgames.js`, or anything in a `test/` folder inside tools), and every process it starts after `cachestore` (or `modtree`) was loaded (env `ARSENAL_TEST_STORE`), opens `<temp>/arsenal-test-store-<pid>`, removed when the test ends. A runner may export `ARSENAL_TEST_STORE=<scratch folder>` itself to cover every child.
- `S.getRaw(section, ver, parts, stamps) -> {buf, at, bytes, raw} | null`: `get` without the parse. `buf` is the stored bytes: for JSON data exactly `JSON.stringify(value)` in UTF-8 (`raw: false`), for a Buffer the Buffer (`raw: true`). Same misses as `get` (a damaged entry is removed). For a route whose answer is the stored value: answer with the bytes (below) instead of parse + stringify.
- An answer with its own JSON text: a route may give its answer object a property `__json` (a Buffer, not enumerable, may be a getter) holding exactly `JSON.stringify(answer)`; `send` in `gui.js` writes those bytes instead of stringifying. Callers of the route function still get the plain object. Used by `ide/tree` (the row text of a page of a finished list is kept beside the list). Headers and body on the wire are the same as without it.
- gzip: `send` and `sendPage` pack an answer only for a socket that is not loopback (a phone on the LAN) whose request has `Accept-Encoding: gzip`, for text kinds (`text/*`, JSON, JavaScript, XML, SVG) of 1 KB or more; it then carries `content-encoding: gzip`, `vary: accept-encoding` and the packed `content-length`. The packed page is kept per variant beside its bytes. Loopback answers, pictures, archives, sound and the streams (`/api/live`, the `/api/run` stream) are never packed. Test: `tools/gui/test/test-wire.js`.
- `S.evict` looks at a `use` file only while an entry not yet looked at could still be the least recently used (an entry's last use is never older than its `at`): the same entries go, in the same order, without a stat per entry.
- `S.warm() -> Promise<{bytes, entries}>`: the store's total without a blocking pass. A store whose index lacks more than 50 entries (no `index.json` yet, or deleted) has their `meta.json` read 50 at a time from a timer, the index saved every 500 rows. A `put` that meets such a store starts the same work and skips its size check until the total is known (the cap may be passed meanwhile by the bytes of those puts; the check and `evict` run at the end). `stats`, `sweep`, `clear` and `evict` stay synchronous and complete: called meanwhile they read what is left in one pass. A caller that wants a start without that pass awaits `warm()` before `sweep()`.

### Stamps
A stamps object is `{name: string}`. Names: `game` (from gameview), `mod:<area>` (from modtree), and any owner's own (`rules`, `lang`).

### `tools/lib/modtree.js` (one walk of a mod for everybody)
- `scan(modDir, {onProgress, signal}) -> Promise<T>`, async, yields between folders. `T = {dir, at, count, bytes, all, areas: {set, entity, map, properties, interface, script, text, pak, other}, files}`. `files`: `[rel, size, mtimeMs]` with forward slashes, lower case not applied. Each area value and `all` is a sha1 of the sorted `rel|size|mtimeMs` rows of that area. Areas: `resource/set/**` set, `resource/entity/**` entity, `resource/map/**` map, `resource/properties/**` properties, `resource/interface/**` interface, `resource/script/**` script, `*.lng` and `localization/**` text, `*.pak` anywhere pak, the rest other. A file is in one area (first match in that order, pak before the folder rules).
- `ensure(modDir, {maxAgeMs = 15000}) -> Promise<T>`: the last scan if younger, else one scan (concurrent callers share it).
- `last(modDir) -> T | null` (sync, whatever is known), `touch(modDir)` (the next ensure scans again; call after any write into the mod), `stamps(T, areas) -> {'mod:set': sig, ...}`.
- `fresh(modDir, maxAgeMs = Infinity) -> T | null` (sync): the scan of this process when nothing touched the mod since; never the T kept in the store. `T.left`: sorted rel paths the walk saw and did not list (the folders it does not enter, links); in no signature, for lib/vfs.
- The last T of each mod is also kept in the store (section `modtree`), so a restart knows the previous signature before the first walk ends.
- As built: `N.pat` counts as pak; `.git`, `.svn`, `.arsenal`, `node_modules` and symlinks are skipped; `stamps(T)` with no areas gives `{'mod:all': sig}`. Also exported: `areaOf(rel)`, `AREAS`, `VER`, `_reset({store})` (the server passes its own store to scratch servers).

### `tools/lib/gameview.js` (one game file view for everybody)
- `get({gameDir, exe, gid}) -> view`: `vfs.build({gameDir, mods: []})` (with the options the game id needs), memoised per game folder + exe, rebuilt when `stamp` changes.
- `stamp({gameDir, exe}) -> string`: sha1 of the exe version (lib/gamever) and every pak's name, size and mtime under the game's resource folders. Checked at most every 5 s.
- `text(view, resPath, enc) -> string | null` helper for the one-file reads the bots parts do. `drop()` for tests. `stamp(o, {force})` skips the 5 s memo. No exe is passed for as64.
- `has({gameDir, exe, gid}) -> bool`: the game view is built and its stamp stands (no build).
- `withMods({gameDir, exe, gid, list, mods, lang, ..., maxAgeMs, signal}) -> Promise<view>`: the game plus mods. Awaits `modtree.ensure` of every folder it mounts, then `vfs.build({listings: [T..], base: get(o)})`: no stat per mod file, the game is not mounted again, the view is the one `vfs.build` gives for the same options. Kept per options (3 at most) while the game stamp and each folder's `all` signature stand. When the game view is not built yet it is built first and the loop gets one turn before the mod build. `withModsSync(o, {fresh, revalidate, noAge})` for callers that cannot await (by signature when `modtree.fresh` has every folder, else lib/vfs walks).
- `lib/vfs build` options behind it: `listings: [T]` (a mod folder inside a scanned dir is read from the scan's rows; names in `T.left` from disk) and `base: view` (the game layers are taken from a `get` view of the same folder and exe). Same records, order and problems as a build without them.

### Server
- `ctx.cache` is the store, `ctx.modtree` and `ctx.gameview` the two modules, `ctx.cacheSwept` the number of entries of another release removed at this start. `GET /api/cache` -> `S.stats()`.
- A route that writes into the mod calls `ctx.modtree.touch(mod)` after the write.

### Prepare sections (the `prep` export of an extension)
`prep: [{id, title, needs, areas, games, state(ctx, q), run(ctx, q, job)}]` in the ext's `index.js`.
- `id`: `a-z0-9.` unique; `title`: a lang key of that ext; `needs`: ids that run first; `areas`: the modtree areas it depends on (`[]` = game only); `games`: game ids it applies to (absent = all).
- `q = {mod, game: {id, dir, exe}}`. `state` -> `{state: 'ready' | 'none' | 'stale' | 'na', why: [..], at, bytes, note}` and must be cheap (no walk, no build: use `ctx.modtree.last` and `S.state`). `run` makes the data through the same code path the page uses (so the page then hits the cache), reports `job.set({stage, done, total})`, stops when `job.cancelled`, and writes nothing into the mod or the game.
- Shared ids: `game.view`, `mod.tree` (owned by the prep ext); the others are named `<ext>.<thing>`.

### `tools/gui/ext/prep` (page id `prep`, Help & Docs > first sub page, all game tabs)
- `GET /api/x/prep/state?mod=` -> `{release, updated: bool, checking: bool, store: stats, sections: [{id, ext, title, needs, state, why, at, bytes, note, running, queued}]}`. `updated` is true until the first state read after a start that swept another release's entries.
- `POST /api/x/prep/run {mod, sections: [ids] | 'all' | 'stale'}` -> `{queued: [ids]}`: one background job per section (`kind: 'bg'`, `what: 'prep.job.run'`, `whatP: {s: title}`, `page: 'prep'`), one at a time, needs first. `POST /api/x/prep/stop {}` stops the running one and empties the queue. `POST /api/x/prep/clear {section?}`. `POST /api/x/prep/check {mod}` -> `modtree.touch` + `ensure`, as a background job.
- Page setting `prep.open` (default true): the GUI opens on this page at start; false = the last page as before.
- `ctx.cacheSwept` is a live getter: null until the start sweep has run (the store index is warmed in the background first, so start does not block), then the sweep's answer. `ctx.cacheReady` is a promise that settles when that is done; a route that needs whole-store numbers (`stats`, `clear`) in the first seconds awaits it.
- Speed rules, measuring and the open speed backlog: `gui/PERF.md`.
