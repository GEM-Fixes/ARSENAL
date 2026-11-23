// node checkmod.js <mod dir>: mod.info must be exactly the cp1251/CRLF MinGameVersion 3.301 stub
// Author: Imperator_Aug (ARSENAL, ia-506cb737)
const b = require('fs').readFileSync(require('path').join(process.argv[2], 'mod.info'), 'latin1');
const name = require('path').basename(process.argv[2]);
process.exit(b === '{Mod\r\n {Name "' + name + '"}\r\n {MinGameVersion "3.301"}\r\n}\r\n' ? 0 : 1);
