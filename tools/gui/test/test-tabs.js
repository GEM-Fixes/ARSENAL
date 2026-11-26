// game parity (2026-11-14), the shell part: tools/gui/groups.js lists for MoW:AS2 and GoH every tab, sub-tab and page of AS64 in the
// same order and shape (the Map Viewer rows exactly as they were); a whole page that cannot exist in a game stays listed and sits in
// that game's na map {pageId: 'na.<page>.<game>'}, its words in en ru uk zh (an ext page in the ext's lang, a core page in lang/*.json);
// contract fix takes --exe and --game-version; contract play/install/uninstall/probe/e2e/dev-loop take --target (GoH refused, MoW:AS2 dry only); lib/writeguard finds the GoH install through gamedir (no drive path in the file).
// Made-up folders only (a plain-named folder made the GoH install through GOH_GAME); nothing is started, no install is written.
// node test-tabs.js <scratch dir>; last line 'tabs test: N passed, 0 failed'. Author: Imperator_Aug (ARSENAL, ia-3b7e19c4)
// Author: Imperator_Aug (ARSENAL, ia-6041f0d7)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const scratchBase = path.resolve(process.argv[2] || os.tmpdir()); fs.mkdirSync(scratchBase, { recursive: true });
const scratch = fs.mkdtempSync(path.join(scratchBase, 'tabs-'));
let passes = 0, fails = 0;
const ok = (c, name, more) => { if (c) passes++; else { fails++; console.log('FAIL ' + name); if (more !== undefined) console.log('  ' + String(more).slice(0, 600)); } };

const { GAMES, DEFAULT } = require('../groups');
const by = Object.fromEntries(GAMES.map(g => [g.id, g]));
const A = by.as64;
ok(DEFAULT === 'as64' && GAMES.map(g => g.id).join() === 'mowas2,as64,goh', 'three games, as64 the default', GAMES.map(g => g.id).join());

// 1. same tabs, same sub-tabs, every AS64 page in the same place and order
const pagesOf = g => g.tabs.flatMap(t => t.subs.flatMap(s => s.pages.map(r => r.split('/')[0])));
for (const id of ['mowas2', 'goh']) {
  const g = by[id];
  ok(g.tabs.map(t => t.id).join() === A.tabs.map(t => t.id).join(), id + ': the AS64 tabs in the same order', g.tabs.map(t => t.id).join());
  ok(g.tabs.every((t, i) => t.key === A.tabs[i].key && t.label === A.tabs[i].label), id + ': each tab has the AS64 label and Alt key');
  for (const t of A.tabs) {
    const gt = g.tabs.find(x => x.id === t.id);
    ok(gt && gt.subs.map(s => s.id).join() === t.subs.map(s => s.id).join(), id + ': tab ' + t.id + ' has the AS64 sub-tabs in order', gt && gt.subs.map(s => s.id).join());
    for (const s of t.subs) {
      const gs = gt && gt.subs.find(x => x.id === s.id);
      const mine = gs ? gs.pages.filter(r => s.pages.includes(r)) : [];
      ok(gs && gs.label === s.label && mine.join() === s.pages.join(), id + ': ' + t.id + '/' + s.id + ' lists ' + s.pages.join(), gs && gs.pages.join());
      ok(gs && typeof gs.why === 'string' && gs.why.length > 5, id + ': ' + t.id + '/' + s.id + ' says why');
    }
  }
  const extra = pagesOf(g).filter(p => !pagesOf(A).includes(p));
  ok(extra.join() === (id === 'goh' ? 'goh' : ''), id + ': pages beyond AS64 (only the GoH port page under GoH)', extra.join());
}
ok(!pagesOf(A).includes('goh') && !pagesOf(by.mowas2).includes('goh') && by.goh.open.join() === 'goh', 'the goh page is GoH only and open there');
// 1b. (sweep) every AS64 page id is in the MoW:AS2 and GoH tab tree, open or in na with a reason key in en ru uk zh (ext lang or core lang);
// by name: Maps (its Open in Map Viewer button), Editor and Models (the Map Viewer object card's Open in Editor / Open in Models)
{
  const EXTS = require('../ext');
  const CL = Object.fromEntries(['en', 'ru', 'uk', 'zh'].map(l => [l, JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'lang', l + '.json'), 'utf8'))]));
  const has4 = (p, k) => { const e = EXTS.find(x => x.id === p); const L = e ? e.lang || {} : CL; return ['en', 'ru', 'uk', 'zh'].every(l => L[l] && typeof L[l][k] === 'string' && L[l][k].length > 10); };
  for (const id of ['mowas2', 'goh']) {
    const g = by[id], mine = pagesOf(g), na = g.na || {};
    const bad = [...new Set(pagesOf(A))].filter(p => !mine.includes(p) || (na[p] && !has4(p, na[p])));
    ok(!bad.length, id + ': every AS64 page is listed, open or na with its reason in four languages', bad.join());
  }
  for (const p of ['maps', 'ide']) ok(['mowas2', 'goh'].every(id => pagesOf(by[id]).includes(p) && !by[id].na[p]), 'maps and ide are open under MoW:AS2 and GoH: ' + p);
  ok(pagesOf(by.mowas2).includes('models') && !by.mowas2.na.models, 'models is open under MoW:AS2');
  ok(pagesOf(by.goh).includes('models') && !by.goh.na.models, 'models is listed under GoH and open (owner decision 2026-11-15: every tab works under GoH)');
}

