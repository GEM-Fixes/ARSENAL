// arsenal-gui registry generator: pages and API routes of the GUI, read from the GUI's own code. Nothing here is typed by hand.
//   node tools/mcp/gui.js --gen   writes tools/mcp/gui/registry.json (no time stamp: the same code gives the same file)
// Read from:
//   tools/gui/groups.js            the three games, their tabs, sub-tabs and pages (and na = pages a game cannot run)
//   tools/gui/ext/index.js         every ext page: id, nav key, adv, tab, its routes object (the handlers themselves)
//   tools/gui/gui.js               routeTable() = core routes + ext routes; the core handlers' text (fields); SCREEN_IDS (core pages)
//   tools/gui/lang/en.json + each ext's lang.en   page names, titles, intro lines
//   tools/gui/remote.js ALLOW      routes a view-only device may call = read-only
//   tools/gui/ext/task/lib/compile.js ROUTE_DRY, REFUSED_ROUTES   which body flag makes a route's dry run; routes that start a program
//   tools/gui/contract.js describe()   the commands of POST /api/run with their fields
//   comments next to a route in the ext's server files and in the head of gui.js   what a route does
//   ./scan.js                      which body and query fields a handler reads (static scan; `read` says how complete)
// build({fields: false}) skips the field scan (the keep-updated guard needs only names). signature(reg) = what the guard compares.
// Author: Imperator_Aug (ARSENAL, ia-a8e8a1f4)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const GUI = path.join(__dirname, '..', '..', 'gui');
const OUT = path.join(__dirname, 'registry.json');
const VERSION = 1;

// body flags of the GUI's write routes. Named here once: a flag that must be true to write, and flags that are true for the dry run.
const WRITE_FLAGS = ['write', 'apply', 'confirm'], DRY_FLAGS = ['dry', 'plan', 'dryRun', 'preview'];
// core routes that are not plain reads (gui.js has no table for this; ext routes are classified from the code, see classify)
const CORE_KIND = {
  'POST /api/run': 'command', 'POST /api/launch': 'launch', 'POST /api/remote': 'blocked', 'POST /api/remote/newkey': 'blocked',
  'POST /api/settings': 'always', 'POST /api/spec': 'always', 'POST /api/follow/remote': 'blocked',
  'POST /api/cancel': 'no', 'POST /api/answer': 'no', 'POST /api/follow': 'no',
};
const CORE_WHY = {
  'POST /api/launch': 'lets this GUI session start the game', 'POST /api/remote': 'opens the GUI to other devices on the network: the user does that in the page',
  'POST /api/remote/newkey': 'changes the LAN Remote link: the user does that in the page', 'POST /api/follow/remote': 'for remote devices only',
};

const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const cut = (s, n) => { s = clean(s); return s.length > n ? s.slice(0, n - 3).trimEnd() + '...' : s; };

function langOf() {
  const en = Object.assign({}, JSON.parse(fs.readFileSync(path.join(GUI, 'lang', 'en.json'), 'utf8')));
  for (const x of require(path.join(GUI, 'ext'))) Object.assign(en, (x.lang && x.lang.en) || {});
  return en;
}

// ---- pages
function pages(en) {
  const EXT = require(path.join(GUI, 'ext')), groups = require(path.join(GUI, 'groups')), gui = require(path.join(GUI, 'gui'));
  const extById = new Map(EXT.map(x => [x.id, x]));
  const P = {};
  const first = (id, keys) => { for (const k of keys) if (typeof en[id + '.' + k] === 'string' && en[id + '.' + k]) return en[id + '.' + k]; return ''; };
  for (const id of gui.SCREEN_IDS) {
    const x = extById.get(id);
    P[id] = { id, kind: x ? 'ext' : 'core', nav: x ? x.nav || null : 'nav.' + id, name: x ? (x.nav && en[x.nav]) || id : en['nav.' + id] || id,
      title: first(id, ['title', 'h1']), intro: cut(first(id, ['intro', 'lead']), 400), adv: !!(x && x.adv), tab: true, routes: 0, where: [] };
  }
  // ext without a tab (file viewers, the guided task row): no page of their own, their routes serve every page
  for (const x of EXT) if (!P[x.id]) P[x.id] = { id: x.id, kind: 'ext', nav: x.nav || null, name: (x.nav && en[x.nav]) || x.id, title: first(x.id, ['title', 'h1']), intro: cut(first(x.id, ['intro', 'lead']), 400), adv: !!x.adv, tab: false, routes: 0, where: [] };
  const games = groups.GAMES.map(g => ({
    id: g.id, name: g.name, kind: g.kind, exe: g.exe, target: g.target, open: g.open || [], na: g.na || {},
    tabs: g.tabs.map(t => ({
      id: t.id, label: t.label, name: en[t.label] || t.id, key: t.key,
      subs: t.subs.map(s => ({
        id: s.id, label: s.label, name: en[s.label] || s.id, why: s.why,
        pages: s.pages.map(ref => {
          const [pid, view] = ref.split('/'), p = P[pid];
          if (p) p.where.push({ game: g.id, tab: t.id, sub: s.id, view: view || null });
          const o = { ref, page: pid, name: p ? p.name : pid };
          if (view) o.view = view;
          if ((p && p.adv && !(g.open || []).includes(pid)) || groups.ADVREF.includes(ref)) o.adv = true;
          if (g.na && g.na[pid]) o.na = en[g.na[pid]] || g.na[pid];
          if (!p) o.missing = true;   // an id with no page in the GUI yet is never shown (groups.js)
          return o;
        }),
      })),
    })),
  }));
  return { games, pages: P, def: groups.DEFAULT };
}

