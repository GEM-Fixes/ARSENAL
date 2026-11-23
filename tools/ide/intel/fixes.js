// ide/intel/fixes: line-local quick fixes for the editor. Every fix is an edit of the open text (one undo step in the editor);
// nothing is written to disk here. Logic follows tools/fix (lib/textfix RULES, lib/crashfix include/macro, lib/edits repoint).
//   fixes(doc, findings, ictx) -> [{ id, code, line, label:{k,p}, safe, edits:[{line, col, endCol, text}] }]
//   apply(text, edits) -> text      (bottom-up; col 0 = insert a whole new line before `line`; overlapping edits are dropped;
//                                    an edit covering a whole line with text '' and dropEol:true deletes the line with its line end)
//   multi(findings) -> [code]       codes whose fixer lives only in the patch-mod tool (lng, enc, stubmtl: explain.js AUTO kinds that are not line-local)
//   warm(ictx) -> Promise<bool>, ready(ictx) -> bool   background define index (macro fixers give no fix until it is ready)
//   memoBegin(ictx), memoEnd(ictx)   a whole-mod check's pair: between them an included file is read once (see readKey)
// kinds: spell (one right spelling), syntax (rewrite the line the way the engine reads it), asread (the value the engine already uses),
//        include / repoint / macro (need a layered view: ictx.vfs, else ictx.gameDir, or ictx.folder: exactly one file with that
//        name / one file that defines the macro). A view built here is that of ictx.exe / ictx.game (intel/game.js: 'mowas_2' on
//        the shared AS2 install leaves as64/core out; 'goh' with the GoH install), cached per game; none named = the vfs default.
// safe = the result is certain and the engine reads it the same (explain FIXERS safe): asread, include, repoint; macro only when
// the one defining file is a .inc and the buffer does not define the name itself.
// enc of one line is left to multi(): the editor already shows cp1251 lines decoded (files/lib decodeBuf), so the text holds no mojibake to map back.
// Author: Imperator_Aug (ARSENAL, ia-e7065a42)
'use strict';
const fs = require('fs'), path = require('path');
const GAME = require('./game');   // ictx.exe | ictx.game: the game whose view a built view shows (none: the vfs default, as before)

