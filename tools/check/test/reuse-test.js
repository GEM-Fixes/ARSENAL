// X1 whole-check reuse (lib/checkcache): a repeat check of an unchanged mod replays the stored report, JSON and exit code with a
// last line NOTE REUSED_CHECK; a changed mod file (content, mtime, a new file, a pak), game file, required mod, argument or env
// runs the check again and gives the same output as a run with reuse off. Run on a scratch COPY of fixture m1 (outside mods/:
// overlay) and on a scratch mod under the fixture game (in place, with a Require). The store is a scratch one (ARSENAL_CACHE).
// Other sessions editing tools/ while this runs change the tools signature (a correct miss): each pair is retried a few times.
// Author: Imperator_Aug (ARSENAL, ia-70495dc4)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const HERE = __dirname, CHECK = path.join(HERE, '..', 'check.js'), G = path.join(HERE, 'fx', 'game');
const tmp = fs.mkdtempSync(path.join(process.env.ARSENAL_TMP || os.tmpdir(), 'reuse-'));
const env0 = { ...process.env, ARSENAL_CACHE: path.join(tmp, 'cache'), CHECK_REUSE_DEBUG: '1' };
delete env0.ARSENAL_CHECK_REUSE; delete env0.CHECK_TEST_ARGS;
let bad = 0, n = 0, runs = 0;
const ok = (c, what) => { n++; if (!c) { bad++; console.log('FAIL ' + what); } };
function run(mod, args = [], env = {}) {
  const jf = path.join(tmp, 'o' + (runs++) + '.json');
  const r = cp.spawnSync(process.execPath, [CHECK, mod, '--game', G, '--exe', 'mowas2', ...args, '--json', jf], { encoding: 'utf8', env: { ...env0, ...env } });
  let json = null; try { json = fs.readFileSync(jf, 'utf8'); } catch (e) { /* none */ }
  return { out: r.stdout, err: r.stderr, code: r.status, json, stored: /^REUSE stored/m.test(r.stderr), reused: /^NOTE REUSED_CHECK /m.test(r.stdout) };
}
const NOTE = /\nNOTE REUSED_CHECK [^\n]*\n$/;
// a JSON of the same run, apart from the overlay's temp folder (a new one each run, also before reuse) and the reuse key
const jnorm = j => { const J = JSON.parse(j); delete J.reusedCheck; if (J.mod && /check-ov-/.test(J.mod)) J.mod = '<overlay>'; return JSON.stringify(J, null, 1); };
// first run stores, second replays: retried while other sessions change tools/ under the run
function pair(mod, args = [], env = {}) {
  let why = '';
  for (let i = 0; i < 8; i++) {
    const a = run(mod, args, env);
    if (a.reused) { const b = a; return [{ ...b, out: b.out.replace(NOTE, '\n'), json: JSON.stringify(JSON.parse(b.json), (k, v) => (k === 'reusedCheck' ? undefined : v), 1) }, b]; }   // stored by the run before
    if (!a.stored) { why = (/^REUSE .*/m.exec(a.err) || ['no REUSE line'])[0].slice(0, 300); continue; }
    const b = run(mod, args, env);
    if (b.reused) return [a, b];
    why = 'second run not reused';
  }
  console.log('pair: ' + why);
  return [null, null];
}
function same(a, b, what) {
  ok(a.out === b.out, what + ': stdout differs\n--- a\n' + a.out + '\n--- b\n' + b.out);
  ok(a.code === b.code, what + ': exit code ' + a.code + ' vs ' + b.code);
  ok(a.json && b.json && jnorm(a.json) === jnorm(b.json), what + ': json differs');
}

