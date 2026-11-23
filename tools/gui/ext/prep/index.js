// GUI-EXT prep: "Prepare" (gui README, CACHE contract 1). The page that makes prepared data ahead of time, shows what is ready or out of
// date, and removes it. Lists the `prep` sections of every ext (ext/index.js collects them: ctx.prepSections) and owns the two shared
// ones: game.view (the game file view) and mod.tree (the walk of the mod). Reads the game and the mod; writes only into the store.
// Games: all three (a section says which games it is for; the others answer na).
// Routes: GET state?mod=, POST run {mod, sections: [ids]|'all'|'stale', lang?}, POST stop {}, POST clear {section?, mod?}, POST check {mod}.
// Page setting: prep.open (default true) = the window opens on this page at start.
// Author: Imperator_Aug (ARSENAL, ia-6dd539e7)
const lib = require('./lib');
const script = require('./script');
const lang = require('./lang');

module.exports = {
  id: 'prep',
  nav: 'prep.nav',
  adv: false,
  script,
  lang,
  commands: {},
  prep: lib.OWN,
  routes: {
    'GET /api/x/prep/state': async (url, body, ctx) => { if (ctx && ctx.job) ctx.job.hidden = true;   // a poll: never in the job list
      return lib.state(ctx, (url && url.searchParams && url.searchParams.get('mod')) || ''); },
    'POST /api/x/prep/run': async (url, body, ctx) => lib.run(ctx, body),
    'POST /api/x/prep/stop': async (url, body, ctx) => lib.stop(ctx),
    'POST /api/x/prep/clear': async (url, body, ctx) => lib.clear(ctx, body),
    'POST /api/x/prep/check': async (url, body, ctx) => lib.check(ctx, body),
  },
};
