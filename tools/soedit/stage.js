// soedit/stage: copy a model's editable file set out of the game (loose or paks, mods over game) into a mod folder (README "stage").
//   stage({target, out, game, mods, anm:[names], noAnm, textures:'cache'|'stage'|'none', cacheDir, dry, log, exe}) -> {code, record, msg}
//   exe: the game's vfs exe (openSource below); given -> the record keeps it (record.exe) and check reads with it again.
//   target: any form of target.js: entity name | vfs key or disk path of a .mdl, .def or breed .set | breed:<key> | pak:<pak>!<entry>.
//     The out folder is read as a layer over the game (loose files and its own paks), so a model only in the mod's paks is found;
//     o.noOutLayer turns that off, o.modDirs adds more layers. A breed or human skin adds the shared human model (shared: true).
//   file set: the .mdl; every .ply / .vol / .anm string it holds (VolumeView, LODView/View, Volume Polyhedron, sequence {file}); a
//     {sequence "n"} without {file} = n.anm next to the mdl (formats/mdl); each ply's materials (tools/binhdr/ply.js meshRefs: .mtl from the
//     ply folder, then the mdl folder; a name without .mtl = texture name, <name>.mtl also tried); <mdl stem>.mtl and <stem>#N.mtl; textures
//     named by each .mtl (diffuse diffuse1 bump specular mask envmap; $/ = resource/texture/common/, leading / = resource/, else the mtl
//     folder; every existing extension of .dds .tga .ebm .bmp .tex .jpg .png and camo variants <name>#x.<ext>). Unresolved names are listed, not fatal.
//   copies to <out>/<vfs key> (same relative path), never overwrites a file already in the mod (recorded present:true, its bytes hashed).
//   textures: cache (default) = written to a view cache outside the mod (os tmpdir/ARSENAL/soedit-view/<game+mods hash>/resource/...), the
//     cache folder is a --respath line so SOEdit finds them; stage = copied into the mod with the rest; none = skipped.
//   record: <out>/.arsenal/soedit/<mdl stem>.stage.json; pristine copies of every staged file at <out>/.arsenal/soedit/<stem>.orig/<rel>
//     (check diffs against these; the game only mounts <mod>/resource, so .arsenal is never loaded).
//   refusals: out or cache inside a game install / tools folder (tools/lib/writeguard.js), a key that would leave out.
// Author: Imperator_Aug (ARSENAL, ia-ca3e2e32)
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const vfs = require('../lib/vfs'), names = require('../lib/names'), sdl = require('../lib/sdl'), wg = require('../lib/writeguard'), pak = require('../lib/pak');
const { meshRefs } = require('../binhdr/ply');

const TEX_EXTS = ['.dds', '.tga', '.ebm', '.bmp', '.tex', '.jpg', '.png'];
const TEX_KEYS = new Set(['diffuse', 'diffuse1', 'bump', 'specular', 'mask', 'envmap']);
const EDIT_EXTS = new Set(['.mdl', '.ply', '.vol', '.anm', '.mtl']);
const GAME_LAYER = l => l === 'base' || /^patch \d+$/.test(l) || l === 'as64/core';

const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const fwd = p => String(p).replace(/\\/g, '/');
const dirOf = k => k.slice(0, k.lastIndexOf('/') + 1);
const stemOf = k => { const b = k.slice(k.lastIndexOf('/') + 1); return b.replace(/\.mdl$/i, ''); };
const lines = buf => buf.toString('latin1').split(/\r?\n/);
const keyToDisk = (root, key) => path.join(root, ...key.split('/'));
const arsenalDir = out => path.join(out, '.arsenal', 'soedit');
const recordPath = (out, stem) => path.join(arsenalDir(out), stem + '.stage.json');
const pristinePath = (out, stem, rel) => path.join(arsenalDir(out), stem + '.orig', ...rel.split('/'));
// the texture view cache folder; a game other than AS64 (exe mowas_2 / goh) gets its own folder, AS64 and no exe keep the old one
function defaultCache(game, mods, exe) {
  const e = exe === 'mowas2' ? 'mowas_2' : exe;
  const h = crypto.createHash('md5').update(fwd(path.resolve(game || '-')).toLowerCase() + '|' + (mods || []).join(',') + (e && e !== 'as64' ? '|' + e : '')).digest('hex').slice(0, 8);
  return path.join(os.tmpdir(), 'ARSENAL', 'soedit-view', h);
}

