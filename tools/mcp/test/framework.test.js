// mcp framework test: the server's protocol and the safety rules it keeps for every tool, over a real stdio pipe.
// Fixture tools: test/fixtures/tools (loaded through ARSENAL_MCP_EXTRA_TOOLS). Writes go to a scratch folder, removed at the end.
// Author: Imperator_Aug (ARSENAL, ia-71b7164f)
'use strict';
const fs = require('fs'), path = require('path');
const { spawn, spawnSync } = require('child_process');
const { rpc, req, callMsg, flat, T, scratch, rm, cleanEnv, SERVER, ROOT, FIXTURES, NOTES } = require('./rpc');
const registry = require('../lib/registry');
const t = T('framework');

// rpc() of ./rpc with command-line arguments for the server (--groups)
function rpcArgs(args, messages, env) {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, [SERVER].concat(args), { cwd: ROOT, env: cleanEnv(env), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let out = '', err = '';
    c.stdout.setEncoding('utf8'); c.stderr.setEncoding('utf8');
    c.stdout.on('data', d => { out += d; }); c.stderr.on('data', d => { err += d; });
    c.on('error', reject);
    c.on('close', () => {
      const m = new Map(), raw = [];
      for (const l of out.split('\n')) { if (!l.trim()) continue; let j; try { j = JSON.parse(l); } catch (e) { raw.push(l); continue; } m.set(j.id, j); }
      m.set('raw', raw); m.set('stderr', err);
      resolve(m);
    });
    for (const x of messages) c.stdin.write(JSON.stringify(x) + '\n');
    c.stdin.end();
  });
}

