// recipe "a skin" test: node skin.test.js <scratch>. A PNG the size of pz4h's texture and a small DDS named after the shield texture are
// staged for the draft; the kit checks the recipe, strings, census coverage and its seeded defect, steps, compile, the plan (the winter
// camouflage pz4h#win.tga made here, pz4h_shield#win.dds by the gen skin op, the TexMods line by the camo-write route) and writes into the
// scratch mod. Before the kit, direct compiles: a PNG replacing a game DDS is refused with the DDS hand off, a hand made DDS replaces it,
// a fixed variant is a gen set row (or the skin op with texmod when it brings a DDS), a camouflage DDS goes through the skin op (or a copy
// over a variant the game has), a new soldier look is the skin op on a humanskin, and values() preselects from the parent.
// Author: Imperator_Aug (ARSENAL, ia-d3422a6e)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const A = require('../../../../artport/artport'), C = require('../../art/core');
const recipe = require('./skin.recipe');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-skin-')));
fs.mkdirSync(scratch, { recursive: true });

const DIR = 'resource/entity/-vehicle/tank_medium/pz4h/', TEX = DIR + 'pz4h.dds', DEF = DIR + 'pz4h.def';
const id = 'skin-test-kit';
const stage = D.stageDir({ tmpRoot: path.join(scratch, 'tmp') }, id);
fs.mkdirSync(stage, { recursive: true });
const gameDir = kit.findGame({});
let TW = 256, TH = 256;
if (gameDir) { const V = C.view(gameDir, null), i = C.imgInfo(V.readAny(V.get(TEX)), '.dds'); if (i && i.w) { TW = i.w; TH = i.h; } }
const rgba = Buffer.alloc(TW * TH * 4);
for (let p = 0; p < TW * TH; p++) { rgba[p * 4] = 230; rgba[p * 4 + 1] = 230; rgba[p * 4 + 2] = 235; rgba[p * 4 + 3] = 255; }
fs.writeFileSync(path.join(stage, 'winter.png'), A.encodePng({ w: TW, h: TH, rgba }));
// a hand made uncompressed DDS without mipmaps (header only matters to the checks)
function dds(w, h) {
  const b = Buffer.alloc(128 + w * h * 4); b.write('DDS ', 0, 'latin1'); b.writeUInt32LE(124, 4); b.writeUInt32LE(0x100F, 8); b.writeUInt32LE(h, 12); b.writeUInt32LE(w, 16);
  b.writeUInt32LE(w * 4, 20); b.writeUInt32LE(32, 76); b.writeUInt32LE(0x41, 80); b.writeUInt32LE(32, 88);
  b.writeUInt32LE(0xFF0000, 92); b.writeUInt32LE(0xFF00, 96); b.writeUInt32LE(0xFF, 100); b.writeUInt32LE(0xFF000000, 104); b.writeUInt32LE(0x1000, 108); return b;
}
fs.writeFileSync(path.join(stage, 'pz4h_shield.dds'), dds(64, 64));
const v = x => ({ src: 'value', value: x });

