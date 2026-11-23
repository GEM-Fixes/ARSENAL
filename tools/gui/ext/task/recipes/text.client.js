// recipe "texts and translation", page side, two question kinds:
// "tsv": save the translation table of the mod (GET /api/x/task/r/text/extract, saved with a UTF-8 BOM so every program reads the
// letters), numbered steps per program (Excel, LibreOffice Calc, Google Sheets, a text editor: which menu, which format, which encoding),
// bring the translated table back (core upload route, JSON chunks) and check it at once (GET /api/x/task/r/text/table): a plain message
// per problem, and the answer {src:'file', staged:[name]} only for a table that passed.
// "tlines": the lines "key = text", one per row, with a finder (GET /api/x/task/r/text/find) that looks for a line by the words the game
// shows; a click adds "key = text" to edit. Page rules: ES5, no backtick, no dollar-brace, no innerHTML, theme tokens only.
// Author: Imperator_Aug (ARSENAL, ia-7555412d)
'use strict';
const STEPS = { excel: 4, calc: 4, sheets: 4, other: 3 };
const script = [
  '(function(){if(!window.TASK||!TASK.kind)return;',
  'var TKX_STEPS=' + JSON.stringify(STEPS) + ';',
  'function tkxB64(a){var s="",n=8192;for(var i=0;i<a.length;i+=n)s+=String.fromCharCode.apply(null,a.subarray(i,i+n));return btoa(s)}',
  'function tkxSend(draft,qid,file,done,fail){var rd=new FileReader();rd.onload=function(){var u8=new Uint8Array(rd.result),C=3145728,off=0;',
  ' function step(){var part=u8.subarray(off,Math.min(u8.length,off+C)),last=off+part.length>=u8.length;',
  '  api("/api/x/task/upload",{draft:draft,q:qid,name:file.name,off:off,b64:tkxB64(part),last:last}).then(function(r){off+=part.length;if(!last)return step();done(r)}).catch(fail)}',
  ' step()};rd.onerror=function(){fail(new Error("read"))};rd.readAsArrayBuffer(file)}',
  'function tkxSteps(){var box=h("details",{class:"tkx-steps","data-text-steps":"1"});box.appendChild(h("summary",{text:tx("task.text.k.steps")}));',
  ' box.appendChild(h("div",{class:"hint",text:tx("task.text.k.s.first")}));',
  ' Object.keys(TKX_STEPS).forEach(function(p){var ol=h("ol",{"data-text-program":p});',
  '  for(var i=1;i<=TKX_STEPS[p];i++)ol.appendChild(h("li",{text:tx("task.text.k.s."+p+"."+i)}));',
  '  box.appendChild(h("div",{class:"tkx-prog",text:tx("task.text.k.p."+p)}));box.appendChild(ol)});',
  ' box.appendChild(h("div",{class:"hint",text:tx("task.text.k.s.last")}));return box}',
  'function tkxShow(msg,r,name){msg.textContent="";',
  ' if(r&&r.ok){msg.appendChild(h("div",{class:"tkx-ok",text:tx("task.text.k.ok",{n:name,t:r.translated,r:r.rows})}));return}',
  ' msg.appendChild(h("div",{class:"tkx-err",text:tx("task.text.k.fix",{n:name})}));',
  ' var ul=h("ul",{"data-text-problems":"1"});((r&&r.probs)||[]).forEach(function(p){ul.appendChild(h("li",{text:tx("task.text.e."+p.code,p)}))});',
  ' if(!(r&&r.probs&&r.probs.length))ul.appendChild(h("li",{text:String((r&&(r.why||r.error))||"")}));msg.appendChild(ul)}',
  'TASK.kind("tsv",{draw:function(q,st,host){var d=st.draft||{},msg=h("div",{class:"hint","data-text-tsv":"1"});',
  ' st.got=st.answer&&st.answer.src==="file"?st.answer.staged:null;',
  ' var save=h("button",{type:"button","data-text-save":"1",text:tx("task.text.k.save"),onclick:function(){',
  '  api("/api/x/task/r/text/extract?mod="+encodeURIComponent(d.mod||"")).then(function(r){var b=new Blob(["\\ufeff"+r.tsv],{type:"text/tab-separated-values;charset=utf-8"}),a=document.createElement("a");',
  '   a.href=URL.createObjectURL(b);a.download=r.name||"text.tsv";document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.parentNode&&a.parentNode.removeChild(a)},2000);',
  '   msg.textContent=tx("task.text.k.saved",{n:r.rows})}).catch(function(e){msg.textContent=String(e&&e.message||e)})}});',
  ' var inp=h("input",{type:"file",accept:".tsv,.txt,.csv","aria-label":tx("task.text.k.back"),"data-text-back":"1"});',
  ' inp.addEventListener("change",function(){var f=inp.files&&inp.files[0];if(!f)return;st.got=null;msg.textContent=tx("task.text.k.sending",{n:f.name});',
  '  tkxSend(d.id,q.id,f,function(r){if(!(r&&r.ok)){tkxShow(msg,{why:r&&r.whyKey?tx(r.whyKey,r.whyParams||{}):(r&&r.why)||""},f.name);return}',
  '   msg.textContent=tx("task.text.k.checking",{n:r.name});',
  '   api("/api/x/task/r/text/table?draft="+encodeURIComponent(d.id||"")+"&name="+encodeURIComponent(r.name)).then(function(c){if(c&&c.ok)st.got=[r.name];tkxShow(msg,c,r.name)})',
  '    .catch(function(e){tkxShow(msg,{why:String(e&&e.message||e)},r.name)})},function(e){msg.textContent=String(e&&e.message||e)})});',
  ' host.appendChild(h("div",{class:"row"},[save]));host.appendChild(tkxSteps());host.appendChild(h("label",{class:"f"},[h("span",{text:tx("task.text.k.back")+" "}),inp]));host.appendChild(msg);',
  ' if(st.got)msg.textContent=tx("task.text.k.got",{n:st.got.join(", ")})},',
  ' value:function(q,st){if(st.got&&st.got.length)return {ok:true,answer:{src:"file",staged:st.got}};return {ok:false,why:tx("task.text.k.none")}}});',
  'TASK.kind("tlines",{draw:function(q,st,host){var d=st.draft||{},v=st.answer&&st.answer.src==="value"?st.answer.value:st.value;',
  ' var inp=h("textarea",{rows:8,"aria-label":tx(q.ask),"data-task-input":"1","data-text-lines":"1"});',
  ' inp.value=Object.prototype.toString.call(v)==="[object Array]"?v.join("\\n"):(v==null?"":String(v));host.appendChild(inp);st.inp=inp;',
  ' var box=h("div",{class:"tkx-find"}),words=h("input",{type:"text","aria-label":tx("task.text.k.find"),placeholder:tx("task.text.k.find"),"data-text-find":"1"}),out=h("div",{"data-text-found":"1"});',
  ' function add(line){var s=String(inp.value||"");if(s&&!/\\n$/.test(s))s+="\\n";inp.value=s+line;try{inp.focus();inp.selectionStart=inp.selectionEnd=inp.value.length}catch(e){}}',
  // the finder (owner 2026-11-19, searchKit: indexed search, manual Browse, history): the lines are asked a short pause after each key and
  // the kit's index rows come from that same answer (an older answer dropped; an empty box gets the last answer, no call); a pick adds
  // the line. Browse: the file picker on disk at the mod's localization folder (.lng); the file name goes into the box and the finder
  // lists the lines of that file (the route matches the file too) [I: the game's own texts are in localization.pak, not on disk].
  // History key task.sk.text.find. A stand-in page with no kit keeps the bare box
  ' var seq=0,tm=null,due=false,last=null,pend=null,fly=null,findUrl=function(w){return "/api/x/task/r/text/find?mod="+encodeURIComponent(d.mod||"")+"&q="+encodeURIComponent(w)};',
  ' function item(x){return {label:x.key,value:x.key,hint:x.text+(x.file?"  "+x.file:""),x:x}}',
  ' function find(){if(tm){clearTimeout(tm);tm=null}due=false;var w=String(words.value||"").trim(),my=++seq;out.textContent="";if(!w)return;fly=w;out.appendChild(h("div",{class:"hint",text:tx("task.text.k.finding")}));',
  '  api(findUrl(w)).then(function(r){if(my!==seq)return;fly=null;out.textContent="";var rows=(r&&r.rows)||[];last={q:w,items:rows.map(item),more:r&&r.more?1:0};if(pend&&pend.q===w){var p=pend;pend=null;p.done(last.items,last.more)}',
  '   if(!rows.length){out.appendChild(h("div",{class:"hint",text:tx("task.text.k.nofound")}));return}',
  '   out.appendChild(h("div",{class:"hint",text:tx("task.text.k.found")}));var row=h("div",{class:"tkx-row"});',
  '   rows.forEach(function(x){row.appendChild(h("button",{type:"button",class:"tkx-line","data-text-key":x.key,title:x.file||"",text:x.key+" = "+x.text,onclick:function(){add(x.key+" = "+x.text)}}))});',
  '   out.appendChild(row);if(r.more)out.appendChild(h("div",{class:"hint",text:tx("task.text.k.morefound")}))}).catch(function(e){if(my!==seq)return;fly=null;out.textContent=String(e&&e.message||e)})}',
  ' words.addEventListener("input",soon);',
  ' function soon(){if(tm)clearTimeout(tm);due=true;tm=setTimeout(function(){tm=null;if(due)find()},350)}',
  ' var kit=typeof searchKit==="function"?searchKit(words,{key:"task.sk.text.find",',
  '  index:function(s,done){if(!s){done(last?last.items:[],0);return}if(last&&last.q===s){done(last.items,last.more);return}pend={q:s,done:done};if(!due&&fly!==s)soon()},',
  '  browse:{mode:"file",view:"disk",exts:["lng"],start:function(){var m=String(d.mod||S.mod||"");return m?join(m,"localization"):""},toValue:function(p){var s=String(p||"");return s.slice(Math.max(s.lastIndexOf("/"),s.lastIndexOf("\\\\"))+1)}},',
  '  onPick:function(v,it){if(it&&it.x){add(it.x.key+" = "+it.x.text);return}words.value=v;find()}}):null;',
  // Enter here is Find, not the task window's Next (an Enter the kit used for a row of its list is stopped by the kit)
  ' words.addEventListener("keydown",function(e){if(e._sk)return;if(e.key==="Enter"){e.preventDefault();if(e.stopPropagation)e.stopPropagation();find()}});',
  ' box.appendChild(h("div",{class:"row"},[kit?kit.el:words,h("button",{type:"button","data-text-findgo":"1",text:tx("task.text.k.findgo"),onclick:find})]));box.appendChild(out);host.appendChild(box)},',
  ' value:function(q,st){var L=q.limits||{},a=String(st.inp?st.inp.value:"").split(/\\r?\\n/).map(function(x){return x.trim()}).filter(Boolean);',
  '  if(!a.length)return {ok:false,why:tx("task.text.k.lnone")};',
  '  if(L.re){var re=new RegExp(L.re);for(var i=0;i<a.length;i++)if(!re.test(a[i]))return {ok:false,why:tx("task.text.k.lbad",{v:a[i]}),limit:L.limit}}',
  '  return {ok:true,answer:{src:"value",value:a}}}});',
  '})();',
].join('\n');
const css = '.tkx-steps{margin:6px 0}.tkx-steps summary{cursor:pointer;color:var(--acc)}.tkx-prog{font-weight:bold;margin-top:6px}' +
  '.tkx-steps ol{margin:2px 0 4px 18px;padding:0}.tkx-ok{color:var(--ok)}.tkx-err{color:var(--err)}' +
  '.tkx-find{margin-top:6px}.tkx-row{display:flex;flex-direction:column;gap:3px;max-height:220px;overflow:auto}' +
  '.tkx-line{text-align:left;font-size:12px;padding:2px 6px;background:var(--chip);color:var(--fg);border:1px solid var(--line);border-radius:4px;cursor:pointer}' +
  '.tkx-line:hover{border-color:var(--acc)}';
module.exports = { kinds: ['tsv', 'tlines'], script, css, STEPS };
