// soedit/modelindex: every model a modder can pick, over the game with a mod folder laid on top (loose files and its own paks,
// active in the game or not): the Models page search (POST /api/x/models/find) and folder listing (POST /api/x/models/folder).
//   build({ game, mods, modDir, exe }) -> { meta: { game, mod, sig, built, ms, counts, exe? }, rows: [row] }
//   buildAsync(o) -> Promise<the same>   walks the mod once first (lib/modtree), so the build itself stats no mod file, and reads
//     the loose .def and breed .set files ahead of the loop through the thread pool (lib/sdlset readAhead: 32 at a time, at most
//     64 MB held; o.readAhead: false = one by one as build does); the loop gets a turn every 200 files. Same rows, same order.
//     exe: the game's vfs exe ('as64' | 'mowas_2' (alias 'mowas2') | 'goh'); none = the vfs default, as before. MoW:AS2 shares the
//     AS2 install with AS64, so exe mowas_2 is what keeps the as64/core models out. meta.exe only when exe was given.
//   row = { target, name, kind, key, where, pak, model, title? }
//     title:  the in-game display name (the buy card's name, e.g. pz6e "PzKpfw VI Tiger"), only when the .lng texts hold one:
//             desc/entity/<name> for an entity, desc/human/<breed> for a breed. Read by statsheet/units.js lngNames, the same
//             reading the Units page catalogue uses (a mod's localization wins), about 70 ms for the game
//     target: what stage and the Models page routes take unchanged (target.js): the def key for an entity, breed:<key> for a breed,
//             the mdl key for a model no definition names, an absolute path for a file on disk, pak:<pak>!<entry> for a pak entry
//     kind:   vehicle | human | object | breed | model (see kindOf)    where: mod | game    pak: the pak's file name or ''
//   sig(game, modDir, mods, exe) -> string   cheap "what changed": the game's top folders (names, sizes, times; paks by size and time) and
//     every file of the mod folder (count, total size, newest time)
//   cacheFile(game, modDir, mods, exe) -> per-user cache path (lib/toolcache 'soedit'); exe mowas_2 / goh get their own file
//     (sig and cacheFile: no exe and exe as64 give the same answer as before)     load(file) -> index | null (also null when
//     the file was written by another ARSENAL release: lib/credit version, kept as meta.release)
//   sig, cacheFile and load serve the command line (soedit index / find), which walks the mod itself. The GUI keeps the list in
//   the shared store instead (gui README, CACHE contract 1; ext/models/sub/find.server.js) and never calls sig:
//     SECTION 'models.list', VERSION as the entry version, parts(game, modDir, exe) -> {game, mod, exe},
//     stamps(game, T, exe, modDir) -> {game (lib/gameview stamp), mod:<AREAS> (lib/modtree stamps of the tree T)}; no modDir = game only.
//     AREAS = what build reads of a mod: defs and models (entity), breeds (set), the texts for the display names (text, and
//     interface for a mod's resource/interface/text), its paks, and other: a .mdl may sit in any resource folder (RobZ keeps 1287
//     under resource/texture). Not read: map, properties, script.
//   build({.., sig}): a sig given by the caller is kept as meta.sig and no walk is made.
//   search(rows, q, { kind, limit, canon }) -> { total, results, didYouMean }   every word must be in the file name or game key,
//     or start a word of the display name (or sit inside it, from 4 letters on). Order: exact name, name start, exact display
//     name, a display-name word that starts with q, name holding q, display name holding q (canon(q) too when given, from 4
//     letters: a common-name folder such as the Units page's, "panzer iv" = "pzkpfw iv"), then the rest. A row the display
//     name found (not its file name) comes back as a copy with byTitle: true (the page shows "title (name)").
//   listFolder({ path, game, mods, modDir, max, exe }) -> { path, total, results, truncated }   a folder (recursive, paks met inside it
//     too), one .pak, or a folder inside a pak (<pak>!<folder>, entry names as written in the pak): .def with a model, .mdl no listed .def names, breed .set (a set/breed part in the path)
// Kind rule (from the data, AS2 + robz): a def under entity/humanskin/ = human; under entity/-vehicle/, or one that has a {Chassis}
//   block or includes a vehicle property file (/properties/tank, cannon*, armoredcar, car, marine, railway, airborne, moto, mortar)
//   = vehicle (emplaced guns too); every other def with a model = object (construction, landscape, flora, inventory, service, fx,
//   new_entity ...). A def's first word is not used: most vehicles are `game_entity`.
// Author: Imperator_Aug (ARSENAL, ia-8de0556b)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const names = require('../lib/names'), pak = require('../lib/pak');
const T = require('./target');

