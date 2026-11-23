// mcp tools, group `play`: for a person who PLAYS Men of War: Assault Squad 2 (mowas2), its 64-bit build AS64 (as64) or Gates of Hell
// (goh) and asks for help. Contract: tools/mcp/README.md. Every tool takes `game`; an answer is short plain words, then compact `data`.
//   read:   mow_game_status  mow_game_log  mow_game_crash  mow_matchup  mow_unit_armor  mow_army  mow_unit_counter  mow_mode_info
//           mow_bots_info  mow_settings_info  mow_game_routes   (mow_mp_sync lives in mod.js)
//   launch: mow_mods_enable  mow_game_start  mow_game_drive  mow_game_shot      (refused unless ARSENAL_ALLOW_LAUNCH=1; `dry: true`
//           starts nothing and answers the command line and the plan. A dry run needs no permission: the server lets
//           a launch tool that declares `dry` through with dry: true, and the handlers guard the real path)
// Wraps: lib/games + lib/userdir + lib/exever + modswitch (status), logtriage + gui/ext/logs/plain (log, crash), armorsim sim/pen
//   (matchup, armour, counter), balance (the buy panel rows of statsheet --units-json: army, counter, bots), gui/ext/modes + balance
//   lib economy (modes), keyprof + the profile folder (settings), mpsync, modswitch, testrun, uidrive, uidrive/lib/win.ps1, shotcrop.
// Rules stated in an answer carry their row id (limits AREA-NN, gohweb GH<AREA>-NN) or the web block they come from.
// Nothing here writes into a game folder or a mod. The only files written: the unit catalogue cache and screenshots, both in the
// scratch folder (env ARSENAL_TMP, else the system temp folder).
// Author: Imperator_Aug (ARSENAL, ia-c06f624a)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const H = require('./play/lib');

const GAME = { type: 'string', enum: ['as64', 'mowas2', 'goh'], description: 'Which game: as64 (the 64-bit build of Assault Squad 2, default), mowas2 (the released Assault Squad 2) or goh (Gates of Hell).' };
const MOD = { type: 'string', description: 'Optional: full path of one mod folder to read on top of the game (the answer then shows the modded values). Read only.' };
const schema = (props, required) => ({ type: 'object', properties: Object.assign({ game: GAME }, props), required: required || [] });
const ALL = ['as64', 'mowas2', 'goh'];

// ---------------------------------------------------------------- status
async function gameStatus(args, ctx) {
  const g = ctx.game(args), L = [], data = { game: g.id, name: g.name, dir: g.dir, source: g.source };
  if (!g.dir) return H.noGame(ctx, g);
  L.push(g.name + ' is installed at ' + g.dir + ' (found by: ' + g.source + ').');
  const exe = H.exePath(g);
  if (fs.existsSync(exe)) {
    try { const e = require('../../lib/exever').check(exe); data.exe = { file: e.name, build: e.short, version: e.pe || null, known: e.known, changed: e.mtime.slice(0, 10) }; L.push('Program: ' + e.name + (e.pe ? ' version ' + H.peText(e.pe) : '') + ', build id ' + e.short + (e.known ? '' : ' (a build this toolkit has not seen before)') + '.'); }
    catch (e) { L.push('Program: ' + path.basename(exe) + ' (could not be read: ' + e.message + ').'); }
  } else { data.exe = null; L.push('The program file ' + g.file + ' is missing from that folder.'); }
  const run = H.running(g); data.running = run;
  L.push(run === null ? 'Running: cannot tell on this system.' : run ? 'The game is running now.' : 'The game is not running.');
  const ms = await ctx.run('modswitch', ['--game', g.dir, '--exe', g.exe], { timeout: 60000 });
  const act = /^active:\s*(.*)$/m.exec(ms.stdout || '');
  data.mods = act ? (/^\(none\)/.test(act[1]) ? [] : act[1].split(/,\s*/).map(s => s.trim()).filter(Boolean)) : null;
  data.modNotes = (ms.stdout || '').split(/\r?\n/).filter(l => /MOD_|WARN|ERROR/.test(l)).slice(0, 10);
  L.push(data.mods == null ? 'Enabled mods: could not be read (' + H.firstLine(ms.text) + ').' : data.mods.length ? 'Enabled mods, in load order: ' + data.mods.join(', ') + '.' : 'No mods are enabled.');
  for (const n of data.modNotes) L.push('  ' + n.trim());
  const ud = H.userDir(g); data.userDir = ud.dir || null;
  if (ud.dir) {
    const log = path.join(ud.dir, 'log', 'game.log'); let st = null; try { st = fs.statSync(log); } catch (e) { /* none */ }
    data.lastLog = st ? st.mtime.toISOString() : null;
    L.push('Settings and logs: ' + ud.dir + (st ? '. Last game log written ' + H.ago(st.mtimeMs) + '.' : '. No game.log there yet.'));
  } else L.push('The folder with settings and logs was not found' + (ud.why ? ' (' + ud.why + ')' : '') + '.');
  data.launchAllowed = process.env.ARSENAL_ALLOW_LAUNCH === '1';
  L.push(data.launchAllowed ? 'Starting and driving the game from here is allowed.' : 'Starting the game from here is off (ARSENAL_ALLOW_LAUNCH is not 1). Reading works.');
  L.push(g.id === 'goh' ? 'Gates of Hell keeps one settings folder, in Documents/My Games or in LocalAppData when Documents is on OneDrive (GHVFS-13). It has no control pipe, so it is driven by recorded menu clicks.'
    : g.id === 'mowas2' ? 'MoW:AS2 and AS64 share one install and one settings folder (LOG-20). mowas_2.exe has no control pipe (TST-19).'
      : 'AS64 and MoW:AS2 share one install. Listing the built-in mod as64+ turns Enhanced mode on (VFS-47, VFS-48).');
  return { text: L.join('\n'), data };
}

// ---------------------------------------------------------------- log, crash
async function triage(args, ctx, g) {
  let where = args.log;
  if (where != null) { ctx.name(where, 'log'); if (!path.isAbsolute(where) || !fs.existsSync(where)) return { err: 'log: give the full path of a game.log or of its folder' }; }
  else { const ud = H.userDir(g); if (!ud.dir) return { err: 'The settings folder of ' + g.name + ' was not found' + (ud.why ? ': ' + ud.why : '') + '. Give the log path with `log`.' }; where = path.join(ud.dir, 'log'); if (!fs.existsSync(where)) return { err: 'There is no log folder yet at ' + where + '. Start the game once.' }; }
  const r = await ctx.run('logtriage', [where, '--exe', g.exe, '--json'], { timeout: 120000, max: 4 << 20 });
  let j = null; try { j = JSON.parse(r.stdout); } catch (e) { /* not json */ }
  if (!j) return { err: 'The log could not be read: ' + H.firstLine(r.text) };
  return { j, where };
}
async function gameLog(args, ctx) {
  const g = ctx.game(args), t = await triage(args, ctx, g);
  if (t.err) return ctx.bad(t.err);
  const P = require('../../gui/ext/logs/plain'), j = t.j, max = H.int(args.limit, 20, 1, 100);
  const all = (j.groups || []).filter(x => !P.INFO.has(x.code)), groups = all.filter(x => args.prev || !/^game\.prev\.log$/i.test(x.file || ''));
  const L = ['Log read: ' + t.where + (args.prev ? ' (last run and the run before)' : ' (last run)') + '.'];
  for (const h of (j.header || []).slice(0, 2)) L.push(h.trim());
  if (!groups.length) L.push('Nothing wrong was found in this log. ' + H.count((j.groups || []).length - all.length, 'kind') + ' of harmless message left out.');
  const seen = new Set();
  for (const x of groups.slice(0, max)) {
    const c = P.logCard(x) || { title: x.code, level: 'warn', fix: [] };
    L.push('- [' + c.level + '] ' + c.title + ': ' + String(x.msg || '').slice(0, 200) + (x.where ? ' (' + x.where + ')' : '') + (x.count > 1 ? ' x' + x.count : '') + (x.row ? ' [' + x.row + ']' : ''));
    if (!seen.has(x.code)) { seen.add(x.code); if (c.what) L.push('    ' + c.what); for (const f of (c.fix || []).slice(0, 2)) L.push('    fix: ' + f); }
  }
  if (groups.length > max) L.push('... ' + (groups.length - max) + ' more kinds (pass limit).');
  if ((j.dumps || []).length) L.push(H.count(j.dumps.length, 'crash report') + ' in the minidumps folder, newest ' + j.dumps[0].mtime + ': call mow_game_crash.');
  if ((j.oos || []).length) L.push(H.count(j.oos.length, 'out-of-sync report') + ': call mow_game_crash.');
  L.push(g.id === 'goh' ? 'The log is written anew on every start, so copy it before starting again (LOG-22).' : 'game.log is written anew on every start; the run before is kept as game.prev.log only by AS64 (LOG-01).');
  return { text: L.join('\n'), data: { log: t.where, findings: groups.length, groups: groups.slice(0, max).map(x => ({ code: x.code, file: x.file, line: x.line, count: x.count, msg: String(x.msg || '').slice(0, 300), where: x.where || null, row: x.row || null })), dumps: (j.dumps || []).length, oos: (j.oos || []).length } };
}
const STOP = new Set(['LOG_CRASH', 'LOG_ERROR_MSG', 'LOG_SCRIPT_ERROR', 'LOG_FALLBACK_FONT', 'LOG_MOD_INFO_ERROR', 'LOG_MOD_MODE', 'LOG_OOS', 'LOG_OOS_VERSION']);
async function gameCrash(args, ctx) {
  const g = ctx.game(args), t = await triage(args, ctx, g);
  if (t.err) return ctx.bad(t.err);
  const P = require('../../gui/ext/logs/plain'), j = t.j;
  const groups = (j.groups || []).filter(x => STOP.has(x.code)), lines = (j.lines || []).filter(l => !/^info:/.test(l) && /LOG_(CRASH|ERROR_MSG|SCRIPT_ERROR|FALLBACK_FONT|MOD_INFO_ERROR|MOD_MODE|OOS)/.test(l));
  const L = ['Log read: ' + t.where + '.'];
  if (!groups.length && !(j.dumps || []).length && !(j.oos || []).length) {
    L.push('No crash, fatal error or out-of-sync report was found.');
    L.push(g.id === 'goh' ? 'A Gates of Hell exit with no crash report at all is usually a DirectX error or error code 0x0bad0002: those close the game at once with no box and no dump (GHLOG-10).'
      : 'If the game closed without a word, the log of that run may already be overwritten: it is written anew on every start (LOG-01). Run again and read the log before the next start.');
    return { text: L.join('\n'), data: { log: t.where, crashes: 0, dumps: 0, oos: 0 } };
  }
  const out = [];
  for (const x of groups) {
    const c = P.logCard(x) || { title: x.code, fix: [] }, addr = (/at (0x[0-9a-f]+)/i.exec(x.msg || '') || [])[1];
    const hints = x.code === 'LOG_CRASH' ? P.crashHint(x.msg, x.fn, addr) : [];
    L.push('- ' + c.title + ': ' + String(x.msg || '').slice(0, 200) + (x.fn ? ' in ' + x.fn : '') + ' (' + x.file + (x.line ? ':' + x.line : '') + ')');
    for (const h of hints) L.push('    ' + h);
    for (const f of (c.fix || []).slice(0, 2)) L.push('    fix: ' + f);
    out.push({ code: x.code, file: x.file, line: x.line, msg: String(x.msg || '').slice(0, 300), fn: x.fn || null, hints });
  }
  if (lines.length) { L.push('What the log tool says:'); for (const l of lines.slice(0, 6)) L.push('  ' + l.slice(0, 600)); }
  if ((j.dumps || []).length) L.push('Crash reports on disk: ' + j.dumps.slice(0, 5).map(d => d.name + ' (' + d.mtime + ')').join(', ') + '.');
  for (const o of (j.oos || []).slice(0, 3)) L.push('Out of sync, ' + o.folder + ': ' + o.verdict + '.');
  if ((j.oos || []).length) L.push('A player who falls out of sync is removed from the match; the report is for finding the cause only (NET-04). Same game build and the same mods in the same order for everyone (NET-13); some file kinds are compared by size only, so a changed file can pass the lobby and still break the match (NET-01).');
  if (groups.some(x => x.code === 'LOG_CRASH')) L.push('Line numbers in a crash block come from another build of the game: go by the name of the failing part (LOG-04).');
  return { text: L.join('\n'), data: { log: t.where, crashes: out.length, found: out, dumps: (j.dumps || []).slice(0, 10), oos: (j.oos || []).slice(0, 10) } };
}

