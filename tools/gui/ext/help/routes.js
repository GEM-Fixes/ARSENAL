// help ext routes: glossary, guide reader, limits row lookup, diagnostics text. Read-only; never writes a file.
// Docs (guide/, limits/) are read at run time from the source tree, next to the exe, or the working folder; absent = a plain "not here" answer.
// Test hooks: AS2_HELP_ROOT (folder holding guide/ and limits/), AS2_HELP_DOCS (folder holding "My Games"), AS2_HELP_LOCAL (the LOCALAPPDATA
// folder, for the Gates of Hell log; empty = none).
// Game parity: a limits ID of a GH area (GHVFS-13) is read; the diagnostics follow the page's game (ctx.kind, ctx.gameId):
// under Gates of Hell the GoH install (the page sends curFolder(), else ctx.gohDir()), binaries/x64/call_to_arms.exe and its version,
// the GoH mod.info rule per mod, and the GoH game.log (GHVFS-13).
// Author: Imperator_Aug (ARSENAL, ia-8eb9d4d5)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const GLOSS = require('./glossary-data.js');
const TERMS = require('./terms.js');
const LANGS = ['en', 'ru', 'uk', 'zh'];
const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });

// page id -> guide chapters that explain it
const TOPICS = {
  help: ['01-getting-started.md', '22-glossary.md'], mods: ['03-mod-folder-and-load-order.md', '02-install-layout.md'],
  make: ['06-data-keys-entities.md', '07-units-vehicles-movement.md'], check: ['19-toolchain.md', '21-troubleshooting.md'],
  play: ['18-testing-and-logs.md'], test: ['18-testing-and-logs.md'], upgrade: ['03-mod-folder-and-load-order.md', '19-toolchain.md'],
  missions: ['12-missions-and-multiplayer-setup.md', '13-maps.md'], modes: ['12-missions-and-multiplayer-setup.md', '10-ai-and-bots.md'],
  units: ['07-units-vehicles-movement.md', '08-infantry-and-humans.md', '09-weapons-ammo-damage.md'],
  maps: ['13-maps.md', '12-missions-and-multiplayer-setup.md'], art: ['15-interface-and-icons.md', '16-effects-sound-models.md'],
  logs: ['18-testing-and-logs.md', '21-troubleshooting.md'], share: ['20-packaging-and-release.md', '04-vfs-paks-patches.md'],
  goh: ['19-toolchain.md', '14-localization.md'], docs: ['19-toolchain.md', '01-getting-started.md'], bots: ['10-ai-and-bots.md', '17-balance-pricing-gameplay.md'], unitai: ['10-ai-and-bots.md', '08-infantry-and-humans.md'], mapai: ['10-ai-and-bots.md', '12-missions-and-multiplayer-setup.md'], balance: ['17-balance-pricing-gameplay.md'],
  ide: ['19-toolchain.md', '05-sdl-language.md'], files: ['04-vfs-paks-patches.md', '19-toolchain.md'], doctrine: ['10-ai-and-bots.md', '19-toolchain.md'],
  guides: ['19-toolchain.md', '01-getting-started.md'], pro: ['19-toolchain.md'], settings: ['19-toolchain.md'],
};

