#!/usr/bin/env node
// clone-entity: L4 create tool. clone a stuff (weapon/ammo/...) into a mod folder as `{from "<base>"}` + overrides, add its desc.lng name.
//   node tools/clone-entity/clone-entity.js --game <dir> [--mods a,b] --out <mod folder> --stuff "<base tags>" --tags <new.dot.tags>
//        [--name "Display"] [--set key=value ...] [--dry-run [--plan-out f.json]] [--no-cache | --cache f] [-q]
//   --plan-out f.json (with --dry-run, any mode): the planned files as JSON [{rel, kind, existing, data: base64 or null for assets}] (gen --plan overlay)
//   --set "damage=add blastwave 50" -> top-level override block `{damage add blastwave 50}` inside the from block (also `--set "key value"`)
//   node tools/clone-entity/clone-entity.js --game <dir> [--mods a,b] --out <mod folder> --entity <name> --as <newname> [--name "Display"]
//        [--copy-assets] [--roster] [--dry-run]   entity mode: <out>/resource/entity/<class>/<new>/<new>.def = base def text with Extension -> entity-relative
//   model ref (or copied mdl/mtl/ply/vol/anm/textures with --copy-assets) and relative includes made root-relative; desc/entity/<new> key; --roster adds the
//   base's MP card line ({"<base>" ...} units/*.set) under the new name (copies the whole roster file into the mod). codes: CLONE_ENTITY_EXISTS
//   CLONE_BASE_BINARY CLONE_MODEL_UNRESOLVED CLONE_INCLUDE_UNRESOLVED (+CLONE_BASE_MISSING/AMBIGUOUS); info CLONE_MODEL_REF CLONE_NO_ASSETS ROSTER_LINE
//   ROSTER_REPLACES CLONE_HUMAN_SKIN CLONE_MP_SYNC (VFS-29). buildings (construction/** defs): --set thickness[.<vol>]/armor/armor.args/props, --material
//   (buildingEdits below); CLONE_SET_BAD (counted), info CLONE_MATERIAL_NONE/_ARMOR/_BURN CLONE_NO_X_VARIANT. lng via addLng (LOC-01/03/04).
//   donor route: --entity <as64 donor> --as <new> --model-from <GoH entity dir | stem> --goh <GoH dir>: donor def kept, Extension -> "<new>.mdl", the GoH
//   mdl/mtl/ply/vol/anm/textures placed under <out>/resource/entity/<class>/<new>/ (read-only GoH, converted text; no bone check). see placeGohModel.
//   --goh-base <GoH install>: the base GoH paks read after a Workshop/mods --goh folder (found by itself for workshop/content/400750/<id> and <game>/mods/<x>)
// engine ( ReadStuff): stuff tags = file basename split on "."; existing exact tag set wins silently (first wins) -> CLONE_TAG_EXISTS.
//   {from} always written with the base's file name tags (query words like "rifle g43" = pattern not found while base unread; live).
//   `{from "tags"}` clones the stuff found by tags; the blocks inside override. weapon `special` throw_off_always is not copied (KEY-19).
// localization: mod localization/desc.lng exists -> key appended there (LOC-01: it already replaced vanilla's); else a mod-local
//   localization/#clone_entity.lng ('#' = file title dropped from key, so {"desc" {"weapon" {"<tags>" "Name"}}} -> key desc/weapon/<tags>;
//   vanilla desc.lng stays untouched). .lng = UTF-8 + CRLF (LOC-05); keys case-insensitive (LOC-03); dup in one file: later wins (LOC-04).
// codes: errors (block writing) CLONE_BASE_MISSING CLONE_MOD_DROPPED CLONE_BASE_AMBIGUOUS CLONE_TAG_EXISTS CLONE_OUT_UNSAFE CLONE_BAD_ARGS
//   CLONE_LNG_KEY_EXISTS (name key already defined in effective desc.lng; LOC-04, counted, still written) WARN_CLONE_TAG_SHADOW (existing
//   stuff's tags are a subset of the clone's: its queries now also match the clone; FindStuff subset match)
//   breed mode: --breed <set/breed path> --as <new path> [--swap "old=>new"]: see runBreed
//   asset mode: --asset <vfs key> [--as <new key>] [--tint r,g,b]: copy any file (icon, tga, dds, ...) from the vfs winner; see runAsset
//   info (uncounted): KEY19_REEMIT (KEY-19) DAMAGE_REPLACES (KEY-17) KEY19_ANCESTOR
// --exe as64|mowas_2|mowas2|goh (every mode): the game whose data is read (lib/games), handed to the entity index (own cache per exe) and
//   to vfs.build; MoW:AS2 does not see as64/core. none = the vfs default (as64 when as64.exe is in the folder, as before).
//   --exe goh with no --game = the GoH install (games.install). GoH (--exe goh, or a --game folder with binaries/x64/call_to_arms.exe):
//   - the --name key goes to the mod's localizations/default/interface/text/desc/clone_<mod>.pot as a gettext entry {msgctxt "desc/<kind>/<key>"
//     msgid "Name" msgstr ""}: GoH mounts a mod's localizations/ only, never localization/ (GHVFS-04 [V]); the default language's .pot is
//     the fallback for every language (GHLOC-01 [V]); key = msgctxt, an entry without it gives no text (GHLOC-06 [V]); key shape desc/weapon/..,
//     desc/ammo/.., desc/stuff/.., desc/entity/.. as vanilla GoH default.pak [V data]. UTF-8, LF line ends like vanilla GoH .pot. A key the
//     effective GoH texts already define: CLONE_LNG_KEY_EXISTS (counted, still written). Name shown in game [T].
//   - --out inside the GoH install is refused with the lib/writeguard line (CLONE_OUT_UNSAFE) unless --dry-run (ARSENAL does not write there):
//     one line on stderr, exit 2.
//   - the donor route (--model-from) builds an AS2 entity from a GoH model (PORT-105): refused for --exe goh, one games.notFor line, exit 2.
// Author: Imperator_Aug (ARSENAL, ia-174de856)
require('../lib/help')(__filename, [ // --help / -h: usage, exit 0 (HELPFIX2, T-HELP)
  'ARSENAL clone-entity: clone a stuff, entity, breed or asset into a mod folder. Nothing is written with --dry-run or --help.',
  'usage: ARSENAL clone-entity --game <dir> [--mods a,b] --out <mod folder> <mode> [flags]',
  '  stuff:  --stuff "<base tags>" --tags <new.dot.tags> [--name "Display"] [--set key=value ...] [--cache f | --no-cache]',
  '  entity: --entity <name> --as <newname> [--name "Display"] [--copy-assets] [--roster] [--set key=value] [--material m]',
  '  donor:  --entity <as64 donor> --as <new> --model-from <GoH entity dir|stem> --goh <GoH dir> [--goh-base <GoH install>]',
  '  breed:  --breed <set/breed path> --as <new path> [--swap "old=>new"]',
  '  asset:  --asset <vfs key> [--as <new key>] [--tint r,g,b]',
  '  common: --game --mods --out --name --set --dry-run -q',
  'example: ARSENAL clone-entity --game "F:/Steam/Men of War Assault Squad 2" --out C:/mods/m --stuff "rifle g43" --tags rifle.g43x --dry-run',
  'codes and rules: header of tools/clone-entity/clone-entity.js.',
].join('\n'));
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ix = require('../entityindex/index');
const sdlwrite = require('../lib/sdlwrite'), sdl = require('../lib/sdl');
const { encodeText } = require('../lib/enc');
const { createReport } = require('../lib/report');
const { meshRefs } = require('../binhdr/ply');
const pakset = require('../lib/pakset'), cipath = require('../lib/cipath'), games = require('../lib/games');
// root + rel, letter case ignored as the game does (Linux/macOS); exact path first, so Windows gets the plain join. A write target
// keeps the given name unless a file differing only by case is already there (then that one). Fresh listings: this tool writes.
const ciJoin = (root, rel, fsx) => cipath.resolve(root, rel, { cache: new Map(), fs: fsx }) || path.join(root, rel);
const { fixHashTags } = require('../goh2as2/goh2as2');

