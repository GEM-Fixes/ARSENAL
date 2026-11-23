// keyprof --exe (game parity): MoW:AS2 and GoH --inst refused with the plain line (TST-19, GHVFS-13); GoH keys.set rules on a made-up
// fixture: common/* renamed (GHUI-36), {category} limits WARN_DUP (GHUI-251), interface/pause editable, --list category column,
// running check on call_to_arms.exe only for a file inside the GoH user folder. AS2 rules unchanged on the same fixture without --exe goh.
// Author: Imperator_Aug (ARSENAL, ia-2787dacf)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const K = path.join(__dirname, '..', 'keyprof.js'), { main, edit } = require('../keyprof');
let ok = true;
const bad = m => { console.log('FAIL ' + m); ok = false; };
const w = fs.mkdtempSync(path.join(os.tmpdir(), 'keyprof-goh-'));
const lines = ['{keys',
  '\t{"interface/toggle_map"', '\t\t{value KEY_M}', '\t}',
  '\t{"interface/pause"', '\t\t{value KEY_PAUSE}', '\t\t{noedit}', '\t}',
  '\t{"control_manual/helicopter_up"', '\t\t{value KEY_Q}', '\t\t{single}', '\t\t{category manual_helicopter}', '\t}',
  '\t{"control_manual/vault"', '\t\t{value KEY_V}', '\t}',
  '\t{"actions/toggle_attack"', '\t\t{value KEY_F}', '\t}',
  '\t{"interface/videocapture"', '\t\t{value KEY_N}', '\t\t{category none}', '\t}',
  '}', ''];
const src = Buffer.from(lines.join('\r\n'));
const f = path.join(w, 'keys.set'); fs.writeFileSync(f, src);
const run = args => cp.spawnSync(process.execPath, [K, ...args], { encoding: 'utf8' });

// 1. --inst refused per game with one line, exit 2
let r = run(['--exe', 'goh', '--inst', '1', '--list']);
if (r.status !== 2 || r.stderr.trim() !== "keyprof: not available for GoH: Gates of Hell keeps one user folder with no per-instance copy and its profile is the player's own; use --file <keys.set> (GHVFS-13)") bad('goh --inst: ' + r.status + ' ' + r.stderr);
r = run(['--exe', 'mowas2', '--inst', '1', '--list']);
if (r.status !== 2 || !/^keyprof: not available for MoW:AS2: instance profiles are made only by as64\.exe -instance.*\(TST-19\)$/.test(r.stderr.trim())) bad('mowas2 --inst: ' + r.stderr);
r = run(['--exe', 'bogus', '--file', f, '--list']); if (r.status !== 2) bad('bad --exe must exit 2');

// 2. --list shows the category column
r = run(['--exe', 'goh', '--file', f, '--list', 'control_manual/helicopter']);
if (r.stdout.trim() !== 'control_manual/helicopter_up\tKEY_Q\tsingle\tcategory manual_helicopter') bad('list category: ' + JSON.stringify(r.stdout));

// 3. common/ id renamed in GoH: error with the GoH id, file untouched
r = run(['--exe', 'goh', '--file', f, '--set', 'common/toggle_map=KEY_Y', '--write']);
if (r.status !== 1 || !/^KEY_GOH_RENAMED common\/toggle_map: AS2 common\/ ids are unbound in GoH \(GHUI-36\); GoH id: interface\/toggle_map$/m.test(r.stdout)) bad('renamed: ' + r.stdout);
if (!fs.readFileSync(f).equals(src)) bad('renamed must not write');
// the same set without --exe goh: the AS2 rule (new action warning, no error)
const as2 = edit(src, [{ action: 'common/toggle_map', key: 'KEY_Y' }]);
if (as2.errors.length || !as2.warns.some(x => /^WARN_NEW_ACTION common\/toggle_map/.test(x))) bad('as2 rule changed');

// 4. category: KEY_Q on vault clashes with helicopter_up only outside GoH; same category check
let e = edit(src, [{ action: 'control_manual/vault', key: 'KEY_Q' }], { game: 'goh' });
if (e.warns.some(x => /^WARN_DUP/.test(x))) bad('goh: manual_helicopter must not clash with the default category (vanilla binds KEY_Q to both)');
e = edit(src, [{ action: 'control_manual/vault', key: 'KEY_Q' }]);
if (!e.warns.some(x => /^WARN_DUP control_manual\/vault: KEY_Q is also bound to control_manual\/helicopter_up/.test(x))) bad('as2 dup');
e = edit(src, [{ action: 'control_manual/vault', key: 'KEY_F' }], { game: 'goh' });
if (!e.warns.some(x => /^WARN_DUP control_manual\/vault: KEY_F is also bound to actions\/toggle_attack/.test(x))) bad('goh: same (default) category must clash');
e = edit(src, [{ action: 'control_manual/helicopter_up', key: 'KEY_N' }], { game: 'goh' });
if (!e.warns.some(x => /^WARN_DUP control_manual\/helicopter_up: KEY_N is also bound to interface\/videocapture/.test(x))) bad('goh: category none clashes with any');

// 5. interface/pause editable in GoH (no WARN_NOEDIT), still warned under AS2 rules
e = edit(src, [{ action: 'interface/pause', key: 'KEY_O' }], { game: 'goh' });
if (e.warns.some(x => /^WARN_NOEDIT/.test(x))) bad('goh pause noedit');
if (!edit(src, [{ action: 'interface/pause', key: 'KEY_O' }]).warns.some(x => /^WARN_NOEDIT/.test(x))) bad('as2 noedit');

// 6. write in GoH: byte-exact one-line change, CRLF kept
r = run(['--exe', 'goh', '--file', f, '--set', 'interface/toggle_map=KEY_Y', '--write']);
const now = fs.readFileSync(f, 'latin1');
if (r.status !== 0 || now !== src.toString('latin1').replace('{value KEY_M}', '{value KEY_Y}')) bad('goh write: ' + r.stdout + r.stderr);
fs.writeFileSync(f, src); fs.rmSync(f + '.keyprof', { force: true });

// 7. running check: only for a file inside the GoH user folder; call_to_arms.exe running -> refused
const err = []; const ce = console.error, cl = console.log; console.error = s => err.push(s); console.log = () => {};
let code = main(['--exe', 'goh', '--file', f, '--set', 'interface/toggle_map=KEY_Y', '--write'], { gohUserDir: () => w, gohRunning: () => 'yes' });
const code2 = main(['--exe', 'goh', '--file', f, '--set', 'interface/toggle_map=KEY_Y', '--write'], { gohUserDir: () => path.join(w, 'elsewhere'), gohRunning: () => 'yes' });
console.error = ce; console.log = cl;
if (code !== 1 || !/^GAME_RUNNING call_to_arms\.exe: yes/.test(err[0] || '')) bad('goh running check: ' + code + ' ' + err.join('|'));
if (code2 !== 0) bad('file outside the GoH user folder must not be checked: ' + code2);

fs.rmSync(w, { recursive: true, force: true });
console.log(ok ? 'goh PASS' : 'goh FAIL');
process.exit(ok ? 0 : 1);
