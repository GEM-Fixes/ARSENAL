# Reference 5: Humans: Breed, Abilities, Inventory

This page lists every key that makes a soldier what he is: the breed file that dresses and equips him, the ability
blocks behind his perks and weapon skills, veterancy ranks, the health and stamina block, the inventory holders, melee
blows and the stance machine that drives his animations. [Chapter 8](08-infantry-and-humans.md) explains how these pieces work together
([Infantry and humans](08-infantry-and-humans.md)); this page gives the facts for each key.

How to read an entry. "Where" names the file kind and the block the key is written in. "Type" gives the kind of value
and its unit. "Values" gives what the game accepts and, when it is known, the value used when the key is absent.
"Limits" lists what fails silently, crashes or is ignored. Keys are not case-sensitive unless an entry says otherwise.
Where the same key name appears in two blocks, the heading adds the block in brackets.

A few words used throughout:

- A breed is a soldier template: one file under `set/breed/` that says which skin, portrait, perks and kit a soldier
  starts with. The breed name is the file name without its folder, and subfolders are allowed.
- An ability is a named block under `set/ability/` that changes one thing about a soldier, such as health or rifle
  accuracy. A breed switches abilities on through its `{perks}` list, and a perk picks one level of the ability.
- An extender is a block in a class `.ext` file (here `properties/human.ext`) that gives every soldier the same
  machinery, such as health or inventory. A unit `.def` can override parts of it.
- Tags are the words in quotes that describe a piece of stuff (`"rifle"`, `"ammo"`, `"bandage"`). Many keys below pick
  items by tags: an item matches when it carries all the listed tags.

Work in your own mod folder. Text data files use CRLF line endings, string values are read as UTF-8, identifiers are
ASCII, and old cp1251 bytes in vanilla `;` comments should be kept as they are.

The quick way: in the ARSENAL window the Quick Guided Task "make a soldier" or "change a soldier" writes most breed keys
of this page from plain questions, in groups such as "Weapons and kit", "Health and stamina", "Weapon skills" and
"Special skills", and "make a squad" puts soldiers into a squad (see
[Use the Quick Guided Task](p17-quick-guided-task.md)). This page tells you what each answer does.

