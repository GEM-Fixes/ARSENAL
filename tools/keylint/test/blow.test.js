// TOOLFIX-MIX: set/blow keys are judged against (unknown key = ERROR_MSG, file fails to load). prints BLOW-OK or failures
// Author: Imperator_Aug (ARSENAL, ia-a2eafed9)
const fs = require('fs'), path = require('path'), os = require('os'), keylint = require('../keylint');
const w = fs.mkdtempSync(path.join(os.tmpdir(), 'keylint-blow-')), d = path.join(w, 'mod/resource/set/blow');
fs.mkdirSync(d, { recursive: true });
const good = '{blow\r\n\t{tags "butt"}\r\n\t{distance far}\r\n\t{self\r\n\t\t{animation "x"}\r\n\t}\r\n\t{opponent\r\n\t\t{orientation back}\r\n\t\t{damage 60 0.75}\r\n\t}\r\n}\r\n';
fs.writeFileSync(path.join(d, 'good.set'), good);
fs.writeFileSync(path.join(d, 'bad.set'), good.replace('{damage 60 0.75}', '{damage 60 0.75}\r\n\t\t{dmg 1}'));
let bad = 0;
try {
  const f = keylint.run({ folder: path.join(w, 'mod') }).toJSON({ tool: 'keylint' }).findings;
  const hits = f.filter(x => x.code === 'KEY_FATAL' && /"dmg"/.test(x.msg) && /FATAL/.test(x.msg));
  if (hits.length !== 1 || f.length !== 1) { bad++; console.log('FAIL: ' + JSON.stringify(f)); }
} finally { fs.rmSync(w, { recursive: true, force: true }); }
console.log(bad ? 'BLOW-FAIL' : 'BLOW-OK');
