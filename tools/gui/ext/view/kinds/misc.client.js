// view kind misc, page side: an archive (.pak, .pat, .zip) opened as a file. The central directory as a table (name, size, packed,
// method, time), the count and the totals, a filter box, sorting by a column. Clicking an entry asks the server for a ref that opens
// exactly that entry (checked there) and calls VIEW.open; an entry no ref reaches says why. At most 400 rows are drawn at a time.
// Page rules: ES5, no backtick, no dollar-brace, no innerHTML, DOM through h() and textContent, strings through tx().
// Author: Imperator_Aug (ARSENAL, ia-a002605a)
'use strict';
const script = String.raw`
(function(){
var NS='view.misc.';
var SHOW=400;
function dosTime(t){if(!t)return '';var d=t>>>16,m=t&65535;function p(n){return n<10?'0'+n:''+n}
 return ((d>>9)+1980)+'-'+p((d>>5)&15)+'-'+p(d&31)+' '+p(m>>11)+':'+p((m>>5)&63)}
function method(n){return n===0?tx('view.misc.m.store'):n===8?tx('view.misc.m.deflate'):tx('view.misc.m.other',{n:n})}
VIEW.reg('misc',{where:'tab',label:'view.misc.label',exts:['pak','pat','zip'],open:function(host,item){
 var st={gone:false,o:null,sort:'name',dir:1,rows:[]};
 var top=h('div',{class:'vw-mi-top'},[h('div',{class:'hint',text:tx('view.loading')})]);
 var fin=h('input',{class:'vw-mi-in',type:'search',placeholder:tx('view.misc.filter')});
 var cnt=h('span',{class:'vw-mi-cnt'}),msg=h('div',{class:'vw-mi-msg'});
 // the filter box (searchKit, tools/gui/README.md): index = entry names of this archive (lower case kept once per listing),
 // Browse = the game's data view at the top (a picked file's game path filters to that entry), history key view.misc.filter;
 // the table redraws once per frame while typing
 var LO=null;function lows(){var o=st.o;if(!o)return [];if(!LO||LO.o!==o){LO={o:o,l:o.entries.map(function(e){return e[0].toLowerCase()})}}return LO.l}
 function hits(q,max){var o=st.o,w=String(q||'').toLowerCase(),l=lows(),a=[],n=0;if(!o)return {a:a,n:0};
  for(var i=0;i<l.length;i++){if(w&&l[i].indexOf(w)<0)continue;n++;if(a.length<max){var nm=o.entries[i][0];a.push({label:nm,value:nm})}}
  return {a:a,n:n}}
 var finKit=typeof searchKit!=='function'?null:searchKit(fin,{key:'view.misc.filter',
  index:function(q,done){var r=hits(q,40);done(r.a,Math.max(0,r.n-r.a.length))},
  browse:{mode:'file',view:'data',start:'',toValue:function(p,e){return String(e&&e.path||p||'').replace(/\\/g,'/')}},
  onPick:function(v){fin.value=v;draw()}});
 var bar=h('div',{class:'vw-mi-bar'},[finKit?finKit.el:fin,cnt]);
 var tb=h('tbody'),hr=h('tr');
 var cols=[['name','view.misc.c.name'],['size','view.misc.c.size'],['csize','view.misc.c.packed'],['method','view.misc.c.method'],['time','view.misc.c.time']];
 cols.forEach(function(c){var th=h('th',{text:tx(c[1]),title:tx('view.misc.sortBy'),onclick:function(){if(st.sort===c[0])st.dir=-st.dir;else{st.sort=c[0];st.dir=c[0]==='name'?1:-1}draw()}});hr.appendChild(th)});
 var table=h('table',{class:'vw-mi-t vw-mono'},[h('thead',null,[hr]),tb]);
 var body=h('div',{class:'vw-mi-body'},[bar,msg,table]);
 host.appendChild(top);host.appendChild(body);
 var IDX={name:0,size:1,csize:2,method:3,time:4};
 function draw(){var o=st.o;if(!o)return;
  var f=String(fin.value||'').toLowerCase(),all=o.entries,rows=[],lo=lows();
  for(var i=0;i<all.length;i++)if(!f||lo[i].indexOf(f)>=0)rows.push(all[i]);
  var k=IDX[st.sort],d=st.dir;rows.sort(function(a,b){var x=a[k],y=b[k];if(k===0){x=x.toLowerCase();y=y.toLowerCase()}return x<y?-d:x>y?d:0});
  st.rows=rows;tb.textContent='';
  for(var j=0;j<rows.length&&j<SHOW;j++)tb.appendChild(row(rows[j]));
  var tot=0;for(var m=0;m<rows.length;m++)tot+=rows[m][1];
  cnt.textContent=(rows.length>SHOW?tx('view.misc.shown',{n:SHOW,of:rows.length}):tx('view.misc.matches',{n:rows.length}))+'  '+VIEW.size(tot);
 }
 function row(e){var dir=/\/$/.test(e[0]),can=!!st.o.open&&!dir;
  var tr=h('tr',{class:can?'vw-mi-go':null,title:can?tx('view.misc.openHint'):null},[h('td',{text:e[0]}),h('td',{text:dir?'':VIEW.size(e[1])}),h('td',{text:dir?'':VIEW.size(e[2])}),h('td',{text:dir?tx('view.misc.dir'):method(e[3])}),h('td',{text:dosTime(e[4])})]);
  if(can)tr.addEventListener('click',function(){openEntry(e[0])});
  return tr}
 function openEntry(name){msg.textContent=tx('view.loading');msg.className='vw-mi-msg';
  api('/api/x/view/misc/ref?'+item.q+'&entry='+encodeURIComponent(name),undefined,{what:tx('view.misc.job.read')}).then(function(r){if(st.gone)return;
   if(r.ref){msg.textContent='';VIEW.open(r.ref,name.split('/').pop())}
   else{msg.className='vw-mi-msg err';msg.textContent=tx(NS+'why.'+r.why)}},
   function(e){if(st.gone)return;msg.className='vw-mi-msg err';msg.textContent=e.text||e.message})}
 function start(){Promise.all([VIEW.info(item),api('/api/x/view/misc/list?'+item.q,undefined,{what:tx('view.misc.job.read')})]).then(function(a){if(st.gone)return;var info=a[0],o=a[1];st.o=o;
   var ms=[];for(var k in o.methods)ms.push(method(Number(k))+' '+o.methods[k]);
   var rows=[[tx('view.misc.h.entries'),tx('view.misc.entries',{n:o.count,f:o.files,d:o.dirs})],
    [tx('view.misc.h.total'),tx('view.misc.total',{t:VIEW.size(o.total),p:VIEW.size(o.packed),r:o.total?Math.round(o.packed*100/o.total):100})],
    [tx('view.misc.h.method'),ms.join(', ')||tx('view.misc.none')]];
   if(o.zip64)rows.push([tx('view.misc.h.format'),tx('view.misc.zip64')]);
   rows.push([tx('view.misc.h.open'),o.open?tx('view.misc.canOpen'):tx(NS+'why.'+o.why)]);
   if(o.cut)rows.push(['',tx('view.misc.cut',{n:o.entries.length})]);
   top.textContent='';top.appendChild(VIEW.head(item,info,rows));draw()},
  function(e){if(st.gone)return;top.textContent='';top.appendChild(h('div',{class:e.cancelled?'hint':'err',text:e.text||e.message}))})}
 var drawQ=false;
 fin.addEventListener('input',function(){if(typeof requestAnimationFrame!=='function'){draw();return}if(drawQ)return;drawQ=true;requestAnimationFrame(function(){drawQ=false;if(!st.gone)draw()})});
 start();
 return {close:function(){st.gone=true},focus:function(){try{fin.focus()}catch(e){}},refresh:function(){item._info=null;start()}}}});
})();
`;
const css = [
  '.vw-mi-top{flex:0 0 auto}',
  '.vw-mi-body{flex:1 1 auto;overflow:auto;padding:8px 10px;display:flex;flex-direction:column;gap:6px;min-height:0}',
  '.vw-mi-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.vw-mi-in{flex:1 1 220px;max-width:420px}.vw-mi-cnt{color:var(--hint);font-size:12px}',
  '.vw-mi-msg{font-size:12px;min-height:1em}',
  '.vw-mi-t{border-collapse:collapse;font-size:12px}.vw-mi-t th,.vw-mi-t td{border:1px solid var(--line);padding:1px 6px;text-align:left;white-space:nowrap}',
  '.vw-mi-t th{color:var(--hint);cursor:pointer;position:sticky;top:0;background:var(--card)}.vw-mi-t td:nth-child(2),.vw-mi-t td:nth-child(3){text-align:right}',
  '.vw-mi-go{cursor:pointer}.vw-mi-go:hover{background:var(--card)}',
].join('\n');
module.exports = { script, css };
