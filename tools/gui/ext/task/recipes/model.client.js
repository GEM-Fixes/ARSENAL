// recipe "a model", page side: the question kind "mlist" (lines, one per row, like the core list) with the names the task's model holds
// beside it (bones with their joint type, volumes, meshes, sequences, animations: GET /api/x/task/r/model/names). A click on a name
// starts a new line with it, so nobody has to open the .mdl to learn its names. Page rules: ES5, no backtick, no dollar-brace, no
// innerHTML, theme tokens only. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-765e30a3)
'use strict';
const script = [
  '(function(){if(!window.TASK||!TASK.kind)return;',
  'var tkmNames={};',
  'function tkmLoad(id){if(!tkmNames[id])tkmNames[id]=api("/api/x/task/r/model/names?draft="+encodeURIComponent(id||"")).catch(function(){return {from:null}});return tkmNames[id]}',
  'TASK.kind("mlist",{draw:function(q,st,host){var L=q.limits||{},v=st.answer&&st.answer.src==="value"?st.answer.value:st.value;',
  ' var inp=h("textarea",{rows:6,"aria-label":tx(q.ask),"data-task-input":"1","data-model-lines":q.id});',
  ' inp.value=Object.prototype.toString.call(v)==="[object Array]"?v.join("\\n"):(v==null?"":String(v));',
  ' host.appendChild(h("div",{class:"hint",text:tx("task.model.k.hint")}));host.appendChild(inp);',
  ' st.inp=inp;if(!q.names)return;',
  ' var box=h("div",{class:"tkm-names","data-model-names":q.names});box.appendChild(h("div",{class:"hint",text:tx("task.model.k.loading")}));host.appendChild(box);',
  ' tkmLoad(st.draft&&st.draft.id).then(function(r){box.textContent="";var list=(r&&r[q.names])||[],max=150;',
  '  if(!r||!r.from||!list.length){box.appendChild(h("div",{class:"hint",text:tx("task.model.k.none")}));return}',
  '  var fromKey=r.from==="mod"?"task.model.k.fromMod":r.from==="brought"?"task.model.k.fromBrought":"task.model.k.fromGame";',
  '  box.appendChild(h("div",{class:"hint",text:tx("task.model.k.names",{w:tx(fromKey)})}));',
  '  var row=h("div",{class:"tkm-row"});',
  '  list.slice(0,max).forEach(function(x){var name=typeof x==="string"?x:x.name,sub=typeof x==="string"?"":(x.type||"");',
  '   row.appendChild(h("button",{type:"button",class:"tkm-name","data-model-name":name,text:sub?name+" ("+sub+")":name,onclick:function(){',
  '    var s=String(inp.value||"");if(s&&!/\\n$/.test(s))s+="\\n";inp.value=s+name+(q.add||" = ");try{inp.focus();inp.selectionStart=inp.selectionEnd=inp.value.length}catch(e){}}}))});',
  '  box.appendChild(row);if(list.length>max)box.appendChild(h("div",{class:"hint",text:tx("task.model.k.more",{n:list.length-max})}))})},',
  ' value:function(q,st){var L=q.limits||{},a=String(st.inp?st.inp.value:"").split(/\\r?\\n/).map(function(x){return x.trim()}).filter(Boolean);',
  '  if(L.re){var re=new RegExp(L.re);for(var i=0;i<a.length;i++)if(a[i].charAt(0)!==";"&&!re.test(a[i]))return {ok:false,why:tx("task.model.k.bad",{v:a[i]}),limit:L.limit}}',
  '  return {ok:true,answer:{src:"value",value:a}}}});',
  '})();',
].join('\n');
const css = '.tkm-names{margin-top:6px}.tkm-row{display:flex;flex-wrap:wrap;gap:4px;max-height:160px;overflow:auto}' +
  '.tkm-name{font-size:12px;padding:2px 6px;background:var(--chip);color:var(--fg);border:1px solid var(--line);border-radius:4px;cursor:pointer}' +
  '.tkm-name:hover{border-color:var(--acc)}';
module.exports = { kinds: ['mlist'], script, css };
