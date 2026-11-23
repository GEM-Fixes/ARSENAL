// gemindex: page text the way the GEM External Index toolkit reads it (port of work/scrape.cs PageText, lines 47-560).
// HTML to a light tree (no script ever runs), noise marking, the generic block extractor, per-site rules, Markdown to text,
// charset decoding (BOM, header, meta, UTF-8 validity, the row's language), the verdict judge and "next page" finding.
// Offline and pure: bytes in, text out. Same rules and thresholds as the original so results.json from either tool agree.
// Author: Imperator_Aug (ARSENAL, ia-8c415169)
'use strict';

const words = s => new Set(s.split(' '));
const VOID = words('area base br col embed hr img input link meta param source track wbr');
const RAW = words('script style textarea noscript iframe noembed noframes template xmp');
const CLOSES_P = words('address article aside blockquote center div dl fieldset footer form h1 h2 h3 h4 h5 h6 header hr main nav ol p pre section table ul');
const IMPLIED = { li: ['li'], dt: ['dt', 'dd'], dd: ['dt', 'dd'], tr: ['tr', 'td', 'th'], td: ['td', 'th'], th: ['td', 'th'], option: ['option'] };
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '(c)', reg: '(r)', trade: '(tm)', hellip: '...', mdash: '-', ndash: '-', laquo: '"', raquo: '"', ldquo: '"', rdquo: '"', lsquo: "'", rsquo: "'", bull: '*', middot: '*', times: 'x', deg: 'deg', euro: 'EUR', shy: '' };
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function unent(s) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x?[0-9a-f]+|\w+);?/gi, (m, e) => {
    if (e[0] === '#') {
      const hex = e.length > 1 && (e[1] === 'x' || e[1] === 'X');
      const digits = e.slice(hex ? 2 : 1).replace(/^0+/, '');
      if (!digits.length || digits.length > 7) return '';
      if (!hex && !/^\d+$/.test(digits)) return m;
      const c = parseInt(digits, hex ? 16 : 10);
      if (!(c > 0 && c < 0x110000)) return '';
      return c >= 0xD800 && c <= 0xDFFF ? ' ' : String.fromCodePoint(c);
    }
    return own(ENT, e) ? ENT[e] : own(ENT, e.toLowerCase()) ? ENT[e.toLowerCase()] : m;
  });
}
const isWs = c => /[\s﻿]/.test(c);
const squeeze = s => s.replace(/[\s﻿]+/g, ' ');
const ATTR = /([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
function closeOf(s, from, tag) {
  const limit = Math.min(s.length, from + 2000000), open = '</' + tag;
  let at = from;
  while (at < limit) {
    at = indexOfCi(s, open, at, limit);
    if (at < 0) break;
    let j = at + open.length;
    while (j < limit && isWs(s[j])) j++;
    if (j < limit && s[j] === '>') return [at, j + 1];
    at += open.length;
  }
  return [-1, -1];
}
function indexOfCi(s, needle, from, limit) {
  const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'ig'); re.lastIndex = from;
  const m = re.exec(s); return m && m.index + needle.length <= limit ? m.index : -1;
}
const tagChar = c => /[a-zA-Z0-9:-]/.test(c);
const node = (tag, a, parent) => ({ tag, a: a || {}, kids: [], parent: parent || null, tlen: 0, llen: 0, noise: false });
const attr = (n, k) => own(n.a, k) ? n.a[k] : '';

// parse(html) -> {root, info:{title, description, relNext, scripts, password, links[]}}
function parse(s) {
  const info = { title: '', description: '', relNext: '', scripts: 0, password: false, links: [] };
  const root = node('#root');
  let cur = root, depth = 0, i = 0;
  const n = s.length;
  const text = t => { if (t.length) cur.kids.push(unent(t)); };
  const pop = () => { cur = cur.parent; depth--; };
  while (i < n) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { text(s.slice(i)); break; }
    if (lt > i) text(s.slice(i, lt));
    if (s.startsWith('<!--', lt)) { const e = s.indexOf('-->', lt + 4); i = e < 0 ? n : e + 3; continue; }
    const c = lt + 1 < n ? s[lt + 1] : '\0';
    if (c === '!' || c === '?') { const e = s.indexOf('>', lt); i = e < 0 ? n : e + 1; continue; }
    const closing = c === '/';
    let j = lt + (closing ? 2 : 1); const nameStart = j;
    while (j < n && tagChar(s[j])) j++;
    if (j === nameStart) { text('<'); i = lt + 1; continue; }
    const tag = s.slice(nameStart, j).toLowerCase();
    let q = '', k = j; const limit = Math.min(n, j + 65536);
    for (; k < limit; k++) { const ch = s[k]; if (q) { if (ch === q) q = ''; } else if (ch === '"' || ch === "'") q = ch; else if (ch === '>') break; }
    if (k >= limit) { i = j; continue; }
    const attrSrc = s.slice(j, k);
    i = k + 1;
    if (closing) {
      let p = cur, up = 0;
      while (p && p.tag !== tag && up < 64) { p = p.parent; up++; }
      if (p && p.tag === tag) { while (cur !== p) pop(); pop(); }
      continue;
    }
    const a = {};
    if (attrSrc.length > 1) { ATTR.lastIndex = 0; let m; while ((m = ATTR.exec(attrSrc))) { if (!m[0]) { ATTR.lastIndex++; continue; } a[m[1].toLowerCase()] = unent(m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : (m[4] || '')); } }
    const el = node(tag, a, cur);
    if (tag === 'meta') {
      const nm = (attr(el, 'name') || attr(el, 'property')).toLowerCase();
      if ((nm === 'description' || nm === 'og:description') && !info.description) info.description = attr(el, 'content');
    } else if (tag === 'link' && /\bnext\b/i.test(attr(el, 'rel'))) info.relNext = attr(el, 'href');
    else if (tag === 'input' && attr(el, 'type').toLowerCase() === 'password') info.password = true;
    if (RAW.has(tag) || tag === 'title') {
      const [end, after] = closeOf(s, i, tag), stop = end >= 0 ? end : n;
      if (tag === 'title' && !info.title) info.title = squeeze(unent(s.slice(i, stop))).trim();
      if (tag === 'script') info.scripts++;
      i = end >= 0 ? after : n;
      continue;
    }
    if ((tag === 'p' || CLOSES_P.has(tag)) && cur.tag === 'p') pop();
    if (IMPLIED[tag] && IMPLIED[tag].includes(cur.tag)) pop();
    else if (tag === 'tr' && (cur.tag === 'td' || cur.tag === 'th')) { pop(); if (cur.tag === 'tr') pop(); }
    el.parent = cur;
    cur.kids.push(el);
    if (!VOID.has(tag) && s[k - 1] !== '/' && depth < 300) { cur = el; depth++; }
  }
  measure(root); markNoise(root, root.tlen); measure(root); collectLinks(root, info);
  return { root, info };
}
function measure(nd) {
  let t = 0, l = 0;
  for (const k of nd.kids) {
    if (typeof k === 'string') { const len = k.trim().length; t += len; if (nd.tag === 'a') l += len; continue; }
    if (k.noise) continue;
    measure(k); t += k.tlen; l += nd.tag === 'a' ? k.tlen : k.llen;
  }
  nd.tlen = t; nd.llen = l;
}
const DROP = words('nav aside footer svg math select button object embed canvas map area');
const NOISE = /(^|[-_\s])(nav|navbar|navi|navigation|menu|menus|sidebar|sidebox|side-bar|breadcrumbs?|crumbs|footer|cookies?|consent|gdpr|share|sharing|social|sociallinks|advert|adverts|advertisement|ads?|adsense|banner|promo|related|recommended|pagination|pager|pagenav|signature|sig|widget|widgets|toolbar|login|signup|register|tagcloud|userinfo|postprofile|poster-info|usersidebar|modal|popup|tooltip|hidden|rating|likes|reactions)($|[-_\s])/i;
const HIDDEN_STYLE = /display\s*:\s*none|visibility\s*:\s*hidden/i, NOISE_ROLE = /^(navigation|banner|contentinfo|complementary|search)$/i;
function markNoise(nd, total) {
  for (const k of nd.kids) {
    if (typeof k === 'string') continue;
    let noisy = DROP.has(k.tag) || own(k.a, 'hidden') || attr(k, 'aria-hidden') === 'true' || HIDDEN_STYLE.test(attr(k, 'style')) || NOISE_ROLE.test(attr(k, 'role'));
    if (!noisy && k.tag !== 'body' && k.tag !== 'html' && NOISE.test(attr(k, 'class') + ' ' + attr(k, 'id'))) noisy = k.tlen < total * 0.3 || k.llen > k.tlen * 0.5;
    if (noisy) k.noise = true; else markNoise(k, total);
  }
}
function innerText(nd) { let o = ''; for (const k of nd.kids) o += typeof k === 'string' ? k : innerText(k); return o; }
function collectLinks(nd, info) {
  for (const k of nd.kids) {
    if (typeof k === 'string') continue;
    if (k.tag === 'a' && attr(k, 'href')) {
      if (/\bnext\b/i.test(attr(k, 'rel')) && !info.relNext) info.relNext = attr(k, 'href');
      const t = innerText(k).trim();
      info.links.push({ href: attr(k, 'href'), text: t.slice(0, 40), cls: attr(k, 'class') + ' ' + attr(k, 'id') + ' ' + attr(k, 'title') });
    }
    collectLinks(k, info);
  }
}