const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };
const stat = p => { try { return fs.statSync(p); } catch (e) { return null; } };
const home = () => { try { return os.homedir(); } catch (e) { return ''; } };
// show the user's home as %USERPROFILE% so a pasted text carries no user name
function mask(s) {
  const h = home();
  if (!h || h.length < 4) return String(s);
  return String(s).split(new RegExp(h.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&'), 'gi')).join('%USERPROFILE%');
}
function roots() {
  const r = [];
  if (process.env.AS2_HELP_ROOT) return [path.resolve(process.env.AS2_HELP_ROOT)];
  try { r.push(path.resolve(__dirname, '..', '..', '..', '..')); } catch (e) { /* bundled */ }
  // a docs edition next to the exe (docs/internal, docs/public, docs) holds guide/ and limits/ too
  let exe = ''; try { exe = path.dirname(process.execPath); } catch (e) { /* none */ }
  for (const b of [exe, process.cwd()]) if (b) r.push(path.join(b, 'docs', 'internal'), path.join(b, 'docs', 'public'), path.join(b, 'docs'));
  if (exe) r.push(exe);
  r.push(process.cwd());
  return [...new Set(r)];
}
function findDir(name) {
  const looked = [];
  for (const b of roots()) { const d = path.join(b, name); looked.push(d); if (isDir(d)) return { dir: d, looked }; }
  return { dir: null, looked };
}
const langOf = url => { const l = (url.searchParams.get('lang') || 'en').toLowerCase(); return LANGS.includes(l) ? l : 'en'; };

// ---- glossary
function glossary(lang) {
  const base = GLOSS[lang] || GLOSS.en;
  const noloc = lang !== 'en' && !GLOSS[lang];
  const extra = TERMS[lang] || TERMS.en;
  // dir: the guide folder the terms' chapters (t.ch) are in, for the glossary box's Browse (the folder picker; a real path, a picker start only)
  const g = findDir('guide');
  return { lang: noloc ? 'en' : lang, asked: lang, noloc, count: base.length + extra.length, guideCount: base.length, terms: base.concat(extra), dir: g.dir || '' };
}

// ---- guide: md -> plain-text sections
function plain(md) {
  const lines = md.split(/\r?\n/), secs = [];
  let title = '', cur = null, fence = false;
  const clean = s => s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|\s)\*([^*\s][^*]*)\*/g, '$1$2').replace(/<[^>]+>/g, '');
  for (const l of lines) {
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; continue; }
    if (!fence && /^# /.test(l) && !title) { title = clean(l.slice(2)).trim(); continue; }
    if (!fence && /^##+ /.test(l)) { cur = { h: clean(l.replace(/^#+ /, '')).trim(), text: [] }; secs.push(cur); continue; }
    if (!cur) { cur = { h: '', text: [] }; secs.push(cur); }
    cur.text.push(fence ? '    ' + l : clean(l.replace(/^>\s?/, '').replace(/^(\s*)[-*] /, '$1• ')));
  }
  return { title, sections: secs.map(s => ({ h: s.h, text: s.text.join('\n').replace(/\n{3,}/g, '\n\n').trim() })).filter(s => s.h || s.text) };
}
function chapters(lang) {
  const g = findDir('guide');
  if (!g.dir) return { found: false, looked: g.looked.map(mask), chapters: [], topics: TOPICS };
  const files = fs.readdirSync(g.dir).filter(f => /^\d\d-[a-z0-9-]+\.md$/.test(f)).sort();
  const list = files.map(f => {
    let md = ''; try { md = fs.readFileSync(path.join(g.dir, f), 'utf8'); } catch (e) { /* unreadable */ }
    const loc = lang !== 'en' && fs.existsSync(path.join(g.dir, 'i18n', lang, f));
    const t = /^# (.+)$/m.exec(md);
    return { file: f, title: t ? t[1].replace(/`/g, '').trim() : f, sections: (md.match(/^## .+$/gm) || []).map(s => s.slice(3).replace(/`/g, '').trim()), loc };
  });
  return { found: true, where: mask(g.dir), chapters: list, topics: TOPICS };
}
function chapter(file, lang) {
  if (!/^\d\d-[a-z0-9-]+\.md$/.test(file || '')) throw bad('chapter name must look like 03-mod-folder-and-load-order.md');
  const g = findDir('guide');
  if (!g.dir) return { found: false, looked: g.looked.map(mask) };
  let p = path.join(g.dir, file), used = 'en';
  if (lang !== 'en') { const q = path.join(g.dir, 'i18n', lang, file); if (fs.existsSync(q)) { p = q; used = lang; } }
  if (!fs.existsSync(p)) throw bad('no chapter ' + file, 404);
  return Object.assign({ found: true, file, lang: used, fallback: used !== lang, where: mask(g.dir) }, plain(fs.readFileSync(p, 'utf8')));
}

