#!/usr/bin/env node
// strlint: structure/building linter. defs under entity/construction + entity/social/fortification, their .mdl, tear scripts.
// usage: node tools/strlint/strlint.js <mod folder> [-q] [--summary]
//        node tools/strlint/strlint.js --vfs --game <dir> [--mods a,b]   (whole mounted vfs)
//        [--exe as64|mowas_2|mowas2|goh] the game (lib/games); none = as before (vfs picks: as64.exe first). mowas_2: same rules, no as64/core.
//          goh: --exe goh with no --game = the GoH install (games.install); GoH-only rule (also when the vfs picks goh from call_to_arms.exe):
//   STR_COLLIDER_PROFILE_GOH  a colliders.set (the mod's copy replaces vanilla) with no profile "tpc_camera" (GHDC-41: camera clip Find null,
//                          crash on first hit [I]) or "human_tpc" (GHDC-49: foot direct control sets it)
//          known-vanilla-goh.txt = the GoH vanilla defect list (known-vanilla.txt is AS2 vanilla)
//        [--restore-points] also read <mod folder>/.arsenal-undo (restore points; the game never mounts them, so off by default)
//   CLI lists the folder once and reads the walked files through the thread pool (checkAsync); check() = same findings, one at a time
// codes (rows: new STR area, see REPORT.json specIssues):
//   STR_MDL_MISSING        Extension .mdl not found
//   WARN_STR_VOLUME_NO_SHAPE  def {Volume "n"} (written in the def itself, non-empty) has no {Volume "n"} in the mdl; vanilla: 452 -> info
//   WARN_STR_VOLUME_BONE   mdl {Volume {Bone "b"}} bone not in the mdl Skeleton
//   STR_WINDOW_THICKNESS   def volume with {able {window}} has no {Thickness}
//   STR_PLACE_BONE         {extender "structure" {place "<bone>" ..}} bone not in the mdl Skeleton
//   STR_PLACE_ENTITY       structure place part entity does not resolve
//   WARN_STR_OBSTACLE_MISSING ObstacleId "building" but the mdl has no {Obstacle {Obb2}}
//   STR_FORT_ENTITY / STR_FORT_VALUE / STR_FORT_SKIP / STR_FORT_KEY   fortification extender level
//   STR_VIEW_MISSING       mdl VolumeView/Polyhedron file not in the vfs
//   STR_COLLIDER_GROUPS    colliders.set has more than 32 distinct ColliderId groups
//   STR_TEAR_ENTITY        {tear "<entity>"} in interaction_entity/construction scripts does not resolve
//   STR_CALL_UNDEFINED {call "x"} in construction scripts with no {on "x"} anywhere in interaction_entity ( silent no-op)
//   WARN_STR_TEAR_BONE     construction *_x.mdl skeleton bone piece/sub_piece/part/wall<N> that no tear script expands to (never sliced)
//   WARN_STR_TEAR_BONE_NONE mod script literal tear bone present in no construction mdl skeleton
//   STR_OBSTACLE_NAME_MISSING  any entity def {ObstacleId "n"} with n in neither the mod's nor vanilla's set/registry/obstacles.reg (STR-29, PORT-188; crusher crash)
//   WARN_STR_DEF_SCALE    construction def has a {scale} key (ignored; STR-12)
//   STR_MACRO_UNDEFINED / STR_INCLUDE_MISSING   (macro call / include in the def itself, or in construction scripts resolved via entity.set, that sdlx cannot resolve)
// soft rules (WARN_) are info on base-layer files: vanilla ships 452 volume + 1306 obstacle + 28 bone cases. known-vanilla.txt: real vanilla defects -> info
// Author: Imperator_Aug (ARSENAL, ia-77e47dfe)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const path = require('path');
const sdlset = require('../lib/sdlset'), sdlx = require('../lib/sdlx');
const games = require('../lib/games');
const { createReport } = require('../lib/report');
const fast = require('./fastread');

const low = s => String(s).toLowerCase();
const DEF_RE = /^resource\/entity\/(construction|social\/fortification)\/.*\.def$/;
const ENT_DEF_RE = /^resource\/entity\/.*\.def$/;
const X_MDL_RE = /^resource\/entity\/construction\/.*_x\.mdl$/;
const TEAR_RE =/^resource\/set\/interaction_entity\/construction\/.*\.inc$/;

