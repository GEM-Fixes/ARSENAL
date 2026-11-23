// GX upgrade gaps: G7 no-edit verdict, G11 --export (no UPGRADE.md, "Ported from" in Desc), G13 reason + undo on each CHANGED row
// Author: Imperator_Aug (ARSENAL, ia-cf672698)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const w = process.argv[2]; let bad = 0;
const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const UP = path.join(__dirname, '..', 'upgrade.js'), none = path.join(w, 'none');
fs.mkdirSync(w, { recursive: true });
const mk = (name, info) => { const d = path.join(w, name); fs.mkdirSync(path.join(d, 'resource', 'entity'), { recursive: true }); fs.writeFileSync(path.join(d, 'mod.info'), info); fs.writeFileSync(path.join(d, 'resource', 'entity', 'a.txt'), 'x\r\n'); return d; };
const run = (mod, args) => { const r = cp.spawnSync(process.execPath, [UP, mod, '--as2', none, '--goh', none, ...args], { encoding: 'utf8' }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };

// G7: a mod that already fits as64 Enhanced
const good = mk('goodmod', '{Mod\r\n\t{Name "Good"}\r\n\t{MinGameVersion "3.301"}\r\n}\r\n');
const p7 = run(good, ['--to', 'as64', '--from', 'as64', '--plan']);
ok(/VERDICT no edit needed, already matches as64 Enhanced; next: play it/.test(p7.out), 'G7 plan verdict: ' + p7.out.split('\n').filter(l => /VERDICT/.test(l)).join('|'));
const o7 = path.join(w, 'out7'), d7 = run(good, ['--to', 'as64', '--from', 'as64', '--out', o7]);
ok(/VERDICT no edit needed, already matches as64 Enhanced; next: play it/.test(d7.out) && d7.code === 0, 'G7 write verdict rc ' + d7.code + ': ' + d7.out.split('\n').filter(l => /VERDICT|CHANGED/.test(l)).join('|'));

// G11 + G13: an old mowas2 mod with an author, written with --export
const old = mk('oldauth', '{Mod\r\n\t{Name "Old One"}\r\n\t{Desc "A mod."}\r\n\t{Author "Pat"}\r\n\t{FileId "123"}\r\n\t{MinGameVersion "3.262.0"}\r\n\t{MaxGameVersion "3.262.1"}\r\n}\r\n');
const o1 = path.join(w, 'out-plain'), o2 = path.join(w, 'out-export');
const a = run(old, ['--to', 'as64', '--from', 'mowas2', '--mode', 'enhanced', '--out', o1]);
ok(fs.existsSync(path.join(o1, 'UPGRADE.md')), 'G11 default keeps UPGRADE.md');
ok(!/Ported from/.test(fs.readFileSync(path.join(o1, 'mod.info'), 'latin1')), 'G11 no credit unless asked');
ok(/why: .*To undo: delete the out folder/.test(a.out) && /mod\.info version range\s+e\.g\./.test(a.out), 'G13 CHANGED rows carry a reason and the undo line: ' + a.out.split('\n').filter(l => /why:|CHANGED/.test(l)).join('|'));
const b = run(old, ['--to', 'as64', '--from', 'mowas2', '--mode', 'enhanced', '--export', '--out', o2]);
ok(!fs.existsSync(path.join(o2, 'UPGRADE.md')), 'G11 --export leaves UPGRADE.md out');
const mi = fs.readFileSync(path.join(o2, 'mod.info'), 'latin1');
ok(/\{Desc "A mod\. Ported from Old One by Pat"\}/.test(mi) && mi.split('\n').every(l => !l.length || l.endsWith('\r')), 'G11 Desc credit: ' + JSON.stringify(mi));
// no author: nothing added; plan refuses --export
const noa = mk('noauth', '{Mod\r\n\t{Name "No Auth"}\r\n\t{MinGameVersion "3.262.0"}\r\n\t{MaxGameVersion "3.262.1"}\r\n}\r\n'), o3 = path.join(w, 'out-noauth');
run(noa, ['--to', 'as64', '--from', 'mowas2', '--mode', 'enhanced', '--export', '--out', o3]);
ok(!/Ported from|Desc/.test(fs.readFileSync(path.join(o3, 'mod.info'), 'latin1')), 'G11 no author, no credit');
const pe = run(old, ['--to', 'as64', '--from', 'mowas2', '--plan', '--export']);
ok(pe.code === 2 && /--export needs a write/.test(pe.out), 'G11 --export refused under --plan: ' + pe.out.slice(0, 120));
console.log(bad ? bad + ' GX assertion(s) failed' : 'GX upgrade assertions held');
process.exitCode = bad ? 1 : 0;
