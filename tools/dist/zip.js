#!/usr/bin/env node
// L7ZIP: build the A.R.S.E.N.A.L release zip locally (never uploads). ARSENAL.exe (tools/dist/sea.js; ONE exe: no arguments = the window)
// + ARSENAL-gui.cmd (starts ARSENAL.exe gui) + Install-ARSENAL.cmd (W6 U1: the installer, tools/dist/launch/) + QUICKSTART.md
// + LICENSE/README if present -> <out-dir>/ARSENAL-<ver>.zip; prints size + sha256 (+ writes <zip>.sha256).
// Deterministic: sorted entries under one top folder, fixed DOS time (--date), deflate level 9, no extra fields.
// Release gate (refuses, writes no zip, exit 1): zip entry names and the exe's embedded files list (manifest.json)
//   - no GoH / Valour assets: game asset extensions or goh/gates of hell/valour in a name
//   - no absolute user paths (X:\Users\<name>, /home/<name>, /Users/<name>), no local user / git user name, no emails
//   scanned in: text entries (QUICKSTART, LICENSE, README, --add), every embedded asset's text, and the exe bytes (user paths/names only:
//   the node runtime itself carries library emails, so emails are checked in text, not in the binary).
// usage: node tools/dist/zip.js [--ver V] [--out-dir D] [--exes dir] [--assets-root dir] [--add file]... [--date YYYY-MM-DD] [--check]
//        [--workshop_gui dir | --no-workshop_gui] [--gemindex dir | --no-gemindex] [--ww2sources dir | --no-ww2sources] [--with-ww2db] [--small [--pin node-pin.json]]
//        [--pdf file | --no-pdf] [--no-whole | --whole-root dir] [--books-root dir] [--guide-dir dir]
//   --exes dir: reuse ARSENAL.exe + manifest.json from dir (else build it with sea.js into <out-dir>/build)
//   --assets-root: where manifest keys resolve (default tools/; tests use fixtures)   --check: gate only, write no zip
// exit 0 written (or --check clean), 1 refused, 2 bad call / build failed
// T-ZIP: the zip holds what a user needs and nothing else: the exe, ARSENAL-gui.cmd, Install-ARSENAL.cmd, START-HERE.md (tools/START-HERE.md, else tools/QUICKSTART.md under
//   that name), LICENSE, NOTICE, CREDITS.md (the credit gate demands it), the guide book (guide/README.md, p01.., 01..22, r01.. as public text, and the newest public guide PDF when one is built: PUBLIC EDITION below), samples/ (tools/gen/samples/*).
// SIDECARS: folders shipped beside ARSENAL.exe as <top>/<name>/..., from --<name> dir (default tools/dist/out/<name>, git-ignored build
//   output); --no-<name> leaves one out; folder absent = zip built without it (one line says so), except a `required` sidecar (gemindex):
//   absent or empty = exit 2 naming the folder, the build command and --no-<name> (exe zip, --small and --check alike). Sorted, fixed time, gate over every file
//   (.exe/.dll = the exe bytes scan, text = full text scan, anything else refused). A refusal inside a sidecar adds one summary line per
//   folder: files hit and count by kind. No bypass; the only exceptions are the owner's decisions named where they are (COLLECTED,
//   GUIDE_PDF, LAUNCHER, WW2_DATA, WW2_DB), each by exact name.
//   No soedit folder (owner 2026-11-15, "The copy should not be shipped"): SOEdit is not part of ARSENAL; `ARSENAL soedit install`
//            or the Models page downloads it from its GitHub releases. Gate NO_SOEDIT: any entry under <top>/soedit/ is refused.
//   workshop_gui (third_party/workshop_gui, the default dir; tools/workshop/workshop.js reads <exe dir>/workshop_gui): exactly workshop_gui.exe,
//            steam_api64.dll, steam_appid.txt, README.md. Required (--no-workshop_gui leaves it out on purpose).
//   gemindex (node tools/gemindex/gemindex.js bundle; tools/gemindex/lib/load.js reads <exe dir>/gemindex): every file in the folder. Required.
//   ww2sources (node tools/gemindex/gemindex.js ww2bundle; tools/gemindex/lib/ww2.js reads <exe dir>/ww2sources): required (--no-ww2sources
//            leaves it out on purpose). Two builds (owner 2026-11-10, "ship one with and one without the database actually"):
//            default = ARSENAL-<ver>.zip / -small.zip: the source list, the word lists and ww2sources.json, not index.sqlite (one line says
//            it was left out); --with-ww2db = ARSENAL-<ver>-ww2.zip / -small-ww2.zip: the same plus index.sqlite (absent = exit 2).
//            Gate: WW2_DATA and WW2_DB below. --check says which build it checked.
// TECHDOC: no engine document and no in this zip. and the engine whole HTML/PDF have their own
//   download, ARSENAL-engine-docs-public-<ver>.zip (tools/dist/enginezip.js --public), published beside this zip; its techdoc folder
//   merges into this one. is not public (owner 2026-11-13, "No tech doc history";: the folder stays
//   in the source tree, nothing under it ships. The Docs page's Historical sources category stays (guide index + ww2sources).
//   Gate TECHDOC_HISTORY: any entry under <top>/ is refused. The doctrine atlas: WHOLE below.
// WHOLE documents (tools/docgen/whole.js holds the contract): the newest guide whole HTML at <top>/guide/dist/AS2-Modding-Guide-v<ver>.html
//   (beside the PDF; HTML and PDF picked each on its own) and the doctrine atlas at <top>/ + README.md, where the
//   Docs page reads them. Gate: GUIDE_WHOLE and ATLAS_WHOLE, by exact name and place (an HTML anywhere else is refused); each at most
//   WHOLE.MAX bytes, starting with the contract prefix, with its arsenal-whole meta, loading nothing from the network; then the full text
//   scan. --no-whole leaves both out (--no-pdf still means only the PDF); --whole-root dir reads them from dir instead of the source tree
//   (tests). Absent = the zip is built without it, one line each, like the PDF.
// PUBLIC EDITION (the zip is public; guide pages and books are the public edition, tools/docgen/pub.js):
//   - every guide page ships as pub.strip(source).text: no `<!-- internal -->` ... `<!-- /internal -->` block, no whole-line HTML comment
//     (maintainer trace lines), line endings as strip returns them; the stripped copies are written to <out-dir>/public-guide/. A strip
//     error (bad marker) stops the build (exit 1, file:line). --guide-dir dir reads the pages from dir instead of guide/ (tests).
//   - gate GUIDE_PUBLIC: a guide page entry that still holds an internal marker line or a whole-line HTML comment (outside code fences)
//     is refused. Gate GUIDE_STRICT: every line of a guide page entry goes through pub.scanStrict(line, {scope: 'book', allow:
//     pub.loadAllow}); a hit is refused as `<source file>:<line> <kind> "<match>"`. (docgen's the game denylist is not loaded here.)
//   - the guide book (whole HTML + PDF) must be a public build: gate GUIDE_EDITION refuses a guide whole HTML without
//     <meta name="arsenal-edition" content="public"> in its head, and a guide PDF unless the HTML of the same version beside it in the
//     same folder carries that meta (a PDF has no meta of its own: the beside rule is how a public PDF is known).
//   - where the guide book comes from: --books-root dir = the folder that holds guide/dist/ of a public build, i.e. <docgen out>/public
//     after `node tools/docgen/docgen.js --out <dir> --books`; the newest guide HTML and PDF come from <books-root>/guide/dist, and a
//     non-public HTML there is put in and refused by the gate (exit 1). Without --books-root they come from <whole-root or the source
//     tree>/guide/dist and are taken only when public: a non-public HTML leaves the HTML and its PDF out with one line naming the build
//     command; a PDF without a public HTML of its version beside it is left out with one line. --pdf file still names the PDF; the
//     beside rule holds for it too (refused by GUIDE_EDITION otherwise).
//   - --whole-root and --books-root: --whole-root is the root for the atlas (and, when --books-root is not given, for the guide book);
//     --books-root is the root for the guide book only. Both may be given (tests use either). --no-whole drops the guide HTML and the
//     atlas whatever the roots; --no-pdf drops the PDF.
// LARGE ENTRIES: writeZip streams any entry over STREAM_OVER (see there); the zip stays under 4 GB or no zip is written.
// BAK: a .bak folder or *.bak file is never shipped (sidecar walk, samples; sea.js manifestKeys for the tools files).
// SMALL (--small; owner's decision 2026-11-10,: ARSENAL-<ver>-small.zip = the same zip without the exe and its ARSENAL-gui.cmd, plus
//   tools/<key> for exactly the files the exe embeds (sea.js manifestKeys with RELEASE_DROP; MODULE_ONLY tools stay, as in the exe) and the
//   four launchers at the top level (tools/dist/launch.js renders them from tools/dist/launch/*.tpl and --pin, default
//   tools/dist/launch/node-pin.json; the pin base must be https://nodejs.org/dist/.../ or nothing is built). Same gate: the tools files are
//   scanned as the exe's embedded files; a launcher passes only at the top level, under its own name, with the builder's bytes.
//   sh launchers get unix mode 0755 in the central directory. No exes needed, no sea build.
// Author: Imperator_Aug (ARSENAL, ia-613781d7)
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto'), os = require('os'), { spawnSync } = require('child_process');
const TOOLS = path.join(__dirname, '..'), SRC = path.join(TOOLS, '..');
const USAGE = 'usage: node tools/dist/zip.js [--small [--pin file]] [--ver V] [--out-dir D] [--exes dir] [--assets-root dir] [--add file]... [--date YYYY-MM-DD] [--check] [--workshop_gui dir | --no-workshop_gui] [--gemindex dir | --no-gemindex] [--ww2sources dir | --no-ww2sources] [--with-ww2db] [--pdf file | --no-pdf] [--no-whole | --whole-root dir] [--books-root dir] [--guide-dir dir] [--claude-root dir | --no-claude] [--private-add name=path]...';