const VERSION = 3;   // 2: rows carry the display name (title). 3: a soldier's skin is found through includes and macro calls
const GAME_LAYER = l => l === 'base' || /^patch \d+$/.test(l) || l === 'as64/core';
const fwd = p => String(p).replace(/\\/g, '/');
const dirOf = k => k.slice(0, k.lastIndexOf('/') + 1);
const baseOf = k => k.slice(k.lastIndexOf('/') + 1);
const VEH_INC = /\(\s*include\s+"\/?properties\/(tank|tank_unarmed|cannon\w*|armoredcar|car|marine|railway|airborne|moto|mortar)\.(ext|inc)"/i;

function kindOf(key, buf, diskPath) {
  const k = (key + ' ' + fwd(diskPath || '')).toLowerCase();
  if (/(^|\/)entity\/humanskin\//.test(k)) return 'human';
  if (/(^|\/)entity\/-vehicle\//.test(k)) return 'vehicle';
  if (buf) { const s = buf.toString('latin1').replace(/;[^\n]*/g, ''); if (/\{\s*chassis\b/i.test(s) || VEH_INC.test(s)) return 'vehicle'; }
  return 'object';
}
const isBreedKey = k => /^resource\/set\/breed\/.+\.set$/.test(k);
const breedName = k => k.slice('resource/set/breed/'.length, -4);

// ---------- signature ----------
function statLine(p, n) { try { const s = fs.statSync(p); return n + ':' + (s.isDirectory() ? 'd' : s.size) + ':' + Math.round(s.mtimeMs); } catch (e) { return n + ':-'; } }
function listSig(dir) { let es = []; try { es = fs.readdirSync(dir).sort(); } catch (e) { return dir + ':-'; } return es.map(n => statLine(path.join(dir, n), n)).join('|'); }
function treeSig(root) {
  if (!root) return 'none';
  let n = 0, t = 0, s = 0;
  (function walk(d, depth) {
    if (depth > 16) return;
    let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of es) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== '.arsenal' && e.name !== '.git' && e.name !== '.svn') walk(p, depth + 1); }
      else { try { const st = fs.statSync(p); n++; s += st.size; t = Math.max(t, st.mtimeMs); } catch (x) { /* gone */ } }
    }
  })(root, 0);
  return n + '-' + s + '-' + Math.round(t);
}
const exeTag = exe => { const e = exe === 'mowas2' ? 'mowas_2' : exe; return e && e !== 'as64' ? e : ''; };
function sig(game, modDir, mods, exe) {
  const parts = [VERSION, game ? fwd(path.resolve(game)).toLowerCase() : '-', listSig(game), listSig(path.join(game || '', 'resource')),
    listSig(path.join(game || '', 'resource', 'entity')), listSig(path.join(game || '', 'as64', 'core')), (mods || []).join(','),
    modDir ? fwd(path.resolve(modDir)).toLowerCase() : '-', treeSig(modDir)].concat(exeTag(exe) ? ['exe ' + exeTag(exe)] : []);
  return crypto.createHash('md5').update(parts.join('\n')).digest('hex');
}
function cacheFile(game, modDir, mods, exe) {
  const h = crypto.createHash('md5').update((game ? fwd(path.resolve(game)).toLowerCase() : '-') + '|' + (modDir ? fwd(path.resolve(modDir)).toLowerCase() : '-') + '|' + (mods || []).join(',') + (exeTag(exe) ? '|' + exeTag(exe) : '')).digest('hex').slice(0, 12);
  return require('../lib/toolcache').file('soedit', 'models-' + h + '.json');
}
const release = () => { try { return String(require('../lib/credit').version()); } catch (e) { return ''; } };
function load(file) {
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return j && j.meta && j.meta.version === VERSION && j.meta.release === release() && Array.isArray(j.rows) ? j : null; } catch (e) { return null; }
}
// the GUI's store entry (see the header)
const SECTION = 'models.list', AREAS = ['entity', 'set', 'interface', 'text', 'pak', 'other'];
const parts = (game, modDir, exe) => ({ game: game ? path.resolve(game) : '', mod: modDir ? path.resolve(modDir) : '', exe: exeTag(exe) });
function stamps(game, T, exe, modDir) {
  return Object.assign({ game: require('../lib/gameview').stamp({ gameDir: game, exe: exeTag(exe) || undefined }) }, modDir ? require('../lib/modtree').stamps(T, AREAS) : {});
}

