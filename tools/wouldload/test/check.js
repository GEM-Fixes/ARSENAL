// runs wouldload on test/fx with real sdllint + refcheck over the fake installs. one line per case in truth.md
// Author: Imperator_Aug (ARSENAL, ia-64be4f88)
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const WL = path.join(__dirname, '..', 'wouldload.js'), FX = path.join(__dirname, 'fx');
const W = require(WL);
const G = path.join(FX, 'game'), H = path.join(FX, 'goh'), CACHE = path.join(FX, 'cache');
let fails = 0, n = 0;
const ok = (c, name, extra) => { n++; if (!c) { fails++; console.log('FAIL ' + name + (extra ? '\n' + extra : '')); } };

// the cases run side by side: no vanilla warm run each (--no-warm); the warm case at the end passes warm = true
function run(dir, args = [], warm = false) {
  return new Promise(resolve => {
    const j = path.join(os.tmpdir(), `wl-test-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
    const a = [WL, dir, '--game', G, '--goh', H, '--cache-dir', CACHE, '--json', j, ...(warm ? [] : ['--no-warm']), ...args];
    const env = { ...process.env }; delete env.AS2_GAME; delete env.GOH_GAME;
    // backstop 15 min (the tool's own pass limit is 10 min), killed: WAIT and once more with twice the limit; never a hang
    require('../../lib/test/wait').execFile(process.execPath, a, { env, encoding: 'utf8', maxBuffer: 1 << 26, windowsHide: true, timeout: 900000 }, (err, out) => {
      let R = null; try { R = JSON.parse(fs.readFileSync(j, 'utf8')); fs.unlinkSync(j); } catch { /* no json */ }
      resolve({ out, code: err ? err.code : 0, R });
    }, 'wouldload check');
  });
}
// refcheck takes --exe once its own builder adds it (usage line names it); until then the refcheck half of the mowas2 pass is not testable here
const REFCHECK_EXE = /--exe/.test(fs.readFileSync(path.join(__dirname, '..', '..', 'refcheck', 'refcheck.js'), 'utf8').split(/\r?\n/).find(l => /const USAGE/.test(l)) || '');
if (!REFCHECK_EXE) console.log('SKIP as64/core weapon case: refcheck has no --exe yet (refcheck builder)');
// the vfs half of GHVFS-02 (lib/vfs GoH mod gate reads Tags) belongs to the vfs owner: until it is in, a develop mod is gated open here but not mounted
const VFS_DEVELOP = /develop/i.test(fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'vfs.js'), 'utf8'));
if (!VFS_DEVELOP) console.log('SKIP GoH develop mount check: lib/vfs has no Tags develop rule yet (vfs owner)');
const AS2 = ['--exe', 'as64,mowas2'], GOH = ['--exe', 'goh', '--ver-goh', '1.067'];
const m = name => path.join(G, 'mods', name), g = name => path.join(H, 'mods', name);
const v = (r, t) => r.R && r.R.exes[t] && r.R.exes[t].verdict;

const CASES = [
  // [name, dir, args, {exe: verdict}, optional extra check]
  ['clean legacy loads static on both', m('clean'), AS2, { as64: 'LOADS_STATIC', mowas2: 'LOADS_STATIC' }, r => /static only, not run/.test(r.out) && r.code === 0 && /READ: 2 files, 0 of 0 paks read, mod mounted/.test(r.out)],
  ['legacy missing Max refused', m('nomax'), AS2, { as64: 'REFUSED', mowas2: 'REFUSED' }, r => /needs both Min and Max/.test(r.out)],
  ['legacy missing Min refused', m('nomin'), AS2, { as64: 'REFUSED', mowas2: 'REFUSED' }],
  ['legacy range misses data version', m('range_low'), AS2, { as64: 'REFUSED', mowas2: 'REFUSED' }],
  ['modern no Max accepted on as64, refused on mowas2', m('modern_ok'), AS2, { as64: 'LOADS_STATIC', mowas2: 'REFUSED' }, r => r.R.exes.as64.gate.state === 'accepted' && r.R.exes.as64.read.mounted],
  ['modern above plain refused on as64', m('modern_high'), AS2, { as64: 'REFUSED', mowas2: 'REFUSED' }, r => /plain version/.test(r.out)],
  ['macro in entity def crash class', m('crash_macro'), AS2, { as64: 'LIKELY_CRASH', mowas2: 'LIKELY_CRASH' }, r => r.R.exes.mowas2.crash.some(c => c.entity === 'tank_m' && c.code === 'MACRO_UNDEFINED')],
  ['include missing in entity def crash class', m('crash_inc'), ['--exe', 'mowas2'], { mowas2: 'LIKELY_CRASH' }, r => r.R.exes.mowas2.crash.some(c => c.entity === 'tank_i' && c.code === 'INCLUDE_MISSING')],
  ['macro via include names the root def', m('crash_via'), ['--exe', 'mowas2'], { mowas2: 'LIKELY_CRASH' }, r => r.R.exes.mowas2.crash.some(c => c.entity === 'tank_v')],
  ['weapon unknown crash class', m('crash_weapon'), ['--exe', 'mowas2'], { mowas2: 'LIKELY_CRASH' }, r => r.R.exes.mowas2.crash.some(c => c.entity === 'tank_w' && c.code === 'REF_WEAPON_UNKNOWN')],
  ['unreferenced crash entity is ORPHAN, verdict unmoved', m('orph_macro'), ['--exe', 'mowas2'], { mowas2: 'LOADS_STATIC' }, r => { const x = r.R.exes.mowas2; return x.crash.length === 1 && x.crash[0].reach === 'ORPHAN' && x.orphans[0] === 'tank_o' && x.reachCounts.ORPHAN === 1 && /ORPHAN_CRASH 1: not reachable from the mod or vanilla, not counted/.test(r.out) && /^0 findings/m.test(r.out); }],
  ['whole-word: tank_oo tank_o2 xtank_o do not name tank_o', m('orph_word'), ['--exe', 'mowas2'], { mowas2: 'LOADS_STATIC' }, r => r.R.exes.mowas2.crash[0].reach === 'ORPHAN'],
  ['same entity named from a .mi in a pak is REACHABLE (case-insens.)', m('orph_pak_ref'), ['--exe', 'mowas2'], { mowas2: 'LIKELY_CRASH' }, r => r.R.exes.mowas2.crash[0].reach === 'REACHABLE' && /resource\.pak|m\.mi/.test(r.R.exes.mowas2.crash[0].reachWhy)],
  ['override of a vanilla def path is REACHABLE', m('orph_override'), ['--exe', 'mowas2'], { mowas2: 'LIKELY_CRASH' }, r => r.R.exes.mowas2.crash[0].entity === 'base' && r.R.exes.mowas2.crash[0].reach === 'REACHABLE' && /lower layer/.test(r.R.exes.mowas2.crash[0].reachWhy)],
  ['mixed: referenced one counts, orphan listed apart', m('orph_mixed'), ['--exe', 'mowas2'], { mowas2: 'LIKELY_CRASH' }, r => { const x = r.R.exes.mowas2; return x.orphans.join() === 'tank_o' && x.reachCounts.REACHABLE === 1 && /1 entities are crash-class/.test(x.text); }],
  // check-false D: sdllint skips .def outside resource/entity/ (info SDL_DEF_NOT_ENTITY), so no finding reaches wouldload
  ['macro outside entity folder is not crash class', m('silent_only'), ['--exe', 'mowas2'], { mowas2: 'LOADS_STATIC' }, r => r.R.exes.mowas2.crash.length === 0 && !r.R.exes.mowas2.silent.some(f => f.code === 'MACRO_UNDEFINED' && /texture/.test(f.file || f.msg || ''))],
  ['losing duplicate def is not crash class', m('dup_loser'), ['--exe', 'mowas2'], { mowas2: 'LOADS_STATIC' }, r => r.R.exes.mowas2.silent.some(f => f.code === 'ENTITY_REDEFINITION')],
  ['loser reaching its defect through an include is silent (row 166)', m('dup_loser_via'), ['--exe', 'mowas2'], { mowas2: 'LOADS_STATIC' }, r => { const x = r.R.exes.mowas2; return x.crash.length === 0 && x.silent.some(f => f.code === 'ENTITY_REDEFINITION') && x.silent.some(f => f.code === 'MACRO_UNDEFINED'); }],
  ['winner carrying the include still counts (row 166 mirror)', m('dup_winner_via'), ['--exe', 'mowas2'], { mowas2: 'LIKELY_CRASH' }, r => r.R.exes.mowas2.crash.some(c => c.entity === 'twin' && c.code === 'MACRO_UNDEFINED')],
  ['HARD code under a set/ root is LOAD class (row 210)', m('crash_set'), ['--exe', 'mowas2'], { mowas2: 'LIKELY_CRASH' }, r => r.R.exes.mowas2.crash.some(c => c.cls === 'LOAD' && c.entity === 'set:resource/set/s.set' && c.reach === 'REACHABLE') && /class LOAD/.test(r.out)],
  ['interaction selector key is not a reference', m('orph_selector'), ['--exe', 'mowas2'], { mowas2: 'LOADS_STATIC' }, r => r.R.exes.mowas2.crash.some(c => c.entity === 'tank_o' && c.reach === 'ORPHAN')],
  ['spawn value inside an interaction block still reaches', m('reach_selector_val'), ['--exe', 'mowas2'], { mowas2: 'LIKELY_CRASH' }],
  // check-false R1 + R2
  ['dashed name named in a .mi is REACHABLE (R1)', m('reach_dash'), ['--exe', 'mowas2'], { mowas2: 'LIKELY_CRASH' }, r => r.R.exes.mowas2.crash.some(c => c.entity === 'tank-d' && c.reach === 'REACHABLE' && /m\.mi/.test(c.reachWhy))],
  ['dashed name: x-tank-d tank-d2 tank_d tank-dd do not name tank-d (R1)', m('orph_dash'), ['--exe', 'mowas2'], { mowas2: 'LOADS_STATIC' }, r => r.R.exes.mowas2.crash.some(c => c.entity === 'tank-d' && c.reach === 'ORPHAN')],
  ['.lng/.tex/thumbs.db hits and quoted file stems are no refs (R2)', m('orph_filestem'), ['--exe', 'mowas2'], { mowas2: 'LOADS_STATIC' }, r => r.R.exes.mowas2.crash.some(c => c.entity === 'tank_o' && c.reach === 'ORPHAN')],
  ['a plain quoted name still reaches beside a file stem (R2)', m('reach_filestem_plain'), ['--exe', 'mowas2'], { mowas2: 'LIKELY_CRASH' }, r => r.R.exes.mowas2.crash.some(c => c.entity === 'tank_o' && c.reach === 'REACHABLE')],
  ['--reach-all lists every mod def', m('orph_mixed'), ['--exe', 'mowas2', '--reach-all'], { mowas2: 'LIKELY_CRASH' }, r => { const a = r.R.exes.mowas2.reachAll; return a && a.defs['resource/entity/o/tank_o.def'] === 'ORPHAN' && a.defs['resource/entity/o/tank_r.def'] === 'REACHABLE'; }],
  ['mounted pak read', m('pak_ok'), ['--exe', 'mowas2'], { mowas2: 'LOADS_STATIC' }, r => /1 of 1 paks read/.test(r.out)],
  ['crash inside a pak is found', m('pak_crash'), ['--exe', 'mowas2'], { mowas2: 'LIKELY_CRASH' }, r => r.R.exes.mowas2.crash.some(c => c.entity === 'tank_p')],
  ['bad pak unknown', m('pak_bad'), ['--exe', 'mowas2'], { mowas2: 'UNKNOWN' }, r => /0 of 1 paks read/.test(r.out) && /UNREAD paks: resource\.pak/.test(r.out) && !/LOADS_STATIC/.test(r.out)],
  ['pak the engine never mounts is named, not a blocker', m('stray_pak'), ['--exe', 'mowas2'], { mowas2: 'LOADS_STATIC' }, r => /IGNORED by the engine, not read .*extra\.pak/.test(r.out)],
  ['pak unread outside mods gives UNKNOWN', path.join(FX, 'outside', 'packed'), AS2, { as64: 'UNKNOWN', mowas2: 'UNKNOWN' }, r => /0 of 1 paks read, mod NOT mounted/.test(r.out) && /UNREAD paks: resource\.pak/.test(r.out) && !/LOADS_STATIC/.test(r.out) && !/static only, not run/.test(r.out)],
  ['loose outside mods still linted', path.join(FX, 'outside', 'loose'), ['--exe', 'mowas2'], { mowas2: 'LOADS_STATIC' }, r => /mod NOT mounted/.test(r.out)],
  ['N.pat counted and its partial read stated', m('patched'), ['--exe', 'mowas2'], { mowas2: 'LOADS_STATIC' }, r => /1 of 1 paks read/.test(r.out) && /1 N\.pat read by refcheck only/.test(r.out)],
  ['Require not installed unknown', m('req_missing'), ['--exe', 'mowas2'], { mowas2: 'UNKNOWN' }, r => /nosuchmod/.test(r.out)],
  ['Require installed gets mounted', m('req_ok'), ['--exe', 'mowas2'], { mowas2: 'LOADS_STATIC' }, r => r.R.exes.mowas2.read.mounted],
  ['legacy with as64+ startup crash on as64, unmet on mowas2', m('plus_on_legacy'), AS2, { as64: 'LIKELY_CRASH', mowas2: 'UNKNOWN' }, r => /ENG-26/.test(r.out)],
  ['bad mod.info crash class', m('bad_info'), ['--exe', 'mowas2'], { mowas2: 'LIKELY_CRASH' }, r => /ENG-24/.test(r.out)],
  ['no mod.info refused', m('no_info'), AS2, { as64: 'REFUSED', mowas2: 'REFUSED' }],
  // game parity: one pass per exe. an include only as64/core holds: found on as64, missing on mowas2 (sdllint --exe mowas_2)
  ['as64/core include: loads on as64, crash class on mowas2', m('core_inc'), AS2, { as64: 'LOADS_STATIC', mowas2: 'LIKELY_CRASH' }, r => r.R.exes.as64.crash.length === 0 && r.R.exes.mowas2.crash.some(c => c.entity === 'tank_c' && c.code === 'INCLUDE_MISSING') && !/same list as as64/.test(r.out)],
  ['--exe mowas_2 is the mowas2 id, alone', m('core_inc'), ['--exe', 'mowas_2'], { mowas2: 'LIKELY_CRASH' }, r => !r.R.exes.as64 && /== mowas2/.test(r.out)],
  // refcheck half (its --exe is built by another part): a weapon only as64/core holds is unknown to mowas_2.exe. Skipped while refcheck lacks --exe
  ...(REFCHECK_EXE ? [['as64/core weapon: loads on as64, crash class on mowas2 (refcheck --exe mowas_2)', m('core_weapon'), AS2, { as64: 'LOADS_STATIC', mowas2: 'LIKELY_CRASH' }, r => r.R.exes.mowas2.crash.some(c => c.entity === 'tank_cw' && c.code === 'REF_WEAPON_UNKNOWN')]] : []),
  ['exe missing unknown', m('clean'), ['--exe', 'as64', '--exe-as64', path.join(FX, 'nope.exe')], { as64: 'UNKNOWN' }, r => /not tested/.test(r.out) && !/LOADS_STATIC/.test(r.out)],
  ['GoH range ok', g('g_ok'), GOH, { goh: 'LOADS_STATIC' }, r => /\[I/.test(r.out) && /static only, not run/.test(r.out)],
  ['GoH Min above exe refused', g('g_high'), GOH, { goh: 'REFUSED' }],
  ['GoH AS2-scale range refused', g('g_scale'), GOH, { goh: 'REFUSED' }],
  ['GoH Max below exe refused', g('g_low'), GOH, { goh: 'REFUSED' }],
  ['GoH any accepted', g('g_any'), GOH, { goh: 'LOADS_STATIC' }],
  ['GoH Min only accepted, tagged', g('g_minonly'), GOH, { goh: 'LOADS_STATIC' }, r => /one bound absent/.test(r.out)],
  ['GoH no range open (GHVFS-26)', g('g_none'), GOH, { goh: 'LOADS_STATIC' }, r => /GHVFS-26/.test(r.out) && r.R.exes.goh.read.mounted],
  ['GoH no range open, exe version unread', g('g_none'), ['--exe', 'goh'], {}, r => r.R.exes.goh.gate.state === 'accepted'],
  ['GoH Tags develop skips the version check (GHVFS-02)', g('g_develop'), GOH, {}, r => r.R.exes.goh.gate.state === 'accepted' && /GHVFS-02/.test(r.R.exes.goh.gate.text) && r.R.exes.goh.verdict !== 'REFUSED' && (!VFS_DEVELOP || r.R.exes.goh.read.mounted)],
  ['GoH pass names exe goh to the vfs', path.join(FX, 'goh_noexe', 'mods', 'g_named'), [...GOH, '--goh', path.join(FX, 'goh_noexe'), '--exe-goh', path.join(H, 'binaries', 'x64', 'call_to_arms.exe')], { goh: 'LOADS_STATIC' }, r => r.R.exes.goh.read.mounted],
  ['not-mounted reason names this mod, not another folder', m('req_skipped'), ['--exe', 'mowas2'], {}, r => /vfs did not mount it [^\n]*mod "req_skipped"/.test(r.out)],
  ['GoH Tags developer is not develop', g('g_developer'), GOH, { goh: 'REFUSED' }],
  ['GoH two Tags lines: develop in the first counts, as lib/vfs', g('g_develop2'), GOH, {}, r => r.R.exes.goh.gate.state === 'accepted' && r.R.exes.goh.verdict !== 'REFUSED' && (!VFS_DEVELOP || r.R.exes.goh.read.mounted)],
  ['AS2 ignores Tags develop', m('tag_develop'), AS2, { as64: 'REFUSED', mowas2: 'REFUSED' }],
  ['GoH version unread unknown', g('g_ok'), ['--exe', 'goh'], { goh: 'UNKNOWN' }, r => !/LOADS_STATIC/.test(r.out)],
  ['GoH mod-root pak read by the tools (lib/vfs GoH mount, 2026-11-08)', g('g_pak'), GOH, { goh: 'LOADS_STATIC' }, r => /1 of 1 paks read/.test(r.out)], // whether GoH itself reads a mod-root resource.pak is [I]: fix-later tools-other
  ['crash entry carries engine class (SPAWN, classes.js)', g('g_crash'), GOH, { goh: 'LIKELY_CRASH' }, r => /tank_g: .*class SPAWN/.test(r.out)],
  ['GoH crash class tagged', g('g_crash'), GOH, { goh: 'LIKELY_CRASH' }, r => /tank_g: .*\[I\]/.test(r.out)],
  // GOHMOD-3: GoH Workshop mod outside <goh>/mods, all paks: sdllint reads its resource paks directly; localizations/ is mounted on GoH
  ['GoH pak mod outside mods read directly', path.join(FX, 'outside', 'g_ws'), GOH, { goh: 'LOADS_STATIC' }, r => /2 of 2 paks read, mod NOT mounted .*paks read directly/.test(r.out) && !/IGNORED/.test(r.out)],
  ['GoH pak mod outside mods: crash in a pak entry', path.join(FX, 'outside', 'g_ws_crash'), GOH, { goh: 'LIKELY_CRASH' }, r => /tank_w: resource\/a\.pak!entity\/m\/tank_w\.def/.test(r.out)],
];

(async () => {
  // gate: exact logic, no children
  const mi = (min, max) => ({ min, max, minSet: !!min, maxSet: !!max, requires: [] });
  ok(W.gate('as64', mi('3.301', ''), '3.262').state === 'accepted', 'gate modern no max');
  ok(W.gate('as64', mi('3.302', ''), '3.262').state === 'refused', 'gate modern above plain');
  ok(W.gate('as64', mi('3.262', ''), '3.262').state === 'refused', 'gate legacy no max as64');
  ok(W.gate('as64', mi('3.262', '3.262'), '3.262').state === 'accepted', 'gate legacy in range');
  ok(W.gate('mowas2', mi('3.301', '3.301'), '3.262').state === 'refused', 'gate modern on mowas2');
  ok(W.gate('mowas2', mi('3.262.1', '3.262.1'), '3.262').state === 'accepted', 'gate compare only shared parts');
  ok(W.gate('goh', mi('1.067', '1.067'), '1.067').state === 'accepted', 'gate goh exact');
  ok(W.gate('goh', mi('1.500', '1.510'), '1.067').state === 'refused', 'gate goh template');
  ok(W.gate('goh', null, '1.067').state === 'refused', 'gate no mod.info');
  ok(W.gate('goh', { ...mi('1.105', ''), tags: 'no_delete develop' }, '1.067').state === 'accepted', 'gate goh develop tag');
  ok(W.gate('goh', { ...mi('1.105', ''), tags: 'develop' }, null).state === 'accepted', 'gate goh develop tag, version unread');
  ok(W.gate('goh', { ...mi('1.105', ''), tags: 'undevelop' }, '1.067').state === 'refused', 'gate goh tag must be the whole word');
  ok(W.gate('mowas2', { ...mi('3.100', '3.200'), tags: 'develop' }, '3.262').state === 'refused', 'gate AS2 ignores develop');
  // verdict order
  const base = { exeFound: true, gate: { state: 'accepted', text: '' }, crash: [] };
  ok(W.verdict({ ...base, readProblems: ['x'], crash: [{ entity: 'a', code: 'C' }] }).verdict === 'UNKNOWN', 'partial read beats crash');
  ok(W.verdict({ ...base, gate: { state: 'refused', text: '' }, readProblems: ['x'] }).verdict === 'REFUSED', 'refused does not need paks');
  ok(/static only, not run/.test(W.verdict(base).text), 'LOADS_STATIC wording');
  ok(W.verdict({ ...base, toolFailed: ['x'] }).verdict === 'UNKNOWN', 'tool failed unknown');
  // shared-ref entity names + unnamed count
  const c = W.classify([], [{ file: 'resource/entity/a/shared.ext', line: 3, code: 'REF_WEAPON_UNKNOWN', msg: 'no stuff (+4 entities, e.g. aa, bb)' }], { v: null, others: new Set() });
  ok(c.crash.length === 2 && c.unnamed === 3, 'shared ref names + unnamed', JSON.stringify(c));

  // full runs
  const res = await Promise.all(CASES.map(async ([name, dir, args, want, extra]) => {
    return { name, want, extra, r: await run(dir, args) };
  }));
  for (const { name, want, extra, r } of res) {
    for (const [t, vd] of Object.entries(want)) ok(v(r, t) === vd, `${name}: ${t} want ${vd} got ${v(r, t)}`, r.out);
    if (extra) { let good = false; try { good = extra(r); } catch { /* false */ } ok(good, `${name}: detail`, r.out); }
  }
  // tool failure, injected: a dead linter must not read as a pass
  const inj = path.join(FX, 'inject.json');
  fs.writeFileSync(inj, JSON.stringify({ as2: { sdllint: null, refcheck: '0 findings\n' } }));
  let r = await run(m('clean'), ['--exe', 'mowas2', '--inject', inj]);
  ok(v(r, 'mowas2') === 'UNKNOWN' && /sdllint did not finish/.test(r.out), 'dead tool unknown', r.out);
  // game parity: as64 and mowas2 are separate passes; a dead linter in the mowas2 pass leaves the as64 verdict alone
  fs.writeFileSync(inj, JSON.stringify({ as64: { sdllint: '0 findings\n', refcheck: '0 findings\n' }, mowas2: { sdllint: null, refcheck: '0 findings\n' } }));
  r = await run(m('clean'), [...AS2, '--inject', inj]);
  ok(v(r, 'as64') === 'LOADS_STATIC' && v(r, 'mowas2') === 'UNKNOWN', 'per-exe passes: mowas2 failure does not touch as64', r.out);
  // -q hides silent list, keeps the verdict
  r = await run(m('silent_only'), ['--exe', 'mowas2', '-q']);
  ok(!/SILENT/.test(r.out) && /VERDICT mowas2/.test(r.out), '-q', r.out);
  // usage
  r = await run(m('clean'), ['--exe', 'nope']); ok(r.code === 2, 'bad exe exits 2');
  r = await run(path.join(FX, 'nonexistent')); ok(r.code === 2, 'missing dir exits 2');
  // --timeout: seconds per pass, 0 = no limit; a value that is not a number stops with the usage
  for (const v of ['x', '-1', '']) { r = await run(m('clean'), ['--exe', 'mowas2', '--timeout', v]); ok(r.code === 2, '--timeout ' + JSON.stringify(v) + ' exits 2, got ' + r.code); }
  r = await run(m('clean'), ['--exe', 'mowas2', '-q', '--timeout', '0']); ok(r.code === 0 && /VERDICT mowas2/.test(r.out), '--timeout 0 (no limit) runs', r.out);
  r = await run(m('clean'), ['--exe', 'mowas2', '-q', '--timeout', '99999999']); ok(r.code === 0 && /VERDICT mowas2/.test(r.out), '--timeout beyond what a timer holds = no limit, not an instant stop', r.out);
  // TOOLFIX (REV-TOOLS 4): exit 1 on a crash or refused verdict, 2 on unknown/unread, 0 only when every exe loads static; --help 0
  const rc = name => (res.find(x => x.name === name) || { r: {} }).r.code;
  ok(rc('macro in entity def crash class') === 1, 'crash verdict exits 1, got ' + rc('macro in entity def crash class'));
  ok(rc('legacy missing Max refused') === 1, 'refused verdict exits 1, got ' + rc('legacy missing Max refused'));
  ok(rc('bad pak unknown') === 2, 'unread pak exits 2, got ' + rc('bad pak unknown'));
  ok(rc('Require not installed unknown') === 2, 'missing Require exits 2, got ' + rc('Require not installed unknown'));
  ok(rc('clean legacy loads static on both') === 0, 'clean exits 0');
  const h = require('../../lib/test/wait').spawnSync(process.execPath, [WL, '--help'], { encoding: 'utf8' }, 'wouldload check'); ok(h.status === 0 && /usage/i.test(h.stdout), '--help exits 0, got ' + h.status);
  // DET-FIX: two runs, same stdout bytes, and no clock in stdout or json
  { const a = await run(m('clean'), AS2), b = await run(m('clean'), AS2);
    ok(a.out === b.out && a.out.length > 0, 'two runs give the same stdout bytes');
    ok(!/^time: /m.test(a.out) && a.R && !('timing' in a.R) && !('ms' in a.R), 'no clock in stdout or json by default');
    const t = await run(m('clean'), [...AS2, '--time']); ok(/^time: /m.test(t.out) && t.R && 'timing' in t.R, '--time prints the clock'); }
  // vanilla warm run (refcheck seeds a mod run from the vanilla cache of the same exe): with neither the mod's cache nor the vanilla
  // cache of that exe and folder, one vanilla refcheck builds the vanilla cache first; the verdict is the same as a cold run; a second
  // run finds it and does not warm again; --no-warm never warms
  { const ix = require('../../entityindex/index'), WC = path.join(FX, 'cache-warm');
    const vanilla = ix.cachePath(path.join(__dirname, '..', '..', 'entityindex', 'cache', 'vanilla.json'), 'mowas_2', G);
    fs.rmSync(vanilla, { force: true }); fs.rmSync(WC, { recursive: true, force: true });
    const cold = await run(m('clean'), ['--exe', 'mowas2', '--time', '--cache-dir', WC]);
    ok(cold.R && cold.R.timing.mowas2 && cold.R.timing.mowas2.warm === undefined && !fs.existsSync(vanilla), '--no-warm: no warm run, no vanilla cache made', cold.out);
    fs.rmSync(WC, { recursive: true, force: true });
    const w1 = await run(m('clean'), ['--exe', 'mowas2', '--time', '--cache-dir', WC], true);
    ok(w1.R && typeof w1.R.timing.mowas2.warm === 'number' && fs.existsSync(vanilla) && /vanilla refcheck warm run/.test(w1.out), 'warm run builds the vanilla cache of mowas_2 first', w1.out);
    ok(w1.R && cold.R && w1.R.exes.mowas2.verdict === cold.R.exes.mowas2.verdict && w1.R.exes.mowas2.verdict === 'LOADS_STATIC', 'warm run: same verdict as cold', w1.out);
    fs.rmSync(WC, { recursive: true, force: true });
    const w2 = await run(m('clean'), ['--exe', 'mowas2', '--time', '--cache-dir', WC], true);
    ok(w2.R && w2.R.timing.mowas2.warm === undefined && w2.R.exes.mowas2.verdict === 'LOADS_STATIC', 'vanilla cache there: no second warm run', w2.out);
    fs.rmSync(vanilla, { force: true }); fs.rmSync(ix.cachePath(path.join(__dirname, '..', '..', 'entityindex', 'cache', 'vanilla.json'), 'as64', G), { force: true }); }
  // check-style overlays (tools/check overlay(): the game's folders junctioned, root files copied, the mod junctioned under mods/):
  // the stock index is keyed by the game, not the folder, so the first overlay run warms it and a second overlay of the same game
  // finds it (no second warm run, 1A)
  { const ix = require('../../entityindex/index'), van = path.join(__dirname, '..', '..', 'entityindex', 'cache', 'vanilla.json'), links = [];
    const overlay = name => {
      const ov = path.join(FX, name, 'game'), J = (t, l) => { fs.symlinkSync(t, l, 'junction'); links.push(l); };
      fs.mkdirSync(path.join(ov, 'mods'), { recursive: true });
      for (const e of fs.readdirSync(G, { withFileTypes: true })) { if (e.name === 'mods') continue; const p = path.join(G, e.name); if (e.isDirectory()) J(p, path.join(ov, e.name)); else fs.copyFileSync(p, path.join(ov, e.name)); }
      J(m('clean'), path.join(ov, 'mods', 'clean'));
      return ov;
    };
    const O1 = overlay('check-ov-wl1'), O2 = overlay('check-ov-wl2');
    const vG = ix.cachePath(van, 'mowas_2', G);
    ok(ix.cachePath(van, 'mowas_2', O1) === vG && ix.cachePath(van, 'mowas_2', O2) === vG, 'overlays of one game share its stock index file', [vG, ix.cachePath(van, 'mowas_2', O1)].join('\n'));
    fs.rmSync(vG, { force: true });
    const o1 = await run(path.join(O1, 'mods', 'clean'), ['--exe', 'mowas2', '--time', '--game', O1, '--cache-dir', path.join(FX, 'cache-ov1')], true);
    ok(o1.R && typeof o1.R.timing.mowas2.warm === 'number' && fs.existsSync(vG) && o1.R.exes.mowas2.verdict === 'LOADS_STATIC', 'first overlay run warms the stock index of the game', o1.out);
    const o2 = await run(path.join(O2, 'mods', 'clean'), ['--exe', 'mowas2', '--time', '--game', O2, '--cache-dir', path.join(FX, 'cache-ov2')], true);
    ok(o2.R && o2.R.timing.mowas2.warm === undefined && o2.R.exes.mowas2.verdict === 'LOADS_STATIC', 'second overlay run finds it: no second warm run', o2.out);
    for (const l of links.reverse()) { try { fs.rmdirSync(l); } catch { /* gone */ } }
    for (const d of ['check-ov-wl1', 'check-ov-wl2', 'cache-ov1', 'cache-ov2']) fs.rmSync(path.join(FX, d), { recursive: true, force: true });
    fs.rmSync(vG, { force: true }); fs.rmSync(ix.cachePath(van, 'as64', G), { force: true }); }
  // --restore-points: handed on to both sdllint and refcheck of a pass; off by default
  { const plan = { mounted: true, list: ['clean'] };
    const a = W.childArgs('mowas2', m('clean'), G, plan, 'c.json', {}), b = W.childArgs('mowas2', m('clean'), G, plan, 'c.json', { restorePoints: true });
    ok(!a.lintArgs.includes('--restore-points') && !a.refArgs.includes('--restore-points'), 'no --restore-points by default');
    ok(b.lintArgs.includes('--restore-points') && b.refArgs.includes('--restore-points'), '--restore-points goes to sdllint and refcheck', JSON.stringify(b));
    const inj = path.join(os.tmpdir(), `wl-inj-${process.pid}.json`); fs.writeFileSync(inj, '{"as2":{}}');
    const r = await run(m('clean'), [...AS2, '--restore-points', '--inject', inj]); fs.rmSync(inj, { force: true });
    ok(r.code === 0 && v(r, 'as64') === 'LOADS_STATIC', 'wouldload takes --restore-points', r.out); }
  // one listing per run: the children get it as --listing (a temp file, removed at exit); --keep-out records the arguments without it
  // (doctor compares those with its own), and the outputs are the ones of a run whose children list the mod themselves
  { const K = path.join(FX, 'keep-l'), lst = () => fs.readdirSync(os.tmpdir()).filter(f => /^wouldload-listing-/.test(f)).length, before = lst();
    const r1 = await run(m('crash_macro'), ['--exe', 'mowas2', '--keep-out', K]);
    const k = JSON.parse(fs.readFileSync(path.join(K, 'mowas2.sdllint.json'), 'utf8')), kr = JSON.parse(fs.readFileSync(path.join(K, 'mowas2.refcheck.json'), 'utf8'));
    ok(k.ok && kr.ok && !k.args.includes('--listing') && !kr.args.includes('--listing'), '--keep-out args carry no --listing', JSON.stringify([k.args, kr.args]));
    ok(lst() <= before, 'the listing temp file is gone after the run');
    const cp2 = require('child_process'), sd = require('../../lib/test/wait').spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'sdllint', 'sdllint.js'), ...k.args], { encoding: 'utf8' }, 'wouldload check');
    ok(sd.stdout === k.out, 'sdllint run alone (own listing) = the pass output', sd.stdout + '\n---\n' + k.out);
    ok(v(r1, 'mowas2') === 'LIKELY_CRASH', 'verdict with --keep-out', r1.out);
    fs.rmSync(K, { recursive: true, force: true }); }
  // reach cache (reachcache.js, job X2): every case again with a warm cache and with it off: the same stdout and json bytes;
  // off (--no-reach-cache, ARSENAL_REACH_CACHE=0) writes no cache file; an edit to a scratch copy of a mod is seen on the next run
  { const RD = path.join(FX, 'reach-cache'), rcArgs = a => [...a, '--reach-cache-dir', RD];
    const same = (a, b) => a.out === b.out && JSON.stringify(a.R) === JSON.stringify(b.R) && a.code === b.code;
    const reachCases = CASES.filter(c => c[2].includes('--reach-all') || /orph|reach|pak|dash|selector|filestem/.test(c[1]));
    const one = async ([name, dir, args]) => {
      const cold = await run(dir, rcArgs([...args, '--reach-all'])), warm = await run(dir, rcArgs([...args, '--reach-all'])), off = await run(dir, rcArgs([...args, '--reach-all', '--no-reach-cache']));
      ok(same(cold, warm) && same(cold, off), `reach cache: ${name}: cold, warm and off give the same bytes`, [cold.out, warm.out, off.out].join('\n----\n'));
    };
    await Promise.all(reachCases.map(one));
    ok(fs.existsSync(RD) && fs.readdirSync(RD).some(f => /^reach-[0-9a-f]{16}\.txt$/.test(f)), 'reach cache files written');
    const RD2 = path.join(FX, 'reach-cache-off');
    await run(m('orph_mixed'), ['--exe', 'mowas2', '--reach-all', '--no-reach-cache', '--reach-cache-dir', RD2]);
    const envOff = await new Promise(res => require('../../lib/test/wait').execFile(process.execPath, [WL, m('orph_mixed'), '--game', G, '--goh', H, '--cache-dir', CACHE, '--no-warm', '--exe', 'mowas2', '--reach-all', '--reach-cache-dir', RD2], { env: { ...process.env, ARSENAL_REACH_CACHE: '0' }, encoding: 'utf8', timeout: 900000 }, (e, out) => res(out), 'wouldload check'));
    ok(/VERDICT mowas2/.test(envOff) && !fs.existsSync(RD2), 'off: no reach cache file (flag and env)');
    // invalidation: scratch copy orph_mixed -> rc_edit; tank_o is ORPHAN, then named by an edit of s.set (same size, new mtime)
    const E = path.join(G, 'mods', 'rc_edit'); fs.rmSync(E, { recursive: true, force: true }); fs.cpSync(m('orph_mixed'), E, { recursive: true });
    const args = rcArgs(['--exe', 'mowas2', '--reach-all']);
    const r1 = await run(E, args);
    ok(r1.R && r1.R.exes.mowas2.reachAll.defs['resource/entity/o/tank_o.def'] === 'ORPHAN', 'rc_edit: tank_o ORPHAN at first', r1.out);
    const S = path.join(E, 'resource', 'set', 's.set'); fs.writeFileSync(S, '{tank_o}\r\n'.slice(0, fs.statSync(S).size).padEnd(fs.statSync(S).size, ' ')); const t1 = new Date(Date.now() + 3000); fs.utimesSync(S, t1, t1);
    const r2 = await run(E, args), r2off = await run(E, [...args, '--no-reach-cache']);
    ok(r2.R && r2.R.exes.mowas2.reachAll.defs['resource/entity/o/tank_o.def'] === 'REACHABLE' && same(r2, r2off), 'rc_edit: the edit is seen with the cache, same bytes as with it off', r2.out + '\n----\n' + r2off.out);
    fs.rmSync(path.join(E, 'resource', 'set', 's.set'));
    const r3 = await run(E, args), r3off = await run(E, [...args, '--no-reach-cache']);
    ok(same(r3, r3off) && r3.R.exes.mowas2.reachAll.defs['resource/entity/o/tank_o.def'] === 'ORPHAN', 'rc_edit: file removed: same bytes as off', r3.out);
    fs.rmSync(E, { recursive: true, force: true }); fs.rmSync(RD, { recursive: true, force: true }); }
  console.log(`${n} checks, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
