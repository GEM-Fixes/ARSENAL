// ide fixes test: every fixer on a fixture text + finding -> exact text after apply; apply edge cases; multi(); lang keys; null ictx.
// arg 1 = scratch dir (unused: nothing is written). Last line PASS.
// Author: Imperator_Aug (ARSENAL, ia-a4e39528)
'use strict';
const path = require('path'), fs = require('fs');
const F = require('../intel/fixes');
const sdlx = require('../../lib/sdlx');
const LANG = require('../../gui/ext/ide/lang/fixes');

const scratch = process.argv[2] || path.join(require('os').tmpdir(), 'ide-fixes');
try { fs.mkdirSync(scratch, { recursive: true }); } catch { /* not needed */ }
const MOD = path.join(__dirname, 'fx', 'fixes', 'mod');
const GAME = require('../../lib/gamedir').resolve().dir || '';   // AS2_GAME, as2.json or Steam; none: game cases skipped
const hasGame = (() => { try { return fs.statSync(path.join(GAME, 'resource')).isDirectory(); } catch { return false; } })();

let bad = 0, n = 0;
const ok = (c, what) => { n++; if (!c) { bad++; console.log('FAIL ' + what); } };
const eq = (a, b, what) => ok(a === b, what + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));
const sdlCodes = (text, key) => { const out = []; sdlx.read(Buffer.from(text, 'utf8'), { file: key || 'resource/x.def', key: key || 'resource/x.def', open: () => null, onError: (f, l, c) => out.push(c + ':' + l) }); return out; };

