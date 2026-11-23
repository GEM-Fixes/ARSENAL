// Author: Imperator_Aug (ARSENAL, ia-dae6618e)
'use strict';
// ASSET-1: texture closure ($/model names with spaces, ../ paths), MISSING_TEXTURE, ATI2/BC5U/raw8 convert, AS2 key clash rename, texcheck exit code. Fixtures built in code.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const tc = require('../texconv.js');
const root = path.join(__dirname, 'fixture', 'asset1');
fs.rmSync(root, { recursive: true, force: true });
let bad = 0;
const ok = (c, m) => { if (!c) { console.log('FAIL asset1: ' + m); bad++; } };
const w = (p, b) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b); };

// ---- DDS builders (seeded: fixed bytes)
function hdr(wd, ht, mips, pf, extra = {}) {
  const b = Buffer.alloc(128); b.write('DDS ', 0, 'latin1'); b.writeUInt32LE(124, 4); b.writeUInt32LE(0x1007 | (mips > 1 ? 0x20000 : 0), 8);
  b.writeUInt32LE(ht, 12); b.writeUInt32LE(wd, 16); b.writeUInt32LE(mips, 28); b.writeUInt32LE(32, 76);
  b.writeUInt32LE(pf.flags, 80); if (pf.fourcc) b.write(pf.fourcc, 84, 'latin1');
  b.writeUInt32LE(pf.bits || 0, 88); [pf.r, pf.g, pf.b, pf.a].forEach((m, i) => b.writeUInt32LE(m || 0, 92 + 4 * i)); b.writeUInt32LE(0x1000 | (mips > 1 ? 0x400008 : 0), 108);
  return b;
}
const blk = n => Math.max(1, Math.ceil(n / 4));
function bc4(e0, e1, idx) { const b = Buffer.alloc(8); b[0] = e0; b[1] = e1; let bits = 0n; for (let i = 0; i < 16; i++) bits |= BigInt(idx[i] || 0) << BigInt(3 * i); for (let i = 0; i < 6; i++) b[2 + i] = Number((bits >> BigInt(8 * i)) & 0xffn); return b; }
function ati2(wd, ht, mips, xe, ye, fourcc = 'ATI2') {
  const parts = [hdr(wd, ht, mips, { flags: 4, fourcc })]; let w2 = wd, h2 = ht;
  for (let m = 0; m < mips; m++) { for (let i = 0; i < blk(w2) * blk(h2); i++) parts.push(bc4(xe, xe, []), bc4(ye, ye, [])); w2 = Math.max(1, w2 >> 1); h2 = Math.max(1, h2 >> 1); }
  return Buffer.concat(parts);
}
const dxt1 = (wd, ht, seed) => { const d = Buffer.alloc(blk(wd) * blk(ht) * 8, seed); return Buffer.concat([hdr(wd, ht, 1, { flags: 4, fourcc: 'DXT1' }), d]); };
const px = (buf, o) => ({ b: buf[o], g: buf[o + 1], r: buf[o + 2], a: buf[o + 3] });

