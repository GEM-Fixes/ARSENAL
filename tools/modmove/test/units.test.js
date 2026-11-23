// seeded unit cases for static.js internals, no game, no child process.
//   rows 58+165: exeKeys leaf rule (a bare {leaf} named like a file stem is a data value, not a key)
//   row 160: MOVE_INCLUDE_RENAME compares the resolved include path, not only the file name
//   row 78: sdllint output -> macro hits (undefined call in a root = must, in a fragment = likely)
// Author: Imperator_Aug (ARSENAL, ia-f3deb98b)
const fs = require('fs'), path = require('path'), os = require('os');
const S = require('../lib/static');
let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const w = fs.mkdtempSync(path.join(os.tmpdir(), 'modmove-units-'));
const put = (rel, text) => { const p = path.join(w, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
const exe = (name, strs) => { const p = path.join(w, name); fs.writeFileSync(p, Buffer.from(strs.map(s => s + '\0').join('') + 'pad-' + name)); return p; };
try {
  // ---- exeKeys: source exe knows 5 names the destination exe lacks
  const sx = exe('src.exe', ['is2', 'puddle', 'barbwire', 'gunkey', 'shared', 'leafonly']);
  const dx = exe('dst.exe', ['shared', 'other_thing']);
  put('m/set/a.def', [
    '{shared 1}',
    '{gunkey 2}',                                  // key with a value, not a stem: flagged
    '{is2 5}',                                     // has a value: a key, flagged even though is2 is a stem
    '{texture_list {is2} {puddle} {barbwire}}',    // bare leaves named like files: data, not flagged (row 58)
    '{leafonly}',                                  // bare leaf, no file of that stem: flagged (row 165)
    '{holder {leafonly {inner 1}}}',               // same name with kids: a key, flagged
  ].join('\r\n') + '\r\n');
  const res = ['resource/entity/is2.def', 'resource/texture/puddle.dds', 'resource/x/barbwire.mdl'];
  const F = [], I = [];
  S.exeKeys(path.join(w, 'm'), ['set/a.def'], sx, dx, 'goh', 'as64', (file, line, code, msg) => F.push({ file, line, code, msg }), (c, m) => I.push(c), 20, res);
  const names = F.filter(f => f.code === 'WARN_MOVE_KEY_NOT_IN_DEST_EXE').map(f => /key \{([^}]+)\} \(x(\d+)\)/.exec(f.msg).slice(1).join(':'));
  ok(names.includes('gunkey:1'), 'gunkey must be flagged: ' + names);
  ok(names.includes('is2:1'), 'is2 with a value is a key (x1: the bare {is2} leaf is not counted): ' + names);
  ok(!names.some(n => /^(puddle|barbwire):/.test(n)), 'bare leaves named like files must not be flagged: ' + names);
  ok(names.includes('leafonly:2'), 'leaf with no file stem counts like a key, both uses: ' + names);
  ok(!names.some(n => /^shared:/.test(n)), 'name both exes have must not be flagged: ' + names);
  ok(!I.includes('MOVE_OK_EXE_KEYS'), 'must not read clean');
  // the same text with no stems given: the bare leaves are keys again (proves the stems list is what suppresses them)
  const F2 = [];
  S.exeKeys(path.join(w, 'm'), ['set/a.def'], sx, dx, 'goh', 'as64', (file, line, code, msg) => F2.push(msg), () => {}, 20, []);
  ok(F2.some(m => m.includes('{puddle}')) && F2.some(m => m.includes('{barbwire}')), 'no stems: bare leaves flagged');

  // ---- dataRules: mowas2 -> goh, rule name resupply_generic.inc
  const inc = '{include "/properties/resupply_generic.inc"}\r\n';
  put('d/resource/entity/a.def', inc);                                    // 1: dangling
  put('d/resource/entity/b.def', inc);                                    // 2: mod ships that exact path
  put('d/resource/properties/resupply_generic.inc', '{x}\r\n');           //    (b.def and a.def both see it, see below)
  const run = (files, exist) => { const F = []; S.dataRules(path.join(w, 'd'), files, files.map(f => f.toLowerCase()), (file, line, code) => F.push(file + ':' + code), 'goh', exist); return F; };
  const both = ['resource/entity/a.def', 'resource/entity/b.def', 'resource/properties/resupply_generic.inc'];
  ok(run(both).length === 0, 'mod ships the exact path: no finding: ' + run(both));
  fs.rmSync(path.join(w, 'd/resource/properties'), { recursive: true });
  const two = ['resource/entity/a.def', 'resource/entity/b.def'];
  ok(run(two).length === 2 && run(two).every(x => x.endsWith('MOVE_INCLUDE_RENAME')), 'dangling include flagged in both: ' + run(two));
  // row 160: a same-named file in ANOTHER folder must not hide the dangling include
  put('d/resource/other/resupply_generic.inc', '{x}\r\n');
  const three = [...two, 'resource/other/resupply_generic.inc'];
  ok(run(three).length === 2, 'same name in another folder still dangles: ' + run(three));
  // a relative include that resolves to that other file is fine
  put('d/resource/entity/c.def', '{include "../other/resupply_generic.inc"}\r\n');
  ok(run([...three, 'resource/entity/c.def']).length === 2, 'relative include resolving to the shipped file: no extra finding');
  // target vanilla holds the exact path
  ok(run(two, k => k === 'properties/resupply_generic.inc').length === 0, 'target vanilla has the path: no finding');
  // the old suffix match would flag "x_resupply_generic.inc"; the name is different, so it must not
  put('d/resource/entity/e.def', '{include "/properties/x_resupply_generic.inc"}\r\n');
  ok(run(['resource/entity/e.def']).length === 0, 'different file name is not the rule name');

  // ---- macroHits
  const out = [
    'resource/entity/x.def:12: MACRO_UNDEFINED define not found: "gun_x" (defines are per top-level file)',
    'info: resource/set/p.inc:3: SDL_FRAGMENT_MACRO call of "ai_x" has no define in the chain',
    'resource/entity/y.def:4: SYNTAX unexpected token',
    'info: resource/entity/z.def:9: MACRO_UNDEFINED demoted',
  ].join('\n');
  const hits = S.macroHits(out);
  ok(hits.length === 2 && hits[0].code === 'MACRO_UNDEFINED' && hits[0].line === 12 && hits[1].code === 'SDL_FRAGMENT_MACRO', 'macroHits: ' + JSON.stringify(hits));
} finally { fs.rmSync(w, { recursive: true, force: true }); }
if (!bad) console.log('units ok');
process.exit(bad ? 1 : 0);
