// mapport auto-resample: a cell-5 map.net is written as cell 10 by default, --keep-cell leaves it, --check flags it,
// a cell-10 net is not rewritten, and binhdr's checkNet reports NET_CELL on cell 5 only. Prints PASS cell / FAIL ...
// Author: Imperator_Aug (ARSENAL, ia-2b7b23cd)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const mapnet = require('../../lib/mapnet');
const T = path.join(__dirname, '..', 'mapport.js');
const cstr = n => Buffer.concat([Buffer.from([n.length]), Buffer.from(n, 'latin1')]);
function net(cell, w, h) {
  const hd = Buffer.alloc(14); hd[0] = cell; hd[1] = 2; hd.writeInt16LE(w, 2); hd.writeInt16LE(h, 4); hd.writeFloatLE(100, 6); hd.writeFloatLE(50, 10);
  const tab = (tag, t) => Buffer.concat([Buffer.from(tag), Buffer.from([t.length]), ...t.map(([i, n]) => Buffer.concat([Buffer.from([i]), cstr(n)]))]);
  const cells = Buffer.alloc(w * h * 4);
  for (let k = 0; k < w * h; k++) { cells.writeInt16LE(k * 3 - 20, k * 4); cells[k * 4 + 2] = 1; cells[k * 4 + 3] = 1; }
  return Buffer.concat([hd, tab('MAP0', [[1, 'ground']]), tab('MAP1', [[1, 'ground']]), Buffer.from('GRID'), cells]);
}
const t = fs.mkdtempSync(path.join(os.tmpdir(), 'mapcell-')), fail = [];
const src = path.join(t, 'src');
for (const [n, c] of [['c5', 5], ['c10', 10]]) { const d = path.join(src, 'map', 'multi', n); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'map.net'), net(c, 6, 4)); }
const run = a => cp.spawnSync(process.execPath, [T, ...a], { encoding: 'utf8' });
let r = run([src, '--out', path.join(t, 'o')]);
if (!/map\.net 2: cell 10 1, cell 5 1, resampled to 10 1, other 0/.test(r.stdout)) fail.push('summary: ' + r.stdout.trim().split('\n')[1]);
const o5 = path.join(t, 'o', 'map', 'multi', 'c5', 'map.net');
if (!fs.existsSync(o5)) fail.push('cell-5 net not written');
else { const m = mapnet.parse(fs.readFileSync(o5)); if (m.problems.length || m.cell !== 10 || m.width !== 3 || m.height !== 2 || m.offX !== 100) fail.push('out net ' + m.cell + ' ' + m.width + 'x' + m.height); }
if (fs.existsSync(path.join(t, 'o', 'map', 'multi', 'c10', 'map.net'))) fail.push('cell-10 net rewritten');
r = run([src, '--out', path.join(t, 'k'), '--keep-cell']);
if (fs.existsSync(path.join(t, 'k', 'map', 'multi', 'c5', 'map.net')) || !/cell 5 kept/.test(r.stdout)) fail.push('--keep-cell');
r = run(['--check', src]); if (r.status !== 1 || !/c5\/map\.net cell 5/.test(r.stdout)) fail.push('check src: ' + r.status);
r = run(['--check', path.join(t, 'o')]); if (r.status !== 0) fail.push('check out: ' + r.status + ' ' + r.stdout);
// binhdr NET_CELL
const { checkNet } = require('../../binhdr/misc');
const codes = b => { const got = []; checkNet({ buf: b, rel: 'x', rep: { add: (f, l, c) => got.push(c) } }); return got; };
if (!codes(net(5, 6, 4)).includes('NET_CELL')) fail.push('binhdr cell 5 not flagged');
if (codes(net(10, 6, 4)).length) fail.push('binhdr cell 10 flagged: ' + codes(net(10, 6, 4)));
if (require('../../lib/registry').severity('NET_CELL') !== 'crash') fail.push('NET_CELL severity ' + require('../../lib/registry').severity('NET_CELL'));
fs.rmSync(t, { recursive: true, force: true });
console.log(fail.length ? 'FAIL cell: ' + fail.join('; ') : 'PASS cell');
if (fail.length) process.exitCode = 1;
