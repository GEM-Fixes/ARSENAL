// Browser side of the Units page tool "Unit card" (routes: card.js). It goes into client.js at the //@unitcard mark (index.js), so it
// uses the page's picked unit (cur), mod (curMod, modBody), blocks (blk), the 3D viewer (lkViewer), the picked skin and variant of the
// Equipment card (skSkin, skTex), writers/ready (a mod switch resets the Write button) and askDo (the confirm box).
// Page rules: no backtick, no dollar-brace, no innerHTML; every control and text in a leaf block; strings units.card.* in four languages.
// Nothing is asked in init: the current pictures are asked when a unit is opened while this tool is shown, or when the tool opens.
// The render is the Models page viewer on a hidden pane: snapshot() polls with timers (no rAF), so a hidden pane still gives the picture.
// Author: unitcard tool (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-e2115b56)
module.exports = String.raw`
 // ---------- tool "Unit card": the unit's interface pictures in the vanilla style (tools/unitcard) ----------
 var uc={seq:0,pseq:0,u:null,kinds:[],na:[],sig:'',src:null,srcName:'',from:'image',renders:{},crop:null,last:null,stale:true,timer:null},ucV={},ucW={btn:null,last:null};
 function ucK(k,p){return tx(['units.card',k].join('.'),p)}
 function ucKindName(id){var t=ucK('k.'+id);return t==='units.card.k.'+id?id:t}
 // the soldier a squad's pictures show: the member it has most of (content "mp/rus/rifle:5 ..."), else its first soldier
 function ucBreed(){if(!cur)return '';if(cur.kind==='soldier')return cur.id;var best='',bn=0;
  String(cur.content||'').split(/\s+/).forEach(function(w){var i=w.lastIndexOf(':'),id=i>0?w.slice(0,i):w,n=i>0?Number(w.slice(i+1))||1:1;if(/^mp\//i.test(id)&&n>bn){best=id;bn=n}});if(best)return best;
  var p=cur.brings&&cur.brings.parts||[];for(var i=0;i<p.length;i++)if(p[i].kind==='soldier')return p[i].id;
  // members [{breed, n, card}] (a GoH squad a macro builds: breed "late/rifle", card "mp/can/late/rifle"): the most numerous one
  var m=cur.members||[],mb=null;for(var j=0;j<m.length;j++)if(m[j]&&(!mb||(Number(m[j].n)||1)>(Number(mb.n)||1)))mb=m[j];
  if(mb&&mb.card&&/^mp\//i.test(String(mb.card)))return String(mb.card);if(mb&&mb.breed&&cur.army)return 'mp/'+cur.army+'/'+mb.breed;return ''}
 function ucUnit(){if(!cur)return null;var b={id:String(cur.id),kind:cur.kind||'',army:cur.army||''},br=ucBreed();if(br)b.breed=br;if(cur.card)b.card=cur.card;return b}
 var ucSay=el('div',{class:'hint',role:'status','aria-live':'polite',text:tx('units.pickone')});
 var ucKindBox=el('div',{class:'row',style:'flex-wrap:wrap;gap:4px 14px'}),ucNa=el('div');
 var ucNow=el('div',{class:'scroll',style:'max-height:420px'});
 function ucImg(url,w,h,z){var i=el('img',{alt:'',style:'image-rendering:pixelated;border:1px solid var(--line);background:repeating-conic-gradient(var(--line) 0 25%,transparent 0 50%) 50%/12px 12px;width:'+Math.round(w*z)+'px;height:'+Math.round(h*z)+'px'});i.src=url;return i}
 function ucPics(a,w,h,z){var r=el('div',{class:'row',style:'flex-wrap:wrap;gap:3px;align-items:flex-start'});(a||[]).forEach(function(u){r.appendChild(ucImg(u,w,h,z||1))});if(!(a&&a.length))r.appendChild(el('span',{class:'hint',text:ucK('none')}));return r}
 function ucChosen(){var o=[];uc.kinds.forEach(function(k){if(k._cb&&k._cb.checked)o.push(k.kind)});return o}
 // the current pictures of every kind beside a vanilla card of the same class
 // no unit picked: drop the last unit's kinds and list this game's kinds (sizes differ per game) with its na lines
 function ucGameKinds(){var my=++uc.seq;uc.stale=false;uc.kinds=[];uc.na=[];clear(ucKindBox);clear(ucNa);clear(ucNow);if(ucLayBox){uc.lseq++;clear(ucLayBox);ucGimpSay.textContent='';ucCutSay.textContent=''}
  api('/api/x/units/card/kinds',modBody({}),{what:ucK('job.current')}).then(function(j){if(my!==uc.seq)return;
   (j.kinds||[]).forEach(function(k){ucKindBox.appendChild(el('span',{class:'hint',title:k.use||'',text:ucKindName(k.id)+' '+k.w+'x'+k.h+(k.frames?' x'+k.frames:'')}))});
   (j.na||[]).forEach(function(n){ucNa.appendChild(el('div',{class:'hint',text:ucK('na',{k:ucKindName(n.id),why:n.why})}))})}).catch(function(){})}
 function ucCurrent(){var u=ucUnit();if(!u){ucSay.className='wzstat';ucSay.textContent=tx('units.pickone');ucGameKinds();return}
  var my=++uc.seq;uc.stale=false;ucSay.className='hint';ucSay.textContent=ucK('reading');if(ucLayBox){uc.lseq++;clear(ucLayBox);ucCutSay.textContent=''}
  api('/api/x/units/card/current',modBody(u),{what:ucK('job.current')}).then(function(j){if(my!==uc.seq)return;uc.u=j.unit;uc.kinds=j.kinds||[];uc.na=j.na||[];ucDrawKinds();
   ucSay.className='hint';ucSay.textContent=ucK('unit',{id:j.unit.id,kind:kindWord(j.unit.kind),group:ucK('g.'+j.unit.group),army:j.unit.army||'?'});ucLayers();ucSoon()})
   .catch(function(e){if(my!==uc.seq)return;ucSay.className=e.cancelled?'hint':'err';ucSay.textContent=e.message})}
 function ucDrawKinds(){clear(ucKindBox);clear(ucNa);clear(ucNow);
  uc.kinds.forEach(function(k){var c=el('input',{type:'checkbox'});c.checked=true;c.addEventListener('change',ucSoon);k._cb=c;
   ucKindBox.appendChild(el('label',{title:k.use||''},[c,el('span',{text:' '+ucKindName(k.kind)+' '+k.w+'x'+k.h+(k.frames?' x'+k.frames:'')})]))});
  uc.na.forEach(function(n){ucNa.appendChild(el('div',{class:'hint',text:ucK('na',{k:ucKindName(n.id),why:n.why})}))});
  if(!uc.kinds.length){ucNa.appendChild(el('div',{class:'wzstat',text:ucK('noKinds')}));return}
  var tb=el('tbody');uc.kinds.forEach(function(k){var w=k.w,h=k.h,from=ucK('from.'+k.from);
   tb.appendChild(el('tr',{},[el('td',{},[el('b',{text:ucKindName(k.kind)}),el('div',{class:'hint',text:(k.stem?k.folder+'/'+k.stem:ucK('noStem'))+'  '+from}),el('div',{class:'hint',text:k.use||''})]),
    el('td',{},[k.now&&k.now.length?ucPics(k.now,w,h,1):el('span',{class:'wzstat',text:ucK('noPic')})].concat(k.shadow&&k.shadow.length?[el('div',{class:'wzstat',text:ucK('pngShadow',{f:k.shadow[0]})})]:[])),el('td',{},[k.ref?ucPics(k.ref.pics,w,h,1):el('span',{class:'hint',text:ucK('none')}),el('div',{class:'hint',text:k.ref?k.ref.stem:''})])]))});
  ucNow.appendChild(el('table',{},[el('thead',{},[el('tr',{},[el('th',{text:ucK('col.kind')}),el('th',{text:ucK('col.now')}),el('th',{text:ucK('col.ref')})])]),tb]))}

 // ---------- source: an image (path box with searchKit, file pick, drop) or a render ----------
 var ucFromImg=el('input',{type:'radio',name:'ucfrom',checked:true}),ucFromRen=el('input',{type:'radio',name:'ucfrom'});
 function ucFrom(){uc.from=ucFromRen.checked?'render':'image';ucImgBox.hidden=uc.from!=='image';ucRenBox.hidden=uc.from!=='render';ucSoon()}
 ucFromImg.addEventListener('change',ucFrom);ucFromRen.addEventListener('change',ucFrom);
 var ucPath=inp('units.card.path',{placeholder:ucK('path.ph')});
 var UCI=once(function(ok,no){api('/api/x/units/card/images',modBody({}),{what:ucK('job.images')}).then(function(j){ok((j.images||[]).map(function(p){var b=String(p).replace(/\\/g,'/').split('/').pop();return {label:b,value:p,hint:p,lo:String(p).toLowerCase()}}))}).catch(no)});
 function ucDir(p){p=String(p||'').replace(/\\/g,'/');var i=p.lastIndexOf('/');return i>0?p.slice(0,i):(curMod()||'')}
 var ucKit=searchKit(ucPath,{key:'units.card.img',index:function(q,done){UCI(dataSig(),function(a){hits(a,q,done)})},
  browse:{mode:'file',view:'disk',start:function(){return ucDir(ucPath.value)},exts:['png','tga','dds','jpg','jpeg','bmp']},
  onPick:function(v){ucPath.value=v;ucLoad({path:v})}});
 ucPath.addEventListener('keydown',function(e){if(e.key==='Enter'&&ucPath.value.trim()){e.preventDefault();ucLoad({path:ucPath.value.trim()})}});
 var ucFile=el('input',{type:'file',accept:'.png,.tga,.dds,.jpg,.jpeg,.bmp,image/*','aria-label':ucK('file')});
 function ucReadFile(f){if(!f)return;if(f.size>6*1048576){ucSrcSay.className='err';ucSrcSay.textContent=ucK('tooBig');return}
  var r=new FileReader();r.onload=function(){ucLoad({data:String(r.result),name:f.name})};r.onerror=function(){ucSrcSay.className='err';ucSrcSay.textContent=ucK('readFail')};r.readAsDataURL(f)}
 ucFile.addEventListener('change',function(){ucReadFile(ucFile.files&&ucFile.files[0])});
 var ucSrcSay=el('div',{class:'hint',text:ucK('src.none')});
 // the source picture with the crop box drawn over it (drag to draw, Clear crop to drop it)
 var ucCv=el('canvas',{width:320,height:200,style:'max-width:100%;border:1px solid var(--line);cursor:crosshair;background:repeating-conic-gradient(var(--line) 0 25%,transparent 0 50%) 50%/12px 12px','aria-label':ucK('cropArea')}),ucPic=null,ucDrag=null;
 function ucDrawSrc(){var c=ucCv.getContext&&ucCv.getContext('2d');if(!c)return;c.clearRect(0,0,ucCv.width,ucCv.height);if(!ucPic)return;c.drawImage(ucPic,0,0,ucCv.width,ucCv.height);
  var b=uc.crop;if(b){var s=ucCv.width/uc.src.w;c.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--acc').trim()||'orange';c.lineWidth=2;c.strokeRect(b[0]*s,b[1]*s,b[2]*s,b[3]*s)}}
 function ucPt(e){var r=ucCv.getBoundingClientRect(),s=uc.src?uc.src.w/r.width:1;return [Math.max(0,Math.round((e.clientX-r.left)*s)),Math.max(0,Math.round((e.clientY-r.top)*s))]}
 ucCv.addEventListener('mousedown',function(e){if(!uc.src)return;ucDrag=ucPt(e);e.preventDefault()});
 ucCv.addEventListener('mousemove',function(e){if(!ucDrag)return;var p=ucPt(e);uc.crop=[Math.min(ucDrag[0],p[0]),Math.min(ucDrag[1],p[1]),Math.abs(p[0]-ucDrag[0]),Math.abs(p[1]-ucDrag[1])];ucDrawSrc()});
 function ucDragEnd(){if(!ucDrag)return;ucDrag=null;if(uc.crop&&(uc.crop[2]<4||uc.crop[3]<4))uc.crop=null;ucDrawSrc();ucSoon()}
 ucCv.addEventListener('mouseup',ucDragEnd);ucCv.addEventListener('mouseleave',ucDragEnd);
 var ucDrop=el('div',{style:'border:2px dashed var(--line);border-radius:6px;padding:10px;text-align:center',text:ucK('drop')});
 ucDrop.addEventListener('dragover',function(e){e.preventDefault();ucDrop.style.borderColor='var(--acc)'});
 ucDrop.addEventListener('dragleave',function(){ucDrop.style.borderColor=''});
 ucDrop.addEventListener('drop',function(e){e.preventDefault();ucDrop.style.borderColor='';var f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0];ucReadFile(f)});
 function ucLoad(b){var my=++uc.pseq;ucSrcSay.className='hint';ucSrcSay.textContent=ucK('loading');
  api('/api/x/units/card/load',b,{what:ucK('job.load')}).then(function(j){if(my!==uc.pseq)return;uc.src=j;uc.srcName=j.name;uc.crop=null;
   ucSrcSay.textContent=ucK('src.ok',{n:j.name,w:j.w0,h:j.h0})+(j.alpha?'':' '+ucK('src.noAlpha'));
   var im=el('img');im.onload=function(){ucPic=im;var s=Math.min(1,480/Math.max(j.w,j.h));ucCv.width=Math.max(1,Math.round(j.w*s));ucCv.height=Math.max(1,Math.round(j.h*s));ucDrawSrc();ucSoon()};im.src=j.url})
   .catch(function(e){if(my!==uc.pseq)return;ucSrcSay.className='err';ucSrcSay.textContent=e.message})}
 // fit: contain or cover, scale, offset (card pixels), mirror
 var ucFit=sel('units.card.fit',[['contain',ucK('fit.contain')],['cover',ucK('fit.cover')]]);
 function ucNum(k,mn,mx,st,v){var i=el('input',{type:'range',min:String(mn),max:String(mx),step:String(st),value:String(v),'aria-label':ucK(k)}),o=el('span',{class:'hint',text:String(v)});
  i.addEventListener('input',function(){o.textContent=i.value;ucSoon()});i._out=o;return i}
 var ucScale=ucNum('scale',0.3,2.5,0.05,1),ucDx=ucNum('dx',-60,60,1,0),ucDy=ucNum('dy',-60,60,1,0),ucMir=el('input',{type:'checkbox'});
 ucFit.addEventListener('change',ucSoon);ucMir.addEventListener('change',ucSoon);
 function ucRange(k,i){return el('label',{style:'white-space:nowrap'},[el('span',{text:ucK(k)+' '}),i,el('span',{text:' '}),i._out])}
 var ucClr=el('button',{type:'button',text:ucK('cropClear'),onclick:function(){uc.crop=null;ucDrawSrc();ucSoon()}});
 var ucReset=el('button',{type:'button',text:ucK('fitReset'),onclick:function(){ucFit.value='contain';[[ucScale,1],[ucDx,0],[ucDy,0]].forEach(function(p){p[0].value=String(p[1]);p[0]._out.textContent=String(p[1])});ucMir.checked=false;uc.crop=null;ucDrawSrc();ucSoon()}});
 var ucImgBox=blk('ucard.image',[el('div',{class:'row'},[ucKit.el,ucFile]),ucDrop,ucSrcSay,ucCv,el('div',{class:'hint',text:ucK('cropHow')})],{name:ucK('from.image')});

 // render: the unit's model as it is (skin and variant picked on the Equipment card) taken by the viewer's snapshot camera: per kind the
 // view and light of tools/unitcard/lib/camera.js (k.camera: angle, lens, fit to the projected mesh, see-through background, 8x the
 // card size); the Turn / Height / Lens boxes override the preset. One scene per scene kind (the vehicle alone, the soldier, the buy).
 // A kind without a picture says why and is left out: Write stays off until every chosen kind has one (uc.renFail).
 var ucAz=el('input',{type:'number',step:'1',style:'width:5em','aria-label':ucK('az'),placeholder:ucK('auto')}),ucEl=el('input',{type:'number',step:'1',style:'width:5em','aria-label':ucK('el'),placeholder:ucK('auto')});
 var ucFov=el('input',{type:'number',step:'1',min:'0',max:'90',style:'width:5em','aria-label':ucK('fov'),placeholder:ucK('auto')});
 var ucRenSay=el('div',{class:'hint',text:ucK('ren.none')}),ucRenPics=el('div',{class:'row',style:'flex-wrap:wrap;gap:6px'}),ucViewBox=el('div');
 var ucShow3=el('details',{},[el('summary',{text:ucK('ren.show')}),ucViewBox]);
 var ucRenBtn=el('button',{type:'button',class:'primary',text:ucK('ren.go'),onclick:function(){ucRender()}});
 // an infantry buy card shows the squad's weapon alone: the one most carried, or the one picked here (POST card/weapons)
 var ucArm=el('select',{'aria-label':ucK('arm')}),ucArmBox=el('label',{},[el('span',{text:ucK('arm')+' '}),ucArm]);ucArmBox.hidden=true;uc.arms=[];uc.armFor=null;
 ucArm.addEventListener('change',function(){uc.renders={}});
 var ucRenBox=blk('ucard.render',[el('div',{class:'row'},[ucRenBtn,el('label',{},[el('span',{text:ucK('az')+' '}),ucAz]),el('label',{},[el('span',{text:ucK('el')+' '}),ucEl]),el('label',{},[el('span',{text:ucK('fov')+' '}),ucFov]),ucArmBox]),
  el('div',{class:'hint',text:ucK('ren.cam')}),ucRenSay,ucRenPics,ucShow3],{name:ucK('from.render')});ucRenBox.hidden=true;
 uc.renFail={};uc.miss=[];
 function ucLook(){var o={};if(typeof skSkin!=='undefined'&&skSkin)o.skin=skSkin;if(typeof skTex!=='undefined'&&skTex!==null)o.variant=skTex===''?'-':skTex;return o}
 function ucBoxNum(i){var v=String(i.value||'').trim();return v!==''&&isFinite(Number(v))?Number(v):null}
 // the snapshot view of a kind: its preset with the boxes on top
 function ucView(k){var c=k.camera||{},v={az:c.az||0,el:c.el||0,fov:c.ortho?0:(c.fov||30),ortho:!!c.ortho,mirror:!!c.mirror,fit:'silhouette',margin:c.margin==null?0.02:c.margin},a=ucBoxNum(ucAz),e=ucBoxNum(ucEl),f=ucBoxNum(ucFov);
  if(a!==null)v.az=a;if(e!==null)v.el=e;if(f!==null&&!c.ortho)v.fov=f;if(c.part)v.part={from:c.part.from,to:c.part.to};return v}
 function ucLight(k){var l=k.camera&&k.camera.light;if(!l)return null;var o={az:l.az,el:l.el,amb:l.amb,dif:l.dif,sky:l.sky};if(l.grade)o.grade=l.grade;return o}
 // scene 'emblem' (squad pictures: an emblem on a shield in the game): nothing is rendered, the kind takes an image or a game badge
 function ucSceneOf(k){var c=k.camera||{};if(c.scene)return c.scene;if(k.kind==='portrait'||k.kind==='squad')return 'soldier';return uc.u&&(uc.u.group==='vehicle'||uc.u.group==='gun')?'vehicle':'buy'}
 function ucArmName(){var v=ucArm.value,w=null;for(var i=0;i<uc.arms.length;i++)if(uc.arms[i].model===v)w=uc.arms[i];return w?(w.name||w.model):(v||ucK('arm.auto'))}
 // a plain reason for a kind with no picture (snapshot info.why)
 function ucWhy(info){var w=info&&info.why,t=w?ucK('ren.why.'+w):'';if(!w||t==='units.card.ren.why.'+w)t=(info&&info.error)||ucK('ren.why.none');return t+(info&&info.detail?' ('+info.detail+')':'')}
 function ucRender(){var u=ucUnit();if(!u||!uc.u){ucRenSay.className='wzstat';ucRenSay.textContent=tx('units.pickone');return}
  var P=lkViewer();if(!P){ucRenSay.className='wzstat';ucRenSay.textContent=ucK('ren.no3d');return}
  var ks=uc.kinds.filter(function(k){return k._cb&&k._cb.checked});if(!ks.length){ucRenSay.className='wzstat';ucRenSay.textContent=ucK('pickKind');return}
  var by={},order=[];ks.forEach(function(k){var s=ucSceneOf(k);if(!by[s]){by[s]=[];order.push(s)}by[s].push(k)});
  // the weapons of the squad first, once per unit (the picker), then the pictures
  if(by.weapon&&uc.armFor!==u.id){var mw=uc.seq;ucRenSay.className='hint';ucRenSay.textContent=ucK('arm.read');
   api('/api/x/units/card/weapons',modBody(Object.assign({id:u.id},u.card?{card:u.card}:{})),{what:ucK('arm.read')}).then(function(j){if(mw!==uc.seq)return;uc.arms=j.weapons||[];uc.armFor=u.id;clear(ucArm);
    uc.arms.forEach(function(w,i){ucArm.appendChild(el('option',{value:w.model,text:ucK('arm.opt',{w:w.name||w.model,n:Math.round(w.n*10)/10})}))});ucArmBox.hidden=!uc.arms.length;ucRender()})
    .catch(function(e){if(mw!==uc.seq)return;uc.arms=[];uc.armFor=u.id;ucArmBox.hidden=true;ucRender()});return}
  ucArmBox.hidden=!by.weapon||!uc.arms.length;
  // a card that stacks the squad's weapons (camera stack, GoH): the picked or main one first, then the next most carried, one scene each
  var wl=[],ex=[];if(by.weapon){var mw0=ucArm.value||(uc.arms[0]&&uc.arms[0].model)||'';wl=[mw0].concat(uc.arms.map(function(w){return w.model}).filter(function(m){return m&&m!==mw0}));
   for(var n=1;n<3&&n<wl.length;n++){var gx=by.weapon.filter(function(k){return ((k.camera&&k.camera.stack)||1)>n});if(gx.length){by['weapon#'+n]=gx;ex.push('weapon#'+n)}}
   var wi=order.indexOf('weapon');order=order.slice(0,wi+1).concat(ex,order.slice(wi+1))}
  var emb=by.emblem||[];delete by.emblem;order=order.filter(function(s){return s!=='emblem'});
  var my=++uc.seq,done=0,total=ks.length-emb.length;uc.renders={};uc.renX={};uc.renFail={};clear(ucRenPics);clear(ucViewBox);ucV={};ucRenSay.className='hint';ucRenSay.textContent=ucK('ren.busy',{n:0,t:total});
  emb.forEach(function(k){ucRenPics.appendChild(el('div',{class:'hint',text:ucK('ren.emblem',{k:ucKindName(k.kind)})}))});
  function failAll(g,info){g.forEach(function(k){uc.renFail[k.kind]=ucWhy(info);ucRenPics.appendChild(el('div',{class:'wzstat',text:ucK('ren.nopic',{k:ucKindName(k.kind),why:uc.renFail[k.kind]})}))})}
  function next(i){if(my!==uc.seq)return;if(i>=order.length){
    // the stacked weapons go to the composer as one list per kind (srcs[kind] = [main, 2nd, 3rd])
    for(var kk in uc.renX)if(uc.renders[kk]){var xs=uc.renX[kk].filter(Boolean);if(xs.length)uc.renders[kk]=[uc.renders[kk]].concat(xs)}
    var miss=Object.keys(uc.renFail).length;ucRenSay.className=miss?'wzstat':'hint';ucRenSay.textContent=ucK(miss?'ren.part':'ren.done',{n:done,t:total});ucSoon();return}
   var s=order[i],g=by[s],xn=s.indexOf('weapon#')===0?Number(s.slice(7)):0,sb=s==='weapon'?{kind:'card',group:uc.u.group,weapon:ucArm.value||''}:xn?{kind:'card',group:uc.u.group,weapon:wl[xn]}:s==='soldier'?{kind:'portrait',group:uc.u.group,breed:u.breed||''}:s==='buy'?{kind:'card',group:uc.u.group}:{kind:'card',group:uc.u.group==='gun'?'gun':'vehicle'};
   var b=modBody(Object.assign({id:u.id},sb,u.card?{card:u.card}:{},ucLook()));
   var v=null;try{v=P({set:{},mod:curMod()},{doc:false,compact:true,height:260,blk:'ucard.view'+i,show:{volumes:false,grid:false,bones:false,axes:false},scene:{url:'/api/x/units/card/scene',body:b}})}catch(e){v=null}
   if(!v||typeof v.snapshot!=='function'){if(!xn)failAll(g,{why:'nogl'});next(i+1);return}
   ucViewBox.appendChild(v);ucV[s]=v;var j=0;
   // a stacked extra weapon: its picture joins the kind's list; no picture = the card stacks fewer (no fault)
   if(xn){(function sx(){if(my!==uc.seq)return;if(j>=g.length){next(i+1);return}var k=g[j++],z=Math.max(1,Math.min(8,1400/Math.max(k.w,k.h))),o={width:Math.round(k.w*z),height:Math.round(k.h*z),view:ucView(k),wait:60000,sceneWait:600000},l=ucLight(k);if(l)o.light=l;
    v.snapshot(o,function(url){if(my!==uc.seq)return;if(url){(uc.renX[k.kind]=uc.renX[k.kind]||[])[xn-1]=url;ucRenPics.appendChild(el('div',{},[ucImg(url,k.w,k.h,1.5),el('div',{class:'hint',text:ucKindName(k.kind)+' '+(xn+1)+' '+ucK('ren.arm',{w:wl[xn]})})]))}sx()})})();return}
   // patient snapshots: the first waits for the scene (a cold model can take a minute), textures are counted from its arrival
   (function shot(){if(my!==uc.seq)return;if(j>=g.length){next(i+1);return}var k=g[j++],z=Math.max(1,Math.min(8,1400/Math.max(k.w,k.h))),W=Math.round(k.w*z),H=Math.round(k.h*z),o={width:W,height:H,view:ucView(k),wait:60000,sceneWait:600000},l=ucLight(k);if(l)o.light=l;
    v.snapshot(o,function(url,info){if(my!==uc.seq)return;
     if(url){uc.renders[k.kind]=url;done++;ucRenPics.appendChild(el('div',{},[ucImg(url,k.w,k.h,1.5),el('div',{class:'hint',text:ucKindName(k.kind)+' '+W+'x'+H+(s==='weapon'?' '+ucK('ren.arm',{w:ucArmName()}):'')})]))}
     else{uc.renFail[k.kind]=ucWhy(info);ucRenPics.appendChild(el('div',{class:'wzstat',text:ucK('ren.nopic',{k:ucKindName(k.kind),why:uc.renFail[k.kind]})}));
      // the scene itself failed: the other kinds of it say the same at once (no second long wait)
      if(info&&/^(timeout|failed|nomesh)$/.test(info.why||''))failAll(g.slice(j),info),j=g.length}
     ucRenSay.textContent=ucK('ren.busy',{n:done,t:total});shot()})})()}
  next(0)}

 // ---------- style ----------
 var ucLookSel=sel('units.card.look',[['auto',ucK('look.auto')],['colour',ucK('look.colour')],['silhouette',ucK('look.silhouette')],['keep',ucK('look.keep')]]);
 var ucKey=sel('units.card.key',[['auto',ucK('key.auto')],['none',ucK('key.none')]]),ucTol=ucNum('tol',4,120,2,36);
 var ucShadow=el('input',{type:'checkbox',checked:true}),ucBuilt=el('input',{type:'checkbox'});
 [ucLookSel,ucKey,ucShadow].forEach(function(i){i.addEventListener('change',ucSoon)});ucBuilt.addEventListener('change',function(){ucLayers();ucSoon()});
 function ucChk(k,i){return el('label',{},[i,el('span',{text:' '+ucK(k)})])}
 // card style (tools/unitcard plate): 'plain' = background, strip, frame and badge drawn by code, no game pixels (the default);
 // 'game' = layers cut from the game's cards (GIMP cutouts). Remembered per browser; plain hides every cutout control and runs no GIMP.
 var UC_PLATE='as2gui.units.card.plate',ucPlate=sel('units.card.plate',[['plain',ucK('plate.plain')],['game',ucK('plate.game')]]),ucGameOnly=[];
 try{ucPlate.value=localStorage.getItem(UC_PLATE)==='game'?'game':'plain'}catch(e){ucPlate.value='plain'}
 function ucGameLay(){return ucPlate.value==='game'}
 function ucGo(x){ucGameOnly.push(x);x.hidden=!ucGameLay();return x}
 function ucPlateShow(){ucGameOnly.forEach(function(x){x.hidden=!ucGameLay()})}
 ucPlate.addEventListener('change',function(){try{localStorage.setItem(UC_PLATE,ucPlate.value)}catch(e){}ucPlateShow();ucLayers();ucSoon()});

 // ---------- the class layers (tools/unitcard/lib/layers.js) and the GIMP cutouts (lib/cutouts.js): per kind the layer list with on/off,
 // the badge and template picks, the class numbers (editable), the cutout thumbnails, Make cutouts / Redo / Open in GIMP ----------
 uc.st={};uc.lay={};uc.lseq=0;
 var ucMatch=el('input',{type:'checkbox'});ucMatch.addEventListener('change',function(){ucLayers();ucSoon()});
 var ucGimpSay=el('div',{class:'hint',role:'status','aria-live':'polite',text:''}),ucLayBox=el('div'),ucCutSay=el('div',{class:'hint',role:'status','aria-live':'polite'});
 var UC_LAYERS=['background','army','frame','badge','subject'];
 function ucLay(k){return uc.lay[k]||(uc.lay[k]={off:{},badge:'',badgeImg:null,tpl:'',num:{}})}
 function ucLayers(){var u=ucUnit();if(!u||!uc.kinds.length){clear(ucLayBox);return}var my=++uc.lseq;clear(ucLayBox);ucLayBox.appendChild(el('div',{class:'hint',text:ucK('lay.reading')}));
  api('/api/x/units/card/styles',modBody(Object.assign({},u,{plate:ucPlate.value,matchMod:ucGameLay()&&!!ucMatch.checked,builtIn:ucGameLay()&&!!ucBuilt.checked})),{what:ucK('job.layers')}).then(function(j){if(my!==uc.lseq)return;uc.st={};
   (j.styles||[]).forEach(function(s){uc.st[s.kind]=s});ucGimpSay.className=j.gimp&&j.gimp.found?'hint':'wzstat';ucGimpSay.textContent=ucGameLay()&&j.gimp&&j.gimp.line||'';ucDrawLayers()})
   .catch(function(e){if(my!==uc.lseq)return;clear(ucLayBox);ucLayBox.appendChild(el('div',{class:e.cancelled?'hint':'err',text:e.message}))})}
 function ucNumIn(k,s,key){var L=ucLay(k),v=s.subject&&s.subject[key],i=el('input',{type:'number',step:'1',style:'width:5em','aria-label':ucK('num.'+key),placeholder:v==null?'':String(v)});
  if(L.num[key]!=null)i.value=String(L.num[key]);i.addEventListener('change',function(){if(i.value==='')delete L.num[key];else L.num[key]=Number(i.value);ucSoon()});
  return el('label',{title:ucK('num.h')},[el('span',{text:ucK('num.'+key)+' '}),i])}
 function ucDrawLayers(){clear(ucLayBox);
  uc.kinds.forEach(function(kk){var k=kk.kind,s=uc.st[k];if(!s)return;var L=ucLay(k),box=el('div',{style:'margin:6px 0;padding:6px;border:1px solid var(--line);border-radius:6px'});
   box.appendChild(el('b',{text:ucKindName(k)+'  '+s.size+(s.frames>1?' x'+s.frames:'')}));
   var gl=ucGameLay();if(gl)box.appendChild(el('div',{class:s.cutter==='gimp'?'ok':'hint',text:ucK('cut.'+(s.cutter==='gimp'?'gimp':s.cutter==='look'?'look':'builtin'))+(s.gimp?'  '+s.gimp:'')}));
   box.appendChild(el('div',{class:'hint',text:s.template?ucK('lay.template',{n:s.refs}):ucK('lay.read',{n:s.refs,army:s.army||'-',src:ucK('src.'+(s.source==='mod'?'mod':'game'))})}));
   // layer list: on/off per layer (the preview only; the files always carry every layer)
   var row=el('div',{class:'row',style:'flex-wrap:wrap;gap:4px 12px'});
   UC_LAYERS.forEach(function(n){var c=el('input',{type:'checkbox'});c.checked=!L.off[n];c.addEventListener('change',function(){if(c.checked)delete L.off[n];else L.off[n]=true;ucSoon()});
    var pic=n==='background'?s.pics&&s.pics.background:n==='frame'?s.pics&&s.pics.frame:n==='army'?s.pics&&s.pics.army:null;
    row.appendChild(el('label',{title:ucK('layer.'+n+'.h')},[c,el('span',{text:' '+ucK('layer.'+n)})].concat(pic?[ucImg(pic,s.size.split('x')[0]*1,s.size.split('x')[1]*1,Math.min(1,64/s.size.split('x')[0]))]:[])))});
   box.appendChild(row);
   // badge pick: a game badge of the class (with how many cards use it) / none / your own image
   if((s.badges&&s.badges.length)||(s.subject&&s.subject.draws==='badge')){var bs=el('select',{'aria-label':ucK('badge')});
    [['',ucK(s.subject&&s.subject.draws==='badge'?'badge.src':'badge.auto')],['none',ucK('badge.none')]].concat((s.badges||[]).map(function(b){return [b.id,ucK('badge.game',{id:b.id,n:b.users,who:(b.usersShown||[]).slice(0,3).join(', ')})]})).concat([['own',ucK('badge.own')]])
     .forEach(function(o){var op=el('option',{value:o[0],text:o[1]});if(L.badge===o[0])op.selected=true;bs.appendChild(op)});
    var bf=el('input',{type:'file',accept:'.png,.jpg,.jpeg,.bmp,image/*','aria-label':ucK('badge.own')});bf.hidden=L.badge!=='own';
    bf.addEventListener('change',function(){var f=bf.files&&bf.files[0];if(!f)return;var r=new FileReader();r.onload=function(){L.badgeImg=String(r.result);ucSoon()};r.readAsDataURL(f)});
    bs.addEventListener('change',function(){L.badge=bs.value;bf.hidden=L.badge!=='own';ucSoon()});
    box.appendChild(el('div',{class:'row'},[el('label',{},[el('span',{text:ucK('badge')+' '}),bs]),bf]));
    var bp=el('div',{class:'row',style:'flex-wrap:wrap;gap:3px'});((s.pics&&s.pics.badges)||[]).slice(0,16).forEach(function(b){var im=b.pics&&b.pics[0];if(im){var i=el('img',{alt:b.id,title:b.id,style:'image-rendering:pixelated;border:1px solid var(--line);max-height:40px'});i.src=im;bp.appendChild(i)}});box.appendChild(bp)}
   // template pick: a class with too few clean cards copies one game card (searchKit over its cards)
   if(s.template){var ti=inp('units.card.tpl.'+k,{placeholder:ucK('tpl.ph')});ti.value=L.tpl||'';var tl=(s.templatePics||[]).map(function(t){return {label:t.stem,value:t.stem,hint:'',lo:t.stem.toLowerCase()}});
    var tk=searchKit(ti,{key:'units.card.tpl',index:function(q,done){hits(tl,q,done)},browse:{mode:'file',view:'data',start:'resource/interface/scene/'+(kk.folder||''),exts:['tga','dds','png'],toValue:function(p){return String(p).replace(/\\/g,'/').split('/').pop().replace(/\.[^.]+$/,'').replace(/_0\d$/,'')}},
     onPick:function(v){ti.value=v;L.tpl=v;ucSoon()}});ti.addEventListener('change',function(){L.tpl=ti.value.trim();ucSoon()});
    box.appendChild(el('label',{},[el('span',{text:ucK('tpl')+' '}),tk.el]))}
   // the class numbers, measured over its cards: the new subject is sized and placed by them (empty = measured)
   if(!s.template&&s.subject&&s.subject.draws!=='badge')box.appendChild(el('div',{class:'row',style:'flex-wrap:wrap;gap:4px 12px'},['height','width','baseline','cx'].map(function(n){return ucNumIn(k,s,n)})));
   // the cutouts: thumbnails with their source, Make / Redo / Open in GIMP
   var th=el('div',{class:'row',style:'flex-wrap:wrap;gap:4px'});(s.thumbs||[]).slice(0,40).forEach(function(t){if(!t.url)return;var i=el('img',{alt:t.name,title:t.name+(t.hand?' '+ucK('cut.hand'):'')+' ('+t.job+')',style:'image-rendering:pixelated;max-height:48px;border:1px solid '+(t.hand?'var(--acc)':'var(--line)')+';background:repeating-conic-gradient(var(--line) 0 25%,transparent 0 50%) 50%/8px 8px'});i.src=t.url;th.appendChild(el('div',{style:'text-align:center'},[i,el('div',{class:'hint',style:'font-size:10px',text:t.name})]))});
   if(!gl){}else if(s.cutoutsMade){box.appendChild(el('div',{class:'hint',text:ucK('cut.where',{d:s.cutouts})+(s.kept&&s.kept.length?' '+ucK('cut.kept',{f:s.kept.join(', ')}):'')}));box.appendChild(th)}
   else if(!s.template)box.appendChild(el('div',{class:'hint',text:ucK('cut.none')}));
   if(gl&&!s.template)box.appendChild(el('div',{class:'row'},[el('button',{type:'button',text:ucK(s.cutoutsMade?'cut.make2':'cut.make'),onclick:function(){ucCutouts(k,false)}}),
    s.cutoutsMade?el('button',{type:'button',text:ucK('cut.redo'),title:ucK('cut.redo.h'),onclick:function(){ucCutouts(k,true)}}):null,
    s.cutoutsMade?el('button',{type:'button',text:ucK('cut.open'),title:ucK('cut.open.h'),onclick:function(){api('/api/x/units/card/openxcf',{dir:s.cutouts},{what:ucK('cut.open')}).then(function(){toast(ucK('cut.opened'))}).catch(function(e){toast(e.message)})}}):null].filter(Boolean)));
   (s.notes||[]).slice(-4).forEach(function(n){box.appendChild(el('div',{class:'hint',text:String(n)}))});
   ucLayBox.appendChild(box)})}
 // make (or redo) the GIMP cutouts of a kind's class: a job row in the footer, Cancel stops it
 function ucCutouts(k,force){var u=ucUnit();if(!u)return;ucCutSay.className='hint';ucCutSay.textContent=ucK('cut.busy');
  api('/api/x/units/card/cutouts',modBody(Object.assign({},u,{kinds:[k],force:!!force,plate:ucPlate.value,matchMod:!!ucMatch.checked})),{what:ucK('job.cutouts')}).then(function(j){
   if(!j.gimp||!j.gimp.found){ucCutSay.className='wzstat';ucCutSay.textContent=j.line||ucK('cut.nogimp');return}
   ucCutSay.className='ok';ucCutSay.textContent=(j.rows||[]).map(function(r){return r.kind+'/'+r.group+'('+(r.army||'-')+'): '+(r.cutter==='gimp'?(r.reused?ucK('cut.reused'):ucK('cut.made',{s:Math.round((r.ms||0)/100)/10})):ucK('cut.fail',{why:r.why||'?'}))+(r.kept&&r.kept.length?' '+ucK('cut.kept',{f:r.kept.join(', ')}):'')}).join('; ')||ucK('cut.nothing');
   ucLayers();ucSoon()}).catch(function(e){ucCutSay.className=e.cancelled?'hint':'err';ucCutSay.textContent=e.message})}
 // the difference of two pictures of one size (3x), drawn on a canvas: black where they agree
 function ucDiff(a,b,w,h,z){var cv=el('canvas',{width:w,height:h,style:'image-rendering:pixelated;border:1px solid var(--line);width:'+Math.round(w*z)+'px;height:'+Math.round(h*z)+'px'});
  var ia=el('img'),ib=el('img'),n=0;function go(){if(++n<2)return;var c=cv.getContext&&cv.getContext('2d');if(!c)return;c.drawImage(ia,0,0,w,h);var A=c.getImageData(0,0,w,h);c.clearRect(0,0,w,h);c.drawImage(ib,0,0,w,h);var B=c.getImageData(0,0,w,h);
   for(var i=0;i<A.data.length;i+=4){var d=Math.max(Math.abs(A.data[i]-B.data[i]),Math.abs(A.data[i+1]-B.data[i+1]),Math.abs(A.data[i+2]-B.data[i+2]),Math.abs(A.data[i+3]-B.data[i+3]));A.data[i]=A.data[i+1]=A.data[i+2]=Math.min(255,d*2);A.data[i+3]=255}c.putImageData(A,0,0)}
  ia.onload=go;ib.onload=go;ia.src=a;ib.src=b;return cv}

 // ---------- preview (live: a change asks again after a short pause; an older answer is dropped) and write ----------
 var ucPrev=el('div'),ucFiles=el('div'),ucRes=el('div');
 function ucBody(){var u=ucUnit();if(!u)throw new Error(tx('units.pickone'));var b=Object.assign({},u,{kinds:ucChosen()});
  if(!b.kinds.length)throw new Error(ucK('pickKind'));
  uc.miss=[];
  // a render: only kinds with a picture are composed (no card without a subject); the others are named with their reason
  // an emblem kind (squad) takes the image box's picture when one is loaded, else the badge picked in part 4 draws it
  if(uc.from==='render'){var s={},n=0,keep=[];b.kinds.forEach(function(k){var L=ucLay(k);
    if(uc.renders[k]){s[k]=uc.renders[k];n++;keep.push(k)}else if(ucEmblem(k)&&uc.src){s[k]=uc.src.url;n++;keep.push(k)}
    else if(ucEmblem(k)&&L.badge&&L.badge!=='none'&&(L.badge!=='own'||L.badgeImg))keep.push(k);else uc.miss.push(k)});
   if(!n)throw new Error(Object.keys(uc.renFail||{}).length||uc.miss.length?uc.miss.map(ucMissLine).join(' '):ucK('ren.first'));
   b.kinds=keep;b.srcs=s;b.fits={default:{trim:true,mode:'contain'}};b.key='none'}
  else{if(!uc.src)throw new Error(ucK('src.first'));b.src=uc.src.url;var f={mode:ucFit.value,scale:Number(ucScale.value),dx:Number(ucDx.value),dy:Number(ucDy.value)};if(ucMir.checked)f.mirror=true;
   if(uc.crop)f.box=uc.crop.slice();b.fits={default:f};b.key=ucKey.value;b.tol=Number(ucTol.value)}
  b.look=ucLookSel.value;b.shadow=!!ucShadow.checked;b.plate=ucPlate.value;b.builtIn=ucGameLay()&&!!ucBuilt.checked;b.matchMod=ucGameLay()&&!!ucMatch.checked;
  b.styleBy={};b.badgeBy={};b.templateBy={};b.layersBy={};
  b.kinds.forEach(function(k){var L=ucLay(k),n={};for(var x in L.num)n[x]=L.num[x];if(ucLookSel.value!=='auto')n.look=ucLookSel.value;n.shadow=!!ucShadow.checked;b.styleBy[k]=n;
   if(L.badge==='own'){if(L.badgeImg)b.badgeBy[k]=L.badgeImg}else if(L.badge)b.badgeBy[k]=L.badge;if(L.tpl)b.templateBy[k]=L.tpl;var off={},any=false;for(var y in L.off){off[y]=false;any=true}if(any)b.layersBy[k]=off});
  return modBody(b)}
 function ucMissLine(k){return ucEmblem(k)?ucK('ren.emblem',{k:ucKindName(k)}):ucK('ren.nopic',{k:ucKindName(k),why:(uc.renFail&&uc.renFail[k])||ucK('ren.notyet')})}
 function ucEmblem(id){for(var i=0;i<uc.kinds.length;i++)if(uc.kinds[i].kind===id)return ucSceneOf(uc.kinds[i])==='emblem';return false}
 function ucSoon(){clearTimeout(uc.timer);uc.timer=setTimeout(function(){ucMake(false)},400)}
 function ucMake(write){var b;try{b=ucBody()}catch(e){ucPrev.className='hint';clear(ucPrev);ucPrev.appendChild(el('div',{class:'hint',text:e.message}));clear(ucFiles);ucW.last=null;ready(ucW,false);return}
  var key=JSON.stringify(b);
  if(write){if(uc.miss.length){toast(ucK('ren.writeOff'));ready(ucW,false);return}if(ucW.last!==key){toast(tx('units.previewFirst'));ready(ucW,false);return}
   var n=(uc.lastJ&&uc.lastJ.files||[]).length;
   askDo({title:ucK('write'),lines:[ucK('confirm',{n:n,mod:curMod()}),uc.lastJ&&uc.lastJ.plan&&uc.lastJ.plan.data&&uc.lastJ.plan.data.length?ucK('confirmData'):''],where:curMod()}).then(function(yes){if(yes)ucSend(b,true,key)});return}
  ucSend(b,false,key)}
 function ucSend(b,write,key){var my=++uc.pseq;b.write=!!write;if(write){clear(ucRes);ucRes.appendChild(el('div',{class:'hint',text:tx('units.writing')}))}else{ucPrev.className='hint';if(!ucPrev.firstChild)ucPrev.appendChild(el('div',{class:'hint',text:tx('units.previewing')}))}
  api('/api/x/units/card/make',b,{what:ucK(write?'job.write':'job.make')}).then(function(j){if(my!==uc.pseq&&!write)return;
   if(write){ucDone(j);ucW.last=null;ready(ucW,false);refreshAfterWrite();uc.stale=true;ucCurrent();return}
   uc.lastJ=j;ucDrawPrev(j);ucW.last=key;ready(ucW,!uc.miss.length)})
   .catch(function(e){if(my!==uc.pseq&&!write)return;var box=write?ucRes:ucPrev;clear(box);box.appendChild(el('div',{class:e.cancelled?'hint':'err',text:e.message}));ucW.last=null;ready(ucW,false)})}
 // first: a chosen kind with no picture (no file for it), then per kind the new card beside game cards of its class, 3x
 function ucVs(k,urls,ck){var row=el('div',{class:'row',style:'flex-wrap:wrap;gap:8px;align-items:flex-start'}),n=0;
  function cell(url,label){row.appendChild(el('div',{},[ucImg(url,k.w,k.h,3),el('div',{class:'hint',text:label})]))}
  if(urls[0])cell(urls[0],ucK('vs.new'));
  if(ck&&ck.now&&ck.now.length&&ck.from==='game'){cell(ck.now[0],ucK('vs.own',{s:ck.stem||''}));n++}
  if(ck&&ck.ref&&ck.ref.pics&&ck.ref.pics.length){cell(ck.ref.pics[0],ucK('vs.game',{s:ck.ref.stem}));n++}
  var box=el('div',{},[el('div',{class:'hint',text:ucK('vs.h')}),row]);if(n<2)box.appendChild(el('div',{class:'hint',text:ucK(n?'vs.one':'vs.none')}));return box}
 function ucDrawPrev(j){clear(ucPrev);clear(ucFiles);
  (uc.miss||[]).forEach(function(k){ucPrev.appendChild(el('div',{class:'wzstat',text:ucMissLine(k)}))});
  if(uc.miss&&uc.miss.length)ucPrev.appendChild(el('div',{class:'wzstat',text:ucK('ren.writeOff')}));
  (j.plan&&j.plan.kinds||[]).forEach(function(k){var urls=(j.previews||{})[k.kind]||[],st=(j.styles||{})[k.kind]||{},ck=null;uc.kinds.forEach(function(x){if(x.kind===k.kind)ck=x});
   ucPrev.appendChild(el('div',{style:'margin:6px 0'},[el('b',{text:ucKindName(k.kind)+'  '+k.w+'x'+k.h}),ucVs(k,urls,ck)]));
   var now=ck&&ck.now&&ck.now.length?ucPics(ck.now,k.w,k.h,1):el('span',{class:'wzstat',text:ucK('noPic')}),ref=ck&&ck.ref?ucPics(ck.ref.pics,k.w,k.h,1):el('span',{class:'hint',text:ucK('none')});
   var big=el('div'),dif=el('input',{type:'checkbox'}),refs=ck&&ck.ref&&ck.ref.pics||[];
   function draw(){clear(big);if(dif.checked&&refs.length){var r=el('div',{class:'row',style:'flex-wrap:wrap;gap:3px'});urls.forEach(function(u,f){r.appendChild(ucDiff(u,refs[Math.min(f,refs.length-1)],k.w,k.h,3))});big.appendChild(r)}else big.appendChild(ucPics(urls,k.w,k.h,3))}
   dif.addEventListener('change',draw);draw();
   var tb=el('table',{},[el('thead',{},[el('tr',{},[el('th',{text:ucK('col.now')}),el('th',{text:ucK('col.ref')}),el('th',{text:ucK('col.new')})])]),el('tbody',{},[el('tr',{},[el('td',{},[now]),el('td',{},[ref,el('div',{class:'hint',text:ck&&ck.ref?ck.ref.stem:''})]),el('td',{},[ucPics(urls,k.w,k.h,1)])])])]);
   ucPrev.appendChild(el('div',{style:'margin:6px 0'},[el('b',{text:ucKindName(k.kind)+'  '+k.w+'x'+k.h+'  '+(k.stem||'')}),
    el('div',{class:'hint',text:ucK('style.line2',{look:ucK('look.'+((st.subject&&st.subject.look)||'colour')),cut:ucK('cut.'+(st.cutter==='gimp'?'gimp':st.cutter==='look'?'look':'builtin')),n:st.refs||0,army:st.army||'-',badge:st.badgeUsed||'-'})}),
    tb,el('div',{class:'row'},[el('span',{class:'hint',text:ucK('big')}),el('label',{},[dif,el('span',{text:' '+ucK('diff')})])]),big]))});
  (j.plan&&j.plan.skip||[]).forEach(function(s){ucPrev.appendChild(el('div',{class:'wzstat',text:ucKindName(s.kind)+': '+s.why}))});
  (j.plan&&j.plan.notes||[]).forEach(function(n){ucPrev.appendChild(el('div',{class:'wzstat',text:String(n)}))});
  var tb=el('tbody');(j.files||[]).forEach(function(f){tb.appendChild(el('tr',{},[el('td',{text:f.key}),el('td',{text:f.kind==='data'?ucK('file.data'):ucKindName(f.kind)+(f.frame>=0?' #'+f.frame:'')}),el('td',{text:f.size||(f.bytes+' B')}),
   el('td',{class:f.fromMod?'wzstat':'hint',text:(f.fromMod?ucK('file.replaces'):f.had?ucK('file.shadows'):ucK('file.new'))+(f.hadSize&&f.size&&f.hadSize!==f.size?' '+ucK('file.size',{was:f.hadSize}):'')})]))});
  ucFiles.appendChild(el('table',{},[el('thead',{},[el('tr',{},[el('th',{text:ucK('col.file')}),el('th',{text:ucK('col.kind')}),el('th',{text:ucK('col.size')}),el('th',{text:ucK('col.state')})])]),tb]));
  (j.files||[]).forEach(function(f){if(f.text==null)return;var pre=el('pre',{class:'diff'});pre.textContent=String(f.text);ucFiles.appendChild(el('details',{},[el('summary',{text:f.key}),pre]))});
  (j.plan&&j.plan.data||[]).forEach(function(d){ucFiles.appendChild(el('div',{class:'hint',text:ucK('dataLine',{f:d.key,line:d.line,was:d.was||'-',n:d.shared||0})}))})}
 function ucDone(j){clear(ucRes);var w=j.written||[];
  ucRes.appendChild(el('div',{class:'ok',text:ucK('done',{n:w.length,mod:j.mod||curMod()})}));
  var pre=el('pre');pre.textContent=w.map(function(x){return x.path}).join('\n');ucRes.appendChild(el('details',{open:true},[el('summary',{text:ucK('where')}),pre]));
  ucRes.appendChild(el('div',{class:'hint',text:ucK('check.h')}));
  (j.check||[]).forEach(function(c){ucRes.appendChild(el('div',{class:'hint',text:'- '+ucKindName(c.kind)+': '+ucK('check.'+c.kind)}))});
  ucRes.appendChild(el('div',{class:'hint',text:ucK('check.log')}))}
 var ucPv=el('button',{type:'button',text:tx('units.preview'),onclick:function(){ucMake(false)}});
 ucW.btn=el('button',{type:'button',class:'primary',text:ucK('write'),onclick:function(){ucMake(true)}});writers.push(ucW);ready(ucW,false);
 var ucReload=el('button',{type:'button',text:ucK('reload'),onclick:function(){ucCurrent()}});

 var cardCard=el('div',{class:'card',blk:'ucard',box:'col'},[blk('ucard.title',[el('h3',{text:ucK('h')})]),blk('ucard.intro',[el('div',{class:'hint',text:ucK('intro')})]),
  blk('ucard.say',[el('div',{class:'row'},[ucSay,ucReload])],{name:tx('units.blk.state')}),
  blk('ucard.kinds',[el('h4',{text:ucK('s1')}),ucKindBox,ucNa],{name:ucK('s1')}),
  blk('ucard.now',[el('h4',{text:ucK('s2')}),ucNow],{name:ucK('s2')}),
  blk('ucard.from',[el('h4',{text:ucK('s3')}),el('div',{class:'row'},[el('label',{},[ucFromImg,el('span',{text:' '+ucK('from.image')})]),el('label',{},[ucFromRen,el('span',{text:' '+ucK('from.render')})])])],{name:ucK('s3')}),
  ucImgBox,blk('ucard.fit',[el('div',{class:'row',style:'flex-wrap:wrap;gap:6px 14px'},[el('label',{},[el('span',{text:ucK('fit')+' '}),ucFit]),ucRange('scale',ucScale),ucRange('dx',ucDx),ucRange('dy',ucDy),ucChk('mirror',ucMir),ucClr,ucReset])],{name:ucK('fit')}),
  ucRenBox,
  blk('ucard.style',[el('h4',{text:ucK('s4')}),el('div',{class:'row'},[el('label',{title:ucK('plate.h')},[el('span',{text:ucK('plate')+' '}),ucPlate])]),el('div',{class:'hint',text:ucK('plate.h')}),
   el('div',{class:'row',style:'flex-wrap:wrap;gap:6px 14px'},[el('label',{},[el('span',{text:ucK('look')+' '}),ucLookSel]),el('label',{},[el('span',{text:ucK('key')+' '}),ucKey]),ucRange('tol',ucTol),ucChk('shadow',ucShadow),ucGo(ucChk('builtin',ucBuilt)),ucGo(ucChk('match',ucMatch))])],{name:ucK('s4')}),
  blk('ucard.layers',[el('h4',{text:ucK('s4b')}),ucGo(ucGimpSay),ucGo(ucCutSay),ucLayBox],{name:ucK('s4b')}),
  blk('ucard.prev',[el('h4',{text:ucK('s5')}),ucPrev],{name:ucK('s5')}),
  blk('ucard.files',[el('h4',{text:ucK('s6')}),ucFiles],{name:ucK('s6')}),
  blk('ucard.btns',[el('div',{class:'row'},[ucPv,ucW.btn])],{name:ucK('s7')}),
  blk('ucard.res',[ucRes],{name:ucK('s8')})]);
 // a unit opened on the page, the tool shown, a game or mod switch: the current pictures are asked only while the tool is shown
 function ucOpen(){if(!cardCard)return;uc.stale=true;uc.armFor=null;uc.arms=[];clear(ucArm);ucArmBox.hidden=true;uc.renders={};uc.renFail={};clear(ucRenPics);ucRenSay.className='hint';ucRenSay.textContent=ucK('ren.none');if(!cardCard.hidden)ucCurrent()}
 function ucShown(){if(cardCard&&!cardCard.hidden&&uc.stale)ucCurrent()}
`;
