// Test helper for page scripts run in the stand-in DOM of ext/units/fakedom.js (the Balance and Art tests): the page's own block
// helpers blk/fld/card/blkPut (taken from page.js, with a blkMark for that DOM (no classList.add there)
// a blkApply that counts its calls (window.blkN), and the structure rules of tools/gui/test/test-blocks.js checkScreen, so a test can
// run the state a screen reaches after server replies through the same rules. checkBlocks(root) -> list of problems ([] = clean).
// Author: Imperator_Aug (ARSENAL, ia-edde0f95)
'use strict';
const PAGE = require('../../page.js');
const BLKFN = (PAGE.match(/^function (blk|fld|card|blkPut)\([^\n]*$/gm) || []).join('\n');
if ((BLKFN.match(/^function /gm) || []).length !== 4) throw new Error('page.js block helpers blk, fld, card, blkPut not found');
const SHIM = BLKFN + '\nfunction blkMark(e,id,box){e.setAttribute("data-blk",String(id));e.dataset.blk=String(id);e.className=(e.className?e.className+" ":"")+"blk"+(box?" blc box-"+box:"");return e}' +
  '\nfunction blkApply(){window.blkN=(window.blkN||0)+1}\n' +
  require('../../test/blockcheck').kitSrc() + '\n';   // the page's searchKit (the Balance filters adopt it)

// the structure rules: the shared tools/gui/test/blockcheck.js (own text sits on the element in that DOM, it reads _text)
const BC = require('../../test/blockcheck');
const checkBlocks = root => BC.checkScreen(root);
module.exports = { SHIM, checkBlocks };
