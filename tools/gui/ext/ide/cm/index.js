// ide cm: the text engine layer. Exports { js, css } built at require time:
// js  = raw ES5 script served as ide.js after cm.js (modes sdl/lng/log/text + window.IDE_ED per tools/ide/README.md)
// css = raw CSS served as ide.css after cm.css (GEM2 + light theme from tools/ide/palette.js, marks, card, compare)
// Sources: util.src.js, modes.src.js, editor.src.js (browser code kept as plain files so selfcheck.js can load them).
// Author: Imperator_Aug (ARSENAL, ia-1205841d)
'use strict';
const fs = require('fs');
const path = require('path');
const theme = require('./theme.js');

const SRC = ['util.src.js', 'modes.src.js', 'editor.src.js'];
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');

const js = [
  '/* ide editor (tools/gui/ext/ide/cm) */',
  '(function () {',
  '"use strict";',
  'var IDE_ATOMS = ' + JSON.stringify(theme.atoms()) + ';',
].concat(SRC.map(read)).concat(['})();', '']).join('\n');

const css = theme.css();

module.exports = { js, css };
