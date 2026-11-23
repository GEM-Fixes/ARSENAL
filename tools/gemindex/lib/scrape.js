// gemindex: the toolkit's web scraper, ported from work/scrape.cs (Scraper class, lines 562-1440). Uses the network ONLY when the user runs
// `gemindex scrape` / `gemindex wayback` (or presses Start on the Guides page). Text only: nothing is run, unpacked or posted.
// Same files as the toolkit's own crawl folder (scrape.cs line 4), so either tool reads what the other wrote:
//   <data>/scrape/state/<id>.json per address, raw/<id>.<n>.gz (bodies), text/<id>.txt, robots/<host>.txt + _notes.txt, results.json, guides.snapshot.json
//   id = first 12 hex of sha1(url). The toolkit's builtin-pages.pack is never rewritten; lib/load.js reads scrape/ on top of it.
// Rules kept from the original: robots.txt obeyed on every hop (agent "gemindex-fetch", unreachable or 5xx = disallow all, crawl-delay raises the
// pace), one request at a time per site with a minimum gap (1.1 s; web.archive.org 2.5 s, steamcommunity.com 15 s, mow-portal.com 10 s),
// redirects by hand (at most 5, same site only), 30 s per request, 2 MB body cap (kept, marked truncated), text types only, binaries dropped by
// magic bytes, 429 = back off (Retry-After honoured), Discord never fetched, private addresses refused, bot walls and logins recorded, never passed.
// Changed: one request at a time overall (the toolkit ran 16 sites in parallel), a --limit on rows per run, one pass per run (rows that hit a busy
// site are not saved and come back on the next run), the Wayback rescue only for this run's rows. No cookies, no login, no script.
// Author: Imperator_Aug (ARSENAL, ia-33e5fff5)
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto'), http = require('http'), https = require('https');
const PT = require('./pagetext');

