// ide/intel/cli: `ide check|hover|def|refs|symbols|words|fixes <file> [--mod DIR] [--game DIR] [--exe as64|mowas_2|mowas2|goh] [--line N] [--col N] [--json] [--pause]`
//   run(argv) -> Promise<exit code>. argv[0] = command. check prints `<file>:<line>:<col>: <CODE> <msg>` and `N findings`,
//   exit 1 when a finding is an error. The other commands print JSON (nav and fixes come from intel/nav.js, intel/fixes.js;
//   a missing module prints "ide: <cmd> is not built yet", exit 2).
//   --mod DIR = mod root (default: the folder above the last `resource/` or `localization/` in the file path).
//   --game DIR = game install (default lib/gamedir resolve; none found = text-only checks). mods = [<mod name>] when the mod
//   folder is <game>/mods/<name>, else none. --pause waits for Enter before exit (Notepad++ Run menu).
//   --exe = the game (lib/games): the game view, key words and index are that game's (MoW:AS2 on the shared install: no as64/core;
//   goh: the GoH install from lib/games install('goh') when --game is not given). None = as before (the vfs picks as64 first).
//   A word that is no game: exit 2.
// Author: Imperator_Aug (ARSENAL, ia-83d0d14d)
const fs = require('fs'), path = require('path');

