// asserts on lib/vfs build() over the fixture + CLI outputs. run by run.sh
// Author: Imperator_Aug (ARSENAL, ia-bcf23b90)
const assert = require('assert'), path = require('path'), { execFileSync } = require('child_process');
const { build } = require('../../lib/vfs');
const game = path.join(__dirname, 'fixture', 'game'), cli = path.join(__dirname, '..', 'vfs.js');
const LIST = ['modb:1', 'moda:1', 'modc', 'modd', 'mode', 'modf', 'modg', 'modh', 'modi:2', 'nope', 'MODA'];
const v = build({ gameDir: game, mods: LIST });
const win = k => v.files.get(k), codes = () => v.problems.filter(p => p.level === 'error').map(p => p.code).sort();

// order: dependency sort puts moda before modb despite list order; failed mods skipped; modf/modg/modh/modc still mount
assert.deepEqual(v.mods, ['moda', 'modc', 'modf', 'modg', 'modh', 'modb']);
assert.ok(v.mods.indexOf('moda') < v.mods.indexOf('modb'), 'moda before modb');
assert.ok(!v.mods.includes('modd') && !v.mods.includes('mode'));

// winners
assert.equal(win('resource/set/x.set').layer, 'modb');                    // mod beats base + earlier mod
assert.equal(win('resource/set/only_a.set').layer, 'moda');
assert.equal(win('resource/entity/-vehicle/t.def').container.endsWith('resource/entity/e1.pak'), true);   // pak root = dir part of virtual name
assert.equal(win('resource/set/keep.set').layer, 'base');                  // mod.info Delete without resource/ is a no-op
assert.equal(win('resource/set/base_only.set'), undefined);               // mod.info Delete with resource/
assert.equal(win('resource/set/y.set'), undefined);                       // .patch delete; key was 'Set\\Y.set' in pak
assert.equal(win('resource/gone/1.x'), undefined); assert.equal(win('resource/gone/own.x'), undefined); // prefix delete incl. own file
assert.equal(win('resource/set/rm.set'), undefined); assert.equal(win('resource/set/rm2.set').layer, 'moda patch 1');
assert.equal(win('resource/dup/d.x').entry, 'DUP/D.X');                    // case-dup: later wins
assert.equal(win('resource/interface/text/desc.lng').layer, 'modb');       // localization/ replaces base localization.pak
assert.equal(win('resource/interface/text/desc.lng').source, 'loose');
assert.ok(!win('resource/set/ignored.txt') && !win('resource/set/.gitignore') && !win('resource/.svn/z.set') && !win('resource/set/readme.txt'));
assert.ok(win('resource/set/ok.mtl'));
assert.ok(!win('resource/1.patch') && !win('resource/m.patch'));           // documents dropped from index
// chain
assert.deepEqual(v.chain('resource/set/x.set').map(r => r.layer), ['base', 'base', 'moda', 'modb']);
assert.deepEqual(v.chain('resource/set/y.set').map(r => r.deleted ? 'DEL ' + r.layer : r.layer), ['base', 'DEL moda patch 1']);

// problems (errors)
assert.deepEqual(codes(), ['MOD_REQUIRE_MISSING', 'MOD_ROOT_PATCH', 'MOD_UNKNOWN', 'MOD_UNKNOWN', 'MOD_VERSION', 'MOD_VER_GATE',
  'PATCH_ID', 'PATCH_NO_DOC', 'PATCH_REMAP_MISSING', 'PAT_GAP']);
const info = v.problems.filter(p => p.level === 'info').map(p => p.code);
for (const c of ['SKIPPED_EXT', 'MOD_ROOT_IGNORED', 'MOD_ROOT_PATCH']) assert.ok(info.includes(c), 'info ' + c);

// cycle drops the whole list
const c = build({ gameDir: game, mods: ['modx', 'mody', 'moda:1'] });
assert.deepEqual(c.problems.filter(p => p.level === 'error').map(p => p.code), ['DEP_CYCLE']);
assert.deepEqual(c.mods, []); assert.equal(c.files.get('resource/set/only_a.set'), undefined);

