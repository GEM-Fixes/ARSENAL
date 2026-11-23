// recipe "texts and translation" test: node text.test.js <scratch>. Two kit runs on one scratch mod whose unit list has a card with no
// name: 1 "add the missing lines" with every answer kept (the line is found by loccover and written by gen's text finish), 2 "write
// lines" with Cyrillic text (re-read as UTF-8 with CRLF); then the translation table out and back (lng extract and merge, the mod
// untouched by the merge itself), a branch made by the core with passed keys (values preselect them), the Check step cards, and
// the recipe has GET routes only. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-f5f734b0)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const kit = require('../lib/testkit');
const R = require('./text.recipe'), L = require('./text.lang');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-text-')));
const mod = path.join(scratch, 'mods', 'text_test');
const lngOf = () => path.join(mod, 'localization', '#text_test.lng');
fs.rmSync(mod, { recursive: true, force: true });
fs.mkdirSync(path.join(mod, 'resource', 'set', 'multiplayer', 'units'), { recursive: true });
fs.writeFileSync(path.join(mod, 'resource', 'set', 'multiplayer', 'units', 'common.set'), ';SDL\r\n{units\r\n\t{"tasktestcard" {tags "all"}}\r\n}\r\n');
const crlf = b => { const s = b.toString('latin1'); return !/[^\r]\n/.test(s) && /\r\n/.test(s); };
const utf8 = b => Buffer.from(b.toString('utf8'), 'utf8').equals(b);

