// offline test for the goh ext: no game, no network. arg: scratch dir
// Author: Imperator_Aug (ARSENAL, ia-4fac90b6)
const fs = require('fs'), path = require('path');
const scratch = path.join(path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'goh-ext-test')), 'goh-ext');
fs.rmSync(scratch, { recursive: true, force: true });   // a second run in the same folder must start clean
fs.mkdirSync(scratch, { recursive: true });
const ext = require('./index.js');
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL ' + m); } };
const rej = async (f, re, m) => { try { await f(); fail++; console.log('FAIL ' + m + ' (no error)'); } catch (e) { ok(re.test(e.message), m + ' got: ' + e.message); } };
const U = (p) => new URL('http://x/' + p);

(async () => {
  const T = ext._t;
  // search + did-you-mean
  const units = [{ name: 'panzer4j', nation: 'ger', cls: 'tank_medium' }, { name: 'panzer4h', nation: 'ger', cls: 'tank_medium' }, { name: 'sherman', nation: 'usa', cls: 'tank_medium' }];
  ok(T.searchUnits(units, 'panzer4j').units[0].name === 'panzer4j', 'exact first');
  ok(T.searchUnits(units, 'panz').total === 2, 'prefix 2 hits');
  const d = T.searchUnits(units, 'pnazer4j');
  ok(!d.units.length && d.didYouMean && d.didYouMean[0].name === 'panzer4j', 'did you mean');
  ok(T.searchUnits(units, '').units.length === 0, 'empty query');

  // fake installs
  const goh = path.join(scratch, 'goh'), game = path.join(scratch, 'game');
  fs.mkdirSync(path.join(goh, 'resource'), { recursive: true });
  fs.mkdirSync(path.join(game, 'mods'), { recursive: true });
  const ctx0 = { tmpRoot: scratch, game: () => game };

  // output folder rules
  ok(T.checkOut(ctx0, path.join(game, 'mods', 'goh_x'), game, goh), 'mods/<name> allowed');
  const bad = [[path.join(game, 'resource'), 'game resource'], [game, 'game root'], [path.join(game, 'mods', 'a', 'b'), 'deep in game'], [path.join(goh, 'mods', 'x'), 'inside goh'], ['C:/x/steamapps/workshop/content/1/2', 'workshop'], ['', 'empty']];
  for (const [p, m] of bad) { let t = false; try { T.checkOut(ctx0, p, game, goh); } catch (e) { t = /refused|needed/.test(e.message); } ok(t, 'refuse ' + m); }
  const full = path.join(scratch, 'full'); fs.mkdirSync(full, { recursive: true }); fs.writeFileSync(path.join(full, 'a.txt'), 'x');
  let t = false; try { T.checkOut(ctx0, full, game, goh); } catch (e) { t = /not empty/.test(e.message); } ok(t, 'refuse non-empty foreign folder');

  // whatChanged from a gaps fixture
  const o = path.join(scratch, 'o1'); fs.mkdirSync(path.join(o, 'gaps'), { recursive: true });
  fs.writeFileSync(path.join(o, 'gaps', 'tk.gaps.json'), JSON.stringify({ counts: { dropped: 1, baked: 2, donor: 1, hand: 0, unexplained: 0 }, gaps: [
    { kind: 'dropped', code: 'WARN_PORT_DROP_EVENTS', key: 'e' },
    { kind: 'donor', code: 'PORT_DONOR_DEF', reason: 'base = vanilla def (--donor chi-nu: x)' },
    { kind: 'baked', code: 'XLATE_WRITE', key: 'speed', reason: 'GoH 12 -> 6 written into the donor def (donor had 5; scale)' },
    { kind: 'baked', code: 'XLATE_WRITE', key: 'armor_front', reason: 'GoH 80 -> 60 written into the donor def (donor had 50; x)' }] }));
  const w = T.whatChanged(o, 'tk', [{ code: 'WARN_PORT_CREW_CAPPED', msg: 'GoH crew 5, the port has 4' }, { code: 'WARN_PORT_ARMOUR', msg: 'armour from donor [I]' }]);
  ok(w.crew && w.crew.goh === 5 && w.crew.port === 4, 'crew');
  ok(w.donor === 'chi-nu', 'donor');
  ok(w.values.length === 2 && w.values[0].adv === 'goh.adv.speed' && w.values[1].adv === 'goh.adv.armour', 'values + advice');
  ok(w.dropped.length === 1 && w.armour, 'dropped + armour');
  ok(T.whatChanged(path.join(scratch, 'none'), 'tk', []).counts === null, 'missing gaps ok');
  ok(T.advOf('whatever') === 'goh.adv.other', 'advice fallback');

  // routes with a mocked runTool
  const calls = [];
  const finding = { findings: [{ code: 'WARN_PORT_CREW_CAPPED', severity: 'warning', msg: 'GoH crew 5, the port has 4', file: 'f' }, { code: 'PORT_BINARY_COPY', severity: 'note', msg: 'm', file: 'a' }], info: [{ code: 'PORT_BINARY_COPY', severity: 'note', msg: 'm', file: 'b' }] };
  const ctx = { tmpRoot: scratch, game: () => game, runTool: async (tool, entry, args) => { calls.push([tool, args]); if (tool === 'goh2as2') return { code: 0, stdout: JSON.stringify(finding), stderr: 'would write 3 files\n' }; if (tool === 'donorfit') return { code: 0, stdout: JSON.stringify({ misses: ['m1'], warnings: [], notes: [], seats: [1, 2], mdlBones: 9 }), stderr: '' }; return { code: 0, stdout: '0 roots, 0 undefined macros, 0 missing includes', stderr: '' }; } };
  const R = ext.routes;
  const out2 = path.join(game, 'mods', 'goh_tk');
  const p = await R['POST /api/x/goh/convert'](U(''), { unit: 'tk', donor: 'chi-nu', out: out2, goh, game }, ctx);
  ok(p.ok && p.dry && p.warnings.length === 1 && p.infoCount === 2 && p.summary.length === 1, 'plan result');
  const a = calls[0][1];
  ok(a.includes('--dry-run') && ['--rep-key', '--pull-props', '--mtl-fallback', '--match-weapon', '--no-ask'].every(f => a.includes(f)), 'preset flags');
  ok(!a.includes('--allow-launch'), 'no launch flag');
  {   // JOBS: a conversion stopped from the footer answers cancelled (never a failed tool); only a real write marks the job as a write
    const jd = { writes: false }, jw = { writes: false }, stopCtx = j => Object.assign({}, ctx, { job: j, runTool: async () => ({ code: null, cancelled: true, stdout: '', stderr: '' }) });
    const sd = await R['POST /api/x/goh/convert'](U(''), { unit: 'tk', donor: 'chi-nu', out: out2, goh, game }, stopCtx(jd));
    const sw = await R['POST /api/x/goh/convert'](U(''), { unit: 'tk', donor: 'chi-nu', out: out2, goh, game, dry: false, confirm: true }, stopCtx(jw));
    ok(sd.cancelled === true && !jd.writes && sw.cancelled === true && jw.writes === true, 'convert stopped: cancelled, write marked only for a write ' + JSON.stringify([sd, jd, sw, jw]));
  }
  await rej(() => R['POST /api/x/goh/convert'](U(''), { unit: 'tk', donor: 'chi-nu', out: out2, goh, game, dry: false }, ctx), /confirm/, 'write needs confirm');
  const n = calls.length;
  await rej(() => R['POST /api/x/goh/convert'](U(''), { unit: 'tk', donor: 'chi-nu', out: game, goh, game }, ctx), /refused/, 'refuse game root');
  ok(calls.length === n, 'no tool run on refusal');
  fs.writeFileSync(path.join(o, 'mod.info'), 'x');
  const real = await R['POST /api/x/goh/convert'](U(''), { unit: 'tk', donor: 'chi-nu', out: o, goh, game, dry: false, confirm: true }, ctx);
  ok(real.ok && !real.dry && real.what && real.what.values.length === 2, 'real run has what-changed');
  await rej(() => R['POST /api/x/goh/convert'](U(''), { unit: '../x', donor: 'd', out: o, goh, game }, ctx), /unit/, 'bad unit name');
  // fit
  await rej(() => R['POST /api/x/goh/fit'](U(''), { unit: 'tk', out: o, goh, game }, ctx), /GOH-ORIGIN/, 'fit needs origin file');
  fs.writeFileSync(path.join(o, 'GOH-ORIGIN.tsv'), 'x\n');
  fs.mkdirSync(path.join(o, 'resource', 'entity', 'tk'), { recursive: true });
  fs.writeFileSync(path.join(o, 'resource', 'entity', 'tk', 'tk.def'), '{}');
  const f = await R['POST /api/x/goh/fit'](U(''), { unit: 'tk', out: o, goh, game }, ctx);
  ok(f.ok && f.misses.length === 1 && f.seats === 2 && f.bones === 9 && !f.applied, 'fit result');
  await rej(() => R['POST /api/x/goh/fit'](U(''), { unit: 'tk', out: o, goh, game, apply: true }, ctx), /confirm/, 'fit apply needs confirm');
  // show: commands only
  const s = await R['GET /api/x/goh/show'](U('?unit=tk&out=' + encodeURIComponent(out2)), null, ctx);
  ok(s.launch === false && s.steps.length === 3 && s.steps.every(x => !/--allow-launch/.test(x.cmd)), 'show steps, no launch');
  // status
  const st = await R['GET /api/x/goh/status'](U('?goh=' + encodeURIComponent(goh)), null, ctx);
  ok(st.goh && st.game, 'status');
  // units on the fake GoH (no paks): empty list
  const un = await R['GET /api/x/goh/units'](U('?q=tk&goh=' + encodeURIComponent(goh)), null, ctx);
  ok(Array.isArray(un.units) && un.total === 0, 'units on empty goh');

  // game parity: port target as64 (default, argument lists as before) or mowas2 (--exe mowas_2, mowas_2 view, no as64+)
  {
    const tg = T.targetOf;
    ok(tg(undefined).id === 'as64' && tg('').exe === null && tg('as64').exe === null, 'target: default and as64 send no exe');
    ok(tg('mowas2').exe === 'mowas_2' && tg('mowas_2').id === 'mowas2', 'target: mowas2 and mowas_2 give exe mowas_2');
    for (const v of ['goh', 'x', 'mowas3']) { let t = false; try { tg(v); } catch (e) { t = /target/.test(e.message) && e.status === 400; } ok(t, 'target: refuse ' + v); }
    const c0 = calls.length;
    await R['POST /api/x/goh/convert'](U(''), { unit: 'tk', donor: 'chi-nu', out: out2, goh, game }, ctx);
    const want = ['--goh', goh, '--entity', 'tk', '--donor', 'chi-nu', '--rep-key', '--pull-props', '--mtl-fallback', '--match-weapon', '--no-ask', '--game', game, '--out', path.resolve(out2), '--format', 'json', '--dry-run'];
    ok(JSON.stringify(calls[c0][1]) === JSON.stringify(want), 'target as64: goh2as2 argument list unchanged');
    const pm = await R['POST /api/x/goh/convert'](U(''), { unit: 'tk', donor: 'chi-nu', out: out2, goh, game, target: 'mowas2' }, ctx);
    const am = calls[calls.length - 1][1], ix = am.indexOf('--exe');
    ok(pm.target === 'mowas2' && ix > 0 && am[ix + 1] === 'mowas_2' && am.includes('--dry-run'), 'target mowas2: goh2as2 gets --exe mowas_2');
    const n2 = calls.length;
    await rej(() => R['POST /api/x/goh/convert'](U(''), { unit: 'tk', donor: 'chi-nu', out: out2, goh, game, target: 'goh' }, ctx), /target/, 'target goh refused');
    ok(calls.length === n2, 'no tool run on a bad target');
    // no target sent: the request's game decides (header MoW:AS2 -> --exe mowas_2; as64, goh or none -> the AS64 list as before)
    ok(T.targetOf(undefined, { gameId: () => 'mowas2' }).exe === 'mowas_2' && T.targetOf('', { gameId: () => 'goh' }).exe === null && T.targetOf(null, { gameId: () => 'as64' }).exe === null && T.targetOf('as64', { gameId: () => 'mowas2' }).exe === null, 'target: header game when no target is sent, sent target first');
    const ctxM = Object.assign({}, ctx, { gameId: () => 'mowas2' }), c3 = calls.length;
    const ph = await R['POST /api/x/goh/convert'](U(''), { unit: 'tk', donor: 'chi-nu', out: out2, goh, game }, ctxM);
    const ah = calls[c3][1], ih = ah.indexOf('--exe');
    ok(ph.target === 'mowas2' && ih > 0 && ah[ih + 1] === 'mowas_2', 'no target, header MoW:AS2: goh2as2 gets --exe mowas_2');
    const c4 = calls.length;
    await R['POST /api/x/goh/convert'](U(''), { unit: 'tk', donor: 'chi-nu', out: out2, goh, game }, Object.assign({}, ctx, { gameId: () => 'as64' }));
    ok(JSON.stringify(calls[c4][1]) === JSON.stringify(want), 'no target, header AS64: goh2as2 argument list unchanged');
    // fit: donorfit gets --exe mowas_2 (both the check and the apply run), and so does portfix macrocheck (the AS64 list stays without --exe)
    const fo = path.join(scratch, 'o2'); fs.mkdirSync(path.join(fo, 'resource', 'entity', 'tk'), { recursive: true });
    fs.writeFileSync(path.join(fo, 'GOH-ORIGIN.tsv'), 'x\n'); fs.writeFileSync(path.join(fo, 'resource', 'entity', 'tk', 'tk.def'), '{}');
    const c1 = calls.length;
    const fm = await R['POST /api/x/goh/fit'](U(''), { unit: 'tk', out: fo, goh, game, target: 'mowas2', apply: true, confirm: true }, ctx);
    const fc = calls.slice(c1);
    ok(fm.target === 'mowas2' && fc.filter(c => c[0] === 'donorfit').length === 2 && fc.filter(c => c[0] === 'donorfit').every(c => c[1].join(' ').includes('--exe mowas_2')), 'target mowas2: donorfit gets --exe mowas_2');
    const pf = fc.filter(c => c[0] === 'portfix');
    ok(pf.length === 1 && pf[0][1][0] === 'macrocheck' && pf[0][1].join(' ').includes('--exe mowas_2'), 'target mowas2: portfix macrocheck gets --exe mowas_2');
    const c2 = calls.length;
    await R['POST /api/x/goh/fit'](U(''), { unit: 'tk', out: fo, goh, game }, ctx);
    ok(calls.slice(c2).every(c => !c[1].includes('--exe')), 'target as64: fit argument lists have no --exe');
    // show: as64+ only for AS64; MoW:AS2 names mowas_2.exe for prove (plan only)
    const sa = await R['GET /api/x/goh/show'](U('?unit=tk&out=' + encodeURIComponent(out2)), null, ctx);
    const sm = await R['GET /api/x/goh/show'](U('?unit=tk&target=mowas2&out=' + encodeURIComponent(out2)), null, ctx);
    const pl = r => r.steps.find(x => x.id === 'plan').cmd;
    ok(/--mods as64\+,goh_tk/.test(pl(sa)) && !/--exe/.test(pl(sa)) && sa.target === 'as64', 'show as64: as64+ in the prove line');
    ok(!/as64\+/.test(pl(sm)) && /--exe mowas_2\.exe --mods goh_tk/.test(pl(sm)) && /--plan$/.test(pl(sm)) && sm.launch === false, 'show mowas2: no as64+, mowas_2.exe, plan only');
    // donor pool: the vfs view per target, cached per folder and exe (fixture: as64.exe + base def a + as64/core def b)
    const as2 = path.join(scratch, 'as2'), vd = (root, stem) => { const d = path.join(root, 'resource', 'entity', '-vehicle', 'tank_medium', stem); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, stem + '.def'), '{game_entity\r\n {extension "' + stem + '.mdl"}\r\n}\r\n'); };
    fs.mkdirSync(as2, { recursive: true }); fs.writeFileSync(path.join(as2, 'as64.exe'), ''); vd(as2, 'tka'); vd(path.join(as2, 'as64', 'core'), 'tkb');
    { const d = path.join(as2, 'as64', 'core', 'resource', 'entity', '-vehicle', 'tank_medium', 'x', 'tkc'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'tkc.def'), '{game_entity\r\n {extension "tkc.mdl"}\r\n}\r\n'); }   // an x/ variant: never in the pool
    // the page's pool is donorpick's own exported vanillaPool(game, exe): the real module, the cache is the page's
    const dp = require('../../../donorpick/donorpick');
    let seen = []; const spy = Object.assign({}, dp, { vanillaPool: (g, e) => { seen.push(e); return dp.vanillaPool(g, e); } });
    const stems = p => p.map(x => x.stem).sort().join();
    const p64 = T.vanillaPool(spy, as2, null), pm2 = T.vanillaPool(spy, as2, 'mowas_2');
    ok(stems(p64) === 'tka,tkb', 'donor pool as64: base and as64/core (' + stems(p64) + ')');
    ok(stems(pm2) === 'tka', 'donor pool mowas2: no as64/core (' + stems(pm2) + ')');
    ok(seen.join() === ',mowas_2', 'donor pool: donorpick.vanillaPool called with no exe for as64 and mowas_2 for mowas2 (' + seen.join() + ')');
    ok(T.vanillaPool(spy, as2, null) === p64 && T.vanillaPool(spy, as2, 'mowas_2') === pm2 && p64 !== pm2 && seen.length === 2, 'donor pool cached per folder and exe');
    // GoH folder: ?goh= first, else the page's GoH folder (ctx.gohDir, header x-arsenal-goh), else gamedir.goh()
    ok(T.gohDir({ gohDir: () => goh }, null) === goh, 'GoH folder from ctx.gohDir');
    ok(T.gohDir({ gohDir: () => path.join(scratch, 'nope') }, { searchParams: new URLSearchParams({ goh }) }) === goh, 'GoH folder: ?goh= first');
  }

  // GT-39: wrecks and damage stages (x/<name>_x, _xx) are not units
  ok(T.unitOfKey('entity/-vehicle/germany/tank_medium/panzer4h/panzer4h.def').name === 'panzer4h', 'unit key read');
  ok(T.unitOfKey('entity/-vehicle/germany/tank_medium/x/panzer4h_x/panzer4h_x.def') === null, 'wreck _x dropped');
  ok(T.unitOfKey('entity/-vehicle/germany/tank_medium/x/panzer4h_xx/panzer4h_xx.def') === null, 'wreck _xx dropped');
  ok(T.unitOfKey('Entity/-Vehicle/usa/car/jeep_xx/jeep_xx.def') === null, 'stem _xx dropped outside x/');

  // the names index (the search boxes' index): a real pak fixture (zip) with 250 medium tanks over two nations, cars, a gun, a wreck and a
  // damage stage (not units); the donors = the vanilla pool of the AS2 fixture (tka in the base, tkb in as64/core)
  const gohB = path.join(scratch, 'gohb'), as2B = path.join(scratch, 'as2');
  {
    const zw = require('../../../lib/zipwrite'), files = [], def = n => Buffer.from('{game_entity\r\n {extension "' + n + '.mdl"}\r\n}\r\n');
    for (let i = 0; i < 250; i++) { const n = 'pz' + String(i).padStart(3, '0'), nat = i % 2 ? 'usa' : 'germany'; files.push(['-vehicle/' + nat + '/tank_medium/' + n + '/' + n + '.def', def(n)]); }
    for (const n of ['jeep', 'opel']) files.push(['-vehicle/usa/car/' + n + '/' + n + '.def', def(n)]);
    files.push(['-vehicle/germany/cannon/pak40/pak40.def', def('pak40')]);
    files.push(['-vehicle/germany/tank_medium/x/pz000_x/pz000_x.def', def('pz000_x')], ['-vehicle/usa/car/jeep_xx/jeep_xx.def', def('jeep_xx')]);
    fs.mkdirSync(path.join(gohB, 'resource', 'entity'), { recursive: true });
    zw.writeZip(path.join(gohB, 'resource', 'entity', 'vehicle.pak'), files);
  }
  const ctxB = { tmpRoot: scratch, game: () => as2B, gohDir: () => gohB };
  const NM = (q, c) => R['GET /api/x/goh/names'](U('?' + q), null, c || ctxB);
  {
    const u = await NM('kind=units');
    ok(u.all === 253 && u.items.length === 253 && !u.items.some(x => /_xx?$/.test(x.name)), 'names: every unit, wrecks left out (' + u.all + ')');
    const p = u.items.find(x => x.name === 'pak40'), j = u.items.find(x => x.name === 'jeep');
    ok(p && p.group === 'cannon' && p.sub === 'germany' && j && j.group === 'car' && j.sub === 'usa', 'names: kind as group, nation as sub');
    const d = await NM('kind=donors');
    ok(d.items.map(x => x.name).join() === 'tka,tkb' && d.items[0].sub === 'tank_medium' && d.target === 'as64', 'names: donors = the as64 pool (base and as64/core)');
    const dm = await NM('kind=donors&target=mowas2');
    ok(dm.items.map(x => x.name).join() === 'tka' && dm.target === 'mowas2', 'names: MoW:AS2 pool has no as64/core');
    await rej(() => NM('kind=nope'), /kind/, 'names: unknown kind refused');
    // CACHE (gui README contract 1): the unit list is kept in the shared store under the GoH install's stamp (lib/gameview)
    {
      const GV = require('../../../lib/gameview'), pakset = require('../../../lib/pakset'), zw = require('../../../lib/zipwrite'), open0 = pakset.open;
      const S = T.storeOf(ctxB), st = () => S.state('goh.units', T.LIST_VER, T.unitParts(gohB), T.unitStamps(gohB));
      let opens = 0; pakset.open = (...x) => { opens++; return open0(...x); };
      const restart = () => { T.mem.clear(); GV.drop(); };   // a new process, and the stamp read again
      try {
        const a = T.listUnits(ctxB, gohB);
        ok(a.length === 253 && st().state === 'ready' && !fs.existsSync(path.join(scratch, 'as2gui-goh')), 'cache: the unit list is in the store, no file in the temp folder');
        restart(); opens = 0;
        const b = T.listUnits(ctxB, gohB);
        ok(opens === 0 && JSON.stringify(b) === JSON.stringify(a), 'cache: after a restart the kept list is served, equal, no pak opened');
        fs.writeFileSync(path.join(gohB, 'resource', 'entity', 'note.txt'), 'x'); restart();
        T.listUnits(ctxB, gohB);
        ok(opens === 0 && st().state === 'ready', 'cache: a loose file that is no pak does not rebuild the list');
        zw.writeZip(path.join(gohB, 'resource', 'entity', 'more.pak'), [['-vehicle/usa/car/willys/willys.def', Buffer.from('{game_entity}\r\n')]]); restart();
        ok(st().state === 'stale' && st().why.join() === 'game', 'cache: a new pak makes the kept list stale (game)');
        const c = T.listUnits(ctxB, gohB);
        ok(opens === 1 && c.length === 254 && c.some(u => u.name === 'willys') && st().state === 'ready', 'cache: the list is read again with the new unit');
        S.clear('goh.units'); restart();
        ok(JSON.stringify(T.listUnits(ctxB, gohB)) === JSON.stringify(c) && opens === 2, 'cache: the kept answer equals a fresh one');
        // Prepare section
        const P = ext.prep[0], q = { mod: '', game: { id: 'goh', dir: gohB } }, sets = [];
        ok(P.id === 'goh.units' && P.games.join() === 'goh' && P.areas.length === 0 && ['en', 'ru', 'uk', 'zh'].every(g => ext.lang[g][P.title]), 'prep: goh.units shape, title in four languages');
        S.clear('goh.units'); restart();
        ok(P.state(ctxB, q).state === 'none' && P.state(ctxB, { game: { id: 'goh', dir: path.join(scratch, 'nope') } }).state === 'na', 'prep: none before, na without the GoH folder');
        const pr = await P.run(ctxB, q, { cancelled: false, set: o => sets.push(o) });
        ok(pr.units === 254 && sets.length === 2 && P.state(ctxB, q).state === 'ready', 'prep: run fills the store');
        restart(); opens = 0;
        ok((await R['GET /api/x/goh/units'](U('?q=willys'), null, ctxB)).units.length === 1 && opens === 0, 'prep: the page route then hits the store');
        fs.rmSync(path.join(gohB, 'resource', 'entity', 'more.pak'), { force: true }); fs.rmSync(path.join(gohB, 'resource', 'entity', 'note.txt'), { force: true }); restart();
      } finally { pakset.open = open0; }
      // a write (the conversion) tells the shared walk of the output mod folder; a preview does not
      const tch = [], MT = require('../../../lib/modtree'), tctx = Object.assign({}, ctx, { modtree: Object.assign({}, MT, { touch: d => tch.push(d) }) });
      await R['POST /api/x/goh/convert'](U(''), { unit: 'tk', donor: 'chi-nu', out: out2, goh, game }, tctx);
      ok(tch.length === 0, 'touch: a preview touches nothing');
      await R['POST /api/x/goh/convert'](U(''), { unit: 'tk', donor: 'chi-nu', out: out2, goh, game, dry: false, confirm: true }, tctx);
      ok(tch.length === 1 && path.resolve(tch[0]) === path.resolve(out2), 'touch: a written conversion touches the output mod folder');
    }
    await rej(() => NM('kind=units', { tmpRoot: scratch, game: () => as2B, gohDir: () => path.join(scratch, 'nope') }), /Gates of Hell/, 'names: no GoH install');
    await rej(() => NM('kind=donors', { tmpRoot: scratch, game: () => null, gohDir: () => gohB }), /Assault Squad 2/, 'names: no AS2 folder for donors');
    ok(!R['GET /api/x/goh/browse'] && !R['GET /api/x/goh/donorbrowse'], 'the grouped Browse routes are gone (Browse = the file picker)');
  }

  // texts: same keys in en, ru, uk, zh; goh.outRates says what the port does, no test numbers; no [T] tags on screen
  const L = ext.lang, enK = Object.keys(L.en).sort().join();
  ok(['ru', 'uk', 'zh'].every(l => Object.keys(L[l]).sort().join() === enK), 'same keys in 4 languages');
  ok(['en', 'ru', 'uk', 'zh'].every(l => !/\d/.test(L[l]['goh.outRates'].replace(/AS2/g, ''))), 'outRates has no test numbers');
  ok(!/test/i.test(L.en['goh.outRates'].replace(/test map/i, '')) && /donor/.test(L.en['goh.outRates']), 'outRates says what the port does');
  // MoW:AS2 target: the next-step line names MoW:AS2 (not AS64) in every language, and the page picks it by the result's target
  ok(['en', 'ru', 'uk', 'zh'].every(l => /MoW:AS2/.test(L[l]['goh.next1.mowas2']) && !/AS64/.test(L[l]['goh.next1.mowas2']) && /\{o\}/.test(L[l]['goh.next1.mowas2'])), 'next1.mowas2 names MoW:AS2 in 4 languages');
  ok(/r\.target==='mowas2'\?'goh\.next1\.mowas2':'goh\.next1'/.test(fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8')), 'next line picked by the result target');
  ok(['en', 'ru', 'uk', 'zh'].every(l => Object.values(L[l]).every(v => !/\[[VIT]\]/.test(v))), 'no [V]/[I]/[T] tags in texts');

  // GT-05: the page script in a small fake DOM; Preview and Convert must render cards, not throw from appendChild
  await (async () => {
    class N {
      constructor(tag) { this.tagName = tag; this.children = []; this._t = ''; this.attrs = {}; this.ls = {}; this.value = ''; this.disabled = false; this.className = ''; }
      appendChild(c) { if (!(c instanceof N)) throw new TypeError("Failed to execute 'appendChild' on 'Node': parameter 1 is not of type 'Node'."); if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; }
      removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
      set textContent(v) { this.children.forEach(c => { c.parentNode = null; }); this.children = []; this._t = String(v); }
      get textContent() { return this._t + this.children.map(c => c.textContent).join(' '); }
      setAttribute(k, v) { this.attrs[k] = v; }
      addEventListener(e, f) { (this.ls[e] = this.ls[e] || []).push(f); }
      fire(e) { (this.ls[e] || []).forEach(f => f({ key: '', preventDefault() {} })); }
      focus() {}
    }
    const all = n => [n].concat(...n.children.map(all));
    const find = (root, tag, t) => all(root).find(n => n.tagName === tag && n._t === t);
    const document = { createElement: t => new N(t), createTextNode: s => { const n = new N('#text'); n._t = s; return n; } };
    const pageSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'page.js'), 'utf8');
    const hSrc = /function h\(tag,attrs,kids\)\{[\s\S]*?return e\}/.exec(pageSrc);
    ok(hSrc, 'h() found in page.js'); if (!hSrc) return;
    const h = new Function('document', hSrc[0] + ';return h')(document);
    const tick = () => new Promise(r => setTimeout(r, 0));
    const plan = { ok: true, dry: true, unit: 'panzer4h', donor: 'pz4h', out: 'C:/g/mods/goh_panzer4h', errors: [], warnings: [{ code: 'WARN_PORT_CREW_CAPPED', severity: 'warning', msg: 'GoH crew 5, the port has 4', n: 1 }], infoCount: 1, infoGroups: [{ code: 'PORT_BINARY_COPY', n: 1, sample: 'm' }], summary: ['would write 3 files', 'fit pass: 0'], what: null };
    const real = Object.assign({}, plan, { dry: false, summary: ['wrote 3 files'], what: { crew: { goh: 5, port: 4 }, values: [{ key: 'speed', goh: 12, written: 6, donor: 5, adv: 'goh.adv.speed' }], dropped: [{ code: 'WARN_PORT_DROP_EVENTS', n: 2 }], counts: { dropped: 2, baked: 1, donor: 1, unexplained: 0 } } });
    const api = (u, b) => Promise.resolve(/status/.test(u) ? { goh: 'C:/goh', game: 'C:/g', ok: true } : /units/.test(u) ? { units: [{ name: 'panzer4h', nation: 'germany', cls: 'tank_medium' }], total: 1 } : /convert/.test(u) ? (b.dry ? plan : real) : {});
    const EXT_SCREENS = {}, noop = () => {};
    let xopt = null, xfills = 0;
    new Function('EXT_SCREENS', 'h', 'tx', 'api', 'gameDir', 'toast', 'LANGS', 'LANG', 'RUN', 'busyMsg', 'setMod', 'show', 'pick', 'window', 'document', 'blkApply', 'xlateCard', ext.script)(
      EXT_SCREENS, h, (k) => k, api, () => 'C:/g', noop, { en: {} }, 'en', false, noop, noop, noop, noop, { confirm: () => true }, document, noop,
      o => { xopt = o; return { el: new N('div'), refresh: () => { xfills++; }, keys: () => false }; });   // the Translate numbers card (page.js xlateCard) stubbed
    const root = new N('div'); EXT_SCREENS.goh(root); await tick(); await tick();
    const q = all(root).find(n => n.tagName === 'input' && n.attrs.placeholder === 'goh.searchPh'); q.value = 'panzer4h';
    find(root, 'button', 'goh.search').fire('click'); await tick(); await tick();
    find(root, 'button', 'panzer4h').fire('click');
    const din = all(root).find(n => n.tagName === 'input' && n.attrs.placeholder === 'goh.donorPh'); din.value = 'pz4h'; din.fire('input');
    ok(xopt && xopt.auto.entity() === 'panzer4h' && xopt.auto.donor() === 'pz4h' && /goh_panzer4h$/.test(xopt.auto.out()) && xfills > 0, 'Translate numbers: fed the chosen unit, donor and output folder, refreshed on change');
    find(root, 'button', 'goh.plan').fire('click'); await tick(); await tick();
    let txt = root.textContent;
    ok(!/appendChild/.test(txt), 'GT-05 Preview: no appendChild error');
    ok(/goh\.planCard/.test(txt) && /would write 3 files/.test(txt) && /fit pass: 0/.test(txt), 'GT-05 Preview card shows the summary lines');
    const go = find(root, 'button', 'goh.convert'); ok(!go.disabled, 'Convert enabled after a good preview');
    go.fire('click'); await tick(); await tick();
    txt = root.textContent;
    ok(!/appendChild/.test(txt) && /goh\.doneCard/.test(txt) && /wrote 3 files/.test(txt) && /goh\.whatT/.test(txt) && /goh\.fitT/.test(txt), 'Convert result renders all cards');
    ok(!/goh\.planCard/.test(txt), 'a new run removes the cards of the last one');
    // target pick with nothing stored: the header game decides (no S or as64: as64; S.gameId mowas2: mowas2)
    const tsel0 = all(root).find(n => n.tagName === 'select' && n.attrs['aria-label'] === 'goh.target');
    ok(tsel0 && tsel0.value === 'as64', 'target pick: as64 with no header game');
    const hadS = Object.prototype.hasOwnProperty.call(globalThis, 'S'), oldS = globalThis.S;
    globalThis.S = { gameId: 'mowas2' };
    try {
      const root2 = new N('div'); EXT_SCREENS.goh(root2);
      const tsel2 = all(root2).find(n => n.tagName === 'select' && n.attrs['aria-label'] === 'goh.target');
      ok(tsel2 && tsel2.value === 'mowas2', 'target pick: mowas2 when the header game is MoW:AS2 and nothing is stored');
      await tick(); await tick();
    } finally { if (hadS) globalThis.S = oldS; else delete globalThis.S; }
  })();

  // blocks: the whole page in the fake DOM, the screen driven to its loaded states, every part in a leaf block
  await (async () => {
    const B = require('./blkboot'), en = ext.lang.en;
    const plan = { ok: true, dry: true, unit: 'panzer4h', donor: 'pz4h', out: 'C:/g/mods/goh_panzer4h', errors: [{ code: 'X', severity: 'error', msg: 'e', n: 2 }], warnings: [{ code: 'WARN_PORT_CREW_CAPPED', severity: 'warning', msg: 'GoH crew 5', n: 1 }], infoCount: 1, infoGroups: [{ code: 'PORT_BINARY_COPY', n: 1, sample: 'm' }], summary: ['would write 3 files'], what: null };
    const real = Object.assign({}, plan, { dry: false, what: { crew: { goh: 5, port: 4 }, weapon: { rep: 'a', to: 'b', from: 'c' }, armour: 'x', donor: 'd', values: [{ key: 'speed', goh: 12, written: 6, donor: 5, adv: 'goh.adv.speed' }], dropped: [{ code: 'WARN_PORT_DROP_EVENTS', n: 2 }], counts: { dropped: 2, baked: 1, donor: 1, unexplained: 0 } } });
    let fail1 = false;
    const P = await B.boot({ 'as2gui.game': 'C:/g' }, (p, m, b) => /status$/.test(p) ? { goh: 'C:/goh', game: 'C:/g', ok: true } : /units$/.test(p) ? { units: [{ name: 'panzer4h', nation: 'germany', cls: 'tank_medium' }], total: 1 } :
      /donors$/.test(p) ? { donors: [{ stem: 'pz4h', why: ['same class'] }], cls: 'tank_medium', confidence: 'high' } :
      /convert$/.test(p) ? (fail1 ? { ok: false, error: 'bad', lines: ['l1'] } : b.dry ? plan : real) : /fit$/.test(p) ? { misses: ['m1'], problems: [], seats: 2, bones: 9, notes: ['n'] } :
      /show$/.test(p) ? { steps: [{ id: 'a', cmd: 'x' }] } : undefined);
    await P.settle();
    const s = P.sec('goh'), Q = (tag, f) => s.all().find(e => e.tagName === tag && f(e)), btn = t => Q('BUTTON', e => e.textContent === t);
    const say = (m, pr) => ok(!pr.length, m + (pr.length ? ': ' + pr.slice(0, 12).join('; ') : ''));
    say('blocks: first build', B.check(s));
    ok(['title', 'banner', 'stat', 'intro', 's1', 's2', 's3', 'res'].every(i => s.children.some(c => c.dataset.blk === i)), 'blocks: the screen holds its cards as blocks');
    Q('INPUT', e => e.attrs.placeholder === en['goh.searchPh']).value = 'panzer4h';
    btn(en['goh.search']).click(); await P.settle();
    btn('panzer4h').click();
    btn(en['goh.suggest']).click(); await P.settle();
    btn(en['goh.useDonor']).click();
    {   // Translate numbers: the old Translate page is a fold of step 3, its form filled from the steps (W5)
      const fb = id => s.all().find(e => B.isB(e) && e.dataset.blk === id), xf = fb('s3.xlate'), xt = xf && xf.all().find(e => B.isB(e) && e.dataset.blk === 'translate'), lab = n => xt && xt.all().find(e => e.tagName === 'LABEL' && e.dataset.f === n);
      const val = n => { const l = lab(n); if (!l) return null; const i = l.all().find(e => /^(INPUT|TEXTAREA)$/.test(e.tagName)); return i ? i.value : null; };
      ok(xf && xf.tagName === 'DETAILS' && xf.parentNode === fb('s3') && xf.has(en['goh.xlateT']), 'Translate numbers: a fold in step 3');
      ok(val('entity') === 'panzer4h' && val('donor') === 'pz4h' && val('out') === 'C:/g/mods/goh_panzer4h' && val('goh') != null, 'Translate numbers: unit, donor and output folder come from the steps', [val('entity'), val('donor'), val('out')].join('|'));
      ok(typeof P.ctx.__as2gui.screens.goh.keys === 'function' && !P.ctx.__as2gui.screens.xlate && !P.sec('xlate'), 'Translate numbers: the page passes its keys on; no Translate page of its own');
    }
    btn(en['goh.plan']).click(); await P.settle();
    say('blocks: after search, donors and a preview', B.check(s));
    ok(B.ids(s).includes('res.sum') && B.ids(s).includes('res.find.info'), 'blocks: the preview drew its result blocks');
    btn(en['goh.convert']).click(); await P.settle();
    btn(en['goh.fitCheck']).click(); await P.settle();
    btn(en['goh.showBtn']).click(); await P.settle();
    say('blocks: after convert, fit check and show', B.check(s));
    ok(['res.what.values', 'res.fit.out', 'res.next.btns', 'res.banner2'].every(i => B.ids(s).includes(i)), 'blocks: the convert result drew its blocks');
    // a profile that moved a result block out of the result box: the next run removes it there and puts the new one back where the profile says
    const X = P.ctx.as2Blocks, find = id => s.all().find(e => B.isB(e) && e.dataset.blk === id);
    X.put(s, find('res.what'), find('intro'));
    fail1 = true; btn(en['goh.plan']).click(); await P.settle();
    ok(!find('res.what') && find('res.err') && B.ids(s).filter(i => /^res\./.test(i)).join() === 'res.err', 'blocks: a failed run leaves only its error block, moved blocks too');
    say('blocks: after a failed run', B.check(s));
    fail1 = false;

    // game parity: the target pick (as64 default, mowas2) goes with every call and into the Translate numbers exe field
    const tsel = Q('SELECT', e => e.attrs['aria-label'] === en['goh.target']);
    ok(tsel && tsel.value === 'as64' && find('tgt') && find('tgt.pick'), 'target: a pick in its own block, AS64 first');
    const sent = re => P.calls.filter(c => re.test(c[1]));
    ok(sent(/\/api\/x\/goh\/(donors|show)\?/).every(c => /[?&]target=as64(&|$)/.test(c[1])) && sent(/\/api\/x\/goh\/convert$/).every(c => c[2].target === 'as64'), 'target as64 sent with donors, show and convert');
    tsel.value = 'mowas2'; tsel.fire('change'); await P.settle();
    ok(!B.ids(s).some(i => /^res\./.test(i)), 'target change drops the last result');
    ok(btn(en['goh.convert']).disabled, 'target change: a new preview is needed before Convert');
    btn(en['goh.suggest']).click(); await P.settle();
    btn(en['goh.plan']).click(); await P.settle();
    const lastD = sent(/\/api\/x\/goh\/donors\?/).pop(), lastC = sent(/\/api\/x\/goh\/convert$/).pop();
    ok(lastD && /[?&]target=mowas2(&|$)/.test(lastD[1]) && lastC && lastC[2].target === 'mowas2', 'target mowas2 sent with donors and convert');
    P.ctx.__as2gui.screens.goh.refresh(); await P.settle();
    {
      const xf = find('s3.xlate'), xt = xf && xf.all().find(e => B.isB(e) && e.dataset.blk === 'translate'), l = xt && xt.all().find(e => e.tagName === 'LABEL' && e.dataset.f === 'exe');
      const i = l && l.all().find(e => /^(INPUT|SELECT)$/.test(e.tagName));
      ok(i && i.value === 'mowas_2', 'target mowas2: Translate numbers exe field is mowas_2 (' + (i ? i.value : 'no field') + ')');
    }
    say('blocks: after a target change', B.check(s));
  })();

  // Browse on the page (whole page in the fake DOM): every box's Browse is the shared file picker (searchKit.picker) with a spec; the
  // picker is stubbed here, so the spec it gets is checked and a pick is answered with done(path, entry)
  await (async () => {
    const B = require('./blkboot'), en = ext.lang.en;
    const units = [];
    for (let i = 0; i < 250; i++) units.push({ name: 'pz' + String(i).padStart(3, '0'), group: 'tank_medium', sub: i % 2 ? 'usa' : 'germany' });
    units.push({ name: 'jeep', group: 'car', sub: 'usa' });
    const P = await B.boot({ 'as2gui.game': 'C:/g' }, (p, m, b, u) => {
      if (/status$/.test(p)) return { goh: 'C:/goh', game: 'C:/g', ok: true };
      if (/names$/.test(p)) return /kind=units/.test(u) ? { kind: 'units', all: units.length, items: units } : { kind: 'donors', all: 1, items: [{ name: 'tiger', group: 'tank', sub: 'tank_heavy' }] };
      if (/units$/.test(p)) return { units: [], total: 0 };
      return undefined;
    });
    await P.settle();
    const s = P.sec('goh'), SK = P.ctx.searchKit, specs = [];
    let answer = null;
    SK.picker = (spec, done) => { spec.at = typeof spec.start === 'function' ? spec.start() : spec.start; specs.push(spec); if (answer) done(answer[0], answer[1]); };
    const kitBtn = key => s.all().find(e => e.tagName === 'BUTTON' && String(e.className).split(' ').indexOf('sk-browse') >= 0 && (() => { for (let x = e.parentNode; x; x = x.parentNode) if (x.attrs && x.attrs['data-sk'] != null) return x.attrs['data-sk'] === key; return false; })());
    const box = ph => s.all().find(e => e.tagName === 'INPUT' && (e.attrs.placeholder === ph || e.attrs['aria-label'] === ph));
    const b1 = kitBtn('goh.unit'), b2 = kitBtn('goh.donor'), b3 = kitBtn('goh.out');
    ok(b1 && b2 && b3, 'a kit Browse beside the unit, donor and output boxes');
    ok(!s.all().some(e => e.tagName === 'BUTTON' && /gohbrowse/.test(String(e.className))) && !P.doc.body.all().some(e => e.tagName === 'DIALOG' && e.classList.contains('gohbr')), 'no grouped Browse dialog any more');
    // unit: the GoH data at entity/-vehicle, .def files; the picked def's name chooses the unit (output folder follows)
    answer = ['entity/-vehicle/usa/tank_medium/pz241/pz241.def', { view: 'data', path: 'entity/-vehicle/usa/tank_medium/pz241/pz241.def', key: 'resource/entity/-vehicle/usa/tank_medium/pz241/pz241.def', name: 'pz241.def', where: 'vanilla' }];
    b1.click(); await P.settle();
    const sp1 = specs[specs.length - 1];
    ok(sp1 && sp1.mode === 'file' && sp1.view === 'data' && sp1.start === 'entity/-vehicle' && String(sp1.exts) === 'def', 'Browse 1: the picker on the game data at entity/-vehicle, .def files (' + JSON.stringify(sp1) + ')');
    ok(box(en['goh.searchPh']).value === 'pz241' && /pz241/.test(s.textContent) && /goh_pz241$/.test(box(en['goh.out']).value), 'Browse 1: the pick fills the box and chooses the unit (output folder follows)');
    // donor: the AS2 game's data (paks too: spec game 'mowas2', not the header game GoH) at entity, .def files; the def's name is the donor
    answer = ['entity/-vehicle/tank_heavy/tiger/tiger.def', { view: 'data', path: 'entity/-vehicle/tank_heavy/tiger/tiger.def' }];
    b2.click(); await P.settle();
    const sp2 = specs[specs.length - 1], st2 = sp2 && sp2.at;
    ok(sp2 && sp2.mode === 'file' && sp2.view === 'data' && sp2.game === 'mowas2' && st2 === 'entity' && String(sp2.exts) === 'def', 'Browse 2: the picker in the AS2 game data at entity, .def files (' + st2 + ')');
    ok(box(en['goh.donorPh']).value === 'tiger', 'Browse 2: the pick puts the donor name in the box');
    // output folder: a folder to write to, at the box's folder
    answer = ['C:/g/mods/goh_other', { view: 'disk', path: 'C:/g/mods/goh_other' }];
    b3.click(); await P.settle();
    const sp3 = specs[specs.length - 1], st3 = sp3 && sp3.at;
    ok(sp3 && sp3.mode === 'dir' && sp3.view === 'disk' && sp3.out === true && st3 === 'C:/g/mods/goh_pz241', 'Browse 3: a folder to write to, at the box folder (' + st3 + ')');
    ok(box(en['goh.out']).value === 'C:/g/mods/goh_other', 'Browse 3: the picked folder goes in the box');
    s.all().find(e => e.tagName === 'BUTTON' && e.textContent === en['goh.plan']).click(); await P.settle();
    const cv = P.calls.filter(c => /\/api\/x\/goh\/convert$/.test(c[1])).pop();
    ok(cv && cv[2].donor === 'tiger' && cv[2].unit === 'pz241' && cv[2].out === 'C:/g/mods/goh_other', 'Browse: the preview uses the browsed unit, donor and folder');
    const pr = B.check(s); ok(!pr.length, 'blocks: after browsing' + (pr.length ? ': ' + pr.slice(0, 12).join('; ') : ''));
  })();

  console.log(fail ? 'goh ext: FAIL ' + fail : 'goh ext: PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL ' + (e.stack || e)); process.exit(1); });
