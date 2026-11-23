// The game of a Models route (game parity,. One helper for server.js and every sub/*.server.js:
//   idOf(ctx, b)    'as64' | 'mowas2' | 'goh': body.exe (as64, mowas2, mowas_2, goh; a caller outside the page) else ctx.gameId()
//                   (the page's game, sent by api()), else 'as64' (nothing named: everything as before)
//   exeOpt(ctx, b)  the vfs exe for an in-process lib (vfs, stage.openSource, target.resolve, model edit core, armordata, modelindex):
//                   undefined under AS64, so the AS64 calls stay exactly as they were; 'mowas_2' under MoW:AS2; 'goh' under Gates of Hell
//   exeArgs(ctx, b) ['--exe', 'mowas_2' | 'goh'] for a tool started by the route, [] under AS64 (the AS64 argument list stays as it is)
//   tag(ctx, b)     the game id for a cache key, so AS64, MoW:AS2 (one shared install) and GoH never share an answer
//   gameDir(ctx, b) the install folder the route reads: AS64 and MoW:AS2 = body.game else ctx.game() (as before); Gates of Hell = the GoH
//                   install (body.game only when it is a GoH install, else ctx.curDir(), ctx.gohDir()); null when there is none
//   modGuard(ctx, b, mod) -> mod; throws the lib/writeguard line (status 400), under every game (AS64, MoW:AS2, Gates of Hell): a mod folder in
//                   a game's own files, a Workshop item while Advanced is off, a mod in <GoH>/mods that ARSENAL did not make while Advanced is off (owner 2026-11-15)
//   noGohArmour(ctx, b) throws the plain line under Gates of Hell (status 400): the armour simulator reads the AS2 damage model
//                   (GoH part armour is another model: GHDMG-01, GHDMG-25). SOEdit and the model editing work under Gates of Hell
//                   (owner 2026-11-15,; this replaces "AS2 and the 64-bit build only" of 2026-11-10 for them).
// Author: Imperator_Aug (ARSENAL, ia-35796284)
const fs = require('fs'), path = require('path');
const games = require('../../../lib/games');

const NA_GOH_ARMOUR = 'Not available in GoH: the armour simulator is for MoW:AS2 and AS64 only; Gates of Hell works out armour and damage in another way (GHDMG-01).';

function idOf(ctx, b) {
  const want = b && b.exe;
  if (want) {
    const g = games.get(want);
    if (!g) throw Object.assign(new Error('Unknown game: ' + String(want).slice(0, 40) + ' (as64, mowas2, goh).'), { status: 400 });
    return g.id;
  }
  let id = null;
  try { id = ctx && typeof ctx.gameId === 'function' ? games.idOf(ctx.gameId()) : null; } catch (e) { id = null; }
  return id || games.DEFAULT;
}
const isGoh = (ctx, b) => games.kindOf(idOf(ctx, b)) === 'goh';
function exeOpt(ctx, b) { const id = idOf(ctx, b); return id === games.DEFAULT ? undefined : games.exeOf(id); }
function exeArgs(ctx, b) { const e = exeOpt(ctx, b); return e ? ['--exe', e] : []; }
function tag(ctx, b) { return idOf(ctx, b); }
const isGohDir = d => { try { return !!d && fs.statSync(path.join(d, 'binaries', 'x64', 'call_to_arms.exe')).isFile(); } catch (e) { return false; } };
function gameDir(ctx, b) {
  let g;
  if (isGoh(ctx, b)) g = (b && b.game && isGohDir(b.game) ? b.game : null) || (ctx && ctx.curDir && ctx.curDir()) || (ctx && ctx.gohDir && ctx.gohDir()) || null;
  else g = (b && b.game) || (ctx && ctx.game && ctx.game()) || null;
  return g && fs.existsSync(g) ? path.resolve(g) : null;
}
function modGuard(ctx, b, mod) {
  if (!mod) return mod;
  const why = require('../../../lib/writeguard').refuseWrite(mod, { game: gameDir(ctx, b) });
  if (why) throw Object.assign(new Error(String(why).replace(/^refused:\s*/, '')), { status: 400 });
  return mod;
}
function noGohArmour(ctx, b) {
  if (isGoh(ctx, b)) throw Object.assign(new Error(NA_GOH_ARMOUR), { status: 400, na: 'models.armor.goh' });
}

module.exports = { idOf, exeOpt, exeArgs, tag, gameDir, modGuard, isGoh, noGohArmour, NA_GOH_ARMOUR };
