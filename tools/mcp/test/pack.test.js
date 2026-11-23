// mcp pack test: pieces, pack groups, zips read back, install preview / write / uninstall into a scratch home.
// Never the real ~/.claude, ~/.claude.json, %APPDATA%\Claude or a real project: every call passes home = a scratch folder,
// and each plan is checked to name only files under it. The claude command is never run (a stand-in records the calls).
// Author: Imperator_Aug (ARSENAL, ia-a2d088a2)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { T, scratch, rm, ROOT } = require('./rpc');
const P = require('../pack/pack');
const t = T('pack');
const read = f => fs.readFileSync(f, 'utf8'), J = f => JSON.parse(read(f));
const under = (w, plan) => Object.values(plan.files).filter(Boolean).concat(plan.steps.map(s => s.to || s.file).filter(Boolean)).every(p => path.resolve(p).toLowerCase().startsWith(w.toLowerCase() + path.sep));
const st = async f => { try { await f(); return null; } catch (e) { return e; } };

(async () => {
  const w = scratch('pack'), home = path.join(w, 'home'), proj = path.join(w, 'proj'); fs.mkdirSync(home); fs.mkdirSync(proj);
  delete process.env.ARSENAL_CLAUDE_HOME;
  try {
    // ---- list
    const D = await P.discover({});
    const ids = D.pieces.map(p => p.id);
    t.ok(D.root === ROOT && D.pieces.length >= 20, 'pieces found: ' + D.pieces.length);
    const real = fs.readdirSync(path.join(ROOT, '.claude', 'skills')).filter(n => fs.existsSync(path.join(ROOT, '.claude', 'skills', n, 'SKILL.md')));
    t.ok(real.every(n => ids.includes('skill:' + n)) && D.pieces.filter(p => p.kind === 'skill').length === real.length, 'every skill folder with a SKILL.md is a piece');
    const live = JSON.parse(cp.execFileSync(process.execPath, [path.join(ROOT, 'tools', 'mcp', 'server.js'), '--list'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 << 20, env: Object.assign({}, process.env, { ARSENAL_MCP_GROUPS: '' }) }));
    const lg = [...new Set(live.tools.map(x => x.group))];
    t.ok(lg.length >= 5 && lg.every(g => ids.includes('mcp:' + g)), 'every MCP group of server.js --list is a piece: ' + lg.join(','));
    t.ok(D.pieces.filter(p => p.kind === 'mcp').reduce((a, p) => a + p.tools.length, 0) === live.tools.length, 'every tool sits in one group piece');
    t.ok(ids.includes('server:arsenal-gui') && D.pieces.find(p => p.id === 'server:arsenal-gui').tools.length >= 7, 'the arsenal-gui server is one piece with its tools');
    const sk = D.pieces.find(p => p.id === 'skill:mow-games');
    t.ok(sk && sk.what.length > 40 && sk.bytes > 1000 && sk.files[0].rel === 'SKILL.md' && sk.groups.join() === 'games', 'a skill piece: description, size, files, group');
    t.ok(D.pieces.every(p => p.groups.length >= 1), 'no piece without a group');
    const gid = D.groups.map(g => g.id);
    t.ok(['modding', 'playing', 'games', 'gui'].every(g => gid.includes(g)) && D.all.pieces.length === D.pieces.length, 'pack groups and the full pack: ' + gid.join(','));
    const gm = D.groups.find(g => g.id === 'modding'), gp = D.groups.find(g => g.id === 'playing');
    t.ok(gm.pieces.includes('skill:mow-mod-units') && gm.pieces.includes('mcp:mod') && gp.pieces.includes('mcp:coach') && gp.pieces.includes('skill:mow-play-coach'), 'patterns place skills and groups');
    t.ok(D.groups.find(g => g.id === 'gui').pieces.includes('server:arsenal-gui'), 'gui group holds the window server');
    const b0 = P.stats.builds; await P.discover({}); await P.discover({ fresh: true });
    t.ok(P.stats.builds === b0, 'the piece list is built once while no source file changed');
    // a piece that matches no pattern lands in `other`
    const fx = path.join(w, 'kit');
    fs.mkdirSync(path.join(fx, '.claude', 'skills', 'zz-thing'), { recursive: true }); fs.mkdirSync(path.join(fx, '.claude', 'skills', 'mow-mod-x'), { recursive: true }); fs.mkdirSync(path.join(fx, '.claude', 'skills', 'empty'), { recursive: true });
    fs.writeFileSync(path.join(fx, '.claude', 'skills', 'zz-thing', 'SKILL.md'), '---\nname: zz-thing\ndescription: A thing.\n---\n# Thing\n');
    fs.writeFileSync(path.join(fx, '.claude', 'skills', 'mow-mod-x', 'SKILL.md'), '---\nname: mow-mod-x\ndescription: X.\n---\n');
    fs.mkdirSync(path.join(fx, '.claude', 'skills', 'mow-mod-x', 'sub')); fs.writeFileSync(path.join(fx, '.claude', 'skills', 'mow-mod-x', 'sub', 'a.md'), 'a\n');
    fs.mkdirSync(path.join(fx, 'tools', 'mcp'), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'tools', 'mcp', 'packs.json'), path.join(fx, 'tools', 'mcp', 'packs.json'));
    const F = await P.discover({ root: fx });
    t.ok(F.pieces.length === 2 && F.groups.find(g => g.id === 'other').pieces.join() === 'skill:zz-thing' && F.groups.find(g => g.id === 'modding').pieces.join() === 'skill:mow-mod-x', 'unmatched piece -> other; a folder without SKILL.md is no piece');
    fs.mkdirSync(path.join(fx, '.claude', 'skills', 'mow-play-new')); fs.writeFileSync(path.join(fx, '.claude', 'skills', 'mow-play-new', 'SKILL.md'), '---\nname: mow-play-new\ndescription: N.\n---\n');
    const F2 = await P.discover({ root: fx, fresh: true });
    t.ok(F2.pieces.length === 3 && F2.groups.find(g => g.id === 'playing').pieces.join() === 'skill:mow-play-new', 'a new skill folder joins its group by itself');

    // ---- zips
    let z = P.zipOf(D, { piece: 'skill:mow-games' }), u = P.unzip(z.buf);
    t.ok(z.name === 'arsenal-claude-mow-games.zip' && [...u.keys()].every(k => k.startsWith('mow-games/')) && u.get('mow-games/SKILL.md').equals(fs.readFileSync(path.join(ROOT, '.claude', 'skills', 'mow-games', 'SKILL.md'))) && u.size === sk.files.length, 'skill zip: <name>/SKILL.md + its files, bytes equal');
    z = P.zipOf(D, { piece: 'mcp:units' }, { env: { game: 'goh' } }); u = P.unzip(z.buf);
    t.ok(['README.md', 'mcp.json', 'claude_desktop_config.json', 'install.cmd', 'install.js'].every(k => u.has(k)) && u.size === 5, 'MCP piece zip files: ' + [...u.keys()].join(','));
    const mj = JSON.parse(u.get('mcp.json').toString()), dj = JSON.parse(u.get('claude_desktop_config.json').toString());
    t.ok(mj.mcpServers['arsenal-units'].command === 'node' && mj.mcpServers['arsenal-units'].args[0] === path.join(ROOT, 'tools', 'mcp', 'server.js') && mj.mcpServers['arsenal-units'].args.slice(1).join(' ') === '--groups units' && mj.mcpServers['arsenal-units'].env.ARSENAL_GAME === 'goh', 'mcp.json points at this toolkit, group and env set');
    t.ok(dj.mcpServers['arsenal-units'].type === undefined && dj.mcpServers['arsenal-units'].args.length === 3, 'desktop snippet');
    t.ok(u.get('README.md').toString().includes(ROOT) && /need Node\.js/.test(u.get('README.md').toString()) && u.get('install.js').toString().includes(JSON.stringify(ROOT)), 'README and installer name the toolkit folder');
    try { new (require('vm').Script)(u.get('install.js').toString().replace(/^#!.*/, '')); t.ok(true, 'install.js parses'); } catch (e) { t.ok(false, 'install.js parses: ' + e.message); }
    z = P.zipOf(D, { group: 'playing' }); u = P.unzip(z.buf);
    t.ok(z.name === 'arsenal-claude-group-playing.zip' && u.has('skills/mow-play-coach/SKILL.md') && u.has('skill-zips/mow-play-coach.zip') && u.has('mcp/mcp.json') && u.has('install.js') && u.has('install.cmd') && u.has('README.md'), 'group zip: skills, skill zips, entries, installer');
    t.ok(P.unzip(u.get('skill-zips/mow-play-coach.zip')).has('mow-play-coach/SKILL.md'), 'inner skill zip reads back');
    t.ok(Object.keys(JSON.parse(u.get('mcp/mcp.json').toString()).mcpServers).join() === 'arsenal-playing', 'group zip: one server entry for the group');
    z = P.zipOf(D, { all: true }); u = P.unzip(z.buf);
    t.ok(z.name === 'arsenal-claude-all.zip' && u.has('CATALOG.md') && u.has('install.md') && real.every(n => u.has('skills/' + n + '/SKILL.md')) && Object.keys(JSON.parse(u.get('mcp/mcp.json').toString()).mcpServers).join() === 'arsenal,arsenal-gui', 'full zip: everything + CATALOG.md + install.md, servers arsenal and arsenal-gui');
    t.ok((await st(() => P.zipOf(D, { piece: 'skill:nope' }))) && (await st(() => P.zipOf(D, {}))), 'unknown piece and empty choice refused');
    // the CLI writes a zip
    const zf = path.join(w, 'out', 'p.zip');
    let c = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'mcp', 'pack', 'pack.js'), 'zip', '--group', 'games', '--out', zf], { encoding: 'utf8' });
    t.ok(c.status === 0 && P.unzip(fs.readFileSync(zf)).has('skills/mow-games/SKILL.md'), 'CLI zip ' + c.stdout + c.stderr);
    c = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'mcp', 'pack', 'pack.js'), 'list'], { encoding: 'utf8' });
    t.ok(c.status === 0 && /skill:mow-games/.test(c.stdout) && /mcp:knowledge/.test(c.stdout) && /Pack groups:/.test(c.stdout), 'CLI list');

    // ---- install: claude-code-user into the scratch home (file merge: home is overridden, so claude is never run)
    const cfg = path.join(home, '.claude.json');
    const foreign = '{\n    "numStartups": 7,\n    "mcpServers": {\n        "zeta": {"command": "z", "args": ["1"]},\n        "alpha": {"type": "http", "url": "https://example.invalid/mcp"}\n    },\n    "projects": {"C:/x": {"mcpServers": {}}}\n}\n';
    fs.writeFileSync(cfg, foreign);
    let p = await P.install(D, { group: 'playing' }, 'claude-code-user', { home });
    t.ok(p.write === false && p.wrote === false && p.method === 'file' && under(w, p), 'preview: nothing written, every path under the scratch home');
    t.ok(read(cfg) === foreign && !fs.existsSync(path.join(home, '.claude')) && !fs.existsSync(cfg + '.arsenal-bak'), 'preview changed nothing');
    t.ok(p.steps.filter(s => s.op === 'skill').length === D.groups.find(g => g.id === 'playing').skills && p.steps.filter(s => s.op === 'mcp').map(s => s.name).join() === 'arsenal-playing' && p.steps[0].op === 'backup' && p.kept.join() === 'zeta,alpha', 'preview rows: skills of the group, 1 server, backup, kept servers ' + p.kept.join());
    p = await P.install(D, { group: 'playing' }, 'claude-code-user', { home, write: true, env: { game: 'goh', writeRoots: path.join(w, 'mods'), allowLaunch: true } });
    t.ok(p.wrote && !p.errors.length && under(w, p), 'write ok ' + p.errors.join(';'));
    let j = J(cfg);
    t.ok(Object.keys(j.mcpServers).join() === 'zeta,alpha,arsenal-playing' && JSON.stringify(j.mcpServers.zeta) === '{"command":"z","args":["1"]}' && j.mcpServers.alpha.url === 'https://example.invalid/mcp' && j.numStartups === 7 && j.projects['C:/x'], 'merge keeps foreign entries, their order and unknown keys');
    t.ok(/^\{\n {4}"numStartups"/.test(read(cfg)), 'indent of the file kept');
    const e = j.mcpServers['arsenal-playing'];
    t.ok(e.type === 'stdio' && e.command === 'node' && e.args.join('|') === [path.join(ROOT, 'tools', 'mcp', 'server.js'), '--groups', 'play,coach,run'].join('|') && e.env.ARSENAL_GAME === 'goh' && e.env.ARSENAL_WRITE_ROOTS === path.join(w, 'mods') && e.env.ARSENAL_ALLOW_LAUNCH === '1', 'entry: command, args, env');
    t.ok(read(cfg + '.arsenal-bak') === foreign, 'backup holds the file as it was');
    t.ok(read(path.join(home, '.claude', 'skills', 'mow-play-coach', 'SKILL.md')) === read(path.join(ROOT, '.claude', 'skills', 'mow-play-coach', 'SKILL.md')), 'skill folder copied');
    let s = P.status(D, 'claude-code-user', { home });
    t.ok(s.skills.length === D.groups.find(g => g.id === 'playing').skills && s.mcp[0].name === 'arsenal-playing' && s.pieces.includes('mcp:coach') && s.pieces.includes('skill:mow-play-setup') && !s.pieces.includes('mcp:mod'), 'status: installed pieces from the manifest');
    // again, other settings: backup made once, default read-only
    p = await P.install(D, { group: 'playing' }, 'claude-code-user', { home, write: true });
    j = J(cfg);
    t.ok(read(cfg + '.arsenal-bak') === foreign && JSON.stringify(j.mcpServers['arsenal-playing'].env) === '{}' && p.steps.find(x => x.op === 'backup').was === 'kept' && p.steps.find(x => x.op === 'mcp').was === 'changed', 'second install: backup not overwritten, entry changed, no env by default');
    t.ok(p.steps.filter(x => x.op === 'skill').every(x => x.was === 'replace' && x.done), 'second install replaces its own skill folders');
    // a skill folder the installer did not put is left alone
    fs.mkdirSync(path.join(home, '.claude', 'skills', 'mow-games')); fs.writeFileSync(path.join(home, '.claude', 'skills', 'mow-games', 'SKILL.md'), 'mine');
    fs.writeFileSync(path.join(home, '.claude', 'skills', 'mow-play-coach', 'my-notes.md'), 'keep me');
    p = await P.install(D, { piece: ['skill:mow-games', 'mcp:units'] }, 'claude-code-user', { home, write: true });
    t.ok(p.steps.some(x => x.op === 'skill-skip' && x.name === 'mow-games') && read(path.join(home, '.claude', 'skills', 'mow-games', 'SKILL.md')) === 'mine' && J(cfg).mcpServers['arsenal-units'], 'foreign skill folder with the same name skipped, server piece added');
    // uninstall one piece, then everything
    p = await P.uninstall(D, { piece: 'mcp:units' }, 'claude-code-user', { home });
    t.ok(!p.wrote && p.steps.filter(x => x.op === 'mcp-remove').map(x => x.name).join() === 'arsenal-units' && J(cfg).mcpServers['arsenal-units'], 'uninstall preview of one piece');
    p = await P.uninstall(D, { piece: 'mcp:units' }, 'claude-code-user', { home, write: true });
    t.ok(!J(cfg).mcpServers['arsenal-units'] && J(cfg).mcpServers['arsenal-playing'], 'uninstall of one piece leaves the others');
    p = await P.uninstall(D, null, 'claude-code-user', { home, write: true });
    j = J(cfg);
    t.ok(!p.errors.length && Object.keys(j.mcpServers).join() === 'zeta,alpha' && j.numStartups === 7, 'uninstall removes only our entries');
    t.ok(!fs.existsSync(path.join(home, '.claude', 'skills', 'mow-play-setup')) && read(path.join(home, '.claude', 'skills', 'mow-play-coach', 'my-notes.md')) === 'keep me' && !fs.existsSync(path.join(home, '.claude', 'skills', 'mow-play-coach', 'SKILL.md')) && read(path.join(home, '.claude', 'skills', 'mow-games', 'SKILL.md')) === 'mine', 'uninstall removes its own files only; a file the user added and a foreign folder stay');
    t.ok(!fs.existsSync(path.join(home, '.claude', 'arsenal-install.json')) && P.status(D, 'claude-code-user', { home }).pieces.length === 0, 'manifest gone when nothing is left');
    p = await P.uninstall(D, null, 'claude-code-user', { home, write: true });
    t.ok(!p.steps.length && p.notes.some(n => n.k === 'nothing'), 'uninstall with nothing installed says so');

    // ---- bad JSON refused, nothing written
    const home2 = path.join(w, 'home2'); fs.mkdirSync(home2); fs.writeFileSync(path.join(home2, '.claude.json'), '{"mcpServers": {');
    let x = await st(() => P.install(D, { all: true }, 'claude-code-user', { home: home2, write: true }));
    t.ok(x && x.plain && /not valid JSON/.test(x.message) && read(path.join(home2, '.claude.json')) === '{"mcpServers": {' && !fs.existsSync(path.join(home2, '.claude')) && !fs.existsSync(path.join(home2, '.claude.json.arsenal-bak')), 'invalid JSON refused in plain words, no skill copied, file untouched');
    fs.writeFileSync(path.join(home2, '.claude.json'), '{"mcpServers": []}');
    x = await st(() => P.install(D, { piece: 'mcp:mod' }, 'claude-code-user', { home: home2, write: true }));
    t.ok(x && /not an object/.test(x.message), 'mcpServers of another kind refused');
    fs.writeFileSync(path.join(home2, '.claude.json'), '[1]');
    t.ok(await st(() => P.install(D, { piece: 'mcp:mod' }, 'claude-code-user', { home: home2 })), 'a file that is not an object refused (preview too)');
    p = await P.install(D, { piece: 'skill:mow-games' }, 'claude-code-user', { home: home2, write: true });
    t.ok(p.wrote && read(path.join(home2, '.claude.json')) === '[1]' && fs.existsSync(path.join(home2, '.claude', 'skills', 'mow-games', 'SKILL.md')), 'skills alone never read or touch the settings file');

    // ---- claude-code-project
    p = await P.install(D, { all: true }, 'claude-code-project:' + proj, { home, write: true });
    j = J(path.join(proj, '.mcp.json'));
    t.ok(!p.errors.length && under(w, p) && Object.keys(j.mcpServers).join() === 'arsenal,arsenal-gui' && j.mcpServers.arsenal.args.length === 1 && real.every(n => fs.existsSync(path.join(proj, '.claude', 'skills', n, 'SKILL.md'))) && !fs.existsSync(path.join(proj, '.mcp.json.arsenal-bak')), 'project: all skills, .mcp.json made new (no backup of a file that was not there)');
    s = P.status(D, 'claude-code-project:' + proj, { home });
    t.ok(s.pieces.length === D.pieces.length, 'project status: the full server covers every MCP group piece');
    p = await P.uninstall(D, null, 'claude-code-project:' + proj, { home, write: true });
    t.ok(JSON.stringify(J(path.join(proj, '.mcp.json'))) === '{"mcpServers":{}}' && !fs.existsSync(path.join(proj, '.claude', 'skills', 'mow-games')), 'project uninstall');
    t.ok((await st(() => P.install(D, { all: true }, 'claude-code-project:' + ROOT, { home }))) && (await st(() => P.install(D, { all: true }, 'claude-code-project:' + path.join(w, 'none'), { home }))) && (await st(() => P.install(D, { all: true }, 'claude-code-project:rel/dir', { home }))) && (await st(() => P.install(D, { all: true }, 'nowhere', { home }))), 'the toolkit folder itself, a missing folder, a relative folder and an unknown target refused');

    // ---- claude-desktop
    const dcfg = path.join(home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
    fs.mkdirSync(path.dirname(dcfg), { recursive: true }); fs.writeFileSync(dcfg, '{\r\n\t"globalShortcut": "x",\r\n\t"mcpServers": {\r\n\t\t"mine": {"command": "m"}\r\n\t}\r\n}');
    p = await P.install(D, { group: 'games' }, 'claude-desktop', { home, write: true });
    j = J(dcfg);
    t.ok(!p.errors.length && under(w, p) && Object.keys(j.mcpServers).join() === 'mine,arsenal-games' && j.mcpServers['arsenal-games'].type === undefined && j.globalShortcut === 'x' && /\r\n\t"globalShortcut"/.test(read(dcfg)) && !/[^\r]\n/.test(read(dcfg)), 'desktop: merged, tabs and CRLF kept');
    t.ok(P.unzip(fs.readFileSync(path.join(home, 'arsenal-claude-skills', 'mow-games.zip'))).has('mow-games/SKILL.md') && p.next.some(n => n.k === 'upload'), 'desktop: skill zips in a folder, upload step told');
    t.ok(P.status(D, 'claude-desktop', { home }).pieces.includes('skill:mow-games'), 'desktop status');
    p = await P.uninstall(D, null, 'claude-desktop', { home, write: true });
    t.ok(Object.keys(J(dcfg).mcpServers).join() === 'mine' && !fs.existsSync(path.join(home, 'arsenal-claude-skills')), 'desktop uninstall');

    // ---- the claude command (stand-in): used only for claude-code-user with the real home; here the stand-in proves the call shape
    const calls = [];
    const D2 = Object.assign({}, D);
    const PP = P.paths('claude-code-user', { home });
    t.ok(PP.cli === false && PP.over === true, 'a stand-in home never uses the claude command');
    process.env.ARSENAL_CLAUDE_HOME = home;
    t.ok(P.paths('claude-code-user', {}).cfg === cfg && P.paths('claude-desktop', {}).cfg === dcfg && P.paths('claude-code-user', {}).cli === false, 'env ARSENAL_CLAUDE_HOME = a stand-in home for the whole process');
    delete process.env.ARSENAL_CLAUDE_HOME;
    t.ok(await st(() => P.envOf({ game: 'quake' })) && await st(() => P.envOf({ writeRoots: 'rel\\dir' })) && JSON.stringify(P.envOf({})) === '{}', 'settings checked; none by default');
    const home4 = path.join(w, 'home4'); fs.mkdirSync(home4);
    const exec = async a => { calls.push(a); return { code: a[1] === 'remove' && calls.length < 3 ? 1 : 0, out: '' }; };
    p = await P.install(D, { piece: ['mcp:units', 'server:arsenal-gui'] }, 'claude-code-user', { home: home4, exec });
    t.ok(p.method === 'cli' && !calls.length && /^claude mcp add -s user arsenal-units -- node /.test(p.steps.find(x => x.op === 'mcp').cli), 'claude command: the preview shows the line and runs nothing');
    p = await P.install(D, { piece: ['mcp:units', 'server:arsenal-gui'] }, 'claude-code-user', { home: home4, exec, write: true, env: { game: 'goh', writeRoots: 'D:\\my mods;E:\\w' } });
    t.ok(!p.errors.length && calls.length === 4 && calls[0].join(' ') === 'mcp remove -s user arsenal-units'
      && calls[1].join('|') === ['mcp', 'add', '-s', 'user', 'arsenal-units', '-e', 'ARSENAL_GAME=goh', '-e', 'ARSENAL_WRITE_ROOTS=D:\\my mods;E:\\w', '--', 'node', path.join(ROOT, 'tools', 'mcp', 'server.js'), '--groups', 'units'].join('|')
      && calls[3].slice(0, 5).join(' ') === 'mcp add -s user arsenal-gui' && !fs.existsSync(path.join(home4, '.claude.json')), 'claude command: remove then add per server, name before -e, settings file not written by us: ' + JSON.stringify(calls[1]));
    t.ok(P.status(D, 'claude-code-user', { home: home4 }).mcp.every(m => m.method === 'cli'), 'claude command: manifest remembers how');
    calls.length = 0;
    p = await P.uninstall(D, null, 'claude-code-user', { home: home4, exec: async a => { calls.push(a); return { code: 0, out: '' }; }, write: true });
    t.ok(!p.errors.length && calls.map(a => a.join(' ')).join(';') === 'mcp remove -s user arsenal-units;mcp remove -s user arsenal-gui' && !fs.existsSync(path.join(home4, '.claude', 'arsenal-install.json')), 'claude command: uninstall removes our two names');
    calls.length = 0;
    p = await P.install(D, { piece: 'mcp:units' }, 'claude-code-user', { home: home4, write: true, exec: async a => { calls.push(a); return { code: a[1] === 'add' ? 1 : 0, out: 'boom' }; } });
    t.ok(p.errors.length === 1 && /boom/.test(p.errors[0]) && p.notes.some(n => n.k === 'tryFile') && !P.status(D, 'claude-code-user', { home: home4 }).mcp.length, 'claude command: an error is reported, nothing claimed as installed');
    void D2;

    // ---- CLI install preview + write + uninstall with --home
    const home3 = path.join(w, 'home3'); fs.mkdirSync(home3);
    const cli = (...a) => cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'mcp', 'pack', 'pack.js'), ...a, '--home', home3], { encoding: 'utf8' });
    c = cli('install', '--piece', 'mcp:knowledge', '--target', 'claude-code-user');
    t.ok(c.status === 0 && /Nothing was changed/.test(c.stdout) && !fs.existsSync(path.join(home3, '.claude.json')), 'CLI install previews unless --write');
    c = cli('install', '--piece', 'mcp:knowledge', '--target', 'claude-code-user', '--write');
    t.ok(c.status === 0 && /Done\./.test(c.stdout) && J(path.join(home3, '.claude.json')).mcpServers['arsenal-knowledge'], 'CLI install --write ' + c.stderr);
    c = cli('status', '--target', 'claude-code-user');
    t.ok(/arsenal-knowledge/.test(c.stdout), 'CLI status');
    c = cli('uninstall', '--target', 'claude-code-user', '--write');
    t.ok(c.status === 0 && !J(path.join(home3, '.claude.json')).mcpServers['arsenal-knowledge'], 'CLI uninstall');
    c = cli('install', '--all');
    t.ok(c.status === 2 && /--target/.test(c.stdout), 'CLI: missing target said in plain words');
    // the installer inside a zip runs the toolkit's installer
    const zd = path.join(w, 'unz'); fs.mkdirSync(zd); u = P.unzip(P.zipOf(D, { piece: 'mcp:coach' }).buf);
    fs.writeFileSync(path.join(zd, 'install.js'), u.get('install.js'));
    c = cp.spawnSync(process.execPath, [path.join(zd, 'install.js'), '--home', home3], { encoding: 'utf8' });
    t.ok(c.status === 0 && /server arsenal-coach \(new\)/.test(c.stdout) && /Nothing was changed/.test(c.stdout), 'install.js from a zip previews ' + c.stdout.slice(0, 200) + c.stderr.slice(0, 300));
  } catch (e) { t.ok(false, 'test stopped: ' + (e && e.stack || e)); }
  rm(w);
  t.done();
})();
