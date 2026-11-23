// recipe "make a release" test: node release.test.js <scratch>. A small mod is built in the scratch folder; the recipe's check route
// makes the new mod.info and picture in the task's staging folder and runs the Share page's release check (deep check off: no game
// read); the plan runs the share package and Workshop routes in their dry mode only (nothing packed, copied or uploaded); then the kit
// checks the recipe, strings, census coverage, compile, a plan that writes nothing, and the write of mod.info and the picture (no
// share route call in that fixture). Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-b281489a)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const R = require('./release.recipe'), L = require('./release.lang'), CL = require('./release.client'), ST = require('./upgrade.recipe').ST;
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-release-')));
const mod = path.join(scratch, 'mods', 'release_test'), out = path.join(scratch, 'release-out');
for (const d of [mod, mod + '.arsenal-undo', out]) fs.rmSync(d, { recursive: true, force: true });
fs.mkdirSync(path.join(mod, 'localization'), { recursive: true });
fs.writeFileSync(path.join(mod, 'mod.info'), '{mod\r\n\t{Name "Release Test"}\r\n\t{Desc "old text"}\r\n\t{Version "1.2"}\r\n\t{MinGameVersion "3.301"}\r\n}\r\n');
fs.writeFileSync(path.join(mod, 'localization', 'release_test.lng'), '﻿{desc\r\n}\r\n');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]);
const tree = d => { const h = crypto.createHash('sha1'); for (const r of ST.walk(d)) h.update(r + '\0').update(fs.readFileSync(path.join(d, r))); return h.digest('hex'); };
const game = kit.findGame({});

let bad = 0, good = 0;
const ok = (c, m, x) => { if (c) good++; else { bad++; console.log('FAIL ' + m + (x !== undefined ? '\n  ' + String(x).slice(0, 1200) : '')); } };

