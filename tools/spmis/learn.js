// spmis/learn: read every stock single-player mission through lib/vfs and count the forms the generator may use (model.json).
//   node tools/spmis/spmis.js --learn [--game G] [--exe as64|mowas_2] [--model-out F]
// What is counted (all [V stock], counts = blocks seen across the missions under resource/map/single/**):
//   files per mission folder, campaign folder files, interface.set forms (mission + campaign level, campaign `side` values),
//   stock mission .lng keys, top-level .mi blocks, Players forms (user, alias, diplomacy), Helpers blocks, every command and
//   term kind with its field sets (`cmdSig`, `termSig`), selector keys, task fields and states, gameover results, timer forms,
//   difficulty levels, waypoint block names, zone forms, camera key counts, and the Player value of units tagged player/enemy*.
// Author: Imperator_Aug (ARSENAL, ia-9dceb5be)
'use strict';
const path = require('path');
const vfs = require('../lib/vfs'), sdl = require('../lib/sdl');

// every form seen is kept (most frequent first): a cap made --check call rare stock forms unseen (SPMIS_FORM on a stock mission)
const val = n => n.vals.map(x => x.v).join(' ');
const sig = n => [...new Set(n.kids.map(k => k.name))].sort().join(',');
function walk(n, f) { for (const k of n.kids) { f(k); walk(k, f); } }
const STATEMENTS = new Set(['if', 'loop', 'while', 'select', 'switch', 'case', 'default', 'thread']);

