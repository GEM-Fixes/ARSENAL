// previews (MV-PRV): the pictures a game loads as map previews, written into a mod the owner names (previews.md; design 10,
// 11). Every ability runs on as64, mowas2 (= as64: same install, same file forms) and goh (own targets, sizes and write rule).
//   VERSION                                1 (= cli.js version)
//   TARGETS                                frozen {as64:{mp, sp}, mowas2, goh} rows (targets.js)
//   targets(target, mapKey, doc?, o?)      rows of this map; minimap size filled when doc is given
//   guard(modDir, target, o)               null | {code, why}   (guard.js)
//   plan(src, doc, o) -> plan object (previews.md 9), sync. o = {mod, mode, targets:[id], source, marks, compose,
//     set:['t.k=v'], title, minimapSize, in:[dir], game, paint?, all?}. Throws MvError MV_USAGE (PRV_SET), MV_NOT_FOUND
//     (PRV_SOURCE_MISSING, PRV_MOD_MISSING, mode), MV_REFUSED (guard codes)
//   compose(src, doc, row, o) -> Promise<{w, h, rgba, notes}>   row 0 = top of the written file (compose.js)
//   stretch(box, size), safeArea(target, mapKind, size, frame, points), commit(modDir, plan, pictures, o), undo(modDir, o),
//   check(src, doc, o)
//   winners(src, doc, plan) -> fn(row) -> {file, mount, ours}   the name the game loads after our write (picture.winner)
//   sizes                                  the exact size rules of the page size choice and of write --all (sizes.js)
//   paint() -> the paint module or null (not built or broken; a style source then reads 'not built')
// Plan JSON never holds a drive path: product files found in --in sit in plan.files_ (not enumerable).
// Author: Imperator_Aug (ARSENAL, ia-665b18ad)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const T = require('./targets'), G = require('./guard'), CP = require('./compose'), SA = require('./safearea');

const VERSION = 1;
const SOURCES = ['real', 'l0', 'l1', 'l2', 'l3', 'l4', 'topo', 'edshot', 'staff', 'painted', 'recon', 'sketch'];
const STYLES = ['staff', 'painted', 'recon', 'sketch'];
const MARKS = ['none', 'flags', 'full'];
const COMPOSE = ['stretch', 'crop', 'backdrop', 'band'];
const SET_KEYS = ['source', 'marks', 'compose', 'strong', 'danger'];
// notes that keep the plan at exit 0 (info); every other note or warning is a finding (exit 1)
const INFO = new Set(['PRV_NO_FILE_IN_GAME', 'PRV_SP_GOH_ONLY', 'PRV_STRONG_ON', 'PRV_DANGER_ON', 'PRV_SCALEBAR_OFF', 'PRV_SAFE_NO_POINTS', 'PRV_GOH_ROOT_PAK']);
const TEXT = {
  PRV_NOT_IN_STACK: 'The mod is not in the stack given; the plan treats it as mounted last.',
  PRV_MOD_PAK: 'The mod holds a .pak with this map folder; which file wins against the loose pictures is not known yet.',
  PRV_GOH_ROOT_PAK: 'The mod holds a resource.pak at its root; Gates of Hell does not mount it, so it cannot win over the loose pictures.',
  PRV_GOH_NO_MODINFO: 'The mod has no mod.info or an empty one; Gates of Hell skips such a folder.',
  PRV_GOH_MODINFO_VERSION: 'mod.info allows only game versions outside Gates of Hell 1.x ({f}) and has no develop tag; Gates of Hell skips the mod.',
  PRV_CROP_NO_ACTION: '{f}: the mode has no flags or spawns and the map has no camera or pather box, so crop shows the whole map (as stretch) with no inset.',
  PRV_SAFE_NO_POINTS: 'The mode has no flags or spawns, so the preview was not tested for parts the loading screen covers.',
  PRV_MARKS_NOT_BUILT: 'Marks were asked for, but the paint part that draws them is not built; the picture has no marks.',
  PRV_TITLE_GLYPHS: 'The title was not drawn: the game font lacks a letter of it, or it is too wide.',
  PRV_STRONG_ON: 'Strong points are drawn into {f}.',
  PRV_DANGER_ON: 'Danger layers are drawn into {f}.',
  PRV_HEADER_WIDE: 'The header stretches the map {r} times wider; compose band keeps the proportions.',
  PRV_BAND_OUT: 'Outside the header band: {f}.',
  PRV_FALLBACK_SOURCE: '{f}: the picture asked for cannot be made here (a style not built, or no map.ply for the realistic picture); the next best one is used, as the target row says.',
  PRV_STRONGER_FILE: 'A stronger file in this mod wins over {f}; --rename-stronger moves it into the backup folder.',
  PRV_STRONGER_OTHER: 'The game loads {f} from another mount instead of ours.',
  PRV_UNDO_CHANGED: 'A file changed since the write and was kept: {f}.',
};
// {code, text} of a note; f = the file or names the text is about (a code with no text gives "<f>: <code>")
function noteText(code, f) {
  const t = TEXT[code];
  if (!t) return f ? f + ': ' + code : code;
  return /\{[fr]\}/.test(t) ? t.replace('{f}', f || '').replace('{r}', f || '') : (f ? f + ': ' + t : t);
}
const sha16 = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
const MV = () => require('../mapviz');
const err = (code, msg, prv, more) => new (MV().MvError)(code, msg, Object.assign({ code: prv }, more || {}));

