// claude ext: server routes over tools/mcp/pack/pack.js. The skills and MCP tool groups of this toolkit as pieces, pack groups and
// the full pack: list, download (a zip), install into Claude (preview unless body.write is true), uninstall, what is installed.
// Writes go only into the chosen Claude target (the user's Claude folders, or a project folder the user picked): never into a game
// install or a mod. A project folder inside a game folder is refused. The piece list is kept by pack.js while no source file changed.
// Closed to LAN Remote devices (not on remote.js ALLOW).
// Author: Imperator_Aug (ARSENAL, ia-0411a6c8)
'use strict';
const path = require('path');
const P = require('../../../mcp/pack/pack');

const bad = m => Object.assign(new Error(m), { status: 400 });
const str = (v, n) => (typeof v === 'string' ? v : '').slice(0, n || 2000).trim();
const inside = (child, parent) => { if (!parent) return false; const r = path.relative(path.resolve(parent), path.resolve(child)); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
// errors of pack.js that are plain words for the user (bad choice, bad file) -> 400 with that text
async function plain(fn) { try { return await fn(); } catch (e) { if (e && e.plain) throw Object.assign(new Error(e.message), { status: 400 }); throw e; } }

function targetOf(kind, dir, ctx) {
  kind = str(kind, 40) || 'claude-code-user';
  if (kind !== 'claude-code-project') { if (kind !== 'claude-code-user' && kind !== 'claude-desktop') throw bad('Unknown target.'); return kind; }
  dir = str(dir);
  if (!dir) throw bad('Pick the project folder first.');
  if (!path.isAbsolute(dir)) throw bad('The project folder must be a full path.');
  for (const g of [ctx.game && ctx.game(), ctx.gohDir && ctx.gohDir()]) if (g && inside(dir, g)) throw bad('That folder is inside a game folder. Pick a project folder outside the game.');
  return 'claude-code-project:' + path.resolve(dir);
}
const selOf = b => { const all = b.all === true, piece = Array.isArray(b.piece) ? b.piece.map(x => str(x, 120)) : str(b.piece, 120), group = str(b.group, 60);
  return { all, piece: !all && piece && piece.length ? piece : null, group: !all && group ? group : null }; };
const envOf = b => { const e = b.env && typeof b.env === 'object' ? b.env : {}; return { game: str(e.game, 12), writeRoots: str(e.writeRoots, 4000), allowLaunch: e.allowLaunch === true }; };
// the piece list for the page: no file contents, short tool rows
const slim = D => ({ root: D.root, sig: D.sig, groupsFlag: D.groupsFlag, errors: D.errors.slice(0, 20),
  all: D.all, groups: D.groups,
  pieces: D.pieces.map(p => ({ id: p.id, kind: p.kind, name: p.name, title: p.title, what: p.what, bytes: p.bytes, groups: p.groups, server: p.server || null,
    files: p.files.map(f => ({ rel: f.rel, bytes: f.bytes })), tools: p.tools.map(t => ({ name: t.name, title: t.title, kind: t.kind })) })) });
function statusOf(D, kind, dir, ctx) {
  let target; try { target = targetOf(kind, dir, ctx); } catch (e) { return { target: null, need: e.message, pieces: [], skills: [], zips: [], mcp: [] }; }
  try { return P.status(D, target, {}); } catch (e) { if (e && e.plain) return { target: null, need: e.message, pieces: [], skills: [], zips: [], mcp: [] }; throw e; }
}

const routes = {
  // the pieces, the pack groups, the full pack + what is installed in the chosen target
  'GET /api/x/claude/list': async (u, body, ctx) => {
    const D = await plain(() => P.discover({}));
    return Object.assign(slim(D), { status: statusOf(D, u.searchParams.get('target'), u.searchParams.get('dir'), ctx) });
  },
  'GET /api/x/claude/status': async (u, body, ctx) => {
    const D = await plain(() => P.discover({}));
    return statusOf(D, u.searchParams.get('target'), u.searchParams.get('dir'), ctx);
  },
  // one zip as base64 (the page saves it): {piece | group | all, env?}
  'POST /api/x/claude/zip': async (u, body, ctx) => {
    const b = body || {}, D = await plain(() => P.discover({}));
    if (ctx.job && ctx.job.set) ctx.job.set({ what: 'claude.job.zip', page: 'claude' });
    const z = await plain(() => P.zipOf(D, selOf(b), { env: envOf(b) }));
    return { name: z.name, bytes: z.buf.length, files: z.entries.length, b64: z.buf.toString('base64') };
  },
  // install: a plan unless body.write is true (same body, same code path)
  'POST /api/x/claude/install': async (u, body, ctx) => {
    const b = body || {}, D = await plain(() => P.discover({})), target = targetOf(b.target, b.dir, ctx), write = b.write === true;
    if (ctx.job) { if (ctx.job.set) ctx.job.set({ what: 'claude.job.install', page: 'claude' }); if (write) ctx.job.writes = true; }
    const plan = await plain(() => P.install(D, selOf(b), target, { write, env: envOf(b), cli: b.direct === true ? false : undefined, replace: b.replace === true }));
    return Object.assign(plan, { status: write ? statusOf(D, b.target, b.dir, ctx) : null });
  },
  // uninstall: only what the installer put (its manifest); no piece, group or all in the body = everything it put
  'POST /api/x/claude/uninstall': async (u, body, ctx) => {
    const b = body || {}, D = await plain(() => P.discover({})), target = targetOf(b.target, b.dir, ctx), write = b.write === true, s = selOf(b);
    if (ctx.job) { if (ctx.job.set) ctx.job.set({ what: 'claude.job.uninstall', page: 'claude' }); if (write) ctx.job.writes = true; }
    const plan = await plain(() => P.uninstall(D, s.all || s.piece || s.group ? s : null, target, { write }));
    return Object.assign(plan, { status: write ? statusOf(D, b.target, b.dir, ctx) : null });
  },
};
module.exports = { routes };
