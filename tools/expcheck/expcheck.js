#!/usr/bin/env node
// expcheck: exporter-limit checks the 3ds Max exporter (GemExport64.dle) enforces but the engine does not. rows FMT-18..21 (all [I]/[T] -> WARN_ codes)
//   node expcheck.js <mod folder> --game dir [--exe as64|mowas_2|goh] [--mods a,b] [-q] [--summary] | --folder <dir> --game dir | --vfs --game dir [--all] | <fixture game dir>
//   [--rc file] [--no-rc] [--format text|json] [-o file]
//   --folder <dir>: lay <dir>/resource over the game vfs as layer 'folder' and check only its .mdl, also when <dir> sits in <game>/mods
//   (so a mod the version gate drops is still checked). --mods: only the listed mods that mount are checked; all dropped = none checked.
//   per .mdl (only files the mod provides; --vfs = all mounted .mdl): resolves .ply (VolumeView/View strings), .anm ({sequence} file or <name>.anm),
//   .vol ({Volume {Polyhedron}}) through lib/vfs, reading header sections only (lib/ply.js, lib/anm.js; .vol EVLM VERT/INDX here).
// codes: WARN_EXP_SKIN_BONES (18, SKIN >255 bones)  WARN_EXP_ANM_BONES (18, >255 animated bones; binhdr ANM_BONE_LIMIT is the engine-side error)
//   WARN_EXP_DUP_VOLUME / WARN_EXP_DUP_BONE (19)  WARN_EXP_VOL_CONVEX / WARN_EXP_VOL_MATRIX (20)  WARN_EXP_LOD_LINKED (21)
// vanilla contradicts two rules (209 LOD bones with view-carrying child bones, 232 mirrored volume matrices, 80 non-convex .vol): those two + non-convex polyhedra (80 vanilla .vol) are info only.
// FMT-21 only the LOD part is checkable from data: preview/skin-group/IK-type are 3ds Max scene concepts (IK type = binhdr MDL_BONE_TYPE).
// mdl text via lib/sdl (lenient tree, as binhdr/mdl.js): sdlx adds nothing here (no includes/macros in these blocks).
// --exe as64|mowas_2|mowas2|goh: the vfs view of that game (lib/games); none = as before (vfs picks: as64.exe first). mowas_2: no as64/core.
//   goh (--exe goh with no --game = the GoH install): same checks [I]: the GoH .anm and mesh readers are unchanged from AS2 (gohweb the game
//   binary animation Loader ReadBones '=', poly mesh ReadChunk '='); the limits are the AS2 exporter's (FMT-18..21), a GoH exporter limit is
//   not in the notes (info EXP_GOH_BASIS). <model>#<variant>.ply (GHFMT-10) is not named in the mdl and is not read.
// Author: Imperator_Aug (ARSENAL, ia-18528ae6)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const path = require('path');
const { build, readRec, closeRecs, dropped } = require('../lib/vfs'), names = require('../lib/names'), { createReport } = require('../lib/report');
const { readText } = require('../lib/enc'), sdl = require('../lib/sdl'), { Reader, BinError } = require('../lib/bin');
const ply = require('../lib/ply'), anm = require('../lib/anm');
const { rcPrint } = require('../lib/cli');
const games = require('../lib/games');

const lc = s => (s == null ? '' : String(s).toLowerCase());
const strOf = k => k.vals.find(v => v.t === 's');
const SKIN_MAX = 255, ANM_MAX = 255;

// .vol (EVLM): -> { verts: Float32 array(3n), idx: Uint16 array } | null
function readVol(buf) {
  const r = new Reader(buf);
  try {
    if (r.tag() !== 'EVLM') return null;
    let verts = null, idx = null;
    while (!r.eof()) {
      const t = r.tag();
      if (t === 'VERT') { const n = r.i32(); verts = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) verts[i] = r.f32(); }
      else if (t === 'INDX') { const n = r.i32(); idx = new Uint16Array(n); for (let i = 0; i < n; i++) idx[i] = r.u16(); }
      else if (t === 'SIDE') r.skip(r.i32());
      else return null;
    }
    return verts && idx ? { verts, idx } : null;
  } catch (e) { if (e instanceof BinError) return null; throw e; }
}