function args(a) {
  const o = { ver: require('./sea.js').buildVersion(), outDir: path.resolve(SRC, '..', 'run', 'l7zip'), exes: null, assetsRoot: TOOLS, add: [], date: '2026-01-01', check: false, side: {}, noSide: new Set(), pdf: null, noPdf: false, noWhole: false, wholeRoot: null, booksRoot: null, guideDir: null, small: false, pin: null, withDb: false, privateAdd: [] };
  const val = { '--ver': 'ver', '--out-dir': 'outDir', '--exes': 'exes', '--assets-root': 'assetsRoot', '--date': 'date', '--pin': 'pin', '--whole-root': 'wholeRoot', '--books-root': 'booksRoot', '--guide-dir': 'guideDir', '--claude-root': 'claudeRoot' };
  for (let i = 0; i < a.length; i++) {
    const sc = /^--(no-)?([a-z][a-z0-9_]*)$/.exec(a[i] || ''), sn = sc && SIDECARS.find(s => s.name === sc[2]);
    if (a[i] === '--with-ww2db') o.withDb = true;
    else if (sn && sc[1]) o.noSide.add(sn.name);
    else if (sn && a[i + 1] !== undefined) o.side[sn.name] = a[++i];
    else if (val[a[i]] && a[i + 1] !== undefined) o[val[a[i]]] = a[++i];
    else if (a[i] === '--add' && a[i + 1] !== undefined) o.add.push(a[++i]);
    else if (a[i] === '--private-add' && /^[^=]+=.+$/.test(a[i + 1] || '')) o.privateAdd.push(a[++i]);
    else if (a[i] === '--check') o.check = true;
    else if (a[i] === '--small') o.small = true;
    else if (a[i] === '--no-pdf') o.noPdf = true;
    else if (a[i] === '--no-claude') o.noClaude = true;
    else if (a[i] === '--no-whole') o.noWhole = true;
    else if (a[i] === '--pdf' && a[i + 1] !== undefined) o.pdf = a[++i];
    else { console.error(USAGE); process.exit(2); }
  }
  if (!/^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(o.ver)) { console.error('error: --ver: letters, digits . + -'); process.exit(2); }
  if (!/^\d{4}-\d\d-\d\d$/.test(o.date)) { console.error('error: --date YYYY-MM-DD'); process.exit(2); }
  if (o.small && o.exes) { console.error('error: --small takes no --exes (the small package carries no exe)'); process.exit(2); }
  if (!o.small && o.pin) { console.error('error: --pin goes with --small'); process.exit(2); }
  if (o.noWhole && o.wholeRoot) { console.error('error: --whole-root goes without --no-whole'); process.exit(2); }
  if (o.booksRoot && o.noWhole && o.noPdf) { console.error('error: --books-root with --no-whole and --no-pdf: nothing to read from it'); process.exit(2); }
  if (o.booksRoot && !fs.existsSync(path.join(o.booksRoot, 'guide', 'dist'))) { console.error(`error: --books-root ${o.booksRoot}: no guide/dist in it (want <docgen out>/public after node tools/docgen/docgen.js --out <dir> --books)`); process.exit(2); }
  if (o.withDb && o.noSide.has('ww2sources')) { console.error('error: --with-ww2db ships ww2sources/index.sqlite, so it cannot go with --no-ww2sources'); process.exit(2); }
  return o;
}

