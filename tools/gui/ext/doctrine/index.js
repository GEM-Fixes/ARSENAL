// GUI-EXT doctrine: "Bot doctrine". The Men of War doctrine pack (rules, personas, missions, mod profiles) and a generator that turns
// a persona into bot settings in the user's mod copy of bot.data.lua (tools/doctrine). Reads the game read only; writes only into the picked mod.
// Games: AS64 and MoW:AS2 alike (bot.data.lua of the request's game, exe mowas_2 under MoW:AS2); GoH: detect, gen and check use the Conquest settings ConquestConfig in modes/conquest/runtime_config.lua (GoH has no bot.data.lua, GHMIS-66; tools/doctrine profile conquest, [T]); data, voice and profile take no game.
// Author: Imperator_Aug (ARSENAL, ia-417ac068)
const lib = require('./lib');
const script = require('./script');
const lang = require('./lang');

const q = (url, k) => (url && url.searchParams && url.searchParams.get(k)) || '';

module.exports = {
  id: 'doctrine',
  nav: 'doctrine.nav',
  adv: false,
  after: 'bots',
  script,
  lang,
  commands: {},
  routes: {
    'GET /api/x/doctrine/data': async () => lib.all(),
    'GET /api/x/doctrine/voice': async (url) => lib.voice(q(url, 'persona'), q(url, 'event'), q(url, 'seed')),
    'GET /api/x/doctrine/profile': async (url) => lib.profile(q(url, 'id')),
    'GET /api/x/doctrine/detect': async (url, body, ctx) => lib.detect(ctx, lib.checkMod(ctx, q(url, 'mod'), true)),
    'POST /api/x/doctrine/gen': async (url, body, ctx) => { body = body || {}; if (body.write && ctx && ctx.job) ctx.job.writes = true;   // JOBS: the footer asks twice before stopping a write
      const mod = lib.checkMod(ctx, body.mod, !body.write), r = lib.gen(ctx, mod, body);   // the write guard only for a write; a preview only reads
      // CACHE (gui README contract 1): bot.data.lua was written into the mod: the shared walk (lib/modtree) scans again for the next reader
      if (r && r.wrote) { try { ((ctx && ctx.modtree) || require('../../../lib/modtree')).touch(mod); } catch (e) { /* nothing kept */ } }
      return r; },
    'POST /api/x/doctrine/check': async (url, body, ctx) => { body = body || {}; return lib.check(ctx, lib.checkMod(ctx, body.mod, true), body); },
  },
};
