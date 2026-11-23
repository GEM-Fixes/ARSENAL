// macrostd/model: the macro model of a mod's SDL text (rows SDL-17/18/19/50, GPL-11, VFS-01, PORT-55/61). Every step reads it.
//   const m = build({ modDir, gameDir, exe, cacheDir?, log? })
//   scope (edited, counted): loose mod files under resource/ : set/** and properties/** that lib/sdlset calls SDL (stuff files with and
//     without extension, .presets, .inc ...), entity/**.def|.ext|.inc. Not lua, interface, texture, sound, map. VFS-06 skip extensions
//     (.txt ...) and .bak are left out. extra (read only, callers/includers): other SDL text under resource/ except interface/.
//   m.files    Map key -> { key, rel, abs, scope:true|false, s (latin1 text), scan }     key = lowercase 'resource/..', rel = real case path
//   m.defines  [{ name, key, rel, line, endLine, span, nameSpan, bodySpan, body, params:{named,positional}, header:[lines], desc, owner, idx }]
//   m.calls    [{ name, key, rel, line, span, nameSpan, params, args, dynamic, def (enclosing define object | null) }]
//   m.includes [{ key, rel, line, raw, kind 'virtual'|'fs'|'user'|'dynamic', target (resolved key), where 'mod'|'vanilla'|'missing'|'dynamic'|'fs'|'user' }]
//   m.graph    Map key -> Set(included keys) over the merged view (mod files + vanilla not overwritten; stuff `.presets` implicit, SDL-50)
//   m.includedBy Map key -> Set(includer keys)
//   m.roots    { mod:[keys], vanilla:[keys] }  mod = scope files nothing includes; vanilla = vanilla roots not overwritten whose include
//              closure reaches a mod file (PORT-55/61)
//   m.owner    Map name -> 'vanilla'|'mod' (vanilla: defined or called in any vanilla set/properties/entity file, or a defining mod
//              file overwrites a vanilla path, VFS-01)
//   m.byName   Map name -> { defs:[define], calls:[call] }   (mod files, scope + extra)
//   m.dyn      [{ name, re, key, line, side:'mod'|'vanilla' }]  call names built with %param ("gore_piece%0")
//   m.vanilla  { files: Map key -> {d,c,i,dy}, defined:Set, called:Set, has(key), read(key) -> Buffer|null, v (lib/vfs index) }
//   m.callCount(name) -> literal calls in mod + vanilla (0 for a name only a dynamic pattern may build)
//   m.dynMatch(name) -> first dynamic pattern that could build the name, or null
//   m.preInclude(key) -> ['…/.presets'] for a stuff file (SDL-50)
//   build({ ..., prev: model, texts: Map key -> latin1 }) rebuilds from a previous model with some file texts replaced (no disk read)
//   build({ ..., vanilla }) reuses a vanillaScan() result
// Vanilla scan is cached in <cacheDir>/vanilla-<exe>.json keyed by every container's size+mtime (default <ARSENAL_TMP or OS temp>/arsenal/macrostd-core/cache).
// Env MACROSTD_CACHE overrides.
// Author: Imperator_Aug (ARSENAL, ia-11964ee2)
const fs = require('fs'), path = require('path'), os = require('os');
const sdlx = require('../lib/sdlx'), sdlset = require('../lib/sdlset'), vfs = require('../lib/vfs');
const { walkFiles, relPath } = require('../lib/report');
const { scan, dynRe, bodyParams } = require('./scan');

