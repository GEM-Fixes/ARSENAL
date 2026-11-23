#!/usr/bin/env node
// mpsync: emulate the lobby data CRC (resource syncer) -> which files desync between players. rows NET-01 NET-13 NET-16
//   node tools/mpsync/mpsync.js --game <G> [--mods a,b] --export fp.json   fingerprint of the effective (vfs) file set
//   node tools/mpsync/mpsync.js --compare a.json b.json [-q]               what the lobby sees / misses
//   node tools/mpsync/mpsync.js --mod <dir> [--game G] [-q]                classify a mod's own files
//   --exe as64|mowas_2|mowas2|goh (export and --mod): the game whose vfs view is fingerprinted (lib/games). MoW:AS2: no as64/core, and --mod
//     never retries beside as64+ (that is AS64's Enhanced mode only); none = the vfs default (as64 when as64.exe is there, as before).
//     --exe goh with no --game = the GoH install (games.install). An export carries "exe" only when a game was named (no --exe:
//     the same bytes as before); --compare of two exports that both carry "exe" and differ says MPSYNC_EXE_DIFF (a lobby only holds
//     players of one game; an export without "exe" is of unknown game). --mod --exe goh: a mod folder outside <GoH>/mods is
//     mounted by path (vfs modDirs); a 'mods' parent outside a GoH install is not taken as <game>/mods.
//   GoH [I]: same folders, filters and mask rules as AS2 (GoH resource syncer IsSynchronised, Parse, game filter/maps filter/sync filter
//     unchanged in gohweb the game net/mp-game/resource syncer); masks are read from GoH's own resource_syncer.reg (vanilla adds *.anm
//     crcFileMasks [V data]). GoH is changed (a file info lookup and a virtual checksum, not read): the per-file engine
//     CRC and the tree CRCs are the AS2 form until that is read [I]; which files differ between two exports does not depend on it.
// engine: (ComputeCrc, folder CRC, filters, MatchAny)
//          (Crc32 = zlib crc32 with caller start value), (MatchWildcard)
// classes: S synced+content CRC (crcFileMasks) | Z synced, byte size only | X not in lobby tree (excluded mask or outside folders)
// codes: MPSYNC_DETECTED, WARN_MPSYNC_SILENT, MPSYNC_ONLY_IN_A/B, MPSYNC_EXCLUDED_DIFF(info), WARN_MPSYNC_SIZE_ONLY info + WARN_MPSYNC_SIZE_ONLY summary (--mod)
// Author: Imperator_Aug (ARSENAL, ia-cb6d55d0)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { createReport } = require('../lib/report');
const vfs = require('../lib/vfs'), sdl = require('../lib/sdl'), games = require('../lib/games');

const GAME_FOLDERS = ['/entity/', '/fx/', '/properties/', '/set/', '/sound/'];
const MAP_FOLDERS = ['/map/single/', '/map/bonus/', '/map/multi/'];
// defaults = vanilla set/registry/resource_syncer.reg; the effective vfs copy wins (a mod can override it)
const DEF_EXCLUDE = '*.scc;*.txt;*.backup;*.bak;*.org;*.s_*;*.msg;*.lng;*.dds;*.ebm;*.bmp;*.tga;*.wav';
const DEF_CRC = '/set/*;*.set;*.inc;*.ext;*/map;*.mi;*.reg;*.info;*.def;*.mdl';
const REG_KEY = 'resource/set/registry/resource_syncer.reg';

//  literal port (incl. the quirk that chars of a middle part are re-compared after find)
function matchWildcard(name, mask) {
  let star = false, pos = 0;
  for (let i = 0; i < mask.length; i++) {
    const c = mask[i];
    if (pos === name.length && c !== '*') return false;
    if (c === '*') { if (i + 1 === mask.length) return true; star = true; }
    else if (star) {
      const next = mask.indexOf('*', i), part = mask.slice(i, next < 0 ? undefined : next);
      if (next < 0) return name.length >= part.length && name.endsWith(part);
      pos = name.indexOf(part, pos);
      if (pos < 0) return false;
      pos++; star = false;
    } else { if (name[pos] !== c) return false; pos++; }
  }
  return pos === name.length;
}
const split = s => s.split(/[;,]/).filter(Boolean);              // tokenizer(";,")
const matchAny = (name, masks) => masks.some(m => matchWildcard(name, m));

