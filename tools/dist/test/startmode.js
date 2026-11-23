// W6 U1: the one ARSENAL.exe decides between the window and a command in sea-main.js startMode (the START-MODE block). This test
// evaluates that block on its own (sea-main.js itself needs the SEA runtime), so no exe is built here.
// no arguments (a double click) = gui --open, with one note line only when the output is a console; `gui` alone opens the browser
// too; any other arguments run as given (the GUI's own child commands always carry arguments).
// usage: node tools/dist/test/startmode.js
// Author: Imperator_Aug (ARSENAL, ia-230a1a34)
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'sea-main.js'), 'utf8');
const m = /\/\/ START-MODE[^\n]*\n([\s\S]*?)\/\/ END START-MODE/.exec(src);
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL: ' + msg); } };
if (!m) { console.log('FAIL: no START-MODE block in sea-main.js'); process.exit(1); }
const { startMode, START_NOTE } = new Function(m[1] + '\nreturn { startMode, START_NOTE };')();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let r = startMode([], false);
ok(same(r.argv, ['gui', '--open']) && r.note === null, 'no arguments, no console = window, no note: ' + JSON.stringify(r));
r = startMode([], true);
ok(same(r.argv, ['gui', '--open']) && r.note === START_NOTE && /ARSENAL help/.test(r.note) && !/\n/.test(r.note), 'no arguments from a terminal = window + one line naming ARSENAL help: ' + JSON.stringify(r));
for (const [a, want] of [
  [['help'], ['help']], [['sdllint', 'x'], ['sdllint', 'x']], [['--version'], ['--version']], [['dev', 'q', 'Foo'], ['dev', 'q', 'Foo']],
  [['gui'], ['gui', '--open']], [['gui', '--port', '5000'], ['gui', '--port', '5000', '--open']],
  [['gui', '--no-open', '--port', '7'], ['gui', '--no-open', '--port', '7']], [['gui', '--open'], ['gui', '--open']], [['gui', '--help'], ['gui', '--help']],
]) {
  for (const tty of [false, true]) { r = startMode(a, tty); ok(same(r.argv, want) && r.note === null, `${JSON.stringify(a)} tty ${tty} -> ${JSON.stringify(want)}: got ${JSON.stringify(r)}`); }
}
const before = ['x']; startMode(before, true); ok(same(before, ['x']), 'argv not changed in place');
ok(!/GUIEXE|ARSENAL-gui\.exe/.test(src.replace(/\/\/[^\n]*/g, '')), 'sea-main.js code no longer keys on the exe name');
console.log(fails ? `startmode: ${fails} failed` : 'startmode: PASS');
process.exit(fails ? 1 : 0);
