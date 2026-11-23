// scenarios; prints "scenario CODE" lines (see truth.md) and ASSERT lines on failure
// Author: Imperator_Aug (ARSENAL, ia-fbacb7db)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const fx = path.join(__dirname, 'fixture'), G = path.join(fx, 'game'), M = path.join(fx, 'mod');
const tool = path.join(__dirname, '..', 'patch-entity.js');
const K = 'resource/set/stuff/rifle/k98';
const run = (...a) => { const r = cp.spawnSync(process.execPath, [tool, M, '--game', G, ...a], { encoding: 'utf8' }); return { st: r.status, out: r.stdout + r.stderr }; };
const codes = out => [...new Set([...out.matchAll(/^(?:info: )?[^\n]*?: ([A-Z][A-Z_0-9]+) /gm)].map(m => m[1]))];
const emit = (name, out, want) => { for (const c of want) console.log(name + ' ' + c); };
const assert = (c, m) => { if (!c) console.log('ASSERT ' + m); };
const rd = () => fs.readFileSync(path.join(M, K), 'latin1');
const van = fs.readFileSync(path.join(G, K), 'latin1');

let r = run('--file', K, '--set', 'rifle/healthDamage=55', '--dry-run');
assert(/\+4: \t\{healthDamage 55\}/.test(r.out) && /-4: /.test(r.out), 'dry diff ' + r.out);
assert(!fs.existsSync(path.join(M, K)), 'dry-run wrote');
console.log('dryrun ' + codes(r.out).filter(c => c === 'PATCH_DRY_RUN' || c === 'PATCH_FULL_COPY').sort().join('+'));

r = run('--file', K, '--set', 'rifle/healthDamage=55');
assert(r.st === 0 && rd() === van.replace('healthDamage 50', 'healthDamage 55'), 'set existing ' + r.out);
console.log('setexisting ' + codes(r.out).filter(c => /^PATCH_(COPIED|FULL_COPY|WROTE)$/.test(c)).sort().join('+'));

r = run('--file', K, '--set', 'rifle/nosuchkey=1');
assert(r.st === 1 && /PATCH_KEY_MISSING/.test(r.out), 'missing');
console.log('setmissing ' + codes(r.out).join('+'));

r = run('--file', K, '--add', 'rifle/nosuchkey=1');
assert(r.st === 0 && /\{nosuchkey 1\}/.test(rd()) && /\r\n\}\r\n$/.test(rd()), 'add ' + r.out + rd());
console.log('add ' + codes(r.out).filter(c => /^PATCH_/.test(c)).sort().join('+'));

// second edit on already-overridden file: no copy notice; entity lookup; multi-token via #
r = run('--entity', 'k98', '--set', 'actor/Extension="k98b.mdl"');
console.log('second ' + codes(r.out).filter(c => /^PATCH_/.test(c)).sort().join('+'));   // entity def is a different file: copy of def
r = run('--file', K, '--set', 'rifle/damage#2=20', '--del', 'rifle/nosuchkey');
assert(/\{damage blastwave 20\}/.test(rd()) && !/nosuchkey/.test(rd()), 'second edit ' + r.out + rd());
console.log('second2 ' + codes(r.out).filter(c => /^PATCH_/.test(c)).sort().join('+'));

// breaking edit refused, file unchanged
const before = rd();
r = run('--file', K, '--set', 'rifle/healthDamage=5}}');
assert(r.st === 1 && rd() === before, 'refused wrote ' + r.out);
console.log('breaks ' + codes(r.out).filter(c => /^PATCH_/.test(c)).sort().join('+'));

// --add-file: value with a leading "/" read from a file (Git Bash would turn k=/x into a Windows path); trailing newline dropped
const vf = path.join(fx, 'value.txt');
fs.writeFileSync(vf, '"/entity/x/y.mdl"\r\n');
r = run('--file', K, '--add-file', 'rifle/note=' + vf);
assert(r.st === 0 && /\{note "\/entity\/x\/y\.mdl"\}\r\n/.test(rd()), 'add-file ' + r.out + rd());
console.log('addfile ' + codes(r.out).filter(c => /^PATCH_/.test(c)).sort().join('+'));
r = run('--file', K, '--set-file', 'rifle/note=' + path.join(fx, 'nofile.txt'));
assert(r.st === 2, 'set-file unreadable ' + r.out);
console.log('setfile_bad -');

r = run('--file', 'resource/set/stuff/none', '--set', 'a=1');
console.log('nofile ' + codes(r.out).join('+'));