// ---- tree helpers ----
function* blocks(node) {
  for (const it of node.items) {
    if (it.k === 'BLOCK') { if (!it.disabled) yield it; }
    else if (it.k === 'MOD') yield* blocks(it);
  }
}
const nameOf = b => { const f = b.items[0]; return f && (f.k === 'IDENT' || f.k === 'STRING') ? low(f.k === 'STRING' ? f.value : f.text) : ''; };
const vals = b => b.items.slice(1).filter(i => i.k !== 'BLOCK' && i.k !== 'MOD');
const strVal = b => { const v = vals(b)[0]; return v ? (v.k === 'STRING' ? v.value : v.k === 'IDENT' ? v.text : String(v.value)) : null; };
const num = b => { const v = vals(b).find(x => x.k === 'INTEGER' || x.k === 'FLOAT'); return v ? v.value : null; };
const sub = (b, name) => [...blocks(b)].filter(x => nameOf(x) === name);
const own = (n, file) => n.file === file && !n.via;
function walkAll(node, fn) { for (const b of blocks(node)) { fn(b); walkAll(b, fn); } }

function resolveRel(val, fromKey) {
  let s = String(val).replace(/\\/g, '/').toLowerCase();
  if (s.startsWith('/')) return path.posix.normalize('resource/' + s.slice(1));
  return path.posix.normalize(fromKey.slice(0, fromKey.lastIndexOf('/') + 1) + s);
}

