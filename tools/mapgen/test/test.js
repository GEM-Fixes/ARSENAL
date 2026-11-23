// mapgen test: a made-up tiny height image and masks, no install. Run through run.sh; prints one line per failure.
// Author: Imperator_Aug (ARSENAL, ia-435ff359)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const root = path.join(__dirname, '..', '..', '..');
const mapnet = require('../../lib/mapnet'), M = require('../mapgen.js');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'mapgen-'));
let fails = 0;
const bad = m => { console.log('FAIL ' + m); fails++; };
const run = (...a) => spawnSync(process.execPath, [path.join(root, 'tools/mapgen/mapgen.js'), ...a, '-q'], { encoding: 'utf8' });
const pgm16 = (w, h, f) => { const b = Buffer.alloc(w * h * 2); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b.writeUInt16BE(Math.round(f(x, y) * 65535), (y * w + x) * 2); return Buffer.concat([Buffer.from(`P5\n# fixture\n${w} ${h}\n65535\n`), b]); };
const pgm8 = (w, h, f) => { const b = Buffer.alloc(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b[y * w + x] = f(x, y) ? 255 : 0; return Buffer.concat([Buffer.from(`P5\n${w} ${h}\n255\n`), b]); };

// height: rises with x and with y, never symmetric, so a mirrored mesh shows
const W = 61, H = 67, hf = (x, y) => (x / (W - 1)) * 0.6 + (y / (H - 1)) * 0.4;
const hp = path.join(T, 'h.pgm'); fs.writeFileSync(hp, pgm16(W, H, hf));
const L = path.join(T, 'layers'); fs.mkdirSync(L);
fs.writeFileSync(path.join(L, 'sand.pgm'), pgm8(10, 10, x => x < 3));          // west = sand
fs.writeFileSync(path.join(L, 'road.pgm'), pgm8(10, 10, (x, y) => y === 5));   // a road across
fs.writeFileSync(path.join(L, 'no_pass.pgm'), pgm8(10, 10, (x, y) => x >= 8 && y >= 8)); // far corner
const out = path.join(T, 'mod');
let r = run('--height', hp, '--layers', L, '--name', 'gen_a', '--out', out, '--zmin', '-20', '--zmax', '100');
if (r.status !== 0) bad('generate exit ' + r.status + ' ' + r.stdout + r.stderr);
const d = path.join(out, 'resource/map/multi/gen_a');
if (run('--check', d).status !== 0) bad('--check refuses a good map');

const m = mapnet.parse(fs.readFileSync(path.join(d, 'map.net')));
if (m.problems.length || m.cell !== 10 || m.version !== 2) bad('net shape ' + JSON.stringify(m.problems));
if (m.width !== 61 || m.height !== 67) bad('net size ' + m.width + 'x' + m.height);
for (const [x, y] of [[0, 0], [60, 0], [0, 66], [30, 40], [60, 66]]) {
  const want = Math.round(-20 + hf(x, y) * 120), got = mapnet.cellAt(m, x, y).height;
  if (want !== got) bad(`height at ${x},${y}: ${got}, image says ${want}`);
}
const nameAt = (x, y) => { const c = mapnet.cellAt(m, x, y); return mapnet.typeName(m, c.type) + '/' + mapnet.materialName(m, c.material); };
if (nameAt(5, 10) !== 'ground/sand') bad('west cell ' + nameAt(5, 10));
if (nameAt(40, 10) !== 'ground/grass') bad('base cell ' + nameAt(40, 10));
if (nameAt(40, 35) !== 'road/road') bad('road cell ' + nameAt(40, 35));
if (nameAt(58, 64) !== 'no_pass/rock') bad('no-pass cell ' + nameAt(58, 64));

const ply = fs.readFileSync(path.join(d, 'map.ply')), w = M.walkPly(ply);
if (w.bad) bad('ply ' + w.bad);
if (w.parts.length !== 4 || w.vc !== 11 * 12) bad(`parts ${w.parts.length}, vertices ${w.vc}`);
for (const p of w.parts) if (!fs.existsSync(path.join(d, p.mtl))) bad('no ' + p.mtl);
const text = fs.readFileSync(path.join(d, 'map'), 'latin1'), info = fs.readFileSync(path.join(d, 'combat.mi'), 'latin1');
for (const k of ['{Land', '{Clips', '{"[auto]"', '{world ', '{camera ', '{pather ', '{distance ', '{viewAngle ']) if (!text.includes(k)) bad('map has no ' + k);
for (const k of ['{Entity "map_point"', '{team a}', '{team b}', '{visor SpawnPoint}', '{Environment ', '{Players', '{diplomacy', '{Fog ', '{EntityManager']) if (!info.includes(k)) bad('combat.mi has no ' + k);
if (!/\r\n/.test(text) || /[^\r]\n/.test(info)) bad('text not CRLF');
const man = JSON.parse(fs.readFileSync(path.join(out, 'mapgen.gen_a.json'), 'utf8'));
if (man.copiedUnchanged.length || !man.notReached.length) bad('manifest ' + JSON.stringify(man.copiedUnchanged));

// mapview, the map's other reader, sees the slope: top row (y 0, x 0) low, bottom right high
const v = spawnSync(process.execPath, [path.join(root, 'tools/mapview/mapview.js'), d, '--layer', 'height', '--width', '8', '-q'], { encoding: 'utf8' });
const rows = v.stdout.split('\n').slice(1).filter(l => /^\d+$/.test(l));
if (!(rows.length && rows[0][0] === '0' && rows[rows.length - 1].slice(-1) === '9')) bad('mapview height ' + JSON.stringify(rows));

// the same picture as .raw gives the same net
const raw = Buffer.alloc(W * H * 2); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) raw.writeUInt16LE(Math.round(hf(x, y) * 65535), (y * W + x) * 2);
const rp = path.join(T, 'h.raw'); fs.writeFileSync(rp, raw);
r = run('--height', rp, '--raw-size', `${W}x${H}`, '--name', 'gen_r', '--out', out);
if (r.status !== 0) bad('raw exit ' + r.stdout);
const mr = mapnet.parse(fs.readFileSync(path.join(out, 'resource/map/multi/gen_r/map.net')));
if (mapnet.cellAt(mr, 60, 66).height !== 300 || mapnet.cellAt(mr, 0, 0).height !== 0) bad('raw heights');
if (run('--height', rp, '--name', 'gen_s', '--out', out).status === 0) bad('raw of a wrong size accepted');

