// warn rows: one fixture per detector kind (text in a pak, text loose, path, modpath, none), the @sha / target ancestry filter on a tiny git repo, the no-clone fallback, the report lines
// Author: Imperator_Aug (ARSENAL, ia-cbb4e20d)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const w = path.resolve(process.argv[2]); let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
// tiny upstream: A <- B <- C <- D, read by detect.js through AS2_UPSTREAM
const repo = path.join(w, 'up'); fs.mkdirSync(repo, { recursive: true });
const g = (...a) => cp.spawnSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' });
g('init', '-q'); const sha = [];
for (const m of 'ABCD') { g('commit', '-q', '--allow-empty', '-m', m); sha.push(g('rev-parse', '--short=8', 'HEAD').stdout.trim()); }
const [A, B, C, D8] = sha;
process.env.AS2_UPSTREAM = repo;
const D = require('../lib/detect'), RULES = require('../lib/rules'), U = require('../upgrade');

function zip(files) {
  const lfs = [], cds = []; let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const n = Buffer.from(name), d = Buffer.from(text);
    const lf = Buffer.alloc(30); lf.writeUInt32LE(0x04034b50, 0); lf.writeUInt16LE(20, 4); lf.writeUInt32LE(d.length, 18); lf.writeUInt32LE(d.length, 22); lf.writeUInt16LE(n.length, 26);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt32LE(d.length, 20); cd.writeUInt32LE(d.length, 24); cd.writeUInt16LE(n.length, 28); cd.writeUInt32LE(off, 42);
    lfs.push(lf, n, d); cds.push(cd, n); off += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(cds), e = Buffer.alloc(22), cnt = Object.keys(files).length;
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(cnt, 8); e.writeUInt16LE(cnt, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...lfs, cd, e]);
}
// EANM, one bone, one FRM2 frame with one record carrying `flags` (0x20 = mesh-frame payload, i32 size 0; 0x03 = pos + rot)
function anm(flags) {
  const h = Buffer.concat([Buffer.from('EANM'), Buffer.from([0, 0, 6, 0]), Buffer.from('FRMS'), Buffer.from([1, 0, 0, 0]), Buffer.from('BMAP'), Buffer.from([1, 0, 0, 0, 1, 0, 0, 0, 0x61])]);
  const rec = Buffer.alloc(flags & 0x20 ? 4 : 24); const f = Buffer.alloc(3); f.writeUInt16LE(flags, 1);
  return Buffer.concat([h, Buffer.from('FRM2'), Buffer.from([0, 0, 1]), f, rec]);
}
const put = (root, rel, data) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };

// ---- detectors on a seeded mod (the folder name carries the modpath signal)
const m = path.join(w, 'workshop', 'content', '244450', '777'), none = path.join(w, 'none');
put(m, 'mod.info', '{mod\r\n {name "t"}\r\n {MinGameVersion "3.262.1"}\r\n {MaxGameVersion "3.262.1"}\r\n}\r\n');
put(m, 'resource/a.pak', zip({
  'entity/x/gun.def': '{weapon\r\n {SequentialAim 1}\r\n}\r\n',          // text hit in a pak
  'entity/x/ok.def': '{weapon {SequentialAim 0}}\r\n',                  // near miss
  'anim/walk.anm': anm(0x20),                                              // binary hit in a pak: mesh-frame record
  'anim/bone.anm': anm(0x03),                                              // near miss: bone anim only
  'map/m1/script.mi': '{script\r\n {"switch"\r\n  {"case"}}\r\n {switch close}\r\n}\r\n',
}));
put(m, 'resource/set/vision/v.inc', '{vision {rules 1}}\r\n');            // loose text hit
put(m, 'resource/set/vision/plain.inc', '{vision {still 1}}\r\n');
put(m, 'resource/shader/dx11/a.hlsl', 'float4 x;');
put(m, 'resource/script/multiplayer/bot.lua', 'x = 1\r\n');
put(m, 'resource/script/other.lua', 'PLAYER_LEFT = 1\r\n');               // text hit, loose
const before = fs.readdirSync(m).join();
const rows = RULES.load('mowas2', 'as64');
ok(rows.filter(r => r.action === 'warn').length >= 20 && rows.filter(r => r.detect && r.detect.type === 'none').length >= 10, 'warn rows loaded');
for (const r of rows.filter(x => x.action === 'warn')) ok(r.tag && r.origin === 'manual' && r.evidence && r.test && r.since, 'row fields ' + r.id);
const res = D.run(m, rows, 'mowas2', null, 'as64', A);          // target build A: nothing real is known to the tiny repo
const ids = res.hit.map(h => h.row.id).sort().join(' ');
ok(/aim-sequential/.test(ids) && /anm-blend/.test(ids) && /shader-own/.test(ids) && /bot-lua/.test(ids) && /switch-bug/.test(ids) && /workshop-place/.test(ids) && /rejoin-script/.test(ids), 'every detector kind hits: ' + ids);
const by = id => res.hit.find(h => h.row.id === id);
ok(by('aim-sequential').n === 1 && /a\.pak!entity\/x\/gun\.def/.test(by('aim-sequential').ex[0].file) && by('aim-sequential').ex[0].line === 2, 'pak text hit with line: ' + JSON.stringify(by('aim-sequential').ex));
ok(by('switch-bug').n === 1, '{switch close} is not the statement: ' + by('switch-bug').n);
ok(by('anm-blend').n === 1 && /walk\.anm/.test(by('anm-blend').ex[0].file), 'only the mesh-frame anm hits: ' + JSON.stringify(by('anm-blend').ex));
ok(!by('vision-set') && res.notes.some(r => r.id === 'vision-set'), 'vision is a note, stock files carry rules blocks');
ok(res.notes.length >= 10 && res.notes.every(r => r.detect.type === 'none'), 'notes are the none rows');
ok(res.info.some(i => /unknown to the upstream clone/.test(i)), 'unknown real shas fall back with a note: ' + res.info);
ok(fs.readdirSync(m).join() === before, 'mod untouched');
const text = D.render(res).join('\n');
ok(/WARN +behaviour changes/.test(text) && /notes, nothing in mod data/.test(text), 'render has WARN section');
const clean = path.join(w, 'clean'); put(clean, 'mod.info', '{mod}\r\n'); put(clean, 'resource/a.def', '{x}\r\n');
const rc = D.run(clean, rows, 'mowas2', null, 'as64', A);
ok(rc.hit.length === 0 && !/workshop-place/.test(JSON.stringify(rc.hit.map(h => h.row.id))), 'clean mod: no detector hit');

