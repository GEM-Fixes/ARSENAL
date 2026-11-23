// flags honoured or refused, --then-fix chain, hardlink of unchanged paks (source untouched after a write)
// Author: Imperator_Aug (ARSENAL, ia-87ef4352)
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const { writeZip } = require('../../lib/zipwrite'), pak = require('../../lib/pak');
const w = process.argv[2]; let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const js = path.join(__dirname, '../upgrade.js'), none = path.join(w, 'none');
const run = (...a) => cp.spawnSync(process.execPath, [js, ...a, '--as2', none, '--goh', none], { encoding: 'utf8' });
const pk = (f, list) => writeZip(f, list.map(([n, b]) => [n, Buffer.from(b), true]));
const sha = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const tree = d => { const o = {}; (function g(x) { for (const e of fs.readdirSync(x, { withFileTypes: true })) { const p = path.join(x, e.name); if (e.isDirectory()) g(p); else { const s = fs.statSync(p); o[p] = sha(p) + s.size + ':' + s.mtimeMs; } } })(d); return JSON.stringify(o); };
const m = path.join(w, 'mod'); fs.mkdirSync(path.join(m, 'resource'), { recursive: true });
fs.writeFileSync(path.join(m, 'mod.info'), '{mod\r\n\t{name "c"}\r\n\t{MinGameVersion "3.262.1"}\r\n\t{MaxGameVersion "3.262.1"}\r\n}\r\n');
pk(path.join(m, 'resource/same.pak'), [['set/keep.def', '{keep}\r\n'], ['texture/big.dds', 'D'.repeat(200000)]]);
pk(path.join(m, 'resource/t.pak'), [['set/stuff/s.def', '{include "/properties/resupply_generic.inc"}\r\n'], ['entity/inventory/q.def', '{q}\r\n']]);
const before = tree(m);

// --- plan: each flag is honoured or refused
const base = ['--to', 'goh', '--plan', '--goh-version', '1.067.0'];
const p0 = run(m, '--to', 'goh', '--plan');
ok(p0.status === 0 && !/WITH /.test(p0.stdout), 'plain plan has no dry run section: ' + p0.stderr);
const po = run(m, ...base, '--only', 'entity/inventory');
ok(po.status === 0 && /WITH --only entity\/inventory/.test(po.stdout) && /outside --only/.test(po.stdout), 'plan honours --only: ' + po.stdout + po.stderr);
const pd = run(m, ...base, '--drop', 'entity');
ok(pd.status === 0 && /under --drop/.test(pd.stdout), 'plan honours --drop: ' + pd.stdout + pd.stderr);
const pt = path.join(w, 'patch'); fs.mkdirSync(path.join(pt, 'resource/set/stuff'), { recursive: true }); fs.writeFileSync(path.join(pt, 'resource/set/stuff/s.def'), '{patched}\r\n');
const pp = run(m, ...base, '--patch', pt);
ok(pp.status === 0 && /file from --patch/.test(pp.stdout), 'plan honours --patch: ' + pp.stdout + pp.stderr);
const pm = run(m, '--to', 'as64', '--plan', '--mode', 'enhanced');
ok(pm.status === 0 && /WITH --mode enhanced/.test(pm.stdout) && /mod\.info version range/.test(pm.stdout), 'plan honours --mode: ' + pm.stdout + pm.stderr);
ok(run(m, ...base, '--donor', 'auto').status === 0, 'plan honours --donor (as2togoh row present)');
for (const f of [['--carry'], ['--then-fix'], ['--no-link'], ['--carry', '--drop-dangling']]) { const r = run(m, ...base, ...f); ok(r.status === 2 && /needs a write/.test(r.stderr), 'plan refuses ' + f + ': ' + r.status + r.stderr); }
ok(run(m, '--to', 'goh', '--out', path.join(w, 'x1'), '--carry-max', '5', '--goh-version', '1.067.0').status === 2, '--carry-max without --carry refused');
ok(run(m, '--to', 'as64', '--plan', '--goh-version', '1.067.0').status === 2, '--goh-version off goh refused');
ok(run(m, '--to', 'as64', '--plan', '--donor', 'auto').status === 2, '--donor off goh refused');
ok(run(m, '--to', 'goh', '--from', 'goh', '--out', path.join(w, 'x2'), '--donor', 'auto', '--goh-version', '1.067.0').status === 2, '--donor goh->goh refused (no as2togoh row)');

ok(/--to-build/.test(run(m).stderr), '--to-build in usage');
ok(run(m, ...base, '--to-build', '1.067.0').status === 0, '--to-build accepted');
ok(tree(m) === before, 'mod untouched by plans');

