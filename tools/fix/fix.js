#!/usr/bin/env node
// fix: general mod issues -> a PATCH MOD folder (the source mod is never written; undo = delete the patch folder). rows LOC-01 LOC-05 LOC-18 LOC-23 VFS-01 VFS-41
//   node tools/fix/fix.js <mod> plan|apply --out <patch mod folder> [--game G] [--mods deps] [--only <fixers>] [--set file:path=value]... [--json f] [--cache f] [--target as64|classic|mowas2|goh] [--exe as64|mowas_2|mowas2|goh] [--game-version V]
// game (lib/games): --exe or --target names it; none = as before (as64.exe in the folder -> the as64 view, as64/core and as64+).
//   mowas2 (--target mowas2 or --exe mowas_2): mounted with exe mowas_2 (no as64/core, no as64+: the lib/vfs mowas_2 exe rule); on the shared AS2 folder the game is staged
//     without as64.exe so the tools fix runs see mowas_2 too; mod.info range Classic; enc skipped. classic = an as64 Classic-mode mod (as64.exe view, as before).
//   goh (--target goh or --exe goh, or --game is a GoH folder): --game default = the GoH install (lib/games install). mod.info range = the GoH exe version
//     (PORT-46; --game-version V when the exe has no PE version), tag develop = any version (GHVFS-02); folder names checked (GHVFS-27: FIX_GOH_FOLDER_NAME,
//     and --out refused with such a name); a mod .pot at a vanilla path merged like a .lng (GHLOC-01/06), patch text under localizations/default/;
//     not run on GoH, with their plain reason line: botkeys, stubmtl, quarantine (GOH_SKIP); syntax on GoH = MTL_DIFFUSE_BARE only, asread on GoH: KEY_REPEAT only
//     where both copies are the same (GOH_PART); lngdup on GoH keeps the FIRST copy (GoH keeps the first, GHLOC-08). --out inside the GoH
//     install: lib/writeguard refuses. GoH apply writes through lib/modwrite (gohWrite: guard, marker, restore point per file, then the files; JSON restore{n,root,removed}).
// mod under <game>/mods (or a workshop item) is mounted through lib/vfs, so packed (.pak, N.pat) mods are read, not skipped; a mod folder elsewhere is staged (see below), not refused.
// fixers: modinfo  mod.info Min/MaxGameVersion missing or wrong (--target as64 (default for a broken range) | classic | mowas2 | goh): a corrected copy written as mod.info.fixed in the patch (lib/modinfo.js); a range that already works is left alone
//                  a required mod the path checker says does not load on the game: info FIX_MODINFO_DEP_BLOCKED (the range change alone will not let the mod load)
//         lng      mod .lng at a vanilla path replaces the file whole (LOC-01/18): vanilla keys it lacks are appended to the mod file, mod keys win, UTF-8
//         repoint  refcheck missing-path findings (model/mesh/texture/sound/wrong folder, environment preset VIS-12) with exactly 1 same-name candidate in the vfs: the ref is edited
//         set --set file:path=value: whole winning file copied from its vfs layer, patched byte-exact (lib/sdlwrite via patch-entity): CRLF and other bytes kept, new string values UTF-8
// every changed SDL file passes lib/gate (targets gone, no new sdllint/keylint/milint/refcheck code, sdldiff only target lines) else it is reverted; lng files pass lng.check.
//         include    INCLUDE_MISSING (sdllint) with exactly 1 same-basename file in the vfs: include path rewritten; 0 or many: refused with the list
//         macro      MACRO_UNDEFINED with exactly 1 other .inc/.set/.ext defining that name: (include) line added at the top of the using file; else refused
//         enc        STR_NOT_UTF8: cp1251 string values resaved as UTF-8 (as64 and GoH; skipped for --target classic and mowas2), whole file or nothing; text that does not read as cp1251 is refused
//         spell      MACRO_CASE_MISMATCH, KEY_CASE, MI_KEY_CASE, MIS_TEAMKEY_UNREAD: the name rewritten to the one spelling the finding gives (the game starts to read the line: not pre-ticked in the GUI)
//         syntax     MTL_DIFFUSE_BARE (bare word quoted), TAGS_MULTI_STRING (strings joined)
//         asread     THRESHOLD_LT1 -> 1, odd maxPlayers -> next even: the value the engine already uses (lib/textfix.js for these four)
//                    also: earlier copy of a repeated key, a stray ')', ricochet out > in, {enable} of a thunder with no sound (lines emptied, never deleted)
//         botkeys    BOT_DATA_UNUSED_KEY: period / AttackBaseTime removed from the mod's bot.data.lua (lib/tidy.js); refused when another Lua file names the key
//         lngdup     DUP_KEY in the mod's .lng: the earlier copy of a repeated key removed, the later one is what the game shows (LOC-04); GoH: the later copy removed (first wins)
//                    two fixers on one file are merged line by line; the same line changed two ways stays FIX_EDIT_CONFLICT
//         stubmtl    PLY_MTL_MISSING (binhdr, FMT-03 load-time crash): nearest same-folder .mtl copied to the missing key, flagged as visual risk; no sibling .mtl: refused
//         quarantine only with explicit --only quarantine[,..]: entities still crash-class in the result (wouldload classify) get a mod.info Delete of their .def in the patch.
//                    lib/refscan indexes whole-word references in all text data (paks, N.pat, .mi/.lua too): none -> delete; map referrer (skipped by the engine) -> delete and list;
//                    armor (null deref) or an unproven kind -> QUARANTINE_REFUSED, entity kept. stubmtl only for meshes something references.
// a mod outside <game>/mods is read through a temporary staged game dir of junctions (nothing written there); --game is its base.
// never touched, only reported: tag typos, {##on, zones, full shadows, DLLs, sounds without exactly 1 candidate.
// plan = the same run into a temp folder that is deleted. verdict is never 'pass': 'static clean, untested' | 'partial, untested' | 'nothing done, untested'.
// apply builds the patch in a temp sibling <out>.fixtmp-<pid> and swaps it in at the end; a run that produces nothing keeps the previous patch (says KEPT).
// exit 0 = ran (clean or partial), 1 = FIX_SOURCE_TOUCHED, 2 = usage, --out refused, mod not mounted/base unread, or the tool failed.
// Author: Imperator_Aug (ARSENAL, ia-528492be)
const fs = require('fs'), os = require('os'), path = require('path');
const ctxm = require('./lib/ctx'), lng = require('./lib/lng'), edits = require('./lib/edits'), gate = require('./lib/gate');
const { createReport } = require('../lib/report'), { encodeCp1251 } = require('../lib/enc');
const C = require('../modmove/lib/common'), crashfix = require('./lib/crashfix'), modinfo = require('./lib/modinfo');
const textfix = require('./lib/textfix'), tidy = require('./lib/tidy');
const KINDS = 'modinfo,lng,repoint,set,include,macro,enc,spell,syntax,asread,stubmtl,quarantine,botkeys,lngdup';
// sdllint + keylint + milint on the source as mounted (empty overlay): input of the lint-driven fixers and the gate's baseline
// fxlint's thunder findings (the one fxlint code a text fixer handles): same shape as the lintBase findings
function fxThunder(c) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fixbase-'));
  try { const r = require('../fxlint/fxlint').check(Object.assign({ folder: d, gameDir: c.game, mods: c.list }, c.exe ? { exe: c.exe } : {})); return (r.rep || r).toJSON({ tool: 'fxlint' }).findings.filter(f => /THUNDER_NO_SOUND$/.test(f.code)).map(f => (f.file = String(f.file).replace(/\\/g, '/'), f)); }
  catch (e) { return []; } finally { fs.rmSync(d, { recursive: true, force: true }); }
}
function lintBase(c) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fixbase-')); try { return gate.lintAll(c, d); } finally { fs.rmSync(d, { recursive: true, force: true }); } }
const UNSAFE = new Set(['spell', 'syntax']);
// two edits of one file -> one, line by line (same source bytes, same line count, no line changed two ways); null = cannot
function mergeEdits(a, b) {
  const plain = e => !['lng', 'stubmtl', 'modinfo', 'set', 'botkeys', 'lngdup'].includes(e.kind) && e.before && e.after;
  if (!plain(a) || !plain(b) || Buffer.compare(a.before, b.before)) return null;
  const B = a.before.toString('latin1').split('\n'), x = a.after.toString('latin1').split('\n'), y = b.after.toString('latin1').split('\n'), out = [];
  if (x.length !== B.length || y.length !== B.length) return null;
  for (let i = 0; i < B.length; i++) { if (x[i] === B[i]) out.push(y[i]); else if (y[i] === B[i] || y[i] === x[i]) out.push(x[i]); else return null; }
  const na = (a.targets || []).length, nb = (b.targets || []).length;
  a.why = [...a.why.slice(0, na), ...b.why.slice(0, nb), ...a.why.slice(na), ...b.why.slice(nb)];
  a.targets = [...(a.targets || []), ...(b.targets || [])];
  for (const l of b.lines) a.lines.add(l);
  a.kindList = [...new Set([...(a.kindList || [a.kind]), ...(b.kindList || [b.kind])])];
  if (UNSAFE.has(b.kind) && !UNSAFE.has(a.kind)) a.kind = b.kind;
  a.after = Buffer.from(out.join('\n'), 'latin1');
  return a;
}

