#!/usr/bin/env node
// gen: generate mod content from a spec (YAML subset or JSON) into a mod folder: ops -> text/lng/pot -> build gate -> statsheet diff -> TESTNOTES.
//   node tools/gen/gen.js spec.yaml|spec.json --target as64|mowas2|goh [--plan] [--out dir] [--game AS2dir] [--goh GoHdir]
//        [--force] [--no-gate] [--no-stat] [--pack dir] [-q] [--json] | --sample [name|list] | --help
//   --plan writes nothing (wrapped tools run --dry-run; the vfs is only read). --out default ./gen-out/<name>. reports (TESTNOTES.md STATDIFF.md
//   GATE.txt gen.json) go to --report dir, else <out>.gen/; <out> in a mods/ folder: <tmpdir>/as2-gen/<name>.gen (never a junk mods/ subdir). --pack dir: tools/packer --out dir after a clean gate.
//   gen --describe "fast soviet heavy tank with a big gun, cost 900" [--ai] [--id newid] [--save-spec f] [--plan|--out dir] [--json]
//        plain words -> a spec for a new unit with its own def, model files, gun file, armour, speed and card (lib/describe.js, no model).
//        Alone it prints the spec and what was understood / assumed; with --plan or --out it runs that spec. --ai asks Claude for the spec
//        (lib/ai.js; key from ANTHROPIC_API_KEY), checks it with --check-spec rules, falls back to the built-in reader when that fails.
//   gen --schema                    print the JSON Schema (draft 2020-12) of the spec gen accepts: fields, types, defaults, "x-limits" (limits row IDs)
//   gen --check-spec spec [--target t] [--json]   validate a spec against the schema + gen's own static refusals; writes nothing, needs no game; exit 1 + GEN_SPEC_* findings
// spec: name, title?, deps?, target?, ops: [ {op: mod|clone|gun|weapon|kitbash|set|armor|text|roster|card|squad|breed|map-clone|mission-clone|place, ...} ] (fields: README in tools/INDEX line / TESTNOTES)
//   mod     {title, deps, game_version}                       newmod (implicit first op)
//   clone   {stuff, tags | entity, as, name, set{k:v}, copy_assets, roster}   clone-entity
//   gun     {name, like, recharge?, pen?|pen_scale?, speed?, damage?, range?, accuracy?, caliber?, display?}   new cannon file set/stuff/gun/<name> = {from "<like>"} + own values (AS2)
//   weapon  {entity, weapon, place?}                            mount a gun on the entity's {Weaponry {place "gun"}}; shells follow the new gun's family
//   kitbash {entity, turret_from, part?}                        turret model parts of another vehicle put on the entity's own model (needs clone copy_assets) [T]
//   set     {csv: file | rows: [{entity,path,value,op}|"e,p,v"]}   batched patch-entity.applyEdit, one file edited once. entity = def name | file:<key>
//   armor   {entity, macro?, arg (args|armor|t), value "f s r t" (_ keeps)}    edits the macro arg of ("armor_*" ..), not an overriding key
//   text    {key, text} | {items:[..]}                          AS2 lng-add into #<slug>.lng; GoH .pot under localizations/default/interface/text/
//   roster  {unit, like, army, period?, fields{cost..}, name?, icon_like?}   card block of `like` copied under `unit` in the army list file
//   card    {unit, army, fields, name?, key?, icon_like?}       change price/name/icon of an existing card
//   squad   {name, army, like, members [breed:n ..], fields, display?, info?, bots?, period?}   squads.set line (AS2) | units/<period>/units_<army>.set (GoH)
//           always writes desc/squad/<name>(<army>) + info/squad/<name>(<army>) (display/info, else the like's text); bots: true|<priority>
//           copies the like's bot.data.lua Purchases entries (AS2 bots buy nothing else)
//   breed   {name, army, like, set{path:value}, veterancy, decl{}, display?, period?}   breed file copy + soldiers.set / inf_<army>.set decl
//           + desc/human/mp/<army>/<name> (display, else the like's text)
//   map-clone     {map: map/multi/<m>, name}                      wraps tools/map-clone (--plan passes through)
//   mission-clone {map, from, to, flags?, with_mode?, from_mode?, title?}   wraps tools/mission-clone (--plan -> --dry-run; GoH: its --exe goh branch [I])
//   place         {map: multi/<m>, entity, pos "x,y[,z]" (map units), dir?, scale?, tex?} | {items:[..]}   wraps tools/place-entity (map file override)
//   --json prints one JSON object (ops applied/list, files, skipped, errors, info, counts, gate, stat) instead of text; --sample [list|rename-unit|change-price|clone-unit|armor|squad|all] prints samples/<name>.yaml (list = names + what each does; all = sample.yaml, every op, real vanilla names)
//   in --plan, mission-clone/place on a map created by an earlier map-clone op are skipped (info GEN_PLAN_SKIPPED)
//   lib/ops-unit.js (README.md): iblock {entity, like}  macro {entity, macro, arg, value | rename}  preset {file, name, set}  army {tag, like, id?, title?, icon_like?, alliance?}
//     kit {breed, add, del}; card list: (units/<list>.set, TST-94); breed del:; squad content/order/not_for_sale/remove; bots {priority class min_income min_team}
//     in --plan their changed lines are info GEN_PLAN_WRITE
//   lib/ops-asset.js (README.md): gun class/rof/burst/spread/aim/reload/health/params  shell  item  sound  soundclass  voice  skin  stuffmodel  mapinfo
// codes (counted, --check-spec): GEN_SPEC_PARSE GEN_SPEC_TYPE GEN_SPEC_VALUE GEN_SPEC_FIELD_UNKNOWN GEN_SPEC_FIELD_MISSING GEN_SPEC_OP_UNKNOWN GEN_SPEC_TARGET GEN_SPEC_TARGET_OP GEN_SPEC_CSV_MISSING
// codes (counted): GEN_MAPCLONE_ARGS GEN_MISSION_ARGS GEN_GUN_GOH_ARGS GEN_PLACE_ARGS GEN_BAD_SPEC GEN_OUT_UNSAFE GEN_OUT_EXISTS GEN_CRASH GEN_TOOL_FAILED GEN_SET_* GEN_ARMOR_* GEN_ROSTER_* GEN_SQUAD_* GEN_BREED_* GEN_CARD_*
//   GEN_FIELD_UNKNOWN GEN_ICON_LIKE_MISSING GEN_TEXT_ARGS + the wrapped tools' own codes. WARN_GEN_* unverified. info: GEN_SET_FULL_COPY GEN_ROSTER_CHAIN ..
// Author: Imperator_Aug (ARSENAL, ia-119d239a)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const yaml = require('./lib/yaml'), { Ctx } = require('./lib/ctx'), ops = require('./lib/ops');
const C = require('../modmove/lib/common');
const lngpot = require('../upgrade/lib/lngpot');

