// Models page part `doc`: the page side of the editable model document (contract: tools/lib/model/edit/README.md "The page side").
// Sets EXT_SCREENS.models.doc = D: open, op, undo, redo, save, state, scene, dir, on, sel, select, hidden, setHidden; plus D.bar(root) (the
// bar above the sub-tabs: Undo, Redo, Save with a check that lists the files first and asks, the "changed, not saved" mark), the keys
// Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z and Ctrl+S on the Models page, and the warnings before leaving the page or the model with unsaved changes.
// Also EXT_SCREENS.models.go(subId, sel) (switch sub-tab and select), EXT_SCREENS.models.keys (rows for the F2 key list) and the key
// table that says which part of the page a key belongs to (KEYMAP below, written out in sub/README.md).
// Listeners added with D.on while the page draws its sub-tabs (D._begin .. D._end, called by ../client.js) are dropped at the next draw,
// so a part may add its listener each time it is drawn; listeners added at any other time stay. D.on returns a function that removes it.
// Page rules: no backtick, no dollar-brace, no innerHTML; DOM through h(); text through tx(); no new global names.
// Author: Imperator_Aug (ARSENAL, ia-bc1318be)
module.exports = String.raw`
(function(){
 var KNOWN=['WARN_ANM_VERSION_CHANGED','WARN_PLY_SUBM_TO_MESH','MDL_KEYWORD_LOST','MDL_BLOCK_LOST','MDL_COMMENTS_DROPPED'];
 var L=[],SC=[],PRE=[],seq=0,ROOT=null,BAR=null,GO=null;
 var M=EXT_SCREENS.models;
 var D={id:null,rev:0,files:[],mdl:null,mod:null,target:null,key:null,dirty:false,canUndo:false,canRedo:false,ops:[],problems:[],error:'',opening:null,
  sel:{bone:null,volume:null,anm:null,frame:0},hidden:{bones:[],volumes:[]},_drawing:false};
 // ---------- which part of the page a key belongs to (sub/README.md "Keys") ----------
 // The focused area's own handler runs first and marks the key as used (preventDefault). Page-wide handlers (this part, the Files
 // part) leave alone a key that is already used, and single keys never act while a text field has the focus.
 var KEYMAP={
  text:{what:'a text field',keys:[]},
  view:{what:'the 3D view',keys:['W','E','R','Q','F','A','1','3','7','4','5','F6','Esc','right button + W A S D Q E']},
  tree:{what:'the Skeleton tree',keys:['Up','Down','Left','Right','Home','End','Enter','F2','Delete','Menu']},
  anim:{what:'the Animation editor',keys:['Space','Left','Right','Up','Down','Home','End','K','I','Delete','Shift+Delete','Shift+D','[',']','PageUp','PageDown','Ctrl+A','Ctrl+C','Ctrl+V']},
  page:{what:'anywhere else on the Models page',keys:['Ctrl+Z','Ctrl+Y','Ctrl+Shift+Z','Ctrl+S','Ctrl+Shift+S','Ctrl+C','Ctrl+X','Ctrl+V','F2']}};
 function typing(a){if(!a)return false;var t=String(a.tagName||'').toUpperCase();return t==='INPUT'||t==='TEXTAREA'||t==='SELECT'||!!a.isContentEditable}
 // the area of an element: a text field, else the nearest [data-keys] holder (view, tree, anim), else the page
 function area(a){if(typing(a))return 'text';var n=a;while(n&&n.getAttribute){var k=n.getAttribute('data-keys');if(k&&KEYMAP[k])return k;n=n.parentNode}return 'page'}
 D.keymap=KEYMAP;D.area=function(a){return area(a===undefined&&typeof document!=='undefined'?document.activeElement:a)};
 M.keys=M.keys||[];
 [['Ctrl+Z','models.doc.key.undo'],['Ctrl+Y, Ctrl+Shift+Z','models.doc.key.redo'],['Ctrl+S','models.doc.key.save']].forEach(function(r){M.keys.push({keys:r[0],key:r[1],area:'page'})});

 function emit(ev){L.concat(SC).forEach(function(f){try{f(ev)}catch(e){if(typeof console!=='undefined')console.error(e)}});drawBar()}
 function take(j){if(!j)return;if(j.rev!=null)D.rev=j.rev;if(j.files)D.files=j.files;if(j.mdl)D.mdl=j.mdl;D.canUndo=!!j.canUndo;D.canRedo=!!j.canRedo;D.dirty=!!j.dirty}
 function reset(){D.id=null;D.rev=0;D.files=[];D.mdl=null;D.key=null;D.dirty=false;D.canUndo=false;D.canRedo=false;D.error='';D.sel={bone:null,volume:null,anm:null,frame:0};D.hidden={bones:[],volumes:[]}}
 function notOpen(){return Promise.reject(new Error(tx('models.doc.notOpen')))}
 // a preference of the Files part (EXT_SCREENS.models.prefs), or the default when that part is missing
 function pref(n,d){var P=EXT_SCREENS.models.prefs;if(!P||typeof P.get!=='function')return d;var v=P.get(n);return v==null?d:v}
 D.pref=pref;
 D.on=function(fn){var a=D._drawing?SC:L;a.push(fn);return function(){var i=a.indexOf(fn);if(i>=0)a.splice(i,1)}};
 D._begin=function(){SC.length=0;D._drawing=true};
 D._end=function(){D._drawing=false};
 // c = the page ctx ({mod, set:{target, mdl}}) or {mod, target | mdl}
 D.open=function(c){c=c||{};var mod=c.mod||'',set=c.set||{},target=c.target||set.target||'',mdl=c.mdl||'';
  if(!mod)return Promise.reject(new Error(tx('models.doc.needMod')));
  if(!target&&!mdl)return Promise.reject(new Error(tx('models.doc.notOpen')));
  var key=JSON.stringify([mod,mdl||target]);
  if(D.id&&D.key===key)return Promise.resolve(D);
  if(D.opening&&D.openKey===key)return D.opening;
  if(D.id&&!c.asked&&!D.confirmLeave())return Promise.resolve(D);   // keep the model with unsaved changes open (c.asked: the page asked already)
  if(D.id)D.close();
  reset();D.mod=mod;D.target=target||mdl;D.openKey=key;var my=++seq;drawBar();
  var body={mod:mod};if(mdl)body.mdl=mdl;else body.target=target;
  D.opening=api('/api/x/models/doc/open',body,{what:tx('models.doc.job.docOpen')}).then(function(j){if(my!==seq)return D;D.opening=null;
   D.id=j.doc;D.key=key;D.mdl=j.mdl;D.ops=j.ops||[];D.problems=j.problems||[];take(j);emit({type:'open'});return D})
   .catch(function(e){if(my===seq){D.opening=null;D.error=e.message;drawBar()}throw e});
  return D.opening};
 D.close=function(){var id=D.id;reset();++seq;D.opening=null;if(id){api('/api/x/models/doc/close',{doc:id},{what:tx('models.doc.job.doc')}).catch(function(){});emit({type:'close',doc:id})}else drawBar()};
 D.op=function(name,args){if(!D.id)return notOpen();
  return api('/api/x/models/doc/op',{doc:D.id,op:name,args:args||{}},{what:tx('models.doc.job.docOp')}).then(function(j){take(j);D.error='';emit({type:'change',rev:j.rev,changed:j.changed||[],info:j.info});return j})};
 function step(verb){if(!D.id)return notOpen();
  return api('/api/x/models/doc/'+verb,{doc:D.id},{what:tx('models.doc.job.docOp')}).then(function(j){take(j);if((j.changed||[]).length)emit({type:'change',rev:j.rev,changed:j.changed,info:null,undo:verb==='undo',redo:verb==='redo'});else drawBar();return j})}
 D.undo=function(){return step('undo')};
 D.redo=function(){return step('redo')};
 // D.save({ dry, force, backup, lint }) or the old D.save(dry, force)
 D.save=function(o,force){if(!D.id)return notOpen();o=o&&typeof o==='object'?o:{dry:!!o,force:!!force};
  return api('/api/x/models/doc/save',{doc:D.id,dry:!!o.dry,force:!!o.force,backup:!!o.backup,lint:!!o.lint},{what:tx(o.dry?'models.doc.job.docPlan':'models.doc.job.docSave')}).then(function(j){take(j);if(j.written)emit({type:'saved',writes:j.writes,backups:j.backups||[]});else drawBar();return j})};
 // fn() -> Promise | nothing, run before the files are written by the bar's Save (the Files part: stamp the header, full matrices)
 D.beforeSave=function(fn){if(typeof fn==='function'&&PRE.indexOf(fn)<0)PRE.push(fn);return function(){var i=PRE.indexOf(fn);if(i>=0)PRE.splice(i,1)}};
 D.state=function(what,query){if(!D.id)return notOpen();return api('/api/x/models/doc/state',{doc:D.id,what:what,query:query||{}},{what:tx('models.doc.job.doc')})};
 D.scene=function(q){if(!D.id)return notOpen();q=q||{};return api('/api/x/models/doc/scene',{doc:D.id,anm:q.anm||null,frame:q.frame||0,meshes:q.meshes!==false,lod:q.lod||0},{what:tx('models.doc.job.scene')})};
 // the files of the model's folder (default .anm) from the document, the mod and the game
 D.dir=function(q){if(!D.id)return notOpen();q=q||{};return api('/api/x/models/doc/dir',{doc:D.id,dir:q.dir||null,ext:q.ext||'.anm'},{what:tx('models.doc.job.ls')})};
 D.select=function(o){o=o||{};var s={};['bone','volume','anm','frame'].forEach(function(k){s[k]=k in o?o[k]:D.sel[k]});D.sel=s;emit({type:'select',sel:s})};
 // display only, never saved: bone paths and volume ids the 3D view leaves out
 D.setHidden=function(o){o=o||{};var a=function(x){return Array.isArray(x)?x.map(String):[]};D.hidden={bones:a(o.bones),volumes:a(o.volumes)};emit({type:'hidden',hidden:D.hidden})};
 // true when there is nothing unsaved or the user says to drop it
 D.confirmLeave=function(){if(!D.id||!D.dirty)return true;return typeof window!=='undefined'&&window.confirm?window.confirm(tx('models.doc.leave')):true};
 // switch the Models page to a sub-tab and select (sel as D.select); ../client.js sets the switch when the page is built
 D.go=function(sub,sel){if(sel)D.select(sel);if(GO)return GO(String(sub||''));return false};
 D._setGo=function(fn){GO=typeof fn==='function'?fn:null};
 M.go=function(sub,sel){return D.go(sub,sel)};

 // ---------- the bar ----------
 var B={};
 function drawBar(){if(!BAR)return;var on=!!D.id;
  B.undo.disabled=!on||!D.canUndo;B.redo.disabled=!on||!D.canRedo;B.save.disabled=!on||!D.dirty;
  // the mark's class (.badge, ../../../page.js) sets display, which beats the hidden attribute: hide it by its style too
  var mk=on&&D.dirty;B.mark.hidden=!mk;if(B.mark.style)B.mark.style.display=mk?'':'none';
  B.state.className=D.error?'err':'hint';
  B.state.textContent=D.error?D.error:D.opening?tx('models.doc.opening'):on?tx('models.doc.editing',{m:D.mdl||''}):D.mod?'':tx('models.doc.needMod');
  B.probs.hidden=!(on&&D.problems&&D.problems.length);
  B.probs.textContent=on&&D.problems&&D.problems.length?tx('models.doc.problems',{n:D.problems.length}):''}
 function lossText(f){return (KNOWN.indexOf(f.code)>=0?tx(['models.code',f.code].join('.')):tx('models.code.other')+' '+f.msg)+' ('+f.file+')'}
 // a binhdr or expcheck finding in plain words: the tool's own sentence without its [tool] tag, and the file
 function lintText(f){return String(f.msg||'').replace(/^\[(binhdr|expcheck)\]\s*/,'')+' ('+String(f.file||'').replace(/^resource\//,'')+(f.line?', '+tx('models.doc.line',{n:f.line}):'')+')'}
 function closePanel(){while(B.panel.firstChild)B.panel.removeChild(B.panel.firstChild);B.panel.hidden=true}
 function list(title,items,cls){var box=h('div',{style:'margin-top:4px'},[h('div',{class:cls||'',text:title})]);var ul=h('ul');
  items.forEach(function(t){ul.appendChild(h('li',{text:t}))});box.appendChild(ul);return box}
 function runPre(){var p=Promise.resolve();PRE.forEach(function(fn){p=p.then(function(){return fn()})});return p}
 function done(r){closePanel();B.say.textContent=tx('models.doc.saved',{n:(r.writes||[]).length+(r.removes||[]).length})+((r.backups||[]).length?' '+tx('models.doc.backedUp',{n:r.backups.length}):'');
  if(typeof toast==='function')toast(B.say.textContent)}
 // write now (after the list was shown, or straight away when the Ask before saving preference is off)
 function write(){B.say.textContent=tx('models.doc.writing');
  return runPre().then(function(){return D.save({backup:!!pref('backup',true)})}).then(function(r){if(r.written)done(r);else{B.say.textContent='';drawPanel(r)}return r})}
 // the bar's Save (also the Files part's Save button and Ctrl+S): check, list, ask, write
 function askSave(){if(!D.id)return Promise.resolve(null);closePanel();
  if(!pref('confirmSave',true))return write().catch(function(e){B.say.textContent=e.message});
  B.say.textContent=tx('models.doc.checking');
  return D.save({dry:true,lint:true,backup:!!pref('backup',true)}).then(function(j){B.say.textContent='';drawPanel(j);return j}).catch(function(e){B.say.textContent=e.message})}
 D.askSave=askSave;
 function drawPanel(j){closePanel();B.panel.hidden=false;var p=B.panel;
  var w=j.writes||[],rm=j.removes||[],rf=j.refused||[],nt=j.notes||[],ck=j.check||null,lost=(ck&&ck.findings)||[],lint=(ck&&ck.lint)||[],bk=j.backups||[];
  if(!w.length&&!rm.length&&!rf.length){p.appendChild(h('div',{text:tx('models.doc.nothing')}));p.appendChild(h('div',{class:'row'},[h('button',{type:'button',text:tx('models.doc.close'),onclick:closePanel})]));return}
  if(w.length)p.appendChild(list(tx('models.doc.willWrite',{m:D.mod||''}),w.map(function(x){return x.rel+' ('+tx(x.was==='new'?'models.doc.was.new':'models.doc.was.changed')+')'})));
  if(bk.length)p.appendChild(h('div',{class:'hint',text:tx('models.doc.willBackup',{n:bk.length})}));
  if(rm.length)p.appendChild(list(tx('models.doc.willMove'),rm.map(function(x){return x.rel})));
  if(nt.length)p.appendChild(list(tx('models.doc.notes'),nt,'hint'));
  if(rf.length)p.appendChild(list(tx('models.doc.refused'),rf.map(function(x){return (x.rel?x.rel+': ':'')+x.reason}),'err'));
  if(ck)p.appendChild(lost.length?list(tx('models.doc.lost',{n:lost.length}),lost.map(lossText)):h('div',{class:'hint',text:tx('models.doc.lostNone')}));
  if(ck&&ck.ran){p.appendChild(lint.length?list(tx('models.doc.lint',{n:lint.length}),lint.map(lintText)):h('div',{class:'hint',text:tx('models.doc.lintNone')}));
   if(ck.ran.some(function(r){return r.code==='LINTER_FAILED'}))p.appendChild(h('div',{class:'hint',text:tx('models.doc.lintFailed')}));
   if(ck.ran.some(function(r){return r.code==='LINTER_SKIPPED'}))p.appendChild(h('div',{class:'hint',text:tx('models.doc.lintSkipped')}))}
  var go=h('button',{type:'button',class:'primary',text:tx('models.doc.write'),onclick:function(){go.disabled=true;write().catch(function(e){go.disabled=false;B.say.textContent=e.message})}});
  go.disabled=!!rf.length;
  p.appendChild(h('div',{class:'row',style:'margin-top:6px'},[go,h('button',{type:'button',text:tx('models.doc.cancel'),onclick:closePanel})]))}
 function act(fn){return function(){B.say.textContent='';fn().catch(function(e){B.say.textContent=e.message})}}
 function onKey(e){if(typeof S==='undefined'||S.cur!=='models'||!D.id||!ROOT)return;
  if(e.defaultPrevented)return;
  if(!(e.ctrlKey||e.metaKey)||e.altKey)return;
  var a=typeof document!=='undefined'?document.activeElement:null,k=String(e.key||'').toLowerCase();
  if(a&&a!==document.body&&ROOT.contains&&!ROOT.contains(a))return;
  if(document.querySelector&&document.querySelector('dialog[open]'))return;
  // Ctrl+S saves from anywhere on the page, a text field too (the browser's own save is never wanted here)
  if(k==='s'&&!e.shiftKey){e.preventDefault();if(D.dirty)askSave();return}
  if(typing(a))return;
  if(k==='z'&&!e.shiftKey){e.preventDefault();if(D.canUndo)act(D.undo)()}
  else if(k==='y'||(k==='z'&&e.shiftKey)){e.preventDefault();if(D.canRedo)act(D.redo)()}}
 // leaving the page with unsaved changes: the browser's own question on close or reload; a click on another page tab asks first
 function onUnload(e){if(D.id&&D.dirty){e.preventDefault();e.returnValue='';return ''}}
 function onNav(e){if(typeof S==='undefined'||S.cur!=='models'||!D.id||!D.dirty)return;
  var b=e.target&&e.target.closest?e.target.closest('nav button,#games button'):null;
  if(!b||b.getAttribute('aria-selected')==='true')return;
  if(!window.confirm(tx('models.doc.leave'))){e.preventDefault();e.stopPropagation()}}
 var hooked=false;
 D.bar=function(root){ROOT=root||null;
  B.undo=h('button',{type:'button',text:tx('models.doc.undo'),title:tx('models.doc.undoTip'),onclick:act(D.undo)});
  B.redo=h('button',{type:'button',text:tx('models.doc.redo'),title:tx('models.doc.redoTip'),onclick:act(D.redo)});
  B.save=h('button',{type:'button',class:'primary',text:tx('models.doc.save'),title:tx('models.doc.saveTip'),onclick:function(){askSave()}});
  B.mark=h('span',{class:'badge',text:tx('models.doc.dirty'),role:'status'});
  B.state=h('span',{class:'hint'});B.say=h('span',{class:'hint','aria-live':'polite'});B.probs=h('div',{class:'hint'});
  B.panel=h('div',{class:'card',hidden:true,style:'margin:6px 0'});
  // blocks (sub/README.md "Blocks"): the bar is the container 'doc'; probs and panel are hidden and re-classed by drawBar: wrapped
  BAR=h('div',{style:'margin-bottom:6px',blk:'doc',box:'col','data-blkname':tx('models.doc.blk.bar')},[h('div',{class:'row',blk:'doc.btns','data-blkname':tx('models.doc.blk.btns')},[B.undo,B.redo,B.save,B.mark,B.state,B.say]),
   h('div',{blk:'doc.probs','data-blkname':tx('models.doc.blk.probs')},[B.probs]),h('div',{blk:'doc.panel','data-blkname':tx('models.doc.blk.panel')},[B.panel])]);
  if(!hooked&&typeof document!=='undefined'&&document.addEventListener){hooked=true;document.addEventListener('keydown',onKey);document.addEventListener('click',onNav,true);
   if(typeof window!=='undefined'&&window.addEventListener)window.addEventListener('beforeunload',onUnload)}
  drawBar();return BAR};
 D._t={onKey:onKey,onNav:onNav,onUnload:onUnload,drawPanel:drawPanel,typing:typing,area:area,askSave:askSave,lintText:lintText,KEYMAP:KEYMAP};
 EXT_SCREENS.models.doc=D;
})();
`;
