#!/usr/bin/env node
// Author: Imperator_Aug (ARSENAL, ia-74b4ebc0)
'use strict';
// covanm (COV-ANM stage 0): edit a vanilla .anm through the GEM2 Blender add-on, background-render set frames original vs edited, compare.
//   node tools/covanm/covanm.js [--case NAME,...|all] [--game DIR] [--exe as64|mowas_2|mowas2|goh] [--run DIR] [--blender EXE] [--list] [--parse] [--check-addon] [--help]
// Reads vanilla .anm + sibling files from the game's paks (read-only); writes only under RUN (default ../run/covanm).
// Blender add-on: the GEM2 add-on folder (gem2_engine_tools, holds __init__.py) is not shipped with the toolkit. Set COVANM_ADDON to it;
//   without it covanm looks in ../run/blen-test/scripts/addons/gem2_engine_tools (dev layout). --check-addon: exit 0 if found, 3 if not.
// Starts only `blender --background`, with BLENDER_USER_SCRIPTS/CONFIG inside RUN. The profile is installed by tools/blen/install.js.
// Per case: orig run (import, render, control export, edit, edited export) + two re-import runs (control, edited).
// Pass = control export changes nothing in frames; edited export differs from original only on the edited frames. Not-reimportable items listed.
// Games (lib/games): --exe as64|mowas_2|mowas2|goh. --game default: games.install(exe) (no --exe: the AS2 install through gamedir.resolve).
//   as64: base resource paks, then the as64/core/resource paks over them (vfs 3c); mowas_2: base only. goh: the GoH resource tree and
//   the GoH cases (GOH_CASES, vanilla GoH files; .anm version 0x60001, same chunks as AS2, formats/anm + goh-mdl-animation [V]).
//   Whether the GEM2 add-on imports/exports a 0x60001 file is not known: a GoH Blender run is the check [T].
//   --parse: no Blender; parse every chosen case's .anm from the paks with anmparse, print version/frames/bones/categories; exit 1 on a parse error.
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const ps = require('../lib/pakset.js');
const A = require('./anmparse.js');

const SRC = path.resolve(__dirname, '..', '..');
const games = require('../lib/games.js');
// one case per category (sheet Q74). edit: 'pose' = rotate first keyed bone 25deg on 3 mid frames; 'visibility' = move first show/hide event 1 frame
const CASES = {
  rigid:      { cat: 'FRM2 rigid part (1 bone)',      anm: 'entity/-vehicle/cannon/m8_howitzer/gun_r.anm',    edit: 'pose' },
  skeletal:   { cat: 'FRM2 skeletal (47 bones)',      anm: 'entity/-vehicle/tank_light/ha-go/open.anm',        edit: 'pose' },
  matrix:     { cat: 'FRMN matrix (0x50000, 48 bones)', anm: 'entity/-vehicle/airborne/cg-4a/open.anm',        edit: 'pose', deg: 90 },  // door_pilot drives only 12 verts: 25 deg is under the pixel noise floor
  visibility: { cat: 'show/hide flags (add event)',   anm: 'entity/-vehicle/marine/lcvp/dooropen.anm',         edit: 'visadd' },
  vismove:    { cat: 'show/hide flags (move event)',  anm: 'entity/-vehicle/marine/lcvp/dooropen.anm',         edit: 'vismove' },
  mesh:       { cat: 'mesh-morph payload',            anm: 'entity/construction/dok/u_boat_trap_1/land.anm',   edit: 'pose' },
};
// GoH (--exe goh): vanilla GoH files of the same categories, all .anm v0x60001 with an .mdl beside them (picked by a scan of the GoH paks,
// 2026-11-14). No FRMN matrix .anm under GoH entity/-vehicle, so no matrix case.
const GOH_CASES = {
  rigid:      { cat: 'FRM2 rigid part (1 bone)',      anm: 'entity/-vehicle/eng/airborne/blenheim_mk1_eng/open.anm',          edit: 'pose' },
  skeletal:   { cat: 'FRM2 skeletal (26 bones)',      anm: 'entity/-vehicle/eng/airborne/hurribomber_mk2c/wheels.anm',        edit: 'pose' },
  visibility: { cat: 'show/hide flags (add event)',   anm: 'entity/-vehicle/eng/airborne/blenheim_mk1_eng/bomb_open.anm',     edit: 'visadd' },
  vismove:    { cat: 'show/hide flags (move event)',  anm: 'entity/-vehicle/eng/airborne/blenheim_mk1_eng/bomb_open.anm',     edit: 'vismove' },
  mesh:       { cat: 'mesh-morph payload',            anm: 'entity/-vehicle/eng/airborne/hurribomber_mk2c/engine_stop.anm',   edit: 'pose' },
};

