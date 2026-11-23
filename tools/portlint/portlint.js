#!/usr/bin/env node
// portlint: text faults in a GoH->AS2 ported mod folder (goh2as2 output): defs, sets, stuff, mdl.
//   rows PORT-47 53 85 89 99 124 126 155 157 170 183 184 187 197 (PORT-116, PORT-159 never: see report CHK-PORTL)
// usage: node tools/portlint/portlint.js <mod dir> [--game G] [--exe as64|mowas_2|mowas2] [--base dir] [--format json] [-q] [--summary]
//        node tools/portlint/portlint.js --vfs --game G [--mods a,b] [--exe as64|mowas_2|mowas2]   (whole mounted vfs, the vanilla false-positive run)
//   --game G   vanilla names (entities, stuff, pather profiles, mdl lookups) from the game vfs (paks through lib/vfs)
//   --base dir a loose folder used as the vanilla side instead (tests). with neither, checks that need vanilla names are skipped
//   --exe as64|mowas_2|mowas2  the AS2 build of the --game vfs (lib/sdlset createSource exe; mowas_2: no as64/core, so names only it
//              holds are not vanilla); none = the vfs rule (as64.exe in G -> as64), as before. goh: refused, exit 2 (GoH is the source)
// codes:
//   PORT_STUFF_OVERRIDE     (PORT-47)  resource/properties/stuff*.ext in the mod holds GoH-only {NoVisibilityPatch}: overrides every AS2 weapon, load dies
//   PORT_ENTITY_KEY_LEFT    (PORT-53, PORT-89) GoH entity key with no AS2 entity reader in an entity/properties file (perks: entity form only; breed .set keeps it)
//   PORT_GOH_INCLUDE_DANGLES(PORT-126) relative include in properties/goh/* names a file neither the mod nor vanilla has (stuff.ext stub)
//   PORT_NAME_CLASH         (PORT-155) mod entity def name equals an entity of another kind (tank m24 vs grenade m24)
//   PORT_BONE_MISSING       (PORT-157) def {bone "x"} block for a bone its mdl lacks (donor bone block)
//   PORT_PLACE_CHILD_MISSING(PORT-170) {place "slot" "entity"} child entity defined nowhere (needs vanilla names)
//   PORT_HUMAN_SEQ_KEY      (PORT-184) {events} or {additive} in a sequence of a humanskin mdl (human table)
//   PORT_PATHER_UNKNOWN     (PORT-187) {PatherId "x"} not an AS2 pather profile
//   WARN_PORT_GOH_SET_FORM  (PORT-85)  GoH headgear pattern or {item {tag}{entity}{inventory}} body form in a .set
//   WARN_PORT_NO_STUFF      (PORT-124) GoH-origin inventory weapon def no set/stuff file names or {entity}-points at (no man can carry it)
//   PORT_SPEED_DEFINE       (PORT-197) GoH ("velocity" ...) or dead ("speed_all" ...) define call in set/stuff
//   WARN_PORT_MDL_EVENTS    (PORT-99)  {events} in a sequence of a non-human mdl (as64 parse unknown)
//   WARN_PORT_DONOR_ARMOR_SPA (PORT-183) ported def (listed in gaps/*.gaps.json) keeps donor armor_spa_* calls: translated armour not written
// Author: Imperator_Aug (ARSENAL, ia-78c4ea90)
require('../lib/help')(__filename);
const fs = require('fs'), path = require('path');
const sdl = require('../lib/sdl');
const sdlset = require('../lib/sdlset');
const { createReport, walkFiles, relPath } = require('../lib/report');

