#!/usr/bin/env node
// fxlint: sound/fx/weather/interaction-action set linter. rows VIS-09 VIS-14 VIS-18 VIS-19
//   node tools/fxlint/fxlint.js <mod folder> [--game dir] [--mods a,b] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary] | --vfs --game dir [--exe X]
//   --exe X  the game whose vfs view is read (lib/cli common option, lib/games): none = as before (as64 when as64.exe is in the folder);
//            mowas_2 = no as64/core; goh = the GoH install when no --game, and the action list actions-goh.json (GoH REGISTER_INTERACTION:
//            no get_off, adds unlink call_synced holder_drop set_idle_animation vehicle_health_damage_* linear_damping restore_volume_states
//            mark_for_persistence wind_detail_bending; gohweb interaction/goh-ia-action-set, GHINT-26 [V]). The list follows the vfs exe.
// codes
//   SND_TAG_UNKNOWN (VIS-09) sound folder.set `{tag x}` not effects|emotions|speech|environment -> GROUP_OTHER ( GetGroup)
//   IA_ACTION_UNKNOWN (VIS-18) interaction action name with no REGISTER_INTERACTION (e.g. `emit`) -> ERROR "unknown action" ( CreateAction); list = actions.json
//   WARN_ENV_NO_ENABLE (VIS-14) environment {weather}/{thunder} block without {enable}: enabled defaults false (unverified in 3.262; vanilla multi_10 has none)
//   THUNDER_NO_SOUND (VIS-14)      {thunder {enable}} with empty/absent sound: Strike never fires
//   FX_TRACER_UNLISTED (VIS-19) track `{Tracer {View "x"}}` entity not in fxmanager.set: warns and drops every trace
//   --restore-points  also read <mod folder>/.arsenal-undo (restore points; the game never mounts them, so off by default)
//   CLI lists the folder once and reads the walked files through the thread pool (checkAsync); check() = same findings, one at a time
// IA action walk: `{on ..}` bodies of set/interaction_entity + interaction_terrain roots (includes expanded); descends only through
//   action containers (actions.json containers: users). regen actions.json: node tools/fxlint/fxlint.js --regen-actions
// lib gap: none (lib/sdlset createSource + sdlx tree, keylint/model.parts for MOD-transparent blocks)
// Author: Imperator_Aug (ARSENAL, ia-1577b596)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const sdlset = require('../lib/sdlset'), sdlx = require('../lib/sdlx');
const { createReport, relPath } = require('../lib/report');
const M = require('../keylint/model'), fast = require('../strlint/fastread');

const ENTITY_ROOT = 'resource/set/interaction_entity/entity.set', TERRAIN_ROOT = 'resource/set/interaction_terrain/effects.set';
const FXMGR = 'resource/set/fxmanager.set';
const SND_GROUPS = new Set(['effects', 'emotions', 'speech', 'environment']);
const AC = JSON.parse(fs.readFileSync(path.join(__dirname, 'actions.json'), 'utf8'));
const ACTIONS = new Set(AC.actions), CONTAINERS = new Set(AC.containers);
let GOHAC = null;   // actions-goh.json, read when a GoH vfs is linted
const acFor = exe => { if (exe !== 'goh') return { ACTIONS, CONTAINERS }; if (!GOHAC) { const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'actions-goh.json'), 'utf8')); GOHAC = { ACTIONS: new Set(j.actions), CONTAINERS: new Set(j.containers) }; } return GOHAC; };
const tokText = t => t && (t.k === 'STRING' ? t.value : t.k === 'IDENT' ? t.text : null);
const keyOf = p => p.keyTok && p.keyTok.k === 'IDENT' ? p.keyTok.text.toLowerCase() : null;
const norm = s => s.toLowerCase().replace(/\\/g, '/').replace(/^\/+/, '');

