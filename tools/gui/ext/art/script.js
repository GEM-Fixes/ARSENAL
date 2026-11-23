// Browser side of the art page. Page rules: no backtick, no dollar-brace, no innerHTML; DOM through h() and textContent.
// Author: Imperator_Aug (ARSENAL, ia-3b15d1ec)
module.exports = String.raw`
EXT_SCREENS.art=function(root){
 var txd=function(k){return tx(k)};
 var LAST={unit:LS.get('art.unit','')};
 function el(tag,cls,text){return h(tag,{class:cls||'',text:text==null?'':text})}
 function gq(){return S.gameOv?'&game='+encodeURIComponent(S.gameOv):''}
 function mq(){return S.mod?'&mod='+encodeURIComponent(S.mod):''}
 function gb(o){if(S.gameOv)o.game=S.gameOv;o.mod=S.mod;return o}
 // blocks: card <id> holds <id>.title, <id>.intro and its own parts, each one block
 function acard(id,title,intro,kids){return card(id,[blk(id+'.title',[h('h3',{text:tx(title)})]),intro?blk(id+'.intro',[el('div','hint',tx(intro))]):null].concat(kids||[]))}
 function lf(id,kids,nm,cls){return blk(id,kids,{'class':cls||null,name:nm?tx(nm):null})}
 function say(box,cls,text){box.textContent='';box.appendChild(el('div',cls,text))}
 // JOBS: a request stopped from the footer (e.cancelled) is no error: the plain line Stopped
 function fail(box){return function(e){say(box,e&&e.cancelled?'hint':'err',String(e&&e.message||e))}}
 function needMod(box){if(S.mod)return false;say(box,'err',tx('art.needmod'));return true}
 function steps(prefix,n){var ol=h('ol');for(var i=1;i<=n;i++)ol.appendChild(h('li',{text:tx(prefix+i)}));return ol}
 function nameInput(ph){var i=h('input',{type:'text',placeholder:tx(ph),autocomplete:'off',style:'width:16em'});i.value=LAST.unit||'';i.addEventListener('input',function(){LAST.unit=i.value;LS.set('art.unit',i.value)});return i}
 var inputs=[];
 // searchKit (page.js; owner 2026-11-19: every search box has a manual browse, an indexed search and a history list). The names come
 // from GET /api/x/art/names once per mod and game (units, weapons, the mod's sounds and pictures); index rows carry their lowercase text
 var NM={k:null,d:null,w:[]};
 function names(cb){var k=String(S.mod||'')+'|'+String(S.gameOv||'')+'|'+String(S.gameId||'');if(NM.k!==k)NM={k:k,d:null,w:[]};if(NM.d){cb(NM.d);return}
  NM.w.push(cb);if(NM.w.length>1)return;var me=NM;function give(d){me.d=d;me.w.splice(0).forEach(function(f){f(d)})}
  api('/api/x/art/names?x=1'+mq()+gq(),undefined,{what:tx('art.job.names')}).then(function(r){r=r||{};
   function it(l,v,hn){return {label:l,value:v,hint:hn||'',lo:String(l).toLowerCase()}}
   give({units:(r.units||[]).map(function(u){return it(u.n,u.n,(u.mod?tx('art.g.mod')+'  ':'')+(u.dir||''))}),
    weapons:(r.weapons||[]).map(function(w){return it(w.n,w.n,w.dir)}),
    sounds:(r.sounds||[]).map(function(p){return it(p,p)}),
    pngs:(r.pngs||[]).map(function(p){var b=p.replace(/\\/g,'/');return it(b.split('/').pop(),p,p)})})}).catch(function(){give({units:[],weapons:[],sounds:[],pngs:[]})})}
 function hits(a,q,done){q=String(q||'').toLowerCase();var out=[],n=0;for(var i=0;i<a.length;i++)if(a[i].lo.indexOf(q)>=0){n++;if(out.length<40)out.push(a[i])}done(out,n-out.length)}
 // Browse = the file picker (owner 2026-11-19: "browse should always be a file directory browse"), opened where the box's things live
 function stem(p){var b=String(p||'').replace(/\\/g,'/').split('/').pop(),i=b.lastIndexOf('.');return i>0?b.slice(0,i):b}
 function folderOf(v){v=String(v||'').trim();if(!/^([A-Za-z]:|[\\\/])/.test(v))return '';var i=Math.max(v.lastIndexOf('/'),v.lastIndexOf('\\'));return i>0?v.slice(0,i):v}
 // a disk pick inside the mod becomes its path inside the mod (as the index gives the mod's sounds), else the full path
 function inMod(p){var m=String(S.mod||'').replace(/[\\\/]+$/,''),s=String(p||'');if(m&&s.length>m.length+1&&s.slice(0,m.length).toLowerCase()===m.toLowerCase()&&/[\\\/]/.test(s.charAt(m.length)))return s.slice(m.length+1).replace(/\\/g,'/');return s}
 var BR={units:{mode:'file',view:'data',start:'entity',exts:['def'],toValue:function(p){return stem(p)}},
  weapons:{mode:'file',view:'data',start:'set/stuff',toValue:function(p){return stem(p).toLowerCase()}}};
 // a box over one list of names: kind = units | weapons | sounds | pngs; br = its Browse spec (else BR[kind]); go = what a pick runs
 function kitOn(i,key,kind,go,br){return searchKit(i,{key:key,index:function(q,done){names(function(d){hits(d[kind],q,done)})},browse:br||BR[kind],onPick:function(v){i.value=v;if(i._sync)i._sync();if(go)go()}})}
 // the unit name boxes (unit files, camo, icons) share one name and one history; a pick in one fills them all and runs that box's look-up
 function unitInput(go){var i=nameInput('art.unitPh');inputs.push(i);i._sync=function(){LAST.unit=i.value;LS.set('art.unit',i.value);inputs.forEach(function(o){if(o!==i&&o.value!==i.value)o.value=i.value})};
  i.addEventListener('input',function(){inputs.forEach(function(o){if(o!==i&&o.value!==i.value)o.value=i.value})});kitOn(i,'art.unit','units',function(){go()});return i}
 // Listen: the compact sound player (ext view, kind sound) under the row, playing as in the game; again closes it. ref: {mod,key|rel}
 // or {path}. A key needs the mod (the layered game view): without one there is no button. All players stop when the page is left.
 var SNDS=[];
 function sndStop(){SNDS.forEach(function(x){try{x.hide()}catch(e){}})}
 try{if(typeof MutationObserver==='function')new MutationObserver(function(){if(root.hidden)sndStop()}).observe(root,{attributes:true,attributeFilter:['hidden']})}catch(e){}
 function listen(ref,name){if(typeof VIEW==='undefined'||!VIEW.soundMini||!ref||(ref.key&&!ref.mod)||(ref.rel&&!ref.mod))return null;
  var box=h('div',{class:'art-snd'}),hd=null;
  var b=h('button',{type:'button',class:'art-play',text:tx('art.listen'),title:tx('art.listenT'),onclick:function(){
   if(hd){hd.close();SNDS.splice(SNDS.indexOf(hd),1);hd=null;b.textContent=tx('art.listen');return}
   sndStop();hd=VIEW.soundMini(box,ref,name,{play:true});SNDS.push(hd);b.textContent=tx('art.listenClose')}});
  return h('span',{class:'art-sndw'},[b,box])}
 function isSnd(k){return /\.(wav|mp3|ogg)$/i.test(String(k||''))}
 function sizeText(n){if(n==null)return '';return n>1048576?(n/1048576).toFixed(1)+' MB':n>1024?Math.round(n/1024)+' KB':n+' B'}

 // ---- 1 tasks
 var tasks=['camo','sound','icon','portrait','model'],taskBox=blk('intro.tasks',[],{box:'col',name:tx('art.b.tasks')});
 tasks.forEach(function(t){taskBox.appendChild(lf('intro.tasks.'+t,[h('details',{class:'card'},[h('summary',{},[h('b',{text:txd('art.t.'+t+'.name')}),h('span',{class:'hint',text:'  '+txd('art.t.'+t+'.what')})]),steps('art.t.'+t+'.s',5)].concat(t==='model'?[h('div',{class:'hint',text:tx('art.modelMore')}),h('div',{class:'row'},[h('button',{type:'button',text:tx('art.modelGuides'),onclick:function(){show('guides','tools')}})])]:[]))]))});
 var intro=acard('intro','art.title','art.intro',[lf('intro.tasksh',[el('h4',null,tx('art.tasksH'))]),taskBox,lf('intro.paknote',[el('div','hint',tx('art.paknote'))])]);

 // ---- 2 unit files + copy
 var uIn=unitInput(function(){uFind.click()}),uOut=h('div'),uActs=h('div',{class:'row'}),uPlan=h('div'),UNIT=null;
 function boxes(){return [].slice.call(uOut.querySelectorAll('input[data-key]'))}
 function ticked(){return boxes().filter(function(b){return b.checked}).map(function(b){return b.getAttribute('data-key')})}
 function drawUnit(r){
  uOut.textContent='';uActs.textContent='';uPlan.textContent='';UNIT=r;
  if(!r.found){uOut.appendChild(el('div','err',tx('art.notfound',{n:uIn.value})));if(r.suggestions&&r.suggestions.length)uOut.appendChild(el('div','hint',tx('art.didyou')+r.suggestions.join(', ')));return}
  uOut.appendChild(h('div',{class:'row'},[h('b',{text:r.unit}),el('span','hint',tx('art.total',{n:r.total})+'  '+r.def)]));
  r.groups.forEach(function(g){uOut.appendChild(el('b',null,txd('art.role.'+g.role)+' ('+g.files.length+')'));
   var ul=h('div',{style:'margin:2px 0 6px 12px'});
   g.files.forEach(function(f){var cb=h('input',{type:'checkbox','data-key':f.key});cb.checked=!f.inMod&&f.inGame;
    ul.appendChild(h('div',{},[h('label',{},[cb,h('span',{text:' '+f.key.replace('resource/','')})]),h('span',{class:'badge '+(f.inMod?'good':''),text:tx(f.inMod?'art.inMod':'art.gameOnly')}),el('span','hint',sizeText(f.size))]))});
   uOut.appendChild(ul)});
  var b1=h('button',{type:'button',text:tx('art.previewCopy'),onclick:function(){doCopy(true)}}),ow=h('input',{type:'checkbox'});
  uActs.appendChild(b1);uActs.appendChild(h('label',{},[ow,h('span',{text:' '+tx('art.overwrite')})]));uActs.owBox=ow;
  uActs.appendChild(el('span','hint',tx('art.copyNote')))}
 function doCopy(dry){
  if(needMod(uPlan))return;var keys=ticked();if(!keys.length){say(uPlan,'err',tx('art.nothingTick'));return}
  api('/api/x/art/copy',gb({keys:keys,dry:dry,overwrite:!!(uActs.owBox&&uActs.owBox.checked)}),{what:tx(dry?'art.job.copyPlan':'art.job.copy')}).then(function(p){
   uPlan.textContent='';
   if(dry){uPlan.appendChild(el('div','wzstat',tx('art.planLine',{c:p.copy,s:p.skip,m:p.missing})+'  -> '+p.mod));
    var ul=h('div',{class:'scroll',style:'max-height:12em'});p.plan.slice(0,200).forEach(function(x){ul.appendChild(el('div','hint',txd('art.act.'+x.action)+'  '+x.key))});uPlan.appendChild(ul);
    if(p.copy)uPlan.appendChild(h('button',{type:'button',class:'primary',text:tx('art.doCopy',{n:p.copy}),onclick:function(){doCopy(false)}}))}
   else{uPlan.appendChild(el('div','wzstat ok',tx('art.copied',{n:p.written,p:p.mod})));toast(tx('art.copiedToast',{n:p.written}))}}).catch(fail(uPlan))}
 var uFind=h('button',{type:'button',class:'primary',text:tx('art.find'),onclick:function(){
  if(!uIn.value.trim()){say(uOut,'err',tx('art.typeUnit'));return}
  say(uOut,'hint',tx('art.searching'));api('/api/x/art/unit?name='+encodeURIComponent(uIn.value.trim())+mq()+gq()).then(drawUnit).catch(fail(uOut))}});
 uIn.addEventListener('keydown',function(e){if(e._sk)return;if(e.key==='Enter')uFind.click()});
 var unitCard=acard('unit','art.unitH','art.unitIntro',[lf('unit.find',[h('label',{text:tx('art.unitName')+' '}),uIn._sk.el,uFind],null,'row'),lf('unit.files',[uOut],'art.b.files'),lf('unit.acts',[uActs],'art.b.copy'),lf('unit.plan',[uPlan],'art.b.plan')]);

 // ---- 3 camo
 var cIn=unitInput(function(){cLook.click()}),cOut=h('div'),cForm=h('div'),cRes=h('div'),CAMO=null;
 var cOpt=h('input',{type:'text',placeholder:'Autumn',style:'width:10em'}),cVar=h('input',{type:'text',placeholder:'aut',style:'width:8em'});
 function camoWrite(dry){
  if(needMod(cRes))return;if(!cOpt.value.trim()||!cVar.value.trim()){say(cRes,'err',tx('art.camoNeed'));return}
  api('/api/x/art/camo-write',gb({name:cIn.value.trim(),option:cOpt.value.trim(),variant:cVar.value.trim(),dry:dry}),{what:tx(dry?'art.job.camoPlan':'art.job.camo')}).then(function(p){
   cRes.textContent='';
   if(p.how==='same'){cRes.appendChild(el('div','wzstat ok',tx('art.camoSame')));return}
   if(dry){cRes.appendChild(el('div','wzstat',tx('art.camoWill',{p:p.dest})));cRes.appendChild(el('div',null,tx('art.camoLine')+' '+p.line));
    if(!p.variantFileFound){cRes.appendChild(el('div','err',tx('art.camoNoFile',{v:cVar.value.trim()})));if(p.game==='goh')cRes.appendChild(el('div','hint',tx('art.gohCamo')))}
    if(p.text){var pre=h('pre',{style:'max-height:14em;overflow:auto;background:var(--pre);padding:4px'});pre.textContent=p.text;cRes.appendChild(pre)}
    cRes.appendChild(h('button',{type:'button',class:'primary',text:tx('art.camoWrite'),onclick:function(){camoWrite(false)}}))}
   else cRes.appendChild(el('div','wzstat ok',tx('art.camoDone',{p:p.dest})))}).catch(fail(cRes))}
 // the variant box: index = the variants the look-up found (textures, and GoH meshes); Browse = the game data at the unit's texture
 // folder (else entity/), a pick of name#variant.dds (or .ply) gives the variant
 function camoDir(){var t=CAMO&&CAMO.found&&(CAMO.textures||[]).concat(CAMO.meshes||[])[0];if(!t)return 'entity';var k=t.key.replace(/^resource\//,'');return k.slice(0,Math.max(0,k.lastIndexOf('/')))}
 var cvKit=searchKit(cVar,{key:'art.camoVar',index:function(q,done){hits(camoVars(),q,done)},
  browse:{mode:'file',view:'data',start:camoDir,exts:['dds','tga','png','ply'],toValue:function(p){var s=stem(p),i=s.indexOf('#');return i<0?'':s.slice(i+1)}}});
 function camoVars(){if(!CAMO||!CAMO.found)return [];if(CAMO._sk)return CAMO._sk;var a=[];
  (CAMO.textures||[]).concat(CAMO.meshes||[]).forEach(function(t){(t.variants||[]).forEach(function(v){a.push({label:v,value:v,hint:t.key.replace('resource/',''),lo:String(v).toLowerCase()})})});return (CAMO._sk=a)}
 function drawCamo(r){
  cOut.textContent='';cForm.textContent='';cRes.textContent='';CAMO=r;cvKit.refresh();
  if(!r.found){cOut.appendChild(el('div','err',tx('art.notfound',{n:cIn.value})));return}
  cOut.appendChild(el('b',null,tx('art.camoTex')));
  if(!r.textures.length)cOut.appendChild(el('div','hint',tx('art.camoNoTex')));
  r.textures.forEach(function(t){cOut.appendChild(h('div',{},[el('span',null,t.key.replace('resource/','')),' ',el('span','badge',t.variants.length?tx('art.camoVariants')+' '+t.variants.join(', '):tx('art.camoNoVar'))]))});
  cOut.appendChild(el('b',null,tx('art.camoNow')));
  cOut.appendChild(el('div','hint',r.texmods.length?r.texmods.map(function(p){return p[0]+' -> '+p[1]}).join(' | '):tx(r.inheritsOnly?'art.camoInherit':'art.camoNone')));
  if(r.game==='goh'){if(r.texmod)cOut.appendChild(el('div','hint',tx('art.gohTexmod',{v:r.texmod})));
   if(r.meshes&&r.meshes.length){cOut.appendChild(el('b',null,tx('art.gohMeshVar')));r.meshes.forEach(function(m){cOut.appendChild(h('div',{},[el('span',null,m.key.replace('resource/','')),' ',el('span','badge',m.variants.join(', '))]))})}
   cOut.appendChild(el('div','hint',tx('art.gohCamo')))}
  cForm.appendChild(h('div',{class:'row'},[h('label',{text:tx('art.camoOpt')+' '}),cOpt,h('label',{text:' '+tx('art.camoVar')+' '}),cvKit.el,h('button',{type:'button',text:tx('art.previewBtn'),onclick:function(){camoWrite(true)}})]));
  cForm.appendChild(el('div','hint',tx('art.camoHint')))}
 var cLook=h('button',{type:'button',class:'primary',text:tx('art.camoLook'),onclick:function(){
  if(!cIn.value.trim()){say(cOut,'err',tx('art.typeUnit'));return}
  say(cOut,'hint',tx('art.searching'));api('/api/x/art/camo?name='+encodeURIComponent(cIn.value.trim())+mq()+gq()).then(drawCamo).catch(fail(cOut))}});
 var camoCard=acard('camo','art.camoH','art.camoIntro',[lf('camo.steps',[steps('art.camoE',4)],'art.b.steps'),lf('camo.find',[h('label',{text:tx('art.unitName')+' '}),cIn._sk.el,cLook],null,'row'),lf('camo.now',[cOut],'art.b.camoNow'),lf('camo.form',[cForm],'art.b.camoForm'),lf('camo.res',[cRes],'art.b.res')]);

 // ---- 4 sound
 var wIn=h('input',{type:'text',placeholder:tx('art.weaponPh'),style:'width:16em'}),sOut=h('div'),wavOut=h('div'),wavPath=h('input',{type:'text',placeholder:tx('art.wavPh'),style:'width:28em'});
 // weapon box: the set/stuff names (a pick looks its sounds up), Browse = game data set/stuff; WAV box: the mod's own sound files,
 // Browse = the disk at the box's folder (else the mod), sound files only; a file inside the mod comes back as its path in the mod
 var wKit=kitOn(wIn,'art.weapon','weapons',function(){sBtn.click()});
 wIn.addEventListener('keydown',function(e){if(e._sk)return;if(e.key==='Enter')sBtn.click()});
 var wavKit=kitOn(wavPath,'art.wav','sounds',function(){checkWav()},{mode:'file',view:'disk',start:function(){return folderOf(wavPath.value)},exts:['wav','ogg','mp3'],toValue:function(p){return inMod(p)}});
 function drawSound(r){sOut.textContent='';
  if(!r.foundStuff)sOut.appendChild(el('div','err',tx('art.soundNoStuff',{w:r.weapon})));
  else sOut.appendChild(el('div','hint',tx('art.soundFrom')+' '+r.stuffFiles.map(function(k){return k.replace('resource/set/stuff/','')}).join(' <- ')));
  if(r.foundStuff&&!r.sounds.length)sOut.appendChild(el('div',null,tx('art.soundNone')));
  r.sounds.forEach(function(s){var f0=s.files&&s.files[0];sOut.appendChild(h('div',{style:'margin:4px 0'},[el('b',null,s.kind+' "'+s.name+'"'),el('div',null,s.folder?tx('art.soundFolder',{f:'resource/sound/'+s.folder}):tx('art.soundNoFolder')),el('div','hint',s.files.slice(0,6).map(function(f){return f.replace('resource/sound/','')}).join(', ')+(s.files.length>6?' ...':'')),
   f0&&S.mod?listen({mod:S.mod,key:f0},f0.split('/').pop()):null]))});
  if(r.similar.length){sOut.appendChild(el('div','hint',tx('art.soundSimilar')));sOut.appendChild(el('div','hint',r.similar.map(function(f){return f.replace('resource/sound/','')}).join(', ')))}}
 var sBtn=h('button',{type:'button',class:'primary',text:tx('art.soundFind'),onclick:function(){
  if(!wIn.value.trim()){say(sOut,'err',tx('art.typeWeapon'));return}
  say(sOut,'hint',tx('art.searching'));api('/api/x/art/sound?weapon='+encodeURIComponent(wIn.value.trim())+gq()).then(drawSound).catch(fail(sOut))}});
 function checkWav(){var p=wavPath.value.trim();if(!p){say(wavOut,'err',tx('art.wavNeed'));return}
  var rel=!/^([A-Za-z]:|[\\\/])/.test(p);if(rel&&needMod(wavOut))return;
  api('/api/x/art/wav?path='+encodeURIComponent(p)+(rel?mq():'')+gq(),undefined,{what:tx('art.job.wav')}).then(function(r){wavOut.textContent='';
   wavOut.appendChild(el('div','wzstat '+(r.ok?'ok':'err'),r.plain));
   if(r.kind==='wav')wavOut.appendChild(el('div','hint',r.codec+', '+r.channels+' ch, '+r.rate+' Hz, '+r.bits+' bit'+(r.seconds?', '+r.seconds+' s':'')));
   var lb=listen(rel?{mod:S.mod,rel:p}:(S.mod?{mod:S.mod,path:p}:{path:p}),p.split(/[\\\/]/).pop());if(lb)wavOut.appendChild(lb)}).catch(fail(wavOut))}
 // make the sound above playable: POST /api/x/art/wav-convert, preview first (plan), then write into the mod
 var cvOut=h('input',{type:'text',placeholder:tx('art.convOutPh'),style:'width:28em'}),cvFmt=h('select',{},[h('option',{value:'ima',text:tx('art.convIma')}),h('option',{value:'pcm16',text:tx('art.convPcm')})]),
  cvRate=h('select',{},[h('option',{value:'keep',text:tx('art.convRateKeep')}),h('option',{value:'44100',text:'44100 Hz'}),h('option',{value:'22050',text:'22050 Hz'})]),cvOw=h('input',{type:'checkbox'}),cvRes=h('div');
 function fmtLine(x){return x.codec+', '+x.channels+' ch, '+x.rate+' Hz, '+(x.seconds!=null?x.seconds+' s, ':'')+sizeText(x.bytes)}
 function convGo(plan){
  if(needMod(cvRes))return;var src=wavPath.value.trim();if(!src){say(cvRes,'err',tx('art.wavNeed'));return}
  var out=cvOut.value.trim();if(!out&&/^resource[\\\/]sound[\\\/]/i.test(src))out=src.replace(/\\/g,'/');
  if(!out){say(cvRes,'err',tx('art.convNeedOut'));return}
  api('/api/x/art/wav-convert',gb({src:src,out:out,format:cvFmt.value,rate:cvRate.value,overwrite:cvOw.checked,plan:plan}),{what:tx(plan?'art.job.convPlan':'art.job.conv')}).then(function(p){cvRes.textContent='';
   if(plan){cvRes.appendChild(el('div','wzstat',tx('art.convPlan',{p:p.key})));
    cvRes.appendChild(el('div','hint',tx('art.convFrom')+' '+fmtLine(p.from)));cvRes.appendChild(el('div','hint',tx('art.convTo')+' '+fmtLine(p.to)));
    cvRes.appendChild(el('div',p.ok?'hint':'err',p.check));
    if(p.action==='replace')cvRes.appendChild(el('div',cvOw.checked?'hint':'err',tx(cvOw.checked?'art.convReplace':'art.convExists')));
    if(p.action!=='replace'||cvOw.checked)cvRes.appendChild(h('button',{type:'button',class:'primary',text:tx('art.convWrite'),onclick:function(){convGo(false)}}))}
   else{cvRes.appendChild(el('div','wzstat ok',tx('art.convDone',{p:p.dest})));toast(tx('art.convDone',{p:p.key}))}}).catch(fail(cvRes))}
 var ffPre=h('pre',{style:'background:var(--pre);padding:4px;overflow:auto'});ffPre.textContent='ffmpeg -i input.mp3 -ac 1 -ar 44100 -c:a pcm_s16le output.wav\nffmpeg -i input.wav -ac 1 -ar 44100 -c:a adpcm_ima_wav output.wav';
 var soundCard=acard('sound','art.soundH','art.soundIntro',[lf('sound.find',[h('label',{text:tx('art.weapon')+' '}),wKit.el,sBtn],null,'row'),lf('sound.res',[sOut],'art.b.soundRes'),
  blk('sound.wav',[lf('sound.wav.title',[el('h4',null,tx('art.wavH'))]),lf('sound.wav.pick',[wavKit.el,h('button',{type:'button',text:tx('art.wavCheck'),onclick:checkWav})],'art.b.wavPick','row'),lf('sound.wav.rel',[el('div','hint',tx('art.wavRel'))]),lf('sound.wav.res',[wavOut],'art.b.res')],{box:'col',name:tx('art.wavH')}),
  blk('sound.conv',[lf('sound.conv.title',[el('h4',null,tx('art.convH'))]),lf('sound.conv.intro',[el('div','hint',tx('art.convIntro'))]),lf('sound.conv.pick',[cvOut,cvFmt,cvRate,h('label',{},[cvOw,h('span',{text:' '+tx('art.convOw')})]),h('button',{type:'button',text:tx('art.convGo'),onclick:function(){convGo(true)}})],'art.b.convPick','row'),lf('sound.conv.res',[cvRes],'art.b.res')],{box:'col',name:tx('art.convH')}),
  blk('sound.ff',[lf('sound.ff.title',[el('h4',null,tx('art.ffH'))]),lf('sound.ff.text',[el('div','hint',tx('art.ffText'))]),lf('sound.ff.cmd',[ffPre],'art.b.ffCmd'),lf('sound.ff.note',[el('div','hint',tx('art.ffNote'))])],{box:'col',name:tx('art.ffH')})]);

 // ---- 5 icons
 var iIn=unitInput(function(){iBtn.click()}),iOut=h('div'),pngPath=h('input',{type:'text',placeholder:tx('art.pngPh'),style:'width:28em'}),pngKind=h('select',{},[h('option',{value:'icon',text:tx('art.kindIcon')}),h('option',{value:'portrait',text:tx('art.kindPortrait')}),h('option',{value:'squad',text:tx('art.kindSquad')}),h('option',{value:'scheme',text:tx('art.kindScheme')})]),pngOut=h('div');
 // PNG box: the .png files in the mod folder (full paths), Browse = the disk at the box's folder (else the mod), .png only, the full path
 var pngKit=kitOn(pngPath,'art.png','pngs',null,{mode:'file',view:'disk',start:function(){return folderOf(pngPath.value)},exts:['png']});
 function drawIcons(r){iOut.textContent='';
  var t=h('table',{},[h('thead',{},[h('tr',{},['art.colFolder','art.colFrame','art.colFile','art.colSize','art.colGame','art.colMine'].map(function(k){return h('th',{text:tx(k)})}))])]),tb=h('tbody');
  r.rows.forEach(function(x){tb.appendChild(h('tr',{class:S.mod&&!x.inMod?'sev-silent':''},[h('td',{text:x.folder}),h('td',{text:'_0'+x.frame}),h('td',{text:x.want.replace('resource/','')}),h('td',{text:x.size||'?'}),h('td',{text:tx(x.inGame?'art.yes':'art.no')}),h('td',{text:S.mod?tx(x.inMod?'art.yes':'art.no'):'-'})]))});
  t.appendChild(tb);iOut.appendChild(h('div',{class:'scroll'},[t]));
  if(!r.anyInGame)iOut.appendChild(el('div','hint',tx('art.iconNoGame')));
  if(S.mod){var miss=r.rows.filter(function(x){return !x.inMod}).length;iOut.appendChild(el('div',miss?'err':'ok',miss?tx('art.iconMissing',{n:miss}):tx('art.iconAll')))}
  iOut.appendChild(el('div','hint',r.portrait?tx('art.portraitFound',{k:r.portrait.key.replace('resource/','')}):tx('art.portraitNone')))}
 var iBtn=h('button',{type:'button',class:'primary',text:tx('art.iconLook'),onclick:function(){
  if(!iIn.value.trim()){say(iOut,'err',tx('art.typeUnit'));return}
  say(iOut,'hint',tx('art.searching'));api('/api/x/art/icons?name='+encodeURIComponent(iIn.value.trim())+mq()+gq()).then(drawIcons).catch(fail(iOut))}});
 function pngGo(dry){
  if(needMod(pngOut))return;if(!iIn.value.trim()){say(pngOut,'err',tx('art.typeUnit'));return}if(!pngPath.value.trim()){say(pngOut,'err',tx('art.pngNeed'));return}
  api('/api/x/art/icon-png',gb({name:iIn.value.trim(),kind:pngKind.value,png:pngPath.value.trim(),dry:dry}),{what:tx(dry?'art.job.iconPlan':'art.job.icon')}).then(function(p){pngOut.textContent='';
   if(dry){pngOut.appendChild(el('div','wzstat',tx('art.pngPlan',{n:p.targets.length})));
    p.targets.forEach(function(x){pngOut.appendChild(el('div','hint',x.key.replace('resource/','')+'  '+x.size+(x.guessed?' ('+tx('art.sizeGuess')+')':'')+(x.exists?'  '+tx('art.willReplace'):'')))});
    pngOut.appendChild(h('button',{type:'button',class:'primary',text:tx('art.pngWrite'),onclick:function(){pngGo(false)}}))}
   else pngOut.appendChild(el('div','wzstat ok',tx('art.pngDone',{n:p.written})))}).catch(fail(pngOut))}
 var iconCard=acard('icon','art.iconH','art.iconIntro',[lf('icon.steps',[steps('art.iconE',3)],'art.b.steps'),lf('icon.find',[h('label',{text:tx('art.unitName')+' '}),iIn._sk.el,iBtn],null,'row'),lf('icon.res',[iOut],'art.b.iconRes'),
  blk('icon.png',[lf('icon.png.title',[el('h4',null,tx('art.pngH'))]),lf('icon.png.intro',[el('div','hint',tx('art.pngIntro'))]),
  lf('icon.png.pick',[pngKind,pngKit.el,h('button',{type:'button',text:tx('art.previewBtn'),onclick:function(){pngGo(true)}})],'art.b.pngPick','row'),lf('icon.png.res',[pngOut],'art.b.res')],{box:'col',name:tx('art.pngH')})]);

 // ---- 6 art check
 var kOut=h('div');
 function drawCheck(r){kOut.textContent='';
  r.tools.forEach(function(t){kOut.appendChild(el('div',t.ok?'hint':'err',t.ok?tx('art.toolOk',{t:t.tool}):tx('art.toolBad',{t:t.tool,m:t.note||''})))});
  kOut.appendChild(el('div','hint',tx('art.assetsameNote')));
  if(!r.total){kOut.appendChild(el('div','wzstat ok',tx('art.checkClean')));return}
  kOut.appendChild(el('div','wzstat',tx('art.checkFound',{n:r.total})));
  r.stray.forEach(function(s){kOut.appendChild(h('div',{class:'wzstat err'},[el('b',null,tx('art.strayH')+' '),el('span',null,tx('art.strayLine',{s:s.stem.replace('resource/',''),w:s.winner,e:s.exts.join(' ')}))]))});
  r.headers.forEach(function(x){kOut.appendChild(h('div',{class:'wzstat err'},[el('b',null,x.key.replace('resource/','')+': '),el('span',null,x.plain),isSnd(x.key)?listen({mod:S.mod,key:x.key},x.key.split('/').pop()):null]))});
  r.groups.forEach(function(g){var c=g.card,box=h('div',{class:'wzstat'},[h('div',{},[el('b',null,g.code),el('span','badge',g.tool),el('span','hint',' x'+g.n+'  '+g.samples.join(' | '))])]);
   if(c){box.appendChild(el('div',null,c.what));if(c.fix&&c.fix.length){box.appendChild(el('div','hint',tx('art.fixH')));c.fix.forEach(function(f){box.appendChild(el('div','hint','- '+f))})}}
   kOut.appendChild(box)})}
 var kBtn=h('button',{type:'button',class:'primary',text:tx('art.checkRun'),onclick:function(){
  if(needMod(kOut))return;say(kOut,'hint',tx('art.checkRunning'));api('/api/x/art/check',gb({})).then(drawCheck).catch(fail(kOut))}});
 var checkCard=acard('check','art.checkH','art.checkIntro',[lf('check.btns',[kBtn],null,'row'),lf('check.res',[kOut],'art.b.res')]);

 // ---- 7 blender
 var bOut=h('div'),bBtn=h('button',{type:'button',text:tx('art.blenCheck'),onclick:function(){say(bOut,'hint',tx('art.searching'));
  api('/api/x/art/blender',undefined,{what:tx('art.job.blender')}).then(function(r){bOut.textContent='';bOut.appendChild(el('div','wzstat '+(r.found?'ok':'err'),tx(r.found?(r.enabled?'art.blenOk':'art.blenFoundOff'):'art.blenNone')));if(!(r.found&&r.enabled))bOut.appendChild(el('div','hint',tx(r.found?'art.blenNextOff':'art.blenNextNone')));var pre=h('pre',{style:'background:var(--pre);padding:4px;overflow:auto'});pre.textContent=r.text;bOut.appendChild(pre)}).catch(fail(bOut))}});
 var blenCard=acard('blen','art.blenH','art.blenIntro',[lf('blen.steps',[steps('art.blen',7)],'art.b.steps'),lf('blen.btns',[bBtn],null,'row'),lf('blen.res',[bOut],'art.b.res')]);

 // ---- 8 assets
 var aOut=h('div'),aFilter=h('select',{},['all','text','exporter','image','sound','badsound','video','pack','other'].map(function(t){return h('option',{value:t,text:t==='all'?tx('art.tagAll'):txd('art.tag.'+t)})})),AS=null;
 function drawAssets(){aOut.textContent='';if(!AS)return;var f=aFilter.value,rows=AS.files.filter(function(x){return f==='all'||x.tag===f});
  var counts=Object.keys(AS.counts).sort().map(function(k){return k+' '+AS.counts[k]}).join(', ');
  aOut.appendChild(el('div','hint',tx('art.assetsShown',{s:AS.shown,t:AS.total})+'  '+counts));
  var t=h('table',{},[h('thead',{},[h('tr',{},['art.colFile','art.colSize','art.colWhat','art.colInfo'].map(function(k){return h('th',{text:tx(k)})}))])]),tb=h('tbody');
  rows.slice(0,400).forEach(function(x){tb.appendChild(h('tr',{class:x.info&&!x.info.ok?'sev-silent':''},[h('td',{text:x.rel}),h('td',{text:sizeText(x.size)}),h('td',{text:txd('art.tag.'+x.tag)}),h('td',{},[x.info?x.info.text:'',(x.tag==='sound'||x.tag==='badsound')&&isSnd(x.rel)?listen({mod:S.mod,rel:x.rel},x.rel.split('/').pop()):null])]))});
  t.appendChild(tb);aOut.appendChild(h('div',{class:'scroll',style:'max-height:22em'},[t]))}
 aFilter.addEventListener('change',drawAssets);
 var aBtn=h('button',{type:'button',class:'primary',text:tx('art.assetsRefresh'),onclick:function(){if(needMod(aOut))return;say(aOut,'hint',tx('art.searching'));api('/api/x/art/assets?x=1'+mq()+gq()).then(function(r){AS=r;drawAssets()}).catch(fail(aOut))}});
 var assetsCard=acard('assets','art.assetsH','art.assetsIntro',[lf('assets.btns',[aBtn,aFilter],'art.b.assetsBtns','row'),lf('assets.res',[aOut],'art.b.assetsRes')]);

 // ---- 9 troubleshooting + see the result
 var tr=h('ul');for(var ti=1;ti<=5;ti++)tr.appendChild(h('li',{text:txd('art.tr'+ti)}));
 var troubleCard=acard('trouble','art.trH',null,[lf('trouble.list',[tr],'art.trH')]);
 var seeCard=acard('see','art.seeH','art.seeText',[lf('see.btns',[h('button',{type:'button',text:tx('art.seePlay'),onclick:function(){show('play')}}),h('button',{type:'button',text:tx('art.seeCheck'),onclick:function(){show('check')}})],null,'row'),lf('see.editor',[el('div','hint',tx('art.seeEditor'))])]);

 [intro,unitCard,camoCard,soundCard,iconCard,checkCard,blenCard,assetsCard,troubleCard,seeCard].forEach(function(c){root.appendChild(c)});
 return {refresh:function(){},focus:function(){}}};
`;