// a clone: same keys kept, spawn points moved, foreign Tags gone; a cell-5 clone refused
const cl = path.join(T, 'clone'); fs.mkdirSync(cl);
const hd = Buffer.alloc(14); hd[0] = 10; hd[1] = 2; fs.writeFileSync(path.join(cl, 'map.net'), hd);
const cmi = '{mission\r\n\t{Entity "map_point" 0xc000\r\n\t\t{Position -999 -2505}\r\n\t\t{xform zl 92}\r\n\t\t{Extender "map_point"\r\n\t\t\t{name b1}\r\n\t\t\t{team b}\r\n\t\t}\r\n\t}\r\n\t{Entity "map_point" 0xc007\r\n\t\t{Position -3553 2271}\r\n\t\t{xform zl -94}\r\n\t\t{Extender "map_point"\r\n\t\t\t{name a1}\r\n\t\t\t{team a}\r\n\t\t}\r\n\t}\r\n\t{Entity "battle" 0xe000\r\n\t\t{Position -2182 163}\r\n\t}\r\n\t{Tags "switch" 0x6023}\r\n\t{Tags "day" 0xe000}\r\n\t{Environment "multi/x"}\r\n\t{Marker "kept"}\r\n}\r\n';
fs.writeFileSync(path.join(cl, 'combat.mi'), cmi);
r = run('--height', hp, '--name', 'gen_c', '--out', out, '--clone', cl);
if (r.status !== 0) bad('clone exit ' + r.stdout);
const cm = fs.readFileSync(path.join(out, 'resource/map/multi/gen_c/combat.mi'), 'latin1');
if (!cm.includes('{Marker "kept"}') || cm.includes('0x6023') || !cm.includes('{Tags "day" 0xe000}') || cm.includes('-3553') || cm.includes('-2182')) bad('clone mission ' + cm);
hd[0] = 5; fs.writeFileSync(path.join(cl, 'map.net'), hd);
if (!/MAPGEN_BAD_CLONE/.test(run('--height', hp, '--name', 'gen_d', '--out', out, '--clone', cl).stdout)) bad('cell-5 clone accepted');