// ---- what a route does: the comment next to it
function listJs(dir, out, depth) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of ents) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { if (depth < 4 && !/^(test|tests|work|fixtures?|node_modules|vendor)$/i.test(e.name)) listJs(f, out, depth + 1); continue; }
    if (!/\.js$/.test(e.name) || /(^|[.-])(test|tests|client|script|fakedom|fixture|blockcheck|parity|testgames)\b/i.test(e.name) || /^test/i.test(e.name)) continue;
    try { if (fs.statSync(f).size < (3 << 20)) out.push(f); } catch (e2) { /* gone */ }
  }
  return out;
}
function routeDocs(keys) {
  const want = new Set(keys), docs = new Map(), src = new Map();
  const files = [path.join(GUI, 'gui.js')].concat(listJs(path.join(GUI, 'ext'), [], 0));
  const RE = /\b(GET|POST)\s{1,3}(\/api\/[A-Za-z0-9_\/.-]*[A-Za-z0-9_])/g;
  const tidy = s => cut(String(s).replace(/^[\s:=,;\-–>|]+/, '').replace(/\*\/\s*$/, ''), 260);
  for (const f of files) {
    let lines; try { lines = fs.readFileSync(f, 'utf8').split(/\r?\n/); } catch (e) { continue; }
    const rel = path.relative(path.join(GUI, '..', '..'), f).split(path.sep).join('/');
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i]; if (ln.length > 4000 || ln.indexOf('/api/') < 0) continue;
      const isComment = /^\s*(\/\/|\*|\/\*)/.test(ln), hits = [];
      let m; RE.lastIndex = 0;
      while ((m = RE.exec(ln))) hits.push({ key: m[1] + ' ' + m[2], at: m.index, end: m.index + m[0].length });
      hits.forEach((h, n) => {
        if (!want.has(h.key)) return;
        if (isComment) {
          // only a comment that starts with the route describes it; a route named in the middle of a sentence is about something else
          if (!/^\s*(\/\/|\*|\/\*)[\s\-*]*$/.test(ln.slice(0, hits[0].at))) return;
          // the text after the route, up to the next route on the line; a line that goes on below (deeper indent) is joined
          let t = ln.slice(h.end, n + 1 < hits.length ? hits[n + 1].at : undefined);
          if (n + 1 >= hits.length) for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
            const nx = lines[j]; if (!/^\s*\/\/\s{4,}\S/.test(nx) || /\b(GET|POST)\s+\/api\//.test(nx)) break; t += ' ' + nx.replace(/^\s*\/\/\s*/, '');
          }
          t = tidy(t);
          if (t.length > 3 && (!docs.has(h.key) || docs.get(h.key).rank > 1)) docs.set(h.key, { text: t, rank: 1 });
          return;
        }
        // a code line: the definition when the route is a quoted key followed by : or ] =
        const q = ln[h.at - 1], after = ln.slice(h.end);
        if ((q === "'" || q === '"') && /^['"]\s*(:|\]\s*=)/.test(after) && !/^['"]\s*:\s*['"]/.test(after)) {   // not a table row 'route': 'word'
          if (!src.has(h.key)) src.set(h.key, rel + ':' + (i + 1));
          const tail = /\/\/\s*(.+)$/.exec(n + 1 < hits.length ? '' : after);
          let t = tail ? tail[1] : '';
          if (!t && n === 0) { const up = []; for (let j = i - 1; j >= Math.max(0, i - 3) && /^\s*\/\//.test(lines[j]) && !/\b(GET|POST)\s+\/api\//.test(lines[j]); j--) up.unshift(lines[j].replace(/^\s*\/\/\s*/, '')); t = up.join(' '); }
          t = tidy(t);
          if (t.length > 3 && !docs.has(h.key)) docs.set(h.key, { text: t, rank: 2 });
        }
      });
    }
  }
  return { docs, src };
}

