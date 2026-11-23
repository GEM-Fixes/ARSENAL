// Inline include windows (ui/inc.js, route POST /api/x/ide/inc, IDE_ED inline/linkDoc/incGutter). Run by tools/gui/ext/ide/test.js
// (hook at its end, or alone: IDE_ONLY=inc node tools/gui/ext/ide/test.js <scratch>). module.exports = async function(env){}.
// Route cases on a fixture game of their own (one defect per include line); page cases in the fake DOM with the fake editor.
// Author: Imperator_Aug (ARSENAL, ia-6ea1b7cf)
'use strict';
const fs = require('fs'), path = require('path');

module.exports = async function (env) {
  const { boot } = env;
  const ok = (c, m, x) => env.ok(c, c || x === undefined ? m : m + ' [' + String(x).slice(0, 400) + ']');
  const wr = (f, b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };
  const EN = {}; for (const r of require('./lang/inc').concat(require('./lang/core'))) EN[r[0]] = r[1];
  const fill = (k, p) => String(EN[k] || k).replace(/\{(\w+)\}/g, (m, n) => (p && p[n] != null ? String(p[n]) : m));

  // ================================================================ route
  {
    const W = env.scratch('inc-route'), game = path.join(W, 'game'), mod = path.join(game, 'mods', 'mine');
    wr(path.join(game, 'as64.exe'), 'MZ');
    const big = []; for (let i = 0; i < 9000; i++) big.push('{line_' + i + ' "' + 'x'.repeat(30) + '"}'); const bigText = big.join('\r\n') + '\r\n';
    const cp = Buffer.concat([Buffer.from('; '), Buffer.from([0xcf, 0xf0, 0xe8]), Buffer.from('\r\n(define "cpmac" (x))\r\n')]);   // cp1251 comment
    wr(path.join(game, 'resource.pak'), require('../../../lib/zipwrite').zip([
      ['set/g.inc', Buffer.from('(define "gmac" (y 1))\r\n'), true],
      ['set/big.inc', Buffer.from(bigText), true],
      ['set/cp.inc', cp, false]]));
    wr(path.join(mod, 'mod.info'), '{mod {name "Mine"}}\r\n');
    const host = '{x\r\n (include "b.inc")\r\n (include "/set/g.inc")\r\n (include "nothere.inc")\r\n (include "//abs/x.inc")\r\n (include "/set/big.inc")\r\n}\r\n';
    wr(path.join(mod, 'resource', 'set', 'a.set'), host);
    const bBytes = Buffer.from('﻿(define "bmac" (z))\r\n(include "a.set")\r\n', 'utf8');
    wr(path.join(mod, 'resource', 'set', 'b.inc'), bBytes);
    wr(path.join(mod, 'resource', 'set', 'sub', 'c.inc'), '(include "../b.inc")\r\n');
    const ctx2 = Object.assign({}, env.ctx, { game: () => game });
    const P = b => env.post('inc', Object.assign({ mod, rel: 'resource/set/a.set' }, b), ctx2);
    const r1 = await P({ value: 'b.inc' });
    ok(r1.found && r1.where === 'mine' && r1.editable === true && r1.ref && r1.ref.rel === 'resource/set/b.inc' && r1.whole && r1.key === 'resource/set/b.inc', 'inc route: a loose file of this mod, relative to the including file, is editable', JSON.stringify(r1).slice(0, 300));
    ok(r1.text === '(define "bmac" (z))\n(include "a.set")\n', 'inc route: the text has \\n ends and no BOM', JSON.stringify(r1.text));
    const r2 = await P({ value: '/set/g.inc' });
    ok(r2.found && r2.where === 'vanilla' && r2.editable === false && /resource\.pak$/i.test(r2.inPak || '') && r2.ref && r2.ref.key === 'resource/set/g.inc' && Number.isInteger(r2.ref.idx), 'inc route: a game pak entry is read only, opened by key and layer', JSON.stringify(r2).slice(0, 300));
    ok(/gmac/.test(r2.text), 'inc route: the pak entry text is read');
    const r3 = await P({ value: 'nothere.inc' });
    ok(r3.found === false && r3.tried && r3.tried.includes('resource/set/nothere.inc') && r3.text === '', 'inc route: a missing include names the path tried', JSON.stringify(r3));
    const r4 = await P({ value: '//abs/x.inc' });
    ok(r4.special === true && r4.found === false, 'inc route: a // path is named special, not read', JSON.stringify(r4));
    const r5 = await P({ value: '/set/big.inc' });
    ok(r5.found && !r5.whole && r5.next > 0 && r5.next < bigText.length && /\n$/.test(r5.text) && r5.editable === false && r5.size === bigText.length, 'inc route: a big pak entry comes in pages that end on a whole line', JSON.stringify({ next: r5.next, size: r5.size, whole: r5.whole }));
    const r5b = await P({ value: '/set/big.inc', off: r5.next });
    ok(r5b.next === null && (r5.text + r5b.text) === bigText.replace(/\r\n/g, '\n'), 'inc route: the next page carries on where the first stopped, to the end', String(r5b.next));
    const r6 = await P({ value: '../b.inc', from: 'resource/set/sub/c.inc' });
    ok(r6.found && r6.key === 'resource/set/b.inc', 'inc route: a nested include resolves against its own file (from)', r6.key);
    const r7 = await P({ value: '/set/cp.inc' });
    ok(r7.found && /При/.test(r7.text) && /cpmac/.test(r7.text), 'inc route: a cp1251 line is shown as cp1251 text', JSON.stringify(r7.text));
    await env.rejects(() => P({ value: '' }), 400, /value/, 'inc route: no value -> 400');
    await env.rejects(() => P({ value: 'b.inc', lim: 0 }), 400, /lim/, 'inc route: a bad lim -> 400');
    ok(fs.readFileSync(path.join(mod, 'resource', 'set', 'b.inc')).equals(bBytes) && fs.readFileSync(path.join(mod, 'resource', 'set', 'a.set'), 'utf8') === host, 'inc route: reads only (bytes of both files as they were)');
    ok(!require('../../remote').ALLOW.has('POST /api/x/ide/inc'), 'inc route: not open to a phone (default deny)');
  }

  // ================================================================ page
  const HOST = 'resource/set/a.set', B = 'resource/set/b.inc', C = 'resource/set/c.inc';
  const hostText = '{x\n (include "b.inc")\n (include "g.inc")\n (include "gone.inc")\n (include "c.inc")\n}\n';
  const bText = '(define "bmac" (z 1))\n(define "bmac2" (z 2))\n(include "a.set")\n(include "c.inc")\n';
  const cText = '(include "d1.inc")\n';
  // a fake inc route: value -> answer, by the including key
  const chainFile = n => 'resource/set/d' + n + '.inc';
  function incAnswer(b) {
    const from = b.from || (b.rel ? b.rel.toLowerCase() : 'resource/x'), dir = from.slice(0, from.lastIndexOf('/') + 1), key = (dir + b.value).toLowerCase();
    const base = { value: b.value, kind: 'virtual', key, found: false, special: false, where: null, layer: null, tried: [key], ref: null, editable: false, inPak: null, size: 0, off: 0, next: null, text: '', whole: false };
    const loose = { [HOST]: hostText, [B]: bText, [C]: cText };
    for (let i = 1; i <= 7; i++) loose[chainFile(i)] = '(include "d' + (i + 1) + '.inc")\n';
    if (loose[key] != null) return Object.assign(base, { found: true, where: 'mine', layer: 'this mod', ref: { rel: key }, editable: true, size: loose[key].length, text: loose[key], whole: true });
    if (key === 'resource/set/g.inc') return Object.assign(base, { found: true, where: 'vanilla', layer: 'game', inPak: 'resource.pak', ref: { key, idx: 0 }, size: 22, text: '(define "gmac" (y 1))\n', whole: true });
    return base;
  }
  const files = { [HOST]: hostText, [B]: bText, [C]: cText };
  for (let i = 1; i <= 7; i++) files[chainFile(i)] = '(include "d' + (i + 1) + '.inc")\n';
  let hoverAns = null;
  const page = async () => {
    const P = await boot({ files, api: req => {
      if (req.path === '/api/x/ide/inc') return incAnswer(req.body);
      if (req.path === '/api/x/ide/hover') return { hover: hoverAns };
      return undefined;
    } });
    P.main = () => P.F.made[0];
    P.said = []; const say = P.IDE.status; P.IDE.status = t => { P.said.push(t || ''); return say(t); };
    return P;
  };
  const cl = (e, c) => !!(e && e.className && (' ' + e.className + ' ').indexOf(' ' + c + ' ') >= 0);

  // ---- P1. open and close; host text unchanged; gutter; header; defines list; Esc back
  {
    const P = await page();
    const d = await P.open(HOST, 2, 3), ed = P.main();
    ok(d && ed.current() === d.id, 'inc P1: host open');
    ok(['incToggle', 'incAll', 'incNone', 'incEnter'].every(k => P.IDE.actions[k]) && P.IDE.actions.incToggle.key === 'Alt+I' && P.IDE.actions.incToggle.group === 'jump', 'inc P1: actions incToggle (Alt+I), incAll, incNone, incEnter in the Jump group');
    ok(ed.gut && ed.gut.doc === d.id && ed.gut.list.map(x => x.line).join() === '2,3,4,5' && ed.gut.list.every(x => !x.open), 'inc P1: the include gutter marks lines 2-5 (closed)', JSON.stringify(ed.gut && ed.gut.list));
    const n0 = P.F.made.length;
    P.IDE.run('incToggle'); await P.flush();
    const W = P.IDE.inc.all()[0];
    ok(W && W.state === 'shown' && P.F.made.length === n0 + 1 && ed.calls('inline').length === 1 && ed.calls('inline')[0][0] === 2, 'inc P1: Alt+I opens a window under line 2 (a line widget, an editor of its own)', W && W.state);
    const wed = W.ed;
    ok(wed.text(W.wid) === bText && wed.doc(W.wid).ro === false, 'inc P1: the window shows b.inc, editable (a loose file of this mod)');
    ok(P.sec.all().some(e => e === W.node) && W.node.getAttribute('role') === 'region' && /b\.inc/.test(W.node.getAttribute('aria-label')), 'inc P1: the window is in the page, a labelled region');
    ok(W.where.textContent === EN['ide.inc.w.mine'] && W.ro.hidden && W.count.textContent === fill('ide.inc.lines', { n: 5 }), 'inc P1: header: where (this mod), no read-only badge, line count', W.where.textContent + '|' + W.count.textContent);
    ok(!W.defb.hidden && W.defl.children.length === 2 && W.defl.children[0].textContent === 'bmac', 'inc P1: the macros it defines are listed');
    W.defl.children[1].click();
    ok(JSON.stringify(wed.calls('goto').pop()) === '[2,1]', 'inc P1: a macro button jumps to it inside the window', JSON.stringify(wed.calls('goto')));
    ok(ed.gut.list.find(x => x.line === 2).open === true, 'inc P1: the gutter arrow of line 2 shows open');
    ok(ed.text(d.id) === hostText.replace(/\n$/, '\n') && ed.lineCount() === hostText.split('\n').length && !P.IDE.isDirty(d), 'inc P1: the host text, its line count and clean state are unchanged');
    // grow, shrink, keyboard resize
    const h0 = W.h; W.head.children.find(b => b.getAttribute && b.getAttribute('aria-label') === EN['ide.inc.grow']).click();
    ok(W.h === h0 + 120 && W.body.style.height === (h0 + 120) + 'px', 'inc P1: grow makes the window taller');
    W.rz.dispatchEvent && W.rz.dispatchEvent({ type: 'keydown', key: 'ArrowUp', preventDefault() {} });
    ok(W.rz.getAttribute('role') === 'separator' && W.rz.getAttribute('tabindex') === '0', 'inc P1: the bottom edge is a focusable separator');
    // Esc in the window: back to the host line
    const gotos = ed.calls('goto').length; wed.keyMap.Esc();
    ok(ed.calls('goto').length === gotos + 1 && ed.calls('goto').pop()[0] === 2, 'inc P1: Esc in the window goes back to the include line', JSON.stringify(ed.calls('goto').slice(-1)));
    // open in its own tab
    ed.goto(6, 1); await P.flush();   // the host cursor is somewhere else (a gutter click does not move it)
    W.tabb.click(); await P.flush();
    ok(P.IDE.active() && P.IDE.active().ref.rel === B, 'inc P1: "Open in tab" opens b.inc as a tab');
    const hl = P.IDE.hist.list().slice(-1)[0];
    ok(hl && hl.ref.rel === HOST && hl.line === 2, 'inc P1: the jump trail starts at the include line of the window, not the host cursor', JSON.stringify(hl));
    ok(P.B('foot').textContent.indexOf('Came from a.set:2') === 0, 'inc P1: footnote "Came from a.set:2"', P.B('foot').textContent);
    await P.IDE.open({ rel: HOST }); await P.flush();
    // close by the gutter arrow
    ed.gut.fn(2); await P.flush();
    ok(P.IDE.inc.all().length === 0 && !P.sec.all().some(e => e === W.node) && W.dead, 'inc P1: the gutter arrow closes it again (node gone, its editor ended)');
    ok(ed.text(P.IDE.active().id) === hostText, 'inc P1: host text still the same after open and close');
  }

  // ---- P2. missing include, game pak file read only, special
  {
    const P = await page();
    const d = await P.open(HOST, 4, 3), ed = P.main();
    const W = P.IDE.incToggle(4); await P.flush();
    ok(W && W.state === 'msg' && !W.msg.hidden && W.msg.textContent === fill('ide.inc.missing', { p: 'resource/set/gone.inc' }) && W.body.hidden && !W.ed, 'inc P2: a missing include shows one line with the path tried, no empty box', W && W.msg.textContent);
    const G = P.IDE.incToggle(3); await P.flush();
    ok(G && G.state === 'shown' && G.ed.doc(G.wid).ro === true && !G.ro.hidden && G.where.textContent === fill('ide.inc.w.gamePak', { p: 'resource.pak' }), 'inc P2: a game pak file is read only with a badge and where it came from', G && G.where.textContent);
    const docs0 = P.IDE.docs.length; G.ed.userEdit([{ line: 1, col: 1, endCol: 1, text: 'x' }]); await P.flush();
    ok(P.IDE.docs.length === docs0 && !G.doc, 'inc P2: a read-only window never becomes a tab');
    ok(!P.asked.some(a => a.path === '/api/x/files/open' && /g\.inc/.test(a.url)), 'inc P2: a game file is not asked from the mod (files/open)');
    ok(ed.text(d.id) === hostText, 'inc P2: host text unchanged');
  }

  // ---- P3. nested + cycle guard + depth cap
  {
    const P = await page();
    await P.open(HOST, 2, 1);
    const W = P.IDE.incToggle(2); await P.flush();
    const cyc = P.IDE.inc.nested(W, 3); await P.flush();
    ok(cyc && cyc.state === 'msg' && cyc.msg.textContent === fill('ide.inc.cycle', { p: HOST }) && W.kids.length === 1, 'inc P3: an include of a file already open above is refused with a message (cycle)', cyc && cyc.msg.textContent);
    const c = P.IDE.inc.nested(W, 4); await P.flush();
    ok(c && c.state === 'shown' && c.depth === 2 && c.ed.text(c.wid) === cText && W.ed.calls('inline').length === 2, 'inc P3: a nested window opens inside the window (depth 2)');
    let w = c, deep = null;
    for (let i = 0; i < 6 && w && w.state === 'shown'; i++) { const nx = P.IDE.inc.nested(w, 1); await P.flush(); deep = nx; w = nx; }
    ok(deep && deep.state === 'msg' && deep.msgKey === 'ide.inc.deep' && deep.depth === P.IDE.inc.MAXD + 1, 'inc P3: depth is capped and says so', deep && (deep.depth + ' ' + deep.msgKey));
    // closing the outer window ends every window inside it
    const inner = c; P.IDE.inc.close(2); await P.flush();
    ok(inner.dead && P.IDE.inc.all().length === 0, 'inc P3: closing a window closes the ones inside it');
  }

  // ---- P4. one buffer with an open tab; a window edited before its file has a tab makes the tab
  {
    const P = await page();
    const tab = await P.open(B, 1, 1), ed = P.main();
    const host = await P.open(HOST, 2, 1);
    const W = P.IDE.incToggle(2); await P.flush();
    ok(W.doc === tab && W.ed.calls('linkDoc').length === 1 && W.ed.calls('linkDoc')[0][1] === tab.id, 'inc P4: with b.inc open in a tab the window is linked to that buffer', JSON.stringify(W.ed.calls('linkDoc')));
    const v0 = tab.ver || 0;
    W.ed.userEdit([{ line: 1, col: 1, endCol: 1, text: '; mine\n' }]); await P.flush();
    ok(ed.text(tab.id) === '; mine\n' + bText && P.IDE.isDirty(tab) && (tab.ver || 0) > v0, 'inc P4: an edit in the window is the tab\'s edit (same text, dirty, new version)', JSON.stringify(ed.text(tab.id)).slice(0, 80));
    ok(ed.text(host.id) === hostText && !P.IDE.isDirty(host), 'inc P4: the host stays clean and unchanged');
    ok(P.posts().some(a => a.path === '/api/x/ide/lint' && a.body.rel === B), 'inc P4: the edited file is checked as a tab is');
    // the same edit seen from the tab side: one undo history (the fake shares lines + undo)
    ok(W.ed.text(W.wid) === ed.text(tab.id), 'inc P4: window and tab show one text');
    // save from the window goes through the editor's save (Show changes first: GT-20)
    W.ed.emit('save', {}); await P.flush();
    ok(P.asked.some(a => a.path === '/api/x/files/save' && a.body.rel === B && !a.body.write), 'inc P4: Ctrl+S in the window runs the normal save of that file (preview first)');
    // a window with no tab: the first edit makes the tab (not shown), linked
    const P2 = await page();
    await P2.open(HOST, 5, 1);
    const n0 = P2.IDE.docs.length;
    const W2 = P2.IDE.incToggle(5); await P2.flush();
    ok(!W2.doc && P2.IDE.docs.length === n0, 'inc P4: opening a window adds no tab');
    W2.ed.userEdit([{ line: 1, col: 1, endCol: 1, text: ';x\n' }]); await P2.flush();
    const nd = P2.IDE.docs.find(x => x.ref.rel === C);
    ok(nd && W2.doc === nd && P2.IDE.docs.length === n0 + 1 && P2.IDE.active().ref.rel === HOST, 'inc P4: the first edit makes a tab for c.inc, the host stays the active tab');
    ok(P2.main().calls('linkDoc').length === 1 && P2.main().text(nd.id) === ';x\n' + cText && P2.IDE.isDirty(nd), 'inc P4: that tab is the window\'s buffer (linked), dirty');
    // closing the file's tab (edits thrown away) reads the window again from disk
    P2.IDE.close(nd, true); await P2.flush();
    ok(W2.state === 'shown' && !W2.doc && W2.ed && W2.ed.text(W2.wid) === cText, 'inc P4: closing that tab without saving gives the window the text on disk again', W2.ed && W2.ed.text(W2.wid));
  }

  // ---- P5. remembered per file: closing the tab and opening it again brings the windows back; open all, close all
  {
    const P = await page();
    const d = await P.open(HOST, 2, 1);
    P.IDE.inc.open(2); P.IDE.inc.open(5); await P.flush();
    ok(P.IDE.inc.all().length === 2, 'inc P5: two windows open');
    P.IDE.close(d, true); await P.flush();
    ok(P.IDE.inc.all().length === 0, 'inc P5: closing the tab ends its windows');
    const d2 = await P.open(HOST, 1, 1); await P.flush();
    const lines = (P.IDE.inc.hosts()[d2.id] || []).map(w => w.handle.line()).sort().join();
    ok(lines === '2,5' && P.IDE.inc.all().every(w => w.state === 'shown'), 'inc P5: opening it again restores both windows on their lines', lines);
    P.IDE.run('incNone'); await P.flush();
    ok(P.IDE.inc.all().length === 0, 'inc P5: Close all include windows');
    P.IDE.run('incAll'); await P.flush();
    ok(P.IDE.inc.all().length === 4 && P.said.some(t => t === fill('ide.inc.allDone', { n: 4 })), 'inc P5: Show all includes opens one per include line', P.said.slice(-2).join('|'));
    ok(P.main().text(d2.id) === hostText, 'inc P5: host text unchanged with four windows');
  }

  // ---- P6. the include hover has a "Show it here" link
  {
    const P = await page();
    await P.open(HOST, 3, 1);
    hoverAns = { what: 'include', title: 'g.inc', lead: { k: 'ide.h.include', p: {} }, rows: [], links: [] };
    let card = null; P.main().hover({ line: 3, col: 14 }, c => { card = c; }); await P.flush();
    const l = card && card.links && card.links[0];
    ok(l && l.text === EN['ide.inc.showHere'], 'inc P6: the include hover offers "Show it here"', JSON.stringify(card));
    if (l) { l.run(); await P.flush(); }
    ok(P.IDE.inc.all().length === 1 && P.IDE.inc.all()[0].handle.line() === 3, 'inc P6: the link opens the window under that line');
    hoverAns = null;
  }

  // ---- P8. a slow server (the first check of a big mod holds the one thread): the window says what it waits for
  {
    const P = await boot({ files, api: req => (req.path === '/api/x/ide/inc' ? env.PENDING : undefined) });
    await P.IDE.open({ rel: HOST }, 2, 1); await P.flush();
    const W = P.IDE.incToggle(2); await P.flush();
    ok(W && W.state === 'loading' && !W.msg.hidden && W.msg.textContent === EN['ide.inc.waitSrvT'] && W.count.textContent === EN['ide.inc.waitSrv'], 'inc P8: a window still loading after 2 s says it waits for the first check of the mod', W && W.msg.textContent);
  }

  // ---- P7. words: every key in four languages, every tx key of ui/inc.js has a row
  {
    const rows = require('./lang/inc'), src = fs.readFileSync(path.join(__dirname, 'ui', 'inc.js'), 'utf8');
    ok(rows.every(r => r.length === 5 && r.every(x => typeof x === 'string' && x.length)), 'inc P7: every row has en, ru, uk, zh');
    const keys = new Set(rows.map(r => r[0]).concat(require('./lang/core').map(r => r[0])));
    const used = new Set(); for (const m of src.matchAll(/'(ide\.(?:inc|a)\.[A-Za-z0-9.]+)'/g)) used.add(m[1]);
    const miss = [...used].filter(k => !keys.has(k) && !/\.$/.test(k) && k !== 'ide.inc.h');   // ide.inc.h: the LS key of the height, not a word
    ok(!miss.length, 'inc P7: every key ui/inc.js names has a row', miss.join());
    ok(!/`|\$\{|innerHTML|=>|\blet\b|\bconst\b/.test(require('./ui/inc').script), 'inc P7: page script is ES5 (no backtick, arrow, let, const, innerHTML)');
  }
};