// texture string -> key base ($/ texture/common, / resource root, else relative to dir)
function texBase(t, dir) {
  const l = names.normalize(t);
  return path.posix.normalize(l.startsWith('$/') ? 'resource/texture/common/' + l.slice(2) : l.startsWith('/') ? 'resource/' + l.slice(1) : dir + l);
}
const refKey = (s, dir) => path.posix.normalize(names.resolve(s, dir).key);

// ---- source: vfs (game + mods + mod folders as layers) with an optional disk overlay for a file given by path, and an optional
// pak given by path read first (pak:<file>!<entry> targets).
//   openSource({ game, mods, modDir, modDirs, overlay: {root, prefix}, pakOverlay: {file, root}, noInfer, exe })
//   exe: the vfs exe ('as64' | 'mowas_2' (alias 'mowas2') | 'goh', lib/games); none = the vfs default (as64 when as64.exe is in the
//     folder). MoW:AS2 shares the AS2 install with AS64: without exe mowas_2 it would see the as64/core files.
//   modDir / modDirs: mod folders laid over the game as layers (lib/vfs.js modDirs): their loose files AND their own paks, whatever
//     the game's mod list says. An overlay rooted at <folder>/resource (a mod folder's tree, as tools/lib/model/sceneload.js and
//     edit/core.js pass) also lays <folder> over the game, so a model whose files sit in that mod's paks is found (noInfer: off).
//   origin of a file: { source: 'file'|'pak'|'game'|'mod', where: 'file'|'game'|'mod', pakName: '<x.pak>'|'', pak, entry, path, layer }
// the view of game + mods + mod folders: lib/gameview withModsSync (noAge), so the game is mounted once per process (the shared
// game view is the base, lib/vfs opts.base) and a mod folder this process has a fresh scan of (lib/modtree fresh: the GUI server)
// is laid on from that scan (lib/vfs opts.listings: no stat per file); with no scan (the command line) the folder is walked as
// before. Never served by age: the files are what the disk holds now. The same view lib/vfs build gives for these options; an
// exe word gameview would read another way (as64 named for a folder without as64.exe, an unknown word) is built directly.
function viewOf(o, dirs) {
  const mods = o.mods || [], e = o.exe;
  const shared = Array.isArray(mods) && (!e || e === 'mowas_2' || e === 'mowas2' || e === 'goh' || (e === 'as64' && fs.existsSync(path.join(o.game, 'as64.exe'))));
  if (!shared) return vfs.build(Object.assign({ gameDir: o.game, mods, modDirs: dirs }, e ? { exe: e } : {}));
  return require('../lib/gameview').withModsSync({ gameDir: o.game, exe: e || undefined, list: mods, mods: dirs }, { noAge: true });
}
function openSource(o) {
  const ov = o.overlay || null;   // {root: disk dir, prefix: key prefix}
  const same = (a, b) => fwd(path.resolve(a)).toLowerCase() === fwd(path.resolve(b)).toLowerCase();
  const dirs = [].concat(o.modDirs || [], o.modDir ? [o.modDir] : []).filter(Boolean);
  if (!o.noInfer && ov && ov.prefix === 'resource/' && path.basename(ov.root).toLowerCase() === 'resource') {
    const up = path.dirname(path.resolve(ov.root));
    if (!(o.game && same(up, o.game)) && !dirs.some(d => same(d, up)) && fs.existsSync(up)) dirs.push(up);
  }
  const v = o.game ? viewOf(o, dirs) : null;
  let po = null;   // pak given by path: key -> entry
  if (o.pakOverlay && o.pakOverlay.file) {
    po = { file: path.resolve(o.pakOverlay.file), map: new Map() };
    try { for (const e of pak.list(po.file)) if (!e.name.endsWith('/')) po.map.set(path.posix.normalize(o.pakOverlay.root + names.zipEntryName(e.name)), e); } catch (e) { po.error = e.message; }
  }
  const byDir = new Map();
  const addDir = k => { const d = dirOf(k); let l = byDir.get(d); if (!l) byDir.set(d, l = []); l.push(k); };
  if (v) for (const k of v.files.keys()) addDir(k);
  if (po) for (const k of po.map.keys()) if (!(v && v.files.has(k))) addDir(k);
  const ovPath = key => ov && key.startsWith(ov.prefix) ? path.join(ov.root, ...key.slice(ov.prefix.length).split('/')) : null;
  const isFile = p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
  let poFd = null;
  const src = {
    v, modDirs: v ? v.modDirs : [],
    has: key => { const p = ovPath(key); return (p && isFile(p)) || !!(po && po.map.has(key)) || !!(v && v.files.has(key)); },
    get(key) {
      const p = ovPath(key);
      if (p && isFile(p)) return { buf: fs.readFileSync(p), origin: { source: 'file', where: 'file', pakName: '', path: fwd(p) } };
      const pe = po && po.map.get(key);
      if (pe) {
        if (poFd === null) poFd = { file: po.file, fd: fs.openSync(po.file, 'r') };
        return { buf: pak.read(poFd, pe), origin: { source: 'pak', where: 'file', pakName: path.basename(po.file), pak: fwd(po.file), entry: pe.name } };
      }
      const r = v && v.files.get(key);
      if (!r) return null;
      const buf = vfs.readRec(r);
      const game = GAME_LAYER(r.layer);
      const origin = r.source === 'pak'
        ? { source: game ? 'pak' : 'mod', where: game ? 'game' : 'mod', pakName: path.posix.basename(r.container), pak: r.container, entry: r.entry, layer: r.layer }
        : { source: game ? 'game' : 'mod', where: game ? 'game' : 'mod', pakName: '', path: fwd(path.join(r.container, r.entry)), layer: r.layer };
      return { buf, origin };
    },
    keysIn(dir) {
      const out = new Set(byDir.get(dir) || []);
      if (ov && dir.startsWith(ov.prefix)) {
        const d = path.join(ov.root, ...dir.slice(ov.prefix.length).split('/').filter(Boolean));
        try { for (const n of fs.readdirSync(d)) if (isFile(path.join(d, n))) out.add(dir + n.toLowerCase()); } catch (e) { /* none */ }
      }
      return [...out];
    },
    // every key of the vfs and the pak given by path (not the disk overlay: it is read on demand)
    *allKeys() { if (v) yield* v.files.keys(); if (po) for (const k of po.map.keys()) if (!(v && v.files.has(k))) yield k; },
    close() { vfs.closeRecs(); if (poFd) { try { fs.closeSync(poFd.fd); } catch (e) { /* closed */ } poFd = null; } },
  };
  return src;
}

