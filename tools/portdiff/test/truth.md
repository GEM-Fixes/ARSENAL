# one defect per line (file: CODE detail); counts stripped. fixture: as2 loose, goh loose + entity.pak
entity/a.def: WARN_PORT_KEY_AS2_ONLY def game_entity > armor
entity/a.def: WARN_PORT_KEY_AS2_ONLY def game_entity/armor > durability
entity/a.def: WARN_PORT_KEY_AS2_ONLY def game_entity/blk >
entity/a.def: WARN_PORT_KEY_GOH_ONLY def game_entity > perks
entity/a.def: WARN_PORT_KEY_GOH_ONLY def game_entity/perks > component
entity/a.def: WARN_PORT_SHAPE_DIFF def game_entity > bar GoH S vs AS2 I
entity/a.def: WARN_PORT_SHAPE_DIFF def game_entity > foo GoH II vs AS2 I
entity/a.def: WARN_PORT_STRUCT_DIFF def game_entity > blk GoH scalar vs AS2 block
entity/bad.def: WARN_PORT_PARSE_FAIL GoH BLOCK_UNCLOSED line 2
entity/c.mtl: WARN_PORT_KEY_AS2_ONLY mtl material > layer
entity/c.mtl: WARN_PORT_KEY_AS2_ONLY mtl material/layer > bump
entity/c.mtl: WARN_PORT_KEY_GOH_ONLY mtl material > lightmap
entity/gv.def: WARN_PORT_ARMOR_HEALTH_CUSTOM GoH line 10: "armor health custom" x1: filler formula the game has no such key (PORT-03)
entity/gv.def: WARN_PORT_HARDNESS_NO_ENGINE GoH line 2: {CastSteel}/{HighHardness} x2: no engine support, strength bonus lost (PORT-01)
entity/gv.def: WARN_PORT_KEY_GOH_ONLY def game_entity > delay
entity/gv.def: WARN_PORT_KEY_GOH_ONLY def game_entity > highhardness
entity/gv.def: WARN_PORT_KEY_GOH_ONLY def game_entity/volume > caststeel
entity/s.vso: PORT_EXT_GOH_ONLY .vso
entity/veh.def: WARN_PORT_ARMOR_MACRO_OVERRIDES_THICKNESS AS2 line 6: armor_* macro with nonzero args (line 6) overrides per-volume {thickness} (line 7, x1): edit the macro args (PORT-05)
entity/veh.def: WARN_PORT_BONE_SPEED_UNITS AS2 line 2: bone {speed 12} is rad-scaled (x2865 = deg/s => 34380 deg/s); GoH-style deg/s belongs in {speed2} (PORT-10)
entity/veh.def: WARN_PORT_BONE_SPEED_UNITS AS2 line 4: bone {speed2 0.004} is deg/s (looks rad-scaled, 11.5 deg/s if it were {speed}) (PORT-10)
entity/veh.def: WARN_PORT_KEY_AS2_ONLY def game_entity > bone
entity/veh.def: WARN_PORT_KEY_AS2_ONLY def game_entity/bone > limits
entity/veh.def: WARN_PORT_KEY_AS2_ONLY def game_entity/bone > speed
entity/veh.def: WARN_PORT_KEY_AS2_ONLY def game_entity/bone > speed2
entity/veh.def: WARN_PORT_KEY_AS2_ONLY def game_entity/volume > thickness
set/stuff/gun/g2.weapon: WARN_PORT_KEY_GOH_ONLY set/stuff.weapon weapon_bullet > parameters
set/stuff/gun/g2.weapon: WARN_PORT_KEY_GOH_ONLY set/stuff.weapon weapon_bullet/parameters > projectiledamagetable
set/stuff/gun/g2.weapon: WARN_PORT_KEY_GOH_ONLY set/stuff.weapon weapon_bullet/parameters/projectiledamagetable > #n
set/stuff/gun/g2.weapon: WARN_PORT_PEN_TAG_NO_EXACT GoH pen-table tag "apc" has no exact AS2 ammo tag (near: apcbc - apc != apcbc) n=1 (PORT-07)
set/stuff/v.weapon: WARN_PORT_KEY_GOH_ONLY set/stuff.weapon weapon_bullet/from > calibre
set/stuff/v.weapon: WARN_PORT_STRUCT_DIFF set/stuff.weapon weapon_bullet > from GoH block vs AS2 scalar
shader/cache/x.pso: PORT_EXT_GOH_ONLY .pso
entity/gov.def: WARN_PORT_OVERMATCH_CALIBRE GoH line 2: overmatchCalibre / *_slope_multipliers x1: per-shell slope tables the game has no such key (only calibre/projectileDamageThreshold/OvermatchDamping) (PORT-02)
entity/-vehicle/gx.def: WARN_PORT_KEY_GOH_ONLY def game_entity > extra