function classify(name, M) {                                        // name = '/entity/...' (lowercase)
  const low = name;
  let tree = null;
  for (const f of GAME_FOLDERS) if (low.slice(0, f.length) === f) tree = 'game';
  for (const f of MAP_FOLDERS) if (low.slice(0, f.length) === f) tree = tree || 'map';
  if (!tree || matchAny(name, M.exclude)) return { cls: 'X', tree: null };   //
  return { cls: matchAny(name, M.crc) ? 'S' : 'Z', tree };                   //
}

const crc32 = (buf, init) => zlib.crc32(buf, init >>> 0);
function sizeCrc(size) { const b = Buffer.alloc(4); b.writeUInt32LE(size >>> 0); return crc32(b, 0xffffffff); }  //

function masksFrom(v) {
  let ex = DEF_EXCLUDE, cr = DEF_CRC;
  const rec = v.files.get(REG_KEY);
  if (rec) {
    try {
      const t = sdl.parseLines(vfs.readRec(rec).toString('latin1').split(/\r?\n/));
      (function walk(n) { for (const k of n.kids) { const nm = (k.name || '').toLowerCase();
        if (nm === 'excludemasks' && k.vals.length) ex = k.vals[0].v; else if (nm === 'crcfilemasks' && k.vals.length) cr = k.vals[0].v; else walk(k); } })(t);
    } catch { /* keep defaults */ }
  }
  return { exclude: split(ex), crc: split(cr), excludeRaw: ex, crcRaw: cr };
}

// entry crc32 of an uncompressed file: free for paks (central directory), read for loose
function plainCrc(rec, buf) {
  if (rec.source === 'pak' && rec.ent && typeof rec.ent.crc === 'number') return rec.ent.crc >>> 0;
  return crc32(buf || vfs.readRec(rec), 0);
}