// refusals
const inst = path.join(T, 'inst'); fs.mkdirSync(path.join(inst, 'resource'), { recursive: true }); fs.writeFileSync(path.join(inst, 'resource/map.pak'), '');
r = run('--height', hp, '--name', 'gen_x', '--out', path.join(inst, 'mods', 'x'));
if (r.status === 0 || !/MAPGEN_IN_INSTALL/.test(r.stdout)) bad('--out in an install accepted ' + r.stdout);
if (fs.existsSync(path.join(inst, 'mods'))) bad('wrote into the install');
if (M.inInstall('D:/Steam/steamapps/common/x/mods/y') === null) bad('steamapps path not refused');
if (run('--height', hp, '--name', 'gen_a', '--out', out).status === 0) bad('existing map overwritten without --force');
fs.writeFileSync(path.join(T, 'bad.pgm'), 'hello');
if (run('--height', path.join(T, 'bad.pgm'), '--name', 'gen_y', '--out', out).status === 0) bad('bad image accepted');
const L2 = path.join(T, 'l2'); fs.mkdirSync(L2); fs.writeFileSync(path.join(L2, 'lava.pgm'), pgm8(2, 2, () => 1));
if (run('--height', hp, '--layers', L2, '--name', 'gen_z', '--out', out).status === 0) bad('unknown layer accepted');
fs.writeFileSync(path.join(L2, 'no_pass.pgm'), pgm8(2, 2, () => 1)); fs.rmSync(path.join(L2, 'lava.pgm'));
if (run('--height', hp, '--layers', L2, '--name', 'gen_w', '--out', out).status === 0) bad('map all no-pass got spawn points');
// minimap.dds: A8R8G8B8, mip chain to 1x1, 61x67 cells -> 61x67, size matches the levels
{
  const dd = fs.readFileSync(path.join(d, 'minimap.dds'));
  const mw = dd.readUInt32LE(16), mh = dd.readUInt32LE(12), mips = dd.readUInt32LE(28);
  let want = 128, lw = mw, lh = mh; for (let i = 0; i < mips; i++) { want += lw * lh * 4; lw = Math.max(1, lw >> 1); lh = Math.max(1, lh >> 1); }
  if (dd.toString('latin1', 0, 4) !== 'DDS ' || mw !== 61 || mh !== 67 || mips !== 7 || dd.readUInt32LE(88) !== 32 || dd.readUInt32LE(92) !== 0xff0000 || dd.length !== want) bad(`minimap.dds ${mw}x${mh} mips ${mips} len ${dd.length} want ${want}`);
  if (dd[128 + 3] !== 255) bad('minimap alpha not 255');
}
// --slots 4: maxPlayers 4, two points a team with order 1,2 like stock 2v2; odd count refused
if (run('--height', hp, '--name', 'gen_s', '--out', out, '--slots', '4').status !== 0) bad('--slots 4 refused');
else {
  const sd = path.join(out, 'resource/map/multi/gen_s'), si = fs.readFileSync(path.join(sd, 'map.info'), 'latin1'), sm = fs.readFileSync(path.join(sd, 'combat.mi'), 'latin1');
  if (!si.includes('{maxPlayers 4}')) bad('--slots 4 map.info ' + si);
  const names = [...sm.matchAll(/\{name (\w+)\}\s*\{team \w\}\s*\{phase 0\}\s*\{order (\d)\}/g)].map(x => x[1] + ':' + x[2]).sort().join(',');
  if (names !== 'a1:1,a2:2,b1:1,b2:2') bad('--slots 4 points ' + names);
  if (run('--check', sd).status !== 0) bad('--check refuses a 4-slot map');
}
if (!fs.readFileSync(path.join(d, 'map.info'), 'latin1').includes('{maxPlayers 2}')) bad('default maxPlayers not 2');
if (run('--height', hp, '--name', 'gen_s3', '--out', out, '--slots', '3').status === 0) bad('--slots 3 accepted');