(async () => {
  let fails = 0;
  const r1 = await kit.run(R, L, {
    validate: { kinds: ['tsv', 'tlines'] }, client: require('./text.client'), mod, write: true, planFiles: ['localization/#text_test.lng'],
    after: (m, res, ok) => {
      const b = fs.readFileSync(lngOf());
      ok(/desc|tasktestcard/.test(b.toString('utf8')) && /"tasktestcard"/.test(b.toString('utf8')), 'the missing name line is found and added', b.toString('utf8'));
      ok(/^\{tags/.test(b.toString('utf8').replace(/^﻿/, '')), 'the new file has the {tags} root');
      ok(crlf(b), 'the new file is CRLF');
      ok((res.restore || []).length > 0, 'a restore point is taken');
    },
  }, scratch);
  fails += r1.fails;
  const r2 = await kit.run(R, L, {
    validate: { kinds: ['tsv', 'tlines'] }, mod, write: true,
    answers: { what: 'lines', family: 'name', lines: ['tasktest_tank = Танк тест', 'desc/squad/tt(ger) = Отряд \\"тест\\"'] },
    after: (m, res, ok) => {
      const b = fs.readFileSync(lngOf()), s = b.toString('utf8');
      ok(utf8(b) && /Танк тест/.test(s), 'the written .lng re-reads as UTF-8 with the Cyrillic text', s);
      ok(/"tasktest_tank"/.test(s) && /Отряд \\"тест\\"/.test(s), 'the bare key got the family start and the quote stays escaped', s);
      ok(/"tasktestcard"/.test(s), 'the line of the first run is kept');
      ok(crlf(b), 'the file is still CRLF');
      const again = R._t.parseLines(['x = y'], 'squad');
      ok(again[0].key === 'desc/squad/x', 'a bare key takes the squad start');
    },
  }, scratch);
  fails += r2.fails;

  // routes: translation table out and back; the branch with keys
  let n = 0, f = 0;
  const ok = (c, m, x) => { if (c) n++; else { f++; console.log('FAIL ' + m + (x !== undefined ? '\n  ' + String(x).slice(0, 800) : '')); } };
  const gameDir = kit.findGame({});
  const ctx = kit.ctxFor(scratch, { gameDir });
  try {
    const ex = await R.routes['GET /api/x/task/r/text/extract'](new URL('http://x/a?mod=' + encodeURIComponent(mod)), null, ctx);
    ok(ex.rows >= 3 && /tasktest_tank/.test(ex.tsv), 'extract makes the table of the mod', ex.tsv);
    const rows = ex.tsv.split('\n').map(l => { const c = l.split('\t'); if (c[1] === 'desc/entity/tasktest_tank' || c[1] === 'tasktest_tank' || /tasktest_tank$/.test(c[1] || '')) c[3] = 'Tank test EN'; return c.join('\t'); });
    const tsv = path.join(scratch, 'tr.tsv'); fs.writeFileSync(tsv, rows.join('\n'));
    const before = fs.readFileSync(lngOf());
    const st = path.join(scratch, 'tmp', 'mergetest'); fs.mkdirSync(st, { recursive: true });
    const m = R._t.mergeTable({ mod, tsv, all: false, staging: st });
    ok(m.files.length === 1 && /#text_test\.lng$/.test(m.files[0].rel) && /Tank test EN/.test(m.files[0].buf.toString('utf8')), 'merge gives the translated file at its place in the mod', JSON.stringify(m.files.map(x => x.rel)));
    ok(fs.readFileSync(lngOf()).equals(before), 'merge itself does not touch the mod');
    const lint = await R.routes['GET /api/x/task/r/text/lint'](new URL('http://x/a?mod=' + encodeURIComponent(mod)), null, ctx);
    ok(Array.isArray(lint.findings) && !lint.findings.length, 'lnglint finds nothing in the written file', JSON.stringify(lint.findings).slice(0, 400));
    const D = require('../lib/draft');
    const parent = D.save(ctx, { id: D.newId('mod'), recipe: 'mod', verb: 'make', game: 'as64', mod, answers: {}, kept: [], state: 'open' });
    const ch = { draft: D.child(ctx, parent.id, 'name', 'text', { pass: { for: 'name', keys: [{ key: 'desc/entity/tasktest_tank' }, { key: 'info/entity/tasktest_tank', text: 'Info' }] } }) };
    ok(ch.draft.pass && ch.draft.pass.keys.length === 2, 'the core branch carries the passed keys', JSON.stringify(ch.draft));
    const v = await R.values(Object.assign({}, ctx, { mod, gameId: 'as64' }), ch.draft.base, { draft: ch.draft, pass: ch.draft.pass, verb: 'make', game: 'as64' });
    ok(v.what === 'lines' && v.lines[0] === 'desc/entity/tasktest_tank = Танк тест' && v.lines[1] === 'info/entity/tasktest_tank = Info', 'a branch preselects the parent keys with the text they have now', JSON.stringify(v.lines));
    ok(Object.keys(R.routes).every(k => /^GET /.test(k) || k === 'POST /api/x/task/r/text/goh'), 'the recipe has GET routes only (lines are written by the core write), plus the GoH .pot route (text.games.test.js)');

    // novice fixes: the table as the programs save it, checked at upload with a plain message per problem
    const T = R._t, tdir = path.join(scratch, 'tmp', 'tablecheck');
    const grid = ex.tsv.replace(/\n$/, '').split('\n').map(l => l.split('\t'));
    const iTank = grid.findIndex(c => /tasktest_tank$/.test(c[1] || '') && /desc\/entity\//.test(c[1]));
    const tr = (g, i, t) => g.map((c, k) => (k === i ? c.slice(0, 3).concat([t], c.slice(4)) : c.slice()));
    const g1 = tr(grid, iTank, 'Tank test EN');
    const quote = (c, d) => (/["\t,;\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c);
    // Excel "Unicode Text": UTF-16LE with BOM, CRLF, Tab, cells with a quote in quotes, a Column1 row above the header (Power Query)
    const xl = ['Column1\tColumn2\tColumn3\tColumn4\tColumn5'].concat(g1.map(c => c.map(x => quote(x, '\t')).join('\t'))).join('\r\n') + '\r\n';
    const c1 = T.checkTable({ buf: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xl, 'utf16le')]), mod, dir: tdir });
    ok(c1.ok && c1.translated === 1 && c1.enc === 'UTF-16', 'hazard: an Excel Unicode Text table (UTF-16, quotes, a Column1 row) is taken', JSON.stringify(c1));
    const m1 = c1.ok ? T.mergeTable({ mod, tsv: c1.file, all: false, staging: st }) : { files: [] };
    ok(m1.files.length === 1 && /Tank test EN/.test(m1.files[0].buf.toString('utf8')) && /Отряд \\"тест\\"/.test(m1.files[0].buf.toString('utf8')), 'hazard: the Excel table merges with the quoted Cyrillic line intact', m1.files.map(x => x.buf.toString('utf8')).join('\n'));
    ok(!(m1.notes || []).some(x => /NO_MODINFO/.test(x)), 'the merge notes leave out the temp folder warning', JSON.stringify(m1.notes));
    // Excel "CSV UTF-8": BOM, comma, quotes; LibreOffice Text CSV with Tab and no BOM
    const csv = '﻿' + g1.map(c => c.map(x => quote(x, ',')).join(',')).join('\r\n');
    const c2 = T.checkTable({ buf: Buffer.from(csv, 'utf8'), mod, dir: tdir });
    ok(c2.ok && c2.translated === 1, 'hazard: an Excel CSV UTF-8 table is taken', JSON.stringify(c2));
    // Excel "Text (Tab delimited)": ANSI (cp1251 bytes) -> refused with a plain message
    const ansi = Buffer.from(g1.map(c => c.join('\t')).join('\r\n').replace(/[^\x00-\x7f]/g, 'Ò'), 'latin1');
    const c3 = T.checkTable({ buf: ansi, mod, dir: tdir });
    ok(!c3.ok && c3.probs[0].code === 'ansi' && /old character set/.test(c3.errors[0]), 'hazard: an ANSI table is refused at once with what to do', JSON.stringify(c3));
    const c4 = T.checkTable({ buf: Buffer.from(tr(grid, iTank, 'T??? ????').map(c => c.join('\t')).join('\n'), 'utf8'), mod, dir: tdir });
    ok(!c4.ok && c4.probs.some(p => p.code === 'qmarks' && p.row === iTank + 1), 'hazard: letters lost as question marks are refused with the row', JSON.stringify(c4.probs));
    const g5 = tr(grid, iTank, 'Tank'); g5[iTank][2] = 'changed by the program';
    const c5 = T.checkTable({ buf: Buffer.from(g5.map(c => c.join('\t')).join('\n'), 'utf8'), mod, dir: tdir });
    ok(!c5.ok && c5.probs.some(p => p.code === 'stale' && p.n === 1 && new RegExp('^' + (iTank + 1) + ' ').test(p.list)), 'hazard: a translated row whose source the program changed is refused at upload, not lost at merge', JSON.stringify(c5.probs));
    const c6 = T.checkTable({ buf: Buffer.from(grid.map(c => c.join('\t')).join('\n'), 'utf8'), mod, dir: tdir });
    ok(!c6.ok && c6.probs.some(p => p.code === 'empty'), 'hazard: a table with no translation is refused', JSON.stringify(c6.probs));
    const c7 = T.checkTable({ buf: Buffer.from(g1.slice(1).map(c => c.join('\t')).join('\n'), 'utf8'), mod, dir: tdir });
    ok(!c7.ok && c7.probs[0].code === 'head', 'hazard: a table without its header row is refused', JSON.stringify(c7.probs));
    const g8 = tr(grid, iTank, 'x'); g8[iTank][2] = '#NAME?';
    const c8 = T.checkTable({ buf: Buffer.from(g8.map(c => c.join('\t')).join('\n'), 'utf8'), mod, dir: tdir });
    ok(!c8.ok && c8.probs.some(p => p.code === 'formula'), 'hazard: a cell the program turned into a formula result is refused', JSON.stringify(c8.probs));
    ok([c1, c3, c4, c5, c6, c7, c8].every(c => c.probs.every(p => L.some(r => r[0] === 'task.text.e.' + p.code && r.slice(1).every(Boolean)))), 'every table problem has its message in en, ru, uk and zh');
    // the check route on a staged upload, and compile refusing a bad table
    const CP = require('../lib/compile');
    const td = D.save(ctx, { id: D.newId('text'), recipe: 'text', verb: 'make', game: 'as64', mod, answers: {}, kept: [], state: 'open' });
    fs.mkdirSync(path.dirname(D.stagedPath(ctx, td.id, 'bad.txt')), { recursive: true });
    fs.writeFileSync(D.stagedPath(ctx, td.id, 'bad.txt'), ansi);
    fs.writeFileSync(D.stagedPath(ctx, td.id, 'good.txt'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xl, 'utf16le')]));
    const rt = await R.routes['GET /api/x/task/r/text/table'](new URL('http://x/a?draft=' + td.id + '&name=bad.txt'), null, ctx);
    const rg = await R.routes['GET /api/x/task/r/text/table'](new URL('http://x/a?draft=' + td.id + '&name=good.txt'), null, ctx);
    ok(!rt.ok && rt.probs[0].code === 'ansi' && rg.ok && !('file' in rg), 'the table route checks a brought table right after the upload', JSON.stringify([rt, rg]));
    td.answers = { what: { src: 'value', value: 'translate' }, table: { src: 'file', staged: ['bad.txt'] } }; D.save(ctx, td);
    let why = ''; try { await CP.compile(ctx, td, { text: R }); } catch (e) { why = e.message; }
    ok(/cannot be used yet/.test(why) && /old character set/.test(why), 'seeded defect: Write with a bad table is refused with the same plain message', why);
    td.answers.table = { src: 'file', staged: ['good.txt'] }; D.save(ctx, td);
    const cg = await CP.compile(ctx, td, { text: R });
    ok(cg.copies && cg.copies.length === 1 && /#text_test\.lng$/.test(cg.copies[0].to), 'a good Excel table compiles to the changed .lng of the mod', JSON.stringify(cg).slice(0, 400));
    // the client: the steps per program, the BOM, the check after upload, the finder
    const TC = require('./text.client');
    ok(TC.kinds.join() === 'tsv,tlines' && (() => { try { new Function(TC.script); return true; } catch (e) { return false; } })() && !/innerHTML|=>|\$\{|`/.test(TC.script), 'text.client.js adds the kinds tsv and tlines, parses, and keeps the page rules');
    const stepKeys = Object.keys(TC.STEPS).reduce((a, p) => a.concat(Array.from({ length: TC.STEPS[p] }, (x, i) => 'task.text.k.s.' + p + '.' + (i + 1)), ['task.text.k.p.' + p]), ['task.text.k.s.first', 'task.text.k.s.last']);
    ok(stepKeys.every(k => L.some(r => r[0] === k && r.slice(1).every(Boolean))) && ['excel', 'calc', 'sheets'].every(p => TC.STEPS[p] >= 4), 'hazard: numbered save steps for Excel, LibreOffice Calc, Google Sheets and a text editor in 4 languages', stepKeys.filter(k => !L.some(r => r[0] === k)).join());
    ok(/Unicode Text/.test(L.find(r => r[0] === 'task.text.k.s.excel.4')[1]) && /65001/.test(L.find(r => r[0] === 'task.text.k.s.excel.2')[1]) && /Unicode \(UTF-8\)/.test(L.find(r => r[0] === 'task.text.k.s.calc.4')[1]), 'the Excel and Calc steps name the menu, the format and the encoding');
    ok(TC.script.includes('"\\ufeff"+r.tsv') && /r\/text\/table\?draft=/.test(TC.script) && /if\(c&&c\.ok\)st\.got=/.test(TC.script), 'hazard: the saved table carries a UTF-8 BOM and a brought table is answered only after it passed the check');
    // lines: the finder, keys used as they are, the questions that only count for lines
    const fd = await R.routes['GET /api/x/task/r/text/find'](new URL('http://x/a?mod=' + encodeURIComponent(mod) + '&q=' + encodeURIComponent('танк')), null, ctx);
    ok(fd.rows.some(x => x.key === 'desc/entity/tasktest_tank' && x.text === 'Танк тест'), 'hazard: a line is found by the words the game shows', JSON.stringify(fd.rows).slice(0, 300));
    ok(T.parseLines(['desc/entity/tasktest_tank = A'], 'name')[0].key === 'desc/entity/tasktest_tank' && T.parseLines(['mytag = A'], 'name', new Set(['mytag']))[0].key === 'mytag' && T.parseLines(['newone = A'], 'name', new Set())[0].key === 'desc/entity/newone', 'hazard: a found or whole key is used as it is; a new bare key takes the family start');
    const qs = R.groups.reduce((a, g) => a.concat(g.q.map(q => Object.assign({ g: g.id }, q))), []), Q = id => qs.find(q => q.id === id);
    ok(['force', 'replace', 'file'].every(id => Q(id).g === 'more' && JSON.stringify(Q(id).when) === JSON.stringify({ what: ['lines', 'missing'], $game: ['as64', 'mowas2'] })), 'hazard: file, force and replace sit under More choices and are asked only when lines are written (AS2 games; GoH asks file_goh)');
    ok(Q('lines').kind === 'tlines' && Q('table').picker.kinds.includes('.csv'), 'the lines question has the finder and the table takes .tsv, .txt and .csv');
    const sv = await R.values(Object.assign({}, ctx, { mod, gameId: 'as64' }), null, { verb: 'make', game: 'as64' });
    ok(sv.family === 'name', 'hazard: the default kind of text is a unit name, not full keys', sv.family);
    ok(/the game's texts or a translation/.test(L.find(r => r[0] === 'task.text.t')[1]), 'the title reads "the game\'s texts or a translation"');
    // last adoption: the check at upload, a title per verb, the Test step words, uk "моду"
    const pc = Q('table').picker.check;
    const u1 = pc({ name: 'a.txt', bytes: ansi }), u2 = pc({ name: 'a.txt', bytes: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xl, 'utf16le')]) }), u3 = pc({ name: 'a.tsv', bytes: Buffer.from(grid.map(c => c.join('\t')).join('\n'), 'utf8') });
    ok(u1 && u1.key === 'task.text.e.ansi' && u2 === null && u3 && u3.key === 'task.text.e.empty', 'hazard: picker.check refuses an unreadable table at upload with a lang key, and takes an Excel one', JSON.stringify([u1, u2, u3]).slice(0, 300));
    ok(R.title.make === 'task.text.tm' && R.title.change === 'task.text.t' && R.test === 'task.text.test' && /LOC-17/.test(L.find(r => r[0] === 'task.text.test')[1]), 'a title per verb, and the Test step says where the lines show and that there is no language switch');
    ok(!L.some(r => /(^|[^А-Яа-яІіЇїЄєҐґ])[Мм]ода([^А-Яа-яІіЇїЄєҐґ]|$)/.test(r[3])), 'uk rows say моду, not мода');
    ok(/whyKey\?tx\(r\.whyKey/.test(TC.script), 'the page shows an upload refusal in its own language');
    if (gameDir) {
      const vk = [...T.vanilla(gameDir).values()].find(r => /^desc\/entity\//.test(r.key));
      const ti = T.textItems({ game: gameDir, mod, file: '#text_test.lng', lines: [{ key: vk.key, text: 'changed' }], force: true, replace: true });
      ok(ti.notes.some(x => /whole copy of .*\(\d+ lines\)/.test(x)), 'hazard: changing a game line says the mod carries the whole file and how many lines', ti.notes.join(' | '));
      const fv = await R.routes['GET /api/x/task/r/text/find'](new URL('http://x/a?mod=' + encodeURIComponent(mod) + '&q=' + encodeURIComponent(vk.key)), null, ctx);
      ok(fv.rows.length > 0 && fv.rows.length <= 30, 'the finder searches the game texts too (30 at most)', fv.rows.length);
    }
    const cards = await R.check({ mod, game: 'as64' }, ctx);
    ok(cards.length === 2 && cards[0].title === 'lnglint' && cards[0].level === 'ok' && cards[1].title === 'loccover', 'the Check step gives the lnglint and loccover cards', JSON.stringify(cards).slice(0, 400));
    // PERF A1: loccover and lnglint run as child processes (ctx.runTool) and give the answer of the call in process, on a mod with
    // a card that has no name and a text line with a stray '<'
    const mod2 = path.join(scratch, 'mods', 'text_child');
    fs.rmSync(mod2, { recursive: true, force: true });
    fs.mkdirSync(path.join(mod2, 'resource', 'set', 'multiplayer', 'units'), { recursive: true });
    fs.mkdirSync(path.join(mod2, 'localization'), { recursive: true });
    fs.writeFileSync(path.join(mod2, 'resource', 'set', 'multiplayer', 'units', 'common.set'), ';SDL\r\n{units\r\n\t{"taskchildcard" {tags "all"}}\r\n}\r\n');
    fs.writeFileSync(path.join(mod2, 'localization', '#text_child.lng'), '{tags\r\n\t{"desc"\r\n\t\t{"entity"\r\n\t\t\t{"childtank" "a < b"}\r\n\t\t}\r\n\t}\r\n}\r\n');
    const U2 = n => new URL('http://x/api/x/task/r/text/' + n + '?mod=' + encodeURIComponent(mod2));
    const seen = [], ctxT = Object.assign({}, ctx, { runTool: async (t, e, a, o) => { seen.push({ t, e, a: a.slice(), o }); return ctx.runTool(t, e, a, o); } });
    const ctxIn = Object.assign({}, ctx, { runTool: undefined });
    const RM = R.routes['GET /api/x/task/r/text/missing'], RL = R.routes['GET /api/x/task/r/text/lint'];
    T.MISS.clear(); const mC = await RM(U2('missing'), null, ctxT);
    T.MISS.clear(); const mI = await RM(U2('missing'), null, ctxIn);
    ok(mC.rows.length > 0 && JSON.stringify(mC) === JSON.stringify(mI), 'the missing-lines route through a child gives the answer of the call in process', JSON.stringify([mC, mI]));
    const lC = await RL(U2('lint'), null, ctxT), lI = await RL(U2('lint'), null, ctxIn);
    ok(lC.findings.length > 0 && JSON.stringify(lC) === JSON.stringify(lI), 'the lint route through a child gives the answer of the call in process', JSON.stringify([lC, lI]));
    const sL = seen.find(x => x.t === 'loccover'), sN = seen.find(x => x.t === 'lnglint');
    ok(seen.length === 2 && sL && sL.e === 'loccover/loccover.js' && sN && sN.e === 'lnglint/lnglint.js' && [sL, sN].every(x => x.a[0] === mod2 && x.a.includes('--no-rc') && x.a.join(' ').includes('--format json') && x.o.timeoutMs >= 600000) && sN.a.includes('--no-game'),
      'both tools are started through ctx.runTool with no .lintrc, a JSON report and a long time limit; lnglint without the vanilla compare', JSON.stringify(seen));
    const left = () => { try { return fs.readdirSync(path.join(ctx.tmpRoot, 'task')).filter(x => /^text-.*\.json$/.test(x)); } catch (e) { return []; } };
    ok(!left().length, 'the report files of the children are removed', left().join());
    T.MISS.clear(); const cC = await R.check({ mod: mod2, game: 'as64' }, ctxT); const cI = await R.check({ mod: mod2, game: 'as64' }, ctxIn);
    ok(cC[0].level === 'error' && cC[1].level === 'warn' && JSON.stringify(cC) === JSON.stringify(cI), 'the Check step cards through children are the cards of the calls in process', JSON.stringify([cC, cI]).slice(0, 600));
    // the footer's Cancel: the job kills the child; both routes answer {stopped} and nothing is remembered
    const ctxStop = Object.assign({}, ctx, { runTool: async () => ({ code: null, stdout: '', stderr: '', timedOut: false, cancelled: true }) });
    T.MISS.clear(); const mS = await RM(U2('missing'), null, ctxStop), lS = await RL(U2('lint'), null, ctxStop);
    ok(JSON.stringify(mS) === '{"stopped":true}' && JSON.stringify(lS) === '{"stopped":true}' && !T.MISS.size, 'a cancelled job: both routes answer stopped and the stopped answer is not kept', JSON.stringify([mS, lS]));
    const ctxJob = Object.assign({}, ctx, { job: { cancelled: true }, runTool: async () => ({ code: 2, stdout: '', stderr: '', timedOut: false, cancelled: false }) });
    ok((await RM(U2('missing'), null, ctxJob)).stopped === true, 'a job cancelled while the tool ended is stopped too');
    // seeded defect: a tool that gives no report: no rows (as a loccover that threw in process), lnglint's own error is the route's
    const ctxBad = Object.assign({}, ctx, { runTool: async () => ({ code: 2, stdout: '', stderr: 'error: seeded lnglint fault\n', timedOut: false, cancelled: false }) });
    T.MISS.clear(); const mB = await RM(U2('missing'), null, ctxBad); let lB = ''; try { await RL(U2('lint'), null, ctxBad); } catch (e) { lB = e.message; }
    ok(Array.isArray(mB.rows) && !mB.rows.length && !T.MISS.size && lB === 'seeded lnglint fault', 'seeded defect: a tool with no report gives no rows, and the lint route throws what lnglint said', JSON.stringify([mB, lB]));
    // the server thread stays free while the tools run: a timer keeps firing during a route whose tool takes 300 ms
    let ticks = 0; const tk = setInterval(() => { ticks++; }, 10);
    const ctxSlow = Object.assign({}, ctx, { runTool: (t, e, a, o) => new Promise(res => setTimeout(() => res(ctx.runTool(t, e, a, o)), 300)) });
    T.MISS.clear(); const mW = await RM(U2('missing'), null, ctxSlow); clearInterval(tk);
    ok(ticks >= 10 && JSON.stringify(mW) === JSON.stringify(mI), 'the route awaits the tool: timers ran while it waited (' + ticks + ')');
  } catch (e) { ok(false, 'routes crashed', e.stack); }
  console.log(n + ' passed, ' + f + ' failed (routes)');
  fails += f;
  console.log(fails ? 'FAIL' : 'PASS');
  if (fails) process.exitCode = 1;
})();
