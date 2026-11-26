// check-false test: on mkfalse.js's mod the ONLY crash row is the seeded real one (missing include
// a used unit); orphan / selector-only units list under REVIEW with the note; never-loaded files, {##, %param fragments give no crash row.
// gate.js unit cases: cross-tool same line, override pairs, repeats, include follow-ons, the cap, no reach = no gate. run from tools/check/test.
// Author: Imperator_Aug (ARSENAL, ia-cec2507b)
const fs = require('fs'), path = require('path'), cp = require('child_process'), gate = require('../gate');
const here = __dirname, FL = path.join(here, 'fl'), G = path.join(FL, 'game'), CHECK = path.join(here, '..', 'check.js');
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };

// ---- gate.js units
{
  const S = (file, line, msg = '') => ({ file, line, msg });
  const reach = { defs: { 'resource/entity/o/o.def': 'ORPHAN', 'resource/entity/r/r.def': 'REACHABLE' }, unrefFiles: ['resource/entity/r/x.ply'] };
  const rows = [
    { tool: 'sdllint', code: 'INCLUDE_MISSING', n: 1, sev: 'crash', samples: [S('resource/map/a/0.mi', 2)] },
    { tool: 'milint', code: 'INCLUDE_MISSING', n: 1, sev: 'crash', samples: [S('resource/map/a/0.mi', 2)] },
    { tool: 'sdllint', code: 'MACRO_UNDEFINED', n: 2, sev: 'crash', samples: [S('resource/map/a/0.mi', 3), S('resource/entity/o/o.def', 1)] },
    { tool: 'strlint', code: 'STR_MACRO_UNDEFINED', n: 1, sev: 'crash', samples: [S('resource/entity/r/r.def', 4)] },
    { tool: 'sdllint', code: 'MACRO_UNDEFINED', n: 1, sev: 'crash', samples: [S('resource/entity/r/r.def', 4)] },
    { tool: 'sdllint', code: 'TAG_SWALLOWS', n: 1, sev: 'crash', samples: [S('resource/entity/r/r.def', 9)] },
    { tool: 'refcheck', code: 'DISABLED_ON', n: 1, sev: 'review', samples: [S('resource/entity/r/r.def', 9)] },
    { tool: 'binhdr', code: 'PLY_MTL_MISSING', n: 3, sev: 'crash', samples: [S('resource/entity/r/y.ply', null, 'a.mtl'), S('resource/entity/r/y.ply', null, 'b.mtl'), S('resource/entity/r/x.ply', null, 'c.mtl')] },
    { tool: 'sdllint', code: 'INCLUDE_MISSING', n: 1, sev: 'crash', samples: [S('resource.pak!texture/t/s.def', 1)] },
    { tool: 'sdllint', code: 'MACRO_UNDEFINED', n: 1, sev: 'crash', samples: [S('resource/entity/r/k.inc', 2, 'define not found [via resource/entity/o/o.def:5]')] },
    { tool: 'uilint', code: 'FONT_MAIN10_MISSING', n: 4, sev: 'crash', samples: [S('interface/font', null)] },
  ];
  const r = gate.apply(JSON.parse(JSON.stringify(rows)), { reach, cap: 50 });
  const row = (code, tool, sev) => r.rows.find(x => x.code === code && (!tool || x.tool === tool) && (!sev || x.sev === sev));
  const inc = row('INCLUDE_MISSING', 'sdllint', 'crash');
  ok(inc && inc.n === 1 && inc.samples[0].also.includes('milint') && !row('INCLUDE_MISSING', 'milint'), 'same code two tools: one row, milint in also ' + JSON.stringify(r.rows));
  ok(inc && /\+1 macro from the missing include/.test(inc.samples[0].note || ''), 'macro after a missing include folds: ' + JSON.stringify(inc));
  const mu = row('MACRO_UNDEFINED', 'sdllint', 'crash');
  ok(mu && mu.n === 1 && mu.samples[0].file === 'resource/entity/r/r.def' && mu.samples[0].also.some(a => /STR_MACRO_UNDEFINED/.test(a)) && !row('STR_MACRO_UNDEFINED'), 'MACRO_UNDEFINED beats STR_MACRO_UNDEFINED: ' + JSON.stringify(r.rows));
  ok(!row('TAG_SWALLOWS') && row('DISABLED_ON') && row('DISABLED_ON').samples[0].also.some(a => /TAG_SWALLOWS/.test(a)), 'DISABLED_ON beats TAG_SWALLOWS');
  const og = r.rows.find(x => x.code === 'MACRO_UNDEFINED' && x.gated);
  ok(og && og.sev === 'review' && og.n === 2 && og.samples.every(s => s.note === gate.ORPHAN_NOTE), 'orphan def + include reached via orphan root gated: ' + JSON.stringify(og));
  const pm = row('PLY_MTL_MISSING', 'binhdr', 'crash'), pg = r.rows.find(x => x.code === 'PLY_MTL_MISSING' && x.gated);
  ok(pm && pm.n === 1 && pm.samples[0].repeat === 2 && /a\.mtl \| b\.mtl/.test(pm.samples[0].msg), 'repeats on one file collapse with a count: ' + JSON.stringify(pm));
  ok(pg && pg.n === 1 && /names this file/.test(pg.note), 'unnamed ply gated: ' + JSON.stringify(pg));
  ok(r.rows.some(x => x.code === 'INCLUDE_MISSING' && x.gated && /not an entity def/.test(x.note)), 'pak texture def gated');
  const ui = row('FONT_MAIN10_MISSING');
  ok(ui && ui.sev === 'crash' && ui.n === 4, 'doctor count above the samples kept: ' + JSON.stringify(ui));
  const nr = gate.apply(JSON.parse(JSON.stringify(rows)), { reach: null, cap: 1 });
  ok(!nr.rows.some(x => x.gated) && nr.gated === 0, 'no reach info: no gate');
  ok(nr.rows.every(x => !x.samples || x.samples.length <= 1), 'cap applied after dedupe');
  ok(gate.keyOf('C:\\m\\fm\\resource.pak!entity/A/B.def') === 'resource/entity/a/b.def', 'pak key ' + gate.keyOf('C:\\m\\fm\\resource.pak!entity/A/B.def'));
}
// ---- gate.js R3: crash rows in a losing duplicate def (ENTITY_REDEFINITION "this file ... is ignored") or its all-loser folder -> review
{
  const S = (file, line, msg = '') => ({ file, line, msg });
  const RD = (file, winner) => S(file, 1, `entity name "t" already defined by ${winner} [m]: "Entity redefinition", this file [m] is ignored (first mounted wins; same layer: path order assumed) (ENG-04)`);
  const reach = { defs: { 'resource/entity/b/t.def': 'REACHABLE', 'resource/entity/a/t.def': 'REACHABLE', 'resource/entity/c/t.def': 'REACHABLE', 'resource/entity/c/u.def': 'REACHABLE' }, unrefFiles: [] };
  const rows = [
    { tool: 'refcheck', code: 'ENTITY_REDEFINITION', n: 2, sev: 'review', samples: [RD('resource/entity/b/t.def', 'resource/entity/a/t.def'), RD('resource/entity/c/t.def', 'resource/entity/a/t.def')] },
    { tool: 'refcheck', code: 'REF_ITEM_UNKNOWN', n: 3, sev: 'crash', samples: [S('resource/entity/b/t.def', 7), S('resource/entity/a/t.def', 7), S('resource/entity/c/t.def', 7)] },
    { tool: 'refcheck', code: 'REF_MESH_MISSING', n: 2, sev: 'crash', samples: [S('resource/entity/b/t.mdl', 3), S('resource/entity/c/t.mdl', 3)] },
    { tool: 'sdllint', code: 'MACRO_UNDEFINED', n: 1, sev: 'crash', samples: [S('resource/entity/b/k.inc', 2, 'define not found [via resource/entity/b/t.def:4]')] },
  ];
  const r = gate.apply(JSON.parse(JSON.stringify(rows)), { reach, cap: 50 });
  const files = (code, g) => r.rows.filter(x => x.code === code && !!x.gated === g).flatMap(x => x.samples.map(s => s.file)).sort().join(' ');
  ok(files('REF_ITEM_UNKNOWN', true) === 'resource/entity/b/t.def resource/entity/c/t.def' && files('REF_ITEM_UNKNOWN', false) === 'resource/entity/a/t.def', 'R3: loser defs gated, winner stays crash: ' + JSON.stringify(r.rows));
  ok(r.rows.filter(x => x.gated).every(x => x.sev === 'review' && x.samples.every(s => s.note.startsWith(gate.REDEF_NOTE))), 'R3: gated rows are review with the redefinition note');
  ok(files('REF_MESH_MISSING', true) === 'resource/entity/b/t.mdl' && files('REF_MESH_MISSING', false) === 'resource/entity/c/t.mdl', 'R3: folder rule only when every def there loses: ' + JSON.stringify(r.rows));
  ok(files('MACRO_UNDEFINED', true) === 'resource/entity/b/k.inc', 'R3: include reached via a loser root gated');
  const nr = gate.apply(JSON.parse(JSON.stringify(rows)), { reach: null, cap: 50 });
  ok(nr.gated === 3 && !nr.rows.some(x => x.code === 'REF_MESH_MISSING' && x.gated), 'R3 without reach: def rule only, gated ' + nr.gated);
  const plain = gate.apply([{ tool: 'refcheck', code: 'ENTITY_REDEFINITION', n: 1, sev: 'review', samples: [S('resource/entity/b/t.def', 1, 'entity name "t" defined twice')] }, rows[1]].map(x => JSON.parse(JSON.stringify(x))), { reach, cap: 50 });
  ok(plain.gated === 0, 'R3: a redefinition row without the "is ignored" wording gates nothing');
}

