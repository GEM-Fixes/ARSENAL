// made-up GoH vanilla compare (GHLOC-01, GHLOC-06): fixture GoH install with localizations/default/interface/text/desc/a.pot,
// a mod with a default .pot (replaces the vanilla file) and a ru translation in localizations/ru.pak. Also the CLI: --exe goh is taken.
// Author: Imperator_Aug (ARSENAL, ia-c1a7e2b4)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const lnglint = require('../lnglint'), { zip } = require('../../lib/zipwrite');
let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const w = fs.mkdtempSync(path.join(os.tmpdir(), 'lnglint-vcgoh-'));
try {
  const put = (f, s) => { fs.mkdirSync(path.dirname(path.join(w, f)), { recursive: true }); fs.writeFileSync(path.join(w, f), s); };
  const hdr = '#, fuzzy\nmsgid ""\nmsgstr ""\n"Language: en\\n"\n\n';
  const ent = (k, t) => 'msgctxt "' + k + '"\nmsgid "' + t + '"\nmsgstr ""\n\n';
  // vanilla: 3 keys GoH shows; a fuzzy one and one without msgctxt give no text, so they are not in the base set
  put('game/localizations/default/interface/text/desc/a.pot', hdr + ent('desc/a/one', 'One %1%') + ent('desc/a/two', 'Two') + ent('desc/a/three', 'Three')
    + '#, fuzzy\n' + ent('desc/a/fz', 'Fuzzy') + 'msgid "loose"\nmsgstr ""\n');
  // mod default .pot: one placeholder changed (%1% -> %s), two same, three dropped, fz and new are new keys
  put('mod/localizations/default/interface/text/desc/a.pot', hdr + ent('desc/a/one', 'Uno %s') + ent('desc/a/two', 'Two') + ent('desc/a/fz', 'F') + ent('desc/a/new', 'N'));
  // ru translation in a pak: other text is normal (no override list), one placeholder added, one new key; no shadow check
  fs.mkdirSync(path.join(w, 'mod/localizations'), { recursive: true });
  fs.writeFileSync(path.join(w, 'mod/localizations/ru.pak'), zip([['ru/interface/text/desc/a.po', Buffer.from(hdr + ent('desc/a/one', 'Odin %1%') + ent('desc/a/two', 'Dva %d') + ent('desc/a/zz', 'Z'))]]));
  const game = path.join(w, 'game'), modd = path.join(w, 'mod');
  const j = lnglint.run({ folder: modd, gameDir: game, exe: 'goh' }).toJSON({ tool: 'lnglint' });
  const fl = x => String(x.file).replace(/\\/g, '/').replace(/^.*?(localizations\/)/, '$1');
  const got = j.findings.map(x => x.code + '@' + fl(x)).sort().join(' ');
  ok(got === 'WARN_LNG_FILE_SHADOWS_VANILLA@localizations/default/interface/text/desc/a.pot WARN_LNG_PARAM_MISMATCH@localizations/default/interface/text/desc/a.pot WARN_LNG_PARAM_MISMATCH@localizations/ru.pak!ru/interface/text/desc/a.po', 'goh findings: ' + got);
  const sh = j.findings.find(x => x.code === 'WARN_LNG_FILE_SHADOWS_VANILLA');
  ok(sh && /drops 1 of 3 vanilla key\(s\): desc\/a\/three$/.test(sh.msg), 'base set = 3 shown keys, three dropped: ' + (sh && sh.msg));
  const pm = j.findings.find(x => x.code === 'WARN_LNG_PARAM_MISMATCH' && /default/.test(x.file));
  ok(pm && /\[%s\] differ from vanilla \[%1%\]/.test(pm.msg), 'boost %1% counts as a placeholder on GoH: ' + (pm && pm.msg));
  const inf = j.info.map(x => x.code + '@' + (/ru\.pak/.test(x.file) ? 'ru' : 'def') + ':' + x.msg.split(' ')[0]).sort().join(' ');
  ok(inf === 'LNG_KEY_NEW@def:2 LNG_KEY_NEW@ru:1 LNG_OVERRIDES_VANILLA@def:1', 'goh info: ' + inf);
  // CLI: --exe goh accepted (before: '--exe must be as64 or mowas_2'), same 3 findings
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'lnglint.js'), modd, '--game', game, '--exe', 'goh', '--no-rc', '--format', 'json'], { encoding: 'utf8' });
  let cj = null; try { cj = JSON.parse(r.stdout); } catch (e) { /* below */ }
  ok(cj && cj.findings.length === 3, 'cli --exe goh: 3 findings, got ' + (cj ? cj.findings.length : r.stderr || r.stdout));
  // a mod default text in localizations/default.pak (the form vanilla ships) is default text, not a translation:
  // shadow check and override list apply as for the loose file (before: lang read as 'default.pak!default', no findings)
  fs.mkdirSync(path.join(w, 'mod2/localizations'), { recursive: true });
  fs.writeFileSync(path.join(w, 'mod2/localizations/default.pak'), zip([['default/interface/text/desc/a.pot', Buffer.from(hdr + ent('desc/a/one', 'Uno %1%') + ent('desc/a/two', 'Two'))]]));
  const j2 = lnglint.run({ folder: path.join(w, 'mod2'), gameDir: game, exe: 'goh' }).toJSON({ tool: 'lnglint' });
  const got2 = j2.findings.map(x => x.code + '@' + fl(x)).sort().join(' ');
  ok(got2 === 'WARN_LNG_FILE_SHADOWS_VANILLA@localizations/default.pak!default/interface/text/desc/a.pot', 'default.pak findings: ' + got2);
  const sh2 = j2.findings.find(x => x.code === 'WARN_LNG_FILE_SHADOWS_VANILLA');
  ok(sh2 && /drops 1 of 3 vanilla key\(s\): desc\/a\/three$/.test(sh2.msg), 'default.pak drops three: ' + (sh2 && sh2.msg));
  ok(j2.info.map(x => x.code).join(' ') === 'LNG_OVERRIDES_VANILLA', 'default.pak info: ' + j2.info.map(x => x.code + ' ' + x.msg).join('; '));
  const rb = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'lnglint.js'), modd, '--exe', 'gog'], { encoding: 'utf8' });
  ok(rb.status === 2 && /--exe must be one of/.test(rb.stderr), 'bad --exe exit 2: ' + rb.status + ' ' + rb.stderr);
} finally { fs.rmSync(w, { recursive: true, force: true }); }
if (!bad) console.log('vcgoh ok');
process.exit(bad ? 1 : 0);
