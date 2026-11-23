// made-up game folders: --exe carries the game into the vfs (mowas_2 on the shared install: no as64/core), the vocab pick
// (vocab.mowas2.json, vocab.goh.json) and the engine field table (fieldtypes/fields.goh.json on GoH); no --exe = as before.
// prints EXE-OK or the failures
// Author: Imperator_Aug (ARSENAL, ia-c1a7e2b4)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const keylint = require('../keylint');
let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const w = fs.mkdtempSync(path.join(os.tmpdir(), 'keylint-exe-'));
try {
  const put = (f, s) => { fs.mkdirSync(path.dirname(path.join(w, f)), { recursive: true }); fs.writeFileSync(path.join(w, f), s); };
  // shared AS2 install: as64.exe and mowas_2.exe, one base file and one as64/core file
  put('as2/as64.exe', ''); put('as2/mowas_2.exe', '');
  put('as2/resource/set/base.set', '{a 1}\r\n'); put('as2/as64/core/resource/set/core.set', '{b 2}\r\n');
  put('goh/binaries/x64/call_to_arms.exe', 'not a pe'); put('goh/resource/set/g.set', '{c 3}\r\n');
  const vocab = path.join(__dirname, 'vocab-mini.json'), as2 = path.join(w, 'as2'), goh = path.join(w, 'goh');
  const r0 = keylint.check({ vfs: true, gameDir: as2, vocab });
  const r1 = keylint.check({ vfs: true, gameDir: as2, vocab, exe: 'as64' });
  const r2 = keylint.check({ vfs: true, gameDir: as2, vocab, exe: 'mowas_2' });
  const r3 = keylint.check({ vfs: true, gameDir: as2, vocab, exe: 'mowas2' });
  ok(r0.exe === 'as64' && r0.files === 2, 'no --exe: as64 mount with as64/core (2 files): ' + r0.exe + ' ' + r0.files);
  ok(r1.exe === 'as64' && r1.files === 2, '--exe as64: 2 files: ' + r1.files);
  ok(r2.exe === 'mowas_2' && r2.files === 1, '--exe mowas_2: no as64/core (1 file): ' + r2.exe + ' ' + r2.files);
  ok(r3.exe === 'mowas_2' && r3.files === 1, '--exe mowas2 alias: ' + r3.exe + ' ' + r3.files);
  // vocab pick
  const b = o => path.basename(keylint.vocabPath(o));
  const hasM = fs.existsSync(path.join(__dirname, '..', 'vocab.mowas2.json'));
  ok(hasM, 'tools/keylint/vocab.mowas2.json is there');
  const got = [b({ gameDir: as2, exe: 'mowas_2' }), b({ gameDir: as2, exe: 'mowas2' }), b({ gameDir: as2, exe: 'as64' }), b({ gameDir: as2 }), b({ gameDir: goh, exe: 'goh' }), b({ exe: 'goh' }), b({ gameDir: goh }), b({ gameDir: as2, exe: 'mowas_2', vocab: 'x/my.json' })];
  ok(got.join(',') === 'vocab.mowas2.json,vocab.mowas2.json,vocab.json,vocab.json,vocab.goh.json,vocab.goh.json,vocab.goh.json,my.json', 'vocab pick: ' + got.join(','));
  // engine field table: GoH (by --exe or by the exe in the game dir) -> fields.goh.json when present; AS2 -> fields.json
  const hasG = fs.existsSync(path.join(__dirname, '..', '..', 'fieldtypes', 'fields.goh.json'));
  ok(hasG, 'tools/fieldtypes/fields.goh.json is there');
  const fg = keylint.check({ vfs: true, gameDir: goh, vocab }).fields, fe = keylint.check({ vfs: true, gameDir: goh, vocab, exe: 'goh' }).fields;
  ok(fg === 'goh' && fe === 'goh' && r2.fields === 'as2' && r0.fields === 'as2', 'field table: goh ' + fg + '/' + fe + ' as2 ' + r0.fields + '/' + r2.fields);
  // lintBuffer takes exe (one cached context per game) and runs
  const lb = keylint.lintBuffer({ key: 'resource/set/x.set', text: '{a 1}\r\n', gameDir: as2, vocab, exe: 'mowas_2' });
  ok(Array.isArray(lb), 'lintBuffer with exe: ' + JSON.stringify(lb));
  // CLI: --exe taken, bad value exit 2
  const cli = a => cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'keylint.js'), ...a, '--no-rc'], { encoding: 'utf8' });
  const c1 = cli(['--vfs', '--game', as2, '--vocab', vocab, '--exe', 'mowas_2', '-q']);
  ok(/^1 files /m.test(c1.stdout), 'cli --exe mowas_2: 1 file: ' + c1.stdout + c1.stderr);
  const c2 = cli(['--vfs', '--game', as2, '--vocab', vocab, '-q']);
  ok(/^2 files /m.test(c2.stdout), 'cli no --exe: 2 files: ' + c2.stdout + c2.stderr);
  const c3 = cli(['--vfs', '--game', as2, '--exe', 'gog']);
  ok(c3.status === 2, 'cli bad --exe: exit 2, got ' + c3.status);
} finally { fs.rmSync(w, { recursive: true, force: true }); }
console.log(bad ? 'EXE-BAD' : 'EXE-OK');
process.exit(0);
