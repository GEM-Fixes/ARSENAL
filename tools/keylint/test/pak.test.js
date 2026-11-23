// seeded GoH case (GOHMOD-3): a Workshop-style GoH mod outside <game>/mods, all paks under resource/, is read through its paks;
// the same folder against an AS2 game dir is not (as64 behaviour unchanged). prints PAK-OK or the failures
// Author: Imperator_Aug (ARSENAL, ia-0b147b51)
const fs = require('fs'), path = require('path'), os = require('os'), keylint = require('../keylint'), { zip } = require('../../lib/zipwrite');
let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const w = fs.mkdtempSync(path.join(os.tmpdir(), 'keylint-pak-'));
try {
  const put = (f, s) => { fs.mkdirSync(path.dirname(path.join(w, f)), { recursive: true }); fs.writeFileSync(path.join(w, f), s); };
  put('goh/binaries/x64/call_to_arms.exe', 'not a pe'); put('goh/resource/x.def', '{game_entity}\r\n');
  put('as2/resource/x.def', '{game_entity}\r\n');
  put('mod/mod.info', '{mod {name "m"}}\r\n');
  fs.mkdirSync(path.join(w, 'mod/resource'), { recursive: true });
  fs.writeFileSync(path.join(w, 'mod/resource/a.pak'), zip([['entity/p/p.def', Buffer.from('{game_entity\r\n\t{bounding_box_x 1 2 3}\r\n\t{bounding_box_x 1 2 3}\r\n}\r\n')], ['entity/p/l', Buffer.from('a.b c\r\n')]]));
  const list = r => { const j = r.toJSON({ tool: 'keylint' }); return [...j.findings, ...j.info].map(f => ({ ...f, file: String(f.file || '').replace(/\\/g, '/') })); };
  let l = list(keylint.run({ folder: path.join(w, 'mod'), gameDir: path.join(w, 'goh') }));
  ok(l.filter(f => f.code === 'KEYLINT_PAKS_READ' && /: 1 SDL entries/.test(f.msg)).length === 1, 'GoH: 1 pak SDL entry read: ' + JSON.stringify(l));
  ok(l.some(f => f.file.startsWith('resource/a.pak!entity/p/p.def')), 'GoH: a finding names the pak entry: ' + JSON.stringify(l));
  l = list(keylint.run({ folder: path.join(w, 'mod'), gameDir: path.join(w, 'as2') }));
  ok(!l.some(f => f.code === 'KEYLINT_PAKS_READ' || f.file.includes('.pak!')), 'AS2 dir: paks not read: ' + JSON.stringify(l));
} finally { fs.rmSync(w, { recursive: true, force: true }); }
console.log(bad ? 'PAK-BAD' : 'PAK-OK');
process.exit(0);
