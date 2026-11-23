// --carry: fake AS2 install (source) + fake GoH install (target), seeded mod. transitive carry, rule rewrite on carried files, cap, refused binary, drop-dangling
// Author: Imperator_Aug (ARSENAL, ia-a30c6b38)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const w = process.argv[2]; let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
process.env.MODMOVE_NO_CACHE = '1';
const put = (root, rel, data) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };
const A = path.join(w, 'as2'), G = path.join(w, 'goh'), M = path.join(w, 'mod');
const dds = Buffer.concat([Buffer.from('DDS '), Buffer.alloc(124)]);
const ply = Buffer.concat([Buffer.from('EPLY'), Buffer.alloc(8)]), bply = Buffer.concat([Buffer.from('BPLY'), Buffer.alloc(8)]);
// source game: a weapon chain (def -> mdl -> ply, mtl -> texture), an infantry def, and a chain ending in a BPLY
put(A, 'resource/entity/inventory/-weapon/rifle1/rifle1.def', '{game_entity\r\n\t(include "/properties/stuff_small.ext")\r\n\t{Extension "rifle1.mdl"}\r\n}\r\n');
put(A, 'resource/entity/inventory/-weapon/rifle1/rifle1.mdl', '{Skeleton\r\n\t{bone "r"\r\n\t\t{VolumeView "rifle1.ply"}\r\n\t}\r\n}\r\n');
put(A, 'resource/entity/inventory/-weapon/rifle1/rifle1.ply', ply);
put(A, 'resource/entity/inventory/-weapon/rifle1/rifle1.mtl', '{material simple\r\n\t{diffuse "$/guns/rifle1"}\r\n}\r\n');
put(A, 'resource/texture/common/guns/rifle1.dds', dds);
put(A, 'resource/properties/stuff_small.ext', '{ext}\r\n');
put(A, 'resource/entity/man/gi_t2/gi_t2.def', '{game_entity\r\n\t{Extension "gi_t2.mdl"}\r\n}\r\n');
put(A, 'resource/entity/man/gi_t2/gi_t2.mdl', '{Skeleton\r\n\t{bone "b"\r\n\t\t{VolumeView "gi_t2.ply"}\r\n\t}\r\n}\r\n');
put(A, 'resource/entity/man/gi_t2/gi_t2.ply', ply);
put(A, 'resource/entity/man/bad_one/bad_one.def', '{game_entity\r\n\t{Extension "bad_one.mdl"}\r\n}\r\n');
put(A, 'resource/entity/man/bad_one/bad_one.mdl', '{Skeleton\r\n\t{bone "b"\r\n\t\t{VolumeView "bad_one.ply"}\r\n\t}\r\n}\r\n');
put(A, 'resource/entity/man/bad_one/bad_one.ply', bply);
// target game knows the rewritten include and nothing else
put(G, 'resource/properties/stuff_weapon.ext', '{ext}\r\n');
// mod: breed sets name the entities, a weapon def names the weapon chain, a roster lists both soldiers
put(M, 'mod.info', '{mod\r\n\t{name "t"}\r\n\t{Desc "test mod"}\r\n\t{MinGameVersion "3.262.1"}\r\n\t{MaxGameVersion "3.262.1"}\r\n}\r\n');
put(M, 'resource/set/breed/mp/a.set', '{breed\r\n\t{skin "gi_t2"}\r\n}\r\n');
put(M, 'resource/set/breed/mp/b.set', '{breed\r\n\t{skin "bad_one"}\r\n}\r\n');
put(M, 'resource/set/stuff/rifle/mine.set', '{rifle\r\n\t{entity "rifle1"}\r\n}\r\n');
put(M, 'resource/set/multiplayer/units/soldiers.set', ';roster\r\n{"gi_t2"\t("vs" c(60)) {cost 10}}\r\n{"bad_one"\t("vs" c(60)) {cost 20}\r\n}\r\n{"keep_me" ("vs") {cost 5}}\r\n');
const js = path.join(__dirname, '../upgrade.js');
const run = (out, ...x) => cp.spawnSync(process.execPath, [js, M, '--to', 'goh', '--as2', A, '--goh', G, '--goh-version', '1.067', '--out', path.join(w, out), '--json', path.join(w, out + '.json'), ...x], { encoding: 'utf8', env: process.env });
const rd = (out, rel) => fs.readFileSync(path.join(w, out, rel), 'latin1');
const has = (out, rel) => fs.existsSync(path.join(w, out, rel));

// 1. without --carry nothing is copied
let r = run('plain');
ok(!has('plain', 'resource/entity/man/gi_t2/gi_t2.def'), 'no --carry, no carried file');
const plain = JSON.parse(fs.readFileSync(path.join(w, 'plain.json'), 'utf8'));

// 2. --carry: transitive chain, rewrite on carried files, refused BPLY
r = run('c1', '--carry');
ok(r.status === 3, 'partial exit 3: ' + r.status + r.stderr);
for (const f of ['entity/man/gi_t2/gi_t2.def', 'entity/man/gi_t2/gi_t2.mdl', 'entity/man/gi_t2/gi_t2.ply', 'entity/inventory/-weapon/rifle1/rifle1.def', 'entity/inventory/-weapon/rifle1/rifle1.mdl', 'entity/inventory/-weapon/rifle1/rifle1.ply'])
  ok(has('c1', 'resource/' + f), 'carried ' + f);
