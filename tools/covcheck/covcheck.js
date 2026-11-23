#!/usr/bin/env node
// covcheck: live census of vanilla / AS2 Valour / jaben through tools/lib/pakset.js against the matrix rows C01..C43
// of Every file must land on a row; anything else is listed as unmapped and the exit code is 1.
// Rules live here (not parsed from coverage.md) so a matrix edit and a rule edit are one reviewed change.
// usage: node tools/covcheck/covcheck.js [--out tools/covcheck/rows.json] [--vanilla DIR] [--valour DIR] [--jaben DIR] [--no-write]
//        [--exe as64|mowas_2|mowas2|goh] [--game DIR]
//   no --exe: the AS2 install (vanilla resource + localization.pak), AS2 Valour, jaben; rows.json (as before: AS2 base, no as64/core layer; the AS64 view is --exe as64)
//   --exe as64: the same plus the as64/core layer (source as64core); --exe mowas_2: the plain AS2 census (no as64/core); out rows-<id>.json
//   --exe goh: the GoH install (resource/ + localizations/, GHLOC-01), GoH Valour (--valour DIR) and MACE (--mace DIR) from workshop
//     app 400750, more GoH mods with --mod DIR (repeatable, resource/ + localizations/ of the folder); GoH rules (GOH_RULES) checked first;
//     --game DIR = the GoH install (default games.install('goh')); out rows-goh.json
// "now" letters: G tool output worked in game, F first look, S static only, R real mods only, N nothing, L limit result.
// Author: Imperator_Aug (ARSENAL, ia-b9489e50)
'use strict';
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');

// ---- the 43 rows. now = letter as rechecked by COV-0 (2026-11-06); was = letter when different
const ROWS = [
  ['C01', 'Vehicles', 'G'], ['C02', 'Guns and mortars', 'F'], ['C03', 'Infantry', 'F'], ['C04', 'Weapons, ammo, grenades, mines', 'F'],
  ['C05', 'Squads, prices, buy cards', 'F'], ['C06', 'Crew, repair, tow, AI use of a unit', 'N'], ['C07', 'Fauna, service, jump entities', 'R'],
  ['C08', 'Buildings, bridges, fences', 'S'], ['C09', 'Landscape objects, flora', 'R'], ['C10', 'Maps', 'F'], ['C11', 'Terrain edits', 'N'],
  ['C12', 'Missions, triggers', 'F'], ['C13', 'Bots', 'F'], ['C14', 'Interaction scripts', 'S'], ['C15', 'Abilities', 'R'],
  ['C16', 'Damage rules, targets', 'S'], ['C17', 'Unit keys, stat edits, movement', 'S'], ['C18', 'Class templates', 'S'], ['C19', 'Vision', 'R'],
  ['C20', 'Difficulty', 'R'], ['C21', 'Environment, weather', 'R'], ['C22', 'Engine registry', 'R'], ['C23', 'Models and skins', 'F'],
  ['C24', 'Animation', 'S'], ['C25', 'FX, particles', 'S'], ['C26', 'Shaders', 'N'], ['C27', 'Video', 'N'], ['C28', 'Sound effects', 'S'],
  ['C29', 'Voices', 'N'], ['C30', 'Music', 'N'], ['C31', 'Icons, unit art, armour schemes', 'S'], ['C32', 'Menus, skin, fonts, cursors', 'S'],
  ['C33', 'Action buttons, panels', 'S'], ['C34', 'Key bindings', 'N'], ['C35', 'Text, names, tips', 'S'], ['C36', 'Editor pages', 'N'],
  ['C37', 'Mount, override, load order, N.pat, own includes', 'G'], ['C38', 'Upgrade an old mod', 'G'], ['C39', 'Port from GoH: units', 'G'],
  ['C40', 'Port from GoH: everything else', 'N'], ['C41', 'Check a mod before running', 'S'], ['C42', 'Multiplayer', 'N'],
  // C43: coverage.md says S. sdk-status layer "Release: dist release-check, unused; publishing unapproved"; reassess-8 freezes release-check [I]
  ['C43', 'Hand a mod on, guide per ability', 'N', 'S'],
].map(([id, name, now, was]) => ({ id, name, now, was: was || now, derived: /^C(06|17|38|39|40|41|42|43)$/.test(id) }));

