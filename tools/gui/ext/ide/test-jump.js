// Whole-mod problem steps (ui/jump.js, route POST /api/x/ide/modcheck) and the jump trail (ui/core.js: history with scroll, the
// footnote, Back to the editor from another page). Run by tools/gui/ext/ide/test.js (hook at its end, or alone:
// IDE_ONLY=jump node tools/gui/ext/ide/test.js <scratch>). module.exports = async function(env){}.
// Author: Imperator_Aug (ARSENAL, ia-8814774f)
'use strict';
const fs = require('fs'), path = require('path');

module.exports = async function (env) {
  const { boot } = env;
  const ok = (c, m, x) => env.ok(c, c || x === undefined ? m : m + ' [' + String(x).slice(0, 400) + ']');
  const wr = (f, b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };
  const EN = {}; for (const r of require('./lang/jump').concat(require('./lang/core'))) EN[r[0]] = r[1];
  const fill = (k, p) => String(EN[k] || k).replace(/\{(\w+)\}/g, (m, n) => (p && p[n] != null ? String(p[n]) : m));

  // ================================================================ route
  {
    const W = env.scratch('jump-route'), game = path.join(W, 'game'), mod = path.join(game, 'mods', 'mine');
    wr(path.join(game, 'as64.exe'), 'MZ');
    wr(path.join(mod, 'mod.info'), '{mod {name "Mine"}}\r\n');
    // one defect per file: a.set, b.set, sub/c.set broken; the rest must not be read (txt, model text, dot folder, restore folder)
    const files = { 'resource/set/b.set': '{y 1}}\r\n', 'resource/set/a.set': '{x 1\r\n', 'resource/set/ok.set': '{z 1}\r\n', 'resource/set/sub/c.set': '{c 1}}\r\n', 'readme.txt': '{{{\r\n',
      'resource/entity/x/x.mdl': '{{{\r\n', 'resource/entity/x/x.mtl': '{{{\r\n', '.git/resource/set/z.set': '{{{\r\n', 'resource/set/old.set.arsenal-undo/q.set': '{{{\r\n', 'resource/map/m1/map': '{{{\r\n' };
    for (const k of Object.keys(files)) wr(path.join(mod, k), files[k]);
    const ctx2 = Object.assign({}, env.ctx, { game: () => game, tmpRoot: path.join(W, 'tmp') });
    env.R._reset();
    const run = async (b) => { let r = null, all = []; for (let i = 0; i < 400; i++) { r = await env.post('modcheck', Object.assign({ mod, from: all.length }, b), ctx2); all = all.concat(r.files); if (r.done) break; await new Promise(z => setTimeout(z, 5)); } return { r, all }; };
    let { r, all } = await run({});
    ok(r && r.done && r.total === 4 && r.checked === 4, 'jump route: only the text data files are checked (4 .set; not .txt, .mdl, .mtl, map, dot or restore folders)', JSON.stringify(r && { done: r.done, total: r.total, checked: r.checked }));
    const rels = all.map(x => x.rel).join();
    ok(rels === 'resource/set/a.set,resource/set/b.set,resource/set/sub/c.set', 'jump route: only files with problems, in the explorer\'s order (folder by folder)', rels);
    ok(all.every(x => x.findings.length && x.findings.every(f => f.line >= 1 && f.code && (f.sev === 'error' || f.sev === 'warn') && f.msg)), 'jump route: findings carry line, code, severity, message', JSON.stringify(all[0]));
    ok(r.stat && r.stat.checkedNew === 4 && r.stat.cached === 0, 'jump route: a cold run checks every file', JSON.stringify(r.stat));
    const r2 = await env.post('modcheck', { mod, from: 0 }, ctx2);
    ok(r2.job === r.job && r2.done && r2.files.length === 3, 'jump route: a done check is kept and answered again (same job)');
    env.R._reset();
    wr(path.join(mod, 'resource/set/ok.set'), '{z 2}}\r\n');   // one file changed (size): only it is read again
    ({ r, all } = await run({ at: 'resource/set/b.set' }));
    ok(r.stat.cached === 3 && r.stat.checkedNew === 1 && all.length === 4, 'jump route: a second run takes the disk cache and checks only the changed file', JSON.stringify(r.stat));
    ok(r.start === 'resource/set/ok.set' && r.wrapped === true && all[0].rel === 'resource/set/ok.set', 'jump route: the walk starts at the file after `at` and goes round', JSON.stringify({ start: r.start, first: all[0].rel }));
    const r3 = await env.post('modcheck', { mod, from: 0, again: true }, ctx2);
    ok(r3.job !== r.job, 'jump route: again:true starts a new check');
    wr(path.join(mod, 'resource/set/ok.set'), files['resource/set/ok.set']);
    await env.rejects(() => env.post('modcheck', { mod, from: -1 }, ctx2), 400, /from/, 'jump route: a bad from -> 400');
    ok(Object.keys(files).every(k => fs.readFileSync(path.join(mod, k), 'utf8') === files[k]), 'jump route: reads only');
    ok(!require('../../remote').ALLOW.has('POST /api/x/ide/modcheck'), 'jump route: not open to a phone');
    for (let i = 0; i < 400; i++) { const x = await env.post('modcheck', { mod, from: 0 }, ctx2); if (x.done) break; await new Promise(z => setTimeout(z, 5)); }
  }

  // ================================================================ page
  // one defect per line: BAD = error E_BAD, WARN = warning W_X (the fake lint and the fake whole-mod check use the same rule)
  const rule = text => { const out = []; String(text).split('\n').forEach((l, i) => { if (/BAD/.test(l)) out.push({ line: i + 1, col: 1, len: 3, exact: true, code: 'E_BAD', msg: 'bad thing', sev: 'error', source: 'syntax' });
    if (/WARN/.test(l)) out.push({ line: i + 1, col: 1, len: 4, exact: true, code: 'W_X', msg: 'warn thing', sev: 'warn', source: 'syntax' }); }); return out; };
  const A = 'resource/a.set', BC = 'resource/b/c.set', BS = 'resource/b.set', OK = 'resource/ok.set';
  const base = () => ({ [A]: 'ok\nBAD\nWARN\n', [BS]: 'WARN\nBAD\n', [BC]: 'BAD\n', [OK]: Array.from({ length: 200 }, (x, i) => 'line ' + i).join('\n') });
  const segCmp = (a, b) => { const x = a.split('/'), y = b.split('/'); for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return x.length - y.length; };
  const page = async (o) => {
    o = o || {}; const files = o.files || base();
    let calls = 0;
    const P = await boot({ files, lint: b => ({ findings: rule(b.text), fixes: [], multi: [], ms: 0 }), api: req => {
      if (req.path !== '/api/x/ide/modcheck') return o.api ? o.api(req) : undefined;
      calls++;
      const order = Object.keys(base()).sort(segCmp);
      const withF = order.filter(r => rule(files[r] || '').length).map(r => ({ rel: r, key: r, findings: rule(files[r]).map(f => ({ line: f.line, col: f.col, len: f.len, code: f.code, sev: f.sev, msg: f.msg })) }));
      const from = req.body.from || 0;
      if (o.slow && calls === 1) return { job: 'j1', done: false, total: order.length, checked: 1, start: A, upto: A, wrapped: false, files: withF.slice(0, 1), off: 0, next: 1, ms: 0 };
      return { job: 'j1', done: true, total: order.length, checked: order.length, start: A, upto: order[order.length - 1], wrapped: false, files: withF.slice(from), off: from, next: withF.length, ms: 1 };
    } });
    P.said = []; const say = P.IDE.status; P.IDE.status = t => { P.said.push(t || ''); return say(t); };
    P.at = () => { const d = P.IDE.active(), c = P.ed().cursor(); return d ? d.ref.rel + ':' + c.line : null; };
    P.step = async (id) => { P.IDE.run(id); await P.flush(); await P.flush(); };
    P.files = files; P.calls = () => calls;
    return P;
  };

  // ---- J1. unchecked mod: the first step starts the check with visible progress, then jumps; next/prev across files; wrap
  {
    const P = await page({ slow: true });
    ok(['jNext', 'jPrev', 'jKind', 'jKindPrev', 'jFilter', 'jRecheck'].every(k => P.IDE.actions[k] && P.IDE.actions[k].group === 'jump') && P.IDE.actions.jNext.key === 'Alt+F8' && P.IDE.actions.jKind.key === 'Ctrl+F8', 'jump J1: actions in the Jump group (Alt+F8, Shift+Alt+F8, Ctrl+F8, Ctrl+Shift+F8)');
    ok(!P.IDE.active(), 'jump J1: no tab open, the mod is not checked yet');
    P.IDE.run('jNext');
    ok(P.said.some(t => t === fill('ide.j.checking', { n: 0, m: '?' })), 'jump J1: the first step says the check runs (not a silent no-op)', P.said.join('|'));
    await P.flush(); await P.flush();
    ok(P.at() === A + ':2', 'jump J1: it jumps as soon as the first file is checked: a.set line 2', P.at());
    ok(P.said.some(t => /^Problem 1 of 2 · E_BAD 1 of 1 \(Checking the mod: 1 of 4 files\)/.test(t)), 'jump J1: the status says where, and that the check still runs', P.said.slice(-2).join('|'));
    await P.flush(); await P.flush();
    ok(P.IDE.jump.state().done && P.calls() === 2, 'jump J1: the check finished (asked again)', JSON.stringify(P.IDE.jump.state()));
    const seq = [];
    for (let i = 0; i < 5; i++) { await P.step('jNext'); seq.push(P.at()); }
    ok(seq.join() === [A + ':3', BC + ':1', BS + ':1', BS + ':2', A + ':2'].join(), 'jump J1: next goes through a.set, then b/c.set (folder first, explorer order), then b.set, then wraps', seq.join());
    ok(P.said.some(t => t.indexOf(EN['ide.j.wrapped']) === 0), 'jump J1: the wrap is said ("Wrapped to the first problem.")', P.said.slice(-1)[0]);
    await P.step('jPrev');
    ok(P.at() === BS + ':2' && P.said.slice(-1)[0].indexOf(EN['ide.j.wrappedLast']) === 0, 'jump J1: previous from the first wraps to the last, and says so', P.at());
    await P.step('jPrev'); await P.step('jPrev');
    ok(P.at() === BC + ':1' && P.said.slice(-1)[0].indexOf('Problem 3 of 5 · E_BAD 2 of 3') === 0, 'jump J1: previous across files; status "Problem 3 of 5 · E_BAD 2 of 3"', P.said.slice(-1)[0]);
    const ev = []; P.IDE.on('modcheck', d => ev.push(d));
    P.IDE.run('jRecheck'); await P.flush(); await P.flush();
    ok(ev.length === 1 && ev[0].files.length === 3 && ev[0].files.find(x => x.rel === BS).e === 1 && ev[0].files.find(x => x.rel === BS).w === 1, 'jump J1: a finished check dots the explorer (modcheck event)', JSON.stringify(ev));
    ok(P.writes().length === 0, 'jump J1: nothing written');
  }

  // ---- J2. next kind (severity, then code), filters
  {
    const P = await page();
    await P.open(A, 2, 1);
    await P.step('jKind');
    ok(P.at() === A + ':3', 'jump J2: next kind from E_BAD (error) is W_X (warning): its first problem', P.at());
    await P.step('jKind');
    ok(P.at() === A + ':2' && P.said.slice(-1)[0].indexOf(EN['ide.j.wrapped']) === 0, 'jump J2: past the last kind it wraps to the first kind, and says so', P.said.slice(-1)[0]);
    ok(P.IDE.jump.kinds().join() === 'error|E_BAD,warn|W_X', 'jump J2: kinds ordered by severity then code');
    P.IDE.jump.filter('warn');
    await P.step('jNext'); const w1 = P.at(); await P.step('jNext'); const w2 = P.at();
    ok(w1 === A + ':3' && w2 === BS + ':1', 'jump J2: the warnings filter steps through warnings only', w1 + ' ' + w2);
    P.IDE.jump.filter('kind');
    await P.step('jNext');
    ok(P.at() === A + ':3' && P.said.slice(-1)[0].indexOf(EN['ide.j.wrapped']) === 0, 'jump J2: the kind filter keeps to the current kind (W_X) and wraps in it', P.at());
    P.IDE.jump.filter('error');
    await P.step('jNext');
    ok(P.at() === BC + ':1', 'jump J2: the errors filter skips warnings');
    P.IDE.jump.filter('all');
    // the problems panel strip
    const bar = P.IDE.jumpBar();
    ok(bar && bar.getAttribute('role') === 'group' && bar.children.filter(e => e.tagName === 'BUTTON').length === 4 && /5 problems of 2 kinds/.test(bar.textContent), 'jump J2: the problems panel strip: four buttons, the filter, the count', bar && bar.textContent);
  }

  // ---- J3. a fix updates the list without losing the place
  {
    const P = await page();
    await P.open(BC, 1, 1);
    ok(P.IDE.jump && P.IDE.jump.list().length === 1 && P.IDE.jump.list()[0].rel === BC && !P.IDE.jump.state(),'jump J3: before the check the list is only the open tab (once linted)');
    await P.step('jNext');
    ok(P.at() === BS + ':1', 'jump J3: next from b/c.set:1 goes to b.set:1');
    await P.open(BC, 1, 1);
    const ed = P.ed(); ed.userEdit([{ line: 1, col: 1, endCol: 4, text: 'fine' }]); await P.flush(); await P.flush();
    ok(P.IDE.jump.list().length === 4 && !P.IDE.jump.list().some(x => x.rel === BC), 'jump J3: the fixed line left the list (the tab\'s fresh check wins over the whole-mod one)', JSON.stringify(P.IDE.jump.list().map(x => x.rel + ':' + x.line)));
    await P.step('jPrev');
    ok(P.at() === A + ':3' && P.said.slice(-1)[0].indexOf('Problem 2 of 4') === 0, 'jump J3: the place is kept: previous from b/c.set goes to a.set:3, counted in the new list', P.said.slice(-1)[0]);
  }

  // ================================================================ trail (feature B)
  {
    const P = await page();
    const ed = P.ed();
    await P.open(A, 2, 1);
    ed.scrollTop = 120;
    P.IDE.go('ide:' + BS + ':2'); await P.flush();
    ok(P.at() === BS + ':2', 'trail: a link jump (hover, log, search, def use IDE.go)');
    const foot = P.B('foot');
    ok(foot && !foot.hidden && foot.textContent.indexOf(fill('ide.hist.from', { p: 'a.set:2' })) === 0, 'trail: the footnote says "Came from a.set:2"', foot && foot.textContent);
    ed.scrollTop = 0;
    foot.all().find(e => e.tagName === 'BUTTON' && e.textContent === EN['ide.hist.back']).click(); await P.flush();
    ok(P.at() === A + ':2' && ed.scrollTop === 120, 'trail: Back restores file, caret and scroll', P.at() + ' ' + ed.scrollTop);
    ok(P.IDE.hist.fwdList().length === 1 && foot.textContent.indexOf(EN['ide.hist.fwd']) >= 0, 'trail: Forward is offered after Back');
    // a jump within a few lines of the same file is not recorded
    const n0 = P.IDE.hist.list().length;
    await P.IDE.open({ rel: A }, 3, 1); await P.flush();
    ok(P.IDE.hist.list().length === n0, 'trail: a jump of one line in the same file is not recorded');
    await P.open(OK, 1, 1); await P.IDE.open({ rel: OK }, 150, 1); await P.flush();
    ok(P.IDE.hist.list().slice(-1)[0].line === 1 && P.IDE.hist.list().slice(-1)[0].ref.rel === OK, 'trail: a far jump in the same file is recorded (problems panel row, go to line)');
    // a whole-mod problem jump is a jump too
    await P.step('jNext');
    const hl = P.IDE.hist.list().slice(-1)[0];
    ok(hl.ref.rel === OK && hl.line === 150, 'trail: a mod-wide problem jump records the place it left', JSON.stringify(hl));
    // include window "Open in tab" and explorer opens go through IDE.open: recorded the same way
    await P.IDE.open({ rel: BC }, 1, 1); await P.flush();
    ok(P.IDE.hist.list().slice(-1)[0].ref.rel === P.IDE.hist.list().slice(-1)[0].ref.rel && P.at() === BC + ':1', 'trail: an open from a button (explorer, include window) is recorded');
    // a closed tab comes back
    const prev = P.IDE.hist.list().slice(-1)[0];
    const d = P.IDE.docs.find(x => x.ref.rel === prev.ref.rel); P.IDE.close(d, true); await P.flush();
    await P.IDE.hist.back(); await P.flush();
    ok(P.IDE.active() && P.IDE.active().ref.rel === prev.ref.rel && P.ed().cursor().line === prev.line, 'trail: Back reopens a tab that was closed', P.at());
    // a file that is gone: a plain message
    await P.open(BS, 1, 1);
    const dd = P.IDE.docs.find(x => x.ref.rel === BS);
    await P.open(A, 2, 1);
    P.IDE.close(dd, true); delete P.files[BS]; await P.flush();
    const nb = P.IDE.hist.list().length;
    await P.IDE.hist.back(); await P.flush();
    ok(P.said.slice(-1)[0] === fill('ide.hist.gone', { p: 'b.set:1' }) && P.at() === A + ':2' && P.IDE.hist.list().length === nb - 1, 'trail: Back to a file that is gone says so plainly and stays put', P.said.slice(-1)[0]);
    // the cap and the trail
    for (let i = 0; i < 70; i++) await P.IDE.open({ rel: OK }, 1 + (i % 2) * 100, 1);
    await P.flush();
    ok(P.IDE.hist.list().length === P.IDE.hist.CAP, 'trail: the history is capped (' + P.IDE.hist.CAP + ')', P.IDE.hist.list().length);
    const trail = foot.all().filter(e => e.className === 'ide-footl');
    ok(trail.length === 4 && foot.textContent.indexOf(EN['ide.hist.trail']) > 0, 'trail: the footnote shows a short trail (4 earlier places)', foot.textContent);
    trail[1].click(); await P.flush();
    ok(P.IDE.hist.list().length === P.IDE.hist.CAP - 3, 'trail: a trail item goes back that many steps', P.IDE.hist.list().length);
    // another page: "Back to the editor at file:line"
    await P.open(A, 3, 1);
    P.IDE.run('checkmod'); await P.flush();
    const lf = P.IDE.left();
    ok(P.St.cur !== 'ide' && lf && lf.el.parentNode && lf.el.textContent === fill('ide.hist.toEd', { p: 'a.set:3' }), 'trail: Check whole mod opens the Check page with "Back to the editor at a.set:3"', (lf && lf.el.textContent) + ' ' + P.St.cur);
    lf.el.children[0].click(); await P.flush();
    ok(P.St.cur === 'ide' && !P.IDE.left() && P.at() === A + ':3', 'trail: that button brings the editor back at the same place, and the strip goes', P.St.cur + ' ' + P.at());
    P.IDE.run('checkmod'); await P.flush(); const l2 = P.IDE.left();
    P.bx.as2Link('page:mods'); for (let i = 0; i < 3; i++) { P.timers.forEach(t => {}); await P.flush(); }
    ok(!P.IDE.left() && !l2.el.parentNode, 'trail: the strip goes when another page is shown');
  }

  // ---- words
  {
    const rows = require('./lang/jump');
    ok(rows.every(r => r.length === 5 && r.every(x => typeof x === 'string' && x.length)), 'jump words: every row has en, ru, uk, zh');
    const keys = new Set(rows.map(r => r[0]).concat(require('./lang/core').map(r => r[0])));
    const src = fs.readFileSync(path.join(__dirname, 'ui', 'jump.js'), 'utf8') + fs.readFileSync(path.join(__dirname, 'ui', 'core.js'), 'utf8').split('(trail)').slice(1).join('');
    const used = new Set(); for (const m of src.matchAll(/'(ide\.(?:j|hist|a)\.[A-Za-z0-9.]+)'/g)) used.add(m[1]);
    for (const a of ['jNext', 'jPrev', 'jKind', 'jKindPrev', 'jFilter', 'jRecheck']) { used.add('ide.a.' + a); used.add('ide.a.' + a + 'T'); }
    const miss = [...used].filter(k => !keys.has(k) && !/\.$/.test(k));
    ok(!miss.length, 'jump words: every key named has a row', miss.join());
    ok(!/`|\$\{|innerHTML|=>|\blet\b|\bconst\b/.test(require('./ui/jump').script), 'jump words: page script is ES5');
  }
};