// ---- core routes: the fields read in gui.js, by the text around `u.pathname === '<path>'`
function coreFields(keys) {
  const scan = require('./scan'), text = fs.readFileSync(path.join(GUI, 'gui.js'), 'utf8'), out = new Map();
  const marks = []; { const re = /u\.pathname === '([^']+)'/g; let m; while ((m = re.exec(text))) marks.push({ p: m[1], at: m.index }); }
  for (const key of keys) {
    const [method, p] = key.split(' '), mine = marks.filter(x => x.p === p);
    // the occurrence of this method: a GET line names req.method === 'GET' just before the path test
    const pick = mine.find(x => { const pre = text.slice(Math.max(0, x.at - 60), x.at); return method === 'GET' ? /req\.method === 'GET' && $/.test(pre) : !/req\.method === 'GET' && $/.test(pre); });
    if (!pick) { out.set(key, { body: [], query: [], read: 'none', notes: ['no handler text found in gui.js'] }); continue; }
    const next = marks.find(x => x.at > pick.at && x.p !== p), region = text.slice(pick.at, Math.min(next ? next.at : text.length, pick.at + 4000));
    const T = scan.scanText(region, { body: ['body'], url: ['u'] });
    out.set(key, { body: [...T.body].map(([name, type]) => (type ? { name, type } : { name })), query: [...T.query.keys()].map(name => ({ name })), read: 'full', notes: [] });
  }
  return out;
}

function classify(key, method, f, tables) {
  const names = new Set((f.body || []).map(x => x.name));
  const core = !key.includes(' /api/x/');
  if (core) { const k = CORE_KIND[key] || (method === 'GET' ? 'no' : 'unknown'); return Object.assign({ writes: k }, CORE_WHY[key] ? { why: CORE_WHY[key] } : {}); }
  if (tables.refused.has(key)) return { writes: 'blocked', why: 'starts an outside program or writes into the game folder (ext/task/lib/compile.js REFUSED_ROUTES)' };
  const rd = tables.routeDry[key];
  if (rd === 'read' || tables.allow.has(key)) return { writes: 'no' };
  if (rd === 'write') return { writes: 'flag', flag: 'write' };
  if (rd === 'dry' || rd === 'plan' || rd === 'dryRun') return { writes: 'dry', flag: rd };
  const wf = WRITE_FLAGS.find(x => names.has(x)); if (wf) return { writes: 'flag', flag: wf };
  const df = DRY_FLAGS.find(x => names.has(x)); if (df) return { writes: 'dry', flag: df };
  if (f.writesMark || rd === 'none') return { writes: 'always' };
  if (method === 'GET') return { writes: 'no' };
  // a POST nothing above classes: one named as a look-ahead is taken as a read. By its name only, the code is not proven
  // (a walk of everything a handler can reach was tried: every handler reaches the shared cache and job code, so none came out clean).
  const last = key.slice(key.lastIndexOf('/') + 1);
  if (LOOK_WORDS.has(last)) return { writes: 'no', by: 'name', why: 'classed by its name (' + last + '), not proven from the code' };
  return { writes: 'unknown' };
}
// last path word of a POST that only looks: a preview, a plan, a check, an editor lookup
const LOOK_WORDS = new Set(['preview', 'plan', 'check', 'lint', 'hover', 'def', 'refs', 'info', 'state', 'explain', 'describe', 'suggest', 'find', 'calc', 'names', 'help', 'read', 'whoami', 'joinstatus', 'modcheck', 'scan']);
const PREVIEW_WORDS = ['preview', 'plan', 'check', 'dry', 'try', 'calc'];

