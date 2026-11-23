#!/usr/bin/env node
// armorsim: armour simulator command line section 6). Reads only, except `edit` (writes a mod folder).
//   armorsim table <unit>                                   thickness table per volume (rule, def file:line, flags)
//   armorsim effects <unit> (same options as shot) [--samples N] [--seed N] [--until s] [--explosive amount] [--shooter "tags"]
//       the shot followed behind the armour: engine events, then the unit's interaction scripts; chances over N seeded runs
//   armorsim shot <unit> (--weapon W --ammo A | --shell S) --range M (--from az,el [--aim x,y,z | --aim-volume id] | --origin x,y,z --dir x,y,z)
//       [--ground z]  (shot and effects: a flat ground at height z in model units; a ray going down ends there, RULES 49)
//   armorsim map <unit> (--weapon W --ammo A | --shell S) --range M --view front|rear|left|right|top|az,el [--grid 64x48]
//   armorsim edit <unit> --volume V --side front|..|all --mm N --out <mod folder> [--shared] [--dry]
// common: --game G, --mods a,b, --folder <mod folder> (read over the game), --json, --exe as64|mowas_2|mowas2 (the game's file view:
//   AS64 and MoW:AS2 share the AS2 install, --exe mowas_2 keeps the as64/core files out; none = as before). --exe goh: refused with
//   one line, exit 2 (the armour simulator is AS2 and the 64-bit build only, owner decision 2026-11-10).
// Exit 0 done, 1 problem/refused, 2 usage.
// Core: sim.js (load, join, trace, judge), edit.js (in-place edit). Rules: RULES.md.
// Author: Imperator_Aug (ARSENAL, ia-18f7edc0)
'use strict';
const sim = require('./sim'), ed = require('./edit');

const HELP = `armorsim: armour simulator (MoW:AS2). Reads the game; only "edit" writes, and only into a mod folder.
  table <unit>      thickness table per volume: six sides in mm, which rule gave each, def file:line, flags
      node tools/armorsim/armorsim.js table pz4h
  shot <unit>       one shot: plates in order and the verdict
      node tools/armorsim/armorsim.js shot pz4h --weapon "75mm_kwk40(L48)" --ammo "bullet75 ap" --range 100 --from 0,0
  map <unit>        grid of parallel shots from one view: what each cell hits and whether it goes through
      node tools/armorsim/armorsim.js map pz4h --weapon "75mm_kwk40(L48)" --ammo "bullet75 ap" --range 100 --view front
  edit <unit>       change one armour number in a mod folder (copies the def there first; shared values need --shared)
      node tools/armorsim/armorsim.js edit pz4h --volume turret --side front --mm 60 --out "<mods>/mymod" --dry
options: --game G  --mods a,b  --folder <mod folder>  --json  --exe as64|mowas_2
  shot: --shell <weapon name | ammo tags | JSON shell>  --from az,el (0 = front, 90 = left side, el up)  --aim x,y,z
        --aim-volume <id or name>  --origin x,y,z --dir x,y,z (engine units, 20 per metre)
        --ground z (shot, effects: flat ground at height z, model units; a downward shell ends and bursts there)
  map:  --grid WxH (default 64x48)    edit: --shared --dry
exit: 0 done, 1 problem found or refused, 2 usage`;

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    if (s === '--json' || s === '--dry' || s === '--shared' || s === '-h' || s === '--help') a[s.replace(/^-+/, '')] = true;
    else if (s.startsWith('--')) { const k = s.slice(2), eq = k.indexOf('='); if (eq > 0) a[k.slice(0, eq)] = k.slice(eq + 1); else a[k] = argv[++i]; }
    else a._.push(s);
  }
  return a;
}
// --ground z: the ground height (model units, RULES 49), carried on the ray; absent = no ground
const groundOf = a => a.ground === undefined ? undefined : (/^\s*-?\d+(\.\d+)?\s*$/.test(String(a.ground)) && Math.abs(Number(a.ground)) <= 10000 ? Number(a.ground) : NaN);
const vec = s => { const p = String(s || '').split(',').map(Number); return p.length === 3 && p.every(isFinite) ? p : null; };
const pad = (s, n) => String(s == null ? '' : s).padEnd(n);
const lpad = (s, n) => String(s == null ? '' : s).padStart(n);