// ---- seeded mod, end to end
cp.execFileSync(process.execPath, [path.join(here, 'mkfalse.js'), FL]);
const jf = path.join(FL, 'r.json');
const p = require('../../lib/test/wait').spawnSync(process.execPath, [CHECK, path.join(G, 'mods', 'fm'), '--game', G, '--exe', 'mowas2', '--json', jf], { encoding: 'utf8', cwd: here, timeout: 600000 }, 'check false-test');
let R = null; try { R = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch { /* none */ }
const out = (p.stdout || '') + (p.stderr || '');
if (!R) ok(false, 'no json: ' + out.slice(-500));
else {
  const crash = R.findings.filter(f => f.sev === 'crash');
  ok(crash.length === 1 && crash[0].code === 'INCLUDE_MISSING' && crash[0].n === 1 && /real\/tank_r\.def/.test(crash[0].samples[0].file), 'only the seeded real crash is a crash row: ' + JSON.stringify(crash));
  ok(/\+2 MACRO_UNDEFINED follow-ons/.test(crash[0] && crash[0].samples[0].msg), 'follow-on macros folded into the include row');
  ok(/^Known crash pattern found: 1 crash finding /.test(R.words[0]), 'words: ' + R.words[0]);
  ok(R.verdicts.mowas2 && R.verdicts.mowas2.verdict === 'LIKELY_CRASH', 'verdict ' + JSON.stringify(R.verdicts));
  const gated = R.findings.filter(f => f.gated);
  ok(gated.length && gated.every(f => f.sev === 'review'), 'gated rows are review');
  const gatedFiles = gated.flatMap(f => f.samples.map(s => s.file)).join(' ');
  ok(/orph\/tank_o\.def/.test(gatedFiles) && /sel\/tank_s\.def/.test(gatedFiles), 'orphan + selector-only units gated: ' + gatedFiles);
  ok(/dash\/tank-x\.def/.test(gatedFiles), 'R1/R2: dashed unit named only by its .tex / a file stem gated: ' + gatedFiles);
  ok(/dup\/b\/twin\.def/.test(gatedFiles) && !/dup\/a\/twin\.def/.test(gatedFiles), 'R3: losing duplicate gated, winner not: ' + gatedFiles);
  const noteOf = s => /dup\/b\//.test(s.file) ? gate.REDEF_NOTE : gate.ORPHAN_NOTE;
  ok(gated.every(f => f.samples.every(s => s.note.startsWith(noteOf(s)))), 'notes: nothing uses the unit / another def wins: ' + JSON.stringify(gated));
  const any = R.findings.flatMap(f => (f.samples || []).map(s => ({ code: f.code, sev: f.sev, file: s.file })));
  ok(!any.some(x => /^(TAG_SWALLOWS|HASH_COMMENT|ARITH_BAD|IDENT_SPLIT|NUMBER_GLUED)$/.test(x.code) && x.sev === 'crash'), 'no syntax false crash: ' + JSON.stringify(any));
  ok(!any.some(x => x.sev === 'crash' && /texture\/|gunnew\.mtl|elong\.inc/.test(x.file)), 'never-loaded files give no crash row: ' + JSON.stringify(any));
  ok(R.gated >= 3, 'R.gated ' + R.gated);
}
// c-port3: the gate takes the TARGET build's reach only; a target pass with no reach (not mounted, scan failed under load) is no gate,
// never another game's ORPHAN list (overlapping check runs gave other refs than one run alone)
{
  const orphan = { defs: { 'resource/entity/x/x.def': 'ORPHAN' }, unrefFiles: [] };
  const W1 = { exes: { as64: { reachAll: { none: 'reach scan failed: out of memory' } }, mowas2: { reachAll: orphan }, goh: { reachAll: orphan } } };
  ok(gate.reachFor(W1, 'as64') === null, 'reachFor: target as64 with no reach must not borrow mowas2/goh reach');
  ok(gate.reachFor(W1, 'mowas2') === orphan, 'reachFor: target mowas2 gets its own reach');
  ok(gate.reachFor(null, 'as64') === null && gate.reachFor({ exes: {} }, 'goh') === null, 'reachFor: no wouldload / no target pass = null');
  const rows = [{ tool: 'sdllint', code: 'INCLUDE_MISSING', n: 1, sev: 'crash', samples: [{ file: 'resource/entity/x/x.def', line: 2, msg: 'include "no.inc" not found' }] }];
  const kept = gate.apply(JSON.parse(JSON.stringify(rows)), { reach: gate.reachFor(W1, 'as64'), cap: 50 });
  ok(kept.rows.some(r => r.code === 'INCLUDE_MISSING' && r.sev === 'crash'), 'reachFor as64 (none): INCLUDE_MISSING stays crash: ' + JSON.stringify(kept.rows));
  const gd = gate.apply(JSON.parse(JSON.stringify(rows)), { reach: gate.reachFor(W1, 'mowas2'), cap: 50 });
  ok(!gd.rows.some(r => r.code === 'INCLUDE_MISSING' && r.sev === 'crash'), 'reachFor mowas2 (ORPHAN): INCLUDE_MISSING gated: ' + JSON.stringify(gd.rows));
}
fs.rmSync(FL, { recursive: true, force: true });
if (fails.length) { console.log(fails.map(f => 'FAIL ' + f).join('\n')); process.exit(1); }
console.log('false-test PASS');
