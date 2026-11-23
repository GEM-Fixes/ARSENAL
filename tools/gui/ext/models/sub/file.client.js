// Models page, Files part (rows FILE, PREF, MISC of tools/soedit/parity.md): the "Files" sub-tab (status line, save, save as,
// save a copy, revert, check before save, the file list with origin and changed marks, import by path, game path or drag and drop,
// remove, the text view of the .mdl at the selected bone with "Open in Editor", export as folder or zip, bone cut/copy/paste,
// the model header, preferences, keys, about) and a "Start" card at the foot of the page (recent models, reopen last, new model),
// which shows even before a model is picked. Changes go through the core's page object EXT_SCREENS.models.doc (D.op, D.state,
// D.save); disk work through file.server.js. Preferences live in LS under models.pref.<name> (kept in the settings file) and are
// offered to other parts as EXT_SCREENS.models.prefs.get(name) / .on(fn). Other parts may add rows to the key list by pushing
// { keys, what } (plain words) to EXT_SCREENS.models.keys.
// Page rules: no backtick, no dollar-brace, no innerHTML; DOM through h(); text through tx(); no new global names.
// Author: Imperator_Aug (ARSENAL, ia-76d92b96)
module.exports = String.raw`
(function(){
 var M=EXT_SCREENS.models;
 // ---------- preferences: [name, type, default, extra] ----------
 var PREFS=[['author','text',''],['stamp','bool',false],['gemi','bool',false],['backup','bool',true],['confirmSave','bool',true],['confirmRemove','bool',true],
  ['autosave','num',0,{min:0,max:120}],['recentMax','num',10,{min:1,max:50}],['newFolder','text','entity/props'],['exportFolder','text','export'],
  ['units','choice','engine',{values:['engine','m']}],['grid','num',20,{min:1,max:2000}],['snapMove','num',1,{min:0,max:1000}],['snapTurn','num',15,{min:0,max:180}],['fov','num',60,{min:20,max:120}]];
 var LIS=[];
 function pdef(n){var d=null;PREFS.forEach(function(p){if(p[0]===n)d=p[2]});return d}
 function pget(n){var v=LS.get('models.pref.'+n,pdef(n));return v==null?pdef(n):v}
 function pset(n,v){LS.set('models.pref.'+n,v);LIS.forEach(function(f){try{f(n,v)}catch(e){}})}
 M.prefs={get:pget,set:pset,on:function(f){if(typeof f==='function')LIS.push(f)},names:function(){return PREFS.map(function(p){return p[0]})}};
 M.keys=M.keys||[];
 // Ctrl+S is the core bar's (doc.client pushes its row); the rest are this part's
 var KEYS=[['Ctrl+Shift+S','saveAs'],['F2','keys'],['Ctrl+C','copy'],['Ctrl+X','cut'],['Ctrl+V','paste']];

 var PF='models.file.';function tf(k,p){return tx(PF+k,p)}
 function D(){return EXT_SCREENS.models.doc||null}
 function hasDoc(){var d=D();return !!(d&&d.id)}
 function clr(n){while(n&&n.firstChild)n.removeChild(n.firstChild)}
 function sayIn(box,cls,t){if(!box)return;box.className=cls;box.textContent=t}
 function errOf(e){return (e&&e.message)||String(e||'')}
 function ask(q){try{if(typeof window!=='undefined'&&window.confirm)return window.confirm(q)}catch(e){}return true}
 function live(n){return !!n&&n.isConnected!==false}
 function dirOf(k){k=String(k||'');return k.slice(0,k.lastIndexOf('/')+1)}
 function baseOf(k){k=String(k||'');return k.slice(k.lastIndexOf('/')+1)}
 function stemOf(k){return baseOf(k).replace(/\.[^.]*$/,'')}
 function shortRel(k){return String(k||'').replace(/^resource\//,'')}
 function b64(ab){var u=new Uint8Array(ab),s='',i;for(i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));return btoa(s)}
 function ok(j){if(!j||j.ok===false)throw new Error((j&&j.error)||tx('models.file.failed'));return j}
 // blocks (sub/README.md "Blocks"): bl(id,kids,a) a leaf 'file.<id>' (or '<id>' when it starts with '@'), bc(...) a container
 function bid(id){return id.charAt(0)==='@'?id.slice(1):'file.'+id}
 function bl(id,kids,a){a=a||{};a.blk=bid(id);return h('div',a,kids)}
 function bc(id,kids,box,a){a=a||{};a.blk=bid(id);a.box=box||'col';return h('div',a,kids)}
 function fcard(id,title){return bc(id,[bl(id+'.title',[h('h3',{text:title})])],'col',{class:'card',style:'margin-top:8px','data-blkname':title})}
 // ff: a field leaf in the page's fld shape (div.fld > label.f > span.n + control + span), chk a tick box
 function ff(id,t,ctl,chk){return h('div',{class:'fld',blk:bid(id),'data-blkname':t},[h('label',{class:'f'+(chk?' chk':'')},[h('span',{class:'n',text:t}),ctl,h('span')])])}
 function lbl(t,input){return h('label',{class:'row'},[h('span',{text:t}),input])}
 function btn(key,fn,cls){return h('button',{type:'button',class:cls||'',text:tf(''+key),title:tf('tip.'+key),onclick:fn})}

 // ---------- recent models (FILE-02, FILE-03, PREF-10) ----------
 function recent(){var a=LS.get('models.recent',[]);return Array.isArray(a)?a:[]}
 function addRecent(target,mod){if(!target)return;var a=recent().filter(function(r){return !(r.target===target&&r.mod===mod)});
  a.unshift({target:target,mod:mod||'',at:new Date().toISOString()});LS.set('models.recent',a.slice(0,Math.max(1,+pget('recentMax')||10)))}
 function openRecent(r){if(!r)return;
  if(r.mod&&r.mod!==S.mod&&typeof setMod==='function'){try{setMod(r.mod)}catch(e){}}
  if(S.screens&&S.screens.models&&S.screens.models.pick)S.screens.models.pick(r.target)}

 var ST={ctx:null,box:null,start:null,clip:null,clipFrom:'',textRel:null,check:null,lint:null,savedAt:null,autoAt:null,hooked:null,timer:null,dlg:null};
 // one listener added at load time (the core keeps those; listeners added while the page draws are dropped at the next draw)
 function hook(){var d=D();if(!d||!d.on||ST.hooked===d)return;ST.hooked=d;
  d.on(function(ev){if(!ev)return;
   if(ev.type==='open'){addRecent(d.target||d.mdl||'',S.mod);ST.check=null;ST.lint=null;ST.textRel=null}
   if(ev.type==='saved'){ST.savedAt=new Date()}
   if(ev.type==='change'||ev.type==='open'||ev.type==='saved'){ST.check=null;if(live(ST.box))draw()}
   if(ev.type==='select'&&live(ST.box))drawText()});
  // run by the bar's Save (and Ctrl+S) just before the files are written: full matrices, then the header stamp
  if(d.beforeSave)d.beforeSave(preSave)}
 function preSave(){var d=D(),p=Promise.resolve();if(!hasDoc())return p;
  if(pget('gemi'))p=p.then(function(){return d.op('file.fullMatrices',{})});
  if(pget('stamp')){if(String(pget('author')||'').trim())p=p.then(function(){return d.op('file.stamp',{author:pget('author')})});else toast(tx('models.file.noAuthor'))}
  return p}
 function startTimer(){if(ST.timer||typeof setInterval!=='function')return;ST.timer=setInterval(autosave,60000)}
 function autosave(){var m=+pget('autosave')||0,d=D();if(!m||!hasDoc()||!S.mod)return;
  if(ST.autoAt&&Date.now()-ST.autoAt.getTime()<m*60000)return;
  d.state('file.pack',{changed:true}).then(function(p){if(!p||!(p.files||[]).length)return;
   return api('/api/x/models/file/autosave',{mod:S.mod,files:p.files},{job:false}).then(ok).then(function(){ST.autoAt=new Date();if(live(ST.box))drawStatus()})}).catch(function(){})}

 // ---------- the Files sub-tab ----------
 hook();
 M.subs.file=function(ctx){ST.ctx=ctx;startTimer();
  ST.box=bc('@file',[],'col',{'data-blkname':tx('models.sub.file')});ctx.body.appendChild(ST.box);draw()};
 var P={};   // parts of the drawn tab: status, msg, text, check
 function draw(){var box=ST.box;if(!box)return;clr(box);P={};
  P.status=bl('status',[],{class:'hint',role:'status','data-blkname':tx('models.file.blk.status')});P.msg=h('div',{class:'hint',role:'status'});
  box.appendChild(bl('title',[h('h3',{text:tx('models.sub.file')})]));box.appendChild(P.status);box.appendChild(bl('msg',[P.msg],{'data-blkname':tx('models.file.blk.msg')}));
  if(!hasDoc()){box.appendChild(bl('nodoc',[],{class:'hint',text:tx(D()?'models.file.noDoc':'models.file.noCore')}));drawStatus();box.appendChild(cardPrefs());box.appendChild(cardKeys());box.appendChild(cardAbout());return}
  var d=D();P.list=bl('files.list',[],{'data-blkname':tx('models.file.listTitle')});P.save=h('div');P.text=bl('text.body',[],{'data-blkname':tx('models.file.textTitle')});P.check=bl('check',[],{'data-blkname':tx('models.file.blk.check')});
  box.appendChild(cardSave());box.appendChild(P.check);box.appendChild(cardFiles());box.appendChild(cardText());box.appendChild(cardClip());box.appendChild(cardExport());
  box.appendChild(cardPrefs());box.appendChild(cardKeys());box.appendChild(cardAbout());
  d.state('file.list',{}).then(function(L){P.L=L;drawStatus();drawList();drawText()}).catch(function(e){sayIn(P.msg,'err',errOf(e))});
  d.state('file.info',{}).then(drawHead).catch(function(){});
  if(ST.check)drawCheck()}
 // status line (MISC-04)
 function drawStatus(){if(!P.status)return;var L=P.L,parts=[];
  if(L){parts.push(tx('models.file.st.model',{m:shortRel(L.mdl)}));parts.push(tx('models.file.st.files',{n:L.files.length,c:L.changed}))}
  else if(!hasDoc())parts.push(tx('models.file.st.none'));
  if(ST.savedAt)parts.push(tx('models.file.st.saved',{t:ST.savedAt.toLocaleTimeString()}));
  if(ST.autoAt)parts.push(tx('models.file.st.draft',{t:ST.autoAt.toLocaleTimeString()}));
  parts.push(tx('models.file.st.keys'));
  P.status.textContent=parts.join('   ')}

 // ---------- save, save as, copy, revert, check (FILE-04..09) ----------
 function cardSave(){var c=fcard('save',tx('models.file.saveTitle'));
  c.appendChild(bl('save.btns',[btn('save',doSave,'primary'),btn('check',doCheck),btn('revertAll',doRevertAll),btn('gemiNow',doGemi)],{class:'row'}));
  var nm=h('input',{type:'text',autocomplete:'off',placeholder:tx('models.file.newName'),'aria-label':tx('models.file.newName'),style:'min-width:10em'});
  var fo=h('input',{type:'text',autocomplete:'off',placeholder:tx('models.file.newFolderPh'),'aria-label':tx('models.file.newFolder'),style:'flex:1;min-width:14em'});
  P.saveName=nm;
  var asBtn=btn('saveAs',function(){doCopy(nm.value,fo.value,true)}),cpBtn=btn('saveCopy',function(){doCopy(nm.value,fo.value,false)});
  c.appendChild(bc('save.as',[bl('save.as.name',[nm],{'data-blkname':tx('models.file.newName')}),bl('save.as.folder',[fo],{'data-blkname':tx('models.file.newFolder')}),bl('save.as.btns',[asBtn,cpBtn],{class:'row'})],'row',{class:'row','data-blkname':tx('models.file.blk.saveAs')}));
  c.appendChild(bl('save.hint',[],{class:'hint',text:tx('models.file.saveAsHint')}));
  P.head=bl('save.head',[],{class:'hint','data-blkname':tx('models.file.blk.head')});c.appendChild(P.head);
  return c}
 function drawHead(info){if(!P.head||!info)return;clr(P.head);var f=info.fields||{},rows=[];
  ['createdBy','exportedBy','plyBy','volBy','date','file','rebuildBy','lastBuild'].forEach(function(k){if(f[k])rows.push(tf('head.'+k)+': '+f[k])});
  P.head.textContent=rows.length?tx('models.file.head.title')+'  '+rows.join('   '):''}
 // Save: the core bar's flow when there is one (the list of files, the file checks, the backup in .arsenal/model-edit/backup, preSave)
 function doSave(){var d=D();if(!hasDoc())return;
  if(typeof d.askSave==='function'){sayIn(P.msg,'hint',tx('models.file.seeBar'));return d.askSave()}
  sayIn(P.msg,'hint',tx('models.file.saving'));
  d.save(true).then(function(dry){var w=(dry&&dry.writes)||[];
   if(!w.length){sayIn(P.msg,'hint',tx('models.file.nothing'));return}
   if(pget('confirmSave')&&!ask(tx('models.file.confirmSave',{n:w.length,list:w.map(function(x){return shortRel(x.rel)}).join(', ')}))){sayIn(P.msg,'hint',tx('models.file.notSaved'));return}
   return preSave().then(function(){return d.save({backup:!!pget('backup')})}).then(function(r){ST.savedAt=new Date();
    var n=((r&&r.writes)||[]).length,ref=(r&&r.refused)||[];
    sayIn(P.msg,ref.length?'err':'hint',tx('models.file.saved',{n:n})+(ref.length?' '+tx('models.file.refused',{list:ref.map(function(x){return typeof x==='string'?x:(x.rel||'')+' '+(x.why||x.reason||'')}).join('; ')}):''));
    addRecent(d.target||d.mdl,S.mod);drawStatus()})
  }).catch(function(e){sayIn(P.msg,'err',errOf(e))})}
 function doCopy(name,folder,open){var d=D();if(!hasDoc())return;name=String(name||'').trim();
  if(!name){sayIn(P.msg,'err',tx('models.file.needName'));return}
  if(!S.mod){sayIn(P.msg,'err',tx('models.file.needMod'));return}
  sayIn(P.msg,'hint',tx('models.file.writing'));
  d.state('file.copyPlan',{name:name,folder:String(folder||'').trim()||null}).then(function(plan){
   return api('/api/x/models/file/write',{mod:S.mod,files:plan.files},{what:tx('models.file.job.docSave')}).then(ok).then(function(j){
    sayIn(P.msg,'hint',tx(open?'models.file.savedAs':'models.file.copied',{n:j.written.length,m:shortRel(plan.mdl)}));
    if(open&&j.target){addRecent(j.target,S.mod);if(S.screens&&S.screens.models&&S.screens.models.pick)S.screens.models.pick(j.target)}})
  }).catch(function(e){sayIn(P.msg,'err',errOf(e))})}
 function doRevertAll(){var d=D();if(!hasDoc())return;if(!ask(tx('models.file.confirmRevert')))return;
  d.op('file.revert',{}).then(function(r){sayIn(P.msg,'hint',tx('models.file.reverted',{n:((r.info||{}).reverted||[]).length}))}).catch(function(e){sayIn(P.msg,'err',errOf(e))})}
 function doGemi(){var d=D();if(!hasDoc())return;
  d.op('file.fullMatrices',{}).then(function(r){var i=r.info||{};sayIn(P.msg,'hint',tx('models.file.gemiDone',{n:(i.done||[]).length,s:(i.skipped||[]).length}))}).catch(function(e){sayIn(P.msg,'err',errOf(e))})}
 // check before save: the document's own check, then binhdr / expcheck on the changed files
 var CODES=['PATH','MDL_ERROR','PLY_ERROR','VOL_ERROR','ANM_ERROR','NO_SKELETON','VOLUME_NO_BONE','REF_MISSING','REF_DISK_PATH','MDL_KEYWORD_LOST','MDL_BLOCK_LOST','MDL_COMMENTS_DROPPED','WARN_ANM_VERSION_CHANGED','WARN_PLY_SUBM_TO_MESH'];
 function doCheck(){var d=D();if(!hasDoc())return;sayIn(P.msg,'hint',tx('models.file.checking'));ST.lint=null;
  d.state('file.check',{}).then(function(c){ST.check=c;drawCheck();sayIn(P.msg,'hint','');
   if(!S.mod)return;
   return d.state('file.pack',{changed:true}).then(function(p){if(!(p.files||[]).length)return;
    return api('/api/x/models/file/lint',{mod:S.mod,files:p.files},{what:tx('models.file.job.lint')}).then(ok).then(function(j){ST.lint=j;drawCheck()})})
  }).catch(function(e){sayIn(P.msg,'err',errOf(e))})}
 function drawCheck(){var box=P.check;if(!box)return;clr(box);var c=ST.check;if(!c)return;
  var card=h('div',{class:'card',style:'margin-top:8px'},[h('h3',{text:tx('models.file.checkTitle')})]);box.appendChild(card);
  var fs=c.findings||[],lf=(ST.lint&&ST.lint.findings)||[];
  if(!fs.length&&!lf.length)card.appendChild(h('div',{text:tx('models.file.clean')}));
  var ul=h('ul');card.appendChild(ul);
  fs.forEach(function(f){var key=CODES.indexOf(f.code)>=0?'models.file.code.'+f.code:'models.file.code.other';
   ul.appendChild(h('li',{},[h('span',{text:tx(key,{msg:f.msg,file:shortRel(f.rel)})+(f.line?' '+tx('models.file.atLine',{n:f.line}):'')}),
    h('details',{},[h('summary',{text:tx('models.file.details')}),h('code',{text:f.rel+(f.line?':'+f.line:'')+' '+f.code+' '+f.msg})])]))});
  lf.forEach(function(f){ul.appendChild(h('li',{},[h('span',{text:tx('models.file.code.lint',{msg:f.msg,file:shortRel(f.file)})}),
   h('details',{},[h('summary',{text:tx('models.file.details')}),h('code',{text:f.file+(f.line?':'+f.line:'')+' '+f.code})])]))});
  if(ST.lint&&(ST.lint.ran||[]).some(function(r){return r.code==='LINTER_FAILED'}))card.appendChild(h('div',{class:'hint',text:tx('models.file.lintFailed')}))}

 // ---------- the file list, import, remove (FILE-16, FILE-17 built) ----------
 function cardFiles(){var c=fcard('files',tx('models.file.listTitle'));
  c.appendChild(bl('files.hint',[],{class:'hint',text:tx('models.file.dropHint')}));
  c.appendChild(P.list);
  var from=h('input',{type:'text',autocomplete:'off',placeholder:tx('models.file.fromPh'),'aria-label':tx('models.file.from'),style:'flex:1;min-width:16em'});
  var to=h('input',{type:'text',autocomplete:'off',placeholder:tx('models.file.toPh'),'aria-label':tx('models.file.to'),style:'flex:1;min-width:14em'});
  var rep=h('input',{type:'checkbox','aria-label':tx('models.file.replace')});
  // the source box (searchKit, tools/gui/README.md): index = entries of the disk folder typed so far (one /api/ls listing
  // per folder, kept; nothing asked for an empty box); Browse = the shared file picker on the disk at the folder of the box's path (else
  // the mod folder), the path goes into the box; history key models.file.from
  var LSD={},fromBox=typeof searchKit!=='function'?null:searchKit(from,{key:'models.file.from',
   browse:{mode:'file',view:'disk',start:function(){var p=from.value.trim().replace(/[\\/]+$/,'');if(!/^([a-zA-Z]:|[\\/])/.test(p))return S.mod||'';return /\.[a-zA-Z0-9]{1,5}$/.test(p)?p.replace(/[\\/][^\\/]*$/,''):p}},
   onPick:function(v,it){from.value=v;if(it&&it.dir){try{from.focus();from.dispatchEvent(new Event('input',{bubbles:true}))}catch(e){}}},
   index:function(q,done){var m=/^(.*[\\/])([^\\/]*)$/.exec(q||'');if(!m){done([]);return}
    var dir=m[1],part=m[2].toLowerCase(),k=dir.toLowerCase();
    function out(j){var a=[];(j.entries||[]).forEach(function(e){if(!part||e.name.toLowerCase().indexOf(part)>=0)a.push({label:e.name+'/',value:dir+e.name+'/',dir:true})});
     (j.files||[]).forEach(function(f){if(!part||f.toLowerCase().indexOf(part)>=0)a.push({label:f,value:dir+f})});done(a.slice(0,60))}
    if(LSD[k]){if(LSD[k].then)LSD[k].then(out);else out(LSD[k]);return}
    LSD[k]=api('/api/ls?files=1&dir='+encodeURIComponent(dir),undefined,{what:tx('models.file.job.ls')}).then(function(j){LSD[k]=j;return j},function(){LSD[k]={entries:[],files:[]};return LSD[k]});LSD[k].then(out)}});
  var br=fromBox?null:btn('browse',function(){pick('file',from.value,function(p){from.value=p})});
  var im=btn('import',function(){doImport(from.value,to.value,rep.checked)});
  c.appendChild(bl('files.from',br?[from,br]:[fromBox.el],{class:'row','data-blkname':tx('models.file.from')}));
  c.appendChild(bc('files.to',[bl('files.to.place',[to],{'data-blkname':tx('models.file.to')}),ff('files.to.replace',tx('models.file.replace'),rep,true),bl('files.to.go',[im])],'row',{class:'row','data-blkname':tx('models.file.to')}));
  c.addEventListener('dragover',function(e){if(e.preventDefault)e.preventDefault()});
  c.addEventListener('drop',function(e){if(e.preventDefault)e.preventDefault();var fl=(e.dataTransfer&&e.dataTransfer.files)||[];for(var i=0;i<fl.length;i++)dropOne(fl[i])});
  return c}
 function drawList(){var box=P.list,L=P.L;if(!box||!L)return;clr(box);
  L.files.forEach(function(f){
   var tags=[h('span',{class:f.from==='game'?'badge':f.from==='new'?'badge mid':'badge good',text:tf('from.'+(f.from||'new'))})];
   if(f.dirty)tags.push(h('span',{class:'badge badx',text:tx('models.file.changed')}));
   if(!f.named&&f.kind!=='mdl'&&f.kind!=='def'&&f.kind!=='mtl'&&f.kind!=='other')tags.push(h('span',{class:'badge',title:tx('models.file.notNamedT'),text:tx('models.file.notNamed')}));
   var acts=[];
   if(/^(mdl|def|mtl)$/.test(f.kind))acts.push(h('button',{type:'button',class:'link',text:tx('models.file.view'),onclick:function(){ST.textRel=f.rel;drawText()}}));
   if(f.dirty)acts.push(h('button',{type:'button',class:'link',text:tx('models.file.revert'),onclick:function(){D().op('file.revert',{rel:f.rel}).catch(function(e){sayIn(P.msg,'err',errOf(e))})}}));
   if(f.kind!=='mdl')acts.push(h('button',{type:'button',class:'link',text:tx('models.file.remove'),onclick:function(){if(pget('confirmRemove')&&!ask(tx('models.file.confirmRemove',{f:shortRel(f.rel)})))return;
    D().op('file.remove',{rel:f.rel}).then(function(r){var n=((r.info||{}).refs||[]).length;sayIn(P.msg,n?'err':'hint',n?tx('models.file.removedNamed',{f:shortRel(f.rel),l:r.info.refs.join(', ')}):tx('models.file.removed',{f:shortRel(f.rel)}))}).catch(function(e){sayIn(P.msg,'err',errOf(e))})}}));
   box.appendChild(h('div',{class:'row'},[h('code',{text:shortRel(f.rel)}),h('span',{class:'hint',text:tf('kind.'+(f.kind||'other'))})].concat(tags,acts)))});
  if(!L.files.length)box.appendChild(h('div',{class:'hint',text:tx('models.file.empty')}))}
 function importBytes(rel,data,replace){var d=D();
  return d.op('file.import',{rel:rel,data:data,replace:!!replace}).then(function(r){var i=r.info||{};sayIn(P.msg,'hint',tx('models.file.imported',{f:shortRel(i.rel||rel),ref:i.ref||''}))})}
 function doImport(from,to,replace){if(!hasDoc())return;from=String(from||'').trim();if(!from){sayIn(P.msg,'err',tx('models.file.needFrom'));return}
  if(!S.mod){sayIn(P.msg,'err',tx('models.file.needMod'));return}
  sayIn(P.msg,'hint',tx('models.file.reading'));
  api('/api/x/models/file/source',{mod:S.mod,from:from},{what:tx('models.file.job.source')}).then(ok).then(function(j){
   var rel=String(to||'').trim()||(dirOf(D().mdl)+j.name);return importBytes(rel,j.data,replace)}).catch(function(e){sayIn(P.msg,'err',errOf(e))})}
 function dropOne(file){if(!hasDoc()||!file||typeof FileReader==='undefined')return;var r=new FileReader();
  r.onload=function(){importBytes(dirOf(D().mdl)+String(file.name||'').toLowerCase(),b64(r.result),false).catch(function(e){sayIn(P.msg,'err',errOf(e))})};
  r.onerror=function(){sayIn(P.msg,'err',tx('models.file.dropFail',{f:file.name}))};r.readAsArrayBuffer(file)}

 // ---------- text view of the .mdl at the selected bone, "Open in Editor" ----------
 function cardText(){var c=fcard('text',tx('models.file.textTitle'));c.appendChild(P.text);return c}
 function drawText(){var box=P.text,d=D();if(!box||!hasDoc())return;
  var sel=d.sel||{},rel=ST.textRel||d.mdl;
  d.state('file.text',{rel:rel,bone:rel===d.mdl?sel.bone:null,volume:rel===d.mdl&&!sel.bone?sel.volume:null}).then(function(j){clr(box);
   var lines=String(j.text||'').split(/\r?\n/),at=j.line||0;
   var ed=h('button',{type:'button',text:tx('models.file.openEditor'),title:tx('models.file.tip.openEditor'),onclick:function(){openEditor(j)}});
   box.appendChild(h('div',{class:'row'},[h('code',{text:shortRel(j.rel)}),h('span',{class:'hint',text:at?tx('models.file.lineOf',{n:at}):tx('models.file.readOnly')}),ed]));
   if(j.dirty)box.appendChild(h('div',{class:'hint',text:tx('models.file.editorSaved')}));
   var num=function(a,b){var o=[];for(var i=a;i<b;i++)o.push(String(i+1).padStart(5,' ')+'  '+lines[i]);return o.join('\n')};
   var pre=h('pre',{class:'scroll',style:'max-height:22em;overflow:auto;white-space:pre;background:var(--pre);color:var(--fg);border:1px solid var(--line);padding:4px'});
   if(at>0){pre.appendChild(document.createTextNode(num(0,at-1)+(at>1?'\n':'')));var mk=h('mark',{style:'background:var(--sel);color:var(--fg)',text:num(at-1,at)});pre.appendChild(mk);
    pre.appendChild(document.createTextNode((at<lines.length?'\n':'')+num(at,lines.length)));box.appendChild(pre);if(mk.scrollIntoView)try{mk.scrollIntoView({block:'center'})}catch(e){}}
   else{pre.textContent=num(0,lines.length);box.appendChild(pre)}
  }).catch(function(e){clr(box);box.appendChild(h('div',{class:'hint',text:errOf(e)}))})}
 function openEditor(j){var link=(j.from==='game'?'key:':'ide:')+(j.from==='game'?shortRel(j.rel):j.rel)+(j.line?':'+j.line:'');
  var done=false;try{done=typeof as2Link==='function'&&as2Link(link)}catch(e){done=false}
  if(!done)toast(tx('models.file.noEditor'))}

 // ---------- bone clipboard (MISC-13) ----------
 function cardClip(){var c=fcard('clip',tx('models.file.clipTitle')),d=D(),bone=(d.sel||{}).bone||null;
  c.appendChild(bl('clip.bone',[],{class:'hint',text:bone?tx('models.file.clipBone',{b:bone}):tx('models.file.clipPick')}));
  if(ST.clip)c.appendChild(bl('clip.has',[],{class:'hint',text:tx('models.file.clipHas',{b:ST.clipFrom})}));
  c.appendChild(bl('clip.btns',[btn('copy',clipCopy),btn('cut',clipCut),btn('paste',clipPaste)],{class:'row'}));
  return c}
 function selBone(){var d=D();var b=d&&d.sel&&d.sel.bone;if(!b)sayIn(P.msg,'err',tx('models.file.clipPick'));return b||null}
 function clipCopy(){var b=selBone();if(!b)return;D().state('file.clipCopy',{bone:b}).then(function(j){ST.clip=j.text;ST.clipFrom=j.bone;sayIn(P.msg,'hint',tx('models.file.copiedBone',{b:j.bone}));draw()}).catch(function(e){sayIn(P.msg,'err',errOf(e))})}
 function clipCut(){var b=selBone();if(!b)return;D().op('file.clipCut',{bone:b}).then(function(r){var i=r.info||{};ST.clip=i.text;ST.clipFrom=b;
  sayIn(P.msg,(i.orphans||[]).length?'err':'hint',tx('models.file.cutBone',{b:b})+((i.orphans||[]).length?' '+tx('models.file.orphans',{list:i.orphans.join(', ')}):''))}).catch(function(e){sayIn(P.msg,'err',errOf(e))})}
 function clipPaste(){var b=selBone();if(!b)return;if(!ST.clip){sayIn(P.msg,'err',tx('models.file.clipEmpty'));return}
  D().op('file.clipPaste',{parent:b,text:ST.clip}).then(function(r){var rn=(r.info||{}).renamed||[];
   sayIn(P.msg,'hint',tx('models.file.pasted',{b:b})+(rn.length?' '+tx('models.file.pasteRenamed',{list:rn.map(function(x){return x[0]+' > '+x[1]}).join(', ')}):''))}).catch(function(e){sayIn(P.msg,'err',errOf(e))})}

 // ---------- export as a folder or a zip inside the mod ----------
 function cardExport(){var c=fcard('export',tx('models.file.exportTitle')),d=D();
  var dest=h('input',{type:'text',autocomplete:'off','aria-label':tx('models.file.exportTo'),style:'flex:1;min-width:14em'});dest.value=String(pget('exportFolder')||'export').replace(/\/+$/,'')+'/'+stemOf(d.mdl);
  var z=h('input',{type:'checkbox','aria-label':tx('models.file.asZip')});
  var go=btn('export',function(){if(!S.mod){sayIn(P.msg,'err',tx('models.file.needMod'));return}sayIn(P.msg,'hint',tx('models.file.writing'));
   D().state('file.pack',{}).then(function(p){return api('/api/x/models/file/export',{mod:S.mod,dest:dest.value,zip:z.checked,files:p.files},{what:tx('models.file.job.export')}).then(ok)})
    .then(function(j){sayIn(P.msg,'hint',tx('models.file.exported',{n:j.written.length,p:j.path}))}).catch(function(e){sayIn(P.msg,'err',errOf(e))})});
  c.appendChild(bc('export.to',[ff('export.to.dest',tx('models.file.exportTo'),dest),ff('export.to.zip',tx('models.file.asZip'),z,true),bl('export.to.go',[go])],'row',{class:'row','data-blkname':tx('models.file.exportTo')}));
  c.appendChild(bl('export.hint',[],{class:'hint',text:tx('models.file.exportHint')}));
  return c}

 // ---------- preferences (PREF) ----------
 function cardPrefs(){var c=fcard('prefs',tx('models.file.prefTitle'));
  PREFS.forEach(function(p){var n=p[0],ty=p[1],x=p[3]||{},v=pget(n),inp;
   if(ty==='bool'){inp=h('input',{type:'checkbox','aria-label':tf('pref.'+n)});inp.checked=!!v;inp.addEventListener('change',function(){pset(n,!!inp.checked)})}
   else if(ty==='choice'){inp=h('select',{'aria-label':tf('pref.'+n)});x.values.forEach(function(o){var e=h('option',{value:o,text:tf('pref.'+n+'.'+o)});if(o===v)e.selected=true;inp.appendChild(e)});inp.addEventListener('change',function(){pset(n,inp.value)})}
   else if(ty==='num'){inp=h('input',{type:'number',min:String(x.min),max:String(x.max),style:'width:6em','aria-label':tf('pref.'+n)});inp.value=String(v);
    inp.addEventListener('change',function(){var k=Number(inp.value);if(!isFinite(k))k=pdef(n);k=Math.max(x.min,Math.min(x.max,k));inp.value=String(k);pset(n,k)})}
   else{inp=h('input',{type:'text',autocomplete:'off',style:'min-width:14em','aria-label':tf('pref.'+n)});inp.value=String(v==null?'':v);inp.addEventListener('change',function(){pset(n,inp.value.trim())})}
   c.appendChild(bl('prefs.'+n.toLowerCase(),[h('span',{text:tf('pref.'+n)}),inp,h('span',{class:'hint',text:tf('prefHint.'+n)})],{class:'row',title:tf('prefHint.'+n),'data-blkname':tf('pref.'+n)}))});
  if(!String(pget('author')||'').trim())api('/api/x/models/file/whoami',{},{job:false}).then(function(j){if(j&&j.user&&!String(pget('author')||'').trim())pset('author',j.user)}).catch(function(){});
  c.appendChild(bl('prefs.lang',[],{class:'hint',text:tx('models.file.pref.lang')}));
  c.appendChild(bl('prefs.where',[],{class:'hint',text:tx('models.file.pref.where')}));
  return c}

 // ---------- keys (MISC-01) and about (MISC-02) ----------
 // rows pushed by other parts: { keys, key (a lang key) | what (plain words), area }
 function keyRows(){var rows=KEYS.map(function(k){return [k[0],tf('key.'+k[1])]});
  (M.keys||[]).forEach(function(k){if(k&&k.keys&&(k.key||k.what))rows.push([String(k.keys),k.key?tx(String(k.key)):String(k.what)])});return rows}
 function keyTable(){var t=h('table');keyRows().forEach(function(r){t.appendChild(h('tr',{},[h('td',{},[h('kbd',{text:r[0]})]),h('td',{text:r[1]})]))});return t}
 function cardKeys(){var c=fcard('keys',tx('models.file.keysTitle'));c.appendChild(bl('keys.table',[keyTable()],{'data-blkname':tx('models.file.keysTitle')}));c.appendChild(bl('keys.hint',[],{class:'hint',text:tx('models.file.keysHint')}));return c}
 function showKeys(){if(typeof document==='undefined'||!document.body)return;if(ST.dlg&&ST.dlg.parentNode)ST.dlg.parentNode.removeChild(ST.dlg);
  var d=h('dialog',{'aria-label':tx('models.file.keysTitle')},[h('h3',{text:tx('models.file.keysTitle')}),keyTable(),h('div',{class:'row'},[h('button',{type:'button',text:tx('models.file.close'),onclick:function(){if(d.close)d.close()}})])]);
  ST.dlg=d;document.body.appendChild(d);if(d.showModal)d.showModal()}
 function cardAbout(){var c=fcard('about',tx('models.file.aboutTitle'));c.appendChild(bl('about.text',[],{text:tx('models.file.about')}));return c}

 // ---------- the Start card (always on the page): recent models, reopen last, new model (FILE-01..03) ----------
 var TPL=['empty','prop','vehicle'];
 function drawStart(){var c=ST.start;if(!c)return;clr(c);
  c.appendChild(bl('@start.title',[h('h3',{text:tx('models.file.startTitle')})]));
  var rs=recent();
  var last=h('button',{type:'button',text:rs[0]?tx('models.file.reopen',{m:baseOf(rs[0].target)}):tx('models.file.reopenNone'),title:tx('models.file.tip.reopen'),onclick:function(){openRecent(recent()[0])}});last.disabled=!rs.length;
  var row=bl('@start.recent',[last],{class:'row','data-blkname':tx('models.file.blk.recent')});
  rs.slice(1).forEach(function(r){row.appendChild(h('button',{type:'button',class:'link',text:baseOf(r.target),title:r.target+(r.mod?'  ('+r.mod+')':''),onclick:function(){openRecent(r)}}))});
  if(rs.length)row.appendChild(h('button',{type:'button',class:'link',text:tx('models.file.forget'),onclick:function(){LS.set('models.recent',[]);drawStart()}}));
  c.appendChild(row);
  c.appendChild(bl('@start.new',[h('b',{text:tx('models.file.newTitle')})],{style:'margin-top:6px'}));
  var fo=h('input',{type:'text',autocomplete:'off','aria-label':tx('models.file.newIn'),style:'flex:1;min-width:12em'});fo.value=String(pget('newFolder')||'');
  var nm=h('input',{type:'text',autocomplete:'off','aria-label':tx('models.file.newModelName'),placeholder:tx('models.file.newModelName'),style:'min-width:10em'});
  var tp=h('select',{'aria-label':tx('models.file.template')});TPL.forEach(function(t){tp.appendChild(h('option',{value:t,text:tf('tpl.'+t)}))});
  var note=bl('@start.note',[],{class:'hint',text:tx('models.file.tplNote.empty'),'data-blkname':tx('models.file.blk.tplNote')});tp.addEventListener('change',function(){note.textContent=tf('tplNote.'+tp.value)});
  var df=h('input',{type:'checkbox','aria-label':tx('models.file.withDef')});df.checked=true;
  var msg=h('div',{class:'hint',role:'status'});
  var go=h('button',{type:'button',class:'primary',text:tx('models.file.create'),title:tx('models.file.tip.create'),onclick:function(){
   var n=nm.value.trim();if(!n){sayIn(msg,'err',tx('models.file.needName'));return}if(!S.mod){sayIn(msg,'err',tx('models.file.needMod'));return}
   var p=fo.value.trim().replace(/[\\/]+$/,'');pset('newFolder',p);sayIn(msg,'hint',tx('models.file.writing'));
   api('/api/x/models/file/new',{mod:S.mod,path:(p?p+'/':'')+n,template:tp.value||'empty',def:df.checked,author:String(pget('author')||'')},{what:tx('models.file.job.new')}).then(ok).then(function(j){
    sayIn(msg,'hint',tx('models.file.made',{m:shortRel(j.mdl),n:j.files.length}));addRecent(j.target,S.mod);drawStart();
    if(S.screens&&S.screens.models&&S.screens.models.pick)S.screens.models.pick(j.target)}).catch(function(e){sayIn(msg,'err',errOf(e))})}});
  c.appendChild(bl('@start.where',[h('span',{text:tx('models.file.newIn')}),fo,nm],{class:'row'}));
  c.appendChild(bc('@start.make',[bl('@start.f.tpl',[h('span',{text:tx('models.file.template')}),tp],{class:'row'}),bl('@start.def',[h('label',{class:'row'},[df,h('span',{text:tx('models.file.withDef')})])]),bl('@start.go',[go])],'row',{class:'row','data-blkname':tx('models.file.blk.make')}));
  c.appendChild(note);c.appendChild(bl('@start.hint',[],{class:'hint',text:tx('models.file.newHint')}));c.appendChild(bl('@start.msg',[msg],{'data-blkname':tx('models.file.blk.msg')}))}

 // ---------- keys on the page (MISC-12: single keys never act while typing in a text box) ----------
 function typing(){var a=typeof document!=='undefined'&&document.activeElement;return !!(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName||''))||!!(a&&a.isContentEditable)}
 function textSelected(){try{var s=window.getSelection&&window.getSelection();return !!(s&&String(s).length)}catch(e){return false}}
 function onKey(e){if(!e||e.defaultPrevented||S.cur!=='models')return;var k=String(e.key||''),c=e.ctrlKey||e.metaKey;
  if(k==='F2'&&!c){showKeys();e.preventDefault();return}
  if(!c||!hasDoc())return;
  if((k==='s'||k==='S')&&e.shiftKey&&!e.altKey){e.preventDefault();if(P.saveName&&P.saveName.focus)P.saveName.focus();return}
  if(typing()||textSelected()||e.shiftKey||e.altKey)return;
  if(k==='c'&&(D().sel||{}).bone){e.preventDefault();clipCopy()}
  else if(k==='x'&&(D().sel||{}).bone){e.preventDefault();clipCut()}
  else if(k==='v'&&ST.clip&&(D().sel||{}).bone){e.preventDefault();clipPaste()}}

 // the Start card sits at the foot of the Models page, so a new model can be made before any model is picked
 var base=EXT_SCREENS.models,keysOn=false;
 var W=function(root){var r=base(root);ST.start=bc('@start',[],'col',{class:'card',style:'margin-top:10px','data-blkname':tx('models.file.startTitle')});root.appendChild(ST.start);drawStart();
  if(!keysOn&&typeof document!=='undefined'&&document.addEventListener){keysOn=true;document.addEventListener('keydown',onKey)}
  if(r&&typeof r.refresh==='function'){var rf=r.refresh;r.refresh=function(){var x=rf.apply(this,arguments);drawStart();return x}}
  return r};
 for(var k in base)if(Object.prototype.hasOwnProperty.call(base,k))W[k]=base[k];
 W._fileT={pget:pget,pset:pset,recent:recent,addRecent:addRecent,keyRows:keyRows,onKey:onKey,b64:b64,draw:draw,PREFS:PREFS,CODES:CODES,TPL:TPL,KEYS:KEYS};
 EXT_SCREENS.models=W;
})();
`;