function usage(msg) { process.stderr.write((msg ? msg + '\n' : '') + 'usage: armorsim table|shot|map|edit <unit> ... (--help)\n'); return 2; }

function common(a) {
  let game = a.game;
  if (!game) { const r = require('../lib/gamedir').resolve({}); game = r.dir || undefined; }
  return Object.assign({ game, mods: a.mods ? String(a.mods).split(',').map(s => s.trim()).filter(Boolean) : [], folder: a.folder }, a.exe ? { exe: a.exe } : {});
}
function out(a, obj, text) { process.stdout.write(a.json ? JSON.stringify(obj) + '\n' : text + '\n'); }

function cmdTable(a, ctx) {
  const T = sim.table(ctx);
  if (a.json) { out(a, T); return 0; }
  const L = [`${T.unit}  ${T.key}  model ${T.model}  material ${T.material}`];
  L.push(pad('volume', 14) + pad('kind', 11) + pad('bone', 22) + ['front', 'top', 'left', 'right', 'rear', 'bottom'].map(s => lpad(s, 7)).join('') + '  flags');
  for (const r of T.rows) {
    L.push(pad(r.name, 14) + pad(r.kind || '-', 11) + pad(r.bone || '-', 22) + r.sides.map(s => lpad(s.mm, 7)).join('') + '  ' + r.flags.join(', '));
    const groups = new Map();
    for (const s of r.sides) { const k = s.rule + (s.at ? ' ' + s.at : '') + (s.macro ? ' via macro at ' + s.macro : ''); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s.side); }
    for (const [k, ss] of groups) L.push('    ' + pad(ss.length === 6 ? 'all sides' : ss.join(','), 26) + ' ' + k);
  }
  const S = T.summary, f = (n, x) => x.volume ? `${n} (${x.volume}) front ${x.front} side ${x.side} rear ${x.rear} top ${x.top}` : `${n}: ${x.note}`;
  L.push('summary: ' + f('hull', S.hull) + ' | ' + f('turret', S.turret));
  if (T.join.notInModel.length) L.push('in the def but not in the model: ' + T.join.notInModel.join(', '));
  if (T.join.noArmor.length) L.push('in the model with no armour value: ' + T.join.noArmor.join(', '));
  if (T.join.noShape.length) L.push('model volumes without a shape: ' + T.join.noShape.join(', '));
  out(a, T, L.join('\n'));
  return 0;
}

function shellOf(a, ctx) {
  if (!a.weapon && !a.shell) return { usage: 'give --weapon W --ammo A or --shell S' };
  return sim.shellFrom({ weapon: a.weapon, ammo: a.ammo, shell: a.shell }, ctx.opts);
}
// source: the gun's and the ammo's stuff files with their origin (from, mod, layer, rel: origin.js); ammoNotLoaded as sim.shoot
const stampKey = (ctx, k) => (k && ctx && ctx.src ? require('./origin').stamp(ctx.src, { file: k }) : null);
const shellInfo = (S, range, ctx) => ({ weapon: S.weapon, ammo: S.ammo, kind: S.kind, calibre: S.calibre, params: S.params, penetration: Math.round(require('./pen').penetrationAt(S, range) * 10) / 10,
  source: { weapon: stampKey(ctx, S.weaponKey), ammo: stampKey(ctx, S.ammoKey) }, ammoNotLoaded: S.ammoNotLoaded || null });
const notLoadedNote = x => 'the weapon ' + x.weapon + ' does not load the ammo "' + x.asked + '"; fired anyway' + (x.loads && x.loads.length ? ' (it loads: ' + x.loads.join(', ') + ')' : '') +
  (x.near && x.near.length ? '; did you mean: ' + x.near.join(', ') : '');

