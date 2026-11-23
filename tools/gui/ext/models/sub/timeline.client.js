// Models page, Timeline part (parity rows TL-01..09 and the frame / key rows of ANM): EXT_SCREENS.models.parts.timeline(ctx, opts)
// returns one element for the Animation part (sub/anim.client.js), which shares its state through EXT_SCREENS.models.animShared.
// Parts: a toolbar (zoom, fit, the selected range and what to do with it, interpolate with an ease), a grid (bone names on the left,
// a canvas on the right: a ruler, an events row with show / hide marks, one row per bone with its keys as diamonds and its hidden
// spans shaded, the current frame as a line, the selected range shaded), a right-click menu, and the model's sequences (name, file,
// speed in steps of 0.1, smooth, flags, length in seconds at 50 frames a second times the speed).
// Mouse on the canvas: on the ruler, press and drag to scrub; on a key, drag it to another frame (one op, anm.key.move); inside the
// selected range, drag to move those frames (anm.frames.move); elsewhere, drag to select a range, Shift+click to stretch it from the
// current frame; a click picks the frame and the bone; double-click opens the pose form; the wheel steps one frame, Ctrl+wheel
// zooms, Shift+wheel scrolls.
// Colours: only the page's CSS variables, read with getComputedStyle on the html element; redrawn on a data-theme change
// (MutationObserver) and on the prefers-color-scheme media query.
// Page rules: no backtick, no dollar-brace, no innerHTML; DOM through h(); text through tx(); no new global names.
// Test seam: EXT_SCREENS.models.parts.timeline._t (pure helpers).
// Author: Imperator_Aug (ARSENAL, ia-dbbac76f)
module.exports = String.raw`
(function(){
 var RULER=22,RH=18,ZMIN=2,ZMAX=60,FPS=50;
 var TS={zoom:Number(LS.get('models.tl.zoom','12'))||12};

 // ---------- pure helpers (test seam) ----------
 function clamp(x,a,b){return x<a?a:x>b?b:x}
 function frameAt(x,zoom,n){if(n<1)return 0;return clamp(Math.floor(x/zoom),0,n-1)}
 function rowAt(y,bones){if(y<RULER)return {kind:'ruler'};var r=Math.floor((y-RULER)/RH);if(r===0)return {kind:'events'};r-=1;return r<bones?{kind:'bone',index:r}:{kind:'none'}}
 function norm(a,b){return a<=b?[a,b]:[b,a]}
 function inRange(f,r){return !!r&&f>=r[0]&&f<=r[1]}
 function hasKey(keys,f){return (keys||[]).indexOf(f)>=0}
 // spans [from, to] where the bone is hidden, from its visibility changes [[frame, shown], ...]
 function hiddenSpans(vis,n){var out=[],s=null,v=(vis||[]).slice().sort(function(a,b){return a[0]-b[0]});
  for(var i=0;i<v.length;i++){if(!v[i][1]&&s===null)s=v[i][0];else if(v[i][1]&&s!==null){out.push([s,v[i][0]-1]);s=null}}
  if(s!==null)out.push([s,n-1]);return out}
 function zoomed(z,dir){var x=dir>0?z*1.25:z/1.25;return Math.round(clamp(x,ZMIN,ZMAX)*100)/100}
 function fitZoom(width,n){if(n<1)return 12;return Math.round(clamp((width-4)/n,ZMIN,ZMAX)*100)/100}
 function seconds(frames,speed){var s=Math.abs(Number(speed)||1);return Math.round(frames/(FPS*s)*1000)/1000}
 function tick(z){var steps=[1,2,5,10,20,50,100,200,500];for(var i=0;i<steps.length;i++)if(steps[i]*z>=40)return steps[i];return 1000}
 function speedOk(s){var x=Number(String(s).replace(',','.'));return isFinite(x)&&x!==0?Math.round(x*10)/10:null}
 function readVar(n){try{var cs=window.getComputedStyle&&window.getComputedStyle(document.documentElement);return cs?String(cs.getPropertyValue(n)||'').trim():''}catch(e){return ''}}

 EXT_SCREENS.models.parts=EXT_SCREENS.models.parts||{};
 EXT_SCREENS.models.parts.timeline=function(ctx,opts){
  var el=ctx.el,D=ctx.doc||EXT_SCREENS.models.doc,SH=EXT_SCREENS.models.animShared||{};
  opts=opts||{};
  // blocks (sub/README.md "Blocks"): the timeline is the container opts.blk (default 'tl'); its rows, the strip (labels and canvas) and the
  // sequence list are leaves
  var T0=opts.blk||'tl';function TL(id,kids,a){a=a||{'class':'row'};a.blk=T0+'.'+id;return el('div',a,kids)}
  var root=el('div',{class:'card','aria-label':tx('models.tl.title'),blk:T0,box:'col','data-blkname':tx('models.tl.title')});
  if(!D)return root;
  var msg=el('div',{class:'hint',role:'status'});
  function say(t,bad){msg.className=bad?'err':'hint';msg.textContent=t||''}
  function run(name,args){say(tx('models.tl.working'));var p=D.op(name,args).then(function(j){say('');return j}).catch(function(e){say(e.text||e.message,true);throw e});p.catch(function(){});return p}
  function btn(key,fn,tip){return el('button',{type:'button',text:tx(key),title:tip?tx(tip):'',onclick:fn})}
  function rel(){return D.sel&&D.sel.anm||null}
  function info(){return SH.info&&SH.rel===rel()?SH.info:null}
  function n(){var I=info();return I?I.frames:0}
  function F(){return D.sel.frame||0}

  // ---------- toolbar ----------
  var rangeTxt=el('span',{class:'hint'});
  var easeSel=el('select',{'aria-label':tx('models.tl.ease')},['linear','in','out','inout'].map(function(k){return el('option',{value:k,text:tx(['models.tl.ease',k].join('.'))})}));
  var onlyBone=el('input',{type:'checkbox','aria-label':tx('models.tl.onlyBone')});
  function R(){return SH.range}
  function needR(fn){return function(){if(!rel())return;if(!R())return say(tx('models.tl.noRange'),true);fn(R())}}
  function bone(){return D.sel.bone||null}
  root.appendChild(TL('title',[el('h3',{text:tx('models.tl.title')})],{}));
  root.appendChild(TL('zoom',[btn('models.tl.zoomOut',function(){setZoom(zoomed(TS.zoom,-1))}),btn('models.tl.zoomIn',function(){setZoom(zoomed(TS.zoom,1))}),
   btn('models.tl.fit',function(){setZoom(fitZoom(scroll.clientWidth||600,n()))}),rangeTxt,
   btn('models.tl.selectAll',function(){selectAll()}),btn('models.tl.clear',function(){setRange(null)})]));
  root.appendChild(TL('keys',[btn('models.tl.copy',needR(function(r){copy(r)})),btn('models.tl.paste',function(){paste()}),
   btn('models.tl.dup',needR(function(r){run('anm.frames.duplicate',{rel:rel(),from:r[0],to:r[1]})}),'models.tl.dup.tip'),
   btn('models.tl.del',needR(function(r){run('anm.frames.delete',{rel:rel(),from:r[0],to:r[1]}).then(function(){setRange(null)})})),
   btn('models.tl.rev',needR(function(r){run('anm.reverse',{rel:rel(),from:r[0],to:r[1]})})),
   btn('models.tl.bake',needR(function(r){run('anm.bake',{rel:rel(),from:r[0],to:r[1]})}),'models.tl.bake.tip')]));
  root.appendChild(TL('interp',[btn('models.tl.interp',needR(function(r){if(r[1]-r[0]<2)return say(tx('models.tl.interp.short'),true);
    var a={rel:rel(),from:r[0],to:r[1],ease:easeSel.value};if(onlyBone.checked&&bone())a.bone=bone();run('anm.interpolate',a)}),'models.tl.interp.tip'),
   el('span',{text:tx('models.tl.ease')}),easeSel,el('label',{},[onlyBone,el('span',{text:' '+tx('models.tl.onlyBone')})]),
   btn('models.tl.hide',needR(function(r){if(bone())run('anm.vis.set',{rel:rel(),bone:bone(),from:r[0],to:r[1],visible:false})})),
   btn('models.tl.show',needR(function(r){if(bone())run('anm.vis.set',{rel:rel(),bone:bone(),from:r[0],to:r[1],visible:true})}))]));

  // ---------- grid ----------
  var labels=el('div',{style:'flex:0 0 auto;min-width:8em;max-width:14em;overflow:hidden;font-size:12px'});
  var cv=el('canvas',{'aria-label':tx('models.tl.canvas'),role:'img',style:'display:block;cursor:crosshair'});
  var scroll=el('div',{style:'flex:1 1 auto;overflow-x:auto;overflow-y:hidden;min-width:0'},[cv]);
  root.appendChild(el('div',{style:'display:flex;border:1px solid var(--line);background:var(--card)',blk:T0+'.strip','data-blkname':tx('models.tl.canvas')},[labels,scroll]));
  root.appendChild(TL('msg',[msg],{'data-blkname':tx('models.tl.blk.msg')}));
  function setZoom(z){TS.zoom=z;LS.set('models.tl.zoom',String(z));draw()}
  function setRange(r){SH.range=r?norm(r[0],r[1]):null;draw()}
  function selectAll(){if(n())setRange([0,n()-1])}
  SH.selectAll=selectAll;SH.redraw=function(){draw();drawSeq()};
  function copy(r){D.state('anm.clip',{rel:rel(),from:r[0],to:r[1]}).then(function(c){SH.clip=c;say(tx('models.tl.copied',{n:r[1]-r[0]+1}))}).catch(function(e){say(e.text||e.message,true)})}
  function paste(){if(!rel())return;if(!SH.clip)return say(tx('models.tl.nothing'),true);run('anm.paste',{rel:rel(),at:R()?R()[0]:F(),clip:SH.clip,grow:true})}
  var C={};
  function colours(){C={bg:readVar('--card'),grid:readVar('--line2'),line:readVar('--line'),txt:readVar('--hint'),fg:readVar('--fg'),key:readVar('--acc'),
   cur:readVar('--err'),range:readVar('--sel'),hide:readVar('--bad'),ev:readVar('--ok'),head:readVar('--th'),hov:readVar('--hov')}}
  function draw(){var I=info(),N=n(),bones=I?I.bones:[];
   while(labels.firstChild)labels.removeChild(labels.firstChild);
   labels.appendChild(el('div',{style:'height:'+RULER+'px;line-height:'+RULER+'px;padding:0 4px',text:tx('models.tl.frame')}));
   labels.appendChild(el('div',{style:'height:'+RH+'px;line-height:'+RH+'px;padding:0 4px',class:'hint',text:tx('models.tl.events')}));
   bones.forEach(function(b){var on=D.sel.bone&&b.name.toLowerCase()===String(D.sel.bone).toLowerCase();
    labels.appendChild(el('div',{style:'height:'+RH+'px;line-height:'+RH+'px;padding:0 4px;white-space:nowrap;cursor:pointer'+(on?';background:var(--sel)':''),title:b.inModel?b.name:tx('models.tl.notInModel',{b:b.name}),
     text:(b.inModel?'':'? ')+b.name,onclick:function(){D.select({bone:b.name})}}))});
   var w=Math.max(40,Math.ceil(N*TS.zoom)+4),hgt=RULER+RH*(1+bones.length);
   if(cv.width!==w)cv.width=w;if(cv.height!==hgt)cv.height=hgt;
   var g=cv.getContext&&cv.getContext('2d');if(!g)return;colours();var z=TS.zoom;
   g.fillStyle=C.bg;g.fillRect(0,0,w,hgt);g.fillStyle=C.head;g.fillRect(0,0,w,RULER);
   if(!I){g.fillStyle=C.txt;g.font='12px sans-serif';g.fillText(tx('models.tl.empty'),6,RULER+13);return}
   var r=R();if(r){g.fillStyle=C.range;g.fillRect(r[0]*z,0,(r[1]-r[0]+1)*z,hgt)}
   var t=tick(z);g.strokeStyle=C.grid;g.fillStyle=C.txt;g.font='10px sans-serif';g.lineWidth=1;
   for(var f=0;f<N;f++){var x=f*z+0.5;if(f%t===0){g.beginPath();g.moveTo(x,RULER-8);g.lineTo(x,hgt);g.stroke();g.fillText(String(f),x+2,10)}
    else if(z>=6){g.beginPath();g.moveTo(x,RULER-3);g.lineTo(x,RULER);g.stroke()}}
   for(var i=0;i<=bones.length+1;i++){var y=RULER+i*RH+0.5;g.strokeStyle=C.grid;g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke()}
   (I.events||[]).filter(function(e){return e.rel&&rel()&&e.rel.toLowerCase()===rel().toLowerCase()}).forEach(function(e){var x=e.frame*z+z/2;
    g.fillStyle=e.kind==='hide'?C.cur:C.ev;g.beginPath();g.moveTo(x,RULER+3);g.lineTo(x+4,RULER+RH-3);g.lineTo(x-4,RULER+RH-3);g.closePath();g.fill()});
   bones.forEach(function(b,k){var y0=RULER+RH*(k+1);
    hiddenSpans(b.vis,N).forEach(function(s){g.fillStyle=C.hide;g.fillRect(s[0]*z,y0+2,(s[1]-s[0]+1)*z,RH-3)});
    var on=D.sel.bone&&b.name.toLowerCase()===String(D.sel.bone).toLowerCase();
    if(on){g.strokeStyle=C.key;g.strokeRect(0.5,y0+0.5,w-1,RH-1)}
    (b.keys||[]).forEach(function(f){var cx=f*z+z/2,cy=y0+RH/2,s=Math.min(5,Math.max(2.5,z/2.5));g.fillStyle=drag&&drag.kind==='key'&&drag.bone===b.name&&drag.from===f?C.txt:C.key;
     g.beginPath();g.moveTo(cx,cy-s);g.lineTo(cx+s,cy);g.lineTo(cx,cy+s);g.lineTo(cx-s,cy);g.closePath();g.fill()})});
   if(drag&&drag.kind==='key'&&drag.to!==drag.from){var dy=RULER+RH*(drag.row+1)+RH/2,dx=drag.to*z+z/2;g.strokeStyle=C.fg;g.beginPath();g.moveTo(dx,dy-5);g.lineTo(dx+5,dy);g.lineTo(dx,dy+5);g.lineTo(dx-5,dy);g.closePath();g.stroke()}
   if(drag&&drag.kind==='frames'&&drag.to!==drag.from){var off=drag.to-drag.from;g.strokeStyle=C.fg;g.strokeRect((r[0]+off)*z+0.5,0.5,(r[1]-r[0]+1)*z,hgt-1)}
   var cx2=F()*z+z/2;g.strokeStyle=C.cur;g.lineWidth=2;g.beginPath();g.moveTo(cx2,0);g.lineTo(cx2,hgt);g.stroke();g.lineWidth=1;
   rangeTxt.textContent=r?tx('models.tl.range',{a:r[0],b:r[1],n:r[1]-r[0]+1}):tx('models.tl.noRangeShort');
   var vx=F()*z;if(scroll.scrollLeft>vx||scroll.scrollLeft+(scroll.clientWidth||0)<vx+z){if(scroll.clientWidth)scroll.scrollLeft=Math.max(0,vx-scroll.clientWidth/2)}}

  // ---------- mouse ----------
  var drag=null;
  function where(e){var b=cv.getBoundingClientRect?cv.getBoundingClientRect():{left:0,top:0};var x=e.clientX-b.left,y=e.clientY-b.top,I=info();
   return {x:x,y:y,f:frameAt(x,TS.zoom,n()),row:rowAt(y,I?I.bones.length:0)}}
  function boneOf(row){var I=info();return row.kind==='bone'&&I?I.bones[row.index]:null}
  cv.addEventListener('mousedown',function(e){if(e.button!==0||!info())return;closeMenu();var p=where(e),b=boneOf(p.row);
   if(e.preventDefault)e.preventDefault();if(root.focus)try{root.parentNode&&root.parentNode.focus&&root.parentNode.focus()}catch(x){}
   if(p.row.kind==='ruler'){drag={kind:'scrub'};SH.pause&&SH.pause();SH.go(p.f)}
   else if(e.shiftKey){setRange([F(),p.f]);drag={kind:'range',a:F(),moved:true}}
   else if(R()&&inRange(p.f,R())){drag={kind:'frames',from:p.f,to:p.f}}
   else if(b&&hasKey(b.keys,p.f)){drag={kind:'key',bone:b.name,row:p.row.index,from:p.f,to:p.f};D.select({bone:b.name})}
   else{drag={kind:'range',a:p.f,moved:false,bone:b?b.name:null}}
   document.addEventListener('mousemove',move);document.addEventListener('mouseup',up)});
  function move(e){if(!drag)return;var p=where(e);
   if(drag.kind==='scrub')SH.go(p.f);
   else if(drag.kind==='range'){if(p.f!==drag.a)drag.moved=true;if(drag.moved)setRange([drag.a,p.f])}
   else if(drag.to!==p.f){drag.to=p.f;draw()}}
  function up(e){document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up);var d=drag;drag=null;if(!d)return;
   if(d.kind==='key'){if(d.to!==d.from)run('anm.key.move',{rel:rel(),bone:d.bone,from:d.from,to:d.to}).then(function(){SH.go(d.to)});else{SH.range=null;SH.go(d.from);draw()}}
   else if(d.kind==='frames'){var r=R();if(d.to!==d.from&&r){var at=clamp(r[0]+(d.to-d.from),0,n()-(r[1]-r[0]+1));
     run('anm.frames.move',{rel:rel(),from:r[0],to:r[1],at:at}).then(function(){setRange([at,at+r[1]-r[0]])})}else draw()}
   else if(d.kind==='range'&&!d.moved){setRange(null);if(d.bone)D.select({bone:d.bone,frame:d.a});else SH.go(d.a)}}
  cv.addEventListener('dblclick',function(e){if(!info())return;var p=where(e),b=boneOf(p.row);if(b)D.select({bone:b.name,frame:p.f});else SH.go(p.f);if(SH.edit)SH.edit()});
  cv.addEventListener('wheel',function(e){if(!info()||e.shiftKey)return;if(e.preventDefault)e.preventDefault();var d=e.deltaY>0?1:-1;
   if(e.ctrlKey||e.metaKey)setZoom(zoomed(TS.zoom,-d));else if(SH.step)SH.step(d)},{passive:false});

  // ---------- right-click menu ----------
  var menu=null;
  function closeMenu(){if(menu&&menu.parentNode)menu.parentNode.removeChild(menu);menu=null;document.removeEventListener('mousedown',outside,true)}
  function outside(e){if(menu&&!menu.contains(e.target))closeMenu()}
  cv.addEventListener('contextmenu',function(e){if(!info())return;if(e.preventDefault)e.preventDefault();closeMenu();var p=where(e),b=boneOf(p.row),f=p.f;
   if(b)D.select({bone:b.name,frame:f});else SH.go(f);
   var r=R()&&inRange(f,R())?R():[f,f];
   var items=[['models.tl.m.edit',function(){if(SH.edit)SH.edit()}],
    ['models.tl.m.key',function(){if(SH.setKey)SH.setKey()}],
    ['models.tl.m.delKey',function(){if(SH.delKey)SH.delKey()}],
    ['models.tl.m.insert',function(){run('anm.frames.insert',{rel:rel(),at:f+1,count:1})}],
    ['models.tl.m.dup',function(){run('anm.frames.duplicate',{rel:rel(),from:r[0],to:r[1]})}],
    ['models.tl.m.del',function(){run('anm.frames.delete',{rel:rel(),from:r[0],to:r[1]})}],
    ['models.tl.m.earlier',function(){if(r[0]>0)run('anm.frames.move',{rel:rel(),from:r[0],to:r[1],at:r[0]-1}).then(function(){if(R())setRange([r[0]-1,r[1]-1])})}],
    ['models.tl.m.later',function(){if(r[1]<n()-1)run('anm.frames.move',{rel:rel(),from:r[0],to:r[1],at:r[0]+1}).then(function(){if(R())setRange([r[0]+1,r[1]+1])})}],
    ['models.tl.m.copy',function(){copy(r)}],['models.tl.m.paste',function(){paste()}],
    ['models.tl.m.reverse',function(){run('anm.reverse',{rel:rel(),from:r[0],to:r[1]})}],
    ['models.tl.m.interp',function(){if(r[1]-r[0]<2)return say(tx('models.tl.interp.short'),true);run('anm.interpolate',{rel:rel(),from:r[0],to:r[1],ease:easeSel.value})}],
    ['models.tl.m.selectAll',function(){selectAll()}],
    ['models.tl.m.prevKey',function(){jump(b,f,-1)}],['models.tl.m.nextKey',function(){jump(b,f,1)}],
    ['models.tl.m.undo',function(){D.undo()}],['models.tl.m.redo',function(){D.redo()}]];
   menu=el('div',{role:'menu',style:'position:fixed;z-index:50;left:'+e.clientX+'px;top:'+e.clientY+'px;background:var(--card);color:var(--fg);border:1px solid var(--line);box-shadow:0 2px 8px var(--shadow);padding:2px;display:flex;flex-direction:column;min-width:12em'},
    items.map(function(it){return el('button',{type:'button',role:'menuitem',style:'text-align:left;border:0;background:transparent;color:var(--fg);padding:3px 8px',text:tx(it[0]),
     onclick:function(){closeMenu();it[1]()}})}));
   menu.addEventListener('keydown',function(k){if(k.key==='Escape'){closeMenu();k.stopPropagation&&k.stopPropagation()}});
   document.body.appendChild(menu);document.addEventListener('mousedown',outside,true);
   var first=menu.firstChild;if(first&&first.focus)first.focus()});
  function jump(b,f,dir){var I=info(),keys=b?b.keys:(I?I.keyFrames:[]),g=null;(keys||[]).forEach(function(k){if(dir>0?(k>f&&(g===null||k<g)):(k<f&&(g===null||k>g)))g=k});if(g!==null)SH.go(g)}

  // ---------- sequences (TL rows) ----------
  var seqBox=TL('seq',[],{'data-blkname':tx('models.tl.seq')});root.appendChild(TL('seq.title',[el('h3',{text:tx('models.tl.seq')})],{}));root.appendChild(seqBox);
  var FLAGS=['resume','store','autostart','movement'];
  // the file box of a sequence row (searchKit, tools/gui/README.md): index = the .anm files of the open document (made once
  // per file list, words in lower case), history key models.tl.seq.file; the input alone in a part test without the page's kit
  var AX={src:null,list:[]};
  function anmItems(){var fl=(D&&D.files)||[];if(AX.src!==fl){AX={src:fl,list:[]};fl.forEach(function(x){var r=String(x.rel||'');if(!/\.anm$/i.test(r))return;var p=r.lastIndexOf('/');
   AX.list.push({label:r.slice(p+1),value:r.slice(p+1),hint:r,group:p<0?'':r.slice(0,p),lo:r.toLowerCase()})})}return AX.list}
  // Browse = the file picker on the game data at the model's folder, .anm files: the pick goes in as the model writes it (from its folder)
  function fileBox(i){if(typeof searchKit!=='function')return i;var PA=EXT_SCREENS.models.pickAt;return searchKit(i,{key:'models.tl.seq.file',
   browse:{mode:'file',view:'data',start:function(){return PA.dir(D)},exts:['anm'],toValue:function(p,e){return PA.rel(D,PA.key(p,e))}},
   index:function(q,done){var w=String(q).toLowerCase().split(/\s+/).filter(Boolean),st=[],mid=[];
    anmItems().forEach(function(x){if(w.every(function(t){return x.lo.indexOf(t)>=0}))(x.label.toLowerCase().indexOf(w[0])===0?st:mid).push(x)});var r=st.concat(mid);done(r.slice(0,40),Math.max(0,r.length-40))}}).el}
  function drawSeq(){while(seqBox.firstChild)seqBox.removeChild(seqBox.firstChild);var I=SH.info;var list=(I&&I.sequences)||null;
   if(!list){seqBox.appendChild(el('div',{class:'hint',text:tx('models.tl.seq.none')}));}
   (list||[]).forEach(function(s){
    var name=el('input',{type:'text',value:s.name,'aria-label':tx('models.tl.seq.name'),style:'width:9em'});
    var file=el('input',{type:'text',value:s.file||'','aria-label':tx('models.tl.seq.file'),placeholder:s.name+'.anm',style:'width:12em'});
    var sp=el('input',{type:'number',step:'0.1',value:String(s.speed==null?1:s.speed),'aria-label':tx('models.tl.seq.speed'),style:'width:5em'});
    var sm=el('input',{type:'number',step:'0.1',min:'0',max:'1',value:s.smooth==null?'':String(s.smooth),'aria-label':tx('models.tl.seq.smooth'),style:'width:5em'});
    var fl=FLAGS.map(function(k){var c=el('input',{type:'checkbox','aria-label':tx(['models.tl.seq.flag',k].join('.'))});c.checked=!!s[k];return [k,c]});
    var len=s.frames?tx('models.tl.seq.len',{f:s.frames,s:seconds(s.frames,s.speed)}):tx('models.tl.seq.noFile');
    var where2=s.bone?tx('models.tl.seq.bone',{b:s.bone}):'';
    seqBox.appendChild(el('div',{class:'row',style:'flex-wrap:wrap'},[name,fileBox(file),el('span',{text:tx('models.tl.seq.speed')}),sp,el('span',{text:tx('models.tl.seq.smooth')}),sm].concat(
     fl.map(function(p){return el('label',{},[p[1],el('span',{text:' '+tx(['models.tl.seq.flag',p[0]].join('.'))})])}),[
     el('span',{class:'hint',text:len+(where2?'  '+where2:'')+(s.unknown&&s.unknown.length?'  '+tx('models.tl.seq.unknown',{k:s.unknown.join(', ')}):'')}),
     btn('models.tl.seq.save',function(){var spd=speedOk(sp.value);if(spd===null)return say(tx('models.tl.seq.badSpeed'),true);
      var f={speed:spd,smooth:sm.value===''?null:Number(sm.value),file:file.value.trim()||null};if(name.value.trim()!==s.name)f.name=name.value.trim();
      fl.forEach(function(p){f[p[0]]=p[1].checked});run('tl.seq.set',{sequence:s.name,bone:s.bone||undefined,fields:f})}),
     btn('models.tl.seq.open',function(){if(s.rel)D.select({anm:s.rel,frame:0})}),
     btn('models.tl.seq.del',function(){if(!window.confirm||window.confirm(tx('models.tl.seq.del.ask',{s:s.name})))run('tl.seq.delete',{sequence:s.name,bone:s.bone||undefined})})])))});
   var nn=el('input',{type:'text','aria-label':tx('models.tl.seq.name'),placeholder:tx('models.tl.seq.name'),style:'width:9em'});
   seqBox.appendChild(el('div',{class:'row'},[nn,btn('models.tl.seq.add',function(){var v=nn.value.trim();if(!v)return say(tx('models.tl.seq.needName'),true);
    var a={name:v};if(rel())a.file=String(rel()).split('/').pop();run('tl.seq.add',a)},'models.tl.seq.add.tip')]))}

  // ---------- theme and selection ----------
  function theme(){if(root.isConnected===false){stop();return}draw()}
  var mo=null,mq=null;
  try{if(typeof MutationObserver==='function'&&document.documentElement){mo=new MutationObserver(theme);mo.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class','style']})}}catch(e){}
  try{if(window.matchMedia){mq=window.matchMedia('(prefers-color-scheme: dark)');if(mq.addEventListener)mq.addEventListener('change',theme);else if(mq.addListener)mq.addListener(theme)}}catch(e){}
  function stop(){try{if(mo)mo.disconnect()}catch(e){}try{if(mq){if(mq.removeEventListener)mq.removeEventListener('change',theme);else if(mq.removeListener)mq.removeListener(theme)}}catch(e){}mo=null;mq=null}
  D.on(function(ev){if(root.isConnected===false){stop();return}if(ev.type==='select')draw()});
  draw();drawSeq();
  if(EXT_SCREENS.models.blockify)EXT_SCREENS.models.blockify(root);   // one leaf per field (../client.js)
  return root;
 };
 EXT_SCREENS.models.parts.timeline._t={frameAt:frameAt,rowAt:rowAt,norm:norm,inRange:inRange,hiddenSpans:hiddenSpans,zoomed:zoomed,fitZoom:fitZoom,seconds:seconds,tick:tick,speedOk:speedOk,RULER:RULER,RH:RH};
})();
`;
