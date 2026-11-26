#!/usr/bin/env node
// movlint: vehicle movement/chassis linter. rows MOV-01 MOV-20 (MOV-02/13/26 = keylint GEARS_BAD/WARN_PATHER_UNKNOWN/COLLIDER_IDS_MAX; MOV-29 unreachable, see REPORT.json)
// usage: node tools/movlint/movlint.js <mod folder> [--game <dir>] [--mods a,b] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary]
//        node tools/movlint/movlint.js --vfs --game <dir> [--mods a,b] [--exe X]   (whole mounted vfs)
//   --exe X  the game whose vfs view is read (lib/cli common option, lib/games): none = as before (as64 when as64.exe is in the folder);
//            mowas_2 = no as64/core; goh = the GoH install when no --game. GoH Locomotion also reads Slow Normal Fast (GHMOV-44 [V]) and
//            CostFactor (GHMOV-45 [V]): no MOV_LOCO_KEY for them when the vfs exe is goh.
// codes:
//   MOV_LOCO_KEY {Chassis {Locomotion {X}}} key the engine switch does not read -> "unexpected token" (MOV-01, ReadKeyword)
//   MOV_PIVOT_MISSING wheel/water chassis whose .mdl skeleton lacks bone pivot_front and/or pivot_back -> warning, wheel geometry defaults (MOV-20, InitWheels)
//   MOV_WHEEL_RADIUS_ZERO basis bone param WheelRadius=0 -> error "Wheel radius is zero" (MOV-20, InitWheels)
//   MOV_BONE_RADIUS_ZERO wheel* revolute bone param radius=0 (|r*unitsPerMeter|<1e-5) -> error "Invalid bone radius" (MOV-20)
//   --restore-points  also read <mod folder>/.arsenal-undo (restore points; the game never mounts them, so off by default)
//   CLI lists the folder once and reads the defs through the thread pool (checkAsync); check() = same findings, one file at a time
// chassis type = last string-valued {Chassis "type"} in the flattened def (includes expanded); Locomotion is only read by vehicle chassis types.
// Author: Imperator_Aug (ARSENAL, ia-d2d16c16)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const path = require('path');
const sdlset = require('../lib/sdlset'), sdlx = require('../lib/sdlx');
const { createReport } = require('../lib/report'), cli = require('../lib/cli');
const fast = require('../strlint/fastread');

const low = s => String(s).toLowerCase();
const LOCO_KEYS = new Set(['maxspeed', 'maxspeedatmaxturn', 'starttime', 'braketime', 'stoptime', 'turnradius', 'turntime', 'turnstart', 'turnstop',
  'gears', 'reargears', 'steeron', 'steeroff', 'splineradius', 'maxslope', 'fallslope', 'gearswitchdelay']);   //  ReadKeyword Locomotion switch
const LOCO_KEYS_GOH = new Set([...LOCO_KEYS, 'slow', 'normal', 'fast', 'costfactor']);   // GoH ReadKeyword: GHMOV-44 GHMOV-45 [V]
const VEHICLE = new Set(['wheel', 'track', 'railway', 'water', 'airborne', 'torpedo']);   // ReadKeyword reached (chassis vehicle derivatives)
const PIVOT_TYPES = new Set(['wheel', 'water']);          //  (airborne also calls it, kept out: no vanilla evidence)
const RADIUS_TYPES = new Set(['wheel', 'track', 'railway', 'water', 'airborne']);   //  via derived classes

function* blocks(node) {
  for (const it of node.items) {
    if (it.k === 'BLOCK') { if (!it.disabled) yield it; }
    else if (it.k === 'MOD') yield* blocks(it);
  }
}
const nameOf = b => { const f = b.items[0]; return f && (f.k === 'IDENT' || f.k === 'STRING') ? low(f.k === 'STRING' ? f.value : f.text) : ''; };
const vals = b => b.items.slice(1).filter(i => i.k !== 'BLOCK' && i.k !== 'MOD');
const strVal = b => { const v = vals(b)[0]; return v ? (v.k === 'STRING' ? v.value : v.k === 'IDENT' ? v.text : String(v.value)) : null; };
const sub = (b, name) => [...blocks(b)].filter(x => nameOf(x) === name);
const own = (n, file) => n.file === file && !n.via;
function walkAll(node, fn) { for (const b of blocks(node)) { fn(b); walkAll(b, fn); } }
function resolveRel(val, fromKey) {
  const s = String(val).replace(/\\/g, '/').toLowerCase();
  if (s.startsWith('/')) return path.posix.normalize('resource/' + s.slice(1));
  return path.posix.normalize(fromKey.slice(0, fromKey.lastIndexOf('/') + 1) + s);
}
// bone parameter string "A=1;B=2;" -> Map(lowercase key -> value text)
function params(bone) {
  const m = new Map();
  for (const p of sub(bone, 'parameters')) {
    const s = strVal(p) || '';
    for (const kv of s.split(';')) { const i = kv.indexOf('='); if (i > 0) m.set(low(kv.slice(0, i).trim()), kv.slice(i + 1).trim()); }
  }
  return m;
}
const isZero = txt => txt !== undefined && Math.abs(parseFloat(txt) || 0) < 1e-5;   // FromStr of junk = 0