function cmdShot(a, ctx) {
  const range = Number(a.range);
  if (!isFinite(range)) return usage('--range M is required');
  const S = shellOf(a, ctx);
  if (S.usage) return usage(S.usage);
  if (S.error) { process.stderr.write(S.error + '\n'); return 1; }
  let ray;
  if (a.origin || a.dir) {
    const o = vec(a.origin), d = vec(a.dir);
    if (!o || !d) return usage('--origin x,y,z and --dir x,y,z');
    ray = { origin: o, dir: d };
  } else {
    const f = String(a.from || '0,0').split(',').map(Number);
    if (!f.every(isFinite)) return usage('--from az,el');
    let aim = null;
    if (a.aim) { aim = vec(a.aim); if (!aim) return usage('--aim x,y,z'); }
    if (a['aim-volume']) { aim = sim.aimVolume(ctx, a['aim-volume']); if (!aim) { process.stderr.write('no volume ' + a['aim-volume'] + ' (have ' + ctx.vols.map(v => v.id).join(', ') + ')\n'); return 1; } }
    ray = sim.rayFrom(ctx, f[0], f[1] || 0, aim);
  }
  const gz = groundOf(a);
  if (Number.isNaN(gz)) return usage('--ground z (a number, -10000 to 10000)');
  if (gz !== undefined) ray.ground = gz;
  const r = sim.shoot(ctx, S, range, ray);
  const notes = r.notes.concat(ctx.join.notHit.length ? ['not hit by shells (left out of the trace): ' + ctx.join.notHit.map(x => x.name + ' (' + x.why + ')').join(', ')] : [], ctx.join.notInModel.length ? ['def volumes not in the model: ' + ctx.join.notInModel.join(', ')] : []);
  const J = { unit: ctx.unit, shell: shellInfo(S, range, ctx), rangeM: range, ray: { origin: ray.origin.map(x => Math.round(x * 100) / 100), dir: ray.dir.map(x => Math.round(x * 1e4) / 1e4), ...(gz !== undefined ? { ground: gz } : {}) },
    plates: r.plates, verdict: r.verdict, chance: r.chance, r: r.r, o: r.o, firstPlate: r.verdict, wholeWayIn: r.wholeWay, last: r.last, lastVolume: r.lastVolume, outcome: r.outcome, decisive: r.decisive, notes, ammoNotLoaded: r.ammoNotLoaded || null };
  if (r.groundPoint) J.groundPoint = r.groundPoint;
  if (a.json) { out(a, J); return 0; }
  const L = [`${ctx.unit}  ${S.weapon} / ${S.ammo || '-'} (${S.kind || '?'}, ${S.calibre} mm)  range ${range} m  pen ${J.shell.penetration} mm`];
  L.push(pad('#', 3) + pad('volume', 28) + pad('side', 7) + pad('face', 6) + lpad('mm', 7) + lpad('angle', 7) + lpad('eff', 8) + lpad('pen', 8) + '  result');
  r.plates.forEach((p, i) => L.push(pad(i === r.decisive ? '>' : '', 3) + pad(p.volume, 28) + pad(p.side, 7) + pad(p.enter ? 'in' : 'out', 6) + lpad(p.nominal, 7) + lpad(p.angle, 7) + lpad(p.effective, 8) + lpad(p.penLeft, 8) + '  ' + p.result + (p.chance !== undefined ? ' p=' + p.chance : '') + (p.flag ? ' (' + p.flag + ')' : '')));
  L.push('first plate: ' + r.verdict + (r.chance !== null ? ' (ricochet chance ' + r.chance + ', else bursts on the plate)' : '') + '   whole way in: ' + r.wholeWay + (r.lastVolume ? (r.wholeWay === 'penetrate' ? ' (last plate passed ' : ' (stopped at ') + r.lastVolume + ')' : '') + '   whole ray: ' + r.outcome);
  if (r.ammoNotLoaded) L.push('note: ' + notLoadedNote(r.ammoNotLoaded));
  for (const n of notes) L.push('note: ' + n);
  out(a, J, L.join('\n'));
  return 0;
}

