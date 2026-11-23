// recipe "what is possible" (explore): a question in words; the known limits rows (limits/*.md) and the guide pages (guide/*.md) that
// match it, in plain words with the limits ID; the glossary words of the question. Reads only: nothing is ever written.
// Own route GET /api/x/task/r/x-limits/find?q=&what=limits|guide&game= ranks rows (game goh: the GoH rows of too) by how many of the words they hold (the docs search
// needs every word on one line, so a question in words finds nothing there). Contract: ../README.md.
// Author: Imperator_Aug (ARSENAL, ia-ed89c1a2)
'use strict';
const fs = require('fs'), path = require('path');

// folders that hold limits/ and guide/: AS2_HELP_ROOT (tests), the source tree, a docs edition next to the exe (same order as help)
function roots() {
  if (process.env.AS2_HELP_ROOT) return [path.resolve(process.env.AS2_HELP_ROOT)];
  const r = [path.resolve(__dirname, '..', '..', '..', '..', '..')];
  let exe = ''; try { exe = path.dirname(process.execPath); } catch (e) { /* none */ }
  for (const b of [exe, process.cwd()]) if (b) r.push(path.join(b, 'docs', 'internal'), path.join(b, 'docs', 'public'), path.join(b, 'docs'));
  if (exe) r.push(exe);
  return [...new Set(r)];
}
function findDir(name) {
  for (const b of roots()) { const d = path.join(b, name); try { if (fs.statSync(d).isDirectory()) return d; } catch (e) { /* next */ } }
  return null;
}
const STOP = new Set(('a an the and or of to in on at by for with from is are be can could do does did how what which who why when where it its '
  + 'this that these those my me i we you your there their than then into as if not no yes any all some more most one two make made use used '
  + 'using get set have has had will would should may might want need way ways game games mod mods').split(' '));
