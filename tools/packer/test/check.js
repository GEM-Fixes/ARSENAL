// verifies packed fixture: pak listing == expected file set (independent of packer's own check) + refusal
// Author: Imperator_Aug (ARSENAL, ia-7cca91b3)
const path = require('path'), fs = require('fs'), cp = require('child_process');
const pak = require('../../lib/pak');
const out = path.join(__dirname, 'fixture', 'out');
const want = {
  'gamelogic.pak': ['set/clean.set', 'set/lf.set', 'set/utf.set', 'set/cp.set', 'set/bom16.set', 'properties/ok.lng', 'properties/bad.lng', 'shader/s.fx'],
  'entity.pak': ['entity/unit.def'], 'texture.pak': ['texture/pic.dds'], 'map.pak': ['map/A.set'], 'sound.pak': ['sound/old.set'],
};
let bad = 0;
for (const [f, names] of Object.entries(want)) {
  const got = pak.list(path.join(out, f)).map(e => e.name).sort();
  if (JSON.stringify(got) !== JSON.stringify(names.slice().sort())) { console.log('FAIL listing ' + f, got); bad++; }
}
const have = fs.readdirSync(out).sort().join();
if (have !== [...Object.keys(want), 'difficulties', 'loose.txt'].sort().join()) { console.log('FAIL pak set', have); bad++; }
// loose files land at their path under resource/ (LOOSE_COPIED)
for (const l of ['loose.txt', 'difficulties/easy.dl']) if (!fs.existsSync(path.join(out, l))) { console.log('FAIL loose not copied ' + l); bad++; }
const gl = pak.list(path.join(out, 'gamelogic.pak')), e = gl.find(x => x.name === 'set/clean.set');
const wantClean = Buffer.concat([Buffer.from('{x 1}\r\n{y "'), Buffer.from('«ёлка»', 'utf8'), Buffer.from('"} ; \xCF\xF0\r\n', 'latin1')]);   // bytes kept as-is (ENCFIX)
if (!pak.read(gl, e).equals(wantClean)) { console.log('FAIL content'); bad++; }
// toolkit markers (.arsenal-made, .as2-installed): never junk, never packed, never named in the report
{ const pk = require('../packer.js');
  for (const m of ['.arsenal-made', '.as2-installed', '.ARSENAL-MADE']) if (pk.JUNK_FILE.test(m) || !pk.TOOL_MARKER.test(m)) { console.log('FAIL marker regex ' + m); bad++; }
  for (const j of ['thumbs.db', '.gitignore', 'a.bak']) if (!pk.JUNK_FILE.test(j) || pk.TOOL_MARKER.test(j)) { console.log('FAIL junk regex ' + j); bad++; }
  const r0 = cp.spawnSync('node', [path.join(__dirname, '..', 'packer.js'), path.join(__dirname, 'fixture', 'mod')], { encoding: 'utf8' });
  if (/arsenal-made|as2-installed/.test(r0.stdout + r0.stderr)) { console.log('FAIL marker reported'); bad++; }
  if (fs.existsSync(path.join(out, '.arsenal-made'))) { console.log('FAIL marker copied loose'); bad++; } }
// refuse inside a game install: fake install = dir with mods/ + resource/x.pak
const fake = path.join(__dirname, 'fixture', 'game');
fs.mkdirSync(path.join(fake, 'mods'), { recursive: true }); fs.mkdirSync(path.join(fake, 'resource'), { recursive: true });
fs.writeFileSync(path.join(fake, 'resource', 'x.pak'), '');
const r = cp.spawnSync('node', [path.join(__dirname, '..', 'packer.js'), path.join(__dirname, 'fixture', 'mod'), '--out', path.join(fake, 'mods', 'o')]);
if (r.status !== 2 || fs.existsSync(path.join(fake, 'mods', 'o'))) { console.log('FAIL install refusal'); bad++; }
// GT-08: entry dates are real (old code wrote 0 = month 0); --package writes a ready mod folder <out>/<mod name>/
const P = path.join(__dirname, '..', 'packer.js');
const dosOk = t => { const d = t >>> 16, mo = (d >> 5) & 15, dy = d & 31; return mo >= 1 && mo <= 12 && dy >= 1 && 1980 + (d >> 9) >= 2020; };
for (const f of Object.keys(want)) if (f !== 'sound.pak' && !pak.list(path.join(out, f)).every(e => dosOk(e.time))) { console.log('FAIL entry date in ' + f); bad++; }
{ const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'packer-pkg-')), pkOut = path.join(tmp, 'pkg'); fs.rmSync(pkOut, { recursive: true, force: true });
  const rp = cp.spawnSync('node', [P, path.join(__dirname, 'fixture', 'mod'), '--package', '--out', pkOut, '-q'], { encoding: 'utf8' });
  const m = path.join(pkOut, 'mod'), res = path.join(m, 'resource');
  if (rp.status !== 0) { console.log('FAIL package exit ' + rp.status + ' ' + rp.stderr); bad++; }
  if (fs.readdirSync(pkOut).join() !== 'mod') { console.log('FAIL package top level is not one mod folder: ' + fs.readdirSync(pkOut)); bad++; }
  if (!fs.existsSync(path.join(m, 'mod.info')) || !fs.readFileSync(path.join(m, 'mod.info'), 'latin1').includes('{Name "fx"}')) { console.log('FAIL package mod.info'); bad++; }
  const pk = fs.readdirSync(res).filter(n => /\.pak$/i.test(n)).sort().join();
  if (pk !== 'entity.pak,gamelogic.pak,map.pak,sound.pak,sound_loose.pak,texture.pak') { console.log('FAIL package paks ' + pk); bad++; }
  if (!fs.existsSync(path.join(res, 'loose.txt')) || !fs.existsSync(path.join(res, 'difficulties', 'easy.dl'))) { console.log('FAIL package loose files'); bad++; }
  if (pak.list(path.join(res, 'sound.pak')).map(e => e.name).join() !== 'sound/old.set') { console.log('FAIL own pak not copied'); bad++; }
  if (!/WARN_PACK_PAK_CLASH/.test(rp.stdout)) { console.log('FAIL clash not reported'); bad++; }
  if (!pak.list(path.join(res, 'gamelogic.pak')).every(e => dosOk(e.time))) { console.log('FAIL package entry date'); bad++; }
  // no mod.info: refused, nothing written
  const nm = path.join(tmp, 'nomi'); fs.rmSync(nm, { recursive: true, force: true }); fs.mkdirSync(path.join(nm, 'resource', 'set'), { recursive: true });
  fs.writeFileSync(path.join(nm, 'resource', 'set', 'a.set'), '{x 1}\r\n');
  const rn = cp.spawnSync('node', [P, nm, '--package', '--out', path.join(pkOut, 'n2'), '-q'], { encoding: 'utf8' });
  if (rn.status !== 1 || !/PACK_NO_MODINFO/.test(rn.stdout) || fs.existsSync(path.join(pkOut, 'n2'))) { console.log('FAIL no mod.info not refused'); bad++; }
  fs.rmSync(tmp, { recursive: true, force: true }); }
const sd = require('../packer.js').dosStamp(new Date(2026, 0, 31, 13, 5, 9));
if (sd.date !== ((46 << 9) | (1 << 5) | 31) || sd.time !== ((13 << 11) | (5 << 5) | 4)) { console.log('FAIL dosStamp'); bad++; }
process.exit(bad ? 1 : 0);
