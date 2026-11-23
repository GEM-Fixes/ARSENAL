// lnglint (include "p") expansion (LOC-21, lib/lnginc): seeded split mod built in a temp dir (odd bytes need a writer).
// seeded, one per line (rel:line CODE):
//   localization/desc.lng:8            LNG_INCLUDE_MISSING   include "desc/none.inc" has no file
//   localization/desc/loop.inc:2       LNG_INCLUDE_CYCLE     loop.inc includes itself
//   localization/desc/p4.inc:2         DUP_KEY               desc/grp/q in p2.inc and p4.inc (two parts, other text)
//   localization/desc/p3.inc:2         TAG_UNCLOSED          p3.inc is included twice: reported once
//   localization/desc/p3.inc:3         ENC_UTF8              cp1251 byte in a part
// info: LNG_INC_UNUSED once for parked/ (2 files); no WARN_BARE for include lines; no NO_TAGS for parts
// --game test/vc/game: desc/c param mismatch named at p1.inc:4, shadow drops 1 of 5 (desc/e) at desc.lng:1, 2 overrides at p1.inc:2
// Author: Imperator_Aug (ARSENAL, ia-f63c1049)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const W = fs.mkdtempSync(path.join(process.env.TEST_WORK || os.tmpdir(), 'lnginc-'));
const L = path.join(W, 'mod', 'localization');
const put = (rel, s) => { const f = path.join(L, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.isBuffer(s) ? s : Buffer.from(s.replace(/\r?\n/g, '\r\n'), 'utf8')); };
put('desc.lng', `{tags
\t(include "desc/p1.inc")
\t{"grp"
\t\t(include "desc/p2.inc")
\t\t(include "desc/p4.inc")
\t}
\t{"g1" (include "desc/p3.inc")} {"g2" (include "desc/p3.inc")}
\t(include "desc/none.inc")
\t(include "desc/loop.inc")
}
`);
put('desc/p1.inc', `; part 1
{"a" "changed text"}
{"b" "dropped one"}
{"c" "Hit %s"}
{"d" "same"}
`);
put('desc/p2.inc', `; part 2
{"q" "first"}
`);
put('desc/p4.inc', `; part 4
{"q" "second"}
`);
put('desc/p3.inc', Buffer.concat([Buffer.from('; part 3\r\n{"z" "<c(ff0000)red"}\r\n{"w" "caf'), Buffer.from([0xe9]), Buffer.from('"}\r\n')]));
put('desc/loop.inc', `; loops
(include "loop.inc")
`);
put('parked/old.inc', `{"o" "old"}\n`);
put('parked/old2.inc', `{"o2" "old"}\n`);

const lint = (...a) => cp.execFileSync(process.execPath, [path.join(__dirname, '..', 'lnglint.js'), path.join(W, 'mod'), ...a], { encoding: 'utf8' });
const fail = m => { console.log('FAIL inc: ' + m); process.exitCode = 1; };
const o = lint();
const got = o.split('\n').filter(l => /^[^ ]+:\d+: [A-Z_]+/.test(l)).map(l => l.replace(/^([^ ]+:\d+): ([A-Z_0-9]+).*/, '$1 $2')).sort();
const want = ['localization/desc.lng:8 LNG_INCLUDE_MISSING', 'localization/desc/loop.inc:2 LNG_INCLUDE_CYCLE', 'localization/desc/p4.inc:2 DUP_KEY',
  'localization/desc/p3.inc:2 TAG_UNCLOSED', 'localization/desc/p3.inc:3 ENC_UTF8'].sort();
if (got.join('|') !== want.join('|')) fail('findings\n got  ' + got.join('\n      ') + '\n want ' + want.join('\n      '));
if (!/p4\.inc:2: DUP_KEY "desc\/grp\/q" duplicates localization\/desc\/p2\.inc:2/.test(o)) fail('DUP_KEY does not name the other part');
if ((o.match(/LNG_INC_UNUSED/g) || []).length !== 1 || !/LNG_INC_UNUSED 2 \.inc file/.test(o)) fail('LNG_INC_UNUSED not once for parked/ (2 files)');
if (/WARN_BARE|NO_TAGS/.test(o)) fail('WARN_BARE/NO_TAGS on include lines or parts');
if (!/^5 findings/m.test(o)) fail('total not 5');
const g = lint('--game', path.join(__dirname, 'vc', 'game'));
if (!/localization\/desc\/p1\.inc:4: WARN_LNG_PARAM_MISMATCH "desc\/c"/.test(g)) fail('param mismatch not named at the part line');
if (!/localization\/desc\.lng:1: WARN_LNG_FILE_SHADOWS_VANILLA .*drops 1 of 5.*: desc\/e$/m.test(g)) fail('shadow check not on the expanded key set');
if (!/localization\/desc\/p1\.inc:2: LNG_OVERRIDES_VANILLA 2 key/.test(g)) fail('override count/location');
if (!/^7 findings/m.test(g)) fail('--game total not 7');
fs.rmSync(W, { recursive: true, force: true });
if (!process.exitCode) console.log('inc ok');
