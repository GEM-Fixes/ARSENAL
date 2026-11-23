// cli: shared arg parser + run helper for tools/.
// parse(argv, {flags:[], values:[]}) -> {q, summary, byCode, format:'text'|'json'|'sarif'|'csv'|'html', rc, output, gameDir, mods:[], pos:[], x:{}}
//   common: -q, --rc FILE, --no-rc, --summary, --by-code, --format F, -o FILE, --game DIR, --mods a,b ; everything else non-dash -> pos
//   opts.flags: extra boolean flags ('--vfs' -> x.vfs=true); opts.values: extra value flags ('--vocab' -> x.vocab='..')
//   --exe as64|mowas_2|mowas2|goh (common): o.exe = the vfs exe ('as64'|'mowas_2'|'goh', mowas2 -> mowas_2, lib/games), undefined when
//     not given; letter case is ignored (GOH = goh); a bad value throws. A tool that lists '--exe' in its own opts.values (lnglint, sdllint, preloadsweep: a file path) keeps
//     it as before in o.x.exe (unchecked); o.exe is then also set when that value names a game, else stays undefined.
//   default --game: the AS2 install (AS2_GAME / as2.json, no Steam probe); with o.exe 'goh' and no --game: the GoH install from
//     lib/gamedir goh() (GOH_GAME, as2.json "goh", Steam), null when none is found
//   throws Error on bad --format / bad --exe / missing value (run() turns it into exit 2)
// printReport(rep, o, {tool, byCode=true}) -> rep.print with o's format/output/q/summary
// rcPrint(rep, o, startDir, tool, extra) -> for tools with their own arg loop: o.format/output/noRc/rcFile; rc auto-found from
//   startDir; bad format / bad rc -> exit 2
// run(main) -> call main() (may be async); an exception prints `error: msg` to stderr and exits 2. exit code otherwise untouched
// Author: Imperator_Aug (ARSENAL, ia-16fe2889)
const lintrc = require('./lintrc'), fs = require('fs'), path = require('path');
const FORMATS = ['text', 'json', 'sarif', 'csv', 'html'];
const games = require('./games'), EXES = ['as64', 'mowas_2', 'mowas2', 'goh'];
// a game word, letter case ignored (--exe GOH = goh, as lib/games get); an exe file name (mowas_2.exe) is not a game word here
const isExe = v => typeof v === 'string' && EXES.includes(v.toLowerCase());

function parse(argv, spec = {}) {
  const o = { q: false, summary: false, byCode: false, format: 'text', output: null, gameDir: null, mods: [], pos: [], x: {} };
  const flags = new Set(spec.flags || []), values = new Set(spec.values || []);
  const val = (i, a) => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-q') o.q = true;
    else if (a === '--summary') o.summary = true;
    else if (a === '--by-code') o.byCode = true;
    else if (a === '--format') { o.format = val(i, a); i++; if (!FORMATS.includes(o.format)) throw new Error(`--format must be one of ${FORMATS.join('|')}`); }
    else if (a === '--rc') { o.rcFile = val(i, a); i++; }
    else if (a === '--no-rc') o.noRc = true;
    else if (a === '-o') { o.output = val(i, a); i++; }
    else if (a === '--game') { o.gameDir = val(i, a); i++; }
    else if (a === '--mods') { o.mods = val(i, a).split(',').filter(Boolean); i++; }
    else if (flags.has(a)) o.x[a.replace(/^--?/, '')] = true;
    else if (values.has(a)) { o.x[a.replace(/^--?/, '')] = val(i, a); i++; }
    else if (a === '--exe') { const v = val(i, a); if (!isExe(v)) throw new Error('--exe must be one of ' + EXES.join('|')); o.exe = games.exeOf(v); i++; }
    else o.pos.push(a);
  }
  if (values.has('--exe') && isExe(o.x.exe)) o.exe = games.exeOf(o.x.exe);
  // default --game: AS2_GAME env / as2.json only (no registry spawn on every tool run; `as2 game` does the Steam probe).
  // --exe goh: the GoH install (gamedir.goh: GOH_GAME, as2.json "goh", Steam), never the AS2 install
  if (!o.gameDir && o.exe === 'goh') { try { o.gameDir = require('./gamedir').goh() || null; } catch (e) { /* keep null */ } }
  else if (!o.gameDir) { try { o.gameDir = require('./gamedir').resolve({ noSteam: true }).dir || null; } catch (e) { /* keep null */ } }
  // .lintrc: --rc FILE, else nearest .lintrc walking up from first positional (dir or file) or cwd; --no-rc disables
  o.rc = null;
  if (!o.noRc) {
    if (o.rcFile) o.rc = lintrc.load(o.rcFile);
    else {
      const start = o.pos.length && fs.existsSync(o.pos[0]) ? o.pos[0] : process.cwd();
      const f = lintrc.find(start);
      if (f) o.rc = lintrc.load(f);
    }
  }
  return o;
}

function printReport(rep, o, { tool = null, byCode = true } = {}) {
  rep.print({ showInfo: !o.q, byCode: byCode || o.byCode, summary: o.summary, format: o.format, output: o.output, meta: { tool }, rc: o.rc || null });
}

function run(main) {
  const fail = e => { console.error('error: ' + (e && e.message || e)); process.exit(2); };
  try {
    const r = main();
    if (r && typeof r.then === 'function') r.catch(fail);
  } catch (e) { fail(e); }
}

function rcPrint(rep, o, start, tool, extra) {
  let rc = null;
  try {
    if (o.format && !FORMATS.includes(o.format)) throw new Error('--format must be one of ' + FORMATS.join('|'));
    if (!o.noRc) { const f = o.rcFile || lintrc.find(start || process.cwd()); if (f) rc = lintrc.load(f); }
  } catch (e) { console.error('error: ' + e.message); process.exit(2); }
  rep.print(Object.assign({ format: o.format || 'text', output: o.output || null, meta: { tool }, rc }, extra));
}

module.exports = { parse, printReport, rcPrint, run, FORMATS };
