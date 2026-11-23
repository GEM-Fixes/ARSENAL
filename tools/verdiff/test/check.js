// seeded fixtures for verdiff: renames, unrelated pair, CRC rename, key counts, one-to-one, snap input
// Author: Imperator_Aug (ARSENAL, ia-2218d8fb)
const fs = require('fs'), path = require('path'), zlib = require('zlib'), cp = require('child_process');
const { run } = require('../verdiff'), { snap } = require('../../snap/snap');
const w = process.argv[2];
let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const put = (r, f, s) => { const p = path.join(w, r, 'resource', f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const def = (keys, extra = '') => '{rifle\n' + keys.map((k, i) => `  {${k} ${i + 1} "v_${k}"}\n`).join('') + extra + '}\n';
const K1 = ['health', 'armor', 'speed', 'mesh', 'range', 'reload'], K2 = ['sight', 'recoil', 'spread', 'burst', 'ammo', 'scope'];
put('a', 'entity/old_rifle.def', def(K1)); put('b', 'entity/renamed_gun.def', def(K1, '  {extrakey 9}\n'));            // rename
put('a', 'ui/gone.def', def(K1.map(k => 'q_' + k))); put('b', 'map/fresh.def', def(K2));             // unrelated
const bin = Buffer.from([1, 2, 3, 4, 5, 250, 251, 7, 9, 11, 13]);
put('a', 'texture/old.dds', bin); put('b', 'texture/moved/new.dds', bin);                            // CRC rename
put('a', 'weapon/w.def', def(['aa', 'bb', 'cc'])); put('b', 'weapon/w.def', def(['aa', 'bb', 'dd', 'ee'])); // changed: +2 -1
put('a', 'set/m1.set', def(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], '  {extra 1}\n'));                   // two removed ...
put('a', 'set/m2.set', def(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], '  {extra 2}\n')); put('b', 'set/n.set', def(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], '  {extra 1}\n; comment\n')); // ... one added
put('a', 'same.txt', 'x'); put('b', 'same.txt', 'x');
const A = path.join(w, 'a'), B = path.join(w, 'b');
const o = run(A, B, { top: 5, hi: 0.8, lo: 0.5 });
const pairs = o.renames.map(p => p.from + '>' + p.to + ':' + p.how);
ok(pairs.includes('entity/old_rifle.def>entity/renamed_gun.def:keys'), 'rename with new name: ' + pairs);
ok(pairs.includes('texture/old.dds>texture/moved/new.dds:crc'), 'binary rename by crc: ' + pairs);
const all = o.renames.concat(o.maybes);
ok(!all.some(p => p.from === 'ui/gone.def' || p.to === 'map/fresh.def'), 'unrelated pair not paired: ' + JSON.stringify(all));
ok(o.renames.filter(p => p.to === 'set/n.set').length === 1 && o.renames.find(p => p.to === 'set/n.set').from === 'set/m1.set', 'two removed -> one added resolves to m1: ' + pairs);
ok(!o.renames.some(p => p.from === 'set/m2.set'), 'loser m2 not a rename');
ok(o.maybes.some(p => p.from === 'set/m2.set' && p.why === 'contested'), 'loser m2 contested maybe: ' + JSON.stringify(o.maybes));
ok(o.keys && o.keys['def'] && o.keys['def'].files === 1 && o.keys['def'].added === 2 && o.keys['def'].removed === 1, 'key counts: ' + JSON.stringify(o.keys));
ok(o.file.changed === 1 && o.file.added === 4 && o.file.removed === 5, 'file counts: ' + JSON.stringify(o.file));
// snap baselines: file level only
fs.mkdirSync(path.join(w, 'out'), { recursive: true });
const sa = path.join(w, 'out/a.json.gz'), sb = path.join(w, 'out/b.json.gz');
fs.writeFileSync(sa, zlib.gzipSync(JSON.stringify(snap(A)))); fs.writeFileSync(sb, zlib.gzipSync(JSON.stringify(snap(B))));
const s = run(sa, sb, { top: 5, hi: 0.8, lo: 0.5 });
ok(s.keyLevel === 'names+crc only' && !s.keys, 'snap input is file level only');
ok(s.file.added > 0 && s.file.changed === 1, 'snap file counts ' + JSON.stringify(s.file));
ok(s.lines.some(l => /names \+ CRCs only/.test(l)), 'snap says so');
// CLI: rules out validates and stays in the given file
const js = path.join(__dirname, '../verdiff.js'), ro = path.join(w, 'out/rules.json');
const r = cp.spawnSync(process.execPath, [js, A, B, '--from', 'a1', '--to', 'b1', '--rules-out', ro, '-q'], { encoding: 'utf8' });
ok(r.status === 0 && /findings/.test(r.stdout), 'cli ' + r.stdout + r.stderr);
const rows = JSON.parse(fs.readFileSync(ro, 'utf8'));
ok(rows.every(x => x.origin === 'auto' && x.tag === 'I') && rows.length >= 2, 'rule rows ' + rows.length);
const rn = cp.spawnSync(process.execPath, [js, A, B, '--no-cache', '-q'], { encoding: 'utf8' });
ok(rn.status === 2 && /unknown arg --no-cache/.test(rn.stderr), 'no flag is accepted and ignored: --no-cache exits 2 ' + rn.status);
// keys-only fallback (port-tests row): same key paths, every value changed -> maybe "keys only", never a rename, and it never takes a real rename's file
const R2 = require('../lib/renames'), it = (name, s) => { const x = R2.scan(Buffer.from(s)); return { name, ext: 'inc', elems: x.elems, keys: x.keys }; };
const kv = (v) => '{resupply\n' + ['ammo', 'fuel', 'repair', 'medic', 'radius', 'delay'].map(k => `  {${k} ${v} "${k}_${v}"}\n`).join('') + '}\n';
const kp = R2.pair([it('a/resupply.inc', kv(1))], [it('b/resupply2.inc', kv(7))], { hi: 0.8, lo: 0.5 });
ok(!kp.renames.length && kp.maybes.length === 1 && kp.maybes[0].how === 'keys-only' && kp.maybes[0].why === 'keys only', 'keys-only maybe: ' + JSON.stringify(kp));
const kq = R2.pair([it('a/resupply.inc', kv(1))], [it('b/resupply2.inc', kv(7)), it('b/resupply.inc', kv(1) + ' ')], { hi: 0.8, lo: 0.5 });
ok(kq.renames.length === 1 && kq.renames[0].to === 'b/resupply.inc' && kq.renames[0].how === 'keys', 'real rename wins over keys-only: ' + JSON.stringify(kq));
console.log(bad ? 'FAILED ' + bad : 'ok');
process.exit(bad ? 1 : 0);
