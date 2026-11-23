#!/usr/bin/env node
// wpn check: static aim-bone checks (no game). rows PORT-178 PORT-180.
//   node tools/wpn/check.js <gameDir|-> [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [--folder DIR] [--all] [-q] [--summary] [--format text|json|sarif|csv|html] [--rc FILE|--no-rc]
//   --exe: the game whose file set is mounted (lib/games; none = the vfs rule, as64 first when as64.exe is in the folder). mowas_2: no as64/core.
//     goh: the GoH install (gameDir may be left out: lib/games install('goh')); same stuff layout and {from} chain (resource/set/stuff/<cls>/<name>,
//     <cls>.pattern [I], vanilla read); the shot bone is still {foresight}: the place key {AimBone} is the aimer bone solved by the chain, not the
//     shot bone (GHKEY-05 [I]); no foresight -> game.log warning "attempted without a shooterBone", aim query answers 0 (GHLOG-03 [I])
//   WARN_GUN_NO_FORESIGHT       (PORT-180) a set/stuff/gun/ template whose {from} chain has no {foresight}: the gun turns and never fires
//   WARN_PLACE_NO_FORESIGHT     (PORT-178) a weapon {place} with no {foresight} whose weapon template chain has none either: no aim bone
//   rule: bone = the place's {foresight}, else the weapon template's; none found -> bone null [V, effect I/T]
//   a template's chain = itself + {from "..."} parents, `pattern <cls>` included (pattern gun gives foresight1). Files of the base game layer give info, not findings
//   (vanilla 37mm_hori and 37mm_m5 have none: the rows name them). --mods: only files of those mods are checked; --folder DIR overlays DIR/resource (build stage)
// Author: CHK-MIXA (2h batch)
// Author: Imperator_Aug (ARSENAL, ia-13e6303f)
require('../lib/help')(__filename);
const fs = require('fs'), path = require('path');
const { build, readRec, closeRecs } = require('../lib/vfs'), names = require('../lib/names'), { createReport } = require('../lib/report'), cli = require('../lib/cli');
const sdl = require('../lib/sdl');

const lc = s => String(s).toLowerCase();
const isBase = l => !l || l === 'base' || /^patch \d+$/.test(l);
const text = rec => readRec(rec).toString('latin1');
const tree = t => sdl.parseLines(t.split(/\r?\n/), () => {});

function stuffIndex(files) {
  const m = new Map();
  for (const k of files.keys()) {
    const p = k.split('/'); if (p[0] !== 'resource' || p[1] !== 'set' || p[2] !== 'stuff' || p.length < 4 || p.length > 5) continue;
    const last = p[p.length - 1];
    if (last.endsWith('.pattern')) { m.set('pattern ' + lc(last.slice(0, -8)), k); continue; }   // stuff/bullet.pattern or stuff/<cls>/<cls>.pattern
    if (p.length === 5 && (!last.includes('.') || last.endsWith('.weapon'))) m.set(lc(last.replace(/\.weapon$/, '')), k);
  }
  return m;
}
// does the {from} chain of template `key` carry a {foresight}? (own file first, 8 parents at most)
function chainSight(files, sidx, key, memo) {
  if (memo.has(key)) return memo.get(key);
  let has = false;
  for (let k = key, i = 0; k && i < 8 && !has; i++) {
    const txt = text(files.get(k)), root = tree(txt).kids[0];
    if (!root) break;
    if (sdl.kids(root, 'foresight').length) { has = true; break; }
    const fr = lc(root.name || '') === 'from' ? root : sdl.kids(root, 'from')[0];   // `{from "pattern gun" ...}` is the file's root block itself
    k = fr && fr.vals[0] ? sidx.get(lc(fr.vals[0].v.replace(/^weapon\s+/i, ''))) : null;
  }
  memo.set(key, has);
  return has;
}

