// LIM-1: donorGunLimits writes the donor mdl's gun limits when the GoH rep's sit above them on both ends (both elevation-major); else leaves the rep's.
// Author: Imperator_Aug (ARSENAL, ia-22ba88a8)
const fs = require('fs'), path = require('path');
const s = fs.readFileSync(path.join(__dirname, '../goh2as2.js'), 'utf8');
const donorGunLimits = new Function(s.slice(s.indexOf('function donorGunLimits'), s.indexOf('// the mdl that goes with a def')) + '; return donorGunLimits;')();
const mdl = (t, g) => `{skeleton\r\n\t{bone revolute "turret"\r\n\t\t{limits ${t}}\r\n\t\t{bone revolute "gun_rot"\r\n\t\t\t{limits ${g}}\r\n\t\t\t{bone "gun"\r\n\t\t\t}\r\n\t\t}\r\n\t}\r\n}\r\n`;
let ok = true; const t = (c, m) => { if (!c) { console.log('FAIL lim1: ' + m); ok = false; } };
let r = donorGunLimits(mdl('-30 30', '-5 85'), mdl('-180 180', '-15 65'));
t(r.changes.length === 1 && /gun_rot"\r\n\t\t\t\{limits -15 65\}/.test(r.text) && /\{limits -30 30\}/.test(r.text), '20mm_type_2 case: gun_rot -5 85 -> -15 65, turret kept');
t(donorGunLimits(mdl('-30 30', '-5 45'), mdl('-30 30', '-17 10')).changes.length === 0, 'donor of the other sign (pak40 -17 10): kept');
t(donorGunLimits(mdl('-30 30', '-5 40'), mdl('-30 30', '-5 40')).changes.length === 0, 'same limits: kept');
t(donorGunLimits(mdl('-30 30', '-20 85'), mdl('-30 30', '-15 65')).changes.length === 0, 'rep deeper than donor on the low side: kept');
t(donorGunLimits(mdl('-30 30', '-5 60'), mdl('-30 30', '-15 65')).changes.length === 0, 'rep max below donor max: kept');
t(donorGunLimits(mdl('-30 30', '-5 85'), '{skeleton\r\n\t{bone revolute "gun_rot"\r\n\t}\r\n}\r\n').changes.length === 0, 'donor has no limits: kept');
if (ok) console.log('lim1 ok'); process.exit(ok ? 0 : 1);
