// Author: Imperator_Aug (ARSENAL, ia-1aaa4539)
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process'), zlib = require('zlib');
const w = fs.mkdtempSync(path.join(os.tmpdir(), 'relchk-'));
const TOOL = path.join(__dirname, '..', 'release-check.js');
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const as2 = path.join(w, 'as2'), goh = path.join(w, 'goh'), snaps = path.join(w, 'snaps'), out = path.join(w, 'out'), log = path.join(w, 'log.md');
const put = (d, f, s) => { const p = path.join(d, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
put(as2, 'as64.exe', 'MZ one'); put(as2, 'resource/set/a.set', '{a 1}\r\n');
put(goh, 'binaries/x64/call_to_arms.exe', 'MZ goh'); put(goh, 'resource/set/b.set', '{b 1}\r\n');
fs.writeFileSync(log, '');
const run = (...x) => spawnSync(process.execPath, [TOOL, '--as2', as2, '--goh', goh, '--snaps', snaps, '--out', out, '--log', log, '--no-upstream', ...x], { encoding: 'utf8', maxBuffer: 1 << 26 });

let r = run();
ok(r.status === 1 && /no baseline/.test(r.stdout) && /first|nothing to compare/.test(r.stdout), 'first run writes baselines, says so: ' + r.status + r.stderr);
ok(fs.readdirSync(snaps).filter(f => f.endsWith('.json.gz')).length === 2, 'two baselines');
const sums = () => { const m = {}; for (const f of fs.readdirSync(as2)) if (f.endsWith('.exe')) m[f] = fs.readFileSync(path.join(as2, f)).toString('hex'); return m; };
// log the shas so only the baseline logic is left
const { identify } = require('../../lib/exever');
const full = f => require('crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex');
fs.writeFileSync(log, [path.join(as2, 'as64.exe'), path.join(goh, 'binaries/x64/call_to_arms.exe')].map(full).join('\n'));
r = run();
ok(r.status === 0 && /NOTHING CHANGED/.test(r.stdout) && /same as baseline/.test(r.stdout), 'second run: nothing changed: ' + r.status + r.stdout.slice(0, 200) + r.stderr);

const before = sums();
const newer = Date.now() / 1000 + 5;
put(as2, 'as64.exe', 'MZ two'); put(as2, 'resource/set/a.set', '{a 2}\r\n'); put(as2, 'resource/set/c.set', '{c 1}\r\n');
r = run();
ok(r.status === 1 && /CHANGED/.test(r.stdout) && /EXE_NEW_BUILD/.test(r.stdout), 'new exe seen, log row asked for: ' + r.status + r.stderr);
const rules = fs.existsSync(out) ? fs.readdirSync(out).filter(f => /^as64-.*\.rules\.json$/.test(f)) : [];
ok(rules.length === 1, 'draft rows written beside the report, not in tools/upgrade/rules: ' + rules);
ok(JSON.parse(fs.readFileSync(path.join(out, rules[0]), 'utf8')).every(x => x.tag === 'I'), 'draft rows are all [I]');
ok(fs.readdirSync(snaps).filter(f => /^as64-as2-/.test(f)).length === 2, 'old baseline stays');
ok(fs.readFileSync(path.join(as2, 'resource/set/c.set'), 'latin1') === '{c 1}\r\n', 'game data untouched');
ok(/set\/c\.set|added/.test(r.stdout), 'report lists what changed: ' + r.stdout.slice(0, 300));

// DOOR-B5: no exe log file (shipped copy / exe) = no false CHANGED; unchanged exe with a baseline = exit 0
{
  const nolog = path.join(w, 'nolog.md'), sn2 = path.join(w, 'snaps2'), o2 = path.join(w, 'out2');
  const run2 = () => spawnSync(process.execPath, [TOOL, '--as2', as2, '--goh', goh, '--snaps', sn2, '--out', o2, '--log', nolog, '--no-upstream'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  let q = run2();
  ok(!/EXE_NEW_BUILD/.test(q.stdout) && /build-log check skipped/.test(q.stdout), 'no exe log: skipped, no EXE_NEW_BUILD: ' + q.stdout.slice(0, 200));
  q = run2();
  ok(q.status === 0 && /NOTHING CHANGED/.test(q.stdout), 'no exe log, unchanged exe, baseline there: exit 0 not CHANGED: ' + q.status + q.stdout.slice(0, 200));
}
// DOOR-B5: shipped layout (no beside the tool) must not write run/ beside the tool; default goes to <AS2_HOME>/.as2/run
{
  const T = path.join(w, 'ship', 'tools'), H = path.join(w, 'ship', 'home');
  fs.mkdirSync(path.join(T, 'release-check'), { recursive: true }); fs.mkdirSync(H, { recursive: true });
  fs.copyFileSync(TOOL, path.join(T, 'release-check', 'release-check.js'));
  for (const d of fs.readdirSync(path.join(__dirname, '..', '..'))) if (d !== 'release-check' && !fs.existsSync(path.join(T, d)) && fs.statSync(path.join(__dirname, '..', '..', d)).isDirectory()) fs.symlinkSync(path.join(__dirname, '..', '..', d), path.join(T, d), 'junction');
  const q = spawnSync(process.execPath, [path.join(T, 'release-check', 'release-check.js'), '--as2', as2, '--goh', goh, '--no-upstream'], { encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, AS2_HOME: H, AS64_RUN: '' } });
  ok(fs.existsSync(path.join(H, '.as2', 'run', 'snaps')) && !fs.existsSync(path.join(w, 'ship', 'run')), 'shipped layout: snaps under <home>/.as2/run, none beside the tool: ' + q.stdout.slice(0, 200) + q.stderr.slice(0, 200));
}

// --promote: temp rules dir only, never tools/upgrade/rules
const rd = path.join(w, 'rules'), draft = path.join(w, 'draft.json');
const row = (id, extra) => ({ id, kind: 'warn', from: 'as64', to: 'as64', scope: '*.def', action: 'warn', evidence: 'e', tag: 'I', origin: 'x', test: 't', detect: { type: 'text', files: '\\.def$', re: 'zzz' }, msg: 'm', since: 'abc12345', ...extra });
put(rd, 'as2/as64--as64.json', JSON.stringify([row('old-1', { origin: 'manual', tag: 'V' })], null, 1));
fs.writeFileSync(draft, JSON.stringify([row('old-1'), row('new-1'), row('new-2', { tag: 'T' })]));
const prom = (...x) => spawnSync(process.execPath, [TOOL, '--rules-dir', rd, ...x], { encoding: 'utf8' });
r = prom('--promote', draft, '--dry');
ok(r.status === 0 && /added new-1/.test(r.stdout) && /dry/.test(r.stdout) && JSON.parse(fs.readFileSync(path.join(rd, 'as2/as64--as64.json'), 'utf8')).length === 1, '--promote --dry writes nothing: ' + r.stdout + r.stderr);
r = prom('--promote', draft);
const after = JSON.parse(fs.readFileSync(path.join(rd, 'as2/as64--as64.json'), 'utf8'));
ok(r.status === 0 && after.length === 3 && /added new-1/.test(r.stdout) && /added new-2/.test(r.stdout) && /skipped old-1/.test(r.stdout), '--promote adds 2, skips the dup: ' + r.stdout + r.stderr);
ok(after[0].origin === 'manual' && after[0].tag === 'V' && after[1].origin === 'auto' && after[2].tag === 'T', 'existing row kept, new ones origin auto, tag kept');
r = prom('--promote', draft);
ok(r.status === 0 && /0 added, 3 skipped/.test(r.stdout) && JSON.parse(fs.readFileSync(path.join(rd, 'as2/as64--as64.json'), 'utf8')).length === 3, '--promote twice: deduped');
fs.writeFileSync(draft, JSON.stringify([row('ok-1'), row('no-action', { action: undefined }), { kind: 'warn', from: 'as64', to: 'as64', action: 'warn' }]));
r = prom('--promote', draft);
ok(r.status === 2 && /no action/.test(r.stdout) && /no id/.test(r.stdout) && JSON.parse(fs.readFileSync(path.join(rd, 'as2/as64--as64.json'), 'utf8')).length === 3, '--promote refuses rows without id/action, writes nothing: ' + r.stdout);
// --replan: upgrade --plan on a folder; draft-only rows are not in the real table, so no hit (hit path needs a promoted row)
const mod = path.join(w, 'rpmod');
put(mod, 'mod.info', '{Mod\r\n\t{Name "rp"}\r\n\t{MinGameVersion "3.301"}\r\n}\r\n'); put(mod, 'resource/entity/a/a.def', '{a zzz}\r\n');
fs.writeFileSync(draft, JSON.stringify([row('hit-1')]));
r = spawnSync(process.execPath, [TOOL, '--draft', draft, '--replan', mod, '--as2', as2], { encoding: 'utf8' });
ok(r.status === 0 && /replan: upgrade --plan --to as64/.test(r.stdout) && /rpmod \(as64 -> as64\)/.test(r.stdout), '--replan runs upgrade --plan on the mod: ' + r.stdout.slice(0, 400) + r.stderr.slice(0, 300));
ok(spawnSync(process.execPath, [TOOL, '--replan'], { encoding: 'utf8' }).status === 2, '--replan without mods: exit 2');
ok(spawnSync(process.execPath, [TOOL, '--nope'], { encoding: 'utf8' }).status === 2, 'bad flag: exit 2');
// --publish GoH guard (PACKGUARD; full seeded set in tools/packer/test/guard.js)
const gmod = path.join(w, 'gmod'), origin = require('../../goh2as2/origin');
put(gmod, 'resource/entity/g/a.def', '{goh 1}\r\n'); origin.record(gmod, [{ file: 'resource/entity/g/a.def', tool: 'goh2as2', src: 'entity/a' }]);
put(gmod, 'resource/entity/g/privateer.pak', 'not a marker');
const pub = m => spawnSync(process.execPath, [TOOL, '--publish', m, '--as2', as2], { encoding: 'utf8' });
r = pub(gmod);
ok(r.status === 1 && /PACK_GOH_ORIGIN/.test(r.stdout) && !/PACK_PRIVATE/.test(r.stdout), '--publish refuses a GOH-ORIGIN file, privateer.pak is no marker: ' + r.stdout);
put(gmod, 'resource/entity/g/a.def', '{own 2}\r\n');
r = pub(gmod);
ok(r.status === 0 && /GOH_ORIGIN_CHANGED/.test(r.stdout), '--publish passes once the GoH bytes are replaced: ' + r.stdout);
put(gmod, 'resource/b.def', '{goh 1}\r\n');
ok(pub(gmod).status === 1, '--publish refuses GoH bytes under another name');
// --exe (game parity): mowas_2 reads mowas_2.exe under --as2 with its own baseline label; goh and as64 only their own; no --exe = as before
{
  const d = path.join(w, 'ex'), a2 = path.join(d, 'as2'), sn = path.join(d, 'snaps'), o3 = path.join(d, 'out'), lg = path.join(d, 'log.md');
  put(a2, 'as64.exe', 'MZ a64'); put(a2, 'mowas_2.exe', 'MZ mow'); put(a2, 'resource/set/a.set', '{a 1}\r\n'); put(a2, 'as64/core/x.set', '{x 1}\r\n'); fs.writeFileSync(lg, '');
  const snapOf = l => { const f = fs.readdirSync(sn).find(x => x.startsWith(l + '-')); return JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(sn, f)))); };
  const rx = (...x) => spawnSync(process.execPath, [TOOL, '--as2', a2, '--goh', goh, '--snaps', sn, '--out', o3, '--log', lg, '--no-upstream', ...x], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const labels = () => (fs.existsSync(sn) ? fs.readdirSync(sn) : []).map(f => f.replace(/-[0-9a-f]{8}\.json\.gz$/, '')).sort().join(',');
  let q = rx('--exe', 'mowas_2');
  ok(q.status === 1 && /^mowas2: exe no baseline -> /m.test(q.stdout) && !/^as64:|^goh:/m.test(q.stdout) && labels() === 'mowas2-as2', '--exe mowas_2: only mowas_2.exe, baseline mowas2-as2: ' + labels() + ' ' + q.stdout.slice(0, 300) + q.stderr);
  { const s = snapOf('mowas2-as2'); ok(!Object.keys(s.loose).some(k => /^as64\//i.test(k)) && s.loose['resource/set/a.set'], 'mowas2 baseline leaves out the as64/ layer, keeps the rest: ' + Object.keys(s.loose).join(',')); }
  fs.writeFileSync(lg, [path.join(a2, 'as64.exe'), path.join(a2, 'mowas_2.exe'), path.join(goh, 'binaries/x64/call_to_arms.exe')].map(full).join('\n'));
  q = rx('--exe', 'mowas2');
  ok(q.status === 0 && /^mowas2: [0-9a-f]{8} same as baseline/m.test(q.stdout), '--exe mowas2 (GUI id) = mowas_2, second run unchanged: ' + q.stdout.slice(0, 300));
  put(a2, 'mowas_2.exe', 'MZ mow two'); put(a2, 'resource/set/c.set', '{c 1}\r\n');
  q = rx('--exe', 'mowas_2');
  ok(q.status === 1 && /^mowas2: exe [0-9a-f]{8} -> /m.test(q.stdout) && fs.readdirSync(o3).some(f => /^mowas2-.*\.rules\.json$/.test(f)), '--exe mowas_2: new mowas_2.exe seen, draft rows mowas2-*: ' + q.stdout.slice(0, 300));
  q = rx('--exe', 'goh');
  ok(/^goh: /m.test(q.stdout) && !/^as64:|^mowas2:/m.test(q.stdout), '--exe goh: only the GoH exe: ' + q.stdout.slice(0, 200));
  q = rx('--exe', 'as64');
  ok(/^as64: /m.test(q.stdout) && !/^goh:|^mowas2:/m.test(q.stdout), '--exe as64: only as64.exe: ' + q.stdout.slice(0, 200));
  ok(snapOf('as64-as2').loose['as64/core/x.set'], 'as64 baseline still holds the as64/ layer');
  q = rx();
  ok(/^as64: /m.test(q.stdout) && /^goh: /m.test(q.stdout) && !/^mowas2:/m.test(q.stdout), 'no --exe: as64 and goh as before, no mowas_2 line');
  ok(rx('--exe', 'bogus').status === 2 && rx('--exe', 'as64.exe').status === 2, '--exe with an unknown word: exit 2');
  ok(spawnSync(process.execPath, [TOOL, '--help'], { encoding: 'utf8' }).stdout.includes('--exe as64|mowas_2|mowas2|goh'), '--help names --exe');
}
// --replan --to mowas2|mowas_2|goh (share page "game updated" of MoW:AS2 / GoH); no --to = the --exe game; bad words exit 2
{
  const rp = (...x) => spawnSync(process.execPath, [TOOL, '--replan', ...x, '--as2', as2, '--goh', goh], { encoding: 'utf8', maxBuffer: 1 << 26 });
  let q = rp(mod, '--to', 'mowas_2');
  ok(q.status === 0 && /replan: upgrade --plan --to mowas2 /.test(q.stdout) && /rpmod \(as64 -> mowas2\)/.test(q.stdout), '--replan --to mowas_2 = mowas2: ' + q.stdout.slice(0, 400) + q.stderr.slice(0, 200));
  q = rp(mod, '--exe', 'mowas_2');
  ok(q.status === 0 && /replan: upgrade --plan --to mowas2 /.test(q.stdout), '--replan with --exe mowas_2 and no --to targets mowas2: ' + q.stdout.slice(0, 300));
  q = rp(mod, '--to', 'goh');
  ok(q.status === 0 && /replan: upgrade --plan --to goh /.test(q.stdout) && !/no such mod folder/.test(q.stdout) && /\(as64 -> goh\)|plan failed/.test(q.stdout), '--replan --to goh runs upgrade --plan --to goh: ' + q.stdout.slice(0, 400));
  put(goh, 'mods/ghm/mod.info', '{Mod\r\n\t{Name "ghm"}\r\n}\r\n'); put(goh, 'mods/ghm/resource/set/b.set', '{b 2}\r\n');
  q = rp('ghm', '--to', 'goh', '--from', 'goh');
  ok(q.status === 0 && !/no such mod folder/.test(q.stdout) && /--from goh/.test(q.stdout), '--replan finds a mod name under <goh>/mods: ' + q.stdout.slice(0, 400));
  q = rp('nosuchmod', '--to', 'goh');
  ok(/nosuchmod: no such mod folder \(not a path, not under .*\/mods or .*\/mods\)/.test(q.stdout), 'missing mod names both mods folders: ' + q.stdout.slice(0, 300));
  ok(rp(mod, '--to', 'bogus').status === 2 && rp(mod, '--to', 'goh@abc').status === 2 && rp(mod, '--from', 'nope').status === 2, '--to/--from with an unknown word (or --to with @sha): exit 2');
}
fs.rmSync(w, { recursive: true, force: true });
console.log(bad ? 'FAIL' : 'PASS');
process.exit(bad ? 1 : 0);