function main() {
  const p = cli.parse(process.argv.slice(2), { flags: ['--all'], values: ['--folder'] });
  if (!p.pos.length && !p.x.folder && !p.exe) { console.error('usage: node tools/wpn/check.js <gameDir|-> [--exe as64|mowas_2|goh] [--mods a,b] [--folder DIR] [--all] [-q] [--summary]'); process.exit(2); }
  const goh = p.exe === 'goh';
  // no positional with --exe: the install of that game (goh: the GoH install; as64/mowas_2: the AS2 install)
  const gameDir = p.pos[0] ? (p.pos[0] !== '-' ? p.pos[0] : null) : (p.exe ? (p.gameDir || require('../lib/games').install(p.exe).dir) : null);   // --game wins for every game (cli.parse already falls back to the GoH install under --exe goh)
  if (!p.pos[0] && p.exe && !gameDir && !p.x.folder) { console.error(`wpn-check: no ${goh ? 'GoH' : 'AS2'} install found (give the folder)`); process.exit(2); }
  const bo = { gameDir, mods: p.mods.length ? p.mods : null }; if (p.exe) bo.exe = p.exe;
  const v = gameDir ? build(bo) : { files: new Map(), mods: [] };
  if (p.x.folder) {
    const root = path.resolve(p.x.folder);
    const walk = (d, vr) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const q = path.join(d, e.name), nm = names.normalize(e.name);
      if (e.isDirectory()) walk(q, vr + nm + '/');
      else v.files.set(vr + nm, { source: 'loose', container: root.replace(/\\/g, '/'), entry: path.relative(root, q).replace(/\\/g, '/'), layer: 'folder', size: fs.statSync(q).size });
    } };
    walk(path.join(root, 'resource'), 'resource/');
  }
  const modIds = new Set(v.mods || []), layerMod = l => String(l).replace(/ patch \d+$/, '');
  const selected = r => p.x.folder ? r.layer === 'folder' : p.x.all || !modIds.size || modIds.has(layerMod(r.layer));
  const rep = createReport();
  const emit = (rec, key, line, code, msg) => (isBase(rec.layer) ? rep.info : rep.add).call(rep, key, line, code, msg);
  const files = v.files, sidx = stuffIndex(files), memo = new Map();
  const keys = [...files.keys()].sort();
  // PORT-180: gun templates
  for (const [name, key] of [...sidx].sort((a, b) => a[1] < b[1] ? -1 : 1)) {
    if (name.startsWith('pattern ') || key.split('/')[3] !== 'gun') continue;
    const rec = files.get(key); if (!selected(rec)) continue;
    if (!chainSight(files, sidx, key, memo)) emit(rec, key, 1, 'WARN_GUN_NO_FORESIGHT', goh
      ? `gun template "${name}": no {foresight} in it or in its {from} chain, so a weapon place that names none has no shooter bone: GoH logs "attempted  without a shooterBone" and the aim query answers 0 (GHLOG-03); a place {AimBone} does not stand in for it (GHKEY-05); add {foresight "foresight1"} to the template [I]`
      : `gun template "${name}": no {foresight} in it or in its {from} chain, so a weapon place that names none leaves it with no aim bone and the gun turns but never fires; add {foresight "foresight1"} to the template (PORT-180) [T]`);
  }
  // PORT-178: weapon places
  for (const key of keys) {
    if (!/^resource\/entity\/.*\.(def|ext|inc)$/.test(key)) continue;
    const rec = files.get(key); if (!selected(rec)) continue;
    const root = tree(text(rec));
    const walk = n => {
      if (lc(n.name || '') === 'place' && !sdl.kids(n, 'foresight').length) {
        for (const w of sdl.kids(n, 'weapon')) {
          const wn = w.vals[0] && lc(w.vals[0].v.replace(/^weapon\s+/i, '')), tk = wn && sidx.get(wn);
          // gun class only: vanilla rocket-artillery templates (wurfrahmen, katusha) have none and work, so other classes stay unchecked [I]
          if (tk && tk.split('/')[3] === 'gun' && !chainSight(files, sidx, tk, memo)) emit(rec, key, n.line, 'WARN_PLACE_NO_FORESIGHT', goh
            ? `weapon place "${n.vals[0] ? n.vals[0].v : ''}" has no {foresight} and its weapon "${wn}" has none on its template chain: no shooter bone, GoH logs "attempted  without a shooterBone" and the aim query answers 0 (GHLOG-03)${sdl.kids(n, 'aimbone').length ? '; its {AimBone} is the aimer bone only, not the shot bone (GHKEY-05)' : ''}; write {foresight "foresight1"} in the place or pick a template that has one [I]`
            : `weapon place "${n.vals[0] ? n.vals[0].v : ''}" has no {foresight} and its weapon "${wn}" has none on its template chain: no aim bone, the unit gets no aim on its foe; write {foresight "foresight1"} in the place or pick a template that has one (PORT-178) [T]`);
        }
      }
      for (const c of n.kids) walk(c);
    };
    walk(root);
  }
  closeRecs();
  cli.printReport(rep, p, { tool: 'wpn-check' });
}
if (require.main === module) cli.run(main);