const MODELS = '(ply|mdl|mtl|dds|tga|tex|vol)';
const ART_SRC = '(psd|pdn|ms3d|obv|bak|old|db|png|jpg|jpeg|bmp)';
// ---- rules: first match wins. [regex on key (lowercase, '/', no leading resource/), [primary row, ...rows that share the files]]
const RULES = [
  // mod root / outside resource
  [/^[^/]+\.pat$/, ['C37']], [/^mod\.info$/, ['C37']], [/^mod_update\.vbs$/, ['C43']], [/^(readme|changelog)\.txt$/, ['C43']],
  // text: any .lng / .lng2 is C35 (UTF-8); inc/ in localization.pak holds desc_/info_ includes [I]; mission/ in it is mission text
  [/\.lng2?$/, ['C35']], [/^inc\//, ['C35']], [/^mission\//, ['C12']],
  // types that go to one row wherever they sit (who reads them: game/ source, see report)
  [/\.anm$/, ['C24']], [/\.net$/, ['C42']], [/\.mi$/, ['C12']],
  [/^interface\/scene\/.*\.ebm$/, ['C31']],     //  vehicle_view sprites; other interface/ .ebm follow their folder (cursor, pages, skin → C32)
  [/^(?!interface\/).*\.ebm$/, ['C23']],                         //  lists .ebm with texture types
  [/\.grs$/, ['C10', 'C09']],                   //  map + ".grs" grass cache
  [/\.dl$/, ['C20']],                           //  iterates ".dl" in the difficulty dir
  // single-purpose folders: extension-gated so a new type shows up as unmapped
  [/^shader\/.*\.(vso|pso|inc|hlsl|h)$/, ['C26']],
  [/^video\/.*\.avi$/, ['C27']],
  [/^music\/.*\.mp3$/, ['C30']],
  [/^sound\/(human|mission)\/.*\.(wav|mp3|sfk)$/, ['C29', 'C28']],
  [/^sound\/(gui|world|weapon|vehicle|hit|fire|crush|detonation|cannon|animal|push)\/.*\.(wav|mp3|sfk|set|txt)$/, ['C28']],
  [/^sound\/[^/]+\.(set|txt|presets|ammo|cmd|wav)$/, ['C28']],
  [/^sound\/(human|mission|[^/]+)\/.*\.(set|ammo|presets|cmd|txt)$/, ['C28']],
  // map: .mi/.net taken above; the rest is the map's terrain, models, materials, previews
  [/^map\//, ['C10', 'C11']],
  [/^texture\//, ['C23']],
  // interface
  [/^interface\/action\//, ['C33']], [/^interface\/profiles\//, ['C34']], [/^interface\/editor\//, ['C36']],
  [/^interface\/scene\//, ['C31']],
  [/^interface\/(pages|skin|font|cursor|html|text)\//, ['C32']], [/^interface\/splash(_editor)?\.bmp$/, ['C32']],
  // entity/properties: model and art types first (C23), then by folder
  [new RegExp('^(entity|properties)/.*\\.' + MODELS + '$'), ['C23']],
  [new RegExp('^(entity|properties)/.*\\.' + ART_SRC + '$'), ['C23']],   // art sources / editor leftovers in mods; engine does not read [I]
  [/^entity\/.*\.lub$/, ['C13']],
  [/^entity\/-vehicle\//, ['C01', 'C02', 'C06', 'C17']],
  [/^entity\/(-fauna|service|jump)\//, ['C07']], [/^entity\/construction\//, ['C08']],
  [/^entity\/(landscape|flora)\//, ['C09']], [/^entity\/inventory\//, ['C04', 'C17']], [/^entity\/humanskin\//, ['C03', 'C17']],
  [/^entity\/(fx|particle)\//, ['C25']],
  [/^properties\/animation\//, ['C24']], [/^properties\//, ['C18', 'C17']],
  [/^script\//, ['C13']],
  // set/ folders
  [/^set\/breed\//, ['C03', 'C17']], [/^set\/stuff\//, ['C04']], [/^set\/multiplayer\//, ['C05']],
  [/^set\/interaction_(entity|terrain)\//, ['C14']], [/^set\/ability\//, ['C15']], [/^set\/(blow|target)\//, ['C16']],
  [/^set\/vision\//, ['C19']], [/^set\/difficulty\//, ['C20']], [/^set\/environment\//, ['C21']], [/^set\/registry\//, ['C22']],
  [/^set\/panel_control\//, ['C33']], [/^set\/talk\//, ['C29']], [/^set\/tip\//, ['C35']],
  // set/ top-level files, one by one (no folder tells their role)
  [/^set\/(ballistics\.set|damage_report\.set|unmasking\.set|small\.firearms\.accuracy)$/, ['C16']],
  [/^set\/(colliders|detect|entitymanager|enumerator|formation|pather|material)\.set$/, ['C22']],
  [/^set\/(level_of_detail(_manual|_zoom)?\.(set|inc)|registry\.reg)$/, ['C22']],
  [/^set\/fxmanager\.set$/, ['C25']], [/^set\/grass\.set$/, ['C09']], [/^set\/(emoticons|interface)\.set$/, ['C32']],
  [/^set\/textures\.set$/, ['C23']], [/^set\/talk\.set$/, ['C29']], [/^set\/(tips|tutorials)\.set$/, ['C35']],
];

// ---- GoH (--exe goh): checked before RULES. GoH folders and types the AS2 tree does not have; row cited where a note gives the reader,
// else the folder's role as read from the vanilla GoH files [I]. Census of the GoH install + GoH Valour + MACE: every file lands (2026-11-14).
const GOH_RULES = [
  [/^[^/]+\/interface\/text\/.*\.(pot|po|mo|lng)$/, ['C35']],               // localizations/<lang>/interface/text, .pot text (GHLOC-01, GHLOC-06)
  [/^[^/]+\/[^/]+\.info$/, ['C35']],                                         // localizations/default.pak default/localization.info [I]
  [/^difficulties\//, ['C20']],                                              // resource/difficulties/*.dl + difficulty_generic.inc
  [/^sound\/talk\/.*\.(wav|mp3|ogg|sfk)$/, ['C29', 'C28']],                // GoH talk table after texts (GHLOC-01) [I]
  [/^sound\/(projectile|interface|utility)\/.*\.(wav|mp3|ogg|sfk)$/, ['C28']], [/^sound\/[^/]+\.inc$/, ['C28']],
  [/^sound\/.*\/license$/, ['C43']],                                    // licence text beside bought sounds [I]
  [/^music\/.*\.(wav|ogg)$/, ['C30']],
  [/^interface\/layout\//, ['C32']],                                         // GoH xml layouts (GHUI-04..07)
  [/^interface\/[^/]+\.bmp$/, ['C32']],
  [/^set\/dynamic_campaign(\/|\.set$)/, ['C12']],                            // conquest data (GHCQ-03) [I: no AS2 row of its own]
  [/^set\/curves\//, ['C21']],                                               // tone curves picked by the light block (GHVIS-55)
  [/^set\/(third_person\/|tp_control)/, ['C17']],                            // direct control params (GHDC-35, GHKEY-12) [I]
  [/^shader\/.*\.(dso|hso|cso|fxh)$/, ['C26']],
  [/^entity\/(mapping_assets|recovery_volume)\//, ['C10', 'C09']],          // map editor blockout/landscape assets, map volumes [I]
  [/^entity\/misc\//, ['C36']],                                              // editor helpers: ruler, test_box, colorbox [I]
  [/^entity\/sfx\//, ['C28']],                                               // sound entities [I]
  [/^set\/grass\/.*\.inc$/, ['C09']],
  [/^set\/(benchmark|level_of_detail_scenario)\.set$/, ['C22']],            // GHLOG-26, GHVIS-115
  [/^set\/(component\.set|damage\.set|blast\.inc|small_firearms_accuracy\.inc)$/, ['C16']],
  [/^set\/(library|market|squads)\.set$/, ['C05']],                          // squads.set GHKEY-02; library/market [I]
  [/^video\/.*\.txt$/, ['C27']],
];

const norm = k => k.toLowerCase().replace(/\\/g, '/').replace(/^resource\//, '');
const extOf = n => { const i = n.lastIndexOf('.'); return i > n.lastIndexOf('/') ? n.slice(i) : '(none)'; };

// key → [primary, ...shared] or null.  rules: RULES (AS2, default) or GOH_RULES.concat(RULES)
function classifyRows(key, rules = RULES) {
  const k = norm(key);
  for (const [re, rows] of rules) if (re.test(k)) return rows;
  return null;
}
function classify(key, rules) { const r = classifyRows(key, rules); return r ? r[0] : null; }

// folders any rule knows: an unmapped file in one of these is reported as top/sub, otherwise as top
const KNOWN_TOPS = new Set(['entity', 'properties', 'script', 'set', 'shader', 'interface', 'sound', 'map', 'music', 'texture', 'video', 'inc', 'mission']);
function groupOf(key) {
  const s = norm(key).split('/');
  if (s.length === 1) return '(root)/' + extOf(s[0]);
  if (!KNOWN_TOPS.has(s[0])) return s[0];
  return s.length === 2 ? s[0] + '/*' + extOf(s[1]) : s[0] + '/' + s[1] + (/\./.test(s[1]) ? '' : '/*' + extOf(s[s.length - 1]));
}

// sources: { name: [entry{key}] } → { byRow, shared, unmapped, total, ok }
function tally(sources, rules) {
  const byRow = {}, shared = {}, total = {}, um = new Map();
  for (const r of ROWS) { byRow[r.id] = {}; shared[r.id] = {}; }
  for (const [src, list] of Object.entries(sources)) {
    total[src] = list.length;
    for (const e of list) {
      const rows = classifyRows(e.key, rules);
      if (!rows) {
        const g = groupOf(e.key);
        let u = um.get(g);
        if (!u) um.set(g, u = { group: g, files: 0, sources: {}, ext: {}, examples: [] });
        u.files++; u.sources[src] = (u.sources[src] || 0) + 1;
        const x = extOf(norm(e.key)); u.ext[x] = (u.ext[x] || 0) + 1;
        if (u.examples.length < 3) u.examples.push(norm(e.key));
        continue;
      }
      byRow[rows[0]][src] = (byRow[rows[0]][src] || 0) + 1;
      for (let i = 1; i < rows.length; i++) shared[rows[i]][src] = (shared[rows[i]][src] || 0) + 1;
    }
  }
  const unmapped = [...um.values()].sort((a, b) => b.files - a.files);
  return { byRow, shared, unmapped, total, ok: unmapped.length === 0 };
}

// ---- live census
function looseFiles(dir, rel, out) {
  let ds; try { ds = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const d of ds) {
    if (d.isDirectory()) looseFiles(dir + '/' + d.name, rel + d.name.toLowerCase() + '/', out);
    else if (!/\.pak$/i.test(d.name)) out.push({ key: rel + d.name.toLowerCase(), loose: true });
  }
  return out;
}

function census(roots) {
  const pakset = require('../lib/pakset.js'), pak = require('../lib/pak.js');
  const sources = {}, errors = {};
  for (const [name, r] of Object.entries(roots)) {
    const s = pakset.open(r.dir);
    sources[name] = s.entries.map(e => ({ key: e.key }));
    errors[name] = s.errors.length;
    s.close();
    sources[name].push(...looseFiles(r.dir, '', []));
    for (const extra of r.rootPaks || []) {   // install-root paks that pakset's recursive walk of resource/ does not reach
      try {
        const L = pak.list(extra);
        for (const ent of L) if (!ent.name.endsWith('/')) sources[name + '+rootpak'] = (sources[name + '+rootpak'] || []).concat({ key: ent.name.toLowerCase() });
      } catch (e) { errors[name + '+rootpak'] = e.message; }
    }
  }
  return { sources, errors };
}

function arg(a, k, d) { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; }
function args(a, k) { const out = []; for (let i = 0; i < a.length; i++) if (a[i] === k) out.push(a[i + 1]); return out; }
// GoH real mods (workshop app 400750): GoH Valour and MACE, the two largest on the census machine; --valour / --mace / --mod override or add
const GOH_APP = 400750, GOH_VALOUR = 2537987794, GOH_MACE = 2905667604;
// --exe goh roots: the GoH install's resource/ + localizations/ (GHLOC-01: text sits below a language folder, no localization.pak),
// each mod's resource/ + localizations/. A mod that is not found is left out with a note line.
function gohRoots(argv, o = {}) {
  const gd = o.gamedir || require('../lib/gamedir'), games = o.games || require('../lib/games');
  const G = arg(argv, '--game', null) || games.install('goh').dir;
  if (!G && !argv.includes('--vanilla')) return { error: games.notFor('covcheck', 'goh', 'no GoH install found (set GOH_GAME or as2.json "goh", or give --game)') };
  const roots = {}, notes = [];
  const add = (name, dir, loc) => { if (!dir) { notes.push(name + ': not found, left out'); return; } roots[name] = { dir }; if (loc) roots[name + '+loc'] = { dir: loc }; };
  add('vanilla', arg(argv, '--vanilla', G && G + '/resource'), G && G + '/localizations');
  const modRoot = d => d && { res: d + '/resource', loc: d + '/localizations' };
  const v = arg(argv, '--valour', null) ? { res: arg(argv, '--valour') } : modRoot(gd.workshop(GOH_APP, GOH_VALOUR));
  add('valour', v && v.res, v && v.loc);
  const m = arg(argv, '--mace', null) ? { res: arg(argv, '--mace') } : modRoot(gd.workshop(GOH_APP, GOH_MACE));
  add('mace', m && m.res, m && m.loc);
  for (const d of args(argv, '--mod')) { const r = modRoot(d.replace(/[\\/]+$/, '')); add(path.basename(d.replace(/[\\/]+$/, '')), r.res, r.loc); }
  return { roots, notes };
}
function main(argv) {
  const games = require('../lib/games');
  const exe = arg(argv, '--exe', null);
  if (exe != null && !games.get(exe)) { console.error('covcheck: unknown --exe ' + exe + ' (as64, mowas_2, mowas2, goh)'); return 2; }
  const id = exe ? games.idOf(exe) : null;
  const gd = require('../lib/gamedir');
  let roots, rules, notes = [];
  if (id === 'goh') {
    const r = gohRoots(argv);
    if (r.error) { console.error(r.error); return 2; }
    roots = r.roots; notes = r.notes; rules = GOH_RULES.concat(RULES);
  } else {
    const G = arg(argv, '--game', null) || gd.resolve().dir;
    if (!G && !(argv.includes('--vanilla') && argv.includes('--jaben'))) gd.missing('covcheck');   // DOOR-A: no null/resource paths
    roots = {
      vanilla: { dir: arg(argv, '--vanilla', G + '/resource'), rootPaks: [G + '/localization.pak'] },
      valour: { dir: arg(argv, '--valour', gd.workshop(244450, 455424236)) },
      jaben: { dir: arg(argv, '--jaben', G + '/mods/jaben mod v6.25') },
    };
    // as64: the as64/core layer the engine mounts after base (lib/vfs 3c); mowas_2 has none, so its census is the plain AS2 one
    if (id === 'as64') roots.as64core = { dir: G + '/as64/core/resource', rootPaks: [G + '/as64/core/localization.pak'].filter(p => fs.existsSync(p)) };
    if (id === 'as64' && fs.existsSync(G + '/as64/core/localization')) roots['as64core+loc'] = { dir: G + '/as64/core/localization', prefix: 'resource/interface/text/' };
  }
  const { sources, errors } = census(roots);
  for (const [name, r] of Object.entries(roots)) if (r.prefix && sources[name]) sources[name] = sources[name].map(e => ({ key: r.prefix + e.key }));
  const t = tally(sources, rules);
  const rows = ROWS.map(r => {
    const files = t.byRow[r.id], sh = t.shared[r.id];
    const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
    return { id: r.id, ability: r.name, now: r.now, was: r.was, nowChanged: r.now !== r.was, derived: r.derived,
      files, sharedFiles: sh, hasData: sum(files) + sum(sh) > 0 || r.derived };
  });
  const out = { generated: new Date().toISOString().slice(0, 10), sources: Object.fromEntries(Object.entries(t.total).map(([k, v]) => [k, { files: v, pakErrors: errors[k] || 0 }])),
    ok: t.ok, unmapped: t.unmapped, rows };
  if (id) out.game = id;
  // no --exe: rows.json as before; a named game: rows-<id>.json, so the games never share an answer
  if (!argv.includes('--no-write')) fs.writeFileSync(arg(argv, '--out', path.join(__dirname, id ? 'rows-' + id + '.json' : 'rows.json')), JSON.stringify(out, null, 1) + '\n');
  for (const n of notes) console.log('note: ' + n);
  console.log('covcheck: ' + Object.entries(t.total).map(([k, v]) => k + ' ' + v).join(', ') + '; pak errors ' + JSON.stringify(errors));
  const noData = rows.filter(r => !r.hasData);
  console.log('rows with no files: ' + (noData.map(r => r.id).join(' ') || 'none') + '; now letters: ' +
    JSON.stringify(rows.reduce((a, r) => (a[r.now] = (a[r.now] || 0) + 1, a), {})));
  if (!t.ok) { console.log('UNMAPPED ' + t.unmapped.length + ' groups:'); for (const u of t.unmapped) console.log('  ' + u.group + ' ' + u.files + ' ' + JSON.stringify(u.sources) + ' ' + u.examples[0]); }
  else console.log('every file lands on a row');
  return t.ok ? 0 : 1;
}

module.exports = { ROWS, RULES, GOH_RULES, gohRoots, classify, classifyRows, groupOf, tally, census, main };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
