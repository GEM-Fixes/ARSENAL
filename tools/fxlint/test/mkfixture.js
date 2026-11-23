// fxlint fixture: fixture/mod + truth.md. put(rel, lines): line = text | [text, CODE...] → truth "rel:line: CODE"
// Author: Imperator_Aug (ARSENAL, ia-afbb566d)
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

// VIS-09 sound tags (Tag is case-insensitive: Effects ok)
put('resource/sound/ok/folder.set', ['{sound', '\t{tag Effects}', '}']);
put('resource/sound/bad/folder.set', ['{sound', ['\t{tag main_environment}', 'SND_TAG_UNKNOWN'], '}']);

// VIS-14 weather/thunder
put('resource/set/environment/skirmish/t.set', [
  '{environment',
  '\t{weather',
  '\t\t{enable}',
  '\t\t{fx "rain"}',
  '\t}',
  '\t{thunder',
  '\t\t{enable}',
  '\t\t{sound "world/thunder"}',
  '\t}',
  '}',
]);
put('resource/set/environment/skirmish/w.set', [
  '{environment',
  ['\t{weather', 'WARN_ENV_NO_ENABLE'],
  '\t\t{fx "snow"}',
  '\t}',
  ['\t{thunder', 'THUNDER_NO_SOUND'],
  '\t\t{enable}',
  '\t\t{color 0xff686c73}',
  '\t}',
  '\t{thunder',        // no enable: info only (not counted)
  '\t\t{sound "world/thunder"}',
  '\t}',
  '}',
]);

// VIS-19 fxmanager + track tracers
put('resource/set/fxmanager.set', ['{fxmanager', '\t{group', '\t\t{fx "tracks_ok"}', '\t\t{countLimit 10}', '\t}', '}']);
put('resource/entity/-vehicle/t/t.def', [
  'game_entity',
  '{Track "left"',
  '\t{Tracer',
  '\t\t{View "tracks_ok"}',
  '\t}',
  '}',
  '{Track "right"',
  '\t{Tracer',
  ['\t\t{View "tracks_missing"}', 'FX_TRACER_UNLISTED'],
  '\t}',
  '}',
]);

// VIS-18 interaction actions
put('resource/set/interaction_entity/entity.set', [
  '{entities',
  '\t{"tank"',
  '\t\t{on spawn',
  '\t\t\t{set "a" 1}',
  '\t\t\t{crew_emit "x"}',
  ['\t\t\t{emit "x"}', 'IA_ACTION_UNKNOWN'],
  '\t\t\t{if "a" {spawn "fx_x" {con "y"}} else {delay 1 {kill_flags}}}',
  ['\t\t\t{if "a" {emit_fx "x"}}', 'IA_ACTION_UNKNOWN'],
  ['\t\t\t{delay 1 {fire_all}}', 'IA_ACTION_UNKNOWN'],
  '\t\t}',
  '\t}',
  '}',
]);

// TST-83 place foresight not under its linkbone (two places end up on one aim chain); clean twin has own foresight under each link
const fsDef = (mdl, mark) => ['{game_entity', '\t{Extension "' + mdl + '"}', '\t{Weaponry', '\t\t{place "mgun1"', '\t\t\t{weapon "dt" filled}',
  mark ? ['\t\t\t{foresight "foresight4"}', 'WARN_FORESIGHT_NOT_UNDER_LINK'] : '\t\t\t{foresight "foresight4"}', '\t\t\t{linkbone "mgunA"}', '\t\t}',
  '\t\t{place "mgun2"', '\t\t\t{weapon "dt" filled}', '\t\t\t{foresight "foresight4"}', '\t\t\t{linkbone "mgunB"}', '\t\t}', '\t}', '}'];
const fsMdl = twin => ['{Skeleton', '  {bone "basis"', '    {bone "mgunB"', '      {bone "foresight4"}', '    }', twin ? '    {bone "mgunA" {bone "foresight4"}}' : '    {bone "mgunA"}', '  }', '}'];
put('resource/entity/fs/bad.def', fsDef('bad.mdl', true));
put('resource/entity/fs/bad.mdl', fsMdl(false));
put('resource/entity/fs/ok.def', fsDef('ok.mdl', false));
put('resource/entity/fs/ok.mdl', fsMdl(true));

fs.writeFileSync(path.join(__dirname, 'truth.md'), truth.join('\n') + '\n');