// CLI
const run = (...a) => execFileSync('node', [cli, game, ...a], { encoding: 'utf8' });
const out = run('--mods', LIST.join(','));
assert.match(out, /^10 findings$/m);
assert.match(out, /mods\/modd: MOD_REQUIRE_MISSING/);
assert.ok(!/^info:/m.test(run('--mods', LIST.join(','), '-q')));
const which = run('--mods', LIST.join(','), 'which', 'Resource\\Set\\X.set');
assert.match(which, /winner: \[modb\] loose/); assert.equal((which.match(/shadowed:/g) || []).length, 3);
assert.match(run('--mods', LIST.join(','), 'shadowed'), /^modb: hides 2 base files, deletes 1/m);
assert.match(run('--mods', 'moda:1'), /^1 findings$/m);   // PAT_GAP only
assert.match(run('--names', '--mods', 'moda:1'), /^1 findings$/m);
// --exe pass-through + summary line
assert.match(run('--exe', 'mowas_2', '--mods', 'moda:1'), /^1 findings$/m);
assert.match(run('--exe', 'mowas_2', '--mods', 'moda:1'), /exe mowas_2, mode (n\/a|classic)/);
assert.match(run('--exe', 'as64', '--mods', 'moda:1', 'which', 'resource/set/x.set'), /exe as64, mode classic,/);
assert.match(run('--mods', 'moda:1', 'which', 'resource/set/x.set'), /exe mowas_2, /);   // fixture has no as64.exe -> auto mowas_2
// bug fix: pak-relative path (no resource/ mount root) resolves via resource/ retry
assert.match(run('which', 'set/x.set'), /using resource\/set\/x\.set[\s\S]*winner: \[base\] loose/);
assert.throws(() => run('which', 'Set\Only_Nowhere.set'), e => /not in index/.test(e.stdout));
// VFS-46: as64.exe mounts as64/core (resource.pak, resource/, localization.pak, localization/) after base, before mods, only for exe=as64
{
  const fs = require('fs'), { zip } = require('../../lib/zipwrite'), g = path.join(__dirname, 'fixture', 'game64'), B = s => Buffer.from(s, 'latin1');
  const w = (rel, d) => { const p = path.join(g, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, d); };
  w('as64.exe', ''); w('resource/set/x.set', 'base'); w('resource/set/z.set', 'base');
  w('as64/core/resource.pak', zip([['set/x.set', B('core-pak')], ['shader/s.vso', B('s')]]));
  w('as64/core/resource/set/z.set', 'core-loose');
  w('as64/core/localization/as64/en.lng', 'as64-lng');
  w('mods/m1/mod.info', '{Mod\r\n {Name "x"}\r\n {MinGameVersion "3.262"}\r\n {MaxGameVersion "3.262"}\r\n}\r\n');
  w('mods/m1/resource/set/x.set', 'mod');
  const a = build({ gameDir: g, mods: ['m1'] }), m = build({ gameDir: g, mods: ['m1'], exe: 'mowas_2' });
  assert.equal(a.files.get('resource/set/x.set').layer, 'm1');
  assert.deepEqual(a.chain('resource/set/x.set').map(r => r.layer), ['base', 'as64/core', 'm1']);
  assert.equal(a.files.get('resource/set/z.set').layer, 'as64/core');           // core beats base
  assert.ok(a.files.get('resource/shader/s.vso') && a.files.get('resource/interface/text/as64/en.lng'));
  assert.ok(!m.files.get('resource/shader/s.vso') && !m.files.get('resource/interface/text/as64/en.lng'));   // absent for mowas_2
  assert.equal(m.files.get('resource/set/z.set').layer, 'base');
}
// CHK-VFS: seeded defect + clean twin per code, own game dir (fixture/gamechk) so the goldens above stay as they are
{
  const fs = require('fs'), { checks } = require('../chk'), g = path.join(__dirname, 'fixture', 'gamechk');
  const w = (rel, d) => { const p = path.join(g, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, d); };
  const info = (extra, min = '3.262', max = '3.262') => `{Mod\r\n {Name "x"}\r\n {MinGameVersion "${min}"}\r\n {MaxGameVersion "${max}"}\r\n${extra}}\r\n`;
  w('as64.exe', '');
  w('as64/plus/mod.info', info('', '3.301', '3.301'));
  w('resource/set/user.set', '{use "set/gone.set"}\r\n'); w('resource/set/gone.set', '{a 1}\r\n'); w('resource/set/free.set', '{a 2}\r\n');
  w('resource/shader/dx10/a.hlsl', '#include "b.inc"\r\n'); w('resource/shader/dx10/b.inc', '#include "c.inc"\r\n'); w('resource/shader/dx10/c.inc', 'x\r\n');
  w('resource/shader/dx10/d.hlsl', '#include "e.inc"\r\n'); w('resource/shader/dx10/e.inc', 'x\r\n');
  w('mods/m_del/mod.info', info(' {Delete "resource/set/gone.set"}\r\n {Delete "resource/set/free.set"}\r\n'));
  w('mods/m_delok/mod.info', info(' {Delete "resource/set/free.set"}\r\n'));
  w('mods/m_sh/mod.info', info('')); w('mods/m_sh/resource/shader/dx10/a.hlsl', '#include "b.inc"\r\ny\r\n');
  w('mods/m_shok/mod.info', info('')); w('mods/m_shok/resource/shader/dx10/d.hlsl', '#include "e.inc"\r\ny\r\n'); w('mods/m_shok/resource/shader/dx10/e.inc', 'y\r\n');
  w('mods/m_vid/mod.info', info(''));
  for (const f of ['tactical.avi', 'single/m1/tactical.avi', 'single/m1/foo.avi', 'single/m1/strategic_2.avi']) w('mods/m_vid/resource/video/mission/' + f, 'avi');
  w('mods/m_modern/mod.info', info('', '3.301', '3.301')); w('mods/m_modern/resource/set/z.set', '{a 1}\r\n');
  const run2 = (mods, code) => { const b = build({ gameDir: g, mods }); return checks(b, { list: mods }).filter(p => p.code === code); };
  // VFS-35
  assert.deepEqual(run2(['m_del'], 'MOD_DELETE_REFERENCED').map(p => p.where), ['resource/set/gone.set']);
  assert.equal(run2(['m_delok'], 'MOD_DELETE_REFERENCED').length, 0);
  // VFS-57
  const sp = run2(['m_sh'], 'WARN_SHADER_PARTIAL');
  assert.equal(sp.length, 1); assert.match(sp[0].msg, /ships 1 of 3 .*missing dx10\/b\.inc, dx10\/c\.inc/);
  assert.equal(run2(['m_shok'], 'WARN_SHADER_PARTIAL').length, 0);
  // VFS-58 (tactical.avi at the root and foo.avi fire; tactical.avi and strategic_2.avi in a mission folder do not)
  assert.deepEqual(run2(['m_vid'], 'WARN_VIDEO_MISSION_PATH').map(p => p.where), ['resource/video/mission/single/m1/foo.avi', 'resource/video/mission/tactical.avi']);
  assert.equal(run2(['m_del'], 'WARN_VIDEO_MISSION_PATH').length, 0);
  // VFS-53
  const wl = run2(['m_del', '1234567890'], 'MOD_LIST_WORKSHOP_ID');
  assert.equal(wl.length, 1); assert.equal(wl[0].where, '1234567890');
  assert.equal(run2(['m_del'], 'MOD_LIST_WORKSHOP_ID').length, 0);
  // VFS-54 had: MOD_MODE for the modern mod when as64+ is not listed; none when it is
  const mm = mods => build({ gameDir: g, mods }).problems.filter(p => p.code === 'MOD_MODE');
  assert.equal(mm(['m_del', 'm_modern']).length, 1); assert.equal(mm(['as64+', 'm_modern']).length, 0);
  // CLI prints the new codes; summary line count
  const o2 = execFileSync('node', [cli, g, '--mods', 'm_vid,m_sh', '-q'], { encoding: 'utf8' });
  assert.match(o2, /WARN_VIDEO_MISSION_PATH/); assert.match(o2, /WARN_SHADER_PARTIAL/); assert.match(o2, /^3 findings$/m);
}
assert.throws(() => execFileSync('node', [cli, game, '--exe', 'bogus'], { stdio: 'pipe' }));
// game parity: --exe goh and mowas2 (lib/games words) reach lib/vfs; a GoH folder mounts resource/ + localizations/<code>/ (GHVFS-04)
{
  const fs = require('fs'), g = path.join(__dirname, 'fixture', 'goh');
  fs.rmSync(g, { recursive: true, force: true });
  const put = (rel, s) => { const f = path.join(g, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
  put('binaries/x64/call_to_arms.exe', 'MZ');
  put('resource/set/a.set', '{a}\r\n');
  put('localizations/default/interface/text/main.pot', 'msgctxt "k"\r\nmsgid "t"\r\nmsgstr ""\r\n');
  const cg = (...a) => execFileSync('node', [cli, g, ...a], { encoding: 'utf8' });
  assert.match(cg('--exe', 'goh', 'which', 'resource/set/a.set'), /winner: \[base\].*\(exe goh,/s);
  assert.match(cg('--exe', 'goh', 'which', 'interface/text/main.pot'), /winner: /);
  assert.match(cg('which', 'resource/set/a.set'), /\(exe goh,/);          // auto from call_to_arms.exe, as before
  assert.match(run('--exe', 'mowas2', '--mods', 'moda:1'), /exe mowas_2, /);   // GUI id mowas2 = vfs exe mowas_2
  // a GoH profile list (lastGameVersion 1.067) reaches the static checks: read at the GoH version, not wiped by the AS2 3.262 default
  put('prof/options.set', '{options\r\n\t{mods\r\n\t\t"1234567890:0"\r\n\t}\r\n}\r\n');
  put('prof/settings.set', '{lastGameVersion "1.067.0"}\r\n');
  assert.match(cg('--exe', 'goh', '--profile', path.join(g, 'prof', 'options.set'), '-q'), /MOD_LIST_WORKSHOP_ID/);
  fs.rmSync(g, { recursive: true, force: true });
}
// readRecsOrdered: the same bytes as readRec for every pak entry (stored and deflated, big gaps, one chunk and many), in offset order,
// loose records left out, and a cut entry (bad offset) left to readRec
{
  const fs = require('fs'), os = require('os'), { zip } = require('../../lib/zipwrite'), pak = require('../../lib/pak');
  const { readRec, readRecsOrdered, closeRecs } = require('../../lib/vfs');
  const d = fs.mkdtempSync(path.join(process.env.ARSENAL_TMP || os.tmpdir(), 'vfs-ord-')), f = path.join(d, 'a.pak');
  const big = Buffer.alloc(300000, 7), files = [];
  for (let i = 0; i < 12; i++) files.push(['e/f' + i + '.def', Buffer.from('{def ' + i + ' ' + 'x'.repeat(i * 37) + '}', 'latin1'), i % 2 === 1]);
  files.splice(5, 0, ['t/big.dds', big]);    // a 300 KB gap between f4 and f5
  fs.writeFileSync(f, zip(files));
  const recs = pak.list(f).map(ent => ({ rec: { source: 'pak', container: f, entry: ent.name, ent } })).reverse();   // asked out of order
  recs.push({ rec: { source: 'loose', container: d, entry: 'x' } });
  for (const o of [{}, { gap: 16, chunk: 64 }, { chunk: 1 }]) {
    const got = new Map(), order = [];
    for (const _ of readRecsOrdered(recs, (it, b) => { got.set(it.rec.entry, b); order.push(it.rec.ent.off); }, o)) { /* each read */ }
    assert.equal(got.size, files.length, 'every pak entry read: ' + JSON.stringify(o));
    for (const it of recs) if (it.rec.source === 'pak') assert.ok(got.get(it.rec.entry).equals(readRec(it.rec)), it.rec.entry + ' same bytes ' + JSON.stringify(o));
    assert.deepEqual(order, order.slice().sort((a, b) => a - b), 'offset order');
  }
  const cut = { rec: { source: 'pak', container: f, entry: 'cut', ent: Object.assign({}, recs[0].rec.ent, { off: 3 }) } }, seen = [];
  for (const _ of readRecsOrdered([cut], it => seen.push(it))) { /* none */ }
  assert.equal(seen.length, 0, 'an entry it cannot place is left out');
  closeRecs(); fs.rmSync(d, { recursive: true, force: true });
}
console.log('ok');