// ---- one case per fixer: text, finding, expected text. Tabs and other lines must survive.
const CASES = [
  { name: 'spell KEY_CASE', text: '{entity\n\t{Mass 100}\n\t{name "a"}\n}', f: { code: 'KEY_CASE', line: 2, msg: 'key "Mass": DDA key names are case-sensitive (strcmp); vanilla spells it "mass" -> silently ignored (SDL-33)' },
    want: '{entity\n\t{mass 100}\n\t{name "a"}\n}', safe: false, label: 'ide.f.change' },
  { name: 'spell WARN_KEY_CASE prefix', text: '\t{Mass 1}', f: { code: 'WARN_KEY_CASE', line: 1, msg: 'key "Mass": x; vanilla spells it "mass" -> silently ignored' }, want: '\t{mass 1}' },
  { name: 'spell KEY_CASE two spellings: no fix', text: '{Foo 1}', f: { code: 'KEY_CASE', line: 1, msg: 'key "Foo": vanilla spells it "foo" / "FOO" -> silently ignored' }, none: true },
  { name: 'spell MI_KEY_CASE', text: '{trigger\n\t{Once}\n}', f: { code: 'MI_KEY_CASE', line: 2, msg: "trigger key 'Once' is case-sensitive: skipped silently (use once)" }, want: '{trigger\n\t{once}\n}' },
  { name: 'spell MIS_TEAMKEY_UNREAD', text: '{mp\n\t{maxTeamPlayers 4}\n}', f: { code: 'MIS_TEAMKEY_UNREAD', line: 2, msg: 'maxTeamPlayers is not read; use maxTeamSlots' }, want: '{mp\n\t{maxTeamSlots 4}\n}' },
  { name: 'spell UNKNOWN_KEY did you mean', text: '{x\n\t{masss 5}\n}', f: { code: 'UNKNOWN_KEY', line: 2, msg: 'unknown key "masss" in entity block "x"; did you mean "mass"?' }, want: '{x\n\t{mass 5}\n}' },
  { name: 'spell MACRO_CASE_MISMATCH', text: '(define "foo" ({a 1}))\n{x\n\t("Foo")\n}', f: { code: 'MACRO_CASE_MISMATCH', line: 3, msg: 'macro "Foo" is used but only "foo" is defined; names are case-sensitive. change: write "foo"' }, want: '(define "foo" ({a 1}))\n{x\n\t("foo")\n}' },
  { name: 'syntax MTL_DIFFUSE_BARE', text: '{material\n\t{diffuse tank01}\n}', f: { code: 'MTL_DIFFUSE_BARE', line: 2, msg: '{diffuse tank01}: the texture name must be a quoted string, {diffuse "tank01"}; a bare word makes the map load fail' }, want: '{material\n\t{diffuse "tank01"}\n}', label: 'ide.f.quote' },
  { name: 'syntax TAGS_MULTI_STRING', text: '\t{tags "tank" "heavy"}', f: { code: 'WARN_TAGS_MULTI_STRING', line: 1, msg: '{tags} has 2 quoted strings: only the first is read as tags; write one string, {tags "tank heavy"}' }, want: '\t{tags "tank heavy"}' },
  { name: 'syntax STR_NEWLINE end of line', text: '{a\n\t{name "abc\n}', f: { code: 'STR_NEWLINE', line: 2, msg: 'string not closed before line end (strings never span lines)' }, want: '{a\n\t{name "abc"\n}', sdl: true, label: 'ide.f.closeQuote' },
  { name: 'syntax STR_NEWLINE before closer', text: '{a\n\t{name "abc}\n}', f: { code: 'STR_NEWLINE', line: 2, msg: 'string not closed' }, want: '{a\n\t{name "abc"}\n}', sdl: true },
  { name: 'syntax STR_NEWLINE comment after: no fix', text: '\t{name "abc} ; note', f: { code: 'STR_NEWLINE', line: 1, msg: 'x' }, none: true },
  // stray brace: only the brace goes; a line left blank goes with its line end (no empty line left behind)
  { name: 'syntax BLOCK_END_STRAY alone: line deleted', text: '{a\n\t{b 1}\n}\n}\n{c 2}', f: { code: 'BLOCK_END_STRAY', line: 4, msg: "'}' without open block" }, want: '{a\n\t{b 1}\n}\n{c 2}', sdl: true, label: 'ide.f.dropBrace' },
  { name: 'syntax BLOCK_END_STRAY alone CRLF', text: '{a 1}\r\n  }\r\n{c 2}\r\n', f: { code: 'BLOCK_END_STRAY', line: 2, msg: 'x' }, want: '{a 1}\r\n{c 2}\r\n', sdl: true },
  { name: 'syntax BLOCK_END_STRAY last line', text: '{a 1}\r\n}', f: { code: 'BLOCK_END_STRAY', line: 2, msg: 'x' }, want: '{a 1}', sdl: true },
  { name: 'syntax BLOCK_END_STRAY keeps comment', text: '{a 1}\n  } ; old end\n', f: { code: 'BLOCK_END_STRAY', line: 2, msg: 'x' }, want: '{a 1}\n   ; old end\n', sdl: true },
  { name: 'syntax BLOCK_END_STRAY after a block', text: '{b 1}}', f: { code: 'BLOCK_END_STRAY', line: 1, msg: 'x' }, want: '{b 1}', sdl: true },
  { name: 'syntax BLOCK_END_STRAY blank before', text: '{b 1} }\n', f: { code: 'BLOCK_END_STRAY', line: 1, msg: 'x' }, want: '{b 1}\n', sdl: true },
  { name: 'syntax BLOCK_END_STRAY with comment after', text: '{b 1}} ; c', f: { code: 'BLOCK_END_STRAY', line: 1, msg: 'x' }, want: '{b 1} ; c', sdl: true },
  { name: 'syntax BLOCK_END_STRAY brace in string ignored', text: '{b "}"}}', f: { code: 'BLOCK_END_STRAY', line: 1, msg: 'x' }, want: '{b "}"}', sdl: true },
  { name: 'syntax BLOCK_END_STRAY two unmatched: no fix', text: '{b 1}}}', f: { code: 'BLOCK_END_STRAY', line: 1, msg: 'x' }, none: true },
  { name: 'asread THRESHOLD_LT1', text: '\t{projectileDamageThreshold 0.5}', f: { code: 'THRESHOLD_LT1', line: 1, msg: 'projectileDamageThreshold 0.5 is clamped to 1 by the engine' }, want: '\t{projectileDamageThreshold 1}', safe: true, label: 'ide.f.asread' },
  { name: 'asread MAP_PLAYERS', text: '{mp\r\n\t{maxPlayers 5}\r\n}', f: { code: 'MAP_PLAYERS', line: 2, msg: 'maxPlayers 5 is odd: engine rounds up to 6' }, want: '{mp\r\n\t{maxPlayers 6}\r\n}', safe: true },
  { name: 'asread MAP_PLAYERS other form: no fix', text: '\t{maxPlayers 40}', f: { code: 'MAP_PLAYERS', line: 1, msg: 'maxPlayers 40 outside 2..16: clamped' }, none: true },
  // include / repoint from the open mod folder (no game needed)
  { name: 'include INCLUDE_MISSING (folder)', key: 'resource/entity/tank/t.def', ictx: { folder: MOD }, text: '(include "ide_fx_body.inc")\n{x}', f: { code: 'INCLUDE_MISSING', line: 1, msg: 'include "ide_fx_body.inc" not found (resolved virtual:resource/entity/tank/ide_fx_body.inc)' },
    want: '(include "/entity/ide_fx_parts/ide_fx_body.inc")\n{x}', safe: true, label: 'ide.f.point' },
  { name: 'include no candidate: no fix', key: 'resource/entity/tank/t.def', ictx: { folder: MOD }, text: '(include "nowhere_zz.inc")', f: { code: 'INCLUDE_MISSING', line: 1, msg: 'include "nowhere_zz.inc" not found' }, none: true },
  { name: 'repoint REF_MODEL_MISSING (folder)', key: 'resource/entity/tank/t.def', ictx: { folder: MOD }, text: '{Extension "ide_fx_hull.mdl"}', f: { code: 'REF_MODEL_MISSING', line: 1, msg: 'Extension "ide_fx_hull.mdl" not found next to the def' },
    want: '{Extension "/entity/ide_fx_parts/ide_fx_hull.mdl"}', safe: true },
  { name: 'repoint REF_WRONG_FOLDER given', text: '\t{Extension "hull.mdl"}', f: { code: 'REF_WRONG_FOLDER', line: 1, msg: 'Extension "hull.mdl" resolves against resource/entity/a only (FMT-22, no entity/basename fallback): not found there, but exists as resource/entity/b/hull.mdl; write "/entity/b/hull.mdl" or move the file' },
    want: '\t{Extension "/entity/b/hull.mdl"}' },
];
// macro: the define index of the open folder (no game needed); the .set target is not safe; a buffer that defines the name later gets no include
const FOLDER = { folder: MOD };
CASES.push(
  { name: 'macro MACRO_UNDEFINED .inc target (folder): safe', key: 'resource/entity/tank/t.def', ictx: FOLDER, text: '{x\n\t("ide_fx_unique_macro")\n}', f: { code: 'MACRO_UNDEFINED', line: 2, msg: 'define not found: "ide_fx_unique_macro" (defines are per top-level file, after the definition)' },
    want: '(include "/set/ide_fx/fxmacro.inc")\n{x\n\t("ide_fx_unique_macro")\n}', safe: true, label: 'ide.f.include' },
  { name: 'macro MACRO_UNDEFINED .set target: not safe', key: 'resource/entity/tank/t.def', ictx: FOLDER, text: '{x\n\t("ide_fx_set_macro")\n}', f: { code: 'MACRO_UNDEFINED', line: 2, msg: 'define not found: "ide_fx_set_macro"' },
    want: '(include "/set/ide_fx/fxmacro2.set")\n{x\n\t("ide_fx_set_macro")\n}', safe: false, label: 'ide.f.include' },
  { name: 'macro defined later in the buffer: no include fix', key: 'resource/entity/tank/t.def', ictx: FOLDER, text: '{x\n\t("ide_fx_unique_macro")\n}\n(define "ide_fx_unique_macro" ({a 1}))', f: { code: 'MACRO_UNDEFINED', line: 2, msg: 'define not found: "ide_fx_unique_macro"' }, none: true },
  { name: 'macro CRLF text gets a CRLF line', key: 'resource/entity/tank/t.def', ictx: FOLDER, text: '{x\r\n\t("ide_fx_unique_macro")\r\n}\r\n', f: { code: 'MACRO_UNDEFINED', line: 2, msg: 'define not found: "ide_fx_unique_macro"' },
    want: '(include "/set/ide_fx/fxmacro.inc")\r\n{x\r\n\t("ide_fx_unique_macro")\r\n}\r\n' },
);
if (hasGame) CASES.push(
  { name: 'macro MACRO_UNDEFINED (game + folder)', key: 'resource/entity/tank/t.def', ictx: { gameDir: GAME, mods: [], folder: MOD }, text: '{x\n\t("ide_fx_unique_macro")\n}', f: { code: 'MACRO_UNDEFINED', line: 2, msg: 'define not found: "ide_fx_unique_macro" (defines are per top-level file, after the definition)' },
    want: '(include "/set/ide_fx/fxmacro.inc")\n{x\n\t("ide_fx_unique_macro")\n}', safe: true, label: 'ide.f.include' },
  { name: 'macro with BOM: same-line prefix', key: 'resource/entity/tank/t.def', ictx: { gameDir: GAME, mods: [], folder: MOD }, text: '\uFEFF{x\n\t("ide_fx_unique_macro")\n}', f: { code: 'MACRO_UNDEFINED', line: 2, msg: 'define not found: "ide_fx_unique_macro"' },
    want: '\uFEFF(include "/set/ide_fx/fxmacro.inc") {x\n\t("ide_fx_unique_macro")\n}' },
);
else console.log('note: no game at ' + GAME + ': game macro cases skipped');

