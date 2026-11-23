// builds fixture/ : 8x8 v2 map.net (cell 10, off 50,50) + combat.mi + bad.net (truncated)
// Author: Imperator_Aug (ARSENAL, ia-5e39e831)
const fs = require('fs'), path = require('path');
const d = path.join(__dirname, 'fixture'); fs.mkdirSync(d, { recursive: true });
const cstr = s => Buffer.concat([Buffer.from([s.length]), Buffer.from(s)]);
const tab = (tag, l) => Buffer.concat([Buffer.from(tag), Buffer.from([l.length]), ...l.flatMap(([i, n]) => [Buffer.from([i]), cstr(n)])]);
const W = 8, H = 8, hd = Buffer.alloc(14); hd[0] = 10; hd[1] = 2; hd.writeInt16LE(W, 2); hd.writeInt16LE(H, 4); hd.writeFloatLE(50, 6); hd.writeFloatLE(50, 10);
const cells = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const b = Buffer.alloc(4); b.writeInt16LE(y * 10 + x, 0); b[2] = 1; b[3] = 1;
  if (y < 4 && x === 3) b[2] = 7;
  if (y >= 4 && x >= 6) { b[2] = 4; b[3] = 5; }
  cells.push(b);
}
const net = Buffer.concat([hd, tab('MAP0', [[1, 'ground'], [4, 'water'], [7, 'road']]), tab('MAP1', [[1, 'ground'], [5, 'water']]), Buffer.from('GRID'), ...cells]);
fs.writeFileSync(path.join(d, 'map.net'), net);
fs.writeFileSync(path.join(d, 'combat.mi'), '{mission\r\n\t{Entity "tank_a" 0x8001\r\n\t\t{Position -45 10}\r\n\t}\r\n\t{Entity "far" 0x8002\r\n\t\t{Position 9999 10}\r\n\t}\r\n}\r\n');
fs.writeFileSync(path.join(d, 'bad.net'), net.subarray(0, 40));
// game/: a made-up shared AS2 install (as64.exe present): base map multi/t is 8x8, the as64/core copy of it is 4x4.
//   --exe as64 (or none) must read the core 4x4, --exe mowas_2 the base 8x8 (game parity, --exe passed to vfs.build)
const g = path.join(d, 'game'), put = (rel, b) => { const p = path.join(g, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b); };
const hd4 = Buffer.from(hd); hd4.writeInt16LE(4, 2); hd4.writeInt16LE(4, 4);
const net4 = Buffer.concat([hd4, tab('MAP0', [[1, 'ground']]), tab('MAP1', [[1, 'ground']]), Buffer.from('GRID'), ...cells.slice(0, 16)]);
put('as64.exe', Buffer.alloc(0)); put('mowas_2.exe', Buffer.alloc(0));
put('resource/map/multi/t/map.net', net); put('as64/core/resource/map/multi/t/map.net', net4);
