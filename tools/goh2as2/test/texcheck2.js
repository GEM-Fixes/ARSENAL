// Author: Imperator_Aug (ARSENAL, ia-b0f1417a)
'use strict';
// ASSET-2: texcheck --goh words. Seeded: a map GoH names and has but the port lacks = LEFT_BEHIND; a map GoH does not have = GOH_LACKS;
// unreadable source = UNKNOWN; exit code stays 1 on any miss. Fixtures built in code under the session scratch folder (or TEXCHECK2_TMP).
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = process.env.TEXCHECK2_TMP || path.join(__dirname, '..', '..', '..', '..', 'run', 'sessions', 'w86', 'ASSET-2', 'fx');
fs.rmSync(root, { recursive: true, force: true });
let bad = 0;
const ok = (c, m) => { if (!c) { console.log('FAIL texcheck2: ' + m); bad++; } };
const w = (p, b) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b); };
const dds = Buffer.concat([Buffer.alloc(128), Buffer.alloc(8)]);
dds.write('DDS ', 0, 'latin1'); dds.writeUInt32LE(124, 4); dds.writeUInt32LE(4, 12); dds.writeUInt32LE(4, 16); dds.writeUInt32LE(32, 76); dds.writeUInt32LE(4, 80); dds.write('DXT1', 84, 'latin1');
const goh = path.join(root, 'goh'), as2 = path.join(root, 'as2'), mod = path.join(root, 'mod');
const mtl = o => '{material bump\r\n\t{diffuse "$/model/t/d"}\r\n' + o + '}\r\n';
// GoH: tk.mtl names bump (file present) and specular (file absent); no.mtl names neither
w(path.join(goh, 'resource/entity/tk/tk.mtl'), mtl('\t{bump "$/model/t/d_bp"}\r\n\t{specular "$/model/t/d_sp"}\r\n'));
w(path.join(goh, 'resource/entity/tk/no.mtl'), mtl(''));
w(path.join(goh, 'resource/texture/common/model/t/d.dds'), dds);
w(path.join(goh, 'resource/texture/common/model/t/d_bp.dds'), dds);
// port: same mtls, only the diffuse copied
w(path.join(mod, 'resource/entity/tk/tk.mtl'), mtl('\t{bump "$/model/t/d_bp"}\r\n\t{specular "$/model/t/d_sp"}\r\n'));
w(path.join(mod, 'resource/entity/tk/no.mtl'), mtl('\t{specular "$/model/t/d_sp"}\r\n'));
w(path.join(mod, 'resource/entity/tk/orphan.mtl'), mtl('\t{bump "$/model/t/zz"}\r\n'));
w(path.join(mod, 'resource/texture/common/model/t/d.dds'), dds);
w(path.join(as2, 'resource/readme.txt'), 'x');
const run = args => cp.spawnSync('node', [path.join(__dirname, '..', 'texcheck.js'), mod, '--game', as2, ...args], { encoding: 'utf8' });
const g = run(['--goh', goh]);
const line = re => g.stdout.split('\n').find(l => re.test(l)) || '';
ok(/LEFT_BEHIND/.test(line(/tk\.mtl.*bump/)), 'left-behind bump: ' + line(/tk\.mtl.*bump/));
ok(/GOH_LACKS/.test(line(/tk\.mtl.*specular/)), 'GoH names a file it lacks: ' + line(/tk\.mtl.*specular/));
ok(/GOH_LACKS/.test(line(/no\.mtl.*specular/)), 'GoH mtl names no specular: ' + line(/no\.mtl.*specular/));
ok(/UNKNOWN/.test(line(/orphan\.mtl/)), 'source mtl absent: ' + line(/orphan\.mtl/));
ok(g.status === 1, 'exit 1 kept: ' + g.status);
ok(/LEFT_BEHIND 1, GOH_LACKS 2, UNKNOWN 1/.test(g.stdout), 'summary counts: ' + g.stdout.split('\n').slice(-2).join('|'));
const n = run([]);
ok(n.status === 1 && !/LEFT_BEHIND|GOH_LACKS/.test(n.stdout), 'without --goh no words, exit 1');
if (bad) process.exit(1);
console.log('texcheck2 ok');