(async () => {
// ---- define index: not ready before warm (macro fixer gives no fix), ready after; the next call has the fix
{
  const c = CASES.find(x => x.ictx === FOLDER);
  ok(!F.ready(FOLDER), 'define index: not ready before warm');
  eq(F.fixes({ key: c.key, text: c.text }, [c.f], FOLDER).length, 0, 'define index building: no macro fix yet');
  await F.warm(FOLDER);
  ok(F.ready(FOLDER), 'define index: ready after warm');
}
for (const c of CASES) if (c.ictx) await F.warm(c.ictx);

const t0 = Date.now();
for (const c of CASES) {
  const doc = { key: c.key || 'resource/entity/x.def', text: c.text };
  const fx = F.fixes(doc, [c.f], c.ictx || null);
  if (c.none) { eq(fx.length, 0, c.name + ': no fix expected'); continue; }
  ok(fx.length === 1, c.name + ': one fix (got ' + fx.length + ')');
  if (!fx.length) continue;
  const x = fx[0];
  eq(x.id, c.f.code + ':' + c.f.line + ':1', c.name + ': id');
  ok(x.label && /^ide\.f\./.test(x.label.k), c.name + ': label key');
  if (c.label) eq(x.label.k, c.label, c.name + ': label');
  if (c.safe !== undefined) eq(x.safe, c.safe, c.name + ': safe');
  const after = F.apply(c.text, x.edits);
  eq(after, c.want, c.name + ': text');
  // property: the rule finds nothing left for that finding
  eq(F.fixes({ key: doc.key, text: after }, [c.f], c.ictx || null).length, 0, c.name + ': rule finds nothing after apply');
  if (c.sdl) { const before = sdlCodes(c.text).filter(s => s.startsWith(c.f.code)); ok(before.length > 0, c.name + ': sdlx reports it before'); eq(sdlCodes(after).filter(s => s.startsWith(c.f.code)).length, 0, c.name + ': sdlx clean after'); }
}
const ms = Date.now() - t0;

// ---- several findings on one line: separate fixes, ids n=1,2, each applies alone
{
  const text = '\t{Mass 1} {Armor 2}';
  const fs2 = [
    { code: 'KEY_CASE', line: 1, msg: 'key "Mass": vanilla spells it "mass" -> silently ignored' },
    { code: 'KEY_CASE', line: 1, msg: 'key "Armor": vanilla spells it "armor" -> silently ignored' },
    { code: 'KEY_CASE', line: 1, msg: 'key "Armor": vanilla spells it "armor" -> silently ignored' },   // duplicate: dropped
  ];
  const fx = F.fixes({ key: 'resource/x.def', text }, fs2, null);
  eq(fx.length, 2, 'same line: two fixes');
  eq(fx.map(f => f.id).join(','), 'KEY_CASE:1:1,KEY_CASE:1:2', 'same line: ids');
  eq(F.apply(text, fx[0].edits.concat(fx[1].edits)), '\t{mass 1} {armor 2}', 'same line: both applied together');
}

// ---- apply edge cases
eq(F.apply('a\nb\nc', [{ line: 2, col: 0, endCol: 0, text: 'NEW' }]), 'a\nNEW\nb\nc', 'apply: col 0 inserts a whole line');
eq(F.apply('a\nb', [{ line: 3, col: 0, endCol: 0, text: 'END' }]), 'a\nb\nEND', 'apply: col 0 at count+1 appends');
eq(F.apply('abcdef', [{ line: 1, col: 2, endCol: 3, text: 'X' }, { line: 1, col: 5, endCol: 6, text: 'YY' }]), 'aXcdYYf', 'apply: two edits on one line');
eq(F.apply('abc', [{ line: 1, col: 2, endCol: 2, text: '1' }, { line: 1, col: 2, endCol: 2, text: '2' }]), 'a12bc', 'apply: two inserts at one place keep order');
eq(F.apply('x\nlast', [{ line: 2, col: 5, endCol: 5, text: '!' }]), 'x\nlast!', 'apply: edit on last line, no trailing newline');
eq(F.apply('x\n', [{ line: 1, col: 1, endCol: 2, text: 'y' }]), 'y\n', 'apply: trailing newline kept');
eq(F.apply('abcdef', [{ line: 1, col: 2, endCol: 5, text: 'X' }, { line: 1, col: 4, endCol: 6, text: 'Y' }]), 'abcYf', 'apply: overlapping edit dropped, text not mangled');
eq(F.apply('a\r\nbc\r\n', [{ line: 2, col: 3, endCol: 3, text: 'd' }]), 'a\r\nbcd\r\n', 'apply: CR kept at line end');
eq(F.apply('a\nb', [{ line: 1, col: 0, endCol: 0, text: 'top' }, { line: 1, col: 2, endCol: 2, text: '!' }]), 'top\na!\nb', 'apply: insert line + edit on same line');
eq(F.apply('a', []), 'a', 'apply: no edits');
eq(F.apply('a', [{ line: 9, col: 1, endCol: 2, text: 'z' }]), 'a', 'apply: edit past the end ignored');

// ---- multi
{
  const m = F.multi([
    { code: 'KEY_CASE' }, { code: 'LNG_OVERRIDES_VANILLA' }, { code: 'WARN_STR_NOT_UTF8' }, { code: 'STR_NOT_UTF8' },
    { code: 'PLY_MTL_MISSING' }, { code: 'INCLUDE_MISSING' }, { code: 'BLOCK_END' }, { code: 'LNG_OVERRIDES_VANILLA' }, null,
  ]);
  eq(m.join(','), 'LNG_OVERRIDES_VANILLA,WARN_STR_NOT_UTF8,STR_NOT_UTF8,PLY_MTL_MISSING', 'multi: mixed list');
  eq(F.multi(null).length, 0, 'multi: null');
}

// ---- lang: every label key in 4 languages, no empty cell
{
  const keys = new Map(LANG.map(r => [r[0], r]));
  ok(LANG.every(r => r.length === 5 && r.every(s => typeof s === 'string' && s.trim()) && r[0].startsWith('ide.f.')), 'lang: rows [key,en,ru,uk,zh] filled');
  eq(keys.size, LANG.length, 'lang: no duplicate keys');
  const src = fs.readFileSync(path.join(__dirname, '..', 'intel', 'fixes.js'), 'utf8');
  const used = new Set([...src.matchAll(/lab\('([A-Za-z]+)'/g)].map(m => 'ide.f.' + m[1]));
  for (const k of used) ok(keys.has(k), 'lang: ' + k + ' exists');
  for (const k of used) { const r = keys.get(k); if (!r) continue; const slots = s => (s.match(/\{\w+\}/g) || []).sort().join(); ok([2, 3, 4].every(i => slots(r[i]) === slots(r[1])), 'lang: ' + k + ' same slots in every language'); }
}

// ---- robustness: null ictx, junk findings, missing game never throw
{
  let threw = false;
  try {
    F.fixes({ key: null, text: '{a}' }, [{ code: 'INCLUDE_MISSING', line: 1, msg: 'include "x.inc" not found' }, { code: 'MACRO_UNDEFINED', line: 1, msg: 'define not found: "m"' }], null);
    F.fixes({ key: 'resource/a.def', text: '{a}' }, [{ code: 'KEY_CASE', line: 99, msg: 'x' }, {}, null, { code: 'STR_NEWLINE' }], undefined);
    F.fixes(null, null, null); F.fixes({ text: 5 }, [], null);
    F.fixes({ key: 'resource/a.def', text: '(include "x.inc")' }, [{ code: 'INCLUDE_MISSING', line: 1, msg: 'include "x.inc" not found' }], { gameDir: path.join(scratch, 'no-such-game') });
  } catch (e) { threw = e; }
  ok(!threw, 'null ictx never throws' + (threw ? ': ' + threw.message : ''));
  eq(F.fixes({ key: null, text: '(include "x.inc")' }, [{ code: 'INCLUDE_MISSING', line: 1, msg: 'include "x.inc" not found' }], null).length, 0, 'null ictx: include gives no fix');
}

// ---- apply: dropEol deletes a whole line with its line end; bytes of other lines untouched
eq(F.apply('a\r\nb\r\nc', [{ line: 2, col: 1, endCol: 2, text: '', dropEol: true }]), 'a\r\nc', 'apply dropEol: middle line, CRLF');
eq(F.apply('a\nb', [{ line: 2, col: 1, endCol: 2, text: '', dropEol: true }]), 'a', 'apply dropEol: last line takes the line end before it');
eq(F.apply('a\nbc', [{ line: 2, col: 1, endCol: 2, text: '', dropEol: true }]), 'a\nc', 'apply dropEol: not the whole line = a plain edit');
eq(F.apply('ж\xe9\r\n}\r\n', [{ line: 2, col: 1, endCol: 2, text: '', dropEol: true }]), 'ж\xe9\r\n', 'apply dropEol: other bytes kept');
eq(F.apply('a\r\nb', [{ line: 3, col: 0, endCol: 0, text: 'END' }]), 'a\r\nb\r\nEND', 'apply: append to a CRLF text keeps CRLF');

// ---- FIX_CODES: only codes check() can give (refcheck / milint.check are not run by check)
for (const c of ['REF_MODEL_MISSING', 'REF_MESH_MISSING', 'REF_TEXTURE_MISSING', 'REF_WRONG_FOLDER', 'THRESHOLD_LT1', 'MAP_PLAYERS', 'MIS_TEAMKEY_UNREAD']) ok(!F.FIX_CODES.includes(c), 'FIX_CODES: no ' + c);
for (const c of ['INCLUDE_MISSING', 'MACRO_UNDEFINED', 'KEY_CASE', 'BLOCK_END_STRAY']) ok(F.FIX_CODES.includes(c), 'FIX_CODES: has ' + c);

// ---- end to end: text -> check() -> fixes() -> apply() -> check(): the code is gone and no new code appears. One case per code in FIX_CODES.
const C = require('../intel/check');
const E2E = [
  { code: 'STR_NEWLINE', key: 'resource/set/e2e.set', text: '{a\n\t{name "abc\n}\n' },
  { code: 'BLOCK_END_STRAY', key: 'resource/set/e2e.set', text: '{a 1}\r\n}\r\n{b 2}\r\n' },
  { code: 'MACRO_CASE_MISMATCH', key: 'resource/set/e2e.set', text: '(define "foo" ({a 1}))\n{x\n\t("Foo")\n}\n' },
  { code: 'MI_KEY_CASE', key: 'resource/map/single/t/t.mi', text: '{mission\n\t{Helpers\n\t\t{triggers\n\t\t\t{"t1"\n\t\t\t\t{Autoreset}\n\t\t\t}\n\t\t}\n\t}\n}\n' },
  { code: 'MACRO_UNDEFINED', key: 'resource/entity/tank/t.def', text: '{x\n\t("ide_fx_unique_macro")\n}\n', game: true },
  { code: 'INCLUDE_MISSING', key: 'resource/entity/tank/t.def', text: '(include "ide_fx_body.inc")\n{x}\n', game: true },
  { code: 'KEY_CASE', key: 'resource/set/breed/zz.set', text: '{breed\n\t{Behaviour "b"}\n}\n', game: true },
  { code: 'UNKNOWN_KEY', key: 'resource/set/breed/zz.set', text: '{breed\n\t{behaviour "b"}\n\t{behaviur "b"}\n}\n', game: true },
  { code: 'MTL_DIFFUSE_BARE', key: 'resource/entity/zz/a.mtl', text: '{material\n\t{diffuse tank01}\n}\n', game: true },
  { code: 'TAGS_MULTI_STRING', key: 'resource/entity/zz/a.def', text: '{game_entity\n\t{tags "tank" "heavy"}\n}\n', game: true },
];
{
  const covered = new Set(E2E.map(c => c.code));
  for (const c of F.FIX_CODES) ok(covered.has(c), 'e2e: a case for ' + c);
  for (const c of E2E) {
    if (c.game && !hasGame) { console.log('note: no game: e2e ' + c.code + ' skipped'); continue; }
    const ictx = c.game ? { gameDir: GAME, mods: [], folder: MOD } : {};
    const doc = { key: c.key, text: c.text };
    const before = C.check(doc, ictx);
    ok(before.some(f => f.code === c.code), 'e2e ' + c.code + ': check finds it: ' + JSON.stringify(before.map(f => f.code)));
    await F.warm(ictx);
    const fx = F.fixes(doc, before, ictx).filter(x => x.code === c.code);
    ok(fx.length === 1, 'e2e ' + c.code + ': one fix (got ' + fx.length + ')');
    if (!fx.length) continue;
    const after = F.apply(c.text, fx[0].edits), got = C.check({ key: c.key, text: after }, ictx);
    ok(!got.some(f => f.code === c.code), 'e2e ' + c.code + ': gone after apply: ' + JSON.stringify(got.map(f => f.code)));
    const old = new Set(before.map(f => f.code)), fresh = got.filter(f => !old.has(f.code)).map(f => f.code);
    eq(fresh.join(','), '', 'e2e ' + c.code + ': no new code');
  }
}

// ---- ictx.vfs: the GUI's view is used (no second index), read lazily: a fixer that needs no view never reads it
{
  let reads = 0;
  const lazy = (val) => { const o = { folder: MOD }; Object.defineProperty(o, 'vfs', { enumerable: true, get() { reads++; return val; } }); return o; };
  const ic = lazy(null);
  F.fixes({ key: 'resource/x.def', text: '\t{Mass 1}' }, [{ code: 'KEY_CASE', line: 1, msg: 'key "Mass": vanilla spells it "mass" -> silently ignored' }], ic);
  eq(reads, 0, 'ictx.vfs not read by a fixer that needs no view');
  C.check({ key: 'resource/set/l.set', text: '{a 1}\n' }, ic);
  eq(reads, 0, 'ictx.vfs not read by check() of a buffer with no include');
  const fake = { files: new Map([['resource/set/ide_fx_only_in_view.inc', { source: 'loose', container: path.join(MOD, 'resource', 'set', 'ide_fx'), entry: 'fxmacro.inc' }]]) };
  const ic2 = lazy(fake);
  const got = C.check({ key: 'resource/set/l.set', text: '(include "/set/ide_fx_only_in_view.inc")\n{x ("ide_fx_unique_macro")}\n' }, ic2);
  eq(got.filter(f => /INCLUDE_MISSING|MACRO_UNDEFINED/.test(f.code)).length, 0, 'check(): include resolved through ictx.vfs, its define seen');
  const miss = C.check({ key: 'resource/set/l.set', text: '(include "/set/ide_fx_nowhere.inc")\n{x}\n' }, lazy(fake));
  eq(miss.map(f => f.code).join(','), 'INCLUDE_MISSING', 'check(): include in no layer is reported with a view');
  const lone = C.check({ key: 'resource/set/l.set', text: '(include "/set/ide_fx_nowhere.inc")\n{x ("m")}\n' }, {});
  eq(lone.length, 0, 'check(): lone buffer drops INCLUDE_MISSING and MACRO_UNDEFINED');
  const folderOnly = C.check({ key: 'resource/set/l.set', text: '(include "/set/ide_fx_nowhere.inc")\n{x ("m")}\n' }, { folder: MOD });
  eq(folderOnly.length, 0, 'check(): folder without a game cannot confirm: both dropped');
}

// ---- define index builds in slices: the event loop keeps turning while it builds (game index, GUI-style ictx.vfs)
if (hasGame) {
  const v = require('../../lib/vfs').build({ gameDir: GAME, mods: [], disableVersionControl: true });
  const ictx = { gameDir: GAME, mods: [], folder: scratch, vfs: v };
  let last = Date.now(), gap = 0, ticks = 0;
  const iv = setInterval(() => { const t = Date.now(); gap = Math.max(gap, t - last); last = t; ticks++; }, 2);
  const t1 = Date.now(), p = F.warm(ictx);
  const syncMs = Date.now() - t1;
  ok(!F.ready(ictx), 'warm returns before the index is built');
  try { await p; } finally { clearInterval(iv); }   // a warm that fails must not leave the 2 ms timer holding the process open
  const total = Date.now() - t1;
  ok(F.ready(ictx), 'game define index ready');
  ok(syncMs < 300, 'warm sync part ' + syncMs + ' ms');
  ok(gap < 300, 'longest event-loop stall while building ' + gap + ' ms (' + ticks + ' ticks, total ' + total + ' ms)');
  console.log('define index: game build ' + total + ' ms, sync start ' + syncMs + ' ms, longest stall ' + gap + ' ms');
}

console.log(n + ' checks, ' + bad + ' failed, fixers ' + ms + ' ms' + (hasGame ? ' (game index + define scan included)' : ''));
console.log(bad ? 'FAIL' : 'PASS');
process.exitCode = bad ? 1 : 0;
})().catch(e => { console.log('FAIL threw ' + (e && e.stack || e)); console.log('FAIL'); process.exitCode = 1; });
