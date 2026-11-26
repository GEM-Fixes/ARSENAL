// GUI-EXT share: server side. Every route is small and plain: it reads, plans, or writes ONLY into a folder the user picked.
// mod.info is edited line by line on its raw bytes (latin1 round trip): lines we do not touch keep their bytes, new text is UTF-8, line ends CRLF.
// Author: Imperator_Aug (ARSENAL, ia-29c35d59)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const gamever = require('../../../lib/gamever'), WG = require('../../../lib/writeguard'), cipath = require('../../../lib/cipath');
// root + rel ignoring letter case as the game does (Linux/macOS); exact path first, so Windows gets the plain join. Fresh listings
// per call (long-running server). mod.info is also written through it: an existing Mod.info is rewritten, never a 2nd case variant.
const ciJoin = (root, rel, fsx) => cipath.resolve(root, rel, { cache: new Map(), fs: fsx }) || path.join(root, rel);
const infoOf = d => ciJoin(d, 'mod.info');

const MAX_PREVIEW = 1024 * 1024;               // Workshop preview must stay under 1 MB
const KEYS = ['Name', 'Desc', 'Version', 'MinGameVersion', 'MaxGameVersion'];
const RANGES = { classic: { min: '3.262.0', max: '3.262.1' }, enhanced: { min: '3.301', max: '' } };

