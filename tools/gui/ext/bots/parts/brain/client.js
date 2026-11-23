// browser side of the brain part: three cards for every computer-controlled soldier (the page says once, at the top, that this means
// single-player enemies too): Courage and movement, Seeing and remembering (editable), Guns (where the aiming keys sit, read only).
// Page rules (bots/script.js): no backtick, no dollar-brace, DOM only through h() and textContent.
// Page standards S1-S9): each setting is its own block bots.brain.<card>.k.<id> (the symptom picker jumps
// to it): plain name and one-line effect first, the game's value and the mod's, a slider and a number box with the range, what raising it
// does; key, file and line, engine reader and "not yet tried in the game" sit in its folded Details. The few settings most people need
// show first, the rest under More options. Preview = plain sentences, the exact file change folded; Write asks with the same count; after
// a write one green box (what changes in a fight, how to see it, next steps, Undo = the exact bytes from before). Buttons: Preview, Write
// into my mod, Undo, Reset to the game's values (shared frame keys bots.btn.* when the frame has them, else this part's own words).
// Frame helpers kit.details/more/done/na and BOTS_UI.changed are used when present at draw time, with a local fallback.
// BCAT (prepended below) = the catalog rows the page needs: sight range first (sight.js), then properties/human.ext (catalog items).
// Author: Imperator_Aug (ARSENAL, ia-02994b59)
const CAT = require('./catalog.json');
const slim = it => ({ id: it.id, card: it.card, kind: it.kind, min: it.min, max: it.max, step: it.step, unit: it.unit || '', def: it.def, more: !!it.more, key: it.key, keyX: !!it.keyX,
  file: it.preset !== undefined ? (it.kind === 'mult' ? 'set/vision/vision.set' : 'set/vision/vision_generic.inc') : 'properties/human.ext',
  as2: it.as2 ? { tag: it.as2.tag, reader: it.as2.reader } : null, goh: it.goh ? { tag: it.goh.tag, reader: it.goh.reader } : null });
