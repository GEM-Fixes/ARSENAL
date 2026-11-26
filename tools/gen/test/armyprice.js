// GEN-FIX2 #10: army price (units ext armyPrice, gen ctx) on every stock army of the real AS2 install, plan mode (nothing written).
// Old behaviour stopped with GEN_CARD_UNKNOWN storm_mech_<army> (card in squads.set), pz3m_ger2 (vehicles_ger2.set, s(ger)) and
// UNITS_NO_CARD how_a(<army>) (catalogue cardFile = the define in vehicles.set, priced call line in vehicles_<army>.set).
// Needs the game (AS2_GAME, gamedir, or the default install); prints "SKIP" and exits 0 without it. Reads the game only.
// usage: node armyprice.js <scratch dir>
// Author: Imperator_Aug (ARSENAL, ia-7d33fb21)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const TOOLS = path.resolve(__dirname, '..', '..');
const { installs } = require(path.join(TOOLS, 'modmove', 'lib', 'common'));
const game = installs({}).as2;
if (!game || !fs.existsSync(path.join(game, 'resource'))) { console.log('SKIP armyprice: no AS2 install'); process.exit(0); }
const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'gap-')));
const mod = path.join(W, 'ap-mod'), tmpRoot = path.join(W, 'ap-tmp');
fs.mkdirSync(mod, { recursive: true }); fs.mkdirSync(tmpRoot, { recursive: true });
const S = require(path.join(TOOLS, 'gui', 'ext', 'units', 'server.js'));
const STORE = require(path.join(TOOLS, 'lib', 'cachestore')).open({ root: path.join(tmpRoot, 'store') });   // a scratch store: nothing goes into the user's cache folder
const ctx = {
  cache: STORE,
  gamedir: game, tools: TOOLS, tmpRoot, allowLaunch: false, game: () => game,
  runTool: async (tool, entry, args, o) => {
    const r = require(path.join(TOOLS, 'lib', 'test', 'wait')).spawnSync(process.execPath, [path.join(TOOLS, entry), ...args], { encoding: 'utf8', timeout: Math.max((o && o.timeoutMs) || 0, 600000), maxBuffer: 1 << 28 }, 'gen armyprice ' + tool);
    return { code: r.status, stdout: r.stdout, stderr: r.stderr, timedOut: !!(r.error && r.error.code === 'ETIMEDOUT') };
  },
};
let fail = 0;
const ok = (name, cond, why) => { console.log((cond ? 'OK ' : 'FAIL ') + name + (cond ? '' : ': ' + why)); if (!cond) fail++; };
(async () => {
  const route = S.routes['POST /api/x/units/armyprice'];
  // the armies: every army of the catalogue with a priced buyable unit (built by the first call, cached in tmpRoot)
  const first = await route('', { army: 'rus', kind: 'all', percent: 10, mod }, ctx);
  const ED = path.join(STORE.root, 'e'), metaOf = d => { try { return JSON.parse(fs.readFileSync(path.join(ED, d, 'meta.json'), 'utf8')); } catch (e) { return {}; } };   // the catalogue lives in the shared store now (section units.catalogue)
  const cat = fs.readdirSync(ED).filter(d => metaOf(d).section === 'units.catalogue').map(d => JSON.parse(fs.readFileSync(path.join(ED, d, 'value.json'), 'utf8'))).find(j => j.units && j.units.length);
  const armies = [...new Set(cat.units.filter(u => u.buyable && u.cost != null).map(u => String(u.army).toLowerCase()))].sort();
  ok('stock armies found', armies.length >= 6 && armies.includes('rus') && armies.includes('ger2'), armies.join(' '));
  for (const army of armies) {
    const r = army === 'rus' ? first : await route('', { army, kind: 'all', percent: 10, mod }, ctx);
    ok(`armyprice ${army}: no errors`, !r.errors.length, JSON.stringify(r.errors.slice(0, 3)));
    ok(`armyprice ${army}: no card skipped`, !(r.skipped || []).length, (r.skipped || []).join(' '));
    ok(`armyprice ${army}: rows, nothing written`, r.count > 20 && r.written === false, r.count + ' ' + r.written);
    const ids = r.rows.map(x => x.id);
    if (army === 'rus') ok('rus: storm_mech_rus and how_a(rus) priced', ids.includes('storm_mech_rus') && ids.includes('how_a(rus)'), ids.join(' '));
    if (army === 'ger') ok('ger: pz3m_ger2 priced', ids.includes('pz3m_ger2'), ids.join(' '));
  }
  ok('plan wrote nothing in the mod', fs.readdirSync(mod).length === 0, fs.readdirSync(mod).join(' '));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL armyprice threw: ' + (e.stack || e.message)); process.exit(1); });
