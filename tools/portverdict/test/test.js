// portverdict test: fixture mod (mkfixture.js) + stub parts (fx/). Offline join always; live sdllint + check on the fixture when G exists.
// Author: Imperator_Aug (ARSENAL, ia-d5bd6259)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '../../..');
const TOOL = path.join(ROOT, 'tools/portverdict/portverdict.js');
const WORK = path.join(__dirname, 'work'), MOD = path.join(WORK, 'mod'), FX = path.join(__dirname, 'fx');
const G = process.env.AS2_GAME || require('../../lib/games').install('as64').dir || '';   // the AS2 install through lib/gamedir
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('FAIL ' + m); } };
cp.execFileSync(process.execPath, [path.join(__dirname, 'mkfixture.js'), MOD], { cwd: ROOT });
const run = (name, parts, game, extra) => {
  const j = path.join(WORK, name + '.json');
  const args = [TOOL, MOD, ...(game ? ['--game', game] : []), ...(extra || []), '--json', j];
  for (const [k, f] of Object.entries(parts)) args.push('--part', k + '=' + f);
  const r = cp.spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) { console.log(r.stdout + r.stderr); }
  return { status: r.status, text: r.stdout, raw: fs.existsSync(j) ? fs.readFileSync(j, 'utf8') : '', rec: fs.existsSync(j) ? JSON.parse(fs.readFileSync(j, 'utf8')) : null };
};
const stub = { native: path.join(FX, 'native.json'), sdllint: path.join(FX, 'sdllint.json'), check: path.join(FX, 'check.json'), unitbox: path.join(FX, 'unitbox.json') };
// expected failing part per unit ('' = native)
const EXP = { pv_clean: '', pv_txt: '', pv_keys: 'keys', pv_vals: 'values', pv_syn: 'syntax', pv_path: 'refs', pv_weap: 'refs', pv_inc: 'refs', pv_box: 'scale', pv_gaps: 'gaps' };
const failing = v => ['keys', 'values', 'syntax', 'refs', 'scale'].filter(p => v[p].ok === false).concat(v.gaps.hand !== 0 || v.gaps.unexplained !== 0 ? ['gaps'] : []).join(',');
function verify(tag, R) {
  ok(R.status === 0 && R.rec, tag + ': ran');
  if (!R.rec) return;
  ok(R.rec.form === 'verdict/1' && R.rec.mod === 'mod', tag + ': form/mod');
  ok(R.rec.units.length === 10, tag + ': 10 units (classless one skipped) got ' + R.rec.units.length);
  for (const v of R.rec.units) {
    ok(failing(v) === EXP[v.unit], `${tag}: ${v.unit} fails [${failing(v)}] want [${EXP[v.unit]}]`);
    ok(v.native === (EXP[v.unit] === ''), `${tag}: ${v.unit} native ${v.native}`);
    ok(v.bar === (EXP[v.unit] === '' || EXP[v.unit] === 'values'), `${tag}: ${v.unit} bar ${v.bar} (values alone fails native, not bar)`);
  }
  const c = R.rec.counts;
  ok(c.units === 10 && c.native === 2 && c.bar === 3 && JSON.stringify(c.byPart) === '{"keys":1,"values":1,"syntax":1,"refs":3,"scale":1,"gaps":1}', tag + ': counts ' + JSON.stringify(c));
  const by = Object.fromEntries(R.rec.units.map(v => [v.unit, v]));
  ok(by.pv_txt.scale.ok === null, tag + ': box null -> scale ok null');
  ok(/WARN_PATHER_UNKNOWN/.test(by.pv_path.refs.first.join(' ')), tag + ': pather caught ' + JSON.stringify(by.pv_path.refs));
  ok(/REF_WEAPON_UNKNOWN/.test(by.pv_weap.refs.first.join(' ')) && /REF_AMMO_UNKNOWN/.test(by.pv_weap.refs.first.join(' ')), tag + ': weapon + ammo caught ' + JSON.stringify(by.pv_weap.refs));
  ok(/INCLUDE_MISSING/.test(by.pv_inc.refs.first.join(' ')), tag + ': include caught');
  ok(by.pv_syn.syntax.n >= 1 && by.pv_inc.syntax.ok === true, tag + ': include is refs, not syntax');
  ok(!/[A-Za-z]:[\\/]/.test(R.raw), tag + ': no absolute path');
  ok(/^KVSRBG NATIVE pv_clean/m.test(R.text) && /^KvSR.G bar {4}pv_vals/m.test(R.text) && /3 bar, 2 of 10 native/.test(R.text) && /^KVSr\.G no {5}pv_path/m.test(R.text), tag + ': text letters');
}
const A = run('stub', stub), B = run('stub2', stub);
verify('stub', A);
ok(A.raw === B.raw && A.text === B.text, 'stub: two runs equal bytes');
// a part that fails: ok null with why, unit not native
const C = run('nocheck', Object.assign({}, stub, { check: path.join(FX, 'absent.json') }));
ok(C.rec && C.rec.units.every(v => v.refs.ok === null && v.refs.why && !v.native), 'failed part: refs null, nobody native');
// unitbox absent: scale null, clean unit still native
const D = run('nobox', Object.assign({}, stub, { unitbox: path.join(FX, 'absent.json') }));
ok(D.rec && D.rec.units.every(v => v.scale.ok === null) && D.rec.units.find(v => v.unit === 'pv_clean').native, 'unitbox absent: scale null, clean native');
// text-only port, box from model plys (unitbox src goh-ply): scale judged, src passed through
{
  const ub = JSON.parse(fs.readFileSync(stub.unitbox, 'utf8'));
  for (const b of ub.units) if (b.unit === 'pv_clean') { b.src = 'goh-ply'; b.why = 'goh source model (2 ply from GoH)'; }
  const f = path.join(WORK, 'unitbox-gohply.json'); fs.writeFileSync(f, JSON.stringify(ub));
  const E = run('gohply', Object.assign({}, stub, { unitbox: f }));
  const v = E.rec && E.rec.units.find(x => x.unit === 'pv_clean');
  ok(v && v.scale.ok === true && v.scale.src === 'goh-ply' && /^goh source model/.test(v.scale.why) && v.native, 'goh-ply box: scale judged, src kept ' + JSON.stringify(v && v.scale));
}
// game parity: --exe / --target reach the part tools; no build named = the AS64 lists as before
{
  const { childArgs } = require(TOOL);
  const base = { mod: 'M', game: 'G', goh: 'H' };
  const a = childArgs(base), m = childArgs({ ...base, exe: 'mowas2' }), t = childArgs({ ...base, target: 'mowas2' }), x = childArgs({ ...base, exe: 'as64' });
  ok(JSON.stringify(a.sdllint) === '["M","--game","G","--format","json"]' && JSON.stringify(a.check) === '["M","--game","G","--goh","H","--target","as64","--locs","1000000","-q"]', 'no build named: AS64 child lists as before ' + JSON.stringify(a));
  ok(JSON.stringify(m.sdllint) === '["M","--game","G","--exe","mowas_2","--format","json"]' && m.check.join(' ').includes('--target mowas2'), '--exe mowas2: sdllint --exe mowas_2, check --target mowas2 ' + JSON.stringify(m));
  ok(JSON.stringify(t) === JSON.stringify(m), '--target mowas2 = --exe mowas2');
  ok(x.sdllint.join(' ').includes('--exe as64') && x.check.join(' ').includes('--target as64'), '--exe as64: named, as64 lists with --exe as64');
  ok(JSON.stringify(m.native) === JSON.stringify(a.native) && JSON.stringify(m.unitbox) === JSON.stringify(a.unitbox), 'native and unitbox lists do not change (base data shared)');
  const g = cp.spawnSync(process.execPath, [TOOL, MOD, '--exe', 'goh'], { cwd: ROOT, encoding: 'utf8' });
  ok(g.status === 2 && /^portverdict: not available for GoH: .*\(plan\/reports\/game-parity\/t-port-b\.md: n\/a \(source game\)\)\s*$/.test(g.stderr), '--exe goh: one plain line, exit 2 ' + g.status + g.stderr);
  const two = cp.spawnSync(process.execPath, [TOOL, MOD, '--exe', 'as64', '--target', 'mowas2'], { cwd: ROOT, encoding: 'utf8' });
  ok(two.status === 2, '--exe and --target that disagree: exit 2');
  const S = run('stub-mow', stub, null, ['--exe', 'mowas_2']);
  ok(S.raw === A.raw, 'all parts given: --exe mowas_2 joins the same parts to the same bytes');
}
// live sdllint + check on the fixture (native and unitbox stay stubs: hand-written defs have no vanilla peers)
if (G && (fs.existsSync(path.join(G, 'resource')) || fs.existsSync(G))) {
  const L = run('live', { native: stub.native, unitbox: stub.unitbox }, G);
  verify('live', L);
  const LM = run('live-mow', { native: stub.native, unitbox: stub.unitbox }, G, ['--exe', 'mowas_2']);
  verify('live --exe mowas_2', LM);
} else console.log('live part skipped: no AS2 install found');
console.log(`${n - fails}/${n} ok`);
console.log(fails ? 'FAIL' : 'PASS');
process.exit(fails ? 1 : 0);