// the check that fails on a broken map: each break below must flip --check to exit 1 with its code
const broken = (what, code, fn) => {
  const e = path.join(T, 'broken_' + what); fs.cpSync(d, e, { recursive: true }); fn(e);
  const b = run('--check', e);
  if (b.status !== 1 || !b.stdout.includes(code)) bad(`broken map (${what}) not caught, exit ${b.status}: want ${code}: ${b.stdout}`);
};
broken('mirror', 'MAPGEN_MESH_UNFLIPPED', e => {   // mesh y not negated: the mistake that makes units float
  const b = fs.readFileSync(path.join(e, 'map.ply')), q = M.walkPly(b);
  for (let v2 = 0; v2 < q.vc; v2++) { const o = q.vo + v2 * q.vs; b.writeFloatLE(-b.readFloatLE(o + 4), o + 4); }
  fs.writeFileSync(path.join(e, 'map.ply'), b);
});
broken('sunk', 'MAPGEN_MESH_OFF', e => {
  const b = fs.readFileSync(path.join(e, 'map.ply')), q = M.walkPly(b);
  const o = q.vo + 30 * q.vs; b.writeFloatLE(b.readFloatLE(o + 8) + 50, o + 8);
  fs.writeFileSync(path.join(e, 'map.ply'), b);
});
broken('cut', 'MAPGEN_PLY', e => { const b = fs.readFileSync(path.join(e, 'map.ply')); fs.writeFileSync(path.join(e, 'map.ply'), b.subarray(0, b.length - 40)); });
broken('nomtl', 'MAPGEN_MTL', e => fs.rmSync(path.join(e, 'mtl1.mtl')));
broken('onelayer', 'MAPGEN_MTL', e => { const f = path.join(e, 'mtl0.mtl'); fs.writeFileSync(f, fs.readFileSync(f, 'latin1').replace(/\{layer bump[\s\S]*?\t\}\r\n/, '')); });
broken('cell5', 'MAPGEN_NET', e => { const f = path.join(e, 'map.net'), b = fs.readFileSync(f); b[0] = 5; fs.writeFileSync(f, b); });
broken('unlisted', 'MAPGEN_NET', e => { const f = path.join(e, 'map.net'), b = fs.readFileSync(f), q = mapnet.parse(b); b[q.cellsOff + 2] = 12; fs.writeFileSync(f, b); });
broken('clip', 'MAPGEN_CLIP', e => { const f = path.join(e, 'map'); fs.writeFileSync(f, fs.readFileSync(f, 'latin1').replace(/\{world [^}]*\}/, '{world -99999 -99999 99999 99999}')); });
broken('spawn', 'MAPGEN_SPAWN', e => { const f = path.join(e, 'combat.mi'); fs.writeFileSync(f, fs.readFileSync(f, 'latin1').replace(/\{team a\}/, '{team c}')); });

// game parity: --target mowas2 writes the Classic range (newmod RANGE); default stays MinGameVersion 3.301 with no Max; --target goh refused
// with one line and exit 2, nothing written; a GoH install (binaries/x64/call_to_arms.exe) is an install for --out
{
  const mi = p => fs.readFileSync(path.join(p, 'mod.info'), 'latin1');
  const o1 = path.join(T, 'tm1'), o2 = path.join(T, 'tm2'), o3 = path.join(T, 'tm3');
  if (run('--height', hp, '--name', 'gen_t1', '--out', o1).status !== 0) bad('default target run');
  else if (!/\{MinGameVersion "3\.301"\}/.test(mi(o1)) || /MaxGameVersion/.test(mi(o1))) bad('default mod.info ' + mi(o1));
  if (run('--height', hp, '--name', 'gen_t2', '--out', o2, '--target', 'mowas2').status !== 0) bad('mowas2 target run');
  else if (!/\{MinGameVersion "3\.262\.0"\}\r\n\t\{MaxGameVersion "3\.262\.1"\}\r\n/.test(mi(o2))) bad('mowas2 mod.info ' + mi(o2));
  const rg = run('--height', hp, '--name', 'gen_t3', '--out', o3, '--target', 'goh');
  if (rg.status !== 2 || !/^mapgen: not available for GoH: .*\(GHMAP-06\)/.test(rg.stderr) || fs.existsSync(o3)) bad('goh target ' + rg.status + ' ' + rg.stderr);
  if (!/MAPGEN_ARGS/.test(run('--height', hp, '--name', 'gen_t4', '--out', o3, '--target', 'nope').stdout)) bad('bad --target accepted');
  // --exe is the same word as --target when no --target is given: mowas_2 writes the Classic range, goh is refused
  const o5 = path.join(T, 'tm5');
  if (run('--height', hp, '--name', 'gen_t5', '--out', o5, '--exe', 'mowas_2').status !== 0) bad('--exe mowas_2 run');
  else if (!/\{MinGameVersion "3\.262\.0"\}\r\n\t\{MaxGameVersion "3\.262\.1"\}\r\n/.test(mi(o5))) bad('--exe mowas_2 mod.info ' + mi(o5));
  const re = run('--height', hp, '--name', 'gen_t6', '--out', path.join(T, 'tm6'), '--exe', 'goh');
  if (re.status !== 2 || !/^mapgen: not available for GoH: /.test(re.stderr) || fs.existsSync(path.join(T, 'tm6'))) bad('--exe goh ' + re.status + ' ' + re.stderr);
  const gi = path.join(T, 'gohinst'); fs.mkdirSync(path.join(gi, 'binaries', 'x64'), { recursive: true }); fs.writeFileSync(path.join(gi, 'binaries/x64/call_to_arms.exe'), '');
  if (!/call_to_arms/.test(M.inInstall(path.join(gi, 'mods', 'x')) || '')) bad('GoH install not refused for --out');
}

fs.rmSync(T, { recursive: true, force: true });
console.log(fails ? `FAIL ${fails}` : 'PASS');
process.exitCode = fails ? 1 : 0;
