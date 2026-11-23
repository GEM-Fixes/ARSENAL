// browser side of the limits part: one card, a lead, the list in plain words, the limit IDs and file names under Details (kit.details, else a native details). Page rules (bots/script.js): no backtick, no dollar-brace, DOM only
// through h() and textContent. The IDs match LINES in index.js (test.js checks they agree).
// Author: Imperator_Aug (ARSENAL, ia-40037889)
module.exports = String.raw`
BOTS_PARTS.push({id:'limits',group:'F',order:100,title:function(){return tx('bots.limits.title')},
 draw:function(env){var k=env.kit;
  function gname(g){if(typeof k.game==='function'){try{var s=k.game(g);if(s)return s}catch(e){}}return g==='goh'?'Gates of Hell':g==='mowas2'?'Men of War: Assault Squad 2':'AS64'}
  var P={game:gname('goh')};
  // [what the modder will notice, limit IDs, the file-level note (Details only) or null]
  var L=[['board','AI-13'],['arty','AI-11'],['orders','AI-12, MIS-08'],['events','AI-22','events.d'],['aimode','AI-16, AI-09, MIS-08'],['goh','GHMIS-66','goh.d']]
   .map(function(r){return [tx('bots.limits.'+r[0],P),r[1],r[2]?tx('bots.limits.'+r[2],P):null]});
  // the main list in plain words; each line's limit ID and file names under Details (S2), where the notes about it live
  var lis=L.map(function(r){return h('li',{style:'margin:3px 0',text:r[0]})});
  var ids=[h('div',{class:'hint',text:tx('bots.limits.ids')}),h('ul',{},L.map(function(r){return h('li',{'data-limit':r[1]},[h('span',{text:r[0]+' ('+r[1]+')'}),r[2]?h('div',{class:'hint',text:r[2]}):null])}))];
  var dl;try{dl=tx('bots.details')}catch(e){dl='Details'}
  var det=k.details?k.details('bots.limits.det',ids):k.leaf('bots.limits.det',[h('details',{},[h('summary',{class:'hint',text:dl})].concat(ids))]);
  return [k.section('bots.limits',tx('bots.limits.title'),[k.hint('bots.limits.lead',tx('bots.limits.lead')),
   k.leaf('bots.limits.list',[h('ul',{},lis)],tx('bots.limits.title')),det])]}});
`;
