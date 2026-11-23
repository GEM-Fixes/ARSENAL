// view kind picture, page side: a picture or texture (.dds .tga .bmp .psd .png .jpg) on a canvas. Read only.
// The server decodes (GET /api/x/view/picture/image -> RGBA, at most 2048 a side; PNG/JPEG come as the file and the browser draws
// them); the header card says size, format, mipmaps, alpha, where it comes from and the game's verdicts (GET .../picture/info).
// Zoom: Fit, 100 %, the wheel (around the mouse), + and -; drag to move. Background (checker, black, white) shows alpha; channels
// (colour and alpha, colour only, alpha only, red, green, blue); mipmap and cube face pickers; the pixel under the mouse is read out.
// "Show bytes" opens the hex kind; "Open the model" opens a .mdl of the same folder in the model kind when that kind exists.
// Page rules: ES5, no backtick, no dollar-brace, no innerHTML, DOM through h() and textContent, strings through tx().
// Author: Imperator_Aug (ARSENAL, ia-3aa730e4)
'use strict';
const script = String.raw`
(function(){
var BG='checker';
function maxSide(){try{var w=window.innerWidth||1200;return w<700?1024:2048}catch(e){return 2048}}
VIEW.reg('picture',{where:'tab',label:'view.picture.label',exts:['dds','tga','bmp','psd','png','jpg','jpeg'],open:function(host,item){
 var st={gone:false,hid:false,gen:0,src:null,w:0,h:0,j:null,inf:null,z:1,px:0,py:0,fit:true,ch:'rgba',mip:null,face:0,drag:null};
 var top=h('div',{class:'vw-pic-top'},[h('div',{class:'hint',text:tx('view.loading')})]);
 var notes=h('div',{class:'vw-pic-notes',role:'status'});
 function btn(k,f,cls){return h('button',{type:'button',class:cls||'',text:tx(k),onclick:f})}
 function sel(k,opts,f){var s=h('select',{class:'vw-pic-sel','aria-label':tx(k)},opts.map(function(o){return h('option',{value:o[0],text:tx(o[1])})}));s.addEventListener('change',f);return s}
 var zl=h('span',{class:'vw-pic-zl'});
 var bgSel=sel('view.picture.bg',[['checker','view.picture.bgChecker'],['black','view.picture.bgBlack'],['white','view.picture.bgWhite']],function(){BG=bgSel.value;bgSet()});
 var chSel=sel('view.picture.ch',[['rgba','view.picture.chRgba'],['rgb','view.picture.chRgb'],['a','view.picture.chA'],['r','view.picture.chR'],['g','view.picture.chG'],['b','view.picture.chB']],function(){st.ch=chSel.value;paint()});
 var mipSel=h('select',{class:'vw-pic-sel','aria-label':tx('view.picture.mip')});mipSel.addEventListener('change',function(){st.mip=Number(mipSel.value);load()});
 var faceSel=h('select',{class:'vw-pic-sel','aria-label':tx('view.picture.face')});faceSel.addEventListener('change',function(){st.face=Number(faceSel.value);load()});
 var mipL=h('label',{class:'vw-pic-l',hidden:true},[h('span',{text:tx('view.picture.mip')}),mipSel]);
 var faceL=h('label',{class:'vw-pic-l',hidden:true},[h('span',{text:tx('view.picture.face')}),faceSel]);
 var bMdl=btn('view.picture.model',openModel),bFrame=btn('view.picture.frameBtn',openFrame);bMdl.hidden=true;bFrame.hidden=true;
 var bar=h('div',{class:'vw-pic-bar'},[btn('view.picture.fit',function(){fitNow()}),btn('view.picture.actual',function(){zoomTo(1)}),
  h('button',{type:'button',text:'-','aria-label':tx('view.picture.zoomOut'),title:tx('view.picture.zoomOut'),onclick:function(){zoomBy(1/1.25)}}),
  h('button',{type:'button',text:'+','aria-label':tx('view.picture.zoomIn'),title:tx('view.picture.zoomIn'),onclick:function(){zoomBy(1.25)}}),zl,
  h('label',{class:'vw-pic-l'},[h('span',{text:tx('view.picture.bg')}),bgSel]),h('label',{class:'vw-pic-l'},[h('span',{text:tx('view.picture.ch')}),chSel]),mipL,faceL,
  btn('view.picture.bytes',function(){VIEW.open(item.ref,item.name,{kind:'hex'})}),bFrame,bMdl]);
 var cv=document.createElement('canvas');cv.className='vw-pic-cv';
 var msg=h('div',{class:'vw-pic-msg hint'});
 var stage=h('div',{class:'vw-pic-stage',tabindex:'0',role:'img','aria-label':tx('view.picture.stage'),title:tx('view.picture.stage')},[cv,msg]);
 var rd=h('div',{class:'vw-pic-rd vw-mono',text:tx('view.picture.pxOut')});
 host.appendChild(top);host.appendChild(notes);host.appendChild(bar);host.appendChild(stage);host.appendChild(rd);
 bgSel.value=BG;bgSet();say('');
 function bgSet(){stage.className='vw-pic-stage vw-pic-bg-'+BG}
 function say(s){msg.textContent=s||'';msg.hidden=!s}
 function err(e){return e&&(e.text||e.message)||String(e)}
 // ---- facts: the header card and the game's verdicts
 function aText(a){var k='view.picture.a.'+a,v=tx(k);return v===k?a:v}
 function noteText(n){var k='view.picture.n.'+n.code,v=tx(k,n.p||{});return v===k?(n.msg||n.code):v}
 function card(o,pi,j){var rows=[];
  if(pi){if(pi.width)rows.push([tx('view.picture.h.size'),tx('view.picture.sz',{w:pi.width,h:pi.height})]);if(pi.format)rows.push([tx('view.picture.h.format'),pi.format]);
   rows.push([tx('view.picture.h.mips'),String(pi.mips||1)]);rows.push([tx('view.picture.h.alpha'),aText(pi.alpha||'no')]);
   if(pi.cube)rows.push([tx('view.picture.h.cube'),tx('view.picture.faces',{n:pi.faces})]);
   if(pi.frame)rows.push([tx('view.picture.h.frame'),pi.frame]);
   rows.push([tx('view.picture.h.game'),pi.type==='psd'?tx('view.picture.game.psd'):pi.game&&pi.game.ok?tx('view.picture.game.ok'):tx('view.picture.game.no')])}
  if(j&&j.width)rows.push([tx('view.picture.h.shown'),(j.scaled?tx('view.picture.shownScaled',{w:j.width,h:j.height}):tx('view.picture.sz',{w:j.width,h:j.height}))+
   ((j.mips||1)>1?'  '+tx('view.picture.shownMip',{m:j.mip||0}):'')+(j.hasAlpha?'  '+tx('view.picture.alphaUsed'):'')]);
  top.textContent='';top.appendChild(VIEW.head(item,o||{name:item.name,size:item.size||0},rows))}
 function showNotes(list){notes.textContent='';(list||[]).forEach(function(n){notes.appendChild(h('div',{class:'vw-pic-n vw-pic-n-'+(n.level||'info'),text:noteText(n)}))});notes.hidden=!(list&&list.length)}
 function pickers(pi){var ms=pi&&pi.mipSizes||[];mipSel.textContent='';
  for(var i=0;i<ms.length;i++)mipSel.appendChild(h('option',{value:String(i),text:tx('view.picture.mipOpt',{i:i,w:ms[i][0],h:ms[i][1]})}));
  mipL.hidden=ms.length<2;faceSel.textContent='';
  for(var f=0;f<(pi&&pi.faces||1);f++)faceSel.appendChild(h('option',{value:String(f),text:tx('view.picture.faceOpt',{n:f+1})}));
  faceL.hidden=!(pi&&pi.cube&&pi.faces>1);
  bMdl.hidden=!(pi&&pi.mdl&&VIEW.spec('model'));bFrame.hidden=!(pi&&pi.frame)}
 function start(){var g=++st.gen;st.inf=null;
  var a=VIEW.info(item).then(function(o){return o},function(){return null});
  var b=api('/api/x/view/picture/info?'+item.q,undefined,{what:tx('view.picture.job.read')}).then(function(o){return o},function(e){return {err:err(e)}});
  Promise.all([a,b]).then(function(r){if(st.gone||g!==st.gen)return;st.o=r[0];var pi=r[1]&&!r[1].err?r[1]:null;st.inf=pi;card(r[0],pi,null);
   if(pi){showNotes(pi.notes);pickers(pi)}else{showNotes([]);if(r[1]&&r[1].err){say(r[1].err);return}}load()})}
 // ---- pixels
 function load(){var g=++st.gen;say(tx('view.picture.decoding'));
  var q='/api/x/view/picture/image?'+item.q+'&max='+maxSide()+(st.mip!=null?'&mip='+st.mip:'')+(st.face?'&face='+st.face:'');
  api(q,undefined,{what:tx('view.picture.job.read')}).then(function(j){if(st.gone||g!==st.gen)return;st.j=j;
   if(j.pass){fromFile(j,g);return}
   take(VIEW.b64(j.rgba),j.width,j.height,j)},
   function(e){if(st.gone||g!==st.gen)return;say(tx('view.picture.fail',{m:err(e)}))})}
 function fromFile(j,g){if(typeof Image==='undefined'){say(tx('view.picture.passFail'));return}var im=new Image();
  im.onload=function(){if(st.gone||g!==st.gen)return;try{var c=document.createElement('canvas');c.width=im.naturalWidth||im.width;c.height=im.naturalHeight||im.height;
   var x=c.getContext('2d');x.drawImage(im,0,0);var d=x.getImageData(0,0,c.width,c.height);c.width=0;c.height=0;j.width=d.width;j.height=d.height;
   var a=d.data,au=false;for(var i=3;i<a.length;i+=4)if(a[i]!==255){au=true;break}j.hasAlpha=au;take(a,d.width,d.height,j)}catch(e){say(tx('view.picture.passFail'))}};
  im.onerror=function(){if(g===st.gen)say(tx('view.picture.passFail'))};im.src='data:'+j.pass+';base64,'+j.b64;j.b64=null}
 function take(px,w,hh,j){st.src=px;st.w=w;st.h=hh;say('');
  if(j.mips>1)mipSel.value=String(j.mip||0);if(j.cube)faceSel.value=String(j.face||0);
  if(j.notes){showNotes(j.notes)}if(st.inf)card(st.o,Object.assign({},st.inf,{mdl:j.mdl,frame:j.frame}),j);else card(st.o,Object.assign({},j,{width:j.fileWidth||j.width,height:j.fileHeight||j.height}),j);
  if(!st.inf)pickers(j);
  cv.width=w;cv.height=hh;cv.style.width=w+'px';cv.style.height=hh+'px';paint();if(st.fit)fitNow();else place()}
 function paint(){if(!st.src||st.gone)return;var x=cv.getContext&&cv.getContext('2d');if(!x)return;var w=st.w,hh=st.h,s=st.src,id=x.createImageData(w,hh),d=id.data,n=w*hh*4,ch=st.ch,i,v;
  if(ch==='rgba'){if(d.set)d.set(s);else for(i=0;i<n;i++)d[i]=s[i]}
  else for(i=0;i<n;i+=4){if(ch==='rgb'){d[i]=s[i];d[i+1]=s[i+1];d[i+2]=s[i+2]}else{v=ch==='a'?s[i+3]:ch==='r'?s[i]:ch==='g'?s[i+1]:s[i+2];d[i]=d[i+1]=d[i+2]=v}d[i+3]=255}
  x.putImageData(id,0,0)}
 // ---- zoom and pan
 function sw(){return stage.clientWidth||640}function sh(){return stage.clientHeight||480}
 function place(){cv.style.transform='translate('+Math.round(st.px)+'px,'+Math.round(st.py)+'px) scale('+st.z+')';cv.style.imageRendering=st.z>=1?'pixelated':'auto';
  zl.textContent=tx('view.picture.zoom',{z:Math.round(st.z*1000)/10})}
 function fitNow(){if(!st.w)return;st.fit=true;var z=Math.min(sw()/st.w,sh()/st.h);z=Math.max(1/64,Math.min(64,z));st.z=z;st.px=(sw()-st.w*z)/2;st.py=(sh()-st.h*z)/2;place()}
 function zoomAt(nz,mx,my){nz=Math.max(1/64,Math.min(64,nz));st.fit=false;st.px=mx-(mx-st.px)*nz/st.z;st.py=my-(my-st.py)*nz/st.z;st.z=nz;place()}
 function zoomBy(f){zoomAt(st.z*f,sw()/2,sh()/2)}
 function zoomTo(z){if(!st.w)return;st.fit=false;st.z=z;st.px=(sw()-st.w*z)/2;st.py=(sh()-st.h*z)/2;place()}
 function rel(e){var r=stage.getBoundingClientRect?stage.getBoundingClientRect():{left:0,top:0};return [e.clientX-r.left,e.clientY-r.top]}
 stage.addEventListener('wheel',function(e){if(!st.w)return;e.preventDefault();var p=rel(e);zoomAt(st.z*((e.deltaY||0)<0?1.25:1/1.25),p[0],p[1])});
 stage.addEventListener('mousedown',function(e){if(e.button)return;st.drag={x:e.clientX,y:e.clientY,px:st.px,py:st.py};if(stage.focus)stage.focus();e.preventDefault()});
 function onMove(e){if(st.drag){st.fit=false;st.px=st.drag.px+e.clientX-st.drag.x;st.py=st.drag.py+e.clientY-st.drag.y;place()}}
 function onUp(){st.drag=null}
 document.addEventListener('mousemove',onMove);document.addEventListener('mouseup',onUp);
 stage.addEventListener('mousemove',function(e){if(!st.src)return;var p=rel(e),ix=Math.floor((p[0]-st.px)/st.z),iy=Math.floor((p[1]-st.py)/st.z);
  if(ix<0||iy<0||ix>=st.w||iy>=st.h){rd.textContent=tx('view.picture.pxOut');return}
  var o=(iy*st.w+ix)*4,s=st.src,j=st.j||{},fx=ix,fy=iy;
  if(j.srcWidth&&j.srcWidth!==st.w){fx=Math.floor(ix*j.srcWidth/st.w);fy=Math.floor(iy*j.srcHeight/st.h)}
  rd.textContent=tx('view.picture.px',{x:fx,y:fy,r:s[o],g:s[o+1],b:s[o+2],a:s[o+3]})});
 stage.addEventListener('mouseleave',function(){rd.textContent=tx('view.picture.pxOut')});
 stage.addEventListener('keydown',function(e){var k=e.key;if(k==='0'||k==='f'||k==='F'){e.preventDefault();fitNow()}else if(k==='1'){e.preventDefault();zoomTo(1)}
  else if(k==='+'||k==='='){e.preventDefault();zoomBy(1.25)}else if(k==='-'||k==='_'){e.preventDefault();zoomBy(1/1.25)}});
 var ro=null;if(typeof ResizeObserver!=='undefined'){ro=new ResizeObserver(function(){if(!st.hid&&st.fit)fitNow()});ro.observe(stage)}
 function refOf(key){var r=item.ref||{};return {mod:r.mod,key:key}}
 function openModel(){var k=(st.j&&st.j.mdl)||(st.inf&&st.inf.mdl);if(!k)return;if(!VIEW.spec('model')){if(typeof toast==='function')toast(tx('view.picture.noModel'));return}VIEW.open(refOf(k),null,{kind:'model'})}
 function openFrame(){var k=(st.j&&st.j.frame)||(st.inf&&st.inf.frame);if(k)VIEW.open(refOf(k),null,{kind:'picture'})}
 start();
 return {close:function(){st.gone=true;st.gen++;st.src=null;st.j=null;cv.width=0;cv.height=0;if(ro)ro.disconnect();
   if(document.removeEventListener){document.removeEventListener('mousemove',onMove);document.removeEventListener('mouseup',onUp)}},
  focus:function(){if(stage.focus)stage.focus()},
  refresh:function(){item._info=null;st.mip=null;st.face=0;start()},
  hide:function(){st.hid=true;st.drag=null},show:function(){st.hid=false;if(st.fit)fitNow()}}}});
})();
`;
const css = [
  '.vw-pic-top{flex:0 0 auto}',
  '.vw-pic-notes{flex:0 0 auto;display:flex;flex-direction:column;gap:2px;padding:4px 10px;border-bottom:1px solid var(--line);font-size:12px}',
  '.vw-pic-notes[hidden]{display:none}',
  '.vw-pic-n:\x3abefore{content:"\\2022  "}',
  '.vw-pic-n-bad{color:var(--err);font-weight:600}.vw-pic-n-warn{color:var(--warnfg)}.vw-pic-n-info{color:var(--hint)}',
  '.vw-pic-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;padding:6px 10px;border-bottom:1px solid var(--line);flex:0 0 auto}',
  '.vw-pic-l{display:flex;align-items:center;gap:4px}.vw-pic-l[hidden]{display:none}',
  '.vw-pic-sel{width:auto}',
  '.vw-pic-zl{min-width:5em;color:var(--hint);font-size:12px}',
  '.vw-pic-stage{flex:1 1 auto;min-height:120px;position:relative;overflow:hidden;outline:none;cursor:grab;touch-action:none}',
  '.vw-pic-stage:focus-visible{box-shadow:inset 0 0 0 2px var(--acc)}',
  '.vw-pic-stage:active{cursor:grabbing}',
  '.vw-pic-bg-black{background:#000}.vw-pic-bg-white{background:#fff}',
  '.vw-pic-bg-checker{background-color:#fff;background-image:linear-gradient(45deg,#c8c8c8 25%,transparent 25%),linear-gradient(-45deg,#c8c8c8 25%,transparent 25%),' +
    'linear-gradient(45deg,transparent 75%,#c8c8c8 75%),linear-gradient(-45deg,transparent 75%,#c8c8c8 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}',
  '.vw-pic-cv{position:absolute;left:0;top:0;transform-origin:0 0;image-rendering:crisp-edges;image-rendering:pixelated}',
  '.vw-pic-msg{position:absolute;left:10px;top:8px;padding:4px 8px;background:var(--card);border:1px solid var(--line);border-radius:3px}.vw-pic-msg[hidden]{display:none}',
  '.vw-pic-rd{flex:0 0 auto;padding:4px 10px;border-top:1px solid var(--line);font-size:12px;white-space:pre-wrap;color:var(--fg)}',
].join('\n');
module.exports = { script, css };