// 1. overlay: copy of m1 outside mods/
const m = path.join(tmp, 'w', 'm1');
fs.cpSync(path.join(G, 'mods', 'm1'), m, { recursive: true });
let [a, b] = pair(m);
ok(a && b, 'overlay: no stored run replayed (5 tries)');
if (a && b) {
  ok(!a.reused, 'first run said reused');
  ok(NOTE.test(b.out) && b.out.replace(NOTE, '\n') === a.out, 'replay: stdout is the stored one + one NOTE REUSED_CHECK last line');
  ok(b.code === a.code, 'replay: exit code');
  ok(JSON.parse(b.json).reusedCheck && jnorm(b.json) === jnorm(a.json), 'replay: json is the stored one + reusedCheck');
  ok(JSON.stringify(JSON.parse(b.json), (k, v) => (k === 'reusedCheck' ? undefined : v), 1) === a.json, 'replay: json bytes, reusedCheck aside');
  const off = run(m, ['--no-reuse']);
  ok(!off.reused && !off.stored, '--no-reuse: reused or stored');
  same(a, off, 'reuse vs --no-reuse (first run)');
  const e0 = run(m, [], { ARSENAL_CHECK_REUSE: '0' });
  ok(!e0.reused && !e0.stored, 'ARSENAL_CHECK_REUSE=0: reused or stored');
  ok(!run(m, ['--only', 'modinfo']).reused, 'other arguments: reused');
  ok(!run(m, [], { ARSENAL_READ_WINDOW: '7' }).reused, 'other env: reused');
  const j2 = run(m, ['--plain']);
  ok(!j2.reused, '--plain: reused the full report');
}
// 2. invalidation: each change runs again and equals a reuse-off run of the changed copy
const lng = path.join(m, 'localization', 'desc.lng');
const changes = [
  ['content edit', () => fs.appendFileSync(lng, '\r\n')],
  ['mtime only', () => { const t = new Date(Date.now() + 5000); fs.utimesSync(lng, t, t); }],
  ['new file', () => fs.writeFileSync(path.join(m, 'resource', 'entity', 'm1', 'extra.def'), '{game_entity\r\n}\r\n')],
  ['new pak', () => fs.copyFileSync(path.join(G, 'mods', 'm2', 'resource.pak'), path.join(m, 'resource.pak'))],
  ['restore point', () => { fs.mkdirSync(path.join(m, '.arsenal-undo', 't1'), { recursive: true }); fs.writeFileSync(path.join(m, '.arsenal-undo', 't1', 'x.txt'), 'x'); }],
  ['file removed', () => fs.rmSync(path.join(m, 'resource', 'entity', 'm1', 'extra.def'), { force: true })],
];
for (const [what, change] of changes) {
  [a, b] = pair(m);
  if (!a) { ok(false, what + ': no stored run before the change'); continue; }
  change();
  const r = run(m), off = run(m, ['--no-reuse']);
  ok(!r.reused, what + ': reused after the change');
  same(r, off, what + ': run after the change vs --no-reuse');
}
ok(/RESTORE_POINTS left out/.test(run(m, ['--no-reuse']).out), 'restore point change: fixture lost its note');
// 3. the game: a game file's mtime moves (fixture game, rebuilt by mkfixture each run)
[a, b] = pair(m);
ok(!!a, 'game: no stored run');
{ const gf = path.join(G, 'localization', 'desc.lng'), t = new Date(Date.now() + 7000); fs.utimesSync(gf, t, t); }
ok(!run(m).reused, 'game file changed: reused');
// 4. in place under <game>/mods with a Require: a change in the required mod runs again
// scratch mods m9 (the mod) and m8 (a copy of m3 it requires), removed after: the fixture's own mods are never written
const ip = path.join(G, 'mods', 'm9'), dep = path.join(G, 'mods', 'm8');
fs.cpSync(path.join(G, 'mods', 'm1'), ip, { recursive: true });
fs.cpSync(path.join(G, 'mods', 'm3'), dep, { recursive: true });
fs.writeFileSync(path.join(ip, 'mod.info'), fs.readFileSync(path.join(ip, 'mod.info'), 'latin1').replace(/\r?\n}\s*$/, '\r\n\t{Require "m8"}\r\n}\r\n'), 'latin1');
try {
  [a, b] = pair(ip);
  ok(a && b && /^MODE in-place/m.test(a.out), 'in place: no stored run replayed');
  if (a && b) ok(b.out.replace(NOTE, '\n') === a.out && b.code === a.code, 'in place: replay differs');
  const df = path.join(dep, 'localization', '#base.lng');
  fs.appendFileSync(df, '\r\n');
  const r = run(ip), off = run(ip, ['--no-reuse']);
  ok(!r.reused, 'required mod changed: reused');
  same(r, off, 'required mod changed: vs --no-reuse');
  [a, b] = pair(ip);
  fs.writeFileSync(path.join(G, 'mods', 'zz-new.txt'), 'x');
  ok(!run(ip).reused, 'new entry in <game>/mods: reused');
} finally { for (const d of [ip, dep, path.join(G, 'mods', 'zz-new.txt')]) fs.rmSync(d, { recursive: true, force: true }); }
// 5. a run that is not stored: an error (a hung pass stopped by --pass-limit) is never replayed
{
  const h1 = run(m, ['--pass-limit', '3'], { WOULDLOAD_TEST_HANG: 'sdllint' });
  ok(!h1.stored, 'a stopped pass was stored');
  ok(!run(m, ['--pass-limit', '3'], { WOULDLOAD_TEST_HANG: 'sdllint' }).reused, 'a stopped pass was replayed');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `reuse-test: ${bad} of ${n} FAILED` : `reuse-test: ${n} ok`);
process.exit(bad ? 1 : 0);