// GoH: fixers that are not run, each with its plain reason (the rest run on the GoH form: modinfo, lng (.pot too), repoint, set, include, macro, spell, enc,
// lngdup (first copy kept), syntax and asread in part). enc on GoH: the GoH text reader takes UTF-8 and shows any other byte as a replacement sign
// (GoH ), so a cp1251 string resaved as UTF-8 is what GoH shows right. [T]
const GOH_SKIP = {
  botkeys: 'GoH has no bot.data.lua (GHMIS-66)',
  stubmtl: 'the mesh header check (binhdr) reads the AS2 mesh forms only; the GoH mesh forms are not checked, so a missing .mtl is not proven to crash GoH',
  quarantine: 'the crash classes it removes by are AS2 engine rows; none is proven for GoH',
};
// GoH: fixers that run on GoH with only some of their rules (the rest is not run, with its reason). Each rule kept is the value GoH itself uses on read:
//   PAREN_STRAY: vanilla GoH ships 4 unmatched ')' in a loaded file (set/multiplayer/units/early/units_eng.set) and starts, so GoH drops them (SDL-16) [I]
//   THRESHOLD_LT1: GoH reads projectileDamageThreshold as Max(value, 1) (GoH )
//   RICOCHET_CLAMP: GoH sets out = in when out >, with a warning (GoH )
//   THUNDER_NO_SOUND: GoH returns at once when the sound is empty (GoH )
//   MAP_PLAYERS: GoH rounds the mode .info maxPlayers up to even (GoH)
//   KEY_REPEAT: only where both copies are the same text (removing one changes nothing); with different values the copy GoH keeps is not proven for every reader [I]
//   syntax MTL_DIFFUSE_BARE: GoH reads diffuse with ReadString, a bare word stops the load with "String expected!" (GoH)
//   syntax TAGS_MULTI_STRING not run: GoH reads each quoted string as one whole tag (GoH ), so {tags "a" "b"} already gives a and b there
const GOH_PART = {
  asread: { codes: ['PAREN_STRAY', 'THRESHOLD_LT1', 'RICOCHET_CLAMP', 'THUNDER_NO_SOUND', 'MAP_PLAYERS', 'KEY_REPEAT'], why: 'KEY_REPEAT only where both copies are the same text: with different values, which copy GoH keeps is not proven for every file reader, so both stay' },
  syntax: { codes: ['MTL_DIFFUSE_BARE'], why: 'only MTL_DIFFUSE_BARE; not run: TAGS_MULTI_STRING, GoH reads each quoted string of {tags} as one tag, so the line already works there' },
};
function usage(m, rc = 2) {
  (rc ? console.error : console.log)((m ? m + '\n' : '') + 'PREVIEW: fix is a static preview until a game test proves it (wave 3). plan prints what it would change and writes nothing; apply writes a patch mod to --out.\nusage: ARSENAL fix <mod> plan|apply [--out <patch mod folder, required for apply>] [--game G] [--mods deps] [--target as64|classic|mowas2|goh] [--exe as64|mowas_2|mowas2|goh] [--game-version V] [--only ' + KINDS + '] [--set file:path=value]... [--json f]');
  process.exit(rc);
}
// --exe / --target -> { exe (vfs exe or undefined), target }: --target mowas2 means mowas_2.exe (no as64/core); goh both ways; classic = as64.exe in Classic mode
function gameOf(o) {
  const games = require('../lib/games');
  let exe = o.exe ? games.exeOf(o.exe) : undefined, t = o.target;
  if (o.exe && !exe) usage('--exe: as64, mowas_2 (or mowas2) or goh');
  if (exe === 'goh' && t && t !== 'goh') usage('--exe goh takes --target goh (or none): the as64 and Classic ranges do not load on GoH');
  if (t === 'goh' && exe && exe !== 'goh') usage('--target goh takes --exe goh (or none)');
  if (exe === 'mowas_2' && t === 'as64') usage('--exe mowas_2 takes --target mowas2 or classic (or none): the as64 range (Min 3.301) does not load on mowas_2.exe');
  if (!exe && t === 'goh') exe = 'goh';
  if (!exe && t === 'mowas2') exe = 'mowas_2';
  if (!t && exe === 'goh') t = 'goh';
  if (!t && exe === 'mowas_2') t = 'mowas2';
  return { exe, target: t };
}
function parseArgs(argv) {
  const o = { sets: [], only: null, cache: null }, pos = [];
  if (argv.includes('--help') || argv.includes('-h')) usage('', 0);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], nx = () => { if (i + 1 >= argv.length) usage(a + ' needs a value'); return argv[++i]; };
    if (a === '--out') o.out = nx(); else if (a === '--game') o.game = nx(); else if (a === '--mods') o.deps = nx().split(',').filter(Boolean);
    else if (a === '--only') o.only = new Set(nx().split(',')); else if (a === '--set') o.sets.push(nx()); else if (a === '--json') o.json = nx();
    else if (a === '--target') { o.target = nx(); if (!/^(as64|classic|mowas2|goh)$/.test(o.target)) usage('--target: as64 (default), classic, mowas2 or goh'); }
    else if (a === '--exe') o.exe = nx(); else if (a === '--game-version') o.gameVersion = nx();
    else if (a === '--cache') o.cache = nx(); else if (a[0] === '-') usage('unknown option ' + a); else pos.push(a);
  }
  [o.mod, o.mode] = pos;
  if (!o.mod || !/^(plan|apply)$/.test(o.mode || '') || pos.length > 2) usage();
  if (!o.out && o.mode === 'apply') usage('--out is required for apply: apply writes a patch mod folder and the tool will not pick a place for it (plan needs no --out and writes nothing)');
  Object.assign(o, gameOf(o));
  if (o.exe === 'goh' && !o.game) o.game = require('../lib/games').install('goh').dir;
  if (o.exe === 'goh' && !o.game) usage('no GoH install found: pass the GoH folder with --game');   // never fall back to the AS2 install for GoH
  if (!o.game) o.game = C.installs({}).as2;
  if (!o.game) require('../lib/gamedir').missing('fix');
  if (!fs.existsSync(o.game)) usage('game dir not found: ' + o.game + ', pass --game');
  if (!fs.statSync(o.game).isDirectory()) usage('--game ' + o.game + ' is a file, not a folder: pass the game folder (the one that holds as64.exe or mowas_2.exe, or the GoH folder with binaries/x64/call_to_arms.exe)');   // I-12
  if (o.exe === 'goh' && require('../lib/games').detect(o.game) !== 'goh') usage('--game ' + o.game + ' is not a GoH install (no binaries/x64/call_to_arms.exe): pass the GoH folder with --game, or leave --game out');
  if (o.exe !== 'goh' && require('../lib/games').detect(o.game) === 'goh') {   // a GoH folder given with no game named: a GoH fix (it never mounted as AS2)
    if (o.exe || (o.target && o.target !== 'goh')) usage('--game ' + o.game + ' is a GoH install: pass --target goh (or --exe goh) for a GoH mod');
    o.exe = 'goh'; o.target = 'goh';
  }
  if (o.exe === 'goh' && !o.gameVersion) o.gameVersion = C.dataVersion('goh', path.join(o.game, 'binaries', 'x64', 'call_to_arms.exe')).ver || null;
  if (!fs.existsSync(o.mod) || !fs.statSync(o.mod).isDirectory()) usage('not a folder: ' + o.mod);
  for (const x of o.only || []) if (!KINDS.split(',').includes(x)) usage('--only: ' + KINDS.replace(/,/g, ', '));
  return o;
}