// ---------- build ----------
function originOf(src, key) {
  const r = src.v && src.v.files.get(key);
  if (!r) return { where: 'mod', pak: '' };
  return { where: GAME_LAYER(r.layer) ? 'game' : 'mod', pak: r.source === 'pak' ? path.posix.basename(r.container) : '' };
}
function build(o) { const it = build1(o, null); let r; while (!(r = it.next()).done); return r.value; }
// A = null (build: no yield at all) | { ra } (buildAsync: a yield is a promise it awaits; ra = a readAhead or null)
function* build1(o, A) {
  const t0 = Date.now(), sg = o.sig || sig(o.game, o.modDir, o.mods, o.exe);   // taken first: a change during the build makes the next check rebuild
  const S = require('./stage');
  const src = S.openSource({ game: o.game, mods: o.mods || [], modDirs: o.modDir ? [o.modDir] : [], noInfer: true, exe: o.exe });
  try {
    const keys = [...src.allKeys()], has = k => src.has(k);
    const resolveModel = require('../entityindex/index').resolveModel;
    const rows = [], used = new Set(), skinDef = new Map();   // entity name -> def row (humanskin first)
    // buildAsync: the loose files the two reading loops will ask for, in their order, are read ahead (ra); read(key) takes the
    // bytes from it when it has them, else reads as before (a pak entry, a file that failed or is gone: the same throw, the same skip)
    const ra = A && A.ra, isDef = key => key.startsWith('resource/entity/') && key.endsWith('.def');
    if (ra) for (const want of [isDef, isBreedKey]) for (const key of keys) {
      if (!want(key)) continue;
      const r = src.v && src.v.files.get(key);
      if (r && r.source === 'loose') ra.add(key, path.join(r.container, r.entry));
    }
    const read = key => { try { const b = ra ? ra.take(key) : undefined; return b !== undefined ? b : src.get(key).buf; } finally { if (ra) ra.drop(key); } };
    let turns = 0;
    function* ready(key) { if (!A) return; const w = ra && ra.wait(key); if (w) yield w; else if (++turns % 200 === 0) yield new Promise(r => setImmediate(r)); }
    for (const key of keys) {
      if (!isDef(key)) continue;
      yield* ready(key);
      let buf; try { buf = read(key); } catch (e) { continue; }
      const ext = T.extensionOf(buf), model = ext ? resolveModel(has, key, ext) : null;
      if (!model || !model.endsWith('.mdl')) continue;
      used.add(model);
      const name = baseOf(key).slice(0, -4);
      const row = Object.assign({ target: key, name, kind: kindOf(key, buf), key }, originOf(src, key), { model });
      rows.push(row);
      const prev = skinDef.get(name);
      if (!prev || (row.kind === 'human' && prev.kind !== 'human')) skinDef.set(name, row);
    }
    for (const key of keys) {
      if (!isBreedKey(key)) continue;
      yield* ready(key);
      let buf; try { buf = read(key); } catch (e) { continue; }
      const skin = T.skinOfKey(buf, key, T.bufOf(src)), d = skin ? skinDef.get(names.normalize(skin)) : null;
      rows.push(Object.assign({ target: 'breed:' + breedName(key), name: breedName(key), kind: 'breed', key }, originOf(src, key), { model: d ? d.model : '' }));
    }
    for (const key of keys) {
      if (!key.endsWith('.mdl') || used.has(key)) continue;
      rows.push(Object.assign({ target: key, name: baseOf(key).slice(0, -4), kind: 'model', key }, originOf(src, key), { model: key }));
    }
    // display names from the .lng texts (statsheet/units.js lngNames reads src through the L shape it takes)
    let lng = null;
    try {
      lng = require('../statsheet/units').lngNames({ src: { v: src.v, get: k => { const g = src.get(k); return g ? g.buf : null; } }, modFile: k => originOf(src, k).where === 'mod' });
    } catch (e) { lng = null; }
    if (lng && lng.size) for (const r of rows) {
      const t = lng.get(r.kind === 'breed' ? 'desc/human/' + r.name.toLowerCase() : r.kind === 'model' ? '' : 'desc/entity/' + r.name.toLowerCase());
      if (t && t.text) r.title = t.text;
    }
    const counts = {}; for (const r of rows) counts[r.kind] = (counts[r.kind] || 0) + 1;
    return { meta: { version: VERSION, release: release(), game: o.game ? fwd(path.resolve(o.game)) : null, mod: o.modDir ? fwd(path.resolve(o.modDir)) : null, mods: o.mods || [],
      sig: sg, built: new Date().toISOString(), ms: Date.now() - t0, counts, ...(o.exe ? { exe: src.v ? src.v.exe : o.exe } : {}) }, rows };
  } finally { src.close(); }
}

