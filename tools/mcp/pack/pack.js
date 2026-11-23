#!/usr/bin/env node
// pack: the skills and MCP tool groups of this toolkit as pieces, pack groups and one full pack; zips of them; install into Claude.
// Contract: tools/mcp/README.md "Pieces, groups and downloads". Pack groups: tools/mcp/packs.json. Lib + CLI.
//   node tools/mcp/pack/pack.js list [--json]
//   node tools/mcp/pack/pack.js zip --piece <id> | --group <id> | --all  --out <file.zip>
//   node tools/mcp/pack/pack.js install --piece <id> | --group <id> | --all  --target <target> [--write] [settings]
//   node tools/mcp/pack/pack.js uninstall [--piece <id> | --group <id> | --all] --target <target> [--write]
//   node tools/mcp/pack/pack.js status --target <target>
// piece ids: skill:<folder>, mcp:<tool group>, server:arsenal-gui. --piece and --group may be repeated or hold a comma list.
// target: claude-code-user | claude-code-project:<folder> | claude-desktop
//   claude-code-user     skills -> ~/.claude/skills ; servers -> user scope: `claude mcp add -s user` when claude is on PATH,
//                        else (or with --no-cli) a merge into ~/.claude.json key mcpServers
//   claude-code-project  skills -> <folder>/.claude/skills ; servers -> <folder>/.mcp.json
//   claude-desktop       servers -> claude_desktop_config.json (Windows %APPDATA%\Claude) ; skills: one zip each into a folder,
//                        to upload in Claude under Customize > Skills
// settings: --game as64|mowas2|goh  --write-roots "D:\mods;E:\work"  --allow-launch   (none = every tool only reads)
// Other: --home <dir> (use this folder as the home folder: tests and trials; then claude is never run), --appdata <dir>,
//   --skills-out <dir> (Claude Desktop: where the skill zips go), --no-cli, --replace (overwrite a skill folder this tool did not put).
// install and uninstall answer a preview unless --write. Before a config file is changed a copy <file>.arsenal-bak is made, once.
// Only the entries arsenal, arsenal-gui and arsenal-<group> are added, changed or removed; every other entry and key stays as it is.
// A config file that is not valid JSON is refused. What was put is written to arsenal-install.json in the target; uninstall
// removes only that. The servers run from THIS toolkit folder (its tools folder): keep it where it is, or install again after moving it.
// Author: Imperator_Aug (ARSENAL, ia-7f90cf03)
'use strict';
require('../../lib/help')(__filename);
const fs = require('fs'), fsp = fs.promises, os = require('os'), path = require('path'), zlib = require('zlib'), cp = require('child_process');
const { zip } = require('../../lib/zipwrite');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const GAMES = ['as64', 'mowas2', 'goh'];
const OURS = /^arsenal(-[a-z][a-z0-9_-]*)?$/;   // the only server names this tool ever adds, changes or removes
const MANIFEST = 'arsenal-install.json';
const bad = (m, extra) => Object.assign(new Error(m), { status: 400, plain: true }, extra || {});
const fwd = p => String(p).replace(/\\/g, '/');
const glob = pat => new RegExp('^' + String(pat).split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const inside = (child, parent) => { const r = path.relative(path.resolve(parent), path.resolve(child)); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };

// ---------------------------------------------------------------- discovery
async function walk(dir, rel, out) {
  let list = [];
  try { list = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { return out; }
  list.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const d of list) {
    const r = rel ? rel + '/' + d.name : d.name, p = path.join(dir, d.name);
    if (d.isDirectory()) { if (d.name !== 'node_modules' && d.name !== '.git') await walk(p, r, out); }
    else if (d.isFile()) { const st = await fsp.stat(p); out.push({ rel: r, bytes: st.size, mtime: Math.round(st.mtimeMs) }); }
  }
  return out;
}
function frontmatter(text) {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(text); const o = {};
  if (m) for (const l of m[1].split(/\r?\n/)) { const k = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(l); if (k) o[k[1]] = k[2].replace(/^["']|["']$/g, '').trim(); }
  return o;
}
const titleOf = text => { const m = /^#\s+(.+)$/m.exec(text.replace(/^\uFEFF?---[\s\S]*?\n---/, '')); return m ? m[1].trim() : ''; };
function listJson(file, env) {
  return new Promise(res => {
    cp.execFile(process.execPath, [file, '--list'], { cwd: ROOT, env: Object.assign({}, process.env, env || {}), maxBuffer: 32 << 20, windowsHide: true, timeout: 30000 },
      (e, out) => { try { res(JSON.parse(out)); } catch (x) { res({ tools: [], errors: [{ file: path.basename(file), error: e ? String(e.message).split('\n')[0] : 'no tool list' }] }); } });
  });
}
function loadPacks(root) {
  const f = path.join(root, 'tools', 'mcp', 'packs.json');
  let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { throw bad('tools/mcp/packs.json does not read as JSON: ' + e.message); }
  if (!Array.isArray(j.groups)) throw bad('tools/mcp/packs.json has no "groups" list.');
  return j;
}
// what the piece list is made from: every skill file, the tool modules, the two servers, packs.json (name, size, time)
async function sources(root) {
  const skills = await walk(path.join(root, '.claude', 'skills'), '', []);
  const mcp = (await walk(path.join(root, 'tools', 'mcp'), '', [])).filter(f => /^(server\.js|gui\.js|packs\.json|CATALOG\.md|install\.md|lib\/|tools\/|gui\/)/.test(f.rel));
  const sig = require('crypto').createHash('sha1').update(JSON.stringify([skills, mcp].map(l => l.map(f => [f.rel, f.bytes, f.mtime])))).digest('hex');
  return { skills, sig };
}
const MEMO = new Map();   // root -> {sig, at, D, run}
// discover({root}) -> D = {root, sig, groupsFlag, pieces, groups, errors}. Kept per root while no source file changed (checked at most every 2 s).
async function discover(o) {
  const root = path.resolve((o && o.root) || ROOT), m = MEMO.get(root), now = Date.now();
  if (m && m.D && !(o && o.fresh) && now - m.at < 2000) return m.D;
  if (m && m.run) return m.run;
  const run = (async () => {
    const src = await sources(root);
    if (m && m.D && m.sig === src.sig) { m.at = Date.now(); return m.D; }
    const D = await build(root, src);
    MEMO.set(root, { sig: src.sig, at: Date.now(), D });
    stats.builds++;
    return D;
  })();
  MEMO.set(root, Object.assign({}, m || {}, { run }));
  try { return await run; } finally { const c = MEMO.get(root); if (c && c.run === run) { delete c.run; if (!c.D) MEMO.delete(root); } }
}
const stats = { builds: 0 };
async function build(root, src) {
  const P = loadPacks(root), errors = [], pieces = [];
  const serverJs = path.join(root, 'tools', 'mcp', 'server.js'), guiJs = path.join(root, 'tools', 'mcp', 'gui.js');
  // skills: every folder of .claude/skills with a SKILL.md
  const by = new Map();
  for (const f of src.skills) { const i = f.rel.indexOf('/'); if (i < 0) continue; const n = f.rel.slice(0, i); if (!by.has(n)) by.set(n, []); by.get(n).push({ rel: f.rel.slice(i + 1), bytes: f.bytes }); }
  for (const [name, files] of by) {
    if (!files.some(f => f.rel === 'SKILL.md')) continue;
    let text = ''; try { text = await fsp.readFile(path.join(root, '.claude', 'skills', name, 'SKILL.md'), 'utf8'); } catch (e) { errors.push({ file: name + '/SKILL.md', error: e.message }); }
    const fm = frontmatter(text);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) { errors.push({ file: name, error: 'skill folder name has other characters than letters, digits, . _ -; left out' }); continue; }
    pieces.push({ id: 'skill:' + name, kind: 'skill', name, title: titleOf(text) || fm.name || name, what: fm.description || '', bytes: files.reduce((a, f) => a + f.bytes, 0),
      files: files.sort((a, b) => (a.rel === 'SKILL.md' ? -1 : b.rel === 'SKILL.md' ? 1 : a.rel < b.rel ? -1 : 1)), tools: [], lines: text ? text.split(/\r?\n/).length : 0 });
  }
  // MCP groups: the server's own list (a child, so the answer is what Claude would get)
  const [sl, gl] = await Promise.all([fs.existsSync(serverJs) ? listJson(serverJs, { ARSENAL_MCP_GROUPS: '' }) : { tools: [], errors: [{ file: 'server.js', error: 'not found' }] },
    fs.existsSync(guiJs) ? listJson(guiJs) : { tools: [], errors: [{ file: 'gui.js', error: 'not found' }] }]);
  for (const e of [].concat(sl.errors || [], gl.errors || [])) errors.push(e);
  let groupsFlag = false; try { groupsFlag = /--groups/.test(fs.readFileSync(serverJs, 'utf8')); } catch (e) { /* no server */ }
  const tg = new Map();
  for (const t of sl.tools || []) { const g = t.group || 'other'; if (!tg.has(g)) tg.set(g, []); tg.get(g).push({ name: t.name, title: t.title || (t.annotations && t.annotations.title) || '', kind: t.kind || 'read' }); }
  for (const [g, tools] of tg) {
    if (!/^[a-z][a-z0-9_-]*$/.test(g)) { errors.push({ file: 'server.js', error: 'tool group name ' + g + ' left out' }); continue; }
    pieces.push({ id: 'mcp:' + g, kind: 'mcp', name: g, server: 'arsenal-' + g, title: 'MCP tools: ' + g, what: (P.mcpWhat && P.mcpWhat[g]) || tools.map(t => t.title).filter(Boolean).join(', '),
      bytes: 0, files: [], tools, writes: tools.some(t => t.kind === 'write'), launches: tools.some(t => t.kind === 'launch') });
  }
  if (fs.existsSync(guiJs)) pieces.push({ id: 'server:arsenal-gui', kind: 'server', name: 'arsenal-gui', server: 'arsenal-gui', title: 'MCP server: the ARSENAL window',
    what: 'Lets Claude see and use the ARSENAL window: its pages, routes and jobs. The window must be running.', bytes: 0, files: [],
    tools: (gl.tools || []).map(t => ({ name: t.name, title: t.title || (t.annotations && t.annotations.title) || '', kind: t.kind || 'read' })), launches: (gl.tools || []).some(t => t.kind === 'launch') });
  // pack groups by pattern; unmatched -> other
  const groups = P.groups.map(g => ({ id: String(g.id), title: g.title || g.id, what: g.what || '', pieces: [] }));
  const other = { id: (P.other && P.other.id) || 'other', title: (P.other && P.other.title) || 'Other', what: (P.other && P.other.what) || '', pieces: [] };
  for (const p of pieces) {
    p.groups = [];
    P.groups.forEach((g, i) => { const pats = p.kind === 'skill' ? g.skills : p.kind === 'mcp' ? g.mcp : g.servers; if ((pats || []).some(x => glob(x).test(p.name))) { groups[i].pieces.push(p.id); p.groups.push(groups[i].id); } });
    if (!p.groups.length) { other.pieces.push(p.id); p.groups.push(other.id); }
  }
  if (other.pieces.length) groups.push(other);
  const all = { id: (P.all && P.all.id) || 'all', title: (P.all && P.all.title) || 'Everything', what: (P.all && P.all.what) || '', pieces: pieces.map(p => p.id), all: true };
  const byId = new Map(pieces.map(p => [p.id, p]));
  for (const g of groups.concat(all)) {
    const ps = g.pieces.map(i => byId.get(i));
    g.skills = ps.filter(p => p.kind === 'skill').length; g.tools = ps.reduce((a, p) => a + p.tools.length, 0); g.bytes = ps.reduce((a, p) => a + p.bytes, 0);
    g.mcp = ps.filter(p => p.kind === 'mcp').map(p => p.name); g.servers = ps.filter(p => p.kind === 'server').map(p => p.name);
  }
  return { root, sig: src.sig, groupsFlag, pieces, groups: groups.filter(g => g.pieces.length), all, errors };
}

// ---------------------------------------------------------------- selection
// sel = {piece: id | [ids]} | {group: id | [ids]} | {all: true} -> {key, label, pieces, group?, all}
const many = v => (v == null ? [] : Array.isArray(v) ? v : String(v).split(',')).map(s => String(s).trim()).filter(Boolean);
function select(D, sel) {
  sel = sel || {};
  const byId = new Map(D.pieces.map(p => [p.id, p]));
  if (sel.all) return { key: 'all', label: D.all.title, pieces: D.pieces.slice(), all: true };
  const gs = many(sel.group), ps = many(sel.piece), out = new Map();
  for (const g of gs) { if (g === D.all.id) return { key: 'all', label: D.all.title, pieces: D.pieces.slice(), all: true }; const G = D.groups.find(x => x.id === g); if (!G) throw bad('No pack group named ' + g + '. Groups: ' + D.groups.map(x => x.id).join(', ') + ', ' + D.all.id + '.'); G.pieces.forEach(i => out.set(i, byId.get(i))); }
  for (const p of ps) { if (!byId.has(p)) throw bad('No piece named ' + p + '. Run "list" to see the pieces.'); out.set(p, byId.get(p)); }
  if (!out.size) throw bad('Name what to take: --piece <id>, --group <id> or --all.');
  const one = gs.length === 1 && !ps.length ? D.groups.find(x => x.id === gs[0]) : null;
  return { key: one ? 'group-' + one.id : ps.length === 1 && !gs.length ? ps[0].replace(/^[a-z]+:/, '') : 'pick', label: one ? one.title : [...out.keys()].join(', '), pieces: [...out.values()], group: one || null, all: false };
}

// ---------------------------------------------------------------- server entries
function envOf(o) {
  const e = {}; o = o || {};
  if (o.game != null && o.game !== '') { if (!GAMES.includes(o.game)) throw bad('The default game must be as64, mowas2 or goh.'); e.ARSENAL_GAME = o.game; }
  const roots = many(Array.isArray(o.writeRoots) ? o.writeRoots : String(o.writeRoots || '').split(';'));
  for (const r of roots) { if (!path.isAbsolute(r)) throw bad('A folder Claude may write to must be a full path: ' + r); if (/["%\r\n]/.test(r)) throw bad('A folder Claude may write to has a character that cannot be used here (quote or percent sign): ' + r); }
  if (roots.length) e.ARSENAL_WRITE_ROOTS = roots.map(r => path.resolve(r)).join(';');
  if (o.allowLaunch === true || o.allowLaunch === '1' || o.allowLaunch === 1) e.ARSENAL_ALLOW_LAUNCH = '1';
  return e;
}
// the servers a selection needs: [{name, args, groups (null = all), what}]
function serversOf(D, S) {
  const out = [], mcp = S.pieces.filter(p => p.kind === 'mcp').map(p => p.name), sj = path.join(D.root, 'tools', 'mcp', 'server.js');
  if (S.all) { if (mcp.length) out.push({ name: 'arsenal', args: [sj], groups: null }); }
  else if (S.group && mcp.length) out.push({ name: 'arsenal-' + S.group.id, args: [sj, '--groups', mcp.join(',')], groups: mcp });
  else for (const g of mcp) out.push({ name: 'arsenal-' + g, args: [sj, '--groups', g], groups: [g] });
  if (S.pieces.some(p => p.kind === 'server' && p.name === 'arsenal-gui')) out.push({ name: 'arsenal-gui', args: [path.join(D.root, 'tools', 'mcp', 'gui.js')], groups: [] });
  return out;
}
const entryOf = (s, env, desktop) => Object.assign(desktop ? {} : { type: 'stdio' }, { command: 'node', args: s.args.slice(), env: Object.assign({}, env) });

// ---------------------------------------------------------------- zips
function skillFiles(D, p, prefix) {
  const dir = path.join(D.root, '.claude', 'skills', p.name);
  return p.files.map(f => [prefix + p.name + '/' + f.rel, fs.readFileSync(path.join(dir, ...f.rel.split('/'))), true]);
}
const skillZip = (D, p) => zip(skillFiles(D, p, ''));   // <name>/SKILL.md + its files: the folder is the zip's root, the shape Claude's skill upload takes
function readme(D, S, servers) {
  const sk = S.pieces.filter(p => p.kind === 'skill'), L = [];
  L.push('# ARSENAL for Claude: ' + S.label, '');
  L.push('Skills and MCP servers that let Claude help with modding and playing Men of War: Assault Squad 2, its AS64 build and Gates of Hell.', '');
  L.push('Made from the ARSENAL toolkit folder:', '', '    ' + D.root, '');
  if (servers.length) L.push('**The MCP servers run from that folder (its `tools` folder) and need Node.js.** This zip holds only the entries that point at it, not the tools. Keep the toolkit where it is; after moving it, download again or install again from its Claude page.', '');
  L.push('## What is inside', '');
  if (sk.length) L.push('- `skills/`: ' + sk.length + ' skill folder' + (sk.length === 1 ? '' : 's') + ' (' + sk.map(p => p.name).join(', ') + ').', '- `skill-zips/`: the same skills, one zip each, for upload in the Claude app.');
  if (servers.length) L.push('- `mcp/mcp.json`: the server entries for Claude Code.', '- `mcp/claude_desktop_config.json`: the same entries for Claude Desktop.');
  L.push('- `install.cmd`, `install.js`: the installer.');
  if (S.all) L.push('- `CATALOG.md`: every tool and skill, one line each.', '- `install.md`: the long install notes.');
  L.push('', '## Install', '');
  L.push('Double-click `install.cmd`, or in a terminal:', '', '    node install.js                                   show what would be done for Claude Code (your user)', '    node install.js --write                           do it',
    '    node install.js --target claude-code-project:D:\\my-project --write', '    node install.js --target claude-desktop --write', '    node install.js uninstall --write                 take out what was put', '');
  L.push('Nothing is changed without `--write`. Before a settings file is changed a copy `<file>.arsenal-bak` is made. Only the entries named `arsenal`, `arsenal-gui` and `arsenal-<group>` are touched; your other servers stay as they are.', '');
  L.push('Settings (all optional, out of the box every tool only reads): `--game as64|mowas2|goh`, `--write-roots "D:\\my-mods"` (folders Claude may change), `--allow-launch` (Claude may start the game).', '');
  L.push('## By hand', '');
  if (sk.length) L.push('- Claude Code: copy the folders in `skills/` into `~/.claude/skills` (every project) or `<project>/.claude/skills`.', '- Claude app: Customize > Skills > upload each zip of `skill-zips/`.');
  if (servers.length) {
    L.push('- Claude Code: put the entries of `mcp/mcp.json` into `<project>/.mcp.json`, or run:', '');
    for (const s of servers) L.push('      claude mcp add -s user ' + s.name + ' -- node ' + s.args.map(a => (/\s/.test(a) ? '"' + a + '"' : a)).join(' '));
    L.push('', '- Claude Desktop: Settings > Developer > Edit Config, put the entries of `mcp/claude_desktop_config.json` under `mcpServers`, then close and reopen Claude Desktop.');
  }
  if (servers.length && !D.groupsFlag) L.push('', 'Note: this toolkit\'s server does not narrow its tool list by group yet, so an entry for one group still serves every tool.');
  L.push('', '## After installing', '', 'Claude Code: start a new session, `/mcp` lists the servers. Claude Desktop: close and reopen it.', '');
  return L.join('\n');
}
function installJs(D, S) {
  const argv = S.all ? ['--all'] : S.group ? ['--group', S.group.id] : ['--piece', S.pieces.map(p => p.id).join(',')];
  return ['#!/usr/bin/env node',
    '// Installer of an ARSENAL pack for Claude. It runs the installer of the ARSENAL toolkit this zip was made from.',
    '// node install.js [install|uninstall|status] [--target claude-code-user | claude-code-project:<folder> | claude-desktop] [--write]',
    "'use strict';",
    'var path = require("path"), fs = require("fs");',
    'var ROOT = ' + JSON.stringify(D.root) + ';   // the toolkit folder (filled in when the zip was made)',
    'var WHAT = ' + JSON.stringify(argv) + ';',
    'var pack = path.join(ROOT, "tools", "mcp", "pack", "pack.js");',
    'if (!fs.existsSync(pack)) {',
    '  console.log("The ARSENAL toolkit was not found at " + ROOT + ".");',
    '  console.log("The MCP servers need its tools folder, so they cannot be installed from this zip alone.");',
    '  console.log("The skills can be copied by hand: see README.md, By hand.");',
    '  process.exit(2);',
    '}',
    'var a = process.argv.slice(2), verb = /^(install|uninstall|status)$/.test(a[0] || "") ? a.shift() : "install";',
    'if (a.indexOf("--target") < 0) a.push("--target", "claude-code-user");',
    'process.argv = [process.argv[0], pack, verb].concat(verb === "status" ? [] : WHAT, a);',
    'require(pack).main(process.argv.slice(2)).then(function (c) { process.exitCode = c; }, function (e) { console.log(String(e && e.message || e)); process.exitCode = 1; });',
    ''].join('\n');
}
const INSTALL_CMD = ['@echo off', 'rem Shows what the installer would do, then asks. Needs Node.js.', 'node "%~dp0install.js" %*', 'if not "%~1"=="" goto end',
  'echo.', 'set /p GO=Type yes to do this for Claude Code (your user), anything else to stop: ', 'if /i "%GO%"=="yes" node "%~dp0install.js" --write', ':end', 'pause', ''].join('\r\n');
// zipOf(D, sel, {env}) -> {name, buf, entries: [names]}
function zipOf(D, sel, o) {
  const S = select(D, sel), env = envOf(o && o.env), servers = serversOf(D, S), files = [], T = s => Buffer.from(s, 'utf8');
  const sk = S.pieces.filter(p => p.kind === 'skill');
  const one = S.pieces.length === 1 && !S.group && !S.all ? S.pieces[0] : null;
  if (one && one.kind === 'skill') files.push(...skillFiles(D, one, ''));
  else {
    const mj = {}, dj = {};
    for (const s of servers) { mj[s.name] = entryOf(s, env, false); dj[s.name] = entryOf(s, env, true); }
    files.push(['README.md', T(readme(D, S, servers)), true]);
    for (const p of sk) files.push(...skillFiles(D, p, 'skills/'));
    for (const p of sk) files.push(['skill-zips/' + p.name + '.zip', skillZip(D, p), false]);
    if (servers.length) files.push(['mcp/mcp.json', T(JSON.stringify({ mcpServers: mj }, null, 2) + '\n'), true], ['mcp/claude_desktop_config.json', T(JSON.stringify({ mcpServers: dj }, null, 2) + '\n'), true]);
    if (one && one.kind !== 'skill') { files.splice(1, 0, ['mcp.json', T(JSON.stringify({ mcpServers: mj }, null, 2) + '\n'), true], ['claude_desktop_config.json', T(JSON.stringify({ mcpServers: dj }, null, 2) + '\n'), true]); files.splice(3, files.length - 3); }
    files.push(['install.cmd', T(INSTALL_CMD), true], ['install.js', T(installJs(D, S)), true]);
    if (S.all) for (const f of ['CATALOG.md', 'install.md']) { const p = path.join(D.root, 'tools', 'mcp', f); if (fs.existsSync(p)) files.push([f, fs.readFileSync(p), true]); }
  }
  const name = 'arsenal-claude-' + (S.all ? 'all' : S.key.replace(/[^A-Za-z0-9._-]+/g, '-')) + '.zip';
  return { name, buf: zip(files), entries: files.map(f => f[0]) };
}
// unzip(buf) -> Map name -> Buffer (store and deflate; for tests and checks of our own zips)
function unzip(buf) {
  let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip');
  const n = buf.readUInt16LE(e + 10), out = new Map(); let p = buf.readUInt32LE(e + 16);
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip directory');
    const m = buf.readUInt16LE(p + 10), cs = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nl).toString('latin1'), d = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28), raw = buf.slice(d, d + cs);
    const data = m === 8 ? zlib.inflateRawSync(raw) : raw;
    if (zlib.crc32(data) !== buf.readUInt32LE(p + 16)) throw new Error('bad checksum: ' + name);
    out.set(name, data); p += 46 + nl + xl + cl;
  }
  return out;
}

// ---------------------------------------------------------------- targets
// env ARSENAL_CLAUDE_HOME = a stand-in home folder for the whole process (trial runs of the GUI); the same as --home
function paths(target, o) {
  o = o || {};
  const over = o.home || process.env.ARSENAL_CLAUDE_HOME || '', home = path.resolve(over || os.homedir());
  const t = String(target || ''), i = t.indexOf(':'), kind = i < 0 ? t : t.slice(0, i), arg = i < 0 ? '' : t.slice(i + 1).trim();
  const root = path.resolve(o.root || ROOT);
  if (kind === 'claude-code-user') {
    if (arg) throw bad('The target claude-code-user takes no folder.');
    const ccd = !over && process.env.CLAUDE_CONFIG_DIR ? path.resolve(process.env.CLAUDE_CONFIG_DIR) : null, dir = ccd || path.join(home, '.claude');
    return { kind, target: kind, over: !!over, home, skills: path.join(dir, 'skills'), cfg: path.join(ccd || home, '.claude.json'), manifest: path.join(dir, MANIFEST), cli: !over && o.cli !== false };
  }
  if (kind === 'claude-code-project') {
    if (!arg || !path.isAbsolute(arg)) throw bad('Name the project folder with its full path: claude-code-project:<folder>.');
    const dir = path.resolve(arg);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw bad('The project folder does not exist: ' + dir);
    if (dir === root) throw bad('That folder is the ARSENAL toolkit itself. It already has the skills and the servers; pick your own project folder.');
    if (inside(dir, path.join(root, '.claude')) || inside(dir, path.join(root, 'tools'))) throw bad('That folder is inside the ARSENAL toolkit. Pick your own project folder.');
    return { kind, target: kind + ':' + dir, over: !!over, home, dir, skills: path.join(dir, '.claude', 'skills'), cfg: path.join(dir, '.mcp.json'), manifest: path.join(dir, '.claude', MANIFEST), cli: false };
  }
  if (kind === 'claude-desktop') {
    if (arg) throw bad('The target claude-desktop takes no folder.');
    const ad = o.appdata ? path.resolve(o.appdata) : over ? path.join(home, 'AppData', 'Roaming')
      : process.platform === 'win32' ? (process.env.APPDATA || path.join(home, 'AppData', 'Roaming')) : process.platform === 'darwin' ? path.join(home, 'Library', 'Application Support') : path.join(home, '.config');
    const dir = path.join(ad, 'Claude');
    return { kind, target: kind, over: !!over, home, appDir: dir, skills: null, zips: path.resolve(o.skillsOut || path.join(home, 'arsenal-claude-skills')), cfg: path.join(dir, 'claude_desktop_config.json'), manifest: path.join(dir, MANIFEST), cli: false };
  }
  throw bad('Unknown target ' + (t || '(none)') + '. Use claude-code-user, claude-code-project:<folder> or claude-desktop.');
}
function readManifest(P) {
  try { const j = JSON.parse(fs.readFileSync(P.manifest, 'utf8')); if (isObj(j) && j.by === 'arsenal') return Object.assign({ skills: {}, mcp: {}, zips: {} }, j); } catch (e) { /* none */ }
  return { v: 1, by: 'arsenal', skills: {}, mcp: {}, zips: {} };
}
function writeJson(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); const t = file + '.arsenal-tmp'; fs.writeFileSync(t, text); fs.renameSync(t, file); }
function saveManifest(P, M, root) {
  if (!Object.keys(M.skills).length && !Object.keys(M.mcp).length && !Object.keys(M.zips).length) { try { fs.unlinkSync(P.manifest); } catch (e) { /* none */ } return; }
  M.v = 1; M.by = 'arsenal'; M.root = root; M.target = P.target; M.at = new Date().toISOString();
  writeJson(P.manifest, JSON.stringify(M, null, 1) + '\n');
}
// a config file as {text, json, indent, eol, bom, exists}; refuses what is not a JSON object with an object under mcpServers
function readCfg(file) {
  if (!fs.existsSync(file)) return { exists: false, json: {}, indent: 2, eol: '\n', bom: '', tail: '\n' };
  const raw = fs.readFileSync(file, 'utf8'), bom = raw.charCodeAt(0) === 0xFEFF ? '\uFEFF' : '', text = bom ? raw.slice(1) : raw;
  let json;
  if (!text.trim()) json = {};
  else try { json = JSON.parse(text); } catch (e) { throw bad('The settings file is not valid JSON, so it was left as it is: ' + file + ' (' + String(e.message).split('\n')[0] + '). Fix or remove the file, then try again.', { badFile: file }); }
  if (!isObj(json)) throw bad('The settings file does not hold a JSON object, so it was left as it is: ' + file, { badFile: file });
  if (json.mcpServers != null && !isObj(json.mcpServers)) throw bad('The key "mcpServers" in the settings file is not an object, so the file was left as it is: ' + file, { badFile: file });
  const im = /\n([ \t]+)"/.exec(text);
  return { exists: true, json, indent: im ? im[1] : text.trim() && text.indexOf('\n') < 0 ? 0 : 2, eol: /\r\n/.test(text) ? '\r\n' : '\n', bom, tail: /\n\s*$/.test(text) ? '\n' : '' };
}
function writeCfg(file, C) {
  let t = JSON.stringify(C.json, null, C.indent) + (C.exists ? C.tail : '\n');
  if (C.eol === '\r\n') t = t.replace(/\r?\n/g, '\r\n');
  writeJson(file, C.bom + t);
}
function backup(file) {
  const b = file + '.arsenal-bak';
  if (!fs.existsSync(file)) return { made: false, file: b, why: 'new' };
  if (fs.existsSync(b)) return { made: false, file: b, why: 'kept' };
  fs.copyFileSync(file, b); return { made: true, file: b };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const N = (k, text, p) => ({ k, text, p: p || {} });   // a note or a next step: k = its name for a page that has its own words, text = plain English
let CLAUDE = null;   // is `claude` on PATH (asked once)
function claudeOnPath() {
  if (CLAUDE != null) return CLAUDE;
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : [''];
  CLAUDE = String(process.env.PATH || '').split(path.delimiter).filter(Boolean).some(d => exts.some(x => { try { return fs.statSync(path.join(d, 'claude' + x)).isFile(); } catch (e) { return false; } }));
  return CLAUDE;
}
// one `claude ...` call: {code, out}. Windows: the npm shim is a .cmd, so it goes through cmd.exe with every argument quoted here.
function runClaude(args) {
  return new Promise(res => {
    const q = a => { a = String(a); if (/["%\r\n]/.test(a)) throw bad('A value has a character that cannot be passed to the claude command (quote or percent sign): ' + a); return /[\s&|<>^;,=()!]/.test(a) || a === '' ? '"' + a.replace(/\\+$/, '') + '"' : a; };
    let c, out = '';
    try {
      c = process.platform === 'win32' ? cp.spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', '"claude ' + args.map(q).join(' ') + '"'], { windowsVerbatimArguments: true, windowsHide: true })
        : cp.spawn('claude', args, {});
    } catch (e) { return res({ code: -1, out: String(e.message) }); }
    const t = setTimeout(() => { try { c.kill(); } catch (e) { /* gone */ } }, 60000);
    c.stdout.on('data', d => { out += d; }); c.stderr.on('data', d => { out += d; });
    c.on('error', e => { clearTimeout(t); res({ code: -1, out: out + String(e.message) }); });
    c.on('close', code => { clearTimeout(t); res({ code, out: out.trim().slice(0, 4000) }); });
  });
}
const cliAdd = (s, env) => ['mcp', 'add', '-s', 'user', s.name].concat(...Object.keys(env).map(k => ['-e', k + '=' + env[k]]), ['--', 'node'], s.args);
const cliLine = a => 'claude ' + a.map(x => (/[\s;=]/.test(x) ? '"' + x + '"' : x)).join(' ');

// ---------------------------------------------------------------- install / uninstall / status
// install(D, sel, target, o) -> plan {target, write, method, files, steps, kept, notes, next, wrote, errors}
//   o: {write, home, appdata, skillsOut, cli, replace, env: {game, writeRoots, allowLaunch}, exec: async args -> {code, out}}
async function install(D, sel, target, o) {
  o = o || {};
  const S = select(D, sel), P = paths(target, Object.assign({ root: D.root }, o)), env = envOf(o.env), servers = serversOf(D, S), M = readManifest(P), write = o.write === true;
  // the claude command: only for claude-code-user with the real home folder; a stand-in exec (tests) is used wherever it is given
  const useCli = P.kind === 'claude-code-user' && o.cli !== false && (o.exec ? true : P.cli && claudeOnPath()), exec = o.exec || runClaude;
  const steps = [], notes = [], next = [], errors = [], sk = S.pieces.filter(p => p.kind === 'skill');
  const plan = { target: P.target, what: S.label, write, method: P.kind === 'claude-code-user' ? (useCli ? 'cli' : 'file') : 'file', home: P.over ? P.home : null,
    files: { skills: P.skills, zips: P.zips || null, config: P.cfg, manifest: P.manifest }, steps, kept: [], notes, next, errors, wrote: false };
  // 1 the config file is read first: a file that cannot be merged stops everything before a single byte is written
  let C = null;
  if (servers.length) {
    C = readCfg(P.cfg);
    plan.kept = Object.keys(C.json.mcpServers || {}).filter(n => !servers.some(s => s.name === n));
  }
  // 2 skills
  for (const p of sk) {
    if (P.skills) {
      const to = path.join(P.skills, p.name), there = fs.existsSync(to), ours = !!M.skills[p.name];
      if (there && !ours && !o.replace) { steps.push({ op: 'skill-skip', name: p.name, to, why: 'A folder with this name is already there and was not put by this installer. It is left as it is.' }); continue; }
      steps.push({ op: 'skill', name: p.name, to, files: p.files.map(f => f.rel), bytes: p.bytes, was: there ? 'replace' : 'new' });
    } else steps.push({ op: 'skill-zip', name: p.name, to: path.join(P.zips, p.name + '.zip'), bytes: p.bytes });
  }
  // 3 servers
  for (const s of servers) {
    const entry = entryOf(s, env, P.kind === 'claude-desktop'), old = C.json.mcpServers && C.json.mcpServers[s.name];
    steps.push({ op: 'mcp', name: s.name, file: P.cfg, entry, groups: s.groups, was: old == null ? 'new' : same(old, entry) ? 'same' : 'changed', cli: plan.method === 'cli' ? cliLine(cliAdd(s, env)) : null });
  }
  if (servers.length && C.exists && steps.some(x => x.op === 'mcp' && x.was !== 'same')) steps.unshift({ op: 'backup', file: P.cfg, to: P.cfg + '.arsenal-bak', was: fs.existsSync(P.cfg + '.arsenal-bak') ? 'kept' : 'new' });
  if (servers.length) notes.push(N('root', 'The servers run from the ARSENAL toolkit folder ' + D.root + ' (its tools folder) and need Node.js. Keep the folder where it is; after moving it, install again.', { d: D.root }));
  if (servers.length && !D.groupsFlag && servers.some(s => s.groups && s.groups.length)) notes.push(N('noGroups', 'This toolkit\'s server does not narrow its tool list by group yet, so an entry for one group still serves every tool.'));
  if (servers.some(s => s.name === 'arsenal') && Object.keys(M.mcp).some(n => n !== 'arsenal' && n !== 'arsenal-gui')) notes.push(N('twice', 'Entries for single groups are already installed (' + Object.keys(M.mcp).filter(n => n !== 'arsenal' && n !== 'arsenal-gui').join(', ') + '). With the full server beside them Claude sees those tools twice; uninstall the single ones if you do not want that.', { l: Object.keys(M.mcp).filter(n => n !== 'arsenal' && n !== 'arsenal-gui').join(', ') }));
  if (!env.ARSENAL_WRITE_ROOTS && servers.length) notes.push(N('readOnly', 'No write folder is set: every tool only reads and answers previews.'));
  if (env.ARSENAL_ALLOW_LAUNCH) notes.push(N('launch', 'Starting the game is allowed: Claude can start a test match, drive the menus and switch the enabled mods.'));
  if (plan.method === 'cli') notes.push(N('cli', 'Claude Code keeps user servers in its own settings file; they are added with the claude command (shown on each row).'));
  else if (P.kind === 'claude-code-user' && servers.length) notes.push(N('fileMerge', 'The claude command is not used here, so the entries are merged into ' + P.cfg + ' under "mcpServers". Close Claude Code first: it rewrites that file while it runs.', { f: P.cfg }));
  if (P.kind === 'claude-desktop' && sk.length) next.push(N('upload', 'Skills: in the Claude app open Customize > Skills, choose to upload a skill, and upload each zip from ' + P.zips + '.', { d: P.zips }));
  if (P.kind === 'claude-desktop' && servers.length) next.push(N('desktop', 'Close Claude Desktop completely (also in the tray) and open it again. The servers are listed under Settings > Developer.'));
  if (P.kind !== 'claude-desktop') next.push(servers.length ? N(P.dir ? 'codeMcpDir' : 'codeMcp', 'Start a new Claude Code session' + (P.dir ? ' in ' + P.dir : '') + ' and type /mcp: the servers are listed there' + (P.dir ? ' (approve them when asked).' : '.'), { d: P.dir || '' }) : N(P.dir ? 'codeDir' : 'code', 'Start a new Claude Code session' + (P.dir ? ' in ' + P.dir : '') + '.', { d: P.dir || '' }));
  if (sk.length && P.kind !== 'claude-desktop') next.push(N('skills', 'Skills load by themselves when a task fits; /skills lists them.'));
  if (!write) return plan;

  // ---- write
  for (const st of steps) {
    try {
      if (st.op === 'skill') {
        const old = M.skills[st.name];
        if (old && Array.isArray(old.files)) for (const f of old.files) { try { fs.unlinkSync(path.join(st.to, ...f.split('/'))); } catch (e) { /* gone */ } }
        const from = path.join(D.root, '.claude', 'skills', st.name);
        for (const f of st.files) { const d = path.join(st.to, ...f.split('/')); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(path.join(from, ...f.split('/')), d); }
        M.skills[st.name] = { files: st.files, at: new Date().toISOString() }; st.done = true;
      } else if (st.op === 'skill-zip') {
        fs.mkdirSync(path.dirname(st.to), { recursive: true }); fs.writeFileSync(st.to, skillZip(D, S.pieces.find(p => p.kind === 'skill' && p.name === st.name)));
        M.zips[st.name] = st.to; st.done = true;
      } else if (st.op === 'backup') { const b = backup(st.file); st.done = true; st.made = b.made; }
    } catch (e) { st.error = e.message; errors.push(st.op + ' ' + (st.name || '') + ': ' + e.message); }
  }
  const ms = steps.filter(x => x.op === 'mcp');
  if (ms.length) {
    if (plan.method === 'cli') {
      for (const st of ms) {
        const s = servers.find(x => x.name === st.name);
        try {
          await exec(['mcp', 'remove', '-s', 'user', s.name]);   // ours by name; "not found" is fine
          const r = await exec(cliAdd(s, env));
          if (r.code !== 0) { st.error = 'The claude command answered an error: ' + (r.out || 'exit ' + r.code); errors.push(st.name + ': ' + st.error); }
          else { M.mcp[s.name] = { file: P.cfg, method: 'cli', groups: s.groups }; st.done = true; }
        } catch (e) { st.error = e.message; errors.push(st.name + ': ' + e.message); }
      }
      if (errors.length) notes.push(N('tryFile', 'To write the settings file directly instead, install again with the claude command switched off (--no-cli).'));
    } else {
      try {
        const C2 = readCfg(P.cfg);   // again, right before the write
        if (!isObj(C2.json.mcpServers)) C2.json.mcpServers = {};
        for (const st of ms) { C2.json.mcpServers[st.name] = st.entry; M.mcp[st.name] = { file: P.cfg, method: 'file', groups: servers.find(x => x.name === st.name).groups }; }
        if (ms.some(x => x.was !== 'same')) writeCfg(P.cfg, C2);
        ms.forEach(st => { st.done = true; });
      } catch (e) { ms.forEach(st => { st.error = e.message; }); errors.push(e.message); }
    }
  }
  try { saveManifest(P, M, D.root); } catch (e) { errors.push('manifest: ' + e.message); }
  plan.wrote = true;
  return plan;
}
// uninstall(D, sel | null, target, o): only what the manifest of the target lists. sel null = everything in it.
async function uninstall(D, sel, target, o) {
  o = o || {};
  const P = paths(target, Object.assign({ root: D.root }, o)), M = readManifest(P), write = o.write === true;
  const exec = o.exec || (P.over ? async () => ({ code: -1, out: 'the claude command is never run for a stand-in home folder' }) : runClaude);
  let skills = Object.keys(M.skills), zips = Object.keys(M.zips), mcp = Object.keys(M.mcp), label = 'everything this installer put';
  if (sel && (sel.all || sel.piece || sel.group) && !sel.all) {
    const S = select(D, sel), names = S.pieces.filter(p => p.kind === 'skill').map(p => p.name), sv = serversOf(D, S).map(s => s.name);
    skills = skills.filter(n => names.includes(n)); zips = zips.filter(n => names.includes(n)); mcp = mcp.filter(n => sv.includes(n)); label = S.label;
  }
  const steps = [], errors = [], notes = [];
  const plan = { target: P.target, what: label, write, uninstall: true, method: 'file', home: P.over ? P.home : null, files: { skills: P.skills, zips: P.zips || null, config: P.cfg, manifest: P.manifest }, steps, kept: [], notes, next: [], errors, wrote: false };
  for (const n of skills) steps.push({ op: 'skill-remove', name: n, to: path.join(P.skills || '', n), files: M.skills[n].files || [] });
  for (const n of zips) steps.push({ op: 'zip-remove', name: n, to: M.zips[n] });
  let C = null;
  const fileNames = mcp.filter(n => M.mcp[n].method !== 'cli'), cliNames = mcp.filter(n => M.mcp[n].method === 'cli');
  if (fileNames.length) { C = readCfg(P.cfg); plan.kept = Object.keys(C.json.mcpServers || {}).filter(n => !fileNames.includes(n)); if (C.exists) steps.push({ op: 'backup', file: P.cfg, to: P.cfg + '.arsenal-bak', was: fs.existsSync(P.cfg + '.arsenal-bak') ? 'kept' : 'new' }); }
  for (const n of fileNames) steps.push({ op: 'mcp-remove', name: n, file: P.cfg, was: C.json.mcpServers && C.json.mcpServers[n] != null ? 'there' : 'gone' });
  for (const n of cliNames) steps.push({ op: 'mcp-remove', name: n, file: P.cfg, cli: cliLine(['mcp', 'remove', '-s', 'user', n]), was: 'there' });
  if (cliNames.length) plan.method = 'cli';
  if (!steps.length) notes.push(N('nothing', 'Nothing of this installer is in this target.'));
  plan.next.push(P.kind === 'claude-desktop' ? N('desktopU', 'Close Claude Desktop completely and open it again.') : N('code', 'Start a new Claude Code session.', { d: '' }));
  if (P.kind === 'claude-desktop' && zips.length) notes.push(N('uploaded', 'Skills you uploaded in the Claude app stay there: remove them under Customize > Skills.'));
  if (!write) return plan;
  for (const st of steps) {
    try {
      if (st.op === 'skill-remove') {
        for (const f of st.files) { try { fs.unlinkSync(path.join(st.to, ...f.split('/'))); } catch (e) { /* gone */ } }
        const dirs = [...new Set(st.files.map(f => path.dirname(path.join(st.to, ...f.split('/')))))].sort((a, b) => b.length - a.length).concat(st.to);
        for (const d of dirs) { try { if (inside(d, st.to) && !fs.readdirSync(d).length) fs.rmdirSync(d); } catch (e) { /* not empty or gone */ } }
        if (fs.existsSync(st.to)) st.left = 'The folder holds other files and was kept.';
        delete M.skills[st.name]; st.done = true;
      } else if (st.op === 'zip-remove') { try { fs.unlinkSync(st.to); } catch (e) { /* gone */ } try { if (!fs.readdirSync(path.dirname(st.to)).length) fs.rmdirSync(path.dirname(st.to)); } catch (e) { /* kept */ } delete M.zips[st.name]; st.done = true; }
      else if (st.op === 'backup') { st.made = backup(st.file).made; st.done = true; }
      else if (st.op === 'mcp-remove' && st.cli) {
        const r = await exec(['mcp', 'remove', '-s', 'user', st.name]);
        if (r.code !== 0 && !/not found|no .*server/i.test(r.out || '')) { st.error = 'The claude command answered an error: ' + (r.out || 'exit ' + r.code); errors.push(st.name + ': ' + st.error); }
        else { delete M.mcp[st.name]; st.done = true; }
      }
    } catch (e) { st.error = e.message; errors.push(st.op + ' ' + (st.name || '') + ': ' + e.message); }
  }
  if (fileNames.length) {
    try {
      const C2 = readCfg(P.cfg); let ch = false;
      for (const n of fileNames) { if (OURS.test(n) && isObj(C2.json.mcpServers) && n in C2.json.mcpServers) { delete C2.json.mcpServers[n]; ch = true; } delete M.mcp[n]; }
      if (ch) writeCfg(P.cfg, C2);
      steps.filter(x => x.op === 'mcp-remove' && !x.cli).forEach(st => { st.done = true; });
    } catch (e) { errors.push(e.message); steps.filter(x => x.op === 'mcp-remove' && !x.cli).forEach(st => { st.error = e.message; }); }
  }
  try { saveManifest(P, M, D.root); } catch (e) { errors.push('manifest: ' + e.message); }
  plan.wrote = true;
  return plan;
}
// status(D, target, o) -> {target, files, skills: [names], zips, mcp: [{name, groups}], pieces: [ids installed], root, at, moved}
function status(D, target, o) {
  const P = paths(target, Object.assign({ root: D.root }, o || {})), M = readManifest(P);
  const mcp = Object.keys(M.mcp).map(n => ({ name: n, groups: M.mcp[n].groups == null ? null : M.mcp[n].groups, method: M.mcp[n].method || 'file' }));
  const sk = new Set(Object.keys(M.skills).concat(Object.keys(M.zips)));
  const pieces = D.pieces.filter(p => p.kind === 'skill' ? sk.has(p.name) : p.kind === 'server' ? mcp.some(m => m.name === p.name) : mcp.some(m => m.name !== 'arsenal-gui' && (m.groups == null || m.groups.includes(p.name)))).map(p => p.id);
  return { target: P.target, home: P.over ? P.home : null, files: { skills: P.skills, zips: P.zips || null, config: P.cfg, manifest: P.manifest }, skills: Object.keys(M.skills), zips: Object.keys(M.zips), mcp, pieces,
    root: M.root || null, at: M.at || null, moved: !!(M.root && mcp.length && path.resolve(M.root) !== path.resolve(D.root)), cli: P.cli && claudeOnPath() };
}

// ---------------------------------------------------------------- CLI
const kb = n => (n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB');
function planText(p) {
  const L = [(p.uninstall ? 'Uninstall' : 'Install') + ': ' + p.what, 'Target: ' + p.target + (p.home ? '   (home folder: ' + p.home + ')' : ''), ''];
  for (const s of p.steps) {
    const st = p.wrote ? (s.error ? 'FAILED  ' : s.done ? 'done    ' : 'skipped ') : '';
    if (s.op === 'skill') L.push(st + 'skill ' + s.name + ' -> ' + s.to + '  (' + s.files.length + ' file' + (s.files.length === 1 ? '' : 's') + ', ' + (s.was === 'new' ? 'new' : 'replaces the copy put before') + ')');
    else if (s.op === 'skill-skip') L.push('skipped skill ' + s.name + ': ' + s.why);
    else if (s.op === 'skill-zip') L.push(st + 'skill zip ' + s.name + ' -> ' + s.to);
    else if (s.op === 'backup') L.push(st + 'copy of ' + s.file + ' -> ' + s.to + (s.was === 'kept' ? '  (a copy is already there and is kept)' : ''));
    else if (s.op === 'mcp') L.push(st + 'server ' + s.name + ' (' + (s.was === 'new' ? 'new' : s.was === 'same' ? 'already the same' : 'changed') + ') in ' + s.file, '    ' + (s.cli || JSON.stringify(s.entry)));
    else if (s.op === 'skill-remove') L.push(st + 'remove skill ' + s.name + ' from ' + s.to + (s.left ? '  ' + s.left : ''));
    else if (s.op === 'zip-remove') L.push(st + 'remove skill zip ' + s.to);
    else if (s.op === 'mcp-remove') L.push(st + 'remove server ' + s.name + ' from ' + s.file + (s.cli ? '\n    ' + s.cli : ''));
    if (s.error) L.push('    ' + s.error);
  }
  if (p.kept.length) L.push('', 'Other servers in that file, left as they are: ' + p.kept.join(', '));
  for (const n of p.notes) L.push('', 'Note: ' + n.text);
  if (p.wrote) { L.push('', p.errors.length ? 'Finished with ' + p.errors.length + ' problem' + (p.errors.length === 1 ? '' : 's') + '.' : 'Done.'); if (!p.errors.length && p.next.length) L.push('', 'What to do next:', ...p.next.map(n => '  - ' + n.text)); }
  else L.push('', 'Nothing was changed. Add --write to do it.');
  return L.join('\n');
}
async function main(argv) {
  const a = argv.slice(), verb = a.shift(), o = { piece: [], group: [], env: {} };
  const val = () => { const v = a.shift(); if (v == null || (v.startsWith('--') && v.length > 2)) throw bad('A value is missing after the option before ' + (v || 'the end') + '.'); return v; };
  while (a.length) {
    const k = a.shift();
    if (k === '--piece') o.piece.push(...many(val())); else if (k === '--group') o.group.push(...many(val())); else if (k === '--all') o.all = true;
    else if (k === '--out') o.out = val(); else if (k === '--target') o.target = val(); else if (k === '--write') o.write = true; else if (k === '--json') o.json = true;
    else if (k === '--home') o.home = val(); else if (k === '--appdata') o.appdata = val(); else if (k === '--skills-out') o.skillsOut = val(); else if (k === '--no-cli') o.cli = false; else if (k === '--replace') o.replace = true;
    else if (k === '--game') o.env.game = val(); else if (k === '--write-roots') o.env.writeRoots = val(); else if (k === '--allow-launch') o.env.allowLaunch = true; else if (k === '--root') o.root = val();
    else throw bad('Unknown option ' + k + '. See --help.');
  }
  const say = s => process.stdout.write(s + '\n');
  try {
    const D = await discover({ root: o.root });
    const sel = { all: o.all, piece: o.piece.length ? o.piece : null, group: o.group.length ? o.group : null };
    if (verb === 'list') {
      if (o.json) { say(JSON.stringify(D, null, 1)); return 0; }
      say('Full pack: ' + D.all.id + '   ' + D.all.skills + ' skills, ' + D.all.tools + ' MCP tools, ' + kb(D.all.bytes));
      say('\nPack groups:');
      for (const g of D.groups) say('  ' + g.id.padEnd(9) + g.skills + ' skills, ' + g.tools + ' tools, ' + kb(g.bytes) + '   ' + g.title);
      say('\nPieces:');
      for (const p of D.pieces) say('  ' + p.id.padEnd(30) + (p.kind === 'skill' ? kb(p.bytes).padStart(9) + ', ' + p.files.length + ' file' + (p.files.length === 1 ? ' ' : 's') : (p.tools.length + ' tools').padStart(9) + '         ') + '  [' + p.groups.join(',') + ']');
      if (!D.groupsFlag) say('\nNote: the server does not narrow its tool list by group yet (no --groups).');
      for (const e of D.errors) say('problem: ' + (e.file || '') + ' ' + (e.error || ''));
      return 0;
    }
    if (verb === 'zip') {
      if (!o.out) throw bad('Name the zip file to write: --out <file.zip>.');
      const z = zipOf(D, sel, { env: o.env }), out = path.resolve(o.out);
      if (inside(out, path.join(D.root, 'tools')) || inside(out, path.join(D.root, '.claude'))) throw bad('Write the zip outside the toolkit\'s tools and .claude folders.');
      fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, z.buf);
      say('Wrote ' + out + '  (' + kb(z.buf.length) + ', ' + z.entries.length + ' files)'); return 0;
    }
    if (verb === 'install' || verb === 'uninstall') {
      if (!o.target) throw bad('Name where to: --target claude-code-user | claude-code-project:<folder> | claude-desktop.');
      const p = verb === 'install' ? await install(D, sel, o.target, o) : await uninstall(D, sel.all || sel.piece || sel.group ? sel : null, o.target, o);
      say(o.json ? JSON.stringify(p, null, 1) : planText(p)); return p.errors.length ? 1 : 0;
    }
    if (verb === 'status') {
      if (!o.target) throw bad('Name the target: --target claude-code-user | claude-code-project:<folder> | claude-desktop.');
      const s = status(D, o.target, o);
      if (o.json) say(JSON.stringify(s, null, 1));
      else { say('Target: ' + s.target); say('Skills: ' + (s.skills.concat(s.zips).join(', ') || 'none')); say('Servers: ' + (s.mcp.map(m => m.name).join(', ') || 'none')); if (s.moved) say('Note: installed from another toolkit folder (' + s.root + '). Install again to point the servers here.'); }
      return 0;
    }
    throw bad('Say what to do: list, zip, install, uninstall or status. See --help.');
  } catch (e) { if (e && e.plain) { say(e.message); return 2; } throw e; }
}

module.exports = { ROOT, discover, select, zipOf, skillZip, unzip, install, uninstall, status, paths, envOf, serversOf, planText, main, stats, GAMES, _runClaude: runClaude, _forget: () => { MEMO.clear(); CLAUDE = null; } };
if (require.main === module) main(process.argv.slice(2)).then(c => { process.exitCode = c; }, e => { console.error(e && e.stack || e); process.exitCode = 1; });
