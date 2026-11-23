// logs ext: browser script (page.js rules: no backtick, no dollar-brace, no innerHTML; DOM via h() and textContent only)
// Author: Imperator_Aug (ARSENAL, ia-9d914bb2)
module.exports = String.raw`
EXT_SCREENS.logs=function(root){
  var out={};
  function el(tag,cls,text,kids){return h(tag,{class:cls||null,text:text==null?null:text},kids||[])}
  function age(ms){var s=Math.max(0,Math.round((Date.now()-ms)/1000));if(s<90)return tx('logs.age.now');var m=Math.round(s/60);if(m<90)return tx('logs.age.min',{n:m});var hh=Math.round(m/60);if(hh<48)return tx('logs.age.hour',{n:hh});return tx('logs.age.day',{n:Math.round(hh/24)})}
  // blocks: each section is a card container <id> with leaves <id>.title, <id>.intro and the parts put() adds; a result area the code
  // clears is the inner element of its leaf (the leaf itself is never cleared)
  function sect(id,key,intro){var box=h('div',{class:'card',blk:id,box:'col'});box.style.margin='0 0 14px';box.style.padding='10px 12px';box.style.border='1px solid var(--line)';box.style.borderRadius='6px';
    box.appendChild(blk(id+'.title',[el('h3',null,tx(key))]));if(intro)box.appendChild(blk(id+'.intro',[el('p','hint',tx(intro))]));root.appendChild(box);box.sid=id;box.skey=key;return box}
  function put(sec,part,kids,res){sec.appendChild(blk(sec.sid+'.'+part,kids,res?{name:tx('logs.blk.res',{s:tx(sec.skey)})}:{}))}
  var COL={stop:'var(--lvbad)',crash:'var(--lvbad)',warn:'var(--lvwarn)',note:'var(--lvnote)',ok:'var(--lvok)',broken:'var(--lvbad)',skip:'var(--lvnote)'};
  function badge(level){var b=el('span',null,tx('logs.lvl.'+level));b.style.background=COL[level]||'var(--lvnote)';b.style.color='var(--lvfg)';b.style.padding='1px 7px';b.style.borderRadius='9px';b.style.marginRight='8px';b.style.fontSize='12px';b.style.fontWeight='bold';return b}
  function listOf(items){var u=el('ul');items.forEach(function(t){if(t)u.appendChild(el('li',null,t))});return u}
  function card(level,title,what,fix,detail){var c=el('div');c.style.borderLeft='4px solid '+(COL[level]||'var(--lvnote)');c.style.padding='6px 10px';c.style.margin='8px 0';c.style.background='var(--soft)';
    var t=el('div');t.appendChild(badge(level));var b=el('b',null,title);t.appendChild(b);c.appendChild(t);
    if(what)c.appendChild(el('div',null,what));
    if(fix&&fix.length){c.appendChild(el('div','hint',tx('logs.todo')));c.appendChild(listOf(fix))}
    if(detail){var d=el('details');d.appendChild(el('summary',null,tx('logs.raw')));var pre=el('pre',null,detail);pre.style.whiteSpace='pre-wrap';pre.style.margin='4px 0';d.appendChild(pre);c.appendChild(d)}
    return c}
  function note(parent,msg,bad){parent.textContent='';var p=el('p',bad?'err':'hint',msg);parent.appendChild(p)}
  function busy(parent){note(parent,tx('logs.working'))}
  // the folder of the page's game: the GoH install under GoH (curFolder), else the AS2 install
  function curDir(){return typeof curFolder==='function'?curFolder():gameDir()}
  // JOBS: a request stopped from the footer (e.cancelled) is no error: the plain line Stopped
  function fail(parent,e){if(e&&e.cancelled){note(parent,e.message||'');return}note(parent,tx('logs.err',{m:e.message}),true)}

  // ---- 1 explain
  var sx=sect('explain','logs.s.explain','logs.explain.intro');
  var warn=el('div',null,tx('logs.copywarn'));warn.style.border='1px solid var(--warnl)';warn.style.padding='6px 10px';warn.style.margin='6px 0';warn.style.borderRadius='4px';put(sx,'warn',[warn]);
  var exRes=el('div');
  function showResults(j){exRes.textContent='';
    if(!j.results||!j.results.length){note(exRes,tx('logs.none'));return}
    j.results.forEach(function(r){
      var hd=el('h4',null,r.label);exRes.appendChild(hd);
      (r.header||[]).forEach(function(l){exRes.appendChild(el('div','hint',l))});
      if(!r.cards.length)exRes.appendChild(card('ok',tx('logs.clean'),tx('logs.clean.what'),[],''));
      var tops=0;
      r.cards.forEach(function(c){
        var label=c.title+(c.count>1?'  x'+c.count:'');
        var what=c.what+(c.msg?'  ('+c.msg+')':'');
        var fix=(c.fix||[]).slice();if(c.hint)c.hint.forEach(function(x){fix.push(x)});
        var where=c.file?tx('logs.at',{f:c.file,l:c.line}):'';
        exRes.appendChild(card(c.level,label,what+(where?'  '+where:''),fix,c.detail||''));tops++});
      if(r.more)exRes.appendChild(el('p','hint',tx('logs.more',{n:r.more})));
      (r.notes||[]).forEach(function(n){exRes.appendChild(el('div','hint',n.text))});
    });
    if(j.results.some(function(r){return r.tests&&r.tests.length})){
      var ul=[];j.results.forEach(function(r){(r.tests||[]).forEach(function(t){if(ul.indexOf(t)<0)ul.push(t)})});
      exRes.appendChild(card('note',tx('logs.tryafter'),'',ul,''))}
    loadTicks()}
  function explain(body){busy(exRes);api('/api/x/logs/explain',body,{what:tx('logs.job.explain')}).then(showResults).catch(function(e){fail(exRes,e)})}
  var rowx=el('div');
  var b1=h('button',{type:'button',class:'primary',text:tx('logs.btn.last'),onclick:function(){explain(S.mod?{mod:S.mod}:{})}});
  var b2=h('button',{type:'button',text:tx('logs.btn.all'),onclick:function(){explain({all:true})}});
  [b1,document.createTextNode(' '),b2].forEach(function(x){rowx.appendChild(x)});
  put(sx,'btns',[rowx]);put(sx,'res',[exRes],true);

  // ---- 2 files ("Look again" sits here, next to the list it reloads; logs.nofolders in that list names it)
  var sf=sect('files','logs.s.files','logs.files.intro');
  var b3=h('button',{type:'button',text:tx('logs.btn.refresh'),onclick:function(){loadFind()}});
  var fRes=el('div');put(sf,'btns',[b3]);put(sf,'res',[fRes],true);
  var dRes=el('div');
  function fileRow(f,dir,inst){var r=el('div');r.style.margin='3px 0';
    r.appendChild(el('span',null,f.name+'   '+fmtBytes(f.size)+'   '+age(f.mtimeMs)+'   '));
    r.appendChild(h('button',{type:'button',text:tx('logs.btn.explainthis'),onclick:function(){explain({file:f.path,mod:S.mod||undefined})}}));return r}
  function loadFind(){busy(fRes);api('/api/x/logs/find',undefined,{what:tx('logs.job.find')}).then(function(j){fRes.textContent='';
    var any=false;
    j.instances.forEach(function(it){
      if(!it.exists&&!it.files.length)return;any=true;
      fRes.appendChild(el('h4',null,tx(it.inst===0?'logs.inst0':'logs.instn',{n:it.inst})));
      fRes.appendChild(el('div','hint',it.dir));
      it.files.slice().sort(function(a,b){return b.mtimeMs-a.mtimeMs}).forEach(function(f){fRes.appendChild(fileRow(f,it.dir,it.inst))});
      if(it.dumps.length){fRes.appendChild(el('div',null,tx('logs.dumps')));
        it.dumps.forEach(function(d){var r=el('div');r.style.margin='3px 0';r.appendChild(el('span',null,d.name+'   '+age(d.mtimeMs)+'   '));
          if(d.sidecar)r.appendChild(h('button',{type:'button',text:tx('logs.btn.readcrash'),onclick:function(){readDump(d.sidecar)}}));
          else r.appendChild(el('span','hint',tx('logs.nosidecar')));
          fRes.appendChild(r)})}
      if(it.oos.length){fRes.appendChild(el('div',null,tx('logs.oos')));
        it.oos.forEach(function(o){var r=el('div');r.style.margin='3px 0';r.appendChild(el('span',null,o.name+'   '+age(o.mtimeMs)+'   '));
          r.appendChild(h('button',{type:'button',text:tx('logs.btn.explainthis'),onclick:function(){explain({dir:o.path})}}));fRes.appendChild(r)})}
    });
    if(!any)fRes.appendChild(el('p','hint',tx('logs.nofolders')));
    if(j.skippedInstances)fRes.appendChild(el('p','hint',tx('logs.inst.mowas2',{n:j.skippedInstances})));
    fRes.appendChild(dRes);
    var pr=el('div');pr.style.marginTop='8px';
    pr.appendChild(h('button',{type:'button',text:tx('logs.btn.pickfolder'),onclick:function(){pick('dir','',function(p){explain({dir:p})})}}));
    fRes.appendChild(pr);
  }).catch(function(e){fail(fRes,e)})}
  function readDump(file){dRes.textContent='';busy(dRes);api('/api/x/logs/dump',{file:file},{what:tx('logs.job.dump')}).then(function(j){dRes.textContent='';
    var lines=[];if(j.exception){var x=j.exception;
      if(x.kind==='crash'){lines.push(tx('logs.dump.where',{f:x.fn||'?',s:x.src||'?'}));if(x.address)lines.push(tx('logs.dump.addr',{a:x.address}))}
      else if(x.message)lines.push(x.message)}
    var fix=j.plain||[];
    dRes.appendChild(card(j.exception&&j.exception.kind==='crash'?'crash':(j.hasException?'stop':'note'),tx('logs.dump.title',{n:j.name}),lines.join('  '),fix,(j.before||[]).join('\n')));
  }).catch(function(e){fail(dRes,e)})}

  // ---- 3 enabled
  var se=sect('enabled','logs.s.enabled','logs.enabled.intro');
  var eRes=el('div');
  function loadEnabled(){busy(eRes);var gf=curDir(),tg=curGame().target;api('/api/x/logs/enabled'+(gf?'?game='+encodeURIComponent(gf):'')+(tg?(gf?'&':'?')+'target='+encodeURIComponent(tg):''),undefined,{what:tx('logs.job.enabled')}).then(function(j){eRes.textContent='';
    if(j.note==='no-options'){eRes.appendChild(el('p','hint',tx('logs.en.none')));return}
    eRes.appendChild(el('div','hint',j.options));
    if(!j.mods.length)eRes.appendChild(el('p',null,tx('logs.en.empty')));
    else{var ol=el('ol');j.mods.forEach(function(m){var t=m.name+(m.raw!==m.name?'  ('+m.raw.slice(m.name.length+1)+')':'');
      var tag=m.installed===false?tx('logs.en.missing'):(m.mode?tx('logs.en.mode.'+m.mode):'');
      var li=el('li',null,t+(tag?'   - '+tag:''));if(m.installed===false||(m.capitals&&m.installed!==true))li.style.color=COL.stop;ol.appendChild(li)});eRes.appendChild(ol)}
    j.warnings.forEach(function(w){eRes.appendChild(card(w.level,w.text,'',[],''))});
  }).catch(function(e){fail(eRes,e)})}
  put(se,'btns',[h('button',{type:'button',text:tx('logs.btn.check'),onclick:loadEnabled})]);put(se,'res',[eRes],true);

  // ---- 4 mod not in list
  var sm=sect('modwhy','logs.s.modwhy','logs.modwhy.intro');
  var mRes=el('div');var mDeep=h('input',{type:'checkbox','aria-label':tx('logs.deep')});
  var mCur=el('div','hint');
  function modLine(){mCur.textContent=S.mod?tx('logs.mod.is',{p:S.mod}):tx('logs.mod.pick')}
  var mRow=el('div');
  mRow.appendChild(h('button',{type:'button',class:'primary',text:tx('logs.btn.why'),onclick:function(){
    if(!S.mod){note(mRes,tx('logs.mod.pick'),true);return}
    busy(mRes);api('/api/x/logs/modwhy',{mod:S.mod,game:curDir()||undefined,deep:mDeep.checked,target:curGame().target},{what:tx('logs.job.modwhy')}).then(function(j){mRes.textContent='';
      if(j.facts.length){var tb=el('div','hint',j.facts.map(function(f){return f.k+': '+f.v}).join('    '));mRes.appendChild(tb)}
      j.reasons.forEach(function(r){mRes.appendChild(card(r.level,r.what,'',r.fix,''))});
      if(j.verdict)mRes.appendChild(card(j.verdict.level,tx('logs.verdict'),j.verdict.text,[],j.verdict.raw))
    }).catch(function(e){fail(mRes,e)})}}));
  mRow.appendChild(document.createTextNode('  '));var ml=el('label',null,' '+tx('logs.deep.wl'));ml.insertBefore(mDeep,ml.firstChild);mRow.appendChild(ml);
  put(sm,'mod',[mCur]);put(sm,'btns',[mRow]);put(sm,'res',[mRes],true);

  // ---- 5 unit
  var su=sect('unit','logs.s.unit','logs.unit.intro');
  var uRes=el('div');var uIn=h('input',{type:'text',placeholder:tx('logs.unit.ph'),'aria-label':tx('logs.unit.ph'),size:'24'});
  var uDeep=h('input',{type:'checkbox','aria-label':tx('logs.deep')});
  // searchKit (page.js; owner 2026-11-19: browse, indexed search and history on every search box): index = the unit names (entity .def
  // files) of the mod and of the page's game, read once per mod and game, the mod's first. Browse = the file picker on the game data
  // (paks + the mod) at entity/, .def only: the file's base name. A pick checks that unit at once
  var UN={k:null,a:null,w:[]};
  function unitItems(cb){var gf=curDir(),tg=(curGame()||{}).target,k=(S.mod||'')+'|'+(gf||'')+'|'+(tg||'');if(UN.k!==k)UN={k:k,a:null,w:[]};if(UN.a){cb(UN.a);return}
    UN.w.push(cb);if(UN.w.length>1)return;var me=UN,q=[S.mod?'mod='+encodeURIComponent(S.mod):'',gf?'game='+encodeURIComponent(gf):'',tg?'target='+encodeURIComponent(tg):''].filter(Boolean).join('&');
    function give(a){me.a=a;me.w.splice(0).forEach(function(f){f(a)})}
    api('/api/x/logs/units'+(q?'?'+q:''),undefined,{what:tx('logs.job.units')}).then(function(j){give(((j&&j.units)||[]).map(function(u){return {label:u.n,value:u.n,hint:(u.src==='mod'?tx('logs.g.mod')+'  ':'')+(u.dir||''),lo:u.n.toLowerCase()}}))}).catch(function(){give([])})}
  function hits(a,q,done){q=String(q||'').toLowerCase();var out=[],n=0;for(var i=0;i<a.length;i++)if(a[i].lo.indexOf(q)>=0){n++;if(out.length<40)out.push(a[i])}done(out,n-out.length)}
  function stem(p){var b=String(p||'').replace(/\\/g,'/').split('/').pop(),i=b.lastIndexOf('.');return i>0?b.slice(0,i):b}
  var uKit=searchKit(uIn,{key:'logs.unit',index:function(q,done){unitItems(function(a){hits(a,q,done)})},
    browse:{mode:'file',view:'data',start:'entity',exts:['def'],toValue:stem},onPick:function(v){uIn.value=v;runUnit()}});
  var uRow=el('div');uRow.appendChild(uKit.el);uRow.appendChild(document.createTextNode(' '));
  var STEPN={def:'logs.st.def',inc:'logs.st.inc',model:'logs.st.model',material:'logs.st.material',card:'logs.st.card',army:'logs.st.army',icon:'logs.st.icon',icon_small:'logs.st.icons',doctrine:'logs.st.doctrine',bot:'logs.st.bot',refs:'logs.st.refs',game:'logs.st.game'};
  function runUnit(){
    if(!S.mod){note(uRes,tx('logs.mod.pick'),true);return}
    var n=(uIn.value||'').trim();if(!n){note(uRes,tx('logs.unit.need'),true);return}
    busy(uRes);api('/api/x/logs/unit',{mod:S.mod,unit:n,game:curDir()||undefined,deep:uDeep.checked,target:curGame().target},{what:tx('logs.job.unit')}).then(function(j){uRes.textContent='';
      if(j.firstBroken>=0)uRes.appendChild(el('p','err',tx('logs.unit.first',{s:tx(STEPN[j.steps[j.firstBroken].id]||'logs.st.def')})));
      else uRes.appendChild(el('p',null,tx('logs.unit.allok')));
      j.steps.forEach(function(s){var lv=s.status==='broken'?'stop':s.status;
        var fix=s.fix||[];var c=card(lv,tx(STEPN[s.id]||'logs.st.def'),s.note,fix,s.where);
        if(s.status==='skip')c.style.opacity='0.6';uRes.appendChild(c)});
      if(j.deep&&j.deep.lines&&j.deep.lines.length)uRes.appendChild(card('stop',tx('logs.st.refs'),'',[],j.deep.lines.join('\n')));
    }).catch(function(e){fail(uRes,e)})}
  uRow.appendChild(h('button',{type:'button',class:'primary',text:tx('logs.btn.unit'),onclick:runUnit}));
  uRow.appendChild(document.createTextNode('  '));var ul2=el('label',null,' '+tx('logs.deep.refs'));ul2.insertBefore(uDeep,ul2.firstChild);uRow.appendChild(ul2);
  uIn.addEventListener('keydown',function(e){if(e._sk)return;if(e.key==='Enter')runUnit()});
  put(su,'form',[uRow]);put(su,'res',[uRes],true);

  // ---- 6 tick list
  var st=sect('ticks','logs.s.ticks','logs.ticks.intro');
  var tRes=el('div');put(st,'res',[tRes],true);
  var tkBusy=null;   // the same read is in flight (show() calls refresh, then focus)
  function loadTicks(){
    var q=S.mod?'?mod='+encodeURIComponent(S.mod):'';if(tkBusy===q)return;tkBusy=q;
    api('/api/x/logs/ticklist'+q,undefined,{what:tx('logs.job.ticks')}).then(function(j){tkBusy=null;tRes.textContent='';
      var key='logs.ticks.'+(S.mod||'');var done=LS.get(key,{});
      j.items.forEach(function(it,i){
        var cb=h('input',{type:'checkbox','aria-label':it.text,onchange:function(){done[it.text]=cb.checked;LS.set(key,done)}});cb.checked=!!done[it.text];
        var l=el('label',null,' '+it.text);l.insertBefore(cb,l.firstChild);var d=el('div');d.appendChild(l);tRes.appendChild(d)});
      tRes.appendChild(h('button',{type:'button',text:tx('logs.ticks.reset'),onclick:function(){LS.set(key,{});loadTicks()}}));
    }).catch(function(e){tkBusy=null;fail(tRes,e)})}

  out.refresh=function(){modLine();loadTicks()};
  out.focus=function(){modLine();loadFind();loadTicks()};
  modLine();
  return out;
};
`;