// ---- target -> {key, overlay, entity} | {error}   (the old forms, kept for tools/lib/model/sceneload.js and edit/core.js;
// stage() itself resolves through target.js, which also knows .def, breeds and pak entries)
function resolveTarget(o) {
  const t = String(o.target || '');
  if (!t) return { error: 'Name an entity or a .mdl file to stage.' };
  const isFile = p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
  if (/\.mdl$/i.test(t) && isFile(t)) {
    const abs = fwd(path.resolve(t)), low = abs.toLowerCase(), i = low.lastIndexOf('/resource/');
    if (i >= 0) return { key: 'resource/' + low.slice(i + 10), overlay: { root: abs.slice(0, i) + '/resource', prefix: 'resource/' }, file: abs };
    return { key: 'resource/' + path.basename(low), overlay: { root: path.dirname(abs), prefix: 'resource/' }, file: abs };
  }
  if (/\.mdl$/i.test(t)) {
    const n = names.normalize(t).replace(/^\/+/, '');
    return { keys: n.startsWith('resource/') ? [n] : ['resource/' + n, 'resource/entity/' + n] };
  }
  return { entity: t };
}

// ---- file set
function collect(src, mdlKey, o = {}) {
  const files = new Map();     // key -> {kind, from}
  const unresolved = [];
  const seenUnres = new Set();
  const miss = (kind, name, from, tried) => { const k = kind + '|' + name + '|' + from; if (seenUnres.has(k)) return; seenUnres.add(k); unresolved.push({ kind, name, from, tried }); };
  const add = (key, kind, from) => { if (!files.has(key)) files.set(key, { kind, from }); };
  const mdlDir = dirOf(mdlKey);
  const mdl = src.get(mdlKey);
  if (!mdl) return { error: `Model ${mdlKey} is not in the game or the named mods.` };
  add(mdlKey, 'mdl', null);
  const tree = sdl.parseLines(lines(mdl.buf));
  const refs = [];   // [kind, name]
  (function walk(n) {
    for (const k of n.kids) {
      const nm = (k.name || '').toLowerCase();
      if (nm === 'sequence' && !sdl.kids(k, 'file').length && k.vals.length) refs.push(['anm', k.vals[0].v + '.anm']);
      for (const v of k.vals) {
        if (v.t !== 's') continue;
        const e = names.ext(names.normalize(v.v));
        if (e === '.ply') refs.push(['ply', v.v]); else if (e === '.vol') refs.push(['vol', v.v]); else if (e === '.anm') refs.push(['anm', v.v]);
      }
      walk(k);
    }
  })(tree);
  for (const a of o.anm || []) refs.push(['anm', /\.anm$/i.test(a) ? a : a + '.anm']);
  const plys = [];
  for (const [kind, name] of refs) {
    if (kind === 'anm' && o.noAnm) continue;
    const key = refKey(name, mdlDir);
    if (src.has(key)) { add(key, kind, mdlKey); if (kind === 'ply' && !plys.includes(key)) plys.push(key); } else miss(kind, name, mdlKey, [key]);
  }
  // materials
  const mtls = [];
  const addMtl = (key, from) => { add(key, 'mtl', from); if (!mtls.includes(key)) mtls.push(key); };
  const stemBase = mdlKey.replace(/\.mdl$/, '');
  for (const c of [stemBase + '.mtl', ...Array.from({ length: 9 }, (_, i) => `${stemBase}#${i + 1}.mtl`)]) if (src.has(c)) addMtl(c, mdlKey);
  const texWanted = [];   // [name, dir, from]
  for (const pk of plys) {
    const g = src.get(pk); if (!g) continue;
    let r; try { r = meshRefs(g.buf); } catch (e) { r = { mtls: [], tex: [] }; }
    for (const m of r.mtls) {
      const isMtl = /\.mtl$/i.test(m);
      const tries = isMtl ? [refKey(m, dirOf(pk)), refKey(m, mdlDir)] : [refKey(m + '.mtl', dirOf(pk)), refKey(m + '.mtl', mdlDir)];
      const hit = tries.find(k => src.has(k));
      if (hit) addMtl(hit, pk);
      else if (isMtl) miss('mtl', m, pk, [...new Set(tries)]);
      else texWanted.push([m, dirOf(pk), pk]);
    }
    for (const t of r.tex) texWanted.push([t, dirOf(pk), pk]);
  }
  for (const mk of mtls) {
    const g = src.get(mk); if (!g) continue;
    (function walk(n) {
      for (const k of n.kids) {
        if (TEX_KEYS.has((k.name || '').toLowerCase())) { const s = k.vals.find(v => v.t === 's') || k.vals[0]; if (s && s.v) texWanted.push([s.v, dirOf(mk), mk]); }
        walk(k);
      }
    })(sdl.parseLines(lines(g.buf)));
  }
  if (o.textures !== 'none') {
    for (const [t, dir, from] of texWanted) {
      if (t.startsWith('#')) { miss('texture', t, from, ['(texture map alias, not a file)']); continue; }
      const base = texBase(t, dir);
      const found = findTex(src, base);
      if (found.length) for (const k of found) add(k, 'texture', from); else miss('texture', t, from, [base + '{' + TEX_EXTS.join(',') + '}']);
    }
  }
  return { files, unresolved };
}
function findTex(src, base) {
  const out = [];
  const e = names.ext(base);
  if (TEX_EXTS.includes(e) && src.has(base)) out.push(base);
  for (const x of TEX_EXTS) if (src.has(base + x)) out.push(base + x);
  const dir = dirOf(base), stem = base.slice(dir.length);
  if (out.length) for (const k of src.keysIn(dir)) {   // camo / state variants <stem>#x.<ext>
    const n = k.slice(dir.length);
    if (n.startsWith(stem + '#') && TEX_EXTS.includes(names.ext(n)) && !out.includes(k)) out.push(k);
  }
  return out;
}

