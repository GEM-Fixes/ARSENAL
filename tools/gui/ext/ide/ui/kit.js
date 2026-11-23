// Editor Code Pieces pane (design v1): ready-made code in a column beside the text (a drawer below 900 px).
// Tree of the pieces for the open file's kind, ranked by what is open at the cursor; search; preview; click, Enter, Shift+Enter,
// Alt+Insert, pointer drag with a gap marker, touch tap and "Add here"; one undo step per insert; field session after it; every
// refusal with its next step; after-insert check. Nothing on a phone (IDE.remote). Contract: tools/ide/README.md (kit lines).
// Browser script (ES5, page rules: no backtick, no dollar-brace, DOM only through h() and textContent). The planner (kitPlan) and
// the file kinds (kitKinds) come from tools/ide/kit by toString(): the same code the tests run in node.
// Author: Imperator_Aug (ARSENAL, ia-95754da7)
'use strict';
function fnSrc(load) { try { const f = load(); return typeof f === 'function' ? f.toString() : ''; } catch (e) { return ''; } }
const PLAN = fnSrc(() => require('../../../../ide/kit/plan')), KINDS = fnSrc(() => require('../../../../ide/kit/kinds'));

const BODY = String.raw`
if(typeof IDE==='undefined'||!IDE||!IDE.parts||IDE.remote)return;
// keys reached through a computed name: listed whole here (scope words, tag badges, planner refusals and warnings)
var KIT_KEYS=['ide.kit.w.top','ide.kit.w.block','ide.kit.w.handler','ide.kit.w.branch','ide.kit.w.timer','ide.kit.w.container',
 'ide.kit.t.V','ide.kit.t.short','ide.kit.t.I','ide.kit.t.T',
 'ide.kit.x.view','ide.kit.x.cover','ide.kit.x.ro','ide.kit.x.kind','ide.kit.x.scope','ide.kit.x.dup','ide.kit.x.unknown','ide.kit.notAdded',
 'ide.kit.w.delay','ide.kit.w.noCtx','ide.kit.w.call','ide.kit.w.flag','ide.kit.w.mp','ide.kit.w.ascii','ide.kit.w.quoted','ide.kit.addedAfter',
 'ide.kit.ctx.source','ide.kit.ctx.volume','ide.kit.ctx.part','ide.kit.ctx.value','ide.kit.ctx.instigator','ide.kit.ctx.sender','ide.kit.ctx.bullet',
 'ide.kit.x.whole','ide.kit.x.mp','ide.kit.w.any','ide.kit.w.empty',
 'ide.kit.sz.line','ide.kit.sz.small','ide.kit.sz.medium','ide.kit.sz.large','ide.kit.szT.line','ide.kit.szT.small','ide.kit.szT.medium','ide.kit.szT.large',
 'ide.kit.mp.yes','ide.kit.mp.no','ide.kit.mp.unknown','ide.kit.mpT.yes','ide.kit.mpT.no','ide.kit.mpT.unknown'];
var KP=kitPlan(),KK=kitKinds(),PK=['ia-entity','sdl'],BIG=1000000;
// the planner every call uses: window.IDE_KITPLAN when set (a test seam of the page cases: a wrapper over a planner), else the shipped one
function kp(){var w=null;try{w=window.IDE_KITPLAN||null}catch(e){w=null}return w||KP}
// scope ids of the planner with a lang row of their own (ide.kit.w.<id>); 'in:<word>' and 'in:*' are worded by whereTx
var WHERE=['top','block','handler','branch','timer','container','any','empty'];
function whereTx(id){id=String(id||'top');if(WHERE.indexOf(id)>=0)return tx('ide.kit.w.'+id);
 if(id==='in:*')return tx('ide.kit.w.inName');if(id.slice(0,3)==='in:')return tx('ide.kit.w.in',{word:id.slice(3)});return id}
// sizes: the piece's own size, else from its line count (v1 pieces carry none): line 1, small 2-8, medium 9-40, large over 40
var SIZES=['line','small','medium','large'];
function sizeByLines(n){return n<=1?'line':n<=8?'small':n<=40?'medium':'large'}
// the size and multiplayer filters: this browser only (localStorage, not the GUI settings the server keeps for every browser)
var FLK='as2gui.ide.kit.flt';
function fltGet(){var o=null;try{o=JSON.parse(window.localStorage.getItem(FLK)||'null')}catch(e){o=null}
 if(!o||typeof o!=='object')o={};return {sz:['all','small','medium','large'].indexOf(o.sz)>=0?o.sz:'all',mp:o.mp===true}}
function fltSet(f){try{window.localStorage.setItem(FLK,JSON.stringify({sz:f.sz,mp:!!f.mp}))}catch(e){}}
// the context words the planner names in w.noCtx (words.ctxOfCond values): each has its own row; any other word is shown as it is
var CTXW=['source','volume','part','value','instigator','sender','bullet'];
// the warnings that depend on the values typed in the field session (checked again when it ends)
var VALW=['ide.kit.w.delay','ide.kit.w.noCtx','ide.kit.w.call','ide.kit.w.flag','ide.kit.w.ascii','ide.kit.w.quoted'];
// the session ends that keep the piece in the text (the others: undo, reload, another tab, closed, a new insert)
var KEEP=['done','esc','click','edit'];
var SCOPES=['top','block','handler','branch','timer','container'];
var FOLD0=['fav','recent','ia.start','sdl.any'];
function T(k,p){return tx('ide.kit.'+k,p)}
function lang(){return typeof LANG!=='undefined'&&LANG?LANG:'en'}
function lsGet(k,d){try{var v=LS.get(k,d);return v===undefined?d:v}catch(e){return d}}
function lsSet(k,v){try{LS.set(k,v)}catch(e){}}
function low(s){return String(s==null?'':s).toLowerCase()}
function soon(f,ms){return setTimeout(f,ms||0)}
function cls(el,c,on){if(!el||!el.classList)return;if(on)el.classList.add(c);else el.classList.remove(c)}
function hasCls(el,c){return !!(el&&el.classList&&el.classList.contains(c))}
function ime(e){return !!(e&&(e.isComposing||e.keyCode===229))}
function isEnter(e){return e.key==='Enter'&&!ime(e)}
function adv(){try{return typeof advOn==='function'?!!advOn():!!lsGet('adv',false)}catch(e){return false}}
function arrangeOn(){try{return !!(window.as2Blocks&&window.as2Blocks.on&&window.as2Blocks.on())}catch(e){return false}}
function under(el,root){var n=el;while(n){if(n===root)return true;n=n.parentNode}return false}
function upCls(el,c){var n=el;while(n){if(hasCls(n,c))return true;n=n.parentNode}return false}
function canRun(id){var a=IDE.actions&&IDE.actions[id];if(!a)return false;try{return !a.when||!!a.when()}catch(e){return false}}
function docById(id){var l=IDE.docs||[];for(var i=0;i<l.length;i++)if(l[i]&&l[i].id===id)return l[i];return null}
// the kit kind of a doc: a viewer or no doc is 'none'; else by its game path (key), else its path in the mod
function warnText(w){var p=w.p||{};if(w.k==='ide.kit.w.noCtx'&&CTXW.indexOf(p.what)>=0)p={what:tx('ide.kit.ctx.'+p.what)};return tx(w.k,p)}
function kindOfDoc(d){if(!d||d.view)return 'none';var k=d.key||(d.ref&&d.ref.key)||'';
 if(!k){var p=low(String(d.path||(d.ref&&d.ref.path)||'').replace(/\\/g,'/')),i=p.indexOf('/resource/');k=i>=0?p.slice(i+1):(d.rel||(d.ref&&d.ref.rel)||'')}
 try{return KK.kitKindOf(low(String(k).replace(/\\/g,'/')))}catch(e){return 'none'}}
// the doc's path inside the mod for the planner (opts.rel: forward slashes, lower case); a game file: its key after the last '::'
function relOf(d){if(!d||d.view)return '';var r=d.rel||(d.ref&&d.ref.rel)||'';
 if(!r){r=String(d.key||(d.ref&&d.ref.key)||'');var j=r.lastIndexOf('::');if(j>=0)r=r.slice(j+2)}
 if(!r){var p=low(String(d.path||(d.ref&&d.ref.path)||'').replace(/\\/g,'/')),i=p.indexOf('/resource/');r=i>=0?p.slice(i+1):''}
 return low(String(r).replace(/\\/g,'/'))}

IDE.parts.kit=function(host){
 // a stored fold value that is not a plain object (a hand-edited settings file) is ignored: fold() writes into it
 var A={},BUSY={},ERR={},WAIT={},CACHE={},NM={},FOLD=lsGet('ide.kit.fold',{});
 if(!FOLD||typeof FOLD!=='object'||Array.isArray(FOLD))FOLD={};
 var st={kind:'none',scope:null,fit:null,q:'',pv:null,rows:[],ri:0,rankT:null,hoverT:null,pt:'mouse',eat:false};
 // RJ: the doc whose next-step strip holds this pane's refusal steps (cleared when a piece goes in)
 var SESS=null,CHK=null,DR=null,GH=null,FT=null,hooked=null,BL=false,BG=null,RJ=null;
 if(host.classList)host.classList.add('idk');

 // ---- frame: head, kind line (with a ? to the guide), search, first-visit card, notes, the fit count (the only live region: its
 // text is set only when it changes), tree, preview (not live: a screen reader reads the focused row, not the whole preview)
 var closeB=h('button',{type:'button',class:'idk-x',text:T('close'),title:T('closeT'),onclick:function(){IDE.kitCol(false);edFocus()}});
 var forTx=h('span',{class:'idk-fort'});
 var helpB=h('button',{type:'button',class:'idk-q1',text:'?',title:T('help'),'aria-label':T('help'),onclick:function(){help()}});
 var forEl=h('div',{class:'idk-for'},[forTx,helpB]);
 var q=h('input',{type:'search',class:'idk-q',autocomplete:'off',spellcheck:'false',placeholder:T('find'),'aria-label':T('find')});
 var cardEl=h('div',{class:'idk-card',role:'note'});
 var stEl=h('div',{class:'idk-st'});
 var fitEl=h('div',{class:'idk-note idk-fitn',role:'status','aria-live':'polite'});
 var tree=h('div',{class:'idk-tree',role:'tree','aria-label':T('tree')});
 var pv=h('div',{class:'idk-pv'});pv.hidden=true;
 // searchKit (page.js; owner 2026-11-19: browse, indexed search and history on every search box): history 'ide.pieces.q', index = the
 // pieces this search finds (titles, code, descriptions of the catalog the pane holds); a pick shows that piece. The pieces are the
 // tool's own catalog, no file of the game or the mod: Browse is the kit's default file picker (its base name searches the pieces).
 // arrows false: ArrowDown with the list shut goes to the tree as before
 function kitItem(p){var a=ans(),s=a&&a.sec[p.sec];return {label:p.title,value:p.title,hint:s?s.title:'',p:p}}
 var qKit=IDE.kitOn?IDE.kitOn(q,{key:'ide.pieces.q',arrows:false,
  index:function(s,done){var a=ans();if(!a){done([]);return}var r=search(a,s);done(r.slice(0,30).map(function(x){return kitItem(x.p)}),Math.max(0,r.length-30))},
  onPick:function(v,it){q.value=v;st.q=String(v||'').trim();draw();if(it&&it.p){preview(it.p,true);for(var i=0;i<st.rows.length;i++)if(st.rows[i].p===it.p){st.ri=i;roving();break}}}}):null;
 // the filters beside the search: size (All, Small = line + small, Medium, Large) and, when the catalog marks multiplayer, safe only.
 // They combine with the search and with Advanced; kept in this browser (fltGet / fltSet)
 var FLT=fltGet();
 var szSel=h('select',{class:'idk-fsz','aria-label':T('fSize'),title:T('fSize')},[h('option',{value:'all',text:T('fsz.all')}),h('option',{value:'small',text:T('fsz.small')}),
  h('option',{value:'medium',text:T('sz.medium')}),h('option',{value:'large',text:T('sz.large')})]);
 szSel.value=FLT.sz;
 var mpCb=h('input',{type:'checkbox',class:'idk-fmpc'});mpCb.checked=FLT.mp;
 var mpLab=h('label',{class:'idk-fmp'},[mpCb,h('span',{text:T('fMp')})]);mpLab.hidden=true;
 var fltEl=h('div',{class:'idk-flt',role:'group','aria-label':T('fltG')},[szSel,mpLab]);
 szSel.addEventListener('change',function(){FLT.sz=String(szSel.value||'all');fltSet(FLT);draw()});
 mpCb.addEventListener('change',function(){FLT.mp=!!mpCb.checked;fltSet(FLT);draw()});
 [h('div',{class:'idk-head'},[h('b',{class:'idk-title',text:T('title')}),closeB]),forEl,qKit?qKit.el:q,fltEl,cardEl,stEl,fitEl,tree,pv].forEach(function(e){host.appendChild(e)});
 function setFit(t){t=t||'';if(fitEl.textContent!==t)fitEl.textContent=t}

 function edFocus(){var ed=IDE.ed&&IDE.ed();if(ed&&ed.focus)try{ed.focus()}catch(e){}}
 function shown(){return !!IDE.kitCol()&&!upCls(host,'blkoff')&&(typeof S==='undefined'||!S||S.cur==='ide')}
 function focusIn(el){var a=document.activeElement;return !!a&&a!==el&&under(a,el)||a===el}

 // ---- answers per kind and language (the route answer is kept; one request at a time per kind)
 // one catalog per game too (the route answers for the page's game, sent by api()); AS64 keys as before
 function akey(k){var g='';try{g=(typeof S!=='undefined'&&S&&S.gameId)||''}catch(e){g=''}return (g&&g!=='as64'?g+'|':'')+k+'|'+lang()}
 function ansOf(k){return A[akey(k)]||null}
 function ans(){return ansOf(st.kind)}
 // per answer, once: pieces by id and section, the sub-sections of each top (sorted), the code text, its line count and size, and
 // whether any piece carries a multiplayer mark (the "Multiplayer safe only" filter shows only then); own = pieces of this kind
 function prep(a){a=a||{};a.pieces=a.pieces||[];a.sections=a.sections||[];a.views=a.views||{};a.kinds=a.kinds||{};a.words=a.words||{};a.byId={};a.sec={};a.bySec={};a.kids={};a.tops=[];a.hasMp=false;a.own=0;
  a.pieces.forEach(function(p){a.byId[p.id]=p;var c='';try{c=kp().compile(p).text}catch(e){}p._code=c;p._s=[low(p.title),low(p.titleEn),low(c),low(p.what)];
   p._ln=c?c.replace(/\n$/,'').split('\n').length:0;p._sz=SIZES.indexOf(p.size)>=0?p.size:sizeByLines(p._ln);
   if(p.mp==='yes'||p.mp==='no'||p.mp==='unknown')a.hasMp=true;if((p.kinds||[]).indexOf(a.kind)>=0&&a.kind!=='sdl')a.own++;(a.bySec[p.sec]=a.bySec[p.sec]||[]).push(p)});
  a.sections.forEach(function(s){a.sec[s.id]=s;if(s.parent)(a.kids[s.parent]=a.kids[s.parent]||[]).push(s);else a.tops.push(s)});
  a.tops.sort(bySort);for(var k in a.kids)a.kids[k].sort(bySort);return a}
 function load(k,cb){var K=akey(k);if(A[K]){if(cb)cb(A[K]);return}if(cb)(WAIT[K]=WAIT[K]||[]).push(cb);if(BUSY[K])return;BUSY[K]=true;ERR[K]=null;
  api('/api/x/ide/kit?kind='+encodeURIComponent(k)+'&lang='+encodeURIComponent(lang())).then(function(a){BUSY[K]=false;A[K]=prep(a);var w=WAIT[K]||[];WAIT[K]=[];
   w.forEach(function(f){try{f(A[K])}catch(e){}});if(akey(st.kind)===K)rankNow()})
  // the waiting callbacks hear of the error too (cb(null, message)): Alt+Insert with the column closed says why nothing opens
  .catch(function(e){BUSY[K]=false;var w=WAIT[K]||[];WAIT[K]=[];ERR[K]=(e&&(e.text||e.message))||String(e);
   w.forEach(function(f){try{f(null,ERR[K])}catch(x){}});if(akey(st.kind)===K)draw()})}
 // the translated name of a kind from any answer in this language (every answer carries them all), or null before one came
 function kindsMap(){var K,end='|'+lang();for(K in A)if(K.slice(-end.length)===end&&A[K]&&A[K].kinds)return A[K].kinds;return null}
 function kindTitle(k){var m=kindsMap();return m&&m[k]?m[k]:null}
 function kindName(k){return kindTitle(k)||k}

 // ---- the doc, the editor, what is open at the cursor
 function edFor(d){var ed=IDE.ed&&IDE.ed();if(!d||d.view||!ed)return null;if(ed.current&&ed.current()!=null&&ed.current()!==d.id)return null;return ed}
 // the editor sends 'change' 150 ms after typing: send it now, so d.ver and the scope cache match the lines read next
 function srcOf(ed){if(ed.flush)try{ed.flush()}catch(e){}return {count:ed.lineCount()|0,line:function(n){return ed.line(n)}}}
 function hookEd(){var ed=IDE.ed&&IDE.ed();if(!ed||hooked===ed||!ed.on)return;hooked=ed;
  ed.on('change',function(ev){var id=ev&&ev.id,c=id!=null?CACHE[id]:null;if(!c)return;kp().cacheDrop(c.c,(ev.from|0)||1);var d=docById(id);if(d)c.ver=d.ver})}
 function cacheOf(d){hookEd();var c=CACHE[d.id];if(!c||c.ver!==d.ver)c=CACHE[d.id]={c:{},ver:d.ver};return c.c}
 // the names of the whole file (flags, reactions, helpers) per doc and version: one scan, not one per plan (a drag plans per gap)
 function namesOf(d,src){var c=NM[d.id];if(c&&d.ver!=null&&c.ver===d.ver)return c.n;var n=kp().scanNames(src);if(d.ver!=null)NM[d.id]={ver:d.ver,n:n};return n}
 // planner options; names is read only by the plans that need it (a getter), from the cache above
 function popts(d,src,o){o.kitKind=kindOfDoc(d);o.rel=relOf(d);o.editable=d.editable!==false;o.why=d.why;o.cache=cacheOf(d);
  try{Object.defineProperty(o,'names',{enumerable:true,configurable:true,get:function(){return namesOf(d,src)}})}catch(e){}return o}
 // the scope a piece lands in: inside an action or a value the planner moves the gap after its closer (the drag label's words)
 function effKind(s){if(s.kind!=='action'&&s.kind!=='value')return s.kind;var k=s.depth-1;
  while(k>0&&(s.frames[k-1].kind==='action'||s.frames[k-1].kind==='value'))k--;return k>0?s.frames[k-1].kind:'top'}
 // ranked at the gap a click would use (cursorGap), not at the start of the cursor line: { s (scopeAt), src, d } or null
 function scopeHere(d,a){var ed=edFor(d);if(!ed)return null;try{if(a)kp().use(a.words);var src=srcOf(ed);return {s:kp().scopeAt(src,cursorGap(ed),cacheOf(d)),src:src,d:d}}catch(e){return null}}
 function ro(){var d=IDE.active();return !!d&&!d.view&&d.editable===false}
 // what fits there is the planner's own answer (kp().fits: the same places a click uses, fragment files and define bodies too)
 function fitMap(a,h){if(!a||!h)return null;var m={},o={kitKind:kindOfDoc(h.d),rel:relOf(h.d),cache:cacheOf(h.d)};
  a.pieces.forEach(function(p){try{if(kp().fits(h.src,h.s,p,o))m[p.id]=true}catch(e){}});return m}
 function canSee(p){return !!p&&(adv()||(!p.adv&&p.tag!=='T'))}
 function secOk(s){return adv()||!s.adv}
 // the filters: size (small = line + small) and multiplayer safe only (a piece with no mark, a shared data piece, stays)
 function fltOk(p){var z=p._sz||'small';if(FLT.sz==='small'&&z!=='line'&&z!=='small')return false;if((FLT.sz==='medium'||FLT.sz==='large')&&z!==FLT.sz)return false;
  if(FLT.mp&&mpOn()&&(p.mp==='no'||p.mp==='unknown'))return false;return true}
 function mpOn(){var a=ans();return !!(a&&a.hasMp)}
 function fltActive(){return FLT.sz!=='all'||(FLT.mp&&mpOn())}
 function vis(p){return canSee(p)&&fltOk(p)}
 function whereOf(p){return whereTx((p.scope||[])[0]||'top')}
 function tagKey(p){return p.tag==='V'?(p.short?'t.short':'t.V'):p.tag==='I'?'t.I':'t.T'}

 // ---- sync with the active doc; rank after the cursor or the text moved (150 ms); nothing while the pane is closed
 function sync(){var k=kindOfDoc(IDE.active());if(k!==st.kind){st.kind=k;st.scope=null;st.fit=null}drawFor();if(k!=='none')load(k);rankSoon(0)}
 function rankSoon(ms){if(st.rankT)clearTimeout(st.rankT);st.rankT=soon(rankNow,ms==null?150:ms)}
 function rankNow(){st.rankT=null;if(!shown())return;var a=ans(),d=IDE.active(),h=a?scopeHere(d,a):null;st.scope=h?h.s:null;st.fit=fitMap(a,h);draw()}

 // ---- favourites and used lately (this browser)
 function favs(){var v=lsGet('ide.kit.fav',[]);return Array.isArray(v)?v:[]}
 function recents(){var v=lsGet('ide.kit.recent',[]);return Array.isArray(v)?v:[]}
 function isFav(id){return favs().indexOf(id)>=0}
 function star(id){var f=favs().slice(),i=f.indexOf(id);if(i>=0)f.splice(i,1);else{f.unshift(id);f=f.slice(0,100)}lsSet('ide.kit.fav',f);draw();
  var a=ans();if(st.pv===id&&a&&a.byId[id])preview(a.byId[id])}
 function used(id){var r=recents().filter(function(x){return x!==id});r.unshift(id);lsSet('ide.kit.recent',r.slice(0,15))}

 // ---- drawing
 // the kind line only with the kind's own name: while it is not known (loading, an error, no route) the line is not shown
 function drawFor(){var k=st.kind,t=k==='none'?null:kindTitle(k);forTx.textContent=t?T('forFile',{kind:t}):'';forEl.hidden=!t;helpB.hidden=!/^ia-/.test(k)}
 // no file: the kinds that have pieces (their names come with any kit answer; the 'none' answer carries them all)
 function kindsNote(){var m=kindsMap();
  if(!m){if(!BUSY[akey('none')]&&!ERR[akey('none')])load('none');return null}
  var wp=withPieces();return note(T('kinds',{list:wp.map(function(k){return m[k]||k}).join(', ')}))}
 // the kinds that have pieces: the route's list when an answer carries one (withPieces), else the v1 list
 function withPieces(){var K,end='|'+lang();for(K in A)if(K.slice(-end.length)===end&&A[K]&&Array.isArray(A[K].withPieces)&&A[K].withPieces.length)return A[K].withPieces;return PK}
 // a file over 1 MB (the check skips it): measured once per doc version
 function bigDoc(d){if(!d||d.view||!IDE.textOf)return false;if(BG&&BG.id===d.id&&BG.ver===d.ver)return BG.big;
  var b=false;try{b=String(IDE.textOf(d)||'').length>BIG}catch(e){}BG={id:d.id,ver:d.ver,big:b};return b}
 // an open preview of a piece the pane does not list now (Advanced went off, another kind of file) closes
 function pvCheck(a){if(st.pv==null)return;var p=a&&a.byId[st.pv];if(p&&canSee(p))return;st.pv=null;pv.hidden=true;pv.textContent=''}
 function drawCard(){cardEl.textContent='';cardEl.hidden=!!lsGet('ide.kit.seen',false);if(cardEl.hidden)return;
  cardEl.appendChild(h('p',{text:T('lead')}));cardEl.appendChild(h('p',{text:T('first')}));
  cardEl.appendChild(h('button',{type:'button',class:'idk-got',text:T('gotIt'),onclick:function(){lsSet('ide.kit.seen',true);cardEl.hidden=true;cardEl.textContent='';qFocus()}}))}
 function note(t,c){return h('div',{class:'idk-note'+(c?' '+c:''),text:t})}
 function draw(){if(!shown())return;drawFor();drawCard();
  var a=ans(),K=akey(st.kind),cur=st.rows[st.ri],had=cur&&focusIn(tree)?cur.key:null,keep=cur?cur.key:null;
  tree.textContent='';st.rows=[];stEl.textContent='';pvCheck(a);
  if(st.kind==='none'){setFit('');stEl.appendChild(note(T('noFile')));var kn=kindsNote();if(kn)stEl.appendChild(kn);return}
  if(ERR[K]){setFit('');stEl.appendChild(h('div',{class:'err idk-err',role:'alert',text:T('loadErr',{m:ERR[K]})}));
   stEl.appendChild(h('button',{type:'button',class:'idk-retry',text:T('retry'),onclick:function(){ERR[K]=null;load(st.kind);draw()}}));return}
  if(!a){setFit('');stEl.appendChild(note(T('loading')));if(!BUSY[K])load(st.kind);return}
  // a read-only tab: the reason, and Copy into my mod when the shell can copy it in; every Add control is off (preview, menu, drag)
  var d=IDE.active();
  if(ro()){var rb=h('div',{class:'idk-ro',role:'note'},[h('span',{text:T('ro',{why:IDE.roWhy?IDE.roWhy(d):''})})]);
   if(canRun('copyin'))rb.appendChild(h('button',{type:'button',class:'idk-cpin',text:T('copyIn'),onclick:function(){IDE.run('copyin')}}));stEl.appendChild(rb)}
  else if(bigDoc(d))stEl.appendChild(note(T('big')));
  if(PK.indexOf(st.kind)<0&&!a.own)stEl.appendChild(note(T('later')));
  // GoH: the pieces the route left out (catalog hidden: words the GoH files do not use [I]) are named in one plain line
  if(a.hidden&&a.hidden.length)stEl.appendChild(note(T('hiddenN',{n:a.hidden.length}),'idk-hid'));
  mpLab.hidden=!a.hasMp;
  if(st.fit){var n=0;a.pieces.forEach(function(p){if(st.fit[p.id]&&vis(p))n++});setFit(T('fitN',{n:n}))}else setFit('')
  if(st.q)drawSearch(a);else drawTree(a);
  // the filters left nothing to show: say so, with one step that shows every piece again
  if(!st.rows.length&&!st.q&&fltActive())stEl.appendChild(h('div',{class:'idk-note idk-fnone'},[h('span',{text:T('fNone')}),' ',
   h('button',{type:'button',class:'idk-fclr',text:T('fClear'),onclick:function(){FLT.sz='all';FLT.mp=false;szSel.value='all';mpCb.checked=false;fltSet(FLT);draw()}})]));
  var i,at=-1;for(i=0;i<st.rows.length;i++)if(st.rows[i].key===(had||keep)){at=i;break}
  st.ri=at<0?0:at;roving();if(had&&at>=0)st.rows[at].el.focus()}
 function sorted(list){if(!st.fit)return list;var f=[],o=[];list.forEach(function(p){(st.fit[p.id]?f:o).push(p)});return f.concat(o)}
 function piecesOf(a,sid){var l=a.views[sid]?a.views[sid].map(function(id){return a.byId[id]}).filter(Boolean):(a.bySec[sid]||[]);return l.filter(vis)}
 // open by default: favourites, used lately, and the "Start here" top of each kind (ia.start, mi.start, ter.start-here, ...)
 function isOpen(id){return FOLD[id]!=null?!!FOLD[id]:FOLD0.indexOf(id)>=0||/\.start(-here)?$/.test(String(id))}
 function bySort(x,y){return (x.order||0)-(y.order||0)}
 // rows are built only for what is open: a closed top is one row (its count only), a closed sub-section one row; piece rows only
 // inside open sections (a kind with 400 pieces in 60 sections draws a few dozen rows)
 function drawTree(a){
  var fv=favs().map(function(id){return a.byId[id]}).filter(function(p){return p&&vis(p)});
  var rc=recents().map(function(id){return a.byId[id]}).filter(function(p){return p&&vis(p)});
  if(fv.length)group('fav',T('g.fav'),fv,1);
  if(rc.length)group('recent',T('g.recent'),rc,1);
  (a.tops||[]).filter(secOk).forEach(function(top){
   var own=piecesOf(a,top.id),subs=(a.kids[top.id]||[]).filter(secOk),n=own.length;
   var sp=subs.map(function(s){var l=piecesOf(a,s.id);if(!s.view)n+=l.length;return l});
   if(!n)return;var open=isOpen(top.id);secRow(top.id,top.title,n,1,open);if(!open)return;
   sorted(own).forEach(function(p){pieceRow(p,2,top.id)});
   subs.forEach(function(s,i){var l=sp[i];if(!l.length)return;var o=isOpen(s.id);secRow(s.id,s.title,l.length,2,o);if(o)sorted(l).forEach(function(p){pieceRow(p,3,s.id)})})})}
 function group(id,title,list,level){var o=isOpen(id);secRow(id,title,list.length,level,o);if(o)list.forEach(function(p){pieceRow(p,level+1,id)})}
 function addRow(r){r.i=st.rows.length;st.rows.push(r);tree.appendChild(r.el);r.el.addEventListener('keydown',function(e){rowKey(e,r)});r.el.addEventListener('focus',function(){st.ri=r.i;roving();if(r.p)preview(r.p)})}
 function secRow(id,title,n,level,open){
  var el=h('div',{class:'idk-sec',role:'treeitem','aria-level':String(level),'aria-expanded':open?'true':'false',tabindex:'-1','data-sec':id},
   [h('span',{class:'idk-tw','aria-hidden':'true',text:open?'\u25be':'\u25b8'}),h('span',{class:'idk-sn',text:title}),h('span',{class:'idk-n',text:String(n)})]);
  var r={type:'sec',id:id,key:'s:'+id,el:el,level:level,open:open};addRow(r);
  el.addEventListener('click',function(){st.ri=r.i;fold(id)})}
 function pieceRow(p,level,grp){
  var fit=!st.fit||!!st.fit[p.id],tk=tagKey(p);
  var badge=tk==='t.I'||tk==='t.T'?h('span',{class:'idk-b idk-b'+p.tag,title:tagTip(p),text:p.tag}):null;
  var el=h('div',{class:'idk-row'+(fit?'':' idk-dim'),role:'treeitem','aria-level':String(level),tabindex:'-1','data-piece':p.id,title:fit?null:T('goesHere',{where:whereOf(p)})},
   [h('span',{class:'idk-grip','aria-hidden':'true',title:T('grip',{title:p.title}),text:'\u22ee'}),h('span',{class:'idk-t',text:p.title})].concat(marks(p),[badge,isFav(p.id)?h('span',{class:'idk-fav','aria-hidden':'true',text:'\u2605'}):null]));
  var r={type:'piece',id:p.id,key:grp+':'+p.id,el:el,level:level,p:p};addRow(r);
  // one click adds; the second click of a double-click adds nothing; Shift+click adds the defaults without a field session
  el.addEventListener('click',function(e){var pt=st.pt;st.pt='mouse';if(st.eat){st.eat=false;return}if(e&&e.detail>1)return;st.ri=r.i;roving();
   if(pt==='touch'){preview(p,true);return}add(p,{shift:!!(e&&e.shiftKey)})});
  el.addEventListener('mouseenter',function(){clearTimeout(st.hoverT);st.hoverT=soon(function(){preview(p)},400)});
  el.addEventListener('mouseleave',function(){clearTimeout(st.hoverT)});
  // a mouse or pen drags from anywhere on the row; a finger only from the grip (the rest of the row scrolls the tree)
  el.addEventListener('pointerdown',function(e){st.pt=(e&&e.pointerType)||'mouse';if(st.pt!=='touch'||upCls(e&&e.target,'idk-grip'))dragStart(e,p,el)});
  el.addEventListener('contextmenu',function(e){if(e&&e.preventDefault)e.preventDefault();st.ri=r.i;roving();menu(p)})}
 function drawSearch(a){var res=search(a,st.q);if(!res.length){stEl.appendChild(note(fltActive()?T('fNoneQ'):T('none'),'idk-none'));return}
  res.slice(0,200).forEach(function(x){pieceRow(x.p,1,'q')})}
 // one tab stop in the tree (roving tabindex)
 function roving(){st.rows.forEach(function(r,i){r.el.setAttribute('tabindex',i===st.ri?'0':'-1')})}
 function focusRow(i){if(!st.rows.length)return;st.ri=Math.max(0,Math.min(st.rows.length-1,i));roving();st.rows[st.ri].el.focus()}
 function fold(id,open){FOLD[id]=open==null?!isOpen(id):!!open;lsSet('ide.kit.fold',FOLD);var k='s:'+id,f=focusIn(tree);draw();
  for(var i=0;i<st.rows.length;i++)if(st.rows[i].key===k){st.ri=i;roving();if(f)st.rows[i].el.focus();break}}
 function rowKey(e,r){if(ime(e))return;var k=e.key;
  if(k==='ArrowDown')focusRow(r.i+1);else if(k==='ArrowUp')focusRow(r.i-1);else if(k==='Home')focusRow(0);else if(k==='End')focusRow(st.rows.length-1);
  else if(k==='ArrowRight'){if(r.type==='sec'){if(!r.open)fold(r.id,true);else focusRow(r.i+1)}}
  else if(k==='ArrowLeft'){if(r.type==='sec'&&r.open)fold(r.id,false);else{for(var i=r.i-1;i>=0;i--)if(st.rows[i].level<r.level){focusRow(i);break}}}
  else if(k==='Enter'){if(r.type==='sec')fold(r.id);else add(r.p,{shift:!!e.shiftKey})}
  else if(k===' '||k==='Spacebar'){if(r.type==='sec')fold(r.id);else if(!pv.hidden&&st.pv===r.p.id){pv.hidden=true;st.pv=null}else preview(r.p,true)}
  else if((k==='F10'&&e.shiftKey)||k==='ContextMenu'){if(r.p)menu(r.p)}
  else if(k==='Escape'||k==='Esc'){if(DR)return;edFocus()}
  else return;
  if(e.preventDefault)e.preventDefault();if(e.stopPropagation)e.stopPropagation()}

 // ---- search: words in the title (this language, then English), the code, the description; kind, fit, favourite and used lately add
 function score(p,w){var s=p._s,f=IDE.fuzzy||function(x,t){return t.indexOf(x)>=0?1:0};
  return Math.max(f(w,s[0])*3,f(w,s[1])*2,s[2].indexOf(w)>=0?2:0,s[3].indexOf(w)>=0?1:0)}
 // all: every piece Advanced shows (the Alt+Insert box); else the pane's filters apply too
 function search(a,qs,all){var ws=low(qs).split(/\s+/).filter(Boolean),fv=favs(),rc=recents(),out=[];
  a.pieces.forEach(function(p,i){if(!(all?canSee(p):vis(p)))return;var t=0;for(var j=0;j<ws.length;j++){var v=score(p,ws[j]);if(!v)return;t+=v}
   if((p.kinds||[]).indexOf(st.kind)>=0)t+=2;if(st.fit&&st.fit[p.id])t+=1;if(fv.indexOf(p.id)>=0)t+=0.5;if(rc.indexOf(p.id)>=0)t+=0.25;out.push({p:p,s:t,i:i})});
  out.sort(function(x,y){return (y.s-x.s)||(x.i-y.i)});return out}
 q.addEventListener('input',function(){st.q=String(q.value||'').trim();draw()});
 q.addEventListener('keydown',function(e){if(e._sk||ime(e))return;
  if(e.key==='ArrowDown'||isEnter(e)){if(st.rows.length){if(e.preventDefault)e.preventDefault();focusRow(0)}}
  else if(e.key==='Escape'||e.key==='Esc'){if(e.preventDefault)e.preventDefault();if(q.value){q.value='';st.q='';draw()}else edFocus()}});

 // ---- preview: what it does, where it goes, the code with its values, the badge, limits, buttons
 function kindsText(p){var a=ans()||{kinds:{}};return (p.kinds||[]).map(function(k){return a.kinds[k]||kindName(k)}).join(', ')}
 function isIaPiece(p){return /^ia\./.test(p.sec||'')}
 function help(){IDE.go('docs:guide/11-interaction-scripts.md')}
 function tryIt(){IDE.go('docs:guide/18-testing-and-logs.md')}
 function orig(p){if(p.key)IDE.go('key:'+p.key+':'+(p.line||1))}
 function copy(p){var t=p._code||'';try{if(typeof navigator!=='undefined'&&navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){IDE.status(T('copied'))},function(){});return}}catch(e){}
  try{var ta=h('textarea',{class:'idk-clip','aria-hidden':'true'});ta.value=t;document.body.appendChild(ta);if(ta.select)ta.select();var ok=document.execCommand&&document.execCommand('copy');ta.remove();if(ok)IDE.status(T('copied'))}catch(e){}}
 function bt(text,fn,c,title){var b=h('button',{type:'button',class:c||null,text:text,title:title||null,onclick:fn});return b}
 // the badge's tooltip: what the tag means and where in the game's own files the piece comes from
 function tagTip(p){return T(tagKey(p))+(p.src?' ('+p.src+')':'')}
 // the marks of a piece (row and preview): its approval number (#123), its size, and for mission pieces the multiplayer mark
 function marks(p){var o=[],z=p._sz;
  if(typeof p.no==='number'&&isFinite(p.no))o.push(h('span',{class:'idk-no',title:T('noT',{n:p.no}),text:'#'+p.no}));
  if(SIZES.indexOf(z)>=0)o.push(h('span',{class:'idk-sz idk-sz-'+z,title:tx('ide.kit.szT.'+z),text:tx('ide.kit.sz.'+z)}));
  if(p.mp==='yes'||p.mp==='no'||p.mp==='unknown')o.push(h('span',{class:'idk-mp idk-mp-'+p.mp,title:tx('ide.kit.mpT.'+p.mp),text:tx('ide.kit.mp.'+p.mp)}));
  return o}
 function preview(p,force){if(!p)return;st.pv=p.id;pv.textContent='';pv.hidden=false;var a=ans()||{},tk=tagKey(p),big=p._sz==='large';
  pv.appendChild(h('div',{class:'idk-pvh'},[h('b',{text:p.title})].concat(marks(p),[h('span',{class:'idk-tag idk-tag'+p.tag,title:tagTip(p),text:T(tk)})])));
  if(p.what)pv.appendChild(h('p',{class:'idk-what',text:p.what}));
  // a large piece: its line count first; its code scrolls inside the preview (idk-code-l), so the buttons below stay in reach
  if(big)pv.appendChild(h('div',{class:'idk-meta idk-lines',text:T('linesN',{n:p._ln})}));
  if(p.whole)pv.appendChild(h('div',{class:'idk-meta idk-whole',text:T('wholeN')}));
  pv.appendChild(h('div',{class:'idk-meta',text:T('goes',{where:whereOf(p)})}));
  pv.appendChild(h('div',{class:'idk-meta',text:T('for',{kind:kindsText(p)})}));
  if(p.needsText)pv.appendChild(h('div',{class:'idk-meta',text:T('needs',{what:p.needsText})}));
  if(p.watch)pv.appendChild(h('div',{class:'idk-watch',text:T('watch',{w:p.watch})}));
  var pre=h('pre',{class:big?'idk-code idk-code-l':'idk-code',tabindex:big?'0':null,'aria-label':big?T('codeL'):null});(p.parts||[]).forEach(function(x){if(typeof x==='string')pre.appendChild(document.createTextNode(x));
   else if(x&&!x.caret)pre.appendChild(h('span',{class:'idk-fv',title:x.label||x.f,text:x.def==null?'':String(x.def)}))});
  pv.appendChild(pre);
  if(p.lim&&p.lim.length)pv.appendChild(h('div',{class:'idk-lims'},p.lim.map(function(id){return bt(id,function(){IDE.go('lim:'+id)},'idk-lim',T('lim',{id:id}))})));
  var addB=bt(T('add'),function(){if(ro())return;add(p,{});if((window.innerWidth||1200)<900)IDE.kitCol(false)},'primary idk-add');
  if(ro()){addB.disabled=true;addB.setAttribute('disabled','')}
  var row=[addB,bt(isFav(p.id)?T('unstar'):T('star'),function(){star(p.id)},'idk-star'),bt(T('copy'),function(){copy(p)},'idk-copy')];
  if(p.key){var ob=bt(T('orig'),function(){orig(p)},'idk-orig',a.game?null:T('noGame'));if(!a.game){ob.disabled=true;ob.setAttribute('disabled','')}row.push(ob)}
  if(isIaPiece(p))row.push(bt(T('help'),help,'idk-help'));
  if(p.tag==='I'||p.tag==='T')row.push(bt(T('tryIt'),tryIt,'idk-try'));
  pv.appendChild(h('div',{class:'idk-btns'},row))}
 function menu(p){var a=ans()||{},it=[ro()?null:{label:T('add'),run:function(){add(p,{})}},{label:isFav(p.id)?T('unstar'):T('star'),run:function(){star(p.id)}},{label:T('copy'),run:function(){copy(p)}}].filter(Boolean);
  if(p.key&&a.game)it.push({label:T('orig'),run:function(){orig(p)}});if(isIaPiece(p))it.push({label:T('help'),run:help});
  if(IDE.pick)IDE.pick(p.title,it,{nofilter:true})}

 // ---- the field session: label, hint, words, characters that cannot go in, a test per field kind
 var PRINT='',i0;for(i0=32;i0<127;i0++)PRINT+=String.fromCharCode(i0);
 function allBut(ok){var s='',c,i;for(i=0;i<PRINT.length;i++){c=PRINT.charAt(i);if(ok.indexOf(c)<0)s+=c}return s+'\n\t'}
 var NUMD=allBut('0123456789.'),SNUM=allBut('0123456789.-'),NAME='{}();" \t\n',PATH='{}();"\n\t';
 var DENY={chance:NUMD,seconds:NUMD,number:SNUM,units:SNUM,flag:NAME,event:NAME,view:NAME,anim:NAME,sound:NAME,tag:NAME,place:NAME,terrain:NAME,able:NAME,macro:NAME,input:NAME,
  tags:PATH,'sound-file':PATH,entity:PATH,effect:PATH,bone:PATH,path:PATH,text:'"\n',comment:'\n'};
 function num(v){v=String(v==null?'':v).trim();return /^-?(\d+\.?\d*|\.\d+)$/.test(v)?parseFloat(v):NaN}
 function numTest(min,max,int){return function(v){var n=num(v);
  if(isNaN(n)||(min!=null&&n<min)||(max!=null&&n>max))return max!=null?T('f.bad.num',{min:min!=null?min:0,max:max}):min!=null?T('f.bad.min',{min:min}):T('f.bad.nan');
  if(int&&Math.floor(n)!==n)return T('f.bad.int');return ''}}
 function testOf(x){var k=x.k;
  if(k==='chance')return function(v){var n=num(v);return isNaN(n)||n<=0||n>1?T('f.bad.chance'):''};
  if(k==='seconds')return numTest(x.min!=null?x.min:0,x.max,false);
  if(k==='number'||k==='units')return numTest(x.min,x.max,!!x.int);
  if(k==='choice'&&x.choices&&x.choices.length)return function(v){return x.choices.indexOf(String(v).trim())<0?T('f.bad.choice',{list:x.choices.join(', ')}):''};
  if(k==='comment')return function(v){return /[^\x20-\x7e\t]/.test(String(v))?tx('ide.kit.w.ascii'):''};
  return null}
 function wordsOf(x,a){var w=(a&&a.words)||{};if(x.k==='choice'&&x.choices)return x.choices.slice();if(x.k==='place')return w.places||null;
  if(x.k==='terrain')return w.terrains||null;if(x.k==='able')return w.ables||null;return null}
 function partOf(p,name){var ps=p.parts||[];for(var i=0;i<ps.length;i++)if(ps[i]&&typeof ps[i]==='object'&&ps[i].f===name)return ps[i];return {}}
 function fieldsOf(p,rf,a){return (rf||[]).map(function(f){var x=partOf(p,f.name),o={name:f.name,k:f.k,line:f.line,col:f.col,len:f.len,label:x.label||f.name};
  if(x.hint)o.hint=x.hint;var w=wordsOf(x,a);if(w&&w.length)o.words=w;if(DENY[f.k])o.deny=DENY[f.k];var t=testOf(x);if(t)o.test=t;return o})}

 // ---- refusals: the planner's reason in words, and the next step
 function msgOf(r,d){var k=r.refuse.k,pp=r.refuse.p||{},a=ans()||{kinds:{}},kt=function(x){return a.kinds[x]||kindName(x)};
  if(k==='ide.kit.x.ro')return tx(k,{why:IDE.roWhy&&d?IDE.roWhy(d):''});
  if(k==='ide.kit.x.kind')return tx(k,{kind:kt(pp.kind),kind2:kt(pp.kind2)});
  if(k==='ide.kit.x.scope'){var w=whereTx(pp.where||'top');return r.refuse.near?tx(k,{where:w,n:r.refuse.near}):T('goesHere',{where:w})}
  if(k==='ide.kit.x.dup')return tx(k,{ev:pp.ev});
  if(k==='ide.kit.x.unknown')return tx(k,{name:pp.name,ev:pp.ev});
  return tx(k,pp)}
 function goLine(d,n){var ref=d.ref||{},key=d.key||ref.key;
  if(ref.rel)return IDE.go('ide:'+ref.rel+':'+n);if(key)return IDE.go('key:'+key+':'+n);
  var ed=edFor(d);if(ed){ed.goto(n,1);ed.focus()}}
 function refuse(r,d,p,o){var k=r.refuse.k,nx=[],v=d.ver;IDE.status(msgOf(r,d));
  // "Add it at line N instead" is tied to the text it was planned on: once the piece went in (a second click, a double-click) or
  // the text changed, it adds nothing and says the file changed
  function same(){var ed=edFor(d);if(ed&&ed.flush)try{ed.flush()}catch(e){}if(IDE.active()===d&&d.ver===v)return true;IDE.status(T('x.stale'));return false}
  if(k==='ide.kit.x.ro'&&canRun('copyin'))nx.push({label:'ide.kit.copyIn',run:function(){IDE.run('copyin')}});
  if(k==='ide.kit.x.scope'&&r.refuse.near)nx.push({label:'ide.kit.nearN',p:{n:r.refuse.near},run:function(){if(same())add(p,{gap:r.refuse.near,shift:o.shift,values:o.values})}});
  if(k==='ide.kit.x.dup'&&r.refuse.goto)nx.push({label:'ide.kit.x.goThere',run:function(){goLine(d,r.refuse.goto)}});
  if(k==='ide.kit.x.unknown'&&r.refuse.goto)nx.push({label:'ide.kit.x.goLine',p:{n:r.refuse.goto},run:function(){goLine(d,r.refuse.goto)}});
  if(nx.length&&IDE.next){IDE.next(nx);RJ=d}}

 // ---- insert: plan on the editor's lines, stale guard, one applyEdits (one undo step), field session, after-insert check
 function cursorGap(ed){var c=ed.cursor?ed.cursor():{line:1,col:1},ln=(c&&c.line)||1,t=ed.line(ln);
  if(t==null||/^\s*$/.test(t)||((c&&c.col)||1)<=1)return ln;return ln+1}
 function sigOf(f){return [f.code||f.id||'',f.msg||f.message||'',f.sev||''].join('|')}
 function sigs(d){var o={};(d.findings||[]).forEach(function(f){var s=sigOf(f);o[s]=(o[s]||0)+1});return o}
 function add(p,o){o=o||{};var d=IDE.active(),k=kindOfDoc(d),a=ansOf(k)||ans();if(!p)return false;
  // a piece the pane does not list now (Advanced is off) is not added from anywhere: a picker, a menu, a drag, a held button
  if(!canSee(p)){IDE.status(T('notAdded'));return false}
  if(!d||d.view||k==='none'){IDE.status(T('x.view'));return false}
  var ed=edFor(d);if(!ed||!a){IDE.status(T('x.view'));return false}
  var at={gap:o.gap||cursorGap(ed)},tries=0,r,ver,src=srcOf(ed);kp().use(a.words);
  for(;;){ver=d.ver;
   r=kp().plan(src,at,p,o.values||{},popts(d,src,{ver:ver,cover:!!(IDE.ovOpen&&IDE.ovOpen())}));
   if(IDE.active()!==d||edFor(d)!==ed){IDE.status(T('x.stale'));return false}
   if(d.ver===ver)break;
   if(++tries>2){IDE.status(T('x.stale'));return false}}
  if(r.refuse){refuse(r,d,p,o);return false}
  // the running field session and the last insert's check end first: a session still on could refuse this edit (its field's
  // characters) or end inside applyEdits and report the old piece's check partway through this insert
  endSess('lost');if(CHK){if(CHK.a)CHK.a.clear();if(CHK.z)CHK.z.clear();CHK=null}
  var before=sigs(d),t0=String(IDE.textOf?IDE.textOf(d)||'':''),okA;try{okA=ed.applyEdits(r.edits)}catch(e){okA=false}
  var t1=String(IDE.textOf?IDE.textOf(d)||'':'');
  // an editor that took the call but changed nothing (a refused change) has not added the piece
  if(okA===false||(IDE.textOf&&t1===t0)){IDE.status(T('notAdded'));return false}
  var nv=(r.ver==null?(d.ver||0):r.ver)+1;
  // the refusal's steps on this doc are done with ("Add it at line N instead" must not add it a second time)
  if(RJ===d&&IDE.next)IDE.next([]);RJ=null;
  IDE.emit('kit',{doc:d,piece:p.id,ver:nv});used(p.id);
  var bA=ed.bookmark?ed.bookmark(r.from,1):null,bZ=ed.bookmark?ed.bookmark(r.to,1):null;
  var msg=[T('added')];(r.warn||[]).forEach(function(w){msg.push(warnText(w))});
  var big=t1.length>BIG;
  if(big){msg.push(T('big'));if(bA)bA.clear();if(bZ)bZ.clear();CHK=null}else CHK={doc:d,ver:nv,before:before,t0:t0,a:bA,z:bZ,lint:null,lver:null};
  var fs=o.shift?[]:fieldsOf(p,r.fields,a),sh=null;
  if(fs.length&&ed.fieldSession){var tok={};
   sh=ed.fieldSession(fs,r.caret,{next:T('f.next'),done:T('f.done'),denied:T('f.deny'),onEnd:function(why){if(SESS&&SESS.tok===tok){var s=SESS;SESS=null;sessDone(s,why)}}});
   // msg = what the status says when the session is over (the same words without the keys of the session)
   if(sh){SESS={tok:tok,doc:d,h:sh,p:p,k:k,a:a,warn:r.warn||[],msg:msg.slice(),t1:t1,ba:ed.bookmark?ed.bookmark(r.from,1):null,bz:ed.bookmark?ed.bookmark(r.to,1):null};msg.push(T('f.session'))}}
  if(!sh&&ed.goto){var c=r.caret||(r.fields[0]?{line:r.fields[0].line,col:r.fields[0].col}:{line:r.from,col:1});ed.goto(c.line,c.col)}
  edFocus();IDE.status(msg.join(' '));draw();rankSoon();return true}
 function sessMarks(s){if(s.ba)s.ba.clear();if(s.bz)s.bz.clear()}
 // ended from here (doc closed, mod changed, a new insert): the status loses the session's keys (a new insert says its own)
 function endSess(why){if(!SESS)return;var s=SESS;SESS=null;sessMarks(s);try{s.h.end(why)}catch(e){}if(why!=='lost')IDE.status('')}
 // the session is over: the warnings that depend on the values typed (a side, a name) are checked again; the status loses the
 // session's keys (the piece is still there: the added line and those warnings; else nothing); the after-insert check runs on a
 // timer, after the editor has sent the last typed change, so it waits for the lint of the final text
 // A text changed since the insert (a value typed, an edit elsewhere) makes the last undo step the typing, not the piece: the
 // status then drops "Piece added. Ctrl+Z takes it out." and keeps only the warnings
 function sessDone(s,why){var keep=KEEP.indexOf(why)>=0,w=[],m=s.msg||[];try{w=keep?reWarn(s):[]}catch(e){w=[]}sessMarks(s);
  if(keep&&s.t1!=null&&IDE.textOf){var now=null;try{now=String(IDE.textOf(s.doc)||'')}catch(e){}if(now!==s.t1)m=m.slice(1)}
  if(CHK&&CHK.doc===s.doc)CHK.w=w;IDE.status(keep?m.concat(w).join(' '):'');soon(checkSoon,0)}
 // each {on "name"} of a piece, in order: the default of the fill-in there, or null for a name the piece writes itself
 function qDefs(p){var ps=p.parts||[],out=[],i,j,n,t,re,fld;
  for(i=0;i<ps.length;i++){t=ps[i];if(typeof t!=='string')continue;re=/\{on[ \t]+"/g;n=0;while(re.exec(t))n++;
   fld=n>0&&/\{on[ \t]+"$/.test(t)&&!!ps[i+1]&&typeof ps[i+1]==='object'&&!!ps[i+1].f&&typeof ps[i+2]==='string'&&ps[i+2].charAt(0)==='"';
   for(j=0;j<n;j++)out.push(fld&&j===n-1?String(ps[i+1].def==null?'':ps[i+1].def):null)}
  return out}
 // the piece's lines as they are now, as a piece: an {on "name"} that was a fill-in is one again (its default, the typed name as
 // its value), so the planner sees what was typed (a game event word put in quotes)
 function asPiece(s,text){var qd=qDefs(s.p),parts=[],vals={},re=/\{on[ \t]+"/g,m,last=0,j=0,at,z;
  while((m=re.exec(text))){at=m.index+m[0].length;z=text.indexOf('"',at);if(z<0)break;
   if(qd[j]!=null){parts.push(text.slice(last,at));parts.push({f:'q'+j,k:'event',def:qd[j]});vals['q'+j]=text.slice(at,z);last=z}
   j++;re.lastIndex=z+1}
  parts.push(text.slice(last));
  return {p:{id:s.p.id,kinds:s.p.kinds,scope:s.p.scope,events:s.p.events,parts:parts},v:vals}}
 // plan the piece's lines as they are now at the place they sit, in the file without them; only the value warnings (and a
 // reaction that is now doubled) that the insert did not already show
 function reWarn(s){var d=s.doc,ed=edFor(d);if(!ed||IDE.active()!==d)return [];
  var pa=s.ba&&s.ba.pos(),pz=s.bz&&s.bz.pos();if(!pa||!pz||pz.line<pa.line)return [];
  if(ed.flush)try{ed.flush()}catch(e){}
  var A0=pa.line,n=pz.line-pa.line+1,cnt=ed.lineCount()|0,lines=[],i;if(pz.line>cnt)return [];
  for(i=A0;i<=pz.line;i++)lines.push(ed.line(i));
  var src={count:cnt-n,line:function(x){return x<A0?ed.line(x):ed.line(x+n)}};
  var fk=asPiece(s,lines.join('\n'));
  kp().use(s.a.words);var r=kp().plan(src,{gap:A0},fk.p,fk.v,{kitKind:s.k,rel:relOf(d),editable:true,ver:d.ver,cache:{}});
  if(r.refuse)return r.refuse.k==='ide.kit.x.dup'?[msgOf(r,d)]:[];
  var had={};s.warn.forEach(function(w){had[w.k+'|'+JSON.stringify(w.p||{})]=1});
  return r.warn.filter(function(w){return VALW.indexOf(w.k)>=0&&!had[w.k+'|'+JSON.stringify(w.p||{})]}).map(warnText)}
 // the after-insert check, once the lint of the final text is in (the editor sends a waiting change first, so the doc version is
 // the final one); returns the message it put in the status ('' when none)
 // while another tab is open the check waits (CHK kept): its count and flash are about this doc, so they run when it is back
 function checkSoon(){var c=CHK;if(!c||!c.lint||SESS||IDE.active()!==c.doc)return '';var e0=edFor(c.doc);if(e0&&e0.flush)try{e0.flush()}catch(e){}
  if(CHK!==c||(c.lver!=null&&c.doc.ver!=null&&c.lver<c.doc.ver))return '';CHK=null;
  // the text is back to what it was before the insert (Ctrl+Z): nothing to report for a piece that was taken out
  if(c.t0!=null&&IDE.textOf&&String(IDE.textOf(c.doc)||'')===c.t0){if(c.a)c.a.clear();if(c.z)c.z.clear();return ''}
  var left={},k,n=0,m='';for(k in c.before)left[k]=c.before[k];
  c.lint.forEach(function(f){var s=sigOf(f);if(left[s])left[s]--;else n++});
  var pa=c.a&&c.a.pos(),pz=c.z&&c.z.pos(),ed=edFor(c.doc);
  if(n){m=T('probs',{n:n});IDE.status(m+(c.w&&c.w.length?' '+c.w.join(' '):''));if(pa&&ed&&ed.flash)ed.flash(pa.line,pz?pz.line:pa.line)}
  else soon(function(){if(IDE.active()!==c.doc)return;var it=[];if(IDE.actions&&IDE.actions.save)it.push({label:'ide.a.save',run:function(){IDE.run('save')}});
   if(/^ia-/.test(kindOfDoc(c.doc)))it.push({label:'ide.kit.tryIt',run:tryIt});if(it.length&&IDE.next)IDE.next(it)},0);
  if(c.a)c.a.clear();if(c.z)c.z.clear();return m}

 // ---- pointer drag: a ghost, the gap marker (ok or no) with words, auto-scroll near the text's edges; Esc or a drop elsewhere adds nothing
 function inEd(t){return upCls(t,'ide-ed')}
 function setGL(t){if(!GH)return;var s=GH.querySelector('span.idk-gl');if(s)s.textContent=t||''}
 function marker(g,state){var ed=IDE.ed&&IDE.ed();if(ed&&ed.gapMarker)try{ed.gapMarker(g,state)}catch(e){}}
 function endGhost(){if(GH){GH.remove();GH=null}cls(host,'idk-dragging',false);marker(null)}
 function dragStart(e,p,el){if(!e||(e.button!=null&&e.button>0))return;if(arrangeOn()||ro())return;
  DR={p:p,el:el,x0:e.clientX||0,y0:e.clientY||0,x:e.clientX||0,y:e.clientY||0,on:false,gap:null,ok:false,r:null,cover:false,dk:null,pid:e.pointerId!=null?e.pointerId:null};
  // a window that loses focus mid-drag (Alt+Tab, a system box) may never send the release: the drag ends there, nothing added
  if(!BL&&typeof window.addEventListener==='function'){BL=true;try{window.addEventListener('blur',function(){if(DR){dragCancel();DR=null}})}catch(x){}}
  try{if(el.setPointerCapture&&e.pointerId!=null)el.setPointerCapture(e.pointerId)}catch(x){}}
 function dry(D,d,ed,a,g){var src=srcOf(ed),key=g+'|'+d.ver+'|'+d.id;if(D.dk===key)return D.dr;kp().use(a.words);
  D.dr=kp().plan(src,{gap:g},D.p,{},popts(d,src,{ver:d.ver,cover:false}));D.dk=key;return D.dr}
 // the label names the place at the gap where this drop lands (inside a timer, a check...), not the piece's usual place
 function whereAt(d,ed,g,p){try{var s=kp().scopeAt(srcOf(ed),g,cacheOf(d)),k=effKind(s);if(SCOPES.indexOf(k)>=0)return tx('ide.kit.w.'+k)}catch(e){}return whereOf(p)}
 function frame(){FT=null;var D=DR;if(!D||!D.on)return;var d=IDE.active(),ed=edFor(d);D.gap=null;D.ok=false;D.r=null;D.cover=false;
  if(!ed){marker(null);setGL(T('x.view'));return}
  if(IDE.ovOpen&&IDE.ovOpen()){D.cover=true;var cp=ed.posAt?ed.posAt(D.x,D.y):null;marker(cp&&cp.gap?cp.gap:null,'no');setGL(T('d.no',{why:T('x.cover')}));return}
  if(typeof document.elementFromPoint==='function'){var t=null;try{t=document.elementFromPoint(D.x,D.y)}catch(e){}if(t&&!inEd(t)){marker(null);setGL('');return}}
  var rc=ed.rect?ed.rect():null;
  if(rc&&ed.autoScroll){var dy=D.y<rc.top+32?-(rc.top+32-D.y):D.y>rc.bottom-32?D.y-(rc.bottom-32):0;
   if(dy&&ed.autoScroll(Math.max(-40,Math.min(40,dy)))&&!FT)FT=soon(frame,50)}
  var pos=ed.posAt?ed.posAt(D.x,D.y):null,a=ansOf(kindOfDoc(d));if(!pos||!pos.gap||!a){marker(null);setGL('');return}
  var r=dry(D,d,ed,a,pos.gap);D.gap=pos.gap;D.r=r;D.ok=!r.refuse;marker(pos.gap,D.ok?'ok':'no');
  setGL(D.ok?T('d.ok',{line:r.from||pos.gap,where:whereAt(d,ed,r.from||pos.gap,D.p)}):T('d.no',{why:msgOf(r,d)}))}
 // events of another pointer (a mouse moved during a touch or pen drag) do not move, end or drop this drag
 function other(D,e){return D.pid!=null&&!!e&&e.pointerId!=null&&e.pointerId!==D.pid}
 document.addEventListener('pointermove',function(e){var D=DR;if(!D||D.dead||other(D,e))return;
  // a move with no button held: the release was lost (focus went elsewhere); the drag ends, nothing added
  if(e&&e.buttons===0){if(D.on)dragCancel();DR=null;return}
  var x=e.clientX||0,y=e.clientY||0;D.x=x;D.y=y;
  if(!D.on){if(Math.abs(x-D.x0)+Math.abs(y-D.y0)<6)return;if(arrangeOn()){DR=null;return}D.on=true;
   GH=h('div',{class:'idk-ghost','aria-hidden':'true'},[h('b',{text:D.p.title}),h('span',{class:'idk-gl'})]);document.body.appendChild(GH);cls(host,'idk-dragging',true)}
  if(GH&&GH.style){GH.style.left=(x+14)+'px';GH.style.top=(y+10)+'px'}
  if(!FT)FT=soon(frame,16)});
 document.addEventListener('pointerup',function(e){var D=DR;if(!D||other(D,e))return;if(D.dead){DR=null;st.eat=true;soon(function(){st.eat=false},0);return}if(!D.on){DR=null;return}
  if(e&&e.clientX!=null){D.x=e.clientX;D.y=e.clientY}if(FT){clearTimeout(FT);FT=null}frame();DR=null;if(FT){clearTimeout(FT);FT=null}endGhost();
  st.eat=true;soon(function(){st.eat=false},0);
  var d=IDE.active();
  if(D.cover){IDE.status(T('x.cover'));return}
  if(D.gap&&D.ok){add(D.p,{gap:D.gap});return}
  if(D.gap&&D.r&&D.r.refuse&&d){refuse(D.r,d,D.p,{});return}
  IDE.status(T('notAdded'))});
 // Esc: the drag is over, but the button is still down: the release and its click are eaten (dead drag)
 function dragCancel(){if(!DR||DR.dead)return;var on=DR.on;DR=on?{dead:true,pid:DR.pid}:null;if(FT){clearTimeout(FT);FT=null}endGhost();if(on)IDE.status(T('notAdded'))}
 document.addEventListener('pointercancel',function(e){if(DR&&other(DR,e))return;dragCancel();DR=null});
 document.addEventListener('keydown',function(e){if(DR&&DR.on&&!DR.dead&&(e.key==='Escape'||e.key==='Esc')){dragCancel();if(e.preventDefault)e.preventDefault()}},true);

 // ---- Alt+K, Alt+Insert, first visit
 function hiddenNote(){IDE.status(T('hidden'));if(IDE.next)IDE.next([{label:'ide.kit.arrange',run:function(){try{if(window.as2Blocks&&window.as2Blocks.arrange)window.as2Blocks.arrange(true)}catch(e){}}}])}
 // the search box gets the focus without the kit's history list opening over the tree (a click or the History button opens it)
 function qFocus(){if(qKit)qKit.focus();else q.focus()}
 function kitShow(){if(!IDE.kitCol()){IDE.kitCol(true);if(upCls(host,'blkoff')){hiddenNote();return}sync();soon(function(){qFocus()},0);qFocus();return}
  if(upCls(host,'blkoff')){hiddenNote();return}
  if(focusIn(host)){IDE.kitCol(false);edFocus();return}
  sync();qFocus()}
 function pickAdd(){var d=IDE.active(),k=kindOfDoc(d);if(!d||k==='none'){IDE.status(T('x.view'));return}
  var a=ansOf(k);if(!a){IDE.status(T('loading'));load(k,function(x,err){if(x)pickAdd();else IDE.status(T('loadErr',{m:err}))});return}
  var fit=fitMap(a,scopeHere(d,a)),list=a.pieces.filter(canSee).map(function(p,i){return {p:p,i:i,f:fit&&fit[p.id]?1:0}});
  list.sort(function(x,y){return (y.f-x.f)||(x.i-y.i)});
  var items=list.map(function(x){var s=a.sec[x.p.sec];return {label:x.p.title,hint:x.f?(s?s.title:''):T('goesHere',{where:whereOf(x.p)}),id:x.p.id,run:function(){add(x.p,{})}}}),byId={};
  items.forEach(function(it){byId[it.id]=it});
  var was=st.kind;st.kind=k;
  // the pick box's searchKit: history 'ide.pieces.add'; the pieces have no file: Browse is the kit's default file picker
  IDE.pick(T('a.add'),items,{key:'ide.pieces.add',filter:function(qq){if(!qq)return items;var sk=st.kind;st.kind=k;var r=search(a,qq,true);st.kind=sk;return r.map(function(x){return byId[x.p.id]}).filter(Boolean)}});
  st.kind=was}
 function firstVisit(){if(lsGet('ide.kit.open',null)!==null)return;var d=IDE.active();if(!d||d.view||d.editable===false)return;
  if((window.innerWidth||0)<1100)return;if(withPieces().indexOf(kindOfDoc(d))<0)return;IDE.kitCol(true)}
 IDE.action('kitShow',{label:'ide.kit.a.show',tip:'ide.kit.a.showT',key:'Alt+K',group:'other',run:kitShow});
 IDE.action('kitAdd',{label:'ide.kit.a.add',tip:'ide.kit.a.addT',key:'Alt+Insert',group:'other',bar:false,run:function(){pickAdd()},when:function(){var d=IDE.active();return !!d&&!d.view}});

 // ---- shell events
 IDE.on('active',function(){firstVisit();if(shown())sync();if(CHK&&CHK.lint&&IDE.active()===CHK.doc)soon(checkSoon,0)});
 IDE.on('cursor',function(){if(shown())rankSoon()});
 IDE.on('changed',function(){if(shown())rankSoon()});
 IDE.on('lint',function(e){var c=CHK;if(!c||!e||e.doc!==c.doc)return;if(e.ver!=null&&c.ver!=null&&e.ver<c.ver)return;c.lint=e.findings||[];c.lver=e.ver!=null?e.ver:null;checkSoon()});
 IDE.on('closed',function(e){var d=e&&e.doc;if(!d)return;delete CACHE[d.id];delete NM[d.id];if(SESS&&SESS.doc===d)endSess('closed');
  if(CHK&&CHK.doc===d)CHK=null;if(shown())sync()});
 IDE.on('mod',function(){endSess('mod');CHK=null;CACHE={};NM={}});

 return {
  refresh:function(){if(shown())sync()},
  focus:function(){qFocus()},
  toggle:function(open){var o=IDE.kitCol(open==null?!IDE.kitCol():!!open);if(o)sync();return o},
  add:function(id){if(id==null)return pickAdd();var a=ansOf(kindOfDoc(IDE.active())),p=a&&a.byId[id];return p?add(p,{}):false},
  // for the page cases: the pane's state (read only)
  state:function(){return {kind:st.kind,scope:st.scope,fit:st.fit,rows:st.rows.length,session:!!SESS,check:!!CHK,drag:!!DR,flt:{sz:FLT.sz,mp:FLT.mp}}}
 };
};
`;

