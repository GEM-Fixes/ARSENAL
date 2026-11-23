// check.test: tools/ide/intel/check.js + intel/cli.js. arg 1 = scratch dir. last line PASS.
// seeded fixtures fx/check (truth.json: exact line, col, len, code), CRLF = LF, locate rules, cap, never throws, speed,
// cli text/json output, then a real-data pass over 300 vanilla SDL files (skipped when no game is found).
// Author: Imperator_Aug (ARSENAL, ia-822c38b7)
const fs = require('fs'), path = require('path');
const C = require('../intel/check'), cli = require('../intel/cli');
const W = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'ide-check-test'));
fs.mkdirSync(W, { recursive: true });
const FX = path.join(__dirname, 'fx', 'check'), MOD = path.join(FX, 'mod');
const truth = JSON.parse(fs.readFileSync(path.join(FX, 'truth.json'), 'utf8'));
let bad = 0, n = 0;
// speed limits are wall-clock: inside test-all (6 suites at once) they get 3x room. Strict numbers: IDE_SPEED=1 node tools/ide/test/check.test.js <scratch>
const SLACK = process.env.IDE_SPEED === '1' ? 1 : 3;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b));
const keyOf = rel => rel.replace(/^mod\//, '');
const textOf = rel => cli.readText(path.join(FX, rel));
let game = null;
try { game = require('../../lib/gamedir').resolve({}).dir || null; } catch (e) { game = null; }
if (game && !fs.existsSync(game)) game = null;
const report = { counts: {}, timings: {} };

// ---- 1. seeded fixtures: exact line, col, len, code (no game)
function cmpTruth(rel, want, ictx) {
  const got = C.check({ key: keyOf(rel), text: textOf(rel) }, ictx).filter(f => f.source !== 'keys' || want.some(w => w.code === f.code));
  eq(got.map(f => [f.line, f.col, f.len, f.code]), want.map(w => [w.line, w.col, w.len, w.code]), rel);
  for (const f of got) ok(f.exact === true && ['error', 'warn', 'info'].includes(f.sev) && f.source && f.msg, rel + ': shape ' + JSON.stringify(f));
  return got;
}
for (const [rel, want] of Object.entries(truth.files)) cmpTruth(rel, want, {});

// ---- 2. CRLF text vs LF text: identical findings (in memory and from a CRLF file on disk)
for (const rel of Object.keys(truth.files)) {
  const lf = textOf(rel), crlf = lf.replace(/\n/g, '\r\n');
  const a = C.check({ key: keyOf(rel), text: lf }), b = C.check({ key: keyOf(rel), text: crlf });
  eq(b, a, 'CRLF = LF ' + rel);
  const f = path.join(W, 'crlf-' + path.basename(rel));
  fs.writeFileSync(f, Buffer.from(crlf, 'latin1'));
  ok(cli.readText(f) === lf, 'readText drops CR ' + rel);
  eq(C.check({ key: keyOf(rel), text: cli.readText(f) }), a, 'CRLF file = LF ' + rel);
}
// a BOM and a multi-byte character before the defect shift nothing
{
  const t = '\uFEFF{a "\u0436\u4e2d"}\n{b 1}}\n';
  eq(C.check({ key: 'resource/set/u.set', text: t }).map(f => [f.line, f.col, f.code]), [[2, 6, 'BLOCK_END_STRAY']], 'BOM + UTF-8 text');
}

// ---- 3. unknown key with the game (keylint context)
if (game) for (const [rel, want] of Object.entries(truth.game)) {
  const t0 = Date.now();
  cmpTruth(rel, want, { gameDir: game, folder: MOD });
  report.timings.keylintFirstMs = Date.now() - t0;
} else console.log('skip: no game, unknown-key fixture not run');
// keylint throws -> one info WARN_KEYLINT_FAILED, rest still there
{
  const kl = require('../../keylint/keylint'), orig = kl.lintBuffer;
  kl.lintBuffer = () => { throw new Error('boom'); };
  try {
    const got = C.check({ key: 'resource/set/x.set', text: '{a 1}}\n' }, { gameDir: game || W });
    eq(got.map(f => [f.line, f.code, f.sev]), [[1, 'WARN_KEYLINT_FAILED', 'info'], [1, 'BLOCK_END_STRAY', 'error']], 'keylint throw (col 1 whole-line info sorts first)');
  } finally { kl.lintBuffer = orig; }
}

// ---- 4. locate rules
const L = C.locate;
eq(L({ code: 'BLOCK_UNCLOSED', msg: '' }, '\t{a {b 1}'), { col: 2, len: 1, exact: true }, 'locate unclosed brace (tab = 1 char)');
eq(L({ code: 'BLOCK_END_STRAY', msg: '' }, '{a 1}} }'), { col: 6, len: 1, exact: true }, 'locate stray brace');
eq(L({ code: 'STR_NEWLINE', msg: '' }, '{a "ok" "bro ken  '), { col: 9, len: 8, exact: true }, 'locate unclosed string');
eq(L({ code: 'INCLUDE_MISSING', msg: 'include "x/y.inc" not found' }, '\t(include "x/y.inc" a)'), { col: 11, len: 9, exact: true }, 'locate include string');
eq(L({ code: 'WARN_UNKNOWN_KEY', msg: 'unknown key "mass" in def block "mass"' }, '{mass {mass 5}}'), { col: 2, len: 4, exact: true }, 'locate key token');
eq(L({ code: 'KEY_REPEAT', msg: '{speed} repeated in one block' }, ' {speed 1} {speed 2}'), { col: 3, len: 5, exact: true }, 'locate {key} name');
eq(L({ code: 'ENUM_UNKNOWN', msg: "value 'Fast' not in enum" }, '{mode fast Fast}'), { col: 12, len: 4, exact: true }, 'locate quoted name exact case');
eq(L({ code: 'ENUM_UNKNOWN', msg: "value 'FAST' not in enum" }, '{mode fast}'), { col: 7, len: 4, exact: true }, 'locate quoted name any case');
eq(L({ code: 'SOMETHING', msg: 'no names here' }, '  \t{a 1}  '), { col: 4, len: 5, exact: false }, 'locate fallback');
eq(L({ code: 'SOMETHING', msg: '' }, ''), { col: 1, len: 0, exact: false }, 'locate empty line');
eq(L({ code: 'WARN_ESCAPE', msg: 'unknown escape "\\q"' }, '{a "\\n\\q"}'), { col: 7, len: 2, exact: true }, 'locate escape');
eq(L({ code: 'WARN_PAREN_STRAY', msg: '' }, '{a ")" (x))}'), { col: 11, len: 1, exact: true }, 'locate stray paren');

// ---- 5. kindOf
eq(['resource/set/a.def', 'x.lng', 'm.lua', 'game.log', 'readme.txt', 'resource/set/stuff/g43.test', 'C:\\m\\resource\\set\\b.set', 'notes'].map(C.kindOf),
  ['sdl', 'lng', 'lua', 'log', 'text', 'sdl', 'sdl', 'text'], 'kindOf');
eq(C.check({ key: 'resource/interface/text/a.lng', text: '{x "<b"}' }).map(f => f.code + ':' + f.source), ['NO_TAGS:lng', 'TAG_UNCLOSED:lng'], 'lng: the text file checks run on the buffer');

// ---- 6. cap, never throws, line range
{
  const big = Array.from({ length: 700 }, (_, i) => '{a' + i + ' 1}}').join('\n');
  const got = C.check({ key: 'resource/set/cap.set', text: big });
  ok(got.length === 501 && got[500].code === 'CHECK_CAPPED' && /200 more/.test(got[500].msg), 'cap 500 + 1 info: ' + got.length + ' ' + JSON.stringify(got[500]));
  let sorted = true; for (let i = 1; i < 500; i++) if (got[i].line < got[i - 1].line || got[i].line === got[i - 1].line && got[i].col < got[i - 1].col) sorted = false;
  ok(sorted, 'sorted by line, col');
}
for (const d of [null, {}, { text: 5 }, { key: 'resource/set/a.set', text: null }, { key: 5, text: '{' }]) {
  let r; try { r = C.check(d); } catch (e) { r = 'THROW ' + e.message; }
  ok(Array.isArray(r), 'never throws: ' + JSON.stringify(d) + ' -> ' + JSON.stringify(r));
}

// ---- 7. speed: 200 KB buffer, second call on the same ictx
{
  const unit = '{game_entity\n\t{mass 5}\n\t{extension "x.ext"}\n\t{"weapon" {range 30} {"name" "abc"}}\n}\n';
  const text = unit.repeat(Math.ceil(200 * 1024 / unit.length));
  const doc = { key: 'resource/entity/zz/big.def', text };
  let t0 = Date.now(); C.check(doc, {}); report.timings.noGameFirstMs = Date.now() - t0;
  t0 = Date.now(); C.check(doc, {}); report.timings.noGameSecondMs = Date.now() - t0;
  if (game) {
    const ictx = { gameDir: game, folder: MOD };
    t0 = Date.now(); C.check(doc, ictx); report.timings.gameFirstMs = Date.now() - t0;
    t0 = Date.now(); C.check(doc, ictx); report.timings.gameSecondMs = Date.now() - t0;
  }
  report.timings.bytes = text.length;
  ok(report.timings.noGameSecondMs < 100 * SLACK, 'speed no game second call ' + report.timings.noGameSecondMs + ' ms (limit ' + 100 * SLACK + ')');
  if (game) ok(report.timings.gameSecondMs < 250 * SLACK, 'speed with game second call ' + report.timings.gameSecondMs + ' ms (limit ' + 250 * SLACK + ')');
}

// ---- 7b. big text: 1 MB of "{\n" (exactly the limit, still checked) in under 1.5 s; over the limit one info; maxChars overrides
{
  const one = '{\n'.repeat(1 << 19);   // 1 << 20 chars
  let t0 = Date.now();
  const got = C.check({ key: 'resource/set/brace.set', text: one }, {});
  report.timings.brace1MbMs = Date.now() - t0;
  console.log('1 MB of "{\\n": ' + report.timings.brace1MbMs + ' ms, ' + got.length + ' findings');
  ok(report.timings.brace1MbMs < 1500 * SLACK, '1 MB of "{\\n" under ' + 1500 * SLACK + ' ms: ' + report.timings.brace1MbMs + ' ms');
  ok(got.length >= 1 && got.length <= 501 && !got.some(f => f.code === 'CHECK_SKIPPED_BIG'), '1 MB checked, capped: ' + got.length);
  const over = one + '{';
  t0 = Date.now();
  const sk = C.check({ key: 'resource/set/brace.set', text: over }, {});
  report.timings.overLimitMs = Date.now() - t0;
  eq(sk, [{ line: 1, col: 1, len: 0, exact: false, code: 'CHECK_SKIPPED_BIG', sev: 'info', source: 'syntax', msg: 'File is over 1 MB: checks are off for it (use Check whole mod).' }], 'over 1 MB: one info, nothing else');
  ok(report.timings.overLimitMs < 50 * SLACK,'over-limit answer is instant: ' + report.timings.overLimitMs + ' ms');
  eq(C.check({ key: 'resource/set/s.set', text: '{a 1}}\n' }, { maxChars: 3 }).map(f => f.code), ['CHECK_SKIPPED_BIG'], 'maxChars lowers the limit');
  t0 = Date.now();
  const inf = C.check({ key: 'resource/set/brace.set', text: over }, { maxChars: Infinity });
  report.timings.brace1MbInfinityMs = Date.now() - t0;
  ok(!inf.some(f => f.code === 'CHECK_SKIPPED_BIG') && inf.length >= 1, 'maxChars Infinity checks it (' + report.timings.brace1MbInfinityMs + ' ms)');
  // many findings: only the kept 500 are located
  const rows = Array.from({ length: 40000 }, (_, i) => '{a' + i + ' "x\\q"}}').join('\n');
  t0 = Date.now();
  const many = C.check({ key: 'resource/set/many.set', text: rows }, {});
  report.timings.manyFindingsMs = Date.now() - t0;
  ok(many.length === 501 && many[500].code === 'CHECK_CAPPED', '40000 rows x 2 findings capped: ' + many.length);
  console.log('40000 rows with 2 findings each (' + rows.length + ' chars): ' + report.timings.manyFindingsMs + ' ms');
}

// ---- 7c. de-duplication key is line + code + msg: two different findings of one code on one line both stay
{
  const got = C.check({ key: 'resource/set/e.set', text: '{a "x \\q y \\w"}\n' }, {});
  eq(got.map(f => [f.line, f.col, f.code]), [[1, 7, 'WARN_ESCAPE'], [1, 12, 'WARN_ESCAPE']], 'two escapes on one line both kept');
  const dup = C.check({ key: 'resource/set/e.set', text: '{a "x \\q y \\q"}\n' }, {});
  eq(dup.map(f => f.code), ['WARN_ESCAPE'], 'same line + code + msg: one');
}

// ---- 7d. include / macro through the layered view (game): resolved = not reported; missing = reported; lone buffer = dropped
if (game) {
  const ig = { gameDir: game };
  const codes = (text, key) => C.check({ key: key || 'resource/set/zz/a.set', text }, ig).filter(f => /INCLUDE_MISSING|MACRO_UNDEFINED/.test(f.code)).map(f => [f.line, f.code]);
  eq(codes('(include "/properties/burning.inc")\n{x\n\t("declare_fire_volumes")\n}\n'), [], 'vanilla include resolves, its macro is defined');
  eq(codes('{x\n\t("declare_fire_volumes")\n}\n'), [[2, 'MACRO_UNDEFINED']], 'macro defined nowhere in reach: kept');
  eq(codes('(include "/properties/ide_no_such.inc")\n{x}\n'), [[1, 'INCLUDE_MISSING']], 'include in no layer: kept');
  eq(codes('(include "/properties/ide_no_such.inc")\n{x\n\t("declare_fire_volumes")\n}\n'), [[1, 'INCLUDE_MISSING']], 'macro after a missing include: follow-on dropped');
  eq(codes('{x\n\t("declare_fire_volumes")\n}\n', 'resource/set/zz/a.inc'), [], 'fragment .inc: its includer supplies macros');
  eq(codes('(include "ide_fx_body.inc")\n{x}\n', 'resource/set/syn.set'), [[1, 'INCLUDE_MISSING']], 'relative include missing next to the file');
  eq(C.check({ key: 'resource/set/zz/a.set', text: '(include "/properties/ide_no_such.inc")\n{x ("nope")}\n' }, {}).length, 0, 'no game, no folder: both dropped');
} else console.log('skip: no game, layered include checks not run');

// ---- 7e. readText: a lone CR is a line end (as Notepad++), CRLF is one
{
  eq(cli.readText(Buffer.from('a\rb\r\nc\nd\r')), 'a\nb\nc\nd\n', 'readText: CR, CRLF, LF line ends');
  eq(cli.readText(Buffer.from('a\r\r\nb')), 'a\n\nb', 'readText: CR then CRLF = two line ends');
  eq(C.check({ key: 'resource/set/cr.set', text: cli.readText(Buffer.from('{a 1}\r{b 2}}\r{c 3}')) }).map(f => [f.line, f.col, f.code]), [[2, 6, 'BLOCK_END_STRAY']], 'lone CR file: finding on the line Notepad++ shows');
}

// ---- 8. cli: text and json output, exit codes, mod root + key, missing nav module
async function cliTests() {
  const cap = async argv => {
    const out = [], ol = console.log, oe = console.error;
    console.log = (...a) => out.push(a.join(' ')); console.error = (...a) => out.push('E ' + a.join(' '));
    let rc; try { rc = await cli.run(argv); } finally { console.log = ol; console.error = oe; }
    return { rc, out };
  };
  const f = path.join(MOD, 'resource', 'set', 'syn.set');
  let r = await cap(['check', f, '--game', path.join(W, 'nogame')]);
  ok(r.rc === 1 && r.out[r.out.length - 1] === '5 findings' && r.out.includes(f + ':4:10: BLOCK_END_STRAY ' + "'}' without open block (engine: End of SDL file expected / mis-nesting)"), 'cli check text ' + JSON.stringify(r));
  r = await cap(['check', f, '--json', '--game', path.join(W, 'nogame')]);
  const js = JSON.parse(r.out.filter(l => !l.startsWith('E '))[0]);
  eq(js.map(x => [x.line, x.col, x.code]), truth.files['mod/resource/set/syn.set'].map(w => [w.line, w.col, w.code]), 'cli check json');
  eq([cli.modOf(f).toLowerCase(), cli.keyOf(f, cli.modOf(f))], [MOD.replace(/\\/g, '/').toLowerCase(), 'resource/set/syn.set'], 'cli mod root + key');
  eq(cli.keyOf(path.join(MOD, 'localization', 'english', 'a.lng'), MOD), 'resource/interface/text/english/a.lng', 'cli key localization/');
  const ok0 = path.join(W, 'clean.set'); fs.writeFileSync(ok0, '{a 1}\r\n');
  r = await cap(['check', ok0, '--mod', W, '--game', path.join(W, 'nogame')]);
  ok(r.rc === 0 && r.out[r.out.length - 1] === '0 findings', 'cli clean exit 0 ' + JSON.stringify(r));
  r = await cap(['bogus']); ok(r.rc === 2, 'cli usage exit 2');
  r = await cap(['hover', f, '--line', '1', '--col', '1', '--game', path.join(W, 'nogame')]);
  const navThere = fs.existsSync(path.join(__dirname, '..', 'intel', 'nav.js'));
  if (!navThere) ok(r.rc === 2 && r.out.includes('E ide: hover is not built yet'), 'cli missing nav ' + JSON.stringify(r));
  else ok(r.rc === 0 || r.rc === 2, 'cli hover runs ' + JSON.stringify(r).slice(0, 200));
}

// ---- 9. real data: 300 vanilla SDL files, no ictx: 0 CRASH, counts by code
function realData() {
  if (!game) { console.log('skip: no game, real-data pass not run'); report.realData = 'skipped: no game'; return; }
  const src = require('../../lib/sdlset').createSource({ gameDir: game });
  const items = src.vfsItems().sort((a, b) => a.key < b.key ? -1 : 1);
  const step = Math.max(1, Math.floor(items.length / 300)), pick = [];
  for (let i = 0; i < items.length && pick.length < 300; i += step) pick.push(items[i]);
  const counts = {}, crashes = [], t0 = Date.now();
  let files = 0, bytes = 0, findings = 0;
  for (const t of pick) {
    let b; try { b = t.get(); } catch (e) { continue; }
    if (!b || b.includes(0) && !require('../../lib/enc').bomKind(b)) continue;
    files++; bytes += b.length;
    const got = C.check({ key: t.key, text: cli.readText(b) });
    findings += got.length;
    for (const f of got) { counts[f.code] = (counts[f.code] || 0) + 1; if (f.code === 'CRASH') crashes.push(t.key + ': ' + f.msg); }
  }
  report.realData = { files, bytes, findings, ms: Date.now() - t0, vfsFiles: items.length, counts: Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1])), crashes: crashes.slice(0, 10) };
  ok(files >= 250, 'real data: ' + files + ' files read');
  ok(crashes.length === 0, 'real data: 0 CRASH, got ' + crashes.length + ' ' + crashes.slice(0, 3).join(' | '));
}