// ---- build filter on the tiny repo: target C, source build B
const row = (id, since, o = {}) => ({ id, kind: 'warn', from: 'as64', to: 'as64', scope: 's', action: 'warn', detect: { type: 'none' }, msg: 'm', since, evidence: 'e', tag: 'I', origin: 'manual', test: 't', ...o });
const syn = [row('r-A', A), row('r-B', B), row('r-C', C), row('r-D', D8), row('b-A', A, { bug: true }), row('b-D', D8, { bug: true })];
const ap = D.applicable(syn, 'as64', B, 'as64', C), idl = l => l.map(r => r.id).join(' ');
ok(idl(ap.before) === 'r-A r-B', 'source build already has: ' + idl(ap.before));
ok(idl(ap.fire) === 'r-C b-D', 'fires: ' + idl(ap.fire));
ok(idl(ap.after) === 'r-D', 'after your build: ' + idl(ap.after));
ok(idl(ap.fixed) === 'b-A', 'bug fixed in target: ' + idl(ap.fixed));
const m2 = D.applicable(syn, 'mowas2', null, 'as64', C);
ok(idl(m2.fire) === 'r-A r-B r-C b-D' && idl(m2.after) === 'r-D', 'mowas2 source: all rows in the target apply: ' + idl(m2.fire));
const noSha = D.applicable(syn, 'as64', null, 'as64', C);
ok(noSha.info.some(i => /no --from as64@/.test(i)), 'as64 without sha says so');
ok(D.isAncestor('0000000000', C) === null, 'unknown commit is null, not false');
// ---- no clone: every row applies with a note
const code = `const D=require(${JSON.stringify(path.resolve(__dirname, '../lib/detect'))});const r=D.applicable([${JSON.stringify(row('x', 'abcdef12'))},${JSON.stringify(row('y', '12345678', { bug: true }))}],'mowas2',null,'as64');console.log(JSON.stringify([r.fire.length,r.after.length,r.info.join('|')]))`;
const nc = cp.spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', env: { ...process.env, AS2_UPSTREAM: path.join(w, 'nope') } });
const j = JSON.parse(nc.stdout || '[]');
ok(j[0] === 2 && j[1] === 0 && /no upstream clone/.test(j[2]), 'no clone falls back: ' + nc.stdout + nc.stderr);

// ---- plan: verdict untouched, count appended, WARN section in the text
const p = U.plan(m, 'as64', { as2: none, goh: none, 'to-build': A });
const out = U.render(p);
ok(/^(partial, )?untested$/.test(p.verdict) && /VERDICT (partial, )?untested: no game ran this, \d+ behaviour warnings \+ \d+ notes, read them/.test(out), 'verdict tail: ' + out.trim().split('\n').pop());
ok(/\nWARN /.test(out) && /aim-sequential/.test(out), 'plan shows WARN');
const pg = U.plan(m, 'goh', { as2: none, goh: none, from: 'mowas2' });
ok(pg.warn.hit.length === 0 && pg.warn.notes.length === 0 && !/behaviour warnings/.test(U.render(pg)), 'goh target: no warn rows by default');
// ---- validate refuses a broken warn row
let thrown = ''; try { RULES.validate([row('bad', 'abc', { detect: { type: 'text', re: '(', files: 'x' } })], 'f'); } catch (e) { thrown = e.message; }
ok(/bad regex/.test(thrown), 'bad regex refused: ' + thrown);
try { RULES.validate([row('bad2', 'abc', { detect: { type: 'nope' } })], 'f'); thrown = ''; } catch (e) { thrown = e.message; }
ok(/detect\.type/.test(thrown), 'bad type refused');
process.exit(bad ? 1 : 0);