function cmdMap(a, ctx) {
  const range = Number(a.range);
  if (!isFinite(range)) return usage('--range M is required');
  const view = sim.parseView(a.view || 'front');
  if (!view) return usage('--view front|rear|left|right|top|az,el');
  const g = /^(\d+)x(\d+)$/i.exec(a.grid || '64x48');
  if (!g) return usage('--grid WxH');
  const S = shellOf(a, ctx);
  if (S.usage) return usage(S.usage);
  if (S.error) { process.stderr.write(S.error + '\n'); return 1; }
  const t0 = Date.now();
  const M = sim.map(ctx, S, range, view, { w: +g[1], h: +g[2] });
  const J = { unit: ctx.unit, shell: shellInfo(S, range, ctx), rangeM: range, view: M.view, az: M.az, el: M.el, grid: M.grid, cells: M.cells, volumes: M.volumes, legend: M.legend,
    share: Math.round(M.share * 1000) / 1000, shareFirst: Math.round(M.shareFirst * 1000) / 1000, hitCells: M.hitCells, penetratedCells: M.penetratedCells, firstPlateCells: M.firstPlateCells, notHit: M.notHit, ms: Date.now() - t0 };
  if (a.json) { out(a, J); return 0; }
  const L = [`${ctx.unit}  view ${M.view}  ${S.weapon} / ${S.ammo || '-'}  range ${range} m  pen ${J.shell.penetration} mm  grid ${M.grid.w}x${M.grid.h} cell ${M.grid.cell} u`];
  for (let y = 0; y < M.grid.h; y++) { let s = ''; for (let x = 0; x < M.grid.w; x++) { const c = M.cells[y * M.grid.w + x]; s += c ? c.r : '.'; } L.push(s); }
  L.push('legend: ' + Object.entries(M.legend).map(([k, v]) => k + ' ' + v).join(', ') + ', . nothing');
  const per = new Map();
  for (const c of M.cells) if (c) { const k = M.volumes[c.v] || '?'; const e = per.get(k) || { n: 0, p: 0, f: 0, mm: new Set() }; e.n++; if (c.o === 'P') e.p++; if (c.r === 'P') e.f++; e.mm.add(c.n); per.set(k, e); }
  for (const [k, e] of per) L.push('  ' + pad(k, 30) + lpad(e.n, 5) + ' cells  ' + lpad(Math.round(e.f / e.n * 100), 3) + '% first plate ' + lpad(Math.round(e.p / e.n * 100), 3) + '% whole way in  nominal ' + [...e.mm].sort((x, y) => x - y).slice(0, 6).join('/'));
  L.push(`penetrated: first plate ${M.firstPlateCells}/${M.hitCells} (${Math.round(M.shareFirst * 100)}%), whole way in ${M.penetratedCells}/${M.hitCells} (${Math.round(M.share * 100)}%) of armoured cells   ${J.ms} ms`);
  if (M.notHit.length) L.push('not hit by shells: ' + M.notHit.join(', '));
  out(a, J, L.join('\n'));
  return 0;
}

