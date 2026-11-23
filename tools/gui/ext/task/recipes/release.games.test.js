// recipe "release" games test: node release.games.test.js <scratch>. A made-up GoH install (call_to_arms.exe) and a GoH mod (mod.info
// with lower case keys and Tags): goh is in games with no na; the range is asked as range_goh on GoH and as range on the AS2 games;
// inputs and fieldsOf map keep, goh (the install's version as Min, open Max) and none; the release check runs the Share routes as
// goh and stages a mod.info in the GoH spelling with Tags kept; the write puts it into the mod with a restore point.
// Author: Imperator_Aug (ARSENAL, ia-goh-release)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-release-games-')));
fs.mkdirSync(scratch, { recursive: true });
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const R = require('./release.recipe'), L = require('./release.lang'), CL = require('./release.client');
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok ' + name); };

const gh = fs.mkdtempSync(path.join(scratch, 'goh-')), mod = path.join(scratch, 'mods', 'goh_rel');
fs.rmSync(mod, { recursive: true, force: true }); fs.rmSync(mod + '.arsenal-undo', { recursive: true, force: true });
w(path.join(gh, 'binaries', 'x64', 'call_to_arms.exe'), 'x');
w(path.join(mod, 'mod.info'), '{mod\r\n\t{name "Goh Rel"}\r\n\t{desc "old text"}\r\n\t{Version "1.2"}\r\n\t{minGameVersion "1.050"}\r\n\t{maxGameVersion "1.060"}\r\n\t{tags "units"}\r\n}\r\n');
w(path.join(mod, 'resource', 'set', 'a.set'), '{a}\r\n');
const ctx = kit.ctxFor(scratch, { game: 'goh', gohDir: gh });
const v = x => ({ src: 'value', value: x });
const mk = extra => {
  const answers = Object.assign({ name: 'Goh Rel', desc: 'A GoH test mod.', range_goh: 'goh', version_kind: 'minor', version_note: '', known_name: '', deep: false, package: false, workshop_copy: false, out: '', card: { mods: ['goh_rel'] }, clash: false, updated: false }, extra || {});
  const d = { id: D.newId('release'), recipe: 'release', verb: 'make', game: 'goh', mod, base: null, answers: {}, kept: [], state: 'open' };
  for (const [k, x] of Object.entries(answers)) d.answers[k] = v(x);
  return D.save(ctx, d);
};
const check = R.routes['POST /api/x/task/r/release/check'];

