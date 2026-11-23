#!/usr/bin/env node
// refcheck: dangling references + range checks over the entityindex cache.
//   as2 refcheck <gameDir|-> [--mods a,b] [--folder dir] [--cache f] [--scope all|mod] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary]
//   builds/refreshes the entityindex cache first (only changed files re-parsed), then checks. read-only on game data.
//   --scope mod  keep findings located in a mod file or about an entity whose winning def is from a mod
//   --exe X      the game whose vfs view is checked (lib/games): as64 (default when as64.exe is in the folder, as before), mowas_2 (no
//                as64/core), goh (the GoH install from lib/games install('goh') when no gameDir is given). One entityindex cache per exe.
//                GoH: GOH_KEY (DMG-20) is not reported (GoH reads OvermatchCalibre, GHDMG-27); SPEED_BEFORE_LOCO / SPEED_ORDER are not
//                reported ({Speed} is skipped, Slow/Normal/Fast sit in Locomotion, GHMOV-44); the extender list adds the GoH extenders
//                (keys/goh-extenders-catalog, fortification); WARN_SOUND_PRIORITY_HIGH is not reported (as64's top 40 is no GoH bound);
//                REF_FILLING_CYCLE is info (vanilla GoH loads one). The other rules are the AS2 rules [I] for GoH (read against a full
//                vanilla GoH run: the rest of its findings are dead vanilla refs). GoH lookups [I, 2026-11-23]:
//                fireSound / reloadSound = "weapon/shot/" / "weapon/reload/" + the value, never the bare sound/ root; a name is a
//                folder that directly holds .wav files (a folder that only holds folders is no sound), else folder + file title
//                (device sound manager FindFile, : only .wav counted); environment preset = the whole path under
//                set/environment/ without .set, no bare file name. Known vanilla GoH
//                faults (known-vanilla-goh.txt: file, code, the name it names; no line, so a mod's copy of the file keeps them
//                quiet and any other name in it is still reported) are info "[known vanilla defect]": vanilla GoH run: 0 findings.
// finding repeats (same file:line:code from many entities, e.g. a bad line in a shared .ext) are merged: "(+N entities)"
// codes (limits rows): dangling refs: REF_MODEL_MISSING REF_WEAPON_UNKNOWN REF_AMMO_UNKNOWN REF_ITEM_UNKNOWN REF_ANIM_MISSING
//   REF_VISION_UNKNOWN REF_STUFF_ENTITY_MISSING REF_SOUND_MISSING (VIS-08) REF_FSM_MISSING (HUM-26) REF_MESH_MISSING REF_TEXTURE_MISSING
//   range/semantic: OVERMATCH_SHORT (DMG-04) THRESHOLD_LT1 (DMG-19) GOH_KEY (DMG-20) DISABLED_ON (DMG-16) TURNTIME_OMITTED (MOV-03)
//   SPEED_BEFORE_LOCO (MOV-04) STRAFE_MAX (MOV-24) FOOT_ROW_MISSING (HUM-36) VISION_DUP (VIS-01) TERM_DUP TERM_PROP (VIS-03)
//   LOD_ORDER LOD_EMPTY (VIS-20) VISION_MODE_MULTI (VIS-24) PATHER_TERRAIN_UNKNOWN (MOV-10)
//   CHK-REF: INCLUDE_MISSING (PORT-125 TST-108 TST-99) WARN_BREED_PERCENT_HIGH (TST-116) TERRAIN_EFFECT_UNKNOWN (INT-25) CARD_VEHICLE_MISSING (MIS-50)
//   SOUND_LOUDNESS_MISSING (VIS-27) WARN_SOUND_PRIORITY_HIGH (VIS-26) WARN_BOARDER_BASE_UNKNOWN (ENG-33, info in vanilla files) VISION_RULE_SHADOWED (VIS-02)
//   WARN_NIGHT_NO_PENALTY (VIS-07, mod files) ENV_PRESET_MISSING (VIS-12)
//   info (not counted): SPEED_ORDER (MOV-07, vanilla violates it) PATHER_TYPE_OMITTED (MOV-12)
// Author: Imperator_Aug (ARSENAL, ia-4f9f8aa6)
const path = require('path'), crypto = require('crypto');
const ix = require('../entityindex/index'), games = require('../lib/games');
const { createReport } = require('../lib/report');
const { kidsOf, nameOf, argsOf, str0 } = ix;

const args = process.argv.slice(2), pos = [];
const o = { mods: null, folder: null, cache: null };
let quiet = false, summary = false, scope = 'all';
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--mods' || a === '--mod') o.mods = args[++i].split(',').map(s => s.trim()).filter(Boolean);
  else if (a === '--folder') o.folder = args[++i];
  else if (a === '--cache') { o.cache = args[++i]; if (/^(nul|con|prn|aux|com\d|lpt\d)(\..*)?$/i.test(require('path').basename(o.cache))) { console.error(`refcheck: --cache ${o.cache} is a device name, it would write a real file. omit --cache`); process.exit(2); } }
  else if (a === '--scope') scope = args[++i];
  else if (a === '-q') quiet = true;
  else if (a === '--summary') summary = true;
  else if (a === '--format') o.format = args[++i];
  else if (a === '--rc') o.rcFile = args[++i];
  else if (a === '--no-rc') o.noRc = true;
  else if (a === '-o') o.output = args[++i];
  else if (a === '--exe') { const g = games.get(args[++i]); if (!g) { console.error(`refcheck: --exe ${args[i]}: one of as64 mowas_2 mowas2 goh`); process.exit(2); } o.exe = g.exe; }
  else pos.push(a);
}
const USAGE = 'usage: ARSENAL refcheck <gameDir|-> [--mods a,b] [--folder dir] [--cache f] [--scope all|mod] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary] [--rc F|--no-rc] [--format json|sarif|csv|html] [-o FILE]\n  gameDir omitted: --game/AS2_GAME/as2.json/Steam (--exe goh: the GoH install); "-" = folder only, no game (vanilla refs then show as missing)';
if (args.includes('--help') || args.includes('-h')) { console.log(USAGE); process.exit(0); }
const dash = pos[0] === '-';
if (pos[0] && !dash) o.gameDir = pos.shift(); else if (dash) pos.shift();
// --exe goh and no gameDir: the GoH install (never the AS2 install)
if (!o.gameDir && !dash && o.exe === 'goh') { o.gameDir = games.install('goh').dir || undefined; if (!o.gameDir) { console.error('refcheck: --exe goh: no GoH install found (GOH_GAME, as2.json "goh" or Steam); pass its folder'); process.exit(2); } }
if (!o.gameDir && !o.folder) { console.error(USAGE); process.exit(2); }
// DOOR-A: no game named and no "-": find it, or stop (a folder alone silently gave "0 findings" before)
if (!o.gameDir && !dash) o.gameDir = require('../lib/gamedir').require({ what: 'refcheck (pass - for a folder-only check)' });
// a GoH folder with no --exe: name goh, so its index gets the GoH cache file and never takes the place of the AS2 one
if (!o.exe && o.gameDir && games.detect(o.gameDir) === 'goh') o.exe = 'goh';if (!o.cache) o.cache = path.join(__dirname, '..', 'entityindex', 'cache', (o.mods && o.mods.length ? 'mods-' + crypto.createHash('md5').update(o.mods.join(',')).digest('hex').slice(0, 8) : o.folder ? 'folder-' + crypto.createHash('md5').update(path.resolve(o.folder)).digest('hex').slice(0, 8) : 'vanilla') + '.json');

