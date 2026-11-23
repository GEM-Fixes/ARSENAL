// ARSENAL Editor, part shell: window.IDE (contract tools/ide/README.md "Browser"), the Editor screen layout, documents, save,
// lint, hover, navigation, actions table (toolbar, keys, Ctrl+K palette feed), status bar, next-steps strip, inbox.
// Page rules: ES5, no backtick, no dollar-brace, no innerHTML; DOM through h() and textContent; every string through tx().
// Runs inside the page IIFE: h, tx, api, LS, S, show, toast, LANG, EXT_SCREENS come from tools/gui/page.js.
// Dirty state is read live from the editor (isDirty) for every decision that may throw text away; d.dirty is only a cache
// for drawing. Every edit bumps d.ver; findings and fixes carry the version they were made for and are used only while it
// still matches the text (fresh), else the shell says "checking again" and re-lints.
// Author: Imperator_Aug (ARSENAL, ia-e4c37afe)
// Colours: the page's tokens (tools/gui/page.js) plus the syntax palette picked by ./theme.js (IDE_THEME), no switch of its own.
var THEME = require('./theme');
var CMT = require('../cm/theme.js');
var script = THEME.script + String.raw`
(function(){
var IDE=window.IDE={parts:{},docs:[],actions:{}};
// a phone (page RMT, gui.js remote view): browse and read only. No save, copy in, fixes, Notepad++, Explorer, inbox, and no lint,
// hover, go to definition or usages (they start the index build on the PC). The server refuses all of them anyway.
var IRM=(typeof RMT!=='undefined'&&!!RMT);IDE.remote=IRM;
var THEME='';
function pageTheme(){try{return window.IDE_THEME?window.IDE_THEME.now():(THEME||'light')}catch(e){return THEME||'light'}}
var GSEEN=null,NOSAVE=false;   // the game the open files belong to; NOSAVE: files closed by a game switch leave the remembered list alone
var EV={},ED=null,BOOT='',Q=[],MOD=null,ACT=null,NID=0,TREE=null,TREEMOD='',EXPL={},BACK=[],FWD=[],LASTSAVE=0,TF=null;
var UI={},PARTS={},BOUND={},CSSDONE=false,INB=false,RESTORE=false,OVPREV=null,PEND={},CHT=null;
var HV={t:0,tm:null,key:'',card:null,needText:false};
var SDLX=' def set inc mi ext ebm mtl mdl ply fx info weapon ammo grenade mine pattern presets nav lay ssq accuracy reg opt hand fsm dl ';
var ASSET='/api/x/ide/asset?f=';
// the editor's English phrases (IDE_ED.PHRASES: CodeMirror's search/jump dialogs and the cm layer's own) -> lang keys
var PHR=[['Search:','ide.ph.search'],['(Use /re/ syntax for regexp search)','ide.ph.re'],['Replace:','ide.ph.replace'],['With:','ide.ph.with'],
 ['Replace with:','ide.ph.replWith'],['Replace all:','ide.ph.replAll'],['Replace?','ide.ph.replQ'],['Yes','ide.ph.yes'],['No','ide.ph.no'],['All','ide.ph.all'],
 ['Stop','ide.ph.stop'],['Jump to line:','ide.ph.jump'],['(Use line:column or scroll% syntax)','ide.ph.jumpHint'],
 ['Code editor','ide.ph.code'],['Compare','ide.ph.compare'],['Tab moves focus (Ctrl+M to change)','ide.ph.tabOn'],['Tab types a tab (Ctrl+M to change)','ide.ph.tabOff'],
 ['Next Tab moves focus','ide.ph.tabOnce'],['Folded lines. Click to open.','ide.ph.folded'],['Fold block','ide.ph.fold'],['Open folded block','ide.ph.unfold'],
 ['No-break space','ide.ph.nbsp'],['Full-width space','ide.ph.wide'],['Zero-width no-break space (BOM)','ide.ph.bom'],['Hidden character','ide.ph.hidden'],
 ['No differences','ide.ph.same'],['Changed lines: {left} on the left, {right} on the right','ide.ph.changed'],['(long files: lines compared by position)','ide.ph.long'],
 ['Find in this file','ide.ph.fBar'],['Find','ide.ph.fFind'],['Replace with','ide.ph.fWith'],['Match case (Alt+C)','ide.ph.fCase'],['Whole word','ide.ph.fWord'],
 ['Regular expression (Alt+R)','ide.ph.fRe'],['Previous match (Shift+Enter)','ide.ph.fPrev'],['Next match (Enter)','ide.ph.fNext'],['Show replace (Ctrl+H)','ide.ph.fShowRep'],
 ['Close (Esc)','ide.ph.fClose'],['Replace','ide.ph.fRep'],['Replace all','ide.ph.fRepAll'],['Replace this match (Enter)','ide.ph.fRepOne'],
 ['Replace every match (Ctrl+Alt+Enter)','ide.ph.fRepEvery'],['{i} of {n}','ide.ph.fCount'],['No results','ide.ph.fNone'],['Bad pattern','ide.ph.fBad'],
 ['Replaced {n}','ide.ph.fReplaced'],['This text is read-only.','ide.ph.fRo'],['Wrapped around','ide.ph.fWrap'],['{n} times','ide.ph.fTimes']];

// ---------------------------------------------------------------- events, helpers
IDE.on=function(ev,fn){(EV[ev]=EV[ev]||[]).push(fn)};
IDE.emit=function(ev,data){(EV[ev]||[]).slice().forEach(function(f){try{f(data||{})}catch(e){if(window.console)console.error('IDE '+ev,e)}})};
function qs(o){var s=[];Object.keys(o).forEach(function(k){if(o[k]!=null&&o[k]!=='')s.push(encodeURIComponent(k)+'='+encodeURIComponent(o[k]))});return s.join('&')}
// like page api(), but the HTTP status stays on the error (e.status) so a 409 can be told apart. It sends the page's game the way
// api() does (page.js gameHdr: x-arsenal-game, and the GoH folder under GoH), so every Editor route answers for that game.
function gh(o){o=o||{};try{if(typeof gameHdr==='function')return gameHdr(o)}catch(e){}return o}
// the page's game id ('as64' when the page has none): the open files, word lists and remembered sessions are kept per game
function gidNow(){try{return (S&&S.gameId)||'as64'}catch(e){return 'as64'}}
// JOBS (the job list in the footer): opt is page.js JOBS.fetch's: {what: ready text} names the request in the list, {job:false} keeps
// it out (a later page or slice of work that already has its row). A request stopped from the list (499, key job.cancelled) rejects
// with e.cancelled true and e.message the translated "Stopped", as page api() does: callers show it as a plain state (errMsg, errEl).
function call(url,body,opt){var o=body===undefined?{headers:gh()}:{method:'POST',headers:gh({'content-type':'application/json'}),body:JSON.stringify(body)};
 return (typeof JOBS!=='undefined'&&JOBS&&JOBS.fetch?JOBS.fetch:fetch)(url,o,opt).then(function(r){return r.json().catch(function(){return {error:tx('api.badreply')}}).then(function(j){
  if(!r.ok){var e=new Error((j&&j.error)||('HTTP '+r.status));e.status=r.status;
   if(j&&j.key){e.key=j.key;e.params=j.params||{}}
   if(r.status===499||(j&&j.key==='job.cancelled')){e.key='job.cancelled';e.cancelled=true;e.message=tx('job.cancelled');e.text=e.message}
   throw e}return j})})}
// what a failed call says: a stopped one its plain "Stopped", any other the error line (key: the line's language key, slot m)
function errMsg(e,key){var m=(e&&e.message)||'';return e&&e.cancelled?m:tx(key||'ide.err',{m:m})}
function errEl(e){return h('div',{class:e&&e.cancelled?'ide-hint':'err',text:(e&&e.message)||''})}
function txp(o){if(o==null)return '';if(typeof o==='string')return tx(o);return tx(o.k,o.p)}
function low(s){return String(s||'').replace(/\\/g,'/').toLowerCase()}
function btn(key,fn,cls,tipKey){var b=h('button',{type:'button',class:cls||null,text:tx(key),onclick:fn});if(tipKey)IDE.tip(b,tipKey);return b}
function later(fn,ms){return setTimeout(fn,ms||0)}
function won(t,f){if(window.addEventListener)window.addEventListener(t,f)}
function within(el,root){while(el){if(el===root)return true;el=el.parentNode}return false}
function focusIn(root){return !!root&&within(document.activeElement,root)}
function focusables(root){var out=[];(function walk(n){var k=n&&n.children||[];for(var i=0;i<k.length;i++){var c=k[i];if(!c||c.hidden)continue;
  var t=c.tagName,ti=c.getAttribute?c.getAttribute('tabindex'):null;
  if(!c.disabled&&ti!=='-1'&&(t==='BUTTON'||t==='INPUT'||t==='SELECT'||t==='TEXTAREA'||ti!=null))out.push(c);walk(c)}})(root);return out}

// ---------------------------------------------------------------- kinds and refs
function kindOf(name){var n=low(name),base=n.split('::').pop().split('/').pop(),dot=base.lastIndexOf('.'),ext=dot>=0?base.slice(dot+1):'';
 if(ext==='lng')return 'lng';if(ext==='po'||ext==='pot')return 'po';if(ext==='lua')return 'lua';if(base==='game.log'||ext==='log')return 'log';
 if(ext&&SDLX.indexOf(' '+ext+' ')>=0)return 'sdl';
 if(!ext&&/(^|\/)resource\/(set|entity)\//.test(n.split('::').pop()))return 'sdl';
 return 'text'}
IDE.kindOf=kindOf;
function normRef(ref){if(!ref)return null;if(typeof ref==='string')ref={rel:ref};var mod=ref.mod||S.mod;if(!mod)return null;
 if(ref.rel!=null&&ref.rel!=='')return {mod:mod,rel:String(ref.rel).replace(/\\/g,'/')};
 if(ref.key)return {mod:mod,key:low(ref.key).replace(/^\.?\/+/,''),idx:ref.idx==null||ref.idx===''?undefined:Number(ref.idx)};
 if(ref.path)return {mod:mod,path:String(ref.path)};return null}
function refId(r){return r.rel!=null?'r|'+low(r.mod)+'|'+low(r.rel):r.key?'k|'+low(r.mod)+'|'+r.key+'#'+r.idx:'p|'+low(r.mod)+'|'+low(r.path)}
function refBody(d,extra){var b={},r=d.ref;['mod','rel','key','idx','path'].forEach(function(k){if(r[k]!=null)b[k]=r[k]});
 if(extra)Object.keys(extra).forEach(function(k){b[k]=extra[k]});return b}
IDE.byRef=function(ref,view){var r=normRef(ref);if(!r||(r.key&&r.idx===undefined))return null;return findDoc(r,view)};
// viewer docs (ext view, tools/gui/ext/view/README.md): d.view = the kind, read only, no CodeMirror buffer. One file can be open as
// text and as a viewer at once. view: undefined = either (the text first), false = the text doc, 'kind' = that viewer
function findDoc(r,view){var id=refId(r),alt=null;for(var i=0;i<IDE.docs.length;i++){var d=IDE.docs[i];if(refId(d.ref)!==id)continue;
  if(view===undefined){if(!d.view)return d;if(!alt)alt=d}else if(view===false||view===null){if(!d.view)return d}else if(d.view===view)return d}return alt}
function isView(d){return !!d&&!!d.view}
function VW(){return typeof window!=='undefined'&&window.VIEW&&window.VIEW.reg?window.VIEW:null}
IDE.active=function(){return byId(ACT)};
function byId(id){if(id==null)return null;for(var i=0;i<IDE.docs.length;i++)if(IDE.docs[i].id===id)return IDE.docs[i];return null}
IDE.textOf=function(d){if(!d)return '';if(d.view)return '';if(ED&&IDE.docs.indexOf(d)>=0){try{var t=ED.text(d.id);if(typeof t==='string')return t}catch(e){}}return d.text};
// live: the editor knows; the cached flag is only the fallback when there is no editor
function isDirty(d){if(!d||d.view)return false;if(ED&&IDE.docs.indexOf(d)>=0){try{var c=ED.isClean(d.id);if(typeof c==='boolean'){d.dirty=!c;return !c}}catch(e){}}return !!d.dirty}
IDE.isDirty=isDirty;
function lintable(d){return !!d&&(d.kind==='sdl'||d.kind==='lng'||d.kind==='po'||d.kind==='lua')}
function navable(d){return !!d&&(d.kind==='sdl'||d.kind==='lng')}
// findings/fixes belong to the text they were made for
function fresh(d){if(!d)return false;if(!lintable(d))return true;return d.fver===d.ver&&d.ltext!=null&&IDE.textOf(d)===d.ltext}
IDE.fresh=fresh;
function stale(d){IDE.status(tx('ide.recheck'));lint(d)}
function edited(d){d.ver=(d.ver||0)+1;d.fixes=[]}
// split ':line[:col]' from the right; a colon right after a colon is part of a pak name (a.pak::b)
function splitPos(s){var nums=[],m;s=String(s||'');
 while(nums.length<2&&(m=/^([\s\S]*[^:]):(\d+)$/.exec(s))){nums.unshift(Number(m[2]));s=m[1]}
 return {s:s,line:nums[0]||0,col:nums[1]||0}}
IDE.splitPos=splitPos;
// layer docs: the layer's own name ("robz 1.31.0") or "game" for the game's own files
function layerTag(d){if(!d.ref.key)return '';if(!d.layer)return tx('ide.layer');return d.layerKind==='vanilla'?tx('ide.lay.game'):d.layer}
function docName(d){return d.base+(d.ref.key?' ['+layerTag(d)+']':'')}
function roWhy(d){if(d.why==='layer'&&d.layer)return d.layerKind==='vanilla'?tx('ide.ro.game'):tx('ide.ro.mod',{m:d.layer});return tx('ide.ro.'+(d.why||'outside'))}
function whereOf(d){if(d.editable)return tx('ide.where.mine');if(d.ref.key){if(d.layer)return d.layerKind==='vanilla'?tx('ide.where.game'):tx('ide.where.mod',{m:d.layer});return tx('ide.where.layer')}return tx('ide.where.ro')}

// ---------------------------------------------------------------- tips, status, next
function tipText(el,text,shortcut){if(!el)return el;
 if(typeof window.tip==='function'){try{window.tip(el,text,shortcut)}catch(e){el.title=text+(shortcut?' ('+shortcut+')':'')}}
 else el.title=text+(shortcut?' ('+shortcut+')':'');
 if(!String(el.textContent||'').trim())el.setAttribute('aria-label',text);return el}
IDE.tip=function(el,key,shortcut){return tipText(el,tx(key),shortcut)};
IDE.status=function(text){if(!UI.msg)return;UI.msg.textContent=text||'';UI.msg.className='ide-st-msg';clearTimeout(UI.msgT);
 if(text)UI.msgT=later(function(){UI.msg.className='ide-st-msg ide-fade';UI.msgT=later(function(){UI.msg.textContent=''},600)},6000)};
// IDE.next(items) is how a part (the kit) sets the strip: it is kept on the active doc with the doc's version, its findings and the
// save mark (d.nxp), and nextFor shows it again (or leaves it alone) until one of those changes. The shell's own strip goes by drawNext.
var NXON=null;   // the part strip on screen now (a d.nxp), or null
function drawNext(items,own){var b=UI.next;NXON=own||null;if(!b)return;b.textContent='';items=(items||[]).filter(Boolean);b.hidden=!items.length;if(!items.length)return;
 b.appendChild(h('b',{text:tx('ide.n.title')}));
 items.forEach(function(it,i){b.appendChild(h('button',{type:'button',class:i?null:'primary',text:tx(it.label,it.p),onclick:function(){it.run()}}))})}
function findKey(d){return (d.findings||[]).map(function(f){return f.line+':'+f.col+':'+f.sev+':'+f.code+'|'+f.msg}).join('\n')}
IDE.next=function(items){items=(items||[]).filter(Boolean);var d=IDE.active(),p=null;
 if(d&&items.length)p={ver:d.ver,fk:findKey(d),after:d.after||null,items:items};if(d)d.nxp=p;drawNext(items,p)};
IDE.panel=function(tab){setCollapsed(false);var p=PARTS.panels;if(p&&p.show){try{p.show(tab)}catch(e){IDE.status(tx('ide.partErr',{m:e.message}))}}else IDE.status(tx('ide.noPanels'))};

// ---------------------------------------------------------------- actions table
IDE.action=function(id,spec){spec=spec||{};spec.id=id;IDE.actions[id]=spec;if(UI.tb)later(drawBar);if(ED)bindEd()};
function canRun(a){try{return !a.when||!!a.when()}catch(e){return false}}
IDE.run=function(id){var a=IDE.actions[id];if(!a)return false;if(!canRun(a)){IDE.status(tx('ide.notNow'));return false}
 try{a.run()}catch(e){IDE.status(errMsg(e))}return true};
IDE.palette=function(){return Object.keys(IDE.actions).map(function(k){return IDE.actions[k]}).filter(canRun)
 .map(function(a){return {label:tx(a.label),key:a.key||a.keyHint||null,run:function(){IDE.run(a.id)}}})};
// 'Ctrl+Shift+O' -> canonical 'Ctrl+Shift+O'; event -> same form
function canon(k){var p=String(k).split('+'),key=p.pop();if(key===''&&p.length){p.pop();key='+'}var m={};p.forEach(function(x){m[x.toLowerCase()]=1});
 return (m.ctrl?'Ctrl+':'')+(m.shift?'Shift+':'')+(m.alt?'Alt+':'')+(key.length===1?key.toUpperCase():key)}
var EVK={ArrowLeft:'Left',ArrowRight:'Right',ArrowUp:'Up',ArrowDown:'Down',Esc:'Escape'};
function evKey(e){var k=EVK[e.key]||e.key;if(!k||k==='Control'||k==='Shift'||k==='Alt'||k==='Meta')return '';
 return (e.ctrlKey||e.metaKey?'Ctrl+':'')+(e.shiftKey?'Shift+':'')+(e.altKey?'Alt+':'')+(k.length===1?k.toUpperCase():k)}
// CodeMirror order: Shift-Cmd-Ctrl-Alt-Key
function cmKey(k){var c=canon(k).split('+'),key=c.pop(),m={};c.forEach(function(x){m[x]=1});
 return (m.Shift?'Shift-':'')+(m.Ctrl?'Ctrl-':'')+(m.Alt?'Alt-':'')+key}
IDE.cmKey=cmKey;IDE.canon=canon;
function actionFor(k){if(!k)return null;var ids=Object.keys(IDE.actions);for(var i=0;i<ids.length;i++){var a=IDE.actions[ids[i]];if(a.key&&canon(a.key)===k)return a}return null}
function cmPass(){var C=window.CodeMirror;return C?C.Pass:undefined}
// editor keys: an action that cannot run now hands the key back to CodeMirror (Pass); Esc closes a shell box first
function bindEd(){if(!ED||!ED.keys)return;var m={},n=0;
 Object.keys(IDE.actions).forEach(function(id){var a=IDE.actions[id];if(!a.key)return;var ck=cmKey(a.key);if(BOUND[ck]===id)return;BOUND[ck]=id;n++;
  m[ck]=function(){var b=IDE.actions[id];if(!b||!canRun(b))return cmPass();IDE.run(id)}});
 if(!BOUND.Esc){BOUND.Esc='-';n++;m.Esc=function(){if(ovOpen()){closeOverlay();return}return cmPass()}}
 if(n)try{ED.keys(m)}catch(e){}}
var GROUPS=['file','fix','jump','log'],GRP={};
// ---------------------------------------------------------------- toolbar: one menu button per group, favourites bar, full screen
// The toolbar is one row: a menu button per group (File, Check & Fix, Jump, Log, More) and the full screen button at its right end.
// Each group is one block (id tb.<group>) made once; its drop-down menu (role menu, class ide-menu ide-grp) rides inside the block,
// so a group Arrange moved anywhere still opens its menu. A redraw refills the menu from IDE.actions (bar !== false) and never
// re-creates the block (an empty group is hidden, not removed). Every item keeps data-act. Disabled = aria-disabled (still
// focusable, as menus want). Keys: toolbar Left, Right, Home, End; Enter, Space, Down open (Up opens at the last item); in a menu
// Up, Down, Home, End, a letter (next item starting with it), Esc (closes, focus back to the button), Tab, Left, Right (next menu);
// Ctrl+D on an item adds it to the favourites or takes it off; right click, the menu key or Shift+F10 open the favourites menu.
// A click outside closes; one menu open at a time. Menus are fixed boxes placed inside the window (flipped up or shifted near an
// edge), above the editor and the panes.
// Favourites (block tb.fav, right below the toolbar): action ids in LS ide.fav (the GUI settings, shared by the browsers on this PC;
// the phone view keeps its own); first run = FAVDEF minus ids that do
// not exist. An id whose action is gone is not shown (and is left out of the next save). Drag a menu item onto the bar, drag to
// reorder, drag a button off the bar to take it off.
var MENU=null,CTX=null,NAVF=null,FAVF=null,DRAG=null,FMK=null,FULL=false,REALFS=false,FSD=null;
var FAVDEF=['save','next','fixAt','gofile','findInFiles','kitShow'],FAVKEY='Ctrl+D',STAR=String.fromCharCode(0x2605);
function keyOf(a){return a&&(a.key||a.keyHint)||''}
function ariaKeys(k){return String(k).replace(/\bCtrl\b/g,'Control').replace(/\bEsc\b/g,'Escape')}
function stopEv(e){if(e.preventDefault)e.preventDefault();if(e.stopPropagation)e.stopPropagation()}
function setOff(b,a){if(!b)return;if(!!a&&!canRun(a))b.setAttribute('aria-disabled','true');else if(b.getAttribute('aria-disabled')!=null)b.removeAttribute('aria-disabled')}
function offEl(b){return !!b&&!!b.getAttribute&&b.getAttribute('aria-disabled')==='true'}
function shown(el){for(var n=el;n&&n!==UI.root;n=n.parentNode){if(n.hidden)return false;if(n.classList&&n.classList.contains('blkoff'))return false}return !!n}
function blkOf(el){for(var n=el;n&&n!==UI.root;n=n.parentNode)if(n.dataset&&n.dataset.blk!=null)return n;return null}
function items(m){var o=[],k=(m&&m.children)||[];for(var i=0;i<k.length;i++)if(k[i].getAttribute&&k[i].getAttribute('role')==='menuitem'&&!k[i].hidden)o.push(k[i]);return o}
function itemOf(m,id){var its=items(m);for(var i=0;i<its.length;i++)if(its[i].dataset&&its[i].dataset.act===id)return its[i];return null}
function grpOf(g){if(GRP[g])return GRP[g];var mid='ide-menu-'+g,name=tx('ide.g.'+g);
 var mb=h('button',{type:'button',class:'ide-tbb ide-mb ide-tbnav',id:mid+'-b','aria-haspopup':'menu','aria-expanded':'false','aria-controls':mid,'data-grp':g,tabindex:'-1'},
  [h('span',{text:name}),h('span',{class:'ide-caret','aria-hidden':'true'})]);
 IDE.tip(mb,'ide.mbT');
 var menu=h('div',{class:'ide-menu ide-grp',id:mid,role:'menu','aria-labelledby':mid+'-b',tabindex:'-1',hidden:true,'data-grp':g});
 var G={g:g,mb:mb,menu:menu,ids:[]};
 G.b=h('div',{blk:'tb.'+g,class:'ide-tbg','data-blkname':tx('ide.blk.grp',{g:name})},[mb,menu]);
 mb.addEventListener('click',function(){if(MENU&&MENU.G===G)closeMenu(true);else openMenu(G,'first')});
 mb.addEventListener('keydown',function(e){navKey(e,mb)});
 mb.addEventListener('focus',function(){navStop(mb)});
 menu.addEventListener('keydown',menuKey);
 menu.addEventListener('contextmenu',function(e){if(e&&e.preventDefault)e.preventDefault()});
 menu.addEventListener('focusout',function(){later(lostFocus,0)});
 GRP[g]=G;return G}
// an item's tip shows on hover over its name only: a tip on keyboard focus would sit over the next items at every arrow key. A screen
// reader gets the tip (and whether the item is a favourite) as the item's description.
function miDesc(b,fav){var d=(fav?tx('ide.fav.h')+'. ':'')+(b._desc||'');if(d)b.setAttribute('aria-description',d);else if(b.getAttribute('aria-description')!=null)b.removeAttribute('aria-description')}
function hoverFocus(b){b.addEventListener('mousemove',function(){if((MENU||CTX||TM)&&document.activeElement!==b&&b.focus)b.focus()})}
function mItem(id){var a=IDE.actions[id],k=keyOf(a),fav=favHas(id);
 var nm=h('span',{class:'ide-mi-n',text:tx(a.label)});
 var b=h('button',{type:'button',role:'menuitem',class:'ide-mi','data-act':id,tabindex:'-1',draggable:'true','aria-keyshortcuts':k?ariaKeys(k):null},
  [nm,h('span',{class:'ide-mi-f','aria-hidden':'true',text:fav?STAR:''}),h('span',{class:'ide-mi-k','aria-hidden':'true',text:k})]);
 b._desc=a.tip?tx(a.tip):'';tipText(nm,tx(a.tip||a.label),null);miDesc(b,fav);hoverFocus(b);
 b.addEventListener('click',function(){pickItem(b)});
 b.addEventListener('contextmenu',function(e){if(e&&e.preventDefault)e.preventDefault();ctxReq(b,'mi',e)});
 b.addEventListener('dragstart',function(e){dragFrom(e,id,'mi')});
 b.addEventListener('dragend',function(){dragEnd()});
 return b}
function grpIds(g){return Object.keys(IDE.actions).filter(function(id){var a=IDE.actions[id];return a.bar!==false&&((a.group||'other')===g||(g==='other'&&GROUPS.indexOf(a.group)<0))})}
function drawBar(){if(!UI.tb)return;var keep=null,ae=document.activeElement;
 if(MENU&&within(ae,MENU.G.menu))keep=ae&&ae.dataset?ae.dataset.act:null;
 GROUPS.concat(['other']).forEach(function(g){var ids=grpIds(g),G=grpOf(g);G.ids=ids;G.menu.textContent='';G.b.hidden=!ids.length;
  ids.forEach(function(id){G.menu.appendChild(mItem(id))})});
 if(MENU){var M=MENU.G;if(M.b.hidden||!shown(M.b))closeMenu(false);else{placeMenu(M.menu,M.mb);if(keep){var it=itemOf(M.menu,keep)||items(M.menu)[0];if(it)it.focus()}}}
 drawFav();updBar()}
function updBar(){if(!UI.tb)return;Object.keys(GRP).forEach(function(g){var bs=GRP[g].menu.querySelectorAll('button[data-act]');
 for(var i=0;i<bs.length;i++)setOff(bs[i],IDE.actions[bs[i].dataset.act])});
 favBtns().forEach(function(b){setOff(b,IDE.actions[b.dataset.fav])});drawFs();if(!MENU)navInit()}
// the toolbar's tab stop: one of its buttons (menu buttons and the full screen button, in page order, wherever Arrange put them)
function navBtns(){var r=UI.root,o=[];if(!r||!r.querySelectorAll)return o;var all=r.querySelectorAll('button.ide-tbnav');
 for(var i=0;i<all.length;i++)if(shown(all[i]))o.push(all[i]);return o}
// updBar runs at every edit: navInit returns at once while the tab stop is still a shown button, and tabindex is written only on a change
function navStop(b){NAVF=b;navBtns().forEach(function(x){var v=x===b?'0':'-1';if(x.getAttribute('tabindex')!==v)x.setAttribute('tabindex',v)})}
function navInit(){if(NAVF&&NAVF.getAttribute('tabindex')==='0'&&shown(NAVF))return;var bs=navBtns();if(bs.length)navStop(bs.indexOf(NAVF)>=0?NAVF:bs[0])}
function grpBy(b){var g=b&&b.dataset?b.dataset.grp:null;return g?GRP[g]||null:null}
function navKey(e,b){if(e.altKey||e.ctrlKey||e.metaKey)return;var bs=navBtns(),i=bs.indexOf(b),n=bs.length,k=e.key,j=-1;if(i<0||!n)return;
 if(k==='ArrowRight'||k==='Right')j=(i+1)%n;else if(k==='ArrowLeft'||k==='Left')j=(i-1+n)%n;else if(k==='Home')j=0;else if(k==='End')j=n-1;
 if(j>=0){stopEv(e);closeMenu(false);navStop(bs[j]);bs[j].focus();return}
 var G=grpBy(b);if(!G)return;
 if(k==='ArrowDown'||k==='Down'){stopEv(e);openMenu(G,'first')}else if(k==='ArrowUp'||k==='Up'){stopEv(e);openMenu(G,'last')}}
// a menu: fixed, placed under its button (above it when there is no room below), kept inside the window
function placeMenu(el,anchor,x,y){if(!el||!el.style)return;var W=window.innerWidth||1024,H=window.innerHeight||768;el.style.maxHeight=Math.max(120,H-8)+'px';
 var r=el.getBoundingClientRect?el.getBoundingClientRect():null,w=r&&r.width||220,hh=r&&r.height||240,ar=anchor&&anchor.getBoundingClientRect?anchor.getBoundingClientRect():null;
 if(ar){x=ar.left;y=ar.bottom+2;if(y+hh>H-4&&ar.top-hh-2>=4)y=ar.top-hh-2}
 x=Math.max(4,Math.min(x||0,W-w-4));y=Math.max(4,Math.min(y||0,H-hh-4));el.style.left=Math.round(x)+'px';el.style.top=Math.round(y)+'px'}
function openMenu(G,where){if(!G||G.b.hidden)return;closeCtx(false);closeTabMenu(false);if(MENU&&MENU.G!==G)closeMenu(false);updBar();
 var m=G.menu;MENU={G:G};G.mb.setAttribute('aria-expanded','true');m.hidden=false;placeMenu(m,G.mb);navStop(G.mb);
 var its=items(m),f=null,i;if(where==='last')f=its[its.length-1];else{for(i=0;i<its.length;i++)if(!offEl(its[i])){f=its[i];break}f=f||its[0]}
 if(f&&f.focus)f.focus();else if(m.focus)m.focus()}
function closeMenu(refocus){var M=MENU;if(!M)return;closeCtx(false);MENU=null;var G=M.G;G.menu.hidden=true;G.mb.setAttribute('aria-expanded','false');
 if(G.menu.classList)G.menu.classList.remove('ide-thru');if(refocus&&G.mb.focus)G.mb.focus()}
function closeAll(){closeTabMenu(false);closeCtx(false);closeMenu(false)}
IDE.closeMenus=closeAll;
function pickItem(b){var id=b.dataset.act,a=IDE.actions[id];if(!a)return;if(!canRun(a)){IDE.status(tx('ide.notNow'));return}
 var G=MENU&&MENU.G;closeAll();if(G&&G.mb.focus)G.mb.focus();IDE.run(id)}
function menuKey(e){if(!MENU||e.isComposing||e.keyCode===229)return;var G=MENU.G,its=items(G.menu),n=its.length,i=its.indexOf(document.activeElement),k=e.key,c=evKey(e);if(!n)return;
 if(k==='ArrowDown'||k==='Down')its[(i+1)%n].focus();
 else if(k==='ArrowUp'||k==='Up')its[i<0?n-1:(i-1+n)%n].focus();
 else if(k==='Home')its[0].focus();else if(k==='End')its[n-1].focus();
 else if(k==='Escape'||k==='Esc')closeMenu(true);
 else if(k==='Tab'){closeMenu(true);return}
 else if(!e.ctrlKey&&!e.altKey&&!e.metaKey&&(k==='ArrowRight'||k==='Right'||k==='ArrowLeft'||k==='Left')){var bs=navBtns(),j=bs.indexOf(G.mb),m=bs.length;if(j<0||!m)return;
  var nb=bs[(j+(k==='ArrowRight'||k==='Right'?1:-1)+m)%m],G2=grpBy(nb);closeMenu(false);navStop(nb);if(G2)openMenu(G2,'first');else nb.focus()}
 else if(k==='ContextMenu'||(k==='F10'&&e.shiftKey)){if(i>=0)ctxReq(its[i],'mi',null)}
 else if(c===FAVKEY){if(i>=0)favToggle(its[i].dataset.act)}
 else if(k&&k.length===1&&/\S/.test(k)&&!e.ctrlKey&&!e.altKey&&!e.metaKey){var t=k.toLowerCase();
  for(var s=1;s<=n;s++){var x=its[((i<0?-1:i)+s)%n],l=String((x.querySelector('.ide-mi-n')||x).textContent||'').toLowerCase();if(l.indexOf(t)===0){x.focus();break}}}
 else return;
 stopEv(e)}
// focus left the open menu (and its favourites menu): close it, without taking the focus back
function lostFocus(){var a=document.activeElement;if(!a||a===document.body)return;
 if(TM&&!within(a,TM.el)&&a!==TM.src)closeTabMenu(false);
 if(CTX&&!within(a,CTX.el)&&a!==CTX.src&&!(MENU&&within(a,MENU.G.menu)))closeCtx(false);
 if(MENU&&!within(a,MENU.G.menu)&&a!==MENU.G.mb&&!(CTX&&within(a,CTX.el)))closeMenu(false)}
// the favourites menu (one box, moved into the block of what it was opened on): on a menu item Add or Remove; on a favourite
// Remove, Move left, Move right
function ctxReq(src,kind,e){if(CTX&&CTX.src===src)return;var kb=!e||(!e.clientX&&!e.clientY);openCtx(src,kind,kb?null:e.clientX,kb?null:e.clientY)}
function openCtx(src,kind,x,y){closeCtx(false);var el=UI.cmenu,id=kind==='fav'?src.dataset.fav:src.dataset.act;if(!el||!id||!IDE.actions[id])return;
 var host=blkOf(src)||UI.favb;if(host&&el.parentNode!==host)host.appendChild(el);
 el.textContent='';var l=favList(),at=l.indexOf(id),rows;
 if(kind==='fav')rows=[['ide.fav.remove',false,function(){favRemove(id,true)}],['ide.fav.left',at<=0,function(){favMove(id,-1,true)}],['ide.fav.right',at<0||at>=l.length-1,function(){favMove(id,1,true)}]];
 else rows=[[at>=0?'ide.fav.remove':'ide.fav.add',false,function(){favToggle(id);if(src.focus&&shown(src))src.focus()}]];
 rows.forEach(function(r){var b=h('button',{type:'button',role:'menuitem',class:'ide-mi',tabindex:'-1','aria-disabled':r[1]?'true':null},[h('span',{class:'ide-mi-n',text:tx(r[0])})]);
  hoverFocus(b);b.addEventListener('click',function(){if(offEl(b))return;closeCtx(false);r[2]()});el.appendChild(b)});
 CTX={el:el,src:src,kind:kind,id:id};el.hidden=false;
 if(x==null){var sr=src.getBoundingClientRect?src.getBoundingClientRect():null;x=sr?sr.left+8:8;y=sr?sr.bottom:8}
 placeMenu(el,null,x,y);var its=items(el),f=null;for(var i=0;i<its.length;i++)if(!offEl(its[i])){f=its[i];break}f=f||its[0];if(f&&f.focus)f.focus()}
function closeCtx(refocus){var C=CTX;if(!C)return;CTX=null;C.el.hidden=true;C.el.textContent='';if(refocus&&C.src&&C.src.focus&&shown(C.src))C.src.focus()}
function ctxKey(e){if(!CTX||e.isComposing)return;var its=items(CTX.el),n=its.length,i=its.indexOf(document.activeElement),k=e.key;if(!n)return;
 if(k==='ArrowDown'||k==='Down')its[(i+1)%n].focus();else if(k==='ArrowUp'||k==='Up')its[i<0?n-1:(i-1+n)%n].focus();
 else if(k==='Home')its[0].focus();else if(k==='End')its[n-1].focus();
 else if(k==='Escape'||k==='Esc'||k==='Tab')closeCtx(true);
 else if(k==='ContextMenu'||(k==='F10'&&e.shiftKey)){}
 else return;
 stopEv(e)}
// favourites: the list, its store, the bar
function favRaw(){var v=null;try{v=LS.get('ide.fav',null)}catch(e){v=null}return Array.isArray(v)?v.filter(function(x){return typeof x==='string'&&!!x}):null}
function favList(){var r=favRaw(),seen={};return (r===null?FAVDEF:r).filter(function(id){if(seen[id]||!IDE.actions[id])return false;seen[id]=1;return true})}
function favHas(id){return favList().indexOf(id)>=0}
function favSave(l){LS.set('ide.fav',l.slice());drawFav()}
function favName(id){var a=IDE.actions[id];return a?tx(a.label):String(id)}
function favAdd(id,at){if(!IDE.actions[id])return false;var l=favList().filter(function(x){return x!==id});at=at==null||at<0||at>l.length?l.length:at;l.splice(at,0,id);favSave(l);
 IDE.status(tx('ide.fav.added',{a:favName(id)}));return true}
function favRemove(id,focus){var l=favList(),i=l.indexOf(id);if(i<0)return false;l.splice(i,1);favSave(l);IDE.status(tx('ide.fav.removed',{a:favName(id)}));
 if(focus){var fb=favBtns(),nb=fb[Math.min(i,fb.length-1)];if(nb){favStop(nb);nb.focus()}else{var bs=navBtns();if(bs[0])bs[0].focus()}}return true}
function favMove(id,dir,focus){var l=favList(),i=l.indexOf(id),j=i+dir;if(i<0||j<0||j>=l.length)return false;l.splice(i,1);l.splice(j,0,id);favSave(l);if(focus)favFocus(id);return true}
function favToggle(id){return favHas(id)?favRemove(id,false):favAdd(id)}
function favDrop(id,at){if(!IDE.actions[id])return false;var l=favList(),had=l.indexOf(id)>=0;l=l.filter(function(x){return x!==id});
 at=at==null?l.length:Math.max(0,Math.min(at,l.length));l.splice(at,0,id);favSave(l);if(!had)IDE.status(tx('ide.fav.added',{a:favName(id)}));return true}
IDE.fav={list:favList,has:favHas,add:favAdd,remove:function(id){return favRemove(id,false)},move:function(id,dir){return favMove(id,dir,false)},drop:favDrop};
function favBtns(){var o=[],k=UI.favl?UI.favl.children:[];for(var i=0;i<k.length;i++)if(k[i].dataset&&k[i].dataset.fav)o.push(k[i]);return o}
function favStop(b){FAVF=b.dataset.fav;favBtns().forEach(function(x){x.setAttribute('tabindex',x===b?'0':'-1')})}
function favFocus(id){var bs=favBtns();for(var i=0;i<bs.length;i++)if(bs[i].dataset.fav===id){favStop(bs[i]);bs[i].focus();return}}
function favBtn(id){var a=IDE.actions[id],k=keyOf(a);
 var b=h('button',{type:'button',class:'ide-tbb ide-fv','data-fav':id,draggable:'true',tabindex:'-1',text:tx(a.label)});
 tipText(b,tx(a.tip||a.label)+' '+tx('ide.fav.barT'),k||null);
 b.addEventListener('click',function(){IDE.run(id)});
 b.addEventListener('focus',function(){favStop(b)});
 b.addEventListener('keydown',function(e){favKey(e,b)});
 b.addEventListener('contextmenu',function(e){if(e&&e.preventDefault)e.preventDefault();ctxReq(b,'fav',e)});
 b.addEventListener('dragstart',function(e){dragFrom(e,id,'fav')});
 b.addEventListener('dragend',function(){dragEnd()});
 return b}
function favKey(e,b){if(e.isComposing)return;var bs=favBtns(),i=bs.indexOf(b),n=bs.length,k=e.key,c=evKey(e),j=-1;if(i<0)return;
 if(c==='Ctrl+Left'||c==='Ctrl+Right')favMove(b.dataset.fav,c==='Ctrl+Left'?-1:1,true);
 else if(e.altKey||e.ctrlKey||e.metaKey)return;
 else if(k==='ArrowRight'||k==='Right')j=(i+1)%n;else if(k==='ArrowLeft'||k==='Left')j=(i-1+n)%n;else if(k==='Home')j=0;else if(k==='End')j=n-1;
 else if(k==='Delete'||k==='Del')favRemove(b.dataset.fav,true);
 else if(k==='ContextMenu'||(k==='F10'&&e.shiftKey))ctxReq(b,'fav',null);
 else return;
 if(j>=0){favStop(bs[j]);bs[j].focus()}
 stopEv(e)}
function drawFav(){var bar=UI.favl;if(!bar)return;var ae=document.activeElement,fid=focusIn(bar)&&ae&&ae.dataset?ae.dataset.fav:null,l=favList();
 FMK=null;bar.textContent='';
 if(!l.length)bar.appendChild(h('span',{class:'ide-hint ide-fav-none',text:tx('ide.fav.empty')}));
 l.forEach(function(id){bar.appendChild(favBtn(id))});
 if(l.indexOf(FAVF)<0)FAVF=l[0]||null;favBtns().forEach(function(b){b.setAttribute('tabindex',b.dataset.fav===FAVF?'0':'-1');setOff(b,IDE.actions[b.dataset.fav])});
 Object.keys(GRP).forEach(function(g){var bs=GRP[g].menu.querySelectorAll('button[data-act]');
  for(var i=0;i<bs.length;i++){var on=l.indexOf(bs[i].dataset.act)>=0,f=bs[i].querySelector('.ide-mi-f');if(f)f.textContent=on?STAR:'';miDesc(bs[i],on)}});
 if(fid&&l.indexOf(fid)>=0)favFocus(fid)}
// drag and drop (HTML5): a menu item or a favourite onto the bar (a mark shows where it lands); a favourite dropped off the bar goes.
// Only the type text/x-ide-act is set, so a drop on the text area inserts nothing.
function dragFrom(e,id,from){DRAG={id:id,from:from,done:false,out:false};var dt=e&&e.dataTransfer;
 if(dt){try{dt.setData('text/x-ide-act',id)}catch(x){}try{dt.effectAllowed=from==='fav'?'move':'copy'}catch(x){}}
 if(from==='mi'&&MENU){var m=MENU.G.menu;later(function(){if(DRAG&&m.classList)m.classList.add('ide-thru')},0)}
 if(UI.favl&&UI.favl.classList)UI.favl.classList.add('ide-fav-on')}
function dragEnd(){var D=DRAG;DRAG=null;favMark(-1);if(UI.favl&&UI.favl.classList)UI.favl.classList.remove('ide-fav-on');if(!D)return;
 if(MENU&&MENU.G.menu.classList)MENU.G.menu.classList.remove('ide-thru');
 if(D.from==='fav'&&!D.done&&D.out)favRemove(D.id,false);
 if(D.from==='mi'&&D.done)closeMenu(!!MENU&&focusIn(MENU.G.menu))}
function dropBtns(){var id=DRAG?DRAG.id:null;return favBtns().filter(function(b){return b.dataset.fav!==id})}
function dropAt(x,y){var bs=dropBtns();for(var i=0;i<bs.length;i++){var r=bs[i].getBoundingClientRect?bs[i].getBoundingClientRect():null;if(!r)continue;
  if(y<r.top||(y<=r.bottom&&x<r.left+r.width/2))return i}return bs.length}
function favMark(i){if(FMK&&FMK.parentNode)FMK.parentNode.removeChild(FMK);if(i<0||!UI.favl)return;if(!FMK)FMK=h('span',{class:'ide-fav-mark','aria-hidden':'true'});
 var ref=dropBtns()[i]||null;if(ref)UI.favl.insertBefore(FMK,ref);else UI.favl.appendChild(FMK)}
function favOver(e){if(!DRAG)return;if(e.preventDefault)e.preventDefault();DRAG.out=false;try{if(e.dataTransfer)e.dataTransfer.dropEffect=DRAG.from==='fav'?'move':'copy'}catch(x){}
 favMark(dropAt(e.clientX||0,e.clientY||0))}
function favDropEv(e){if(!DRAG)return;if(e.preventDefault)e.preventDefault();var D=DRAG,at=dropAt(e.clientX||0,e.clientY||0);D.done=true;favMark(-1);favDrop(D.id,at);dragEnd()}
// full screen: the Editor (ide-root) covers the window, above the page's header and tabs; the browser's own full screen is asked for
// too where it exists (a refusal is fine). Esc with nothing open, the button or Alt+Enter goes back; the browser leaving its full
// screen (Esc, F11) brings the page back as well. Kept for this page load only.
// A browser takes Esc for itself to end its full screen. Where it can (navigator.keyboard.lock, Chromium), Esc is locked so a short
// press reaches the page and the Esc order below holds (holding Esc still ends the browser's full screen). Where it cannot, the
// browser's exit that comes with an Esc a menu, box or list would have taken (open then, or one taken within ESCMS) only closes that
// one and ends the browser's full screen: the Editor keeps covering the window, and the next Esc leaves.
var ESCT=0,ESCMS=600;
function kbLock(on){try{var k=typeof navigator!=='undefined'&&navigator?navigator.keyboard:null;if(!k)return;
 if(on){if(typeof k.lock==='function'){var p=k.lock(['Escape']);if(p&&typeof p.then==='function')p.then(null,function(){})}}else if(typeof k.unlock==='function')k.unlock()}catch(e){}}
function fsEl(){var d=document;return d.fullscreenElement||d.webkitFullscreenElement||null}
// a request granted after the page already went back (two quick presses) is ended at once
function fsReq(){var de=document.documentElement;if(!de||fsEl())return;var f=de.requestFullscreen||de.webkitRequestFullscreen;if(typeof f!=='function')return;
 try{var p=f.call(de);REALFS=true;if(p&&typeof p.then==='function')p.then(function(){if(!FULL){fsExit();return}kbLock(true)},function(){REALFS=false});else kbLock(true)}catch(e){REALFS=false}}
function fsExit(){var d=document,f=d.exitFullscreen||d.webkitExitFullscreen;kbLock(false);if(!fsEl()||typeof f!=='function')return;try{var p=f.call(d);if(p&&typeof p.then==='function')p.then(null,function(){})}catch(e){}}
function fsChange(){if(fsEl()||!FULL||!REALFS)return;REALFS=false;kbLock(false);
 if((ESCT&&Date.now()-ESCT<ESCMS)||popBusy()){ESCT=0;if(CTX)closeCtx(true);else if(MENU)closeMenu(true);else if(ovOpen())closeOverlay();later(relayout,0);later(relayout,150);return}
 setFull(false,true)}
function drawFs(){var b=UI.fsb;if(!b||FSD===FULL)return;FSD=FULL;b.setAttribute('aria-pressed',FULL?'true':'false');
 tipText(b,tx(FULL?'ide.fs.offT':'ide.a.fullscreenT'),'Alt+Enter');b.setAttribute('aria-label',tx('ide.a.fullscreen'))}
// after the size of the screen changed (full screen on or off): the screen height, the editor, and event layout {full} for the parts
// (the explorer's windowed list takes its new height from it)
function relayout(){if(IDE.fit)try{IDE.fit()}catch(e){}if(ED&&typeof ED.refresh==='function')try{ED.refresh()}catch(e){}try{IDE.emit('layout',{full:FULL})}catch(e){}}
function setFull(on,fromBrowser){on=!!on;if(on===FULL)return;FULL=on;ESCT=0;var r=UI.root;
 if(r&&r.classList){if(on)r.classList.add('ide-full');else r.classList.remove('ide-full')}
 closeAll();drawFs();
 if(on){fsReq();IDE.status(tx('ide.fs.on'))}else{if(!fromBrowser)fsExit();REALFS=false;kbLock(false)}
 later(relayout,0);later(relayout,150)}
IDE.full=function(on){if(on===true||on===false)setFull(on);return FULL};
if(document.addEventListener){document.addEventListener('fullscreenchange',fsChange);document.addEventListener('webkitfullscreenchange',fsChange);
 document.addEventListener('mousedown',function(e){var t=e.target;if(TM&&!within(t,TM.el))closeTabMenu(false);if(CTX&&!within(t,CTX.el))closeCtx(false);
  if(MENU&&!within(t,MENU.G.menu)&&!within(t,MENU.G.mb)&&!(CTX&&within(t,CTX.el)))closeMenu(false)},true);
 document.addEventListener('dragover',function(e){if(!DRAG)return;var inBar=!!UI.favb&&within(e.target,UI.favb);DRAG.out=!inBar;if(!inBar)favMark(-1)})}
won('blur',function(){closeAll()});won('resize',function(){closeAll()});
// Esc leaves full screen only when nothing else would take it. popBusy: something open that Esc closes or ends wherever the focus
// is (a box, a menu, a page dialog, the completion list, the editor's search bar or hover card, a field session, a Code Pieces drag,
// the explorer's menu or box, Arrange, a running command). escBusy adds the places whose own Esc moves the focus: the text (the
// first Esc arms "Tab moves focus once", the next one leaves; with Tab mode on, the first leaves), the Code Pieces column (back to
// the text), the explorer's filter (back to the list), a text field with text.
function popBusy(){if(ovOpen()||MENU||CTX||TM)return true;
 function q(s){try{var x=document.querySelector(s);return !!x&&!x.hidden}catch(er){return false}}
 // qa: any one shown (an editor's find bar, a searchKit list: several exist, most of them hidden)
 function qa(s){try{var l=document.querySelectorAll(s);for(var i=0;i<l.length;i++)if(!l[i].hidden)return true}catch(er){}return false}
 if(q('dialog[open]')||q('.CodeMirror-hints')||q('.CodeMirror-dialog')||qa('.ide-find')||qa('.sk-dd')||q('.ide-hover')||q('.idk-ghost')||q('.idx-menu')||q('.idx-dlgbox'))return true;
 if(ED){try{if(typeof ED.inSession==='function'&&ED.inSession())return true}catch(x){}try{var cm=ED.cm;if(cm&&cm.state&&cm.state.completionActive)return true}catch(x){}}
 try{if(document.body&&document.body.classList&&document.body.classList.contains('arranging'))return true}catch(x){}
 try{if(typeof RUN!=='undefined'&&RUN)return true}catch(x){}
 return false}
function escBusy(e){if(popBusy())return true;var t=e.target||document.activeElement;
 if(t&&ED&&UI.edHost&&within(t,UI.edHost)){try{var cm=ED.cm;if(cm&&typeof cm.listSelections==='function'&&cm.listSelections().length>1)return true}catch(x){}
  try{if(typeof ED.tabFocus==='function'&&!ED.tabFocus())return true}catch(x){}}
 if(t&&UI.kblk&&within(t,UI.kblk))return true;
 if(t&&t.tagName&&/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)){if(UI.left&&within(t,UI.left))return true;
  if(!(UI.edHost&&within(t,UI.edHost))&&String(t.value||'')!=='')return true}
 return false}
// F2: every key of the Editor (actions with a key, then the toolbar, menu and favourites keys)
var KEYROWS=[['Left, Right','ide.keys.tb'],['Enter, Space, Down','ide.keys.open'],['Up, Down, Home, End','ide.keys.mi'],['Ctrl+D','ide.keys.fav'],
 ['Shift+F10','ide.keys.ctx'],['Delete','ide.keys.favDel'],['Ctrl+Left, Ctrl+Right','ide.keys.favMove'],['Esc','ide.keys.esc'],
 ['ide.keys.k.rclick','ide.keys.tmenu'],['ide.keys.k.click','ide.keys.tsel'],['Ctrl+Space, Shift+Left, Shift+Right','ide.keys.tselK']];
function keyList(){var order=GROUPS.concat(['other']),rows=[];
 function gi(a){var i=order.indexOf(a.group||'other');return i<0?order.length:i}
 Object.keys(IDE.actions).map(function(id){return IDE.actions[id]}).filter(function(a){return !!keyOf(a)}).sort(function(a,b){return gi(a)-gi(b)})
  .forEach(function(a){rows.push([keyOf(a),tx(a.label)])});
 KEYROWS.forEach(function(r){rows.push([r[0].indexOf('ide.')===0?tx(r[0]):r[0],tx(r[1])])});
 var t=h('table',{class:'ide-kv ide-keys'},rows.map(function(r){return h('tr',{},[h('th',{},[h('kbd',{text:r[0]})]),h('td',{text:r[1]})])}));
 showOverlay(h('div',{class:'ide-card',role:'dialog','aria-label':tx('ide.keys.h')},[ovHead(tx('ide.keys.h')),t]))}

// ---------------------------------------------------------------- editor boot
function addCss(){if(CSSDONE)return;CSSDONE=true;var hd=document.head||document.body;
 ['cm.css','ide.css'].forEach(function(f){hd.appendChild(h('link',{rel:'stylesheet',href:ASSET+f}))})}
function loadJs(f,ok){var s=document.createElement('script');s.src=ASSET+f;s.onload=function(){ok()};s.onerror=function(){bootFail(f)};(document.head||document.body).appendChild(s)}
function boot(){if(BOOT||!UI.edHost)return;BOOT='loading';drawEmpty();addCss();
 if(window.IDE_ED&&window.IDE_ED.create)return made();
 loadJs('cm.js',function(){loadJs('ide.js',made)})}
function bootFail(f){BOOT='error';ED=null;var b=UI.empty;if(!b)return;b.hidden=false;b.textContent='';
 b.appendChild(h('div',{class:'err',text:tx('ide.edFail',{f:f})}));
 b.appendChild(btn('ide.retry',function(){BOOT='';boot()},'primary','ide.retryT'))}
// every phrase the editor names (IDE_ED.PHRASES) that has a row here; the rest stay English
function phrases(){var o={},want=window.IDE_ED&&window.IDE_ED.PHRASES,m={};PHR.forEach(function(p){m[p[0]]=p[1]});
 (want&&want.length?want:PHR.map(function(p){return p[0]})).forEach(function(k){if(m[k])o[k]=tx(m[k])});return o}
function made(){try{if(!window.IDE_ED||!window.IDE_ED.create)throw new Error('IDE_ED');
  var e=window.IDE_ED.create(UI.edHost,{theme:pageTheme()==='dark'?'gem2':'light',label:tx('ide.ed.label'),phrases:phrases()});
  if(!e)throw new Error('IDE_ED.create');ED=e}catch(e){bootFail('ide.js: '+e.message);return}
 BOOT='ready';BOUND={};wireEd();bindEd();drawEmpty();drawTabm();
 var q=Q.splice(0);
 if(RESTORE)restoreSession();   // first, so a link opened at page load (below) wins the active tab
 q.forEach(function(x){IDE.open(x.ref,x.line,x.col,{view:x.view}).then(x.res)})}
// a doc's text changed: in the main editor, or (inc) in an include window that shares its buffer (IDE.edChange)
function edChange(ev){var d=ev&&ev.id!=null?byId(ev.id):IDE.active();if(!d)return;
 var was=d.dirty;isDirty(d);edited(d);if(was!==d.dirty)drawTabs();
 if(d.after){d.after=null;nextFor(d)}
 PEND[d.id]=1;if(!CHT)CHT=later(flushChanged,250);lintSoon(d);updBar()}
IDE.edChange=edChange;
function flushChanged(){CHT=null;var p=PEND;PEND={};Object.keys(p).forEach(function(id){var d=byId(id);if(d)IDE.emit('changed',{doc:d})})}
function wireEd(){
 // the editor names the doc that changed (it can be the one being swapped out): never assume the active one
 ED.on('change',edChange);
 ED.on('cursor',function(ev){var d=IDE.active();if(!d||(ev&&ev.id!=null&&ev.id!==d.id))return;var c=ED.cursor()||{line:1,col:1};drawPos(c);IDE.emit('cursor',{doc:d,line:c.line,col:c.col})});
 ED.on('save',function(){if(Date.now()-LASTSAVE>400)IDE.run('save')});
 ED.on('ctrlclick',function(p){goDef(p)});
 ED.on('tabmode',function(x){drawTabm(x&&x.on)});
 if(ED.hoverProvider)ED.hoverProvider(hoverFor);
 if(ED.hints)ED.hints(hintsFor)}
function tabFocusOn(){if(!ED||typeof ED.tabFocus!=='function')return false;try{return !!ED.tabFocus()}catch(e){return false}}
function drawTabm(on){if(!UI.tabm)return;if(on===undefined)on=tabFocusOn();UI.tabm.hidden=!on;UI.tabm.setAttribute('aria-pressed',on?'true':'false')}

// ---------------------------------------------------------------- documents
function mkDoc(ref,o,opt){var name=o.rel||ref.rel||o.key||ref.key||o.path||ref.path||'?';
 var d={id:'d'+(++NID),ref:ref,base:String(name).split('::').pop().split(/[\\\/]/).pop(),rel:o.rel||null,key:o.key||ref.key||null,
  path:o.file||o.path||null,kind:kindOf(name),text:o.text,hash:o.hash,editable:!!o.editable,why:o.why||null,eol:o.eol||'none',bom:!!o.bom,cpLines:o.cpLines||0,
  idx:o.idx==null?undefined:o.idx,suggestRel:o.suggestRel||null,findings:[],fixes:[],multi:[],dirty:false,lseq:0,after:null,ver:0,fver:-1,ltext:null,
  layer:opt&&opt.layer||null,layerKind:opt&&opt.layerKind||null};
 d.name=docName(d);return d}
function refFrom(o,ref){if(o.rel&&!ref.rel)return {mod:ref.mod,rel:o.rel};return ref}
function openQ(ref){var q={mod:ref.mod};['rel','key','idx','path'].forEach(function(k){if(ref[k]!=null)q[k]=ref[k]});return '/api/x/files/open?'+qs(q)}
var OPENED=0;   // counts opens the user or a link asked for; a session restore that is still loading must not take the tab back
// o (optional) = {view: 'kind' | false}: false = the text, a kind = that viewer; none = the viewer table decides (VIEW.kindOf)
IDE.open=function(ref,line,col,o){OPENED++;return openRef(ref,line,col,{view:o&&o.view!==undefined?o.view:undefined}).then(function(d){try{if(d&&!d.view&&d.ref&&d.ref.rel&&low(d.ref.mod||'')===low(S.mod||''))recFile(d.ref.rel)}catch(e){}return d})};
function refName(r){return r.rel||r.key||r.path||''}
// the viewer kind a ref opens with (null = text): opt.view first, then the table of ext view (no ext view: text)
function viewKind(ref,opt){if(opt.view===false||opt.view===null)return null;if(typeof opt.view==='string'&&opt.view)return opt.view;
 var V=VW();if(!V)return null;try{return V.kindOf(refName(ref),ref.key||'')||null}catch(e){return null}}
function openRef(ref0,line,col,opt){var ref=normRef(ref0);
 if(!ref){if(!opt.quiet)IDE.status(tx(S.mod?'ide.badRef':'ide.noMod'));return Promise.resolve(null)}
 if(ref.key&&ref.idx===undefined)return openKey(ref.key,line,col,opt);
 var vk=viewKind(ref,opt);
 if(vk)return openView(ref,vk,line,opt);
 var d=findDoc(ref,false);
 if(d){if(!opt.nohist)pushHist(d.ref,line);if(!opt.quiet||opt.act)activate(d);if(line&&ED&&!d.view)ED.goto(line,col||1);return Promise.resolve(d)}
 if(!ED){boot();return new Promise(function(res){Q.push({ref:ref,line:line,col:col,view:opt.view,res:res})})}
 return call(openQ(ref)).then(function(o){var r2=refFrom(o,ref),e=findDoc(r2,false);
  if(!opt.nohist)pushHist();
  if(e){if(!opt.quiet)activate(e);if(line)ED.goto(line,col||1);return e}
  var d=mkDoc(r2,o,opt);IDE.docs.push(d);ED.addDoc(d.id,d.text,d.kind,!d.editable);IDE.emit('opened',{doc:d});
  if(!opt.quiet)activate(d);else drawTabs();
  if(line&&ACT===d.id)ED.goto(line,col||1);
  if(d.ref.key&&!d.layer)layerOf(d);
  if(ACT!==d.id||fresh(d))lint(d);saveSession();return d})
 .catch(function(e){
  // not text after all (a binary or UTF-16 file the table did not know): it opens as bytes, never as an error
  if(e&&e.status===415&&opt.view!==false&&VW()){if(!opt.quiet)IDE.status(tx('ide.asBytes',{m:e.message}));return openView(ref,'hex',0,opt)}
  if(!opt.quiet)IDE.status(errMsg(e,'ide.openFail'));return null})}
// a viewer: a kind with a page of its own goes there (no tab; a quiet open or one with a line opens the bytes instead); any other
// kind is a read-only tab whose viewer is drawn the first time the tab is shown (activate -> showView)
function openView(ref,vk,line,opt){var V=VW(),sp=V&&V.spec?V.spec(vk):null;
 if(sp&&sp.where==='page'){if(!opt.quiet&&!line){var ok=false;leave(function(){try{ok=!!sp.go(V.item(ref,null,vk))}catch(x){ok=false}});if(ok)return Promise.resolve(null)}vk='hex'}
 var e=findDoc(ref,vk);
 if(e){if(!opt.nohist)pushHist();if(!opt.quiet||opt.act)activate(e);return Promise.resolve(e)}
 var q={mod:ref.mod};['rel','key','idx','path'].forEach(function(k){if(ref[k]!=null)q[k]=ref[k]});
 return call('/api/x/view/info?'+qs(q)).then(function(o){var r2=refFrom(o,ref),e2=findDoc(r2,vk);
  if(!opt.nohist)pushHist();
  if(e2){if(!opt.quiet)activate(e2);return e2}
  var why=r2.key?'layer':o.where==='outside'?(o.inPak?'pak':'outside'):'view';
  var d=mkDoc(r2,{rel:o.rel,key:o.key,file:o.file,editable:false,why:why,eol:'none'},opt);
  d.view=vk;d.kind='view';d.size=o.size;d.info=o;
  IDE.docs.push(d);IDE.emit('opened',{doc:d});
  if(!opt.quiet)activate(d);else drawTabs();
  if(d.ref.key&&!d.layer)layerOf(d);
  saveSession();return d})
 .catch(function(e){if(!opt.quiet)IDE.status(errMsg(e,'ide.openFail'));return null})}
IDE.openView=function(ref,kind){OPENED++;return openRef(ref,0,0,{view:kind||'hex'})};
// (inc) an include window was edited while its file had no tab: the file becomes a tab (not shown) whose buffer is the window's
// (ED.linkDoc: one text, one undo history, one clean mark), so save, the dirty dot, the check and the close question work as for any
// tab. o = the files/open answer the window was loaded from; src = {ed, id} (the window's editor and doc). -> doc | null
IDE.adopt=function(ref0,o,src){var ref=normRef(ref0);if(!ref||!ED||typeof ED.linkDoc!=='function')return null;
 var e=findDoc(refFrom(o,ref),false);if(e)return e;
 var d=mkDoc(refFrom(o,ref),o,{});if(!ED.linkDoc(d.id,src,d.kind,!d.editable))return null;
 IDE.docs.push(d);IDE.emit('opened',{doc:d});drawTabs();saveSession();return d};
IDE.call=call;IDE.errMsg=errMsg;IDE.saveDoc=function(d){save(d)};
// options for a second editor (an include window): the page theme, its label, the translated phrases
IDE.edOpts=function(label){return {theme:pageTheme()==='dark'?'gem2':'light',label:label,phrases:phrases()}};
// a layer opened by {key, idx} without a name: ask which() once for the layer's name
function layerOf(d){whichOf(d.ref.key).then(function(w){var row=null;(w.chain||[]).forEach(function(r){if(r.idx===d.ref.idx)row=r});if(!row||IDE.docs.indexOf(d)<0)return;
 d.layer=row.layer||null;d.layerKind=row.kind||null;d.name=docName(d);drawTabs();if(ACT===d.id){drawCrumb();drawStatus()}}).catch(function(){})}
// a viewer doc needs no editor: its host covers the text pane while it is the active tab
function activate(d){if(!d||(!ED&&!d.view))return;closeOverlay();
 // the old doc's pending change is delivered (with its own id) before the shell switches
 if(ED&&ED.flush)try{ED.flush()}catch(e){}
 ACT=d.id;TF=d.id;showView(d.view?d:null);
 if(!d.view){ED.swap(d.id);
  // marks of an older text are never drawn on a newer one: the editor keeps its own tracked marks until the re-check answers
  if(fresh(d))ED.marks(d.findings||[]);else if(lintable(d))lint(d)}
 drawTabs();drawStatus();drawCrumb();drawBars();
 IDE.emit('active',{doc:d});nextFor(d);saveSession();updBar();drawEmpty()}
// the viewer host: shows d's viewer (made on its first showing: VIEW.mount) and hides the others (handle.hide, so a sound stops);
// d = null shows the text pane again. Hidden viewers keep their state; handle.show runs when the tab is shown again.
function showView(d){if(!UI.vhost)return;
 IDE.docs.forEach(function(x){if(x.view&&x.vel&&x!==d&&!x.vel.hidden){x.vel.hidden=true;if(x.vh)try{x.vh.hide()}catch(e){}}});
 UI.vhost.hidden=!d;if(UI.edHost&&UI.edHost.style)UI.edHost.style.visibility=d?'hidden':'';
 if(!d)return;
 if(!d.vel){d.vel=h('div',{class:'ide-vw','data-kind':d.view});UI.vhost.appendChild(d.vel);var V=VW();
  if(!V){d.vel.appendChild(h('div',{class:'err ide-pad',text:tx('ide.noView')}));return}
  try{d.vh=V.mount(d.vel,d.ref,d.base,{kind:d.view})}catch(e){d.vel.appendChild(h('div',{class:'err ide-pad',text:tx('ide.partErr',{m:e.message})}))}}
 else if(d.vel.hidden){d.vel.hidden=false;if(d.vh)try{d.vh.show()}catch(e){}}
 if(IDE.pageVis)IDE.pageVis()}
function dropView(d){if(d.vh)try{d.vh.close()}catch(e){}if(d.vel&&d.vel.parentNode)d.vel.parentNode.removeChild(d.vel);d.vh=null;d.vel=null}
function closeDoc(d,noAsk){if(!d)return true;if(isDirty(d)&&!noAsk&&!confirm(tx('ide.closeQ',{n:d.name})))return false;
 var i=IDE.docs.indexOf(d);if(i<0)return true;IDE.docs.splice(i,1);if(d.view)dropView(d);else{try{ED.dropDoc(d.id)}catch(e){}}delete PEND[d.id];
 IDE.emit('closed',{doc:d});
 if(ACT===d.id){ACT=null;var n=IDE.docs[Math.min(i,IDE.docs.length-1)];if(n&&(ED||n.view))activate(n);else{showView(null);closeOverlay();if(ED)ED.marks([]);drawTabs();drawStatus();drawCrumb();drawBars();IDE.emit('active',{doc:null});IDE.next([]);updBar();drawEmpty()}}
 else drawTabs();saveSession();return true}
IDE.close=closeDoc;
function anyDirty(){return IDE.docs.some(isDirty)}
IDE.anyDirty=anyDirty;
won('beforeunload',function(e){if(anyDirty()){e.preventDefault();e.returnValue=tx('ide.leaveQ');return tx('ide.leaveQ')}});
// remember open files per mod
function sesKey(m){var g=gidNow();return 'ide.open.'+(g==='as64'?'':g+'.')+low(m)}
function saveSession(){if(!MOD||NOSAVE)return;var refs=[],act=-1;
 IDE.docs.forEach(function(d){if(low(d.ref.mod)!==low(MOD))return;var r={};['rel','key','idx','path'].forEach(function(k){if(d.ref[k]!=null)r[k]=d.ref[k]});if(d.view)r.view=d.view;if(d.id===ACT)act=refs.length;refs.push(r)});
 LS.set(sesKey(MOD),{refs:refs,act:act})}
function restoreSession(){RESTORE=false;if(!MOD||!ED)return;var s=LS.get(sesKey(MOD),null);if(!s||!s.refs||!s.refs.length)return;
 var mod=MOD,seq=OPENED,ps=s.refs.map(function(r){var v=r.view||false;r.mod=mod;delete r.view;return openRef(r,0,0,{quiet:true,nohist:true,view:v})});
 Promise.all(ps).then(function(ds){if(MOD!==mod||seq!==OPENED)return;var a=ds[s.act]||ds.filter(Boolean)[0];if(a)activate(a)})}

// ---------------------------------------------------------------- mod change
// a game switch (AS64, MoW:AS2, GoH: S.gameId) counts as a mod change even when both games use the same mod folder: the open files,
// the tree and the word lists were read in the other game's view, so they are closed (asked first when changed) and read again
function modChanged(){var old=MOD,og=GSEEN,gsw=og!==null&&og!==gidNow();MOD=S.mod||'';GSEEN=gidNow();TREE=null;BACK=[];FWD=[];drawFoot();
 if(gsw){WORDS={};NOSAVE=true}
 try{if(old){var mine=IDE.docs.filter(function(d){return gsw||low(d.ref.mod)===low(old)}),dirty=mine.filter(isDirty);
  var drop=dirty.length&&!confirm(tx('ide.modQ',{n:dirty.length}))?mine.filter(function(d){return !isDirty(d)}):mine;
  drop.forEach(function(d){closeDoc(d,true)})}}finally{NOSAVE=false}
 IDE.emit('mod',{mod:MOD});
 Object.keys(PARTS).forEach(function(k){var p=PARTS[k];if(p&&p.refresh)try{p.refresh()}catch(e){}});
 if(MOD){if(ED)restoreSession();else RESTORE=true}}

// ---------------------------------------------------------------- save, conflicts, copy
// put disk text into a doc (reload): text, hash and the byte facts the status bar shows
function takeDisk(d,o){var on=ACT===d.id,c=on?ED.cursor():null;d.text=o.text;d.hash=o.hash;d.eol=o.eol||d.eol;d.bom=!!o.bom;d.cpLines=o.cpLines||0;d.conflict=false;
 ED.setText(d.id,o.text);ED.clean(d.id);d.dirty=false;edited(d);if(c)ED.goto(c.line,c.col);drawTabs();drawBars();if(on)drawStatus();lint(d)}
// GT-20: Save never writes at once. It shows the lines that will change (the same view as "Show changes") and writes only when
// the user confirms there: the Save button (it has the focus, so Enter works) or Ctrl+S a second time. The text written is the
// text that was shown; if it changed while the view was open, the view is made again instead of writing.
var PV=null;   // the open save view: {d, text}
function save(d){d=d&&d.ref?d:IDE.active();if(!d)return;LASTSAVE=Date.now();
 if(!d.editable){if(d.why==='layer'||d.why==='outside')copyFlow(d);else IDE.status(roWhy(d));return}
 if(d.saving)return;var text=IDE.textOf(d);
 if(PV&&PV.d===d&&ovOpen()){if(PV.text===text){closeOverlay();writeDoc(d,text);return}}
 changesView(d,true)}
function confirmSave(d,text){if(IDE.docs.indexOf(d)<0)return;
 if(IDE.textOf(d)!==text){IDE.status(tx('ide.sv.moved'));changesView(d,true);return}
 closeOverlay();writeDoc(d,text)}
function writeDoc(d,text){if(d.saving)return;
 var before={};d.findings.forEach(function(f){before[f.code+'|'+f.msg]=1});
 d.saving=true;UI.note.textContent='';
 call('/api/x/files/save',{mod:d.ref.mod,rel:d.ref.rel,base:d.hash,text:text,write:true}).then(function(r){d.saving=false;
  d.text=text;if(r.hash)d.hash=r.hash;if(IDE.textOf(d)===text){ED.clean(d.id);d.dirty=false}d.conflict=false;drawTabs();drawBars();
  IDE.emit('saved',{doc:d,result:r});IDE.emit('tree',{});
  IDE.status(r.written?(r.pak?tx('ide.savedPak',{pak:r.pak,id:r.restorePoint}):tx('ide.saved',{id:r.restorePoint})):tx('ide.noChange'));
  (r.warns||[]).forEach(function(w){if(w.code==='mixed')UI.note.textContent=tx('ide.mixed',{n:w.line})});
  d.after={before:before};if(lintable(d))lint(d);else nextFor(d)})
 .catch(function(e){d.saving=false;if(e.status===409){d.conflict=true;drawBars()}else IDE.status(tx('ide.saveFail',{m:e.message}))})}
function reopen(d){return call(openQ(d.ref))}
function drawBars(){var b=UI.bars;if(!b)return;b.textContent='';var d=IDE.active();if(!d||!d.conflict)return;
 b.appendChild(h('div',{class:'ide-bar',role:'alert'},[h('b',{text:tx('ide.cf.h')}),
  btn('ide.cf.reload',function(){reopen(d).then(function(o){if(IDE.docs.indexOf(d)<0)return;takeDisk(d,o);IDE.status(tx('ide.reloaded'))}).catch(function(e){IDE.status(errMsg(e,'ide.openFail'))})},null,'ide.cf.reloadT'),
  btn('ide.cf.compare',function(){reopen(d).then(function(o){compareBox(IDE.textOf(d),tx('ide.cmp.mine'),o.text,tx('ide.cmp.disk'),d.kind)}).catch(function(e){IDE.status(errMsg(e,'ide.openFail'))})},null,'ide.cf.compareT'),
  btn('ide.cf.keep',function(){reopen(d).then(function(o){if(IDE.docs.indexOf(d)<0)return;d.hash=o.hash;d.text=o.text;d.eol=o.eol||d.eol;d.bom=!!o.bom;d.cpLines=o.cpLines||0;d.conflict=false;d.dirty=true;drawBars();save(d)}).catch(function(e){IDE.status(errMsg(e,'ide.openFail'))})},'danger','ide.cf.keepT')]))}
function relGuess(d){if(d.suggestRel)return d.suggestRel;if(d.key)return d.key;var p=low(d.path),i=p.indexOf('/resource/');return i>=0?p.slice(i+1):''}
function copyFlow(d){d=d||IDE.active();if(!d)return;if(IRM){IDE.status(tx('rmt.viewOnly'));return}if(d.why==='pak'||(!d.ref.key&&!d.ref.path)){IDE.status(roWhy(d));return}
 var inp=h('input',{type:'text',value:relGuess(d),'aria-label':tx('ide.cp.rel'),class:'ide-wide'}),box=h('div');
 function body(){var b={mod:d.ref.mod,rel:inp.value.trim()};if(d.ref.key){b.key=d.ref.key;b.idx=d.ref.idx}else b.path=d.ref.path;return b}
 function prev(){box.textContent='';var b=body();if(!b.rel){box.appendChild(h('div',{class:'err',text:tx('ide.cp.needRel')}));return}
  call('/api/x/files/copy',b).then(function(p){box.textContent='';box.appendChild(h('div',{class:'ide-hint',text:tx('ide.cp.to',{p:p.file})}));
   if(p.same){box.appendChild(h('div',{class:'ok',text:tx('ide.cp.same')}));box.appendChild(btn('ide.cp.openIt',function(){closeOverlay();IDE.open({mod:d.ref.mod,rel:p.rel})},'primary'));return}
   if(p.exists){box.appendChild(h('div',{class:'err',text:tx('ide.cp.over')}));box.appendChild(hunkList(p.hunks))}else box.appendChild(h('div',{class:'ide-hint',text:tx('ide.cp.new')}));
   box.appendChild(h('div',{class:'row'},[btn('ide.cp.do',function(){b.write=true;call('/api/x/files/copy',b).then(function(r){closeOverlay();TREE=null;IDE.emit('tree',{});
     IDE.status(tx('ide.cp.done',{id:r.restorePoint||''}));IDE.open({mod:d.ref.mod,rel:r.rel})}).catch(function(e){box.appendChild(errEl(e))})},'primary'),
    btn('ide.cancel',closeOverlay)]))}).catch(function(e){box.textContent='';box.appendChild(errEl(e))})}
 inp.addEventListener('change',prev);
 showOverlay(h('div',{class:'ide-card'},[ovHead(tx('ide.cp.h')),h('label',{text:tx('ide.cp.rel')}),inp,box]));prev();later(function(){inp.focus()})}
function hunkList(hs){var pre=h('pre',{class:'ide-diff'});
 (hs||[]).forEach(function(k){pre.appendChild(h('span',{class:'ide-dh',text:'@@ '+tx('ide.ln',{n:k.oldLine})+'\n'}));
  (k.del||[]).forEach(function(t){pre.appendChild(h('span',{class:'ide-dd',text:'- '+t+'\n'}))});
  (k.add||[]).forEach(function(t){pre.appendChild(h('span',{class:'ide-da',text:'+ '+t+'\n'}))})});return pre}
// GT-20: "Show changes" used to be enabled only while the file had unsaved edits, and with no edits it only put a fading line in
// the status bar, so after a save it looked dead. Now it is enabled for every file of the mod and always opens the view.
function showChanges(){var d=IDE.active();if(!d||!d.editable)return;changesView(d,false)}
// the changed lines (a preview from the server, nothing written) with Save and Cancel; fromSave only changes the title
function changesView(d,fromSave){var text=IDE.textOf(d);
 if(text===d.text&&!isDirty(d)){noChanges(d);return}
 IDE.status(tx('ide.sv.busy'));
 call('/api/x/files/save',{mod:d.ref.mod,rel:d.ref.rel,base:d.hash,text:text}).then(function(p){IDE.status('');if(IDE.docs.indexOf(d)<0)return;
  if(!p.changed){noChanges(d);return}
  var kids=[ovHead(tx(fromSave?'ide.sv.h':'ide.ch.h',{p:d.name})),h('div',{class:'ide-hint',text:tx('ide.sv.lead',{p:p.file||d.name})}),hunkList(p.hunks)];
  (p.warns||[]).forEach(function(w){if(w.code==='mixed')kids.push(h('div',{class:'err',text:tx('ide.mixed',{n:w.line})}))});
  var sb=btn('ide.sv.do',function(){confirmSave(d,text)},'primary','ide.sv.doT');
  kids.push(h('div',{class:'row'},[sb,btn('ide.cancel',closeOverlay)]));
  showOverlay(h('div',{class:'ide-card',role:'dialog','aria-label':tx(fromSave?'ide.sv.h':'ide.ch.h',{p:d.name})},kids));PV={d:d,text:text}})
 .catch(function(e){IDE.status('');if(e.status===409){d.conflict=true;drawBars()}else IDE.status(errMsg(e))})}
function noChanges(d){showOverlay(h('div',{class:'ide-card'},[ovHead(tx('ide.ch.h',{p:d.name})),h('p',{text:tx('ide.noChange')}),h('div',{class:'row'},[btn('ide.close',closeOverlay)])]))}
// one replace edit over the whole text: Ctrl+Z brings the edits back
function revert(){var d=IDE.active();if(!d||!isDirty(d))return;if(!confirm(tx('ide.revertQ',{n:d.name})))return;
 var c=ED.cursor(),cm=ED.cm,done=false;
 if(cm&&cm.getDoc&&(!ED.current||ED.current()===d.id)){try{var doc=cm.getDoc(),last=doc.lastLine();
  cm.operation(function(){doc.replaceRange(String(d.text==null?'':d.text),{line:0,ch:0},{line:last,ch:doc.getLine(last).length},'+revert')});done=true}catch(e){done=false}}
 if(!done)ED.setText(d.id,d.text);
 ED.clean(d.id);d.dirty=false;edited(d);if(c)ED.goto(c.line,c.col);drawTabs();lint(d);updBar();IDE.status(tx('ide.reverted'))}

// ---------------------------------------------------------------- lint
function lintSoon(d){if(!lintable(d))return;clearTimeout(d.lt);d.lt=later(function(){lint(d)},250)}
// the answer is used only while the text is still the text that was sent
// one check per file in flight: a check asked for while one runs waits for its answer and then runs once, on the text of that moment
// (the server checks one text at a time; a second POST of the whole file would only queue behind the first). A check that has not
// answered for 20 s no longer holds the next one back
function lint(d){if(IRM||!lintable(d)){drawStatus();return}if(d.lfly&&Date.now()-d.lfly<20000){d.lagain=true;return}
 var s=++d.lseq,v=d.ver,text=IDE.textOf(d);d.lfly=Date.now()||1;d.lagain=false;d.checking=true;if(ACT===d.id)drawStatus();
 call('/api/x/ide/lint',refBody(d,{text:text})).then(function(r){if(s!==d.lseq||IDE.docs.indexOf(d)<0)return;d.lfly=0;
  if(d.lagain){lint(d);return}
  if(d.ver!==v||IDE.textOf(d)!==text){lintSoon(d);return}
  d.checking=false;d.fver=v;d.ltext=text;
  d.findings=(r.findings||[]).slice().sort(function(a,b){return a.line-b.line||a.col-b.col});
  d.fixes=(r.fixes||[]).map(function(x){x._ver=v;return x});d.multi=r.multi||[];d.lintErr=null;
  if(ACT===d.id)ED.marks(d.findings);IDE.emit('lint',{doc:d,findings:d.findings,fixes:d.fixes,multi:d.multi,ver:v});drawStatus();nextFor(d);updBar()})
 .catch(function(e){if(s!==d.lseq)return;d.lfly=0;if(d.lagain&&IDE.docs.indexOf(d)>=0){lint(d);return}d.checking=false;d.lintErr=e.message;drawStatus()})}

// ---------------------------------------------------------------- hover, explain, hints
function getExplain(code){if(EXPL[code]!==undefined)return Promise.resolve(EXPL[code]);
 return call('/api/explain?codes='+encodeURIComponent(code)+'&lang='+encodeURIComponent(typeof LANG==='string'?LANG:'en')).then(function(j){EXPL[code]=(j.cards&&j.cards[code])||null;return EXPL[code]}).catch(function(){return null})}
function fixFor(d,f){var a=(d.fixes||[]).filter(function(x){return x.line===f.line&&(!x.code||x.code===f.code)});return a[0]||null}
function hoverFor(req,done){var d=IDE.active();if(!d)return done(null);
 if(req.mark){var f=req.mark;getExplain(f.code).then(function(e){var fx=fixFor(d,f),rows=[];
   var st=e&&e.known!==false&&e.fix?[].concat(e.fix).filter(function(s){return !genericStep(s)}):[];
   if(e&&e.why)rows.push([tx('ide.c.why'),e.why]);if(st.length)rows.push([tx('ide.c.fix'),st.join(' ')]);
   done({title:(e&&e.what)||tx('ide.c.title'),lead:f.msg,rows:rows,links:[{text:tx('ide.c.explain'),run:function(){explainBox(d,f)}}],fix:fx?{label:txp(fx.label),run:function(){applyFix(fx,d)}}:undefined})});return}
 if(!navable(d))return done(null);
 hoverNav(d,req,done)}
IDE.navCard=function(v){return navCard(v)};
function navCard(v){return {title:v.title||'',lead:txp(v.lead),rows:(v.rows||[]).map(function(x){return [typeof x.k==='string'?tx(x.k):txp(x.k),x.v]}),
  links:(v.links||[]).map(function(l){return {text:l.text||txp(l.k),run:function(){IDE.go(l.link)}}})}}
// clean doc: only the ref (the server reads the file); dirty doc: the text, at most every 250 ms; the same word at the same
// version is answered from the last answer
function hoverNav(d,req,done){if(IRM)return done(null);var w=null;try{w=ED.wordAt?ED.wordAt({line:req.line,col:req.col}):null}catch(e){}
 var key=d.id+'|'+d.ver+'|'+(w?w.line+':'+w.col+':'+w.len:req.line+':'+req.col);
 if(HV.key===key)return done(HV.card);
 var clean=!isDirty(d);
 function fire(){HV.tm=null;HV.t=Date.now();var bare=clean&&!HV.needText;
  var body=bare?refBody(d,{line:req.line,col:req.col}):refBody(d,{text:IDE.textOf(d),line:req.line,col:req.col});
  call('/api/x/ide/hover',body).then(function(r){var v=r&&r.hover,c=v?navCard(v):null;
   // (inc) an include line: show the file in a window right under it
   if(c&&v.what==='include'&&typeof IDE.incToggle==='function'){var ln=req.line;c.links.unshift({text:tx('ide.inc.showHere'),run:function(){IDE.incToggle(ln)}})}
   HV.key=key;HV.card=c;done(c)})
  .catch(function(e){if(bare&&e.status===400&&/text/i.test(e.message||'')){HV.needText=true;return fire()}done(null)})}
 clearTimeout(HV.tm);HV.tm=null;
 if(clean)return fire();
 var wait=250-(Date.now()-HV.t);if(wait>0)HV.tm=later(fire,wait);else fire()}
var WORDS={};
function hintsFor(req,done){var d=IDE.active();if(IRM||!d||!navable(d)||!S.mod)return done([]);var k=gidNow()+'|'+low(S.mod)+'|'+d.kind;
 var p=WORDS[k]||(WORDS[k]=call('/api/x/ide/words?'+qs({mod:S.mod,kind:d.kind})).then(function(j){return j.words||[]}).catch(function(){delete WORDS[k];return []}));
 p.then(function(ws){var q=String(req.prefix||'').toLowerCase();done(ws.filter(function(w){return !q||String(w.w).toLowerCase().indexOf(q)===0}).slice(0,200))})}
// (searchKit) words for the Editor's search boxes: IDE.words(cb) -> cb({file:[{w,n,lo}], game:[{w,hint,lo}]}). file = the words of the
// open text (made once per text version, at most 20000, most used first); game = the autocomplete words of its kind (GET ide/words,
// read once per game, mod and kind, the list hintsFor uses). A box asks it per keystroke: both lists are kept, never made again.
var WIX={id:null,ver:null,a:[]},GWX={};
function fileWords(){var d=IDE.active();if(!d||d.view||!ED)return [];var v=d.ver==null?String(d.hash):d.ver;if(WIX.id===d.id&&WIX.ver===v)return WIX.a;
 var t=String(IDE.textOf(d)||''),m={},a=[],re=/[A-Za-z_À-￿][A-Za-z0-9_.\-À-￿]*/g,x;
 while((x=re.exec(t))){var w=x[0].replace(/[.\-]+$/,'');if(w.length<2)continue;var e=m['$'+w];if(e){e.n++;continue}if(a.length>=20000)continue;e=m['$'+w]={w:w,n:1,lo:w.toLowerCase()};a.push(e)}
 a.sort(function(p,q){return q.n-p.n||(p.lo<q.lo?-1:p.lo>q.lo?1:0)});WIX={id:d.id,ver:v,a:a};return a}
IDE.words=function(cb){var d=IDE.active(),fw=fileWords();if(IRM||!d||!navable(d)||!S.mod){cb({file:fw,game:[]});return}
 var k=gidNow()+'|'+low(S.mod)+'|'+d.kind;if(GWX[k]){cb({file:fw,game:GWX[k]});return}
 var p=WORDS[k]||(WORDS[k]=call('/api/x/ide/words?'+qs({mod:S.mod,kind:d.kind})).then(function(j){return j.words||[]}).catch(function(){delete WORDS[k];return []}));
 p.then(function(ws){var g=ws.map(function(x){return {w:String(x.w),hint:x.hint||'',lo:String(x.w).toLowerCase()}});if(g.length)GWX[k]=g;cb({file:fileWords(),game:g})})};
function markAt(d,line){var fs=(d.findings||[]).filter(function(f){return f.line===line});return fs[0]||null}
// GT-20 Explain: catch-all cards end in "Read the message and look at the line shown", which tells the user nothing new. Those
// steps are dropped; the box shows the message, where it is, and the steps this editor can do on the spot (go to the line, the
// fix, compare with the game's copy, find the word in the game files). The rule name and limit ids sit in a closed "Details".
function genericStep(s){return /^\s*Read the (tool )?message/i.test(String(s||''))}
function findingWord(d,f){if(!f.len||f.exact===false)return '';var l=String(IDE.textOf(d)||'').split('\n')[f.line-1]||'';
 var w=l.substr(Math.max(0,(f.col||1)-1),f.len).replace(/^["\s]+|["\s]+$/g,'');return w.length>=2&&w.length<=80?w:''}
function explainBox(d,f){getExplain(f.code).then(function(e){var fx=fixFor(d,f);
 var kids=[ovHead((e&&e.what)||tx('ide.c.title')),h('p',{text:f.msg}),h('div',{class:'ide-hint',text:tx('ide.c.at',{n:f.line,c:f.col||1})})];
 if(e&&e.why)kids.push(h('div',{},[h('b',{text:tx('ide.c.why')+' '}),h('span',{text:e.why})]));
 var steps=e&&e.known!==false&&e.fix?[].concat(e.fix).filter(function(s){return !genericStep(s)}):[];
 kids.push(h('b',{text:tx('ide.c.fix')}));
 if(steps.length)kids.push(h('ol',{},steps.map(function(s){return h('li',{text:s})})));
 else kids.push(h('p',{text:tx(fx?'ide.c.selfFix':'ide.c.self')}));
 var row=[],word=findingWord(d,f),key=d.key||d.ref.key;
 if(fx)row.push(h('button',{type:'button',class:'primary',text:txp(fx.label),onclick:function(){closeOverlay();applyFix(fx,d)}}));
 row.push(h('button',{type:'button',text:tx('ide.c.goLine',{n:f.line}),onclick:function(){closeOverlay();gotoLine(f.line,f.col||1)}}));
 if(key)row.push(btn('ide.c.cmp',function(){closeOverlay();compareVanilla()}));
 if(word)row.push(h('button',{type:'button',text:tx('ide.c.find',{w:word}),onclick:function(){closeOverlay();IDE.emit('search',{q:word});IDE.panel('search')}}));
 if((d.multi||[]).indexOf(f.code)>=0)row.push(btn('ide.n.patch',function(){closeOverlay();IDE.goPage('check')}));
 row.push(btn('ide.close',closeOverlay));kids.push(h('div',{class:'row'},row));
 var det=[h('summary',{text:tx('ide.c.details')}),h('div',{class:'ide-hint',text:tx('ide.c.code',{c:f.code})})];
 if(e&&e.limits&&e.limits.length)det.push(h('div',{class:'ide-hint',text:tx('ide.c.limits',{ids:e.limits.join(', ')})}));
 if(!e)det.push(h('div',{class:'ide-hint',text:tx('ide.c.noCard')}));
 kids.push(h('details',{},det));
 if(ACT!==d.id)return;showOverlay(h('div',{class:'ide-card'},kids))})}
// Alt+F1: the hover card for the cursor, as a shell box at the cursor (keyboard reachable, Esc closes)
function cursorFinding(d,c){if(!fresh(d))return null;var fs=(d.findings||[]).filter(function(f){return f.line===c.line&&c.col>=(f.col||1)&&c.col<=(f.col||1)+Math.max(1,f.len||0)});return fs[0]||null}
function caretAt(){var cm=ED&&ED.cm,host=UI.mid;if(!cm||!cm.cursorCoords||!host||!host.getBoundingClientRect)return null;
 try{var c=cm.cursorCoords(null,'window'),r=host.getBoundingClientRect();
  return {left:Math.max(4,Math.min(c.left-r.left,r.width-360)),top:Math.max(4,Math.min(c.bottom-r.top+2,r.height-180))}}catch(e){return null}}
function cardBox(c){var kids=[ovHead(c.title||tx('ide.info.h'))];if(c.lead)kids.push(h('p',{text:c.lead}));
 (c.rows||[]).forEach(function(r){kids.push(h('div',{class:'ide-info-r'},[h('b',{text:String(r[0]==null?'':r[0])+' '}),h('span',{text:String(r[1]==null?'':r[1])})]))});
 var row=[];(c.links||[]).forEach(function(l){row.push(h('button',{type:'button',text:l.text||'',onclick:function(){closeOverlay();l.run()}}))});
 if(c.fix)row.unshift(h('button',{type:'button',class:'primary',text:c.fix.label,onclick:function(){closeOverlay();c.fix.run()}}));
 if(row.length)kids.push(h('div',{class:'row'},row));
 return h('div',{class:'ide-card ide-info',role:'dialog','aria-label':c.title||tx('ide.info.h')},kids)}
function infoHere(){var d=IDE.active();if(!d||!ED)return;var c=ED.cursor()||{line:1,col:1},f=cursorFinding(d,c);
 if(!f&&!navable(d)){IDE.status(tx('ide.noInfo'));return}
 var at=caretAt();
 hoverFor({line:c.line,col:c.col,mark:f||undefined},function(card){if(ACT!==d.id)return;if(!card){IDE.status(tx('ide.noInfo'));return}showOverlay(cardBox(card),{at:at})})}
IDE.info=infoHere;

// ---------------------------------------------------------------- fixes, problems
// a fix is used only on the doc it was made for, while that doc is shown and its text is the text that was checked
function applyFix(fx,d){d=d||IDE.active();if(!ED||!fx||!d||IDE.docs.indexOf(d)<0)return false;
 if(ACT!==d.id){IDE.status(tx('ide.fixOther',{n:d.name}));return false}
 if(!d.editable){IDE.status(roWhy(d));return false}
 if(fx._ver!==d.ver||!fresh(d)){stale(d);return false}
 ED.applyEdits(fx.edits||[]);edited(d);updBar();IDE.status(tx('ide.fixed',{l:txp(fx.label)}));return true}
IDE.applyFix=applyFix;
function fixHere(){var d=IDE.active();if(!d)return;if(!fresh(d))return stale(d);var c=ED.cursor()||{line:1};var a=(d.fixes||[]).filter(function(x){return x.line===c.line});
 if(!a.length){IDE.status(tx('ide.noFixHere'));return}if(a.length===1)return applyFix(a[0],d);
 pickList(tx('ide.pk.fix'),a.map(function(x){return {label:txp(x.label),hint:x.code+(x.safe?'':'  '+tx('ide.risky')),run:function(){applyFix(x,d)}}}),{key:'ide.fix'})}
function applyMany(d,fs){var seen={},edits=[],n=0,skip=0;
 fs.forEach(function(x){if(seen[x.line]){skip++;return}seen[x.line]=1;n++;edits=edits.concat(x.edits||[])});
 if(!edits.length)return {n:0,m:skip};
 edits.sort(function(a,b){return b.line-a.line||b.col-a.col});ED.applyEdits(edits);edited(d);updBar();return {n:n,m:skip}}
function fixAll(){var d=IDE.active();if(!d)return;if(!fresh(d))return stale(d);
 var r=applyMany(d,(d.fixes||[]).filter(function(x){return x.safe&&x._ver===d.ver}));
 if(!r.n){IDE.status(tx('ide.noSafe'));return}
 IDE.status(tx(r.m?'ide.fixedAllMore':'ide.fixedAll',{n:r.n,m:r.m}))}
function moveProblem(dir){var d=IDE.active();if(!d)return;if(!fresh(d))return stale(d);var fs=d.findings||[];if(!fs.length){IDE.status(tx('ide.noProblems'));return}
 var c=ED.cursor()||{line:1,col:1},t=null,i;
 if(dir>0){for(i=0;i<fs.length;i++)if(fs[i].line>c.line||(fs[i].line===c.line&&fs[i].col>c.col)){t=fs[i];break}if(!t)t=fs[0]}
 else{for(i=fs.length-1;i>=0;i--)if(fs[i].line<c.line||(fs[i].line===c.line&&fs[i].col<c.col)){t=fs[i];break}if(!t)t=fs[fs.length-1]}
 ED.goto(t.line,t.col||1);ED.focus();IDE.status(t.code+': '+t.msg)}
function explainHere(){var d=IDE.active();if(!d)return;if(!fresh(d))return stale(d);var c=ED.cursor()||{line:1},f=markAt(d,c.line);if(!f){IDE.status(tx('ide.noMark'));return}explainBox(d,f)}

// ---------------------------------------------------------------- navigation
// (trail) every jump records the place it left: file, line, col and scroll (ED.view). A jump to within HNEAR lines of the cursor in
// the same file is not recorded; the history keeps HCAP places (page session). The footnote under the text shows the last one
// ("Came from file:line, Back") and a short trail of the ones before it.
var HCAP=50,HNEAR=3,HTRAIL=4;
function here(){var d=IDE.active();if(!d)return null;if(d.view)return {ref:d.ref,line:0,col:0,view:d.view,name:d.name};if(!ED)return null;var c=ED.cursor()||{line:1,col:1},v=null;
 // a jump started from an include window leaves from that window's include line (ui/inc.js)
 if(typeof IDE.incOrigin==='function'){try{var io=IDE.incOrigin();if(io)c=io}catch(e){}}
 try{v=ED.view?ED.view():null}catch(e){v=null}return {ref:d.ref,line:c.line,col:c.col,view:false,top:v&&typeof v.top==='number'?v.top:null,name:d.name}}
function pushHist(tref,tline){var p=here();if(!p)return;
 if(tref&&!p.view&&refId(normRef(tref)||tref)===refId(p.ref)&&(!tline||Math.abs(tline-p.line)<=HNEAR))return;
 var t=BACK[BACK.length-1];if(t&&refId(t.ref)===refId(p.ref)&&Math.abs(t.line-p.line)<=HNEAR&&t.view===p.view){BACK[BACK.length-1]=p;FWD=[];drawFoot();return}
 BACK.push(p);while(BACK.length>HCAP)BACK.shift();FWD=[];drawFoot()}
function histGo(from,to){var p=from.pop();if(!p)return IDE.status(tx('ide.noHist'));var c=here();if(c)to.push(c);drawFoot();
 return openRef(p.ref,p.line,p.col,{nohist:true,view:p.view||false}).then(function(d){
  if(!d){if(c&&to[to.length-1]===c)to.pop();drawFoot();IDE.status(tx('ide.hist.gone',{p:placeName(p)}));return null}
  if(d.view){if(d.vh)d.vh.focus()}else if(ED){ED.goto(p.line,p.col||1);if(p.top!=null&&ED.setView)try{ED.setView({top:p.top})}catch(e){}ED.focus()}
  drawFoot();return d})}
function placeName(p){var r=p.ref||{},n=p.name||String(r.rel||r.key||r.path||'?').split('::').pop().split(/[\\\/]/).pop();return n+(p.line?':'+p.line:'')}
// back n steps at once (a trail item)
function histBackTo(n){var p=null;while(n-->1&&BACK.length){p=BACK.pop();FWD.push(p)}return histGo(BACK,FWD)}
function drawFoot(){var f=UI.foot;if(!f)return;f.textContent='';var t=BACK[BACK.length-1];f.parentNode&&(f.parentNode.hidden=!t&&!FWD.length);if(!t&&!FWD.length)return;
 if(t){f.appendChild(h('span',{class:'ide-footw',text:tx('ide.hist.from',{p:placeName(t)})}));
  f.appendChild(h('button',{type:'button',class:'ide-tbb ide-footb',text:tx('ide.hist.back'),'aria-keyshortcuts':'Alt+ArrowLeft','aria-label':tx('ide.hist.backT',{p:placeName(t)}),onclick:function(){histGo(BACK,FWD)}}))}
 if(FWD.length){var fw=FWD[FWD.length-1];f.appendChild(h('button',{type:'button',class:'ide-tbb ide-footb',text:tx('ide.hist.fwd'),'aria-keyshortcuts':'Alt+ArrowRight','aria-label':tx('ide.hist.fwdT',{p:placeName(fw)}),onclick:function(){histGo(FWD,BACK)}}))}
 var tr=[];for(var i=BACK.length-2;i>=0&&tr.length<HTRAIL;i--)tr.push(i);
 if(tr.length){f.appendChild(h('span',{class:'ide-footw',text:tx('ide.hist.trail')}));
  tr.forEach(function(i){var p=BACK[i],n=BACK.length-i;f.appendChild(h('button',{type:'button',class:'ide-footl',text:placeName(p),'aria-label':tx('ide.hist.toT',{p:placeName(p)}),onclick:function(){histBackTo(n)}}))})}}
IDE.hist={back:function(){return histGo(BACK,FWD)},fwd:function(){return histGo(FWD,BACK)},list:function(){return BACK.slice()},fwdList:function(){return FWD.slice()},push:pushHist,CAP:HCAP,NEAR:HNEAR};
// (trail) an action that shows another page of the GUI: that page gets a footnote "Back to the editor at file:line" (a strip fixed to
// the window foot, shown while that page is the one shown; it goes when the Editor is shown again or another page is)
var LEFT=null;
function leave(fn){var p=here();try{fn()}catch(e){}if(!p||S.cur==='ide')return;var to=S.cur;
 if(LEFT&&LEFT.el&&LEFT.el.parentNode)LEFT.el.parentNode.removeChild(LEFT.el);
 var el=h('div',{class:'ide-leftfoot',role:'navigation','aria-label':tx('ide.hist.away')},[h('button',{type:'button',class:'primary',text:tx('ide.hist.toEd',{p:placeName(p)}),onclick:function(){dropLeft();show('ide');
  openRef(p.ref,p.line,p.col,{nohist:true,view:p.view||false}).then(function(d){if(!d){IDE.status(tx('ide.hist.gone',{p:placeName(p)}));return}if(!d.view&&ED){ED.goto(p.line,p.col||1);if(p.top!=null&&ED.setView)try{ED.setView({top:p.top})}catch(e){}ED.focus()}})}})]);
 LEFT={p:p,to:to,el:el};document.body.appendChild(el);watchLeft()}
function dropLeft(){if(LEFT&&LEFT.el&&LEFT.el.parentNode)LEFT.el.parentNode.removeChild(LEFT.el);LEFT=null}
function watchLeft(){if(!LEFT)return;if(S.cur!==LEFT.to){dropLeft();return}later(watchLeft,500)}
IDE.leave=leave;IDE.goPage=function(id){leave(function(){show(id)})};IDE.left=function(){return LEFT?{to:LEFT.to,p:LEFT.p,el:LEFT.el}:null};
function gotoLine(line,col){var d=IDE.active();if(!d)return;pushHist(d.ref,line);ED.goto(line,col||1);ED.focus()}
function follow(t){if(!t)return;if(t.link==null){gotoLine(t.line||1,t.col||1);return}IDE.go(t.link)}
// a message the user cannot miss: the status line, and the page's toast when there is one
function sayLoud(k){var t=tx(k);IDE.status(t);if(typeof toast==='function')toast(t)}
// no file to jump to (a key, a tag, a number): what the Editor knows about the word is shown as a card, the same facts as the hover
function defCard(d,pos,miss){call('/api/x/ide/hover',refBody(d,{text:IDE.textOf(d),line:pos.line,col:pos.col})).then(function(r){var v=r&&r.hover;if(!v)return sayLoud(miss);var c=navCard(v);
  showOverlay(h('div',{class:'ide-card ide-defcard'},[ovHead(c.title||tx('ide.a.def')),c.lead?h('p',{text:c.lead}):null,
   c.rows.length?h('table',{class:'ide-kv'},c.rows.map(function(x){return h('tr',{},[h('th',{text:String(x[0])}),h('td',{text:String(x[1]==null?'':x[1])})])})):null,
   c.links.length?h('div',{class:'row'},c.links.map(function(l){return h('button',{type:'button',text:l.text,onclick:function(){closeOverlay();l.run()}})})):null,
   h('p',{class:'ide-hint',text:tx('ide.defCardT')})].filter(Boolean)))}).catch(function(e){if(window.console)console.warn(e);sayLoud(miss)})}
function goDef(pos){var d=IDE.active();if(!d)return sayLoud('ide.noFile');if(!navable(d))return sayLoud('ide.defKind');pos=pos||ED.cursor();if(!pos)return;
 call('/api/x/ide/def',refBody(d,{text:IDE.textOf(d),line:pos.line,col:pos.col})).then(function(r){var ts=r.targets||[];
  if(!ts.length)return defCard(d,pos,r.loading?'ide.defLoading':'ide.noDef');if(ts.length===1)return follow(ts[0]);
  // Browse: the game data at the folder of the first place (key: links), the picked file's game path filters the places
  var k0=/^key:(?:resource\/)?(.*)\/[^\/]*$/i.exec(String(ts[0].link||''));
  pickList(tx('ide.pk.def'),ts.map(function(t){return {label:t.label||String(t.link),hint:t.line?tx('ide.ln',{n:t.line}):'',run:function(){follow(t)}}}),{nofilter:ts.length<8,key:'ide.def',
   browse:{mode:'file',view:'data',start:k0?k0[1]:'',toValue:function(p,e){return (e&&e.path)||p}}})})
 .catch(function(e){IDE.status(errMsg(e))})}
function findRefs(){var d=IDE.active();if(!d||!navable(d))return;var c=ED.cursor()||{line:1,col:1};
 call('/api/x/ide/refs',refBody(d,{text:IDE.textOf(d),line:c.line,col:c.col}),{what:tx('ide.job.refs')}).then(function(r){IDE.emit('refs',{name:r.name,hits:r.hits||[],truncated:!!r.truncated,kind:r.kind});IDE.panel('usages');
  if(!(r.hits||[]).length)IDE.status(tx('ide.noRefs',{n:r.name||''}))}).catch(function(e){IDE.status(errMsg(e))})}
function askLine(){var d=IDE.active();if(!d)return;var inp=h('input',{type:'text',inputmode:'numeric',autocomplete:'off','aria-label':tx('ide.gl.h'),placeholder:tx('ide.gl.ph')});
 inp.addEventListener('keydown',function(e){if(e.isComposing||e.keyCode===229)return;if(e.key==='Enter'){e.preventDefault();var m=/^\s*(\d+)(?:\s*[:,]\s*(\d+))?\s*$/.exec(inp.value);if(!m){IDE.status(tx('ide.gl.bad'));return}closeOverlay();gotoLine(Number(m[1]),Number(m[2]||1))}});
 showOverlay(h('div',{class:'ide-pick'},[pickHead(tx('ide.gl.h')),inp]));later(function(){inp.focus()})}
function outline(){var d=IDE.active();if(!d)return;if(!navable(d))return IDE.status(tx('ide.noOutline'));
 call('/api/x/ide/symbols',refBody(d,{text:IDE.textOf(d)})).then(function(r){var ss=r.symbols||[];if(!ss.length)return IDE.status(tx('ide.noOutline'));
  // history 'ide.outline'; the blocks of the open text have no file of their own: Browse is the kit's default file picker
  pickList(tx('ide.pk.outline'),ss.map(function(s){return {label:new Array((s.depth||0)+1).join('  ')+s.name,hint:tx('ide.ln',{n:s.line}),run:function(){gotoLine(s.line,1)}}}),{key:'ide.outline'})})
 .catch(function(e){IDE.status(errMsg(e))})}
// the mod's file list for Go to file: the Editor's own tree (GET ide/tree, no file maximum) read in pages as the explorer reads it: the
// next page from the answer's next, the list's stamp (ver) on every later page; a page with another stamp means the list was made
// again, so it is read again from 0 once, then it ends 'changed'. An error after some pages ends it 'error' with what was read. A server
// or phone without the route (403, 404, 501) gives the one-answer files/tree. When the explorer already holds the whole list of this mod
// (read whole, nothing pending), that list is used and nothing is read. T = {mod, files, gen (+1 when the list starts again), more,
// partial: null|'error'|'changed', why, cut (files/tree said it stopped short), subs: callbacks per page}. A list that ended partial is
// read again on the next Go to file; a read nobody waits for any more (TREE dropped, no box open) stops.
var TPG1=2000,TPG2=20000;
function tRefused(e){return !!e&&(e.status===403||e.status===404||e.status===501)}
function getTree(){var m=S.mod;if(TREE&&TREEMOD===m&&!TREE.partial)return TREE;
 var T={mod:m,files:[],lw:[],gen:0,more:true,partial:null,why:'',cut:false,subs:[]};TREE=T;TREEMOD=m;
 var xf=null;try{var X=PARTS.explorer;xf=X&&typeof X.files==='function'?X.files(m):null}catch(e){xf=null}
 if(xf){T.files=xf;T.more=false;return T}
 var ver=null,tries=0;
 function live(){return S.mod===m&&(TREE===T||T.subs.length>0)}
 function tell(){T.subs.slice().forEach(function(f){try{f(T)}catch(e){if(window.console)console.error(e)}})}
 function end(part,why){T.more=false;T.partial=part||null;T.why=why||'';tell()}
 function page(off){call('/api/x/ide/tree?'+qs({mod:m,off:off,lim:off?TPG2:TPG1,ver:ver}),undefined,off?{job:false}:{what:tx('ide.job.tree')}).then(function(r){if(!live())return;r=r||{};
   if(off&&r.ver!==ver){if(tries++<1){T.files=[];T.lw=[];T.gen++;ver=null;page(0);tell();return}return end('changed')}
   ver=r.ver||null;var fs=r.files||[];for(var i=0;i<fs.length;i++)T.files.push(fs[i]);
   if(r.next!=null&&fs.length>0){page(r.next);tell();return}
   end(r.partial?'error':null,r.error)},
  function(e){if(!live())return;
   if(!off&&tRefused(e))return call('/api/x/files/tree?'+qs({mod:m}),undefined,{what:tx('ide.job.tree')}).then(function(t){if(!live())return;T.files=(t&&t.files)||[];T.cut=!!(t&&t.truncated);end(null)},
    function(e2){if(live())end('error',e2.message)});
   end('error',e.message)})}
 page(0);return T}
function fuzzy(q,s){if(!q)return 1;var i=s.indexOf(q);if(i>=0)return 3-(i?1:0)+(s.lastIndexOf('/')<i?1:0);var j=0;for(var k=0;k<s.length&&j<q.length;k++)if(s.charAt(k)===q.charAt(j))j++;return j===q.length?0.5:0}
// Go to file (Ctrl+P): the mod's files by name. The list is matched while its pages arrive. The match runs in time slices (about
// GFSLICE ms, then the page is free again); a new keystroke stops the old run. Only the best GFMAX rows are kept and drawn, the line
// under the box says how many match in all and that the list is still being read. Files opened lately come first: all of them with no
// text typed, and ahead of an equal match once text is typed. IDE.goFileState() is read only, for tests (the last runs, newest last).
// Test hook: window.IDE_XTEST.gfslice = ms per slice.
var GFSLICE=12,GFMAX=300,GFL=[];
function gfBudget(){var x=window.IDE_XTEST;return x&&typeof x.gfslice==='number'?x.gfslice:GFSLICE}
function gfInfo(J){return {w:J.w,done:J.done,dead:J.dead,n:J.n,scanned:J.i,shown:J.top.length}}
IDE.goFileState=function(){return GFL.map(gfInfo)};
// a before b in the list: higher score, then the more recent file, then the list order
function gfCmp(a,b){return b.s-a.s||a.r-b.r||a.i-b.i}
function gfAdd(J,x){var t=J.top;if(t.length>=GFMAX&&gfCmp(x,t[t.length-1])>=0)return;
 var lo=0,hi=t.length;while(lo<hi){var md=(lo+hi)>>1;if(gfCmp(t[md],x)<=0)lo=md+1;else hi=md}
 t.splice(lo,0,x);if(t.length>GFMAX)t.pop();J.ch=true}
function goFile(){if(!S.mod)return IDE.status(tx('ide.noMod'));
 var m=S.mod,T=getTree(),rec={},sel=0,J=null,open=true;
 recFiles().forEach(function(r,i){rec[low(r)]=i+1});
 var title=tx('ide.pk.file'),inp=h('input',{type:'text',autocomplete:'off','aria-label':title,placeholder:tx('ide.pk.ph')});
 var list=h('div',{class:'ide-pick-list',role:'listbox'}),info=h('div',{class:'ide-hint','aria-live':'polite'});
 function stop(){if(J){J.dead=true;clearTimeout(J.tm);J.tm=null}}
 function run(){stop();J={w:inp.value.trim().toLowerCase(),i:0,n:0,top:[],gen:T.gen,done:false,dead:false,wait:false,tm:null,ch:true};
  GFL.push(J);if(GFL.length>8)GFL.shift();sel=0;step(J);gameHits(J)}
 function step(R){R.tm=null;if(R.dead||!open)return;var fs=T.files,lw=T.lw,q=R.w,t=Date.now(),b=gfBudget();
  while(R.i<fs.length){var f=fs[R.i];if(f&&f.state!=='pak'){var l=lw[R.i];if(l==null)l=lw[R.i]=low(f.rel);var s=fuzzy(q,l);
    if(s>=0.5){var r=rec[l]||0;R.n++;gfAdd(R,{s:s+(r?0.25:0),r:r||1e6,i:R.i,f:f})}}
   R.i++;if((R.i&511)===0&&Date.now()-t>=b)break}
  if(R.i<fs.length)R.tm=later(function(){step(R)},0);else if(T.more)R.wait=true;else R.done=true;
  draw()}
 // a new page of the list: a run that was waiting goes on; a list read again from 0 starts the run again
 function onTree(){if(!open||!J||J.dead)return;if(J.gen!==T.gen){run();return}if(J.wait){J.wait=false;step(J);return}draw()}
 function row(x,i){var f=x.f,r=x.r<1e6;
  return h('div',{class:'ide-pick-it'+(i===sel?' ide-sel':''),role:'option','aria-selected':i===sel?'true':'false',onclick:function(){sel=i;choose()}},
   [h('span',{text:f.rel}),h('span',{class:'ide-hint',text:'  '+(r?tx('ide.pk.recent')+'  ':'')+tx('ide.st.'+f.state)})])}
 function draw(){var top=J?J.top:[];if(sel>=top.length)sel=top.length-1;if(sel<0)sel=0;
  // the rows are made again only when the best ones changed (or the run ended with none: the "nothing matches" line)
  if(J&&(J.ch||(J.done&&!J.nd))){J.ch=false;if(J.done)J.nd=true;list.textContent='';for(var i=0;i<top.length;i++)list.appendChild(row(top[i],i));
   if(!top.length&&J.done)list.appendChild(h('div',{class:'ide-hint',text:tx('ide.pk.none')}))}
  var s=[];
  if(T.more)s.push(tx('ide.gf.reading',{n:T.files.length}));
  if(J&&!J.done&&!J.wait)s.push(tx('ide.gf.looking',{n:J.n}));
  else if(J)s.push(J.n>top.length?tx('ide.gf.countTop',{n:J.n,k:top.length}):tx('ide.gf.count',{n:J.n}));
  if(T.partial==='error')s.push(tx('ide.gf.err',{m:T.why}));else if(T.partial==='changed')s.push(tx('ide.gf.changed'));
  if(T.cut)s.push(tx('ide.gf.cut'));
  info.textContent=s.join('  ')}
 function mark(){if(J)J.ch=true;draw();var c=list.children[sel];if(c&&c.scrollIntoView)c.scrollIntoView({block:'nearest'})}
 function openF(f){if(kit)kit.remember(f.rel);if(f.state==='game')IDE.open({key:f.key,idx:f.idx});else IDE.open({mod:m,rel:f.rel})}
 function choose(){var x=J&&J.top[sel];closeOverlay();if(!x)return;openF(x.f)}
 // (merged) "Show game files not overwritten" on in the file list (LS ide.x.merged): the game files the mod does not replace that
 // hold the typed text come too (GET ide/vfind vanilla=1 under=1, the best GFMAX), as game rows that open read-only
 function gameHits(R){if(!LS.get('ide.x.merged',false)||R.w.length<2)return;
  R.gt=later(function(){if(R.dead||!open)return;
   call('/api/x/ide/vfind?'+qs({mod:m,q:R.w,vanilla:'1',under:'1',off:0,lim:GFMAX}),undefined,{what:tx('ide.job.vfind',{q:R.w})}).then(function(r){if(R.dead||!open||J!==R)return;
    (r&&r.hits||[]).forEach(function(g,k){var rel='resource/'+g.name,s=fuzzy(R.w,low(rel));if(s<0.5)return;R.n++;R.gn=(R.gn||0)+1;
     gfAdd(R,{s:s-0.01,r:1e6,i:1e9+k,f:{rel:rel,state:'game',key:g.key,idx:g.idx,pak:g.pak}})});
    R.ch=true;draw()},function(){})},200)}
 // searchKit: history 'ide.gofile' (typed names and the files opened from here), index = the rows this list found for the text (the
 // mod's file index, matched above), Browse = the file picker at the mod folder (a phone: the game data); the picked file opens (its
 // path in the mod goes to the history). A history pick that is a file of the list opens it, else it is typed.
 inp.addEventListener('input',run);
 var kit=kitOn(inp,{key:'ide.gofile',beside:true,
  index:function(q,done){var t=J?J.top:[];done(t.slice(0,30).map(function(x){return {label:x.f.rel,value:x.f.rel,hint:tx('ide.st.'+x.f.state),f:x.f}}),Math.max(0,(J?J.n:0)-30))},
  browse:fileSpec(),
  onPick:function(v,it,from){if(from==='browse'){closeOverlay();openPicked(it&&it.path||v,it);return}
   if(it&&it.f){closeOverlay();openF(it.f);return}var lv=low(v),fs=T.files;
   for(var i=0;i<fs.length;i++)if(fs[i]&&fs[i].state!=='pak'&&low(fs[i].rel)===lv){closeOverlay();openF(fs[i]);return}
   inp.value=v;run();if(kit)kit.focus()}});
 // the files opened lately (LS ide.recent) start the history the first time, so History lists them too
 if(kit&&!kit.history().length)recFiles().slice(0,15).reverse().forEach(function(r){kit.remember(r)});
 // no Enter or arrows while an input method is composing (Chinese, Japanese...); a key the kit took (e._sk) is its own
 inp.addEventListener('keydown',function(e){if(e._sk||e.isComposing||e.keyCode===229)return;var n=J?J.top.length:0;
  if(e.key==='ArrowDown'){sel=Math.max(0,Math.min(n-1,sel+1));mark();e.preventDefault()}else if(e.key==='ArrowUp'){sel=Math.max(0,sel-1);mark();e.preventDefault()}
  else if(e.key==='Enter'){e.preventDefault();choose()}});
 showOverlay(h('div',{class:'ide-pick'},[pickHead(title,kit?null:btn('ide.pk.browse',function(){closeOverlay();browseFile()},null,'ide.pk.browseT')),kit?kit.el:inp,info,list]));
 T.subs.push(onTree);
 UI.ovClose=function(){open=false;stop();if(kit)kit.close();var i=T.subs.indexOf(onTree);if(i>=0)T.subs.splice(i,1)};
 run();if(kit)kit.focus();later(function(){if(kit)kit.focus();else inp.focus()})}
// a loose file of this mod (the which() row) -> its path inside the mod, or null when it is not under the mod folder
function relInMod(r){var m=low(S.mod).replace(/\/+$/,''),c=low(r.container).replace(/\/+$/,'');
 if(c!==m&&c.indexOf(m+'/')!==0)return null;var pre=c.length>m.length?String(r.container).replace(/\\/g,'/').replace(/\/+$/,'').slice(m.length+1)+'/':'';
 return r.entry?pre+String(r.entry).replace(/\\/g,'/'):null}
function whichOf(key){return call('/api/x/files/which?'+qs({mod:S.mod,key:key}))}
function openKey(key,line,col,opt){opt=opt||{};
 return whichOf(key).then(function(w){var ch=w.chain||[],win=null,notes=w.notes||[];ch.forEach(function(r){if(!win&&r.winner)win=r});win=win||ch.filter(function(r){return r.kind!=='deleted'})[0];
  if(!win){if(!opt.quiet){if(notes.indexOf('no-game')>=0)IDE.status(tx('ide.noGame',{k:key}));
    else if(!w.mounted||notes.some(function(n){return /^dropped/.test(n)})||notes.indexOf('vfs-failed')>=0)IDE.status(tx('ide.noMount',{k:key}));
    else IDE.status(tx('ide.noKey',{k:key}))}return null}
  // the winner is this mod's own loose file: the editable tab of that file, never a second read-only one
  if(win.kind==='mine'&&win.source==='loose'){var rel=relInMod(win);if(rel)return openRef({mod:S.mod,rel:rel},line,col,opt)}
  var o2={};Object.keys(opt).forEach(function(k){o2[k]=opt[k]});o2.layer=win.layer||null;o2.layerKind=win.kind||null;
  return openRef({mod:S.mod,key:w.key||key,idx:win.idx},line,col,o2)})
 .catch(function(e){if(!opt.quiet)IDE.status(errMsg(e,'ide.openFail'));return null})}
function isModInfo(d){return low(d&&d.rel).replace(/^\.?\/+/,'')==='mod.info'}
function compareVanilla(){var d=IDE.active();if(!d)return;var key=d.key||d.ref.key;if(!key)return IDE.status(tx(isModInfo(d)?'ide.modinfoCmp':'ide.notRead'));
 whichOf(key).then(function(w){var ch=(w.chain||[]).filter(function(r){return r.kind!=='deleted'}),i=-1,k;
  for(k=0;k<ch.length;k++){if(d.ref.key?ch[k].idx===d.ref.idx:ch[k].kind==='mine'){i=k;break}}
  var below=i>=0?ch[i+1]:ch.filter(function(r){return r.kind!=='mine'})[0];
  if(!below)return IDE.status(tx('ide.noBelow'));
  return call(openQ({mod:S.mod,key:w.key,idx:below.idx})).then(function(o){compareBox(IDE.textOf(d),tx('ide.cmp.mine'),o.text,tx('ide.cmp.layer',{l:below.layer}),d.kind)})})
 .catch(function(e){IDE.status(errMsg(e))})}
// the same game path in every other place: vanilla, the mods the game loads, and mods that are installed but not loaded.
// side=false: pick one and open it in a tab. side=true: pick one and show it next to the text of the active tab.
function copyRef(c,mod){var r={mod:mod||S.mod};Object.keys(c.ref).forEach(function(k){r[k]=c.ref[k]});return r}
function isThis(d,c){if(c.ref.rel!=null)return d.ref.rel!=null&&low(d.ref.rel)===low(c.ref.rel);if(c.ref.key!=null)return d.ref.key!=null&&d.ref.idx===c.ref.idx;
 return !!d.path&&low(d.path).replace(/\\/g,'/')===low(c.ref.path).replace(/\\/g,'/')}
function copyHint(c){return tx('ide.cp.k.'+c.kind)+(c.winner?'  '+tx('ide.cp.win'):'')+'  '+c.where}
function sameFile(side){var d=IDE.active();if(!d)return;var key=d.key||d.ref.key;if(!key)return IDE.status(tx(isModInfo(d)?'ide.modinfoCmp':'ide.notRead'));
 var dm=d.ref.mod||S.mod;
 call('/api/x/ide/copies?'+qs({mod:dm,key:key})).then(function(w){
  var cs=(w.copies||[]).filter(function(c){return !isThis(d,c)});
  if(!cs.length)return IDE.status(tx(w.game?'ide.cp.none':'ide.cp.nogame'));
  var mine=d.editable?tx('ide.cmp.mine'):d.layer||d.name;
  // Browse: a mod folder in the game's mods folder (beside this mod); its folder name filters the places (a copy is named by its mod)
  var mdir=String(dm||'').replace(/[\\\/]+$/,'').replace(/[\\\/][^\\\/]*$/,'');
  pickList(tx(side?'ide.pk.side':'ide.pk.copies',{p:d.name}),cs.map(function(c){return {label:c.label,hint:copyHint(c),run:function(){var r=copyRef(c,dm);
   if(!side){IDE.open(r,null,null);return}
   call(openQ(r)).then(function(o){compareBox(IDE.textOf(d),mine,o.text,c.label,d.kind)}).catch(function(e){IDE.status(errMsg(e,'ide.openFail'))})}}}),{nofilter:cs.length<8,key:'ide.copies',
   browse:IRM?undefined:{mode:'dir',start:mdir,toValue:function(p){return baseName(String(p).replace(/[\\\/]+$/,''))}}})})
 .catch(function(e){IDE.status(errMsg(e))})}
// the compare box covers the whole editor area (tabs down to the bottom panel)
function compareBox(left,lt,right,rt,kind){var host=h('div',{class:'ide-cmp-host'}),head=ovHead(lt+'  |  '+rt);
 showOverlay(h('div',{class:'ide-cmp'},[head,host]),{full:true});
 if(!window.IDE_ED||!window.IDE_ED.compare){host.appendChild(h('div',{class:'err',text:tx('ide.noCompare')}));return}
 try{var c=window.IDE_ED.compare(host,{left:{text:left,title:lt},right:{text:right,title:rt},kind:kind,phrases:phrases()});UI.ovClose=function(){try{c.close()}catch(e){}};
  var same=c&&(c.counts?(c.counts.left+c.counts.right)===0:c.changed===0),b=head.querySelector('b');
  if(b&&c)b.textContent=lt+'  |  '+rt+'  ('+(same?tx('ide.cmp.same'):c.summary||'')+')'}catch(e){host.appendChild(h('div',{class:'err',text:e.message}))}}
function extOpen(app){var d=IDE.active();if(!d)return;var c=(ED&&!d.view?ED.cursor():null)||{line:1,col:1};
 call('/api/x/ide/extopen',refBody(d,{line:c.line,col:c.col,app:app})).then(function(r){
  // (reveal) a file inside a pak: the route shows the pak itself; say so
  if(r&&r.pak){IDE.status(tx('ide.expPak',{p:baseName(r.file)}));return}
  IDE.status(tx(app==='npp'?'ide.nppDone':'ide.expDone'))}).catch(function(e){IDE.status(errMsg(e))})}
function baseName(p){p=String(p||'');var i=Math.max(p.lastIndexOf('/'),p.lastIndexOf('\\'));return i<0?p:p.slice(i+1)}
// (reveal) the open file's row in the editor's file list: explorer part scrolls to it and selects it
function revealList(){var d=IDE.active();if(!d)return;var x=PARTS.explorer;
 if(!x||typeof x.show!=='function'){IDE.status(tx('ide.revealNo'));return}
 var r=d.ref||{},rel=r.rel||null,key=d.key||r.key||null;
 if(!x.show({rel:rel,key:key}))IDE.status(tx('ide.revealNo'))}
IDE.go=function(link){link=String(link||'');var m=/^(ide|key):([\s\S]*)$/.exec(link);
 if(!m){if(typeof window.as2Link==='function'){var lr;leave(function(){lr=window.as2Link(link)});return lr}IDE.status(tx('ide.badLink',{l:link}));return Promise.resolve(null)}
 var p=splitPos(m[2]);if(!p.s){IDE.status(tx('ide.badLink',{l:link}));return Promise.resolve(null)}
 var r=m[1]==='ide'?openRef({mod:S.mod,rel:p.s},p.line,p.col,{}):openKey(p.s,p.line,p.col,{});
 return r.then(function(d){if(d&&d.view){if(d.vh)d.vh.focus()}else if(d&&ED)ED.focus();return d})};

// ---------------------------------------------------------------- overlays and pick lists
// focus moves into the box, Tab stays inside it, Esc closes it from anywhere, focus goes back to where it was
function ovHead(title){return h('div',{class:'ide-ovh'},[h('b',{text:title}),btn('ide.close',closeOverlay,'ide-x','ide.closeT')])}
function ovOpen(){return !!UI.ov&&!UI.ov.hidden}
// (kit) shared with the parts: read-only reason, the pick-list match score, a box over the text, the screen's one editor
IDE.roWhy=roWhy;IDE.fuzzy=fuzzy;IDE.ovOpen=ovOpen;IDE.ed=function(){return ED||null};
function clearOv(){var o=UI.ov;PV=null;if(!o)return false;if(UI.ovClose){var f=UI.ovClose;UI.ovClose=null;try{f()}catch(e){}}var had=o.children.length>0;o.textContent='';o.hidden=true;
 o.className='ide-ov';if(o.style){o.style.left='';o.style.top=''}return had}
function showOverlay(el,opt){opt=opt||{};var o=UI.ov;if(!o)return;
 if(!ovOpen()){var a=document.activeElement;OVPREV=a&&a!==document.body?a:null}
 clearOv();o.hidden=false;o.className='ide-ov'+(opt.full?' ide-ov-full':opt.at?' ide-ov-at':'');
 if(opt.at&&o.style){o.style.left=opt.at.left+'px';o.style.top=opt.at.top+'px'}
 o.appendChild(el);
 later(function(){if(!ovOpen()||focusIn(o))return;var f=focusables(o),i;for(i=0;i<f.length;i++)if(f[i].tagName==='INPUT'){f[i].focus();return}
  for(i=0;i<f.length;i++)if(!/(^| )ide-x( |$)/.test(f[i].className||'')){f[i].focus();return}if(f[0])f[0].focus()})}
function closeOverlay(){var had=clearOv(),p=OVPREV;OVPREV=null;if(!had)return;
 if(p&&p.isConnected!==false&&!within(p,UI.edHost)&&p.focus){try{p.focus();return}catch(e){}}
 var a=IDE.active();if(a&&a.view){if(a.vh)a.vh.focus()}else if(ED&&a)ED.focus()}
IDE.closeOverlay=closeOverlay;
function ovTrap(e){if(e.key!=='Tab'||!UI.ov)return;var f=focusables(UI.ov);if(!f.length)return;var i=f.indexOf(document.activeElement);
 if(e.shiftKey){if(i<=0){e.preventDefault();f[f.length-1].focus()}}else if(i<0||i===f.length-1){e.preventDefault();f[0].focus()}}
// searchKit (page.js; owner 2026-11-19: every search box has a manual browse, an indexed search and a history list) on an Editor box.
// o = the kit's options as they are; o.beside (the kit's own option): the box filters a list drawn right under it (a pick popup, that
// list is the index view): typing shows only matching history rows, arrows and Enter stay with the page's list, the History button
// opens the whole history. The caller focuses such a box with kit.focus() (no list on open). Without the kit (an old page) -> null
// and the box works as before.
function kitOn(inp,o){if(typeof window.searchKit!=='function'||!inp)return null;
 try{return window.searchKit(inp,o||{})}catch(e){if(window.console)console.error(e);return null}}
IDE.kitOn=kitOn;
// head of a pick popup: its title, an optional extra button, and a Close button (Esc does the same)
function pickHead(title,extra){return h('div',{class:'ide-pick-h'},[h('span',{class:'ide-pick-t',text:title}),extra||null,btn('ide.close',closeOverlay,'ide-x','ide.closeT')])}
// files opened lately, per mod (kept in this browser): Go to file lists them first
function recFiles(){if(typeof LS==='undefined')return [];var m=LS.get('ide.recent',{})||{},a=m[low(S.mod||'')];return Array.isArray(a)?a:[]}
function recFile(rel){if(!S.mod||!rel||typeof LS==='undefined')return;var m=LS.get('ide.recent',{})||{},k=low(S.mod),a=(Array.isArray(m[k])?m[k]:[]).filter(function(x){return low(x)!==low(rel)});a.unshift(rel);m[k]=a.slice(0,15);LS.set('ide.recent',m)}
// a file picked in the folder popup: opened by its path (a file outside the mod opens read-only)
function browseFile(){if(!S.mod)return IDE.status(tx('ide.noMod'));if(typeof pick!=='function')return;pick('file',S.mod,function(p){IDE.open({mod:S.mod,path:p})})}
IDE.browseFile=browseFile;
// (searchKit Browse) a disk path -> its path inside the mod (forward slashes), or null when it is not under the mod folder
function modRel(p){var m=String(S.mod||'').replace(/\\/g,'/').replace(/\/+$/,''),q=String(p||'').replace(/\\/g,'/');return m&&low(q).indexOf(low(m)+'/')===0?q.slice(m.length+1):null}
// a file the picker gave: a game file (data view) opens by its key (read-only unless it is the mod's own), a disk file by its path
function openPicked(p,e){if(e&&e.view==='data'&&e.key){openKey(e.key,1,1,{});return}IDE.open({mod:S.mod,path:p})}
// the Browse spec of a box over the mod's files: the file picker at the mod folder (a phone has no disk: the game data with the mod on
// top); the box gets the path inside the mod (a data pick: its game path, a file outside the mod: its full path)
function fileSpec(){return {mode:'file',view:IRM?'data':'disk',start:function(){return IRM?'':(S.mod||'')},
 toValue:function(p,e){if(e&&e.view==='data')return e.path||p;var r=modRel(p);return r!=null?r:p}}}
IDE.modRel=modRel;IDE.openPicked=openPicked;IDE.fileSpec=fileSpec;
// pick popup: items [{label, hint?, run}]; opt {filter(q, items), nofilter (a short choice list, no box), browse, key (history)}.
// The box has searchKit (beside: the list under it is the index view): history opt.key (past picks and texts), index = the rows the
// box matches now, Browse = the file picker (opt.browse: the kit's browse spec, where the rows' files live; none = the kit's default);
// a Browse pick goes into the box and filters the rows. Rows are made again only when the matches change, at most once a frame while typing.
function pickList(title,items,opt){opt=opt||{};var inp=h('input',{type:'text',autocomplete:'off','aria-label':title,placeholder:tx('ide.pk.ph')}),list=h('div',{class:'ide-pick-list',role:'listbox'}),sel=0,shown=[],els=[],pend=false,lastQ=null;
 function match(){var q=inp.value.trim().toLowerCase();if(q===lastQ)return false;lastQ=q;
  shown=opt.filter?opt.filter(q,items):items.filter(function(it){return !q||it.label.toLowerCase().indexOf(q)>=0});return true}
 function draw(){var fresh=match();if(sel>=shown.length)sel=shown.length-1;if(sel<0)sel=0;
  if(fresh){list.textContent='';els=[];
   shown.slice(0,300).forEach(function(it,i){var r=h('div',{class:'ide-pick-it',role:'option','aria-selected':'false',onclick:function(){sel=i;choose()}},
    [h('span',{text:it.label}),it.hint?h('span',{class:'ide-hint',text:'  '+it.hint}):null]);els.push(r);list.appendChild(r)});
   if(!shown.length)list.appendChild(h('div',{class:'ide-hint',text:tx('ide.pk.none')}))}
  els.forEach(function(r,i){var on=i===sel;r.className='ide-pick-it'+(on?' ide-sel':'');r.setAttribute('aria-selected',on?'true':'false')});
  var s=els[sel];if(s&&s.scrollIntoView)s.scrollIntoView({block:'nearest'})}
 function soon(){if(pend)return;pend=true;(window.requestAnimationFrame||function(f){setTimeout(f,16)})(function(){pend=false;draw()})}
 function run1(it){if(kit)kit.remember(it.label);it.run()}
 function choose(){var it=shown[sel];closeOverlay();if(it)run1(it)}
 // no Enter or arrows while an input method is composing (Chinese, Japanese...); a key the kit took (e._sk) is its own
 function keys(e){if(e._sk||e.isComposing||e.keyCode===229)return;
  if(e.key==='ArrowDown'){if(pend){pend=false;draw()}sel=Math.min(shown.length-1,sel+1);draw();e.preventDefault()}else if(e.key==='ArrowUp'){if(pend){pend=false;draw()}sel=Math.max(0,sel-1);draw();e.preventDefault()}
  else if(e.key==='Enter'){e.preventDefault();draw();choose()}}
 inp.addEventListener('input',function(){sel=0;soon()});
 var kit=opt.nofilter?null:kitOn(inp,{key:opt.key||'ide.pick',beside:true,
  index:function(q,done){done(shown.slice(0,30).map(function(it){return {label:it.label,value:it.label,hint:it.hint||'',it:it}}),Math.max(0,shown.length-30))},
  browse:opt.browse||undefined,
  onPick:function(v,x){var it=x&&x.it;if(!it)for(var i=0;i<items.length;i++)if(String(items[i].label).trim()===v){it=items[i];break}
   if(it){closeOverlay();run1(it);return}inp.value=v;sel=0;draw();if(kit)kit.focus()}});
 inp.addEventListener('keydown',keys);
 showOverlay(h('div',{class:'ide-pick'},[pickHead(title),opt.nofilter?null:(kit?kit.el:inp),list]));draw();
 if(kit)UI.ovClose=function(){kit.close()};
 if(opt.nofilter){list.setAttribute('tabindex','0');list.addEventListener('keydown',keys);later(function(){list.focus()})}
 else{if(kit)kit.focus();later(function(){if(kit)kit.focus();else inp.focus()})}}
IDE.pick=pickList;

// ---------------------------------------------------------------- drawing: tabs, crumb, status, next
// tab strip: one tab stop (roving tabindex); Left, Right, Home, End move, Enter or Space open, Delete closes
function tabEl(id){if(!UI.tabs)return null;var ts=UI.tabs.querySelectorAll('.ide-tab');for(var i=0;i<ts.length;i++)if(ts[i].dataset.doc===id)return ts[i];return null}
function focusTab(id){if(!UI.tabs)return;TF=id;var ts=UI.tabs.querySelectorAll('.ide-tab'),el=null;
 for(var i=0;i<ts.length;i++){var me=ts[i].dataset.doc===id;ts[i].setAttribute('tabindex',me?'0':'-1');if(me)el=ts[i]}if(el&&el.focus)el.focus()}
function focusEmpty(){var b=UI.empty&&UI.empty.querySelector('button');if(b&&b.focus)b.focus();else if(UI.tabs&&UI.tabs.focus)UI.tabs.focus()}
function closeFromTabs(d){var i=IDE.docs.indexOf(d);if(!closeDoc(d))return;var n=IDE.docs[Math.min(i,IDE.docs.length-1)];if(n)focusTab(n.id);else focusEmpty()}
function tabKey(e,d){var i=IDE.docs.indexOf(d),n=IDE.docs.length,k=e.key,j=-1;if(i<0||e.isComposing)return;
 // (tabs) Ctrl+Space puts the tab in the selection or takes it out; Shift+Left/Right/Home/End select a range; menu key, Shift+F10: the tab menu
 if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&(k===' '||k==='Spacebar')){e.preventDefault();selToggle(d);focusTab(d.id);return}
 if(e.altKey||e.ctrlKey||e.metaKey)return;
 if(k==='ContextMenu'||(k==='F10'&&e.shiftKey)){stopEv(e);tabMenuReq(d,null);return}
 if(k==='ArrowRight'||k==='Right')j=(i+1)%n;else if(k==='ArrowLeft'||k==='Left')j=(i-1+n)%n;else if(k==='Home')j=0;else if(k==='End')j=n-1;
 if(j>=0&&e.shiftKey){e.preventDefault();if(k==='ArrowRight'||k==='Right')j=Math.min(i+1,n-1);else if(k==='ArrowLeft'||k==='Left')j=Math.max(i-1,0);
  if(!byId(TANC))TANC=d.id;TF=IDE.docs[j].id;selRange(IDE.docs[j]);focusTab(IDE.docs[j].id);return}
 if(j>=0){e.preventDefault();focusTab(IDE.docs[j].id);return}
 if(k==='Enter'||k===' '||k==='Spacebar'){e.preventDefault();if(ACT!==d.id){pushHist();activate(d)}focusTab(d.id);return}
 if(k==='Delete'){e.preventDefault();closeFromTabs(d)}}
function cycleTab(dir){var n=IDE.docs.length;if(n<2)return;var i=IDE.docs.indexOf(IDE.active());var d=IDE.docs[((i<0?0:i)+dir+n)%n];
 var inTabs=focusIn(UI.tabs);activate(d);if(inTabs)focusTab(d.id)}
// ---------------------------------------------------------------- (tabs) closing several tabs: selection, tab menu, batch close
// Selection (TSEL, doc ids; TANC = where a Shift range starts): Ctrl+click or Ctrl+Space toggle (the first toggle also takes the active
// tab in), Shift+click or Shift+arrows a range, a plain click or Esc clears it. Page session only; a closed tab leaves it.
// The tab menu (UI.tmenu, right click, menu key, Shift+F10 on a tab): Close the N selected tabs (only with a selection), Close, Close
// others, Close tabs to the right, to the left, Close saved tabs, Close all; a row that would close nothing is aria-disabled.
// Every batch close goes through closeMany: with unsaved tabs in it one card lists them (Save all and close / Close without saving /
// Cancel); nothing closes before the answer, Cancel (Esc, the x) closes nothing. Each tab then closes through closeDoc (the
// single close: 'closed' event, include windows, viewers, session, history untouched as for one tab). The tab shown afterwards: the
// tab the menu was opened on (the active one for the File menu actions) when it stays, else the shown tab when it stays (as a single
// close of another tab), else the one nearest the menu tab (right first), else the empty state.
var TSEL=[],TANC=null,TM=null,CLOSEALL='Shift+Alt+W';
function selClean(){var n=TSEL.length;TSEL=TSEL.filter(function(id){return !!byId(id)});if(TANC&&!byId(TANC))TANC=null;return n!==TSEL.length}
function selDocs(){return IDE.docs.filter(function(d){return TSEL.indexOf(d.id)>=0})}
function selSay(){IDE.status(TSEL.length?tx('ide.ts.selN',{n:TSEL.length}):tx('ide.ts.selNone'))}
function selClear(){if(!TSEL.length&&!TANC)return false;var had=TSEL.length>0;TSEL=[];TANC=null;drawTabs();updBar();return had}
function selToggle(d){selClean();if(!TSEL.length&&ACT&&ACT!==d.id&&byId(ACT))TSEL=[ACT];var i=TSEL.indexOf(d.id);
 if(i>=0)TSEL.splice(i,1);else TSEL.push(d.id);TANC=d.id;drawTabs();updBar();selSay()}
function selRange(d){selClean();var a=byId(TANC)||IDE.active()||d,i=IDE.docs.indexOf(a),j=IDE.docs.indexOf(d);if(j<0)return;if(i<0)i=j;
 TANC=a.id;TSEL=IDE.docs.slice(Math.min(i,j),Math.max(i,j)+1).map(function(x){return x.id});drawTabs();updBar();selSay()}
var TKINDS=['sel','one','others','right','left','saved','all'];
// the tabs each menu row would close, for the tab d
function tabSets(d){var L=IDE.docs.slice(),i=d?L.indexOf(d):-1;selClean();
 return {sel:selDocs(),one:i<0?[]:[d],others:i<0?[]:L.filter(function(x){return x!==d}),right:i<0?[]:L.slice(i+1),left:i<0?[]:L.slice(0,i),
  saved:L.filter(function(x){return !isDirty(x)}),all:L}}
function tabMenuReq(d,e){if(TM&&TM.d===d)return;openTabMenu(d,e?e.clientX:null,e?e.clientY:null)}
function openTabMenu(d,x,y){closeAll();var el=UI.tmenu;if(!el||!d||IDE.docs.indexOf(d)<0)return;var S2=tabSets(d);el.textContent='';
 TKINDS.forEach(function(k){if(k==='sel'&&!S2.sel.length)return;var n=S2[k].length,lab=k==='sel'?tx('ide.ts.m.sel',{n:n}):tx('ide.ts.m.'+k);
  var b=h('button',{type:'button',role:'menuitem',class:'ide-mi','data-tclose':k,tabindex:'-1','aria-disabled':n?null:'true'},
   [h('span',{class:'ide-mi-n',text:lab}),h('span',{class:'ide-mi-k','aria-hidden':'true',text:k==='all'?CLOSEALL:''})]);
  if(k==='all')b.setAttribute('aria-keyshortcuts',ariaKeys(CLOSEALL));
  hoverFocus(b);b.addEventListener('click',function(){if(offEl(b))return;var src=TM?TM.d:d,back=!!TM&&focusIn(TM.el);closeTabMenu(false);closeSet(k,src,back)});el.appendChild(b)});
 TM={el:el,d:d,src:tabEl(d.id)};el.hidden=false;
 if(x==null){var t=TM.src,r=t&&t.getBoundingClientRect?t.getBoundingClientRect():null;x=r?r.left+8:8;y=r?r.bottom:8}
 placeMenu(el,null,x,y);var its=items(el),f=null;for(var i=0;i<its.length;i++)if(!offEl(its[i])){f=its[i];break}f=f||its[0];if(f&&f.focus)f.focus()}
function closeTabMenu(refocus){var T=TM;if(!T)return;TM=null;T.el.hidden=true;T.el.textContent='';
 if(refocus&&T.d&&IDE.docs.indexOf(T.d)>=0)focusTab(T.d.id)}
function tmKey(e){if(!TM||e.isComposing)return;var its=items(TM.el),n=its.length,i=its.indexOf(document.activeElement),k=e.key;if(!n)return;
 if(k==='ArrowDown'||k==='Down')its[(i+1)%n].focus();else if(k==='ArrowUp'||k==='Up')its[i<0?n-1:(i-1+n)%n].focus();
 else if(k==='Home')its[0].focus();else if(k==='End')its[n-1].focus();
 else if(k==='Escape'||k==='Esc'||k==='Tab')closeTabMenu(true);
 else if(k==='ContextMenu'||(k==='F10'&&e.shiftKey)){}
 else if(k==='Enter'||k===' '||k==='Spacebar'){if(i>=0)its[i].click()}
 else return;
 stopEv(e)}
// one menu row or File menu action: kind = a TKINDS id, src = the tab it is for (null: the active tab), back = put the focus on a tab after
function closeSet(kind,src,back){var d=src&&IDE.docs.indexOf(src)>=0?src:IDE.active(),list=(tabSets(d)[kind]||[]);
 if(!list.length){IDE.status(tx('ide.ts.nothing'));return Promise.resolve(false)}
 return closeMany(list,d,back)}
// -> Promise<bool> (true: the choice was made and the tabs that could close are closed; false: cancelled or nothing to close)
function closeMany(list,anchor,back){list=(list||[]).filter(function(d,i,a){return IDE.docs.indexOf(d)>=0&&a.indexOf(d)===i});
 if(!list.length)return Promise.resolve(false);
 var dirty=list.filter(isDirty);
 if(!dirty.length){dropMany(list,anchor,back);IDE.status(tx('ide.ts.closed',{n:list.length}));return Promise.resolve(true)}
 return new Promise(function(res){askMany(list,dirty,anchor,back,res)})}
// the unsaved-changes card for a batch: the files with changes, then Save all and close / Close without saving / Cancel. Save all and
// close writes each file through files/save (the files/lib save: restore point, bytes kept) one after the other; a file that cannot be
// written (read-only, a conflict, an error) stays open with the reason, the rest close. A phone (LAN Remote) cannot save: no Save button.
function askMany(list,dirty,anchor,back,res){var done=false,busy=false,gone=false;
 var canSave=!IRM&&dirty.some(function(d){return d.editable});
 var ul=h('ul',{class:'ide-tsl'},dirty.map(function(d){var p=d.rel||d.key||d.path||'';
  return h('li',{},[h('b',{text:d.name}),p&&p!==d.name?h('span',{class:'ide-hint',text:'  '+p}):null,
   (d.editable&&!IRM)?null:h('span',{class:'ide-warn',text:'  ('+tx('ide.ts.cantSave')+')'})])}));
 var msg=h('div',{class:'ide-hint',role:'status'}),other=list.length-dirty.length;
 var bSave=canSave?btn('ide.ts.saveClose',function(){go('save')},'primary','ide.ts.saveCloseT'):null;
 var bDrop=btn('ide.ts.drop',function(){go('drop')},canSave?'danger':'danger primary','ide.ts.dropT');
 var bCancel=btn('ide.cancel',function(){closeOverlay()},null,'ide.ts.cancelT');
 function finish(ok){if(done)return;done=true;res(ok)}
 function go(how){if(busy||done)return;
  if(how==='drop'){done=true;closeOverlay();dropMany(list,anchor,back);IDE.status(tx('ide.ts.closed',{n:list.length}));res(true);return}
  busy=true;[bSave,bDrop,bCancel].forEach(function(b){if(b)b.disabled=true});msg.textContent=tx('ide.ts.saving',{n:dirty.length});
  saveMany(dirty).then(function(r){busy=false;
   var keep=r.failed.map(function(x){return x.d});dirty.forEach(function(d){if(keep.indexOf(d)<0&&IDE.docs.indexOf(d)>=0&&isDirty(d))keep.push(d)});
   if(gone){finish(false);IDE.status(tx('ide.ts.savedOnly',{n:r.saved.length}));return}
   var shut=list.filter(function(d){return keep.indexOf(d)<0});
   done=true;closeOverlay();dropMany(shut,anchor,back);
   if(keep.length){var why=r.failed.map(function(x){return x.d.name+(x.m?': '+x.m:'')}).join('; ');
    IDE.status(tx('ide.ts.someKept',{n:shut.length,k:keep.length,m:why||keep.map(function(d){return d.name}).join(', ')}))}
   else IDE.status(tx('ide.ts.savedClosed',{s:r.saved.length,n:shut.length}));
   res(true)})}
 var kids=[ovHead(tx('ide.ts.h')),h('p',{text:tx('ide.ts.lead',{n:dirty.length})}),ul,other?h('p',{class:'ide-hint',text:tx('ide.ts.others',{n:other})}):null,msg,
  h('div',{class:'row'},[bSave,bDrop,bCancel])];
 showOverlay(h('div',{class:'ide-card ide-tsc',role:'alertdialog','aria-label':tx('ide.ts.h')},kids));
 // Esc, the x, Cancel, or anything else that takes the box away: nothing closes. During Save all the saves still finish (and say so)
 UI.ovClose=function(){if(done)return;if(busy){gone=true;return}IDE.status(tx('ide.ts.kept'));finish(false)}}
function saveMany(ds){var out={saved:[],failed:[]},p=Promise.resolve();
 ds.forEach(function(d){p=p.then(function(){if(IDE.docs.indexOf(d)<0)return;
  if(IRM||!d.editable){out.failed.push({d:d,m:roWhy(d)});return}
  return saveNow(d).then(function(r){if(r===true)out.saved.push(d);else out.failed.push({d:d,m:r&&r.m||''})})})});
 return p.then(function(){if(out.saved.length){drawTabs();IDE.emit('tree',{})}return out})}
// one file written as it is now (the user chose Save all in the card: that is the confirmation, no changes view per file)
function saveNow(d){if(d.saving)return Promise.resolve({m:tx('ide.ts.busy')});var text=IDE.textOf(d);d.saving=true;
 return call('/api/x/files/save',{mod:d.ref.mod,rel:d.ref.rel,base:d.hash,text:text,write:true}).then(function(r){d.saving=false;d.text=text;if(r&&r.hash)d.hash=r.hash;
   if(IDE.textOf(d)===text&&ED){try{ED.clean(d.id)}catch(e){}d.dirty=false}d.conflict=false;IDE.emit('saved',{doc:d,result:r});return true},
  function(e){d.saving=false;if(e&&e.status===409){d.conflict=true;drawBars();return {m:tx('ide.ts.conflict')}}return {m:(e&&e.message)||''}})}
// close the tabs in list now (no question): the new active tab first (so no tab about to close is shown on the way), then each one
// through closeDoc; the active one last when every tab goes (closeDoc draws the empty state)
function dropMany(list,anchor,back){var all=IDE.docs.slice(),gone={};list.forEach(function(d){gone[d.id]=1});
 var stay=all.filter(function(d){return !gone[d.id]}),tgt=null;
 var cur=IDE.active();
 if(anchor&&all.indexOf(anchor)>=0&&!gone[anchor.id])tgt=anchor;
 else if(cur&&!gone[cur.id])tgt=cur;   // the menu tab went but the shown one stays: it stays shown (as a single close of another tab)
 else if(stay.length){var ai=all.indexOf(anchor);if(ai<0)ai=all.indexOf(IDE.active());if(ai<0)ai=0;var bd=1e9;
  stay.forEach(function(d){var j=all.indexOf(d),dist=Math.abs(j-ai)*2+(j<ai?1:0);if(dist<bd){bd=dist;tgt=d}})}
 TSEL=[];TANC=null;
 if(tgt&&tgt.id!==ACT&&(ED||tgt.view))activate(tgt);
 var order=list.filter(function(d){return d.id!==ACT}).concat(list.filter(function(d){return d.id===ACT}));
 order.forEach(function(d){closeDoc(d,true)});
 drawTabs();updBar();
 if(back){if(tgt&&IDE.docs.indexOf(tgt)>=0)focusTab(tgt.id);else if(!IDE.docs.length)focusEmpty()}}
IDE.tabs={sel:function(){selClean();return TSEL.slice()},select:function(ids){TSEL=(ids||[]).filter(function(id){return !!byId(id)});TANC=TSEL[TSEL.length-1]||null;drawTabs();updBar();return TSEL.slice()},
 clear:function(){return selClear()},close:function(kind,d){return closeSet(kind,d||null,false)},closeDocs:function(list,anchor){return closeMany(list,anchor||IDE.active(),false)},
 menu:function(d){openTabMenu(d||IDE.active(),null,null);return !!TM},sets:function(d){var s=tabSets(d||IDE.active()),o={};TKINDS.forEach(function(k){o[k]=s[k].length});return o}};
function drawTabs(){var t=UI.tabs;if(!t)return;var had=focusIn(t);t.textContent='';if(!byId(TF))TF=ACT;selClean();
 IDE.docs.forEach(function(d){var on=d.id===ACT,stop=d.id===TF,sel=TSEL.indexOf(d.id)>=0;d.name=docName(d);
  var x=h('button',{type:'button',class:'ide-x',tabindex:'-1','aria-label':tx('ide.tab.close',{n:d.name}),text:String.fromCharCode(215),onclick:function(e){e.stopPropagation();closeFromTabs(d)}});IDE.tip(x,'ide.tab.closeT');
  var kids=[sel?h('span',{class:'ide-tsm','aria-hidden':'true',text:String.fromCharCode(10003)}):null,h('span',{class:'ide-tab-n',text:d.name})];
  if(isDirty(d))kids.push(h('span',{class:'ide-dot','aria-label':tx('ide.tab.dirty'),text:String.fromCharCode(9679)}));
  if(d.view){var V=VW();kids.push(h('span',{class:'ide-lock ide-vk',text:V?V.label(d.view):d.view}))}
  else if(!d.editable)kids.push(h('span',{class:'ide-lock',text:tx('ide.tab.ro')}));
  kids.push(x);
  var tab=h('div',{class:'ide-tab'+(on?' ide-on':'')+(sel?' ide-tsel':''),role:'tab',tabindex:stop?'0':'-1','aria-selected':on?'true':'false','data-doc':d.id,
   'aria-description':sel?tx('ide.ts.selD'):null,
   // (tabs) Ctrl+click: in or out of the selection; Shift+click: the range from the last one picked; a plain click clears it
   onclick:function(e){e=e||{};if(e.ctrlKey||e.metaKey){selToggle(d);focusTab(d.id);return}if(e.shiftKey){selRange(d);focusTab(d.id);return}
    selClear();TF=d.id;if(ACT!==d.id){pushHist();activate(d)}},
   oncontextmenu:function(e){if(e&&e.preventDefault)e.preventDefault();var kb=!e||(!e.clientX&&!e.clientY);tabMenuReq(d,kb?null:e)},
   onfocus:function(){TF=d.id},
   onauxclick:function(e){if(e.button===1){e.preventDefault();closeDoc(d)}},
   onmousedown:function(e){if(e.button===1)e.preventDefault()},
   onkeydown:function(e){tabKey(e,d)}},kids);
  tipText(tab,(d.rel||d.key||d.path||d.name)+(d.editable?'':'  ('+roWhy(d)+')'),null);
  t.appendChild(tab)});
 if(!IDE.docs.length)t.appendChild(h('span',{class:'ide-hint',text:tx('ide.tabs.none')}));
 else if(had)focusTab(TF)}
function drawCrumb(){var c=UI.crumb;if(!c)return;c.textContent='';var d=IDE.active();if(!d)return;
 // GT-39: empty parts (a doubled or trailing slash) never show as an empty step "/ /"
 var segs=String(d.rel||d.key||d.path||d.name).replace(/\\/g,'/').split('/').filter(function(s){return s!==''});
 c.appendChild(h('span',{class:'ide-cw',text:whereOf(d)}));
 segs.forEach(function(s,i){c.appendChild(h('span',{class:'ide-sep',text:' / '}));c.appendChild(h('span',{class:i===segs.length-1?'ide-cl':null,text:s}))});
 if(navable(d)){var b=btn('ide.a.outline',function(){IDE.run('outline')},'ide-cb');tipText(b,tx('ide.a.outlineT'),'Ctrl+Shift+O');c.appendChild(b)}}
function drawPos(c){if(UI.pos)UI.pos.textContent=c?tx('ide.st.pos',{l:c.line,c:c.col}):''}
function drawStatus(){if(!UI.st)return;var d=IDE.active();
 UI.eol.textContent=d?String(d.eol||'').toUpperCase().replace('NONE',''):'';UI.bom.textContent=d&&d.bom?'BOM':'';
 UI.cp.textContent=d&&d.cpLines?tx('ide.st.cp',{n:d.cpLines}):'';if(d&&d.cpLines)tipText(UI.cp,tx('ide.st.cpT',{n:d.cpLines}),null);
 UI.where.textContent=!d?'':d.editable?tx('ide.where.mine'):tx('ide.where.ro')+': '+roWhy(d);
 var ls='';if(d&&d.view){var V=VW();ls=tx('ide.st.view',{k:V?V.label(d.view):d.view,s:V&&V.size?V.size(d.size):String(d.size||0)})}
 else if(d){if(!lintable(d))ls=tx('ide.lint.off');else if(d.lintErr)ls=tx('ide.lint.err',{m:d.lintErr});else if(d.checking)ls=tx('ide.lint.busy');
  else{var e=0,w=0;d.findings.forEach(function(f){if(f.sev==='error')e++;else w++});ls=e||w?tx('ide.lint.n',{e:e,w:w}):tx('ide.lint.ok')}}
 UI.lint.textContent=ls;if(d&&ED&&!d.view)drawPos(ED.cursor());else drawPos(null);drawTabm()}
function nextFor(d){if(d!==IDE.active())return;if(!d)return drawNext([]);var it=[],p=d.nxp;
 if(p){if(p.ver===d.ver&&p.after===(d.after||null)&&p.fk===findKey(d)){if(NXON!==p)drawNext(p.items,p);return}d.nxp=null}
 var first=d.findings[0],firstFix=(d.fixes||[])[0];
 if(d.after){var before=d.after.before||{},nw=d.findings.filter(function(f){return !before[f.code+'|'+f.msg]}).length;
  if(d.findings.length){it.push({label:'ide.n.probs',p:{n:d.findings.length,m:nw},run:function(){moveProblem(1)}});
   if(firstFix)it.push({label:'ide.n.fix',run:function(){ED.goto(firstFix.line,1);fixHere()}});
   if(d.multi.length)it.push({label:'ide.n.patch',run:function(){IDE.goPage('check')}});
   if(first)it.push({label:'ide.n.explain',run:function(){if(!fresh(d))return stale(d);explainBox(d,first)}})}
  else{it.push({label:'ide.n.checkMod',run:function(){IDE.goPage('check')}});it.push({label:'ide.n.play',run:function(){IDE.goPage('play')}})}}
 else{if(!IRM&&!d.editable&&(d.why==='layer'||d.why==='outside'))it.push({label:'ide.n.copy',run:function(){copyFlow(d)}});
  if(d.editable&&d.cpLines)it.push({label:'ide.n.enc',p:{n:d.cpLines},run:function(){IDE.goPage('check')}});
  if(d.multi&&d.multi.length)it.push({label:'ide.n.patch',run:function(){IDE.goPage('check')}});
  if(d.findings.length&&!it.length)it.push({label:'ide.n.next',p:{n:d.findings.length},run:function(){moveProblem(1)}})}
 drawNext(it)}
function drawEmpty(){var b=UI.empty;if(!b)return;var a=IDE.active();if(a&&a.view){b.hidden=true;return}if(BOOT==='error'){b.hidden=false;return}
 b.textContent='';var show1=!IDE.docs.length||BOOT!=='ready';b.hidden=!show1;if(!show1)return;
 if(BOOT==='loading'){b.appendChild(h('div',{class:'ide-hint',text:tx('ide.loading')}));return}
 b.appendChild(h('p',{text:tx('ide.empty')}));
 b.appendChild(h('div',{class:'row'},[btn('ide.a.gofile',function(){IDE.run('gofile')},'primary','ide.a.gofileT')]))}
function setCollapsed(c){LS.set('ide.pc',!!c);if(UI.bottom){UI.bottom.hidden=!!c;UI.hdrag.hidden=!!c}if(UI.pblk)UI.pblk.hidden=!!c;if(UI.ptog)UI.ptog.setAttribute('aria-pressed',c?'false':'true')}
// (kit) the Code Pieces column (block kit): kitCol(true|false) shows or hides it and keeps that in LS ide.kit.open; kitCol() only
// reads. Returns whether the column is open now (false when it is not built: phone view, or the kit files are absent). A column
// open but hidden by Arrange (class blkoff) still counts as open here: the kit part tells the user about Arrange.
function kitCol(open){var b=UI.kblk;if(!b)return false;
 if(open===true||open===false){LS.set('ide.kit.open',open);b.hidden=!open;if(IDE.fit)later(IDE.fit,0)}return !b.hidden}
IDE.kitCol=kitCol;

// ---------------------------------------------------------------- actions
function hasDoc(){return !!IDE.active()}
// a text doc (not a viewer): the text actions (save, problems, explain, line, compare ...) need one
function hasText(){var d=IDE.active();return !!d&&!d.view}
function canEdit(){var d=IDE.active();return !!d&&d.editable}
function hasNav(){return navable(IDE.active())}
function canTabm(){return !!ED&&typeof ED.tabFocus==='function'}
function toggleTabm(){if(!canTabm())return;var on=!tabFocusOn();try{ED.tabFocus(on)}catch(e){}drawTabm(on);IDE.status(tx(on?'ide.tabm.on':'ide.tabm.off'))}
[['save','file','Ctrl+S',function(){save()},hasText],
 ['changes','file',null,showChanges,canEdit],
 ['revert','file',null,revert,function(){var d=IDE.active();return !!d&&isDirty(d)}],
 ['copyin','file',null,function(){copyFlow()},function(){var d=IDE.active();return !!d&&!d.editable&&(d.why==='layer'||d.why==='outside')}],
 ['npp','file',null,function(){extOpen('npp')},hasText],
 ['explorer','file','Shift+Alt+R',function(){extOpen('explorer')},hasDoc],
 ['revealList','file',null,revealList,hasDoc],
 ['nextTab','file','Ctrl+PageDown',function(){cycleTab(1)},function(){return IDE.docs.length>1}],
 ['prevTab','file','Ctrl+PageUp',function(){cycleTab(-1)},function(){return IDE.docs.length>1}],
 ['next','fix','F8',function(){moveProblem(1)},hasText],
 ['prev','fix','Shift+F8',function(){moveProblem(-1)},hasText],
 ['fixAt','fix','Ctrl+.',fixHere,function(){var d=IDE.active();return !!d&&d.editable&&(d.fixes.length>0||!fresh(d))}],
 ['fixAll','fix',null,fixAll,function(){var d=IDE.active();return !!d&&d.editable&&(!fresh(d)||d.fixes.some(function(x){return x.safe}))}],
 ['explain','fix','F1',explainHere,hasText],
 ['info','jump','Alt+F1',infoHere,hasText],
 ['checkmod','fix',null,function(){IDE.goPage('check')},function(){return !!S.mod}],
 ['patch','fix',null,function(){IDE.goPage('check')},function(){return !!S.mod}],
 ['gofile','jump','Ctrl+P',goFile,function(){return !!S.mod}],
 ['def','jump','F12',function(){goDef()},hasNav],
 ['refs','jump','Shift+F12',findRefs,hasNav],
 ['line','jump','Ctrl+G',askLine,hasText],
 ['outline','jump','Ctrl+Shift+O',outline,hasNav],
 ['back','jump','Alt+Left',function(){histGo(BACK,FWD)},function(){return BACK.length>0}],
 ['fwd','jump','Alt+Right',function(){histGo(FWD,BACK)},function(){return FWD.length>0}],
 ['compare','jump','Alt+V',compareVanilla,function(){var d=IDE.active();return !!d&&!d.view&&!!(d.key||d.ref.key)}],
 ['copies','jump','Alt+O',function(){sameFile(false)},function(){var d=IDE.active();return !!d&&!!(d.key||d.ref.key)}],
 ['side','jump','Alt+S',function(){sameFile(true)},function(){var d=IDE.active();return !!d&&!d.view&&!!(d.key||d.ref.key)}],
 ['which','jump','Alt+W',function(){var d=IDE.active();IDE.emit('which',{ref:d.ref});IDE.panel('which')},function(){var d=IDE.active();return !!d&&!!(d.key||d.ref.key)}],
 ['log','log','Ctrl+L',function(){if(IDE.actions.readLog)IDE.run('readLog');else IDE.panel('log')},function(){return !!S.mod}],
 ['tabFocus','other',null,toggleTabm,canTabm],
 ['fullscreen','other','Alt+Enter',function(){setFull(!FULL)},null],
 ['keys','other','F2',keyList,null]
].filter(function(a){return !IRM||['save','changes','revert','copyin','npp','explorer','fixAt','fixAll','info','checkmod','patch','def','refs','log'].indexOf(a[0])<0})
.forEach(function(a){IDE.action(a[0],{label:'ide.a.'+a[0],tip:'ide.a.'+a[0]+'T',key:a[2],group:a[1],run:a[3],when:a[4],
  bar:['prev','line','nextTab','prevTab','info','tabFocus'].indexOf(a[0])<0})});
IDE.actions.tabFocus.keyHint='Ctrl+M';
// (tabs) the batch close actions, File menu (also on the phone: closing tabs is the page's own view state). They work on the active
// tab; closeSel on the tabs picked with Ctrl+click / Shift+click. Close all has a key (Shift+Alt+W: Ctrl+W and Ctrl+F4 belong to the browser)
function actIdx(){return IDE.docs.indexOf(IDE.active())}
[['closeSel',function(){selClean();return TSEL.length>0}],
 ['closeTab',function(){return actIdx()>=0}],
 ['closeOthers',function(){return actIdx()>=0&&IDE.docs.length>1}],
 ['closeRight',function(){var i=actIdx();return i>=0&&i<IDE.docs.length-1}],
 ['closeLeft',function(){return actIdx()>0}],
 ['closeSaved',function(){return IDE.docs.some(function(d){return !isDirty(d)})}],
 ['closeAll',function(){return IDE.docs.length>0}]
].forEach(function(a){var kind={closeSel:'sel',closeTab:'one',closeOthers:'others',closeRight:'right',closeLeft:'left',closeSaved:'saved',closeAll:'all'}[a[0]];
 IDE.action(a[0],{label:'ide.a.'+a[0],tip:'ide.a.'+a[0]+'T',key:a[0]==='closeAll'?CLOSEALL:null,group:'file',bar:true,when:a[1],
  run:function(){closeSet(kind,null,focusIn(UI.tabs))}})});
// keys outside the editor (explorer, panels, toolbar, tab strip): capture phase, so a part's own handler cannot eat them first.
// Inside the editor CodeMirror runs them through ed.keys. Esc closes a shell box from anywhere.
document.addEventListener('keydown',function(e){if(S.cur!=='ide')return;
 if(document.querySelector&&document.querySelector('dialog[open]'))return;
 // Esc, first match: the favourites menu, a toolbar menu, a box, then full screen (only when nothing else would take the Esc)
 // (ESCT: when the browser's full screen is on, an Esc that something else took is noted, so the browser's exit that may come with it
 // does not end the Editor's full screen too: fsChange)
 if(e.key==='Escape'||e.key==='Esc'){var lv=false,et=e.target;
  // a searchKit list open under its box (page.js): that Esc is the kit's (it closes the list only); a pick box stays open
  if(et&&et._sk&&typeof et._sk.isOpen==='function'&&et._sk.isOpen()){if(FULL&&REALFS)ESCT=Date.now();return}
  // (tabs) the tab menu first; the tab selection next: in the tab strip that Esc is taken, elsewhere it also goes on (the text keeps its Esc)
  if(TM)closeTabMenu(true);else if(CTX)closeCtx(true);else if(MENU)closeMenu(true);else if(ovOpen())closeOverlay();
  else if(TSEL.length&&!e.isComposing){var inT=focusIn(UI.tabs);selClear();if(!inT){if(FULL&&REALFS)ESCT=Date.now();return}}
  else if(FULL&&!e.isComposing&&!escBusy(e)){setFull(false);lv=true}
  else{if(FULL&&REALFS)ESCT=Date.now();return}
  if(!lv&&FULL&&REALFS)ESCT=Date.now();stopEv(e);return}
 if(e.defaultPrevented||e.isComposing)return;
 var t=e.target||document.activeElement;
 if(UI.edHost&&t&&within(t,UI.edHost))return;
 var a=actionFor(evKey(e));if(!a||!canRun(a))return;e.preventDefault();
 // Alt+Enter must not also reach the explorer (Enter opens a file there)
 if(a.id==='fullscreen'&&e.stopPropagation)e.stopPropagation();
 // a menu open with the focus in it: closed, the focus back on its button (or on the favourite the favourites menu came from)
 if(TM){var tback=focusIn(TM.el)?TM.src:null;closeTabMenu(false);if(tback&&tback.focus)tback.focus()}
 if(MENU||CTX){var G0=MENU&&MENU.G,back=null;if(G0&&(focusIn(G0.menu)||(CTX&&focusIn(CTX.el))))back=G0.mb;else if(CTX&&focusIn(CTX.el)&&CTX.src&&shown(CTX.src))back=CTX.src;
  closeAll();if(back&&back.focus)back.focus()}
 IDE.run(a.id)},true);
won('focus',function(){if(S.cur==='ide')recheck()});
if(document.addEventListener)document.addEventListener('visibilitychange',function(){if(!document.hidden&&S.cur==='ide')inbox()});

// ---------------------------------------------------------------- disk recheck, inbox
function recheck(){var d=IDE.active();if(!d||!ED||d.saving||d.view)return;
 reopen(d).then(function(o){if(!o||o.hash===d.hash||IDE.docs.indexOf(d)<0)return;
  if(isDirty(d)){d.conflict=true;drawBars();return}
  takeDisk(d,o);IDE.status(tx('ide.reloaded'));IDE.emit('tree',{})}).catch(function(){})}
IDE.recheck=recheck;
function inbox(){if(INB||IRM)return;INB=true;
 (function loop(){if(S.cur!=='ide'||document.hidden){INB=false;return}
  call('/api/x/ide/inbox?wait=1').then(function(r){var its=r.items||[];
   if(its.length&&S.cur!=='ide'&&typeof show==='function')show('ide');
   // GT-15: one current mod. A file of another mod sent from outside switches the shared mod (header) first, never a private one
   its.forEach(function(it){var m=it.ref&&it.ref.mod;if(m&&low(m)!==low(S.mod)&&typeof setMod==='function')setMod(m);
    IDE.open(it.ref,it.line,it.col);try{window.focus()}catch(e){}});later(loop,50)})
  .catch(function(){later(loop,5000)})})()}
function drainPending(){var p=window.IDE_PENDING;if(!p||!p.length)return;p.splice(0).forEach(function(x){IDE.open(x.ref,x.line,x.col,x.view!==undefined?{view:x.view}:undefined)})}
IDE.on('tree',function(){TREE=null});
// requests from the other parts (coordinator note): fix, reload, compare
IDE.on('fix',function(x){var d=x.doc||IDE.active();if(!d||!ED||IDE.docs.indexOf(d)<0)return;if(!d.editable){IDE.status(roWhy(d));return}
 if(ACT!==d.id)activate(d);var fs=x.fixes||(x.fix?[x.fix]:[]);if(!fs.length)return;
 if(!fresh(d)||fs.some(function(f){return f._ver!==d.ver})){stale(d);return}
 var r=applyMany(d,fs);if(!r.n)return;
 IDE.status(fs.length===1?tx('ide.fixed',{l:txp(fs[0].label)}):tx(r.m?'ide.fixedAllMore':'ide.fixedAll',{n:r.n,m:r.m}))});
IDE.on('reload',function(x){var d=null;IDE.docs.forEach(function(o){if(o.ref.rel!=null&&low(o.ref.rel)===low(x.rel)&&(!x.mod||low(o.ref.mod)===low(x.mod))){
  if(o.view){if(o.vh)try{o.vh.refresh()}catch(e){}}else if(!d)d=o}});if(!d||!ED)return;
 // force: the sender (panels, after a Restore) already asked about unsaved text
 if(!x.force&&isDirty(d)&&!confirm(tx('ide.reloadQ',{n:d.name})))return;
 reopen(d).then(function(o){if(IDE.docs.indexOf(d)<0)return;takeDisk(d,o);IDE.status(tx('ide.reloaded'))})
 .catch(function(e){IDE.status(errMsg(e,'ide.openFail'))})});
IDE.on('compare',function(x){var l=x.left||{},r=x.right||{},m=S.mod;
 function q(s){var o={mod:s.mod||m};['rel','key','idx','path'].forEach(function(k){if(s[k]!=null)o[k]=s[k]});return o}
 function name(s){return s.rel||s.key||s.path||''}
 Promise.all([call(openQ(q(l))),call(openQ(q(r)))]).then(function(a){compareBox(a[0].text,name(l),a[1].text,name(r),kindOf(name(r)||name(l)))})
 .catch(function(e){IDE.status(errMsg(e))})});

// ---------------------------------------------------------------- the screen
EXT_SCREENS.ide=function(root){
 root.classList.add('ide-root');
 // blocks: the shell's regions are containers (shell, body, centre, mid, tb), its panels and toolbar
 // groups are leaves. Arrange reorders or hides them; the splitters ride inside the panel they size (explorer, panel), so a moved
 // panel keeps its own splitter. Leaves the code clears (tabs, crumb, bars, next, group buttons) are wrapped, never cleared.
 function nb(id,kids,cls){return h('div',{blk:id,class:cls||null,'data-blkname':tx('ide.blk.'+id)},kids)}
 var nomod=h('div',{class:'card ide-nomod',blk:'nomod',box:'col','data-blkname':tx('ide.blk.nomod')},[h('div',{blk:'nomod.lead'},[h('p',{text:tx('ide.noModLead')})]),
  h('div',{class:'row',blk:'nomod.btns'},[h('button',{type:'button',class:'primary',text:tx('ide.toMods'),onclick:function(){show('mods')}})])]);
 UI.tb=h('div',{class:'ide-tb',role:'toolbar','aria-label':tx('ide.tb'),blk:'tb',box:'row','data-blkname':tx('ide.blk.tb')});
 GROUPS.concat(['other']).forEach(function(g){UI.tb.appendChild(grpOf(g).b)});
 // full screen: the last block of the toolbar row (its own leaf, pushed to the right end)
 UI.root=root;FSD=null;
 UI.fsb=h('button',{type:'button',class:'ide-tbb ide-fsb ide-tbnav','aria-pressed':'false',tabindex:'-1'},[h('span',{class:'ide-fsi','aria-hidden':'true'})]);
 UI.fsb.addEventListener('click',function(){setFull(!FULL)});
 UI.fsb.addEventListener('keydown',function(e){navKey(e,UI.fsb)});
 UI.fsb.addEventListener('focus',function(){navStop(UI.fsb)});
 UI.tb.appendChild(h('div',{blk:'tb.full',class:'ide-tbfs','data-blkname':tx('ide.blk.full')},[UI.fsb]));
 // the favourites bar (leaf tb.fav, right below the toolbar row) and the one favourites menu (moved into the block it is opened in)
 UI.favl=h('div',{class:'ide-favl',role:'toolbar','aria-label':tx('ide.fav.h')});
 UI.cmenu=h('div',{class:'ide-menu ide-cmenu',role:'menu','aria-label':tx('ide.fav.h'),tabindex:'-1',hidden:true});
 UI.cmenu.addEventListener('keydown',ctxKey);
 UI.cmenu.addEventListener('contextmenu',function(e){if(e&&e.preventDefault)e.preventDefault()});
 UI.cmenu.addEventListener('focusout',function(){later(lostFocus,0)});
 UI.favb=h('div',{blk:'tb.fav',class:'ide-fav','data-blkname':tx('ide.blk.fav')},[UI.favl,UI.cmenu]);
 UI.favb.addEventListener('dragover',favOver);UI.favb.addEventListener('dragenter',favOver);UI.favb.addEventListener('drop',favDropEv);
 UI.tabs=h('div',{class:'ide-tabs',role:'tablist','aria-label':tx('ide.tabs')});
 // (tabs) the tab menu: one box in the tabs block, filled for the tab it is opened on (openTabMenu)
 UI.tmenu=h('div',{class:'ide-menu ide-tmenu',role:'menu','aria-label':tx('ide.ts.menu'),tabindex:'-1',hidden:true});
 UI.tmenu.addEventListener('keydown',tmKey);
 UI.tmenu.addEventListener('contextmenu',function(e){if(e&&e.preventDefault)e.preventDefault()});
 UI.tmenu.addEventListener('focusout',function(){later(lostFocus,0)});
 UI.crumb=h('div',{class:'ide-crumb'});UI.bars=h('div',{class:'ide-bars'});
 UI.edHost=h('div',{class:'ide-ed'});UI.empty=h('div',{class:'ide-empty',tabindex:'-1'});UI.ov=h('div',{class:'ide-ov',hidden:true});
 UI.ov.addEventListener('keydown',ovTrap);
 UI.next=h('div',{class:'ide-next',hidden:true});
 // (trail) the jump footnote under the text: Came from file:line, Back, Forward, the trail (drawFoot)
 UI.foot=h('div',{class:'ide-foot',role:'navigation','aria-label':tx('ide.hist.h')});UI.footb=nb('foot',[UI.foot],'ide-footblk');UI.footb.hidden=true;
 UI.hdrag=h('div',{class:'ide-hdrag',role:'separator','aria-orientation':'horizontal',tabindex:'0'});IDE.tip(UI.hdrag,'ide.dragH');
 UI.bottom=h('div',{class:'ide-bottom'});
 var left=UI.left=h('div',{class:'ide-left'}),vdrag=h('div',{class:'ide-vdrag',role:'separator','aria-orientation':'vertical',tabindex:'0'});IDE.tip(vdrag,'ide.dragV');
 // viewer docs draw in UI.vhost, laid over the text pane while one is the active tab (showView)
 UI.vhost=h('div',{class:'ide-vhost',hidden:true});
 var edWrap=h('div',{class:'ide-edwrap'},[UI.edHost,UI.vhost,UI.empty]);
 // tabs + crumb + bars + text: the rectangle the boxes (and the full compare box) sit on. The box layer (UI.ov) is a popup, not a
 // block: it stays the last child of this container, laid over it.
 UI.mid=h('div',{class:'ide-mid',blk:'mid',box:'col','data-blkname':tx('ide.blk.mid')},[nb('tabs',[UI.tabs,UI.tmenu],'ide-tabsb'),nb('crumb',[UI.crumb]),nb('bars',[UI.bars]),nb('editor',[edWrap],'ide-edblk'),UI.ov]);
 UI.pblk=nb('panel',[UI.hdrag,UI.bottom],'ide-pblk');
 var centre=h('div',{class:'ide-centre',blk:'centre',box:'col','data-blkname':tx('ide.blk.centre')},[UI.tb,UI.favb,UI.mid,UI.footb,nb('next',[UI.next]),UI.pblk]);
 UI.st=h('div',{class:'ide-status',blk:'status','data-blkname':tx('ide.blk.status')});
 UI.pos=h('span',{class:'ide-st'});UI.eol=h('span',{class:'ide-st'});UI.bom=h('span',{class:'ide-st'});UI.cp=h('span',{class:'ide-st ide-warn'});
 // only the message is a live region: cursor moves are not read out
 UI.where=h('span',{class:'ide-st'});UI.lint=h('span',{class:'ide-st'});UI.note=h('span',{class:'ide-st ide-warn'});UI.msg=h('span',{class:'ide-st-msg',role:'status','aria-live':'polite'});
 UI.tabm=h('button',{type:'button',class:'ide-tbb ide-tabm',hidden:true,text:tx('ide.tabm'),onclick:function(){toggleTabm();if(ED)ED.focus()}});tipText(UI.tabm,tx('ide.tabmT'),'Ctrl+M');
 IDE.tip(UI.eol,'ide.st.eolT');IDE.tip(UI.where,'ide.st.whereT');IDE.tip(UI.lint,'ide.st.lintT');
 UI.ptog=h('button',{type:'button',class:'ide-tbb',text:tx('ide.panel'),onclick:function(){setCollapsed(!LS.get('ide.pc',false))}});IDE.tip(UI.ptog,'ide.panelT');
 // GT-15: the Editor has no mod of its own; it shows the shared one, which is changed in the header
 UI.mod=h('span',{class:'ide-st'});IDE.tip(UI.mod,'ide.modT');
 [UI.pos,UI.eol,UI.bom,UI.cp,UI.where,UI.lint,UI.note,UI.msg,h('span',{class:'ide-grow'}),UI.mod,UI.tabm,UI.ptog].forEach(function(x){UI.st.appendChild(x)});
 // (kit) third column right of the centre, a leaf block with its own splitter on its left edge. Built only when the kit part is
 // loaded and this is not the phone view; no "part missing" hint otherwise. Hidden while LS ide.kit.open is not true; a narrow
 // window (below 900 px, where CSS makes it a drawer over the text) starts with it closed.
 var kitHost=null,kdrag=null;UI.kblk=null;
 if(!IRM&&typeof IDE.parts.kit==='function'){kitHost=h('div',{class:'ide-kit'});
  kdrag=h('div',{class:'ide-vdrag ide-kdrag',role:'separator','aria-orientation':'vertical',tabindex:'0','aria-label':tx('ide.blk.kit')});
  UI.kblk=nb('kit',[kdrag,kitHost],'ide-kblk');UI.kblk.hidden=!(LS.get('ide.kit.open',false)===true&&!((window.innerWidth||1200)<900))}
 var body=h('div',{class:'ide-body',blk:'body',box:'row','data-blkname':tx('ide.blk.body')},UI.kblk?[nb('explorer',[left,vdrag],'ide-xblk'),centre,UI.kblk]:[nb('explorer',[left,vdrag],'ide-xblk'),centre]);
 var shell=h('div',{class:'ide-shell',blk:'shell',box:'col','data-blkname':tx('ide.blk.shell')},[body,UI.st]);
 root.appendChild(nomod);root.appendChild(shell);
 // the Editor follows the page theme (header switch: light, dark, auto = system). Surfaces are page tokens and flip by CSS;
 // this picks the syntax palette and the shell's warning colour. Any old 'ide.theme' preference is ignored.
 function retheme(t){t=t==='dark'?'dark':'light';if(t===THEME)return;THEME=t;
  try{if(shell.classList){if(t==='dark')shell.classList.add('ide-dark');else shell.classList.remove('ide-dark')}}catch(e){}
  try{if(shell.setAttribute)shell.setAttribute('data-ide-theme',t)}catch(e){}
  if(ED&&ED.theme)try{ED.theme(t==='dark'?'gem2':'light')}catch(e){}}
 IDE.theme=function(){return THEME};
 retheme(pageTheme());
 try{if(window.IDE_THEME)window.IDE_THEME.watch(retheme)}catch(e){}
 // sizes: explorer width, panel height (kept), screen height = window minus what sits above and below
 function setW(w){w=Math.max(140,Math.min(900,Math.round(w)));left.style.width=w+'px';LS.set('ide.w',w)}
 // the panel never takes the editor's last 140 px: that is in the styles (.ide-mid min-height, .ide-bottom may shrink), not measured here
 function setPh(v){v=Math.max(60,Math.min(1200,Math.round(v)));UI.bottom.style.height=v+'px';LS.set('ide.ph',v)}
 setW(LS.get('ide.w',260));setPh(LS.get('ide.ph',200));setCollapsed(LS.get('ide.pc',false));
 function drag(bar,move){bar.addEventListener('mousedown',function(e){if(e.button!==0)return;e.preventDefault();shell.classList.add('ide-dragging');
   function mv(ev){move(ev)}function up(){document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);shell.classList.remove('ide-dragging')}
   document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up)})}
 // the explorer may sit right of the editor (Arrange): its splitter is then on its left edge (CSS) and the sizes run the other way
 function xRev(){try{return vdrag.getBoundingClientRect().left<left.getBoundingClientRect().left}catch(e){return false}}
 drag(vdrag,function(e){var r=left.getBoundingClientRect();setW(xRev()?r.right-e.clientX:e.clientX-r.left)});
 // the panel's splitter is always its top edge: the panel ends where its own box ends, wherever Arrange put it
 drag(UI.hdrag,function(e){var r=UI.bottom.getBoundingClientRect();setPh(r.bottom-e.clientY)});
 vdrag.addEventListener('keydown',function(e){if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setW(LS.get('ide.w',260)+((e.key==='ArrowLeft')!==xRev()?-20:20))}});
 UI.hdrag.addEventListener('keydown',function(e){if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();setPh(LS.get('ide.ph',200)+(e.key==='ArrowUp'?20:-20))}});
 // (kit) the column's width (LS ide.kit.w, 200 to 520). Its splitter is on its left edge; if Arrange put the column left of the
 // centre the splitter flips to its right edge (CSS) and the sizes run the other way, as for the explorer
 if(kitHost){
  var setKW=function(w){w=Math.max(200,Math.min(520,Math.round(w)));kitHost.style.width=w+'px';LS.set('ide.kit.w',w)};
  var kRev=function(){try{return kdrag.getBoundingClientRect().left>kitHost.getBoundingClientRect().left}catch(e){return false}};
  setKW(LS.get('ide.kit.w',280));
  drag(kdrag,function(e){var r=kitHost.getBoundingClientRect();setKW(kRev()?e.clientX-r.left:r.right-e.clientX)});
  kdrag.addEventListener('keydown',function(e){if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setKW(LS.get('ide.kit.w',280)+((e.key==='ArrowLeft')!==kRev()?20:-20))}})}
 // the screen fits the window exactly: window height minus the screen's top minus whatever the page puts below it (measured)
 function fit(){if(root.hidden||S.cur!=='ide'||!root.getBoundingClientRect||!shell.getBoundingClientRect)return;
  var vh=window.innerHeight||800,sy=window.pageYOffset||0,body=document.body,de=document.documentElement||body;
  if(sy&&window.scrollTo){try{window.scrollTo(0,0)}catch(e){}sy=window.pageYOffset||0}
  var r=root.getBoundingClientRect(),sh=shell.getBoundingClientRect().height,extra=Math.max(0,r.height-sh),below=0;
  if(body&&body.getBoundingClientRect){var br=body.getBoundingClientRect(),mb=0;
   try{if(window.getComputedStyle)mb=parseFloat(window.getComputedStyle(body).marginBottom)||0}catch(e){}
   below=Math.max(0,br.bottom-r.bottom)+mb}
  var hgt=Math.max(420,Math.floor(vh-(r.top+sy)-below-extra));shell.style.height=hgt+'px';
  var over=de&&de.scrollHeight?de.scrollHeight-vh:0;if(over>0&&hgt>420)shell.style.height=Math.max(420,hgt-over)+'px'}
 var FQ=false;function fitSoon(){if(FQ)return;FQ=true;later(function(){FQ=false;fit()},30)}
 won('resize',fitSoon);
 if(window.ResizeObserver&&document.body){try{new window.ResizeObserver(fitSoon).observe(document.body)}catch(e){}}
 // parts
 function part(name,host,args){var f=IDE.parts[name];if(typeof f!=='function'){host.appendChild(h('div',{class:'ide-hint ide-pad',text:tx('ide.partMissing',{p:name})}));return null}
  try{return f(host)}catch(e){host.appendChild(h('div',{class:'err ide-pad',text:tx('ide.partErr',{m:e.message})}));return null}}
 PARTS.explorer=part('explorer',left);PARTS.panels=part('panels',UI.bottom);
 if(kitHost)PARTS.kit=part('kit',kitHost);
 // (kit) the Advanced switch (page LS adv: Settings page or the Ctrl+K list) decides which pieces the kit column lists, and the column
 // draws only on its own events, so a switch made away from it left a stale tree (T pieces still there to insert, or missing). The
 // last value is kept here; when it differs the kit part is redrawn: on this page's refresh and focus, on a focus inside it, and (real
 // browsers) when the body's advon class, which the switch sets, changes.
 // A change is taken only while the column is up on this page (as the kit's own shown()): a switch made on the Settings page is left
 // for this page's refresh to see, not used up while the kit cannot redraw. The phone view has no column: nothing to do there.
 // The body observer is made once per screen build and lets go (disconnect) when this screen's root is no longer in the page.
 var ADVW=null,AMO=null;
 function advNow(){try{return typeof advOn==='function'?!!advOn():!!LS.get('adv',false)}catch(e){return false}}
 function inPage(n){for(;n;n=n.parentNode)if(n===document.body)return true;return false}
 function kitUp(){if(!kitHost||!PARTS.kit||S.cur!=='ide'||root.hidden||!kitCol())return false;
  for(var n=kitHost;n&&n!==root;n=n.parentNode)if(n.classList&&n.classList.contains('blkoff'))return false;return true}
 function advCheck(){if(AMO&&!inPage(root)){try{AMO.disconnect()}catch(e){}AMO=null;return}
  if(!kitUp())return;var a=advNow();if(a===ADVW)return;ADVW=a;var k=PARTS.kit;if(k&&k.refresh)try{k.refresh()}catch(e){}}
 ADVW=advNow();
 if(kitHost){root.addEventListener('focusin',advCheck);
  later(function(){try{if(!AMO&&typeof MutationObserver==='function'&&document.body){AMO=new MutationObserver(advCheck);AMO.observe(document.body,{attributes:true,attributeFilter:['class']})}}catch(e){AMO=null}},0)}
 drawBar();drawTabs();drawStatus();IDE.next([]);drawEmpty();
 function layout(){nomod.hidden=!!S.mod;shell.hidden=!S.mod;
  UI.mod.textContent=S.mod?tx('ide.modName',{m:String(S.mod).replace(/[\\\/]+$/,'').split(/[\\\/]/).pop()}):''}
 function refresh(){if(S.mod!==MOD||(GSEEN!==null&&gidNow()!==GSEEN))modChanged();layout();drainPending();retheme(pageTheme());
  if(S.cur==='ide'){if(S.mod)boot();inbox();later(fit,0)}updBar();pageVis();advCheck()}
 function focus(){later(fit,0);advCheck();var d=IDE.active();if(d&&d.view){if(d.vh)d.vh.focus()}else if(d&&ED)ED.focus();else if(PARTS.explorer&&PARTS.explorer.focus)try{PARTS.explorer.focus()}catch(e){}}
 IDE.fit=fit;
 // leaving the Editor page (another page's tab) hides the active viewer (handle.hide: a sound stops), coming back shows it
 // (handle.show: it redraws, never plays by itself). page.js only calls the new page's refresh, so the leave is seen by a
 // MutationObserver on the page section's hidden flag; without one (old engines, the fake DOM) by a short check while a viewer is up.
 var PV=true,PVT=false,MO=null;
 function pageSec(){return (S.sec&&S.sec.ide)||root}
 function pageVis(){var on=S.cur==='ide'&&!pageSec().hidden&&!root.hidden;
  if(!on){closeAll();if(FULL)setFull(false)}
  if(on!==PV){PV=on;var d=IDE.active();if(d&&d.view&&d.vh&&d.vel&&!d.vel.hidden)try{if(on)d.vh.show();else d.vh.hide()}catch(e){}}
  if(!MO&&!PVT&&PV&&IDE.docs.some(function(x){return x.view&&x.vh})){PVT=true;var t=later(function(){PVT=false;pageVis()},400);try{if(t&&t.unref)t.unref()}catch(e){}}}
 IDE.pageVis=pageVis;
 later(function(){try{if(typeof MutationObserver==='function'){MO=new MutationObserver(pageVis);MO.observe(pageSec(),{attributes:true,attributeFilter:['hidden']});if(pageSec()!==root)MO.observe(root,{attributes:true,attributeFilter:['hidden']})}}catch(e){MO=null}},0);
 layout();
 return {refresh:refresh,focus:focus}};
})();
`;