// effects: the shot followed behind the armour: engine events (after.js) + the unit's interaction scripts (tools/iasim), run --samples times
function cmdEffects(a, ctx) {
  const range = Number(a.range);
  if (!isFinite(range)) return usage('--range M is required');
  const S = shellOf(a, ctx);
  if (S.usage) return usage(S.usage);
  if (S.error) { process.stderr.write(S.error + '\n'); return 1; }
  let ray;
  if (a.origin || a.dir) { const o = vec(a.origin), d = vec(a.dir); if (!o || !d) return usage('--origin x,y,z and --dir x,y,z'); ray = { origin: o, dir: d }; }
  else {
    const f = String(a.from || '0,0').split(',').map(Number);
    if (!f.every(isFinite)) return usage('--from az,el');
    let aim = null;
    if (a.aim) { aim = vec(a.aim); if (!aim) return usage('--aim x,y,z'); }
    if (a['aim-volume']) { aim = sim.aimVolume(ctx, a['aim-volume']); if (!aim) { process.stderr.write('no volume ' + a['aim-volume'] + '\n'); return 1; } }
    ray = sim.rayFrom(ctx, f[0], f[1] || 0, aim);
  }
  const gz = groundOf(a);
  if (Number.isNaN(gz)) return usage('--ground z (a number, -10000 to 10000)');
  if (gz !== undefined) ray.ground = gz;
  const R = require('./effects').effects(ctx, S, range, ray, { samples: a.samples ? Number(a.samples) : undefined, seed: a.seed ? Number(a.seed) : undefined,
    until: a.until ? Number(a.until) : undefined, explosiveAmount: a.explosive !== undefined ? Number(a.explosive) : undefined, shooterTags: a.shooter ? String(a.shooter).split(/[ ,]+/) : undefined });
  const J = Object.assign({ unit: ctx.unit, shell: shellInfo(S, range, ctx), rangeM: range }, R);
  delete J.next;
  if (a.json) { out(a, J); return 0; }
  const pc = x => Math.round(x * 100) + '%';
  const L = [`${ctx.unit}  ${S.weapon} / ${S.ammo || '-'}  range ${range} m  pen ${J.shell.penetration} mm  ${R.samples} runs, seed ${R.seed}, ${R.until} s`];
  L.push('engine: ' + (R.engine.events.map(e => e.event + ' ' + e.volume + (e.part ? ' [' + e.part + ']' : '')).join(' > ') || 'no event'));
  L.push('shell ends: ' + R.ends.map(e => e.result + (e.volume ? ' at ' + e.volume : '') + ' ' + pc(e.chance)).join(', '));
  L.push('whole: ' + R.whole.map(w => w.key + ' ' + pc(w.chance)).join(', '));
  // groups: one line per cause, its facts under it, the groups it set off indented under it
  const factOf = new Map(R.facts.map(x => [x.fact, x]));
  const kids = new Map();
  for (const g of R.groups || []) { const k = g.parent || 0; if (!kids.has(k)) kids.set(k, []); kids.get(k).push(g); }
  const causeText = c => {
    if (c.kind === 'before') return 'already so before this shot';
    const what = c.kind === 'part' ? (c.fact ? c.fact.replace(/^part:/, '') : (c.part || '?') + ' ' + c.event)
      : c.kind === 'blast' ? (c.event || 'blast') + (c.volume ? ' at ' + c.volume : '') + (c.by ? ' (made on ' + c.by.event + ' ' + c.by.file + ':' + c.by.line + ')' : '')
      : c.kind === 'script' ? '"' + c.event + '"' + (c.by ? ' (started on ' + c.by.event + ' ' + c.by.file + ':' + c.by.line + ')' : '')
      : c.kind === 'jet' ? 'the filling\'s jet flies on as a new bullet' : c.kind === 'fire' ? 'the filling\'s fire sets the unit burning'
      : (c.event || c.kind) + (c.volume ? ' ' + c.volume : c.part ? ' ' + c.part : '');
    return c.kind + ': ' + what + (c.file ? '  first handler ' + c.file + ':' + c.line + ' [' + fromText(c) + ']' : '');
  };
  const fromText = c => c.from + (c.mod ? ' ' + c.mod : '');
  const after = x => (x.at && x.at.median ? '  (after ' + x.at.median + ' s)' : '');
  const full = a.tree === 'full' || !(R.causes || []).length;
  if (full) (function tree(pid, depth) {
    for (const g of kids.get(pid) || []) {
      const ind = '  '.repeat(depth + 1);
      L.push(ind + pad(pc(g.chance), 6) + causeText(g.cause) + after(g));
      for (const x of g.facts) { const all = factOf.get(x.fact); L.push(ind + '  - ' + pad(pc(x.chance), 6) + x.fact + after(x) + (all && all.groups && all.groups.length > 1 ? '  (all causes ' + pc(all.chance) + ')' : '')); }
      tree(g.id, depth + 1);
    }
  })(0, 0);
  else {
    // causes: helper steps folded in, one line per cause however it was reached (--tree full: the groups above)
    const byC = new Map(R.causes.map(c => [c.id, c])), ck = new Map();
    for (const c of R.causes) { const k = c.parent || 0; if (!ck.has(k)) ck.set(k, []); ck.get(k).push(c); }
    const short = id => {
      if (id == null) return 'the shot itself';
      const c = byC.get(id).cause;
      return c.kind === 'part' ? (c.fact ? c.fact.replace(/^part:/, 'part ') : 'part ' + c.part + ' ' + c.event) : c.kind === 'script' ? '"' + c.event + '"'
        : c.kind === 'blast' ? 'blast' + (c.by ? ' made on ' + c.by.event : '') : c.kind === 'before' ? 'before this shot' : (c.event || c.kind) + (c.volume ? ' ' + c.volume : c.part ? ' ' + c.part : '');
    };
    (function tree(pid, depth) {
      for (const c of ck.get(pid) || []) {
        const ind = '  '.repeat(depth + 1);
        L.push(ind + pad(pc(c.chance), 6) + causeText(c.cause) + after(c));
        for (const v of c.via) if (v.parent !== c.parent) L.push(ind + '  also reached through ' + short(v.parent) + ' ' + pc(v.chance));
        if (c.tags.length) L.push(ind + '  tags added: ' + c.tags.join(', '));
        if (c.steps.length) L.push(ind + '  steps: ' + c.steps.map(s => s.event + ' ' + s.file + ':' + s.line).join(', '));
        for (const x of c.facts) { const all = factOf.get(x.fact); L.push(ind + '  - ' + pad(pc(x.chance), 6) + x.fact + after(x) + (all && all.causes && all.causes.length > 1 ? '  (all causes ' + pc(all.chance) + ')' : '')); }
        tree(c.id, depth + 1);
      }
    })(0, 0);
  }
  if (!(R.groups || []).length) for (const x of R.facts) L.push('  ' + pad(pc(x.chance), 6) + x.fact + (x.at ? '  (after ' + x.at.median + ' s)' : ''));
  const tagsAdded = (R.tags || []).filter(t => t.op === 'add'), tagsRemoved = (R.tags || []).filter(t => t.op === 'remove');
  if (tagsAdded.length) L.push('tags added: ' + tagsAdded.map(t => t.tag + ' ' + pc(t.chance) + (t.at && t.at.median ? ' after ' + t.at.median + ' s' : '') + (t.by ? ' (on ' + t.by.event + ' ' + t.by.file + ':' + t.by.line + ' [' + t.by.from + '])' : '')).join(', '));
  if (tagsRemoved.length) L.push('tags removed: ' + tagsRemoved.map(t => t.tag + ' ' + pc(t.chance)).join(', '));
  for (const b of R.blasts || []) {
    const r = b.radiusM ? ' ' + b.radiusM.inner + ' to ' + b.radiusM.outer + ' m' : '';
    L.push('blast ' + pc(b.chance) + ': ' + (b.source === 'shell' ? 'the shell\'s filling' : 'script, on ' + (b.by ? b.by.event + ' ' + b.by.file + ':' + b.by.line + ' [' + b.by.from + ']' : '?')) +
      ', c4 ' + (typeof b.energy === 'number' ? Math.round(b.energy * 1000) / 1000 : b.energy) + r + (b.point ? ' at ' + b.point.join(',') : '') + (b.at ? ' after ' + b.at + ' s' : ''));
    if (b.hits.length) L.push('  reached: ' + b.hits.map(h => h.volume + (h.part && h.part !== h.volume ? ' [' + h.part + ']' : '') + ' ' + h.result + ' ' + pc(h.chance)).join(', '));
  }
  for (const j of R.jets || []) {
    L.push('jet ' + pc(j.chance) + ': the filling\'s cumulative charge, ' + j.damage + ' mm over ' + j.distance + ' m; ends ' + j.ends.map(e => e.result + (e.volume ? ' at ' + e.volume : '') + ' ' + pc(e.chance)).join(', '));
    if (j.hits.length) L.push('  reached: ' + j.hits.map(h => h.volume + (h.part && h.part !== h.volume ? ' [' + h.part + ']' : '') + ' ' + h.events.join('+') + ' ' + pc(h.chance)).join(', '));
  }
  for (const f of R.fires || []) {
    L.push('fire ' + pc(f.chance) + ': the filling\'s fire, ' + f.radius + ' m, heating ' + f.heating + ' for ' + f.time + ' s; reaches ' + pc(f.reaches) + ', sets it burning ' + pc(f.ignites) +
      (f.igniteAt ? ' after ' + f.igniteAt.median + ' s' : '') + (f.inflammation != null ? ' (inflammation_time ' + f.inflammation + ' s' + (f.inflammationAt ? ', ' + f.inflammationAt.file + ':' + f.inflammationAt.line + ' [' + fromText(f.inflammationAt) + ']' : '') + ')' : ' (inflammation_time not known)'));
    if (f.volumes.length) L.push('  volumes in its sphere: ' + f.volumes.map(v => v.volume + ' ' + pc(v.chance)).join(', '));
    if (!f.ignites && f.notes.length) L.push('  ' + f.notes[0]);
  }
  if (R.ammoNotLoaded) L.push('note: ' + notLoadedNote(R.ammoNotLoaded));
  if (R.engine.crewNote) L.push('note: ' + R.engine.crewNote);
  L.push('script blocks: ' + (R.scripts.blocks.join(' | ') || 'none'));
  for (const h of R.scripts.handlers.slice(0, 40)) L.push('  on ' + pad(h.event, 28) + h.file + ':' + h.line + '  [' + h.from + ']');
  if (R.notFollowed.length) L.push('not followed: ' + R.notFollowed.map(u => u.kind + ' ' + u.name + ' (' + u.file + ':' + u.line + ')').join(', '));
  if (R.inputs.length) L.push('asked by the scripts, not given by the shot: ' + R.inputs.join(', '));
  for (const n of R.engine.notes) L.push('note: ' + n);
  out(a, J, L.join('\n'));
  return 0;
}
function cmdEdit(a, c) {
  if (!a.volume || !a.side || a.mm === undefined || !a.out) return usage('edit needs --volume --side --mm --out');
  const r = ed.edit(a._[1], { volume: a.volume, side: a.side, mm: a.mm, out: a.out, dry: !!a.dry, shared: !!a.shared, game: c.game, mods: c.mods, exe: c.exe });
  const L = [];
  for (const ch of r.changes) L.push(`${ch.key}:${ch.line}  ${ch.before} -> ${ch.after}${ch.created ? '  (def copied into the mod folder)' : ''}\n  file ${ch.file}`);
  if (r.reason) L.push((r.refused ? 'refused: ' : 'failed: ') + r.reason);
  if (r.verify) L.push('reader now sees ' + JSON.stringify(r.verify.got) + (r.ok ? ' (as asked)' : ''));
  for (const n of r.notes) L.push('note: ' + n);
  if (r.ok) L.push(a.dry ? 'dry run: nothing written' : 'done');
  out(a, r, L.join('\n'));
  return r.ok ? 0 : 1;
}

