#!/usr/bin/env node
// drift: vanilla drift after a game update (3-way). rows: VFS-01 (mod copy masks upstream changes: whole-file override).
// usage: node tools/drift/drift.js stamp <mod> [--game G] [--exe as64|mowas2|goh] [--mods deps] [--keep-base] [--dry-run] [--out file] [--game-version v]
//        node tools/drift/drift.js check <mod> [--game G] [--exe as64|mowas2|goh] [--mods deps] [--release file] [-q]
//   <mod> = folder path or name under <game>/mods/. G derived when mod sits in <game>/mods/.
// stamp: writes <mod>/release.json {tool,version,gameVersion,stampedAt,files:{key:{sha1,size}}} for every vanilla
//   (base / base N.pat, incl paks) file the mod overrides. --keep-base copies them to <mod>/.as2base/<key> (dev only:
//   doctor --release flags it as WARN_REL_STRAY_FILE: do not ship). --dry-run: print plan, write nothing.
// check: stamped hash vs current vanilla. codes: VANILLA_CHANGED (mod copy masks the update) VANILLA_REMOVED
//   NO_STAMP | info VANILLA_SAME DRIFT_OPAQUE_CHANGED | with .as2base + SDL file, per key base/new/mod:
//   info DRIFT_KEY_UPSTREAM_ONLY (vanilla changed, mod untouched: take upstream), WARN_DRIFT_KEY_BOTH (both changed, differ)
//   keys flatten via lib/sdldiff (semantic values; no include/macro resolution).
// stamp gameVersion: --game-version, else exe ProductVersion / version file (lib/gamever).
// --exe as64|mowas2|mowas_2|goh: the game whose files the mod sits on (lib/games). Handed to lib/vfs build (mowas_2: no as64/core
//   layer, which vfs mounts whenever as64.exe is in the shared AS2 folder and no exe is named) and to lib/gamever (that game's own exe:
//   as64.exe, mowas_2.exe, binaries/x64/call_to_arms.exe). No --exe: as before, except a GoH install (found by its exe) reads the GoH
//   exe version (the AS2 exe names are not there). --exe goh with no --game and a mod not under <GoH>/mods: the GoH install
//   (lib/games install: GOH_GAME, as2.json "goh", Steam).
// a mod folder outside <game>/mods is mounted by path (lib/vfs modDirs) on top of the game (a GoH mod kept outside the GoH install).
// GoH writes: stamp writes release.json (and .as2base/) into the mod folder; a mod folder inside the GoH install is refused with
//   lib/writeguard's plain line (ARSENAL does not write into the GoH install; work on a copy outside it). check only reads.
// Author: Imperator_Aug (ARSENAL, ia-e2f64146)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const vfs = require('../lib/vfs'), sdlx = require('../lib/sdlx');
const { createReport } = require('../lib/report');
const { flatten } = require('../lib/sdldiff'), gamever = require('../lib/gamever');

const SDL_EXT = new Set(['.def', '.set', '.ext', '.inc', '.mi', '.info']);
const extOf = k => { const i = k.lastIndexOf('.'); return i < 0 ? '' : k.slice(i); };
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
const isVanilla = r => !!r && !r.deleted && (r.layer === 'base' || /^patch \d+$/.test(r.layer));
const isMod = (r, id) => !!r && typeof r.layer === 'string' && (r.layer === id || r.layer.startsWith(id + ' patch '));

