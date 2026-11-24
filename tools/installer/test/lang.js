#!/usr/bin/env node
// installer languages: every text the installer shows (say, errT, tr, askConsole, setProg in src/*.go) has a Russian, Ukrainian
// and Chinese entry in src/lang.json with the same format verbs in the same order, and every key of the setup page exists in
// all four languages with the same {n} marks. No Go needed.
// Author: Imperator_Aug (ARSENAL, ia-698f7dc5)
'use strict';
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', 'src');
let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('  FAIL ' + m); } };
const tab = JSON.parse(fs.readFileSync(path.join(SRC, 'lang.json'), 'utf8'));
const verbs = s => (s.match(/%[-+# 0]*\d*(?:\.\d+)?[a-zA-Z]/g) || []).join(' ');
const marks = s => (s.match(/\{\d\}/g) || []).sort().join(' ');

// 1 the Go side
const CALL = /(?:\bsay\("[^"]*", |\berrT\(|\btr\(|\baskConsole\(|\bsetProg\()"((?:[^"\\]|\\.)*)"/g;
const used = new Set();
for (const f of fs.readdirSync(SRC).filter(x => x.endsWith('.go'))) {
  const s = fs.readFileSync(path.join(SRC, f), 'utf8');
  let m; while ((m = CALL.exec(s))) { const t = JSON.parse('"' + m[1] + '"'); if (/[A-Za-z]{2}/.test(t.replace(/%[a-z]/g, ''))) used.add(t); }
}
ok(used.size > 100, '1 the texts of the installer were found in the Go files: ' + used.size);
for (const t of used) {
  const row = tab.text[t];
  ok(Array.isArray(row) && row.length === 3 && row.every(x => typeof x === 'string' && x), '1 no ru/uk/zh entry for: ' + t);
  if (Array.isArray(row)) row.forEach((x, i) => ok(verbs(x) === verbs(t), '1 format verbs differ (' + ['ru', 'uk', 'zh'][i] + '): ' + t));
}
for (const t of Object.keys(tab.text)) ok(used.has(t), '1 an entry of lang.json that no Go file uses: ' + t);
for (const t of Object.keys(tab.text)) {
  const [ru, uk, zh] = tab.text[t];
  ok(/[Ѐ-ӿ]/.test(ru) && /[Ѐ-ӿ]/.test(uk) && (/[一-鿿]/.test(zh)), '1 a translation in the wrong script: ' + t);
}

// 2 the page
const page = fs.readFileSync(path.join(SRC, 'page.html'), 'utf8');
const keys = new Set();
let m; const DT = /data-t="([A-Za-z]+)"/g, PK = /\bP\((?:bad \? )?'([A-Za-z]+)'(?: : '([A-Za-z]+)')?/g;
while ((m = DT.exec(page))) keys.add(m[1]);
while ((m = PK.exec(page))) { keys.add(m[1]); if (m[2]) keys.add(m[2]); }
ok(keys.size > 25, '2 the keys of the page were found: ' + keys.size);
for (const k of keys) ok(Array.isArray(tab.page[k]) && tab.page[k].length === 4 && tab.page[k].every(x => x), '2 the page key has no four languages: ' + k);
for (const k of Object.keys(tab.page)) {
  ok(keys.has(k), '2 a page entry of lang.json the page does not use: ' + k);
  tab.page[k].forEach(x => ok(marks(x) === marks(tab.page[k][0]), '2 {n} marks differ: ' + k));
}
ok(page.includes('/*LANG*/{}'), '2 the page has the place the installer fills with the language table');
ok(['en', 'ru', 'uk', 'zh'].every(l => tab.names[l]), '2 every language has a name');

console.log(bad ? `installer languages: ${bad} of ${n} FAILED\nFAIL` : `installer languages: ${n} checks ok\nPASS`);
process.exit(bad ? 1 : 0);