var css = [
'.ide-nomod{max-width:40em;margin:24px}',
// (trail) jump footnote under the text, and the strip another page gets ("Back to the editor at ...")
'.ide-foot{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;padding:2px 8px;font-size:12px;border-top:1px solid var(--line);color:var(--hint)}',
'.ide-footl{background:none;border:0;padding:0 2px;color:inherit;text-decoration:underline;cursor:pointer;font:inherit}',
'.ide-leftfoot{position:fixed;left:50%;bottom:8px;transform:translateX(-50%);z-index:50;padding:4px;border:1px solid var(--line);border-radius:6px;background:var(--in)}',
// no page scroll while the Editor screen is shown: the screen sizes itself to the window (fit)
// (not while arranging: then the shell grows to its content so every block bar shows, and the page scrolls)
'html:has(body:not(.arranging) section.ide-root:not([hidden])),html:has(body:not(.arranging) section.ide-root:not([hidden])) body{overflow:hidden}',
// --i* = page tokens (--in --th --line --fg --hint --sel --err --ok); --iw (warning text) is a palette entry per theme
CMT.shellCss(),
'.ide-shell{display:flex;flex-direction:column;background:var(--ib);color:var(--it);font:13px/1.35 Segoe UI,Arial,sans-serif;height:600px;min-height:420px;overflow:hidden;border-top:1px solid var(--il);box-sizing:border-box}',
'.ide-shell[hidden]{display:none}',
'.ide-body{display:flex;flex:1 1 auto;min-height:0}',
'.ide-left{flex:0 0 auto;width:260px;min-width:140px;overflow:auto;background:var(--ip);border-right:1px solid var(--il)}',
'.ide-vdrag{flex:0 0 5px;cursor:col-resize;background:var(--il)}',
'.ide-hdrag{flex:0 0 5px;cursor:row-resize;background:var(--il)}',
'.ide-vdrag:hover,.ide-hdrag:hover,.ide-vdrag:focus,.ide-hdrag:focus{background:var(--ia);outline:none}',
'.ide-hdrag[hidden],.ide-bottom[hidden],.ide-next[hidden],.ide-ov[hidden],.ide-empty[hidden],.ide-tabm[hidden]{display:none}',
'.ide-dragging{user-select:none;cursor:grabbing}',
'.ide-centre{display:flex;flex-direction:column;flex:1 1 auto;min-width:0;min-height:0}',
'.ide-mid{position:relative;display:flex;flex-direction:column;flex:1 1 0;min-height:140px}',
'.ide-tb{display:flex;flex-wrap:wrap;align-items:center;gap:2px;padding:2px 6px;background:var(--ip);border-bottom:1px solid var(--il)}',
'.ide-root .ide-tb.blc{gap:2px}',
// one menu button per group; the full screen button at the right end of the row
'.ide-mb{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}',
'.ide-caret{display:inline-block;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid currentColor;opacity:.7}',
'.ide-mb[aria-expanded=true]{border-color:var(--il);background:var(--il)}',
'.ide-root .ide-tb>.ide-tbfs,.ide-tbfs{margin-left:auto}',
'.ide-fsb{display:inline-flex;align-items:center;justify-content:center;min-width:26px;min-height:22px}',
'.ide-fsi{display:inline-block;width:12px;height:12px;background:linear-gradient(currentColor,currentColor) left top/5px 2px,linear-gradient(currentColor,currentColor) left top/2px 5px,linear-gradient(currentColor,currentColor) right top/5px 2px,linear-gradient(currentColor,currentColor) right top/2px 5px,linear-gradient(currentColor,currentColor) left bottom/5px 2px,linear-gradient(currentColor,currentColor) left bottom/2px 5px,linear-gradient(currentColor,currentColor) right bottom/5px 2px,linear-gradient(currentColor,currentColor) right bottom/2px 5px;background-repeat:no-repeat}',
'.ide-fsb[aria-pressed=true]{border-color:var(--ia);background:var(--il)}',
'.ide-fsb[aria-pressed=true] .ide-fsi{transform:scale(.7)}',
// a drop-down menu (and the favourites menu): fixed, placed by the code inside the window, above the editor and the panes
'.ide-menu{position:fixed;z-index:40;min-width:14em;max-width:min(30em,calc(100vw - 8px));overflow:auto;display:flex;flex-direction:column;padding:3px 0;background:var(--ib);color:var(--it);border:1px solid var(--il);border-radius:4px;box-shadow:0 4px 16px var(--shadow)}',
'.ide-menu[hidden]{display:none}',
// while a menu item is dragged the menu lets the pointer through and fades, so the favourites bar and its drop mark under it show
'.ide-menu.ide-thru{pointer-events:none;opacity:.25}',
'.ide-mi{display:flex;align-items:baseline;gap:8px;width:100%;box-sizing:border-box;text-align:left;background:none;color:inherit;border:0;border-radius:0;padding:4px 12px;font:inherit;cursor:pointer;white-space:nowrap}',
'.ide-mi:hover,.ide-mi:focus{background:var(--ia);outline:none}',
'.ide-mi:focus-visible{outline:1px solid var(--it);outline-offset:-2px}',
'.ide-mi[aria-disabled=true]{opacity:.45;cursor:default}',
'.ide-mi-n{flex:1 1 auto}',
'.ide-mi-f{flex:0 0 1em;color:var(--iw);text-align:center}',
'.ide-mi-k{flex:0 0 auto;color:var(--ih);font-size:.9em}',
// the favourites bar: one row of buttons right below the toolbar; empty, it shows a hint and still takes a drop
'.ide-fav{position:relative;background:var(--ip);border-bottom:1px solid var(--il)}',
'.ide-favl{display:flex;flex-wrap:wrap;align-items:center;gap:2px;padding:1px 6px;min-height:24px;box-sizing:border-box}',
'.ide-favl.ide-fav-on{outline:1px dashed var(--ia);outline-offset:-2px}',
'.ide-fav-none{padding:2px 4px;font-size:.92em}',
'.ide-fv[aria-disabled=true]{opacity:.45;cursor:default}',
'.ide-fav-mark{display:inline-block;align-self:stretch;width:2px;margin:2px 1px;background:var(--ia)}',
'.ide-keys kbd{font:inherit;font-weight:600}',
// full screen: the Editor covers the window, the page header too (not while arranging)
'body:not(.arranging) section.ide-root.ide-full:not([hidden]){position:fixed;inset:0;z-index:15;margin:0;padding:0;max-width:none;width:auto;height:auto;display:flex;flex-direction:column;overflow:hidden;background:var(--bg)}',
'body:not(.arranging) .ide-root.ide-full>.ide-shell{flex:1 1 auto;height:auto!important;min-height:0}',
// blocks: the shell regions keep their own flex sizing over the page's container rules (gap, wrap, min-content)
'.ide-root .ide-shell.blc,.ide-root .ide-centre.blc,.ide-root .ide-mid.blc{gap:0}',
'.ide-root .ide-body.blc{gap:0;flex-wrap:nowrap;align-items:stretch}',
'.ide-root .ide-body.blc>.ide-centre.blk{flex:1 1 0;min-width:0}',
'.ide-root .ide-body.blc>.ide-xblk.blk{flex:0 0 auto;min-width:0}',
'.ide-xblk{display:flex;min-height:0}',
'.ide-root .ide-body.blc>.ide-xblk:last-child{flex-direction:row-reverse}',
// (kit) the Code Pieces column: splitter on its left edge; moved left of the centre (Arrange) the splitter goes to its right edge
'.ide-kblk{display:flex;min-height:0}',
'.ide-kblk[hidden]{display:none}',
'.ide-root .ide-body.blc>.ide-kblk.blk{flex:0 0 auto;min-width:0}',
'.ide-root .ide-body.blc>.ide-kblk:first-child{flex-direction:row-reverse}',
'.ide-root .ide-body.blc>.ide-kblk:has(~.ide-centre){flex-direction:row-reverse}',
'.ide-kit{flex:0 0 auto;width:280px;min-width:200px;max-width:520px;display:flex;flex-direction:column;min-height:0;overflow:auto;background:var(--ip)}',
'.arranging .ide-kit{max-height:24em;min-height:10em}',
// below 900 px the column is a drawer over the right of the text (closed at load, see the screen code); not while arranging
'@media (max-width:899px){',
' body:not(.arranging) .ide-root .ide-body{position:relative}',
' body:not(.arranging) .ide-root .ide-body>.ide-kblk{position:absolute;right:0;top:0;bottom:0;width:min(320px,90vw);z-index:4;box-shadow:-6px 0 18px rgba(0,0,0,.35)}',
' body:not(.arranging) .ide-root .ide-body>.ide-kblk>.ide-kdrag{display:none}',
' body:not(.arranging) .ide-root .ide-body>.ide-kblk>.ide-kit{flex:1 1 auto;width:auto!important;max-width:none;min-width:0;border-left:1px solid var(--il)}',
' body:not(.arranging) .ide-root .ide-ed{z-index:0}',
'}',
'@media (max-width:899px) and (prefers-reduced-motion:no-preference){',
' body:not(.arranging) .ide-root .ide-body>.ide-kblk:not([hidden]){animation:ide-kin .15s ease-out}',
'}',
'@keyframes ide-kin{from{transform:translateX(24px);opacity:.4}to{transform:none;opacity:1}}',
'.ide-mid>.blk{flex:0 0 auto;min-width:0}',
'.ide-mid>.ide-edblk{display:flex;flex-direction:column;flex:1 1 auto;min-height:80px}',
'.ide-pblk{display:flex;flex-direction:column;flex:0 1 auto;min-height:65px}',
'.arranging .ide-shell{height:auto!important;overflow:visible}',
'.arranging .ide-root .ide-body.blc{flex-wrap:wrap}',
'.arranging .ide-mid{min-height:16em}',
'.arranging .ide-left{max-height:24em;min-height:10em}',
'.ide-tbb{background:transparent;color:var(--it);border:1px solid transparent;border-radius:3px;padding:2px 7px;font:inherit;cursor:pointer}',
'.ide-tbb:hover:not([disabled]),.ide-tbb:focus-visible{border-color:var(--il);background:var(--il)}',
'.ide-tbb[disabled]{opacity:.4;cursor:default}',
'.ide-tabm{border-color:var(--ik);color:var(--ik)}',
'.ide-tabs{display:flex;overflow-x:auto;background:var(--ip);border-bottom:1px solid var(--il);min-height:28px;flex:0 0 auto}',
'.ide-tab{display:flex;align-items:center;gap:5px;padding:4px 6px 4px 10px;border-right:1px solid var(--il);cursor:pointer;white-space:nowrap;color:var(--ih)}',
'.ide-tab.ide-on{background:var(--ib);color:var(--it);box-shadow:inset 0 2px 0 var(--ik)}',
'.ide-tab:focus-visible{outline:1px solid var(--ik);outline-offset:-1px}',
'.ide-tab{-webkit-user-select:none;user-select:none}',
'.ide-tab.ide-tsel{background:var(--ia);color:var(--it);box-shadow:inset 0 -3px 0 var(--ik)}',
'.ide-tab.ide-on.ide-tsel{box-shadow:inset 0 2px 0 var(--ik),inset 0 -3px 0 var(--ik)}',
'.ide-tsm{color:var(--ik);font-weight:bold}',
'.ide-tsl{margin:0;padding-left:1.2em;max-height:40vh;overflow:auto}',
'.ide-tsl li{margin:2px 0}',
'.ide-dot{color:var(--iw);font-size:11px}',
'.ide-lock{font-size:10px;padding:0 4px;border:1px solid var(--il);border-radius:3px;color:var(--ih)}',
'.ide-x{background:transparent;border:0;color:var(--ih);cursor:pointer;font:inherit;padding:0 4px;border-radius:3px}',
'.ide-x:hover,.ide-x:focus-visible{background:var(--il);color:var(--it)}',
'.ide-crumb{display:flex;align-items:center;flex-wrap:wrap;padding:2px 10px;font-size:12px;color:var(--ih);border-bottom:1px solid var(--il);flex:0 0 auto}',
'.ide-cw{color:var(--ik);margin-right:2px}.ide-cl{color:var(--it)}.ide-sep{opacity:.6}',
'.ide-cb{margin-left:auto;background:transparent;border:1px solid var(--il);color:var(--it);border-radius:3px;font:inherit;padding:0 6px;cursor:pointer}',
'.ide-bars{flex:0 0 auto}',
'.ide-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:5px 10px;background:var(--hbox);color:var(--fg);border-bottom:1px solid var(--hboxl);box-shadow:inset 3px 0 var(--err)}',
'.ide-edwrap{position:relative;flex:1 1 auto;min-height:80px}',
'.ide-ed{position:absolute;inset:0;overflow:hidden}',
'.ide-ed>.CodeMirror{height:100%}',
'.ide-empty{position:absolute;inset:0;padding:24px;background:var(--ib);color:var(--ih);z-index:2}',
'.ide-vhost{position:absolute;inset:0;z-index:1;background:var(--ib);color:var(--it);overflow:hidden}',
'.ide-vhost[hidden],.ide-vw[hidden]{display:none}',
'.ide-vw{position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden}',
'.ide-vw>.vw-host{flex:1 1 auto}',
'.ide-vk{border-color:var(--ik);color:var(--ik)}',
'.ide-ov{position:absolute;top:8px;left:50%;transform:translateX(-50%);width:min(760px,94%);max-height:calc(100% - 16px);display:flex;flex-direction:column;z-index:5;',
' background:var(--ip);color:var(--it);border:1px solid var(--il);border-radius:6px;box-shadow:0 8px 30px rgba(0,0,0,.45)}',
'.ide-ov.ide-ov-full{inset:0;top:0;left:0;transform:none;width:auto;max-height:none;border-radius:0}',
'.ide-ov.ide-ov-at{transform:none;width:auto;max-width:min(520px,94%);max-height:60%}',
'.ide-card,.ide-pick{display:flex;flex-direction:column;gap:6px;padding:8px 10px;min-height:0;overflow:auto}',
'.ide-info-r b{color:var(--ih);font-weight:600}',
'.ide-cmp{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;padding:6px 8px}',
'.ide-ov-full .ide-cmp{height:100%;box-sizing:border-box}',
'.ide-cmp-host{flex:1 1 auto;min-height:0;position:relative}',
'.ide-ovh{display:flex;align-items:center;gap:8px}.ide-ovh b{flex:1}',
'.ide-kv{border-collapse:collapse}','.ide-kv{width:auto}','.ide-kv th{position:static;background:none;text-align:left;font-weight:600;padding:2px 12px 2px 0;vertical-align:top;white-space:nowrap}','.ide-kv td{padding:2px 0;white-space:pre-wrap}',
'.ide-pick-h{font-weight:600;display:flex;gap:8px;align-items:center}','.ide-pick-t{flex:1}','.ide-pick-h button{font-weight:400}',
'.ide-pick input,.ide-card input.ide-wide{width:100%;box-sizing:border-box;background:var(--ib);color:var(--it);border:1px solid var(--il);padding:4px 6px;font:inherit}',
'.ide-pick>.sk{display:flex;width:100%}','.ide-pick>.sk>input{width:auto;flex:1 1 auto;min-width:0}',
'.ide-pick-list{overflow:auto;max-height:50vh;font-family:Consolas,monospace;font-size:12px}',
'.ide-pick-it{padding:2px 6px;cursor:pointer;white-space:pre;overflow:hidden;text-overflow:ellipsis}',
'.ide-pick-it.ide-sel,.ide-pick-it:hover{background:var(--ia)}',
'.ide-diff{max-height:50vh;overflow:auto;background:var(--ib);padding:6px;font:12px Consolas,monospace;margin:0}',
'.ide-dh{color:var(--ih)}.ide-dd{color:var(--ie)}.ide-da{color:var(--ik)}',
'.ide-hint{color:var(--ih)}.ide-pad{padding:10px}',
'.ide-next{display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:4px 10px;border-top:1px solid var(--il);background:var(--ip)}',
'.ide-bottom{flex:0 1 auto;height:200px;overflow:hidden;position:relative;background:var(--ip);min-height:60px}',
// the status bar wraps to a second line when it does not fit (it used to clip its right end)
'.ide-status{display:flex;flex-wrap:wrap;align-items:center;gap:0 14px;padding:2px 10px;font-size:12px;background:var(--ip);border-top:1px solid var(--il);color:var(--ih);white-space:nowrap;flex:0 0 auto}',
'.ide-st-msg{color:var(--it);max-width:100%;overflow:hidden;text-overflow:ellipsis;transition:opacity .6s}.ide-st-msg.ide-fade{opacity:0}',
'.ide-warn{color:var(--iw)}.ide-grow{flex:1}',
'.ide-status .ide-tbb[aria-pressed=true]{border-color:var(--il)}'
].join('\n');

module.exports = { script: script, css: css };
