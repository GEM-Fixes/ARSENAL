// mcp mod group, units: the Units page of the GUI used as a library (tools/gui/ext/units/server.js routes, called in-process).
// The page's own code does the work, so MCP and GUI give the same answers: catalogue (statsheet --units-json, kept in the shared
// store), search with "did you mean", stats, and the edits as gen ops (preview = plan, write = flush into the mod folder).
//   call(ctx, g, route, body) -> the route's answer. A refusal of the page (status 400, plain words) becomes a ctx refusal.
//   gui(ctx, g)               the small GUI ctx the routes read: game folders, game id, runTool over ctx.run, scratch, the shared store
// Store: the user's shared store (lib/cachestore, the GUI's one, so a catalogue the GUI already read is reused); env
// ARSENAL_MCP_STORE names another root (tests). The first read of a game builds its index: AS64 and MoW:AS2 about a minute,
// Gates of Hell up to 45 minutes when no tool has read it before.
// Author: Imperator_Aug (ARSENAL, ia-90e2a69e)
'use strict';
const path = require('path');
const U = require('./util');

let EXT = null;
const ext = () => EXT || (EXT = require('../../../gui/ext/units/server'));
let STORE = null, STORE_ROOT = null;
function store() {
  const root = process.env.ARSENAL_MCP_STORE && path.isAbsolute(process.env.ARSENAL_MCP_STORE) ? process.env.ARSENAL_MCP_STORE : '';
  if (!STORE || STORE_ROOT !== root) { STORE = require('../../../lib/cachestore').open(root ? { root } : {}); STORE_ROOT = root; }
  return STORE;
}

function gui(ctx, g) {
  const as2 = g.kind === 'as2' ? g.dir : (ctx.game({ game: 'as64' }).dir || null);
  const goh = g.kind === 'goh' ? g.dir : (ctx.game({ game: 'goh' }).dir || null);
  return {
    gamedir: as2, tools: ctx.TOOLS, tmpRoot: U.tmpDir(), cache: store(), allowLaunch: false, modAgeMs: 0,
    async runTool(tool, entry, args, x) {
      const parts = String(entry).split('/'), dir = parts.shift();
      const r = await ctx.run(dir, args.map(String), { script: parts.join('/'), timeout: (x && x.timeoutMs) || 600000, env: U.childEnv(), cwd: U.tmpDir() });
      return { code: r.code, stdout: r.stdout, stderr: r.stderr, timedOut: !!r.timedOut };
    },
    game: () => as2, gameId: () => g.id, exe: () => g.exe, kind: () => g.kind, gohDir: () => goh, curDir: () => (g.kind === 'goh' ? goh : as2),
  };
}

async function call(ctx, g, route, body) {
  const R = ext().routes, fn = R['POST /api/x/units/' + route];
  if (!fn) throw new Error('units route not found: ' + route);
  const b = Object.assign({ gid: g.id, game: U.need(ctx, g) }, body);
  try { return await fn('/api/x/units/' + route, b, gui(ctx, g)); }
  catch (e) {
    if (e && (e.status === 400 || e.status === 499)) throw ctx.refusal(String(e.message).replace(/\s+/g, ' ').replace(/ on the Start page first\.?$/, '.'));
    throw e;
  }
}

const lib = () => ext().lib;

module.exports = { call, gui, store, lib };
