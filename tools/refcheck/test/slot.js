// refcheck file cache (slot.js + the card1 table): each run gets a NEW --cache file, as a tools/check overlay run does. With the slot
// a repeat run parses only the changed files, and its stdout is byte-identical to --no-file-cache after every edit below (a model
// added / removed, an include fixed, a units card naming another vehicle, the vehicle added), for a mounted mod (--mods), a folder
// (--folder) and an overlay game folder (links to the install, a new one each run, as tools/check builds). ARSENAL_FILE_CACHE=0 = off.
//   usage: node slot.js <workdir>
// Author: Imperator_Aug (ARSENAL, ia-e5db9e5c)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const W = process.argv[2] || fs.mkdtempSync(path.join(process.env.ARSENAL_TMP || require('os').tmpdir(), 'refcheck-slot-'));
const R = path.join(W, 'slot'); fs.rmSync(R, { recursive: true, force: true });
const put = (k, lines) => { const p = path.join(R, k); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Array.isArray(lines) ? lines.join('\r\n') + '\r\n' : lines, 'latin1'); };
let bad = 0, n = 0;
const fail = m => { console.log('FAIL: ' + m); bad++; };
const A = path.join(R, 'game');
put('game/as64.exe', 'MZ');
put('game/resource/entity/base/base.def', ['{game_entity', '\t{Extension "base.mdl"}', '}']);
put('game/resource/set/multiplayer/units/base.set', ['{units', '\t{"card_v"', '\t\t{content "base ( crew )"}', '\t}', '}']);
const mod = root => {
  put(root + '/mod.info', ['{Mod', ' {Name "m"}', ' {MinGameVersion "3.262"}', ' {MaxGameVersion "3.262"}', '}']);
  put(root + '/resource/entity/u/u1.def', ['{game_entity', '\t{Extension "u1.mdl"}', '}']);
  put(root + '/resource/entity/u/shared.inc', ['{extender "nosuch_ext"}']);
  put(root + '/resource/entity/u/u2.def', ['{game_entity', '\t(include "shared.inc")', '}']);
  put(root + '/resource/set/multiplayer/units/ger.set', ['{units', '\t{"card_a"', '\t\t{content "veh_missing ( crew )"}', '\t}', '}']);
  put(root + '/resource/set/stuff/gun/k98', ['{"k98"', '\t{entity "veh_none"}', '}']);
};
mod('game/mods/m'); mod('fold');
const env0 = { ...process.env, ARSENAL_CACHE: path.join(R, 'store'), REFCHECK_TIME: '1', ARSENAL_FILE_CACHE: '' };
const one = (args, extra, env) => {
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'refcheck.js'), ...args, '--no-rc', '--cache', path.join(R, 'c' + (n++) + '.json'), ...extra], { encoding: 'utf8', env: { ...env0, ...env } });
  const p = /index: .*?parsed (\d+)/.exec(r.stderr || ''), s = /file cache: (slot used|slot empty|off|no slot)/.exec(r.stderr || '');
  return { out: r.stdout, status: r.status, parsed: p ? +p[1] : -1, slot: s ? s[1] : '?', err: r.stderr };
};
// run with the cache and with --no-file-cache: same stdout; slot state and parse count as wanted
const step = (what, args, wantSlot, wantParsed, env) => {
  const c = one(args, [], env), o = one(args, ['--no-file-cache'], env);
  if (c.status !== o.status || c.out !== o.out) fail(`${what}: stdout differs from --no-file-cache\n--- on\n${c.out}${c.err}\n--- off\n${o.out}`);
  if (o.slot !== 'off') fail(`${what}: --no-file-cache must say off: ${o.slot}`);
  if (wantSlot && c.slot !== wantSlot) fail(`${what}: slot ${c.slot}, want ${wantSlot}\n${c.err}`);
  if (wantParsed != null && c.parsed !== wantParsed) fail(`${what}: parsed ${c.parsed}, want ${wantParsed}`);
  return c;
};
const has = (r, re) => re.test(r.out);
for (const [label, args, root] of [['mounted', [A, '--mods', 'm'], 'game/mods/m'], ['folder', [A, '--folder', path.join(R, 'fold')], 'fold']]) {
  const f = step(label + ' first', args, 'slot empty');
  if (!has(f, /REF_MODEL_MISSING/) || !has(f, /EXTENDER_UNKNOWN/) || !has(f, /CARD_VEHICLE_MISSING.*veh_missing/)) fail(label + ': fixture findings missing\n' + f.out);
  step(label + ' repeat', args, 'slot used', 0);
  put(root + '/resource/entity/u/u1.mdl', ['{skeleton}']);
  const m = step(label + ' model added', args, 'slot used');
  if (/u1\.def:\d+: REF_MODEL_MISSING/.test(m.out)) fail(label + ': model added, still missing');
  put(root + '/resource/entity/u/shared.inc', ['{extender "cannon"}']);
  const i = step(label + ' include fixed', args, 'slot used');
  if (has(i, /EXTENDER_UNKNOWN/)) fail(label + ': include fixed, still EXTENDER_UNKNOWN');
  put(root + '/resource/set/multiplayer/units/ger.set', ['{units', '\t{"card_a"', '\t\t{content "veh_other ( crew )"}', '\t}', '}']);
  const u = step(label + ' card changed', args, 'slot used');
  if (!has(u, /veh_other/) || has(u, /veh_missing/)) fail(label + ': card changed, findings not following\n' + u.out);
  put(root + '/resource/entity/v/veh_other.def', ['{game_entity', '}']);
  const v = step(label + ' vehicle added', args, 'slot used', 1);
  if (has(v, /CARD_VEHICLE_MISSING.*veh_other/)) fail(label + ': vehicle added, card still missing');
  fs.rmSync(path.join(R, root, 'resource/entity/u/u1.mdl'));
  const d = step(label + ' model removed', args, 'slot used');
  if (!/u1\.def:\d+: REF_MODEL_MISSING/.test(d.out)) fail(label + ': model removed, not reported');
  step(label + ' repeat 2', args, 'slot used', 0);
  // a new .presets in a stuff dir (records do not note one that did not exist): the slot is not used, the next run uses it again
  put(root + '/resource/set/stuff/gun/.presets', ['(define "GUNX" {entity "veh_other"})']);
  step(label + ' .presets added', args, 'slot empty');
  step(label + ' repeat 3', args, 'slot used', 0);
}
// an overlay game folder per run (tools/check): links to the install's resource/ and the mod, its exe copied
const overlay = k => {
  const ov = path.join(R, 'ov' + k); fs.mkdirSync(path.join(ov, 'mods'), { recursive: true });
  fs.copyFileSync(path.join(A, 'as64.exe'), path.join(ov, 'as64.exe'));
  fs.symlinkSync(path.join(A, 'resource'), path.join(ov, 'resource'), 'junction');
  fs.symlinkSync(path.join(A, 'mods', 'm'), path.join(ov, 'mods', 'm'), 'junction');
  return ov;
};
const o1 = overlay(1), o2 = overlay(2);
step('overlay 1', [o1, '--mods', 'm'], null);
const o2r = step('overlay 2 (new game folder, same install)', [o2, '--mods', 'm'], 'slot used', 0);
put('game/mods/m/resource/entity/u/u3.def', ['{game_entity', '\t{Extension "u3.mdl"}', '}']);
const o3 = step('overlay 3 + a new def', [overlay(3), '--mods', 'm'], 'slot used', 1);
if (!/u3\.def:\d+: REF_MODEL_MISSING/.test(o3.out)) fail('overlay: new def not checked');
// off by env
const off = one([A, '--mods', 'm'], [], { ARSENAL_FILE_CACHE: '0' });
if (off.slot !== 'off' || off.out !== one([A, '--mods', 'm'], ['--no-file-cache']).out) fail('ARSENAL_FILE_CACHE=0: off, same stdout');
for (const k of [1, 2, 3]) for (const l of ['resource', 'mods/m']) try { fs.rmdirSync(path.join(R, 'ov' + k, l)); } catch (e) { /* gone */ }
if (!o2r) fail('overlay run');
if (!bad) { console.log('slot ok'); fs.rmSync(R, { recursive: true, force: true }); }
process.exit(bad ? 1 : 0);