let PAINT;
function paint() {
  if (PAINT !== undefined) return PAINT;
  try { PAINT = require('../paint'); } catch (e) { PAINT = null; }
  if (PAINT && (typeof PAINT.picture !== 'function' || !PAINT.styles)) PAINT = null;
  return PAINT;
}
function styleStates(P) {
  const out = {};
  for (const s of STYLES) out[s] = 'not built';
  if (!P) return out;
  try { for (const r of P.styles.list()) if (out[r.id] !== undefined) out[r.id] = r.state; } catch (e) { /* broken: not built */ }
  return out;
}

function findIn(dirs, name) { for (const d of dirs || []) { const f = path.join(d, name); if (fs.existsSync(f)) return f; } return null; }

// source name -> {name, resolved, from:'in'|'draw'|'paint', state, file?, fallback?}
function resolveSource(name, o, hasPly, styles) {
  if (name === 'real') {
    for (const r of ['l4', 'l3', 'l2', 'l1']) { const f = findIn(o.in, 'pic.' + r + '.mvg'); if (f) return { name, resolved: 'pic.' + r, from: 'in', state: 'ok', file: f }; }
    // ruling: a map with no map.ply cannot be drawn by l1; the schematic l0 stands in, with PRV_FALLBACK_SOURCE
    return hasPly ? { name, resolved: 'pic.l1', from: 'draw', state: 'ok' } : { name, resolved: 'pic.l0', from: 'draw', state: 'ok', fallback: true };
  }
  if (STYLES.includes(name)) return { name, resolved: name, from: 'paint', state: styles[name] === 'built' ? 'ok' : 'not built' };
  const f = findIn(o.in, 'pic.' + name + '.mvg');
  if (f) return { name, resolved: 'pic.' + name, from: 'in', state: 'ok', file: f };
  if (name === 'l0') return { name, resolved: 'pic.l0', from: 'draw', state: 'ok' };
  if (name === 'l1' && hasPly) return { name, resolved: 'pic.l1', from: 'draw', state: 'ok' };
  return { name, resolved: 'pic.' + name, from: 'in', state: 'missing' };
}

