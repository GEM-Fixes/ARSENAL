// list.js reading: sparse range reads (tiny blocks) give the same .ply / map.net findings as a whole read; a forced-sparse
// CLI run (BINHDR_SPARSE_MIN=0) prints the same report; --restore-points is accepted and a mod's .arsenal-undo is never read;
// ahead() keeps item order
// Author: Imperator_Aug (ARSENAL, ia-96c7678a)
const fs = require('fs'), path = require('path'), assert = require('assert'), { execFileSync } = require('child_process');
const L = require('../list'), { checkPly } = require('../ply'), M = require('../misc');
const game = path.join(process.env.TEST_WORK || __dirname, 'fixture', 'game'), cli = path.join(__dirname, '..', 'binhdr.js');
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.ply$|\.net$/i.test(e.name)) files.push(p); } })(path.join(game, 'mods', 'm1', 'resource'));
assert.ok(files.length > 5, 'fixture .ply files');
(async () => {
  for (const p of files) {
    const isPly = /\.ply$/i.test(p), key = 'resource/x/' + path.basename(p).toLowerCase(), has = k => k.length % 2 === 0;
    const check = (buf, mk, rep) => isPly ? checkPly({ key, buf, mkReader: mk, rep, rel: key, has }) : M.checkNet({ buf, mkReader: mk, rep, rel: key, game: null });
    const run = (buf, mk) => { const out = [], rep = { add: (...a) => out.push(['a', ...a]), info: (...a) => out.push(['i', ...a]) }; try { check(buf, mk, rep); } catch (e) { out.push(['x', e.message]); } return JSON.stringify(out); };
    const whole = run(fs.readFileSync(p));
    for (const block of [8, 100, 65536]) {
      const s = await L.sparse(p, (b, mk) => check(b, mk, { add() {}, info() {} }), { block, head: block });
      assert.equal(run(s.buf, s.mkReader), whole, `sparse block ${block}: ${p}`);
    }
  }
  const order = [];
  for await (const [it] of L.ahead([5, 1, 3, 0, 2], x => new Promise(r => setTimeout(() => r(x), x * 5)), 3)) order.push(it);
  assert.deepEqual(order, [5, 1, 3, 0, 2], 'ahead keeps order');
  const def = execFileSync('node', [cli, game, '--mods', 'm1', '--strict'], { encoding: 'utf8' });
  const sp = execFileSync('node', [cli, game, '--mods', 'm1', '--strict', '--restore-points'], { encoding: 'utf8', env: { ...process.env, BINHDR_SPARSE_MIN: '0' } });
  assert.equal(sp, def, 'forced sparse + --restore-points: same report');
  // restore points inside the mod: never mounted, never listed, no findings from them
  const undo = path.join(game, 'mods', 'm1', '.arsenal-undo');
  fs.mkdirSync(path.join(undo, 't1', 'resource', 'a'), { recursive: true });
  fs.writeFileSync(path.join(undo, 't1', 'resource', 'a', 'undo_bad.dds'), 'xx');
  try {
    const T = await L.listMounted(path.join(game, 'mods', 'm1'));
    assert.ok(T.left.includes('.arsenal-undo') && !T.files.some(r => /^\.arsenal-undo\//i.test(r[0])), 'no .arsenal-undo rows');
    assert.ok(T.files.some(r => /^resource\//.test(r[0])), 'resource rows listed');
    const u = execFileSync('node', [cli, game, '--mods', 'm1', '--strict'], { encoding: 'utf8' });
    assert.equal(u, def, 'restore point files give no findings');
  } finally { fs.rmSync(undo, { recursive: true, force: true }); }
  console.log('sparse PASS');
})().catch(e => { console.error(e); process.exit(1); });