(async () => {
  const w = scratch('fw'), fx = { ARSENAL_MCP_EXTRA_TOOLS: FIXTURES, ARSENAL_NO_STEAM: '1', ARSENAL_SETTINGS: path.join(w, 'none.json'), AS2_GAME: '', GOH_GAME: '' };
  try {
    // ---- protocol ----
    let r = await rpc([
      req(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '0' } }),
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      req(2, 'ping'), req(3, 'tools/list'), req(4, 'resources/list'), req(5, 'prompts/list'), req(6, 'no/such'), '{not json',
      req(7, 'tools/call', { name: 'mow_nope', arguments: {} }), req(8, 'resources/templates/list'), { id: 9, method: 'ping' }, req(10, 'tools/call', {}),
    ], fx);
    const init = r.get(1).result;
    t.ok(init.protocolVersion === '2024-11-05', 'initialize keeps a version the client asked for');
    t.ok(init.serverInfo.name === 'arsenal' && init.capabilities.tools, 'initialize: serverInfo and tools capability');
    t.ok(r.get(2) && JSON.stringify(r.get(2).result) === '{}', 'ping answers {}');
    t.ok(Array.isArray(r.get(4).result.resources) && !r.get(4).result.resources.length, 'resources/list is empty');
    t.ok(Array.isArray(r.get(5).result.prompts) && !r.get(5).result.prompts.length, 'prompts/list is empty');
    t.ok(Array.isArray(r.get(8).result.resourceTemplates), 'resources/templates/list is empty');
    t.ok(r.get(6).error && r.get(6).error.code === -32601, 'unknown method: -32601');
    t.ok(r.get(null) && r.get(null).error.code === -32700, 'not JSON: -32700');
    t.ok(r.get(7).error && r.get(7).error.code === -32602, 'unknown tool: -32602');
    t.ok(r.get(9).error && r.get(9).error.code === -32600, 'no jsonrpc field: -32600');
    t.ok(r.get(10).error && r.get(10).error.code === -32602, 'tools/call without a name: -32602');
    t.ok(r.size === 11 + 2 && !r.get('raw').length, 'a notification gets no answer; stdout is protocol only');
    const tools = r.get(3).result.tools, by = n => tools.find(x => x.name === n);
    for (const n of ['mow_lookup', 'mow_limit', 'mow_game_diff', 'mow_tools', 'mow_guide']) t.ok(by(n), 'tools/list has ' + n);
    const lk = by('mow_lookup'), wr = by('mow_fx_write'), la = by('mow_fx_launch');
    t.ok(lk.annotations.readOnlyHint === true && lk.annotations.destructiveHint === false && lk.annotations.title === lk.title && lk.title, 'read tool: readOnlyHint, destructiveHint false, title');
    t.ok(wr.annotations.readOnlyHint === false && wr.annotations.destructiveHint === false, 'write tool: not read-only, not destructive');
    t.ok(la.annotations.readOnlyHint === false, 'launch tool: not read-only');
    t.ok(wr.inputSchema.properties.write && wr.inputSchema.properties.write.type === 'boolean', 'write tool gets a write argument');
    t.ok(wr.inputSchema.properties.game && wr.inputSchema.properties.game.enum.length === 3, 'every tool gets a game argument');
    t.ok(by('mow_fx_goh').inputSchema.properties.game.enum.join() === 'goh', 'game enum = the games the tool serves');
    t.ok(!JSON.stringify(tools).includes('"dash"'), 'the dash mark is not sent to the client');
    t.ok(tools.every(x => !('handler' in x) && !('kind' in x)), 'tools/list sends no handler or kind');
    t.ok(!by('BadName') && !by('mow_fx_nokind') && by('mow_fx_fine'), 'wrong-form tools skipped, the good one of that module loads');
    t.ok(tools.filter(x => x.name === 'mow_lookup').length === 1, 'a taken name is not loaded twice');
    r = await rpc([req(1, 'initialize', { protocolVersion: '1999-01-01' })], fx);
    t.ok(/^20\d\d-\d\d-\d\d$/.test(r.get(1).result.protocolVersion) && r.get(1).result.protocolVersion !== '1999-01-01', 'unknown version: the server offers its newest');

    // ---- a broken module does not stop the server ----
    r = await rpc([callMsg(1, 'mow_tools', {})], fx);
    let a = flat(r.get(1));
    t.has(a.text, 'NOT LOADED', 'mow_tools names what did not load');
    t.has(a.text, 'broken.js: did not load: fixture module broken on purpose');
    t.has(a.text, 'badform.js BadName');
    t.has(a.text, 'badform.js mow_lookup: name already used by knowledge.js');
    t.has(a.text, 'mow_fx_write [write]');
    t.has(r.get('stderr'), 'broken.js', 'load failures also go to stderr');

    // ---- write rule ----
    const target = path.join(w, 'out', 'a.txt'), root = path.join(w, 'out');
    fs.mkdirSync(root, { recursive: true });
    r = await rpc([callMsg(1, 'mow_fx_write', { path: target }), callMsg(2, 'mow_fx_write', { path: target, write: true }), callMsg(3, 'mow_fx_sneak', { path: target }),
      callMsg(4, 'mow_fx_write', { path: target, write: 'yes' })], fx);
    a = flat(r.get(1)); t.ok(!a.isError && a.text.startsWith('preview') && a.data.blocked, 'no write: true = preview');
    a = flat(r.get(2)); t.ok(a.isError && a.text.includes('ARSENAL_WRITE_ROOTS'), 'write: true without roots is refused: ' + a.text);
    a = flat(r.get(3)); t.ok(a.isError && a.text.includes('not a write tool'), 'a read tool can not get a write path');
    a = flat(r.get(4)); t.ok(a.isError, 'write must be true or false');
    t.ok(!fs.existsSync(target), 'nothing written without roots');
    const fake = path.join(w, 'game'), inRes = path.join(fake, 'resource', 'x.txt');
    fs.mkdirSync(path.join(fake, 'resource'), { recursive: true }); fs.mkdirSync(path.join(fake, 'mods'), { recursive: true });
    const env = Object.assign({}, fx, { ARSENAL_WRITE_ROOTS: root + ';' + fake, ARSENAL_AS2_DIR: fake });
    a = flat((await rpc([callMsg(1, 'mow_fx_write', { path: target })], env)).get(1));
    t.ok(!a.isError && a.text.startsWith('preview') && !fs.existsSync(target), 'a preview inside the roots writes nothing');
    r = await rpc([callMsg(1, 'mow_fx_write', { path: path.join(w, 'other', 'b.txt'), write: true }), callMsg(2, 'mow_fx_write', { path: target }),
      callMsg(3, 'mow_fx_write', { path: target, write: true }), callMsg(4, 'mow_fx_write', { path: inRes, write: true }),
      callMsg(5, 'mow_fx_write', { path: path.join(root, '..', 'esc.txt'), write: true }), callMsg(6, 'mow_fx_write', { path: 'rel/x.txt', write: true }),
      callMsg(7, 'mow_fx_write', { path: path.join(fake, 'packages', 'p.txt'), write: true }), callMsg(8, 'mow_fx_write', { path: path.join(fake, 'x.txt'), write: true }),
      callMsg(9, 'mow_fx_game', { game: 'mowas_2' })], env);
    a = flat(r.get(1)); t.ok(a.isError && a.text.includes('outside'), 'outside the roots is refused: ' + a.text);
    a = flat(r.get(2)); t.ok(!a.isError && a.text.startsWith('preview') && a.data.blocked.startsWith('preview only'), 'inside the roots, no write: true = still a preview');
    a = flat(r.get(3)); t.ok(!a.isError && fs.existsSync(target), 'inside the roots with write: true is written: ' + a.text);
    a = flat(r.get(4)); t.ok(a.isError && a.text.includes('resource') && !fs.existsSync(inRes), 'the game resource folder is refused even inside a root: ' + a.text);
    a = flat(r.get(5)); t.ok(a.isError && !fs.existsSync(path.join(w, 'esc.txt')), '.. out of a root is refused');
    a = flat(r.get(6)); t.ok(a.isError && a.text.includes('full path'), 'a relative path is refused');
    a = flat(r.get(7)); t.ok(a.isError && a.text.includes('packages'), 'the game packages folder is refused');
    a = flat(r.get(8)); t.ok(a.isError, 'the game folder outside mods is refused');
    a = flat(r.get(9)); t.ok(a.text === 'mowas2 mowas_2 as2 env' && a.data.dir === fake && a.data.facts > 5, 'ctx.game: mowas_2 = mowas2, exe word, install from ARSENAL_AS2_DIR, profile: ' + a.text);

    // ---- game folder from the GUI settings file, default game from the env ----
    const sf = path.join(w, 'settings.json'), gohDir = path.join(w, 'gohgame'); fs.mkdirSync(gohDir);
    fs.writeFileSync(sf, JSON.stringify({ 'as2gui.games': { as64: { dir: fake }, goh: { dir: gohDir } } }));
    r = await rpc([callMsg(1, 'mow_fx_game', {}), callMsg(2, 'mow_fx_game', { game: 'as64' })], Object.assign({}, fx, { ARSENAL_SETTINGS: sf, ARSENAL_GAME: 'goh' }));
    a = flat(r.get(1)); t.ok(a.text === 'goh goh goh settings' && a.data.dir === gohDir, 'default game from ARSENAL_GAME, folder from the GUI settings: ' + a.text);
    a = flat(r.get(2)); t.ok(a.text === 'as64 as64 as2 settings' && a.data.dir === fake, 'AS2 folder from the GUI settings: ' + a.text);
    r = await rpc([callMsg(1, 'mow_fx_game', {})], fx);
    a = flat(r.get(1)); t.ok(a.text === 'as64 as64 as2 none' && a.data.dir === null, 'no folder known: dir null, no failure: ' + a.text);

    // ---- launch rule ----
    a = flat((await rpc([callMsg(1, 'mow_fx_launch', {})], fx)).get(1));
    t.ok(a.isError && a.text.includes('ARSENAL_ALLOW_LAUNCH'), 'launch refused without ARSENAL_ALLOW_LAUNCH=1: ' + a.text);
    a = flat((await rpc([callMsg(1, 'mow_fx_launch', {})], Object.assign({}, fx, { ARSENAL_ALLOW_LAUNCH: 'yes' }))).get(1));
    t.ok(a.isError, 'launch refused when the variable is not exactly 1');
    a = flat((await rpc([callMsg(1, 'mow_fx_launch', {})], Object.assign({}, fx, { ARSENAL_ALLOW_LAUNCH: '1' }))).get(1));
    t.ok(!a.isError && a.text.startsWith('launched'), 'launch allowed with ARSENAL_ALLOW_LAUNCH=1');
    a = flat((await rpc([callMsg(1, 'mow_fx_dry', { dry: true })], fx)).get(1));
    t.ok(!a.isError && a.text.startsWith('would launch'), 'dry run of a launch tool passes without the switch: ' + a.text);
    a = flat((await rpc([callMsg(1, 'mow_fx_dry', {})], fx)).get(1));
    t.ok(a.isError && a.text.includes('ARSENAL_ALLOW_LAUNCH'), 'the same tool without dry is refused');
    a = flat((await rpc([callMsg(1, 'mow_fx_launch', { dry: true })], fx)).get(1));
    t.ok(a.isError, 'dry: true on a launch tool that declares no dry is refused');

    // ---- arguments ----
    r = await rpc([callMsg(1, 'mow_lookup', {}), callMsg(2, 'mow_lookup', { query: 5 }), callMsg(3, 'mow_lookup', { query: 'x', mode: 'zz' }), callMsg(4, 'mow_lookup', { query: '--exe x' }),
      callMsg(5, 'mow_fx_big', { game: 'quake' }), callMsg(6, 'mow_fx_goh', { game: 'as64' }), callMsg(7, 'mow_fx_goh', { game: 'goh' }), callMsg(8, 'mow_fx_big', { list: ['ok', '-rf'] }),
      callMsg(9, 'mow_fx_big', { text: '- a dash in free text', free: '-x', n: 10 }), callMsg(10, 'mow_fx_big', { n: 'ten' }), req(11, 'tools/call', { name: 'mow_fx_big', arguments: [1] }),
      callMsg(12, 'mow_fx_na', {}), callMsg(13, 'mow_fx_throw', {}), callMsg(14, 'mow_fx_big', {}), callMsg(15, 'mow_fx_run', {}), callMsg(16, 'mow_fx_run', { text: 'badargv' }),
      callMsg(17, 'mow_fx_run', { text: 'notool' }), callMsg(18, 'mow_fx_run', { text: 'name', free: '-x' }), callMsg(19, 'mow_fx_big', { path: ' -o' }), req(20, 'ping')], fx);
    a = flat(r.get(1)); t.ok(a.isError && a.text.includes('"query" is needed'), 'missing argument: ' + a.text);
    a = flat(r.get(2)); t.ok(a.isError && a.text.includes('must be string'), 'wrong type: ' + a.text);
    a = flat(r.get(3)); t.ok(a.isError && a.text.includes('one of'), 'not in the enum: ' + a.text);
    a = flat(r.get(4)); t.ok(a.isError && a.text.includes('may not start with "-"'), 'leading - refused: ' + a.text);
    a = flat(r.get(5)); t.ok(a.isError && a.text.includes('unknown game'), 'unknown game: ' + a.text);
    a = flat(r.get(6)); t.ok(!a.isError && a.text.includes('not available for AS64') && a.data.na, 'a game the tool does not serve: plain words, not an error: ' + a.text);
    a = flat(r.get(7)); t.ok(a.text === 'goh only', 'a served game runs');
    a = flat(r.get(8)); t.ok(a.isError && a.text.includes('-rf'), 'leading - in a list refused');
    a = flat(r.get(9)); t.ok(!a.isError && a.text.startsWith('yyyyyyyyyy'), 'free text and dash: true arguments may start with -: ' + a.text.slice(0, 60));
    a = flat(r.get(10)); t.ok(a.isError && a.text.includes('integer'), 'text for an integer refused');
    a = flat(r.get(11)); t.ok(a.isError && a.text.includes('object'), 'arguments must be an object');
    a = flat(r.get(12)); t.ok(!a.isError && a.text === 'not available: this game keeps no such file' && a.data.na, '{ na } answers plain words');
    a = flat(r.get(13)); t.ok(a.isError && a.text.includes('boom'), 'a handler that throws answers an error result');
    a = flat(r.get(14)); t.ok(a.text.length < 40200 && a.text.includes('[cut: 60000 more chars]') && a.text.includes('[data left out') && a.data === undefined, 'output cut to 40000 chars, oversize data left out: ' + a.text.length);
    a = flat(r.get(15)); t.ok(!NOTES || (!a.isError && a.text.startsWith('VFS-01 |') && a.data.code === 0), 'ctx.run spawns a CLI tool');
    a = flat(r.get(16)); t.ok(a.isError && a.text.startsWith('refused:'), 'ctx.run refuses argv that is not texts');
    a = flat(r.get(17)); t.ok(a.isError && a.text.includes('no such tool'), 'ctx.run refuses an unknown tool');
    a = flat(r.get(18)); t.ok(a.isError && a.text.includes('may not start with "-"'), 'ctx.name refuses a leading -');
    a = flat(r.get(19)); t.ok(a.isError, 'leading - after a space refused');
    t.ok(r.get(20) && r.get(20).result, 'the server still answers after every refusal');

    // ---- groups: --groups a,b and ARSENAL_MCP_GROUPS serve those groups plus mow_tools ----
    const namesOf = x => x.get(1).result.tools.map(y => y.name).sort().join(' ');
    const ask = [req(1, 'tools/list'), callMsg(2, 'mow_tools', {}), callMsg(3, 'mow_fxg_own', {}), callMsg(4, 'mow_fxg_plain', {}), callMsg(5, 'mow_lookup', { query: 'x' }),
      callMsg(6, 'mow_nope', {}), callMsg(7, 'mow_tools', { tool: 'mow_fxg_own' }), callMsg(8, 'mow_tools', { find: 'fixture' }), req(9, 'initialize', {})];
    r = await rpcArgs(['--groups', 'fxa,nosuchgroup'], ask, fx);
    t.ok(namesOf(r) === 'mow_fxg_plain mow_tools', '--groups fxa: that group plus mow_tools, nothing else: ' + namesOf(r));
    t.has(r.get('stderr'), 'no tool group named "nosuchgroup"', 'an unknown group name is a note on stderr');
    t.ok(!r.get('raw').length && r.get(1).result, 'an unknown group name does not stop the server or reach stdout');
    a = flat(r.get(2));
    t.has(a.text, 'groups served: fxa (mow_tools is always here)', 'mow_tools names the groups served');
    t.has(a.text, 'groups that exist but are off:'); t.has(a.text, 'fxb (1)'); t.ok(/knowledge \(\d+\)/.test(a.text), 'the off groups carry their tool count');
    t.has(a.text, 'node tools/mcp/server.js --groups ', 'mow_tools gives the line that turns a group on');
    t.has(a.text, 'no tool has this group: nosuchgroup');
    t.ok(a.text.includes('mow_fxg_plain [read]') && !a.text.includes('mow_fxg_own') && !a.text.includes('mow_lookup [read]'), 'mow_tools lists only the tools that are served');
    t.ok(a.data.groups.served.join() === 'fxa' && a.data.groups.off.includes('fx') && a.data.groups.unknown.join() === 'nosuchgroup', 'mow_tools data: served, off, unknown');
    a = flat(r.get(3));
    t.ok(a.isError && !a.error && a.text.includes('that tool\'s group is not loaded: start the server with --groups ') && a.text.includes('fxb') && a.data.group === 'fxb',
      'a call to a tool whose group is off says how to load it, not "unknown tool": ' + (a.text || JSON.stringify(a.error)));
    t.ok(/--groups \S*fxa\S*/.test(a.text) && /--groups \S*fxb\S*/.test(a.text), 'the line keeps the groups served now and adds the missing one');
    a = flat(r.get(4)); t.ok(!a.isError && a.text === 'ok', 'a tool of a served group runs');
    a = flat(r.get(5)); t.ok(a.isError && a.text.includes('group "knowledge"') && a.text.includes('not loaded'), 'knowledge is off too when not asked for (only mow_tools stays)');
    t.ok(r.get(6).error && r.get(6).error.code === -32602, 'a name no module has is still an unknown tool');
    a = flat(r.get(7)); t.ok(!a.isError && a.text.includes('NOT LOADED NOW: group "fxb" is off') && a.data.served === false, 'mow_tools tool: <name> of an off tool says it is off');
    a = flat(r.get(8)); t.has(a.text, 'matches in groups that are off:', 'mow_tools find also names matches in groups that are off'); t.has(a.text, 'mow_fxg_own (fxb)');
    t.ok(r.get(9).result.serverInfo.name === 'arsenal' && r.get(9).result.instructions.includes('only these tool groups: fxa'), 'serverInfo name stays arsenal; the instructions name the groups');
    r = await rpc(ask, Object.assign({}, fx, { ARSENAL_MCP_GROUPS: 'fxb, knowledge' }));
    t.ok(namesOf(r) === 'mow_fxg_own mow_game_diff mow_guide mow_limit mow_lookup mow_tools', 'ARSENAL_MCP_GROUPS: the tool\'s own group wins over the module\'s: ' + namesOf(r));
    a = flat(r.get(3)); t.ok(!a.isError && a.text === 'ok', 'env: the tool with its own group runs');
    a = flat(r.get(4)); t.ok(a.isError && a.text.includes('--groups knowledge,fxa,fxb'), 'env: the module-group tool is off, the line is in the fixed order: ' + a.text);
    r = await rpcArgs(['--groups=fxb'], ask, Object.assign({}, fx, { ARSENAL_MCP_GROUPS: 'fxa' }));
    t.ok(namesOf(r) === 'mow_fxg_own mow_tools', 'the flag wins over the env; --groups=a form: ' + namesOf(r));
    r = await rpcArgs(['--groups', 'nosuchgroup'], ask, fx);
    t.ok(namesOf(r) === 'mow_tools', 'only unknown names: mow_tools alone');
    for (const v of ['all', '']) {
      r = await rpcArgs(['--groups', v], ask, Object.assign({}, fx, { ARSENAL_MCP_GROUPS: 'fxa' }));
      t.ok(namesOf(r).split(' ').length === tools.length && !r.get('stderr').includes('no tool group'), '--groups "' + v + '" = every group');
    }
    a = flat(r.get(2)); t.has(a.text, 'groups served: all (', 'no limit: mow_tools says all groups are served');
    t.ok(a.text.includes('fxa:\n  mow_fxg_plain') && a.text.includes('fxb:\n  mow_fxg_own'), 'mow_tools lists each tool under its own group');
    t.has(a.text, 'grp.js mow_fxg_badgroup: group must be', 'a tool with a bad group name is skipped and named');
    const ls = spawnSync(process.execPath, [SERVER, '--list', '--groups', 'fxb,units'], { cwd: ROOT, env: cleanEnv(fx), encoding: 'utf8', windowsHide: true, maxBuffer: 16 << 20 });
    const lj = JSON.parse(ls.stdout);
    t.ok(lj.tools.every(x => x.group) && lj.tools.find(x => x.name === 'mow_fxg_own').group === 'fxb' && lj.tools.find(x => x.name === 'mow_tools').group === 'knowledge', '--list prints each tool\'s group');
    t.ok(lj.tools.every(x => ['fxb', 'units'].includes(x.group) || x.name === 'mow_tools') && lj.tools.some(x => x.group === 'units') && lj.groups.served.join() === 'units,fxb', '--list takes --groups: ' + lj.groups.served);
    const real = registry.load();
    for (const [n, g] of [['mow_mods_clash', 'together'], ['mow_unit_find', 'units'], ['mow_price', 'weapons'], ['mow_text_set', 'text'], ['mow_map_info', 'maps'], ['mow_bots_recipe', 'bots'],
      ['mow_mod_check', 'mod'], ['mow_game_log', 'play'], ['mow_matchup', 'coach'], ['mow_game_start', 'run'], ['mow_lookup', 'knowledge']]) {
      const x = real.tools.find(y => y.name === n); t.ok(x && x.group === g, n + ' is in group ' + g + (x ? ': ' + x.group : ': not loaded'));
    }
    t.ok(String(registry.parseGroups(' Units, text;units ')) === 'units,text' && registry.parseGroups('') === null && registry.parseGroups('a,all') === null && registry.parseGroups(undefined) === null, 'parseGroups: list, or null for all');

    // ---- catalog: tools by group, skills with their sub-files; the line limits only with ARSENAL_SKILL_LIMITS=1 ----
    const cat = (args, env) => spawnSync(process.execPath, [path.join(ROOT, 'tools', 'mcp', 'catalog.js')].concat(args), { cwd: ROOT, env: cleanEnv(env), encoding: 'utf8', windowsHide: true, maxBuffer: 16 << 20 });
    const sk = path.join(w, 'skills'), mk = (rel, n, head) => { const f = path.join(sk, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, head + '\n' + 'line\n'.repeat(n - 1)); };
    mk('short/SKILL.md', 10, '---\nname: short\ndescription: A short skill for the test.\n---'); mk('short/steps.md', 80, '# Steps of the short skill'); mk('short/plain.md', 3, 'First line, no heading');
    mk('long/SKILL.md', 61, '---\nname: long\ndescription: A long skill for the test.\n---'); mk('long/big.md', 81, '## Big sub-file');
    const co = path.join(w, 'CATALOG.md'), ca = ['--out', co, '--skills', sk];
    let c = cat(ca, {});
    const ct = fs.existsSync(co) ? fs.readFileSync(co, 'utf8') : '';
    t.ok(c.status === 0 && ct.includes('## Server `arsenal`'), 'catalog --out writes the named file: ' + c.stdout + c.stderr);
    t.ok(/### units \(\d+ tools?; `--groups units`/.test(ct) && /### coach \(/.test(ct) && ct.indexOf('### knowledge (') < ct.indexOf('### mod (') && ct.indexOf('### mod (') < ct.indexOf('### together ('), 'catalog lists the tools by group, in the fixed order');
    t.ok(ct.includes('- `short` (SKILL.md 13 lines): A short skill for the test.') && ct.includes('  - `steps.md` (80 lines): Steps of the short skill') && ct.includes('  - `plain.md` (3 lines): First line, no heading'), 'catalog lists a skill with its sub-files, heading or first line, and line counts');
    t.ok(ct.includes('- `long` (SKILL.md 64 lines)') && ct.includes('  - `big.md` (81 lines): Big sub-file'), 'catalog: the long skill and its sub-file');
    c = cat(ca.concat('--check'), {});
    t.ok(c.status === 0 && (c.stdout + c.stderr).includes('over the line limit'), 'catalog --check without ARSENAL_SKILL_LIMITS: over-long files are a note, not a failure: ' + c.status);
    c = cat(ca.concat('--check'), { ARSENAL_SKILL_LIMITS: '1' });
    t.ok(c.status === 1 && c.stderr.includes('long/SKILL.md') && c.stderr.includes('long/big.md') && !c.stderr.includes('short/'), 'catalog --check with ARSENAL_SKILL_LIMITS=1 fails on SKILL.md over 60 and a sub-file over 80 lines: ' + c.stderr);
    fs.rmSync(path.join(sk, 'long'), { recursive: true, force: true });
    cat(ca, {}); c = cat(ca.concat('--check'), { ARSENAL_SKILL_LIMITS: '1' });
    t.ok(c.status === 0, 'catalog --check with the limits on passes when every file fits (80 lines is allowed): ' + c.stderr);
    fs.appendFileSync(path.join(sk, 'short', 'plain.md'), 'one more\n');
    c = cat(ca.concat('--check'), {});
    t.ok(c.status === 1 && c.stderr.includes('stale'), 'catalog --check fails when a sub-file changed its line count');
  } catch (e) { t.ok(false, 'test stopped: ' + (e && e.stack || e)); }
  rm(w);
  t.done();
})();
