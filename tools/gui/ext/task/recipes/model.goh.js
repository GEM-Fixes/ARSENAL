// recipe "model", the Gates of Hell parts (game parity 2026-11-23). The model task runs on GoH with the same steps as on AS64, read
// through the GoH install: the soedit stage reader and the model edit core take exe 'goh' (tools/soedit/stage.js openSource,
// tools/lib/model/edit/core.js), the Models page stage and check take the GoH install (models/game.js gameDir). Read on the GoH
// install [V, not run in game]: a model folder holds the .mdl, the .def of the same name and its .ply/.vol/.anm/.mtl as
// on AS2, the broken and destroyed views sit in <parent>/x/<name>_x and _xx; a sample of 1546 of the 15456 entity .mdl all parse with a
// {Skeleton} (tools/lib/model/mdl); a sample of 429 vehicle .mdl names no {Thickness}: GoH armour is in the def's {volume} blocks.
// So on GoH:
//   vol_thick (thickness of a model volume): a GoH .mdl names no {Thickness} (sample above), the game reads armour from the {volume}
//   blocks of the def and the files it includes; so the lines become armour set rows of the unit's def, written by this recipe's own
//   route POST /api/x/task/r/model/gohvol with the armour task's GoH write (armour.goh gohRoute, tools/lib/goharmour plan): the
//   volume is changed where it is written (a shared file is copied next to the unit). The def is the copied one (planned on the game
//   def it is copied from until the copy lands), else the mod's or the game's def of that name; none: refused with the plain reason.
//   everything else: as on AS64, every result [T] (no GoH model written by this task was loaded in game)
// Writes: copies and the def rows go through the task core (plan first, restore point); the model edit route on GoH guards every file
// it is about to write with lib/modwrite guardFile and takes a lib/modwrite restore point of each before the core saves.
// Author: Imperator_Aug (ARSENAL, ia-99aab76e)
'use strict';
const path = require('path');

const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const MW = () => require('../../../../lib/modwrite');
// the GoH install of a task: the task's own (ctx.task / a compile's c.task), else the page's GoH folder, else the found one
function gohDir(ctx) { try { return require('./skin.goh').gohDirOf(ctx); } catch (e) { return null; } }
// the reader game of soedit stage / the edit core on GoH
function view(ctx) { const d = gohDir(ctx); return d ? { dir: d, exe: 'goh' } : null; }
// questions with no GoH form: id -> the plain reason
const REFUSED = {};
function refuse(c, linesOf) { for (const id of Object.keys(REFUSED)) if (linesOf(c, id).length) throw bad(REFUSED[id]); }
// before the model edit core writes into the mod (not dry): each target inside the mod (links followed), then a restore point of each
function guardSave(doc, mod, dir) {
  const pre = doc.save({ dry: true });
  if (pre.refused.length) return [];
  const rels = pre.writes.map(w => w.rel).concat(pre.removes.map(r => r.rel));
  for (const rel of rels) { try { MW().guardFile(mod, path.join(mod, ...String(rel).split('/')), { game: dir }); } catch (e) { throw bad('model edits: ' + e.message); } }
  return MW().restorePoints(mod, rels, 'task-model-goh', { game: dir });
}

// vol_thick on GoH: the lines (volume = mm, or volume = [all mm] side mm ...) as goharmour set rows [{part, side, mm}]
const VOL_ROUTE = 'POST /api/x/task/r/model/gohvol';
const SIDES = ['front', 'top', 'left', 'right', 'rear', 'bottom'];
function volSets(lines, lineErr) {
  const out = [];
  for (const ln of lines) {
    const i = ln.indexOf('=');
    if (i < 1) throw lineErr('vol_thick', ln, 'needs the form left = right.');
    const vol = ln.slice(0, i).trim(), w = ln.slice(i + 1).trim().split(/\s+/).filter(Boolean);
    if (!/^[A-Za-z0-9_.#+-]+$/.test(vol)) throw lineErr('vol_thick', ln, 'needs a volume name on the left.');
    const num = x => { const n = Number(x); if (x == null || !Number.isFinite(n) || n < 0 || n > 2000) throw lineErr('vol_thick', ln, 'needs millimetres, 0 to 2000.'); return n; };
    if (w.length === 1) { out.push({ part: vol, side: 'all', mm: num(w[0]) }); continue; }
    if (!w.length || w.length % 2) throw lineErr('vol_thick', ln, 'needs a number, or side names each with a number.');
    const rows = [];
    for (let k = 0; k < w.length; k += 2) {
      const s = w[k].toLowerCase(), n = num(w[k + 1]);
      if (s === 'all') rows.unshift({ part: vol, side: 'all', mm: n });
      else if (SIDES.includes(s)) rows.push({ part: vol, side: s, mm: n });
      else throw lineErr('vol_thick', ln, 'names no side (' + SIDES.join(', ') + ').');
    }
    out.push(...rows);
  }
  return out;
}
// own route: the armour task's GoH write on the model's def, restore points named task-model-goh
function volRoute(url, b, ctx) { return require('./armour.goh').gohRoute(url, b, ctx, { action: 'task-model-goh' }); }

module.exports = { gohDir, view, REFUSED, refuse, guardSave, VOL_ROUTE, volSets, volRoute };
