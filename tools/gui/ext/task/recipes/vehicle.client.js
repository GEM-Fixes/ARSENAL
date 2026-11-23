// recipe "a vehicle", page side: the question kind "vcrew", the crew presets as a choice with plain labels. Leaving the question asks
// GET /api/x/task/r/vehicle/crew (the draft's model against the doors and seat bones the preset needs) and refuses a preset whose
// doors the model lacks: such a vehicle is never driven and the game writes no log line. Page rules: ES5, no backtick, no
// dollar-brace, no innerHTML, theme tokens only.
// Author: Imperator_Aug (ARSENAL, ia-74a3fd72)
'use strict';
const script = [
  '(function(){if(!window.TASK||!TASK.kind)return;',
  'TASK.kind("vcrew",{draw:function(q,st,host){var L=q.limits||{},vals=L.values||[],v=st.answer&&(st.answer.src==="value"||st.answer.src==="exist")?st.answer.value:st.value;st.pick=v;',
  ' var box=h("div",{class:"tk-src",role:"radiogroup","data-vcrew":"1"});',
  ' vals.forEach(function(x){var r=h("input",{type:"radio",name:"tkvcrew",value:String(x)});r.checked=x===v;r.addEventListener("change",function(){st.pick=x});',
  '  box.appendChild(h("label",{},[r,h("span",{text:" "+tx("task.vehicle.v.crew."+x)})]))});',
  ' host.appendChild(box);host.appendChild(h("div",{class:"hint",text:tx("task.vehicle.k.crewcheck")}))},',
  ' value:function(q,st){var p=st.pick;if(p===undefined||p===null||p==="")return {ok:false,why:tx("task.err.pick")};',
  '  var d=st.draft||{};',
  '  return api("/api/x/task/r/vehicle/crew?draft="+encodeURIComponent(d.id||"")+"&preset="+encodeURIComponent(p)).then(function(r){',
  '   if(r&&r.ok===false&&r.unknown)return {ok:false,why:tx("task.vehicle.k.crewunknown",{p:tx("task.vehicle.v.crew."+p)})};',
  '   if(r&&r.ok===false)return {ok:false,why:tx("task.vehicle.k.crewdoors",{p:tx("task.vehicle.v.crew."+p),b:(r.missing||[]).join(", ")})};',
  '   return {ok:true,answer:{src:"value",value:p}}',
  '  }).catch(function(){return {ok:true,answer:{src:"value",value:p}}})}});',
  '})();',
].join('\n');
module.exports = { kinds: ['vcrew'], script, css: '' };
