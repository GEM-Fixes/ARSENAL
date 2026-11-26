// modset: the read-once pass. Two readers over one store (each file read once, shared, freed), a missing file, a small byte cap,
// close; run() of a module form in a worker thread (output taken, the reader works there, test hooks throw / oom / partial).
// node modset.test.js (exit 1 on failure); test.js runs it as a child
// Author: Imperator_Aug (ARSENAL, ia-70d9d858)
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const modset = require('../modset');
const W = require('./wait'), HUNG = {};
let n = 0, bad = 0, hung = 0;
// each step: backstop 2 min (WAIT line), once more as long, then it counts as failed ("not done"); a step left hanging ends the
// process at the end (its open ports or worker would hold it). Backup, never a hang
const t = async (name, fn) => { try { if (await W.late(Promise.resolve().then(fn), { who: 'modset.test', what: name, ms: 120000, or: HUNG }) === HUNG) { hung++; throw new Error('not done after the long wait (a wait of the pass never answered)'); } n++; } catch (e) { console.log('FAIL ' + name + ': ' + (e && e.stack || e)); bad++; } };
const D = fs.mkdtempSync(path.join(process.env.ARSENAL_TMP || os.tmpdir(), 'modset-'));
const mk = (rel, s) => { const f = path.join(D, 'mod', rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); return f; };
const files = Array.from({ length: 40 }, (_, i) => mk(`resource/set/f${String(i).padStart(2, '0')}.set`, `{x ${i}}\r\n` + 'y'.repeat(i * 100)));
// a reader loop as a linter has it: add all, then wait + take each in order
async function consume(ra, list) {
  for (const f of list) ra.add(f, f);
  const got = [];
  for (const f of list) { const w = ra.wait(f); if (w) await w; const b = ra.take(f); got.push(b === undefined ? fs.readFileSync(f) : b); }
  ra.close();
  return got;
}

