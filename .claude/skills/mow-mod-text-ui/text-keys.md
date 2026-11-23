# mow-mod-text-ui: which key serves which screen

When: a new unit, squad, soldier, weapon or panel button needs its texts; "what texts does a new unit need"; "no i button on my card".
Facts: and ui/overview, [V] unless tagged.

## Names
- unit name lookup order: registry `units/<name>/desc` (`set/registry/unit.reg`, names a text key) → `desc/human/<breed>` (soldiers) → `desc/entity/<model>` → squad cards `desc/squad/<name>`
- vehicle / gun: `desc/entity/<def base name>`; also the vehicle buy card. card id different from the def name → add `desc/entity/<card>` too
- squad card: `desc/squad/<name>(<side>)`. cards made by vehicle-like macros (`how` kind) have a BARE name: key without `(side)` (lim LOC-13)
- soldier: `desc/human/mp/<side>/<breed>`; `_vision` / `_assist` breed variants are separate keys
- weapon, ammo, item: `desc/<ammo|weapon|stuff>/<tags>`: tags = the stuff tags minus `grenade pattern ammo weapon`, in stuff tag order, space-joined; a stuff `Desc` field replaces the key (lim LOC-15)
- weapon class label in the vehicle weapon panel: `desc/weapon/type/<type>`
- weapon stat lines are plain text: `\n` + colour tags per line

## Tooltips and info
- `info/entity/<name>`, `info/squad/<name>`: long text behind the "i" button. card `{info X}` redirects to key X
- "i" button: vehicle / gun card when the key exists OR the engine has auto tech info; squad card ONLY when `info/squad/<name>` exists (lim LOC-11)
- `info/special/<model>`: short class label; `info/armor_angle/<model>/<volume>`: armour angle text in the tech view
- damage texts `component/*` in `#dlg_ingame.lng`; `{damage_report "part" "text"}`: a key is translated, other text is printed as written (lim LOC-12)

## Interface texts the code asks for
- panel button hint `actionbar/<button stem>` (+ `/req` `/action` `/usage`), `actionbar/count_black`, `actionbar/key_hint`
- buy panel: `mp/scene/hint_<button tag>`, `mp/scene/hint_cost/<budget>`, `mp/scene/hint_cost2/<budget>`, `mp/scene/hint_level`, `mp/scene/hint_time`
- options: `options/keys/<action id>`, `options/keys/keymap/<KEYNAME>`
- maps and missions: `mission/multi/<mapdir>/name` (+ `desc`), `mission/single/<campaign>/<mission>/...`

## Steps
1. list what a mod lacks: MCP `mow_mod_check` (`mod`, `only: "loccover"`)
   CLI `node tools/loccover/loccover.js <mod> [--game G] [--exe as64|mowas_2|mowas2|goh] [--summary]`
   codes: LOC_NAME_MISSING, LOC_INFO_MISSING, LOC_HOW_SIDEKEY, LOC_DAMAGE_KEY, LOC_STUFF_KEY_ORDER, WARN_STUFF_KEY_MISMATCH
2. see how the game words a neighbour key: MCP `mow_text_find` (`key: "desc/squad/"`)
3. add the keys: MCP `mow_text_set` (`mod`, `key`, `text`) for new keys; a key the game already has needs `mow_mod_gen` op `text` (lim LOC-19)
   CLI `node tools/lng-add/lng-add.js <mod> --file "#x.lng" --key k --text "t"`
GUI: Units page shows a unit's name; Check page runs loccover

## Per game
| | as64 | mowas2 | goh |
|---|---|---|---|
| key forms above | yes | yes | card checks run the same; the stuff key rule is not known for GoH (loccover skips it, info LOC_GOH_STUFF) |
| count badge key | `actionbar/count_black` | same | `actionbar/count_white` (GHUI-73) |
| buy tooltip keys | `mp/scene/hint_time` | same | `hint_available`, `hint_time2`, `hint_requires/<condition>` (GHLOC-16) |
| category tooltip | `mp/scene/hint_<tag>` | same | `mp/scene/unit_spawn/<type>` (guide 15; not run in game) |

## Silent fails
- LOC-02 no key = raw key on screen, no log (GoH logs `Missing text: [key]`, GHLOC-02)
- LOC-11 squad card with no `info/squad/..` = no "i" button
- LOC-13 bare-named card with only the `name(side)` key = raw text
- LOC-15 tags in another order than the stuff file = raw key
- LOC-12 a mistyped `damage_report` key is printed raw

## Verify
- loccover clean for the mod's cards; then buy panel hover, info window and weapon panel in game (→ skill `mow-mod-test`)

Depth: · guide 14-localization
