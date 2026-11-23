// exam/draw game parity: the run list serves as64_ed.exe only. --exe as64 (or none) draws as before; mowas2 and goh refuse with one line
//   and its row, exit 2, nothing written; an unknown word is exit 2, a renamed *.exe draws as as64. --game defaults to the install lib/gamedir finds (no path in the tool).
//   usage: node parity.js <tempdir>
// Author: Imperator_Aug (ARSENAL, ia-016474b3)
const fs = require('fs'), path = require('path'), A = require('assert');
const d = require('../draw.js'), T = process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'exam-parity-'));
const groups = { cards: 0, groups: [{ sig: 's0', kind: 'vehicle', rep: 'u0_0', members: [{ card: 'u0_0', armies: [] }] }] };
fs.writeFileSync(path.join(T, 'pg.json'), JSON.stringify(groups));
A.strictEqual(d.gateOf(undefined), ''); A.strictEqual(d.gateOf('as64_ed.exe'), ''); A.strictEqual(d.gateOf('as64'), '');
A.strictEqual(d.gateOf('nosuch'), null); A.strictEqual(d.gateOf('my_build.exe'), '');
A.deepStrictEqual(d.gateOf('mowas_2_ed.exe').slice(0, 1), ['mowas2']); A.deepStrictEqual(d.gateOf('goh').slice(0, 1), ['goh']);
const lines = [];
const refuse = (tool, g, why, row) => lines.push(require('../../lib/games').notFor(tool, g, why, row));
const run = (o, x) => d.main(['--seed', '3', '--groups', path.join(T, 'pg.json'), '--out', path.join(T, o).split(path.sep).join('/'), ...x], { refuse });
A.strictEqual(run('m', ['--exe', 'mowas_2']), 2);
A.ok(/^exam draw: not available for MoW:AS2: .*control pipe.* \(TST-19, ENG-19\)$/.test(lines[0]), lines[0]);
A.strictEqual(run('g', ['--exe', 'call_to_arms_ed.exe']), 2);
A.ok(/^exam draw: not available for GoH: .*never starts the mission \(modweb\/testing\/in-play-nopipe\.md:9\)$/.test(lines[1]), lines[1]);
A.ok(!fs.existsSync(path.join(T, 'm')) && !fs.existsSync(path.join(T, 'g')), 'refused draws write nothing');
const err = console.error; console.error = () => {}; A.strictEqual(run('x', ['--exe', 'nosuch']), 2); console.error = err;
// as64: --exe as64 and no --exe give the same files; --game given is used as written; no --game: the lib/gamedir install (or a placeholder)
A.strictEqual(run('a1', ['--game', 'fakegame/dir']), 0); A.strictEqual(run('a2', ['--game', 'fakegame/dir', '--exe', 'as64']), 0);
const rl = o => fs.readFileSync(path.join(T, o, 'run-list.txt'), 'utf8').split(o).join('o');
A.strictEqual(rl('a1'), rl('a2'), 'as64 run list same with --exe as64');
A.ok(rl('a1').includes('--game "fakegame/dir"') && rl('a1').includes('--exe as64_ed.exe'), rl('a1'));
A.strictEqual(run('a3', []), 0);
const gd = require('../../lib/gamedir').resolve().dir;
A.ok(rl('a3').includes('--game "' + (gd ? gd.replace(/\\/g, '/') : '<game dir>') + '"'), 'default game from lib/gamedir: ' + rl('a3'));
console.log('PASS exam parity');
