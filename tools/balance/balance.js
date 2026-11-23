#!/usr/bin/env node
// BALANCE: every buyable unit as one row (price, rank, unlock, armour, gun, speed, men ..), seen as a sheet, in groups, as a
// pivot, as an HTML report with graphs, against the game without the mod; units that do not fit the pattern; and a bulk
// change of one column for any selection, written into a mod folder through gen's ops.
// usage: balance <gameDir> [--folder modDir] [--where "army=ger cls=tank cost>500 id~^pz"] [--sort -cost] [--cols a,b,..]
//   views (default: summary):  --sheet csv|md|json   --group cls,army [--of cost,speed]   --pivot cls,army [--of cost] [--stat median|mean|min|max|count]
//                              --odd   --models   --html report.html   [-o file]
//   change:  --change "cost pct 10" | "cost fit" | "speed mul 1.2" | "armor add 20" | "reload set 6" | "rank set 3"  [--step 5]  --folder modDir [--plan]
//            (columns: cost rank charge fore wait speed armor reload; ops: set add mul pct fit). Without --plan it writes into --folder.
//   [-q] [--json]   exit 0 ok, 1 refused or findings on a change, 2 usage
//   --exe as64|mowas_2|mowas2|goh (also --target as64|mowas2|goh): the game (lib/games). No game: as64, as before. AS64 and MoW:AS2 share
//     one install: mowas_2 reads the MoW:AS2 view (statsheet --exe mowas_2, gen Ctx target mowas2: no as64/core). goh = Gates of Hell:
//     <gameDir> may be left out (the GoH install, games.install); prices by the GoH squad rule (GHGPL-10), wait at start = charge delay
//     (GHMIS-86), paid with mp or dp (doctrine button) from the GoH presets (presets/**, GHGPL-12 [I]); --change under GoH: cost, charge,
//     wait, reload (gun file), speed and armor (the unit def and its includes, lib/goharmour: one edit per def, a shared include
//     copied next to the def), into a GoH mod folder outside the GoH install (lib/writeguard); rank and fore are not read by GoH:
//     refused at the start with one line, exit 2. Each GoH card is one id in one period file (an id
//     can repeat in early/mid/late with its own values): the change edits that period's card.
//     Non-as64 runs keep their catalogue cache in a folder of their own (<tmp>/game-<id>).
// Author: Imperator_Aug (ARSENAL, ia-012959c6)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const B = require('./lib');
const TOOLS = path.resolve(__dirname, '..');

