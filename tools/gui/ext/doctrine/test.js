// GUI-EXT doctrine test. Arg: scratch dir. No game, no network: tools/doctrine/test/fx + the botrecipe chainn3 vanilla fixture.
// Also repeats the test-ext contract checks (lang keys in 4 languages, tx keys, script rules) so it works before the ext is registered.
// Author: Imperator_Aug (ARSENAL, ia-36958bb2)
const fs = require('fs'), path = require('path'), vm = require('vm');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'doctrine-')));
require('../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const X = require('./index');
const WT = require('../../../lib/test/wait');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL ' + m); } };
const T = path.join(__dirname, '..', '..', '..');
const FX = path.join(T, 'doctrine', 'test', 'fx');
const VAN = path.join(T, 'botrecipe', 'test', 'chainn3', 'stock', 'script', 'multiplayer', 'bot.data.lua');
const REL = ['resource', 'script', 'multiplayer', 'bot.data.lua'];
const W = (p, b) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b); };
const robz = fs.readFileSync(path.join(FX, 'botconfig.lua')), van = fs.readFileSync(VAN);
const modR = path.join(work, 'modr'), modV = path.join(work, 'modv'), empty = path.join(work, 'empty'), game = path.join(work, 'game');
W(path.join(modR, ...REL), robz); W(path.join(modV, ...REL), van); fs.mkdirSync(empty, { recursive: true });
fs.mkdirSync(path.join(game, 'mods', 'gm'), { recursive: true });
const ctx = { game: () => null, allowLaunch: false, gamedir: null, tools: T, tmpRoot: work };
const gctx = Object.assign({}, ctx, { game: () => game });
const U = q => ({ searchParams: new URLSearchParams(q) });
const R = X.routes;
const throws = async (f, re, m) => { try { await f(); ok(false, m + ' (no error)'); } catch (e) { ok(re.test(e.message) && e.status === 400, m + ': ' + e.message); } };