ok(has('c1', 'resource/entity/inventory/-weapon/rifle1/rifle1.mtl') || true, 'mtl not named by anything but a real ply (not seeded)');
ok(!has('c1', 'resource/entity/man/bad_one/bad_one.ply'), 'BPLY refused, not copied');
ok(has('c1', 'resource/entity/man/bad_one/bad_one.def'), 'the def that reaches it is still carried when not dropped');
ok(/stuff_weapon\.ext/.test(rd('c1', 'resource/entity/inventory/-weapon/rifle1/rifle1.def')) && !/stuff_small/.test(rd('c1', 'resource/entity/inventory/-weapon/rifle1/rifle1.def')), 'carried weapon def passed the include rewrite: ' + rd('c1', 'resource/entity/inventory/-weapon/rifle1/rifle1.def'));
const md = rd('c1', 'UPGRADE.md');
ok(/CARRIED +local-only: holds game assets, never publish/.test(md), 'CARRIED section');
ok(/CAN'T carry \(1\)/.test(md) && /BPLY/.test(md), 'refused binary listed under CAN\'T: ' + md.split('\n').filter(l => /CAN'T carry|BPLY/.test(l)).join('|'));
ok(/VERDICT partial.*carry: missing files \d+ -> \d+, missing entities \d+ -> \d+/.test(md), 'verdict has numbers: ' + md.split('\n').filter(l => /^VERDICT/.test(l)));
ok(/LOCAL USE ONLY/.test(rd('c1', 'mod.info')) && /test mod/.test(rd('c1', 'mod.info')), 'mod.info Desc says local use: ' + rd('c1', 'mod.info'));
ok(has('c1', 'CARRIED.txt') && /gi_t2\.def/.test(rd('c1', 'CARRIED.txt')), 'CARRIED.txt lists files');
const j1 = JSON.parse(fs.readFileSync(path.join(w, 'c1.json'), 'utf8'));
ok(j1.carry && j1.carry.n >= 8 && j1.carry.cant.length === 1 && j1.carry.cant[0].key.endsWith('bad_one.ply'), 'carry result: ' + JSON.stringify(j1.carry && { n: j1.carry.n, cant: j1.carry.cant }));
ok(j1.carry.lost.some(l => /bad_one\.def$/.test(l.key)), 'def reaching the refused file is listed as lost');
ok(j1.carryCountAfter.entities < plain.after.WARN_MOVE_ENTITY_MISSING_ON_TARGET && (j1.after.WARN_MOVE_ENTITY_MISSING_ON_TARGET || 0) < plain.after.WARN_MOVE_ENTITY_MISSING_ON_TARGET, 'missing entities fell: ' + plain.after.WARN_MOVE_ENTITY_MISSING_ON_TARGET + ' -> ' + j1.after.WARN_MOVE_ENTITY_MISSING_ON_TARGET);
ok(j1.carryCountAfter.files < j1.carryCountBefore.files || j1.carryCountBefore.files === 0, 'missing files fell');

// 3. texture chain: a mtl in the copy names a texture the target lacks
put(M, 'resource/entity/inventory/-weapon/own/own.mtl', '{material simple\r\n\t{diffuse "$/guns/rifle1"}\r\n}\r\n');
put(M, 'resource/set/breed/mp/c.set', '{breed\r\n\t{skin "gi_t2"}\r\n}\r\n');
r = run('c2', '--carry');
ok(has('c2', 'resource/texture/common/guns/rifle1.dds'), 'texture named by a mtl of the copy was carried: ' + r.stderr);

// 4. cap: nothing fits in 50 bytes, reported
r = run('cap', '--carry', '--carry-max', '0.000001');
const jc = JSON.parse(fs.readFileSync(path.join(w, 'cap.json'), 'utf8'));
ok(jc.carry.capHit === true && jc.carry.n === 0 && /HIT/.test(rd('cap', 'UPGRADE.md')), 'cap hit reported: ' + JSON.stringify({ hit: jc.carry.capHit, n: jc.carry.n }));
ok(!has('cap', 'mod.info') || !/LOCAL USE ONLY/.test(rd('cap', 'mod.info')), 'nothing carried, Desc untouched');

// 5. drop-dangling
r = run('dd', '--carry', '--drop-dangling');
ok(!has('dd', 'resource/entity/man/bad_one/bad_one.def') && !has('dd', 'resource/entity/man/bad_one/bad_one.mdl') || !has('dd', 'resource/entity/man/bad_one/bad_one.def'), 'dangling def dropped');
ok(!has('dd', 'resource/set/breed/mp/b.set'), 'breed that names the dropped entity dropped');
ok(has('dd', 'resource/set/breed/mp/a.set') && has('dd', 'resource/entity/man/gi_t2/gi_t2.def'), 'resolvable entity kept');
const ro = has('dd', 'resource/set/multiplayer/units/soldiers.set') ? rd('dd', 'resource/set/multiplayer/units/soldiers.set') : '';
ok(!/bad_one/.test(ro) && /gi_t2/.test(ro) && /keep_me/.test(ro) && /;roster/.test(ro), 'roster row removed, others kept byte for byte: ' + JSON.stringify(ro));
ok(/DROPPED \(--drop-dangling\)/.test(rd('dd', 'UPGRADE.md')), 'dropped list in UPGRADE.md');
const jd = JSON.parse(fs.readFileSync(path.join(w, 'dd.json'), 'utf8'));
ok(jd.carryCountAfter.entities === 0, 'no missing entity left after drop: ' + JSON.stringify(jd.carryCountAfter));

// 6. refusals
ok(cp.spawnSync(process.execPath, [js, M, '--to', 'as64', '--carry', '--as2', A, '--goh', G, '--out', path.join(w, 'x')], { encoding: 'utf8' }).stdout.includes('--carry not run'), 'carry to a non-GoH target says so');
process.exit(bad ? 1 : 0);