// 2. the Map Viewer rows stay exactly as they were
const VIEW = {
  mowas2: 'mapviz --target mowas2: map list, layers and pictures (lib/vfs exe mowas_2)',
  as64: 'mapviz --target as64: map list, layers and pictures (lib/vfs exe as64)',
  goh: 'mapviz --target goh: map list, layers and pictures (lib/vfs exe goh)',
};
for (const g of GAMES) {
  const s = g.tabs.find(t => t.id === 'maps').subs.find(x => x.id === 'viewer');
  ok(s && s.label === 'grp.s.viewer' && s.pages.join() === 'mapviz' && s.why === VIEW[g.id], g.id + ': Map Viewer row unchanged', s && s.why);
}

// 3. na maps: GoH Models, Bots, Doctrine, Play, Test Run; none under AS64 and MoW:AS2
const NA_GOH = {};   // owner decision 2026-11-15: no page is switched off under GoH
ok(JSON.stringify(A.na) === '{}' && JSON.stringify(by.mowas2.na) === '{}', 'AS64 and MoW:AS2: no na page');
ok(JSON.stringify(Object.entries(by.goh.na).sort()) === JSON.stringify(Object.entries(NA_GOH).sort()), 'GoH na: empty', JSON.stringify(by.goh.na));
for (const g of GAMES) for (const [p, k] of Object.entries(g.na || {})) {
  ok(pagesOf(g).includes(p), g.id + ': na page ' + p + ' keeps its place in the tabs');
  ok(k === 'na.' + p + '.' + g.id, g.id + ': na key of ' + p + ' is na.<page>.<game>', k);
}

// 4. the reason words exist in four languages (ext page: the ext's lang; core page: tools/gui/lang)
const EXT = require('../ext');
const CORE = Object.fromEntries(['en', 'ru', 'uk', 'zh'].map(l => [l, JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'lang', l + '.json'), 'utf8'))]));
// 3b. Test, Share & Play (Alt+8) in every game: sub-tabs Test Run (Test Plan, then the Test Run page), Share, Play, in that order. Test Run
// is not behind Advanced and is no na page (GoH too: the picker works there, the two run cards say why they cannot run in a line each)
for (const g of GAMES) { const sh = g.tabs.find(t => t.id === 'share');
  ok(sh && sh.key === '8' && sh.label === 'grp.share' && sh.subs.map(s => s.id + ':' + s.label + ':' + s.pages.join('+')).join() === 'test:grp.s.test:testplan+test,share:grp.s.share:share,play:grp.s.play:play',
    g.id + ': Test, Share & Play holds Test Run (testplan, test), Share, Play in that order', sh && JSON.stringify(sh.subs.map(s => [s.id, s.pages])));
  ok(!(g.na || {}).test && !(g.na || {}).testplan && !require('../groups').ADVREF.some(r => /^test(plan)?(\/|$)/.test(r)), g.id + ': Test Run is neither an na page nor behind Advanced'); }