(async () => {
  await t('two readers: each file read once, shared, same bytes', async () => {
    const p = modset.pass({ window: 4 });
    const a = p.reader('a'), b = p.reader('b');
    const [ga, gb] = await Promise.all([consume(a, files), consume(b, files.slice(10))]);
    ga.forEach((x, i) => assert.ok(x.equals(fs.readFileSync(files[i])), 'a ' + i));
    gb.forEach((x, i) => assert.ok(x.equals(fs.readFileSync(files[i + 10])), 'b ' + i));
    // a file only a wants (the first 10): a reads it itself once both have added theirs (own), unless the store had started it
    assert.equal(p.stats.reads + a.stats.own + b.stats.own, 40); assert.equal(b.stats.own, 0); assert.ok(a.stats.own >= 8, 'own ' + a.stats.own);
    assert.equal(p.stats.files, 40); assert.equal(p.stats.shared, 30); assert.equal(p.stats.readers, 2);
    assert.equal(a.stats.taken, 40); assert.equal(b.stats.taken, 30);
    p.close();
  });
  await t('no head-of-line: a reader that holds bytes and never takes them does not stop another (full store: own reads)', async () => {
    const p = modset.pass({ window: 2, maxBytes: 1000, ahead: 2 }), slow = p.reader('slow'), fast = p.reader('fast');
    for (const f of files) slow.add(f, f);
    await slow.wait(files[0]);   // ready, then it sits on whatever the store hands it
    try {
      const got = await W.late(consume(fast, files), { who: 'modset.test', what: 'fast reader past a slow one', ms: 60000, or: null });
      assert.ok(got, 'fast waited on slow (head-of-line): not done after the long wait');
      got.forEach((x, i) => assert.ok(x.equals(fs.readFileSync(files[i])), 'fast ' + i));
      assert.ok(p.stats.evicted > 0, 'files slow still wanted left the full store: ' + p.stats.evicted);
    } finally { slow.close(); p.close(); }
  });
  await t('missing file: take gives undefined (the reader reads it itself and fails as before)', async () => {
    const p = modset.pass(), r = p.reader();
    const gone = path.join(D, 'nope.set');
    r.add('k', gone); await r.wait('k');
    assert.equal(r.take('k'), undefined); assert.equal(p.stats.failed, 1);
    r.close(); p.close();
  });
  await t('one file, two keys of one reader: both keys answer (the second reads it itself, never left waiting)', async () => {
    const p = modset.pass(), r = p.reader('dup');
    r.add('k1', files[0]); r.add('k2', files[0]);
    const both = await W.late(Promise.all([r.wait('k1'), r.wait('k2')]), { who: 'modset.test', what: 'two keys of one file', ms: 60000, or: HUNG });
    assert.notEqual(both, HUNG, 'the second key of the same file was never answered (the pass hangs)');
    for (const k of ['k1', 'k2']) { const b = r.take(k); assert.ok((b === undefined ? fs.readFileSync(files[0]) : b).equals(fs.readFileSync(files[0])), k); }
    r.close(); p.close();
  });
  await t('run(): a linter that ends run(ctx) but leaves a timer open is ended, not waited on for ever (ok false: the caller falls back)', async () => {
    const leak = path.join(D, 'leak.js');
    fs.writeFileSync(leak, "module.exports = { run: async () => { console.log('0 findings'); setInterval(() => {}, 1000); } };\n");
    const p = modset.pass();
    const r = await W.late(p.run({ tool: 'leak', file: leak }), { who: 'modset.test', what: 'run of a linter with a timer left open', ms: 60000, or: HUNG });
    p.close();
    assert.notEqual(r, HUNG, 'run() never settled: the thread of a linter with an open timer was never ended');
    assert.equal(r.ok, false); assert.match(r.out, /0 findings/);
  });
  await t('small byte cap: every file, same bytes, nobody blocks (a full store hands a file back: at most read twice)', async () => {
    const p = modset.pass({ window: 2, maxBytes: 500 }), a = p.reader('a'), b = p.reader('b');
    const [ga, gb] = await Promise.all([consume(a, files), consume(b, files)]);
    assert.equal(ga.length, 40); ga.concat(gb).forEach((x, i) => assert.ok(x.equals(fs.readFileSync(files[i % 40])), 'file ' + i));
    const n = p.stats.reads + a.stats.own + b.stats.own; assert.ok(n >= 40 && n <= 80, 'reads ' + n);
    p.close();
  });
  await t('drop and close let bytes go; a later add reads again', async () => {
    // gap: the pass sees r's drop before r2's add (two ports: no order between them). 100 ms; a miss (busy PC) runs once more with 2 s
    const once = async gap => {
      const p = modset.pass(), r = p.reader();
      r.add('a', files[0]); await r.wait('a'); r.drop('a');
      r.add('b', files[1]); r.close();
      await W.sleep(gap);
      const r2 = p.reader(); r2.add('a', files[0]); await r2.wait('a');
      const x = { b: r2.take('a'), re: p.stats.rereads }; r2.close(); p.close(); return x;
    };
    let x = await once(100);
    if (x.re !== 1) { W.say('modset.test', 'the drop seen before the next add (rereads ' + x.re + '; once more with 2 s)', 100); x = await once(2000); }
    assert.ok(x.b && x.b.equals(fs.readFileSync(files[0])));
    assert.equal(x.re, 1);
  });
  // module form in a worker thread
  const ctxFile = path.join(D, 'ctx.js');
  fs.writeFileSync(ctxFile, `module.exports = { run: async ctx => { const ra = ctx.reader(), fs = require('fs');
    const fl = ctx.argv; for (const f of fl) ra.add(f, f); let s = 0;
    for (const f of fl) { const w = ra.wait(f); if (w) await w; const b = ra.take(f); s += (b || fs.readFileSync(f)).length; }
    ra.close(); console.log('bytes ' + s); console.error('err line'); console.log('0 findings'); } };\n`);
  const total = files.reduce((s, f) => s + fs.statSync(f).size, 0);
  await t('run(): worker thread, output taken, reader through the pass', async () => {
    const p = modset.pass({ folder: path.join(D, 'mod') });
    const [r1, r2] = await Promise.all([p.run({ tool: 'x', file: ctxFile, argv: files }), p.run({ tool: 'y', file: ctxFile, argv: files })]);
    for (const r of [r1, r2]) { assert.equal(r.ok, true, r.why); assert.equal(r.out, `bytes ${total}\n0 findings\n`); assert.equal(r.err, 'err line\n'); assert.equal(r.code, 0); }
    assert.equal(p.stats.reads, 40); assert.equal(p.stats.shared, 40);
    p.close();
  });
  await t('run() test hooks: throw, partial, oom', async () => {
    const p = modset.pass();
    const [a, b, c] = await Promise.all(['throw', 'partial', 'oom'].map(fail => p.run({ tool: fail, file: ctxFile, argv: files.slice(0, 3), fail })));
    assert.equal(a.ok, false); assert.match(a.why, /forced failure/);
    assert.equal(b.ok, true); assert.ok(!/findings/.test(b.out), 'partial: no findings line');
    assert.equal(c.ok, false); assert.equal(c.oom, true, c.why);
    p.close();
  });
  await t('range read: only those bytes, shared per file + range, size of the whole file', async () => {
    const p = modset.pass(), a = p.reader('a'), b = p.reader('b'), f = files[30], all = fs.readFileSync(f);
    a.add('h', f, { start: 2, end: 10 }); b.add('h2', f, { start: 2, end: 10 }); a.add('t', f, { start: all.length - 4, end: all.length + 100 }); a.add('w', f);
    await Promise.all([a.wait('h'), b.wait('h2'), a.wait('t'), a.wait('w')]);
    assert.equal(a.size('h'), all.length); assert.equal(a.size('t'), all.length); assert.equal(a.size('nope'), undefined);
    assert.ok(a.take('h').equals(all.subarray(2, 10))); assert.ok(b.take('h2').equals(all.subarray(2, 10)));
    assert.ok(a.take('t').equals(all.subarray(all.length - 4))); assert.ok(a.take('w').equals(all));
    assert.equal(p.stats.reads, 3); assert.equal(p.stats.shared, 1);
    a.close(); b.close(); p.close();
  });
  // the listing a caller hands over (doctor: wouldload's): taken when it is a full scan of the folder, else the pass lists it
  const lsFile = path.join(D, 'ls.js');
  fs.writeFileSync(lsFile, `module.exports = { run: async ctx => { console.log('listing ' + (ctx.listing ? (ctx.listing.handed ? 'handed' : 'scanned') + ' ' + ctx.listing.files.length : 'none')); console.log('0 findings'); } };\n`);
  await t('listing hand-off: a scan T or a Promise of one; another folder or null = scanned here; false = none', async () => {
    const folder = path.join(D, 'mod'), T = await require('../modtree').scan(folder);
    const out = async listing => { const p = modset.pass({ folder, listing }), r = await p.run({ tool: 'ls', file: lsFile }); p.close(); assert.equal(r.ok, true, r.why); return r.out.split('\n')[0] + ' ' + p.stats.listing; };
    assert.equal(await out({ ...T, handed: true }), 'listing handed 40 handed');
    assert.equal(await out(Promise.resolve({ ...T, handed: true })), 'listing handed 40 handed');
    assert.equal(await out(Promise.resolve(null)), 'listing scanned 40 scanned');
    assert.equal(await out({ ...T, dir: D, handed: true }), 'listing scanned 40 scanned');
    assert.equal(await out({ ...T, names: true, handed: true }), 'listing scanned 40 scanned');
    assert.equal(await out(Promise.reject(new Error('x'))), 'listing scanned 40 scanned');
    assert.equal(await out(true), 'listing scanned 40 scanned');
    assert.equal(await out(false), 'listing none none');
  });
  await t('formOf', async () => {
    assert.ok(modset.formOf('milint')); assert.equal(modset.formOf('no-such-tool'), null); assert.equal(modset.formOf('../x'), null);
  });
  fs.rmSync(D, { recursive: true, force: true });
  console.log(`${n} passed${bad ? ', ' + bad + ' failed' : ''}`);
  process.exitCode = bad ? 1 : 0;
  if (hung) process.stdout.write('', () => process.exit(1));   // a hung step's ports or worker would hold the process open
})();
