// report core + cli tests
// Author: Imperator_Aug (ARSENAL, ia-6c315622)
module.exports = function (t, assert) {
  const fs = require('fs'), os = require('os'), path = require('path');
  const { createReport } = require('../report'), cli = require('../cli');
  const mk = () => { const r = createReport(); r.add('a/b.def', 3, 'BAD', 'x'); r.add('c.lng', 0, 'WARN_Q', 'y'); r.info('a\\b.def', 5, 'HINT', 'z'); return r; };
  t('report toJSON', () => {
    const j = mk().toJSON({ tool: 'tt' });
    assert.equal(j.tool, 'tt'); assert.equal(j.version, 1); assert.equal(j.total, 2);
    assert.deepEqual(j.findings.map(f => [f.file, f.line, f.code, f.severity]), [['a/b.def', 3, 'BAD', 'error'], ['c.lng', 0, 'WARN_Q', 'warning']]);
    assert.equal(j.info[0].severity, 'note'); assert.deepEqual(j.counts, { BAD: 1, WARN_Q: 1 });
  });
  t('report toSarif', () => {
    const s = mk().toSarif({ tool: 'tt' }), run = s.runs[0];
    assert.equal(s.version, '2.1.0'); assert.equal(run.tool.driver.name, 'tt');
    assert.deepEqual(run.tool.driver.rules.map(r => r.id), ['BAD', 'HINT', 'WARN_Q']);
    assert.deepEqual(run.results.map(r => r.level), ['error', 'warning', 'note']);
    const l = run.results[2].locations[0].physicalLocation;
    assert.equal(l.artifactLocation.uri, 'a/b.def'); assert.equal(l.region.startLine, 5);
    assert.equal(run.results[1].locations[0].physicalLocation.region.startLine, 1);
  });
  t('report print text/json to file', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rep-'));
    try {
      const f = path.join(d, 'o.json'); mk().print({ format: 'json', output: f, meta: { tool: 'x' }, showInfo: false });
      const j = JSON.parse(fs.readFileSync(f, 'utf8')); assert.equal(j.info.length, 0); assert.equal(j.total, 2);
      const g = path.join(d, 'o.txt'); mk().print({ output: g, byCode: true });
      assert.equal(fs.readFileSync(g, 'utf8'), 'info: a\\b.def:5: HINT z\na/b.def:3: BAD x\nc.lng: WARN_Q y\n2 findings\nby code: {"BAD":1,"WARN_Q":1}\n');
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });
  t('cli parse', () => {
    const o = cli.parse(['d', '-q', '--format', 'sarif', '-o', 'f', '--game', 'G', '--mods', 'a,b', '--vfs', '--vocab', 'v', '--summary', '--by-code'], { flags: ['--vfs'], values: ['--vocab'] });
    assert.deepEqual([o.pos, o.q, o.format, o.output, o.gameDir, o.mods, o.x, o.summary, o.byCode], [['d'], true, 'sarif', 'f', 'G', ['a', 'b'], { vfs: true, vocab: 'v' }, true, true]);
    assert.equal(cli.parse([]).format, 'text');
    assert.throws(() => cli.parse(['--format', 'xml']), /--format/); assert.throws(() => cli.parse(['-o']), /needs a value/);
  });
};
