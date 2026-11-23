#!/usr/bin/env node
// binhdr: binary/format header validator over the mounted resource index (lib/vfs). rows FMT-01..10,12..17 (FMT-16: WARN_PLY_INLINE_TEX_MISSING)
//   node binhdr.js <gameDir> [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [--all] [--ext ply,anm,...] [--strict] [--time] [--folder DIR] [--sample N] [-q] [--summary] [--format text|json|sarif|csv|html] [-o FILE] [--rc FILE] [--no-rc] | --help
//   binhdr.js --paks <root> [--ext ..] [--sample N] ...: walk every *.pak under root (lib/pakset, no vfs/mods; e.g. GoH resource/). rel = pak entry name.
//     cross-file checks (def->mdl volumes, mdl->anm bones, texture ext shadow) use a name map of ALL pak entries (later pak wins); only checked files are sampled
//     map.net (up to ~90 MB each in GoH) is skipped in --paks mode unless --ext is given
//   --sample N: per extension, N files spread evenly over the file list (deterministic)
//   --strict: engine-tolerated defects (SOFT) count as findings in mod files too (default: info everywhere)
//   gameDir with --mods: checks only files provided by the listed mods (--all: every mounted file). no --mods: vanilla.
//   --folder DIR: overlay DIR/resource (loose files, layer 'folder') on the game vfs (gameDir optional: '-' = no game); only those files are checked (build stage)
//   gameDir may also be a fixture dir (no mods). paks are read in place, nothing extracted.
//   --exe as64|mowas_2|mowas2|goh: the game (vfs exe; no --exe: as before, as64.exe first, a GoH install found by its exe). The AS2 install
//     holds AS64 and MoW:AS2: --exe mowas_2 mounts it without as64/core. --exe goh with no gameDir: the GoH install (lib/games).
//     GoH forms (--exe goh or a GoH install; --paks: also a paks root at or under a GoH install, e.g. <GoH>/resource; --folder: --exe goh): map.net cell 5 is valid (GHMAP-06),
//     the version byte is ignored and every map.net is read as version 2 (GHMAP-16)
// Author: Imperator_Aug (ARSENAL, ia-164f69c6)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const { build, readRec: vfsRead, closeRecs } = require('../lib/vfs'), pakset = require('../lib/pakset'), names = require('../lib/names'), { createReport } = require('../lib/report');
const { checkPly } = require('./ply'), M = require('./misc'), D = require('./mdl');

// .lintrc + --format wiring (own arg parser): rc from --rc FILE, else nearest .lintrc walking up from `start`; --no-rc disables
const { rcPrint } = require('../lib/cli');
const args = process.argv.slice(2), pos = [], o = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--mods') o.mods = (args[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
  else if (a === '--all') o.all = true;
  else if (a === '--ext') o.ext = new Set((args[++i] || '').split(',').map(s => '.' + s.replace(/^\./, '').toLowerCase()));
  else if (a === '--time') o.time = true;
  else if (a === '--strict') o.strict = true;
  else if (a === '--rc') o.rcFile = args[++i]; else if (a === '--no-rc') o.noRc = true; else if (a === '--format') o.format = args[++i]; else if (a === '-o') o.output = args[++i]; else if (a === '-q') o.q = true;
  else if (a === '--summary') o.summary = true;
  else if (a === '--sample') o.sample = Math.max(1, parseInt(args[++i], 10) || 0);
  else if (a === '--paks') o.paks = args[++i];
  else if (a === '--folder') o.folder = args[++i];
  else if (a === '--exe') { const x = args[++i], g = require('../lib/games').get(x); if (!g || /\.exe$/i.test(String(x))) { console.error('binhdr: --exe must be one of as64|mowas_2|mowas2|goh'); process.exit(2); } o.exe = g.exe; }
  else pos.push(a);
}
// --exe goh with no gameDir (and no --paks / --folder only run): the GoH install (lib/games install)
if (!pos.length && !o.paks && o.exe === 'goh' && !o.folder) { const d = require('../lib/games').install('goh').dir; if (d) pos.push(d); }
if (!pos.length && !o.paks && !o.folder) { if (o.exe === 'goh') console.error('binhdr: no GoH install found (set GOH_GAME or give <gameDir>)'); console.error('usage: binhdr.js <gameDir> [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [--all] [--ext ply,anm,..] [--strict] [--time] [-q] [--summary] [--sample N] | binhdr.js --paks <root> ...'); process.exit(2); }