const TOOLS = path.resolve(__dirname, '..');
// --sample [name]: literal paths (an exe build embeds these files). default rename-unit; "all" = one example of every op on real vanilla names
const SAMPLES = { 'rename-unit': path.join(__dirname, 'samples', 'rename-unit.yaml'), 'change-price': path.join(__dirname, 'samples', 'change-price.yaml'),
  'clone-unit': path.join(__dirname, 'samples', 'clone-unit.yaml'), armor: path.join(__dirname, 'samples', 'armor.yaml'), squad: path.join(__dirname, 'samples', 'squad.yaml'),
  iblock: path.join(__dirname, 'samples', 'iblock.yaml'), macro: path.join(__dirname, 'samples', 'macro.yaml'), preset: path.join(__dirname, 'samples', 'preset.yaml'), army: path.join(__dirname, 'samples', 'army.yaml'), kit: path.join(__dirname, 'samples', 'kit.yaml'),
  all: path.join(__dirname, 'samples', 'sample.yaml') };
// lib/ops-asset.js samples (one per op)
Object.assign(SAMPLES, { 'gun-class': path.join(__dirname, 'samples', 'gun-class.yaml'), shell: path.join(__dirname, 'samples', 'shell.yaml'), item: path.join(__dirname, 'samples', 'item.yaml'),
  sound: path.join(__dirname, 'samples', 'sound.yaml'), soundclass: path.join(__dirname, 'samples', 'soundclass.yaml'), voice: path.join(__dirname, 'samples', 'voice.yaml'), skin: path.join(__dirname, 'samples', 'skin.yaml'),
  stuffmodel: path.join(__dirname, 'samples', 'stuffmodel.yaml'), mapinfo: path.join(__dirname, 'samples', 'mapinfo.yaml') });
const TARGETS = ['as64', 'mowas2', 'goh'];
const SAMPLE_ALIAS ={ armour: 'armor', rename: 'rename-unit', price: 'change-price', clone: 'clone-unit' };
const OPS = { mod: 'opMod', clone: 'opClone', gun: 'opGun', weapon: 'opWeapon', kitbash: 'opKitbash', set: 'opSet', armor: 'opArmor', text: 'opText', roster: 'opRoster', card: 'opCard', squad: 'opSquad', breed: 'opBreed', 'map-clone': 'opMapClone', 'mission-clone': 'opMissionClone', place: 'opPlace', iblock: 'opIblock', macro: 'opMacro', preset: 'opPreset', army: 'opArmy', kit: 'opKit' };
// lib/ops-asset.js (README.md): gun with class + class fields goes to opGunAny (no class: the cannon op as before)
Object.assign(OPS, { gun: 'opGunAny', shell: 'opShell', item: 'opItem', sound: 'opSound', soundclass: 'opSoundClass', voice: 'opVoice', skin: 'opSkin', stuffmodel: 'opStuffModel', mapinfo: 'opMapInfo' });