function usage(rc, m) { (rc ? console.error : console.log)((m ? m + '\n' : '') + 'usage: ARSENAL balance <gameDir> [--folder modDir] [--where "army=ger cls=tank cost>500"] [--sort -cost] [--cols a,b] [--sheet csv|md|json | --group cls,army [--of cost] | --pivot cls,army [--of cost] [--stat median] | --odd | --models | --html file] [--change "cost pct 10" [--step 5] [--plan]] [-o file] [-q] [--json]\ncolumns: ' + B.COLS.map(c => c.id).join(' ')); process.exit(rc); }
function parseArgs(argv) {
  const o = { pos: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], nx = () => { if (i + 1 >= argv.length) usage(2, a + ' needs a value'); return argv[++i]; };
    if (a === '--folder') o.folder = nx(); else if (a === '--where') o.where = nx(); else if (a === '--sort') o.sort = nx(); else if (a === '--cols') o.cols = nx();
    else if (a === '--sheet') o.sheet = nx(); else if (a === '--group') o.group = nx(); else if (a === '--of') o.of = nx(); else if (a === '--pivot') o.pivot = nx(); else if (a === '--stat') o.stat = nx();
    else if (a === '--odd') o.odd = true; else if (a === '--models') o.models = true; else if (a === '--html') o.html = nx(); else if (a === '--change') o.change = nx(); else if (a === '--step') o.step = nx();
    else if (a === '--plan') o.plan = true; else if (a === '-o') o.out = nx(); else if (a === '-q') o.q = true; else if (a === '--json') o.json = true; else if (a === '--tmp') o.tmp = nx();
    else if (a === '--exe' || a === '--target') { const v = nx(), g = require('../lib/games').get(v); if (!g || /\.exe$/i.test(v)) usage(2, a + ' must be one of as64, mowas_2, mowas2, goh'); o.game = g.id; }
    else if (a === '-h' || a === '--help') usage(0); else if (a[0] === '-') usage(2, 'unknown option ' + a); else o.pos.push(a);
  }
  return o;
}
const runTool = async (tool, entry, args, opt) => new Promise(res => {
  const c = cp.spawn(process.execPath, [path.join(TOOLS, entry), ...args], { stdio: ['ignore', 'pipe', 'pipe'] }); let so = '', se = '';
  c.stdout.on('data', d => so += d); c.stderr.on('data', d => se += d); c.on('close', code => res({ code, stdout: so, stderr: se }));
});
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- HTML report: summary, group table, bars, price against model price, odd list, full sheet. One file, no script.
const HUES = ['#2c6fd1', '#c0392b', '#2e8b57', '#b8860b', '#7d3c98', '#d35400', '#16808a', '#7f8c8d', '#a04070', '#4d6b1f'];
function bars(title, items, unit) {
  const max = Math.max(1, ...items.map(i => i.v || 0)), h = 18, w = 520;
  return '<h3>' + esc(title) + '</h3><svg viewBox="0 0 ' + (w + 260) + ' ' + (items.length * h + 6) + '" width="100%" role="img" aria-label="' + esc(title) + '">' + items.map((it, i) =>
    '<text x="150" y="' + (i * h + 13) + '" text-anchor="end" font-size="11">' + esc(it.k) + '</text><rect x="156" y="' + (i * h + 3) + '" width="' + Math.round((it.v || 0) / max * w) + '" height="' + (h - 5) + '" fill="' + (it.c || HUES[0]) + '"/><text x="' + (160 + Math.round((it.v || 0) / max * w)) + '" y="' + (i * h + 13) + '" font-size="11">' + esc(it.v == null ? '-' : it.v + (unit || '')) + (it.n != null ? ' (' + it.n + ')' : '') + '</text>').join('') + '</svg>';
}
function scatter(title, pts, xl, yl, diag) {
  const W = 760, H = 420, L = 56, Bm = 40, xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  if (!pts.length) return '';
  const x1 = Math.max(...xs, diag ? Math.max(...ys) : 0) * 1.05 || 1, y1 = Math.max(...ys, diag ? Math.max(...xs) : 0) * 1.05 || 1;
  const X = v => L + v / x1 * (W - L - 10), Y = v => H - Bm - v / y1 * (H - Bm - 10), tick = m => { const s = Math.pow(10, Math.floor(Math.log10(m))); return [1, 2, 5, 10].map(k => k * s).find(k => m / k <= 6) || s; };
  const tx = tick(x1), ty = tick(y1); let g = '';
  for (let v = 0; v <= x1; v += tx) g += '<line x1="' + X(v) + '" y1="10" x2="' + X(v) + '" y2="' + (H - Bm) + '" stroke="#e3e6ea"/><text x="' + X(v) + '" y="' + (H - Bm + 14) + '" font-size="10" text-anchor="middle">' + v + '</text>';
  for (let v = 0; v <= y1; v += ty) g += '<line x1="' + L + '" y1="' + Y(v) + '" x2="' + (W - 10) + '" y2="' + Y(v) + '" stroke="#e3e6ea"/><text x="' + (L - 4) + '" y="' + (Y(v) + 3) + '" font-size="10" text-anchor="end">' + v + '</text>';
  if (diag) g += '<line x1="' + X(0) + '" y1="' + Y(0) + '" x2="' + X(Math.min(x1, y1)) + '" y2="' + Y(Math.min(x1, y1)) + '" stroke="#999" stroke-dasharray="4 3"/>';
  return '<h3>' + esc(title) + '</h3><svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(title) + '">' + g + pts.map(p => '<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="' + (p.big ? 5 : 3) + '" fill="' + p.c + '" fill-opacity="0.75"' + (p.big ? ' stroke="#000"' : '') + '><title>' + esc(p.t) + '</title></circle>').join('') +
    '<text x="' + (W / 2) + '" y="' + (H - 6) + '" font-size="11" text-anchor="middle">' + esc(xl) + '</text><text x="12" y="' + (H / 2) + '" font-size="11" text-anchor="middle" transform="rotate(-90 12 ' + (H / 2) + ')">' + esc(yl) + '</text></svg>';
}
function table(head, body) { return '<table><thead><tr>' + head.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' + body.map(r => '<tr>' + r.map(c => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>'; }
function htmlReport(d, rs, title) {
  const armies = [...new Set(rs.map(r => r.army))].sort(), hue = a => HUES[armies.indexOf(a) % HUES.length], oddIds = new Set(d.odd.map(o => o.id));
  const mp = rs.filter(r => r.res === 'mp'), grp = B.groupBy(rs, ['res', 'cls'], ['cost', 'wait', 'af', 'pen', 'speed']), pv = B.pivot(mp, 'cls', 'army', 'cost', 'median'), pw = B.pivot(rs, 'cls', 'army', 'wait', 'median');
  const cols = B.COLS.map(c => c.id);
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>body{font:13px/1.4 Segoe UI,Arial,sans-serif;margin:16px;color:#1c2330}table{border-collapse:collapse;margin:6px 0}th,td{border:1px solid #d5d9df;padding:2px 6px;text-align:left}th{background:#eef1f5;position:sticky;top:0}td.n{text-align:right}h2{margin-top:22px}.k{display:inline-block;width:10px;height:10px;margin:0 3px 0 10px}.s3{background:#fbe3e0}.s2{background:#fdf3d0}</style></head><body>' +
    '<h1>' + esc(title) + '</h1><p>' + rs.length + ' units in the buy panel, ' + armies.length + ' armies, ' + d.odd.filter(o => rs.some(r => r.id === o.id)).length + ' notes on units that do not fit the pattern. Made by ARSENAL balance.</p>' +
    '<h2>Groups</h2>' + '<p>Paid with: mp = manpower, sp = special points (hero button); a mod budget keeps its own name. Prices in different resources are shown apart and never compared. Wait at start = cooldown x factor x (1 - fore).</p>' + table(['Paid with | class', 'Units', 'Price min', 'median', 'max', 'Wait at start median s', 'Armour front median', 'Pen 100 m median', 'Speed median'], grp.map(g => [g.key, g.n, g.cost.min, g.cost.median, g.cost.max, g.wait.median, g.af.median, g.pen.median, g.speed.median])) +
    bars('Median manpower price by class', B.groupBy(mp, ['cls'], ['cost']).map(g => ({ k: g.key, v: g.cost.median, n: g.n }))) +
    bars('Median wait at start by class', B.groupBy(rs, ['cls'], ['wait']).map(g => ({ k: g.key, v: g.wait.median, n: g.n })), ' s') +
    '<h2>Median wait at start (s): class by army</h2>' + table(['Class'].concat(pw.cols), pw.rows.map((k, i) => [k].concat(pw.cells[i].map(v => v == null ? '' : v)))) +
    scatter('Wait at start (up) against manpower price (across)', mp.filter(r => r.wait != null && r.cost != null).map(r => ({ x: r.cost, y: r.wait, c: hue(r.army), big: oddIds.has(r.id), t: r.name + ' (' + r.id + '): price ' + r.cost + ', wait ' + r.wait + ' s (cooldown ' + r.charge + ', fore ' + r.fore + ')' })), 'price mp', 'wait at start s') +
    '<h2>Median manpower price: class by army</h2>' + table(['Class'].concat(pv.cols), pv.rows.map((k, i) => [k].concat(pv.cells[i].map(v => v == null ? '' : v)))) +
    '<h2>Price against the model</h2><p>The model price is what units of the same class with the same armour, gun and speed cost. Points far from the dashed line are priced off the pattern. ' + armies.map(a => '<span class="k" style="background:' + hue(a) + '"></span>' + esc(a)).join('') + '</p>' +
    scatter('Price (up) against model price (across)', rs.filter(r => r.fit != null && r.cost != null).map(r => ({ x: r.fit, y: r.cost, c: hue(r.army), big: oddIds.has(r.id), t: r.name + ' (' + r.id + ', ' + r.army + '): price ' + r.cost + ', model ' + r.fit })), 'model price', 'price', true) +
    scatter('Manpower price (up) against front armour (across)', mp.filter(r => r.af != null && r.cost != null).map(r => ({ x: r.af, y: r.cost, c: hue(r.army), t: r.name + ' (' + r.id + '): armour ' + r.af + ', price ' + r.cost })), 'armour front mm', 'price') +
    '<h2>Models</h2>' + table(['Class', 'Units', 'Fit (R2)', 'Uses'], Object.entries(d.models).map(([k, m]) => [k, m.n, m.r2 + (m.weak ? ' (no pattern, not used)' : ''), m.weights.map(w => w.f + ' ' + (w.w > 0 ? '+' : '') + w.w).join(', ')])) +
    '<h2>Units that do not fit</h2><table><thead><tr><th>Unit</th><th>Army</th><th>Class</th><th>What</th></tr></thead><tbody>' + d.odd.filter(o => rs.some(r => r.id === o.id)).map(o => '<tr class="s' + o.sev + '"><td>' + esc(o.name) + ' (' + esc(o.id) + ')</td><td>' + esc(o.army) + '</td><td>' + esc(o.cls) + '</td><td>' + esc(o.text) + '</td></tr>').join('') + '</tbody></table>' +
    '<h2>Sheet</h2><table><thead><tr>' + cols.map(c => '<th>' + esc(B.COL.get(c).label) + '</th>').join('') + '</tr></thead><tbody>' + rs.map(r => '<tr>' + cols.map(c => '<td' + (B.COL.get(c).t === 'n' ? ' class="n"' : '') + '>' + esc(r[c]) + '</td>').join('') + '</tr>').join('') + '</tbody></table></body></html>\n';
}

// presets (mod over game): which button is paid with which resource, and the cooldown factors
// gid 'goh' (or a gen Ctx with target goh): the GoH presets sit in games/presets/** (budget.inc, preset_*.inc [V data]); the test
// presets and the bot presets are left out as in AS2
function readEconomy(pctx, gid) {
  const goh = (gid || (pctx && pctx.target)) === 'goh';
  const texts = []; let keys = [];
  try { keys = pctx.keys(goh ? /^resource\/set\/multiplayer\/games\/.+\.(inc|set)$/ : /^resource\/set\/multiplayer\/games\/[^/]+\.(inc|set)$/); } catch (e) { keys = []; }
  for (const k of keys.sort()) {
    if (/\/(bots_[^/]*|presets_test)\.inc$/.test(k)) continue;   // bots and the test mode run without cooldowns: not what players get
    if (goh && /\/(preset_test_[^/]*|bots_[^/]*)\.inc$|\/bots\//.test(k)) continue;
 try { const t = pctx.read(k).toString('latin1'); if (/budgets|chargeFactors|\b(start|doctrine|finish)\(/.test(t) && (goh || /budgets|chargeFactors/.test(t))) texts.push(t); } catch (e) { /* unreadable preset: skipped */ } }
  return goh ? B.economy(texts, { game: 'goh' }) : B.economy(texts);
}
// the game of a run: opt.game (CLI --exe / --target), else the units lib gidOf: the GUI ctx's game (ctx.gameId), else goh for a GoH
// install folder, else as64 (as before)
const gameIdOf = (U, ctx0, opt, game) => (opt && opt.game) || U.gidOf(ctx0, null, game);
// gen Ctx for the game: the Units page's newCtx with the game id (units lib: Ctx target = the id; mowas2 builds the vfs with exe
// mowas_2, goh reads the GoH install given as goh), so the Balance page, the Units page and this CLI make the same Ctx
function genCtx(U, gid, game, out, plan) {
  return U.newCtx(game, out, plan, gid || 'as64');
}
// a ctx for the catalogue of a game other than as64: statsheet gets --exe (when the caller's runner has not added it) and the
// catalogue cache lives in a folder of its own, so the three games never share a catalogue
function gameCtx(ctx0, gid) {
  if (gid === 'as64') return ctx0;
  const exe = require('../lib/games').exeOf(gid), c = Object.create(ctx0);
  c.tmpRoot = path.join(ctx0.tmpRoot || path.join(os.tmpdir(), 'as2-balance'), 'game-' + gid);
  c.runTool = (tool, entry, args, opt) => ctx0.runTool(tool, entry, tool === 'statsheet' && !args.includes('--exe') ? args.concat(['--exe', exe]) : args, opt);
  if (typeof c.exe !== 'function') c.exe = () => exe;
  if (typeof c.gameId !== 'function') c.gameId = () => gid;
  if (typeof c.kind !== 'function') c.kind = () => require('../lib/games').kindOf(gid);
  return c;
}
// a GoH mod folder: any folder outside the GoH install the user names (lib/writeguard refuses the install and its mods/);
// read (the table, no change): <GoH>/mods/<name> and any folder outside the install pass too, only the install's own data is refused
function gohMod(folder, game, read) {
  const a = path.resolve(String(folder));
  if (!fs.existsSync(a) || !fs.statSync(a).isDirectory()) throw Object.assign(new Error('The mod folder was not found: ' + a), { status: 400 });
  if (read && game) { const r = path.relative(path.resolve(game), a); if (r.startsWith('..') || path.isAbsolute(r) || /^mods[\\/][^\\/]+$/i.test(r)) return a; }
  const why = require('../lib/writeguard').refuseWrite(a, { game, purpose: 'balance --change', allowGameMods: false });
  if (why) throw Object.assign(new Error(why), { status: 400 });
  return a;
}
async function load(game, folder, tmp, ctx0, opt) {
  // the Units page helpers: same catalogue cache, same guards (never the game folder, never a Workshop folder)
  const U = require('../gui/ext/units/server').lib;
  const gid = gameIdOf(U, ctx0, opt, game);
  if (gid === 'goh' && ctx0 && typeof ctx0.curDir === 'function' && ctx0.curDir()) game = ctx0.curDir();
  // the CLI ctx: the game id from --exe / --target (gameId, exe, kind as a GUI ctx has them; no game = as64, as before)
  if (!ctx0) {
    const G = require('../lib/games');
    ctx0 = { gamedir: game, tools: TOOLS, tmpRoot: tmp || path.join(os.tmpdir(), 'as2-balance'), allowLaunch: false, game: () => game, runTool,
      gameId: () => gid, exe: () => G.exeOf(gid), kind: () => G.kindOf(gid), curDir: () => game };
  }
  const cx = gameCtx(ctx0, gid);
  fs.mkdirSync(cx.tmpRoot, { recursive: true });
  const mod = folder ? (gid === 'goh' ? gohMod(folder, game, !!(opt && opt.read)) : U.modOf({ mod: folder }, game, true)) : null;
  const { van, cur } = await U.both(cx, game, mod);
  const pctx = genCtx(U, gid, game, mod || path.join(cx.tmpRoot, 'none'), true), O = U.gen().ops;
  const eco = readEconomy(pctx, gid);
  const bo = { gunFacts: n => O.gunFacts(pctx, n), economy: eco };
  if (gid === 'goh') bo.game = 'goh';
  const d = B.build(cur, mod ? van : null, bo);
  return { U, ctx0: cx, mod, cur, van, d, game: gid, dir: game, newCtx: (out, plan) => genCtx(U, gid, game, out, plan) };
}

async function main(argv) {
  const o = parseArgs(argv);
  // --exe with no game folder: that game's install (games.install; GoH = the GoH install)
  if (!o.pos.length && o.game) { const d = require('../lib/games').install(o.game).dir; if (d) o.pos.push(d); }
  if (o.pos.length !== 1) usage(2, 'give the game folder');
  const game = path.resolve(o.pos[0]); if (!fs.existsSync(path.join(game, 'resource'))) usage(2, game + ' has no resource folder');
  // a --change column GoH does not offer: refused at the start, before the catalogue is read (exit 2, one line)
  if (o.change && o.game === 'goh') {
    const f0 = o.change.trim().split(/\s+/)[0], no = B.gohChangeNo(f0 === 'af' ? 'armor' : f0);
    if (no && B.EDIT[f0 === 'af' ? 'armor' : f0]) require('../lib/games').refuse('balance --change ' + f0, 'goh', no.why, no.row);
  }
  let L; try { L = await load(game, o.folder, o.tmp, null, o.game ? { game: o.game } : null); } catch (e) { console.error('balance: ' + e.message); process.exit(e.status === 400 ? 1 : 2); }
  const { d } = L;
  let where; try { where = B.parseWhere(o.where); } catch (e) { usage(2, e.message); }
  let rs = B.select(d.rows, where); if (o.sort) rs = B.sortRows(rs, o.sort);
  const cols = o.cols ? o.cols.split(',').map(s => s.trim()).filter(Boolean) : null;
  if (cols) for (const c of cols) if (!B.COL.has(c)) usage(2, 'no column "' + c + '"');
  const emit = text => { if (o.out) { fs.writeFileSync(path.resolve(o.out), text); if (!o.q) console.log('wrote ' + path.resolve(o.out)); } else process.stdout.write(text); };
  const ids = new Set(rs.map(r => r.id)), odd = d.odd.filter(x => ids.has(x.id));

  if (o.change) {
    if (!L.mod) usage(2, '--change needs --folder <your mod folder>');
    const t = o.change.trim().split(/\s+/); let plan;
    const ch = { field: t[0], op: t[1], value: t[2], step: o.step }; if (L.game === 'goh') ch.game = 'goh';
    try { plan = B.planChange(rs, ch); } catch (e) { console.error('balance: ' + e.message); process.exit(1); }
    const ctx = L.newCtx(L.mod, !!o.plan), ap = require('./apply').apply(ctx, L.cur, plan, { game: L.game });
    const res = L.U.finish(ctx, game, L.mod, { write: !o.plan }, { rows: ap.rows, skipped: ap.skipped });
    if (o.json) console.log(JSON.stringify({ selected: rs.length, rows: res.rows, skipped: res.skipped, errors: res.errors, warnings: res.warnings, files: res.files.map(f => f.file), written: res.written }, null, 1));
    else {
      console.log((o.plan ? 'plan (nothing written): ' : res.written ? 'written: ' : 'not written: ') + res.rows.length + ' change(s) on ' + rs.length + ' selected unit(s), ' + res.skipped.length + ' skipped');
      for (const r of res.rows) console.log('  ' + r.id + ' ' + r.field + (r.part ? ' ' + r.part : '') + ': ' + r.old + ' -> ' + r.new + (r.waitNew != null ? '  (wait at start ' + r.waitOld + ' s -> ' + r.waitNew + ' s)' : '') + (r.note ? '  (' + r.note + ')' : ''));
      for (const s of res.skipped.slice(0, 20)) console.log('  skipped ' + s.id + ': ' + s.why);
      for (const e of res.errors) console.log('  ERROR ' + e.msg);
      for (const f of res.files) console.log('  file ' + f.file);
    }
    process.exit(res.errors.length ? 1 : 0);
  }
  if (o.html) { fs.writeFileSync(path.resolve(o.html), htmlReport(d, rs, 'Balance: ' + (L.mod ? path.basename(L.mod) + ' on ' : '') + path.basename(game) + (o.where ? ' [' + o.where + ']' : ''))); if (!o.q) console.log('wrote ' + path.resolve(o.html)); return; }
  if (o.sheet) return emit(o.sheet === 'json' ? JSON.stringify(rs, null, 1) + '\n' : o.sheet === 'md' ? B.toMd(rs, cols || ['id', 'name', 'army', 'cls', 'res', 'cost', 'fit', 'off', 'rank', 'charge', 'fore', 'wait', 'af', 'pen', 'dmg', 'reload', 'speed', 'men', 'odd']) : B.toCsv(rs, cols));
  if (o.group) {
    const keys = o.group.split(',').map(s => s.trim()), of = (o.of || 'cost').split(',').map(s => s.trim()); for (const c of keys.concat(of)) if (!B.COL.has(c)) usage(2, 'no column "' + c + '"');
    const g = B.groupBy(rs, keys, of); if (o.json) return emit(JSON.stringify(g, null, 1) + '\n');
    return emit(['group', 'n'].concat(...of.map(f => [f + ' min', 'q1', 'median', 'mean', 'q3', 'max'])).join(',') + '\r\n' + g.map(x => [x.key, x.n].concat(...of.map(f => [x[f].min, x[f].q1, x[f].median, x[f].mean, x[f].q3, x[f].max])).map(v => v == null ? '' : /,/.test(String(v)) ? '"' + v + '"' : v).join(',')).join('\r\n') + '\r\n');
  }
  if (o.pivot) {
    const [a, b] = o.pivot.split(',').map(s => s.trim()); for (const c of [a, b, o.of || 'cost'].filter(Boolean)) if (!B.COL.has(c)) usage(2, 'no column "' + c + '"');
    const p = B.pivot(rs, a, b, o.of || 'cost', o.stat || 'median'); if (o.json) return emit(JSON.stringify(p, null, 1) + '\n');
    return emit([a + ' \\ ' + (b || '')].concat(p.cols).join(',') + '\r\n' + p.rows.map((k, i) => [k].concat(p.cells[i].map(v => v == null ? '' : v)).join(',')).join('\r\n') + '\r\n');
  }
  if (o.models) return emit(o.json ? JSON.stringify(d.models, null, 1) + '\n' : Object.entries(d.models).map(([k, m]) => k + ': ' + m.n + ' units, R2 ' + m.r2 + (m.weak ? ' (no pattern, not used)' : '') + ', ' + m.weights.map(w => w.f + ' ' + (w.w > 0 ? '+' : '') + w.w).join(' ')).join('\n') + '\n');
  if (o.odd) return emit(o.json ? JSON.stringify(odd, null, 1) + '\n' : odd.map(x => (x.sev === 3 ? '!!! ' : x.sev === 2 ? '!!  ' : '!   ') + x.code + ' ' + x.id + ' (' + x.army + ', ' + x.cls + '): ' + x.text).join('\n') + '\n' + odd.length + ' note(s) on ' + new Set(odd.map(x => x.id)).size + ' of ' + rs.length + ' unit(s)\n');
  // summary
  const g = B.groupBy(rs, ['res', 'cls'], ['cost', 'wait']), eco = d.economy;
  if (o.json) return emit(JSON.stringify({ units: rs.length, groups: g, odd: odd.length, models: d.models, economy: eco }, null, 1) + '\n');
  emit(rs.length + ' unit(s) in the buy panel' + (L.mod ? ' (' + rs.filter(r => r.src !== 'game').length + ' changed or added by the mod)' : '') + '\n' + g.map(x => '  ' + x.key.padEnd(14) + String(x.n).padStart(4) + '  price ' + x.cost.min + ' .. ' + x.cost.median + ' .. ' + x.cost.max + '   wait at start ' + x.wait.min + ' .. ' + x.wait.median + ' .. ' + x.wait.max + ' s').join('\n') + '\n' +
    'paid with: ' + ((eco && eco.budgets.length) ? eco.budgets.map(b => b.res + ' = buttons ' + b.buttons.join(' ') + (b.start != null ? ' (starts with ' + b.start + ')' : '')).join('; ') : 'mp (no presets read; hero button = sp)') + '. Prices in different resources are not compared.\n' +
    (L.game === 'goh' ? 'wait at start = charge delay x factor (' + ((eco && eco.factors) || '*=1') + '), once at game start; after a buy the unit waits interval x factor (group none: alone).'
      : 'wait at start = cooldown x factor (' + ((eco && eco.factors) || '*=1') + ') x (1 - fore); after a buy the group waits cooldown x factor.') + (eco && eco.factorSets.length > 1 ? ' Other presets use: ' + eco.factorSets.filter(x => x !== eco.factors).join(' | ') + '.' : '') + '\n' + odd.length + ' note(s) on units that do not fit the pattern (--odd). Views: --sheet csv, --group cls,army, --pivot cls,army, --html report.html\n');
}
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e.stack || e.message); process.exit(2); });
module.exports = { htmlReport, load, readEconomy, genCtx, gameCtx };