// ---- 1. texconv units
{
  const src = ati2(8, 8, 4, 128, 128);
  const r = tc.convert(src);
  ok(r && r.kind === 'ATI2', 'ATI2 not detected');
  ok(r && r.buf.length === 128 + (64 + 16 + 4 + 1) * 4, 'ATI2 out size ' + (r && r.buf.length));
  ok(r && r.buf.readUInt32LE(28) === 4, 'mip count kept');
  ok(r && r.buf.readUInt32LE(88) === 32 && r.buf.readUInt32LE(92) === 0xff0000 && r.buf.readUInt32LE(104) === 0xff000000, 'A8R8G8B8 masks');
  ok(r && !(r.buf.readUInt32LE(80) & 4), 'no FOURCC flag left');
  const p = r && px(r.buf, 128);
  ok(p && p.r === 0 && p.g === 128 && p.a === 128 && p.b === 255, 'flat normal pixel ' + JSON.stringify(p));
  const q = tc.convert(ati2(4, 4, 1, 255, 0, 'BC5U'));
  const pq = q && px(q.buf, 128);
  ok(q && q.kind === 'BC5U' && pq.a === 255 && pq.g === 0 && pq.b === 128, 'BC5U out-of-circle pixel ' + JSON.stringify(pq));
  // interpolation: e0<e1 -> index 6 = 0, 7 = 255
  const ix = [6, 7, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const d = tc.decodeBC4(Buffer.concat([bc4(10, 200, ix)]), 0);
  ok(d[0] === 0 && d[1] === 255 && d[3] === 10 && d[2] === Math.round((4 * 10 + 1 * 200) / 5), 'bc4 6-interp ' + d.slice(0, 4));
  const d8 = tc.decodeBC4(bc4(200, 10, [0, 1, 2, 7]), 0);
  ok(d8[0] === 200 && d8[1] === 10 && d8[2] === Math.round((6 * 200 + 10) / 7) && d8[3] === Math.round((1 * 200 + 6 * 10) / 7), 'bc4 8-interp ' + d8.slice(0, 4));
  // raw8 luminance
  const l8 = Buffer.concat([hdr(4, 4, 1, { flags: 0x20000, bits: 8, r: 0xff }), Buffer.alloc(16, 77)]);
  const rl = tc.convert(l8);
  ok(rl && rl.kind === 'raw8' && px(rl.buf, 128).r === 77 && px(rl.buf, 128).a === 255 && rl.buf.length === 128 + 64, 'raw8 luminance');
  ok(tc.convert(dxt1(8, 8, 1)) === null, 'DXT1 passes through unconverted');
  ok(tc.kindOf(Buffer.from('not a dds file at all, long enough to read a header from ....'.repeat(4))) === 'notdds', 'not dds');
}

// ---- 2. build fixture
const goh = path.join(root, 'goh'), as2 = path.join(root, 'as2');
const T = k => path.join(goh, 'resource', 'texture', 'common', k);
w(path.join(goh, 'resource/entity/tk/tk.def'), '{game_entity\r\n\t{Extension "tk.mdl"}\r\n}\r\n');
w(path.join(goh, 'resource/entity/tk/tk.mdl'), '{mdl}\r\n');
const mtl = extra => '{material bump\r\n\t{diffuse "$/model/m4a3e8/sherman m4a3e8"}\r\n\t{bump "$/model/m4a3e8/sherman m4a3e8_bp"}\r\n\t{specular "../../texture/common/model/x_sp"}\r\n\t{diffuse1 "$/model/clash/sk"}\r\n' + extra + '}\r\n';
w(path.join(goh, 'resource/entity/tk/tk.mtl'), mtl('\t{mask "$/model/none/nowhere"}\r\n'));
w(T('model/m4a3e8/sherman m4a3e8.dds'), dxt1(8, 8, 3));
w(T('model/m4a3e8/sherman m4a3e8_bp.dds'), ati2(8, 8, 4, 128, 128));
w(T('model/x_sp.dds'), dxt1(8, 8, 4));
w(T('model/clash/sk.dds'), dxt1(8, 8, 5));
w(path.join(as2, 'resource/texture/common/model/clash/sk.dds'), dxt1(8, 8, 9));   // same key, other bytes
const run = (script, args) => cp.spawnSync('node', [path.join(__dirname, '..', script), ...args], { encoding: 'utf8' });
const out1 = path.join(root, 'out1');
const b1 = run('goh2as2.js', ['--goh', goh, '--game', as2, '--entity', 'tk', '--out', out1, '--no-keylint', '--no-rc']);
const R = p => path.join(out1, 'resource', p);
ok(fs.existsSync(R('texture/common/model/m4a3e8/sherman m4a3e8.dds')), 'space-named $/model diffuse pulled');
ok(fs.existsSync(R('texture/common/model/m4a3e8/sherman m4a3e8_bp.dds')), 'space-named bump pulled');
ok(fs.existsSync(R('texture/common/model/x_sp.dds')), '../ specular pulled');
{
  const bp = fs.readFileSync(R('texture/common/model/m4a3e8/sherman m4a3e8_bp.dds'));
  ok(tc.kindOf(bp) === 'a8r8g8b8', 'bump converted: ' + tc.kindOf(bp));
}
ok(/WARN_PORT_MISSING_TEXTURE[^\n]*nowhere/.test(b1.stdout), 'MISSING_TEXTURE named in the build report');
ok(!/WARN_PORT_MISSING_TEXTURE[^\n]*sherman/.test(b1.stdout), 'no false MISSING_TEXTURE for pulled textures');
ok(/PORT_DDS_CONVERTED/.test(b1.stdout), 'conversion reported');
ok(!fs.existsSync(R('texture/common/model/clash/sk.dds')), 'clashing key not written over AS2');
const renamed = fs.existsSync(R('texture/common/model')) ? fs.readdirSync(R('texture/common/model/clash')) : [];
ok(renamed.length === 1 && renamed[0] !== 'sk.dds', 'clashing texture written under a new name: ' + renamed);
{
  const m = fs.readFileSync(R('entity/tk/tk.mtl'), 'latin1');
  ok(renamed.length === 1 && m.includes(renamed[0].replace(/\.dds$/, '')), 'mtl points at the renamed texture');
  ok(!/diffuse1 "\$\/model\/clash\/sk"/.test(m), 'old clash name gone from mtl');
}
// ---- 3. texcheck
const ck = (dir, extra = []) => run('texcheck.js', [dir, '--game', as2, ...extra]);
const c1 = ck(out1);
ok(c1.status === 1 && /MISSING_TEXTURE[^\n]*nowhere/.test(c1.stdout), 'texcheck exit 1 on the planted miss: ' + c1.status + c1.stdout.slice(0, 200));
ok(!/MISSING_TEXTURE[^\n]*(sherman|x_sp|clash)/.test(c1.stdout), 'texcheck: only the planted miss');
w(path.join(goh, 'resource/entity/tk/tk.mtl'), mtl(''));
const out2 = path.join(root, 'out2');
const b2 = run('goh2as2.js', ['--goh', goh, '--game', as2, '--entity', 'tk', '--out', out2, '--no-keylint', '--no-rc']);
ok(!/MISSING_TEXTURE/.test(b2.stdout), 'clean build has no MISSING_TEXTURE');
const c2 = ck(out2);
ok(c2.status === 0, 'texcheck exit 0 on a complete mod: ' + c2.status + c2.stdout.slice(0, 300));
// an unconverted ATI2 left in a folder is flagged
w(path.join(out2, 'resource/texture/common/model/raw_bp.dds'), ati2(4, 4, 1, 128, 128));
const c3 = ck(out2);
ok(c3.status === 1 && /raw_bp\.dds:0: DDS_UNLOADABLE ATI2/.test(c3.stdout), 'texcheck flags an ATI2 file as unloadable');
fs.rmSync(path.join(out2, 'resource/texture/common/model/raw_bp.dds'));
// a missing file spelled with .. only resolves when collapsed
w(path.join(out2, 'resource/entity/tk/up.mtl'), '{material simple\r\n\t{diffuse "../../texture/common/model/x_sp"}\r\n}\r\n');
ok(ck(out2).status === 0, '.. collapsed by texcheck');
w(path.join(out2, 'resource/entity/tk/up.mtl'), '{material simple\r\n\t{diffuse "../../texture/common/model/x_spp"}\r\n}\r\n');
ok(ck(out2).status === 1, 'near-miss under .. is a miss');

// ---- 4. lightmap: dropped by default, multiply + diffuse1 with --lightmap-multiply
w(path.join(goh, 'resource/entity/lm/lm.def'), '{game_entity\r\n\t{Extension "lm.mdl"}\r\n}\r\n');
w(path.join(goh, 'resource/entity/lm/lm.mdl'), '{mdl}\r\n');
w(path.join(goh, 'resource/entity/lm/lm.mtl'), '{material bump\r\n\t{diffuse "$/model/x_sp"}\r\n\t{lightmap "$/model/lmap"}\r\n}\r\n');
w(T('model/lmap.dds'), dxt1(8, 8, 6));
const L1 = path.join(root, 'lm1'), L2 = path.join(root, 'lm2');
const l1 = run('goh2as2.js', ['--goh', goh, '--game', as2, '--entity', 'lm', '--out', L1, '--no-keylint', '--no-rc']);
const l2 = run('goh2as2.js', ['--goh', goh, '--game', as2, '--entity', 'lm', '--out', L2, '--no-keylint', '--no-rc', '--lightmap-multiply']);
const m1 = fs.readFileSync(path.join(L1, 'resource/entity/lm/lm.mtl'), 'latin1'), m2 = fs.readFileSync(path.join(L2, 'resource/entity/lm/lm.mtl'), 'latin1');
ok(!/lightmap|diffuse1/.test(m1) && /material bump/.test(m1), 'default: lightmap key dropped, type kept: ' + m1);
ok(/material multiply/.test(m2) && /\{diffuse1 "\$\/model\/lmap"\}/.test(m2) && !/lightmap/.test(m2), 'option: multiply + diffuse1: ' + m2);
ok(fs.existsSync(path.join(L2, 'resource/texture/common/model/lmap.dds')) && fs.existsSync(path.join(L1, 'resource/texture/common/model/lmap.dds')), 'lightmap texture pulled either way');
ok(ck(L2).status === 0, 'texcheck clean on the multiply build: ' + ck(L2).stdout);

// ---- 5. FIX-PORT assets:16: a {specular} texture in no GoH pak (us-m2a1_lt "$/model/m2a4_sp") is dropped from the mtl, not left as a checker; a missing diffuse still warns
w(path.join(goh, 'resource/entity/sp/sp.def'), '{game_entity\r\n\t{Extension "sp.mdl"}\r\n}\r\n');
w(path.join(goh, 'resource/entity/sp/sp.mdl'), '{mdl}\r\n');
w(path.join(goh, 'resource/entity/sp/sp.mtl'), '{material bump\r\n\t{diffuse "$/model/x_sp"}\r\n\t{specular "$/model/m2a4_sp"}\r\n\t{color "229 229 229 25"}\r\n}\r\n');
const S1 = path.join(root, 'sp1');
const s1 = run('goh2as2.js', ['--goh', goh, '--game', as2, '--entity', 'sp', '--out', S1, '--no-keylint', '--no-rc']);
const sm = fs.readFileSync(path.join(S1, 'resource/entity/sp/sp.mtl'), 'latin1');
ok(/WARN_PORT_SPECULAR_DROPPED[^\n]*m2a4_sp/.test(s1.stdout) && !/WARN_PORT_MISSING_TEXTURE/.test(s1.stdout), 'missing specular reported as dropped: ' + s1.stdout.slice(0, 400));
ok(!/specular/.test(sm) && /\{diffuse "\$\/model\/x_sp"\}\r\n\t\{color "229 229 229 25"\}\r\n/.test(sm), 'specular line gone, rest kept CRLF: ' + JSON.stringify(sm));
ok(ck(S1).status === 0, 'texcheck clean after the drop: ' + ck(S1).stdout);

if (bad) process.exit(1);
console.log('asset1 ok');