// folder crc -- folders first (name order), then files (name order); child crc fed little-endian
function treeCrc(entries) {   // entries [[relName, engineCrc]] relative to root
  const root = { f: new Map(), x: new Map() };
  for (const [n, c] of entries) {
    const parts = n.split('/').filter(Boolean); let d = root;
    for (let i = 0; i < parts.length - 1; i++) { if (!d.f.has(parts[i])) d.f.set(parts[i], { f: new Map(), x: new Map() }); d = d.f.get(parts[i]); }
    d.x.set(parts[parts.length - 1], c);
  }
  const srt = m => [...m.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const hex = x => (x >>> 0).toString(16).padStart(8, '0');
  const fold = d => {
    let crc = 0xffffffff; const b = Buffer.alloc(4);
    for (const k of srt(d.f)) { b.writeUInt32LE(fold(d.f.get(k)) >>> 0); crc = crc32(b, crc); }
    for (const k of srt(d.x)) { b.writeUInt32LE(d.x.get(k) >>> 0); crc = crc32(b, crc); }
    return crc >>> 0;
  };
  return hex(fold(root));
}

// CRC register shift over len zero bytes (zlib crc32_combine operator, GF(2) matrix powers). CRC is affine in its start value:
// crc32(buf, s) = crc32(buf, 0) ^ shift(s, buf.length). So the engine CRC Crc32(stream, size) of a pak entry comes from the
// central-directory crc32 without reading or inflating the entry (speed: a GoH export read every content-CRC file in full).
function gf2Times(mat, vec) { let sum = 0, i = 0; vec >>>= 0; while (vec) { if (vec & 1) sum ^= mat[i]; vec >>>= 1; i++; } return sum >>> 0; }
function gf2Square(mat) { const sq = new Array(32); for (let n = 0; n < 32; n++) sq[n] = gf2Times(mat, mat[n]); return sq; }
function crcShift(c, len) {
  c >>>= 0;
  if (len <= 0) return c;
  let odd = new Array(32); odd[0] = 0xedb88320; for (let n = 1, row = 1; n < 32; n++, row <<= 1) odd[n] = row >>> 0;
  let even = gf2Square(odd); odd = gf2Square(even);   // even = 2 zero bits, odd = 4 zero bits
  for (;;) {
    even = gf2Square(odd); if (len % 2) c = gf2Times(even, c); len = Math.floor(len / 2); if (!len) break;
    odd = gf2Square(even); if (len % 2) c = gf2Times(odd, c); len = Math.floor(len / 2); if (!len) break;
  }
  return c >>> 0;
}
// engine Crc32(stream, size) of an entry from its plain crc32 (start 0) and size
const engineFromPlain = (plain, size) => (plain ^ crcShift(size >>> 0, size)) >>> 0;

// fingerprint: files { '/entity/x.def': [cls, size, crc32hex, engineHex] }
function fingerprint(v, filter) {
  const M = masksFrom(v), files = {}, ent = { game: [], map: [] };
  const hex = x => (x >>> 0).toString(16).padStart(8, '0');
  for (const [key, rec] of v.files) {
    if (!key.startsWith('resource/')) continue;
    const name = key.slice(8);
    if (filter && !filter(key, rec)) continue;
    const { cls, tree } = classify(name, M);
    let buf = null, c32, eng;
    if (cls === 'S' && rec.source === 'pak' && rec.ent && typeof rec.ent.crc === 'number' && typeof rec.size === 'number') { c32 = rec.ent.crc >>> 0; eng = engineFromPlain(c32, rec.size); }   // no read: pak crc + size
    else if (cls === 'S') { buf = vfs.readRec(rec); c32 = plainCrc(rec, buf); eng = crc32(buf, buf.length); }  // Crc32(stream, size)
    else { c32 = plainCrc(rec); eng = cls === 'Z' ? sizeCrc(rec.size) : null; }
    files[name] = [cls, rec.size, hex(c32), eng === null ? null : hex(eng)];
    if (tree) ent[tree].push([name, eng]);
  }
  return { tool: 'mpsync', v: 1, ...(v.exeNamed ? { exe: v.exe } : {}), algo: 'engine Crc32 = zlib crc32 (start value per call); file plain = crc32 of content', mods: v.mods || [],
    masks: { exclude: M.excludeRaw, crc: M.crcRaw }, count: Object.keys(files).length,
    trees: filter ? null : { res: treeCrc(ent.game), map: treeCrc(ent.map) }, files };
}

function compare(a, b, rep) {
  const names = new Set([...Object.keys(a.files), ...Object.keys(b.files)]);
  // an export with no "exe" (no game named, or made before --exe) is of unknown game: no MPSYNC_EXE_DIFF against it
  if (a.exe && b.exe && a.exe !== b.exe) rep.add('exe', 0, 'MPSYNC_EXE_DIFF', `A was exported for ${a.exe}, B for ${b.exe}: a lobby holds players of one game only; the file list below compares two games`);
  if (a.masks.exclude !== b.masks.exclude || a.masks.crc !== b.masks.crc) rep.info('masks', 0, 'MPSYNC_MASKS_DIFF', 'resource_syncer.reg masks differ between A and B; classes taken from A');
  const M = { exclude: split(a.masks.exclude), crc: split(a.masks.crc) };
  const n = { det: 0, sil: 0, x: 0, only: 0 };
  for (const name of [...names].sort()) {
    const fa = a.files[name], fb = b.files[name], cls = classify(name, M).cls;
    if (!fa || !fb) {
      if (cls === 'X') { rep.info(name, 0, 'MPSYNC_EXCLUDED_DIFF', `only in ${fa ? 'A' : 'B'}; not in lobby tree (class X), may desync`); n.x++; }
      else { rep.add(name, 0, fa ? 'MPSYNC_ONLY_IN_A' : 'MPSYNC_ONLY_IN_B', `synced file (${cls === 'S' ? 'content CRC' : 'size CRC'}) exists on one side: folder CRC differs, lobby flags desync (NET-01)`); n.only++; }
      continue;
    }
    if (cls === 'X') {
      if (fa[1] !== fb[1] || fa[2] !== fb[2]) { rep.info(name, 0, 'MPSYNC_EXCLUDED_DIFF', `differs (${fa[1]} vs ${fb[1]} bytes); excluded from lobby CRC, no warning, may desync`); n.x++; }
      continue;
    }
    if (fa[3] !== fb[3]) { rep.add(name, 0, 'MPSYNC_DETECTED', cls === 'S' ? 'content differs (content CRC): lobby blocks/warns (NET-01)' : `size differs ${fa[1]} vs ${fb[1]} (size CRC): lobby blocks/warns (NET-01)`); n.det++; }
    else if (cls === 'Z' && fa[2] !== fb[2]) { rep.add(name, 0, 'WARN_MPSYNC_SILENT', `same size ${fa[1]} but content differs: lobby CRC is size-only, NOT detected, OOS risk (NET-01)`); n.sil++; }
  }
  if (a.trees && b.trees) {
    rep.info('trees', 0, 'MPSYNC_TREES', `ResCRC ${a.trees.res} vs ${b.trees.res} ${a.trees.res === b.trees.res ? '(equal)' : '(differ)'}; MapCRC ${a.trees.map} vs ${b.trees.map} ${a.trees.map === b.trees.map ? '(equal)' : '(differ)'}; lobby also needs equal build/version (NET-13)`);
  }
  return n;
}

function modFiles(o) {
  const dir = path.resolve(o.mod), name = path.basename(dir);
  const up2 = path.dirname(path.dirname(dir));
  const underMods = path.basename(path.dirname(dir)).toLowerCase() === 'mods' && (o.exe !== 'goh' || games.detect(up2) === 'goh');
  const game = o.gameDir || (underMods ? up2 : null) || (o.exe === 'goh' ? games.install('goh').dir : null);
  if (!game) throw new Error('--mod needs --game (or a dir under <game>/mods)');
  // GoH: a mod folder outside <GoH>/mods (ARSENAL keeps GoH mods outside the install, lib/writeguard) is mounted by path (vfs modDirs)
  if (o.exe === 'goh' && path.resolve(up2).toLowerCase() !== path.resolve(game).toLowerCase()) {
    const v = build({ gameDir: game, mods: [], modDirs: [{ dir, id: name }] }, o.exe);
    if (!(v.modDirs || []).some(d => d.id === name)) throw new Error('mod folder "' + name + '" not mounted: ' + v.problems.map(p => p.msg).join('; '));
    const own = l => l === name || l.startsWith(name + ' patch');
    return { v, own, name, game };
  }
  let v = build({ gameDir: game, mods: [name] }, o.exe);
  // Enhanced (3.301+) mod mounts only with as64+ in the list: retry the way the game would run it (AS64 only: MoW:AS2 has no as64+)
  if (!v.mods.includes(name) && v.exe === 'as64' && v.problems.some(p => p.code === 'MOD_MODE')) v = build({ gameDir: game, mods: ['as64+', name] }, o.exe);
  if (!v.mods.includes(name)) throw new Error('mod "' + name + '" not mounted: ' + v.problems.map(p => p.msg).join('; '));
  const own = l => l === name || l.startsWith(name + ' patch');
  return { v, own, name, game };
}

// vfs.build with the named game's exe (none: the vfs default, as before); v.exeNamed marks an export made for a named game
function build(opts, exe) {
  const v = vfs.build(exe ? Object.assign({}, opts, { exe }) : opts);
  if (exe) v.exeNamed = true;
  return v;
}

function loadFp(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }

// .lintrc + --format wiring (own arg parser): rc from --rc FILE, else nearest .lintrc walking up from `start`; --no-rc disables
const { rcPrint } = require('../lib/cli');
function main() {
  const args = process.argv.slice(2), o = { cmp: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--game') o.gameDir = args[++i]; else if (a === '--mods') o.mods = args[++i].split(',').filter(Boolean);
    else if (a === '--export') o.exp = args[++i]; else if (a === '--compare') { o.cmp = [args[++i], args[++i]]; o.compare = true; }
    else if (a === '--exe') { const x = args[++i]; if (!games.get(x)) { console.error('--exe must be one of as64|mowas_2|mowas2|goh'); process.exit(2); } o.exe = games.exeOf(x); }
    else if (a === '--mod') o.mod = args[++i]; else if (a === '--rc') o.rcFile = args[++i]; else if (a === '--no-rc') o.noRc = true; else if (a === '--format') o.format = args[++i]; else if (a === '-o') o.output = args[++i]; else if (a === '-q') o.q = true; else if (a === '--summary') o.summary = true;
  }
  const t0 = Date.now();
  if (o.compare) {
    const rep = createReport();
    const n = compare(loadFp(o.cmp[0]), loadFp(o.cmp[1]), rep);
    rcPrint(rep, o, o.mod || o.gameDir, 'mpsync', { showInfo: !o.q, byCode: true, summary: o.summary });
    console.log(`${n.det} detected, ${n.sil} silent, ${n.only} one-sided, ${n.x} excluded-class diffs`);
    return;
  }
  if (o.exp) {
    if (!o.gameDir && o.exe === 'goh') o.gameDir = games.install('goh').dir;
    if (!o.gameDir) return usage();
    const v = build({ gameDir: o.gameDir, mods: o.mods }, o.exe);
    const fp = fingerprint(v);
    fs.writeFileSync(o.exp, JSON.stringify(fp));
    const cnt = { S: 0, Z: 0, X: 0 }; for (const k in fp.files) cnt[fp.files[k][0]]++;
    console.log(`exported ${fp.count} files (content-CRC ${cnt.S}, size-CRC ${cnt.Z}, excluded ${cnt.X}); ResCRC ${fp.trees.res} MapCRC ${fp.trees.map}; ${Date.now() - t0} ms -> ${o.exp}`);
    return;
  }
  if (o.mod) {
    let mf;
    try { mf = modFiles(o); } catch (e) { console.log('mpsync: SKIPPED, ' + e.message + ' (mpsync reads only a mounted mod: needs mod.info + a game dir)'); return; }   // bare folder / not mounted: one line, exit 0
    const rep = createReport(), { v, own, name } = mf, M = masksFrom(v);
    const cnt = { S: 0, Z: 0, X: 0 }, over = { S: 0, Z: 0, X: 0 };
    for (const [key, rec] of [...v.files].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
      if (!own(rec.layer) || !key.startsWith('resource/')) continue;
      const fname = key.slice(8), { cls } = classify(fname, M);
      cnt[cls]++;
      if (cls === 'Z') rep.info(fname, 0, 'MPSYNC_SIZE_ONLY', 'synced by byte size only: a same-size edit passes the lobby and desyncs in play (NET-01)');
      else if (cls === 'X') rep.info(fname, 0, 'MPSYNC_UNCHECKED', 'not in lobby CRC at all; players with different copies are not warned (NET-01)');
    }
    if (cnt.Z) rep.add(name, 0, 'WARN_MPSYNC_SIZE_ONLY', cnt.Z + ' files synced by byte size only: same-size edits pass the lobby and desync in play (NET-01); per-file list without -q');
    rcPrint(rep, o, o.mod || o.gameDir, 'mpsync', { showInfo: !o.q, byCode: true, summary: o.summary });
    console.log(`mod "${name}": ${cnt.S} files content-CRC (edits caught), ${cnt.Z} size-only (same-size edits missed), ${cnt.X} unchecked`);
    return;
  }
  usage();
}
function usage() { console.error('usage: mpsync.js --game <G> [--mods a,b] [--exe as64|mowas_2|goh] --export fp.json | --compare a.json b.json | --mod <dir> [--game G] [--exe ..] [-q] [--summary]'); process.exit(2); }

if (require.main === module) main();
module.exports = { matchWildcard, classify, fingerprint, compare, treeCrc, sizeCrc, crcShift, engineFromPlain };
