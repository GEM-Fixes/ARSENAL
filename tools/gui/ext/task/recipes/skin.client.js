// recipe "a skin", page side: the question kind "gametex" (get the game texture to paint over). The button calls
// POST /api/x/task/r/skin/gametex (saves the texture as PNG and as it is in the staging folder) and then shows the PNG in its folder
// through POST /api/x/task/external/open (action reveal, staged). The answer is the list of saved names: compile refuses a picture
// brought back unchanged. Skipping it is fine (an empty answer). Page rules: ES5, no backtick, no dollar-brace, no innerHTML.
// Author: Imperator_Aug (ARSENAL, ia-938d58ef)
'use strict';
const script = [
  '(function(){if(!window.TASK||!TASK.kind)return;',
  'TASK.kind("gametex",{draw:function(q,st,host){var msg=h("div",{class:"hint","data-skin-gametex":"1"});',
  ' if(!st.saved&&st.answer&&st.answer.src==="value"&&st.answer.value)st.saved=[].concat(st.answer.value);',
  ' var btn=h("button",{type:"button","data-skin-save":"1",text:tx("task.skin.k.save"),onclick:function(){',
  '  msg.textContent=tx("task.skin.k.saving");btn.disabled=true;',
  '  api("/api/x/task/r/skin/gametex",{draft:st.draft}).then(function(r){btn.disabled=false;st.saved=[r.png,r.raw];',
  '   msg.textContent=tx("task.skin.k.saved",{n:r.name,w:r.w,h:r.h,p:r.png});',
  '   var d=st.draft||{};return api("/api/x/task/external/open",{draft:d.id,id:"dds-editor",action:"reveal",staged:r.png}).catch(function(){})',
  '  }).catch(function(e){btn.disabled=false;msg.textContent=String(e&&e.message||e)})}});',
  ' host.appendChild(h("div",{class:"row"},[btn]));host.appendChild(msg);',
  ' if(st.saved&&st.saved.length)msg.textContent=tx("task.skin.k.again")},',
  ' value:function(q,st){return {ok:true,answer:{src:"value",value:st.saved&&st.saved.length?st.saved:""}}}});',
  '})();',
].join('\n');
module.exports = { kinds: ['gametex'], script, css: '' };
