// vfs as64 mounts (as64/core, as64/plus, Classic/Enhanced filter): (t, assert) => ...
// Author: Imperator_Aug (ARSENAL, ia-3e946251)
module.exports = function (t, assert) {
  const fs = require('fs'), os = require('os'), path = require('path');
  const vfs = require('../vfs');
  const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
  const info = (min, max) => `{Mod {Name "x"} {MinGameVersion "${min}"}${max ? ` {MaxGameVersion "${max}"}` : ''}}\r\n`;

  function mk(exe) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vfsas64-'));
    if (exe) w(path.join(d, 'as64.exe'), 'x');
    w(path.join(d, 'resource', 'set', 'a.set'), 'base');
    w(path.join(d, 'as64', 'core', 'resource', 'shader', 's.hlsl'), 'core');
    w(path.join(d, 'as64', 'core', 'localization', '#as64.lng'), 'loc');
    w(path.join(d, 'as64', 'plus', 'mod.info'), info('3.301'));
    w(path.join(d, 'as64', 'plus', 'resource', 'set', 'a.set'), 'plus');
    w(path.join(d, 'mods', 'legacy', 'mod.info'), info('3.262', '3.262'));
    w(path.join(d, 'mods', 'legacy', 'resource', 'set', 'a.set'), 'legacy');
    w(path.join(d, 'mods', 'modern', 'mod.info'), info('3.301'));
    w(path.join(d, 'mods', 'modern', 'resource', 'set', 'a.set'), 'modern');
    return d;
  }
  const txt = (v, k) => vfs.readRec(v.files.get(k)).toString();
  const codes = v => v.problems.map(p => p.code + ':' + p.where.split('/').pop());

  t('vfs as64: core always mounted, mowas_2 install unchanged', () => {
    const d = mk(true), e = mk(false);
    try {
      const v = vfs.build({ gameDir: d });
      assert.equal(v.exe, 'as64'); assert.equal(v.mode, 'classic');
      assert.equal(v.files.get('resource/shader/s.hlsl').layer, 'as64/core');
      assert.equal(v.files.get('resource/interface/text/#as64.lng').layer, 'as64/core');
      const m = vfs.build({ gameDir: e });
      assert.equal(m.exe, 'mowas_2'); assert.equal(m.mode, null);
      assert.ok(!m.files.has('resource/shader/s.hlsl'));
      assert.equal(vfs.build({ gameDir: d, exe: 'mowas_2' }).files.has('resource/shader/s.hlsl'), false);
      const m2 = vfs.build({ gameDir: e, mods: ['as64+', 'legacy'] });
      assert.deepEqual(m2.mods, ['legacy']); assert.ok(codes(m2).some(c => c.startsWith('MOD_UNKNOWN')));
    } finally { fs.rmSync(d, { recursive: true, force: true }); fs.rmSync(e, { recursive: true, force: true }); }
  });
  t('vfs as64: as64+ built-in, Classic/Enhanced filter, order', () => {
    const d = mk(true);
    try {
      let v = vfs.build({ gameDir: d, mods: ['legacy', 'modern'] });
      assert.deepEqual(v.mods, ['legacy']); assert.ok(codes(v).includes('MOD_MODE:modern'));
      assert.equal(txt(v, 'resource/set/a.set'), 'legacy');
      assert.deepEqual(vfs.dropped(v).map(l => l.split(' ')[0]), ['MOD_MODE']); assert.ok(/"modern".*lacks as64\+/.test(vfs.dropped(v)[0]));  // C2c
      assert.deepEqual(vfs.dropped(vfs.build({ gameDir: d, mods: ['as64+', 'modern'] })), []);
      v = vfs.build({ gameDir: d, mods: ['legacy', 'modern', 'as64+'] });
      assert.equal(v.mode, 'enhanced'); assert.deepEqual(v.mods, ['as64+', 'modern']);
      assert.ok(codes(v).includes('MOD_MODE:legacy'));
      assert.equal(txt(v, 'resource/set/a.set'), 'modern');                 // plus first, player mods over it
      v = vfs.build({ gameDir: d, mods: ['as64+'] });
      assert.equal(txt(v, 'resource/set/a.set'), 'plus'); assert.equal(v.files.get('resource/set/a.set').layer, 'as64+');
      v = vfs.build({ gameDir: d, mods: ['modern', 'as64+'], plainVersion: '3.300' });
      assert.deepEqual(v.mods, []); assert.ok(codes(v).includes('MOD_VERSION:modern'));
      v = vfs.build({ gameDir: d, mods: ['as64+'], exe: 'mowas_2' });
      assert.deepEqual(v.mods, []);                                          // not discovered without as64
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });

  t('vfs as64: Workshop item loads in place, old copy skipped, mods/ name wins (VFS-51)', () => {
    const d = mk(true), ws = path.join(d, 'wsc');
    const wi = (n, title) => w(path.join(ws, n, 'mod.info'), `{Mod {Name "${title}"} {MinGameVersion "3.262"} {MaxGameVersion "3.262"}}\r\n`);
    wi('111', 'Item One'); w(path.join(ws, '111', 'resource', 'set', 'a.set'), 'item');
    wi('222', 'Legacy');
    w(path.join(d, 'mods', 'item one', 'mod.info'), info('3.262', '3.262'));
    w(path.join(d, 'mods', 'item one', 'resource', 'set', 'a.set'), 'oldcopy');
    w(path.join(d, 'mods', '111'), 'Item One\r\n');
    try {
      let v = vfs.build({ gameDir: d, mods: ['item one'], workshop: ws });
      assert.equal(txt(v, 'resource/set/a.set'), 'item');
      assert.ok(v.problems.some(p => p.code === 'MOD_WORKSHOP_COPY'));
      v = vfs.build({ gameDir: d, mods: ['legacy'], workshop: ws });
      assert.equal(txt(v, 'resource/set/a.set'), 'legacy');     // mods/legacy keeps the name, item 222 not loaded
      v = vfs.build({ gameDir: d, mods: ['item one'], workshop: ws, exe: 'mowas_2' });
      assert.equal(txt(v, 'resource/set/a.set'), 'oldcopy');    // mowas_2 copies (VFS-31)
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });

  // case-sensitive file system emulated over a real temp dir: a path under base is found only when every segment has the
  // exact on-disk case (as Linux does); outside base the real fs answers. Proves vfs asks fs with real names only.
  function strictFs(base) {
    const ok = p => {
      const rel = path.relative(base, path.resolve(String(p)));
      if (rel.startsWith('..') || path.isAbsolute(rel)) return true;
      let cur = base;
      for (const s of rel.split(path.sep).filter(Boolean)) { if (!fs.readdirSync(cur).includes(s)) return false; cur = path.join(cur, s); }
      return true;
    };
    const no = p => Object.assign(new Error('ENOENT (strict case) ' + p), { code: 'ENOENT' });
    const g = f => (p, o) => { if (!ok(p)) throw no(p); return fs[f](p, o); };
    return { statSync: g('statSync'), readdirSync: g('readdirSync'), readFileSync: g('readFileSync') };
  }
  t('vfs case: mixed-case mod folders and fixed names found on a case-strict fs, same result as plain fs', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vfsci-'));
    const { zip } = require('../zipwrite');
    try {
      w(path.join(d, 'Resource', 'Set', 'A.Set'), 'base');
      w(path.join(d, 'Mods', 'MyMod', 'Mod.Info'), info('3.262', '3.262'));
      w(path.join(d, 'Mods', 'MyMod', 'Resource', 'Entity', 'Vehicle', 'Tank.DEF'), 'tank');
      w(path.join(d, 'Mods', 'MyMod', 'Localization', 'X.lng'), 'loc');
      fs.writeFileSync(path.join(d, 'Mods', 'MyMod', 'Resource.PAK'), zip([['Set/A.Set', Buffer.from('pak'), false]]));
      fs.writeFileSync(path.join(d, 'Mods', 'MyMod', '1.PAT'), zip([['p.patch', Buffer.from('{patch {id 1} {delete "set/b.set"}}\r\n'), false]]));
      const S = strictFs(d), sum = v => [...v.files].map(([k, r]) => k + '=' + r.layer + ':' + vfs.readRec(r).toString()).sort().join('|');
      // the fake really is strict: the old fixed-name join misses
      assert.throws(() => S.statSync(path.join(d, 'mods', 'mymod', 'mod.info')));
      const a = vfs.build({ gameDir: d, mods: ['mymod:1'], workshop: false, fs: S });
      assert.deepEqual(a.mods, ['mymod']);
      assert.equal(txt(a, 'resource/entity/vehicle/tank.def'), 'tank');
      assert.equal(txt(a, 'resource/set/a.set'), 'pak');                      // mod resource.pak over base Resource/
      assert.equal(txt(a, 'resource/interface/text/x.lng'), 'loc');
      assert.deepEqual(a.problems.filter(p => p.level === 'error'), []);
      const b = vfs.build({ gameDir: d, mods: ['mymod:1'], workshop: false });   // Windows fs: identical
      assert.equal(sum(a), sum(b)); assert.deepEqual(a.problems, b.problems); assert.deepEqual(a.shadows.length, b.shadows.length);
    } finally { fs.rmSync(d, { recursive: true, force: true }); vfs.closeRecs(); }
  });
  t('vfs case: two names differing only by case (case-strict fs) -> CASE_CLASH info, exact-case one used', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vfsci-'));
    try {
      w(path.join(d, 'resource', 'a.set'), 'lower');
      // NTFS cannot hold both names: emulate the second one in the listing only
      const S = strictFs(d), rd = S.readdirSync;
      S.readdirSync = (p, o) => { const r = rd(p, o); return path.resolve(p) === path.resolve(d, 'resource') ? r.concat('A.SET') : r; };
      const st = S.statSync;
      S.statSync = (p, o) => st(path.resolve(p) === path.resolve(d, 'resource', 'A.SET') ? path.join(d, 'resource', 'a.set') : p, o);
      const v = vfs.build({ gameDir: d, workshop: false, fs: S });
      assert.ok(v.problems.some(p => p.code === 'CASE_CLASH' && p.level === 'info'));
      assert.ok(v.files.has('resource/a.set'));
      assert.ok(!vfs.build({ gameDir: d, workshop: false }).problems.some(p => p.code === 'CASE_CLASH'));
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });

  t('vfs goh: exe found, localizations/<lang> at resource/, GoH version gate', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vfsgoh-'));
    try {
      w(path.join(d, 'binaries', 'x64', 'call_to_arms.exe'), 'x');        // no PE: version falls back to 1.067
      w(path.join(d, 'resource', 'entity', 'e.def'), 'base');
      w(path.join(d, 'localizations', 'default', 'interface', 'text', 'm.pot'), 'def');
      w(path.join(d, 'localizations', 'ru', 'interface', 'text', 'm.pot'), 'ru');
      w(path.join(d, 'mods', 'ok', 'mod.info'), '{mod {name "ok"} {minGameVersion "1.060"}}\r\n');   // Max absent = open [I]
      w(path.join(d, 'mods', 'ok', 'resource', 'entity', 'e.def'), 'mod');
      w(path.join(d, 'mods', 'ok', 'localizations', 'default', 'interface', 'text', 'm.pot'), 'moddef');
      w(path.join(d, 'mods', 'new', 'mod.info'), '{mod {name "new"} {minGameVersion "1.500"} {maxGameVersion "1.510"}}\r\n');
      let v = vfs.build({ gameDir: d, mods: ['ok', 'new'], workshop: false });
      assert.equal(v.exe, 'goh'); assert.deepEqual(v.mods, ['ok']);
      assert.equal(txt(v, 'resource/entity/e.def'), 'mod');
      assert.equal(txt(v, 'resource/interface/text/m.pot'), 'moddef');
      assert.ok(codes(v).includes('MOD_VERSION:new'));
      assert.ok(!codes(v).some(c => c.startsWith('MOD_ROOT_IGNORED')));
      v = vfs.build({ gameDir: d, lang: 'ru', workshop: false });
      assert.equal(txt(v, 'resource/interface/text/m.pot'), 'ru');
      assert.equal(vfs.build({ gameDir: d, mods: ['new'], gameVersion: '1.505', workshop: false }).mods[0], 'new');
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });
};
// standalone: node tools/lib/test/vfsas64.test.js
if (require.main === module) {
  let n = 0, bad = 0;
  module.exports((name, fn) => { try { fn(); n++; } catch (e) { bad++; console.log('FAIL ' + name + ': ' + e.message); } }, require('assert'));
  console.log(bad ? `${bad} FAILED, ${n} passed` : `${n} passed`);
  if (bad) process.exitCode = 1;
}
