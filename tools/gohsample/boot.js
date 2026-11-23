// gohsample boot: bisect the part B files that parse at game boot (set/stuff/**, set/*.set; load points in partB.js) to find a crasher.
// A preload list cannot catch these: they are read at engine data load, before any match. Nothing is launched or installed here.
//   gohsample boot --out D                      init (or print the current step): writes D/boot_active (a mod holding only the files under test) + D/boot-state.json
//   gohsample boot --out D --result clean|crash the game booted fine / died while loading: advance the bisect
// state: untested[] (rest), suspect[] (known to hold >= 1 crasher), testing[], clean[], crashers[]. One crasher costs about log2(n)+1 boots.
// A crash that repeats a known cause (same Exception text) is a reason to stop: drop that cause's files, do not bisect it twice (RUN.md).
// Author: Imperator_Aug (ARSENAL, ia-e7d61560)
const fs = require('fs'), path = require('path');
const C = require('./common');
const { MOD_B } = require('./build');

const BOOT = f => /^BOOT_/.test(f.loadKind) && f.status === 'converted';

function writeActive(out, st, tg) {
  const act = path.join(out, 'boot_active');
  fs.rmSync(act, { recursive: true, force: true });
  C.writeCp1251(path.join(act, 'mod.info'), `{Mod\n {Name "${MOD_B}"}\n {Desc "LOCAL ONLY - boot bisect step ${st.step}"}\n${tg.modInfo.join('\n')}\n}\n`);
  for (const k of st.testing) { const dst = path.join(act, 'resource', k); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(path.join(out, 'mod_b', 'resource', k), dst); }
}

// pure transition (tested): returns the next state
function advance(st, result) {
  const T = st.testing, rest = st.untested.slice(), sus = st.suspect.slice();
  const s = Object.assign({}, st, { clean: st.clean.slice(), crashers: st.crashers.slice(), history: st.history.concat([{ step: st.step, n: T.length, result }]) });
  if (result === 'clean') {
    s.clean.push(...T);
    if (sus.length) { s.suspect = sus.filter(k => !T.includes(k)); s.untested = rest; if (s.suspect.length === 1) { s.crashers.push(s.suspect[0]); s.suspect = []; } }
    else { s.untested = []; s.suspect = []; }
  } else {
    if (T.length === 1) { s.crashers.push(T[0]); s.suspect = sus.filter(k => k !== T[0]); s.untested = rest.filter(k => k !== T[0]); if (s.suspect.length) { s.untested.push(...s.suspect); s.suspect = []; } }
    else if (sus.length) { s.untested = rest.concat(sus.filter(k => !T.includes(k))); s.suspect = T; }
    else { s.suspect = T; s.untested = []; }
  }
  s.step = st.step + 1;
  s.testing = s.suspect.length ? s.suspect.slice(0, Math.ceil(s.suspect.length / 2)) : s.untested.slice();
  if (!s.testing.length) { s.done = true; s.untested = []; }
  return s;
}

function boot(o) {
  const out = path.resolve(o.out), sf = path.join(out, 'boot-state.json');
  C.guardOut(out, o.goh, o.as2);
  const log = console.log;
  // game parity: --exe, else the exe the plan recorded (<out>/sample.json meta.exe), else as64 as before
  let pl = null; try { pl = C.readJson(path.join(out, 'sample.json')); } catch { pl = null; }
  const tg = C.target(o, pl);
  let st;
  if (fs.existsSync(sf)) st = C.readJson(sf);
  else {
    const b = C.readJson(o.build || path.join(out, 'build.json')), files = ((b.partB && b.partB.files) || []).filter(BOOT).map(f => f.key);
    if (!files.length) { log('boot: no converted boot-loaded part B files'); return null; }
    st = { notice: C.NOTICE, step: 1, all: files, untested: [], suspect: [], testing: files.slice(), clean: [], crashers: [], history: [], done: false };
  }
  if (o.result) {
    if (!['clean', 'crash'].includes(o.result)) C.die('--result clean|crash');
    if (st.done) { log('boot: already done'); }
    else st = advance(st, o.result);
  }
  C.writeJson(sf, st);
  if (!st.done) writeActive(out, st, tg);
  log(`boot step ${st.step}: ${st.done ? 'DONE' : st.testing.length + ' file(s) under test'}; clean ${st.clean.length}, crashers ${st.crashers.length}, untested ${st.untested.length}, suspect ${st.suspect.length}`);
  if (st.done) log('crashers: ' + (st.crashers.join(', ') || 'none') + '\nnext: gohsample compare ... --boot-state ' + sf);
  else log(`copy ${C.fwd(path.join(out, 'boot_active'))} over <game>/mods/${MOD_B}, boot ${tg.named ? tg.file : 'the game'} with mods '${tg.mods.concat([MOD_B]).join(',')}' (menu is enough), then: gohsample boot --out ${C.fwd(out)} --result clean|crash   [stop when crashes repeat a known cause]`);
  return st;
}

module.exports = { boot, advance };
