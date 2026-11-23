// --asset mode (COV-MIX3 C31): copy one vfs file into the mod, optional --tint on an uncompressed TGA, refusals
// Author: Imperator_Aug (ARSENAL, ia-c5300121)
const fs = require('fs'), path = require('path'), os = require('os'), { run } = require('../clone-entity.js');
const w = fs.mkdtempSync(path.join(os.tmpdir(), 'clone-asset-')), G = path.join(w, 'game'), M = path.join(G, 'mods', 'm');
const tga = path.join(G, 'resource/interface/scene/bar/bkg.tga'), dds = path.join(G, 'resource/interface/icon/x.dds');
const hdr = Buffer.alloc(18); hdr[2] = 2; hdr.writeUInt16LE(2, 12); hdr.writeUInt16LE(1, 14); hdr[16] = 32;
fs.mkdirSync(path.dirname(tga), { recursive: true }); fs.mkdirSync(path.dirname(dds), { recursive: true }); fs.mkdirSync(M, { recursive: true });
fs.writeFileSync(tga, Buffer.concat([hdr, Buffer.from([100, 100, 100, 255, 200, 50, 10, 128])]));   // 2 px BGRA
fs.writeFileSync(dds, Buffer.from('DDS fake'));
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL ' + m); } };
const codes = r => r.rep.toJSON({ tool: 'x' }).findings.map(f => f.code).join(',');
try {
  let r = run({ gameDir: G, out: M, asset: 'interface\\scene\\bar\\bkg.tga', sets: [], swaps: [] });
  ok(!r.blocked && r.plan.length === 1 && r.plan[0].rel === 'resource/interface/scene/bar/bkg.tga', 'same-key plan ' + JSON.stringify(r.plan.map(p => p.rel)));
  ok(r.plan[0] && Buffer.compare(r.plan[0].data, fs.readFileSync(tga)) === 0, 'bytes as-is');
  r = run({ gameDir: G, out: M, asset: 'resource/interface/scene/bar/bkg.tga', tint: '1,0,0', sets: [], swaps: [] });
  const d = r.plan[0] && r.plan[0].data;
  ok(d && d[18] === 0 && d[19] === 0 && d[20] === 100 && d[21] === 255 && d[22] === 0 && d[24] === 10 && d[25] === 128, 'tint red only, alpha kept ' + (d && [...d.slice(18)]));
  r = run({ gameDir: G, out: M, asset: 'interface/icon/x.dds', as: 'interface/icon/y.dds', sets: [], swaps: [] });
  ok(!r.blocked && r.plan[0].rel === 'resource/interface/icon/y.dds', 'new key');
  r = run({ gameDir: G, out: M, asset: 'interface/icon/x.dds', tint: '1,0,0', sets: [], swaps: [] });
  ok(r.blocked && codes(r) === 'CLONE_TINT_UNSUPPORTED', 'tint non-tga ' + codes(r));
  r = run({ gameDir: G, out: M, asset: 'interface/icon/none.dds', sets: [], swaps: [] });
  ok(r.blocked && codes(r) === 'CLONE_BASE_MISSING', 'missing ' + codes(r));
  r = run({ gameDir: G, out: M, asset: 'interface/icon/x.dds', as: '../x.dds', sets: [], swaps: [] });
  ok(r.blocked && codes(r) === 'CLONE_BAD_ARGS', 'dotdot ' + codes(r));
  fs.mkdirSync(path.join(M, 'resource/interface/icon'), { recursive: true }); fs.writeFileSync(path.join(M, 'resource/interface/icon/x.dds'), 'm');
  r = run({ gameDir: G, out: M, asset: 'interface/icon/x.dds', sets: [], swaps: [] });
  ok(r.blocked && codes(r) === 'CLONE_ENTITY_EXISTS', 'exists ' + codes(r));
  // CHAIN-N4: --tint on a DDS writes <stem>.tga, so the mod's own <stem>.dds (from --copy-assets) must not block it; an existing .tga still does
  const rh = Buffer.alloc(128); rh.write('DDS ', 0); rh.writeUInt32LE(124, 4); rh.writeUInt32LE(0x100F, 8); rh.writeUInt32LE(1, 12); rh.writeUInt32LE(2, 16); rh.writeUInt32LE(8, 20);
  rh.writeUInt32LE(32, 76); rh.writeUInt32LE(0x41, 80); rh.writeUInt32LE(32, 88); rh.writeUInt32LE(0xff0000, 92); rh.writeUInt32LE(0xff00, 96); rh.writeUInt32LE(0xff, 100); rh.writeUInt32LE(0xff000000, 104);
  fs.writeFileSync(path.join(G, 'resource/interface/icon/raw.dds'), Buffer.concat([rh, Buffer.from([10, 20, 100, 255, 50, 60, 70, 255])]));
  fs.writeFileSync(path.join(M, 'resource/interface/icon/raw.dds'), 'own copy');
  r = run({ gameDir: G, out: M, asset: 'interface/icon/raw.dds', tint: '2,0,2', sets: [], swaps: [] });
  ok(!r.blocked && r.plan[0] && r.plan[0].rel === 'resource/interface/icon/raw.tga', 'tint dds beside own dds ' + codes(r));
  fs.writeFileSync(path.join(M, 'resource/interface/icon/raw.tga'), 'own tga');
  r = run({ gameDir: G, out: M, asset: 'interface/icon/raw.dds', tint: '2,0,2', sets: [], swaps: [] });
  ok(r.blocked && codes(r) === 'CLONE_ENTITY_EXISTS', 'tint dds onto own tga ' + codes(r));
  // C2c (CHAIN-T s6): an as64 install, mod Requires as64+ (MinGameVersion 3.301 = Enhanced) listed without as64+ -> vfs drops it (MOD_MODE);
  // the error names that, not CLONE_BASE_MISSING. Old tool: CLONE_BASE_MISSING
  fs.writeFileSync(path.join(G, 'as64.exe'), 'x'); fs.mkdirSync(path.join(G, 'as64', 'plus'), { recursive: true });
  fs.writeFileSync(path.join(G, 'as64', 'plus', 'mod.info'), '{Mod {Name "p"} {MinGameVersion "3.301"}}\r\n');
  const E = path.join(G, 'mods', 'enh'); fs.mkdirSync(path.join(E, 'resource/texture'), { recursive: true });
  fs.writeFileSync(path.join(E, 'mod.info'), '{Mod {Name "e"} {MinGameVersion "3.301"} {Require "as64+"}}\r\n'); fs.writeFileSync(path.join(E, 'resource/texture/only.dds'), 'DDS m');
  r = run({ gameDir: G, mods: ['enh'], out: M, asset: 'texture/only.dds', sets: [], swaps: [] });
  const msg = r.rep.toJSON({ tool: 'x' }).findings.map(f => f.message || f.msg || '').join(' ');
  ok(r.blocked && codes(r) === 'CLONE_MOD_DROPPED' && /MOD_MODE/.test(msg) && /--mods as64\+,<mod>/.test(msg), 'dropped mod named ' + codes(r) + ' ' + msg);
  r = run({ gameDir: G, mods: ['as64+', 'enh'], out: M, asset: 'texture/only.dds', sets: [], swaps: [] });
  ok(!r.blocked && r.plan[0] && r.plan[0].rel === 'resource/texture/only.dds', 'as64+ listed: found ' + codes(r));
} finally { fs.rmSync(w, { recursive: true, force: true }); }
// ENCFIX: GoH model text keeps its bytes (UTF-8 strings stay UTF-8, « » № not '?'), BOM dropped, {##x -> {x; seeded defect = old cp1251 step
{ const { gohText } = require('../clone-entity.js'), enc = require('../../lib/enc');
  const src = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('{##turret 1} {name "«ёлка» №5"} ; коммент\r\n', 'utf8')]);
  const g = gohText(src);
  ok(g.equals(Buffer.from('{turret 1} {name "«ёлка» №5"} ; коммент\r\n', 'utf8')), 'gohText bytes kept: ' + g.toString('utf8'));
  ok(enc.encodeCp1251(src.toString('utf8')).includes(0x3F), 'seeded defect: cp1251 step loses « » №'); }
console.log(bad ? 'asset FAIL' : 'asset ok'); process.exit(bad ? 1 : 0);
