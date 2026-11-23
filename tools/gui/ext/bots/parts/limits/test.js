// Bots part limits test. Arg: scratch dir (unused: nothing is written). Checks the part contract, the four languages, that the client
// draws every line with its ID (fake h/tx), and that every ID is a real row of limits/ for GH*).
// Author: Imperator_Aug (ARSENAL, ia-5784b844)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const P = require('./index'), check = require('../index').check;
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL ' + m); } };
ok(check('limits', P) === '', 'contract: ' + check('limits', P));
ok(P.group === 'F' && Object.keys(P.routes).length === 0, 'group F, no routes');
for (const r of P.lang) ok(r.length === 5 && r.slice(1).every(s => typeof s === 'string' && s.trim()) && r.slice(2).every(s => s !== r[1]), 'four languages, translated: ' + r[0]);
// the client in a sandbox: h() makes plain objects, tx() returns the English string
const en = {}; P.lang.forEach(r => { en[r[0]] = r[1]; });
const mk = (tag, a, kids) => ({ tag, a: a || {}, kids: (kids || []).filter(k => k != null) });
const text = n => (typeof n === 'string' ? n : (n.a && n.a.text ? n.a.text : '') + n.kids.map(text).join(''));
const sb = { BOTS_PARTS: [], tx: (k, p) => { if (!(k in en)) throw new Error('no string ' + k); return en[k].split('{game}').join(p && p.game != null ? p.game : '{game}'); }, h: mk };
vm.createContext(sb); vm.runInContext(P.script, sb);
ok(sb.BOTS_PARTS.length === 1 && sb.BOTS_PARTS[0].id === 'limits' && sb.BOTS_PARTS[0].group === 'F' && sb.BOTS_PARTS[0].order === P.order, 'client pushes one part with the same id, group and order');
const kit = { section: (id, t, kids) => mk('div', { blk: id, box: 'col' }, [mk('h3', { text: t })].concat(kids)), leaf: (id, kids) => mk('div', { blk: id }, kids), hint: (id, t) => mk('div', { blk: id }, [mk('div', { text: t })]) };
const out = sb.BOTS_PARTS[0].draw({ mod: '', gid: 'as64', kit, api() {}, reload() {} }), all = text({ a: {}, kids: out });
ok(Array.isArray(out) && out.length === 1 && out[0].a.blk === 'bots.limits', 'draw gives the card bots.limits');
for (const [k, ids] of P.LINES) ok(all.includes(en['bots.limits.' + k].replace('{game}', 'Gates of Hell') + ' (' + ids + ')'), 'line ' + k + ' with its IDs ' + ids);
// S2: the IDs sit under Details, never in the main list; with the frame's kit.details, and without it (a native details)
const find = (n, id) => (n && n.a && n.a.blk === id ? n : (n && n.kids || []).map(c => find(c, id)).find(Boolean));
ok(!/\(([A-Z]+-\d+)/.test(text(find(out[0], 'bots.limits.list'))), 'the main list has no IDs');
// round 4: no file names or script words in the main list (they sit under Details); one game name, from kit.game when the frame has it
const mainTxt = text(find(out[0], 'bots.limits.list')), detTxt = text(find(out[0], 'bots.limits.det'));
ok(!/\.lua|listen|handler|\{game\}/i.test(mainTxt) && /bot\.data\.lua/.test(detTxt) && /one handler/.test(detTxt), 'file names and script words only under Details');
const outG = sb.BOTS_PARTS[0].draw({ mod: '', gid: 'as64', kit: Object.assign({}, kit, { game: g => 'GAME-' + g }), api() {}, reload() {} });
ok(/In GAME-goh the bots/.test(text(find(outG[0], 'bots.limits.list'))), 'the game name comes from kit.game');
ok(/AI-13/.test(text(find(out[0], 'bots.limits.det'))), 'the IDs are in the Details block');
const kit2 = Object.assign({}, kit, { details: (id, kids) => mk('details', { blk: id, box: 'col' }, [mk('summary', { text: 'Details' })].concat(kids)) });
const out2 = sb.BOTS_PARTS[0].draw({ mod: '', gid: 'as64', kit: kit2, api() {}, reload() {} });
ok(find(out2[0], 'bots.limits.det').tag === 'details' && /AI-13/.test(text(find(out2[0], 'bots.limits.det'))), 'kit.details holds the IDs when the frame has it');
ok(sb.BOTS_PARTS[0].title() === en['bots.limits.title'], 'title');
// every ID is a real row
const ROOT = path.join(__dirname, '..', '..', '..', '..', '..', '..');
const rows = d => fs.readdirSync(path.join(ROOT, d), { recursive: true }).filter(f => /\.md$/.test(f)).map(f => fs.readFileSync(path.join(ROOT, d, f), 'utf8')).join('\n');
// a copy without the note folders skips this check
const HAVE = d => fs.existsSync(path.join(ROOT, d));
const L = HAVE('limits') ? rows('limits') : null, GH = HAVE('gohweb') ? rows('gohweb') : null;
for (const id of [].concat(...P.LINES.map(l => l[1].split(', ')))) if ((/^GH/.test(id) ? GH : L) !== null) ok(new RegExp('(^|\\n)\\|? ?' + id + ' \\|').test(/^GH/.test(id) ? GH : L), 'ID ' + id + ' is a row of ' + (/^GH/.test(id) ? 'gohweb' : 'limits'));
console.log(bad ? bad + ' failures' : 'bots part limits PASS');
process.exit(bad ? 1 : 0);