(async () => {
  const id = 'release-test-' + crypto.randomBytes(3).toString('hex'), newId = D.newId;
  D.newId = r => (r === 'release' ? id : newId(r));
  const ctx = kit.ctxFor(scratch, { gameDir: game });
  const answers = { name: 'Release Test', desc: 'A small test mod.', range: 'enhanced', version_kind: 'minor', version_note: 'new guns', known_name: '', deep: false, package: true, workshop_copy: true, out, card: { mods: ['release_test'] } };
  const draft = { id, recipe: 'release', verb: 'make', game: 'as64', mod, base: null, answers: {}, kept: [], state: 'open' };
  for (const [k, v] of Object.entries(answers)) draft.answers[k] = { src: 'value', value: v };
  draft.answers.preview = { src: 'file', staged: ['pic.png'] };
  D.save(ctx, draft);
  fs.mkdirSync(D.stageDir(ctx, id), { recursive: true });
  fs.writeFileSync(D.stagedPath(ctx, id, 'pic.png'), PNG);
  const check = R.routes['POST /api/x/task/r/release/check'];
  const before = tree(mod);

  // values: read from mod.info
  const v = await R.values(Object.assign({}, ctx, { mod }));
  ok(v.name === 'Release Test' && v.version === '1.2' && v.range === 'enhanced' && v.card.mods[0] === 'release_test', 'values come from the mod.info', JSON.stringify(v));
  // game parity: values hands opt.game to the Share info route (shareCtx), MoW:AS2 and AS64 each
  { const SR = require('../../share/routes').routes, k = 'GET /api/x/share/info', orig = SR[k], seen = [];
    SR[k] = (u, b, c) => { seen.push(c && typeof c.gameId === 'function' ? c.gameId() : '?'); return orig(u, b, c); };
    let v2 = null, v64 = null;
    try { v2 = await R.values(Object.assign({}, ctx, { mod }), null, { game: 'mowas2' }); v64 = await R.values(Object.assign({}, ctx, { mod }), null, { game: 'as64' }); } finally { SR[k] = orig; }
    ok(seen.join() === 'mowas2,as64' && v2.name === 'Release Test' && v64.name === 'Release Test', 'values: the Share info route gets the task game (mowas2, then as64)', seen.join()); }

  let why = null; try { await check(null, { draft }, Object.assign({}, ctx, { session: { remote: true } })); } catch (e) { why = e; }
  ok(why && why.status === 403, 'check refuses LAN Remote', why && why.message);
  why = null; try { await check(null, { draft: Object.assign({}, draft, { id: 'release-not-saved' }) }, ctx); } catch (e) { why = e; }
  ok(why && why.status === 404, 'check refuses a task that is not saved', why && why.message);
  const nn = JSON.parse(JSON.stringify(draft)); nn.answers.name = { src: 'value', value: '' };
  why = null; try { await check(null, { draft: nn }, ctx); } catch (e) { why = e; }
  ok(why && /name of the mod/.test(why.message), 'an empty name is refused in plain words', why && why.message);
  const bv = JSON.parse(JSON.stringify(draft)); bv.answers.version_kind = { src: 'value', value: 'set' }; bv.answers.version = { src: 'value', value: 'v2' };
  why = null; try { await check(null, { draft: bv }, ctx); } catch (e) { why = e; }
  ok(why && /numbers with dots/.test(why.message), 'a version that is not numbers is refused', why && why.message);
  // JOBS: after the footer's Cancel the check asks the Share routes nothing more and stages nothing
  { const sr = await check(null, { draft }, Object.assign({}, ctx, { job: { cancelled: true } }));
    ok(sr && sr.stopped === true && sr.ok === false && !fs.existsSync(path.join(D.stageDir(ctx, id), 'rl-map.json')) && !fs.existsSync(path.join(D.stageDir(ctx, id), 'rl-work')) && tree(mod) === before, 'a stopped check stages nothing and writes nothing', JSON.stringify(sr)); }

  // an older preview.jpg would win over the new png: a red line
  fs.writeFileSync(path.join(mod, 'preview.jpg'), JPG);
  let r = await check(null, { draft }, ctx);
  ok(r.ok && !r.ready && r.items.some(x => x.id === 'previewOld' && x.status === 'fail'), 'an older picture that would win stops the release', JSON.stringify(r.items));
  draft.answers.gate = { src: 'value', value: { sig: r.sig, ready: false } }; D.save(ctx, draft);
  why = null; try { await CP.compile(ctx, D.load(ctx, id), { release: R }); } catch (e) { why = e; }
  ok(why && /red lines \(1\)\. Go back .*button/.test(why.message), 'compile refuses while the check has a red line and says where the way out is', why && why.message);
  fs.unlinkSync(path.join(mod, 'preview.jpg'));
  // Gates of Hell files: a red line
  fs.writeFileSync(path.join(mod, 'GOH-ORIGIN.tsv'), 'file\tfrom\r\nresource/x\tgoh\r\n');
  r = await check(null, { draft }, ctx);
  ok(r.ok && !r.ready && r.items.some(x => x.id === 'goh' && x.status === 'fail'), 'a mod with Gates of Hell files is not ready', JSON.stringify(r.items.filter(x => x.status !== 'pass')));
  fs.unlinkSync(path.join(mod, 'GOH-ORIGIN.tsv'));

  r = await check(null, { draft }, ctx);
  ok(r.ok && r.ready && r.next === '1.3' && r.old === '1.2', 'the check passes and the version goes 1.2 to 1.3', JSON.stringify(r).slice(0, 1500));
  ok(r.items.some(x => x.id === 'name' && x.status === 'pass') && r.items.some(x => x.id === 'preview' && x.status === 'pass') && r.items.some(x => x.id === 'check' && x.status === 'skip'), 'the items read the new mod.info and picture; the deep check is off', JSON.stringify(r.items));
  ok(/new guns/.test(r.noteText), 'the change note text is made', r.noteText);
  ok(tree(mod) === before, 'the check writes nothing into the mod');
  const map = ST.load(D.stageDir(ctx, id), 'rl');
  ok(map && map.files.map(f => f.rel).sort().join(',') === 'mod.info,preview.png', 'staged: mod.info and preview.png', map && JSON.stringify(map.files));
  const staged = map && fs.readFileSync(D.stagedPath(ctx, id, map.files.find(f => f.rel === 'mod.info').s), 'latin1');
  ok(/\{Version "1\.3"\}/.test(staged) && /\{Desc "A small test mod\."\}/.test(staged) && /\{MinGameVersion "3\.301"\}/.test(staged), 'the staged mod.info has the new version and text', staged);
  draft.answers.gate = { src: 'value', value: { sig: r.sig, ready: true, fails: 0, warns: r.warns, next: r.next } };
  D.save(ctx, draft);

  // plan: the package and Workshop routes in dry mode only
  const p = await CP.plan(ctx, D.load(ctx, id), { release: R });
  ok(!p.errors.length && p.files.some(f => f.rel === 'mod.info') && p.files.some(f => f.rel === 'preview.png'), 'plan lists mod.info and the picture', JSON.stringify(p.errors));
  ok(p.calls.length === 2 && p.calls.every(c => c.kind === 'route' && c.result && c.result.wrote === false), 'plan runs the package and Workshop steps dry', JSON.stringify(p.calls.map(c => [c.route, c.result && c.result.wrote])));
  ok(p.calls[0].result && Array.isArray(p.calls[0].result.plan), 'the package dry run lists its paks', JSON.stringify(p.calls[0].result).slice(0, 600));
  ok(tree(mod) === before && !fs.existsSync(out), 'plan writes nothing (mod unchanged, no package folder)');
  const c1 = await CP.compile(ctx, D.load(ctx, id), { release: R });
  ok(c1.calls.every(c => CP.checkCall(ctx, mod, c) === 'route') && c1.calls[0].body.out === path.join(out, 'package') && c1.calls[1].body.out === path.join(out, 'workshop'), 'compile names only share routes, into separate folders');
  // the package folder may not sit in the mod
  const io = JSON.parse(JSON.stringify(draft)); io.answers.out = { src: 'value', value: path.join(mod, 'pk') }; D.save(ctx, io);
  why = null; try { await CP.compile(ctx, D.load(ctx, id), { release: R }); } catch (e) { why = e; }
  ok(why && /separate/.test(why.message), 'a package folder inside the mod is refused', why && why.message);
  // an answer changed after the check
  const stale = JSON.parse(JSON.stringify(draft)); stale.answers.name = { src: 'value', value: 'Other Name' }; D.save(ctx, stale);
  why = null; try { await CP.compile(ctx, D.load(ctx, id), { release: R }); } catch (e) { why = e; }
  ok(why && /changed after/.test(why.message), 'a name changed after the check is refused', why && why.message);
  // game parity: the Share routes the check and the compile call get the draft's game (shareCtx): MoW:AS2 for a MoW:AS2 task, AS64 as before
  { const SR = require('../../share/routes').routes, seen = [], orig = {};
    for (const k of ['POST /api/x/share/info', 'POST /api/x/share/outcheck']) {
      orig[k] = SR[k]; SR[k] = (u, b, c) => { seen.push(k.slice(k.lastIndexOf('/') + 1) + ':' + (c && typeof c.gameId === 'function' ? c.gameId() : '?')); return orig[k](u, b, c); };
    }
    const runAs = async (game, range) => {
      const g = JSON.parse(JSON.stringify(draft)); g.game = game; g.answers.range = { src: 'value', value: range }; delete g.answers.gate; D.save(ctx, g);
      const rc = await check(null, { draft: g }, ctx);
      g.answers.gate = { src: 'value', value: { sig: rc.sig, ready: rc.ready, fails: rc.fails || 0, warns: rc.warns, next: rc.next } }; D.save(ctx, g);
      let e = null; try { await CP.compile(ctx, D.load(ctx, id), { release: R }); } catch (x) { e = x; }
      return e;
    };
    let e64 = null, e2 = null, s64 = [], s2 = [];
    try { e64 = await runAs('as64', 'enhanced'); s64 = seen.splice(0); e2 = await runAs('mowas2', 'classic'); s2 = seen.splice(0); } finally { Object.assign(SR, orig); D.save(ctx, draft); await check(null, { draft }, ctx); }
    ok(!e64 && s64.includes('info:as64') && s64.includes('outcheck:as64') && s64.every(s => /:as64$/.test(s)), 'AS64 task: the share routes get as64', (e64 && e64.message) + ' ' + s64.join());
    ok(!e2 && s2.includes('info:mowas2') && s2.includes('outcheck:mowas2') && s2.every(s => /:mowas2$/.test(s)), 'MoW:AS2 task: the check and the compile give the share routes mowas2', (e2 && e2.message) + ' ' + s2.join()); }
  // More checks: mods together (read) and the game update check (read); the mods must be installed in the game mods folder
  const fg = path.join(scratch, 'release-fakegame');
  fs.rmSync(fg, { recursive: true, force: true });
  for (const m of ['release_test', 'other_mod']) { fs.mkdirSync(path.join(fg, 'mods', m), { recursive: true }); fs.writeFileSync(path.join(fg, 'mods', m, 'mod.info'), '{mod}\r\n'); }
  const fctx = kit.ctxFor(scratch, { gameDir: fg });
  const mc = JSON.parse(JSON.stringify(draft)); mc.answers.clash = { src: 'value', value: true }; mc.answers.card = { src: 'value', value: { mods: ['release_test', 'other_mod'] } }; mc.answers.updated = { src: 'value', value: true }; D.save(ctx, mc);
  const c2 = await CP.compile(fctx, D.load(ctx, id), { release: R });
  const cc = c2.calls.find(c => c.route === 'POST /api/x/share/clashes'), cu = c2.calls.find(c => c.route === 'POST /api/x/share/updated');
  ok(cc && cc.body.mods.join(',') === 'other_mod,release_test' && cu && c2.calls.every(c => !c.dryFlag), 'the More checks add the clashes and update calls (your mod last), no dryFlag of their own', JSON.stringify(c2.calls));
  ok(cc && CP.dryOf(cc) === 'read' && CP.dryOf(cu) === 'read' && CP.dryOf(c2.calls[0]) === 'write', 'the core runs the two checks read only and the package as a dry run', JSON.stringify(c2.calls.map(c => [c.route, CP.dryOf(c)])));
  const nm = JSON.parse(JSON.stringify(mc)); nm.answers.card = { src: 'value', value: { mods: ['release_test', 'not_installed'] } }; D.save(ctx, nm);
  why = null; try { await CP.compile(fctx, D.load(ctx, id), { release: R }); } catch (e) { why = e; }
  ok(why && /not installed in the game mods folder/.test(why.message), 'a mod that is not installed is refused in plain words', why && why.message);
  why = null; try { await CP.compile(kit.ctxFor(scratch, { gameDir: game }), D.load(ctx, id), { release: R }); } catch (e) { why = e; }
  ok(why && /not installed|game folder/.test(why.message), 'your own mod must be installed too for the clash check', why && why.message);
  // novice round: the clash check reads the play card list (asked once); a card with only this mod checks nothing and says so
  const one = JSON.parse(JSON.stringify(draft)); one.answers.clash = { src: 'value', value: true }; one.answers.card = { src: 'value', value: { mods: ['release_test'] } }; D.save(ctx, one);
  const c3 = await CP.compile(fctx, D.load(ctx, id), { release: R });
  ok(!c3.calls.some(c => /clashes/.test(c.route)) && c3.notes.some(n => /lists no other mod/.test(n)), 'clash check with only this mod on the card: no call, a plain note', JSON.stringify(c3.notes));
  D.save(ctx, draft);
  const qIds = [].concat(...R.groups.map(g => g.q.map(q => q.id)));
  ok(!qIds.includes('clash_with') && R.groups.find(g => g.id === 'more').q[0].kind === 'yesno', 'the mods played together are asked once (the card list), the clash check is a yes or no');
  ok(R.groups.filter(g => g.essential).map(g => g.id).join() === 'info,picture,gate,pack', 'Quick asks the name, picture, check and package; the play card and More checks stay as they are', R.groups.filter(g => g.essential).map(g => g.id).join());
  ok(R.groups.find(g => g.id === 'picture').q[0].picker.kinds.join() === '.png,.jpg,.jpeg', 'the picture picker takes only png and jpg (the check refuses the rest)');
  const en = k => (L.find(x => x[0] === k) || [])[1] || '';
  ok(/^Not ready yet\. Red lines: \{n\}\./.test(en('task.release.k.notReady')) && !L.some(x => /line\(s\)|problem\(s\)/.test(x[1])), 'the red line count reads plainly');
  ok(/Desktop/.test(en('task.release.h.out')) && /makes the folders/.test(en('task.release.h.out')), 'the package folder help says it is filled in and made');
  ok(/another PC/.test(en('task.release.c.pack')) && /adds or raises a third number \(1\.2 to 1\.2\.1\)/.test(en('task.release.h.version_kind')), 'the checklist and the version help read right for a first release');
  ok(/Mod Files page/.test(en('task.release.k.i.previewOld')) && !L.some(x => /(?<!Mod )Files page|Logs page|Fix page/.test(x[1])), 'page names match the menu (Mod Files)');
  // the preview: Workshop takes it under 1 MB (picker.check refuses a bigger one at the upload)
  const pq = R.groups.find(g => g.id === 'picture').q.find(q => q.id === 'preview'), pc = pq.picker.check;
  const big = pc({ name: 'p.png', type: 'png', size: 1024 * 1024 + 5 }), small = pc({ name: 'p.png', type: 'png', size: 300 * 1024 });
  ok(typeof pc === 'function' && big && big.key === 'task.release.k.previewBig' && big.params.kb === 1025 && !small && !!en('task.release.k.previewBig'), 'a preview of 1 MB or more is refused with what to do', JSON.stringify(big));
  ok(R.title && R.title.make === 'task.release.t' && R.test === 'task.release.test' && /every other mod off/.test(en('task.release.test')), 'title per verb; the Test step says how to try the packed mod on a clean game');
  ok(!L.some(x => /\b(32|64) bit\b/.test(x[1])) && /Classic mode of the 64-bit game/.test(en('task.release.v.range.classic')), 'one spelling (64-bit) and one meaning of Classic');
  ok(/one per line/.test(en('task.release.h.card')) && /one per line/.test(en('task.release.k.mods')) && !L.some(x => /commas/.test(x[1])) && /data-rel-mods/.test(CL.script) && /'textarea'/.test(CL.script), 'mod lists are one per line everywhere');
  // the way out of every red line, and back: a step of this task, the Mod files page, or the fix task; the check runs again on return
  const TOQ = (/var TOQ = (\{[^}]*\})/.exec(CL.script) || [])[1];
  const toq = TOQ ? JSON.parse(TOQ.replace(/'/g, '"').replace(/(\w+):/g, '"$1":')) : {};
  ok(Object.values(toq).every(q => qIds.includes(q)) && ['info', 'name', 'desc', 'version', 'range', 'preview'].every(k => toq[k]), 'each mod.info and picture line goes back to the question that sets it', TOQ);
  ok(/var TOFILES = \{ previewOld: 1, junk: 1, goh: 1, pack: 1 \}/.test(CL.script) && /as2Link\('page:files'\)/.test(CL.script), 'files lines open the Mod Files page');
  ok(/TASK\.open\('fixmod', 'change'\)/.test(CL.script) && /TASK\.close\(\)\.then/.test(CL.script), 'the mod check line opens the fix task after saving this one');
  ok(/draw: function \(q, st, host\) \{\r?\n      st\.box = h\('div', \{ 'data-rel-gate': '1' \}\);[\s\S]*?rlCheck\(st\);\r?\n    \}/.test(CL.script) && /howBack/.test(CL.script), 'coming back (Continue) draws the gate again, which runs the check again');

  // the Mod Files way out follows the current game: MoW:AS2 runs this recipe but has no Mod Files page (an AS64 page only)
  const gate = async (ingame, adv, items, swap, apiFn) => {
    const vm = require('vm'), log = { toasts: [], closed: 0, links: [], ls: [] };
    const el = (tag, at, kids) => { const e = { tag, at: at || {}, kids: [].concat(kids || []).filter(Boolean), appendChild(c) { this.kids.push(c); return c; } };
      Object.defineProperty(e, 'textContent', { get() { return e.at.text || ''; }, set(v) { e.kids = []; e.at.text = v; } }); return e; };
    const kinds = {}, sb = { INGAME: ingame, toast: t => log.toasts.push(t), tx: k => k, h: el, refOn: r => r !== 'files' || adv,
      as2Link: l => { log.links.push(l); return true; }, LS: { set: (k, v) => log.ls.push(k + '=' + v) },
      api: (u, b, o) => { log.opt = o; return apiFn ? apiFn() : Promise.resolve({ ok: true, ready: false, fails: items.length, warns: 0, next: '1.3', items }); },
      document: { querySelector: () => null, createTextNode: t => ({ text: t }) },
      TASK: { kind: (n, d) => { kinds[n] = d; }, close: () => { log.closed++; return Promise.resolve(); }, open() {}, state: () => ({ steps: [] }), back() {},
        job: () => ({ what: 'Guided task: release' }), stopped: (box, e) => { if (!e || !e.cancelled) return false; box.textContent = ''; box.appendChild(el('div', { class: 'hint', 'data-task-stopped': '1', text: 'stopped' })); return true; } } };
    sb.window = sb; vm.createContext(sb); vm.runInContext(CL.script, sb);
    const host = el('div'), st = {}; kinds['rel-gate'].draw({}, st, host);
    await new Promise(r => setImmediate(r));
    const all = [], walk = e => { if (e && e.at) { all.push(e); (e.kids || []).forEach(walk); } }; walk(host);
    const btn = all.find(e => e.at['data-rel-to'] === 'files'), hand = all.filter(e => e.at['data-rel-to'] === 'hand');
    if (swap) sb.INGAME = swap;
    if (btn) { btn.at.onclick(); await new Promise(r => setImmediate(r)); }
    log.red = all.filter(e => e.at.class === 'tk-refuse').length; log.stopLine = all.filter(e => e.at['data-task-stopped']).length;
    return Object.assign(log, { btn: !!btn, hand: hand.length, why: all.some(e => e.at.text === '    task.release.k.gohWhy') });
  };
  const fails = [{ id: 'previewOld', status: 'fail' }, { id: 'goh', status: 'fail' }];
  let g = await gate({ mods: 1 }, true, fails);
  ok(g.opt && g.opt.what === 'Guided task: release', 'JOBS: the check request is named in the job list (api third argument what)', JSON.stringify(g.opt));
  { const gs = await gate({ mods: 1 }, true, fails, null, () => Promise.reject(Object.assign(new Error('Stopped'), { cancelled: true })));
    ok(gs.stopLine === 1 && gs.red === 0, 'JOBS: a check stopped from the job list shows the plain stopped line, not a red error', JSON.stringify({ s: gs.stopLine, r: gs.red }));
    const ge = await gate({ mods: 1 }, true, fails, null, () => Promise.reject(new Error('boom')));
    ok(ge.stopLine === 0 && ge.red === 1, 'a failed check is still a red error', JSON.stringify({ s: ge.stopLine, r: ge.red })); }
  ok(!g.btn && g.hand === 2 && g.why && !g.closed && !g.links.length, 'MoW:AS2 (no Mod Files page): no Open Mod Files button, a by hand line on each files row, nothing closes or switches', JSON.stringify(g));
  g = await gate({ mods: 1 }, true, [{ id: 'pack', status: 'warn' }, { id: 'junk', status: 'fail' }]);
  ok(!g.btn && g.hand === 1, 'MoW:AS2: a pack row gets no by hand line (a packing finding is not always a file to remove), a junk row does', JSON.stringify(g));
  g = await gate({ mods: 1, files: 1 }, false, fails);
  ok(g.btn && !g.hand && g.closed === 0 && !g.links.length && g.toasts.join() === 'task.release.k.filesAdv', 'AS64 with Advanced off: the button toasts the Advanced text and the task window stays open', JSON.stringify(g));
  g = await gate({ mods: 1, files: 1 }, true, fails);
  ok(g.btn && g.closed === 1 && g.links.join() === 'page:files' && !g.toasts.length && g.ls.join() === 'files.tab=tree', 'AS64 with Advanced on: the task is saved and Mod Files opens', JSON.stringify(g));
  g = await gate({ mods: 1, files: 1 }, true, fails, { mods: 1 });
  ok(g.btn && g.closed === 0 && !g.links.length && g.toasts.join() === 'task.release.k.byHand', 'the game read at click time: switched to a game without Mod Files, the click says to remove by hand and closes nothing', JSON.stringify(g));
  ok(!/\bMods,|\(Mods\b/.test(en('task.release.k.i.previewOld') + en('task.release.k.gohWhy')) && /mod folder/.test(en('task.release.k.i.previewOld')) && /mod folder/.test(en('task.release.k.gohWhy')) && L.filter(x => /^task\.release\.k\.(i\.previewOld|gohWhy)$/.test(x[0])).every(x => x.slice(1).every(t => /AS64/.test(t))),
    'previewOld and gohWhy send the person to the mod folder and name Mod Files as an AS64 page, in every language');
  ok(!/=>|`|\$\{|innerHTML|\blet |\bconst /.test(CL.script), 'page script is ES5 (no arrow, backtick, dollar-brace, innerHTML, let, const)');
  try { new Function(CL.script); ok(true, 'page script parses'); } catch (e) { ok(false, 'page script parses', e.message); }
  const keys = new Set(L.map(x => x[0]));
  const used = (CL.script.match(/task\.release\.[a-zA-Z_.]+/g) || []).filter(k => !/\.$/.test(k));
  ok(used.every(k => keys.has(k)), 'every page string has a row', used.filter(k => !keys.has(k)).join(', '));
  ['info', 'range', 'name', 'desc', 'version', 'preview', 'previewOld', 'junk', 'goh', 'pack', 'check'].forEach(k => ok(keys.has('task.release.k.i.' + k), 'item label ' + k + ' has a row'));
  ['pass', 'warn', 'fail', 'skip'].forEach(k => ok(keys.has('task.release.k.s.' + k), 'status ' + k + ' has a row'));
  ['big', 'type'].forEach(k => ok(keys.has('task.release.k.pic.' + k), 'picture refusal ' + k + ' has a row'));

  // the kit: no package or Workshop step in this fixture, so the write touches only mod.info and the picture (no share route writes)
  const wa = Object.assign({}, answers, { package: false, workshop_copy: false });
  const wd = JSON.parse(JSON.stringify(draft)); wd.answers.package = { src: 'value', value: false }; wd.answers.workshop_copy = { src: 'value', value: false }; D.save(ctx, wd);
  const r2 = await check(null, { draft: wd }, ctx);
  ok(r2.ready && r2.sig === r.sig, 'the package answers do not change the checked files');
  const res = await kit.run(R, L, {
    answers: Object.assign({}, wa, { preview: { src: 'file', staged: ['pic.png'] }, gate: { sig: r2.sig, ready: true, fails: 0, warns: r2.warns, next: r2.next } }),
    verb: 'make', game: 'as64', gameDir: game, mod,
    validate: { kinds: CL.kinds },
    planFiles: ['mod.info', 'preview.png'],
    write: true,
    after: (m, w, ok2) => {
      const info = fs.readFileSync(path.join(m, 'mod.info'), 'latin1');
      ok2(/\{Version "1\.3"\}/.test(info) && /\{Name "Release Test"\}/.test(info), 'mod.info now says 1.3', info);
      ok2(fs.readFileSync(path.join(m, 'preview.png')).equals(PNG), 'the picture is in the mod');
      ok2(w.restore.length === 2 && !(w.calls || []).some(c => c.kind === 'route'), 'two restore points, no share route call');
      ok2(!fs.existsSync(out), 'no package or copy folder made');
    },
  }, scratch);
  D.newId = newId;
  console.log('recipe extra: ' + good + ' passed, ' + bad + ' failed');
  if (bad || res.fails) { console.log('FAIL'); process.exitCode = 1; } else console.log('PASS');
})().catch(e => { console.log('FAIL crashed ' + (e.stack || e)); process.exitCode = 1; });