function learn(opts) {
  const t0 = Date.now();
  const v = vfs.build({ gameDir: opts.gameDir, exe: opts.exe, mods: [] });
  const keys = [...v.files.keys()];
  const C = {};
  const inc = (a, k, n = 1) => { (C[a] = C[a] || {})[k] = (C[a][k] || 0) + n; };
  const read = k => vfs.readRec(v.files.get(k)).toString('latin1');
  const tree = t => sdl.parseLines(t.split(/\r?\n/), () => {});
  const mis = keys.filter(k => /^resource\/map\/single\/[^/]+\/[^/]+\/0\.mi$/.test(k)).sort();
  const dirs = mis.map(k => k.slice(0, -'/0.mi'.length));
  // files a mission folder holds
  for (const d of dirs) {
    const names = new Set(keys.filter(k => k.startsWith(d + '/') && !k.slice(d.length + 1).includes('/')).map(k => k.slice(d.length + 1).replace(/^mtl\d+\.mtl$/, 'mtlN.mtl')));
    for (const n of names) inc('missionFiles', n);
  }
  const camps = [...new Set(dirs.map(d => d.split('/').slice(0, 4).join('/')))];
  for (const c of camps) for (const k of keys) if (k.startsWith(c + '/') && !k.slice(c.length + 1).includes('/')) inc('campaignFiles', k.slice(c.length + 1));
  // interface.set forms
  for (const d of dirs) if (v.files.has(d + '/interface.set')) for (const n of tree(read(d + '/interface.set')).kids) { inc('missionInterface', n.name + ':' + sig(n)); for (const f of n.kids) if (!f.kids.length) inc('missionInterface.' + f.name, val(f)); }
  for (const c of camps) if (v.files.has(c + '/interface.set')) for (const n of tree(read(c + '/interface.set')).kids) { inc('campaignInterface', n.name + ':' + sig(n)); for (const f of n.kids) if (!f.kids.length) inc('campaignInterface.' + f.name, val(f)); }
  // texts: mission/single/<campaign>/<mission>.lng and campaign.lng
  for (const d of dirs) {
    const [, , , camp, m] = d.split('/');
    const lk = `resource/interface/text/mission/single/${camp}/${m}.lng`;
    if (v.files.has(lk)) { inc('lng', 'present'); const r = tree(read(lk)).kids[0]; if (r) for (const k of r.kids) inc('lngKeys', k.name); }
    else inc('lng', 'absent');
    const ck = `resource/interface/text/mission/single/${camp}/campaign.lng`;
    if (v.files.has(ck)) { const r = tree(read(ck)).kids[0]; if (r) inc('campaignLngKeys', r.kids.map(k => k.name).sort().join(',')); }
  }
  // the missions
  for (const k of mis) {
    const top = tree(read(k)).kids[0];
    if (!top) continue;
    inc('miTop', top.name);
    const ids = {}, tags = {};
    for (const s of new Set(top.kids.map(n => n.name))) inc('topBlocks', s);
    for (const n of top.kids) {
      if (n.name === 'Human' || n.name === 'Entity') {
        inc(n.name + 'Keys', sig(n));
        const p = n.kids.find(x => x.name === 'Player'); if (n.vals[1]) ids[n.vals[1].v] = p ? val(p) : '-';
      }
      if (n.name === 'Tags') { const vs = n.vals.map(x => x.v); tags[vs[vs.length - 1]] = vs.slice(0, -1); }
      if (n.name === 'Brain') inc('brainForm', n.kids.map(p => p.name + '{' + p.kids.map(x => x.name + ' ' + val(x)).join(';') + '}').join(''));
      if (n.name === 'Environment') inc('environment', val(n));
      if (n.name === 'Players') {
        inc('playersSig', sig(n));
        for (const f of n.kids) {
          if (f.name === 'user') inc('playersUser', val(f));
          if (f.name === 'alias') inc('playersAlias', val(f));
          if (f.name === 'diplomacy') inc('diplomacy', val(f));
        }
      }
      if (n.name === 'Fog') inc('fog', val(n));
      if (n.name === 'EntityManager') inc('entityManager', sig(n));
      if (n.name !== 'Helpers') continue;
      for (const h of new Set(n.kids.map(x => x.name))) inc('helpersBlocks', h);
      for (const h of n.kids) {
        if (h.name === 'event') inc('eventDecl', h.kids.length ? 'with fields' : 'name only');
        if (h.name === 'zone') inc('zoneSig', val(h) + ':' + sig(h));
        if (h.name === 'waypoints') { inc('waypointBlocks', val(h).replace(/\d+/g, '#') || '(unnamed)'); for (const w of h.kids) inc('waypointSig', sig(w)); }
        if (h.name === 'tasks') for (const t of h.kids) { inc('taskSig', sig(t)); for (const f of t.kids) if (f.name === 'state') inc('taskState', val(f)); if (/^"?\$\//.test(t.kids.find(f => f.name === 'desc') ? val(t.kids.find(f => f.name === 'desc')) : '')) inc('taskDesc', '$/key'); }
        if (h.name === 'cameras') for (const c of h.kids) { inc('cameraKeys', String(c.kids.length)); for (const key of c.kids) inc('cameraKeySig', sig(key)); }
        if (h.name === 'triggers') for (const tr of h.kids) {
          inc('triggerSig', sig(tr));
          for (const part of tr.kids) {
            if (part.name === 'condition') {
              inc('condSig', sig(part));
              for (const terms of part.kids.filter(x => x.name === 'terms')) for (const term of terms.kids) {
                const kind = term.name.replace(/^\d+\./, '');
                inc('termName', /^\d+\./.test(term.name) ? 'n.kind' : 'other');
                inc('term', kind); inc('termSig.' + kind, sig(term));
                if (kind === 'difficulty') term.kids.forEach(f => inc('difficultyLevel', val(f)));
                if (kind === 'task') inc('taskTermState', (term.kids.find(f => f.name === 'state') || { vals: [{ v: '(completed, default)' }] }).vals.map(x => x.v).join(' '));
                if (kind === 'entities') { const c = term.kids.find(f => f.name === 'count'); if (c) inc('countOp', (c.kids.find(f => f.name === 'op') || { vals: [] }).vals.map(x => x.v).join(' ')); }
              }
            }
            if (part.name === 'actions') {
              const each = a => {
                for (const c of a.kids) {
                  inc('cmd', c.name); inc('cmdSig.' + c.name, sig(c));
                  if (c.name === 'gameover') c.kids.forEach(f => inc('gameoverResult', f.name === 'result' ? val(f) : '(' + f.name + ')'));
                  if (c.name === 'task') inc('taskCmdState', (c.kids.find(f => f.name === 'state') || { vals: [{ v: '(show, default)' }] }).vals.map(x => x.v).join(' '));
                  if (c.name === 'timer') c.kids.forEach(f => f.name === 'time' && inc('timerTime', /:/.test(val(f)) ? 'm:s' : 'seconds'));
                  if (c.name === 'sound') c.kids.forEach(f => f.name === 'name' && /^mission\/task_/.test(val(f)) && inc('taskSound', val(f)));
                  if (c.name === 'event') c.kids.forEach(f => f.name === 'mode' && inc('eventMode', val(f)));
                  if (c.name === 'waypoint') { const w = c.kids.find(f => f.name === 'who'); if (w) inc('waypointWho', sig(w)); const ac = c.kids.find(f => f.name === 'action'); if (ac) inc('waypointAction', sig(ac)); }
                  if (STATEMENTS.has(c.name)) each(c);
                }
              };
              each(part);
            }
          }
          walk(tr, n => { if (n.name === 'selector' || n.name === 'vehicle' || n.name === 'actors') for (const f of n.kids) { inc('selectorKeys', f.name); if (f.name === 'state' && !f.kids.length) inc('selectorState', val(f)); } });
        }
      }
    }
    for (const [id, p] of Object.entries(ids)) {
      const tg = tags[id] || [];
      if (tg.includes('player')) inc('sideOfTag.player', p);
      if (tg.some(x => /^enemy/.test(x))) inc('sideOfTag.enemy*', p);
      if (tg.includes('hidden')) inc('hiddenTagged', 'yes');
    }
  }
  const sorted = o => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));
  const model = { tool: 'spmis', generated: new Date().toISOString().slice(0, 10), exe: v.exe, missions: mis.length, campaigns: camps.map(c => c.split('/').pop()), counts: {}, cmdSig: {}, termSig: {} };
  for (const [a, o] of Object.entries(C)) {
    if (a.startsWith('cmdSig.')) model.cmdSig[a.slice(7)] = sorted(o);
    else if (a.startsWith('termSig.')) model.termSig[a.slice(8)] = sorted(o);
    else model.counts[a] = sorted(o);
  }
  model.ms = Date.now() - t0;
  return model;
}
module.exports = { learn };
