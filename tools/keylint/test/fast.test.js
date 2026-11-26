// speed-ups (X6,: KEYLINT_FAST (model.memo) on and off give the same report on test/bad, bad2, ok
// lintBuffer; a walk that throws with them on is walked again the old way (same report, no CRASH); the incremental line numbers
// of the armor and bot Lua passes equal the old slice+split count. prints FAST-OK or the failures
// Author: Imperator_Aug (ARSENAL, ia-951226ab)
const path = require('path'), keylint = require('../keylint'), M = require('../model'), CK = require('../chkkey');
let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const js = r => JSON.stringify(r.rep.toJSON({ tool: 'keylint' })) + '|' + r.files + '|' + r.skipped;
const both = fn => { const was = M.memo(true); const a = fn(); M.memo(false); const b = fn(); M.memo(was); return [a, b]; };
try {
  const d = __dirname, runs = [{ folder: path.join(d, 'bad') }, { folder: path.join(d, 'bad2'), vocab: path.join(d, 'vocab-mini.json') }, { folder: path.join(d, 'ok') }];
  for (const o of runs) { const [a, b] = both(() => js(keylint.check(o))); ok(a === b, 'on/off differ: ' + o.folder); }
  // lintBuffer (cached context, both modes on one context)
  const fs = require('fs'), buf = fs.readFileSync(path.join(d, 'bad', 'resource', 'entity', 'a.def'));
  const [la, lb] = both(() => JSON.stringify(keylint.lintBuffer({ key: 'resource/entity/a.def', buf, folder: path.join(d, 'bad'), info: true })));
  ok(la === lb && la !== '[]', 'lintBuffer on/off differ or empty: ' + la);
  // the same context again with the buffer edited (kept lookups are per vocab / path, never per file text): new answer, = old way
  const buf2 = Buffer.from(buf.toString('latin1').replace(/\{/, '{bogusKeyX 1}\r\n{'), 'latin1');
  const [ea, eb] = both(() => JSON.stringify(keylint.lintBuffer({ key: 'resource/entity/a.def', buf: buf2, folder: path.join(d, 'bad'), info: true })));
  ok(ea === eb && ea !== la, 'lintBuffer after an edit: on/off differ or unchanged');
  // fallback: partsM throws in fast mode on the first few calls -> those files are walked again the old way
  const off = (M.memo(false), js(keylint.check(runs[0]))); M.memo(true);
  const pm = M.partsM; let n = 0;
  M.partsM = b => { if (M.fast() && n++ % 50 === 0) throw new Error('fault'); return pm(b); };
  let fb; try { fb = js(keylint.check(runs[0])); } finally { M.partsM = pm; }
  ok(n > 0 && fb === off, 'fallback report differs from the old way (faults ' + n + ')');
  ok(!/CRASH/.test(fb), 'fallback left a CRASH');
  // line numbers: armor text, bot Lua
  const txt = ['; c', '{("armor_a" turret(1 2 3) body(1))', '', '(  "armor_b" x(1 2 3))\r', 'q', '("armor_c" args 1 2 3)'].join('\n');
  const lua = 'x = 1\n-- c\nperiod = 2\nBotApi.Commands:Fire()\n\nAttackBaseTime = 3\nBotApi.Commands:Spawn()\nBotApi.Commands:Board()';
  const [aa, ab] = both(() => JSON.stringify(CK.armorText(txt)));
  ok(aa === ab && JSON.parse(aa).map(f => f.line).join() === '2,4,6', 'armorText lines: ' + aa + ' / ' + ab);
  const [ua, ub] = both(() => JSON.stringify(CK.luaPass('resource/script/multiplayer/bot.data.lua', lua)));
  ok(ua === ub && JSON.parse(ua).map(f => f.line).join() === '3,6,4,8', 'luaPass lines: ' + ua + ' / ' + ub);
} catch (e) { console.log('FAIL: ' + e.stack); bad++; }
console.log(bad ? 'FAST-BAD' : 'FAST-OK');
