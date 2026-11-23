// recipe "what is possible" test: node x-limits.test.js <scratch>. Own route first (ranked limits rows and guide sections from the
// repo's limits/ and guide/, an ID asked directly, an empty question, a missing notes folder), then the test kit (validation, census
// coverage with its seeded defect, 4 languages, explore steps). PASS is the last line.
// Author: Imperator_Aug (ARSENAL, ia-ab18c5cc)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const kit = require('../lib/testkit');
const R = require('./x-limits.recipe'), C = require('./x-limits.client');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-x-limits-')));
fs.mkdirSync(scratch, { recursive: true });
let p = 0, f = 0;
const ok = (c, m, x) => { if (c) p++; else { f++; console.log('FAIL ' + m + (x !== undefined ? '\n  ' + String(x).slice(0, 800) : '')); } };
const get = (q, what) => R.routes['GET /api/x/task/r/x-limits/find'](new URL('http://127.0.0.1/api/x/task/r/x-limits/find?' + new URLSearchParams({ q, what: what || '' })), null, kit.ctxFor(scratch));
const getG = (q, game) => R.routes['GET /api/x/task/r/x-limits/find'](new URL('http://127.0.0.1/api/x/task/r/x-limits/find?' + new URLSearchParams({ q, game })), null, kit.ctxFor(scratch));
(async () => {
  const a = await get('can a tank have two guns');
  ok(a.what === 'limits' && a.total > 0 && a.results.length <= 20, 'a question in words finds limits rows', JSON.stringify(a).slice(0, 300));
  ok(a.words.includes('tank') && a.words.includes('guns') && !a.words.includes('can') && !a.words.includes('a'), 'stop words are dropped', a.words.join(','));
  ok(a.results.every(r => /^[A-Z][A-Z0-9]*-\d+[a-z]?$/.test(r.id) && r.subject && r.limit != null && r.effect != null && /^limits\/[A-Z0-9]+\.md$/.test(r.file)), 'each row has its ID, subject, limit, effect and file', JSON.stringify(a.results[0]));
  ok(a.results.every(r => !/`/.test(r.subject + r.limit + r.effect)), 'rows are plain words (no code marks)');
  for (let i = 1; i < a.results.length; i++) if (a.results[i].score > a.results[i - 1].score) { ok(false, 'rows are best first'); break; }
  const id = await get('vfs-1');
  ok(id.results.length === 1 && id.results[0].id === 'VFS-01' && id.results[0].tag === 'checked', 'an ID asked directly finds its row, tagged checked', JSON.stringify(id.results));
  const g = await get('sound silent wav', 'guide');
  ok(g.what === 'guide' && g.total > 0 && g.results.every(x => /^guide\/(\d\d|p\d\d|r\d\d)-[a-z0-9-]+\.md$/.test(x.p) && x.line > 0 && x.title), 'guide sections match, each with a page and line', JSON.stringify(g.results.slice(0, 2)));
  ok(g.results.every(x => fs.existsSync(path.join(__dirname, '..', '..', '..', '..', '..', x.p))), 'guide pages named exist');
  // a question in Russian, Ukrainian or Chinese: its words are looked up in English too (the glossary's terms, everyday words)
  for (const [q, en] of [['почему мой звук не слышен', 'sound'], ['чому мій звук не чути', 'sound'], ['坦克的装甲', 'armor'], ['рассинхрон в сетевой игре', 'desync']]) {
    const r = await get(q);
    ok(r.words.includes(en) && r.total > 0, 'a question in its own language finds rows through English words: ' + q, r.words.join(',') + ' ' + r.total);
  }
  const plain = R._t.english(['sound', 'silent']);
  ok(plain.join() === 'sound,silent', 'English words are left as they are', plain.join());
  const e = await get('   ');
  ok(e.total === 0 && e.results.length === 0, 'an empty question finds nothing');
  const empty = path.join(scratch, 'nohelp'); fs.mkdirSync(empty, { recursive: true });
  const keep = process.env.AS2_HELP_ROOT; process.env.AS2_HELP_ROOT = empty;
  try { const n = await get('tank'); ok(n.nofiles === true && n.total === 0, 'no limits folder says nofiles'); } finally { if (keep === undefined) delete process.env.AS2_HELP_ROOT; else process.env.AS2_HELP_ROOT = keep; }
  // Gates of Hell: the GoH rows are searched too, only for game goh; a GoH row wins a tie; an edition without gohweb
  // says goh false and still finds the shared rows. Made-up notes folder first, then the repo's own gohweb
  const fx = path.join(scratch, 'gohhelp');
  fs.mkdirSync(path.join(fx, 'limits'), { recursive: true }); fs.mkdirSync(path.join(fx, 'gohweb', 'limits'), { recursive: true });
  fs.writeFileSync(path.join(fx, 'limits', 'ZZT.md'), '# ZZT\r\nid | subject | limit | effect | tag\r\nZZT-01 | `zebra` tank | zebra stripes cap | none | [V]\r\n');
  fs.writeFileSync(path.join(fx, 'gohweb', 'limits', 'GHZZT.md'), '# GHZZT\r\nid | subject | limit | effect | tag\r\nGHZZT-01 | `zebra` tank | changed: zebra stripes | carry it · base: as64 ZZT-01 | [V] note:x\r\n');
  const keep2 = process.env.AS2_HELP_ROOT; process.env.AS2_HELP_ROOT = fx;
  try {
    const ga = await getG('zebra tank', 'goh'), aa = await getG('zebra tank', 'as64'), na = await getG('zebra tank', '');
    ok(ga.game === 'goh' && ga.goh === true && ga.total === 2 && ga.results[0].id === 'GHZZT-01' && ga.results[0].goh === true && ga.results[0].file === 'gohweb/limits/GHZZT.md' && ga.results[1].id === 'ZZT-01', 'goh: the GoH row and the shared row, GoH first', JSON.stringify(ga.results));
    ok(aa.total === 1 && aa.results[0].id === 'ZZT-01' && aa.goh === undefined && na.total === 1 && na.goh === undefined, 'as64 and no game: limits rows only, no goh field', JSON.stringify([aa, na]).slice(0, 300));
    ok(JSON.stringify(Object.keys(na)) === JSON.stringify(Object.keys(aa)), 'no game and as64 answer the same shape');
    const gi = await getG('ghzzt-1', 'goh');
    ok(gi.results.length === 1 && gi.results[0].id === 'GHZZT-01', 'a GoH ID asked directly finds its row');
    const ctxG = Object.assign({}, kit.ctxFor(scratch), { gameId: () => 'goh' });
    const viaCtx = await R.routes['GET /api/x/task/r/x-limits/find'](new URL('http://127.0.0.1/x?q=zebra'), null, ctxG);
    ok(viaCtx.game === 'goh' && viaCtx.total === 2, 'no ?game: the page game from ctx.gameId() is used', JSON.stringify(viaCtx).slice(0, 200));
    fs.rmSync(path.join(fx, 'gohweb'), { recursive: true, force: true }); R._t.limitRows('gohweb/limits');
    const ng = await getG('zebra tank', 'goh');
    ok(ng.goh === false && ng.total === 1 && ng.results[0].id === 'ZZT-01', 'no gohweb in this edition: goh false, the shared rows still found', JSON.stringify(ng));
  } finally { if (keep2 === undefined) delete process.env.AS2_HELP_ROOT; else process.env.AS2_HELP_ROOT = keep2; }
  const real = await getG('GHAI-01', 'goh'), realA = await getG('GHAI-01', 'as64');
  ok(real.goh === true && real.results.length === 1 && real.results[0].file === 'gohweb/limits/GHAI.md', 'the repo gohweb: GHAI-01 found for goh', JSON.stringify(real.results));
  ok(realA.results.length === 0, 'the repo gohweb: GHAI-01 not offered for as64');
  ok(/k\.goh'/.test(C.script) && /k\.nogoh'/.test(C.script) && /'&game='/.test(C.script), 'the page sends the game and says what was searched for GoH');
  ok(!/=>|`|\$\{|innerHTML/.test(C.script), 'page script is ES5 with no backtick, dollar brace or innerHTML');
  ok(!/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/.test(C.script + C.css), 'page code has no fixed colour');
  const keys = new Set(require('./x-limits.lang').map(r => r[0]));
  const used = [...new Set((C.script.match(/'task\.x-limits\.[a-z0-9.]+'/g) || []).map(s => s.slice(1, -1)))].filter(k => !/\.$/.test(k))
    .concat(['checked', 'worked', 'test'].map(t => 'task.x-limits.k.tag.' + t));
  ok(used.length > 10 && used.every(k => keys.has(k)), 'every string the page uses is in the lang rows', used.filter(k => !keys.has(k)).join(','));
  console.log('own routes: ' + p + ' passed, ' + f + ' failed');
  if (f) process.exitCode = 1;
  await kit.run(R, require('./x-limits.lang'), { validate: { kinds: C.kinds }, verb: 'explore', answers: { question: 'can a tank have two guns' } }, scratch);
  if (f) { console.log('FAIL'); process.exitCode = 1; }
})().catch(e => { console.log('FAIL crash ' + (e.stack || e)); console.log('FAIL'); process.exitCode = 1; });
