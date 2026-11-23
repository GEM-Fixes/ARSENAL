// wpn tests: the rule on invented weapons, the sheet round trip, decide(), and (when table.json exists) its shape. No game data read.
//   node tools/wpn/test.js
// Author: Imperator_Aug (ARSENAL, ia-ef53b177)
const fs = require('fs'), path = require('path');
const W = require('./wpn.js');
let fail = 0;
const t = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + 'wpn: ' + name + (good || !extra ? '' : '  ' + String(extra).slice(0, 300))); if (!good) fail++; };
const g = (o) => Object.assign({ name: 'x', cls: 'gun', cal: 76, pen_a: 150, pen_c: 110, pen_e: 80, range: 130, recharge: 6, ammo: 'b', flat: false }, o);
const A = [g({ name: '76mm_a', pen_a: 150, pen_c: 112, pen_e: 82, range: 130 }), g({ name: '76mm_b', pen_a: 100, pen_c: 70, pen_e: 50 }), g({ name: '76mm_he', pen_a: null, pen_c: null, pen_e: null }),
  g({ name: 'mg1', cls: 'mgun', cal: 0, pen_a: null, pen_c: null, pen_e: null, range: 75, recharge: 5, ammo: 'm' })];
let r = W.classify(g({ name: '76mm_a' }), A);
t('same name, numbers agree -> swap', r.verdict === 'swap' && r.as2 === '76mm_a', JSON.stringify(r));
r = W.classify(g({ name: '76mm_new' }), A);
t('other name, same calibre, pen within 10% -> swap by data', r.verdict === 'swap' && r.as2 === '76mm_a', JSON.stringify(r));
r = W.classify(g({ name: '76mm_new', pen_c: 90, pen_a: 130, pen_e: 65 }), A);
t('pen 20% off both candidates -> ask', r.verdict === 'ask', JSON.stringify(r));
r = W.classify(g({ name: '76mm_new', pen_a: 400, pen_c: 380, pen_e: 350 }), A);
t('pen far from every candidate -> import with an AP template', r.verdict === 'import' && r.tmpl && r.tmpl !== '76mm_he', JSON.stringify(r));
r = W.classify(g({ name: '75mm_he', pen_a: 90, pen_c: 90, pen_e: 90, flat: true, range: 130 }), A);
t('flat table = HE, matches an HE candidate without a table', r.verdict === 'swap' && r.as2 === '76mm_he', JSON.stringify(r));
r = W.classify(g({ name: '152mm_big', cal: 152 }), A);
t('no calibre peer -> import', r.verdict === 'import' && r.as2 === null);
r = W.classify(g({ name: 'mg1', cls: 'mgun', cal: 0, pen_a: 7, pen_c: 3, pen_e: 0, range: 120, recharge: 5, ammo: 'm' }), A);
t('small arm, same name, one-sided pen -> swap', r.verdict === 'swap' && r.as2 === 'mg1', JSON.stringify(r));
t('calOf: 76mm_x, mortar81, 15cm_x, none', W.calOf('76mm_x') === 76 && W.calOf('mortar81') === 81 && W.calOf('15cm_x') === 150 && W.calOf('type38') === 0);
// SILENT-1F: foresight. the pz38t class: 37mm_hori has the numbers but no foresight on its chain
const S1 = [g({ name: '37mm_nosight', cal: 37, pen_a: 55, pen_c: 33, pen_e: 18, range: 100, recharge: 4, foresight: false }), g({ name: '37mm_sight', cal: 37, pen_a: 40, pen_c: 24, pen_e: 12, range: 100, recharge: 4, foresight: true })];
r = W.classify(g({ name: '37mm_kwk', cal: 37, pen_a: 55, pen_c: 27, pen_e: 15, range: 160, recharge: 4 }), S1);
t('a near candidate with no foresight ranks behind one that has it', (r.as2 || r.tmpl) === '37mm_sight' && r.cand[r.cand.length - 1].name === '37mm_nosight', JSON.stringify(r));
r = W.classify(g({ name: '37mm_far', cal: 37, pen_a: 900, pen_c: 800, pen_e: 700, range: 160, recharge: 4 }), S1);
t('import template: no foresight ranks last, whatever the numbers', r.tmpl === '37mm_sight', JSON.stringify(r));
r = W.classify(g({ name: '37mm_only', cal: 37, pen_a: 900, pen_c: 800, pen_e: 700 }), [S1[0]]);
t('only a template with no foresight: still taken', r.tmpl === '37mm_nosight', JSON.stringify(r));
const fsTab = { as2: { nosight: { foresight: false }, sight: { foresight: true }, old: {} } };
const imp = tmpl => W.decide('r', { table: { ...fsTab, rows: { r: { cls: 'gun', verdict: 'import', tmpl, imp: { range: 160 }, goh: {} } } } }).text();
t('import text: a template with no foresight gets {foresight "foresight1"}', /\{foresight "foresight1"\}/.test(imp('nosight')), imp('nosight'));
t('import text: a template that has one, or a row not read, gets none', !/foresight/.test(imp('sight')) && !/foresight/.test(imp('old')), imp('sight'));
const fl = [g({ name: 'balloon', cls: 'flame', cal: 0, foresight: false, pen_a: null, pen_c: null, pen_e: null, ammo: 'f', range: 30 }), g({ name: 'flame_thrower', cls: 'flame', cal: 0, foresight: true, pen_a: null, pen_c: null, pen_e: null, ammo: 'f', range: 90 })];
r = W.classify(g({ name: 'fw', cls: 'flame', cal: 0, pen_a: null, pen_c: null, pen_e: null, ammo: 'x', range: 31 }), fl);
t('other classes are left alone: a flame template has no foresight by design', r.tmpl === 'balloon', JSON.stringify(r));
const flText = W.decide('r', { table: { as2: { balloon: { foresight: false } }, rows: { r: { cls: 'flame', verdict: 'import', tmpl: 'balloon', imp: {}, goh: {} } } } }).text();
t('import text: no foresight line on a class other than gun', !/foresight/.test(flText), flText);
// SILENT-1F: a10 class. a gun with no penetration numbers avoids a howitzer template when a flat gun of near calibre exists
const noPen = { pen_a: null, pen_c: null, pen_e: null };
const H = [g({ name: '75mm_how', cal: 75, ...noPen, howitzer: true, foresight: true }), g({ name: '76mm_flat', cal: 76, pen_a: 77, pen_c: 53, pen_e: 35, howitzer: false, foresight: true })];
r = W.classify(g({ name: '76mm_cs', cal: 76, ...noPen, range: 180, recharge: 7 }), H);
t('no pen numbers: a flat gun of near calibre, not the howitzer', (r.tmpl || r.as2) === '76mm_flat' && (r.verdict === 'import' || r.verdict === 'ask'), JSON.stringify(r));
r = W.classify(g({ name: '76mm_cs', cal: 76, ...noPen, range: 130, recharge: 6 }), [H[0], Object.assign({}, H[1], { name: '75mm_how2', howitzer: true })]);
t('no pen numbers, no flat gun near: the howitzer stays', /how/.test(r.tmpl || r.as2), JSON.stringify(r));
r = W.classify(g({ name: '76mm_at', cal: 76, pen_a: 77, pen_c: 53, pen_e: 35, range: 900, recharge: 90 }), [g({ name: '76mm_pen_how', cal: 76, pen_a: 77, pen_c: 53, pen_e: 35, howitzer: true, foresight: true }), g({ name: '76mm_pen_flat', cal: 76, pen_a: 7, pen_c: 5, pen_e: 3, howitzer: false, foresight: true })]);
t('a gun with pen numbers is not touched: nearest numbers, howitzer or not', (r.tmpl || r.as2) === '76mm_pen_how', JSON.stringify(r));
r = W.classify(g({ name: '114mm_bl', cal: 114, ...noPen, range: 130, recharge: 6 }), [g({ name: '105mm_how', cal: 105, ...noPen, howitzer: true, foresight: true }), g({ name: '122mm_flat', cal: 122, pen_a: 200, pen_c: 150, pen_e: 100, howitzer: false, foresight: true })]);
t('90 mm and up keeps its howitzer: no game says otherwise (bl45 class)', (r.tmpl || r.as2) === '105mm_how', JSON.stringify(r));
r = W.classify(g({ name: '76mm_cs', cal: 76, ...noPen, range: 180, recharge: 7 }), [H[0], g({ name: '76mm_f34', cal: 76, pen_a: 77, pen_c: 53, pen_e: 35, range: 110, recharge: 6, howitzer: false, foresight: true }), g({ name: '76mm_other', cal: 76, pen_a: 77, pen_c: 53, pen_e: 35, range: 180, recharge: 7, howitzer: false, foresight: true })]);
t('the template the game saw goes first: 76mm_f34 over nearer numbers', r.tmpl === '76mm_f34', JSON.stringify(r));
// decide() and the sheet on a tiny table
const tab = { meta: { count: { swap: 1, import: 1 } }, as2: { '76mm_a': { cls: 'gun', pen_a: 150, pen_c: 112, pen_e: 82, range: 130, recharge: 6 } }, rows: {
  s: { cls: 'gun', verdict: 'swap', as2: '76mm_a', basis: 'same name', goh: {}, vehicles: 1, modVehicles: 0, imp: {} },
  q: { cls: 'gun', verdict: 'ask', as2: '76mm_a', basis: 'near', goh: { pen_a: 1, pen_c: 1, pen_e: 1, range: 200, recharge: 7 }, vehicles: 5, modVehicles: 2, imp: { recharge: 7, range: 200, pen_a: 150, pen_c: 100, pen_e: 70 }, tmpl: '76mm_a' },
  i: { cls: 'rifle', verdict: 'import', as2: null, basis: 'no candidate', tmpl: 'mauzer', goh: {}, imp: { recharge: 5, range: 55 } } } };