// ---------------------------------------------------------------- matchup, armour
const WORD = { penetrate: 'goes through', ricochet: 'bounces off', no_penetration: 'does not go through', detonate: 'bursts on the plate', missed: 'is spent before it gets there', beyond_jet: 'is out of reach of the jet', no_armor: 'meets no armour', no_hit: 'passes beside the vehicle', ground: 'hits the ground' };
const shareWord = s => (s >= 0.66 ? 'yes' : s >= 0.33 ? 'sometimes' : s > 0 ? 'rarely' : 'no');
const VIEWS = [['front', 0], ['side', 90], ['rear', 180]];
const DMG_RULES = 'Rules: penetration is read from the gun\'s range table, with no dice (DMG-02); a sloped plate counts as thicker, at most 10 times (DMG-03); which side a hit counts as comes from the plate, not from where the shooter stands (DMG-05); a shell that fails may bounce, at most twice (DMG-09); a hull is often several plates of different thickness (DMG-25).';
const NOT_MODELLED = 'Not counted: gun spread and shell drop, HE blast, what happens behind the plate (crew, parts), earlier damage.';
const GOH_PEN = 'Gates of Hell differs: plate thickness is also multiplied by flaw, cast steel and hardness factors (GHDMG-37) and each ammo carries its own overmatch tables (GHKEY-59). The armour simulator does not serve Gates of Hell, so this is a flat comparison of penetration against plate thickness: slope is not counted and a sloped plate will hold more than shown. Where a unit has no hull value the thickest plate of that side is used, which can be the gun mantlet.';

// the shell of a matchup: {weapon, ammo?} from the attacker unit's main gun or from `gun`
async function matchup(args, ctx) {
  const g = ctx.game(args); if (!g.dir) return H.noGame(ctx, g);
  if (!args.attacker && !args.gun) return ctx.bad('name the shooter: `attacker` (a unit) or `gun` (a weapon name)');
  if (!args.target) return ctx.bad('name the `target` unit');
  const range = H.num(args.range, 100, 1, 5000);
  const C = await H.catalogue(ctx, g, args.mod);
  const tgt = H.find(C, ctx.name(args.target, 'target'), { vehicle: true });
  if (!tgt.best) return ctx.bad('no vehicle or gun called "' + args.target + '" in ' + g.name + H.didYouMean(tgt));
  let weapon = args.gun ? ctx.name(args.gun, 'gun') : null, atk = null;
  if (args.attacker) {
    const a = H.find(C, ctx.name(args.attacker, 'attacker'), { armed: !weapon });
    if (!a.best) return ctx.bad('no unit ' + (weapon ? '' : 'with a gun ') + 'called "' + args.attacker + '" in ' + g.name + H.didYouMean(a) + (weapon ? '' : '. For a hand weapon name it with `gun`.'));
    atk = a.best; if (!weapon) weapon = atk.unit.gun.weapon;
  }
  const ammo = args.ammo ? ctx.name(args.ammo, 'ammo') : undefined;
  const T = tgt.best, data = { game: g.id, range, target: H.brief(T), attacker: atk ? H.brief(atk) : null, gun: weapon, sides: {} };
  const head = (atk ? atk.name + ' (' + weapon + ')' : weapon) + ' against ' + T.name + ' at ' + range + ' m [' + g.name + ']';
  const gunRange = atk && atk.row ? atk.row.range : null;
  const reach = gunRange != null ? (range > gunRange ? 'The gun only reaches ' + gunRange + ' m: at ' + range + ' m it cannot fire at all.' : 'The gun reaches ' + gunRange + ' m.') : '';

  if (g.kind !== 'goh') {
    const S0 = H.simOpen(g, T, args.mod);
    if (!S0.error) {
      const sim = H.sim(), pen = require('../../armorsim/pen');
      const S = sim.shellFrom({ weapon, ammo }, S0.opts);
      if (S.error) return ctx.bad(S.error);
      const p = Math.round(pen.penetrationAt(S, range) * 10) / 10, far = Math.min(gunRange || S.maxRange || 300, 1000);
      data.pen = p; data.ammo = S.ammo || null; data.shell = S.kind || null; data.calibre = S.calibre || null; data.method = 'armorsim';
      const L = [head, 'Shell: ' + (S.ammo || '?') + (S.kind ? ' (' + S.kind.toUpperCase() + ')' : '') + ', ' + (S.calibre || '?') + ' mm. Penetration at ' + range + ' m: ' + p + ' mm.'];
      for (const [name, az] of VIEWS) {
        const m = sim.map(S0, S, range, { name, az, el: 0 }, { w: 24, h: 16 }), r = sim.shoot(S0, S, range, sim.rayFrom(S0, az, 0));
        const pl = r.plates[r.decisive] || null;
        let maxR = null; for (let d = 10; d <= far; d += 10) { if (sim.shoot(S0, S, d, sim.rayFrom(S0, az, 0)).verdict === 'penetrate') maxR = d; }
        const share = Math.round(m.share * 100);
        data.sides[name] = { through: shareWord(m.share), share, centre: pl ? { result: r.verdict, plate: pl.volume.split('/').pop(), mm: pl.nominal, angle: pl.angle, effective: pl.effective } : { result: r.verdict }, maxRange: maxR };
        L.push('- from the ' + name + ': ' + shareWord(m.share).toUpperCase() + ', ' + share + '% of hits on that face go through. Centre hit: ' +
          (pl ? pl.volume.split('/').pop() + ' ' + pl.nominal + ' mm at ' + pl.angle + ' deg counts as ' + pl.effective + ' mm, the shell ' + (WORD[r.verdict] || r.verdict) : 'the shell ' + (WORD[r.verdict] || r.verdict)) +
          (maxR ? '; a centre hit goes through out to about ' + maxR + ' m' : pl ? '; a centre hit goes through at no range' : '') + '.');
      }
      if (reach) L.push(reach);
      if (S.ammoNotLoaded) L.push('Note: this gun does not load that ammo in the game' + (S.ammoNotLoaded.loads && S.ammoNotLoaded.loads.length ? ' (it loads: ' + S.ammoNotLoaded.loads.join(', ') + ')' : '') + '.');
      L.push(DMG_RULES); L.push(NOT_MODELLED);
      return { text: L.join('\n'), data };
    }
    data.simNote = S0.error;
  }
  // flat comparison (Gates of Hell, or a target the simulator cannot open)
  const gunU = atk ? atk.unit : H.gunOwner(C, weapon);
  const p = gunU && gunU.gun ? H.penAt(gunU.gun.pen, range) : null;
  if (p == null) return ctx.bad('no penetration table for ' + weapon + ' in the unit catalogue' + (g.kind === 'goh' ? '' : ' (' + data.simNote + ')') + '. Name a vehicle or gun that carries it with `attacker`.');
  const ar = T.armour; if (!ar) return ctx.bad(T.name + ' has no armour values in the catalogue (a soft target: any hit harms it).');
  data.pen = p; data.method = 'flat';
  const L = [head, 'Penetration at ' + range + ' m: ' + p + ' mm.'];
  for (const [name, i] of [['front', 0], ['side', 1], ['rear', 2]]) {
    const mm = ar[i], v = p >= mm * 1.25 ? 'yes' : p >= mm ? 'sometimes' : 'no';
    data.sides[name] = { through: v, mm, margin: Math.round((p - mm) * 10) / 10 };
    L.push('- from the ' + name + ': ' + v.toUpperCase() + ' (' + (T.hull ? 'hull plate ' : 'thickest plate ') + mm + ' mm, ' + (p >= mm ? p - mm >= 0 ? 'spare ' + Math.round(p - mm) + ' mm' : '' : 'short by ' + Math.round(mm - p) + ' mm') + ').');
  }
  if (reach) L.push(reach);
  L.push(g.kind === 'goh' ? GOH_PEN : 'Flat comparison only (' + data.simNote + '): slope is not counted. ' + DMG_RULES);
  return { text: L.join('\n'), data };
}
async function unitArmor(args, ctx) {
  const g = ctx.game(args); if (!g.dir) return H.noGame(ctx, g);
  const C = await H.catalogue(ctx, g, args.mod), f = H.find(C, ctx.name(args.unit, 'unit'), { vehicle: true });
  if (!f.best) return ctx.bad('no vehicle or gun called "' + args.unit + '" in ' + g.name + H.didYouMean(f));
  const T = f.best, L = ['Armour of ' + T.name + ' (' + T.id + ') [' + g.name + ']'], data = { game: g.id, unit: H.brief(T) };
  if (g.kind !== 'goh') {
    const S0 = H.simOpen(g, T, args.mod);
    if (!S0.error) {
      const t = H.sim().table(S0), mm = (r, s) => { const x = r.sides.find(y => y.side === s); return x ? x.mm : '-'; };
      const s = t.summary, one = (n, x) => (x && x.volume ? n + ': front ' + x.front + ' mm, side ' + x.side + ' mm, rear ' + x.rear + ' mm, top ' + x.top + ' mm' : null);
      for (const l of [one('Hull', s.hull), one('Turret', s.turret)]) if (l) L.push(l + '.');
      L.push('Plates (mm): front / side / rear / top');
      data.plates = [];
      for (const r of t.rows) {
        if (r.flags.some(x => /not hit by shells|not in model/i.test(x)) || /^(inventory|crew)d*$/i.test(r.name)) continue;
        const row = { name: r.name, front: mm(r, 'front'), side: mm(r, 'left'), rear: mm(r, 'rear'), top: mm(r, 'top') };
        data.plates.push(row); L.push('- ' + row.name + ': ' + row.front + ' / ' + row.side + ' / ' + row.rear + ' / ' + row.top);
      }
      L.push('The thinnest plate a shell can reach decides: aim there. The unit\'s armour class sets one value per side and overrides the single plates where it is not 0 (DMG-06); the sides are fixed on the plate, not by the shot direction (DMG-05).');
      return { text: L.join('\n'), data };
    }
    data.simNote = S0.error;
  }
  if (!T.armour) return ctx.bad(T.name + ' has no armour values (a soft target).');
  const a = T.armour; data.armour = { front: a[0], side: a[1], rear: a[2], top: a[3] };
  L.push((T.hull ? 'Hull: front ' : 'Thickest plate per side (may be the gun mantlet, not the hull): front ') + a[0] + ' mm, side ' + a[1] + ' mm, rear ' + a[2] + ' mm, top ' + a[3] + ' mm.');
  for (const x of (T.unit.armorAreas || []).slice(0, 12)) L.push('- ' + x.name + ': ' + [x.front, x.side, x.rear, x.top].join(' / '));
  L.push(g.kind === 'goh' ? 'Gates of Hell: values from the unit files; in play each plate is also scaled by flaw, cast steel and hardness factors (GHDMG-37). The armour simulator does not serve Gates of Hell.' : 'Values from the unit files only (' + data.simNote + ').');
  return { text: L.join('\n'), data };
}