function arg(n, d) { const i = process.argv.indexOf('--' + n); return i < 0 ? d : process.argv[i + 1]; }
function die(m) { console.error('covanm: ' + m); process.exit(1); }
const RUN = path.resolve(arg('run', path.join(SRC, '..', 'run', 'covanm')));
const EXE = arg('exe', null);
if (EXE != null && !games.get(EXE)) { console.error('covanm: unknown --exe ' + EXE + ' (as64, mowas_2, mowas2, goh)'); process.exit(2); }
const ID = EXE ? games.idOf(EXE) : null;
// lazy: --list / --check-addon / --help need no install
let GAME_ = null;
const GAME = () => GAME_ || (GAME_ = arg('game', null) || (ID ? games.install(ID).dir : require('../lib/gamedir').resolve().dir) || die('no game folder (give --game, or set the install up for lib/gamedir)'));
const casesFor = id => (id === 'goh' ? GOH_CASES : CASES);
// pak entries of the chosen game: base resource, then (as64 only) as64/core/resource; later entries win in extract()
function gameEntries(game, id) {
  const opened = [ps.open(path.join(game, 'resource'), null)];
  if (id === 'as64' && fs.existsSync(path.join(game, 'as64', 'core', 'resource'))) opened.push(ps.open(path.join(game, 'as64', 'core', 'resource'), null));
  return { entries: [].concat(...opened.map(o => o.entries)), close() { for (const o of opened) o.close(); } };
}
// --parse: anmparse over each case's .anm, no Blender
function parseCases(names, cases, entries) {
  const rows = [];
  for (const n of names) {
    const c = cases[n], e = [...entries].reverse().find(x => x.key === c.anm);
    if (!e) { rows.push({ name: n, anm: c.anm, error: 'not in the paks' }); continue; }
    const a = A.parse(ps.read(e));
    rows.push({ name: n, anm: c.anm, version: a.version.toString(16), frames: a.frames, bones: a.bones.length, cats: [...A.category(a)], error: a.error });
  }
  return rows;
}
const norm = p => p.replace(/\\/g, '/');
function inRun(p) { const r = path.resolve(p); if (!(r + path.sep).startsWith(RUN + path.sep) && r !== RUN) die('refusing path outside RUN: ' + p); return r; }

function findBlender() {
  const e = arg('blender', null), plat = require('../lib/platform');
  if (e) return plat.findProgram({ exe: 'blender', path: e }, { env: {} }) || die('--blender not found: ' + e);
  return plat.findBlender() || die('Blender not found (set BLENDER or use --blender)');
}

const addonSrc = () => process.env.COVANM_ADDON || path.join(SRC, '..', 'run', 'blen-test', 'scripts', 'addons', 'gem2_engine_tools');
const profileAddon = () => path.join(RUN, 'profile', 'scripts', 'addons', 'gem2_engine_tools');
function ensureProfile() {
  const scripts = path.join(RUN, 'profile', 'scripts'), cfgd = path.join(RUN, 'profile', 'config');
  const tgt = path.join(scripts, 'addons', 'gem2_engine_tools');
  fs.mkdirSync(scripts, { recursive: true }); fs.mkdirSync(cfgd, { recursive: true });
  if (!fs.existsSync(path.join(tgt, '__init__.py'))) {
    const from = addonSrc();
    if (!fs.existsSync(path.join(from, '__init__.py'))) die('GEM2 Blender add-on not found at ' + norm(from) + ' (set COVANM_ADDON to the gem2_engine_tools folder)');
    const r = spawnSync(process.execPath, [path.join(SRC, 'tools', 'blen', 'install.js'), '--from', from, '--blender', findBlender()],
      { encoding: 'utf8', env: Object.assign({}, process.env, { BLENDER_USER_SCRIPTS: scripts, BLENDER_USER_CONFIG: cfgd }) });
    console.log((r.stdout || '').trim().split('\n').slice(-3).join('\n'));
    if (r.status !== 0) die('install.js failed: ' + (r.stderr || '') + (r.stdout || '').slice(-300));
  }
  return { scripts, cfgd };
}

