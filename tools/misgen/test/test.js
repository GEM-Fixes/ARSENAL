// misgen test: a flat fixture map from mapgen, no install. Run through run.sh; prints one line per failure, then PASS.
// Author: Imperator_Aug (ARSENAL, ia-34e35efc)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const root = path.join(__dirname, '..', '..', '..');
const sdl = require('../../lib/sdl');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'misgen-'));
let fails = 0;
const bad = m => { console.log('FAIL ' + m); fails++; };
const run = (...a) => spawnSync(process.execPath, [path.join(root, 'tools/misgen/misgen.js'), ...a, '-q'], { encoding: 'utf8' });
const rd = (d, f) => fs.readFileSync(path.join(d, f), 'latin1');

// the fixture map
const hp = path.join(T, 'flat.pgm');
fs.writeFileSync(hp, Buffer.concat([Buffer.from('P5\n25 25\n255\n'), Buffer.alloc(625)]));
const out = path.join(T, 'mod'), d = path.join(out, 'resource/map/multi/fx');
const mg = spawnSync(process.execPath, [path.join(root, 'tools/mapgen/mapgen.js'), '--height', hp, '--name', 'fx', '--out', out, '--size', '241x241', '--zmax', '30', '-q'], { encoding: 'utf8' });
if (mg.status !== 0) bad('mapgen fixture ' + mg.stdout);
const mapBefore = rd(d, 'map');

const good = { mode: 'captureflag', sides: ['a', 'b'], flags: [{ x: 10, y: -20 }], spawns: { a: [[-250, 600], [250, 600]], b: [[-250, -600], [250, -600]] } };
const specFile = (name, s) => { const p = path.join(T, name + '.json'); fs.writeFileSync(p, JSON.stringify(s)); return p; };
const sp = specFile('good', good);

let r = run('--map', d, '--spec', sp);
if (r.status !== 0) bad('generate exit ' + r.status + ' ' + r.stdout + r.stderr);
if (run('--check', d).status !== 0) bad('--check refuses a good mission');

