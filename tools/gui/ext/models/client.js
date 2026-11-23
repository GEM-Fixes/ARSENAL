// Browser side of the Models page. Page rules: no backtick, no dollar-brace, no innerHTML; DOM through h() and textContent.
// Flow: pick a model (find: vehicles, soldiers, objects, breeds, in the mod, the game and inside paks; or a .mdl/.def path, a folder,
// a .pak), read its file set (stage --dry) and open it as an editable document
// (sub/doc.client.js, EXT_SCREENS.models.doc; its bar with Undo, Redo, Save sits above the sub-tabs; parts get it as ctx.doc).
// The SOEdit program is optional, behind "External SOEdit" folds: locate (or build) it, copy the model into the mod (stage),
// open it in SOEdit (open, with the page language), check what the save changed (check).
// Other pages jump here with S.screens.models.pick(name) after show('models') (the Units page's "Open model" does).
// Texture variants and soldier skins: sub/look.client.js (parts.look above the 3D view, parts.skins the card "Soldier skins").
// Author: Imperator_Aug (ARSENAL, ia-f11e8ac3)
module.exports = String.raw`
EXT_SCREENS.models=function(root){
 var el=h,SE=null,SET=null,CHK=null,target=LS.get('models.target',''),sub=LS.get('models.sub','model'),modNow=null;
 // codes check.js reports for what a SOEdit save lost (tools/soedit/README.md "check"); each has models.code.<CODE> in lang.json
 var KNOWN=['WARN_ANM_VERSION_CHANGED','WARN_PLY_SUBM_TO_MESH','MDL_KEYWORD_LOST','MDL_BLOCK_LOST','MDL_COMMENTS_DROPPED'];
 function clear(n){while(n.firstChild)n.removeChild(n.firstChild)}
 function say(box,cls,t){box.className=cls;box.textContent=t}
 // JOBS: a request stopped from the footer (e.cancelled) is no error: its line says Stopped in the plain hint style
 function ecl(e){return e&&e.cancelled?'hint':'err'}
 function k2(a,b){return tx([a,b].join('.'))}

 // BLOCKS, sub/README.md "Blocks"): every part of the page sits in one block: el(tag,{blk:id}) is a leaf
 // el(tag,{blk:id,box:kind}) a container (el = the page's h()). Elements the code re-classes (say()) are wrapped in a leaf. Each sub-tab
 // is drawn into a pane container of its own (id tab.<sub-tab id>) inside 'ed.sub'; parts get the pane as ctx.body.
 function nm(k){return tx(['models.blk',k].join('.'))}
 function reblk(){if(typeof blkApply==='function')blkApply(root)}
 // ---------- what this tab is ----------
 root.appendChild(el('div',{blk:'title'},[el('h2',{text:tx('models.title')})]));
 root.appendChild(el('div',{class:'card',blk:'intro',box:'col','data-blkname':nm('intro')},[
  el('div',{blk:'intro.text',text:tx('models.intro')}),
  el('div',{class:'hint',blk:'intro.safe',text:tx('models.safe')})]));

 // ---------- SOEdit found or not ----------
 // the SOEdit program is optional: its card is a closed fold at the end of the page, and its absence is a plain hint, not an error
 var stBox=el('div'),bOut=el('pre',{class:'scroll',hidden:true,style:'white-space:pre-wrap;max-height:16em'});
 var startBtn=el('button',{type:'button',class:'primary',text:tx('models.start'),onclick:doStart});
 var extCard=el('details',{class:'card',blk:'ext',box:'col'},[el('summary',{text:tx('models.ext.title')}),el('div',{class:'hint',blk:'ext.hint',text:tx('models.ext.hint')}),
  el('div',{blk:'ext.title'},[el('h3',{text:tx('models.st.title')})]),el('div',{blk:'ext.st','data-blkname':nm('soeditState')},[stBox]),el('div',{blk:'ext.out','data-blkname':nm('soeditOut')},[bOut])]);
 function locate(){say(stBox,'hint',tx('models.st.looking'));
  api('/api/x/models/locate',undefined,{what:tx('models.job.locate')}).then(function(j){SE=j;drawStatus();seFound()}).catch(function(e){SE={found:false,message:e.cancelled?'':e.message};drawStatus();seFound()})}
 // SOEdit found or not only changes the Open buttons: on the Model sub-tab update them in place, so the 3D view is not built
 // again (a second /viewer/scene request per pick); other sub-tabs are drawn again
 var openRef=null;
 function seFound(){if(sub==='model'&&SET&&openRef&&openRef.btn.isConnected!==false){var w=openWhy();openRef.btn.disabled=!!w;openRef.why.textContent=w;return}drawSet()}
 function drawStatus(){clear(stBox);stBox.className='';
  if(SE&&SE.found){stBox.appendChild(el('div',{text:tx('models.st.found',{p:SE.path})}));
   if(SE.source)stBox.appendChild(el('div',{class:'hint',text:tx('models.st.src',{s:SE.source})}));
   if(SE.hash||SE.version)stBox.appendChild(el('div',{class:'hint',text:SE.version?tx('models.st.hash',{v:SE.version,h:SE.hash||'-'}):tx('models.st.hashOnly',{h:SE.hash||'-'})}));
   startBtn.textContent=tx('models.start');stBox.appendChild(el('div',{class:'row'},[startBtn]));return}
  stBox.appendChild(el('div',{text:tx('models.st.none')}));
  if(SE&&SE.message)stBox.appendChild(el('div',{class:'hint',text:SE.message}));
  startBtn.textContent=tx('models.startGet');stBox.appendChild(el('div',{class:'row'},[startBtn]))}
 // one button: SOEdit on this computer is started; if it is not here it is downloaded and installed first, then started
 function doStart(){var had=!!(SE&&SE.found),g=SE&&SE.get;
  if(had||typeof askDo!=='function'){goStart(had);return}
  askDo({title:tx('models.startGet'),lines:[g?tx('models.ask.get',{name:g.name,mb:(g.size/1048576).toFixed(1),from:g.url}):tx('models.ask.getPlain'),tx('models.ask.check'),tx('models.ask.open')],where:g?g.dest:''}).then(function(yes){if(yes)goStart(false)})}
 function goStart(had){bOut.hidden=false;bOut.textContent=tx(had?'models.opening':'models.getting');startBtn.disabled=true;
  api('/api/x/models/start',{lang:LANG},{what:tx(had?'models.job.start':'models.job.get')}).then(function(j){startBtn.disabled=false;
   bOut.textContent=j.ok?tx(j.installed?'models.startedNew':'models.started'):(j.message||tx('models.startFail'));if(j.installed||!had)locate()})
  .catch(function(e){startBtn.disabled=false;bOut.textContent=e.message})}

 // ---------- pick a model ----------
 // The search box asks POST /api/x/models/find: every model the mod and the game have, loose files and files inside .pak files
 // (vehicles, soldiers, objects, breeds), filtered by the kind row (kept as LS 'models.kind'). The path box takes a .mdl or .def file
 // or breed:<name> (chosen at once), or a folder or a .pak file: POST /api/x/models/folder lists its models in the same result area.
 // A row's target goes unchanged to stage and the other routes. One list request at a time counts (lSeq): a newer search or folder
 // drops the older reply. Errors: the server's sentence; a lost connection (fetch itself failed) says ARSENAL must be started again.
 var KINDS=['all','vehicle','human','object','breed'],KN=['vehicle','human','object','breed','model'],DOT=' '+String.fromCharCode(183)+' ',LIMIT=60,lSeq=0;
 var kind=LS.get('models.kind','all');if(KINDS.indexOf(kind)<0)kind='all';
 var pkMsg=el('div',{class:'hint'});
 var qIn=el('input',{type:'text',autocomplete:'off',placeholder:tx('models.q.ph'),'aria-label':tx('models.q'),style:'flex:1;min-width:14em'});
 var kindBtn={},kindRow=el('div',{class:'row',role:'group','aria-label':tx('models.f'),blk:'pk.kind','data-blkname':nm('kind')});
 KINDS.forEach(function(k){kindBtn[k]=el('button',{type:'button',text:k2('models.f',k),onclick:function(){setKind(k)}});kindRow.appendChild(kindBtn[k])});
 var hits=el('div',{class:'row',blk:'pk.hits','data-blkname':nm('hits')}),hitSay=el('div',{class:'hint'}),foldBar=el('div',{class:'row',blk:'pk.fold','data-blkname':nm('fold')});foldBar.hidden=true;
 var pIn=el('input',{type:'text',autocomplete:'off',placeholder:tx('models.path.ph'),'aria-label':tx('models.path'),style:'flex:1;min-width:14em'});
 var pBtn=el('button',{type:'button',text:tx('models.usePath'),onclick:usePath});
 // the path box's Browse (searchKit) opens the shared picker on files (.mdl, .def, .pak); this button on a whole folder; both start where the path box points
 var pDir=el('button',{type:'button',text:tx('models.browseDir'),onclick:function(){pick('dir',pkStart(),function(p){pIn.value=p;usePath()})}});
 // SEARCH BOXES (searchKit, tools/gui/README.md; owner: every search box has a manual browse, an indexed search and a history list).
 // The model box: index = the find route's answer for the words (the page's own search, debounced, older answers dropped) or, while a
 // folder or .pak is listed, the rows of that list (filtered here, nothing asked again; an empty box shows the last answer); Browse =
 // the shared file picker on the game data (paks and the mod on top) at entity, .mdl .def .set files: the picked file is the model
 // (its game key goes to stage, its name into the box). The path box: index = the entries of the folder typed so far (/api/ls, one call
 // per folder, kept; nothing asked for an empty box), Browse = the shared picker on the disk where the path box points, .mdl .def .pak
 // .set files: the path goes into the box and is used. History keys models.q and models.path. Without the page's kit (a part test)
 // the boxes stand alone.
 function kitOf(i,o){return typeof searchKit==='function'?searchKit(i,o):null}
 var qLast={q:null,items:[]},qWait=null;var WARM=null;
 var qKit=kitOf(qIn,{key:'models.q',
  index:function(q,done){if(FOLD){var a=foldHits(q);done(a.slice(0,30).map(rowItem),Math.max(0,a.length-30));return}
   if(!q){done(qLast.items);return}
   if(qLast.q===q){done(qLast.items);return}qWait={q:q,done:done}},
  browse:{mode:'file',view:'data',start:'entity',exts:['mdl','def','set'],toValue:function(p){p=String(p||'');return p.slice(p.lastIndexOf('/')+1).replace(/\.(mdl|def|set)$/i,'')}},
  onPick:function(v,it,from){if(it&&it.r){if(choose(it.r.target)!==false)markTarget();return}
   if(from==='browse'&&it&&it.path){var k=it.key||('resource/'+it.path);qIn.value=v;clear(hits);hitSay.textContent='';choose(it.view==='disk'?it.path:k);return}
   if(/^([a-zA-Z]:|[\\/])/.test(v)){pIn.value=v;listFolder(v);return}
   qIn.value=v;clearTimeout(qIn.t);search()}});
 function rowItem(r){return {label:rowName(r),value:r.target,hint:rowTag(r).replace(/^\s+/,''),group:KN.indexOf(r.kind)>=0?k2('models.kind',r.kind):String(r.kind||''),r:r}}
 var LSD={},pKit=kitOf(pIn,{key:'models.path',
  index:function(q,done){var m=/^(.*[\\/])([^\\/]*)$/.exec(q);if(!m||!/^([a-zA-Z]:|[\\/])/.test(q)){done([]);return}var dir=m[1],part=m[2].toLowerCase();
   function out(j){var a=[];(j.entries||[]).forEach(function(e){if(!part||e.name.toLowerCase().indexOf(part)>=0)a.push({label:e.name+'/',value:join(dir,e.name),hint:tx('models.path.dir'),dir:true})});
    (j.files||[]).forEach(function(f){if(/\.(mdl|def|pak|set)$/i.test(f)&&(!part||f.toLowerCase().indexOf(part)>=0))a.push({label:f,value:join(dir,f),hint:tx('models.path.file')})});
    a.sort(function(x,y){var p=x.label.toLowerCase().indexOf(part)===0?0:1,r=y.label.toLowerCase().indexOf(part)===0?0:1;return p-r});done(a.slice(0,40),Math.max(0,a.length-40))}
   var k=dir.toLowerCase();if(LSD[k]){if(LSD[k].then)LSD[k].then(out);else out(LSD[k]);return}
   LSD[k]=api('/api/ls?files=1&dir='+encodeURIComponent(dir),undefined,{what:tx('models.job.ls')}).then(function(j){LSD[k]=j;return j},function(){LSD[k]={entries:[],files:[]};return LSD[k]});LSD[k].then(out)},
  browse:{mode:'file',view:'disk',start:pkStart,exts:['mdl','def','pak','set']},
  onPick:function(v,it){pIn.value=v;if(it&&it.dir){pIn.value=v.replace(/[\\/]*$/,'/');pKit.focus();try{pIn.dispatchEvent(new Event('input',{bubbles:true}))}catch(e){}return}usePath()}});
 root.appendChild(el('div',{class:'card',blk:'pk',box:'col'},[el('div',{blk:'pk.title'},[el('h3',{text:tx('models.pk.title')})]),
  el('div',{class:'hint',blk:'pk.hint','data-blkname':nm('pkHint'),text:tx('models.pk.hint')}),
  el('div',{class:'row',blk:'pk.q','data-blkname':tx('models.q')},[qKit?qKit.el:qIn]),kindRow,el('div',{blk:'pk.hitsay','data-blkname':nm('hitSay')},[hitSay]),foldBar,hits,
  el('div',{class:'row',blk:'pk.path','data-blkname':tx('models.path')},[pKit?pKit.el:pIn,pBtn,pDir]),el('div',{blk:'pk.msg','data-blkname':nm('pkMsg')},[pkMsg])]));
 function kindDraw(){KINDS.forEach(function(k){kindBtn[k].className=k===kind?'primary':'';kindBtn[k].setAttribute('aria-pressed',k===kind?'true':'false')})}
 function setKind(k){kind=k;LS.set('models.kind',k);kindDraw();qLast={q:null,items:[]};if(FOLD)foldDraw();else if(qIn.value.trim())search()}
 kindDraw();
 // a typed word: inside a listed folder the list is filtered in the next frame; else the find route after a pause
 qIn.addEventListener('input',function(){if(FOLD){foldSoon();return}clearTimeout(qIn.t);qIn.t=setTimeout(search,300)});
 qIn.addEventListener('keydown',function(e){if(e._sk)return;if(e.key==='Enter'){clearTimeout(qIn.t);if(FOLD)foldDraw();else search()}});
 pIn.addEventListener('keydown',function(e){if(e._sk)return;if(e.key==='Enter')usePath()});
 // a failed request: fetch itself failing (no status) means the program behind the window is gone; else the server's sentence
 function why(e){var m=String((e&&e.message)||e||'');if(e&&e.status==null&&/failed to fetch|networkerror|load failed/i.test(m))return tx('models.lost');return (e&&e.text)||m}
 // where the picker opens: the folder of the path box's absolute path (the path itself when it names no file), else the mod folder
 function pkStart(){var p=pIn.value.trim();if(!/^([a-zA-Z]:|[\\/])/.test(p))return S.mod||'';if(!/\.[a-zA-Z0-9]{1,4}$/.test(p))return p;
  var d=p.replace(/[\\/]+[^\\/]*$/,'');return (!d||/^[a-zA-Z]:$/.test(d))?p.slice(0,d.length+1):d}
 // a result row: the name, then a quiet tag (kind, your mod or game, the pak); the full key in the title; the chosen row is marked.
 // A row found by its in-game display name (byTitle) reads "title (name)"; any display name is in the tooltip too
 function rowTag(r){return DOT+(KN.indexOf(r.kind)>=0?k2('models.kind',r.kind):String(r.kind||''))+DOT+tx(r.where==='mod'?'models.where.mod':'models.where.game')+(r.pak?', '+r.pak:'')}
 function rowName(r){var n=String(r.name||r.target);return r.byTitle&&r.title?r.title+' ('+n+')':n}
 function rowBtn(r){var b=el('button',{type:'button',class:r.target===target?'primary':'',title:(r.title?r.title+'\n':'')+(r.key||r.target),onclick:function(){if(choose(r.target)!==false)markRow(b)}},[rowName(r),el('span',{class:'hint',text:rowTag(r)})]);b._t=r.target;return b}
 function markRow(b){var c=hits.children||[];for(var i=0;i<c.length;i++)if(c[i].tagName==='BUTTON')c[i].className=c[i]===b?'primary':''}
 function markTarget(){var c=hits.children||[];for(var i=0;i<c.length;i++)if(c[i].tagName==='BUTTON'&&c[i]._t!=null)c[i].className=c[i]._t===target?'primary':''}
 function search(){var q=qIn.value.trim(),my=++lSeq,k=kind,t0=Date.now();clear(hits);if(!q){hitSay.textContent='';return}say(hitSay,'hint',tx('models.searching'));
  // JOBS: the first ask is listed by name; the asks repeated while the model list is built are polls (the build is its own job)
  function ask(again){api('/api/x/models/find',{q:q,mod:S.mod||null,kind:k,limit:LIMIT},again?{job:false}:{what:tx('models.job.find')}).then(function(j){if(my!==lSeq||qIn.value.trim()!==q)return;clear(hits);
   // the index is built the first time: show the server's note and ask again while the same words are in the box (at most 2 minutes)
   if(j.building){if(Date.now()-t0<120000){var again2=function(){if(my===lSeq&&qIn.value.trim()===q)ask(true)};if(typeof pollLater==='function')pollLater('models',again2,2000);else setTimeout(again2,2000)}
    // rows of the last list come with building: they are drawn now (the note says so) and drawn again when the new list is there
    if(!(j.results&&j.results.length)&&!(j.didYouMean&&j.didYouMean.length)){say(hitSay,'hint',j.note||tx('models.indexing'));return}}   // waits while this page or the window is hidden
   var rs=j.results||[],dym=j.didYouMean||[],n=j.total||rs.length;
   say(hitSay,'hint',(!rs.length?tx('models.noHits'):n>rs.length?tx('models.hitsSome',{n:n,m:rs.length}):tx('models.hits',{n:n}))+(j.note?' '+j.note:''));
   rs.forEach(function(r){hits.appendChild(rowBtn(r))});
   if(!rs.length&&dym.length){hits.appendChild(el('span',{class:'hint',text:tx('models.dym')}));dym.forEach(function(r){hits.appendChild(rowBtn(r))})}
   // the same answer feeds the box's suggestions (searchKit index)
   qLast={q:q,items:(rs.length?rs:dym).map(rowItem)};if(qWait&&qWait.q===q){var w=qWait;qWait=null;w.done(qLast.items,Math.max(0,n-rs.length))}
  }).catch(function(e){if(my===lSeq)say(hitSay,ecl(e),why(e))})}
  ask()}
 // the path box: a .mdl or .def file or breed:<name> is chosen at once; a folder or a .pak file lists its models
 function usePath(){var p=pIn.value.trim();if(!p)return;if(/\.(mdl|def)$/i.test(p)||/^breed:/i.test(p)){choose(p);return}listFolder(p)}
 // a listed folder or .pak (FOLD): every row the server found (it caps at 20000) is kept with its words in lower case; the search box
 // then filters inside it (all words, in the next frame), the kind row too; rows are drawn SHOW at a time with a "show more" button
 var FOLD=null,SHOW=200,foldN=SHOW,foldQ=false;
 function foldHits(q){var w=String(q==null?qIn.value:q).trim().toLowerCase().split(/\s+/).filter(Boolean),out=[];if(!FOLD)return out;
  for(var i=0;i<FOLD.rows.length;i++){var r=FOLD.rows[i],l=FOLD.lo[i];if(kind!=='all'&&r.kind!==kind)continue;if(w.every(function(x){return l.indexOf(x)>=0}))out.push(r)}return out}
 function foldSoon(){if(foldQ)return;foldQ=true;var f=function(){foldQ=false;foldN=SHOW;foldDraw()};if(typeof requestAnimationFrame==='function')requestAnimationFrame(f);else setTimeout(f,0)}
 function foldDraw(){if(!FOLD)return;clear(hits);var a=foldHits(),n=FOLD.total,w=FOLD.path,q=qIn.value.trim();
  if(!FOLD.rows.length)say(hitSay,'hint',tx('models.folderNone',{p:w}));
  else if(q||a.length<FOLD.rows.length)say(hitSay,'hint',tx('models.foldIn',{n:a.length,p:w})+(a.length>foldN?' '+tx('models.foldShown',{m:foldN}):''));
  else say(hitSay,'hint',(FOLD.truncated||n>FOLD.rows.length)?tx('models.folderSome',{n:n,p:w,m:FOLD.rows.length}):tx('models.folderHits',{n:n,p:w}));
  a.slice(0,foldN).forEach(function(r){hits.appendChild(rowBtn(r))});
  if(a.length>foldN)hits.appendChild(el('button',{type:'button',class:'link',text:tx('models.showMore',{n:Math.min(SHOW,a.length-foldN),m:a.length-foldN}),onclick:function(){foldN+=SHOW;foldDraw()}}))}
 function foldOff(){FOLD=null;foldBar.hidden=true;clear(foldBar);qLast={q:null,items:[]};search()}
 function listFolder(p){var my=++lSeq;clear(hits);FOLD=null;qIn.value='';// a new listing starts unfiltered; typing then filters it
foldBar.hidden=true;say(hitSay,'hint',tx('models.folderLook',{p:p}));
  api('/api/x/models/folder',{path:p,mod:S.mod||null},{what:tx('models.job.folder')}).then(function(j){if(my!==lSeq)return;var rs=j.results||[];
   FOLD={path:j.path||p,rows:rs,total:j.total||rs.length,truncated:!!j.truncated,lo:rs.map(function(r){return [r.name,r.title,r.key,r.target,r.pak,r.kind].map(function(x){return x==null?'':String(x)}).join(' ').toLowerCase()})};
   foldN=SHOW;clear(foldBar);foldBar.hidden=false;
   foldBar.appendChild(el('span',{class:'hint',text:tx('models.foldNote')}));foldBar.appendChild(el('button',{type:'button',text:tx('models.foldOff'),onclick:foldOff}));
   foldDraw();if(qKit)qKit.refresh()
  }).catch(function(e){if(my===lSeq)say(hitSay,ecl(e),why(e))})}
 // the editable document (sub/doc.client.js): opened for every picked model once a mod folder is chosen; switching asks first if unsaved
 var D=EXT_SCREENS.models.doc||null;
 function openDoc(asked){if(D&&S.mod&&target)D.open({mod:S.mod,target:target,asked:!!asked}).catch(function(){/* the bar shows why */})}
 // false: the user kept the unsaved changes of the open model (nothing picked)
 function choose(t){if(D&&t!==target&&!D.confirmLeave())return false;target=t;LS.set('models.target',t);SET=null;CHK=null;stageCall(true);openDoc(true);return true}
 // one stage request per pick: the same request already on its way is not sent again (show() + pick() both asked for it), and
 // a reply that a newer request has replaced is dropped (it would put the previous unit on screen)
 var stSeq=0,stWant=null;
 function stageCall(dry){
  if(!target){drawSet();return}
  if(!S.mod){say(pkMsg,'err',tx('models.needMod'));drawSet();return}
  var want=JSON.stringify([target,S.mod,!!dry]);if(stWant===want)return;
  var my=++stSeq;stWant=want;
  say(pkMsg,'hint',tx(dry?'models.reading':'models.copying',{t:target}));
  api('/api/x/models/stage',{target:target,mod:S.mod,dry:!!dry},{what:tx(dry?'models.job.read':'models.job.copy')}).then(function(j){if(my!==stSeq)return;stWant=null;SET=j;
   if(!j.ok)say(pkMsg,'err',j.message||'');else say(pkMsg,'hint',dry?'':tx('models.copied',{n:(j.counts||{}).copied||0,k:(j.counts||{}).kept||0}));drawSet()
  }).catch(function(e){if(my!==stSeq)return;stWant=null;say(pkMsg,ecl(e),why(e));drawSet()})}

 // ---------- sub-tabs: Model, Animation ----------
 // SUB-PARTS: files in sub/ add to this page without editing it (index.js joins sub/<name>.client.js, .lang.json, .server.js).
 //   EXT_SCREENS.models.subs.<id>=function(ctx){...}   a sub-tab: drawn into ctx.body below the built-in view of the same id if there is
 //     one ('model', 'anim'), or as a new tab (label = lang key models.sub.<id>). No tab shows before its file exists.
 //   EXT_SCREENS.models.parts.viewer=function(ctx){return element}   the 3D view, placed above the file list of the Model sub-tab.
 //   ctx = {body, set (the file set: target, mdl, files, groups, staged), mod, el, clear, say, msg, k2, fileRow, redraw(), restage(), doc (= EXT_SCREENS.models.doc), onPick(fn)}
 //   ctx.onPick(fn) -> off(): fn(hit) for each click in the Model sub-tab's 3D view, hit = {volume, side, point, origin, dir, bone, hits, ground} as
 //     the viewer's onPick gives it (sub/README.md; ground = where the click ray meets z = 0 near the model, or null); the view keeps its own click (selection, readout). Listeners are dropped at the next draw.
 var XS=EXT_SCREENS.models.subs||{},XP=EXT_SCREENS.models.parts||{},PICK=[],WANTV=null;
 function onPick(fn){if(typeof fn==='function')PICK.push(fn);return function(){var i=PICK.indexOf(fn);if(i>=0)PICK.splice(i,1)}}
 function pickOut(hit){PICK.slice().forEach(function(f){try{f(hit)}catch(e){}})}
 function ctx(){return {body:pane,set:SET,mod:S.mod,el:el,clear:clear,say:say,msg:actMsg,k2:k2,fileRow:fileRow,redraw:drawSet,restage:function(){stageCall(true)},doc:D,onPick:onPick}}
 var SUBS=['model','anim'],tabBtn={},tabs=el('div',{class:'row',role:'tablist',blk:'ed.tabs','data-blkname':nm('tabs')}),body=el('div',{blk:'ed.sub',box:'col','data-blkname':nm('sub')}),pane=body;
 Object.keys(XS).forEach(function(k){if(SUBS.indexOf(k)<0)SUBS.push(k)});
 if(SUBS.indexOf(sub)<0)sub='model';
 SUBS.forEach(function(s){tabBtn[s]=el('button',{type:'button',role:'tab',text:k2('models.sub',s),onclick:function(){sub=s;LS.set('models.sub',s);drawSet()}});tabs.appendChild(tabBtn[s])});
 // EXT_SCREENS.models.go(id, sel) from a part: switch to that sub-tab (true) or say no (false: no such tab)
 if(D&&D._setGo)D._setGo(function(s){if(SUBS.indexOf(s)<0)return false;sub=s;LS.set('models.sub',s);drawSet();return true});
 var actMsg=el('div',{class:'hint'});
 // the document bar (Undo, Redo, Save, the unsaved mark) sits above the sub-tabs
 // the soldier skins (sub/look.client.js): a list by army and one skin standing; "Open model" picks it here with its variant
 var SKC=XP.skins?XP.skins({pick:function(n,v){if(choose(n)===false)return;WANTV={t:n,v:v||''};qIn.value=n;clear(hits);hitSay.textContent='';drawSet();if(tabs.scrollIntoView)try{tabs.scrollIntoView({block:'start'})}catch(e){}}}):null;
 if(SKC)root.appendChild(SKC.el);
 root.appendChild(el('div',{class:'card',blk:'ed',box:'col','data-blkname':nm('editor')},[D&&D.bar?D.bar(root):null,tabs,body,el('div',{blk:'ed.msg','data-blkname':nm('msg')},[actMsg])]));
 root.appendChild(extCard);
 var VIEWS={model:drawModel,anim:drawAnim};
 // parts are drawn between D._begin and D._end: listeners they add with D.on then live until the next draw
 function drawSet(){SUBS.forEach(function(s){tabBtn[s].className=s===sub?'primary':'';tabBtn[s].setAttribute('aria-selected',s===sub?'true':'false')});clear(body);PICK.length=0;
  pane=el('div',{blk:'tab.'+sub,box:'col','data-blkname':k2('models.sub',sub)});body.appendChild(pane);
  if(D&&D._begin)D._begin();
  try{if(!SET){pane.appendChild(el('div',{class:'hint',blk:'tab.'+sub+'.pick',text:tx('models.pickFirst')}));return}
   if(VIEWS[sub])VIEWS[sub]();if(XS[sub])XS[sub](ctx())}finally{if(D&&D._end)D._end();reblk()}}
 function openWhy(){if(!SE||!SE.found)return tx('models.why.noSoedit');if(!SET||!SET.staged)return tx('models.why.notStaged');return ''}
 function fileRow(f,extra){var b=f.missing?tx('models.missing'):f.inMod?tx('models.inMod'):tx('models.notInMod');
  return el('div',{class:'row'},[el('code',{text:f.rel}),el('span',{class:f.missing?'badge badx':f.inMod?'badge good':'badge',text:b})].concat(extra||[]))}
 function doOpen(anm){say(actMsg,'hint',tx('models.opening'));
  api('/api/x/models/open',{mod:S.mod,mdl:SET.mdl,anm:anm||null,lang:LANG},{what:tx('models.job.open')}).then(function(){say(actMsg,'hint',tx('models.opened'))}).catch(function(e){say(actMsg,ecl(e),e.message)})}
 function doCheck(){say(actMsg,'hint',tx('models.checking'));
  api('/api/x/models/check',{mod:S.mod,mdl:SET.mdl},{what:tx('models.job.check')}).then(function(j){CHK=j;say(actMsg,'hint','');drawSet()}).catch(function(e){say(actMsg,ecl(e),e.message)})}

 function drawModel(){var P=pane;
  P.appendChild(el('div',{blk:'model.title'},[el('h3',{text:tx('models.setOf',{t:SET.target})})]));
  // the 3D view (sub/viewer.client.js), reads the model through a route of its own; onHit passes its clicks on to ctx.onPick listeners
  // (not onPick: that one turns off the view's own pose following and readout)
  var vw=XP.viewer?XP.viewer(ctx(),{onHit:pickOut,blk:'model.view'}):null;
  // the texture variants of the model (sub/look.client.js): a control above the 3D view; a pick redraws the view, nothing is written
  var lk=XP.look?XP.look(ctx(),{viewer:vw,want:WANTV&&WANTV.t===target?WANTV.v:undefined,pose:function(n,v){if(SKC)SKC.pose(n,v)}}):null;
  if(lk)P.appendChild(lk);if(vw)P.appendChild(vw);
  // the file list: one leaf (a list of data rows)
  var fl=el('div',{blk:'model.files','data-blkname':nm('files')});P.appendChild(fl);
  (SET.order||[]).forEach(function(g){var a=(SET.groups||{})[g]||[];if(!a.length)return;
   fl.appendChild(el('div',{style:'margin-top:6px'},[el('b',{text:k2('models.g',g)+' ('+a.length+')'})]));
   a.forEach(function(f){fl.appendChild(fileRow(f))})});
  if(!(SET.files||[]).length)fl.appendChild(el('div',{class:'hint',text:tx('models.noFiles')}));
  var why=openWhy();
  var copyBtn=el('button',{type:'button',text:tx('models.copy'),onclick:function(){stageCall(false)}});
  var openBtn=el('button',{type:'button',class:'primary',text:tx('models.open'),onclick:function(){doOpen(null)}});
  var chkBtn=el('button',{type:'button',text:tx('models.check'),onclick:doCheck});
  openBtn.disabled=!!why;chkBtn.disabled=!SET.staged;
  var whySpan=el('span',{class:'hint',text:why});openRef={btn:openBtn,why:whySpan};
  // the SOEdit program buttons: optional, behind a fold (open while a check result is shown)
  var fold=el('details',{open:!!CHK,style:'margin-top:8px',blk:'model.ext',box:'col'},[el('summary',{text:tx('models.ext.title')}),el('div',{class:'hint',blk:'model.ext.hint',text:tx('models.ext.hint')}),
   el('div',{class:'row',style:'margin-top:4px',blk:'model.ext.btns','data-blkname':nm('soeditBtns')},[copyBtn,openBtn,chkBtn,whySpan])]);
  P.appendChild(fold);
  if(CHK)drawCheck(fold)}
 function drawCheck(into){var c={changed:0,'new':0,unchanged:0};(CHK.files||[]).forEach(function(f){if(c[f.state]!=null)c[f.state]++});
  var box=el('div',{style:'margin-top:8px',blk:'model.ext.chk','data-blkname':nm('check')},[el('h3',{text:tx('models.chk.title')}),el('div',{text:tx('models.chk.files',{c:c.changed,n:c['new'],u:c.unchanged})})]);
  var fs=CHK.findings||[];
  if(!fs.length)box.appendChild(el('div',{text:tx('models.chk.clean')}));
  else{box.appendChild(el('div',{text:tx('models.chk.lost',{n:fs.length})}));var ul=el('ul');
   fs.forEach(function(f){var known=KNOWN.indexOf(f.code)>=0,line=f.file+(f.line?':'+f.line:'')+': '+f.code+' '+f.msg;
    ul.appendChild(el('li',{},[el('span',{text:(known?k2('models.code',f.code):tx('models.code.other'))+' ('+f.file+')'}),
     el('details',{},[el('summary',{text:tx('models.raw')}),el('code',{text:line})])]))});
   box.appendChild(ul)}
  if(CHK.raw)box.appendChild(el('details',{},[el('summary',{text:tx('models.rawAll')}),el('pre',{style:'white-space:pre-wrap',text:CHK.raw})]));
  (into||pane).appendChild(box)}

 function drawAnim(){var P=pane;
  P.appendChild(el('div',{blk:'anim.title'},[el('h3',{text:tx('models.anim.title',{t:SET.target})})]));
  var a=((SET.groups||{}).animations)||[];
  if(!a.length){P.appendChild(el('div',{class:'hint',blk:'anim.files',text:tx('models.anim.none')}));return}
  var fl=el('div',{blk:'anim.files','data-blkname':nm('animFiles')});P.appendChild(fl);
  a.forEach(function(f){fl.appendChild(fileRow(f))});
  var why=openWhy();
  var list=el('div',{blk:'anim.ext.list','data-blkname':nm('soeditBtns')});
  var fold=el('details',{style:'margin-top:8px',blk:'anim.ext',box:'col'},[el('summary',{text:tx('models.ext.title')}),el('div',{class:'hint',blk:'anim.ext.hint',text:tx('models.anim.hint')}),list]);
  a.forEach(function(f){var w=why||(f.inMod?'':tx('models.why.notStaged'));
   var b=el('button',{type:'button',text:tx('models.open'),title:w,onclick:function(){doOpen(f.rel)}});b.disabled=!!w;
   list.appendChild(el('div',{class:'row'},[el('code',{text:f.rel}),b]))});
  if(why)fold.appendChild(el('div',{class:'hint',blk:'anim.ext.why',text:why}));
  P.appendChild(fold)}

 drawSet();
 return {
  refresh:function(){if(S.cur!=='models')return;if(!SE)locate();
   // the model list of this game and mod is started now (once per game and mod), so the first search does not wait for it
   var wk=(typeof curGame==='function'&&curGame()?curGame().id:'')+'|'+(S.mod||'');if(wk!==WARM){WARM=wk;api('/api/x/models/warm',{mod:S.mod||null},{job:false}).catch(function(){})}
   if(modNow!==S.mod){modNow=S.mod;if(target&&S.mod){SET=null;CHK=null;stageCall(true)}}
   if(SKC)SKC.stale();
   openDoc()},
  focus:function(){qIn.focus()},
  // pick(name, o): o = {sub, sel, ply} from the Editor's file viewers (ext view, kind model): once the document is open, switch to
  // the sub-tab and select (D.go), and show that mesh on the Mesh sub-tab (plyWant). name may be a game key (resource/...): read only.
  // o.variant: the texture variant the model is first drawn with (the Units page's "Open in Models"; '' = the plain textures)
  pick:function(name,o){lSeq++;FOLD=null;foldBar.hidden=true;qIn.value=String(name||'');clear(hits);hitSay.textContent='';modNow=S.mod;WANTV=o&&o.variant!=null?{t:String(name||''),v:String(o.variant)}:null;choose(String(name||''));
   if(!o)return;var M=EXT_SCREENS.models,Dn=M.doc;
   Promise.resolve(Dn&&Dn.opening).catch(function(){}).then(function(){if(o.ply&&M.plyWant)M.plyWant(o.ply);if(Dn&&Dn.go)Dn.go(o.sub||'model',o.sel||null);else if(o.sub&&tabBtn[o.sub])tabBtn[o.sub].click()})}
 }};
EXT_SCREENS.models.subs={};EXT_SCREENS.models.parts={};
// Browse on the boxes of the open model (sub/*.client.js; searchKit browse spec): the picker opens on the game data (its paks and loose
// files with the mod on top) at the folder of the open model's .mdl. dir(D) = that folder ('resource/...', D.mdl); key(path, entry) =
// the picked file's game key 'resource/...' (a disk pick: its path inside the mod folder, '' outside it); rel(D, key) = that key as the
// model writes it, from its own folder (name, sub/name, ../name); name(key) = the file name; stem(key) = without its extension;
// tex(D, key) = a texture as a material names it ($/ = texture/common, / = the resource root, else from the model's folder)
EXT_SCREENS.models.pickAt=(function(){
 var fw=function(p){return String(p||'').replace(/\\/g,'/')};
 var dir=function(D){var k=fw(D&&D.mdl),i=k.lastIndexOf('/');return i<0?'':k.slice(0,i)};
 var name=function(k){k=fw(k);return k.slice(k.lastIndexOf('/')+1)};
 var key=function(p,e){p=fw(p);if(e&&e.view==='disk'){var m=fw(typeof S!=='undefined'&&S&&S.mod).replace(/\/+$/,'');return m&&p.toLowerCase().indexOf(m.toLowerCase()+'/')===0?p.slice(m.length+1):''}
  return fw(e&&e.key)||('resource/'+p.replace(/^\/+/,'').replace(/^resource\//i,''))};
 var under=function(d,k){return d&&k.toLowerCase().indexOf(d.toLowerCase()+'/')===0};
 var rel=function(D,k){k=fw(k);if(!k)return '';var d=dir(D);if(under(d,k))return k.slice(d.length+1);
  var a=d?d.split('/'):[],b=k.split('/'),n=0;while(n<a.length&&n<b.length-1&&a[n].toLowerCase()===b[n].toLowerCase())n++;
  var up='';for(var i=n;i<a.length;i++)up+='../';return up+b.slice(n).join('/')};
 var tex=function(D,k){k=fw(k);if(!k)return '';var r=k.replace(/^resource\//i,''),d=dir(D);
  if(/^texture\/common\//i.test(r))return '$/'+r.slice('texture/common/'.length);if(under(d,k))return k.slice(d.length+1);return '/'+r};
 return {dir:dir,key:key,rel:rel,name:name,stem:function(k){return name(k).replace(/\.[^.\/]*$/,'')},tex:tex,
  TEX:['dds','tga','ebm','bmp','tex','jpg','png']}})();
// EXT_SCREENS.models.redo(c, pre, fn) (sub/README.md "Blocks"): draws the container block c again. Its own children (plain ones and
// blocks whose id starts with pre) go, a block the user moved into c from elsewhere stays; fn() draws (returns its result). Then a
// block of ours the user moved out of c that fn no longer drew is dropped (blkDrop), and the profile is applied, so a moved block
// keeps its place and no id is there twice. Without a screen root (c not on the page yet, a part test) it only clears and draws.
EXT_SCREENS.models.redo=function(c,pre,fn){
 function kids(n){return Array.prototype.slice.call((n&&(n.children||n.childNodes))||[])}
 function idOf(n){return n&&n.getAttribute?n.getAttribute('data-blk'):null}
 function ids(n,o){kids(n).forEach(function(k){var i=idOf(k);if(i!=null)o.push(i);ids(k,o)});return o}
 kids(c).forEach(function(k){var i=idOf(k);if(i==null||i.indexOf(pre)===0)c.removeChild(k)});
 var r=fn(),R=c;while(R&&!(R.getAttribute&&R.getAttribute('data-blkroot')!=null))R=R.parentNode;
 if(R&&typeof blkDrop==='function'){var now=ids(c,[]),gone=ids(R,[]).filter(function(i){return i.indexOf(pre)===0&&now.indexOf(i)<0});
  if(gone.length)blkDrop(R,gone);if(typeof blkApply==='function')blkApply(R)}
 return r};
// EXT_SCREENS.models.blockify(node, id) (sub/README.md "Blocks"): puts what a part drew into blocks after the draw. node is a container
// block (its plain children become blocks id.<n>: a row or div a leaf, a section (a div led by a heading) a container, a heading,
// table, label or text wrapped in a leaf) or a leaf. A leaf whose children hold labelled controls side by side becomes a wrapping row
// of leaves, one per field; a field (a text then its control(s) and unit, or a label) is built as the page's fld does
// (div.fld > label.f > span.n + control + after), so its text stays inside its leaf. Ids are positional within code-built rows.
EXT_SCREENS.models.blockify=(function(){
 var CTL={INPUT:1,SELECT:1,TEXTAREA:1},WRAP={H1:1,H2:1,H3:1,H4:1,H5:1,TABLE:1,LABEL:1,PRE:1,UL:1,OL:1,A:1,BUTTON:1,INPUT:1,SELECT:1,TEXTAREA:1,CANVAS:1,SPAN:1,B:1,CODE:1,SUMMARY:1};
 function tg(n){return String((n&&(n.tagName||n.tag))||'').toUpperCase()}
 function isText(n){return tg(n)==='#TEXT'||(n&&n.nodeType===3)}
 function kids(n){return Array.prototype.slice.call((n&&(n.childNodes||n.children))||[])}
 function isB(n){return !!(n&&n.getAttribute&&n.getAttribute('data-blk')!=null)}
 function isC(n){return isB(n)&&/(^| )blc( |$)/.test(n.className||'')}
 function mark(n,id,box){n.setAttribute('data-blk',id);n.className=(n.className?n.className+' ':'')+'blk'+(box?' blc box-'+box:'')}
 function txt(n){return String((n&&n.textContent)||'').replace(/\s+/g,' ').trim()}
 function hasCtl(n){return CTL[tg(n)]||kids(n).some(hasCtl)}
 function nextEl(a,i){for(var j=i+1;j<a.length;j++){if(isText(a[j])&&!txt(a[j]))continue;return a[j]}return null}
 // the fields and groups of one row's children
 function groups(a){var G=[],cur=null;
  a.forEach(function(n,i){var t=tg(n);if(isText(n)&&!txt(n))return;
   if(t==='LABEL'&&hasCtl(n)){G.push({lab:n});cur=null;return}
   var nx=nextEl(a,i);
   if((t==='SPAN'||isText(n))&&txt(n)&&!hasCtl(n)&&nx&&CTL[tg(nx)]){G.push(cur={f:1,name:txt(n),ctl:[],after:[]});return}
   if(CTL[t]&&cur&&cur.f&&!cur.after.length){cur.ctl.push(n);return}
   if(cur&&cur.f&&cur.ctl.length&&(t==='SPAN'||isText(n))&&!hasCtl(n)){cur.after.push(n);return}
   if(t==='BUTTON'){if(cur&&cur.b)cur.o.push(n);else G.push(cur={b:1,o:[n]});return}
   if(cur&&cur.o)cur.o.push(n);else G.push(cur={o:[n]})});
  return G.filter(function(g){return g.lab||g.o||(g.f&&g.ctl.length)})}
 function fldOf(g){var name,ctl=[],after=[],chk=false;
  if(g.lab){var seen=false;kids(g.lab).forEach(function(n){if(CTL[tg(n)]){ctl.push(n);seen=true;if(n.type==='checkbox'||(n.getAttribute&&n.getAttribute('type')==='checkbox'))chk=true}
    else if(txt(n)){if(!name&&tg(n)!=='BUTTON')name=txt(n);else if(seen)after.push(isText(n)?h('span',{text:' '+txt(n)}):n)}});name=name||''}   // a button or a live unit keeps its element
  else{name=g.name;ctl=g.ctl;after=g.after}
  return h('label',{'class':'f'+(chk?' chk':'')},[h('span',{'class':'n',text:name}),ctl.length===1?ctl[0]:h('span',{'class':'row'},ctl),after.length?h('span',{},after):h('span')])}
 // a leaf with labelled controls side by side -> a row of leaves; one lone field -> the fld shape in place
 function split(leaf){if(!isB(leaf)||isC(leaf))return;var a=kids(leaf),G=groups(a),F=G.filter(function(g){return g.f||g.lab}).length;
  if(!F||(G.length===1&&G[0].lab&&/(^| )f( |$)/.test(G[0].lab.className||'')))return;
  var id=leaf.getAttribute('data-blk');a.forEach(function(n){leaf.removeChild(n)});
  function leafOf(g){if(g.f||g.lab){var l=fldOf(g);return h('div',{'class':'fld','data-blkname':txt(l.firstChild)||null},[l])}return h('div',{'class':'row'},g.o)}
  if(G.length===1){leaf.className=(leaf.className||'')+' fld';leaf.appendChild(fldOf(G[0]));return}
  leaf.className=(leaf.className||'')+' blc box-row';
  G.forEach(function(g,k){var d=leafOf(g);mark(d,id+'.'+k);leaf.appendChild(d)})}
 function walk(c,id){var n=0;
  kids(c).forEach(function(k){if(isText(k)&&!txt(k))return;if(tg(k)==='SUMMARY')return;   // a fold keeps its summary as its caption
   if(/(^| )viewer3d( |$)/.test(k.className||''))return;   // the 3D view keeps its own bars
   if(isB(k)){if(isC(k))walk(k,k.getAttribute('data-blk'));else split(k);return}
   var kid=id+'.'+(n++),t=tg(k);
   if(t==='DIV'&&!/(^| )row( |$)/.test(k.className||'')&&kids(k).length>1&&/^H[1-6]$/.test(tg(kids(k)[0]))){mark(k,kid,'col');walk(k,kid);return}
   if(WRAP[t]||isText(k)){var w=h('div',{});c.insertBefore(w,k);c.removeChild(k);w.appendChild(k);mark(w,kid);split(w);return}
   mark(k,kid);split(k)})}
 return function(node,id){if(!node)return node;if(isC(node))walk(node,id||node.getAttribute('data-blk'));else if(isB(node))split(node);return node}})();
`;