function parseSet(list, rows) {
  const out = {};
  for (const s of list || []) {
    const m = /^([a-z_]+)\.([a-z]+)=(.+)$/.exec(String(s));
    if (!m) throw err('MV_USAGE', '--set wants <target>.<key>=<value>, got ' + s, 'PRV_SET');
    const [, t, k, v] = m, row = rows.find(r => r.id === t);
    if (!row) throw err('MV_USAGE', '--set: no target ' + t, 'PRV_SET');
    if (row.state === 'none') throw err('MV_USAGE', '--set: ' + t + ' is not a file this game reads (' + row.why + ')', 'PRV_SET');
    if (!SET_KEYS.includes(k)) throw err('MV_USAGE', '--set: key ' + k + ' is not one of ' + SET_KEYS.join(', '), 'PRV_SET');
    let val = v;
    if (k === 'source' && !SOURCES.includes(v)) throw err('MV_USAGE', '--set ' + t + '.source: ' + v + ' is not one of ' + SOURCES.join(', '), 'PRV_SET');
    if (k === 'marks' && !MARKS.includes(v)) throw err('MV_USAGE', '--set ' + t + '.marks: ' + v + ' is not one of ' + MARKS.join(', '), 'PRV_SET');
    if (k === 'compose' && !allowedCompose(t).includes(v)) throw err('MV_USAGE', '--set ' + t + '.compose: ' + v + ' is not allowed for ' + t + ' (' + allowedCompose(t).join(', ') + ')', 'PRV_SET');
    if (k === 'strong' || k === 'danger') { if (!/^[01]$/.test(v)) throw err('MV_USAGE', '--set ' + t + '.' + k + ' wants 0 or 1', 'PRV_SET'); val = v === '1'; }
    (out[t] = out[t] || {})[k] = val;
  }
  return out;
}
function allowedCompose(id) { return id === 'minimap' ? ['stretch'] : id === 'header' ? COMPOSE : ['stretch', 'crop', 'backdrop']; }

// ---------------------------------------------------------------- the name the game loads (picture.winner over the stack + mod)
const isGameLayer = l => l === 'base' || /^patch \d+$/.test(String(l)) || l === 'as64/core';
function modFiles(mod, mapKey) {
  try { return fs.readdirSync(path.join(mod, 'resource', 'map', ...mapKey.split('/'))).map(n => n.toLowerCase()); } catch (e) { return []; }
}
function nameState(src, mod, inStack, mapKey, file, withOurs) {
  const P = require('../../lib/model/picture');
  const dir = 'resource/map/' + mapKey + '/', stem = file.replace(/\.[^.]*$/, '').toLowerCase();
  const isStem = n => n.replace(/\.[^.]*$/, '') === stem;
  const stack = src.keys(dir).map(k => k.slice(dir.length)).filter(n => n.indexOf('/') < 0 && isStem(n));
  const own = modFiles(mod, mapKey).filter(isStem);
  const sib = Array.from(new Set(stack.concat(own, withOurs ? [file.toLowerCase()] : [])));
  if (!sib.length) return null;
  const w = P.winner(dir + sib[0], sib.map(n => dir + n));
  if (!w) return null;
  const name = w.slice(dir.length);
  const rec = src.rec(w);
  const recMount = r => (r.source === 'pak' || isGameLayer(r.layer) ? 'pak' : 'other-mod');
  let mount;
  if (own.includes(name) || (withOurs && name === file.toLowerCase())) {
    // ours, unless the mod is in the stack and a mount above it holds the same key
    mount = !inStack || !rec || rank(src, rec) <= rank(src, null, mod) ? 'mod' : recMount(rec);
  } else mount = rec ? recMount(rec) : 'mod';
  return { file: name, mount, inMod: own.includes(name) };
}
// mount rank: game layers -1, --mods by their order, then --mod-dir folders by theirs (vfs opts.modDirs on top)
function rank(src, rec, dir) {
  const dirs = (src.modDirs || []).map(d => G.key(d)), mods = (src.mods || []).map(m => String(m).split(':')[0].toLowerCase());
  const at = p => { const k = G.key(p); for (let i = dirs.length - 1; i >= 0; i--) if (k === dirs[i] || k.startsWith(dirs[i] + '/')) return mods.length + i; return null; };
  if (dir) { const r = at(dir); return r != null ? r : mods.indexOf(path.basename(dir).toLowerCase()); }
  if (isGameLayer(rec.layer)) return -1;
  const r = at(rec.container);
  if (r != null) return r;
  const i = mods.indexOf(String(rec.layer || '').replace(/ patch \d+$/, '').toLowerCase());
  return i >= 0 ? i : mods.length + dirs.length;
}

function winners(src, doc, plan, mod) {
  const inStack = plan.mod.inStack;
  return row => {
    const s = nameState(src, mod, inStack, doc.key, row.file, true);
    return s ? { file: s.file, mount: s.mount, ours: s.file === row.file.toLowerCase() && s.mount === 'mod' } : null;
  };
}