const t0 = Date.now();
let ps = null, readRec = vfsRead, v;
if (o.paks) {
  ps = pakset.open(o.paks, null);
  for (const er of ps.errors) console.error('pak skipped: ' + er.file + ': ' + er.message);
  const files = new Map();
  for (const e of ps.entries) files.set(e.name, e);
  v = { files, mods: [], ms: Date.now() - t0 };
  readRec = pakset.read;
} else {
  v = pos[0] && pos[0] !== '-' ? build({ gameDir: pos[0], mods: o.mods, exe: o.exe }) : { files: new Map(), mods: [], ms: 0 };
  if (o.folder) {
    const fs = require('fs'), path = require('path'), root = path.resolve(o.folder), res = path.join(root, 'resource');
    const walk = (d, vr) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name), nm = names.normalize(e.name);
      if (e.isDirectory()) walk(p, vr + nm + '/');
      else v.files.set(vr + nm, { source: 'loose', container: root.replace(/\\/g, '/'), entry: path.relative(root, p).replace(/\\/g, '/'), layer: 'folder', size: fs.statSync(p).size });
    } };
    walk(res, 'resource/');
    o.folderLayer = true;
  }
}
// the game whose file forms apply: --exe, else the vfs exe (a GoH install is found by its exe); --paks: --exe, else a GoH install found
// by its exe at the paks root or one folder up (<GoH>/resource); '-': only --exe
const pakGoh = () => { const path = require('path'), G = require('../lib/games'), r = path.resolve(o.paks); return [r, path.dirname(r)].some(d => G.detect(d) === 'goh') ? 'goh' : null; };
const game = o.exe || v.exe || (o.paks ? pakGoh() : null);
const base = createReport();
// findings the engine tolerates (warns/falls back/drops silently) are info: on vanilla-layer files always (bar is
// "vanilla 0 findings"), on mod files unless --strict (robz: ~950 of 958 findings were these)
const SOFT = new Set(['DEF_VOLUME_NO_SHAPE', 'MDL_VOLUME_BONE', 'DDS_FORMAT', 'DDS_VOLUME', 'TEX_EXT_SHADOW', 'WARN_EBM_MIPMAP', 'WARN_SOUND_MP3', 'WARN_ANM_BONE_MISSING']);
const soft = { add: (rel, line, code, msg) => (SOFT.has(code) ? base.info : base.add).call(base, rel, line, code, msg), info: (...a) => base.info(...a) };
const isBase = l => !l || l === 'base' || /^patch \d+$/.test(l);
let rep = base;
const modIds = new Set(v.mods);
const layerMod = l => l.replace(/ patch \d+$/, '');
const selected = rec => o.folderLayer ? rec.layer === 'folder' : o.all || !modIds.size || modIds.has(layerMod(rec.layer));
const extOf = k => { const i = k.lastIndexOf('.'); return i > k.lastIndexOf('/') ? k.slice(i) : ''; };
const wanted = e => !o.ext || o.ext.has(e);
const has = k => v.files.has(k);
const lcs = s => s.toLowerCase();
const sink = { add() {}, info() {} };