// --- hardlink: unchanged pak shares storage, a write never touches the source
const o1 = path.join(w, 'o1'), r1 = run(m, '--to', 'goh', '--out', o1, '--goh-version', '1.067.0');
ok(r1.status === 3 || r1.status === 0, 'write ran: ' + r1.stdout + r1.stderr);
ok(/1 of those hardlinked \(\d+\.\d MB not copied/.test(r1.stdout),'saved MB printed: ' + r1.stdout);
const same = path.join(m, 'resource/same.pak'), sameO = path.join(o1, 'resource/same.pak');
const linked = fs.statSync(sameO).ino === fs.statSync(same).ino && fs.statSync(same).nlink > 1;
console.log('info: hardlink on this volume: ' + linked);
ok(Buffer.compare(fs.readFileSync(same), fs.readFileSync(sameO)) === 0, 'unchanged pak identical');
ok(fs.statSync(path.join(o1, 'resource/t.pak')).ino !== fs.statSync(path.join(m, 'resource/t.pak')).ino, 'rebuilt pak is its own file');
ok(tree(m) === before, 'source mod unchanged after a write with hardlinks');
// a --patch that lands on the hardlinked pak's own name is written through a fresh file, never through the link
const pt2 = path.join(w, 'patch2'); fs.mkdirSync(path.join(pt2, 'resource'), { recursive: true }); pk(path.join(pt2, 'resource/same.pak'), [['x', 'PATCH']]);
const o2 = path.join(w, 'o2'); run(m, '--to', 'goh', '--out', o2, '--patch', pt2, '--goh-version', '1.067.0');
ok(tree(m) === before, 'source unchanged after a patch named like a linked pak');
// carry-style in-place edit through the writer's output must not reach the source: rename/unlink break the link, checked by the source tree above
const o3 = path.join(w, 'o3'), r3 = run(m, '--to', 'goh', '--out', o3, '--no-link', '--goh-version', '1.067.0');
ok(fs.statSync(path.join(o3, 'resource/same.pak')).ino !== fs.statSync(same).ino && !/hardlinked/.test(r3.stdout), '--no-link copies');

// --- chain. the real fix + check on a full AS2 install take minutes (check ~2 min), so the suite runs stubs of both through UPGRADE_CHAIN_STUB;
// the real pair was run by hand (UPGRADE_TEST_REAL=1 runs it here)
const gh = path.join(w, 'fakegame'); fs.mkdirSync(path.join(gh, 'resource'), { recursive: true });
const log = path.join(w, 'stub.log'), env = { ...process.env, UPGRADE_CHAIN_STUB: path.join(__dirname, 'stub'), UPGRADE_STUB_LOG: log };
const chain = (extra, e) => cp.spawnSync(process.execPath, [js, m, '--to', 'as64', '--then-fix', '--as2', gh, '--goh', none, ...extra], { encoding: 'utf8', env: { ...env, ...e } });
const o4 = path.join(w, 'o4'), r4 = chain(['--out', o4], {});
ok(/CHAIN {3}upgrade -> fix/.test(r4.stdout) && /\n {2}upgrade {2}static clean/.test(r4.stdout) && /\n {2}fix {6}2 applied, 1 left to a person/.test(r4.stdout) && /\n {2}check {4}as64: LOADS_STATIC: stub/.test(r4.stdout) && /tests owed/.test(r4.stdout), 'chain prints upgrade, fix, check, tests owed: ' + r4.stdout.slice(-700) + r4.stderr);
const lg = fs.readFileSync(log, 'utf8');
ok(/^fix .* apply --out .*o4-fixpatch --game .*fakegame --only lng,repoint,include,macro,stubmtl --json/m.test(lg) && !/quarantine/.test(lg), 'fix called safe, apply, target game: ' + lg);
ok(/^check .*--exe as64 .*--with .*o4-fixpatch/m.test(lg) && !/--fast/.test(lg), 'check gets the patch, no --fast when the usage lacks it: ' + lg);
ok(fs.readFileSync(path.join(o4, 'UPGRADE.md'), 'utf8').includes('CHAIN'), 'chain appended to UPGRADE.md');
fs.rmSync(log); chain(['--out', path.join(w, 'o6')], { UPGRADE_STUB_FAST: '1' });
ok(/^check .*--fast/m.test(fs.readFileSync(log, 'utf8')), '--fast used when check lists it');
ok(tree(m) === before, 'source mod unchanged after chain');
const r5 = cp.spawnSync(process.execPath, [js, m, '--to', 'as64', '--out', path.join(w, 'o5'), '--then-fix', '--as2', none, '--goh', none], { encoding: 'utf8', env });
ok(r5.status === 3 && /fix\/check not run|CHAIN/.test(r5.stdout), 'no install: exit 3 and chain says so or runs: ' + r5.status + r5.stdout.slice(-300));
if (process.env.UPGRADE_TEST_REAL) {
  const g = process.env.UPGRADE_TEST_REAL, r = cp.spawnSync(process.execPath, [js, m, '--to', 'as64', '--out', path.join(w, 'o7'), '--then-fix', '--as2', g, '--goh', none], { encoding: 'utf8' });
  ok(/\n {2}fix {6}/.test(r.stdout) && /\n {2}check {4}/.test(r.stdout), 'real chain: ' + r.stdout.slice(-600));
}
process.exit(bad ? 1 : 0);
