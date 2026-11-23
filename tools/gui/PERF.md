# PERF: keeping the ARSENAL GUI fast

Written 2026-11-21 after the cache / Prepare / speed-up work. Four parts: rules for new code, how to measure, and two backlogs of speed-ups not yet done. Contract texts stay in `gui/README.md` (sections JOBS and CACHE); this file is the why and the what next.

Status of the numbers: measured on the real game and one 112k-file, 11 GB mod, in-process, on Windows. Not measured: a real browser's parse and paint, the built exe's start, GoH pages on a real install, write routes. Nothing was run in the game. Line numbers are from the working tree of 2026-11-21 and drift; search the function name when a line does not match.

Each part was written by a separate reader of the code and keeps its own number marks (explained at the top of each part). Backlog items are suggestions, none is built.

Contents
- Part 1. Rules for new code: server routes, caching, loops and I/O, client, tests, merge checklist, grep list, proposed guards
- Part 2. Measuring: cookbook, baseline numbers, proposed budgets, bench tool and big-mod fixture (proposals)
- Part 3. Backlog, server side: group A keeps content and function, group B changes what the user sees and needs the owner's decision
- Part 4. Backlog, page and start: languages, building pages at first show, remaining client patterns, requests at start, program start, real-browser measuring

---

# Part 1. Rules for new code
Paths are relative to `tools/`. Numbers marked (brief) were measured by the coordinator on the real game and a 112k-file, 11 GB mod; nothing here was re-measured. Line numbers are from the working tree of 2026-11-21 (uncommitted).

Three facts decide everything below:
- The server (`gui/gui.js`) is one thread. A route that blocks 5 s blocks every page, every poll and the job list for 5 s.
- On Windows a loose-file open costs 1-1.6 ms warm (brief). File count, not parsing, is the cost.
- The client is one 8.3 MB page with 29 screens. Work done for a hidden screen is wasted.

## 1. Server routes

### R1. Nothing that walks, spawns or builds a view runs synchronously on the request path
Why: every module built its own game view and walked the mod itself, 13 s per walk, 80 s cold page open (brief, lesson 1).
Never in a route handler or in anything it calls synchronously:
- a recursive `readdirSync`/`statSync` walk of a mod or the game
- `vfs.build(...)` called directly
- `spawnSync` / `execSync` / `execFileSync`
- `JSON.parse` of a multi-MB string per request (a 30 MB value costs 450-500 ms, brief)
- a loop over more than a few hundred files with no `await`

Use instead:

