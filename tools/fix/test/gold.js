// fix GOLD + RT: fixture mod g1 (lng replacing vanilla desc.lng = LOC-01; texture + sound refs with exactly 1 candidate) on the mkfixture game.
// usage: node gold.js <work dir holding fx/ from mkfixture>   (exit 1 + ASSERT lines on failure)
//   1. plan without --out prints the plan, writes nothing; apply without --out is refused with a reason
//   2. GOLD: the patch written by apply is byte-equal to gold/expected (mod.info, desc.lng, one .mtl, one weapon stuff)
//   3. RT: fix plan on the patch's result finds nothing to fix; apply twice gives the same bytes
// Author: Imperator_Aug (ARSENAL, ia-0ee83e9e)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const W = path.resolve(process.argv[2]), G = path.join(W, 'fx', 'game'), FIX = path.join(__dirname, '..', 'fix.js');
const C = require('../../modmove/lib/common');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('ASSERT ' + m); } };
const put = (k, b) => { const f = path.join(G, 'mods/g1', k); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };
const crlf = a => Buffer.from(a.join('\r\n') + '\r\n', 'utf8');

// ---- fixture mod g1 (loose)
put('mod.info', crlf(['{Mod', '\t{Name "G One"}', '\t{Desc "gold fixture"}', '\t{MinGameVersion "3.262.1"}', '\t{MaxGameVersion "3.262.1"}', '}']));
put('localization/desc.lng', Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), crlf(['{tags', '\t{"entity" {"ok" "Окей"}}', '\t{"entity" {"own" "Own"}}', '}'])]));
put('resource/entity/g1/g1a.def', crlf(['{game_entity', '\t{Extension "g1a.mdl"}', '}']));
put('resource/entity/g1/g1a.mdl', crlf(['{Skeleton', '\t{bone "b" {VolumeView "a.ply"} {Polyhedron "a.vol"}}', '}']));
put('resource/entity/g1/g1a.mtl', crlf(['{material bump', '\t{diffuse "tex_unique"}', '}']));
put('resource/entity/g1/a.ply', 'x'); put('resource/entity/g1/a.vol', 'x');
put('resource/set/stuff/rifle9', crlf(['{weapon_bullet', '\t{fireSound "shot_unique"}', '}']));

const mod = path.join(G, 'mods/g1'), snap = C.treeHash(mod);
const run = args => { const r = cp.spawnSync(process.execPath, [FIX, ...args, '--game', G, '--cache', path.join(W, 'fx', 'rc-gold.json')], { encoding: 'utf8' }); return { o: (r.stdout || '') + (r.stderr || ''), rc: r.status }; };
const tree = d => fs.existsSync(d) ? C.walk(d).sort().map(f => [f, fs.readFileSync(path.join(d, f))]) : [];
const same = (a, b) => a.length === b.length && a.every((x, i) => x[0] === b[i][0] && x[1].equals(b[i][1]));
const OUT = path.join(W, 'g-out'), OUT2 = path.join(W, 'g-out2'), EXP = path.join(__dirname, 'gold', 'expected');

// 1. plan without --out
let r = run([mod, 'plan']);
ok(r.rc === 0 && /CHANGED: 3 file/.test(r.o) && /nothing written/.test(r.o), 'plan without --out: rc ' + r.rc + ' ' + r.o.split('\n').filter(l => /CHANGED|usage|--out/.test(l)).join(' | '));
ok(/PREVIEW/.test(r.o), 'plan text lacks PREVIEW');
ok(!fs.existsSync(OUT), 'plan created something');
r = run([mod, 'apply']);
ok(r.rc === 2 && /--out is required for apply/.test(r.o) && /writes a patch mod folder/.test(r.o), 'apply without --out not refused with a reason: ' + r.o);
r = run([mod, '--help']);
ok(/PREVIEW/.test(r.o) && /game test/.test(r.o), 'help lacks preview wording');

// 2. GOLD
r = run([mod, 'apply', '--out', OUT]);
ok(r.rc === 0 && /VERDICT: static clean, untested/.test(r.o), 'apply: ' + r.o);
// gold/expected is stored with LF and no BOM (editors/git may rewrite line endings); the bytes compared are the stored text with CRLF, and a UTF-8 BOM on .lng (the source lng has one, fix keeps it)
const exp = tree(EXP).map(([k, b]) => [k, Buffer.concat([k.endsWith('.lng') ? Buffer.from([0xEF, 0xBB, 0xBF]) : Buffer.alloc(0), Buffer.from(b.toString('utf8').replace(/^﻿/, '').replace(/\r?\n/g, '\r\n'), 'utf8')])]);
const got = tree(OUT);
ok(exp.length === 4, 'gold/expected has ' + exp.length + ' files, want 4');
ok(same(got, exp), 'patch differs from gold/expected: got ' + got.map(x => x[0] + ':' + x[1].length) + ' want ' + exp.map(x => x[0] + ':' + x[1].length));
if (!same(got, exp)) for (const [k, b] of got) console.log('GOT ' + k + ' ' + JSON.stringify(b.toString('utf8')));
ok(C.treeHash(mod) === snap, 'source changed');
if (process.env.GOLD_DUMP) fs.cpSync(OUT, process.env.GOLD_DUMP, { recursive: true });   // maintainer: regenerate gold/expected, review the diff by hand

// 3. RT: patch mounted after the source (copy of both into one mods dir, as the game would layer them): nothing left
fs.cpSync(OUT, path.join(G, 'mods/g1_fix'), { recursive: true });
r = run([path.join(G, 'mods/g1_fix'), 'plan', '--mods', 'g1']);
ok(r.rc === 0 && /CHANGED: 0 file/.test(r.o) && /VERDICT: static clean/.test(r.o), 'RT plan on the patch not empty: ' + r.o.split('\n').filter(l => /CHANGED|VERDICT|  /.test(l)).join(' | '));
// RT on the source with the patch layered: fix of the source alone must still list its faults (patch is separate), so the check is on the patch's own result:
// merge source + patch into one folder and plan that
const M = path.join(G, 'mods/g1_merged');
fs.cpSync(mod, M, { recursive: true }); fs.cpSync(OUT, M, { recursive: true, force: true });
fs.rmSync(path.join(M, 'mod.info')); fs.copyFileSync(path.join(mod, 'mod.info'), path.join(M, 'mod.info'));
r = run([M, 'plan']);
ok(r.rc === 0 && /CHANGED: 0 file/.test(r.o) && /VERDICT: static clean/.test(r.o), 'RT plan on source+patch not empty: ' + r.o.split('\n').filter(l => /CHANGED|VERDICT|  /.test(l)).join(' | '));
// twice
r = run([mod, 'apply', '--out', OUT2]); const t1 = tree(OUT2);
r = run([mod, 'apply', '--out', OUT2]); const t2 = tree(OUT2);
ok(same(t1, t2) && same(t1, got), 'apply twice differs');
ok(/KEPT|CHANGED: 3/.test(r.o), 'second apply output: ' + r.o.split('\n').filter(l => /CHANGED|KEPT/.test(l)).join(' | '));
r = run([mod, 'apply', '--out', OUT]);   // onto the first patch folder
ok(same(tree(OUT), got), 'apply onto existing patch changed it');
fs.rmSync(path.join(G, 'mods/g1_fix'), { recursive: true, force: true }); fs.rmSync(M, { recursive: true, force: true });
if (!bad) console.log('gold: all held');
process.exit(bad ? 1 : 0);
