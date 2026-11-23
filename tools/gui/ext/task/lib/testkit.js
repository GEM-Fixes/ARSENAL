// ext task: the test kit recipe tests call (recipes/<id>.test.js). Three lines:
//   const kit = require('../lib/testkit');
//   kit.run(require('./gun.recipe'), require('./gun.lang'), { base: { id: 'zis3' }, answers: { range: 140 } });
// It checks, in order, and prints PASS as the last line (exit 1 on any failure):
//   1 validate() has no error (warnings are printed)
//   2 lang: every key the recipe names exists in en, ru, uk and zh; every row key starts with task.<id>.; no dash in the text;
//     every key its .client.js script passes to tx() (and every full task.<id>. key it names) exists in the 4 languages (own rows,
//     core lang.js or another recipe's rows)
//   3 census coverage complete (each census key in a question's covers or in kept); seeded defect: the recipe with one covering
//     question removed must fail coverage. Both skipped with a note while census/<census>.json is not there yet
//   4 steps() of a fixture draft: built-in steps in place, every `when` names an earlier question
//   5 the fixture draft compiles (compile ctx, children none); every call is one a task may run and names the mod; copies stay in it
//   6 the gen ops it makes pass a plan run (in-process gen Ctx in plan mode) on a scratch mod folder, when a game folder is found
//     (fixture.game, AS2_GAME, or the saved/auto game folder); else a SKIP note
//   fixture.write === true: also writes for real into the scratch mod and fixture.after(mod, result) checks the files
// fixture: { id (pins the draft id), base, answers: {q: value | {src, ...}}, verb, game ('as64' | 'mowas2' | 'goh'), gameDir (a folder pins the
//            game; false: no game, the gen plan is skipped), gohDir (the GoH install of a goh fixture; false: none; default
//            GOH_GAME or the found one, read only), mod (absolute; default <scratch>/mods/<id>_test), values (base values to use
//            instead of recipe.values), client (the .client.js module; default recipes/<id>.client.js when there), write, after }
// The scratch folder is process.argv[2] (or a temp folder). Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-a9666311)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const RC = require('./recipe'), D = require('./draft'), CP = require('./compile');
const TOOLS = path.resolve(__dirname, '..', '..', '..', '..');
const DASH = /[‒–—―]| - /;

