// seeded GoH case (GOHMOD-3): .pot loose + .po inside localizations/<lang>.pak. lax forms vanilla GoH ships are info only
// Author: Imperator_Aug (ARSENAL, ia-98bef48c)
const fs = require('fs'), path = require('path'), os = require('os'), lnglint = require('../lnglint'), { zip } = require('../../lib/zipwrite');
let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const w = fs.mkdtempSync(path.join(os.tmpdir(), 'lnglint-po-'));
try {
  const put = (f, s) => { fs.mkdirSync(path.dirname(path.join(w, f)), { recursive: true }); fs.writeFileSync(path.join(w, f), s); };
  const hdr = 'msgid ""\nmsgstr ""\n"Language: en\\n"\n\n';
  // vanilla forms: ';' comment, raw newline in a string, bare msgstr, text after a quote, msgid twice, <f(x)<c(..)> -> 0 findings
  put('lax/localizations/default/interface/text/a.pot', hdr + '; ---- head ----\nmsgctxt "a/one"\nmsgid "line one\nline two"\nmsgstr ""\n\nmsgctxt "a/two"\nmsgid "x"\nmsgstr \n\nmsgctxt "a/three"\nmsgid "y"\nmsgstr ""4\n\nmsgctxt "a/four"\nmsgid ""\nmsgid ""\n"z"\nmsgstr ""\n\nmsgctxt "a/five"\nmsgid "<f(mono)<c(25 25 25)>lvl %1%"\nmsgstr ""\n');
  // pak mod: mixed script, no msgstr, duplicate key with other text, stray '<'
  fs.mkdirSync(path.join(w, 'mod/localizations'), { recursive: true });
  fs.writeFileSync(path.join(w, 'mod/localizations/ru.pak'), zip([['ru/interface/text/b.po', Buffer.from(hdr + 'msgctxt "b/mix"\nmsgid "a"\nmsgstr "veteranское"\n\nmsgctxt "b/nostr"\nmsgid "a"\n\nmsgctxt "b/dup"\nmsgid "a"\nmsgstr "one"\n\nmsgctxt "b/dup"\nmsgid "a"\nmsgstr "two"\n\nmsgctxt "b/tag"\nmsgid "<c(c3baae)Scout</c>"\nmsgstr ""\n')]]));
  const list = r => { const j = r.toJSON({ tool: 'lnglint' }); return { f: j.findings, i: j.info }; };
  let r = list(lnglint.run({ folder: path.join(w, 'lax') }));
  ok(r.f.length === 0, 'lax forms give 0 findings: ' + JSON.stringify(r.f));
  ok(r.i.filter(x => x.code === 'PO_LAX').length === 5 && r.i.some(x => x.code === 'PO_TAG_NO_GT'), 'lax forms are info: ' + JSON.stringify(r.i.map(x => x.code + ' ' + x.msg)));
  r = list(lnglint.run({ folder: path.join(w, 'mod') }));
  const got = r.f.map(x => x.code + ':' + x.line).sort().join(' ');
  ok(got === 'DUP_KEY:16 MIXED_SCRIPT:7 PO_NO_MSGSTR:9 TAG_STRAY:21', 'pak .po findings: ' + got);
  ok(r.f.every(x => String(x.file).replace(/\\/g, '/') === 'localizations/ru.pak!ru/interface/text/b.po'), 'file names the pak entry: ' + JSON.stringify(r.f.map(x => x.file)));
  // GHLOC-06: no msgctxt / fuzzy entry = no text in GoH. A fuzzy header (msgid "" with no msgctxt, vanilla form, GHLOC-11) is no finding
  put('ctx/localizations/default/interface/text/c.pot', '#, fuzzy\n' + hdr + 'msgctxt "c/ok"\nmsgid "fine"\nmsgstr ""\n\nmsgid "no context"\nmsgstr ""\n\n#: c.pot:9\n#, fuzzy, c-format\nmsgctxt "c/fz"\nmsgid "%s"\nmsgstr ""\n\nmsgctxt "c/ok2"\nmsgid "fine too"\nmsgstr ""\n');
  r = list(lnglint.run({ folder: path.join(w, 'ctx') }));
  const g2 = r.f.map(x => x.code + ':' + x.line).sort().join(' ');
  ok(g2 === 'PO_FUZZY:14 PO_NO_CTXT:10', 'no msgctxt and fuzzy entries: ' + g2);
  const pe = lnglint.poEntries(fs.readFileSync(path.join(w, 'ctx/localizations/default/interface/text/c.pot')));
  ok(pe.map(e => e.ctx + '=' + e.text).join('|') === 'c/ok=fine|c/ok2=fine too', 'poEntries keeps only entries GoH shows: ' + JSON.stringify(pe));
} finally { fs.rmSync(w, { recursive: true, force: true }); }
if (!bad) console.log('po ok');
process.exit(bad ? 1 : 0);