const SND_RE = /^resource\/sound\/(.*\/)?folder\.set$/;
const isEnvKey = key => /^resource\/set\/environment\//.test(key) && key.endsWith('.set');
const isDefKey = key => /^resource\/entity\/.*\.(def|inc|ext|def1)$/.test(key) || /^resource\/set\/stuff\//.test(key);
// the check as steps: yields a Promise only while a read-ahead file (io.ra, async run) is still being read
function* steps(opts, io) {
  const rep = createReport();
  let mods = opts.mods;
  if (!mods && opts.folder && opts.gameDir && path.basename(path.dirname(path.resolve(opts.folder))).toLowerCase() === 'mods') mods = [path.basename(path.resolve(opts.folder))];
  const ra = io && io.ra;
  // each walked file and each include read once per run (fastread)
  const F = fast.wrap(sdlset.createSource({ gameDir: opts.gameDir, mods, folder: opts.folder, exe: opts.exe, ...fast.srcOpts(opts) }), ra), src = F.src;
  const { ACTIONS, CONTAINERS } = acFor(src.v ? src.v.exe : opts.exe);
  const items = new Map();
  if (opts.vfs) for (const t of src.vfsItems()) items.set(t.key, t);
  else { for (const t of src.modItems()) items.set(t.key, t); for (const t of src.folderItems()) items.set(t.key, t); }
  const mine = new Set(); for (const f of src.local.values()) mine.add(relPath(src.folder, f));
  const isMine = f => !!opts.vfs || mine.has(f) || src.isModKey(f);
  const loc = n => {   // report at the user's file; node from a vanilla include -> the including mod line
    if (isMine(n.file)) return { file: n.file, line: n.line, note: '' };
    let x = n.via; while (x && !isMine(x.file)) x = x.via;
    return x ? { file: x.file, line: x.line, note: ` [from ${n.file}:${n.line}]` } : null;
  };
  const done = new Set();
  const emit = (n, code, msg) => {
    const l = loc(n); if (!l) return;
    const dk = l.file + ':' + l.line + code + msg; if (done.has(dk)) return; done.add(dk);
    (code === 'WARN_ENV_NO_ENABLE' && (opts.vfs || /{thunder}/.test(msg)) ? rep.info : rep.add)(l.file, l.line, code, msg + l.note);   // vanilla baseline: 113 thunder + 1 weather blocks without {enable} (+ every thunder block in a mod: robz 297) -> info
  };
  const readKey = key => { const b = src.get(key); if (!b) return null; try { return sdlx.read(b, { file: src.local.has(key) ? relPath(src.folder, src.local.get(key)) : key, key, open: src.open, onError() {}, preInclude: src.preInclude(key) }); } catch (e) { return null; } };
  let files = 0;

  // fxmanager.set listed names (merged view: mod override wins)
  let listed = null;   // Set | false (no fxmanager.set visible)
  const fxl = () => {
    if (listed !== null) return listed;
    listed = new Set();
    const t = readKey(FXMGR); if (!t) { listed = null; return (listed = false); }
    (function w(n, root) { const p = M.parts(n, root); if (keyOf(p) === 'fx' && p.toks[0] && p.toks[0].k === 'STRING') listed.add(norm(p.toks[0].value)); for (const k of p.kids) w(k, false); })(t && t.root || { items: [] }, true);
    return listed;
  };

  // TST-83: weapon place {foresight F} + {linkbone L}: the aimer looks for F under L first, else the first bone named F anywhere
  const low = s => String(s).toLowerCase();
  const subs = (n, name) => { const out = []; (function f(list) { for (const it of list) { if (it.k === 'MOD') f(it.items); else if (it.k === 'BLOCK' && !it.disabled && it.items[0] && (it.items[0].k === 'IDENT' || it.items[0].k === 'STRING') && low(tokText(it.items[0])) === name) out.push(it); } })(n.items); return out; };
  const arg = b => { const v = b.items.slice(1).find(i => i.k === 'STRING'); return v ? v.value : null; };
  const mdlCache = new Map();
  const boneList = mkey => {   // [{name, anc:Set}] or null (no model / bones from files)
    if (mdlCache.has(mkey)) return mdlCache.get(mkey);
    let res = null; const buf = src.get(mkey);
    if (buf) {
      let r = null; try { r = sdlx.read(buf, { file: mkey, key: mkey, open: src.open, onError() {} }); } catch (e) {}
      if (r) {
        const list = []; let bad = false;
        const walkB = (n, anc) => { for (const b of subs(n, 'bone')) { const nm = b.items.find(i => i.k === 'STRING'); if (!nm) continue; if (nm.value.includes('.')) { bad = true; continue; } list.push({ name: low(nm.value), anc }); walkB(b, new Set([...anc, low(nm.value)])); } };
        for (const sk of subs(r.root, 'skeleton')) walkB(sk, new Set());
        res = bad || !list.length ? null : list;
      }
    }
    mdlCache.set(mkey, res); return res;
  };
  // does another place of the def aim with the very bone this place falls back to (first bone named fl)? only then do two weapons share a chain
  function shared(ge, bones, pl, fl) {
    const first = bones.findIndex(b => b.name === fl);
    for (const w of subs(ge, 'weaponry')) for (const o of subs(w, 'place')) {
      if (o === pl) continue;
      const of_ = subs(o, 'foresight')[0], ol = subs(o, 'linkbone')[0];
      const ofn = of_ && arg(of_) ? low(arg(of_)) : fl;   // no own foresight: the stuff's, unknown here -> assume same name
      if (ofn !== fl) continue;
      const oln = ol && arg(ol) ? low(arg(ol)) : null;
      const idx = oln ? bones.findIndex(b => b.name === fl && b.anc.has(oln)) : -1;
      if (idx >= 0 && idx === first) return true;
    }
    return false;
  }
  function foresightCheck(key, t) {
    if (!/foresight/i.test(Buffer.from(t.get()).toString('latin1'))) return;
    let r; try { r = src.read(t, () => {}); } catch (e) { r = null; }
    if (!r || !r.root) return;
    const ge = subs(r.root, 'game_entity')[0] || r.root;
    const ext = subs(ge, 'extension').find(b => /\.mdl$/i.test(arg(b) || ''));
    if (!ext) return;
    const s = String(arg(ext)).replace(/\\/g, '/').toLowerCase();
    const mkey = path.posix.normalize(s.startsWith('/') ? 'resource/' + s.slice(1) : key.slice(0, key.lastIndexOf('/') + 1) + s);
    const bones = boneList(mkey); if (!bones) return;
    for (const w of subs(ge, 'weaponry')) for (const pl of subs(w, 'place')) {
      const fs_ = subs(pl, 'foresight')[0], lb = subs(pl, 'linkbone')[0];
      const f = fs_ && arg(fs_), l = lb && arg(lb);
      if (!f || !l || f.includes('%') || l.includes('%')) continue;
      const fl = low(f), ll = low(l);
      const hasF = bones.some(b => b.name === fl), hasL = bones.some(b => b.name === ll);
      if (!hasF || !hasL) continue;
      if (!bones.some(b => b.name === fl && b.anc.has(ll)) && shared(ge, bones, pl, fl)) emit(fs_, 'WARN_FORESIGHT_NOT_UNDER_LINK', `place "${arg(pl) || ''}": foresight bone "${f}" is not under its linkbone "${l}": the aimer falls back to the first "${f}" bone anywhere in the model, so places can share one aim chain; add a "${f}" bone below "${l}" [I] (TST-83)`);
    }
  }

  const walked = key => SND_RE.test(key) || isEnvKey(key) || isDefKey(key);
  if (ra) for (const [key, t] of items) if (walked(key) && t.path) ra.add(key, t.path);
  for (const [key, t0] of items) {
    if (!walked(key)) continue;
    if (ra && t0.path) { const w = ra.wait(key); if (w) yield w; }
    try { checkFile(key, F.item(t0)); } finally { F.done(t0); }
  }
  function checkFile(key, t) {
    const isSnd = SND_RE.test(key), isEnv = isEnvKey(key), isDef = isDefKey(key);
    if (isDef && /^resource\/entity\/.*\.def$/.test(key)) foresightCheck(key, t);   // TST-83
    if (isDef && !/tracer/i.test(Buffer.from(t.get()).toString('latin1'))) return;
    let r; try { r = src.read(t, () => {}); } catch (e) { r = null; }
    if (!r || !r.root) return;
    files++;
    const walk = (node, isRoot, fn) => { const p = M.parts(node, isRoot); fn(node, p); for (const k of p.kids) walk(k, false, fn); };
    if (isSnd) walk(r.root, true, (n, p) => {
      if (keyOf(p) !== 'tag' || !p.toks[0]) return;
      const v = tokText(p.toks[0]); if (v === null || v.includes('%')) return;
      if (!SND_GROUPS.has(v.toLowerCase())) emit(n, 'SND_TAG_UNKNOWN', `sound tag "${v}" is not effects|emotions|speech|environment: falls to GROUP_OTHER (VIS-09)`);
    });
    if (isEnv) walk(r.root, true, (n, p) => {
      const k = keyOf(p); if (k !== 'weather' && k !== 'thunder') return;
      if (!p.kids.length && !p.toks.length) return;
      const en = p.kids.find(c => keyOf(M.parts(c, false)) === 'enable');
      if (!en) return emit(n, 'WARN_ENV_NO_ENABLE', `{${k}} has no {enable}: block is off per source (default false) (VIS-14)`);
      if (k === 'thunder') {
        const sn = p.kids.map(c => M.parts(c, false)).find(q => keyOf(q) === 'sound');
        const v = sn && sn.toks[0] ? tokText(sn.toks[0]) : '';
        if (!v) emit(n, 'THUNDER_NO_SOUND', 'thunder is enabled but has no/empty {sound}: it never strikes (VIS-14)');
      }
    });
    if (isDef) walk(r.root, true, (n, p) => {
      if (keyOf(p) !== 'tracer') return;
      const vw = p.kids.map(c => ({ c, q: M.parts(c, false) })).find(x => keyOf(x.q) === 'view');
      const v = vw && vw.q.toks[0] && vw.q.toks[0].k === 'STRING' ? vw.q.toks[0].value : null;
      if (v && !v.includes('%') && fxl() && !fxl().has(norm(v))) emit(vw.c, 'FX_TRACER_UNLISTED', `track Tracer view "${v}" not listed in fxmanager.set: 'must be defined in fxmanager.set before add', no traces (VIS-19)`);
    });
  }

  // VIS-18: unknown interaction action names
  const actWalk = (n, isRoot, inBody) => {
    const p = M.parts(n, isRoot), key = keyOf(p);
    if (!isRoot && inBody) {
      if (key && !key.includes('%') && !ACTIONS.has(key)) emit(n, 'IA_ACTION_UNKNOWN', `unknown interaction action "${key}" (no REGISTER_INTERACTION; engine logs unknown action) (VIS-18)`);
      if (key && !CONTAINERS.has(key)) return;
      for (const k of p.kids) actWalk(k, false, true);
      return;
    }
    if (key === 'on') { for (const k of p.kids) actWalk(k, false, true); return; }
    for (const k of p.kids) actWalk(k, false, false);
  };
  for (const root of [ENTITY_ROOT, TERRAIN_ROOT]) { const r = readKey(root); if (r && r.root) { files++; actWalk(r.root, true, false); } }
  return { rep, files, own: opts.vfs ? null : items.size };
}
// check(opts) -> { rep, files, own }   sync, files read one at a time
// opts: { folder|vfs, gameDir, mods, exe, restorePoints (also read <folder>/.arsenal-undo, off by default), listing }
function check(opts) { return fast.drive(steps(opts, null)); }
// checkAsync(opts) -> Promise<same>: the folder listed once through the thread pool, walked files read ahead
// checkAsync(opts, ra): ra = a readAhead stand-in to read through (lib/modset read-once pass, ctx.js), closed at the end
async function checkAsync(opts, ra0) {
  const { opts: o, ra } = await fast.prepare(opts, ra0);
  try { return await fast.driveAsync(steps(o, { ra })); } finally { if (ra) ra.close(); }
}