// a ctx like gui.js gives a route: tasks and staging in the scratch folder; runTool spawns node on tools/<entry>. Game parity: the
// page's game o.game (default as64) through gameId() exe() kind(), the GoH install o.gohDir through gohDir(), curDir() as gui.js
function ctxFor(scratch, o) {
  o = o || {};
  const G = require('../../../../lib/games').get(o.game) || require('../../../../lib/games').get('as64');
  return {
    gamedir: null, tools: TOOLS, tmpRoot: path.join(scratch, 'tmp'), taskDir: path.join(scratch, 'tasks'), allowLaunch: false,
    session: { token: '', port: 0, remote: !!o.remote }, pathOk: null, onClose() {},
    game: () => o.gameDir || null,
    gameId: () => G.id, exe: () => G.exe, kind: () => G.kind, gohDir: () => o.gohDir || null,
    curDir: () => (G.kind === 'goh' ? o.gohDir || null : o.gameDir || null),
    runTool: async (tool, entry, args, opt) => {
      const r = cp.spawnSync(process.execPath, [path.join(TOOLS, entry), ...args], { encoding: 'utf8', timeout: (opt && opt.timeoutMs) || 120000, env: Object.assign({}, process.env, { AS2_NO_STEAM: '1' }), windowsHide: true });
      return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '', timedOut: !!(r.error && r.error.code === 'ETIMEDOUT') };
    },
  };
}
function findGame(fx) {
  fx = fx || {};
  if (fx.gameDir === false) return null;
  if (fx.gameDir) return fx.gameDir;
  if (process.env.AS2_GAME && fs.existsSync(process.env.AS2_GAME)) return process.env.AS2_GAME;
  try { const r = require('../../../../lib/gamedir').resolve({}); return r && r.dir && fs.existsSync(r.dir) ? r.dir : null; } catch { return null; }
}
// the GoH install of a goh fixture: fixture.gohDir (false: none), GOH_GAME, or tools/lib/gamedir goh() (read only)
function findGoh(fx) {
  fx = fx || {};
  if (fx.gohDir === false) return null;
  if (fx.gohDir) return fx.gohDir;
  try { const d = require('../../../../lib/gamedir').goh({}); return d && fs.existsSync(d) ? d : null; } catch { return null; }
}
// the lang keys a client script uses: tx('task.x.y' ...) and every full 'task.<id>.x' literal (a key built from pieces is not checked)
function clientKeys(script, id) {
  const out = new Set(), src = String(script || '');
  for (const m of src.matchAll(/\btx\(\s*['"](task\.[A-Za-z0-9_.-]*[A-Za-z0-9_])['"]/g)) out.add(m[1]);
  const own = 'task.' + id + '.';
  for (const m of src.matchAll(/['"](task\.[A-Za-z0-9_.-]*[A-Za-z0-9_])['"](?!\s*\+)/g)) if (m[1].startsWith(own)) out.add(m[1]);
  return [...out];
}
// every string row ARSENAL task knows: core lang.js and each recipes/<id>.lang.js
function allRows() {
  const by = { en: {}, ru: {}, uk: {}, zh: {} }, add = rows => { for (const r of rows || []) if (Array.isArray(r)) ['en', 'ru', 'uk', 'zh'].forEach((l, i) => { if (typeof r[i + 1] === 'string' && r[i + 1].trim()) by[l][r[0]] = r[i + 1]; }); };
  add(require('../lang'));
  const dir = path.join(__dirname, '..', 'recipes');
  let names = []; try { names = fs.readdirSync(dir); } catch { /* none */ }
  for (const n of names) if (/\.lang\.js$/.test(n)) { try { add(require(path.join(dir, n))); } catch { /* its own test says so */ } }
  return by;
}
const asAnswer = v => (v && typeof v === 'object' && !Array.isArray(v) && typeof v.src === 'string' ? v : { src: 'value', value: v });

async function run(recipe, rows, fx, scratchArg) {
  fx = fx || {};
  let fails = 0, passes = 0;
  const ok = (c, m, extra) => { if (c) passes++; else { fails++; console.log('FAIL ' + m + (extra !== undefined ? '\n  ' + String(extra).slice(0, 1500) : '')); } };
  const note = m => console.log('note: ' + m);
  const scratch = path.resolve(scratchArg || process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-recipe-')));
  fs.mkdirSync(scratch, { recursive: true });
  try {
    // 1 validate: the kinds the recipe's .client.js declares count as the server counts them (index.js), added to fx.validate.kinds
    let ck = [];
    try { const cm = fx.client !== undefined ? fx.client : (fs.existsSync(path.join(__dirname, '..', 'recipes', recipe.id + '.client.js')) ? require(path.join(__dirname, '..', 'recipes', recipe.id + '.client.js')) : null); ck = (cm && Array.isArray(cm.kinds)) ? cm.kinds : []; } catch { /* checked at 2b */ }
    const vopt = Object.assign({}, fx.validate || {}); vopt.kinds = [...new Set([].concat(vopt.kinds || [], ck))];
    const probs = RC.validate(recipe, null, vopt);
    for (const p of probs.filter(x => x.level === 'warn')) note('warn: ' + p.msg);
    const errs = probs.filter(x => x.level === 'error');
    ok(!errs.length, 'recipe ' + recipe.id + ' validates', errs.map(x => x.msg).join('\n  '));
    // 2 lang
    const pre = 'task.' + recipe.id + '.', en = {}, by = { en: {}, ru: {}, uk: {}, zh: {} };
    for (const r of rows || []) {
      ok(Array.isArray(r) && r.length === 5, 'lang row has 5 cells: ' + JSON.stringify(r).slice(0, 80));
      ok(String(r[0]).startsWith(pre), 'lang key ' + r[0] + ' starts with ' + pre);
      ['en', 'ru', 'uk', 'zh'].forEach((l, i) => { by[l][r[0]] = r[i + 1]; ok(typeof r[i + 1] === 'string' && r[i + 1].trim() !== '', 'lang ' + l + ' ' + r[0] + ' is filled'); ok(!DASH.test(r[i + 1] || ''), 'lang ' + l + ' ' + r[0] + ' has no dash in the text', r[i + 1]); });
      en[r[0]] = r[1];
    }
    for (const k of RC.keysOf(recipe)) for (const l of ['en', 'ru', 'uk', 'zh']) ok(by[l][k] != null, 'lang ' + l + ' has ' + k);
    // 2b the client script's keys
    let client = fx.client;
    if (client === undefined) { const cf = path.join(__dirname, '..', 'recipes', recipe.id + '.client.js'); try { client = fs.existsSync(cf) ? require(cf) : null; } catch (e) { ok(false, recipe.id + '.client.js loads', e.message); client = null; } }
    if (client && client.script) {
      const known = allRows(), keys = clientKeys(client.script, recipe.id);
      for (const l of ['en', 'ru', 'uk', 'zh']) Object.assign(known[l], by[l]);
      const miss = keys.filter(k => ['en', 'ru', 'uk', 'zh'].some(l => known[l][k] == null));
      ok(!miss.length, recipe.id + '.client.js: its ' + keys.length + ' string keys exist in en, ru, uk and zh', miss.join(', '));
    }
    // 3 census coverage + seeded defect
    const cen = recipe.census ? RC.loadCensus(recipe.census) : null;
    if (!recipe.census) note('no census named: coverage not checked');
    else if (cen.missing.length) note('census not there yet (' + cen.missing.join(', ') + '): coverage and its seeded defect skipped');
    else {
      const cv = RC.coverage(recipe, cen);
      ok(cv.ok, 'census coverage complete (' + cv.total + ' keys: ' + cv.asked + ' asked, ' + cv.kept + ' kept)', cv.missing.join(', '));
      const cut = JSON.parse(JSON.stringify(Object.assign({}, recipe, { compile: null, values: null, lookups: null })));
      let removed = null;
      for (const g of cut.groups) { const i = g.q.findIndex(q => (q.covers || []).some(k => cen.keys.includes(k) && !(recipe.kept || []).some(r => r[0] === k))); if (i >= 0) { removed = g.q.splice(i, 1)[0]; break; } }
      ok(removed && !RC.coverage(cut, cen).ok, 'seeded defect: a question removed (' + (removed && removed.id) + ') fails coverage');
    }
    // 4 steps
    const draft = { id: fx.id != null ? D.checkId(fx.id) : D.newId(recipe.id), recipe: recipe.id, verb: fx.verb || recipe.verbs[0], game: fx.game || recipe.games[0], mod: '', base: fx.base || null, answers: {}, kept: [], state: 'open' };
    for (const [k, v] of Object.entries(fx.answers || {})) draft.answers[k] = asAnswer(v);
    const st = RC.steps(recipe, draft, fx.values || {});
    ok(st.length > 0 && st[st.length - 1].kind === (draft.verb === 'explore' ? 'done' : 'done'), 'steps end with done', JSON.stringify(st.map(s => s.id)));
    if (draft.verb !== 'explore') ok(['review', 'write', 'check', 'test'].every(k => st.some(s => s.kind === k)), 'steps have review, write, check and test');
    if ((recipe.needs || []).includes('mod')) ok(st[0].kind === 'mod', 'the first step picks the mod');
    if (recipe.base) ok(st.some(s => s.kind === 'base'), 'a base step is there');
    // 5 compile
    if (draft.verb === 'explore') { note('explore recipe: nothing to compile'); }
    else {
      const gameDir = findGame(fx), gohDir = draft.game === 'goh' ? findGoh(fx) : (fx.gohDir || null);
      const ctx = ctxFor(scratch, { gameDir, gohDir, game: draft.game });
      const mod = path.resolve(fx.mod || path.join(scratch, 'mods', recipe.id.replace(/-/g, '_') + '_test'));
      if ((recipe.needs || []).includes('mod') || fx.mod) {
        fs.mkdirSync(mod, { recursive: true }); draft.mod = mod;
        // a picked mod is a real mod (the Mod step lists mods with a mod.info or makes one with newmod): the Bots write guard refuses a
        // folder with no mod.info. The bots recipe's mod always gets one; fixture.modInfo true asks for it elsewhere (army: a bots buy for the new army). Not for every recipe: text and upgrade count the files of their mod
        if ((fx.modInfo === true || recipe.id === 'bots') && !fs.existsSync(path.join(mod, 'mod.info'))) fs.writeFileSync(path.join(mod, 'mod.info'), '{mod "' + path.basename(mod) + '"\r\n}\r\n');
      }
      D.save(ctx, draft);
      const real = Object.assign({}, recipe);
      if (fx.values) real.values = () => fx.values;
      const R = { [recipe.id]: real };
      let c = null;
      try { c = await CP.compile(ctx, draft, R); } catch (e) { ok(false, 'the fixture draft compiles', e.stack || e.message); }
      if (c) {
        ok(true, 'the fixture draft compiles');
        const into = c.mod || draft.mod;
        ok(!!into && path.isAbsolute(into), 'the compile names the mod it writes into', into);
        if (into) {
          for (const cl of c.calls) { let why = null; try { CP.checkCall(ctx, path.resolve(into), cl); } catch (e) { why = e.message; } ok(!why, 'call ' + JSON.stringify(cl).slice(0, 80) + ' is allowed', why); }
          for (const cpy of c.copies) { let why = null; try { CP.inMod(path.resolve(into), cpy.to); } catch (e) { why = e.message; } ok(!why, 'copy to ' + cpy.to + ' stays in the mod', why); }
        }
        // 6 plan (gen ops need a game folder)
        if (c.gen && draft.game === 'goh' && !gohDir) note('SKIP gen plan: no Gates of Hell folder found (set GOH_GAME or fixture.gohDir)');
        else if (c.gen && draft.game !== 'goh' && !gameDir) note('SKIP gen plan: no game folder found (set AS2_GAME)');
        else {
          let p = null;
          try { p = await CP.plan(ctx, draft, R); } catch (e) { ok(false, 'plan runs', e.stack || e.message); }
          if (p) { ok(!p.errors.length, 'plan has no errors (' + p.files.length + ' files)', JSON.stringify(p.errors).slice(0, 800)); if (fx.planFiles) for (const f of fx.planFiles) ok(p.files.some(x => x.rel === f), 'plan lists ' + f, JSON.stringify(p.files)); }
          if (p && fx.write) {
            const w = await CP.write(ctx, draft, R);
            ok(w.written, 'write runs', JSON.stringify(w.errors).slice(0, 800));
            if (w.written && fx.after) { try { fx.after(w.mod, w, ok); } catch (e) { ok(false, 'after(mod) checks', e.stack || e.message); } }
          }
        }
      }
    }
  } catch (e) { ok(false, 'test kit crashed', e.stack || e.message); }
  if (!scratchArg && !process.argv[2]) try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* temp */ }
  console.log(passes + ' passed, ' + fails + ' failed');
  console.log(fails ? 'FAIL' : 'PASS');
  if (fails) process.exitCode = 1;
  return { passes, fails };
}

module.exports = { run, ctxFor, findGame, clientKeys, allRows };
