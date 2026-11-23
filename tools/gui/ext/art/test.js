// art ext test: no game, no network. Builds a fake game folder (loose resource tree) and a mod folder in the scratch dir. Arg: scratch dir.
// Author: Imperator_Aug (ARSENAL, ia-074af22d)
'use strict';
const fs = require('fs'), path = require('path');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'art-')));
require('../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const C = require('./core'), X = require('./index'), D = require('./data');
let bad = 0, ok = 0;
const t = (c, m) => { if (c) ok++; else { bad++; console.log('FAIL ' + m); } };
const rejects = async (f, re, m) => { try { await f(); t(false, m + ' (no error)'); } catch (e) { t(re.test(e.message), m + ' (' + e.message + ')'); } };
// CACHE: the routes read the mod through the shared walk (lib/modtree), which reads a folder again 15 s after its last scan or when it
// was touched (every GUI write route does that); a fixture file written here is such a write, so put() touches the walk of its root
const MT = require('../../../lib/modtree'); MT._reset({ store: null });   // nothing kept outside this run
const put = (root, rel, data) => { const p = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); MT.touch(root); };

// ---- header readers
function wav(tag, ch, rate, bits, n) { const b = Buffer.alloc(44 + n); b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(tag, 20); b.writeUInt16LE(ch, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * ch * bits / 8, 28); b.writeUInt16LE(ch * bits / 8, 32); b.writeUInt16LE(bits, 34); b.write('data', 36); b.writeUInt32LE(n, 40); return b; }
let r = C.wavInfo(wav(1, 1, 44100, 16, 88200));
t(r.ok && r.codec === 'PCM' && r.seconds === 1, 'wav pcm good');
r = C.wavInfo(wav(0x11, 1, 44100, 4, 400)); t(r.ok && r.codec === 'IMA ADPCM', 'wav ima good');
r = C.wavInfo(wav(1, 2, 48000, 16, 400)); t(!r.ok && r.warn.length === 2, 'wav stereo+rate warn');
r = C.wavInfo(wav(1, 1, 44100, 8, 400)); t(!r.ok && /8-bit/.test(r.plain), 'wav 8-bit warn');
r = C.wavInfo(Buffer.concat([Buffer.from('OggS'), Buffer.alloc(40)])); t(r.kind === 'ogg' && !r.ok, 'ogg named');
r = C.wavInfo(Buffer.concat([Buffer.from('ID3\u0003'), Buffer.alloc(40)])); t(r.kind === 'mp3', 'mp3 named');
r = C.wavInfo(Buffer.alloc(4)); t(r.kind === 'short', 'short');
r = C.wavInfo(Buffer.alloc(60)); t(r.kind === 'notwav', 'not wav');
function dds(w, h, cc) { const b = Buffer.alloc(128); b.write('DDS ', 0); b.writeUInt32LE(124, 4); b.writeUInt32LE(h, 12); b.writeUInt32LE(w, 16); b.writeUInt32LE(1, 28); b.writeUInt32LE(4, 80); b.write(cc, 84); return b; }
let im = C.imgInfo(dds(256, 256, 'DXT5'), '.dds'); t(im.w === 256 && im.format === 'DXT5' && !im.warn.length, 'dds ok');
im = C.imgInfo(dds(256, 256, 'DX10'), '.dds'); t(im.warn.length === 1 && /DX10/.test(im.warn[0]), 'dds dx10');
im = C.imgInfo(dds(250, 256, 'DXT1'), '.dds'); t(im.warn.length === 1 && /multiple of 4/.test(im.warn[0]), 'dds mult4');
const png = Buffer.alloc(33); png.writeUInt32BE(0x89504E47, 0); png.writeUInt32BE(64, 16); png.writeUInt32BE(32, 20);
im = C.imgInfo(png, '.png'); t(im.w === 64 && im.h === 32, 'png size');

// ---- texmods
let tm = C.texModsOf('{Extension "x"}\n{TexMods\n {"Autumn" "aut"}\n {"1" "1"}\n}\n');
t(tm.has && tm.pairs.length === 2 && tm.pairs[0][1] === 'aut', 'texmods parse');
t(!C.texModsOf('{Entity}').has, 'texmods none');

// ---- fake game
const game = path.join(work, 'game'), mod = path.join(work, 'mymod');
fs.mkdirSync(path.join(game, 'resource'), { recursive: true }); fs.mkdirSync(mod, { recursive: true });
put(game, 'resource/entity/vehicle/tank/zz1.def', '{Extension "vehicle"}\r\n{Model "vehicle/tank/zz1"}\r\n{FireSound "mg34"}\r\n');
put(game, 'resource/entity/vehicle/tank/zz1.mdl', '{model\r\n (ply "zz1_hull.ply")\r\n (mtl "zz1.mtl")\r\n}\r\n');
put(game, 'resource/entity/vehicle/tank/zz1.mtl', '{Material {Diffuse "zz1_body"}}\r\n');
put(game, 'resource/entity/vehicle/tank/zz1_body.dds', dds(256, 256, 'DXT5'));
put(game, 'resource/entity/vehicle/tank/zz1_body#aut.dds', dds(256, 256, 'DXT5'));
put(game, 'resource/entity/vehicle/tank/zz1_hull.ply', Buffer.alloc(64));
put(game, 'resource/interface/scene/unit_icon/zz1_00.tga', Buffer.alloc(40));
const tgaHdr = (w, h) => { const b = Buffer.alloc(18 + w * h * 4); b[2] = 2; b.writeUInt16LE(w, 12); b.writeUInt16LE(h, 14); b[16] = 32; b[17] = 8; return b; };
put(game, 'resource/interface/scene/unit_icon/zz3_00.tga', tgaHdr(100, 50));   // a game icon whose size wins over the fallback
put(game, 'resource/set/stuff/mg34.def', '{Stuff\r\n {fireSound "mg34"}\r\n {reloadSound "mg34"}\r\n}\r\n');
put(game, 'resource/sound/weapon/shot/mg34/1.wav', wav(0x11, 1, 44100, 4, 400));
put(game, 'resource/sound/weapon/shot/mg34/2.wav', wav(0x11, 1, 44100, 4, 400));
const ctx = { gamedir: game, tools: {}, tmpRoot: path.join(work, 'tmp'), game: () => game, allowLaunch: false, runTool: async () => ({ code: 1, stdout: '', stderr: 'not available in test' }) };
const url = (p, o) => { const u = new URL('http://x' + p); for (const k of Object.keys(o || {})) u.searchParams.set(k, o[k]); return u; };
const R = X.routes;
const call = (key, u, body) => R[key](u, body, ctx);

