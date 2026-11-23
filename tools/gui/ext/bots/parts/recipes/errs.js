// Server refusals of the recipes, modeready and botmatch parts as codes the page words in four languages (page standards S6, S9).
// An Error's message is "<lang key>" or "<lang key> {json values}" (the part api hands the page only the message); e.key and e.params
// carry the same for callers that read them (gui.js sends key and params beside the error). Client side: errText() of each client.
// libErr turns the English refusals of the shared bots lib (checkMod, checkWrite, the write guard) into the part's own codes, with the
// original words as {m} for the page's Details fold.
// Author: Imperator_Aug (ARSENAL, ia-149c7657)
'use strict';
function bad(key, params, status) {
  const p = params && typeof params === 'object' && Object.keys(params).length ? params : null;
  return Object.assign(new Error(key + (p ? ' ' + JSON.stringify(p) : '')), { status: status || 400, key, params: p || {} });
}
// prefix 'bots.recipes' -> 'bots.recipes.e.needmod' ...; an error that already is a code passes through
function libErr(prefix, e) {
  const m = String((e && e.message) || e || '');
  if (/^(bots|maps|modes)\.[A-Za-z0-9_.]+( \{.*\})?$/.test(m)) return e;
  if (/pick a mod folder/i.test(m)) return bad(prefix + '.e.needmod');
  if (/does not exist/i.test(m)) return bad(prefix + '.e.nomod', { m });
  if (/part of the game install/i.test(m)) return bad(prefix + '.e.inGame');
  if (/game folder is not set/i.test(m)) return bad(prefix + '.e.nogame');
  return bad(prefix + '.e.guard', { m: m.slice(0, 400) });
}
module.exports = { bad, libErr };