Gates of Hell (GoH) reads many of these keys too, sometimes in another way. An entry that GoH treats differently has a
line that starts "Gates of Hell:"; keys that only GoH has are listed at the end, under
[Gates of Hell only](#gates-of-hell-only).

## Breed files

A breed file holds one `{breed ...}` block. The game reads its keys in this order, but the order in the file does not
matter.

### breed

Where: `set/breed/<side>/<name>` (subfolders allowed); the whole file.    Type: block.

Values: the keys on this section of the page. The breed name used everywhere else is the file name.

Does: defines one soldier template that unit `.def` files, missions and the purchase lists refer to by name.

Limits: a unit that names a breed the game does not know logs the warning `Unknown breed "x"` and the soldier gets the
skin `skeleton`.

<!-- goh: GHHUM-24 GHHUM-25 -->
Gates of Hell: a breed may also hold [no_inventory](#no_inventory-breed) and [field_icon](#field_icon-breed). This game
does not know them and a GoH breed that has them fails to load here, so remove them when you port.

Example:
```
{breed
  {behaviour soldier}
  {skin "ger_t2"} {portrait "ger_soldier2"} {nationality ger}
}
```

See: [chapter 8, section 6](08-infantry-and-humans.md#6-breeds); [perks](#perks); [inventory (breed)](#inventory-breed); [Part I: Add a new unit](p03-add-a-unit.md).

### behaviour

Where: `{breed}`.    Type: word.

Values: `soldier`, `civilian`, `soldier.outdoors`, `soldier.cover_horizontal`, `soldier.cover_vertical`,
`civilian.outdoors_idle`. Vanilla breeds use `soldier` and `civilian` only.

Does: picks the idle behaviour set the soldier uses when he has no order: how he stands about, looks around and uses
cover.

Limits: none recorded.

Example:
```
{behaviour soldier}
```

See: [Stance machine](#stance-machine); [chapter 8, section 6](08-infantry-and-humans.md#6-breeds); [Part I: Add a new unit](p03-add-a-unit.md).

### hero

Where: `{breed}`.    Type: flag.

Values: present or absent.

Does: marks the breed as a hero; the unit bar then shows no description text for him.

Limits: none recorded.

Example:
```
{hero}
```

See: [chapter 8, section 6](08-infantry-and-humans.md#6-breeds); [Part I: Add a new unit](p03-add-a-unit.md).

### skin

Where: `{breed}`.    Type: text, a skin name.

Values: the name of a file in `/entity/humanskin/`. When the key is absent the soldier gets the skin `skeleton`.

Does: picks the body model and textures of the soldier.

Limits: a skin name that does not exist leaves the soldier with the fallback model; check `game.log` after a change.

Example:
```
{skin "ger_t2"}
```

See: [portrait](#portrait); [chapter 16](16-effects-sound-models.md); [chapter 8, section 6](08-infantry-and-humans.md#6-breeds); [Part I: Add a new unit](p03-add-a-unit.md).

### portrait

Where: `{breed}`.    Type: text, an image name.

Values: an image name from `/interface/scene/portrait/`.

Does: picks the face shown in the unit panel.

Limits: none recorded.

Example:
```
{portrait "ger_soldier2"}
```

See: [icon](#icon); [chapter 15](15-interface-and-icons.md); [chapter 8, section 6](08-infantry-and-humans.md#6-breeds); [Part I: Add a new unit](p03-add-a-unit.md).

### icon

Where: `{breed}`.    Type: text, an image name.

Values: an image name from `/interface/scene/squad/`.

Does: picks the small icon shown for the soldier in the squad and unit lists. The unit list looks it up as
`<icon>(<nationality>)`, so one icon name can have a version per side.

Limits: none recorded.

Example:
```
{icon "bazooker"}
```

See: [icon_priority](#icon_priority); [nationality](#nationality); [chapter 8, section 6](08-infantry-and-humans.md#6-breeds); [Part I: Add a new unit](p03-add-a-unit.md).

### icon_priority

Where: `{breed}`.    Type: number, whole.

Values: any whole number; higher wins.

Does: when soldiers form a squad, the member with the highest `icon_priority` gives the squad its icon.

Limits: none recorded.

Example:
```
{icon_priority 3}
```

See: [icon](#icon); [chapter 8, section 6](08-infantry-and-humans.md#6-breeds); [Part I: Add a new unit](p03-add-a-unit.md).

### tags (breed)

Where: `{breed}`.    Type: text list.

Values: any words. The engine itself reads only `kamikaze`; vanilla also writes `"officer"` and `"stealth"`, which are
there for scripts and the interface.

Does: adds tags to the soldier so scripts, missions and `kamikaze` behaviour can find him.

Limits: tags other than `kamikaze` change nothing on their own; they only matter to a script or mission that looks for
them.

Example:
```
{tags "officer"}
```

See: [chapter 11](11-interaction-scripts.md); [chapter 8, section 6](08-infantry-and-humans.md#6-breeds); [Part I: Add a new unit](p03-add-a-unit.md).

### nationality

Where: `{breed}`.    Type: word.

Values: a nationality name such as `ger`, `rus`, `usa`, `eng`, `jap`.

Does: picks the group of soldier names the name generator draws from and the default voice. It also selects the side
version of the squad icon.

Limits: none recorded.

Example:
```
{nationality ger}
```

See: [voice](#voice); [icon](#icon); [chapter 8, section 6](08-infantry-and-humans.md#6-breeds); [Part I: Add a new unit](p03-add-a-unit.md).

### voice

Where: `{breed}`.    Type: word.

Values: a voice set name (unconfirmed: vanilla breeds never write this key). When absent, the voice follows `nationality`.

Does: overrides the voice the soldier speaks with.

Limits: none recorded.

Example:
```
{nationality usa}
{voice "eng"}
```

See: [nationality](#nationality); [chapter 8, section 6](08-infantry-and-humans.md#6-breeds); [Part I: Add a new unit](p03-add-a-unit.md).

### armors

Where: `{breed}`.    Type: block.

Values: `{head "item"}` and `{body "item"}` sub-blocks.

Does: puts helmet and body armour items on the soldier when he is created. The item names come from the equipment lists
in `/entity/inventory/-equipment/head` and `/entity/inventory/-equipment/body`.

Limits: an item that the matching armour holder rejects logs `Can't put armor %s to %s` and the soldier goes without it.

Example:
```
{armors {head helmet1_ger}}
```

See: [head](#head); [body](#body); [armor (holder)](#armor-holder); [chapter 8, section 6](08-infantry-and-humans.md#6-breeds); [Part I: Add a new unit](p03-add-a-unit.md).

### head

Where: `{breed}` › `{armors}`.    Type: word, an item name.

Values: a head equipment item name.

Does: puts this item into the soldier's `head` armour holder.

Limits: as for [armors](#armors).

Example:
```
{armors {head helmet1_ger}}
```

See: [armors](#armors); [chapter 8, section 6](08-infantry-and-humans.md#6-breeds); [Part I: Add a new unit](p03-add-a-unit.md).

### body

Where: `{breed}` › `{armors}`.    Type: word, an item name.

Values: a body equipment item name.

Does: puts this item into the soldier's `body` armour holder.

Limits: as for [armors](#armors).

Example:
```
{armors {head helmet1_ger} {body vest_name}}
```

See: [armors](#armors); [chapter 8, section 6](08-infantry-and-humans.md#6-breeds); [Part I: Add a new unit](p03-add-a-unit.md).

### perks

Where: `{breed}`.    Type: block of `{"ability" value}` pairs.

Values: each pair names an ability from `set/ability/` and its value. For leveled abilities the value is a level name
(`"150%"`, `lvl_2`); abilities without levels, such as `stealth` or `telescope`, take no value; for `speed`, `tank`, `vehicle` and `cannon` it is a plain number; for `vision` it is a vision name.

Does: switches on the soldier's abilities. Each entry is described under [Perk values in a breed](#perk-values-in-a-breed).

Limits: an unknown ability name logs `Unknown ability "x"`. An unknown level name logs `invalid level param "x"` and the
soldier silently gets the top level of that ability, which can make him far stronger than intended.

Example:
```
{perks
  {"health" "150%"} {"speed" 0.9}
  {"rifle" lvl_1} {"rocketlauncher" lvl_3}
}
```

See: [Ability blocks](#ability-blocks); [veterancy (breed)](#veterancy-breed); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### veterancy (breed)

Where: `{breed}`.    Type: block of `{"rank" threshold}` pairs.

Values: rank names from `set/ability/veterancy.set` with a threshold of experience points each. A threshold of `-1` is
always met. Vanilla has one macro, `veterancy_1` (in each army's `veterancy_generic.inc`), whose thresholds for ranks 1 to 5
are 4, 8, 24, 48 and 80, and 2, 4, 12, 24 and 40 inside the multiplayer `(mod "mp" ...)` block.

Does: says how much experience the soldier needs for each rank. Each rank met lights one star on the unit bar.

Limits: ranks do not add up: only the highest rank reached applies its bonuses. A script that sets veterancy directly
is clamped to 0 to 5.

<!-- goh: GHHUM-07 GHHUM-19 GHHUM-11 -->
Gates of Hell: there are up to 8 ranks (ranks 6 to 8 are cut to 5 here). Each time a soldier spawns, his rank is worked
out again from his veterancy abilities, so his rank follows his perks rather than a saved score. A hero's personage
ability is taken away again when his rank falls below the ability's rank.

Example:
```
{veterancy
  {"lvl_1" 4} {"lvl_2" 8} {"lvl_3" 24}
}
```

See: [Veterancy rank effects](#veterancy-rank-effects); [chapter 8, section 6](08-infantry-and-humans.md#6-breeds); [Part I: Add a new unit](p03-add-a-unit.md).

### inventory (breed)

Where: `{breed}`.    Type: block of `{item}` lines and one optional `{in_hands}`.

Values: see [item (breed)](#item-breed) and [in_hands](#in_hands).

Does: lists the kit the soldier starts with, in order. Items are placed into his inventory box one after another.

Limits: an item that does not fit into the box is dropped silently, so a full box loses the last items in the list.

Example:
```
{inventory
  {item "weapon panzershreck" filled}
  {item "mp40" filled}
  {item "bandage" 3}
  {in_hands 0}
}
```

See: [box](#box); [chapter 8, section 6](08-infantry-and-humans.md#6-breeds); [Part I: Add a new unit](p03-add-a-unit.md).

### item (breed)

Where: `{breed}` › `{inventory}`.    Type: block: tags, then an optional count, then an optional fill.

Values: `{item "tags" [count | count dev] [filled | filled N | filling "tags" N]}`. Without a count one item is added.
`count dev` adds a random amount: the count plus or minus up to `dev`, rounded.

Does: adds items that carry all the given tags. A count on stackable stuff such as ammunition gives that many rounds.

Limits: tags that match no stuff add nothing. Items that do not fit are dropped silently.

Example:
```
{item "ammo pistol" 500}
{item "grenade m24x5" 1}
{item "bandage" 3 1}
```

See: [filled](#filled); [filling (breed item)](#filling-breed-item); [chapter 8, section 6](08-infantry-and-humans.md#6-breeds); [Part I: Add a new unit](p03-add-a-unit.md).

### filled

Where: `{breed}` › `{inventory}` › `{item}`.    Type: flag with an optional number.

Values: `filled` alone, or `filled N`.

Does: `filled` loads the item to its own full capacity (a weapon's magazine, a fuel tank). `filled N` loads N rounds,
rounded down to a whole number of magazines.

Limits: `filled N` also rewrites the capacity of that item for every soldier who carries it, not only this one; use it
with care.

<!-- goh: GHHUM-61 GHHUM-62 -->
Gates of Hell: a weapon loaded at the start is filled up to the largest amount its filling allows (the second number of
its filling), not one magazine, so GoH breeds start with a full reserve. A saved weapon with no filling reloads with its
own kind of ammunition.

Example:
```
{item "mp40" filled}
{item "flame_thrower_g" filled}
```

See: [item (breed)](#item-breed); [filling (weapon)](r06-weapons-and-ammunition.md#filling); [chapter 8, section 6](08-infantry-and-humans.md#6-breeds); [Part I: Add a new unit](p03-add-a-unit.md).

### filling (breed item)

Where: `{breed}` › `{inventory}` › `{item}`.    Type: tags and a number.

Values: `filling "tags" N`: the content tags and the amount.

Does: loads the item with N of the content that carries the given tags, for example fuel into a flame-thrower tank.

Limits: none recorded.

Example:
```
{item "balloon" filling "fuel" 80}
```

See: [filled](#filled); [chapter 8, section 6](08-infantry-and-humans.md#6-breeds); [Part I: Add a new unit](p03-add-a-unit.md).

### in_hands

Where: `{breed}` › `{inventory}`.    Type: number, whole.

Values: a 0-based index that counts only the `{item}` lines of the inventory block.

Does: puts that item into the soldier's hands when he is created.

Limits: an index past the end of the list is ignored and the soldier starts empty-handed.

Example:
```
{inventory {item "mp40" filled} {item "bandage" 3} {in_hands 0}}
```

See: [inventory (breed)](#inventory-breed); [hand_right](#hand_right); [chapter 8, section 6](08-infantry-and-humans.md#6-breeds); [Part I: Add a new unit](p03-add-a-unit.md).

## Ability blocks

Ability files under `set/ability/` define the perks a breed can name. Each block either starts from a built-in kind or
from another named ability.

### ability block

Where: `set/ability/*.set`.    Type: block.

Values: `{"name" from kind ...}` defines a new named ability from a kind; `{kind ...}` writes the kind itself. Kinds,
in any letter case: `Avoidance`, `Melee`, `Health`, `Health_Regeneration`, `Speed`, `Stealth`, `Vision`,
`SpecialVision`, `SpecialAttack`, `Weapon`, `Veterancy`, `Stamina`, `Stamina_Regeneration`, `Tank`, `Vehicle`, `Cannon`,
`Weapon_Reload`.

Does: makes the ability known by name so a breed can list it under `{perks}`.

Limits: a block that starts from an unknown name logs `Unknown ability "x"`. A leveled kind with no `{level}` lines logs
`No levels in ability "x"`. The names `Medic`, `Fortification`, `Personage` and `Mechanic` are known to the game but
have no working base (unconfirmed), so a block made from them does nothing.

<!-- goh: GHHUM-26 GHHUM-27 -->
Gates of Hell: `Medic`, `Personage`, `Fortification` and `Mechanic` work there, and GoH adds the kinds `Barricade`,
`Resources`, `Resources_Regeneration` and `weapon_sway_control` (see [Gates of Hell only](#gates-of-hell-only)). GoH
breeds name most of them straight in `{perks}` (`{"medic" 10.0}`, `{mechanic factor 1.0}`); they do nothing here.

Example:
```
{"rocketlauncher" from weapon
  {item "rocketlauncher"}
  {level "lvl_1" {stand {accuracy 1.0}}}
}
```

See: [perks](#perks); [level](#level); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### from

Where: start of an ability block.    Type: word.

Values: a kind from the list above or the name of an ability defined earlier.

Does: copies that kind or ability, then the block's own keys change it.

Limits: an unknown name logs `Unknown ability "x"` and the ability is not made.

Example:
```
{"telescope" from specialvision
  {item "rifle" "sniper"}
}
```

See: [ability block](#ability-block); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### level

Where: an ability block of a leveled kind.    Type: block: a name, then a value or sub-blocks.

Values: `{level "name" value}` for health, health regeneration, stamina and stamina regeneration (the value is a
multiplier, so `{level "150%" 1.5}`); `{level "name" {...}}` with sub-blocks for weapon skills, avoidance and melee.
Vanilla health levels run `20%`, `30%`, `50%`, `75%`, `100%`, `125%`, `150%`, `175%`, `200%`, `225%`, `250%`, `275%`,
`300%`, `350%`, `400%`, `500%`, `600%`, `750%`, `1000%`. Health regeneration and stamina use the same list without
`175%` and `225%`; stamina regeneration has `175%` but not `225%`.

Does: names one step of the ability that a breed picks in its `{perks}`.

Limits: a breed that names a level the ability does not have gets the top level, with only the log line
`invalid level param "x"` to warn you.

Example:
```
{health
  {level "100%" 1.0}
  {level "150%" 1.5}
}
```

See: [perks](#perks); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

## Perk values in a breed

Each of these is written inside a breed's `{perks}` block as `{"kind" value}`.

### health (perk)

Where: `{breed}` › `{perks}`.    Type: level name.

Values: a level of the `health` ability; vanilla uses `"100%"` up to `"500%"`.

Does: multiplies the soldier's maximum health.

Limits: an unknown level gives the top level (`1000%` in vanilla).

Example:
```
{"health" "150%"}
```

See: [Health (vitality)](#health-vitality); [level](#level); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### health_regeneration (perk)

Where: `{breed}` › `{perks}`.    Type: level name.

Values: a level of the `health_regeneration` ability.

Does: multiplies how fast the soldier's health comes back.

Limits: as for [health (perk)](#health-perk).

Example:
```
{"health_regeneration" "100%"}
```

See: [inc (Health)](#inc-health); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### stamina (perk)

Where: `{breed}` › `{perks}`.    Type: level name.

Values: a level of the `stamina` ability.

Does: multiplies the soldier's maximum stamina.

Limits: as for [health (perk)](#health-perk).

Example:
```
{"stamina" "100%"}
```

See: [Stamina](#stamina); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### stamina_regeneration (perk)

Where: `{breed}` › `{perks}`.    Type: level name.

Values: a level of the `stamina_regeneration` ability.

Does: multiplies stamina recovery. Only recovery rates of zero or more are scaled; stamina loss is never scaled.

Limits: as for [health (perk)](#health-perk).

Example:
```
{"stamina_regeneration" "100%"}
```

See: [inc (Stamina)](#inc-stamina); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### speed (perk)

Where: `{breed}` › `{perks}`.    Type: number, a factor.

Values: a plain number; vanilla uses 0.8, 0.9 and 1.0.

Does: scales the soldier's foot speed table.

Limits: none recorded.

Example:
```
{"speed" 0.9}
```

See: [Reference 4](r04-chassis-and-movement.md); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### tank (perk)

Where: `{breed}` › `{perks}`.    Type: number, a factor.

Values: a plain number; vanilla uses 0.6, 0.8, 0.9 and 1.0.

Does: the soldier's skill as a tank crew member, shown in the vehicle panel and used as his crew efficiency.

Limits: none recorded.

Example:
```
{"tank" 0.8}
```

See: [vehicle (perk)](#vehicle-perk); [cannon (perk)](#cannon-perk); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### vehicle (perk)

Where: `{breed}` › `{perks}`.    Type: number, a factor.

Values: a plain number; vanilla uses 0.8 and 1.0.

Does: the soldier's skill as a driver or crew member of soft vehicles.

Limits: none recorded.

Example:
```
{"vehicle" 1.0}
```

See: [tank (perk)](#tank-perk); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### cannon (perk)

Where: `{breed}` › `{perks}`.    Type: number, a factor.

Values: a plain number; vanilla uses 0.8 and 1.0.

Does: the soldier's skill as a gun crew member.

Limits: none recorded.

Example:
```
{"cannon" 1.0}
```

See: [tank (perk)](#tank-perk); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### vision (perk)

Where: `{breed}` › `{perks}`.    Type: text, a vision name.

Values: a vision name from `set/vision`; vanilla breeds use `mp_soldier`, `mp_officer`, `mp_sniper` and `human`.

Does: replaces the vision of the soldier's eyes with the named one.

Limits: none recorded.

Example:
```
{"vision" "mp_soldier"}
```

See: [Reference 8 (vision, effects and sound)](r08-vision-effects-sound.md); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### stealth (perk)

Where: `{breed}` › `{perks}`.    Type: ability.

Values: the `stealth` ability.

Does: puts the soldier into the stealth state.

Limits: none recorded.

Example:
```
{"stealth"}
```

See: [tags (breed)](#tags-breed); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### weapon skill perks

Where: `{breed}` › `{perks}`.    Type: level name.

Values: an ability made from `weapon`: vanilla has `rifle`, `smg`, `pistol`, `mgun`, `mgun_light`, `at_rifle` and
`rocketlauncher`, with levels `lvl_1` to `lvl_4`.

Does: gives the soldier the accuracy of that level while he holds a matching weapon.

Limits: an unknown level gives the top level.

Example:
```
{"pistol" lvl_2} {"smg" lvl_2} {"mgun" lvl_1}
```

See: [Weapon skill blocks](#weapon-skill-blocks); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### avoidance (perk)

Where: `{breed}` › `{perks}`.    Type: level name.

Values: a level of the `avoidance` ability, `lvl_1` and up in vanilla.

Does: gives the soldier a chance to shrug off some effects; see [Avoidance keys](#avoidance-keys).

Limits: an unknown level gives the top level.

Example:
```
{"avoidance" lvl_1}
```

See: [Avoidance keys](#avoidance-keys); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### melee (perk)

Where: `{breed}` › `{perks}`.    Type: level name.

Values: a level of the `melee` ability, `lvl_1` to `lvl_4` in vanilla.

Does: sets the soldier's hand-to-hand skill; see [Melee keys](#melee-keys).

Limits: an unknown level gives the top level.

Example:
```
{"melee" lvl_2}
```

See: [Melee keys](#melee-keys); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### specialvision and specialattack perks

Where: `{breed}` › `{perks}`.    Type: ability name.

Values: an ability made from `specialvision` (vanilla `telescope`, `field_glass`) or from `specialattack` (vanilla
`aimedshot`).

Does: lets the soldier use a scope or field glasses, or the aimed shot, when he holds a matching item.

Limits: none recorded.

Example:
```
{"field_glass"} {"telescope"}
```

See: [Special vision and attack](#special-vision-and-attack); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

### weapon_reload (perk)

Where: `{breed}` › `{perks}`.    Type: ability.

Values: the `weapon_reload` ability.

Does: nothing. The ability is registered, but no part of the game reads it.

Limits: it is ignored; use the veterancy key [weapon_reload (veterancy)](#weapon_reload-veterancy) instead, which works.

Example:
```
{"weapon_reload"}
```

See: [Veterancy rank effects](#veterancy-rank-effects); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy); [Part I: Change a unit's numbers](p02-change-unit-numbers.md).

## Weapon skill blocks

A weapon skill is an ability made `from weapon`. Vanilla puts `rifle`, `smg` and `pistol` in a shared include file and
`mgun`, `mgun_light`, `at_rifle` and `rocketlauncher` in their own blocks.

### item (ability)

Where: an ability block made from `weapon`, `specialvision` or `specialattack`.    Type: text list of tags.

Values: one or more stuff tags.

Does: the ability works only while the item in the soldier's right hand carries all these tags.

Limits: if several abilities match the item in hand, the first active one in the breed's perk order wins and the others
are ignored.

Example:
```
{item "rocketlauncher"}
```

See: [hand_right](#hand_right); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### stand, squat, crawl, cover, vehicle

Where: `{level}` of a weapon skill.    Type: block holding `{accuracy}`.

Values: one block per posture. The game picks `cover` when the soldier is in cover, `vehicle` when he is aboard a
vehicle, `crawl` when lying, `squat` when crouching and `stand` otherwise.

Does: gives the accuracy for that posture. Vanilla level 1 of the shared skills uses stand 1.00, squat 1.20, crawl 1.40,
cover 1.50 and vehicle 2.00; the stand value of the higher levels is 1.25, 1.50, 1.75 and 1.80.
The `mgun` skill is weak standing (0.25) and strong lying (1.25).

Limits: a posture left out keeps the value from `{default}` or, without one, has no bonus.

<!-- goh: GHHUM-04 GHHUM-20 GHHUM-05 -->
Gates of Hell: each posture block holds five values, `accuracy`, `aim_range`, [`recoil`, `zoom_recoil` and
`sway`](#recoil-zoom_recoil-and-sway-skill) (each 1 when absent), and the skill then changes how a gun kicks and swings,
for hand weapons and for the guns a crew works.

Example:
```
{level "lvl_1"
  {stand {accuracy 0.25}} {squat {accuracy 0.5}}
  {crawl {accuracy 1.25}} {cover {accuracy 1.5}}
}
```

See: [accuracy (skill)](#accuracy-skill); [default (skill)](#default-skill); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### default (skill)

Where: `{level}` of a weapon skill.    Type: block holding `{accuracy}`.

Values: `{default {accuracy f}}`.

Does: copies its values to all five postures; write it first and then override single postures.

Limits: none recorded.

<!-- goh: GHHUM-04 -->
Gates of Hell: a `default` block on its own copies all five values (accuracy, aim range, recoil, zoom recoil, sway) to
every posture.

Example:
```
{level "lvl_2" {default {accuracy 1.5}}}
```

See: [stand, squat, crawl, cover, vehicle](#stand-squat-crawl-cover-vehicle); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### accuracy (skill)

Where: a posture block of a weapon skill level.    Type: number, a factor.

Values: a positive number; 1.0 is neutral.

Does: multiplies the shooter's hit rate together with the difficulty factor, and divides the spread circle of his shots.
The level used is the perk's level plus the `weapon_skill` value of his veterancy rank, held within the levels that
exist.

Limits: the Gates of Hell keys `recoil`, `zoom_recoil` and `sway` are read in this game but do nothing.

Example:
```
{stand {accuracy 1.25}}
```

See: [weapon_skill](#weapon_skill); [Spreading](r06-weapons-and-ammunition.md#spreading); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### aim_range (skill)

Where: posture block of a weapon skill level.    Type: number.

Values: written as the second value; vanilla data carries it.

Does: nothing in this game. The value is stored but no part of the game reads it.

Limits: ignored.

Example:
```
{stand {accuracy 1.0} {aim_range 1.0}}
```

See: [accuracy (skill)](#accuracy-skill); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

## Special vision and attack

### vision (special)

Where: an ability made from `specialvision`.    Type: text, a vision name.

Values: a vision name from `set/vision`; vanilla uses `soldier_focused`.

Does: the soldier's vision while he holds the matching item but is not aiming through it.

Limits: none recorded.

Example:
```
{"field_glass" from specialvision
  {item "field_glass"} {vision "soldier_focused"} {aimed_vision "field_glass"}
}
```

See: [aimed_vision](#aimed_vision); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### aimed_vision

Where: an ability made from `specialvision`.    Type: text, a vision name.

Values: a vision name; vanilla uses `rifle_telescope` for scopes and `field_glass` for binoculars.

Does: the soldier's vision while he aims through the scope or glasses.

Limits: none recorded.

Example:
```
{aimed_vision "rifle_telescope"}
```

See: [vision (special)](#vision-special); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### specialattack

Where: `set/ability/*.set`.    Type: block.

Values: `{"name" from specialattack {item "tags"}}`; vanilla `aimedshot` uses `{item "rifle" "sniper"}`.

Does: allows the soldier to use the weapon's special aimed shot (the `special` block of the weapon) when he holds a
matching item.

Limits: without this ability the weapon's special mode is not offered.

<!-- goh: GHHUM-06 -->
Gates of Hell: the ability is active whenever the weapon in hand carries one of its item tags, even when the weapon has
no ammunition left; here it needs ammunition.

Example:
```
{"aimedshot" from specialattack {item "rifle" "sniper"}}
```

See: [special](r06-weapons-and-ammunition.md#special); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

## Avoidance keys

These sit inside a `{level}` of the `avoidance` ability. Each is a number from 0 to 1.

### drop_weapon

Where: `{avoidance}` › `{level}`.    Type: number, 0 to 1.

Values: 0 to 1.

Does: when a hit would knock the weapon out of the soldier's hands, a random draw above this value makes him drop it,
so a higher value keeps the weapon more often.

Limits: none recorded.

Example:
```
{level "lvl_2" {drop_weapon 0.5}}
```

See: [avoidance (perk)](#avoidance-perk); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### knockdown_melee

Where: `{avoidance}` › `{level}`.    Type: number, 0 to 1.

Values: 0 to 1.

Does: multiplies the chance of being knocked down by a melee blow by one minus this value.

Limits: none recorded.

Example:
```
{level "lvl_2" {knockdown_melee 0.3}}
```

See: [Melee blows](#melee-blows); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### aimed_shot

Where: `{avoidance}` › `{level}`.    Type: number, 0 to 1.

Values: 0 to 1.

Does: when it succeeds, an aimed shot against the soldier is weakened to between 0.3 and 1.0 times its damage and its
push is cancelled.

Limits: none recorded.

Example:
```
{level "lvl_3" {aimed_shot 0.2}}
```

See: [specialattack](#specialattack); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### fire (avoidance)

Where: `{avoidance}` › `{level}`.    Type: number, 0 to 1.

Values: 0 to 1; vanilla level 1 uses 0.1.

Does: the fraction of fire heat kept off the soldier.

Limits: none recorded.

Example:
```
{avoidance {level "lvl_1" {fire 0.1}}}
```

See: [fire (effect)](r06-weapons-and-ammunition.md#fire); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### explosive

Where: `{avoidance}` › `{level}`.    Type: number, 0 to 1.

Values: 0 to 1.

Does: the chance to cancel being thrown off his feet by an explosion.

Limits: none recorded.

Example:
```
{level "lvl_2" {explosive 0.25}}
```

See: [blastwave](r06-weapons-and-ammunition.md#blastwave); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

## Melee keys

These sit inside a `{level}` of the `melee` ability.

### agility

Where: `{melee}` › `{level}`.    Type: number.

Values: vanilla uses 0.4 at level 1 and 0.6 at level 2, rising after that.

Does: how quick the soldier is in hand-to-hand fighting.

Limits: none recorded.

Example:
```
{level "lvl_1" {agility 0.4} {strokes "lvl_2 knife"}}
```

See: [strength](#strength); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### strength

Where: `{melee}` › `{level}`.    Type: number, a factor.

Values: vanilla level 2 uses 5.5.

Does: multiplies the damage of every blow the soldier lands.

Limits: none recorded.

Example:
```
{level "lvl_2" {agility 0.6} {strength 5.5}}
```

See: [damage (blow)](#damage-blow); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### strokes

Where: `{melee}` › `{level}`.    Type: text, a list of words in one string.

Values: `fist`, `leg`, `butt`, `slop_size`, `slop_down`, `knife`, `basic`.

Does: the kinds of blow the soldier may use. A blow file whose tags match one of these words is available to him.

Limits: a misspelt word matches no blow and is ignored. Vanilla level 4 writes `slope_size`, which is not one of the
words above, so that kind is not given at level 4.

Example:
```
{strokes "butt fist leg knife"}
```

See: [tags (blow)](#tags-blow); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### chance (melee)

Where: `{melee}` › `{level}`.    Type: block.

Values: `{defence_stroke f}`, `{counter_attack f}`, `{knockdown_blow f}`, each 0 to 1. Vanilla level 2 uses 0.1 and 0.1;
level 4 uses 0.8 and 0.3.

Does: `counter_attack` is the chance to strike back; `knockdown_blow` raises the chance that his blows knock the target
down; `defence_stroke` is the chance to block.

Limits: the knockdown chance only applies while the blow's own chance is below 0.99.

Example:
```
{chance {counter_attack 0.1} {knockdown_blow 0.1}}
```

See: [knock_down_chance](#knock_down_chance); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

## Veterancy rank effects

These keys sit in `set/ability/veterancy.set`, inside a rank block such as `{"lvl_1" from veterancy ...}`. Each value
is a fraction added on top: a value of 0.15 means plus 15 percent.

### veterancy rank block

Where: `set/ability/veterancy.set`.    Type: block.

Values: `{"lvl_N" from veterancy {"key" f} ...}`.

Does: gives the bonuses of one rank. A breed's `{veterancy}` block says when the soldier reaches it.

Limits: ranks do not add up; only the highest rank reached applies.

Example:
```
{"lvl_1" from veterancy
  {"health" 0.15} {"stamina" 0.10} {"weapon_skill" 0}
}
```

See: [veterancy (breed)](#veterancy-breed); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### health (veterancy)

Where: veterancy rank block.    Type: number, a fraction.

Values: vanilla 0.15, 0.20, 0.25, 0.30, 0.35 for ranks 1 to 5.

Does: raises maximum health by this fraction.

Limits: none recorded.

Example:
```
{"health" 0.20}
```

See: [max (Health)](#max-health); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### health_regeneration (veterancy)

Where: veterancy rank block.    Type: number, a fraction.

Values: vanilla 0.15, 0.25, 0.35, 0.45, 0.55.

Does: raises health recovery by this fraction.

Limits: none recorded.

Example:
```
{"health_regeneration" 0.25}
```

See: [inc (Health)](#inc-health); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### stamina (veterancy)

Where: veterancy rank block.    Type: number, a fraction.

Values: vanilla 0.10, 0.15, 0.20, 0.25, 0.30.

Does: raises maximum stamina by this fraction.

Limits: none recorded.

Example:
```
{"stamina" 0.15}
```

See: [Stamina](#stamina); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### stamina_regeneration (veterancy)

Where: veterancy rank block.    Type: number, a fraction.

Values: vanilla 0.10, 0.20, 0.30, 0.40, 0.50.

Does: raises stamina recovery by this fraction; stamina loss is not changed.

Limits: none recorded.

Example:
```
{"stamina_regeneration" 0.20}
```

See: [inc (Stamina)](#inc-stamina); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### tank, vehicle, cannon (veterancy)

Where: veterancy rank block.    Type: number, a fraction.

Values: vanilla 0.05 at rank 1 up to 0.25 at rank 5.

Does: raises the soldier's crew skill for tanks, soft vehicles and guns by this fraction.

Limits: none recorded.

Example:
```
{"tank" 0.05} {"vehicle" 0.05} {"cannon" 0.05}
```

See: [tank (perk)](#tank-perk); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### weapon_reload (veterancy)

Where: veterancy rank block.    Type: number, a fraction.

Values: vanilla 0.10, 0.15, 0.20, 0.25, 0.30.

Does: the fraction of reload time the soldier saves.

Limits: it works for soldiers only; vehicles and guns reload by their crew's efficiency instead.

Example:
```
{"weapon_reload" 0.10}
```

See: [rechargeTime](r06-weapons-and-ammunition.md#rechargetime); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### weapon_skill

Where: veterancy rank block.    Type: number, whole.

Values: vanilla 0, 0, 1, 1, 2.

Does: adds this many steps to the level of the soldier's weapon skill, held within the levels the skill has.

Limits: none recorded.

Example:
```
{"weapon_skill" 1}
```

See: [accuracy (skill)](#accuracy-skill); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### medic

Where: veterancy rank block.    Type: number, a fraction.

Values: 0 to 1.

Does: the fraction of healing time the soldier saves.

Limits: none recorded.

Example:
```
{"medic" 0.1}
```

See: [Morale and self-healing](#morale-and-self-healing); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

## Vitality: health and stamina

The vitality block is part of `properties/human.ext`. Its keys are not case-sensitive. A key the block does not know
logs `unexpected token`.

### Health (vitality)

Where: `properties/human.ext`, or a unit `.def` that overrides it.    Type: block.

Values: `{max}`, `{current}`, `{inc}`.

Does: sets the soldier's health. Maximum health is `max` times the difficulty factor times the health perk times one
plus the veterancy health bonus.

Limits: health running out does not kill the soldier on its own; the death comes from the damage event scripts, which
fire `{die}`. Bleeding is only a tag, and wounds are at most 16 marks on the body that are only for show.

<!-- goh: GHDMG-21 GHHUM-08 GHHUM-09 -->
Gates of Hell: the vitality block also takes damage factors per hit volume ([Damage, DamageTPC and
DamageBlast](#damage-damagetpc-and-damageblast)), which this game rejects. A killed hero (personage) goes down knocked
out and bleeding first, and a boosted dying soldier lasts longer, which gives medics more time.

Example:
```
{Health {max 100} {inc 1.0}}
```

See: [health (perk)](#health-perk); [chapter 11](11-interaction-scripts.md); [chapter 8, section 2](08-infantry-and-humans.md#2-health-stamina-and-death).

### max (Health)

Where: `{Health}`.    Type: number, health points.

Values: positive; 100 when absent.

Does: the base maximum health before bonuses.

Limits: none recorded.

Example:
```
{max 100}
```

See: [Health (vitality)](#health-vitality); [chapter 8, section 2](08-infantry-and-humans.md#2-health-stamina-and-death).

### current (Health)

Where: `{Health}`.    Type: number, health points.

Values: 100 when absent.

Does: the health the soldier starts with. The stored value does not include the perk and veterancy bonus.

Limits: none recorded.

Example:
```
{current 100}
```

See: [max (Health)](#max-health); [chapter 8, section 2](08-infantry-and-humans.md#2-health-stamina-and-death).

### inc (Health)

Where: `{Health}`.    Type: number, health points per second.

Values: 0.5 when absent; vanilla uses 1.0.

Does: how fast health comes back. The rate is multiplied by the difficulty factor, the health regeneration perk and the
veterancy bonus, and is applied every 0.3 seconds.

Limits: none recorded.

Example:
```
{inc 1.0}
```

See: [health_regeneration (perk)](#health_regeneration-perk); [chapter 8, section 2](08-infantry-and-humans.md#2-health-stamina-and-death).

### Stamina

Where: `properties/human.ext`.    Type: block.

Values: `{max}`, `{current}`, `{load}`, `{inc}`, `{movement_limits}`.

Does: sets the soldier's stamina, how carried weight and movement drain or restore it, and which speeds he may use.

Limits: an unknown sub-key logs `unexpected token`.

Example:
```
{Stamina
  {load 0 20 40 100}
  {movement_limits {Fast 1 25} {Normal 0 0} {Slow -1 -1}}
}
```

See: [chapter 8, section 2](08-infantry-and-humans.md#2-health-stamina-and-death).

### max (Stamina)

Where: `{Stamina}`.    Type: number.

Values: positive.

Does: the base maximum stamina before the stamina perk and veterancy bonus.

Limits: none recorded.

Example:
```
{max 100}
```

See: [stamina (perk)](#stamina-perk); [chapter 8, section 2](08-infantry-and-humans.md#2-health-stamina-and-death).

### current (Stamina)

Where: `{Stamina}`.    Type: number.

Values: up to `max`.

Does: the stamina the soldier starts with.

Limits: none recorded.

Example:
```
{current 100}
```

See: [max (Stamina)](#max-stamina); [chapter 8, section 2](08-infantry-and-humans.md#2-health-stamina-and-death).

### load

Where: `{Stamina}`.    Type: four numbers, carried weight.

Values: four rising weights; `0 20 40 60` when absent, vanilla `0 20 40 100`.

Does: splits carried weight into four bands. The stamina change rates in `{inc}` have one column per band, and the game
blends between columns by the weight of the inventory.

Limits: none recorded.

Example:
```
{load 0 20 40 100}
```

See: [inc (Stamina)](#inc-stamina); [weight (box)](#weight-box); [chapter 8, section 2](08-infantry-and-humans.md#2-health-stamina-and-death).

### inc (Stamina)

Where: `{Stamina}`.    Type: block of rows, four numbers each, stamina per second.

Values: rows named `walk`, `slow`, `normal`, `fast`; any other row name sets the standing row. Vanilla: standing +15,
+10, +9, +5; walk and slow +10, +5, 0, -10; normal +2.5, +1, 0, -20; fast -5, -10, -20, -40.

Does: how fast stamina rises (positive) or falls (negative) for each way of moving, across the four weight bands of
`load`.

Limits: a misspelt row name silently overwrites the standing row instead of making a new row. Perk and veterancy bonuses
scale only rates of zero or more.

Example:
```
{inc
  {stay 15 10 9 5}
  {fast -5 -10 -20 -40}
}
```

See: [load](#load); [chapter 8, section 2](08-infantry-and-humans.md#2-health-stamina-and-death).

### movement_limits

Where: `{Stamina}`.    Type: block of `{Speed hi lo}` rows.

Values: rows `Fast`, `Normal`, `Slow`, each with two stamina values. Vanilla: `{Fast 1 25}`, `{Normal 0 0}`,
`{Slow -1 -1}`.

Does: says which speed the soldier may use at his current stamina. A speed is allowed once stamina reaches the higher
of its two numbers and stays allowed until stamina falls below the lower one, so in vanilla running starts at 25 and
stops below 1. When no row matches, the soldier walks slowly; with no rows at all he may always run.

Limits: while the item in his right hand is locked (a heavy weapon being carried in firing position), he can only walk,
whatever this block says.

Example:
```
{movement_limits {Fast 1 25} {Normal 0 0} {Slow -1 -1}}
```

See: [Stamina](#stamina); [chapter 8, section 2](08-infantry-and-humans.md#2-health-stamina-and-death).

## Inventory holders

The inventory extender in `properties/human.ext` defines the places a soldier keeps items: a box, two hands and armour
places. Holder types are `box`, `hand_left`, `hand_right`, `armor` and `weapon`; an unknown type is an error.

### box

Where: inventory extender of `properties/human.ext` or a unit `.def`.    Type: block.

Values: `{Size}`, `{Weight}`, and starting contents with `{item}`, `{cell}`, `{user}`, `{clear}`.

Does: the grid the soldier carries his kit in. Vanilla soldiers have a 6 by 10 grid.

Limits: items that do not fit are dropped silently.

<!-- goh: GHHUM-59 GHHUM-58 GHHUM-60 -->
Gates of Hell: when the game looks for an item by its tags (a weapon to take, a grenade to throw, a mine to lay, a repair
kit) it walks the box in the order the items were put in; here it walks the cells row by row. With two matching items
the two games may pick different ones. The weapon list for direct control holds what is in the hands and in the box, and
throwable items are those tagged `throwable`. A spent one-shot launcher is dropped to the ground, not packed.

Example:
```
{box {Size 6 10} {Weight 100}}
```

See: [inventory (breed)](#inventory-breed); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### Size (box)

Where: `{box}`.    Type: two whole numbers, cells.

Values: width and height in cells, each up to 127.

Does: the size of the inventory grid.

Limits: none recorded.

Example:
```
{Size 6 10}
```

See: [size (item)](#size-item); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### Weight (box)

Where: `{box}`.    Type: number.

Values: positive; vanilla 100.

Does: the weight one cell can hold. Stackable items such as ammunition stack in one cell up to this weight divided by
the weight of one item (unconfirmed).

Limits: it is a per-cell weight, not a limit on the total weight the soldier carries.

Example:
```
{Weight 100}
```

See: [weight (item)](#weight-item); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### item (box)

Where: `{box}`.    Type: tags and an optional count.

Values: `{item "tags" [n]}`.

Does: puts items with these tags into the box when the entity is created.

Limits: only items with the `stackable` tag can take a count above one in a single cell.

Example:
```
{item "bandage" 2}
```

See: [item (breed)](#item-breed); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### cell

Where: `{box}`.    Type: two whole numbers.

Values: two whole numbers, column and row in the grid.

Does: places the item at this cell instead of the first free one (unconfirmed).

Limits: none recorded.

Example:
```
{box {item "bandage" 2} {cell 0 0}}
```

See: [box](#box); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### user

Where: holder block.    Type: block with a word.

Values: `{user "mount"}` and similar.

Does: places an item for a named user of the holder, such as the weapon mounted on a gun.

Limits: an item without the `stackable` tag must have a count of 1 here, else the warning
`Invalid amount for non-stack item in holder box` is logged.

Example:
```
{user "mount"}
```

See: [weapon (holder)](#weapon-holder); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### clear

Where: holder block.    Type: flag.

Values: present or absent.

Does: empties the holder of what the parent class put in it, so a `.def` can start from nothing.

Limits: none recorded.

Example:
```
{box {clear}}
```

See: [box](#box); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### hand_left

Where: inventory extender.    Type: block.

Values: none needed.

Does: the soldier's left hand.

Limits: none recorded.

Example:
```
{hand_left}
```

See: [hand_right](#hand_right); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### hand_right

Where: inventory extender.    Type: block.

Values: none needed.

Does: the soldier's right hand. Weapon skills, special vision and the stance machine all look at the item held here.

Limits: none recorded.

Example:
```
{hand_right}
```

See: [item (ability)](#item-ability); [in_hands](#in_hands); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### armor (holder)

Where: inventory extender.    Type: block with a name.

Values: `{armor "name" {mask} {bone} {volumes} {pierceAbsorb} {HeatDamping}}`. Vanilla has `"head"` and `"body"`.

Does: a place for an armour item, such as a helmet or a vest, that protects certain hit volumes.

Limits: the protection belongs to the holder, not to the item: any item with the `armor` tag switches the holder's
`pierceAbsorb` on.

Example:
```
{armor "head" {mask "head"} {bone "head"} {volumes "head"} {pierceAbsorb 30}}
```

See: [armors](#armors); [Reference 7 (armour, volumes and damage)](r07-armour-volumes-damage.md); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### mask

Where: `{armor}` holder.    Type: text.

Values: a mask name; vanilla uses `"head"` and `"body"`.

Does: picks which armour items fit this holder.

Limits: an item that does not fit logs `Can't put armor %s to %s`.

Example:
```
{mask "body"}
```

See: [armor (holder)](#armor-holder); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### bone

Where: `{armor}` holder.    Type: text, a bone name.

Values: a bone of the soldier's skeleton; vanilla uses `"head"` and `"IK_UpDown"`.

Does: the bone the armour model is attached to.

Limits: none recorded.

Example:
```
{bone "IK_UpDown"}
```

See: [armor (holder)](#armor-holder); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### volumes

Where: `{armor}` holder.    Type: text list, volume names.

Values: names of hit volumes in the soldier's model.

Does: the hit volumes this armour protects. Vanilla body armour covers `"body"` and the four foot volumes.

Limits: none recorded.

Example:
```
{volumes "body" "foot1l" "foot1r" "foot2l" "foot2r"}
```

See: [Reference 7 (armour, volumes and damage)](r07-armour-volumes-damage.md); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### pierceAbsorb

Where: `{armor}` holder.    Type: number, millimetres.

Values: vanilla 30 for the head and 32 for the body.

Does: how much a bullet must penetrate before it hurts a soldier wearing armour in this holder.

Limits: it works only while an armour item is in the holder.

Example:
```
{pierceAbsorb 32}
```

See: [How penetration is worked out](r06-weapons-and-ammunition.md#how-penetration-is-worked-out); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### HeatDamping

Where: `{armor}` holder.    Type: number, a factor.

Values: 1.0 when absent; vanilla body armour uses 0.6.

Does: multiplies the fire heat that reaches the soldier while armour is worn.

Limits: none recorded.

Example:
```
{HeatDamping 0.6}
```

See: [fire (avoidance)](#fire-avoidance); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### weapon (holder)

Where: inventory extender of guns and vehicles.    Type: block.

Values: one item per weapon place.

Does: holds the weapon of a weapon place.

Limits: a second item on the same place logs `HolderWeapon: set user ... ignored` and is not used.

Example:
```
{weapon {user "mount"}}
```

See: [Weaponry](r06-weapons-and-ammunition.md#weaponry); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### spread_items and dropped items

Where: tag on the soldier entity.    Type: tag.

Values: present or absent.

Does: a dead soldier drops up to 7 of his items on the ground. With the tag `spread_items` he does not.

Limits: none recorded.

Example:
```
{tags "spread_items"}
```

See: [box](#box); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

## Item inventory block

These keys sit in the `{inventory}` block of a piece of stuff (a weapon, ammunition, a grenade, a bandage) and say
how it sits in a soldier's box and hands.

### size (item)

Where: stuff file, `{inventory}`.    Type: two whole numbers, cells.

Values: width and height; `0 0` when absent.

Does: how many cells the item takes in the box.

Limits: none recorded.

Example:
```
{inventory {size 2 1} {weight 1}}
```

See: [Size (box)](#size-box); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### weight (item)

Where: stuff file, `{inventory}`.    Type: number, per item.

Values: positive.

Does: the weight of one item. It counts toward the stamina weight bands and decides how many fit in a stack.

Limits: none recorded.

Example:
```
{weight 0.5}
```

See: [load](#load); [Weight (box)](#weight-box); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### block

Where: stuff file, `{inventory}`.    Type: number, whole.

Values: a count.

Does: the size of one lot of this item when it is handed over or split (unconfirmed). Vanilla machine-gun belts use 100.

Limits: none recorded.

Example:
```
{block 100}
```

See: [Weight (box)](#weight-box); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### fsm

Where: stuff file, `{inventory}`.    Type: text, a state machine file name.

Values: a file in `set/stuff/_settings`.

Does: picks which animation states the soldier uses while holding this item.

Limits: an unknown name logs `Unknown fsm state`.

Example:
```
{fsm "belt"}
```

See: [Stance machine](#stance-machine); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### link_bone

Where: stuff file, `{inventory}`.    Type: text, a bone name.

Values: a bone of the soldier's skeleton.

Does: the soldier's bone the item is attached to when held.

Limits: none recorded.

Example:
```
{link_bone "gun_back"}
```

See: [handle_bone](#handle_bone); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### handle_bone

Where: stuff file, `{inventory}`.    Type: text, a bone name.

Values: a bone of the item's model.

Does: the point of the item that sits in the soldier's hand.

Limits: none recorded.

Example:
```
{handle_bone "handle_box"}
```

See: [link_bone](#link_bone); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### noview

Where: stuff file, `{inventory}`.    Type: flag.

Values: present or absent.

Does: the item is not drawn on the soldier.

Limits: none recorded.

Example:
```
{noview}
```

See: [size (item)](#size-item); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

## Melee blows

Each file in `set/blow/` defines one blow. A key the blow reader does not know is an error and the whole file fails to
load.

### blow

Where: `set/blow/*.set`.    Type: block.

Values: `{tags}`, `{distance}`, `{self}`, and one or more `{opponent}` blocks.

Does: one hand-to-hand move. The striker must face the target within 45 degrees.

Limits: any key not listed in this section stops the file loading with an `unexpected token` error.

Example:
```
{blow
  {tags "butt" "basic" "head"}
  {distance far}
  {self {animation "fight_front_club_begin"}}
}
```

See: [chapter 8](08-infantry-and-humans.md); [chapter 11, section 4](11-interaction-scripts.md#4-events).

### tags (blow)

Where: `{blow}`.    Type: text list.

Values: words matched against the `strokes` of a soldier's melee level, such as `"butt"`, `"knife"`, `"basic"`.

Does: decides which soldiers may use the blow.

Limits: none recorded.

Example:
```
{tags "butt" "basic" "head"}
```

See: [strokes](#strokes); [chapter 11, section 4](11-interaction-scripts.md#4-events).

### distance (blow)

Where: `{blow}`.    Type: word.

Values: `near`, `medium`, `far`; `near` when absent.

Does: how far from the target the blow is made.

Limits: none recorded.

Example:
```
{distance far}
```

See: [blow](#blow); [chapter 11, section 4](11-interaction-scripts.md#4-events).

### self

Where: `{blow}`.    Type: block.

Values: `{animation}`, `{enable_items}`, `{disable_items}`, `{fatigue}`.

Does: describes the striker's side of the blow.

Limits: none recorded.

Example:
```
{self {animation "fight_front_club_begin"} {enable_items "smg" "rifle"}}
```

See: [animation (blow)](#animation-blow); [chapter 11, section 4](11-interaction-scripts.md#4-events).

### animation (blow)

Where: `{blow}` › `{self}`.    Type: text, an animation name.

Values: an animation of the soldier's skeleton.

Does: the animation the striker plays.

Limits: none recorded.

Example:
```
{animation "fight_front_club_begin"}
```

See: [self](#self); [chapter 11, section 4](11-interaction-scripts.md#4-events).

### enable_items

Where: `{blow}` › `{self}`.    Type: text list of tags.

Values: item tags; an empty hand counts as the tag `hands_empty`.

Does: the blow is offered only while the item in the right hand has one of these tags.

Limits: none recorded.

Example:
```
{enable_items "smg" "mgun" "rifle" "flame_thrower"}
```

See: [disable_items](#disable_items); [chapter 11, section 4](11-interaction-scripts.md#4-events).

### disable_items

Where: `{blow}` › `{self}`.    Type: text list of tags.

Values: item tags.

Does: the blow is not offered while the item in the right hand has any of these tags.

Limits: none recorded.

Example:
```
{disable_items "pistol"}
```

See: [enable_items](#enable_items); [chapter 11, section 4](11-interaction-scripts.md#4-events).

### fatigue

Where: `{blow}` › `{self}`.    Type: number.

Values: any.

Does: nothing; the value is read but used nowhere.

Limits: ignored.

Example:
```
{fatigue 10}
```

See: [self](#self); [chapter 11, section 4](11-interaction-scripts.md#4-events).

### opponent

Where: `{blow}`.    Type: block.

Values: `{orientation}`, `{movement}`, `{damage}`, `{knock_down_chance}`, `{knock_down_time}`.

Does: describes what happens to the target. The game picks the opponent block that matches the side the striker is on
and the target's pose.

Limits: none recorded.

Example:
```
{opponent {orientation back} {damage 60 0.75}
  {knock_down_chance 0.8} {knock_down_time 6 8}}
```

See: [orientation](#orientation); [chapter 11, section 4](11-interaction-scripts.md#4-events).

### orientation

Where: `{blow}` › `{opponent}`.    Type: word.

Values: `front` or `back`.

Does: the side of the target the striker is on for this opponent block.

Limits: none recorded.

Example:
```
{orientation front}
```

See: [opponent](#opponent); [chapter 11, section 4](11-interaction-scripts.md#4-events).

### movement

Where: `{blow}` › `{opponent}`.    Type: word list.

Values: `stand`, `squat`, `lie`.

Does: the target poses this opponent block applies to.

Limits: none recorded.

Example:
```
{movement stand squat}
```

See: [opponent](#opponent); [chapter 11, section 4](11-interaction-scripts.md#4-events).

### damage (blow)

Where: `{blow}` › `{opponent}`.    Type: one or two numbers.

Values: `A` and an optional `B`.

Does: `A` times the striker's melee `strength` is sent to the target's damage scripts as the value of the `blow` event.
`B` is used by the fight order for its timing. Vanilla rifle-butt blows use 60 from behind and 40 from the front; knife
blows use 150 and 200.

Limits: the result only does harm through the target's `blow` event script.

Example:
```
{damage 40 0.75}
```

See: [strength](#strength); [chapter 11, section 4](11-interaction-scripts.md#4-events).

### knock_down_chance

Where: `{blow}` › `{opponent}`.    Type: number, 0 to 1.

Values: 0 to 1.

Does: the base chance of knocking the target down. With a blow chance `c` below 0.99, the final chance is
`((1 - c) x knockdown_blow + c) x (1 - knockdown_melee)`, using the striker's melee level and the target's avoidance.

Limits: none recorded.

Example:
```
{knock_down_chance 0.3}
```

See: [chance (melee)](#chance-melee); [knockdown_melee](#knockdown_melee); [chapter 11, section 4](11-interaction-scripts.md#4-events).

### knock_down_time

Where: `{blow}` › `{opponent}`.    Type: two numbers, seconds.

Values: shortest and longest time.

Does: how long a knocked-down target stays down.

Limits: none recorded.

Example:
```
{knock_down_time 3 4}
```

See: [knock_down_chance](#knock_down_chance); [chapter 11, section 4](11-interaction-scripts.md#4-events).

## Stance machine

The stance machine (a finite state machine, FSM) is the set of states a soldier's body can be in (standing, walking,
lying, aiming) and the requests that move him between them. Vanilla writes it in `properties/human_fsm.ext` as
`{FSM "human" (include ...)}`.

### FSM

Where: `properties/human_fsm.ext`.    Type: block with a handler name.

Values: the handler name must be `"human"`.

Does: holds the soldier's state machine.

Limits: any other handler name logs `Unknown Fsm handler`. At load the game warns about states that are referenced but
missing (`fsm: state "x" not exist, but referenced`), states with no exit, and states that cannot be reached from
`start`.

Example:
```
{FSM "human"
  (include "human_fsm.inc")
}
```

See: [State](#state); [chapter 8, section 4](08-infantry-and-humans.md#4-stances-and-animation); [chapter 16, animations](16-effects-sound-models.md#animations-anm); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### Split

Where: `{FSM}`.    Type: number, whole.

Values: the number of parallel tracks; vanilla uses 2.

Does: splits the machine into tracks that run side by side, such as legs and arms.

Limits: it must come before any `split` inside a state or switch.

Example:
```
{Split 2}
```

See: [split](#split); [chapter 8, section 4](08-infantry-and-humans.md#4-stances-and-animation); [chapter 16, animations](16-effects-sound-models.md#animations-anm); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### Request

Where: `{FSM}`.    Type: block with a name.

Values: `{priority n}`, `{duration s}`, `{exit "state"}`, `{interrupt}`, `{switch "map" 0|1}`.

Does: an order the body can be given, such as `move` or `fire`. A higher priority request wins over a lower one.
Vanilla priorities: dead 50, throwoff 48, knock-down 47, kick 46, hold 45, pick and drop 43, up and down 40, reload 35,
unload 34, stop-move 32, move 30, snipe 29, hold-back 27, fire 25, aim 20, repair 5, idle 0.

Limits: none recorded.

Example:
```
{Request "move" {priority 30} {duration 2} {exit "stop-move"} {switch "walk" 1}}
```

See: [priority](#priority); [chapter 8, section 4](08-infantry-and-humans.md#4-stances-and-animation); [chapter 16, animations](16-effects-sound-models.md#animations-anm); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### priority

Where: `{Request}`.    Type: number, whole.

Values: higher wins.

Does: decides which request runs when two arrive together.

Limits: none recorded.

Example:
```
{Request "dead" {priority 50} {interrupt}}
```

See: [Request](#request); [chapter 8, section 4](08-infantry-and-humans.md#4-stances-and-animation); [chapter 16, animations](16-effects-sound-models.md#animations-anm); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### duration

Where: `{Request}`.    Type: number, seconds.

Values: positive.

Does: how long the request lasts before it ends.

Limits: none recorded.

Example:
```
{duration 2}
```

See: [exit](#exit); [chapter 8, section 4](08-infantry-and-humans.md#4-stances-and-animation); [chapter 16, animations](16-effects-sound-models.md#animations-anm); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### exit

Where: `{Request}`.    Type: text, a request name.

Values: another request name.

Does: the request that runs when this one ends.

Limits: none recorded.

Example:
```
{exit "stop-move"}
```

See: [Request](#request); [chapter 8, section 4](08-infantry-and-humans.md#4-stances-and-animation); [chapter 16, animations](16-effects-sound-models.md#animations-anm); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### interrupt

Where: `{Request}`.    Type: flag.

Values: present or absent.

Does: lets the request cut into a running one instead of waiting.

Limits: none recorded.

Example:
```
{Request "dead" {priority 50} {interrupt}}
```

See: [Request](#request); [chapter 8, section 4](08-infantry-and-humans.md#4-stances-and-animation); [chapter 16, animations](16-effects-sound-models.md#animations-anm); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### switch

Where: `{Request}`, or `{FSM}` as a map.    Type: block.

Values: inside a request, `{switch "map" 0|1}` turns a map off or on. As a map, `{switch "map" {link A B} {split idx
from to}}` swaps state A for state B while the map is on.

Does: lets one request change the meaning of states, such as walking instead of standing while `move` is active.

Limits: none recorded.

Example:
```
{switch "walk" {split 0 "stand" "walk"} {link "stand" "walk"}}
```

See: [link](#link); [chapter 8, section 4](08-infantry-and-humans.md#4-stances-and-animation); [chapter 16, animations](16-effects-sound-models.md#animations-anm); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### link

Where: a `{switch}` map.    Type: two state names.

Values: `{link A B}`.

Does: while the map is on, state A is replaced by state B.

Limits: none recorded.

Example:
```
{link "stand" "walk"}
```

See: [switch](#switch); [chapter 8, section 4](08-infantry-and-humans.md#4-stances-and-animation); [chapter 16, animations](16-effects-sound-models.md#animations-anm); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### Start

Where: `{FSM}`.    Type: text, a state name.

Values: an existing state.

Does: the state the soldier starts in.

Limits: a state that cannot be reached from it gets a load warning.

Example:
```
{Start "stand"}
```

See: [State](#state); [chapter 8, section 4](08-infantry-and-humans.md#4-stances-and-animation); [chapter 16, animations](16-effects-sound-models.md#animations-anm); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### State

Where: `{FSM}`.    Type: block with a name.

Values: `{tag}`, `{to}`, `{from}`, `{transit}`, `{fromTagged}`, `{condition}`, `{split}`.

Does: one pose or action of the body and the ways into and out of it.

Limits: transitions into `dead` and states without an exit get load warnings.

<!-- goh: GHHUM-52 GHHUM-37 GHHUM-72 GHHUM-30 GHHUM-28 -->
Gates of Hell: the game knows more states, among them `squat_idle`, `revive`, `stand_noaim`, `walk_start`, `walk_stop`,
`lie_idle`, `lie_bolt`, `lie_revive` and prone self-treatment states (head, hand, leg). They run only when the stance
data names them and the animations exist. The smoking idle is gone, and a soldier who dies standing in a swamp no
longer plays the drowning animation.

Example:
```
{State "board"
  {condition "board"} {from "stand"} {tag "board"}
}
```

See: [Start](#start); [chapter 8, section 4](08-infantry-and-humans.md#4-stances-and-animation); [chapter 16, animations](16-effects-sound-models.md#animations-anm); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### tag (state)

Where: `{State}`.    Type: text.

Values: any word.

Does: groups states so that `fromTagged` can name them all at once.

Limits: none recorded.

<!-- goh: GHHUM-67 GHHUM-68 -->
Gates of Hell: the state tag `no-fire` stops the soldier from firing, firing in a `move` state needs the weapon tag
`shoot_walking` or direct control, and a rocket launcher fires only from an `aim` state.

Example:
```
{tag "board"}
```

See: [fromTagged](#fromtagged); [chapter 8, section 4](08-infantry-and-humans.md#4-stances-and-animation); [chapter 16, animations](16-effects-sound-models.md#animations-anm); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### to, from

Where: `{State}`.    Type: text, a state name.

Values: an existing state.

Does: the states this one can go to and come from.

Limits: a name that does not exist logs `fsm: state "x" not exist, but referenced`.

Example:
```
{to "stand"} {from "squat"}
```

See: [transit](#transit); [chapter 8, section 4](08-infantry-and-humans.md#4-stances-and-animation); [chapter 16, animations](16-effects-sound-models.md#animations-anm); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### transit

Where: `{State}`.    Type: text, a state name.

Values: an existing state.

Does: a state passed through on the way, such as the animation between lying and standing.

Limits: none recorded.

Example:
```
{transit "stand"}
```

See: [to, from](#to-from); [chapter 8, section 4](08-infantry-and-humans.md#4-stances-and-animation); [chapter 16, animations](16-effects-sound-models.md#animations-anm); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### fromTagged

Where: `{State}`.    Type: text, a tag.

Values: a state tag.

Does: the state can be entered from every state with this tag.

Limits: none recorded.

Example:
```
{fromTagged "up"}
```

See: [tag (state)](#tag-state); [chapter 8, section 4](08-infantry-and-humans.md#4-stances-and-animation); [chapter 16, animations](16-effects-sound-models.md#animations-anm); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### condition

Where: `{State}`.    Type: text.

Values: a condition word known to the soldier's handler.

Does: the state is only used while the condition holds.

Limits: none recorded.

Example:
```
{State "board" {condition "board"} {from "stand"}}
```

See: [subset](#subset); [chapter 8, section 4](08-infantry-and-humans.md#4-stances-and-animation); [chapter 16, animations](16-effects-sound-models.md#animations-anm); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### split

Where: `{State}` or a `{switch}` map.    Type: number and state names.

Values: a track index below `Split`.

Does: says which track of the machine the state or swap belongs to.

Limits: `Split` must be set first.

Example:
```
{split 0 "stand" "walk"}
```

See: [Split](#split); [chapter 8, section 4](08-infantry-and-humans.md#4-stances-and-animation); [chapter 16, animations](16-effects-sound-models.md#animations-anm); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### subset

Where: `{FSM}`.    Type: block with a name and an optional `from`.

Values: `{enable ...}`, `{disable ...}` with request names.

Does: switches a group of requests on or off while the subset is active. Vanilla's `with_item` subset disables `down`,
`squat`, `looking`, `repair` and `step-aside` while the soldier carries a heavy item.

Limits: none recorded.

Example:
```
{subset "with_item" {disable "down" "squat"}}
```

See: [enable, disable](#enable-disable); [chapter 8, section 4](08-infantry-and-humans.md#4-stances-and-animation); [chapter 16, animations](16-effects-sound-models.md#animations-anm); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### enable, disable

Where: `{subset}`.    Type: text list of request names.

Values: request names.

Does: requests allowed or blocked inside the subset.

Limits: none recorded.

Example:
```
{disable "repair" "step-aside"}
```

See: [subset](#subset); [chapter 8, section 4](08-infantry-and-humans.md#4-stances-and-animation); [chapter 16, animations](16-effects-sound-models.md#animations-anm); [Part I: Edit a model or an animation](p06-edit-a-model.md).

### weapon mode tags

Where: tags on the held item.    Type: tags.

Values: one of `rocketlauncher`, `mgun`, `smg`, `rifle`, `pistol`, `flamethrower`, together with the tag `weapon`.

Does: picks the weapon pose set of the soldier. When an item has several of these tags, the first in this order wins.

Limits: an item without the `weapon` tag never gets a weapon pose, even if it has a type tag. A pistol plays its walking
fire animations only when it also carries the tag `shoot_walking`; without it the soldier runs with the empty-handed run
animations.

<!-- goh: GHHUM-48 GHHUM-49 GHHUM-55 GHHUM-50 GHHUM-51 GHHUM-71 -->
Gates of Hell: adds the weapon class `shortsmg` between `mgun` and `smg` (it wins over `smg`), the tag `bolt_action` for
bolt cycling after a shot, and the tags `shoot_walking_manual` and `shoot_walking_ai` beside `shoot_walking` (see
[Gates of Hell only](#gates-of-hell-only)). Prone riflemen and rifle walking fire use their own `rifle` animations, and
long guns lose the look-around and assault standing poses. Each of these needs its animations in the soldier's
animation set.

Example:
```
{tags "weapon" "rifle"}
```

See: [fsm](#fsm); [chapter 8, section 4](08-infantry-and-humans.md#4-stances-and-animation); [chapter 16, animations](16-effects-sound-models.md#animations-anm); [Part I: Edit a model or an animation](p06-edit-a-model.md).

## Morale and self-healing

Morale has no keys you can set in data; it is described here because breeds and scripts work around it. Morale runs from
0 to 100. It rises by about 0.83 a second on its own, but not for 10 seconds after a loss. A wounded soldier loses 20
times the fraction of health he lost, and his attacker gains the same. A kill gives +10. Friends within 20 metres share
+10 when an enemy is killed and share -60 when a friend dies. The bots change tactics at 70, 50 and 30. A computer
soldier may flee: always below 10 percent health, with a 70 percent chance below 20 percent and a 30 percent chance below
30 percent. There is no suppression in this game. The brain properties `no_retreat` and `retreat_ratio` control
retreat (see [Reference 12](r12-bot-lua-and-console.md), bot Lua functions and console commands).

A soldier heals himself when his health is below 70 percent, he has a bandage, he has not seen an enemy for 5 seconds,
and the player is not holding him in place. Healing gives 9.6 percent a second, 30 percent per bandage, and repeats while
his health is at most 85 percent.

<!-- goh: GHHUM-66 GHHUM-01 -->
Gates of Hell: self-healing uses the same bandage and 85 percent rules, but health comes back while the bandaging
animation plays, and when he stops he takes his last item back into his hand. A soldier with a medic ability goes to
wounded friends on his own, in cover and in battle, before he attacks; whether he also does so when standing idle in the
open is not confirmed.

## Save fields

These names appear in save files and in some vanilla `.def` files. They hold the state of a soldier and are written by
the game; you rarely set them by hand.

### Veterancy, Dying, Dead

Where: soldier entity in a save or `.def`.    Type: number or flag.

Values: as saved by the game.

Does: the soldier's rank, whether he is dying, and whether he is dead.

Limits: none recorded.

<!-- goh: GHHUM-07 GHHUM-12 -->
Gates of Hell: `Veterancy` runs from 0 to 8; a GoH save or `.def` with rank 6 to 8 loads here as rank 5. A knocked-out
hero saved while dying keeps his remaining time to death; here each load starts a fresh delay.

Example:
```
{Veterancy 2}
```

See: [veterancy (breed)](#veterancy-breed); [chapter 8, section 1](08-infantry-and-humans.md#1-the-human-entity).

### Human state fields

Where: soldier entity in a save.    Type: varied.

Values: `Cover`, `FsmState`, `RunningSpeed`, `LastItem`, `LastThrowItem`, `Armor`, `Attack`, `Physics`, `NameId`, `Skin`,
`Knockdown`, `LastDyingAnimation`, `StandFromLieBack`.

Does: hold the soldier's cover, stance, speed, held item, name, skin and knockdown state between save and load.

Limits: none recorded.

Example:
```
{Skin "ger_t2"}
```

See: [Stance machine](#stance-machine); [chapter 8, section 1](08-infantry-and-humans.md#1-the-human-entity).

## Not described yet

These names appear in the data or in a tool's key list, but no source describes them well enough for an entry.

- `keys` (blow)

<!-- internal -->

- `SetSpeed` (soldier script call): only a lowercase `setspeed` string in the exe; not found in vanilla text data.

<!-- /internal -->

## Gates of Hell only
<!-- goh: GHHUM-24 GHHUM-25 GHHUM-26 GHHUM-27 GHGPL-03 GHGPL-34 GHHUM-04 GHHUM-05 GHHUM-20 GHDC-54 GHDMG-21 GHHUM-48 GHHUM-49 GHHUM-55 GHHUM-67 GHHUM-72 GHHUM-31 -->

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you
depend on them.

These keys, tags and names of this page's area exist only in Gates of Hell (GoH). This game does not know them: remove
or replace them when you port a GoH soldier, then read `game.log`. The steps of a port are in
[Bring a unit from Gates of Hell](p12-unit-from-gates-of-hell.md); how the two games differ for soldiers is summed up in
[chapter 8](08-infantry-and-humans.md#gates-of-hell-summary).

### no_inventory (breed)

Where: `{breed}`, after `hero`.    Type: flag.

Values: present or absent.

Does: the soldier starts with an empty box of size zero. Armour pieces of the breed are still put on.

Limits: this game does not know the key and the breed fails to load; remove it when you port.

Form:
```
{no_inventory}
```

No stock Gates of Hell file uses it.

See: [breed](#breed); [inventory (breed)](#inventory-breed); [chapter 8, section 7](08-infantry-and-humans.md#7-inventory-and-reload).

### field_icon (breed)

Where: `{breed}`, between `portrait` and `icon`.    Type: text, a picture name.

Values: the name of an interface picture.

Does: gives the soldier a second icon that the interface can show; where GoH shows it is not confirmed.

Limits: remove it when you port.

Example:
```
{portrait ger_engineer}
{field_icon "ger_miner_ap"}
{icon tech}
```

See: [breed](#breed); [chapter 8, section 6](08-infantry-and-humans.md#6-breeds).

### Medic, Personage, Fortification and Mechanic (ability)

Where: a breed's `{perks}`, by the kind's name in lower case; Gates of Hell data keeps them in shared perk presets
that its breeds include.    Type: ability kind.

Values: `Medic` takes two plain numbers, a rate (5 when absent) and a veterancy (0); `Personage` one whole number (0 when
absent); `Fortification` an optional factor (Gates of Hell data writes it bare); `Mechanic` the word `veterancy` (or
`vet`) or the word `factor`, then a number.

Does: `Medic` lets the soldier heal others, and a medic goes to wounded friends on his own. `Personage` marks a hero,
who is knocked out before he dies. `Fortification` scales how fast he builds field works. `Mechanic` sets how fast he
repairs; any soldier who can repair may repair, and the perk only makes it faster.

Limits: this game knows the four names but does nothing with them.

Example:
```
{"medic" 10.0}
{"personage" 0}
{fortification}
{mechanic factor 1.0}
```

See: [ability block](#ability-block); [chapter 8, section 5](08-infantry-and-humans.md#5-abilities-weapon-skill-and-veterancy).

### Barricade (ability)

Where: a breed's `{perks}`, written `barricade`.    Type: ability kind.

Values: `{"fortifications" "name"}` rows, one per field work, and `{factor}`.

Does: lets the soldier build the listed field works; a `factor` of 0 forbids building them.

Limits: unknown to this game.

Example:
```
{barricade
  {"fortifications" "foxhole"}
  {"fortifications" "medic_rally"}
}
```

See: [ability block](#ability-block); [Fortification](#medic-personage-fortification-and-mechanic-ability).

### Resources and Resources_Regeneration (ability)

Where: `set/ability/*.set`, as blocks `{resources ...}` and `{resources_regeneration ...}` with levels named by percent;
a breed's `{perks}` picks a level.    Type: ability kind.

Values: a factor per level.

Does: scale the size and the refill rate of a unit's own stock of resources, a GoH unit property (`{Resources {max}
{current} {income}}`, 100, 100 and 0 when absent, refilled every 0.3 seconds by `income` per second).

Limits: unknown to this game, and so is the stock.

Example:
```
{resources
  {level "10%" 0.1}
  {level "1000%" 10.0}
}
{"resources" "1000%"}
{"resources_regeneration" "0%"}
```

See: [ability block](#ability-block).

### weapon_sway_control (ability)

Where: `set/ability/*.set`.    Type: ability kind, one plain number.

Values: a factor.

Does: multiplies the `sway` of the soldier's weapon skill, for a gun in his hands and for a crew gun he works.

Limits: unknown to this game.

No stock Gates of Hell file uses it.

See: [recoil, zoom_recoil and sway (skill)](#recoil-zoom_recoil-and-sway-skill).

### recoil, zoom_recoil and sway (skill)

Where: a posture block (`stand`, `squat`, `crawl`, `cover`, `vehicle`, `default`) of a weapon skill level.
Type: number, a factor.

Values: 1 when absent.

Does: `recoil` scales how far the gun kicks with each shot, `zoom_recoil` does the same while the player aims down the
sights, and `sway` scales how much the gun swings. The game's difficulty setting adds its own recoil factor. The kick is
held for a moment, then the gun returns in a straight line. For a crew gun the game takes the best recoil and the
smallest sway among the crewmen in working seats whose skill matches the gun. Computer soldiers do not feel the kick.

Limits: this game reads only `accuracy` and `aim_range` here and ignores the other three without a message.

Example:
```
{level "lvl_1"
  {stand
    {accuracy 0.65}
    {recoil 1.00}
    {zoom_recoil 1.25}
    {sway 0.90}
  }
}
```

See: [stand, squat, crawl, cover, vehicle](#stand-squat-crawl-cover-vehicle); [default (skill)](#default-skill); [weapon_sway_control](#weapon_sway_control-ability).

### Damage, DamageTPC and DamageBlast

Where: the vitality block.    Type: `Damage` and `DamageTPC` a list of `{"volume" factor}`; `DamageBlast` a number.

Values: each factor 1 when absent.

Does: `Damage` multiplies the damage of a hit on that volume of the body, for example more for the head and less for an
arm. `DamageTPC` is used instead when the attacker is under direct control; it starts as a copy of `Damage` and its own
entries replace those. `DamageBlast` multiplies all blast damage.

Limits: this game logs `unexpected token` for all three.

Example:
```
{Damage
  {"head" 1.3}
  {"face" 1.3}
  {"body" 1.0}
  {"hand1r" 0.80}
}
{DamageBlast 1.00}
```

See: [Health (vitality)](#health-vitality); [chapter 8, section 2](08-infantry-and-humans.md#2-health-stamina-and-death).

### bolt_action

Where: `{tags}` of a weapon item.    Type: tag.

Values: the word `bolt_action`.

Does: the soldier works the bolt after each shot. Standing he plays `stand_bolt_rifle_up` (`stand_bolt_rifle_open_up`
when the magazine is empty) with `stand_bolt_rifle_down` for the legs; crouching `squat_bolt_rifle`
(`squat_bolt_rifle_open`). The stance data needs the states `bolt`, `squat_bolt` and `stand_bolt`.

Limits: unknown tag here; the rifle fires without the bolt animation.

Example:
```
{tags "weapon" "rifle" "bolt_action"}
```

See: [weapon mode tags](#weapon-mode-tags); [State](#state).

### shortsmg

Where: `{tags}` of a weapon item.    Type: tag, a weapon class.

Values: the word `shortsmg`; it wins over `smg` when both are present.

Does: gives the weapon its own poses and fire animations, among them `pose_stand_fire_gun_short_up`,
`stand_fire_gun_short_up`, `pose_squat_fire_gun_short`, `squat_fire_gun_short` and `walk_normal_gun_short_up`. Lying, it
uses the ordinary gun pose.

Limits: a weapon with this tag and no such animations plays nothing. This game does not know the class.

Example:
```
{tags "weapon" "shortsmg"}
```

See: [weapon mode tags](#weapon-mode-tags).

### shoot_walking_manual and shoot_walking_ai

Where: `{tags}` of a weapon item.    Type: tag.

Values: the two words.

Does: allow firing while walking, by who controls the soldier: `shoot_walking_manual` under direct control,
`shoot_walking` when the player gives orders, `shoot_walking_ai` for computer soldiers.

Limits: a weapon carried over with only `shoot_walking` cannot be fired while walking under direct control or by
computer soldiers in GoH.

Example:
```
{tags "weapon" "pistol" "shoot_walking" "shoot_walking_ai"}
```

See: [weapon mode tags](#weapon-mode-tags); [tag (state)](#tag-state).

### no-fire (state tag)

Where: `{tag}` of a stance state.    Type: tag.

Values: the word `no-fire`.

Does: the soldier cannot fire while in that state.

Limits: in this game the tag is only a name for `fromTagged`.

Example:
```
{tag "no-fire"}
```

See: [tag (state)](#tag-state); [State](#state).

### lie_self-treatment animations

Where: the soldier's animation set.    Type: animation names.

Values: `lie_self-treatment_head_begin`, `lie_self-treatment_head`, `lie_self-treatment_head_end`, and the same three
for `hand` and for `leg`.

Does: a lying soldier bandages himself with these. This game has only the `squat_self-treatment_*` set.

Limits: a GoH soldier needs all nine in his animation set.

Example:
```
lie_self-treatment_leg_begin
```

See: [Morale and self-healing](#morale-and-self-healing); [State](#state).

### select_idle (effect)

Where: the soldier's interaction script, as the handler `{on "select_idle" ...}`.    Type: effect name.

Values: a handler that picks idle animations with `set_idle_animation`.

Does: when present, it picks the idle animations instead of the game. Without it only a standing soldier idles; with
empty hands or a small item he plays `stand_idle_empty` most of the time.

Limits: this game picks idles on its own and has no such effect.

Example:
```
{on "select_idle"
  ...
  else squatting
    ("select_idle_empty_or_gun" probability(0.5) no_gun("idle_crouch_empty") with_gun("idle_crouch_gun"))
  ...
}
```

See: [State](#state); [chapter 16, animations](16-effects-sound-models.md#animations-anm).
