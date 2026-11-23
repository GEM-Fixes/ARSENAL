// art ext, server side: read the game's files through the VFS, find what a unit uses, copy into a mod, check art, read wav/image headers.
// Read-only on the game. Writes only into the mod folder the user picked (never the game install, GoH or Workshop).
// Author: Imperator_Aug (ARSENAL, ia-a1b96748)
'use strict';
const fs = require('fs'), path = require('path');
const vfs = require('../../../lib/vfs');
const D = require('./data');

const bad = (m, status) => Object.assign(new Error(m), { status: status || 400 });
const fwd = p => String(p).replace(/\\/g, '/');
const lc = s => String(s).toLowerCase();
const extOf = k => { const b = k.slice(k.lastIndexOf('/') + 1), i = b.lastIndexOf('.'); return i < 0 ? '' : b.slice(i).toLowerCase(); };
const baseOf = k => k.slice(k.lastIndexOf('/') + 1);
const dirOf = k => k.slice(0, k.lastIndexOf('/'));
const stemOf = k => { const b = baseOf(k), i = b.lastIndexOf('.'); return i < 0 ? b : b.slice(0, i); };

// ---------- the game, cached for a short time (building the index takes about a second; GoH about 15) ----------
// g (every function below that takes the game): the game folder as a string (as before: the vfs picks the exe, as64 first), or
// game parity {dir, exe, kind}: exe = the vfs exe ('mowas_2' | 'goh'), kind 'as2' | 'goh' (GoH: dir = the GoH install).
// The cache is keyed by folder and exe, so AS64 and MoW:AS2 (one shared install) and GoH never share an answer.
function gameOf(g) { return g && typeof g === 'object' ? { dir: g.dir || '', exe: g.exe || undefined, kind: g.kind === 'goh' || g.exe === 'goh' ? 'goh' : 'as2' } : { dir: g || '', exe: undefined, kind: 'as2' }; }
const isGohG = g => gameOf(g).kind === 'goh';
// CACHE (gui README contract 1): the game's file view is the shared one (lib/gameview: one per game folder + exe for every page,
// built again when the game stamp moves; the 2 minute copy this page kept is gone).
function game(g) {
  const G = gameOf(g);
  if (!G.dir) throw bad(G.kind === 'goh' ? 'The Gates of Hell folder was not found. Set it with "Game folder" at the top of the page.' : 'The game folder is not set. Use "Game folder" at the top of the page.');
  return require('../../../lib/gameview').get(G.exe ? { gameDir: G.dir, exe: G.exe } : { gameDir: G.dir });
}
function readGame(rec) { try { return vfs.readRec(rec); } finally { try { vfs.closeRecs(); } catch (e) { /* ignore */ } } }

// ---------- the mod folder (loose files only) ----------
const SKIP_IN_MOD = /(^|\/)(\.git|node_modules)(\/|$)/;
function walk(dir, rel, out, cap) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of ents) {
    if (out.length >= cap) return;
    const r = rel ? rel + '/' + e.name : e.name;
    if (SKIP_IN_MOD.test(r)) continue;
    if (e.isDirectory()) walk(path.join(dir, e.name), r, out, cap);
    else if (e.isFile()) out.push(r);
  }
}
// path rules: any readable folder for reading; for writing: not inside the game install except <game>/mods/<mod>, never GoH or Workshop.
// GoH (g kind goh): a GoH mod folder of the user's own outside the GoH install; the write guard (lib/writeguard) decides, and its
// refusal (inside the GoH install, the Workshop, a drive root ...) is the plain line shown (game parity brief: ARSENAL never writes into GoH)
function modDir(mod, g, forWrite) {
  if (!mod || typeof mod !== 'string') throw bad('Pick your mod folder first (Mods page).');
  const p = path.resolve(mod), gamedir = gameOf(g).dir;
  let st; try { st = fs.statSync(p); } catch (e) { throw bad('That mod folder does not exist: ' + mod); }
  if (!st.isDirectory()) throw bad('That is not a folder: ' + mod);
  if (forWrite && isGohG(g)) {
    const why = require('../../../lib/writeguard').refuseWrite(p, { game: gamedir || undefined, purpose: 'write' });
    if (why) throw bad('Refused: ' + why.replace(/^refused:\s*/i, ''));
    return p;
  }
  if (forWrite) {
    const f = lc(fwd(p));
    // GoH or the Workshop: the shared guard decides (a Workshop item, or a GoH mod ARSENAL did not make, only with Advanced on; owner 2026-11-15)
    if (/call to arms|gates of hell|\/workshop\/|steamapps\/workshop/.test(f) && require('../../../lib/writeguard').refuseWrite(p, { game: gamedir || undefined })) throw bad('Refused: that folder belongs to Gates of Hell or the Workshop. Pick your own mod folder, or switch on Advanced under Tools & Settings to write straight into it.');
    if (gamedir) {
      const g = lc(fwd(path.resolve(gamedir))), ok = f.startsWith(g + '/mods/') && f.slice(g.length + 6).split('/').length === 1;
      if ((f === g || f.startsWith(g + '/')) && !ok) throw bad('Refused: files are only written into <game>/mods/<your mod>, never into the game install itself.');
    }
  }
  return p;
}
// CACHE: the mod's loose files, up to cap, in the order the folder walk gives. While a route holds a scan of the shared walk of the
// mod (lib/modtree; index.js awaits modtree.ensure and hands it over with useScan for the time of the request), the list is taken
// from its rows: sorted folder by folder as a folder listing is (by name, letter case ignored, a folder's files before the next
// name), which is the depth-first order of walk(), so the cap cuts at the same file. With no scan handed over (a direct call, a
// test) the folders are read here as before. The rows leave out .svn and .arsenal too (tool folders, no mod data).
const ORDER = new WeakMap(), SCANS = new Map(), scanKey = d => lc(fwd(path.resolve(String(d))));
// useScan(dir, T) -> release(): T (a lib/modtree scan of dir) answers listMod(dir) until release() is called
function useScan(dir, T) {
  const k = scanKey(dir), s = { T };
  let a = SCANS.get(k); if (!a) SCANS.set(k, a = []);
  a.push(s);
  return () => { const i = a.indexOf(s); if (i >= 0) a.splice(i, 1); if (!a.length && SCANS.get(k) === a) SCANS.delete(k); };
}
function listMod(mod, cap) {
  const held = SCANS.get(scanKey(mod)), T = held && held.length ? held[held.length - 1].T : null;
  if (!T || !Array.isArray(T.files)) { const all = []; walk(mod, '', all, cap); return all; }
  let o = ORDER.get(T);
  if (!o) {
    const rows = T.files.filter(r => !SKIP_IN_MOD.test(r[0])).map(r => ({ r: r[0], p: r[0].toUpperCase().split('/') }));
    rows.sort((x, y) => { const a = x.p, b = y.p, n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return a.length - b.length; });
    o = rows.map(x => x.r); ORDER.set(T, o);
  }
  return o.length > cap ? o.slice(0, cap) : o.slice();
}
function modFiles(mod, cap) {
  const all = listMod(mod, cap || 40000);
  const out = new Map();
  for (const r of all) { const k = lc(r); if (k.startsWith('resource/')) out.set(k, { source: 'loose', container: mod, entry: r, layer: 'mod' }); }
  return { map: out, total: all.length, nonResource: all.filter(r => !lc(r).startsWith('resource/')) };
}