const low = p => path.resolve(p).toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
const inside = (p, d) => p === d || p.startsWith(d + '/');
function outRefusal(out, mod, c, game) {
  const o = low(out), dirs = [mod, c.dir].map(low);
  for (const d of dirs) { if (inside(o, d)) return `--out is inside or equal to the source mod (${d})`; if (inside(d, o)) return `--out contains the source mod (${d})`; }
  const g = low(game), mods = g + '/mods';
  if (game && inside(o, g) && !(inside(o, mods) && o !== mods)) return `--out is inside the game install (${g}) outside mods/<name>: vanilla data is read-only`;
  // I-5: by content too (any AS2 install, GoH, Workshop, odd names), whatever game was given
  const why = require('../lib/writeguard').refuseWrite(out, { game, purpose: 'write the fix patch' });
  if (why) return why;
  if (fs.existsSync(out) && !fs.statSync(out).isDirectory()) return `--out ${C.fwd(path.resolve(out))} is a file, not a folder. Pick a new folder for the fix patch.`;   // I-12
  return null;
}
function sig(dir) {   // cheap tree signature: path + size + mtime
  const h = require('crypto').createHash('sha1');
  (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) { const p = path.join(d, e.name); if (e.isDirectory()) w(p); else { const s = fs.statSync(p); h.update(`${p}|${s.size}|${s.mtimeMs}\n`); } } })(dir);
  return h.digest('hex');
}
function isOurs(dir) {
  const i = ctxm.readInfo(dir);
  return !!i && /^as2 fix patch/.test(i.desc);
}
function modInfoText(c, deletes = [], fixed = null) {
  const i = Object.assign({}, c.info || {}, fixed || {}), q = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  const L = ['{Mod', `\t{Name ${q((i.name || c.id) + ' (as2 fix)')}}`, `\t{Desc ${q('as2 fix patch for ' + (i.name || c.id) + '. Delete this folder to undo.')}}`];
  if (i.min !== null) L.push(`\t{MinGameVersion ${q(i.min)}}`);
  if (i.max !== null) L.push(`\t{MaxGameVersion ${q(i.max)}}`);
  // GoH: a source that loads through the tag develop (any version, GHVFS-02) gives its patch the same tag, else the patch alone would be refused
  if (c.exe === 'goh' && !fixed && /(^|\s)develop(\s|$)/i.test(i.tags || '')) L.push(`\t{Tags "develop"}`);
  L.push(`\t{Require ${q(c.id)}}`);
  for (const d of deletes) L.push(`\t{Delete ${q(d)}}`);   // VFS-21: resource/ prefix; the patch mounts after the source mod, so its files are deletable
  L.push('}');
  return Buffer.from(encodeCp1251(L.join('\r\n') + '\r\n'));
}

