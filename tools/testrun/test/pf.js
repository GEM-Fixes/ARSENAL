// preflight unit: fake as64 game; Enhanced mod mounts beside as64+ (no MOD_MODE error); .lng without {tags} -> NO_TAGS
// Author: Imperator_Aug (ARSENAL, ia-6b53a058)
const fs = require('fs'), path = require('path'), assert = require('assert');
const { preflight } = require('../testrun');
const g = path.join(process.env.TEST_WORK || __dirname, 'fixture', 'pfgame');
fs.rmSync(g, { recursive: true, force: true });
const w = (rel, t) => { const f = path.join(g, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
const info = n => `{Mod\r\n\t{Name "${n}"}\r\n\t{MinGameVersion "3.301"}\r\n}\r\n`;
w('as64.exe', 'x'); w('resource/set/a.set', '{a}'); w('as64/plus/mod.info', info('as64+'));
w('mods/good/mod.info', info('good')); w('mods/good/localization/#g.lng', '{tags\r\n\t{"k" "v"}\r\n}\r\n');
w('mods/bad/mod.info', info('bad')); w('mods/bad/localization/#b.lng', '{"k" "v"}\r\n');
assert.deepStrictEqual(preflight(path.join(g, 'mods', 'good'), g), []);
const b = preflight(path.join(g, 'mods', 'bad'), g);
assert.ok(b.some(f => f.tool === 'lnglint' && f.code === 'NO_TAGS'), JSON.stringify(b));
assert.ok(!b.some(f => f.code === 'MOD_MODE'), JSON.stringify(b));
console.log('preflight ok');
