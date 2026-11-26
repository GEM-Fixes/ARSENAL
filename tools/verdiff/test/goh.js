// verdiff on made-up GoH installs: sub-folder paks keyed by folder (PORT-34), localizations/Default.pak walked (GHLOC-01), key level on
// a def inside a sub-pak, "games differ" line for a GoH vs AS2 pair, AS2 dirs keep resource/ only. node goh.js <work dir>
// Author: Imperator_Aug (ARSENAL, ia-e5c5b861)
const fs = require('fs'), path = require('path');
const { run } = require('../verdiff'), { writeZip } = require('../../lib/zipwrite');
const w = process.argv[2];
let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const mk = (dir, files) => {
  fs.mkdirSync(path.join(dir, 'binaries', 'x64'), { recursive: true }); fs.writeFileSync(path.join(dir, 'binaries', 'x64', 'call_to_arms.exe'), 'MZ');
  for (const [rel, list] of Object.entries(files)) {
    const p = path.join(dir, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true });
    if (/\.pak$/.test(rel)) writeZip(p, Object.entries(list).map(([n, s]) => [n, Buffer.from(s)])); else fs.writeFileSync(p, list);
  }
};
const def = keys => '{rifle\r\n' + keys.map((k, i) => `\t{${k} ${i + 1}}\r\n`).join('') + '}\r\n';
const A = path.join(w, 'goh_a'), B = path.join(w, 'goh_b'), C = path.join(w, 'as2');
mk(A, {
  'resource/entity/x.pak': { 'x/a.def': def(['aa', 'bb', 'cc']), 'x/same.def': def(['s']) },
  'resource/sound/folder.set': '{sound}\r\n',
  'localizations/Default.pak': { 'default/interface/text/t.pot': 'msgid "a"\r\nmsgstr "A"\r\n' },
});
mk(B, {
  'resource/entity/x.pak': { 'x/a.def': def(['aa', 'bb', 'dd', 'ee']), 'x/same.def': def(['s']), 'x/new.def': def(['n']) },
  'resource/sound/folder.set': '{sound}\r\n',
  'localizations/Default.pak': { 'default/interface/text/t.pot': 'msgid "a"\r\nmsgstr "B"\r\n' },
});
const o = run(A, B, { top: 5, hi: 0.8, lo: 0.5 });
const ch = o.file && o.file.changed;
ok(ch === 2, 'changed 2 (def in sub-pak + pot): ' + JSON.stringify(o.file));
ok(o.file.added === 1 && o.file.removed === 0, 'added entity/x/new.def only: ' + JSON.stringify(o.file));
ok(o.added.includes('entity/x/new.def'), 'sub-pak key is entity/x/..: ' + o.added);
ok(o.file.byTop.changed.localizations === 1 && o.file.byTop.changed.entity === 1, 'by top: ' + JSON.stringify(o.file.byTop.changed));
ok(o.keys && o.keys.def && o.keys.def.added === 2 && o.keys.def.removed === 1, 'key level in a GoH sub-pak: ' + JSON.stringify(o.keys));
ok(!o.lines.some(l => /games differ/.test(l)), 'two GoH dirs: no games-differ line');
// an AS2-shaped dir (no call_to_arms.exe) with a localizations folder: not walked, and the pair says games differ
fs.mkdirSync(path.join(C, 'resource', 'sound'), { recursive: true }); fs.writeFileSync(path.join(C, 'resource', 'sound', 'folder.set'), '{sound}\r\n');
fs.mkdirSync(path.join(C, 'localizations'), { recursive: true }); fs.writeFileSync(path.join(C, 'localizations', 'x.txt'), 'x');
const m = run(C, B, { top: 5, hi: 0.8, lo: 0.5 });
ok(m.lines.some(l => /^games differ: one input is a GoH install/.test(l)), 'games differ line');
ok(!m.removed.some(n => n.startsWith('localizations/')), 'AS2 dir: localizations/ not walked');
// games differ: file level only, no renames, no key level (the GUI route's 600 s timeout must see the line)
ok(m.file.added > 0 && m.renames.length === 0 && m.maybes.length === 0 && !m.keys && m.keyLevel === 'files only (games differ)', 'games differ stops after file level: ' + m.keyLevel);
ok(m.lines.some(l => /renames and key level: skipped \(games differ\)/.test(l)), 'skip line');
// games differ + --rules-out: no draft rows (cross-game removals are not upgrade rules), plain line, file not written
const rf = path.join(w, 'rules.json');
const r = require('../../lib/test/wait').spawnSync(process.execPath, [path.join(__dirname, '..', 'verdiff.js'), C, B, '--rules-out', rf, '-q'], { encoding: 'utf8' });
ok(r.status === 0, 'games differ --rules-out exit 0: ' + r.status + ' ' + r.stderr);
ok(/no draft rules: the inputs are two games, not two releases/.test(r.stdout), 'no-draft-rules line: ' + r.stdout);
ok(!fs.existsSync(rf), 'games differ: rules file not written');
// two GoH releases still draft rows
const rf2 = path.join(w, 'rules2.json');
const r2 = require('../../lib/test/wait').spawnSync(process.execPath, [path.join(__dirname, '..', 'verdiff.js'), A, B, '--rules-out', rf2, '-q'], { encoding: 'utf8' });
ok(r2.status === 0 && fs.existsSync(rf2) && /draft rows ->/.test(r2.stdout), 'two GoH dirs: rules file written: ' + r2.stdout + r2.stderr);
console.log(bad ? 'goh FAIL' : 'goh PASS');
process.exit(bad ? 1 : 0);