const mdlCache = new Map(), anmCache = new Map();
function mdlInfo(key) {
  if (mdlCache.has(key)) return mdlCache.get(key);
  const rec = v.files.get(key);
  let info = null;
  if (rec) info = D.scanMdl({ buf: readRec(rec), rep: sink, rel: key });
  mdlCache.set(key, info);
  return info;
}
function anmInfo(key) {
  if (anmCache.has(key)) return anmCache.get(key);
  const rec = v.files.get(key);
  const info = rec ? M.parseAnm({ buf: readRec(rec), rep: sink, rel: key }) : null;
  anmCache.set(key, info);
  return info;
}

// FMT-03 severity by reachability: a missing .mtl crashes on load, but only when something loads the mesh.
// reached = an enabled (selected) .def/.mdl names the .ply (def {Extension} -> .mdl -> {VolumeView}/{View}, paths relative to the file, FMT-22)
let reachSet = null;
function reached(plyKey) {
  if (!reachSet) {
    reachSet = new Set();
    const fromMdl = (mkey, seen) => {
      if (seen.has(mkey)) return;
      seen.add(mkey);
      const r = v.files.get(mkey);
      if (!r) return;
      const dir = mkey.slice(0, mkey.lastIndexOf('/'));
      for (const p of D.plyRefs(readRec(r))) reachSet.add(names.resolve(p, dir).key);
    };
    const seen = new Set();
    for (const [k, r] of v.files) {
      if (!selected(r)) continue;
      const e = extOf(k);
      if (e === '.mdl') fromMdl(k, seen);
      else if (e === '.def') {
        const dir = k.slice(0, k.lastIndexOf('/'));
        for (const m of D.defMdls(readRec(r))) fromMdl(names.resolve(m, dir).key, seen);
      }
    }
  }
  return reachSet.has(plyKey);
}

const TEX = ['.dds', '.tga', '.bmp', '.jpg', '.png'];
const counts = {};
const stat = (e, ms) => { const c = counts[e] || (counts[e] = { n: 0, ms: 0 }); c.n++; c.ms += ms; };