// one view: game files + mod files (mod wins), with a lookup by basename
function view(gamedir, mod) {
  const v = game(gamedir), g = v.files, m = mod ? modFiles(mod).map : new Map();
  const get = k => m.get(k) || g.get(k);
  const has = k => m.has(k) || g.has(k);
  const keys = function* () { for (const k of g.keys()) yield k; for (const k of m.keys()) if (!g.has(k)) yield k; };
  return { g, m, get, has, keys, readAny: rec => (rec.source === 'loose' ? fs.readFileSync(path.join(rec.container, rec.entry)) : readGame(rec)) };
}

// ---------- header readers ----------
function wavInfo(buf) {
  if (buf.length < 12) return { ok: false, kind: 'short', plain: D.t('wav.short') };
  const m4 = buf.toString('latin1', 0, 4);
  if (m4 === 'OggS') return { ok: false, kind: 'ogg', plain: D.t('wav.ogg') };
  if (m4 === 'ID3\u0003' || m4.slice(0, 3) === 'ID3' || (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0)) return { ok: false, kind: 'mp3', plain: D.t('wav.mp3') };
  if (m4 === 'fLaC') return { ok: false, kind: 'flac', plain: D.t('wav.flac') };
  if (m4 !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') return { ok: false, kind: 'notwav', plain: D.t('wav.notwav') };
  let o = 12, fmt = null, dataBytes = 0;
  while (o + 8 <= buf.length) {
    const id = buf.toString('latin1', o, o + 4), sz = buf.readUInt32LE(o + 4);
    if (id === 'fmt ' && o + 8 + 16 <= buf.length) fmt = { tag: buf.readUInt16LE(o + 8), ch: buf.readUInt16LE(o + 10), rate: buf.readUInt32LE(o + 12), align: buf.readUInt16LE(o + 20), bits: buf.readUInt16LE(o + 22) };
    if (id === 'data') { dataBytes = sz; break; }
    o += 8 + sz + (sz & 1);
  }
  if (!fmt) return { ok: false, kind: 'nofmt', plain: D.t('wav.nofmt') };
  const names = { 1: 'PCM', 0x11: 'IMA ADPCM', 2: 'MS ADPCM', 3: 'float', 0x55: 'MP3', 0xFFFE: 'extensible' };
  const codec = names[fmt.tag] || ('tag 0x' + fmt.tag.toString(16));
  const bps = fmt.tag === 1 ? fmt.rate * fmt.ch * fmt.bits / 8 : 0;
  const secs = bps ? Math.round(dataBytes / bps * 100) / 100 : null;
  const warn = [];
  if (fmt.tag !== 1 && fmt.tag !== 0x11) warn.push(D.t('wav.codec', { c: codec }));
  if (fmt.tag === 1 && fmt.bits !== 16) warn.push(D.t('wav.bits', { b: fmt.bits }));
  if (fmt.ch !== 1) warn.push(D.t('wav.stereo'));
  if (fmt.rate !== 44100 && fmt.rate !== 22050) warn.push(D.t('wav.rate', { r: fmt.rate }));
  return { ok: !warn.length, kind: 'wav', codec, channels: fmt.ch, rate: fmt.rate, bits: fmt.bits, seconds: secs, warn, plain: warn.length ? warn.join(' ') : D.t('wav.good', { c: codec, r: fmt.rate }) };
}
function imgInfo(buf, ext) {
  try {
    if (ext === '.dds' && buf.toString('latin1', 0, 4) === 'DDS ') {
      const h = buf.readUInt32LE(12), w = buf.readUInt32LE(16), mips = buf.readUInt32LE(28), pf = buf.readUInt32LE(80), cc = buf.toString('latin1', 84, 88);
      const dx10 = pf & 4 && cc === 'DX10', ati2 = cc === 'ATI2' || cc === 'BC5U';
      return { w, h, mips, format: (pf & 4) ? cc : 'raw', warn: [dx10 ? D.t('img.dx10') : '', ati2 ? D.t('img.ati2') : '', (w & 3) || (h & 3) ? D.t('img.mult4') : ''].filter(Boolean) };
    }
    if (ext === '.tga' && buf.length >= 18) return { w: buf.readUInt16LE(12), h: buf.readUInt16LE(14), bpp: buf[16], warn: [] };
    if (ext === '.png' && buf.length >= 24 && buf.readUInt32BE(0) === 0x89504E47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), warn: [] };
  } catch (e) { /* unreadable */ }
  return null;
}

