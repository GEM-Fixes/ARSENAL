#!/usr/bin/env node
// arsenal: MCP server over stdio (JSON-RPC 2.0, one JSON message per line, no deps). Contract: tools/mcp/README.md.
//   node tools/mcp/server.js            serve on stdin/stdout (stderr = notes for a person, never protocol)
//   node tools/mcp/server.js --groups units,weapons     serve only the tools of those groups, plus mow_tools (README "Pieces, groups
//       and downloads"). Also `--groups=a,b`; env ARSENAL_MCP_GROUPS is the same, the flag wins. No flag, '' or 'all' = every group.
//       A name no tool has: a note on stderr, the list simply lacks it. A call to a tool whose group is off answers which --groups
//       line loads it (a result with isError, not "unknown tool"). mow_tools names the groups served and the ones that are off.
//   node tools/mcp/server.js --list [--groups a,b]     the served tools as JSON, each with its group, then exit
// Loads every tools/mcp/tools/*.js module (lib/registry.js). A module that fails to load is named by `mow_tools`, the server goes on.
// Methods: initialize (version negotiated), ping, tools/list, tools/call, resources/list, resources/templates/list, prompts/list
// (the last three answer empty lists), notifications/* (no answer). Unknown method: -32601. Unknown tool: -32602.
// A tool that refuses or fails answers a result with isError: true and plain words; the server itself never stops on a bad call.
// Safety, kept here for every tool (README "Safety rules"):
//   - kind 'write': without write: true the handler runs as a preview (ctx.guard.write refuses every path); with write: true and no
//     ARSENAL_WRITE_ROOTS the call is refused before the handler; each path is checked by ctx.guard.write (lib/ctx.js).
//   - kind 'launch': refused before the handler unless ARSENAL_ALLOW_LAUNCH=1. A tool whose schema declares `dry` passes with dry: true.
//   - a text argument that starts with '-' is refused, and so is one in a list. Not checked: an argument whose schema says
//     dash: true, and free text by name (text, value, content, body, note, description, title, old, new, replace, message).
//   - arguments are checked against the tool's inputSchema (required, type, enum; top level); `game` must be a game the tool serves,
//     else the answer says in plain words that the game is not served (not an error).
//   - the answer text is cut to 40000 chars.
// Author: Imperator_Aug (ARSENAL, ia-7949549d)
'use strict';
const path = require('path');
const ctxLib = require('./lib/ctx');
const registry = require('./lib/registry');
const games = require('../lib/games');

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const INFO = { name: 'arsenal', title: 'ARSENAL modding tools (MoW:AS2, AS64, Gates of Hell)', version: '1.0.0' };
const INSTRUCTIONS = 'Tools for modding and playing Men of War: Assault Squad 2, its AS64 build and Gates of Hell. Every tool takes game = as64 | mowas2 | goh. ' +
  'Start with mow_tools (what is here), mow_lookup (how the game behaves), mow_guide (the modding guide). ' +
  'Write tools answer a preview unless write: true is passed and the folder is allowed; launch tools need ARSENAL_ALLOW_LAUNCH=1.';
const FREE = /^(text|value|content|body|note|description|title|old|new|replace|message)$/;
const DATA_MAX = 100000;

// test hook: one more folder of tool modules (tools/mcp/test/fixtures/tools). Not for shipping tools.
const EXTRA = process.env.ARSENAL_MCP_EXTRA_TOOLS && path.isAbsolute(process.env.ARSENAL_MCP_EXTRA_TOOLS) ? [process.env.ARSENAL_MCP_EXTRA_TOOLS] : [];
function groupsArg(argv) {   // -> the text after --groups, or undefined when the flag is not there
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--groups') return argv[i + 1] == null || argv[i + 1].startsWith('--') ? '' : argv[i + 1];
    if (argv[i].startsWith('--groups=')) return argv[i].slice(9);
  }
  return undefined;
}
const FLAG = require.main === module ? groupsArg(process.argv.slice(2)) : undefined;
let REG = registry.load({ extra: EXTRA, groups: registry.parseGroups(FLAG !== undefined ? FLAG : process.env.ARSENAL_MCP_GROUPS) });
ctxLib.setRegistry(() => REG);
function reload(opt) { REG = registry.load(opt); return REG; }
const served = () => REG.tools.filter(t => t.served);
// the group list that loads one more group beside the ones served now
const withGroup = g => registry.sortGroups(REG.groups.served.concat(g)).join(',');

