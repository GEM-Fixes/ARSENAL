// gitview: a scratch git repo under ARSENAL_TMP (commit, rename, modify, same-size edit, touch, delete, untracked, ignored,
// left-out folder, subfolder, a path with spaces and non-ASCII, a racy index entry). Both dirty ways give the expected set;
// contentKey, blobs, changedBetween, head, toolStamp, the async forms, not-a-repo / no git / ARSENAL_GITVIEW=0 = null, and
// no file under .git changes (size, mtime, count) during the read calls.
// node gitview.test.js (exit 1 on failure); test.js runs it as a child
// Author: Imperator_Aug (ARSENAL, ia-55d2b127)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), assert = require('assert');
const gv = require('../gitview'), modtree = require('../modtree');
let n = 0, bad = 0;
const t = async (name, fn) => { try { await fn(); n++; } catch (e) { console.log('FAIL ' + name + ': ' + (e && e.stack || e)); bad++; } };
const D = fs.mkdtempSync(path.join(process.env.ARSENAL_TMP || os.tmpdir(), 'gitview-'));
const R = path.join(D, 'repo'), M = path.join(R, 'mod dir');
const git = (...a) => cp.execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: R, windowsHide: true }).toString('utf8').trim();
const w = (rel, s) => { const f = path.join(M, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); return f; };
const NA = 'sub dir/é ü 名.set';
// every file under .git: rel -> size:mtimeNs
const gitFp = () => {
  const out = {};
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f); else { const s = fs.statSync(f, { bigint: true }); out[path.relative(R, f)] = s.size + ':' + s.mtimeNs; } } };
  walk(path.join(R, '.git')); return out;
};

