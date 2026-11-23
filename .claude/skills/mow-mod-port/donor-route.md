# mow-mod-port: build a GoH unit on a vanilla donor

when: "which AS2 unit should carry this GoH model", "the converted def keeps crashing", "use a donor", "the tank loads but nobody can enter it".
G = AS2 install, H = GoH install, `<out>` = result mod folder. Donor = a vanilla AS2 def of the same class; the GoH model files hang under it, the game rules stay AS2.

## Steps
1. pick a donor: `node tools/donorpick/donorpick.js --goh <mod> --base <goh> --game G [--exe as64|mowas_2] --entity N [--json]` (agrees with hand picks 13 of 31 [I]: read its reasons, do not just take the first)
2. build with the donor: `node tools/goh2as2/goh2as2.js --goh <GoH dir> --entity <name> --donor D --out <dir> [--no-translate] [--ask-json] [--no-ask] [--dry-run] [--exe as64|mowas_2|mowas2]`
   speed, turn, mass, armour are translated from `tools/xlate/table.json`; it asks per case unless `--no-ask`
   place only the model under a kept donor def (static only): `node tools/clone-entity/clone-entity.js --model-from <GoH dir|stem> --goh <dir> --game dir --out <mod> --stuff "<base tags>" --tags <new.dot.tags> [--dry-run]`
3. fit the donor def to the GoH mdl: `node tools/donorfit/donorfit.js <def> [--mdl f] --game G [--exe as64|mowas_2] [--mods a,b] [--moddir D] [--fit] [--json]`
   checks bones, volumes, foresight, LinkBone, visor bones, doors, crew places against the mdl; `--fit` writes the repairs
4. size against class peers: `node tools/unitbox/unitbox.js <mod dir> --game G [--goh H] [--class c] [-o out.json]` (ok = inside peer min..max +10 percent)
5. will it fire: `node tools/firecheck/firecheck.js <def> [--exe as64|mowas_2] [--game G] [--json]` (aim bone, MG foresight swap, range; gates nothing, a hint)
6. lint + verdict → `repair-and-lint.md`; then the game
- GUI: GoH game tab > `goh` page, 2. Pick the donor (`goh/donors`, `goh/fit`)

## Facts; PORT-105..133
- the donor def must be the VANILLA def with only the `Extension` line ending `.mdl` replaced (PORT-129: older builds held the GoH def by mistake)
- keep the donor's weapon class: a gun swapped into another class keeps the donor's aim type, ammo and crew wiring and the place breaks (PORT-198)

## Per game
- as64: the proven target; mowas2: donor pool of MoW:AS2 only, nothing run yet [I]; goh: donorpick, donorfit refuse `--exe goh`

## Silently fails
- PORT-122 a donor def on a GoH mdl with different parts loads with no log line and the unit never becomes operable (crew macro, doors, bones)
- PORT-105 0 lint errors on a donor clone means the def parses, not that the bones fit
- PORT-133 a towed GoH gun whose mdl `basis` is a plain bone: 0 shots, no log line; vanilla has `{bone revolute "basis" {speed 0.01}}`
- PORT-132 a GoH car mdl under a vanilla car def may never damage its foe, no log line
- PORT-127 `{limits}` / `{speed}` under a def `{bone "x"}` whose mdl bone is plain: parser rejects, mission-load crash
- PORT-179 the armour rule gives a class peer value, which can exceed the real plate: check with armorsim (skill `mow-mod-vehicles`, `armour-layout.md`)

## Verify
- crew can board, the unit drives, the turret turns, the gun fires and kills, it can be killed: each seen in game, not from donorfit