const typeOf = v => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v === 'number' && Number.isInteger(v) ? 'integer' : typeof v);
function typeOk(v, want) {
  const have = typeOf(v), list = Array.isArray(want) ? want : [want];
  return list.some(w => w === have || (w === 'number' && have === 'integer'));
}
// -> plain reason, or null
function checkArgs(tool, args) {
  if (typeOf(args) !== 'object') return 'arguments must be an object';
  const s = tool.inputSchema, props = s.properties || {};
  for (const k of s.required || []) if (args[k] === undefined || args[k] === null) return 'argument "' + k + '" is needed';
  for (const k of Object.keys(args)) {
    const v = args[k], p = props[k];
    if (v === undefined || v === null) continue;
    if (p && p.type && !typeOk(v, p.type)) return 'argument "' + k + '" must be ' + (Array.isArray(p.type) ? p.type.join(' or ') : p.type);
    if (p && Array.isArray(p.enum) && !p.enum.includes(v)) return 'argument "' + k + '" must be one of: ' + p.enum.join(', ');
    if (k === 'write' && typeof v !== 'boolean') return 'argument "write" must be true or false';
    if ((p && p.dash === true) || FREE.test(k)) continue;
    const texts = typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
    for (const t of texts) {
      if (t.trim().startsWith('-')) return 'argument "' + k + '" may not start with "-": ' + t.slice(0, 60);
      if (t.includes('\0')) return 'argument "' + k + '" holds a character that is not allowed';
    }
  }
  return null;
}

function shape(r) {
  if (typeof r === 'string') r = { text: r };
  if (!r || typeof r !== 'object') r = { text: 'error: the tool gave no answer', isError: true };
  let text = typeof r.text === 'string' ? r.text : '';
  if (r.na != null && !text) text = 'not available: ' + String(r.na);
  const out = { isError: !!r.isError };
  let data = r.data, tail = '';
  if (r.na != null) data = Object.assign({ na: String(r.na) }, typeOf(data) === 'object' ? data : {});
  if (typeOf(data) === 'object') {
    let n = 0; try { n = JSON.stringify(data).length; } catch (e) { n = -1; }
    if (n >= 0 && n <= DATA_MAX) out.structuredContent = data;
    else if (n > DATA_MAX) tail = '\n[data left out: ' + n + ' chars, ask for less]';
  }
  if (!text) text = out.structuredContent ? JSON.stringify(out.structuredContent, null, 1) : '(no output)';
  out.content = [{ type: 'text', text: ctxLib.cut(text) + tail }];
  return out;
}

async function call(name, args) {
  const tool = REG.tools.find(t => t.name === name);
  if (!tool) return null;
  args = args == null ? {} : args;
  const refuse = msg => shape(ctxLib.bad(msg));
  if (!tool.served) {
    const l = withGroup(tool.group);
    return shape({ isError: true, data: { group: tool.group, served: REG.groups.served, off: REG.groups.off },
      text: name + ' is in group "' + tool.group + '", and that tool\'s group is not loaded: start the server with --groups ' + l +
        ' (node tools/mcp/server.js --groups ' + l + ', or ARSENAL_MCP_GROUPS=' + l + '), or without --groups for every group. Loaded now: ' + (REG.groups.served.join(', ') || 'none') + '.' });
  }
  const why = checkArgs(tool, args);
  if (why) return refuse(why);
  args = Object.assign({}, args);
  const want = args.game != null ? args.game : (process.env.ARSENAL_GAME || games.DEFAULT);
  const g = games.get(String(want));
  if (!g) return refuse('unknown game "' + String(want).slice(0, 40) + '": use as64, mowas2 or goh');
  if (args.game != null) args.game = g.id;
  if (!tool.games.includes(g.id)) return shape({ na: tool.title + ' is not available for ' + g.name + '. It serves: ' + tool.games.join(', ') + '.' });
  const ctx = ctxLib.forCall(tool, args);
  // a dry run (the tool declares `dry` and the caller passes dry: true) starts nothing, so it passes; the handler still guards the real path
  const dryRun = args.dry === true && tool.inputSchema && tool.inputSchema.properties && tool.inputSchema.properties.dry;
  if (tool.kind === 'launch' && !dryRun) { const w = ctx.guard.launchWhy(); if (w) return refuse(w); }
  if (tool.kind === 'write' && args.write === true && !ctx.guard.roots().length) return refuse(ctx.guard.canWrite(path.resolve('.')) || 'writing is off');
  try { return shape(await tool.handler(args, ctx)); }
  catch (e) {
    if (e && e.refused) return refuse(e.message);
    process.stderr.write('arsenal: ' + name + ' failed: ' + (e && e.stack || e) + '\n');
    return shape({ text: 'error: ' + name + ' failed: ' + String(e && e.message || e).split('\n')[0], isError: true });
  }
}