const css = [
  '.idk{font-size:13px}',
  '.idk-head{display:flex;align-items:center;gap:6px;padding:6px 8px 2px}',
  '.idk-title{flex:1 1 auto}',
  '.idk-for,.idk-note{padding:2px 8px;color:var(--ih)}',
  '.idk-for[hidden],.idk-card[hidden],.idk-pv[hidden],.idk-q1[hidden]{display:none}',
  '.idk-for{display:flex;align-items:center;gap:6px}',
  '.idk-q1{padding:0 6px;min-width:0;line-height:1.3}',
  '.idk-fitn:empty{display:none}',
  '.idk-ro{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:2px 8px;padding:4px 6px;border:1px solid var(--iw);border-radius:4px}',
  '.idk-sec,.idk-row,.idk-pv{user-select:none;-webkit-user-select:none}',
  '.idk-q{margin:4px 8px;box-sizing:border-box;width:calc(100% - 16px);min-width:0}',
  '.idk>.sk{display:flex;margin:4px 8px;width:calc(100% - 16px);box-sizing:border-box}','.idk>.sk>.idk-q{margin:0;width:auto;flex:1 1 auto}',
  '.idk-card{margin:4px 8px;padding:6px 8px;border:1px solid var(--il);border-radius:4px;background:var(--ib)}',
  '.idk-card p{margin:0 0 6px}',
  '.idk-st{padding:2px 0}',
  '.idk-err{padding:2px 8px;color:var(--ie)}',
  '.idk-retry{margin:2px 8px}',
  '.idk-fitn{color:var(--ik)}',
  '.idk-tree{flex:1 1 auto;min-height:80px;overflow:auto;padding:2px 0}',
  '.idk-sec,.idk-row{display:flex;align-items:center;gap:4px;padding:2px 8px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:22px}',
  '.idk-sec{font-weight:600}',
  '.idk-sec[aria-level="2"]{padding-left:20px}',
  '.idk-row[aria-level="2"]{padding-left:20px}',
  '.idk-row[aria-level="3"]{padding-left:34px}',
  '.idk-sec:hover,.idk-row:hover{background:var(--ib)}',
  '.idk-sec:focus,.idk-row:focus{outline:1px solid var(--ia);outline-offset:-1px}',
  '.idk-tw{width:1em;color:var(--ih)}',
  '.idk-sn,.idk-t{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis}',
  '.idk-n{color:var(--ih);font-weight:400}',
  '.idk-grip{cursor:grab;color:var(--ih);touch-action:none;padding:0 2px}',
  '.idk-dim{opacity:.55}',
  '.idk-b{font-size:11px;padding:0 4px;border-radius:3px;border:1px solid var(--il)}',
  '.idk-bI,.idk-tagI{color:var(--iw);border-color:var(--iw)}',
  '.idk-bT,.idk-tagT{color:var(--ie);border-color:var(--ie)}',
  '.idk-fav{color:var(--iw)}',
  '.idk-flt{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 8px 4px}',
  '.idk-fsz{min-width:0;max-width:100%}',
  '.idk-fmp{display:flex;align-items:center;gap:4px;color:var(--ih);cursor:pointer}',
  '.idk-fmp[hidden]{display:none}',
  '.idk-fclr{margin-left:4px}',
  '.idk-no{flex:0 0 auto;font-size:11px;color:var(--ih)}',
  '.idk-sz,.idk-mp{flex:0 0 auto;font-size:11px;padding:0 4px;border-radius:3px;border:1px solid var(--il);color:var(--ih)}',
  '.idk-sz-large{color:var(--it);border-color:var(--ih)}',
  '.idk-mp-yes{color:var(--ik);border-color:var(--ik)}',
  '.idk-mp-no{color:var(--ie);border-color:var(--ie)}',
  '.idk-mp-unknown{color:var(--iw);border-color:var(--iw)}',
  '.idk-code-l{max-height:16em;overflow:auto}',
  '.idk-pv{flex:0 0 auto;max-height:45%;overflow:auto;border-top:1px solid var(--il);padding:6px 8px}',
  '.idk-pvh{display:flex;flex-wrap:wrap;gap:6px;align-items:baseline}',
  '.idk-tag{font-size:11px;padding:0 4px;border-radius:3px;border:1px solid var(--il);color:var(--ih)}',
  '.idk-what{margin:4px 0}',
  '.idk-meta{color:var(--ih)}',
  '.idk-watch{color:var(--iw);margin:4px 0}',
  '.idk-code{margin:6px 0;padding:6px;background:var(--ib);border:1px solid var(--il);border-radius:3px;overflow:auto;font:12px/1.35 Consolas,monospace;white-space:pre}',
  '.idk-fv{text-decoration:underline dotted;text-underline-offset:2px}',
  '.idk-lims,.idk-btns{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}',
  '.idk-ghost{position:fixed;z-index:50;pointer-events:none;max-width:280px;padding:4px 8px;border:1px solid var(--ia);border-radius:4px;background:var(--ip);color:var(--it);box-shadow:0 4px 12px rgba(0,0,0,.3)}',
  '.idk-ghost b{display:block}',
  '.idk-gl{display:block;color:var(--ih)}',
  '.idk-dragging{cursor:grabbing;user-select:none}',
  '.idk-clip{position:fixed;left:-9999px;top:0}'
].join('\n');

module.exports = {
  script: PLAN && KINDS ? '(function(){\n' + PLAN + '\n' + KINDS + '\n' + BODY + '\n})();' : '',
  css
};
