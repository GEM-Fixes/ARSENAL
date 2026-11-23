// GUI ext doctrine: server side. Serves the vendored Men of War doctrine pack (tools/doctrine/data) and runs the doctrine generator
// on the user's mod: reads bot.data.lua (base file/folder, else the mod's own loose or packed copy, else the game's through the vfs, read only)
// and writes the changed COPY into the mod folder the user picked (never into the game).
// Author: Imperator_Aug (ARSENAL, ia-2e504c89)
const fs = require('fs'), path = require('path');
const D = require('../../../doctrine/lib');

// every error carries a code (and the one value it names) so the page shows it in the user's language (GT-34)
const bad = (msg, code, arg) => Object.assign(new Error(msg), { status: 400, code, arg: arg == null ? '' : String(arg) });
// the message the page receives: CODE <tab> value <tab> English sentence (the page translates CODE, the sentence is the fallback)
function tagged(e) {
  if (!e.status) e.status = 400;
  if (e.code && /^DOC_/.test(e.code) && !e.tagged) { e.message = e.code + '\t' + (e.arg || '') + '\t' + e.message; e.tagged = true; }
  return e;
}
// the install of the request's game: ctx.curDir() (the AS2 install under AS64 and MoW:AS2); an older ctx without it: ctx.game()
const gameOf = ctx => { try { return (ctx.curDir && ctx.curDir()) || (ctx.game && ctx.game()) || null; } catch (e) { return null; } };
const wrap = fn => { try { return fn(); } catch (e) { throw tagged(e); } };

// the mod folder the user picked: must exist, and may not be the game install (except <game>/mods/<mod>)
function checkMod(ctx, mod, read) {
  if (!mod || typeof mod !== 'string') throw tagged(bad('Pick a mod folder first (the Mods page).', 'DOC_UI_NEEDMOD'));
  const p = path.resolve(mod);
  let st = null; try { st = fs.statSync(p); } catch (e) { /* missing */ }
  if (!st || !st.isDirectory()) throw tagged(bad('That mod folder does not exist: ' + mod, 'DOC_UI_NOMOD', mod));
  // shared write guard: any AS2 install, GoH, Workshop by content, whatever game is set; <game>/mods/<mod> allowed
  if (read) return p;   // detect and check only read: a mod under <game>/mods (every GoH mod) may be looked at
  const why = require('../../../lib/writeguard').refuseWrite(p, { game: gameOf(ctx) || undefined, purpose: 'use this mod folder' });
  if (why) throw tagged(bad(why, 'DOC_GAME_DIR', p));
  return p;
}

// everything the page lists, in one call (about 90 KB)
function all() {
  const x = D.data();
  return {
    note: x.note,
    rules: x.rules,
    personas: x.personas,
    voices: x.voices.map(v => ({ id: v.id, register: v.register, events: Object.keys(v.lines) })),
    missions: x.missions.map(m => Object.assign({}, m, { briefing: D.TEXT.missions[m.id] || '' })),
    profiles: x.profiles.map(p => p.id),
    readme: D.TEXT.readme,
    // the pack's documents on disk (data/md: core, personas, one file per mission), for the rule filter's Browse (the folder picker;
    // '' when the pack is inside the program and not on disk)
    dir: packDir(),
  };
}
function packDir() { const d = path.join(__dirname, '..', '..', '..', 'doctrine', 'data', 'md'); try { return fs.statSync(d).isDirectory() ? d : ''; } catch (e) { return ''; } }

const voice = (persona, ev, seed) => wrap(() => ({ line: D.voice(persona, ev, seed || 0) }));
const profile = id => wrap(() => { const r = D.profileInfo(id); delete r.data; return r; });

// game parity: MoW:AS2 shares the AS2 install with AS64, so the game's bot.data.lua is read through the vfs with exe mowas_2 (no as64/core):
// D.readBase option exe. AS64 (no game named) as before, no exe. GoH has no bot.data.lua (GHMIS-66): its Conquest bot reads its tuning
// from ConquestConfig in script/multiplayer/modes/conquest/runtime_config.lua, so under GoH D.readBase gets exe goh and reads that file
// (mod copy, else the game's), D.check / D.plan take it as the conquest profile and D.writeMod writes the mod copy there [T: no GoH match
// played]. Frontlines, Battle Zones and Last Stand keep their bot settings in code (D.check says so). The pack (data, voice, profile) takes no game.
const games = require('../../../lib/games');
const idOf = ctx => { try { return (ctx.gameId && ctx.gameId()) || 'as64'; } catch (e) { return 'as64'; } };
function base(ctx, mod, b) {
  // D.readBase gets the request's install and its vfs exe (ctx.exe(), else from the id); AS64 names no exe, as before
  const id = idOf(ctx), o = { base: b || null, mod, gameDir: gameOf(ctx) };
  if (id !== 'as64') { let x = null; try { x = ctx.exe && ctx.exe(); } catch (e) { /* none */ } o.exe = games.exeOf(x || id); }
  return D.readBase(o);
}

// which bot file the mod would use, and what kind it is
function detect(ctx, mod) {
  return wrap(() => {
    let r;
    try { r = base(ctx, mod, null); } catch (e) { return { found: false, code: e.code || null }; }
    const c = D.check(r.text, 'auto');
    return { found: true, from: r.from, file: r.file, kind: c.kind, stamp: c.stamp };
  });
}

// preview (write false) or write (write true) one persona into the mod's bot.data.lua
function gen(ctx, mod, b) {
  return wrap(() => {
    if (!b.persona) throw bad('Pick a persona first.', 'DOC_UI_NOPERSONA');
    const src = base(ctx, mod, b.base);
    const p = D.plan(src.text, b.persona, b.profile || 'auto', b.scale == null || b.scale === '' ? 1 : b.scale);
    let wrote = null;
    if (b.write && !gameOf(ctx)) throw bad('Press "Game folder..." in the top bar first, so ARSENAL can tell your mod apart from the game install. Nothing was written.', 'DOC_UI_NOGAME');
    if (b.write && p.changes.length) wrote = D.writeMod(mod, p.text, gameOf(ctx), { profile: p.profile });
    return { persona: p.persona, profile: p.profile, scale: p.scale, base: { from: src.from, file: src.file }, changes: p.changes, skipped: p.skipped, traits: p.traits, wrote, write: !!b.write };
  });
}

function check(ctx, mod, b) {
  return wrap(() => {
    const src = base(ctx, mod, b.base);
    const r = D.check(src.text, b.profile || 'auto');
    r.file = src.file; r.from = src.from;
    r.errors = r.problems.filter(x => x.level === 'error').length;
    return r;
  });
}

module.exports = { checkMod, all, voice, profile, detect, gen, check };
