// Author: Imperator_Aug (ARSENAL, ia-9e1fb3f5)
const fs = require('fs'), path = require('path');
const root = process.argv[2];
let ok = true;
const need = (c, m) => { if (!c) { console.log(m); ok = false; } };
const t = fs.readFileSync(path.join(root, 'out/map/multi/a/map')).toString('latin1');
for (const gone of ['{Haze', '{GlobalTexture', 'AreaDisableEditor', 'DisableObstaclesEditor', '{Health ', 'HealthBroken', 'blockcamera', 'storedTouch']) need(!t.replace(/;[^\n]*/g, '').includes(gone), 'still there: ' + gone);
for (const kept of ['{Land {Position 0 0}}', '; {Haze} in a comment stays', 'ww_environment_mode', '{State 1}', '{hole}', '{disabled}', '{other 2}', 'hasMoved', '{Name "Haze"}']) need(t.includes(kept), 'lost: ' + kept);
need(!/\{able\s*\}/.test(t), 'empty able left behind');
need(t.split('\r\n').length > 5 && !/[^\r]\n/.test(t), 'line ends changed');
const g = fs.readFileSync(path.join(root, 'out/map/multi/a/map.grs'));
need(g.toString('latin1', 0, 8) === 'GRASPMAP', 'grass head ' + g.toString('latin1', 0, 8));
// PMAP(4) count(4) names(8 + 2) rect(16) cell(4) after GRAS(4)
const p = 4 + 4 + 4 + 8 + 2 + 16 + 4;
need(g.length === p + 8, 'grass size ' + g.length + ' want ' + (p + 8));
need(g.readUInt32LE(p) === (1 | 2 << 12 | 200 << 16 | 8 << 24) >>> 0, 'grass record 0x' + g.readUInt32LE(p).toString(16));
need(g.readUInt32LE(p + 4) === 0, 'empty record changed');
need(g.readFloatLE(p - 4) === 20, 'cell size lost');
if (!ok) process.exitCode = 1;