ok(require('../contract').ADVANCED_PAGES.length === 0, 'contract: no whole page sits behind Advanced (Test Run left it)');
for (const l of ['en', 'ru', 'uk', 'zh']) ok(['grp.share', 'grp.s.test', 'na.test.edrun.goh', 'na.test.prove.goh', 'na.test.edrun.mowas2', 'na.test.prove.mowas2'].every(k => typeof CORE[l][k] === 'string' && CORE[l][k].length > 3) && !/Test Run/.test(CORE.en['adv.hint']),
  l + ': the tab name, the Test Run sub-tab name and the Test Run card reasons (MoW:AS2, GoH) exist; the Advanced hint does not name Test Run');
const missing = [];
for (const g of GAMES) for (const [p, k] of Object.entries(g.na || {})) {
  const ext = EXT.find(e => e.id === p);
  const L = ext ? ext.lang || {} : CORE;
  for (const l of ['en', 'ru', 'uk', 'zh']) if (!(L[l] && typeof L[l][k] === 'string' && L[l][k].length > 10)) missing.push((ext ? 'tools/gui/ext/' + p : 'tools/gui/lang/' + l + '.json') + ' ' + l + ' ' + k);
}
ok(!missing.length, 'every na reason key in en ru uk zh', missing.join('; '));
// every page id the tabs name has a page: an ext, or a core page
const COREPAGES = ['mods', 'make', 'upgrade', 'check', 'play', 'test', 'settings'];
const known = new Set(EXT.map(e => e.id).concat(COREPAGES));
for (const g of GAMES) { const un = pagesOf(g).filter(p => !known.has(p)); ok(!un.length, g.id + ': every listed page exists', un.join()); }

// 5. contract fix: --exe and --game-version, the AS64 argv unchanged
const contract = require('../contract');
const mod = path.join(scratch, 'm'), gd = path.join(scratch, 'g'); fs.mkdirSync(mod); fs.mkdirSync(gd);
const b = i => contract.buildArgv('fix', i).args;
const base = b({ mod, mode: 'plan', game: gd });
ok(!base.includes('--exe') && !base.includes('--game-version'), 'fix without exe: no --exe, no --game-version (AS64 argv as before)', base.join(' '));
const gb = b({ mod, mode: 'plan', game: gd, target: 'goh', exe: 'goh', gameVersion: '1.067' });
ok(gb.join(' ').includes('--target goh') && gb.join(' ').includes('--exe goh') && gb.join(' ').includes('--game-version 1.067'), 'fix goh: --target goh --exe goh --game-version', gb.join(' '));
ok(b({ mod, mode: 'plan', game: gd, exe: 'mowas_2', target: 'mowas2' }).join(' ').includes('--exe mowas_2'), 'fix mowas2: --exe mowas_2');
{ let e = null; try { b({ mod, mode: 'plan', game: gd, exe: 'mowas2x' }); } catch (x) { e = x; } ok(e instanceof contract.InputError, 'fix: an unknown exe is refused', e && e.message); }
const fixSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'fix', 'fix.js'), 'utf8');
ok(/--exe/.test(fixSrc) && /--game-version/.test(fixSrc), 'fix.js takes --exe and --game-version');

