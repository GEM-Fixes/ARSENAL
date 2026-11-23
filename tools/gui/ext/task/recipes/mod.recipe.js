// recipe "make a mod": title, where (the game's mods folder or another), folder (suggested from the title), description, needs; written through the existing `new` command (as64) or the newmod
// tool with --target mowas2 (MoW:AS2) or --target goh (GoH: another folder only, never inside the GoH install). The reference recipe: read it with ../README.md. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-001ea88d)
'use strict';
const path = require('path');
const GM = require('../../../../lib/games');
// the task's game: x (c.game, opt.game), else ctx.task.id, else ctx.gameId (string or function), else as64
function gidOf(ctx, x) {
  let v = x;
  if (!v && ctx && ctx.task && ctx.task.id) v = ctx.task.id;
  if (!v && ctx) { try { v = typeof ctx.gameId === 'function' ? ctx.gameId() : ctx.gameId; } catch (e) { v = null; } }
  return GM.idOf(v) || 'as64';
}
// the questions of the AS2 games (a draft with no game, '', is an AS64 one, as before)
const AS2 = ['as64', 'mowas2', ''];

module.exports = {
  id: 'mod',
  verbs: ['make'],
  games: ['as64', 'mowas2', 'goh'],
  needs: [],                       // makes the mod itself, so no "pick a mod" step
  order: 10,
  title: 'task.mod.t',
  census: 'mod',                   // census/mod.json: every key of making a mod (new, mod.info, layout, turning on, check)
  // the title first, so the folder name can be suggested from it; the place is a choice (the game lists only its own mods folder)
  groups: [
    { id: 'info', title: 'task.mod.g.info', essential: true, q: [
      { id: 'title', kind: 'text', ask: 'task.mod.q.title', help: 'task.mod.h.title', covers: ['new.name', 'info.name'] },
    ] },
    { id: 'place', title: 'task.mod.g.place', essential: true, q: [
      // GoH: not asked (values give place 'other': no write into the GoH install); where says so in its own words
      { id: 'place', kind: 'choice', ask: 'task.mod.q.place', help: 'task.mod.h.place', limits: { values: ['game', 'other'] }, when: { $game: AS2 } },
      { id: 'where', kind: 'text', ask: 'task.mod.q.where', help: 'task.mod.h.where', covers: ['layout.folder_rules'], when: { place: 'other', $game: AS2 } },
      { id: 'where_goh', kind: 'text', ask: 'task.mod.q.where', help: 'task.mod.h.whereGoh', covers: ['layout.folder_rules'], when: { $game: 'goh' } },
      { id: 'folder', kind: 'id', ask: 'task.mod.q.folder', help: 'task.mod.h.folder', covers: ['new.dir'], suggest: { from: 'title', slug: true },
        limits: { re: '^[a-z][a-z0-9_]{0,60}$', reHint: 'task.mod.h.folderEx' }, unique: { lookup: 'modfolder', in: 'where' }, when: { $game: AS2 } },
      { id: 'folder_goh', kind: 'id', ask: 'task.mod.q.folder', help: 'task.mod.h.folder', covers: ['new.dir'], suggest: { from: 'title', slug: true },
        limits: { re: '^[a-z][a-z0-9_]{0,60}$', reHint: 'task.mod.h.folderEx' }, unique: { lookup: 'modfolder', in: 'where_goh' }, when: { $game: 'goh' } },
    ] },
    { id: 'more', title: 'task.mod.g.more', q: [
      { id: 'desc', kind: 'text', ask: 'task.mod.q.desc', help: 'task.mod.h.desc', covers: ['new.desc', 'info.desc'], optional: true },
      // ticked from the mods the game has (or typed, for a mod that is not there yet)
      { id: 'deps', kind: 'list', ask: 'task.mod.q.deps', help: 'task.mod.h.deps', covers: ['new.deps', 'info.require'], optional: true,
        limits: { re: '^[A-Za-z0-9_+.]+$' }, picker: { sources: ['exist', 'value'], lookup: 'modfolder' } },
    ] },
  ],
  kept: [
    ['new.target', 'set from the game in the header: AS64 through the new command, MoW:AS2 and GoH through newmod --target mowas2 or goh'],
    ['new.game_version', 'follows the target: AS64 3.301 with no newest version, MoW:AS2 the 3.262 range, GoH its exe version as Min and Max (newmod, PORT-46)'],
    ['info.min_game_version', 'written by new or newmod from the target'],
    ['info.max_game_version', 'written by new or newmod from the target'],
    ['new.lang', 'the engine has one text set; newmod takes it as information only (LOC-17)'],
    ['new.game', 'the game folder the GUI already knows'],
    ['new.dry', 'the Review step runs the dry run; the Write step runs it for real'],
    ['info.delete', 'an empty mod hides no game file; tasks that need it add it later'],
    ['info.fileid', 'set by the Workshop upload (release task)'],
    ['info.version', 'set by the release task; the game skips it'],
    ['layout.resource', 'new makes the empty resource folder; the other tasks fill it'],
    ['layout.pat', 'patch packs come from the upgrade and release tasks'],
    ['layout.localization', 'new makes the text folder; the text task fills it'],
    ['active.list', 'the Test step hands over to the Play page, which turns the mod on'],
    ['active.install', 'the Test step hands over to the Play page, which installs the mod'],
    ['active.uninstall', 'done on the Mods page, not part of making a mod'],
    ['check.check', 'the built in Check step runs it'],
    ['check.play', 'the built in Test step hands over to the Play page'],
  ],
  checklist: ['task.mod.c.list', 'task.mod.c.on'],
  // preselected answers: the game's mods folder
  // GoH: ARSENAL never writes into the GoH install (tools/lib/writeguard), so its mods folder is not offered: the place is another
  // folder (settled 2026-11-14), and the mod is copied into <GoH>/mods by the user
  values: (ctx, base, opt) => {
    if (gidOf(ctx, opt && opt.game) === 'goh') return { place: 'other' };
    const g = ctx.game && ctx.game();
    return g ? { place: 'game', where: path.join(g, 'mods') } : { place: 'game' };
  },
  compile: (draft, c) => {
    const gid = gidOf(c, c.game);
    const other = gid === 'goh' || c.value('place') === 'other', folder = String(c.value(gid === 'goh' ? 'folder_goh' : 'folder') || '');
    const where = gid === 'goh' ? String(c.value('where_goh') || '') : other ? String(c.value('where') || '') : (c.gameDir ? path.join(c.gameDir, 'mods') : '');
    if (!other && !where) throw Object.assign(new Error('Set the game folder first (the Game folder button at the top).'), { status: 400 });
    if (!where || !path.isAbsolute(where)) throw Object.assign(new Error('Pick the folder the new mod goes in.'), { status: 400 });
    if (!/^[a-z][a-z0-9_]{0,60}$/.test(folder)) throw Object.assign(new Error('The folder name is not set.'), { status: 400 });
    const dir = path.join(where, folder), title = String(c.value('title') || folder), desc = String(c.value('desc') || '');
    // GoH: a folder inside the GoH install gets the write guard's refusal as the plain line, at Review already (settled 2026-11-14)
    if (gid === 'goh') { const why = require('../../../../lib/writeguard').refuseWrite(dir, { purpose: 'make a Gates of Hell mod' }); if (why) throw Object.assign(new Error(why), { status: 400 }); }
    const deps = [].concat(c.value('deps') || []).map(String).filter(Boolean);
    // MoW:AS2: newmod --target mowas2 (the 3.262 range). GoH: newmod --target goh, Min and Max = the GoH exe version (PORT-46, GHVFS-02),
    // read from the GoH install (--game; else newmod finds it through tools/lib/gamedir)
    if (gid === 'mowas2' || gid === 'goh') {
      const args = [dir, '--name', title, '--target', gid];
      const goh = gid === 'goh' ? ((c.task && c.task.gohDir) || c.gameDir || '') : '';
      if (goh) args.push('--game', goh);
      if (desc) args.push('--desc', desc);
      if (deps.length) args.push('--deps', deps.join(','));
      return { mod: dir, calls: [{ tool: 'newmod', args }], result: folder };
    }
    const input = { dir, name: title };
    if (desc) input.desc = desc;
    if (deps.length) input.deps = deps.join(',');
    return { mod: dir, calls: [{ cmd: 'new', input }], result: folder };
  },
};
