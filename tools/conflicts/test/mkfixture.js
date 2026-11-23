// conflicts fixture: vanilla loose resource + mods ma, mb (load order ma, mb). truth.md lines = `[info: ]rel[:line]: CODE`
// Author: Imperator_Aug (ARSENAL, ia-3ea69415)
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
function put(rel, lines) {
  const f = path.join(dir, 'game', rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, lines.join('\r\n') + '\r\n', 'latin1');
}
for (const m of ['ma', 'mb']) put(`mods/${m}/mod.info`, ['{mod', ` {Name "${m}"}`, '}']);

// a.def: both mods change hp differently -> MOD_MOD; ma alone changes speed -> overridden (info)
put('resource/set/a.def', ['{e1', ' {hp 10}', ' {speed 5}', '}']);
put('mods/ma/resource/set/a.def', ['{e1', ' {hp 20}', ' {speed 6}', '}']);
put('mods/mb/resource/set/a.def', ['{e1', ' {hp 30}', ' {speed 6}', '}']);

// b.def: only ma touches -> info overridden
put('resource/set/b.def', ['{e2', ' {name "x"}', '}']);
put('mods/ma/resource/set/b.def', ['{e2', ' {name "y"}', '}']);

// c.def: ma adds e3b, mb replaces whole file without it -> FILE_SHADOW
put('resource/set/c.def', ['{e3 {k 1}}']);
put('mods/ma/resource/set/c.def', ['{e3 {k 1}}', '{e3b {z 1}}']);
put('mods/mb/resource/set/c.def', ['{e3 {k 1}}']);

// d.def: ma byte-identical copy -> ITM_FILE
put('resource/set/d.def', ['{e4 {k 1}}']);
put('mods/ma/resource/set/d.def', ['{e4 {k 1}}']);

// e.def: ma keeps k identical (ITM_KEY), changes m
put('resource/set/e.def', ['{e5', ' {k 1}', ' {m 3}', '}']);
put('mods/ma/resource/set/e.def', ['{e5', ' {k 1}', ' {m 2}', '}']);

// f.bin: two mods replace differently
put('resource/set/f.bin', ['abc']);
put('mods/ma/resource/set/f.bin', ['abcd']);
put('mods/mb/resource/set/f.bin', ['abcde']);

// g.def: only ma provides it -> no finding
put('mods/ma/resource/set/g.def', ['{e7 {k 1}}']);

// h.def: formatting-only differences (1 vs 1.0 vs 1.00, spacing) are NOT changes -> ITM_FILE + ITM_KEY per mod, no MOD_MOD
put('resource/set/h.def', ['{e8', ' {hp 1}', '}']);
put('mods/ma/resource/set/h.def', ['{e8 {hp   1.0}   }']);
put('mods/mb/resource/set/h.def', ['{e8', ' {hp 1.00}', '}']);