const VERSION = 3;
const SKIP_EXT = /\.(txt|bak|temp|scc|s_tmp|s_msg|org|s_bcp|msg|old|orig)$/i;
function inScope(k) {
  if (SKIP_EXT.test(k) || /(^|\/)\.(git|svn)\//.test(k)) return false;
  if (/^resource\/(set|properties)\//.test(k)) return sdlset.isSdl(k);
  return /^resource\/entity\/.*\.(def|ext|inc)$/.test(k);
}
function isExtra(k) {
  if (inScope(k) || SKIP_EXT.test(k) || !k.startsWith('resource/')) return false;
  if (/^resource\/(interface|texture|sound|music|video|shader|script)\//.test(k) || k.endsWith('.lua')) return false;
  return sdlset.isSdl(k) && /\.(set|inc|ext|def|mi|info|ammo|weapon|presets)$/.test(k);   // .mdl/.mtl: no macros in real data
}
const defaultCache = () => process.env.MACROSTD_CACHE || (require('../lib/platform').tmpDir('macrostd-core/cache'));
function preIncludeKey(k) {
  if (!k.startsWith('resource/set/stuff/') || k.endsWith('/.presets') || k.endsWith('.fsm')) return null;
  return k.slice(0, k.lastIndexOf('/') + 1) + '.presets';
}
function resolve(raw, fromKey) {
  if (raw.includes('%')) return { kind: 'dynamic', key: null };
  return sdlx.resolveInclude(raw, fromKey);
}

// ---- vanilla: one pass over set/properties/entity text in the game's paks, cached
function vanillaScan(o) {
  const v = vfs.build({ gameDir: o.gameDir, exe: o.exe || 'mowas_2', mods: [] });
  const keys = [...v.files.keys()].filter(inScope).sort();
  const cont = new Map();
  for (const k of keys) { const r = v.files.get(k); if (!cont.has(r.container)) { let st = null; try { st = fs.statSync(r.container); } catch (x) {} cont.set(r.container, st ? st.size + ':' + st.mtimeMs : '?'); } }
  const sig = VERSION + '|' + keys.length + '|' + [...cont].sort().map(x => x.join('=')).join('|');
  const cdir = o.cacheDir || defaultCache(), cf = path.join(cdir, `vanilla-${o.exe || 'mowas_2'}.json`);
  let files = null;
  try { const j = JSON.parse(fs.readFileSync(cf, 'utf8')); if (j.sig === sig) files = new Map(Object.entries(j.files)); } catch (x) {}
  if (!files) {
    const t0 = Date.now();
    files = new Map();
    for (const k of keys) {
      let s; try { s = vfs.readRec(v.files.get(k)).toString('latin1'); } catch (x) { continue; }
      const r = scan(s);
      const inc = [];
      for (const i of r.includes) { const t = resolve(i.raw, k); if (t.kind === 'virtual') inc.push(t.key); }
      files.set(k, { d: [...new Set(r.defines.map(d => d.name))], c: [...new Set(r.calls.filter(c => !c.dynamic).map(c => c.name))], i: [...new Set(inc)], dy: [...new Set(r.calls.filter(c => c.dynamic).map(c => c.name))] });
    }
    try { fs.mkdirSync(cdir, { recursive: true }); fs.writeFileSync(cf, JSON.stringify({ sig, files: Object.fromEntries(files) })); } catch (x) {}
    if (o.log) o.log(`vanilla scan: ${files.size} files in ${Date.now() - t0} ms (cached ${cf})`);
  }
  const defined = new Set(), called = new Set();
  for (const f of files.values()) { for (const d of f.d) defined.add(d); for (const c of f.c) called.add(c); }
  const bufs = new Map();
  const read = k => { if (bufs.has(k)) return bufs.get(k); const r = v.files.get(k); let b = null; try { b = r ? vfs.readRec(r) : null; } catch (x) {} bufs.set(k, b); return b; };
  return { v, files, defined, called, has: k => v.files.has(k), read };
}

function build(o) {
  const modDir = path.resolve(o.modDir);
  const van = o.vanilla || vanillaScan(o);
  const files = new Map();
  const resDir = path.join(modDir, 'resource');
  if (o.prev) {   // rebuild after in-memory edits: o.texts Map key -> latin1 text (changed files), others reuse o.prev's record
    for (const [k, F] of o.prev.files) {
      const s = o.texts && o.texts.has(k) ? o.texts.get(k) : F.s;
      files.set(k, s === F.s ? F : Object.assign({}, F, { s, scan: scan(s) }));
    }
    // files an earlier step created (o.newFiles: key -> mod-relative path with real case) join the model
    if (o.texts && o.newFiles) for (const [k, rel] of o.newFiles) {
      if (files.has(k) || !o.texts.has(k)) continue;
      const sc = inScope(k); if (!sc && !isExtra(k)) continue;
      const s = o.texts.get(k);
      files.set(k, { key: k, rel, abs: path.join(modDir, ...rel.split('/')), scope: sc, s, scan: scan(s) });
    }
  } else if (fs.existsSync(resDir)) for (const f of walkFiles(resDir, /./)) {
    const rel = relPath(modDir, f), key = rel.toLowerCase();
    const sc = inScope(key);
    if (!sc && !isExtra(key)) continue;
    const buf = fs.readFileSync(f);
    if (buf.includes(0)) continue;               // binary
    const s = buf.toString('latin1');
    files.set(key, { key, rel, abs: f, scope: sc, s, scan: scan(s) });
  }
  const defines = [], calls = [], includes = [], byName = new Map(), dyn = [];
  const slot = n => { let x = byName.get(n); if (!x) byName.set(n, x = { defs: [], calls: [] }); return x; };
  for (const F of files.values()) {
    const ds = F.scan.defines.map(d => {
      const body = F.s.slice(d.bodySpan[0], d.bodySpan[1]);
      const desc = (d.header.map(h => h.replace(/^[ \t]*;+[ \t]*/, '').trim()).find(h => /[A-Za-z0-9]/.test(h)) || '').slice(0, 120);
      return Object.assign({}, d, { key: F.key, rel: F.rel, body, params: bodyParams(body), desc, scope: F.scope, idx: defines.length });
    });
    for (const d of ds) { defines.push(d); slot(d.name).defs.push(d); d.idx = defines.length - 1; }
    for (const c of F.scan.calls) {
      const x = Object.assign({}, c, { key: F.key, rel: F.rel, def: c.inDefine >= 0 ? ds[c.inDefine] : null, scope: F.scope });
      calls.push(x);
      if (c.dynamic) dyn.push({ name: c.name, re: dynRe(c.name), key: F.key, line: c.line, side: 'mod' }); else slot(c.name).calls.push(x);
    }
    for (const i of F.scan.includes) {
      const r = resolve(i.raw, F.key);
      const where = r.kind !== 'virtual' ? r.kind : files.has(r.key) ? 'mod' : van.has(r.key) ? 'vanilla' : 'missing';
      includes.push({ key: F.key, rel: F.rel, line: i.line, raw: i.raw, kind: r.kind, target: r.key, where, span: i.span, nameSpan: i.nameSpan, inDefine: i.inDefine });
    }
  }
  // files.has() above sees all mod files read so far; redo 'where' now that every file is known
  for (const i of includes) if (i.kind === 'virtual') i.where = files.has(i.target) ? 'mod' : van.has(i.target) ? 'vanilla' : 'missing';
  for (const [k, f] of van.files) for (const n of f.dy) dyn.push({ name: n, re: dynRe(n), key: k, line: 0, side: 'vanilla' });

  // merged include graph: mod files (scope + extra) + vanilla files not overwritten
  const graph = new Map(), includedBy = new Map();
  const edge = (a, b) => { let g = graph.get(a); if (!g) graph.set(a, g = new Set()); g.add(b); let r = includedBy.get(b); if (!r) includedBy.set(b, r = new Set()); r.add(a); };
  for (const i of includes) if (i.kind === 'virtual') edge(i.key, i.target);
  for (const [k, f] of van.files) if (!files.has(k)) for (const t of f.i) edge(k, t);
  const exists = k => files.has(k) || van.has(k);
  const preInclude = k => { const p = preIncludeKey(k); return p && exists(p) ? [p] : []; };
  for (const k of [...files.keys(), ...van.files.keys()]) for (const p of preInclude(k)) edge(k, p);
  const isRootKey = k => !(includedBy.get(k) || { size: 0 }).size && !k.endsWith('/.presets');
  const modRoots = [...files.values()].filter(f => f.scope && isRootKey(f.key)).map(f => f.key).sort();
  // vanilla roots whose closure reaches a mod file
  const reach = new Map();
  const reachesMod = (k, seen = new Set()) => {
    if (reach.has(k)) return reach.get(k);
    if (seen.has(k)) return false; seen.add(k);
    let r = false;
    for (const t of graph.get(k) || []) if (files.has(t) || reachesMod(t, seen)) { r = true; break; }
    reach.set(k, r); return r;
  };
  const vanRoots = [...van.files.keys()].filter(k => !files.has(k) && isRootKey(k) && reachesMod(k)).sort();

  // owner
  const owner = new Map();
  for (const [n, x] of byName) {
    let w = van.defined.has(n) || van.called.has(n) ? 'vanilla' : 'mod';
    if (w === 'mod' && x.defs.some(d => van.has(d.key))) w = 'vanilla';
    owner.set(n, w);
  }
  for (const d of defines) d.owner = owner.get(d.name);
  const callCount = n => (byName.get(n) ? byName.get(n).calls.length : 0) + (van.called.has(n) ? 1 : 0);
  const dynMatch = n => dyn.find(d => d.re.test(n)) || null;
  return { modDir, gameDir: o.gameDir, exe: o.exe, files, defines, calls, includes, graph, includedBy, roots: { mod: modRoots, vanilla: vanRoots }, owner, byName, dyn, vanilla: van, callCount, dynMatch, preInclude, exists, inScope };
}

function summary(m) {
  const names = [...m.owner.keys()].filter(n => m.byName.get(n).defs.length);
  const modOwned = names.filter(n => m.owner.get(n) === 'mod').length;
  const inc = {}; for (const i of m.includes) inc[i.where] = (inc[i.where] || 0) + 1;
  return {
    files: [...m.files.values()].filter(f => f.scope).length, extraFiles: [...m.files.values()].filter(f => !f.scope).length,
    defines: m.defines.length, defineNames: names.length, modOwned, vanillaOwned: names.length - modOwned,
    calls: m.calls.length, dynamicCalls: m.calls.filter(c => c.dynamic).length, includes: m.includes.length, includesBy: inc,
    rootsMod: m.roots.mod.length, rootsVanilla: m.roots.vanilla.length, vanillaFiles: m.vanilla.files.size,
  };
}

module.exports = { build, vanillaScan, summary, inScope, preIncludeKey, resolve };