function setup(opts) {
  const games = require('../lib/games');
  if (opts.exe !== undefined && !games.get(opts.exe)) throw new Error('--exe must be one of as64, mowas2, mowas_2, goh (got ' + opts.exe + ')');
  let folder = opts.mod;
  // --exe goh with no --game: a mod named by folder name is looked up in the GoH install's mods/
  const gohDir = !opts.gameDir && games.kindOf(opts.exe) === 'goh' && !fs.existsSync(folder) ? games.install('goh').dir : null;
  const look = opts.gameDir || gohDir;
  if (look && !fs.existsSync(folder) && fs.existsSync(path.join(look, 'mods', folder))) folder = path.join(look, 'mods', folder);
  folder = path.resolve(folder);
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw new Error('mod folder missing: ' + opts.mod);
  const underMods = path.basename(path.dirname(folder)).toLowerCase() === 'mods';
  const gameDir = opts.gameDir || (underMods ? path.dirname(path.dirname(folder)) : null)
    || (games.kindOf(opts.exe) === 'goh' ? games.install('goh').dir : null);
  if (!gameDir) throw new Error('need --game dir (or a mod folder under <game>/mods/)');
  // the game: --exe, else a GoH install by its exe (gamever reads only that exe there); AS2 with no --exe: undefined, as before
  const exe = opts.exe !== undefined ? games.exeOf(opts.exe) : (games.detect(gameDir) === 'goh' ? 'goh' : undefined);
  const id = path.basename(folder).toLowerCase();
  const deps = (opts.mods || []).filter(m => m.split(':')[0].toLowerCase() !== id);
  // the mod in <game>/mods: mounted from the list as before; elsewhere: by path (vfs modDirs), the layer id stays the folder name
  const inGame = path.resolve(path.dirname(folder)).toLowerCase() === path.resolve(gameDir, 'mods').toLowerCase();
  const v = vfs.build({ gameDir, mods: inGame ? deps.concat([id]) : deps, modDirs: inGame ? undefined : [{ dir: folder, id }], disableVersionControl: true, exe });
  return { folder, gameDir, id, v, exe };
}

// last vanilla record in chain (what the mod copy masks)
function vanillaOf(v, key) {
  let r = null; for (const c of v.chain(key)) if (isVanilla(c)) r = c;
  return r;
}

function stamp(opts) {
  const rep = createReport();
  const { folder, gameDir, id, v, exe } = setup(opts);
  // GoH: no write into the GoH install (lib/writeguard); a dry run writes nothing and is allowed
  if (exe === 'goh' && !opts.dryRun) {
    const wg = require('../lib/writeguard');
    // --keep-base writes <mod>/.as2base/ whatever --out says, so that path is checked too
    const why = wg.refuseWrite(opts.out || path.join(folder, 'release.json'), { game: gameDir, purpose: 'drift stamp' }) ||
      (opts.keepBase ? wg.refuseWrite(path.join(folder, '.as2base'), { game: gameDir, purpose: 'drift stamp --keep-base' }) : null);
    if (why) { vfs.closeRecs(); throw new Error('drift stamp: ' + why); }
  }
  const files = {}, recs = new Map();
  try {
    const keys = new Set();
    for (const s of v.shadows) if (isMod(s.by, id) && !s.by.deleted) keys.add(s.key);
    for (const key of [...keys].sort()) {
      const ch = v.chain(key);
      if (!ch.some(r => isMod(r, id) && !r.deleted)) continue;
      const base = vanillaOf(v, key);
      if (!base) continue;
      const buf = vfs.readRec(base);
      files[key] = { sha1: sha1(buf), size: buf.length };
      recs.set(key, buf);
    }
  } finally { vfs.closeRecs(); }
  const doc = { tool: 'drift', version: 1, gameVersion: opts.gameVersion || (exe ? gamever.read(gameDir, exe) : gamever.read(gameDir)), stampedAt: new Date().toISOString(), files };
  const n = Object.keys(files).length;
  if (opts.dryRun) {
    for (const k of Object.keys(files)) rep.info(k, 0, 'STAMP_PLAN', `sha1 ${files[k].sha1.slice(0, 10)} ${files[k].size} bytes`);
    rep.info('release.json', 0, 'STAMP_PLAN', `dry run: would stamp ${n} files for ${id}${opts.keepBase ? ' + copy to .as2base/' : ''}`);
  } else {
    fs.writeFileSync(opts.out || path.join(folder, 'release.json'), JSON.stringify(doc, null, 1) + '\n');
    if (opts.keepBase) for (const [k, b] of recs) {
      const f = path.join(folder, '.as2base', k);
      fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b);
    }
    rep.info('release.json', 0, 'STAMPED', `${n} files, gameVersion ${doc.gameVersion}${opts.keepBase ? '; .as2base/ is dev-only, do not ship' : ''}`);
  }
  return { rep, n, doc };
}

function parseMap(buf, key) {
  return flatten(sdlx.read(buf, { file: key, key, open: () => null, onError: () => {} }).root);
}

