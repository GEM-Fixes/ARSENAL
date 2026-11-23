// PORT_PROPS_COPIED + PORT_PROPS_SHADOWED case: node check2.js <outdir> <report text file>
// Author: Imperator_Aug (ARSENAL, ia-bcc5b601)
const fs = require('fs'), path = require('path');
const out = path.join(process.argv[2], 'resource'), txt = fs.readFileSync(process.argv[3], 'utf8');
let bad = 0;
const ck = (c, m) => { if (!c) { console.log('FAIL ' + m); bad++; } };
const rd = r => fs.readFileSync(path.join(out, r), 'latin1');
ck(fs.existsSync(path.join(out, 'properties/new_a.ext')) && fs.existsSync(path.join(out, 'properties/new_b.inc')), 'absent props copied with transitive include');
ck(!fs.existsSync(path.join(out, 'properties/have.inc')), 'prop present in AS2 does not land on the AS2 path');
ck(fs.existsSync(path.join(out, 'properties/goh/have.inc')) && rd('properties/goh/have.inc').includes('goh version'), 'prop present in AS2 shadowed under properties/goh, GoH text');
ck(rd('entity/pc/pcopy.def').includes('"/properties/goh/have.inc"') && rd('properties/new_a.ext').includes('"/properties/goh/have.inc"'), 'includes rewritten to the shadow path');
ck(rd('entity/pc/pcopy.def').includes('"/properties/new_a.ext"'), 'include of a copied prop unchanged');
ck(rd('properties/goh/have2.inc').includes('"/properties/new_b.inc"') && rd('properties/goh/have2.inc').includes('"/properties/goh/have.inc"'), 'shadowed file: relative includes made absolute');
ck(!fs.existsSync(path.join(out, 'properties/bad.inc')) && !fs.existsSync(path.join(out, 'properties/goh/bad.inc')), 'prop with NoVisibilityPatch not copied');
ck(!rd('properties/new_a.ext').includes('caststeel'), 'copied prop converted (volume key dropped)');
ck(rd('properties/new_a.ext').includes('{vision "tank_main-m"}') && rd('properties/new_a.ext').includes('{vision "human"}') && /WARN_PORT_VISION_NAME/.test(txt), 'unknown vision mapped, known kept');
ck((txt.match(/PORT_PROPS_COPIED/g) || []).length === 2, 'two PORT_PROPS_COPIED lines');
ck((txt.match(/PORT_PROPS_SHADOWED/g) || []).length === 2, 'two PORT_PROPS_SHADOWED lines');
ck(!/WARN_PORT_SHARED_PROPS[^\n]*have\.inc/.test(txt) && /WARN_PORT_SHARED_PROPS[^\n]*bad\.inc[^\n]*NoVisibilityPatch/.test(txt), 'SHARED_PROPS only for the rejected one');
process.exit(bad ? 1 : 0);
