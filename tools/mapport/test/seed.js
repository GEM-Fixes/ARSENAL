// builds a small GoH-form map folder: one map text with every dropped key plus keys that must stay, one GoH .grs, one as64 .grs
// Author: Imperator_Aug (ARSENAL, ia-f9b1604d)
const fs = require('fs'), path = require('path');
const root = process.argv[2];
const dirA = path.join(root, 'src/map/multi/a'), dirB = path.join(root, 'src/map/multi/a2');
fs.mkdirSync(dirA, { recursive: true }); fs.mkdirSync(dirB, { recursive: true });
const map = [
  '{map',
  '{Land {Position 0 0}}',
  '{Haze {boundary {on}} {altitude {on}{start 100}{end -100}}}',
  '; {Haze} in a comment stays',
  '{Ocean {ww_environment_mode sea}{active 0}}',
  '{GlobalTexture {Normalmap "x}y"}}',
  '{Entity "tree" 0x1',
  '  {AreaDisableEditor 1}',
  '  {DisableObstaclesEditor 1}',
  '  {Component "c" {Health 5}{HealthBroken 2}{State 1}}',
  '  {Volume "v" {able {blockcamera}}}',
  '  {Volume "w" {able {blockcamera}{hole}} {disabled}}',
  '  {Placer {state {storedTouch 1}{other 2}}}',
  '  {Extender "cannon" {hasMoved 1}}',
  '  {Name "Haze"}',
  '}',
  '}',
  '',
].join('\r\n');
fs.writeFileSync(path.join(dirA, 'map'), Buffer.from(map, 'latin1'));
const names = ['grass_a', 'b'];
const head = [Buffer.from('PMAP'), u32(names.length), ...names.map(n => Buffer.concat([Buffer.from([n.length]), Buffer.from(n)])), i32(0), i32(0), i32(2), i32(1), f32(20)];
const goh = Buffer.concat([Buffer.from('GRAS'), Buffer.from('VER-'), u32(2), Buffer.from('SEED'), u32(77), ...head,
  Buffer.from([1, 0, 2, 200, 8]), Buffer.from([0, 0, 0, 0, 0])]);
fs.writeFileSync(path.join(dirA, 'map.grs'), goh);
const as2 = Buffer.concat([Buffer.from('GRAS'), ...head, u32(0x08000001), u32(0)]);
fs.writeFileSync(path.join(dirB, 'map.grs'), as2);
function u32(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; }
function i32(v) { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; }
function f32(v) { const b = Buffer.alloc(4); b.writeFloatLE(v); return b; }