let work = [...v.files].filter(([k, r]) => selected(r) && wanted(extOf(k)));
if (o.sample) {
  const keep = new Set(pakset.sample(work.map(([k]) => ({ name: k })), o.sample).map(x => x.name));
  work = work.filter(([k]) => keep.has(k));
}
for (const [key, rec] of work) {
  rep = isBase(rec.layer) || !o.strict ? soft : base;
  const e = extOf(key);
  if (!wanted(e)) continue;
  const t = Date.now();
  try {
    if (e === '.ply') {
      const prep = { add: (rel, line, code, msg) => code !== 'PLY_MTL_MISSING' ? rep.add(rel, line, code, msg)
        : (!isBase(rec.layer) && (o.strict || reached(key)) ? base.add : base.info).call(base, rel, line, code, msg + (reached(key) ? ' (reached by an enabled .def/.mdl)' : ' (no enabled .def/.mdl loads it)')), info: (...a) => rep.info(...a) };
      checkPly({ key, buf: readRec(rec), rep: prep, rel: key, has });
    }
    else if (e === '.anm') {
      const buf = readRec(rec), a = M.parseAnm({ buf, rep, rel: key });
      anmCache.set(key, a);
    }
    else if (e === '.vol') M.checkVol({ buf: readRec(rec), rep, rel: key });
    else if (e === '.dds') M.checkDds({ buf: readRec(rec), rep, rel: key });
    else if (e === '.ebm' || e === '.tex') M.checkEbm({ buf: readRec(rec), rep, rel: key });
    else if (e === '.net' && /(^|\/)map\.net$/.test(key) && (!o.paks || o.ext)) M.checkNet({ buf: readRec(rec), rep, rel: key, game });
    else if (e === '.wav') M.checkWav({ buf: readRec(rec), rep, rel: key });
    else if (e === '.mp3' && /^resource\/sound\//.test(key)) rep.add(key, 0, 'WARN_SOUND_MP3', '.mp3 inside a sound folder: only *.wav are registered as folder samples (ignored) [T]');
    else if (e === '.mdl') {
      const ctx = { buf: readRec(rec), rep, rel: key };
      const info = D.scanMdl(ctx);
      mdlCache.set(key, info);
      if (info) {
        D.checkMdlVolumes(ctx, info);
        crossAnm(key, info);
      }
    }
    else if (e === '.def') D.checkDef({ buf: readRec(rec), rep, rel: key, key }, mdlInfo);
    if (TEX.includes(e)) texOrder(key, e);
  } catch (err) {
    rep.add(key, 0, 'CRASH', err.message);
  }
  stat(e, Date.now() - t);
}

// FMT-09: .anm bone absent from the owning .mdl skeleton -> track skipped
function crossAnm(mkey, info) {
  if (info.dotted || !info.bones.size) return;
  const dir = mkey.slice(0, mkey.lastIndexOf('/'));
  const done = new Set();
  for (const s of info.seqs) {
    const f = s.file || (s.name + '.anm');
    const akey = names.resolve(f, dir).key;
    if (done.has(akey)) continue;
    done.add(akey);
    const a = anmInfo(akey);
    if (!a || !a.ok) continue;
    const miss = [...new Set(a.bones.map(b => b.replace(/_lod\d+$/i, '')).filter(b => !info.bones.has(lcs(b))))];
    const all = new Set(a.bones.map(b => b.replace(/_lodd+$/i, '')));
    if (miss.length) (miss.length === all.size ? rep.add : rep.info).call(rep, mkey, s.line, 'WARN_ANM_BONE_MISSING', `${akey}: bone${miss.length > 1 ? 's' : ''} ${miss.slice(0, 4).join(', ')}${miss.length > 4 ? ` (+${miss.length - 4})` : ''} not in this skeleton: track skipped silently`);
  }
}

// FMT-04: several image formats for one texture name; the LAST in .dds .tga .bmp .jpg .png wins
function texOrder(key, e) {
  const stem = key.slice(0, key.length - e.length);
  const idx = TEX.indexOf(e);
  const later = TEX.slice(idx + 1).filter(x => has(stem + x));
  if (later.length) rep.add(key, 0, 'TEX_EXT_SHADOW', `${stem + later[later.length - 1]} also exists and wins (order .dds .tga .bmp .jpg .png, last wins): this ${e} is never used`);
}

if (o.time) {
  for (const [e, c] of Object.entries(counts).sort((a, b) => b[1].ms - a[1].ms)) base.info('.', 0, 'STATS', `${e}: ${c.n} files ${c.ms} ms`);
  base.info('.', 0, 'STATS', `total ${Date.now() - t0} ms (index ${v.ms} ms), mods: ${v.mods.join(', ') || 'none'}`);
}
closeRecs();
if (ps) ps.close();
// no-data notice (COV-LINT: was silent on an empty folder) + loose-folder hint (`binhdr <mod dir> --all` read nothing, said nothing)
if (!work.length) {
  const fs = require('fs'), path = require('path'), d = pos[0] && pos[0] !== '-' ? path.resolve(pos[0]) : null;
  const notGame = d && !fs.existsSync(path.join(d, 'as64.exe')) && !fs.existsSync(path.join(d, 'mowas_2.exe')) && !fs.existsSync(path.join(d, 'binaries', 'x64', 'call_to_arms.exe')) && !fs.existsSync(path.join(d, 'resource', 'gamelogic.pak'));
  console.error(`binhdr: 0 files read${o.folder ? ' (no resource/ files in the --folder dir)' : ''}` +
    (!o.folder && !o.paks && notGame ? `\nbinhdr: ${pos[0]} does not look like a game dir; for a loose mod folder use: binhdr - --folder ${pos[0]}  (or <gameDir> --mods <name> for an installed mod)` : ''));
}
rcPrint(base, o, pos[0] || o.paks || o.folder, 'binhdr', { byCode: true, showInfo: !o.q, summary: o.summary });