// ---------------------------------------------------------------- army
const CLS_WORD = { squad: 'infantry squad', tank: 'tank', td: 'tank destroyer', atgun: 'anti-tank gun', art: 'artillery', aa: 'anti-air vehicle', aagun: 'anti-air gun', mg: 'machine gun', mortar: 'mortar', apc: 'armoured carrier', car: 'armoured car', truck: 'truck', other: 'other' };
const RES_WORD = { mp: 'MP (manpower)', sp: 'SP (special points)', dp: 'DP (doctrine points)' };
function ecoLines(eco, g) {
  const L = [];
  if (eco && eco.budgets && eco.budgets.length) L.push('Paid with: ' + eco.budgets.map(b => (RES_WORD[b.res] || b.res) + (b.start != null ? ', starts at ' + b.start : '') + (b.finish != null ? ', grows to ' + b.finish : '')).join('; ') + ' (first preset read; lobby presets differ). Prices in different resources are not on one scale.');
  if (g.kind === 'goh') {
    L.push('Gates of Hell: no rank lock, and a cooldown always runs whole with no head start (GHMIS-85). A unit waits "delay" once at match start, then "cooldown" after each buy (gohweb gameplay/goh-unit-card-cost).');
    L.push('A squad price is its own price plus each member\'s share, rounded up (GHGPL-10). Doctrine units show only for the doctrine picked in the lobby (GHGPL-05) and are paid with doctrine points.');
  } else {
    L.push('Wait at match start = cooldown x preset factor x (1 - head start); after a buy every unit of the same cooldown group waits the whole cooldown again (modweb mission/mp-units).');
    L.push('Rank needed is ignored when the host turns unit level restrictions off, in test mode, in ranked games and for bots (MIS-15). Each unit also takes command points; limits count buys and do not refill when the unit dies (MIS-04).');
  }
  return L;
}
async function army(args, ctx) {
  const g = ctx.game(args); if (!g.dir) return H.noGame(ctx, g);
  const C = await H.catalogue(ctx, g, args.mod), rows = C.entries.filter(e => e.row);
  const armies = H.tally(rows.map(e => e.army));
  if (!args.army) {
    const L = ['Armies of ' + g.name + ' with units in the buy panel: ' + Object.entries(armies).map(([a, n]) => a + ' (' + n + ')').join(', ') + '.'];
    if (g.kind === 'goh') L.push('Gates of Hell splits each army by period (early, mid, late) and by doctrine: pass `period` and `doctrine`.');
    L.push('Pass `army` to see what it can buy.');
    return { text: L.concat(ecoLines(C.eco, g)).join('\n'), data: { game: g.id, armies, economy: C.eco || null } };
  }
  const a = String(args.army).toLowerCase();
  let list = rows.filter(e => e.army === a);
  if (!list.length) return ctx.bad('no army "' + args.army + '" in ' + g.name + '. Armies: ' + Object.keys(armies).join(', '));
  const note = [];
  if (g.kind === 'goh') {
    const periods = H.tally(list.map(e => e.unit.period || '')), per = args.period ? String(args.period).toLowerCase() : null;
    if (per) list = list.filter(e => (e.unit.period || '') === per);
    const docs = H.tally(list.map(e => e.unit.doctrine || '').filter(Boolean));
    if (args.doctrine) { const d = String(args.doctrine).toLowerCase(); list = list.filter(e => !e.unit.doctrine || e.unit.doctrine.toLowerCase() === d || e.unit.doctrine.toLowerCase().endsWith('_' + d)); }
    else if (Object.keys(docs).length) note.push('Doctrines' + (per ? ' of ' + per : '') + ': ' + Object.keys(docs).join(', ') + '. Units of every doctrine are listed; pass `doctrine` for one.');
    if (!per) note.push('Periods: ' + Object.entries(periods).map(([k, n]) => (k || 'none') + ' (' + n + ')').join(', ') + '. All are listed; pass `period` for one.');
  } else if (args.period || args.doctrine) note.push(g.name + ' has no periods or doctrines: every unit of the army is in one list (eras are picked by the lobby preset).');
  if (args.class) { const c = String(args.class).toLowerCase(); list = list.filter(e => e.row.cls === c || (c === 'infantry' && e.row.cls === 'squad') || (c === 'vehicle' && e.row.kind === 'vehicle')); }
  if (args.max_price != null) list = list.filter(e => e.row.cost != null && e.row.cost <= +args.max_price);
  if (args.search) { const q = H.norm(args.search); list = list.filter(e => H.norm(e.name).includes(q) || H.norm(e.id).includes(q)); }
  const order = Object.keys(CLS_WORD);
  list.sort((x, y) => (x.row.res === 'mp' ? 0 : 1) - (y.row.res === 'mp' ? 0 : 1) || order.indexOf(x.row.cls) - order.indexOf(y.row.cls) || (x.row.cost || 0) - (y.row.cost || 0));
  const max = H.int(args.limit, 60, 1, 400), shown = list.slice(0, max);
  const L = [H.count(list.length, 'unit') + ' the army "' + a + '" can buy in ' + g.name + (args.mod ? ' with the mod' : '') + (list.length > max ? ' (first ' + max + ' shown; narrow with class, max_price, search or raise limit)' : '') + ':'];
  L.push(g.kind === 'goh' ? 'class | unit | price | delay at start s | cooldown s | CP | gun pen at 100 m | armour front'
    : 'class | unit | price | rank | wait at start s | cooldown s | CP | gun pen at 100 m | armour front');
  for (const e of shown) {
    const r = e.row, pr = r.cost == null ? '?' : r.cost + ' ' + String(r.res || 'mp').toUpperCase();
    L.push([r.cls, e.name + ' (' + e.id + ')' + (e.unit.period ? ' ' + e.unit.period : '') + (e.unit.doctrine ? ' [' + e.unit.doctrine + ']' : ''), pr]
      .concat(g.kind === 'goh' ? [H.dash(r.wait), H.dash(r.again)] : [H.dash(r.rank), H.dash(r.wait), H.dash(r.again)], [H.dash(r.cp), r.pen ? r.pen + ' mm' : '-', r.af != null ? r.af + ' mm' : '-']).join(' | '));
  }
  return { text: L.concat(note, ecoLines(C.eco, g)).join('\n'), data: { game: g.id, army: a, count: list.length, units: shown.map(e => H.brief(e)), economy: C.eco || null } };
}

