// Map Viewer style part test (MV-PG4, builder PG4b): node tools/gui/ext/mapviz/sub/style.test.js [scratch dir]
// The route GET styles on a stubbed paint index (absent, built list, throwing list, throwing load, bad rows) and on the
// real one when it is there; the part on a stub V in the fake DOM with answers in the frozen formats (paint styles
// --json body, GET pictures items): the panel blocks, the select from GET styles (not built and broken disabled, an
// unknown id ignored, a row with no state not built), the switch emits 'picture' on and off, a pick of a style that is not
// built is refused, Make posts once, painted quick look posts 1024 then 2048 (a failed first posts nothing more), recon
// "made from", context change, products, stale answers, document busy, Gates of Hell the same as MoW:AS2 and AS64; the
// part on the real shell; the language file both ways with a seeded missing zh name. Seeded defects: an id outside the
// four, a row without state, a lang copy missing one zh name, a refused pick.
// Author: Imperator_Aug (ARSENAL, ia-f7f7aeb9)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const OWN = !process.argv[2];
const SCR = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mv-style-')));
fs.mkdirSync(SCR, { recursive: true });
process.env.ARSENAL_CACHE = path.join(SCR, 'cache');
const { harness: H } = require('./shell.test');
const fake = require('../../../test/fakedom');
const SHELL = require('./shell.client'), PART = require('./style.client'), SRV = require('./style.server');
const LS = require('./style.lang.json'), L = H.mergeLang([require('./shell.lang.json'), LS]);
const ROOT = path.resolve(__dirname, '../../../../mapviz');
const PAL = require(path.join(ROOT, 'palette.json'));
let pass = 0, failN = 0;
const ok = (c, what, extra) => { if (c) pass++; else { failN++; console.log('FAIL mapviz style: ' + what + (extra !== undefined ? '\n  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };
const en = k => L.en[k];
const fill = (s, a) => s.replace(/\{(\w+)\}/g, (m, n) => (a[n] == null ? m : String(a[n])));
const clone = x => JSON.parse(JSON.stringify(x));
const MAP = 'multi/mv_fixture';

// ---------- frozen formats (paint.md 2 styles body; page-pg4 4 GET pictures item) ----------
const srow = (id, state, o) => Object.assign({ id, state, version: state === 'built' ? 1 : null, palette: 'styles.' + (id === 'sketch' ? 'field_sketch' : id), needs: ['height'], wants: [] }, o || {});
const STY_MIX = { v: 1, styles: [srow('staff', 'built'), srow('painted', 'not built'), srow('recon', 'broken'), srow('sketch', 'built'), srow('nope', 'built')] };
const STY_ALL = { v: 1, styles: ['staff', 'painted', 'recon', 'sketch'].map(id => srow(id, 'built')) };
const STY_NONE = { v: 1, styles: ['staff', 'painted', 'recon', 'sketch'].map(id => srow(id, 'not built')) };
const need = (base, size, mode) => ({ what: base, args: { map: MAP, mode: mode || 'battle_zones', size } });
function item(base, state, o) {
  o = o || {};
  const size = o.size || 2048;
  return { base, what: base, part: 'paint', size, state, why: state === 'notBuilt' ? 'style' : null, need: state === 'need' ? need(base, size, o.mode) : null,
    side: state === 'made' ? Object.assign({ w: 256, h: 188, size, box: [-600, -440, 600, 440], rung: null, approx: false, brightness: 'unverified', gaps: [], notes: [], made: '2026-11-14T00:00:00Z', base: null }, o.side || {}) : null, pack: null };
}
const pics = (items, q) => ({ v: 1, map: q && q.map || MAP, target: q && q.target || 'mowas2', mode: q && q.mode || 'battle_zones', items });
const err404 = n => Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'not made', need: n } });
const deferred = () => { let res, rej; const p = new Promise((a, b) => { res = a; rej = b; }); p.catch(() => {}); return { p, res, rej }; };

// ---------- the part on a stub V ----------
function load(o) {
  o = o || {};
  const doc = fake.make(), X = {};
  // o.kit: the pictures part before style, as on the page (its size kit: presets, game uses, custom)
  const fn = new Function('EXT_SCREENS', 'h', 'tx', 'api', 'S', 'RMT', 'cssv', 'onTheme', 'document', 'window', 'setTimeout', 'Image', 'gohDir', 'navigator', (o.kit ? [SHELL, require('./pictures.client'), PART] : [SHELL, PART]).join('\n'));
  fn(X, H.hOf(doc), H.txOf(o.lang || L, o.code || 'en'), () => Promise.reject(new Error('no api in a part test')), {}, false, (n, d) => d || '', () => () => {}, doc,
    { requestAnimationFrame: f => f() }, (f, ms) => setTimeout(f, 2), H.ImageStub, () => '', undefined);
  return { X, doc, part: X.mapviz.parts.find(p => p.id === 'style') };
}
function stubV(L0, o) {
  o = o || {};
  const rec = { panels: [], on: {}, calls: [], jobs: [], emits: [], boxes: {} };
  const q = Object.assign({ target: 'mowas2', game: '<game>', mod: null, map: MAP, mode: 'battle_zones', side: 'both', kind: 'tank', rmt: false, docBusy: false, jobs: [] }, o.q || {});
  rec.styles = o.styles || STY_MIX;
  rec.pictures = o.pictures || ((qq) => pics([item(qq.bases, 'need', { size: qq.size })], qq));
  rec.job = o.job || (() => Promise.resolve({ state: 'done' }));
  const V = {
    q: n => q[n], doc: null, pal: PAL,
    addLayer() { return true; }, addTool() {}, addHover() {}, redraw() {}, relist() {}, token: n => 'var-' + n, say() {},
    addPanel(p) { rec.panels.push(p); const box = L0.doc.createElement('div'); rec.boxes[p.id] = box; p.build(box, V); },
    on(e, f) { (rec.on[e] = rec.on[e] || []).push(f); },
    emit(e, d) { rec.emits.push({ e, d: clone(d) }); (rec.on[e] || []).forEach(f => f(d)); },
    // like the shell's vapi: GET pictures (QCOM pictures:1) gets the page context; a field the part sends wins; raw = what the part sent
    api(m, p, b) { const raw = clone(b || null); if (m === 'GET' && p === 'pictures') b = Object.assign({ target: q.target, game: q.game, modDir: q.mod, map: q.map, mode: q.mode, side: q.side, kind: q.kind }, b || {});
      rec.calls.push({ m, p, b: clone(b || null), raw });
      try { if (p === 'styles') return typeof rec.styles === 'function' ? rec.styles() : Promise.resolve(clone(rec.styles));
        if (p === 'pictures') { const r = rec.pictures(b); return r && typeof r.then === 'function' ? r : Promise.resolve(clone(r)); }
        if (o.more && o.more[p]) return Promise.resolve(clone(o.more[p])); } catch (e) { return Promise.reject(e); }
      return Promise.reject(Object.assign(new Error('no route'), { status: 404 })); },
    job(w, a) { rec.jobs.push({ w, a: clone(a) }); return rec.job(w, a); },
  };
  rec.V = V; rec.q = q;
  return rec;
}
function start(o) { const L0 = load(o); const R = stubV(L0, o); L0.part.init(R.V); return Object.assign(R, { L0, box: () => R.boxes.style }); }
const blk = (R, id) => H.blk(R.box(), id);
const sel = R => blk(R, 'mv.style.pick').all().filter(e => e.tagName === 'SELECT');
const sw = R => blk(R, 'mv.style.switch').all().find(e => e.tagName === 'INPUT');
const statusText = R => blk(R, 'mv.style.status').textContent;
const picEmits = R => R.emits.filter(x => x.e === 'picture').map(x => x.d);
const picCalls = R => R.calls.filter(c => c.p === 'pictures');
async function live(R) { R.V.emit('refresh', { target: R.q.target }); await H.flush(); }
async function turnOn(R) { const s = sw(R); s.checked = true; s.fire('change'); await H.flush(); }

(async () => {
  // ================= route GET styles =================
  { const R0 = SRV.routes['GET /api/x/mapviz/styles'];
    ok(typeof R0 === 'function' && Object.keys(SRV.routes).join() === 'GET /api/x/mapviz/styles', 'server: one route, GET styles');
    const U = s => new URL('http://127.0.0.1/api/x/mapviz/styles' + (s || ''));
    SRV._t.use({ paint: null });
    let a = await R0(U(), null, {});
    ok(a.v === 1 && a.styles.map(s => s.id).join() === 'staff,painted,recon,sketch' && a.styles.every(s => s.state === 'not built' && s.version === null && s.needs.length === 0 && s.wants.length === 0),
      'paint absent: the four styles, not built', a);
    ok(a.styles.map(s => s.palette).join() === 'styles.staff,styles.painted,styles.recon,styles.field_sketch', 'paint absent: palette entries of paint.md 4.1', a.styles.map(s => s.palette));
    SRV._t.use({ paint: { STYLES: ['staff', 'painted', 'recon', 'sketch'], styles: { list: () => [srow('staff', 'built'), { id: 'painted' }, srow('recon', 'broken', { version: 'x' }), null, { state: 'built' }, srow('sketch', 'built')] } } });
    a = await R0(U(), null, {});
    ok(a.styles.map(s => s.id + ':' + s.state).join() === 'staff:built,painted:not built,recon:broken,sketch:built', 'stubbed list: rows passed on; a row with no state is not built; rows with no id dropped', a.styles);
    ok(a.styles[0].version === 1 && a.styles[2].version === null && Array.isArray(a.styles[1].needs), 'stubbed list: version an integer or null; needs an array', a.styles);
    SRV._t.use({ paint: { STYLES: ['staff', 'painted', 'recon', 'sketch'], PALETTE_KEY: { staff: 'staff', painted: 'painted', recon: 'recon', sketch: 'field_sketch' }, styles: { list: () => { throw new Error('boom'); } } } });
    a = await R0(U(), null, {});
    ok(a.styles.length === 4 && a.styles.every(s => s.state === 'broken'), 'a list that throws: the four as broken, no route fault', a.styles);
    SRV._t.use({ paint: () => { throw new Error('index broke'); } });
    a = await R0(U(), null, {});
    ok(a.styles.length === 4 && a.styles.every(s => s.state === 'broken'), 'a paint index that throws on load: the four as broken', a.styles);
    let e = null; try { await R0(U('?target=as64'), null, {}); } catch (x) { e = x; }
    ok(e && e.status === 400 && e.key === 'mapviz.err.MV_USAGE', 'seeded: an argument the route does not take: 400 MV_USAGE', e && e.message);
    SRV._t.reset();
    let real = null; try { real = await R0(U(), null, {}); } catch (x) { real = { err: x.message }; }
    ok(real && real.v === 1 && Array.isArray(real.styles) && ['staff', 'painted', 'recon', 'sketch'].every(id => real.styles.some(s => s.id === id && ['built', 'not built', 'broken'].includes(s.state))),
      'the real paint index (or its absence): the four styles with a state', real);
    console.log('note: real paint styles: ' + (real && real.styles ? real.styles.map(s => s.id + ' ' + s.state).join(', ') : 'none')); }

  // ================= the part =================
  // ---- RMT ----
  { const L0 = load(), R = stubV(L0, { q: { rmt: true } }); L0.part.init(R.V);
    ok(R.panels.length === 0 && R.calls.length === 0 && Object.keys(R.on).length === 0, 'RMT: no panel, no listener, no call'); }

  // ---- the panel, the select from GET styles ----
  const A = start();
  { ok(A.panels.length === 1 && A.panels[0].id === 'style' && A.panels[0].side === 'right', 'one panel, id style, right side');
    const ids = ['mv.style.title', 'mv.style.switch', 'mv.style.pick', 'mv.style.opts', 'mv.style.status'];
    ok(ids.every(id => blk(A, id) && blk(A, id).getAttribute('data-blkname')), 'blocks title, switch, pick, opts, status, each with a block name', ids.filter(id => !blk(A, id)));
    ok(A.calls.length === 0 && A.jobs.length === 0, 'building makes no call');
    ok(sw(A) && sw(A).checked === false, 'the Artistic switch is off at page open');
    await live(A);
    ok(A.calls.filter(c => c.p === 'styles').length === 1 && A.calls[0].m === 'GET', 'refresh: GET styles once');
    await live(A);
    ok(A.calls.filter(c => c.p === 'styles').length === 1, 'a second refresh does not ask the styles again');
    const s = sel(A)[0], opts = s.children.filter(c => c.tagName === 'OPTION');
    ok(opts.map(o => o.value).join() === 'staff,painted,recon,sketch', 'seeded: the select holds the four styles, the unknown id is ignored', opts.map(o => o.value));
    ok(opts[1].disabled && opts[2].disabled && !opts[0].disabled && !opts[3].disabled, 'painted (not built) and recon (broken) are disabled options');
    ok(opts[1].textContent === fill(en('mapviz.style.notBuilt'), { name: en('mapviz.style.name.painted') }) && opts[2].textContent === fill(en('mapviz.style.broken'), { name: en('mapviz.style.name.recon') }),
      'option words: not built yet, broken', opts.map(o => o.textContent));
    ok(s.value === 'staff', 'default style: Staff map');
    ok(statusText(A) === en('mapviz.style.off'), 'status while off', statusText(A));
    ok(picCalls(A).length === 0 && picEmits(A).length === 0, 'off: no GET pictures, no picture event');
    const sizes = sel(A)[1].children.map(o => o.value);
    ok(sizes.join() === '1024,2048,4096' && sel(A)[1].value === '2048', 'sizes 1024, 2048 (default), 4096', sizes); }

  // ---- a refused pick ----
  { const s = sel(A)[0]; s.value = 'painted'; s.fire('change'); await H.flush();
    ok(s.value === 'staff' && picEmits(A).length === 0, 'seeded: a pick of a style that is not built is refused, the select keeps staff', s.value);
    ok(statusText(A) === fill(en('mapviz.style.refused'), { name: en('mapviz.style.name.painted') }), 'the refusal is said', statusText(A));
    s.value = 'recon'; s.fire('change'); await H.flush();
    ok(s.value === 'staff', 'seeded: a broken style is refused too'); }

  // ---- switch on, Make once, made ----
  { let made = false;
    A.pictures = qq => pics([made ? item(qq.bases, 'made', { size: qq.size }) : item(qq.bases, 'need', { size: qq.size })], qq);
    const d1 = deferred(); A.job = () => d1.p;
    await turnOn(A);
    ok(JSON.stringify(picEmits(A).pop()) === JSON.stringify({ base: 'staff', size: 2048, from: 'style' }), 'switch on: picture {base staff, size 2048, from style}', picEmits(A));
    const pc = picCalls(A)[0];
    ok(pc && pc.m === 'GET' && pc.b.bases === 'staff' && pc.b.size === 2048 && pc.b.target === 'mowas2' && pc.b.map === MAP && pc.b.mode === 'battle_zones' && pc.b.game === '<game>', 'GET pictures bases=staff size 2048 with target, game, map and mode', pc);
    ok(pc && pc.raw && ['target', 'game', 'modDir', 'map', 'mode'].every(k => !(k in pc.raw)), 'the part sends bases and size only; the shell adds the context (QCOM pictures:1)', pc && pc.raw);
    ok(/QCOM=\{[^}]*\bpictures:1\b/.test(SHELL), 'the shell QCOM holds pictures:1');
    ok(statusText(A).indexOf(fill(en('mapviz.style.notMade'), { name: en('mapviz.style.name.staff') })) === 0, 'not made: status and Make', statusText(A));
    const btn = blk(A, 'mv.style.status').all().find(e => e.tagName === 'BUTTON');
    ok(btn && btn.textContent === en('mapviz.style.make'), 'a Make button');
    btn.click(); await H.flush();
    ok(A.jobs.length === 1 && A.jobs[0].w === 'staff' && A.jobs[0].a.size === 2048 && A.jobs[0].a.mode === 'battle_zones', 'Make posts the staff job, size 2048', A.jobs);
    btn.click(); await H.flush();
    ok(A.jobs.length === 1, 'seeded: a second press before the job is on the page posts nothing (the entry is making)', A.jobs.length);
    A.q.jobs = [{ id: 'j1', what: 'staff', state: 'running', target: 'mowas2', map: MAP, args: { map: MAP, mode: 'battle_zones', size: 2048 }, text: 'Staff map: drawing 1/3' }];
    A.V.emit('job', A.q.jobs[0]);
    btn.click(); await H.flush();
    ok(A.jobs.length === 1, 'a second press posts nothing', A.jobs.length);
    ok(statusText(A) === fill(en('mapviz.style.making'), { job: 'Staff map: drawing 1/3' }), 'the job words show in place of the button', statusText(A));
    made = true; A.q.jobs = []; d1.res({ state: 'done' }); await H.flush();
    ok(statusText(A) === fill(en('mapviz.style.shown'), { name: en('mapviz.style.name.staff'), w: 256, h: 188 }), 'job done: asked again, made and shown', statusText(A));
    ok(picCalls(A).length === 2, 'one more GET pictures after the job', picCalls(A).length);
    ok(picEmits(A).length === 2 && picEmits(A)[1].base === 'staff', 'the picture is said again after the job, so pictures draws it'); }

  // ---- pick sketch while on, size change, switch off ----
  { const n0 = picEmits(A).length, s = sel(A)[0]; s.value = 'sketch'; s.fire('change'); await H.flush();
    ok(picEmits(A).length === n0 + 1 && picEmits(A).pop().base === 'sketch', 'pick while on: picture sketch');
    ok(picCalls(A).pop().b.bases === 'sketch', 'the status asks the sketch picture');
    const z = sel(A)[1]; z.value = '4096'; z.fire('change'); await H.flush();
    ok(JSON.stringify(picEmits(A).pop()) === JSON.stringify({ base: 'sketch', size: 4096, from: 'style' }) && picCalls(A).pop().b.size === 4096, 'size change while on: picture and GET at 4096');
    z.value = '2048'; z.fire('change'); await H.flush();
    const s2 = sw(A); s2.checked = false; s2.fire('change'); await H.flush();
    ok(JSON.stringify(picEmits(A).pop()) === JSON.stringify({ base: null, size: null, from: 'style' }), 'switch off: picture {base null, from style}');
    ok(statusText(A) === en('mapviz.style.off'), 'status off again'); }

  // ---- a picture event from pictures with a base that is not a style turns the switch off, no emit back ----
  { await turnOn(A); const n0 = picEmits(A).length;
    A.V.emit('picture', { base: 'l1', size: null, from: 'pictures' }); await H.flush();
    const mine = A.emits.slice(-1)[0];
    ok(sw(A).checked === false && picEmits(A).length === n0 + 1 && mine.d.from === 'pictures', 'picture l1 from pictures: the switch goes off, style emits nothing back', A.emits.slice(-2));
    A.V.emit('picture', { base: 'staff', size: 1024, from: 'pictures' }); await H.flush();
    ok(sw(A).checked === true && sel(A)[0].value === 'staff' && sel(A)[1].value === '1024' && picEmits(A).length === n0 + 2, 'picture staff from pictures: the switch follows it (on, staff, 1024), no emit back');
    A.V.emit('picture', { base: 'painted', size: null, from: 'pictures' }); await H.flush();
    ok(sw(A).checked === false, 'picture of a style that is not built: switch off'); }

  // ---- painted quick look: 1024 then 2048 on one press; the second only after the first ended done ----
  { const B = start({ styles: STY_ALL }); await live(B);
    const d1 = deferred(), d2 = deferred(); let n = 0; B.job = () => (n++ === 0 ? d1.p : d2.p);
    await turnOn(B); const s = sel(B)[0]; s.value = 'painted'; s.fire('change'); await H.flush();
    const q = blk(B, 'mv.style.opts').all().find(e => e.tagName === 'INPUT');
    ok(q && q.checked === true && blk(B, 'mv.style.opts').textContent.indexOf(en('mapviz.style.quick')) >= 0, 'painted: the quick look tick, on by default');
    blk(B, 'mv.style.status').all().find(e => e.tagName === 'BUTTON').click(); await H.flush();
    ok(B.jobs.length === 1 && B.jobs[0].w === 'painted' && B.jobs[0].a.size === 1024, 'quick look: first job painted 1024', B.jobs);
    ok(statusText(B).indexOf(fill(en('mapviz.style.quickMaking'), { job: '' }).trim()) === 0, 'status: making the quick look', statusText(B));
    d1.res({ state: 'done' }); await H.flush();
    ok(B.jobs.length === 2 && B.jobs[1].a.size === 2048, 'after the first ended done: second job painted 2048', B.jobs);
    ok(picEmits(B).some(p => p.base === 'painted' && p.size === 1024), 'the quick look is shown while the full size is made');
    d2.res({ state: 'done' }); await H.flush();
    ok(picEmits(B).pop().size === 2048, 'full size done: the picture is said at 2048');
    // a failed first posts nothing more
    const C = start({ styles: STY_ALL }); await live(C); C.job = () => Promise.reject(Object.assign(new Error('MV_FAULT'), { key: 'mapviz.err.MV_FAULT', params: { msg: 'boom' } }));
    await turnOn(C); const s3 = sel(C)[0]; s3.value = 'painted'; s3.fire('change'); await H.flush();
    blk(C, 'mv.style.status').all().find(e => e.tagName === 'BUTTON').click(); await H.flush(); await H.flush();
    ok(C.jobs.length === 1, 'seeded: a failed first job posts nothing more', C.jobs.length);
    ok(statusText(C).indexOf(fill(en('mapviz.style.failed'), { msg: '' }).trim()) === 0, 'the failure is said', statusText(C));
    // quick look off: one job at the asked size
    const D = start({ styles: STY_ALL }); await live(D); await turnOn(D); const s4 = sel(D)[0]; s4.value = 'painted'; s4.fire('change'); await H.flush();
    const q4 = blk(D, 'mv.style.opts').all().find(e => e.tagName === 'INPUT'); q4.checked = false; q4.fire('change');
    blk(D, 'mv.style.status').all().find(e => e.tagName === 'BUTTON').click(); await H.flush();
    ok(D.jobs.length === 1 && D.jobs[0].a.size === 2048, 'quick look off: one job at 2048', D.jobs); }

  // ---- recon: made from, approximate ----
  { const B = start({ styles: STY_ALL, pictures: qq => pics([item(qq.bases, 'made', { side: { rung: 'l2', base: { from: 'l2', approx: true } } })], qq) });
    await live(B); await turnOn(B); const s = sel(B)[0]; s.value = 'recon'; s.fire('change'); await H.flush();
    const t = blk(B, 'mv.style.opts').textContent;
    ok(t.indexOf(fill(en('mapviz.style.madeFrom'), { rung: en('mapviz.style.from.l2') })) >= 0 && t.indexOf(en('mapviz.style.approx')) >= 0, 'recon: made from l2, approximate', t);
    ok(t.indexOf(en('mapviz.style.about.recon')) >= 0, 'the style says what it is'); }

  // ---- paint not built: switch disabled, hint ----
  { const B = start({ styles: STY_NONE }); await live(B);
    ok(sw(B).disabled === true && blk(B, 'mv.style.switch').textContent.indexOf(en('mapviz.style.noPaint')) >= 0, 'paint not built: switch disabled with the hint');
    await turnOn(B);
    ok(picEmits(B).every(p => p.base === null) && picCalls(B).length === 0 && sw(B).checked === false, 'paint not built: switching on is refused, nothing asked'); }

  // ---- a row with no state is not built ----
  { const B = start({ styles: { v: 1, styles: [srow('staff', 'built'), { id: 'sketch' }] } }); await live(B);
    const o = sel(B)[0].children.filter(c => c.tagName === 'OPTION');
    ok(o.length === 2 && o[1].value === 'sketch' && o[1].disabled, 'seeded: a style row without state is taken as not built', o.map(x => x.value + (x.disabled ? '-' : '+'))); }

  // ---- GET styles fails: the switch stays disabled, the failure is said ----
  { const B = start({ styles: () => Promise.reject(Object.assign(new Error('MV_FAULT'), { status: 500, key: 'mapviz.err.MV_FAULT', params: { msg: 'down' } })) }); await live(B);
    ok(sw(B).disabled === true && statusText(B).indexOf(fill(en('mapviz.style.failed'), { msg: '' }).trim()) === 0, 'GET styles failed: switch disabled, failure said', statusText(B)); }

  // ---- route answers: 404 with no need (route not there yet), 501, error ----
  for (const [what, e, k] of [['404 no need', Object.assign(new Error('no route'), { status: 404 }), 'mapviz.style.notAvail'],
    ['501', Object.assign(new Error('MV_NOT_BUILT'), { status: 501, key: 'mapviz.err.MV_NOT_BUILT', params: { msg: 'x' } }), 'mapviz.style.itemNotBuilt']]) {
    const B = start({ pictures: () => { throw e; } }); await live(B); await turnOn(B);
    ok(statusText(B) === fill(en(k), { name: en('mapviz.style.name.staff') }), 'GET pictures ' + what + ': ' + k, statusText(B)); }
  { const B = start({ pictures: qq => pics([item('topo', 'made')], qq) }); await live(B); await turnOn(B);
    ok(statusText(B) === en('mapviz.style.notAvail'), 'seeded: an answer without the asked base: not available', statusText(B)); }
  { const B = start({ pictures: qq => pics([item(qq.bases, 'notBuilt')], qq) }); await live(B); await turnOn(B);
    ok(statusText(B) === fill(en('mapviz.style.itemNotBuilt'), { name: en('mapviz.style.name.staff') }), 'item notBuilt: not built yet', statusText(B)); }

  // ---- stale: ask once more at once; a second stale leaves no status ----
  { let n = 0; const stale = () => Promise.reject(Object.assign(new Error('MV_CANCELLED'), { stale: true, key: 'mapviz.err.MV_CANCELLED', params: {} }));
    const B = start({ pictures: qq => (n++ === 0 ? stale() : pics([item(qq.bases, 'made')], qq)) }); await live(B); await turnOn(B);
    ok(n === 2 && statusText(B).indexOf(en('mapviz.style.name.staff')) > 0, 'a stale answer: asked once more at once', { n, s: statusText(B) });
    let m = 0; const C = start({ pictures: () => { m++; return stale(); } }); await live(C); await turnOn(C);
    ok(m === 2 && statusText(C) === '', 'two stale answers: no status, no third ask', { m, s: statusText(C) }); }

  // ---- docBusy: no GET pictures (it carries the mode) until the doc event ----
  { const B = start({ q: { docBusy: true, mode: null } }); await live(B); await turnOn(B);
    ok(picCalls(B).length === 0, 'document being read: no GET pictures');
    B.q.docBusy = false; B.q.mode = 'combat'; B.V.emit('doc', { key: MAP, ok: true }); await H.flush();
    ok(picCalls(B).length === 1 && picCalls(B)[0].b.mode === 'combat', 'doc event: asked once, with the mode', picCalls(B)); }

  // ---- context change and products ----
  { const B = start(); await live(B); await turnOn(B);
    ok(picCalls(B).length === 1, 'context: one ask');
    B.V.emit('products', {}); await H.flush();
    ok(picCalls(B).length === 2, 'products: a not made entry asks once again');
    B.q.jobs = [{ id: 'j9', what: 'staff', state: 'running', target: 'mowas2', map: MAP, args: { map: MAP, mode: 'battle_zones', size: 2048 }, text: 'w' }];
    B.V.emit('products', {}); await H.flush();
    ok(picCalls(B).length === 2, 'products: not while its own job runs');
    B.q.jobs = [];
    B.q.map = 'multi/other'; B.V.emit('map', { key: 'multi/other', mode: 'battle_zones', doc: {} }); await H.flush();
    ok(picCalls(B).length === 3 && picCalls(B)[2].b.map === 'multi/other', 'another map: dropped and asked for the new key', picCalls(B).map(c => c.b.map));
    B.q.map = null; B.V.emit('map', { key: null }); await H.flush();
    ok(picCalls(B).length === 3 && statusText(B) === en('mapviz.style.noMap'), 'map closed: no ask, the status says open a map', statusText(B));
    B.q.map = MAP; B.q.mod = 'my_mod'; B.V.emit('map', { key: MAP, mode: 'battle_zones', doc: {} }); await H.flush();
    ok(picCalls(B).length === 4 && picCalls(B)[3].b.modDir === 'my_mod', 'the same map in another mod: a new key, asked with the mod', picCalls(B)[3]); }

  // ---- a context change with the switch on: the picture is said again (the pictures part dropped its shown one) ----
  { const B = start({ pictures: qq => pics([item(qq.bases, 'made', { size: qq.size })], qq) }); await live(B); await turnOn(B);
    const shownT = () => fill(en('mapviz.style.shown'), { name: en('mapviz.style.name.staff'), w: 256, h: 188 });
    let n0 = picEmits(B).length;
    B.V.emit('map', { key: MAP, mode: 'battle_zones', doc: {} }); await H.flush();
    ok(picEmits(B).length === n0, 'the same context again: no new picture event', picEmits(B).length - n0);
    B.q.mod = 'othermod'; B.V.emit('map', { key: MAP, mode: 'battle_zones', doc: {} }); await H.flush();
    ok(picEmits(B).length === n0 + 1 && JSON.stringify(picEmits(B).pop()) === JSON.stringify({ base: 'staff', size: 2048, from: 'style' }) && statusText(B) === shownT(),
      'seeded: another mod with the switch on: picture staff said again, shown', { n: picEmits(B).length - n0, s: statusText(B) });
    n0 = picEmits(B).length; B.q.map = null; B.V.emit('map', { key: null }); await H.flush();
    ok(picEmits(B).length === n0, 'map closed: no picture event');
    B.q.map = 'multi/other'; B.V.emit('map', { key: 'multi/other', mode: 'battle_zones', doc: {} }); await H.flush();
    ok(picEmits(B).length === n0 + 1 && picEmits(B).pop().base === 'staff' && picCalls(B).pop().b.map === 'multi/other' && statusText(B) === shownT(),
      'seeded: another map opened: picture said again, asked for the new map', statusText(B));
    n0 = picEmits(B).length; B.q.mode = 'combat'; B.V.emit('doc', { key: 'multi/other', ok: true }); await H.flush();
    ok(picEmits(B).length === n0 + 1 && picEmits(B).pop().base === 'staff' && picCalls(B).pop().b.mode === 'combat', 'seeded: another mode: picture said again, asked with the mode', picEmits(B).length - n0);
    n0 = picEmits(B).length; B.q.game = '<game2>'; B.V.emit('refresh', {}); await H.flush();
    ok(picEmits(B).length === n0 + 1, 'another game folder on refresh: picture said again');
    const s = sw(B); s.checked = false; s.fire('change'); await H.flush(); n0 = picEmits(B).length;
    B.q.mod = 'third'; B.V.emit('map', { key: 'multi/other', mode: 'combat', doc: {} }); await H.flush();
    ok(picEmits(B).length === n0, 'switch off: a context change says nothing'); }

  // ---- GET pictures fails: products, refresh and a switch off and on ask again ----
  for (const how of ['products', 'refresh', 'switch']) {
    let n = 0; const B = start({ pictures: qq => (n++ === 0 ? Promise.reject(Object.assign(new Error('boom'), { status: 500 })) : pics([item(qq.bases, 'made', { size: qq.size })], qq)) });
    await live(B); await turnOn(B);
    ok(statusText(B) === fill(en('mapviz.style.failed'), { msg: 'boom' }), how + ': the failure is said', statusText(B));
    if (how === 'products') B.V.emit('products', {}); else if (how === 'refresh') B.V.emit('refresh', {});
    else { const s = sw(B); s.checked = false; s.fire('change'); await H.flush(); s.checked = true; s.fire('change'); }
    await H.flush();
    ok(picCalls(B).length === 2 && statusText(B) === fill(en('mapviz.style.shown'), { name: en('mapviz.style.name.staff'), w: 256, h: 188 }),
      'seeded: a failed GET pictures is asked again on ' + how, { n: picCalls(B).length, s: statusText(B) }); }

  // ---- a failed Make keeps the Make button; a second press posts a second job ----
  { let n = 0; const B = start({ job: () => (n++ === 0 ? Promise.reject(Object.assign(new Error('job failed'), { status: 500 })) : Promise.resolve({ state: 'done' })) });
    await live(B); await turnOn(B);
    blk(B, 'mv.style.status').all().find(e => e.tagName === 'BUTTON').click(); await H.flush();
    const b2 = blk(B, 'mv.style.status').all().find(e => e.tagName === 'BUTTON');
    ok(B.jobs.length === 1 && statusText(B).indexOf(fill(en('mapviz.style.failed'), { msg: 'job failed' })) === 0 && b2 && b2.textContent === en('mapviz.style.make'),
      'seeded: a failed Make says the failure and keeps the Make button', statusText(B));
    b2.click(); await H.flush();
    ok(B.jobs.length === 2, 'seeded: a press after the failure posts the job again', B.jobs.length); }

  // ---- GET styles stale twice: quiet, and the next refresh asks again with a fresh count ----
  { let n = 0; const stale = () => Promise.reject(Object.assign(new Error('MV_CANCELLED'), { stale: true, key: 'mapviz.err.MV_CANCELLED', params: {} }));
    const B = start({ styles: () => (++n <= 3 ? stale() : Promise.resolve(clone(STY_MIX))) }); await live(B);
    ok(n === 2 && statusText(B) === '', 'seeded: two stale styles answers: no reading words, no third ask', { n, s: statusText(B) });
    await live(B);
    ok(n === 4 && sel(B)[0].value === 'staff' && sel(B)[0].children.length === 4, 'seeded: the next refresh starts a fresh count (stale once, asked once more, listed)', { n, s: statusText(B) }); }

  // ---- late F11: the size kit of the pictures part (on the page, part order pictures before style) ----
  { const LK = H.mergeLang([require('./shell.lang.json'), LS, require('./pictures.lang.json')]);
    const SZ = require(path.join(ROOT, 'previews/sizes')), BOX = [-2000, -1000, 2000, 1000];
    const TG = { v: 1, rows: [{ id: 'preview', state: 'write', size: [1920, 1080] }, { id: 'small', state: 'none', size: [400, 300] }, { id: 'header', state: 'write', size: [960, 256] }] };
    const B = start({ kit: true, lang: LK, styles: STY_ALL, more: { 'previews/targets': TG }, pictures: qq => pics([item(qq.bases, 'made', { size: qq.size })], qq) });
    B.V.doc = { boxes: { world: BOX } };
    await live(B); await turnOn(B); B.V.emit('doc', { key: MAP, ok: true }); await H.flush();
    const zs = sel(B)[1];
    ok(zs && zs.children.map(c => c.value).join() === '1024,2048,4096,use:preview,use:header,custom' && zs.value === '2048', 'kit: sizes 1024, 2048 (default), 4096, the game uses of the map, custom', zs && zs.children.map(c => c.value));
    zs.value = 'use:preview'; zs.fire('change'); await H.flush();
    const L1 = SZ.longSide(BOX, 1920, 1080, 'stretch');
    ok(JSON.stringify(picEmits(B).pop()) === JSON.stringify({ base: 'staff', size: L1, from: 'style' }) && picCalls(B).pop().b.size === L1, 'kit: the loading screen use draws the style at its long side ' + L1, [picEmits(B).slice(-1), picCalls(B).slice(-1)]);
    zs.value = 'custom'; zs.fire('change'); await H.flush();
    const ins = blk(B, 'mv.style.pick').all().filter(e => e.tagName === 'INPUT');
    ins[0].value = '9000'; ins[0].fire('change'); await H.flush();
    const words = blk(B, 'mv.style.pick').all().find(e => e.tagName === 'P');
    ok(words && words.textContent.indexOf(fill(LK.en['mapviz.pictures.badBig'], { side: 'width', n: 8192 })) >= 0, 'kit custom 9000: plain words in the style panel', words && words.textContent);
    ins[0].value = '1000'; ins[0].fire('change'); await H.flush();
    ok(ins[1].value === '500' && picCalls(B).pop().b.size === SZ.longSide(BOX, 1000, 500, 'stretch'), 'kit custom 1000: keep the shape gives 500, the style is drawn at its long side', [ins[1].value, picCalls(B).slice(-1)]);
    zs.value = '4096'; zs.fire('change'); await H.flush();
    ok(picEmits(B).pop().size === 4096, 'kit: back to a preset 4096'); }
  // ---- the three games: the same styles, options, blocks, sizes, ticks and requests ----
  for (const t of ['as64', 'mowas2', 'goh']) {
    const from = t === 'goh' ? 'l1' : 'minimap', mode = t === 'goh' ? null : 'battle_zones';
    const B = start({ q: { target: t, mode }, styles: STY_ALL, pictures: qq => pics([item(qq.bases, 'made', { size: qq.size, side: { base: { from, approx: false } } })], qq) });
    await live(B); await turnOn(B);
    const o = sel(B)[0].children.filter(c => c.tagName === 'OPTION' && !c.disabled).map(c => c.value).join();
    ok(o === 'staff,painted,recon,sketch' && picEmits(B).pop().base === 'staff' && picCalls(B)[0].b.target === t && picCalls(B)[0].b.mode === mode, t + ': four styles, staff default, the same request', o);
    ok(['mv.style.title', 'mv.style.switch', 'mv.style.pick', 'mv.style.opts', 'mv.style.status'].every(id => blk(B, id)), t + ': the five blocks');
    ok(sel(B)[1].children.map(c => c.value).join() === '1024,2048,4096', t + ': sizes 1024, 2048, 4096');
    const s = sel(B)[0]; s.value = 'painted'; s.fire('change'); await H.flush();
    ok(blk(B, 'mv.style.opts').all().filter(e => e.tagName === 'INPUT' && e.getAttribute('type') === 'checkbox').length === 1, t + ': painted shows one tick');
    s.value = 'recon'; s.fire('change'); await H.flush();
    ok(blk(B, 'mv.style.opts').textContent.indexOf(fill(en('mapviz.style.madeFrom'), { rung: en('mapviz.style.from.' + from) })) >= 0, t + ': recon says what it was made from (' + from + ')', blk(B, 'mv.style.opts').textContent); }

  // ---- the part on the real shell: GET styles on refresh, no job, no write ----
  { const calls = [];
    SRV._t.use({ paint: { STYLES: ['staff', 'painted', 'recon', 'sketch'], styles: { list: () => STY_MIX.styles.slice(0, 4) } } });
    const routes = Object.assign({
      'GET /api/x/mapviz/palette': async () => PAL,
      'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
      'GET /api/x/mapviz/maps': async () => ({ v: 1, maps: [] }),
      'GET /api/x/mapviz/parts': async () => ({ v: 1, parts: [], styles: [] }),
    }, SRV.routes);
    const S = { gameId: 'goh', gameOv: '<game>', mod: '', mapKey: '' };
    const P = H.mkPage({ scripts: [SHELL, PART], lang: L, S, canvas: false, api: H.routeApi(routes, calls) });
    let err = null; try { P.screen.refresh(); await H.flush(60); } catch (e) { err = e.message; }
    const b = H.blk(P.root, 'mv.style.pick');
    const so = b ? b.all().find(e => e.tagName === 'SELECT').children.filter(e => e.tagName === 'OPTION') : [];
    ok(!err && so.length === 4 && so[0].value === 'staff' && so[1].disabled && so[2].disabled, 'shell: the style panel builds and lists the four styles', { err, b: !!b, n: so.length });
    ok(calls.some(c => c.path === '/api/x/mapviz/styles') && calls.every(c => c.method === 'GET'), 'shell: GET styles, GET only, no job', calls.map(c => c.method + ' ' + c.path));
    SRV._t.reset();
    const C3 = [], P3 = H.mkPage({ scripts: [SHELL, PART], lang: L, S: Object.assign({}, S), canvas: false, rmt: true, api: H.routeApi(routes, C3) });
    try { P3.screen && P3.screen.refresh && P3.screen.refresh(); await H.flush(10); } catch (e) { err = e.message; }
    ok(!err && C3.length === 0, 'shell on RMT: no call', C3); }

  // ---- language ----
  const codes = ['en', 'ru', 'uk', 'zh'];
  function langProblems(LW) {
    const SRC = String(PART), used = new Set(), out = [];
    for (const m of SRC.matchAll(/'(mapviz\.style\.[A-Za-z0-9_.]*[A-Za-z0-9_])'/g)) used.add(m[1]);
    for (const id of ['staff', 'painted', 'recon', 'sketch']) { used.add('mapviz.style.name.' + id); used.add('mapviz.style.about.' + id); }
    for (const r of ['l4', 'l3', 'l2', 'l1', 'edshot', 'minimap', 'l0']) used.add('mapviz.style.from.' + r);
    if (Object.keys(LW).sort().join() !== codes.slice().sort().join()) out.push('languages ' + Object.keys(LW).join());
    for (const k of used) for (const c of codes) if (!(LW[c] && LW[c][k])) out.push(c + ' missing ' + k);
    for (const k of Object.keys(LW.en || {})) if (!used.has(k)) out.push('unused ' + k);
    const slots = s => (String(s).match(/\{\w+\}/g) || []).sort().join();
    for (const c of codes) for (const k of Object.keys(LW[c] || {})) { const v = LW[c][k];
      if (!/^mapviz\.style\./.test(k)) out.push(c + ' prefix ' + k);
      if (/^TODO:/.test(v) || v.indexOf(String.fromCharCode(8212)) >= 0 || / - /.test(v) || /\bas64\b/i.test(v) && !/AS64/.test(v)) out.push(c + ' text ' + k);
      if (slots(v) !== slots(LW.en[k])) out.push(c + ' slots ' + k); if (!(k in LW.en)) out.push(c + ' extra ' + k);
      if (c !== 'en' && k.indexOf('.name.') > 0 && v === LW.en[k]) out.push(c + ' untranslated ' + k); }
    return out;
  }
  { const p = langProblems(LS);
    ok(!p.length, 'lang: four languages, every key used is there, every key is used, same slots, no TODO, no dash', p.join(', '));
    const bad = clone(LS); delete bad.zh['mapviz.style.name.painted'];
    ok(langProblems(bad).some(x => x === 'zh missing mapviz.style.name.painted'), 'seeded: a lang file missing one zh name is caught');
    ok(['staff', 'painted', 'recon', 'sketch'].map(id => LS.en['mapviz.style.name.' + id]).join() === 'Staff map,Painted relief,Recon photo,Field sketch', 'en names as the draft');
    const Z = start({ code: 'zh' }); await live(Z);
    ok(Z.box().textContent.indexOf(LS.zh['mapviz.style.title']) >= 0 && sel(Z)[0].children[0].textContent === LS.zh['mapviz.style.name.staff'], 'lang: the panel speaks Chinese'); }

  // ---- script rules (the page test checks them too) ----
  { const s = String(PART);
    ok(s.indexOf(String.fromCharCode(96)) < 0 && s.indexOf('$' + '{') < 0 && !/innerHTML|outerHTML|insertAdjacentHTML/.test(s), 'client: no backtick, no dollar-brace, no HTML writes');
    ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(s), 'client: no colour literal');
    ok(!/target\s*===?\s*'(as64|mowas2|goh)'/.test(s), 'client: no game branch on the target');
    for (const f of ['style.client.js', 'style.server.js', 'style.lang.json', 'style.test.js']) {
      const t = fs.readFileSync(path.join(__dirname, f), 'utf8');
      ok(!t.includes('\r') && !/[^\x00-\x7f]/.test(t), f + ': ASCII with LF'); } }

  SRV._t.reset();
  if (OWN) try { fs.rmSync(SCR, { recursive: true, force: true }); } catch (e) {}
  if (failN) { console.log('FAIL mapviz style: ' + failN + ' failed, ' + pass + ' passed'); process.exit(1); }
  console.log('PASS mapviz style (' + pass + ')');
})().catch(e => { console.log('FAIL mapviz style: ' + (e && e.stack || e)); process.exit(1); });