(async () => {
  // contract (same checks as tools/gui/test/test-ext.js)
  ok(X.id === 'doctrine' && X.nav === 'doctrine.nav' && X.adv === false && X.after === 'bots', 'shape');
  ok(!/`|\$\{/.test(X.script) && !/innerHTML/.test(X.script) && /EXT_SCREENS\.doctrine\s*=/.test(X.script), 'script rules');
  try { new vm.Script(X.script); } catch (e) { ok(false, 'script parses: ' + e.message); }
  const L = X.lang, core = require('../../lang/en.json');
  for (const c of ['ru', 'uk', 'zh']) for (const k of Object.keys(L.en)) ok(L[c][k] && typeof L[c][k] === 'string', 'lang ' + c + ' ' + k);
  for (const c of ['ru', 'uk', 'zh']) for (const k of Object.keys(L.en)) ok((L.en[k].match(/\{\w+\}/g) || []).sort().join() === (L[c][k].match(/\{\w+\}/g) || []).sort().join(), 'placeholders ' + c + ' ' + k);
  for (const m of X.script.matchAll(/\btx\('([a-zA-Z0-9_.]+)'/g)) if (!m[1].endsWith('.')) ok(L.en[m[1]] || core[m[1]], 'tx key ' + m[1]);
  for (const k of ['aggression', 'reserve_share', 'initiative', 'caution']) ok(L.en['doctrine.t.' + k], 'driver label ' + k);
  for (const k of ['rules', 'personas', 'missions', 'profile', 'gen', 'check']) ok(L.en['doctrine.tab.' + k], 'tab label ' + k);
  for (let i = 1; i <= 6; i++) ok(L.en['doctrine.how.s' + i], 'how step ' + i);
  for (const k of ['error', 'warn', 'info']) ok(L.en['doctrine.lvl.' + k], 'level ' + k);
  ok(/played in a match/.test(L.en['doctrine.intro.guess']) && /show\('bots'\)/.test(X.script), 'intro honesty + bots link');
  for (const k of Object.keys(R)) ok(/^(GET|POST) \/api\/x\/[a-z0-9/_-]+$/.test(k), 'route ' + k);

  // data
  const d = await R['GET /api/x/doctrine/data'](U(''), null, ctx);
  ok(d.rules.length === 38 && d.personas.length === 9 && d.missions.length === 10 && d.voices.length === 7, 'data counts');
  ok(d.missions.every(m => m.briefing.length > 50), 'mission briefings');
  ok(/Men of War/i.test(d.readme), 'pack readme (credit) served');
  const v1 = await R['GET /api/x/doctrine/voice'](U('persona=su-1941-rifle&event=contact&seed=3'), null, ctx);
  const v2 = await R['GET /api/x/doctrine/voice'](U('persona=su-1941-rifle&event=contact&seed=3'), null, ctx);
  ok(v1.line && v1.line === v2.line, 'voice deterministic');
  await throws(() => R['GET /api/x/doctrine/voice'](U('persona=nobody&event=contact'), null, ctx), /persona/i, 'voice bad persona');
  const pr = await R['GET /api/x/doctrine/profile'](U('id=botconfig'), null, ctx);
  ok(pr.id === 'botconfig' && pr.takes.some(t => t.key === 'DirAttackRatio') && pr.reference.count > 150, 'profile botconfig');
  ok((await R['GET /api/x/doctrine/profile'](U('id=robz'), null, ctx)).id === 'botconfig', 'old profile id still accepted');
  ok(!/robz|godny/i.test(pr.md + pr.reference.source), 'profile notes and source do not name another mod');
  await throws(() => R['GET /api/x/doctrine/profile'](U('id=x'), null, ctx), /^DOC_BAD_PROFILE\tx\t/, 'profile bad id');

  // detect
  ok((await R['GET /api/x/doctrine/detect'](U('mod=' + encodeURIComponent(modR)), null, ctx)).kind === 'botconfig', 'detect botconfig');
  ok((await R['GET /api/x/doctrine/detect'](U('mod=' + encodeURIComponent(modV)), null, ctx)).kind === 'vanilla', 'detect vanilla');
  ok((await R['GET /api/x/doctrine/detect'](U('mod=' + encodeURIComponent(empty)), null, ctx)).found === false, 'detect none');
  await throws(() => R['GET /api/x/doctrine/detect'](U(''), null, ctx), /^DOC_UI_NEEDMOD\t/, 'detect no mod');

  // gen: preview writes nothing, write keeps bytes, universal restores
  const G = R['POST /api/x/doctrine/gen'], fR = path.join(modR, ...REL);
  const p = await G(null, { mod: modR, persona: 'su-1941-rifle' }, ctx);
  ok(p.profile === 'botconfig' && p.changes.length >= 10 && !p.wrote, 'preview botconfig');
  ok(Buffer.compare(fs.readFileSync(fR), robz) === 0, 'preview wrote nothing');
  await throws(() => G(null, { mod: modR, persona: 'su-1941-rifle', write: true }, ctx), /^DOC_UI_NOGAME\t/, 'write refused without a game folder');
  ok(Buffer.compare(fs.readFileSync(fR), robz) === 0, 'refused write wrote nothing');
  // CACHE: a preview touches nothing; a write tells the shared walk (lib/modtree)
  const tch = []; gctx.modtree = { touch: d => tch.push(d) };
  await G(null, { mod: modR, persona: 'su-1941-rifle' }, gctx);
  ok(tch.length === 0, 'touch: a preview touches nothing');
  const w = await G(null, { mod: modR, persona: 'su-1941-rifle', write: true }, gctx);
  ok(tch.length === 1 && path.resolve(tch[0]) === path.resolve(modR), 'touch: a write touches the mod');
  delete gctx.modtree;
  const t = fs.readFileSync(fR, 'latin1');
  ok(w.wrote === fR && /^-- doctrine: persona su-1941-rifle/.test(t) && /DirAttackRatio = 1\.06, -- \[doctrine was DirAttackRatio=1\.4\]/.test(t), 'write botconfig');
  ok(!/(^|[^\r])\n/.test(t) && t.includes('\xe0\xe1'), 'CRLF and cp1251 bytes kept');
  await G(null, { mod: modR, persona: 'universal', write: true }, gctx);
  ok(Buffer.compare(fs.readFileSync(fR), robz) === 0, 'universal restores');
  const pv = await G(null, { mod: modV, persona: 'jp-1942-infantry' }, ctx);
  ok(pv.profile === 'vanilla' && pv.changes.some(c => c.key === 'FlagPriority.Enemy'), 'preview vanilla');
  // base from another folder; the empty mod gets the file
  const wb = await G(null, { mod: empty, persona: 'ger-1944-kampfgruppe', base: modR, write: true }, gctx);
  ok(wb.base.from === 'loose' && fs.existsSync(path.join(empty, ...REL)), 'base from another mod');
  await throws(() => G(null, { mod: modV, persona: 'su-1941-rifle', profile: 'botconfig' }, ctx), /^DOC_PROFILE_MISMATCH\t/, 'botconfig on vanilla');
  await throws(() => G(null, { mod: modR, persona: 'nobody' }, ctx), /^DOC_NO_PERSONA\tnobody\t/, 'bad persona');
  await throws(() => G(null, { mod: modR, persona: 'su-1941-rifle', scale: 9 }, ctx), /^DOC_BAD_SCALE\t/, 'bad scale (coded, the page translates it)');
  await throws(() => G(null, { mod: path.join(work, 'nope'), persona: 'universal' }, ctx), /^DOC_UI_NOMOD\t/, 'missing mod');
  await throws(() => G(null, { mod: game, persona: 'universal', base: modR, write: true }, gctx), /^DOC_GAME_DIR\t.*inside the game folder/, 'game dir refused');
  await throws(() => G(null, { mod: path.join(game, 'mods'), persona: 'universal', base: modR, write: true }, gctx), /^DOC_GAME_DIR\t.*whole mods folder/, 'game mods root refused for a write (a preview only reads)');
  ok((await G(null, { mod: path.join(game, 'mods', 'gm'), persona: 'su-1941-rifle', base: modR }, gctx)).changes.length > 0, 'game/mods/<mod> allowed');

  // GT-34: Strength error in zh, codes thrown anywhere have a text in every language
  ok(/强度/.test(L.zh['doctrine.err.DOC_BAD_SCALE']) && /^Strength/.test(L.en['doctrine.err.DOC_BAD_SCALE']) && L.en['doctrine.gen.scale'] === 'Strength', 'scale error uses the field name Strength');
  const src = ['../../../doctrine/lib.js', './lib.js'].map(p => fs.readFileSync(path.join(__dirname, p), 'utf8')).join('\n');
  for (const m of new Set([...src.matchAll(/bad\([^;]*?'(DOC_[A-Z_]+)'/g)].map(m => m[1]))) ok(['en', 'ru', 'uk', 'zh'].every(c => L[c]['doctrine.err.' + m]), 'error text ' + m);
  const DL = require('../../../doctrine/lib');
  for (const k of Object.values(DL.MAP).flat().map(r => r[0])) ok(['en', 'ru', 'uk', 'zh'].every(c => L[c]['doctrine.why.' + k]), 'why text ' + k);
  for (const v of ['direct', 'proxy', 'engine', 'out']) ok(L.zh['doctrine.fit.' + v], 'fit text ' + v);
  // the page names no other person's mod (any language)
  for (const c of ['en', 'ru', 'uk', 'zh']) for (const k of Object.keys(L[c])) ok(!/robz|godny/i.test(L[c][k]), 'no other mod named: ' + c + ' ' + k);
  ok(!/'robz'/.test(X.script.replace("v==='robz'", '')), 'page offers the public profile name only');
  // GT-15: the page keeps no mod of its own; every tab that acts on a mod shows the shared one and says where to change it
  ok(!/LS\.(get|set)\('[^']*mod/i.test(X.script) && (X.script.match(/mod:S\.mod/g) || []).length >= 3, 'uses the shared mod only');
  ok((X.script.match(/modLine\(\)/g) || []).length >= 3 && /header/.test(L.en['doctrine.gen.mod']), 'profile, generate and check tabs show the shared mod');

  // check
  const C = R['POST /api/x/doctrine/check'];
  ok((await C(null, { mod: modR }, ctx)).errors === 0, 'check robz clean');
  ok((await C(null, { mod: modV }, ctx)).errors === 0, 'check vanilla clean');
  const cb = await C(null, { mod: modR, base: path.join(FX, 'botconfig-bad.lua') }, ctx);
  ok(cb.problems.some(x => x.code === 'DOC_RANGE') && cb.problems.some(x => x.code === 'DOC_KEY_MISSING'), 'check bad file');
  const cm = await C(null, { mod: modR, profile: 'vanilla' }, ctx);
  ok(cm.problems.some(x => x.code === 'DOC_PROFILE_MISMATCH'), 'check mismatch');
  // GT-34: every check result and every skip has a text in all 4 languages (no English sentence, no code shown)
  const cbad = await C(null, { mod: modV, base: path.join(work, 'bad.lua') }, ctx).catch(e => e);
  for (const x of cb.problems.concat(cm.problems, (await C(null, { mod: modV }, ctx)).problems)) ok(L.en['doctrine.pr.' + x.t] && L.zh['doctrine.pr.' + x.t], 'check text key ' + x.t);
  for (const w of ['missing', 'notplain', 'nan']) ok(L.zh['doctrine.skip.' + w], 'skip text ' + w);
  ok(!/p\.code\+/.test(X.script) && /doctrine\.pr\./.test(X.script), 'check list shows translated texts, not codes');
  ok(cbad instanceof Error && /^DOC_NO_BASE\t/.test(cbad.message), 'missing base coded');

  // blocks: the page in a stand-in browser on the real routes; every tab, with its server replies drawn
  // (persona voice, detect, preview, check), keeps each control and text in a leaf block; the open tab is one container block
  {
    const FD = require('../units/fakedom');
    const route = (u, body) => { if (/^\/api\/mods\?/.test(u)) return { mods: [{ name: path.basename(modR), path: modR, mtimeMs: 1 }] }; const url = new URL(u, 'http://x'), k = (body === undefined ? 'GET ' : 'POST ') + url.pathname; return R[k](url, body === undefined ? null : body, ctx); };
    const P = FD.runPage('doctrine', X.script, L, { route, S: { mod: modR } }), B = id => P.root.all(c => c.dataset.blk === id);
    P.screen.refresh();   // lazy pages: the data is asked for at the first show (page.js show0 calls refresh), not while the page is built
    const btn = t => P.root.all(c => c.tagName === 'BUTTON' && c.textContent === t)[0];
    // by time, not by count. Backup, never a hang: after 60 s it says WAIT on stderr and returns f() (the check after it reports)
    const wait = async f => { const t0 = Date.now(); while (!f()) { if (Date.now() - t0 >= WT.COND_MS) { WT.say('doctrine test', String(f).slice(0, 120), WT.COND_MS); break; } await FD.settle(); } return f(); };
    ok(await wait(() => B('rules').length), 'blocks: the rules tab is drawn after the data came');
    const acts = { personas: L.en['doctrine.p.sample'], profile: L.en['doctrine.prof.detect'], gen: L.en['doctrine.gen.preview'] };
    for (const id of ['rules', 'personas', 'missions', 'profile', 'gen', 'check']) {
      btn(L.en['doctrine.tab.' + id]).click();
      if (acts[id]) { const b = btn(acts[id]); ok(b, 'blocks: tab ' + id + ' has its button'); if (b) b.click(); }
      for (let i = 0; i < 8; i++) await FD.settle();
      await wait(() => B(id).length === 1 && (id !== 'gen' || /\[T\]/.test(B('gen.res')[0] ? B('gen.res')[0].textContent : '')));
      const pr = FD.checkBlocks(P.root);
      ok(B(id).length === 1 && B('pane')[0].children.length === 1 && !pr.length, 'blocks: tab ' + id + ' ' + pr.slice(0, 8).join(' | '));
      if (id === 'gen') ok(/\[T\]/.test(B('gen.res')[0] ? B('gen.res')[0].textContent : ''), 'blocks: the preview table is drawn inside its leaf: ' + (B('gen.res')[0] || {}).textContent);
    }
    // searchKit (owner 2026-11-19): the rules box and the base file box have browse, an index and history
    {
      const ks = () => P.root.all(c => c.dataset && c.dataset.sk).map(c => c.dataset.sk);
      const rqOf = () => P.root.all(c => c.tagName === 'INPUT' && c.getAttribute('aria-label') === L.en['doctrine.rules.find'])[0];
      btn(L.en['doctrine.tab.rules']).click(); for (let i = 0; i < 4; i++) await FD.settle(); await wait(rqOf);
      const rq = rqOf(), r0 = d.rules[0];
      ok(rq && ks().includes('doctrine.rules.q'), 'searchKit: rules box ' + ks().join(','));
      if (rq) {
        const ddOf = () => rq.parentNode.all(c => c.getAttribute && c.getAttribute('role') === 'listbox')[0];
        const oOf = () => { const x = ddOf(); return x && x.all(c => /sk-index/.test(c.className || '') && c.textContent.indexOf(r0.id) === 0)[0]; };
        FD.type(P.doc, rq, r0.id); for (let i = 0; i < 3; i++) await FD.settle(); await wait(oOf);
        const dd = ddOf(), o = oOf();
        ok(!!o, 'searchKit: a rule ID is suggested');
        if (o) { dd.fire('click', { target: o }); await FD.settle(); ok(rq.value === r0.id && (P.env.LS.get('sk.hist.doctrine.rules.q', [])[0] === r0.id), 'searchKit: a picked rule is kept in history');
          ok(B('rules.list')[0].textContent.indexOf(r0.id + ' - ') >= 0, 'searchKit: the picked rule is drawn'); }
        // Browse (owner 2026-11-19: "browse should always be a file directory browse"): the picker on the pack's documents; a mission
        // file narrows the list to the rules that mission teaches
        let pk = null; P.picker((spec, done) => { pk = { spec, done }; });
        rq.parentNode.all(c => /sk-browse/.test(c.className || ''))[0].click();
        const md = path.join(__dirname, '..', '..', '..', 'doctrine', 'data', 'md');
        ok(pk && pk.spec.mode === 'file' && pk.spec.view === 'disk' && path.resolve(pk.spec.start) === path.resolve(md) && pk.spec.exts.join() === 'md', 'browse: the rules box opens the pack documents ' + JSON.stringify(pk && pk.spec));
        if (pk) { const f = path.join(md, 'missions', 'river.md'), riv = d.missions.find(m => m.id === 'river').rules; pk.done(f, { view: 'disk', path: f }); for (let i = 0; i < 3; i++) await FD.settle();
          await wait(() => rq.value === 'river' && B('rules.list')[0] && riv.every(id => B('rules.list')[0].textContent.indexOf(id + ' - ') >= 0));
          const tl = B('rules.list')[0].textContent;
          ok(rq.value === 'river' && riv.every(id => tl.indexOf(id + ' - ') >= 0), 'browse: a picked mission file shows the rules it teaches ' + rq.value);
          ok(tl.indexOf(r0.id + ' - ') < 0, 'browse: and only those'); }
      }
      P.S.roots = [path.dirname(modR)];
      const bqOf = () => P.root.all(c => c.tagName === 'INPUT' && c.getAttribute('aria-label') === L.en['doctrine.gen.base'])[0];
      btn(L.en['doctrine.tab.gen']).click(); for (let i = 0; i < 4; i++) await FD.settle(); await wait(bqOf);
      const bq = bqOf();
      ok(bq && ks().includes('doctrine.gen.base'), 'searchKit: base file box ' + ks().join(','));
      if (bq) {
        const ddOf = () => bq.parentNode.all(c => c.getAttribute && c.getAttribute('role') === 'listbox')[0];
        const oOf = () => { const x = ddOf(); return x && x.all(c => /sk-index/.test(c.className || '') && c.textContent.indexOf(path.basename(modR)) === 0)[0]; };
        FD.type(P.doc, bq, path.basename(modR).slice(0, 3)); for (let i = 0; i < 4; i++) await FD.settle(); await wait(oOf);
        const dd = ddOf(), o = oOf();
        ok(!!o, 'searchKit: a mod from the mod folders is suggested ' + (dd ? dd.textContent : ''));
        if (o) { dd.fire('click', { target: o }); await FD.settle(); ok(bq.value === modR, 'searchKit: a picked mod fills the base box'); }
        let pk = null; P.picker((spec, done) => { pk = { spec, done }; });
        bq.parentNode.all(c => /sk-browse/.test(c.className || ''))[0].click();
        ok(pk && pk.spec.mode === 'dir' && pk.spec.view === 'disk' && pk.spec.start === bq.value, 'browse: the base box opens the folder picker at its folder ' + JSON.stringify(pk && pk.spec));
        if (pk) { pk.done(path.dirname(modR), { view: 'disk', path: path.dirname(modR) }); await FD.settle(); ok(bq.value === path.dirname(modR), 'browse: the picked folder fills the base box'); }
      }
    }
    const loose = P.doc.createElement('button'); loose.textContent = 'loose'; B('pane')[0].appendChild(loose);
    ok(FD.checkBlocks(P.root).some(l => /button "loose" sits in the container "pane"/.test(l)), 'blocks: the check catches a control left in a container');
  }

  // ---- game parity (made-up install): MoW:AS2 reads bot.data.lua without as64/core; GoH: detect, generate, check refuse (GHMIS-66)
  {
    const as2 = path.join(work, 'par-as2'), gohD = path.join(work, 'par-goh'), empty = path.join(work, 'par-empty'); fs.mkdirSync(empty, { recursive: true });
    W(path.join(as2, 'as64.exe'), ''); W(path.join(as2, ...REL), van); W(path.join(as2, 'as64', 'core', ...REL), robz);
    W(path.join(gohD, 'binaries', 'x64', 'call_to_arms.exe'), '');
    const pc = id => Object.assign({}, ctx, { gameId: () => id, exe: () => ({ as64: 'as64', mowas2: 'mowas_2', goh: 'goh' })[id], kind: () => (id === 'goh' ? 'goh' : 'as2'), game: () => as2, gohDir: () => gohD, curDir: () => (id === 'goh' ? gohD : as2) });
    const dm = await R['GET /api/x/doctrine/detect'](U('mod=' + encodeURIComponent(empty)), null, pc('mowas2'));
    const da = await R['GET /api/x/doctrine/detect'](U('mod=' + encodeURIComponent(empty)), null, pc('as64'));
    const d0 = await R['GET /api/x/doctrine/detect'](U('mod=' + encodeURIComponent(empty)), null, Object.assign({}, ctx, { game: () => as2 }));
    ok(dm.found && dm.from === 'game' && dm.kind === 'vanilla', 'mowas2: the game bot file without as64/core: ' + JSON.stringify(dm));
    ok(da.found && da.kind === 'botconfig' && d0.kind === 'botconfig', 'as64 (named or not): as64/core wins, as before');
    const gm = await R['POST /api/x/doctrine/gen'](null, { mod: empty, persona: 'su-1941-rifle', write: false }, pc('mowas2'));
    ok(gm.base.from === 'game' && gm.profile === 'vanilla' && gm.changes.length > 0 && !gm.wrote, 'mowas2: generate previews on the mowas_2 bot file');
    const cm = await R['POST /api/x/doctrine/check'](null, { mod: empty }, pc('mowas2'));
    ok(cm.from === 'game' && cm.kind === 'vanilla', 'mowas2: check reads the mowas_2 bot file');
    // the install comes from ctx.curDir() (not ctx.game()) and the vfs exe from ctx.exe() (wave 3, c-bots)
    const cd = await R['GET /api/x/doctrine/detect'](U('mod=' + encodeURIComponent(empty)), null, Object.assign(pc('mowas2'), { game: () => path.join(work, 'no-such-game') }));
    ok(cd.found && cd.from === 'game' && cd.kind === 'vanilla', 'mowas2: detect reads the install of ctx.curDir(): ' + JSON.stringify(cd));
    const ce = await R['GET /api/x/doctrine/detect'](U('mod=' + encodeURIComponent(empty)), null, Object.assign(pc('mowas2'), { exe: () => 'as64' }));
    ok(ce.found && ce.kind === 'botconfig', 'detect hands ctx.exe() to the vfs (exe as64 on a mowas2 page sees as64/core): ' + JSON.stringify(ce));
    // GoH: no bot.data.lua (GHMIS-66); detect, gen and check use the Conquest settings ConquestConfig (modes/conquest/runtime_config.lua)
    const CQ = ['script', 'multiplayer', 'modes', 'conquest', 'runtime_config.lua'];
    await throws(() => R['POST /api/x/doctrine/check'](null, { mod: empty }, pc('goh')), /^DOC_NO_FILE\t/, 'goh: no Conquest settings file = the plain DOC_NO_FILE line');
    W(path.join(gohD, 'resource', ...CQ), ['ConquestConfig = ConquestConfig or {}', 'ConquestConfig.AttackerWaves = {', '\tMaxWavesMin = 4,', '\tMinUnits = 5,', '\tMaxUnits = 6,', '}', 'ConquestConfig.DefenderCounterattack = {', '\tMinUnits = 3,', '\tResponseChance = 0.75,', '}', 'ConquestConfig.OrderRotationPeriod = 2.5 * 60000', ''].join('\r\n'));
    const gd = await R['GET /api/x/doctrine/detect'](U('mod=' + encodeURIComponent(empty)), null, pc('goh'));
    ok(gd.found && gd.from === 'game' && gd.kind === 'conquest' && /runtime_config\.lua$/.test(gd.file), 'goh: detect finds the Conquest settings of the game: ' + JSON.stringify(gd));
    const gk = await R['POST /api/x/doctrine/check'](null, { mod: empty }, pc('goh'));
    ok(gk.profile === 'conquest' && gk.problems.some(x => x.t === 'DOC_CONQUEST_ONLY') && gk.problems.filter(x => x.level === 'warn').every(x => x.t === 'DOC_KEY_MISSING.cq'), 'goh: check reads it as conquest; missing keys carry the conquest text key');
    const gmod = path.join(work, 'par-gohmod'); W(path.join(gmod, 'mod.info'), '{name "x"}\r\n');
    const gp = await R['POST /api/x/doctrine/gen'](null, { mod: gmod, persona: 'su-1941-rifle' }, pc('goh'));
    ok(gp.profile === 'conquest' && gp.changes.length > 0 && !gp.wrote && !fs.existsSync(path.join(gmod, 'resource')), 'goh: gen previews the Conquest changes, writes nothing');
    const gw = await R['POST /api/x/doctrine/gen'](null, { mod: gmod, persona: 'su-1941-rifle', write: true }, pc('goh'));
    ok(gw.wrote === path.join(gmod, 'resource', ...CQ) && fs.existsSync(gw.wrote) && !fs.readFileSync(gw.wrote, 'latin1').replace(/\r\n/g, '').includes('\n'), 'goh: gen writes the mod copy of runtime_config.lua, CRLF: ' + gw.wrote);
    W(path.join(gohD, 'mods', 'x', 'mod.info'), '');
    await throws(() => R['POST /api/x/doctrine/gen'](null, { mod: path.join(gohD, 'mods', 'x'), persona: 'su-1941-rifle', write: true }, pc('goh')), /^DOC_GAME_DIR/, 'goh: no write into the game install');
    // a preview only reads: a mod in the game's mods folder ARSENAL did not make may be previewed (the write guard is for a write)
    const gpx = await R['POST /api/x/doctrine/gen'](null, { mod: path.join(gohD, 'mods', 'x'), persona: 'su-1941-rifle' }, pc('goh'));
    ok(gpx.profile === 'conquest' && gpx.changes.length > 0 && !gpx.wrote && !fs.existsSync(path.join(gohD, 'mods', 'x', 'resource')), 'goh: gen preview of a mod in <GoH>/mods reads, writes nothing');
    // the GoH write left a restore point (Files page form, beside a mod outside the game)
    const gur = path.join(work, 'par-gohmod.arsenal-undo'), gids = fs.existsSync(gur) ? fs.readdirSync(gur) : [];
    ok(gids.length >= 1 && gids.every(i => JSON.parse(fs.readFileSync(path.join(gur, i, 'restore-point.json'), 'utf8')).rel === 'resource/' + CQ.join('/')), 'goh: the write took a restore point of runtime_config.lua first');
    ok((await R['GET /api/x/doctrine/data'](U(''), null, pc('goh'))).personas.length === 9, 'goh: the pack itself still reads');
    ok(['en', 'ru', 'uk', 'zh'].every(c => ['doctrine.kind.conquest', 'doctrine.prof.conquest', 'doctrine.prof.conquestSays', 'doctrine.prof.notFoundGoh', 'doctrine.pr.DOC_CONQUEST_ONLY', 'doctrine.pr.DOC_KEY_MISSING.cq'].every(k => L[c][k])), 'goh: the Conquest strings in four languages');
  }

  fs.rmSync(work, { recursive: true, force: true });
  console.log(bad ? bad + ' failures' : 'doctrine ext PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL ' + e.stack); process.exit(1); });