// ---- --model-from: read-only view of a GoH tree (loose files + resource/**/*.pak, keys lowercase, rooted at resource/)
// FIX-PORT (tools-mod:29) [V MB-R4 kv8s]: a Workshop/mods GoH folder (Valour) names files that sit only in the base GoH paks (kv1s body.ply,
// start.anm in resource/entity/-vehicle.pak). The base install is mounted through tools/lib/vfs (exe goh, no Workshop items) and read after the
// folder's own loose files and paks. base = --goh-base, else found from the folder: <steamapps>/workshop/content/400750/<id> -> <steamapps>/common/
// Call to Arms - Gates of Hell, <game>/mods/<x> -> <game>; a folder that is itself a GoH install (binaries/x64/call_to_arms.exe) needs no base.
function gohBaseOf(goh) {
  const isGame = d => { try { return fs.statSync(path.join(d, 'binaries', 'x64', 'call_to_arms.exe')).isFile(); } catch { return false; } };
  const a = path.resolve(goh);
  if (isGame(a)) return null;
  const up = path.dirname(a), up2 = path.dirname(up);
  if (path.basename(up).toLowerCase() === 'mods' && isGame(up2)) return up2;
  if (path.basename(up) === '400750' && path.basename(up2).toLowerCase() === 'content') { const g = path.join(path.dirname(path.dirname(up2)), 'common', 'Call to Arms - Gates of Hell'); if (isGame(g)) return g; }
  return null;
}
function gohOpen(goh, baseDir) {
  const root = fs.existsSync(path.join(goh, 'resource')) ? path.join(goh, 'resource') : goh;
  const ps = pakset.open(root, null), pk = new Map();
  for (const e of ps.entries) pk.set(e.key.toLowerCase(), e);
  let base = null, vfsLib = null;   // key (no resource/) -> vfs record of the GoH base install
  if (baseDir && path.resolve(baseDir).toLowerCase() !== path.resolve(goh).toLowerCase()) {
    vfsLib = require('../lib/vfs');
    const v = vfsLib.build({ gameDir: baseDir, exe: 'goh', workshop: false });
    base = new Map(); for (const [k, r] of v.files) if (k.startsWith('resource/')) base.set(k.slice(9), r);
  }
  const loose = k => { if (k.startsWith('..')) return null; const p = path.join(root, k); try { return fs.statSync(p).isFile() ? p : null; } catch { return null; } };
  const keys = () => base ? [...pk.keys(), ...base.keys()] : [...pk.keys()];
  return {
    baseDir: base ? baseDir : null,
    has: k => !!loose(k) || pk.has(k) || !!(base && base.has(k)),
    get: k => { const p = loose(k); if (p) return fs.readFileSync(p); const e = pk.get(k); if (e) return pakset.read(e); const r = base && base.get(k); return r ? vfsLib.readRec(r) : null; },
    fromBase: k => !loose(k) && !pk.has(k) && !!(base && base.has(k)),
    list: dir => {   // immediate file names of a dir key with trailing "/"
      const s = new Set();
      try { for (const f of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) if (f.isFile()) s.add(f.name.toLowerCase()); } catch { /* no loose dir */ }
      for (const k of keys()) if (k.startsWith(dir) && !k.includes('/', dir.length)) s.add(k.slice(dir.length));
      return [...s];
    },
    findStem: stem => {   // entity/**/<stem>.mdl; the folder's own hits win over the base's
      const hit = new Set(), tail = '/' + stem + '.mdl';
      for (const k of pk.keys()) if (k.startsWith('entity/') && k.endsWith(tail)) hit.add(k);
      try { for (const f of fs.readdirSync(path.join(root, 'entity'), { recursive: true })) { const k = 'entity/' + String(f).replace(/\\/g, '/').toLowerCase(); if (k.endsWith(tail)) hit.add(k); } } catch { /* no loose entity dir */ }
      if (!hit.size && base) for (const k of base.keys()) if (k.startsWith('entity/') && k.endsWith(tail)) hit.add(k);
      return [...hit].sort();
    },
  };
}
// GoH text -> as64 text: bytes pass through (both read string values as UTF-8,, BOM dropped, {##tag -> {tag;
// binary and non-text bytes pass through
function gohText(buf) {
  if (buf.includes(0)) return buf;
  const b = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF ? buf.subarray(3) : buf;
  return Buffer.from(fixHashTags(b.toString('latin1')), 'latin1');
}

const SKIP_TAGS = new Set(['weapon', 'ammo', 'grenade', 'pattern']);
const words = s => String(s).toLowerCase().split(/\s+/).filter(Boolean);
const sameSet = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
const subset = (a, b) => [...a].every(x => b.has(x));
const inside = (root, p) => { const r = path.relative(root, p); return r !== '' && !r.startsWith('..') && !path.isAbsolute(r); };
const sameDir = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const noComments = s => s.replace(/;.*$/gm, '');
const crlf = lines => lines.join('\r\n') + '\r\n';

