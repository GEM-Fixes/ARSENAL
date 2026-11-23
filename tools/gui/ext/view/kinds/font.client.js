// view kind font, page side (.fnt, binary BMFont): the font's facts and those of its .font, the game's notes,
// a "type here" box that draws the line with the real glyph metrics and kerning (as the game does: x + xoffset + kerning,
// advance + kerning; a character the font lacks is drawn as '?') and lists the characters the font lacks, each atlas page with the glyph
// boxes over it (the typed glyphs marked), and the glyph table with a filter. Read only.
// Page rules: ES5, no backtick, no dollar-brace, no innerHTML, DOM through h() and textContent, strings through tx().
// Author: Imperator_Aug (ARSENAL, ia-75543b63)
'use strict';
const script = String.raw`
(function(){
var NS='view.font.';
var MAXROWS=300,SCALE=2;
function cp(id){id=id&0xffff;if(id<32||(id>=0xd800&&id<0xe000))return '';try{return String.fromCharCode(id)}catch(e){return ''}}
function hex4(n){var s=(n>>>0).toString(16).toUpperCase();while(s.length<4)s='0'+s;return 'U+'+s}
VIEW.reg('font',{where:'tab',label:'view.font.label',exts:['fnt'],open:function(host,item){
 var st={gone:false,o:null,map:{},kern:{},imgs:[],cvs:[],text:''};
 var top=h('div',{class:'vw-fn-top'},[h('div',{class:'hint',text:tx('view.loading')})]);
 var body=h('div',{class:'vw-fn-body'});
 host.appendChild(top);host.appendChild(body);
 var tin=null,tcv=null,tmsg=null,fin=null,tbody=null,tmore=null;
 function g2d(c){try{return c&&c.getContext?c.getContext('2d'):null}catch(e){return null}}
 // the line as the engine lays it out; returns {w, missing:[codes], used:{id:1}}
 function layout(s){var o=st.o,pen=0,prev=0,miss=[],seen={},used={},q=[];
  for(var i=0;i<s.length;i++){var c=s.charCodeAt(i),g=st.map[c];
   if(!g){if(!seen[c]){seen[c]=1;miss.push(c)}g=st.map[63]}
   if(!g){prev=c;continue}
   var k=st.kern[prev*65536+c]||0;q.push({g:g,x:pen+g[5]+k,y:g[6]});used[g[0]&0xffff]=1;pen+=g[7]+k;prev=c}
  return {w:pen,q:q,missing:miss,used:used}}
 function drawText(){var s=tin.value||'',L=layout(s),o=st.o,lh=o.common?o.common.lineHeight:16;
  tcv.setAttribute('data-w',String(L.w));tcv.width=Math.max(1,(L.w+8)*SCALE);tcv.height=Math.max(1,(lh+8)*SCALE);
  var c=g2d(tcv);if(c){c.setTransform&&c.setTransform(SCALE,0,0,SCALE,0,0);c.clearRect(0,0,tcv.width,tcv.height);
   for(var i=0;i<L.q.length;i++){var e=L.q[i],g=e.g,im=st.imgs[g[8]];
    if(im&&im.ok)c.drawImage(im.el,g[1]*im.sx,g[2]*im.sy,g[3]*im.sx,g[4]*im.sy,4+e.x,4+e.y,g[3],g[4]);
    else{c.strokeStyle=(typeof cssv==='function'?cssv('--hint'):'')||'currentColor';c.strokeRect(4+e.x+0.5,4+e.y+0.5,g[3],g[4])}}}
  tmsg.textContent=L.missing.length?tx('view.font.missing',{n:L.missing.length,l:L.missing.slice(0,40).map(function(m){return (cp(m)||'?')+' '+hex4(m)}).join(', ')+(L.missing.length>40?' ...':'')}):(s?tx('view.font.allThere'):'');
  st.used=L.used;st.cvs.forEach(function(f){f()})}
 function pageBox(pf,i){var o=st.o,W=o.common?o.common.scaleW:256,H=o.common?o.common.scaleH:256;
  var cv=h('canvas',{class:'vw-fn-atlas',width:String(W),height:String(H)}),msg=h('div',{class:'vw-fn-pm hint'});
  var box=h('div',{class:'vw-fn-page'},[h('b',{text:tx('view.font.page',{i:i,n:pf.name})}),h('span',{class:'vw-fn-pf vw-mono',text:pf.file?tx('view.font.uses',{f:pf.file}):tx('view.font.noTex',{n:pf.stem})}),msg,cv]);
  var im={ok:false,el:null,sx:1,sy:1};st.imgs[i]=im;
  function paint(){var c=g2d(cv);if(!c)return;c.clearRect(0,0,W,H);if(im.ok)c.drawImage(im.el,0,0,W,H);
   var ch=o.chars,u=st.used||{};c.lineWidth=1;
   for(var k=0;k<ch.length;k++){var g=ch[k];if(g[8]!==i)continue;c.strokeStyle=u[g[0]&0xffff]?((typeof cssv==='function'?cssv('--err'):'')||'currentColor'):((typeof cssv==='function'?cssv('--acc'):'')||'currentColor');c.strokeRect(g[1]+0.5,g[2]+0.5,Math.max(0,g[3]-1),Math.max(0,g[4]-1))}}
  st.cvs.push(paint);
  if(pf.file){msg.textContent=tx('view.loading');
   api('/api/x/view/font/page?'+item.q+'&i='+i,undefined,{job:false}).then(function(j){if(st.gone)return;
    if(!j.drawn){msg.textContent=j.why==='format'?tx('view.font.notDrawn',{e:j.ext}):tx('view.font.texFail',{m:j.m||j.why});paint();return}
    msg.textContent=tx('view.font.texSize',{w:j.w,h:j.h});
    if(j.w!==W||j.h!==H)msg.textContent+='  '+tx('view.font.texDiff',{w:W,h:H});
    if(typeof Image==='undefined'){paint();return}
    var el=new Image();el.onload=function(){if(st.gone)return;im.el=el;im.ok=true;im.sx=j.w/W;im.sy=j.h/H;paint();drawText()};el.src='data:image/png;base64,'+j.png},
   function(e){if(!st.gone)msg.textContent=tx('view.font.texFail',{m:e.text||e.message})})}
  paint();return box}
 function table(){var f=String(fin.value||'').trim(),o=st.o,rows=[],fl=f.toLowerCase(),num=/^(u\+|0x)?[0-9a-f]+$/i.test(f)?parseInt(f.replace(/^(u\+|0x)/i,''),/^(u\+|0x)/i.test(f)?16:10):NaN;
  var pg=-1;(o.pageFiles||[]).forEach(function(pf,i){if(fl&&String(pf.stem||'').toLowerCase()===fl)pg=i});
  for(var i=0;i<o.chars.length;i++){var g=o.chars[i];
   if(f&&!(g[8]===pg||f.indexOf(cp(g[0]))>=0&&cp(g[0])!==''||g[0]===num||hex4(g[0]).toLowerCase()===fl))continue;rows.push(g)}
  tbody.textContent='';
  rows.slice(0,MAXROWS).forEach(function(g){var tr=h('tr');[String(g[0]),cp(g[0])+'  '+hex4(g[0]),g[1],g[2],g[3],g[4],g[5],g[6],g[7],g[8],g[9]].forEach(function(v){tr.appendChild(h('td',{text:String(v)}))});tbody.appendChild(tr)});
  tmore.textContent=rows.length>MAXROWS?tx('view.font.more',{n:rows.length-MAXROWS}):''}
 function draw(info,o){st.o=o;st.map={};st.kern={};
  for(var i=0;i<o.chars.length;i++){var g=o.chars[i];st.map[g[0]&0xffff]=g}
  for(i=0;i<o.kerning.length;i++){var k=o.kerning[i];st.kern[(k[0]&0xffff)*65536+(k[1]&0xffff)]=k[2]}
  var rows=[],I=o.info||{},C=o.common||{},F=o.font;
  rows.push([tx('view.font.h.face'),(I.name||'?')+'  '+tx('view.font.px',{n:Math.abs(I.fontSize||0)})+(I.bold?'  '+tx('view.font.bold'):'')+(I.italic?'  '+tx('view.font.italic'):'')]);
  rows.push([tx('view.font.h.metrics'),tx('view.font.metrics',{l:C.lineHeight,b:C.base,w:C.scaleW,h:C.scaleH,p:C.pages})]);
  rows.push([tx('view.font.h.glyphs'),tx('view.font.glyphs',{n:o.chars.length,k:o.kerning.length})]);
  rows.push([tx('view.font.h.version'),o.sig+' '+o.version+'  ('+o.blocks.map(function(b){return b.type}).join(' ')+')']);
  if(F)rows.push([tx('view.font.h.font',{f:F.file}),tx('view.font.ffacts',{n:F.name==null?'-':F.name,s:F.size==null?'-':F.size,h:F.height==null?'-':F.height,st:F.style==null?'-':F.style,b:F.binary==null?'-':F.binary})]);
  else rows.push([tx('view.font.h.font',{f:'.font'}),tx('view.font.noFont')]);
  top.textContent='';top.appendChild(VIEW.head(item,info,rows));
  body.textContent='';
  if(F&&F.binary&&String(F.binary).toLowerCase().split('/').pop()!==String(item.name||'').toLowerCase())o.notes.push({code:'otherBinary',p:{b:F.binary}});
  if(o.notes.length){var ul=h('ul',{class:'vw-fn-notes'});o.notes.forEach(function(n){ul.appendChild(h('li',null,[h('span',{text:tx(NS+'n.'+n.code,n.p)})]))});
   body.appendChild(h('div',{class:'vw-fn-card'},[h('b',{text:tx('view.font.notes')}),ul]))}
  // type here
  tin=h('input',{type:'text',class:'vw-fn-in',placeholder:tx('view.font.typePh'),'aria-label':tx('view.font.type'),spellcheck:'false'});
  tin.value=tx('view.font.sample');tcv=h('canvas',{class:'vw-fn-tc'});tmsg=h('div',{class:'vw-fn-msg',role:'status'});
  tin.addEventListener('input',drawText);
  body.appendChild(h('div',{class:'vw-fn-card'},[h('label',{class:'vw-fn-l'},[h('b',{text:tx('view.font.type')}),tin]),h('div',{class:'vw-fn-tw'},[tcv]),tmsg]));
  // pages
  var pg=h('div',{class:'vw-fn-pages'});(o.pageFiles||[]).forEach(function(pf,i){pg.appendChild(pageBox(pf,i))});body.appendChild(pg);
  // glyph table
  fin=h('input',{type:'text',class:'vw-fn-in',placeholder:tx('view.font.filterPh'),'aria-label':tx('view.font.filter')});
  // the glyph filter (searchKit, tools/gui/README.md): index = this font's glyphs (character + U+hex, picks the hex), Browse = the
  // game's data view at interface/font (the atlas pages): a picked page file's name shows that page's glyphs; history key
  // view.font.filter; the table draws at most MAXROWS rows
  var GL=o.chars.map(function(g){var c=cp(g[0]),x=hex4(g[0]);return {label:(c||'?')+'  '+x,value:x,l:(c+' '+x+' '+g[0]).toLowerCase()}});
  var finKit=typeof searchKit!=='function'?null:searchKit(fin,{key:'view.font.filter',
   index:function(q,done){var w=String(q||'').trim().toLowerCase(),a=[],n=0;for(var i=0;i<GL.length;i++){if(w&&GL[i].l.indexOf(w)<0&&GL[i].label.indexOf(q)<0)continue;n++;if(a.length<40)a.push(GL[i])}done(a,n-a.length)},
   browse:{mode:'file',view:'data',start:'interface/font',exts:['ebm','tex','dds','tga','bmp','jpg','png'],toValue:function(p){var b=String(p||'').split('/').pop();return b.replace(/\.[^.]*$/,'')||b}},
   onPick:function(v){fin.value=v;table()}});
  fin.addEventListener('input',table);
  tbody=h('tbody');tmore=h('div',{class:'hint'});
  var hr=h('tr');['id','char','x','y','w','h','xoff','yoff','adv','page','chnl'].forEach(function(k){hr.appendChild(h('th',{text:tx(NS+'c.'+k)}))});
  body.appendChild(h('div',{class:'vw-fn-card'},[h('label',{class:'vw-fn-l'},[h('b',{text:tx('view.font.table')}),finKit?finKit.el:fin]),h('table',{class:'vw-fn-t vw-mono'},[h('thead',null,[hr]),tbody]),tmore]));
  table();drawText()}
 function start(){Promise.all([VIEW.info(item),api('/api/x/view/font/info?'+item.q,undefined,{what:tx('view.font.job.read')})]).then(function(a){if(!st.gone)draw(a[0],a[1])},
  function(e){if(st.gone)return;top.textContent='';top.appendChild(h('div',{class:e.cancelled?'hint':'err',text:e.text||e.message}))})}
 start();
 return {close:function(){st.gone=true;st.imgs=[];st.cvs=[]},focus:function(){if(tin)tin.focus()},refresh:function(){item._info=null;st.imgs=[];st.cvs=[];start()}}}});
})();
`;
const css = [
  '.vw-fn-top{flex:0 0 auto}',
  '.vw-fn-body{flex:1 1 auto;overflow:auto;padding:8px 10px;display:flex;flex-direction:column;gap:10px;min-height:0}',
  '.vw-fn-card{border:1px solid var(--line);background:var(--card);padding:8px 10px;display:flex;flex-direction:column;gap:6px}',
  '.vw-fn-notes{margin:0;padding-left:18px;font-size:12px}.vw-fn-src{color:var(--hint);margin-left:8px;font-size:11px}',
  '.vw-fn-l{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.vw-fn-in{flex:1 1 240px;min-width:160px}',
  '.vw-fn-tw{overflow:auto;background:var(--hd);border:1px solid var(--line)}.vw-fn-tc{display:block}',
  '.vw-fn-msg{font-size:12px;color:var(--fg)}',
  '.vw-fn-pages{display:flex;flex-direction:column;gap:10px}',
  '.vw-fn-page{display:flex;flex-direction:column;gap:4px}.vw-fn-pf{font-size:12px}.vw-fn-pm{font-size:12px}',
  '.vw-fn-atlas{max-width:100%;height:auto;align-self:flex-start;image-rendering:pixelated;border:1px solid var(--line);background:repeating-conic-gradient(var(--hdl) 0 25%,var(--hd) 0 50%) 0 0/16px 16px}',
  '.vw-fn-t{border-collapse:collapse;font-size:12px}.vw-fn-t th,.vw-fn-t td{border:1px solid var(--line);padding:1px 6px;text-align:right}.vw-fn-t th{color:var(--hint)}',
].join('\n');
module.exports = { script, css };
