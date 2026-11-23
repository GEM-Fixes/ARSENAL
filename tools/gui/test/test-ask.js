// The shared "do it?" box and the loading / result helpers of page.js (loading, result, askDo), run on the fake DOM.
// No server, no browser. Last line PASS on success.
// Author: Imperator_Aug (ARSENAL, ia-6ed30b20)
const fs = require('fs'), path = require('path'), vm = require('vm');
const fakedom = require('./fakedom');
const src = fs.readFileSync(path.join(__dirname, '..', 'page.js'), 'utf8');
const a = src.indexOf('function loading(el,key)'), b = src.indexOf('// opt.out (GT-22)');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL ' + m); } else console.log('ok   ' + m); };
ok(a > 0 && b > a, 'helpers found in page.js');
const code = src.slice(a, b);
function page(withDialog) {
  const doc = fakedom.make(), confirms = [];
  const ctx = {
    document: doc, confirms, answer: true,
    confirm: m => { confirms.push(m); return ctx.answer; },
    $: id => doc.getElementById(id),
    tx: (k, p) => k + (p ? ' ' + Object.values(p).join(' ') : ''),
    h: (tag, attrs, kids) => { const e = doc.createElement(tag); for (const k in attrs || {}) { const v = attrs[k]; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else if (k === 'id') { e.id = v; doc.ids.set(v, e); } else e.setAttribute(k, v); } for (const c of kids || []) if (c) e.appendChild(c); return e; },
  };
  if (withDialog) ctx.HTMLDialogElement = function () {};
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(code, ctx);
  return ctx;
}
(async () => {
  // no dialog element: window.confirm with the same text, answered at once
  let P = page(false), got = null;
  P.askDo({ title: 'Write files', lines: ['a.txt: will be copied', '', 'b.txt: stays'], where: 'C:/mod' }).then(v => { got = v; });
  ok(got === true && P.confirms.length === 1, 'fallback asks with window.confirm and answers in the same instant');
  ok(['Write files', 'a.txt: will be copied', 'b.txt: stays', 'ui.where C:/mod'].every(s => P.confirms[0].includes(s)), 'fallback text has the title, every line and the folder');
  P.answer = false; got = null; P.askDo({ title: 'x' }).then(v => { got = v; }); ok(got === false, 'fallback: Cancel is false');

  // the box
  P = page(true);
  let p = P.askDo({ title: 'Write files', lines: ['a.txt: will be copied', 'b.txt: stays'], where: 'C:/mod', ok: 'Copy now' });
  let d = P.document.getElementById('ask');
  ok(d && d.open === true && P.confirms.length === 0, 'the box opens; window.confirm is not used');
  const text = d.textContent;
  ok(['Write files', 'a.txt: will be copied', 'b.txt: stays', 'ui.where C:/mod', 'Copy now', 'ui.cancel'].every(s => text.includes(s)), 'box shows title, lines, folder, the confirm text and Cancel');
  ok(d.querySelectorAll('li').length === 2, 'one list row per line');
  ok(P.document.activeElement && P.document.activeElement.textContent === 'Copy now', 'focus starts on the confirm button');
  d.byText('Copy now', 'button').click();
  ok(await p === true && d.open === false, 'confirm answers true and closes the box');

  p = P.askDo({ title: 'Replace files', lines: ['old files are replaced'], danger: true });
  d = P.document.getElementById('ask');
  ok(!d.textContent.includes('a.txt') && d.textContent.includes('ui.doIt'), 'the box is built fresh each time; default confirm text');
  ok(P.document.activeElement.textContent === 'ui.cancel', 'danger: focus starts on Cancel');
  d.byText('ui.cancel', 'button').click();
  ok(await p === false, 'Cancel answers false');

  p = P.askDo({ title: 'Esc' }); d = P.document.getElementById('ask');
  d.close(); if (d.onclose) d.onclose();                       // what the browser does on Esc
  ok(await p === false, 'closing the box (Esc) answers false');

  // loading / result
  const el = P.document.createElement('div'); el.textContent = 'old';
  P.loading(el); ok(el.textContent === 'ui.checking' && el.children[0].className === 'hint', 'loading shows one hint line');
  P.loading(el, 'my.key'); ok(el.textContent === 'my.key', 'loading takes its own text key');
  P.result(el, 'ok', 'Done'); ok(el.className === 'ok' && el.textContent === 'Done', 'result sets the kind and the text');
  console.log(fails ? 'FAIL ask (' + fails + ')' : 'PASS ask');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL ask: ' + (e.stack || e)); process.exit(1); });
