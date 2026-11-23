// recipe "text" games test: node text.games.test.js <scratch>. A made-up GoH install (call_to_arms.exe, two .pot files with a key
// each): goh is in games with no na; the AS2 only questions (file, force, replace) are asked on the AS2 games, file_goh on GoH;
// values and the finder read the .pot texts; lines compile to one call of the text route (lng-add --exe goh); missing lines,
// translate and no GoH folder refuse with their keys; the write lands as .pot entries in the mod, the game file stays.
// Author: Imperator_Aug (ARSENAL, ia-goh-text)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-text-games-')));
fs.mkdirSync(scratch, { recursive: true });
const R = require('./text.recipe'), L = require('./text.lang'), GH = require('./text.goh');
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok ' + name); };

const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const gh = fs.mkdtempSync(path.join(scratch, 'goh-')), gmod = path.join(scratch, 'mods', 'text_goh');
const G = (k, b) => w(path.join(gh, ...k.split('/')), b), TX = 'resource/interface/text/';
G('binaries/x64/call_to_arms.exe', 'x');
G(TX + 'dlg_mp.pot', 'msgctxt "mp/army/ger"\r\nmsgid "Germany"\r\nmsgstr ""\r\n\r\nmsgctxt "desc/entity/pz4h"\r\nmsgid "Pz.IV H"\r\nmsgstr ""\r\n');
G(TX + 'units.pot', 'msgctxt "desc/entity/t34"\r\nmsgid "T-34 %d"\r\nmsgstr ""\r\n');
w(path.join(gmod, 'mod.info'), '{Mod {Name "m"}}\r\n');
const ctx = kit.ctxFor(scratch, { game: 'goh', gohDir: gh });
const v = x => ({ src: 'value', value: x });
const mk = answers => D.save(ctx, { id: D.newId('text'), recipe: 'text', verb: 'change', game: 'goh', mod: gmod, base: null, answers, kept: [], state: 'open' });
const run = d => CP.compile(ctx, d, { text: R });
const refusedK = async (d, key) => { let e = null; try { await run(d); } catch (x) { e = x; } assert.equal(e && e.key, key, e && e.message); };