| need | use | copy from |
|---|---|---|
| "did the mod change", file list of a mod | `await ctx.modtree.ensure(mod)` then `ctx.modtree.stamps(T, areas)` | `gui/ext/maps/index.js:671-672` |
| game file view | `ctx.gameview.get({gameDir, gid})` | `lib/gameview.js:104`, used at `gui/ext/maps/index.js:674` |
| game + mods view | `await ctx.gameview.withMods({gameDir, exe, mods})` | `gui/ext/maps/index.js:674`, `gui/ext/files/lib.js:542` |
| a built answer | `ctx.cache.wrap(section, ver, parts, stamps, make)` | `gui/ext/maps/index.js:676`, `gui/ext/balance/server.js:48` |
| a child process | `ctx.runTool(...)` (async, attached to the request's job, killed on cancel) | contract: `gui/README.md:174` |
| work longer than about 2 s | background job: `ctx.jobs.add({kind:'bg', ...})`, answer at once, page polls a `/status` route | `gui/ext/prep/lib.js:209-212`, `gui/ext/docs/routes.js:314` |
| a long CPU loop that must stay in process | yield with `setImmediate` every few thousand items | `lib/modtree.js:56`, `:109`, `:131` |

Wrong pattern still in the tree: `gui/ext/task/recipes/text.recipe.js:206` and `:240` (`cp.spawnSync`, behind the routes at `:272` and `:274`; `text/missing` 107 s, `text/lint` 6.5 s, brief).

`withModsSync` (`lib/gameview.js:176`) exists for callers that cannot await. It falls back to a blocking 13 s walk when no scan of this process is fresh. New code awaits `withMods`.

### R2. Memoise per request anything derived from the environment
Why: a Steam registry lookup (`reg export`, 80-230 ms) ran on every `ctx.game()` call, up to 93 times in one request, 20.7 s over a 14-page walk (brief, lesson 2).
Right: the per-request closure `gui/gui.js:686-688` (`ctxGame`, resolved once, kept for the request) plus the 5 s memo in `lib/gamedir.js:35-41`. The same shape for the remote roots: `gui/gui.js:644`.
In a route, read `ctx.game()`, `ctx.curDir()`, `ctx.gohDir()`, settings and `gamedir.resolve` once at the top into a `const` and pass the value down. A lib function takes the folder as an argument; it does not resolve it again.
Wrong: `gamedir.resolve(` or `ctx.game()` inside a helper that a loop calls.

### R3. A route that writes into a mod calls `ctx.modtree.touch(mod)` after the write
Why: `ensure` serves a scan up to 15 s old (`lib/modtree.js:178-179`); without `touch` the next read is stamped with the pre-write signature and gets the old entry.
Right: `gui/ext/modes/index.js:159`, `gui/ext/bots/lib.js:87`. Drop any in-memory memo in front of the store too: `gui/ext/balance/server.js:83`.

## 2. Caching

### C1. Anything that costs more than about 200 ms to make and is a pure function of game + mod + parameters goes in the store
Why: caches were keyed on age or nothing, kept in memory or the OS temp folder, none keyed on the release; one list never noticed edits inside a mod (brief, lesson 6).
Right: `S.wrap(section, ver, parts, stamps, make)` (`lib/cachestore.js:319`). Contract: `gui/README.md:194-213`.

### C2. `parts` is identity, `stamps` is state, `ver` is the maker
- `parts`: what the user asked for. Game folder, game id, mod path, request parameters. No times, no signatures. AS64 and MoW:AS2 share a folder, so the game id is a part (`gui/ext/balance/server.js:27`). Normalise paths (`path.resolve` or lower case), or the same mod makes two entries.
- `stamps`: what the answer was read from. `game` from `gameview.stamp` plus `mod:<area>` from `modtree.stamps` (`gui/ext/balance/server.js:28`, `gui/ext/maps/index.js:672`). Add your own (`rules`, `lang`) for any other input file.
- `ver`: a small integer constant beside the section name. Bump it when the shape or the maker changes. In a checkout the release is `dev`, so `ver` is the only thing that retires old entries (`gui/README.md:206`).

### C3. Name the narrowest modtree areas that are still correct
Why: `mod:all` rebuilds on any texture or map edit; too narrow serves stale data.
How: list every path the maker reads and map each with `areaOf` (`lib/modtree.js:48-54`). Pitfalls: `*.pak` and a root `N.pat` are area `pak` wherever they lie, and a pak can hold any file, so a maker that reads through the view almost always needs `pak`. `mod.info` is `other`. `*.lng` is `text` only outside the six `resource/` area folders (first match wins).
Right: `['entity', 'pak', 'other']` for the entity name list (`gui/ext/maps/index.js:672`). Game-only data uses `areas: []` (`gui/ext/maps/index.js:693`).

### C4. Never TTL-only
A time limit may sit in front of a stamp check to save the check (`STAMP_MS` 5 s at `lib/gameview.js:46`, 15 s in `modtree.ensure`), never instead of one. An age-only cache serves wrong data for that age after every edit, then rebuilds for nothing.

### C5. What stays in memory
The store holds JSON or a Buffer. Objects with handles or identity (a vfs view, parsed trees other code holds) stay in a small LRU in front, keyed by parts + stamps: `lib/gameview.js:122` and `:145-147` (3 views at most; three views plus the listing are 232 MB heap, brief), `gui/ext/balance/server.js:21` and `:43-49` (4 tables, plus `RUN` so equal requests in flight share one build).
Pass the fresh value through `JSON.parse(JSON.stringify(...))` before returning it, so fresh and stored answers are the same value (`gui/ext/balance/server.js:36`). Nothing mutates a shared cached value after the build.

### C6. Every store section exports a Prepare section
Why: a section without one costs the user the cold build on first open (`maps.ents` 4-9 s, brief).
Right: `prep: [{id, title, needs, areas, state, run}]` in the ext's `index.js` (`gui/ext/maps/index.js:692-717`, `gui/ext/bots/index.js:107`). `state` is cheap: `ctx.modtree.last` and `S.state` only, no walk, no build (`gui/ext/balance/server.js:55-60`). `run` goes through the page's own route code, so the page then hits the entry. `areas` equals the areas in the stamps.
Missing today: `maps.ents`, `bots.guns.*`, `bots.names`, `maps.pic`, `ide.pak`, `models.armor` (brief).

### C7. Know what the shared walk does not see
`lib/modtree.js:42` and `:84-87`: folders `.git`, `.svn`, `.arsenal`, `node_modules` and every symbolic link or junction are not entered and are in no signature. They are named in `T.left`; `lib/vfs.js:154` reads those from disk.
- A mod whose `resource/map` is a junction has an empty `map` area. A conversion to the walk lost that mod's map list until a fallback was added (brief, lesson 9). A maker that lists files from `T.files` must also handle `T.left`, or go through the view. The fallback to copy: `gui/ext/missions/index.js` `linked(T)` + `diskRows(mod)` (search the names; a link at, above or under the folder sends the route back to a disk read).
- An edit behind a link changes no stamp. Data read from there carries its own stamp or is not stored.
- Tool state under `.arsenal` never invalidates anything. If the answer depends on it, add an own stamp.

## 3. Loops and I/O

### L1. Hoist loop invariants
Why: `modScan(mod)` per units file, 58 x 58 file reads, 4-5 s per request (brief, lesson 3).
Any call inside a loop whose arguments do not depend on the loop variable moves above the loop. Check every `for`/`map`/`forEach` body for calls that take only `mod`, `game`, `ctx` or `view`. The fixed case: `gui/ext/bots/lib.js` `buys` (the mod scan is taken once above the per-file loop; 3.8 s -> 0.15 s warm).

### L2. Read each file once per job
Why: units catalogue 23,000 reads for 10,688 files, 66-73 s -> 25-29 s with a byte memo; price session 22 s -> 8 s; whole-mod check 92 s -> 48 s (brief, lesson 4).
Right: `lib/sdlset.js:144-150` (`memo(on)`: bytes kept per key while on), switched on for one read-only phase and off in `finally`: `pricecalc/pricecalc.js:94-95`.
The lifetime is one build or one check, not the process (memory, and stale bytes after an edit). Off while the caller writes and reads back.

### L3. `withFileTypes`, never a stat per entry
Why: 12 s -> 1.4 s (brief, lesson 5).
Right: `fs.readdirSync(dir, {withFileTypes: true})` (`gui/ext/files/lib.js:776`); async form `lib/modtree.js:79`. Size or mtime of a mod file comes from the `T.files` rows (`[rel, size, mtimeMs]`), not from disk.

### L4. Batch reads through the thread pool
Many files: read N at a time with async fs (the walk uses 32: `lib/modtree.js:43`, `:69-76`). Sync reads of 10.7k files take 9-11 s, 32 parallel `fs.promises.readFile` 1.1-2.4 s (brief). No unbounded `Promise.all` over 10k paths.

### L5. Never one child process per item
A node child costs tens of ms to start (estimated) and reads again everything its parent knew. One child gets the whole list, or the work is done in process.

## 4. Client

### K1. Fetch only when shown
A screen's `refresh` runs at first show; hidden screens are only marked stale (`gui/page.js:1649-1650`, `:2578`). No fetch in `init`, at script load, or from another screen's refresh. `eager: true` is used by nothing today; adding it needs a reason in a comment.

### K2. Share in-flight requests
Why: the same request sent twice on page show (refresh, then focus); a lint POST sent again while one was running (brief, lesson 7).
Right: `gui/ext/balance/client.js:36` (`busyFor`), `gui/ext/logs/script.js:166`, `gui/ext/models/client.js:170`; one check per file with at most one waiting: `gui/ext/ide/ui/core.js:657`.

### K3. One draw per frame
Why: a panel rebuilt whole 68 times at build, 29,215 elements -> 6,119 after coalescing (brief).
Right: `drawSoon` at `gui/ext/mapviz/sub/list.client.js:26` and `gui/ext/missions/client.js:68`: state changes set a flag, one `requestAnimationFrame` draws.

### K4. No layout read per appended row
Why: the log pane read `scrollHeight` per line and laid the pane out each time (brief).
Right: `gui/page.js:715-719` (scroll to the end once per frame; rows capped at 4000). Reads that force layout: `scrollHeight`, `offsetHeight/Width/Top`, `clientHeight`, `getBoundingClientRect`, `getComputedStyle`. Keep them out of loops that also write.

### K5. Polls stop when the window is hidden
Right: `gui/page.js:612-619` (the idle read stops when hidden, one read on `visibilitychange`). A new poll uses `pageHid()` and a GET path the job list skips (`/status`, `/progress`; `gui/README.md:190`).

### K6. A late answer must not wipe what the user is doing
Right: a sequence number per request, older answers dropped (`gui/ext/units/client.js:121`). An answer equal to what is shown draws nothing. A redraw keeps scroll, selection, focus and typed text, or patches rows in place.

### K7. Debounce typed input, draw big lists in windows
Server search 350 ms after the last key (`gui/ext/units/client.js:121`); a local filter draws next frame over lower-case text made once (`gui/ext/files/script.js:28`, `:86`; `gui/ext/docs/script.js:172`). Lists draw 100 rows and more on scroll (`gui/ext/mapviz/sub/list.client.js:4`, `:162-169`). Every search box is the shared `searchKit` (`gui/README.md:3`).

## 5. Tests

### T1. Scratch store and scratch temp
Why: tests wrote into the user's real cache folder (brief, lesson 8).
A test process gets its own store by file name (`lib/cachestore.js:102-122`: `test.js`, `test-x.js`, anything under `test/`). A test with another name is not covered: rename it or export `ARSENAL_TEST_STORE`. A test server passes `tmpRoot` (`gui/test/test-jobsrv.js:109`; `gui/gui.js:568-569`).

### T2. Three sameness tests per cached answer
All three are in `gui/ext/balance/test.js`:
1. cached equals fresh: `:86-88` (`deepStrictEqual(ts, tf)` after `_forget()`).
2. rebuilt after a relevant edit, including a same-size edit where only the mtime moves: `:70-75`; add and remove `:77-79`.
3. not rebuilt after an unrelated edit: `:82-85`; also `gui/ext/maps/test.js:495`.

The maker exports a build counter (`stats.builds`, `gui/ext/balance/server.js:22`), so the test counts builds instead of timing them. Add a fourth when the maker lists files: a fixture mod with a junction and a `.arsenal` folder (C7).

### T3. No single-tick assertion against an async read
Why: `await tick()` checks raced late reads under load (brief, lesson 9).
Right: wait for the condition: `until` (`gui/test/test-header.js:65`), `waitFor` (`gui/test/test-gui2.js:20`), `settle` with a driven clock (`gui/test/test-lazy.js:53`).

### T4. Count requests at page start
`gui/test/test-lazy.js:81` (one `/api/mod`) and the list `LAZY` at `:20` (no `/api/x/<ext>/` call for a screen never shown). A new ext page adds its id to `LAZY`.

## 6. Before you merge a new page or route
1. No sync walk, `spawnSync`, direct `vfs.build` or per-file `statSync` reachable from a route (grep list below).
2. Game folder, settings and mod path resolved once per request and passed down.
3. Every answer over about 200 ms is in the store with `parts`, `ver`, a `game` stamp and named areas.
4. Areas checked against every path the maker reads, paks and links included.
5. Every write route calls `ctx.modtree.touch(mod)` and drops its memory memo.
6. Work over about 2 s is a `bg` job with progress and cancel.
7. The store section has a `prep` entry whose `run` uses the page's code path.
8. The screen fetches nothing before first show; its id is in `LAZY` in `test-lazy.js`.
9. Draws are one per frame, a repeat of an in-flight request is dropped, polls stop when hidden.
10. Sameness tests (T2) pass on a scratch store; the change is in every game tab's version of the page.

## 7. Grep list
Run from `tools/` over `gui/ext gui/gui.js lib`, tests left out. A hit means "look", not "wrong". `\|` in a cell is a plain regex `|`.

| regex | a hit means |
|---|---|
| `\b(spawnSync\|execSync\|execFileSync)\(` | a child that blocks the server. Allowed in CLIs and start-up code only. |
| `vfs\.build\(` | a private view; should be `gameview.get` / `withMods`. Allowed in `lib/gameview.js`, `lib/vfs.js`, CLIs. |
| `withModsSync\(` | may fall back to a 13 s walk. Needs a reason. |
| `\b(statSync\|lstatSync\|existsSync)\(` in a loop body | a syscall per item. Use `withFileTypes` or `T.files`. |
| `readdirSync\((?![^)]*withFileTypes)` | a listing that will need a stat per name. |
| `function \w*(walk\|scan\|collect\|listAll)\w*\(` in `gui/ext` | a private walker; should be `ctx.modtree`. |
| `readFileSync\(` in a loop or a recursive include reader | repeat reads. Needs a byte memo (L2). |
| `gamedir\.(resolve\|goh)\(` or `ctx\.(game\|curDir\|gohDir)\(\)` below the top of a handler | an environment lookup per call (R2). |
| `Date\.now\(\)\s*-\s*[\w.]+\s*[<>]` near a `Map` or memo | an age-only cache (C4). Look for a stamp beside it. |
| `^const \w+ = new Map\(\)` in server files of `gui/ext` | a process-wide memo. Check its key, bound and invalidation. |
| `os\.tmpdir\(\)` | data outside the store and outside `ctx.tmpRoot`. |
| `\.(wrap\|put)\('` with no `modtree.stamps` or `gameview.stamp` within 10 lines | an entry with no stamps. |
| `(writeFileSync\|renameSync\|rmSync\|copyFileSync)\(` in a route file with no `modtree.touch` | a write the walk does not see for 15 s (R3). |
| `setInterval\(` in client files | a poll. Check that it stops when hidden (K5). |
| `scrollHeight\|offsetHeight\|offsetWidth\|getBoundingClientRect\|getComputedStyle` in a function that appends | layout per row (K4). |
| `oninput:\|addEventListener\('(input\|keyup)'` with a direct `api(` | a request per key (K7). |
| `(innerHTML\|textContent)\s*=\s*''` at the top of a `refresh` or `draw` | a full rebuild; check K3 and K6. |
| `await tick\(\);\s*(ok\|assert)` in tests | a single-tick race (T3). |

## 8. Proposed automated guards (not built)
All are node scripts under `gui/test/`, run by `gui/test/run.sh`. None needs the game.

### G1. `gui/test/test-routelint.js`: static lint of the request path
What: for every file that exports routes (`gui/ext/*/index.js`, `routes.js`, `server.js`, `*.server.js`, `recipes/*.js`) and the files they require inside `gui/ext`, flag `spawnSync|execSync|execFileSync`, `vfs.build(`, `withModsSync(`, `readdirSync(` without `withFileTypes`, and `statSync(` in a loop body. An allow list `gui/test/routelint.allow.json` holds `{file, pattern, count, why}`; the test fails when a count rises above the allowed one or a row has no `why`.
Catches: lessons 1, 2 (the `reg export` child), 5. `text.recipe.js:206,240` become the first allow rows, visible as debt.
Limits: regex, not a call graph; it misses sync work inside `tools/lib`. A second pass over `lib/` with its own allow list covers part of that. Size S.

### G2. Request budget at start (extend `gui/test/test-lazy.js`)
What: assert the exact set and count of requests at page start against a list in the test (today only `/api/mod` is counted, `:81`), and that showing each screen once sends each distinct URL once.
Catches: lesson 7 (double request on show), an `init` that fetches, a new eager screen. Size S.

### G3. `gui/test/test-loopblock.js`: event-loop block budget on a fixture mod
What: start a server with `tmpRoot` on a generated fixture mod (about 3,000 small files, made in scratch), call each hot GET route cold and warm while `perf_hooks.monitorEventLoopDelay` records the longest block. Fail above a per-route budget from `gui/test/loopblock.budget.json`. The budget is loop block, not wall time, so machine load matters less; set it at 3x the first measured value (estimated; needs one calibration run).
Catches: lessons 1, 3, 4, 5 and any new sync build on a route. It does not prove behaviour on 112k files; it catches the shape. Size M.

### G4. `gui/test/test-iocount.js`: syscall counts for the hot builds
What: wrap `fs.readFileSync`, `fs.statSync`, `fs.readdirSync` and `child_process.spawnSync` with counters in the test process, run the maker of each store section on the fixture, assert reads <= unique files x 1.1, spawns = 0, registry lookups <= 1 per request, and that a second call with unchanged stamps reads no mod file.
Catches: lessons 2, 3, 4, 5 exactly (93 lookups, 58 x 58 reads, 23,000 reads for 10,688 files). Counts are stable under load, times are not. Size M.

### G5. `gui/test/test-prepcontract.js`: store contract generated from `prep`
What: for every `prep` section of every ext, on the fixture: `run`, then `state` is `ready`; the page route answers with zero builds; touch one file in each modtree area in turn and check that `state` goes `stale` exactly for the areas the section lists; add a junction and a `.arsenal` file and record the result. Also lists store sections with no `prep` (grep `.wrap('` section names against the collected ids).
Catches: lessons 6 and 9, a wrong `areas` list, a `run` that does not use the page's code path. Size M; each maker must expose a build counter.

### G6. `gui/test/test-testhygiene.js`
What: fail when a test file under `tools/` requires `cachestore`, `modtree` or `gui.js` and its name does not match `isTestMain` (`lib/cachestore.js:104`); fail on `os.tmpdir()` in non-test files of `gui/ext`; warn on `await tick(); ok(`.
Catches: lesson 8 and the flaky half of lesson 9. Size S.

---

# Part 2. Measuring, baselines and budgets
Paths are relative to `tools/`. "measured (brief)" = taken from the shared brief, measured by the coordinator on the real game + the 112k-file, 11 GB mod. "measured (this part)" = one 500-file scratch run by the writer of this part. Everything else is estimated or a proposal. Only snippet 1.2 was run; the others are written against the code they cite and are not run.

## 1. Measuring cookbook

Rules for every snippet: put the script in a scratch folder, never under a `test/` folder and never named `test*.js` (see 1.7), run it with `tools/` as working folder, use `/` in paths.

Snippets 1.1 and 1.3-1.6 are UNTESTED: written against the code they cite, never run. Run and fix one before trusting its numbers.

### 1.1 Time one route in-process with a fake ctx
A route is `async (url, body, ctx)` in the ext's `routes` map. Tests call it directly: `gui/ext/units/test.js:14-22` (ctx with `gamedir, tools, tmpRoot, game, runTool`), `gui/ext/prep/test.js:37-42` (ctx with `jobs, cache, modtree, gameview, gameId, exe, curDir`). The real ctx is built in `gui/gui.js:699-707`; copy the field names from there.
```js
// node <scratch>/time-route.js <game dir> <mod dir>   (run from the repo folder: TOOLS is ./tools)
'use strict';
const path = require('path'), { performance } = require('perf_hooks');
process.env.ARSENAL_CACHE = path.join(__dirname, 'store');      // before any require of lib/: own store, see 1.7
const TOOLS = path.resolve('tools'), [game, mod] = process.argv.slice(2);
const cache = require(TOOLS + '/lib/cachestore').open({}), jobs = require(TOOLS + '/gui/joblist').create({ keepMs: 0 });
const ctx = { gamedir: require(TOOLS + '/lib/gamedir'), tools: TOOLS, tmpRoot: path.join(__dirname, 'tmp'), allowLaunch: false,
  cache, cacheSwept: 0, modtree: require(TOOLS + '/lib/modtree'), gameview: require(TOOLS + '/lib/gameview'), jobs,
  job: jobs.add({ kind: 'bg', what: 'bench' }), prepSections: [], session: { token: '', port: 0, remote: false }, pathOk: null, onClose() {},
  game: () => game, curDir: () => game, gohDir: () => null, gameId: () => 'as64', exe: () => 'as64', kind: () => 'as2',
  runTool: async () => { throw new Error('bench: this route starts a child tool; use 1.5'); } };
const R = require(TOOLS + '/gui/ext/units/index').routes, key = 'GET /api/x/units/status';
(async () => {
  for (const pass of ['first', 'second']) {
    const t0 = performance.now(), out = await R[key](new URL('http://x/api/x/units/status?mod=' + encodeURIComponent(mod)), null, ctx);
    const t1 = performance.now(), bytes = Buffer.byteLength(JSON.stringify(out));   // the server also pays for this stringify
    console.log(pass, Math.round(t1 - t0) + ' ms route', Math.round(performance.now() - t1) + ' ms stringify', bytes + ' bytes');
  }
})();
```
- `kind()` values and whether a route wants a `URL` or a string differ per ext (`units/test.js:22` passes a string, `prep/test.js:43` a URL): read the route first.
- In-process timing leaves out the dispatcher, the job record and the socket. For those start the real server on a scratch folder the way `gui/test/test-jobsrv.js:109` does: `gui.start({port: 0, cwd: S, tmpRoot: path.join(S, 'tmp')})`, then `http.get`. `tmpRoot` gives that server its own store under `tmpRoot/cache/store` (`gui/gui.js:565-569`). Close it with `await A.close()`.

### 1.2 Longest event-loop block and call counts (run, measured (this part))
Wrap first, require the code under test after: a module that did `const { readFileSync } = require('fs')` at load keeps the unwrapped function.
```js
const fs = require('fs'), cp = require('child_process'), { performance, monitorEventLoopDelay } = require('perf_hooks');
const N = {};
const wrap = (o, tag, names) => { for (const k of names) { const f = o[k]; if (typeof f !== 'function') continue;
  o[k] = function () { N[tag + k] = (N[tag + k] || 0) + 1; return f.apply(this, arguments); }; } };
wrap(fs, 'fs.', ['readFileSync', 'statSync', 'lstatSync', 'readdirSync', 'existsSync', 'openSync', 'readFile', 'stat', 'lstat', 'readdir']);
wrap(fs.promises, 'fsp.', ['readFile', 'stat', 'lstat', 'readdir']);
wrap(cp, 'cp.', ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']);
const lag = { max: 0, last: performance.now() };
const iv = setInterval(() => { const n = performance.now(); lag.max = Math.max(lag.max, n - lag.last - 10); lag.last = n; }, 10);
const h = monitorEventLoopDelay({ resolution: 10 }); h.enable();
// ... require the code, warm up if wanted, then:
for (const k of Object.keys(N)) delete N[k]; lag.max = 0; lag.last = performance.now(); h.reset();
// ... await the work ...
clearInterval(iv); h.disable();
console.log({ lagMaxMs: Math.round(lag.max), histMaxMs: Math.round(h.max / 1e6), calls: N });
```
- Result on `modtree.scan` of 500 scratch files: 40-57 ms, `fs.readdir` 13, `fs.stat` 500, timer lag 0 ms, histogram max 9-10 ms. The histogram reads about 10 ms when idle (its own resolution): subtract it. Windows timers tick at about 15.6 ms, so a block under 20 ms cannot be told from noise; report blocks from 30 ms up.
- To count unique files against reads (lesson 4 of the brief), collect `arguments[0]` of `readFileSync` into a `Map` and print `reads` and `map.size`. 23,000 reads for 10,688 files is the sign of a missing memo.
- To see who made a call, keep `new Error().stack.split('\n')[2]` per call in a `Map` and print the top 10. Costs time: count first, trace second.
- Registry reads go through `lib/winreg.readValue`; `gui/test/test-jobsrv.js:204-205` counts them by replacing that one function. The memo is 5 s (`lib/gamedir.js:37`); call `gamedir.defaultReg.forget()` before a cold measurement.

### 1.3 Count requests at page start (fake DOM)
`gui/test/test-lazy.js:23-66` runs the whole page script in `gui/test/fakedom.js` (`make()`) with a fake `fetch` that pushes every call to `P.calls` (`test-lazy.js:38-40`) and never answers a page's own request. Ready to use: `node gui/test/test-lazy.js --calls` prints the requests of the start (`:76`). For a count per ext use `P.ext(id)` (`:65`); for refresh counts `P.spy()` / `P.count` (`:67-68`). The fake DOM has no layout and no paint: it counts requests, refresh calls and created elements (`doc.body.all().length`), not milliseconds a browser would take.

### 1.4 CPU profile
Child tool: `node --cpu-prof --cpu-prof-dir=$ARSENAL_TMP/prof tools/<tool>/<tool>.js <args>`, then open the `.cpuprofile` in Chrome DevTools (Performance > Load profile). Server routes run in the server process: profile the 1.1 script instead (`node --cpu-prof <scratch>/time-route.js ...`), so the profile holds one route and no page traffic. A profile shows CPU; time lost in `readFileSync` shows as `(program)`/native read frames, so pair it with the counts of 1.2. Do not profile while a test sweep runs.

### 1.5 Time a child tool
`node -e "const t=Date.now();require('child_process').spawnSync(process.execPath,process.argv.slice(1),{stdio:'ignore'});console.log(Date.now()-t,'ms')" tools/<tool>/<tool>.js <args>`. Node start itself costs 40-80 ms (estimated) per spawn; `check --timing` already prints per-tool seconds (`check/check.js:315-316`).

### 1.6 Old vs new output, byte for byte
1. Before the change: `cp tools/lib/x.js $ARSENAL_TMP/old/x.js` (copy the whole folder when the file requires siblings by relative path).
2. One script requires both (`require('$ARSENAL_TMP/old/x.js')`, `require(TOOLS + '/lib/x.js')`), runs both on the same input, writes `JSON.stringify(out)` to `old.json` / `new.json`.
3. `cmp old.json new.json && echo same`, or `node -e "const c=require('crypto'),f=require('fs');for(const p of process.argv.slice(1))console.log(c.createHash('sha1').update(f.readFileSync(p)).digest('hex'),p)" old.json new.json`.
- Strip what may differ by design first (times, `at`, temp paths, key order of a `Map` turned to an object); say in the report what was stripped.
- Compare on the fixture and on the real mod. The junction loss in lesson 9 did not show on a fixture without a link. `gui/test/test-jobsrv.js:234-252` is the pattern for keeping the old algorithm inside the test as the reference.
- `tools/determ` (`index/dev.md:23`) already runs commands twice and compares bytes; add a command there when the output must stay stable across runs.

### 1.7 Cold and warm, and which store you are measuring
- Three states, report each: **cold** = new process, empty store, fresh `modtree` walk; **warm store** = new process, store filled by an earlier run; **hot** = same process, second call (in-memory memo).
- The store a process opens depends on its file name: a main script named `test*.js`, `*-test.js`, `guardtest.js`, `cachetest.js` or lying under a `test/` or `tests/` folder of `tools/` gets a new scratch store, and so does every child it starts (`lib/cachestore.js:103-118`). A bench under `gui/test/` would therefore always measure an empty store. Set `ARSENAL_CACHE=<absolute scratch dir>` instead: the store is then `<dir>/store`, kept between runs, and not the user's (`lib/cachestore.js:113`, `lib/toolcache.js:18`).
- Cold store: delete that scratch store folder. Never clear the user's real store to get a cold number.
- Windows keeps file data and folder listings in the OS file cache and there is no supported way to empty it without admin tools. So "cold disk" exists only after a reboot or for a mod never read since boot. Say which it was. The second walk of a tree is the comparable one; the brief's "1-1.6 ms per loose-file open even warm" is the floor.
- `modtree.ensure` serves a walk younger than 15 s (`lib/modtree.js:176-179`); `gameview` stamps are kept 5 s (`lib/gameview.js:46`). Two timed calls closer than that measure the memo, not the work. Use `modtree.touch(mod)` or wait.

### 1.8 Ranges and a quiet machine
- Run each timing 3 times at least; report min-max, not a mean ("4-6 s"). One run is a note, not a number.
- Counts (reads, spawns, requests, elements) are exact and repeatable: prefer them, and use milliseconds to size the gain.
- Do not time while an agent batch or `test-all` runs. Tests under load were flaky here (lesson 9), and a sweep takes about 57 min (`run/testall-times.csv`, TOTAL 3422 s, last row). `test-all` holds a lock dir per checkout (`test-all.sh:7`): a bench can refuse to start while that lock exists.
- Schedule: measure before the batch starts or after it ends; in a batch, agents may count and read code, the coordinator times afterwards. Antivirus real-time scan and Steam downloads also move file timings: note them when a number is odd.

## 2. Baseline numbers (all measured (brief), real game + 112k-file / 11 GB mod, unless marked)

| What | Before | After | Notes |
|---|---|---|---|
| Cold open of all pages | 80 s | not re-measured as one number | each module walked the mod itself, 13 s per walk |
| Mod walk | 13 s sync, blocks | 4-6 s async, loop lag under 41 ms | `lib/modtree.js` |
| Game + mods view | 12.4 s blocking stat walk | 0.34 s from the modtree listing | `gameview.withMods` |
| Game view `get` | built per module | 0.45 s shared (0.45-1 s build) | `lib/gameview.js` |
| Registry lookup per `ctx.game()` | 80-230 ms each, up to 93 per request, 254 in a 14-page walk (20.7 s) | 1 per request, 1 per 5 s | `gui/gui.js:688`, `lib/gamedir.js:37` |
| `modScan` inside a loop | 58 x 58 reads, 4-5 s per request | once per request | lesson 3 |
| Units catalogue build | 66-73 s, 23,000 reads / 10,688 files | 25-29 s | per-build byte memo |
| Price session | 22 s, 7,257 reads / 1,349 files | 8 s | |
| Whole-mod check | 92 s, 42,737 reads / 11,353 files | 48 s | |
| Walk with `statSync` per file | 12 s | 1.4 s | `readdirSync(dir, {withFileTypes: true})` |
| Panel elements built at start | 29,215 (68 rebuilds) | 6,119 | fake DOM count |
| `cachestore.stats()` at 5,000 entries | - | 24 ms (index file) | first scan with no index 3.6 s; `evict` 385 ms |
| Page size / script compile | - | 8.3 MB / 235 ms | 5.3 MB is the four languages |
| Build all 29 page DOMs | - | 65-90 ms | fake DOM, after the map viewer fix |
| Get of a 30 MB JSON store value | - | 450-500 ms | mostly `JSON.parse` |
| Server memory, 3 views + listing | - | 232 MB heap, 385 MB RSS | |
| Still blocking | - | `task/r/text/missing` 107 s, `task/r/text/lint` 6.5 s, price open and model build 3-7 s, `docs/where` 1 s, `goh/units` 1 s | open |
| `maps.ents` first call | - | 4-9 s | no Prepare section |
| `modtree.scan`, 500 scratch files | - | 40-57 ms, 13 `readdir` + 500 `stat` | measured (this part), SSD scratch |

Not measured at all: real-browser parse and paint, the built exe's start, GoH pages on a real install, POST/write routes.

## 3. Proposed budgets

What a test can assert: counts, "no sync walk", "no child", "second call reads nothing", "answer equals the reference". What a test cannot assert: milliseconds. Milliseconds go into the bench (section 4) as a warning when a run is over 1.5x the kept run, never as a test failure.

| Target | Budget (assert in a test) | Budget (bench, warn only) | Fixture |
|---|---|---|---|
| Page start | no `/api/x/<ext>/` request of a page never shown (exists: `test-lazy.js`); add: total requests at start <= the count printed today by `--calls` + 0; no path asked twice | script compile under 300 ms | fake DOM, no server |
| Page show | one `refresh` per show, none on focus within the same state | - | fake DOM `P.spy()` |
| Any GET route, store warm | 0 `fs.readdirSync`, 0 `fs.statSync` under the mod, 0 child spawns, 0 registry reads beyond 1 | under 300 ms, block under 50 ms | big-mod fixture (section 5) + filled scratch store |
| Any GET route, store cold | mod walked at most once (count `fs.readdir` <= folders + 1), each file read at most once (`reads == unique`) | block under 200 ms; routes over it are listed by name as known debt | big-mod fixture |
| `ctx.game()` | 1 registry read per request, 0 inside 5 s (exists: `test-jobsrv.js:211-215`) | - | fake Steam folder |
| `modtree.ensure` | concurrent callers share one scan (exists: `lib/test/modtree.test.js:101-107`); no `statSync` | 20k files under 3 s, lag under 50 ms | big-mod fixture |
| `prep` state route | no walk, no build (contract, `gui/README.md` "Prepare sections"): 0 `readdir`, 0 `readFileSync` under the mod | under 50 ms | big-mod fixture |
| `cachestore.stats()` | reads the index, not every meta: `readFileSync` count independent of entry count | 5,000 entries under 100 ms | 5,000 generated entries |
| Catalogue / price / check builds | `reads == unique files` (memo holds) | units 25-29 s, price 8 s, check 48 s on the real mod | real mod, bench only |
| Known blockers (`text/missing`, `text/lint`, model build, price open) | none yet; a test that pins today's behaviour would only block the fix | listed with current seconds so a fix shows | real mod, bench only |

Before adding a count budget: run the count 3 times and confirm it is the same each time; a count that moves by walk order or timing is not a budget.

## 4. Bench tool (proposal, not built)

What exists and what it covers: `check --timing` (per child tool seconds, `check/check.js:315-316`); `run/testall-times.csv` (per-suite seconds, `test-all.sh:5`); `tools/determ` (same bytes twice, `index/dev.md:23`); `tools/usage` (agent tokens, not program speed). None times a GUI route, the event loop or cold vs warm. `tools/INDEX.md` and `tools/index/*.md` list no bench or profile tool.

Place: `tools/perfbench/perfbench.js`, not `gui/test/bench.js`: under `gui/test/` it would get a throwaway store every run (1.7) and could not measure warm.

- **Run line**: `node tools/perfbench/perfbench.js [--game G] [--mod M] [--only id,id] [--runs 3] [--json f] [--keep] [--list]`. No `--mod` = game-only routes. Refuses to start while the `test-all` lock exists unless `--force`.
- **What it runs**: a fixed list in `perfbench/routes.json`: `{id, ext, route, query, needs: 'game'|'mod', kind: 'read'}`. First list: `prep/state`, `units/status`, the units catalogue, price session open, `maps.ents`, `docs/where`, `goh/units`, model list, `ide/tree`, plus the three shared calls `modtree.ensure`, `gameview.get`, `gameview.withMods`. Only GET/read routes; a POST route is allowed only when its code is read and it writes to the store alone.
- **How**: one child process per route and state (fresh process = honest cold). Each child sets `ARSENAL_CACHE` to the bench's scratch store, installs the wrappers of 1.2, builds the ctx of 1.1, runs the route. States: cold (scratch store emptied), warm store (new process, store kept), hot (second call in the same process). `--runs` repeats, min-max kept.
- **Prints**: one row per route: `cold ms (min-max) | warm ms | hot ms | longest block ms | fs reads / unique | readdir | stat | spawns | answer bytes | answer sha1`. Then the differences against the last run: counts that changed (exact), times over 1.5x (warning), sha1 that changed between cold and warm (an error: the cache changed the answer).
- **Kept**: `%LOCALAPPDATA%`-side scratch is wrong for comparison across checkouts; keep the last run as `run/perfbench-last.json` (next to `run/testall-times.csv`, outside git) with node version, release, mod path, mod `all` signature, file count and date. A different mod signature = "not comparable" printed, no diff.
- **Read-only**: writes only under its scratch root (`$ARSENAL_TMP/perfbench` or `--work`) and `run/`. It wraps `fs.writeFileSync`, `appendFileSync`, `mkdirSync`, `renameSync`, `rmSync`, `unlinkSync`, `copyFileSync` and the `fs.promises` twins and throws when the resolved target lies under the game or the mod folder; it also compares the mod's `modtree` `all` signature before and after and fails loudly when it moved. `allowLaunch: false`, `runTool` allowed only for tools on a read-only list.
- **Test**: `perfbench/test/run.sh` runs it on the section 5 fixture with `--runs 1`, checks the table shape, the JSON, the refusal to write into the mod (a made-up route that tries), and that two runs give equal counts.
- **Size**: M. Needs the ctx field list of `gui/gui.js:699-707` kept in one shared helper so the bench and ext tests do not drift.

## 5. Synthetic big-mod fixture (proposal)

`tools/lib/test/bigmod.js`: `make(dir, {files = 20000, seed = 1, links = false, paks = 2}) -> {mod, count, bytes, areas}`.
- Shape, so `modtree.areaOf` (`lib/modtree.js:48`) sorts files into every area: `mod.info`; `resource/set/**` (`.set`, `.inc`, with `{include}` chains so the include memo is exercised, some files included from 20 others); `resource/entity/-vehicle/<class>/<name>/` (`.def`, `.mdl`, small `.ply` stub); `resource/map/<map>/` (`0.mi`, `map.net` stub); `resource/properties/**`; `resource/interface/**`; `resource/script/**`; `localization/<lang>/*.lng`; one or two small real zip `.pak` built with `lib/zipwrite`; a root `1.pat`; `.git/` and `node_modules/` folders that the walk must skip; with `links: true` one junction under `resource/map` (the lesson 9 case; `fs.symlinkSync(target, link, 'junction')` needs no admin right on Windows).
- Files are 20-400 bytes, CRLF, valid SDL, content from a seeded generator (no `Math.random`): same seed = same bytes = same signatures in every run. Deep folders (8 levels) and one folder with 5,000 entries are included, since those are the two shapes that hurt.
- Cost: writing 20,000 small files takes 10-25 s on this machine (estimated from 1-1.6 ms per loose-file open). So: default 2,000 files in normal suites; 20,000 only under `BIGMOD=1` or in the bench; built once per scratch dir and reused when a marker file with seed + count matches. Scratch on `<temp folder>`, never C:.
- Tests that would use it: `lib/test/modtree.test.js` (replaces its hand-made 1,200-file tree), `lib/test/gameview.test.js` (`withMods` from a listing vs the stat walk, same file set), `lib/test/cachestore.test.js` (stamps from a real T), `gui/test/test-jobsrv.js` (`/api/mod` vs the sync reference), `gui/ext/prep/test.js` (state makes no walk), `gui/ext/units/test.js`, `gui/ext/balance/test.js`, `gui/ext/bots/cachetest.js`, `gui/ext/ide/test-cache.js`, `gui/ext/maps/test.js` (count budgets of section 3), `vfs/test/listing.js`.
- It does not replace the real mod: a generated tree has no real include depth, no 30 MB answers and no cp1251 comments. Counts are tested on the fixture, seconds are measured on the real mod.

## 6. What a user can look at when it is slow (job list and Prepare)

1. Footer job button: the newest running job with its seconds or progress; `+N` = more are running (`gui/README.md` JOBS, Page).
2. Open the list: one row per job with name, game, seconds, progress. A request appears there after 600 ms, so anything listed is already slow.
3. Report the row text and its seconds. A row named "<page>: <button>" is one request; a "Prepare: ..." row is a background build.
4. Seconds that stop counting in every row at once, or a list that does not update, mean the one server thread is blocked: report what was clicked just before.
5. A greyed Cancel means the job has no stop function; that is also worth reporting.
6. Prepare page: each section shows ready / none / stale, why (mod, game, release), when it was made and its size. "stale: mod" after no edit means something touches the mod or the walk sees a change: report the section.
7. "Updated" on Prepare after a new release means the old entries were removed: the first open of each page is slow once. Run "all" there first.
8. A page slow every time while its section says ready means the page does not use the store: report page + section.
9. A page with no section on Prepare (`maps.ents`, `bots.guns.*`, `bots.names`, `maps.pic`, `ide.pak`, `models.armor`) is slow on first use by design today.
10. For a report: the job row text and seconds, the Prepare table as shown, the store size and entry count (`GET /api/cache`, `gui/gui.js:725`), mod file count, and whether the mod is on a network drive or contains linked folders.

---

# Part 3. Backlog: server, data and builders
A ranked backlog of what is left on the server side and in the heavy builders. Paths are relative to `tools/`. Every number is marked: **[M brief]** = measured earlier and given in the shared brief, **[E]** = my estimate from reading the code. I measured nothing for this part (a test sweep was running). Order inside each group is gain per risk, best first. Sizes: S = under a day, M = 1-3 days, L = more.

Group A keeps content and function the same. Group B changes what the user sees or when, and needs the owner's decision.

## Found while reading (differs from the brief)

- `bots.guns.game`, `bots.guns.mod`, `bots.names` and `ide.pak` already have a Prepare section: `gui/ext/bots/index.js:70,107` (`PREP_STORE` of section `bots.data`), `gui/ext/ide/routes.js:1125` (`ide.tree`, store `['ide.tree','ide.pak']`). Still without one: `maps.ents`, `maps.pic`, `models.armor`.
- The model list is already built in a child process (`gui/ext/models/sub/find.server.js:72`, `soedit index`). It only runs in process when there is no `ctx.runTool` (line 79). The "model build blocks 3-7 s" in the brief must be another path (the viewer or `listFolder`); find it with a profile before spending time on it.
- The Editor's tree is paged (`gui/ext/ide/routes.js:491-508`, the client always sends `lim`: `ext/ide/ui/core.js:872`, `ui/explorer.js:141`). The unpaged one is the Files page: `gui/ext/files/lib.js:656-660` returns every row in one answer (up to `MAX_TREE` 8000 loose files plus pak entries up to `MAX_PAK_LIST` 50000, line 18).
- Four `vfs.build(` calls on request paths are still outside `gameview` (item A2). One of them never expires.

## A. Safe: same content and function

### A1. `task/r/text/missing` and `task/r/text/lint` in a child process. Size S

- What: both routes run a whole-mod tool inside the server. `missing` calls `loccover.check` in process (`gui/ext/task/recipes/text.recipe.js:67-72`, route line 272); `lint` calls `lnglint.run` in process (line 275). `loccover.check` builds two entity indexes synchronously (`loccover/loccover.js:295,304`). The same file already shows the pattern to use: `ctx.runTool('lng', ...)` at line 281.
- Change: `await ctx.runTool('loccover', 'loccover/loccover.js', [mod, '--game', game, '--exe', exe, '--format', 'json', '-o', tmp, '--no-rc', '-q'])`, read the JSON, run the same row loop (lines 73-83). Same for `lnglint` (`lnglint/lnglint.js:253` has the shared CLI, `lib/cli.js:31-34` gives `--format`, `-o`, `--no-rc`). The Check step of the recipe (lines 392, 395) and the draft seed (line 361) call the same functions: move them too.
- Gain: the server stays answerable for the 107 s and 6.5 s these take **[M brief]**; both become stoppable from the footer (a `req` job with a live child, `gui/gui.js:695`). Total time rises by one process start, about 0.1-0.3 s **[E]**.
- Could change: the CLI reads `.lintrc` unless `--no-rc` is passed (`lib/cli.js:47-49`); the in-process call reads none. Pass `--no-rc`. `-q` drops info rows from the print, not from the JSON: check that `LOC_*` codes used at lines 75-78 are findings, not info.
- Prove: for three mods, `JSON.stringify(rows)` of the old in-process call equals the new route answer.
- Before starting: nothing. Follow-up (separate, M): replace the 30 s age memo `MISS` (line 66-70, a cache keyed on age, lesson 6) with a store entry stamped `game` + `mod:set,entity,properties,text,interface,pak`; needs the list of what loccover reads confirmed first.

### A2. The last `vfs.build(` calls on request paths go through `gameview`. Size S-M

- Where: `gui/ext/task/lib/game.js:75` (kept 1 min, GoH 10 min), `gui/ext/task/recipes/vehicle.recipe.js:49` (kept 2 min), `gui/ext/task/recipes/x-thing.recipe.js:60-62` (kept 2 min, builds twice on `MOD_MODE`), `gui/ext/task/recipes/map.recipe.js:65` (kept until restart: line 63 has no age and no stamp, so an edit is never seen).
- Each is a full synchronous build: 0.45-1 s for the game alone, up to 12.4 s when the list names a big installed mod, because `lib/vfs` then stat-walks it **[M brief]**.
- Change: `mods: []` -> `gameview.get({gameDir, exe})`; a mod list -> `await gameview.withMods({gameDir, exe, list: mods, disableVersionControl})` (`lib/gameview.js:163-175`, option `list` documented at line 17). The four private maps go away.
- Gain: one view shared with every other page instead of up to four more copies (memory, see A9), no blocking walk, and edits are seen by signature instead of by age.
- Could change: `withMods` is async, so the four callers and their callers must await; `map.recipe.js` falls back to `mods: []` when the build throws (line 65): keep that. The as64+ retry in `x-thing` stays as a second `withMods` call.
- Prove: for each recipe, the set of `v.files` keys and `v.mods` from the old call equals the new view, on the game alone and with one mod.
- Before starting: confirm `withMods` passes `disableVersionControl` (it does: `PASS`, `lib/gameview.js:125`).

### A3. Listen first, load the ext routes after. Size M

- Where: `gui/gui.js:39` requires every ext at module load (24 index files, `gui/ext/index.js:17-42`, each pulls its server code) and `gui/gui.js:189` builds the page. Only then `start()` runs and listens (line 828); the browser opens after `start` resolves (line 900). In the exe the path is the same (`dist/sea-main.js:91` turns no arguments into `gui --open`).
- Change: move both requires behind one `ready` promise started with `setImmediate` after `server.listen`. `handle` (line 642) awaits `ready` before the route lookup (line 678) and before `sendPage` (line 715). Open the browser from the `listening` event (line 829), not after `ready`. `routeTable()`, `SCREEN_IDS`, `rebuildPage` (lines 41, 203, 907) are used synchronously by tests and `--dev`: make them force the load.
- Gain: the browser window starts about 1 s earlier **[M brief]**; the page arrives at the same moment as today, the browser's own start overlaps with the load.
- Could change: an ext that throws at require (line 39, duplicate route) today stops the start with an error on the console. After the change the port is open first; keep the same exit by rejecting `ready` and exiting. No content change.
- Prove: `routeTable()` equal before and after; first `GET /` bytes equal; the remote test that walks every route still passes.
- Before starting: check `contract.js` and `settings.js` do not need the ext list at their own load (ext `commands` are merged into the contract, `gui/ext/index.js:5`).

### A4. Send stored answers as bytes. Size M

- What the code does now: `S.get` always parses a JSON entry (`lib/cachestore.js:250`), the route wraps the object, `send` stringifies it again (`gui/gui.js:242`). A 30 MB value costs 450-500 ms to get **[M brief]**, then a stringify of similar cost **[E]**.
- Routes whose answer is the stored value unchanged or inside a small fixed envelope (verified by reading): map list `{state, cached, at, maps}` (`gui/ext/maps/index.js:314`), balance table (adds `cols`, `edit`: `gui/ext/balance/server.js:54`), price card (adds `undo`: `gui/ext/balance/prices.js:106`), GoH unit list (`gui/ext/goh/index.js:65`), map picture (`maps/index.js:359`, an SVG string). Not candidates: units pages (filtered from `MEM`, `gui/ext/units/server.js:127`), model search (searches rows), tree pages (slices).
- Change, three parts: (1) `cachestore.getRaw(section, ver, parts, stamps) -> {buf, at, bytes}` = `get` without line 250; (2) `send` takes a Buffer and sets `content-length` (line 241-245), and the dispatcher accepts `{__json: Buffer}` next to `{__raw}` (line 713); (3) each route above stores the envelope's big member as its own value and answers with `Buffer.concat([head, buf, tail])`.
- Cheaper first step with most of the gain: a bytes memo beside the object memo. `balance/server.js` `MEMO` (line 44-50) and `maps/index.js` `LMEM` (line 296-301) already hold the object while the stamps stand; keep `Buffer.from(JSON.stringify(answer))` next to it and send that. No store change. Size S.
- Gain: per call, one parse and one stringify of the whole value **[E: 0.2-1 s on the 10-30 MB answers, nothing on small ones]**.
- Could change: nothing in content if the concat is byte-equal to `JSON.stringify` of today's object. Key order must match.
- Prove: for each route, the new body equals `JSON.stringify(old answer)` byte for byte.
- Before starting: measure which of the five answers is over 1 MB on the big mod; do only those.

### A5. gzip for remote sockets. Size S

- Where: `handle` knows a phone request (`rem`, `gui/gui.js:642`). `send` (241) and `sendPage` (219) write plain bytes.
- Change: when `rem` and the request accepts gzip and the body is over 1 KB: `zlib.gzip` (the async one, never `gzipSync`: 8 MB would hold the loop about 150-250 ms **[E]**). Keep the gzipped page in `PAGE_BYTES` per variant (lines 211-218). Leave out `/api/live` (line 721) and the `/api/run` stream (line 803).
- Gain: page 8.28 MB -> 2.28 MB, tree page 3.67 MB -> 258 KB on the LAN **[M brief]**. Nothing for the PC page (loopback is not compressed, on purpose).
- Could change: nothing. Prove: the phone test reads the same body after decoding; `content-length` matches.
- Before starting: nothing.

### A6. Async entity index build with read-ahead. Size M-L

- Where the time goes: `entityindex/index.js:442-463` parses each `.def` and stuff file in sorted order; every read is synchronous (`fs.readFileSync` line 136, `vfs.readRec` line 135). `makeSig` (154-170) does one `statSync` per loose key. The byte memo (lines 130-138, 396) only removes repeats. Sync reads of 10.7k loose files take 9-11 s; 32 parallel `fs.promises.readFile` take 1.1-2.4 s **[M brief]**.
- Change: add `buildAsync(o)` beside `build` (the CLI keeps `build`).
  1. Signatures without stat: when the source folder has a modtree scan of this process (`modtree.fresh`), fill `makeSig`'s memo from `T.files` (`'l' + size + ':' + Math.round(mtimeMs)`, the same text as line 160). Game loose files keep the stat.
  2. Decide the work list first: run the `keep()` test (line 439) over the keys without parsing, giving the keys that must be parsed.
  3. Read ahead: a window of 32 `fs.promises.readFile` over the loose files of that list, into a map `src.ahead`; `raw()` (line 136) takes and deletes from it, else reads as today. Cap the window at 64 MB so memory stays flat.
  4. Includes: after the first pass the include set is known from the old record's `deps` (line 440); prefetch those too into `src.bytes`. A file not prefetched is read synchronously as today, so a wrong guess costs time, never content.
  5. Give the loop a turn every 200 keys, so an in-process caller does not freeze.
- Callers: `statsheet/statsheet.js:42` (the units catalogue child, `gui/ext/units/server.js:152`), `loccover/loccover.js:295`, `refcheck/refcheck.js:182`, `soedit/modelindex.js:106-149` (reads through `stage.openSource`; the same read-ahead applies to its three loops at 114, 126, 132; `buildAsync` at 154 already awaits the modtree walk).
- Gain: units catalogue 25 s -> 15 s, model list 7.5 s -> 3.5 s **[E brief]**. Pak entries gain nothing (already one open handle, line 94).
- Could change: nothing if the record set is equal. Risk is in step 1: `Math.round(st.mtimeMs)` from the walk and from a later stat must agree; they are the same number unless the file changed in between, and then the next build parses it again.
- Prove: `JSON.stringify(pack(data))` of `build` and `buildAsync` equal for the game, the game + big mod, and a folder-only index; run each twice (cold, warm).
- Before starting: A6 only pays in child processes and CLI runs; decide whether `statsheet --units-json` switches to it by default.

### A7. Worker threads. Size L, three separate items

Shared piece first: `lib/workpool.js`, N = `min(4, cores - 1)` workers, `run(file, fnName, arg) -> Promise`, transfer of ArrayBuffers, a worker that throws is replaced. In the exe a worker needs its file from the embedded tree: check `new Worker` with the `dist/sea-main.js:60` loader before anything else. That check is the precondition for all three.

1. Parse pool for the builders. About 11 s of CPU is left in the units build and 44 s in the whole-mod check **[M brief]**. Unit of work: one key -> `{rec, deps}` (`entityindex/index.js:447-450, 456-459`). The worker needs its own source: it cannot share the vfs object, so give it the listing (`T.files`) and build the view once per worker (0.34 s each **[M brief]**). Only worth it when more than about 2,000 files need a parse **[E]**; below that the per-worker view build eats the gain. Sameness: records equal to the single-thread build, order restored by key sort (line 442).
2. Price session in a worker. `pricecalc.open` + `model` + `result` run on the loop inside a `setImmediate` (`gui/ext/balance/prices.js:56-63`), 8 s after the read memo **[M brief]**. The session object is kept and used by later edit routes (`SESS`, line 53), so the worker must own the sessions: one long-lived worker, messages `{op: 'open'|'calc'|'edit'|'drop', key, args}`, answers are the `slim` objects (line 86-93), which already go through JSON (line 103). Risk: every route that touches `v.s` directly must move behind a message; list them first.
3. Game view build in a worker: not recommended. `vfs.build` returns Maps with open pak handles (`lib/gameview.js:109`); copying 232 MB of view between threads costs more than the 0.45-1 s it saves **[E]**. Keep it on the loop; A2 and the Prepare page already make it rare.

### A8. Store housekeeping: `evict` and the first scan. Size S

- `evict` stats every entry's `use` file (`lib/cachestore.js:414`, called from `put` at 315): 385 ms at 5,000 entries **[M brief]**. Sound shortcut: an entry's last use is never older than its `at` (line 413). Walk the rows in ascending `at`, stat `use` one by one, and stop as soon as the next row's `at` is newer than the oldest last-use found so far; that one is the true oldest. Removes the same entries as today. Runs only when the store passes 2 GB (line 25), so the gain is rare.
- First scan with no `index.json`: reads every `meta.json` (lines 403-411), 3.6 s at 5,000 **[M brief]**. It runs on the first `put` of a process (`_est === null`, line 313) or at `sweep` on start (`gui/gui.js:570`). Change: when the index is missing, build it in slices of 200 from a timer after start and let `put` skip the size check until it is done.
- Could change: the cap may be passed by the bytes of the puts made during those few seconds. Prove: same evicted keys in the store test; total after the slices equals a full scan.

### A9. Memory held by kept views. Size M

- Now: up to 3 game+mod views (`MEMO_MAX`, `lib/gameview.js:124`) plus the game view plus `T.files` per mod = 232 MB heap, 385 MB RSS **[M brief]**. On top, outside the count: the four private views of A2, `MEM` with two catalogues (`gui/ext/units/server.js:127`), the `_loose` maps (4 mods, `gui/ext/files/modfiles.js:198-209`), price sessions (`prices.js` `SESS`).
- Safe steps: (1) A2 removes up to four views. (2) `_loose` builds a second map of every `resource/` path of the mod (line 207); derive it on demand from `T.files` by binary search instead (the rows are sorted, `lib/modtree.js:9`). (3) Drop the two oldest `MEMO` views after 10 minutes without a hit; they rebuild in 0.34 s from the listing **[M brief]**. (4) `T.files` rows are `[rel, size, mtime]` arrays, 112k of them: keep as is, every page reads them.
- Could change: step 3 adds one 0.34 s rebuild after a long idle. Nothing else.
- Before starting: take one heap snapshot to see which of these is largest; I did not measure.

### A10. Prepare sections for entries without one. Size S each

- `maps.ents` (`gui/ext/maps/index.js:676`, first call 4-9 s **[M brief]**): `needs: ['game.view', 'mod.tree']`, `areas: ['entity', 'pak', 'other']` (the stamps at line 672), `run` = the route's own `wrap`. Straightforward.
- `maps.pic` (line 359) is one entry per map and `models.armor` (`gui/ext/models/sub/armor.server.js:225`) one per target and argument set: a section would have to pick which ones. Leave them out unless the owner names a set (for example "pictures of the mod's own maps").

### A11. Small loops left on request paths. Size S

- `GET /api/installed`: two `existsSync` per mod folder (`gui/gui.js:397`). `GET /api/mods`: one `readModInfo` per subfolder, up to 2000 (`gui/gui.js:415`). Both synchronous; fine for 50 mods, about 0.1-0.3 s for a Workshop folder of 500 **[E]**. Make `apiMods` async with 32 reads at a time, as `apiMod` already is (lines 420-441).
- `ide` copies: `readdirSync` of the mods and Workshop roots, then a case-insensitive resolve and a `mod.info` read per folder (`gui/ext/ide/routes.js:549-558`). Same remedy.
- `task/external.js:105`: `spawnSync('reg', ...)` up to several times per program lookup (lines 165-173), behind an age memo (line 182). It is the pattern of lesson 2; switch to `execFile` with a per-request memo if a profile shows it.
- Units catalogue hand-over: the child writes a JSON file, the server parses it (`gui/ext/units/server.js:157`), the store stringifies it again (`lib/cachestore.js:286`). With A4's raw put, hand the file's bytes to the store and parse once.

## B. Changes what the user sees or when (owner decides)

### B1. Paint from the last known signature. Size M

- Today: every list route awaits `modtree.ensure` (4-6 s on the big mod when the last walk is older than 15 s, `lib/modtree.js:176-179`). Two places already answer from an older walk inside one process: `units modTree(..., fast)` (`gui/ext/units/server.js:103-114`) and `modfiles.loose` (`gui/ext/files/modfiles.js:199-203`). Neither tells the page, and neither uses the walk kept in the store across a restart (`modtree.last`, `lib/modtree.js:202-207`; `loose` refuses it on purpose, line 203).
- Design, server: one helper `quick(ctx, mod) -> {T, checking}`: `modtree.fresh(mod, 15000)` when there is one, else `modtree.last(mod)` with `ensure` started in the background and `checking: true`. Routes that take it, on `?last=1` only: units list/search/stats (`units/server.js:225-227`), balance table (`balance/server.js:41`), price card (`balance/prices.js:99`), model search (`models/sub/find.server.js:90`), Editor tree (`files/modfiles.js:132`), Files tree (`files/lib.js:658`), map entities (`maps/index.js:670-676`).
- Rule that keeps it sound: with an old `T` a route may only read the store (`S.get` with the old stamps). It must never build: a build reads the disk as it is now and `wrap` would file that under the old signature. A miss falls through to the normal awaited path.
- Answer flag: top-level `asOf: {at: T.at, all: T.all, checking: true}`; absent on a fresh answer.
- Page: draws the rows and a "checking for changes" mark, then asks once `GET /api/x/prep/modwait?mod=&all=<sig>` (new, long poll on the running `ensure`) -> `{all, moved: [areas]}`. If an area the page depends on moved (the `areas` of its Prepare section), it asks the route again without `last=1` and redraws in place, keeping selection and scroll (lesson 7). Otherwise it removes the mark. One wait per mod, shared in `page.js`.
- Gain: answers in 70-500 ms instead of 4-5 s **[M brief]** on the first show after a restart and after every 15 s pause.
- What would differ for the user: for up to 4-6 s a list can show a file that was deleted or renamed outside the GUI, or miss a new one, with the mark visible. A click on such a row in that window opens a 404 or an older text. Proposal: write buttons (Save, Apply, Delete) stay disabled while the mark shows; reads stay allowed.
- Prove: with no outside change, the `last=1` answer minus `asOf` equals the normal answer. With a change, the second answer equals the normal answer.
- Before starting: owner accepts the window and the disabled-buttons rule; A4's bytes memo is independent.

### B2. `fs.watch` as a "nothing changed" hint. Size M

- Goal: `ensure` may hand back the last walk beyond 15 s when a recursive watcher saw nothing. The watcher never says what changed; it only allows skipping.
- Rules that make it sound against the measured failure modes **[M brief]**:
  1. Any doubt means dirty. Dirty = the next `ensure` walks, exactly as today.
  2. A scan raises 106-499 events itself, so raw events cannot mean "changed". Each event path is checked, deduplicated, 32 at a time: a file whose size and mtime equal its row in `T.files` is ignored; a file with no row, or a different one, is dirty; a folder is dirty when its mtime is newer than the start of the walk that made `T` (a walk does not move folder mtimes; a create, delete or rename inside does); a path that no longer exists is dirty when it or anything under it has a row.
  3. An event with a null name is dirty (20,000 creates gave 2 events, one null).
  4. Renaming the root gives no event: every `ensure` does one `stat` of the root and compares `ino` and `birthtimeMs` with those taken when the watcher started. Different or missing: close the watcher, walk.
  5. The watcher must have started before the walk that made `T` started; else events between the two are lost. A watcher `error` event is dirty and ends the hint for that folder.
  6. Not used at all when the root is a UNC path, a mapped network drive, a link itself, or when `T.left` lists a link or junction (`lib/modtree.js:84`): those targets are not covered.
  7. `modtree.touch` (line 213) still forces a walk after every write of the GUI.
- Background verify walk: a full `scan` at most every 5 minutes while any page asked for the mod in that time, and at once when a hint has been trusted for 10 minutes. If it finds another `all` while the hint said clean, log it and switch the hint off for that folder until restart. So a missed event costs at most one interval, and only once.
- Gain: no 4-6 s walk on a page switch after a pause **[M brief for the walk time]**; one walk per 5 minutes in the background instead.
- What would differ for the user: an outside edit that the watcher misses shows up to 5 minutes late instead of within 15 s. Every edit the watcher reports shows as fast as today.
- Prove: a test per failure mode above (scan noise stays clean; mass create is dirty; root rename is dirty; junction mod never uses the hint), plus the verify walk catching a deliberately dropped event.
- Before starting: a way to tell a local drive from a network one without a child process per call (one `Get-CimInstance Win32_LogicalDisk` at start, cached, about 0.3-0.8 s once **[E]**); the owner's choice of the verify interval.

### B3. Files page tree in pages. Size S-M

- `GET files/tree` sends every row at once (`gui/ext/files/lib.js:656-660`). The Editor's paged route (`gui/ext/ide/routes.js:491-508`) reads the same store entry. Point the Files page at the paged route.
- Differs for the user: the list fills in steps instead of appearing whole; a filter typed before the last page arrives must be applied again per page.

## Order to do them

1. A1, A2 (S, remove the last long freezes and a never-refreshed view).
2. A3, A5, A4 bytes memo (S-M, start and transfer).
3. A6, then A7.1 only if a profile still shows parse time on top.
4. B1 after the owner's answer; B2 only if B1 is not enough.
5. A8, A9, A10, A11 as fill-in work.

---

# Part 4. Backlog: the page, the browser and program start
untested on 2026-11-21, nothing edited. Paths are relative to `tools/`. Numbers: **[M-me]** = measured by this part's author in-process (node from source, warm file cache, while the test sweep ran); **[M-co]** = measured earlier, quoted from the shared brief; **[E]** = estimated. Nothing here has been measured in a real browser or in the built exe.

Facts the items rest on:
- Page = 8,290,177 bytes / 6,850,762 chars. `LANGS` = 5.32 MB of it: en 1.06 MB, ru 1.60, uk 1.58, zh 1.07; 15,373 keys per language [M-me]. The core files `gui/lang/*.json` are only 280 KB; the rest comes from the exts (task 1.48 MB over four languages, bots 0.93, mapviz 0.54, models 0.46, ide 0.29, missions 0.26) [M-me].
- Module load before `start()`: `contract` (pulls `./ext`) 729 ms, `./page` 123 ms, everything else 5 ms; 857 ms total [M-me].
- Requests at start, fake DOM, mod known, first page Prepare (`node gui/test/test-lazy.js --calls`) [M-me]: `GET /api/health`, `/api/commands`, `/api/settings`, `POST /api/settings`, `GET /api/game`, `/api/x/task/catalogue`, `/api/x/task/drafts`, `/api/mod`, `/api/x/guides/status`, `/api/x/pro/tools`, `/api/ls`, `/api/x/prep/state`, `/api/jobs`, `POST /api/settings`. 14 requests, 4 of them before anything is built.

## Ranked backlog (gain per risk)

| # | Item | Gain | Risk | Size | Group |
|---|---|---|---|---|---|
| 1 | Measure in a real browser first (section 6) | decides the order of 4, 7, 8 | none | S | safe |
| 2 | Guides and Pro stop asking while they are built | 2 requests fewer at every start | none | S | safe |
| 3 | One pause rule for the ten job polls | no requests from hidden pages or a hidden window | low | S-M | safe |
| 4 | Start data in one request (`/api/boot`), commands in the page | 3-4 round trips fewer before the first paint; 40-230 ms [E] | low | S-M | safe |
| 5 | Model viewer: window listeners removed on release | no listener growth per opened model | low | S | safe |
| 6 | Logs and GoH pages skip the re-ask when nothing changed | 1 request and 1 redraw fewer per page show | low | S | safe |
| 7 | English + chosen language only | page 8.29 -> 5.1-5.7 MB, compile 235 -> about 150 ms [E from M-co] | medium | M | changes |
| 8 | Open the browser at `listening`, load exts while it starts | up to 0.85 s of the wait overlaps the browser start [E] | low-medium | S-M | changes when |
| 9 | Exe: asset memo, sweep after listen, code cache trial | unknown until measured | low | S each | safe |
| 10 | Task row reads its catalogue at first use | 2 requests fewer at start | medium | S | changes when |
| 11 | Build pages at first show (staged: the heaviest five) | part of 65-90 ms [M-co, fake DOM]; real value unknown | medium-high | M-L | changes when |

Safe (same content and function): 1-6 and 9. Changes what the user sees or when: 7 (a reopened mission in another language shows the window language for one request), 8 (URL line and browser before the exts load; a broken ext shows as a browser connection error), 10 (the task row fills a moment later), 11 (a late page is built at its first show; Arrange shows its blocks only after that).

Items 7 and 11 should not start before item 1 gives real numbers: both trade risk for parse and build time that only a browser can price.

## 1. Languages: English + the chosen one

### Every reader of `LANGS` in `gui/**`
Client code (runs in the page):
- `gui/page.js:334` the table; `:337` `detectLang` tests `LANGS[c]`; `:338` start choice (cookie, then localStorage, then detect) tests `LANGS[LANG]`; `:339` `setLang` tests `LANGS[c]`; `:341` `tx` reads `LANGS[LANG]` then `LANGS.en`; `:355` the language box lists `Object.keys(LANGS)` and each `['lang.name']`; `:530` and `:639` test whether a key exists in `LANGS[LANG]` or `LANGS.en`.
- `gui/ext/bots/script.js:54` (`has(k)`: current + en) and `:105` (`Object.keys(LANGS.en)` for `bots.kind.*`).
- `gui/ext/goh/script.js:47` and `:142` (current + en).
- `gui/ext/missions/spcard.js:69` `hasL(l)` and `:73` `T(k,p)`: the only reader of a language that is neither the current one nor English. `f` comes from `TF()` (`:70`): `FL`, the language a reopened mission was made in, or `en` for a Chinese window. When `hasL(f)` is false it already falls back to `tx` (`:73`).

Server code with its own constant of the same name (not the page table, no change needed): `gui/ext/prep/collect.js:16,42`, `gui/ext/models/server.js:12,62`, `gui/ext/help/routes.js:13,55`.

Tests: `gui/test/test-lang.js:131` (the page text must contain the three non-English `"lang.name"` strings), `:134` (one fetched page run under four cookies), `:163` (box lists four names), `:200-218` (first-visit detection, bad cookie, localStorage choice); `gui/test/test-header.js:35` (cookie); `gui/test/test-remote.js:395` and `gui/test/test-jobsrv.js:230` (the served page must equal `require('../page')`, with or without the `AS2CFG` prefix); `gui/ext/goh/test.js:265` and `gui/ext/missions/test.js:251` (pass their own `LANGS`); `gui/ext/models/sub/doc.test.js:104` and `gui/ext/ide/test-shell2.js:10` (local names, unaffected). Every fake-DOM test takes the script out of the page with one regex (`gui/test/test-lazy.js:55`).

### Plan A (recommended): the client still chooses, the language arrives as its own script
1. `page.js` exports the page with `var LANGS={en:{...}}` and one small new table, `LANGNAMES={en:'English',ru:..,uk:..,zh:..}` (each language's `lang.name`). Lines `:337`, `:338`, `:339`, `:355` test and list `LANGNAMES` instead of `LANGS`.
2. Right after the choice at `:338`, when `LANG!=='en'`, the page loads `GET /api/lang.js?c=<LANG>&v=<release>`: a script that runs `LANGS.<c>={...}`. It must be in place before the first `tx` call. Two ways: (a) split the inline script in two and let the first one `document.write` a `<script src>` (parser-blocking, loopback only); (b) keep one script and put the whole start (`page.js:2604`) behind a promise that fetches the table. (b) is cleaner and testable in the fake DOM: `Promise.all([api health, commands, settings, langLoad()])`. `tx` is called before that point only by code that runs at script top level; check with a `LANGS[LANG]` guard in `tx` that falls back to English, and a test that fails when it is hit.
3. New core route `GET /api/lang.js` in `gui/gui.js` beside `:715`, added to `CORE_ROUTES` (`:904`) and to `remote.ALLOW` (phones need it). Bytes kept per language like `pageBytes` (`gui/gui.js:212`). `cache-control: no-store` as the page has today, or `max-age` keyed by the `v=` release parameter.
4. `spcard.js:73`: when `TF()` names a language that is not loaded, call the same `langLoad(f)` and redraw the card when it lands. Until then it shows the window language, which is what it does today when `hasL` is false.
5. Tests: the fake-DOM loaders answer `/api/lang.js` from `loadLangs()`; `test-lang.js:131` checks `LANGNAMES` and the route instead of four tables in the page text. `test-remote.js:395` and `test-jobsrv.js:230` stay true because the page stays one string with no per-language variant.

Why A is safer than choosing on the server: the choice stays where it is now (`page.js:335-338`: cookie, localStorage, browser languages). A server choice from the `as2lang` cookie and `Accept-Language` can disagree with the client in three cases the tests cover: no cookie but a localStorage choice (`test-lang.js:215`), a bad cookie (`:218`), cookies blocked. Each needs a reload-once fallback, and the page would then exist in up to 4 languages x 3 `AS2CFG` variants (`gui/gui.js:716-717`), each a 4-5.6 MB Buffer.

Plan B (server sends en + chosen in the page): smaller client change (no async start), but needs the variants, the reload fallback and a rewrite of `test-lang.js:134`. Take B only if measurement shows the extra request of plan A costs more than it saves.

- Gain: page 8.29 MB -> 4.04 MB + one language of 1.07-1.60 MB [M-me sizes]; compile about 235 -> 115-150 ms [E from M-co]; server heap and the first `Buffer.from` shrink by the same share.
- What the user could notice: nothing on a normal start. Switching language still reloads (`page.js:339-340`). A reopened mission made in another language shows the window language for one request (item 4).
- Before starting: item 1 numbers for parse and compile; decide (a) or (b).
- Proof of sameness: for each language, build the old page and the new page + its language script, evaluate both `LANGS` objects and compare `LANGS.en` and `LANGS[c]` key by key (15,373 keys each); run `gui/test/run.sh` and every ext `test.js`.

A further step with the same machinery, not designed here: per-ext language scripts loaded with the page they belong to (task alone is 297 KB of English). It depends on section 2.

## 2. Building pages at first show

Today `buildUi` (`gui/page.js:2575-2588`) creates every section, runs every builder (`:2577` `S.screens[id]=BUILD[id](sec)`, then `blkInitRoot(sec)`), inits Mods (`:2578`), applies the block layout to every root (`:2579` `blkAllRoots(blkApply)`), then shows one page. `init()` and `refresh()` are already lazy (`:1650`, `:2450`).

### Cross-page dependencies found
Calls into another page's screen object (all guarded by an existence test, all after `show(...)` of that page except where noted):
- `S.screens.models.pick`: `gui/ext/units/client.js:169`, `gui/ext/view/kinds/model.client.js:19,29`, `gui/ext/models/sub/file.client.js:57,136,302`, `gui/ext/mapviz/sub/card.client.js:122` (tests `S.screens.models` to decide whether to draw the button, before any show).
- `S.screens.maps.pick`: `gui/ext/view/kinds/map.client.js:48` (decides whether the action exists), `:57`.
- `S.screens.mapviz`: `gui/ext/maps/client.js:135`.
- `S.screens.docs.go/.limit`: `gui/page.js:2488` (tested before `show('docs')`).
- `S.screens.mods`: `gui/page.js:1564`, `:2411`, `:2448`, `:2603`; `S.screens.settings.fill`: `:2427`.
- `S.screens[page]` existence as "is this page present": `gui/ext/bots/script.js:567`.
Globals a builder sets for other pages: `window.BOTS_UI`/`BOTS_PARTS` (`gui/ext/bots/script.js:574`; `unitai/script.js:5` and `mapai/script.js:5` test it while being built, so they depend on script order, not on the Bots page being built), `window.as2Help` (set inside the Help builder, `gui/ext/help/script.js:190`: other pages call it without a show first), `window.IDE` (`gui/ext/ide/ui/core.js:14`, script level), `window.TASK`, `window.VIEW` (script level), `window.MAPVIZ_PICK` (`gui/ext/mapviz/sub/game.client.js:248`).
Shell code that walks every section: `blkAllRoots` (`gui/page.js:1046`) used at `:1150`, `:1234` (`blkReapply`), `:1263` (Arrange on/off), `:2579`; `show0` hides sections by `NAMES` (`:2443`); `refreshAll` (`:1649`); the key handler (`:2599`, `:2602`); Ctrl+K `clickIn` (`:2453`, after a show). `S.sec[id]` is also the "does this page exist" test in `gui/ext/help/script.js:22`, `task/client.js:724,741`, `maps/client.js:113`, `view/client.js:57`, `mapviz/sub/card.client.js:118`, `models/sub/armor.client.js:253`, `ide/ui/explorer.js:833`, `bots/script.js:159`.
Requests made while building: `gui/ext/guides/script.js:279`, `gui/ext/pro/script.js:120` (the `KNOWN` list in `gui/test/test-lazy.js:86`).
Tests that need a page built without showing it: `gui/test/test-lazy.js:83` (`S.screens[id]` for ten ids), `:90` and `:143` (stale marks over `Object.keys(S.screens)`), `:150-155` (`eager`), `:161` (hidden Bots pages drew no card); `gui/test/blockcheck.js`, `test-blocks.js`, `test-jumps.js` read `S.sec`/`data-blkroot`. Ext tests call `EXT_SCREENS.<id>(root)` directly and are unaffected.

### Safe staged version
1. Keep creating all sections at start (`S.sec[id]` stays the existence test, `show0` and Arrange keep working on empty roots).
2. Add `scrBuild(id)`: if `S.screens[id]` is a stub, run `BUILD[id](S.sec[id])`, `blkInitRoot`, `blkApply`, copy the result over the stub. Call it first in `show0` (before `:2449`) and from a stub's `pick`/`go`/`limit`/`view`/`keys`.
3. Stage it: only pages in a list `LATE` get a stub. Start with pages nobody calls into and that set no globals inside the builder: `bots`, `unitai`, `mapai`, `doctrine`, `share`, `files`, `art`, `balance`, `modes`. Then `ide` and `mapviz` (largest scripts: 391 KB and 497 KB [M-me]) after checking that their script-level globals (`window.IDE`, `MAPVIZ_PICK`) do not need the built page. Leave `mods`, `settings`, `help` (`as2Help`), `models`, `maps`, `docs`, `prep` built at start.
4. The stub must carry `refresh` (so `refreshAll` marks it stale, `:1649`) and must make `S.screens.x && S.screens.x.pick` true where the built page would.
- Gain: unknown in a browser. Fake DOM: all 29 builders 65-90 ms [M-co]. Measure per-page build with the marks of section 6 before choosing the `LATE` list; if no page costs more than about 10 ms in the browser, leave this.
- What differs for the user: the first show of a late page pays its build then (a few ms each [E]); Arrange mode shows no blocks for a page not yet shown until it is shown (already true for pages that draw at first refresh, such as Share, `gui/ext/share/script.js:359`).
- Risk: a missed cross-call silently does nothing (all are guarded by `&&`), which is a function loss without an error. Proof: a test that, for each `LATE` page, starts with and without the stub, shows the page, and compares the section's serialized DOM and the request list; plus `test-lazy.js`, `test-blocks.js`, `test-jumps.js`, `blockcheck.js`.

## 3. Remaining client patterns

Checked and already right (no action): Prepare (`gui/ext/prep/script.js:83` in-flight flag), Balance (`balance/client.js:323-326`, stamp in `prices.client.js:44`), Logs ticks (`logs/script.js:168` `tkBusy`), Maps/Missions/Units/Modes mod-and-game guards (`maps/client.js:151,278`, `missions/client.js:90,122,251`, `units/client.js:46-47`, `modes/client.js:105`), IDE inbox (`ide/ui/core.js:1395`), text filters with a frame or a timer (`balance/client.js:117`, `files/script.js:110`, `ide/ui/explorer.js:690`, `models/client.js:114`, `units/client.js:143`, `mapviz/sub/list.client.js:26`, `objects.client.js:171`), row caps (`balance/client.js:148`, `files/script.js:88`, `ide/ui/panels.js:14`, `maps/client.js:69`, `mapviz/sub/objects.client.js:160`, `models/client.js:66`).

Hits:

| Where | Pattern | Fix |
|---|---|---|
| `gui/ext/logs/script.js:178` -> `:68` | `focus` calls `loadFind()` on every show with no guard: one `/api/x/logs/find` and a full redraw of the result box each time the page is shown | keep the last answer with the game and mod it was for; re-ask only when they differ or the user presses the button |
| `gui/ext/goh/script.js:200` | `refresh` asks `/api/x/goh/status` on every show and rebuilds the top box | same: key on game folder, GoH folder, mod |
| `gui/ext/guides/script.js:279` | request while the page is built | delete the line; `out.focus` (`:278`) already loads when `G.st` is empty |
| `gui/ext/pro/script.js:120` | request while the page is built | move behind a `loaded` flag run from `focus` (`:288`) |
| `gui/ext/bots/parts/botmatch/client.js:156`, `:217` | 3 s polls with no page or hidden test | shared pause rule below |
| `gui/ext/bots/parts/mission/client.js:94`, `bots/parts/recipes/client.js:124` | 2 s / 3 s polls, bounded by a try count only | same |
| `gui/ext/guides/script.js:268` | 1 s poll while an update runs | same |
| `gui/ext/mapviz/sub/export.client.js:111-112` | 500 ms poll while a write runs | same; 500 ms -> 1 s when not on screen |
| `gui/ext/task/client.js:390` | 1.5 s poll while the picker's list is built | same |
| `gui/ext/maps/client.js:97`, `gui/ext/missions/client.js:85` | 1.5 s poll while the map list is scanned | same |
| `gui/ext/models/client.js:133` | 2 s poll for up to 2 minutes | same |
| `gui/ext/ide/ui/panels.js:282-283` | 5 s log timer tests the window and the panel tab but not `S.cur==='ide'` | add the page test |
| `gui/ext/models/sub/viewer.client.js:695`, `:703` | `window` `mousemove`/`mouseup` added for every `viewer()` (callers `models/client.js:224`, `sub/anim.client.js:124`, `sub/vol.client.js:71`); the file has no `removeEventListener`; `release` (`:435`) does not drop them | keep the two functions on `live` and remove them in `release`; or one shared pair that dispatches to the viewer being dragged |
| `gui/ext/mapviz/sub/shell.client.js:601` | `window` resize runs `fitTop()` + `redraw()` whatever page is shown | return when `S.cur!=='mapviz'`; mark dirty and redraw at the next show |
| `gui/ext/models/sub/file.client.js:73` | 60 s autosave timer never stops once started | confirm `autosave` returns at once when nothing is dirty; stop it when the document closes |
| `gui/ext/ide/ui/kit.js:241`, `gui/ext/task/client.js:199`, `gui/ext/models/sub/shot.client.js:182` | redraw or search on every keystroke with no frame or timer | small lists today; move to one draw per frame if section 6 shows input delay over 16 ms |

Shared pause rule (one helper in `gui/page.js` beside `pageHid`, `:617`): `pollLater(pageId, fn, ms)` runs `fn` after `ms` only when the window is visible and `S.cur===pageId`; otherwise it parks `fn` and runs it once on `visibilitychange` (`:619`) or at the next `show0` of that page (`:2450`). The job list already does this for itself (`:613`). Function stays the same: a job that ends while the page is hidden is read at the next look. What differs: a toast or a state line that a hidden page would have updated appears when the page is shown again. Proof: per poll, a fake-DOM test with the clock of `test-lazy.js:52`: no request while hidden or on another page, exactly one on return.

Not audited line by line (2.65 MB of client script in 79 files [M-me]): full redraws on each data arrival and uncapped lists inside `gui/ext/ide/ui/*.js`, `mapviz/sub/*.client.js`, `models/sub/*.client.js` and `bots/parts/*/client.js`. The cheap way to find them is the draw counter of section 6, not more reading.

## 4. Requests at start and per page show

How they are recorded: `gui/test/test-lazy.js:39-49` replaces `fetch`, logs method, path, query and the page on screen, answers only the shell routes and leaves every page request pending; `--calls` prints the start list (`:76`).

- Before anything is built the page waits for `health`, `commands`, `settings` in parallel (`gui/page.js:2604`), then `game` (`:1654`, one more for GoH at `:1655`). `commands` is `contract.describe()`, 51.8 KB, fixed per release [M-me]: put it in the page as a constant, or serve all four as `GET /api/boot` -> `{health, commands, settings, game}`. `game` includes the Steam lookup (80-230 ms cold [M-co]); answering it in the same request lets the server start it before the browser asks. Keep the four old routes (the console page, tests and LAN Remote use them). Proof: the `S.health`, `S.cmds`, `SET`, `S.game` objects equal the ones built from the four separate answers.
- `POST /api/settings` is sent twice at start. The first is the one-time push of old localStorage values (`gui/page.js:325-326`, only when the server file is empty); the second is the 400 ms flush (`:319`) of values written by `show0` (`:2442` `LS.set('screen')`, `gsSave`). Skip the flush when the value written equals the one already in `SET`. Saves one POST per start and one per page change to the same page.
- `task/catalogue` + `task/drafts` (`gui/ext/task/client.js:119`): needed to draw the task row. Could wait for the first paint (`requestIdleCallback` or after `buildUi`), or for the first pointer over the row. The row would fill a moment later than today.
- `guides/status`, `pro/tools`: item 2.
- `/api/ls` (`gui/page.js:1725-1726`) and `/api/mod`: Mods page init, needed for the header; keep.
- `/api/jobs`: keep.
- Per page show: Logs and GoH (section 3). The other pages ask once and then follow mod and game.

## 5. Program start

Path today:
1. Exe: `dist/sea-main.js:7` parses the manifest, `:29` builds the folder map over every key, `:91` no arguments -> `gui --open`, `:126` loads `gui/gui.js` through the mini loader. Each module: `asset(k)` copies the bytes (`:18`, `Buffer.from(getRawAsset)`, no memo, also on every later `readFileSync` of an embedded file, `:23`) and compiles with `new Function` (`:65`). The build sets `useCodeCache:false` (`dist/sea.js:63`), and a code cache would not cover `new Function` sources anyway.
2. `gui/gui.js:33` `require('./contract')` -> `contract.js:182` requires every ext index: 729 ms; `gui.js:39-41` route table and screen ids; `:189` the page string: 123 ms [M-me, node from source; the exe is not measured].
3. `start()` (`:559`): job list, `cachestore.open` and `cache.sweep()` (`:568-570`, synchronous, before listen), `server.listen` (`:828`), port file (`:835-843`), resolve.
4. Only then `console.log` and `openBrowser` (`:900`, `lib/platform.js:52` `openUrl`).
5. Browser: `GET /` -> first `pageBytes` call encodes 8.3 MB once (`:216`); parse and compile (235 ms in node [M-co], browser unknown); the four start requests; `buildUi`; first page refresh.
So the user waits for steps 1-3 in full before the browser is even asked to open.

"Listen first, load pages after", smallest safe form:
- Move nothing out of module scope except the three ext-dependent values: `EXT_ROUTES`/`SCREEN_IDS` (`gui.js:39-41`), `PAGE` (`:189`), and the ext commands in `contract.js:182`. Put them behind one `loadExt()` that runs once.
- In the `listening` handler (`:829`), call a new `opt.onListening(url)` first (the CLI prints the URL and opens the browser there instead of at `:900`), then call `loadExt()` synchronously in the same tick, then continue to `resolve`. While `loadExt` runs the event loop is blocked, so a request that arrives early waits in the socket backlog and is handled after the routes exist. No request can reach `handle` (`:642`) before `loadExt` returns, so no gate inside `handle` is needed. Add an `if(!EXT_READY) loadExt()` guard at `:678` and `:715` anyway.
- `start()` still resolves after the load, so tests that call `gui.start()` see no change. `routeTable()` (`:907`) and `--dev` `rebuildPage` (`:203`) call `loadExt()` first.
- Gain: the browser start (process, window, first request; 0.3-1.5 s on a cold browser [E]) overlaps the 0.85 s module load instead of following it. The user-visible wait drops by the smaller of the two [E].
- What differs: the URL line is printed before the exts are loaded. If an ext index throws (duplicate route, `gui.js:39`), the browser is already opening and shows a connection error while the console shows the reason; today the browser never opens. `cache.sweep()` can move after the listen in the same step (the Prepare page reads `cacheSwept`, `:699`: make it a getter).
- Before starting: time the exe (below), because the split between module load and browser start decides the gain.

Exe-only checks, each S: memo for `asset(k)` on the module path (`sea-main.js:46-50` already caches exports; the copy at `:18` is paid again by every `fs.readFileSync` of an embedded file, for example lang JSON read through `require`); measure `help()`-free start with `AS2_DEBUG` timing lines around `:126`.

## 6. What to measure in a real browser, and how

Nothing below exists yet: `gui/page.js` has no `performance` call (grep: only `gui/ext/ide/cm/fx/browser.js:144-151`).

Marks to add (S, safe: no output unless read). All in `gui/page.js`:
- first line of the inline script: `performance.mark('as2:script')`
- `:2604` before `Promise.all`: `as2:boot-ask`; first line of its `then` (`:2605`): `as2:boot-have`
- `:2606` after `loadGame()`: `as2:game-have`; start and end of `buildUi` (`:2575`, `:2588`): `as2:build0`, `as2:build1`
- inside the loop at `:2577`: `performance.measure('as2:build:'+id, ...)` around each `BUILD[id](sec)`
- in `show0` (`:2450`): a measure `as2:show:<id>` around `scrInit` + `refresh` + `blkApply`
- after `buildUi`, two nested `requestAnimationFrame` calls then `performance.mark('as2:painted')`
- `window.as2Perf=function(){...}` returning: the navigation entry (`responseEnd`, `domInteractive`), every `as2:*` mark and measure, and `performance.getEntriesByType('resource')` for `/api/` (name, `startTime`, `duration`, `transferSize`). Optional: a `PerformanceObserver` for `longtask` entries, kept in an array.
For draw counts (section 3): a counter in the shared `h()` helper that is only active when `localStorage.as2perf==='1'`, reported per page by `as2Perf()`.

Procedure (repeatable, 10 minutes):
1. Start `node tools/gui/gui.js --port 8123 --no-open` with the real game and the large mod picked. Fixed port so settings and the cookie persist.
2. Chrome or Edge, a profile with no extensions. DevTools > Performance, CPU throttling off, "Screenshots" on. Tick "Disable cache" in Network.
3. Cold: close the tab, open `http://127.0.0.1:8123/`, record with reload (Ctrl+Shift+E). Run `copy(JSON.stringify(as2Perf()))` in the console and save it. Repeat five times, keep the median of each mark.
4. Read from the trace: Parse HTML, Compile Script and Evaluate Script of the inline script (this is the number the language item changes), Layout and Recalculate Style after `as2:build1` (this is what staged building changes), the largest long task.
5. Per page: with the page loaded, show each tab once (first show) and once more (second show); save `as2Perf()`. Columns: build ms, first-show ms, second-show ms, requests, bytes, draw count.
6. Input: on Balance, Files, IDE explorer, Models and the task picker, record typing ten characters in the filter; read the longest "Event: input" task.
7. Hidden: switch to another browser tab for 60 s with a job running; the Network panel must show only what section 3 allows.
8. Exe: `Measure-Command { .\ARSENAL.exe gui --no-open --port 8124 }` is not usable (it does not exit); instead add one line `console.log('gui: ready in '+Math.round(process.uptime()*1000)+' ms')` beside `gui.js:900` and read it, cold (after a reboot) and warm. `process.uptime()` covers steps 1-3 of section 5.
Record the browser version, the machine, the mod size and the commit with every table. Re-run steps 3-5 before and after each of items 4, 7, 8, 11; an item that moves no number by more than run-to-run spread is dropped.