// first triangle whose plane has a vertex strictly outside -> index, else -1
function nonConvexTri(vol) {
  const { verts: V, idx: I } = vol, nv = V.length / 3;
  let lo = [1e30, 1e30, 1e30], hi = [-1e30, -1e30, -1e30];
  for (let i = 0; i < V.length; i++) { const a = i % 3; if (V[i] < lo[a]) lo[a] = V[i]; if (V[i] > hi[a]) hi[a] = V[i]; }
  const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
  const eps = diag * 1e-3;
  for (let t = 0; t + 2 < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (a >= nv || b >= nv || c >= nv) continue;
    const ux = V[b * 3] - V[a * 3], uy = V[b * 3 + 1] - V[a * 3 + 1], uz = V[b * 3 + 2] - V[a * 3 + 2];
    const wx = V[c * 3] - V[a * 3], wy = V[c * 3 + 1] - V[a * 3 + 1], wz = V[c * 3 + 2] - V[a * 3 + 2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz); if (l < 1e-9) continue;
    nx /= l; ny /= l; nz /= l;
    let pos = false, neg = false;
    for (let i = 0; i < nv; i++) {
      const d = nx * (V[i * 3] - V[a * 3]) + ny * (V[i * 3 + 1] - V[a * 3 + 1]) + nz * (V[i * 3 + 2] - V[a * 3 + 2]);
      if (d > eps) pos = true; else if (d < -eps) neg = true;
      if (pos && neg) return t / 3;
    }
  }
  return -1;
}

// 3x3 rows -> null | problem string (not orthogonal / mirrored)
function matrixProblem(m) {
  const r = [m.slice(0, 3), m.slice(3, 6), m.slice(6, 9)];
  const len = a => Math.hypot(a[0], a[1], a[2]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (r.some(a => len(a) < 1e-6)) return null;
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) if (Math.abs(dot(r[i], r[j])) / (len(r[i]) * len(r[j])) > 1e-3) return `rows ${i} and ${j} not orthogonal`;
  const c = [r[0][1] * r[1][2] - r[0][2] * r[1][1], r[0][2] * r[1][0] - r[0][0] * r[1][2], r[0][0] * r[1][1] - r[0][1] * r[1][0]];
  if (dot(c, r[2]) < 0) return 'determinant < 0 (mirror)';
  return null;
}

const KNOWN_BONE_KIDS = new Set(['bone']);
// mdl tree -> { bones: [{name,line}], volumes: [{name,line,vol,matrix}], plys:Set, anms:Set(file or default), lod: [{name,line}] }
function scanMdl(tree) {
  const o = { bones: [], volumes: [], plys: new Set(), anms: new Set(), lod: [] };
  const strs = n => n.vals.filter(v => v.t === 's').map(v => v.v);
  (function walk(n, inSkel) {
    for (const k of n.kids) {
      const nm = lc(k.name);
      if (nm === 'bone') {
        const name = strOf(k)?.v;
        if (name !== undefined && !name.includes('.')) o.bones.push({ name: lc(name), line: k.line });
        if (name !== undefined && !name.includes('.') && k.kids.some(c => lc(c.name) === 'lodview') && k.kids.some(c => lc(c.name) === 'bone' && c.kids.some(g => /view$/.test(lc(g.name))))) o.lod.push({ name, line: k.line });
        walk(k, true);
      } else if (nm === 'volume' && !inSkel) {
        const name = lc(strOf(k)?.v);
        const poly = k.kids.find(c => lc(c.name) === 'polyhedron');
        let matrix = null;
        for (const c of k.kids) {
          const cn = lc(c.name);
          if (cn === 'orientation' || cn === 'matrix34') { const a = c.vals.map(v => parseFloat(v.v)); if (a.length >= 9 && a.slice(0, 9).every(Number.isFinite)) matrix = { a, line: c.line, kind: c.name }; }
        }
        if (name) o.volumes.push({ name, line: k.line, vol: poly ? strs(poly)[0] : null, matrix });
      } else if (nm === 'sequence') {
        const f = k.kids.find(c => lc(c.name) === 'file');
        const s = strOf(k)?.v;
        if (f && f.vals[0]) o.anms.add(String(f.vals[0].v)); else if (s) o.anms.add(s + '.anm');
        walk(k, inSkel);
      } else if (nm === 'volumeview' || nm === 'view' || nm === 'lodview') {
        for (const s of strs(k)) if (/\.ply$/i.test(s)) o.plys.add(s);
        walk(k, inSkel);
      } else walk(k, inSkel);
    }
  })(tree, false);
  return o;
}

