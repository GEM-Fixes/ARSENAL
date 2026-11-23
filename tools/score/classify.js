#!/usr/bin/env node
'use strict';
// classify.js: one class per failed or void game and per failed group of a kill set, from report.json + game0.log (no game).
//   node tools/score/classify.js [--json] [--pick pick.json] [--count-short] [--set-date YYYY-MM-DD] [--no-stop] [--no-health] <runs dir> [<runs dir> ...]
//   node tools/score/score.js --classify ... (same arguments)
// A runs dir is a folder of game folders (r1-g2, r1-g2-rerun, x1-g26 ...) each with report.json, or a set folder holding runs/.
// Several dirs = one set read in order (old, rerun, rerun): a later valid game replaces the earlier one (the C39T scorer's merge).
// Groups: pick.json (first one found in a given dir or its parent, or --pick) maps group -> pair; without it each pair is its own group.
// Pass (default, rules-count.md): valid runs >= 4 and kills x 2 >= runs. --count-short: from 2026-11-09 sets on (not C39, C39R, C39T,
// C39C, reproof*), runs >= 3 with every valid run killing passes as [I] count-short (score.js countShortApplies).
// Game classes: crash-offset (the edrun {offset} bug, a load error line the game prints), load-crash (any other crash or no report.json), void-control
// (control NOKILL / NOORDER / overcap). Group classes (first that holds): crash-offset / load-crash / void-control (no valid run),
// count-short (every fault is too few runs), unit-fault (preflight: def lists no weapon, weapon is a light, ammo, range; game0.log
// "Can't find bone X in entity <shooter>"), fire-unproven (shots unread: MG / no muzzle line, and no hit in a valid run),
// never-fires (measured 0 shots, no hit in any game), fires-no-hit (measured shots, 0 hits in any game), hits-no-kill (the rest).
// Hits = report.json BLAST hits + HEALTH lines right after the shooter's muzzle blast in game0.log (c39f.md; --no-health: BLAST only).
// Classes never change a pass: the pass rule is the score's (C39 sets keep runs >= 4).
// Triage-first stop: when crash + void games with one signature are over 10% of the set's games, prints
// `stop: one cause <sig> (N games)` and exits 3 before classing groups (--no-stop classes anyway, exit 0).
// Author: Imperator_Aug (ARSENAL, ia-f527c36c)
require('../lib/help')(__filename);
const fs = require('fs');
const path = require('path');
const S = require('./score.js');

const GAME_RE = /^(.+?)(-rerun\d*)?$/;
const LIGHT_RE = /^(searchlight\w*|\w*lamp\w*|\w*light\w*|binocular\w*|flag\w*|radio\w*)$/i;

function runsDirOf(d) { const r = path.join(d, 'runs'); return fs.existsSync(r) && fs.statSync(r).isDirectory() ? r : d; }

// signature of a crash or void game: first error line, crash why, or the control state; timestamps, entity indices and map paths cut
function sigOf(g, rep) {
  const cut = s => String(s || '').replace(/^\[[\d:]+\]\s*/, '').replace(/\[\d+\]/g, '').replace(/\s*\(\/[^)]*\)/g, '').replace(/\s*@\s*\[\w+\]\s*$/, '').trim();
  if (!rep) return 'no report.json';
  const crash = (rep.games || []).find(x => x.crash);
  const err = (rep.games || []).map(x => (x.errors || [])[0]).find(Boolean);
  if (crash) {
    if (err) return cut(err);
    if (crash.crashInfo && crash.crashInfo.why) return cut(crash.crashInfo.why).replace(/\s*\([\w.]+, \d+\s*$/, '');
    return 'crash, no error line';
  }
  const c = (rep.pairs || []).filter(p => p.control);
  const st = c.map(p => p.verdict === 'PASS' && p.counted === false ? 'overcap' : p.verdict).join(',') || 'none';
  return 'control ' + st;
}
function gameClass(g) {
  if (!g.rep) return 'load-crash';
  if (g.crash) return /eresource\.cpp,\s*62/i.test(g.sig) ? 'crash-offset' : 'load-crash';
  return 'void-control';
}

