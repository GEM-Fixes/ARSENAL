// recipe "a multiplayer game mode", page side: the question kind "misfrom" (which mode of the map to start from). It is the core choice
// (radios of limits.values, words task.mission.v.from.<value>, answer {src:'value', value}) plus one row for a single-player mission:
// this recipe makes multiplayer modes, and a single-player mission is made by the card "Make a single-player mission" on
// Maps & Missions > Missions; the button closes the task and opens that page with the card in view (S.missionsSp, missions/client.js).
// Page rules: ES5, no backtick, no dollar-brace, no innerHTML.
// Author: Imperator_Aug (ARSENAL, ia-7c039090)
'use strict';
const script = [
  '(function(){if(!window.TASK||!TASK.kind)return;',
  'TASK.kind("misfrom",{draw:function(q,st,host){var L=q.limits||{},vals=L.values||[],v=st.value;if(v==null||v==="")v=vals[0];st.pick=v;',
  ' var box=h("div",{class:"tk-src",role:"radiogroup","data-misfrom":"1"});',
  ' vals.forEach(function(x){var r=h("input",{type:"radio",name:"tkq",value:String(x)});r.checked=x===v;r.addEventListener("change",function(){st.pick=x});',
  '  box.appendChild(h("label",{},[r,h("span",{text:" "+tx("task.mission.v.from."+x)})]))});host.appendChild(box);',
  ' host.appendChild(h("div",{class:"row","data-mission-sp":"1"},[h("span",{class:"hint",text:tx("task.mission.k.sp")+" "}),',
  '  h("button",{type:"button","data-mission-spgo":"1",text:tx("task.mission.k.spgo"),onclick:function(){TASK.close().then(function(){S.missionsSp=1;show("missions")})}})]))},',
  ' value:function(q,st){var p=st.pick;if(p==null||p==="")return {ok:false,why:tx("task.err.pick")};return {ok:true,answer:{src:"value",value:p}}}});',
  '})();',
].join('\n');
module.exports = { kinds: ['misfrom'], script, css: '' };