function check(opts) {
  const rep = createReport();
  const v = build({ gameDir: opts.gameDir, mods: opts.mods, exe: games.exeOf(opts.exe) || undefined });
  if (v.exe === 'goh') rep.info('expcheck', 0, 'EXP_GOH_BASIS', 'GoH: AS2 exporter limits (FMT-18..21) applied to GoH files; GoH readers unchanged from AS2, GoH exporter limits not in the notes [I]');
  // opts.folder (a folder outside <game>/mods given with --game): its resource/ is laid over the game vfs as layer 'folder'
  // and only those .mdl are checked (was: vanilla linted, folder ignored; COV-LINT expcheck-game)
  if (opts.folder) {
    const fs = require('fs'), root = path.resolve(opts.folder);
    const walk = (d, vr) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name), nm = names.normalize(e.name);
      if (e.isDirectory()) walk(p, vr + nm + '/');
      else v.files.set(vr + nm, { source: 'loose', container: root.replace(/\\/g, '/'), entry: path.relative(root, p).replace(/\\/g, '/'), layer: 'folder', size: fs.statSync(p).size });
    } };
    walk(path.join(root, 'resource'), 'resource/');
  }
  const modIds = new Set(v.mods), layerMod = l => l.replace(/ patch \d+$/, '');
  // --mods given: only the listed mods that mounted (every one dropped by the gate = nothing selected; was: every layer)
  const want = opts.mods ? new Set(opts.mods.map(m => names.normalize(String(m).split(':')[0]))) : null;
  const selected = rec => opts.folder ? rec.layer === 'folder' : opts.all || (want ? want.has(layerMod(rec.layer)) && modIds.has(layerMod(rec.layer)) : !modIds.size || modIds.has(layerMod(rec.layer)));
  const cache = new Map();
  const memo = (ck, fn) => { if (!cache.has(ck)) { const r = v.files.get(ck.slice(ck.indexOf(':') + 1)); cache.set(ck, r ? fn(readRec(r)) : null); } return cache.get(ck); };
  const stats = { mdl: 0, ply: 0, anm: 0, vol: 0 };
  for (const [key, rec] of v.files) {
    if (!key.endsWith('.mdl') || !selected(rec)) continue;
    const dir = key.slice(0, key.lastIndexOf('/'));
    try {
      const r = readText(readRec(rec), 'cp1251'); if (r.fatal) continue;
      const info = scanMdl(sdl.parseLines(r.lines, () => {}));
      stats.mdl++;
      // FMT-19
      const dup = (list, code, what) => { const seen = new Map(); for (const e of list) { if (seen.has(e.name)) rep.add(key, e.line, code, `${what} "${e.name}" already defined at line ${seen.get(e.name)}: exporter rejects duplicates; which one wins in engine unknown [T]`); else seen.set(e.name, e.line); } };
      dup(info.bones, 'WARN_EXP_DUP_BONE', 'bone'); dup(info.volumes, 'WARN_EXP_DUP_VOLUME', 'volume');
      // FMT-21
      for (const b of info.lod) rep.info(key, b.line, 'WARN_EXP_LOD_LINKED', `bone "${b.name}" has a {LODView} and a child bone carrying its own view: exporter requires LOD bones without linked objects [T]`);
      // FMT-18 skin
      for (const f of info.plys) {
        const pk = names.resolve(f, dir).key;
        const p = memo('ply:' + pk, buf => { stats.ply++; return ply.parse(buf); });
        if (p && p.skin && p.skin.length > SKIN_MAX && !p.reported) { p.reported = true; rep.add(pk, 0, 'WARN_EXP_SKIN_BONES', `SKIN has ${p.skin.length} bones (exporter limit <256) [T]`); }
      }
      for (const f of info.anms) {
        const ak = names.resolve(f, dir).key;
        const a = memo('anm:' + ak, buf => { stats.anm++; return anm.parseHeader(buf); });
        if (a && a.boneCount > ANM_MAX && !a.reported) { a.reported = true; rep.add(ak, 0, 'WARN_EXP_ANM_BONES', `${a.boneCount} animated bones (exporter limit 255) [T]`); }
      }
      // FMT-20
      for (const vo of info.volumes) {
        if (!vo.vol) continue;
        if (vo.matrix) { const mp = matrixProblem(vo.matrix.a); if (mp) (/mirror/.test(mp) ? rep.info : rep.add).call(rep, key, vo.matrix.line, 'WARN_EXP_VOL_MATRIX', `volume "${vo.name}" {${vo.matrix.kind}}: ${mp} (exporter requires orthogonal, no mirror) [T]`); }
        const vk = names.resolve(vo.vol, dir).key;
        const vd = memo('vol:' + vk, buf => { stats.vol++; const x = readVol(buf); if (x) x.bad = nonConvexTri(x); return x; });
        if (vd && vd.bad >= 0 && !vd.reported) { vd.reported = true; rep.info(vk, 0, 'WARN_EXP_VOL_CONVEX', `polyhedron not convex (triangle ${vd.bad} has vertices on both sides of its plane; used by ${key}) [T]`); }
      }
    } catch (e) { rep.add(key, 0, 'CRASH', e.message); }
  }
  rep.info('expcheck', 0, 'STATS', `${stats.mdl} mdl, ${stats.ply} ply, ${stats.anm} anm, ${stats.vol} vol read`);
  if (!stats.mdl) {
    console.error(`expcheck: 0 files read (no .mdl in ${opts.folder ? 'the folder' : 'the selected layers'})`);
    if (want && !opts.folder) for (const p of dropped(v)) console.error('expcheck: ' + p);   // a listed mod that did not mount: say why (vfs MOD_* line)
  }
  closeRecs();
  return { rep, stats };
}