// ---- release gate
const ASSET_EXT = /\.(pak|ply|mdl|dds|tga|png|jpg|anm|mtl|sdl|vol|ogg|wav|bnk|fsb|mask|mi|mesh|ext|ins|def|scn|bin|dat|rar|7z|zip)$/i;
const GAME_NAME = /(^|[^a-z])(goh|gates[ _.-]?of[ _.-]?hell|valour)([^a-z]|$)/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
// /home/ and /Users/ right after a host or path word (https://site.example/home/Page in a collected address) are a web address, not a
// home folder: a home path starts the path (start, quote, space, =, file:///home/...), so the character before it is never [A-Za-z0-9._-].
const USERPATH = /([A-Za-z]:[\\/]{1,2}Users[\\/]{1,2}|(?<![A-Za-z0-9._-])\/home\/|(?<![A-Za-z0-9._-])\/Users\/)([^\\/\s"'`<>*?|:)\]}]+)/gi;
const NOT_A_USER = /^(public|default|all users|<[^>]*|\$\{?\w+\}?|%\w+%|you|your|me|name|user|username|\.\.\.?|x|someone|runner)$/i;
function identities() {
  const ids = new Set();
  // the GitHub-hosted runner account is "runner" (not a person; NOT_A_USER already passes it in paths): left out only there, so
  // tools/dist/ci/test.yml can build on a runner. Everywhere else the account name is scanned as before.
  try { const u = os.userInfo().username; if (u && u.length >= 3 && !(u === 'runner' && process.env.GITHUB_ACTIONS === 'true')) ids.add(u); } catch {}
  const g = spawnSync('git', ['config', 'user.name'], { cwd: SRC, encoding: 'utf8', windowsHide: true });
  if (g.status === 0 && g.stdout.trim().length >= 3) ids.add(g.stdout.trim());
  if (process.env.ZIP_EXTRA_ID) ids.add(process.env.ZIP_EXTRA_ID); // tests: a name that must never ship
  return [...ids];
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// "<embedded file> <email>": an upstream copyright line that its licence says must ship unchanged. One file, one address, nothing wider.
const LICENCE_EMAIL = new Set(['gui/vendor/cm5/cm5.bundle.json marijn@haverbeke.berlin']);   // CodeMirror 5, MIT notice
// text: returns finding strings for one file's text (emails optional: binaries skip them)
function scanText(where, text, ids, emails, noPaths) {
  const f = [];
  if (!noPaths) for (const m of text.matchAll(USERPATH)) if (!NOT_A_USER.test(m[2])) { f.push(`${where}: absolute user path "${m[0]}"`); break; }
  for (const id of ids) if (new RegExp('(^|[^A-Za-z0-9])' + esc(id) + '([^A-Za-z0-9]|$)', 'i').test(text)) { f.push(`${where}: names the local/git user`); break; }
  if (emails) for (const m of text.matchAll(EMAIL)) if (!/@(example\.(com|org)|users\.noreply\.github\.com)$/i.test(m[0]) && !LICENCE_EMAIL.has(where.replace(/^embedded /, '') + ' ' + m[0])) { f.push(`${where}: email "${m[0]}"`); break; }
  return f;
}
// names: a game asset type is refused; a GoH/Valour word on tool code is fine (the converters), on a data file it is a WARN
// (derived tables such as key vocabularies: no model/texture/sound, but a maintainer should look before a public release)
function scanName(where, name, warn) {
  const f = [];
  if (ASSET_EXT.test(name)) f.push(`${where}: game asset type "${name}"`);
  else if (GAME_NAME.test(name) && !/\.js$/i.test(name)) warn.push(`${where}: GoH/Valour-named data file (derived table, review)`);
  return f;
}
// LICENSE/NOTICE: the "Copyright <year> <holder>" line names the publisher on purpose; every other line is scanned
const copyrightFree = (name, text) => /(^|\/)(LICENSE|NOTICE)[^/]*$/i.test(name) ? text.replace(/^\s*Copyright\s+(\(c\)\s*)?\d{4}(-\d{4})?\s+\S.*$/gim, '') : text;
const TEXT_EXT = /\.(js|json|txt|yaml|yml|md|set|csv|tsv|html|css)$|(^|\/)(LICENSE|README|NOTICE)[^/]*$/i;
// gate(entries [{name, file}], manifestKeys, assetsRoot, ids) -> {refused[], warned[]}
const BINARY = /\.(exe|dll)$/i; // our exes + the workshop_gui exe and dll: user paths / names in the bytes (no email scan)
// COLLECTED: the GEM index's collected public texts (forum posts, guide pages) and the guide list built from them. Owner's
// decision 2026-11-10: these ship as they were published, so a path a post's author wrote, a contact
// address printed on a public page and the publisher's own public name (pubIds) pass. The machine's user name and the asset
// type rule still refuse. Nothing outside these two places in gemindex/ gets this.
const COLLECTED = /^[^/]+\/gemindex\/(guides\.json|pages\/text\/[^/]+\.txt)$/;
// GUIDE_PDF: the built guide book, one file at one place (<top>/guide/dist/AS2-Modding-Guide-v<version>.pdf, where the Docs page
// looks for it). Owner's decision 2026-11-10: it ships. Its text is the guide pages, which are in the same zip
// and get the full text scan; the PDF itself must start with %PDF- and gets the bytes scan (user paths, user names) over its
// uncompressed parts (document information, file names a builder may leave). A PDF anywhere else is still refused.
const GUIDE_PDF = /^[^/]+\/guide\/dist\/AS2-Modding-Guide-v\d+(?:\.\d+)*\.pdf$/;
const PDF_NAME = /^AS2-Modding-Guide-v(\d+(?:\.\d+)*)\.pdf$/;
// newest guide PDF in a folder by version number (2.0 after 1.12 after 1.2), or null
function newestPdf(dir) {
  let names = []; try { names = fs.readdirSync(dir); } catch (e) { return null; }
  const ver = n => PDF_NAME.exec(n)[1].split('.').map(Number);
  const cmp = (a, b) => { const x = ver(a), y = ver(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (y[i] || 0) - (x[i] || 0); if (d) return d; } return 0; };
  const list = names.filter(n => PDF_NAME.test(n) && fs.statSync(path.join(dir, n)).isFile()).sort(cmp);
  return list.length ? path.join(dir, list[0]) : null;
}
// WHOLE (see the header): the guide whole HTML and the atlas, each at one place; any other .html/.htm entry is refused
const WHOLE = require('../docgen/whole.js');
const GUIDE_WHOLE = /^[^/]+\/guide\/dist\/AS2-Modding-Guide-v(\d+(?:\.\d+)*)\.html$/;
const ATLAS_WHOLE = /^[^/]+\/techdoc\/doctrine\/atlas\.html$/;
const HTML = /\.html?$/i;
function wholeGate(e, buf, ids) {
  const gm = GUIDE_WHOLE.exec(e.name), why = WHOLE.check(buf, gm ? 'guide' : 'atlas', gm ? gm[1] : null);
  if (why) return [`zip ${e.name}: whole document ${why}`];
  return scanText('zip ' + e.name, buf.toString('utf8'), ids, true);
}
const GUIDE_PAGE = /^(README|(?:\d\d|[pr]\d\d)-[^/\\]+)\.md$/;   // the guide files a release ships
// PUBLIC EDITION (see the header): GUIDE_PUBLIC + GUIDE_STRICT on guide page entries, GUIDE_EDITION on the guide book
const PUB = require('../docgen/pub.js');
const GUIDE_ENTRY = /^[^/]+\/guide\/(README|(?:\d\d|[pr]\d\d)-[^/]+)\.md$/;
const EDITION = /<meta\s+(?:name\s*=\s*["']arsenal-edition["']\s+content\s*=\s*["']public["']|content\s*=\s*["']public["']\s+name\s*=\s*["']arsenal-edition["'])\s*\/?>/i;
// isPublic(buf): the whole HTML carries <meta name="arsenal-edition" content="public"> in its head (guide/build-pdf.js --public writes it)
function isPublic(buf) { const t = buf.toString('utf8'), e = t.search(/<\/head\s*>/i); return EDITION.test(e > 0 ? t.slice(0, e) : t.slice(0, 65536)); }
// beside(pdfFile): the public HTML of the same version in the same folder (same name, .html), or null
function beside(pdfFile) {
  const h = pdfFile.replace(/\.pdf$/i, '.html');
  try { return fs.statSync(h).isFile() && isPublic(fs.readFileSync(h)) ? h : null; } catch (e) { return null; }
}
let ALLOW = null;
// guidePublic(name, text, src): GUIDE_PUBLIC (marker or whole-line comment left, outside fences) + GUIDE_STRICT (pub STRICT, book scope)
function guidePublic(name, text, src) {
  const f = [], L = text.split(/\r?\n/), at = i => (src ? `${src.file}:${src.map[i] || i + 1}` : `${name}:${i + 1}`);
  if (!ALLOW) ALLOW = PUB.loadAllow();
  let fence = false, left = 0;
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    if (/^\s*(?:```|~~~)/.test(l)) fence = !fence;
    if (!fence && (PUB.OPEN.test(l) || PUB.CLOSE.test(l) || /^\s*<!--/.test(l)) && !left) { left = i + 1; f.push(`zip ${name}: GUIDE_PUBLIC line ${i + 1} still holds an internal marker or a whole-line HTML comment (ship pub.strip text)`); }
    for (const h of PUB.scanStrict(l, { scope: 'book', allow: ALLOW })) f.push(`zip ${name}: GUIDE_STRICT ${at(i)} ${h.kind} "${h.match}"`);
  }
  return f;
}
function publicIds() {
  const g = spawnSync('git', ['config', 'user.name'], { cwd: SRC, encoding: 'utf8', windowsHide: true });
  return g.status === 0 && g.stdout.trim().length >= 3 ? [g.stdout.trim()] : [];
}
// LAUNCHER: the small package's launchers (owner's decision 2026-11-10), and (W6 U1, owner 2026-11-10 "an installer that handled
// dependencies") Install-ARSENAL.cmd in both zips plus the exe zip's own ARSENAL-gui.cmd (launch.js installer(), exeGui()). Only at the
// zip top level, only these names, only when the caller passes the bytes the builder generated (launchers {name: Buffer}; the exe zip
// passes exactly two: ARSENAL-gui.cmd and Install-ARSENAL.cmd), and only when the entry has exactly
// those bytes; then the full text scan. SCRIPT: any other .cmd/.bat/.ps1/.sh/... or extension-less file (LICENSE/README/NOTICE aside) is refused.
const LAUNCHER = /^[^/]+\/(ARSENAL\.cmd|ARSENAL-gui\.cmd|arsenal|arsenal-gui|Install-ARSENAL\.cmd)$/;
const SCRIPT = /\.(cmd|bat|ps1|psm1|sh|bash|zsh|vbs|vbe|wsf|com|command|scr|lnk)$|(^|\/)[^/.]+$/i;
const PLAIN_DOC = /(^|\/)(LICENSE|README|NOTICE)[^/]*$/i;
// WW2 SOURCES (owner's decision "Ship the database", 2026-11-10,: the ww2sources folder (gemindex ww2bundle) ships
// beside ARSENAL. By exact name only:
//   WW2_DATA: the source list and the word lists the search reads, plus the folder's manifest. Collected public data (titles, addresses,
//     notes as published), so the email rule does not apply; the user-name and absolute-path rules still do.
//   WW2_DB: index.sqlite, the document database (catalogue + machine-read page text, about 1 GB). Only in the -ww2 build (--with-ww2db);
//     any other build refuses it. Too large to read whole: the gate streams it, checks the SQLite header and that its sha256 equals the
//     one ww2bundle wrote into ww2sources.json after it took the local download paths out of the copy.
const WW2_DATA = /^[^/]+\/ww2sources\/(ww2-source-index\.csv|search-terms\.json|aliases\.json|weapon-names\.json|ww2sources\.json)$/;
const WW2_DB = /^[^/]+\/ww2sources\/index\.sqlite$/;
//   WW2_PARTS: the same database as pieces (gemindex ww2-split: index.sqlite.parts/index.sqlite.NNN.gz + parts.json, the git layout).
//     Treated exactly like index.sqlite: only in the -ww2 build; each piece's sha256 must be the one parts.json names, and parts.json's
//     whole sha256 the one ww2bundle wrote into ww2sources.json.
const WW2_PARTS = /^[^/]+\/ww2sources\/index\.sqlite\.parts\/(index\.sqlite\.\d{3}\.gz|parts\.json)$/;
function ww2Parts(e, entries, ww2) {
  if (!ww2.withDb) return [`zip ${e.name}: the document database ships only in the -ww2 build (--with-ww2db)`];
  const pj = entries.find(x => x.name === e.name.replace(/[^/]+$/, 'parts.json'));
  let j = null; try { j = JSON.parse(fs.readFileSync(pj.file, 'utf8')); } catch (x) { /* below */ }
  if (!j || !Array.isArray(j.pieces)) return [`zip ${e.name}: no readable parts.json beside it (build the pieces with gemindex ww2-split)`];
  if (/parts\.json$/.test(e.name)) {
    const mf = entries.find(x => x.name === e.name.replace(/index\.sqlite\.parts\/parts\.json$/, 'ww2sources.json'));
    let want = null; try { want = JSON.parse(fs.readFileSync(mf.file, 'utf8')).sqliteSha256; } catch (x) { /* below */ }
    if (!/^[0-9a-f]{64}$/.test(want || '') || j.sha256 !== want) return [`zip ${e.name}: its whole sha256 differs from ww2sources.json (not the copy ww2bundle checked)`];
    return [];
  }
  const p = j.pieces.find(x => x && x.name === path.basename(e.name));
  if (!p) return [`zip ${e.name}: not listed in parts.json`];
  if (p.sha256 !== crypto.createHash('sha256').update(fs.readFileSync(e.file)).digest('hex')) return [`zip ${e.name}: sha256 differs from parts.json`];
  return [];
}
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'latin1');
function ww2Db(e, entries, ww2) {
  if (!ww2.withDb) return [`zip ${e.name}: the document database ships only in the -ww2 build (--with-ww2db)`];
  const mf = entries.find(x => x.name === e.name.replace(/index\.sqlite$/, 'ww2sources.json'));
  let want = null; try { want = JSON.parse(fs.readFileSync(mf.file, 'utf8')).sqliteSha256; } catch (x) { /* below */ }
  if (!/^[0-9a-f]{64}$/.test(want || '')) return [`zip ${e.name}: no sqliteSha256 in ww2sources/ww2sources.json beside it (build the folder with gemindex ww2bundle)`];
  const fd = fs.openSync(e.file, 'r'), buf = Buffer.alloc(8 << 20), h = crypto.createHash('sha256');
  let first = null;
  try { for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0;) { if (!first) first = Buffer.from(buf.subarray(0, 16)); h.update(buf.subarray(0, n)); } } finally { fs.closeSync(fd); }
  if (!first || !first.equals(SQLITE_MAGIC)) return [`zip ${e.name}: not an SQLite database`];
  if (h.digest('hex') !== want) return [`zip ${e.name}: sha256 differs from ww2sources.json (not the copy ww2bundle checked)`];
  return [];
}
// TECHDOC_HISTORY (owner 2026-11-13, "No tech doc history"): is not public; an entry under it is refused, whatever adds it
const TECHDOC_HISTORY = /^[^/]+\/techdoc\/history(\/|$)/i;
// NO_SOEDIT (owner 2026-11-15): SOEdit is not shipped; it is downloaded on demand. An entry under <top>/soedit/ is refused, whatever adds it
const NO_SOEDIT = /^[^/]+\/soedit(\/|$)/i;
function gate(entries, keys, root, ids, pubIds = [], launchers = null, ww2 = {}) {
  const f = [], warn = [];
  for (const e of entries) {
    if (TECHDOC_HISTORY.test(e.name)) { f.push(`zip ${e.name}: TECHDOC_HISTORY techdoc/history is not public and never ships (owner 2026-11-13)`); continue; }
    if (NO_SOEDIT.test(e.name)) { f.push(`zip ${e.name}: NO_SOEDIT SOEdit is not shipped with ARSENAL (ARSENAL soedit install downloads it; owner 2026-11-15)`); continue; }
    if (WW2_DB.test(e.name)) { f.push(...ww2Db(e, entries, ww2)); continue; }
    if (WW2_PARTS.test(e.name)) { f.push(...ww2Parts(e, entries, ww2)); continue; }
    const buf = fs.readFileSync(e.file), lm = LAUNCHER.exec(e.name);
    if (lm && launchers && launchers[lm[1]]) {
      if (!buf.equals(launchers[lm[1]])) f.push(`zip ${e.name}: launcher bytes differ from what the builder generates from tools/dist/launch and the pin`);
      else f.push(...scanText('zip ' + e.name, buf.toString('utf8'), ids, true));
      continue;
    }
    if (SCRIPT.test(e.name) && !PLAIN_DOC.test(e.name)) { f.push(`zip ${e.name}: launcher or script outside the launcher rule (only <top>/ARSENAL.cmd, ARSENAL-gui.cmd, arsenal, arsenal-gui, Install-ARSENAL.cmd as the builder writes them)`); continue; }
    if (!BINARY.test(e.name)) f.push(...scanName('zip ' + e.name, e.name, warn));
    if (WW2_DATA.test(e.name)) f.push(...scanText('zip ' + e.name, buf.toString('utf8'), ids, false));
    else if (COLLECTED.test(e.name)) f.push(...scanText('zip ' + e.name, buf.toString('utf8'), ids.filter(i => !pubIds.includes(i)), false, true));
    else if (BINARY.test(e.name)) f.push(...scanText('zip ' + e.name + ' (bytes)', buf.toString('latin1'), ids, false));
    else if (GUIDE_PDF.test(e.name)) {
      if (buf.slice(0, 5).toString('latin1') !== '%PDF-') f.push(`zip ${e.name}: not a PDF file`);
      else {
        if (!beside(e.file)) f.push(`zip ${e.name}: GUIDE_EDITION no public HTML of the same version beside it (${path.basename(e.file).replace(/\.pdf$/i, '.html')} with <meta name="arsenal-edition" content="public">): not a public build`);
        f.push(...scanText('zip ' + e.name + ' (bytes)', buf.toString('latin1'), ids, false));
      }
    }
    else if (GUIDE_WHOLE.test(e.name) || ATLAS_WHOLE.test(e.name)) {
      if (GUIDE_WHOLE.test(e.name) && !isPublic(buf)) f.push(`zip ${e.name}: GUIDE_EDITION no <meta name="arsenal-edition" content="public"> in its head: an internal build (build the public one: node tools/docgen/docgen.js --out <dir> --books, then --books-root <dir>/public)`);
      f.push(...wholeGate(e, buf, ids));
    }
    else if (GUIDE_ENTRY.test(e.name)) {
      const text = buf.toString('utf8');
      f.push(...guidePublic(e.name, text, e.pub), ...scanText('zip ' + e.name, text, ids, true));
    }
    else if (HTML.test(e.name)) f.push(`zip ${e.name}: HTML outside the whole-document rule (only <top>/guide/dist/AS2-Modding-Guide-v<version>.html and <top>/techdoc/doctrine/atlas.html)`);
    else if (TEXT_EXT.test(e.name)) f.push(...scanText('zip ' + e.name, copyrightFree(e.name, buf.toString('utf8')), ids, true));
    else f.push(`zip ${e.name}: not an exe, dll or text file`);
  }
  for (const k of keys) {
    f.push(...scanName('embedded ' + k, k, warn));
    const p = path.join(root, k);
    if (!fs.existsSync(p)) { f.push(`embedded ${k}: missing under ${path.basename(root)}`); continue; }
    f.push(...scanText('embedded ' + k, fs.readFileSync(p, 'utf8'), ids, true));
  }
  return { refused: f, warned: warn };
}

// ---- zip writer (store-free deflate, no zip64: every entry and the whole zip stay < 4 GB, checked; over that = an error, no zip)
// An entry up to STREAM_OVER bytes is read whole and deflated in one call (the bytes the earlier zips had). A larger one (the ~1 GB
// streams: CHUNK bytes at a time, each deflated with a full flush (byte-aligned, no back-reference across
// chunks, so the chunks join into one valid deflate stream), one final empty block, the crc chained; the local header's crc and size
// are written after. Never more than one chunk plus its compressed form in memory. Deterministic like the rest.
const STREAM_OVER = 64 << 20, CHUNK = 16 << 20, ZIP_MAX = 0xffffffff;
function dosTime(date) { const [y, m, d] = date.split('-').map(Number); return { time: 0, date: ((y - 1980) << 9) | (m << 5) | d }; }
function writeZip(out, entries, date, opt = {}) {
  const over = opt.streamOver != null ? opt.streamOver : STREAM_OVER, chunk = opt.chunk || CHUNK;
  if (entries.length > 0xffff) throw new Error('more than 65535 entries: zip64 needed, not supported');
  const t = dosTime(date), fd = fs.openSync(out, 'w'), cen = [];
  let off = 0, streamed = 0;
  const put = b => { fs.writeSync(fd, b, 0, b.length, off); off += b.length; };
  const big = what => new Error(what + ' reaches 4 GB: zip64 needed, not supported');
  try {
    for (const e of entries) {
      const name = Buffer.from(e.name, 'utf8'), size = fs.statSync(e.file).size;
      if (size >= ZIP_MAX) throw big(e.name);
      if (off >= ZIP_MAX) throw big('the zip');
      const h = Buffer.alloc(30);
      h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
      h.writeUInt16LE(t.time, 10); h.writeUInt16LE(t.date, 12); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
      const at = off;
      let crc, csize, total;
      if (size <= over) {
        const data = fs.readFileSync(e.file), comp = zlib.deflateRawSync(data, { level: 9 });
        crc = zlib.crc32(data); csize = comp.length; total = data.length;
        h.writeUInt32LE(crc, 14); h.writeUInt32LE(csize, 18); h.writeUInt32LE(total, 22);
        put(h); put(name); put(comp);
      } else {
        put(h); put(name);
        const rfd = fs.openSync(e.file, 'r'), buf = Buffer.alloc(chunk);
        crc = 0; csize = 0; total = 0;
        try {
          for (let n; (n = fs.readSync(rfd, buf, 0, chunk, null)) > 0;) {
            const part = buf.subarray(0, n), c = zlib.deflateRawSync(part, { level: 9, finishFlush: zlib.constants.Z_FULL_FLUSH });
            crc = zlib.crc32(part, crc); total += n; put(c); csize += c.length;
          }
        } finally { fs.closeSync(rfd); }
        const last = zlib.deflateRawSync(Buffer.alloc(0), { level: 9 }); put(last); csize += last.length;
        if (total !== size) throw new Error(e.name + ' changed while it was being zipped');
        const p = Buffer.alloc(12); p.writeUInt32LE(crc >>> 0, 0); p.writeUInt32LE(csize, 4); p.writeUInt32LE(total, 8);
        fs.writeSync(fd, p, 0, 12, at + 14);
        streamed++;
      }
      if (csize >= ZIP_MAX) throw big(e.name + ' compressed');
      cen.push({ name, crc: crc >>> 0, csize, size: total, off: at, mode: e.mode });
    }
    const cstart = off;
    for (const c of cen) {
      const h = Buffer.alloc(46);
      // e.mode (unix permission bits, e.g. 0o755 for the sh launchers): made by = 3 (unix) + 2.0, ext attr = regular file | mode << 16.
      // Every other entry: made by 2.0 (DOS), ext attr 0, as before (the exe zip's bytes do not change).
      h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(c.mode ? 0x0314 : 20, 4); h.writeUInt16LE(20, 6); h.writeUInt16LE(0x0800, 8); h.writeUInt16LE(8, 10);
      h.writeUInt16LE(t.time, 12); h.writeUInt16LE(t.date, 14); h.writeUInt32LE(c.crc, 16); h.writeUInt32LE(c.csize, 20); h.writeUInt32LE(c.size, 24);
      h.writeUInt16LE(c.name.length, 28); // extra, comment, disk, int attr = 0
      if (c.mode) h.writeUInt32LE(((0o100000 | (c.mode & 0o7777)) << 16) >>> 0, 38);
      h.writeUInt32LE(c.off, 42);
      put(h); put(c.name);
    }
    const end = Buffer.alloc(22);
    if (off >= ZIP_MAX) throw big('the zip');
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(cen.length, 8); end.writeUInt16LE(cen.length, 10);
    end.writeUInt32LE(off - cstart, 12); end.writeUInt32LE(cstart, 16);
    put(end);
  } finally { fs.closeSync(fd); }
  return { bytes: off, streamed };
}
// sha256 of a file without reading it whole
function shaFile(f) {
  const h = crypto.createHash('sha256'), fd = fs.openSync(f, 'r'), buf = Buffer.alloc(8 << 20);
  try { for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0;) h.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); }
  return h.digest('hex');
}

// T-ZIP: tools the Front door drops from the release exe. Folders left out of the embedded files.
const FRONT_DOOR_DROP = 'covcheck,covlint,covreplay,covvoc,gohsample,memsample,valourk,exediff,blogkeys,preloadsweep,batch,chains,notes,uidrive,newbuild,golden,brief,q';
// Dropped as commands but embedded as modules, because a shipped tool requires them (found by tools/dist/test/modules.js):
// covanm (assetsame), score (edrun), wpn (goh2as2), exever + upstreamscan (release-check spawns them), exexref (a private tool/wrapped.js). `ARSENAL <name>` answers "unknown tool".
const MODULE_ONLY = require('../as2/as2.js').MODULE_ONLY.join(',');   // one list: as2.js hides the same in the plain-file run
// maintainer-only tools that carry the maintainer's own ids as scrub patterns (docgen USERID, scrub/rules.json): never in a release exe
const RELEASE_DROP = 'docgen,scrub,relscrub,markcheck,credit,sessions,installer,' + FRONT_DOOR_DROP; // installer = builder of ARSENAL Setup (maintainer-only, needs Go and tools/dist); // sessions = coordinator-only claude -p runner (holds commit trailer email); relscrub = denylist; markcheck/credit = hidden mark list
const seaArgs = (dir, n) => [path.join(__dirname, 'sea.js'), '--out', dir, '--name', n, '--drop', RELEASE_DROP, '--module-only', MODULE_ONLY];
function build(dir) {   // one exe (W6 U1): ARSENAL.exe opens the window with no arguments; no ARSENAL-gui.exe any more
  const r = spawnSync(process.execPath, seaArgs(dir, 'ARSENAL'), { stdio: 'inherit' });
  if (r.status !== 0) { console.error('error: sea.js --name ARSENAL failed'); process.exit(2); }
}

// ---- sidecar folders: sideFiles(sc, dir) -> {absent} | {missing[]} | {files:[{rel, file}]} (rel uses /, sorted for `all`)
const WORKSHOP_FILES = ['workshop_gui.exe', 'steam_api64.dll', 'steam_appid.txt', 'README.md'];
const SIDECARS = [
  // the Workshop uploader (owner 2026-11-11: "Integrate and inbuild this program", "the default workshop uploader tool"): the package kept in
  // third_party/workshop_gui, shipped as <top>/workshop_gui/ where tools/workshop/workshop.js looks for it. Required; gated like every sidecar.
  { name: 'workshop_gui', files: WORKSHOP_FILES, optional: [], required: true, dir: path.join(__dirname, '..', '..', 'third_party', 'workshop_gui'), rebuild: 'restore third_party/workshop_gui from git' },
  // required (owner 2026-11-10: "make sure the index goes with the distributable"): an absent folder stops the build (exit 2), exe and --small
  { name: 'gemindex', all: true, required: true, rebuild: 'node tools/gemindex/gemindex.js bundle --from <toolkit folder> --out tools/dist/out/gemindex' },
  // the WW2 sources (owner 2026-11-10: "Ship the database", then "ship one with and one without the database actually"): the folder is
  // required (absent = exit 2 unless --no-ww2sources); its index.sqlite goes only into the -ww2 build (--with-ww2db), see WW2_DB
  { name: 'ww2sources', all: true, required: true, ww2: true, rebuild: 'node tools/gemindex/gemindex.js ww2bundle --from <WW2 sources folder> --out tools/dist/out/ww2sources' },
];
const WW2_DB_FILE = 'index.sqlite', WW2_PARTS_DIR = 'index.sqlite.parts', WW2_LOCAL = ['.gitattributes', 'index.sqlite.part', 'index.sqlite.joined.json'];
const BAK =/\.bak$/i;   // backup copies (a .bak folder, any *.bak folder or file): never shipped (same rule as sea.js manifestKeys)
function walk(dir, rel, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (BAK.test(e.name)) continue;
    if (e.isDirectory()) walk(path.join(dir, e.name), rel + e.name + '/', acc);
    else if (e.isFile()) acc.push(rel + e.name);
  }
  return acc;
}
function sideFiles(sc, dir) {
  let isDir = false; try { isDir = fs.statSync(dir).isDirectory(); } catch (e) { /* absent */ }
  if (!isDir) return { absent: true };
  if (sc.all) {
    const files = walk(dir, '', []).sort();
    return files.length ? { files: files.map(rel => ({ rel, file: path.join(dir, rel) })) } : { absent: true };
  }
  if (!sc.files.some(n => fs.existsSync(path.join(dir, n)))) return { absent: true };
  const missing = sc.files.filter(n => !fs.existsSync(path.join(dir, n)));
  if (missing.length) return { missing };
  return { files: [...sc.files, ...sc.optional.filter(n => fs.existsSync(path.join(dir, n)))].map(rel => ({ rel, file: path.join(dir, rel) })) };
}
// per sidecar: one line naming the folder, the files hit and the count by kind (from the gate's refusal strings)
function sideSummary(refused, top) {
  const out = [];
  for (const sc of SIDECARS) {
    const pre = 'zip ' + top + sc.name + '/', files = new Set(), kinds = {};
    for (const x of refused) {
      if (!x.startsWith(pre)) continue;
      const m = /^zip (\S+?)(?: \(bytes\))?: (absolute user path|names the local\/git user|email|game asset type|not an exe)/.exec(x);
      if (m) { files.add(m[1].slice(top.length)); const k = m[2] === 'not an exe' ? 'not exe/dll/text' : m[2]; kinds[k] = (kinds[k] || 0) + 1; }
    }
    if (files.size) out.push(`REFUSED ${sc.name}/: ${files.size} file(s) hit; by kind: ${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ')}; files: ${[...files].slice(0, 20).join(' ')}${files.size > 20 ? ' ...' : ''}`);
  }
  return out;
}

// the four release names: ARSENAL-<ver>.zip, -small.zip, -ww2.zip, -small-ww2.zip
const zipName = o => `ARSENAL-${o.ver}${o.small ? '-small' : ''}${o.withDb ? '-ww2' : ''}${o.privateAdd && o.privateAdd.length ? '-private' : ''}.zip`;
// main(argv, test): test = launcher test settings ({sys, mach}, loopback pin allowed). Only tools/dist/test/smallbuild.js passes it;
// the command line (below) never does, so a release build always gets the https://nodejs.org pin check.
function main(argv = process.argv.slice(2), test = null) {
  const o = args(argv);
  const top = `ARSENAL-${o.ver}/`, entries = [];
  let keys = null, launchers = null;
  const root = path.resolve(o.assetsRoot);
  if (o.small) {
    const sea = require('./sea.js'), launch = require('./launch.js');
    keys = [...new Set(sea.manifestKeys(root, RELEASE_DROP.split(',')))];   // the exe's list names INDEX.md and index/* twice (harmless there)
    const pinFile = path.resolve(o.pin || path.join(__dirname, 'launch', 'node-pin.json'));
    let pin; try { pin = launch.readPin(pinFile); } catch (e) { console.error(`error: --pin ${pinFile}: ${e.message}`); process.exit(2); }
    try { launchers = launch.render(pin, { arsenalVersion: sea.buildVersion(), keys, moduleOnly: MODULE_ONLY }, test); } catch (e) { console.error('error: ' + e.message); process.exit(2); }
    launchers[launch.INSTALLER] = launch.installer();
    const ld = path.join(o.outDir, 'small-launchers');
    fs.mkdirSync(ld, { recursive: true });
    for (const n of [...launch.NAMES, launch.INSTALLER]) { fs.writeFileSync(path.join(ld, n), launchers[n]); entries.push({ name: top + n, file: path.join(ld, n), mode: /\.cmd$/.test(n) ? 0 : 0o755 }); }
    console.log(`small: ${keys.length} tools files (the exe's embedded list), launchers for Node.js ${pin.version} (${pin.base})${test ? ' TEST BUILD' : ''}`);
  } else {
    const exes = o.exes ? path.resolve(o.exes) : path.join(o.outDir, 'build');
    if (!o.exes) { fs.mkdirSync(exes, { recursive: true }); build(exes); }
    const p = path.join(exes, 'ARSENAL.exe');
    if (!fs.existsSync(p)) { console.error(`error: ${p} missing`); process.exit(2); }
    entries.push({ name: top + 'ARSENAL.exe', file: p });
    // the exe zip's two start files: ARSENAL-gui.cmd (= ARSENAL.exe gui) and the installer, written from the builder's bytes
    const launch = require('./launch.js'), ld = path.join(o.outDir, 'exe-launchers');
    launchers = { [launch.EXE_GUI]: launch.exeGui(), [launch.INSTALLER]: launch.installer() };
    fs.mkdirSync(ld, { recursive: true });
    for (const [n, b] of Object.entries(launchers)) { fs.writeFileSync(path.join(ld, n), b); entries.push({ name: top + n, file: path.join(ld, n) }); }
    const mf = path.join(exes, 'manifest.json');
    if (!fs.existsSync(mf)) { console.error(`error: ${mf} missing (the embedded files list from sea.js)`); process.exit(2); }
    keys = JSON.parse(fs.readFileSync(mf, 'utf8'));
  }
  const sh = [path.join(TOOLS, 'START-HERE.md'), path.join(TOOLS, 'QUICKSTART.md')].find(p => fs.existsSync(p));
  if (!sh) { console.error('error: tools/START-HERE.md and tools/QUICKSTART.md both missing'); process.exit(2); }
  entries.push({ name: top + 'START-HERE.md', file: sh });
  for (const n of ['LICENSE', 'NOTICE', 'CREDITS.md']) {
    const p = path.join(SRC, n); if (fs.existsSync(p)) entries.push({ name: top + n, file: p });
    else if (n !== 'CREDITS.md') { console.error(`error: ${n} missing at the src root`); process.exit(2); }
  }
  const gd = path.resolve(o.guideDir || path.join(SRC, 'guide')); // the book: README.md (front page), p01.. (Part I), 01..22 (Part II), r01.. (Part III); not PLAN.md, build-pdf.js, i18n/, CHANGELOG; the newest guide HTML/PDF of a public build (below)
  if (!fs.existsSync(gd)) { console.error(`error: ${o.guideDir ? '--guide-dir ' + gd : 'guide/'} missing`); process.exit(2); }
  {   // PUBLIC EDITION: each page ships as pub.strip(source).text, written to <out-dir>/public-guide/; a bad marker stops the build
    const pd = path.join(o.outDir, 'public-guide'), bad = [];
    fs.rmSync(pd, { recursive: true, force: true }); fs.mkdirSync(pd, { recursive: true });
    for (const n of fs.readdirSync(gd).filter(n => GUIDE_PAGE.test(n)).sort()) {
      const rel = 'guide/' + n, s = PUB.strip(fs.readFileSync(path.join(gd, n), 'utf8'), { file: rel });
      if (s.errors.length) { bad.push(...s.errors); continue; }
      fs.writeFileSync(path.join(pd, n), s.text, 'utf8');
      entries.push({ name: top + rel, file: path.join(pd, n), pub: { file: rel, map: s.map } });
    }
    if (bad.length) { for (const x of bad) console.log('REFUSED GUIDE_PUBLIC bad internal marker ' + x); console.error(`error: ${bad.length} bad internal marker(s) in the guide pages: fix them (tools/docgen/pub.js strip)`); process.exit(1); }
  }
  // the guide book's root: --books-root (a public build), else --whole-root, else the source tree; see the header
  const br = path.resolve(o.booksRoot || o.wholeRoot || SRC), BOOKS_CMD = 'node tools/docgen/docgen.js --out <dir> --books, then --books-root <dir>/public';
  let leftHtml = false;   // without --books-root: an internal guide HTML is left out, and its PDF with it
  if (!o.noWhole) {
    const g = WHOLE.pick(br, WHOLE.byId('guide')).html;
    if (!g) console.log(`guide whole: none in guide/dist: zip built without it (build: ${BOOKS_CMD})`);
    else if (!o.booksRoot && !isPublic(fs.readFileSync(g.file))) { leftHtml = g.ver; console.log(`guide whole: ${path.basename(g.file)} is an internal build (no arsenal-edition public meta): left out with its PDF. Build the public books: ${BOOKS_CMD}`); }
    else { entries.push({ name: top + g.rel, file: g.file }); console.log(`guide whole: ${path.basename(g.file)}, ${fs.statSync(g.file).size} B${o.booksRoot ? ' (from --books-root)' : ''}`); }
  }
  if (o.noPdf) console.log('guide pdf: left out (--no-pdf)');
  else {
    const pf = o.pdf ? path.resolve(o.pdf) : newestPdf(path.join(br, 'guide', 'dist'));
    if (o.pdf && !(fs.existsSync(pf) && PDF_NAME.test(path.basename(pf)))) { console.error(`error: --pdf ${o.pdf}: want an existing AS2-Modding-Guide-v<version>.pdf`); process.exit(2); }
    const pv = pf && PDF_NAME.exec(path.basename(pf))[1];
    if (!pf) console.log(`guide pdf: none in guide/dist: zip built without it (build: ${BOOKS_CMD})`);
    else if (!o.pdf && leftHtml !== false && WHOLE.cmpVer(leftHtml, pv) === 0) console.log(`guide pdf: ${path.basename(pf)} left out with its internal HTML`);
    else if (!o.pdf && !beside(pf)) console.log(`guide pdf: ${path.basename(pf)} left out: no public HTML of the same version beside it (a PDF is public only beside one). Build the public books: ${BOOKS_CMD}`);
    else { entries.push({ name: top + 'guide/dist/' + path.basename(pf), file: pf }); console.log(`guide pdf: ${path.basename(pf)}, ${fs.statSync(pf).size} B`); }
  }
  if (o.noWhole) console.log('whole documents: left out (--no-whole)');
  else {   // the atlas with its README, from the source tree or --whole-root (the guide whole HTML: above)
    const wr = path.resolve(o.wholeRoot || SRC);
    const a = WHOLE.pick(wr, WHOLE.byId('atlas'));
    if (!a.html) console.log(`atlas: no techdoc/doctrine/atlas.html: zip built without it (build: ${WHOLE.byId('atlas').build})`);
    else {
      entries.push({ name: top + a.html.rel, file: a.html.file });
      if (a.readme) entries.push({ name: top + a.readme.rel, file: a.readme.file });
      console.log(`atlas: atlas.html, ${fs.statSync(a.html.file).size} B${a.readme ? ' + README.md' : '; no techdoc/doctrine/README.md beside it'}`);
    }
  }
  const sd = path.join(TOOLS, 'gen', 'samples');
  if (!fs.existsSync(sd)) { console.error('error: tools/gen/samples missing'); process.exit(2); }
  for (const n of fs.readdirSync(sd).sort()) if (!BAK.test(n) && fs.statSync(path.join(sd, n)).isFile()) entries.push({ name: top + 'samples/' + n, file: path.join(sd, n) });
  for (const sc of SIDECARS) {
    if (o.noSide.has(sc.name)) { console.log(`${sc.name}: left out (--no-${sc.name})`); continue; }
    const dir = path.resolve(o.side[sc.name] || sc.dir || path.join(__dirname, 'out', sc.name)), r = sideFiles(sc, dir);
    if (r.missing) { console.error(`error: ${dir} lacks ${r.missing.join(', ')} (rebuild: ${sc.rebuild}, or --no-${sc.name})`); process.exit(2); }
    if (r.absent && sc.required) { console.error(`error: ${sc.name}: no folder at ${dir} (or it is empty). It must ship with ARSENAL. Build it: ${sc.rebuild}, or pass --no-${sc.name} to build without it on purpose.`); process.exit(2); }
    if (r.absent) { console.log(`${sc.name}: no folder at ${dir}: zip built without it`); continue; }
    if (sc.ww2) {
      // local state of a joined copy and git's attributes file never ship; the pieces (WW2_PARTS_DIR) go exactly like index.sqlite:
      // left out of the default builds; in the -ww2 build index.sqlite when it is there (as before), else the pieces, never both
      r.files = r.files.filter(x => !WW2_LOCAL.includes(x.rel));
      const has = r.files.some(x => x.rel === WW2_DB_FILE), isPart = x => x.rel.startsWith(WW2_PARTS_DIR + '/'), hasParts = r.files.some(isPart);
      if (o.withDb && !has && !hasParts) { console.error(`error: --with-ww2db: no ${WW2_DB_FILE} in ${dir}. The -ww2 build ships the document database; build the folder with: ${sc.rebuild}`); process.exit(2); }
      if (!o.withDb && has) { r.files = r.files.filter(x => x.rel !== WW2_DB_FILE); console.log(`${sc.name}: ${WW2_DB_FILE} left out (the build without the document database; --with-ww2db makes the -ww2 build)`); }
      if (!o.withDb && hasParts) { r.files = r.files.filter(x => !isPart(x)); console.log(`${sc.name}: ${WW2_PARTS_DIR} left out (the build without the document database; --with-ww2db makes the -ww2 build)`); }
      if (o.withDb && has && hasParts) { r.files = r.files.filter(x => !isPart(x)); console.log(`${sc.name}: ${WW2_PARTS_DIR} left out (${WW2_DB_FILE} ships whole)`); }
    }
    for (const x of r.files) entries.push({ name: top + sc.name + '/' + x.rel, file: x.file });
    console.log(`${sc.name}: ${r.files.length} files, ${r.files.reduce((s, x) => s + fs.statSync(x.file).size, 0)} B from ${dir}`);
  }
  // CLAUDE (owner 2026-11-23): the skills, .mcp.json and CLAUDE.md go into the package, through the gate like every text file.
  // From --claude-root, else from the source tree when it is a public copy (it has .claude/skills and no limits/ notes). The working
  // repo's own skills name the note folders, so they never go in this way (private edition: --private-add).
  const cr = o.noClaude ? null : o.claudeRoot ? path.resolve(o.claudeRoot) : (fs.existsSync(path.join(SRC, '.claude', 'skills')) && !fs.existsSync(path.join(SRC, 'limits', 'INDEX.md')) ? SRC : null);
  if (cr) {
    if (!fs.existsSync(path.join(cr, '.claude', 'skills'))) { console.error(`error: --claude-root ${cr}: no .claude/skills in it`); process.exit(2); }
    let n = 0; const cw = (rel, file) => { if (BAK.test(path.basename(file))) return; if (fs.statSync(file).isDirectory()) { for (const c of fs.readdirSync(file).sort()) cw(rel + '/' + c, path.join(file, c)); } else { entries.push({ name: top + rel, file }); n++; } };
    cw('.claude/skills', path.join(cr, '.claude', 'skills'));
    for (const x of ['.mcp.json', 'CLAUDE.md']) if (fs.existsSync(path.join(cr, x))) cw(x, path.join(cr, x));
    console.log(`claude: ${n} files (skills, .mcp.json, CLAUDE.md) from ${cr}`);
  } else console.log('claude: no skills in this package (' + (o.noClaude ? '--no-claude' : 'the source tree is not a public copy; --claude-root <public copy> adds them') + ')');
  for (const a of o.add) { if (!fs.existsSync(a)) { console.error(`error: --add ${a} missing`); process.exit(2); } entries.push({ name: top + path.basename(a), file: path.resolve(a) }); }
  entries.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
  if (new Set(entries.map(e => e.name)).size !== entries.length) { console.error('error: two entries with one name'); process.exit(2); }
  const { refused: f, warned } = gate(entries, keys, root, identities(), publicIds(), launchers, { withDb: o.withDb });
  // CREDIT: author credit + marks present, private mark registry and maintainer-only credit tools absent (lib/creditgate)
  const cg = require('../lib/creditgate');
  f.push(...cg.gate([...entries.map(e => ({ rel: e.name.slice(top.length), file: e.file })), ...keys.map(k => ({ rel: 'tools/' + k, file: path.join(root, k) }))], { requireRoot: true }));
  console.log(`gate: ${entries.length} zip entries, ${keys.length} ${o.small ? 'tools' : 'embedded'} files scanned, ${f.length} refused, ${warned.length} warn`);
  for (const x of warned) console.log('WARN ' + x);
  if (f.length) { for (const x of sideSummary(f, top)) console.log(x); for (const x of f.slice(0, 40)) console.log('REFUSED ' + x); if (f.length > 40) console.log(`... ${f.length - 40} more`); process.exit(1); }
  if (o.check) { console.log(`gate clean (--check: no zip written). Checked: ${zipName(o)}, ${o.withDb ? 'with' : 'without'} the WW2 document database`); return; }
  // small: the tools files go in as tools/<key>, after the gate scanned them as the exe's embedded files
  const all = o.small ? [...entries, ...keys.map(k => ({ name: top + 'tools/' + k, file: path.join(root, k), tool: true }))].sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0)) : entries;
  if (new Set(all.map(e => e.name)).size !== all.length) { console.error('error: two entries with one name'); process.exit(2); }
  // PRIVATE EDITION (owner 2026-11-23): --private-add name=path puts a folder or file into the zip AFTER the gate, unscanned, at <top>/name.
  // A name the package already has is kept as the gated one. The zip is named -private and must never be published.
  if (o.privateAdd.length) {
    const have = new Set(all.map(e => e.name)); let n = 0;
    const walk = (name, file) => {
      const b = path.basename(file); if (BAK.test(b) || b === 'node_modules' || b === '.git') return;
      if (fs.statSync(file).isDirectory()) { for (const c of fs.readdirSync(file).sort()) walk(name + '/' + c, path.join(file, c)); return; }
      if (!have.has(top + name)) { have.add(top + name); all.push({ name: top + name, file, tool: true }); n++; }
    };
    for (const a of o.privateAdd) { const i = a.indexOf('='), name = a.slice(0, i).split('\\').join('/').split('/').filter(Boolean).join('/'), file = path.resolve(a.slice(i + 1)); if (!fs.existsSync(file)) { console.error(`error: --private-add ${a}: nothing at ${file}`); process.exit(2); } walk(name, file); }
    all.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
    console.log(`PRIVATE EDITION: ${n} files added after the gate, not scanned (${o.privateAdd.map(a => a.split('=')[0]).join(', ')}). Never publish this zip.`);
  }
  fs.mkdirSync(o.outDir, { recursive: true });
  const out = path.join(o.outDir, zipName(o)), tmp = out + '.part';
  try { writeZip(tmp, all, o.date); } catch (e) { fs.rmSync(tmp, { force: true }); console.error('error: ' + e.message); process.exit(2); }
  fs.renameSync(tmp, out);
  const sha = shaFile(out), size = fs.statSync(out).size;
  fs.writeFileSync(out + '.sha256', `${sha}  ${path.basename(out)}\n`);
  for (const e of entries) console.log(`  ${e.name}  ${fs.statSync(e.file).size} B`);
  if (o.small) console.log(`  ${top}tools/  ${keys.length} files, ${keys.reduce((s, k) => s + fs.statSync(path.join(root, k)).size, 0)} B`);
  console.log(`wrote ${out}\nsize ${size} B (${(size / 1048576).toFixed(1)} MB)\nsha256 ${sha}`);
}
if (require.main === module) main();
module.exports = { main, gate, scanText, scanName, writeZip, shaFile, zipName, WW2_DATA, WW2_DB, STREAM_OVER,RELEASE_DROP, MODULE_ONLY, seaArgs, SIDECARS, sideFiles, COLLECTED, publicIds, TECHDOC_HISTORY, NO_SOEDIT, GUIDE_PDF, GUIDE_PAGE, newestPdf, GUIDE_WHOLE, ATLAS_WHOLE, LAUNCHER, SCRIPT, GUIDE_ENTRY, isPublic, beside, guidePublic };
