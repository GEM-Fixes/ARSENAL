// CAM-1: edrun --close and pair key pose. No flag and no key: the mission is byte for byte as before. No game. node close-test.js
// Author: Imperator_Aug (ARSENAL, ia-02b192b6)
const assert = require('assert'), fs = require('fs'), path = require('path');
const e = require('../edrun.js');
const pairs = JSON.parse(fs.readFileSync(path.join(__dirname, 'old-pairs.json'), 'utf8'));
const plain = e.buildMission(pairs, 'rX', {});
assert.ok(!/cameras|scenario|"movement"|\{movement /.test(plain), 'no flag: no camera text');
assert.strictEqual(e.buildMission(pairs, 'rX', { close: undefined }), plain, 'no flag = byte identical');
const c = { dist: 190 };
// startview only, the rest of the mission untouched
const one = e.buildMission(pairs, 'rX', { close: { ...c, name: pairs[0].name } });
const m = /\t\t\{cameras\n[\s\S]*?\n\t\t\}\n/.exec(one);
assert.ok(m && /\{"startview"\n/.test(m[0]), 'startview block');
assert.strictEqual(one.replace(m[0], ''), plain, 'only the cameras block is added');
assert.ok(one.indexOf('{cameras') < one.indexOf('{Players'), 'cameras sits inside Helpers');
assert.ok(/\{"key000" \{position -?[\d.]+ -?[\d.]+ [\d.]+\} \{look_at -?[\d.]+ -?[\d.]+ 18\} \{fov 65\}\}/.test(m[0]), 'key form is the vanilla one');
// the eye is --close-dist from the focus
const v = /\{position (\S+) (\S+) (\S+)\} \{look_at (\S+) (\S+) (\S+)\}/.exec(m[0]).slice(1).map(Number);
assert.ok(Math.abs(Math.hypot(v[0] - v[3], v[1] - v[4], v[2] - v[5]) - 190) < 0.1, 'eye distance');
// a focus on a fire pair stands at the shooter or between shooter and foe
const L = e.layout(pairs[0], 0);
assert.ok(Math.abs(v[3] - L.s.x) < 1 || Math.abs(v[3] - (L.s.x + L.f.x) / 2) < 1, 'focus on the pair');
// a name outside this game's pairs (a later chunk) adds nothing
assert.strictEqual(e.buildMission(pairs, 'rX', { close: { ...c, name: 'not_here' } }), plain, 'name not in this game');
// a move pair: the view stands along the path, the eye on the far side of the walk
const walk = [{ name: 'w', class: 'infantry', shooter: 'mp/rus/rifle', count: 1, x: -700, y: -620, move: { x: 700, y: -620 } }];
const w = e.buildMission(walk, 'rX', { close: { ...c, name: 'w' } });
assert.ok(Math.abs(+/\{look_at (\S+) /.exec(w)[1] - (-550)) < 1, 'walker view ahead on the path');
// pose: an arm-row action, nothing else changes
const fire = { name: 'x', class: 'infantry', shooter: 'mp/rus/rifle', foe: 'mp/ger/rifle', dist: 30, x: 0, y: 0 };
const posed = pairs.map((p, i) => (i === 0 ? { ...p, class: 'infantry', pose: 'crawl' } : p));
const base = pairs.map((p, i) => (i === 0 ? { ...p, class: 'infantry' } : p));
const mp = e.buildMission(posed, 'rX', {}), mb = e.buildMission(base, 'rX', {});
const act = `{"actor_state" {selector {tag ${pairs[0].name}_s}} {movement {type crawl}}}`;
assert.ok(mp.includes(act), 'pose action');
const prow = new RegExp(`[^\\n]*"p_${pairs[0].name}_pose"[^\\n]*\\n`);
assert.ok(prow.test(mp) && /\{"delay" \{time 5\}\}/.test(prow.exec(mp)[0]), 'pose has its own late row');
assert.strictEqual(mp.replace(prow, ''), mb, 'pose adds one row only');
assert.ok(e.validate([{ ...fire, pose: 'crawl' }]).length === 0, 'crawl allowed');
assert.ok(e.validate([{ ...fire, pose: 'fly' }]).length === 1, 'bad pose refused');
assert.ok(e.validate([{ name: 'v', class: 'vehicle', shooter: 'a', crew: ['b'], foe: 'c', foeCrew: ['d'], pose: 'crawl' }]).length === 1, 'pose is infantry only');
// CLI codes
const cp = require('child_process'), run = x => cp.spawnSync('node', [path.join(__dirname, '../edrun.js'), '--pairs', path.join(__dirname, 'old-pairs.json'), ...x], { encoding: 'latin1' });
assert.strictEqual(run(['--close', 'no_such_pair', '--dry', '--no-check']).status, 2, 'unknown pair refused');
assert.strictEqual(run(['--close', '--dry', '--no-check']).status, 2, 'empty --close refused');
assert.strictEqual(run(['--close', `${pairs[0].name},${pairs[0].name}`, '--dry', '--no-check']).status, 2, 'a list is refused');
assert.strictEqual(run(['--close-dist', '100', '--dry', '--no-check']).status, 2, '--close-dist alone refused');
assert.strictEqual(run(['--close', pairs[0].name, '--close-dist', 'x', '--dry', '--no-check']).status, 2, 'bad --close-dist refused');
console.log('PASS close');
// MAPLOOK --view: a fixed eye/look_at startview, no pair needed
const vw = e.buildMission(pairs, 'rX', { close: { view: [100, -200, 3000.5, 0, 0, 40] } });
assert.ok(/\{"key000" \{position 100 -200 3000\.5\} \{look_at 0 0 40\} \{fov 65\}\}/.test(vw), 'view key');
assert.ok(/\{fov 40\}/.test(e.buildMission(pairs, 'rX', { close: { view: [1, 2, 3, 4, 5, 6, 40] } })), 'view fov');
// CHAIN-N4 talk: one own row of talk actions on the shooter, nothing else changes; bad keys refused
const talked = pairs.map((p, i) => (i === 0 ? { ...p, talk: ['desc/entity/x1', 'info/entity/x1'] } : p));
const mt = e.buildMission(talked, 'rX', {});
const trow = new RegExp(`[^\n]*"p_${pairs[0].name}_talk"[^\n]*\n`);
assert.ok(trow.test(mt), 'talk row');
const tr = trow.exec(mt)[0];
assert.ok(tr.includes(`{"delay" {time 6}} {"talk" {selector {tag ${pairs[0].name}_s}} {text "desc/entity/x1"}} {"delay" {time 6}} {"talk" {selector {tag ${pairs[0].name}_s}} {text "info/entity/x1"}}`), 'talk actions, one key per delay');
assert.strictEqual((tr.match(/"talk"/g) || []).length, 20, 'talk 10 rounds x 2 keys');
assert.strictEqual(mt.replace(trow, ''), plain, 'talk adds one row only');
assert.ok(e.validate([{ ...fire, talk: 'desc/entity/x1' }]).length === 0, 'talk key allowed');
assert.ok(e.validate([{ ...fire, talk: 'bad "key"' }]).length === 1, 'bad talk key refused');
assert.ok(e.validate([{ ...fire, talk: [] }]).length === 1, 'empty talk refused');
console.log('PASS talk');