const BCAT = { items: CAT.sight.map(slim).concat(CAT.items.map(slim)), guns: CAT.guns.map(g => ({ id: g.id, key: g.key, reader: g.reader, tag: g.tag })) };
module.exports = 'var BCAT=' + JSON.stringify(BCAT) + ';\n' + String.raw`
BOTS_PARTS.push({id:'brain',group:'D',order:10,title:function(){return tx('bots.brain.title')},
 draw:function(env){var k=env.kit,P='bots.brain.',goh=env.gid==='goh',side=goh?'goh':'as2';
  function t(s,p){return tx(P+s,p)}
  function has(key){var s=tx(key);return s!=null&&s!==key}
  function L(shared,mine){return has(shared)?tx(shared):t(mine)}
  // the game by its one name (kit.game), so every sentence names the game the same way
  function G(){if(typeof k.game==='function'){try{var s=k.game(env.gid);if(s)return String(s)}catch(e){}}return goh?'Gates of Hell':env.gid==='mowas2'?'Men of War: Assault Squad 2':'AS64'}
  // no mod picked / no game folder: the frame's one line (kit.needMod, kit.needGame) as a plain element, else this part's words
  function needModEl(){if(typeof k.needMod==='function'){try{var n=k.needMod(null);if(n)return n}catch(e){}}
   return h('div',{class:'err','data-needmod':'1',text:L('bots.needmod','needMod')})}
  function needGameEl(){if(typeof k.needGame==='function'){try{var n=k.needGame(null);if(n)return n}catch(e){}}
   return h('div',{class:'err','data-needgame':'1',text:t('needGame')})}
  function noGameErr(x){return !!(x&&x.params&&x.params.noGame===true&&/^bots\.brain\.e\.(noFile|noGame)$/.test(String(x.key||'')))}   // the server says the game folder is not set
  // the one "Undone: <what>." sentence (kit.undone)
  function undoneText(){if(typeof k.undone==='function'){try{var s=k.undone(t('undone.w'));if(s)return typeof s==='string'?s:String(s.textContent||'')}catch(e){}}return t('undone')}
  // plural forms (S14): key.one / .few / .many / .other, picked by the window language (bots.brain.lc)
  function pf(n){var c=t('lc');n=Math.abs(Math.round(+n||0));if(c==='ru'||c==='uk'){var a=n%10,b=n%100;return a===1&&b!==11?'one':a>=2&&a<=4&&(b<12||b>14)?'few':'many'}return c==='zh'?'other':n===1?'one':'other'}
  function pl(key,n,p){var q={};if(p)for(var i in p)q[i]=p[i];q.n=n;return t(key+'.'+pf(n),q)}
  // a server refusal in words (S12): the setting named by its label on the page, with the allowed range; else the frame's wording
  function errMsg(e,x){if(x&&x.key&&/^bots.brain.e./.test(x.key)&&has(x.key)){var p={},q=x.params||{};for(var i in q)p[i]=q[i];
    if(p.id!=null)p.name=nameOf(p.id);p.game=G();var it=p.id!=null?ITEMS[p.id]:null;p.u=it&&it.unit?' '+U(it.unit):'';return tx(x.key,p)}
   return x&&typeof x==='object'&&typeof k.emsg==='function'?k.emsg(x):String(e||(x&&x.message)||'')}
  function isBlk(n){return !!(n&&n.getAttribute&&n.getAttribute('data-blk'))}
  function isBox(n){return isBlk(n)&&!!n.classList&&n.classList.contains('blc')}
  function asBlk(id,n){return isBlk(n)?n:k.leaf(id,[n])}
  function goTo(id){if(typeof id==='function'){id();return}if(id==='log'){if(typeof window!=='undefined'&&window.as2Link)window.as2Link('page:logs');return}
   var f=env.go||k.go||(typeof BOTS_UI!=='undefined'&&BOTS_UI.go);if(typeof f==='function')f(id)}
  // after a write, a reset or an undo: the frame draws the other parts of the page again (lists that show mod state reload)
  function changed(w){try{if(typeof env.changed==='function')env.changed(w||'brain');else if(typeof BOTS_UI!=='undefined'&&typeof BOTS_UI.changed==='function')BOTS_UI.changed(w||'brain','brain')}catch(e){}}
  // the frame's one Undo: POST undo {undo:[{rel,id}]} (lib.undo) puts every file of that write back, or none when one changed since
  function undoP(list){if(typeof k.undoBy==='function'){var f=k.undoBy(list);if(f)return f()}
   return new Promise(function(ok,no){env.api('POST','undo',{undo:list},function(e,r,x){if(e)no(x||new Error(String(e)));else ok(r)})})}
  // a fold of blocks: More options (open: false) or Details; the frame's kit.more / kit.details when present, else a native details
  function fold(kind,id,kids){var f=k[kind];if(typeof f==='function'){try{var n=f(id,kids);if(isBox(n))return n}catch(e){}}
   var lab=L(kind==='more'?'bots.more':'bots.details',kind);
   return h('details',{blk:id,box:'col','data-blkname':lab},[h('summary',{text:lab})].concat(kids))}
  function inDet(kids){return h('details',{},[h('summary',{class:'hint',text:L('bots.details','details')})].concat(kids))}
  // a row that cannot work here: greyed up front with one line (S7). Not the frame's kit.na: that marks the whole card "Not available"
  // when it is folded, and every card of this part still works apart from that one row (S15)
  function naEl(text){return h('div',{class:'hint','aria-disabled':'true','data-rowna':'1',style:'opacity:.65;font-style:italic',text:text})}
  function na(id,text,file,line){return k.leaf(id,[naEl(text),file?openFile(file,line):null])}
  // a link that opens a game file (the mod's copy, else the game's) in the Editor tab: the #go= form of ext/ide
  function openFile(file,line){var ref='key:resource/'+file+(line?':'+line:'');
   return h('div',{},[h('button',{type:'button','data-go':'#go='+encodeURIComponent(ref),title:file,text:t('openEd'),onclick:function(){
    if(typeof window!=='undefined'&&window.as2Link&&window.as2Link(ref))return;if(typeof location!=='undefined')location.hash='go='+encodeURIComponent(ref)}}),
    inDet([h('div',{class:'hint',text:t('fileIs')}),goLink(ref,file+(line?':'+line:''))])])}
  // the green box after a write (S4): what changes, how to see it in the game, the next steps, Undo
  function doneEl(id,o){if(typeof k.done==='function'){try{var n=k.done(id,o);if(n)return asBlk(id,n)}catch(e){}}
   var nx=(o.next||[]).map(function(x){return h('button',{type:'button',text:x.text,onclick:function(){goTo(x.go)}})}),box,ub;
   if(o.undo){ub=h('button',{type:'button',text:L('bots.btn.undo','undo'),onclick:function(){ub.disabled=true;
    Promise.resolve(o.undo()).then(function(){box.textContent='';box.appendChild(h('div',{class:'ok',role:'status',text:undoneText()}));changed('undo')},
     function(e){ub.disabled=false;box.appendChild(k.errBox(e&&typeof e==='object'?e:String(e||'')))})}});nx.push(ub)}
   box=h('div',{class:'ok',role:'status',style:'border-left:4px solid var(--okl);background:var(--ban);padding:6px 10px;margin:6px 0'},
    [h('b',{text:t('doneH')}),h('ul',{},(o.lines||[]).map(function(s){return h('li',{text:s})})),o.see?h('div',{},[h('b',{text:L('bots.done.see','seeH')+' '}),h('span',{text:o.see})]):null,h('div',{class:'row'},nx)]);
   return k.leaf(id,[box])}
  // S19: these settings change every soldier, the player's too: the frame's one 'own' sentence, then what to watch
  function seeOf(c){return typeof k.seeText==='function'?k.seeText('own')+' '+t(c+'.watch'):t(c+'.see')}
  function relsOf(list){return (list||[]).map(function(x){return x.rel})}
  function next(){return [{text:L('bots.next.match','next.match'),go:'bots.botmatch'},{text:t('next.log'),go:'log'}]}
  function ask(title,lines,cb){if(typeof askDo==='function'){askDo({title:title,lines:lines,where:env.mod,ok:title,danger:true}).then(function(y){if(y)cb()},function(){});return}
   if(typeof confirm!=='function'||confirm(lines.join(' ')))cb()}
  function goLink(ref,label){return h('a',{href:'#go='+encodeURIComponent(ref),title:t('open'),text:label,onclick:function(e){
   if(typeof window!=='undefined'&&window.as2Link&&window.as2Link(ref)&&e&&e.preventDefault)e.preventDefault()}})}
  function readErr(m){return [k.errBox(t('e.read')),inDet([h('div',{class:'hint',text:t('e.why',{m:String(m&&m.message||m||'')})})])]}
  function tagW(tag){return t(tag==='V'?'tagw.V':'tagw.I')}
  // units in the window language (S20: m = м = 米); a pair shows each number with its unit and what it is for ("computer enemies: 40 m; ...")
  function U(u){return u?t('u.'+u):''}
  function one(x,r){return String(x)+(r.unit?' '+U(r.unit):'')}
  function partName(r,i){return has(P+'k.'+r.id+'.p'+(i+1))?t('k.'+r.id+'.p'+(i+1)):''}
  function shown(v,r){if(v==null||v==='')return '';if(r.kind==='switch')return t(v==='on'?'on':'off');if(r.kind==='mult')return 'x '+v;
   if(r.kind==='pair'){var a=String(v).trim().split(/\s+/);return a.map(function(x,i){var n=partName(r,i);return n?t('pairPart',{p:n,v:one(x,r)}):one(x,r)}).join('; ')}
   return one(v,r)}
  function defTxt(r){return r.def==='none'?t('noLimit'):shown(r.def,r)}
  function nameOf(id){return t('k.'+id+'.n')}
  function inRange(r,v){var a=String(v||'').trim().split(/\s+/);if(a.length!==(r.kind==='pair'?2:1))return false;
   return a.every(function(x){return /^(\d+(\.\d+)?|\.\d+)$/.test(x)&&Number(x)>=r.min&&Number(x)<=r.max})}
  // a change as one plain sentence: name, old -> new, then what that does in a fight (raised: .up, lowered: .down)
  function sentence(x,it){it=it||{kind:'num',unit:''};var a=x.was==null?t('notSetShort'):shown(x.was,it),b=shown(x.now,it);
   var up=it.kind==='switch'?x.now==='on':Number(String(x.now).split(' ')[0])>Number(String(x.was==null?it.def:x.was).split(' ')[0]);
   return t('line',{name:nameOf(x.id),a:a,b:b})+' '+t('k.'+x.id+(up?'.up':'.down'))}
  // no mod picked: each card keeps its title and one line, then the pick-a-mod line (nothing is read)
  if(!env.mod)return ['courage','seeing','guns'].map(function(c){return k.section(P+c,t(c),[k.hint(P+c+'.lead',t(c+'.lead')),k.leaf(P+c+'.needmod',[needModEl()])])});
  var ITEMS={};BCAT.items.forEach(function(it){ITEMS[it.id]=it});

  // ---- an editable card ('courage' | 'seeing'): one block per setting, More options, the buttons, the result
  function mk(c,detKids,lead2){var id=P+c,edits={},pv=null,pvKey=null,lastUndo=null,R={},vals={};
   var its=BCAT.items.filter(function(it){return it.card===c&&it[side]});
   var res=h('div',{blk:id+'.res',box:'col','data-blkname':t('res')});
   function out(nodes){res.textContent='';res.appendChild(k.leaf(id+'.res.out',nodes))}
   function errOut(m,x){out([k.errBox(errMsg(m,x||(m&&typeof m==='object'?m:null)))])}
   var bPrev=h('button',{type:'button',class:'primary',text:L('bots.btn.preview','preview'),title:t('prev.tip'),onclick:function(){run(false)}});
   var bGo=h('button',{type:'button',class:'danger',text:L('bots.btn.write','write'),disabled:true,title:t('write.no'),onclick:function(){
    if(blocked||!pv||pvKey!==key())return;   // only a Preview of the values as they are now (the handler asks too, not only the greyed state)
    var n=pv?pv.changes.length:0,fs=pv&&pv.files||[],l=[pl('ask',n)],nc=fs.filter(function(f){return f.copiesWholeFile}).length;
    if(nc)l.push(pl('copyN',nc));if(fs.length-nc)l.push(pl('replaceN',fs.length-nc));
    ask(L('bots.btn.write','write'),l,function(){run(true)})}});
   var bUndo=h('button',{type:'button',text:L('bots.btn.undo','undo'),disabled:true,title:t('undo.no'),onclick:function(){if(!lastUndo)return;bUndo.disabled=true;
    var rs=relsOf(lastUndo);undoFn(lastUndo)().then(function(){out([h('div',{class:'ok',role:'status',text:undoneText()})]);if(typeof k.undoSync==='function')k.undoSync(rs);changed('undo')},function(e){uSync();errOut(e,e)})}});
   // Reset is greyed (with a plain tooltip) while the mod has no own copy of this card's settings: nothing to put back
   var bRes=h('button',{type:'button',text:L('bots.btn.reset','reset'),disabled:true,title:t('reset.no'),onclick:function(){ask(L('bots.btn.reset','reset'),[t('resetAsk')],function(){
    env.api('POST','brain/reset',{ids:its.map(function(r){return r.id}),write:true},function(e,r,x){
     if(e){errOut(e,x);return}edits={};touched();
     if(!r.had||!r.removed){out([h('div',{class:'hint',text:t('resetNone')})]);return}
     lastUndo=r.undo&&r.undo.length?r.undo:null;uSync();changed();
     res.textContent='';res.appendChild(doneEl(id+'.res.done',{lines:[t(r.fileRemoved?'resetGone':'resetDone')],see:seeOf(c),next:next(),undo:lastUndo?undoFn(lastUndo):null,rels:relsOf(lastUndo)}));load(c)})})}});
   // S18: one Undo state for the card; greyed with its plain tooltip when there is nothing to undo
   function uSync(){if(blocked)return;bUndo.disabled=!lastUndo;bUndo.title=lastUndo?t('undo.tip'):t('undo.no')}
   function rSync(mine){if(blocked)return;bRes.disabled=!mine;bRes.title=mine?t('reset.tip'):t('reset.no')}
   // no game folder: the one line under the lead, the rows hidden, every button greyed with that reason in its tooltip
   var blocked=false,gate=h('div');
   function gateSet(n,tip){gate.textContent='';if(n)gate.appendChild(n);blocked=!!n;Object.keys(R).forEach(function(i){R[i].el.hidden=blocked});
    [bPrev,bGo,bUndo,bRes].forEach(function(b){if(blocked){b.disabled=true;b.title=tip}});
    if(!blocked){bPrev.disabled=false;bPrev.title=t('prev.tip');touched();uSync()}}
   uSync();rSync(false);
   // one undo for the green box and the Undo button: the frame's undo route, then this card reads its values again
   function undoFn(list){return function(){return undoP(list).then(function(r){if(lastUndo===list)lastUndo=null;uSync();load(c);return r})}}
   function key(){return JSON.stringify(edits)}
   function touched(){pv=null;bGo.disabled=true;if(!blocked)bGo.title=t('write.no')}
   function run(write){if(!Object.keys(edits).length){out([h('div',{class:'hint',text:t('none')})]);return}
    var sent=key();out([h('div',{class:'hint',text:t('working')})]);
    env.api('POST','brain/edit',{changes:edits,write:write},function(e,r,x){
     if(e){errOut(e,x);touched();return}
     if(!r.changes.length){out([h('div',{class:'hint',text:t('none')})]);touched();return}
     var lines=r.changes.map(function(x){return sentence(x,ITEMS[x.id])});
     if(write){edits={};touched();lastUndo=r.undo&&r.undo.length?r.undo:null;uSync();changed();
      res.textContent='';res.appendChild(doneEl(id+'.res.done',{lines:lines,see:seeOf(c),next:next(),undo:lastUndo?undoFn(lastUndo):null,rels:relsOf(lastUndo)}));load(c);return}
     var fx=[];(r.files||[]).forEach(function(f){fx.push(h('div',{class:'hint',text:t(f.copiesWholeFile?'copy':'replace',{f:f.rel})}));
      if(f.diff&&f.diff.length)fx.push(h('pre',{style:'white-space:pre-wrap;margin:4px 0;font-size:.9em'},[f.diff.map(function(d){return d.op+' '+d.n+'  '+d.text}).join('\n')]))});
     out([h('b',{text:pl('will',lines.length)}),h('ul',{},lines.map(function(s){return h('li',{text:s})})),
      h('details',{},[h('summary',{class:'hint',text:L('bots.showChange','exact')})].concat(fx))]);
     pv=r;pvKey=sent;bGo.disabled=key()!==pvKey;bGo.title=bGo.disabled?t('write.no'):t('write.tip')})}
   function rowLeaf(it){var body=h('div',{},[h('div',{class:'hint',text:t('loadingRow')})]);
    var el=k.leaf(id+'.k.'+it.id,[h('div',{},[h('b',{text:nameOf(it.id)})]),h('div',{class:'hint',text:t('k.'+it.id+'.e')}),body],nameOf(it.id));
    R[it.id]={el:el,body:body};return el}
   function ctlOf(it,v){var name=nameOf(it.id),warn=h('div',{class:'err',hidden:true}),ctl=[];
    var cur=v.mod==null?'':String(v.mod);
    function set(x){if(x===cur||(it.kind!=='switch'&&!String(x).trim()&&!cur))delete edits[it.id];else edits[it.id]=x;touched()}
    if(it.kind==='switch'){var cb=h('input',{type:'checkbox','aria-label':name});cb.checked=cur==='on';
     cb.addEventListener('change',function(){set(cb.checked?'on':'off')});ctl=[cb,' ',h('span',{text:t('switchOn')})]}
    else{var parts=cur?cur.split(/\s+/):[],n=it.kind==='pair'?2:1,boxes=[],sl=null,st=v.stock==null?'':String(v.stock);
     // the hint in each box is the game's value (the stock file's number, else the engine's own default), never a third number
     var stA=st?st.split(/\s+/):[],dfA=it.def==='none'?[]:String(it.def).split(/\s+/);
     for(var i=0;i<n;i++)boxes.push(h('input',{type:'number',min:String(it.min),max:String(it.max),step:String(it.step||'any'),value:parts[i]==null?'':parts[i],
      placeholder:String(stA[i]!=null&&stA[i]!==''?stA[i]:dfA[i]!=null?dfA[i]:''),style:'width:7em',inputmode:'decimal','aria-label':name+(n>1?' - '+(partName(it,i)||String(i+1)):'')}));
     if(n===1){var sv=parts[0]!=null?parts[0]:st?st:it.def!=='none'?it.def:it.min;
      sl=h('input',{type:'range',min:String(it.min),max:String(it.max),step:String(it.step||'any'),value:String(sv),'aria-label':name,style:'width:12em;max-width:40vw'})}
     function upd(){var x=boxes.map(function(b){return String(b.value).trim()}).join(' ').trim();
      var ok=!x||inRange(it,x);warn.hidden=ok;warn.textContent=ok?'':t('bad',{name:name,a:it.min,b:it.max,u:U(it.unit)});
      boxes.forEach(function(b){b.className=x&&x!==st?'changed':''});set(x)}
     boxes.forEach(function(b){b.addEventListener('input',function(){if(sl&&String(b.value).trim()!=='')sl.value=b.value;upd()})});
     if(sl)sl.addEventListener('input',function(){boxes[0].value=sl.value;upd()});
     if(sl)ctl.push(sl,' ');boxes.forEach(function(b,i){if(i)ctl.push(' ');var pn=n>1?partName(it,i):'';if(pn)ctl.push(h('span',{text:pn+':'}),' ');ctl.push(b)});
     ctl.push(' ',h('span',{class:'hint',text:t('range',{a:it.min,b:it.max,u:U(it.unit)})}))}
    return {ctl:ctl,warn:warn}}
   function fillRow(it,v,from){var x=R[it.id];if(!x)return;x.body.textContent='';
    if(!v){x.body.appendChild(h('div',{class:'hint',text:t('noneHere')}));return}
    if(v.na){x.body.appendChild(naEl(t('sight.'+v.na)));
     if(v.na==='form')x.body.appendChild(openFile(v.file||it.file,v.line));return}
    var stockTxt=!v.stockKnown?t('stockUnknown'):v.stock==null?t('notSet',{v:defTxt(it)}):shown(v.stock,it);
    var modTxt=from!=='mod'?t('same'):v.mod==null?t('notSet',{v:defTxt(it)}):shown(v.mod,it);
    var c2=ctlOf(it,v),info=it[side]||{},tag=v.tag||info.tag,reader=v.reader||info.reader,file=v.file||it.file;
    var ref='key:resource/'+file+(v.line?':'+v.line:'');
    x.body.appendChild(h('div',{class:'row'},c2.ctl));x.body.appendChild(c2.warn);
    x.body.appendChild(h('div',{class:'hint',text:t('vals',{stock:stockTxt,mod:modTxt})}));
    x.body.appendChild(h('div',{class:'hint',text:t(it.kind==='switch'?'onPre':'upPre',{w:t('k.'+it.id+'.up')})}));
    x.body.appendChild(inDet([h('small',{class:'hint'},[h('code',{text:v.key||it.key}),it.keyX?h('span',{text:' '+t('sight.keyX')}):null,' · ',goLink(ref,file+(v.line?':'+v.line:'')),reader?' · ':null,reader?h('span',{text:t('readAt',{p:reader})}):null,' · ',h('span',{'data-tag':tag,text:tagW(tag)})])]))}
   function fill(rep){var by={};(rep.rows||[]).forEach(function(r){by[r.id]=r});
    var sg=rep.sight||{na:'noFile'};(sg.rows||[]).forEach(function(r){by[r.id]={id:r.id,mod:r.mod,stock:r.stock,stockKnown:r.stockKnown,file:r.file,line:r.line,from:r.from,na:r.found===false?'form':null}});
    if(sg.na)its.forEach(function(it){if(/^sight-/.test(it.id))by[it.id]={na:sg.na}});
    gateSet(null);edits={};touched();src.textContent='';src.appendChild(h('div',{class:'hint',text:t(rep.from==='mod'?'fromMod':'fromGame')}));
    var mine=false;its.forEach(function(it){var v=by[it.id],from=v&&v.from?v.from:rep.from;if(from==='mod'&&!(v&&v.na))mine=true;fillRow(it,v,from)});rSync(mine)}
   // a read failure: one plain sentence with the next step (the card's result box), the raw reason folded in Details
   function fail(m,x){its.forEach(function(it){var x=R[it.id];if(x)x.body.textContent=''});rSync(false);
    if(noGameErr(x)){res.textContent='';gateSet(needGameEl(),t('needGame.tip'));return}
    out(readErr(m))}
   var src=h('div');
   var main=its.filter(function(it){return !it.more}),rare=its.filter(function(it){return it.more});
   var leadL=k.hint(id+'.lead',t(c+'.lead'));leadL.appendChild(gate);
   var kids=[leadL];if(lead2)kids.push(lead2);
   main.forEach(function(it){kids.push(rowLeaf(it))});
   if(rare.length)kids.push(fold('more',id+'.more',rare.map(rowLeaf)));
   kids.push(h('div',{class:'row',blk:id+'.btns','data-blkname':t('btns')},[bPrev,bGo,bUndo,bRes]),res);
   kids.push(fold('details',id+'.det',[k.leaf(id+'.det.body',[src].concat(detKids||[]))]));
   return {el:k.section(id,t(c),kids),fill:fill,fail:fail}}

  function scope(){return [h('div',{class:'hint',text:t('scope')}),h('div',{class:'hint',text:t('scope.det')})]}
  var cards={courage:mk('courage',[h('div',{class:'hint',text:t('zone')})].concat(scope(),[h('div',{class:'hint',text:t('k.retreat-ratio.note')})])),
   seeing:mk('seeing',[h('div',{class:'hint',text:t('sight.how')}),h('div',{class:'hint',text:t('vehicles')})].concat(scope()),goh?na(P+'seeing.sight',t('sight.goh',{game:G()}),'set/vision/vision.set'):null)};
  var lo=h('div');
  // one values request fills both cards (only the card asked for when one card reloads after a write, a reset or an undo)
  function load(which){env.api('GET','brain/values',{},function(e,r,x){
   if(e){Object.keys(cards).forEach(function(c){if(!which||which===c)cards[c].fail(e,x)});return}
   Object.keys(cards).forEach(function(c){if(!which||which===c)cards[c].fill(r)});
   lo.textContent='';lo.appendChild(h('b',{text:t('leftOut')}));
   lo.appendChild(h('ul',{},(r.leftOut||[]).map(function(x){return h('li',{},[h('span',{text:t('lo.'+x.id)}),x.file?openFile(x.file):null,' ',h('small',{class:'hint'},[h('code',{text:x.key}),' · '+x.reader+' · ',h('span',{text:tagW(x.tag)})])])})))})}

  // ---- guns: read only, where each key sits (links into the Editor); one block per key
  var GR={};
  function gunLeaf(g){var body=h('div',{},[h('div',{class:'hint',text:t('loadingGuns')})]);
   GR[g.id]=body;return k.leaf(P+'guns.g.'+g.id,[h('div',{},[h('b',{text:t('g.'+g.id+'.n')})]),h('div',{class:'hint',text:t('g.'+g.id+'.e')}),body],t('g.'+g.id+'.n'))}
  var gnote=h('div');
  env.api('GET','brain/guns',{},function(e,r,x){
   if(e){Object.keys(GR).forEach(function(i){GR[i].textContent=''});gnote.textContent='';(noGameErr(x)?[needGameEl()]:readErr(e)).forEach(function(n){gnote.appendChild(n)});return}
   gnote.textContent='';if(!r.gameRead)gnote.appendChild(h('div',{class:'hint',text:t('guns.noGame')}));
   r.rows.forEach(function(g){var b=GR[g.id];if(!b)return;b.textContent='';
    var hits=g.hits.map(function(x){var ref='key:'+x.key+':'+x.line;return h('li',{},[goLink(ref,x.key.replace(/^resource\//,'')+':'+x.line),' ',h('code',{text:x.text}),x.from==='mod'?h('span',{class:'hint',text:' '+t('inMod')}):null])});
    b.appendChild(h('div',{class:'hint',text:g.count?t('found',{f:pl('nFiles',g.files),l:pl('nLines',g.count)}):t('notFound')}));
    // S2: the engine's words for this value sit here, not in the row's main line
    b.appendChild(inDet([has(P+'g.'+g.id+'.det')?h('div',{class:'hint',text:t('g.'+g.id+'.det')}):null,g.count?h('ul',{},hits):null,h('small',{class:'hint'},[h('code',{text:g.key}),g.reader?' · ':null,g.reader?h('span',{text:t('readAt',{p:g.reader})}):null,' · ',h('span',{text:tagW(g.tag)})])]))})});
  var gk=[k.hint(P+'guns.lead',t('guns.lead')),k.hint(P+'guns.arty',t('guns.arty')),goh?k.hint(P+'guns.goh',t('guns.goh',{game:G()})):null,k.leaf(P+'guns.note',[gnote])];
  // (S15: the guns list can work in Gates of Hell, it was only not tried there: a plain "Not yet tried" line, never "Not available")
  BCAT.guns.forEach(function(g){gk.push(gunLeaf(g))});
  gk.push(fold('details',P+'guns.det',[k.hint(P+'guns.arty.det',t('guns.arty.det')),k.leaf(P+'leftout',[lo],t('leftOut'))]));
  var guns=k.section(P+'guns',t('guns'),gk);
  var nodes=[];if(goh)nodes.push(k.hint(P+'goh',t('gohNote',{game:G()})));
  nodes.push(cards.courage.el,cards.seeing.el,guns);
  load();
  return nodes}});
`;