function blender(prof, cfg, tag) {
  const cj = inRun(path.join(RUN, 'work', tag + '.json')); fs.writeFileSync(cj, JSON.stringify(cfg));
  const r = spawnSync(findBlender(), ['--background', '--factory-startup', '--python', path.join(__dirname, 'driver.py'), '--', cj],
    { encoding: 'utf8', timeout: 600000, maxBuffer: 1 << 27, env: Object.assign({}, process.env, { BLENDER_USER_SCRIPTS: prof.scripts, BLENDER_USER_CONFIG: prof.cfgd }) });
  fs.writeFileSync(path.join(RUN, 'work', tag + '.log'), (r.stdout || '') + (r.stderr || ''));
  let res = null; try { res = JSON.parse(fs.readFileSync(cfg.result, 'utf8')); } catch (e) { }
  return { res, status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

function extract(name, c, entries) {
  const dir = c.anm.slice(0, c.anm.lastIndexOf('/'));
  const dst = inRun(path.join(RUN, 'src', name));
  fs.mkdirSync(dst, { recursive: true });
  const files = entries.filter(e => e.key.slice(0, e.key.lastIndexOf('/')) === dir);
  for (const e of files) fs.writeFileSync(path.join(dst, e.key.slice(dir.length + 1)), ps.read(e));
  const mdl = files.filter(e => e.name.endsWith('.mdl')).map(e => e.key.slice(dir.length + 1));
  const anmName = c.anm.slice(dir.length + 1);
  return { dst, files: files.length, mdl, anm: path.join(dst, anmName), anmName };
}

function runCase(name, c, prof, entries) {
  const ex = extract(name, c, entries);
  if (!ex.mdl.length) return { name, cat: c.cat, error: 'no .mdl beside the anm' };
  const W = path.join(RUN, 'work', name), O = path.join(RUN, 'out', name), S = path.join(RUN, 'shots', name);
  for (const d of [W, O, S]) fs.mkdirSync(inRun(d), { recursive: true });
  const anmName = ex.anmName;
  const files = { ctl: path.join(O, 'ctl_' + anmName), edit: path.join(O, anmName) };
  const base = { model: path.join(ex.dst, ex.mdl[0]), shots: S, dump: path.join(W, 'orig_dump.json') };
  const out = { name, cat: c.cat, anm: c.anm, model: ex.mdl[0], editKind: c.edit, files: ex.files };
  const pre = A.parse(fs.readFileSync(ex.anm));
  const movers = pre.recs.filter(r => r.pos || r.rot || r.matr).map(r => r.bone);
  const ebs = [...new Set((movers.length ? movers : [0]).map(i => pre.bones[i]))].slice(0, 80);  // bones the vanilla file really moves; the driver takes the first that drives geometry
  const o = blender(prof, Object.assign({}, base, { phase: 'orig', anm: ex.anm, edit_bones: ebs, result: path.join(W, 'orig.json'), export_ctl: files.ctl, export_edit: files.edit, edit: c.edit, deg: c.deg || 25 }), name + '_orig');
  out.orig = o.res; out.editBone = o.res && o.res.edit_bone; if (!o.res || o.res.errors.length || !fs.existsSync(files.edit)) { out.error = 'orig run failed: ' + ((o.res && o.res.errors[0]) || o.out.slice(-400)).split('\n').slice(-4).join(' | '); return out; }
  for (const [k, f] of [['ctl', files.ctl], ['edit', files.edit]]) {
    const r = blender(prof, Object.assign({}, base, { phase: 'reimp', tag: k, anm: f, frames: o.res.frames, result: path.join(W, k + '.json') }), name + '_' + k);
    out[k] = r.res; if (!r.res || r.res.errors.length) out[k + 'Error'] = ((r.res && r.res.errors[0]) || r.out.slice(-400)).split('\n').slice(-4).join(' | ');
  }
  // binary level
  const orig = A.parse(fs.readFileSync(ex.anm));
  const bin = f => { try { return A.parse(fs.readFileSync(f)); } catch (e) { return null; } };
  const ctlB = bin(files.ctl), edB = bin(files.edit);
  out.bin = { orig: sum(orig), ctl: ctlB && sum(ctlB), edit: edB && sum(edB), sizes: [fs.statSync(ex.anm).size, ctlB ? fs.statSync(files.ctl).size : 0, edB ? fs.statSync(files.edit).size : 0] };
  const sameKind = (a, b) => { const x = A.diffRecs(a, b, 1e-4); const k = {}; for (const d of x) k[d.what] = (k[d.what] || 0) + 1; return { n: x.length, kinds: k, frames: [...new Set(x.map(d => d.frame))].sort((p, q) => p - q) }; };
  if (ctlB) out.bin.origVsCtl = sameKind(orig, ctlB);
  if (edB) out.bin.ctlVsEdit = ctlB ? sameKind(ctlB, edB) : null;
  if (edB) out.bin.origVsEdit = sameKind(orig, edB);
  // frame verdicts
  const editF = new Set(o.res.edit_frames);
  // pixel noise floor: re-baked quaternions drift below the 1e-4 pose tolerance and flip a few edge pixels (measured 2-20 px of 120000); real edits were >3000
  const NOISE = 60;
  const allRows = (r) => r ? Object.entries(r.img_diff_pixels).map(([k, n]) => ({ view: k.split(':')[0], frame: +k.split(':')[1], n })) : [];
  const imgRows = (r) => allRows(r).filter(x => x.n > NOISE);
  out.verdict_noise = { floorPx: NOISE, maxCtl: Math.max(0, ...allRows(out.ctl).map(x => x.n)), maxEditOutside: Math.max(0, ...allRows(out.edit).filter(x => !new Set(o.res.edit_frames).has(x.frame)).map(x => x.n)), minEditInside: Math.min(...allRows(out.edit).filter(x => new Set(o.res.edit_frames).has(x.frame)).map(x => x.n)) };
  const poseF = (r) => r ? [...new Set(r.pose_diff.map(d => d[0]))].sort((a, b) => a - b) : null;
  out.verdict = {
    editFrames: [...editF],
    ctlPoseDiffFrames: poseF(out.ctl), ctlImgDiff: imgRows(out.ctl).filter(r => r.n > 0),
    editPoseDiffFrames: poseF(out.edit), editImgDiffFrames: [...new Set(imgRows(out.edit).filter(r => r.n > 0).map(r => r.frame))].sort((a, b) => a - b),
  };
  const outside = (fr) => fr ? fr.filter(f => !editF.has(f)) : null;
  out.verdict.editPoseOutside = outside(out.verdict.editPoseDiffFrames);
  out.verdict.editImgOutside = outside(out.verdict.editImgDiffFrames);
  out.verdict.pass = !!(out.ctl && out.edit && out.verdict.ctlPoseDiffFrames.length === 0 && out.verdict.ctlImgDiff.length === 0 &&
    out.verdict.editPoseOutside.length === 0 && out.verdict.editImgOutside.length === 0 && out.verdict.editPoseDiffFrames.length > 0);
  if (/^vis/.test(c.edit) && edB && o.res.vis_edit) {
    const [vf, vb, vflag] = o.res.vis_edit, has = f => edB.recs.some(r => r.frame === f && edB.bones[r.bone] === vb && (vflag & 16 ? r.hide : r.show));
    out.verdict.visEdit = o.res.vis_edit; out.verdict.visibilityEditHonored = has(vf) && (c.edit === 'visadd' || !has(vf - 1));
  }
  out.verdict.renderSeesEdit = out.verdict.editImgDiffFrames.length > 0;
  return out;
}
function sum(a) { const c = A.category(a); return { version: a.version.toString(16), frames: a.frames, bones: a.bones.length, recs: a.recs.length, cats: [...c], error: a.error }; }

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) { for (const l of fs.readFileSync(__filename, 'utf8').split('\n').slice(2)) { if (!l.startsWith('//')) break; console.log(l.replace(/^\/\/ ?/, '').trimEnd()); } return; }
  if (process.argv.includes('--check-addon')) {
    if (fs.existsSync(path.join(profileAddon(), '__init__.py'))) { console.log('addon: installed in ' + norm(profileAddon())); return; }
    if (fs.existsSync(path.join(addonSrc(), '__init__.py'))) { console.log('addon: ' + norm(addonSrc())); return; }
    console.log('addon not found: ' + norm(addonSrc()) + ' (set COVANM_ADDON)'); process.exit(3);
  }
  const cases = casesFor(ID);
  if (process.argv.includes('--list')) { for (const [k, c] of Object.entries(cases)) console.log(k, '|', c.cat, '|', c.anm, '|', c.edit); return; }
  const names = (arg('case', 'all') === 'all') ? Object.keys(cases) : arg('case').split(',');
  for (const n of names) if (!cases[n]) die('no case ' + n + (ID ? ' for ' + games.get(ID).name : '') + ' (cases: ' + Object.keys(cases).join(', ') + ')');
  if (process.argv.includes('--parse')) {
    const s = gameEntries(GAME(), ID);
    let rows; try { rows = parseCases(names, cases, s.entries); } finally { s.close(); }
    for (const r of rows) console.log((r.error ? 'ERR  ' : 'OK   ') + r.name + ' ' + r.anm + (r.error ? ' ' + r.error : ' v' + r.version + ' frames ' + r.frames + ' bones ' + r.bones + ' ' + r.cats.join(',')));
    process.exitCode = rows.some(r => r.error) ? 1 : 0;
    return;
  }
  fs.mkdirSync(RUN, { recursive: true }); fs.mkdirSync(path.join(RUN, 'work'), { recursive: true });
  const prof = ensureProfile();
  const s = gameEntries(GAME(), ID);
  const res = [];
  try { for (const n of names) { console.log('== ' + n); const r = runCase(n, cases[n], prof, s.entries); res.push(r); console.log(JSON.stringify(r.verdict || r.error)); } }
  finally { s.close(); }
  fs.writeFileSync(path.join(RUN, 'result.json'), JSON.stringify(res, (k, v) => (v && v.type === 'Buffer') ? undefined : v, 1));
  console.log('result: ' + path.join(RUN, 'result.json'));
  for (const r of res) console.log((r.verdict ? (r.verdict.pass ? 'PASS ' : 'FAIL ') : 'ERR  ') + r.name + (r.error ? ' ' + r.error : ''));
}
main();
