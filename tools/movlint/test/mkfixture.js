// movlint fixture: fixture/mod + truth.md. put(rel, lines): line = text | [text, CODE...] → truth "rel:line: CODE"
// Author: Imperator_Aug (ARSENAL, ia-476603e9)
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
const truth = ['# file:line: CODE (seeded defects; diffed by run.sh)'];
function put(rel, lines) {
  const f = path.join(dir, 'mod', rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const text = lines.map((l, i) => {
    if (Array.isArray(l)) { for (const c of l.slice(1)) truth.push(`${rel}:${i + 1}: ${c}`); return l[0]; }
    return l;
  });
  fs.writeFileSync(f, text.join('\r\n') + '\r\n', 'latin1');   // game text = cp1251 + CRLF
}

const bone = (n, extra) => ['	{bone revolute "' + n + '"', ...(extra || []), '	}'];
// clean wheel entity: pivots present, radii fine, known Locomotion keys
put('resource/entity/ok/ok.def', ['{game_entity', '  {Chassis "wheel"', '    {Locomotion {MaxSpeed 20} {Gears 0.1 0.5} {maxSpeedAtMaxTurn 5}}', '  }', '  {Extension "ok.mdl"}', '}']);
put('resource/entity/ok/ok.mdl', ['{Skeleton', '  {bone "basis" {parameters "SteerMax=30;WheelRadius=0.47;"}', '    {bone "pivot_front"}', '    {bone "pivot_back"}', '    {bone revolute "wheelleft1" {parameters "radius=0.4;"}}', '    {bone revolute "wheelleft2"}', '  }', '}']);
// MOV-01
put('resource/entity/bad/bad.def', ['{game_entity', '  {Chassis "wheel"', '    {Locomotion {MaxSpeed 20}', ['      {MaxSped 20}', 'MOV_LOCO_KEY'], '    }', '  }', '  {Extension "bad.mdl"}', '}']);
// MOV-20: no pivot_back, WheelRadius 0, wheel radius 0
put('resource/entity/bad/bad.mdl', [['{Skeleton', 'MOV_PIVOT_MISSING'], ['  {bone "basis" {parameters "WheelRadius=0;"}', 'MOV_WHEEL_RADIUS_ZERO'], '    {bone "pivot_front"}', ['    {bone revolute "wheelright1" {parameters "Radius=0;"}}', 'MOV_BONE_RADIUS_ZERO'], '  }', '}']);
// non-wheel chassis: no pivot finding; foot chassis Locomotion not read
put('resource/entity/trk/trk.def', ['{game_entity', '  {Chassis "track" {Locomotion {MaxSpeed 20}}}', '  {Extension "trk.mdl"}', '}']);
put('resource/entity/trk/trk.mdl', ['{Skeleton', '  {bone "basis"}', '}']);
put('resource/entity/foot/foot.def', ['{game_entity', '  {Chassis "foot" {Locomotion {Whatever 1}}}', '}']);

fs.writeFileSync(path.join(__dirname, 'truth.md'), truth.join('\n') + '\n');