if (require.main === module) {
  const args = process.argv.slice(2), o = {}, pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--game') o.gameDir = args[++i]; else if (a === '--mods') o.mods = args[++i].split(',').filter(Boolean);
    else if (a === '--exe') { o.exe = args[++i]; if (!games.get(o.exe)) { console.error('expcheck: --exe ' + o.exe + ': as64, mowas_2 (mowas2) or goh'); process.exit(2); } }
    else if (a === '--folder') o.folder = args[++i];
    else if (a === '--vfs') o.vfs = true; else if (a === '--all') o.all = true; else if (a === '--rc') o.rcFile = args[++i]; else if (a === '--no-rc') o.noRc = true;
    else if (a === '--format') o.format = args[++i]; else if (a === '-o') o.output = args[++i]; else if (a === '-q') o.q = true; else if (a === '--summary') o.summary = true; else pos.push(a);
  }
  const folder = o.folder || pos[0];
  if (o.exe && !o.gameDir && (games.kindOf(o.exe) === 'goh' || o.vfs || o.folder)) o.gameDir = games.install(o.exe).dir || undefined;
  if (!folder && !o.vfs || o.vfs && !o.gameDir || o.folder && !o.gameDir) { console.error('usage: expcheck <mod folder> --game dir [--mods a,b] [-q] [--summary] | --folder <dir> --game dir | --vfs --game dir | <fixture game dir>'); process.exit(2); }
  const opts = { gameDir: o.gameDir, mods: o.mods, all: o.all || o.vfs, exe: o.exe };
  if (o.folder) opts.folder = path.resolve(o.folder);
  else if (!o.vfs) {
    if (!o.gameDir) { opts.gameDir = folder; opts.all = true; }
    else if (!opts.mods && path.dirname(path.resolve(folder)).toLowerCase() === path.resolve(o.gameDir, 'mods').toLowerCase()) opts.mods = [names.normalize(path.basename(path.resolve(folder)))];   // the vfs keys mods by the lowercase folder name (VFS-12)
    else if (!opts.mods) opts.folder = folder;
  }
  const { rep } = check(opts);
  rcPrint(rep, o, folder || o.gameDir, 'expcheck', { showInfo: !o.q, byCode: true, summary: o.summary });
}
module.exports = { check, readVol, nonConvexTri, matrixProblem, scanMdl };