// build after one walk of the mod folder by this process (lib/modtree ensure: files are stat'ed through the thread pool, off the
// loop), so stage.openSource lays the mod on from that walk and the shared game view instead of a blocking stat of every file.
// The same index as build(o). For a caller that can await (a command line run has no walk of its own; the GUI server has one).
async function buildAsync(o) {
  if (o && o.modDir) { try { await require('../lib/modtree').ensure(o.modDir); } catch (e) { /* no walk: build reads the folder itself */ } }
  const ra = o && o.readAhead === false ? null : require('../lib/sdlset').readAhead();
  try { const it = build1(o, { ra }); let r; while (!(r = it.next()).done) if (r.value) await r.value; return r.value; } finally { if (ra) ra.close(); }
}

// ---------- search ----------
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
const KINDS = ['all', 'vehicle', 'human', 'object', 'breed', 'model'];
// the folded form (o.canon) of a display name, cut at its words: a folded query matches only from the start of a word, so
// "kv-1" (kvi) does not match "Mk.VI" (mkvi) and "IS-2" (isii) does not match "ZiS-2" (zisii). A query that ends in a number
// must also end where a word ends: "IS-2" (isii) is not "IS-3" (isiii). Cached per canon function and title
const CSUF = new WeakMap(), TOK = /[^\p{L}\p{N}]+/u, NUMW = /^(\d+|[ivx]+)$/;
function canonParts(canon, t) {
  let m = CSUF.get(canon); if (!m) CSUF.set(canon, m = new Map());
  let s = m.get(t);
  if (!s) {
    const w = t.split(TOK).filter(Boolean);
    s = { whole: String(canon(t) || ''), starts: [], spans: new Set() };   // starts: from word i to the end; spans: from word i to word j
    for (let i = 0; i < w.length; i++) {
      const c = String(canon(w.slice(i).join(' ')) || ''); if (c && !s.starts.includes(c)) s.starts.push(c);
      for (let j = i + 1; j <= w.length; j++) { const p = String(canon(w.slice(i, j).join(' ')) || ''); if (p) s.spans.add(p); }
    }
    m.set(t, s);
  }
  return s;
}
// the query's words in a row inside a display name, the last one as a word start: "ausf h" in "PzKpfw IV Ausf.H";
// whole when the query ends in a number (end): "kv 1" is not "KV-122" or "KV-1S"
function phraseIn(tt, qt, end) {
  const k = qt.length - 1;
  for (let i = 0; i + k < tt.length; i++) {
    let j = 0; while (j < k && tt[i + j] === qt[j]) j++;
    if (j === k && (end ? tt[i + k] === qt[k] : tt[i + k].startsWith(qt[k]))) return true;
  }
  return false;
}
// letters for the 4-letter rules: a CJK character counts as 2 ("虎式" is a whole name in a Chinese game's titles)
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const wlen = s => { let n = 0; for (const ch of s) n += CJK.test(ch) ? 2 : 1; return n; };
// s has a word end at i (the end of s, or a mark or space there)
const WCH = /[\p{L}\p{N}]/u, endsAt = (s, i) => i >= s.length || !WCH.test(s[i]);
// w inside t; with end, only where a word ends after it
function ownHas(own, w, end) {
  if (!end || !/\d$/.test(w)) return own.includes(w);
  for (let i = own.indexOf(w); i >= 0; i = own.indexOf(w, i + 1)) if (!/\d/.test(own[i + w.length] || '')) return true;
  return false;
}
function holds(t, w, end) {
  if (!end) return t.includes(w);
  for (let i = t.indexOf(w); i >= 0; i = t.indexOf(w, i + 1)) if (endsAt(t, i + w.length)) return true;
  return false;
}
function search(rows, q0, o = {}) {
  const kind = KINDS.includes(o.kind) ? o.kind : 'all', limit = Math.max(1, Math.min(200, Number(o.limit) || 40));
  const q = String(q0 || '').trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean), qt = q.split(TOK).filter(Boolean);
  const pool = kind === 'all' ? rows : rows.filter(r => r.kind === kind);
  // a display name is matched by word starts, and inside words from 4 letters on: "ger" is an army in file names, not "Tiger".
  // The folded query is dropped under 4 letters: "ausf h" folds to "h", which would match nearly every display name
  const hit = [], c0 = o.canon && q ? String(o.canon(q) || '') : '', cq = wlen(c0) >= 4 ? c0 : '', numEnd = NUMW.test(qt[qt.length - 1] || '');
  // a name and a number ("kv-1", "kv 1", "is-1"): in a display name the number ends where a word ends, as on the canon path,
  // so "KV-122", "KV-1S" and "IS-10" stay out. A lone "vi" or "122" is still a word start
  const end = numEnd && qt.length >= 2;
  // inside a word only when the text before its first mark has 4 letters: "tiger" in "Jagdtiger", but not "is-2" in "ZIS-2"
  const deep = w => wlen(w.split(TOK).filter(Boolean)[0] || '') >= 4;
  const wordStart = (x, w, e) => x.startsWith(w) && (!e || endsAt(x, w.length));
  const inTitle = (t, tw, w, e) => tw.some(x => wordStart(x, w, e)) || (deep(w) && holds(t, w, e));
  for (const r of pool) {
    const n = r.name.toLowerCase(), t = r.title ? r.title.toLowerCase() : '', tw = t ? t.split(/\s+/) : [], own = n + ' ' + r.key;
    const cp = t && cq ? canonParts(o.canon, t) : null;
    const byCanon = !!cp && (numEnd ? cp.spans.has(cq) : cp.starts.some(c => c.startsWith(cq)));
    const phrase = !!t && qt.length >= 2 && phraseIn(t.split(TOK).filter(Boolean), qt, end);
    // the file name has no word marks to end at; there a closing number only must not run on into more digits ("kv 1" is not kv122)
    if (!words.every((w, i) => ownHas(own, w, end && i === words.length - 1) || (t && inTitle(t, tw, w, end && i === words.length - 1))) && !byCanon && !phrase) continue;
    const b = baseOf(n);   // a breed's name is its path (mp/ger/admiral): its last part counts as the name too
    const nr = n === q || b === q ? 0 : n.startsWith(q) || b.startsWith(q) ? 1 : n.includes(q) ? 4 : 9;
    // a folded match from a word start (4) comes before a display name that only holds the text mid-word (5):
    // "panzer iv" finds "PzKpfw IV Ausf.G" before "Jagdpanzer IV"
    const tr = !t ? 9 : t === q || (cp && cp.whole === cq) ? 2 : tw.some(w => wordStart(w, q, end)) || phrase ? 3 : byCanon ? 4 : deep(q) && holds(t, q, end) ? 5 : 9;
    const rank = Math.min(nr, tr, 6);
    const byTitle = !!t && (tr < nr || !words.every(w => own.includes(w)));   // the display name found it, not the file name
    hit.push([rank, byTitle ? Object.assign({}, r, { byTitle: true }) : r, b.length]);
  }
  const KO = { vehicle: 0, human: 1, breed: 2, object: 3, model: 4 };
  hit.sort((a, b) => a[0] - b[0] || a[2] - b[2] || (a[1].where === b[1].where ? 0 : a[1].where === 'mod' ? -1 : 1) || KO[a[1].kind] - KO[b[1].kind] ||
    (a[1].name < b[1].name ? -1 : a[1].name > b[1].name ? 1 : 0) || (a[1].key < b[1].key ? -1 : 1));
  const out = { total: hit.length, results: hit.slice(0, limit).map(h => h[1]), didYouMean: [] };
  if (!hit.length && q.length >= 2) {
    const best = new Map();   // name -> [distance, row]: one row per name
    for (const r of pool) {
      const b = baseOf(r.name.toLowerCase());
      let d = Math.min(lev(q, b), lev(q, b.slice(0, q.length)) + 1), dt = 9;
      // a display name counts too: the whole of it, or one of its words ("tigr" -> "PzKpfw VI Tiger")
      if (r.title) for (const w of [r.title.toLowerCase()].concat(r.title.toLowerCase().split(/\s+/))) if (w.length > 1) dt = Math.min(dt, lev(q, w));
      const tr = dt < d ? Object.assign({}, r, { byTitle: true }) : r; d = Math.min(d, dt);
      if (d <= Math.floor(q.length / 3) + 1 && (!best.has(b) || best.get(b)[0] > d)) best.set(b, [d, tr]);
    }
    out.didYouMean = [...best.values()].sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length || (a[1].name < b[1].name ? -1 : 1)).slice(0, 6).map(x => x[1]);
  }
  return out;
}

