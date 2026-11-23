// unitcard/worker: the heavy image work of the GUI tool (style reads, compose, encode, write) on a worker thread, so the GUI
// server thread never blocks (tools/gui/PERF.md part 1). One call at a time, answered by id; a worker that cannot start runs
// the call inline. The open game views and the styles are kept in the worker, keyed by game + gid + mod + the mod's stamp
// (folder mtimes of the picture folders), so a write or a new file in the mod makes a fresh view.
//   call(op, args) -> Promise   ops: current, styles (the layers of each class, cutouts, cutter), gimp, forget, openxcf, fidelity,
//   plan, make, load, images, check   (args: { game, gid, mod, unit: {id, kind, army, breed, ...}, ... })
// Author: unitcard tool (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-c2028526)
'use strict';

// ---------- the ops (run inside the worker) ----------
let L = null;
function libs() { if (!L) L = { Lk: require('./look'), I: require('./img'), K: require('./kinds'), U: require('./unit'), S: require('./styles'), M: require('./make'), CAM: require('./camera'), C: require('./check'), Ly: require('./layers'), Cu: require('./cutouts'), Gp: require('../../gimp/gimp') }; return L; }
const VIEWS = new Map();
function viewOf(a) {
  const { U } = libs();
  const key = [a.game, a.gid, a.mod || '', U.modStamp(a.mod)].join('|');
  let V = VIEWS.get(key);
  if (!V) {
    for (const [k, old] of VIEWS) if (k.split('|').slice(0, 3).join('|') === key.split('|').slice(0, 3).join('|')) { try { old.close(); } catch (e) { /* ignore */ } VIEWS.delete(k); }
    if (VIEWS.size >= 4) { const k0 = VIEWS.keys().next().value; try { VIEWS.get(k0).close(); } catch (e) { /* ignore */ } VIEWS.delete(k0); }
    V = U.open({ game: a.game, gid: a.gid, mod: a.mod || null }); V._key = key; VIEWS.set(key, V);
  }
  return V;
}
function bad(msg) { throw Object.assign(new Error(msg), { status: 400 }); }
function unitOf(V, a) {
  const { U } = libs(), u = a.unit || {};
  if (!u.id || typeof u.id !== 'string') bad('Pick a unit first.');
  const br = u.breed || (typeof a.breed === 'string' ? a.breed : '');
  return U.resolve(V, u.id, { kind: u.kind, army: u.army, def: u.def, breed: br || undefined, portrait: u.portrait, hero: u.hero });
}
// the size of a picture the game or mod has now (a replaced picture of another size is named on the page)
function sizeOf(V, key) { try { const b = V.read(key); if (!b) return ''; const p = libs().I.decode(b, key); return p.w + 'x' + p.h; } catch (e) { return ''; } }
const pics = (V, k, stem) => { const { S, I } = libs(); if (!stem) return null; try { const f = S.frames(V, k, stem); return f ? f.map(p => I.dataUrl(p)) : null; } catch (e) { return null; } };
const modelsOf = V => V.memo.models || (V.memo.models = new Map());
let GS = null;
const gimpStatus = () => { if (!GS || Date.now() - GS.t > 60000) { let s; try { s = libs().Gp.status(); } catch (e) { s = { found: false, why: String(e.message) }; } GS = { t: Date.now(), s }; } return GS.s; };
const gimpLine = (s, cutter) => (s.found ? 'GIMP ' + s.version + ' at ' + s.exe + (cutter === 'gimp' ? ': these layers were cut by GIMP.' : cutter === 'none' ? '' : ': no cutouts of this class yet (Make cutouts); the built-in cutter is used meanwhile.') : 'GIMP not found, using the built-in cutter.');
function modelFor(V, k, u, a) { const { M } = libs(); return M.modelOf(V, k, u.group, u.army || '', { modelMemo: modelsOf(V), matchMod: !!a.matchMod, builtIn: !!a.builtIn }); }
const OPS = {
  // the unit's kinds with its pictures now (mod, else game, else none: "no picture yet") and a vanilla card of the same class beside them
  current(a) {
    const { K, S, CAM, Ly } = libs(), V = viewOf(a), u = unitOf(V, a), kinds = [];
    for (const k of K.list(a.gid)) {
      if (!k.on.includes(u.kind)) continue;
      const stem = K.stemOf(k, u), keys = stem ? (S.frameKeys(V, k, stem) || []) : [];
      let ref = null;
      try { const all = Ly.pick(V, k, u.group, {}).filter(r => r.stem !== stem); const r0 = all.find(r => u.army && r.army === u.army) || all[0]; if (r0) ref = { stem: r0.stem, pics: pics(V, k, r0.stem) }; } catch (e) { ref = null; }
      const shadow = stem ? K.filesOf(k, stem, '.tga').map(f => f.key.replace(/\.tga$/, '.png')).filter(x => V.has(x)) : [];
      kinds.push({ kind: k.id, folder: k.folder, w: k.w, h: k.h, frames: k.frames, tag: k.tag, use: k.use, miss: k.miss, stem,
        now: pics(V, k, stem), from: keys.length ? (V.fromMod(keys[0]) ? 'mod' : 'game') : 'none', keys, ref, shadow, camera: CAM.preset(a.gid, k.id, u.group) });
    }
    return { unit: u, kinds, na: (K.NOT[K.family(a.gid)] || []).slice() };
  },
  // the layers of each kind's class: what was read, the layer pictures, the badges, the templates, the cutouts and the cutter used
  styles(a) {
    const { K, Ly, Cu, I } = libs(), V = viewOf(a), u = unitOf(V, a), out = [], gs = gimpStatus();
    for (const k of K.list(a.gid)) {
      if (!k.on.includes(u.kind) || (a.kinds && !a.kinds.includes(k.id))) continue;
      const mode = (a.plateBy && a.plateBy[k.id]) || a.plate || 'plain';
      if (mode !== 'game') {
        // plain style: the plate drawn by code (lib/plain.js); no GIMP, no cutout cache is touched
        const P = libs().M.plainClassOf(V, u, k, K.stemOf(k, u), { matchMod: !!a.matchMod }), sm = libs().Lk.summary(P);
        out.push(Object.assign(sm, { game: a.gid, source: 'plain', plate: 'plain', cutter: 'plain', refs: 0, refsShown: [], allRefs: [], templates: [], template: null, zones: P.zones || [], badges: [], subject: null,
          pics: { background: I.dataUrl(P.plate[P.base]), frames: P.plate.map(p => I.dataUrl(p)), badges: [] }, cutouts: null, cutoutsMade: false, thumbs: [], kept: [], gimp: '', templatePics: [] }));
        continue;
      }
      const m = modelFor(V, k, u, a), s = Ly.summary(m);
      const set = m.cutouts ? Cu.load(m.cutouts) : null;
      out.push(Object.assign(s, { plate: 'game', pics: Ly.layerPics(m), cutter: m.cutter, cutouts: m.cutouts || m.cutoutDir || null, cutoutsMade: !!set, thumbs: set ? Cu.thumbs(set) : [], kept: set ? set.kept : [],
        gimp: gimpLine(gs, m.cutter), templatePics: m.template ? (m._sets || []).slice(0, 40).map(x => ({ stem: x.stem, url: I.dataUrl(x.f[0]) })) : [] }));
    }
    return { unit: u, styles: out, gimp: { found: !!gs.found, version: gs.version || '', exe: gs.exe || '', line: gimpLine(gs, 'none') } };
  },
  gimp() { const s = gimpStatus(); return { found: !!s.found, version: s.version || '', exe: s.exe || '', why: s.why || '', line: gimpLine(s, 'none') }; },
  // after a cutout build: the class readings are read again
  forget() { for (const V of VIEWS.values()) V.memo.models = null; GS = null; return { ok: true }; },
  // the layered .xcf of a class in the GIMP window (only a file in the cutout cache)
  openxcf(a) {
    const { Cu, Gp } = libs(), path = require('path'), fs = require('fs');
    const root = path.resolve(Cu.rootOf({})), f = path.resolve(String(a.dir || ''), 'class.xcf');
    if (!f.toLowerCase().startsWith(root.toLowerCase() + path.sep)) bad('Only a class .xcf in the cutout cache is opened here.');
    if (!fs.existsSync(f)) bad('No class.xcf there yet: make the cutouts first.');
    try { return Gp.openGui(f); } catch (e) { return bad(e.message); }
  },
  // round trip of the vanilla cards of the unit's classes (built-in cutter, 2 cards each): how close a rebuilt card comes
  fidelity(a) {
    const { K, Ly } = libs(), V = viewOf(a), u = unitOf(V, a), out = [];
    for (const k of K.list(a.gid)) { if (!k.on.includes(u.kind) || (a.kinds && !a.kinds.includes(k.id))) continue; const f = Ly.fidelity(V, k, u.group, u.army || '', { tests: 2 }); out.push({ kind: k.id, refs: f.refs, agg: f.agg, tests: f.tests.map(t => ({ stem: t.stem, skip: t.skip, frames: t.frames })) }); }
    return { unit: u, fidelity: out };
  },
  plan(a) { const { M } = libs(), V = viewOf(a), u = unitOf(V, a); return { unit: u, plan: M.plan(V, u, planOpts(a)) }; },
  // compose every kind from the source picture(s); write only with a.write (the caller has run the write guard)
  make(a) {
    const { I, M } = libs(), V = viewOf(a), u = unitOf(V, a), srcs = {};
    if (a.src) srcs.default = I.fromDataUrl(a.src);
    for (const k of Object.keys(a.srcs || {})) if (/^[a-z_]+$/.test(k) && a.srcs[k]) {
      // a kind's source: one data URL, or a list of up to 3 (GoH soldier card weapons, stacked by make)
      const v = a.srcs[k], l = (Array.isArray(v) ? v : [v]).filter(x => typeof x === 'string' && x).slice(0, 3).map(x => I.fromDataUrl(x));
      if (l.length) srcs[k] = Array.isArray(v) ? l : l[0];
    }
    // no picture at all: only the squad picture can be made (plain style: the badge picked, else the generic chevrons)
    const plainSquad = ((a.plateBy && a.plateBy.squad) || a.plate || 'plain') !== 'game' && libs().K.list(a.gid).some(k => k.id === 'squad' && k.on.includes(u.kind));
    if (!srcs.default && !Object.keys(srcs).length && !plainSquad) bad('Give a picture first: an image file, or a render of the model.');
    const badgeBy = {}; for (const k of Object.keys(a.badgeBy || {})) { const v = a.badgeBy[k]; badgeBy[k] = typeof v === 'string' && /^data:image\//.test(v) ? I.fromDataUrl(v) : v; }
    const o = Object.assign(planOpts(a), { plate: a.plate === 'game' ? 'game' : 'plain', plateBy: plateByOf(a.plateBy), modelMemo: modelsOf(V), builtIn: !!a.builtIn, fits: a.fits || {}, key: keyOf(a.key), tol: num(a.tol), soft: num(a.soft),
      style: { look: a.look || 'auto', tone: Array.isArray(a.tone) ? a.tone.map(Number) : undefined, shadow: a.shadow !== false }, styleBy: a.styleBy || {}, badgeBy, templateBy: a.templateBy || {}, layersBy: a.layersBy || {} });
    const r = M.make(V, u, srcs, o);
    const files = r.out.map(f => ({ key: f.key, kind: f.kind, frame: f.frame, size: f.size || '', bytes: f.buf.length, text: f.kind === 'data' || /\.ebm$/i.test(f.key) ? f.buf.toString('latin1') : undefined,
      had: V.has(f.key), fromMod: V.fromMod(f.key), hadSize: f.size && V.has(f.key) ? sizeOf(V, f.key) : '' }));
    const res = { unit: u, plan: r.plan, files, previews: r.previews, styles: r.styles };
    if (a.write) {
      if (!a.mod) bad('Pick your mod folder first.');
      res.written = M.write(r, a.mod).map(w => ({ key: w.key, path: w.path, bytes: w.bytes, kind: w.kind }));
      // the next call sees the new files
      for (const [k, v] of VIEWS) if (k.startsWith(a.game + '|' + a.gid + '|' + a.mod + '|')) { try { v.close(); } catch (e) { /* ignore */ } VIEWS.delete(k); }
    }
    return res;
  },
  // a source picture for the page: a file on disk (a.path) or bytes from the browser (a.data, a.name), any kind the lib decodes
  // (PNG, TGA, DDS, JPG, BMP) -> a PNG data URL the browser can draw, at most 1600 px on the long side
  load(a) {
    const { I } = libs(), fs = require('fs'), path = require('path');
    let buf, name;
    if (a.path) {
      const p = path.resolve(String(a.path)); name = p;
      if (!/\.(png|tga|dds|jpe?g|bmp)$/i.test(p)) bad('Pick a PNG, TGA, DDS, JPG or BMP picture.');
      let st; try { st = fs.statSync(p); } catch (e) { bad('The picture was not found: ' + p); }
      if (!st.isFile() || st.size > 48 * 1048576) bad('That is not a picture file under 48 MB: ' + p);
      buf = fs.readFileSync(p);
    } else {
      const m = /^data:[^;,]*;base64,(.*)$/i.exec(String(a.data || '')); if (!m) bad('No picture was given.');
      buf = Buffer.from(m[1], 'base64'); name = String(a.name || 'x.png');
    }
    let p; try { p = I.decode(buf, name); } catch (e) { bad('The picture could not be read (' + e.message + ').'); }
    const w0 = p.w, h0 = p.h, s = Math.min(1, 1600 / Math.max(p.w, p.h));
    if (s < 1) p = I.resize(p, Math.max(1, Math.round(p.w * s)), Math.max(1, Math.round(p.h * s)));
    return { url: I.dataUrl(p), w: p.w, h: p.h, w0, h0, alpha: I.hasAlpha(p), name: path.basename(name) };
  },
  // pictures in the mod folder (the image box's index): at most 3000, 8 folders deep
  images(a) {
    const fs = require('fs'), path = require('path'), out = [];
    if (!a.mod) return { images: out };
    const walk = (d, n) => { if (n > 8 || out.length >= 3000) return; let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
      for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, n + 1); else if (/\.(png|tga|dds|jpe?g|bmp)$/i.test(e.name)) out.push(p); if (out.length >= 3000) return; } };
    walk(a.mod, 0);
    return { images: out };
  },
  check(a) { const { C } = libs(), V = viewOf(a); return C.check(V, a.mod, {}); },
  stats: () => ({ views: VIEWS.size, models: [...VIEWS.values()].reduce((n, V) => n + (V.memo.models ? V.memo.models.size : 0), 0) }),
};
const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));
function keyOf(k) { if (Array.isArray(k)) return k.map(Number); if (k === 'none' || k === 'auto') return k; return 'auto'; }
function plateByOf(p) { const o = {}; for (const k of Object.keys(p || {})) if (/^[a-z_]+$/.test(k) && (p[k] === 'plain' || p[k] === 'game')) o[k] = p[k]; return o; }
function planOpts(a) { return { plate: a.plate === 'game' ? 'game' : 'plain', plateBy: plateByOf(a.plateBy), matchMod: !!a.matchMod, kinds: Array.isArray(a.kinds) && a.kinds.length ? a.kinds.map(String) : undefined, newPortrait: a.newPortrait ? String(a.newPortrait) : undefined, keepPortrait: !!a.keepPortrait }; }