(async () => {
await t('GoH: in games, no na; AS2 only questions on the AS2 games, file_goh on GoH; the route; the new rows in four languages', () => {
  assert.deepEqual(R.games, ['as64', 'mowas2', 'goh']); assert.ok(!R.na || !R.na.goh);
  const Q = {}; for (const gr of R.groups) for (const q of gr.q) Q[q.id] = q;
  for (const id of ['file', 'force', 'replace']) assert.deepEqual(Q[id].when.$game, ['as64', 'mowas2'], id);
  assert.deepEqual(Q.file_goh.when.$game, ['goh']); assert.deepEqual(Q.file_goh.covers, ['goh.pot']);
  for (const id of ['what', 'family', 'lines']) assert.ok(!Q[id].when || !Q[id].when.$game, id);
  assert.ok(!R.kept.some(k => k[0] === 'goh.pot'));
  assert.ok(R.routes['POST /api/x/task/r/text/goh']);
  assert.ok(!L.some(r => r[0] === 'task.text.na.goh'));
  for (const k of ['task.text.q.file_goh', 'task.text.h.file_goh', 'task.text.e.nogoh', 'task.text.na.gohwhat']) {
    const row = L.find(r => r[0] === k); assert.ok(row && row.length === 5 && row.slice(1).every(s => s && !/[‐-―]/.test(s)), k);
  }
});
await t('GoH: values read the .pot texts for passed keys; the finder finds by key, text or file', async () => {
  const vs = await R.values(Object.assign({}, ctx, { mod: gmod }), null, { game: 'goh', pass: { keys: ['mp/army/ger', { key: 'desc/entity/new', text: 'New' }] } });
  assert.equal(vs.what, 'lines'); assert.equal(vs.file_goh, 'zz_arsenal_text.pot');
  assert.deepEqual(vs.lines, ['mp/army/ger = Germany', 'desc/entity/new = New']);
  const f = GH.find(gh, gmod, ['t-34']);
  assert.deepEqual(f.rows.map(r => r.key + '@' + r.file), ['desc/entity/t34@units.pot']);
  assert.equal(GH.find(gh, gmod, ['dlg_mp']).total, 2);
});
await t('GoH: lines compile to one text route call; same text skipped; % numbers and sort notes', async () => {
  const r = await run(mk({ what: v('lines'), family: v('other'), lines: v(['mp/army/ger = Reich', 'desc/entity/pz4h = Pz.IV H', 'desc/entity/t34 = T-34']), file_goh: v('aa.pot') }));
  assert.deepEqual(r.calls.map(c => [c.route, c.dryFlag, c.body.file, c.body.lines.map(l => l.key + '=' + l.text).join('|')]),
    [['POST /api/x/task/r/text/goh', 'write', 'aa.pot', 'mp/army/ger=Reich|desc/entity/t34=T-34']]);
  assert.ok(r.notes.some(x => /% numbers differ/.test(x)), JSON.stringify(r.notes));
  assert.ok(r.notes.some(x => /sorts after aa\.pot/.test(x)), JSON.stringify(r.notes));
  assert.ok(!r.gen || !(r.gen.ops || []).length);
});
await t('GoH: refusals: missing lines, translate, a bad file name, no GoH folder', async () => {
  await refusedK(mk({ what: v('missing') }), 'task.text.na.gohwhat');
  await refusedK(mk({ what: v('translate') }), 'task.text.na.gohwhat');
  let e = null; try { await run(mk({ what: v('lines'), lines: v(['a = b']), file_goh: v('x.lng') })); } catch (x) { e = x; } assert.ok(e && /ends in \.pot/.test(e.message), e && e.message);
  e = null; try { await R.compile({ game: 'goh' }, { game: 'goh', verb: 'change', gameDir: null, mod: gmod, value: () => undefined, answer: () => undefined, values: {} }); } catch (x) { e = x; }
  assert.equal(e && e.key, 'task.text.e.nogoh');
});
await t('GoH: the route refuses a bad key or a raw new line', async () => {
  for (const [b, re] of [[{ mod: gmod, lines: [{ key: 'a"b', text: 'x' }] }, /Not a text key/], [{ mod: gmod, lines: [{ key: 'k', text: 'a\nb' }] }, /one line/], [{ mod: gmod, file: 'x.txt', lines: [{ key: 'k', text: 'x' }] }, /ends in \.pot/], [{ mod: gmod, lines: [] }, /No line/]]) {
    let e = null; try { await GH.gohRoute('', b, ctx); } catch (x) { e = x; } assert.ok(e && re.test(e.message), e && e.message);
  }
});
await t('GoH: the write puts the lines into the mod .pot with a restore point; the game file stays', async () => {
  const d = mk({ what: v('lines'), family: v('other'), lines: v(['mp/army/ger = Reich', 'desc/entity/new = A \\"new\\" tank']) });
  const r = await CP.write(ctx, d, { text: R });
  assert.ok(r.written, JSON.stringify(r.errors));
  const pot = fs.readFileSync(path.join(gmod, 'localizations', 'default', 'interface', 'text', 'zz_arsenal_text.pot'), 'utf8');
  assert.ok(/msgctxt "mp\/army\/ger"\r\nmsgid "Reich"\r\nmsgstr ""/.test(pot), pot);
  assert.ok(/msgctxt "desc\/entity\/new"\r\nmsgid "A \\"new\\" tank"\r\nmsgstr ""/.test(pot), pot);
  assert.ok(!/(^|[^\r])\n/.test(pot), 'CRLF');
  assert.ok(r.restore.length >= 1, JSON.stringify(r.restore));
  assert.ok(/msgid "Germany"/.test(fs.readFileSync(path.join(gh, ...(TX + 'dlg_mp.pot').split('/')), 'utf8')));
  const chk = await R.check({ game: 'goh', mod: gmod }, ctx);
  assert.equal(chk[0].level, 'ok'); assert.ok(chk[0].lines[0].endsWith('zz_arsenal_text.pot'));
});
fs.rmSync(gh, { recursive: true, force: true });
console.log(n + ' passed, 0 failed');
console.log('PASS');
})().catch(e => { console.error(e); console.log('FAIL'); process.exit(1); });
