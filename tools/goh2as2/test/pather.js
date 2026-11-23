// T-PATHER SEED test: a GoH def with an unknown PatherID gets an as64 profile + a gap entry (baked, PATHER_MAP); a known name is kept;
// a name with no class match is left and listed as hand. Table sanity: every target is a vanilla AS2 profile. run via run.sh.
// Author: Imperator_Aug (ARSENAL, ia-8a7d881b)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const tool = path.join(__dirname, '..', 'goh2as2.js');
let fail = 0;
const t = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + 'pather: ' + name + (good || extra === undefined ? '' : '  ' + String(extra).slice(0, 500))); if (!good) fail++; };
const env = { ...process.env, AS2_NO_STEAM: '1', AS2_GAME: '' };
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'pather-'));
const w = (rel, s) => { const p = path.join(W, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s.replace(/\r?\n/g, '\r\n')); };
const unit = (dir, name, pid) => { w(`goh/resource/entity/-vehicle/${dir}/${name}/${name}.def`, `{game_entity\n  {Extension "${name}.mdl"}\n  {PatherId "${pid}"}\n}\n`); w(`goh/resource/entity/-vehicle/${dir}/${name}/${name}.mdl`, '{model "x"}\n'); };
unit('germany/tank_medium', 'sp4', 'panzer4');   // GoH-only name, in table -> tank
unit('germany/tank_medium', 'sp5', 'tank');      // known: kept
unit('germany/car', 'sp6', 'kubel');             // GoH-only, in table -> vehicle.small
unit('germany/tank_light', 'sp7', 'zzz_new');    // not in table: folder class tank.light
unit('misc/odd', 'sp8', 'zzz_new');              // nothing matches -> hand
const AS2 = new Set('human human_flying animal tank tank.light amphibia armored vehicle.large vehicle.small moto cannon.large cannon.small cannon.carried cannon.micro airborne railway shallow_water shallow_water_0 water deep_water deep_water_0'.split(' '));
const res = {};
for (const u of ['sp4', 'sp5', 'sp6', 'sp7', 'sp8']) {
  const out = path.join(W, 'o', u);
  const r = cp.spawnSync(process.execPath, [tool, '--goh', path.join(W, 'goh'), '--entity', u, '--out', out, '--no-keylint', '--no-rc', '-q', '--no-game'], { encoding: 'utf8', env });
  const f = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : f.push(path.join(d, e.name)); })(out);
  const def = f.find(x => x.endsWith(u + '.def') && !x.includes('gaps'));
  const gp = f.find(x => x.endsWith(u + '.gaps.json'));
  res[u] = { status: r.status, text: def ? fs.readFileSync(def, 'latin1') : '', gaps: gp ? JSON.parse(fs.readFileSync(gp, 'utf8')).gaps : [], stdout: r.stdout + r.stderr };
}
const pid = u => ((/\{PatherI[dD]\s+"([^"]+)"/i).exec(res[u].text) || [])[1];
const pm = u => res[u].gaps.filter(g => g.code === 'PATHER_MAP');
t('unknown GoH name panzer4 -> tank', pid('sp4') === 'tank', res.sp4.text + res.sp4.stdout);
t('  gap entry baked PATHER_MAP with a reason', pm('sp4').length === 1 && pm('sp4')[0].kind === 'baked' && /panzer4/.test(pm('sp4')[0].reason) && /tank/.test(pm('sp4')[0].reason), JSON.stringify(res.sp4.gaps));
t('known name tank kept, no gap entry', pid('sp5') === 'tank' && pm('sp5').length === 0, res.sp5.text + JSON.stringify(res.sp5.gaps));
t('kubel -> vehicle.small', pid('sp6') === 'vehicle.small' && pm('sp6').length === 1, res.sp6.text);
t('unknown name in tank_light folder -> tank.light by folder class', pid('sp7') === 'tank.light' && pm('sp7').length === 1 && pm('sp7')[0].kind === 'baked', res.sp7.text);
t('no class match: name left, gap kind hand, no pather.set written', pid('sp8') === 'zzz_new' && pm('sp8').length === 1 && pm('sp8')[0].kind === 'hand', JSON.stringify(res.sp8.gaps));
// table sanity: parse the table out of the tool source, every target must be an AS2 profile
const src = fs.readFileSync(tool, 'latin1');
const tb = src.slice(src.indexOf('const PATHER_TABLE'), src.indexOf('const patherMap'));
const targets = [...tb.matchAll(/\],?\s*'([a-z_.0-9]+)',|\/,\s*'([a-z_.0-9]+)',/g)].map(m => m[1] || m[2]);
const bad = [...tb.matchAll(/\/,\s*'([^']+)',\s*'/g)].map(m => m[1]).filter(x => !AS2.has(x));
t('table targets all vanilla AS2 profiles', targets.length >= 10 && !bad.length, bad.join(','));
try { fs.rmSync(W, { recursive: true, force: true }); } catch {}
process.exit(fail ? 1 : 0);