// ---------------------------------------------------------------- counter
async function unitCounter(args, ctx) {
  const g = ctx.game(args); if (!g.dir) return H.noGame(ctx, g);
  const C = await H.catalogue(ctx, g, args.mod), f = H.find(C, ctx.name(args.unit, 'unit'), { army: args.army });
  if (!f.best) return ctx.bad('no unit called "' + args.unit + '" in ' + g.name + H.didYouMean(f));
  const T = f.best, range = H.num(args.range, 100, 1, 5000), max = H.int(args.limit, 10, 1, 40);
  const foes = args.enemy ? String(args.enemy).toLowerCase().split(/[,\s]+/).filter(Boolean) : null;
  let pool = C.entries.filter(e => e.row && e.row.cost != null && (foes ? foes.includes(e.army) : e.army !== T.army));
  if (g.kind === 'goh' && args.period) pool = pool.filter(e => (e.unit.period || '') === String(args.period).toLowerCase());
  if (args.max_price != null) pool = pool.filter(e => e.row.res !== 'mp' || e.row.cost <= +args.max_price);
  if (!pool.length) return ctx.bad('no buyable units in ' + (foes ? 'the armies ' + foes.join(', ') : 'the other armies') + '. Armies: ' + Object.keys(H.tally(C.entries.filter(e => e.row).map(e => e.army))).join(', '));
  const head = 'What beats ' + T.name + ' (' + T.id + ', ' + (T.army || 'no army') + ') at ' + range + ' m, cheapest first [' + g.name + ']' + (foes ? ', bought by: ' + foes.join(', ') : ', from every other army');
  const data = { game: g.id, target: H.brief(T), range, counters: [] };
  // a soft target: armour is not the question
  if (!T.armour || T.armour[0] == null || T.armour[0] < 3) {
    const soft = pool.filter(e => ['mg', 'mortar', 'aa', 'aagun', 'apc', 'car', 'art'].includes(e.row.cls) && e.row.res === 'mp').sort((x, y) => x.row.cost - y.row.cost).slice(0, max);
    const L = [head, T.name + ' has no armour to speak of: bullets, machine guns and HE all harm it, so penetration is not the question. Cheapest machine guns, mortars, anti-air guns and light vehicles:'];
    for (const e of soft) { L.push('- ' + e.name + ' (' + e.id + ', ' + e.army + '): ' + e.row.cost + ' MP, ' + (CLS_WORD[e.row.cls] || e.row.cls) + (e.row.range ? ', reaches ' + e.row.range + ' m' : '')); data.counters.push(Object.assign(H.brief(e), { how: 'soft target' })); }
    L.push('HE does the same damage at any range and soldiers lying down are harder to hit (modweb gameplay/armor, gameplay/infantry).');
    return { text: L.join('\n'), data };
  }
  const guns = pool.filter(e => e.unit.gun && e.unit.gun.pen && e.row.pen);
  const tPen = T.unit.gun && T.unit.gun.pen ? r => H.penAt(T.unit.gun.pen, r) : null;
  let S0 = null; if (g.kind !== 'goh') { S0 = H.simOpen(g, T, args.mod); if (S0.error) { data.simNote = S0.error; S0 = null; } }
  data.method = S0 ? 'armorsim' : 'flat';
  const sim = S0 ? H.sim() : null, memo = new Map();
  const judge = (weapon, r) => {   // -> {front, side, rear} share 0..1 of hits that go through
    const k = weapon + '|' + r; if (memo.has(k)) return memo.get(k);
    let v = null;
    if (S0) { const S = sim.shellFrom({ weapon }, S0.opts); if (!S.error) { v = {}; for (const [n, az] of VIEWS) v[n] = sim.map(S0, S, r, { name: n, az, el: 0 }, { w: 16, h: 10 }).share; } }
    memo.set(k, v); return v;
  };
  const out = [];
  for (const e of guns) {
    const reach = e.row.range || null, r = reach != null && reach < range ? reach : range;
    let v = judge(e.unit.gun.weapon, r), flat = false;
    if (!v) { const p = H.penAt(e.unit.gun.pen, r), a = T.armour; if (p == null) continue; flat = true; v = { front: p >= a[0] ? 1 : 0, side: p >= a[1] ? 1 : 0, rear: p >= a[2] ? 1 : 0 }; }
    const tier = v.front >= 0.5 ? 0 : (v.side >= 0.5 || v.rear >= 0.5) ? 1 : 2;
    if (tier === 2) continue;
    const back = tPen && e.armour && e.armour[0] != null ? tPen(r) >= e.armour[0] : null;   // can the target go through the counter's front (flat)
    out.push({ e, tier, v, r, flat, close: r < range, safe: back === null ? null : !back });
  }
  out.sort((x, y) => x.tier - y.tier || (x.e.row.res === 'mp' ? 0 : 1) - (y.e.row.res === 'mp' ? 0 : 1) || x.e.row.cost - y.e.row.cost);
  // one line per unit name and army: the cheapest card of each
  const seen = new Set(), pick = [];
  for (const o of out) { const k = o.e.name + '|' + o.e.army + '|' + o.tier; if (seen.has(k)) continue; seen.add(k); pick.push(o); }
  const a = T.armour, L = [head, T.name + ': ' + (T.hull ? 'hull' : 'thickest plate,') + ' front ' + a[0] + ' mm, side ' + a[1] + ' mm, rear ' + a[2] + ' mm' + (T.row && T.row.pen ? '; its own gun goes through ' + T.row.pen + ' mm at 100 m' : '') + '.'];
  const pct = x => Math.round(x * 100) + '%';
  const line = o => {
    const r = o.e.row;
    data.counters.push(Object.assign(H.brief(o.e), { from: o.tier === 0 ? 'front' : 'side or rear', front: Math.round(o.v.front * 100), side: Math.round(o.v.side * 100), rear: Math.round(o.v.rear * 100), atRange: o.r, safeFromItsGun: o.safe }));
    return '- ' + o.e.name + ' (' + o.e.id + ', ' + o.e.army + (o.e.unit.period ? ' ' + o.e.unit.period : '') + '): ' + r.cost + ' ' + String(r.res || 'mp').toUpperCase() + ', ' + (CLS_WORD[r.cls] || r.cls) + ', gun ' + r.gun + ' ' + H.penAt(o.e.unit.gun.pen, o.r) + ' mm at ' + o.r + ' m' +
      (o.flat ? '' : ', goes through front ' + pct(o.v.front) + ' / side ' + pct(o.v.side) + ' / rear ' + pct(o.v.rear) + ' of hits') + (o.close ? ', must close to ' + o.r + ' m (its reach)' : '') +
      (o.safe === true ? ', and ' + T.name + ' cannot go through its front' : o.safe === false ? ', but ' + T.name + ' goes through its front too' : '');
  };
  const front = pick.filter(o => o.tier === 0).slice(0, max), flank = pick.filter(o => o.tier === 1).slice(0, Math.max(3, Math.ceil(max / 2)));
  if (front.length) { L.push('Beats it from the front:'); for (const o of front) L.push(line(o)); } else L.push('Nothing in those armies goes through its front at ' + range + ' m.');
  if (flank.length) { L.push('Only from the side or rear (flank it):'); for (const o of flank) L.push(line(o)); }
  L.push('Not in this list: infantry anti-tank weapons, mines, artillery and aircraft; only the main gun of each vehicle and gun is judged. For one pair in detail call mow_matchup.');
  L.push(S0 ? DMG_RULES + ' Share = part of the face where a hit goes through.' : g.kind === 'goh' ? GOH_PEN + ' No rank lock in Gates of Hell (GHMIS-85); doctrine units cost doctrine points and need that doctrine (GHGPL-05).' : 'Flat comparison (' + data.simNote + '): slope not counted. ' + DMG_RULES);
  return { text: L.join('\n'), data };
}