function usage(m, rc = 2) {
  (rc ? console.error : console.log)((m ? m + '\n' : '') + 'usage: ARSENAL gen spec.yaml|spec.json | --describe "words" [--ai] [--id newid] [--save-spec file]  --target as64|mowas2|goh [--plan] [--out dir] [--game AS2dir] [--goh GoHdir] [--force] [--no-gate] [--no-stat] [--pack dir] [--report dir] [-q] [--json] | --schema (JSON Schema of the spec) | --check-spec spec [--target t] [--json] (validate a spec, writes nothing) | --sample [list|rename-unit|change-price|clone-unit|armor|squad|all]  (prints a copy-paste spec naming real vanilla units, default rename-unit; "all" = one example of every op; "list" = what each does [--json]: as2 gen --sample > my-spec.yaml)');
  process.exit(rc);
}
function parseArgs(argv) {
  const o = {}, pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], nx = () => { if (i + 1 >= argv.length) usage(a + ' needs a value'); return argv[++i]; };
    if (a === '--target') o.target = nx(); else if (a === '--out') o.out = nx(); else if (a === '--game') o.game = nx(); else if (a === '--goh') o.goh = nx();
    else if (a === '--plan') o.plan = true; else if (a === '--force') o.force = true; else if (a === '--no-gate') o.noGate = true; else if (a === '--no-stat') o.noStat = true;
    else if (a === '--describe') o.describe = nx(); else if (a === '--ai') o.ai = true; else if (a === '--id') o.id = nx(); else if (a === '--save-spec') o.saveSpec = nx();
    else if (a === '--schema') o.schema = true; else if (a === '--check-spec') o.checkSpec = nx();
    else if (a === '--pack') o.pack = nx(); else if (a === '--report') o.report = nx(); else if (a === '--time') o.time = true; else if (a === '-q') o.q = true; else if (a === '--json') o.json = true; else if (a === '--sample') { o.sample = true; if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) o.sampleName = argv[++i]; } else if (a === '--help' || a === '-h') usage('', 0); else if (a.startsWith('-')) usage('unknown option ' + a);
    else pos.push(a);
  }
  o.spec = pos[0];
  // the text, not the path: in as2.exe the file is an embedded asset with no file behind the path
  if (o.sample) {
    let n = String(o.sampleName || 'rename-unit').replace(/\.ya?ml$/i, '').toLowerCase();
    if (n === 'list') {
      // --sample list [--json]: every sample, its first comment line (what it does), and the command to print it
      const rows = Object.keys(SAMPLES).map(k => ({ name: k, what: fs.readFileSync(SAMPLES[k], 'utf8').split(String.fromCharCode(10))[0].replace(/^#s*/, '').trim(), show: 'gen --sample ' + k }));
      if (o.json) console.log(JSON.stringify({ samples: rows }, null, 1));
      else for (const r of rows) console.log(r.name.padEnd(13) + r.what);
      process.exit(0);
    }
    if (SAMPLE_ALIAS[n]) n = SAMPLE_ALIAS[n];
    if (!Object.prototype.hasOwnProperty.call(SAMPLES, n)) usage('unknown sample "' + n + '" (' + Object.keys(SAMPLES).join(' ') + '; gen --sample list shows what each does)');
    process.stdout.write(fs.readFileSync(SAMPLES[n], 'utf8')); process.exit(0);
  }
  return o;
}
// report dir: --report, else <out>.gen unless that lands in a mods/ folder or a game install (the game lists every mods/ subdir as a mod):
// then <os tmpdir>/as2-gen/<slug>.gen (C2c: never ./gen-out under the cwd, which was the repo when run from src)
function reportDir(o, out, slug, games) {
  if (o.report) return path.resolve(o.report);
  const d = out.replace(/[\\\/]+$/, '') + '.gen';
  if (path.basename(path.dirname(d)).toLowerCase() === 'mods' || games.some(g => g && inside(d, g))) return path.join(os.tmpdir(), 'as2-gen', slug + '.gen');
  return d;
}
const inside = (p, root) => { const r = path.relative(path.resolve(root), path.resolve(p)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
const ms = t0 => Date.now() - t0;
// async child with captured output
function spawnAsync(script, args, opt) {
  if (module.exports.spawnHook) return Promise.resolve(module.exports.spawnHook(script, args, opt));   // test seam (test/parity.js): nothing runs
  return new Promise(res => {
    const t0 = Date.now(), c = cp.spawn(process.execPath, [path.join(TOOLS, script), ...args], { windowsHide: true, cwd: opt && opt.cwd });
    let out = '', err = '';
    c.stdout.on('data', d => out += d); c.stderr.on('data', d => err += d);
    c.on('close', code => res({ status: code, out, err, ms: Date.now() - t0 }));
    c.on('error', e => res({ status: -1, out, err: String(e), ms: Date.now() - t0 }));
  });
}

// ---- G1: vanilla .lng that already defines a text key: <title>.lng holds keys <title>/..; returns {name, buf} (effective bytes, vanilla or dep) or null
const lngSdl = require('../lib/sdl'), { readText: lngRead } = require('../lib/enc');
// <title>.lng holds keys relative to its title (desc.lng: human/.. = desc/human/..); a '#<x>.lng' holds full keys (#dlg_mp.lng: mp/army/rus).
// The stock army and side names (mp/army/<army>, mp/team, mp/alliance ..) live in #dlg_mp.lng: a key there is also replaced through a
// mod copy of that file, since a second definition in the mod's own '#<slug>.lng' may lose to it (LOC-19; '#' file order is [T]).
function vanillaLngFor(ctx, key) {
  if (ctx.goh) return null;
  const seg = String(key).split('/'); if (seg.length < 2 || !seg[0]) return null;
  let files;
  try { files = ctx.vfs().files; } catch (e) { return null; }
  const want = String(key).toLowerCase(), title = 'resource/interface/text/' + seg[0].toLowerCase() + '.lng';
  const cands = [[title, seg[0] + '/']];
  for (const k of [...files.keys()].sort()) if (/^resource\/interface\/text\/#[^/]+\.lng$/i.test(k)) cands.push([k, '']);
  for (const [vk, pre] of cands) {
    const rec = files.get(vk); if (!rec) continue;
    const buf = require('../lib/vfs').readRec(rec), r = lngRead(buf, 'utf8');
    if (r.fatal) continue;
    const rt = lngSdl.parseLines(r.lines, () => {}, { resync: 'nextQuote' });
    let hit = false;
    const visit = (n, kp) => { const k = kp + n.name; if (n.kids.length) n.kids.forEach(c => visit(c, k + '/')); else if (k.toLowerCase() === want) hit = true; };
    for (const t of rt.kids) if (t.name && t.name.toLowerCase() === 'tags') t.kids.forEach(c => visit(c, pre));
    if (!hit) continue;
    const name = vk.slice('resource/interface/text/'.length);
    // a dep mod's file: copied the same way; the copy wins only when this mod loads after the dep [I]
    const dep = pre === '' && !isVanillaLng(ctx, vk);
    // an existing mod copy (earlier key / earlier run) is the file to edit; otherwise the vanilla bytes are copied first
    const mine = path.join(ctx.out, 'localization', name);
    return { name, buf: fs.existsSync(mine) ? fs.readFileSync(mine) : buf, hash: pre === '', dep, why: vfWhy(name, dep) };
  }
  return null;
}
const vfWhy = (name, dep) => `a mod copy of ${name} (same path, it replaces the ${dep ? 'dep mod' : 'vanilla'} file whole, LOC-01, so the key is defined once and the mod text shows; a key in the mod's own '#' file would lose, LOC-19)${dep ? ' [I: the mod must load after that dep]' : ''}`;
// a '#' .lng the game itself ships (base paks, base patches, the as64 core layer), not one of a dep mod
function isVanillaLng(ctx, vk) {
  try { const rec = ctx.vfs().files.get(vk); return !!rec && (rec.layer === 'base' || /^patch \d+$/.test(rec.layer) || rec.layer === 'as64/core'); }
  catch (e) { return false; }
}

// ---- text: AS2 lng-add into #<slug>.lng | GoH .pot
function finishText(ctx, slug) {
  ops.autoWrecks(ctx);   // the wreck step, once per run (gen main ran it already; the task path reaches it here)
  ctx.flush();
  const rep = ctx.rep;
  // one key, one write: the engine logs "Localization key redefinition" for a key in two .lng files (chain-n: text op + clone name).
  // Same key twice in ctx.texts: last wins. Key a clone op already wrote (clone-entity --name): same text skipped, other text = warning.
  const byKey = new Map();
  // auto entries (squad/breed name+info made by gen) never replace a key the spec wrote with a text/card/roster op
  for (const t of ctx.texts) { const k = t.key.toLowerCase(), o = byKey.get(k); if (!(t.auto && o && !o.auto)) byKey.set(k, t); }
  const keep = [];
  for (const [k, t] of byKey) {
    const c = ctx.cloneKeys && ctx.cloneKeys.get(k);
    if (c === undefined) { keep.push(t); continue; }
    if (c === t.text) { rep.info('localization/#clone_entity.lng', 0, 'GEN_TEXT_DUP_SKIPPED', `${t.key} already written by the clone op (name:); text op not written again`); continue; }
    rep.add('localization/#clone_entity.lng', 0, 'WARN_GEN_TEXT_DUP', `${t.key}: clone name "${c}" and text "${t.text}" differ; both written, the engine logs a key redefinition and which wins is [T]. Drop one`);
    keep.push(t);
  }
  if (ctx.texts.length !== keep.length) ctx.texts = keep;
  if (!ctx.goh) {
    const file = '#' + slug + '.lng';
    if (ctx.plan) { ctx.texts.forEach(t => { const vf = t.file ? null : vanillaLngFor(ctx, t.key); rep.info('localization/' + (vf ? vf.name : t.file || file), 0, 'GEN_PLAN_TEXT', t.key + ' = ' + t.text + (vf ? ` (key already defined in ${vf.name}: goes into ${vf.why})` : '')); }); return; }
    // lng-add's writer in-process (its run() = the CLI minus argv/print): one read-modify-write per key, findings copied over
    const lngAdd = require('../lng-add/lng-add');
    ctx.flush();
    for (let t of ctx.texts) {
      let r;
      // G1: a key vanilla already defines (desc/entity/<unit>) is read from vanilla desc.lng, which loads after a mod '#' file and wins (LOC-19).
      // So the text goes into a mod copy of that vanilla file (same path = it replaces vanilla whole, LOC-01) with the key changed.
      const vf = t.file ? null : vanillaLngFor(ctx, t.key);
      if (vf) {
        const dst = path.join(ctx.out, 'localization', vf.name);
        if (!fs.existsSync(dst)) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, vf.buf); }
        t = Object.assign({}, t, { file: vf.name });
        rep.info('localization/' + vf.name, 0, 'GEN_TEXT_VANILLA_FILE', `${t.key} is already defined in ${vf.name}: written into ${vf.why}; other mods' edits of ${vf.name} are shadowed`);
      }
      try { r = lngAdd.run({ dir: ctx.out, file: t.file || file, key: t.key, text: t.text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n'), game: ctx.game, force: true }); }
      catch (e) { rep.add('text', 0, 'GEN_TOOL_FAILED', `lng-add ${t.key}: ${e.message}`); continue; }
      const j = r.rep.toJSON({ tool: 'lng-add' });
      for (const f of j.findings) rep.add(f.file, f.line, f.code, f.msg);
      for (const f of j.info) rep.info(f.file, f.line, f.code, f.msg);
      if (r.fail) { if (!j.findings.length) rep.add('text', 0, 'GEN_TOOL_FAILED', `lng-add ${t.key}: refused`); continue; }
      fs.mkdirSync(path.dirname(r.abs), { recursive: true }); fs.writeFileSync(r.abs, r.newBuf);
    }
    ctx.diskKeys = null;
    if (ctx.texts.length) ctx.test.push(`text: ${ctx.texts.length} key(s) in localization/${file}: names show (not raw keys) in the purchase panel and tooltips (LOC-19).`);
    return;
  }
  // GoH: .lng is not read [I goh-data-diff]; gather keys from wrapped tools' .lng files + text ops into one .pot
  const keys = [];
  ctx.flush();
  const ld = path.join(ctx.out, 'localization');
  const removed = [];
  if (!ctx.plan && fs.existsSync(ld)) (function walk(d, rel) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, rel + e.name + '/');
      else if (/\.lng$/i.test(e.name)) { for (const kv of lngpot.lngKeys(fs.readFileSync(p), rel + e.name)) keys.push(kv); fs.unlinkSync(p); removed.push(rel + e.name); }
    }
  })(ld, '');
  for (const t of ctx.texts) keys.push([t.key, t.text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')]);
  if (!keys.length) return;
  const pr = 'localizations/default/interface/text/' + slug + '.pot';
  // the mod's own .pot of that name is merged, not rebuilt (lngpot.potMerge): its header, comments, other keys, msgstr and line endings
  // stay byte for byte; a key written now replaces only its own msgid. Guarded (lib/modwrite) and a restore point first (Files page form)
  const f = path.join(ctx.out, pr);
  let oldBuf = null;
  try { if (fs.existsSync(f)) oldBuf = fs.readFileSync(f); } catch (e) { rep.add(pr, 0, 'GEN_TOOL_FAILED', 'the mod\'s ' + pr + ' could not be read; not written'); return; }
  const mg = lngpot.potMerge(oldBuf, keys, slug), t = { n: new Set(keys.map(k => k[0].toLowerCase())).size };
  // plan: name the .pot it will write (the guided task's restore point reads GEN_PLAN_TEXT notes)
  if (ctx.plan) for (const x of ctx.texts) rep.info(pr, 0, 'GEN_PLAN_TEXT', x.key + ' = ' + x.text);
  if (!ctx.plan && !(oldBuf && mg.buf.equals(oldBuf))) {
    const MW = require('../lib/modwrite'), gopt = ctx.root ? { game: ctx.root } : {};
    try {
      MW.guardFile(ctx.out, f, gopt);
      const ids = MW.restorePoints(ctx.out, [pr], ctx.restoreAction || 'gen-goh-text', gopt);
      if (ctx.restored) ctx.restored.push(...ids);
      rep.info(pr, 0, 'GEN_RESTORE_POINT', 'restore point ' + ids.join(', ') + ' in ' + MW.restoreRoot(ctx.out) + ' (Files page, Restore)');
    } catch (e) { rep.add(pr, 0, 'GEN_WRITE_REFUSED', e.message); return; }
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, mg.buf);
  }
  if (removed.length) rep.info('localization', 0, 'GEN_GOH_LNG_CONVERTED', `${removed.join(', ')} folded into ${pr} (GoH reads .pot, .lng ignored [I])`);
  ctx.facts.push(`text: ${t.n} key(s) -> ${pr}`);
  ctx.test.push(`text (GoH): ${t.n} key(s) in ${pr}: names show in the purchase panel. msgctxt = full key, msgid = text, msgstr empty (copied from upgrade's writer) [I]; if names show raw, try msgstr = text. exe: goh.`);
}

// N12: newmod names its empty text file after the output folder (#<out>.lng); the keys gen writes go to #<mod name>.lng.
// Fold the empty one into the mod-named file (and the readme.txt line that names it) so one file exists, named after the mod.
function renameTextFile(ctx, slug) {
  if (ctx.plan || ctx.goh) return;
  const outSlug = require('../newmod/newmod').slug(path.basename(ctx.out));
  if (outSlug === slug) return;
  const ld = path.join(ctx.out, 'localization'), oldF = path.join(ld, '#' + outSlug + '.lng'), newF = path.join(ld, '#' + slug + '.lng');
  if (!fs.existsSync(oldF)) return;
  const empty = !/\{\s*"/.test(fs.readFileSync(oldF, 'utf8').replace(/^\{tags/, ''));
  if (!empty) return;
  if (fs.existsSync(newF)) fs.rmSync(oldF); else fs.renameSync(oldF, newF);
  const rd = path.join(ctx.out, 'readme.txt');
  if (fs.existsSync(rd)) { const t = fs.readFileSync(rd, 'utf8'); fs.writeFileSync(rd, t.split('#' + outSlug + '.lng').join('#' + slug + '.lng')); }
}

// ---- statsheet: rows only in/different from base
function sheetRows(text) {
  const m = new Map(); let sec = '';
  for (const l of text.split(/\r?\n/)) {
    if (/^# /.test(l)) { sec = l.slice(2).trim(); continue; }
    if (!l.trim() || /^(weapon|ammo|entity|unit|name|vehicle|armor)?,/.test(l) && false) continue;
    const k = sec + '|' + l.split(',')[0];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(l);
  }
  return m;
}
// rows compare without the "source" column (vanilla -> mod flips it on every row of an edited entity), as a multiset per entity key
// (multi-volume entities have several rows under one key; a clone/edit that leaves a volume row untouched is not a diff)
function sheetDiff(base, mod) {
  const B = sheetRows(base), M = sheetRows(mod), out = [];
  const srcSec = new Set();
  for (const [k, rows] of [...B, ...M]) if (rows.some(r => /^[^,]*,source,/.test(r) && /^entity,source,/i.test(r))) srcSec.add(k.slice(0, k.indexOf('|')));
  const norm = (k, r) => { if (!srcSec.has(k.slice(0, k.indexOf('|')))) return r; const c = r.split(','); c.splice(1, 1); return c.join(','); };
  for (const [k, rows] of M) {
    const b = (B.get(k) || []).slice(), bn = b.map(x => norm(k, x)), un = [];
    for (const r of rows) { const i = bn.indexOf(norm(k, r)); if (i >= 0) { b.splice(i, 1); bn.splice(i, 1); } else un.push(r); }
    un.forEach((r, i) => out.push({ k, mod: r, base: b[i] || null }));
  }
  return out;
}
// text files of the mod folder vs the base copy: new file / changed lines
function fileDiffs(ctx) {
  const out = [], patchE = require('../patch-entity/patch-entity');
  const walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name), r = rel + e.name.toLowerCase(); if (e.isDirectory()) walk(p, r + '/'); else one(p, r); } };
  const one = (p, key) => {
    if (!/^(resource|localization|localizations)\//.test(key) || /\.(tga|dds|ply|mdl|anm|vol|ebm|wav)$/.test(key)) { if (/^resource\//.test(key)) out.push('- ' + key + ' (binary, copied)'); return; }
    const nb = fs.readFileSync(p), r = ctx.vf && ctx.vf.files.get(key);
    if (!r) { out.push('- ' + key + ' (new, ' + nb.toString('latin1').split(/\r?\n/).length + ' lines)'); return; }
    const d = patchE.lineDiff(require('../lib/vfs').readRec(r).toString('latin1'), nb.toString('latin1'));
    out.push('- ' + key + (d.length ? ':' : ' (identical copy)'), ...d.slice(0, 14).map(x => '    ' + x), ...(d.length > 14 ? ['    ... ' + (d.length - 14) + ' more'] : []));
  };
  if (fs.existsSync(ctx.out) && fs.statSync(ctx.out).isDirectory()) walk(ctx.out, '');
  return out;
}
async function statJobs(ctx, base) {
  const toolcache = require('../lib/toolcache');   // per-user cache folder (lib/toolcache); an old base sheet in tools/gen/cache is copied over
  const root = ctx.root, cacheDir = toolcache.dir('gen'), res = { diff: [], checks: null, ms: 0, err: null };
  const cacheOk = require('../lib/cachewrite').mkdir(cacheDir);   // read-only install folder: one stderr line, base sheet goes to tmp
  const t0 = Date.now(), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-stat-'));
  const sheet = ['--sheet', 'all', '--fmt', 'csv'];
  // the base sheet cache key names the game when an exe is named (mowas2 on the shared install): AS64 and MoW:AS2 never share a sheet; as64/goh keys as before
  const ex = ctx.exeArgs();
  const baseKey = crypto.createHash('md5').update(root + '|' + fs.statSync(root).mtimeMs + (ex.length ? '|' + ex[1] : '')).digest('hex').slice(0, 10);
  const baseCsv = cacheOk ? toolcache.file('gen', 'base-' + baseKey + '.csv', path.join(__dirname, 'cache')) : path.join(tmp, 'base-' + baseKey + '.csv'), modCsv = path.join(tmp, 'mod.csv');
  const jobs = [];
  if (!fs.existsSync(baseCsv)) jobs.push(spawnAsync('statsheet/statsheet.js', [root, ...ex, ...sheet, '-o', baseCsv]));
  jobs.push(spawnAsync('statsheet/statsheet.js', [root, ...ex, '--folder', ctx.out, '--scope', 'mod', ...sheet, '-o', modCsv, '--cache', path.join(tmp, 'ix.json'), ...(ctx.mods.length ? ['--mods', ctx.mods.join(',')] : [])]));
  const chk = spawnAsync('statsheet/statsheet.js', [root, ...ex, '--folder', ctx.out, '--scope', 'mod', '-q', '--cache', path.join(tmp, 'ix2.json')]);
  const rs = await Promise.all([...jobs, chk]);
  const cr = rs[rs.length - 1];
  res.checks = C.parseFindings(cr.out).filter(f => !f.info);
  try {
    const bt = fs.readFileSync(baseCsv, 'utf8'), mt = fs.readFileSync(modCsv, 'utf8');
    res.diff = sheetDiff(bt, mt);
    // a stuff clone is {from "<stuff>"} with no own stat blocks: statsheet reads only the file's own block, so it lists nothing.
    // Show the source's rows under the clone's name (inherited through {from}) unless statsheet did list the clone itself.
    const B = sheetRows(bt), M = sheetRows(mt);
    for (const c of ctx.stuffClones || []) for (const sec of ['weapons', 'ammo', 'price']) {
      if (M.has(sec + '|' + c.as)) continue;
      for (const r of B.get(sec + '|' + c.from) || []) { const cells = r.split(',').map(x => x === c.from ? c.as : x); cells[0] = c.as; res.diff.push({ k: sec + '|' + c.as, mod: cells.join(',') + '  (inherited from "' + c.from + '" via {from}; statsheet lists no row for the clone itself)', base: null }); }
    }
  } catch (e) { res.err = 'statsheet sheet failed: ' + e.message + ' ' + (rs[0].err || '').slice(0, 120); }
  res.ms = Date.now() - t0;
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  return res;
}
async function gate(ctx) {
  const a = [ctx.out, '--game', ctx.root, ...ctx.exeArgs()];
  if (ctx.mods.length) a.push('--mods', ctx.mods.join(','));
  // build.js hands refcheck "--mods <deps>,<mod folder>"; entityindex refuses a folder that is not a mounted mod (MOD_NOT_MOUNTED) and
  // --out is usually outside <game>/mods. So build runs without its ref stage and refcheck runs here with --folder (deps stay in --mods).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-gate-'));
  const rcArgs = [ctx.root, ...ctx.exeArgs(), '--folder', ctx.out, ...(ctx.mods.length ? ['--mods', ctx.mods.join(',')] : []), '--scope', 'mod', '-q', '--cache', path.join(tmp, 'rc.json')];
  const [r, rc] = await Promise.all([spawnAsync('build/build.js', [...a, '--stages', 'lint,loc,mission']), spawnAsync('refcheck/refcheck.js', rcArgs)]);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  const m = /(\d+) findings \((\d+) errors?, (\d+) warnings?\)/.exec(r.out);
  let errors = m ? +m[2] : (r.status ? 1 : 0), out = r.out + (r.err ? '\n' + r.err : '');
  let rcWarn = 0, rcSeen = false;
  for (const l of (rc.out + '\n' + rc.err).split(/\r?\n/)) {
    if (/^\d+ findings$/.test(l)) { rcSeen = true; continue; }
    const lm = /^(.+?)(?::\d+)?: ([A-Z][A-Z0-9_]*)(?: |$)/.exec(l);
    if (!lm || /^info:/.test(l)) continue;
    // chain-n gen1: an error in a file the mod does not hold (a dep's own entity, e.g. vol2_t pzkpfw38t_hun REF_ANIM_MISSING) that names
    // nothing this spec made is inherited from the donor/dep: a warning here, it was there before the mod (fix it in the dep)
    const inherited = rcInherited(l, lm[1], lm[2], ctx.out, ctx.names);
    if (lm[2].startsWith('WARN_') || inherited) rcWarn++; else errors++;
    out += '\nrefcheck: ' + (inherited ? 'WARN_INHERITED (from a dep, not this mod) ' : '') + l;
  }
  if (!rcSeen) { errors++; out += '\nrefcheck: TOOL_FAILED refcheck gave no result: ' + (rc.err || rc.out).split(/\r?\n/)[0]; }
  if (ctx.goh) {
    // tools/modinfo hard-codes the AS2 data version 3.262: its VER_RANGE on a GoH mod.info (Min=Max=exe version) is a false positive [I]
    const keep = [];
    for (const l of out.split(/\r?\n/)) { if (/mod\.info:\d+: VER_RANGE game 3\.262/.test(l)) { errors = Math.max(0, errors - 1); keep.push('(ignored on GoH, modinfo lint is AS2-only) ' + l); } else keep.push(l); }
    out = keep.join('\n');
  }
  return { status: r.status, out, errors, warnings: (m ? +m[3] : 0) + rcWarn, ms: Math.max(r.ms, rc.ms), parsed: !!m };
}

// --schema: the JSON Schema of the spec (built from this file's OPS/TARGETS and ops.js tables). --check-spec <spec>: validate, write nothing, exit 1 on findings
function schema() { return require('./lib/specschema').build({ OPS, TARGETS, SAMPLES }); }
function checkSpecCmd(o) {
  const SS = require('./lib/specschema'), { createReport } = require('../lib/report'), rep = createReport(), f = o.checkSpec;
  let spec = null, bad = false;
  try { spec = yaml.parse(fs.readFileSync(f, 'utf8')); } catch (e) { rep.add(f, 0, 'GEN_SPEC_PARSE', e.message); bad = true; }
  if (!bad) for (const x of SS.checkSpec(spec, schema(), { target: o.target, dir: path.dirname(path.resolve(f)) })) rep.add(f, 0, x.code, x.msg);
  rep.print(o.json ? { format: 'json', meta: { tool: 'gen' } } : {});
  process.exit(rep.count ? 1 : 0);
}
// the --describe unit list: its cache file and the statsheet --units-json arguments. MoW:AS2 on the shared install adds --exe mowas_2 and
// names the exe in the key; AS64 key and arguments as before
function describeCat(as2, target, dir, sig) {
  const ex = new Ctx({ target, game: as2, out: path.join(dir, 'none'), plan: true }).exeArgs();
  const key = crypto.createHash('md5').update(as2 + '|' + sig + (ex.length ? '|' + ex[1] : '')).digest('hex').slice(0, 10), file = path.join(dir, 'cat-' + key + '.json');
  return { key, file, args: [as2, ...ex, '--units-json', '-o', file, '-q', '--cache', path.join(dir, 'ix-' + key + '.json')] };
}
// --describe: words -> spec. Catalogue = statsheet --units-json (cached in <tmp>/as2-gen). Returns the spec file to run, or exits after printing it
async function describeCmd(o) {
  const target = (o.target || 'as64').toLowerCase();
  // GoH: describe.js has a GoH mode (gohPlan: one card copy, run by the GUI Units page, gohAdd); this CLI reads its unit list with
  // statsheet --units-json (AS2 card files only) and GoH gun/.presets "velocity" "reload time"
  // are not mapped there: one plain line (open item)
  if (target === 'goh') require('../lib/games').refuse('gen --describe', 'goh', 'its unit list here is statsheet --units-json, which reads the AS2 card files only; describe a GoH unit on the GUI Units page (one card copy: id, name, men, own price; gun, armour, speed words refused there), or write the spec by hand with the GoH ops (clone, set, roster, card, squad, breed, gun, shell, item)', 'vanilla GoH resource/set/stuff/gun/.presets and resource/set/multiplayer/units/<period>/units_<army>.set; open item');
  o.target = target;
  const inst = C.installs({ as2: o.game, goh: o.goh });
  if (!inst.as2) require('../lib/gamedir').missing('gen');
  const dir = path.join(os.tmpdir(), 'as2-gen'); fs.mkdirSync(dir, { recursive: true });
  let sig = '0'; try { sig = String(Math.round(fs.statSync(path.join(inst.as2, 'resource')).mtimeMs)); } catch (e) { /* keep */ }
  // MoW:AS2 on the shared install: its own unit list (statsheet --exe mowas_2) under its own cache key; AS64 key and arguments as before
  const { file, args: catArgs } = describeCat(inst.as2, target, dir, sig);
  if (!fs.existsSync(file)) {
    if (!o.q && !o.json) console.error('reading the unit list (first run only) ..');
    const r = await spawnAsync('statsheet/statsheet.js', catArgs);
    if (r.status !== 0 || !fs.existsSync(file)) { console.error('error: gen --describe: could not read the unit list: ' + String(r.err || r.out).trim().split('\n').slice(-2).join(' ')); process.exit(2); }
  }
  const cat = JSON.parse(fs.readFileSync(file, 'utf8'));
  const pctx = new Ctx({ target, game: inst.as2, goh: inst.goh, out: path.join(dir, 'none'), plan: true, deps: [] });
  const opt = { id: o.id, gunFacts: n => ops.gunFacts(pctx, n) };
  let r = null, by = 'built-in reader', aiNote = null;
  if (o.ai) {
    const a = await require('./lib/ai').aiDescribe(o.describe, cat, { schema: schema(), target, gunFacts: opt.gunFacts, id: o.id });
    if (a.ok) { r = a; by = 'AI (' + a.model + ')'; } else aiNote = 'AI mode not used: ' + a.error + ' The built-in reader was used.';
  }
  if (!r) r = require('./lib/describe').describe(o.describe, cat, opt);
  if (!r.ok) { if (o.json) console.log(JSON.stringify({ tool: 'gen', describe: o.describe, ok: false, error: r.error, aiNote }, null, 1)); else console.error('gen --describe: ' + r.error); process.exit(1); }
  const sf = path.resolve(o.saveSpec || path.join(dir, 'describe-' + ops.slug(r.spec.name) + '.json'));
  fs.mkdirSync(path.dirname(sf), { recursive: true }); fs.writeFileSync(sf, JSON.stringify(r.spec, null, 1) + '\n');
  const run = o.plan || o.out;
  if (o.json && !run) { console.log(JSON.stringify({ tool: 'gen', describe: o.describe, ok: true, by, aiNote, understood: r.understood, assumed: r.assumed, plan: r.plan, spec: r.spec, specFile: sf }, null, 1)); process.exit(0); }
  if (!o.json && !o.q) {
    const say = console[run ? 'error' : 'log'];
    say('described by the ' + by + (aiNote ? '\n  ' + aiNote : ''));
    say('understood: ' + (r.understood.join('; ') || '(nothing specific)'));
    for (const a of r.assumed) say('assumed:    ' + a);
    if (r.plan) { say('new unit:   ' + r.plan.id + ' "' + r.plan.name + '" from ' + r.plan.base.id + ', price ' + r.plan.cost); for (const c of r.plan.changes || []) say('  ' + c.what + ': ' + c.old + ' -> ' + c.new); }
    say('spec:       ' + sf);
    if (!run) { console.log(JSON.stringify(r.spec, null, 1)); console.log('run it: gen "' + sf + '" --target ' + target + ' --plan   (or --out <new mod folder>)'); }
  }
  if (!run) process.exit(0);
  return sf;
}
async function main(argv) {
  const o = parseArgs(argv);
  if (o.schema) { console.log(JSON.stringify(schema(), null, 2)); process.exit(0); }
  if (o.checkSpec) checkSpecCmd(o);
  if (o.describe != null) o.spec = await describeCmd(o);
  if (!o.spec) usage('spec file needed');
  let spec;
  try { spec = yaml.parse(fs.readFileSync(o.spec, 'utf8')); } catch (e) { console.error(`${o.spec}: GEN_BAD_SPEC ${e.message}`); console.error('1 findings'); process.exit(1); }
  if (!spec || typeof spec !== 'object' || Array.isArray(spec) || !Array.isArray(spec.ops)) { console.error(`${o.spec}: GEN_BAD_SPEC spec needs a map with name and ops: [..]`); console.error('1 findings'); process.exit(1); }
  const target = (o.target || spec.target || '').toLowerCase();
  if (!TARGETS.includes(target)) usage('--target as64|mowas2|goh required');
  const inst = C.installs({ as2: o.game, goh: o.goh });
  // DOOR-A: every op and the gate read the game; no dir = stop here (was "GAME_NO_MODS no mods/ under null", exit 0)
  if (target === 'goh' ? !inst.goh : !inst.as2) { if (target === 'goh') { console.error('error: gen: no Gates of Hell dir found (--goh H, GOH_GAME, as2.json "goh", Steam)'); process.exit(2); } require('../lib/gamedir').missing('gen'); }
  const name = ops.S(spec.name || path.basename(o.spec).replace(/\.\w+$/, ''));
  const slug = ops.slug(name);
  const out = path.resolve(o.out || path.join('gen-out', slug));
  const ctx = new Ctx({ target, game: inst.as2, goh: inst.goh, out, plan: o.plan, deps: ops.list(spec.deps).map(String) });
  const t0 = Date.now(), tm = {};
  const bad = (code, msg) => { ctx.err(code, msg, 'spec'); };
  // output safety: never vanilla, GoH, Workshop, odd names (lib/writeguard: by content, whatever --game says) (I-1)
  const WG = require('../lib/writeguard');
  { const why = WG.refuseWrite(out, { game: inst.as2, games: [inst.goh], purpose: 'write the generated mod' }); if (why) bad('GEN_OUT_UNSAFE', why); }
  // I-11: out must be a folder, plain line instead of a scandir stack
  if (!ctx.rep.count && fs.existsSync(out) && !fs.statSync(out).isDirectory()) bad('GEN_OUT_UNSAFE', `out ${out} is a file, not a folder. Pick a folder for the new mod.`);
  if (!ctx.rep.count && !o.plan && fs.existsSync(out) && fs.readdirSync(out).length) {
    // I-2: --force only replaces a folder gen made itself (marker file); never the user's own mod
    if (o.force) { const why = WG.safeRemove(out, { purpose: 'replace (--force)' }); if (why) bad('GEN_OUT_EXISTS', why); }
    else bad('GEN_OUT_EXISTS', `out ${out} is not empty. Pick a new folder (--force replaces it only when gen made it earlier)`);
  }
  const base = path.dirname(path.resolve(o.spec));
  ctx.base = base; // ops-asset: staged .wav / .dds files are read from the spec's folder
  let opsRun = 0;
  const opLog = [];
  if (!ctx.rep.count) {
    const first = spec.ops[0] && spec.ops[0].op;
    try {
      if (first !== 'mod') { const t = Date.now(); ops.opMod(ctx, { title: spec.title, deps: spec.deps, game_version: spec.game_version }, { name }); tm.mod = ms(t); }
      spec.ops.forEach((s, i) => {
        const kind = s && s.op, fn = OPS[kind];
        if (!fn) { bad('GEN_BAD_SPEC', `ops[${i}]: unknown op "${kind}" (${Object.keys(OPS).join(' ')})`); opLog.push({ i, op: kind, status: 'unknown', findings: 1, ms: 0 }); return; }
        const t = Date.now(), c0 = ctx.rep.count, k0 = ctx.skipped;
        try { ops[fn](ctx, s, kind === 'set' ? base : { name }); opsRun++; }
        catch (e) { ctx.err('GEN_CRASH', `ops[${i}] ${kind}: ${e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e.message}`, 'op' + i); }
        tm[kind + i] = ms(t);
        opLog.push({ i, op: kind, status: ctx.rep.count > c0 ? 'errors' : ctx.skipped > k0 ? 'skipped' : 'ok', findings: ctx.rep.count - c0, ms: tm[kind + i] });
      });
      // N8 + FIX-PORT wreck step (ops.autoWrecks): every entity clone of the run gets its "_x" / "_xx" wreck stages; also run from
      // finishText, so the task path (compile.js: ops one by one, then finishText) clones them too
      ops.autoWrecks(ctx, e => { e.ms = 0; opLog.push(e); });
      const t = Date.now(); ctx.flush(); finishText(ctx, slug); ctx.flush(); renameTextFile(ctx, slug); tm.write = ms(t);
      if (!o.plan && fs.existsSync(out)) fs.writeFileSync(path.join(out, WG.MARKER), JSON.stringify({ by: 'ARSENAL', what: 'gen ' + slug, ...(o.time ? { time: new Date().toISOString() } : {}) }) + String.fromCharCode(10));   // DET-FIX: WG.mark stamps the clock; only existence of the marker matters to safeRemove
    } catch (e) { ctx.err('GEN_CRASH', e.stack || e.message, 'run'); }
  }
  const opErrors = ctx.rep.count;
  // gate + statsheet in parallel
  let G = null, ST = null;
  if (!o.plan && !ctx.rep.counts.GEN_OUT_UNSAFE && !ctx.rep.counts.GEN_OUT_EXISTS && fs.existsSync(path.join(out, 'mod.info'))) {
    const jobs = [];
    if (!o.noGate) jobs.push(gate(ctx).then(r => G = r));
    if (!o.noStat) jobs.push(statJobs(ctx).then(r => ST = r).catch(e => { ST = { diff: [], checks: [], err: e.message, ms: 0 }; }));
    await Promise.all(jobs);
  }
  // verdict
  // gate findings split: mine = names a generated thing or sits in a file the base lacks; foreign = pre-existing in a copied base file
  let gateMine = [], gateForeign = [];
  if (G) {
    const vfsKeys = ctx.vf ? ctx.vf.files : new Map(), nm = [...ctx.names].filter(Boolean);
    for (const l of G.out.split(/\r?\n/)) {
      const m = /^(\S+?):(\d+): ((?:WARN_)?[A-Z][A-Z0-9_]+) (.*)$/.exec(l);
      if (!m) continue;
      const low = l.toLowerCase(), mine = nm.some(n => low.includes(n)) || !vfsKeys.has(m[1].toLowerCase());
      (mine ? gateMine : gateForeign).push(l);
    }
  }
  const gateBad = G && (G.errors > 0 || !G.parsed), gateWarn = G && gateMine.some(l => / WARN_/.test(l));
  const statBad = ST && (ST.err || (ST.checks || []).some(f => !/^WARN_/.test(f.code)));
  let verdict;
  if (o.plan) verdict = 'plan only, nothing written';
  else if (opErrors || gateBad || statBad || ctx.skipped) verdict = 'partial, untested';
  else if (!G) verdict = 'partial, untested (gate skipped)';
  else verdict = gateWarn || ctx.rep.total > 0 ? 'partial, untested' : 'static clean, untested';
  if (G && gateForeign.length) ctx.facts.push(`gate: ${gateForeign.length} warning(s) already present in copied base files, not caused by this spec (see GATE.txt)`);
  // reports
  const rdir = reportDir(o, out, slug, [inst.as2, inst.goh]);
  const notes = ['# TESTNOTES: ' + name, '', `target ${target}, spec ${path.basename(o.spec)}, verdict: **${verdict}**`, '', '## what was generated', ...ctx.facts.map(f => '- ' + f), '',
    '## test in game (exe: ' + (target === 'goh' ? 'call_to_arms.exe' : target === 'as64' ? 'as64.exe' : 'mowas_2.exe') + ')', 'activate the mod (Options > MODS, or `as2 install`), start LAN/test mode, then:', ...[...new Set(ctx.test)].map(f => '- [ ] ' + f),
    '- [ ] read game.log after the run (logtriage): no ENTITY/preload/key errors for the names above.', '',
    '## format status', ctx.goh ? '- [I] GoH roster/squad/breed lines copied from vanilla units/<period>/ files; .pot layout from upgrade writer; nothing here has been run in game.' : '- [V] card/squad/breed lines copy vanilla lines of the same file; the new combination is untested in game.',
    '- encoding: ' + (ctx.goh ? 'UTF-8 (GoH)' : 'new string values UTF-8 (as64 and mowas_2 read UTF-8), other bytes + CRLF kept from the base file (AS2)') + '.'];
  const sd = ST && ST.diff ? ST.diff : [];
  const sdoc = ['# statsheet diff vs base (' + target + ')', '', ST ? `${sd.length} row(s) differ or are new (${ST.ms} ms)` : 'not run', ...(ST && ST.err ? ['', 'ERROR ' + ST.err] : []), '', ...sd.flatMap(r => [`## ${r.k}`, r.base ? `- base: ${r.base}` : '- base: (none: new row)', `+ mod:  ${r.mod}`]),
    '', '## file changes vs base', ...fileDiffs(ctx),
    '', '## statsheet checks (mod scope)', ...((ST && ST.checks) || []).map(f => `${f.file}:${f.line}: ${f.code} ${f.msg}`)];
  if (!o.plan && fs.existsSync(out) && fs.statSync(out).isDirectory()) {
    fs.mkdirSync(rdir, { recursive: true });
    fs.writeFileSync(path.join(rdir, 'TESTNOTES.md'), notes.join('\n') + '\n');
    fs.writeFileSync(path.join(rdir, 'STATDIFF.md'), sdoc.join('\n') + '\n');
    if (G) fs.writeFileSync(path.join(rdir, 'GATE.txt'), G.out);
    fs.writeFileSync(path.join(rdir, 'gen.json'), JSON.stringify({ name, target, verdict, ops: opsRun, gen: ctx.rep.counts, gate: G && { errors: G.errors, warnings: G.warnings, ...(o.time ? { ms: G.ms } : {}) }, stat: ST && { rows: sd.length, ...(o.time ? { ms: ST.ms } : {}) }, ...(o.time ? { timings: tm, ms: Date.now() - t0 } : {}), spawns: ctx.spawns }, null, 1));   // DET-FIX: clock values only with --time
  }
  // pack
  if (o.pack && !o.plan && verdict === 'static clean, untested') {
    const r = C.runTool('packer', [out, '--out', path.resolve(o.pack)]);
    ctx.facts.push('pack: ' + r.out.trim().split('\n').slice(-1)[0]);
  }
  // output
  const rep = ctx.rep;
  if (o.json) {
    // machine result on stdout (nothing else): ops applied, files, skipped, errors (+ info, gate, stat). exit code as the text mode
    const files = [];
    if (o.plan) ctx.dirty.forEach((b, k) => files.push(k));
    else if (fs.existsSync(out)) (function w(d, rel) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) w(path.join(d, e.name), rel + e.name + '/'); else files.push(rel + e.name); } })(out, '');
    const j = rep.toJSON({ tool: 'gen' });
    const res = { tool: 'gen', name, target, plan: !!o.plan, out, verdict, ops: { total: spec.ops.length, applied: opLog.filter(x => x.status === 'ok').length, list: o.time ? opLog : opLog.map(x => { const c = { ...x }; delete c.ms; return c; }) },
      files: files.sort(), skipped: opLog.filter(x => x.status === 'skipped' || x.status === 'unknown').map(x => ({ i: x.i, op: x.op, why: x.status })),
      errors: j.findings, info: j.info, counts: j.counts, gate: G && { errors: G.errors, warnings: G.warnings, ...(o.time ? { ms: G.ms } : {}) }, stat: ST && { rows: sd.length, ...(o.time ? { ms: ST.ms } : {}) }, ...(o.time ? { ms: Date.now() - t0 } : {}) };
    console.log(JSON.stringify(res, null, 1));
    process.exit(rep.count || (G && G.errors) ? 1 : 0);
  }
  if (!o.q) {
    console.log(`gen ${name} -> ${target}${o.plan ? ' (plan)' : ''}: ${opsRun}/${spec.ops.length} ops, out ${out}`);
    ctx.facts.forEach(f => console.log('  ' + f));
    if (ST && !o.plan) console.log(`  statsheet diff: ${sd.length} row(s)${o.time ? ` (${ST.ms} ms)` : ''}${(ST.checks || []).length ? ', ' + ST.checks.length + ' check finding(s)' : ''}${ST.err ? ' ' + ST.err : ''}`);
    if (G) console.log(`  build gate: ${G.errors} errors, ${G.warnings} warnings${G.parsed ? '' : ' (output not parsed)'}${o.time ? ` (${G.ms} ms)` : ''}`);
    console.log(`  verdict: ${verdict}`);
    if (!o.plan && fs.existsSync(rdir)) console.log(`  notes: ${path.join(rdir, 'TESTNOTES.md')}`);
    if (o.time) console.log(`  time: ${Date.now() - t0} ms (${ctx.spawns} tool spawns)`);
  }
  if (G && G.errors && !o.q) console.log(G.out.split('\n').filter(l => /: (WARN_)?[A-Z][A-Z_0-9]+ /.test(l)).slice(0, 12).map(l => '  gate: ' + l).join('\n'));
  rep.print({ showInfo: !o.q });
  process.exit(rep.count || (G && G.errors) ? 1 : 0);
}
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e.stack || e.message); process.exit(2); });
// refcheck error line inherited from a dep/donor: not a warning code, the file is not in the mod out, names nothing this spec made
function rcInherited(line, file, code, out, names) {
  return !code.startsWith('WARN_') && !fs.existsSync(path.join(out, file)) && ![...names].filter(Boolean).some(n => line.toLowerCase().includes(n));
}
module.exports = { sheetDiff, sheetRows, rcInherited, OPS, TARGETS, SAMPLES, schema, statJobs, gate, describeCat, spawnHook: null };
// the end of a run for in-process callers (gui ext task lib/compile.js): text keys collected by text, card, roster and army ops
module.exports.finishText = finishText; module.exports.renameTextFile = renameTextFile;