// the question in words -> lower case words (letters and digits, any script), stop words and one-letter words dropped
function wordsOf(q) {
  return [...new Set(String(q || '').toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter(w => w && (w.length > 1 || /\p{N}/u.test(w)) && !STOP.has(w)))].slice(0, 12);
}
// the notes are in English: a word in ru, uk or zh that a glossary term names (guide/i18n glossary, "Ammo type (тип боеприпаса)")
// adds that term's English words. Russian and Ukrainian words change their endings, so a glossary word matches by its stem (all but
// its last two letters, at least four); Chinese has no spaces, so a glossary word inside the question matches.
let GMAP = null;
function glossMap() {
  if (GMAP) return GMAP;
  GMAP = [];
  let d = {};
  try { const g = require('../../help/glossary-data'); d = g.default || g.data || g; } catch (e) { d = {}; }
  // everyday words a player asks with that the glossary (modding terms) does not hold: [English words, ru, uk, zh words]
  for (const r of [['sound', 'звук', 'звук', '声音'], ['tank vehicle', 'танк', 'танк', '坦克'], ['armor armour', 'броня', 'броня', '装甲'],
    ['gun weapon', 'пушка, орудие, оружие', 'гармата, зброя', '炮, 武器'], ['map', 'карта', 'мапа', '地图'], ['unit', 'юнит', 'юніт', '单位'],
    ['soldier infantry', 'солдат, пехота', 'солдат, піхота', '士兵, 步兵'], ['crash', 'вылет, падение', 'виліт, падіння', '崩溃, 闪退'],
    ['texture', 'текстура', 'текстура', '纹理'], ['model', 'модель', 'модель', '模型'], ['icon', 'иконка, значок', 'іконка, значок', '图标'],
    ['shell ammo', 'снаряд, патрон', 'снаряд, набій', '炮弹, 弹药'], ['mission', 'миссия', 'місія', '任务'], ['price cost', 'цена, стоимость', 'ціна, вартість', '价格'],
    ['speed', 'скорость', 'швидкість', '速度'], ['crew', 'экипаж', 'екіпаж', '乘员'], ['silent', 'тихо, неслышно, слышен', 'тихо, чути', '没声音, 无声'],
    ['font', 'шрифт', 'шрифт', '字体'], ['multiplayer', 'мультиплеер, сетевая', 'мультиплеєр, мережева', '多人']]) {
    const en = r[0].split(' ');
    for (let i = 1; i < 4; i++) GMAP.push({ loc: r[i].split(/,\s*/), en });
  }
  for (const c of ['ru', 'uk', 'zh']) for (const e of d[c] || []) {
    const m = /^(.*?)\s*[(（]([^)）]*)[)）]/.exec(String(e.t || ''));
    if (!m) continue;
    const en = wordsOf(m[1]), loc = m[2].toLowerCase().split(/[,，、;]+/).map(s => s.trim()).filter(Boolean);
    if (en.length && loc.length) GMAP.push({ loc, en });
  }
  return GMAP;
}
const CJK = /[㐀-鿿]/;
function stemHit(w, l) {
  if (CJK.test(w) || CJK.test(l)) return w.includes(l) || l.includes(w);
  return l.split(/\s+/).some(t => { if (t.length < 3) return false; const st = t.slice(0, Math.max(4, t.length - 2)); return w === t || (st.length <= w.length && w.startsWith(st)); });
}
function english(words) {
  const add = [];
  for (const w of words) if (/[^\x00-\x7f]/.test(w)) for (const g of glossMap()) if (g.loc.some(l => stemHit(w, l))) add.push(...g.en);
  return add.length ? [...new Set(words.concat(add))].slice(0, 16) : words;
}
// a word matches a text word that starts with it (gun -> guns), or the text holds it (non Latin scripts have no spaces)
function hits(words, text) {
  const t = String(text || '').toLowerCase(), out = [];
  for (const w of words) if (new RegExp('(^|[^\\p{L}\\p{N}_])' + w.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&'), 'u').test(t) || (/[^\x00-\x7f]/.test(w) && t.includes(w))) out.push(w);
  return out;
}
const clean = s => String(s || '').replace(/`/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
const TAG = { V: 'checked', I: 'worked', T: 'test' };

// limits/ (every game), for Gates of Hell, (the GoH rows GH<AREA>-NN, same row form;. The docs
// edition ships limits/ and guide/ but not (tools/docgen INT_DIRS): there a GoH question finds the limits rows only and says so.
const LCACHE = new Map();
function limitRows(sub) {
  sub = sub || 'limits';
  const dir = findDir(sub);
  if (!dir) return { dir: null, rows: [] };
  const hit = LCACHE.get(sub);
  if (hit && hit.dir === dir) return hit;
  const rows = [], goh = sub !== 'limits';
  for (const f of fs.readdirSync(dir).filter(n => /^[A-Z][A-Z0-9]*\.md$/.test(n)).sort()) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/);
    lines.forEach((ln, i) => {
      const c = ln.split('|').map(s => s.trim());
      if (c.length < 4 || !/^[A-Z][A-Z0-9]*-\d+[a-z]?$/.test(c[0])) return;
      const tr = /\[([VIT])\]/.exec(c[4] || '');
      const r = { id: c[0], area: c[0].split('-')[0], subject: clean(c[1]), limit: clean(c[2]), effect: clean(c[3]), tag: tr ? TAG[tr[1]] : '',
        checker: /\bchk\b/.test(c.slice(5).join(' ')), file: sub + '/' + f, line: i + 1 };
      if (goh) r.goh = true;
      rows.push(r);
    });
  }
  const e = { dir, rows };
  LCACHE.set(sub, e);
  return e;
}
let GCACHE = null;
function guideSecs() {
  const dir = findDir('guide');
  if (!dir) return { dir: null, secs: [] };
  if (GCACHE && GCACHE.dir === dir) return GCACHE;
  const secs = [];
  for (const f of fs.readdirSync(dir).filter(n => /^(\d\d|p\d\d|r\d\d)-[a-z0-9-]+\.md$/.test(n)).sort()) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/);
    let title = '', cur = null, fence = false;
    lines.forEach((l, i) => {
      if (/^\s*(```|~~~)/.test(l)) { fence = !fence; return; }
      if (!fence && /^# /.test(l) && !title) { title = clean(l.slice(2)); return; }
      if (!fence && /^##+ /.test(l)) { cur = { p: 'guide/' + f, title, h: clean(l.replace(/^#+ /, '')), line: i + 1, text: [] }; secs.push(cur); return; }
      if (!cur) { cur = { p: 'guide/' + f, title, h: '', line: 1, text: [] }; secs.push(cur); }
      if (!fence) cur.text.push(clean(l.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')));
    });
    for (const s of secs) if (!s.title) s.title = title;
  }
  GCACHE = { dir, secs };
  return GCACHE;
}

// -> {q, words, what, results, total, nofiles, game?, goh?}. game 'goh': the GoH rows are searched as well, a GoH row
// first on an equal match (it says how GoH differs); goh: true when they were found, false when this edition has no
function find(q, what, limit, game) {
  const words = english(wordsOf(q)), lim = Math.min(Math.max(Number(limit) || 20, 1), 60);
  const idm = /^\s*([A-Za-z][A-Za-z0-9]*)-(\d{1,4})\s*$/.exec(String(q || ''));
  if (what === 'guide') {
    const g = guideSecs();
    if (!g.dir) return { q, words, what, results: [], total: 0, nofiles: true };
    const out = [];
    if (words.length) for (const s of g.secs) {
      const inH = hits(words, s.h + ' ' + s.title), body = s.text.join('\n'), inB = hits(words, body), got = new Set(inH.concat(inB));
      if (!got.size) continue;
      const lw = words.filter(w => inB.includes(w))[0], ln = lw ? s.text.find(t => hits([lw], t).length) : '';
      out.push({ p: s.p, title: s.title, h: s.h, line: s.line, snip: String(ln || s.text.find(Boolean) || '').slice(0, 220), n: got.size, score: got.size * 10 + inH.length * 4 + Math.min(inB.length, 5) });
    }
    out.sort((a, b) => b.score - a.score || a.p.localeCompare(b.p) || a.line - b.line);
    return { q, words, what, results: out.slice(0, lim), total: out.length };
  }
  const L = limitRows(), isGoh = game === 'goh', G = isGoh ? limitRows('gohweb/limits') : null;
  if (!L.dir && !(G && G.dir)) return Object.assign({ q, words, what: 'limits', results: [], total: 0, nofiles: true }, isGoh ? { game, goh: false } : {});
  const rows = (G && G.dir ? G.rows : []).concat(L.rows);
  let out = [];
  if (idm) {
    const want = [idm[1].toUpperCase() + '-' + idm[2], idm[1].toUpperCase() + '-' + idm[2].padStart(2, '0')];
    out = rows.filter(r => want.includes(r.id)).map(r => Object.assign({ n: 1, score: 100 }, r));
  } else if (words.length) for (const r of rows) {
    const inS = hits(words, r.subject), all = new Set(hits(words, r.subject + ' ' + r.limit + ' ' + r.effect + ' ' + r.area));
    if (!all.size) continue;
    out.push(Object.assign({ n: all.size, score: all.size * 10 + inS.length * 3 }, r));
  }
  out.sort((a, b) => b.score - a.score || (b.goh ? 1 : 0) - (a.goh ? 1 : 0) || a.id.localeCompare(b.id, 'en', { numeric: true }));
  const res = { q, words, what: 'limits', results: out.slice(0, lim), total: out.length };
  if (isGoh) { res.game = game; res.goh = !!(G && G.dir); }
  return res;
}

const qp = (u, k) => (u && u.searchParams ? u.searchParams.get(k) || '' : '');
function gameOf(u, ctx) {
  const g = qp(u, 'game');
  if (g) return g;
  try { const x = ctx && ctx.gameId; return String((typeof x === 'function' ? x.call(ctx) : x) || 'as64'); } catch (e) { return 'as64'; }
}

module.exports = {
  id: 'x-limits',
  verbs: ['explore'],
  games: ['as64', 'mowas2', 'goh'],
  needs: [],
  order: 270,
  title: 'task.x-limits.t',
  census: 'explore',
  groups: [
    { id: 'ask', title: 'task.x-limits.g.ask', essential: true, q: [
      { id: 'question', kind: 'text', ask: 'task.x-limits.q.question', help: 'task.x-limits.h.question' },
    ] },
    { id: 'answer', title: 'task.x-limits.g.answer', essential: true, q: [
      { id: 'limits', kind: 'xx-limits', ask: 'task.x-limits.q.limits', help: 'task.x-limits.h.limits', covers: ['limits.search'] },
      { id: 'guides', kind: 'xx-guides', ask: 'task.x-limits.q.guides', help: 'task.x-limits.h.guides', covers: ['limits.guides'] },
      { id: 'words', kind: 'xx-words', ask: 'task.x-limits.q.words', help: 'task.x-limits.h.words', covers: ['limits.glossary'] },
    ] },
  ],
  // every explore.json key: asked here (covers), or covered by another explore recipe (named), or a named gap
  kept: [
    ['unit.find', 'covered by x-thing (the wins screen)'],
    ['unit.stats', 'covered by x-thing (the numbers screen)'],
    ['unit.compare', 'covered by x-thing (the compare screen)'],
    ['unit.price', 'covered by x-thing (the price screen)'],
    ['unit.refs', 'covered by x-thing (the used screen)'],
    ['unit.name_lookup', 'covered by x-thing (the thing screen)'],
    ['gun.armor', 'covered by x-thing (the pierce screen)'],
    ['gun.balance', 'covered by x-thing (the balance screen)'],
    ['map.list', 'covered by x-thing (the numbers screen)'],
    ['map.picture', 'covered by x-thing (the look screen)'],
    ['map.entities', 'covered by x-thing (the onmap screen)'],
    ['sound.play', 'covered by x-thing (the look screen)'],
    ['sound.weapon', 'covered by x-thing (the look screen)'],
    ['model.open', 'covered by x-thing (the look screen)'],
    ['model.owner', 'covered by x-thing (the used screen)'],
    ['picture.view', 'covered by x-thing (the look screen)'],
    ['picture.font', 'covered by x-thing (the look screen)'],
    ['mod.files', 'covered by x-mod (the changes screen)'],
    ['mod.diff', 'covered by x-mod (the changes screen)'],
    ['mod.conflicts', 'covered by x-mod (the clash screen)'],
    ['mod.search', 'covered by x-mod (the search screen)'],
    ['log.read', 'covered by x-log (the errors screen)'],
    ['log.exe_compare', 'gap: no page reads the GoH and AS64 exe side by side (q.js -g reads internal notes that are not shipped); a modder acts on the limits row of an error instead'],
  ],
  routes: {
    'GET /api/x/task/r/x-limits/find': async (u, b, ctx) => {
      // the game: ?game= (the draft's game, sent by the page), else the page's game (ctx.gameId(), gui.js); only 'goh' changes the search
      const q = qp(u, 'q').slice(0, 300), what = qp(u, 'what') === 'guide' ? 'guide' : 'limits';
      return find(q, what, qp(u, 'limit'), gameOf(u, ctx));
    },
  },
  _t: { find, wordsOf, hits, limitRows, guideSecs, roots, english, gameOf },
};
