// view kind shader, page side (.pso / .vso: one file of the shader cache). What the cache is and whether as64 reads it (one plain
// line, with the source), the cache key split into shader file, entry and defines, whether the file name matches the key, the DXBC
// container facts (shader model and type, instructions, compiler, chunk list), resource bindings, constant buffers with their
// variables, and the input/output signatures. No the game. Read only.
// Page rules: ES5, no backtick, no dollar-brace, no innerHTML, DOM through h() and textContent, strings through tx().
// Author: Imperator_Aug (ARSENAL, ia-0e5b4647)
'use strict';
const script = String.raw`
(function(){
var NS='view.shader.';
VIEW.reg('shader',{where:'tab',label:'view.shader.label',exts:['pso','vso','gso','hso','dso','cso'],open:function(host,item){
 var st={gone:false};
 var top=h('div',{class:'vw-sh-top'},[h('div',{class:'hint',text:tx('view.loading')})]);
 var body=h('div',{class:'vw-sh-body'});
 host.appendChild(top);host.appendChild(body);
 function tbl(cols,rows){var hr=h('tr');cols.forEach(function(c){hr.appendChild(h('th',{text:tx(NS+'c.'+c)}))});
  var tb=h('tbody');rows.forEach(function(r){var tr=h('tr');r.forEach(function(v){tr.appendChild(h('td',{text:v==null?'':String(v)}))});tb.appendChild(tr)});
  return h('table',{class:'vw-sh-t vw-mono'},[h('thead',null,[hr]),tb])}
 function sec(title,el){return h('div',{class:'vw-sh-card'},[h('b',{text:title}),el])}
 function draw(info,o){var rows=[],x=o.dxbc||{},m=x.model,P=o.parsed;
  if(o.key!=null)rows.push([tx('view.shader.h.key'),o.key]);else rows.push([tx('view.shader.h.key'),tx(o.keyBad?'view.shader.keyBad':'view.shader.noKey')]);
  if(P){rows.push([tx('view.shader.h.source'),P.file+'.hlsl  ['+P.entry+']']);
   rows.push([tx('view.shader.h.defines'),P.defines.length?P.defines.map(function(d){return d[1]==null?d[0]:d[0]+'='+d[1]}).join('  '):tx('view.shader.none')])}
  if(o.md5)rows.push([tx('view.shader.h.name'),o.md5.match?tx('view.shader.nameOk'):tx('view.shader.nameBad',{m:o.md5.lower})]);
  if(m)rows.push([tx('view.shader.h.model'),m.name+'  ('+tx(NS+'t.'+m.type)+')'+(x.stat?'   '+tx('view.shader.stat',{i:x.stat.instructions,t:x.stat.temps}):'')]);
  if(x.rdef&&x.rdef.creator)rows.push([tx('view.shader.h.creator'),x.rdef.creator]);
  rows.push([tx('view.shader.h.code'),x.magic+'  '+VIEW.size(x.size||0)+(x.checksum?'  '+tx('view.shader.sum',{s:x.checksum}):'')]);
  top.textContent='';top.appendChild(VIEW.head(item,info,rows));
  body.textContent='';
  // what this file is to the game
  // the cache line is the page's game's (o.game): AS64 never reads a shipped cache, MoW:AS2 reads it [I], GoH copies it over its own
  var G=o.game==='goh'?['view.shader.cacheG','GHFMT-39']:o.game==='mowas2'?['view.shader.cacheM','modweb porting/as64-vs-mowas2:9 [I]']:['view.shader.cache',''];
  var why=h('div',{class:'vw-sh-card vw-sh-cache'},[h('span',{text:tx(G[0])}),h('span',{class:'vw-sh-src vw-mono',text:G[1]})]);
  if(o.source)why.appendChild(h('span',{text:o.source.found?tx('view.shader.srcFound',{k:o.source.key}):tx('view.shader.srcMissing',{k:o.source.key})}));
  body.appendChild(why);
  if(x.notes&&x.notes.length){var ul=h('ul',{class:'vw-sh-notes'});x.notes.forEach(function(n){var c=String(n).split(':');ul.appendChild(h('li',{text:tx(NS+'n.'+c[0],{c:c[1]||''})}))});body.appendChild(sec(tx('view.shader.problems'),ul))}
  if(x.chunks&&x.chunks.length)body.appendChild(sec(tx('view.shader.chunks'),tbl(['id','off','size'],x.chunks.map(function(c){return [c.id,c.off,c.size]}))));
  if(x.rdef){
   if(x.rdef.bindings.length)body.appendChild(sec(tx('view.shader.bindings'),tbl(['name','type','dim','slot','count'],x.rdef.bindings.map(function(b){return [b.name,b.type,b.dim,b.slot,b.count]}))));
   x.rdef.cbuffers.forEach(function(cb){body.appendChild(sec(tx('view.shader.cbuffer',{n:cb.name,s:cb.size,v:cb.vars.length}),tbl(['name','off','size','used'],cb.vars.map(function(v){return [v.name,v.off,v.size,v.used?tx('view.shader.yes'):'']}))))})}
  [['isgn','view.shader.inputs'],['osgn','view.shader.outputs']].forEach(function(p){var s=x[p[0]];if(s&&s.length)body.appendChild(sec(tx(p[1]),tbl(['sem','idx','sv','ctype','reg','mask'],s.map(function(e){return [e.name,e.index,e.sv,e.type,e.reg,e.mask]}))))})}
 function start(){Promise.all([VIEW.info(item),api('/api/x/view/shader/info?'+item.q,undefined,{what:tx('view.shader.job.read')})]).then(function(a){if(!st.gone)draw(a[0],a[1])},
  function(e){if(st.gone)return;top.textContent='';top.appendChild(h('div',{class:e.cancelled?'hint':'err',text:e.text||e.message}))})}
 start();
 return {close:function(){st.gone=true},refresh:function(){item._info=null;start()}}}});
})();
`;
const css = [
  '.vw-sh-top{flex:0 0 auto}',
  '.vw-sh-body{flex:1 1 auto;overflow:auto;padding:8px 10px;display:flex;flex-direction:column;gap:10px;min-height:0}',
  '.vw-sh-card{border:1px solid var(--line);background:var(--card);padding:8px 10px;display:flex;flex-direction:column;gap:4px}',
  '.vw-sh-cache{font-size:13px}.vw-sh-src{color:var(--hint);font-size:11px}',
  '.vw-sh-notes{margin:0;padding-left:18px;font-size:12px;color:var(--err)}',
  '.vw-sh-t{border-collapse:collapse;font-size:12px}.vw-sh-t th,.vw-sh-t td{border:1px solid var(--line);padding:1px 6px;text-align:left}.vw-sh-t th{color:var(--hint)}',
].join('\n');
module.exports = { script, css };