// 5b. (sweep) contract play, install, uninstall, probe, e2e, dev-loop take target as64|mowas2|goh; without it the AS64 argv is as before;
// the front door refuses GoH at the start (exit 2, one plain line) and MoW:AS2 runs dry only. Only refusals run here: nothing is started.
{
  const WT = require('../../lib/test/wait');   // a child limit of 5 min, killed: once more with 10
  const as2 = path.join(__dirname, '..', '..', 'as2', 'as2.js');
  const IN = { play: { mod, dry: true, game: gd }, install: { mod, dry: true, game: gd }, uninstall: { name: 'm', game: gd }, probe: { dry: true, game: gd },
    e2e: { mod, map: 'x', dry: true, game: gd }, 'dev-loop': { mod, map: 'x', dry: true, game: gd } };
  for (const [cmd, inp] of Object.entries(IN)) {
    const fl = contract.COMMANDS[cmd].fields.find(x => x.name === 'target');
    ok(fl && fl.flag === '--target' && fl.values.join() === 'as64,mowas2,goh', cmd + ': target enum as64,mowas2,goh');
    const a0 = contract.buildArgv(cmd, inp).args;
    ok(!a0.includes('--target'), cmd + ': no target, no --target (AS64 argv as before)', a0.join(' '));
    const a1 = contract.buildArgv(cmd, Object.assign({ target: 'goh' }, inp)).args;
    ok(a1.join(' ').endsWith('--target goh'), cmd + ': target goh gives --target goh', a1.join(' '));
    { let e = null; try { contract.buildArgv(cmd, Object.assign({ target: 'mowas_2' }, inp)); } catch (x) { e = x; } ok(e instanceof contract.InputError, cmd + ': an unknown target is refused'); }
    const r = WT.spawnSync(process.execPath, [as2, ...a1], { encoding: 'utf8', env: Object.assign({}, process.env, { AS2_GAME: gd }) }, 'test-tabs');
    ok(r.status === 2 && /not available for GoH: .*\(.+\)/.test(r.stderr + r.stdout), cmd + ' --target goh: exit 2 with the plain line and its row', r.status + ' ' + (r.stderr + r.stdout).slice(-300));
  }
  fs.writeFileSync(path.join(gd, 'mowas_2.exe'), 'x');
  const pm = contract.buildArgv('play', { mod, game: gd, target: 'mowas2' }).args;
  const r = WT.spawnSync(process.execPath, [as2, ...pm], { encoding: 'utf8' }, 'test-tabs');
  ok(r.status === 2 && /not available for MoW:AS2: .*TST-19/.test(r.stderr + r.stdout), 'play --target mowas2 without dry: exit 2 citing TST-19', r.status + ' ' + (r.stderr + r.stdout).slice(-300));
}

// 6. writeguard: no drive path in the file; the GoH install comes from gamedir (GOH_GAME), whatever its folder is named
const wgFile = path.join(__dirname, '..', '..', 'lib', 'writeguard.js');
const wgSrc = fs.readFileSync(wgFile, 'utf8');
ok(!/\b[A-Za-z]:[\\/]/.test(wgSrc) && !/GOH_KNOWN/.test(wgSrc), 'writeguard.js holds no drive path and no GOH_KNOWN');
const W = require('../../lib/writeguard');
const plain = path.join(scratch, 'plaingame'); fs.mkdirSync(path.join(plain, 'mods'), { recursive: true });
const keepEnv = process.env.GOH_GAME;
delete process.env.GOH_GAME; W._reset();
ok(!W.isGoh(plain), 'a plain folder is not GoH before gamedir names it');
process.env.GOH_GAME = plain; W._reset();
ok(W.isGoh(plain), 'GOH_GAME names the plain folder: isGoh through gamedir.goh');
ok(W.refuseWrite(path.join(plain, 'mods', 'x')) === null && /Gates of Hell/.test(W.refuseWrite(path.join(plain, 'resource', 'x')) || ''), 'a mod inside that GoH install may be written, the game data itself not', W.refuseWrite(path.join(plain, 'mods', 'x')));
ok(W.refuseWrite(path.join(scratch, 'outside', 'mymod')) === null, 'a GoH mod folder outside the install may be written');
if (keepEnv === undefined) delete process.env.GOH_GAME; else process.env.GOH_GAME = keepEnv; W._reset();

try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (e) { /* busy */ }
console.log('tabs test: ' + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
