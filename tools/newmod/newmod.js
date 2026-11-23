#!/usr/bin/env node
// newmod: scaffold an empty loose mod folder (MoW:AS2). rows VFS-20,21,32 LOC-01,05,17.
//   node tools/newmod/newmod.js <new mod dir> --name "<title>" [--target as64|mowas2|goh (default as64: Min 3.301, no Max)] [--game-version V] [--game G] [--deps a,b] [--lang english,russian] [--desc "..."] [--dry-run] [-q]
// writes: mod.info (UTF-8 CRLF, keys), resource/{entity,set,interface}, localization/#<slug>.lng (empty, UTF-8)
//   .gitignore (VFS-32: Workshop uploads the whole folder), readme.txt. then runs modinfo + lnglint: must be 0 findings.
// --target goh: text in localizations/default/interface/text/<slug>.pot (gettext header only; GoH never reads a mod's root
//   localization/, GHVFS-04; .pot = GHLOC-01, GHLOC-06), folder name refused when GoH would skip it (GHVFS-27), self-check =
//   modinfo --goh at the written version. --game G with --target goh = the GoH install (exe version read from it).
// localization file is a '#' file (title dropped from key) and NOT desc.lng: a mod desc.lng replaces vanilla's whole (LOC-01).
// --lang: engine has one lng set (LOC-17) -> no per-language files; accepted, info only.
// Author: Imperator_Aug (ARSENAL, ia-5febf87c)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { encodeText } = require('../lib/enc');
const { createReport } = require('../lib/report');

