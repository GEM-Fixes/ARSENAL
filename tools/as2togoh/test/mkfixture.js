// as2togoh fixture: seeded AS2 mod (cp1251+CRLF) + fake GoH tree with one vehicle pak. defects in truth.md
// Author: Imperator_Aug (ARSENAL, ia-e74e93ad)
const fs = require('fs'), path = require('path');
const { writeZip } = require('../../lib/zipwrite');
const root = path.join(process.env.TEST_WORK || __dirname, 'fixture');
fs.rmSync(root, { recursive: true, force: true });
const cp = s => { const b = []; for (const ch of s.replace(/\n/g, '\r\n')) { const c = ch.codePointAt(0); b.push(c >= 0x410 && c <= 0x44f ? c - 0x410 + 0xC0 : c); } return Buffer.from(b); };
const put = (rel, txt) => { const p = path.join(root, 'mod', rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, cp(txt)); };
put('mod.info', `{mod
  {name "t"}
  {minGameVersion "3.301"}
  {maxGameVersion "3.999"}
}
`);
const R = 'resource/';
put(R + 'entity/-inventory/weapon/small_arms/smg/mp40/mp40.def', `{actor
  (include "/properties/stuff_small.ext")
  {mdl "mp40.mdl"}
}
`);
put(R + 'entity/-inventory/weapon/small_arms/smg/mp40/mp40.mdl', `{model
  {bone "foresight3" {x 1}}
}
`);
put(R + 'set/stuff/smg/mp40', `{from "pattern smg"
  {entity "mp40"}
}
`);
put(R + 'set/stuff/rifle/k98', `{from "pattern rifle"
  {entity "k98missing"}
}
`);
put(R + 'set/stuff/pistol/p38', `{from "pattern pistol"
  {entity "p38"}
}
`);
put(R + 'set/stuff/head/m40', `{from "helmet pattern"
  {entity "m40"}
  {comment "шлем"}
}
`);
put(R + 'set/stuff/head/fieldcap', `{from "helmet pattern"
  {entity "fieldcap"}
}
`);
put(R + 'set/stuff/head/odd', `{from "weird"
  {entity "odd"}
}
`);
put(R + 'set/stuff/body/coat', `{from "pattern overcoat"
  {entity "coat"}
}
`);
put(R + 'entity/-inventory/equipment/body/coat/coat.def', `{actor
  {mdl "coat.mdl"}
}
`);
put(R + 'entity/-vehicle/ger/tank_medium/pz4/pz4.def', `{game_entity
  (include "/properties/tank_as2.ext")
  {extension "pz4.mdl"}
}
`);
put(R + 'entity/-vehicle/ger/car/kubel/kubel.def', `{game_entity
  {extension "kubel.mdl"}
}
`);
put(R + 'entity/-vehicle/ger/tank_medium/pz4/x/pz4_x.def', `{game_entity
  {extension "pz4_x.mdl"}
}
`);
fs.mkdirSync(path.join(root, 'goh/resource/entity'), { recursive: true });
const crlf = s => Buffer.from(s.replace(/\n/g, '\r\n'));
writeZip(path.join(root, 'goh/resource/entity/veh.pak'), [
  ['-vehicle/ussr/tank_medium/t34/t34.def', crlf(`{game_entity
	(include "/properties/tank.ext")
	{extension "t34.mdl"}
	(include "t34.ext")
	{mass 30000}
}
`)],
  ['-vehicle/ussr/tank_medium/t34/t34.ext', crlf('{x}\n')],
]);
