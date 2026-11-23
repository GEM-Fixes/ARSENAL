// sketch (MV-PNT3): how the Field sketch style reaches the shared paint files (paint contract 4.3: only ../canvas,
// ../paper and ../input, all light). Loaded on first use.
// Author: Imperator_Aug (ARSENAL, ia-a27136a4)
'use strict';

// the MvError of the dispatcher, loaded only when a check fails (the style stays light at load)
function fail(code, msg, detail) {
  const mv = require('../../mapviz');
  return new mv.MvError(code, msg, detail);
}

module.exports = {
  canvas: () => require('../canvas'),
  paper: () => require('../paper'),
  input: () => require('../input'),
  fail,
};
