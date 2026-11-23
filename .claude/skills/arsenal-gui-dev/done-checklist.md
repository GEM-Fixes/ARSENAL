# arsenal-gui-dev: before calling a GUI change done
Walk every line that applies; each names its sub-file.

1. client: no backtick, no dollar-brace, no innerHTML; ES5; only `h` / `textContent` (`client-script.md`).
2. every new control and text in a leaf block; ids lower case `a-z 0-9 . -`, unique; containers have `box` (`blocks.md`).
3. every new string in en, ru, uk, zh; no unused core key; no raw key on screen (`strings.md`).
4. every search or filter box is searchKit with index, Browse, History (`search-boxes.md`).
5. same change in the MoW:AS2, AS64 and GoH version of the page, or `na` / a line saying why not (`game-tabs.md`).
6. writes: preview first, mod folder only, `ctx.job.writes`, `ctx.modtree.touch`, undo told (`write-routes.md`).
7. nothing sync and heavy on a route; over 2 s = `bg` job with progress and cancel; no fetch before first show (id in `LAZY` of `test-lazy.js`) (`routes.md`).
8. cached answer: store with parts, ver, stamps, a `prep` section, sameness tests (`cache-and-prepare.md`).
9. new route: remote `ALLOW` decided, settings key allowed, PERF.md section 6 list walked (`routes.md`).
10. tests of `tests-which.md` pass; server restarted (or `--dev` reloaded) and the page looked at (`restart-and-look.md`).
11. page or route added, renamed, removed, or a task path changed: `node tools/mcp/gui.js --gen`, `node tools/mcp/catalog.js`, `node .claude/skills/arsenal-gui-use/refresh-pages.js`, the hand row in `arsenal-gui-use/pages-<tab>.md`; a new rule -> this skill (`new-page.md`).
12. a data-writing feature: one real write tried on a scratch mod, then verified in game + game.log read, or tagged [T] with a row: `node tools/notes/notes.js add <area> "- what | where | how to check"`.
13. report: what changed per game tab, which tests ran, what is [T].

## Per game
Line 5 is the one most often missed: open the GoH and MoW:AS2 tabs before you report.

## What goes wrong
A change called done after tests only: tests do not look at the page, and no test starts a game.