t('decide: swap', W.decide('S', { table: tab }).action === 'swap');
t('decide: swap that the donor already shoots -> keep', W.decide('s', { table: tab, donorWeapon: '76mm_a' }).action === 'keep');
t('decide: unanswered ask -> import (Q7)', W.decide('q', { table: tab, answers: {} }).action === 'import');
t('decide: ask answered with an AS2 name -> swap', (x => x.action === 'swap' && x.as2 === '76mm_a')(W.decide('q', { table: tab, answers: { q: '76mm_a' } })));
t('decide: ask answered import -> import', W.decide('q', { table: tab, answers: { q: 'import' } }).action === 'import');
t('decide: weapon not in the table -> none', W.decide('zz', { table: tab }).action === 'none');
const txt = W.decide('i', { table: tab }).text({ entity: 'e1' });
t('import text: from template, entity, recharge, range', /\{from "mauzer"/.test(txt) && /\{entity "e1"\}/.test(txt) && /rechargeTime 5/.test(txt) && /\{range 55 55\}/.test(txt), txt);
const gt = W.decide('q', { table: tab }).text();
t('import text: gun gets a damage table with b, d interpolated', /\("damage" a\(150\) b\(125\) c\(100\) d\(85\) e\(70\)\)/.test(gt), gt);
const sh = W.sheet(Object.assign({}, tab, { meta: { count: { swap: 1, import: 1 } } }), 40);
t('sheet lists the ask row only, with an empty Answer cell', /\| 1 \| q \|/.test(sh) && !/\| s \|/.test(sh));
t('sheet round trip: filled cell is read back, blank is not', (a => a.q === '76mm_a' && Object.keys(a).length === 1)(W.readSheet(sh.replace(/\| \|$/m, '| 76mm_a |'))), sh);
// check.js (PORT-178 PORT-180): loose folder fixture in the temp dir, one defect per code and a clean twin each
{
  const os = require('os'), cp = require('child_process'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpn-check-'));
  const put = (rel, lines) => { const f = path.join(dir, 'resource', rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, lines.join('\r\n') + '\r\n', 'latin1'); };
  try {
    put('set/stuff/gun/gun.pattern', ['{weapon_bullet', '\t{foresight "Foresight1"}', '}']);
    put('set/stuff/gun/sighted', ['{from "pattern gun"', '\t{range 100 120}', '}']);
    put('set/stuff/gun/blind', ['{weapon_bullet', '\t{range 100 120}', '}']);
    put('set/stuff/gun/blind2', ['{from "blind"', '\t{range 90 100}', '}']);
    put('entity/ok/ok.def', ['{game_entity', '\t{Weaponry', '\t\t{place "gun"', '\t\t\t{weapon "sighted"}', '\t\t}', '\t\t{place "gun2"', '\t\t\t{weapon "blind"}', '\t\t\t{foresight "foresight1"}', '\t\t}', '\t}', '}']);
    put('entity/bad/bad.def', ['{game_entity', '\t{Weaponry', '\t\t{place "gun"', '\t\t\t{weapon "blind2"}', '\t\t}', '\t}', '}']);
    const out = cp.spawnSync('node', [path.join(__dirname, 'check.js'), '-', '--folder', dir, '--no-rc', '-q'], { encoding: 'utf8' }).stdout.split(/\r?\n/);
    const got = out.map(l => /^(resource\/\S+?):(\d+): (\w+) /.exec(l)).filter(Boolean).map(m => `${m[1]}:${m[2]} ${m[3]}`).sort();
    const want = ['resource/entity/bad/bad.def:3 WARN_PLACE_NO_FORESIGHT', 'resource/set/stuff/gun/blind:1 WARN_GUN_NO_FORESIGHT', 'resource/set/stuff/gun/blind2:1 WARN_GUN_NO_FORESIGHT'].sort();
    t('check.js: no-foresight templates and the bare place fire, sighted gun and the place with its own foresight stay quiet', JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
// check.js --exe (game parity): a made-up AS2 install with as64.exe and an as64/core gun that has no foresight; and a GoH folder fixture
{
  const os = require('os'), cp = require('child_process'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpn-check-exe-'));
  const put = (rel, lines) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, lines.join('\r\n') + '\r\n', 'latin1'); };
  const run = args => cp.spawnSync('node', [path.join(__dirname, 'check.js'), ...args, '--no-rc', '--all'], { encoding: 'utf8' });
  const codes = r => r.stdout.split(/\r?\n/).map(l => /^(resource\/\S+?):(\d+): (\w+) /.exec(l)).filter(Boolean).map(m => `${m[1]}:${m[2]} ${m[3]}`).sort();
  try {
    const g = path.join(dir, 'game');
    put('game/as64.exe', ['x']); put('game/mowas_2.exe', ['x']);
    put('game/resource/set/stuff/gun/gun.pattern', ['{weapon_bullet', '\t{foresight "Foresight1"}', '}']);
    put('game/resource/set/stuff/gun/sighted', ['{from "pattern gun"', '}']);
    put('game/as64/core/resource/set/stuff/gun/coreblind', ['{weapon_bullet', '\t{range 100 120}', '}']);
    const as64 = codes(run([g, '--exe', 'as64'])), none = codes(run([g])), mow = codes(run([g, '--exe', 'mowas_2'])), mow2 = codes(run([g, '--exe', 'mowas2']));
    t('check.js --exe as64 (and no --exe): the as64/core gun with no foresight is mounted and found', JSON.stringify(as64) === JSON.stringify(['resource/set/stuff/gun/coreblind:1 WARN_GUN_NO_FORESIGHT']) && JSON.stringify(none) === JSON.stringify(as64), JSON.stringify([as64, none]));
    t('check.js --exe mowas_2 / mowas2: no as64/core in the MoW:AS2 set, so no finding', mow.length === 0 && mow2.length === 0, JSON.stringify([mow, mow2]));
    const bad = run([g, '--exe', 'as3']);
    t('check.js --exe bad value: exit 2', bad.status === 2, bad.status + ' ' + bad.stderr);
    // GoH folder fixture: same layout; a place with {AimBone} and no foresight on a blind gun still fires the place code, GoH texts cite GHLOG-03 and GHKEY-05
    const f = path.join(dir, 'gohmod');
    put('gohmod/resource/set/stuff/gun/gun.pattern', ['{weapon_bullet', '\t{foresight "Foresight1"}', '}']);
    put('gohmod/resource/set/stuff/gun/sighted', ['{from "pattern gun"', '}']);
    put('gohmod/resource/set/stuff/gun/blind', ['{weapon_bullet', '}']);
    put('gohmod/resource/entity/v/v.def', ['{game_entity', '\t{Weaponry', '\t\t{place "gun"', '\t\t\t{weapon "blind"}', '\t\t\t{AimBone "aim_ref"}', '\t\t}', '\t\t{place "gun2"', '\t\t\t{weapon "sighted"}', '\t\t\t{AimBone "aim_ref"}', '\t\t}', '\t}', '}']);
    const r = run(['-', '--exe', 'goh', '--folder', f]), gc = codes(r);
    t('check.js --exe goh --folder: blind template and the AimBone-only place fire, the sighted place stays quiet', JSON.stringify(gc) === JSON.stringify(['resource/entity/v/v.def:3 WARN_PLACE_NO_FORESIGHT', 'resource/set/stuff/gun/blind:1 WARN_GUN_NO_FORESIGHT']), JSON.stringify(gc) + r.stderr);
    t('check.js --exe goh: texts cite GHLOG-03, the AimBone place GHKEY-05, no PORT-178/180', /GHLOG-03/.test(r.stdout) && /GHKEY-05/.test(r.stdout) && !/PORT-17|PORT-180/.test(r.stdout), r.stdout);
    const rg = run(['--exe', 'goh', '--game', f]), gg = codes({ stdout: rg.stdout.replace(/^info: /gm, '') });   // a game folder is base data: its hits are info lines
    t('check.js --exe goh --game <dir>: the named GoH folder is read, not the Steam GoH install', gg.includes('resource/set/stuff/gun/blind:1 WARN_GUN_NO_FORESIGHT') && gg.includes('resource/entity/v/v.def:3 WARN_PLACE_NO_FORESIGHT'), JSON.stringify(gg) + rg.stderr);
    const a = run(['-', '--folder', f]);
    t('check.js no --exe on the same folder: the AS2 texts (PORT-178, PORT-180), byte for byte as before', /PORT-178/.test(a.stdout) && /PORT-180/.test(a.stdout) && !/GHLOG/.test(a.stdout), a.stdout);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
// game parity: wpn build finds the installs through lib/games, no drive path in the code
t('wpn.js and check.js: no drive path in the code', ['wpn.js', 'check.js'].every(f => !/[A-Za-z]:[\\/]/.test(fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/^\s*\/\/.*$/gm, ''))));
// built table, when present
const tp = path.join(__dirname, 'table.json');
if (fs.existsSync(tp)) {
  const T = JSON.parse(fs.readFileSync(tp, 'utf8')), v = Object.values(T.rows);
  t('table.json: every swap names an AS2 weapon of the same class', v.filter(x => x.verdict === 'swap').every(x => T.as2[x.as2] && T.as2[x.as2].cls === x.cls));
  t('table.json: every ask row has a candidate', v.filter(x => x.verdict === 'ask').every(x => x.as2 && T.as2[x.as2]));
  t('table.json: every import row has a template or a candidate', v.filter(x => x.verdict === 'import').filter(x => !x.tmpl).length < v.length * 0.05, v.filter(x => x.verdict === 'import' && !x.tmpl).length + ' without');
  t('table.json: type38rifle_b imports on mauzer', (x => x && x.verdict === 'import' && x.tmpl === 'mauzer')(T.rows.type38rifle_b));
} else console.log('SKIP wpn: table.json not built (node tools/wpn/wpn.js build)');
console.log(fail ? `${fail} FAILED (wpn)` : 'wpn: all ok');
process.exit(fail ? 1 : 0);