// keys the main loop reads
const walked = key => ENT_DEF_RE.test(key) || TEAR_RE.test(key) || key === 'resource/set/colliders.set' || X_MDL_RE.test(key);
// the check as steps: yields a Promise only while a read-ahead file (io.ra, async run) is still being read
function* steps(opts, io) {
  const rep = createReport();
  let mods = opts.mods;
  if (!mods && opts.folder && opts.gameDir && path.dirname(path.resolve(opts.folder)).toLowerCase() === path.resolve(opts.gameDir, 'mods').toLowerCase()) mods = [path.basename(path.resolve(opts.folder))];
  const ra = io && io.ra;
  // each walked file and each include read once per run (fastread)
  const F = fast.wrap(sdlset.createSource({ gameDir: opts.gameDir, mods, folder: opts.folder, exe: games.exeOf(opts.exe) || undefined, ...fast.srcOpts(opts) }), ra), src = F.src;
  const goh = (src.v ? src.v.exe : games.exeOf(opts.exe)) === 'goh';
  const items = new Map();
  if (opts.vfs) for (const t of src.vfsItems()) items.set(t.key, t);
  else { for (const t of src.modItems()) items.set(t.key, t); for (const t of src.folderItems()) items.set(t.key, t); }

  // name universe: basename of every .def in the mounted set (engine entity name = basename)
  const names = new Set();
  const exists = k => src.local.has(k) || !!(src.v && src.v.files.has(k));
  for (const k of src.local.keys()) if (k.endsWith('.def')) names.add(low(k.slice(k.lastIndexOf('/') + 1, -4)));
  if (src.v) for (const k of src.v.files.keys()) if (k.endsWith('.def')) names.add(low(k.slice(k.lastIndexOf('/') + 1, -4)));
  const entityOk = n => names.has(low(String(n).split('#')[0]));

  const mdlCache = new Map();
  function loadMdl(key) {
    if (mdlCache.has(key)) return mdlCache.get(key);
    let info = null;
    const buf = src.get(key);
    if (buf) {
      const r = sdlx.read(buf, { file: key, key, open: src.open, onError: () => {} });
      info = { key, bones: new Set(), boneLines: [], volumes: new Map(), obb2: false, views: [], bonesRef: [] };
      walkAll(r.root, b => {
        const n = nameOf(b);
        if (n === 'skeleton') walkAll(b, x => { if (nameOf(x) === 'bone' && strVal(x) != null) { info.bones.add(low(strVal(x))); info.boneLines.push([low(strVal(x)), x.line]); } });
        else if (n === 'volume' && strVal(b) != null) info.volumes.set(low(strVal(b)), b);
        else if (n === 'obstacle' && sub(b, 'obb2').length) info.obb2 = true;
        else if ((n === 'volumeview' || n === 'polyhedron') && strVal(b) != null) info.views.push([n, strVal(b), b.line]);
      });
      for (const b of info.volumes.values()) for (const bn of sub(b, 'bone')) info.bonesRef.push([strVal(bn), bn.line, strVal(b)]);
    }
    mdlCache.set(key, info);
    return info;
  }

  // soft rules: vanilla ships many violations (ground truth) -> info there, WARN_ in mods
  const KNOWN = new Set(require('fs').readFileSync(path.join(__dirname, goh ? 'known-vanilla-goh.txt' : 'known-vanilla.txt'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && l[0] !== ';'));
  const isBase = key => !!(src.v && src.v.files.has(key) && !src.local.has(key) && !src.isModKey(key));
  function soft(key, file, line, code, msg) {
    if (isBase(key)) rep.info(file, line, code, msg + ' [vanilla ships this]'); else rep.add(file, line, 'WARN_' + code, msg);
  }
  function hard(key, file, line, code, msg) {
    if (isBase(key) && KNOWN.has(file + ':' + line + ' ' + code)) rep.info(file, line, code, msg + ' [known vanilla defect]'); else rep.add(file, line, code, msg);
  }
  let files = 0;
  const mdlChecked = new Set();

  function readItem(t, errs) {
    let r; try { r = src.read(t, errs); } catch (e) { r = null; }
    return r;
  }

  function checkColliders(key, t) {
    const r = readItem(t, () => {});
    if (!r) return;
    const ids = new Map();
    walkAll(r.root, b => { if (nameOf(b) === 'colliderid' && strVal(b) != null && !ids.has(low(strVal(b)))) ids.set(low(strVal(b)), b.line); });
    if (ids.size > 32) rep.add(t.file, [...ids.values()][32], 'STR_COLLIDER_GROUPS', `${ids.size} distinct ColliderId groups; eGroupSet holds 32, extra groups index past the bitset (STR)`);
    if (goh) {                                 // GoH profiles the engine looks up by name: top-level blocks of {Colliders}
      const prof = new Set();
      for (const c of blocks(r.root)) if (nameOf(c) === 'colliders') for (const p of blocks(c)) if (nameOf(p)) prof.add(nameOf(p));
      for (const [need, row, why] of [['tpc_camera', 'GHDC-41', 'the third-person camera clip looks it up: Find returns null, crash on the first hit [I]'], ['human_tpc', 'GHDC-49', 'entering direct control sets it on the soldier']])
        if (!prof.has(need)) hard(key, t.file, 0, 'STR_COLLIDER_PROFILE_GOH', `colliders.set has no profile "${need}": ${why} (${row}); copy the vanilla {"${need}" ..} block into this file`);
    }
  }

  // universe of interaction scripts (lazy): {on "x"} names that {call "x"} can reach; macro-expanded tear bone literals
  let uni = null;
  function universe() {
    if (uni) return uni;
    uni = { ons: new Set(), tearBones: new Set(), prefixes: new Set() };
    const keys = new Set([...src.local.keys()]);
    if (src.v) for (const k of src.v.files.keys()) keys.add(k);
    for (const k of keys) {
      if (!k.startsWith('resource/set/interaction_entity/') || !k.endsWith('.inc')) continue;
      const isC = k.startsWith('resource/set/interaction_entity/construction/');
      let r; try { const b = src.get(k); r = b && sdlx.read(b, { file: k, key: k, open: src.open, onError: () => {} }); } catch (e) { r = null; }
      if (!r) continue;
      walkAll(r.root, b => {
        const n = nameOf(b);
        if (n === 'on') { const v = vals(b)[0]; if (v) uni.ons.add(low(v.k === 'STRING' ? v.value : v.text)); }
        else if (n === 'tear' && isC) {
          const i = b.items.findIndex(x => x.k === 'IDENT' && x.text === 'bone');
          const bn = i >= 0 && b.items[i + 1];
          if (bn && bn.k === 'STRING') {
            const s = low(bn.value); if (/%/.test(s)) return;
            uni.tearBones.add(s);
            const m = /^(.*?)\d+$/.exec(s); if (m) uni.prefixes.add(m[1]);
          }
        }
      });
    }
    return uni;
  }

  function checkTear(key, t) {
    const r = readItem(t, () => {});
    if (!r) return;
    walkAll(r.root, b => {
      if (!own(b, t.file)) return;
      const n = nameOf(b);
      const v = vals(b)[0];
      if (n === 'tear') {
        if (v && v.k === 'STRING' && !/%/.test(v.value) && !entityOk(v.value)) rep.add(t.file, b.line, 'STR_TEAR_ENTITY', `tear piece entity "${v.value}" not found: no piece spawns (STR)`);
      } else if (n === 'call' && v && !/%/.test(String(v.k === 'STRING' ? v.value : v.text))) {
        const nn = low(v.k === 'STRING' ? v.value : v.text);
        if (!universe().ons.has(nn)) hard(key, t.file, b.line, 'STR_CALL_UNDEFINED', `{call "${nn}"} has no {on "${nn}"} in any interaction_entity script: action call finds no event and does nothing`);
      }
    });
  }

  // construction scripts are only ever loaded through interaction_entity/entity.set, which shares one define table across all
  // included files (special.inc calls "cut_pieces" defined in parts.inc): resolve macro/include names from that root, not per file
  let entitySetDone = false;
  function checkEntitySet() {
    if (entitySetDone) return; entitySetDone = true;
    const k = 'resource/set/interaction_entity/entity.set', b = src.get(k);
    if (!b) return;
    const seen = new Set();
    try {
      sdlx.read(b, { file: k, key: k, open: src.open, onError: (file, line, code, msg) => {
        if ((code !== 'MACRO_UNDEFINED' && code !== 'INCLUDE_MISSING') || !/interaction_entity\/construction\//.test(String(file))) return;
        const id = file + ':' + line + code; if (seen.has(id)) return; seen.add(id);
        const key = String(file).startsWith('resource/') ? file : 'resource/' + String(file).replace(/\\/g, '/');
        hard(key, file, line, 'STR_' + code, `${msg} (STR)`);
      } });
    } catch (e) { /* unreadable root: nothing to report */ }
  }

  // _x skeleton piece bones: only names some construction {tear .. bone "<name>"} expands to are ever sliced ( returns null for a missing bone)
  const xChecked = new Set();
  function checkXmdl(key, t) {
    if (xChecked.has(key)) return; xChecked.add(key);
    const mdl = loadMdl(key);
    if (!mdl) return;
    const U = universe(), seen = new Set();
    const mfile = t.file;
    for (const [bn, line] of mdl.boneLines) {
      const m = /^(.*?)\d+$/.exec(bn);
      if (m && U.prefixes.has(m[1]) && !U.tearBones.has(bn) && !seen.has(bn)) {
        seen.add(bn);
        soft(key, mfile, line, 'STR_TEAR_BONE', `_x skeleton bone "${bn}" is never torn: no construction {tear .. bone} script expands to that name (STR)`);
      }
    }
  }

  // literal tear bones in mod scripts: must exist in some construction skeleton
  let allSk = null;
  function checkTearLiterals(key, t) {
    if (isBase(key)) return;
    const r = readItem(t, () => {}); if (!r) return;
    walkAll(r.root, b => {
      if (nameOf(b) !== 'tear' || !own(b, t.file)) return;
      const i = b.items.findIndex(x => x.k === 'IDENT' && x.text === 'bone');
      const bn = i >= 0 && b.items[i + 1];
      if (!bn || bn.k !== 'STRING' || /%/.test(bn.value)) return;
      if (!allSk) {
        allSk = new Set();
        const ks = new Set([...src.local.keys()]); if (src.v) for (const k of src.v.files.keys()) ks.add(k);
        for (const k of ks) if (/^resource\/entity\/construction\/.*\.mdl$/.test(k)) { const m = loadMdl(k); if (m) m.bones.forEach(x => allSk.add(x)); }
      }
      if (!allSk.has(low(bn.value))) rep.add(t.file, b.line, 'WARN_STR_TEAR_BONE_NONE', `tear bone "${bn.value}" exists in no construction .mdl skeleton: never slices (STR)`);
    });
  }

  // STR-29 / PORT-188: {ObstacleId "name"} must be a top-level name in {obstacles ..} of set/registry/obstacles.reg (mod's or vanilla's);
  // else FindObstacleId gives 0xff and a crusher's can_crush crashes. null = no registry readable: skip.
  let obsNames;
  function obstacleNames() {
    if (obsNames !== undefined) return obsNames;
    const k = 'resource/set/registry/obstacles.reg', set = new Set();
    let any = false;
    for (const buf of [src.local.has(k) ? src.get(k) : null, src.readVfs(k)]) {
      if (!buf) continue;
      let r; try { r = sdlx.read(buf, { file: k, key: k, open: src.open, onError: () => {} }); } catch (e) { r = null; }
      if (!r) continue;
      any = true;
      for (const o of blocks(r.root)) if (nameOf(o) === 'obstacles') for (const b of blocks(o)) { const n = nameOf(b); if (n) set.add(n); }
    }
    return (obsNames = any && set.size ? set : null);
  }
  function checkObstacleNames(t, root) {
    walkAll(root, b => {
      if (nameOf(b) !== 'obstacleid' || !own(b, t.file)) return;
      const v = strVal(b);
      if (v == null || /%/.test(v)) return;
      const names = obstacleNames();
      if (names && !names.has(low(v))) rep.add(t.file, b.line, 'STR_OBSTACLE_NAME_MISSING', `ObstacleId "${v}" is not in set/registry/obstacles.reg (mod or vanilla): the entity gets no obstacle id and a tank crushing it crashes the game; add a "${v}" row to the mod's obstacles.reg (copy the nearest vanilla row) or use an existing name (STR-29)`);
    });
  }

  function checkDef(key, t) {
    const errs = [];
    const r = readItem(t, (file, line, code, msg) => { if (file === t.file && (code === 'MACRO_UNDEFINED' || code === 'INCLUDE_MISSING')) errs.push([line, code, msg]); });
    if (!r) return;
    for (const [line, code, msg] of errs) rep.add(t.file, line, 'STR_' + code, `${msg} (STR)`);
    const ge = [...blocks(r.root)].find(b => nameOf(b) === 'game_entity') || r.root;

    // Extension → mdl
    let mdl = null, mdlKey = null;
    const ext = sub(ge, 'extension').find(b => own(b, t.file)) || sub(ge, 'extension')[0];
    if (ext && strVal(ext) && /\.mdl$/i.test(strVal(ext))) {
      mdlKey = resolveRel(strVal(ext), key);
      mdl = loadMdl(mdlKey);
      if (!mdl && own(ext, t.file)) rep.add(t.file, ext.line, 'STR_MDL_MISSING', `Extension "${strVal(ext)}" not found at ${mdlKey}: entity spawns without model (STR)`);
    }

    if (mdl && !mdlChecked.has(mdlKey)) {
      mdlChecked.add(mdlKey);
      const mfile = src.local.has(mdlKey) ? path.relative(src.folder || '', src.local.get(mdlKey)).replace(/\\/g, '/') : mdlKey;
      for (const [bn, line, vn] of mdl.bonesRef) if (bn != null && !mdl.bones.has(low(bn))) soft(mdlKey, mfile, line, 'STR_VOLUME_BONE', `Volume "${vn}" Bone "${bn}" is not in the Skeleton (STR)`);
      for (const [kind, f, line] of mdl.views) {
        const k = resolveRel(f, mdlKey);
        if (!exists(k)) rep.add(mfile, line, 'STR_VIEW_MISSING', `${kind} "${f}" not found at ${k} (STR)`);
      }
    }

    // STR-12: construction defs have no scale key (scale only via map {xform scale}); a def-level {scale} is ignored
    if (/^resource\/entity\/construction\//.test(key)) for (const b of sub(ge, 'scale')) if (own(b, t.file)) rep.add(t.file, b.line, 'WARN_STR_DEF_SCALE', 'construction defs have no scale key: ignored, scale only via map {xform scale} / place-entity --scale (STR-12)');

    // def volumes
    for (const v of sub(ge, 'volume')) {
      if (!own(v, t.file) || strVal(v) == null) continue;
      const hasBody = [...blocks(v)].length > 0;
      if (mdl && hasBody && !mdl.volumes.has(low(strVal(v)))) soft(key, t.file, v.line, 'STR_VOLUME_NO_SHAPE', `Volume "${strVal(v)}" has no shape in ${mdlKey.slice(mdlKey.lastIndexOf('/') + 1)}: volume never collides (STR)`);
      let win = false;
      walkAll(v, b => { if (nameOf(b) === 'window') win = true; });
      if (win && !sub(v, 'thickness').length) rep.add(t.file, v.line, 'STR_WINDOW_THICKNESS', `window volume "${strVal(v)}" has no Thickness (STR)`);
    }

    // obstacle
    let obstacleBuilding = null;
    const site = n => { let v = n.via; if (!v) return n.line; while (v.via) v = v.via; return v.line; };
    for (const b of sub(ge, 'obstacleid')) if (low(strVal(b)) === 'building') obstacleBuilding = b;
    if (obstacleBuilding && mdl && !mdl.obb2) soft(key, t.file, site(obstacleBuilding), 'STR_OBSTACLE_MISSING', `ObstacleId "building" but ${mdlKey.slice(mdlKey.lastIndexOf('/') + 1)} has no {Obstacle {Obb2}}: no pather footprint (STR)`);

    // extenders
    for (const ex of sub(ge, 'extender')) {
      const kind = low(strVal(ex) || '');
      if (kind === 'structure' && own(ex, t.file)) {
        for (const p of sub(ex, 'place')) {
          const vs = vals(p).map(x => x.k === 'STRING' ? x.value : x.text);
          if (vs[0] != null && mdl && !mdl.bones.has(low(vs[0]))) hard(key, t.file, p.line, 'STR_PLACE_BONE', `place bone "${vs[0]}" not in ${mdlKey.slice(mdlKey.lastIndexOf('/') + 1)} Skeleton: part never placed (STR)`);
          if (vs[1] && !entityOk(vs[1])) rep.add(t.file, p.line, 'STR_PLACE_ENTITY', `place part entity "${vs[1]}" not found (STR)`);
        }
      } else if (kind === 'fortification') {
        for (const lv of sub(ex, 'level')) {
          const g = (n) => { const b = sub(lv, n)[0]; return b; };
          const L = lv.line;
          for (const b of blocks(lv)) {
            const n = nameOf(b);
            if (!['built', 'verifyplacement', 'steps', 'radius', 'angle', 'azimuth', 'elementangle', 'buildtime', 'entity', 'skip', 'manual', 'actions'].includes(n))
              rep.add(t.file, b.line, 'STR_FORT_KEY', `unknown fortification level key "${n}": reader aborts the entity`);
          }
          const ent = g('entity');
          if (!ent) rep.add(t.file, L, 'STR_FORT_ENTITY', 'fortification level has no {entity}: nothing to build');
          else if (!entityOk(strVal(ent) || '')) rep.add(t.file, ent.line, 'STR_FORT_ENTITY', `fortification entity "${strVal(ent)}" not found`);
          const steps = g('steps') ? num(g('steps')) : 0;
          if (g('steps') && !(steps > 0)) rep.add(t.file, g('steps').line, 'STR_FORT_VALUE', `steps ${steps} <= 0: one part only, no ring`);
          for (const k of ['radius', 'buildtime']) {
            const b = g(k);
            if (!b) rep.add(t.file, L, 'STR_FORT_VALUE', `fortification level has no ${k}: defaults to 0`);
            else if (!(num(b) > 0)) rep.add(t.file, b.line, 'STR_FORT_VALUE', `${k} ${num(b)} <= 0`);
          }
          const skip = g('skip');
          if (skip && strVal(skip)) {
            for (const tok of strVal(skip).split(' ').filter(Boolean)) {
              const i = Number(tok);
              if (!Number.isInteger(i) || i < 0 || i >= 4 * steps) rep.add(t.file, skip.line, 'STR_FORT_SKIP', `skip index "${tok}" outside 0..${4 * steps - 1} (parts = steps*4)`);
            }
          }
        }
      }
    }
  }
  if (ra) for (const [key, t] of items) if (walked(key) && t.path) ra.add(key, t.path);
  for (const [key, t0] of items) {
    if (!walked(key)) continue;
    if (ra && t0.path) { const w = ra.wait(key); if (w) yield w; }
    const t = F.item(t0);
    try {
      if (ENT_DEF_RE.test(key)) { const r = readItem(t, () => {}); if (r) checkObstacleNames(t, r.root); }
      if (DEF_RE.test(key)) { files++; checkDef(key, t); }
      else if (TEAR_RE.test(key)) { files++; checkEntitySet(); checkTear(key, t); checkTearLiterals(key, t); }
      else if (key === 'resource/set/colliders.set') { files++; checkColliders(key, t); }
      else if (X_MDL_RE.test(key)) { files++; checkXmdl(key, t); }
    } finally { F.done(t0); }
  }
  return { rep, files };
}
// check(opts) -> { rep, files }   sync, files read one at a time
// opts: { folder|vfs, gameDir, mods, exe, restorePoints (also read <folder>/.arsenal-undo, off by default), listing }
function check(opts) { return fast.drive(steps(opts, null)); }
// checkAsync(opts) -> Promise<same>: the folder listed once through the thread pool, walked files read ahead
// checkAsync(opts, ra): ra = a readAhead stand-in to read through (lib/modset read-once pass, ctx.js), closed at the end
async function checkAsync(opts, ra0) {
  const { opts: o, ra } = await fast.prepare(opts, ra0);
  try { return await fast.driveAsync(steps(o, { ra })); } finally { if (ra) ra.close(); }
}

// .lintrc + --format wiring (own arg parser): rc from --rc FILE, else nearest .lintrc walking up from `start`; --no-rc disables
const { rcPrint } = require('../lib/cli');
// thread pool 16 (libuv default 4): more reads queued at the disk at once (as keylint)
if (require.main === module && !process.env.UV_THREADPOOL_SIZE) process.env.UV_THREADPOOL_SIZE = '16';
// main(args, {ra}): the CLI (and ctx.js, the read-once module form, with the pass's reader as ra; an error rejects, and the
// pass runs strlint as a program instead)
async function main(args, { ra } = {}) {
  const o = {}, pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--game') o.gameDir = args[++i]; else if (a === '--mods') o.mods = args[++i].split(',').filter(Boolean);
    else if (a === '--exe') { o.exe = args[++i]; if (!games.get(o.exe)) { console.error('strlint: --exe ' + o.exe + ': as64, mowas_2 (mowas2) or goh'); process.exit(2); } }
    else if (a === '--restore-points') o.restorePoints = true;
    else if (a === '--vfs') o.vfs = true; else if (a === '--rc') o.rcFile = args[++i]; else if (a === '--no-rc') o.noRc = true; else if (a === '--format') o.format = args[++i]; else if (a === '-o') o.output = args[++i]; else if (a === '-q') o.q = true; else if (a === '--summary') o.summary = true; else pos.push(a);
  }
  o.folder = pos[0];
  if (o.exe && !o.gameDir && (games.kindOf(o.exe) === 'goh' || o.vfs)) o.gameDir = games.install(o.exe).dir || undefined;
  if (!o.folder && !o.vfs || o.vfs && !o.gameDir) { console.error('usage: node tools/strlint/strlint.js <mod folder> | --vfs --game <dir> [--exe as64|mowas_2|goh] [--mods a,b] [--restore-points] [-q] [--summary]'); process.exit(2); }
  const { rep, files } = await checkAsync(o, ra);
  rcPrint(rep, o, o.folder || o.gameDir, 'strlint', { showInfo: !o.q, byCode: true, summary: o.summary });
  console.log(`${files} files`);
}
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e && e.stack || String(e)); process.exit(1); });
module.exports = { check, checkAsync, main };
