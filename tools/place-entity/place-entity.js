#!/usr/bin/env node
// place-entity: L4 create tool. add one static entity to a map as a mod override of the map's `map` file.
//   node tools/place-entity/place-entity.js <mod dir> --game <G> [--mods a,b] [--exe as64|mowas_2|mowas2|goh] --map <multi/name> --entity <def name> --pos x,y[,z]
//        [--dir deg] [--scale f] [--tex "1"] [--dry-run] [--no-cache | --cache f] [-q]
//   <mod dir>/resource/map/<map>/map = the effective `map` file (mod copy if present, --mods, loose game, game paks) + a new
//   {Entity "<def>" 0x<uid> {Position x y [z]} {xform zl <deg> [scale f]}} block (map file holds the static props; .mi holds the
//   mission entities). Position is in MAP UNITS (not metres, MAP-16), 3rd number = fixed height, else
//   from terrain. uid: entity ids are 16-bit and unique across the map file AND every .mi of the folder (ReserveEntityUid / id
//   uint16), so the new uid = smallest above the map file's max not used in any .mi, kept < 0x8000 (the .mi
//   convention, vanilla map uids reach ~0x6003).
//   --exe as64|mowas_2|mowas2|goh: the game (lib/games). as64 / MoW:AS2: the entity index is built for that exe (entityindex exe, own cache
//   per exe), so MoW:AS2 does not see as64/core; none = the vfs default (as64 when as64.exe is in the folder, as before).
//   GoH (--exe goh, or a --game folder holding binaries/x64/call_to_arms.exe; no --game = games.install('goh')): entity name and map files come
//   from the GoH vfs (lib/vfs exe goh: resource/map/*.pak keyed at their folder, mods, the mod folder mounted by path on top); the def is any
//   resource/entity/**/<name>.def (engine name = .def basename, as AS2); uids are 32-bit (entity uid uint32, GHMAP-26 [V]): new uid = smallest
//   above the map file's max not used in a .mi, below 0xffffffff; map file form is the AS2 one ({map {Clips {"x" {world ..}}} {Entity "n" 0xN
//   {Position x y [z]} {xform zl d}}}, read from 166 vanilla GoH multi maps [V data]; 2026-11-23: 208 maps, 2.2M entities, all CRLF no BOM,
//   one tab + hex uid, Entity blocks together after Ocean/GlobalTexture and before Link/Inventory/Slicer/Helpers, {xform} left out when
//   zl is 0 (no "zl 0" in any vanilla map, so GoH --dir 0 writes none) [V data]); --pos in map units as AS2; GoH scale 20 units per metre
//   [I] (vehicle model sizes against real hulls + the GoH exe constants g_unitsPerMeter / g_speedFromUser in gohweb). The mod folder must be
//   outside the GoH install (lib/writeguard: one plain line, exit 2; run() keeps PLACE_OUT_UNSAFE) unless --dry-run. GoH write (writeGoh):
//   lib/modwrite (guardFile: final file inside the mod; restorePoints first, then writeFiles), then read back with the GoH map reader
//   (mapviz mapkit mapdoc.readMap): the entity at the asked place once, the rest of the bytes as before; a failed read back puts the old file
//   back (or removes the new one) and says PLACE_READBACK. In game [T].
// codes (counted): PLACE_BAD_ARGS PLACE_OUT_UNSAFE PLACE_MAP_MISSING PLACE_ENTITY_UNKNOWN PLACE_UID_EXHAUSTED PLACE_MAP_NOT_SDL
//   PLACE_REPARSE (written text did not reparse to +1 entity) PLACE_MILINT (milint finding new vs before)
//   PLACE_READBACK (GoH: the written map read back does not hold the entity at the place, or other bytes changed; the write is undone)
//   WARN_PLACE_OUTSIDE_WORLD (pos outside every Clip world rect [I]) WARN_PLACE_MOD_ENTITY (def comes from the mod folder / a mod:
//   a mod def as level entity is untested [T]). info: PLACE_UID PLACE_MOD_SYNC (map files are CRC-compared in MP, VFS-29)
// Author: Imperator_Aug (ARSENAL, ia-5ae12d4a)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), cp = require('child_process');
const ix = require('../entityindex/index');
const sdlwrite = require('../lib/sdlwrite');
const pak = require('../lib/pak');
const { createReport } = require('../lib/report');
const games = require('../lib/games'), vfs = require('../lib/vfs'), writeguard = require('../lib/writeguard');

