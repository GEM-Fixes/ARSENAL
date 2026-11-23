// .lintrc suppression + csv/html format tests
// Author: Imperator_Aug (ARSENAL, ia-387e7952)
module.exports = function (t, assert) {
  const fs = require('fs'), os = require('os'), path = require('path');
  const { createReport } = require('../report'), cli = require('../cli'), lintrc = require('../lintrc');
  const mk = () => {
    const r = createReport();
    r.add('a/b.def', 3, 'BAD', 'x'); r.add('a/c.def', 4, 'BAD', 'y'); r.add('c.lng', 0, 'WARN_Q', 'z, "q"');
    r.info('a/b.def', 5, 'HINT', '<h>');
    return r;
  };
  const cap = fn => { const ls = [], o = console.log; console.log = (...a) => ls.push(a.join(' ')); try { fn(); } finally { console.log = o; } return ls; };
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lrc-'));
  const rcOf = j => { const d = tmp(), f = path.join(d, '.lintrc'); fs.writeFileSync(f, JSON.stringify(j)); return { d, f }; };

  t('lintrc legacy text unchanged without rc', () => {
    assert.deepEqual(cap(() => mk().print({})), ['info: a/b.def:5: HINT <h>', 'a/b.def:3: BAD x', 'a/c.def:4: BAD y', 'c.lng: WARN_Q z, "q"', '3 findings']);
  });
  t('lintrc ignore by code/path/line, counted + summary', () => {
    const { f } = rcOf({ ignore: [{ code: 'BAD', path: 'a/b.def', reason: 'ok' }, { code: 'WARN_Q', line: 9 }, { code: 'NOPE' }] });
    const r = mk(); r.setRc(lintrc.load(f));
    assert.equal(r.count, 2);
    const ls = cap(() => r.print({}));
    assert.equal(ls[0], 'info: a/b.def:5: HINT <h>');
    assert.ok(ls[1].startsWith('info: .lintrc: RC_UNUSED_SUPPRESSION') && ls[1].includes('WARN_Q'));
    assert.ok(ls[2].includes('RC_UNUSED_SUPPRESSION') && ls[2].includes('NOPE'));
    assert.deepEqual(ls.slice(3), ['a/c.def:4: BAD y', 'c.lng: WARN_Q z, "q"', '2 findings', '1 suppressed']);
  });
  t('lintrc glob basename and **', () => {
    const r = mk(); r.setRc({ file: 'x/.lintrc', ignore: [{ code: '*', path: '*.lng' }, { code: 'BAD', path: 'a/**' }], severity: {} });
    assert.equal(r.count, 0);
  });
  t('lintrc severity map', () => {
    const r = mk(); r.setRc({ file: '.lintrc', ignore: [], severity: { BAD: 'warning', WARN_Q: 'off', HINT: 'off' } });
    const j = r.toJSON({ tool: 'x' });
    assert.deepEqual(j.findings.map(f => f.severity), ['warning', 'warning']);
    assert.equal(j.total, 2); assert.equal(j.suppressedCount, 2); assert.equal(j.info.length, 0);
    const r2 = mk(); r2.setRc({ file: '.lintrc', ignore: [], severity: { BAD: 'info' } });
    assert.equal(r2.count, 1);
    assert.equal(r2.toJSON().info.length, 3);
  });
  t('lintrc json/sarif carry suppressed', () => {
    const r = mk(); r.setRc({ file: '.lintrc', ignore: [{ code: 'BAD', line: 3, reason: 'why' }], severity: {} });
    const j = r.toJSON({ tool: 'x' });
    assert.equal(j.total, 2); assert.equal(j.suppressed[0].reason, 'why'); assert.equal(j.counts.BAD, 1);
    const s = r.toSarif({ tool: 'x' }).runs[0].results;
    const sp = s.filter(x => x.suppressions);
    assert.equal(sp.length, 1); assert.equal(sp[0].suppressions[0].justification, 'why'); assert.equal(sp[0].suppressions[0].kind, 'external');
    const noRc = mk().toJSON();
    assert.equal(noRc.suppressed, undefined);
  });
  t('lintrc find walks up; bad rc errors', () => {
    const { d, f } = rcOf({});
    fs.mkdirSync(path.join(d, 'a', 'b'), { recursive: true });
    assert.equal(lintrc.find(path.join(d, 'a', 'b')), f);
    const bad = path.join(d, 'bad'); fs.writeFileSync(bad, '{nope');
    assert.throws(() => lintrc.load(bad), /bad \.lintrc/);
    fs.writeFileSync(bad, JSON.stringify({ severity: { A: 'loud' } }));
    assert.throws(() => lintrc.load(bad), /severity\.A/);
    fs.writeFileSync(bad, JSON.stringify({ ignore: [{ line: 1 }] }));
    assert.throws(() => lintrc.load(bad), /code/);
  });
  t('cli --rc / --no-rc / discovery', () => {
    const { d, f } = rcOf({ ignore: [{ code: 'X' }] });
    assert.equal(cli.parse([d]).rc.file, f);
    assert.equal(cli.parse([d, '--no-rc']).rc, null);
    const e = tmp(); fs.writeFileSync(path.join(e, 'r.json'), '{"ignore":[]}');
    assert.equal(cli.parse([d, '--rc', path.join(e, 'r.json')]).rc.file, path.join(e, 'r.json'));
    assert.throws(() => cli.parse(['--rc', path.join(e, 'missing')]), /bad \.lintrc/);
    assert.equal(cli.parse(['--format', 'csv']).format, 'csv'); assert.equal(cli.parse(['--format', 'html']).format, 'html');
  });
  t('csv format', () => {
    const csv = mk().toCsv();
    assert.equal(csv, 'file,line,code,severity,msg\r\na/b.def,3,BAD,error,x\r\na/c.def,4,BAD,error,y\r\nc.lng,0,WARN_Q,warning,"z, ""q"""\r\na/b.def,5,HINT,note,<h>\r\n');
    assert.equal(mk().toCsv({ showInfo: false }).split('\r\n').length, 5);
  });
  t('html format', () => {
    const h = mk().toHtml({ tool: 'tt' });
    assert.ok(h.startsWith('<!DOCTYPE html>') && h.includes('3 findings') && h.includes('&lt;h&gt;') && !h.includes('<h>'));
    assert.ok(h.includes('<h2>BAD (2)</h2>') && h.includes('z, &quot;q&quot;'));
    assert.ok(!/<script|src=|href=/.test(h));
  });
  t('csv/html print to -o file', () => {
    const d = tmp(), c = path.join(d, 'o.csv'), h = path.join(d, 'o.html');
    mk().print({ format: 'csv', output: c }); mk().print({ format: 'html', output: h });
    assert.ok(fs.readFileSync(c, 'utf8').startsWith('file,line')); assert.ok(fs.readFileSync(h, 'utf8').includes('<table>'));
  });
};