const UA = 'GemIndex-fetch/1.0 (ARSENAL gemindex; reads public pages for an offline modding index; obeys robots.txt)', ROBOTS_NAME = 'gemindex-fetch';
const DEFAULT_ACCEPT = 'text/html,application/xhtml+xml,text/plain,application/pdf;q=0.9,*/*;q=0.1';
const CAP = 2 * 1024 * 1024, TIMEOUT = 30000, MAX_TRIES = 3, MIN_INTERVAL = 1100, BACKOFF_429_MAX = 3600000, MAX_INTERVAL = 60000, MAX_RETRY_WAIT = 120000;
const SLOW_HOSTS = { 'web.archive.org': 2500, 'steamcommunity.com': 15000, 'mow-portal.com': 10000 };
const MAX_429 = { 'steamcommunity.com': 8, 'web.archive.org': 4 };
const SKIP_HOST = /(^|\.)(drive\.google\.com|docs\.google\.com|mega\.nz|mediafire\.com|dropbox\.com|yadi\.sk|disk\.yandex\.\w+)$/;
const COPY_HOST = /(^|\.)(moddb\.com|fandom\.com|artstation\.com|tieba\.baidu\.com|smods\.ru|atwiki\.jp|3dmgame\.com)$/;   // these turn bots away: an archived copy, or nothing
const DISCORD_HOST = /(^|\.)(discord\.gg|discord\.com|discordapp\.com|discordapp\.net)$/;
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[::1\]|\[f[cd]|\[fe80|::1$)/i;
const TEXTY = /^(text\/|application\/(xhtml|xml|json|rss|atom|javascript)|application\/.*\+(xml|json))/;
const MAGIC = [[0x4D, 0x5A], [0x50, 0x4B], [0x52, 0x61, 0x72], [0x37, 0x7A], [0x1F, 0x8B], [0x7F, 0x45]];   // MZ PK Rar 7z gz ELF
const RESCUABLE = /^(dead|http\d+|neterr|robots|offhost|moved|soft404|parked|login|captcha|botwall|jsshell|cookiewall|thin|no-copy)$/;
const WAYBACK = 'https://web.archive.org';

const idOf = url => crypto.createHash('sha1').update(Buffer.from(url, 'utf8')).digest('hex').slice(0, 12);
const hex = b => crypto.createHash('sha1').update(b).digest('hex');
const bare = h => String(h).toLowerCase().replace(/^www\./, '');
const sameSite = (a, b) => { const x = bare(a), y = bare(b); return x === y || x.endsWith('.' + y) || y.endsWith('.' + x); };
const hostOf = u => new URL(u).hostname.toLowerCase();
const sleep = ms => new Promise(r => setTimeout(r, ms));
function waybackParts(url) { const m = /\/web\/(\d+)[a-z_]*\/(.*)$/.exec(url); return m ? { ts: m[1], orig: m[2] } : null; }
const waybackRaw = url => url.replace(/\/web\/(\d+)[a-z_]*\//, '/web/$1id_/');
function kindOf(url) {
  const u = new URL(url), h = bare(u.hostname), p = u.pathname;
  if (h === 'web.archive.org') return 'wayback';
  if (h === 'github.com') return 'github';
  if (h === 'youtube.com' || h === 'youtu.be') return 'youtube';
  if (h === 'bilibili.com') return 'bilibili';
  if (h === 'docs.bestway.com.ua' || h.endsWith('.gitbook.io')) return 'gitbook';
  if (h === 'steamcommunity.com' && p.includes('filedetails')) return 'steam';
  if (/\.txt$/i.test(p)) return 'html';
  if (/\.pdf$/i.test(p)) return 'skip';
  if (SKIP_HOST.test(h)) return 'skip';
  if (COPY_HOST.test(h)) return 'copy';
  return 'html';
}
const norm = url => { const t = new URL(url); return bare(t.hostname) + t.pathname.replace(/\/$/, '') + t.search; };
function movedAway(from, to) {
  if (!to || norm(from) === norm(to)) return false;
  const a = new URL(from), b = new URL(to);
  return bare(a.hostname) !== bare(b.hostname) || !b.pathname.startsWith(a.pathname.replace(/\/$/, ''));
}
// robots.txt, as scrape.cs ParseRobots/RobotsAllow (lines 676-721)
function robotsRx(p) { const end = p.endsWith('$'); const body = (end ? p.slice(0, -1) : p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*'); return new RegExp('^' + body + (end ? '$' : '')); }
function parseRobots(txt) {
  const groups = []; let cur = null, agentLine = false;
  for (const raw of txt.split('\n')) {
    const m = /^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*$/.exec(raw.replace(/\r$/, '').replace(/#.*/, ''));
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2];
    if (k === 'user-agent') { if (!cur || !agentLine) { cur = { agents: [], rules: [], delay: 0 }; groups.push(cur); } cur.agents.push(v.toLowerCase()); agentLine = true; }
    else if (cur && (k === 'allow' || k === 'disallow')) { if (v) cur.rules.push({ allow: k === 'allow', path: v, rx: robotsRx(v) }); agentLine = false; }
    else if (cur && k === 'crawl-delay') { cur.delay = parseFloat(v) || 0; agentLine = false; }
  }
  const mine = groups.filter(g => g.agents.some(a => a !== '*' && a && ROBOTS_NAME.startsWith(a)));
  const use = mine.length ? mine : groups.filter(g => g.agents.includes('*'));
  const o = { rules: [], delay: 0, unreachable: false };
  for (const g of use) { o.rules.push(...g.rules); o.delay = Math.max(o.delay, g.delay); }
  return o;
}
function robotsAllow(r, url) {
  const t = new URL(url), pq = t.pathname + t.search;
  let best = null;
  for (const x of r.rules) if (x.rx.test(pq) && (!best || x.path.length > best.path.length || (x.path.length === best.path.length && x.allow))) best = x;
  return { ok: !best || best.allow, rule: best ? (best.allow ? 'allow ' : 'disallow ') + best.path : '' };
}
function retryAfterMs(v) {
  if (!v) return 0;
  if (/^\d+$/.test(v) && v.length < 9) return Number(v) * 1000;
  const t = Date.parse(v); return isNaN(t) ? 0 : Math.max(0, t - Date.now());
}
class Stopped extends Error { }
const netName = e => e instanceof Stopped ? 'Stopped' : e.code === 'ETIMEDOUT' || /timeout|took too long/i.test(e.message) ? 'Timeout' : e.code === 'ENOTFOUND' || e.code === 'EAI_AGAIN' ? 'NameResolutionFailure'
  : e.code === 'ECONNREFUSED' ? 'ConnectFailure' : e.code === 'ECONNRESET' ? 'ConnectionClosed' : /^ERR_TLS|CERT|SSL/i.test(e.code || '') ? 'TrustFailure' : (e.code || 'ReceiveFailure');

// field order = the C# classes' (PageRec, PageState, ScrapeResult), so the JSON reads the same in both tools
function pageRec(o) { return { url: o.url, finalUrl: o.finalUrl || null, ctype: o.ctype || '', etag: o.etag || '', lastModified: o.lastModified || '', disposition: o.disposition || '', blocked: o.blocked || null, rule: o.rule || null,
  netError: o.netError || null, retryAfter: o.retryAfter || '', server: o.server || '', bodyHash: o.bodyHash || null, raw: o.raw || null, json: o.json || null, status: o.status || 0, bytes: o.bytes || 0,
  length: o.length || 0, ms: o.ms || 0, nextTryMs: o.nextTryMs || 0, truncated: !!o.truncated, skipped: !!o.skipped, gaveUp: !!o.gaveUp, md: !!o.md, repeat: !!o.repeat, trail: o.trail || null }; }
function pageState(o) { return { id: o.id, url: o.url, title: o.title || '', lang: o.lang || '', kind: o.kind, at: o.at, error: o.error || null, snapshot: o.snapshot || null, pages: o.pages || [], extra: o.extra || {},
  transient: !!o.transient, hasNext: !!o.hasNext, rescueTried: !!o.rescueTried }; }

class Scraper {
  // opt: {log(line), progress(done, total), test (local addresses, short waits), wayback (base, test only), timeoutMs, cap, interval (test only)}
  constructor(dir, opt) {
    opt = opt || {};
    this.dir = dir; this.log = opt.log || (() => {}); this.progress = opt.progress || (() => {});
    this.test = !!opt.test;
    this.wayback = (this.test && opt.wayback) || WAYBACK;
    this.timeout = Math.max(this.test ? 100 : 5000, Math.min(120000, +opt.timeoutMs || TIMEOUT));
    this.cap = this.test && opt.cap ? opt.cap : CAP;
    this.minInterval = this.test ? (+opt.interval || 50) : Math.max(MIN_INTERVAL, +opt.interval || 0);   // the CLI can only make it slower
    this.backoff429 = this.test ? 300 : 600000;
    this.stopping = false; this.active = new Set(); this.pacers = new Map(); this.robots = new Map(); this.requests = [];
  }
  stop() { this.stopping = true; for (const a of this.active) a(new Stopped('stopped')); }
  async wait(ms) { while (ms > 0) { if (this.stopping) throw new Stopped(); const s = Math.min(ms, 200); await sleep(s); ms -= s; } if (this.stopping) throw new Stopped(); }
  pacer(host) {
    if (!this.pacers.has(host)) this.pacers.set(host, { next: 0, until: 0, interval: this.test ? this.minInterval : Math.max(this.minInterval, SLOW_HOSTS[bare(host)] || SLOW_HOSTS[host] || 0), reqs: 0, hits429: 0 });
    return this.pacers.get(host);
  }
  async pace(host) { const p = this.pacer(host), now = Date.now(), at = Math.max(now, p.next, p.until); p.next = at + p.interval; p.reqs++; if (at > now) await this.wait(at - now);
    const real = Date.now(); if (real + p.interval > p.next) p.next = real + p.interval; }   // a timer that fires late must not shorten the gap to the next request
  forbidden(url) {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'scheme';
    const h = u.hostname.toLowerCase();
    if (DISCORD_HOST.test(h)) return 'discord';
    if (!this.test && PRIVATE_HOST.test(h)) return 'private';
    if (this.test && !PRIVATE_HOST.test(h)) return 'test-local-only';   // test mode never leaves this machine
    return null;
  }
  // one GET, no redirect following: status, headers, body (text types only, capped)
  async http(url, accept) {
    if (this.stopping) throw new Stopped();
    await this.pace(hostOf(url));
    const t0 = Date.now();
    this.requests.push({ url, at: t0 });
    const u = new URL(url), lib = u.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (err, v) => { if (done) return; done = true; clearTimeout(timer); this.active.delete(abort); err ? reject(err) : resolve(v); };
      const abort = e => { finish(e); try { req.destroy(); } catch (x) { /* gone */ } };
      const req = lib.request(u, { method: 'GET', agent: false, headers: { 'User-Agent': UA, Accept: accept || DEFAULT_ACCEPT, 'Accept-Encoding': 'gzip, deflate' } }, res => {
        const hd = k => { const v = res.headers[k]; return Array.isArray(v) ? v[0] : (v || ''); };
        const o = { url, status: res.statusCode, ctype: hd('content-type').toLowerCase(), etag: hd('etag'), lastModified: hd('last-modified'), location: hd('location'), retryAfter: hd('retry-after'),
          disposition: hd('content-disposition'), server: hd('server'), length: Number(hd('content-length')) || 0, buf: Buffer.alloc(0), truncated: false, skipped: false };
        const allowed = (TEXTY.test(o.ctype) || !o.ctype) && !/attachment/i.test(o.disposition);
        if ((o.status >= 300 && o.status < 400) || !allowed) { o.skipped = !allowed; o.ms = Date.now() - t0; res.destroy(); return finish(null, o); }
        const enc = hd('content-encoding').toLowerCase();
        const body = enc === 'gzip' ? res.pipe(zlib.createGunzip()) : enc === 'deflate' ? res.pipe(zlib.createInflate()) : res;
        const parts = []; let size = 0;
        body.on('data', c => {
          if (done) return;
          if (size + c.length > this.cap) { parts.push(c.subarray(0, this.cap - size)); size = this.cap; o.truncated = true; res.destroy(); body.destroy(); end(); return; }
          parts.push(c); size += c.length;
        });
        const end = () => { o.buf = Buffer.concat(parts, size); if (MAGIC.some(m => o.buf.length >= m.length && m.every((b, i) => o.buf[i] === b))) { o.buf = Buffer.alloc(0); o.skipped = true; } o.ms = Date.now() - t0; finish(null, o); };
        body.on('end', end);
        body.on('error', e => { if (o.truncated) return; finish(e); });
      });
      const timer = setTimeout(() => abort(Object.assign(new Error('the request took too long'), { code: 'ETIMEDOUT' })), this.timeout);
      req.on('error', e => finish(this.stopping ? new Stopped() : e));
      this.active.add(abort);
      req.end();
    });
  }
  async robotsFor(url) {
    const t = new URL(url), key = t.protocol + '//' + t.host;
    if (this.robots.has(key)) return this.robots.get(key);
    let parsed = { rules: [], delay: 0, unreachable: false }, note;
    const closed = { rules: [{ allow: false, path: '/', rx: /^\// }], delay: 0, unreachable: true };   // RFC 9309: unreachable means disallow
    try {
      let res, at = key + '/robots.txt';
      for (let hop = 0; ; hop++) {   // the toolkit let .NET follow robots.txt redirects
        res = await this.http(at, '*/*');
        if (res.status >= 300 && res.status < 400 && res.location && hop < 5) { at = new URL(res.location, at).href; continue; }
        break;
      }
      note = String(res.status);
      if (res.status >= 500) parsed = closed;
      else if (res.status >= 200 && res.status < 300 && res.buf.length) {
        let body = PT.decode(res.buf, res.ctype, '').text.slice(0, 500000);
        if (!/<html/i.test(body.slice(0, 300))) {
          parsed = parseRobots(body);
          if (this.dir) fs.writeFileSync(path.join(this.dir, 'robots', t.hostname.replace(/[^A-Za-z0-9.-]/g, '_') + '.txt'), body);
        }
      }
    } catch (e) { if (e instanceof Stopped || this.stopping) throw new Stopped(); note = 'neterr ' + netName(e); parsed = closed; }
    if (parsed.delay > 0) { const p = this.pacer(t.hostname.toLowerCase()); p.interval = Math.max(p.interval, Math.round(parsed.delay * 1000)); }
    this.robots.set(key, parsed);
    if (this.dir) fs.appendFileSync(path.join(this.dir, 'robots', '_notes.txt'), t.hostname + '\t' + note + '\t' + parsed.rules.length + ' rules\tdelay ' + parsed.delay + '\n');
    return parsed;
  }
  // GET with robots on every hop, retries, 429 back-off, same-site redirects (scrape.cs Get, line 825)
  async get(url, accept) {
    let cur = url, hops = 0, tries = 0, n429 = 0;
    const trail = [];
    for (;;) {
      const bad = this.forbidden(cur);
      if (bad) return { url: cur, blocked: bad, trail, buf: Buffer.alloc(0), status: 0 };
      const rb = await this.robotsFor(cur), ra0 = robotsAllow(rb, cur);
      if (!ra0.ok) return { url: cur, blocked: 'robots', rule: ra0.rule, trail, transient: rb.unreachable, buf: Buffer.alloc(0), status: 0 };
      let r;
      try { r = await this.http(cur, hops > 0 ? null : accept); }
      catch (e) { if (e instanceof Stopped || this.stopping) throw new Stopped(); r = { url: cur, netError: netName(e), buf: Buffer.alloc(0), status: 0 }; }
      const host = hostOf(cur), p = this.pacer(host);
      if (r.status === 429) {
        const ra = retryAfterMs(r.retryAfter), allowed = MAX_429[bare(host)] || 1;
        n429++; p.hits429++;
        if (ra > BACKOFF_429_MAX) p.until = Math.max(p.until, Date.now() + ra);
        if (n429 > allowed || ra > BACKOFF_429_MAX) return Object.assign(r, { gaveUp: true, transient: true, nextTryMs: ra || this.backoff429, tries, trail });
        p.interval = Math.min(MAX_INTERVAL, Math.ceil(p.interval * 1.5));
        const wait = Math.max(ra, Math.min(BACKOFF_429_MAX, this.backoff429 * 2 ** (n429 - 1)));
        p.until = Math.max(p.until, Date.now() + wait);
        this.log('429 from ' + bare(host) + ': waiting ' + Math.round(wait / 1000) + ' s, then one request per ' + Math.round(p.interval / 100) / 10 + ' s');
        continue;
      }
      if (r.netError || r.status >= 500) {
        tries++;
        const ra = retryAfterMs(r.retryAfter);
        if (tries >= MAX_TRIES || ra > MAX_RETRY_WAIT) return Object.assign(r, { gaveUp: true, transient: true, nextTryMs: ra || 3600000, tries, trail });
        const wait = ra || (this.test ? 30 : 2 ** tries * 3000 + Math.floor(Math.random() * 1000));
        p.until = Date.now() + wait;
        continue;
      }
      if ([301, 302, 303, 307, 308].includes(r.status) && r.location) {
        if (++hops > 5) return Object.assign(r, { blocked: 'redirects', trail });
        let next; try { next = new URL(r.location, cur); } catch (e) { return Object.assign(r, { blocked: 'redirects', trail }); }
        if (!sameSite(next.hostname, host)) return Object.assign(r, { blocked: 'offhost', rule: next.hostname, trail });
        cur = next.href; trail.push(cur);
        continue;
      }
      return Object.assign(r, { finalUrl: cur, trail, tries });
    }
  }
  savePage(id, n, r) {
    const rec = pageRec({ url: r.url, finalUrl: r.finalUrl, status: r.status, ctype: r.ctype, etag: r.etag, lastModified: r.lastModified, length: r.length, bytes: r.buf ? r.buf.length : 0,
      truncated: r.truncated, skipped: r.skipped, disposition: r.disposition, ms: r.ms, blocked: r.blocked, rule: r.rule, netError: r.netError, gaveUp: r.gaveUp, nextTryMs: r.nextTryMs,
      trail: r.trail, retryAfter: r.retryAfter, server: r.server });
    if (r.buf && r.buf.length) { rec.bodyHash = hex(r.buf); rec.raw = id + '.' + n + '.gz'; fs.writeFileSync(path.join(this.dir, 'raw', rec.raw), zlib.gzipSync(r.buf)); }
    return rec;
  }
  async fetchPaged(row, st, url, maxPages) {
    const wb = st.kind === 'wayback' ? waybackParts(row.Url) : null;
    const seen = new Set(), hashes = new Set();
    let cur = url;
    for (let n = 0; n < maxPages && cur; n++) {
      seen.add(cur);
      const r = await this.get(cur);
      if (r.transient) st.transient = true;
      const rec = this.savePage(st.id, n, r);
      st.pages.push(rec);
      if (r.status !== 200 || !r.buf.length || !/html|xml/.test(r.ctype || 'html')) break;
      if (n === 0 && !wb && movedAway(row.Url, r.finalUrl || cur)) break;   // a redirect to some listing has no thread to follow
      if (rec.bodyHash && hashes.has(rec.bodyHash)) { rec.repeat = true; break; }
      hashes.add(rec.bodyHash);
      const { info } = PT.parse(PT.decode(r.buf, r.ctype, row.Lang).text);
      const base = wb ? wb.orig.replace(/^(https?:\/\/[^/:]+):80\//, '$1/') : (r.finalUrl || cur);
      let next = PT.findNext(info, base);
      if (next && wb) next = this.wayback + '/web/' + wb.ts + 'id_/' + next;
      if (!next || seen.has(next)) break;
      st.hasNext = true; cur = next;
    }
  }
  // the newest good copy on the Wayback Machine (CDX, one capture per year, newest 3 tried; scrape.cs ArchivedCopy line 955)
  async cdx(orig) {
    let bad; try { bad = this.forbidden(orig); } catch (e) { bad = 'address'; }
    if (bad) return { ok: false, r: { blocked: bad, status: 0, buf: Buffer.alloc(0) }, snaps: [] };   // no archive lookup for an address we would not fetch
    const r = await this.get(this.wayback + '/cdx/search/cdx?output=json&fl=timestamp,statuscode,mimetype&filter=statuscode:200&filter=mimetype:text/html&collapse=timestamp:4&url=' + encodeURIComponent(orig));
    if (r.status !== 200 || !r.buf.length) return { ok: false, r, snaps: [] };
    let data; try { data = JSON.parse(r.buf.toString('utf8')); } catch (e) { return { ok: false, r, snaps: [] }; }
    const snaps = Array.isArray(data) ? data.slice(1).reverse().filter(c => Array.isArray(c) && c.length).map(c => String(c[0])) : [];
    return { ok: true, r, snaps };
  }
  async archivedCopy(st) {
    let orig = st.url;
    if (st.kind === 'wayback') { const w = waybackParts(st.url); if (!w) return false; orig = w.orig; }
    const c = await this.cdx(orig);
    if (c.r.transient) st.transient = true;
    if (!c.ok) return false;
    const host = bare(new URL(orig).hostname);
    for (const s of c.snaps.slice(0, 3)) {
      const p = await this.get(this.wayback + '/web/' + s + 'id_/' + orig);
      if (p.transient) st.transient = true;
      if (p.status !== 200 || !p.buf.length) continue;
      if (PT.judgeOne(p.buf, p.ctype, st.lang, st.title, host) !== 'ok') continue;
      st.pages = [this.savePage(st.id, 90, p)]; st.snapshot = s; st.transient = false;
      return true;
    }
    return false;
  }
  async processRow(row, maxPages) {
    const st = pageState({ id: idOf(row.Url), url: row.Url, title: row.Title, lang: row.Lang, kind: kindOf(row.Url), at: new Date().toISOString() });
    const u = new URL(row.Url);
    if (st.kind === 'wayback') await this.fetchPaged(row, st, waybackRaw(row.Url), maxPages);
    else if (st.kind === 'gitbook') {
      const r = await this.get(row.Url.replace(/\/+$/, '') + '.md');
      if (r.transient) st.transient = true;
      const page = this.savePage(st.id, 0, r); page.md = r.status === 200 && !String(r.ctype).includes('html');
      st.pages.push(page);
      if (!page.md) { st.pages = []; await this.fetchPaged(row, st, row.Url, 1); }
    } else if (st.kind === 'github') {
      const parts = u.pathname.split('/');
      if (parts.length < 3 || !parts[2]) await this.fetchPaged(row, st, row.Url, 1);
      else {
        const owner = parts[1], repo = parts[2]; let n = 0;
        for (const name of ['README.md', 'readme.md', 'Readme.md', 'README.rst', 'README.txt', 'README']) {
          const r = await this.get('https://raw.githubusercontent.com/' + owner + '/' + repo + '/HEAD/' + name);
          if (r.blocked) { st.pages.push(this.savePage(st.id, n++, r)); break; }
          if (r.status === 200) { const page = this.savePage(st.id, n++, r); page.md = true; st.pages.push(page); break; }
        }
        const tree = await this.get('https://api.github.com/repos/' + owner + '/' + repo + '/git/trees/HEAD?recursive=1', 'application/vnd.github+json');
        st.extra.treeStatus = tree.status || tree.blocked || null;
        if (tree.status === 200) {
          let docs = [];
          try { docs = (JSON.parse(tree.buf.toString('utf8')).tree || []).filter(t => t.type === 'blob' && /\.(md|markdown|rst|txt)$/i.test(t.path) && /^(docs?|wiki|documentation)\//i.test(t.path)).map(t => t.path); } catch (e) { docs = []; }
          st.extra.docFiles = docs.length;
          for (const p of docs.slice(0, 3)) {
            const r = await this.get('https://raw.githubusercontent.com/' + owner + '/' + repo + '/HEAD/' + encodeURI(p));
            if (r.status === 200) { const page = this.savePage(st.id, n++, r); page.md = true; st.pages.push(page); }
          }
        }
        if (u.pathname.endsWith('/releases')) await this.fetchPaged(row, st, row.Url, 1);
      }
    } else if (st.kind === 'youtube') {
      const page = this.savePage(st.id, 0, await this.get('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(row.Url)));
      page.json = 'oembed'; st.pages.push(page);
    } else if (st.kind === 'bilibili') {
      const r = await this.get(row.Url);
      st.pages.push(this.savePage(st.id, 0, r));
      const bv = /\/video\/(BV\w+)/.exec(u.pathname);
      if (r.blocked && bv) { const page = this.savePage(st.id, 1, await this.get('https://api.bilibili.com/x/web-interface/view?bvid=' + bv[1], 'application/json')); page.json = 'bilibili'; st.pages.push(page); }
    } else if (st.kind === 'skip') st.pages.push(pageRec({ url: row.Url, blocked: 'not-fetched' }));
    else if (st.kind === 'copy') { await this.archivedCopy(st); if (!st.pages.length) st.pages.push(pageRec({ url: row.Url, blocked: 'no-copy' })); }
    else await this.fetchPaged(row, st, row.Url, maxPages);
    return st;
  }
  saveState(st) { const p = path.join(this.dir, 'state', st.id + '.json'); fs.writeFileSync(p + '.tmp', JSON.stringify(st)); fs.renameSync(p + '.tmp', p); }
  prepare() { for (const d of ['state', 'raw', 'text', 'robots']) fs.mkdirSync(path.join(this.dir, d), { recursive: true }); }
  saveSnapshot(rows) {
    const file = path.join(this.dir, 'guides.snapshot.json'), all = new Map();
    try { for (const r of JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')).rows || []) all.set(String(r.url), r); } catch (e) { /* new */ }
    for (const r of rows) all.set(r.Url, { url: r.Url, title: r.Title, game: r.Game, comp: r.Comp });
    fs.writeFileSync(file + '.tmp', JSON.stringify({ rows: [...all.values()] })); fs.renameSync(file + '.tmp', file);
  }
  // fetch the rows (already chosen and capped), one at a time, grouped by site; a site that keeps failing rests until the next run
  async fetch(rows, maxPages) {
    this.prepare();
    const out = { saved: [], later: [], failed: [] };
    let done = 0, fails = 0, lastHost = '';
    for (const row of rows) {
      if (this.stopping) break;
      const h = bare(new URL(row.Url).hostname);
      if (h !== lastHost) { fails = 0; lastHost = h; }
      if (fails >= 5) { out.later.push(row.Url); continue; }
      let st;
      try { st = await this.processRow(row, maxPages); }
      catch (e) { if (e instanceof Stopped) break; st = pageState({ id: idOf(row.Url), url: row.Url, title: row.Title, lang: row.Lang, kind: 'html', error: (e.name || 'Error') + ': ' + e.message, at: new Date().toISOString() }); }
      fails = st.transient ? fails + 1 : 0;
      const p0 = st.pages[0];
      if (!st.transient) { this.saveState(st); out.saved.push(st.id); } else out.later.push(row.Url);
      done++;
      this.log(done + '/' + rows.length + ' ' + st.kind + ' ' + (p0 ? p0.status : '-') + ' ' + (p0 ? p0.blocked || p0.netError || '' : st.error || '') + ' p=' + st.pages.length +
        (st.snapshot ? ' copy ' + st.snapshot : '') + (st.transient ? ' (busy site: not saved, comes back next run)' : '') + ' ' + row.Url);
      if (fails >= 5) this.log('Resting ' + h + ' until the next run.');
      this.progress(done, rows.length);
    }
    return out;
  }
  // rows of this run that came out bad: the newest good copy on the Wayback Machine (scrape.cs Rescue, line 1112)
  async rescue(ids) {
    const want = new Set(ids);
    const res = readResults(this.dir).filter(r => want.has(r.id) && RESCUABLE.test(r.verdict || '') && !['copy', 'youtube', 'bilibili'].includes(r.kind));
    if (!res.length) return 0;
    this.log('Trying the Wayback Machine for ' + res.length + ' pages that came out bad.');
    let ok = 0;
    for (const r of res) {
      if (this.stopping) break;
      const p = path.join(this.dir, 'state', r.id + '.json');
      let st; try { st = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { continue; }
      if (st.rescueTried) continue;
      try { if (await this.archivedCopy(st)) { ok++; this.log('Copy found: ' + st.snapshot + ' ' + st.url); } }
      catch (e) { if (e instanceof Stopped) break; }
      if (!st.transient) st.rescueTried = true;
      this.saveState(pageState(st));
    }
    this.log('Wayback copies: got ' + ok + ' of ' + res.length + '.');
    return ok;
  }
}

// ---- raw bodies to text and verdicts, offline (scrape.cs ExtractOne/Extract, lines 1140-1300)
const LOOKS_HTML = /^\s*<(!doctype html|html)/i, TOOLBAR = /wm-ipp|_wb_|archive\.org\/_static/;
function readResults(dir) { try { const r = JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8').replace(/^﻿/, '')); return Array.isArray(r) ? r : []; } catch (e) { return []; } }
function extractOne(dir, st) {
  const hostName = bare(new URL(st.url).hostname); let ruleHost = hostName;
  if (st.kind === 'wayback') { const w = waybackParts(st.url); if (w) { try { ruleHost = bare(new URL(w.orig).hostname); } catch (e) { /* keep */ } } }
  const pages = st.pages || [], first = pages[0] || {};
  const r = { id: st.id, url: st.url, host: hostName, groupHost: ruleHost, kind: st.kind, lang: st.lang, blocked: first.blocked || null, netError: first.netError || null, method: '', charset: '', csFrom: '', title: '', verdict: '', textHash: '',
    status: first.status || 0, pages: pages.length, gotPages: pages.filter(p => p.status === 200).length, htmlChars: 0, kept: 0, generic: 0, repeatedLineChars: 0, rawBytes: 0,
    bad: 0, allLinkShare: 0, overlap: 0, ratio: 0, hasNext: !!st.hasNext, truncated: pages.some(p => p.truncated), toolbar: false, reasons: [] };
  const texts = [], generics = [];
  let title = '', description = '', rawHead = '', allChars = 0, allLink = 0, keptLink = 0, scripts = 0, password = false, anyHtml = false;
  for (const p of pages) {
    if (!p.raw) continue;
    let buf; try { buf = zlib.gunzipSync(fs.readFileSync(path.join(dir, 'raw', p.raw))); } catch (e) { continue; }
    r.rawBytes += buf.length;
    if (p.json === 'oembed') { r.method = 'oembed'; if (p.status !== 200) continue; try { const j = JSON.parse(buf.toString('utf8')); title = String(j.title || ''); texts.push(title + '\n' + String(j.author_name || '')); } catch (e) { /* none */ } continue; }
    if (p.json === 'bilibili') { if (p.status !== 200) continue; try { const j = JSON.parse(buf.toString('utf8')); if (j.data) { title = String(j.data.title || ''); texts.push(title + '\n' + String(j.data.desc || '')); } r.method = 'api:' + (j.code == null ? '' : j.code); } catch (e) { /* none */ } continue; }
    const d = PT.decode(buf, p.ctype, st.lang);
    r.charset = d.cs; r.csFrom = d.from; r.bad = Math.max(r.bad, d.bad); r.htmlChars += d.text.length;
    const ctype = p.ctype || '', looksHtml = LOOKS_HTML.test(d.text.slice(0, 4096));
    if (!looksHtml && (p.md || /markdown|text\/plain/.test(ctype))) { texts.push(p.md ? PT.mdToText(d.text) : d.text.trim()); if (!r.method) r.method = p.md ? 'md' : 'plain'; continue; }
    if (!looksHtml && !/html|xml/.test(ctype || 'html')) { texts.push(d.text); continue; }
    anyHtml = true;
    if (TOOLBAR.test(d.text.slice(0, 20000))) r.toolbar = true;
    const { root, info } = PT.parse(d.text);
    if (!title) { title = info.title; description = info.description; }
    scripts += info.scripts; password = password || info.password;
    if (!rawHead) rawHead = d.text;
    const g = PT.generic(root);
    generics.push(g.text); allChars += g.allChars; allLink += g.allLinkShare * g.allChars; keptLink += g.keptLink;
    const ruled = PT.byRule(root, ruleHost);
    if (ruled) { texts.push(ruled.text); if (!r.method.startsWith('rule')) r.method = 'rule:' + ruled.rule; }
    else { texts.push(g.text); if (!r.method) r.method = 'generic'; }
  }
  let text = texts.join('\n').trim();
  if (text.length < 200 && description) { text = (text + '\n' + description).trim(); r.method += '+meta'; }
  r.title = title; r.generic = generics.join('\n').length;
  text = PT.clean(text); r.text = text; r.kept = text.length;
  const lines = text.length ? text.split('\n').length : 0, finalUrl = first.finalUrl;
  let moved = '';
  if (!st.snapshot && !['wayback', 'gitbook', 'github', 'youtube'].includes(st.kind) && finalUrl && movedAway(st.url, finalUrl)) moved = 'redirected';
  else if (st.kind === 'gitbook' && finalUrl && finalUrl.includes('app.gitbook.com')) moved = 'redirected';
  const lap = PT.overlap(st.title, text);
  r.verdict = PT.judge({ status: pages.some(p => p.status === 200 && p.raw) ? 200 : (first.status || 0), blocked: first.blocked, netError: first.netError, binary: first.skipped,
    title, text, raw: rawHead, scripts, password, description, moved, isHtml: anyHtml, allLinkShare: allChars > 0 ? allLink / allChars : 0, keptLinkShare: text.length ? keptLink / text.length : 0,
    meanLine: lines ? text.length / lines : 0, lines, overlap: lap }, r.reasons);
  r.allLinkShare = allChars > 0 ? Math.round(allLink / allChars * 100) / 100 : 0;
  r.overlap = Math.round(lap * 100) / 100;
  r.textHash = hex(Buffer.from(text, 'utf8'));
  return r;
}
// extract(dir) -> results; rewrites text/<id>.txt and results.json for every state in the folder (as the toolkit does)
function extract(dir, log) {
  log = log || (() => {});
  const stateDir = path.join(dir, 'state');
  if (!fs.existsSync(stateDir)) return [];
  fs.mkdirSync(path.join(dir, 'text'), { recursive: true });
  let results = [];
  for (const f of fs.readdirSync(stateDir).filter(n => /\.json$/.test(n)).sort()) {
    try { results.push(extractOne(dir, JSON.parse(fs.readFileSync(path.join(stateDir, f), 'utf8').replace(/^﻿/, '')))); }
    catch (e) { log('Could not read ' + f + ': ' + e.message); }
  }
  // boilerplate across a site: a line on 3 rows or 2% of a site's rows, whichever is more, is chrome
  const bySite = new Map();
  for (const r of results) if (r.text.length) { if (!bySite.has(r.groupHost)) bySite.set(r.groupHost, []); bySite.get(r.groupHost).push(r); }
  for (const rs of bySite.values()) {
    if (rs.length < 3) continue;
    const limit = Math.max(3, Math.ceil(rs.length * 0.02)), seen = new Map();
    for (const r of rs) for (const l of new Set(r.text.split('\n').map(x => x.trim()).filter(x => x.length >= 4))) seen.set(l, (seen.get(l) || 0) + 1);
    for (const r of rs) { const before = r.text.length; r.text = r.text.split('\n').filter(l => (seen.get(l.trim()) || 0) < limit).join('\n'); r.repeatedLineChars = before - r.text.length; r.kept = r.text.length; }
  }
  for (const r of results) { fs.writeFileSync(path.join(dir, 'text', r.id + '.txt'), r.text); delete r.text; r.ratio = r.htmlChars > 0 ? Math.round(r.kept / r.htmlChars * 1000) / 1000 : 0; }
  results.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const out = path.join(dir, 'results.json');
  fs.writeFileSync(out + '.tmp', JSON.stringify(results)); fs.renameSync(out + '.tmp', out);
  const c = {}; for (const r of results) { const k = /^http\d/.test(r.verdict) ? 'http error' : r.verdict; c[k] = (c[k] || 0) + 1; }
  log('Pages read: ' + results.length + '. ' + Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ' + n).join(', '));
  return results;
}

// ---- choosing rows: the same filters as search; --all; --missing (no saved text yet); --url. Discord rows never (scrape.cs Scrapable).
function scrapable(r) { let u; try { u = new URL(r.url); } catch (e) { return false; } return r.source !== 'discord' && (u.protocol === 'http:' || u.protocol === 'https:') && !DISCORD_HOST.test(u.hostname.toLowerCase()); }
// plan(idx, Q, {filter, all, missing, url, force, limit}) -> {rows:[ScrapeRow], skipped:{known, discord, overLimit}, chosen, hosts}
function plan(idx, Q, o) {
  o = o || {};
  const limit = Math.max(1, Math.min(5000, +o.limit || 25));
  let base;
  if (o.url) { const r = idx.byUrl.get(o.url) || idx.byId.get(o.url); if (!r) throw Object.assign(new Error('not in the index: ' + o.url), { status: 400 }); base = [r]; }
  else if (o.all) base = idx.rows.slice();
  else {
    const f = Object.assign({}, o.filter || {});
    const empty = !f.q && !f.tab && !f.game && !f.comp && !f.sub && !f.lang && !f.archived && !o.missing;
    if (empty) f.tab = 'guides';   // the toolkit's default: the complete guides (README "With nothing chosen, scrape fetches the complete guides")
    base = Q.search(idx, Object.assign(f, { limit: 5000, discord: true })).rows.map(x => idx.byUrl.get(x.url)).filter(Boolean);
  }
  const pages = idx.pages(), own = new Set(idx.results('own').map(x => x.id)), builtin = new Set(idx.results('builtin').map(x => x.id));
  const skipped = { known: 0, discord: 0, overLimit: 0 }, seen = new Set(), todo = [];
  for (const r of base) {
    if (seen.has(r.url)) continue; seen.add(r.url);
    if (!scrapable(r)) { skipped.discord++; continue; }
    const id = idOf(r.url);
    if (o.missing && pages.has(r.url)) { skipped.known++; continue; }
    if (!o.force && (own.has(id) || fs.existsSync(path.join(idx.files.scrape, 'state', id + '.json')) || (!o.missing && builtin.has(id)))) { skipped.known++; continue; }
    todo.push(r);
  }
  // one site at a time: group by host, keeping the index order inside a site
  const order = new Map(); todo.forEach(r => { const h = bare(new URL(r.url).hostname); if (!order.has(h)) order.set(h, order.size); });
  todo.sort((a, b) => order.get(bare(new URL(a.url).hostname)) - order.get(bare(new URL(b.url).hostname)) || a.i - b.i);
  skipped.overLimit = Math.max(0, todo.length - limit);
  const rows = todo.slice(0, limit).map(r => ({ Url: r.url, Title: r.title, Lang: r.lang, Game: r.game, Comp: r.comp, id: idOf(r.url), kind: kindOf(r.url), host: bare(new URL(r.url).hostname) }));
  const hosts = {}; for (const r of rows) hosts[r.host] = (hosts[r.host] || 0) + 1;
  const waits = rows.map(r => r.kind === 'wayback' || r.kind === 'copy' ? SLOW_HOSTS['web.archive.org'] : SLOW_HOSTS[r.host] || MIN_INTERVAL);
  return { rows, skipped, chosen: todo.length, limit, hosts, minSeconds: Math.round(waits.reduce((a, b) => a + b, 0) / 1000) };
}

// where the fetch may write: <data>/scrape, only for a data folder the user named, never a game/Steam/repo folder (tools/lib/writeguard.js)
function scrapeDir(idx, o) {
  o = o || {};
  if (!o.named && !['--data', 'GEM_INDEX_DIR', 'GEMINDEX_DATA'].includes(idx.from)) throw Object.assign(new Error('Name the data folder to update: --data "<folder>" (the fetch writes into <folder>/scrape and nowhere else).'), { status: 400 });
  const dir = idx.files.scrape;
  const why = require('../../lib/writeguard').refuseWrite(dir, { purpose: 'save fetched pages', allowGameMods: false });
  if (why) throw Object.assign(new Error(why), { status: 400 });
  return dir;
}

// run(idx, Q, opt) -> {plan, fetched, results, stopped}. opt: plan options + {dry, maxPages, rescue, log, progress, scraper (opts), named, onScraper}
async function run(idx, Q, opt) {
  opt = opt || {};
  const pl = plan(idx, Q, opt);
  if (opt.dry) return { dry: true, plan: pl };
  const dir = scrapeDir(idx, opt);
  fs.mkdirSync(dir, { recursive: true });
  const s = new Scraper(dir, Object.assign({ log: opt.log, progress: opt.progress }, opt.scraper || {}));
  if (opt.onScraper) opt.onScraper(s);
  s.saveSnapshot(pl.rows);
  const got = await s.fetch(pl.rows, Math.max(1, Math.min(10, +opt.maxPages || 3)));
  let results = extract(dir, opt.log);
  if (opt.rescue !== false && !s.stopping && got.saved.length) { if (await s.rescue(got.saved)) results = extract(dir, opt.log); }
  const mine = new Set(pl.rows.map(r => r.id));
  return { dry: false, dir, plan: pl, saved: got.saved.length, later: got.later, stopped: s.stopping, requests: s.requests.length,
    rows: results.filter(r => mine.has(r.id)).map(r => ({ id: r.id, url: r.url, kind: r.kind, verdict: r.verdict, status: r.status, kept: r.kept })) };
}

// wayback(idx, key, opt) -> captures of a row's page (CDX, one per year), and with save: the newest good copy into <data>/scrape
async function wayback(idx, key, opt) {
  opt = opt || {};
  const r = idx.byId.get(key) || idx.byUrl.get(key);
  if (!r) throw Object.assign(new Error('not in the index: ' + key), { status: 400 });
  const w = waybackParts(r.url), orig = w && kindOf(r.url) === 'wayback' ? w.orig : r.url;
  const dir = opt.save ? scrapeDir(idx, opt) : null;   // listing only: nothing written anywhere
  const s = new Scraper(dir, Object.assign({ log: opt.log }, opt.scraper || {}));
  if (dir) s.prepare();
  {
    const c = await s.cdx(orig);
    const base = s.wayback;
    const captures = c.snaps.map(ts => ({ timestamp: ts, captured: ts.slice(0, 4) + '-' + ts.slice(4, 6) + '-' + ts.slice(6, 8), archiveUrl: base + '/web/' + ts + '/' + orig }));
    const out = { row: r.id, title: r.title, original: orig, ok: c.ok, status: c.r.status, blocked: c.r.blocked || null, netError: c.r.netError || null, captures };
    if (opt.save && c.ok) {
      const st = pageState({ id: idOf(r.url), url: r.url, title: r.title, lang: r.lang, kind: kindOf(r.url), at: new Date().toISOString() });
      out.saved = await s.archivedCopy(st);
      if (out.saved) { s.saveState(st); s.saveSnapshot([{ Url: r.url, Title: r.title, Game: r.game, Comp: r.comp }]); extract(dir, opt.log); out.snapshot = st.snapshot; }
    }
    return out;
  }
}

module.exports = { Scraper, run, plan, extract, extractOne, wayback, scrapeDir, idOf, kindOf, parseRobots, robotsAllow, waybackParts, scrapable, UA, MIN_INTERVAL, SLOW_HOSTS, CAP, TIMEOUT, WAYBACK };
