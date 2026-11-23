// mpsync fixture: fixture/A + fixture/B fake game dirs (loose resource/ only) + fixture/A/mods/m. truth.md lines "name CODE"
// (info codes included; run.sh prints without -q). also unit checks of matchWildcard / size-crc.
// Author: Imperator_Aug (ARSENAL, ia-5400d1e0)
const fs = require('fs'), path = require('path'), assert = require('assert');
const dir = path.join(__dirname, 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
const truth = ['# name CODE (compare A B; then --mod)'];
const put = (side, rel, text) => { const f = path.join(dir, side, 'resource', rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const both = (rel, a, b, code) => { put('A', rel, a); put('B', rel, b); if (code) truth.push(`/${rel} ${code}`); };

both('set/a.set', '{x 1}', '{x 2}', 'MPSYNC_DETECTED');                 // content-CRC class, same size
both('entity/x.ply', 'AAAA', 'BBBB', 'WARN_MPSYNC_SILENT');             // size-only, same size
both('entity/y.ply', 'AAAA', 'AAAAAA', 'MPSYNC_DETECTED');              // size-only, size differs
both('entity/l.lua', 'a=1', 'a=2', 'WARN_MPSYNC_SILENT');               // .lua size-only
both('entity/t.dds', 'AAAA', 'BBBB', 'MPSYNC_EXCLUDED_DIFF');           // excluded mask
both('interface/foo.lua', 'a=1', 'a=2', null);                           // outside sync folders -> not even in tree...
truth.push('/interface/foo.lua MPSYNC_EXCLUDED_DIFF');
both('script/x.lua', 'a=1', 'a=2', 'MPSYNC_EXCLUDED_DIFF');
both('entity/same.ply', 'AAAA', 'AAAA', null);
both('map/multi/m1/map', 'one', 'two', 'MPSYNC_DETECTED');              // '*/map' content class, map tree
put('A', 'entity/onlya.mtl', 'q'); truth.push('/entity/onlya.mtl MPSYNC_ONLY_IN_A');
put('B', 'entity/onlyb.def', 'q'); truth.push('/entity/onlyb.def MPSYNC_ONLY_IN_B');
put('B', 'sound/s.wav', 'q'); truth.push('/sound/s.wav MPSYNC_EXCLUDED_DIFF');

// mod under A/mods/m
const mf = (rel, t) => { const f = path.join(dir, 'A', 'mods', 'm', rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
mf('mod.info', '{Mod\r\n\t{Name "m"}\r\n\t{MinGameVersion "3.262.1"}\r\n\t{MaxGameVersion "3.262.1"}\r\n}\r\n');
mf('resource/entity/q.vol', 'zz'); mf('resource/set/q.set', '{a}'); mf('resource/script/q.lua', 'a');
// Enhanced (3.301) mod in an as64 game C: mounts only beside as64+; --mod must retry with it
const cf = (rel, t) => { const f = path.join(dir, 'C', rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
const info = n => `{Mod\r\n\t{Name "${n}"}\r\n\t{MinGameVersion "3.301"}\r\n}\r\n`;
cf('as64.exe', 'x'); cf('resource/set/a.set', '{a}'); cf('as64/plus/mod.info', info('as64+'));
cf('mods/en/mod.info', info('en')); cf('mods/en/resource/set/e.set', '{e}');
fs.writeFileSync(path.join(__dirname, 'truth.md'), truth.join('\n') + '\n');
fs.writeFileSync(path.join(__dirname, 'truth_mod.md'), ['# --mod', '/entity/q.vol MPSYNC_SIZE_ONLY', 'm WARN_MPSYNC_SIZE_ONLY', '/script/q.lua MPSYNC_UNCHECKED'].join('\n') + '\n');

// unit checks (engine MatchWildcard semantics)
const m = require('../mpsync');
assert(m.matchWildcard('/set/foo', '/set/*') && m.matchWildcard('/a/b.def', '*.def') && m.matchWildcard('/x/map', '*/map'));
assert(m.matchWildcard('/a/b.s_tmp', '*.s_*') && !m.matchWildcard('/a/b.ply', '*.def') && !m.matchWildcard('/a/mapx', '*/map'));
assert.strictEqual(m.classify('/entity/a.ply', { exclude: ['*.dds'], crc: ['*.def'] }).cls, 'Z');
assert.strictEqual(m.classify('/script/a.def', { exclude: [], crc: ['*.def'] }).cls, 'X');
assert.strictEqual(m.classify('/fx/a.def', { exclude: [], crc: ['*.def'] }).cls, 'S');
assert.strictEqual(m.sizeCrc(4) >>> 0, require('zlib').crc32(Buffer.from([4, 0, 0, 0]), 0xffffffff) >>> 0);
