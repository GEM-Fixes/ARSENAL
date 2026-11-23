// lng-add test: builds fixture mod in a temp work dir (TEST_WORK or a fresh mkdtemp, removed at exit; never test/work), runs cases, checks codes + byte preservation. exit 1 on failure.
// Author: Imperator_Aug (ARSENAL, ia-8139709e)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const os = require('os'), TW = process.env.TEST_WORK || fs.mkdtempSync(path.join(os.tmpdir(), 'lngadd-'));
if (!process.env.TEST_WORK) process.on('exit', () => fs.rmSync(TW, { recursive: true, force: true }));
const T = __dirname, W = path.join(TW, 'work'), TOOL = path.join(T, '..', 'lng-add.js');
const GAME = require('../../lib/gamedir').resolve().dir || '';   // DOOR-A: AS2_GAME, as2.json or Steam; none: the game cases are skipped (noGame)
fs.rmSync(W, { recursive: true, force: true });
fs.mkdirSync(path.join(W, 'localization'), { recursive: true });
const crlf = 'localization/#a.lng', lf = 'localization/#b.lng';
fs.writeFileSync(path.join(W, crlf), '\ufeff{tags\r\n\t{"unit"\r\n\t\t{"one" "First"}\r\n\t}\r\n\t{"flat" "x"}\r\n}\r\n');
fs.writeFileSync(path.join(W, lf), '{tags\n  {"unit" {"one" "First"} {"two" "Second"}}\n}\n');
const noGame = !fs.existsSync(path.join(GAME, 'localization.pak'));

let fails = 0;
const run = (...a) => { const r = cp.spawnSync(process.execPath, [TOOL, W, '--game', GAME, ...a], { encoding: 'utf8' }); return { out: r.stdout + r.stderr, code: r.status }; };
const rd = f => fs.readFileSync(path.join(W, f));
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL: ' + m); } else console.log('ok: ' + m); };
const has = (r, code) => new RegExp('\\b' + code + '\\b').test(r.out.split('\n').filter(l => !l.startsWith('info:')).join('\n'));