// ---- lua and lng buffers (checked while typing)
{
  const lua = t => C.check({ key: 'resource/script/x.lua', text: t }, {}).map(f => f.line + ':' + f.code).join();
  ok(lua('local a = {1, 2}\nfunction f(x)\n  if x then return "a]" end -- end )\n  repeat x = x - 1 until x < 0\n  for i = 1, 2 do print(i) end\nend\n--[[ ( if\n]]\nlocal s = [==[ end ) ]==]\n') === '', 'lua: a correct file has no findings [' + lua('function f() end') + ']');
  ok(lua('function f(x)\n  if x then\n    return 1\nend\n') === '1:LUA_BLOCK_OPEN', 'lua: missing end points at the opener ' + lua('function f(x)\n  if x then\n    return 1\nend\n'));
  ok(lua('local t = {1, (2}\n') === '1:LUA_BRACKET' && /1:LUA_STRING_OPEN/.test(lua('print("abc)\nlocal b = 1\n')) && lua('x = 1\nend\n') === '2:LUA_END_EXTRA' && lua('--[[ never\nx = 1\n') === '1:LUA_COMMENT_OPEN', 'lua: bracket, string, extra end, open comment');
  ok(lua('repeat\n  x = 1\nend\n') === '3:LUA_END_EXTRA', 'lua: end where until was expected');
  const lng = t => C.check({ key: 'resource/interface/text/#my.lng', text: t }, {}).map(f => f.line + ':' + f.code + ':' + f.sev).join();
  ok(lng('{tags\n  {"a" "Hello <c(ff0000)>red</c>"}\n}\n') === '', 'lng: a correct file has no findings [' + lng('{tags\n  {"a" "Hello"}\n}\n') + ']');
  const l2 = lng('{tags\n  {"a" "x < y"}\n  {"b" "one"}\n  {"b" "two"}\n}\n');
  ok(/2:TAG_STRAY:error/.test(l2) && /4:DUP_KEY:error/.test(l2), 'lng: stray < and duplicate key ' + l2);
  ok(/NO_TAGS/.test(lng('{"a" "x"}\n')), 'lng: missing tags header');
}

(async () => {
  try { await cliTests(); } catch (e) { ok(false, 'cli tests threw ' + e.stack); }
  try { realData(); } catch (e) { ok(false, 'real data threw ' + e.stack); }
  fs.writeFileSync(path.join(W, 'check-report.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report.timings), report.realData && report.realData.counts ? JSON.stringify(report.realData.counts) : '');
  console.log(`${n - bad}/${n} ok`);
  console.log(bad ? 'FAIL' : 'PASS');
  process.exitCode = bad ? 1 : 0;
})();