function check(opts) {
  const rep = createReport();
  const { folder, id, v } = setup(opts);
  const rf = opts.release || path.join(folder, 'release.json');
  if (!fs.existsSync(rf)) { rep.add('release.json', 0, 'NO_STAMP', `no release.json: run "drift stamp" at release time`); return { rep, same: 0 }; }
  let st;
  try { st = JSON.parse(fs.readFileSync(rf, 'utf8')); } catch (e) { rep.add('release.json', 0, 'NO_STAMP', 'unreadable: ' + e.message); return { rep, same: 0 }; }
  let same = 0;
  try {
    for (const key of Object.keys(st.files || {}).sort()) {
      const old = st.files[key], cur = vanillaOf(v, key);
      if (!cur) { rep.add(key, 0, 'VANILLA_REMOVED', `vanilla file gone (stamped ${old.size} bytes); mod copy is now an orphan or new file`); continue; }
      const nb = vfs.readRec(cur);
      if (sha1(nb) === old.sha1) { same++; continue; }
      rep.add(key, 0, 'VANILLA_CHANGED', `vanilla changed upstream (${old.size} -> ${nb.length} bytes); mod copy masks the update (VFS-01)`);
      const bf = path.join(folder, '.as2base', key);
      if (!fs.existsSync(bf)) continue;
      if (!SDL_EXT.has(extOf(key))) { rep.info(key, 0, 'DRIFT_OPAQUE_CHANGED', 'not key-diffable'); continue; }
      const mrec = v.chain(key).filter(r => isMod(r, id) && !r.deleted).pop();
      if (!mrec) continue;
      let B, N, M;
      try { B = parseMap(fs.readFileSync(bf), key); N = parseMap(nb, key); M = parseMap(vfs.readRec(mrec), key); }
      catch (e) { rep.info(key, 0, 'DRIFT_UNREADABLE', e.message); continue; }
      const val = (m, p) => m.has(p) ? m.get(p).sem : undefined, disp = (m, p) => m.has(p) ? m.get(p).val : undefined;
      const paths = new Set([...B.keys(), ...N.keys()]);
      for (const p of [...paths].sort()) {
        const b = val(B, p), n = val(N, p), m = val(M, p);
        if (n === b) continue;                         // upstream untouched
        if (m === n) continue;                         // mod already matches new vanilla
        const line = (M.get(p) || N.get(p) || {}).line || 0;
        const show = mm => { const x = disp(mm, p); return x === undefined ? '<absent>' : x; };
        if (m === b) rep.info(key, line, 'DRIFT_KEY_UPSTREAM_ONLY', `${p}: ${show(B)} -> ${show(N)} upstream, mod unchanged: take upstream`);
        else rep.add(key, line, 'WARN_DRIFT_KEY_BOTH', `${p}: base ${show(B)}, upstream ${show(N)}, mod ${show(M)}: merge by hand`);
      }
    }
  } finally { vfs.closeRecs(); }
  rep.info('release.json', 0, 'VANILLA_SAME', `${same} stamped files unchanged since ${st.stampedAt || '?'}${st.gameVersion ? ' (' + st.gameVersion + ')' : ''}`);
  return { rep, same };
}

if (require.main === module) {
  const args = process.argv.slice(2), o = {}, pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--game') o.gameDir = args[++i]; else if (a === '--mods') o.mods = args[++i].split(',').filter(Boolean);
    else if (a === '--release') o.release = args[++i]; else if (a === '--game-version') o.gameVersion = args[++i];
    else if (a === '--out') o.out = args[++i]; else if (a === '--keep-base') o.keepBase = true; else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--exe') o.exe = args[++i];
    else if (a === '-q') o.q = true; else pos.push(a);
  }
  const mode = pos[0]; o.mod = pos[1];
  if (!['stamp', 'check'].includes(mode) || !o.mod) { console.error('usage: drift.js stamp|check <mod> [--game G] [--exe as64|mowas2|goh] [--mods deps] [--keep-base] [--dry-run] [--release f] [-q]'); process.exit(2); }
  let res;
  try { res = (mode === 'stamp' ? stamp : check)(o); } catch (e) { console.error(e.message); process.exit(2); }
  res.rep.print({ showInfo: !o.q, byCode: true });
}
module.exports = { stamp, check };
