// Models page, Animation part (parity rows ANM-01..41): the Animation sub-tab is an animation editor. Top to bottom: the list of
// the model's animations with file actions (new, read a file, rename, duplicate, delete, previous / next file); the 3D view posed
// at the current frame (sub/viewer.client.js); playback (first, back one, play / pause, forward one, last, loop, speed, frame
// slider); the timeline (sub/timeline.client.js, EXT_SCREENS.models.parts.timeline); the pose form of the selected bone at the
// current frame (position, rotation in degrees, local or world, the 12 numbers, shown or hidden, set key, delete key, reset,
// copy / paste pose and key, mirror pose); frame, whole-animation and bone actions.
// The document is the truth: reads through D.state (anm.list, anm.get, anm.pose, anm.clip), changes through D.op (ops in
// tools/lib/model/edit/anm.js), redraws on D.on. The current animation and frame are D.sel.anm and D.sel.frame (D.select).
// Keys while the focus is in the editor and not in a text field: Space play / pause, Left / Right one frame, Home / End,
// Up / Down previous / next key of the bone, K set key, Delete delete key, Shift+Delete delete the selected frames (or this one),
// I insert a frame after this one, Shift+D duplicate the selected frames, [ / ] move them one frame earlier / later,
// Page Up / Page Down previous / next animation, Ctrl+A select all frames (timeline), Ctrl+C / Ctrl+V copy / paste the pose.
// Shared with the timeline: EXT_SCREENS.models.animShared = { clip, range, rel, frames, info, play, pause, toggle, step, go,
//   edit(), setKey(), delKey(), selectAll(), busy(promise) }.
// Page rules: no backtick, no dollar-brace, no innerHTML; DOM through h(); text through tx(); no new global names.
// Test seam: EXT_SCREENS.models.subs.anim._t (pure helpers).
// Author: Imperator_Aug (ARSENAL, ia-9bc37771)
module.exports = String.raw`
(function(){
 var SH=EXT_SCREENS.models.animShared=EXT_SCREENS.models.animShared||{clip:null,range:null,rel:null,frames:0,info:null};
 var ST={gen:0,list:null,info:null,pose:null,bone:null,playing:false,timer:null,last:0,acc:0,loop:LS.get('models.anim.loop','1')==='1',speed:1};
 // rows of the F2 key list (Files part); these keys act only while the Animation editor has the focus (doc.client KEYMAP 'anim')
 var MK=EXT_SCREENS.models;MK.keys=MK.keys||[];
 [['Space','play'],['Left, Right','frame'],['Home, End','ends'],['Up, Down','key'],['K','setKey'],['Delete','delKey'],['Shift+Delete','delFrames'],['I','insert'],
  ['Shift+D','dupFrames'],['[, ]','moveFrames'],['PageUp, PageDown','file'],['Ctrl+A','all'],['Ctrl+C, Ctrl+V','copy']]
  .forEach(function(r){MK.keys.push({keys:r[0],key:['models.anim.key',r[1]].join('.'),area:'anim'})});

 // ---------- pure helpers (test seam) ----------
 function num(s){if(typeof s==='number')return s;s=String(s==null?'':s).trim().replace(',','.');if(!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s))return NaN;return parseFloat(s)}
 function nums(list){var o=[];for(var i=0;i<list.length;i++){var x=num(list[i]);if(!isFinite(x))return null;o.push(x)}return o}
 function r4(x){return Math.round((Number(x)||0)*10000)/10000}
 function clampF(f,n){f=Math.floor(Number(f)||0);if(n<1)return 0;return f<0?0:f>n-1?n-1:f}
 // next frame while playing: dir from the sign of the speed; at an end: loop round or stop (null)
 function advance(f,n,steps,loop){if(n<1)return null;var g=f+steps;if(g>=0&&g<=n-1)return g;if(!loop)return null;return ((g%n)+n)%n}
 function nextKey(keys,f,dir){keys=keys||[];if(dir>0){for(var i=0;i<keys.length;i++)if(keys[i]>f)return keys[i]}else{for(var j=keys.length-1;j>=0;j--)if(keys[j]<f)return keys[j]}return null}
 function speedOf(s){var x=num(s);if(!isFinite(x))return 1;x=Math.round(x*10)/10;return x>10?10:x<-10?-10:x}   // ANM-37: steps of 0.1, not whole numbers
 function baseName(rel){rel=String(rel||'');var i=rel.lastIndexOf('/');return i<0?rel:rel.slice(i+1)}
 function sibling(list,rel,dir){if(!list||!list.length)return null;var i=-1;for(var k=0;k<list.length;k++)if(String(list[k].rel).toLowerCase()===String(rel||'').toLowerCase())i=k;
  var n=list.length;return list[i<0?(dir>0?0:n-1):(i+dir+n)%n].rel}
 function typing(t){if(!t)return false;var n=String(t.tagName||'').toLowerCase();return n==='input'||n==='textarea'||n==='select'||!!t.isContentEditable}

 EXT_SCREENS.models.subs.anim=function(ctx){
  var el=ctx.el,D=ctx.doc||EXT_SCREENS.models.doc||null,my=++ST.gen,body=ctx.body;
  function alive(){return my===ST.gen}
  // blocks (sub/README.md "Blocks"): the editor card is the container 'anim.ed'; each row of controls a leaf (L, class row), the pose,
  // frames and bones cards containers; the list of animations, the 3D view and the timeline as their own blocks
  function L(id,kids,a){a=a||{'class':'row'};a.blk='anim.ed.'+id;return el('div',a,kids)}
  if(!D){body.appendChild(el('div',{class:'hint',blk:'anim.ed.nodoc',text:tx('models.anim.ed.noDoc')}));return}
  var msg=el('div',{class:'hint',role:'status'});
  function say(t,bad){msg.className=bad?'err':'hint';msg.textContent=t||''}
  function run(name,args,done){say(tx('models.anim.ed.working'));
   var p=D.op(name,args).then(function(j){if(!alive())return j;say('');if(done)done(j);return j}).catch(function(e){if(alive())say(e.text||e.message,true);throw e});
   p.catch(function(){});return p}
  SH.busy=function(p){return p};

  var box=el('div',{blk:'anim.ed',box:'col',tabindex:'0','data-keys':'anim',class:'card','aria-label':tx('models.anim.ed.title'),style:'outline:none'});
  body.appendChild(box);
  if(!D.id){box.appendChild(el('div',{class:'hint',blk:'anim.ed.wait',text:D.opening?tx('models.anim.ed.opening'):tx('models.anim.ed.noOpen')}));
   D.on(function(ev){if(ev.type==='open'&&alive())ctx.redraw()});return}

  // ---------- animation list and file actions ----------
  var listBox=L('list',[],{'data-blkname':tx('models.anim.ed.blk.list')}),missBox=L('miss',[],{'data-blkname':tx('models.anim.ed.blk.miss')});
  var newName=el('input',{type:'text',placeholder:tx('models.anim.ed.newName.ph'),'aria-label':tx('models.anim.ed.newName'),style:'width:12em'});
  var newFrames=el('input',{type:'number',min:'1',value:'30','aria-label':tx('models.anim.ed.frames'),style:'width:6em'});
  var newSeq=el('input',{type:'checkbox',checked:true,'aria-label':tx('models.anim.ed.addSeq')});
  var readRel=el('input',{type:'text',placeholder:tx('models.anim.ed.read.ph'),'aria-label':tx('models.anim.ed.read'),style:'width:16em'});
  var fileName=el('input',{type:'text','aria-label':tx('models.anim.ed.fileName'),style:'width:14em'});
  // the read box (searchKit, tools/gui/README.md): index = the .anm files of the model's folder (document, mod and game, D.dir)
  // and those the model holds, asked for once per draw and kept with their words in lower case; history key models.anim.ed.read
  var anmIx=null;
  function anmItems(cb){if(anmIx&&anmIx.list){cb(anmIx.list);return}if(anmIx){anmIx.cbs.push(cb);return}anmIx={list:null,cbs:[cb]};
   var have=((ST.list&&ST.list.animations)||[]).map(function(a){return a.rel});
   function fin(files){var seen={},out=[];have.concat(files||[]).forEach(function(r){var k=String(r||'').toLowerCase();if(!r||seen[k])return;seen[k]=1;
     var p=String(r).lastIndexOf('/');out.push({label:baseName(r),value:r,hint:r,group:have.indexOf(r)>=0?tx('models.anim.ed.read.inModel'):(p<0?'':r.slice(0,p)),lo:String(r).toLowerCase()})});
    anmIx.list=out;var c=anmIx.cbs;anmIx.cbs=[];c.forEach(function(f){f(out)})}
   if(typeof D.dir==='function')D.dir({ext:'.anm'}).then(function(j){fin(j&&j.files)},function(){fin([])});else fin([])}
  // Browse = the file picker on the game data at the model's folder, .anm files: the picked file's game key goes into the box
  var PA=EXT_SCREENS.models.pickAt;
  var readBox=typeof searchKit==='function'?searchKit(readRel,{key:'models.anim.ed.read',
   index:function(q,done){anmItems(function(a){var w=String(q).toLowerCase().split(/\s+/).filter(Boolean),st=[],mid=[];
    a.forEach(function(x){if(w.every(function(t){return x.lo.indexOf(t)>=0}))(x.label.toLowerCase().indexOf(w[0])===0?st:mid).push(x)});var r=st.concat(mid);done(r.slice(0,40),Math.max(0,r.length-40))})},
   browse:{mode:'file',view:'data',start:function(){return PA.dir(D)},exts:['anm'],toValue:function(p,e){return PA.key(p,e)}}}).el:readRel;
  function cur(){return D.sel&&D.sel.anm||null}
  function btn(key,fn,title){return el('button',{type:'button',text:tx(key),title:title?tx(title):'',onclick:fn})}
  box.appendChild(L('title',[el('h3',{text:tx('models.anim.ed.title')})],{}));
  box.appendChild(listBox);box.appendChild(missBox);
  box.appendChild(L('nav',[btn('models.anim.ed.prev',function(){cycle(-1)},'models.anim.ed.prev.tip'),btn('models.anim.ed.next',function(){cycle(1)},'models.anim.ed.next.tip'),
   btn('models.anim.ed.close',function(){D.select({anm:null,frame:0})})]));
  box.appendChild(L('file',[el('span',{text:tx('models.anim.ed.fileName')}),fileName,
   btn('models.anim.ed.rename',function(){if(cur())run('anm.rename',{rel:cur(),to:fileName.value.trim()},function(j){D.select({anm:j.info&&j.info.rel||null})})}),
   btn('models.anim.ed.duplicate',function(){if(cur())run('anm.duplicate',{rel:cur(),to:fileName.value.trim(),sequence:true},function(j){D.select({anm:j.info&&j.info.rel||null})})}),
   btn('models.anim.ed.delete',function(){if(!cur())return;var keep=!(window.confirm&&window.confirm(tx('models.anim.ed.delete.ask',{f:baseName(cur())})));
    run('anm.delete',{rel:cur(),sequences:!keep},function(){D.select({anm:null,frame:0})})})]));
  box.appendChild(L('new',[el('span',{text:tx('models.anim.ed.newName')}),newName,el('span',{text:tx('models.anim.ed.frames')}),newFrames,
   el('label',{},[newSeq,el('span',{text:' '+tx('models.anim.ed.addSeq')})]),
   btn('models.anim.ed.new',function(){var n=newName.value.trim();if(!n){say(tx('models.anim.ed.newName.need'),true);return}if(!/\.anm$/i.test(n))n+='.anm';
    run('anm.new',{rel:n,frames:num(newFrames.value),bones:'model',sequence:newSeq.checked||undefined},function(j){D.select({anm:j.info&&j.info.rel||null,frame:0})})})]));
  box.appendChild(L('read',[el('span',{text:tx('models.anim.ed.read')}),readBox,
   btn('models.anim.ed.readBtn',function(){var r=readRel.value.trim();if(!r)return;if(!/\.anm$/i.test(r))r+='.anm';
    run('anm.attach',{rel:r,sequence:true},function(j){D.select({anm:j.info&&j.info.rel||null,frame:0})})})]));
  // Page Up / Page Down (ANM-30): the previous or next .anm of the model's folder (document, mod and game, by name); one the model
  // does not hold yet is read in first (anm.attach, one undo step)
  function cycle(dir){var have=(ST.list&&ST.list.animations)||[];
   function low(x){return String(x||'').toLowerCase()}
   if(typeof D.dir!=='function'){var r0=sibling(have,cur(),dir);if(r0)D.select({anm:r0,frame:0});return}
   D.dir({ext:'.anm'}).then(function(j){if(!alive())return;var seen={},list=[];
    have.map(function(a){return a.rel}).concat(j&&j.files||[]).forEach(function(r){var k=low(r);if(r&&!seen[k]){seen[k]=1;list.push({rel:r})}});
    list.sort(function(a,b){var x=low(baseName(a.rel)),y=low(baseName(b.rel));return x<y?-1:x>y?1:0});
    var r=sibling(list,cur(),dir);if(!r||low(r)===low(cur()))return;
    if(have.some(function(a){return low(a.rel)===low(r)}))D.select({anm:r,frame:0});
    else run('anm.attach',{rel:r},function(j2){D.select({anm:j2.info&&j2.info.rel||r,frame:0})})}).catch(function(e){if(alive())say(e.message,true)})}
  function drawList(){var L=ST.list;while(listBox.firstChild)listBox.removeChild(listBox.firstChild);while(missBox.firstChild)missBox.removeChild(missBox.firstChild);
   if(!L||!L.animations.length){listBox.appendChild(el('div',{class:'hint',text:tx('models.anim.ed.none')}));}
   (L?L.animations:[]).forEach(function(a){var on=String(a.rel).toLowerCase()===String(cur()||'').toLowerCase();
    var t=tx('models.anim.ed.row',{f:a.frames,b:a.bones})+(a.sequences.length?'  '+tx('models.anim.ed.usedBy',{s:a.sequences.join(', ')}):'')+(a.readable?'':'  '+tx('models.anim.ed.unreadable'))+(a.dirty?'  '+tx('models.anim.ed.changed'):'');
    listBox.appendChild(el('div',{class:'row'},[el('button',{type:'button',class:on?'primary':'','aria-pressed':on?'true':'false',text:a.name,title:a.rel,onclick:function(){D.select({anm:a.rel,frame:0})}}),
     el('span',{class:'hint',text:t})]))});
   (L?L.missing:[]).forEach(function(m){missBox.appendChild(el('div',{class:'row'},[el('span',{class:'hint',text:tx('models.anim.ed.missing',{s:m.sequence,f:m.rel})}),
    btn('models.anim.ed.readBtn',function(){run('anm.attach',{rel:m.rel},function(j){D.select({anm:j.info&&j.info.rel||m.rel,frame:0})})})]))});
   fileName.value=cur()?baseName(cur()):''}

  // ---------- 3D view ----------
  var XP=EXT_SCREENS.models.parts||{},v=null;
  if(XP.viewer){v=XP.viewer(ctx,{height:360,blk:'anim.ed.view',anm:cur(),frame:D.sel.frame||0,show:{meshes:true,volumes:false,bones:true}});if(v)box.appendChild(v)}
  function view(){if(v&&typeof v.setPose==='function'&&cur())v.setPose(cur(),D.sel.frame||0)}

  // ---------- playback ----------
  var slider=el('input',{type:'range',min:'0',max:'0',value:'0','aria-label':tx('models.anim.ed.frame'),style:'flex:1;min-width:10em'});
  var fIn=el('input',{type:'number',min:'0',value:'0','aria-label':tx('models.anim.ed.frame'),style:'width:5em'});
  var fOf=el('span',{class:'hint'});
  var loopCb=el('input',{type:'checkbox','aria-label':tx('models.anim.ed.loop')});loopCb.checked=ST.loop;
  var spIn=el('input',{type:'number',step:'0.1',min:'-10',max:'10',value:String(ST.speed),'aria-label':tx('models.anim.ed.speed'),style:'width:5em'});
  var playB=el('button',{type:'button',class:'primary',text:tx('models.anim.ed.play'),onclick:function(){toggle()}});
  box.appendChild(L('play',[btn('models.anim.ed.first',function(){go(0)}),btn('models.anim.ed.back',function(){step(-1)}),playB,
   btn('models.anim.ed.fwd',function(){step(1)}),btn('models.anim.ed.last',function(){go(SH.frames-1)}),
   el('label',{},[loopCb,el('span',{text:' '+tx('models.anim.ed.loop')})]),el('span',{text:tx('models.anim.ed.speed')}),spIn]));
  box.appendChild(L('frame',[el('span',{text:tx('models.anim.ed.frame')}),fIn,fOf,slider]));
  loopCb.addEventListener('change',function(){ST.loop=loopCb.checked;LS.set('models.anim.loop',ST.loop?'1':'0')});
  spIn.addEventListener('change',function(){ST.speed=speedOf(spIn.value);spIn.value=String(ST.speed)});
  slider.addEventListener('input',function(){go(num(slider.value))});
  fIn.addEventListener('change',function(){go(num(fIn.value))});
  function go(f){if(!cur())return;f=clampF(f,SH.frames);if(f!==D.sel.frame)D.select({frame:f});else showFrame()}
  function step(n){if(!cur())return;pause();var g=advance(D.sel.frame||0,SH.frames,n,ST.loop);if(g!==null)go(g)}
  // engine pace: 50 frames a second times the sequence speed, times the speed set here
  function fps(){var s=ST.info&&ST.info.seqSpeed!=null?ST.info.seqSpeed:1;return 50*Math.abs(s||1)}
  function tick(){if(!alive()||!ST.playing)return;var now=Date.now(),dt=(now-ST.last)/1000;ST.last=now;ST.acc+=dt*fps()*ST.speed;
   var whole=ST.acc>=0?Math.floor(ST.acc):Math.ceil(ST.acc);
   if(whole){ST.acc-=whole;var g=advance(D.sel.frame||0,SH.frames,whole,ST.loop);if(g===null){pause();go(ST.speed<0?0:SH.frames-1);return}D.select({frame:g})}
   ST.timer=setTimeout(tick,20)}
  function play(){if(!cur()||SH.frames<2||ST.playing)return;ST.playing=true;ST.last=Date.now();ST.acc=0;playB.textContent=tx('models.anim.ed.pause');tick()}
  function pause(){if(!ST.playing)return;ST.playing=false;clearTimeout(ST.timer);playB.textContent=tx('models.anim.ed.play');loadPose()}
  function toggle(){if(ST.playing)pause();else play()}
  SH.play=play;SH.pause=pause;SH.toggle=toggle;SH.step=step;SH.go=go;
  if(ST.playing){ST.playing=false;clearTimeout(ST.timer)}

  // ---------- timeline ----------
  var tlHost=el('div',{blk:'anim.ed.tl',box:'col','data-blkname':tx('models.anim.ed.blk.tl')});box.appendChild(tlHost);
  if(XP.timeline){var tl=XP.timeline(ctx,{});if(tl)tlHost.appendChild(tl)}

  // ---------- pose form ----------
  var boneSel=el('select',{'aria-label':tx('models.anim.ed.bone')});
  var spaceSel=el('select',{'aria-label':tx('models.anim.ed.space')},[el('option',{value:'local',text:tx('models.anim.ed.space.local')}),el('option',{value:'world',text:tx('models.anim.ed.space.world')})]);
  function trio(key){var a=[0,1,2].map(function(i){return el('input',{type:'text',inputmode:'decimal','aria-label':tx(key)+' '+'XYZ'.charAt(i),style:'width:6em'})});return a}
  var posIn=trio('models.anim.ed.pos'),rotIn=trio('models.anim.ed.rot');
  var matIn=[];for(var i=0;i<12;i++)matIn.push(el('input',{type:'text',inputmode:'decimal','aria-label':tx('models.anim.ed.matrix')+' '+(i+1),style:'width:6em'}));
  var visCb=el('input',{type:'checkbox','aria-label':tx('models.anim.ed.visible')});
  var onlyCb=el('input',{type:'checkbox','aria-label':tx('models.anim.ed.only')}),fwdCb=el('input',{type:'checkbox','aria-label':tx('models.anim.ed.forward')});
  var poseSay=el('div',{class:'hint'});
  var form=el('div',{class:'card',blk:'anim.ed.pose',box:'col','data-blkname':tx('models.anim.ed.pose')},[L('pose.title',[el('h3',{text:tx('models.anim.ed.pose')})],{}),
   L('pose.pick',[el('span',{text:tx('models.anim.ed.bone')}),boneSel,el('span',{text:tx('models.anim.ed.space')}),spaceSel]),L('pose.say',[poseSay],{'data-blkname':tx('models.anim.ed.blk.say')}),
   L('pose.pos',[el('span',{text:tx('models.anim.ed.pos')})].concat(posIn)),
   L('pose.rot',[el('span',{text:tx('models.anim.ed.rot')})].concat(rotIn)),
   el('details',{blk:'anim.ed.pose.mx'},[el('summary',{text:tx('models.anim.ed.matrix')}),el('div',{class:'hint',text:tx('models.anim.ed.matrix.hint')}),
    el('div',{class:'row'},matIn.slice(0,3)),el('div',{class:'row'},matIn.slice(3,6)),el('div',{class:'row'},matIn.slice(6,9)),el('div',{class:'row'},matIn.slice(9,12)),
    el('div',{class:'row'},[btn('models.anim.ed.setMatrix',function(){setKey(true)})])]),
   L('pose.flags',[el('label',{},[visCb,el('span',{text:' '+tx('models.anim.ed.visible')})]),el('label',{},[onlyCb,el('span',{text:' '+tx('models.anim.ed.only')})]),
    el('label',{},[fwdCb,el('span',{text:' '+tx('models.anim.ed.forward')})])]),
   L('pose.keys',[el('button',{type:'button',class:'primary',text:tx('models.anim.ed.setKey'),title:tx('models.anim.ed.setKey.tip'),onclick:function(){setKey(false)}}),
    btn('models.anim.ed.delKey',function(){delKey()},'models.anim.ed.delKey.tip'),btn('models.anim.ed.prevKey',function(){jumpKey(-1)}),btn('models.anim.ed.nextKey',function(){jumpKey(1)}),
    btn('models.anim.ed.resetRest',function(){if(cur()&&ST.bone)run('anm.bone.reset',{rel:cur(),bone:ST.bone,frame:D.sel.frame||0,value:'rest'})}),
    btn('models.anim.ed.resetId',function(){if(cur()&&ST.bone)run('anm.bone.reset',{rel:cur(),bone:ST.bone,frame:D.sel.frame||0,value:'identity'})})]),
   L('pose.copy',[btn('models.anim.ed.copyPose',function(){copy(null)}),btn('models.anim.ed.copyKey',function(){copy(ST.bone)}),btn('models.anim.ed.paste',function(){paste()}),
    btn('models.anim.ed.mirror',function(){if(cur())run('anm.pose.mirror',{rel:cur(),frame:D.sel.frame||0})},'models.anim.ed.mirror.tip')])]);
  box.appendChild(form);
  boneSel.addEventListener('change',function(){ST.bone=boneSel.value||null;D.select({bone:ST.bone});fillPose()});
  spaceSel.addEventListener('change',fillPose);
  visCb.addEventListener('change',function(){if(cur()&&ST.bone){var f=D.sel.frame||0;run('anm.vis.set',{rel:cur(),bone:ST.bone,from:f,to:f,visible:visCb.checked})}});
  function anmBone(){var I=ST.info;if(!I||!ST.bone)return null;for(var k=0;k<I.bones.length;k++)if(I.bones[k].name.toLowerCase()===ST.bone.toLowerCase())return I.bones[k];return null}
  function setKey(full){if(!cur()||!ST.bone)return say(tx('models.anim.ed.pickBone'),true);var a={rel:cur(),bone:ST.bone,frame:D.sel.frame||0,space:spaceSel.value==='world'?'world':'local'};
   if(full){var m=nums(matIn.map(function(x){return x.value}));if(!m)return say(tx('models.anim.ed.bad12'),true);a.matrix=m}
   else{var p=nums(posIn.map(function(x){return x.value})),r=nums(rotIn.map(function(x){return x.value}));if(!p||!r)return say(tx('models.anim.ed.bad3'),true);a.pos=p;a.rot=r}
   if(onlyCb.checked)a.only=true;if(fwdCb.checked)a.forward=true;run('anm.key.set',a)}
  function delKey(){if(!cur()||!ST.bone)return;run('anm.key.delete',{rel:cur(),bone:ST.bone,frame:D.sel.frame||0})}
  function jumpKey(dir){var b=anmBone();var keys=b?b.keys:(ST.info?ST.info.keyFrames:[]);var g=nextKey(keys,D.sel.frame||0,dir);if(g!==null)go(g)}
  function copy(bone){if(!cur())return;var f=D.sel.frame||0;D.state('anm.clip',{rel:cur(),from:f,to:f,bones:bone?[bone]:undefined}).then(function(c){SH.clip=c;say(tx(bone?'models.anim.ed.copiedKey':'models.anim.ed.copiedPose',{b:bone||''}))}).catch(function(e){say(e.text||e.message,true)})}
  function paste(){if(!cur())return;if(!SH.clip)return say(tx('models.anim.ed.nothing'),true);run('anm.paste',{rel:cur(),at:D.sel.frame||0,clip:SH.clip})}
  SH.edit=function(){try{form.scrollIntoView({block:'nearest'})}catch(e){}if(posIn[0].focus)posIn[0].focus()};
  SH.setKey=function(){setKey(false)};SH.delKey=delKey;
  function fillBones(){var I=ST.info,P=ST.pose,names=[],seen={};
   (P?P.bones:[]).forEach(function(b){if(!seen[b.name.toLowerCase()]){seen[b.name.toLowerCase()]=1;names.push(b.name)}});
   (I?I.bones:[]).forEach(function(b){if(!seen[b.name.toLowerCase()]){seen[b.name.toLowerCase()]=1;names.push(b.name)}});
   while(boneSel.firstChild)boneSel.removeChild(boneSel.firstChild);
   names.forEach(function(n){var inA=I&&I.bones.some(function(b){return b.name.toLowerCase()===n.toLowerCase()});
    boneSel.appendChild(el('option',{value:n,text:inA?n:tx('models.anim.ed.notInAnm',{b:n})}))});
   if(!ST.bone||!names.some(function(n){return n.toLowerCase()===String(ST.bone).toLowerCase()}))ST.bone=D.sel.bone&&names.indexOf(D.sel.bone)>=0?D.sel.bone:(names[0]||null);
   boneSel.value=ST.bone||''}
  function fillPose(){var P=ST.pose,b=null;if(P)for(var k=0;k<P.bones.length;k++)if(P.bones[k].name===ST.bone)b=P.bones[k];
   if(!b&&P)for(var q=0;q<P.extra.length;q++)if(P.extra[q].name===ST.bone)b=P.extra[q];
   if(!b){poseSay.textContent=cur()?tx('models.anim.ed.pickBone'):tx('models.anim.ed.pickAnm');return}
   var m=spaceSel.value==='world'&&b.world?b.world:b.local;if(!m){poseSay.textContent=tx('models.anim.ed.noPose');return}
   var e=rotOf(m);posIn.forEach(function(x,i){x.value=String(r4(m[9+i]))});rotIn.forEach(function(x,i){x.value=String(r4(e[i]))});
   matIn.forEach(function(x,i){x.value=String(r4(m[i]))});visCb.checked=b.visible!==false;
   var ab=anmBone(),f=D.sel.frame||0;
   poseSay.textContent=!b.inAnm?tx('models.anim.ed.notAnimated'):ab&&ab.keys.indexOf(f)>=0?tx('models.anim.ed.isKey',{f:f}):tx('models.anim.ed.between',{f:f})+(b.mirrored?'  '+tx('models.anim.ed.mirrored'):'')}
  // Euler degrees of a row-vector matrix, R = Rx Ry Rz (same as tools/lib/model/edit/anm.js toEuler)
  function rotOf(m){var sy=Math.max(-1,Math.min(1,-m[2])),y=Math.asin(sy),x,z;
   if(Math.abs(Math.cos(y))>1e-6){x=Math.atan2(m[5],m[8]);z=Math.atan2(m[1],m[0])}else{z=0;x=Math.atan2(-m[7],m[4])}var k=180/Math.PI;return [x*k,y*k,z*k]}

  // ---------- frames, whole animation, bones ----------
  var cnt=el('input',{type:'number',min:'1',value:'1','aria-label':tx('models.anim.ed.count'),style:'width:5em'});
  var lenIn=el('input',{type:'number',min:'1','aria-label':tx('models.anim.ed.length'),style:'width:6em'});
  var scaleIn=el('input',{type:'number',min:'1','aria-label':tx('models.anim.ed.scale'),style:'width:6em'});
  var addSel=el('select',{'aria-label':tx('models.anim.ed.addBone')}),impSel=el('select',{'aria-label':tx('models.anim.ed.import')});
  var nameIn=el('input',{type:'text','aria-label':tx('models.anim.ed.boneName'),style:'width:12em'});
  var shiftIn=el('input',{type:'number',value:'1','aria-label':tx('models.anim.ed.shift'),style:'width:5em'});
  function F(){return D.sel.frame||0}
  function need(fn){return function(){if(!cur())return say(tx('models.anim.ed.pickAnm'),true);fn()}}
  box.appendChild(el('div',{class:'card',blk:'anim.ed.frames',box:'col','data-blkname':tx('models.anim.ed.framesT')},[L('frames.title',[el('h3',{text:tx('models.anim.ed.framesT')})],{}),
   L('frames.count',[el('span',{text:tx('models.anim.ed.count')}),cnt,
    btn('models.anim.ed.insert',need(function(){run('anm.frames.insert',{rel:cur(),at:F(),count:num(cnt.value)})}),'models.anim.ed.insert.tip'),
    btn('models.anim.ed.delFrame',need(function(){var c=Math.max(1,num(cnt.value)||1);run('anm.frames.delete',{rel:cur(),from:F(),to:Math.min(SH.frames-1,F()+c-1)})}),'models.anim.ed.delFrame.tip'),
    btn('models.anim.ed.dropFirst',need(function(){run('anm.dropFirst',{rel:cur()})}),'models.anim.ed.dropFirst.tip')]),
   L('frames.length',[el('span',{text:tx('models.anim.ed.length')}),lenIn,btn('models.anim.ed.setLength',need(function(){run('anm.frames.length',{rel:cur(),frames:num(lenIn.value)})})),
    el('span',{text:tx('models.anim.ed.scale')}),scaleIn,btn('models.anim.ed.doScale',need(function(){run('anm.time.scale',{rel:cur(),frames:num(scaleIn.value)})}),'models.anim.ed.scale.tip')]),
   L('frames.loop',[btn('models.anim.ed.reverse',need(function(){run('anm.reverse',{rel:cur()})})),
    btn('models.anim.ed.loopEnd',need(function(){run('anm.loop',{rel:cur(),mode:'end'})}),'models.anim.ed.loopEnd.tip'),
    btn('models.anim.ed.loopAppend',need(function(){run('anm.loop',{rel:cur(),mode:'append'})}),'models.anim.ed.loopAppend.tip'),
    btn('models.anim.ed.bake',need(function(){run('anm.bake',{rel:cur()})}),'models.anim.ed.bake.tip')])]));
  box.appendChild(el('div',{class:'card',blk:'anim.ed.bones',box:'col','data-blkname':tx('models.anim.ed.bonesT')},[L('bones.title',[el('h3',{text:tx('models.anim.ed.bonesT')})],{}),
   L('bones.add',[addSel,btn('models.anim.ed.addBone',need(function(){if(addSel.value)run('anm.bone.add',{rel:cur(),bone:addSel.value})}))]),
   L('bones.name',[el('span',{text:tx('models.anim.ed.boneName')}),nameIn,
    btn('models.anim.ed.renameBone',need(function(){if(ST.bone)run('anm.bone.rename',{rel:cur(),bone:ST.bone,name:nameIn.value.trim()},function(j){ST.bone=j.info&&j.info.bone||ST.bone})})),
    btn('models.anim.ed.cloneBone',need(function(){if(ST.bone)run('anm.bone.clone',{rel:cur(),bone:ST.bone,name:nameIn.value.trim()||undefined})})),
    btn('models.anim.ed.exportBone',need(function(){if(ST.bone)run('anm.bone.export',{rel:cur(),bone:ST.bone,to:(nameIn.value.trim()||ST.bone)+'.anm'})}),'models.anim.ed.exportBone.tip'),
    btn('models.anim.ed.removeBone',need(function(){if(ST.bone&&(!window.confirm||window.confirm(tx('models.anim.ed.removeBone.ask',{b:ST.bone}))))run('anm.bone.remove',{rel:cur(),bone:ST.bone})}))]),
   L('bones.import',[impSel,btn('models.anim.ed.import',need(function(){if(impSel.value)run('anm.bone.import',{rel:cur(),from:impSel.value})}),'models.anim.ed.import.tip')]),
   L('bones.shift',[el('span',{text:tx('models.anim.ed.shift')}),shiftIn,btn('models.anim.ed.doShift',need(function(){if(ST.bone)run('anm.track.shift',{rel:cur(),bone:ST.bone,by:num(shiftIn.value)})}),'models.anim.ed.shift.tip'),
    btn('models.anim.ed.copyFwd',need(function(){if(ST.bone)run('anm.key.forward',{rel:cur(),bone:ST.bone,at:F()})}),'models.anim.ed.copyFwd.tip')])]));
  function fillBoneTools(){var L=ST.list,I=ST.info;
   while(addSel.firstChild)addSel.removeChild(addSel.firstChild);while(impSel.firstChild)impSel.removeChild(impSel.firstChild);
   var have={};(I?I.bones:[]).forEach(function(b){have[b.name.toLowerCase()]=1});
   (L?L.modelBones:[]).filter(function(n){return !have[n.toLowerCase()]}).forEach(function(n){addSel.appendChild(el('option',{value:n,text:n}))});
   (L?L.animations:[]).filter(function(a){return a.rel!==cur()&&a.readable}).forEach(function(a){impSel.appendChild(el('option',{value:a.rel,text:tx('models.anim.ed.importFrom',{f:a.name})}))});
   nameIn.value=ST.bone||'';if(I){lenIn.value=String(I.frames);scaleIn.value=String(I.frames)}}
  box.appendChild(L('msg',[msg],{'data-blkname':tx('models.anim.ed.blk.msg')}));
  if(EXT_SCREENS.models.blockify)EXT_SCREENS.models.blockify(box);   // one leaf per field (../client.js); the 3D view is left as it is

  // ---------- reading the document ----------
  var poseSeq=0;
  function showFrame(){var f=D.sel.frame||0;slider.max=String(Math.max(0,SH.frames-1));slider.value=String(f);fIn.value=String(f);fIn.max=String(Math.max(0,SH.frames-1));
   fOf.textContent=cur()?tx('models.anim.ed.of',{n:SH.frames}):'';view()}
  function loadPose(){var my2=++poseSeq;D.state('anm.pose',{rel:cur(),frame:D.sel.frame||0}).then(function(p){if(!alive()||my2!==poseSeq)return;ST.pose=p;fillBones();fillPose()}).catch(function(e){if(alive())say(e.text||e.message,true)})}
  function load(){var rel=cur();
   return Promise.all([D.state('anm.list'),rel?D.state('anm.get',{rel:rel}):null,D.state('tl.get',rel?{rel:rel}:{})]).then(function(r){if(!alive())return;
    ST.list=r[0];ST.info=r[1];
    if(rel&&!r[0].animations.some(function(a){return a.rel===rel})){D.select({anm:null,frame:0});return}
    if(ST.info){var s=(r[2].sequences||[]).filter(function(q){return q.rel&&q.rel.toLowerCase()===rel.toLowerCase()})[0];ST.info.seqSpeed=s?s.speed:1;ST.info.sequences=r[2].sequences;ST.info.events=r[2].events}
    SH.rel=rel;SH.frames=ST.info?ST.info.frames:0;SH.info=ST.info;
    if((D.sel.frame||0)>SH.frames-1&&SH.frames)D.select({frame:SH.frames-1});
    drawList();fillBoneTools();showFrame();loadPose();
    if(!rel)say(r[0].animations.length?tx('models.anim.ed.pickAnm'):'');
    if(SH.redraw)SH.redraw()}).catch(function(e){if(alive())say(e.text||e.message,true)})}
  var lastAnm=cur(),lastFrame=D.sel.frame||0;
  D.on(function(ev){if(!alive())return;
   if(ev.type==='change'||ev.type==='open'||ev.type==='saved'){load();return}
   if(ev.type==='select'){
    if(cur()!==lastAnm){lastAnm=cur();if(ST.playing)pause();lastFrame=D.sel.frame||0;load();return}
    if((D.sel.frame||0)!==lastFrame){lastFrame=D.sel.frame||0;showFrame();if(!ST.playing)loadPose()}
    if(D.sel.bone&&D.sel.bone!==ST.bone){ST.bone=D.sel.bone;boneSel.value=ST.bone;fillPose()}}});
  load();

  // ---------- keyboard (only while the focus is in the editor and not in a text field) ----------
  box.addEventListener('keydown',function(e){if(typing(e.target)||e.altKey)return;var k=e.key,c=e.ctrlKey||e.metaKey,done=true;
   if(c&&(k==='a'||k==='A')){if(SH.selectAll)SH.selectAll()}
   else if(c&&(k==='c'||k==='C'))copy(null);
   else if(c&&(k==='v'||k==='V'))paste();
   else if(c)done=false;
   else if(k===' '||k==='Spacebar')toggle();
   else if(k==='ArrowLeft')step(-1);
   else if(k==='ArrowRight')step(1);
   else if(k==='Home'){pause();go(0)}
   else if(k==='End'){pause();go(SH.frames-1)}
   else if(k==='ArrowUp')jumpKey(-1);
   else if(k==='ArrowDown')jumpKey(1);
   else if(k==='k'||k==='K')setKey(false);
   else if(k==='Delete'&&e.shiftKey){if(cur()){var r=SH.range||[F(),F()];run('anm.frames.delete',{rel:cur(),from:r[0],to:r[1]});SH.range=null}}
   else if(k==='Delete')delKey();
   else if(k==='i'||k==='I'){if(cur())run('anm.frames.insert',{rel:cur(),at:F()+1,count:1})}
   else if((k==='d'||k==='D')&&e.shiftKey){if(cur()){var r2=SH.range||[F(),F()];run('anm.frames.duplicate',{rel:cur(),from:r2[0],to:r2[1]})}}
   else if(k==='['||k===']'){if(cur()){var r3=SH.range||[F(),F()],by=k==='['?-1:1;
    if(r3[0]+by>=0&&r3[1]+by<=SH.frames-1)run('anm.frames.move',{rel:cur(),from:r3[0],to:r3[1],at:r3[0]+by},function(){if(SH.range)SH.range=[r3[0]+by,r3[1]+by];go(F()+by)})}}
   else if(k==='PageUp')cycle(-1);
   else if(k==='PageDown')cycle(1);
   else done=false;
   if(done&&e.preventDefault)e.preventDefault()});
 };
 EXT_SCREENS.models.subs.anim._t={num:num,nums:nums,clampF:clampF,advance:advance,nextKey:nextKey,speedOf:speedOf,sibling:sibling,typing:typing,baseName:baseName};
})();
`;