// 1 append leaf into existing block (CRLF file, BOM, own-line close): bytes before/after untouched, clean lint
let before = rd(crlf), r = run('--file', '#a.lng', '--key', 'unit/two', '--text', 'Second');
let after = rd(crlf);
ok(r.code === 0 && /0 findings/.test(r.out), 'add leaf clean: ' + r.out.trim().split('\n').pop());
ok(after.toString('utf8').includes('\t\t{"two" "Second"}\r\n\t}'), 'inserted at child indent with CRLF');
ok(after.length === before.length + Buffer.from('\t\t{"two" "Second"}\r\n').length && after.subarray(0, 3).equals(Buffer.from([0xEF, 0xBB, 0xBF])), 'only inserted bytes added, BOM kept');
// 2 nested new chain, top-level
r = run('--file', '#a.lng', '--key', 'new/deep/key', '--text', 'N');
ok(r.code === 0 && rd(crlf).toString('utf8').includes('\t{"new" {"deep" {"key" "N"}}}\r\n}'), 'new nested chain at top');
// 3 duplicate refused (case-insensitive), file unchanged
before = rd(crlf); r = run('--file', '#a.lng', '--key', 'UNIT/One', '--text', 'again');
ok(r.code === 1 && has(r, 'LNG_KEY_EXISTS') && before.equals(rd(crlf)), 'duplicate refused LNG_KEY_EXISTS');
// 4 --force replaces
r = run('--file', '#a.lng', '--key', 'unit/one', '--text', 'Uno', '--force');
ok(r.code === 0 && rd(crlf).toString('utf8').includes('{"one" "Uno"}') && !rd(crlf).toString('utf8').includes('First'), '--force replace');
// 5 escapes: quote, newline, backslash
r = run('--file', '#a.lng', '--key', 'unit/esc', '--text', 'say "hi"\\nline2\\\\x');
ok(r.code === 0 && rd(crlf).toString('utf8').includes('{"esc" "say \\"hi\\"\\nline2\\\\x"}') && /0 findings/.test(r.out), 'escapes quote/newline/backslash, one line');
// 6 LF file with inline close braces: inline insert into block, LF kept
r = run('--file', '#b.lng', '--key', 'unit/three', '--text', 'T');
ok(r.code === 0 && rd(lf).toString('utf8') === '{tags\n  {"unit" {"one" "First"} {"two" "Second"}{"three" "T"}}\n}\n', 'inline close: inserted inline, LF kept');
// 7 key without file prefix (non-# file)
r = run('--file', 'desc2.lng', '--key', 'other/x', '--text', 'a');
ok(r.code === 1 && has(r, 'LNG_KEY_PREFIX'), 'wrong key prefix LNG_KEY_PREFIX');
// 8 new non-# file creates {tags}, key with title
r = run('--file', 'mine.lng', '--key', 'mine/a/b', '--text', 'ok');
ok(r.code === 0 && rd('localization/mine.lng').toString('utf8') === '{tags\r\n\t{"a" {"b" "ok"}}\r\n}\r\n'.replace('\t{"a"', '\t{"a"') || rd('localization/mine.lng').toString('utf8').includes('{"a" {"b" "ok"}}'), 'new file created with {tags}');
// 9 lint finding introduced by the text
r = run('--file', '#a.lng', '--key', 'unit/bad', '--text', 'a < b');
ok(has(r, 'LNG_LINT_TAG_STRAY'), 'new lint finding surfaced LNG_LINT_TAG_STRAY');
// 10 key is a block
r = run('--file', '#a.lng', '--key', 'unit', '--text', 'x');
ok(r.code === 1 && has(r, 'LNG_KEY_IS_BLOCK'), 'block key refused LNG_KEY_IS_BLOCK');
// 11 non-UTF8 file untouched
fs.writeFileSync(path.join(W, 'localization/#c.lng'), Buffer.from([0x7B, 0x74, 0x61, 0x67, 0x73, 0x0A, 0x7B, 0x22, 0xEF, 0xF0, 0x22, 0x20, 0x22, 0x78, 0x22, 0x7D, 0x0A, 0x7D, 0x0A]));
r = run('--file', '#c.lng', '--key', 'q', '--text', 'x');
ok(r.code === 1 && has(r, 'LNG_ENC'), 'cp1251 file refused LNG_ENC');
if (noGame) console.log('skip: vanilla checks (no game dir)');
else {
  // 12 shadows vanilla key defined in another vanilla file
  r = run('--file', '#a.lng', '--key', 'desc/human/special/hint', '--text', 'H');
  ok(has(r, 'WARN_LNG_KEY_SHADOWS_VANILLA') && /copy the whole vanilla/.test(r.out), 'WARN_LNG_KEY_SHADOWS_VANILLA + route text');
  // 13 new file at a vanilla path
  r = run('--file', 'desc.lng', '--key', 'desc/zz/new', '--text', 'a');
  ok(has(r, 'LNG_FILE_REPLACES_VANILLA') && !has(r, 'WARN_LNG_KEY_SHADOWS_VANILLA'), 'LNG_FILE_REPLACES_VANILLA');
  // 14 same key in the replaced vanilla file itself: not a shadow
  r = run('--file', 'desc.lng', '--key', 'desc/human/special/hint', '--text', 'H', '--force');
  ok(!has(r, 'WARN_LNG_KEY_SHADOWS_VANILLA'), 'key in own replaced vanilla file: no shadow');
}
// ---- game parity (made-up games in the work dir, no real install needed)
{
  const { writeZip } = require('../../lib/zipwrite');
  const put = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
  // AS2 install with as64.exe: the as64/core/localization keys count for --exe as64 (and the auto pick), not for mowas_2
  const A = path.join(TW, 'as2game'), M = path.join(TW, 'm64');
  fs.mkdirSync(A, { recursive: true }); put(path.join(A, 'as64.exe'), 'MZ');
  writeZip(path.join(A, 'localization.pak'), [['desc.lng', Buffer.from('{tags\r\n\t{"human" {"x" "X"}}\r\n}\r\n')]]);
  put(path.join(A, 'as64', 'core', 'localization', 'as64', 'english.lng'), '{tags\r\n\t{"opt" "O"}\r\n}\r\n');
  put(path.join(M, 'localization', '#m.lng'), '{tags\r\n}\r\n');
  const ra = (...a) => { const r = cp.spawnSync(process.execPath, [TOOL, M, '--game', A, '--dry-run', ...a], { encoding: 'utf8' }); return { out: r.stdout + r.stderr, code: r.status }; };
  ok(has(ra('--file', '#m.lng', '--key', 'as64/english/opt', '--text', 'o'), 'WARN_LNG_KEY_SHADOWS_VANILLA'), 'as64: as64/core/localization key seen (auto exe from as64.exe)');
  ok(has(ra('--exe', 'as64', '--file', '#m.lng', '--key', 'as64/english/opt', '--text', 'o'), 'WARN_LNG_KEY_SHADOWS_VANILLA'), 'as64: --exe as64 sees as64/core');
  ok(!has(ra('--exe', 'mowas2', '--file', '#m.lng', '--key', 'as64/english/opt', '--text', 'o'), 'WARN_LNG_KEY_SHADOWS_VANILLA'), 'mowas2: as64/core not mounted, no shadow');
  ok(has(ra('--exe', 'mowas_2', '--file', '#m.lng', '--key', 'desc/human/x', '--text', 'o'), 'WARN_LNG_KEY_SHADOWS_VANILLA'), 'mowas2: localization.pak keys still seen');
  // GoH install: text under localizations/<code>/interface/text/ (GHLOC-01, GHVFS-04); .pot entry (GHLOC-06); .lng form (GHLOC-09)
  const H = path.join(TW, 'gohgame'), GM = path.join(TW, 'gmod');
  put(path.join(H, 'binaries', 'x64', 'call_to_arms.exe'), 'MZ');
  put(path.join(H, 'localizations', 'default', 'interface', 'text', 'units.pot'), '#, fuzzy\nmsgid ""\nmsgstr ""\n\nmsgctxt "unit/tiger"\nmsgid "Tiger"\nmsgstr ""\n');
  put(path.join(H, 'localizations', 'default', 'interface', 'text', 'zz.lng'), '{tags\r\n\t{"late" "L"}\r\n}\r\n');
  fs.mkdirSync(GM, { recursive: true });
  const rg = (...a) => { const r = cp.spawnSync(process.execPath, [TOOL, GM, '--game', H, ...a], { encoding: 'utf8' }); return { out: r.stdout + r.stderr, code: r.status }; };
  const pot = path.join(GM, 'localizations', 'default', 'interface', 'text', 'mine.pot');
  r = rg('--file', 'mine.pot', '--key', 'mymod/title', '--text', 'My "map"');
  const p1 = fs.existsSync(pot) ? fs.readFileSync(pot, 'utf8') : '';
  ok(r.code === 0 && p1.startsWith('#, fuzzy\r\nmsgid ""\r\nmsgstr ""\r\n') && p1.endsWith('\r\n\r\nmsgctxt "mymod/title"\r\nmsgid "My \\"map\\""\r\nmsgstr ""\r\n'), 'goh: new .pot with header + entry, CRLF (auto goh from call_to_arms.exe)');
  ok(!fs.existsSync(path.join(GM, 'localization')), 'goh: no root localization/ written');
  r = rg('--file', 'mine.pot', '--key', 'MyMod/Title', '--text', 'again');
  ok(r.code === 1 && has(r, 'LNG_KEY_EXISTS'), 'goh .pot: duplicate refused');
  fs.writeFileSync(pot, p1.replace('msgctxt "mymod/title"', '#, fuzzy\r\nmsgctxt "mymod/title"'));
  r = rg('--file', 'mine.pot', '--key', 'mymod/title', '--text', 'New', '--force');
  const p2 = fs.readFileSync(pot, 'utf8');
  ok(r.code === 0 && p2.includes('msgctxt "mymod/title"\r\nmsgid "New"\r\nmsgstr ""') && !/fuzzy\r\nmsgctxt/.test(p2) && p2.startsWith('#, fuzzy\r\nmsgid ""'), 'goh .pot: --force replaces, entry fuzzy flag dropped, header kept');
  r = rg('--file', 'mine.pot', '--key', 'unit/tiger', '--text', 'T');
  ok(has(r, 'WARN_LNG_KEY_SHADOWS_VANILLA') && /GHLOC-08/.test(r.out), 'goh: key in vanilla units.pot sorting after mine.pot: vanilla wins, warned');
  r = rg('--file', 'zzz.pot', '--key', 'unit/tiger', '--text', 'T', '--dry-run');
  ok(r.code === 0 && !has(r, 'WARN_LNG_KEY_SHADOWS_VANILLA') && /OVERRIDES_VANILLA_KEY/.test(r.out), 'goh: file sorting after vanilla: mod text kept, info only');
  r = rg('--file', 'units.pot', '--key', 'unit/x', '--text', 'T', '--dry-run');
  ok(has(r, 'LNG_FILE_REPLACES_VANILLA'), 'goh: new file at a vanilla path flagged');
  r = rg('--file', '#g.lng', '--key', 'g/a', '--text', 'A');
  ok(r.code === 0 && fs.readFileSync(path.join(GM, 'localizations', 'default', 'interface', 'text', '#g.lng'), 'utf8').includes('{"g" {"a" "A"}}'), 'goh: .lng form under localizations/default/interface/text/');
  r = rg('--file', 'x.po', '--key', 'k', '--text', 'T', '--dry-run');
  ok(r.code === 1 && has(r, 'LNG_PO_KIND'), 'goh: .po under default refused (GHLOC-05)');
  r = rg('--loc', 'ru', '--file', 'x.po', '--key', 'k', '--text', 'Т');
  const po = path.join(GM, 'localizations', 'ru', 'interface', 'text', 'x.po');
  ok(r.code === 0 && fs.readFileSync(po, 'utf8').includes('msgctxt "k"\r\nmsgid "Т"\r\nmsgstr "Т"'), 'goh: .po under ru, text in msgstr');
  r = rg('--loc', 'ru', '--file', 'x.pot', '--key', 'k', '--text', 'T', '--dry-run');
  ok(r.code === 1 && has(r, 'LNG_PO_KIND'), 'goh: .pot under ru refused (GHLOC-05)');
  r = rg('--file', 'x.txt', '--key', 'k', '--text', 'T');
  ok(r.code !== 0 && /must be a \.lng, \.pot or \.po/.test(r.out) && !fs.existsSync(path.join(GM, 'localizations', 'default', 'interface', 'text', 'x.txt')), 'goh: other file kinds refused');
  // a mod folder inside the GoH install is refused by writeguard, dry run too, nothing written
  const HM = path.join(H, 'mods', 'x'); fs.mkdirSync(HM, { recursive: true });
  for (const extra of [[], ['--dry-run'], ['--exe', 'as64']]) {
    r = cp.spawnSync(process.execPath, [TOOL, HM, '--game', H, '--file', 't.pot', '--key', 'k/t', '--text', 'T', ...extra], { encoding: 'utf8' });
    ok(r.status === 2 && /refused: .*Gates of Hell/.test(r.stderr) && !fs.existsSync(path.join(HM, 'localizations')), 'goh: mod inside the GoH install refused ' + (extra.join(' ') || '(write)'));
  }
  r = cp.spawnSync(process.execPath, [TOOL, M, '--game', A, '--file', 'a.pot', '--key', 'k', '--text', 'T'], { encoding: 'utf8' });
  ok(r.status !== 0 && /--file must be a \.lng/.test(r.stderr) && !fs.existsSync(path.join(M, 'localization', 'a.pot')), 'as2: .pot still refused (AS2 reads .lng only, LOC-17)');
  // parser round trip on its own
  const lib = require('../lng-add.js'), src = '#, fuzzy\nmsgid ""\nmsgstr ""\n"Language: en\\n"\n\n#: f:1\nmsgctxt "a"\nmsgid "x"\n"y"\nmsgstr ""\n';
  const pe = lib.parsePo(src).entries;
  ok(pe.length === 2 && pe[0].fuzzy && pe[0].ctx === null && pe[1].ctx === 'a' && pe[1].id === 'xy' && !pe[1].fuzzy, 'parsePo: header, comment, continued string');
}
console.log(fails ? 'FAILED ' + fails : 'ALL OK');
process.exit(fails ? 1 : 0);