const CMDS = ['check', 'hover', 'def', 'refs', 'symbols', 'words', 'fixes'];
function parse(argv) {
  const o = { cmd: argv[0], file: null, mod: null, game: null, exe: null, line: null, col: null, json: false, pause: false };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (a === '--pause') o.pause = true;
    else if (a === '--mod' || a === '--game' || a === '--exe' || a === '--line' || a === '--col') o[a.slice(2)] = argv[++i];
    else if (!o.file) o.file = a;
  }
  if (o.line != null) o.line = Number(o.line);
  if (o.col != null) o.col = Number(o.col);
  return o;
}
const fwd = s => String(s).replace(/\\/g, '/');
// mod root: the dir above the last resource/ (or localization/) segment
function modOf(file) {
  const p = fwd(path.resolve(file)), lo = p.toLowerCase();
  const i = Math.max(lo.lastIndexOf('/resource/'), lo.lastIndexOf('/localization/'));
  return i < 0 ? null : p.slice(0, i);
}
// virtual key of a file under the mod root (files/lib keyOf rule: localization/ -> resource/interface/text/)
function keyOf(file, mod) {
  if (!mod) return null;
  const r = fwd(path.relative(mod, path.resolve(file))).toLowerCase();
  if (r.startsWith('../') || path.isAbsolute(r)) return null;
  if (r.startsWith('resource/')) return r;
  if (r.startsWith('localization/')) return 'resource/interface/text/' + r.slice('localization/'.length);
  return null;
}
// file bytes -> editor text: UTF-8 BOM dropped, \n line ends, each line UTF-8 when valid else cp1251 (as files/lib decodeBuf).
// line ends as Notepad++ counts them: CRLF, LF, and a lone CR
function readText(file) {
  const enc = require('../../lib/enc');
  let buf = Buffer.isBuffer(file) ? file : fs.readFileSync(file);
  if (enc.bomKind(buf) === 'utf8') buf = buf.subarray(3);
  const out = [];
  let s = 0;
  for (let i = 0; i <= buf.length; i++) {
    if (i < buf.length && buf[i] !== 0x0A && buf[i] !== 0x0D) continue;
    const b = buf.subarray(s, i);
    out.push(enc.isUtf8(b) ? b.toString('utf8') : enc.decodeCp1251(b));
    if (i < buf.length && buf[i] === 0x0D && buf[i + 1] === 0x0A) i++;   // CRLF = one line end
    s = i + 1;
  }
  return out.join('\n');
}
function ctxOf(o) {
  const folder = o.mod ? path.resolve(o.mod) : modOf(o.file);
  let gameDir = o.game ? path.resolve(o.game) : null;
  if (gameDir && !fs.existsSync(gameDir)) { console.error('ide: no game folder at ' + gameDir + ': key checks skipped'); gameDir = null; return { gameDir: undefined, mods: [], folder: folder || undefined }; }
  const G = o.exe ? require('../../lib/games').get(o.exe) : null;
  if (!gameDir && G && G.kind === 'goh') { try { gameDir = require('../../lib/games').install('goh').dir || null; } catch (e) { gameDir = null; } }
  else if (!gameDir) { try { gameDir = require('../../lib/gamedir').resolve({}).dir || null; } catch (e) { gameDir = null; } }
  let mods = [];
  if (gameDir && folder) {
    const rel = fwd(path.relative(gameDir, folder)).split('/');
    if (rel.length === 2 && rel[0].toLowerCase() === 'mods') mods = [rel[1]];
  }
  const r = { gameDir: gameDir || undefined, mods, folder: folder || undefined };
  if (G) r.exe = G.exe;   // only when named: the ictx of a run with no --exe is as before
  return r;
}
function load(name, cmd) {
  try { return require(name); } catch (e) {
    if (e && e.code === 'MODULE_NOT_FOUND') { console.error('ide: ' + cmd + ' is not built yet'); return null; }
    throw e;
  }
}
function waitEnter() {
  return new Promise(res => {
    process.stdout.write('Press Enter to close.');
    try { process.stdin.resume(); process.stdin.once('data', () => { process.stdin.pause(); res(); }); process.stdin.once('end', res); } catch (e) { res(); }
  });
}
async function run(argv) {
  const o = parse(argv || []);
  let code = 2;
  try { code = await go(o); } catch (e) { console.error('ide: ' + (e && e.message || e)); code = 2; }
  if (o.pause) await waitEnter();
  return code;
}
async function go(o) {
  if (!CMDS.includes(o.cmd) || !o.file) { console.error('usage: ide ' + CMDS.join('|') + ' <file> [--mod DIR] [--game DIR] [--exe as64|mowas_2|mowas2|goh] [--line N] [--col N] [--json] [--pause]'); return 2; }
  if (o.exe && !require('../../lib/games').get(o.exe)) { console.error('ide: --exe ' + o.exe + ' is no game (as64, mowas_2, mowas2, goh)'); return 2; }
  if (!fs.existsSync(o.file) || !fs.statSync(o.file).isFile()) { console.error('ide: no such file: ' + o.file); return 2; }
  const ictx = Object.assign(ctxOf(o), { maxChars: Infinity });   // the CLI is not the GUI's thread: big files are checked too
  const doc = { key: keyOf(o.file, ictx.folder), text: readText(o.file), file: path.resolve(o.file) };
  const show = v => { console.log(JSON.stringify(v, null, o.json ? 0 : 2)); return 0; };
  const pos = () => {
    if (!(o.line >= 1) || !(o.col >= 1)) { console.error('ide: ' + o.cmd + ' needs --line N --col N'); return null; }
    return { line: o.line, col: o.col };
  };
  if (o.cmd === 'check') {
    const fs2 = require('./check').check(doc, ictx);
    if (o.json) console.log(JSON.stringify(fs2));
    else {
      for (const f of fs2) console.log(`${o.file}:${f.line}:${f.col}: ${f.code} ${f.msg}`);
      console.log(`${fs2.length} findings`);
    }
    return fs2.some(f => f.sev === 'error') ? 1 : 0;
  }
  if (o.cmd === 'fixes') {
    const fx = load('./fixes', o.cmd); if (!fx) return 2;
    const fl = require('./check').check(doc, ictx);
    if (typeof fx.warm === 'function') await fx.warm(ictx);   // define index: the macro fixers need it built
    return show(await fx.fixes(doc, fl, ictx));
  }
  const nav = load('./nav', o.cmd); if (!nav) return 2;
  if (o.cmd === 'symbols') return show(await nav.symbols(doc));
  if (o.cmd === 'words') {
    const ext = path.extname(o.file).slice(1).toLowerCase();
    return show(await nav.words(ext || require('./check').kindOf(o.file), ictx));
  }
  const p = pos(); if (!p) return 2;
  if (o.cmd === 'hover') return show(await nav.hover(doc, p, ictx));
  if (o.cmd === 'def') return show(await nav.def(doc, p, ictx));
  return show(await nav.refs(doc, p, ictx));
}

module.exports = { run, parse, modOf, keyOf, readText };
