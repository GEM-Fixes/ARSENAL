# arsenal-gui-dev: cached answers and Prepare sections
When: a route's answer costs more than about 200 ms and is a pure function of game + mod + parameters.

## Rule (PERF C1-C7)
- it goes in the cache store: `ctx.cache.wrap(section, ver, parts, stamps, make)`.
- `parts` = identity (game folder, game id, mod path, parameters); `stamps` = state (`gameview.stamp` + `modtree.stamps(T, areas)`); `ver` bumped when the shape of the answer changes.
- name the narrowest modtree areas that are still correct (C3).
- never age-only (C4). No `os.tmpdir()`.
- small hot things may stay in memory (C5); drop them on `ctx.modtree.touch`.
- every store section exports a Prepare section: a `prep` entry in the ext's `index.js` (C6).
- know what the shared walk does not see (C7): read PERF.md C7 before trusting stamps for files outside the walked areas.

## Steps
1. Read `tools/gui/PERF.md` sections 2 and 6.
2. Wrap the maker; choose `parts` and `stamps`.
3. Add the `prep` entry so Help & Docs > Prepare can build it ahead.
4. Write the three sameness tests (PERF T2): cached = fresh; rebuilt after a relevant edit; not rebuilt after an unrelated one.

## Per game
`parts` must hold the game id and the game folder: AS64 and MoW:AS2 share an install but not a view (as64 has `as64/core` and `as64+`); GoH has its own folder.

## What goes wrong
- the answer never refreshes after a write: the area is missing from `stamps`, or the write route did not `touch`.
- rebuilt on every call: a volatile value (time, random, object order) in `parts`.
- a cache with no Prepare section: `ext/prep/test.js` fails.
- tests writing into the real store: a test gets a scratch store by its file name (`test.js`, `test-x.js`, `x.test.js`, `cachetest.js`, ...) or must export `ARSENAL_TEST_STORE` (PERF T1).

## Check
The ext's cache test (`cachetest.js` / `test-cache.js`), `node tools/gui/ext/prep/test.js`; on screen: second open of the page is fast, Prepare lists the section.
