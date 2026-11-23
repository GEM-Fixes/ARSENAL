// view kind hex, page side: the bytes of any file as a hex and text dump (the reference kind for ../README.md). Read only.
// A header card (VIEW.head), then rows of 16 bytes drawn only for the lines on screen; the bytes come 64 KB at a time from
// GET /api/x/view/hex and the last 48 pages are kept, so a 2 GB pak entry is paged, never loaded. A file taller than the browser can
// scroll is mapped onto the bar (the wheel and the keys still step by rows). Cursor: arrows, Page Up/Down, Home/End (Ctrl = the file),
// Ctrl+G go to a byte, Ctrl+F / F3 find. The line under the dump reads numbers at the cursor, low byte first.
// Page rules: ES5, no backtick, no dollar-brace, no innerHTML, DOM through h() and textContent, strings through tx().
// Author: Imperator_Aug (ARSENAL, ia-c90ba573)
'use strict';
const script = String.raw`
(function(){
var ROWH=18,COLS=16,PG=65536,MAXPX=8000000,KEEP=48;
var raf=(typeof window!=='undefined'&&window.requestAnimationFrame)?function(f){return window.requestAnimationFrame(f)}:function(f){return setTimeout(f,16)};
function hx2(n){return (n<16?'0':'')+n.toString(16).toUpperCase()}
function hexN(n,w){var s=Math.floor(n).toString(16).toUpperCase();while(s.length<(w||1))s='0'+s;return s}
function parseOff(s){s=String(s||'').replace(/[\s_]/g,'');if(!s)return NaN;
 if(/^0x[0-9a-f]+$/i.test(s))return parseInt(s.slice(2),16);if(/^[0-9a-f]+h$/i.test(s))return parseInt(s.slice(0,-1),16);
 if(/^[0-9]+$/.test(s))return parseInt(s,10);if(/^[0-9a-f]+$/i.test(s))return parseInt(s,16);return NaN}
function f32(a){try{var dv=new DataView(new ArrayBuffer(4));for(var i=0;i<4;i++)dv.setUint8(i,a[i]);var f=dv.getFloat32(0,true);
 if(!isFinite(f))return String(f);if(f===0)return '0';var s=f.toPrecision(7);if(s.indexOf('e')<0&&s.indexOf('.')>=0)s=s.replace(/0+$/,'').replace(/\.$/,'');return s}catch(e){return '?'}}
VIEW.hexParse=parseOff;
VIEW.reg('hex',{where:'tab',label:'view.hex.label',exts:[],open:function(host,item){
 var st={size:0,rows:0,W:8,first:0,vis:1,cur:0,mark:null,pages:{},lru:[],bad:{},busy:false,gone:false,hid:false,ready:false,expTop:-1,gen:0,drawQ:false};
 var top=h('div',{class:'vw-hx-top'},[h('div',{class:'hint',text:tx('view.loading')})]);
 var offIn=h('input',{type:'text',class:'vw-hx-in vw-mono',spellcheck:'false',autocomplete:'off','aria-label':tx('view.hex.goto'),placeholder:tx('view.hex.gotoPh')});
 var fMode=h('select',{class:'vw-hx-sel','aria-label':tx('view.hex.find')},[h('option',{value:'text',text:tx('view.hex.fText')}),h('option',{value:'hex',text:tx('view.hex.fHex')})]);
 var fIn=h('input',{type:'text',class:'vw-hx-in vw-hx-fin',spellcheck:'false',autocomplete:'off','aria-label':tx('view.hex.find'),placeholder:tx('view.hex.findPh')});
 var msg=h('span',{class:'vw-hx-msg',role:'status','aria-live':'polite'});
 // the find box (searchKit, tools/gui/README.md): index = the printable strings (4+ chars) in the pages already read, found once
 // per page and kept on it; Browse = the folder picker at this file's folder (a picked file's name, no extension, is found as text:
 // the name other files call it by); picking one sets text mode and finds it. History key view.hex.find
 function strs(pg){var u=st.pages[pg];if(!u)return [];if(u._s)return u._s;var a=[],s='',at=0;
  for(var i=0;i<=u.length;i++){var b=i<u.length?u[i]:0;if(b>=32&&b<127){if(!s)at=i;s+=String.fromCharCode(b)}else{if(s.length>=4&&a.length<4000)a.push({label:s.length>80?s.slice(0,80):s,value:s.length>80?s.slice(0,80):s,hint:'0x'+(pg*PG+at).toString(16),l:s.toLowerCase()});s=''}}
  try{u._s=a}catch(e){}return a}
 function strHits(q,max){var w=String(q||'').toLowerCase(),a=[],n=0,seen={},pgs=Object.keys(st.pages).map(Number).sort(function(x,y){return x-y});
  for(var p=0;p<pgs.length;p++){var L=strs(pgs[p]);for(var i=0;i<L.length;i++){var e=L[i];if(w&&e.l.indexOf(w)<0||seen[e.l])continue;seen[e.l]=1;n++;if(a.length<max)a.push(e)}}
  return {a:a,n:n}}
 var fKit=typeof searchKit!=='function'?null:searchKit(fIn,{key:'view.hex.find',
  index:function(q,done){var r=strHits(q,40);done(r.a,r.n-r.a.length)},
  browse:(function(){var w=VIEW.browseAt(item);return {mode:'file',view:w.view,start:w.start,toValue:function(p){var b=String(p||'').replace(/\\/g,'/').split('/').pop();return b.replace(/\.[^.]*$/,'')||b}}})(),
  onPick:function(v){fIn.value=v;fMode.value='text';findNext()}});
 var bar=h('div',{class:'vw-hx-bar'},[h('label',{class:'vw-hx-l'},[h('span',{text:tx('view.hex.goto')}),offIn]),h('button',{type:'button',text:tx('view.hex.go'),onclick:goOff}),
  h('label',{class:'vw-hx-l'},[h('span',{text:tx('view.hex.find')}),fMode,fKit?fKit.el:fIn]),h('button',{type:'button',text:tx('view.hex.next'),onclick:findNext}),msg]);
 var pane=h('div',{class:'vw-hx-pane vw-mono'}),sp=h('div',{class:'vw-hx-sp'});
 var sc=h('div',{class:'vw-hx-sc',tabindex:'0',role:'region','aria-label':tx('view.hex.dump'),title:tx('view.hex.readOnly')},[pane,sp]);
 var rd=h('div',{class:'vw-hx-rd vw-mono',title:tx('view.hex.readTip')});
 host.appendChild(top);host.appendChild(bar);host.appendChild(sc);host.appendChild(rd);
 function say(s){msg.textContent=s||''}
 // the page cache
 function byteAt(i){if(i<0||i>=st.size)return null;var p=st.pages[Math.floor(i/PG)];return p?p[i%PG]:null}
 function keep(pg,u){st.pages[pg]=u;var j=st.lru.indexOf(pg);if(j>=0)st.lru.splice(j,1);st.lru.push(pg);while(st.lru.length>KEEP){delete st.pages[st.lru.shift()]}}
 function need(pgs){if(st.busy||st.gone)return;for(var i=0;i<pgs.length;i++){var pg=pgs[i];if(!st.pages[pg]&&!st.bad[pg]){fetchPg(pg);return}}}
 function fetchPg(pg){st.busy=true;var g=st.gen;
  api('/api/x/view/hex?'+item.q+'&off='+(pg*PG)+'&len='+PG,undefined,{job:false}).then(function(j){st.busy=false;if(st.gone||g!==st.gen)return;keep(pg,VIEW.b64(j.b64));if(j.size!==st.size){st.size=j.size;size()}draw()},
   function(e){st.busy=false;if(st.gone||g!==st.gen)return;st.bad[pg]=1;say(tx('view.hex.pageFail',{o:'0x'+hexN(pg*PG),m:e.text||e.message}));draw()})}
 // geometry: rows of the file mapped onto the scroll bar (proportional, so a file taller than the browser can scroll still fits)
 function size(){st.rows=Math.max(1,Math.ceil(st.size/COLS));st.W=Math.max(8,hexN(Math.max(0,st.size-1)).length);layout()}
 function layout(){var vh=sc.clientHeight||ROWH*24;st.vis=Math.max(1,Math.floor(vh/ROWH));var H=Math.min(MAXPX,st.rows*ROWH);
  pane.style.height=vh+'px';sp.style.height=Math.max(0,H-vh)+'px';setFirst(st.first)}
 function maxFirst(){return Math.max(0,st.rows-st.vis)}
 function maxTop(){return Math.max(0,(sc.scrollHeight||0)-(sc.clientHeight||0))}
 function setFirst(f){f=Math.max(0,Math.min(maxFirst(),Math.floor(f)));st.first=f;var mt=maxTop(),mf=maxFirst();var t=mf&&mt?Math.round(f/mf*mt):0;
  if(Math.abs((sc.scrollTop||0)-t)>1){st.expTop=t;sc.scrollTop=t}draw()}
 function onScroll(){if(!st.ready)return;var t=sc.scrollTop||0;if(st.expTop>=0&&Math.abs(t-st.expTop)<=1){st.expTop=-1;return}st.expTop=-1;
  var mt=maxTop(),mf=maxFirst();st.first=mt?Math.max(0,Math.min(mf,Math.round(t/mt*mf))):0;draw()}
 function draw(){if(st.drawQ||st.gone)return;st.drawQ=true;raf(function(){st.drawQ=false;paint()})}
 function paint(){if(st.gone||!st.ready)return;pane.textContent='';var pgs=[];
  if(!st.size){pane.appendChild(h('div',{class:'hint',text:tx('view.hex.empty')}));rd.textContent='';return}
  for(var r=st.first;r<Math.min(st.rows,st.first+st.vis);r++){var off=r*COLS,hx=h('span',{class:'vw-hx-h'}),as=h('span',{class:'vw-hx-a'});
   for(var c=0;c<COLS;c++){var i=off+c,cls='vw-hx-b'+(c===8?' vw-hx-g':''),b=null,t='  ',a=' ';
    if(i<st.size){b=byteAt(i);var pg=Math.floor(i/PG);if(b==null){t=st.bad[pg]?'??':'..';a=' ';if(pgs.indexOf(pg)<0)pgs.push(pg)}else{t=hx2(b);a=b>=32&&b<127?String.fromCharCode(b):'.'}
     if(i===st.cur)cls+=' vw-hx-cur';else if(st.mark&&i>=st.mark[0]&&i<st.mark[1])cls+=' vw-hx-mk'}
    hx.appendChild(h('span',{class:cls,'data-o':i<st.size?String(i):null,text:t}));
    as.appendChild(h('span',{class:'vw-hx-c'+(i===st.cur?' vw-hx-cur':''),'data-o':i<st.size?String(i):null,text:a}))}
   pane.appendChild(h('div',{class:'vw-hx-r'},[h('span',{class:'vw-hx-o',text:hexN(off,st.W)}),hx,as]))}
  readout();need(pgs)}
 function readout(){var i=st.cur,a=[];for(var k=0;k<4;k++)a.push(byteAt(i+k));
  var o='0x'+hexN(i),d=String(i),dash='-';
  function u(n){for(var k=0;k<n;k++)if(a[k]==null)return null;var v=0;for(k=n-1;k>=0;k--)v=v*256+a[k];return v}
  var u8=u(1),u16=u(2),u32=u(4);
  rd.textContent=tx('view.hex.read',{o:o,d:d,u8:u8==null?dash:u8,i8:u8==null?dash:(u8>127?u8-256:u8),u16:u16==null?dash:u16,i16:u16==null?dash:(u16>32767?u16-65536:u16),
   u32:u32==null?dash:u32,i32:u32==null?dash:(u32>2147483647?u32-4294967296:u32),f32:u32==null?dash:f32(a)})}
 function moveTo(i,keepMark){if(!st.size)return;i=Math.max(0,Math.min(st.size-1,Math.floor(i)));st.cur=i;if(!keepMark)st.mark=null;var r=Math.floor(i/COLS),f=st.first;
  if(r<f)f=r;else if(r>=f+st.vis)f=r-st.vis+1;setFirst(f)}
 function goOff(){var n=parseOff(offIn.value);if(!isFinite(n)||n<0){say(tx('view.hex.badOff'));offIn.focus();return}
  if(n>=st.size){say(tx('view.hex.pastEnd',{n:st.size}));offIn.focus();return}say('');moveTo(n);var f=Math.floor(n/COLS)-Math.floor(st.vis/3);setFirst(f);sc.focus()}
 // find: the server walks the file from the byte after the cursor, a slice per call; the page goes on until a hit or the end
 function findNext(){var v=fIn.value;if(!v){fIn.focus();return}var mode=fMode.value==='hex'?'hex':'text';
  if(mode==='hex'&&!/^\s*(0x)?([0-9a-f]{2}[\s,]*)+$/i.test(v)){say(tx('view.hex.badHex'));fIn.focus();return}
  var g=++st.gen,from=st.mark&&st.mark[0]===st.cur?st.cur+1:st.cur;
  (function step(at){api('/api/x/view/hex/find?'+item.q+'&from='+at+'&'+mode+'='+encodeURIComponent(v),undefined,{what:tx('view.hex.job.read')}).then(function(j){if(st.gone||g!==st.gen)return;
    if(j.at>=0){st.mark=[j.at,j.at+j.len];moveTo(j.at,true);say(tx('view.hex.found',{o:'0x'+hexN(j.at)+' ('+j.at+')'}));sc.focus();return}
    if(j.done){say(tx('view.hex.notFound'));return}
    say(tx('view.hex.searching',{p:j.size?Math.floor(j.next*100/j.size):100}));step(j.next)},
   function(e){if(g===st.gen&&!st.gone)say(e.text||e.message)})})(from)}
 sc.addEventListener('scroll',onScroll);
 sc.addEventListener('wheel',function(e){if(!st.ready)return;var d=e.deltaY||0;if(!d)return;e.preventDefault();var n=e.deltaMode===1?d:e.deltaMode===2?d*st.vis:d/ROWH;
  n=n>0?Math.max(1,Math.round(n)):Math.min(-1,Math.round(n));setFirst(st.first+n)});
 sc.addEventListener('mousedown',function(e){var t=e.target,o=t&&t.getAttribute&&t.getAttribute('data-o');if(o!=null&&o!==''){moveTo(Number(o));sc.focus();e.preventDefault()}});
 sc.addEventListener('keydown',function(e){var k=e.key,c=e.ctrlKey||e.metaKey,row=Math.floor(st.cur/COLS)*COLS,step=COLS*Math.max(1,st.vis-1);
  if(c&&(k==='g'||k==='G')){e.preventDefault();offIn.focus();if(offIn.select)offIn.select();return}
  if((c&&(k==='f'||k==='F'))||k==='F3'){e.preventDefault();if(k==='F3'&&fIn.value)findNext();else{fIn.focus();if(fIn.select)fIn.select()}return}
  var to=k==='ArrowLeft'?st.cur-1:k==='ArrowRight'?st.cur+1:k==='ArrowUp'?st.cur-COLS:k==='ArrowDown'?st.cur+COLS:k==='PageUp'?st.cur-step:k==='PageDown'?st.cur+step:
   k==='Home'?(c?0:row):k==='End'?(c?st.size-1:Math.min(st.size-1,row+COLS-1)):null;
  if(to==null)return;e.preventDefault();moveTo(to)});
 offIn.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();goOff()}else if(e.key==='Escape'){e.preventDefault();sc.focus()}});
 fIn.addEventListener('keydown',function(e){if(e._sk)return;if(e.key==='Enter'||e.key==='F3'){e.preventDefault();findNext()}else if(e.key==='Escape'){e.preventDefault();sc.focus()}});
 var ro=null;if(typeof ResizeObserver!=='undefined'){ro=new ResizeObserver(function(){if(st.ready&&!st.hid)layout()});ro.observe(sc)}
 VIEW.info(item).then(function(o){if(st.gone)return;top.textContent='';top.appendChild(VIEW.head(item,o));st.size=o.size;st.ready=true;size()},
  function(e){if(st.gone)return;top.textContent='';top.appendChild(h('div',{class:e.cancelled?'hint':'err',text:e.text||e.message}))});
 return {close:function(){st.gone=true;st.gen++;if(ro)ro.disconnect();st.pages={};st.lru=[]},focus:function(){sc.focus()},
  refresh:function(){st.pages={};st.lru=[];st.bad={};st.gen++;st.busy=false;item._info=null;VIEW.info(item).then(function(o){if(st.gone)return;top.textContent='';top.appendChild(VIEW.head(item,o));st.size=o.size;st.ready=true;size()},function(e){say(e.text||e.message)})},
  hide:function(){st.hid=true},show:function(){st.hid=false;if(st.ready)layout()}}}});
})();
`;
const css = [
  '.vw-hx-top{flex:0 0 auto}',
  '.vw-hx-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;padding:6px 10px;border-bottom:1px solid var(--line);flex:0 0 auto}',
  '.vw-hx-l{display:flex;align-items:center;gap:4px}',
  '.vw-hx-in{width:12em}.vw-hx-fin{width:16em}',
  '.vw-hx-msg{color:var(--hint);font-size:12px}',
  '.vw-hx-sc{flex:1 1 auto;min-height:60px;overflow:auto;position:relative;outline:none}',
  '.vw-hx-sc:focus-visible{box-shadow:inset 0 0 0 2px var(--acc)}',
  '.vw-hx-pane{position:sticky;top:0;overflow:hidden;padding:0 10px;font-size:13px;line-height:18px;white-space:pre}',
  '.vw-hx-r{height:18px;display:flex;gap:16px}',
  '.vw-hx-o{color:var(--hint)}',
  '.vw-hx-b{padding:0 3px;cursor:default}.vw-hx-g{margin-left:8px}',
  '.vw-hx-c{cursor:default}',
  '.vw-hx-cur{background:var(--pri);color:var(--prifg)}',
  '.vw-hx-mk{background:var(--hit)}',
  '.vw-hx-rd{flex:0 0 auto;padding:4px 10px;border-top:1px solid var(--line);font-size:12px;white-space:pre-wrap;color:var(--fg)}',
].join('\n');
module.exports = { script, css };