function main(o) {
  const t0 = Date.now(), rep = createReport();
  const goh = o.exe === 'goh';
  const want0 = k => o.only ? o.only.has(k) : k !== 'quarantine';   // quarantine removes entities: only on explicit --only quarantine[,..]
  const want = k => want0(k) && !(goh && GOH_SKIP[k]);
  const gameDir = path.resolve(o.game), modDir = path.resolve(o.mod);
  const R = { mod: modDir, mode: o.mode, out: o.out ? path.resolve(o.out) : null, read: {}, changed: [], cant: [], reverted: [], verdict: '' };
  if (o.exe) R.game = require('../lib/games').idOf(o.exe);
  console.log(`fix ${o.mode}: ${C.fwd(modDir)}  (game ${C.fwd(gameDir)}${o.exe ? ', ' + require('../lib/games').get(o.exe).name : ''})`);
  if (goh) for (const k of Object.keys(GOH_SKIP)) if (want0(k) && (k !== 'quarantine' || o.only)) { console.log(`${k}: not run for GoH: ${GOH_SKIP[k]}`); (R.gohSkipped = R.gohSkipped || []).push({ kind: k, why: GOH_SKIP[k] }); }
  if (goh) for (const k of Object.keys(GOH_PART)) if (want0(k)) { console.log(`${k}: on GoH ${GOH_PART[k].why}`); (R.gohPart = R.gohPart || []).push({ kind: k, why: GOH_PART[k].why }); }
  const before = sig(modDir);
  const c = ctxm.open(modDir, gameDir, Object.assign({ deps: o.deps }, o.exe ? { exe: o.exe } : {}));
  if (goh) { const why = modinfo.folderOk(path.basename(modDir)); if (why) c.gohName = why; }
  try { return run(o, c, t0, rep, R, want, gameDir, modDir, before); } finally { c.cleanup(); }
}
function run(o, c, t0, rep, R, want, gameDir, modDir, before) {
  let bad = o.out ? outRefusal(o.out, modDir, c, gameDir) : null;
  if (!bad && o.out && o.exe === 'goh') { const w = modinfo.folderOk(path.basename(path.resolve(o.out))); if (w) bad = '--out ' + w.replace(/^folder name/, 'patch folder name'); }   // GHVFS-27: the patch would never load
  if (bad) { rep.add('-', 0, 'FIX_OUT_REFUSED', bad); return finish(rep, R, o, { refused: true }); }
  if (c.gohName) { const x = { key: '-', code: 'FIX_GOH_FOLDER_NAME', msg: 'not fixed here (the source mod is never changed): ' + c.gohName }; R.cant.push(x); rep.add(x.key, 0, x.code, x.msg); }
  if (o.out && fs.existsSync(o.out) && fs.readdirSync(o.out).length && !isOurs(o.out)) { rep.add('-', 0, 'FIX_OUT_REFUSED', `--out ${C.fwd(o.out)} exists and is not an as2 fix patch folder (mod.info Desc must start "as2 fix patch"); pick an empty or new folder`); return finish(rep, R, o, { refused: true }); }
  if (!c.v) {
    // GX broke B3: a mod that does not mount still gets the mod.info fixer (it reads the file only); the other fixers need the mount, and the line says so
    rep.add('-', 0, 'FIX_NOT_MOUNTED', c.reason);
    R.read = { files: 0, paks: 0 };
    const mp = want('modinfo') && c.info ? modinfo.plan(c.dir, o.target, { version: o.gameVersion }) : null;
    if (mp && mp.edits.length) {
      console.log('NOTE: the game cannot mount this mod yet (' + c.reason + '), so only the mod.info fixer ran. Fix the mod.info, then run fix again to plan the other fixers (lng, paths, includes).');
      return modinfoOnly(o, c, rep, R, mp, t0, before, modDir);
    }
    return finish(rep, R, o, { unread: true });
  }
  if (!c.vb.files.size) { rep.add('-', 0, 'FIX_BASE_UNREAD', 'the base game read 0 files (game dir has no data, or staging failed): nothing to compare against'); R.read = { files: 0, paks: 0, base: 0 }; return finish(rep, R, o, { unread: true }); }
  if (c.note) console.log('NOTE: ' + c.note);
  const st = ctxm.stats(c);
  R.read = { files: st.files, paks: st.paks, base: c.vb.files.size, deps: c.deps };
  console.log(`READ ${st.files} mod files + ${st.paks} paks (mod ${c.id}; base ${c.vb.files.size} files${c.deps.length ? ', deps ' + c.deps.join(',') : ''})`);

  // apply: built in a temp sibling and swapped in at the end (REV-TOOLS 7): a throw leaves the old --out as it was, a no-change rerun keeps it
  const outAbs = o.out ? path.resolve(o.out) : null, all = [], cant = [];
  const work = o.mode === 'plan' ? fs.mkdtempSync(path.join(os.tmpdir(), 'fixplan-')) : outAbs + '.fixtmp-' + process.pid;
  if (o.mode === 'apply') { fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true }); }
  const info = [];
  let swapped = false, fixedInfo = null;
  try {
    // ---- fixers
    let ref = null, miInfo = -1;
    if (want('modinfo')) {
      const p = modinfo.plan(c.dir, o.target, { version: o.gameVersion });
      all.push(...p.edits); cant.push(...p.cant);
      miInfo = info.push('modinfo: ' + (p.edits.length ? p.edits[0].why.join('; ') + ' (written as mod.info.fixed; copy it over the original mod.info)' : p.cant.length ? 'mod.info unreadable' : 'mod.info version range already fits'));
      miInfo--;
      if (p.edits.length) fixedInfo = p.edits[0].info;
    }
    if (want('lng')) {
      const p = lng.plan(c);
      all.push(...p.edits); cant.push(...p.cant);
      info.push(`lng: ${p.seen} mod ${o.exe === "goh" ? "text files (.lng, .pot)" : ".lng"} replace a base file, ${p.edits.length} need a merge`);
    }
    if (tidy.KINDS.some(want)) {   // text the game never uses: unused bot keys, earlier copies of repeated text keys
      const p = tidy.plan(c, new Set(tidy.KINDS.filter(want)), new Map(all.map(e => [e.out, e])));
      all.push(...p.edits); cant.push(...p.cant);
      if (want('botkeys')) info.push('botkeys: ' + p.counts.botkeys + ' unused bot keys removed, ' + p.cant.filter(x => /^FIX_BOTKEYS/.test(x.code)).length + ' refused');
      if (want('lngdup')) info.push('lngdup: ' + p.counts.lngdup + ' earlier copies of repeated text keys removed, ' + p.cant.filter(x => x.code === 'FIX_LNGDUP_SHAPE').length + ' refused');
    }
    let refDone = null, refInfo = -1;
    if (want('repoint') || want('asread')) {
      ref = gate.refcheck(c, null, o);
      if (!ref.ok) {
        const full = ref.errFull || ref.err, dep = gate.versionLines(c, full).dep;
        cant.push({ key: '-', code: 'FIX_REFCHECK_FAILED', msg: gate.refWhy(c, full, fixedInfo) });
        // a required mod that fails its own version gate on this game: the mod.info.fixed range alone will not let the mod load (the dep is not this mod's file)
        if (dep && fixedInfo) {
          const why = `the required mod "${dep.id}" does not load on ${dep.ver} (Min "${dep.min}" Max "${dep.max}"), so the range change alone will not let this mod load`;
          if (miInfo >= 0) info[miInfo] += '; NOTE: ' + why;
          rep.info('mod.info.fixed', 0, 'FIX_MODINFO_DEP_BLOCKED', why);
        }
      }
      else if (want('repoint')) {
        const f = ref.list.filter(x => edits.REPOINT_CODES.includes(x.code));
        const p = edits.repoint(c, f);
        all.push(...p.edits); cant.push(...p.cant);
        refDone = new Set(p.done);
        refInfo = info.push(`repoint: ${f.length} path findings, ${p.edits.length} files edited`) - 1;
      }
    }
    let lintSrc = null;
    const TEXT = textfix.KINDS.filter(want);
    if (want('include') || want('macro') || TEXT.length) {
      lintSrc = lintBase(c);
      if (want('include')) { const p = crashfix.include(c, lintSrc); all.push(...p.edits); cant.push(...p.cant); info.push(`include: ${p.edits.reduce((n, e) => n + e.targets.length, 0)} INCLUDE_MISSING repointed, ${p.cant.length} refused`); }
      if (want('macro')) { const p = crashfix.macro(c, lintSrc); all.push(...p.edits); cant.push(...p.cant); info.push(`macro: ${p.edits.reduce((n, e) => n + e.targets.length, 0)} MACRO_UNDEFINED given an include, ${p.cant.length} refused`); }
    }
    if (TEXT.length) {
      const goh = o.exe === 'goh';   // GoH: asread and syntax with their GoH rules only (GOH_PART)
      const part = goh ? Object.fromEntries(Object.entries(GOH_PART).map(([k, v]) => [k, new Set(v.codes)])) : null;
      const p = textfix.plan(c, want('asread') ? lintSrc.concat(fxThunder(c)) : lintSrc, ref && ref.ok ? ref.list : [], Object.assign({ kinds: new Set(TEXT), target: o.target }, goh ? { partCodes: part, goh: true } : {}));
      all.push(...p.edits); cant.push(...p.cant);
      // a macro call respelled here is no longer "no definition": drop the macro fixer's refusal for that line
      const resp = new Set(); for (const e of p.edits) for (const t of e.targets) if (/MACRO_CASE_MISMATCH$/.test(t.code)) resp.add(String(t.file).toLowerCase() + ':' + t.line);
      for (let i = cant.length; i--;) if (cant[i].code === 'FIX_MACRO_NO_DEFINITION' && resp.has(String(cant[i].key).toLowerCase() + ':' + cant[i].line)) cant.splice(i, 1);
      const nc = k => p.cant.filter(x => x.code.startsWith('FIX_' + k.toUpperCase() + '_')).length;
      const txt = { enc: 'non-UTF-8 string findings resaved as UTF-8', spell: 'names respelled', syntax: 'syntax slips rewritten', asread: 'places written the way the game already reads them' };
      for (const k of TEXT) info.push(`${k}: ${p.counts[k]} ${txt[k]}, ${nc(k)} refused${k === 'asread' && p.notMine ? ', ' + p.notMine + ' in files this mod does not own (left)' : ''}`);
      for (const l of p.skipped) info.push(l);
      if (refDone) for (const f of p.done) refDone.add(f);
    }
    if (refDone) {
      const left = {};
      for (const x of ref.list) if (!refDone.has(x)) left[x.code] = (left[x.code] || 0) + 1;
      R.refLeft = left;
      info[refInfo] += `; refcheck findings not fixable here: ${Object.entries(left).map(([k, n]) => k + '×' + n).join(' ') || 'none'}`;
    }
    // two fixers on one file: merged line by line where they do not touch the same line
    { const seen = new Map(); for (let i = 0; i < all.length; i++) { const e = all[i], a = seen.get(e.out); if (a && mergeEdits(a, e)) all.splice(i--, 1); else if (!a) seen.set(e.out, e); } }
    if (want('stubmtl')) {
      const p = crashfix.stubmtl(c, o); all.push(...p.edits); cant.push(...p.cant);
      for (const s of p.skipped || []) rep.info(s.key, 0, 'FIX_STUBMTL_UNREFERENCED', s.msg);
      info.push(`stubmtl: ${p.edits.length} .mtl stubs, ${p.cant.length} refused, ${(p.skipped || []).length} meshes nothing references (no stub)`);
    }
    if (o.sets.length && want('set')) { const p = edits.setEdits(c, o.sets, new Map(all.map(e => [e.out, e]))); all.push(...p.edits); cant.push(...p.cant); }
    else if (o.sets.length) cant.push({ key: '-', code: 'FIX_SET_SKIPPED', msg: '--set given but --only excludes set' });
    // keep at most one edit per out path (a --set on a repointed file composes on the repointed bytes: not supported, set wins last)
    const byOut = new Map();
    for (const e of all) { if (byOut.has(e.out)) { cant.push({ key: e.key, code: 'FIX_EDIT_CONFLICT', msg: `two fixers edit ${e.out}; kept the first (${byOut.get(e.out).kind}), run again for the rest` }); continue; } byOut.set(e.out, e); }
    let list = [...byOut.values()];
    // ---- write, gate, revert
    for (const e of list) { const f = path.join(work, e.out); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, e.after); }
    const rejected = new Map();
    for (const e of list.filter(e => e.kind === 'lng')) { const r = lng.check(e); if (r) rejected.set(e.out, r); }
    for (const e of list.filter(e => (tidy.KINDS.includes(e.kind) || e.dedup) && !rejected.has(e.out))) { const r = tidy.check(e); if (r) rejected.set(e.out, r); }
    const sdlEdits = list.filter(e => e.kind !== 'lng' && e.kind !== 'stubmtl' && e.kind !== 'modinfo' && !tidy.KINDS.includes(e.kind) && !rejected.has(e.out));
    if (sdlEdits.length) for (const [k, v] of gate.run(c, sdlEdits, work, { cache: o.cache, refBefore: ref && ref.ok ? ref : null, lintBefore: lintSrc })) rejected.set(k, v);
    for (const [k, why] of rejected) {
      const e = list.find(x => x.out === k || x.key === k); if (!e) continue;
      fs.rmSync(path.join(work, e.out), { force: true });
      R.reverted.push({ file: e.out, why }); rep.add(e.out, 0, 'FIX_GATE_REVERTED', why);
    }
    list = list.filter(e => !R.reverted.some(r => r.file === e.out));
    let dels = [];
    if (want('quarantine') && o.only) {
      const q = crashfix.quarantine(c, work, o);
      dels = q.del; cant.push(...q.cant);
      const fmt = rf => rf.slice(0, 6).map(r => `${r.file}:${r.line} (${r.kind})`).join(', ') + (rf.length > 6 ? ` (+${rf.length - 6})` : '');
      for (const d of dels) {
        const rf = q.refs[d.name] || [];
        R.changed.push({ kind: 'quarantine', file: d.key, detail: `removed (${d.why}); referred to by ${rf.length ? fmt(rf) : 'nothing'}` });
        rep.info(d.key, 0, 'FIX_QUARANTINED', `entity ${d.name} removed by mod.info Delete (${d.why}); ${rf.length} reference(s), all of a kind the engine skips: ${fmt(rf)}`);
      }
      const qc = q.counts || { quarantined: 0, referenced: 0, refused: 0 };
      R.quarantine = Object.assign({}, qc);
      info.push(`quarantine: ${qc.quarantined} entities removed, ${qc.referenced} referenced, ${qc.refused} refused (kept)`);
      if (dels.length) {   // refcheck before/after: the patch mod.info is written into the work folder so the overlay can honor the Delete [T: refcheck --folder honoring mod.info Delete is untested in game]
        const before = ref && ref.ok ? ref : gate.refcheck(c, null, o);
        fs.writeFileSync(path.join(work, 'mod.info'), modInfoText(c, dels.map(d => d.key), fixedInfo));
        const after = gate.refcheck(c, work, o);
        if (before.ok && after.ok) {
          const tb = new Map(), ta = new Map();
          for (const f of before.list) tb.set(gate.norm(f), f);
          for (const f of after.list) ta.set(gate.norm(f), f);
          const gone = [...tb.keys()].filter(k => !ta.has(k)).length, added = [...ta.keys()].filter(k => !tb.has(k)).length;
          R.quarantine.refcheck = { before: before.list.length, after: after.list.length, gone, added };
          info.push(`quarantine refcheck: ${before.list.length} findings before, ${after.list.length} after (${gone} gone, ${added} new)`);
          if (added) rep.add('-', 0, 'FIX_QUARANTINE_NEW_REFCHECK', `${added} refcheck finding(s) appear after the removal (dangling references to removed entities?)`);
        } else info.push('quarantine refcheck: before/after not available (' + (before.ok ? after.err : before.err) + ')');
      }
    }
    for (const e of list) {
      const what = e.kind === 'lng' ? `merged ${e.added} vanilla keys the mod file lacked (replaces ${e.over})` + (e.dedup ? '; ' + e.dedupWhy : '') : e.kind === 'modinfo' ? e.why.join('; ') + '. Copy mod.info.fixed over the original mod.info (the mod itself is never changed)' : e.why.join('; ');
      // targets: the findings this edit answers, one planned change each (GUI-LOC: the Check screen joins a hit to its "fix will" text by file+code+line)
      R.changed.push({ kind: e.kind, file: e.out, detail: what, targets: (e.targets || []).map((t, i) => ({ code: t.code, line: t.line || null, why: (e.why && e.why[i]) || what })) });
      rep.info(e.out, 0, { lng: 'FIX_LNG_MERGED', set: 'FIX_SET', include: 'FIX_INCLUDE_REPOINTED', macro: 'FIX_MACRO_INCLUDED', stubmtl: 'FIX_MTL_STUBBED', modinfo: 'FIX_MODINFO', enc: 'FIX_ENC_UTF8', spell: 'FIX_SPELLING', syntax: 'FIX_SYNTAX', asread: 'FIX_ASREAD', botkeys: 'FIX_BOTKEYS', lngdup: 'FIX_LNGDUP' }[e.kind] || 'FIX_REPOINTED', what);
    }
    for (const x of cant) { R.cant.push(x); rep.add(x.key, x.line || 0, x.code, x.msg); }
    // ---- patch mod.info (apply only, only when something survived)
    if (o.mode === 'apply') {
      if (list.length || dels.length) {
        fs.writeFileSync(path.join(work, 'mod.info'), modInfoText(c, dels.map(d => d.key), fixedInfo));
        // B9-fix: the patch copies the source's version range and Requires its id, so it loads in the source's mode only (MOD_MODE);
        // a patch for an upgraded copy (<mod>_as64, Enhanced) comes from running fix on that copy, not on the Classic original
        { const v = C.verParse(c.info && c.info.min), enh = v.length > 0 && C.verCmp(v, C.MODERN_MIN) >= 0;
          const mi = fixedInfo || c.info || {};
          if (o.exe === 'goh' || o.exe === 'mowas_2') info.push(`mod.info: ${o.exe === 'goh' ? 'GoH' : 'MoW:AS2'} range (Min ${mi.min || 'none'}, Max ${mi.max || 'none'}), Require "${c.id}"`);
          else info.push(`mod.info: ${enh ? 'Enhanced (as64+)' : 'Classic'} like the source (Min ${(c.info && c.info.min) || 'none'}), Require "${c.id}"; to patch an upgraded copy, run fix on that copy`); }
        if (o.exe === 'goh') { gohWrite(work, outAbs, gameDir, info); R.restore = info.restore; fs.rmSync(work, { recursive: true, force: true }); swapped = true; }
        else { fs.rmSync(outAbs, { recursive: true, force: true }); fs.renameSync(work, outAbs); swapped = true; }
      } else if (fs.existsSync(outAbs) && fs.readdirSync(outAbs).length) { R.kept = true; info.push(`KEPT: this run changed nothing; the previous patch at ${C.fwd(outAbs)} was left as it was`); }
    }
    for (const l of info) console.log(l);
  } finally { if (!swapped) fs.rmSync(work, { recursive: true, force: true }); vfsClose(); }
  if (sig(modDir) !== before) R.sourceTouched = true, rep.add(C.fwd(modDir), 0, 'FIX_SOURCE_TOUCHED', 'source mod changed during the run (should never happen)');
  else console.log('SOURCE: untouched (path+size+mtime signature equal before and after)');
  return finish(rep, R, o, { t0 });
}
// unmounted mod: only the mod.info fixer; apply writes mod.info.fixed + a patch mod.info
function modinfoOnly(o, c, rep, R, mp, t0, before, modDir) {
  const e = mp.edits[0], outAbs = o.out ? path.resolve(o.out) : null;
  if (o.mode === 'apply') {
    const work = outAbs + '.fixtmp-' + process.pid;
    fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
    fs.writeFileSync(path.join(work, e.out), e.after);
    fs.writeFileSync(path.join(work, 'mod.info'), modInfoText(c, [], e.info));
    if (o.exe === 'goh') { const nf = []; try { gohWrite(work, outAbs, path.resolve(o.game), nf); } finally { fs.rmSync(work, { recursive: true, force: true }); } R.restore = nf.restore; for (const l of nf) console.log(l); }
    else { fs.rmSync(outAbs, { recursive: true, force: true }); fs.renameSync(work, outAbs); }
  }
  R.changed.push({ kind: 'modinfo', file: e.out, detail: e.why.join('; ') + '. Copy it over the original mod.info (the mod itself is never changed).', targets: [] });
  rep.info(e.out, 0, 'FIX_MODINFO', e.why.join('; '));
  for (const l of ['modinfo: ' + e.why.join('; ')]) console.log(l);
  if (sig(modDir) !== before) R.sourceTouched = true, rep.add(C.fwd(modDir), 0, 'FIX_SOURCE_TOUCHED', 'source mod changed during the run (should never happen)');
  else console.log('SOURCE: untouched (path+size+mtime signature equal before and after)');
  R.mountedOnly = 'modinfo';
  return finish(rep, R, o, { t0, modinfoOnly: true });
}
// GoH apply: the patch files go into --out through lib/modwrite (no folder swap): every final path guarded first (inside --out, links
// followed, lib/writeguard with the GoH folder as game), the folder marked as ARSENAL-made (so a rerun into <GoH>/mods/<patch> passes the
// guard), then one restore point per file written or removed (modwrite restoreRoot: <out>/.arsenal/undo in a game folder, else
// <out>.arsenal-undo), then the writes; files of the previous patch this run no longer makes are removed after their restore point.
// AS2 games keep the swap (rm --out, rename the work folder).
function gohWrite(work, outAbs, gameDir, info) {
  const MW = require('../lib/modwrite'), WG = require('../lib/writeguard'), opt = { game: gameDir, purpose: 'write the fix patch' };
  const list = (root, skip) => { const r = []; (function w(d, rel) { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; } for (const x of es) { const q = rel ? rel + '/' + x.name : x.name; if (skip(q)) continue; if (x.isDirectory()) w(path.join(d, x.name), q); else r.push(q); } })(root, ''); return r; };
  const files = list(work, () => false);
  const keep = q => q === WG.MARKER || q === MW.IN_MOD[0] || q.startsWith(MW.IN_MOD[0] + '/');
  const stale = list(outAbs, keep).filter(q => !files.some(f => f.toLowerCase() === q.toLowerCase()));
  for (const q of files.concat(stale)) MW.guardFile(outAbs, path.join(outAbs, ...q.split('/')), opt);
  fs.mkdirSync(outAbs, { recursive: true });
  if (!fs.existsSync(path.join(outAbs, WG.MARKER))) WG.mark(outAbs, 'fix patch');
  const ids = MW.restorePoints(outAbs, files.concat(stale), 'fix', opt);
  MW.writeFiles(outAbs, files.map(q => [q, fs.readFileSync(path.join(work, ...q.split('/')))]), opt);
  for (const q of stale) fs.rmSync(path.join(outAbs, ...q.split('/')), { force: true });
  info.restore = { n: ids.length, root: C.fwd(MW.restoreRoot(outAbs)), removed: stale.length };
  info.push(`restore points: ${ids.length} in ${C.fwd(MW.restoreRoot(outAbs))} (GoH: written through lib/modwrite${stale.length ? ', ' + stale.length + ' file(s) of the previous patch removed' : ''})`);
}
function vfsClose() { try { require('../lib/vfs').closeRecs(); } catch { /* ignore */ } }

