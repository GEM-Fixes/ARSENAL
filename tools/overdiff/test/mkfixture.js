// overdiff fixture: fixture/game (vanilla loose resource) + fixture/game/mods/m. truth.md lines = `[info: ]rel[:line]: CODE`
// Author: Imperator_Aug (ARSENAL, ia-86e5bd0f)
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
const truth = ['# [info: ]file[:line]: CODE (seeded; diffed by run.sh)'];
function put(rel, lines) {
  const f = path.join(dir, 'game', rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, lines.join('\r\n') + '\r\n', 'latin1');   // game text = cp1251 + CRLF
}
const t = s => truth.push(s);

put('mods/m/mod.info', ['{mod', ' {Name "m"}', ' {Delete "resource/set/f.def"}', '}']);

// a.def: hp changed, range added, armor removed -> FULL_SHADOW
put('resource/set/a.def', ['{e1', ' {hp 10}', ' {speed 5}', ' {armor 3}', '}', '{e1b {z 1}}']);
put('mods/m/resource/set/a.def', ['{e1', ' {hp 20}', ' {speed 5}', ' {range 9}', '}']);
t('info: resource/set/a.def:2: OVR_KEY_CHANGED');
t('info: resource/set/a.def:4: OVR_KEY_ADDED');
t('info: resource/set/a.def:4: OVR_KEY_REMOVED');
t('info: resource/set/a.def:6: OVR_KEY_REMOVED');
t('info: resource/set/a.def:6: OVR_KEY_REMOVED');
t('resource/set/a.def: OVR_FULL_SHADOW');

// b.def: purely additive (string value changed too) -> no warn
put('resource/set/b.def', ['{e2', ' {name "x"}', '}']);
put('mods/m/resource/set/b.def', ['{e2', ' {name "y"}', ' {extra 1}', '}']);
t('info: resource/set/b.def:2: OVR_KEY_CHANGED');
t('info: resource/set/b.def:3: OVR_KEY_ADDED');

// c.def: identical copy
put('resource/set/c.def', ['{e3 {k 1}}']);
put('mods/m/resource/set/c.def', ['{e3 {k 1}}']);
t('info: resource/set/c.def: OVR_IDENTICAL');

// g.def: 1.4 -> 1.40 and "a b" respaced are NOT changes (semantic compare); only w changes -> exactly one CHANGED (line 4)
put('resource/set/g.def', ['{e7', ' {sp 1.4}', ' {nm "a b"}', ' {w 2}', '}']);
put('mods/m/resource/set/g.def', ['{e7', ' {sp 1.40}', ' {nm  "a b"}', ' {w 3}', '}']);
t('info: resource/set/g.def:4: OVR_KEY_CHANGED');

// opaque replace
put('resource/set/d.bin', ['abc']);
put('mods/m/resource/set/d.bin', ['abcdef']);
t('info: resource/set/d.bin: OVR_OPAQUE_REPLACED');

// mod-only file: no finding
put('mods/m/resource/set/e.def', ['{e5 {k 1}}']);

// deleted by mod.info
put('resource/set/f.def', ['{e6 {k 1}}']);
t('info: resource/set/f.def: OVR_FILE_DELETED');

fs.writeFileSync(path.join(__dirname, 'truth.md'), truth.join('\n') + '\n');