function build(opt = {}) {
  const gui = require(path.join(GUI, 'gui')), EXT = require(path.join(GUI, 'ext')), en = langOf();
  const pg = pages(en);
  let table = gui.routeTable().filter(k => /^(GET|POST) \//.test(k));
  // core GET routes the GUI's own table leaves out (GET /api/cache): read from the request handler's path tests
  { const text = fs.readFileSync(path.join(GUI, 'gui.js'), 'utf8'), re = /req\.method === 'GET' && u\.pathname === '(\/[^']*)'/g, extra = []; let m;
    while ((m = re.exec(text))) if (!table.includes('GET ' + m[1]) && !extra.includes('GET ' + m[1])) extra.push('GET ' + m[1]);
    const at = table.findIndex(k => k.includes(' /api/x/')); table = at < 0 ? table.concat(extra) : table.slice(0, at).concat(extra, table.slice(at)); }
  const extOf = new Map(); for (const x of EXT) for (const k of Object.keys(x.routes || {})) extOf.set(k, x);
  let scanned = new Map(), core = new Map();
  if (opt.fields !== false) {
    const list = []; for (const k of table) if (extOf.has(k)) list.push({ key: k, fn: extOf.get(k).routes[k] });
    scanned = require('./scan').scanRoutes(list);
    core = coreFields(table.filter(k => !extOf.has(k)));
  }
  const { docs, src } = opt.fields === false ? { docs: new Map(), src: new Map() } : routeDocs(table);
  let allow = new Set(), routeDry = {}, refused = new Set(), tablesOk = true;
  try { const R = require(path.join(GUI, 'remote')); for (const k of table) { const i = k.indexOf(' '); if (R.allowed(k.slice(0, i), k.slice(i + 1))) allow.add(k); } } catch (e) { tablesOk = false; }
  try { const C = require(path.join(GUI, 'ext', 'task', 'lib', 'compile')); routeDry = C.ROUTE_DRY || {}; refused = new Set(C.REFUSED_ROUTES || []); } catch (e) { tablesOk = false; }
  const routes = table.map(key => {
    const i = key.indexOf(' '), method = key.slice(0, i), p = key.slice(i + 1), x = extOf.get(key);
    const s = scanned.get(key), c = core.get(key);
    const f = s ? { body: [...s.body].map(([name, type]) => (type ? { name, type } : { name })), query: [...s.query.keys()].map(name => ({ name })), read: s.read, notes: s.notes, writesMark: s.writesMark }
      : c || { body: [], query: [], read: 'none', notes: opt.fields === false ? [] : ['not scanned'] };
    // the request's game and the GoH folder go in headers (gui_call args game, goh), not in the field list
    const drop = n => n !== 'gid' && n !== 'goh';
    const r = { route: key, method, path: p, page: x ? x.id : 'core', what: (docs.get(key) || {}).text || '',
      query: f.query.filter(q => drop(q.name)), body: f.body.filter(b => drop(b.name)), read: f.read };
    if (f.notes && f.notes.length) r.notes = f.notes.slice(0, 4);
    Object.assign(r, classify(key, method, f, { allow, routeDry, refused }));
    if (allow.has(key)) r.remote = true;
    if (src.get(key)) r.src = src.get(key);
    if (x && pg.pages[x.id]) pg.pages[x.id].routes++;
    return r;
  });
  // a route that writes on every call (or is not classed): the route beside it that shows the same thing without writing
  { const byPath = new Map(routes.map(r => [r.path, r]));
    for (const r of routes) {
      if (r.writes !== 'always' && r.writes !== 'unknown') continue;
      const cutAt = r.path.lastIndexOf('/'), dir = r.path.slice(0, cutAt), own = r.path.slice(cutAt + 1);
      const cands = PREVIEW_WORDS.map(w => byPath.get(dir + '/' + w)).concat(PREVIEW_WORDS.map(w => byPath.get(dir + '/' + own + '/' + w)), PREVIEW_WORDS.map(w => byPath.get(r.path + '-' + w)));
      if (!/^(write|apply|save|start|run|emit)$/.test(own)) continue;   // only a route named as the doing half of a pair
      const p = cands.find(x => x && x !== r && (x.writes === 'no' || x.writes === 'flag' || x.writes === 'dry'));
      if (p) r.preview = p.route;
    } }
  let commands = [];
  try {
    let cmds = {}; try { cmds = require(path.join(GUI, 'ext', 'task', 'lib', 'compile')).CMDS || {}; } catch (e) { /* none */ }
    commands = require(path.join(GUI, 'contract')).describe().map(d => {
      const k = cmds[d.id] || {};
      const o = { id: d.id, what: d.summary, launches: !!d.launchesGame, fields: d.fields.map(fl => Object.assign({ name: fl.name, type: fl.type }, fl.required ? { required: true } : {}, fl.values ? { values: fl.values } : {}, fl.desc ? { desc: cut(fl.desc, 160) } : {})) };
      // the input that makes the run a dry run: the contract's own safe flag, else what the guided task uses (compile.js CMDS)
      if (d.safeFlag) o.dry = { field: d.safeFlag, value: true };
      else if (k.dry) o.dry = { field: k.dry, value: true };
      else if (k.dryField) o.dry = { field: k.dryField, value: k.dryOn, write: k.dryOff };
      else if (d.fields.some(fl => fl.name === 'dry' && fl.type === 'bool')) o.dry = { field: 'dry', value: true };
      else if (d.fields.some(fl => fl.name === 'dryRun' && fl.type === 'bool')) o.dry = { field: 'dryRun', value: true };
      else if (d.fields.some(fl => fl.name === 'plan' && fl.type === 'bool')) o.dry = { field: 'plan', value: true };
      if (k.read) o.read = true;
      return o;
    });
  } catch (e) { commands = []; }
  const reg = {
    about: 'Generated by `node tools/mcp/gui.js --gen` from the GUI code (tools/mcp/gui/gen.js). Do not edit: change the GUI, then run the command.',
    version: VERSION, defaultGame: pg.def, games: pg.games, pages: pg.pages, routes, commands,
    legend: {
      read: 'full = every field the handler reads was found; partial = some were found, the handler also reads the body in a way the scan could not follow (see notes); none = not read',
      writes: 'no = reads only; flag = writes only when body[flag] is true; dry = writes unless body[flag] is true (gui_call sets it unless the body says write true); always = every call writes; command = POST /api/run, by the command; launch = starts the game; blocked = gui_call never sends it; unknown = a POST the scan could not class, treated as always. always and unknown are sent by gui_call only with confirm_write: true; preview = the route beside it to call first; by: name = classed as a read by its last path word only',
    },
    counts: null, sig: null,
  };
  reg.counts = { games: reg.games.length, pages: Object.values(reg.pages).filter(p => p.tab).length, pagesNoTab: Object.values(reg.pages).filter(p => !p.tab).length,
    routes: routes.length, get: routes.filter(r => r.method === 'GET').length, post: routes.filter(r => r.method === 'POST').length,
    fieldsFull: routes.filter(r => r.read === 'full').length, fieldsPartial: routes.filter(r => r.read === 'partial').length, fieldsNone: routes.filter(r => r.read === 'none').length,
    withFields: routes.filter(r => r.body.length || r.query.length).length, described: routes.filter(r => r.what).length, commands: commands.length,
    writes: routes.reduce((a, r) => { a[r.writes] = (a[r.writes] || 0) + 1; return a; }, {}), readByName: routes.filter(r => r.by === 'name').length, withPreview: routes.filter(r => r.preview).length };
  if (!tablesOk) reg.counts.note = 'remote.js or ext/task/lib/compile.js did not load: read-only marks are missing';
  reg.sig = signature(reg);
  return reg;
}