// --target: mowas2 = legacy range, as64 = modern, no max, goh = the exe's own version ( IsGameVersionSupported, PORT-46)
const RANGE = { mowas2: { min: '3.262.0', max: '3.262.1' }, as64: { min: '3.301' }, goh: {} };
const DEFAULT_GOH = require('../lib/gamedir').goh();
function rangeOf(o) {
  // T-SURFACE: default target is as64 (the only target,; --target mowas2 keeps the old 3.262.x range.
  // (a dep on as64+ needs a "modern" mod, Min >= 3.301, /470, which the default already gives)
  const t = o.target || 'as64';
  if (t !== 'goh') return RANGE[t];
  const v = o.gameVersion || require('../modmove/lib/common').dataVersion('goh', path.join(o.game || DEFAULT_GOH, 'binaries/x64/call_to_arms.exe')).ver;
  if (!v) throw new Error('GoH exe version not readable: pass --game-version');
  return { min: v, max: v };
}
const DIRS = ['resource/entity', 'resource/set', 'resource/interface', 'localization'];
// GoH mounts only resource/, N.pat and localizations/ of a mod (GHVFS-04 [V]); text = localizations/<code>/interface/text/,
// default language code 'default' (vanilla localizations/default.pak, the GoH template mod) in .pot (GHLOC-01, GHLOC-06 [V])
const GOH_TEXT = 'localizations/default/interface/text';
const DIRS_GOH = ['resource/entity', 'resource/set', 'resource/interface', GOH_TEXT];
const dirsOf = o => ((o.target || 'as64') === 'goh' ? DIRS_GOH : DIRS);
// an empty .pot: the gettext header only (shape of the GoH template mod's main.pot; header entry = msgid "", never a text)
function potHeader(title) {
  const e = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return ['#, fuzzy', 'msgid ""', 'msgstr ""', `"Project-Id-Version: ${e(title)}\\n"`, '"Language: en\\n"', '"MIME-Version: 1.0\\n"',
    '"Content-Type: text/plain; charset=UTF-8\\n"', '"Content-Transfer-Encoding: 8bit\\n"', '', ''].join('\r\n');
}
// GHVFS-27 (GoH IsValidModName): a mods/ folder whose name has a byte >= 0x80, a space or one of these is skipped
const GOH_BAD = /[^\x21-\x7e]|[<>+()[\]{}!@#$%^&*\-=;:\\|'"]/g;
const IGNORE = ['# VFS-32: Workshop uploads the whole mod folder; keep dev files out of git (and out of the upload)',
  '*.bak', '*.tmp', '*.orig', '*.log', 'Thumbs.db', 'desktop.ini', '.vscode/', '.idea/', 'notes/', 'dev/', ''];

const q = s => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const slug = s => (s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'mod');

// GX share S11 / concepts C10: the folder name must be one the game can list. Spaces become underscores (mod_set cannot list a name with spaces);
// characters Windows or the game cannot take are refused. -> { name, why } or { error }
function cleanFolderName(base, target) {
  if (!base || base === '.' || base === '..') return { error: 'give the new mod folder a name, e.g. mymod' };
  const BAD = /[\\/:*?"<>|\x00-\x1f]/g, bad = base.match(BAD);
  if (bad) return { error: 'the folder name "' + base + '" has characters a folder cannot have (' + [...new Set(bad)].join(' ') + '). Use letters, digits, - and _, e.g. ' + base.replace(BAD, '_').replace(/\s+/g, '_') };
  if (/[. ]$/.test(base)) return { error: 'the folder name "' + base + '" ends in a dot or space, which Windows drops. Remove it.' };
  // I-17: names Windows keeps for devices; I-15: over-long names
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i.test(base)) return { error: 'the folder name "' + base + '" is a name Windows keeps for itself (CON, AUX, NUL, PRN, COM1-9, LPT1-9). Pick another name, e.g. ' + base.replace(/\..*/, '') + '_mod' };
  if (base.length > 100) return { error: 'the folder name is ' + base.length + ' characters long; keep it to 100 or less (a short name like mymod is best)' };
  const name = base.replace(/\s+/g, '_');
  if (target === 'goh') {
    const bad = name.match(GOH_BAD);
    if (bad) return { error: 'the folder name "' + base + '" has characters Gates of Hell does not load in a mod folder name (' + [...new Set(bad)].join(' ') + '; GHVFS-27). Use ASCII letters, digits and _, e.g. ' + (name.replace(GOH_BAD, '_') || 'mymod') };
  }
  return name === base ? { name } : { name, why: 'mod folder name "' + base + '" became "' + name + '": the game cannot list a mod name with spaces, so spaces are replaced by underscores' };
}

function plan(o) {
  const files = [];
  const info = ['{Mod', `\t{Name ${q(o.name)}}`, `\t{Desc ${q(o.desc || o.name)}}`,
    `\t{MinGameVersion ${q(rangeOf(o).min)}}`];
  if (rangeOf(o).max) info.push(`\t{MaxGameVersion ${q(rangeOf(o).max)}}`);
  for (const d of o.deps) info.push(`\t{Require ${q(d)}}`);
  info.push('}', '');
  files.push({ rel: 'mod.info', data: encodeText(info.join('\r\n')) });   // ENCFIX: as64 reads mod.info strings as UTF-8
  const t = o.target || 'as64', sl = slug(path.basename(path.resolve(o.dir)));
  if (t === 'goh') files.push({ rel: `${GOH_TEXT}/${sl}.pot`, data: Buffer.from(potHeader(o.name), 'utf8') });
  else files.push({ rel: `localization/#${sl}.lng`, data: Buffer.from('{tags\r\n}\r\n', 'utf8') });
  files.push({ rel: '.gitignore', data: Buffer.from(IGNORE.join('\r\n'), 'utf8') });
  const rd = [`${o.name}`, '', t === 'goh' ? 'Gates of Hell mod (loose folder).' : t === 'mowas2' ? 'Men of War: Assault Squad 2 mod (loose folder, 3.262).' : 'Men of War: Assault Squad 2 mod for as64 (loose folder, game 3.301 or newer).', '',
    'resource/       entity, set, interface data (CRLF; string values UTF-8, identifiers ASCII)',
    t === 'goh' ? `${GOH_TEXT}/   UTF-8 .pot; one entry per text: msgctxt "<key>" msgid "<text>" msgstr "" (other languages: localizations/<code>/ .po)`
      : `localization/   UTF-8 .lng; new keys go in #${sl}.lng (a mod desc.lng would replace vanilla's whole)`, ''];
  files.push({ rel: 'readme.txt', data: Buffer.from(rd.join('\r\n'), 'utf8') });
  return files;
}

// I-16/I-17: one-line text values for mod.info (a line break or a quote breaks the file the game reads), plain dependency names
const MAX_NAME = 200, MAX_DESC = 2000;
function cleanText(s) { return String(s).replace(/[\r\n\t\x00-\x1f]+/g, ' ').replace(/"/g, "'").trim(); }
function checkInput(o) {   // -> plain reason | null; cleans o.name / o.desc in place
  if (o.name !== undefined) { o.name = cleanText(o.name); if (!o.name) return 'the mod title (--name) is empty'; if (o.name.length > MAX_NAME) return `the mod title is ${o.name.length} characters long; keep it to ${MAX_NAME} or less`; }
  if (o.desc !== undefined) { o.desc = cleanText(o.desc); if (o.desc.length > MAX_DESC) return `the description is ${o.desc.length} characters long; keep it to ${MAX_DESC} or less`; }
  for (const d of o.deps || []) if (!/^[A-Za-z0-9_.+:-]{1,100}$/.test(d)) return `the dependency "${d.slice(0, 60)}" has characters a mod folder name cannot have; give mod folder names separated by commas, e.g. --deps as64+,mymod`;
  if (o.game !== undefined && o.game !== null) {   // I-26
    let st = null; try { st = fs.statSync(o.game); } catch (e) { /* none */ }
    if (!st || !st.isDirectory()) return `the game folder ${o.game} ${st ? 'is a file, not a folder' : 'does not exist'}. Pass the folder that holds as64.exe or mowas_2.exe, or leave --game out`;
  }
  return require('../lib/writeguard').refuseWrite(o.dir, { game: o.game, purpose: 'make the new mod' });   // I-7: never inside a game, GoH, Workshop
}

function run(o) {
  const rep = createReport();
  const dir = o.dir.replace(/\\/g, '/');
  { const why = checkInput(o); if (why) { console.error('error: ' + why); return { refuse: true, rep }; } }
  {   // I-27: say when parent folders get made too
    let p = path.dirname(path.resolve(o.dir)); const made = [];
    while (!fs.existsSync(p)) { made.unshift(path.basename(p)); const up = path.dirname(p); if (up === p) break; p = up; }
    if (made.length) rep.add(dir, 0, 'WARN_PARENT_MADE', `the folder(s) ${made.join('/')} under ${p.replace(/\\/g, '/')} do not exist yet and will be made too; check the path is the one you meant`);
  }
  if (fs.existsSync(o.dir)) {
    if (!fs.statSync(o.dir).isDirectory() || fs.readdirSync(o.dir).length) { console.error(`refusing: ${o.dir} exists and is not an empty directory`); return { refuse: true, rep }; }
  }
  const files = plan(o);
  if (o.lang.length) rep.info(dir, 0, 'LANG_NOOP', `--lang ${o.lang.join(',')}: engine has one lng set (LOC-17); one localization file written`);
  if (o.game) {
    const mods = path.join(o.game, 'mods');
    if (!fs.existsSync(mods)) rep.info(dir, 0, 'GAME_NO_MODS', `no mods/ under ${o.game}`);
    else {
      const have = new Set(fs.readdirSync(mods).map(s => s.toLowerCase()));
      for (const d of o.deps) if (!have.has(d.split(':')[0].toLowerCase())) rep.info(dir, 0, 'DEP_NOT_INSTALLED', `dependency "${d}" not in ${mods}`);
      if (path.resolve(mods).toLowerCase() !== path.dirname(path.resolve(o.dir)).toLowerCase()) rep.info(dir, 0, 'NOT_IN_MODS', `mod dir is not directly under ${mods}; copy/link it there to test`);
    }
  }
  if (o.dry) {
    for (const d of dirsOf(o)) console.log(`dir  ${d}`);
    for (const f of files) console.log(`file ${f.rel} (${f.data.length} bytes)`);
    return { rep, files, dry: true };
  }
  fs.mkdirSync(o.dir, { recursive: true });
  for (const d of dirsOf(o)) fs.mkdirSync(path.join(o.dir, d), { recursive: true });
  for (const f of files) fs.writeFileSync(path.join(o.dir, f.rel), f.data);
  // validate with the sibling tools: must be clean. GoH: modinfo with the GoH rules at the written version; lnglint reads .lng only
  const here = path.join(__dirname, '..'), goh = (o.target || 'as64') === 'goh';
  const checks = goh ? [['modinfo', 'modinfo.js', ['--goh', '--game-version', rangeOf(o).min]]] : [['modinfo', 'modinfo.js', []], ['lnglint', 'lnglint.js', []]];
  for (const [tool, script, extra] of checks) {
    const r = cp.spawnSync(process.execPath, [path.join(here, tool, script), o.dir, ...extra, '-q'], { encoding: 'utf8' });
    const lines = (r.stdout || '').split(/\r?\n/).filter(l => l && !/^\d+ findings$/.test(l) && !/^by code:/.test(l));
    for (const l of lines) rep.add(dir, 0, 'SELFCHECK_' + tool.toUpperCase(), l);
  }
  return { rep, files };
}

function main(argv) {
  const o = { deps: [], lang: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], nx = () => argv[++i];
    if (a === '--name') o.name = nx(); else if (a === '--game') o.game = nx(); else if (a === '--desc') o.desc = nx();
    else if (a === '--deps') o.deps = nx().split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--lang') o.lang = nx().split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--target') { o.target = nx(); if (!RANGE[o.target]) { console.error('--target as64|mowas2|goh'); process.exit(2); } } else if (a === '--game-version') o.gameVersion = nx();
    else if (a === '--dry-run') o.dry = true; else if (a === '-q') o.q = true;
    else if (a.startsWith('-')) { console.error('unknown arg ' + a); process.exit(2); }
    else o.dir = a;
  }
  if (!o.dir || !o.name) { console.error('usage: node tools/newmod/newmod.js <new mod dir> --name "<title>" [--target as64|mowas2|goh] [--game-version V] [--game G] [--deps a,b] [--lang english,russian] [--desc "..."] [--dry-run] [-q]'); process.exit(2); }
  const cn = cleanFolderName(path.basename(path.resolve(o.dir)), o.target);
  if (cn.error) { console.error('error: ' + cn.error); process.exit(2); }
  if (cn.why) { console.log('note: ' + cn.why); o.dir = path.join(path.dirname(o.dir), cn.name); }
  const r = run(o);
  if (r.refuse) process.exit(2);
  r.rep.print({ showInfo: !o.q });
  if (!r.dry) console.log(`created ${o.dir}`);
}
if (require.main === module) main(process.argv.slice(2));
// RANGE: botrecipe mod.info (COV-C13). RANGE.goh = {} (both bounds open: GoH loads it on any version, gohweb vfs/goh-modinfo-version-rule);
// rangeOf({target: 'goh', game, gameVersion}) = Min and Max at the GoH exe's own version (what newmod writes)
module.exports = { run, slug, RANGE, rangeOf, cleanFolderName };