function regen() {
  const out = new Set();
  const root = path.join(__dirname, '..', '..');
  (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) w(f); else if (/\.cpp$/.test(e.name)) for (const m of fs.readFileSync(f, 'utf8').matchAll(/^REGISTER_INTERACTION\((\w+),/gm)) out.add(m[1]); } })(path.join(root, 'game'));
  fs.writeFileSync(path.join(__dirname, 'actions.json'), JSON.stringify(Object.assign({}, AC, { actions: [...out].sort() }), null, 1) + '\n');
  console.log(out.size + ' actions');
}

const cli = require('../lib/cli');
// thread pool 16 (libuv default 4): more reads queued at the disk at once (as keylint)
if (require.main === module && !process.env.UV_THREADPOOL_SIZE) process.env.UV_THREADPOOL_SIZE = '16';
// main(argv, {ra}): the CLI (and ctx.js, the read-once module form, with the pass's reader as ra)
async function main(argv, { ra } = {}) {
  const p = cli.parse(argv, { flags: ['--vfs', '--regen-actions', '--restore-points'] });
  if (p.x['regen-actions']) { regen(); process.exit(0); }
  const o = { gameDir: p.gameDir || undefined, mods: p.mods.length ? p.mods : undefined, vfs: p.x.vfs, folder: p.pos[0], exe: p.exe };
  if (p.x['restore-points']) o.restorePoints = true;
  if (!o.folder && !o.vfs || o.vfs && !o.gameDir) { console.error('usage: node tools/fxlint/fxlint.js <mod folder> [--game dir] [--mods a,b] [--exe as64|mowas_2|mowas2|goh] [--restore-points] [-q] [--summary] [--format text|json|sarif|html|csv] [-o file] [--rc file|--no-rc] | --vfs --game <dir>'); process.exit(2); }
  const { rep, files, own } = await checkAsync(o, ra);
  cli.printReport(rep, p, { tool: 'fxlint' });
  if (p.format === 'text' && !p.output) console.log(`${files} files`); else console.error(`${files} files`);
  if (own === 0) console.error('fxlint: 0 files from the folder: nothing of the mod linted (the count above is mounted game roots)');   // COV-LINT: was silent on an empty folder
}
if (require.main === module) cli.run(() => main(process.argv.slice(2)));
module.exports = { check, checkAsync, main };
