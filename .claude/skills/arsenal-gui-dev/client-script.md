# arsenal-gui-dev: write or change a client script
When: editing an ext's `client.js` (the `script` string) or page code in `page.js`.

## Hard form
- `module.exports = String.raw` + a template: NO backtick, NO dollar-brace anywhere in it (comments too); `test-ext.js` fails on either. Backslashes are literal in String.raw.
- ES5 only: `var`, `function`; no arrow functions, `let`, `const`, template strings, `class`. The same text runs in the tests' fake DOMs.
- never `innerHTML =`, `insertAdjacentHTML`, `document.write`. Build with `h(tag, attrs, kids)` (alias `var el=h`); text through `text:` / `textContent`. `h` attrs: `class`, `text`, `on<event>`, `blk` (block id), `box` (container kind), `true` = bare attribute, null / false = skipped.

## Screen
`EXT_SCREENS.<id>=function(root){ ... return {refresh, focus, view, init} }`.
- `refresh` runs at first show and when stale. Nothing fetches in `init`, at script load or for a hidden screen (PERF K1).
- `view(v)` when the page has views (`units/make`); a page that changes its own view calls `viewSet(page, view)`.

## Shared kit in `page.js` (use, do not copy)
`tx(key, {slot})`, `api(url, body, opt)` (sends the game headers and the job id; `opt.what` names the job, `opt.job === false` for a poll), `toast`, `tip`, `loading(el, key)`, `result(el, kind, text)`, `askDo` (the "do it?" box), `pick(mode, start, cb, opt)`, `searchKit`, `buildForm` / `runCard` / `streamRun` (contract commands), `mkLog`, `pollLater(page, fn, ms)` / `pollStop` (polls stop when hidden), `show(id, view)`, `as2Link`, `as2Edit(ref, line, col)`, `JUMPS.mark(label)`, `JOBS.track`, `LS.get/set` (window settings), `naCard(key)`, `peekBtn`, `window.VIEW`, `window.TASK`.

## Helpers each page defines itself (names of `ext/units/client.js`)
`row(id, key, ctl, after)` = `fld(...)` labelled field block; `flow(url, body, box, after, o)` = the preview-then-write pair of buttons; `inp`, `sel`, `errBox` (a stopped request, `e.cancelled`, is a hint not an error), `once(load)` (one list per data signature), `hits` (ranked filter, 40 rows).

## State
- the current mod is `S.mod` (header). No page has its own mod box.
- game: `S.gameId`; never hard-wire as64.

## Late answers and speed (PERF K2, K3, K6, K7)
- a sequence number per request, older answers dropped; a repeat of an in-flight request is dropped.
- draw once per frame; no layout read per appended row; big lists in windows.
- debounce typed input 350 ms. Polls stop while the window is hidden (K5).

## Per game
Same script for the three tabs. A card a game cannot have: `naCard('na.<page>.<game>')` in its place (`game-tabs.md`).

## What goes wrong
- a backtick or dollar-brace in a comment: `test-ext.js` fails.
- fetch in `init`: `test-lazy.js` fails (the id must be in its `LAZY` list and ask the server only at first show).
- text literal in the script: raw English in ru / uk / zh; `test-ext.js` checks `tx` keys only, so look yourself.
- a late answer wiping what the user typed: keep the sequence check.

## Check
`node tools/gui/ext/<id>/test.js <scratch folder>`, `test-ext.js`, `test-blocks.js`, `test-lazy.js`, `test-lang.js`.
