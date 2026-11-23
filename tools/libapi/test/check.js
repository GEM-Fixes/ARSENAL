// libapi check: every export of every lib module has a sig line; no paren-truncated sigs; digest <= 14500 bytes (~3.3k tok; grows w/ lib readers; +gamedir +registry; +gamedir require/missing DOOR-A; +help 12647; +credit +creditgate 13939; 2h batch lib readers 16954, cap 17500; +winreg +cachewrite +platform +cipath 20087, cap 21000); +avi +bmfont +dxbc +mapnet +wav +picture readers (2026-11-12 commit) 24696, cap 25500 (2026-11-13)
// Author: Imperator_Aug (ARSENAL, ia-32ef6c4c)
const fs = require('fs'), path = require('path'), { api, exportNames } = require('../libapi.js');
const lib = path.join(__dirname, '..', '..', 'lib'), md = api(lib), bad = [];
const sigs = new Set(md.split('\n').filter(l => l.startsWith('- ')).map(l => /^- (?:class )?([\w$]+)/.exec(l)[1]));
for (const f of fs.readdirSync(lib).filter(f => f.endsWith('.js'))) {
  const mod = f.slice(0, -3);
  if (!md.includes(`## ${mod}:`)) bad.push(`no module ${mod}`);
  for (const n of exportNames(fs.readFileSync(path.join(lib, f), 'utf8'))) if (!sigs.has(n)) bad.push(`no export ${mod}.${n}`);
}
for (const l of md.split('\n')) if (/^- [\w$]+\(/.test(l) && (s => s.split('(').length !== s.split(')').length)(l.split(' — ')[0])) bad.push(`unbalanced: ${l}`);
if (md.length > 28000 /* 25500 until 2026-11-19: lib/lnginc added (25976); 26500 until 2026-11-21: lib/cachestore, modtree, gameview added (27488) */) bad.push(`size ${md.length}`);
console.log(bad.length ? bad.join('\n') + '\nFAIL' : 'PASS');
