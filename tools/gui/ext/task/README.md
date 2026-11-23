# ext task: Quick Guided Task (contract)
Plan and scope: This file is the contract recipes are written against. TASK-CORE owns it and may sharpen it
every change after wave 1 goes under "Changes" at the end, never silently. The reference recipe is recipes/mod.*.

## The game of a task (game parity, 2026-11-14; read this first)
A task is for one of three games: `as64`, `mowas2` (MoW:AS2, same install folder as AS64) or `goh` (Gates of Hell, its own install).
The game is fixed when the draft is made (`draft.game` = the page's game, `GID`) and never guessed again. Every recipe step learns it
the same way, from `lib/game.js`; a recipe never reads the game from `ctx.game()`, a tab, a default or an exe it finds by itself.
- `task` = `{id, exe, kind, name, target, exeFile, dir, as2Dir, gohDir}` is handed to every step:
  `ctx.task` in `values(ctx, base, opt)`, `check(draft, ctx)`, `pass(draft, q, ctx, opt)` and every lookup `lookups.<kind>(ctx, words, opt)`;
  `c.task` in `compile(draft, c)`. `id` 'as64'|'mowas2'|'goh'; `exe` the vfs exe 'as64'|'mowas_2'|'goh' (for `vfs.build({exe})`,
  `sdlset.createSource({exe})`, entityindex `{exe}`, `gamever.read(dir, exe)`, a tool's `--exe`); `kind` 'as2'|'goh'; `target` = id
  (gen `--target`, newmod `--target`, upgrade `--to`, fix `--target`); `dir` the install of THIS game (the GoH install under goh, else
  the AS2 install), `as2Dir` the AS2 install (= `ctx.game()`), `gohDir` the GoH install; a folder not found is null.
- Shorthands kept from wave 1: `ctx.gameId` is the id as a string in values, check and pass (and `opt.game` in values and lookups);
  compile `c.game` (id), `c.target` (as64|mowas2|goh), `c.gameDir` (= `c.task.dir`: under goh the GoH install), `c.exe` (vfs exe).
  `ctx.game()` stays the AS2 install in every step. In a lookup `ctx.gameId()` is a function (the route contract), so read `ctx.task.id`.
- Calling another ext route in process (`require('../../units/server').routes[...]`): pass `ctx.routeCtx()`, the route ctx whose
  `gameId() exe() kind() gohDir() curDir()` answer for the task's game. Calls a compile returns (`{route}`, `{cmd}`, `{tool}`) need
  nothing: compile.js gives each route the task's route ctx, and each command, when the game is not as64 and the recipe left the
  field out, `target` (new, fix), `exe` (check), `goh` (a command with a goh field) and `game` (new under goh: the GoH install).
  A tool a recipe starts itself (`ctx.runTool`) gets `--exe <task.exe>` only when the game is not as64 (`require('../lib/game').exeArgs(task)`).
- gen ops run in a gen Ctx built with `target` = task.target, `exe` = task.exe, `game` = the AS2 install and, under goh, `goh` = the
  GoH install; the core view behind lookups, names and the plan's copy/new marks is the task's game view (no as64/core for mowas2).
- A recipe whose task writes for another game than its draft's has `genGame(draft) -> 'as64'|'mowas2'|'goh'` (gohunit: a GoH-tab
  draft makes an AS2 unit, so it answers as64). compile.js `writeDraft` then runs gen, the copy/new marks, the calls and the mod
  folder guard as that game; the recipe's own `compile(draft, c)` still gets the draft's game in `c`. The page's mod step lists and
  makes the mods of that game (`forPage(recipe).writes` = `{draftGame: writeGame}`, only where they differ).
- A step that cannot exist for a game says so in one plain line (`games` leaves the game out and the row greys with a reason, or the
  step returns the line): never a silent AS64 answer on another game's tab.
- Writes: a goh task writes only into a GoH mod folder outside the GoH install; a folder inside it gets tools/lib/writeguard's
  refusal as the plain line (settled 2026-11-14). The game editor hand-off finds as64_ed.exe, mowas_2_ed.exe or
  binaries/x64/call_to_arms_ed.exe by the draft's game and never starts it; its GoH steps (stepsFor.goh) say the mod is put
  where GoH reads it by hand. The mod step's new mod hint on GoH (task.mstep.newHintGoh) asks a full path outside the GoH install.

## Files
```
tools/gui/ext/task/
  index.js      ext object {id:'task', nav:null, tab:false, script, lang, routes, remote, recipes, IDS}; loads the recipes from a
                literal list (opt(): a file that is not there is skipped, an error inside one is thrown); validates each at load
  server.js     routes (below); PLANNED = the 27 rows section 3 (a built recipe overrides its row)
  client.js     the row (#taskrow), the task window, step list, picker, look pane (window.VIEW), built-in question kinds
  lang.js       core rows [key, en, ru, uk, zh], keys task.* (built-in mod step: task.mstep.*)
  lib/recipe.js validate(recipe, census, {kinds, ids, censusDir}) -> [{level:'error'|'warn', msg}]
                coverage(recipe, census) -> {ok, total, asked, kept, missing, unknown}
                steps(recipe, draft, values) -> [{id, kind, q, group, essential, depth, kept, n, count, qs}]  (ES5, shipped to the page)
                keysOf(recipe) -> every lang key it names; loadCensus(name|[names]); forPage(recipe) -> {title, titles, ...};
                titleKey(recipe, verb), titles(recipe)
  lib/draft.js  load, save (atomic, 1 MB cap, clean() keeps only contract fields), list (top level, newest first), child, remove
                (recursive, staging too), stagedPath (refuses a name that leaves staging)
  lib/compile.js compile (children first), plan (dry run), write (restore point first), inMod, checkCall, CMDS, TOOLS
  lib/testkit.js run(recipe, langRows, fixture, scratch): the recipe test in one call
  external.js   outside programs: the registry (one entry per program) and the routes external, external/open
  census/<thing>.json   every variable of a thing (census batches)
  recipes/<id>.recipe.js  .lang.js  .test.js  (+ optional .client.js)
  test.js       framework test: node test.js <scratch dir>
```
Adding a recipe: the row for its id is already in index.js PARTS; drop the files in, nothing else to wire. The id must equal the
file name; a validate error stops the GUI from loading (on purpose), a warning is printed only by the test kit.

## Recipe (recipes/<id>.recipe.js)
```js
module.exports = {
  id: 'gun',                         // [a-z][a-z0-9-]*, also the lang prefix task.gun.
  verbs: ['make', 'change'],         // make | change | explore. explore writes nothing: no compile, ends with done
  games: ['as64', 'mowas2'],         // as64 | mowas2 | goh; other games grey the row with a reason
  needs: ['mod'],                    // mod: built-in first step (pick or make a mod); picked: greyed until a mod is picked;
                                     // game: greyed until a game folder is set
  order: 30,                         // place in the task list
  title: 'task.gun.t',               // or one per verb: {make: 'task.gun.tm', change: 'task.gun.tc'} (row and window head)
  census: 'gun',                     // census/gun.json (a list of names allowed); not there yet = warning only
  base: { lookup: 'entity' },        // the built-in "what to copy" step (any lookup kind, core or own)
  groups: [ { id: 'fire', title: 'task.gun.g.fire', essential: false, q: [ /* questions */ ] } ],
  kept: [['some.key', 'reason in plain words']],          // census keys not asked; reason required
  checklist: ['task.gun.c.fires'],                        // what to look at in game (lang keys)
  lookups: { weapon: async (ctx, words, opt) => [{ id, name, where, ref, sub }] },  // opt {mod, in, limit, game}
  values: async (ctx, base) => ({ range: 120 }),          // preselected value per question id; called with or without a base;
                                                          // ctx = route ctx + {mod, gameId}
  compile: (draft, c) => ({ gen: { ops: [...] } | null, calls: [], copies: [], notes: [], mod, result }),
  routes: { 'POST /api/x/task/r/gun/thing': async (url, body, ctx) => ({}) },   // optional, must live under /api/x/task/r/<id>/
};
```
compile ctx `c`: `{game, gameDir, mod, target, staging, values, draftId, recipe, verb, base, answer(id), value(id), kept(id)}`.
`value(id)`: keep -> the base value; value/exist -> the answer; branch -> the child's result; file -> absolute staged paths.
compile returns (all optional):
- `gen: {ops}` gen ops (tools/units gen), run in process into the mod; no automatic `mod` op.
- `calls`: `{cmd:'new', input}` (input.dir must be the mod), `{tool:'newmod', args}` (args[0] must be the mod),
  `{route:'POST /api/x/<page>/...', body}` (another page's POST route; body.mod and body.write are forced; never /api/x/task/).
- `copies`: `{staged: name, to: rel}` or `{key: gamefilekey, to: rel}`; rel must stay inside the mod.
- `mod`: the folder written (only the mod recipe sets it to the new folder; otherwise it must equal the picked mod).
- `result`: what a parent gets back as `answers.<q>.result` when this task ran as a branch.

Question:
```js
{ id: 'range',              // [a-z][a-z0-9_]*, unique, not a built-in step name
  kind: 'number',           // text | id | number | choice | yesno | list | thing | file | handoff | own kind from .client.js
  ask: 'task.gun.q.range', help: 'task.gun.h.range',
  covers: ['weapon.range'],
  limits: { min, max, step, unit, values, re, limit: 'WPN-12' },   // choice needs values; label key task.<id>.v.<q>.<value>
  //  reHint: 'task.gun.h.rangeEx' (an example of the form, shown after a refused re), usual: [lo, hi] (number: what the game's
  //  own data uses; outside it a warning under the field, never a refusal; inside min and max)
  picker: { sources: ['keep','exist','branch','file','ext'], lookup: 'sound', kinds: ['sound'], branch: 'sound', ext: [],
            target: 'sound/x.wav',   // the file an outside program saves, inside the mod (the hand-off card says Save it as)
            check: f => null },      // file source: after the core's own check, ({name, type, size, bytes, facts}) -> nothing,
                                     // or a reason: a recipe lang key, {key, params}, or words; it refuses the upload
  suggest: { from: 'title', slug: true },   // text and id: an empty box starts with that earlier answer (slug: a to z, 0 to 9, _)
  indent: false,            // a when question is indented only as a real follow-up; true or false forces it
  unique: { lookup: 'modfolder', in: 'where' },   // id questions only: refused when the lookup finds the exact name
  optional: true,           // an empty text answer is accepted
  required: true,           // no default possible: Quick asks it too (never with optional)
  when: { kindq: 'cannon' } }                     // names earlier questions only; a value or a list of values
// reserved when keys: $verb, $game, $copy: 'armor' (the recipe's values gave armor a value), ['a', 'b'] (all of them),
// {id: 'type', is: 'tank'} (or is: a list): ask a question only where the copy has that value
```
thing and file questions need a picker; exist needs lookup; branch needs branch (a recipe id, or a list of them); file needs kinds.
Built-in steps (core, never in a recipe): mod, base, mode, review, write, check, test, checklist, done (a branch: review, back).
An essential group is asked first; every other group has "Keep all as copied".
Quick or Everything (step `mode`, right after base, in every task with a base that writes; a switch in the window head too):
Quick (a new draft) keeps every group that is not essential as copied, one step `{id: 'g:<group>', kind: 'group', count, qs,
kept: true}` with Ask these (the group goes in `draft.asked`; Keep the whole group takes it out again). A `required` question, or
one already answered, stays a step of its own. Everything (or a draft with no mode) asks every question.

## Lookups (GET lookup?kind&q&mod&in&ext&recipe&limit)
Recipe lookups win over core kinds. Core: modfolder (folders in `in`, else <game>/mods), entity (Units search, all), map (maps
list; `state:'running'` while it builds), file (`ext=a,b`), sound, texture, model, icon, text (extensions over the game view).
Answer `{kind, q, results:[{id, name, where, ref, sub}], total, more, exact, state?}`. The page shows name first, id and where
as smaller text. A recipe result with only an id (no name, or name = id) is named from the game texts (.lng of the game view, '#'
files first): its own `text` key when it gives one, else desc/entity/<id>, desc/human/mp/<id>, desc/squad/<id>, desc/weapon/<id>,
desc/stuff/<id>, desc/ammo/<id>. Search words then match the name too (the lookup is asked again
with no words and its unnamed results are kept when every word is in the id, name or where).

## Picker sources
keep | exist (lookup, look pane) | branch (child draft, returns its result) | file (upload to staging, type from the bytes,
checked against kinds: sound, texture, picture, model, text, video, font, any) | ext (hand-off card, below).

Branch kinds: `picker.branch` is one recipe id or a list of them (`['gun', 'ammo']`, each once). With a list the picker (and each
list line) shows "what kind" (the recipe titles) before Start; draft/child takes `recipe` (the kind picked) and refuses one outside
the list (one id: `recipe` may be left out). The answer keeps the kind: `{src:'branch', child, recipe}`; compile runs each child
with its own recipe and refuses a child whose recipe is not in the list. What the child gets: `picker.pass`, then
`picker.pass.by[<kind>]` over it (`by: {ammo: {for: 'shell'}}`, keys from the list only), then the page's pass, then the
parent's `recipe.pass(parent, qid, lctx, {line, page, recipe})` (it wins); with a list `pass.recipe` is the kind. The So far
pane and Review name the kind.

## Outside programs (external.js section 5)
A question sends the user to an outside program with the source `ext` (or kind `handoff`, which needs no picker). `picker.ext`
names registry ids in the order to show; without it the card lists the programs whose `for` meets `picker.kinds`. The card:
program name and what it is for, found on this PC or "not on this PC" with a link to the Guides & External Tools page (never a download),
the numbered steps, Open it (plan, the page's confirm box, then the real call with the plan's token), Open the folder with my
files (the picked mod, else the staging folder), I am done: here is my file (to the `file` source: the upload check reads it), and
for a program that saves into the mod (`back.inMod`) I am done: it is saved in my mod (answer `{src:'ext', value: programId}`).
Registry entry:
```js
{ id: 'audacity', name: 'Audacity', for: ['sound'],          // file kinds: the picker kinds plus skin, icon
  open: 'exe',            // exe: start it, or a file in it | default: the PC's own program for find.assoc | game: never started
                          // here (Show in folder only) | cli: steps only | none: ARSENAL cannot find or start it
  guide: 'Audacity',      // words to look for on the Guides and tools page
  find: { env: ['VAR'], exe: 'x.exe', paths: ['%ProgramFiles%\\Audacity\\Audacity.exe'] /* '*' = one folder level */,
          reg: [{key, value, sub}], appPath: 'x.exe', onPath: ['x.exe'], repo: 'soedit', game: {as64: 'as64_ed.exe'}, assoc: '.wav' },
  steps: ['task.prog.audacity.s1', ...],                    // lang keys task.prog.<id>.*
  stepsFor: { goh: ['task.prog.<id>.goh.s1', ...] },       // optional: the steps on one game's tab (list GET ?game=)
  back: { kinds: ['sound'], inMod: false } }                // what comes back; the upload check (server.js sniff) reads it
```
Adding a program later = one entry in external.js PROGRAMS plus its rows in lang.js (task.prog.<id>.what, .back, .s1..).
The game and its editor (writeguard's exe list) are never started from here: no command opens them for this, so the card shows
the path and Show in folder.

## Draft (<GUI data>/tasks/<id>.json, or ctx.taskDir / AS2_TASK_DIR; staged files in <tmpRoot>/task/<id>/)
```js
{ id, recipe, verb, game, mod, base: {id, ref, name}, parent: null | {draft, q},
  answers: { x: {src:'value', value}, y: {src:'keep'}, z: {src:'exist', value, name, ref}, b: {src:'branch', child, recipe, result},
             f: {src:'file', staged: ['a.wav']}, e: {src:'ext'} },
  kept: ['groupid'], mode: 'quick'|'all', asked: ['groupid'], state: 'open'|'written'|'checked'|'done', step, ticks, restore: [ids], title, at }
```
Saved on every answer; a branch is listed under its parent, not under Continue; delete removes branches and staging.

## Server (all under /api/x/task/)
GET catalogue?game -> {verbs, recipes:[{id, verbs, games, needs, order, title, titles, built, forGame}], drafts} | GET recipe?id |
GET drafts | GET draft?id -> {draft, children} | GET lookup | GET values?draft or ?recipe&mod&base |
POST draft/new {recipe, verb, game, mod, base, mode} | POST draft/save {draft} | POST draft/delete {id} | POST draft/child {parent, q} |
POST upload {draft, q, name, off, b64, last} (JSON chunks up to 6 MB, file up to 64 MB, 409 on a lost offset; a refusal gives
why plus whyKey and whyParams for the page's language) | POST external/back {draft} (I am done: closes the outside-program guard,
-> {closed, restore, changed, unguarded}) |
POST plan {draft} -> {mod, files:[{rel, action}], calls, copies, errors, warnings, notes} | POST write {draft} -> plan + {written, restore,
unguarded} | GET external?ids&for&game -> {programs:[{id, name, what, for, open, guide, steps, back:{kinds, inMod, say}, found, how,
path, can:{start, file, folder, reveal}}]} (a phone gets no paths, no buttons) | POST external/open {draft, id, action: start|file|
folder|reveal, staged|rel|path, where: mod|staging, plan, token} (plan:true answers what would open plus a 5 minute one time token;
start and file need it back, 409 TASK_EXT_ASK without; paths only in the draft's staging, the picked mod, or the program's own path).
Every POST refuses LAN Remote (403 rmt.viewOnly); remote.js lets the GET routes in (index.js `remote`).
Write order: cmd and tool calls, gen (snapshot each file, then flush), copies (snapshot, atomic write), route calls. Any plan
error stops it before a byte is written. Restore points use the Editor's format: <mod>.arsenal-undo/<id>/restore-point.json.
Route calls: the files the route's dry run names (files, written, changed, wrote: strings or {rel|file|key|path|to}; or one rel,
file, path) get a restore point before the real call; anything else the call changes in the mod comes back in `unguarded` and the
Write step lists it as written with no restore point. An explore draft (or a recipe that only explores) has no plan and no write.

## Client (page script: ES5, no backtick, no dollar-brace, no innerHTML, theme tokens only, blocks contract)
`window.TASK = { open(recipeId, verb, {base, parent}), resume(draftId), close(), next(), back(), state(), row(), steps,
kind(name, {draw(q, state, host), value(q, state) -> {ok, answer | why, limit}}) }`.
Errors: a server error may carry {key, params} (D.badK); the page shows tx(key, params). A lookup with nothing to pick may
give {why, do} (a lang key or words): the page shows them in place of an empty list; a result with id '?' is a message line.
A recipe .client.js exports `{kinds: ['name'], script: 'ES5 calling TASK.kind(...)', css}`; its css is theme tokens only.
The window hides nav, subnav and the pages (body.task-open). Keys: Enter = Next, Alt+Left = Back, Esc = save and close.
The open task (draft, step, the parents above a branch) is in sessionStorage `task.open`: a page reload opens it again at its step;
closing the task clears it. A recipe title `titles[verb]` (else `title`) names it in the row, Continue and the window head.
Layout: three columns (steps, question, look) down to 820 px wide; below that they stack question, look, steps. The look pane
is capped (60vh) with its own scroll. It shows the current question's own thing (an answer that names a file), else the thing
being copied, then the copy's values; never a hex dump: .mdl or .def a small read only 3D view (the Models 3D view part, opts
doc false, bars hidden; `TASK.look3d(ctx, opts)` replaces it when a page sets it), picture and sound their VIEW kinds, text its
first 40 lines, else "No preview for this file" with size and path.

## Lang
recipes/<id>.lang.js = rows [key, en, ru, uk, zh], every key starts with task.<id>. Plain words, no dash characters.

## Tests
A recipe test is three lines (see recipes/mod.test.js):
```js
const kit = require('../lib/testkit');
kit.run(require('./gun.recipe'), require('./gun.lang'), { base: {id: 'zis3'}, answers: { range: 140 } }, process.argv[2]);
```
fixture: `{base, answers (plain values or {src,...}), verb, game, gameDir, mod, values, planFiles: [rels the plan must list],
write: true, after(mod, result, ok)}`. The kit checks: validate, lang (4 languages, prefix, no dash, every keysOf key), census
coverage plus the seeded defect (one covering question removed must fail), steps, compile (allowed calls, copies in the mod),
plan (gen plan skipped with a note without a game folder), then the write and `after`. Last line PASS. gui/test/run.sh runs every
recipes/*.test.js.

## Changes
1. Upload is JSON chunks with base64 (gui.js POST bodies are JSON with an 8 MB cap), not a raw body.
2. No `POST check`: the Check step uses the existing check command (streamRun) and the check view.
3. Added routes: GET draft?id, POST draft/new, POST draft/child.
4. Added question fields `unique` and `optional`; `multi` dropped (use kind list).
5. Lookup answers carry `exact` and `state`; lookup kinds modfolder and map added.
6. compile may return `mod` and `result`; calls are {cmd}, {tool} or {route}; copies are {staged|key, to}.
7. gen ops run in process with no automatic `mod` op; write order as above.
8. `values(ctx, base)` is called with or without a base.
9. needs: mod, picked, game.
10. A census file may be an array, {keys} or {vars: [{key}]}.
11. Recipe .client.js exports kinds, script, css; recipes may export routes under /api/x/task/r/<id>/.
12. Built-in mod step strings are task.mstep.* (task.mod.* is the mod recipe's).
13. The draft also keeps step, ticks, restore and title.
14. external.js (outside programs) is built: see "Outside programs"; routes GET external, POST external/open (wave 3).
15. Added `picker.ext` meaning: registry ids, in order; a `handoff` question needs no picker (it gets the ext card).
16. Added answer form `{src:'ext', value: programId}` (a program that saves straight into the mod).
17. write returns `unguarded`: files a route call changed that its dry run did not name (no restore point); plan lists the named
    route files and says when a route named none.
18. Explore: no review, write, check or test steps for an explore draft, a recipe that only explores, or such a branch (it ends
    with back); plan and write refuse an explore draft.
19. The catalogue keeps the plan's order for the 27 planned rows (a recipe's own `order` places only a recipe outside the plan,
    after them); the page asks for the catalogue again when the task list gets focus (at most every 5 s).
20. A recipe file set in recipes/ whose id is not in the literal PARTS list still loads in a source copy (index.js EXTRA; a file
    that throws or does not validate is skipped with a warning); the single exe has the literal list only.
21. The map lookup reads GET /api/x/maps/list as it is: results carry the title (name), folder, modes, players, the mod(s), copy
    (false: only in a mod pak) and ref {key: resource/<map>/map.info}; state running | error | nogame | done.
22. Calls (compile.js). A call fails on `ok:false`, a status outside 2xx, an `error` field, an `errors` count or list, a throw, or
    its own `ok(result)` returning false; the Write step shows a failure card per failed call. Route dry flags: plan is always dry;
    `dryFlag` ('dry' | 'dryRun' | 'plan' | 'write' | 'read' | 'none') overrides the ROUTE_DRY table (models/stage and
    models/anim/run use `dry`; share info, preview, package, workshop, version use `write`; share gate, outcheck, card,
    clashes, updated only read). A route with no dry run is not called in plan: the plan says it runs later. POST
    /api/x/share/uploader is refused (it starts a program). A recipe may call its own /api/x/task/r/<id>/ routes, no other's.
23. Restore points: write lists the mod before and after, so a file a call changed that nobody named still gets a restore point
    (existed:false when new); `unguarded` stays in the result and is normally empty.
24. Commands `{cmd, input, ok?}`: new, upgrade, fix, check and gohport (alias goh2as2), from tools/gui/contract.js. Plan sets
    the dry field (dryRun, upgrade --plan, fix mode plan) and drops out; the out folder must be the picked mod (new) or inside
    it. A command whose contract can launch the game is refused. Exit 3 is "done with notes" (`partial`, notes from the json
    findings), not a failure; check exit 1 fails as "likely crash". A command that takes `game` gets the GUI's game folder
    when the input has none. Long commands get 30 minutes.
25. gen runs with the mod's real dependencies (mod.info Require, deps first) and its text finish (finishText) in plan and write,
    so `ctx.texts` and card names reach a .lng file. gen.js exports finishText and renameTextFile for this. lng-add (one key per
    call) is not exposed: the gen finish writes all keys in one pass.
26. `recipe.copiesFirst: true` (or the compile result's `copiesFirst`, or any child's) runs the copies before gen; default
    after. In plan, gen still reads the mod before the copies arrive (the plan says so). COPY_MAX is 2 GB a copy, `cp.max` up
    to 8 GB; staged copies stream. The upload limit is unchanged.
27. Branches: staging is per draft, a child's staged files resolve at any depth, and staged names may hold sub-paths (up to 8
    parts). `picker.order: 'before' | 'after'` places a child's output around its parent. `picker.pass` and `recipe.pass(parent,
    qid, ctx, {line, page})` give the child `{for, keys, base, verb, answers}`; draft/child takes `line` and `pass`.
28. kind list: answer `{src:'list', items:[...]}`, each line its own source (value, exist, branch, file under line<n>/); a line
    cannot be a list. A list line's child sees `draft.parent.line`.
29. `values(ctx, base, {draft, verb, parent, pass, game})`. `unique` accepts the thing's own id when the verb is change.
    `when` may use `$verb` and `$game` (other $ keys are refused; `$game` of a draft with no game is as64). An essential group is asked first (by design).
30. Lookups: a recipe lookup gets `{mod, in, filter, limit, game, q, draft}` (`in` any string, `filter` a JSON object) and may
    return a list or `{results, state, exact}`; state running shows "still reading" and the page asks again.
31. `recipe.check(draft, ctx)` returns cards `[{title, lines, level: info|warn|error}]`; POST /api/x/task/check runs it after the
    check view.
32. Uploads: a file question with `multi: true` takes several files or a folder (sub-paths kept). Kinds may be '.ext' (match by
    extension); a model .vol/.anm/.ply/.mdl that reads as data is accepted.
33. Recipe POST routes refuse LAN Remote (GET stays open). A recipe that fails to load (a throw, a bad id, validate errors,
    bad lang rows, a client script that does not parse, bad routes) is a fault: skipped, logged, shown greyed with its reason
    in the list; draft/new refuses it. EXT.FAULTS lists them.
34. Explore: the Done step offers `recipe.next: [{recipe, verb?, label?}]` (greyed with the reason when it cannot start), or
    no buttons; it never reopens the same recipe.
35. `TASK.kind(name, {draw, value, leave?})`: leave(q, state, host) is called when the question is left or the window closes.
36. testkit: the fixture may pin `id` and `gameDir` (false: no game) and name `client`; every key a recipe's .client.js uses
    must exist in en, ru, uk and zh (one check per recipe).
37. view/ref.js readKey reads an empty or new mod folder as a mod (it no longer refuses one without mod.info).
38. A call with its own `ok(result)` decides alone whether a route result with `ok:false` is a failure (some routes use `ok:false` for "worked, with a warning": art/wav-convert on a stereo sound). Without `ok`, `ok:false` is still a failure. A thrown error and a non-2xx status always fail.
39. A `{cmd}` step makes the GUI temp folder when it is not there yet.
40. `picker.branch` may be a list of recipe ids (Picker sources, Branch kinds): a "what kind" choice before Start, the answer keeps
    `recipe`, draft/child refuses a recipe outside the list, `picker.pass.by` and `pass.recipe`, `recipe.pass` gets `opt.recipe`,
    compile runs and checks each child's own recipe. One id works as before. Plan of a `copiesFirst` task: the gen plan sees the
    planned copies (staged or game key, each up to 64 MB, 256 MB in all) as files of the mod, in the gen Ctx overlay; the gen steps
    that run a tool (mod, clone, map-clone, mission-clone, place) read the mod folder and do not see them. Without copiesFirst the
    plan says when a copy replaces a file the gen steps write.
41. Quick or Everything: the step `mode` after base (tasks with a base that write) and a switch in the window head. Quick (new
    drafts) keeps each group that is not essential as copied: one `group` step with its count and Ask these (`draft.asked`); Keep
    the whole group folds it again. The head says "(N more kept as copied)"; Review lists per kept group how many values stay as
    copied. A question may be `required: true` (Quick asks it too). Drafts with no mode stay Everything; a branch takes its
    parent's mode.
42. Lookup results: name first, id and where as smaller text. A recipe result with only an id is named from the game texts by
    its `text` key or the desc/ key forms (Lookups); search words then match that name too.
43. A page reload (the --dev live reload) opens the open task again at its step (sessionStorage `task.open`); close clears it.
44. `title` may be one lang key per verb ({make, change, explore}); the catalogue and recipe routes give `title` (a string,
    make's when there is no key for the verb) and `titles` (the object, or null), so code that reads `title` keeps working.
45. The write gate: on Write, Next is off until Write ran (Enter refuses with what to do); Check, Test, the checklist and Done
    of a task not written show "Nothing is written yet" with Go to Write and Do not write now (save and close).
46. Undo place: the Write step and the restore points name the IDE tab, Restore points panel (else Mods > Mod Files, tab Undo, with Advanced on) and give a
    button that opens it. Closing a task says where to continue it (task.w.saved).
47. Words per verb: tkVk(key) takes key.c for a change task, key.nb for a recipe with no base, else key; no copy words without a
    copy (Suggested, Use the suggestion; Now, Leave as it is).
48. Outside programs that save into the mod (back.inMod): Open it keeps a copy of the mod files (<stage>/<id>.extguard.json);
    I am done (POST external/back), Write and Throw away close it, each changed file gets a restore point. The card says so.
49. The Test step: numbered steps (Play page, the test match, where to look: recipe.test, then how to come back); its button
    saves the task, moves it to the next step and goes to the Play page. A recipe may give `test` (a lang key).
50. Upload content: a file named .wav, .png, .dds, .bmp, .tga, .jpg, .ogg, .mp3, .psd, .gif or .avi must hold that type (an MP3
    or OGG renamed .wav is refused at once, in the page's language, with what to do); picker.check adds a recipe's own check.
51. List lines offer only the sources picker.sources names (no typed line unless 'value'); the plan refuses a stored line from
    another source (TASK_LINE_SRC). A list may use the 'value' source.
52. Indent: only a real follow-up (the question just before it, or the lead of its run), never under a gate every later question
    names; `indent` forces it. New question fields: limits.reHint, limits.usual, picker.target, picker.check, suggest.
53. when $copy (above). Lookups may say why they found nothing ({why, do}). Server errors carry translation keys (gui.js passes
    key and params for ext routes). Every tx('task.x') key of client.js has a row (test).
54. testkit: the kinds a recipe's .client.js declares count in validate (a fixture need not list them).
55. Values after the save: What to copy and the mod step save the draft, then ask the values (the values route reads the saved
    draft). Branch children, the return and the mode switch read nothing new (checked, unchanged).
56. The look pane (Client above): 3D view for a model, picture, sound, first lines of text, else No preview with size and path;
    the copied thing stays on later steps until a question has its own thing. viewer.client.js takes opts.doc false.
57. Layout: three grid columns down to 820 px, then question, look, steps; the look pane capped with its own scroll.
58. Lookup search runs as the user types (after 350 ms), besides Enter and Find.
59. Enter in a text or number box is Next, never on Write. A refusal clears when the user types or picks and never shows on
    another question (an answer that comes back after the window moved on says nothing).
60. Suggested: in a make task that copies, an id question's value that is not the copy's id is a suggestion (Suggested, Use the
    suggestion; that keeps the value). The copy has is only for the copy's own value.
61. Titles and draft names start with a capital letter. A draft is named after the new thing (name, title, newid, id or folder
    answer; the saved title), the copied one only as "from ..." (task.w.from). draft.title holds the new name only.
62. Plan files: action change (the mod has it), copy (a game file the mod gets its own changed copy of: "copy of a game file,
    changed"), new (nowhere yet). Copies and command files use the same rule.
63. A task opened here and closed with no answer, base, mod, tick or write of its own leaves no draft and no Saved toast; a
    resumed draft always stays.
64. Game parity (2026-11-14): lib/game.js is the one way a task learns its game (draft.game, else the request, else as64);
    compile ctx c.task and every recipe step ctx.task, with the gameId string kept; commands and newmod get --target / --exe /
    --goh / --game for MoW:AS2 and GoH (as64 argument lists unchanged); recipe routes and lookups get the draft's game
    (withTask); the game view is built with the game exe (no as64/core for MoW:AS2, the GoH install for GoH, names from .pot);
    recipes may carry na {game: lang key} for a plain not-for-this-game line; PLANNED rows and testkit (fixture game, gohDir)
    follow. Tests: lib/game.test.js.
65. Job list (tools/gui/README.md "JOBS", 2026-11-21). plan, write and check name their request `job.w.task {name}` (the draft's
    title, else what it copies, else the recipe id; the page names its own row "Guided task: <task name>" through `api(url, body,
    TASK.job())`) and report progress per step: stage = the step's name, done / total = steps finished of all (a write counts its
    plan half first: 3 plan steps + 3 write steps = 6). `ctx.job.writes` is set when the first write step is due.
    Stopping (the footer's Cancel, or the page gone): `lib/compile.js` asks `stopped(ctx)` before every step of plan and write;
    after a stop no further step starts and nothing more is written. A tool or contract command (both go through ctx.runTool) and
    the children of another page's route called in process (GM.routeCtx copies the request's ctx: job, jobs, runTool) are killed at
    once. plan answers `{..., stopped: true}`; write answers `{written: false, stopped: true, partial, restore, unguarded, steps:
    [{name, kind: cmd|tool|route|copies|gen, state: left|done|stopped|failed}]}` (`steps` is on every write answer now). A stop
    that comes while the last step runs, the step itself done, is a whole write. The restore points are made as always (guardEnd
    runs in the finally), so the undo works after a stop.
    The dispatcher answers a stopped request 499 whatever the route returns, so the write route keeps the outcome in the draft:
    `draft.stopped = {at, steps, changed, points, unguarded}` (lib/draft.js clean keeps it; the restore ids join draft.restore). The
    page reads the draft again after a 499 (GET draft) and shows a card: done and written, stopped part way, not done, the restore
    points; the same card shows on the Write step after Continue. The next write that is not stopped clears it. A stopped plan or
    check is a plain line, never a red error or a toast. Recipe routes with a tool (fixmod scan|stage, gohunit scan|stage, release
    check, army flag, bots buy, text extract) end at once with `{ok: false, stopped: true}` (`ST.stopped(ctx, r)` in
    upgrade.recipe.js) and stage or write nothing after it; army flag and bots buy set `ctx.job.writes` when they write.
    For recipe page code: `TASK.job()` (the api option that names the request) and `TASK.stopped(box, e)` (true for a stopped
    request; the box then holds the plain line). Tests: test.js 8g and pageJobs, the five recipe tests. The page test's fake timers (test.js pageTimeout) now run a timer of 1 s or more as a real timer that does not hold
    the process and honour clearTimeout: run at once, the footer job list's 1 s clock (page.js jobTickOn) re-armed itself for ever
    and the test never ended after its last line.