const dirOf = k => k.slice(0, k.lastIndexOf('/') + 1);
const lc = s => String(s).toLowerCase();
const numv = t => t && (t.k === 'INTEGER' || t.k === 'FLOAT') ? t.value : null;
// walk the kid tree; disabled "##on"-style blocks are reported through sink(file,line,code,msg)
function walkAll(b, fn, stack = [], sink = add) {
  for (const c of kidsOf(b)) {
    const n = lc(nameOf(c) || '');
    if (c.disabled) { if (/^#+on$/i.test(c.tag || '')) sink(c.file, c.line, 'DISABLED_ON', `"{${'#' + (c.tag || '')}" is block tag "${c.tag}" (contains #): reader skips the block, script silently disabled (DMG-16)`); continue; }
    fn(c, n, stack);
    stack.push(n); walkAll(c, fn, stack, sink); stack.pop();
  }
}
// per-file facts cached in the entityindex cache (aux tables; stale-checked on file + includes): set/properties scans, vision.set, animation names
const GOH = new Set(['overmatchcalibre', 'highhardness', 'caststeel']);
// fortification: GoH build extender (GHSTR-04 GHGPL-01), 40 vanilla GoH defs use it [I: vanilla data]
const GOH_EXTENDERS = 'flare medic_tent resources heritage waypoint weaponlight vehicle_vitality fortification'.split(' ');
const VISION_SET = 'resource/set/vision/vision.set';
const scanSel = k => (/^resource\/(set|properties)\//.test(k) && !k.startsWith('resource/set/environment/') && !k.startsWith('resource/set/multiplayer')) && require('../lib/sdlset').isSdl(k) && !/\.(fsm|hand|presets)$/.test(k);
const auxSpec = {
  scan: { select: k => scanSel(k) && k !== VISION_SET, extract: t => {
    const out = [], sink = (f, l, c, m) => out.push([f, l, c, m]);
    walkAll(t, (c, n) => {
      const a = argsOf(c);
      if (n === 'overmatchdamping') {
        const rows = [...kidsOf(c)].map(r => numv(r.items[0])).filter(x => x != null);
        if (rows.length && Math.max(...rows) < 90) sink(c.file, c.line, 'OVERMATCH_SHORT', `OvermatchDamping last angle ${Math.max(...rows)} < 90: lookup beyond the table gives scale 1.0 (DMG-04)`);
      } else if (n === 'projectiledamagethreshold') {
        const v = numv(a[0]); if (v != null && v < 1) sink(c.file, c.line, 'THRESHOLD_LT1', `projectileDamageThreshold ${v} is clamped to 1 on read (DMG-19)`);
      } else if (GOH.has(n)) sink(c.file, c.line, 'GOH_KEY', `"${nameOf(c)}" is a Gates of Hell key with no engine reader (DMG-20)`);
    }, [], sink);
    return out;
  } },
  ie: { select: k => k === 'resource/set/interaction_entity/entity.set', extract: t => {
    const out = [], top = [...kidsOf(t)][0], tm = c => lc(nameOf(c) || '');
    const has = (b, f) => { for (const c of kidsOf(b)) if (!c.disabled && (f(c) || has(c, f))) return true; return false; };
    if (top) for (const b of kidsOf(top)) {
      if (b.disabled) continue;
      const t0 = b.items && b.items[0]; if (!t0 || t0.k !== 'STRING') continue;
      out.push({ tags: t0.value.toLowerCase().split(/\s+/).filter(Boolean), file: b.file, line: b.line, time: has(b, c => tm(c) === 'inflammation_time'),
        burn: has(b, c => tm(c) === 'on' && c.items.some(i => i.k === 'STRING' && i.value.toLowerCase() === 'burn_volume')) });
    }
    return out;
  } },
  vision: { select: k => k === VISION_SET, extract: t => {
    const top = [...kidsOf(t)][0], out = [];
    if (top) for (const c of kidsOf(top)) { if (c.disabled) continue; const n = nameOf(c); if (n == null) continue; out.push([n, c.file, c.line]); }
    return out;
  } },
  // filling + from of every stuff, for the cycle rule (PORT-83). Raw: stuff files hold GoH forms the parser may refuse
  fill: { raw: true, select: k => k.startsWith('resource/set/stuff/') && !/\.(fsm|presets)$/i.test(k) && !k.endsWith('/.presets'), extract: b => {
    const lines = b.toString('latin1').split(/\r?\n/), out = { fill: null, line: 0, from: null };
    lines.forEach((raw, i) => {
      let q = false, l = raw; for (let p = 0; p < raw.length; p++) { if (raw[p] === '"') q = !q; else if (raw[p] === ';' && !q) { l = raw.slice(0, p); break; } }
      if (!out.fill) { const m = /\{\s*filling\s+"([^"]*)"/i.exec(l); if (m) { out.fill = m[1].toLowerCase().split(/\s+/).filter(Boolean); out.line = i + 1; } }
      if (!out.from) { const m = /^\s*\{\s*from\s+"([^"]*)"/i.exec(l); if (m) out.from = m[1].toLowerCase().split(/\s+/).filter(Boolean); }
    });
    return out;
  } },
  anim: { raw: true, select: k => k.startsWith('resource/properties/animation/') && !k.endsWith('.anm'), extract: b => [...b.toString('latin1').matchAll(/(?:sequence|blend)\s+"([^"]+)"/gi)].map(m => m[1].toLowerCase()) },
  // CHK-REF: (include "x") per entity/breed/properties file (PORT-125 TST-108 TST-99) + breed {"health" "N%"} (TST-116)
  inc: { raw: true, select: k => /^resource\/(entity|set\/breed|properties)\//.test(k) && /\.(def|ext|mdl|inc|set)$/i.test(k), extract: b => {
    const out = { inc: [], hp: [] };
    rawLines(b).forEach((l, i) => {
      for (const m of l.matchAll(/\(\s*include\s+"([^"]+)"/gi)) if (!m[1].includes('%')) out.inc.push([m[1], i + 1]);
      const h = /\{\s*"?health"?\s+"(\d+(?:\.\d+)?)%"/i.exec(l); if (h) out.hp.push([+h[1], i + 1]);
    });
    return out.inc.length || out.hp.length ? out : null;
  } },
  // ENG-33: boarder {base "x"} names per def (tree: includes resolved) and {sequence "x"} names per model
  brd: { select: k => k.startsWith('resource/entity/') && k.endsWith('.def'), extract: t => {
    const out = [];
    walkAll(t, (c, n, st) => { if (n === 'base' && st.includes('boarder')) { const s = str0(c); if (s && !s.includes('%')) out.push([s, c.file, c.line]); } }, [], () => {});
    return out.length ? out : null;
  } },
  seq: { select: k => k.endsWith('.mdl'), extract: t => {
    const out = new Set(); walkAll(t, (c, n) => { if (n === 'sequence') { const s = str0(c); if (s) out.add(s.toLowerCase()); } }, [], () => {});
    return [...out].sort();
  } },
  // VIS-07: environment preset with {night} and night_vision >= 1
  envn: { raw: true, select: k => k.startsWith('resource/set/environment/'), extract: b => {
    let night = 0, nv = null;
    rawLines(b).forEach((l, i) => { if (/\{\s*night\s*\}/i.test(l)) night = night || i + 1; const m = /\{\s*night_vision\s+([0-9.]+)/i.exec(l); if (m && !nv) nv = [+m[1], i + 1]; });
    return night && nv ? { night, nv } : null;
  } },
  // VIS-12: map {Environment "x"} and helper command {"environment" {name "x"}} preset names
  envc: { raw: true, select: k => k.startsWith('resource/map/') && /\.mi$/i.test(k), extract: b => {
    const lines = rawLines(b), out = [];
    lines.forEach((l, i) => { const m = /\{\s*environment\s+"([^"]+)"/i.exec(l); if (m) out.push([m[1], i + 1]); });
    const txt = lines.join('\n');
    let at = 0, ln = 1;   // line of each match counted on from the last one (a large GoH .mi made this quadratic)
    for (const m of txt.matchAll(/\{\s*"environment"\s*\{\s*name\s+"([^"]+)"/gi)) {
      const end = m.index + m[0].length;
      for (let p = txt.indexOf('\n', at); p >= 0 && p < end; p = txt.indexOf('\n', p + 1)) ln++;
      at = end; out.push([m[1], ln]);
    }
    return out.length ? out : null;
  } },
  // VIS-27: {loudness "name"} uses in sound folder files
  loud: { raw: true, select: k => k.startsWith('resource/sound/') && /\.(set|inc)$/i.test(k) && k !== 'resource/sound/sound.set', extract: b => {
    const out = []; rawLines(b).forEach((l, i) => { for (const m of l.matchAll(/\{\s*loudness\s+"([^"]+)"\s*\}/gi)) out.push([m[1].toLowerCase(), i + 1]); });
    return out.length ? out : null;
  } },
};
// text lines with ; comments cut (quotes respected)
function rawLines(b) {
  return b.toString('latin1').split(/\r?\n/).map(raw => { let q = false; for (let p = 0; p < raw.length; p++) { if (raw[p] === '"') q = !q; else if (raw[p] === ';' && !q) return raw.slice(0, p); } return raw; });
}
// a mod run with no cache of its own yet starts from the vanilla cache of the same exe: entityindex keeps a record only while the
// signature of every file it came from (tried and missing ones too) is unchanged, so the mod's own files are parsed and vanilla is
// not. A cold GoH mod run parsed the whole GoH tree first (past the 600 s limit of check --exe goh on a loaded machine).
// returns the seeded file (removed again when the mods did not mount), else null
function seedCache() {
  if (!o.gameDir || !(o.mods && o.mods.length || o.folder)) return null;
  // both names through the game folder, as ix.build does: another folder than the installed game has its own .f<hash> caches
  const fs = require('fs'), to = ix.cachePath(o.cache, o.exe, o.gameDir);
  try {
    const from = ix.cachePath(path.join(__dirname, '..', 'entityindex', 'cache', 'vanilla.json'), o.exe, o.gameDir);
    if (path.resolve(to) === path.resolve(from) || fs.existsSync(to) || !fs.existsSync(from)) return null;
    fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); return to;
  } catch (e) { try { fs.rmSync(to, { force: true }); } catch (e2) { /* keep */ } return null; }   // no seed (a full disk too): cold, as before
}
const seeded = seedCache();
let built;
try { built = ix.build({ ...o, aux: auxSpec }); }
catch (e) {   // --mods naming a mod the vfs did not mount: entityindex refuses (no silent vanilla index). --folder alone never trips it
  if (seeded) try { require('fs').rmSync(seeded, { force: true }); } catch (e2) { /* keep */ }
  if (e.code !== 'MOD_NOT_MOUNTED') throw e;
  // the hint follows the reason: a mod the game skips for its mod.info version range is in <game>/mods, the --folder hint would mislead
  const why = (e.unmounted || []).map(u => u.why.join(' ')).join(' ');
  const hint = /\bMOD_VERSION:/.test(why)
    ? 'refcheck: the game skips the mod for its mod.info version range (minGameVersion / maxGameVersion): fix the range, or check its files with --folder <mod dir> and no --mods for it'
    : 'refcheck: a folder outside <game>/mods is checked with --folder <dir> and no --mods for it';
  console.error(e.message + '\n' + hint); process.exit(3);
}
const { idx, src, keys, stats } = built;
// the game the vfs used (a GoH folder with no --exe is goh too); folder-only: the --exe named
const isGoh = (src.v ? src.v.exe : o.exe) === 'goh';
const rep = createReport();
const has = k => keys.has(k);

// ---------- finding aggregation ----------
const groups = new Map();   // file|line|code|msg -> { ent:Set, info }
// GoH: every rule runs (the 2026-11-23 vanilla run gave 62 findings in DISABLED_ON REF_ANIM_MISSING REF_SOUND_MISSING ENV_PRESET_MISSING
// REF_TEXTURE_MISSING; each is a real dead name in the game's own files (no file, no folder with .wav files, a preset path with "goh/"
// twice) or {##on, the way vanilla GoH switches a handler off): those sites are in known-vanilla-goh.txt and shown as info. [T] none run in game.
function add(file, line, code, msg, ent, info) {
  const k = file + '\0' + line + '\0' + code + '\0' + msg;
  let g = groups.get(k);
  if (!g) groups.set(k, g = { file, line, code, msg, ents: new Set(), info: !!info, mod: false });
  if (ent) { g.ents.add(ent.name); if (ent.source === 'mod') g.mod = true; }
}
const isModFile = f => scope !== 'mod' || !src.v ? true : src.isModKey(f) || src.local.has(f);

// ---------- cached tree reads for the small set files (settings, LOD, pather) ----------
const treeOf = key => { try { const p = ix.parseKey(src, key); return p && p.tree; } catch (e) { return null; } };
const auxOf = (name, key) => { const r = idx.aux[name] && idx.aux[name][key]; return r ? r.data : null; };

// ---------- 1. entity refs ----------
const anm = new Set(), sndOk = new Set(), sndDir = new Set();
for (const k of keys) {
  if (k.endsWith('.anm')) anm.add(k.slice(k.lastIndexOf('/') + 1, -4));
  else if (k.startsWith('resource/sound/')) {
    if (isGoh) { if (k.endsWith('.wav')) { sndOk.add(k.slice(0, -4)); sndDir.add(k.slice(0, k.lastIndexOf('/'))); } continue; }   // GoH: .wav only, a folder only by its own files
    sndOk.add(k.replace(/\.(wav|ogg|mp3)$/, ''));
    for (let i = k.indexOf('/', 15); i > 0; i = k.indexOf('/', i + 1)) sndDir.add(k.slice(0, i));
  }
}
for (const r of Object.values(idx.aux.anim || {})) if (r.data) for (const m of r.data) anm.add(m);
const visions = new Set();
{
  const list = auxOf('vision', VISION_SET);
  if (list) {
    const seen = new Map();
    for (const [n, file, line] of list) {
      const l = lc(n);
      if (seen.has(l)) add(file, line, 'VISION_DUP', `duplicate vision "${n}" (first at ${seen.get(l)}): keep names unique (VIS-01)`);
      else seen.set(l, file + ':' + line);
      visions.add(l);
    }
  }
}
const stuffHas = v => idx.stuffHas(v);   // entityindex tag -> stuff inverted index
// FMT-22: relative = dir of the file being read, leading / = resource/, "//" = install root, "@" = user dir; no basename/entity fallback
const strictHas = (v, file) => {
  const l = v.toLowerCase().replace(/\\/g, '/');
  if (l[0] === '@' || l.startsWith('//')) return true;
  return has(path.posix.normalize(l[0] === '/' ? 'resource/' + l.slice(1) : dirOf(file) + l));
};
const modelHas = (e, v, file) => ix.resolveModel(has, e.key, v, dirOf(file));
for (const e of Object.values(idx.entities)) {
  for (const [kind, v, file, line] of e.refs) {
    if (kind === 'model') {
      if (!strictHas(v, file)) {
        const f = modelHas(e, v, file);
        if (f) add(file, line, 'REF_WRONG_FOLDER', `Extension "${v}" resolves against ${dirOf(file)} only (FMT-22, no entity/basename fallback): not found there, but exists as ${f}; write "${f.startsWith('resource/') ? '/' + f.slice(9) : f}" or move the file`, e);
        else add(file, line, 'REF_MODEL_MISSING', `Extension "${v}" not found next to the def (relative paths resolve against the file's own folder, leading / = resource/)`, e);
      }
    }
    else if (kind === 'weapon') { if (!stuffHas(v)) add(file, line, 'REF_WEAPON_UNKNOWN', `no set/stuff file carries the tags "${v}"`, e); }
    else if (kind === 'ammo') { if (!stuffHas(v)) add(file, line, 'REF_AMMO_UNKNOWN', `filling "${v}": no set/stuff file carries all these tags`, e); }
    else if (kind === 'item') { if (!stuffHas(v)) add(file, line, 'REF_ITEM_UNKNOWN', `inventory item "${v}": no set/stuff file carries all these tags`, e); }
    else if (kind === 'anim') { if (!anm.has(lc(v))) add(file, line, 'REF_ANIM_MISSING', `boarder animation "${v}" has no .anm file`, e); }
    else if (kind === 'vision') { if (visions.size && !visions.has(lc(v)) && lc(v) !== 'none') add(file, line, 'REF_VISION_UNKNOWN', `vision "${v}" is not defined in set/vision/vision.set`, e); }
  }
  // facts
  let vm = 0; const locoIn = new Map(), speedAfterLoco = new Set();
  for (const [kind, file, line, d, cid] of e.ev || []) {
    if (kind === 'loco') {
      const had = locoIn.get(cid) || 0; locoIn.set(cid, had + 1);
      if (!d) add(file, line, 'TURNTIME_OMITTED', 'Locomotion without TurnTime: engine default 1 s = 360 deg/s (MOV-03)', e, true);   // info: 98 vanilla vehicles omit it
      if (had && speedAfterLoco.has(cid) && !isGoh) add(file, line, 'SPEED_BEFORE_LOCO', 'second Locomotion block after {speed}: re-derives all and resets Slow/Normal/Fast; put {speed} last (MOV-04)', e);
    } else if (kind === 'speed') {
      if (isGoh) continue;   // GoH skips the {Speed} block: Slow/Normal/Fast are read inside Locomotion (GHMOV-44 [V])
      if (locoIn.get(cid)) speedAfterLoco.add(cid);
      const v = Object.fromEntries(d.filter(x => x[1] != null));
      if ((v.slow != null && v.normal != null && v.slow > v.normal) || (v.normal != null && v.fast != null && v.normal > v.fast) || (v.slow != null && v.fast != null && v.slow > v.fast))
        add(file, line, 'SPEED_ORDER', `speed Slow/Normal/Fast not ascending (${d.map(x => x[0] + ' ' + x[1]).join(', ')}): SetMovementSpeed picks first >= requested (MOV-07)`, e, true);
    } else if (kind === 'strafe') { if (d > 6) add(file, line, 'STRAFE_MAX', `Strafe has ${d} entries: engine reads at most 6 (MOV-24)`, e); }
    else if (kind === 'foot') { if (d[1].length) add(file, line, 'FOOT_ROW_MISSING', `Chassis foot ${d[0]} lacks row(s) ${d[1].join(' ')}: engine default speeds are used (HUM-36)`, e); }
    else if (kind === 'dison') add(file, line, 'DISABLED_ON', `"{#${d}" has # in its tag: reader skips the block, script silently disabled (DMG-16)`, e);
  }
  vm = e.extenders.filter(x => x === 'vision_mode').length;
  if (vm > 1) add(e.key, 1, 'VISION_MODE_MULTI', `${vm} vision_mode extenders: only one vision mode (night/thermal/drone) per actor is supported (VIS-24)`, e);
}

// ---------- 1b. def-level engine rules (ENG-02/04/06) ----------
// registered entity types: entity type statics
const ENTITY_TYPES = new Set(['entity', 'game_entity', 'actor', 'human', 'fx']);
// registered extenders (30 tag names)
const EXTENDERS = new Set('shield bone_rotator cannon enumerator light preview railway grass map_point spawn_point mine speaker timer vision_mode smokescreen edifice detail slicer window burning supply_zone talk vitality stuff inventory chassis_manager structure structure_bone land land_patch land_patch_height'.split(' '));
// GoH adds (gohweb keys/goh-extenders-catalog [V]: flare medic_tent resources heritage waypoint weaponlight vehicle_vitality)
if (isGoh) for (const n of GOH_EXTENDERS) EXTENDERS.add(n);
{
  const mods = (idx.meta && idx.meta.mods) || [];
  const rank = l => { l = String(l || ''); if (l === 'base') return [0, 0]; let m = /^patch (\d+)$/.exec(l); if (m) return [1, +m[1]];
    if (l === 'as64/core') return [1, 1e6]; m = /^(.*?)(?: patch (\d+))?$/.exec(l); const i = mods.indexOf(m[1]); return [2 + (i < 0 ? 1e3 : i), m[2] ? +m[2] : 0]; };
  const cmp = (a, b) => { const x = rank(a.layer), y = rank(b.layer); return x[0] - y[0] || x[1] - y[1] || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0); };
  const byN = new Map();
  for (const e of Object.values(idx.entities)) {
    if (e.broken) continue;
    if (e.etype && !ENTITY_TYPES.has(lc(e.etype[0]))) add(e.etype[1], e.etype[2], 'ENTITY_TYPE_UNKNOWN', `entity type "${e.etype[0]}" is not registered (entity game_entity actor human fx): fatal "unknown entity type" (ENG-02)`, e);
    for (const [n, file, line] of e.extl || []) if (!EXTENDERS.has(n)) add(file, line, 'EXTENDER_UNKNOWN', `extender "${n}" is not a registered extender type: engine logs 'Extender "${n}" not found' and skips the block (ENG-06)`, e);
    (byN.get(e.name) || byN.set(e.name, []).get(e.name)).push(e);
  }
  for (const l of byN.values()) {
    if (l.length < 2) continue;
    l.sort(cmp);
    const w = l[0];
    for (const e of l.slice(1)) add(e.key, 1, 'ENTITY_REDEFINITION', `entity name "${e.name}" already defined by ${w.key} [${w.layer}]: "Entity redefinition", this file [${e.layer}] is ignored (first mounted wins; same layer: path order assumed) (ENG-04)`, e);
  }
}

// ---------- 2. stuff refs ----------
const soundDirs = { fire_sound: 'resource/sound/weapon/shot/', reload_sound: 'resource/sound/weapon/reload/' };
for (const s of Object.values(idx.stuff)) {
  const ent = { name: s.name, source: src.v ? (src.isModKey(s.key) ? 'mod' : 'vanilla') : 'mod' };
  for (const [kind, v, file, line] of s.refs) {
    if (s.key.endsWith('.pattern') && kind !== 'entity') continue;   // templates, overridden by users
    if (kind === 'entity') { if (!idx.byName(v).length && !s.key.endsWith('.pattern')) add(file, line, 'REF_STUFF_ENTITY_MISSING', `stuff {entity "${v}"}: no .def with that name`, ent, ent.source === 'vanilla'); }   // vanilla gaps (secret_doc_bag1-3, skirmish_smoke) -> info
    else if (kind === 'fsm') { if (!has('resource/set/stuff/_settings/' + lc(v) + '.fsm')) add(file, line, 'REF_FSM_MISSING', `stuff fsm "${v}": no set/stuff/_settings/${lc(v)}.fsm`, ent); }
    else if (soundDirs[kind]) {
      const rel = lc(v).replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, ''), base = soundDirs[kind] + rel;
      const ok = b => sndOk.has(b) || sndDir.has(b);   // VIS-08: name = file path or folder under /sound/
      if (!ok(base) && (isGoh || !ok('resource/sound/' + rel))) add(file, line, 'REF_SOUND_MISSING', `${kind === 'fire_sound' ? 'fireSound' : 'reloadSound'} "${v}": no .wav file (looked for ${base}.wav or a folder holding .wav files)`, ent);
    }
  }
}

// ---------- 3. model refs ----------
const texExt = ['.dds', '.tga', '.ebm', '.bmp', '.tex'];
for (const m of Object.values(idx.models)) {
  for (const [kind, v, file, line] of m.refs) {
    const l = lc(v).replace(/\\/g, '/');
    if (kind === 'ply' || kind === 'vol' || kind === 'anm') {
      if (!strictHas(l, file)) {
        const alt = [path.posix.normalize('resource/' + l.replace(/^\/+/, '')), path.posix.normalize(dirOf(m.key) + l)].find(has);
        if (alt) add(file, line, 'REF_WRONG_FOLDER', `${kind} "${v}" resolves against ${dirOf(file)} only (FMT-22, no fallback): not found there, but exists as ${alt}`);
        else add(file, line, 'REF_MESH_MISSING', `${kind} "${v}" not found next to ${m.key}`);
      }
    } else if (kind === 'texture') {
      const base = path.posix.normalize(l.startsWith('$/') ? 'resource/texture/common/' + l.slice(2) : l.startsWith('/') ? 'resource/' + l.slice(1) : dirOf(file) + l);
      if (!texExt.some(x => has(base + x)) && !has(base)) add(file, line, 'REF_TEXTURE_MISSING', `texture "${v}" not found (${base}.dds|tga|ebm)`);
    }
  }
}

// ---------- 4. set / properties / stuff trees ----------
let terrains = null;
for (const r of Object.values(idx.aux.scan || {})) if (r.data) for (const [file, line, code, msg] of r.data) if (!(isGoh && code === 'GOH_KEY')) add(file, line, code, msg);   // GoH reads these keys (GHDMG-27)
// settings.set terms (VIS-03)
{
  const t = has('resource/set/vision/settings.set') && treeOf('resource/set/vision/settings.set');
  if (t) {
    const top = [...kidsOf(t)].find(c => lc(nameOf(c) || '') === 'terms'), seen = new Set();
    if (top) for (const c of kidsOf(top)) {
      if (c.disabled) continue;
      const n = nameOf(c), l = lc(n || ''), p = c.items[1];
      if (seen.has(l)) add(c.file, c.line, 'TERM_DUP', `custom term "${n}" already defined (hard error) (VIS-03)`);
      seen.add(l);
      if (p && p.k === 'IDENT' && !['firing', 'actor', 'breed'].includes(lc(p.text))) add(c.file, c.line, 'TERM_PROP', `term "${n}" property "${p.text}": only firing/actor/breed or a built-in/custom term (hard error "incorrect property") (VIS-03)`);
    }
  }
}
// level of detail (VIS-20): distances strictly increase per class
for (const k of ['resource/set/level_of_detail.set', 'resource/set/level_of_detail_manual.set', 'resource/set/level_of_detail_zoom.set']) {
  const t = has(k) && treeOf(k); if (!t) continue;
  const top = [...kidsOf(t)][0]; if (!top) continue;
  for (const cls of kidsOf(top)) {
    if (cls.disabled) continue;
    const ds = [...kidsOf(cls)].filter(d => lc(nameOf(d) || '') === 'distance' && !d.disabled);
    if (!ds.length && nameOf(cls) != null && !argsOf(cls).length && ![...kidsOf(cls)].length) add(cls.file, cls.line, 'LOD_EMPTY', `LOD class "${nameOf(cls)}" has no {distance}: engine error "Empty LOD class" (VIS-20)`);
    let prev = -Infinity;
    for (const d of ds) { const v = numv(argsOf(d)[0]); if (v == null) continue; if (v <= prev) add(d.file, d.line, 'LOD_ORDER', `LOD class "${nameOf(cls)}" distance ${v} not farther than previous ${prev}: "Distance should be farther than previous one" (VIS-20)`); prev = v; }
  }
}
// pathers (MOV-10 / MOV-12)
{
  const tt = has('resource/set/interaction_terrain/terrains.set') && treeOf('resource/set/interaction_terrain/terrains.set');
  terrains = new Set(['undef']);
  const builtinPP = ['ground', 'swamp', 'road', 'no_pass', 'shallow_water', 'water', 'deep_water', 'no_pass_human'];   // the game
  if (tt) walkAll(tt, (c, n) => { if (n === 'pp') for (const t of argsOf(c)) if (t.k === 'STRING') for (const w of t.value.toLowerCase().split(/\s+/)) w && terrains.add(w); });
  const pt = has('resource/set/pather.set') && treeOf('resource/set/pather.set');
  if (pt && terrains.size > 1) {
    const top = [...kidsOf(pt)][0];
    if (top) for (const prof of kidsOf(top)) {
      if (lc(nameOf(prof) || '') !== 'profile' || prof.disabled) continue;
      const tb = [...kidsOf(prof)].find(c => lc(nameOf(c) || '') === 'terrain');
      if (!tb) continue;
      const names = [];
      for (let i = 1; i < tb.items.length; i++) {
        const it = tb.items[i];
        if (it.k === 'STRING') { names.push(lc(it.value)); if (!terrains.has(lc(it.value)) && !builtinPP.includes(lc(it.value))) add(it.file, it.line, 'PATHER_TERRAIN_UNKNOWN', `profile ${str0(prof)}: terrain "${it.value}" is not a pp ground type: resolves to type 0 (undef) and overwrites its cost (MOV-10)`); }
      }
      const miss = [...terrains].filter(x => x !== 'undef' && !names.includes(x));
      if (miss.length) add(prof.file, prof.line, 'PATHER_TYPE_OMITTED', `profile ${str0(prof)} omits terrain type(s) ${miss.join(' ')}: cost 0 = free (MOV-12)`, null, true);
    }
  }
}

// ---------- 5. stray files in set/stuff (SDL-54) ----------
// engine reads every file in set/stuff except .fsm/.presets as a stuff, whatever the extension: editor backups/notes get parsed (or fail to) as stuffs
const STRAY_EXT = new Set(['bak', 'orig', 'old', 'tmp', 'rej', 'diff', 'patch', 'md', 'json', 'log', 'swp', 'bkp', 'backup', 'copy', 'txt', 'zip', 'rar', '7z']);
for (const k of keys) {
  if (!k.startsWith('resource/set/stuff/')) continue;
  const b = k.slice(k.lastIndexOf('/') + 1), m = /\.([^.]+)$/.exec(b);
  if (!(m && STRAY_EXT.has(m[1].toLowerCase())) && !/~$/.test(b)) continue;
  const vanilla = src.v && !src.isModKey(k);
  add(k, 1, 'STUFF_STRAY_FILE', `"${b}" in set/stuff is read as a stuff (any extension except .fsm/.presets): backup/notes file adds or breaks stuff definitions; move it out (SDL-54)`, null, vanilla);
}

// ---------- 5b. stuff filling cycles (PORT-83) ----------
// the game recurses on every stuff matching filling.tags with no guard: a cycle = stack overflow at preload, process
// dies silent with 0xC0000005 and no dump. Tags = file name split on '.', first file read wins per tag set. {from} inherits filling.
{
  const seen = new Map(), items = [];
  for (const k of [...keys].sort()) {
    const rec = idx.aux.fill && idx.aux.fill[k]; if (!rec || !rec.data) continue;
    const tags = k.slice(k.lastIndexOf('/') + 1).toLowerCase().split('.').filter(Boolean), sig = [...tags].sort().join(' ');
    if (seen.has(sig)) continue; seen.set(sig, 1);
    items.push({ k, tags, ...rec.data });
  }
  const hasAll = (it, t) => t.every(w => it.tags.includes(w));
  const fillOf = (it, d = 0) => { if (it.fill) return it; if (d > 12 || !it.from) return null; const b = items.find(o => o !== it && hasAll(o, it.from)); return b ? fillOf(b, d + 1) : null; };
  const state = new Map(), edges = it => { const f = fillOf(it); return f ? items.filter(o => hasAll(o, f.fill)) : []; };
  const report = (from, to, path) => { const own = fillOf(from), names = path.map(p => p.k.replace('resource/set/stuff/', '')).join(' -> ');
    // GoH: info only. vanilla GoH ships such a loop (stuff/mortar/mortar.pattern, filling "mortar") and loads, so the AS2 crash is not shown for GoH [I]
    add(own.k, own.line, 'REF_FILLING_CYCLE', `filling "${own.fill.join(' ')}" loops: ${names}: the game has no cycle guard, stack overflow at preload with no dump or log line (PORT-83)` + (isGoh ? ' [GoH: vanilla has such a loop and loads; crash unproven on GoH]' : ''), null, isGoh); };
  const dfs = (n, path) => { state.set(n, 1);
    for (const e of edges(n)) { if (state.get(e) === 1) report(n, e, path.slice(path.indexOf(e)).concat(e)); else if (!state.get(e)) dfs(e, path.concat(e)); }
    state.set(n, 2); };
  for (const it of items) if (!state.get(it)) dfs(it, [it]);
}

// ---------- 6. interaction entity blocks that burn but never ignite (DMG-17) ----------
// {on "burn_volume"} handler in a block with no {inflammation_time} (engine default 1e38 ms) and no block with a subset of its tags that has one
{
  const k = 'resource/set/interaction_entity/entity.set';
  const rec = idx.aux.ie && idx.aux.ie[k], list = rec && rec.data;
  if (list) {
    const timed = list.filter(x => x.time).map(x => x.tags);
    for (const x of list) {
      if (!x.burn || x.time) continue;
      if (timed.some(t => t.every(w => w === 'generic' || x.tags.includes(w)))) continue;
      const vanilla = src.v && !src.isModKey(x.file);
      add(x.file, x.line, 'WARN_BURN_NO_INFLAMMATION_TIME', `interaction block "${x.tags.join(' ')}" handles {on "burn_volume"} but no {inflammation_time} reaches it (no block with a subset of its tags sets one): engine default 1e38 ms, never ignites (DMG-17)`, null, vanilla);
    }
  }
}

// ---------- 7. CHK-REF rows ----------
const isMod = k => !src.v || src.local.has(k) || src.isModKey(k);
const auxAll = name => Object.entries(idx.aux[name] || {}).filter(([, r]) => r && r.data).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
// PORT-125 TST-108 TST-99: include resolves against the including file's folder only (FMT-22); missing = fatal File not found
for (const [k, r] of auxAll('inc')) {
  for (const [v, line] of r.data.inc) if (!strictHas(v, k)) {
    const base = v.replace(/\\/g, '/').split('/').pop();
    add(k, line, 'INCLUDE_MISSING', `(include "${v}") is not found beside ${k.slice(0, k.lastIndexOf('/') + 1)} (relative includes resolve against the including file's folder, leading / = resource/): copy ${base} next to this file or write the full path, e.g. "/set/breed/mp/<nation>/${base}"; a missing include is a fatal File not found at load (PORT-125 TST-108 TST-99)`);
  }
  // TST-116: 90000% health is fatal at start, 1000% works; vanilla max is below 1000%
  for (const [v, line] of r.data.hp) if (v > 1000) add(k, line, 'WARN_BREED_PERCENT_HIGH', `breed "health" ${v}% is above 1000%: 90000% was fatal at start; use 1000% or less (TST-116)`);
}
// INT-25: terrain material {effect "name"} needs a top-level block of that name in set/interaction_terrain/effects.set
{
  const tk = 'resource/set/interaction_terrain/terrains.set', ek = 'resource/set/interaction_terrain/effects.set';
  const tt = has(tk) && treeOf(tk), et = has(ek) && treeOf(ek);
  if (tt && et) {
    const norm = s => s.toLowerCase().split(/\s+/).filter(Boolean).sort().join(' ');
    const names = new Set(); const top = [...kidsOf(et)][0];
    if (top) for (const c of kidsOf(top)) { if (c.disabled) continue; const n = nameOf(c); if (n != null && c.items[0].k === 'STRING') names.add(norm(n)); }
    walkAll(tt, (c, n) => { if (n !== 'effect') return; const s = str0(c); if (s != null && s.trim() && !names.has(norm(s)))
      add(c.file, c.line, 'TERRAIN_EFFECT_UNKNOWN', `{effect "${s}"} has no block "${s}" in set/interaction_terrain/effects.set (or its includes): "Unknown terrain effect" then a null call when anything hits this ground; add the effect block or name an existing one (INT-25)`); }, [], () => {});
  }
}
// MIS-50: crewed card content "veh ( crew )": the vehicle must exist as an entity, else spawned.back() on an empty list crashes on buy
{
  const done = new Set();
  for (const k of [...keys].filter(k => k.startsWith('resource/set/multiplayer/units/') && k.endsWith('.set')).sort()) {
    const t = treeOf(k); if (!t) continue;
    (function walk(b, card) {
      for (const c of kidsOf(b)) {
        if (c.disabled) continue;
        const n = lc(nameOf(c) || ''), own = c.items[0] && c.items[0].k === 'STRING' ? c.items[0].value : card;
        if (n === 'content' && card != null) {
          const toks = argsOf(c).filter(x => x.k === 'STRING').map(x => x.value).join(' ').replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').split(/\s+/).filter(Boolean);
          toks.forEach((tk, i) => {
            if (toks[i + 1] !== '(' || tk === '(' || tk === ')' || tk.includes('%')) return;
            const v = tk === '*' ? card : tk.split(':')[0];
            if (idx.byName(v).length) return;
            const at = b.file + ':' + b.line + ':' + v; if (done.has(at)) return; done.add(at);
            add(b.file, b.line, 'CARD_VEHICLE_MISSING', `card "${card}" content "${v} ( crew )": no .def named "${v}" on the mount: the vehicle is not created and the crew step crashes the match on buy; add the entity, fix the name, or remove the card (MIS-50)`);
          });
        }
        walk(c, own);
      }
    })(t, null);
  }
}
// ENG-33: boarder {base "x"} plays a model sequence on the host: x must be a {sequence "x"} of the entity's model; unknown = silently nothing
for (const e of Object.values(idx.entities)) {
  const r = idx.aux.brd && idx.aux.brd[e.key]; if (!r || !r.data) continue;
  const seqs = new Set(); let models = 0;
  for (const [kind, v, file] of e.refs) {
    if (kind !== 'model') continue;
    const l = v.toLowerCase().replace(/\\/g, '/'), mk = path.posix.normalize(l[0] === '/' ? 'resource/' + l.slice(1) : dirOf(file) + l);
    const s = idx.aux.seq && idx.aux.seq[mk]; if (!s || !s.data) continue;
    models++; for (const x of s.data) seqs.add(x);
  }
  if (!models) continue;
  for (const [v, file, line] of r.data) if (!seqs.has(lc(v))) add(file, line, 'WARN_BOARDER_BASE_UNKNOWN', `boarder {base "${v}"}: the model has no {sequence "${v}"} (engine looks in the model's animation block, not .anm files); door animation silently does nothing: add the sequence to the .mdl or use one it has (ENG-33)`, e, !isMod(file));   // vanilla files: 86 hits, game effect unverified [T] -> info
}
// VIS-02: rules siblings are first-match: a later sibling testing the same property as an earlier one never applies
{
  const t = has(VISION_SET) && treeOf(VISION_SET);
  if (t) walkAll(t, (c, n) => {
    if (n !== 'rules') return;
    (function sib(b) {
      const seen = new Map();
      for (const r of kidsOf(b)) {
        if (r.disabled) continue;
        const p = lc(nameOf(r) || ''); if (!p) continue;
        if (seen.has(p)) add(r.file, r.line, 'VISION_RULE_SHADOWED', `rule {${nameOf(r)} ...} never applies: an earlier sibling at ${seen.get(p)} tests the same property and wins first (siblings are first-match, children only refine); merge the two or move this one under a different parent (VIS-02)`);
        else seen.set(p, r.file + ':' + r.line);
        sib(r);
      }
    })(c);
  }, [], () => {});
}
// VIS-07: a mod night preset ({night}) with night_vision 1 gets no night sight penalty
for (const [k, r] of auxAll('envn')) if (isMod(k) && r.data.nv[0] >= 1)
  add(k, r.data.nv[1], 'WARN_NIGHT_NO_PENALTY', `preset sets {night} (line ${r.data.night}) but night_vision ${r.data.nv[0]}: sight factor 1 = no night penalty; use a value below 1 (engine default 0.13) if units should see less at night (VIS-07)`);
// VIS-12: environment presets named by maps/commands must exist under set/environment (missing = silent no-op / defaults)
{
  const ids = new Set();
  for (const k of keys) if (k.startsWith('resource/set/environment/')) { const id = k.slice(25).replace(/\.[^./]+$/, ''); ids.add(id); if (!isGoh) ids.add(id.split('/').pop()); }   // GoH: whole path only
  for (const [k, r] of auxAll('envc')) for (const [v, line] of r.data) {
    const id = lc(v).replace(/\\/g, '/').replace(/^\/+/, '').replace(/^set\/environment\//, '').replace(/\.set$/, '');
    if (!ids.has(id)) add(k, line, 'ENV_PRESET_MISSING', `environment preset "${v}" has no file set/environment/${id}.set: the blend is a silent no-op (command) or defaults are used (map); add the preset or fix the name (VIS-12)`);
  }
}
// VIS-27 / VIS-26: a mod sound/sound.set replaces the whole file
{
  const sk = 'resource/sound/sound.set', t = has(sk) && isMod(sk) && treeOf(sk);
  if (t) {
    const top = [...kidsOf(t)][0], names = new Set();
    if (top) for (const c of kidsOf(top)) {
      if (c.disabled || lc(nameOf(c) || '') !== 'loudness') continue;
      const a = argsOf(c), nm = a[0] && a[0].k === 'STRING' ? a[0].value : null; if (nm == null) continue;
      names.add(lc(nm));
      const pr = numv(a[3]);
      if (pr != null && pr > 40 && !isGoh) add(c.file, c.line, 'WARN_SOUND_PRIORITY_HIGH', `loudness "${nm}" priority ${pr} is above as64's top (40, blast big): it outranks every vanilla sound for a channel; scale it into 0-40 (VIS-26)`);
    }
    const used = new Map();
    for (const [k, r] of auxAll('loud')) for (const [n, line] of r.data) if (!used.has(n)) used.set(n, k + ':' + line);
    const miss = [...new Set(['default', ...used.keys()])].filter(n => !names.has(n)).sort();
    if (miss.length && top) add(top.file, top.line, 'SOUND_LOUDNESS_MISSING', `mod sound.set replaces the whole file but lacks loudness ${miss.map(n => `"${n}"${used.has(n) ? ' (used at ' + used.get(n) + ')' : ''}`).join(', ')}: an unknown name falls to a stale default pointer (freed memory); keep "default" and every name in use (VIS-27)`);
  }
}

// ---------- output ----------
const KNOWN = new Set(require('fs').readFileSync(path.join(__dirname, 'known-vanilla.txt'), 'utf8').split(/\r?\n/).filter(l => l && l[0] !== ';'));
// GoH: "<file>\t<CODE>\t<the first quoted name of the finding, JSON>" (no line: a mod's copy of the file keeps these quiet, any other name is reported)
const KNOWN_GOH = isGoh ? new Set(require('fs').readFileSync(path.join(__dirname, 'known-vanilla-goh.txt'), 'utf8').split(/\r?\n/).filter(l => l && l[0] !== ';')) : null;
const nameIn = msg => { const m = /"([^"]*)"/.exec(msg); return m ? m[1] : ''; };
const knownGoh = g => !!KNOWN_GOH && KNOWN_GOH.has(g.file + '\t' + g.code + '\t' + JSON.stringify(nameIn(g.msg).toLowerCase()));
const out = [...groups.values()].filter(g => isModFile(g.file) || g.mod || (scope === 'mod' && false)).sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line);
for (const g of out) {
  if (scope === 'mod' && src.v && !(src.isModKey(g.file) || g.mod)) continue;
  const extra = g.ents.size > 1 ? ` (+${g.ents.size - 1} entities: ${[...g.ents].join(', ')})` : g.ents.size === 1 ? ` (entity ${[...g.ents][0]})` : '';
  const known = isGoh ? knownGoh(g) : KNOWN.has(g.file + ':' + g.line + ' ' + g.code) && !(src.v && src.isModKey(g.file));
  (g.info || known ? rep.info : rep.add).call(rep, g.file, g.line, g.code, g.msg + extra + (known ? ' [known vanilla defect]' : ''));
}
require('../lib/cli').rcPrint(rep, o, o.folder || o.gameDir, 'refcheck', { byCode: true, showInfo: !quiet, summary });
if (process.env.REFCHECK_TIME) console.error(`index: ${stats.entities} entities, parsed ${stats.parsed}, reused ${stats.reused}, ${stats.ms} ms`);