// ---------------------------------------------------------------- plan
function plan(src, doc, o) {
  o = o || {};
  const M = MV();
  const target = src.target, key = doc.key, kind = T.mapKind(key), mode = o.mode || null;
  if (mode && !(doc.modes || []).some(m => m.id === mode)) throw new M.MvError('MV_NOT_FOUND', 'map ' + key + ' has no mode ' + mode, { map: key, mode });
  if (!o.mod) throw err('MV_USAGE', '--mod <folder> is needed', 'PRV_MOD_MISSING');
  const g = G.guard(o.mod, target, { game: o.game || src.game });
  if (g) throw err(g.code === 'PRV_MOD_MISSING' ? 'MV_NOT_FOUND' : 'MV_REFUSED', g.why, g.code);
  const mod = path.resolve(o.mod);
  const rows = T.targets(target, key, doc, { minimapSize: o.minimapSize });
  const ids = rows.map(r => r.id);
  let chosen;
  if (o.targets && o.targets.length) {
    for (const t of o.targets) {
      const r = rows.find(x => x.id === t);
      if (!r) throw err('MV_USAGE', '--targets: no target ' + t + ' (' + ids.join(', ') + ')', 'PRV_SET');
      if (r.state === 'none') throw err('MV_USAGE', '--targets: ' + t + ' is not a file this game reads (' + r.why + ')', 'PRV_SET');
    }
    chosen = new Set(o.targets);
  } else chosen = new Set(rows.filter(r => r.state !== 'none').map(r => r.id));
  for (const [k, list] of [['source', SOURCES], ['marks', MARKS], ['compose', COMPOSE]]) {
    if (o[k] != null && !list.includes(o[k])) throw err('MV_USAGE', '--' + k + ' ' + o[k] + ' is not one of ' + list.join(', '), 'PRV_SET');
  }
  const sets = parseSet(o.set, rows);
  const P = o.paint !== undefined ? o.paint : paint();
  const styles = styleStates(P);
  const hasPly = src.has('resource/map/' + key + '/map.ply');
  const B = doc.boxes.world;
  const pts = CP.points(doc, mode);
  const files_ = {};
  const planNotes = [];
  const addNote = (code, f) => { if (!planNotes.some(n => n.code === code && n.f === f)) planNotes.push({ code, f }); };

  // mod facts
  const pl = G.place(mod, target, { game: o.game || src.game });
  const facts = G.modFacts(mod, key, target);
  const inStack = (src.modDirs || []).some(d => G.same(d, mod)) ||
    (pl.place === 'game-mods' && (src.mods || []).some(m => String(m).split(':')[0].toLowerCase() === path.basename(mod).toLowerCase()));
  if (!inStack) addNote('PRV_NOT_IN_STACK');
  if (facts.pak) addNote('PRV_MOD_PAK');
  if (facts.gohRootPak) addNote('PRV_GOH_ROOT_PAK');
  if (target === 'goh' && pl.place === 'game-mods' && !facts.modInfo) addNote('PRV_GOH_NO_MODINFO');
  if (target === 'goh' && facts.gohVersionOff) addNote('PRV_GOH_MODINFO_VERSION', facts.gohVersionOff);

  const out = [];
  for (const r of rows) {
    const id = r.id, st = r.state === 'none' ? 'none' : chosen.has(id) ? 'write' : 'off';
    const s = sets[id] || {};
    const defSource = id === 'minimap' && target === 'goh' ? 'sketch' : 'real';
    let sourceName = s.source || o.source || defSource;
    let compose = s.compose || (o.compose && allowedCompose(id).includes(o.compose) ? o.compose : 'stretch');
    const marks = s.marks || o.marks || (id === 'minimap' ? 'none' : 'flags');
    const strong = !!s.strong, danger = !!s.danger;
    const notes = [];
    let source = resolveSource(sourceName, o, hasPly, styles);
    // GoH minimap default sketch while the style is not built: real, PRV_FALLBACK_SOURCE (design 11)
    if (source.state !== 'ok' && id === 'minimap' && target === 'goh' && !s.source && !o.source) {
      source = resolveSource('real', o, hasPly, styles); source.name = 'sketch'; source.fallback = true;
    }
    if (source.fallback) { notes.push('PRV_FALLBACK_SOURCE'); }
    // o.all (write --all): a missing source does not stop the plan; that file is reported as failed by the write
    if (source.state === 'missing' && st === 'write') { if (!o.all) throw err('MV_NOT_FOUND', 'source picture ' + source.resolved + ' for ' + id + ' is not in --in', 'PRV_SOURCE_MISSING', { target: id, source: sourceName }); notes.push('PRV_SOURCE_MISSING'); }
    if (source.file) files_[id] = source.file;
    const row = { id, file: r.file, path: 'resource/map/' + key + '/' + r.file, state: st, why: r.why, tag: r.tag,
      size: r.size ? r.size.slice() : null, format: r.format, mips: r.mips, bytes: r.bytes,
      source: { name: source.name, resolved: source.resolved, from: source.from === 'paint' ? 'draw' : source.from, state: source.state },
      compose: r.state === 'none' ? null : compose, marks: r.state === 'none' ? null : marks, strong, danger,
      title: !!(o.title && id !== 'minimap' && r.state !== 'none'),
      frame: null, cropFrom: null, inset: null, stretch: null, existing: null, winner: null, warnings: [], notes };
    if (r.state === 'none') { row.source = null; out.push(row); continue; }
    const leftHalf = target === 'goh' && kind === 'sp' && id === 'preview' && compose === 'crop';
    let frame = B.slice(), act = null;
    if (compose === 'crop') {
      act = CP.actionOf(doc, mode);
      row.cropFrom = act.from;
      frame = CP.cropFrame(act.box, B, r.size, { leftHalf });
      if (!act.box) { notes.push('PRV_CROP_NO_ACTION'); addNote('PRV_CROP_NO_ACTION', r.file); }
    }
    if (compose === 'band') {
      const bf = CP.bandFrame(doc, mode, B);
      frame = bf.frame;
      for (const nm of bf.out) {
        const p = pts.find(q => q.name === nm);
        row.warnings.push({ code: 'PRV_BAND_OUT', what: p.what, name: p.name, at: [p.x, p.y], px: null });
      }
      if (bf.out.length) { notes.push('PRV_BAND_OUT'); addNote('PRV_BAND_OUT', bf.out.join(', ')); }
    }
    row.frame = frame.map(v => Math.round(v * 1e4) / 1e4);
    if (compose === 'crop' && act.box) {
      const px = pts.map(p => SA.toPx(frame, r.size, p.x, p.y).px);
      row.inset = { box: CP.insetRect(r.size, B, px).box };
    }
    row.stretch = compose === 'backdrop' ? CP.stretch(B, CP.backdropRect(r.size, B).slice(2)) : CP.stretch(frame, r.size);
    if (id === 'header' && row.stretch.ratio > 2 && compose === 'stretch') { notes.push('PRV_HEADER_WIDE'); addNote('PRV_HEADER_WIDE', String(row.stretch.ratio)); }
    if (!row.stretch.scaleBar && marks !== 'none') notes.push('PRV_SCALEBAR_OFF');
    if (strong) { notes.push('PRV_STRONG_ON'); addNote('PRV_STRONG_ON', r.file); }
    if (danger) { notes.push('PRV_DANGER_ON'); addNote('PRV_DANGER_ON', r.file); }
    if (source.fallback) addNote('PRV_FALLBACK_SOURCE', r.file);
    // safe area tests flag and spawn centres; a mode with none (SP maps) gets an info note instead of silence
    if (id === 'preview' && !pts.length) { notes.push('PRV_SAFE_NO_POINTS'); addNote('PRV_SAFE_NO_POINTS'); }
    if (id === 'preview') for (const w of SA.safeArea(target, kind, r.size, frame, pts.map(p => ({ what: p.what, name: p.name, x: p.x, y: p.y })))) {
      row.warnings.push(w); if (!notes.includes(w.code)) notes.push(w.code);
    }
    // existing: the file at our path in the mod, else the current winner of the name over the stack
    const own = path.join(mod, 'resource', 'map', ...key.split('/'), r.file);
    if (fs.existsSync(own)) {
      const buf = fs.readFileSync(own), ff = factsOf(r.format, buf);
      const bk = fs.existsSync(path.join(mod, '.mapviz-backup', 'resource', 'map', ...key.split('/'), r.file));
      row.existing = { mount: 'mod', file: r.file, size: ff, sha1: sha1(buf), backup: bk ? 'kept' : 'new' };
    } else {
      const cur = nameState(src, mod, inStack, key, r.file, false);
      let size = null;
      if (cur) { try { const b = cur.inMod ? fs.readFileSync(path.join(mod, 'resource', 'map', ...key.split('/'), cur.file)) : src.read('resource/map/' + key + '/' + cur.file); size = factsOf(cur.file.split('.').pop() === 'png' ? 'PNG' : 'DXT1', b, cur.file); } catch (e) { size = null; } }
      row.existing = { mount: cur ? cur.mount : null, file: cur ? cur.file : null, size, sha1: null, backup: null };
    }
    const w = nameState(src, mod, inStack, key, r.file, true);
    row.winner = { file: w.file, mount: w.mount, ours: w.file === r.file.toLowerCase() && w.mount === 'mod' };
    if (!row.winner.ours && st === 'write') {
      if (w.mount === 'mod') { notes.push('PRV_STRONGER_FILE'); addNote('PRV_STRONGER_FILE', r.file); files_['stronger:' + id] = 'resource/map/' + key + '/' + w.file; }
      else { notes.push('PRV_STRONGER_OTHER'); addNote('PRV_STRONGER_OTHER', w.file); }
    }
    out.push(row);
  }
  const files = out.filter(t => t.state === 'write').map(t => t.path);
  const backups = out.filter(t => t.state === 'write' && t.existing && t.existing.mount === 'mod' && t.existing.backup === 'new').map(t => '.mapviz-backup/' + t.path);
  const body = {
    v: 1, part: 'previews', version: VERSION, contract: M.CONTRACT, target, map: key, mode, kind,
    stack: { mods: (doc.stack && doc.stack.mods) || src.mods || [], hash: (doc.stack && doc.stack.hash) || src.stackHash || null },
    mod: { id: path.basename(mod), place: pl.place, inStack, modInfo: facts.modInfo, pak: facts.pak },
    world: B.slice(), worldM: [Math.round((B[2] - B[0]) / 20 * 100) / 100, Math.round((B[3] - B[1]) / 20 * 100) / 100],
    targets: out, files, backups,
    notes: planNotes.map(n => ({ code: n.code, text: (TEXT[n.code] || n.code).replace('{f}', n.f || '').replace('{r}', n.f || '') })),  };
  const hash = sha16(JSON.stringify(body));
  const p = Object.assign(body, { hash, made: new Date().toISOString() });
  Object.defineProperty(p, 'files_', { value: files_, enumerable: false });
  return p;
}
function factsOf(format, buf, name) {
  try {
    const P = require('../../lib/model/picture'), f = P.facts(format === 'PNG' ? 'png' : P.typeOf(name || 'x.dds') || 'dds', buf);
    return f.width ? [f.width, f.height] : null;
  } catch (e) { return null; }
}
// exit code of a plan: 1 when a warning or a note above info
function findings(p) {
  return p.notes.some(n => !INFO.has(n.code)) || p.targets.some(t => t.state === 'write' && (t.warnings.length || t.notes.some(c => !INFO.has(c))));
}

module.exports = {
  VERSION, TARGETS: T.TARGETS, SOURCES, STYLES, MARKS, COMPOSE, INFO, TEXT, noteText,
  targets: T.targets, guard: G.guard, plan, findings, winners, paint, allowedCompose,
  compose: (src, doc, row, o) => CP.compose(src, doc, row, o),
  stretch: CP.stretch,
  safeArea: SA.safeArea,
  commit: (m, p, pics, o) => require('./commit').commit(m, p, pics, o),
  undo: (m, o) => require('./commit').undo(m, o),
  check: (src, doc, o) => require('./check').check(src, doc, o),
  sizes: require('./sizes'),
};