(async () => {
  const ctx = kit.ctxFor(scratch, { gameDir });
  let fails = 0;
  const ok = (c, m, x) => { if (!c) { fails++; console.log('FAIL ' + m + (x !== undefined ? '\n  ' + String(x).slice(0, 600) : '')); } };
  const vs = await recipe.values(ctx, null, { verb: 'make', draft: { parent: { q: 'skin' } }, pass: { base: { id: 'resource/entity/humanskin/eng_com/eng_com.def' } } });
  ok(vs.kind === 'soldier' && vs.look === 'eng_com' && vs.look_id === 'eng_com_new', 'values: a soldier parent passing a humanskin preselects a new soldier look', JSON.stringify(vs));
  // each kind has its own picture question; it takes at upload only what that kind can write (no JPG, no PNG where only DDS works)
  const Q = {}; for (const g of recipe.groups) for (const q of g.q) Q[q.id] = q;
  ok(Q.image.picker.kinds.join() === '.dds,.png,.tga,.bmp' && Q.image.when.kind.join() === 'camo', 'camo picture: DDS, PNG, TGA, BMP');
  ok(['image_dds', 'image_wear', 'image_look'].every(k => Q[k].picker.kinds.join() === '.dds'), 'replace, fixed and soldier pictures: DDS only at upload');
  ok(!Q.image.picker.sources.includes('keep') && !Q.image_dds.picker.sources.includes('keep'), 'camo and replace have no Keep (with no picture nothing would change)');
  ok(Q.wear.kind === 'thing' && Q.wear.picker.lookup === 'variant' && Q.wear.when.kind.join() === 'fixed' && Q.variant.when.kind.join() === 'camo', 'fixed picks a paint scheme from the list; the variant name is camo only');
  ok(recipe.groups.find(g => g.id === 'what').q.some(q => q.id === 'wear'), 'the paint scheme is in the essential group');
  const SL = new Map(require('./skin.lang').map(r => [r[0], r[1]]));
  ok(!/variant|texmod/i.test(SL.get('task.skin.v.kind.fixed')) && !/variant|texmod|#/.test(SL.get('task.skin.h.kind')), 'kind label and help without file words', SL.get('task.skin.v.kind.fixed'));
  ok(['image', 'image_dds', 'image_wear', 'image_look', 'option'].every(k => SL.get('task.skin.h.' + k).length < 300), 'each picture help is under 300 characters');
  ok(/GIMP/.test(SL.get('task.skin.k.saved')) && /NVIDIA Texture Tools/.test(SL.get('task.skin.k.saved')), 'the saved note names paint programs and the DDS saver');
  ok(recipe.kept.filter(k => /^mtl\./.test(k[0])).every(k => k[1].length < 100), 'material rows are short');
  if (!ctx.game()) console.log('note: SKIP direct compiles: no game folder');
  else {
    const mod = path.join(scratch, 'mods', 'skin_direct'); fs.mkdirSync(mod, { recursive: true });
    const mk = (answers, files, verb, base) => {
      const d = D.newId('skin'), st = D.stageDir(ctx, d); fs.mkdirSync(st, { recursive: true });
      for (const [n, b] of Object.entries(files || {})) fs.writeFileSync(path.join(st, n), b);
      return D.save(ctx, { id: d, recipe: 'skin', verb: verb || 'change', game: 'as64', mod, base: base === undefined ? { id: 'pz4h' } : base, answers, kept: [], state: 'open' });
    };
    const run = d => CP.compile(ctx, d, { skin: recipe });
    let threw = null;
    try { await run(mk({ kind: v('replace'), texture: v(TEX), image_dds: { src: 'file', staged: ['w.png'] } }, { 'w.png': fs.readFileSync(path.join(stage, 'winter.png')) })); } catch (e) { threw = e; }
    ok(threw && /DDS editor/.test(threw.message), 'replace: a PNG over a game DDS is refused with the DDS hand off', threw && threw.message);
    const r = await run(mk({ kind: v('replace'), texture: v(TEX), image_dds: { src: 'file', staged: ['mine.dds'] } }, { 'mine.dds': dds(64, 64) }));
    ok(r.copies.length === 1 && r.copies[0].staged === 'mine.dds' && r.copies[0].to === TEX, 'replace: the DDS is copied over the texture as it is', JSON.stringify(r.copies));
    ok(r.notes.some(n => /no mipmaps/.test(n)) && r.notes.some(n => /64x64, the game texture is/.test(n)), 'replace: notes say no mipmaps and the size differs', JSON.stringify(r.notes));
    const f = await run(mk({ kind: v('fixed'), wear: { src: 'exist', value: '1' } }));
    const row = f.gen && f.gen.ops[0] && f.gen.ops[0].rows[0];
    ok(row && row.entity === 'file:' + DEF && row.path === 'game_entity/texmod' && row.value === '"1"', 'fixed: a gen set row puts {texmod "1"} in pz4h.def', JSON.stringify(f.gen));
    ok(f.result === '1' && f.notes.some(n => /always wears its paint scheme 1/.test(n)), 'fixed: pz4h has a #1 scheme, Review says it is worn on every map', JSON.stringify(f.notes));
    threw = null; try { await run(mk({ kind: v('fixed'), wear: v('nosuch') })); } catch (e) { threw = e; }
    ok(threw && /no paint scheme nosuch yet/.test(threw.message), 'fixed: a new scheme name with no pictures refuses (it would change nothing)', threw && threw.message);
    const fx = await run(mk({ kind: v('fixed'), wear: v('desert'), image_wear: { src: 'file', staged: ['d.dds'] } }, { 'd.dds': dds(64, 64) }));
    const so = fx.gen && fx.gen.ops[0];
    ok(so && so.op === 'skin' && so.id === 'desert' && so.entity === 'pz4h' && so.texmod === true && /d\.dds$/.test(so.textures.pz4h), 'fixed with a DDS: the gen skin op writes pz4h#desert.dds and sets texmod', JSON.stringify(fx.gen));
    const cm = await run(mk({ kind: v('camo'), texture: v(TEX), option: v('V3'), variant: v('task3'), image: { src: 'file', staged: ['c.dds'] } }, { 'c.dds': dds(64, 64) }));
    ok(cm.gen && cm.gen.ops[0].op === 'skin' && cm.gen.ops[0].id === 'task3' && !cm.gen.ops[0].texmod && cm.copies.length === 0, 'camo with a DDS: the gen skin op writes the variant file', JSON.stringify(cm.gen));
    ok(cm.calls.length === 1 && cm.calls[0].route === 'POST /api/x/art/camo-write' && cm.calls[0].body.name === 'pz4h' && cm.calls[0].body.option === 'V3' && cm.calls[0].body.variant === 'task3', 'camo: the TexMods line goes through the camo-write route', JSON.stringify(cm.calls));
    const cw = await run(mk({ kind: v('camo'), texture: v(TEX), option: v('V1'), image: { src: 'file', staged: ['one.dds'] } }, { 'one.dds': dds(64, 64) }));
    ok(!cw.gen && cw.copies.length === 1 && cw.copies[0].to === DIR + 'pz4h#1.dds', 'camo over a variant the game has (#1): a copy, the gen op would refuse', JSON.stringify(cw.copies));
    const sl = await run(mk({ kind: v('soldier'), look: { src: 'exist', value: 'eng_com' }, look_id: v('eng_task') }, null, 'make', null));
    const hs = sl.gen && sl.gen.ops[0];
    ok(hs && hs.op === 'skin' && hs.id === 'eng_task' && hs.like === 'eng_com' && sl.result === 'eng_task', 'soldier look: the gen skin op copies the humanskin under the new name', JSON.stringify(sl.gen));
    // the variant lookup lists the schemes pz4h has (with their season) and offers a typed new name
    const lv = await recipe.lookups.variant(ctx, '', { in: 'pz4h' }), lv2 = await recipe.lookups.variant(ctx, 'desert', { in: 'pz4h' });
    ok(lv.results.some(x => x.id === '1') && lv.results.every(x => x.where === 'game'), 'variant lookup: the schemes pz4h has', JSON.stringify(lv.results.slice(0, 4)));
    ok(lv2.results[0] && lv2.results[0].id === 'desert' && lv2.results[0].where === 'new' && !lv2.exact, 'variant lookup: a typed name is offered as a new scheme', JSON.stringify(lv2.results.slice(0, 2)));
    // the gametex route saves the texture to paint over as PNG and as it is; bringing it back unchanged refuses
    const gd = mk({ kind: v('replace'), texture: v(TEX) });
    const gr = await recipe.routes['POST /api/x/task/r/skin/gametex']('', { draft: gd }, ctx);
    const gp = D.stagedPath(ctx, gd.id, gr.png), graw = D.stagedPath(ctx, gd.id, gr.raw);
    ok(gr.ok && gr.key === TEX && gr.w === TW && fs.readFileSync(gp).readUInt32BE(0) === 0x89504E47 && fs.readFileSync(graw).toString('latin1', 0, 4) === 'DDS ', 'gametex: pz4h.dds is saved as PNG and as DDS in staging, with its size', JSON.stringify(gr));
    const gd2 = D.save(ctx, Object.assign(gd, { answers: Object.assign({}, gd.answers, { gametex: v([gr.png, gr.raw]), image_dds: { src: 'file', staged: [gr.raw] } }) }));
    threw = null; try { await run(gd2); } catch (e) { threw = e; }
    ok(threw && /unchanged/.test(threw.message), 'the saved game texture brought back unchanged refuses', threw && threw.message);
    // the real page flow of the gametex step: skin.client.js run as the page runs it (TASK.kind, h, tx, api), the button posts to the
    // recipe route (dispatched to the route the core mounts), then reveals the PNG through external/open; files land in staging only
    {
      const vm = require('vm'), kinds = {}, posts = [], el = (tag, a, kids) => ({ tag, a: a || {}, kids: kids || [], textContent: (a && a.text) || '', disabled: false, appendChild(x) { this.kids.push(x); } });
      const routes = require('../index').routes;
      const api = (url, body) => { posts.push({ url, body }); if (url === '/api/x/task/r/skin/gametex') return Promise.resolve().then(() => routes['POST ' + url]('', JSON.parse(JSON.stringify(body)), ctx)); return Promise.resolve({ ok: true, target: 'x' }); };
      vm.runInNewContext(require('./skin.client').script, { window: { TASK: { kind: (n, s) => { kinds[n] = s; } } }, TASK: { kind: (n, s) => { kinds[n] = s; } }, h: el, tx: (k, p) => k + (p ? JSON.stringify(p) : ''), api, String, Error });
      ok(!!kinds.gametex, 'client: skin.client.js registers the gametex kind');
      const fd = mk({ kind: v('replace'), texture: v(TEX) }), host = el('div'), st = { answer: null, draft: fd };
      kinds.gametex.draw(Q.gametex, st, host);
      const find = (n, f) => { if (f(n)) return n; for (const k of n.kids || []) { const r = find(k, f); if (r) return r; } return null; };
      const btn = find(host, n => n.tag === 'button' && n.a['data-skin-save']), msg = find(host, n => n.a['data-skin-gametex']);
      ok(btn && typeof btn.a.onclick === 'function', 'client: the step shows the Save the game texture button');
      ok(JSON.stringify(kinds.gametex.value(Q.gametex, st).answer) === '{"src":"value","value":""}', 'client: skipping the step is an empty answer');
      btn.a.onclick(); for (let i = 0; i < 50 && posts.length < 2; i++) await new Promise(r => setTimeout(r, 20));
      const rv = posts[1] && posts[1].body, png = st.saved && st.saved[0];
      ok(posts[0] && posts[0].url === '/api/x/task/r/skin/gametex' && rv && posts[1].url === '/api/x/task/external/open' && rv.action === 'reveal' && rv.staged === png && rv.draft === fd.id, 'client: the button posts to the route, then shows the PNG in its folder', JSON.stringify(posts).slice(0, 300));
      const sdir = path.resolve(D.stageDir(ctx, fd.id)), files = (st.saved || []).map(n => path.resolve(D.stagedPath(ctx, fd.id, n)));
      ok(files.length === 2 && files.every(f => fs.existsSync(f) && f.startsWith(sdir + path.sep) && !f.toLowerCase().startsWith(path.resolve(gameDir).toLowerCase())), 'client: PNG and DDS are written in the task\'s staging folder, never in the game', files.join(' '));
      ok(/task\.skin\.k\.saved/.test(msg.textContent) && JSON.stringify(kinds.gametex.value(Q.gametex, st).answer.value) === JSON.stringify(st.saved), 'client: the step says what was saved; the answer lists the saved files', msg.textContent);
    }
    // upload checks (picker.check): a too big DDS and an unreadable picture are refused at upload
    const big = dds(64, 64); big.writeUInt32LE(9000, 12); big.writeUInt32LE(9000, 16);
    ok(Q.image_dds.picker.check({ name: 'big.dds', bytes: big }).key === 'task.skin.e.big', 'upload: a DDS over 8192 is refused at upload');
    ok(Q.image.picker.check({ name: 'bad.tga', bytes: Buffer.from('not a picture at all') }).key === 'task.skin.e.read', 'upload: an unreadable camouflage picture is refused at upload');
    ok(Q.image.picker.check({ name: 'w.png', bytes: fs.readFileSync(path.join(stage, 'winter.png')) }) === null && Q.image_look.picker.check({ name: 'd.dds', bytes: dds(64, 64) }) === null, 'upload: a good PNG and DDS pass');
    ok(recipe.test === 'task.skin.test' && SL.has('task.skin.test'), 'the Test step says where to look');
    const sd = mk({ kind: v('soldier'), look: { src: 'exist', value: 'eng_com' } }, null, 'make', null);
    const sr = await recipe.routes['POST /api/x/task/r/skin/gametex']('', { draft: sd }, ctx);
    ok(/humanskin\/eng_com\/eng_com\.(dds|tga)$/.test(sr.key), 'gametex: a soldier look saves its main texture', sr.key);
    const pl = await CP.plan(ctx, mk({ kind: v('soldier'), look: { src: 'exist', value: 'eng_com' }, look_id: v('eng_task'), image_look: { src: 'file', staged: ['diffuse.dds'] } }, { 'diffuse.dds': dds(64, 64) }, 'make', null), { skin: recipe });
    const rels = pl.files.map(x => x.rel);
    ok(!pl.errors.length && rels.includes('resource/entity/humanskin/eng_task/eng_task.def') && rels.includes('resource/entity/humanskin/eng_task/eng_task.dds') && rels.includes('resource/entity/humanskin/eng_task/eng_task.mdl'), 'soldier look plan: def, model and the brought diffuse under the new name', JSON.stringify(pl.errors) + ' ' + rels.join(' '));
  }
  console.log(fails ? 'FAIL (direct checks)' : 'PASS (direct checks)');
  if (fails) process.exitCode = 1;
  await kit.run(recipe, require('./skin.lang'), {
    id, gameDir: gameDir || undefined, validate: { kinds: ['gametex'] }, client: require('./skin.client'),
    base: { id: 'pz4h' },
    answers: { unit: { src: 'keep' }, kind: 'camo', texture: { src: 'keep' }, image: { src: 'file', staged: ['winter.png', 'pz4h_shield.dds'] }, option: 'Winter' },
    planFiles: [DIR + 'pz4h#win.tga', DIR + 'pz4h_shield#win.dds'],
    write: true,
    after: (mod, res, ok) => {
      const t = fs.readFileSync(path.join(mod, ...(DIR + 'pz4h#win.tga').split('/')));
      ok(t[2] === 2 && t[16] === 32 && t.readUInt16LE(12) === TW && t.readUInt16LE(14) === TH, 'the camouflage is a 32 bit TGA of the texture size', t.readUInt16LE(12) + 'x' + t.readUInt16LE(14));
      ok(fs.readFileSync(path.join(mod, ...(DIR + 'pz4h_shield#win.dds').split('/'))).equals(fs.readFileSync(path.join(stage, 'pz4h_shield.dds'))), 'the shield DDS was written by the gen skin op as it is');
      ok(JSON.stringify(res.calls || []).includes('camo-write'), 'the write ran the camo-write route', JSON.stringify(res.calls).slice(0, 300));
      const d = fs.readFileSync(path.join(mod, ...DEF.split('/')), 'latin1');
      ok(/\{\s*TexMods\s+\{\s*"Winter"\s+"win"\s*\}/.test(d), 'pz4h.def maps Winter to win in TexMods', d.slice(0, 200));
      ok(/\r\n/.test(d) && !/[^\r]\n/.test(d), 'the def keeps CRLF line ends');
      ok(res.raw && res.raw.result === 'win', 'the branch result is the variant name', res.raw && res.raw.result);
      const tn = JSON.stringify(res.notes || (res.raw && res.raw.notes) || []);
      ok(/the game reads that TGA as it is/.test(tn) && /DDS image editor card/.test(tn), 'the TGA note says the game reads the TGA and points to the DDS editor card', tn.slice(0, 400));
    },
  }, scratch);
})();