const inside = (root, p) => { const r = path.relative(root, p); return r !== '' && !r.startsWith('..') && !path.isAbsolute(r); };
const sameDir = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const num = s => /^-?[0-9]+(\.[0-9]+)?$/.test(s);
const fmtN = v => String(Math.round(v * 100) / 100);

// map text sources, strongest first: mod dir, --mods dirs (later = stronger), game; each loose then resource/*.pak
function mapFiles(o, game, mod, rel) {
  const dirs = [mod, ...(o.mods || []).slice().reverse().map(m => path.join(game, 'mods', m)), game];
  const out = new Map();   // lowercase rel name -> () => Buffer, first source wins
  const prefix = 'map/' + rel + '/';
  for (const d of dirs) {   // per source: loose files, then its resource/*.pak (mod paks too: spotcheck PLACE_MAP_MISSING)
    const dd = path.join(d, 'resource', 'map', ...rel.split('/'));
    let ls = []; try { ls = fs.readdirSync(dd); } catch (e) { /* none */ }
    for (const f of ls) { const p = path.join(dd, f); if (!out.has(prefix + f.toLowerCase()) && fs.statSync(p).isFile()) out.set(prefix + f.toLowerCase(), () => fs.readFileSync(p)); }
    const resDir = path.join(d, 'resource');
    let paks = []; try { paks = fs.readdirSync(resDir).filter(f => /\.pak$/i.test(f)).sort(); } catch (e) { /* none */ }
    for (const pf of paks) {
      let L; try { L = pak.list(path.join(resDir, pf)); } catch (e) { continue; }
      for (const e of L) {
        const n = e.name.toLowerCase();
        if (n.startsWith(prefix) && !n.slice(prefix.length).includes('/') && !out.has(n)) out.set(n, () => pak.read(L, e));
      }
    }
  }
  return out;
}

const entityRe = /\{\s*Entity\s+"([^"]*)"\s+(0x[0-9a-fA-F]+|[0-9]+)/gi;
const uidsOf = text => { const s = new Set(); for (const m of text.matchAll(entityRe)) s.add(Number(m[2])); return s; };