// what got written
const mi = rd(d, 'captureflag.mi'), map = rd(d, 'map'), info = rd(d, 'captureflag.info');
if (/[^\r]\n/.test(mi) || /[^\r]\n/.test(info)) bad('text is not CRLF');
for (const k of ['{Entity "flag_point_frontlines"', '{name captureflag}', '{zoneA 30}', '{zoneB 30}', '{visor MapPoint}', '{Entity "flag_ring"', '{Position 10 -20}', '{name a2}', '{name b2}', '{order 2}', '{visor SpawnPoint}', '{Environment "multi/multi_01"}', '{count 17}', '{Fog 1}', '{EntityManager {Enabled}']) if (!mi.includes(k)) bad('mission lacks ' + k);
if (!info.includes('flag_capture_time=20') || !info.includes('{maxPlayers 4}')) bad('info ' + info);
if (!/\{"captureflaga"[\s\S]*\{"captureflagb"/.test(map)) bad('map lacks the team clips');
if (!map.includes(mapBefore.slice(0, mapBefore.indexOf('{Clips')))) bad('map text before the clips changed');
if (!map.includes('{"[auto]"')) bad('[auto] clip lost');
// the file parses into one block whole, and the clips sit inside {Clips}
const t = sdl.parseLines(map.split(/\r?\n/), (l, c, m) => bad(`map parse ${c} ${m}`));
const clips = t.kids[0].kids.find(k => k.name === 'Clips');
if (!clips || clips.kids.map(k => k.name).join() !== '[auto],captureflaga,captureflagb') bad('clips ' + (clips && clips.kids.map(k => k.name)));
// a's clip is the high side, holds its spawns, not the flag; camera wider than pather by 200 towards the middle
const box = (n, k) => clips.kids.find(c => c.name === n).kids.find(c => c.name === k).vals.map(v => +v.v);
const pa = box('captureflaga', 'pather'), pb = box('captureflagb', 'pather'), ca = box('captureflaga', 'camera');
if (pa[1] !== 400 || pb[3] !== -400) bad(`team clip edges ${pa} ${pb}`);
if (ca[1] !== 200) bad('camera edge ' + ca);
// facing: at the flag, near stock -90 for the high side
if (!/\{name a1\}/.test(mi) || !/\{xform zl -6\d\.\d+\}/.test(mi)) bad('facing of a1');

// refusals
const inst = path.join(T, 'inst'); fs.mkdirSync(path.join(inst, 'resource'), { recursive: true }); fs.writeFileSync(path.join(inst, 'resource/map.pak'), '');
r = run('--map', d, '--spec', sp, '--out', path.join(inst, 'mods/x/resource/map/multi/fx'));
if (r.status === 0 || !/MISGEN_IN_INSTALL/.test(r.stdout)) bad('--out in an install accepted ' + r.stdout);
if (fs.existsSync(path.join(inst, 'mods'))) bad('wrote into the install');
r = run('--map', d, '--spec', specFile('s1', good), '--out', 'D:/Steam/steamapps/common/x/mods/y');
if (r.status === 0 || !/MISGEN_IN_INSTALL/.test(r.stdout)) bad('steamapps --out accepted');
if (!/MISGEN_EXISTS/.test(run('--map', d, '--spec', sp).stdout)) bad('existing mission overwritten without --force');
// --force replaces, doesn't add a second clip
if (run('--map', d, '--spec', sp, '--force').status !== 0) bad('--force exit');
const twice = rd(d, 'map');
if ((twice.match(/"captureflaga"/g) || []).length !== 1) bad('--force doubled the clips');
if (twice !== map) bad('--force gave another map');
const specBad = (what, change, code = 'MISGEN_SPEC') => {
  const s = JSON.parse(JSON.stringify(good)); change(s);
  const o = path.join(T, 'x_' + what), q = run('--map', d, '--spec', specFile('x_' + what, s), '--out', o);
  if (q.status === 0 || !q.stdout.includes(code)) bad(`spec ${what} accepted: ${q.stdout}`);
  if (fs.existsSync(path.join(o, 'captureflag.mi'))) bad(`spec ${what} wrote a mission`);
};
specBad('mode', s => { s.mode = 'combat'; });
specBad('sides', s => { s.sides = ['a', 'c']; });
specBad('noflag', s => { s.flags = []; });
specBad('twoflags', s => { s.flags.push({ x: 1, y: 1 }); });
specBad('uneven', s => { s.spawns.b.pop(); });
specBad('nospawn', s => { delete s.spawns.a; });
specBad('param', s => { s.parameters = { scoreFinal: 5 }; });
specBad('zone', s => { s.flags[0].zone = 1; });

// the seeded defects: each must flip --check to exit 1 with its code
const broken = (what, code, file, fn) => {
  const e = path.join(T, 'broken_' + what); fs.cpSync(d, e, { recursive: true });
  const f = path.join(e, file); if (fn) fs.writeFileSync(f, fn(fs.readFileSync(f, 'latin1')), 'latin1'); else fs.rmSync(f);
  const b = run('--check', e);
  if (b.status !== 1 || !b.stdout.includes(code)) bad(`defect ${what} not caught, exit ${b.status}: want ${code}: ${b.stdout}`);
};
const dropEntity = (s, re) => { const m = re.exec(s); if (!m) throw new Error('fixture lost ' + re); const a = s.lastIndexOf('\t{Entity', m.index), z = s.indexOf('\r\n\t}\r\n', m.index) + 5; return s.slice(0, a) + s.slice(z); };
broken('noclipa', 'MISGEN_NO_CLIP', 'map', s => s.replace('"captureflaga"', '"otherclip"'));
broken('noclipb', 'MISGEN_NO_CLIP', 'map', s => s.replace('"captureflagb"', '"otherclip"'));
broken('badclip', 'MISGEN_BAD_CLIP', 'map', s => { const i = s.indexOf('"captureflaga"'), j = s.indexOf('{pather', i), k = s.indexOf('}', j); return s.slice(0, j) + '{pather 1 2' + s.slice(k); });
broken('noflag', 'MISGEN_NO_FLAG', 'captureflag.mi', s => dropEntity(s, /\{name captureflag\}/));
broken('twoflags', 'MISGEN_FLAG_COUNT', 'captureflag.mi', s => { const a = s.indexOf('\t{Entity "flag_point'), z = s.indexOf('\t{Entity "flag_ring"'); return s.slice(0, z) + s.slice(a, z) + s.slice(z); });
broken('nozone', 'MISGEN_FLAG_ZONE', 'captureflag.mi', s => s.replace(/\t*\{zoneA 30\}\r\n/, ''));
broken('noring', 'MISGEN_NO_RING', 'captureflag.mi', s => s.replace(/\t\{Entity "flag_ring"[\s\S]*?\r\n\t\}\r\n/, ''));
broken('flagoff', 'MISGEN_FLAG_PLACE', 'captureflag.mi', s => s.replace(/\{Position 10 -20\}/g, '{Position 99999 -20}'));
broken('flagclip', 'MISGEN_FLAG_IN_CLIP', 'captureflag.mi', s => s.replace(/\{Position 10 -20\}/g, '{Position 10 600}'));
broken('nospawna', 'MISGEN_NO_SPAWN', 'captureflag.mi', s => dropEntity(dropEntity(s, /\{name a1\}/), /\{name a2\}/));
broken('badteam', 'MISGEN_NO_SPAWN', 'captureflag.mi', s => s.replace('{team a}', '{team c}'));
broken('uneven', 'MISGEN_SPAWN_UNEVEN', 'captureflag.mi', s => dropEntity(s, /\{name b2\}/));
broken('order', 'MISGEN_SPAWN_ORDER', 'captureflag.mi', s => s.replace(/(\{team a\}\r\n\s*\{phase 0\}\r\n\s*)\{order 1\}/, '$1{order 2}'));
broken('spawnoff', 'MISGEN_SPAWN_PLACE', 'captureflag.mi', s => s.replace('{Position -250 600}', '{Position -250 1190}'));
broken('spawnclip', 'MISGEN_SPAWN_CLIP', 'captureflag.mi', s => s.replace('{Position -250 600}', '{Position -250 100}'));
broken('nomi', 'MISGEN_MISSING', 'captureflag.mi');
broken('nomap', 'MISGEN_MISSING', 'map');
broken('nonet', 'MISGEN_MISSING', 'map.net');
broken('noplayers', 'MISGEN_KEY', 'captureflag.mi', s => s.replace('{Environment', '{Environmen'));
broken('slots', 'MISGEN_SLOTS', 'captureflag.info', s => s.replace('{maxPlayers 4}', '{maxPlayers 6}'));
broken('braces', 'MISGEN_PARSE', 'captureflag.mi', s => s + '{');

// missing capture time is said, not failed: a stock map's mission has none on the map either
const e = path.join(T, 'notime'); fs.cpSync(d, e, { recursive: true }); fs.rmSync(path.join(e, 'captureflag.info'));
r = spawnSync(process.execPath, [path.join(root, 'tools/misgen/misgen.js'), '--check', e], { encoding: 'utf8' });
if (r.status !== 0 || !/MISGEN_TIME.*stock 300/.test(r.stdout)) bad('no info: ' + r.stdout);

// --exe: as64 and mowas_2 write the same bytes as no --exe; goh is refused with the plain line, exit 2, nothing written
for (const ex of ['as64', 'mowas_2', 'mowas2']) {
  const o = path.join(T, 'exe_' + ex), q = run('--map', d, '--spec', sp, '--out', o, '--exe', ex, '--force');   // d's map has the clips by now: --force (same bytes, checked above)
  if (q.status !== 0) bad(`--exe ${ex} exit ${q.status} ${q.stdout}${q.stderr}`);
  else for (const f of ['captureflag.mi', 'captureflag.info', 'map']) if (rd(o, f) !== rd(d, f)) bad(`--exe ${ex}: ${f} differs from no --exe`);
}
r = run('--map', d, '--spec', sp, '--out', path.join(T, 'exe_goh'), '--exe', 'goh');
if (r.status !== 2 || !/^misgen: not available for GoH: .*\(GHMAP-03\)\s*$/.test(r.stderr)) bad('--exe goh: ' + r.status + ' ' + r.stderr);
if (fs.existsSync(path.join(T, 'exe_goh'))) bad('--exe goh wrote');
if (run('--check', d, '--exe', 'goh').status !== 2) bad('--check --exe goh not refused');
if (run('--check', d, '--exe', 'nosuch').status !== 2) bad('bad --exe accepted');

fs.rmSync(T, { recursive: true, force: true });
console.log(fails ? `FAIL ${fails}` : 'PASS');
process.exitCode = fails ? 1 : 0;