// ---------- unit: which files does it use ----------
const IMG = ['.dds', '.tga', '.png', '.jpg', '.bmp'];
function strings(buf, re) { const s = buf.toString('latin1').replace(/[^\x20-\x7e\t\r\n]/g, '\n'); const out = new Set(); let m; while ((m = re.exec(s))) out.add(m[1]); return [...out]; }
function findUnit(V, name) {
  const n = lc(name).replace(/\.def$/, '');
  const hits = []; for (const k of V.keys()) if (k.startsWith('resource/entity/') && k.endsWith('/' + n + '.def')) hits.push(k);
  hits.sort((a, b) => (V.m.has(b) ? 1 : 0) - (V.m.has(a) ? 1 : 0));
  return hits;
}
function suggest(V, name) {
  const n = lc(name), out = [];
  for (const k of V.keys()) if (k.startsWith('resource/entity/') && k.endsWith('.def') && stemOf(k).includes(n) && !/\/x\//.test(k)) { out.push(stemOf(k)); if (out.length >= 15) break; }
  return [...new Set(out)];
}
function unitFiles(gamedir, mod, name) {
  if (!/^[\w().\- ]{1,80}$/.test(name || '')) throw bad('Type the unit name, for example pz6bh (the name of its .def file).');
  const V = view(gamedir, mod ? modDir(mod, gamedir, false) : null);
  const defs = findUnit(V, name);
  if (!defs.length) return { unit: name, found: false, suggestions: suggest(V, name) };
  const def = defs[0], dir = dirOf(def), seen = new Map(), order = [];
  const imgByBase = new Map();
  // GoH: a skin variant may swap the mesh too, <mesh>#<variant>.ply next to <mesh>.ply (GHFMT-10 [V]; in AS2 such files are dead)
  const goh = isGohG(gamedir), plyByBase = new Map();
  const imgs = []; for (const k of V.keys()) { const e = extOf(k); if (IMG.includes(e)) { imgs.push(k); const b = stemOf(k).split('#')[0]; if (!imgByBase.has(b)) imgByBase.set(b, []); imgByBase.get(b).push(k); } else if (goh && e === '.ply' && stemOf(k).includes('#')) { const b = stemOf(k).split('#')[0]; if (!plyByBase.has(b)) plyByBase.set(b, []); plyByBase.get(b).push(k); } }
  const add = (k, role) => { if (!k || seen.has(k) || order.length > 600) return false; const r = V.get(k); if (!r) return false; seen.set(k, role); order.push(k); return true; };
  // GoH: a def names its model up a folder, {extension "../churchill_mk3/churchill_mk3_l50.mdl"} [V vanilla GoH defs 2026-11-14]: the
  // ".." is folded there (AS2 candidates stay exactly as before)
  const fold = k => { if (!goh || !k.includes('..')) return k; const o = []; for (const s of k.split('/')) { if (s === '..') o.pop(); else if (s && s !== '.') o.push(s); } return o.join('/'); };
  const cand = (ref, base) => { const r = lc(fwd(ref)).replace(/^\/+/, '').replace(/^\$\//, ''); return [base + '/' + r, 'resource/entity/' + r, 'resource/' + r].map(fold); };
  const resolve = (ref, base) => cand(ref, base).find(k => V.has(k)) || null;
  add(def, 'def');
  const defText = V.readAny(V.get(def)).toString('latin1');
  const mdls = new Set(); let m; const re = /"([^"\\]+\.mdl)"/gi;
  while ((m = re.exec(defText))) { const k = resolve(m[1], dir); if (k) mdls.add(k); }
  if (!mdls.size) { const k = dir + '/' + stemOf(def) + '.mdl'; if (V.has(k)) mdls.add(k); }
  const plys = new Set(), mtls = new Set();
  for (const mk of mdls) {
    add(mk, 'model');
    const mt = V.readAny(V.get(mk)); const base = dirOf(mk);
    for (const ref of strings(mt, /"([^"\n]+\.(?:ply|vol|anm|mtl))"/gi)) {
      const k = resolve(ref, base); if (!k) continue; const e = extOf(k);
      if (e === '.ply') { plys.add(k); add(k, 'mesh'); } else if (e === '.vol') add(k, 'vol'); else if (e === '.anm') add(k, 'anim'); else { mtls.add(k); add(k, 'material'); }
    }
  }
  const meshVariants = {};
  for (const pk of goh ? [...plys] : []) for (const k of plyByBase.get(stemOf(pk)) || []) if (dirOf(k) === dirOf(pk) && add(k, 'variant')) (meshVariants[pk] = meshVariants[pk] || []).push(stemOf(k).split('#')[1]);
  for (const pk of plys) {
    let b; try { b = V.readAny(V.get(pk)); } catch (e) { continue; }
    for (const ref of strings(b, /([\w$#()./\\-]+\.mtl)/gi)) { const k = resolve(ref, dirOf(pk)); if (k && !mtls.has(k)) { mtls.add(k); add(k, 'material'); } }
  }
  const texKeys = new Set();
  for (const mk of mtls) {
    let t; try { t = V.readAny(V.get(mk)).toString('latin1'); } catch (e) { continue; }
    const rx = /\{\s*(?:diffuse\d?|bump|specular|mask|envmap|lightmap|glow|height)\s+"([^"]+)"/gi;
    while ((m = rx.exec(t))) {
      const ref = lc(m[1]).replace(/^\$\//, '').replace(/^\/+/, ''), tail = ref.split('/').pop();
      let found = null;
      // GoH: "$/model/x" sits under resource/texture/common/ [V GoH data 2026-11-23: panzer4d material.mtl -> texture/common/model/
      // panzerivd.dds], and the base picture (no #) is the texture, not its first variant (else the diffuse was lost)
      for (const base of [dirOf(mk), 'resource/texture', 'resource'].concat(goh ? ['resource/texture/common'] : [])) for (const e of IMG) { const k = base + '/' + ref + e; if (!found && V.has(k)) found = k; }
      if (!found) { const list = (imgByBase.get(tail) || []).filter(k => stemOf(k).split('#')[0] === tail && (k.indexOf('/' + ref + '.') >= 0 || k.indexOf('/' + ref + '#') >= 0)); if (list.length) found = (goh && list.find(k => !stemOf(k).includes('#'))) || list[0]; }
      if (found) texKeys.add(goh ? found.replace(/\.[a-z0-9]+$/, '').replace(/#[^/]*$/, '') : found.replace(/\.[a-z0-9]+$/, ''));
    }
  }
  const variants = {};
  for (const tk of texKeys) {
    const stem = stemOf(tk), d = dirOf(tk);
    for (const k of imgByBase.get(stem) || []) { if (dirOf(k) !== d) continue; const isVar = stemOf(k).includes('#'); add(k, isVar ? 'variant' : 'texture'); if (isVar) (variants[tk] = variants[tk] || []).push(stemOf(k).split('#')[1]); }
  }
  // icons: unit_icon/<name>_NN, unit_icon_small/<name>_NN, also name(nation)_NN
  const nm = lc(name).replace(/\.def$/, '');
  for (const f of ['unit_icon', 'unit_icon_small']) for (let i = 0; i < 4; i++) for (const e of ['.tga', '.dds', '.png']) add('resource/interface/scene/' + f + '/' + nm + '_0' + i + e, 'icon');
  const files = order.map(k => { const r = V.get(k); return { key: k, role: seen.get(k), ext: extOf(k), size: r.size == null ? null : r.size, inMod: V.m.has(k), inGame: V.g.has(k) }; });
  const roles = ['def', 'model', 'mesh', 'material', 'texture', 'variant', 'vol', 'anim', 'icon'];
  const out = { unit: nm, found: true, def, otherDefs: defs.slice(1, 6), hasMod: !!mod, groups: roles.map(r => ({ role: r, files: files.filter(f => f.role === r) })).filter(g => g.files.length), total: files.length, variants };
  if (goh) Object.assign(out, { game: 'goh', meshVariants });
  return out;
}

// ---------- copy into the mod ----------
function okKey(k) { return typeof k === 'string' && /^resource\/[\w\-+()#$ .,@!/]+$/i.test(k) && !k.includes('..') && !k.includes('//'); }
function copyPlan(gamedir, mod, keys, overwrite) {
  const mp = modDir(mod, gamedir, true);
  if (!Array.isArray(keys) || !keys.length) throw bad('Tick at least one file.');
  if (keys.length > 800) throw bad('Too many files at once (limit 800).');
  const v = game(gamedir), plan = [];
  for (const raw of keys) {
    if (!okKey(raw)) throw bad('Not a game file path: ' + String(raw).slice(0, 80));
    const k = lc(raw), rec = v.files.get(k), dest = path.join(mp, ...k.split('/'));
    if (!rec) { plan.push({ key: k, action: 'missing', note: D.t('copy.notingame') }); continue; }
    const exists = fs.existsSync(dest);
    plan.push({ key: k, size: rec.size, action: exists && !overwrite ? 'skip' : exists ? 'overwrite' : 'copy', dest });
  }
  return { mod: mp, plan, copy: plan.filter(x => x.action === 'copy' || x.action === 'overwrite').length, skip: plan.filter(x => x.action === 'skip').length, missing: plan.filter(x => x.action === 'missing').length };
}
function copyDo(gamedir, mod, keys, overwrite) {
  const p = copyPlan(gamedir, mod, keys, overwrite), v = game(gamedir), done = [];
  for (const x of p.plan) {
    if (x.action !== 'copy' && x.action !== 'overwrite') continue;
    const buf = readGame(v.files.get(x.key));
    fs.mkdirSync(path.dirname(x.dest), { recursive: true });
    fs.writeFileSync(x.dest, buf); done.push(x.key);
  }
  return Object.assign(p, { written: done.length, done });
}

// ---------- camo: TexMods in the unit def ----------
function texModsOf(text) {
  const i = text.search(/\{\s*TexMods\b/i); if (i < 0) return { has: false, pairs: [] };
  let depth = 0, j = i; for (; j < text.length; j++) { if (text[j] === '{') depth++; else if (text[j] === '}') { depth--; if (!depth) break; } }
  const body = text.slice(i, j + 1), pairs = []; let m; const re = /\{\s*"([^"]+)"\s+"([^"]+)"\s*\}/g;
  while ((m = re.exec(body))) pairs.push([m[1], m[2]]);
  return { has: true, start: i, end: j + 1, pairs };
}
function camoInfo(gamedir, mod, name) {
  const u = unitFiles(gamedir, mod, name);
  if (!u.found) return u;
  const V = view(gamedir, mod ? modDir(mod, gamedir, false) : null);
  const text = V.readAny(V.get(u.def)).toString('latin1'), tm = texModsOf(text);
  const inheritsOnly = !tm.has && /\(include\s+"[^"]+"/.test(text);
  const tex = u.groups.filter(g => g.role === 'texture').flatMap(g => g.files.map(f => f.key));
  const out = { unit: u.unit, found: true, def: u.def, defInMod: V.m.has(u.def), texmods: tm.pairs, hasBlock: tm.has, inheritsOnly, textures: tex.map(k => ({ key: k, variants: (u.variants[k.replace(/\.[a-z0-9]+$/, '')] || []) })) };
  // GoH: the same {TexMods {"option" "variant"}} block (GoH exe keyword TexMods in skeleton and entity serialize, 15 vanilla GoH defs
  // use it [V 2026-11-14]); a vehicle def may also fix one variant with {texmod "late"} (45 vanilla lines [V]); a variant may swap the
  // mesh (<mesh>#<variant>.ply, GHFMT-10) and its frames may come from config common_textures (GHVIS-42)
  if (isGohG(gamedir)) {
    const fixed = /^[ \t]*\{\s*texmod\s+"([^"]+)"/im.exec(text);
    Object.assign(out, { game: 'goh', texmod: fixed ? fixed[1] : null, meshes: Object.keys(u.meshVariants || {}).map(k => ({ key: k, variants: u.meshVariants[k] })) });
  }
  return out;
}
function camoPlan(gamedir, mod, name, option, variant) {
  if (!/^[\w \-.]{1,40}$/.test(option || '')) throw bad('The option name can use letters, numbers, spaces, dash and dot (for example Autumn).');
  if (!/^[\w\-.]{1,40}$/.test(variant || '')) throw bad('The variant name can use letters, numbers, dash and dot (the part after # in the file name).');
  const mp = modDir(mod, gamedir, true), V = view(gamedir, mp), u = unitFiles(gamedir, mp, name);
  if (!u.found) throw bad('Unit not found: ' + name);
  const rec = V.get(u.def); let text = V.readAny(rec).toString('latin1').replace(/\r?\n/g, '\n');
  const tm = texModsOf(text), line = '{"' + option + '" "' + variant + '"}';
  let out, how;
  if (tm.has) {
    const inner = text.slice(tm.start, tm.end);
    if (tm.pairs.some(p => p[0] === option && p[1] === variant)) { out = text; how = 'same'; }
    else { out = text.slice(0, tm.end - 1).replace(/\s*$/, '') + '\n\t\t' + line + '\n\t}' + text.slice(tm.end); how = 'add'; void inner; }
  } else {
    const ext = /(\{\s*Extension\s+"[^"]+"\s*\})/i.exec(text), blk = '\t{TexMods\n\t\t' + line + '\n\t}\n';
    if (ext) { const at = ext.index + ext[1].length; out = text.slice(0, at) + '\n' + blk + text.slice(at); }
    else { const last = text.lastIndexOf('}'); out = text.slice(0, last) + blk + text.slice(last); }
    how = 'new';
  }
  // GoH: a #variant mesh counts too (GHFMT-10), and the def folder holds only the def (meshes and pictures sit in the model's folder,
  // {extension "../<model>/<x>.mdl"}), so the folders of the unit's meshes and textures are looked in as well
  const goh = isGohG(gamedir), vext = goh ? IMG.concat('.ply') : IMG;
  const vdirs = new Set([dirOf(u.def)]);
  if (goh) for (const g of u.groups) if (g.role === 'mesh' || g.role === 'texture' || g.role === 'model') for (const f of g.files) vdirs.add(dirOf(f.key));
  const varFile = V.keys && [...V.keys()].some(k => dirOf(k).length && stemOf(k).includes('#' + variant) && vext.includes(extOf(k)) && vdirs.has(dirOf(k)));
  const res = { mod: mp, def: u.def, how, line, text: out.replace(/\n/g, '\r\n'), dest: path.join(mp, ...u.def.split('/')), variantFileFound: !!varFile };
  if (goh) res.game = 'goh';   // GoH: only animated variant frames may come from config common_textures (GHVIS-42); a missing variant file stays an error on the page
  return res;
}
function camoDo(gamedir, mod, name, option, variant) {
  const p = camoPlan(gamedir, mod, name, option, variant);
  if (p.how === 'same') return Object.assign(p, { written: false });
  fs.mkdirSync(path.dirname(p.dest), { recursive: true });
  fs.writeFileSync(p.dest, Buffer.from(p.text, 'latin1'));
  return Object.assign(p, { written: true });
}

// ---------- sound of a weapon ----------
function soundOf(gamedir, weapon) {
  const w = lc(weapon || '').trim(); if (!/^[\w().\-]{1,80}$/.test(w)) throw bad('Type a weapon name, for example mg34 or 88mm_flak41.');
  const V = view(gamedir, null), stuff = new Map();
  for (const k of V.keys()) if (k.startsWith('resource/set/stuff/')) { const s = lc(stemOf(k)); if (!stuff.has(s)) stuff.set(s, k); }
  const chain = [], values = []; let cur = w;
  for (let i = 0; i < 6 && cur; i++) {
    const k = stuff.get(cur); if (!k) break;
    const t = V.readAny(V.get(k)).toString('latin1'); chain.push(k);
    let m; const rx = /\{\s*(fireSound|reloadSound|\w*Sound)\s+"([^"]+)"/gi;
    while ((m = rx.exec(t))) values.push({ kind: m[1], name: m[2], from: k });
    const f = /\{\s*from\s+"([^"]+)"/i.exec(t); cur = f ? lc(f[1]) : null;
    if (values.length) break;
  }
  const sounds = []; for (const k of V.keys()) if (k.startsWith('resource/sound/') && k.endsWith('.wav')) sounds.push(k);
  const found = values.map(v => {
    const n = lc(v.name).replace(/[\/]+$/, ''), pre = /^reload/i.test(v.kind) ? 'weapon/reload/' : 'weapon/shot/';
    const tries = [n, pre + n].map(x => x.replace(/^\/+/, ''));
    const files = [];
    for (const t of tries) { const d = 'resource/sound/' + t; for (const s of sounds) if (s === d + '.wav' || s.startsWith(d + '/')) { files.push(s); if (files.length > 12) break; } if (files.length) break; }
    return Object.assign({}, v, { folder: files.length ? dirOf(files[0]).replace('resource/sound/', '') : null, files });
  });
  const like = []; for (const s of sounds) if (s.includes(w) && like.length < 15) like.push(s);
  return { weapon: w, stuffFiles: chain, sounds: found, similar: like, foundStuff: chain.length > 0 };
}

// ---------- icons ----------
const ICON_DIRS = [['unit_icon', 4], ['unit_icon_small', 4]];
function iconInfo(gamedir, mod, name) {
  if (!/^[\w().\- ]{1,80}$/.test(name || '')) throw bad('Type the unit name, for example pz6bh.');
  const n = lc(name), V = view(gamedir, mod ? modDir(mod, gamedir, false) : null), rows = [];
  for (const [d, frames] of ICON_DIRS) for (let i = 0; i < frames; i++) {
    const stem = 'resource/interface/scene/' + d + '/' + n + '_0' + i, ex = IMG.map(e => stem + e);
    const inMod = ex.find(k => V.m.has(k)), inGame = ex.find(k => V.g.has(k));
    let size = null; const k = inMod || inGame;
    if (k) { try { const b = V.readAny(V.get(k)); size = imgInfo(b, extOf(k)); } catch (e) { /* skip */ } }
    rows.push({ folder: d, frame: i, want: stem + '.tga', inMod: !!inMod, inGame: !!inGame, found: k || null, size: size ? size.w + 'x' + size.h : null, missingInMod: !!mod && !inMod });
  }
  const pk = 'resource/interface/scene/portrait/' + n, portrait = IMG.map(e => pk + e).find(k => V.has(k));
  return { unit: n, rows, portrait: portrait ? { key: portrait, inMod: V.m.has(portrait) } : null, anyInGame: rows.some(r => r.inGame) };
}
// picture kinds a PNG can become, under resource/interface/scene/. Fallback sizes for a name the game does not have, read from the
// vanilla files [V 2026-11-12, vfs + lib/model/tga over the AS2 install]: unit_icon 104x52 (3290 of 3298 .tga; 824 names x _00.._03),
// unit_icon_small 112x48 (3447 of 3482; 844 names x 4 frames, 29 x 3), portrait 97x135 (86 of 91, one file), squad 48x48 (405 of 432;
// 134 names x _00.._02), structure/<vehicle>/scheme.tga 97x140 (205 of 207). All 32-bit TGA type 2.
// frames: N = <name>_00.._0(N-1); 0 = <name>.tga; 'scheme' = structure/<name>/scheme.tga. A squad card (T(A) names such as
// tankman(eng)) on the buy menu is a unit_icon at 104x52, so kind icon covers it.
const PNG_KINDS = {
  icon: [['unit_icon', '104x52', 4], ['unit_icon_small', '112x48', 4]],
  portrait: [['portrait', '97x135', 0]],
  squad: [['squad', '48x48', 3]],
  scheme: [['structure', '97x140', 'scheme']],
};
// GoH fallback sizes, read from the vanilla GoH files [V 2026-11-14]: unit_icon 144x72
// (6748 of 6757 .tga), unit_icon_small 112x48 (6481 of 6523), portrait 128x164 (229 of 286), squad 48x48 (1206 of 1246). The GoH
// install ships no structure/<vehicle>/scheme.tga, but GoH still has a structure scheme loader, GetStructureDirectory and
// schemePath (gohweb stage B16 goh.json), so the place may well exist: kind scheme is held back as not checked yet (no size to copy),
// not as a game that lacks it [I]; reported open.
const PNG_KINDS_GOH = {
  icon: [['unit_icon', '144x72', 4], ['unit_icon_small', '112x48', 4]],
  portrait: [['portrait', '128x164', 0]],
  squad: [['squad', '48x48', 3]],
};
function pngPlan(gamedir, mod, name, kind, png) {
  const mp = modDir(mod, gamedir, true), goh = isGohG(gamedir), KINDS = goh ? PNG_KINDS_GOH : PNG_KINDS;
  if (!/^[\w().\- ]{1,80}$/.test(name || '')) throw bad('Type the icon name (usually the unit name).');
  if (goh && kind === 'scheme') throw bad('Not available in Gates of Hell yet: no vanilla GoH damage scheme picture to take the size from (not checked yet).');
  if (!Object.prototype.hasOwnProperty.call(KINDS, kind)) throw bad('Kind must be icon, portrait, squad or scheme.');
  if (!png || !/\.png$/i.test(png) || !fs.existsSync(png)) throw bad('Pick a .png file.');
  const n = lc(name), V = view(gamedir, null), targets = [];
  const base = 'resource/interface/scene/';
  for (const [d, fallback, frames] of KINDS[kind]) {
    const stems = frames === 'scheme' ? [base + d + '/' + n + '/scheme'] : frames ? Array.from({ length: frames }, (x, i) => base + d + '/' + n + '_0' + i) : [base + d + '/' + n];
    const gk = IMG.map(e => stems[0] + e).find(k => V.g.has(k)); let sz = null;
    if (gk) { try { const i = imgInfo(V.readAny(V.g.get(gk)), extOf(gk)); if (i && i.w && i.h) sz = i.w + 'x' + i.h; } catch (e) { /* unreadable: fallback */ } }
    for (const s of stems) targets.push({ key: s + '.tga', size: sz || fallback, guessed: !sz });
  }
  for (const t of targets) { t.dest = path.join(mp, ...t.key.split('/')); t.exists = fs.existsSync(t.dest); }
  return { mod: mp, targets, png };
}

// ---------- wav convert: any wav lib/wav decodes -> PCM16 or IMA ADPCM (vanilla 1024/2041 profile) in the mod ----------
const WAVFMT = { pcm16: 'pcm16', pcm: 'pcm16', ima: 'ima', 'ima-adpcm': 'ima', adpcm: 'ima' };
const WAV_RATES = [22050, 44100];          // the two rates vanilla sounds use (census sound.json wav.rate)
function realOr(p) { try { return fs.realpathSync.native(p); } catch (e) { return path.resolve(p); } }
function under(p, root) { const a = lc(fwd(p)).replace(/\/+$/, ''), b = lc(fwd(root)).replace(/\/+$/, ''); return a === b || a.startsWith(b + '/'); }
// linear interpolation, no low-pass first: a lower rate may alias a little on bright sounds [I]
function resample(dec, rate) {
  const ch = dec.channels, n = dec.frames, m = Math.max(1, Math.round(n * rate / dec.rate)), out = new Int16Array(m * ch), k = dec.rate / rate;
  for (let i = 0; i < m; i++) {
    const x = i * k, j = Math.min(n - 1, Math.floor(x)), f = x - j, j2 = Math.min(n - 1, j + 1);
    for (let c = 0; c < ch; c++) out[i * ch + c] = Math.round(dec.pcm[j * ch + c] * (1 - f) + dec.pcm[j2 * ch + c] * f);
  }
  return { rate, channels: ch, frames: m, pcm: out };
}
// o = { src, out, format: 'pcm16'|'ima', rate?, overwrite?, plan? }. src: relative = inside the mod; absolute = inside the mod or tmpRoot.
function wavConvert(gamedir, mod, o, tmpRoot) {
  o = o || {};
  const mp = modDir(mod, gamedir, true), W = require('../../../lib/wav');
  const format = WAVFMT[lc(o.format || '')];
  if (!format) throw bad('Pick the new format: IMA ADPCM (like most game sounds) or 16-bit PCM.');
  const rate = o.rate == null || o.rate === '' || o.rate === 'keep' ? null : Number(o.rate);
  if (rate !== null && !WAV_RATES.includes(rate)) throw bad('The sample rate can stay as it is, or be 44100 or 22050 Hz (the rates game sounds use).');
  const s = typeof o.src === 'string' ? o.src.trim() : '';
  if (!s || !/\.wav$/i.test(s)) throw bad('Pick the sound to convert (a .wav file inside your mod).');
  const srcAbs = path.isAbsolute(s) ? path.resolve(s) : path.resolve(mp, s);
  const roots = [realOr(mp)].concat(tmpRoot ? [realOr(tmpRoot)] : []);
  if (!fs.existsSync(srcAbs) || !fs.statSync(srcAbs).isFile()) {
    if (!roots.some(r => under(path.resolve(srcAbs), r))) throw bad('Refused: the sound to convert must be inside your mod folder (or a file you added through this program).', 403);
    throw bad('That sound file does not exist: ' + s);
  }
  const src = realOr(srcAbs);
  if (!roots.some(r => under(src, r))) throw bad('Refused: the sound to convert must be inside your mod folder (or a file you added through this program).', 403);
  if (fs.statSync(src).size > 60e6) throw bad('That file is larger than 60 MB.');
  const key = lc(fwd(typeof o.out === 'string' ? o.out.trim() : '')).replace(/^\/+/, '');
  if (!key) throw bad('Type where the new sound goes in your mod, for example resource/sound/weapon/shot/mygun/1.wav.');
  if (!okKey(key) || !/^resource\/sound\/.+\.wav$/.test(key)) throw bad('The new sound must go under resource/sound/ in your mod and end in .wav: ' + key.slice(0, 120));
  const dest = path.join(mp, ...key.split('/'));
  if (!under(path.resolve(dest), path.resolve(mp))) throw bad('Refused: that place is outside your mod folder.', 403);
  const buf = fs.readFileSync(src), info = wavInfo(buf);
  const dec = W.decode(buf);
  if (!dec.ok) throw bad('This sound cannot be read, so it cannot be converted. ' + (info.kind !== 'wav' ? info.plain : 'Reason: ' + dec.error + '.') + ' Convert it with the ffmpeg recipe instead.', 422);
  if (!dec.frames) throw bad('This sound has no samples in it: nothing to convert.', 422);
  const use = rate && rate !== dec.rate ? resample(dec, rate) : dec;
  const outBuf = format === 'ima' ? W.encodeImaAdpcm(use) : W.encodePcm16(use);
  const after = wavInfo(outBuf), exists = fs.existsSync(dest), same = exists && lc(realOr(dest)) === lc(src);
  const res = {
    mod: mp, src, key, dest, plan: !!o.plan, action: exists ? 'replace' : 'write', sameFile: same,
    from: { codec: info.codec || dec.codec, channels: dec.channels, rate: dec.rate, bits: info.bits, seconds: Math.round(dec.frames / dec.rate * 100) / 100, bytes: buf.length },
    to: { codec: after.codec, channels: use.channels, rate: use.rate, bits: after.bits, seconds: Math.round(use.frames / use.rate * 100) / 100, bytes: outBuf.length },
    check: after.plain, ok: after.ok, written: false,
  };
  if (o.plan) return res;
  if (exists && !o.overwrite) throw bad('A file is already there: ' + key + '. Tick "replace" to write over it.', 409);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + '.part'; fs.writeFileSync(tmp, outBuf); fs.renameSync(tmp, dest);
  res.written = true; return res;
}

// ---------- art check ----------
function strayImages(gamedir, mod) {
  const mp = modDir(mod, gamedir, false), mf = modFiles(mp).map, out = [], by = new Map();
  for (const k of mf.keys()) { const e = extOf(k); if (!IMG.includes(e) && e !== '.ebm' && e !== '.tex') continue; const s = k.slice(0, k.length - e.length); if (!by.has(s)) by.set(s, []); by.get(s).push(e); }
  let v = null; try { v = game(gamedir).files; } catch (e) { /* no game */ }
  for (const [s, es] of by) {
    const all = new Set(es); if (v) for (const e of [...IMG, '.ebm', '.tex']) if (v.has(s + e)) all.add(e);
    if (all.size > 1) { const order = ['.dds', '.tga', '.bmp', '.jpg', '.png']; const win = order.filter(e => all.has(e)).pop(); out.push({ stem: s, exts: [...all], winner: all.has('.tex') ? '.tex' : all.has('.ebm') ? '.ebm' : win, mine: es }); }
  }
  const imgs = [];
  for (const [k, r] of mf) { const e = extOf(k); if (e !== '.dds' && e !== '.tga' && e !== '.wav') continue; try { const b = fs.readFileSync(path.join(mp, r.entry)); if (e === '.wav') { const i = wavInfo(b); if (!i.ok) imgs.push({ key: k, kind: 'wav', plain: i.plain }); } else { const i = imgInfo(b, e); if (i) for (const w of i.warn) imgs.push({ key: k, kind: 'image', plain: w }); } } catch (e2) { /* skip */ } }
  return { stray: out, headers: imgs };
}

// ---------- asset list ----------
function assetList(gamedir, mod) {
  const mp = modDir(mod, gamedir, false), all = listMod(mp, 8000);
  const files = [], counts = {};
  for (const r of all) {
    const e = extOf(lc(r)) || '(none)', tag = D.TAGS[e] || 'other'; counts[e] = (counts[e] || 0) + 1;
    if (files.length >= 1500) continue;
    const full = path.join(mp, r); let size = 0, info = null;
    try { size = fs.statSync(full).size; if (e === '.wav' && size < 40e6) { const w = wavInfo(fs.readFileSync(full)); info = { text: w.kind === 'wav' ? w.codec + ' ' + w.channels + 'ch ' + w.rate + ' Hz' + (w.seconds ? ' ' + w.seconds + 's' : '') : w.plain, ok: w.ok }; } else if (['.dds', '.tga', '.png'].includes(e) && size < 80e6) { const fd = fs.openSync(full, 'r'), b = Buffer.alloc(128); fs.readSync(fd, b, 0, 128, 0); fs.closeSync(fd); const i = imgInfo(b, e); if (i) info = { text: i.w + 'x' + i.h + (i.format ? ' ' + i.format : '') + (i.mips ? ' mips ' + i.mips : ''), ok: !i.warn.length }; } } catch (e2) { /* skip */ }
    files.push({ rel: fwd(r), ext: e, size, tag, info });
  }
  return { mod: mp, total: all.length, shown: files.length, counts, files };
}

// ---------- names for the page's search boxes (searchKit index and Browse lists, owner 2026-11-19) ----------
// units: every entity .def of the game view (mod first), by name and entity folder; weapons: the set/stuff names; sounds: the mod's
// own sound files (paths inside the mod, as the WAV box takes them); pngs: the .png files in the mod folder (full paths). One read.
function names(gamedir, mod) {
  let mp = null; try { mp = mod ? modDir(mod, gamedir, false) : null; } catch (e) { mp = null; }
  const V = view(gamedir, mp), units = [], weapons = [], seenU = new Set(), seenW = new Set(), MAX = 40000;
  for (const k of V.keys()) {
    if (k.startsWith('resource/entity/') && k.endsWith('.def') && !/\/x\//.test(k)) {
      const n = stemOf(k); if (seenU.has(n) || units.length >= MAX) continue; seenU.add(n);
      units.push({ n, dir: k.slice(16, k.lastIndexOf('/')).split('/').slice(0, 2).join('/'), mod: V.m.has(k) });
    } else if (k.startsWith('resource/set/stuff/')) {
      const n = lc(stemOf(k)); if (seenW.has(n) || weapons.length >= MAX) continue; seenW.add(n);
      weapons.push({ n, dir: k.slice(19, k.lastIndexOf('/') + 1).replace(/\/$/, '') });
    }
  }
  const sounds = [], pngs = [];
  if (mp) {
    const all = listMod(mp, 40000);
    for (const r of all) { if (/\.(wav|ogg|mp3)$/i.test(r)) sounds.push(r); else if (/\.png$/i.test(r)) pngs.push(path.join(mp, r)); }
  }
  return { units, weapons, sounds: sounds.slice(0, 5000), pngs: pngs.slice(0, 5000), truncated: units.length >= MAX };
}

module.exports = { listMod, useScan, walk, names, game, gameOf, PNG_KINDS_GOH, modDir, modFiles, view, wavInfo, imgInfo, unitFiles, copyPlan, copyDo, camoInfo, camoPlan, camoDo, soundOf, iconInfo, pngPlan, PNG_KINDS, wavConvert, strayImages, assetList, texModsOf, bad, fwd, lc, extOf, stemOf, dirOf };
