// test for tools/soedit/ops/animops.js + anim.js (CLI). Synthetic animations only, built here with newAnimation + anm.write.
// Run: node tools/soedit/ops/test/anim.test.js   (scratch: $ANIM_TEST_DIR or <tmp>/soedit-animops-test)  Last line: PASS anim ops (N)
// Author: Imperator_Aug (ARSENAL, ia-f8e573a7)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const anm = require('../../../lib/model/anm'), ops = require('../animops');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const CLI = path.join(__dirname, '..', 'anim.js'), SOEDIT = path.join(ROOT, 'tools', 'soedit', 'soedit.js');
const DIR = path.resolve(process.env.ANIM_TEST_DIR || path.join(os.tmpdir(), 'soedit-animops-test'));
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

let n = 0, bad = 0;
const ok = (c, msg) => { n++; if (!c) { bad++; console.log('FAIL ' + msg); } };
const run = (args, script = CLI) => { const r = cp.spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
const rd = f => anm.parse(fs.readFileSync(f));
const M = (o, b, f) => anm.matrixAt(o, b, f);
const near = (a, b, tol = 1e-4) => !!a && !!b && a.length === 12 && Array.from(a).every((v, i) => Math.abs(v - b[i]) <= tol);
const T = (x, y, z) => [1, 0, 0, 0, 1, 0, 0, 0, 1, x, y, z];
const RZ = (deg, t = [0, 0, 0]) => { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [c, s, 0, -s, c, 0, 0, 0, 1, ...t]; };
const notErr = (r, what) => { ok(!ops.isError(r), `${what}: ${r && r.error}`); return r; };
const vis = (o, bone) => ops.exportBone(o, { bone }).visible;

function base(version) {
  let o = notErr(ops.newAnimation(['root', 'arm', 'gun'], 10, [T(0, 0, 0), T(1, 2, 3), RZ(90)], version), 'newAnimation ' + version.toString(16));
  o = anm.setMatrix(o, 9, 'arm', T(11, 2, 3));
  o = anm.setMatrix(o, 5, 'root', RZ(30, [0, 0, 5]));
  return o;
}
const put = (name, o) => { const f = path.join(DIR, name); fs.writeFileSync(f, anm.write(o)); return f; };
const copy = (src, name) => { const f = path.join(DIR, name); fs.copyFileSync(src, f); return f; };

for (const V of [0x40000, 0x60000]) {
  const tag = 'v' + (V >> 16);
  const B = base(V), bf = put(`base-${tag}.anm`, B), bbytes = fs.readFileSync(bf);
  ok(rd(bf).version === V && rd(bf).frames === 10 && rd(bf).bones.length === 3, `${tag} base reads back`);
  const same = (f, what) => { const o = rd(f); ok(o.version === V, `${tag} ${what}: version kept (0x${o.version.toString(16)})`); ok(!o.error, `${tag} ${what}: no read error`); return o; };

  // reverse whole, twice -> original bytes
  let f = copy(bf, `rev-${tag}.anm`);
  ok(run(['reverse', f]).code === 0, `${tag} reverse exit 0`);
  let o = same(f, 'reverse');
  ok(near(M(o, 'arm', 0), M(B, 'arm', 9)) && near(M(o, 'root', 4), M(B, 'root', 5)), `${tag} reverse: frame 0 = old frame 9`);
  ok(fs.existsSync(f + '.bak') && fs.readFileSync(f + '.bak').equals(bbytes), `${tag} reverse: .bak holds the original`);
  ok(run(['reverse', f]).code === 0, `${tag} reverse twice exit 0`);
  ok(fs.readFileSync(f).equals(bbytes), `${tag} reverse twice gives the original bytes`);
  ok(fs.readFileSync(f + '.bak').equals(bbytes), `${tag} .bak not overwritten by the second write`);

  // reverse a range
  f = copy(bf, `revr-${tag}.anm`);
  ok(run(['reverse', f, '--from', '2', '--to', '6']).code === 0, `${tag} reverse range exit 0`);
  o = same(f, 'reverse range');
  ok(near(M(o, 'arm', 2), M(B, 'arm', 6)) && near(M(o, 'root', 6), M(B, 'root', 2)) && near(M(o, 'root', 5), M(B, 'root', 3)), `${tag} reverse range swaps 2..6`);
  ok(near(M(o, 'arm', 8), M(B, 'arm', 8)) && near(M(o, 'root', 1), M(B, 'root', 1)), `${tag} reverse range leaves frames outside alone`);

  // fill: keys 2 = identity, 4 = junk, 6 = RZ90 at z 8 -> frame 4 = RZ45 at z 4
  let F = anm.setMatrix(B, 2, 'gun', T(0, 0, 0)); F = anm.setMatrix(F, 4, 'gun', T(100, 0, 0)); F = anm.setMatrix(F, 6, 'gun', RZ(90, [0, 0, 8]));
  f = put(`fill-${tag}.anm`, F);
  ok(run(['fill', f, '--bone', 'gun', '--from', '2', '--to', '6']).code === 0, `${tag} fill exit 0`);
  o = same(f, 'fill');
  ok(near(M(o, 'gun', 4), RZ(45, [0, 0, 4])), `${tag} fill midpoint = slerp 45 deg, z 4: ${Array.from(M(o, 'gun', 4) || []).map(v => v.toFixed(4))}`);
  ok(near(M(o, 'gun', 2), T(0, 0, 0)) && near(M(o, 'gun', 6), RZ(90, [0, 0, 8])), `${tag} fill keeps the end keys`);
  ok(near(M(o, 'arm', 4), M(F, 'arm', 4)), `${tag} fill leaves other bones`);

  // insert-frame: 2 copies of frame 3
  f = copy(bf, `ins-${tag}.anm`);
  ok(run(['insert-frame', f, '--at', '3', '--count', '2']).code === 0, `${tag} insert exit 0`);
  o = same(f, 'insert');
  ok(o.frames === 12 && near(M(o, 'root', 4), M(B, 'root', 3)) && near(M(o, 'root', 5), M(B, 'root', 3)) && near(M(o, 'root', 6), M(B, 'root', 4)), `${tag} insert: copies of frame 3, later frames shift`);

  // delete-frames 2..3
  f = copy(bf, `del-${tag}.anm`);
  ok(run(['delete-frames', f, '--from', '2', '--to', '3']).code === 0, `${tag} delete exit 0`);
  o = same(f, 'delete');
  ok(o.frames === 8 && near(M(o, 'root', 2), M(B, 'root', 4)) && near(M(o, 'arm', 7), M(B, 'arm', 9)), `${tag} delete shifts later frames down`);

  // duplicate 1..2
  f = copy(bf, `dup-${tag}.anm`);
  ok(run(['duplicate', f, '--from', '1', '--to', '2']).code === 0, `${tag} duplicate exit 0`);
  o = same(f, 'duplicate');
  ok(o.frames === 12 && near(M(o, 'root', 3), M(B, 'root', 1)) && near(M(o, 'root', 4), M(B, 'root', 2)) && near(M(o, 'root', 5), M(B, 'root', 3)), `${tag} duplicate places copies after the block`);

  // move 1..2 to start at 5
  f = copy(bf, `mov-${tag}.anm`);
  ok(run(['move', f, '--from', '1', '--to', '2', '--at', '5']).code === 0, `${tag} move exit 0`);
  o = same(f, 'move');
  ok(o.frames === 10 && near(M(o, 'root', 5), M(B, 'root', 1)) && near(M(o, 'root', 6), M(B, 'root', 2)) && near(M(o, 'root', 1), M(B, 'root', 3)) && near(M(o, 'root', 4), M(B, 'root', 6)), `${tag} move permutes frames`);

  // copy-forward arm frame 2 to the next 3
  f = copy(bf, `cpf-${tag}.anm`);
  ok(run(['copy-forward', f, '--bone', 'arm', '--at', '2', '--count', '3']).code === 0, `${tag} copy-forward exit 0`);
  o = same(f, 'copy-forward');
  ok([3, 4, 5].every(k => near(M(o, 'arm', k), M(B, 'arm', 2))) && near(M(o, 'arm', 6), M(B, 'arm', 6)) && near(M(o, 'root', 4), M(B, 'root', 4)), `${tag} copy-forward copies 3 frames only`);

  // drop-first-frame twice drops exactly two
  f = copy(bf, `drop-${tag}.anm`);
  ok(run(['drop-first-frame', f]).code === 0 && run(['drop-first-frame', f]).code === 0, `${tag} drop-first-frame exit 0 twice`);
  o = same(f, 'drop-first-frame');
  // 2e-3: re-keying an in-between frame re-times the engine's half-angle slerp (see animops header)
  ok(o.frames === 8 && near(M(o, 'root', 0), M(B, 'root', 2), 2e-3) && near(M(o, 'arm', 7), M(B, 'arm', 9)), `${tag} drop-first-frame twice drops exactly 2 frames (${o.frames})`);

  // clone-bone
  f = copy(bf, `clone-${tag}.anm`);
  ok(run(['clone-bone', f, '--bone', 'arm']).code === 0, `${tag} clone exit 0`);
  o = same(f, 'clone');
  ok(o.bones[3] === 'arm_Clone_0' && [0, 4, 9].every(k => near(M(o, 3, k), M(B, 'arm', k))), `${tag} clone copies the track under arm_Clone_0`);

  // rename-bone
  f = copy(bf, `ren-${tag}.anm`);
  ok(run(['rename-bone', f, '--bone', 'gun', '--name', 'barrel']).code === 0, `${tag} rename exit 0`);
  o = same(f, 'rename');
  ok(o.bones.join() === 'root,arm,barrel' && near(M(o, 'barrel', 3), M(B, 'gun', 3)), `${tag} rename`);
  ok(run(['rename-bone', f, '--bone', 'barrel', '--name', 'ARM']).code === 1, `${tag} rename to a clashing name refused`);

  // reset-bone: to frame 0, and to a given matrix
  f = copy(bf, `reset-${tag}.anm`);
  ok(run(['reset-bone', f, '--bone', 'arm']).code === 0, `${tag} reset exit 0`);
  o = same(f, 'reset');
  ok([0, 5, 9].every(k => near(M(o, 'arm', k), M(B, 'arm', 0))) && near(M(o, 'root', 5), M(B, 'root', 5)), `${tag} reset to frame 0 over the whole track`);
  ok(run(['reset-bone', f, '--bone', 'arm', '--matrix', T(7, 8, 9).join(',')]).code === 0 && near(M(rd(f), 'arm', 6), T(7, 8, 9)), `${tag} reset to a given matrix`);

  // add-bone / remove-bone index 0
  f = copy(bf, `add-${tag}.anm`);
  ok(run(['add-bone', f, '--name', 'extra']).code === 0, `${tag} add exit 0`);
  o = same(f, 'add');
  ok(o.bones.length === 4 && near(M(o, 'extra', 5), T(0, 0, 0)), `${tag} add-bone keyed at identity`);
  f = copy(bf, `rm-${tag}.anm`);
  ok(run(['remove-bone', f, '--bone', '0']).code === 0, `${tag} remove index 0 exit 0`);
  o = same(f, 'remove');
  ok(o.bones.join() === 'arm,gun' && near(M(o, 'arm', 9), M(B, 'arm', 9)) && near(M(o, 'gun', 0), M(B, 'gun', 0)), `${tag} remove-bone index 0`);

  // set-visibility gun 3..5 hidden, then whole reverse mirrors it, delete keeps the state
  f = copy(bf, `vis-${tag}.anm`);
  ok(run(['set-visibility', f, '--bone', 'gun', '--from', '3', '--to', '5', '--visible', '0']).code === 0, `${tag} set-visibility exit 0`);
  o = same(f, 'set-visibility');
  let v = vis(o, 'gun');
  ok(v[2] !== false && v[3] === false && v[5] === false && v[6] === true && vis(o, 'arm').every(x => x !== false), `${tag} visibility 3..5 hidden: ${JSON.stringify(v)}`);
  const vf = copy(f, `vis2-${tag}.anm`);
  ok(run(['reverse', vf]).code === 0, `${tag} reverse with visibility exit 0`);
  v = vis(rd(vf), 'gun');
  ok(v[3] !== false && v[4] === false && v[6] === false && v[7] !== false, `${tag} reverse mirrors visibility: ${JSON.stringify(v)}`);
  ok(run(['delete-frames', f, '--from', '3']).code === 0, `${tag} delete with visibility exit 0`);
  v = vis(rd(f), 'gun');
  ok(rd(f).frames === 9 && v[2] !== false && v[3] === false && v[4] === false && v[5] !== false, `${tag} delete keeps the visibility state: ${JSON.stringify(v)}`);

  // --dry leaves the bytes alone
  f = copy(bf, `dry-${tag}.anm`);
  const dr = run(['reverse', f, '--dry', '--json']);
  ok(dr.code === 0 && fs.readFileSync(f).equals(bbytes) && !fs.existsSync(f + '.bak'), `${tag} --dry writes nothing`);
  try { const j = JSON.parse(dr.out); ok(j.ok === true && j.frames === 10 && j.version === V && j.changed.length > 0, `${tag} --dry --json reports the change`); } catch (e) { ok(false, `${tag} --dry --json is JSON: ${e.message}`); }

  // --out leaves the source alone
  f = copy(bf, `out-${tag}.anm`);
  const of = path.join(DIR, `out-${tag}-new.anm`);
  ok(run(['insert-frame', f, '--at', '0', '--out', of]).code === 0 && fs.readFileSync(f).equals(bbytes) && rd(of).frames === 11, `${tag} --out writes elsewhere`);
}

// export from version 6, import into version 4
{
  const b6 = path.join(DIR, 'base-v6.anm'), b4 = copy(path.join(DIR, 'base-v4.anm'), 'imp-v4.anm'), tj = path.join(DIR, 'arm-track.json');
  const B6 = rd(b6);
  ok(run(['export-bone', b6, '--bone', 'arm', '--track', tj]).code === 0 && fs.existsSync(tj), 'export-bone writes the track');
  const tr = JSON.parse(fs.readFileSync(tj, 'utf8'));
  ok(tr.bone === 'arm' && tr.frames === 10 && tr.sourceVersion === 0x60000 && tr.matrices.length === 10, 'track JSON shape');
  ok(run(['import-bone', b4, '--track', tj]).code === 0, 'import-bone exit 0');
  const o = rd(b4);
  ok(o.version === 0x40000 && o.bones.join() === 'root,arm,gun,arm_0', `import into v4 keeps the version, renames the clash: ${o.bones}`);
  ok([0, 3, 7, 9].every(k => near(M(o, 'arm_0', k), M(B6, 'arm', k))), 'imported track matches the v6 source');
  // a longer track extends the animation
  const long = ops.newAnimation(['x'], 12, [T(1, 1, 1)], 0x60000);
  const r = ops.importBone(rd(b4), ops.exportBone(long, { bone: 'x' }), { name: 'xx' });
  ok(!ops.isError(r) && r.frames === 12 && near(M(r, 'xx', 11), T(1, 1, 1)), 'import of a longer track repeats the last frame');
}

// pure-function errors (no throw)
{
  const o = rd(path.join(DIR, 'base-v6.anm'));
  const errs = [ops.fill(o, { bone: 'arm', from: 5, to: 5 }), ops.deleteFrames(o, { from: 0, to: 9 }), ops.reverse(o, { from: 3, to: 20 }),
    ops.copyForward(o, { bone: 'nope', at: 1 }), ops.insertFrame(o, { at: -1 }), ops.removeBone(ops.newAnimation(['a'], 2), { bone: 0 }),
    ops.newAnimation(['a', 'A'], 2), ops.newAnimation(['a'], 2, null, 0x70000), ops.addBone(o, { name: 'arm' }), ops.importBone(o, { matrices: [[1, 2]] })];
  errs.forEach((e, i) => ok(ops.isError(e) && typeof e.error === 'string', `bad input ${i} returns { error }`));
  ok(o.frames === 10 && anm.write(o).equals(fs.readFileSync(path.join(DIR, 'base-v6.anm'))), 'ops do not change their input');
  const inf = ops.info(o);
  ok(!ops.isError(inf) && inf.frames === 10 && inf.bones.length === 3 && inf.version === 0x60000 && inf.keyed.length === 3, 'info');
}

// writes into a game install are refused
{
  const game = path.join(DIR, 'fakegame');
  fs.mkdirSync(path.join(game, 'resource'), { recursive: true });
  fs.writeFileSync(path.join(game, 'mowas_2.exe'), '');
  const inGame = copy(path.join(DIR, 'base-v6.anm'), path.join('fakegame', 'resource', 'x.anm'));
  const before = fs.readFileSync(inGame);
  const r1 = run(['reverse', inGame]);
  ok(r1.code === 1 && fs.readFileSync(inGame).equals(before) && !fs.existsSync(inGame + '.bak'), `write into a game install refused: ${r1.out.trim()}`);
  const tgt = path.join(game, 'resource', 'y.anm');
  ok(run(['reverse', path.join(DIR, 'base-v6.anm'), '--out', tgt]).code === 1 && !fs.existsSync(tgt), '--out into a game install refused');
  ok(run(['info', inGame]).code === 0, 'info inside a game install is fine (reads only)');
}

// CLI: usage, bad input, soedit.js dispatch
{
  const f = path.join(DIR, 'base-v6.anm');
  ok(run([]).code === 2 && run(['frobnicate', f]).code === 2 && run(['reverse', f, '--bogus']).code === 2, 'usage errors exit 2');
  ok(run(['fill', f, '--bone', 'arm', '--from', '6', '--to', '2']).code === 1, 'bad range exits 1');
  ok(run(['new', f, '--bones', 'a']).code === 1, 'new refuses to replace an existing file');
  const nf = path.join(DIR, 'new-v4.anm');
  ok(run(['new', nf, '--bones', 'a,b', '--count', '5', '--version', '0x40000']).code === 0 && rd(nf).version === 0x40000 && rd(nf).frames === 5, 'new writes a version 4 animation');
  const r = run(['ops', 'anim', 'info', '--json', f], SOEDIT);
  try { const j = JSON.parse(r.out); ok(r.code === 0 && j.ok && j.frames === 10 && j.version === 0x60000 && j.bones.length === 3, 'soedit.js ops anim info --json'); } catch (e) { ok(false, 'soedit.js ops anim info --json gives JSON: ' + r.out.slice(0, 200)); }
  const r2 = run(['ops', 'anim', 'info', f, '--json'], SOEDIT);
  let canon = false; try { canon = JSON.parse(r2.out).ok === true; } catch (e) { /* reported below */ }
  ok(canon && r2.code === 0, 'soedit.js ops anim info <file> --json (flag last): ' + (canon ? 'ok' : r2.out.trim().slice(0, 120)));
  const d = run(['reverse', copy(f, 'cli-rev.anm'), '--json']);
  try { const j = JSON.parse(d.out); ok(j.ok && j.operation === 'reverse' && Array.isArray(j.changed) && j.error === null, 'reverse --json shape'); } catch (e) { ok(false, 'reverse --json is JSON'); }
}

if (bad) { console.log(`FAIL anim ops: ${bad} of ${n} checks failed`); process.exitCode = 1; }
else console.log(`PASS anim ops (${n})`);