(async () => {
  fs.mkdirSync(M, { recursive: true });
  git('init', '-q');
  fs.writeFileSync(path.join(R, 'outside.txt'), 'o');
  w('.gitignore', '*.log\nbuild/\n');
  w('a.set', '{a 1}\r\n'); w('b.set', '{b 22}\r\n'); w('c.set', '{c 3}\r\n'); w('d.set', '{d 4}\r\n'); w('old name.set', '{r}\r\n');
  w(NA, '{x "é"}\r\n'); w('t.set', '{t}\r\n'); w('racy.set', '{racy}\r\n');
  git('add', '-A'); git('commit', '-qm', 'one');
  const c1 = git('rev-parse', 'HEAD');
  fs.renameSync(path.join(M, 'old name.set'), path.join(M, 'new name.set'));
  w('d.set', '{d 44}\r\n');
  git('add', '-A'); git('commit', '-qm', 'two');
  const c2 = git('rev-parse', 'HEAD');
  // racy: index file mtime set before racy.set's cached mtime (content unchanged: must stay clean, found by hashing)
  const ix = path.join(R, '.git', 'index'), past = new Date(Date.now() - 3600e3);
  fs.utimesSync(ix, past, past);
  // working-copy changes
  w('a.set', '{a 1 changed}\r\n');                                     // size differs
    w('b.set', '{b 33}\r\n');                                             // same size, other bytes
  const tf = path.join(M, 't.set'), later = new Date(Date.now() + 5000); fs.utimesSync(tf, later, later);   // touched only
  fs.unlinkSync(path.join(M, 'c.set'));                                // deleted
  w('new file.set', '{n}\r\n');                                         // untracked
  w('w[1].set', '{w}\r\n'); w('z[1].log', 'ignored');               // brackets: not a glob
  w('x.log', 'ignored'); w('build/y.set', 'ignored dir');               // ignored
  w('.arsenal-undo/r1/a.set', '{undo}\r\n');                           // left out by modtree, untracked to git
  w('sub dir/ü2.set', '{u}\r\n');                                       // untracked, non-ASCII
  fs.writeFileSync(path.join(R, 'outside2.txt'), 'not in the folder');
  const want = ['.arsenal-undo/r1/a.set', 'a.set', 'b.set', 'c.set', 'new file.set', 'sub dir/ü2.set', 'w[1].set'].sort();
  const T = await modtree.scan(M);
  const before = gitFp();

  await t('repoOf', async () => {
    const r = gv.repoOf(M);
    assert.equal(path.resolve(r.root), path.resolve(R)); assert.equal(r.rel, 'mod dir');
    assert.equal(gv.repoOf(R).rel, '');
  });
  await t('head', async () => assert.equal(gv.head(M), c2));
  await t('blobs: folder only, sha = git content hash, cached size', async () => {
    const m = gv.blobs(M);
    assert.deepEqual([...m.keys()].sort(), ['.gitignore', 'a.set', 'b.set', 'c.set', 'd.set', 'new name.set', 'racy.set', NA, 't.set'].sort());
    assert.equal(m.get(NA).sha, git('rev-parse', 'HEAD:mod dir/' + NA));
    assert.equal(m.get('d.set').size, 8);
    assert.equal(typeof m.get('a.set').mtimeNs, 'bigint');
  });
  let viaStatus, viaStat;
  await t('dirty via git status', async () => {
    viaStatus = gv.dirty(M);
    assert.equal(viaStatus.via, 'status'); assert.ok(viaStatus.ms >= 0);
    assert.deepEqual([...viaStatus.set].sort(), want);
  });
  await t('dirty via listing stat = via status', async () => {
    viaStat = gv.dirty(M, { listing: T });
    assert.equal(viaStat.via, 'stat');
    assert.deepEqual([...viaStat.set].sort(), want);
    assert.ok(viaStat.hashed >= 3, 'b (same size), t (touched), racy hashed: ' + viaStat.hashed);
    assert.deepEqual([...gv.dirty(M, { listing: T, ask: 0 }).set].sort(), want, 'untracked by the ls-files -o walk');
  });
  await t('ARSENAL_GIT_CHEAP_DIRTY=0 takes git status', async () => {
    process.env.ARSENAL_GIT_CHEAP_DIRTY = '0';
    try { assert.equal(gv.dirty(M, { listing: T }).via, 'status'); } finally { delete process.env.ARSENAL_GIT_CHEAP_DIRTY; }
  });
  await t('dirty of the whole repo includes the outside file', async () => {
    const s = gv.dirty(R).set; assert.ok(s.has('outside2.txt')); assert.ok(s.has('mod dir/a.set'));
    const s2 = gv.dirty(R, { listing: await modtree.scan(R) }).set;
    assert.deepEqual([...s2].sort(), [...s].sort());
    assert.deepEqual([...gv.dirty(R, { listing: await modtree.scan(R), ask: 0 }).set].sort(), [...s].sort());
  });
  await t('changedBetween', async () => {
    assert.deepEqual(gv.changedBetween(M, c1, c2).sort(), ['d.set', 'new name.set', 'old name.set']);
    assert.deepEqual(gv.changedBetween(M, c2, c2), []);
    assert.equal(gv.changedBetween(M, '--output=x', c2), null);
    assert.equal(gv.changedBetween(M, 'nosuchrev', c2), null);
  });
  await t('contentKey clean / dirty, with and without snapshot', async () => {
    const snap = gv.snapshot(M, { listing: T });
    assert.equal(snap.head, c2); assert.deepEqual([...snap.dirty].sort(), want);
    for (const k of [undefined, snap]) {
      assert.equal(gv.contentKey(M, NA, k), git('rev-parse', 'HEAD:mod dir/' + NA));
      assert.equal(gv.contentKey(M, 't.set', k), git('rev-parse', 'HEAD:mod dir/t.set'));
      assert.equal(gv.contentKey(M, 'racy.set', k), git('rev-parse', 'HEAD:mod dir/racy.set'));
      for (const d of ['a.set', 'b.set', 'c.set', 'new file.set', 'x.log', 'nope.set']) assert.equal(gv.contentKey(M, d, k), null, d);
    }
  });
  await t('promises give the same answers', async () => {
    assert.deepEqual(await gv.promises.repoOf(M), gv.repoOf(M));
    assert.equal(await gv.promises.head(M), c2);
    assert.deepEqual([...(await gv.promises.dirty(M, { listing: T })).set].sort(), want);
    assert.deepEqual([...(await gv.promises.dirty(M)).set].sort(), want);
    assert.equal(await gv.promises.contentKey(M, 'b.set'), null);
  });
  await t('toolStamp: ARSENAL head + tools hash', async () => {
    const a = gv.toolStamp();
    if (gv.repoOf(path.join(__dirname, '..')) === null) { assert.equal(a, null); return; }
    assert.match(a.key, /^[0-9a-f]{40}$/); assert.match(a.tools, /^[0-9a-f]{40}$/); assert.equal(a.head, gv.head(__dirname));
  });
  await t('toolStamp of a folder: same twice, moves with the content of a dirty file (status line unchanged)', async () => {
    const a = gv.toolStamp(M), b2 = await gv.promises.toolStamp(M);
    assert.deepEqual(a, b2); assert.equal(a.head, c2);
    w('b.set', '{b 44}\r\n');
    const c = gv.toolStamp(M); w('b.set', '{b 33}\r\n');
    assert.equal(c.head, a.head); assert.notEqual(c.tools, a.tools); assert.notEqual(c.key, a.key);
    assert.deepEqual(gv.toolStamp(M), a);
  });  await t('.git unchanged by every read call (size, mtime, file count)', async () => {
    assert.deepEqual(gitFp(), before);
    assert.equal(fs.statSync(ix).mtimeMs, past.getTime());
  });
  await t('not a repo, no git, ARSENAL_GITVIEW=0: null, no throw', async () => {
    const P = path.join(D, 'plain'); fs.mkdirSync(P);
    const ceil = process.env.GIT_CEILING_DIRECTORIES; process.env.GIT_CEILING_DIRECTORIES = D;
    try {
      assert.equal(gv.repoOf(P), null); assert.equal(gv.blobs(P), null); assert.equal(gv.dirty(P), null);
      assert.equal(gv.contentKey(P, 'a'), null); assert.equal(await gv.promises.dirty(P), null);
      assert.equal(gv.repoOf(path.join(D, 'missing')), null);
    } finally { if (ceil === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = ceil; }
    const p0 = process.env.PATH; process.env.PATH = D;
    try { assert.equal(gv.repoOf(M), null); assert.equal(await gv.promises.head(M), null); } finally { process.env.PATH = p0; }
    process.env.ARSENAL_GITVIEW = '0';
    try { assert.equal(gv.repoOf(M), null); assert.equal(gv.toolStamp(), null); } finally { delete process.env.ARSENAL_GITVIEW; }
  });
  fs.rmSync(D, { recursive: true, force: true });
  console.log(`${n} passed${bad ? ', ' + bad + ' failed' : ''}`);
  process.exitCode = bad ? 1 : 0;
})();
