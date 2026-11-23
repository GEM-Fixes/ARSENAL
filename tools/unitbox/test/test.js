// Author: Imperator_Aug (ARSENAL, ia-38d321a4)
'use strict';
// unitbox seed test: fixture game (4 peers, class tank_medium, L 6.0..7.5 m), mod with a fitting unit, a 2x-too-long unit, a text-only unit.
const fs = require('fs'), path = require('path'), assert = require('assert');
const U = require('../unitbox.js');
const W = path.join(__dirname, 'work');

function ply(min, max) { // EPLY + BNDS only: enough for the bounds reader
  const b = Buffer.alloc(32); b.write('EPLY', 0, 'latin1'); b.write('BNDS', 4, 'latin1');
  [...min, ...max].forEach((v, i) => b.writeFloatLE(v, 8 + 4 * i)); return b;
}
function put(f, data) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); }
// unit with a hull of length Lm (metres) and a turret bone offset forward by 10 units that stays inside the hull
function unit(root, dirKey, stem, Lm, nation) {
  const d = path.join(root, 'resource', dirKey, stem);
  const half = Lm * 20 / 2;
  put(path.join(d, stem + '.def'), `{game_entity\r\n\t{extension "${stem}.mdl"}\r\n}\r\n`);
  put(path.join(d, stem + '.mdl'), `{skeleton\r\n {bone "basis"\r\n  {orientation 1 0 0 0 -1 0 0 0 1}\r\n  {bone "body" {Position 0 0 0} {VolumeView "body.ply"}\r\n   {bone "turret" {Position 10 0 20} {VolumeView "turret.ply"}}\r\n  }\r\n }\r\n}\r\n`);
  put(path.join(d, 'body.ply'), ply([-half, -30, 0], [half, 30, 40]));   // 3.0 m wide, 2.0 m high
  put(path.join(d, 'turret.ply'), ply([-10, -10, 0], [10, 10, 10]));      // at x+10, z+20: inside the hull box
}
const G = path.join(W, 'game'), M = path.join(W, 'mod'), H = path.join(W, 'goh');
fs.rmSync(W, { recursive: true, force: true });
[['p1', 6.0], ['p2', 6.5], ['p3', 7.0], ['p4', 7.5]].forEach(([s, l]) => unit(G, 'entity/-vehicle/tank_medium', s, l));
unit(M, 'entity/-vehicle/eng/tank_medium', 'fits', 6.8);
unit(M, 'entity/-vehicle/eng/tank_medium', 'toolong', 14.0);
put(path.join(M, 'resource/entity/-vehicle/eng/tank_medium/textonly/textonly.def'), '{game_entity\r\n\t{extension "textonly.mdl"}\r\n}\r\n');
unit(H, 'entity/-vehicle/eng/tank_medium', 'textonly', 7.0);

const r = U.run({ input: M, game: G });
const by = Object.fromEntries(r.units.map(u => [u.unit, u]));
assert.strictEqual(r.form, 'unitbox/1');
assert.deepStrictEqual(r.units.map(u => u.unit), ['fits', 'textonly', 'toolong']);
assert.deepStrictEqual(by.fits.box, [6.8, 3, 2], 'fits box (turret inside the hull adds nothing)');
assert.strictEqual(by.fits.ok, true);
assert.strictEqual(by.toolong.ok, false);
assert.strictEqual(r.units.filter(u => u.ok === false).length, 1, 'exactly one not-ok');
assert.deepStrictEqual(by.fits.peers.L, [6, 7.5]);
assert.strictEqual(by.fits.class, 'tank_medium');
assert.ok(/L 14 outside/.test(by.toolong.why), by.toolong.why);
assert.strictEqual(by.textonly.box, null); assert.strictEqual(by.textonly.ok, null); assert.strictEqual(by.textonly.why, 'no model');
const r2 = U.run({ input: M, game: G, goh: H });
const t2 = r2.units.find(u => u.unit === 'textonly');
assert.deepStrictEqual(t2.box, [7, 3, 2]); assert.strictEqual(t2.ok, true); assert.ok(/^goh/.test(t2.why));
assert.strictEqual(JSON.stringify(U.run({ input: M, game: G, goh: H })), JSON.stringify(r2), 'deterministic');
// text-only port: mdl text in the mod, plys only in GoH at the same key -> box from model plys
{
  const M2 = path.join(W, 'mod2'), H2 = path.join(W, 'goh2');
  unit(H2, 'entity/-vehicle/eng/tank_medium', 'mdlonly', 7.2);
  unit(M2, 'entity/-vehicle/eng/tank_medium', 'mdlonly', 7.2);
  const d = path.join(M2, 'resource/entity/-vehicle/eng/tank_medium/mdlonly');
  fs.rmSync(path.join(d, 'body.ply')); fs.rmSync(path.join(d, 'turret.ply'));
  const a = U.run({ input: M2, game: G }).units[0];
  assert.strictEqual(a.box, null); assert.ok(/^no ply with bounds/.test(a.why), a.why);
  const b = U.run({ input: M2, game: G, goh: H2 }).units[0];
  assert.deepStrictEqual(b.box, [7.2, 3, 2]); assert.strictEqual(b.ok, true); assert.strictEqual(b.src, 'goh-ply');
  assert.ok(/^goh source model \(2 ply from GoH\)/.test(b.why), b.why);
  // GoH ply in another format: named with its header bytes, scale not judged
  fs.writeFileSync(path.join(H2, 'resource/entity/-vehicle/eng/tank_medium/mdlonly/body.ply'), Buffer.from('XPLYBNDS' + '\0'.repeat(24), 'latin1'));
  fs.writeFileSync(path.join(H2, 'resource/entity/-vehicle/eng/tank_medium/mdlonly/turret.ply'), Buffer.from('XPLYBNDS' + '\0'.repeat(24), 'latin1'));
  const c = U.run({ input: M2, game: G, goh: H2 }).units[0];
  assert.strictEqual(c.box, null); assert.strictEqual(c.ok, null);
  assert.ok(/^not judged: no ply with bounds .*not EPLY\/BPLY\+BNDS, first .*body\.ply header 58504c59424e4453/.test(c.why), c.why);
}
// a bone with Orientation turns the ply box: 90 degrees about z swaps L and W of a mounted box
const T = U.tree('{skeleton {bone "b" {matrix34 0 1 0 -1 0 0 0 0 1 0 0 0}}}');
assert.strictEqual(T.kids[0].kids[0].kids[0].name, 'matrix34');
console.log('ok');
