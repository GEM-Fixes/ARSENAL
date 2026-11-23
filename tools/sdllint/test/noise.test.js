// fragment macros are info, a real file's are errors, version control litter is not read
// Author: Imperator_Aug (ARSENAL, ia-9360dd8d)
const fs = require('fs'), path = require('path'), os = require('os'), sdllint = require('../sdllint');
let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const w = fs.mkdtempSync(path.join(os.tmpdir(), 'sdllint-noise-'));
try {
  const put = (f, s) => { fs.mkdirSync(path.dirname(path.join(w, f)), { recursive: true }); fs.writeFileSync(path.join(w, f), s); };
  put('resource/set/a.inc', '("nope")\r\n');
  put('resource/set/multiplayer/units/ger.set', '("nope")\r\n');
  put('resource/entity/x/x.def', '("nope")\r\n');
  const j = sdllint.run({ folder: w }).toJSON({ tool: 'sdllint' });
  const list = [...j.findings, ...j.info];
  const at = (s, code) => list.filter(f => (f.file || '').replace(/\\/g, '/').includes(s) && f.code === code).length;
  ok(at('x/x.def', 'MACRO_UNDEFINED') === 1, 'real file keeps the error: ' + JSON.stringify(list));
  ok(at('a.inc', 'MACRO_UNDEFINED') === 0 && at('a.inc', 'SDL_FRAGMENT_MACRO') === 1, '.inc is info');
  ok(at('units/ger.set', 'MACRO_UNDEFINED') === 0 && at('units/ger.set', 'SDL_FRAGMENT_MACRO') === 1, 'roster is info');
  const { isSdl } = require('../../lib/sdlset');
  ok(!isSdl('resource/sound/x/.svn/entries'), 'svn litter read');
  ok(isSdl('resource/set/stuff/a.def'), 'plain file still read');
} finally { fs.rmSync(w, { recursive: true, force: true }); }
if (!bad) console.log('noise ok');
process.exit(bad ? 1 : 0);
