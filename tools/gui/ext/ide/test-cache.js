// The Editor's and Mod Files' server caches in the shared store (tools/gui/README.md "CACHE", ext/files/modfiles.js, routes.js):
// the file tree ('ide.tree'), pak listings ('ide.pak'), the whole-mod check ('ide.check', 'ide.check.done'), the mod list
// ('ide.mods') and the Prepare sections ide.tree, ide.index, ide.check. Run by tools/gui/ext/ide/test.js (hook at its end, or alone:
// IDE_ONLY=cache node tools/gui/ext/ide/test.js <scratch>). module.exports = async function(env){}. Made-up fixture only.
// Author: Imperator_Aug (ARSENAL, ia-11a7fa15)
'use strict';
const fs = require('fs'), path = require('path');

module.exports = async function (env) {
  const ok = (c, m, x) => env.ok(c, c || x === undefined ? m : m + ' [' + String(x).slice(0, 400) + ']');
  const wr = (f, b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };
  const sleep = ms => new Promise(z => setTimeout(z, ms));
  const mf = require('../files/modfiles'), flib = require('../files/lib'), zw = require('../../../lib/zipwrite'), R = env.R;
  const W = env.scratch('cache'), game = path.join(W, 'game'), mod = path.join(game, 'mods', 'mine');
  wr(path.join(game, 'as64.exe'), 'MZ');
  wr(path.join(game, 'resource', 'entity', 'gun.def'), '{entity "gun"}\r\n');
  wr(path.join(mod, 'mod.info'), '{mod {name "Mine"}}\r\n');
  const files = { 'resource/set/a.set': '{x 1\r\n', 'resource/set/ok.set': '{z 1}\r\n', 'resource/entity/gun.def': '{entity "gun2"}\r\n', 'resource/texture/t.txt': 'x\r\n' };
  for (const k of Object.keys(files)) wr(path.join(mod, k), files[k]);
  const pakF = path.join(mod, 'resource', 'p.pak');
  wr(pakF, zw.zip([['set/p.set', Buffer.from('{p 1}\r\n'), false]]));
  const ctx = Object.assign({}, env.ctx, { game: () => game, tmpRoot: path.join(W, 'tmp') });
  const { S, mt } = mf.kit(ctx);
  const sig = rows => rows.map(r => [r.rel, r.size, r.state, r.key].join('|')).join('\n');

  // ================================================================ the tree (modfiles.tree)
  let views = 0;
  const view = () => { views++; return flib.vfsFor(ctx, mod); };
  const build = async (age) => { const rows = []; const r = await mf.tree(ctx, mod, { view, rows, maxAgeMs: age }); return { r, rows }; };
  const a = await build(0);
  ok(a.r.from === 'build' && views === 1 && a.rows.some(r => /p\.pak/.test(r.rel) && /p\.set$/.test(r.rel)) && a.rows.some(r => r.rel === 'resource/set/a.set'), 'tree: a first ask builds it (the view asked once, pak entries listed)', JSON.stringify(a.r));
  const b = await build(0);
  ok(b.r.from === 'store' && views === 1 && sig(b.rows) === sig(a.rows) && b.r.total === a.r.total && b.r.unread === a.r.unread, 'tree: the second ask comes from the store, equal to the built one, the view is not asked', JSON.stringify(b.r));
  ok(mf.treeState(ctx, mod).state === 'ready', 'tree: the stored state is ready', JSON.stringify(mf.treeState(ctx, mod)));
  // the pak listing: kept by the pak's size and time
  const pst = fs.statSync(pakF), T0 = mt.last(mod), prow = T0.files.find(f => /p\.pak$/.test(f[0]));
  const pk1 = mf.pakEntries(ctx, pakF, prow[1], prow[2]);
  fs.writeFileSync(pakF, 'not a zip any more');   // same listing asked with the old size and time: the store answers, the file is not opened
  const pk2 = mf.pakEntries(ctx, pakF, prow[1], prow[2]);
  ok(pk1.ok && pk2.ok && JSON.stringify(pk1.ents) === JSON.stringify(pk2.ents) && pk1.ents.length === 1, 'pak: a listing is reused while size and time are the same', JSON.stringify(pk2));
  const pk3 = mf.pakEntries(ctx, pakF, 18, pst.mtimeMs + 5);
  ok(!pk3.ok && !pk3.ents.length, 'pak: another size or time reads the pak again (now broken: shown as unread)', JSON.stringify(pk3));
  wr(pakF, zw.zip([['set/p.set', Buffer.from('{p 1}\r\n'), false]]));
  fs.utimesSync(pakF, pst.atime, pst.mtime);
  // an edit in the mod: built again, the new file is there
  wr(path.join(mod, 'resource', 'set', 'new.set'), '{n 1}\r\n');
  const c = await build(0);
  ok(c.r.from === 'build' && views === 2 && c.rows.some(r => r.rel === 'resource/set/new.set') && c.rows.length === a.rows.length + 1, 'tree: a file added to the mod builds it again', JSON.stringify(c.r));
  const d = await build(0);
  ok(d.r.from === 'store' && sig(d.rows) === sig(c.rows), 'tree: and that one is kept');
  // the route gives the same rows as the store, and Mod Files reads the same entry
  R._reset();
  const page = await env.get('tree', { mod, lim: '500' }, ctx);
  let rr = page.rows || page.files || [];
  ok(page.done !== false && rr.length === d.rows.length && rr.map(r => r.rel).join() === d.rows.map(r => r.rel).join(), 'tree route: the rows of the store', JSON.stringify({ n: rr.length, want: d.rows.length, keys: Object.keys(page) }));
  const before = views;
  const ft = await flib.tree(ctx, { mod });
  const frels = (ft.files || ft.rows || []).map(r => r.rel).join();
  ok(frels === d.rows.map(r => r.rel).join(), 'Mod Files tree: the same rows, from the same store entry', JSON.stringify({ keys: Object.keys(ft), n: (ft.files || ft.rows || []).length }));
  ok(views === before, 'Mod Files tree: no view asked for a kept tree');
  // another profile mod list = another entry (parts), not a stale one
  ok(typeof flib.profileSig(ctx) === 'string' && flib.profileSig(ctx).length === 16, 'tree: the profile mod list is part of the identity');

  // ================================================================ Prepare sections
  const PREP = R._prep, by = {}; for (const p of PREP) by[p.id] = p;
  ok(PREP.map(p => p.id).join() === 'ide.tree,ide.index,ide.check' && PREP.every(p => typeof p.state === 'function' && typeof p.run === 'function' && /^ide\.prep\./.test(p.title)), 'prepare: sections ide.tree, ide.index, ide.check');
  ok(by['ide.tree'].areas.join() === 'all' && by['ide.index'].areas.join() === 'entity,set' && by['ide.check'].areas.join() === 'all' && PREP.every(p => p.needs.join() === 'mod.tree,game.view'), 'prepare: needs and areas');
  const lang = {}; for (const r of require('./lang/core')) lang[r[0]] = r;
  ok(PREP.every(p => lang[p.title] && lang[p.title].length >= 5 && lang[p.title].slice(1, 5).every(Boolean)), 'prepare: titles in en, ru, uk, zh');
  const q = { mod, game: { id: 'as64', dir: game, exe: 'as64' } };
  const mkJob = () => { const j = { sets: [], cancelled: false, set(o) { j.sets.push(o); }, onCancel(f) { j.cb = f; } }; return j; };
  ok(by['ide.tree'].state(ctx, q).state === 'ready', 'prepare ide.tree: ready after the page built it', JSON.stringify(by['ide.tree'].state(ctx, q)));
  wr(path.join(mod, 'resource', 'set', 'new2.set'), '{n 2}}\r\n');
  await mt.ensure(mod, { maxAgeMs: 0 });
  const st1 = by['ide.tree'].state(ctx, q);
  ok(st1.state === 'stale' && st1.why.some(w => /^mod/.test(w)), 'prepare ide.tree: stale after a file was added (why: the mod)', JSON.stringify(st1));
  const j1 = mkJob(); await by['ide.tree'].run(ctx, q, j1);
  ok(by['ide.tree'].state(ctx, q).state === 'ready' && j1.sets.length && j1.sets.every(s => s.stage === 'ide.prep.st.tree'), 'prepare ide.tree: run builds it through the page\'s job and reports its stage', JSON.stringify(j1.sets.slice(-1)));
  ok(by['ide.tree'].state(ctx, { mod: path.join(W, 'nope'), game: q.game }).state === 'na' || by['ide.tree'].state(ctx, { mod: path.join(W, 'nope'), game: q.game }).state === 'stale', 'prepare: a folder that is not a mod gives a plain state, no throw');

  // the whole-mod check
  const s0 = by['ide.check'].state(ctx, q);
  ok(s0.state === 'none', 'prepare ide.check: none before a check', JSON.stringify(s0));
  const j2 = mkJob(); await by['ide.check'].run(ctx, q, j2);
  const lastSet = j2.sets[j2.sets.length - 1];
  ok(lastSet && lastSet.done === lastSet.total && lastSet.total >= 4 && by['ide.check'].state(ctx, q).state === 'ready', 'prepare ide.check: run checks the mod to its end (done = total), then ready', JSON.stringify(lastSet));
  ok(!fs.existsSync(path.join(ctx.tmpRoot, 'ide-modcheck')), 'check: nothing under <tmpRoot>/ide-modcheck any more');
  // the page's check now reuses every file
  R._reset();
  const run = async (b2) => { let r = null, all = []; for (let i = 0; i < 400; i++) { r = await env.post('modcheck', Object.assign({ mod, from: all.length }, b2), ctx); all = all.concat(r.files); if (r.done) break; await sleep(5); } return { r, all }; };
  let x = await run({});
  ok(x.r.done && x.r.stat.cached === x.r.total && x.r.stat.checkedNew === 0, 'check: the page\'s check after Prepare takes every file from the store', JSON.stringify(x.r.stat));
  const found = x.all.map(f => f.rel).join();
  ok(/a\.set/.test(found) && /new2\.set/.test(found), 'check: the kept findings are the fresh ones', found);
  R._reset();
  wr(path.join(mod, 'resource', 'set', 'ok.set'), '{z 2}}\r\n');
  x = await run({});
  ok(x.r.stat.checkedNew === 1 && x.r.stat.cached === x.r.total - 1 && x.all.some(f => f.rel === 'resource/set/ok.set'), 'check: one changed file is checked again, the rest reused', JSON.stringify(x.r.stat));
  R._reset();
  await env.post('modcheck', { mod, from: 0, again: true }, ctx);   // a new check; the polls below read that one
  x = await run({});
  ok(x.r.stat.cached === 0 && x.r.stat.checkedNew === x.r.total, 'check: again:true passes the store by', JSON.stringify(x.r.stat));
  // cancel: a running prepare check stops and leaves no finished mark
  R._reset();
  wr(path.join(mod, 'resource', 'set', 'ok.set'), files['resource/set/ok.set']);
  await mt.ensure(mod, { maxAgeMs: 0 });
  ok(by['ide.check'].state(ctx, q).state === 'stale', 'prepare ide.check: stale after a file changed', JSON.stringify(by['ide.check'].state(ctx, q)));
  const j3 = mkJob(); j3.cancelled = true;
  await by['ide.check'].run(ctx, q, j3);
  ok(by['ide.check'].state(ctx, q).state === 'stale', 'prepare ide.check: a cancelled run starts no check and leaves no finished mark', JSON.stringify(by['ide.check'].state(ctx, q)));

  // the index of names: a state with no build
  const si = by['ide.index'].state(ctx, q);
  ok(si && typeof si.state === 'string' && Array.isArray(si.why), 'prepare ide.index: state answers without a build', JSON.stringify(si));
  // the names index is fresh by the areas it reads (entity, set, paks): a texture does not move its signature, a .set does
  const nav = require('../../../ide/intel/nav'), ic = { gameDir: game, mods: ['mine'], folder: mod };
  Object.defineProperty(ic, 'shared', { value: { cache: S, modtree: mt, gameview: mf.kit(ctx).gv }, enumerable: false });
  await mt.ensure(mod, { maxAgeMs: 0 });
  const g1 = nav._ixSig(ic);
  wr(path.join(mod, 'resource', 'texture', 't2.txt'), 'y\r\n'); await mt.ensure(mod, { maxAgeMs: 0 });
  const g2 = nav._ixSig(ic);
  ok(g1 && g2 && g1.sig === g2.sig && !g1.open && /mine=/.test(g1.sig) && !/\?/.test(g1.sig), 'names index: a file outside entity, set and paks does not make it stale', JSON.stringify([g1, g2]));
  wr(path.join(mod, 'resource', 'set', 'idx.set'), '{i 1}\r\n'); await mt.ensure(mod, { maxAgeMs: 0 });
  const g3 = nav._ixSig(ic);
  ok(g3.sig !== g2.sig, 'names index: a new .set does', JSON.stringify(g3));
  ok(Object.keys(files).every(k => k === 'resource/set/ok.set' || fs.readFileSync(path.join(mod, k), 'utf8') === files[k]), 'cache: the mod\'s own files are only read');
  R._reset();
};