function main(argv) {
  const a = parseArgs(argv);
  if (a.help || a.h) { process.stdout.write(HELP + '\n'); return 0; }
  const cmd = a._[0], unit = a._[1];
  if (!['table', 'shot', 'map', 'edit', 'effects'].includes(cmd) || !unit) return usage(cmd ? null : 'name a command');
  if (a.exe !== undefined) {
    const g = require('../lib/games').get(a.exe);
    if (!g) return usage('--exe must be as64, mowas_2 or mowas2 (got ' + a.exe + ')');
    if (g.id === 'goh') { process.stderr.write(require('../lib/games').notFor('armorsim', 'goh', 'the armour simulator is for MoW:AS2 and the 64-bit build only', 'owner decision 2026-11-10, plan/decisions.md SOEdit') + '\n'); return 2; }
    a.exe = g.exe;
  }
  const c = common(a);
  if (cmd === 'edit') return cmdEdit(a, c);
  const ctx = sim.open(unit, c);
  if (ctx.error) { process.stderr.write(ctx.error + '\n'); return 1; }
  return cmd === 'table' ? cmdTable(a, ctx) : cmd === 'shot' ? cmdShot(a, ctx) : cmd === 'effects' ? cmdEffects(a, ctx) : cmdMap(a, ctx);
}

if (require.main === module) {
  let code;
  try { code = main(process.argv.slice(2)); } catch (e) { process.stderr.write('armorsim: ' + (e.stack || e.message) + '\n'); code = 1; }
  process.exitCode = code;
}
module.exports = { main, parseArgs };