const DEF_RE = /^resource\/entity\/.*\.def$/;
// the check as steps: yields a Promise only while a read-ahead file (io.ra, async run) is still being read
function* steps(opts, io) {
  const rep = createReport();
  let mods = opts.mods;
  if (!mods && opts.folder && opts.gameDir && path.basename(path.dirname(path.resolve(opts.folder))).toLowerCase() === 'mods') mods = [path.basename(path.resolve(opts.folder))];
  const ra = io && io.ra;
  // each def and each include read once per run (fastread)
  const F = fast.wrap(sdlset.createSource({ gameDir: opts.gameDir, mods, folder: opts.folder, exe: opts.exe, ...fast.srcOpts(opts) }), ra), src = F.src;
  const locoKeys = (src.v ? src.v.exe : opts.exe) === 'goh' ? LOCO_KEYS_GOH : LOCO_KEYS;
  const items = new Map();
  if (opts.vfs) for (const t of src.vfsItems()) items.set(t.key, t);
  else { for (const t of src.modItems()) items.set(t.key, t); for (const t of src.folderItems()) items.set(t.key, t); }

  // model facts (cached per mdl key)
  const mdlCache = new Map();
  function loadMdl(key) {
    if (mdlCache.has(key)) return mdlCache.get(key);
    let info = null;
    const buf = src.get(key);
    if (buf) {
      const r = sdlx.read(buf, { file: key, key, open: src.open, onError: () => {} });
      info = { bones: new Set(), fileBones: false, skelLine: 0, basis: null, wheels: [] };
      walkAll(r.root, b => {
        if (nameOf(b) !== 'skeleton') return;
        if (!info.skelLine) info.skelLine = b.line;
        walkAll(b, x => {
          if (nameOf(x) !== 'bone') return;
          const vs = vals(x), nm = vs.filter(v => v.k === 'STRING' || v.k === 'IDENT').map(v => v.k === 'STRING' ? v.value : v.text);
          const revolute = vs.some(v => v.k === 'IDENT' && low(v.text) === 'revolute');
          const name = vs.find(v => v.k === 'STRING');
          if (!name) return;
          if (name.value.includes('.')) { info.fileBones = true; return; }
          const ln = low(name.value);
          info.bones.add(ln);
          if (ln === 'basis' && !info.basis) info.basis = { line: x.line, p: params(x) };
          if (revolute && ln.startsWith('wheel')) info.wheels.push({ name: name.value, line: x.line, p: params(x) });
        });
      });
    }
    mdlCache.set(key, info);
    return info;
  }

  let files = 0;
  const seen = new Set();   // mdl|code dedupe: one finding per model
  if (ra) for (const [key, t] of items) if (DEF_RE.test(key) && t.path) ra.add(key, t.path);
  for (const [key, t0] of items) {
    if (!DEF_RE.test(key)) continue;
    if (ra && t0.path) { const w = ra.wait(key); if (w) yield w; }
    try { checkDef(key, F.item(t0)); } finally { F.done(t0); }
  }
  return { rep, files };

  function checkDef(key, t) {
    let r; try { r = src.read(t, () => {}); } catch (e) { r = null; }
    if (!r) return;
    files++;
    const ge = [...blocks(r.root)].find(b => nameOf(b) === 'game_entity') || r.root;
    let type = null;
    const chassis = sub(ge, 'chassis');
    for (const c of chassis) if (vals(c)[0] && vals(c)[0].k === 'STRING') type = low(vals(c)[0].value);

    // MOV-01
    if (type === null || VEHICLE.has(type)) {
      for (const c of chassis) for (const l of sub(c, 'locomotion')) {
        for (const k of blocks(l)) {
          if (!own(k, t.file)) continue;
          const kn = nameOf(k);
          if (kn && !locoKeys.has(kn)) rep.add(t.file, k.line, 'MOV_LOCO_KEY', `Locomotion key "${k.items[0].k === 'STRING' ? k.items[0].value : k.items[0].text}" is not read by the engine: "unexpected token" (MOV-01)`);
        }
      }
    }
    // MOV-20: model facts. extension of the flattened def; report on the mdl when it is in the checked set, else on the def
    if (type === null || !RADIUS_TYPES.has(type)) return;
    const exts = sub(ge, 'extension').filter(b => strVal(b) && /\.mdl$/i.test(strVal(b)));
    const ext = exts.find(b => own(b, t.file)) || exts[0];
    if (!ext) return;
    const mdlKey = resolveRel(strVal(ext), key);
    const mdl = loadMdl(mdlKey);
    if (!mdl) return;
    const mItem = items.get(mdlKey);
    const at = (code, mdlLine, msg) => {
      const tag = mdlKey + '|' + code + '|' + mdlLine;
      if (seen.has(tag)) return;
      if (mItem) { seen.add(tag); rep.add(mItem.file, mdlLine, code, msg + ` (entity ${path.posix.basename(key)}) (MOV-20)`); }
      else if (own(ext, t.file)) { seen.add(tag); rep.add(t.file, ext.line, code, msg + ` in ${mdlKey} (MOV-20)`); }
    };
    if (mdl.basis && mdl.basis.p.has('wheelradius') && isZero(mdl.basis.p.get('wheelradius')))
      at('MOV_WHEEL_RADIUS_ZERO', mdl.basis.line, 'basis bone WheelRadius=' + mdl.basis.p.get('wheelradius') + ': ERROR "Wheel radius is zero"');
    for (const w of mdl.wheels) if (w.p.has('radius') && isZero(w.p.get('radius')))
      at('MOV_BONE_RADIUS_ZERO', w.line, `bone "${w.name}" radius=${w.p.get('radius')}: ERROR "Invalid bone radius"`);
    if (PIVOT_TYPES.has(type) && !mdl.fileBones && mdl.bones.size) {
      const miss = ['pivot_front', 'pivot_back'].filter(b => !mdl.bones.has(b));
      if (miss.length) at('MOV_PIVOT_MISSING', mdl.skelLine, `${type} chassis but skeleton has no ${miss.map(m => '"' + m + '"').join(' & ')} bone: warning, wheelbase/steering geometry defaults`);
    }
  }
}