function finish(rep, R, o, x) {
  const nCant = R.cant.length + R.reverted.length;
  // OBS-I2b: never "static clean" while crash-class findings stay (refcheck findings fix can't repoint, refused crash fixes)
  const sev = require('../lib/registry').severity, refLeft = R.refLeft || {};
  R.refLeftN = Object.values(refLeft).reduce((a, b) => a + b, 0);
  R.crashLeft = Object.entries(refLeft).filter(([k]) => sev(k) === 'crash').reduce((a, [, n]) => a + n, 0) + R.cant.filter(c => sev(c.code) === 'crash').length;
  R.verdict = x.refused || x.unread ? 'nothing done, untested' : R.crashLeft ? `${R.crashLeft} crash findings left, not fixable here, untested` : nCant ? 'partial, untested' : 'static clean, untested';
  console.log(`CHANGED: ${R.changed.length} file(s)${o.mode === 'plan' ? ' (plan: nothing written)' : o.mode === 'apply' && R.changed.length ? ' -> ' + C.fwd(path.resolve(o.out)) : ''}`);
  console.log('PREVIEW: static only. Nothing here has been proven in game yet; treat the result as a preview, not a fix, until a game test says so.');
  for (const ch of R.changed) console.log(`  ${ch.kind} ${ch.file}: ${ch.detail}`);
  console.log(`CAN'T: ${nCant} (${R.cant.length} refused, ${R.reverted.length} reverted by the gate)${R.refLeft && Object.keys(R.refLeft).length ? '; other refcheck findings left alone: ' + Object.entries(R.refLeft).map(([k, n]) => k + '×' + n).join(' ') : ''}`);
  console.log('NEVER FIXED: tag typos, {##on, zones, full shadows, DLLs, sounds/includes/macros/environment presets without exactly 1 candidate, text that does not read as cp1251, a name with more than one known spelling, lines the base game has too, meshes without any same-folder .mtl, entities unless --only quarantine (never default)');
  console.log('TEST: nothing was run. in game: enable the source mod, then ' + (o.out ? C.fwd(path.basename(path.resolve(o.out))) : 'the patch from apply') + ' after it; check merged texts show in menus/briefings, repointed models/textures/sounds load, resaved texts read right, respelled keys do what they should, game.log has no new errors');
  if (R.quarantine) {
    const q = R.quarantine;
    console.log(`QUARANTINE: ${q.quarantined} removed, ${q.referenced} referenced, ${q.refused} refused`);
    if (q.quarantined) R.verdictNote = `verdict after removing ${q.quarantined} entities; this does not show the mod's own content loads`;
  }
  console.log('VERDICT: ' + R.verdict);
  if (R.verdictNote) console.log(R.verdictNote);
  R.exit = x.refused || x.unread ? 2 : R.sourceTouched ? 1 : 0;
  if (o.json) fs.writeFileSync(o.json, JSON.stringify(R, null, 1));
  rep.print({ showInfo: true });
  // the line above counts fix's own findings only; refcheck findings fix leaves alone are counted here (OBS-I2b: "0 findings" beside refLeft 46)
  if (R.refLeftN) console.log(`${R.refLeftN} refcheck findings left unfixed (${R.crashLeft} crash-class), not in the count above`);
  return R;
}

if (require.main === module) { try { const R = main(parseArgs(process.argv.slice(2))); process.exitCode = R && R.exit || 0; } catch (e) { console.error('fix failed: ' + e.stack); process.exitCode = 2; } }
module.exports = { main, outRefusal, finish };