// ---------- folder ----------
const SKIP_DIRS = new Set(['.git', '.svn', '.arsenal', '.arsenal-bak']);
function listFolder(o) {
  // a folder inside a pak: <pak>!<folder> (or pak:<pak>!<folder>), entry names under that folder only
  const pm = /^(?:pak:)?(.+?\.pak)!(.*)$/i.exec(String(o.path).trim());
  const abs = path.resolve(pm ? pm[1] : String(o.path)), max = o.max || 500;
  const sub = pm ? fwd(pm[2]).replace(/^\/+/, '').replace(/\/*$/, '/').toLowerCase() : '';
  if (sub.split('/').includes('..')) return { error: 'A folder inside a pak cannot contain "..".' };
  let st; try { st = fs.statSync(abs); } catch (e) { return { error: `${fwd(abs)} was not found.` }; }
  const isPak = st.isFile() && /\.pak$/i.test(abs);
  if (pm && !isPak) return { error: `${fwd(abs)} is not a .pak file.` };
  // one model file (disk path, or pak:<pak>!<entry>): listed alone, so a path box can hand any pick to the same route
  const one = st.isFile() && !isPak;
  if (one && !/\.(mdl|def|set)$/i.test(abs)) return { error: `${fwd(abs)} is a file. Pick a folder, a .pak file, or a .mdl, .def or breed .set file.` };
  const exact = pm && /\.(mdl|def|set)\/$/.test(sub) ? sub.slice(0, -1) : null;
  const items = [];   // { key, kind: 'def'|'mdl'|'set', target, where, pak, get(), disk }
  const inside = (a, b) => { if (!b) return false; const r = path.relative(path.resolve(b), a); return !r.startsWith('..') && !path.isAbsolute(r); };
  const whereOf = a => o.modDir && inside(a, o.modDir) ? 'mod' : o.game && inside(a, o.game) && !inside(a, path.join(o.game, 'mods')) ? 'game' : 'mod';
  const want = k => /\.(mdl|def)$/.test(k) || (k.endsWith('.set') && /(^|\/)set\/breed\//.test(k));
  const paks = [], pakKeys = new Set();   // every entry key of the paks read: a def may name a model outside the listed folder
  let visited = 0;
  const addPak = file => {
    const L = T.pakLayout(file); let ents;
    try { ents = pak.list(file); } catch (e) { return; }
    for (const e of ents) {
      if (!e.name.endsWith('/')) pakKeys.add(path.posix.normalize(L.root + names.zipEntryName(e.name)));
      if (e.name.endsWith('/')) continue;
      const en = names.zipEntryName(e.name).toLowerCase();
      if (exact ? en !== exact : sub && sub !== '/' && !en.startsWith(sub)) continue;
      const key = path.posix.normalize(L.root + names.zipEntryName(e.name));
      if (!exact && !want(key)) continue;
      items.push({ key, ext: path.posix.extname(key), target: 'pak:' + path.resolve(file) + '!' + e.name, where: whereOf(file), pak: path.basename(file), ent: e, file });
    }
  };
  const addDisk = (p, force) => {
    const low = path.basename(p).toLowerCase(), lp = fwd(p).toLowerCase();
    if (!force && !want(lp)) return;
    const bk = !low.endsWith('.set') ? null : /set\/breed\//.test(lp) ? lp.replace(/^.*?set\/breed\//, '').replace(/\.set$/, '') : low.slice(0, -4);
    items.push({ key: T.fileLayout(p).key, ext: path.extname(low), target: path.resolve(p), where: whereOf(p), pak: '', disk: p, bk });
  };
  if (isPak) addPak(abs);
  else if (one) addDisk(abs, true);
  else (function walk(d, depth) {
    if (depth > 24 || visited > 200000) return;
    let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of es) {
      const p = path.join(d, e.name); visited++;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name.toLowerCase())) walk(p, depth + 1); continue; }
      if (e.name.toLowerCase().endsWith('.pak')) { paks.push(p); continue; }
      addDisk(p, false);
    }
  })(abs, 0);
  for (const p of paks) addPak(p);
  // reading: the items themselves (disk or pak), then game + mod for what a def or breed names outside the folder
  const fds = new Map();
  const read = it => {
    try {
      if (it.disk) return fs.readFileSync(it.disk);
      let e = fds.get(it.file); if (!e) fds.set(it.file, e = { file: it.file, fd: fs.openSync(it.file, 'r') });
      return pak.read(e, it.ent);
    } catch (e) { return null; }
  };
  const local = new Map(); for (const it of items) if (!local.has(it.key)) local.set(it.key, it);
  let src = null;
  const S = require('./stage');
  const layered = () => { if (src === null) { try { src = o.game ? S.openSource({ game: o.game, mods: o.mods || [], modDirs: o.modDir ? [o.modDir] : [], noInfer: true, exe: o.exe }) : false; } catch (e) { src = false; } } return src || null; };
  // a single file outside the layers: its neighbours on disk count (fileLayout: its resource tree, else its own folder)
  const L1 = one ? T.fileLayout(abs) : null;
  const diskHas = k => !!L1 && k.startsWith('resource/') && (() => { try { return fs.statSync(path.join(L1.overlay.root, ...k.slice(9).split('/'))).isFile(); } catch (e) { return false; } })();
  const has = k => local.has(k) || pakKeys.has(k) || diskHas(k) || (layered() ? layered().has(k) : false);
  const resolveModel = require('../entityindex/index').resolveModel;
  try {
    const rows = [], used = new Set(), byName = new Map();
    for (const it of items) {
      if (it.ext !== '.def') continue;
      const buf = read(it); if (!buf) continue;
      const v = T.extensionOf(buf);
      if (!v) continue;
      // a def outside any resource tree: its model is looked up next to it first
      const model = resolveModel(k => local.has(k), it.key, v) || resolveModel(has, it.key, v);
      if (!model || !model.endsWith('.mdl')) continue;
      used.add(model);
      const r = { target: it.target, name: baseOf(it.key).slice(0, -4), kind: kindOf(it.key, buf, it.disk || it.file), key: it.key, where: it.where, pak: it.pak, model };
      rows.push(r);
      if (!byName.has(r.name) || r.kind === 'human') byName.set(r.name, r);
    }
    for (const it of items) {
      if (it.ext !== '.set') continue;
      const buf = read(it); const skin = buf && T.skinOfKey(buf, it.key, k => (local.has(k) ? read(local.get(k)) : layered() ? T.bufOf(layered())(k) : null));
      let model = '';
      if (skin) {
        const d = byName.get(names.normalize(skin));
        if (d) model = d.model;
        else if (layered()) { const ds = T.defsByName(layered(), skin, true); for (const dk of ds) { const g = layered().get(dk); const m = g && T.modelOfDef(layered(), dk, g.buf); if (m) { model = m; break; } } }
      }
      const bk = it.bk || it.key.replace(/^.*?set\/breed\//, '').replace(/\.set$/, '');
      rows.push({ target: it.target, name: bk, kind: 'breed', key: it.key, where: it.where, pak: it.pak, model });
    }
    for (const it of items) {
      if (it.ext !== '.mdl' || used.has(it.key)) continue;
      rows.push({ target: it.target, name: baseOf(it.key).slice(0, -4), kind: 'model', key: it.key, where: it.where, pak: it.pak, model: it.key });
    }
    rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return { path: fwd(abs) + (pm ? '!' + sub.replace(/\/$/, '') : ''), total: rows.length, results: rows.slice(0, max), truncated: rows.length > max };
  } finally {
    for (const e of fds.values()) { try { fs.closeSync(e.fd); } catch (x) { /* closed */ } }
    if (src) src.close();
  }
}

module.exports = { build, buildAsync, search, listFolder, sig, cacheFile, load, kindOf, KINDS, VERSION, SECTION, AREAS, parts, stamps };