// ---- stage
function stage(o) {
  const log = o.log || (s => console.log(s));
  const mode = o.textures || 'cache';
  if (!['cache', 'stage', 'none'].includes(mode)) return { code: 2, msg: `--textures must be cache, stage or none (got ${mode}).` };
  if (!o.out) return { code: 2, msg: 'Name the mod folder to stage into with --out <mod folder>.' };
  const out = path.resolve(o.out);
  const why = wg.refuseWrite(out, { game: o.game, purpose: 'stage a model for SOEdit' });
  if (why) return { code: 2, msg: why };
  const cacheDir = mode === 'cache' ? path.resolve(o.cacheDir || defaultCache(o.game, o.mods, o.exe)) : null;
  if (cacheDir) { const w = wg.refuseWrite(cacheDir, { game: o.game, purpose: 'write the SOEdit texture view cache' }); if (w) return { code: 2, msg: w }; }

  // target forms and their resolution: target.js. The out folder (the mod) is a layer over the game, its paks too, so a model
  // that lives only in the mod's pak is found; a file given by path also lays its own mod folder (if any) on top.
  const T = require('./target');
  const p0 = T.parse(o.target);
  if (p0.error) return { code: 2, msg: p0.error };
  if (!o.game && p0.form !== 'file' && p0.form !== 'pak') return { code: 2, msg: 'No game folder: pass --game <Men of War Assault Squad 2 folder> (or set AS2_GAME).' };
  const t = T.resolve({ target: o.target, game: o.game, mods: o.mods || [], modDirs: o.noOutLayer ? (o.modDirs || []) : [...(o.modDirs || []), out], exe: o.exe });
  if (t.error) return { code: 2, msg: t.error };
  const mdlKey = t.mdlKey, def = t.def, src = t.src;
  try {
    const c = collect(src, mdlKey, { anm: o.anm, noAnm: o.noAnm, textures: mode });
    if (c.error) return { code: 2, msg: c.error };
    // a human skin: the shared human model's own file set (its meshes, materials, textures; clips only when named), then the
    // def / breed / clip list files as 'other'. shared: true = not the picked model's own file.
    for (const x of t.extras) {
      const cx = collect(src, x.key, { anm: o.anm, noAnm: true, textures: mode });
      if (cx.error) { c.unresolved.push({ kind: 'mdl', name: x.key, from: mdlKey, tried: [x.key] }); continue; }
      for (const [k, f] of cx.files) if (!c.files.has(k)) c.files.set(k, Object.assign({}, f, { shared: true, from: f.from || mdlKey }));
      for (const u of cx.unresolved) c.unresolved.push(u);
    }
    for (const x of t.others) if (!c.files.has(x.key) && src.has(x.key)) c.files.set(x.key, { kind: 'other', from: null, why: x.why, shared: x.key !== t.def && x.key !== t.breed });
    const stem = stemOf(mdlKey);
    const recFile = recordPath(out, stem);
    let old = null;
    try { old = JSON.parse(fs.readFileSync(recFile, 'utf8')); } catch (e) { old = null; }
    const oldBy = new Map(((old && old.files) || []).map(f => [f.rel, f]));
    const rec = {
      tool: 'soedit', version: 1, stem, model: mdlKey, entity: t.entity || null, def, target: o.target, form: t.form, breed: t.breed || null, skin: t.skin || null,
      human: !!t.human, extras: t.extras.map(x => x.key),
      game: o.game ? fwd(path.resolve(o.game)) : null, ...(o.exe ? { exe: src.v ? src.v.exe : o.exe } : {}), mods: o.mods || [], layers: (src.modDirs || []).map(d => ({ dir: d.dir, id: d.id })), out: fwd(out), staged: new Date().toISOString(),
      pristine: fwd(path.relative(out, path.join(arsenalDir(out), stem + '.orig'))),
      textures: { mode, cache: cacheDir ? fwd(cacheDir) : null, files: [] }, files: [], unresolved: c.unresolved,
    };
    let copied = 0, kept = 0, cached = 0, cacheKept = 0;
    const writes = [];
    for (const [key, info] of [...c.files.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
      if (key.split('/').includes('..') || !key.startsWith('resource/')) { rec.unresolved.push({ kind: info.kind, name: key, from: info.from, tried: ['(path leaves the mod folder)'] }); continue; }
      const g = src.get(key); if (!g) continue;
      const toCache = info.kind === 'texture' && mode === 'cache';
      if (toCache) {
        const dest = keyToDisk(cacheDir, key);
        let same = false; try { same = sha256(fs.readFileSync(dest)) === sha256(g.buf); } catch (e) { same = false; }
        if (same) cacheKept++; else { cached++; writes.push([dest, g.buf]); }
        rec.textures.files.push({ rel: key, from: info.from, ...g.origin, size: g.buf.length, sha256: sha256(g.buf), ...(info.shared ? { shared: true } : {}) });
        continue;
      }
      const dest = keyToDisk(out, key);
      const prev = oldBy.get(key);
      if (prev && fs.existsSync(dest)) { rec.files.push(prev); kept++; continue; }   // staged before: keep its first record + pristine copy
      let present = false, buf = g.buf, origin = g.origin;
      if (fs.existsSync(dest)) { present = true; buf = fs.readFileSync(dest); origin = Object.assign({}, g.origin, { source: 'mod', where: 'mod', pakName: '', path: fwd(dest), shadows: g.origin.source }); kept++; }
      else { copied++; writes.push([dest, g.buf]); }
      writes.push([pristinePath(out, stem, key), buf]);
      rec.files.push({ rel: key, kind: info.kind, from: info.from, ...origin, size: buf.length, sha256: sha256(buf), present, ...(info.shared ? { shared: true } : {}), ...(info.why ? { why: info.why } : {}) });
    }
    const counts = {}; for (const f of rec.files) counts[f.kind] = (counts[f.kind] || 0) + 1;
    rec.counts = Object.assign(counts, { copied, kept, cached, cacheKept, unresolved: rec.unresolved.length, textures: rec.textures.files.length + (counts.texture || 0) });
    if (!o.dry) {
      for (const [dest, buf] of writes) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, buf); }
      fs.mkdirSync(path.dirname(recFile), { recursive: true });
      fs.writeFileSync(recFile, JSON.stringify(rec, null, 1) + '\n');
    }
    const by = Object.entries(counts).filter(([k]) => ['mdl', 'ply', 'vol', 'anm', 'mtl', 'texture'].includes(k)).map(([k, n]) => `${n} ${k}`).join(', ');
    log(`${o.dry ? 'dry run, would stage' : 'staged'} ${mdlKey}${t.entity ? ` (entity ${t.entity})` : ''}${t.breed ? ` (breed ${t.breed})` : ''} -> ${fwd(out)}`);
    if (t.extras.length) log(`shared: ${t.extras.map(x => x.key + ' (' + x.why + ')').join(', ')}`);
    log(`files: ${by}; copied ${copied}, kept ${kept} already in the mod`);
    if (mode === 'cache') log(`textures: ${rec.textures.files.length} in the view cache ${fwd(cacheDir)} (${cached} ${o.dry ? 'to write' : 'written'}, ${cacheKept} up to date)`);
    else if (mode === 'none') log('textures: not staged (--textures none)');
    for (const u of rec.unresolved) log(`unresolved ${u.kind} "${u.name}" from ${u.from || '-'} (tried ${u.tried.join(', ')})`);
    log(`record: ${fwd(recFile)}${o.dry ? ' (not written)' : ''}`);
    if (o.json) fs.writeFileSync(o.json, JSON.stringify(rec, null, 1) + '\n');   // the plan, also on --dry (a file the caller named)
    return { code: 0, record: rec, recordFile: recFile };
  } finally { src.close(); }
}

// record from a record file or a staged .mdl (walk up to the folder holding resource/ -> .arsenal/soedit/<stem>.stage.json)
function findRecord(arg) {
  const abs = path.resolve(arg);
  if (/\.json$/i.test(abs)) return { file: abs, rec: JSON.parse(fs.readFileSync(abs, 'utf8')) };
  const stem = path.basename(abs).replace(/\.mdl$/i, '').toLowerCase();
  let d = path.dirname(abs);
  for (;;) {
    const f = recordPath(d, stem);
    if (fs.existsSync(f)) return { file: f, rec: JSON.parse(fs.readFileSync(f, 'utf8')) };
    const up = path.dirname(d); if (up === d) return null; d = up;
  }
}
const outOfRecord = file => path.resolve(path.dirname(file), '..', '..');

module.exports = { stage, collect, openSource, resolveTarget, findRecord, outOfRecord, recordPath, pristinePath, arsenalDir, defaultCache, texBase, sha256, EDIT_EXTS, TEX_EXTS };
