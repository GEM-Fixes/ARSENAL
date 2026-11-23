// rand-interaction-sync warn row (AS2 -> GoH): fires on rand in interaction_entity files only, loose or in a pak
// Author: Imperator_Aug (ARSENAL, ia-cb5de8a9)
const fs = require('fs'), path = require('path');
const w = path.resolve(process.argv[2]); let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const D = require('../lib/detect'), RULES = require('../lib/rules');
const put = (root, rel, data) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
const ROLL = '{ie\r\n {on pierce\r\n  {if rand 0.5 {kill_crew "driver"}}\r\n }\r\n}\r\n';
const hits = (dir, from) => D.run(dir, RULES.load(from, 'goh'), from, null, 'goh').hit.filter(h => h.row.id === 'rand-interaction-sync');
for (const from of ['as64', 'mowas2']) {
  const a = path.join(w, from, 'a'), b = path.join(w, from, 'b'), c = path.join(w, from, 'c');
  put(a, 'resource/set/interaction_entity/tank/t.inc', ROLL);           // hit
  put(a, 'resource/set/interaction_entity/plain.inc', '{ie {on pierce {kill_crew "driver"}}}\r\n');   // no rand
  put(a, 'resource/entity/x.def', '{if rand 0.5 {x}}\r\n');             // rand outside interaction: not a hit
  put(b, 'resource/entity/x.def', ROLL);                                 // no interaction files at all
  put(b, 'resource/set/vision/v.inc', '{if rand 0.5 {x}}\r\n');
  put(b, 'resource/set/interaction_entity/ok.inc', '{ie {on hit {call "x"}}}\r\n');   // interaction file, brand name only
  const ha = hits(a, from);
  ok(ha.length === 1 && ha[0].n === 1 && /interaction_entity\/tank\/t\.inc$/.test(ha[0].ex[0].file) && ha[0].ex[0].line === 3, from + ' hit only the rolling interaction file: ' + JSON.stringify(ha.map(h => h.ex)));
  ok(/PORT-29/.test(ha[0].row.msg), from + ' msg points to PORT-29');
  ok(hits(b, from).length === 0, from + ' silent without a rolling interaction file');
  const e = path.join(w, from, 'none'); put(e, 'mod.info', '{mod}\r\n');
  ok(hits(e, from).length === 0, from + ' silent on a mod with no data');
}
// pak entry
{
  const m = path.join(w, 'pk'); put(m, 'mod.info', '{mod}\r\n');
  const names = { 'set/interaction_entity/h.inc': ROLL }, lfs = [], cds = []; let off = 0;
  for (const [name, text] of Object.entries(names)) {
    const n = Buffer.from(name), d = Buffer.from(text);
    const lf = Buffer.alloc(30); lf.writeUInt32LE(0x04034b50, 0); lf.writeUInt16LE(20, 4); lf.writeUInt32LE(d.length, 18); lf.writeUInt32LE(d.length, 22); lf.writeUInt16LE(n.length, 26);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt32LE(d.length, 20); cd.writeUInt32LE(d.length, 24); cd.writeUInt16LE(n.length, 28); cd.writeUInt32LE(off, 42);
    lfs.push(lf, n, d); cds.push(cd, n); off += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(cds), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(1, 8); e.writeUInt16LE(1, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  put(m, 'resource/x.pak', Buffer.concat([...lfs, cd, e]));
  const h = hits(m, 'mowas2');
  ok(h.length === 1 && /x\.pak!set\/interaction_entity\/h\.inc/.test(h[0].ex[0].file), 'pak entry hit: ' + JSON.stringify(h.map(x => x.ex)));
}
process.exit(bad ? 1 : 0);
