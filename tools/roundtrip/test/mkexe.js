// made-up game for the --exe test: as64.exe + resource/x/b.def + as64/core/resource/x/c.def (as64/core is mounted only for as64)
// Author: Imperator_Aug (ARSENAL, ia-5c1908f2)
const fs = require('fs'), path = require('path');
const g = path.join(__dirname, 'fixture-exe');
fs.rmSync(g, { recursive: true, force: true });
const put = (rel, text) => { const f = path.join(g, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
put('as64.exe', '');
put('resource/x/b.def', ';SDL\r\n{a 1}\r\n');
put('as64/core/resource/x/c.def', ';SDL\r\n{a 2}\r\n');
