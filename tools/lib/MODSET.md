# Read once: moving one more linter onto lib/modset

Phase 2. doctor runs every linter that has a module form (`tools/<t>/ctx.js`) in ONE shared pass:
one listing of the mod, each text file read once from disk and handed to every linter that asked for it, each linter in its
own worker thread. Linters without the form stay child programs. Nothing is listed anywhere else: doctor finds `ctx.js`
itself (`lib/modset formOf`), so each job touches only its own linter folder. Done: milint, humlint.

## What a linter needs

1. A read-ahead seam. The core reads the mod's loose files through a `readAhead`-like object (`add wait take drop close`,
   lib/sdlset). Most linters already have one: a generator `body(o, ra)` driven by `checkAsync(o)` (milint, humlint,
   keylint ...). Let `checkAsync` take it from outside, and close it at the end as before:
   `async function checkAsync(o, ra0) { const ra = ra0 || sdlset.readAhead({...}); try {...} finally { ra.close(); } }`
   No seam yet: add one first (each file it reads: `ra.add` in reading order, `await ra.wait(key)`, `ra.take(key)`, read it
   yourself when take gives `undefined`). Files read outside the seam still work; they are just not shared.
   Read outside the seam because the read is sync and lazy (a registry built on first use, an include met in a parse)? Take the
   file through `ra` before that point and keep the bytes for the run: humlint `pre` (set/ability + set/breed, taken before the
   loop), milint `keep` (units sets first; the loose includes of each folder's files, found in their raw text, before the parse;
   served to lib/sdlset through `src.ahead({ take })`). Hand the kept bytes only where the old read gets the same file
   (`src.loosePath(key)`), so the output cannot move. Wait 32 at a time (each `wait` starts its read).
   Binary headers: `ra.add(key, file, { start, end })` reads only that range (shared per file + range), `ra.size(key)` = the
   whole file's size (expcheck pages, binhdr headers).
2. The CLI as a function: move the `require.main` block into `main(argv, { ra })` that parses `argv` exactly as before and
   returns the promise; the CLI calls `main(process.argv.slice(2))` with its own error handling around it (milint passes
   `onError`; humlint keeps `cli.run`). An error inside main must reject (or throw), not be printed away: the pass then
   reruns the linter as a program, which prints the error the old way.
3. `tools/<t>/ctx.js`:
   `module.exports = { run: ctx => require('./<t>').main(ctx.argv, { ra: ctx.reader() }) };`
   ctx = `{ tool, argv, listing, reader() }` (lib/modset header). Print with console / process.stdout as the CLI does: the
   worker's stdout and stderr are taken as a child program's would be.
4. Nothing in doctor, check or any table. Do not edit the linter's own tests; they must pass unchanged.

## Rules that keep the output identical

- Same parse of the same argv (doctor gives `ctx.argv` = the child's argument list). No `process.exit` on success.
- The text output must end with its `N findings` line: a run without it counts as incomplete and reruns as a program.
- Do not keep state in module globals that a second run in the same thread would see (one thread per run today, but keep it so).
- The thread adopts the pass's modtree scan of the mod folder (`modtree.adopt`), so `createSource` and `gameview` list the
  folder from it. If the linter walks the folder its own way, check the listing gives the same files (golden diff below).
  In a full check that scan is wouldload's (`--keep-out D` writes `D/listing.json`, doctor `--reuse-dir D` hands it to
  `pass({ listing })`): the mod is listed once per check. None by `D/END` or not a full scan of the folder: the pass lists it.
  `DOCTOR_RO_STATS=1` shows `"listing":"handed|scanned|none"`.
- Buffers from `take` are the linter's own copy (a SharedArrayBuffer is copied at take): fine to keep.

## Golden diff (before switching it on; save the old outputs FIRST, no git stash)

1. Snapshot the old tools: `git archive --format=tar -o <scratch>/old.tar HEAD tools`, unpack with `C:\Windows\System32\tar.exe`.
2. Own fixtures: `tools/doctor/test/readonce-test.js` compares each module form with its CLI (stdout and stderr byte for
   byte); add the linter to its `fx` list with a fixture that gives findings.
3. RobZ (read-only; one heavy run at a time): doctor with the check's arguments (an overlay game dir in scratch, junctions,
   as tools/check overlay()) from the old snapshot and from the new tree, read-once on and `--no-read-once`:
   `doctor.js <ov>/mods/<mod> -q --progress --out D --locs 1000000 --locs-json D.json -j 8 --cache-dir C --game <ov>`.
   Compare: report with `(Ns)`, `READ_ONCE`, `JOBS` lines and the notes count masked; every `D/<tool>.txt` byte for byte;
   `D.json` without `j`. Also the linter's CLI alone (old vs new) on RobZ.
4. Env for tests and runs: `ARSENAL_TMP=<temp folder>/<job> ARSENAL_CACHE=<temp folder>/<job>/cache`.

## Tests

- `sh tools/<t>/test/run.sh` unchanged, `sh tools/doctor/test/run.sh` (readonce-test.js: on vs --no-read-once,
  ARSENAL_READ_ONCE=0, forced failures, module form vs CLI), `node tools/lib/test/test.js` (modset.test.js),
  `sh tools/check/test/run.sh` when check output may move.
- Expected doctor test lines: readonce-test PASS; the `READ_ONCE on:` note names the new linter.

## The backup (owner rule)

- `--no-read-once` on doctor and check, or env `ARSENAL_READ_ONCE=0`: every linter as its own program, as before.
- Automatic: a linter whose in-pass run throws, exits, runs out of memory or gives an incomplete output reruns alone as a
  program after the pool, note `READ_ONCE fallback <tool>: <reason>`. Test hook `DOCTOR_TEST_RO_FAIL=<t>[:throw|oom|partial]`
  or `*` (the whole pass). `DOCTOR_RO_STATS=1` prints the pass's read stats on stderr.

## Memory and the plan

Each member is its own job of doctor's RAM plan (doctor/jobs.js): estimate = its lib/registry `mem` row without the 1.5 margin
(the row is the program's peak; in the pass the thread shares node, the listing and the store). The pass opens when the first
member starts and closes after the last. binhdr starts first. Bytes held by the store stay under 256 MB (+ the window in flight);
each reader's own reads under 64 MB not taken.

## Why (RO-E, RobZ, 11 linters, quiet PC; `DOCTOR_RO_STATS=<file>` gives these numbers)

- Before: the pass was ONE job, estimate 13.8 GB (sum of rows x 1.5) and weight 11 > `-j 8`, so nothing ran beside it and
  binhdr / mpsync / modinfo only started after it. Its real peak RSS was 4-5 GB.
- The linter threads were idle most of their time, waiting on reads: vfs 179 of 209 s, ialint 118 of 186 s; main thread busy
  10-20 % (not the limit). Reads took 63 ms each: the process's libuv pool (4 threads) was shared by the store and every
  thread's own reads, and the store held milint's map.net bytes (2.4 GB, only milint wants them) and bytes for slow readers, so
  at its cap read-ahead stopped for everyone.
- After (lazy hand-out, own reads, eviction, 16 libuv threads in doctor): pass alone 144 s -> 91 s, outputs byte-identical.
