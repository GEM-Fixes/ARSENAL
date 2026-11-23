// writes REPORT.json (portRows curated from a real-data run of portdiff.js on AS2 vs GoH)
// Author: Imperator_Aug (ARSENAL, ia-aadcfaa6)
const fs = require('fs'), path = require('path');
const R = (id, subject, limit, effect, goh, as2) => ({ row: `PORT-${id} | ${subject} | ${limit} | ${effect} | [I] portdiff`, goh, as2 });
const portRows = [
  R(18, 'GoH def `perks{component{health{hp,hp_broken}}}` + `armor_damage_modifier`', 'GoH-only block in 22k defs; no AS2 key', 'drop on conversion (AS2 health comes from other keys)', '-vehicle/eng/airborne/blenheim_mk1_eng/blenheim_mk1_eng.def', 'none'),
  R(19, 'GoH `armor/setting/threshold/{pierce,blast}/koef`', 'AS2 uses `armor/setting/durability/{pierce,blast}{value,koef}` + `threshold/pierce{calibre}`', 'restructure armor setting; koef alone has no AS2 slot under threshold', '-vehicle/finland/tank_light/bt5_fin/bt5_fin_mid.def', 'construction/africa/decor/afric_bench/afric_bench.def (durability block)'),
  R(20, 'GoH ext `volume/thickness{top,front,bottom,rear,left,right}` + `volume{caststeel,highhardness,material,quality}`', 'AS2 only has `armor/setting{thickness}` per setting', 'per-face thickness and material keys have no AS2 slot (see PORT-01, 05, 06)', '-vehicle/eng/btr/aec_mk1/aec_mk1.ext', 'none (armor/setting thickness)'),
  R(21, 'GoH volume `able{nolook,hole,holed,nowounddecal,blockcamera}` and `contact` as bare flag', 'no AS2 key; AS2 `contact` takes a value', 'unknown keys ignored or flagged by keylint; drop', '-vehicle/finland/tank_light/bt5_fin/bt5_fin_mid.def', 'none'),
  R(22, 'GoH locomotion `turnradius,starttime,braketime,stoptime,turntime,turnstart,turnstop,maxspeedatmaxturn` hold arithmetic `(expr)`', 'AS2 vanilla uses literals (~800 defs differ)', 'evaluate to literal before writing; keep unit conventions (see PORT-11, 12)', '-vehicle/eng/tank_medium/sherman3_late/sherman3_late.def', 'any AS2 vanilla vehicle def'),
  R(23, 'GoH anim `sequence{events{#n ...}}` (mdl and ext)', 'frame-events block GoH-only (1552 mdl blocks)', 'drop; AS2 mdl has `sequence{file,store}` only', '-vehicle/eng/marine/x/goatley_boat_x/goatley_boat_x.mdl', 'none (AS2 sequence file/store)'),
  R(24, 'GoH `.mtl` flat keys `lightmap,full_specular,specular_intensity,gloss_scale,translucency,glow,environment`', 'AS2 uses `material/layer{diffuse,bump,color,parallax_scale}` instead', 'map diffuse/bump into one layer; PBR-like keys dropped', '-vehicle/eng/airborne/blenheim_mk1_eng/base.mtl', 'construction/africa/decor/afric_bench/afr_bench.mtl'),
  R(25, 'GoH `.ammo` `from/damage{ground_interaction_radius}`, `possibledamageradius`, `bullet/cumulative`, `bullet/trace/view{scalex}`', 'GoH-only; AS2 has `applyprojectile`', 'drop GoH-only keys; add applyprojectile by hand', 'set/stuff/bazooka/bazooka.heat.ammo', 'set/stuff/ammo/flaer.ammo'),
  R(26, 'GoH `.weapon`/`.pattern` `from/{calibre,minrange,burst,parameters{projectiledamagetable,rechargetime,overmatchslope}}`, `overmatchcalibre`', 'AS2 `weapon_bullet/{gravity,rechargetime,spreading,aimtype}`; `spreading` is a block in GoH (radiustable), scalar-led in AS2', 'rewrite weapon block layout (see PORT-02, 07, 09)', 'set/stuff/bazooka/bazooka_m1.weapon', 'set/stuff/bazooka/bazooka.weapon (AS2 pak)'),
  R(27, 'GoH `.mine` root `from{entity,mass,damage{energy,area,ground_interaction_radius},inventory}`', 'AS2 `.mine` root `item{damage{energy,area}}`', 'rename from->item, drop entity/mass/inventory', 'set/stuff/explosive/ap_shrapnel_mk1.mine', 'set/stuff/explosive/antipersonnel.mine'),
  R(28, 'GoH `.mi` mission data `human/volume/able{...}`, `waypoints/*/commands/*/action` as block, `tag_add/tag_remove` as string, `extender:stuff item` S T I', 'AS2 `.mi`: action scalar, tag idents, item variants ST/STSI/SST', 'mission files need per-key conversion; not mechanical', 'map/multi/dcg_kymhi_airfield/campaign_capture_the_flag.mi', 'map/multi/1v1_argentan/battle_zones.mi'),
  R(29, 'GoH interaction_entity.set `call_synced`, `delay_ex`, `tear{spawn,call}`, `play_sound`, `talk`, `add_view`', 'AS2 has `weapon_work`, `stunned`, `ik_enable`, `impulse`; `if` arity differs (TX vs TF/TS)', 'interaction scripts cannot be copied; rewrite per entity', 'set/interaction_entity.set (GoH pak)', 'set/interaction_entity.set (AS2 pak)'),
  R(30, 'GoH vision.set `rules` names `vehicle_NN`, `plane_NN`, `marine_NN`, `human/firing/firing_<gun>`', 'AS2 names `human/firing/<gun>`, `human/still`; GoH values are `(expr)` vs float', 'rename keys to AS2 form; unknown rules are silent', 'set/vision.set (GoH)', 'set/vision.set (AS2)'),
  R(31, 'GoH-only file kinds `.materials`(288) `.omask`(155) `.bzc`(25) `.dso/.hso/.cso` shader cache, layout web files (`.html .js .css`)', 'no AS2 loader', 'omit from converted mod; maps need `.materials` rework', 'map/multi/dcg_kymhi_airfield/.materials', 'none'),
  R(32, 'GoH `{##place ...}` double-hash tag blocks (173 files)', 'AS2 lexer flags TAG_SWALLOWS (tag text after first `#`)', 'rewrite `{##x` to plain block or `{#x` before use', '-vehicle/eng/tank_medium/sherman3_late/sherman3_late.def:92', 'none'),
  R(33, 'GoH-only data kinds `set/dynamic_campaign`(572 keys), `difficulties/*.dl`, `layout.set`, `profiles.set`, `scene.fx/.set`', 'no AS2 equivalent kind (AS2 `set/difficulty/*.dl` 32 keys vs 39)', 'skip; difficulty keys partly map', 'set/dynamic_campaign/map_points.set', 'set/difficulty/easy.dl'),
];
const out = {
  tool: 'portdiff', rows: [],
  files: ['tools/portdiff/portdiff.js', 'tools/portdiff/mkreport.js', 'tools/portdiff/.gitignore', 'tools/portdiff/test/run.sh', 'tools/portdiff/test/mkfixture.js', 'tools/portdiff/test/truth.md', 'tools/INDEX.md'],
  tests: 'PASS',
  real: [{ data: 'AS2 vs GoH full (cold)', counts: { parseFailFilesAS2: 6, parseFailFilesGoH: 182 }, ms: 97587 }, { data: 'AS2 vs GoH warm cache', counts: {}, ms: 1225 }],
  timings: { coldMs: 97587, warmMs: 1225, as2Parse: '47770 root files 14 s', gohParse: '76785 root files 83 s' },
  indexLine: 'portdiff  | node tools/portdiff/portdiff.js --as2 <gameDir> --goh <gameDir> [--kinds a,b] [--sample N] [--min N] [--top N] [--json out] [--no-cache] [-q] | todo #7 / PORT seeds | GoH vs AS2 text-asset diff: both resource/ trees (paks via lib/pakset + loose), sdlx parse with in-game include resolution, keylint learn.visit key-path tally per kind; reports keys only in GoH/AS2, value-shape diffs (I/F/X folded), scalar-vs-block diffs, GoH-only file extensions, parse failures; cold 98 s (GoH 77k files), warm 1.2 s (tools/portdiff/cache). All codes WARN_ (unverified diff hints); test = fixture truth.md',
  portRows,
  specIssues: [],
  libGaps: ['no lib helper walking pakset + loose files together (portdiff collect())'],
  tags: {},
  notes: 'GoH sdlx parse fails 182 -> 9 after {##ident -> {ident text rewrite (shared goh2as2.fixHashTags; {##+ parses as-is); findings 815 -> 815; MOD_NAME x5; X (arith expr) folded with I/F in shape diff. PORT-18..33 are [I] seeds, not checked against engine src.',
};
fs.writeFileSync(path.join(__dirname, 'REPORT.json'), JSON.stringify(out, null, 1));
const idx = path.join(__dirname, '..', 'INDEX.md');
let s = fs.readFileSync(idx, 'utf8');
if (!fs.existsSync(path.join(__dirname, '..', 'index')) && !/^portdiff /m.test(s)) fs.appendFileSync(idx, (s.endsWith('\n') ? '' : '\n') + out.indexLine + '\n');