// ---------------------------------------------------------------- modes
const MODE_RULES = {
  as2: {
    combat: ['Combat: no flags. Killing a unit pays its score to your team; a team kill and a unit that leaves the map cost score. The first team at the score limit wins (modweb mission/mp-units, mission/mp-chain).', 'Bots buy units here but never give them an order, because the mode has no flag points (MIS-65).'],
    captureflag: ['Capture the Flag: there is no score limit. The first flag capture that settles with an owner wins the match (MIS-63).', 'With the stock capture time of 300 s a match lasts about 400 to 490 s (MIS-72). The map needs its two capture areas, or the game stops at start (MIS-62).'],
    battle_zones: ['Assault Zones: take and hold the flags. Held flags pay score by the share of flags you hold (the card\'s points_table); the first team at the score limit wins (modweb mission/mp-chain).', 'A unit\'s capture weight decides how fast it takes a flag (modweb mission/mp-units, key cw). Bots play this mode (MIS-65).'],
    battle_zones_8x8: ['Assault Zones for up to 8 against 8: the same rules as Assault Zones (modweb mission/mp-chain).'],
    frontline: ['Frontline: one side attacks lines of flags in phases, the other defends. Score comes from flags taken, phases won, time left and a defence bonus (card keys score_flag, score_phase, score_time, score_defBonus; modweb mission/mp-chain).'],
    cooperative: ['Co-op: players together against the mission; no bot seats.'],
    armored_warfare: ['Armored Warfare: an Assault Zones variant the game knows but ships no card for; a map needs its own mission file for it (MIS-19).'],
    combined_arms: ['Combined Arms: an Assault Zones variant the game knows but ships no card for; a map needs its own mission file for it (MIS-19).'],
  },
  goh: {
    battle_zones: ['Battle Zones: a captured flag pays the team a share of the score limit by player count; the first team at the limit wins, two teams there at once is a draw (gohweb gameplay/goh-game-modes).'],
    battle_zones_8x8: ['Battle Zones for large teams: the rules of Battle Zones (gohweb gameplay/goh-game-modes).'],
    armored_warfare: ['Armored Warfare: Battle Zones rules with its own unit list (gohweb gameplay/goh-game-modes).'],
    combined_arms: ['Combined Arms: Battle Zones rules with its own unit list (gohweb gameplay/goh-game-modes).'],
    heroes: ['Heroes: Battle Zones rules; units spawn holding their fire (gohweb gameplay/goh-game-modes).'],
    frontlines: ['Frontlines: attack and defence by phases. Score for each side flag once, for the main flag, for a phase, for time left, and a bonus each second per main flag held (gohweb gameplay/goh-game-modes).'],
    captureflag: ['Capture the Flag (gohweb gameplay/goh-game-modes; as64 rule MIS-63: the first settled capture wins).'],
    cooperative: ['Co-op: no bot seats; a leaver\'s units go to the team\'s humans (gohweb gameplay/goh-game-modes).'],
    ammunition: ['Ammunition: a new flag opens every 120 s; capturing it pays each player from the refunds waiting for them, up to 250, then the flag is gone (GHGPL-18).'],
    evacuation: ['Evacuation: team A holds until the time limit; team B attacks in waves and can spawn only for 10 s after each wave; supply waves open a supply flag (GHGPL-19).'],
    guerrilla: ['Guerrilla: survive waves; 10 waves to win, the next wave comes 10 s after the last one is gone (gohweb gameplay/goh-game-modes).'],
    koth: ['King of the Hill (gohweb gameplay/goh-game-modes).'],
    campaign_capture_the_flag: ['Conquest battle: the capture-the-flag form used by the dynamic campaign (gohweb gameplay/goh-game-modes).'],
  },
};
const COMMON_RULES = {
  as2: ['Every competitive mode: the countdown before the start pauses the game, so cooldowns start after it (modweb mission/mp-units). A mode shows for a map only when the map has a mission file for it (MIS-24).'],
  goh: ['Every competitive mode: the score limit is checked each second, two teams at the limit is a draw; a team at 0 points loses where the mode says so (gohweb gameplay/goh-game-modes). Defaults of a new session: pause during preparation, first reinforcement wave at 360 s, then every 120 s (GHGPL-07). "combat" does not exist in Gates of Hell, and Frontline is called frontlines (gohweb gameplay/goh-game-modes).'],
};
function cardFacts(text) {
  const out = {}, par = /\{\s*parameters\s+"([^"]*)"/i.exec(text || '');
  if (par) { out.parameters = {}; for (const kv of par[1].split(';')) { const i = kv.indexOf('='); if (i > 0) out.parameters[kv.slice(0, i).trim()] = kv.slice(i + 1).trim().slice(0, 120); } }
  for (const k of ['scoreFinal', 'scoreMin', 'scoreMax', 'preparationTime', 'gameDuration', 'fogOfWar', 'useUnitLevelRestrictions', 'impregnableTimeout', 'resourceAmount', 'difficulty']) {
    const m = new RegExp('\\{\\s*' + k + '\\s+("[^"]*"|[^\\s{}]+)\\s*\\}', 'i').exec(text || ''); if (m) out[k] = m[1].replace(/"/g, '');
  }
  for (const k of ['friendlyFire', 'enableBots', 'showPiercing', 'enableSpectators']) if (new RegExp('\\{\\s*' + k + '(\\s+[^0\\s{}][^\\s{}]*)?\\s*\\}', 'i').test(text || '')) out[k] = true;
  return out;
}
async function modeInfo(args, ctx) {
  const g = ctx.game(args); if (!g.dir) return H.noGame(ctx, g);
  const M = require('../../gui/ext/modes/index.js')._t, G = H.viewGame(g), mod = args.mod ? H.modDir(ctx, args.mod) : '';
  const rows = M.listOf(G, mod), kind = g.kind === 'goh' ? 'goh' : 'as2', eco = H.economy(g);
  if (!rows.length) return ctx.bad('no game mode cards could be read from ' + g.name);
  const data = { game: g.id, modes: rows.map(r => ({ mode: r.mode, playsAs: r.cls, bots: r.bots, minPlayers: r.min, maxPlayers: r.max, from: r.from })), economy: eco || null };
  if (!args.mode) {
    const L = ['Game modes of ' + g.name + (mod ? ' with the mod' : '') + ':'];
    for (const r of rows) L.push('- ' + r.mode + (r.cls !== r.mode ? ' (plays as ' + r.cls + ')' : '') + ': bots ' + (r.bots ? 'allowed' : 'not allowed') + (r.max ? ', ' + (r.min || 1) + ' to ' + r.max + ' players' : '') + (r.from !== 'game' ? ', from the mod' : '') + (r.known ? '' : ', a class this game does not know'));
    return { text: L.concat(COMMON_RULES[kind], ecoLines(eco, g), ['Pass `mode` for the rules and numbers of one mode.']).join('\n'), data };
  }
  const want = String(args.mode).toLowerCase().replace(/\s+/g, '_'), alias = { assault_zones: 'battle_zones', frontline: kind === 'goh' ? 'frontlines' : 'frontline', frontlines: kind === 'goh' ? 'frontlines' : 'frontline', ctf: 'captureflag', capture_the_flag: 'captureflag', coop: 'cooperative', 'co-op': 'cooperative' };
  const r = rows.find(x => x.mode === want) || rows.find(x => x.mode === alias[want]) || rows.find(x => x.cls === (alias[want] || want));
  if (!r) return ctx.bad('no mode "' + args.mode + '" in ' + g.name + '. Modes: ' + rows.map(x => x.mode).join(', ') + (kind === 'goh' && want === 'combat' ? '. Gates of Hell has no combat mode (gohweb gameplay/goh-game-modes).' : ''));
  const card = M.cardOf(G, mod, r.mode), facts = cardFacts(card && card.text);
  const L = ['Mode ' + r.mode + (r.cls !== r.mode ? ' (plays as ' + r.cls + ')' : '') + ' in ' + g.name + ':'];
  for (const l of MODE_RULES[kind][r.cls] || ['No rule text for the class "' + r.cls + '" here; the numbers below are from its card.']) L.push(l);
  const say = [];
  if (facts.scoreFinal) say.push('score to win ' + facts.scoreFinal + (facts.scoreMin ? ' (host may set ' + facts.scoreMin + ' to ' + facts.scoreMax + ')' : ''));
  if (facts.gameDuration) say.push('length ' + facts.gameDuration);
  if (facts.preparationTime) say.push('preparation ' + facts.preparationTime + ' s');
  if (facts.fogOfWar) say.push('fog of war ' + facts.fogOfWar.replace(/^fog_/, ''));
  say.push('bots ' + (r.bots ? 'allowed' : 'not allowed'));
  if (facts.friendlyFire) say.push('friendly fire on');
  if (kind === 'as2' && facts.useUnitLevelRestrictions != null) say.push('rank lock on units ' + (facts.useUnitLevelRestrictions === '0' ? 'off by default (MIS-15)' : 'on by default (MIS-15)'));
  if (r.max) say.push((r.min || 1) + ' to ' + r.max + ' players');
  L.push('From the card: ' + say.join(', ') + '.');
  const p = facts.parameters || {};
  const pw = { flag_capture_time: 'time to take a flag (s)', flag_release_time: 'time for a flag to go neutral (s)', flag_capture_factor: 'how much the zone weight counts in capture speed', freezeTime: 'freeze time (s)', rounds: 'rounds', score_flag: 'score per flag', score_phase: 'score per phase', score_time: 'score per second left', score_defBonus: 'defence bonus per second' };
  const pl = Object.keys(p).filter(k => pw[k]).map(k => pw[k] + ' ' + p[k]);
  if (pl.length) L.push('Mode numbers: ' + pl.join('; ') + '.');
  if (kind === 'as2' && r.cls === 'battle_zones' && p.flag_capture_time) L.push('Capture speed of a unit = (factor x zone weight + (1 - factor)) x its capture weight (modweb mission/mp-units).');
  data.mode = { mode: r.mode, playsAs: r.cls, bots: r.bots, facts };
  return { text: L.concat(COMMON_RULES[kind], ecoLines(eco, g)).join('\n'), data };
}

// ---------------------------------------------------------------- bots
async function botsInfo(args, ctx) {
  const g = ctx.game(args); if (!g.dir) return H.noGame(ctx, g);
  const M = require('../../gui/ext/modes/index.js')._t, rows = M.listOf(H.viewGame(g), ''), withBots = rows.filter(r => r.bots).map(r => r.mode);
  const L = ['Bots in ' + g.name + ':', 'Modes where the lobby lets you add a bot: ' + (withBots.length ? withBots.join(', ') : 'none') + '. In the lobby open an empty seat and pick an AI player.'];
  const data = { game: g.id, modesWithBots: withBots };
  if (g.kind === 'goh') {
    L.push('Gates of Hell bots run from the scripts script/multiplayer/bot.main.lua and modes/*.lua inside the game, not from an AS2-style shopping list (GHMIS-66), so no per-army buy list can be read here.');
    L.push('A bot can buy a unit only when its card exists, fits the bot\'s doctrine, is off cooldown, for sale, researched and under the unit limit (GHMIS-58).');
    L.push('Bots can only buy units, send them to capture a flag and chat: they give no fire, board or retreat orders (AI-12, the same script interface).');
    return { text: L.join('\n'), data };
  }
  L.push('What a bot can do: buy units, send them to capture a flag, chat. It cannot order units to fire, board or retreat; the units\' own AI does the fighting (AI-12). Bots call no artillery fire missions (AI-11) and do not put bailed crews back in (AI-13).');
  L.push('On a mode with no flags (combat) bots buy units and then give no order at all (MIS-65). Stock bots ignore cooldown timers (modweb pricing/economy) and the rank lock (MIS-15).');
  L.push(g.id === 'mowas2' ? 'A script error in a bot file ends the match in MoW:AS2 (MIS-33).' : 'A script error in a bot file leaves the bot idle in AS64, with a line in game.log; the match goes on (MIS-33).');
  const C = await H.catalogue(ctx, g, args.mod), want = args.army ? String(args.army).toLowerCase() : null, by = {};
  for (const e of C.entries) for (const b of e.unit.bots || []) { if (want && b.army !== want) continue; const a = by[b.army] || (by[b.army] = {}); const k = b.cls || 'other'; const s = a[k] || (a[k] = new Map()); const o = s.get(e.id) || { name: e.name, id: e.id, cost: e.row ? e.row.cost : null, stages: [] }; if (!o.stages.includes(b.purchase)) o.stages.push(b.purchase); s.set(e.id, o); }
  if (want && !by[want]) L.push('The bot shopping list has nothing for the army "' + want + '". Armies in it: ' + Object.keys(H.tally(C.entries.flatMap(e => (e.unit.bots || []).map(b => b.army)))).join(', ') + '.');
  data.buys = {};
  for (const [a, cls] of Object.entries(by)) {
    L.push('Army ' + a + ', what its bot buys (stage = step of its shopping list, later steps come with more income):');
    data.buys[a] = {};
    for (const [k, s] of Object.entries(cls)) {
      const list = [...s.values()].sort((x, y) => Math.min(...x.stages) - Math.min(...y.stages) || (x.cost || 0) - (y.cost || 0));
      data.buys[a][k] = list.map(o => ({ id: o.id, name: o.name, cost: o.cost, stages: o.stages.sort((x, y) => x - y) }));
      L.push('- ' + k + ': ' + list.slice(0, want ? 30 : 6).map(o => o.name + (o.cost != null ? ' ' + o.cost + ' MP' : '') + ' (stage ' + H.span(o.stages) + ')').join(', ') + (list.length > (want ? 30 : 6) ? ', +' + (list.length - (want ? 30 : 6)) + ' more' : ''));
    }
  }
  if (!want) L.push('Pass `army` for the whole list of one army.');
  L.push('A unit named in the bot list that has no buy card is skipped without an error (MIS-32).');
  return { text: L.join('\n'), data };
}