// check(opts) -> { rep, files }   sync, files read one at a time
// opts: { folder|vfs, gameDir, mods, exe, restorePoints (also read <folder>/.arsenal-undo, off by default), listing }
function check(opts) { return fast.drive(steps(opts, null)); }
// checkAsync(opts) -> Promise<same>: the folder listed once through the thread pool, defs read ahead of the walk
// checkAsync(opts, ra): ra = a readAhead stand-in to read through (lib/modset read-once pass, ctx.js), closed at the end
async function checkAsync(opts, ra0) {
  const { opts: o, ra } = await fast.prepare(opts, ra0);
  try { return await fast.driveAsync(steps(o, { ra })); } finally { if (ra) ra.close(); }
}

// thread pool 16 (libuv default 4): more reads queued at the disk at once (as keylint)
if (require.main === module && !process.env.UV_THREADPOOL_SIZE) process.env.UV_THREADPOOL_SIZE = '16';
// main(argv, {ra}): the CLI (and ctx.js, the read-once module form, with the pass's reader as ra)
async function main(argv, { ra } = {}) {
  const p = cli.parse(argv, { flags: ['--vfs', '--restore-points'] });
  const o = { gameDir: p.gameDir || undefined, mods: p.mods.length ? p.mods : undefined, vfs: p.x.vfs, folder: p.pos[0], exe: p.exe };
  if (p.x['restore-points']) o.restorePoints = true;
  if (!o.folder && !o.vfs || o.vfs && !o.gameDir) { console.error('usage: node tools/movlint/movlint.js <mod folder> [--game dir] [--mods a,b] [--exe as64|mowas_2|mowas2|goh] [--restore-points] [-q] [--summary] [--format text|json|sarif|html|csv] [-o file] [--rc file|--no-rc] | --vfs --game <dir>'); process.exit(2); }
  const { rep, files } = await checkAsync(o, ra);
  cli.printReport(rep, p, { tool: 'movlint' });
  if (p.format === 'text' && !p.output) console.log(`${files} files`); else console.error(`${files} files`);
}
if (require.main === module) cli.run(() => main(process.argv.slice(2)));
module.exports = { check, checkAsync, main };