// ---- rendering and the generic extractor: blocks by length and link density
const BLOCK = words('address article aside blockquote body center dd details dir div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr html li main menu nav ol p pre section summary table tbody td tfoot th thead tr ul');
const HEAD = words('h1 h2 h3 h4 h5 h6');
function weight(t) { let cjk = 0; for (const ch of t) { const c = ch.charCodeAt(0); if ((c >= 0x3040 && c <= 0x30FF) || (c >= 0x3400 && c <= 0x9FFF) || (c >= 0xAC00 && c <= 0xD7AF)) cjk++; } return t.length + cjk * 1.5; }
const collapse = t => t.replace(/[ \t\f\r 　]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{2,}/g, '\n').trim();
function segments(root) {
  const segs = []; let buf = '', link = 0;
  const flush = tag => { const t = collapse(buf); if (t.length) segs.push({ t, link, tag }); buf = ''; link = 0; };
  const walk = (nd, inA, tag) => {
    for (const k of nd.kids) {
      if (typeof k === 'string') { const s = nd.tag === 'pre' ? k : squeeze(k); buf += s; if (inA) link += s.trim().length; continue; }
      if (k.noise) continue;
      if (k.tag === 'br') { buf += '\n'; continue; }
      const cell = (k.tag === 'td' || k.tag === 'th') && k.tlen < 120, block = BLOCK.has(k.tag) && !cell;
      if (block) flush(tag);
      walk(k, inA || k.tag === 'a', block ? k.tag : tag);
      if (block) flush(k.tag); else if (cell) buf += ' | ';
    }
  };
  walk(root, false, 'div');   // no final flush: scrape.cs Segments() drops trailing inline text too
  return segs;
}
function near(segs, i, d) { for (let j = i + d, n = 0; j >= 0 && j < segs.length && n < 3; j += d, n++) { if (segs[j].c === 'good') return true; if (segs[j].c === 'bad') return false; } return false; }
function classify(segs) {
  for (const s of segs) { const w = weight(s.t), ld = s.link / Math.max(1, s.t.length); s.c = ld > 0.5 || (ld > 0.33 && w < 200) ? 'bad' : w >= 70 ? 'good' : w >= 25 ? 'near' : 'short'; }
  for (let i = 0; i < segs.length; i++) if (segs[i].c === 'near' && near(segs, i, -1)) segs[i].c = 'good';
  for (let i = segs.length - 1; i >= 0; i--) if (segs[i].c === 'near' && near(segs, i, 1)) segs[i].c = 'good';
  return segs.filter((s, i) => s.c === 'good' || (s.c === 'short' && ((HEAD.has(s.tag) && near(segs, i, 1)) || (near(segs, i, 1) && near(segs, i, -1)))));
}
function generic(root) {
  const segs = segments(root), kept = classify(segs);
  const all = segs.reduce((a, s) => a + s.t.length, 0), allLink = segs.reduce((a, s) => a + s.link, 0);
  return { text: kept.map(s => s.t).join('\n'), keptLink: kept.reduce((a, s) => a + s.link, 0), allChars: all, allLinkShare: allLink / Math.max(1, all) };
}
const render = nodes => nodes.map(n => segments({ tag: 'x', a: {}, kids: [n], noise: false }).map(s => s.t).join('\n')).join('\n').trim();
function select(nd, tag, parts, o) {
  for (const k of nd.kids) {
    if (typeof k === 'string' || k.noise) continue;
    const cl = ' ' + attr(k, 'class') + ' ';
    if ((!tag || k.tag === tag) && parts.every(p => p[0] === '#' ? attr(k, 'id') === p.slice(1) : cl.includes(' ' + p.slice(1) + ' '))) o.push(k);
    else select(k, tag, parts, o);
  }
}
function selectAll(root, sel) { const m = /^([a-z0-9]*)((?:[.#][\w-]+)*)$/i.exec(sel) || ['', '', '']; const o = []; select(root, m[1].toLowerCase(), m[2].match(/[.#][\w-]+/g) || [], o); return o; }
const RULES = { 'steamcommunity.com': ['.guideTopDescription+.guide.subSections', '.workshopItemDescription'], 'mow-portal.com': ['main.col-main'] };
function byRule(root, host) {
  const alts = RULES[host]; if (!alts) return null;
  for (const alt of alts) { const t = alt.split('+').map(sel => render(selectAll(root, sel))).filter(x => x.length).join('\n'); if (t.length >= 20) return { text: t, rule: alt }; }
  return null;
}
function mdToText(md) {
  md = md.replace(/\r/g, '').replace(/^---\n[\s\S]*?\n---\n/, '').replace(/\{%[^%]*%\}/g, ' ').replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^#{1,6}\s*/gm, '').replace(/^[-*_]{3,}$/gm, '')
    .replace(/[`*_~]{1,3}/g, '').replace(/[ \t]+/g, ' ');
  return md.replace(/\n{3,}/g, '\n\n').trim();
}

// ---- decoding
const ALIAS = { gb2312: 'gb18030', gbk: 'gb18030', 'x-gbk': 'gb18030', cp936: 'gb18030', 'x-cp1251': 'windows-1251', cp1251: 'windows-1251', 'win-1251': 'windows-1251', utf8: 'utf-8', 'shift-jis': 'shift_jis', sjis: 'shift_jis', 'x-sjis': 'shift_jis', 'iso-8859-1': 'windows-1252', latin1: 'windows-1252' };
const BY_LANG = { ru: ['windows-1251', 'koi8-r'], zh: ['gb18030', 'big5'], ja: ['shift_jis', 'euc-jp'], pl: ['iso-8859-2', 'windows-1250'], de: ['windows-1252'], es: ['windows-1252'], en: ['windows-1252'] };
const cyr = c => (c >= 0x400 && c <= 0x52F) || (c >= 0x1C80 && c <= 0x1C8F) || (c >= 0x2DE0 && c <= 0x2DFF) || (c >= 0xA640 && c <= 0xA69F);
const han = c => (c >= 0x2E80 && c <= 0x2FDF) || c === 0x3005 || c === 0x3007 || (c >= 0x3021 && c <= 0x3029) || (c >= 0x3038 && c <= 0x303B) || (c >= 0x3400 && c <= 0x4DBF) || (c >= 0x4E00 && c <= 0x9FFF) || (c >= 0xF900 && c <= 0xFAFF) || (c >= 0xD840 && c <= 0xD87F);
const kana = c => (c >= 0x3041 && c <= 0x30FF) || (c >= 0x31F0 && c <= 0x31FF) || (c >= 0xFF66 && c <= 0xFF9D);
function share(lang, t) { const f = lang === 'ru' ? cyr : lang === 'zh' ? han : c => han(c) || kana(c); let n = 0; for (let i = 0; i < t.length; i++) if (f(t.charCodeAt(i))) n++; return n / Math.max(1, t.length); }
function tryDecode(buf, cs) {
  const name = ALIAS[cs] || cs;
  let t; try { t = new TextDecoder(name).decode(buf); } catch (e) { return null; }
  let bad = 0; for (let i = 0; i < t.length; i++) if (t.charCodeAt(i) === 0xFFFD) bad++;
  return { t, cs: name, bad: bad / Math.max(1, t.length) };
}
// decode(buf, ctype, lang) -> {text, cs, from, declared, bad}
function decode(buf, ctype, lang) {
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return { text: buf.toString('utf8', 3), cs: 'utf-8', from: 'bom', declared: '', bad: 0 };
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return { text: buf.toString('utf16le', 2), cs: 'utf-16le', from: 'bom', declared: '', bad: 0 };
  let declared = '', from = 'none';
  const inHeader = /charset=["']?([\w-]+)/i.exec(ctype || '');
  if (inHeader) { declared = inHeader[1].toLowerCase(); from = 'header'; }
  else {
    const head = buf.toString('latin1', 0, Math.min(4096, buf.length));
    const meta = /<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i.exec(head) || /<\?xml[^>]+encoding=["']([\w-]+)/i.exec(head);
    if (meta) { declared = meta[1].toLowerCase(); from = 'meta'; }
  }
  // valid UTF-8 is UTF-8 whatever the page declares; a character cut by the body cap is forgiven (stream mode, no flush)
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf, { stream: true }), cs: 'utf-8', from, declared, bad: 0 }; } catch (e) { /* not UTF-8 */ }
  const ownCs = BY_LANG[lang || ''];
  const order = [].concat(declared ? [declared] : [], ['utf-8'], ownCs || ['windows-1252']);
  let best = null;
  for (const cs of order) {
    const r = tryDecode(buf, cs); if (!r) continue;
    if (!best || r.bad < best.bad) best = r;
    if (r.bad < 0.001 && (cs === declared ? declared !== 'utf-8' || r.bad === 0 : true)) { best = r; break; }
  }
  if (!best) best = { t: buf.toString('latin1'), cs: 'latin1', bad: 0 };
  if ((lang === 'ru' || lang === 'zh' || lang === 'ja') && (best.cs === 'windows-1250' || best.cs === 'windows-1252')) {
    for (const cs of ownCs || []) { const r = tryDecode(buf, cs); if (r && r.bad < 0.01 && share(lang, r.t) > share(lang, best.t) + 0.05) best = r; }
  }
  return { text: best.t, cs: best.cs, from, declared, bad: best.bad };
}

// ---- judging
const BOT = /just a moment|checking your browser|attention required|verify you are human|ddos-guard|are you human|安全验证|百度安全|please complete the security check|cf-browser-verification|\/cdn-cgi\/challenge|cf_chl_/i;
const COOKIE_SCRIPT = /document\.cookie[\s\S]{0,200}location/i, CAPTCHA = /g-recaptcha|h-captcha|hcaptcha\.com|captcha/i;
const PARKED = /domain (name )?(is |may be )?for sale|buy this domain|this domain (is|has been)|parkingcrew|sedoparking|sedo\.com|hugedomains|bodis\.com|dan\.com\/|domain parking|afternic|godaddy\.com\/domainsearch|продается домен|домен продается/i;
const SOFT404 = /\b404\b|not found|page (doesn't|does not) exist|no longer (available|exists)|has been (removed|deleted)|there was a problem accessing|страница не найдена|не найден[ао]?|удален[ао]|страницы не существует|error 404|页面不存在|页面没有找到|您访问的页面|贴子已被删除|该帖已被删除|抱歉.*不存在|ページが見つかりません|存在しません|nicht gefunden|no (se ha )?encontrad|nie znaleziono|нет такой|тема не найдена|запрашиваемая.*не найдена/i;
const LOGIN = /^(sign in|log ?in|login|вход|авторизация|войти|登录|ログイン|anmelden|iniciar sesión)\b|please (log ?in|sign in)|you must be logged in|you need to (log ?in|be logged)|необходимо (войти|авторизоваться)|только для зарегистрированных|请先登录|需要登录/i;
const COOKIE = /cookie|consent|gdpr|privacy (policy|settings)|согласи/i, AGREE = /accept|agree|i consent|принять|同意/i;
const cjkWord = w => [...w].some(c => c >= '぀' && c <= '鿿');
function titleWords(t) {
  const o = [];
  for (const w of String(t || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []) {
    if (w.length < 3 && !cjkWord(w)) continue;
    if (cjkWord(w) && w.length > 2) for (let i = 0; i + 2 <= w.length; i++) o.push(w.slice(i, i + 2)); else o.push(w);
  }
  return [...new Set(o)];
}
function overlap(title, hay) { const w = titleWords(title); if (!w.length) return 1; const low = String(hay).toLowerCase(); return w.filter(x => low.includes(x)).length / w.length; }
// judge(page, reasons[]) -> verdict string (ok, botwall, robots, dead, http500, thin, login, ...)
function judge(x, reasons) {
  const text = x.text || '', title = x.title || '', raw = String(x.raw || '').slice(0, 200000), head = (title + '\n' + text.slice(0, 600)).toLowerCase();
  const len = text.length, offTopic = x.overlap < 0.5;
  if (BOT.test(title) || (raw.length < 3000 && (BOT.test(raw) || COOKIE_SCRIPT.test(raw)))) return 'botwall';
  if (x.blocked) return x.blocked;
  if (x.netError) { reasons.push(x.netError); return 'neterr'; }
  if (x.status && x.status !== 200) return x.status === 404 || x.status === 410 ? 'dead' : 'http' + x.status;
  if (x.binary) return 'meta-only';
  if (x.moved && offTopic) { reasons.push(x.moved); return 'moved'; }
  if (offTopic && len < 400 && CAPTCHA.test(raw)) return 'captcha';
  if (offTopic && len < 1200 && PARKED.test(title + ' ' + raw.slice(0, 50000))) return 'parked';
  if (offTopic && len < 1000 && (x.password || LOGIN.test(title) || LOGIN.test(text.slice(0, 400)))) return 'login';
  if (offTopic && len < 800 && COOKIE.test(head) && AGREE.test(head)) return 'cookiewall';
  if (offTopic && len < 800 && SOFT404.test(head)) return 'soft404';
  if (len < 200 && x.scripts >= 3 && x.isHtml) return x.description ? 'meta-only' : 'jsshell';
  if (len < 200) return 'thin';
  if (x.allLinkShare > 0.75 && len < 1500) reasons.push('page mostly links');
  if (x.meanLine > 0 && x.meanLine < 22 && x.lines > 25) reasons.push('short lines');
  if (x.keptLinkShare > 0.25) reasons.push('links in kept text');
  if (reasons.length >= 2 || (x.allLinkShare > 0.85 && len < 1000)) return 'navonly';
  if (x.overlap < 0.2) reasons.push('row title barely appears');
  return 'ok';
}
// page text is data: no control, zero-width or direction characters reach the index
const U = c => String.fromCharCode(92) + 'u' + c.toString(16).padStart(4, '0');   // escapes built at run time, so no raw line separator sits in the source
const UNWANTED = new RegExp('[' + [[0x0, 0x8], [0xb, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff], [0xfdd0, 0xfdef], [0xfffe, 0xffff]].map(([a, b]) => U(a) + '-' + U(b)).join('') + ']|[' + U(0xd800) + '-' + U(0xdbff) + '](?![' + U(0xdc00) + '-' + U(0xdfff) + '])|(?<![' + U(0xd800) + '-' + U(0xdbff) + '])[' + U(0xdc00) + '-' + U(0xdfff) + ']', 'g');
const clean = t => String(t).replace(UNWANTED, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
// one page to a verdict, for choosing an archived copy
function judgeOne(buf, ctype, lang, rowTitle, host) {
  const d = decode(buf, ctype, lang), { root, info } = parse(d.text), g = generic(root), r = byRule(root, host);
  const text = (r ? r.text : g.text).trim(), lines = text.length ? text.split('\n').length : 0;
  return judge({ status: 200, title: info.title, text, raw: d.text, scripts: info.scripts, password: info.password, description: info.description, isHtml: true,
    allLinkShare: g.allLinkShare, keptLinkShare: text.length ? g.keptLink / text.length : 0, meanLine: lines ? text.length / lines : 0, lines, overlap: overlap(rowTitle, text) }, []);
}

// ---- pagination
const NEXT_TEXT = /^(next|next page|next ?[›»>]+|[›»>]{1,2}|следующая|следующая страница|след\.?|далее|вперед|вперёд|下一页|下一頁|下页|次へ|次のページ|weiter|nächste|nächste seite|siguiente|następna)$/i;
const NEXT_CLASS = /(^|[-_\s])(next|nxt)($|[-_\s])/i;
const skeleton = p => p.replace(/\d+/g, '#');
const queryOf = u => u.search.replace(/^\?/, '').split('&').filter(Boolean).map(p => { const e = p.indexOf('='); return e < 0 ? [p, ''] : [p.slice(0, e), p.slice(e + 1)]; });
function samePages(t, b) {
  if (t.hostname !== b.hostname) return false;
  const same = t.pathname === b.pathname;
  if (!same && skeleton(t.pathname) !== skeleton(b.pathname) && !t.pathname.startsWith(b.pathname.replace(/(\.html?|\/)$/, ''))) return false;
  if (same && t.search === b.search) return false;
  const tq = queryOf(t);
  for (const [k, v] of queryOf(b)) { if (/^(page|p|pn|start|st|offset)$/i.test(k)) continue; const m = tq.find(x => x[0] === k); if (!m || m[1] !== v) return false; }
  return true;
}
function findNext(info, baseUrl) {
  let b; try { b = new URL(baseUrl); } catch (e) { return null; }
  const abs = h => { try { const u = new URL(h, b); return u.protocol === 'http:' || u.protocol === 'https:' ? u : null; } catch (e) { return null; } };
  if (info.relNext) { const u = abs(info.relNext); if (u && u.href !== b.href) return u.href; }
  for (const a of info.links) { if (!NEXT_TEXT.test(a.text) && !NEXT_CLASS.test(a.cls)) continue; const u = abs(a.href); if (u && samePages(u, b)) return u.href; }
  const m = /[?&](?:page|pn)=(\d+)/.exec(b.search) || /-(\d+)-1\.html$/.exec(b.pathname) || /\/page-?(\d+)\/?$/.exec(b.pathname) || /-(\d+)$/.exec(b.pathname);
  let cur = m ? Number(m[1]) : 1; if (!cur) cur = 1;
  const want = String(cur + 1);
  for (const a of info.links) { if (a.text !== want) continue; const u = abs(a.href); if (u && samePages(u, b) && u.href !== b.href) return u.href; }
  return null;
}

module.exports = { parse, generic, byRule, mdToText, decode, judge, judgeOne, overlap, clean, findNext, unent, RULES };
