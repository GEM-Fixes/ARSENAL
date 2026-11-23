// GUI-EXT files: "Mod files". File tree of the current mod with the VFS winner per file (E-2), a raw text editor that saves
// byte-exact into the mod (E-1), restore points next to the mod (E-22) and a capped text search (E-3). Logic: ./lib.js.
// Reads anywhere; writes only into the picked mod folder (never game install, vanilla, paks, GoH, Workshop). Preview before every write.
// Author: Imperator_Aug (ARSENAL, ia-c5ad360b)
const lib = require('./lib');

const Q = url => { const o = {}; if (url && url.searchParams) for (const [k, v] of url.searchParams) o[k] = v; return o; };

// after a write the Editor's language help must not answer from the old file: mark its entity index and game view stale.
// Lazy and optional: the files page works without tools/ide.
// CACHE (gui README, contract 1): the shared walk of the mod is asked again after a write (ctx.modtree.touch), so every page that
// keeps data by the mod's signature sees the change on its next look.
const wrote = (ctx, res, rel) => {
  if (res && res.written) {
    try { const mt = (ctx && ctx.modtree) || require('../../../lib/modtree'); if (res.mod) mt.touch(res.mod); } catch { /* no walk kept */ }
    try { require('../../../ide/intel').touch({ gameDir: lib.gameOf(ctx) || undefined }, rel || ''); } catch { /* no language help installed */ }
  }
  return res;
};
// a phone (gui.js remote view) reads only: an opened file is never editable there, and its search ids never meet the PC's
const ro = (ctx, res) => (lib.isRemote(ctx) && res && typeof res === 'object' ? Object.assign(res, { editable: false, why: 'remote' }) : res);
const rsid = (ctx, body) => (lib.isRemote(ctx) && body && typeof body === 'object' ? Object.assign({}, body, { sid: 'rmt:' + String(body.sid == null ? '' : body.sid) }) : body);
// JOBS: a request that writes into the mod (write: true) says so: the footer asks twice before stopping it
const wr = (ctx, body) => { if (body && body.write && ctx && ctx.job) ctx.job.writes = true; return body; };

module.exports = {
  id: 'files',
  nav: 'files.nav',
  adv: true,   // the Editor tab (ext/ide) replaces this page; it stays behind the Advanced switch until it is removed. Its routes and lib.js are the Editor's back end.
  after: 'mods',
  script: require('./script'),
  lang: require('./lang'),
  commands: {},
  routes: {
    'GET /api/x/files/tree': async (url, body, ctx) => lib.tree(ctx, Q(url)),
    // SPEED: lib.vfsWarm first = the shared scan of the mod, not blocking, so the sync readers find the view (no walk of the mod)
    'GET /api/x/files/which': async (url, body, ctx) => { const q = Q(url); await lib.vfsWarm(ctx, q.mod); return lib.which(ctx, q); },
    'GET /api/x/files/open': async (url, body, ctx) => { const q = Q(url); await lib.vfsWarm(ctx, q.mod); return ro(ctx, lib.openFile(ctx, q)); },
    'POST /api/x/files/save': async (url, body, ctx) => wrote(ctx, lib.save(ctx, wr(ctx, body)), body && body.rel),
    'POST /api/x/files/copy': async (url, body, ctx) => { await lib.vfsWarm(ctx, body && body.mod); return wrote(ctx, lib.copyIn(ctx, wr(ctx, body)), body && (body.rel || body.key)); },
    'GET /api/x/files/undo': async (url, body, ctx) => lib.undoList(ctx, Q(url).mod),
    'POST /api/x/files/restore': async (url, body, ctx) => wrote(ctx, lib.restore(ctx, wr(ctx, body) || {}), ''),
    'POST /api/x/files/warm': async (url, body, ctx) => lib.searchWarm(ctx, body),   // the search opens: walk + read the mod's text files into memory (corpus.js)
    'POST /api/x/files/search': async (url, body, ctx) => { await lib.vfsWarm(ctx, body && body.mod); return await lib.search(ctx, rsid(ctx, body)); },   // async, sliced, 8 s budget; same `sid` cancels the older one
  },
};