// PORT-53 list, same census as goh2as2 ENTITY_DEAD_KEYS (2026-11-05); 'additive' left to PORT-184 (sequence key)
const ENTITY_DEAD_KEYS = new Set('perks grm resources desert snow summer stuff_preview ai_in_manual itemtags spinx spiny spinz hp_broken repairorder dyncmppersistent manualaccuracyzoom blastwave_modifier armor_damage_modifier bigkernel novisibilitypatch light_bone break_fx break_bone mechanicresources sealable tpc_zclip damageblast damagetpc removeentities defaultradius viewstoscale ignorepatherboundsai maxairbornealtitude minrecognizetime aimbone tpcinstantaiming uselookataiming caststeel usehq'.split(' '));
// vanilla AS2 set/pather.set profiles [V goh2as2 T-PATHER, 21]; profiles read from pather.set are added
const AS2_PATHERS = 'human human_flying animal tank tank.light amphibia armored vehicle.large vehicle.small moto cannon.large cannon.small cannon.carried cannon.micro airborne railway shallow_water shallow_water_0 water deep_water deep_water_0'.split(' ');

const lines = buf => buf.toString('latin1').split(/\r?\n/);
const parse = buf => sdl.parseLines(lines(buf), () => {});
const strv = n => n.vals.filter(v => v.t === 's').map(v => v.v);
const lc = s => String(s).toLowerCase();
const extOf = k => { const b = k.slice(k.lastIndexOf('/') + 1), i = b.lastIndexOf('.'); return i < 0 ? '' : b.slice(i + 1).toLowerCase(); };
const baseName = k => { const b = k.slice(k.lastIndexOf('/') + 1), i = b.lastIndexOf('.'); return lc(i < 0 ? b : b.slice(0, i)); };
const dirOf = k => k.slice(0, k.lastIndexOf('/') + 1);
function walk(n, fn, up = []) { for (const k of n.kids) { fn(k, up); walk(k, fn, up.concat([k])); } }

