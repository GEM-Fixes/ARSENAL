// sdllint file cache (filecache.js): a repeat run reads only the roots whose file, includes (mod, game, missing ones, the stuff
// .presets) or game changed, and its stdout is byte-identical to a run with --no-file-cache after every edit below, on one thread
// and on worker threads, for a folder beside a game and for a mod mounted with --mods. Off: --no-file-cache, ARSENAL_FILE_CACHE=0.
// Author: Imperator_Aug (ARSENAL, ia-dcddd97b)
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const w = fs.mkdtempSync(path.join(process.env.ARSENAL_TMP || os.tmpdir(), 'sdllint-fc-'));
const tool = path.join(__dirname, '..', 'sdllint.js');
try {
  const put = (f, s) => { fs.mkdirSync(path.dirname(path.join(w, f)), { recursive: true }); fs.writeFileSync(path.join(w, f), s); };
  const G = path.join(w, 'g');
  put('g/resource/set/base.set', '(define "mm" {v 1})\r\n');
  put('g/resource/entity/inc/game.inc', '(define "GAME_DEF" {g 1})\r\n');
  // a mod folder beside the game: roots that include a mod file, a game file, a missing file; a stuff dir; 450 plain roots (workers)
  const mod = (root, n) => {
    put(root + '/mod.info', '{Mod\r\n {Name "m"}\r\n {MinGameVersion "3.262"}\r\n {MaxGameVersion "3.262"}\r\n}\r\n');
    put(root + '/resource/entity/a/shared.inc', '(define "SH" {s 1})\r\n');
    for (let i = 0; i < 6; i++) put(root + '/resource/entity/a/u' + i + '.def', '(include "shared.inc")\r\n{game_entity\r\n\t(SH)\r\n}\r\n');
    put(root + '/resource/entity/b/g.def', '(include "/entity/inc/game.inc")\r\n{game_entity\r\n\t(GAME_DEF)\r\n}\r\n');
    put(root + '/resource/entity/b/miss.def', '(include "later.inc")\r\n{game_entity\r\n\t(LATER)\r\n}\r\n');
    put(root + '/resource/set/stuff/rifle/k98', '{from "rifle"}\r\n{x %P}\r\n');
    for (let i = 0; i < n; i++) put(root + '/resource/entity/many/e' + i + '.def', i % 7 === 0 ? '{game_entity\r\n\t{x 1\r\n' : '{game_entity\r\n}\r\n');
  };
  mod('m', 450);
  const M = path.join(w, 'm');
  const env0 = { ...process.env, ARSENAL_CACHE: path.join(w, 'cache'), ARSENAL_PROGRESS: '', ARSENAL_FILE_CACHE: '' };
  const run = (dir, extra, env) => {
    const r = spawnSync(process.execPath, [tool, dir, '--game', G, '--no-rc', '--time', ...extra], { encoding: 'utf8', env: { ...env0, ...env } });
    const m = /file cache: (\d+) roots kept, (\d+) read/.exec(r.stderr || '');
    return { out: (r.stdout || '').replace(/ in \d+ ms/, ''), status: r.status, kept: m ? +m[1] : -1, read: m ? +m[2] : -1, off: /file cache: off/.test(r.stderr || ''), err: r.stderr };
  };
  // one check: cache run = no-cache run; kept/read as expected (read = what must be read again)
  const step = (what, dir, extra, wantRead, env) => {
    const c = run(dir, extra, env), n = run(dir, [...extra, '--no-file-cache'], env);
    ok(c.status === n.status && c.out === n.out, `${what}: stdout differs from --no-file-cache\n--- cache\n${c.out.slice(0, 1500)}\n--- off\n${n.out.slice(0, 1500)}\n${c.err.slice(0, 500)}`);
    if (wantRead != null) ok(c.read === wantRead, `${what}: read ${c.read} roots, want ${wantRead} (kept ${c.kept})`);
    ok(n.off, `${what}: --no-file-cache says off`);
    return c;
  };
  const T1 = { SDLLINT_THREADS: '1' }, T3 = { SDLLINT_THREADS: '3' };
  const first = step('first run', M, [], null, T3);
  ok(first.kept === 0 && first.read > 450, 'first run reads every root: ' + first.kept + ' / ' + first.read);
  step('repeat, nothing changed', M, [], 0, T3);
  step('repeat, one thread', M, [], 0, T1);
  // an include of 6 roots changes: those 6 and the include itself (a root too) are read again
  put('m/resource/entity/a/shared.inc', '(define "SH" {s 1})\r\n{broken\r\n');
  step('mod include changed', M, [], 7, T3);
  // the missing include appears: the root that named it is read again (and the new file)
  put('m/resource/entity/b/later.inc', '(define "LATER" {l 1})\r\n');
  step('missing include added', M, [], 2, T3);
  // a game file a root includes
  put('g/resource/entity/inc/game.inc', '(define "GAME_DEF" {g 2})\r\n(define "MORE" {x 1})\r\n');
  step('game include changed', M, [], 1, T1);
  // a mod file now shadows that game include (same key): the includer resolves to the mod layer
  put('m/resource/entity/inc/game.inc', '(define "GAME_DEF" {broken\r\n');
  step('mod file shadows a game include', M, [], 2, T3);
  // the loader adds the stuff dir's .presets to every stuff file: a new .presets re-reads the stuff file
  put('m/resource/set/stuff/rifle/.presets', '(define "P" 1)\r\n');
  step('stuff .presets added', M, [], 2, T1);
  // a root's mtime only
  const e3 = path.join(M, 'resource/entity/many/e3.def'), st = fs.statSync(e3);
  fs.utimesSync(e3, st.atime, new Date(st.mtimeMs + 5000));
  step('root touched', M, [], 1, T3);
  // a root deleted, a root added
  fs.rmSync(path.join(M, 'resource/entity/many/e5.def')); put('m/resource/entity/many/new.def', '{game_entity\r\n\t{x\r\n');
  step('root deleted + added', M, [], 1, T3);
  // the include removed again: its includers are read again and report it missing
  fs.rmSync(path.join(M, 'resource/entity/b/later.inc'));
  step('include deleted', M, [], 1, T3);
  // a fragment judged through its game-side includer (findIncluders: include targets of vfs files, kept per file): the includer
  // stops defining the macro -> the fragment's MACRO_UNDEFINED shows; the includer's targets come from the cache when unchanged
  put('g/resource/set/mp/host.set', '(define "FRAGMAC" {m 1})\r\n(include "frag.inc")\r\n');
  put('m/resource/set/mp/frag.inc', '("FRAGMAC")\r\n');
  const f1 = step('fragment + game includer', M, [], 1, T1);
  step('fragment, repeat', M, [], 0, T1);
  put('g/resource/set/mp/host.set', '(define "OTHER" {m 1})\r\n(include "frag.inc")\r\n');
  const f2 = step('game includer changed', M, [], 0, T1);
  ok(f1.out !== f2.out && /frag\.inc/.test(f2.out), 'includer change must change the fragment finding:\n' + f2.out);
  // an OBJ-style .mtl (its OBJ test kept with the root) and the .ply that names it (read live)
  put('m/resource/model/x/a.mtl', 'newmtl foo\r\n{bad\r\n');
  put('m/resource/model/x/a.ply', Buffer.from([0, 1, 2, 3]));
  const m1 = step('OBJ .mtl, no .ply names it', M, [], 1, T1);   // (a .ply is no SDL root)
  put('m/resource/model/x/a.ply', Buffer.concat([Buffer.from([0, 1]), Buffer.from('a.mtl')]));
  const m2 = step('.ply now names the .mtl', M, [], 0, T1);
  ok(m1.out !== m2.out, '.ply edit must change the .mtl finding');
  put('m/resource/model/x/a.mtl', '{material\r\n\t{bad\r\n}\r\n');
  step('.mtl now SDL', M, [], 1, T1);
  // off by env: every root read, same stdout
  const offE = run(M, [], { ...T3, ARSENAL_FILE_CACHE: '0' });
  ok(offE.off && offE.out === run(M, ['--no-file-cache'], T3).out, 'ARSENAL_FILE_CACHE=0: off, same stdout');
  // a cache entry that does not read (damaged value) = read as before
  const store = path.join(w, 'cache');
  const vals = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name === 'value.json') vals.push(p); } })(store);
  ok(vals.length >= 1, 'cache entries in the store: ' + vals.length);
  for (const v of vals) fs.writeFileSync(v, '{"format":1,"keys":[');
  const dmg = step('damaged cache entry', M, [], null, T3);
  ok(dmg.kept === 0, 'a damaged entry is not used: kept ' + dmg.kept);
  step('after damage, repeat', M, [], 0, T3);
  // a mod mounted from <game>/mods (--mods): the same rules
  mod('g/mods/m', 40);
  const GM = path.join(G, 'mods', 'm');
  step('mounted: first', GM, ['--mods', 'm'], null, T1);
  step('mounted: repeat', GM, ['--mods', 'm'], 0, T1);
  put('g/mods/m/resource/entity/a/shared.inc', '(define "SH" {s 3})\r\n');
  step('mounted: include changed', GM, ['--mods', 'm'], 7, T1);
} finally { fs.rmSync(w, { recursive: true, force: true }); }
if (!bad) console.log('filecache ok');
process.exit(bad ? 1 : 0);
