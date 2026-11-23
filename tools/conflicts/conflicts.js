#!/usr/bin/env node
// conflicts: LOOT/xEdit-style load-order conflict view. For every vfs path provided by >=2 sources (vanilla + mods, real
// load order via lib/vfs), per SDL key: value per source, winner (last), losers.
// usage: node tools/conflicts/conflicts.js --game G --mods a,b,c [--mod-dir folder]... [--file <vfs glob>] [--itm]
//          [--clean <mod> --out <dir>] [--fmt md|csv|json] [-q] [--summary]
//          [--mods-only] [--joint] [--listings | --scan-kept] [--trust-mtime] [--cache | --cache-dir <store>] [--progress <file>] [--no-version-check]
//   speed (see reader() below): --mods-only = only files two of the mods hold (no CONFLICT_KEY_OVERRIDDEN lines for a file one mod
//          holds); --listings = mount the mods from a lib/modtree scan (no stat per file; --scan-kept: the scan kept in the store);
//          --trust-mtime = two loose files of one length and one modified time are the same file [I]; --cache = keep the read of each
//          file (entries, macros, crc32) by size + time in the lib/cachestore store (--cache-dir: that store folder);
//          --progress f = { step: scan|read|mount|compare|cross|joint|done, done, total } written to f while it runs
//   --joint = the joint view checks (CONFLICT_JOINT_PARSE, CONFLICT_JOINT_REF, see jointPlan below) and the notes (info
//          CONFLICT_SHADER_SET, CONFLICT_MISSION_MOD, see setupNotes)
//   version gate: a named game, or an install that holds as64.exe, keeps the game's mod version gate (as64 too since 2026-11: VFS-48
//          VFS-54 VFS-59): a refused mod is CONFLICT_MOD_NOT_LOADED and not compared. --no-version-check compares it anyway
//   --exe as64|mowas_2|mowas2|goh  the game whose vfs view is read (lib/games): MoW:AS2 has no as64/core layer and no as64+; none = the
//          vfs default (as64 when as64.exe is in the folder, as before); --exe goh with no --game = the GoH install (games.install).
//          --clean under GoH: --out inside the GoH install is refused with the lib/writeguard line (ARSENAL does not write there).
//          --exe keeps the game's mod version gate: a mod that game skips is left out, info VFS_MOD_VERSION
//          GoH: mods of an equal Require count load in mod.info Priority order (lib/vfs, GHVFS-25), so MOD_ORDER_UNDECLARED is not made there
// source = vanilla (base + base N.pat) | mod id (its mod.info Delete, resource, N.pat); a source's file = its LAST record.
// "changed by S" = S's value differs from the effective value left by earlier sources (absent counts as a value).
// codes: CONFLICT_KEY_OVERRIDDEN (info: key changed by one mod, vanilla/earlier value lost)
//   WARN_CONFLICT_MOD_MOD (>=2 mods changed the same key differently; last wins)
//   CONFLICT_FILE_SHADOW (warn, VFS-41: mod replaces whole SDL file, drops top-level entries an earlier mod added/changed)
//   WARN_CONFLICT_OPAQUE_MOD_MOD (non-SDL file replaced by 2 mods with different bytes; earlier mod fully lost)
//   MOD_ORDER_UNDECLARED (warn, VFS-15: two mods hold different bytes for one file, no Require chain between them; one line per mod pair)
//   --itm: ITM_KEY / ITM_FILE (info: mod value identical to what it overrides). --clean: ITM_CLEANED (info), CLEAN_REPARSE (warn)
// clash kinds beyond one SDL file (2026-11; each seeded in test/mkseed.js, truth test/seed-truth.md):
//   CONFLICT_ENTRY_LOST (warn, VFS-01 VFS-41 [V]: no file type is merged across mods; a nested entry an earlier mod added or changed is
//     not in the winner's file)
//   CONFLICT_LNG_KEY_LOST / CONFLICT_LNG_KEY_DIFF (warn, LOC-01 LOC-18 [V] : a .lng at one path is replaced whole;
//     texts only the earlier mod has show as the raw key, texts both have show the winner's. GoH .pot the same by msgctxt, GHLOC-08 [I])
//   CONFLICT_LNG_KEY_CROSS (warn, LOC-04 LOC-22 [V] : one text key in two differently named .lng files of two mods;
//     the file read later wins [T which file that is]; a .lng's includes are followed, GoH .pot files are not compared here)
//   CONFLICT_ENTITY_NAME_DUP (warn mod/mod, info mod/vanilla, ENG-04 [V] : one .def name in two folders, the second is
//     ignored with "Entity redefinition"; the first mounted is kept [V across layers], so the EARLIER source wins [T between two mods])
//   CONFLICT_TEX_EXT_SHADOW (warn when the extension winner is not the later source, else info; FMT-04 [V] : the
//     last of .dds .tga .bmp .jpg .png is read, .ebm/.tex beat all, whatever the mod order)
//   CONFLICT_MACRO_LOST / CONFLICT_MACRO_DIFF (warn, SDL-17 SDL-18 PORT-61 [V] : the winner's copy of a shared file lacks
//     changes, a (define) an earlier mod added or changed; files of that mod that call it stop with "define not found" or expand otherwise [I])
//   CONFLICT_FILE_DELETED (warn, VFS-23 VFS-35 [V]: a later mod's mod.info Delete or patch removes a file an earlier mod ships)
//   CONFLICT_MOD_NOT_LOADED (warn, VFS-16 VFS-17 VFS-48 VFS-63 [V] : the game drops a mod of the list: missing Require, Require
//     cycle, version or mode gate, twin folder name. The VFS_ info line stays as before)
//   CONFLICT_PAK_LOOSE_SAME_MOD (info, VFS-08 VFS-55 [V] code [T] in game: one mod holds a file loose and in its own pak; scan order decides)
//   CONFLICT_PATCHED (info: the last mod lists every clashing mod as {Require} = a patch mod; its value or its copy of a file is the decided one, no warning.
//     What it leaves out (ENTRY_LOST, LNG_KEY_LOST, MACRO_LOST, FILE_SHADOW) still warns: a sub mod made for an older version of the mod it needs drops the new entries)
//   CONFLICT_FILE_MORE (warn: N more lines of one of the codes above in this file; --keys lists all)
// a block with a quoted name after its word and blocks inside ({card "x" {cost 1}}) is compared by that name, not by its position.
// --mod-dir <folder> (repeatable): a mod folder anywhere on disk, mounted last (lib/vfs modDirs): patchmod.js's patch mod before it is installed.
// --fmt json: one JSON object {order, modDirs, files, items:[{level, file, line, code, msg, d}]} (d = the parts of the line, for the GUI)
// --clean only omits ITM_FILE files (removing identical keys from a whole-file replace would DROP them: VFS-01).
// rows: VFS-22 (deleted records skipped), VFS-41
// Author: Imperator_Aug (ARSENAL, ia-c9cfc026)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const KEYS_SHOWN = 3;   // per file per kind, one pair of big mods reached 1,040,794 keys
const fs = require('fs'), path = require('path');
const vfs = require('../lib/vfs'), sdlx = require('../lib/sdlx'), { sameValue } = require('../lib/sdldiff');
const { createReport } = require('../lib/report');
const games = require('../lib/games'), sdlset = require('../lib/sdlset'), sdl = require('../lib/sdl'), { readText } = require('../lib/enc');
const names = require('../lib/names'), cipath = require('../lib/cipath');