// ---- limits row
function limit(idIn) {
  const m = /^([A-Za-z][A-Za-z0-9]*)-(\d{1,4})$/.exec(String(idIn || '').trim());
  if (!m) throw bad('a limits ID looks like VFS-19 (area, dash, number)');
  const area = m[1].toUpperCase(), ids = [area + '-' + m[2], area + '-' + m[2].padStart(2, '0')];
  // a GH area (Gates of Hell, GHVFS-13) lives, every other area in limits/
  const gh = /^GH/.test(area), base = gh ? 'gohweb/limits/' : 'limits/';
  let l;
  if (gh) { const g = findDir('gohweb'), d = g.dir ? path.join(g.dir, 'limits') : null; l = { dir: d && isDir(d) ? d : null }; }
  else l = findDir('limits');
  if (!l.dir) return { found: false, nofiles: true, id: ids[1] };
  const files = fs.readdirSync(l.dir).filter(f => new RegExp('^' + area + '\\d*\\.md$', 'i').test(f)).sort();
  for (const f of files) {
    const lines = fs.readFileSync(path.join(l.dir, f), 'utf8').split(/\r?\n/);
    const head = (lines.find(x => /^id\s*\|/i.test(x)) || 'id | subject | limit | effect / workaround | tag ref').split('|').map(s => s.trim());
    for (const ln of lines) {
      const c = ln.split('|').map(s => s.trim());
      if (!ids.includes(c[0].toUpperCase())) continue;
      return { found: true, id: c[0], file: base + f, head, cells: c, text: ln.replace(/`/g, '') };
    }
  }
  return { found: false, id: ids[1], searched: files.map(f => base + f) };
}

// ---- every limits ID with its subject (the lookup box's searchKit index and Browse, owner 2026-11-19): limits/,
// kept while the files keep their sizes and times
let IDS = null;
function limitIds() {
  const dirs = [], l = findDir('limits'), g = findDir('gohweb');
  if (l.dir) dirs.push({ dir: l.dir, base: 'limits/', goh: false });
  if (g.dir && isDir(path.join(g.dir, 'limits'))) dirs.push({ dir: path.join(g.dir, 'limits'), base: 'gohweb/limits/', goh: true });
  const files = [];
  for (const d of dirs) for (const f of fs.readdirSync(d.dir).filter(f => /^[A-Z][A-Z0-9]*\.md$/i.test(f) && !/^INDEX\.md$/i.test(f)).sort()) {
    const st = stat(path.join(d.dir, f)); if (st && st.isFile()) files.push({ d, f, sig: f + ':' + st.size + ':' + st.mtimeMs });
  }
  const sig = files.map(x => x.d.base + x.sig).join('|');
  if (IDS && IDS.sig === sig) return IDS.out;
  const rows = [];
  for (const x of files) {
    let t = ''; try { t = fs.readFileSync(path.join(x.d.dir, x.f), 'utf8'); } catch (e) { continue; }
    for (const ln of t.split(/\r?\n/)) {
      const c = ln.split('|').map(s => s.trim());
      const m = /^([A-Z][A-Z0-9]*)-(\d{1,4})$/.exec(c[0] || '');
      if (!m) continue;
      rows.push({ id: c[0], area: m[1], subj: String(c[1] || '').replace(/[`*]/g, '').slice(0, 120), goh: x.d.goh });
    }
  }
  // dirs: the folders the rows were read from (the box's Browse opens the folder picker there; real paths, a picker start only)
  const out = { found: dirs.length > 0, rows, dirs: { as2: l.dir || '', goh: dirs.filter(d => d.goh).map(d => d.dir)[0] || '' } };
  IDS = { sig, out };
  return out;
}

