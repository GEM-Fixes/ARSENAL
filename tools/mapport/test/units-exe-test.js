// mapport/units --exe (game parity): the AS2 target stack is read through lib/vfs with the named exe. Made-up shared install:
//   as64.exe + as64/core/resource/entity/flora/coreonly/coreonly.def (a def only AS64 has). A log names coreonly and bushb.
//   no --exe / --exe as64: coreonly is in the stack -> only bushb is planned. --exe mowas_2: no as64/core -> both are planned.
//   --exe goh: refused with exit 2 and one line.
// Author: Imperator_Aug (ARSENAL, ia-7a41c2d9)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const t = fs.mkdtempSync(path.join(os.tmpdir(), 'units-exe-'));
const put = (rel, s) => { const p = path.join(t, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
put('as2/as64.exe', ''); put('as2/mowas_2.exe', '');
put('as2/resource/entity/flora/base_a/base_a.def', '{game_entity}\r\n');
put('as2/as64/core/resource/entity/flora/coreonly/coreonly.def', '{game_entity}\r\n');
put('goh/resource/entity/flora/bushb/bushb.def', '{game_entity}\r\n');
put('game.log', "[00:00:01] can't spawn entity coreonly (/map/x/map, 2)\r\n[00:00:02] can't spawn entity bushb (/map/x/map, 3)\r\n");
const units = path.join(__dirname, '..', 'units.js');
const run = (...exe) => cp.spawnSync(process.execPath, [units, '--log', path.join(t, 'game.log'), '--goh', path.join(t, 'goh'), '--game', path.join(t, 'as2'), '--out', path.join(t, 'out' + exe.join('')), ...exe], { encoding: 'utf8' });
const names = r => { assert.strictEqual(r.status, 0, r.stderr); return r.stdout.split(/\r?\n/).filter(l => /^(SCENERY|NO_GOH|DONOR|RAW|BLOCKED) /.test(l)).map(l => l.split(/\s+/)[1]).sort(); };
assert.deepStrictEqual(names(run()), ['bushb']);
assert.deepStrictEqual(names(run('--exe', 'as64')), ['bushb']);
assert.deepStrictEqual(names(run('--exe', 'mowas_2')), ['bushb', 'coreonly']);
assert.deepStrictEqual(names(run('--exe', 'mowas2')), ['bushb', 'coreonly']);
const g = run('--exe', 'goh');
assert.strictEqual(g.status, 2); assert.match(g.stderr, /^mapport\/units: not available for GoH: .*\(plan\/reports\/game-parity\/t-maps\.md:8\)/);
const b = run('--exe', 'nope'); assert.strictEqual(b.status, 2);
assert.strictEqual(require('../units.js').targetExe({}), 'as64');
// donorpick hand-off: --exe mowas_2 appended only when --exe is given; the AS64 argument list is unchanged
const { donorArgs } = require('../units.js'), games = require('../../lib/games');
const base = donorArgs({ goh: 'G', game: 'A' }, ['t34']);
assert.deepStrictEqual(base.slice(1), ['--goh', 'G', '--game', 'A', '--json', '--entity', 't34']);
assert.deepStrictEqual(donorArgs({ goh: 'G', game: 'A', exe: games.get('mowas2') }, ['t34']).slice(1), ['--goh', 'G', '--game', 'A', '--json', '--entity', 't34', '--exe', 'mowas_2']);
fs.rmSync(t, { recursive: true, force: true });
console.log('PASS units exe');