const SDL_EXT = new Set(['.def', '.set', '.ext', '.inc', '.mi', '.info']);
const extOf = k => { const i = k.lastIndexOf('.'); return i < 0 ? '' : k.slice(i); };
// every text data type the game reads as SDL (lib/sdlset: .mdl .mtl .presets .weapon, set/stuff files, ...), VFS-41 VFS-42
// a mission's "map" file (no extension, up to tens of MB, entities told apart by position only) stays a whole-file compare as before:
// by key it took 32 s of 52 on a real pair (281 files, 8.7M entries) and a per-entity line says nothing a player can act on
const isSdlKey = k => SDL_EXT.has(extOf(k)) || (sdlset.isSdl(k) && !(k === 'map' || k.endsWith('/map')));
const isLng = k => k.endsWith('.lng'), isPot = k => k.endsWith('.pot');
const TEX_RANK = { '.dds': 1, '.tga': 2, '.bmp': 3, '.jpg': 4, '.png': 5, '.ebm': 8, '.tex': 9 };   // FMT-04: the highest is the one read
const BLOCKERS = new Set(['MOD_REQUIRE_MISSING', 'DEP_CYCLE', 'MOD_MODE', 'MOD_VERSION', 'MOD_VER_GATE', 'MOD_DUP_FOLDER', 'MODS_WIPED_VERSION']);
const LOC_ROOT = 'resource/interface/text/';
const sourceOf = layer => (layer === 'base' || /^patch \d+$/.test(layer)) ? 'vanilla' : String(layer).replace(/ patch \d+$/, '');
const isGame = id => id === 'vanilla' || id === 'as64+' || id === 'as64/core';
const globRe = g => new RegExp('^' + g.toLowerCase().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*').replace(/\?/g, '[^/]') + '$');

// lib/sdldiff flattenTree (sem = numbers by value, strings decoded, whitespace-insensitive), plus: a block with a quoted name right after
// its word and blocks inside ({card "x" {cost 1}}, {bone "body" {..}}) is one entry by that name ('card "x"'), so two mods that each add
// a card are two entries, not one entry with two values. '/' inside a name is shown as '\'
const SCALAR = new Set(['IDENT', 'STRING', 'INTEGER', 'FLOAT']);
const txt = n => n.k === 'STRING' ? '"' + n.text + '"' : n.text;
const semTok = n => n.k === 'INTEGER' || n.k === 'FLOAT' ? (Number.isFinite(n.value) ? '#' + n.value : n.text) : n.k === 'STRING' ? '"' + n.value : n.text;
const seg = s => s.replace(/\//g, '\\');
function flattenKeyed(root) {
  const out = new Map();
  (function walk(items, prefix, st) {
    let seen = null;
    for (let i = st; i < items.length; i++) {
      const n = items[i];
      if (n.k !== 'BLOCK' && n.k !== 'MOD') continue;
      const kids = n.items || [];
      let name, from = 0;
      if (n.k === 'MOD') name = 'mod ' + (n.not ? '!' : '') + n.name;
      else if (kids.length && SCALAR.has(kids[0].k)) { name = seg(txt(kids[0])); from = 1; }
      else name = '#';
      if (from === 1 && kids.length > 2 && kids[1].k === 'STRING' && kids.some(x => x.k === 'BLOCK' || x.k === 'MOD')) { name += ' ' + seg(txt(kids[1])); from = 2; }
      const base = prefix ? prefix + '/' + name : name;
      if (!seen) seen = new Map();
      const c = (seen.get(base) || 0) + 1; seen.set(base, c);
      const p = c > 1 ? base + '[' + c + ']' : base;
      let val = '', sem = '', any = false;
      for (let j = from; j < kids.length; j++) { const x = kids[j]; if (!SCALAR.has(x.k)) continue; if (any) { val += ' '; sem += ' '; } any = true; val += txt(x); sem += semTok(x); }
      out.set(p, { val, sem, line: n.line });
      walk(kids, p, from);
    }
  })(root.items, '', 0);
  return out;
}

// (define "name" body) lines of one file by its own text (lib/sdlwrite: no include or macro expansion): name -> { body, line }
function definesOf(buf) {
  const out = new Map();
  let t; try { t = require('../lib/sdlwrite').parse(buf); } catch (e) { return out; }
  (function walk(n) {
    for (const x of n.items || []) {
      if (x.type === 'list' && x.items.length >= 2 && /^define$/i.test(x.items[0].text || '') && x.items[1].type === 'string')
        out.set(String(x.items[1].text).replace(/^"|"$/g, '').toLowerCase(), { body: t.src.slice(x.items[1].end, x.end).replace(/\s+/g, ' ').trim(), line: t.src.slice(0, x.start).split('\n').length });
      if (x.items) walk(x);
    }
  })(t.root);
  return out;
}
// GoH .pot: msgctxt -> the entry's lines (fix/lib/lng potParse), as a flatten-like map
function potMap(buf) {
  const t = (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF ? buf.subarray(3) : buf).toString('utf8');
  const out = new Map(); let line = 1;
  for (const b of require('../fix/lib/lng').potParse(t).blocks) {
    if (b.key !== null && !out.has(b.key)) { const m = b.lines.filter(l => !/^#|^msgctxt/.test(l)).join(' '); out.set(b.key, { val: m, sem: m, line }); }
    line += b.lines.length + 1;
  }
  return out;
}
// mod.info Require list of a folder given by path (--mod-dir): names as lib/vfs reads them
function requiresOf(dir) {
  try {
    const mi = cipath.resolve(dir, 'mod.info', { cache: new Map() }) || path.join(dir, 'mod.info');
    const root = sdl.kids(sdl.parseLines(readText(mi, 'cp1251').lines), 'mod')[0];
    return root ? sdl.kids(root, 'Require').map(b => b.vals.length ? names.normalize(String(b.vals[0].v).split(':')[0]) : '').filter(Boolean) : [];
  } catch (e) { return []; }
}

const incCache = new Map();    // include key + record -> buffer (includes are re-read for every file otherwise)
// inc = [[include key, record | null]] the files the read opened; errs = [[line, code, msg]] what the strict reader said (both optional)
function parse(v, rec, key, buf, inc, errs, lookup) {
  const r = sdlx.read(buf, {
    file: key, key,
    open: (rk) => {
      const f = lookup ? lookup(rk.key) : v.files.get(rk.key);
      if (inc && !inc.some(x => x[0] === rk.key)) inc.push([rk.key, f || null]);
      if (!f) return null;
      let b = incCache.get(f); if (!b) { b = vfs.readRec(f); if (incCache.size > 4000) incCache.clear(); incCache.set(f, b); }
      return { buf: b, file: rk.key, key: rk.key };
    },
    onError: errs ? (file, line, code, msg) => { if (errs.length < 40) errs.push([file === key ? line : 0, code, String(msg || '').slice(0, 200) + (file === key ? '' : ' (in ' + file + ':' + line + ')')]); } : () => {},
  });
  return flattenKeyed(r.root);
}

// ---- speed (2026-11): what one run reads, and what is kept between runs
// reader(v, o) -> { same(a, b), flat(id, rec, key), buf(rec), save() }
//   same: two records hold the same bytes, the cheapest way that is sure: another length = no; two pak entries = size + crc32 of the
//     central directory; o.trustMtime: two loose files of one length and one modified time (to the ms, from the listings) = yes
//     [I: two copies of one mod keep their times; a file edited to the same length in the same ms would be missed]; else the crc32 of
//     each (a loose file's is kept in the cache by size + time), so a 2 GB texture is read once, not at every check.
//   flat: the entries of one text data file ({ map, defs, errs }: flattenKeyed / potMap, its (define)s, the reader's errors), from
//     o.cache when the file and every file it included are as they were (pak entry: size + crc; loose: size + time), else read now.
//   o.listings = lib/modtree scans (T) of the mounted mod folders: lib/vfs mounts from them (no stat per file) and they give the times.
//   o.cache = { get(src, key, sig), put(src, key, sig, patch), save() } (cacheOn below: one lib/cachestore entry per source and game)
const fwdLow = p => String(p).replace(/\\/g, '/').toLowerCase();
function reader(v, o) {
  const C = o.cache || null, zlib = require('zlib');
  const mtimes = new Map();
  for (const T of o.listings || []) { if (!T || !T.dir || !Array.isArray(T.files)) continue; const d = fwdLow(path.resolve(T.dir)).replace(/\/+$/, ''); for (const r of T.files) mtimes.set(d + '/' + String(r[0]).toLowerCase(), r[2]); }
  const mtOf = rec => rec.source === 'loose' && mtimes.size ? mtimes.get(fwdLow(rec.container).replace(/\/+$/, '') + '/' + fwdLow(rec.entry)) : undefined;
  const sigOf = rec => { if (!rec) return 'none'; if (rec.source === 'pak') return rec.ent && rec.ent.crc !== undefined ? 'P' + rec.ent.size + ':' + rec.ent.crc : null; const m = mtOf(rec); return m === undefined ? null : 'L' + rec.size + ':' + m; };
  const idOf = rec => sourceOf(rec.layer);
  const crcs = new Map();
  const crcOf = (rec, key) => {
    if (rec.source === 'pak' && rec.ent && rec.ent.crc !== undefined) return rec.ent.crc >>> 0;
    let c = crcs.get(rec); if (c !== undefined) return c;
    const sig = C && key ? sigOf(rec) : null, hit = sig ? C.get(idOf(rec), key, sig) : null;
    if (hit && typeof hit.c === 'number') c = hit.c;
    else { c = zlib.crc32(vfs.readRec(rec)) >>> 0; if (sig) C.put(idOf(rec), key, sig, { c }); }
    crcs.set(rec, c); return c;
  };
  const same = (a, b, key) => {
    if (a === b) return true;
    if (typeof a.size === 'number' && typeof b.size === 'number' && a.size !== b.size) return false;
    if (a.source === 'pak' && b.source === 'pak') return vfs.sameRec(a, b);
    if (o.trustMtime && a.source === 'loose' && b.source === 'loose') { const x = mtOf(a); if (x !== undefined && x === mtOf(b)) return true; }
    return crcOf(a, key) === crcOf(b, key);
  };
  const toMap = rows => { const m = new Map(); for (const r of rows) m.set(r[0], { val: r[1], sem: r.length > 3 ? r[3] : r[1], line: r[2] }); return m; };
  const flat = (id, rec, key, lookup) => {
    const pot = isPot(key), sig = C && !lookup ? sigOf(rec) : null;
    const hit = sig ? C.get(id, key, sig) : null;
    if (hit && hit.rows && (hit.inc || []).every(x => sigOf(v.files.get(x[0]) || null) === x[1])) return { map: toMap(hit.rows), defs: new Map((hit.defs || []).map(d => [d[0], { body: d[1], line: d[2] }])), errs: hit.errs || [], cached: true };
    const buf = vfs.readRec(rec), inc = [], errs = [];
    const map = pot ? potMap(buf) : parse(v, rec, key, buf, inc, errs, lookup);
    const defs = !pot && !isLng(key) && buf.includes('define') ? definesOf(buf) : new Map();
    if (sig && map.size <= 30000) {
      const incs = inc.map(x => [x[0], sigOf(x[1])]);
      if (incs.every(x => x[1])) C.put(id, key, sig, { rows: [...map].map(([p, x]) => x.sem === x.val ? [p, x.val, x.line] : [p, x.val, x.line, x.sem]), defs: [...defs].map(([n, d]) => [n, d.body, d.line]), errs, inc: incs });
    }
    return { map, defs, errs };
  };
  return { same, flat, mtOf, sigOf, save: () => { if (C) C.save(); } };
}
// the parse cache in a lib/cachestore store (root = the GUI's store folder, or the per-user one): one entry per game folder + exe +
// source (vanilla, as64/core, a mod id), { files: { key: { g: sig, c: crc32, rows, defs, errs, inc } } }, read at the first ask, written
// at the end when something was added. A file whose sig moved is replaced. Bump CACHE_VER when flattenKeyed or the row shape changes.
const CACHE_VER = 1, CACHE_SEC = 'conflicts.parse';
function cacheOn(root, gameDir, exe) {
  let S; try { S = require('../lib/cachestore').open(root ? { root } : {}); } catch (e) { return null; }
  const ident = id => ({ game: fwdLow(path.resolve(gameDir)), exe: exe || '', src: id }), all = new Map();
  const of = id => { let e = all.get(id); if (!e) { let val = null; try { const r = S.get(CACHE_SEC, CACHE_VER, ident(id), {}); val = r && r.value; } catch (x) { /* a miss */ } all.set(id, e = { files: (val && val.files) || {}, dirty: false }); } return e; };
  return {
    root: S.root,
    get(id, key, sig) { const f = of(id).files[key]; return f && f.g === sig ? f : null; },
    put(id, key, sig, patch) { const e = of(id); let f = e.files[key]; if (!f || f.g !== sig) f = e.files[key] = { g: sig }; Object.assign(f, patch); e.dirty = true; },
    save() { for (const [id, e] of all) if (e.dirty) { try { S.put(CACHE_SEC, CACHE_VER, ident(id), {}, { files: e.files }); } catch (x) { /* best effort */ } e.dirty = false; } },
  };
}

const reaches = (reqs, from, to, seen = new Set()) => {        // from requires to, directly or through other mods
  if (seen.has(from)) return false; seen.add(from);
  for (const r of reqs.get(from) || []) if (r === to || reaches(reqs, r, to, seen)) return true;
  return false;
};

function check(o) {
  const rep = createReport(), rows = [], items = [];
  const exe = o.exe ? games.exeOf(o.exe) : undefined;
  if (o.exe && !exe) throw new Error('--exe must be one of as64|mowas_2|mowas2|goh');
  if (!o.gameDir && exe === 'goh') o.gameDir = games.install('goh').dir;
  if (!o.gameDir) throw new Error('need --game dir');
  // a named non-AS64 game keeps the vfs version gate: a mod that game skips is left out and shown as VFS_MOD_VERSION
  // as64 (named, or an install that holds as64.exe) keeps its gate too (VFS-48 VFS-54 [V] ): a mod as64 refuses
  // is CONFLICT_MOD_NOT_LOADED, not compared as if loaded. Off only for a plain folder with no game named (fixtures), or o.noGate
  const gate = !o.noGate && (exe ? true : !!cipath.resolve(o.gameDir, 'as64.exe', { cache: new Map() }));
  const prog = typeof o.progress === 'function' ? o.progress : () => {};
  prog('mount', 0, 0);
  const v = o.view || vfs.build(Object.assign({ gameDir: o.gameDir, mods: o.mods || [], disableVersionControl: !gate }, exe ? { exe } : {}, o.modDirs && o.modDirs.length ? { modDirs: o.modDirs } : {}, o.listings && o.listings.length ? { listings: o.listings } : {}));
  const rd = reader(v, o), same = rd.same;
  const flatOf = (s, key) => { if (!s.map) { const r = rd.flat(s.id, s.rec, key); s.map = r.map; s.defs = r.defs; s.errs = r.errs; } return s.map; };
  const bufOf = s => s.buf || (s.buf = vfs.readRec(s.rec));
  const clashFiles = [];                              // text data files two mods hold with other content (the joint checks start here)
  // one line = one item: the text report as before, and the parts (d) for --fmt json
  const emit = (level, file, line, code, msg, d) => { if (level === 'info') rep.info(file, line, code, msg); else rep.add(file, line, code, msg); items.push({ level, file, line, code, msg, d: d || {} }); };
  for (const p of v.problems) if (p.code === 'MOD_UNKNOWN') { const m = /Mod '([^']*)'/.exec(p.msg || ''); throw new Error('mod not found: ' + (m ? m[1] : p.msg) + ' (no <game>/mods/<name>/mod.info)'); }
  for (const p of v.problems) if (p.code === 'MODDIR_MISSING') throw new Error('--mod-dir: ' + p.msg);
  for (const p of v.problems) if (p.level === 'error') emit('info', p.where || '.', 0, 'VFS_' + p.code, p.msg, { mod: (/^mod "([^"]*)"/.exec(p.msg || '') || [])[1] || path.basename(String(p.where || '')) });
  // load blockers first (VFS-16 VFS-17 VFS-48 VFS-63 [V] ): a mod the game drops is in no clash below, and that is the worst clash
  for (const p of v.problems) if (BLOCKERS.has(p.code)) emit('warn', p.where || '.', 0, 'CONFLICT_MOD_NOT_LOADED', `${p.msg}. The game does not load it, so nothing of it is compared here (${p.code})`, { why: p.code, mod: (/^mod "([^"]*)"/.exec(p.msg || '') || [])[1] || path.basename(String(p.where || '')) });
  const re = o.file ? globRe(o.file) : null;
  const keys = new Set(); for (const s of v.shadows) keys.add(s.key);
  let files = 0, cleaned = 0;
  let reqs = null; const unordered = new Map();     // VFS-15: mod -> its Require list; pair -> { a, b, n, key }
  const needReqs = () => { if (!reqs) { reqs = new Map(); for (const [id, m] of vfs.discover(o.gameDir, [], { plus: v.exe === 'as64', items: v.exe === 'goh' })) reqs.set(id, m.requires); for (const d of v.modDirs || []) reqs.set(d.id, requiresOf(d.dir)); } return reqs; };
  // a patch mod: the winner lists every other mod of the clash as {Require} (directly or through others)
  const patches = (w, others) => !isGame(w) && others.length > 0 && others.every(x => x === w || reaches(needReqs(), w, x));
  const itmFiles = new Set();
  const wantItm = o.itm || o.clean;
  try {
    const keyList = [...keys].sort(); let kn = 0, kt = Date.now();
    for (const key of keyList) {
      if (++kn % 200 === 0 && Date.now() - kt > 150) { kt = Date.now(); prog('compare', kn, keyList.length); }
      if (re && !re.test(key)) continue;
      // per-source last record, in first-appearance order
      const src = [], chain = v.chain(key);
      for (const r of chain) {
        const id = sourceOf(r.layer);
        const e = src.find(s => s.id === id);
        // VFS-08 VFS-55: one mod holds this file twice, loose and in one of its paks (not its N.pat, which is meant to override)
        if (e && !isGame(id) && !r.deleted && !e.rec.deleted && r.layer === e.rec.layer && r.source !== e.rec.source && !e.twice) {
          e.twice = true;
          emit('info', key, 0, 'CONFLICT_PAK_LOOSE_SAME_MOD', `${id} holds this file loose and in a pak of its own; the ${r.source === 'pak' ? 'pak' : 'loose'} copy is the one read here (folder scan order decides, lim VFS-08 VFS-55). Keep one copy`, { mod: id, read: r.source });
        }
        if (e) e.rec = r; else src.push({ id, rec: r });
      }
      if (src.length < 2) continue;
      const live = src.filter(s => !s.rec.deleted), mlive = live.filter(s => !isGame(s.id));
      // VFS-23 VFS-35: the last record is a delete by one mod, and another mod ships the file
      { const last = src[src.length - 1];
        if (last.rec.deleted && !isGame(last.id)) for (const s of live) if (!isGame(s.id) && s.id !== last.id)
          emit('warn', key, 0, 'CONFLICT_FILE_DELETED', `${last.id} removes this file (${last.rec.how || 'delete'}) and ${s.id} ships it: the game does not find it; what of ${s.id} reads it fails to load (lim VFS-23)`, { by: last.id, loser: s.id }); }
      const lng = isLng(key), pot = isPot(key);
      const isSdl = isSdlKey(key) || lng || pot;
      // hash short-circuit: pak entries carry size+crc32 in the central directory -> identical across all live sources = no
      // conflict, skip without inflating/parsing (--itm/--clean still need ITM_FILE, so only when neither is requested)
      // o.modsOnly: a file only one of the mods holds is no clash between mods (its CONFLICT_KEY_OVERRIDDEN info lines are not made)
      if (o.modsOnly && mlive.length < 2) continue;
      files++;
      try {
        if (!wantItm && live.length >= 2 && live.every((s, i) => i === 0 || same(live[0].rec, s.rec, key))) continue;
        // the mods agree with each other (two copies of one file): nothing one of them takes from the other
        if (o.modsOnly && !wantItm && mlive.every((s, i) => i === 0 || same(mlive[0].rec, s.rec, key))) continue;
        if (wantItm) live.forEach(bufOf);
      } catch (e) { emit('info', key, 0, 'CONFLICT_UNREADABLE', e.message); continue; }
      const lastId = live.length ? live[live.length - 1].id : '';
      // VFS-15: two mods hold different bytes for this file and no Require chain orders them (dependency sort is unstable on equal counts)
      { const ms = live.filter(s => !isGame(s.id));
        for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
          if (v.exe === 'goh') break;            // GHVFS-25 [V]: GoH sorts stably (Require count, Priority, list order): the order is always defined
          if (same(ms[i].rec, ms[j].rec, key)) continue;
          needReqs();
          if (reaches(reqs, ms[i].id, ms[j].id) || reaches(reqs, ms[j].id, ms[i].id)) continue;
          if (lastId !== ms[i].id && lastId !== ms[j].id && patches(lastId, [ms[i].id, ms[j].id])) continue;   // a patch mod decides this file
          const pk = ms[i].id + '\u0000' + ms[j].id; let e = unordered.get(pk);
          if (!e) unordered.set(pk, e = { a: ms[i].id, b: ms[j].id, n: 0, key }); e.n++;
        } }
      // ITM_FILE: live source byte-equal to previous live source
      if (wantItm) for (let i = 1; i < live.length; i++) {
        if (live[i].id === 'vanilla') continue;
        const same = live[i].buf.equals(live[i - 1].buf);
        let sameKeys = false, A, B;
        if (!same && isSdl && !pot) { try { A = flatOf(live[i - 1], key); B = flatOf(live[i], key);
          sameKeys = A.size === B.size && [...A].every(([p, x]) => B.has(p) && sameValue(B.get(p), x)); } catch (e) { /* ignore */ } }
        if (same || sameKeys) {
          if (o.itm) emit('info', key, 0, 'ITM_FILE', `${live[i].id}: ${same ? 'byte-identical' : 'same keys/values'} to ${live[i - 1].id}'s file; remove it`);
          if (o.clean === live[i].id) itmFiles.add(key);
        }
      }
      if (!isSdl) {
        const mods = live.filter(s => s.id !== 'vanilla');
        if (mods.length >= 2) {
          const last = mods[mods.length - 1];
          const pw = patches(last.id, mods.slice(0, -1).map(s => s.id));
          for (let i = 0; i < mods.length - 1; i++) {
            if (same(mods[i].rec, last.rec, key)) continue;
            if (pw) emit('info', key, 0, 'CONFLICT_PATCHED', `${last.id} is a patch mod over ${mods[i].id} (it lists it as {Require}) and holds the copy of this file that is used`, { winner: last.id, loser: mods[i].id });
            else emit('warn', key, 0, 'WARN_CONFLICT_OPAQUE_MOD_MOD', `${mods[i].id} (${mods[i].rec.size}b) replaced by ${last.id} (${last.rec.size}b); ${mods[i].id}'s version fully lost`, { winner: last.id, loser: mods[i].id });
          }
        }
        continue;
      }
      if (live.length < 2) continue;
      if (live.every((s, i) => i === 0 || same(live[0].rec, s.rec, key))) continue;
      let ok = true;
      for (const s of live) if (!s.map) { try { flatOf(s, key); } catch (e) { emit('info', key, 0, 'CONFLICT_UNREADABLE', `${s.id}: ${e.message}`); ok = false; break; } }
      if (!ok) continue;
      if (mlive.length >= 2) clashFiles.push({ key, live });
      const text = lng || pot;
      const shownKey = p => text ? p.replace(/^"?tags"?\//i, '').replace(/"/g, '') : p;
      // SDL-17 SDL-18 PORT-61: (define)s of a file both mods ship. The winner's copy lacks or changes one an earlier mod added or changed
      if (!text) {
        const ms = live.filter(s => !isGame(s.id));
        if (ms.length >= 2 && ms.some(s => s.defs.size)) {
          const w = ms[ms.length - 1], wd = w.defs, base = isGame(live[0].id) ? live[0].defs : new Map();
          for (const m of ms.slice(0, -1)) {
            const pm = patches(w.id, [m.id]);                             // a patch mod: a changed body is its decision, a missing macro still breaks the other mod
            for (const [nm, d] of m.defs) {
              const b = base.get(nm), x = wd.get(nm);
              if (b && b.body === d.body) continue;                       // the earlier mod left the game's macro as it is
              if (!x) emit('warn', key, d.line, 'CONFLICT_MACRO_LOST', `macro "${nm}" is in ${m.id}'s copy of this file and not in ${w.id}'s, which is the one read: every file that calls it stops loading with "define not found" (lim SDL-17)`, { key: nm, loser: m.id, winner: w.id });
              else if (x.body !== d.body && !pm) emit('warn', key, x.line, 'CONFLICT_MACRO_DIFF', `macro "${nm}" has another body in ${w.id}'s copy of this file than in ${m.id}'s; ${w.id}'s is the one read, so ${m.id}'s files that call it get other values (lim PORT-61)`, { key: nm, loser: m.id, winner: w.id });
            }
          }
        }
      }
      // union of paths, first-seen order
      const paths = []; const seen = new Set();
      for (const s of live) for (const p of s.map.keys()) if (!seen.has(p)) { seen.add(p); paths.push(p); }
      const parents = new Set(); for (const p of paths) { let i = p.lastIndexOf('/'); while (i > 0) { parents.add(p.slice(0, i)); i = p.lastIndexOf('/', i - 1); } }
      const byTop = new Map(); for (const q of paths) { const i = q.indexOf('/'); if (i > 0) { const t = q.slice(0, i); let a = byTop.get(t); if (!a) byTop.set(t, a = []); a.push(q); } }
      const shadowDrops = new Map();           // mod id -> {n, from:Set}
      let nMM = 0, nOv = 0;                    // keys of this file past KEYS_SHOWN are only counted
      const more = new Map();                  // code -> lines of it in this file (the new codes; past KEYS_SHOWN only counted)
      const few = code => { const n = (more.get(code) || 0) + 1; more.set(code, n); return o.keys || n <= KEYS_SHOWN; };
      const lostUnder = new Set();             // paths whose loss is said once, at the topmost entry
      const win = live.length - 1;
      for (const p of paths) {
        const vals = live.map(s => s.map.get(p));
        const container = parents.has(p) && vals.every(x => !x || x.val === '');   // pure container: children carry the diff
        let eff = vals[0], changers = [], effSrc = live[0].id;
        const itmKeys = [];
        for (let i = 1; i < live.length; i++) {
          const cur = vals[i], same = (!cur && !eff) || sameValue(cur, eff);
          if (same) { if (cur && wantItm && live[i].id !== 'vanilla') itmKeys.push(live[i].id); }
          else changers.push(i);
          // absent in a whole-file replace = removed: effective becomes absent
          eff = cur; effSrc = live[i].id;
        }
        if (o.itm && !container) for (const id of itmKeys) { const n = live.findIndex(s => s.id === id); const x = vals[n]; if (x && !itmFiles.has(key)) emit('info', key, x.line, 'ITM_KEY', `${id}: ${p} identical to what it overrides`); }
        { const up = p.lastIndexOf('/'); if (up > 0 && lostUnder.has(p.slice(0, up))) { lostUnder.add(p); continue; } }
        if (!changers.length) continue;
        const modCh = changers.filter(i => live[i].id !== 'vanilla');
        const quiet = container;
        const shown = (x) => x ? (x.val === '' ? '{}' : x.val) : '(absent)';
        const line = (vals[win] || vals.slice().reverse().find(Boolean) || {}).line || 0;
        const desc = live.map((s, i) => `${s.id}=${shown(vals[i])}`).join(' | ');
        const distinctMods = modCh.length >= 2 && new Set(modCh.map(i => shown(vals[i]))).size >= 1;
        const top = p.split('/')[0], dropped = !vals[win] && !live[win].map.has(top);   // covered by CONFLICT_FILE_SHADOW
        // an entry an earlier mod added or changed and the winner's file does not hold (nested: top-level ones are the file shadow)
        const base = isGame(live[0].id) ? vals[0] : undefined;
        const givers = []; if (!vals[win]) for (let i = 1; i < win; i++) if (vals[i] && !isGame(live[i].id) && !sameValue(vals[i], base)) givers.push(i);
        const lost = givers.length > 0 && !dropped && !isGame(live[win].id);
        const others = modCh.filter(i => i !== win).map(i => live[i].id).concat(givers.map(i => live[i].id));
        const pw = modCh.length >= 2 || lost ? patches(live[win].id, others) : false;
        const d = { key: shownKey(p), values: live.map((s, i) => ({ src: s.id, val: shown(vals[i]) })), winner: live[win].id, losers: [...new Set(others)] };
        if (!quiet && o.fmt && o.fmt !== 'json') rows.push({ file: key, key: p, values: d.values, winner: live[win].id, kind: modCh.length >= 2 ? (dropped ? 'SHADOWED' : lost ? 'LOST' : 'MOD_MOD') : 'OVERRIDDEN' });
        if (lost) {
          lostUnder.add(p);
          const g = live[givers[givers.length - 1]], lv = vals[givers[givers.length - 1]];
          // also under a patch mod (a mod that lists the others as {Require}): what it leaves out is still gone in game, e.g. a sub mod made for an older version of the mod it needs
          if (text) { if (few('CONFLICT_LNG_KEY_LOST')) emit('warn', key, lv.line, 'CONFLICT_LNG_KEY_LOST', `text "${shownKey(p)}" is in ${g.id}'s file and not in ${live[win].id}'s, which replaces the file whole: the game shows the bare key name (lim LOC-01)`, d); }
          else if (few('CONFLICT_ENTRY_LOST')) emit('warn', key, lv.line, 'CONFLICT_ENTRY_LOST', `${p}: in ${g.id}'s file (${shown(lv)}), not in ${live[win].id}'s, which replaces the file whole; it is gone in game (lim VFS-41)`, d);
        } else if (quiet) { /* shadow check below only */ }
        else if (modCh.length >= 2 && distinctMods && !dropped) {
          if (pw) { if (o.keys || nOv++ < KEYS_SHOWN) emit('info', key, line, 'CONFLICT_PATCHED', `${shownKey(p)}: ${desc}; decided by the patch mod ${live[win].id}`, d); }
          else if (text) { if (few('CONFLICT_LNG_KEY_DIFF')) emit('warn', key, line, 'CONFLICT_LNG_KEY_DIFF', `text "${shownKey(p)}" differs: ${desc}; the game shows ${live[win].id}'s`, d); }
          else if (o.keys || nMM++ < KEYS_SHOWN) emit('warn', key, line, 'WARN_CONFLICT_MOD_MOD', `${p}: ${desc}; winner ${live[win].id}`, d);
        }
        else if (o.keys || nOv++ < KEYS_SHOWN) emit('info', key, line, 'CONFLICT_KEY_OVERRIDDEN', `${p}: ${desc}; winner ${live[win].id}`, d);
        // shadow: a later mod drops a top-level entry that an earlier mod added/changed (and no later mod puts it back)
        if (p.indexOf('/') < 0 && !vals[win]) for (const i of modCh) {
          if (vals[i]) continue;
          const earlier = []; for (let j = 1; j < i; j++) if (live[j].id !== 'vanilla' && vals[j]) earlier.push(live[j].id);
          const prior = vals.slice(0, i).reverse().find(Boolean);
          let touched = earlier.length && (!vals[0] || !sameValue(vals[0], prior));
          if (!touched && earlier.length) for (const q of byTop.get(p) || []) { const a = live[0].map.get(q), b = live.find(x => x.id === earlier[0]).map.get(q); if (!a !== !b || (a && !sameValue(a, b))) { touched = true; break; } }
          if (touched) { let d2 = shadowDrops.get(live[i].id); if (!d2) shadowDrops.set(live[i].id, d2 = { n: 0, from: new Set(), ex: p }); d2.n++; earlier.forEach(x => d2.from.add(x)); }
        }
      }
      if (nMM > KEYS_SHOWN) emit('warn', key, 0, 'WARN_CONFLICT_FILE_KEYS', `${nMM} keys differ between mods in this file, first ${KEYS_SHOWN} listed. change: --file on it with --keys for all`, { n: nMM, of: 'WARN_CONFLICT_MOD_MOD', winner: lastId });
      if (nOv > KEYS_SHOWN) emit('info', key, 0, 'CONFLICT_FILE_OVERRIDES', `${nOv} keys overridden in this file, first ${KEYS_SHOWN} listed. --keys for all`, { n: nOv });
      if (!o.keys) for (const [code, n] of more) if (n > KEYS_SHOWN) emit('warn', key, 0, 'CONFLICT_FILE_MORE', `${n} ${code} lines in this file, first ${KEYS_SHOWN} listed. --keys for all`, { n, of: code, winner: lastId });
      for (const [id, d2] of shadowDrops) emit('warn', key, 0, 'CONFLICT_FILE_SHADOW', `${id} replaces file and drops ${d2.n} top-level entries added/changed by ${[...d2.from].join(', ')} (e.g. ${d2.ex}); their edits are lost (lim VFS-41)`, { winner: id, losers: [...d2.from], n: d2.n, key: d2.ex });
    }
    prog('cross', 0, 0);
    if (!o.file || o.cross) crossPath(v, emit, patches, o, rd);
    for (const e of [...unordered.values()].sort((x, y) => x.key < y.key ? -1 : x.key > y.key ? 1 : 0))
      emit('warn', e.key, 0, 'MOD_ORDER_UNDECLARED', `${e.a} and ${e.b} both replace ${e.n} file${e.n > 1 ? 's' : ''} (first here) with different content and neither lists the other as {Require}; the engine's dependency sort does not guarantee their order. Add {Require "${e.a}"} to ${e.b} (or the reverse) in mod.info (lim VFS-15)`, { a: e.a, b: e.b, n: e.n });
    if (o.clean) cleaned = doClean(v, o, rep, itmFiles);
    rd.save();
  } finally { if (!o.keepOpen) vfs.closeRecs(); }
  prog('done', keys.size, keys.size);
  return { rep, files, rows, cleaned, items, order: v.mods, modDirs: v.modDirs || [], view: v, clashFiles, emit, rd };
}

// ---- joint view checks (2026-11): what one mod breaks for another beyond a lost macro or a deleted file of its own.
// The view of "mod M alone" is read off the joint view's record chains (the last record of the game or of M; no second mount).
//   CONFLICT_JOINT_PARSE (warn): a text data file two mods hold, as the game reads it (the last mod's copy): the strict reader (lib/sdlx,
//     the one sdllint uses) gives an error with all the mods loaded that it does not give with that mod alone: an include or a macro
//     of it now comes from another mod's file, or is gone. d: { loser: the mod whose file breaks, winner: the mod that causes it,
//     key: the reader's code, why: its text, other: the include that changed, otherOf: the mod whose copy of it the file
//     read with its mod alone ('' = the game's own) }
//   CONFLICT_JOINT_REF (warn, [I] by name): a file of mod A names something that is there with A alone and gone with the others loaded:
//     an entity, a texture, a sound or an include file another mod removes (mod.info Delete, patch), a macro or a named entry of a
//     shared file that the copy read by the game no longer holds. Found by name (a quoted word of A's own text data files, read 32 at a
//     time), so a word that only looks like the name is listed too. d: { kind: entity|texture|sound|include|macro|entry, key: the name,
//     loser: A, winner: the mod that removes it, other: where it was, n: places in A that name it }
//   Scope: the clash set only (files two mods hold with other content, files a mod deletes). A game entry one mod drops from a file the
//   other mod does not ship is not looked at (that is each mod's own override, see overdiff).
function aloneRec(v, id, key) {
  const ch = v.chain(key); let r = null;
  for (const x of ch) { const s = sourceOf(x.layer); if (isGame(s) || s === id) r = x; }
  return r && !r.deleted ? r : null;
}
const quotedOf = seg0 => { const m = /"([^"]+)"/.exec(seg0); return m ? m[1].toLowerCase() : ''; };
const baseOf = k => k.slice(k.lastIndexOf('/') + 1);
function jointPlan(v, emit, o, rd, clashFiles) {
  const mods = [...v.mods, ...(v.modDirs || []).map(d => d.id)].filter(m => !isGame(m));
  const L = new Map();     // mod A -> Map name -> { kind, by, file, line }
  const lose = (a, name, kind, by, file, line) => { if (!name || name.length < 3 || /^[\d.\-]+$/.test(name)) return; let m = L.get(a); if (!m) L.set(a, m = new Map()); if (!m.has(name)) m.set(name, { kind, by, file, line: line || 0 }); };
  // 1 parse: the winner's copy of a clash file, joint view against that mod alone
  for (const cf of clashFiles) {
    const key = cf.key; if (isLng(key) || isPot(key)) continue;
    const ms = cf.live.filter(s => !isGame(s.id)), W = ms[ms.length - 1];
    if (W.errs && W.errs.length) {
      const alone = [], inc = [];
      try { rd.flat(W.id, W.rec, key, k => aloneRec(v, W.id, k)).errs.forEach(e => alone.push(e[1] + '|' + e[2])); } catch (e) { /* unreadable alone too */ }
      const fresh = W.errs.filter(e => !alone.includes(e[1] + '|' + e[2]));
      if (fresh.length) {
        try { parse(v, W.rec, key, vfs.readRec(W.rec), inc, []); } catch (e) { /* the errors stand */ }
        const moved = inc.map(x => ({ key: x[0], now: x[1], was: aloneRec(v, W.id, x[0]) })).filter(x => x.now !== x.was);
        const who = moved.length ? (moved[0].now ? sourceOf(moved[0].now.layer) : (v.chain(moved[0].key).filter(r => r.deleted).map(r => sourceOf(r.layer)).pop() || '')) : '';
        fresh.slice(0, o.keys ? 40 : KEYS_SHOWN).forEach(e => emit('warn', key, e[0], 'CONFLICT_JOINT_PARSE', `${W.id}'s copy of this file is the one read. With ${W.id} alone it reads clean; with the other mods loaded the reader stops here: ${e[1]} ${e[2]}` + (moved.length ? `. Its include ${moved[0].key} now comes from ${who || 'nowhere'}` : ''), { loser: W.id, winner: who, key: e[1], why: e[2], other: moved.length ? moved[0].key : '', otherOf: moved.length && moved[0].was && !isGame(sourceOf(moved[0].was.layer)) ? sourceOf(moved[0].was.layer) : '' }));
      }
    }
    // 2 names the winner's copy no longer holds: macros and named entries an earlier mod added or changed
    const base = isGame(cf.live[0].id) ? cf.live[0] : null;
    for (const M of ms.slice(0, -1)) {
      for (const [nm, d] of M.defs || []) { const b = base && base.defs.get(nm); if (!(b && b.body === d.body) && !W.defs.has(nm)) lose(M.id, nm, 'macro', W.id, key, d.line); }
      for (const [p, x] of M.map) {
        if (W.map.has(p)) continue;
        const up = p.lastIndexOf('/'); if (up > 0 && !W.map.has(p.slice(0, up))) continue;           // said once, at the topmost lost entry
        const b = base && base.map.get(p); if (b && sameValue(b, x)) continue;                       // the game's entry, left as it was
        lose(M.id, quotedOf(p.slice(up + 1)), 'entry', W.id, key, x.line);
      }
    }
  }
  // 3 files another mod removes: an entity, a picture, a sound, an include
  const ents = new Set(), texs = new Set();
  for (const key of v.files.keys()) { const e = extOf(key); if (e === '.def' && key.startsWith('resource/entity/')) ents.add(baseOf(key)); else if (TEX_RANK[e]) texs.add(key.slice(0, -e.length)); }
  const gone = new Map();
  for (const s of v.shadows) if (s.by.deleted && !isGame(sourceOf(s.by.layer)) && !v.files.has(s.key)) gone.set(s.key, sourceOf(s.by.layer));
  for (const [key, by] of gone) {
    const e = extOf(key), b = baseOf(key);
    let kind = '', name = '';
    if (e === '.def' && key.startsWith('resource/entity/')) { if (ents.has(b)) continue; kind = 'entity'; name = b.slice(0, -4); }
    else if (TEX_RANK[e]) { if (texs.has(key.slice(0, -e.length))) continue; kind = 'texture'; name = b.slice(0, -e.length); }
    else if (key.startsWith('resource/sound/')) { kind = 'sound'; name = e ? b.slice(0, -e.length) : b; }
    else if (isSdlKey(key)) { kind = 'include'; name = b; }
    else continue;
    for (const a of mods) if (a !== by && aloneRec(v, a, key)) lose(a, name, kind, by, key, 0);
  }
  return L;
}
// the places in mod A's own text data files that name a lost name. Loose files are read 32 at a time (PERF L4), pak entries in place
async function jointRefs(v, emit, o, L, prog) {
  const MAXF = 4 << 20, CONC = 32;
  for (const [a, names] of L) {
    const list = [];
    for (const [key, rec] of v.files) if (sourceOf(rec.layer) === a && isSdlKey(key) && !(rec.size > MAXF)) list.push([key, rec]);
    const hits = new Map();   // name -> [{ key, line }]
    const scan = (key, buf) => {
      if (!buf.includes(34)) return;
      const t = buf.toString('latin1'), re = /"([^"\r\n]{3,160})"/g; let m, ln = 1, at = 0;
      while ((m = re.exec(t))) {
        const s = m[1].toLowerCase(); let x = names.get(s), nm = s;
        if (x && x.kind !== 'entity' && x.kind !== 'entry' && x.kind !== 'macro') x = null;
        if (!x) {
          const b = s.slice(Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')) + 1), d = b.lastIndexOf('.'), st = d > 0 ? b.slice(0, d) : b;
          for (const c of [b, st]) { const y = names.get(c); if (y && (y.kind === 'include' ? c === b : y.kind === 'texture' || y.kind === 'sound')) { x = y; nm = c; break; } }
        }
        if (!x || x.file === key) continue;
        if (x.kind === 'macro' && !/\(\s*$/.test(t.slice(Math.max(0, m.index - 8), m.index))) continue;
        const ls = t.lastIndexOf('\n', m.index) + 1; if (/^\s*;/.test(t.slice(ls, m.index))) continue;       // a comment line
        for (; at < m.index; at++) if (t.charCodeAt(at) === 10) ln++;
        let h = hits.get(nm); if (!h) hits.set(nm, h = []); if (h.length < 200) h.push({ key, line: ln });
      }
    };
    let done = 0;
    const loose = list.filter(x => x[1].source === 'loose');
    for (const x of list) if (x[1].source !== 'loose') { try { scan(x[0], vfs.readRec(x[1])); } catch (e) { /* unreadable: skipped */ } done++; }
    for (let i = 0; i < loose.length; i += CONC) {
      const part = loose.slice(i, i + CONC);
      const bufs = await Promise.all(part.map(x => fs.promises.readFile(path.join(x[1].container, x[1].entry)).catch(() => null)));
      bufs.forEach((b, j) => { if (b) scan(part[j][0], b); });
      done += part.length; if (prog) prog('joint', done, list.length);
    }
    const WORD = { entity: 'entity', texture: 'picture', sound: 'sound', include: 'include file', macro: 'macro', entry: 'entry' };
    for (const [nm, h] of [...hits].sort((x, y) => x[0] < y[0] ? -1 : 1)) {
      const x = names.get(nm);
      const why = x.kind === 'macro' || x.kind === 'entry' ? `${x.by}'s copy of ${x.file} is the one read and does not hold it` : `${x.by} removes ${x.file}`;
      h.slice(0, o.keys ? 200 : KEYS_SHOWN).forEach(r => emit('warn', r.key, r.line, 'CONFLICT_JOINT_REF', `${WORD[x.kind]} "${nm}" is named here by ${a}. With ${a} alone it is there; with ${x.by} loaded it is gone: ${why}. ${h.length} place${h.length > 1 ? 's' : ''} in ${a} name it (found by name)`, { kind: x.kind, key: nm, loser: a, winner: x.by, other: x.file, otherLine: x.line, n: h.length }));
    }
  }
}
// plain notes about what the picked mods bring that no file compare covers (info lines, one per mod):
//   CONFLICT_SHADER_SET: the mod ships shader files (resource/shader/**). The game keeps ONE compiled shader cache whatever the mod
//     list (VFS-56 [V]): the first list to compile a shader wins until the cache is cleared; part of a shader set breaks it (VFS-57)
//   CONFLICT_MISSION_MOD: a map of the mod holds its own mod/ folder (resource/map/**/mod/**). While that mission runs its files lie
//     over resource/ and beat every active mod (VFS-33 [V]), whatever the order worked out here
// d: { mod, n: files, where: the first one }. Read off the view: the winning file of each path and the files another mod covers
function setupNotes(v, emit) {
  const sh = new Map(), mm = new Map();
  const see = (key, rec) => {
    if (!rec || rec.deleted) return; const id = sourceOf(rec.layer); if (isGame(id)) return;
    if (key.startsWith('resource/shader/')) { const x = sh.get(id) || { n: 0, where: key }; x.n++; sh.set(id, x); }
    else if (key.startsWith('resource/map/')) { const m = /^(resource\/map\/.+?\/mod)\//.exec(key); if (m) { const x = mm.get(id) || { n: 0, where: m[1] }; x.n++; mm.set(id, x); } }
  };
  for (const [key, rec] of v.files) see(key, rec);
  for (const s of v.shadows) if (s.over) see(s.key, s.over);
  for (const [id, x] of sh) emit('info', x.where, 0, 'CONFLICT_SHADER_SET', `${id} ships ${x.n} shader file${x.n > 1 ? 's' : ''}. The game keeps one compiled shader cache for every mod list (VFS-56): after a change of the mod list, old compiled shaders may stay in use until the cache is cleared; a part of a shader set does not compile (VFS-57)`, { mod: id, n: x.n, where: x.where });
  for (const [id, x] of mm) emit('info', x.where, 0, 'CONFLICT_MISSION_MOD', `${id} has a mission with its own mod/ folder (${x.n} file${x.n > 1 ? 's' : ''}). While that mission runs, those files lie over the game data and beat every mod of the list (VFS-33)`, { mod: id, n: x.n, where: x.where });
}
// before the compare: the crc32 of every loose file that two of the listed mod folders hold with one length (and another time, under
// o.trustMtime), read 16 at a time through the thread pool and put into o.cache, so the compare itself reads none of them one by
// one (two copies of a 91k-file mod: 134 of 197 s were open + read on the loop). Needs o.cache and o.listings; a file over 32 MB
// is left to the compare. The source id of a folder is its name in lowercase (the mod id); a folder mounted under another id only
// loses the head start. Step 'read' of o.progress
async function crcWarm(o) {
  const C = o.cache, Ts = (o.listings || []).filter(T => T && T.dir && Array.isArray(T.files));
  if (!C || Ts.length < 2) return 0;
  const zlib = require('zlib'), by = new Map(), prog = typeof o.progress === 'function' ? o.progress : null, MAXB = 32 << 20, CONC = 16;
  Ts.forEach((T, i) => { for (const r of T.files) { const k = String(r[0]).replace(/\\/g, '/').toLowerCase(); if (!k.startsWith('resource/')) continue; let a = by.get(k); if (!a) by.set(k, a = []); a.push([i, r]); } });
  const todo = [];
  for (const [k, a] of by) {
    if (a.length < 2) continue;
    for (const [i, r] of a) {
      if (r[1] > MAXB || !a.some(x => x[0] !== i && x[1][1] === r[1] && !(o.trustMtime && x[1][2] === r[2]))) continue;
      const id = path.basename(path.resolve(Ts[i].dir)).toLowerCase(), sig = 'L' + r[1] + ':' + r[2], hit = C.get(id, k, sig);
      if (!(hit && typeof hit.c === 'number')) todo.push({ id, k, sig, file: path.join(Ts[i].dir, r[0]) });
    }
  }
  for (let n = 0; n < todo.length; n += CONC) {
    const part = todo.slice(n, n + CONC);
    const bufs = await Promise.all(part.map(x => fs.promises.readFile(x.file).catch(() => null)));
    bufs.forEach((b, j) => { if (b) C.put(part[j].id, part[j].k, part[j].sig, { c: zlib.crc32(b) >>> 0 }); });
    if (prog) prog('read', Math.min(todo.length, n + CONC), todo.length);
  }
  return todo.length;
}
// check plus the joint view checks (async: the reference search reads many files). o as for check; o.joint
async function checkAll(o) {
  await crcWarm(o);
  const res = check(Object.assign({}, o, { keepOpen: true }));
  try {
    if (o.joint) {
      const prog = typeof o.progress === 'function' ? o.progress : null;
      if (prog) prog('joint', 0, 0);
      setupNotes(res.view, res.emit);
      const L = jointPlan(res.view, res.emit, o, res.rd, res.clashFiles);
      await jointRefs(res.view, res.emit, o, L, prog);
      res.rd.save();
      if (prog) prog('done', 1, 1);
    }
  } finally { vfs.closeRecs(); }
  return res;
}

// clashes between DIFFERENT paths (the file index has no shadow record for them): one pass over the winning files of the view
function crossPath(v, emit, patches, o, rd) {
  const ent = new Map(), tex = new Map(), lngs = [];
  const mods = new Set();
  for (const [key, rec] of v.files) {
    const id = sourceOf(rec.layer);
    if (!isGame(id)) mods.add(id);
    const e = extOf(key);
    if (e === '.def' && key.startsWith('resource/entity/')) { const b = key.slice(key.lastIndexOf('/') + 1); let a = ent.get(b); if (!a) ent.set(b, a = []); a.push({ key, id }); }
    else if (TEX_RANK[e]) { const st = key.slice(0, -e.length); let a = tex.get(st); if (!a) tex.set(st, a = []); a.push({ key, id, e }); }
    else if (e === '.lng' && key.startsWith(LOC_ROOT) && !isGame(id)) lngs.push({ key, id, rec });
  }
  if (!mods.size) return;
  const order = id => id === 'vanilla' ? -3 : id === 'as64/core' ? -2 : id === 'as64+' ? -1 : (v.mods.indexOf(id) >= 0 ? v.mods.indexOf(id) : 1000 + (v.modDirs || []).findIndex(d => d.id === id));
  // ENG-04: one .def name in two folders. Kept = the first mounted; the other logs "Entity redefinition" and is ignored
  for (const [name, a] of [...ent].sort((x, y) => x[0] < y[0] ? -1 : 1)) {
    if (a.length < 2) continue;
    a.sort((x, y) => order(x.id) - order(y.id) || (x.key < y.key ? -1 : 1));
    const keep = a[0];
    for (const x of a.slice(1)) {
      if (x.id === keep.id) continue;                               // one mod's own twin: refcheck ENTITY_REDEFINITION
      const lvl = isGame(keep.id) || isGame(x.id) ? 'info' : 'warn';
      emit(lvl, x.key, 1, 'CONFLICT_ENTITY_NAME_DUP', `entity "${name.slice(0, -4)}" is also at ${keep.key} (${keep.id}). The game keeps one entity per name: ${keep.id}'s is used, this one of ${x.id} is ignored ("Entity redefinition", lim ENG-04). Rename one of the two`, { key: name.slice(0, -4), winner: keep.id, loser: x.id, other: keep.key });
    }
  }
  // FMT-04: one picture name with two extensions
  for (const [st, a] of [...tex].sort((x, y) => x[0] < y[0] ? -1 : 1)) {
    if (a.length < 2 || a.every(x => x.id === a[0].id) || a.every(x => isGame(x.id))) continue;
    a.sort((x, y) => TEX_RANK[x.e] - TEX_RANK[y.e]);
    const w = a[a.length - 1];
    for (const x of a.slice(0, -1)) {
      if (x.id === w.id) continue;
      const surprise = order(x.id) > order(w.id) && !isGame(x.id);
      emit(surprise && !isGame(w.id) ? 'warn' : 'info', x.key, 0, 'CONFLICT_TEX_EXT_SHADOW', `${x.id} ships this picture as ${x.e} and ${w.id} ships ${w.key.slice(w.key.lastIndexOf('/') + 1)}: the game reads the ${w.e} one whatever the mod order (lim FMT-04), so ${x.id}'s picture is never shown`, { winner: w.id, loser: x.id, other: w.key });
    }
  }
  // LOC-04: one text key in two differently named .lng files that two different mods ship. Only when >= 2 mods ship .lng files
  if (v.exe !== 'goh' && new Set(lngs.map(l => l.id)).size >= 2) {
    const lnginc = require('../lib/lnginc');
    const seen = new Map();             // text key -> [{ id, key (file), sem, val, line }] one per mod, in load order
    const count = new Map();
    for (const l of lngs.sort((x, y) => order(x.id) - order(y.id) || (x.key < y.key ? -1 : 1))) {
      let map; try { map = rd.flat(l.id, l.rec, l.key).map; } catch (e) { continue; }
      const prefix = lnginc.keyPrefix(l.key.slice(LOC_ROOT.length));
      for (const [p, x] of map) {
        if (x.val === '' || !/^"?tags"?\//i.test(p)) continue;
        const k = (prefix + p.replace(/^"?tags"?\//i, '').replace(/"/g, '')).toLowerCase();
        let a = seen.get(k); if (!a) seen.set(k, a = []);
        if (!a.some(y => y.id === l.id)) a.push({ id: l.id, key: l.key, sem: x.sem, val: x.val, line: x.line });
      }
    }
    for (const [k, a] of seen) {
      if (a.length < 2) continue;
      const l = a[a.length - 1];
      // a patch mod (it lists the others as {Require}) that holds the key decides the text [T]
      const pw = patches(l.id, a.slice(0, -1).map(y => y.id));
      for (const was of a.slice(0, -1)) {
        if (was.key === l.key || was.sem === l.sem) continue;
        if (pw) { emit('info', l.key, l.line, 'CONFLICT_PATCHED', `text "${k}": decided by the patch mod ${l.id} (${l.val})`, { key: k, winner: l.id, loser: was.id }); continue; }
        const n = (count.get(l.key) || 0) + 1; count.set(l.key, n);
        if (o.keys || n <= KEYS_SHOWN) emit('warn', l.key, l.line, 'CONFLICT_LNG_KEY_CROSS', `text "${k}" is here (${l.id}: ${l.val}) and in ${was.key}:${was.line} (${was.id}: ${was.val}). One text key holds one text: the file the game reads later wins, the other text is never shown (lim LOC-04). Rename the key in one mod, or put the text you want in a patch mod`, { key: k, values: [{ src: was.id, val: was.val }, { src: l.id, val: l.val }], loser: was.id, winner: l.id, other: was.key, otherLine: was.line });
      }
    }
    if (!o.keys) for (const [key, n] of count) if (n > KEYS_SHOWN) emit('warn', key, 0, 'CONFLICT_FILE_MORE', `${n} CONFLICT_LNG_KEY_CROSS lines in this file, first ${KEYS_SHOWN} listed. --keys for all`, { n, of: 'CONFLICT_LNG_KEY_CROSS' });
  }
  // GoH .pot: one msgctxt in two differently named text files of two mods. GHLOC-08 [V] : across files
  // the later file wins, files taken in sorted name order [I: compared here by the whole path], whatever the mod order; the game logs
  // "Localization key redefinition". One .pot path in both mods is the main loop's CONFLICT_LNG_KEY_LOST / _DIFF
  if (v.exe === 'goh') {
    const pots = []; for (const [key, rec] of v.files) { const id = sourceOf(rec.layer); if (isPot(key) && !isGame(id)) pots.push({ key, id, rec }); }
    if (new Set(pots.map(p => p.id)).size >= 2) {
      const seen = new Map(), count = new Map();
      for (const l of pots.sort((x, y) => x.key < y.key ? -1 : 1)) {
        let map; try { map = rd.flat(l.id, l.rec, l.key).map; } catch (e) { continue; }
        for (const [k, x] of map) { if (!k) continue; let a = seen.get(k); if (!a) seen.set(k, a = []); a.push({ id: l.id, key: l.key, sem: x.sem, val: x.val, line: x.line }); }
      }
      for (const [k, a] of seen) {
        if (a.length < 2) continue;
        const l = a[a.length - 1];
        for (const was of a.slice(0, -1)) {
          if (was.id === l.id || was.sem === l.sem) continue;
          const n = (count.get(l.key) || 0) + 1; count.set(l.key, n);
          if (o.keys || n <= KEYS_SHOWN) emit('warn', l.key, l.line, 'CONFLICT_LNG_KEY_CROSS', `text "${k}" is here (${l.id}) and in ${was.key}:${was.line} (${was.id}) with another text. Gates of Hell reads its text files in name order and the later file wins, whatever the mod order (GHLOC-08): this file's text is shown, the other never. Rename the key in one mod`, { key: k, values: [{ src: was.id, val: was.val }, { src: l.id, val: l.val }], loser: was.id, winner: l.id, other: was.key, otherLine: was.line });
        }
      }
      if (!o.keys) for (const [key, n] of count) if (n > KEYS_SHOWN) emit('warn', key, 0, 'CONFLICT_FILE_MORE', `${n} CONFLICT_LNG_KEY_CROSS lines in this file, first ${KEYS_SHOWN} listed. --keys for all`, { n, of: 'CONFLICT_LNG_KEY_CROSS' });
    }
  }
}

// write mod's own records (layer == mod, plus mod patches) except ITM_FILE ones; never inside gameDir
function doClean(v, o, rep, itmFiles) {
  if (!o.out) throw new Error('--clean needs --out <dir>');
  const out = path.resolve(o.out), g = path.resolve(o.gameDir);
  if (v.exe === 'goh') { const why = require('../lib/writeguard').refuseWrite(out, { game: g, purpose: 'conflicts --clean' }); if (why) throw new Error(why); }
  if (out === g || out.startsWith(g + path.sep) && !out.startsWith(path.join(g, 'mods') + path.sep)) throw new Error('--out must not be the game dir');
  if (!v.mods.includes(o.clean)) throw new Error(`mod ${o.clean} not active`);
  const modDir = path.join(g, 'mods', o.clean);
  if (out === path.resolve(modDir) || out.startsWith(path.resolve(modDir) + path.sep)) throw new Error('--out must not be inside the mod being cleaned (no in-place)');
  let n = 0, skipped = 0;
  const all = new Set([...v.files.keys(), ...v.shadows.map(x => x.key)]);
  for (const key of [...all].sort()) {
    let rec = null; for (const r of v.chain(key)) if (sourceOf(r.layer) === o.clean) rec = r;   // mod's last record, even if later overridden
    if (!rec || rec.deleted) continue;
    if (itmFiles.has(key)) { skipped++; rep.info(key, 0, 'ITM_CLEANED', `${o.clean}: omitted from cleaned copy`); continue; }
    const buf = vfs.readRec(rec), dest = path.join(out, ...key.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf); n++;
    if (SDL_EXT.has(extOf(key))) {                      // validate the written copy reparses like the original
      try {
        const cnt = b => { let e = 0; sdlx.read(b, { file: key, key, open: () => null, onError: () => { e++; } }); return e; };
        const a = cnt(buf), b = cnt(fs.readFileSync(dest));
        if (a !== b) rep.add(key, 0, 'CLEAN_REPARSE', `written copy parse errors ${b} != original ${a}`);
      } catch (e) { rep.add(key, 0, 'CLEAN_REPARSE', e.message); }
    }
  }
  const mi = path.join(modDir, 'mod.info');
  if (fs.existsSync(mi)) fs.copyFileSync(mi, path.join(out, 'mod.info'));
  rep.info('.', 0, 'ITM_CLEANED', `${o.clean}: wrote ${n} files to ${out}, omitted ${skipped} identical (patch/pak-origin files are written loose under resource/)`);
  return n;
}

function table(rows, fmt) {
  const q = s => '"' + String(s).replace(/"/g, '""') + '"';
  const lines = [];
  if (fmt === 'csv') {
    lines.push('file,key,kind,winner,values');
    for (const r of rows) lines.push([r.file, r.key, r.kind, r.winner, r.values.map(x => `${x.src}=${x.val}`).join(' | ')].map(q).join(','));
  } else {
    lines.push('| file | key | kind | winner | values |', '|---|---|---|---|---|');
    for (const r of rows) lines.push(`| ${r.file} | ${r.key} | ${r.kind} | ${r.winner} | ${r.values.map(x => `${x.src}=${x.val}`).join(' / ').replace(/\|/g, '\\|')} |`);
  }
  return lines.join('\n');
}

// lib/modtree scans (T) of the mod folders the list names (and o.modDirs), for o.listings. o.scanKept: the scan kept in the store is
// taken as it is (the caller scanned a moment ago: the GUI route awaits modtree.ensure first), else each folder is walked now (async,
// 32 stats at a time). o.cacheDir = the lib/cachestore root the scans are kept in ('' or none = the per-user one)
async function listingsOf(o) {
  const modtree = require('../lib/modtree');
  if (o.cacheDir) { try { modtree._reset({ store: require('../lib/cachestore').open({ root: o.cacheDir }) }); } catch (e) { /* the default store */ } }
  const exe = o.exe ? games.exeOf(o.exe) : undefined;
  if (!o.gameDir && exe === 'goh') o.gameDir = games.install('goh').dir;
  const dirs = vfs.listed(Object.assign({ gameDir: o.gameDir, mods: o.mods || [] }, exe ? { exe } : {})).map(m => m.dir).concat((o.modDirs || []).map(d => (d && typeof d === 'object' ? d.dir : d)));
  const out = [];
  for (const d of dirs) { try { let T = o.scanKept ? modtree.last(d) : null; if (!T) T = await modtree.ensure(d); if (T) out.push(T); } catch (e) { /* lib/vfs walks that folder itself */ } }
  return out;
}
// --progress <file>: { step, done, total, at } as JSON, written at most every 200 ms (and at every step change); a reader polls it
function progressTo(file) {
  let last = 0, step = '';
  return (s, done, total) => { const now = Date.now(); if (s === step && now - last < 200) return; step = s; last = now; try { fs.writeFileSync(file, JSON.stringify({ step: s, done: done || 0, total: total || 0, at: now })); } catch (e) { /* no progress shown */ } };
}

// .lintrc + --format wiring (own arg parser): rc from --rc FILE, else nearest .lintrc walking up from `start`; --no-rc disables
const { rcPrint } = require('../lib/cli');
if (require.main === module) {
  const args = process.argv.slice(2), o = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--game') o.gameDir = args[++i]; else if (a === '--mods') o.mods = args[++i].split(',').filter(Boolean);
    else if (a === '--mod-dir') (o.modDirs = o.modDirs || []).push(args[++i]);
    else if (a === '--file') o.file = args[++i]; else if (a === '--itm') o.itm = true; else if (a === '--keys') o.keys = true;
    else if (a === '--clean') o.clean = args[++i]; else if (a === '--out') o.out = args[++i];
    else if (a === '--exe') { const x = args[++i]; if (!games.get(x)) { console.error('--exe must be one of as64|mowas_2|mowas2|goh'); process.exit(2); } o.exe = games.exeOf(x); }
    else if (a === '--mods-only') o.modsOnly = true; else if (a === '--joint') o.joint = true; else if (a === '--trust-mtime') o.trustMtime = true;
    else if (a === '--no-version-check') o.noGate = true; else if (a === '--cache') o.cacheDir = ''; else if (a === '--cache-dir') o.cacheDir = args[++i];
    else if (a === '--listings') o.useListings = true; else if (a === '--scan-kept') { o.useListings = true; o.scanKept = true; } else if (a === '--progress') o.progressFile = args[++i];
    else if (a === '--fmt') o.fmt = args[++i]; else if (a === '--rc') o.rcFile = args[++i]; else if (a === '--no-rc') o.noRc = true; else if (a === '--format') o.format = args[++i]; else if (a === '-o') o.output = args[++i]; else if (a === '-q') o.q = true; else if (a === '--summary') o.summary = true;
    else { console.error('unknown arg ' + a); process.exit(2); }
  }
  if ((!o.gameDir && o.exe !== 'goh') || !o.mods) { console.error('usage: node tools/conflicts/conflicts.js --game G --mods a,b,c [--mod-dir folder] [--exe as64|mowas_2|goh] [--file glob] [--keys] [--itm] [--clean mod --out dir] [--fmt md|csv|json] [-q]'); process.exit(2); }
  (async () => {
  let res;
  try {
    if (!o.gameDir && o.exe === 'goh') o.gameDir = games.install('goh').dir;
    if (o.cacheDir !== undefined) o.cache = cacheOn(o.cacheDir, o.gameDir, o.exe);
    if (o.progressFile) o.progress = progressTo(o.progressFile);
    if (o.useListings) { if (o.progress) o.progress('scan', 0, 0); o.listings = await listingsOf(o); }
    res = o.joint ? await checkAll(o) : check(o);
  } catch (e) { console.error(e.message); process.exit(2); }
  if (o.fmt === 'json') console.log(JSON.stringify({ order: res.order, modDirs: res.modDirs, files: res.files, items: o.q ? res.items.filter(x => x.level !== 'info' || /^VFS_/.test(x.code)) : res.items }));
  else if (o.fmt) { console.log(table(res.rows, o.fmt)); console.log(`${res.rows.length} conflicting keys`); }
  else { rcPrint(res.rep, o, o.gameDir, 'conflicts', { showInfo: !o.q, byCode: true, summary: o.summary }); console.log(`${res.files} shared files`); }
  })();
}
module.exports = { check, checkAll, listingsOf, cacheOn, progressTo, sourceOf, flattenKeyed, isSdlKey, isGame };