const strip = c => String(c || '').replace(/^WARN_/, '');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const one = (L, re) => { const ms = [...L.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))]; return ms.length === 1 ? ms[0] : null; };
const keyAt = (L, name, flags) => { const m = one(L, new RegExp('(\\{\\s*)' + esc(name) + '(?![\\w-])', flags || '')); return m ? { at: m.index + m[1].length, len: m[0].length - m[1].length } : null; };
const lab = (k, p) => ({ k: 'ide.f.' + k, p: p || {} });
const SAFE = { asread: true, include: true, repoint: true, macro: true, spell: false, syntax: false };
const LINE_KINDS = new Set(Object.keys(SAFE));
const bname = k => String(k).replace(/\\/g, '/').split('/').pop().toLowerCase();
const stem = s => bname(s).replace(/\.[^.\/]+$/, '');
const extOf = s => { const m = /\.([^.\/\\]+)$/.exec(s); return m ? m[1].toLowerCase() : ''; };
const absRef = key => '/' + key.replace(/^resource\//, '');
const oddPath = p => /[^\x20-\x7e]/.test(p) || /["{}()]/.test(p);

// ---------------------------------------------------------------- layered file view (only include/repoint/macro and check's include pass need it)
// ictx.vfs = the view the GUI already built (lib/vfs build result, or the files/lib vfsFor {v} wrapper, or a function giving one);
// it may be a lazy getter, so it is read only here, only when a caller needs the view. Without the property (the CLI) a view is
// built once for ictx.gameDir and kept 5 minutes.
function viewOf(ictx) {
  if (!ictx) return null;
  if ('vfs' in ictx) {
    let g = null;
    try { g = ictx.vfs; if (typeof g === 'function') g = g(); } catch { g = null; }
    if (g && g.files instanceof Map) return g;
    if (g && g.v && g.v.files instanceof Map) return g.v;
    return null;   // the caller said: no view. never build a second one beside it
  }
  return vfsOf(ictx);
}
// bytes of one virtual key through the layers: the open mod folder first, then the view. null = in no layer
// memoBegin(ictx) .. memoEnd(ictx) (one whole-mod check: ext/ide/routes modcheck): between the two every key is read once
// (also "not there"), here and in keylint's include reads (keylint memoHold), where each file of the mod is parsed with its
// includes: the same macro and property files were read for every file that names them. Without the pair nothing is kept.
// A file changed while the pair is open is seen as it was until memoEnd; the checked file itself is never read here (the job
// reads it and hands its text over). An ictx is one job's object, so its kept bytes go with it.
function readKey(ictx, key, v) {
  const m = ictx && ictx[BYTES];
  if (!m) return readKey0(ictx, key, v);
  let b = m.get(key);
  if (b === undefined) m.set(key, b = readKey0(ictx, key, v));
  return b;
}
const BYTES = Symbol('fixes.bytes');
function memoBegin(ictx) {
  if (!ictx || ictx[BYTES]) return false;
  Object.defineProperty(ictx, BYTES, { value: new Map(), enumerable: false, configurable: true });
  try { require('../../keylint/keylint').memoHold(true); } catch { /* keylint reads as before */ }
  return true;
}
function memoEnd(ictx) {
  if (!ictx || !ictx[BYTES]) return false;
  delete ictx[BYTES];
  try { require('../../keylint/keylint').memoHold(false); } catch { /* nothing held */ }
  return true;
}
function readKey0(ictx, key, v) {
  if (ictx && ictx.folder) {
    try { const p = path.join(String(ictx.folder), ...String(key).split('/')); if (fs.statSync(p).isFile()) return fs.readFileSync(p); } catch { /* not in the folder */ }
  }
  if (v === undefined) v = viewOf(ictx); else if (typeof v === 'function') v = v();
  const rec = v && v.files.get(key);
  if (!rec) return null;
  try { return require('../../lib/vfs').readRec(rec); } catch { return null; }
}
const _v = new Map();
function vfsOf(ictx) {
  if (!ictx || !ictx.gameDir) return null;
  const G = GAME.gameOf(ictx);   // ictx.exe / ictx.game: that game's view (MoW:AS2 on the shared install: no as64/core)
  const k = path.resolve(String(ictx.gameDir)).toLowerCase() + '|' + (ictx.mods || []).join(',') + GAME.keyPart(G);
  const c = _v.get(k);
  if (c && Date.now() - c.t < 300000) return c.v;
  let v = null;
  try { if (fs.statSync(ictx.gameDir).isDirectory()) v = require('../../lib/vfs').build(Object.assign({ gameDir: ictx.gameDir, mods: ictx.mods || [], disableVersionControl: true }, G.exe ? { exe: G.exe } : {})); } catch { v = null; }
  _v.set(k, { t: Date.now(), v });
  if (_v.size > 4) _v.delete(_v.keys().next().value);
  return v;
}
// ---- CACHE (gui README, contract 1): the shared walk of the mod and the shared store.
// ictx.shared = { cache, modtree, gameview } of the GUI server (ext/ide/routes ictxOf); without it (the CLI, a test) the modules.
const sharedOf = ictx => (ictx && ictx.shared) || {};
const mtOf = ictx => sharedOf(ictx).modtree || require('../../lib/modtree');
const gvOf = ictx => sharedOf(ictx).gameview || require('../../lib/gameview');
const storeOf = ictx => sharedOf(ictx).cache || require('../../lib/cachestore').open();
const BORN = Date.now() - Math.round(process.uptime() * 1000);
// the walk of the open mod folder made by this process (null: none yet); an old one is asked again in the background
function treeOf(ictx, folder) {
  try {
    const mt = mtOf(ictx);
    mt.ensure(folder, { maxAgeMs: 30000 }).catch(() => {});
    const T = mt.last(folder);
    return T && T.at >= BORN ? T : null;
  } catch { return null; }
}
// loose files of the open mod folder (the mod may not be in the profile list): virtual key -> absolute path.
// Taken from the shared walk (fresh by its signature, every file, no walk here). Only before the first walk of this process has
// ended is the folder read here (at most 50000 files), and that list is dropped when the walk is there.
const _f = new Map();
function folderFiles(folder, ictx) {
  if (!folder) return new Map();
  const root = path.resolve(String(folder)), c = _f.get(root);
  const T = treeOf(ictx, root);
  if (T) {
    if (c && c.all === T.all) return c.m;
    const m = new Map();
    for (const r of T.files) if (/^resource\//i.test(r[0])) m.set(r[0].toLowerCase(), path.join(root, ...r[0].split('/')));
    _f.delete(root); _f.set(root, { all: T.all, m });
    if (_f.size > 8) _f.delete(_f.keys().next().value);
    return m;
  }
  if (c && !c.all) return c.m;
  const m = new Map();
  const walk = (d, rel) => {
    let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      if (m.size > 50000) return;
      const r = rel + '/' + e.name.toLowerCase();
      if (e.isDirectory()) walk(path.join(d, e.name), r); else m.set(r.slice(1), path.join(d, e.name));
    }
  };
  walk(path.join(root, 'resource'), '/resource');
  _f.set(root, { all: null, m });
  if (_f.size > 8) _f.delete(_f.keys().next().value);
  return m;
}
const _idx = new WeakMap();
function stemIndex(v) {
  let m = v && _idx.get(v);
  if (m) return m;
  m = new Map();
  if (v) for (const k of v.files.keys()) { const s = stem(k); let a = m.get(s); if (!a) m.set(s, a = []); a.push(k); }
  if (v) _idx.set(v, m);
  return m;
}
// every key with that stem (game index + open mod folder), unique
function byStem(x, s) {
  const out = new Set(stemIndex(x.v()).get(s) || []);
  for (const k of x.loose().keys()) if (stem(k) === s) out.add(k);
  return [...out];
}
// define index over .inc/.set/.ext (crashfix defIndex): name -> Set(keys). Built in the background in slices of at most SLICE
// file reads (setImmediate between slices), kept per game + folder + mods; a stale index keeps serving while a new
// one builds. Until the first build is done the fixers that need it give no fix (the next check picks it up).
//   warm(ictx) -> Promise<bool>  starts (or joins) the build      ready(ictx) -> bool
// CACHE: fresh by stamps, not by age: the game stamp (lib/gameview) and the open mod folder's signature (lib/modtree, all areas:
// an .inc/.set/.ext may sit anywhere under resource/). The built index is also kept in the shared store (section 'ide.defs', parts
// {game, folder, mods, kp}, stamps game + mod:all), so a restart reads it instead of every .inc/.set/.ext of the game and the mod.
const DEFX = /\.(inc|set|ext)$/, SLICE = 50, DEF_SEC = 'ide.defs', DEF_VER = 1, DEF_SIG_MS = 2000;
const _defs = new Map();
// -> { game, mod } stamps of what the index is read from (mod '' = no folder, '?' = no walk known yet)
function defStamps(ictx) {
  let g = ''; try { if (ictx.gameDir) g = gvOf(ictx).stamp({ gameDir: ictx.gameDir, exe: GAME.gameOf(ictx).exe }) || ''; } catch { g = ''; }
  let m = '';
  if (ictx.folder) { let T = null; try { mtOf(ictx).ensure(ictx.folder, { maxAgeMs: 60000 }).catch(() => {}); T = mtOf(ictx).last(ictx.folder); } catch { T = null; } m = T ? T.all : '?'; }
  return { game: g, 'mod:all': m };
}
// the stamps as one text, asked at most every DEF_SIG_MS per index
function defSig(e, ictx) {
  const now = Date.now();
  if (!e.st || now - e.stAt > DEF_SIG_MS) { e.st = defStamps(ictx); e.stAt = now; }
  return e.st.game + '|' + e.st['mod:all'];
}
const defParts = ictx => ({ game: ictx.gameDir ? path.resolve(String(ictx.gameDir)).toLowerCase() : '', folder: ictx.folder ? path.resolve(String(ictx.folder)).toLowerCase() : '', mods: (ictx.mods || []).join(','), kp: GAME.keyPart(GAME.gameOf(ictx)) });
const defKey = ictx => [ictx.gameDir ? path.resolve(String(ictx.gameDir)).toLowerCase() : '', ictx.folder ? path.resolve(String(ictx.folder)).toLowerCase() : '', (ictx.mods || []).join(',')].join('|') + GAME.keyPart(GAME.gameOf(ictx));
function buildDefs(ictx) {
  return new Promise(res => {
    const jobs = [], map = new Map();
    try {
      const v = viewOf(ictx), loose = ictx.folder ? folderFiles(ictx.folder, ictx) : new Map(), vfs = require('../../lib/vfs');
      // the open mod's loose .inc/.set/.ext win over the index copy of the same key
      for (const [k, f] of loose) if (DEFX.test(k) && k.startsWith('resource/')) jobs.push([k, () => fs.readFileSync(f)]);
      if (v) for (const [k, rec] of v.files) if (DEFX.test(k) && k.startsWith('resource/') && !loose.has(k)) jobs.push([k, () => vfs.readRec(rec)]);
    } catch { /* what was listed is indexed */ }
    const re = /\(\s*define\s+"([^"]+)"/gi;
    let i = 0;
    const step = () => {
      const end = Math.min(jobs.length, i + SLICE);
      for (; i < end; i++) {
        const [k, rd] = jobs[i];
        let b; try { b = rd(); } catch { continue; }
        if (b.indexOf('define') < 0 && b.indexOf('DEFINE') < 0 && b.indexOf('Define') < 0) continue;
        const t = b.toString('latin1'); re.lastIndex = 0; let m;
        while ((m = re.exec(t))) { let a = map.get(m[1]); if (!a) map.set(m[1], a = new Set()); a.add(k); }
      }
      if (i < jobs.length) setImmediate(step); else res(map);
    };
    setImmediate(step);
  });
}
function warm(ictx) {
  try {
    if (!ictx || !(ictx.gameDir || ictx.folder || ictx.vfs)) return Promise.resolve(false);
    const k = defKey(ictx);
    let e = _defs.get(k);
    if (e && (e.building || (e.p && e.sig === defSig(e, ictx)))) return e.p;
    if (!e) {
      e = { map: null, ready: false, building: false, t: 0, p: null, sig: null, st: null, stAt: 0 };
      _defs.set(k, e);
      if (_defs.size > 6) for (const [dk, de] of _defs) if (dk !== k && !de.building) { _defs.delete(dk); break; }
    }
    const sig = defSig(e, ictx), stamps = Object.assign({}, e.st), known = stamps['mod:all'] !== '?';
    // the store first: an index made from the same game and mod files (a mod with no walk known yet is not asked, nor kept)
    let S = null; try { S = storeOf(ictx); } catch { S = null; }
    if (S && known) {
      try {
        const hit = S.get(DEF_SEC, DEF_VER, defParts(ictx), stamps);
        if (hit && Array.isArray(hit.value)) {
          const map = new Map(); for (const r of hit.value) map.set(r[0], new Set(r[1]));
          e.map = map; e.ready = true; e.t = Date.now(); e.sig = sig; e.p = Promise.resolve(true);
          return e.p;
        }
      } catch { /* built below */ }
    }
    e.building = true;
    e.p = buildDefs(ictx).then(map => {
      e.map = map; e.ready = true; e.t = Date.now(); e.sig = sig; e.building = false;
      if (S && known) { try { S.put(DEF_SEC, DEF_VER, defParts(ictx), stamps, [...map].map(([n, ks]) => [n, [...ks]])); } catch { /* cache only */ } }
      return true;
    }, () => { e.building = false; e.t = Date.now(); e.sig = sig; return e.ready; });
    return e.p;
  } catch { return Promise.resolve(false); }
}
function ready(ictx) {
  try { const e = ictx && _defs.get(defKey(ictx)); return !!(e && e.ready); } catch { return false; }
}
// the index when built (a stale one also starts a rebuild), else null after starting the build
function defIndex(x) {
  if (!x.ictx) return null;
  const e = _defs.get(defKey(x.ictx));
  if (!e || !e.ready || e.sig !== defSig(e, x.ictx)) warm(x.ictx);
  return e && e.ready ? e.map : null;
}
// the buffer holds (define "name" (exact case) somewhere
const definesHere = (text, name) => new RegExp('\\(\\s*define\\s+"' + esc(name) + '"').test(text);

// ---------------------------------------------------------------- string / brace scan of one SDL line (sdlx lexer: ; comment, \ escapes)
function scanLine(L) {
  let inS = false, open = -1, depth = 0, comment = -1;
  for (let i = 0; i < L.length; i++) {
    const c = L[i];
    if (inS) { if (c === '\\') i++; else if (c === '"') inS = false; continue; }
    if (c === '"') { inS = true; open = i; } else if (c === ';') { comment = i; break; }
    else if (c === '{' || c === '(') depth++; else if (c === '}' || c === ')') depth--;
  }
  return { inS, open, depth, comment };
}

// ---------------------------------------------------------------- rules. parse(msg) -> parts | null (not readable: no fix); fix(p, L, x) -> null | { at, len, text, label } | { edit, label }
const RULES = {
  KEY_CASE: {
    kind: 'spell',
    parse: m => { const r = /^key "([^"]+)": .*vanilla spells it ((?:"[^"]+"(?: \/ )?)+)/.exec(m); return r ? { a: r[1], alts: [...r[2].matchAll(/"([^"]+)"/g)].map(q => q[1]) } : null; },
    fix(p, L) {
      if (p.alts.length !== 1 || p.alts[0].toLowerCase() !== p.a.toLowerCase()) return null;
      const k = keyAt(L, p.a);
      return k && { at: k.at, len: k.len, text: p.alts[0], label: lab('change', { from: p.a, to: p.alts[0] }) };
    },
  },
  MI_KEY_CASE: {
    kind: 'spell',
    parse: m => { const r = /key '([^']+)' is case-sensitive(?:: skipped silently \(use ([^)]+)\)|; the reader knows '([^']+)')/.exec(m), b = r && (r[2] || r[3]); return r && b && b !== 'undefined' && b.toLowerCase() === r[1].toLowerCase() ? { a: r[1], b } : null; },
    fix(p, L) { const k = keyAt(L, p.a); return k && { at: k.at, len: k.len, text: p.b, label: lab('change', { from: p.a, to: p.b }) }; },
  },
  MIS_TEAMKEY_UNREAD: {
    kind: 'spell',
    parse: m => { const r = /^(minTeamPlayers|maxTeamPlayers) is not read; use (minTeamSlots|maxTeamSlots)/.exec(m); return r ? { a: r[1], b: r[2] } : null; },
    fix(p, L, x) {
      if (new RegExp('\\{\\s*' + p.b + '(?![\\w-])', 'i').test(x.text)) return null;
      const k = keyAt(L, p.a, 'i');
      return k && { at: k.at, len: k.len, text: p.b, label: lab('change', { from: L.substr(k.at, k.len), to: p.b }) };
    },
  },
  UNKNOWN_KEY: {
    kind: 'spell',
    parse: m => { const r = /^unknown key "([^"]+)" in .*?; did you mean "([^"]+)"\?/.exec(m); return r && r[1] !== r[2] ? { a: r[1], b: r[2] } : null; },
    fix(p, L) { const k = keyAt(L, p.a); return k && { at: k.at, len: k.len, text: p.b, label: lab('change', { from: p.a, to: p.b }) }; },
  },
  MACRO_CASE_MISMATCH: {
    kind: 'spell',
    parse: m => { const r = /^macro "([^"]+)" is used but only "([^"]+)" is defined/.exec(m); return r ? { a: r[1], b: r[2] } : null; },
    fix(p, L, x) {
      const own = new Set(); for (const m of x.text.matchAll(/\(\s*define\s+"([^"]*)"/g)) if (m[1].toLowerCase() === p.a.toLowerCase()) own.add(m[1]);
      if (own.size !== 1 || !own.has(p.b)) return null;
      if (x.v() || (x.ictx && x.ictx.folder)) {
        const d = defIndex(x);
        if (!d) return null;                // index still building: no fix yet
        if (d.has(p.a)) return null;        // defined with that exact case elsewhere: an include may be what is missing
      }
      const m = one(L, new RegExp('"' + esc(p.a) + '"'));
      return m && { at: m.index + 1, len: p.a.length, text: p.b, label: lab('change', { from: p.a, to: p.b }) };
    },
  },
  MTL_DIFFUSE_BARE: {
    kind: 'syntax',
    parse: m => { const r = /^\{diffuse ([^}"\s]+)\}: the texture name must be a quoted string/.exec(m); return r ? { a: r[1] } : null; },
    fix(p, L) { const m = one(L, new RegExp('(\\{\\s*diffuse\\s+)' + esc(p.a) + '(?=\\s*\\})', 'i')); return m && { at: m.index + m[1].length, len: p.a.length, text: '"' + p.a + '"', label: lab('quote', { v: p.a }) }; },
  },
  TAGS_MULTI_STRING: {
    kind: 'syntax',
    parse: m => { const r = /write one string, \{tags "([^"]*)"\}/.exec(m); return r ? { b: r[1] } : null; },
    fix(p, L) {
      const m = one(L, /(\{\s*tags)((?:\s+"[^"]*"){2,})(?=\s*\})/i);
      if (!m) return null;
      const j = [...m[2].matchAll(/"([^"]*)"/g)].map(q => q[1]).join(' ');
      return j === p.b ? { at: m.index + m[1].length, len: m[2].length, text: ' "' + j + '"', label: lab('join', { to: j }) } : null;
    },
  },
  STR_NEWLINE: {
    kind: 'syntax',
    parse: () => ({}),
    fix(p, L) {
      const s = scanLine(L);
      if (!s.inS) return null;
      const rest = L.slice(s.open + 1);
      if (rest.indexOf(';') >= 0) return null;   // a comment or a string? cannot tell
      const tail = /[\s})]*$/.exec(rest)[0], closers = (tail.match(/[})]/g) || []).length;
      const body = rest.length - tail.length;
      // closers at the end: they belong to the blocks opened before the string when the counts match
      if (closers && closers > s.depth) return null;
      const at = s.open + 1 + body;
      return { at, len: 0, text: '"', label: lab('closeQuote') };
    },
  },
  BLOCK_END_STRAY: {
    kind: 'syntax',
    parse: () => ({}),
    // the one '}' of the line that no '{' of the same line opens (braces matched inside the line cannot be the stray one);
    // two or more such braces: cannot tell which, no fix. Only that character goes (a "; comment" stays); one blank before it
    // goes too when the line would end in blanks; a line left blank is deleted with its line end.
    fix(p, L) {
      let d = 0, at = -1, n = 0;
      for (let i = 0; i < L.length; i++) {
        const c = L[i];
        if (c === '"') { let j = i + 1; while (j < L.length && L[j] !== '"') j += L[j] === '\\' ? 2 : 1; i = j; continue; }
        if (c === ';') break;
        if (c === '{') d++;
        else if (c === '}') { if (d > 0) d--; else { at = i; n++; } }
      }
      if (n !== 1) return null;
      const rest = L.slice(0, at) + L.slice(at + 1);
      if (!rest.trim()) return { at: 0, len: L.length, text: '', dropEol: true, label: lab('dropBrace') };
      if (L.slice(at + 1).trim()) return { at, len: 1, text: '', label: lab('dropBrace') };
      const sp = at > 0 && /[ \t]/.test(L[at - 1]) ? 1 : 0;   // brace ends the line: it, one blank before it and the blanks after go
      return { at: at - sp, len: L.length - at + sp, text: '', label: lab('dropBrace') };
    },
  },
  THRESHOLD_LT1: {
    kind: 'asread',
    parse: m => { const r = /^projectileDamageThreshold (\S+) is clamped to 1/.exec(m); return r && isFinite(Number(r[1])) ? { v: Number(r[1]) } : null; },
    fix(p, L) {
      const m = one(L, /(\{\s*projectileDamageThreshold\s+)([-+]?[\d.]+(?:e[-+]?\d+)?)(?=[\s}])/i);
      return m && Number(m[2]) === p.v ? { at: m.index + m[1].length, len: m[2].length, text: '1', label: lab('asread', { from: m[2], to: '1' }) } : null;
    },
  },
  MAP_PLAYERS: {
    kind: 'asread',
    parse: m => { const r = /^maxPlayers (\d+) is odd/.exec(m); return r ? { n: +r[1] } : null; },
    fix(p, L) {
      const m = one(L, new RegExp('(\\{\\s*maxPlayers\\s+)' + p.n + '(?=[\\s}])', 'i'));
      return m && { at: m.index + m[1].length, len: String(p.n).length, text: String(p.n + 1), label: lab('asread', { from: String(p.n), to: String(p.n + 1) }) };
    },
  },
  INCLUDE_MISSING: {
    kind: 'include', game: true,
    parse: m => { const r = /include "([^"]+)" not found/.exec(m); return r ? { a: r[1] } : null; },
    fix(p, L, x) {
      const v = p.a, own = x.key ? String(x.key).toLowerCase() : null;
      let cands = byStem(x, stem(v)).filter(k => bname(k) === bname(v) && k !== own && k.startsWith('resource/'));
      if (cands.length > 1 && v[0] !== '/' && own) {
        const tail = own.split('/').slice(2, -1).join('/');
        const mir = cands.filter(k => k.split('/').slice(2, -1).join('/') === tail);
        if (mir.length === 1) cands = mir;
      }
      if (cands.length !== 1) return null;
      const nv = absRef(cands[0]);
      if (oddPath(nv)) return null;
      const lo = L.toLowerCase(), nd = '"' + v.toLowerCase() + '"', at = lo.indexOf(nd);
      if (at < 0 || lo.indexOf(nd, at + 1) >= 0) return null;
      return { at: at + 1, len: v.length, text: nv, label: lab('point', { from: v, to: nv }) };
    },
  },
  MACRO_UNDEFINED: {
    kind: 'macro', game: true,
    parse: m => { const r = /define not found: "([^"]+)"/.exec(m); return r ? { a: r[1] } : null; },
    // the buffer defines the name itself (later than the use): an include is the wrong fix, none offered.
    // safe only when the one defining file is a .inc: a .set/.ext pulls its whole content (blocks, keys) into this file.
    fix(p, L, x) {
      if (definesHere(x.text, p.a)) return null;
      const d = defIndex(x), own = x.key ? String(x.key).toLowerCase() : null;
      if (!d) return null;
      const where = [...(d.get(p.a) || [])].filter(k => k !== own);
      if (where.length !== 1) return null;
      const inc = absRef(where[0]);
      if (oddPath(inc) || x.text.toLowerCase().indexOf('"' + inc.toLowerCase() + '"') >= 0) return null;
      const first = x.lines[0] || '';
      const edit = first.charCodeAt(0) === 0xFEFF
        ? { line: 1, col: 2, endCol: 2, text: '(include "' + inc + '") ' }
        : { line: 1, col: 0, endCol: 0, text: '(include "' + inc + '")' };
      return { edit, safe: extOf(where[0]) === 'inc', label: lab('include', { to: inc, name: p.a }) };
    },
  },
};
// repoint (tools/fix/lib/edits KINDS): refcheck path findings with exactly one same-name file; textures with no extension keep none
const REPOINT = {
  REF_MODEL_MISSING: { re: /^Extension "([^"]+)"/, exts: ['ext', 'mdl'] },
  REF_MESH_MISSING: { re: /^\w+ "([^"]+)" not found/, exts: ['ply', 'vol', 'anm', 'mdl'] },
  REF_TEXTURE_MISSING: { re: /^texture "([^"]+)"/, exts: ['dds', 'tga', 'ebm', 'bmp', 'tex'], tex: true },
  REF_WRONG_FOLDER: { re: /^(?:\w+) "([^"]+)" resolves/, given: [/write "([^"]+)" or move/, /but exists as ([^\s;,]+)/] },
};
// the value as a whole token on the line (quoted or bare), exactly once
function valueAt(L, v) {
  const m = one(L, new RegExp('(?<=^|["\\s{])' + esc(v) + '(?=["\\s}]|$)', 'i'));
  return m ? m.index : -1;
}
for (const [code, K] of Object.entries(REPOINT)) RULES[code] = {
  kind: 'repoint', game: !K.given,
  parse: m => { const r = K.re.exec(m); return r ? { a: r[1] } : null; },
  fix(p, L, x, f) {
    const v = p.a;
    let target = null;
    if (K.given) {
      let q = null;
      for (const re of K.given) { const g = re.exec(String(f.msg)); if (g) { q = g[1]; break; } }
      if (q) target = q.startsWith('/') ? q.slice(1) : q.replace(/^resource\//, '');
    } else {
      const vx = extOf(v), want = vx ? [vx] : K.exts;
      const u = byStem(x, stem(v)).filter(k => k.startsWith('resource/') && want.includes(extOf(k)));
      if (u.length === 1) target = u[0].replace(/^resource\//, '').replace(!vx && K.tex ? /\.[^.\/]+$/ : /$^/, '');
    }
    if (!target || oddPath(target)) return null;
    const nv = '/' + target, at = valueAt(L, v);
    if (at < 0 || nv === v) return null;
    return { at, len: v.length, text: nv, label: lab('point', { from: v, to: nv }) };
  },
};

function fixes(doc, findings, ictx) {
  const out = [];
  try {
    if (!doc || typeof doc.text !== 'string' || !Array.isArray(findings)) return out;
    const lines = doc.text.split('\n');
    let v, loose;
    const x = {
      text: doc.text, lines, key: doc.key || null, ictx: ictx || null,
      v: () => (v === undefined ? (v = viewOf(ictx)) : v),
      loose: () => (loose === undefined ? (loose = ictx && ictx.folder ? folderFiles(ictx.folder, ictx) : new Map()) : loose),
    };
    const seen = new Set(), count = new Map();
    for (const f of findings) {
      if (!f || !f.line) continue;
      const code = strip(f.code), rule = RULES[code];
      if (!rule) continue;
      const dk = f.line + '|' + code + '|' + f.msg;
      if (seen.has(dk)) continue; seen.add(dk);
      let L = lines[f.line - 1];
      if (L === undefined) continue;
      const cr = L.endsWith('\r'); if (cr) L = L.slice(0, -1);
      if (rule.game && !x.v() && !(ictx && ictx.folder)) continue;
      let r = null;
      try { const p = rule.parse(String(f.msg || '')); if (p) r = rule.fix(p, L, x, f); } catch { r = null; }
      if (!r) continue;
      const edit = r.edit || { line: f.line, col: r.at + 1, endCol: r.at + 1 + r.len, text: r.text };
      if (r.dropEol) edit.dropEol = true;
      const ck = f.code + ':' + f.line, n = (count.get(ck) || 0) + 1; count.set(ck, n);
      out.push({ id: ck + ':' + n, code: f.code, line: f.line, label: r.label, safe: r.safe !== undefined ? r.safe === true : SAFE[rule.kind] === true, edits: [edit] });
    }
  } catch { /* never throws: a broken rule gives no fix */ }
  return out;
}

// apply edits bottom-up. edit = {line, col, endCol, text}; 1-based cols, endCol exclusive; col 0 = new line before `line` (line = count+1 appends).
function apply(text, edits) {
  const lines = String(text).split('\n');
  const list = (edits || []).map((e, i) => ({ e, i })).filter(o => o.e && o.e.line >= 1);
  list.sort((a, b) => (b.e.line - a.e.line) || ((b.e.col | 0) - (a.e.col | 0)) || (b.i - a.i));
  let lastLine = -1, lastCol = Infinity;
  for (const { e } of list) {
    const ln = e.line | 0, t = String(e.text == null ? '' : e.text);
    if ((e.col | 0) === 0) {
      if (ln > lines.length + 1) continue;
      // a CRLF text gets a CRLF line: the line end of the line it goes before (or of the one above when appending)
      const crl = [lines[ln - 1], lines[ln - 2], lines.length > 1 ? lines[0] : undefined].some(s => s !== undefined && s.endsWith('\r')) ? '\r' : '';
      const nt = t.replace(/\r?\n$/, '');
      if (ln === lines.length + 1) {   // append after the last line: that line gets the line end, the new one has none
        if (crl && !lines[ln - 2].endsWith('\r')) lines[ln - 2] += '\r';
        lines.push(nt);
      } else lines.splice(ln - 1, 0, nt + crl);
      lastLine = -1; lastCol = Infinity;
      continue;
    }
    if (ln > lines.length) continue;
    let L = lines[ln - 1];
    const cr = L.endsWith('\r'); if (cr) L = L.slice(0, -1);
    const a = Math.min(Math.max(1, e.col | 0), L.length + 1), b = Math.min(Math.max(a, e.endCol == null ? a : e.endCol | 0), L.length + 1);
    if (ln === lastLine && b > lastCol) continue;   // overlaps an edit already applied on this line: dropped, never mangled
    if (e.dropEol && a === 1 && b === L.length + 1 && !t) {
      // the whole line goes with its line end; the last line takes the line end before it instead
      if (ln < lines.length) lines.splice(ln - 1, 1);
      else if (ln > 1) { lines.splice(ln - 1, 1); const p = lines[ln - 2]; if (p.endsWith('\r')) lines[ln - 2] = p.slice(0, -1); }
      else lines[0] = '';
      lastLine = -1; lastCol = Infinity;
      continue;
    }
    lines[ln - 1] = L.slice(0, a - 1) + t + L.slice(b - 1) + (cr ? '\r' : '');
    lastLine = ln; lastCol = a;
  }
  return lines.join('\n');
}

// codes whose fixer is only in the patch-mod tool (tools/fix): kinds of explain AUTO that are not line-local
let _multi = null;
function multiKinds() {
  if (_multi) return _multi;
  let AUTO = {}, FIXERS = {};
  try { ({ AUTO, FIXERS } = require('../../lib/explain')); } catch { AUTO = {}; FIXERS = {}; }
  const kinds = new Set(Object.keys(FIXERS).filter(k => !LINE_KINDS.has(k)));
  kinds.add('quarantine');
  _multi = { AUTO, kinds };
  return _multi;
}
function multi(findings) {
  const { AUTO, kinds } = multiKinds(), out = [], seen = new Set();
  for (const f of findings || []) {
    const c = f && (typeof f === 'string' ? f : f.code);
    if (!c || seen.has(c)) continue;
    const k = AUTO[c] || AUTO[strip(c)];
    if (k && kinds.has(k)) { seen.add(c); out.push(c); }
  }
  return out;
}

// codes check() can produce and fixes() can fix. refcheck (REF_*, THRESHOLD_LT1) and milint.check (MAP_PLAYERS,
// MIS_TEAMKEY_UNREAD) have no text-taking entry point (whole-index scripts), so check() never yields those codes: their rules
// stay for findings that come from outside (a whole-mod run) but they are not listed here.
const OUTSIDE = new Set(['THRESHOLD_LT1', 'MAP_PLAYERS', 'MIS_TEAMKEY_UNREAD', ...Object.keys(REPOINT)]);
module.exports = { fixes, apply, multi, warm, ready, memoBegin, memoEnd, FIX_CODES: Object.keys(RULES).filter(c => !OUTSIDE.has(c)), _layer: { viewOf, readKey } };
