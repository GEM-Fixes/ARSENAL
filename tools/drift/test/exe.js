// drift --exe test: the game is handed to lib/vfs and lib/gamever; a GoH install is found by its exe; a mod outside <game>/mods is
// mounted by path; a stamp into the GoH install is refused with lib/writeguard's line. made-up folders in the temp dir only.
// Author: Imperator_Aug (ARSENAL, ia-93fde9fa)
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const vfs = require('../../lib/vfs'), gamever = require('../../lib/gamever');
const drift = require('../drift');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-exe-'));
const put = (rel, text) => { const f = path.join(tmp, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text, 'latin1'); };
// AS2 install shared by AS64 and MoW:AS2 (as64.exe present: lib/vfs picks as64 when no exe is named)
put('as2/as64.exe', 'x'); put('as2/mowas_2.exe', 'x');
put('as2/resource/set/a.def', '{e1 {hp 10}}\r\n');
put('as2/mods/m/mod.info', '{mod\r\n {Name "m"}\r\n}\r\n');
put('as2/mods/m/resource/set/a.def', '{e1 {hp 20}}\r\n');
// GoH install (binaries/x64/call_to_arms.exe) with a mod inside it, and a GoH mod kept outside the install
put('goh/binaries/x64/call_to_arms.exe', 'x');
put('goh/resource/set/a.def', '{e1 {hp 10}}\r\n');
put('goh/mods/gm/mod.info', '{mod\r\n {name "gm"}\r\n}\r\n');
put('goh/mods/gm/resource/set/a.def', '{e1 {hp 30}}\r\n');
put('work/gm2/mod.info', '{mod\r\n {name "gm2"}\r\n}\r\n');
put('work/gm2/resource/set/a.def', '{e1 {hp 40}}\r\n');

// spy on what drift hands to vfs.build and gamever.read
const seen = [];
const build0 = vfs.build, read0 = gamever.read;
vfs.build = o => { seen.push({ build: o.exe }); return build0(o); };
gamever.read = (d, e) => { seen.push({ ver: e === undefined ? 'none' : e }); return read0(d, e); };
const last = k => seen.filter(s => k in s).pop()[k];
try {
  const as2 = path.join(tmp, 'as2'), goh = path.join(tmp, 'goh');
  // no --exe: as before (vfs picks the exe itself, gamever reads the old order)
  let r = drift.stamp({ mod: path.join(as2, 'mods/m'), dryRun: true });
  assert.strictEqual(last('build'), undefined); assert.strictEqual(last('ver'), 'none');
  assert.strictEqual(r.n, 1);
  // --exe mowas2: vfs and gamever get mowas_2
  r = drift.stamp({ mod: 'm', gameDir: as2, exe: 'mowas2', dryRun: true });
  assert.strictEqual(last('build'), 'mowas_2'); assert.strictEqual(last('ver'), 'mowas_2'); assert.strictEqual(r.n, 1);
  r = drift.stamp({ mod: 'm', gameDir: as2, exe: 'as64', dryRun: true });
  assert.strictEqual(last('build'), 'as64'); assert.strictEqual(last('ver'), 'as64');
  assert.throws(() => drift.stamp({ mod: 'm', gameDir: as2, exe: 'nope', dryRun: true }), /--exe must be one of/);
  // GoH install found by its exe with no --exe: goh
  r = drift.stamp({ mod: path.join(goh, 'mods/gm'), dryRun: true });
  assert.strictEqual(last('build'), 'goh'); assert.strictEqual(last('ver'), 'goh'); assert.strictEqual(r.n, 1, 'GoH mod stamps its override');
  // GoH: a real stamp inside the GoH install is refused (writeguard), nothing written
  assert.throws(() => drift.stamp({ mod: path.join(goh, 'mods/gm') }), /drift stamp: .*Gates of Hell/i);
  assert(!fs.existsSync(path.join(goh, 'mods/gm/release.json')), 'nothing written into the GoH install');
  // --out outside the install plus --keep-base still refused: .as2base/ would land in the mod inside the GoH install
  const kbOut = path.join(tmp, 'work/kb.release.json');
  assert.throws(() => drift.stamp({ mod: path.join(goh, 'mods/gm'), out: kbOut, keepBase: true }), /drift stamp: .*Gates of Hell/i);
  assert(!fs.existsSync(path.join(goh, 'mods/gm/.as2base')), 'no .as2base in the GoH install');
  assert(!fs.existsSync(kbOut), 'no release.json written either');
  // --out outside without --keep-base writes only the outside file
  r = drift.stamp({ mod: path.join(goh, 'mods/gm'), out: kbOut });
  assert(fs.existsSync(kbOut) && !fs.existsSync(path.join(goh, 'mods/gm/.as2base')), 'outside --out stamp allowed');
  // GoH mod outside the install: mounted by path on the GoH game, stamp written in the mod folder, check reads it back
  r = drift.stamp({ mod: path.join(tmp, 'work/gm2'), gameDir: goh, exe: 'goh' });
  assert.strictEqual(r.n, 1, 'outside mod stamped');
  const rel = JSON.parse(fs.readFileSync(path.join(tmp, 'work/gm2/release.json'), 'utf8'));
  assert(rel.files['resource/set/a.def'], 'a.def stamped');
  let c = drift.check({ mod: path.join(tmp, 'work/gm2'), gameDir: goh, exe: 'goh' });
  assert.strictEqual(c.same, 1);
  put('goh/resource/set/a.def', '{e1 {hp 11}}\r\n');
  c = drift.check({ mod: path.join(tmp, 'work/gm2'), gameDir: goh, exe: 'goh' });
  assert.strictEqual(c.same, 0, 'GoH upstream change seen');
  console.log('exe: ok');
} finally {
  vfs.build = build0; gamever.read = read0;
  fs.rmSync(tmp, { recursive: true, force: true });
}