function run(o) {
  const rep = createReport(), plan = [];
  const out = path.resolve(o.out), game = path.resolve(o.gameDir);
  const bad = (code, msg) => { rep.add('-', 0, code, msg); return { rep, plan, blocked: true }; };
  let ctx = null;

  // ---- guards (hard rule: vanilla/game dir read-only)
  const gameRes = path.join(game, 'resource');
  if (sameDir(out, game) || sameDir(out, gameRes) || inside(gameRes, out) || (inside(game, out) && !inside(path.join(game, 'mods'), out)))
    return bad('CLONE_OUT_UNSAFE', `--out ${out} is the game dir or inside its vanilla tree; give a mod folder (e.g. <game>/mods/<name> or a scratch dir)`);
  // ---- game (--exe): handed to the entity index and vfs; GoH is also found from the folder (the vfs default does the same)
  if (o.exe && !games.get(o.exe)) return bad('CLONE_BAD_ARGS', `--exe "${o.exe}": one of as64|mowas_2|mowas2|goh`);
  o.exe = o.exe ? games.exeOf(o.exe) : undefined;
  o.isGoh = o.exe === 'goh' || (!o.exe && games.detect(game) === 'goh');
  // refusals the CLI prints as one plain line with exit 2 (r.refused); the finding stays in rep for in-process callers
  const refuse = (code, line) => Object.assign(bad(code, line), { refused: line });
  if (o.isGoh && o.modelFrom) return refuse('CLONE_BAD_ARGS', games.notFor('clone-entity --model-from', 'goh', 'the donor route puts a GoH model under an AS2 def; on GoH clone the GoH entity itself with --entity <name> --as <new>', 'PORT-105'));
  if (o.isGoh && !o.dry) { const why = require('../lib/writeguard').refuseWrite(out, { game, purpose: 'clone-entity' }); if (why) return refuse('CLONE_OUT_UNSAFE', why); }
  if (o.breed) return runBreed(o, rep, plan, out, game, bad);
  if (o.asset) return runAsset(o, rep, plan, out, game, bad);
  if (o.entity) return runEntity(o, rep, plan, out, game, bad);
  const newWords = String(o.tags || '').toLowerCase().split('.').filter(Boolean);
  if (!newWords.length || !/^[a-z0-9_.\-]+$/.test(o.tags.toLowerCase())) return bad('CLONE_BAD_ARGS', `--tags "${o.tags}": need dot-separated tags [a-z0-9_-] (they become the file name)`);
  if (!words(o.stuff).length) return bad('CLONE_BAD_ARGS', '--stuff "<base tags>" required');
  const fileName = newWords.join('.');
  const T = new Set(newWords);

  // ---- index (vanilla + mods + the out folder, so an earlier clone counts as existing)
  const bo = { gameDir: game, mods: o.mods, folder: fs.existsSync(out) ? out : null, cache: null };
  if (o.exe) bo.exe = o.exe;   // entityindex: one cache per exe (ix.cachePath)
  if (o.cache) bo.cache = o.cache;
  else if (!o.noCache) bo.cache = path.join(__dirname, '..', 'entityindex', 'cache', 'clone-' + crypto.createHash('md5').update([game, (o.mods || []).join(','), out].join('|')).digest('hex').slice(0, 8) + '.json');
  const { idx, src } = ix.build(bo);
  ctx = { rep, plan, out, src, bad, game, mods: o.mods || [], isGoh: o.isGoh };
  const ownOf = k => new Set(idx.stuff[k].tags.map(t => t.toLowerCase()));
  const fileTags = k => new Set(k.slice(k.lastIndexOf('/') + 1).toLowerCase().split('.').filter(Boolean));
  // own tags (file name + {tag}) first, then {from} closure; a stuff whose file name tags equal the query wins ties
  const resolve = tagStr => {
    const want = new Set(words(tagStr));
    const all = idx.stuffMatch(tagStr);
    const own = all.filter(k => subset(want, ownOf(k)));
    const pool = own.length ? own : all;
    const exact = pool.filter(k => sameSet(fileTags(k), want));
    return exact.length ? exact : pool;
  };

  // ---- base
  const cands = resolve(o.stuff);
  if (!cands.length) return bad('CLONE_BASE_MISSING', `no stuff with tags "${o.stuff}" (engine would print ERROR "pattern not found")`);
  if (cands.length > 1) return bad('CLONE_BASE_AMBIGUOUS', `"${o.stuff}" matches ${cands.length} stuff, give more tags: ` + cands.slice(0, 12).map(k => k.replace('resource/set/stuff/', '') + ' {' + [...ownOf(k)].join(' ') + '}').join(' | '));
  const baseKey = cands[0];
  const baseText = noComments(src.get(baseKey).toString('latin1'));

  // ---- collision with existing stuff
  for (const k of Object.keys(idx.stuff)) {
    const own = ownOf(k);
    if (sameSet(own, T) || sameSet(fileTags(k), T)) return bad('CLONE_TAG_EXISTS', `tag set {${[...T].join(' ')}} already is stuff ${k}: the engine keeps the first and silently ignores the clone`);
  }
  for (const k of Object.keys(idx.stuff)) {
    const own = ownOf(k);
    if (subset(own, T) && !sameSet(own, T)) rep.add('-', 0, 'WARN_CLONE_TAG_SHADOW', `existing ${k.replace('resource/set/stuff/', '')} {${[...own].join(' ')}} is a subset of the clone's tags: queries for it now match the clone too (FindStuff subset match)`);
  }

  // ---- {from} lookup: first pending file whose name tags hold the query. A clone sorting before its base finds itself: no log line, game dies at load (live: chain.g43 from g43)
  const baseFile = baseKey.slice(baseKey.lastIndexOf('/') + 1).toLowerCase();
  if (subset(fileTags(baseKey), T) && fileName.toLowerCase() < baseFile) return bad('CLONE_FROM_SELF', `"${fileName}" holds every file name tag of base "${baseFile}" and sorts before it: {from} finds the clone itself and the game dies at load with no log line; use e.g. ${baseFile}.${fileName.split('.').filter(t => !fileTags(baseKey).has(t.toLowerCase())).join('.') || 'mod'}`);
  // ---- stuff file
  const sub = baseKey.slice('resource/set/stuff/'.length, baseKey.lastIndexOf('/') + 1);
  const stuffRel = 'resource/set/stuff/' + sub + fileName;
  const sets = o.sets || [];
  // base file name tags, not the query: the engine finds an unread base by pending file name tags only; {tag}/{from} tags exist once read
  const lines = ['{from "' + [...fileTags(baseKey)].join(' ') + '"'];
  const setKeys = new Set();
  for (const s of sets) {
    const m = /^\s*([^=\s{}]+)\s*(?:=|\s)\s*(.*)$/.exec(s);
    if (!m) return bad('CLONE_BAD_ARGS', `--set "${s}": expected key=value`);
    setKeys.add(m[1].toLowerCase());
    lines.push('\t{' + m[1] + (m[2] ? ' ' + m[2] : '') + '}');
    if (m[1].toLowerCase() === 'damage' && !/^add\b/i.test(m[2]))
      rep.info(stuffRel, 0, 'DAMAGE_REPLACES', `--set damage without "add" replaces the inherited damage of that type (${(baseText.match(/\{\s*damage\b/gi) || []).length} damage line(s) in base) (KEY-17)`);
  }
  // KEY-19: {from} copies everything except weapon special throw_off_always
  const hasThrow = t => /\{\s*throw_off_always\b/i.test(t);
  if (hasThrow(baseText)) {
    if (setKeys.has('special')) rep.info(stuffRel, 0, 'KEY19_REEMIT', 'base sets throw_off_always but --set special given: put {throw_off_always} inside it yourself (KEY-19: not copied by {from})');
    else {
      lines.push('\t{special', '\t\t{throw_off_always}', '\t}');
      rep.info(stuffRel, 0, 'KEY19_REEMIT', 'base sets throw_off_always; re-emitted in {special} because {from} does not copy it (KEY-19)');
    }
  } else {
    const seen = new Set([baseKey]);
    for (let k = baseKey; k;) {
      const f = idx.stuff[k].from; if (!f) break;
      const nx = resolve(f).find(x => !seen.has(x)); if (!nx) break;
      seen.add(nx);
      if (hasThrow(noComments(src.get(nx).toString('latin1')))) { rep.info(stuffRel, 0, 'KEY19_ANCESTOR', `ancestor ${nx} sets throw_off_always but base ${baseKey} does not carry it (KEY-19), so the clone does not either`); break; }
      k = nx;
    }
  }
  lines.push('}');
  const body = encodeText(crlf(lines));   // --set values are UTF-8 strings for as64 (ENCFIX); no '?' loss
  plan.push({ rel: stuffRel, abs: path.join(out, stuffRel), data: body, kind: 'stuff', existing: false });
  if (!subset(new Set(words(o.stuff)), T) && [...(idx.tagsOf(baseKey))].some(t => SKIP_TAGS.has(t) && !T.has(t)))
    rep.info(stuffRel, 0, 'CLONE_TAGS_NOT_COPIED', 'tags come from the file name only; add e.g. weapon/ammo to --tags if code looks the clone up by them');

  // ---- localization
  if (o.name) {
    const closure = new Set([...idx.tagsOf(baseKey), ...T]);
    const kind = closure.has('ammo') ? 'ammo' : closure.has('weapon') ? 'weapon' : 'stuff';
    const key = newWords.filter(w => !SKIP_TAGS.has(w)).join(' ');
    const r = addLng(ctx, kind, key, o.name); if (r) return r;
  }
  return { rep, plan, blocked: false };
}

// ---- building --set / --material edits on a def text (byte splices located via sdlwrite parse; no re-print)
//   thickness=N | thickness=hollow N  every {Volume "x" {Thickness ..}} except window*/hole* volumes; thickness.<vol>=N one volume (window/hole ok)
//   armor=<macro> [args N]   replace the ("armor_.." ..) macro call;  armor.args=N  only the args number
//   props=+a,-b   add/remove {props} words
//   --material concrete|wood|steel|stone: swap the {props} material word and armor_house_concrete[_light] <-> armor_house_wood[_heavy]
const MATERIALS = ['concrete', 'wood', 'steel', 'stone'];
function buildingEdits(text, sets, material, rep, rel) {
  const t = sdlwrite.parse(Buffer.from(text, 'latin1')), ge = t.root.items.find(n => n.type === 'block' && n.name === 'game_entity');
  const sp = [], bad = m => { rep.add(rel, 0, 'CLONE_SET_BAD', m); return null; };
  if (!ge) return bad('def has no {game_entity block; --set/--material need one');
  const vols = ge.items.filter(n => n.type === 'block' && n.name === 'volume');
  const volName = v => ((v.items[1] && v.items[1].type === 'string') ? v.items[1].text.slice(1, -1) : '').toLowerCase();
  const thick = v => v.items.find((n, i) => i > 0 && n.type === 'block' && n.name === 'thickness');
  const setThick = (v, val) => {
    const th = thick(v), words = val.trim().split(/\s+/);
    if (!th || th.items.length < 2) return false;
    const first = th.items[1].start, last = th.items[th.items.length - 1].end;
    if (th.items.length >= 3 && words.length === 1) sp.push([th.items[th.items.length - 1].start, last, words[0]]);   // hollow N: keep the mode word
    else sp.push([first, last, val.trim()]);
    return true;
  };
  const armorNode = () => ge.items.find(n => n.type === 'list' && /^armor/i.test(n.name || '') && n.items[0].type === 'string');
  const propsNode = () => ge.items.find(n => n.type === 'block' && n.name === 'props');
  for (const s of sets) {
    const m = /^\s*([^=\s{}]+)\s*(?:=|\s)\s*(.*)$/.exec(s);
    if (!m) return bad(`--set "${s}": expected key=value`);
    const key = m[1].toLowerCase(), val = m[2].trim();
    let hit = 0;
    if (key === 'thickness' || key.startsWith('thickness.')) {
      if (!/^(hollow\s+)?[0-9.]+$/.test(val)) return bad(`--set ${s}: thickness value must be a number or "hollow N"`);
      const one = key === 'thickness' ? null : key.slice(10);
      for (const v of vols) {
        const nm = volName(v);
        if (one === null ? /^(window|hole)/.test(nm) : nm !== one) continue;
        if (setThick(v, val)) hit++;
      }
      if (!hit) return bad(`--set ${s}: no ${one === null ? 'body' : '"' + one + '"'} Volume with a {Thickness}` + (one === null ? '' : ' in the base def'));
    } else if (key === 'armor' || key === 'armor.args') {
      const a = armorNode(); if (!a) return bad(`--set ${s}: base def has no ("armor_..") macro call`);
      if (key === 'armor') {
        const w = val.split(/\s+/);
        if (!/^armor_[a-z0-9_]+$/i.test(w[0])) return bad(`--set ${s}: armor value is "armor_<name> [args N]"`);
        sp.push([a.start, a.end, '("' + w[0] + '"' + (w.length > 1 ? ' ' + w.slice(1).join(' ') : '') + ')']);
      } else {
        const i = a.items.findIndex(n => n.text === 'args');
        if (i < 0 || !a.items[i + 1]) return bad(`--set ${s}: macro "${a.name}" has no args N to change`);
        if (!/^[0-9.]+$/.test(val)) return bad(`--set ${s}: args must be a number`);
        sp.push([a.items[i + 1].start, a.items[i + 1].end, val]);
      }
    } else if (key === 'props') {
      const p = propsNode(); if (!p) return bad(`--set ${s}: base def has no {props block`);
      for (const w of val.split(/[\s,]+/).filter(Boolean)) {
        const add = w[0] !== '-', nm = w.replace(/^[+-]/, '').toLowerCase();
        const at = p.items.findIndex((n, i) => i > 0 && n.type === 'string' && n.text.slice(1, -1).toLowerCase() === nm);
        if (add && at < 0) sp.push([p.end - 1, p.end - 1, ' "' + nm + '"']);
        else if (!add && at >= 0) sp.push([p.items[at].start - 1, p.items[at].end, '']);
      }
    } else return bad(`--set ${s}: building keys are thickness[.<volume>] armor armor.args props (scale is a map placement thing: place-entity xform scale)`);
  }
  if (material) {
    const mat = material.toLowerCase();
    if (!MATERIALS.includes(mat)) return bad(`--material ${material}: one of ${MATERIALS.join(' ')}`);
    const p = propsNode(), at = p ? p.items.findIndex((n, i) => i > 0 && n.type === 'string' && MATERIALS.includes(n.text.slice(1, -1).toLowerCase())) : -1;
    if (at < 0) rep.info(rel, 0, 'CLONE_MATERIAL_NONE', 'no concrete/wood/steel/stone word in {props}: nothing swapped there (damage scripts key on it)');
    else if (p.items[at].text.slice(1, -1).toLowerCase() !== mat) sp.push([p.items[at].start, p.items[at].end, '"' + mat + '"']);
    const a = armorNode(), mm = a && /^armor_house_(concrete|wood)(_light|_heavy)?$/i.exec(a.name);
    if (mm && (mat === 'concrete' || mat === 'wood')) {
      const to = mat === 'wood' ? (mm[1].toLowerCase() === 'concrete' ? 'armor_house_wood' : a.name) : (mm[1].toLowerCase() === 'wood' ? 'armor_house_concrete' : a.name);
      if (to !== a.name) sp.push([a.items[0].start, a.items[0].end, '"' + to + '"']);
    } else if (a && !mm) rep.info(rel, 0, 'CLONE_MATERIAL_ARMOR', `armor macro "${a.name}" has no material variant in vanilla (only armor_house_concrete[_light] <-> armor_house_wood[_heavy]); only {props} swapped. set armor=<macro> yourself`);
    if (mat === 'wood' && p && !p.items.some(n => n.type === 'string' && /^"(burning|break_on_burn)"$/i.test(n.text))) rep.info(rel, 0, 'CLONE_MATERIAL_BURN', 'vanilla wooden buildings also carry props "burning"; add with --set props=+burning if wanted');
  }
  sp.sort((a, b) => b[0] - a[0]);
  let out = text;
  for (const [a, b, r] of sp) out = out.slice(0, a) + r + out.slice(b);
  return out;
}

// ---- --breed mode (COV-MIX2): copy set/breed/<base>.set to set/breed/<as>.set (bytes as-is, CRLF), optional --swap "old=>new" text edits that
// must match exactly once each (e.g. a vision perk). further key edits: patch-entity --file resource/set/breed/<as>.set (reads the mod's copy first).
// codes: CLONE_BASE_MISSING CLONE_ENTITY_EXISTS CLONE_BAD_ARGS CLONE_SWAP_COUNT
// C2c: key missing while a listed mod was dropped by the vfs (e.g. MOD_MODE: mod Requires as64+ but the list lacks it) -> say why, not
// CLONE_BASE_MISSING (CHAIN-T s6). codes: CLONE_MOD_DROPPED (error, blocks writing)
function modDropped(v, key) {
  const d = require('../lib/vfs').dropped(v); if (!d.length) return null;
  return { code: 'CLONE_MOD_DROPPED', msg: `${key} not in the vfs and ${d.length} listed mod(s) were not applied: ${d.join('; ')}${d.some(l => /^MOD_MODE .*lacks as64\+/.test(l)) ? ' -> list as64+ before it (--mods as64+,<mod>)' : ''}` };
}
function runBreed(o, rep, plan, out, game, bad) {
  const norm = s => String(s || '').toLowerCase().replace(/\\/g, '/').replace(/^\/?(resource\/)?(set\/breed\/)?/, '').replace(/\.set$/, '');
  const base = norm(o.breed), nn = norm(o.as);
  if (!/^[a-z0-9_\-\/]+$/.test(nn) || !nn) return bad('CLONE_BAD_ARGS', `--as "${o.as || ''}": need a breed path like mp/rus/my_rifle [a-z0-9_-/]`);
  const key = 'resource/set/breed/' + base + '.set', nkey = 'resource/set/breed/' + nn + '.set';
  const vfs = require('../lib/vfs'), v = vfs.build(Object.assign({ gameDir: game, mods: o.mods }, o.exe ? { exe: o.exe } : {}));
  let txt;
  try {
    const ownBase = path.join(out, key);
    if (fs.existsSync(ownBase)) txt = fs.readFileSync(ownBase).toString('latin1');
    else { const rec = v.files.get(key); if (!rec) return (md => md ? bad(md.code, md.msg) : null)(modDropped(v, key)) || bad('CLONE_BASE_MISSING', `no breed ${key} in the mod or vfs`); txt = vfs.readRec(rec).toString('latin1'); }
    if (v.files.get(nkey) || fs.existsSync(path.join(out, nkey))) return bad('CLONE_ENTITY_EXISTS', `${nkey} already exists (vfs or mod); pick another --as`);
  } finally { vfs.closeRecs && vfs.closeRecs(); }
  for (const sw of o.swaps || []) {
    const i = sw.indexOf('=>'); if (i < 1) return bad('CLONE_BAD_ARGS', `--swap "${sw}": need "old=>new"`);
    const a = sw.slice(0, i), b = sw.slice(i + 2), n = txt.split(a).length - 1;
    if (n !== 1) return bad('CLONE_SWAP_COUNT', `--swap "${a}" matches ${n} times in ${key}; need exactly 1`);
    txt = txt.replace(a, () => b);
  }
  const abs = path.join(out, nkey);
  plan.push({ rel: nkey, abs, data: Buffer.from(txt.replace(/\r?\n/g, '\r\n'), 'latin1'), kind: 'sdl', existing: false });
  rep.info(nkey, 0, 'CLONE_BREED', `copy of ${key}${(o.swaps || []).length ? ' with ' + o.swaps.length + ' swap(s)' : ''}; spawn it by its breed path ${nn}`);
  return { rep, plan, blocked: false };
}

// ---- --asset mode (COV-MIX3 C31): copy one file from the vfs winner into the mod, bytes as-is, at the same key (an override) or at --as.
// --tint r,g,b (0..2 each) scales the colour channels of an uncompressed 24/32 bpp TGA (type 2), so a test sees the mod copy drawn.
const normKey = s => { const k = String(s || '').toLowerCase().replace(/\\/g, '/').replace(/^\/+/, ''); return k.startsWith('resource/') ? k : 'resource/' + k; };
function tintTga(buf, mul) {
  const b = Buffer.from(buf);
  if (b.length < 18 || b[1] !== 0 || b[2] !== 2 || ![24, 32].includes(b[16])) return null;
  const px = b[16] / 8, off = 18 + b[0], n = b.readUInt16LE(12) * b.readUInt16LE(14);
  if (off + n * px > b.length) return null;
  const ch = [mul[2], mul[1], mul[0]];   // TGA stores BGR(A)
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { const p = off + i * px + c; b[p] = Math.min(255, Math.round(b[p] * ch[c])); }
  return b;
}
function runAsset(o, rep, plan, out, game, bad) {
  const key = normKey(o.asset), nkey = o.as ? normKey(o.as) : key;
  if (/(^|\/)\.\.(\/|$)/.test(nkey)) return bad('CLONE_BAD_ARGS', `--as ${o.as}: no .. in a key`);
  let mul = null;
  if (o.tint) { mul = String(o.tint).split(',').map(Number); if (mul.length !== 3 || mul.some(x => !(x >= 0 && x <= 2))) return bad('CLONE_BAD_ARGS', `--tint ${o.tint}: need r,g,b multipliers, each 0..2 (1,0,0 = red, not 255,0,0)`); }
  const abs = path.join(out, nkey);
  // a tinted DDS lands as <stem>.tga (checked below), so the mod's own .dds of that stem (e.g. from --copy-assets) does not block it (CHAIN-N4)
  if (!(mul && /\.dds$/.test(key)) && fs.existsSync(abs)) return bad('CLONE_ENTITY_EXISTS', `${nkey} already exists in the mod`);
  const vfs = require('../lib/vfs'), v = vfs.build(Object.assign({ gameDir: game, mods: o.mods }, o.exe ? { exe: o.exe } : {}));
  let data;
  try { const rec = v.files.get(key); if (!rec) return (md => md ? bad(md.code, md.msg) : null)(modDropped(v, key)) || bad('CLONE_BASE_MISSING', `no ${key} in the vfs`); data = vfs.readRec(rec); }
  finally { vfs.closeRecs && vfs.closeRecs(); }
  // COV-MIX6B: a DXT/raw DDS is decoded and written as a 32 bpp TGA at the same stem (.tga beats .dds, FMT-04), then tinted
  if (mul && /\.dds$/.test(key)) {
    const d = require('../assetsame/assetsame').decodeDds(data);
    if (!d) return bad('CLONE_TINT_UNSUPPORTED', `--tint: ${key} is a DDS format the decoder does not read (DXT1-5, ATI1/2, raw 24/32 only)`);
    const hd = Buffer.alloc(18); hd[2] = 2; hd.writeUInt16LE(d.w, 12); hd.writeUInt16LE(d.h, 14); hd[16] = 32; hd[17] = 0x28; // top-left origin, 8 alpha bits
    const px = Buffer.alloc(d.w * d.h * 4); for (let i = 0; i < d.w * d.h; i++) { px[i * 4] = d.rgba[i * 4 + 2]; px[i * 4 + 1] = d.rgba[i * 4 + 1]; px[i * 4 + 2] = d.rgba[i * 4]; px[i * 4 + 3] = d.rgba[i * 4 + 3]; }
    data = Buffer.concat([hd, px]);
    const tkey = nkey.replace(/\.dds$/, '.tga'), tabs = path.join(out, tkey);
    if (fs.existsSync(tabs)) return bad('CLONE_ENTITY_EXISTS', `${tkey} already exists in the mod`);
    plan.push({ rel: tkey, abs: tabs, data: tintTga(data, mul), kind: 'asset', existing: false });
    rep.info(tkey, 0, 'CLONE_ASSET', `${key} (${d.fmt} ${d.w}x${d.h}) decoded to TGA, tinted ${mul.join(',')}; the .tga is found before the .dds of the same name`);
    return { rep, plan, blocked: false };
  }
  if (mul) { const td = tintTga(data, mul); if (!td) return bad('CLONE_TINT_UNSUPPORTED', `--tint works on uncompressed 24/32 bpp TGA only; ${key} is not one`); data = td; }
  plan.push({ rel: nkey, abs, data, kind: 'asset', existing: false });
  rep.info(nkey, 0, 'CLONE_ASSET', `copy of ${key} (${data.length} bytes)${mul ? ' tinted ' + mul.join(',') : ''}${nkey === key ? '; same key, so the mod copy overrides the base' : ''}`);
  return { rep, plan, blocked: false };
}

// ---- --entity mode: clone a .def (human skin / vehicle / any entity) next to its class folder under a new name
const dirOf = k => k.slice(0, k.lastIndexOf('/') + 1);
const rootRel = k => k.replace(/^resource\//, '');
function runEntity(o, rep, plan, out, game, bad) {
  const nn = String(o.as || '').toLowerCase();
  if (!/^[a-z0-9_\-]+$/.test(nn)) return bad('CLONE_BAD_ARGS', `--as "${o.as || ''}": need a new entity name [a-z0-9_-] (the engine name is the .def basename)`);
  const base = String(o.entity).toLowerCase().replace(/\.def$/, '');
  const bo = { gameDir: game, mods: o.mods, folder: fs.existsSync(out) ? out : null, cache: null };
  if (o.exe) bo.exe = o.exe;   // entityindex: one cache per exe (ix.cachePath)
  if (o.cache) bo.cache = o.cache;
  else if (!o.noCache) bo.cache = path.join(__dirname, '..', 'entityindex', 'cache', 'clone-' + crypto.createHash('md5').update([game, (o.mods || []).join(','), out].join('|')).digest('hex').slice(0, 8) + '.json');
  const { idx, src } = ix.build(bo);
  const ctx = { rep, plan, out, src, bad, game, mods: o.mods || [], isGoh: o.isGoh };
  const cands = idx.byName(base);
  if (!cands.length) return bad('CLONE_BASE_MISSING', `no entity named "${base}" (.def basename)`);
  if (cands.length > 1) return bad('CLONE_BASE_AMBIGUOUS', `"${base}" is ${cands.length} defs: ` + cands.slice(0, 8).map(r => r.key).join(' | '));
  const baseKey = cands[0].key;
  const ex = idx.byName(nn);
  if (ex.length) return bad('CLONE_ENTITY_EXISTS', `entity name "${nn}" already is ${ex[0].key}: names are .def basenames, the clone would be ambiguous`);
  const buf = src.get(baseKey);
  if (!buf || buf.includes(0)) return bad('CLONE_BASE_BINARY', `${baseKey} is binary/unreadable, cannot clone`);
  const bdir = dirOf(baseKey), segs = bdir.split('/').filter(Boolean);
  const parent = segs[segs.length - 1] === base ? segs.slice(0, -1).join('/') + '/' : bdir;
  const newDir = parent + nn + '/', defRel = newDir + nn + '.def';
  const has = k => !!idx.models[k] || src.get(k) !== null;
  const copied = new Set();
  const addFile = (key, destRel) => {
    if (copied.has(destRel)) return;
    const d = src.get(key); if (!d) return;
    copied.add(destRel);
    plan.push({ rel: destRel, abs: path.join(out, destRel), data: d, kind: 'asset', existing: fs.existsSync(path.join(out, destRel)) });
  };
  // texture written as a bare name ({diffuse "x"}, ply part): copied if it sits beside the source; a /texture lookup needs no copy
  const addTexture = (name, fromDir, toDir) => {
    const n = name.toLowerCase().replace(/\\/g, '/');
    if (n.startsWith('/') || n.startsWith('.')) return;
    for (const e of ['', '.dds', '.ebm']) if (n.includes('.') ? !e : e) addFile(fromDir + n + e, toDir + n + e);
  };
  // FMT-03: a mesh names its material inside the binary and resolves it next to itself; no .mtl and no .materials = load-time crash
  const addMeshDeps = (plyKey, destRel) => {
    const d = src.get(plyKey); if (!d) return;
    const from = dirOf(plyKey), to = dirOf(destRel), refs = meshRefs(d);
    for (const t of refs.tex) addTexture(t, from, to);
    for (const m of refs.mtls) {
      const n = m.toLowerCase().replace(/\\/g, '/');
      if (n.startsWith('/') || n.startsWith('..') || !n.endsWith('.mtl')) continue; // rooted or above the folder: same reach from a sibling clone
      const key = path.posix.normalize(from + n), lib = dirOf(key) + '.materials', dest = path.posix.normalize(to + n);
      const body = src.get(key) || src.get(lib);
      if (!body) { rep.add(baseKey, 0, 'CLONE_MTL_MISSING', `${plyKey} names material "${m}": not found and no .materials beside it, the clone crashes on load (FMT-03)`); continue; }
      addFile(key, dest); addFile(lib, dirOf(dest) + '.materials');
      for (const q of body.toString('latin1').matchAll(/\{\s*(?:diffuse|bump|specular|detail|lightmap|envmap|mask)\s+"([^"]+)"/gi)) addTexture(q[1], dirOf(key), dirOf(dest));
    }
  };
  let first = true, text = buf.toString('latin1');
  if ((o.sets && o.sets.length) || o.material) {
    const r = buildingEdits(text, o.sets || [], o.material, rep, baseKey);
    if (r === null) return { rep, plan, blocked: true };
    text = r;
  }
  // destroyed-variant swap is by name ("<name>_x" [T]): the clone has none unless made too
  if (idx.byName(base + '_x').length && !idx.byName(nn + '_x').length)
    rep.info(baseKey, 0, 'CLONE_NO_X_VARIANT', `base has a destroyed variant "${base}_x"; clone "${nn}" has none (swap by "<name>_x" is [T]): clone it too with --as ${nn}_x`);
  if (o.modelFrom) {
    const r = placeGohModel(o, nn, newDir, rep, plan, defRel, baseKey, copied, k => { try { return src.get(k) != null; } catch { return false; } });
    if (r.blocked) return { rep, plan, blocked: true };
  }
  text = text.replace(/(\{\s*extension\s+")([^"]+)(")/gi, (m, a, v, c) => {
    if (o.modelFrom) return a + nn + '.mdl' + c;   // donor def kept; model is the GoH one placed beside the def (relative Extension = next to the def)
    const mk = ix.resolveModel(has, baseKey, v, null);
    if (!mk) { rep.add(baseKey, 0, 'CLONE_MODEL_UNRESOLVED', `Extension "${v}" does not resolve to a model; left as is`); return m; }
    if (!o.copyAssets) return a + '/' + rootRel(mk) + c; // rooted: a relative Extension resolves only next to the def (live key-27: File not found resource/entity/<clone dir>/<rel>)
    const mb = mk.slice(mk.lastIndexOf('/') + 1), nm = first ? nn + '.mdl' : mb;
    first = false;
    const destBase = newDir + nm.replace(/\.mdl$/i, '');
    addFile(mk, newDir + nm);
    for (const mt of ix.mtlCandidates(mk)) addFile(mt, destBase + mt.slice(mk.length - 4));
    const mr = idx.models[mk];
    for (const [kind, val] of (mr ? mr.refs : [])) {
      const rel = path.posix.normalize(val.toLowerCase().replace(/\\/g, '/'));
      if (rel.startsWith('..') || rel.startsWith('/') || !['ply', 'vol', 'anm', 'texture'].includes(kind)) continue;
      addFile(path.posix.normalize(dirOf(mk) + rel), newDir + rel);
      if (kind === 'ply') addMeshDeps(path.posix.normalize(dirOf(mk) + rel), newDir + rel);
    }
    // COV-MIX6: {sequence "x"} with no {file} loads <x>.anm beside the mdl; missing = Resource not found at map load
    const mraw = src.get(mk);
    if (mraw) try {
      (function w(nd) {
        const kids = nd.items.filter(k => k.items);
        if (nd.name === 'sequence' && nd.items[1] && nd.items[1].type === 'string' && !kids.some(k => k.name === 'file')) { const an = nd.items[1].text.replace(/^"|"$/g, '').toLowerCase() + '.anm'; addFile(dirOf(mk) + an, newDir + an); }
        kids.forEach(w);
      })(sdlwrite.parse(mraw).root);
    } catch { /* unparsable mdl: explicit refs only */ }
    addFile(dirOf(mk) + 'anim.txt', newDir + 'anim.txt'); // COV-MIX8: anim.txt beside the mdl is read by folder, no named ref
    return a + nm + c;
  });
  text = text.replace(/(\(\s*include\s+")([^"]+)(")/gi, (m, a, v, c) => {
    if (/^[\/\\]/.test(v)) return m;
    const l = v.toLowerCase().replace(/\\/g, '/'), cand = path.posix.normalize(dirOf(baseKey) + l);
    if (src.get(cand)) return a + '/' + rootRel(cand) + c;
    if (src.get('resource/' + l)) return m;
    rep.add(baseKey, 0, 'CLONE_INCLUDE_UNRESOLVED', `relative include "${v}" not found next to the base def nor under resource/; copy would not find it either`);
    return m;
  });
  plan.unshift({ rel: defRel, abs: path.join(out, defRel), data: Buffer.from(text, 'latin1'), kind: 'def', existing: false });
  if (o.copyAssets && !copied.size) rep.info(defRel, 0, 'CLONE_NO_ASSETS', '--copy-assets: base has no resolvable Extension model, nothing copied');
  if (!o.copyAssets && !o.modelFrom) rep.info(defRel, 0, 'CLONE_MODEL_REF', 'model/mtl stay in the base folder, referenced by rooted path (a relative Extension resolves only next to the def, KEY-27 live); --copy-assets for self-contained');
  if (o.name) { const r = addLng(ctx, 'entity', nn, o.name); if (r) return r; }
  // set entry: MP roster card of the base ({"<base>" ...} in set/multiplayer/units/*.set); humans have none (breed {skin "<new>"})
  if (/\/humanskin\//.test(baseKey)) rep.info(defRel, 0, 'CLONE_HUMAN_SKIN', `humanskin entity: put it on a soldier with {skin "${nn}"} in a set/breed file`);
  const rk = new RegExp('^(\\s*\\{")' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '("\\s)', 'i'), nk = new RegExp('^\\s*\\{"' + nn + '"\\s', 'i');
  const keys = new Set([...src.local.keys(), ...(src.v ? src.v.files.keys() : [])]);
  for (const k of [...keys].sort()) {
    if (!/^resource\/set\/multiplayer\/units\/[^\/]+\.set$/.test(k)) continue;
    const b = src.get(k); if (!b) continue;
    const eol = b.includes('\r\n') ? '\r\n' : '\n', lines = b.toString('latin1').split(/\r?\n/);
    if (lines.some(l => nk.test(l))) continue;
    const i = lines.findIndex(l => rk.test(l)); if (i < 0) continue;
    const nl = lines[i].replace(rk, '$1' + nn + '$2');
    rep.info(k, i + 1, 'ROSTER_LINE', `base card: add ${nl.trim().slice(0, 120)}`);
    if (!o.roster) continue;
    lines.splice(i + 1, 0, nl);
    const mine = fs.existsSync(path.join(out, k));
    if (!mine) rep.info(k, i + 1, 'ROSTER_REPLACES', 'the mod copy replaces the whole vanilla roster file (other mods\' edits of it are shadowed)');
    plan.push({ rel: k, abs: path.join(out, k), data: Buffer.from(lines.join(eol), 'latin1'), kind: 'set', existing: mine });
  }
  if (/^resource\/(entity|set)\//.test(defRel)) rep.info(defRel, 0, 'CLONE_MP_SYNC', 'entity/ and set/ files are CRC-compared in MP: all players need the same mod (VFS-29)');
  return { rep, plan, blocked: false };
}

// --model-from: keep the donor def, place the GoH model files (mdl as <new>.mdl, its mtl/#N.mtl, ply/vol/anm named by the mdl, sequences without
// {file} -> <seq>.anm, mesh-named mtl + textures) under the clone dir. Needs --goh. Text files GoH->as64: bytes kept (UTF-8 = UTF-8), {##x -> {x.
// codes: CLONE_GOH_MODEL_MISSING CLONE_GOH_MODEL_AMBIGUOUS CLONE_BAD_ARGS (errors); WARN_CLONE_GOH_FILE_MISSING (a named file is not in the GoH tree,
// preload stops on a missing anm [I]); CLONE_MTL_MISSING (mesh names a mtl nowhere: load-time crash FMT-03); info CLONE_GOH_PLACED CLONE_GOH_BONES_UNCHECKED
// PORTREV2 (rev-port #15): a rooted texture name ("/x") is looked up in the AS2 vfs (as2Has, key with resource/); missing there -> copied from GoH at
// the same rooted key (a key AS2 lacks, so it shadows nothing), else WARN_CLONE_ROOTED_TEX_MISSING (checker, silent log: PORT-152).
// "$/x": the $ root is not traced (fix-later port-build ebmframes row) -> WARN_CLONE_ROOTED_TEX_UNCHECKED
function placeGohModel(o, nn, newDir, rep, plan, defRel, baseKey, copied, as2Has) {
  const blocked = (code, msg) => { rep.add(defRel, 0, code, msg); return { blocked: true }; };
  if (!o.goh) return blocked('CLONE_BAD_ARGS', '--model-from needs --goh <GoH dir> (a GoH install or Workshop folder, read-only)');
  if (o.copyAssets) return blocked('CLONE_BAD_ARGS', '--model-from and --copy-assets are two model sources: pick one');
  const outAbs = path.resolve(o.out), gohAbs = path.resolve(o.goh);
  if (sameDir(outAbs, gohAbs) || inside(gohAbs, outAbs)) return blocked('CLONE_OUT_UNSAFE', `--out ${outAbs} is inside the GoH tree (read-only); give a mod folder or scratch dir`);
  const baseDir = o.gohBase ? path.resolve(o.gohBase) : gohBaseOf(gohAbs);
  if (baseDir && (sameDir(outAbs, baseDir) || inside(baseDir, outAbs))) return blocked('CLONE_OUT_UNSAFE', `--out ${outAbs} is inside the GoH base tree (read-only)`);
  const g = gohOpen(gohAbs, baseDir);
  const mf = String(o.modelFrom).toLowerCase().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/^resource\//, '').replace(/\.mdl$/, '');
  let mdlKey = null;
  if (mf.includes('/')) {
    if (g.has(mf + '.mdl')) mdlKey = mf + '.mdl';
    else {
      const names = g.list(mf + '/').filter(n => n.endsWith('.mdl')), last = mf.slice(mf.lastIndexOf('/') + 1) + '.mdl';
      const pick = names.includes(last) ? [last] : names;
      if (pick.length > 1) return blocked('CLONE_GOH_MODEL_AMBIGUOUS', `GoH dir ${mf}/ holds ${pick.length} mdl (${pick.join(' ')}): give the stem or dir/stem`);
      if (pick.length) mdlKey = mf + '/' + pick[0];
    }
  } else {
    const hits = g.findStem(mf);
    if (hits.length > 1) return blocked('CLONE_GOH_MODEL_AMBIGUOUS', `GoH stem "${mf}" is ${hits.length} mdl: ` + hits.slice(0, 8).join(' | ') + ' (give the dir)');
    if (hits.length) mdlKey = hits[0];
  }
  if (!mdlKey) return blocked('CLONE_GOH_MODEL_MISSING', `--model-from "${o.modelFrom}": no .mdl found in the GoH tree (stem under entity/, or an entity dir)`);
  const gdir = mdlKey.slice(0, mdlKey.lastIndexOf('/') + 1), n = { mdl: 0, mtl: 0, ply: 0, vol: 0, anm: 0, tex: 0 };
  let nBase = 0;
  const put = (key, destRel, kind, text) => {
    if (copied.has(destRel)) return true;
    let d = g.get(key); if (!d) return false;
    if (g.fromBase(key)) nBase++;
    if (text) d = gohText(d);
    copied.add(destRel); n[kind]++;
    plan.push({ rel: destRel, abs: path.join(outAbs, destRel), data: d, kind: 'asset', existing: fs.existsSync(path.join(outAbs, destRel)) });
    return true;
  };
  const missed = {};   // kind -> names; one finding per kind at the end (a GoH mdl can name 70 files the tree lacks)
  const miss = (what, key) => (missed[what] = missed[what] || new Set()).add(key.slice(key.lastIndexOf('/') + 1));
  const rooted = { missing: new Set(), dollar: new Set() };
  const tex = (name, fromDir, toDir) => {
    const t = name.toLowerCase().replace(/\\/g, '/');
    // FIX-PORT: "$/x" = texture/common/x (texcheck name rule [V MB-R4: AS2 lacks $/_vehicle/kv8s]); AS2 has it -> nothing, else copied from GoH at that key
    if (t.startsWith('$/')) {
      const k = path.posix.normalize('texture/common/' + t.slice(2));
      if (k.startsWith('..')) { rooted.missing.add(t); return; }
      const exts = t.slice(t.lastIndexOf('/') + 1).includes('.') ? [''] : ['.dds', '.ebm', '.tga'];
      if (as2Has && exts.some(e => as2Has('resource/' + k + e))) return;
      for (const e of exts) if (put(k + e, 'resource/' + k + e, 'tex')) return;
      rooted.missing.add(t); return;
    }
    if (t.startsWith('$')) { rooted.dollar.add(t); return; }
    if (t.startsWith('/')) {
      const k = path.posix.normalize(t.replace(/^\/+/, ''));
      if (k.startsWith('..')) { rooted.missing.add(t); return; }
      const exts = t.slice(t.lastIndexOf('/') + 1).includes('.') ? [''] : ['.dds', '.ebm', '.tga'];
      if (as2Has && exts.some(e => as2Has('resource/' + k + e))) return;
      for (const e of exts) if (put(k + e, 'resource/' + k + e, 'tex')) return;
      rooted.missing.add(t); return;
    }
    if (t.startsWith('.')) return;   // relative to the GoH dir: same reach from the clone dir is not given
    for (const e of ['', '.dds', '.ebm']) if (t.includes('.') ? !e : e) if (put(fromDir + t + e, toDir + t + e, 'tex')) return;
    miss('texture', fromDir + t);
  };
  const mtlTex = (body, fromDir, toDir) => { for (const q of body.toString('latin1').matchAll(/\{\s*(?:diffuse\d?|bump|specular|detail|lightmap|envmap|mask)\s+"([^"]+)"/gi)) tex(q[1], fromDir, toDir); };
  const mdlRaw = g.get(mdlKey), mdlText = mdlRaw.toString('latin1').replace(/;.*$/gm, '');
  put(mdlKey, newDir + nn + '.mdl', 'mdl', true);
  for (const mt of ix.mtlCandidates(mdlKey)) if (g.has(mt)) { put(mt, newDir + nn + mt.slice(mdlKey.length - 4), 'mtl', true); mtlTex(g.get(mt), gdir, newDir); }
  const rels = new Map();   // rel -> kind
  for (const m of mdlText.matchAll(/\{\s*(volumeview|polyhedron)\s+"([^"]+)"/gi)) rels.set(m[2].toLowerCase().replace(/\\/g, '/'), m[1].toLowerCase() === 'volumeview' ? 'ply' : 'vol');
  for (const m of mdlText.matchAll(/\{\s*file\s+"([^"]+\.anm)"/gi)) rels.set(m[1].toLowerCase().replace(/\\/g, '/'), 'anm');
  try {   // sequence "x" with no {file}: the engine loads <x>.anm beside the mdl
    (function w(nd) {
      const kids = nd.items.filter(k => k.items);
      if (nd.name === 'sequence' && nd.items[1] && nd.items[1].type === 'string' && !kids.some(k => k.name === 'file')) rels.set(nd.items[1].text.replace(/^"|"$/g, '').toLowerCase() + '.anm', 'anm');
      kids.forEach(w);
    })(sdlwrite.parse(mdlRaw).root);
  } catch { /* unparsable mdl: explicit refs only */ }
  for (const [rel0, kind] of rels) {
    const rel = path.posix.normalize(rel0);
    if (rel.startsWith('..') || rel.startsWith('/')) continue;
    const key = gdir + rel;
    if (!put(key, newDir + rel, kind, false)) { miss(kind, key); continue; }
    if (kind !== 'ply') continue;
    const d = g.get(key), refs = meshRefs(d), from = key.slice(0, key.lastIndexOf('/') + 1), to = (newDir + rel).slice(0, (newDir + rel).lastIndexOf('/') + 1);
    for (const t of refs.tex) tex(t, from, to);
    for (const m of refs.mtls) {
      const mn = m.toLowerCase().replace(/\\/g, '/');
      if (mn.startsWith('/') || mn.startsWith('..') || !mn.endsWith('.mtl')) continue;
      const mk = path.posix.normalize(from + mn), lib = mk.slice(0, mk.lastIndexOf('/') + 1) + '.materials', dest = path.posix.normalize(to + mn);
      const hit = put(mk, dest, 'mtl', true), lh = put(lib, dest.slice(0, dest.lastIndexOf('/') + 1) + '.materials', 'mtl', true);
      if (!hit && !lh) { rep.add(baseKey, 0, 'CLONE_MTL_MISSING', `${key} names material "${m}": not in the GoH tree and no .materials beside it, the clone crashes on load (FMT-03)`); continue; }
      if (hit) mtlTex(g.get(mk), from, to);
    }
  }
  for (const [kind, set] of Object.entries(missed)) {
    const l = [...set];
    rep.add(defRel, 0, 'WARN_CLONE_GOH_FILE_MISSING', `${l.length} ${kind} named by the GoH model are not in the GoH tree (${l.slice(0, 4).join(' ')}${l.length > 4 ? ' ...' : ''})` + (g.baseDir ? '' : ' (no GoH base install read: pass --goh-base <GoH install>)') + (kind === 'anm' ? ': AS2 stops with Resource not found at preload [I]' : ''));
  }
  if (rooted.missing.size) { const l = [...rooted.missing]; rep.add(defRel, 0, 'WARN_CLONE_ROOTED_TEX_MISSING', `${l.length} rooted texture name(s) are in neither the AS2 vfs nor the GoH tree (${l.slice(0, 4).join(' ')}${l.length > 4 ? ' ...' : ''}): the model draws a checker there, game.log is silent (PORT-152) [I]`); }
  if (rooted.dollar.size) { const l = [...rooted.dollar]; rep.add(defRel, 0, 'WARN_CLONE_ROOTED_TEX_UNCHECKED', `${l.length} "$/" texture name(s) not checked, the $ root is not traced (${l.slice(0, 4).join(' ')}${l.length > 4 ? ' ...' : ''}) [I]`); }
  rep.info(defRel, 0, 'CLONE_GOH_PLACED', `GoH model ${mdlKey}: placed ${Object.entries(n).map(([k, v]) => v + ' ' + k).join(', ')} under the clone${nBase ? ` (${nBase} read from the GoH base paks of ${g.baseDir})` : ''}; donor def kept [T: spawn/turret/fire]`);
  rep.info(defRel, 0, 'CLONE_GOH_BONES_UNCHECKED', 'donor def bone/volume names are not compared with the GoH mdl; run pair-fit (plan/reports/pair-fit.md) to see missing bones [I]');
  return { blocked: false };
}

// add desc/<kind>/<key> = name to the mod desc.lng, else mod-local #clone_entity.lng. returns a blocked result or null
function addLng(ctx, kind, key, name) {
  if (!key || /[\r\n]/.test(name)) return ctx.bad('CLONE_BAD_ARGS', '--name needs a non-empty tag key and no line breaks');
  if (ctx.isGoh) return addPot(ctx, kind, key, name);
  const nm = '"' + name.replace(/"/g, '\\"') + '"';
  const modDesc = ciJoin(ctx.out, 'localization/desc.lng');   // written: an existing Desc.lng etc. is reused, never a 2nd case variant
  let modHash = ciJoin(ctx.out, 'localization/#clone_entity.lng');
  // CHAIN-N4 [V log]: a mod's localization/<file> replaces a dep's file of the same name, so a second #clone_entity.lng in a mod that
  // Requires another clone mod dropped the dep's names ("Local string not found"). New file + a --mods dep that has one -> #clone_<mod>.lng
  if (!fs.existsSync(modHash) && ctx.game) {
    const dep = (ctx.mods || []).find(m => cipath.exists(ctx.game, 'mods/' + m + '/localization/#clone_entity.lng', { cache: new Map() }));
    if (dep) {
      modHash = ciJoin(ctx.out, 'localization/#clone_' + path.basename(path.resolve(ctx.out)).toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '.lng');
      ctx.rep.info(path.relative(ctx.out, modHash).replace(/\\/g, '/'), 0, 'CLONE_LNG_RENAMED', `dep ${dep} has localization/#clone_entity.lng; a file of that name here would replace it and drop its names, so this mod's names go to ${path.basename(modHash)}`);
    }
  }
  const useDesc = fs.existsSync(modDesc);
  const file = useDesc ? modDesc : modHash;
  // effective desc.lng: does the key exist already?
  const eff = ctx.src.get('resource/interface/text/desc.lng');
  if (eff && lngHas(eff, kind, key)) ctx.rep.add(path.relative(ctx.out, file).replace(/\\/g, '/'), 0, 'CLONE_LNG_KEY_EXISTS', `desc/${kind}/${key} already defined in the effective desc.lng: ${useDesc ? 'replaced in the mod file' : 'vanilla desc.lng loads after #clone_entity.lng and wins, name will not show; use a mod desc.lng'} (LOC-03/04)`);
  let buf = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.from('{tags\r\n}\r\n', 'utf8');
  const t = sdlwrite.parse(buf), tags = sdlwrite.find(t, 'tags');
  if (!tags) return ctx.bad('CLONE_BAD_ARGS', `${file}: no {tags block to add to`);
  const parents = sdlwrite.findAll(t, useDesc ? 'tags/' + kind : 'tags/desc/' + kind);
  const lk = key.toLowerCase();
  let hit = null;
  for (const p of parents) for (const c of p.items) if (c.type === 'block' && c.name && c.name.replace(/^"|"$/g, '') === lk) hit = c;
  const entry = `{"${key}" ${nm}}`;
  if (hit) sdlwrite.setValue(hit, Buffer.from(nm, 'utf8'), 1);
  else if (!useDesc) sdlwrite.insertChild(tags, tags.items.length, Buffer.from(`{"desc" {"${kind}" ${entry}}}`, 'utf8'));
  else if (parents.length) sdlwrite.insertChild(parents[parents.length - 1], parents[parents.length - 1].items.length, Buffer.from(entry, 'utf8'));
  else sdlwrite.insertChild(tags, tags.items.length, Buffer.from(`{"${kind}" ${entry}}`, 'utf8'));
  const data = sdlwrite.serialize(t);
  ctx.plan.push({ rel: path.relative(ctx.out, file).replace(/\\/g, '/'), abs: file, data, kind: 'lng', existing: fs.existsSync(file) });
  return null;
}

// GoH: desc/<kind>/<key> = name as a gettext entry in the mod's localizations/default/interface/text/desc/clone_<mod>.pot (GHVFS-04,
// GHLOC-01, GHLOC-06; header and entry shape as the vanilla GoH .pot, LF). An entry of that key already in the file: its msgid is replaced.
const potQ = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
function potHas(buf, ctxKey) {
  let t = buf.toString('utf8'); if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  const want = ctxKey.toLowerCase();
  for (const m of t.matchAll(/^msgctxt\s+"((?:[^"\\]|\\.)*)"/gm)) if (m[1].replace(/\\(.)/g, '$1').toLowerCase() === want) return true;
  return false;
}
function addPot(ctx, kind, key, name) {
  const modId = path.basename(path.resolve(ctx.out)).toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'mod';
  const file = ciJoin(ctx.out, 'localizations/default/interface/text/desc/clone_' + modId + '.pot');
  const rel = path.relative(ctx.out, file).replace(/\\/g, '/');
  const ck = 'desc/' + kind + '/' + key.toLowerCase();
  // effective GoH texts (game + mods): resource/interface/text/**/*.pot|.po|.lng after the vfs drops the <lang>/ part
  const keys = ctx.src && ctx.src.v ? [...ctx.src.v.files.keys()].filter(k => k.startsWith('resource/interface/text/') && /\.(pot?|lng)$/.test(k)) : [];
  for (const k of keys) { const b = ctx.src.get(k); if (b && (/\.lng$/.test(k) ? /\/desc\.lng$/.test(k) && lngHas(b, kind, key) : potHas(b, ck))) { ctx.rep.add(rel, 0, 'CLONE_LNG_KEY_EXISTS', `${ck} already defined in ${k.replace(/^resource\//, '')}: which text wins depends on the load order of the two files [I] (GHLOC-01)`); break; } }
  const existing = fs.existsSync(file);
  let text = existing ? fs.readFileSync(file).toString('utf8').replace(/^﻿/, '') : ['#, fuzzy', 'msgid ""', 'msgstr ""', '"Project-Id-Version: ' + modId + '\\n"', '"Language: en\\n"', '"MIME-Version: 1.0\\n"', '"Content-Type: text/plain; charset=UTF-8\\n"', '"Content-Transfer-Encoding: 8bit\\n"', ''].join('\n');
  const eol = text.includes('\r\n') ? '\r\n' : '\n', lines = text.split(/\r?\n/);
  const at = lines.findIndex(l => { const m = /^msgctxt\s+"((?:[^"\\]|\\.)*)"/.exec(l); return m && m[1].replace(/\\(.)/g, '$1').toLowerCase() === ck; });
  if (at >= 0) {
    const mi = lines.findIndex((l, i) => i > at && /^msgid\s/.test(l));
    let end = mi + 1; while (end < lines.length && /^"/.test(lines[end])) end++;   // msgid continuation lines
    lines.splice(mi, end - mi, 'msgid ' + potQ(name));
  } else {
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    lines.push('', 'msgctxt ' + potQ(ck), 'msgid ' + potQ(name), 'msgstr ""', '');
  }
  const data = Buffer.from(lines.join(eol), 'utf8');
  ctx.plan.push({ rel, abs: file, data, kind: 'lng', existing });
  ctx.rep.info(rel, 0, 'CLONE_LNG_GOH', `GoH text ${ck} = ${potQ(name)} in localizations/default (fallback for every language, GHLOC-01); shown in game [T]`);
  return null;
}

// does desc.lng (Buffer, UTF-8) define <kind>/<key>? (case-insensitive, LOC-03)
function lngHas(buf, kind, key) {
  let text = buf.toString('utf8'); if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const tree = sdl.parseLines(text.split(/\r?\n/), () => {}, { resync: 'nextQuote' });
  const lk = key.toLowerCase();
  for (const top of tree.kids) {
    if (!top.name || top.name.toLowerCase() !== 'tags') continue;
    for (const k of sdl.kids(top, kind)) for (const c of k.kids) if (c.name && c.name.toLowerCase() === lk) return true;
  }
  return false;
}

function main(argv) {
  const o = { sets: [], swaps: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], nx = () => argv[++i];
    if (a === '--game') o.gameDir = nx(); else if (a === '--mods') o.mods = nx().split(',').filter(Boolean);
    else if (a === '--out') o.out = nx(); else if (a === '--stuff') o.stuff = nx(); else if (a === '--tags') o.tags = nx();
    else if (a === '--name') o.name = nx(); else if (a === '--set') o.sets.push(nx()); else if (a === '--cache') o.cache = nx();
    else if (a === '--no-cache') o.noCache = true; else if (a === '--dry-run') o.dry = true; else if (a === '-q') o.q = true;
    else if (a === '--entity') o.entity = nx(); else if (a === '--as') o.as = nx(); else if (a === '--copy-assets') o.copyAssets = true; else if (a === '--roster') o.roster = true; else if (a === '--material') o.material = nx();
    else if (a === '--breed') o.breed = nx(); else if (a === '--asset') o.asset = nx(); else if (a === '--tint') o.tint = nx(); else if (a === '--swap') o.swaps.push(nx());
    else if (a === '--model-from') o.modelFrom = nx(); else if (a === '--goh') o.goh = nx(); else if (a === '--goh-base') o.gohBase = nx();
    else if (a === '--plan-out') o.planOut = nx();
    else if (a === '--exe') { const x = nx(); if (!games.get(x)) { console.error('--exe must be one of as64|mowas_2|mowas2|goh'); process.exit(2); } o.exe = games.exeOf(x); }
    else { console.error('unknown arg ' + a); process.exit(2); }
  }
  if (!o.gameDir && o.exe === 'goh') o.gameDir = games.install('goh').dir;
  if (!o.gameDir || !o.out || (o.asset ? false : o.entity || o.breed ? !o.as : (!o.stuff || !o.tags))) {
    console.error('usage: node tools/clone-entity/clone-entity.js --game <dir> [--mods a,b] --out <mod folder> --stuff "<base tags>" --tags <new.dot.tags> [--name "Display"] [--set key=value ...] [--dry-run] [--no-cache|--cache f] [-q]\n   or: --game <dir> [--mods a,b] --out <mod folder> --entity <name> --as <newname> [--name "Display"] [--copy-assets | --model-from <GoH entity dir|stem> --goh <GoH dir> [--goh-base <GoH install>]] [--roster] [--set thickness=N|thickness.<vol>=N|armor=<macro> args N|armor.args=N|props=+a,-b ...] [--material concrete|wood|steel|stone] [--dry-run] [-q]\n   or: --game <dir> [--mods a,b] --out <mod folder> --breed <mp/rus/rifle> --as <mp/rus/new> [--swap "old=>new" ...] [--dry-run]\n   or: --game <dir> [--mods a,b] --out <mod folder> --asset <vfs key> [--as <new key>] [--tint r,g,b] [--dry-run]');
    process.exit(2);
  }
  const { rep, plan, blocked, refused } = run(o);
  if (refused) { console.error(refused); process.exit(2); }
  if (!blocked) {
    const out = path.resolve(o.out);
    for (const p of plan) {
      if (!inside(out, path.resolve(p.abs))) { rep.add('-', 0, 'CLONE_OUT_UNSAFE', 'refusing to write outside --out: ' + p.abs); continue; }
      console.log((o.dry ? 'would write ' : 'wrote ') + p.rel + (p.existing ? ' (updated)' : ' (new)'));
      if (o.dry && p.kind !== 'asset') console.log(p.data.toString(p.kind === 'lng' ? 'utf8' : 'latin1').replace(/\r\n/g, '\n').replace(/^/gm, '    | ').replace(/    \| $/, ''));
      else if (!o.dry) { fs.mkdirSync(path.dirname(p.abs), { recursive: true }); fs.writeFileSync(p.abs, p.data); }
    }
    // --dry-run --plan-out f: the planned files as JSON [{rel, kind, existing, data(base64)}] so a caller (gen --plan) can hold them in
    // memory and edit them further in the same plan; assets (models, textures) carry no data, only their path
    if (o.dry && o.planOut) fs.writeFileSync(o.planOut, JSON.stringify(plan.filter(p => inside(out, path.resolve(p.abs))).map(p => ({ rel: String(p.rel).replace(/\\/g, '/'), kind: p.kind, existing: !!p.existing, data: p.kind === 'asset' ? null : Buffer.from(p.data).toString('base64') }))));
  }
  rep.print({ showInfo: !o.q });
  process.exit(blocked ? 1 : 0);
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { run, gohText, ciJoin };