// game parity (the page's game: ctx.gameId as64 | mowas2 | goh; nothing sent = as64, everything as before).
// MoW:AS2 = the AS64 page 1:1 on the same install, but its tools get --exe (the vfs picks as64 in the shared folder otherwise), its card
// names mowas_2.exe, and only the Classic range is offered (mowas_2 reads no modern range: Enhanced 3.301 is skipped by it [I]).
// GoH: the GoH install (ctx.curDir), mod.info as GoH reads it [V]):
// one range = the exe's own version as Min with an open Max (GHNET-22, PORT-46; template mod.info: Max may be left out), the Tags word
// develop lifts the version check (GHVFS-02), existing key spelling kept, new keys spelled as the GoH template (name, desc, tags,
// minGameVersion, maxGameVersion). Writes inside the GoH install get the writeguard refusal (settled: no write there).
const gidOf = ctx => { const g = ctx && typeof ctx.gameId === 'function' && ctx.gameId(); return g === 'mowas2' || g === 'goh' ? g : 'as64'; };
const isGohCtx = ctx => gidOf(ctx) === 'goh';
// the folder of the request's game: the GoH install under goh, else the AS2 install (ctx.game, unchanged)
function gameOf(ctx) {
  if (isGohCtx(ctx)) { try { return (typeof ctx.curDir === 'function' ? ctx.curDir() : ctx.gohDir && ctx.gohDir()) || null; } catch (e) { return null; } }
  return ctx.game ? ctx.game() : null;
}
// --exe for a tool that reads game data through the vfs: only when the game is not as64 (the AS64 argument list stays as it is)
// CACHE (gui README contract 1): after a write into a mod folder the shared walk (lib/modtree) is told, so the next reader scans again
const touchMod = (ctx, dir) => { try { ((ctx && ctx.modtree) || require('../../../lib/modtree')).touch(dir); } catch (e) { /* nothing kept */ } };
const exeArgs = ctx => (gidOf(ctx) === 'as64' ? [] : ['--exe', (typeof ctx.exe === 'function' && ctx.exe()) || require('../../../lib/games').exeOf(gidOf(ctx))]);
// GoH data version as mod.info compares it: exe 1.0.6.7 -> "1.067" (as modinfo.js reads it); unreadable -> 1.067 (GHNET-22)
function gohVersion(dir) {
  let v = null; try { v = dir ? gamever.read(dir, 'goh') : null; } catch (e) { v = null; }
  const m = /^(\d+)\.(\d)\.(\d)\.(\d)/.exec(v || '');
  return m ? m[1] + '.' + m[2] + m[3] + m[4] : '1.067';
}
function rangesFor(ctx) {
  const id = gidOf(ctx);
  if (id === 'mowas2') return { classic: RANGES.classic };
  if (id === 'goh') return { goh: { min: gohVersion(gameOf(ctx)), max: '' } };
  return RANGES;
}
const GOH_KEY = { Name: 'name', Desc: 'desc', Version: 'Version', MinGameVersion: 'minGameVersion', MaxGameVersion: 'maxGameVersion', Tags: 'tags' };
// GoH folder name rule (gohweb vfs/goh-modinfo-version-rule [V]): a byte >= 0x80, a space or one of <>+()[]{}!@#$%^&*-=;:|'"
// and GoH skips the folder ("invalid mod folder name", game.log only)
const gohBadFolder = n => /[^\x00-\x7f]|[ <>+()[\]{}!@#$%^&*\-=;:|'"]/.test(n);
const tagWords = s => String(s || '').split(/\s+/).filter(Boolean);
const SKIP_DIR = new Set(['.git', '.github', '.vscode', '.idea', 'node_modules', '__macosx']);
const SKIP_FILE = /^(upgrade\.md|\.gitignore|\.gitattributes|thumbs\.db|desktop\.ini|goh-origin\.tsv\.bak|notes?([._ -].*)?|todo([._ -].*)?|.*\.(bak|tmp|orig|log))$/i;

// key + params: the page shows a translated text (share.refuse.<key>) instead of the English message (GUI rule)
const bad = (m, status, key, params) => Object.assign(new Error(m), { status: status || 400 }, key ? { key, params: params || {} } : {});
const norm = p => path.resolve(String(p)).replace(/\\/g, '/');
const low = p => norm(p).toLowerCase();
const inside = (c, p) => { c = low(c); p = low(p); return c === p || c.startsWith(p.replace(/\/$/, '') + '/'); };

function modDir(p, needInfo) {
  if (typeof p !== 'string' || !p.trim()) throw bad('pick a mod folder first');
  const d = norm(p);
  if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) throw bad('mod folder not found: ' + d);
  if (needInfo !== false && !fs.existsSync(infoOf(d))) throw bad('this folder has no mod.info, so it is not a mod: ' + d);
  return d;
}
// where we may write: not the game folder (except <game>/mods/<mod>), never a Steam folder (Workshop, GoH)
function writableMod(d, ctx) {
  const g = gameOf(ctx);
  if (/\/steamapps\//i.test(low(d) + '/') && !(g && inside(d, g + '/mods')) && WG.refuseWrite(d, { game: g })) throw bad('refused: this folder is inside a Steam library (game, Workshop or GoH). Pick a mod folder of your own.');
  if (g && inside(d, g) && !inside(d, g + '/mods')) throw bad('refused: not inside the game folder, only a mod folder in <game>/mods may change.');
  if (g && low(d) === low(g + '/mods')) throw bad('refused: that is the whole mods folder, pick one mod.');
  const why = WG.refuseWrite(d, { game: g, purpose: 'change the mod' });   // I-3: by content (any AS2 install, GoH, Workshop), whatever game is set
  if (why) throw bad(why);
  return d;
}
function writableOut(out, mod, ctx) {
  if (typeof out !== 'string' || !out.trim()) throw bad('pick a folder to write into', 400, 'need');
  const o = norm(out), g = gameOf(ctx), P ={ out: o, mod: mod ? norm(mod) : '', game: g ? norm(g) : '' };
  // GT-22: name both folders (checked first: the most exact reason)
  if (mod && (inside(o, mod) || inside(mod, o))) throw bad('refused: the output folder ' + o + ' and the mod folder ' + P.mod + ' must be separate (not one inside the other).', 400, 'sep', P);
  if (g && inside(o, g)) throw bad('refused: never write into the game folder (' + P.game + '). You picked ' + o + '. Pick another place (for example your Desktop).', 400, 'game', P);
  if (/\/steamapps\//i.test(low(o) + '/')) throw bad('refused: not into a Steam folder (' + o + '). Pick another place.', 400, 'steam', P);
  if (fs.existsSync(infoOf(o))) throw bad('refused: ' + o + ' is a mod folder itself (it has a mod.info). Pick a plain folder, for example on your Desktop.', 400, 'isMod', P);
  const why = WG.refuseWrite(o, { game: g, allowGameMods: false, purpose: 'write the copy' });   // I-3, I-4: GoH or game folders by content, whatever game the request names
  if (why) throw bad(why, 400, /Gates of Hell/i.test(why) ? 'goh' : 'gameLike', P);
  if (fs.existsSync(o) && !fs.statSync(o).isDirectory()) throw bad('refused: ' + o + ' is a file, not a folder. Pick a folder to write into.', 400, 'file', P);   // I-14
  return o;
}

// ---------- mod.info ----------
const reKey = k => new RegExp('\\{\\s*' + k + '\\s+"((?:[^"\\\\]|\\\\.)*)"\\s*\\}', 'i');
const fromRaw = s => Buffer.from(s, 'latin1').toString('utf8').replace(/\\"/g, '"').replace(/\\n/g, '\n');
const toRaw = s => Buffer.from(String(s).replace(/\r\n?/g, '\n').replace(/"/g, '\\"').replace(/\n/g, '\\n'), 'utf8').toString('latin1');
const stripComment = l => (/^\s*;/.test(l) ? '' : l);
// goh: Tags is a key of its own (read into f.Tags, not listed under other lines); as2: Tags stays an other line (AS2 ignores it, VFS-20)
function readInfo(d, opt) {
  const goh = !!(opt && opt.goh);
  const raw = fs.readFileSync(infoOf(d)).toString('latin1').replace(/^\xEF\xBB\xBF/, '');
  const lines = raw.split(/\r\n|\r|\n/), f = {}, other = [];
  for (const k of KEYS) {
    f[k] = ''; f['has' + k] = false;
    for (const l of lines) { const m = reKey(k).exec(stripComment(l)); if (m) { f[k] = fromRaw(m[1]); f['has' + k] = true; break; } }
  }
  f.FileId = ''; for (const l of lines) { const m = reKey('FileId').exec(stripComment(l)); if (m) { f.FileId = m[1]; break; } }
  if (goh) { f.Tags = ''; for (const l of lines) { const m = reKey('Tags').exec(stripComment(l)); if (m) { f.Tags = fromRaw(m[1]); break; } } }
  const own = KEYS.concat(['FileId', 'mod'], goh ? ['Tags'] : []);
  for (const l of lines) { if (!l.trim()) continue; const m = /\{\s*(\w+)/.exec(stripComment(l)); if (m && !own.some(k => k.toLowerCase() === m[1].toLowerCase())) other.push(l.trim()); }
  return { raw, f, other };
}
// opt.goh: also Tags; an empty MinGameVersion or Tags removes the line (GoH: each bound optional); a changed line keeps its own key
// spelling, a new line takes the GoH template's (GOH_KEY). Without opt everything is as before (AS64 bytes unchanged).
function applyInfo(raw, want, opt) {
  const goh = !!(opt && opt.goh);
  let lines = raw.split(/\r\n|\r|\n/);
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  const changes = [];
  for (const k of goh ? KEYS.concat(['Tags']) : KEYS) {
    if (typeof want[k] !== 'string') continue;
    const v = want[k], re = reKey(k);
    let at = -1; for (let i = 0; i < lines.length; i++) if (re.test(stripComment(lines[i]))) { at = i; break; }
    if (at >= 0) {
      const old = fromRaw(re.exec(lines[at])[1]);
      const spell = goh ? (/\{\s*(\w+)/.exec(lines[at].slice(lines[at].search(re))) || [])[1] || GOH_KEY[k] : k;
      if (v === '' && (k === 'MaxGameVersion' || k === 'Version' || k === 'Desc' || goh && (k === 'MinGameVersion' || k === 'Tags'))) { lines.splice(at, 1); changes.push({ key: k, from: old, to: '' }); }
      else if (old !== v) { lines[at] = lines[at].replace(re, () => '{' + spell + ' "' + toRaw(v) + '"}'); changes.push({ key: k, from: old, to: v }); }
    } else if (v !== '') {
      let close = -1; for (let i = lines.length - 1; i >= 0; i--) if (/^\s*\}\s*$/.test(lines[i])) { close = i; break; }
      const ln = '\t{' + (goh ? GOH_KEY[k] : k) + ' "' + toRaw(v) + '"}';
      if (close < 0) { lines = ['{mod'].concat(lines.map(x => '	' + x), [ln, '}']); } else lines.splice(close, 0, ln);
      changes.push({ key: k, from: '', to: v });
    }
  }
  return { text: lines.join('\r\n') + '\r\n', changes };
}
function checkFields(w) {
  const warn = [];
  if (typeof w.Name === 'string') {
    if (!w.Name.trim()) throw bad('the name cannot be empty');
    if (/["{}\\\r\n]/.test(w.Name)) throw bad('the name may not hold quotes, braces, backslashes or line breaks');
    if (/[^\x20-\x7e]/.test(w.Name)) warn.push('name_ascii');
    if (w.Name.length > 200) throw bad('the name is ' + w.Name.length + ' characters long; keep it to 200 or less (60 shows best in the game list)');   // I-21
    if (w.Name.length > 60) warn.push('name_long');
  }
  if (typeof w.Desc === 'string' && Buffer.byteLength(w.Desc, 'utf8') > 8000) throw bad('the description is longer than 8000 bytes (the Workshop limit)');
  for (const k of ['Version', 'MinGameVersion', 'MaxGameVersion']) if (typeof w[k] === 'string' && w[k] !== '' && !/^\d+(\.\d+){0,3}$/.test(w[k].trim())) throw bad(k + ' must be numbers with dots, like 1.2 or 3.301');
  for (const k of ['Version', 'MinGameVersion', 'MaxGameVersion']) if (typeof w[k] === 'string') w[k] = w[k].trim();
  return warn;
}
// ranges = the page game's offer (rangesFor); none given = the AS64 table, as before. GoH: goh (its own Min, open Max), none or custom
function rangeKind(f, ranges) {
  const mn = f.MinGameVersion, mx = f.MaxGameVersion;
  if (!mn && !mx) return 'none';
  if (ranges && ranges.goh) return mn === ranges.goh.min && !mx ? 'goh' : 'custom';
  if (mn === RANGES.classic.min && mx === RANGES.classic.max) return 'classic';
  if (mn === RANGES.enhanced.min && !mx) return 'enhanced';
  const m = /^(\d+)\.(\d+)/.exec(mn || '');
  if (m && (+m[1] > 3 || +m[1] === 3 && +m[2] >= 301)) return 'enhancedOther';
  if (m) return 'classicOther';
  return 'custom';
}

// ---------- preview picture ----------
function imageKind(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  return '';
}
function previewState(d) {
  for (const n of ['preview.jpg', 'preview.jpeg', 'preview.png', 'preview.gif']) {
    const p = path.join(d, n);
    if (fs.existsSync(p)) {
      const b = fs.readFileSync(p), kind = imageKind(b), size = b.length, ext = path.extname(n).slice(1).toLowerCase().replace('jpeg', 'jpg');
      const problem = size >= MAX_PREVIEW ? 'big' : !kind ? (ext === 'gif' ? '' : 'type') : kind !== ext ? 'ext' : '';
      return { file: n, size, kind: kind || ext, problem };
    }
  }
  return null;
}

// ---------- reading tool output ----------
function findings(text) {
  const out = [];
  for (const l of String(text).split(/\r?\n/)) {
    const m = /^(info: )?(.*?)(?::(\d+))?: ([A-Z][A-Z0-9_]+) (.*)$/.exec(l);
    if (m) out.push({ info: !!m[1], where: m[2], line: m[3] ? +m[3] : 0, code: m[4], msg: m[5] });
  }
  return out;
}
const lastLine = t => String(t || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(-1)[0] || '';
const tail = (t, n) => String(t || '').split(/\r?\n/).filter(Boolean).slice(-n).join('\n');
const toolFile = (ctx, entry) => { try { return fs.existsSync(path.join(ctx.tools, entry)); } catch (e) { return true; } };

// ---------- file walking (for the clean copy and "what changed") ----------
function walk(root, rel, out, skipped) {
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { if (SKIP_DIR.has(e.name.toLowerCase())) { skipped.push(r + '/'); continue; } walk(root, r, out, skipped); }
    else if (e.isFile()) { if (SKIP_FILE.test(e.name)) { skipped.push(r); continue; } out.push(r); }
  }
}
function listMod(d) { const files = [], skipped = []; walk(d, '', files, skipped); return { files: files.sort(), skipped: skipped.sort() }; }
const sha = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const gohOrigin = d => { const p = path.join(d, 'GOH-ORIGIN.tsv'); if (!fs.existsSync(p)) return 0; return Math.max(1, fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(l => l.trim() && !/^#/.test(l)).length - 1); };

// ---------- routes ----------
const routes = {};

routes['GET /api/x/share/mods'] = async (url, body, ctx) => {
  const g = gameOf(ctx), goh = isGohCtx(ctx);
  if (!g) return { game: null, mods: [] };
  const root = path.join(g, 'mods'), mods = [];
  let names = []; try { names = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort(); } catch (e) { /* none */ }
  for (const n of names) {
    const d = path.join(root, n);
    if (!fs.existsSync(infoOf(d))) continue;
    let f = {}; try { f = readInfo(d, { goh }).f; } catch (e) { /* unreadable */ }
    mods.push({ folder: n, name: f.Name || '', version: f.Version || '', min: f.MinGameVersion || '', max: f.MaxGameVersion || '' });
  }
  return goh ? { game: g.replace(/\\/g, '/'), mods, gid: 'goh' } : { game: g.replace(/\\/g, '/'), mods };
};

routes['GET /api/x/share/info'] = async (url, body, ctx) => {
  const d = modDir(url.searchParams.get('mod')), goh = isGohCtx(ctx), ranges = rangesFor(ctx);
  const { f, other } = readInfo(d, { goh }), pv = previewState(d), g = gameOf(ctx);
  const folder = path.basename(d);
  const warns = [];
  if (f.FileId && f.Name && f.Name.toLowerCase() !== folder.toLowerCase()) warns.push('folder_name');
  if (goh && gohBadFolder(folder)) warns.push('goh_folder');
  const out = {
    mod: d, folder, fields: { Name: f.Name, Desc: f.Desc, Version: f.Version, MinGameVersion: f.MinGameVersion, MaxGameVersion: f.MaxGameVersion }, has: { Name: f.hasName, Version: f.hasVersion },
    fileId: f.FileId, other, range: rangeKind(f, gidOf(ctx) === 'as64' ? undefined : ranges), ranges, preview: pv, goh: gohOrigin(d), upgraded: fs.existsSync(path.join(d, 'UPGRADE.md')), warns,
    inGame: !!(g && inside(d, g + '/mods')),
  };
  if (gidOf(ctx) !== 'as64') out.gid = gidOf(ctx);
  if (goh) { out.tags = f.Tags; out.develop = tagWords(f.Tags).some(w => w.toLowerCase() === 'develop'); }
  return out;
};

// preview = what would change; write:true = write it. GoH: develop (true/false) adds or drops the word develop in Tags, other words kept
routes['POST /api/x/share/info'] = async (url, body, ctx) => {
  body = body || {};
  const goh = isGohCtx(ctx);
  const d = modDir(body.mod), want = {};
  for (const k of KEYS) if (typeof (body.fields || {})[k] === 'string') want[k] = body.fields[k];
  const warn = checkFields(want);
  const cur = readInfo(d, { goh });
  if (goh && typeof body.develop === 'boolean') {
    const has = tagWords(cur.f.Tags).some(x => x.toLowerCase() === 'develop');
    if (body.develop !== has) {   // only a real change touches the line
      const w = tagWords(cur.f.Tags).filter(x => x.toLowerCase() !== 'develop');
      if (body.develop) w.push('develop');
      want.Tags = w.join(' ');
    }
  }
  const r = applyInfo(cur.raw, want, goh ? { goh } : undefined);
  const nameChanged = !!(cur.f.FileId && typeof want.Name === 'string' && cur.f.Name && want.Name !== cur.f.Name);
  const knownChanged = !!(cur.f.FileId && typeof body.knownName === 'string' && body.knownName && typeof want.Name === 'string' && want.Name !== body.knownName);
  const res = { changes: r.changes, warn, nameChanged: nameChanged || knownChanged, fileId: cur.f.FileId, wrote: false, bytes: Buffer.byteLength(r.text, 'latin1') };
  if (body.write) {
    writableMod(d, ctx);
    if (!r.changes.length) return Object.assign(res, { nothing: true });
    fs.writeFileSync(infoOf(d), Buffer.from(r.text, 'latin1'));
    res.wrote = true; touchMod(ctx, d);
  }
  return res;
};

// picture: check only (write:false) or copy into the mod as preview.png / preview.jpg
routes['POST /api/x/share/preview'] = async (url, body, ctx) => {
  body = body || {};
  const d = modDir(body.mod);
  if (typeof body.from !== 'string' || !body.from.trim()) throw bad('pick a picture file');
  const src = norm(body.from);
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) throw bad('picture not found: ' + src);
  const st = fs.statSync(src);
  if (st.size >= MAX_PREVIEW) return { ok: false, why: 'big', size: st.size };
  const b = fs.readFileSync(src), kind = imageKind(b);
  if (!kind) return { ok: false, why: 'type', size: st.size };
  const name = 'preview.' + kind;
  const res = { ok: true, size: st.size, kind, name, wrote: false };
  if (body.write) {
    writableMod(d, ctx);
    for (const n of ['preview.jpg', 'preview.jpeg', 'preview.png', 'preview.gif']) if (n !== name && fs.existsSync(path.join(d, n))) res.replaced = (res.replaced || []).concat(n);
    for (const n of res.replaced || []) fs.unlinkSync(path.join(d, n));
    fs.writeFileSync(path.join(d, name), b);
    res.wrote = true; touchMod(ctx, d);
  }
  return res;
};

// JOBS: a request stopped from the footer. Every route returns this right after a cancelled ctx.runTool (the dispatcher answers 499
// whatever comes back), before it reads the tool's output or writes anything. writes(ctx): the footer asks twice before stopping.
const STOPPED = { cancelled: true };
const writes = ctx => { if (ctx && ctx.job) ctx.job.writes = true; };

// ready to share? plain pass / warn / fail list
routes['POST /api/x/share/gate'] = async (url, body, ctx) => {
  body = body || {};
  const d = modDir(body.mod), items = [], add = (id, status, detail, extra) => items.push(Object.assign({ id, status, detail: detail || '' }, extra || {}));
  const id = gidOf(ctx), goh = id === 'goh';
  const { f } = readInfo(d, { goh }), g = gameOf(ctx);
  // 1 mod.info (GoH: the GoH keys and version gate, modinfo --goh, the version read from the GoH exe through --game)
  // MoW:AS2: --exe mowas_2 (the 3.262 rules: Min >= 3.301 is VER_RANGE there); AS64 as before ([d] only)
  const mi = await ctx.runTool('modinfo', 'modinfo/modinfo.js', goh ? [d, '--goh'].concat(g ? ['--game', g] : []) : [d].concat(exeArgs(ctx)));
  if (mi.cancelled) return STOPPED;   // JOBS: stopped from the footer (the dispatcher answers 499)
  // 'info: ' lines (e.g. GOH_DEVELOP) are notes, never a blocker
  const mf = findings(mi.stdout + '\n' + mi.stderr).filter(x => !x.info && !(x.code === 'UNKNOWN_KEY' && /"version"/i.test(x.msg)));
  const verBad = mf.filter(x => /^VER_/.test(x.code)), otherBad = mf.filter(x => !/^VER_/.test(x.code));
  // N2-8: WARN_* findings are a warning, not a blocker
  const infoBlock = otherBad.filter(x => !/^WARN_/.test(x.code)), infoShow = infoBlock.length ? infoBlock : otherBad;
  add('info', infoBlock.length ? 'fail' : otherBad.length ? 'warn' : 'pass', infoShow.slice(0, 3).map(x => x.code + ' ' + x.msg).join('; '));
  add('range', verBad.length ? 'fail' : 'pass', verBad.slice(0, 2).map(x => x.msg).join('; '));
  add('name', f.Name ? 'pass' : 'fail');
  add('desc', f.Desc ? 'pass' : 'warn');
  add('version', f.Version ? 'pass' : 'warn');
  const pv = previewState(d);
  add('preview', !pv ? 'warn' : pv.problem ? 'fail' : 'pass', pv ? pv.file + ' ' + Math.round(pv.size / 1024) + ' KB' + (pv.problem ? ' (' + pv.problem + ')' : '') : '');
  // junk
  const lm = listMod(d), junk = lm.skipped.filter(x => !/^\./.test(path.basename(x)) || /^\.git/.test(x));
  add('junk', junk.length ? 'warn' : 'pass', junk.slice(0, 8).join(', '));
  // GoH only: a folder name GoH skips (byte >= 0x80, space, - and the other signs; [V])
  if (goh) add('folder', gohBadFolder(path.basename(d)) ? 'fail' : 'pass', gohBadFolder(path.basename(d)) ? path.basename(d) : '');
  // GoH origin + publish gate
  const gohO = gohOrigin(d);
  let pub = { code: 0, stdout: '', stderr: '' };
  if (toolFile(ctx, 'release-check/release-check.js')) pub = await ctx.runTool('release-check', 'release-check/release-check.js', ['--publish', d], { timeoutMs: 60000 });
  if (pub.cancelled) return STOPPED;   // JOBS: stopped from the footer (the dispatcher answers 499)
  add('goh', gohO || pub.code === 1 ? 'fail' : 'pass', gohO || pub.code === 1 ? lastLine(pub.stdout) || 'GOH-ORIGIN.tsv' : '');
  // pack plan (GoH: packer --goh, the GoH mod layout: GHVFS-04)
  const pk = await ctx.runTool('packer', 'packer/packer.js', [d, '--dry'].concat(goh ? ['--goh'] : []), { timeoutMs: 120000 });
  if (pk.cancelled) return STOPPED;   // JOBS: stopped from the footer (the dispatcher answers 499)
  const pf = findings(pk.stdout).filter(x => !x.info && !/^PACK_(GOH|PRIVATE)/.test(x.code));
  add('pack', pk.code !== 0 && !gohO ? 'fail' : pf.length ? 'warn' : 'pass', pf.slice(0, 4).map(x => x.code + ' ' + x.where).join('; ') || (pk.code ? tail(pk.stdout, 2) : ''));
  // deeper checks (needs the game folder; bounded). MoW:AS2: check --exe mowas2 (its verdict, not as64's); GoH: check --exe goh --goh <GoH>
  // the check item is kept in memory while the mod (modtree 'all' signature) and the game stamp stand: the gate asked again on an
  // unchanged mod answers at once (cold it is the minute of check; no ctx.gameview = nothing kept; body.fresh = run again)
  const gk = JSON.stringify([low(d), id, g ? low(g) : '']), gs = g && body.deep !== false ? gameStamp(ctx, g) : '';
  const sg = gs ? await togScan(ctx, [d]) : null, gst = sg ? gs + '|' + sg.join('|') : '', gkept = gst && body.fresh !== true ? GATE_KEPT.get(gk) : null;
  if (gkept && gkept.stamp === gst) items.push(Object.assign({}, gkept.item, { kept: true }));
  else if (g && body.deep !== false && toolFile(ctx, 'check/check.js')) {
    // GT-02: the status comes from check's own overall result (--json overall.verdict), never from reading its text. The VERDICT
    // lines name only the load verdict, so a mod with crash findings and a LOADS_STATIC verdict passed here while Check said crash.
    // ok = pass, crash or refused = fail, unfinished (or no result file) = warn. The page translates the first line by the verdict and
    // shows the plain finding lines under it; the tool's own text goes behind a Details fold.
    const jf = path.join(require('os').tmpdir(), 'arsenal-share-check-' + process.pid + '-' + crypto.randomBytes(4).toString('hex') + '.json');
    let ck = { code: 2, stdout: '', stderr: '' }, rep = null;
    try {
      // --target = the page's game, so the verdict is the one Mods > Check and the CLI give for that game (as64: as before, no --target)
      const ca = id === 'goh' ? [d, '--fast', '--exe', 'goh', '--target', 'goh', '--goh', g, '-q', '--json', jf] : id === 'mowas2' ? [d, '--fast', '--game', g, '--exe', 'mowas2', '--target', 'mowas2', '-q', '--json', jf] : [d, '--fast', '--game', g, '-q', '--json', jf];
      ca.push('--pass-limit', '600');   // check has no time limit of its own; this page stops it after 100 s, so its wouldload passes keep theirs
      ck = await ctx.runTool('check', 'check/check.js', ca, { timeoutMs: 100000 });
      try { rep = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch (e) { rep = null; }   // no file: check stopped before its result (exit 2)
    } finally { try { fs.unlinkSync(jf); } catch (e) { /* not written */ } }
    if (ck.cancelled) return STOPPED;   // JOBS: stopped from the footer (the dispatcher answers 499)
    const ov = rep && rep.overall && rep.overall.verdict ? rep.overall : null;
    const verdict = ov ? ov.verdict : ck.timedOut ? 'timeout' : 'unfinished';
    const status = verdict === 'ok' ? 'pass' : verdict === 'crash' || verdict === 'refused' ? 'fail' : 'warn';
    const plain = rep && Array.isArray(rep.plain) ? rep.plain.slice(1, 41).map(String) : [];
    add('check', status, ov ? ov.text : lastLine(ck.stderr) || lastLine(ck.stdout), {
      verdict, target: ov ? ov.target : '', crash: ov ? ov.crash || 0 : 0, silent: ov ? ov.silent || 0 : 0, plain,
      full: tail(String(ck.stdout || '') + '\n' + String(ck.stderr || ''), 400),
    });
    if (gst && ov) { GATE_KEPT.delete(gk); GATE_KEPT.set(gk, { stamp: gst, item: items[items.length - 1] }); while (GATE_KEPT.size > 6) GATE_KEPT.delete(GATE_KEPT.keys().next().value); }
  } else add('check', 'skip', g ? '' : 'no game folder');
  const fails = items.filter(i => i.status === 'fail').length, warns = items.filter(i => i.status === 'warn').length;
  return { mod: d, ready: !fails, fails, warns, items };
};

// package for friends: plan (write:false) then write into a folder the user picked
// GT-08: the package is a ready mod folder <out>/<mod folder>/ (mod.info, resource/*.pak, loose files), packer --package.
// GT-23: every answer names the mod being packed. GT-22: a refused folder comes back as { refused: { key, params } } naming both folders.
function walkAll(root) { const out = []; (function w(dir, rel) { let es = []; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; } for (const e of es) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) w(path.join(dir, e.name), r); else out.push(r); } })(root, ''); return out.sort(); }
function modLabel(d) { let f = {}; try { f = readInfo(d).f; } catch (e) { /* no or unreadable mod.info */ } return { path: d, folder: path.basename(d), name: f.Name || '', version: f.Version || '' }; }
const refusal = e => ({ key: e.key || 'other', params: e.params || {}, msg: e.message });
routes['POST /api/x/share/outcheck'] = async (url, body, ctx) => {
  body = body || {};
  const d = modDir(body.mod), mod = modLabel(d);
  try { const o = writableOut(body.out, d, ctx); return { ok: true, mod, out: o, dest: norm(path.join(o, mod.folder)) }; }
  catch (e) { if (!e.key) throw e; return { ok: false, mod, refused: refusal(e) }; }
};
// where the folder picker starts for "Folder to write into": the user's Desktop (else home), never the game list (GT-22)
routes['GET /api/x/share/outstart'] = async () => {
  const home = require('os').homedir(), desk = path.join(home, 'Desktop');
  return { dir: norm(fs.existsSync(desk) ? desk : home) };
};
routes['POST /api/x/share/package'] = async (url, body, ctx) => {
  body = body || {};
  const d = modDir(body.mod), mod = modLabel(d);
  if (gohOrigin(d)) return { ok: false, wrote: false, mod, plan: [], problems: [], refused: { key: 'gohMod', params: { mod: d }, msg: 'this mod holds Gates of Hell content (GOH-ORIGIN.tsv). That can never be shared, so it is not packed.' } };
  const args = [d, '--package'].concat(isGohCtx(ctx) ? ['--goh'] : []);   // GoH: the GoH mod layout (packer --goh, GHVFS-04)
  if (body.speed === false) args.push('--no-speed');   // Pack for speed is the packer default; box off = --no-speed, same for the plan and the write
  let before = null, dest = '', fresh = false;   // I-20: say when the package folder already held files, and list only what this run wrote
  if (body.write) {
    let o; try { o = writableOut(body.out, d, ctx); } catch (e) { if (!e.key) throw e; return { ok: false, wrote: false, mod, plan: [], problems: [], refused: refusal(e) }; }
    args.push('--out', o); dest = path.join(o, mod.folder);
    fresh = !fs.existsSync(dest);   // JOBS: only a package folder this request makes is removed when the run is stopped
    writes(ctx);
    before = new Map(); for (const n of walkAll(dest)) { try { before.set(n, fs.statSync(path.join(dest, n)).mtimeMs); } catch (e) { /* gone */ } }
  } else args.push('--dry');
  const r = await ctx.runTool('packer', 'packer/packer.js', args, { timeoutMs: 300000 });
  if (r.cancelled) {
    // stopped midway: a package folder that was not there before this request is half written and of no use: remove it. A folder
    // that already existed is left as it is (its files may be from an earlier run; the page says a stopped run may leave files)
    if (body.write && fresh && dest) { try { fs.rmSync(dest, { recursive: true, force: true }); } catch (e) { /* in use: left */ } }
    return STOPPED;
  }
  const fs_ = findings(r.stdout);
  const plan = fs_.filter(x => x.code === 'PLAN').map(x => { const m = /^(\d+) files?, (\d+) KB/.exec(x.msg) || []; return { pak: x.where, files: +m[1] || 0, kb: +m[2] || 0 }; });
  const pkg = fs_.find(x => x.code === 'PACKAGE');
  const other = pkg ? +((/\+ (\d+) file/.exec(pkg.msg) || [])[1] || 0) : 0, own = pkg ? +((/(\d+) pak\(s\) of its own/.exec(pkg.msg) || [])[1] || 0) : 0;
  const out = { ok: r.code === 0, wrote: !!body.write && r.code === 0, mod, speed: body.speed !== false, plan, other, ownPaks: own, problems: fs_.filter(x => !x.info).map(x => ({ code: x.code, where: x.where, msg: x.msg })), tail: tail(r.stdout + '\n' + r.stderr, 6) };
  if (out.wrote) {
    if (dest) touchMod(ctx, dest);   // the packed copy may sit under <game>/mods
    out.out = norm(body.out); out.dest = norm(dest);
    out.files = walkAll(dest).filter(n => { try { return !before.has(n) || fs.statSync(path.join(dest, n)).mtimeMs !== before.get(n); } catch (e) { return false; } }).slice(0, 60);
    if (before.size) out.existing = { count: before.size, note: 'the folder already held ' + before.size + ' item(s) before this run; files listed are the ones written now' + (out.files.length ? '' : ' (none changed: the package there may be the same as before)') };
  }
  return out;
};

// Workshop: checklist data + clean copy
routes['POST /api/x/share/workshop'] = async (url, body, ctx) => {
  body = body || {};
  const d = modDir(body.mod), info = readInfo(d), lm = listMod(d), goh = gohOrigin(d);
  if (goh) throw bad('this mod holds Gates of Hell content (GOH-ORIGIN.tsv). That can never go to the Workshop.');
  let bytes = 0; for (const x of lm.files) bytes += fs.statSync(path.join(d, x)).size;
  const folder = path.basename(d), warns = [];
  if (info.f.FileId && info.f.Name && info.f.Name.toLowerCase() !== folder.toLowerCase()) warns.push('folder_name');
  if (info.f.FileId && typeof body.knownName === 'string' && body.knownName && info.f.Name !== body.knownName) warns.push('name_changed');
  if (!info.f.FileId && fs.existsSync(path.join(d, 'UPGRADE.md'))) warns.push('upgraded');
  const res = { folder, files: lm.files.length, bytes, left_out: lm.skipped, fileId: info.f.FileId, warns, wrote: false };
  if (body.write) {
    const o = writableOut(body.out, d, ctx), dest = path.join(o, folder);
    writes(ctx);
    if (fs.existsSync(dest) && fs.readdirSync(dest).length) throw bad('the folder ' + dest + ' already has files in it. Pick an empty place, or remove it yourself first.');
    for (const x of lm.files) { const t = path.join(dest, ...x.split('/')); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.copyFileSync(path.join(d, x), t); }
    res.wrote = true; touchMod(ctx, d); res.out = norm(dest);
  }
  return res;
};

// Workshop uploader (workshop_gui.exe, tools/workshop/workshop.js; owner 2026-11-11, the default uploader). GET = is it in the game
// folder and what installing would do (nothing written). POST {act:'install', confirm:true} copies it; {act:'start'} opens it.
// This is the one write into a game folder the page makes: three named files, steam_api64.dll never overwritten, and only after
// the user confirms the list the GET showed. game = another game folder (Gates of Hell); empty = the folder of the page's game
// (GoH page: the GoH install, where workshop.js puts it in binaries/x64 and keeps the steam_api64.dll there; owner 2026-11-11).
const WS = require('../../../workshop/workshop');
function uploaderGame(g, ctx) {
  const game = typeof g === 'string' && g.trim() ? g.trim() : gameOf(ctx);
  if (!game) throw bad('no game folder is set. Set the game folder first, or name one here.');
  return game;
}
// MoW:AS2 page on its own (shared) folder: workshop.js names the folder by as64.exe first; same folder and Steam id, so only the label
// is set to the page's game
const uploaderOut = (r, ctx, own) => { if (r.code) throw bad(r.msg);
  if (own && ctx && gidOf(ctx) === 'mowas2' && r.game === 'as64') r = Object.assign({}, r, { game: 'as2', gameName: 'Assault Squad 2' });
  return { game: r.game, gameName: r.gameName, dir: norm(r.dir), appid: r.appid, installed: r.installed, upToDate: r.upToDate, hasPackage: !!r.package, todo: r.todo, steps: r.steps.map(s => ({ file: s.file, action: s.action })), done: r.done || null }; };
const ownGame = g => !(typeof g === 'string' && g.trim());
routes['GET /api/x/share/uploader'] = async (url, body, ctx) => { const q = url && url.searchParams.get('game'); return uploaderOut(WS.plan(uploaderGame(q, ctx)), ctx, ownGame(q)); };
routes['POST /api/x/share/uploader'] = async (url, body, ctx) => {
  body = body || {};
  const game = uploaderGame(body.game, ctx);
  if (body.act === 'install') {
    if (body.confirm !== true) throw bad('confirm the list of files first');
    writes(ctx);
    return uploaderOut(WS.install(game, {}), ctx, ownGame(body.game));
  }
  if (body.act === 'start') {
    const r = WS.start(game, { dry: body.dry === true, spawn: ctx.spawnUploader });
    if (r.code) throw bad(r.msg);
    return { started: r.started, exe: norm(r.exe) };
  }
  throw bad('act must be install or start');
};

// new version: bump + change note + what changed since (previous copy folder, or a time)
routes['POST /api/x/share/version'] = async (url, body, ctx) => {
  body = body || {};
  const goh = isGohCtx(ctx), d = modDir(body.mod), cur = readInfo(d, { goh });
  const old = cur.f.Version || '';
  let next;
  if (body.kind === 'set') { next = String(body.value || '').trim(); if (!/^\d+(\.\d+){0,3}$/.test(next)) throw bad('the version must be numbers with dots, like 1.2'); }
  else {
    const p = (old || '1.0').split('.').map(n => parseInt(n, 10) || 0); while (p.length < 3) p.push(0);
    if (!old) next = '1.0'; else if (body.kind === 'major') next = (p[0] + 1) + '.0'; else if (body.kind === 'minor') next = p[0] + '.' + (p[1] + 1); else next = p[0] + '.' + p[1] + '.' + (p[2] + 1);
  }
  const changed = [], lm = listMod(d);
  if (typeof body.prev === 'string' && body.prev.trim()) {
    const pd = norm(body.prev);
    if (!fs.existsSync(pd) || !fs.statSync(pd).isDirectory()) throw bad('previous copy folder not found: ' + pd);
    const pl = listMod(pd), pset = new Set(pl.files);
    for (const x of lm.files) { if (!pset.has(x)) changed.push({ path: x, status: 'new' }); else if (sha(path.join(d, x)) !== sha(path.join(pd, x))) changed.push({ path: x, status: 'changed' }); }
    const cset = new Set(lm.files); for (const x of pl.files) if (!cset.has(x)) changed.push({ path: x, status: 'removed' });
  } else if (+body.since > 0) {
    for (const x of lm.files) if (fs.statSync(path.join(d, x)).mtimeMs > +body.since) changed.push({ path: x, status: 'changed' });
  }
  const res = { old, next, changed: changed.slice(0, 300), more: Math.max(0, changed.length - 300), basis: body.prev ? 'copy' : +body.since > 0 ? 'time' : 'none', fileId: cur.f.FileId, wrote: false, now: Date.now() };
  const note = String(body.note || '').trim();
  res.noteText = (cur.f.Name || path.basename(d)) + ' ' + next + (note ? '\n' + note : '');
  if (body.write) {
    writableMod(d, ctx);
    writes(ctx);
    const r = applyInfo(cur.raw, { Version: next }, goh ? { goh } : undefined);   // GoH reads no Version key either: ignored like on AS2 [I]
    fs.writeFileSync(infoOf(d), Buffer.from(r.text, 'latin1'));
    res.wrote = true; touchMod(ctx, d);
  }
  return res;
};

// play together: a text card (read only: modswitch, mpsync, game version)
// MoW:AS2: the card names mowas_2.exe and its build (not as64.exe, the first exe of the shared folder), and as64+ is not moved first
// (the built-in mod of AS64 only). GoH: the GoH install, its profile (<GoH user dir>/profiles/<id>/options.set, modswitch --profile; one
// profile only, else the user ticks the mods), call_to_arms.exe and its version (players must match, GHNET-22). The lobby size-only file
// check (mpsync) has no GoH branch: the card says so in one line (open: whether GoH's resource syncer filters are AS2's).
function gohProfiles() {
  try { const u = require('../../../lib/userdir').gohUserDir(), p = u && path.join(u, 'profiles'); if (!p || !fs.existsSync(p)) return [];
    return fs.readdirSync(p).map(id => path.join(p, id, 'options.set')).filter(f => fs.existsSync(f)); } catch (e) { return []; }
}
// modswitch's "active:" line joins "folder:N" entries with spaces, and a folder name may hold a space ("robz 1.31.0:1"): join
// neighbouring words while the joined name is an installed folder (longest first), else one word is one mod (as before)
function activeList(s, g) {
  const w = String(s).trim().split(/\s+/).filter(Boolean), out = [], strip = x => x.replace(/:\d+$/, '');
  for (let i = 0; i < w.length;) {
    let k = 1;
    for (let j = w.length; j > i + 1; j--) { const n = strip(w.slice(i, j).join(' ')); if (fs.existsSync(path.join(ciJoin(g, 'mods/' + n), 'mod.info'))) { k = j - i; break; } }
    out.push(strip(w.slice(i, i + k).join(' '))); i += k;
  }
  return out;
}
// modswitch --json: one line {active: [{entry, folder, installed}]}, one entry per mod (a name with a space stays one). No JSON line
// (an older modswitch): the "active:" text line, read by activeList as before
function activeOf(stdout, g) {
  for (const l of String(stdout || '').split(/\r?\n/).reverse()) {
    if (!/^\s*\{/.test(l)) continue;
    try { const j = JSON.parse(l); if (j && Array.isArray(j.active)) return j.active.map(a => String(a && (a.folder || String(a.entry || '').replace(/:\d+$/, '')) || '')).filter(Boolean); } catch (e) { /* not the JSON line */ }
  }
  const m = /^active:\s*(.*)$/m.exec(String(stdout || ''));
  return m && !/^\(none\)$/.test(m[1].trim()) ? activeList(m[1], g) : [];
}
const PLUS_OUT = 'as64+ is left out: it is the 64-bit build\'s own mod, and mowas_2.exe skips it (VFS-47).';
routes['POST /api/x/share/card'] = async (url, body, ctx) => {
  body = body || {};
  const id = gidOf(ctx), goh = id === 'goh', g = gameOf(ctx);
  if (!g) throw bad('the game folder is not found. Set it at the top of the page.');
  let list = Array.isArray(body.mods) ? body.mods.map(String).filter(Boolean) : [], source = 'picked', prof = '';
  if (!list.length) {
    const ma = ['--game', g];
    if (goh) { const ps = (ctx.gohProfiles || gohProfiles)(); if (ps.length === 1) ma.push('--profile', ps[0]); }
    const noProfile = goh && ma.length === 2;
    ma.push(...exeArgs(ctx), '--json');
    const r = noProfile ? { stdout: '' } : await ctx.runTool('modswitch', 'modswitch/modswitch.js', ma, { timeoutMs: 30000 });
    if (r.cancelled) return STOPPED;
    list = activeOf(r.stdout, g); source = 'profile';
    if (!noProfile) for (const l of String(r.stdout || '').split(/\r?\n/)) { try { const j = /^\s*\{/.test(l) && JSON.parse(l); if (j && typeof j.profile === 'string') prof = j.profile; } catch (e) { /* not the JSON line */ } }
  }
  // MoW:AS2: as64+ is the 64-bit build's own mod; mowas_2.exe skips that line (VFS-47, modswitch WARN_MOWAS2_NO_PLUS)
  let plusOut = false;
  if (id === 'mowas2') { const n = list.length; list = list.filter(x => x.toLowerCase() !== 'as64+'); plusOut = list.length < n; }
  if (!list.length && plusOut) throw bad(PLUS_OUT + ' No other mod is in the list. Pick the mods you play with.');
  if (!list.length) throw bad('no mods in the list. Pick the mods you play with.' + (prof ? ' The game profile has no mod turned on: ' + prof : ''));
  const i = id === 'as64' ? list.findIndex(x => x.toLowerCase() === 'as64+') : -1;
  if (i > 0) list.unshift(list.splice(i, 1)[0]);
  const has = e => fs.existsSync(ciJoin(g, e)) || fs.existsSync(ciJoin(g, 'bin/' + e));
  const exe = goh ? (fs.existsSync(ciJoin(g, 'binaries/x64/call_to_arms.exe')) ? 'call_to_arms.exe' : '')
    : id === 'mowas2' ? (has('mowas_2.exe') ? 'mowas_2.exe' : '')
      : ['as64.exe', 'mowas_2.exe'].find(has) || '';
  const build = (() => { try { return (id === 'as64' ? gamever.read(g) : gamever.read(g, id)) || ''; } catch (e) { return ''; } })();
  const mods = [], sizeOnly = [];
  for (const n of list.slice(0, 40)) {
    let d = ciJoin(g, 'mods/' + n);
    // AS64: as64+ is the built-in mod at as64/plus (the engine drops a mods/ folder of that name, VFS-47; modswitch reads it there too)
    if (id === 'as64' && n.toLowerCase() === 'as64+' && !fs.existsSync(infoOf(d)) && fs.existsSync(infoOf(ciJoin(g, 'as64/plus')))) d = ciJoin(g, 'as64/plus');
    if (!fs.existsSync(infoOf(d))) { mods.push({ folder: n, missing: true }); continue; }
    const f = readInfo(d, { goh }).f;
    mods.push({ folder: n, name: f.Name || '', version: f.Version || '', fileId: f.FileId || '' });
    if (!goh && list.length <= 12 && toolFile(ctx, 'mpsync/mpsync.js')) {
      const r = await ctx.runTool('mpsync', 'mpsync/mpsync.js', ['--mod', d, '--game', g, '-q'].concat(exeArgs(ctx)), { timeoutMs: 40000 });
      if (r.cancelled) return STOPPED;
      if (/WARN_MPSYNC_SIZE_ONLY/.test(r.stdout)) sizeOnly.push(n);
    }
  }
  const lines = ['Play together'];
  lines.push('Game: ' + (exe || (goh ? 'Call to Arms - Gates of Hell' : 'Men of War: Assault Squad 2')) + (build ? ' build ' + build : ''));
  lines.push('Mods, in this order (all players: same mods, same order):');
  mods.forEach((m, k) => lines.push((k + 1) + '. ' + (m.missing ? m.folder + ' (not installed here)' : (m.name || m.folder) + (m.version ? ' ' + m.version : '') + (m.name && m.name.toLowerCase() !== m.folder.toLowerCase() ? ' [folder ' + m.folder + ']' : '') + (m.fileId ? ' (Workshop ' + m.fileId + ')' : ''))));
  if (plusOut) lines.push(PLUS_OUT);
  lines.push(goh ? 'Everyone needs the same game version: players with another version cannot join.' : 'Everyone needs the same game build. The 32-bit and 64-bit games cannot play together.');
  if (sizeOnly.length) lines.push('Careful: ' + sizeOnly.join(', ') + ' have files the lobby only compares by size. If you change one, also change a text file so the lobby notices.');
  const out = { text: lines.join('\n'), mods, source, build, exe, order: list, sizeOnly, missing: mods.filter(m => m.missing).map(m => m.folder) };
  if (goh) out.syncNa = true;   // the page draws the plain line: no lobby file check for GoH here
  return out;
};

// mods together: overlapping files and value clashes, winner = last in the list
function parseCsv(text) {
  const rows = [];
  for (const l of String(text).split(/\r?\n/)) {
    if (!l.startsWith('"')) continue;
    const c = []; let cur = '', q = false;
    for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { c.push(cur); cur = ''; } else cur += ch; }
    c.push(cur); rows.push(c);
  }
  return rows;
}
// MoW:AS2: conflicts and overdiff get --exe mowas_2 (else the vfs takes as64 and as64/core in the shared folder); GoH: the GoH install as
// --game and --exe goh (conflicts reads a GoH install through the vfs, conflicts.js:86 [I])
// Guided fix (2026-11): ONE conflicts run (--fmt json: every line with its parts) instead of a text run and a csv run. The clashes are
// grouped by kind, most harmful first (TOG_KINDS); each clash says who wins, what is lost and which ways out there are:
//   last  = "put this mod last" (the page runs the check again with that order, nothing is written)
//   patch = it can go into a patch mod (conflicts/patchmod.js): 'merge' both sides, 'take' one mod's copy, 'text' one text you pick
//   hand  = no safe automatic way: the page says what to do by hand, with file and line
// body.patch = a patch mod folder written before: mounted last by path (--mod-dir), so the answer shows what is left with it.
const TOG_KINDS = [
  // kind, codes, harm (1 = worst), patch mode, last (does another order help), hand
  { kind: 'notloaded', codes: ['CONFLICT_MOD_NOT_LOADED'], patch: null, last: false, hand: true },
  { kind: 'deleted', codes: ['CONFLICT_FILE_DELETED'], patch: null, last: true, hand: true },
  { kind: 'jointparse', codes: ['CONFLICT_JOINT_PARSE'], patch: 'take', last: true, hand: true },
  { kind: 'macro', codes: ['CONFLICT_MACRO_LOST', 'CONFLICT_MACRO_DIFF'], patch: 'merge', last: true },
  { kind: 'jointref', codes: ['CONFLICT_JOINT_REF'], patch: null, last: true, hand: true },
  { kind: 'entity', codes: ['CONFLICT_ENTITY_NAME_DUP'], patch: null, last: true, hand: true },
  { kind: 'lost', codes: ['CONFLICT_ENTRY_LOST', 'CONFLICT_FILE_SHADOW'], patch: 'merge', last: true },
  { kind: 'textlost', codes: ['CONFLICT_LNG_KEY_LOST'], patch: 'merge', last: true },
  { kind: 'value', codes: ['WARN_CONFLICT_MOD_MOD'], patch: 'merge', last: true },
  { kind: 'text', codes: ['CONFLICT_LNG_KEY_DIFF'], patch: 'merge', last: true },
  { kind: 'textcross', codes: ['CONFLICT_LNG_KEY_CROSS'], patch: 'text', last: false, hand: true },
  { kind: 'file', codes: ['WARN_CONFLICT_OPAQUE_MOD_MOD'], patch: 'take', last: true },
  { kind: 'picture', codes: ['CONFLICT_TEX_EXT_SHADOW'], patch: null, last: false, hand: true },
  { kind: 'order', codes: ['MOD_ORDER_UNDECLARED'], patch: null, last: false, hand: true },
];
const TOG_OF = {}; TOG_KINDS.forEach((k, i) => k.codes.forEach(c => { TOG_OF[c] = Object.assign({ harm: i + 1 }, k); }));
const TOG_CAP = 2000;                       // clashes sent per kind (one clash = one file and the mod that loses there); the page draws 15 at a time
const TOG_MORE = { WARN_CONFLICT_FILE_KEYS: 'WARN_CONFLICT_MOD_MOD' };      // "N in this file" lines: the count of their kind
function togGroups(items, goh) {
  const by = new Map(), counts = new Map();
  for (const x of items) {
    const of = x.code === 'CONFLICT_FILE_MORE' ? x.d && x.d.of : TOG_MORE[x.code];
    if (of) counts.set(of + '|' + x.file, x.d && x.d.n || 0);
  }
  for (const x of items) {
    const k = TOG_OF[x.code]; if (!k || x.level !== 'warn') continue;
    const d = x.d || {}, loser = d.loser || (d.losers && d.losers[0]) || d.a || d.mod || '', winner = d.winner || d.by || d.b || '';
    const id = k.kind + '|' + x.file + '|' + loser + (k.kind === 'textcross' || k.kind === 'jointref' ? '|' + (d.key || '') : '');
    let c = by.get(id);
    if (!c) {
      by.set(id, c = { id, kind: k.kind, harm: k.harm, code: x.code, file: x.file, line: x.line || 0, winner, loser, n: 0, keys: [], why: d.why || '', other: d.other || '', otherLine: d.otherLine || 0, what: d.kind || '',
        fix: { last: k.last && loser ? (k.kind === 'entity' ? winner : loser) : '',   // an entity name: the EARLIER mod's is kept (ENG-04), so the other order means the winner goes last
          patch: k.patch && !(goh && k.patch === 'text') ? k.patch : '', hand: !!k.hand || (goh && k.patch === 'text') } });
    }
    c.n += x.code === 'CONFLICT_FILE_SHADOW' ? d.n || 1 : 1;
    if (c.keys.length < 3) c.keys.push({ key: d.key || '', values: (d.values || []).slice(0, 6), line: x.line || 0, code: x.code });
    if (x.code === 'MOD_ORDER_UNDECLARED') { c.n = d.n || 1; c.loser = d.a; c.winner = d.b; }
    // joint view: the way out through the patch mod is the other mod's file that causes it (restore it there); a reference counts its places
    if (k.kind === 'jointref') { c.n = d.n || 1; c.fix.patch = d.kind === 'macro' || d.kind === 'entry' ? 'merge' : ''; c.fix.key = c.fix.patch ? d.other || '' : ''; }
    // a file that stops reading: when its mod has its own copy of the include that changed, that copy in a patch mod (or its mod last) mends it;
    // when it relied on the game's copy, no order and no copy of a mod's file does: by hand only (game = true)
    if (k.kind === 'jointparse') { const own = !!d.other && d.otherOf === loser; c.fix.patch = own ? 'take' : ''; c.fix.key = own ? d.other : ''; if (!own) { c.fix.last = ''; c.game = true; } }
  }
  for (const c of by.values()) for (const code of TOG_OF[c.code] ? TOG_KINDS[c.harm - 1].codes : []) { const n = counts.get(code + '|' + c.file); if (n && n > c.n) c.n = n; }
  const groups = [];
  for (const k of TOG_KINDS) {
    const list = [...by.values()].filter(c => c.kind === k.kind);
    if (!list.length) continue;
    // who wins how often in this kind (clashes, not values): the page shows it at the head of the group
    const wins = {}; for (const c of list) if (c.winner) wins[c.winner] = (wins[c.winner] || 0) + 1;
    groups.push({ kind: k.kind, harm: TOG_OF[k.codes[0]].harm, codes: k.codes, count: list.length, values: list.reduce((n, c) => n + (c.n || 1), 0), wins, items: list.slice(0, TOG_CAP), more: Math.max(0, list.length - TOG_CAP) });
  }
  return groups;
}
function conflictsJson(stdout) {
  for (const l of String(stdout || '').split(/\r?\n/)) { if (l[0] !== '{') continue; try { const j = JSON.parse(l); if (j && Array.isArray(j.items)) return j; } catch (e) { /* not the JSON line */ } }
  return null;
}
// a patch mod folder written by the page before: it must be a folder with a mod.info, and not one of the mods of the list
function patchDirOf(p, g, mods) {
  if (typeof p !== 'string' || !p.trim()) return '';
  const d = norm(p);
  if (!fs.existsSync(infoOf(d))) throw bad('the patch mod folder has no mod.info: ' + d);
  for (const m of mods) if (low(d) === low(ciJoin(g, 'mods/' + m))) throw bad('the patch mod is already one of the mods in the list: ' + m);
  return d;
}
// SPEED (2026-11, PERF R1 C5 L4): one conflicts child (it was conflicts then overdiff, each mounting the game and stat-walking the mods).
//   - the mods are scanned by the shared walk first (ctx.modtree.ensure, async), the child mounts them from that scan (--scan-kept)
//   - only files two of the mods hold are compared (--mods-only), same files are told apart by length, time and crc32 (--trust-mtime)
//   - the read of each file is kept in the cache store by length + time (--cache-dir = ctx.cache's folder, section conflicts.parse)
//   - the child writes its step to a file (--progress), read here 4 times a second: ctx.job.set (the footer) and the progress route
//   - the whole answer is kept in memory (at most 6) while the game stamp and each mod folder's modtree 'all' signature stand
// "Mods that replace a whole file" (overdiff) is no part of this answer any more: POST /api/x/share/clashshadows, asked by a button.
const os = require('os');
const TOG_RUNS = new Map(), TOG_KEPT = new Map(), GATE_KEPT = new Map();
const MT = ctx => (ctx && ctx.modtree) || require('../../../lib/modtree');
const runIdOf = s => (typeof s === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(s) ? s : '');
const togTmp = ctx => { const d = path.join((ctx && ctx.tmpRoot) || path.join(os.tmpdir(), 'arsenal-gui'), 'tog'); fs.mkdirSync(d, { recursive: true }); return d; };
const togSay = (ctx, run, step, done, total) => {
  if (run) TOG_RUNS.set(run, { step, done: done || 0, total: total || 0, at: Date.now() });
  if (ctx && ctx.job && typeof ctx.job.set === 'function') ctx.job.set(total > 0 ? { stage: 'share.tog.step.' + step, done, total } : { stage: 'share.tog.step.' + step, done: 0, total: 0 });
};
// reads the child's --progress file until stop() is called
function togWatch(ctx, pf, run) {
  let busy = false, last = '';
  const t = setInterval(() => {
    if (busy) return; busy = true;
    fs.readFile(pf, 'utf8', (e, txt) => { busy = false; if (e || txt === last) return; last = txt; let p; try { p = JSON.parse(txt); } catch (x) { return; } if (p && typeof p.step === 'string' && /^[a-z]{1,12}$/.test(p.step)) togSay(ctx, run, p.step, +p.done || 0, +p.total || 0); });
  }, 250);
  if (t.unref) t.unref();
  return () => { clearInterval(t); fs.unlink(pf, () => {}); if (run) { const k = setTimeout(() => TOG_RUNS.delete(run), 4000); if (k.unref) k.unref(); } };
}
// the shared walk of every folder the child will mount; -> the 'all' signature of each, or null when one could not be scanned
async function togScan(ctx, dirs) {
  const mt = MT(ctx);
  const Ts = await Promise.all(dirs.map(d => Promise.resolve().then(() => mt.ensure(d)).catch(() => null)));
  return Ts.every(T => T && T.all) ? Ts.map(T => T.all) : null;
}
const togSpeed = (ctx, pf) => ['--scan-kept', '--trust-mtime'].concat(ctx && ctx.cache && ctx.cache.root ? ['--cache-dir', ctx.cache.root] : ['--cache'], pf ? ['--progress', pf] : []);
const gameStamp = (ctx, g) => { try { return ctx && ctx.gameview && typeof ctx.gameview.stamp === 'function' ? String(ctx.gameview.stamp({ gameDir: g, gid: gidOf(ctx) }) || '') : ''; } catch (e) { return ''; } };
function togKeep(key, stamp, out) { TOG_KEPT.delete(key); TOG_KEPT.set(key, { stamp, out }); while (TOG_KEPT.size > 6) TOG_KEPT.delete(TOG_KEPT.keys().next().value); }
// two picked mods that look like two versions of one mod: one Workshop id, one name, or one folder name once the version is taken off
const verless = t => String(t || '').toLowerCase().replace(/\bv?\d+(\.\d+)*[a-z]?\b/g, ' ').replace(/[^a-z\u0400-\u04ff\u4e00-\u9fff]+/g, ' ').trim();
function sameModPairs(g, mods, goh) {
  const info = mods.map(m => { let f = {}; try { f = readInfo(ciJoin(g, 'mods/' + m), { goh }).f; } catch (e) { /* unreadable */ } return { m, id: f.FileId || '', name: verless(f.Name), dir: verless(m) }; });
  const out = [];
  for (let i = 0; i < info.length; i++) for (let j = i + 1; j < info.length; j++) { const a = info[i], b = info[j];
    if ((a.id && a.id === b.id) || (a.name.length > 3 && a.name === b.name) || (a.dir.length > 3 && a.dir === b.dir)) out.push({ a: a.m, b: b.m }); }
  return out;
}
routes['GET /api/x/share/clashprogress'] = async url => {
  const r = TOG_RUNS.get(runIdOf(url.searchParams.get('run')));
  return r ? { step: r.step, done: r.done, total: r.total } : { step: '' };
};
routes['POST /api/x/share/clashes'] = async (url, body, ctx) => {
  body = body || {};
  const g = gameOf(ctx), ex = exeArgs(ctx), gid = gidOf(ctx), goh = gid === 'goh', t0 = Date.now(), run = runIdOf(body.run);
  if (!g) throw bad('the game folder is not found. Set it at the top of the page.');
  const mods = (Array.isArray(body.mods) ? body.mods : []).map(String).filter(Boolean);
  if (mods.length < 2) throw bad('pick at least two mods');
  for (const m of mods) if (!fs.existsSync(ciJoin(g, 'mods/' + m + '/mod.info'))) throw bad('mod not found: ' + m + ' (it must be installed in the game mods folder)');
  const patch = patchDirOf(body.patch, g, mods);
  // the tools take a mod as the game's own list names it: the folder name in lowercase (VFS-12); a folder with capitals was "mod not found"
  const list = mods.map(m => m.toLowerCase()).join(',');
  togSay(ctx, run, 'scan', 0, 0);
  const sigs = await togScan(ctx, mods.map(m => ciJoin(g, 'mods/' + m)).concat(patch ? [patch] : []));
  if (ctx.job && ctx.job.cancelled) return STOPPED;
  const key = JSON.stringify([low(g), gid, list, patch ? low(patch) : '']), gs = gameStamp(ctx, g), stamp = sigs && gs ? gs + '|' + sigs.join('|') : '';   // no game stamp (no ctx.gameview: a caller with no server) = nothing kept
  const kept = stamp && body.fresh !== true ? TOG_KEPT.get(key) : null;
  if (kept && kept.stamp === stamp) { if (run) TOG_RUNS.delete(run); return Object.assign({}, kept.out, { order: mods, kept: true, ms: Date.now() - t0 }); }
  const pf = path.join(togTmp(ctx), 'prog-' + crypto.randomBytes(6).toString('hex') + '.json'), stop = togWatch(ctx, pf, run);
  let a;
  try {
    a = await ctx.runTool('conflicts', 'conflicts/conflicts.js', ['--game', g, '--mods', list, '--fmt', 'json', '--mods-only', '--joint'].concat(togSpeed(ctx, pf), patch ? ['--mod-dir', patch] : [], ex), { timeoutMs: 600000 });
  } finally { stop(); }
  if (a.cancelled) return STOPPED;   // JOBS: stopped from the footer or by the page's Stop button (the dispatcher answers 499)
  if (a.code === 2) throw bad(lastLine(a.stderr) || lastLine(a.stdout) || 'conflicts failed');
  const j = conflictsJson(a.stdout) || { items: [], order: mods };
  const warn = j.items.filter(x => x.level === 'warn');
  // the value table as before: one row per value two mods set differently
  const rows = warn.filter(x => x.code === 'WARN_CONFLICT_MOD_MOD' && x.d && x.d.values).map(x => ({ file: x.file, key: x.d.key, kind: 'MOD_MOD', winner: x.d.winner, values: x.d.values }));
  const clash = rows.filter(r => r.values.filter(v => v.src !== 'vanilla').length >= 2).slice(0, 400);
  // a mod the game's version gate leaves out (info VFS_MOD_VERSION: a 3.301-only mod under mowas_2, a Classic mod under as64, a GoH mod
  // of another version) is not compared: the page names it in one line, and it is no "file" of the overlap list. Under as64 a refused
  // mod is worse than left out: the game stops at start (VFS-59), the page says so (gate = the game id)
  const skipped = [], files = {};
  for (const x of j.items) if (x.code === 'VFS_MOD_VERSION') { const m = /^mod "([^"]*)"/.exec(x.msg); skipped.push({ mod: m ? m[1] : path.basename(x.file), msg: x.msg }); }
  const left = new Set(skipped.map(s => String(s.mod).toLowerCase()));
  // the version gate line has its own plain sentence (skipped): it is not listed a second time as a clash
  const fl = warn.filter(x => !(x.code === 'CONFLICT_MOD_NOT_LOADED' && x.d && /^MOD_(VERSION|VER_GATE)$/.test(x.d.why || '') && left.has(String(x.d.mod || '').toLowerCase())));
  for (const x of fl) { if (!files[x.file]) files[x.file] = []; files[x.file].push(x.code); }
  const compared = mods.length - skipped.length;
  // the winner is the last mod the game loads: a mod the version gate left out wins nothing
  const kept2 = mods.filter(m => !left.has(m.toLowerCase()));
  const groups = togGroups(fl, goh);
  // who wins how often over every kind (the head of the result)
  const wins = {}; for (const gr of groups) for (const m of Object.keys(gr.wins)) wins[m] = (wins[m] || 0) + gr.wins[m];
  // plain notes (info lines of conflicts --joint): shader files, a mission's own mod/ folder
  const notes = j.items.filter(x => x.code === 'CONFLICT_SHADER_SET' || x.code === 'CONFLICT_MISSION_MOD').map(x => ({ kind: x.code === 'CONFLICT_SHADER_SET' ? 'shader' : 'mission', mod: x.d && x.d.mod || '', n: x.d && x.d.n || 0, where: x.d && x.d.where || x.file })).slice(0, 20);
  const out = {
    order: Array.isArray(j.order) && j.order.length ? j.order : mods, asked: mods, winner: (kept2.length ? kept2 : mods)[(kept2.length ? kept2 : mods).length - 1], clashes: clash, valueRows: rows.length, files: Object.keys(files).sort().map(k => ({ file: k, codes: [...new Set(files[k])] })).slice(0, 400),
    clean: !fl.length && compared >= 2,
    groups, total: groups.reduce((n, x) => n + x.count, 0), wins, notes, sameMod: sameModPairs(g, mods, goh), gate: gid,
    decided: j.items.filter(x => x.code === 'CONFLICT_PATCHED').length, twice: j.items.filter(x => x.code === 'CONFLICT_PAK_LOOSE_SAME_MOD').slice(0, 20).map(x => ({ file: x.file, mod: x.d && x.d.mod || '' })),
  };
  out.order = mods;
  if (patch) out.patch = patch;
  if (skipped.length) {
    out.skipped = skipped; out.compared = compared;
    out.skippedText = 'Left out by this game (the mod.info version range does not fit it, so the game does not load them): ' + skipped.map(s => s.mod).join(', ') + (compared < 2 ? '. Fewer than two mods are left, so nothing is compared.' : '.');
  }
  if (stamp) togKeep(key, stamp, out);
  return Object.assign({}, out, { ms: Date.now() - t0 });
};
// "Mods that replace a whole file" (overdiff OVR_FULL_SHADOW), asked by its own button: it mounts the game and the mods once more
// (minutes on a big pair), so it is no part of Show clashes. Kept in memory by the same stamps
routes['POST /api/x/share/clashshadows'] = async (url, body, ctx) => {
  body = body || {};
  const g = gameOf(ctx), ex = exeArgs(ctx);
  if (!g) throw bad('the game folder is not found. Set it at the top of the page.');
  const mods = (Array.isArray(body.mods) ? body.mods : []).map(String).filter(Boolean);
  if (mods.length < 2) throw bad('pick at least two mods');
  for (const m of mods) if (!fs.existsSync(ciJoin(g, 'mods/' + m + '/mod.info'))) throw bad('mod not found: ' + m + ' (it must be installed in the game mods folder)');
  if (!toolFile(ctx, 'overdiff/overdiff.js')) return { shadows: [], missing: true };
  const list = mods.map(m => m.toLowerCase()).join(',');
  const sigs = await togScan(ctx, mods.map(m => ciJoin(g, 'mods/' + m)));
  const key = JSON.stringify(['shadows', low(g), gidOf(ctx), list]), gs = gameStamp(ctx, g), stamp = sigs && gs ? gs + '|' + sigs.join('|') : '';   // no game stamp (no ctx.gameview: a caller with no server) = nothing kept
  const kept = stamp ? TOG_KEPT.get(key) : null;
  if (kept && kept.stamp === stamp) return kept.out;
  const o = await ctx.runTool('overdiff', 'overdiff/overdiff.js', ['--game', g, '--mods', list, '-q'].concat(ex), { timeoutMs: 600000 });
  if (o.cancelled) return STOPPED;
  const all = findings(o.stdout).filter(x => x.code === 'OVR_FULL_SHADOW').map(x => ({ file: x.where, msg: x.msg }));
  const out = { shadows: all.slice(0, 100), more: Math.max(0, all.length - 100) };
  if (stamp) togKeep(key, stamp, out);
  return out;
};
// playing online with these mods: one plain result. mpsync --mod per mod (which of its files the lobby compares by length only),
// the same for the patch mod, and the action set: a mod with files in resource/interface/action changes the action ids, so every
// player needs the same set (UI-05, uilint WARN_ACTION_SET_MP_MISMATCH [T]; read off the shared walk, loose files only [I]).
// Gates of Hell: no lobby file check is modelled here (the card route says the same), so only the plain rule is given
routes['POST /api/x/share/clashmp'] = async (url, body, ctx) => {
  body = body || {};
  const g = gameOf(ctx), gid = gidOf(ctx), goh = gid === 'goh';
  if (!g) throw bad('the game folder is not found. Set it at the top of the page.');
  const mods = (Array.isArray(body.mods) ? body.mods : []).map(String).filter(Boolean).slice(0, 12);
  if (mods.length < 2) throw bad('pick at least two mods');
  for (const m of mods) if (!fs.existsSync(ciJoin(g, 'mods/' + m + '/mod.info'))) throw bad('mod not found: ' + m + ' (it must be installed in the game mods folder)');
  const patch = patchDirOf(body.patch, g, mods);
  const dirs = mods.map(m => ciJoin(g, 'mods/' + m)).concat(patch ? [patch] : []), names = mods.concat(patch ? [path.basename(patch)] : []);
  const mt = MT(ctx), out = { mods, patch: patch || '', sizeOnly: [], actions: [], checked: !goh, gid };
  const Ts = await Promise.all(dirs.map(d => Promise.resolve().then(() => mt.ensure(d)).catch(() => null)));
  Ts.forEach((T, i) => { const n = T ? T.files.filter(r => /^resource\/interface\/action\/[^/]+\.set$/i.test(r[0])).length : 0; if (n) out.actions.push({ mod: names[i], n }); });
  if (patch) { const T = Ts[Ts.length - 1]; out.patchFiles = T ? T.count - 1 : 0; out.patchInMods = inside(patch, g + '/mods'); }
  if (!goh && toolFile(ctx, 'mpsync/mpsync.js')) {
    const key = JSON.stringify(['mp', low(g), gid, dirs.map(low)]), gs = gameStamp(ctx, g), stamp = gs && Ts.every(T => T && T.all) ? gs + '|' + Ts.map(T => T.all).join('|') : '';
    const kept = stamp ? TOG_KEPT.get(key) : null;
    if (kept && kept.stamp === stamp) out.sizeOnly = kept.out;
    else {
      const rs = await Promise.all(dirs.map(d => ctx.runTool('mpsync', 'mpsync/mpsync.js', ['--mod', d, '--game', g, '-q'].concat(exeArgs(ctx)), { timeoutMs: 120000 })));
      if (rs.some(r => r.cancelled)) return STOPPED;
      rs.forEach((r, i) => { const m = /(\d+) files synced by byte size only/.exec(r.stdout || ''); if (m) out.sizeOnly.push({ mod: names[i], n: +m[1] }); else if (r.code === 2 || r.timedOut) out.checked = false; });
      if (stamp && out.checked) togKeep(key, stamp, out.sizeOnly);
    }
  }
  return out;
};
// the patch mod folder in the file manager (after Write). Only a folder that holds a mod.info and is no game data folder
let _open = null;   // test seam: dir => { ok }
routes['POST /api/x/share/clashopen'] = async (url, body, ctx) => {
  const d = norm(String(body && body.dir || ''));
  if (!body || !body.dir || !fs.existsSync(infoOf(d))) throw bad('not a mod folder: ' + d);
  const r = _open ? _open(d) : require('../../../lib/platform').openPath(d);
  if (!r || !r.ok) throw bad('the folder could not be opened: ' + d, 500);
  return { ok: true, dir: d };
};

// the patch mod: Preview (write false: nothing is written) then Write, into a NEW folder the user names (conflicts/patchmod.js refuses a
// folder that holds files, a mod of the list, the game data; lib/writeguard). body: { mods, out, name, files: [{ key, mode: 'merge'|'take',
// take, prefer, picks: { path: mod } }], texts: [{ key, text }], write }
routes['POST /api/x/share/clashfix'] = async (url, body, ctx) => {
  body = body || {};
  const g = gameOf(ctx), ex = exeArgs(ctx);
  if (!g) throw bad('the game folder is not found. Set it at the top of the page.');
  const mods = (Array.isArray(body.mods) ? body.mods : []).map(String).filter(Boolean);
  if (mods.length < 2) throw bad('pick at least two mods');
  for (const m of mods) if (!fs.existsSync(ciJoin(g, 'mods/' + m + '/mod.info'))) throw bad('mod not found: ' + m + ' (it must be installed in the game mods folder)');
  if (typeof body.out !== 'string' || !body.out.trim()) throw bad('name a new folder for the patch mod');
  const out = norm(body.out.trim());
  const files = (Array.isArray(body.files) ? body.files : []).filter(f => f && typeof f.key === 'string' && f.key).slice(0, 5000).map(f => {
    const r = { key: String(f.key), mode: f.mode === 'take' ? 'take' : 'merge' };
    if (f.take) r.take = String(f.take); if (f.prefer) r.prefer = String(f.prefer);
    if (f.picks && typeof f.picks === 'object') { r.picks = {}; for (const k of Object.keys(f.picks).slice(0, 20000)) r.picks[k] = String(f.picks[k]); }
    return r;
  });
  const texts = (Array.isArray(body.texts) ? body.texts : []).filter(t => t && typeof t.key === 'string' && typeof t.text === 'string').slice(0, 5000).map(t => ({ key: t.key, text: t.text }));
  if (!files.length && !texts.length) throw bad('nothing is picked for the patch mod yet');
  const tmp = togTmp(ctx), run = runIdOf(body.run);
  const spec = path.join(tmp, 'spec-' + crypto.randomBytes(6).toString('hex') + '.json'), pf = path.join(tmp, 'prog-' + crypto.randomBytes(6).toString('hex') + '.json');
  togSay(ctx, run, 'scan', 0, 0);
  await togScan(ctx, mods.map(m => ciJoin(g, 'mods/' + m)));
  if (ctx.job && ctx.job.cancelled) return STOPPED;
  const stop = togWatch(ctx, pf, run);
  fs.writeFileSync(spec, JSON.stringify({ files, texts }));
  let r;
  try {
    if (body.write) writes(ctx);
    const args = [body.write ? 'write' : 'plan', '--game', g, '--mods', mods.map(m => m.toLowerCase()).join(','), '--out', out, '--spec', spec, '--json'];
    if (typeof body.name === 'string' && body.name.trim()) args.push('--name', body.name.trim().slice(0, 80));
    r = await ctx.runTool('patchmod', 'conflicts/patchmod.js', args.concat(togSpeed(ctx, pf), ex), { timeoutMs: 600000 });
  } finally { stop(); try { fs.unlinkSync(spec); } catch (e) { /* gone */ } }
  if (r.cancelled) return STOPPED;
  let j = null; for (const l of String(r.stdout || '').split(/\r?\n/)) { if (l[0] === '{') { try { j = JSON.parse(l); } catch (e) { /* next */ } } }
  if (!j) throw bad(lastLine(r.stderr) || 'the patch mod could not be planned');
  if (j.error) throw bad(j.error);
  if (j.wrote) { touchMod(ctx, out); TOG_KEPT.clear(); }
  for (const f of j.files || []) { if (f.choices && f.choices.length > 200) { f.moreChoices = f.choices.length - 200; f.choices = f.choices.slice(0, 200); } if (f.added && f.added.length > 50) { f.moreAdded = f.added.length - 50; f.added = f.added.slice(0, 50); } if (f.auto && f.auto.length > 50) f.auto = f.auto.slice(0, 50); }
  // how to turn it on: its folder name is what the game's mod list shows; inMods = the game can see it where it is
  return { out: j.out, name: j.name, wrote: !!j.wrote, refused: j.refused || '', files: j.files || [], cant: j.cant || [], texts: j.texts || [], requires: j.requires || [], modInfo: j.modInfo || '', left: j.left || [],
    folder: path.basename(norm(j.out || out)), inMods: inside(norm(j.out || out), g + '/mods'), after: mods,
    notWinning: (j.files || []).filter(f => f.wins === false).map(f => f.key) };
};

// game updated? release-check (reads the game exe, writes only its own run folder). GoH: --goh <GoH install> instead of --as2;
// the page's game gets --exe (release-check --exe: only that game's exe; MoW:AS2 = mowas_2.exe under --as2, GoH = the GoH exe only);
// as64 = no --exe, as before (as64.exe and the GoH exe). A replan of the mod targets the page's game (--to mowas2 | goh)
routes['POST /api/x/share/updated'] = async (url, body, ctx) => {
  body = body || {};
  if (!toolFile(ctx, 'release-check/release-check.js')) return { available: false };
  const id = gidOf(ctx), g = gameOf(ctx);
  const args = ['--no-upstream'];
  if (g) args.push(id === 'goh' ? '--goh' : '--as2', g);
  args.push(...exeArgs(ctx));
  if (typeof body.mod === 'string' && body.mod.trim()) { args.push('--replan', modDir(body.mod)); if (id !== 'as64') args.push('--to', id); }
  const r = await ctx.runTool('release-check', 'release-check/release-check.js', args, { timeoutMs: 280000 });
  if (r.cancelled) return STOPPED;   // JOBS: stopped from the footer (the dispatcher answers 499)
  return { available: true, code: r.code, changed: r.code === 1, timedOut: r.timedOut, text: tail(r.stdout + (r.code === 2 ? '\n' + r.stderr : ''), 40) };
};

module.exports = { routes, TOG_KINDS, togGroups, _t: { set open(fn) { _open = fn; }, TOG_KEPT, TOG_RUNS, sameModPairs, verless, togGroups, TOG_KINDS, applyInfo, readInfo, rangeKind, imageKind, parseCsv, findings, listMod, rangesFor, gohVersion, gohBadFolder, gameOf, exeArgs, activeList, activeOf } };