function listTools() {
  return served().map(t => ({ name: t.name, title: t.title, description: t.description, inputSchema: registry.publicSchema(t), annotations: registry.annotations(t) }));
}

// -> response object, or null for a notification
async function handle(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    if (msg && typeof msg === 'object' && !Array.isArray(msg) && msg.method === undefined && (msg.result !== undefined || msg.error !== undefined)) return null;   // an answer to us: we ask nothing
    return { jsonrpc: '2.0', id: msg && typeof msg === 'object' && msg.id !== undefined ? msg.id : null, error: { code: -32600, message: 'invalid request' } };
  }
  const { id, method } = msg, params = msg.params && typeof msg.params === 'object' ? msg.params : {};
  const isReq = id !== undefined && id !== null;
  const ok = result => (isReq ? { jsonrpc: '2.0', id, result } : null);
  const err = (code, message) => (isReq ? { jsonrpc: '2.0', id, error: { code, message } } : null);
  switch (method) {
    case 'initialize': {
      const v = typeof params.protocolVersion === 'string' && VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : VERSIONS[0];
      return ok({ protocolVersion: v, capabilities: { tools: { listChanged: false }, resources: {}, prompts: {} }, serverInfo: INFO, instructions: INSTRUCTIONS +
        (REG.groups.limited ? ' This server was started with only these tool groups: ' + (REG.groups.served.join(', ') || 'none') + '. mow_tools names the groups that are off and the line that loads them.' : '') });
    }
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: listTools() });
    case 'resources/list': return ok({ resources: [] });
    case 'resources/templates/list': return ok({ resourceTemplates: [] });
    case 'prompts/list': return ok({ prompts: [] });
    case 'tools/call': {
      if (typeof params.name !== 'string') return err(-32602, 'tools/call needs a tool name');
      const r = await call(params.name, params.arguments);
      return r ? ok(r) : err(-32602, 'unknown tool: ' + params.name.slice(0, 80));
    }
    default:
      return method.startsWith('notifications/') ? null : err(-32601, 'method not found: ' + method.slice(0, 80));
  }
}

function serve() {
  let buf = '';
  const send = o => { if (o) process.stdout.write(JSON.stringify(o) + '\n'); };
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => {
    buf += c;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch (e) { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); continue; }
      handle(msg).then(send, e => {
        process.stderr.write('arsenal: ' + (e && e.stack || e) + '\n');
        if (msg && msg.id != null) send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: 'internal error' } });
      });
    }
  });
  process.stdout.on('error', () => process.exit(0));   // the client went away
  for (const e of REG.errors) process.stderr.write('arsenal: ' + e.file + (e.tool ? ' ' + e.tool : '') + ': ' + e.error + '\n');
}

if (require.main === module) {
  for (const g of REG.groups.unknown) process.stderr.write('arsenal: no tool group named "' + g.slice(0, 40) + '"; the groups are: ' + REG.groups.all.join(', ') + '\n');
  if (process.argv.includes('--list')) {
    const sv = served();
    process.stdout.write(JSON.stringify({ tools: listTools().map((t, i) => Object.assign({ group: sv[i].group, kind: sv[i].kind, games: sv[i].games }, t)), groups: REG.groups, errors: REG.errors }, null, 1) + '\n');
  } else serve();
}
module.exports = { handle, call, listTools, reload, groupsArg, registry: () => REG, VERSIONS, INFO };
