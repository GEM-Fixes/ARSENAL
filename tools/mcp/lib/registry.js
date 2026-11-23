// mcp registry: loads every tools/mcp/tools/*.js module (README "Tool module contract") and checks its form.
//   load({ dir, extra, groups }?) -> { tools: [tool + { group, file, served }], modules: [{ file, group, count }], errors: [{ file, tool?, error }],
//                                      groups: { all, served, off, unknown, limited } }
//     A tool's group is its own `group` field when it has one, else the module's (README "Pieces, groups and downloads").
//     opt.groups = the group names to serve (list, or null = all). tools holds EVERY loaded tool; `served` is false for a tool whose
//     group was not asked for. ALWAYS (mow_tools) is served whatever the groups. groups.unknown = asked for, no tool has it.
//   parseGroups(text) -> list of names, or null for all ('' and 'all' = all).  sortGroups(names) -> the frozen order, then a-z.
//     opt.extra = more folders loaded after the main one (server.js passes env ARSENAL_MCP_EXTRA_TOOLS: the test fixtures; the catalog never does).
//     A module that throws on require, or has a wrong form, is listed in errors and skipped; a tool with a wrong form or a name
//     already taken is listed and skipped. Nothing here stops the server.
//   publicSchema(tool) -> inputSchema as sent to the client: `game` added (enum = the games the tool serves) and, for a write tool,
//     `write`, when the module did not declare them.
//   annotations(tool) -> { title, readOnlyHint, destructiveHint: false, idempotentHint, openWorldHint: false }
// Author: Imperator_Aug (ARSENAL, ia-01b20e25)
'use strict';
const fs = require('fs'), path = require('path');
const GAMES = ['as64', 'mowas2', 'goh'], KINDS = ['read', 'write', 'launch'];
const DIR = path.resolve(__dirname, '..', 'tools');
const ORDER = ['knowledge', 'mod', 'together', 'units', 'weapons', 'text', 'maps', 'bots', 'play', 'coach', 'run', 'assets', 'scripts', 'robz'];
const ALWAYS = ['mow_tools'];
const GROUP_RE = /^[a-z][a-z0-9_-]*$/;

function parseGroups(text) {
  if (text == null) return null;
  const l = [...new Set(String(text).split(/[,;\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean))];
  return !l.length || l.includes('all') ? null : l;
}
function sortGroups(names) {
  const rank = n => { const i = ORDER.indexOf(n); return i < 0 ? ORDER.length : i; };
  return [...new Set(names)].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

function checkTool(t) {
  if (!t || typeof t !== 'object') return 'a tool must be an object';
  if (typeof t.name !== 'string' || !/^mow_[a-z0-9]+(_[a-z0-9]+)*$/.test(t.name)) return 'name must be mow_<area>_<verb> in lower case';
  if (typeof t.title !== 'string' || !t.title.trim()) return 'title missing';
  if (typeof t.description !== 'string' || !t.description.trim()) return 'description missing';
  if (!t.inputSchema || t.inputSchema.type !== 'object') return 'inputSchema must be { type: "object", properties }';
  if (t.inputSchema.properties != null && typeof t.inputSchema.properties !== 'object') return 'inputSchema.properties must be an object';
  if (t.inputSchema.required != null && !Array.isArray(t.inputSchema.required)) return 'inputSchema.required must be a list';
  if (!Array.isArray(t.games) || !t.games.length || !t.games.every(g => GAMES.includes(g))) return 'games must list as64, mowas2 and/or goh';
  if (!KINDS.includes(t.kind)) return 'kind must be read, write or launch';
  if (typeof t.handler !== 'function') return 'handler must be a function';
  if (t.group != null && (typeof t.group !== 'string' || !GROUP_RE.test(t.group))) return 'group must be one short word in lower case';
  return null;
}

function load(opt) {
  const dirs = [(opt && opt.dir) || DIR].concat((opt && opt.extra) || []), out = { tools: [], modules: [], errors: [] }, seen = new Map();
  const files = [];
  for (const dir of dirs) {
    try { for (const n of fs.readdirSync(dir).filter(n => n.endsWith('.js')).sort()) files.push([dir, n]); }
    catch (e) { out.errors.push({ file: path.basename(dir), error: 'tools folder not readable: ' + (e.code || e.message) }); }
  }
  for (const [dir, file] of files) {
    let m;
    try { m = require(path.join(dir, file)); } catch (e) { out.errors.push({ file, error: 'did not load: ' + String(e && e.message || e).split('\n')[0] }); continue; }
    if (!m || typeof m !== 'object' || !Array.isArray(m.tools)) { out.errors.push({ file, error: 'exports no tools list' }); continue; }
    const group = typeof m.group === 'string' && m.group ? m.group : file.replace(/\.js$/, '');
    let count = 0;
    for (const t of m.tools) {
      const why = checkTool(t);
      if (why) { out.errors.push({ file, tool: t && typeof t.name === 'string' ? t.name : '?', error: why }); continue; }
      if (seen.has(t.name)) { out.errors.push({ file, tool: t.name, error: 'name already used by ' + seen.get(t.name) }); continue; }
      seen.set(t.name, file);
      out.tools.push(Object.assign({}, t, { group: t.group || group, file })); count++;
    }
    out.modules.push({ file, group, count });
  }
  const want = opt && Array.isArray(opt.groups) ? opt.groups : null, all = sortGroups(out.tools.map(t => t.group));
  for (const t of out.tools) t.served = !want || want.includes(t.group) || ALWAYS.includes(t.name);
  out.groups = { all, limited: !!want, served: want ? all.filter(g => want.includes(g)) : all, off: want ? all.filter(g => !want.includes(g)) : [],
    unknown: want ? want.filter(g => !all.includes(g)) : [] };
  return out;
}

function publicSchema(t) {
  const s = Object.assign({}, t.inputSchema), p = Object.assign({}, s.properties || {});
  if (!p.game) p.game = { type: 'string', enum: t.games.slice(), description: 'Which game: ' + t.games.join(', ') + '. Default: the server setting ARSENAL_GAME, else as64.' };
  if (t.kind === 'write' && !p.write) p.write = { type: 'boolean', description: 'true = change files. Left out = a preview of what would change, nothing is written.' };
  s.properties = p;
  for (const k of Object.keys(p)) {   // our own marks are not JSON Schema
    if (p[k] && typeof p[k] === 'object' && ('dash' in p[k])) { p[k] = Object.assign({}, p[k]); delete p[k].dash; }
  }
  return s;
}
function annotations(t) {
  return { title: t.title, readOnlyHint: t.kind === 'read', destructiveHint: false, idempotentHint: t.kind === 'read', openWorldHint: false };
}

module.exports = { load, publicSchema, annotations, checkTool, parseGroups, sortGroups, GAMES, KINDS, DIR, ORDER, ALWAYS };