function check(o) {
  const rep = createReport();
  // ---- input files (mod) and vanilla side
  const mod = new Map();   // key -> { file, get }
  let van = null;          // { has(key), get(key), keys[] }
  if (o.vfs || o.gameDir) {
    const so = { gameDir: o.gameDir, mods: o.mods }; if (o.exe) so.exe = o.exe;   // no exe: the vfs rule (as64 first), as before
    const src = sdlset.createSource(so);
    const keys = [...src.v.files.keys()].sort();
    van = { has: k => src.v.files.has(k), get: k => src.readVfs(k), keys };
    if (o.vfs) for (const k of keys) mod.set(k, { file: k, get: () => src.readVfs(k) });
  } else if (o.base) {
    const root = path.resolve(o.base), m = new Map();
    for (const f of walkFiles(root, /./)) m.set(lc(relPath(root, f)), f);
    van = { has: k => m.has(k), get: k => m.has(k) ? fs.readFileSync(m.get(k)) : null, keys: [...m.keys()].sort() };
  }
  let folder = null;
  if (!o.vfs) {
    folder = path.resolve(o.folder);
    for (const f of walkFiles(folder, /./)) {
      const rel = relPath(folder, f), k = lc(rel.startsWith('resource/') ? rel : 'resource/' + rel);
      mod.set(k, { file: rel, get: () => fs.readFileSync(f) });
    }
  }
  const modKeys = [...mod.keys()].sort();
  const get = k => mod.has(k) ? mod.get(k).get() : van ? van.get(k) : null;
  const has = k => mod.has(k) || (!!van && van.has(k));
  const allKeys = van && !o.vfs ? [...new Set(modKeys.concat(van.keys))].sort() : modKeys;
  const trees = new Map();
  const tree = k => { if (!trees.has(k)) { let t = null; try { const b = get(k); if (b && !(b.includes(0))) t = parse(b); } catch (e) { t = null; } trees.set(k, t); } return trees.get(k); };
  const at = (k, line, code, msg) => rep.add(mod.get(k).file, line, code, msg);

  // ---- port markers: gaps/*.gaps.json "def" (goh2as2 output); a modder copy may have none
  const ported = new Set();
  if (folder) for (const k of modKeys) if (/^resource\/gaps\/[^/]+\.gaps\.json$/.test(k)) {
    try { const j = JSON.parse(mod.get(k).get().toString('utf8')); if (j && j.def) ported.add('resource/' + lc(j.def)); } catch (e) {}
  }
  const origin = new Set();   // GOH-ORIGIN.tsv (goh2as2): path column
  if (folder && mod.has('resource/goh-origin.tsv')) for (const l of lines(mod.get('resource/goh-origin.tsv').get())) {
    const p = l.split('\t')[0]; if (p && !p.startsWith('#')) origin.add(lc(p.startsWith('resource/') ? p : 'resource/' + p));
  }
  // ---- name tables
  const defKind = k => { const m = /^resource\/entity\/([^/]+)\//.exec(k); return m ? m[1] : null; };
  const entNames = new Map();   // name -> Set(kind) over mod + vanilla
  const vanEnt = new Map();
  for (const k of allKeys) if (k.endsWith('.def') && defKind(k)) {
    const n = baseName(k);
    if (!entNames.has(n)) entNames.set(n, new Set()); entNames.get(n).add(defKind(k));
    if (van && !o.vfs && van.has(k)) { if (!vanEnt.has(n)) vanEnt.set(n, []); vanEnt.get(n).push(k); }
  }
  const stuffNames = new Set();
  for (const k of allKeys) if (k.startsWith('resource/set/stuff/') && !k.includes('/_settings/')) {
    stuffNames.add(baseName(k));   // the stuff name, and every {entity "x"} it points at
    const b = get(k); if (!b || b.includes(0)) continue;
    const re = /\{\s*entity\s+"([^"]+)"/gi, s = b.toString('latin1'); let m;
    while ((m = re.exec(s))) stuffNames.add(baseName(m[1]));
  }
  const pathers = new Set(AS2_PATHERS);
  { const t = tree('resource/set/pather.set'); if (t) walk(t, n => { if (lc(n.name) === 'profile' && strv(n)[0]) pathers.add(lc(strv(n)[0])); }); }
  const mdlBones = new Map();
  const bonesOf = k => {
    if (mdlBones.has(k)) return mdlBones.get(k);
    const t = tree(k); let s = null;
    if (t) { s = new Set(); walk(t, n => { if (lc(n.name) === 'bone') { const v = n.vals.length ? n.vals[n.vals.length - 1].v : null; if (v) s.add(lc(v)); } }); }
    mdlBones.set(k, s); return s;
  };

  // ---- per file
  for (const k of modKeys) {
    const e = extOf(k), isStuff = k.startsWith('resource/set/stuff/') && !k.includes('/_settings/');
    if (!['def', 'ext', 'inc', 'set', 'mdl'].includes(e) && !isStuff) continue;
    const buf = mod.get(k).get();
    if (buf.includes(0)) continue;
    const L = lines(buf), t = tree(k);
    if (!t) continue;

    // PORT-47
    if (/^resource\/properties\/stuff[^/]*\.ext$/.test(k)) {
      const i = L.findIndex(l => /\{\s*novisibilitypatch\b/i.test(l.split(';')[0]));
      if (i >= 0) at(k, i + 1, 'PORT_STUFF_OVERRIDE', 'GoH stuff properties copied over the AS2 path: AS2 rejects {NoVisibilityPatch} and every weapon fails to load. Delete this file and include "/properties/stuff_small.ext" (or shadow it under properties/goh) (PORT-47)');
    }
    // PORT-53 / PORT-89
    if (['def', 'ext', 'inc'].includes(e) && /^resource\/(entity|properties)\//.test(k) && !/^resource\/properties\/stuff[^/]*\.ext$/.test(k)) {   // stuff*.ext: PORT-47 owns it
      walk(t, n => { const nm = lc(n.name); if (n.name && ENTITY_DEAD_KEYS.has(nm)) at(k, n.line, 'PORT_ENTITY_KEY_LEFT', `{${n.name}} is a GoH entity key no AS2 entity reader takes: the game dies at load with "unexpected token". Remove the block${nm === 'perks' ? ' (perks belong in the breed .set only)' : ''} (PORT-53)`); });
    }
    // PORT-126
    if (/^resource\/properties\/goh\//.test(k)) {
      L.forEach((l, i) => {
        const re = /\(\s*include\s+"([^"]+)"/gi; let m; const s = l.split(';')[0];
        while ((m = re.exec(s))) {
          const inc = m[1].replace(/\\/g, '/'); if (inc.startsWith('/')) continue;
          const tk = lc(dirOf(k) + inc);
          if (!has(tk)) at(k, i + 1, 'PORT_GOH_INCLUDE_DANGLES', `include "${inc}" has no file ${tk.slice(9)}: the load stops. Add a stub ${tk.slice(9)} holding (include "/properties/${inc}") (PORT-126)`);
        }
      });
    }
    // PORT-85
    if (e === 'set') {
      L.forEach((l, i) => { if (/pattern (heavy|light)_headgear/i.test(l.split(';')[0])) at(k, i + 1, 'WARN_PORT_GOH_SET_FORM', 'GoH headgear pattern: AS2 has "helmet pattern" ({from "pattern overcoat"} for body). Rewrite the item in AS2 form (PORT-85)'); });
      walk(t, n => {
        if (lc(n.name) !== 'item') return;
        const ks = new Set(n.kids.map(c => lc(c.name)));
        if (['tag', 'entity', 'inventory'].filter(x => ks.has(x)).length >= 2) at(k, n.line, 'WARN_PORT_GOH_SET_FORM', 'GoH {item {tag}{entity}{inventory}} body form: AS2 reads {item "name" count}. Rewrite the item in AS2 form (PORT-85)');
      });
    }
    // PORT-197
    if (isStuff) L.forEach((l, i) => { const m = /\(\s*"(velocity|speed_all)"/i.exec(l.split(';')[0]); if (m) at(k, i + 1, 'PORT_SPEED_DEFINE', `("${m[1]}" ...) is not an AS2 define: write ("speed" m/s) with the GoH m/s, no factor (PORT-197)`); });
    // PORT-184 / PORT-99
    if (e === 'mdl') {
      const human = /^resource\/entity\/humanskin\//.test(k);
      walk(t, (n, up) => {
        const nm = lc(n.name); if (nm !== 'events' && nm !== 'additive') return;
        if (!up.some(u => lc(u.name) === 'sequence')) return;
        if (human) at(k, n.line, 'PORT_HUMAN_SEQ_KEY', `{${n.name}} in a human table sequence: the AS2 loader stops with "unexpected token". Strip it (PORT-184)`);
        else if (nm === 'events') at(k, n.line, 'WARN_PORT_MDL_EVENTS', '{events} in an mdl animation sequence: GoH only, as64 parse not tested. Strip it if the unit fails to load (PORT-99)');
      });
    }
    if (e !== 'def' || !defKind(k)) continue;
    // ---- def checks
    const name = baseName(k), kind = defKind(k);
    // PORT-155
    const kinds = entNames.get(name);
    // only an inventory item against a non-item (or the reverse) breaks the stuff extender; fx vs landscape (vanilla shellhole_*) is fine
    const other = kinds ? [...kinds].filter(x => x !== kind && (x === 'inventory') !== (kind === 'inventory')).sort() : [];
    if (other.length) {
      at(k, 1, 'PORT_NAME_CLASH', `entity name "${name}" is also an entity of kind ${other.join(', ')}: the stuff extender takes the wrong one and the game crashes. Rename the GoH one (e.g. ${kind.replace(/^-/, '')}_${name}) (PORT-155)`);
    }
    let mdlKey = null;
    walk(t, n => { if (!mdlKey && lc(n.name) === 'extension') { const v = strv(n)[0]; if (v && /\.mdl$/i.test(v)) mdlKey = lc(v.startsWith('/') ? 'resource' + v : dirOf(k) + v); } });
    const bones = mdlKey ? bonesOf(mdlKey) : null;
    // PORT-157: top-level {bone "x"} blocks of the entity
    if (bones) for (const top of t.kids) for (const n of top.kids) if (lc(n.name) === 'bone') {
      const b = strv(n)[0];
      if (b && !bones.has(lc(b))) at(k, n.line, 'PORT_BONE_MISSING', `{bone "${b}"} has no bone "${b}" in ${mdlKey.slice(mdlKey.lastIndexOf('/') + 1)}: the load aborts. Delete the block or pick another donor (PORT-157)`);
    }
    // PORT-159 never: vanilla defs leave seat bones and crew doors unresolved too (103 rider seats; crusaderaa1/2 door emit0),
    //   so a missing seat bone is not a fault on its own; goh2as2 ERR_DONOR_SEAT is the guard (report CHK-PORTL)
    walk(t, (n, up) => {
      const nm = lc(n.name);
      // PORT-170
      if (nm === 'place' && van) { const s = [n.vals[0], n.vals[1]].every(v => v && v.t === 's') ? [n.vals[0].v, n.vals[1].v] : []; if (s.length === 2 && s[1] && !/%/.test(s[1]) && !entNames.has(baseName(s[1]))) at(k, n.line, 'PORT_PLACE_CHILD_MISSING', `{place "${s[0]}" "${s[1]}"}: no entity "${s[1]}" in the mod or the game: spawn dies with "Cannot link not game_entity object". Port the child def too (goh2as2 --deps) (PORT-170)`); }
      // PORT-187
      if (nm === 'patherid') { const p = strv(n)[0] || (n.vals[0] && n.vals[0].v); if (p && !pathers.has(lc(p))) at(k, n.line, 'PORT_PATHER_UNKNOWN', `{PatherId "${p}"} is not an AS2 pather profile: the whole map load stops ("Wrong pather name"). Use one of ${'tank tank.light armored vehicle.small vehicle.large cannon.small'} (goh2as2 xlate does it) (PORT-187)`); }
    });
    // PORT-124
    //   GoH-origin defs only (GOH-ORIGIN.tsv): vanilla keeps 2 unreferenced smoke grenade defs
    if (origin.has(k) && /^resource\/entity\/inventory\/-weapon\//.test(k) && !stuffNames.has(name))
      at(k, 1, 'WARN_PORT_NO_STUFF', `no set/stuff entry "${name}": no man can carry or fire this weapon. Add set/stuff/<class>/${name} with {from "pattern <class>"} {entity "${name}"} (PORT-124)`);
    // PORT-183
    if (ported.has(k)) L.forEach((l, i) => { const m = /armor_spa_\w*/i.exec(l.split(';')[0]); if (m) at(k, i + 1, 'WARN_PORT_DONOR_ARMOR_SPA', `donor armour call ${m[0]} kept: the translated GoH armour was not written, the unit has donor armour. Replace it with an {armor} block (PORT-183)`); });
  }
  return { rep, files: modKeys.length };
}

if (require.main === module) {
  const args = process.argv.slice(2), o = {}, pos = [];
  let format = 'text';
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--game') o.gameDir = args[++i]; else if (a === '--mods') o.mods = args[++i].split(',').filter(Boolean);
    else if (a === '--base') o.base = args[++i]; else if (a === '--format') format = args[++i];
    else if (a === '--exe') {
      const games = require('../lib/games'), g = games.get(args[++i]);
      if (!g) { console.error('portlint: --exe must be one of as64|mowas_2|mowas2'); process.exit(2); }
      if (g.kind === 'goh') games.refuse('portlint', g, 'the codes are GoH keys left in AS2 data; the vanilla side is an AS2 build (as64 or mowas_2), GoH is the port\'s source', 'plan/reports/game-parity/t-port-b.md: n/a (source game)');
      o.exe = g.exe;
    }
    else if (a === '--vfs') o.vfs = true; else if (a === '-q') o.q = true; else if (a === '--summary') o.summary = true; else pos.push(a);
  }
  o.folder = pos[0];
  if (!o.folder && !o.vfs || o.vfs && !o.gameDir) { console.error('usage: node tools/portlint/portlint.js <mod dir> [--game G] [--exe as64|mowas_2] [--base dir] [--format json] | --vfs --game G [--exe as64|mowas_2]'); process.exit(2); }
  const { rep, files } = check(o);
  rep.print({ format, showInfo: !o.q, byCode: format === 'text', summary: o.summary, meta: { tool: 'portlint' } });
  if (format === 'text') console.log(`${files} files`);
}
module.exports = { check };