function run(o) {
  const rep = createReport(), plan = [];
  const game = path.resolve(o.gameDir), mod = path.resolve(o.mod);
  const bad = (code, msg) => { rep.add('-', 0, code, msg); return { rep, plan, blocked: true }; };
  const gameRes = path.join(game, 'resource');
  if (sameDir(mod, game) || sameDir(mod, gameRes) || inside(gameRes, mod) || (inside(game, mod) && !inside(path.join(game, 'mods'), mod)))
    return bad('PLACE_OUT_UNSAFE', `mod dir ${mod} is the game dir or inside its vanilla tree; give a mod folder`);
  let mp = String(o.map || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
  mp = mp.replace(/^resource\//, '').replace(/^map\//, '');
  if (!/^[a-z0-9_\-]+(\/[a-z0-9_\-]+)*$/.test(mp)) return bad('PLACE_BAD_ARGS', `--map "${o.map || ''}": expected a map folder like multi/1v1_road`);
  const pos = String(o.pos || '').split(',').map(s => s.trim());
  if (![2, 3].includes(pos.length) || !pos.every(num)) return bad('PLACE_BAD_ARGS', `--pos "${o.pos || ''}": expected x,y[,z] numbers (map units)`);
  if (o.dir !== undefined && !num(String(o.dir))) return bad('PLACE_BAD_ARGS', `--dir "${o.dir}": degrees`);
  if (o.scale !== undefined && !(num(String(o.scale)) && Number(o.scale) > 0)) return bad('PLACE_BAD_ARGS', `--scale "${o.scale}": positive number`);
  if (o.tex !== undefined && /["\r\n]/.test(o.tex)) return bad('PLACE_BAD_ARGS', '--tex must not contain quotes');
  const defName = String(o.entity || '').toLowerCase().replace(/\.def$/, '');
  if (!/^[a-z0-9_\-]+$/.test(defName)) return bad('PLACE_BAD_ARGS', `--entity "${o.entity || ''}": a .def basename`);

  const exe = o.exe ? games.exeOf(o.exe) : undefined;
  if (o.exe && !exe) return bad('PLACE_BAD_ARGS', `--exe "${o.exe}": one of as64|mowas_2|mowas2|goh`);
  const isGoh = exe === 'goh' || (!exe && games.detect(game) === 'goh');
  if (isGoh && !o.dry) { const why = writeguard.refuseWrite(mod, { game, purpose: 'place-entity' }); if (why) return Object.assign(bad('PLACE_OUT_UNSAFE', why), { refused: why }); }

  // ---- entity def must exist (engine: unknown entity name -> load error)
  let cands, files, gv = null;
  try {
    if (isGoh) {
      // GoH: one vfs view (game + --mods + the mod folder by path on top) gives the defs and the map folder's files
      gv = vfs.build({ gameDir: game, exe: 'goh', mods: o.mods, modDirs: fs.existsSync(mod) ? [mod] : [] });
      const off = (o.mods || []).filter(m => !gv.mods.includes(m.split(':')[0].toLowerCase()));
      if (off.length) return bad('PLACE_BAD_ARGS', `--mods ${off.join(',')}: not mounted in the GoH vfs (${gv.problems.filter(p => p.level === 'error').map(p => p.code).join(' ') || 'not installed'})`);
      const tail = '/' + defName + '.def';
      cands = [...gv.files.keys()].filter(k => k.startsWith('resource/entity/') && k.endsWith(tail)).sort().map(k => ({ key: k, layer: gv.files.get(k).layer }));
      if (!cands.length) return bad('PLACE_ENTITY_UNKNOWN', `no entity def named "${defName}" in GoH vanilla/mods/${path.basename(mod)}`);
      if (cands.some(c => c.layer !== 'base' && !/^patch \d+$/.test(c.layer))) rep.add('-', 0, 'WARN_PLACE_MOD_ENTITY', `"${defName}" is defined in the mod folder/--mods: a mod def placed as a map entity is untested in game [T]`);
      files = new Map();
      const pre = 'resource/map/' + mp + '/';
      for (const [k, rec] of gv.files) if (k.startsWith(pre) && !k.includes('/', pre.length)) files.set(k.slice('resource/'.length), () => vfs.readRec(rec));
    } else {
      const bo = { gameDir: game, mods: o.mods, folder: fs.existsSync(mod) ? mod : null, cache: null, allowUnmounted: fs.existsSync(mod) };
      if (exe) bo.exe = exe;   // entityindex keeps one cache per exe (ix.cachePath)
      if (o.cache) bo.cache = o.cache;
      else if (!o.noCache) bo.cache = path.join(__dirname, '..', 'entityindex', 'cache', 'place-' + crypto.createHash('md5').update([game, (o.mods || []).join(','), mod].join('|')).digest('hex').slice(0, 8) + '.json');
      const { idx } = ix.build(bo);
      cands = idx.byName(defName);
      if (!cands.length) return bad('PLACE_ENTITY_UNKNOWN', `no entity def named "${defName}" in vanilla/mods/${path.basename(mod)}`);
      const modDef = cands.some(c => fs.existsSync(path.join(mod, c.key)) || (o.mods || []).some(m => fs.existsSync(path.join(game, 'mods', m, c.key))));
      if (modDef) rep.add('-', 0, 'WARN_PLACE_MOD_ENTITY', `"${defName}" is defined in the mod folder/--mods: a mod def placed as a map entity is untested in game [T]`);
      files = mapFiles(o, game, mod, mp);
    }
    return place(o, rep, plan, bad, { game, mod, mp, pos, cands, files, isGoh, exe: isGoh ? 'goh' : exe });
  } finally { if (gv) vfs.closeRecs(); }
}

// milint run on a temp mod copy: the game's own rules and vfs view (--exe when a game is named or the folder is GoH; none: as before)
const milintArgs = (d, game, exe) => [path.join(__dirname, '..', 'milint', 'milint.js'), d, '--game', game, '-q'].concat(exe ? ['--exe', exe] : []);

function place(o, rep, plan, bad, { game, mod, mp, pos, cands, files, isGoh, exe }) {
  // ---- map file (+ the folder's .mi files for the uid space)
  const LIM = isGoh ? 0xffffffff : 0x8000;   // GoH entity uid uint32 (GHMAP-26); AS2 16-bit, kept < 0x8000 (the .mi convention)
  const mapKey = 'map/' + mp + '/map';
  if (!files.has(mapKey)) return bad('PLACE_MAP_MISSING', `no map file ${mapKey} in mod/--mods/game (paks); --map is the folder under resource/map/, e.g. multi/1v1_road`);
  const buf = files.get(mapKey)();
  let tree;
  try { tree = sdlwrite.parse(buf); } catch (e) { return bad('PLACE_MAP_NOT_SDL', e.message); }
  const root = sdlwrite.find(tree, 'map');
  if (!root) return bad('PLACE_MAP_NOT_SDL', `${mapKey} has no {map block`);
  const text = buf.toString('latin1');
  const mapUids = uidsOf(text), used = new Set(mapUids);
  for (const [k, rd] of files) if (/\.mi$/.test(k)) for (const u of uidsOf(rd().toString('latin1'))) used.add(u);
  let uid = (mapUids.size ? Math.max(...mapUids) : 0) + 1;
  while (used.has(uid) && uid < LIM) uid++;
  if (uid >= LIM) {
    uid = 1; while (used.has(uid) && uid < LIM) uid++;
    if (uid >= LIM) return bad('PLACE_UID_EXHAUSTED', `no free uid below 0x${LIM.toString(16)} in the map file + .mi set`);
  }

  // ---- world bounds (Clips world rects)
  const x = Number(pos[0]), y = Number(pos[1]);
  const worlds = [];
  for (const w of sdlwrite.findAll(tree, 'map/clips').flatMap(c => c.items).filter(c => c.type === 'block').flatMap(c => sdlwrite.findAll(c, 'world'))) {
    const v = w.items.slice(1).map(n => Number(n.text));
    if (v.length >= 4 && v.every(Number.isFinite)) worlds.push(v);
  }
  if (worlds.length && !worlds.some(([x0, y0, x1, y1]) => x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && y >= Math.min(y0, y1) && y <= Math.max(y0, y1)))
    rep.add('-', 0, 'WARN_PLACE_OUTSIDE_WORLD', `position ${x},${y} is outside every Clip world rect [I]; the entity may be unreachable or culled`);

  // ---- new block
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const xf = [];
  if (o.dir !== undefined && !(isGoh && fmtN(Number(o.dir)) === '0')) xf.push('zl ' + fmtN(Number(o.dir)));   // GoH: no vanilla "zl 0"
  if (o.scale !== undefined) xf.push('scale ' + fmtN(Number(o.scale)));
  const ename = cands[0].key.slice(cands[0].key.lastIndexOf('/') + 1).replace(/\.def$/i, '');
  const lines = [`{Entity "${ename}" 0x${uid.toString(16)}`,`\t\t{Position ${pos.map(p => fmtN(Number(p))).join(' ')}}`];
  if (xf.length) lines.push(`\t\t{xform ${xf.join(' ')}}`);
  if (o.tex !== undefined) lines.push(`\t\t{TexMod "${o.tex}"}`);
  lines.push('\t}');
  const block = lines.join(eol);
  const ents = root.items.filter(n => n.type === 'block' && n.name === 'entity');
  const at = ents.length ? root.items.indexOf(ents[ents.length - 1]) + 1 : root.items.length;
  sdlwrite.insertChild(root, at, Buffer.from(block, 'latin1'));
  const data = sdlwrite.serialize(tree);
  rep.info(mapKey, 0, 'PLACE_UID', `new entity uid 0x${uid.toString(16)} (map file max 0x${(mapUids.size ? Math.max(...mapUids) : 0).toString(16)}, ${used.size} uids used in map + .mi)`);

  // ---- reparse: exactly one more Entity, uid appears once, same prefix before the insertion
  const t2 = data.toString('latin1'), n1 = [...text.matchAll(entityRe)].length, n2 = [...t2.matchAll(entityRe)];
  try { sdlwrite.parse(data); } catch (e) { return bad('PLACE_REPARSE', e.message); }
  if (n2.length !== n1 + 1 || n2.filter(m => Number(m[2]) === uid).length !== 1) return bad('PLACE_REPARSE', `after insert ${n2.length} Entity blocks (want ${n1 + 1}) / uid 0x${uid.toString(16)} not unique`);

  // ---- milint: stage only the map file, compare findings before/after
  const rel = 'resource/' + mapKey;
  const lint = d => {
    const f = path.join(d, ...rel.split('/'));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    return f;
  };
  let milint = null;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'place-entity-'));
  try {
    const run1 = (name, d) => {
      fs.writeFileSync(lint(d), name);
      const r = cp.spawnSync(process.execPath, milintArgs(d, game, exe), { encoding: 'utf8' });
      return (r.stdout || '').split(/\r?\n/).filter(l => /: [A-Z_]+ /.test(l)).map(l => l.replace(/:\d+:/, ':').replace(/^.*?resource[\\/]/, ''));
    };
    const before = run1(buf, path.join(tmp, 'a')), after = run1(data, path.join(tmp, 'b'));
    const bs = new Set(before);
    milint = after.filter(l => !bs.has(l));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  for (const l of milint || []) rep.add(rel, 0, 'PLACE_MILINT', 'new milint finding after placement: ' + l);

  const abs = path.join(mod, ...rel.split('/'));
  plan.push({ rel, abs, data, existing: fs.existsSync(abs), uid, before: buf, entity: ename, pos: pos.map(p => Number(fmtN(Number(p)))), mp, goh: isGoh, game });
  rep.info(rel, 0, 'PLACE_MOD_SYNC', 'map files are CRC-compared in MP: all players need the same mod (VFS-29); the mod copy replaces the whole vanilla `map` file');
  return { rep, plan, blocked: false };
}

// ---- GoH write: read back. after = the bytes now on disk. '' = the entity is in the map once, at the asked place, and the file is the
// bytes it had before plus one inserted run holding that block, in the file's own line ends; else the reason.
function readBack(p, after) {
  const key = 'resource/map/' + p.mp + '/map';
  const mapdoc = require('../mapviz/lib/mapkit/mapdoc');
  let rd;
  try { rd = mapdoc.readMap({ has: k => k === key, read: () => after }, p.mp); } catch (e) { return 'the GoH map reader failed on the written file: ' + e.message; }
  if (rd.missing || !rd.map) return 'the written file has no {map block';
  const hits = rd.records.filter(r => r.uid === p.uid);
  if (hits.length !== 1) return `uid 0x${p.uid.toString(16)} found ${hits.length} times in the written map (want 1)`;
  const r = hits[0], near = (a, b) => a !== null && Math.abs(a - b) < 0.006;
  if (r.def !== p.entity.toLowerCase()) return `uid 0x${p.uid.toString(16)} is "${r.def}", not "${p.entity}"`;
  if (!near(r.x, p.pos[0]) || !near(r.y, p.pos[1]) || (p.pos.length > 2 ? !near(r.z, p.pos[2]) : r.z !== null))
    return `"${p.entity}" 0x${p.uid.toString(16)} reads back at ${r.x},${r.y}${r.z === null ? '' : ',' + r.z}, not at ${p.pos.join(',')}`;
  const b = p.before;
  let pre = 0; while (pre < b.length && pre < after.length && b[pre] === after[pre]) pre++;
  const tail = b.length - pre, ins = after.slice(pre, after.length - tail);
  if (after.length <= b.length || !after.slice(after.length - tail).equals(b.slice(pre))) return 'other bytes of the map file changed';
  const it = ins.toString('latin1');
  // the run may start a few bytes into the block (its "\t{" can match the next item's), so the head is looked for without the brace
  if (!it.includes(`Entity "${p.entity}" 0x${p.uid.toString(16)}`)) return 'the inserted text is not the new Entity block';
  if (b.includes('\r\n') && /(^|[^\r])\n/.test(it)) return 'the inserted block has bare LF line ends in a CRLF map';
  return '';
}
// writeGoh(mod, plan) -> [{rel, restore, uid}] | throws Error (code PLACE_READBACK, or MOD_WRITE_OUTSIDE from lib/modwrite).
// Per file: guard, restore point, write, read back; a read back that fails puts the old bytes back (or removes the new file).
function writeGoh(mod, plan) {
  const MW = require('../lib/modwrite'), out = [];
  for (const p of plan) {
    const opt = { game: p.game, purpose: 'place-entity' };
    MW.guardFile(mod, p.abs, opt);
    const old = fs.existsSync(p.abs) ? fs.readFileSync(p.abs) : null;
    const ids = MW.restorePoints(mod, [p.rel], 'place-entity', opt);
    MW.writeFiles(mod, [[p.rel, p.data]], opt);
    const why = readBack(p, fs.readFileSync(p.abs));
    if (why) {
      if (old) MW.writeFiles(mod, [[p.rel, old]], opt); else fs.rmSync(p.abs, { force: true });
      fs.rmSync(path.join(MW.restoreRoot(mod), ids[0]), { recursive: true, force: true });   // the file is as it was: its point is not needed
      throw Object.assign(new Error(why), { code: 'PLACE_READBACK' });
    }
    out.push({ rel: p.rel, restore: ids[0], uid: p.uid });
  }
  return out;
}
// placeGoh(o) -> {rep, plan, blocked, refused?, written?}: run(o) and, when nothing blocks and o.dry is not set, writeGoh. For callers in
// the same process (the guided map task): o as run() takes it (mod, gameDir, map, entity, pos 'x,y[,z]' in map units, dir, scale, tex, mods),
// exe forced to goh. A read back failure is a PLACE_READBACK finding (blocked).
function placeGoh(o) {
  const res = run(Object.assign({}, o, { exe: 'goh' }));
  const hard = Object.keys(res.rep.counts).filter(c => !c.startsWith('WARN_'));
  if (res.blocked || hard.length || o.dry) return res;
  try { res.written = writeGoh(o.mod, res.plan); } catch (e) { res.rep.add(res.plan[0] ? res.plan[0].rel : '-', 0, e.code === 'PLACE_READBACK' ? 'PLACE_READBACK' : 'PLACE_OUT_UNSAFE', e.message); res.blocked = true; }
  return res;
}

function main(argv) {
  const o = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], nx = () => argv[++i];
    if (a === '--game') o.gameDir = nx(); else if (a === '--mods') o.mods = nx().split(',').filter(Boolean);
    else if (a === '--exe') { const x = nx(); if (!games.get(x)) { console.error('--exe must be one of as64|mowas_2|mowas2|goh'); process.exit(2); } o.exe = games.exeOf(x); }
    else if (a === '--map') o.map = nx(); else if (a === '--entity') o.entity = nx(); else if (a === '--pos') o.pos = nx();
    else if (a === '--dir') o.dir = nx(); else if (a === '--scale') o.scale = nx(); else if (a === '--tex') o.tex = nx();
    else if (a === '--cache') o.cache = nx(); else if (a === '--no-cache') o.noCache = true;
    else if (a === '--dry-run') o.dry = true; else if (a === '-q') o.q = true;
    else if (a.startsWith('-')) { console.error('unknown arg ' + a); process.exit(2); }
    else pos.push(a);
  }
  o.mod = pos[0];
  if (!o.gameDir && o.exe === 'goh') o.gameDir = games.install('goh').dir;
  if (!o.mod || !o.gameDir || !o.map || !o.entity || !o.pos) {
    console.error('usage: node tools/place-entity/place-entity.js <mod dir> --game <G> [--mods a,b] [--exe as64|mowas_2|goh] --map <multi/name> --entity <def name> --pos x,y[,z] [--dir deg] [--scale f] [--tex t] [--dry-run] [--no-cache|--cache f] [-q]');
    process.exit(2);
  }
  const { rep, plan, blocked, refused } = run(o);
  if (refused) { console.error(refused); process.exit(2); }   // GoH writeguard: one plain line, exit 2
  const hard = Object.keys(rep.counts).filter(c => !c.startsWith('WARN_'));
  if (!blocked && !hard.length && !o.dry && plan.length && plan[0].goh) {   // GoH: lib/modwrite + read back
    try {
      for (const w of writeGoh(o.mod, plan)) console.log('wrote ' + w.rel + (plan[0].existing ? ' (updated)' : ' (new)') + ' uid 0x' + w.uid.toString(16) + ' (read back: in place; restore point ' + w.restore + ')');
    } catch (e) {
      rep.add(plan[0].rel, 0, e.code === 'PLACE_READBACK' ? 'PLACE_READBACK' : 'PLACE_OUT_UNSAFE', e.message + (e.code === 'PLACE_READBACK' ? ' (the write was undone)' : ''));
      rep.print({ showInfo: !o.q });
      process.exit(1);
    }
  } else if (!blocked && !hard.length) {
    for (const p of plan) {
      console.log((o.dry ? 'would write ' : 'wrote ') + p.rel + (p.existing ? ' (updated)' : ' (new)') + ' uid 0x' + p.uid.toString(16));
      if (!o.dry) { fs.mkdirSync(path.dirname(p.abs), { recursive: true }); fs.writeFileSync(p.abs, p.data); }
    }
  }
  rep.print({ showInfo: !o.q });
  process.exit(blocked || hard.length ? 1 : 0);
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { run, milintArgs, readBack, writeGoh, placeGoh };