// ---- diagnostics
function docsDirs() {
  if (process.env.AS2_HELP_DOCS) return [process.env.AS2_HELP_DOCS];
  const h = home(), u = process.env.USERPROFILE || h;
  return [...new Set([path.join(u, 'Documents'), path.join(u, 'OneDrive', 'Documents'), path.join(h, 'Documents')])];
}
// Gates of Hell user folder (GHVFS-13 [V] untested): Documents/My Games/Gates of Hell, or %LOCALAPPDATA%/Digitalmindsoft/Gates of Hell
// (with -useLocalDataFolder, or when the Documents path holds /onedrive/); both are looked at. Test hook: AS2_HELP_LOCAL (the LOCALAPPDATA folder)
function localDir() {
  if (process.env.AS2_HELP_LOCAL != null) return process.env.AS2_HELP_LOCAL;
  if (process.env.AS2_HELP_DOCS) return '';   // a test that names its Documents folder never reads the machine's own
  return process.env.LOCALAPPDATA || path.join(home(), 'AppData', 'Local');
}
function newestLog(kind, gid) {
  let best = null;
  const take = f => { const s = stat(f); if (s && s.isFile() && (!best || s.mtimeMs > best.t)) best = { f, t: s.mtimeMs, size: s.size }; };
  if (kind === 'goh') {
    for (const d of docsDirs()) take(path.join(d, 'My Games', 'Gates of Hell', 'log', 'game.log'));
    const la = localDir(); if (la) take(path.join(la, 'Digitalmindsoft', 'Gates of Hell', 'log', 'game.log'));
    return best;
  }
  for (const d of docsDirs()) {
    const mg = path.join(d, 'My Games');
    let ents = []; try { ents = fs.readdirSync(mg); } catch (e) { continue; }
    for (const e of ents) {
      if (!/^Men of War - Assault Squad 2/i.test(e)) continue;
      if (gid === 'mowas2' && / - instance \d+$/i.test(e)) continue;   // only as64.exe -instance N writes those (TST-19: mowas_2 has no -instance)
      take(path.join(mg, e, 'log', 'game.log'));
    }
  }
  return best;
}
function tail(f, n) {
  const fd = fs.openSync(f, 'r');
  try {
    const size = fs.fstatSync(fd).size, len = Math.min(size, 65536), buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    return buf.toString('utf8').split(/\r?\n/).filter((l, i, a) => i < a.length - 1 || l).slice(-n);
  } finally { fs.closeSync(fd); }
}
// kind 'goh': the Gates of Hell rule (GHVFS-02, GHNET-22, GHVFS-27, GHVFS-36 [V] untested): each bound optional, compared with 1.067.x
// tag develop lifts the check, Priority orders, a folder name with a space or one of <>+()[]{}!@#$%^&*-=;:|'" or a byte >= 0x80 is skipped
const GOH_BADNAME = /[\s<>+()[\]{}!@#$%^&*\-=;:|'"]|[^\x00-\x7f]/;
// version words: dotted numbers compared part by part (1.105 > 1.067 > 1.035); a word that is not one ("any") is not compared
const vnum = v => /^\d+(\.\d+)*$/.test(String(v || '').trim());
function vcmp(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}
// the GoH game version in the mod.info form (GHNET-22: exe block 1.0.6.7 = game 1.067.x [I] the mapping): '1.0.6.7-...' -> '1.067'
const gohVer = pe => { const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)/.exec(String(pe || '')); return m ? m[1] + '.' + m[2] + m[3] + m[4] : null; };
const MOWAS2_VER = '3.262';   // the MoW:AS2 data version (tools/lib/games.js mowas2)
const AS64_MODERN = '3.301';  // AS64: a mod with Min at or above this is modern (VFS-19)
function modInfoLine(dir, kind, gver) {
  try {
    const t = fs.readFileSync(path.join(dir, 'mod.info'), 'utf8');
    const g = k => { const m = new RegExp('\\{\\s*' + k + '\\s+"([^"]*)"', 'i').exec(t); return m ? m[1] : null; };
    const parts = ['min ' + (g('MinGameVersion') == null ? '(none)' : JSON.stringify(g('MinGameVersion'))), 'max ' + (g('MaxGameVersion') == null ? '(none)' : JSON.stringify(g('MaxGameVersion')))];
    const rq = [...t.matchAll(/\{\s*Require\s+"([^"]*)"/gi)].map(m => m[1]);
    if (rq.length) parts.push('require ' + rq.join(','));
    if (kind === 'goh') {
      const tags = (g('Tags') || '').split(/\s+/).filter(Boolean), pr = /\{\s*Priority\s+(-?\d+)\s*\}/i.exec(t);
      if (tags.length) parts.push('tags ' + tags.join(' '));
      if (pr) parts.push('priority ' + pr[1]);
      if (GOH_BADNAME.test(path.basename(dir))) parts.push('SKIPPED: the folder name has a space, a sign such as - or +, or a non-ASCII letter (GHVFS-27)');
      if (tags.includes('develop')) parts.push('tag develop: any game version');
      else {
        const mn = g('MinGameVersion'), mx = g('MaxGameVersion'), gv = gver || '1.067';
        if (vnum(mn) && vcmp(mn, gv) > 0) parts.push('REFUSED: MinGameVersion is above the game version ' + gv + (/^3\./.test(mn) ? ' (an AS2 mod.info)' : '') + '; write the GoH numbers or tag develop (GHVFS-02)');
        else if (gver && vnum(mx) && vcmp(mx, gv) < 0) parts.push('REFUSED: MaxGameVersion is below the game version ' + gv + '; write the GoH numbers or tag develop (GHVFS-02)');
      }
      return parts.join(', ');
    }
    // VFS-19 [V]: a legacy mod (Min < 3.301) needs both keys (the data version in [Min,Max]); a modern one (Min >= 3.301)
    // needs Min only on AS64 (Max ignored). mowas_2 has no modern rule: every mod is a range there, so both keys are needed
    const mn = g('MinGameVersion'), mx = g('MaxGameVersion'), modern = vnum(mn) && vcmp(mn, AS64_MODERN) >= 0;
    if (!mn || (!mx && (gver === MOWAS2_VER || !modern))) parts.push('HIDDEN: an empty or missing version hides the mod');
    else if (!mx) parts.push('modern mod: no Max needed (VFS-19)');
    // AS64 legacy rule: the data version 3.262.N must lie in [Min,Max] (VFS-19; Max < 3.262 refused by both)
    if (gver !== MOWAS2_VER && !modern && vnum(mx) && vcmp(mx, MOWAS2_VER) < 0) parts.push('REFUSED: MaxGameVersion is below the data version ' + MOWAS2_VER + ' (VFS-19)');
    if (gver === MOWAS2_VER) {   // MoW:AS2 (mowas_2.exe 3.262): the data version 3.262.N must lie in [Min,Max] (VFS-19); as64+ is AS64's built-in mod only
      if (vnum(mn) && vcmp(mn, MOWAS2_VER) > 0) parts.push('REFUSED: MinGameVersion is above MoW:AS2 ' + MOWAS2_VER + ' (VFS-19)');
      if (vnum(mx) && vcmp(mx, MOWAS2_VER) < 0) parts.push('REFUSED: MaxGameVersion is below MoW:AS2 ' + MOWAS2_VER + ' (VFS-19)');
      if (rq.some(r => /^as64\+$/i.test(r))) parts.push('require as64+ cannot be met in MoW:AS2 (as64+ is the built-in mod of AS64)');
    }
    return parts.join(', ');
  } catch (e) { return 'no mod.info (not a mod: the game skips this folder)'; }
}
function diag(ctx, q) {
  const L = [], now = new Date();
  L.push('ARSENAL diagnostics ' + now.toISOString().slice(0, 16).replace('T', ' '));
  let sea = false; try { sea = require('node:sea').isSea(); } catch (e) { /* older node */ }
  L.push('tools: ' + (sea ? 'single exe' : 'source folder') + ', node ' + process.version + ', ' + process.platform);
  // the page's game (ctx.kind of gui.js from the x-arsenal-game header; else the page's kind word; none = AS2 as before)
  let kind = 'as2', gid = '';
  try { if (ctx && typeof ctx.kind === 'function') kind = ctx.kind() === 'goh' ? 'goh' : 'as2'; else if (q.kind === 'goh') kind = 'goh'; } catch (e) { /* as2 */ }
  try { if (ctx && typeof ctx.gameId === 'function') gid = ctx.gameId() || ''; } catch (e) { /* none */ }
  if (kind === 'goh' && !gid) gid = 'goh';
  if (gid && gid !== 'as64') L.push('game: ' + ({ mowas2: 'MoW:AS2 (mowas_2.exe)', goh: 'Gates of Hell (call_to_arms.exe)' }[gid] || gid));
  let game = q.game || null, how = 'picked in the page', looked = [], gver = gid === 'mowas2' ? MOWAS2_VER : null;
  if (!game && kind === 'goh') {
    try { game = ctx && typeof ctx.gohDir === 'function' ? ctx.gohDir() : null; } catch (e) { game = null; }
    if (game) how = 'GoH setting';
    else looked = [['GoH', 'no Gates of Hell folder set (Settings, or the Steam library)']];
  }
  if (!game && kind !== 'goh') {
    let r = null; try { r = ctx && ctx.gamedir && ctx.gamedir.resolve ? ctx.gamedir.resolve() : null; } catch (e) { r = null; }
    if (r && r.dir) { game = r.dir; how = { arg: 'command line', env: 'AS2_GAME setting', 'as2.json': 'as2.json file', steam: 'Steam library' }[r.source] || r.source; }
    else { if (!r && ctx && ctx.game) { try { game = ctx.game(); how = 'GUI setting'; } catch (e) { game = null; } } looked = (r && r.looked) || []; }
  }
  L.push('', '[game folder]');
  if (game && isDir(game)) {
    L.push('found: ' + mask(game) + ' (via ' + how + ')');
    for (const x of kind === 'goh' ? ['binaries/x64/call_to_arms.exe'] : ['as64.exe', 'mowas_2.exe']) { const s = stat(path.join(game, x)); L.push(x + ': ' + (s ? 'present, ' + s.size + ' bytes, ' + new Date(s.mtimeMs).toISOString().slice(0, 10) : 'missing')); }
    if (kind === 'goh') {   // the version the mod.info bounds are compared with (GHNET-22): the exe's own ProductVersion
      let v = null; try { v = require('../../../lib/gamever').read(game, 'goh'); } catch (e) { v = null; }
      gver = gohVer(v);
      L.push('game version: ' + (v || 'unknown') + (gver ? ' = ' + gver : '') + ' (mod.info bounds compare against 1.067.x; tag develop lifts the check)');
    }
    const md = path.join(game, 'mods');
    L.push('', '[mods folder] ' + mask(md));
    let mods = []; try { mods = fs.readdirSync(md).filter(n => isDir(path.join(md, n))).sort(); } catch (e) { L.push('no mods folder'); }
    if (!mods.length && isDir(md)) L.push('(empty)');
    for (const n of mods.slice(0, 60)) L.push('- ' + n + ': ' + modInfoLine(path.join(md, n), kind, gver));
    if (mods.length > 60) L.push('... ' + (mods.length - 60) + ' more');
  } else {
    L.push(game ? 'not found: ' + mask(game) + ' is not a folder' : 'not found');
    for (const [k, v] of looked) L.push('  looked at ' + k + ': ' + mask(v));
  }
  L.push('', '[current mod]');
  if (q.mod && isDir(q.mod)) {
    L.push(mask(q.mod));
    const p = path.join(q.mod, 'mod.info');
    if (fs.existsSync(p)) { const t = fs.readFileSync(p, 'utf8'); L.push('mod.info:'); t.slice(0, 2000).split(/\r?\n/).forEach(l => l.trim() && L.push('  ' + l)); L.push('summary: ' + modInfoLine(q.mod, kind, gver)); }
    else L.push('no mod.info in this folder');
  } else L.push(q.mod ? 'not a folder: ' + mask(q.mod) : 'none picked');
  L.push('', '[newest game.log]');
  const g = newestLog(kind, gid);
  if (g) {
    L.push(mask(g.f) + ' (' + g.size + ' bytes, written ' + new Date(g.t).toISOString().slice(0, 16).replace('T', ' ') + ')');
    try { tail(g.f, 40).forEach(l => L.push('  ' + mask(l))); } catch (e) { L.push('could not read: ' + e.code); }
  } else if (kind === 'goh') L.push('none found under Documents\\My Games\\Gates of Hell\\log or %LOCALAPPDATA%\\Digitalmindsoft\\Gates of Hell\\log (the game writes it on first start)');
  else L.push('none found under Documents\\My Games\\Men of War - Assault Squad 2*\\log (the game writes it on first start)');
  return { text: L.join('\r\n'), lines: L.length };
}

const routes = {
  'GET /api/x/help/glossary': async url => glossary(langOf(url)),
  'GET /api/x/help/chapters': async url => chapters(langOf(url)),
  'GET /api/x/help/chapter': async url => chapter(url.searchParams.get('file'), langOf(url)),
  'GET /api/x/help/limit': async url => limit(url.searchParams.get('id')),
  'GET /api/x/help/limitids': async () => limitIds(),
  'GET /api/x/help/diag': async (url, body, ctx) => diag(ctx, { mod: url.searchParams.get('mod') || '', game: url.searchParams.get('game') || '', kind: url.searchParams.get('kind') || '' }),
};
module.exports = { routes, glossary, chapters, chapter, limit, limitIds, diag, plain, mask, TOPICS };
