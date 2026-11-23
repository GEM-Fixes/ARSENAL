// bots part "buycheck": Check the bot buy list. One button lists every silent problem of the mod's bot.data.lua, bots_generic.inc and MP
// presets (check.js), each with a plain sentence of what goes wrong in a match and a Fix (plain preview, then write into the mod only, Undo).
// Routes (mod = query ?mod= or body.mod; game from ctx): GET run, GET cards (the picker's list: id, army, in-game name), POST fix
// {id, how, value, write}, POST undo {rel}. A refusal is {ok: false, code, args}: the page words it in four languages (undo.js reply).
// Author: Imperator_Aug (ARSENAL, ia-8f1a520a)
'use strict';
const lib = require('../../lib');
const C = require('./check');
const { reply } = require('./undo');

const warmed = fn => require('../stages/cards').route(fn);
const modOf = (url, body) => (url && url.searchParams && url.searchParams.get('mod')) || (body && body.mod) || '';

module.exports = {
  id: 'buycheck',
  group: 'A',
  order: 10,
  routes: {
    // SPEED: warmed = the shared mod scan waited for first (stages/cards warm), so check.setup's mounts go by listing, not by a walk
    'GET /api/x/bots/buycheck/run': reply(warmed(async (url, body, ctx) => C.run(ctx, lib.checkMod(ctx, modOf(url, body))))),
    'GET /api/x/bots/buycheck/cards': reply(warmed(async (url, body, ctx) => C.cards(ctx, lib.checkMod(ctx, modOf(url, body))))),
    'POST /api/x/bots/buycheck/fix': reply(warmed(async (url, body, ctx) => C.fix(ctx, lib.checkMod(ctx, modOf(url, body)), body || {}))),
    'POST /api/x/bots/buycheck/undo': reply(async (url, body, ctx) => C.undo(ctx, lib.checkMod(ctx, modOf(url, body)), body || {})),
  },
  lang: require('./lang'),
  script: require('./client'),
};
