// pro ext: writes catalog.json (the tool list the single exe uses when tools/index/*.md is absent). Run after tools/index changes:
//   node tools/gui/ext/pro/gen-catalog.js
// Author: Imperator_Aug (ARSENAL, ia-3a02f113)
'use strict';
const fs = require('fs'), path = require('path');
const C = require('./catalog');
const TOOLS = path.join(__dirname, '..', '..', '..');
const tools = C.mark(C.parseAll(TOOLS), TOOLS);   // dev:true rows stay in the file; the launcher hides them (GT-24)
fs.writeFileSync(path.join(__dirname, 'catalog.json'), JSON.stringify({ tools }, null, 0).replace(/\},\{/g, '},\n{') + '\n');
console.log('catalog.json: ' + tools.length + ' tools');
