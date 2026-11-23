// seeded: which vocab keylint picks. fake game dirs made in a temp folder (empty exe files); prints PICK-OK or the mismatch
// Author: Imperator_Aug (ARSENAL, ia-edb08d8c)
const fs = require('fs'), path = require('path'), os = require('os');
const { vocabPath } = require('../keylint');
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kl-pick-'));
const mk = (n, exe) => { const g = path.join(d, n); fs.mkdirSync(path.join(g, path.dirname(exe)), { recursive: true }); fs.writeFileSync(path.join(g, exe), ''); return g; };
const goh = mk('goh', 'binaries/x64/call_to_arms.exe'), as = mk('as', 'binaries/x64/as64.exe'), none = path.join(d, 'none');
const b = o => path.basename(vocabPath(o));
const got = [b({ gameDir: goh }), b({ gameDir: as }), b({ gameDir: none }), b({}), b({ gameDir: goh, vocab: 'x/my.json' })];
fs.rmSync(d, { recursive: true, force: true });
const want = ['vocab.goh.json', 'vocab.json', 'vocab.json', 'vocab.json', 'my.json'];
console.log(JSON.stringify(got) === JSON.stringify(want) ? 'PICK-OK' : 'PICK-BAD ' + got.join(','));