// ---------- the queue on the main thread ----------
let WK = null, RUN = null, SEQ = 0;
const WQ = [];
function worker() {
  if (WK) return WK;
  let WT; try { WT = require('worker_threads'); } catch (e) { return null; }
  try { WK = new WT.Worker(__filename, { workerData: { ucWorker: true } }); } catch (e) { WK = null; return null; }
  const w = WK; w.unref();
  w.on('message', m => { const q = RUN; if (!q || q.w !== w || q.id !== m.id) return; RUN = null;
    if (m.err) q.no(Object.assign(new Error(m.err.message), m.err.status ? { status: m.err.status } : {})); else q.ok(m.r);
    pump(); if (!RUN) w.unref(); });
  const down = e => { if (WK === w) WK = null; if (RUN && RUN.w === w) { const q = RUN; RUN = null; q.no(e); } pump(); };
  w.on('error', e => down(e instanceof Error ? e : new Error(String(e))));
  w.on('exit', c => down(new Error('the unit card worker stopped (' + c + ')')));
  return w;
}
function pump() {
  if (RUN || !WQ.length) return;
  const w = process.env.UC_INLINE ? null : worker();
  if (!w) { for (const q of WQ.splice(0)) Promise.resolve().then(() => OPS[q.op](q.a)).then(q.ok, q.no); return; }
  const q = RUN = WQ.shift(); q.w = w; w.ref(); w.postMessage({ id: q.id, op: q.op, a: q.a });
}
function call(op, a) {
  if (!OPS[op]) return Promise.reject(new Error('unknown op ' + op));
  return new Promise((ok, no) => { WQ.push({ id: ++SEQ, op, a: JSON.parse(JSON.stringify(a || {})), ok, no }); pump(); });
}
function stop() { const w = WK; WK = null; if (w) try { w.terminate(); } catch (e) { /* ignore */ } }
module.exports = { call, stop, OPS, _t: { queue: () => ({ waiting: WQ.length, running: RUN ? RUN.op : '' }) } };

{
  let WT = null; try { WT = require('worker_threads'); } catch (e) { WT = null; }
  if (WT && !WT.isMainThread && WT.workerData && WT.workerData.ucWorker) {
    WT.parentPort.on('message', m => {
      const fail = e => WT.parentPort.postMessage({ id: m.id, err: { message: String((e && e.message) || e), status: (e && e.status) || 0 } });
      try { Promise.resolve(OPS[m.op](m.a)).then(r => WT.parentPort.postMessage({ id: m.id, r }), fail); } catch (e) { fail(e); }
    });
  }
}
