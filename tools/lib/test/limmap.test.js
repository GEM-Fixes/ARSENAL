// limmap: code -> rows, row -> class, stats on fixture folders (temp dirs); registry severityFromRows/sevDiff; report --limits; explain limitsFor
// Author: Imperator_Aug (ARSENAL, ia-83180e9c)
const fs = require('fs'), path = require('path'), os = require('os');
module.exports = (t, assert) => {
  const limmap = require('../limmap'), reg = require('../registry'), { createReport } = require('../report');
  const fixture = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'limmap-')), m = path.join(d, 'map'), c = path.join(d, 'class');
    fs.mkdirSync(m); fs.mkdirSync(c);
    const J = (dir, n, o) => fs.writeFileSync(path.join(dir, n), typeof o === 'string' ? o : JSON.stringify(o, null, 1));
    J(m, 'a.json', { form: 'limmap/1', part: 'a', codes: {
      LIMCODE: { tool: 'x', sev: 'review', lim: ['ZZ-10', 'ZZ-2'], at: 'tools/x/x.js:1', class: null, why: 'w' },
      ROWS_ONLY: { tool: 'x', sev: 'crash', lim: ['ZZ-3', 'ZZ-2'], class: null },
      SELF: { tool: 'x', sev: 'review', kind: 'tool', class: 'tool', why: 'flag' },
      NEWROW: { tool: 'x', sev: 'review', new: { area: 'ZZ', row: 'a | b | c | [I] `x`' }, class: 'silent' },
      OPENED: { tool: 'x', sev: 'review', open: 'not found', class: 'review' },
      PENDING: { tool: 'x', sev: 'silent', lim: null },
      DUP: { tool: 'x', sev: 'review', lim: null },
      JUNK: 'not an object',
    } });
    J(m, 'b.json', { form: 'limmap/1', part: 'b', codes: { DUP: { tool: 'y', sev: 'review', lim: 'ZZ-3', class: null } } });
    J(m, 'c.json', '{"form":"limmap/1","codes":{');            // half written
    J(m, 'd.json', { form: 'limclass/1', rows: {} });           // wrong form
    J(c, 'ZZ.json', { form: 'limclass/1', area: 'ZZ', rows: {
      'ZZ-2': { chk: 'built', class: 'cosmetic', why: 'w' }, 'ZZ-3': { chk: 'todo', class: 'hang', tool: 'x', how: 'h' },
      'ZZ-10': { chk: null, class: null }, 'ZZ-11': { chk: 'never', class: 'desync', never: 'runtime' },
    }, dead: [{ row: 'ZZ-2', tool: 'x', code: 'GONE', fix: null }, { row: 'ZZ-3', tool: 'x', code: 'OLD', fix: { code: 'LIMCODE' } }] });
    J(c, 'ZZ2.json', { form: 'limclass/1', area: 'ZZ2', rows: { 'ZZ-12': { chk: 'built', class: null } } });
    return { d, lm: limmap.load({ mapDir: m, classDir: c }) };
  };
  t('limmap: limitOf / rowClass / null = unknown, bad files skipped', () => {
    const { d, lm } = fixture();
    try {
      assert.deepEqual(lm.limitOf('LIMCODE'), { lim: ['ZZ-2', 'ZZ-10'], kind: null, class: null });
      assert.deepEqual(lm.limitOf('SELF'), { lim: [], kind: 'tool', class: 'tool' });
      assert.deepEqual(lm.limitOf('PENDING'), { lim: [], kind: null, class: null });
      assert.deepEqual(lm.limitOf('DUP'), { lim: ['ZZ-3'], kind: null, class: null }, 'later done entry beats earlier null');
      assert.equal(lm.limitOf('NOPE'), null); assert.equal(lm.limitOf('JUNK'), null);
      assert.equal(lm.rowClass('ZZ-3'), 'hang'); assert.equal(lm.rowClass('ZZ-10'), null); assert.equal(lm.rowClass('XX-1'), null);
      assert.equal(lm.errors.length, 2);
      assert.deepEqual(lm.codes(), ['DUP', 'LIMCODE', 'NEWROW', 'OPENED', 'PENDING', 'ROWS_ONLY', 'SELF']);
      assert.deepEqual(lm.rowIds(), ['ZZ-2', 'ZZ-3', 'ZZ-10', 'ZZ-11', 'ZZ-12']);
      assert.deepEqual(lm.stats(), { codes: 7, withLim: 3, toolKind: 1, proposed: 1, open: 1, notDone: 1, rows: 5, rowsClassed: 3,
        chk: { built: 2, todo: 1, never: 1, notDone: 1 }, dead: 2, deadFixed: 1 });
      const empty = limmap.load({ mapDir: path.join(d, 'none'), classDir: path.join(d, 'none') });
      assert.equal(empty.limitOf('LIMCODE'), null); assert.equal(empty.stats().codes, 0);
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });
  t('registry: severityFromRows + sevDiff', () => {
    const { d, lm } = fixture();
    try {
      assert.equal(reg.severityFromRows('ROWS_ONLY', lm), 'crash', 'worst row: hang -> crash');
      assert.equal(reg.severityFromRows('LIMCODE', lm), 'cosmetic', 'ZZ-10 unclassed, ZZ-2 cosmetic');
      assert.equal(reg.severityFromRows('NEWROW', lm), 'silent', 'entry class first');
      assert.equal(reg.severityFromRows('SELF', lm), 'review'); assert.equal(reg.severityFromRows('PENDING', lm), 'review');
      assert.equal(reg.severityFromRows('NOPE', lm), 'review');
      // severity() is review for all fixture names; PENDING (nothing known) is left out
      assert.deepEqual(reg.sevDiff(lm), [{ code: 'DUP', now: 'review', rows: 'crash' }, { code: 'LIMCODE', now: 'review', rows: 'cosmetic' },
        { code: 'NEWROW', now: 'review', rows: 'silent' }, { code: 'ROWS_ONLY', now: 'review', rows: 'crash' }]);
      assert.equal(reg.severity('MACRO_UNDEFINED'), 'crash', 'severity() unchanged');
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });
  t('report: --limits adds limit/kind to json + sarif, off = byte-equal', () => {
    const { d, lm } = fixture();
    const env = process.env.ARSENAL_LIMITS;
    try {
      delete process.env.ARSENAL_LIMITS;
      const r = createReport(); r.add('a.def', 2, 'LIMCODE', 'm'); r.add('b.def', 0, 'SELF', 'n'); r.info('c', 0, 'NOPE', 'i');
      const plain = JSON.stringify(r.toJSON({ tool: 'x' })), plainS = JSON.stringify(r.toSarif({ tool: 'x' }));
      assert.ok(!/"limit"/.test(plain) && !/"properties"/.test(plainS));
      assert.equal(JSON.stringify(r.toJSON({ tool: 'x', limits: false, limmap: lm })), plain);
      const j = r.toJSON({ tool: 'x', limits: true, limmap: lm });
      assert.deepEqual(j.findings.map(f => [f.code, f.limit, f.kind]), [['LIMCODE', ['ZZ-2', 'ZZ-10'], undefined], ['SELF', [], 'tool']]);
      assert.deepEqual(j.info[0].limit, []);
      const s = r.toSarif({ tool: 'x', limits: true, limmap: lm }).runs[0].results;
      assert.deepEqual(s.map(x => x.properties), [{ limit: ['ZZ-2', 'ZZ-10'] }, { limit: [], kind: 'tool' }, { limit: [] }]);
      process.env.ARSENAL_LIMITS = '1';
      assert.ok(Array.isArray(r.toJSON({ tool: 'x', limmap: lm }).findings[0].limit), 'env turns it on');
      assert.equal(JSON.stringify(r.toJSON({ tool: 'x', limits: false })), plain, 'meta.limits:false beats env');
    } finally {
      if (env === undefined) delete process.env.ARSENAL_LIMITS; else process.env.ARSENAL_LIMITS = env;
      fs.rmSync(d, { recursive: true, force: true });
    }
  });
  t('limmap: real folders load without throwing; explain limitsFor keeps chk ids', () => {
    limmap.reset();
    const s = limmap.stats();
    assert.ok(s.codes >= 0 && s.rows >= 0 && s.chk.built + s.chk.todo + s.chk.never + s.chk.notDone === s.rows);
    const { limitsFor } = require('../explain');
    for (const c of limmap.codes()) { const e = limmap.limitOf(c); const got = limitsFor(c); for (const id of e.lim.slice(0, 4)) assert.ok(got.includes(id), c + ' ' + id); assert.ok(got.length <= 4); }
  });
};
