// view kind shader test. Arg: scratch dir. Synthetic shader cache files built here: a good one (key with entry and defines, file name =
// MD5 of the key in lower case, DXBC with RDEF RD11 + ISGN + OSGN + SHEX ps_5_0 + STAT), one with a wrong name, one that is bare DXBC,
// one whose key runs past the end, one whose code is not DXBC. Checks: the lib (key split, key parse, MD5 name, DXBC facts), the route
// (source .hlsl found or missing), the kind's files; then the page in a fake DOM. Optional sweep: AS2_SWEEP_GAME=<game folder>. Last
// line PASS.
// Author: Imperator_Aug (ARSENAL, ia-73126a16)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'shk-')));
require('../../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const wr = (f, b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };
const X = require('../../../../lib/dxbc');

// ---- builders
function u32s(a) { const b = Buffer.alloc(a.length * 4); a.forEach((v, i) => b.writeUInt32LE(v >>> 0, i * 4)); return b; }
function strs(base, list) {   // NUL-terminated strings placed at base; returns { buf, at[] }
  const at = [], parts = []; let p = base;
  list.forEach(s => { at.push(p); const b = Buffer.from(s + '\0', 'latin1'); parts.push(b); p += b.length; });
  return { buf: Buffer.concat(parts), at };
}
function rdefChunk() {
  // header 60 (RD11), 2 bindings x 32, 1 cbuffer x 24, 2 vars x 40, then strings
  const hdr = 60, bOff = hdr, cbOff = bOff + 64, vOff = cbOff + 24, sOff = vOff + 80;
  const S = strs(sOff, ['g_tex', 'Globals', 'g_color', 'g_unused', 'Test HLSL Compiler 1.0']);
  const h = u32s([1, cbOff, 2, bOff, 0, 0, S.at[4], 0, 0, 0, 0, 0, 0, 0, 0]);
  h[16] = 0; h[17] = 5; h.writeUInt16LE(0xffff, 18); h.write('RD11', 28, 'latin1');
  const binds = Buffer.concat([u32s([S.at[0], 2, 5, 4, 0xffffffff, 3, 1, 0]), u32s([S.at[1], 0, 0, 0, 0, 0, 1, 1])]);
  const cb = u32s([S.at[1], 2, vOff, 32, 0, 0]);
  const vars = Buffer.concat([u32s([S.at[2], 0, 16, 2, 0, 0, 0, 0, 0, 0]), u32s([S.at[3], 16, 16, 0, 0, 0, 0, 0, 0, 0])]);
  return Buffer.concat([h, binds, cb, vars, S.buf]);
}
function sigChunk(els) {   // els: [name, index, sv, ctype, reg, mask]
  const base = 8 + els.length * 24, S = strs(base, els.map(e => e[0]));
  return Buffer.concat([u32s([els.length, 8])].concat(els.map((e, i) => { const b = u32s([S.at[i], e[1], e[2], e[3], e[4], 0]); b[20] = e[5]; return b; })).concat([S.buf]));
}
function dxbc(o) {
  o = Object.assign({ code: true }, o);
  const ch = [['RDEF', rdefChunk()], ['ISGN', sigChunk([['SV_POSITION', 0, 1, 3, 0, 15], ['TEXCOORD', 0, 0, 3, 1, 3]])], ['OSGN', sigChunk([['SV_TARGET', 0, 0, 3, 0, 15]])]];
  if (o.code) ch.push(['SHEX', u32s([0x00000050, 6, 0x0100003e, 0, 0, 0])]);
  ch.push(['STAT', u32s([7, 2, 0, 0])]);
  let off = 32 + ch.length * 4;
  const offs = [], bodies = [];
  ch.forEach(c => { offs.push(off); const b = Buffer.concat([Buffer.from(c[0], 'latin1'), u32s([c[1].length]), c[1]]); bodies.push(b); off += b.length; });
  const hd = Buffer.alloc(32); hd.write('DXBC', 0, 'latin1'); for (let i = 0; i < 16; i++) hd[4 + i] = i; hd.writeUInt32LE(1, 20); hd.writeUInt32LE(off, 24); hd.writeUInt32LE(ch.length, 28);
  return Buffer.concat([hd, u32s(offs)].concat(bodies));
}
function cache(key, code) { const k = Buffer.from(key, 'latin1'); return Buffer.concat([Buffer.from([k.length]), k, code]); }
function cacheLong(key, code) { const k = Buffer.from(key, 'latin1'), c = Buffer.from([0xff, k.length & 255, (k.length >> 8) & 255, k.length >> 16]); return Buffer.concat([c, k, code]); }

const KEY = 'Water[main_ps]$FOG#1$SHADOW$Q#hi';
const NAME = X.md5Name(KEY)[1];
const game = path.join(work, 'game');
process.env.GOH_GAME = path.join(work, 'goh'); process.env.AS2_NO_STEAM = '1'; process.env.AS2_HOME = path.join(work, 'home');
wr(path.join(game, 'as64.exe'), 'MZ');
const mod = path.join(game, 'mods', 'mine');
wr(path.join(mod, 'mod.info'), '{mod {name "Mine"}}\r\n');
const C = 'resource/shader/cache/dx11.0/';
wr(path.join(mod, C + NAME + '.pso'), cache(KEY, dxbc()));
wr(path.join(mod, C + 'wrongname.pso'), cache('Ghost[vs]', dxbc()));
wr(path.join(mod, C + 'bare.vso'), dxbc({ code: false }));
wr(path.join(mod, C + 'cut.pso'), Buffer.from([200, 65, 66]));
wr(path.join(mod, C + 'junk.pso'), cache('Water[x]', Buffer.from('not a shader at all, just bytes here', 'latin1')));
wr(path.join(mod, 'resource/shader/dx10/water.hlsl'), 'float4 main_ps() : SV_TARGET { return 0; }\r\n');
const ctx = { tools: path.join(__dirname, '..', '..', '..', '..'), tmpRoot: work, game: () => game, allowLaunch: false };
const KS = require('./shader.server'), KL = require('./shader.lang'), KC = require('./shader.client'), FS = require('../server');
const route = (p, q) => { const u = new URL('http://x' + p + (q ? '?' + q : '')); const f = KS.routes['GET ' + p] || FS.routes['GET ' + p]; return f(u, null, ctx); };
const q = rel => 'mod=' + encodeURIComponent(mod) + '&rel=' + encodeURIComponent(rel);

(async () => {
  // ---- lib
  const s = X.cacheSplit(cache(KEY, dxbc())), s2 = X.cacheSplit(cacheLong(KEY, dxbc())), s3 = X.cacheSplit(dxbc());
  ok(s.key === KEY && s.codeOff === 1 + KEY.length && s.code.toString('latin1', 0, 4) === 'DXBC' && s2.key === KEY && s2.codeOff === 4 + KEY.length && s3.key === null && s3.codeOff === 0, 'cacheSplit: short count, 0xFF long count, bare DXBC');
  ok(X.cacheSplit(Buffer.from([200, 65])).bad === true, 'cacheSplit: a key past the end is bad');
  const pk = X.parseKey(KEY);
  ok(pk.file === 'Water' && pk.entry === 'main_ps' && JSON.stringify(pk.defines) === '[["FOG","1"],["SHADOW",null],["Q","hi"]]' && X.parseKey('nobrackets') === null, 'parseKey: file, entry, defines with and without values');
  const m = X.md5Name('AbC');
  ok(m[0] === require('crypto').createHash('md5').update('AbC').digest('hex') && m[1] === require('crypto').createHash('md5').update('abc').digest('hex'), 'md5Name: as written and lower case');
  const d = X.parse(dxbc());
  ok(d.magic === 'DXBC' && d.size === dxbc().length && d.chunks.map(c => c.id).join() === 'RDEF,ISGN,OSGN,SHEX,STAT' && !d.notes.length, 'parse: header and chunks, no notes ' + d.notes.join());
  ok(d.model && d.model.name === 'ps_5_0' && d.model.type === 'pixel' && d.model.ext && d.stat.instructions === 7 && d.stat.temps === 2, 'parse: model ps_5_0, stats');
  ok(d.rdef.creator === 'Test HLSL Compiler 1.0' && d.rdef.type === 'pixel' && d.rdef.bindings.length === 2 && d.rdef.bindings[0].name === 'g_tex' && d.rdef.bindings[0].type === 'texture' && d.rdef.bindings[0].dim === '2d' && d.rdef.bindings[0].slot === 3 && d.rdef.bindings[1].type === 'cbuffer', 'parse: RDEF bindings (32-byte stride)');
  const cb = d.rdef.cbuffers[0];
  ok(cb.name === 'Globals' && cb.size === 32 && cb.vars.length === 2 && cb.vars[0].name === 'g_color' && cb.vars[0].used && cb.vars[1].name === 'g_unused' && cb.vars[1].off === 16 && !cb.vars[1].used, 'parse: cbuffer with RD11 40-byte variables');
  ok(d.isgn.length === 2 && d.isgn[0].name === 'SV_POSITION' && d.isgn[0].sv === 'POSITION' && d.isgn[0].mask === 'xyzw' && d.isgn[1].sv === '' && d.isgn[1].mask === 'xy' && d.isgn[1].reg === 1 && d.osgn[0].name === 'SV_TARGET' && d.osgn[0].type === 'float', 'parse: input and output signatures');
  const dn = X.parse(dxbc({ code: false })), dj = X.parse(Buffer.from('junk', 'latin1'));
  const dc = dxbc(); dc.writeUInt32LE(dc.length + 4, 24); dc.writeUInt32LE(dc.length + 100, 32);
  const dcp = X.parse(dc);
  ok(dn.notes.includes('noCode') && dj.notes.includes('notDxbc') && dcp.notes.includes('sizeDiffers') && dcp.notes.includes('chunkPast'), 'parse: seeded defects noCode, notDxbc, sizeDiffers, chunkPast');

  // ---- routes
  ok(KS.exts.join() === 'pso,vso,gso,hso,dso,cso' && KS.remote.length === 1 && KS.remote.every(r => KS.routes[r]), 'server: .pso/.vso, one read-only route open to a phone');
  ok(KL.every(r => r.length === 5 && r[0].startsWith('view.shader.') && r.slice(1).every(x => typeof x === 'string' && x.length)), 'strings: view.shader.* in en, ru, uk, zh');
  const keys = new Set(KL.map(r => r[0]).concat(require('../lang').map(r => r[0])));
  const miss = [...KC.script.matchAll(/tx\('([a-z0-9.]+)'/gi)].map(x => x[1]).filter(k => !keys.has(k) && !/\.$/.test(k));
  ok(!miss.length && !/`|\$\{|innerHTML|insertAdjacentHTML|document\.write/.test(KC.script), 'client: page-safe, every tx key exists ' + miss.join());
  const lib = fs.readFileSync(require.resolve('../../../../lib/dxbc'), 'utf8');
  const codes = [...new Set([...lib.matchAll(/notes\.push\('([a-zA-Z]+)/g)].map(x => x[1]))];
  ok(codes.length >= 5 && codes.every(c => keys.has('view.shader.n.' + c)) && Object.values({ a: 'pixel', b: 'vertex', c: 'geometry', d: 'hull', e: 'domain', f: 'compute', g: 'unknown' }).every(t => keys.has('view.shader.t.' + t)), 'every note code and shader type has a string: ' + codes.filter(c => !keys.has('view.shader.n.' + c)).join());
  const gi = await route('/api/x/view/shader/info', q(C + NAME + '.pso'));
  ok(gi.key === KEY && gi.parsed.entry === 'main_ps' && gi.md5.match && gi.dxbc.model.name === 'ps_5_0' && gi.source.key === 'resource/shader/dx10/water.hlsl' && gi.source.found, 'info: key, name matches, model, source found');
  const wi = await route('/api/x/view/shader/info', q(C + 'wrongname.pso'));
  ok(wi.md5 && !wi.md5.match && wi.md5.lower === X.md5Name('Ghost[vs]')[1] && wi.source && !wi.source.found, 'info: wrong name, missing source');
  const bi = await route('/api/x/view/shader/info', q(C + 'bare.vso'));
  ok(bi.key === null && !bi.keyBad && !bi.md5 && bi.dxbc.notes.includes('noCode'), 'info: bare DXBC has no key');
  const ci = await route('/api/x/view/shader/info', q(C + 'cut.pso'));
  ok(ci.key === null && ci.keyBad && ci.dxbc.notes.includes('notDxbc'), 'info: a key past the end');
  const ki = await route('/api/x/view/shader/info', 'mod=' + encodeURIComponent(mod) + '&key=' + encodeURIComponent('shader/cache/dx11.0/' + NAME + '.pso'));
  ok(ki.key === KEY && ki.md5.match, 'info: by key, through the game\'s layered view');

  // ---- the page in a fake DOM
  const fakedom = require('../../../test/fakedom'), doc = fakedom.make(), timers = [];
  const box = { document: doc, console, setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout() {}, atob: x => Buffer.from(x, 'base64').toString('latin1') };
  box.window = box;
  const LS = {}; for (const r of require('../lang').concat(KL)) LS[r[0]] = r[1];
  const h = (t, a, k) => { const e = doc.createElement(t); for (const x in a || {}) { const v = a[x]; if (v == null || v === false) continue; if (x === 'class') e.className = v; else if (x === 'text') e.textContent = v; else if (x.slice(0, 2) === 'on') e.addEventListener(x.slice(2), v); else e.setAttribute(x, v === true ? '' : v); } (k || []).forEach(c => { if (c != null) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); }); return e; };
  const tx = (k, pp) => { let x = LS[k] || k; if (pp) x = x.replace(/\{(\w+)\}/g, (mm, y) => (pp[y] == null ? mm : String(pp[y]))); return x; };
  const api = u => { const i = u.indexOf('?'); return route(u.slice(0, i), u.slice(i + 1)).then(j => JSON.parse(JSON.stringify(j))); };
  Object.assign(box, { h, tx, api, S: { mod, sec: {} }, show() {}, toast() {} });
  vm.createContext(box);
  vm.runInContext(require('../client').script(require('../client').css + '\n' + KC.css) + '\n' + KC.script, box, { filename: 'shader-script' });
  const flush = async () => { for (let i = 0; i < 10; i++) { timers.splice(0).forEach(f => f()); await new Promise(r => setImmediate(r)); } };
  ok(box.VIEW.kindOf(C + 'a.pso') === 'shader' && box.VIEW.kindOf('x/a.vso') === 'shader' && box.VIEW.kindOf('a.hlsl') !== 'shader', 'page: .pso/.vso are the shader kind, .hlsl is not');
  const host = doc.createElement('div'); doc.body.appendChild(host);
  const hd = box.VIEW.mount(host, { mod, rel: C + NAME + '.pso' }, NAME + '.pso', { kind: 'shader' });
  await flush();
  const t = host.textContent;
  ok(t.indexOf(KEY) >= 0 && /Water\.hlsl  \[main_ps\]/.test(t) && /FOG=1  SHADOW  Q=hi/.test(t) && /matches the key/.test(t), 'page: key, source, defines, name check');
  ok(/ps_5_0  \(pixel\)/.test(t) && /7 instructions, 2 temp registers/.test(t) && /Test HLSL Compiler 1\.0/.test(t), 'page: model, stats, compiler');
  ok(/AS64 never reads the cache/.test(t) && !/\.cpp\b/.test(t) && /compiles this shader from resource\/shader\/dx10\/water\.hlsl/.test(t), 'page: the cache line without a source line, the .hlsl found');
  ok(/g_tex/.test(t) && /Constant buffer Globals \(32 bytes, 2 variables\)/.test(t) && /g_unused/.test(t) && /SV_POSITION/.test(t) && /SV_TARGET/.test(t) && host.querySelectorAll('table').length === 5, 'page: tables (chunks, bindings, cbuffer, inputs, outputs)');
  hd.close(); ok(!host.children.length, 'close');
  const h2 = doc.createElement('div'); doc.body.appendChild(h2);
  box.VIEW.mount(h2, { mod, rel: C + 'junk.pso' }, 'junk.pso', { kind: 'shader' }); await flush();
  ok(/does not start with DXBC/.test(h2.textContent) && /does not match the key/.test(h2.textContent), 'page junk: not DXBC, name mismatch');

  // ---- optional sweep of the game's shader cache
  const G = process.env.AS2_SWEEP_GAME;
  if (G && fs.existsSync(G)) {
    const pak = require('../../../../lib/pak'), pf = path.join(G, 'resource', 'gamelogic.pak');
    if (fs.existsSync(pf)) {
      const L = pak.list(pf), all = L.filter(x => /\.(pso|vso)$/i.test(x.name)), pick = all.filter((x, i) => i % Math.max(1, Math.floor(all.length / 200)) === 0).slice(0, 200);
      let k = 0, fail = 0, nk = 0, mt = 0; const models = {}, noteN = {};
      for (const e of pick) {
        k++;
        try {
          const b = pak.read(L, e), sp = X.cacheSplit(b), dd = X.parse(sp.code);
          if (sp.key == null) nk++; else if (X.md5Name(sp.key).includes(e.name.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase())) mt++;
          const mn = dd.model ? dd.model.name : 'none'; models[mn] = (models[mn] || 0) + 1;
          dd.notes.forEach(x => { noteN[x] = (noteN[x] || 0) + 1; });
        } catch (x) { fail++; console.log('sweep fail ' + e.name + ' ' + x.message); }
      }
      console.log('sweep: ' + all.length + ' pso/vso in gamelogic.pak, ' + k + ' read, ' + fail + ' failed, ' + nk + ' without key, ' + mt + ' names match the key; models ' + JSON.stringify(models) + ' notes ' + JSON.stringify(noteN));
    }
  }

  console.log(bad ? bad + ' of ' + n + ' failed' : 'view kind shader ' + n + ' PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + e.stack); process.exit(1); });