(async () => {
  // contract
  t(X.id === 'art' && X.nav === 'art.nav' && typeof X.script === 'string', 'ext shape');
  t(!/`|\$\{/.test(X.script) && !/\.innerHTML\s*=|insertAdjacentHTML|document\.write/.test(X.script), 'script rules');
  for (const k of Object.keys(R)) t(/^(GET|POST) \/api\/x\/art\/[a-z-]+$/.test(k), 'route name ' + k);
  const en = Object.keys(X.lang.en);
  for (const c of ['ru', 'uk', 'zh']) t(en.every(k => X.lang[c][k]) && Object.keys(X.lang[c]).length === en.length, 'lang ' + c + ' keys');
  t(en.length > 150, 'lang has strings');

  // unit
  let u = await call('GET /api/x/art/unit', url('/api/x/art/unit', { name: 'zz1', mod }));
  t(u.found && u.unit === 'zz1', 'unit found: ' + JSON.stringify(u).slice(0, 200));
  const roles = (u.groups || []).map(g => g.role);
  t(roles.includes('def') && roles.includes('texture') && roles.includes('mesh') && roles.includes('model'), 'unit roles ' + roles);
  t(roles.includes('icon'), 'unit icon role');
  u = await call('GET /api/x/art/unit', url('/api/x/art/unit', { name: 'nosuchunit', mod }));
  t(!u.found, 'unit not found');

  // copy preview then real
  const keys = ['resource/entity/vehicle/tank/zz1_body.dds', 'resource/entity/vehicle/tank/zz1.def', 'resource/nope/x.dds'];
  let p = await call('POST /api/x/art/copy', url('/api/x/art/copy'), { mod, keys, dry: true });
  t(p.dry && p.copy === 2 && p.missing === 1, 'copy dry plan');
  t(!fs.existsSync(path.join(mod, 'resource')), 'dry wrote nothing');
  p = await call('POST /api/x/art/copy', url('/api/x/art/copy'), { mod, keys });
  t(p.written === 2 && fs.existsSync(path.join(mod, 'resource/entity/vehicle/tank/zz1_body.dds')), 'copy wrote');
  p = await call('POST /api/x/art/copy', url('/api/x/art/copy'), { mod, keys, dry: true });
  t(p.skip === 2 && p.copy === 0, 'copy skip existing');
  p = await call('POST /api/x/art/copy', url('/api/x/art/copy'), { mod, keys, dry: true, overwrite: true });
  t(p.copy === 2, 'copy overwrite plan');
  await rejects(() => call('POST /api/x/art/copy', url('/api/x/art/copy'), { mod, keys: ['resource/../../evil.txt'] }), /Not a game file/, 'copy rejects ..');
  await rejects(() => call('POST /api/x/art/copy', url('/api/x/art/copy'), { mod, keys: [] }), /at least one/, 'copy rejects empty');
  await rejects(() => call('POST /api/x/art/copy', url('/api/x/art/copy'), { mod: game, keys }), /Refused/, 'copy refuses game dir');
  const goh = path.join(work, 'Call to Arms - Gates of Hell', 'mods', 'm'); fs.mkdirSync(goh, { recursive: true });
  await rejects(() => call('POST /api/x/art/copy', url('/api/x/art/copy'), { mod: goh, keys }), /Gates of Hell/, 'copy refuses GoH');
  const inner = path.join(game, 'mods', 'okmod'); fs.mkdirSync(inner, { recursive: true });
  p = await call('POST /api/x/art/copy', url('/api/x/art/copy'), { mod: inner, keys, dry: true }); t(p.copy === 2, 'game/mods/<x> allowed');
  await rejects(() => call('POST /api/x/art/copy', url('/api/x/art/copy'), { mod: path.join(game, 'resource'), keys }), /Refused/, 'copy refuses game/resource');

  // camo
  let c = await call('GET /api/x/art/camo', url('/api/x/art/camo', { name: 'zz1', mod }));
  t(c.found && c.textures.length >= 1 && c.textures[0].variants.length >= 1, 'camo info variants ' + JSON.stringify(c.textures));
  t(c.hasBlock === false, 'camo no block yet');
  let w = await call('POST /api/x/art/camo-write', url('/api/x/art/camo-write'), { mod, name: 'zz1', option: 'Autumn', variant: 'aut', dry: true });
  t(w.dry && w.how === 'new' && /\{"Autumn" "aut"\}/.test(w.line), 'camo preview');
  t(w.variantFileFound === true, 'camo variant file seen');
  const before = fs.readFileSync(path.join(mod, 'resource/entity/vehicle/tank/zz1.def'), 'latin1');
  w = await call('POST /api/x/art/camo-write', url('/api/x/art/camo-write'), { mod, name: 'zz1', option: 'Autumn', variant: 'aut' });
  const after = fs.readFileSync(path.join(mod, 'resource/entity/vehicle/tank/zz1.def'), 'latin1');
  t(w.written && after !== before && C.texModsOf(after).pairs.length === 1 && /\r\n/.test(after) && !/[^\r]\n/.test(after), 'camo wrote CRLF');
  w = await call('POST /api/x/art/camo-write', url('/api/x/art/camo-write'), { mod, name: 'zz1', option: 'Autumn', variant: 'aut' });
  t(w.written === false && w.how === 'same', 'camo idempotent');
  w = await call('POST /api/x/art/camo-write', url('/api/x/art/camo-write'), { mod, name: 'zz1', option: 'Winter', variant: 'win', dry: true });
  t(w.how === 'add', 'camo add to block');
  await rejects(() => call('POST /api/x/art/camo-write', url('/api/x/art/camo-write'), { mod, name: 'zz1', option: 'a"b', variant: 'x' }), /option name/, 'camo bad option');
  await rejects(() => call('POST /api/x/art/camo-write', url('/api/x/art/camo-write'), { mod: game, name: 'zz1', option: 'A', variant: 'a' }), /Refused/, 'camo refuses game dir');

  // sound
  let s = await call('GET /api/x/art/sound', url('/api/x/art/sound', { weapon: 'mg34' }));
  t(s.found !== false && JSON.stringify(s).includes('mg34'), 'sound found ' + JSON.stringify(s).slice(0, 200));
  await rejects(() => call('GET /api/x/art/sound', url('/api/x/art/sound', { weapon: 'bad name!' })), /weapon name/, 'sound bad name');

  // wav
  put(mod, 'resource/sound/my.wav', wav(1, 1, 44100, 16, 4000));
  let wv = await call('GET /api/x/art/wav', url('/api/x/art/wav', { path: 'resource/sound/my.wav', mod }));
  t(wv.ok && wv.codec === 'PCM', 'wav route relative to mod');
  await rejects(() => call('GET /api/x/art/wav', url('/api/x/art/wav', { path: 'resource/sound/none.wav', mod })), /does not exist/, 'wav missing');
  await rejects(() => call('GET /api/x/art/wav', url('/api/x/art/wav', { path: 'a.txt', mod })), /sound file/, 'wav bad ext');

  // icons
  let ic = await call('GET /api/x/art/icons', url('/api/x/art/icons', { name: 'zz1', mod }));
  t(JSON.stringify(ic).includes('unit_icon') && JSON.stringify(ic).includes('_03'), 'icons list frames ' + JSON.stringify(ic).slice(0, 160));

  // png -> tga needs artport: stub runTool fails => clean error, dry works
  const pngf = path.join(work, 'pic.png'); fs.writeFileSync(pngf, png);
  let pd = await call('POST /api/x/art/icon-png', url('/api/x/art/icon-png'), { mod, name: 'zz1', kind: 'icon', png: pngf, dry: true });
  t(pd.dry && pd.targets.length === 8, 'icon-png dry 8 targets ' + JSON.stringify(pd).slice(0, 200));
  await rejects(() => call('POST /api/x/art/icon-png', url('/api/x/art/icon-png'), { mod, name: 'zz1', kind: 'icon', png: pngf }), /Could not convert/, 'icon-png convert failure is plain');
  ctx.runTool = async (tool, entry, args) => { fs.writeFileSync(args[2], Buffer.alloc(30)); return { code: 0, stdout: '', stderr: '' }; };
  pd = await call('POST /api/x/art/icon-png', url('/api/x/art/icon-png'), { mod, name: 'zz1', kind: 'icon', png: pngf });
  t(pd.written === 8 && fs.existsSync(path.join(mod, 'resource/interface/scene/unit_icon_small/zz1_03.tga')), 'icon-png wrote 8');
  await rejects(() => call('POST /api/x/art/icon-png', url('/api/x/art/icon-png'), { mod: game, name: 'zz1', kind: 'icon', png: pngf }), /Refused/, 'icon-png refuses game dir');
  await rejects(() => call('POST /api/x/art/icon-png', url('/api/x/art/icon-png'), { mod, name: 'zz1', kind: 'icon', png: path.join(work, 'nope.png') }), /./, 'icon-png missing png');

  // icon-png fallback sizes for a name the game lacks = the vanilla sizes (seeded old 128x128 / 64x64 / 64x64 must fail here)
  const sz = async (name, kind) => (await call('POST /api/x/art/icon-png', url('/api/x/art/icon-png'), { mod, name, kind, png: pngf, dry: true })).targets;
  let tg = await sz('newunit', 'icon');
  t(tg.length === 8 && tg.filter(x => /\/unit_icon\//.test(x.key)).every(x => x.size === '104x52' && x.guessed) && tg.filter(x => /\/unit_icon_small\//.test(x.key)).every(x => x.size === '112x48' && x.guessed), 'icon fallback 104x52 / 112x48 ' + tg.map(x => x.size));
  t(!tg.some(x => x.size === '128x128' || x.size === '64x64'), 'icon fallback not the old 128x128 / 64x64');
  tg = await sz('newunit', 'portrait'); t(tg.length === 1 && tg[0].size === '97x135' && /portrait\/newunit\.tga$/.test(tg[0].key), 'portrait fallback 97x135 ' + JSON.stringify(tg));
  tg = await sz('newguy', 'squad'); t(tg.length === 3 && tg.every(x => x.size === '48x48') && /squad\/newguy_02\.tga$/.test(tg[2].key), 'squad card 48x48 x3 ' + JSON.stringify(tg).slice(0, 160));
  tg = await sz('newtank', 'scheme'); t(tg.length === 1 && tg[0].size === '97x140' && /structure\/newtank\/scheme\.tga$/.test(tg[0].key), 'scheme 97x140 ' + JSON.stringify(tg));
  tg = await sz('zz3', 'icon'); t(tg[0].size === '100x50' && !tg[0].guessed && tg[4].size === '112x48' && tg[4].guessed, 'icon size from the game file when there is one');
  tg = await sz('zz1', 'icon'); t(tg[0].size === '104x52', 'an unreadable 0x0 game icon falls back to 104x52');
  await rejects(() => call('POST /api/x/art/icon-png', url('/api/x/art/icon-png'), { mod, name: 'zz1', kind: 'flag', png: pngf, dry: true }), /Kind must be/, 'icon-png bad kind');

  // wav-convert: decode any wav lib/wav reads, write PCM16 / IMA ADPCM into the mod; plan writes nothing; refusals
  {
    const W = require('../../../lib/wav'), WC = 'POST /api/x/art/wav-convert', wc = b => call(WC, url('/api/x/art/wav-convert'), b);
    const tone = (ch, rate, n) => { const pcm = new Int16Array(n * ch); for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) pcm[i * ch + c] = Math.round(8000 * Math.sin(i * (c + 1) / 9)); return W.encodePcm16({ rate, channels: ch, pcm }); };
    put(mod, 'resource/sound/src/mono.wav', tone(1, 44100, 5000));
    put(mod, 'resource/sound/src/st48.wav', tone(2, 48000, 4800));
    let cv = await wc({ mod, src: 'resource/sound/src/mono.wav', out: 'resource/sound/conv/a.wav', format: 'ima', plan: true });
    t(cv.plan && !cv.written && cv.action === 'write' && cv.to.codec === 'IMA ADPCM' && cv.to.channels === 1 && cv.to.rate === 44100 && !fs.existsSync(path.join(mod, 'resource/sound/conv/a.wav')), 'wav-convert plan writes nothing ' + JSON.stringify(cv).slice(0, 200));
    cv = await wc({ mod, src: 'resource/sound/src/mono.wav', out: 'resource/sound/conv/a.wav', format: 'ima' });
    let pw = W.parse(fs.readFileSync(path.join(mod, 'resource/sound/conv/a.wav')));
    t(cv.written && pw.ok && pw.fmt.tag === 0x11 && pw.fmt.channels === 1 && pw.fmt.blockAlign === 1024 && pw.fmt.samplesPerBlock === 2041 && pw.frames === 5000, 'wav-convert wrote IMA 1024/2041 mono');
    await rejects(() => wc({ mod, src: 'resource/sound/src/mono.wav', out: 'resource/sound/conv/a.wav', format: 'pcm16' }), /already there/, 'wav-convert will not replace without replace');
    cv = await wc({ mod, src: 'resource/sound/src/mono.wav', out: 'resource/sound/conv/a.wav', format: 'pcm16', overwrite: true });
    pw = W.parse(fs.readFileSync(path.join(mod, 'resource/sound/conv/a.wav'))); t(cv.written && cv.action === 'replace' && pw.fmt.tag === 1 && pw.fmt.bits === 16, 'wav-convert replace with PCM16');
    cv = await wc({ mod, src: 'resource/sound/src/st48.wav', out: 'resource/sound/conv/st.wav', format: 'ima' });
    pw = W.parse(fs.readFileSync(path.join(mod, 'resource/sound/conv/st.wav'))); t(pw.fmt.channels === 2 && pw.fmt.rate === 48000 && pw.fmt.blockAlign === 2048, 'wav-convert keeps stereo and the rate');
    cv = await wc({ mod, src: 'resource/sound/src/st48.wav', out: 'resource/sound/conv/st22.wav', format: 'pcm16', rate: 22050 });
    pw = W.parse(fs.readFileSync(path.join(mod, 'resource/sound/conv/st22.wav'))); t(pw.fmt.rate === 22050 && pw.fmt.channels === 2 && Math.abs(pw.frames - 2205) <= 1, 'wav-convert rate when asked ' + pw.frames);
    await rejects(() => wc({ mod, src: 'resource/sound/src/mono.wav', out: 'resource/sound/conv/b.wav', format: 'ima', rate: 48000 }), /44100 or 22050/, 'wav-convert other rates refused');
    await rejects(() => wc({ mod, src: 'resource/sound/src/mono.wav', out: 'resource/sound/conv/b.wav', format: 'mp3' }), /new format/, 'wav-convert bad format');
    // source only inside the mod or the GUI temp root
    const outside = path.join(work, 'outside.wav'); fs.writeFileSync(outside, tone(1, 44100, 100));
    await rejects(() => wc({ mod, src: outside, out: 'resource/sound/conv/b.wav', format: 'ima', plan: true }), /Refused/, 'wav-convert refuses a source outside the mod');
    await rejects(() => wc({ mod, src: '../outside.wav', out: 'resource/sound/conv/b.wav', format: 'ima', plan: true }), /Refused/, 'wav-convert refuses ../ out of the mod');
    await rejects(() => wc({ mod, src: path.join(work, 'nope', 'x.wav'), out: 'resource/sound/conv/b.wav', format: 'ima', plan: true }), /Refused/, 'wav-convert does not say if a file outside exists');
    put(ctx.tmpRoot, 'task/d1/up.wav', tone(1, 22050, 300));
    cv = await wc({ mod, src: path.join(ctx.tmpRoot, 'task/d1/up.wav'), out: 'resource/sound/conv/up.wav', format: 'ima' });
    t(cv.written && fs.existsSync(path.join(mod, 'resource/sound/conv/up.wav')), 'wav-convert takes an upload under the GUI temp root');
    // target only under resource/sound/ in the mod, never the game
    await rejects(() => wc({ mod, src: 'resource/sound/src/mono.wav', out: 'resource/sound/../../evil.wav', format: 'ima' }), /resource\/sound/, 'wav-convert refuses .. in the target');
    await rejects(() => wc({ mod, src: 'resource/sound/src/mono.wav', out: 'resource/set/x.wav', format: 'ima' }), /resource\/sound/, 'wav-convert target under resource/sound only');
    await rejects(() => wc({ mod, src: 'resource/sound/src/mono.wav', out: '', format: 'ima' }), /Type where/, 'wav-convert needs a target');
    await rejects(() => wc({ mod: game, src: 'resource/sound/weapon/shot/mg34/1.wav', out: 'resource/sound/x.wav', format: 'ima' }), /Refused/, 'wav-convert refuses the game folder');
    // not decodable: plain words
    put(mod, 'resource/sound/src/ogg.wav', Buffer.concat([Buffer.from('OggS'), Buffer.alloc(40)]));
    await rejects(() => wc({ mod, src: 'resource/sound/src/ogg.wav', out: 'resource/sound/conv/o.wav', format: 'ima', plan: true }), /cannot be read.*\.ogg/, 'wav-convert says plainly an ogg cannot be read');
    const fl = wav(3, 1, 44100, 24, 300); put(mod, 'resource/sound/src/f24.wav', fl);
    await rejects(() => wc({ mod, src: 'resource/sound/src/f24.wav', out: 'resource/sound/conv/f.wav', format: 'ima', plan: true }), /cannot be read/, 'wav-convert says plainly a float 24 cannot be read');
    t(!fs.existsSync(path.join(mod, 'resource/sound/conv/o.wav')) && !fs.existsSync(path.join(mod, 'resource/sound/conv/f.wav')), 'wav-convert wrote nothing for bad input');
    // phone: refused by the route and closed in remote.js
    await rejects(() => R[WC](url('/api/x/art/wav-convert'), { mod, src: 'resource/sound/src/mono.wav', out: 'resource/sound/conv/p.wav', format: 'ima', plan: true }, Object.assign({}, ctx, { session: { remote: true } })), /View only/, 'wav-convert refused from the phone view');
    t(!require('../../remote').allowed('POST', '/api/x/art/wav-convert'), 'remote.js does not let wav-convert through');
  }

  // assets + stray
  put(mod, 'resource/entity/vehicle/tank/zz1_body.tga', Buffer.alloc(30));
  put(mod, 'resource/sound/bad.wav', Buffer.concat([Buffer.from('OggS'), Buffer.alloc(40)]));
  const a = await call('GET /api/x/art/assets', url('/api/x/art/assets', { mod }));
  const txt = JSON.stringify(a);
  t(a && /exporter|text|image|sound/.test(txt) && txt.includes('zz1.def'), 'assets list');
  const sr = C.strayImages(game, mod);
  t(sr.stray.length >= 1, 'stray tga hides dds: ' + JSON.stringify(sr).slice(0, 200));
  t(sr.headers.some(x => /bad\.wav/.test(JSON.stringify(x))) || JSON.stringify(sr).includes('bad.wav'), 'bad wav flagged');

  // check (tools stubbed to fail: must report tool not run, not fabricate)
  ctx.runTool = async () => ({ code: 2, stdout: '', stderr: 'tool missing' });
  const ck = await call('POST /api/x/art/check', url('/api/x/art/check'), { mod });
  t(ck.tools.length === 2 && ck.tools.every(x => x.ok === false) && ck.stray.length >= 1 && ck.notes.includes('assetsame'), 'check reports tool failures honestly');
  ctx.runTool = async (tool) => tool === 'binhdr' ? { code: 1, stdout: JSON.stringify({ total: 3, findings: [{ code: 'BIN-X', file: 'a.ply', line: 0, msg: 'm' }] }), stderr: '' } : { code: 1, stdout: 'resource/a.mtl:4: WARN_EXP_MTL something odd\n', stderr: '' };
  const ck2 = await call('POST /api/x/art/check', url('/api/x/art/check'), { mod });
  t(ck2.tools.every(x => x.ok) && ck2.groups.some(g => g.code === 'BIN-X') && ck2.groups.some(g => g.code === 'WARN_EXP_MTL'), 'check parses both tools');

  // blender (stub)
  ctx.runTool = async () => ({ code: 0, stdout: 'blender: C:/x/blender.exe\naddon enabled in fresh start: True\n', stderr: '' });
  const bl = await call('GET /api/x/art/blender', url('/api/x/art/blender'));
  t(bl.found && bl.enabled, 'blender parse');

  // blocks: the page script in a stand-in browser, every helper's result drawn, through the rules of test-blocks.js
  {
    const FD = require('../units/fakedom'), BC = require('../balance/blockcheck'), E = X.lang.en;
    const route = (u, body) => { const p = String(u).split('?')[0]; return R[(body === undefined ? 'GET ' : 'POST ') + p](new URL('http://x' + u), body, ctx); };
    const P = FD.runPage('art', BC.SHIM + X.script, X.lang, { route, S: { mod, gameOv: game } });
    const btn = k => P.root.all(c => c.tagName === 'BUTTON' && c.textContent === E[k])[0];
    const inp = ph => P.root.all(c => c.tagName === 'INPUT' && c.getAttribute('placeholder') === ph);
    let pr = BC.checkBlocks(P.root); t(!pr.length, 'blocks: art as built ' + pr.join('; '));
    inp(E['art.unitPh']).forEach(i => { i.value = 'zz1'; });
    inp(E['art.weaponPh'])[0].value = 'mg34'; inp(E['art.wavPh'])[0].value = 'resource/sound/my.wav'; inp(E['art.pngPh'])[0].value = pngf;
    ctx.runTool = async (tool) => tool === 'binhdr' ? { code: 1, stdout: JSON.stringify({ total: 1, findings: [{ code: 'BIN-X', file: 'a.ply', line: 0, msg: 'm' }] }), stderr: '' } : { code: 0, stdout: 'blender: C:/x/blender.exe\naddon enabled in fresh start: True\n', stderr: '' };
    for (const k of ['art.find', 'art.camoLook', 'art.soundFind', 'art.wavCheck', 'art.iconLook', 'art.checkRun', 'art.blenCheck', 'art.assetsRefresh', 'art.convGo']) { FD.userClick(P.doc, btn(k)); await FD.settle(); }
    inp('Autumn')[0].value = 'Winter'; inp('aut')[0].value = 'aut';
    for (const k of ['art.previewCopy', 'art.previewBtn']) P.root.all(c => c.tagName === 'BUTTON' && c.textContent === E[k]).forEach(b => FD.userClick(P.doc, b));
    await FD.settle();
    const leaf = id => P.root.all(c => c.dataset.blk === id)[0];
    t(['unit.files', 'camo.now', 'camo.res', 'sound.res', 'sound.wav.res', 'sound.conv.res', 'icon.res', 'icon.png.res', 'check.res', 'blen.res', 'assets.res'].every(id => leaf(id) && leaf(id).textContent.trim()), 'blocks: every helper drew its result');
    t(leaf('icon.res').all(c => c.tagName === 'TABLE').length === 1 && leaf('assets.res').all(c => c.tagName === 'TABLE').length === 1, 'blocks: the icon and asset tables are drawn');
    pr = BC.checkBlocks(P.root); t(!pr.length, 'blocks: art with every result drawn ' + pr.join('; '));
    const tasks = leaf('intro.tasks'); t(tasks && / blc /.test(' ' + tasks.className + ' ') && tasks.children.length === 5, 'blocks: the five jobs are five blocks in one container');
  }

  // searchKit (owner 2026-11-19): every name box has Browse, History and an index from GET /api/x/art/names
  {
    const nm = await R['GET /api/x/art/names'](url('/api/x/art/names', { mod }), null, ctx);
    t(nm.units.some(u => u.n === 'zz1' && u.dir === 'vehicle/tank') && nm.weapons.some(w => w.n === 'mg34') && Array.isArray(nm.sounds) && Array.isArray(nm.pngs), 'names: units, weapons, mod sounds and pictures ' + JSON.stringify(nm.units.slice(0, 2)));
    const FD = require('../units/fakedom'), BC = require('../balance/blockcheck'), E = X.lang.en;
    const route = (u, body) => { const p = String(u).split('?')[0]; return R[(body === undefined ? 'GET ' : 'POST ') + p](new URL('http://x' + u), body, ctx); };
    const P = FD.runPage('art', BC.SHIM + X.script, X.lang, { route, S: { mod, gameOv: game } });
    const kits = P.root.all(c => c.className === 'sk').map(c => c.dataset.sk);
    t(['art.unit', 'art.weapon', 'art.wav', 'art.png'].every(k => kits.includes(k)) && kits.filter(k => k === 'art.unit').length === 3, 'kits: unit x3, weapon, wav, png ' + kits.join());
    t(!P.root.all(c => c.tagName === 'BUTTON' && c.textContent === 'Choose file...').length && !Object.keys(E).some(k => /pickFile$/.test(k)), 'kits: the old pick buttons (and their text) gave way to the kit Browse');
    // Browse = the file picker where the box's things live (owner 2026-11-19); a pick puts what the box takes
    {
      const sent = []; let ans = null; P.picker((spec, done) => { sent.push(spec); if (ans) done(ans[0], ans[1]); });
      const kitOf = k => P.root.all(c => c.className === 'sk' && c.dataset.sk === k)[0].children[0]._sk;
      const pk = (k, a) => { ans = a; sent.length = 0; kitOf(k).browseButton.click(); return sent[0] || {}; };
      let s = pk('art.unit', ['entity/vehicle/tank/zz1/zz1.def', { view: 'data', path: 'entity/vehicle/tank/zz1/zz1.def', name: 'zz1.def' }]);
      t(s.view === 'data' && s.start === 'entity' && s.mode === 'file' && (s.exts || []).join() === 'def' && kitOf('art.unit').input.value === 'zz1', 'browse: unit box opens the game data at entity/, a pick gives the base name ' + JSON.stringify(s));
      s = pk('art.weapon', ['set/stuff/mg/MG34.def', { view: 'data' }]);
      t(s.view === 'data' && s.start === 'set/stuff' && kitOf('art.weapon').input.value === 'mg34', 'browse: weapon box at set/stuff, pick = lower-case name ' + JSON.stringify(s));
      const wv = kitOf('art.wav').input; wv.value = '';
      s = pk('art.wav', [path.join(mod, 'resource', 'sound', 'b.wav'), { view: 'disk' }]);
      t(s.view === 'disk' && s.start === '' && (s.exts || []).includes('wav') && wv.value === 'resource/sound/b.wav', 'browse: wav box on the disk at the mod, a file in the mod = its path in the mod ' + wv.value);
      wv.value = path.join(work, 'snd', 'a.wav'); s = pk('art.wav', [path.join(work, 'x.mp3'), { view: 'disk' }]);
      t(s.start === path.join(work, 'snd') &&wv.value === path.join(work, 'x.mp3'), 'browse: wav box opens at the folder of its path; a file elsewhere = the full path ' + s.start);
      s = pk('art.png', [path.join(work, 'p.png'), { view: 'disk' }]);
      t(s.view === 'disk' && (s.exts || []).join() === 'png' && kitOf('art.png').input.value === path.join(work, 'p.png'), 'browse: png box on the disk, .png only, the full path');
    }
    const wrap = P.root.all(c => c.className === 'sk' && c.dataset.sk === 'art.unit')[1], uin = wrap.children[0];
    uin.value = 'zz'; uin.selectionStart = 2; uin.fire('input'); for (let i = 0; i < 4; i++) await FD.settle(); await new Promise(r => setTimeout(r, 20));
    const opts = wrap.children[3].children.filter(c => c.getAttribute('role') === 'option');
    t(opts.some(o => /zz1/.test(o.textContent)), 'kits: typing in a unit box lists unit names (' + opts.map(o => o.textContent).join('|') + ')');
    wrap.children[3].fire('click', { target: opts.find(o => /zz1/.test(o.textContent)) }); for (let i = 0; i < 4; i++) await FD.settle();
    const all = P.root.all(c => c.tagName === 'INPUT' && c.getAttribute('placeholder') === E['art.unitPh']);
    t(all.every(i => i.value === 'zz1') && /zz1/.test((P.root.all(c => c.dataset.blk === 'camo.now')[0] || {}).textContent || ''), 'kits: a pick fills every unit box and runs that box\'s look-up');
    const cv = P.root.all(c => c.className === 'sk' && c.dataset.sk === 'art.camoVar')[0], got = [];
    if (cv) { cv.children[0].value = 'au'; cv.children[0].selectionStart = 2; cv.children[0].fire('input'); await new Promise(r => setTimeout(r, 20)); cv.children[3].children.forEach(o => got.push(o.textContent)); }
    t(cv && got.some(x => /aut/.test(x)), 'kits: the camo variant box (drawn with the look-up) offers the variants found: ' + got.join('|'));
    {
      const sent = []; P.picker((spec, done) => { sent.push(spec); done('entity/vehicle/tank/zz1/zz1_body#win.dds', { view: 'data' }); });
      cv.children[0]._sk.browseButton.click();
      t(sent[0] && sent[0].view === 'data' && /^entity\//.test(sent[0].start) && cv.children[0].value === 'win', 'browse: camo variant box at the unit\'s texture folder, a pick of name#win.dds gives win ' + JSON.stringify(sent[0]));
    }
    t(!BC.checkBlocks(P.root).length, 'kits: blocks fine ' + BC.checkBlocks(P.root).slice(0, 3).join('; '));
  }

  // Listen: the compact sound player (ext view) under the sound results, the wav check and the sound rows of the asset list
  {
    const FD = require('../units/fakedom'), BC = require('../balance/blockcheck'), E = X.lang.en, minis = [];
    const route = (u, body) => { const p = String(u).split('?')[0]; return R[(body === undefined ? 'GET ' : 'POST ') + p](new URL('http://x' + u), body, ctx); };
    const STUB = 'var VIEW={soundMini:function(host,ref,name,o){var m={ref:ref,name:name,o:o,hid:0,closed:0,hide:function(){m.hid++},close:function(){m.closed++}};window.__minis.push(m);return m}};\n';
    const P = FD.runPage('art', STUB + BC.SHIM + X.script, X.lang, { route, S: { mod, gameOv: game }, env: { window: { as2Help: {}, URL: {}, __minis: minis } } });
    const btn = k => P.root.all(c => c.tagName === 'BUTTON' && c.textContent === E[k])[0];
    const inp = ph => P.root.all(c => c.tagName === 'INPUT' && c.getAttribute('placeholder') === ph);
    inp(E['art.weaponPh'])[0].value = 'mg34'; inp(E['art.wavPh'])[0].value = 'resource/sound/my.wav';
    for (const k of ['art.soundFind', 'art.wavCheck', 'art.assetsRefresh']) { FD.userClick(P.doc, btn(k)); await FD.settle(); }
    const leaf = id => P.root.all(c => c.dataset.blk === id)[0];
    const lis = id => leaf(id).all(c => c.tagName === 'BUTTON' && c.textContent === E['art.listen']);
    t(lis('sound.res').length >= 1 && lis('sound.wav.res').length === 1 && lis('assets.res').length >= 1, 'listen: a Listen button on the sound result, the wav check and the sound rows ' + ['sound.res', 'sound.wav.res', 'assets.res'].map(i => lis(i).length));
    const got = [];
    try { FD.userClick(P.doc, lis('sound.wav.res')[0]); await FD.settle(); } catch (e) { got.push(e.message); }
    const m = minis;
    t(!got.length && m.length === 1 && m[0].o && m[0].o.play === true && m[0].ref.mod === mod && m[0].ref.rel === 'resource/sound/my.wav' && leaf('sound.wav.res').all(c => c.tagName === 'BUTTON' && c.textContent === E['art.listenClose']).length === 1, 'listen: a click opens the compact player, playing, with the mod ref ' + got.join());
    FD.userClick(P.doc, lis('sound.res')[0]); await FD.settle();
    t(m.length === 2 && m[0].hid === 1 && /^resource\/sound\/weapon\/shot\/mg34\//.test(m[1].ref.key), 'listen: opening another stops the first; a weapon sound by its key');
    t(!BC.checkBlocks(P.root).length, 'listen: blocks still fine');
  }

  // game parity, MoW:AS2: the shared AS2 install with as64.exe and as64/core; a file only in as64/core is AS64's, not MoW:AS2's.
  // The request's game (ctx.gameId/exe as gui.js gives it) reaches the vfs; the cache keeps one answer per exe.
  {
    const g2 = path.join(work, 'as2game');
    put(g2, 'as64.exe', 'MZ'); put(g2, 'mowas_2.exe', 'MZ');
    put(g2, 'resource/entity/vehicle/tank/zz1/zz1.def', '{Extension "vehicle"}\r\n');
    put(g2, 'as64/core/resource/entity/vehicle/tank/zz9/zz9.def', '{Extension "vehicle"}\r\n');
    const tga = Buffer.alloc(18); tga[2] = 2; tga.writeUInt16LE(60, 12); tga.writeUInt16LE(30, 14); tga[16] = 32;
    put(g2, 'as64/core/resource/interface/scene/unit_icon/zz9_00.tga', tga);
    const args = [];
    const cx = id => ({ tools: {}, tmpRoot: path.join(work, 'tmp'), game: () => g2, gameId: () => id, exe: () => ({ as64: 'as64', mowas2: 'mowas_2' })[id], kind: () => 'as2', curDir: () => g2, runTool: async (tool, f, a) => { args.push([tool, a]); return { code: 0, stdout: tool === 'binhdr' ? '{"total":0,"findings":[]}' : '', stderr: '' }; } });
    const ask = (id, n) => R['GET /api/x/art/unit'](url('/api/x/art/unit', { name: n }), undefined, cx(id));
    t((await ask('as64', 'zz9')).found, 'parity mowas2: AS64 sees its as64/core unit');
    t(!(await ask('mowas2', 'zz9')).found, 'parity mowas2: MoW:AS2 does not see as64/core (exe mowas_2 reaches the vfs)');
    t((await ask('as64', 'zz9')).found && (await ask('mowas2', 'zz1')).found, 'parity mowas2: one cache answer per exe, both games keep theirs');
    const m2 = path.join(work, 'mod2'); fs.mkdirSync(m2, { recursive: true });
    await R['POST /api/x/art/check'](url('/api/x/art/check'), { mod: m2 }, cx('mowas2'));
    t(args.length === 2 && args.every(([, a]) => a.join(' ').endsWith('--exe mowas_2')) && args[1][1][2] === g2, 'parity mowas2: check passes --exe mowas_2 to binhdr and expcheck ' + JSON.stringify(args));
    args.length = 0; await R['POST /api/x/art/check'](url('/api/x/art/check'), { mod: m2 }, cx('as64'));
    t(args.length === 2 && args.every(([, a]) => !a.includes('--exe')) && args[0][1][0] === g2, 'parity as64: check argument list unchanged (no --exe)');
    const cp = await R['POST /api/x/art/copy'](url('/api/x/art/copy'), { mod: m2, keys: ['resource/entity/vehicle/tank/zz9/zz9.def'], dry: true }, cx('mowas2'));
    t(cp.missing === 1 && cp.copy === 0, 'parity mowas2: copy plan reads the MoW:AS2 file set');
    // view(g, mod) takes the game as {dir, exe} (what task/recipes/icon.recipe.js may call instead of its own vfs view)
    const zk = 'resource/entity/vehicle/tank/zz9/zz9.def';
    t(C.view(g2, null).has(zk) && !C.view({ dir: g2, exe: 'mowas_2', kind: 'as2' }, null).has(zk) && C.view({ dir: g2, exe: 'mowas_2' }, null).has('resource/entity/vehicle/tank/zz1/zz1.def'), 'parity mowas2: view() takes the exe; the as64/core file is AS64 only');
    // icon-png: the size comes from the game's own icon; an icon only in as64/core is not MoW:AS2's, so MoW:AS2 falls back
    const pf2 = path.join(work, 'pic2.png'); fs.writeFileSync(pf2, Buffer.from('89504e470d0a1a0a0000000d49484452000000100000001008060000001ff3ff61', 'hex'));
    const i64 = await R['POST /api/x/art/icon-png'](url('/api/x/art/icon-png'), { mod: m2, name: 'zz9', kind: 'icon', png: pf2, dry: true }, cx('as64'));
    const i2 = await R['POST /api/x/art/icon-png'](url('/api/x/art/icon-png'), { mod: m2, name: 'zz9', kind: 'icon', png: pf2, dry: true }, cx('mowas2'));
    t(i64.targets[0].size === '60x30' && !i64.targets[0].guessed && i2.targets[0].size === '104x52' && i2.targets[0].guessed, 'parity mowas2: icon-png reads the icon size from the MoW:AS2 file set ' + JSON.stringify([i64.targets[0], i2.targets[0]]));
  }

  // game parity, Gates of Hell: the GoH install from ctx.curDir, exe goh; mesh variants (GHFMT-10), {texmod} fixed variant, write guard
  {
    const gh = path.join(work, 'gohgame'), gm = path.join(work, 'gohmod'), args = [];
    put(gh, 'binaries/x64/call_to_arms.exe', 'MZ');
    // GoH form [V vanilla]: the def sits alone and names its model up a folder ({extension "../<model>/<x>.mdl"})
    const d = 'resource/entity/-vehicle/ger/tank_medium/zz5/', dd = 'resource/entity/-vehicle/ger/tank_medium/zz5_late/';
    put(gh, dd + 'zz5_late.def', '{game_entity\r\n\t{extension "../zz5/zz5.mdl"}\r\n\t{texmod "late"}\r\n}\r\n');
    put(gh, d + 'zz5.def', '{Extension "vehicle"}\r\n{texmod "late"}\r\n{Model "zz5.mdl"}\r\n');
    put(gh, d + 'zz5.mdl', '{model\r\n (ply "zz5.ply")\r\n (mtl "zz5.mtl")\r\n}\r\n');
    put(gh, d + 'zz5.mtl', '{Material {Diffuse "zz5_body"}}\r\n');
    put(gh, d + 'zz5.ply', Buffer.alloc(64)); put(gh, d + 'zz5#snow.ply', Buffer.alloc(64));
    put(gh, d + 'zz5_body.dds', dds(256, 256, 'DXT5')); put(gh, d + 'zz5_body#winter.dds', dds(256, 256, 'DXT5'));
    put(gh, 'resource/interface/scene/unit_icon/zz5_00.tga', tgaHdr(100, 50));
    put(gh, 'resource/set/stuff/kwk40.def', '{Stuff\r\n {fireSound "kwk40"}\r\n}\r\n');
    put(gh, 'resource/sound/weapon/shot/kwk40/1.wav', wav(1, 1, 44100, 16, 400));
    fs.mkdirSync(gm, { recursive: true });
    const cg = { tools: {}, tmpRoot: path.join(work, 'tmp'), game: () => game, gameId: () => 'goh', exe: () => 'goh', kind: () => 'goh', curDir: () => gh, runTool: async (tool, f, a) => { args.push([tool, a]); return { code: 2, stdout: '', stderr: tool + ': not available for GoH: test (ROW-1)' }; } };
    const G = (k, q) => R['GET /api/x/art/' + k](url('/api/x/art/' + k, q), undefined, cg), P = (k, b) => R['POST /api/x/art/' + k](url('/api/x/art/' + k), b, cg);
    const uu = await G('unit', { name: 'zz5', mod: gm });
    const vr = ((uu.groups || []).find(x => x.role === 'variant') || { files: [] }).files.map(f => f.key);
    t(uu.found && uu.game === 'goh' && vr.includes(d + 'zz5#snow.ply') && vr.includes(d + 'zz5_body#winter.dds') && (uu.meshVariants[d + 'zz5.ply'] || []).includes('snow'), 'parity goh: unit files from the GoH folder, mesh variant listed ' + JSON.stringify(uu).slice(0, 300));
    const uo = await G('unit', { name: 'zz5', mod: gm, game });
    t(uo.found && uo.game === 'goh', 'parity goh: the AS2 folder override is ignored under GoH');
    const ci = await G('camo', { name: 'zz5', mod: gm });
    t(ci.game === 'goh' && ci.texmod === 'late' && ci.meshes.length === 1 && ci.meshes[0].variants[0] === 'snow', 'parity goh: camo shows the fixed texmod and the mesh variants');
    const cw = await P('camo-write', { mod: gm, name: 'zz5', option: 'Winter', variant: 'snow', dry: true });
    t(cw.game === 'goh' && cw.variantFileFound && cw.how === 'new' && /\{TexMods\r\n\t\t\{"Winter" "snow"\}/.test(cw.text), 'parity goh: camo plan into a GoH mod outside the install, a #snow.ply counts as the variant file');
    const cw2 = await P('camo-write', { mod: gm, name: 'zz5', option: 'Winter', variant: 'snow' });
    t(cw2.written && fs.readFileSync(path.join(gm, ...(d + 'zz5.def').split('/')), 'latin1').includes('{"Winter" "snow"}'), 'parity goh: camo written into the GoH mod');
    const inGoh = path.join(gh, 'mods', 'mine'); fs.mkdirSync(inGoh, { recursive: true });
    await rejects(() => P('camo-write', { mod: inGoh, name: 'zz5', option: 'Winter', variant: 'snow' }), /Refused: .*Gates of Hell/, 'parity goh: a mod inside the GoH install gets the write guard line');
    await rejects(() => P('copy', { mod: inGoh, keys: [d + 'zz5.def'], dry: true }), /Refused: .*Gates of Hell/, 'parity goh: copy refused inside the GoH install');
    const cpg = await P('copy', { mod: gm, keys: [d + 'zz5#snow.ply', d + 'zz5.mtl'], dry: true });
    t(cpg.copy === 2 && cpg.missing === 0, 'parity goh: copy plan from the GoH file set');
    const so = await G('sound', { weapon: 'kwk40' });
    t(so.foundStuff && so.sounds[0].folder === 'weapon/shot/kwk40', 'parity goh: weapon sound found in the GoH files');
    const ic = await G('icons', { name: 'zz5', mod: gm });
    t(ic.anyInGame && ic.rows[0].size === '100x50', 'parity goh: icons read from the GoH files');
    const pf = path.join(work, 'g.png'); fs.writeFileSync(pf, png);
    const ip = await P('icon-png', { mod: gm, name: 'zz5', kind: 'icon', png: pf, dry: true });
    t(ip.targets[0].size === '100x50' && !ip.targets[0].guessed, 'parity goh: icon size from the GoH icon');
    await rejects(() => P('icon-png', { mod: inGoh, name: 'zz5', kind: 'icon', png: pf, dry: true }), /Refused/, 'parity goh: icon-png refused inside the GoH install');
    const ipn = await P('icon-png', { mod: gm, name: 'zz7', kind: 'icon', png: pf, dry: true }), ipp = await P('icon-png', { mod: gm, name: 'zz7', kind: 'portrait', png: pf, dry: true });
    t(ipn.targets[0].size === '144x72' && ipn.targets[0].guessed && ipn.targets[4].size === '112x48' && ipp.targets[0].size === '128x164', 'parity goh: fallback sizes are the GoH vanilla sizes');
    await rejects(() => P('icon-png', { mod: gm, name: 'zz5', kind: 'scheme', png: pf, dry: true }), /Not available in Gates of Hell yet: .*not checked yet/, 'parity goh: scheme picture held back as not checked yet');
    const ul = await G('unit', { name: 'zz5_late', mod: gm }), rl = (ul.groups || []).map(x => x.role);
    t(ul.found && rl.includes('model') && rl.includes('mesh') && rl.includes('texture') && rl.includes('variant'), 'parity goh: {extension "../zz5/zz5.mdl"} followed up a folder ' + rl);
    const cwl = await P('camo-write', { mod: gm, name: 'zz5_late', option: 'Winter', variant: 'winter', dry: true });
    t(cwl.variantFileFound, 'parity goh: a variant beside the model (not the def) is found');
    put(gm, 'resource/sound/my.wav', wav(1, 1, 44100, 16, 400));
    const wc = await P('wav-convert', { mod: gm, src: 'resource/sound/my.wav', out: 'resource/sound/my2.wav', format: 'ima', plan: true });
    t(wc.plan && wc.mod === path.resolve(gm), 'parity goh: wav convert plans into a GoH mod');
    const ck = await P('check', { mod: gm });
    t(args.length === 2 && args.every(([, a]) => a.join(' ').endsWith('--exe goh')) && args[0][1][0] === gh && args[1][1][2] === gh && ck.tools.every(x => !x.ok && /not available for GoH/.test(x.note)), 'parity goh: check gives the GoH folder and --exe goh; a tool refusal shows as its plain line');
    const as = await G('assets', { mod: gm });
    t(as.total >= 2, 'parity goh: asset list of a GoH mod');
    const cn = Object.assign({}, cg, { curDir: () => null });
    await rejects(() => R['GET /api/x/art/unit'](url('/api/x/art/unit', { name: 'zz5' }), undefined, cn), /Gates of Hell folder was not found/, 'parity goh: no GoH folder gives a plain line');
    // the page under GoH: the camo card draws the GoH line and the mesh variants
    const FD = require('../units/fakedom'), BC = require('../balance/blockcheck'), E = X.lang.en;
    const route = (u2, body) => { const p = String(u2).split('?')[0]; return R[(body === undefined ? 'GET ' : 'POST ') + p](new URL('http://x' + u2), body, cg); };
    const PG = FD.runPage('art', BC.SHIM + X.script, X.lang, { route, S: { mod: gm, gameOv: game } });
    PG.root.all(c => c.tagName === 'INPUT' && c.getAttribute('placeholder') === E['art.unitPh']).forEach(i => { i.value = 'zz5'; });
    FD.userClick(PG.doc, PG.root.all(c => c.tagName === 'BUTTON' && c.textContent === E['art.camoLook'])[0]); await FD.settle();
    const now = PG.root.all(c => c.dataset.blk === 'camo.now')[0].textContent;
    t(now.includes(E['art.gohCamo']) && now.includes(E['art.gohMeshVar']) && now.includes('late'), 'parity goh: page camo card shows the GoH differences');
    // a GoH variant with no picture and no #mesh stays an error (GHVIS-42 covers only animated frames in common_textures)
    const inp = ph => PG.root.all(c => c.tagName === 'INPUT' && c.getAttribute('placeholder') === ph)[0];
    inp('Autumn').value = 'Desert'; inp('aut').value = 'nothere';
    FD.userClick(PG.doc, PG.root.all(c => c.tagName === 'BUTTON' && c.textContent === E['art.previewBtn'])[0]); await FD.settle();
    const nf = PG.root.all(c => c.dataset.blk === 'camo.res')[0].all(c => c.textContent === E['art.camoNoFile'].replace('{v}', 'nothere'));
    t(nf.length === 1 && /\berr\b/.test(nf[0].getAttribute('class') || nf[0].className || ''), 'parity goh: a missing variant picture stays an error');
    t(!BC.checkBlocks(PG.root).length, 'parity goh: blocks fine');
  }

  // ---- CACHE (gui README contract 1): the routes take the mod's file list from the shared walk (lib/modtree) and the game's view from
  // lib/gameview; a write route touches the walk
  {
    const cm = path.join(work, 'cachemod'), raw = (rel, d) => { const p = path.join(cm, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, d || 'x'); };
    ['mod.info', 'resource/entity/b/B.def', 'resource/entity/a_b/x.def', 'resource/entity/A/y.def', 'resource/entity/a.txt', 'resource/sound/z.wav', 'resource/_x/q.png', 'Zed.png', 'art/pic.png',
      'resource/texture/1.dds', 'resource/texture/10.dds', 'resource/texture/2.dds', '.git/config', 'resource/node_modules/n.js'].forEach(r => raw(r));
    const ref = cap => { const a = []; C.walk(cm, '', a, cap); return a; };
    const T1 = await MT.ensure(cm), rel1 = C.useScan(cm, T1);
    const l1 = C.listMod(cm, 40000);
    t(JSON.stringify(l1) === JSON.stringify(ref(40000)) && l1.length === 12 && !l1.some(r => /\.git|node_modules/.test(r)), 'cache: the rows of the shared walk give the folder walk\'s list, same order: ' + JSON.stringify(l1));
    t([1, 3, 5, 8].every(n => JSON.stringify(C.listMod(cm, n)) === JSON.stringify(ref(n))), 'cache: the cap cuts at the same file');
    raw('resource/texture/3.dds');
    t(C.listMod(cm, 40000).length === 12, 'cache: while a scan is held the list is the scan\'s (no folder read)');
    rel1();
    t(JSON.stringify(C.listMod(cm, 40000)) === JSON.stringify(ref(40000)) && C.listMod(cm, 40000).length === 13, 'cache: with no scan held the folders are read as before');
    // the routes: one shared scan for several reads, a new one after a touch; the answers equal the direct read
    const scans = []; ctx.modtree = Object.assign({}, MT, { ensure: (d, o) => MT.ensure(d, o).then(T => { scans.push(T); return T; }), touch: d => { tch.push(d); MT.touch(d); } });
    const tch = [];
    MT.touch(cm);
    const a1 = await call('GET /api/x/art/assets', url('/api/x/art/assets', { mod: cm })), a2 = await call('GET /api/x/art/assets', url('/api/x/art/assets', { mod: cm }));
    t(scans.length === 2 && scans[0] === scans[1] && JSON.stringify(a1) === JSON.stringify(a2) && JSON.stringify(a1) === JSON.stringify(C.assetList(game, cm)) && a1.total === 13, 'cache: two asks share one scan; the answer equals a direct read');
    const n1 = await call('GET /api/x/art/names', url('/api/x/art/names', { mod: cm }));
    t(JSON.stringify(n1) === JSON.stringify(C.names(game, cm)) && n1.sounds.length === 1 && n1.pngs.length === 3, 'cache: names through the scan equal a direct read');
    raw('resource/sound/new.wav'); MT.touch(cm);
    const n2 = await call('GET /api/x/art/names', url('/api/x/art/names', { mod: cm }));
    t(n2.sounds.length === 2 && scans[scans.length - 1] !== scans[0], 'cache: after a touch the folder is read again (a new sound is listed)');
    // the game view is the shared one
    const GV = require('../../../lib/gameview');
    t(C.game(game) === GV.get({ gameDir: game }) && C.game(game) === C.game(game), 'cache: the game view is the shared lib/gameview one');
    // write routes touch the walk; a preview does not
    tch.length = 0;
    put(cm, 'resource/sound/src.wav', wav(1, 1, 44100, 16, 400)); tch.length = 0;
    await call('POST /api/x/art/wav-convert', url('/api/x/art/wav-convert'), { mod: cm, src: 'resource/sound/src.wav', out: 'resource/sound/out.wav', format: 'ima', plan: true });
    t(tch.length === 0, 'touch: a plan touches nothing');
    await call('POST /api/x/art/wav-convert', url('/api/x/art/wav-convert'), { mod: cm, src: 'resource/sound/src.wav', out: 'resource/sound/out.wav', format: 'ima' }).catch(() => null);
    t(tch.length === 1 && path.resolve(tch[0]) === path.resolve(cm), 'touch: a write touches the mod');
    delete ctx.modtree;
  }
  // game override param
  ctx.game = () => null;
  u = await call('GET /api/x/art/unit', url('/api/x/art/unit', { name: 'zz1', mod, game }));
  t(u.found, 'game override via param');
  await rejects(() => call('GET /api/x/art/unit', url('/api/x/art/unit', { name: 'zz1', mod })), /game folder/, 'no game gives plain error');

  console.log(bad ? bad + ' FAIL (' + ok + ' ok)' : 'art ' + ok + ' PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + (e.stack || e)); process.exit(1); });
