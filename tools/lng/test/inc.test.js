// lng extract/merge over a .lng with (include "p") lines (LOC-21, lib/lnginc): a split mod, parent + .inc parts, in a temp dir.
// seeded: desc/grp/q in p2.inc and p4.inc (a duplicate across two parts -> LNG_DUP_KEY at p4.inc:1); include "desc/none.inc" with no
//   file (LNG_INCLUDE_MISSING desc.lng:7). extract: part keys carry the part as the file column; merge: edits land in the part
//   (and in the root for a key that sits after an include on the same line), every other byte equal, untouched files not written.
// Author: Imperator_Aug (ARSENAL, ia-348cb7a6)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const W = fs.mkdtempSync(path.join(process.env.TEST_WORK || os.tmpdir(), 'lnginc-'));
const M = path.join(W, 'mod'), L = path.join(M, 'localization');
const put = (rel, s) => { const f = path.join(L, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s.replace(/\r?\n/g, '\r\n'), 'utf8'); };
fs.mkdirSync(M, { recursive: true }); fs.writeFileSync(path.join(M, 'mod.info'), '{name "inc"}\r\n');
put('desc.lng', `{tags
\t{"in" "inline"} (include "desc/p1.inc") {"after" "same line"}
\t{"grp"
\t\t(include "desc/p2.inc")
\t\t(include "desc/p4.inc")
\t}
\t(include "desc/none.inc")
}
`);
put('desc/p1.inc', `; part 1
{"a" "Alpha"} {"b" "Beta %s"}
{"c" "Жук"}
`);
put('desc/p2.inc', `{"q" "first"}\n`);
put('desc/p4.inc', `{"q" "second"}\n`);

const lng = (...a) => cp.execFileSync(process.execPath, [path.join(__dirname, '..', 'lng.js'), ...a], { encoding: 'utf8' });
let bad = 0; const fail = m => { console.log('FAIL inc: ' + m); bad++; };
const ex = lng('extract', M, '--out', path.join(W, 'a.tsv'));
const codes = ex.split('\n').filter(l => /^[^ ]+:\d+: [A-Z_]+/.test(l)).map(l => l.replace(/^([^ ]+:\d+): ([A-Z_]+).*/, '$1 $2')).sort().join('|');
if (codes !== 'localization/desc.lng:7 LNG_INCLUDE_MISSING|localization/desc/p4.inc:1 LNG_DUP_KEY') fail('extract findings: ' + codes);
const tsv = fs.readFileSync(path.join(W, 'a.tsv'), 'utf8').split('\n').filter(Boolean).slice(1).map(l => l.split('\t'));
const rows = tsv.map(c => c[0] + ' ' + c[1]).join('|');
const wantRows = ['localization/desc.lng desc/in', 'localization/desc/p1.inc desc/a', 'localization/desc/p1.inc desc/b', 'localization/desc/p1.inc desc/c',
  'localization/desc.lng desc/after', 'localization/desc/p2.inc desc/grp/q', 'localization/desc/p4.inc desc/grp/q'].join('|');
if (rows !== wantRows) fail('extract rows\n got  ' + rows + '\n want ' + wantRows);
// edits: b in p1 (second key on a line), after in the root (after an include on the same line), q in p4
const ed = { 'desc/b': 'Beta neu %s', 'desc/after': 'gleiche Zeile' };
const out = ['file\tkey\tsource\ttranslation\tcontext', ...tsv.map(c => { if (ed[c[1]]) c[3] = ed[c[1]]; if (c[0].endsWith('p4.inc')) c[3] = 'zweite'; return c.join('\t'); })];
fs.writeFileSync(path.join(W, 'b.tsv'), out.join('\n') + '\n');
const O = path.join(W, 'o');
const mg = lng('merge', M, path.join(W, 'b.tsv'), '--out', O);
if (!/3 rows applied, 3 files written/.test(mg)) fail('merge summary: ' + mg.split('\n').filter(l => /LNG_MERGED/.test(l)).join(''));
const diff = (rel, want) => {
  const a = fs.readFileSync(path.join(L, rel), 'utf8').split('\r\n'), f = path.join(O, 'localization', rel);
  if (!fs.existsSync(f)) return fail(rel + ' not written');
  const b = fs.readFileSync(f, 'utf8').split('\r\n');
  const d = a.map((l, i) => (l === b[i] ? null : b[i])).filter(x => x !== null);
  if (a.length !== b.length || d.join('|') !== want) fail(rel + ' changed lines: ' + d.join('|') + ' want ' + want);
};
diff('desc/p1.inc', '{"a" "Alpha"} {"b" "Beta neu %s"}');
diff('desc.lng', '\t{"in" "inline"} (include "desc/p1.inc") {"after" "gleiche Zeile"}');
diff('desc/p4.inc', '{"q" "zweite"}');
if (fs.existsSync(path.join(O, 'localization', 'desc', 'p2.inc'))) fail('p2.inc written with no edit');
// round trip with no edits: every listed file byte-equal
lng('merge', M, path.join(W, 'a.tsv'), '--out', path.join(W, 'rt'), '--all');
for (const rel of ['desc.lng', 'desc/p1.inc', 'desc/p2.inc', 'desc/p4.inc'])
  if (!fs.readFileSync(path.join(L, rel)).equals(fs.readFileSync(path.join(W, 'rt', 'localization', rel)))) fail('round trip differs ' + rel);
fs.rmSync(W, { recursive: true, force: true });
if (!bad) console.log('inc ok');