// ---------------------------------------------------------------- settings
async function settingsInfo(args, ctx) {
  const g = ctx.game(args), ud = H.userDir(g), what = args.what || 'both';
  if (!ud.dir) return ctx.bad('The settings folder of ' + g.name + ' was not found' + (ud.why ? ': ' + ud.why : '') + '. Start the game once.');
  const profs = H.profiles(g);
  if (!profs.length) return ctx.bad('No player profile in ' + path.join(ud.dir, 'profiles') + ' yet. Start the game once.');
  const opt = profs.map(f => ({ f, t: H.mtime(f) })).sort((a, b) => b.t - a.t)[0].f, dir = path.dirname(opt), q = args.filter ? String(args.filter).toLowerCase() : null;
  const L = ['Settings of ' + g.name + ' (read only), profile folder ' + dir + ':'], data = { game: g.id, profileDir: dir };
  if (what !== 'keys') {
    const flat = H.flatSet(fs.readFileSync(opt, 'latin1')).filter(([k]) => !/(^|\/)(multiplayer|adapter|user|login|password|name)(\/|$)/i.test(k) && !/^options\/mods/i.test(k));
    const rows = q ? flat.filter(([k, v]) => (k + ' ' + v).toLowerCase().includes(q)) : flat;
    data.options = Object.fromEntries(rows.slice(0, 200));
    L.push('Game options (options.set), ' + rows.length + (q ? ' matching "' + args.filter + '"' : '') + ':');
    for (const [k, v] of rows.slice(0, q ? 80 : 45)) L.push('  ' + k.replace(/^options\//, '') + ' = ' + (v === '' ? 'on' : v));
    if (rows.length > (q ? 80 : 45)) L.push('  ... ' + (rows.length - (q ? 80 : 45)) + ' more (pass filter, for example "video", "sound", "camera").');
  }
  if (what !== 'options') {
    const kf = path.join(dir, 'keys.set');
    if (!fs.existsSync(kf)) L.push('Key bindings: no keys.set in the profile, so the game\'s default keys are in use (UI-13).');
    else {
      const r = await ctx.run('keyprof', ['--file', kf, '--list'].concat(g.id === 'as64' ? [] : ['--exe', g.id]), { timeout: 60000 });
      let rows = (r.stdout || '').split(/\r?\n/).map(l => l.split('\t')).filter(a => a[0] && /\//.test(a[0])).map(a => [a[0], (a[1] || '').trim()]);
      if (q) rows = rows.filter(([k, v]) => (k + ' ' + v).toLowerCase().includes(q)); else rows = rows.filter(([, v]) => v);
      data.keys = Object.fromEntries(rows.slice(0, 300));
      L.push('Key bindings (keys.set), ' + rows.length + (q ? ' matching "' + args.filter + '"' : ' with a key set') + ':');
      for (const [k, v] of rows.slice(0, q ? 120 : 60)) L.push('  ' + k + ' = ' + (v || '(no key)'));
      if (rows.length > (q ? 120 : 60)) L.push('  ... ' + (rows.length - (q ? 120 : 60)) + ' more (pass filter, for example "camera", "control_manual").');
      if (!rows.length && r.code !== 0) L.push('  ' + H.firstLine(r.text));
    }
    L.push(g.kind === 'goh' ? 'Gates of Hell renamed many key actions (interface/..., actions/..., groups/...) and gives every action a category; two actions clash only inside one category (GHUI-36, GHUI-251).'
      : 'A key name the game does not know is ignored without a message, leaving the action unbound (UI-11). The profile\'s keys.set wins over the default keys for every action it lists (UI-13).');
  }
  L.push('Change these in the game\'s own Options menu. This tool does not write them.');
  return { text: L.join('\n'), data };
}

// ---------------------------------------------------------------- multiplayer sync
async function mpSync(args, ctx) {
  const g = ctx.game(args);
  let argv;
  if (args.compare) {
    if (!Array.isArray(args.compare) || args.compare.length !== 2) return ctx.bad('compare: give two fingerprint files (made by `node tools/mpsync/mpsync.js --export`)');
    for (const f of args.compare) { ctx.name(f, 'compare file'); if (!path.isAbsolute(f) || !fs.existsSync(f)) return ctx.bad('compare: file not found: ' + f); }
    argv = ['--compare', args.compare[0], args.compare[1]];
  } else {
    if (!args.mod) return ctx.bad('give `mod` (a mod folder: which of its files the lobby checks) or `compare` (two fingerprint files)');
    if (!g.dir) return H.noGame(ctx, g);
    argv = ['--mod', H.modDir(ctx, args.mod), '--game', g.dir, '--exe', g.exe];
  }
  const r = await ctx.run('mpsync', argv, { timeout: 300000, max: 12000 });
  const L = [args.compare ? 'Two players\' files compared, as the lobby sees them:' : 'What the multiplayer lobby checks of this mod [' + g.name + ']:', r.text.trim()];
  L.push('Rules: the lobby compares some file kinds by size only and some not at all, so two players can pass the lobby with different files and fall out of sync in the match (NET-01). A different game build can never play together (NET-13).' + (g.kind === 'goh' ? ' Gates of Hell uses the same rules with its own file masks [inferred, not run in game].' : ''));
  return { text: L.join('\n'), data: { game: g.id, exit: r.code }, isError: r.isError };
}

// ---------------------------------------------------------------- launch tools
const launchOff = ctx => { try { ctx.guard.launch(); return null; } catch (e) { return ctx.bad(e.message); } };
const cmdLine = (tool, argv, script) => 'node tools/' + tool + '/' + (script || tool + '.js') + ' ' + argv.map(a => (/[\s"]/.test(a) ? '"' + a + '"' : a)).join(' ');
const gameEnv = g => (g.dir ? (g.kind === 'goh' ? { GOH_GAME: g.dir } : { AS2_GAME: g.dir }) : {});
const modList = (ctx, mods) => { if (mods == null) return null; if (!Array.isArray(mods)) throw ctx.refusal('mods must be a list of mod folder names'); return mods.map(m => { ctx.name(m, 'mod name'); if (/[,;"]/.test(m)) throw ctx.refusal('a mod name may not hold , ; or a quote: ' + m); return m.trim(); }); };

async function modsEnable(args, ctx) {
  const g = ctx.game(args); if (!g.dir) return H.noGame(ctx, g);
  const mods = modList(ctx, args.mods), dry = args.dry === true;
  if (!mods && !args.restore) return ctx.bad('give `mods` (folder names in load order; an empty list turns all mods off) or `restore: true` (back to the list saved before the first change)');
  const argv = ['--game', g.dir, '--exe', g.exe].concat(args.restore ? ['--restore'] : ['--set', mods.join(',')], args.force === true ? ['--force'] : []);
  if (!dry) { const off = launchOff(ctx); if (off) return off; argv.push('--write'); }
  const r = await ctx.run('modswitch', argv, { timeout: 120000 });
  const L = [dry ? 'Dry run: nothing was changed. This would run:' : r.code === 0 ? 'The enabled mod list was changed:' : 'The mod list was NOT changed (the tool refused):', '  ' + cmdLine('modswitch', argv.concat(dry ? ['--write'] : [])), r.text.trim()];
  L.push(g.kind === 'goh' ? 'Gates of Hell reads the list from the profile\'s options.set at start. The game must be closed while it is changed.'
    : 'The list lives in the profile\'s options.set; the game must be closed while it is changed. Listing as64+ turns Enhanced mode on, and a mod made for the other mode stops the game at start (VFS-47, VFS-48, ENG-26).' + (g.id === 'mowas2' ? ' MoW:AS2 and AS64 share this list.' : ''));
  L.push('For multiplayer every player needs the same mods in the same order (NET-13).');
  return { text: L.join('\n'), data: { game: g.id, dry, exit: r.code, command: cmdLine('modswitch', argv.concat(dry ? ['--write'] : [])) }, isError: !dry && r.code !== 0 };
}
async function gameStart(args, ctx) {
  const g = ctx.game(args); if (!g.dir) return H.noGame(ctx, g);
  const mods = modList(ctx, args.mods), dry = args.dry === true, data = { game: g.id, dry };
  if (g.id === 'as64') {
    if (!args.map) return ctx.bad('name the `map` (for example 1v1_gazala) and, if you like, the `mode` (battle_zones, combat, captureflag, frontline)');
    const map = ctx.name(args.map, 'map'), mode = args.mode ? ctx.name(args.mode, 'mode') : null;
    if (!/^[\w\-./]+$/.test(map) || (mode && !/^\w+$/.test(mode))) return ctx.bad('map and mode are plain names, for example map 1v1_gazala, mode battle_zones');
    const argv = ['--map', mode ? (map.includes('/') ? map : 'multi/' + map) + ':' + mode : map, '--exe', 'as64', '--players', String(H.int(args.players, 2, 1, 16))];
    if (mods && mods.length) argv.push('--mods', mods.join(','));
    if (args.wait_over === true) argv.push('--wait-over'); else argv.push('--hold', String(H.int(args.hold, 60, 1, 7200)));
    if (!dry) { const off = launchOff(ctx); if (off) return off; } else argv.push('--dry');
    data.command = cmdLine('testrun', argv);
    const r = await ctx.run('testrun', argv, { timeout: dry ? 60000 : 4 * 3600 * 1000, env: gameEnv(g), max: 20000 });
    data.exit = r.code;
    return { text: [dry ? 'Dry run: nothing was started. AS64 would be started through its control pipe with:' : 'AS64 was started through its control pipe with:', '  ' + data.command, r.text.trim(),
      'The match is hosted as a LAN game; the other seats stay empty unless a bot or a second game instance takes them. On a mode with no flags bots give no orders (MIS-65). The game log is copied aside before the start, because every start overwrites it (LOG-01).'].join('\n'), data, isError: !dry && (r.isError || r.code !== 0) };
  }
  // MoW:AS2 and Gates of Hell have no control pipe: recorded menu clicks (uidrive)
  const mapName = g.id, routes = (Array.isArray(args.routes) && args.routes.length ? args.routes : ['boot']).map(x => ctx.name(x, 'route'));
  if (routes.some(x => !/^\w+$/.test(x))) return ctx.bad('a route is a plain name; list them with mow_game_drive action "routes"');
  const L = [], why = g.id === 'goh' ? 'Gates of Hell has no control pipe (modweb testing/goh-drive)' : 'mowas_2.exe has no control pipe and takes no test flags (TST-19)';
  L.push(why + ', so it is started and steered by recorded menu clicks. Only the recorded routes exist: a free choice of map, mode or player count is not possible from here' + (args.map || args.mode || args.players ? ' (your map, mode and players were not used)' : '') + '.');
  const argv = ['play', mapName, routes.join(',')];
  if (!dry) { const off = launchOff(ctx); if (off) return off; }
  if (mods) {
    const mv = ['--game', g.dir, '--exe', g.exe, '--set', mods.join(',')].concat(dry ? [] : ['--write']);
    const m = await ctx.run('modswitch', mv, { timeout: 120000 });
    L.push((dry ? 'Mods first (dry): ' : 'Mods first: ') + cmdLine('modswitch', mv.concat(dry ? ['--write'] : [])), m.text.trim());
    if (!dry && m.code !== 0) return { text: L.concat(['The mod list could not be set, so the game was not started.']).join('\n'), data, isError: true };
  }
  if (dry) argv.push('--dry');
  data.command = cmdLine('uidrive', argv);
  const w = await ctx.run('uidrive', ['where', mapName], { timeout: 30000, env: gameEnv(g) });
  const r = await ctx.run('uidrive', argv, { timeout: dry ? 60000 : 30 * 60 * 1000, env: gameEnv(g), max: 20000 });
  data.exit = r.code; data.routes = routes;
  L.push(dry ? 'Dry run: nothing was started. This would run:' : 'Ran:', '  ' + data.command, w.text.trim(), dry ? 'Steps (click positions are for a 1920x1080 window):' : 'Result:', r.text.trim());
  L.push('Routes for this game: call mow_game_drive with action "routes". The game must not be running already.');
  return { text: L.join('\n'), data, isError: !dry && (r.isError || r.code !== 0) };
}
async function gameDrive(args, ctx) {
  const g = ctx.game(args), action = args.action || 'routes', dry = args.dry === true;
  if (g.id === 'as64') return { text: 'AS64 is not driven by menu clicks: it takes orders through its control pipe (TST-17). Use mow_game_start for a match (map, mode, players, mods). The recorded click routes exist for mowas2 and goh only.', data: { game: g.id, na: 'AS64 is driven through its control pipe, not by window input (TST-17)' } };
  const map = g.id, env = gameEnv(g);
  if (action === 'routes') {
    const r = await ctx.run('uidrive', ['routes', map], { timeout: 30000, env }), w = await ctx.run('uidrive', ['where', map], { timeout: 30000, env });
    const routes = (r.stdout || '').split(/\r?\n/).map(l => /^(\w+): (\d+) steps \| (.*)$/.exec(l)).filter(Boolean).map(m => ({ route: m[1], steps: +m[2], does: m[3] }));
    return { text: ['Recorded menu routes for ' + g.name + ' (clicks recorded on a 1920x1080 window; each step waits for a line in game.log or a short pause):'].concat(routes.map(x => '- ' + x.route + ' (' + x.steps + ' steps): ' + x.does), [w.text.trim(), 'Play them in order with action "play", for example routes ["boot", "' + (routes[1] ? routes[1].route : 'skirmish') + '"]. Input goes only to the game\'s own window.']).join('\n'), data: { game: g.id, routes } };
  }
  let argv;
  if (action === 'play') {
    const routes = (Array.isArray(args.routes) ? args.routes : []).map(x => ctx.name(x, 'route'));
    if (!routes.length || routes.some(x => !/^\w+$/.test(x))) return ctx.bad('play: give `routes`, a list of route names (see action "routes")');
    argv = ['play', map, routes.join(',')].concat(dry ? ['--dry'] : []);
  } else if (action === 'click' || action === 'rclick') {
    if (!Number.isFinite(+args.x) || !Number.isFinite(+args.y) || +args.x < 0 || +args.y < 0) return ctx.bad(action + ': give x and y, pixels inside the game window');
    argv = [action, map, String(Math.round(+args.x)), String(Math.round(+args.y))];
  } else if (action === 'key') {
    const k = ctx.name(args.key, 'key'); if (!/^[\w+ ]{1,40}$/.test(k)) return ctx.bad('key: a key name such as ESCAPE, ENTER, F5, SPACE');
    argv = ['key', map, k];
  } else return ctx.bad('action must be routes, play, click, rclick or key');
  const command = cmdLine('uidrive', argv);
  if (dry && action !== 'play') return { text: 'Dry run: nothing was sent. This would run:\n  ' + command + '\nThe input goes only to the window of ' + g.file + '; with no such window the tool refuses.', data: { game: g.id, dry, command } };
  if (!dry) { const off = launchOff(ctx); if (off) return off; }
  const r = await ctx.run('uidrive', argv, { timeout: dry ? 60000 : 30 * 60 * 1000, env, max: 20000 });
  return { text: [dry ? 'Dry run: nothing was sent. This would run:' : 'Ran:', '  ' + command, r.text.trim()].join('\n'), data: { game: g.id, dry, command, exit: r.code }, isError: !dry && (r.isError || r.code !== 0) };
}
async function gameShot(args, ctx) {
  const g = ctx.game(args), dry = args.dry === true, proc = g.file.replace(/\.exe$/i, '').split(/[\\/]/).pop();
  const crop = args.frac != null ? ['--frac', H.box(ctx, args.frac, 'frac')] : args.box != null ? ['--box', H.box(ctx, args.box, 'box')] : null;
  const cropArgs = (src, out) => [src].concat(crop, args.scale ? ['--scale', String(H.int(args.scale, 2, 1, 8))] : [], ['--out', out]);
  const dir = path.join(H.tmpDir(), 'shots'), stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const L = [], data = { game: g.id, dry };
  let src = null;
  if (args.file) {   // an existing picture: no game is touched
    src = ctx.name(args.file, 'file');
    if (!path.isAbsolute(src) || !fs.existsSync(src)) return ctx.bad('file: give the full path of an existing screenshot (jpg or png)');
    if (!crop) { const r = await ctx.run('shotcrop', [src, '--info'], { timeout: 60000 }); return { text: 'Picture ' + src + ': ' + r.text.trim() + '\nPass `frac` (x,y,w,h as parts of the picture, 0 to 1) or `box` (pixels) to cut a part out and enlarge it.', data: Object.assign(data, { file: src }) }; }
  } else {
    const out = path.join(dir, g.id + '-' + stamp + '.png'), ps = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ctx.TOOLS, 'uidrive', 'lib', 'win.ps1'), '-ProcName', proc, '-Op', 'shot', '-Out', out];
    data.command = 'powershell ' + ps.map(a => (/\s/.test(a) ? '"' + a + '"' : a)).join(' '); data.file = out;
    if (dry) {
      L.push('Dry run: no picture was taken. This would run:', '  ' + data.command);
      if (crop) L.push('then: ' + cmdLine('shotcrop', cropArgs(out, out.replace(/\.png$/, '-crop.png'))));
      L.push('It takes a picture of the window of ' + g.file + ' only; with no such window it refuses.');
      return { text: L.join('\n'), data };
    }
    const off = launchOff(ctx); if (off) return off;
    if (process.platform !== 'win32') return ctx.bad('taking a picture of the game window works on Windows only');
    fs.mkdirSync(dir, { recursive: true });
    const r = cp.spawnSync('powershell', ps, { encoding: 'latin1', windowsHide: true, timeout: 60000 });
    let j = null; try { j = JSON.parse(String(r.stdout || '').trim().split('\n').pop()); } catch (e) { /* not json */ }
    if (!j || !j.ok || !fs.existsSync(out)) return ctx.bad('no picture: ' + ((j && j.why) || H.firstLine(String(r.stdout || '') + String(r.stderr || '')) || 'the game window was not found') + '. Is ' + g.name + ' running?');
    L.push('Picture of the ' + g.name + ' window saved: ' + out + (j.w ? ' (' + j.w + 'x' + j.h + ')' : '') + '.');
    L.push('A picture can come out all grey right after a screen change: wait 1 to 2 s and take it again (modweb testing/controls).');
    src = out;
  }
  if (crop) {
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, path.basename(src).replace(/\.\w+$/, '') + '-crop-' + stamp + '.png');
    const r = await ctx.run('shotcrop', cropArgs(src, out), { timeout: 120000 });
    if (r.code !== 0 || !fs.existsSync(out)) return ctx.bad('the cut-out failed: ' + H.firstLine(r.text));
    L.push('Cut-out saved: ' + out + '.'); data.crop = out;
  }
  return { text: L.join('\n'), data };
}

// ---------------------------------------------------------------- the tool list
const T = (name, title, description, kind, inputSchema, handler) => ({ name, title, description, inputSchema, games: ALL, kind, handler: H.wrap(handler) });
const tools = [
  T('mow_game_status', 'Game status', 'Is the game installed, which build, which mods are enabled (in load order), is it running, where are its settings and logs, and may this server start it. Read only. Serves as64, mowas2 and goh.', 'read', schema({}), gameStatus),
  T('mow_game_log', 'Read the last game log', 'Explains the game.log of the last run in plain words: what went wrong, where, and how to fix it; harmless noise left out. Use after a problem in a match or at start. For a crash or an out-of-sync report use mow_game_crash. Serves as64, mowas2 and goh (Gates of Hell log form).', 'read',
    schema({ log: { type: 'string', description: 'Optional: full path of a game.log or of a log folder. Default: the game\'s own log folder.' }, prev: { type: 'boolean', description: 'Also read the run before (game.prev.log).' }, limit: { type: 'integer', description: 'Most kinds of message to show (default 20).' } }), gameLog),
  T('mow_game_crash', 'Explain a crash', 'Finds the crash, fatal error or out-of-sync report of the last run (game.log, crash reports, oos folders) and says in plain words which part of the game failed and what to check. Serves as64, mowas2 and goh.', 'read',
    schema({ log: { type: 'string', description: 'Optional: full path of a game.log or of a log folder. Default: the game\'s own log folder.' } }), gameCrash),
  T('mow_matchup', 'Gun against armour', 'Can gun X go through the armour of vehicle Y at range R, from the front, the side and the rear. as64 and mowas2: traced through the vehicle\'s real plates with their slope (armour simulator), with the share of hits that go through and the furthest range that works. goh: flat comparison of penetration against plate thickness (the simulator does not serve Gates of Hell), said plainly.', 'read',
    schema({ attacker: { type: 'string', description: 'The shooting unit, by name or id (for example "Panther" or pz5g). Its main gun is used.' }, gun: { type: 'string', description: 'Or a weapon name (for example 75mm_kwk42), instead of or on top of attacker.' }, ammo: { type: 'string', description: 'Optional ammo name or tags (for example "bullet75 apcr"). Default: the gun\'s first armour-piercing shell.' },
      target: { type: 'string', description: 'The vehicle or gun that is shot at, by name or id (for example "T-34/76" or t34_0).' }, range: { type: 'number', description: 'Range in metres (default 100).' }, mod: MOD }, ['target']), matchup),
  T('mow_unit_armor', 'Armour of a unit', 'The armour of a vehicle plate by plate in mm (front, side, rear, top) and where it is thin. as64 and mowas2: from the armour simulator; goh: the values of the unit files.', 'read',
    schema({ unit: { type: 'string', description: 'The vehicle or gun, by name or id.' }, mod: MOD }, ['unit']), unitArmor),
  T('mow_army', 'What an army can buy', 'The buy panel of an army: each unit with class, price and what it is paid with, rank needed, wait at match start, cooldown, command points, gun penetration and front armour; and how the economy works. Without `army` it lists the armies. goh: no rank; periods and doctrines; doctrine points.', 'read',
    schema({ army: { type: 'string', description: 'Army id: as64/mowas2 usa, ger, rus, eng, jap, ger2; goh rus, ger, fin, eng, usa. Leave out to list the armies.' }, class: { type: 'string', description: 'Only one class: squad (or infantry), tank, td, atgun, art, aa, aagun, mg, mortar, apc, car, truck, other, vehicle.' }, max_price: { type: 'number', description: 'Only units up to this price.' }, search: { type: 'string', description: 'Only units whose name or id holds this text.' },
      period: { type: 'string', description: 'goh only: early, mid or late.' }, doctrine: { type: 'string', description: 'goh only: a doctrine name (for example mid_ger_offensive or just offensive).' }, limit: { type: 'integer', description: 'Most units to show (default 60).' }, mod: MOD }), army),
  T('mow_unit_counter', 'What beats a unit', 'What the enemy armies can buy that beats a unit, cheapest first: judged by gun penetration against its armour at the range (as64 and mowas2: traced through its plates), the gun\'s reach and the price; says which ones work only from the side or rear, and whether the unit can shoot back through the counter\'s front. goh: flat comparison.', 'read',
    schema({ unit: { type: 'string', description: 'The unit to beat, by name or id.' }, army: { type: 'string', description: 'Optional: the army of that unit, when the name exists in several.' }, enemy: { type: 'string', description: 'The army or armies that buy the counter (comma separated). Default: every other army.' }, range: { type: 'number', description: 'Range in metres (default 100).' }, max_price: { type: 'number', description: 'Only counters up to this manpower price.' },
      period: { type: 'string', description: 'goh only: early, mid or late.' }, limit: { type: 'integer', description: 'Most counters to list (default 10).' }, mod: MOD }, ['unit']), unitCounter),
  T('mow_mode_info', 'Game modes and their rules', 'The game modes of the game (and of a mod): which exist, how each is won, its numbers (score to win, capture times, preparation time), whether bots are allowed, and how the economy works. Without `mode` it lists them. goh has other modes (frontlines, ammunition, evacuation, guerrilla, no combat).', 'read',
    schema({ mode: { type: 'string', description: 'A mode: as64/mowas2 combat, captureflag, battle_zones (Assault Zones), battle_zones_8x8, frontline, cooperative; goh battle_zones, frontlines, ...' }, mod: MOD }), modeInfo),
  T('mow_bots_info', 'Bots: what they do and buy', 'What a bot (AI player) can and cannot do, in which modes it may be added, and for as64 and mowas2 what each army\'s bot buys and when. goh: the rules only (its bots run from scripts, no shopping list).', 'read',
    schema({ army: { type: 'string', description: 'Optional: one army for its whole bot buy list (as64, mowas2).' }, mod: MOD }), botsInfo),
  T('mow_settings_info', 'Game options and key bindings', 'Reads the player\'s game options (video, sound, game, camera) and key bindings from the profile folder. Read only: nothing is changed, and no player name is shown. Serves as64, mowas2 (one shared profile) and goh.', 'read',
    schema({ what: { type: 'string', enum: ['both', 'options', 'keys'], description: 'What to show (default both).' }, filter: { type: 'string', description: 'Only lines holding this text (for example "camera", "sound", "control_manual").' } }), settingsInfo),
  T('mow_game_routes', 'Recorded menu routes', 'Lists the recorded menu routes that can start and steer mowas2 and goh (which have no control pipe), with what each does. Read only, starts nothing. as64 has none: it is started by mow_game_start through its control pipe.', 'read',
    schema({}), (args, ctx) => gameDrive({ game: args.game, action: 'routes' }, ctx)),
  T('mow_mods_enable', 'Turn mods on or off', 'Sets the enabled mod list of the game (folder names in load order; an empty list turns all off; restore puts back the list from before the first change). The game must be closed. `dry: true` changes nothing and shows the plan. Launch kind: needs ARSENAL_ALLOW_LAUNCH=1. Serves as64, mowas2 (shared list) and goh.', 'launch',
    schema({ mods: { type: 'array', items: { type: 'string' }, description: 'Mod folder names in load order. as64: add as64+ first for Enhanced mode.' }, restore: { type: 'boolean', description: 'Put back the list saved before the first change.' }, force: { type: 'boolean', description: 'Write even when the tool warns that a mod is made for the other mode (it may stop the game at start).' }, dry: { type: 'boolean', description: 'Show the plan, change nothing.' } }), modsEnable),
  T('mow_game_start', 'Start a match', 'Starts the game and a match. as64: through its control pipe: map, mode, players, mods, how long to hold the match. mowas2 and goh have no control pipe: the game is started and steered by recorded menu routes (see mow_game_drive), so map and mode are fixed by the route. `dry: true` starts nothing and answers the command line and the steps. Launch kind: needs ARSENAL_ALLOW_LAUNCH=1.', 'launch',
    schema({ map: { type: 'string', description: 'as64: map name, for example 1v1_gazala.' }, mode: { type: 'string', description: 'as64: battle_zones, combat, captureflag or frontline (default combat).' }, players: { type: 'integer', description: 'as64: seats of the match (default 2).' }, mods: { type: 'array', items: { type: 'string' }, description: 'Mod folder names in load order to enable for this start.' },
      hold: { type: 'integer', description: 'as64: seconds to keep the match running before closing (default 60).' }, wait_over: { type: 'boolean', description: 'as64: keep running until the match is over.' }, routes: { type: 'array', items: { type: 'string' }, description: 'mowas2, goh: recorded routes to play in order (default ["boot"], the main menu).' }, dry: { type: 'boolean', description: 'Start nothing; answer the command line and the plan.' } }), gameStart),
  T('mow_game_drive', 'Drive the game menus', 'For mowas2 and goh (no control pipe): list the recorded menu routes, play them in order, or send one click or key to the game window. as64 is driven by mow_game_start instead. `dry: true` sends nothing. Launch kind: needs ARSENAL_ALLOW_LAUNCH=1; to only list the routes use mow_game_routes.', 'launch',
    schema({ action: { type: 'string', enum: ['routes', 'play', 'click', 'rclick', 'key'], description: 'routes = list them (default); play = run routes; click, rclick = one mouse click at x,y; key = one key.' }, routes: { type: 'array', items: { type: 'string' }, description: 'play: route names in order.' }, x: { type: 'number' }, y: { type: 'number' }, key: { type: 'string', description: 'key: a key name, for example ESCAPE.' }, dry: { type: 'boolean', description: 'Send nothing; answer what would run.' } }), gameDrive),
  T('mow_game_shot', 'Screenshot of the game', 'Takes a picture of the running game window (saved in the scratch folder), and can cut a part out and enlarge it so small HUD text can be read. With `file` it only cuts an existing picture and touches no game. `dry: true` takes nothing. Launch kind: needs ARSENAL_ALLOW_LAUNCH=1. Serves as64, mowas2 and goh.', 'launch',
    schema({ file: { type: 'string', description: 'Optional: full path of an existing screenshot to cut instead of taking a new one.' }, frac: { type: 'string', description: 'Cut-out as parts of the picture: "x,y,w,h" from 0 to 1, for example "0,0.8,0.3,0.2".' }, box: { type: 'string', description: 'Or the cut-out in pixels: "x,y,w,h".' }, scale: { type: 'integer', description: 'Enlarge the cut-out this many times (1 to 8).' }, dry: { type: 'boolean', description: 'Take nothing; answer what would run.' } }), gameShot),
];

// the group of each tool (tools/mcp/README.md "Pieces, groups and downloads"); a tool not named here is in `play`
const GROUP = { mow_matchup: 'coach', mow_unit_armor: 'coach', mow_army: 'coach', mow_unit_counter: 'coach',
  mow_game_routes: 'run', mow_mods_enable: 'run', mow_game_start: 'run', mow_game_drive: 'run', mow_game_shot: 'run' };
for (const t of tools) t.group = GROUP[t.name] || 'play';

module.exports = { group: 'play', tools };