// what the keep-updated guard compares: route names, pages and where each sits. Not the fields (a handler edit is not a rename).
function sigParts(reg) {
  return {
    routes: reg.routes.map(r => r.route).sort(),
    pages: Object.values(reg.pages).map(p => [p.id, p.kind, p.nav || '', p.adv ? 1 : 0, p.tab ? 1 : 0].join('|')).sort(),
    tabs: reg.games.map(g => g.id + ': ' + g.tabs.map(t => t.id + '[' + t.subs.map(s => s.id + '(' + s.pages.map(p => p.ref).join(',') + ')').join(' ') + ']').join(' ')),
    na: reg.games.map(g => g.id + ': ' + Object.keys(g.na || {}).sort().join(',')),
  };
}
function signature(reg) { return crypto.createHash('sha1').update(JSON.stringify(sigParts(reg))).digest('hex'); }

// registry.json against the code now -> {ok, lines: [what differs]}
function drift(saved, now) {
  const a = sigParts(saved), b = sigParts(now), lines = [];
  const diff = (name, x, y) => {
    const X = new Set(x), Y = new Set(y);
    for (const v of y) if (!X.has(v)) lines.push(name + ' in the GUI, not in registry.json: ' + v);
    for (const v of x) if (!Y.has(v)) lines.push(name + ' in registry.json, gone from the GUI: ' + v);
  };
  diff('route', a.routes, b.routes); diff('page', a.pages, b.pages); diff('tab row', a.tabs, b.tabs); diff('na list', a.na, b.na);
  if (!lines.length && saved.sig !== signature(saved)) lines.push('registry.json was edited by hand (its sig does not match its content)');
  return { ok: !lines.length, lines };
}

function load() { return JSON.parse(fs.readFileSync(OUT, 'utf8')); }
function write(reg) { fs.writeFileSync(OUT, JSON.stringify(reg, null, 1) + '\n', 'utf8'); return OUT; }

module.exports = { build, signature, sigParts, drift, load, write, langOf, OUT, WRITE_FLAGS, DRY_FLAGS, VERSION };