(async () => {
await t('GoH: in games, no na; range on the AS2 games, range_goh on GoH; the new rows in four languages; the client goes to range_goh', () => {
  assert.deepEqual(R.games, ['as64', 'mowas2', 'goh']); assert.ok(!R.na || !R.na.goh);
  const Q = {}; for (const gr of R.groups) for (const q of gr.q) Q[q.id] = q;
  assert.deepEqual(Q.range.when.$game, ['as64', 'mowas2']); assert.deepEqual(Q.range_goh.when.$game, ['goh']);
  assert.deepEqual(Q.range_goh.limits.values, ['keep', 'goh', 'none']);
  assert.ok(!L.some(r => r[0] === 'task.release.na.goh'));
  for (const k of ['task.release.q.range_goh', 'task.release.h.range_goh', 'task.release.v.range_goh.keep', 'task.release.v.range_goh.goh', 'task.release.v.range_goh.none']) {
    const row = L.find(r => r[0] === k); assert.ok(row && row.length === 5 && row.slice(1).every(s => s && !/[‐-―]/.test(s)), k);
  }
  assert.ok(/qid \+ '_goh'/.test(CL.script));
});
await t('inputs and fieldsOf: GoH reads range_goh; the AS2 games read range as before', () => {
  const g = (a, gid) => R.inputs(k => a[k], { mod }, gid);
  assert.equal(g({ name: 'x', range_goh: 'goh', range: 'enhanced' }, 'goh').range, 'goh');
  assert.equal(g({ name: 'x', range_goh: 'zz' }, 'goh').range, 'keep');
  assert.equal(g({ name: 'x', range_goh: 'goh', range: 'enhanced' }, 'as64').range, 'enhanced');
  assert.equal(g({ name: 'x', range_goh: 'none', range: 'zz' }, 'mowas2').range, 'keep');
  assert.deepEqual(R.fieldsOf({ name: 'n', desc: 'd', range: 'goh' }, '1.067'), { Name: 'n', Desc: 'd', MinGameVersion: '1.067', MaxGameVersion: '' });
  assert.deepEqual(R.fieldsOf({ name: 'n', desc: 'd', range: 'none' }, '1.067'), { Name: 'n', Desc: 'd', MinGameVersion: '', MaxGameVersion: '' });
  assert.deepEqual(R.fieldsOf({ name: 'n', desc: 'd', range: 'enhanced' }), { Name: 'n', Desc: 'd', MinGameVersion: '3.301', MaxGameVersion: '' });
});
await t('GoH: values read the GoH mod.info', async () => {
  const vs = await R.values(Object.assign({}, ctx, { mod }), null, { game: 'goh' });
  assert.equal(vs.name, 'Goh Rel'); assert.equal(vs.version, '1.2'); assert.equal(vs.range_goh, 'keep'); assert.equal(vs.range, 'keep');
});
await t('GoH: the release check runs the Share routes as goh and stages a GoH mod.info; the write puts it into the mod', async () => {
  const SR = require('../../share/routes').routes, seen = [], orig = {};
  for (const k of ['POST /api/x/share/info', 'POST /api/x/share/gate']) { orig[k] = SR[k]; SR[k] = (u, b, c) => { seen.push(c && typeof c.gameId === 'function' ? c.gameId() : '?'); return orig[k](u, b, c); }; }
  let r; const d = mk();
  try { r = await check(null, { draft: d }, ctx); } finally { Object.assign(SR, orig); }
  assert.ok(r && r.ok, JSON.stringify(r));
  assert.ok(seen.length >= 3 && seen.every(s => s === 'goh'), seen.join());
  assert.ok(r.ready, JSON.stringify(r.items.filter(x => x.status === 'fail')));
  assert.equal(r.next, '1.3');
  d.answers.gate = v({ sig: r.sig, ready: r.ready, fails: r.fails || 0, warns: r.warns, next: r.next }); D.save(ctx, d);
  const c = await CP.compile(ctx, D.load(ctx, d.id), { release: R });
  assert.deepEqual(c.calls, []); assert.ok(c.copies.some(x => x.to === 'mod.info'), JSON.stringify(c.copies));
  const wr = await CP.write(ctx, D.load(ctx, d.id), { release: R });
  assert.ok(wr.written, JSON.stringify(wr.errors));
  const mi = fs.readFileSync(path.join(mod, 'mod.info'), 'latin1');
  assert.ok(/\{name "Goh Rel"\}/.test(mi) && /\{desc "A GoH test mod\."\}/.test(mi) && /\{minGameVersion "1\.067"\}/.test(mi), mi);
  assert.ok(!/maxGameVersion/i.test(mi) && /\{tags "units"\}/.test(mi) && /\{Version "1\.3"\}/.test(mi) && !/(^|[^\r])\n/.test(mi), mi);
  assert.ok(wr.restore.length >= 1, JSON.stringify(wr.restore));
});
await t('GoH: none removes both range lines', async () => {
  const d = mk({ range_goh: 'none' });
  const r = await check(null, { draft: d }, ctx); assert.ok(r.ok && r.ready, JSON.stringify(r));
  d.answers.gate = v({ sig: r.sig, ready: r.ready, fails: r.fails || 0, warns: r.warns, next: r.next }); D.save(ctx, d);
  const wr = await CP.write(ctx, D.load(ctx, d.id), { release: R }); assert.ok(wr.written, JSON.stringify(wr.errors));
  const mi = fs.readFileSync(path.join(mod, 'mod.info'), 'latin1');
  assert.ok(!/GameVersion/i.test(mi) && /\{tags "units"\}/.test(mi), mi);
});
fs.rmSync(gh, { recursive: true, force: true });
console.log(n + ' passed, 0 failed');
console.log('PASS');
})().catch(e => { console.error(e); console.log('FAIL'); process.exit(1); });
