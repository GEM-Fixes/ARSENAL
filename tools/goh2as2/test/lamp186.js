// PORT-186: dropLamplessLight drops {extender "light"} whose {lamp "N"} has no ..lamp_glassN bone; keeps it when the bone exists or bones are unknown.
// Author: Imperator_Aug (ARSENAL, ia-63de3b1a)
const fs = require('fs'), path = require('path');
const s = fs.readFileSync(path.join(__dirname, '../goh2as2.js'), 'utf8');
const dropLamplessLight = new Function(s.slice(s.indexOf('function dropLamplessLight'), s.indexOf('function boneTypesOf')) + '; return dropLamplessLight;')();
const def = '{entity\r\n\t{extender "inventory"\r\n\t}\r\n\t{extender "light"\r\n\t\t{lamp "1"}\r\n\t\t{lightfx "light_search"}\r\n\t\t{breakfx "glass_hit"}\r\n\t}\r\n\t{extender "bone_rotator"\r\n\t}\r\n}\r\n';
let ok = true; const t = (c, m) => { if (!c) { console.log('FAIL lamp186: ' + m); ok = false; } };
let r = dropLamplessLight(def, new Map([['body', ''], ['turret', '']]));
t(r.n === 1 && !/"light"/.test(r.text) && /"inventory"/.test(r.text) && /"bone_rotator"/.test(r.text), 'no lamp_glass1 bone: light block dropped, others kept');
t(!/\n\r?\n/.test(r.text), 'no blank line left behind');
t(dropLamplessLight(def, new Map([['lamp_glass1', '']])).n === 0, 'lamp_glass1 bone present: kept');
t(dropLamplessLight(def, new Map([['searchlight_lamp_glass1', '']])).n === 0, 'bone matched by name suffix');
t(dropLamplessLight(def, null).n === 0, 'unknown bones: kept');
if (ok) console.log('lamp186 ok'); process.exit(ok ? 0 : 1);