function loadDir(dir, setName) {
  const W = runsDirOf(dir), games = {}, attempts = [];
  if (!fs.existsSync(W)) return { games, attempts, W };
  for (const name of fs.readdirSync(W).sort(S.natCmp || ((a, b) => a.localeCompare(b, 'en', { numeric: true })))) {
    const full = path.join(W, name);
    let st; try { st = fs.statSync(full); } catch (e) { continue; }
    if (!st.isDirectory()) continue;
    const m = GAME_RE.exec(name); if (!m) continue;
    const id = m[1], rerun = !!m[2], f = path.join(full, 'report.json');
    let rep = null; try { rep = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { rep = null; }
    if (!rep && !fs.existsSync(path.join(full, 'game0.log'))) continue; // not a game folder
    const crash = !!rep && (rep.games || []).some(x => x.crash);
    const vflag = !!rep && (rep.games || []).some(x => x.void);
    const ctl = rep ? (rep.pairs || []).filter(p => p.control) : [];
    const valid = !!rep && !crash && !vflag && ctl.length > 0 && ctl.every(S.killCounts);
    const g = { id, name, set: setName, dir: full, rep, crash, valid, at: rep ? st.mtimeMs : 0 };
    if (!valid) g.sig = sigOf(g, rep);
    try { g.at = fs.statSync(f).mtimeMs; } catch (e) { /* none */ }
    attempts.push(g);
    const prev = games[id];
    if (!prev || !prev.rep || (rerun && valid) || (!prev.valid && valid)) games[id] = g;
  }
  return { games, attempts, W };
}

function findPick(dirs, given) {
  if (given) return JSON.parse(fs.readFileSync(given, 'utf8'));
  for (const d of dirs) for (const c of [path.join(d, 'pick.json'), path.join(path.dirname(runsDirOf(d)), 'pick.json'), path.join(d, '..', 'pick.json')]) {
    if (fs.existsSync(c)) { try { const j = JSON.parse(fs.readFileSync(c, 'utf8')); j._file = c; return j; } catch (e) { /* skip */ } }
  }
  return null;
}

const boneLines = new Map();
function bonesIn(dir, shooter) {
  const f = path.join(dir, 'game0.log');
  let txt = boneLines.get(f);
  if (txt === undefined) { try { txt = fs.readFileSync(f, 'latin1'); } catch (e) { txt = ''; } boneLines.set(f, txt); }
  if (!txt || !shooter) return [];
  const out = new Set(), re = /Can't find bone (\S+) in entity (\S+?)\[\d+\]/g; let m;
  const want = String(shooter).replace(/^mp\/\w+\//, '').toLowerCase();
  while ((m = re.exec(txt))) if (m[2].toLowerCase() === want) out.add(m[1]);
  return [...out];
}

// direct hits the BLAST count misses (c39f.md: AP direct hits show only as HEALTH lines). A HEALTH line of 500 or more damage right
// after the shooter's own muzzle BLAST block ([0.2/...] on <shooter>[id]) counts as one of its hits [I: line order, not an id link;
// small HEALTH lines there are mostly the shooter's own crew in its muzzle blast, so they are left out; MG bullets stay unseen].
function healthHits(dir, shooter) {
  const f = path.join(dir, 'game0.log');
  let txt = boneLines.get(f);
  if (txt === undefined) { try { txt = fs.readFileSync(f, 'latin1'); } catch (e) { txt = ''; } boneLines.set(f, txt); }
  if (!txt || !shooter) return 0;
  const want = String(shooter).replace(/^mp\/\w+\//, '').toLowerCase();
  const L = txt.split(/\r?\n/), muz = /^BLAST\[0\.2\/[^\]]*\]:\s*(\S+?)\[(\d+)\]/;
  let n = 0, armed = false;
  for (let i = 0; i < L.length; i++) {
    const m = muz.exec(L[i]);
    if (m && m[1].toLowerCase() === want) { armed = true; continue; }
    if (!armed) continue;
    armed = false; // only the first line after the shooter's muzzle block
    const h = /^HEALTH \w+\[\d+[:\]][^:]*:\s*(-?[\d.]+)/.exec(L[i]);
    if (h && -parseFloat(h[1]) >= 500) n++;
  }
  return n;
}

// fault from preflight notes/warns, bone lines; null when none
function unitFault(rows, dirs, shooter) {
  const why = new Set();
  for (const p of rows) {
    const pf = p.preflight || {};
    for (const w of [].concat(pf.notes || [], pf.warns || [], pf.status === 'HOLD' ? (pf.hold || []) : [])) {
      const s = String(w);
      if (/def lists no weapon/i.test(s)) why.add('no weapon: def lists no weapon');
      const wm = /weapon (\S+) not found/i.exec(s); if (wm && LIGHT_RE.test(wm[1])) why.add('no gun: weapon ' + wm[1]);
      if (/\bammo\b/i.test(s) && !/range unknown/i.test(s)) why.add('ammo: ' + s);
      if (/out of range|range (?:under|over|too)/i.test(s)) why.add('range: ' + s);
      if (/missing (?:shooter )?bone/i.test(s)) why.add('bone: ' + s);
    }
  }
  const bones = new Set(); for (const d of dirs) for (const b of bonesIn(d, shooter)) bones.add(b);
  if (bones.size) why.add('bone: Can\'t find bone ' + [...bones].sort().join('/') + ' in entity ' + String(shooter).replace(/^mp\/\w+\//, ''));
  return why.size ? [...why] : null;
}

function classify(dirs, o) {
  o = o || {};
  const sets = dirs.map(d => loadDir(d, path.basename(d.replace(/[\\/]+$/, '')) === 'runs' ? path.basename(path.dirname(path.resolve(d))) : path.basename(path.resolve(d))));
  const final = {}, attempts = [];
  for (const s of sets) {
    attempts.push(...s.attempts);
    for (const [k, v] of Object.entries(s.games)) if (v.valid || !final[k] || !final[k].valid) final[k] = v;
  }
  const games = Object.values(final).sort((a, b) => S.natCmp(a.id, b.id));
  const bad = games.filter(g => !g.valid).map(g => ({ id: g.id, run: g.set + '/' + g.name, class: gameClass(g), sig: g.sig }));
  // triage-first stop
  const sigCount = {}; for (const b of bad) sigCount[b.sig] = (sigCount[b.sig] || 0) + 1;
  const top = Object.entries(sigCount).sort((a, b) => b[1] - a[1])[0];
  const stop = top && games.length && top[1] * 10 > games.length ? { sig: top[0], n: top[1], of: games.length } : null;
  const res = { dirs, games: games.length, valid: games.filter(g => g.valid).length, attempts: attempts.length, badGames: bad, stop, groups: [] };
  // set date and name, for the forward-only count-short rule
  const setDate = o.setDate ? Date.parse(/^\d{4}-\d\d-\d\d$/.test(o.setDate) ? o.setDate + 'T00:00:00' : o.setDate) : Math.min(...attempts.filter(a => a.at).map(a => a.at).concat([Infinity]));
  const cs = !!o.countShort && S.countShortApplies(dirs.map(d => path.resolve(d)).join('|'), setDate);
  res.rule = o.countShort ? (cs ? 'count-short (forward rule, runs >= 3 all kill)' : 'old (count-short asked, set is before 2026-11-09 or named old)') : 'old (runs >= 4, kills x 2 >= runs)';
  res.gameByClass = {}; for (const b of bad) res.gameByClass[b.class] = (res.gameByClass[b.class] || 0) + 1;
  if (stop && !o.noStop) return res;
  // pairs per group
  const pick = findPick(dirs, o.pick);
  res.pick = pick && pick._file ? pick._file : (o.pick || null);
  const groups = [];
  const pairNames = new Set(); for (const g of attempts) if (g.rep) for (const p of g.rep.pairs || []) if (!p.control) pairNames.add(p.name);
  if (pick && Array.isArray(pick.pick)) for (const k of pick.pick) groups.push({ g: k.g, unit: k.u, pair: k.pair });
  else for (const n of [...pairNames].sort(S.natCmp)) groups.push({ g: n, unit: null, pair: n });
  for (const G of groups) {
    const valid = [], all = [], dirsOf = [], vDirs = [];
    for (const g of games) if (g.valid) for (const p of g.rep.pairs || []) if (p.name === G.pair) { valid.push(p); vDirs.push(g.dir); }
    for (const g of attempts) if (g.rep) for (const p of g.rep.pairs || []) if (p.name === G.pair) { all.push(p); dirsOf.push(g.dir); }
    const runs = valid.length, ok = valid.filter(p => /^sm_/.test(p.name) ? p.moved != null : S.killCounts(p)).length;
    const shotsM = all.filter(p => p.shotsRead !== false && typeof p.shots === 'number');
    const shooter0 = G.unit || (all[0] && all[0].shooter) || null;
    const hp = o.noHealth ? [] : dirsOf.map(d => healthHits(d, all[0] && all[0].shooter || shooter0)), vHp = o.noHealth ? [] : vDirs.map(d => healthHits(d, valid[0] && valid[0].shooter || shooter0));
    const sum = a => a.reduce((s, x) => s + x, 0);
    const shots = shotsM.reduce((s, p) => s + p.shots, 0), blastHits = all.reduce((s, p) => s + (+p.hits || 0), 0), hits = blastHits + sum(hp);
    const vShots = valid.filter(p => p.shotsRead !== false).reduce((s, p) => s + (+p.shots || 0), 0), vHits = valid.reduce((s, p) => s + (+p.hits || 0), 0) + sum(vHp);
    const e = { g: G.g, unit: shooter0, pair: G.pair, runs, kills: ok, shots: vShots, hits: vHits, healthHits: sum(hp), allShots: shots, allHits: hits, shotsRead: shotsM.length > 0 };
    const oldPass = runs >= 4 && ok * 2 >= runs;
    const csPass = cs && runs >= 3 && ok === runs;
    e.pass = oldPass || csPass;
    if (csPass && !oldPass) e.tag = '[I] count-short';
    if (!e.pass) {
      const shooter = e.unit || (all[0] && all[0].shooter);
      if (!runs) {
        const tried = attempts.filter(g => (g.rep ? (g.rep.pairs || []).some(p => p.name === G.pair) : false) || !g.rep);
        const last = games.find(g => g.rep && (g.rep.pairs || []).some(p => p.name === G.pair));
        e.class = last ? gameClass(last) : (all.length ? 'void-control' : 'load-crash');
        e.why = 'no valid run' + (last ? ' (' + last.sig + ')' : '') + (tried.length ? '' : ', pair in no game');
      } else if (ok * 2 >= runs) { e.class = 'count-short'; e.why = ok + ' of ' + runs + ', needs 4 runs'; }
      else {
        const uf = unitFault(all, dirsOf, shooter);
        const hh = ' (' + blastHits + ' BLAST + ' + sum(hp) + ' HEALTH)';
        if (uf) { e.class = 'unit-fault'; e.why = uf.join('; '); }
        else if (!shotsM.length) {
          // no muzzle line (MG, noBlast): fire is unproven unless a valid run shows a hit
          if (vHits > 0) { e.class = 'hits-no-kill'; e.why = vHits + ' hits in valid runs, shots unread, ' + ok + ' of ' + runs + ' kills'; e.tag = '[I] shots unread'; }
          else { e.class = 'fire-unproven'; e.why = 'shots unread (no muzzle line), 0 hits in valid runs' + (hits ? ', ' + hits + ' in void games' + hh : '') + ' in ' + all.length + ' games'; }
        }
        else if (!shots && !hits) { e.class = 'never-fires'; e.why = 'measured 0 shots, 0 hits in ' + all.length + ' games'; }
        else if (!hits) { e.class = 'fires-no-hit'; e.why = shots + ' shots, 0 hits (BLAST + HEALTH) in ' + all.length + ' games (void included)'; }
        else { e.class = 'hits-no-kill'; e.why = hits + ' hits' + hh + ', ' + shots + ' shots in ' + all.length + ' games (void included), ' + ok + ' of ' + runs + ' kills'; if (sum(hp)) e.tag = '[I] HEALTH hits by line order'; }
      }
    }
    res.groups.push(e);
  }
  res.pass = res.groups.filter(x => x.pass).length;
  res.byClass = {}; for (const x of res.groups.filter(x => !x.pass)) res.byClass[x.class] = (res.byClass[x.class] || 0) + 1;
  res.gameByClass = {}; for (const b of bad) res.gameByClass[b.class] = (res.gameByClass[b.class] || 0) + 1;
  return res;
}

function render(r) {
  const L = [];
  L.push('classify: ' + r.dirs.join(' + ') + ' | games ' + r.games + ' (attempts ' + r.attempts + '), valid ' + r.valid + ' | rule ' + r.rule);
  if (r.stop) L.push('stop: one cause ' + r.stop.sig + ' (' + r.stop.n + ' games of ' + r.stop.of + ')');
  L.push('');
  L.push('Failed or void games (final state per game id): ' + r.badGames.length + (r.badGames.length ? '  ' + Object.entries(r.gameByClass).map(([k, v]) => k + ' ' + v).join(', ') : ''));
  for (const b of r.badGames) L.push('  ' + b.run.padEnd(28) + b.class.padEnd(14) + b.sig);
  if (r.stop && !r.groups.length) return L.join('\n');
  L.push('');
  L.push('Groups: ' + r.pass + ' of ' + r.groups.length + ' pass' + (r.pick ? ' (pick ' + r.pick + ')' : '') + '; fails by class: ' + (Object.entries(r.byClass).map(([k, v]) => k + ' ' + v).join(', ') || 'none'));
  L.push('  group | pair | kills/runs | shots hits | class | why');
  for (const x of r.groups) if (!x.pass || x.tag) L.push('  ' + [x.g, x.pair, x.kills + '/' + x.runs, 's' + x.shots + ' h' + x.hits, x.pass ? 'PASS' : x.class, (x.why || '') + (x.tag ? ' ' + x.tag : '')].join(' | '));
  return L.join('\n');
}

function main(argv) {
  const a = argv || process.argv.slice(2), o = { dirs: [] };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--json') o.json = true; else if (a[i] === '--pick') o.pick = a[++i]; else if (a[i] === '--count-short') o.countShort = true;
    else if (a[i] === '--set-date') o.setDate = a[++i]; else if (a[i] === '--no-stop') o.noStop = true; else if (a[i] === '--no-health') o.noHealth = true; else if (a[i] === '--classify') continue;
    else if (/^--/.test(a[i])) continue; else o.dirs.push(a[i]);
  }
  if (!o.dirs.length) { console.error('classify: give one or more runs dirs (see --help)'); return 2; }
  for (const d of o.dirs) if (!fs.existsSync(d)) { console.error('classify: no such dir ' + d); return 2; }
  const r = classify(o.dirs, o);
  if (o.json) { const c = Object.assign({}, r); console.log(JSON.stringify(c, null, 1)); }
  else { console.log(render(r)); if (!r.stop || o.noStop) { console.log(''); console.log('JSON: ' + JSON.stringify({ games: r.games, valid: r.valid, pass: r.pass, of: r.groups.length, gameByClass: r.gameByClass, byClass: r.byClass, fails: r.groups.filter(x => !x.pass).map(x => ({ g: x.g, class: x.class })) })); } }
  return r.stop && !o.noStop ? 3 : 0;
}

module.exports = { classify, render, main, sigOf, gameClass, unitFault, loadDir };
if (require.main === module) process.exitCode = main();
