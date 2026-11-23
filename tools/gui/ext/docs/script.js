// docs ext: browser script (page.js rules: no backtick, no dollar-brace, no innerHTML; DOM via h() and textContent only).
// Reader and search for the documentation sets. Draws markdown in a plain way: headings, code blocks, pipe tables, bullets,
// quotes, limits rows, and links (document paths, limits IDs, "-> topic/block" refs, first word of a router or index line).
// G9: a book view (the guide, the engine document): one continuous document in reading order, chapters drawn when the reader
// gets near them, contents by part and chapter that follow the reader, links between chapters that stay in the book
// (file.md#heading lands on that heading), book search with hits grouped by part, previous / next at chapter ends, the PDF.
// Whole documents (the doctrine atlas, the guide, the engine document as one self-contained HTML file each): buttons under the set
// select, read in the reading card in a sandboxed frame (state {k:'whole',id}); the frame reloads with the new theme on a theme change.
// Parts (the shell's third row, docs/<part>): arsenal, modding, engine, project (maintainer notes, Advanced only), history (its own
// sub-tab, Historical Sources). The set select and the whole-document buttons show the current part only; the shell opens a part
// with out.view(part), the page reports a part it changed itself (a link into another part) with viewSet('docs',part). The last
// document is kept per part (docs.last.<part>, docs.set.<part>); no view given = the last part used (docs.part, default modding).
// Author: Imperator_Aug (ARSENAL, ia-7e8c44b6)
module.exports = String.raw`
EXT_SCREENS.docs=function(root){
  var out={};
  var PARTS=['arsenal','modding','engine','project','history'],PDEF={arsenal:'here',modding:'guide',engine:'engine',project:'start',history:'history'};
  function okPart(p){return PARTS.indexOf(p)>=0}
  var D={st:null,part:'modding',set:'guide',files:[],now:null,hist:[],loaded:false,areas:{},cur:'',mode:'files',leftMode:'',bk:null,hit:null,lastQ:'',lastAt:0,adv:false,pub:{},notes:{},told:false,heads:{}};
  D.part=okPart(LS.get('docs.part','modding'))?LS.get('docs.part','modding'):'modding';D.set=PDEF[D.part];
  // Advanced (Settings page; page.js keeps it in LS 'adv'): off = the start page and the books only; on = the maintainers' notes as well
  function advNow(){return !!LS.get('adv',false)}
  // the shell's view hook (page.js viewSet): the part this page shows now, when the page changed it itself
  function told(p){D.told=true;if(typeof viewSet==='function')viewSet('docs',p)}
  var BT=String.fromCharCode(96),FENCE=BT+BT+BT,MAXLIST=500;
  var SRCIDX='@history/source-index',HPAGE=50;
  var SETRX=/^(?:modweb|limits|codemap|gohweb|guide|refmods|plan|tools|techdoc)\/[\w.\/-]+\.md(?::\d+(?:-\d+)?)?$/;
  var LIMRX=/^([A-Za-z]{2,6})\d?-\d{1,4}$/;
  function el(tag,cls,text,kids){return h(tag,{class:cls||null,text:text==null?null:text},kids||[])}
  function q(o){var p=[];for(var k in o)if(o[k]!=null&&o[k]!=='')p.push(k+'='+encodeURIComponent(o[k]));return p.length?'?'+p.join('&'):''}
  function sel(aria){return h('select',{'aria-label':aria})}
  function opts(s,list){s.textContent='';list.forEach(function(o){s.appendChild(h('option',{value:o[0],text:o[1]}))})}
  // a request stopped from the job list (e.cancelled, message "Stopped") shows that plain word, not "Could not do that"
  function errT(e){return e&&e.cancelled?e.message:tx('docs.err',{m:e.message})}
  function fail(e){toast(errT(e))}
  // JOBS: the name of a request in the footer's job list ("Docs: Search"); these calls also run from Back, a pick or a reply, where no clicked button names them
  function wn(k){return {what:tx('docs.nav')+': '+tx(k)}}
  function isEnter(e){return !(e&&e.isComposing)&&!!e&&(e.key==='Enter'||e.keyCode===13||e.which===13)}
  function block(b){b.style.display='block';b.style.textAlign='left';b.style.padding='1px 2px';b.style.wordBreak='break-word';return b}

  // blocks: title, intro, status line, edition note, not-found card, then the columns: the list card
  // (set, notes heading, what, buttons, filter, list) and the reading card (search toolbar, where, the document view: one leaf)
  var titleH=el('h2',null,tx('docs.title')),introP=el('p',null,tx('docs.intro'));
  root.appendChild(blk('title',[titleH]));
  root.appendChild(blk('intro',[introP]));
  // Historical Sources is its own sub-tab: its own title and intro; every other part is the documentation
  function chrome(){var hp=D.part==='history';titleH.textContent=tx(hp?'docs.view.history':'docs.title');introP.textContent=tx(hp?'docs.intro.history':'docs.intro')}
  var head=el('div','hint');root.appendChild(blk('status',[head],{name:tx('docs.blk.status')}));
  var ed=el('div',null,'');ed.style.border='1px solid var(--acc)';ed.style.padding='6px 10px';ed.style.margin='6px 0 10px';ed.style.borderRadius='4px';
  var edB=blk('edition',[ed],{name:tx('docs.blk.edition')});edB.hidden=true;root.appendChild(edB);
  var nf=el('div','card'),nfB=blk('missing',[nf],{name:tx('docs.blk.missing')});nfB.hidden=true;root.appendChild(nfB);
  var grid=blk('main',[],{box:'cols',name:tx('docs.blk.main')});root.appendChild(grid);

  // ---- left: set, book / PDF buttons, file list or the book's contents (narrow column; the reading card takes the rest)
  var left=card('list',[],{name:tx('docs.blk.list')});left.style.flex='1 1 14em';left.style.maxWidth='26em';grid.appendChild(left);
  var setSel=sel(tx('docs.set.label'));setSel.style.width='100%';var setB=blk('list.set',[setSel],{name:tx('docs.set.label')});left.appendChild(setB);
  var wholeBox=el('div','wholebox');wholeBox.hidden=true;wholeBox.style.margin='8px 0 4px';left.appendChild(asBlk(wholeBox,'list.whole',{name:tx('docs.whole.head')}));
  var notesBox=el('div','notesbox');notesBox.hidden=true;notesBox.style.borderTop='1px solid var(--line)';notesBox.style.margin='8px 0 4px';notesBox.style.paddingTop='4px';
  notesBox.appendChild(el('h4',null,tx('docs.notes.head')));notesBox.appendChild(el('p','hint',tx('docs.notes.what')));left.appendChild(asBlk(notesBox,'list.notes',{name:tx('docs.notes.head')}));
  var what=el('p','hint','');left.appendChild(blk('list.what',[what],{name:tx('docs.blk.what')}));
  var brow=h('div',{class:'row',blk:'list.btns'});brow.setAttribute('data-blkname',tx('docs.blk.btns'));brow.style.margin='0 0 6px';brow.style.flexWrap='wrap';left.appendChild(brow);
  var bookBtn=h('button',{type:'button',class:'primary',onclick:function(){nav({k:'book',set:D.set,ci:D.bk&&D.bk.set===D.set?D.bk.cur:0})}});bookBtn.hidden=true;brow.appendChild(bookBtn);
  var filesBtn=h('button',{type:'button',text:tx('docs.book.files'),onclick:function(){var bk=D.bk;if(bk&&bk.chapters[bk.cur])nav(alone(bk.chapters[bk.cur]))}});filesBtn.hidden=true;brow.appendChild(filesBtn);
  var pdfBtn=h('button',{type:'button',text:tx('docs.pdf.open'),onclick:function(){openPdf(D.set,pdfBtn)}});pdfBtn.hidden=true;brow.appendChild(pdfBtn);
  var filt=h('input',{type:'search',placeholder:tx('docs.filter'),'aria-label':tx('docs.filter')});filt.style.width='100%';left.appendChild(blk('list.filter',[filt],{name:tx('docs.filter')}));
  // searchKit (page.js; owner 2026-11-19: browse, indexed search and history on every search box). Index = the documents of the set
  // (or the book's chapters while a book is read), built once per list; Browse = the folder picker on the set's own folder (.md files);
  // a picked document narrows the list to it and opens it (in the book when it is a chapter of the book read now)
  var filtKit=searchKit(filt,{key:'docs.filter',index:function(s,done){hitsOf(filtItems(),s,done)},
    browse:{mode:'file',exts:['md'],start:function(){return underRoot(setDir(D.set))},toValue:function(p){return docPick(p)}},
    onPick:function(v,it,from){if(from==='browse'){var pre=setDir(D.set);filt.value=v.slice(0,pre.length)===pre?v.slice(pre.length):v;drawLeft();openRel(v,D.leftMode==='toc');return}
      filt.value=v;drawLeft();if(it&&it.ci!=null&&D.bk)nav({k:'book',set:D.bk.set,ci:it.ci});else if(it&&it.p)nav({k:'file',p:it.p,line:0})}});
  filtKit.el.style.width='100%';
  var flist=el('div','scroll');flist.style.marginTop='6px';flist.style.padding='4px';left.appendChild(blk('list.files',[flist],{name:tx('docs.blk.files')}));
  setSel.addEventListener('change',function(){useSet(setSel.value);filt.value='';if(D.mode==='book'){D.mode='files';setScope(false)}D.leftMode='';updateLeft();loadList()});
  filt.addEventListener('input',soonLeft);
  // GT-32: Enter in the filter box searches too (both boxes look like search boxes); a single match opens at once
  filt.addEventListener('keydown',function(e){if(e._sk||!isEnter(e))return;e.preventDefault();var v=String(filt.value||'').trim();if(!v)return;
    var one=D.leftMode==='toc'?flist.querySelectorAll('button[data-ci]'):flist.querySelectorAll('button[data-p]');
    if(one.length===1){one[0].click();return}sq.value=v;doSearch(v)});

  // ---- right: search + view
  var right=card('read',[],{name:tx('docs.blk.read')});right.style.flex='4 1 24em';grid.appendChild(right);
  var srow=blk('read.search',[],{box:'row','class':'row',name:tx('docs.blk.search')});right.appendChild(srow);
  var sq=h('input',{type:'search',placeholder:tx('docs.search'),'aria-label':tx('docs.search')});sq.style.width='100%';sq.style.minWidth='160px';
  var sqB=blk('read.search.q',[sq],{name:tx('docs.search')});sqB.style.flex='1 1 16em';srow.appendChild(sqB);
  // searchKit: index = the titles and headings of the documents the search covers (scope), asked once per set (/heads); Browse = the
  // folder picker on the folder the search covers (one set: its folder, the book: the book's folder, all: the document root), .md files;
  // a picked document opens (in the book when the scope is the book), a title or heading opens there, a past query searches again
  var sqKit=searchKit(sq,{key:'docs.search',index:function(s,done){scopeItems(function(a){hitsOf(a,s,done)})},
    browse:{mode:'file',exts:['md'],start:function(){var v=scope.value;return underRoot(v==='book'&&D.bk?setDir(D.bk.set):v&&v!=='all'?setDir(v):'')},toValue:function(p){return docPick(p)}},
    onPick:function(v,it,from){sq.value=v;if(from==='browse'){openRel(v,scope.value==='book');return}if(!it||!it.p){doSearch(v);return}
      var bk=D.bk,ci=it.ci!=null?it.ci:bk&&scope.value==='book'?idxOf(bk,it.p):-1;
      if(bk&&ci>=0)nav({k:'book',set:bk.set,ci:ci,line:it.line||0});else nav({k:'file',p:it.p,line:it.line||0})}});
  sqKit.el.style.width='100%';
  var scope=sel(tx('docs.search.in'));srow.appendChild(blk('read.search.in',[scope],{name:tx('docs.search.in')}));
  var notesChk=h('input',{type:'checkbox','aria-label':tx('docs.notes.search')});
  var notesLbl=h('label',{class:'notesearch'},[notesChk,document.createTextNode(' '+tx('docs.notes.search'))]);notesLbl.hidden=true;
  var notesLB=blk('read.search.notes',[notesLbl],{name:tx('docs.notes.search')});notesLB.hidden=true;srow.appendChild(notesLB);
  var go=h('button',{type:'button',class:'primary',text:tx('docs.search.go'),onclick:function(){doSearch(sq.value)}});
  var back=h('button',{type:'button',text:tx('docs.back'),onclick:goBack});back.disabled=true;
  srow.appendChild(blk('read.search.btns',[go,back],{'class':'row',name:tx('docs.blk.sbtns')}));
  // GT-32: Enter by its key name or its key code, and the search event of a search box (sent on Enter by the browser)
  sq.addEventListener('keydown',function(e){if(!e._sk&&isEnter(e)){e.preventDefault();doSearch(sq.value)}});
  sq.addEventListener('search',function(){doSearch(sq.value)});
  var crumb=el('div','hint','');crumb.style.margin='8px 0 4px';right.appendChild(blk('read.where',[crumb],{name:tx('docs.blk.where')}));
  // the document view is one leaf; contain inline-size: a long code line scrolls inside it instead of widening the column
  var view=el('div','scroll doc');view.style.padding='8px 12px';view.style.maxHeight='70vh';view.style.position='relative';view.style.contain='inline-size';
  right.appendChild(blk('read.view',[view],{name:tx('docs.blk.view')}));
  view.appendChild(el('p','hint',tx('docs.pick')));
  view.addEventListener('scroll',onScroll);

  // ---- status
  // fresh: Look again reads the folders again at once (a techdoc folder copied in a moment ago)
  function loadStatus(fresh){head.textContent=tx('docs.working');
    api('/api/x/docs/status'+(fresh===true?q({fresh:1}):'')).then(function(j){D.st=j;D.heads={};SIX={key:'',items:[]};D.loaded=true;D.bk=null;nf.textContent='';loadWhere();
      if(!j.found){head.textContent='';edB.hidden=true;grid.hidden=true;nfB.hidden=false;
        nf.appendChild(el('h3',null,tx('docs.nf.title')));nf.appendChild(el('p',null,tx('docs.nf.what')));
        nf.appendChild(el('p','hint',tx('docs.nf.tried')));var ul=el('ul');(j.tried||[]).forEach(function(t){ul.appendChild(el('li','hint',t))});nf.appendChild(ul);
        nf.appendChild(h('button',{type:'button',class:'primary',text:tx('docs.retry'),onclick:function(){loadStatus(true)}}));return}
      nfB.hidden=true;grid.hidden=false;
      ed.textContent=(j.edition==='internal'?tx('docs.ed.internal'):tx('docs.ed.public'))+(j.source?' '+tx('docs.ed.source'):'');
      ed.style.borderColor=j.edition==='internal'?'var(--acc)':'var(--line)';
      D.areas={};(j.areas||[]).forEach(function(a){D.areas[a]=1});
      D.pub={};(j.pub||[]).forEach(function(p){D.pub[p]=1});
      D.notes={};j.sets.forEach(function(s){if(s.notes)D.notes[s.id]=1});
      D.adv=advNow();
      var fb=D.part==='project'&&!D.adv;if(fb){D.part='modding';LS.set('docs.part',D.part)}   // Project Notes needs Advanced
      fillSets();
      D.mode='files';D.leftMode='';updateLeft();loadList();
      if(fb||!D.told)told(D.part);   // opened with no view (or a view it cannot show): the shell marks the part shown
      if(!D.now)openLast(false)
    },function(e){head.textContent=tx('docs.err',{m:e.message})})}
  // the set list and the search scope: the reader's documents always, the maintainers' notes under their own heading with Advanced on
  function shownSets(){var st=D.st||{};return (st.sets||[]).filter(function(s){return D.adv||!s.notes})}
  // ---- parts: the sets of the part shown; a set's part comes from the status (routes.js SETS)
  function setOf(id){return ((D.st||{}).sets||[]).filter(function(x){return x.id===id})[0]||null}
  function partOf(id){var s=setOf(id);if(s&&s.part)return s.part;for(var p in PDEF)if(PDEF[p]===id)return p;return D.part}
  function partSets(){return shownSets().filter(function(s){return s.part===D.part})}
  function scopeDef(){return D.part==='history'?'history':'all'}
  function useSet(id){D.set=id;LS.set('docs.set.'+D.part,id);setSel.value=id}
  // show another part's lists (no document opened here: the caller opens one); tell = report it to the shell
  function partTo(p,set,tell){D.part=p;LS.set('docs.part',p);if(set)D.set=set;fillSets();if(set&&D.set===set)LS.set('docs.set.'+p,set);filt.value='';D.leftMode='';loadList();if(tell)told(p)}
  function fillSets(){var st=D.st||{},n=0,ps=partSets(),hp=D.part==='history';setSel.textContent='';
    shownSets().forEach(function(s){n+=s.files});
    var gb=h('optgroup',{label:tx('docs.books.head')}),gn=h('optgroup',{label:tx('docs.notes.head')});
    ps.forEach(function(s){(s.notes?gn:gb).appendChild(h('option',{value:s.id,text:tx('docs.set.'+s.id)+' ('+s.files+')'}))});
    if(gb.children.length)setSel.appendChild(gb);if(gn.children.length)setSel.appendChild(gn);
    setB.hidden=ps.length<2;   // one set in the part: no choice to make
    var keep=scope.value,bookOpt=scope.children.length>0&&scope.children[0].value==='book';
    var so=(bookOpt?[['book',tx('docs.search.book')]]:[]).concat(hp?[]:[['all',tx('docs.set.all')]]).concat(ps.map(function(s){return [s.id,tx('docs.set.'+s.id)]}));
    opts(scope,so);scope.value=keep&&so.some(function(o){return o[0]===keep})?keep:(bookOpt?'book':scopeDef());
    var nt=D.adv&&!hp;notesBox.hidden=!(D.adv&&ps.some(function(s){return s.notes}));notesLbl.hidden=!nt;notesLB.hidden=!nt;if(!nt)notesChk.checked=false;
    edB.hidden=!D.adv||hp;head.textContent=tx('docs.at',{d:st.root,n:n});
    if(!ps.some(function(s){return s.id===D.set})){var k=LS.get('docs.set.'+D.part,''),g=ps.filter(function(s){return s.id===k})[0]||ps.filter(function(s){return !s.notes})[0]||ps[0];D.set=g?g.id:PDEF[D.part]}
    setSel.value=D.set;drawWhole();chrome()}
  // the part's last document (Back keeps the one shown before when push), else the pick hint
  // ---- searchKit data (the four search boxes): items carry lo (lower case text, made once) so a keystroke only compares strings
  function hitsOf(items,s,done){s=String(s||'').trim().toLowerCase();if(!s){done([]);return}var a=[],b=[];
    for(var i=0;i<items.length;i++){var it=items[i],k=it.lo.indexOf(s);if(k<0)continue;(k===0||it.lo.charAt(k-1)===' '?a:b).push(it)}
    var all=a.concat(b);done(all.slice(0,30),Math.max(0,all.length-30))}
  // ---- Browse (searchKit, owner 2026-11-19: "browse should always be a file directory browse"): the picker opens on the folder the
  // documents are read from on this PC (/where: real paths, asked with the status; the status line shows the home masked). A picked .md
  // under the root becomes its document path (guide/01-x.md); anything else is refused with a toast
  function loadWhere(){if(typeof RMT!=='undefined'&&RMT){D.where={};return}api('/api/x/docs/where').then(function(j){D.where=j||{}},function(){D.where={}})}
  function rootNow(){return String((D.where||{}).root||'')}
  function underRoot(rel){var r=rootNow().replace(/[\\\/]+$/,'');rel=String(rel||'').replace(/\/+$/,'');if(!r||!rel)return r;var s=/\\/.test(r)&&!/\//.test(r)?'\\':'/';return r+s+rel.split('/').join(s)}
  function docPick(p){var r=rootNow().replace(/\\/g,'/').replace(/\/+$/,''),a=String(p||'').replace(/\\/g,'/');
    if(!r||a.toLowerCase().indexOf(r.toLowerCase()+'/')!==0||!/\.md$/i.test(a)){toast(tx('docs.sk.out'));return ''}return a.slice(r.length+1)}
  // a picked document opens; in the book read now when asked and the book holds it
  function openRel(p,inBook){var bk=D.bk,ci=bk&&inBook?idxOf(bk,p):-1;if(ci>=0)nav({k:'book',set:bk.set,ci:ci});else nav({k:'file',p:p,line:0})}
  // the left list draws in the next frame while typing (one draw per frame, however fast the keys come)
  var leftPend=false;function drawLeft(){if(D.leftMode==='toc')drawToc();else drawList()}
  function soonLeft(){if(typeof requestAnimationFrame!=='function'){drawLeft();return}if(leftPend)return;leftPend=true;requestAnimationFrame(function(){leftPend=false;drawLeft()})}
  function tocItems(bk){if(bk._sk)return bk._sk;bk._sk=bk.chapters.map(function(ch,ci){return {label:ch.title,value:ch.title,hint:ch.gen?'':ch.p,group:tx('docs.part.'+bk.set+'.'+ch.part),ci:ci,p:ch.gen?'':ch.p,lo:(ch.title+' '+ch.p).toLowerCase()}});return bk._sk}
  var FIX={src:null,items:[]};
  function filtItems(){var toc=D.leftMode==='toc'&&D.bk,src=toc?D.bk:D.files;if(FIX.src===src)return FIX.items;var pre=setDir(D.set);
    FIX={src:src,items:toc?tocItems(D.bk):D.files.map(function(x){var name=x.p.slice(0,pre.length)===pre?x.p.slice(pre.length):x.p,i=name.lastIndexOf('/');
      return {label:name,value:name,hint:x.kb+' KB',group:i>0?name.slice(0,i):tx('docs.set.'+D.set),p:x.p,lo:x.p.toLowerCase()}})};
    return FIX.items}
  // the main search box: titles and headings of every set the search covers, one /heads call per set, kept until the status is read again
  function headSets(){var v=scope.value;if(v==='book')return D.bk?[D.bk.set]:[];if(v&&v!=='all')return [v];
    var nt=D.adv&&notesChk.checked;return shownSets().filter(function(s){return nt||!s.notes}).map(function(s){return s.id})}
  function headsOf(id,cb){var x=D.heads[id];if(x&&x.items){cb(x.items);return}if(x){x.wait.push(cb);return}
    x=D.heads[id]={items:null,wait:[cb]};
    function fin(its){x.items=its;var w=x.wait;x.wait=[];w.forEach(function(f){f(its)})}
    api('/api/x/docs/heads'+q({set:id})).then(function(j){var nm=tx('docs.set.'+id),its=[];
      (j.files||[]).forEach(function(f){its.push({label:f.t,value:f.t,hint:f.p,group:nm,p:f.p,line:0,file:1,lo:(f.t+' '+f.p).toLowerCase()})});
      (j.heads||[]).forEach(function(hd){if(hd.v>1)its.push({label:hd.t,value:hd.t,hint:hd.p+':'+hd.l,group:nm,p:hd.p,line:hd.l,lo:hd.t.toLowerCase()})});
      fin(its)},function(){delete D.heads[id];fin([])})}
  var SIX={key:'',items:[]};
  function scopeItems(cb){var ids=headSets(),key=ids.join('|')+'|'+(D.adv?1:0),n=ids.length,got={};if(SIX.key===key){cb(SIX.items);return}if(!n){cb([]);return}
    ids.forEach(function(id){headsOf(id,function(a){got[id]=a;if(--n)return;var all=[];ids.forEach(function(i){all=all.concat(got[i])});
      if(!D.adv)all=all.filter(function(it){return D.pub[it.p]});SIX={key:key,items:all};cb(all)})})}
  function pick(){view.textContent='';view.scrollTop=0;D.hit=null;view.appendChild(el('p','hint',tx('docs.pick')));crumb.textContent=''}
  function openLast(push){var last=LS.get('docs.last.'+D.part,'');
    if(push&&D.now){D.hist.push(D.now);if(D.hist.length>60)D.hist.shift()}
    if(last===SRCIDX){if(D.part==='history'){run({k:'hindex'});return}last=''}
    if(last&&(D.adv||D.pub[last])){run({k:'file',p:last,line:0,last:true});return}
    D.now=null;D.cur='';D.frame=null;back.disabled=!D.hist.length;D.mode='files';setScope(false);updateLeft();markCur();markWhole();pick()}
  // ---- whole documents: one button per document here; with Advanced on, a line per missing one with the command that makes it.
  // A public edition without the engine document (no chapters, no whole file): one line naming its separate download, and Look again.
  function wholeOf(id){var w=(D.st||{}).whole||[];for(var i=0;i<w.length;i++)if(w[i].id===id)return w[i];return null}
  function engineGet(){var st=D.st||{};return st.edition==='public'&&!wholeOf('engine')&&!(st.books||{}).engine}
  // the buttons of the part shown (the atlas and the guide under Modding, the engine document under Engine)
  function inPart(x){return x.part===D.part}
  function drawWhole(){var st=D.st||{},w=(st.whole||[]).filter(inPart),ab=(st.wholeAbsent||[]).filter(function(a){return (a.make||a.refused)&&inPart(a)}),eg=D.part==='engine'&&engineGet();wholeBox.textContent='';
    var show=w.length>0||eg||(D.adv&&ab.length>0);wholeBox.hidden=!show;if(!show)return;
    wholeBox.appendChild(el('h4',null,tx('docs.whole.head')));
    if(w.length){wholeBox.appendChild(el('p','hint',tx('docs.whole.what')));var row=el('div','row');row.style.flexWrap='wrap';
      w.forEach(function(x){var b=h('button',{type:'button',text:tx('docs.whole.'+x.id),title:x.name+(x.ver?', '+x.ver:'')+' ('+x.kb+' KB)',onclick:function(){nav({k:'whole',id:x.id})}});b.dataset.whole=x.id;row.appendChild(b)});
      wholeBox.appendChild(row)}
    if(eg){var gp=el('p','hint',tx('docs.whole.engine.get'));gp.dataset.engine='get';wholeBox.appendChild(gp);
      wholeBox.appendChild(h('button',{type:'button','data-go':'eagain',text:tx('docs.retry'),onclick:function(){loadStatus(true)}}))}
    if(D.adv)ab.forEach(function(a){var p=el('p','hint',a.refused?tx('docs.whole.refused',{t:tx('docs.whole.'+a.id),m:a.refused}):tx('docs.whole.absent',{t:tx('docs.whole.'+a.id),c:a.make}));p.dataset.absent=a.id;wholeBox.appendChild(p)});
    markWhole()}
  function markWhole(){var id=D.now&&D.now.k==='whole'?D.now.id:'',bs=wholeBox.querySelectorAll?wholeBox.querySelectorAll('button'):[];for(var i=0;i<bs.length;i++)bs[i].style.fontWeight=bs[i].dataset.whole===id?'bold':''}
  // the GUI's theme for the frame: light or dark when the header switch says so; none = the document follows the system like the page
  function themeNow(){var t=LS.get('theme','auto');return t==='light'||t==='dark'?t:''}
  function wholeSrc(id,th){return '/api/x/docs/whole'+q({id:id,theme:th})}
  function pdfHint(id,p){return tx(id==='engine'?'docs.pdf.hint.engine':'docs.pdf.hint',{f:p.name,n:p.kb})}
  // the document in a frame: the server sends it under the CSP sandbox header (gui.js rawHead), so it has its own opaque origin here and
  // in a tab. No sandbox attribute on the frame: some embedded browsers refuse to load a frame that has one. It scrolls inside the
  // reading card. Beside it: open in a new tab (same address, same sandbox), the PDF (guide, engine), and how to find words in it.
  function openWhole(s){var x=wholeOf(s.id);D.cur='';D.hit=null;markCur();view.textContent='';view.scrollTop=0;
    if(!x){crumb.textContent='';view.appendChild(el('p','hint',tx('docs.whole.gone')));markWhole();return}
    var th=themeNow(),src=wholeSrc(x.id,th),name=tx('docs.whole.'+x.id);
    crumb.textContent=x.ver?tx('docs.whole.where',{t:name,v:x.ver}):name;
    crumb.appendChild(document.createTextNode('  \u00b7  '));
    crumb.appendChild(h('a',{href:src,target:'_blank',rel:'noopener noreferrer','data-go':'wtab',text:tx('docs.whole.tab'),title:x.name}));
    if(x.pdf){var pb=h('button',{type:'button',class:'link','data-go':'wpdf',text:tx('docs.pdf.open'),title:pdfHint(x.id,x.pdf),onclick:function(){openPdf(x.id,pb)}});crumb.appendChild(document.createTextNode('  \u00b7  '));crumb.appendChild(pb)}
    crumb.appendChild(el('div','hint',tx('docs.whole.find')));
    var fr=h('iframe',{src:src,referrerpolicy:'no-referrer',title:tx('docs.whole.frame',{t:name}),class:'wholedoc'});
    fr.style.width='100%';fr.style.height='calc(70vh - 24px)';fr.style.border='0';fr.style.display='block';
    view.appendChild(fr);D.frame={el:fr,id:x.id,th:th};markWhole()}
  // a theme change from the header switch: the open document comes again in the new theme (its scroll place is not kept)
  if(typeof onTheme==='function')onTheme(function(){var f=D.frame;if(!f||!D.now||D.now.k!=='whole'||f.el.parentNode!==view||themeNow()===f.th)return;openWhole(D.now)},'docs.whole');
  function pubState(s){return !s||s.k==='whole'||s.k==='hindex'||s.k==='book'||s.k==='bsearch'||(s.k==='search'&&!s.notes&&!D.notes[s.set])||(s.k==='file'&&!!D.pub[s.p])}
  // the switch changed (header box, Ctrl+K, or seen when the page shows again): redraw lists and links, leave a notes page
  // Advanced off on Project Notes: the page falls back to Modding (its last document) and tells the shell
  function syncAdv(){var a=advNow();if(!D.st||!D.st.found||a===D.adv)return;D.adv=a;
    var fb=!a&&D.part==='project';if(fb){D.part='modding';LS.set('docs.part',D.part)}
    fillSets();
    if(!a){D.hist=D.hist.filter(pubState);if(!pubState(D.now)){D.now=null;D.cur='';pick()}}
    back.disabled=!D.hist.length;D.bk=null;D.leftMode='';
    if(fb)told(D.part);
    if(D.now){var s=D.now;D.now=null;run(s)}else if(fb)openLast(false);else{D.mode='files';setScope(false);updateLeft()}
    loadList()}
  if(document&&document.addEventListener)document.addEventListener('change',function(e){var t=e&&e.target,pn=t&&t.parentNode;if(pn&&pn.getAttribute&&pn.getAttribute('id')==='advbox')syncAdv()});

  // ---- left side: buttons, then the file list (single files) or the contents (book)
  // Historical Sources with no pages (a release): the Source index alone, so no book button that would show the same one page
  function noHistPages(){var s=((D.st||{}).sets||[]).filter(function(x){return x.id==='history'})[0];return !s||!s.files}
  function updateLeft(){var st=D.st||{},books=st.books||{},isB=D.mode==='book'&&!!D.bk;
    bookBtn.hidden=!books[D.set]||isB||(D.set==='history'&&noHistPages());if(books[D.set])bookBtn.textContent=tx('docs.book.'+D.set);
    filesBtn.hidden=!isB;
    var pf=(st.pdfs||{})[D.set]||(D.set==='guide'?st.pdf:null);pdfBtn.hidden=!pf;if(pf)pdfBtn.setAttribute('title',pdfHint(D.set,pf));
    // the engine set's description follows the edition: the public document (separate download) or the project's own
    what.textContent=isB?tx('docs.book.what'):D.set==='engine'&&st.edition==='public'?tx('docs.what.engine.public'):tx('docs.what.'+D.set);
    var lm=isB?'toc':'files';filt.setAttribute('placeholder',tx(isB?'docs.filter.toc':'docs.filter'));
    if(lm!==D.leftMode||lm==='toc'){if(lm!==D.leftMode)filt.value='';D.leftMode=lm;if(lm==='toc')drawToc();else drawList()}}
  function loadList(){var set=D.set;
    api('/api/x/docs/list'+q({set:set})).then(function(j){if(set!==D.set)return;D.files=j.files||[];if(D.leftMode!=='toc')drawList()},fail)}
  function setDir(id){var s=((D.st||{}).sets||[]).filter(function(x){return x.id===id})[0];return s&&s.dir?s.dir+'/':''}
  function drawList(){flist.textContent='';var f=String(filt.value||'').trim().toLowerCase(),n=0,more=0,pre=setDir(D.set);
    D.files.forEach(function(x){if(f&&(x.lo||(x.lo=x.p.toLowerCase())).indexOf(f)<0)return;if(n>=MAXLIST){more++;return}n++;
      var name=x.p.slice(0,pre.length)===pre?x.p.slice(pre.length):x.p;
      var b=block(h('button',{type:'button',class:'link',text:name,title:x.p+' ('+x.kb+' KB)',onclick:function(){nav({k:'file',p:x.p,line:0})}}));
      b.dataset.p=x.p;if(x.p===D.cur)b.style.fontWeight='bold';flist.appendChild(b)});
    if(D.set==='history'){   // the pages (source tree only), then the generated Source index; with no pages the index alone
      var sx=block(h('button',{type:'button',class:'link',text:tx('docs.srcidx.title'),onclick:function(){nav({k:'hindex'})}}));sx.dataset.p=SRCIDX;if(D.cur===SRCIDX)sx.style.fontWeight='bold';flist.appendChild(sx);n++}
    if(!n)flist.appendChild(el('p','hint',tx('docs.files.none')));
    if(more)flist.appendChild(el('p','hint',tx('docs.files.more',{n:more})))}
  function markCur(){var bs=flist.children;for(var i=0;i<bs.length;i++)if(bs[i].dataset&&bs[i].dataset.p)bs[i].style.fontWeight=bs[i].dataset.p===D.cur?'bold':''}
  // contents by part and chapter; the chapter being read is bold and shows its sections
  function drawToc(){var bk=D.bk;flist.textContent='';if(!bk)return;var f=String(filt.value||'').trim().toLowerCase();
    bk.parts.forEach(function(pt){var box=el('div'),any=false,ph=el('div',null,tx('docs.part.'+bk.set+'.'+pt));ph.style.fontWeight='bold';ph.style.margin='6px 0 2px';box.appendChild(ph);box.dataset.part=pt;
      bk.chapters.forEach(function(ch,ci){if(ch.part!==pt)return;if(f&&ch.title.toLowerCase().indexOf(f)<0&&ch.p.toLowerCase().indexOf(f)<0)return;any=true;
        var b=block(h('button',{type:'button',class:'link',text:ch.title,title:ch.p,onclick:function(){nav({k:'book',set:bk.set,ci:ci})}}));
        b.dataset.ci=String(ci);b.style.paddingLeft='8px';if(ci===bk.cur)b.style.fontWeight='bold';box.appendChild(b);
        if(ci===bk.cur&&bk.heads[ci])bk.heads[ci].forEach(function(hd){if(hd.lv!==2)return;
          var s=block(h('button',{type:'button',class:'link',text:hd.text,onclick:function(){nav({k:'book',set:bk.set,ci:ci,slug:hd.slug})}}));
          s.style.paddingLeft='20px';s.style.fontSize='90%';s.dataset.head=hd.slug;box.appendChild(s)})});
      if(any)flist.appendChild(box)});
    if(!flist.children.length)flist.appendChild(el('p','hint',tx('docs.files.none')))}
  function setScope(b){var has=scope.children.length>0&&scope.children[0].value==='book';
    if(b&&!has){scope.insertBefore(h('option',{value:'book',text:tx('docs.search.book')}),scope.firstChild||null);scope.value='book'}
    else if(b)scope.value='book';
    else if(has){scope.removeChild(scope.children[0]);if(!scope.value||scope.value==='book')scope.value=scopeDef()}}

  // ---- navigation with a Back stack. state: {k:'file',p,line,from,slug} {k:'search',q,set} {k:'book',set,ci,line,slug} {k:'bsearch',set,q} {k:'whole',id}
  function nav(s,quiet){syncAdv();if(D.now&&!quiet)D.hist.push(D.now);if(D.hist.length>60)D.hist.shift();run(s)}
  function goBack(){var s=D.hist.pop();if(s)run(s);back.disabled=!D.hist.length}
  // the part a state belongs to, where it is known before loading ('' = a file: openFile learns its set; a search over all = its own part)
  function statePart(s){if(s.k==='book'||s.k==='bsearch')return partOf(s.set);if(s.k==='hindex')return 'history';
    if(s.k==='whole'){var x=wholeOf(s.id);return x&&x.part||''}
    if(s.k==='search')return s.part||(s.set&&s.set!=='all'?partOf(s.set):'');return ''}
  function run(s){D.now=s;D.frame=null;back.disabled=!D.hist.length;D.mode=s.k==='book'||s.k==='bsearch'?'book':'files';
    var sp=statePart(s);if(sp&&sp!==D.part&&(sp!=='project'||D.adv))partTo(sp,s.k==='book'||s.k==='bsearch'||(s.k==='search'&&s.set!=='all')?s.set:s.k==='hindex'?'history':'',true);
    if(D.mode==='files'){setScope(false);updateLeft()}
    markWhole();
    if(s.k==='whole')openWhole(s);else if(s.k==='search')runSearch(s);else if(s.k==='book')openBook(s);else if(s.k==='bsearch')runBookSearch(s);else if(s.k==='hindex')openIndex(s);else openFile(s)}
  // the Source index alone (from the list, or "open alone" at the end of the history book)
  function openIndex(s){D.cur=SRCIDX;LS.set('docs.last.history',SRCIDX);
    if(D.set!=='history'){useSet('history');filt.value='';updateLeft();loadList()}else markCur();
    view.textContent='';view.scrollTop=0;D.hit=null;crumb.textContent=tx('docs.set.history')+'  \u00b7  '+tx('docs.srcidx.title');
    view.appendChild(el('h2',null,tx('docs.srcidx.title')));sourceIndex(view)}
  // the page stays as it was: the state before this one comes back from the Back stack
  function stay(s,keep){crumb.textContent=keep;if(D.now===s){D.now=D.hist.pop()||null;back.disabled=!D.hist.length;if(D.now){D.mode=D.now.k==='book'||D.now.k==='bsearch'?'book':'files';setScope(D.mode==='book');updateLeft()}}}
  function notesOff(s,keep){toast(tx('docs.notes.off'));stay(s,keep)}
  function openFile(s){var keep=crumb.textContent;crumb.textContent=tx('docs.working');
    api('/api/x/docs/file'+q({p:s.p,from:s.from,line:s.line})).then(function(j){
      if(!j.found){loadStatus();return}
      if(D.now!==s)return;
      if(!D.adv&&!D.pub[j.p]){notesOff(s,keep);return}   // a link resolved into the maintainers' notes: not with Advanced off
      // the file's part: kept as that part's last document; a file of another part (a link, a search hit) moves the page there
      var pj=partOf(j.set);s.p=j.p;s.from='';D.cur=j.p;LS.set('docs.last.'+pj,j.p);LS.set('docs.set.'+pj,j.set);
      if(pj!==D.part){partTo(pj,j.set,true);updateLeft()}
      else if(j.set!==D.set){useSet(j.set);filt.value='';updateLeft();loadList()}else markCur();
      drawDoc(j,s.slug)},function(e){toast(tx('docs.nolink',{t:s.p}));var lk='docs.last.'+D.part;if(LS.get(lk,'')===s.p)LS.set(lk,'');
      if(s.last){if(D.now===s){D.now=null;pick()}return}   // the part's last document is gone: the pick hint, not the state before
      stay(s,keep)})}

  // ---- search (a limits ID jumps straight to its row; in a book the search covers the book)
  function doSearch(v){v=String(v||'').trim();if(!v)return;
    syncAdv();var nt=D.adv&&notesChk.checked?1:0;
    var key=scope.value+'|'+nt+'|'+v,now=Date.now();if(key===D.lastQ&&now-D.lastAt<400)return;D.lastQ=key;D.lastAt=now;
    if(scope.value==='book'&&D.bk){nav({k:'bsearch',set:D.bk.set,q:v});return}
    var m=LIMRX.exec(v),srch={k:'search',q:v,set:scope.value,notes:nt,part:D.part};
    if(D.adv&&m&&D.areas[m[1].toUpperCase()]){openLimit(v,function(){nav(srch)});return}   // limits rows are maintainer notes
    nav(srch)}
  function openLimit(id,miss){if(!advNow()){toast(tx('docs.notes.off'));return}
    api('/api/x/docs/limit'+q({id:id})).then(function(j){
      if(j.found)nav({k:'file',p:j.p,line:j.line});else if(miss)miss();else toast(tx('docs.nolimit',{id:id}))},fail)}
  function runSearch(s){crumb.textContent=tx('docs.working');sq.value=s.q;
    api('/api/x/docs/search'+q({q:s.q,set:s.set,notes:s.notes?'1':''}),undefined,wn('docs.search.go')).then(function(j){if(D.now!==s)return;view.textContent='';view.scrollTop=0;
      if(!j.found){loadStatus();return}
      if(!j.total){crumb.textContent=tx('docs.search.none',{q:j.q});return}
      crumb.textContent=tx('docs.search.sum',{n:j.total,q:j.q,f:j.hitFiles,t:j.files})+(j.more?' '+tx('docs.search.more',{n:j.rows.length}):'');
      j.rows.forEach(function(r){var d=el('div','dl');d.style.padding='2px 0';d.style.borderBottom='1px solid var(--line)';
        var b=h('button',{type:'button',class:'link',text:r.p+(r.line?':'+r.line:''),onclick:function(){nav({k:'file',p:r.p,line:r.line})}});d.appendChild(b);
        if(r.kind!=='text')d.appendChild(el('span','badge',tx('docs.kind.'+r.kind)));
        if(r.kind!=='file'){d.appendChild(document.createTextNode(' '));d.appendChild(el('span',null,r.text))}
        view.appendChild(d)})
    },function(e){crumb.textContent=errT(e)})}

  // ---- book: outline once, chapters drawn on demand (the one being read and its neighbours)
  function loadBook(set){if(D.bk&&D.bk.set===set)return Promise.resolve(D.bk);
    return api('/api/x/docs/book'+q({set:set})).then(function(j){if(!j.found){loadStatus();throw new Error(tx('docs.nf.title'))}
      (j.chapters||[]).forEach(function(ch){if(ch.gen)ch.title=tx('docs.srcidx.title')});
      var bk={set:set,chapters:j.chapters||[],parts:j.parts||[],secs:[],done:{},pend:{},heads:{},marks:{},cur:0,wrap:el('div','book')};
      bk.chapters.forEach(function(ch,ci){var sec=h('section',{class:'chap','data-ci':String(ci)});holder(sec,ch);bk.secs.push(sec);bk.wrap.appendChild(sec)});
      D.bk=bk;return bk})}
  function holder(sec,ch){sec.textContent='';sec.appendChild(el('h2',null,ch.title));sec.appendChild(el('p','hint',tx('docs.book.loading')));sec.style.minHeight=Math.min(ch.kb*160,40000)+'px'}
  function alone(ch){return ch.gen?{k:'hindex'}:{k:'file',p:ch.p,line:0}}
  function idxOf(bk,p){for(var i=0;i<bk.chapters.length;i++)if(bk.chapters[i].p===p)return i;return -1}
  function openBook(s){crumb.textContent=tx('docs.working');
    loadBook(s.set).then(function(bk){if(D.now!==s)return;
      if(D.set!==bk.set){useSet(bk.set);loadList()}
      setScope(true);
      if(!bk.chapters.length){view.textContent='';view.appendChild(el('p','hint',tx('docs.book.empty')));crumb.textContent='';updateLeft();return}
      if(view.firstChild!==bk.wrap){view.textContent='';view.appendChild(bk.wrap)}
      var ci=Math.max(0,Math.min(bk.chapters.length-1,+s.ci||0));setCur(ci);
      return around(ci).then(function(){if(D.now===s&&D.bk===bk)jump(ci,+s.line||0,s.slug||'')})
    }).catch(function(e){crumb.textContent=tx('docs.err',{m:e.message})})}
  function around(ci){var bk=D.bk,l=[];[ci,ci+1,ci-1].forEach(function(i){if(i>=0&&i<bk.chapters.length)l.push(render(i))});return Promise.all(l)}
  function render(ci){var bk=D.bk;if(bk.done[ci])return Promise.resolve();if(bk.pend[ci])return bk.pend[ci];
    var ch=bk.chapters[ci],sec=bk.secs[ci];
    if(ch.gen){sec.textContent='';sec.style.minHeight='';sec.appendChild(el('h2',null,ch.title));sourceIndex(sec);bk.heads[ci]=[];bk.marks[ci]=[];sec.appendChild(chapterEnd(bk,ci));bk.done[ci]=true;return Promise.resolve()}
    bk.pend[ci]=api('/api/x/docs/file'+q({p:ch.p})).then(function(j){if(D.bk!==bk)return;
      var above=ci<bk.cur&&view.firstChild===bk.wrap,h0=above?(sec.offsetHeight||0):0;
      sec.textContent='';sec.style.minHeight='';
      if(j.truncated)sec.appendChild(el('p','err',tx('docs.trunc')));
      var r=renderMd(sec,j.text,j.p,j.kids||{});bk.heads[ci]=r.heads;bk.marks[ci]=r.marks;
      sec.appendChild(chapterEnd(bk,ci));bk.done[ci]=true;
      if(above){var d=(sec.offsetHeight||0)-h0;if(d)view.scrollTop=(view.scrollTop||0)+d}   // keep the reader's place when a chapter above grows
      if(ci===bk.cur&&D.mode==='book')updateLeft()
    },function(e){bk.pend[ci]=null;sec.appendChild(el('p','err',tx('docs.err',{m:e.message})))});
    return bk.pend[ci]}
  function chapterEnd(bk,ci){var f=el('div','row chapend');f.style.borderTop='1px solid var(--line)';f.style.margin='14px 0 22px';f.style.paddingTop='6px';f.style.flexWrap='wrap';
    if(ci>0)f.appendChild(h('button',{type:'button','data-go':'prev',text:tx('docs.book.prev',{t:bk.chapters[ci-1].title}),onclick:function(){nav({k:'book',set:bk.set,ci:ci-1})}}));
    if(ci<bk.chapters.length-1)f.appendChild(h('button',{type:'button','data-go':'next',text:tx('docs.book.next',{t:bk.chapters[ci+1].title}),onclick:function(){nav({k:'book',set:bk.set,ci:ci+1})}}));
    f.appendChild(h('button',{type:'button',class:'link','data-go':'alone',text:tx('docs.book.alone'),onclick:function(){nav(alone(bk.chapters[ci]))}}));
    return f}
  function clearHit(){if(D.hit){D.hit.classList.remove('hit');D.hit=null}}
  function findSlug(heads,slug){var w=String(slug||'').toLowerCase();try{w=decodeURIComponent(w)}catch(e){}
    var i,loose=function(x){try{return x.replace(/[^\p{L}\p{N}]+/gu,'')}catch(e){return x.replace(/[^a-z0-9]+/g,'')}};
    for(i=0;i<(heads||[]).length;i++)if(heads[i].slug===w)return heads[i].el;
    for(i=0;i<(heads||[]).length;i++)if(loose(heads[i].slug)===loose(w))return heads[i].el;   // an anchor written with a dot or a slash kept
    return null}
  function jump(ci,line,slug){var bk=D.bk,t=null;clearHit();
    if(line)(bk.marks[ci]||[]).some(function(m){if(line>=m.a&&line<=m.b){t=m.el;return true}return false});
    if(!t&&slug)t=findSlug(bk.heads[ci],slug);
    if(t){t.classList.add('hit');D.hit=t}
    try{(t||bk.secs[ci]).scrollIntoView({block:line?'center':'start'})}catch(e){}
    setCur(ci)}
  function setCur(ci){var bk=D.bk;bk.cur=ci;if(D.now&&D.now.k==='book')D.now.ci=ci;
    crumb.textContent=tx('docs.book.where',{b:tx('docs.set.'+bk.set),n:ci+1,t:bk.chapters.length,c:bk.chapters[ci].title});updateLeft()}
  // the contents follow the reader: the chapter at the top of the view is the current one; it and its neighbours get drawn
  function onScroll(){var bk=D.bk;if(D.mode!=='book'||!bk||view.firstChild!==bk.wrap)return;
    var y=(view.scrollTop||0)+40,ci=0;for(var i=0;i<bk.secs.length;i++){if((bk.secs[i].offsetTop||0)<=y)ci=i;else break}
    if(ci!==bk.cur){setCur(ci);around(ci)}}
  function runBookSearch(s){crumb.textContent=tx('docs.working');sq.value=s.q;
    loadBook(s.set).then(function(bk){if(D.now!==s)return;setScope(true);updateLeft();
      return api('/api/x/docs/booksearch'+q({set:s.set,q:s.q}),undefined,wn('docs.search.go')).then(function(j){if(D.now!==s)return;view.textContent='';view.scrollTop=0;
        if(!j.found){loadStatus();return}
        if(!j.total){crumb.textContent=tx('docs.search.none',{q:j.q});return}
        var shown=0;j.groups.forEach(function(g){shown+=g.hits.length});
        crumb.textContent=tx('docs.bsearch.sum',{n:j.total,q:j.q,c:j.chapters})+(j.more?' '+tx('docs.search.more',{n:shown}):'');
        j.groups.forEach(function(g){var box=el('div','bgroup');box.dataset.part=g.part;box.appendChild(el('h3',null,tx('docs.part.'+s.set+'.'+g.part)+' ('+g.hits.length+')'));
          g.hits.forEach(function(r){var ci=idxOf(bk,r.p),d=el('div','dl');d.style.padding='2px 0';d.style.borderBottom='1px solid var(--line)';
            d.appendChild(h('button',{type:'button',class:'link',text:r.title+'  \u00b7  '+tx('docs.line',{n:r.line}),onclick:function(){if(ci>=0)nav({k:'book',set:s.set,ci:ci,line:r.line});else nav({k:'file',p:r.p,line:r.line})}}));
            if(r.kind==='heading')d.appendChild(el('span','badge',tx('docs.kind.heading')));
            d.appendChild(document.createTextNode(' '));d.appendChild(el('span',null,r.text));box.appendChild(d)});
          view.appendChild(box)})})
    }).catch(function(e){crumb.textContent=errT(e)})}
  function openPdf(set,b){b=b||pdfBtn;b.disabled=true;
    api('/api/x/docs/pdf',set==='engine'?{set:'engine'}:{}).then(function(){b.disabled=false;toast(tx('docs.pdf.opened'))},function(){b.disabled=false;toast(tx(set==='engine'?'docs.pdf.fail.engine':'docs.pdf.fail'))})}

  // ---- Source index: the guide index data that ships with the program, by site and by year, searchable, paged; a row opens its
  // web page in a new browser tab (the same way as every web link here) and, when the index saved its text, reads that text here
  function sourceIndex(box){var S={group:'',q:'',offset:0},hs=(D.st||{}).history||{};
    var wrap=el('div','srcidx');box.appendChild(wrap);
    if(!hs.ok){wrap.appendChild(el('p','hint',tx('docs.srcidx.none',{m:hs.why||''})));return wrap}
    var ww2=hs.ww2==='full'||hs.ww2==='list'||hs.ww2==='parts';
    if(!ww2&&!(D.st||{}).source)wrap.appendChild(el('p','hint',tx('docs.srcidx.noww2')));
    if(!hs.rows){wrap.appendChild(el('p','hint',tx('docs.srcidx.zero')));return wrap}
    wrap.appendChild(el('p','hint',tx(ww2?'docs.srcidx.what.ww2':'docs.srcidx.what',{n:hs.rows||0})+(hs.built?' '+tx('docs.srcidx.built',{d:hs.built}):'')));
    if(ww2)pageSearch(wrap,hs);
    var gbox=el('div','srcgroups');wrap.appendChild(gbox);
    var srow=el('div','row');srow.style.flexWrap='wrap';wrap.appendChild(srow);
    var hq=h('input',{type:'search',placeholder:tx('docs.srcidx.search'),'aria-label':tx('docs.srcidx.search')});hq.style.flex='1';hq.style.minWidth='160px';srow.appendChild(hq);
    var hgo=h('button',{type:'button',text:tx('docs.search.go'),onclick:function(){S.q=String(hq.value||'').trim();S.offset=0;rows()}});srow.appendChild(hgo);
    // searchKit: index = the groups (topic, nation, type, year...) and the sources by title (/history/titles, once); Browse = the folder
    // picker on the folder the sources are read from (srcBrowse); a group filters the list, a title, a picked file's name or a past query
    // searches for it
    var GR=[];function grItems(){return GR.map(function(g){var k=String(g.kind||'');return {label:g.title+' ('+g.count+')',value:g.title,hint:kindName(k),gid:g.id,lo:(g.title+' '+k).toLowerCase()}})}
    var hqKit=searchKit(hq,{key:'docs.srcidx.q',index:function(s,done){histTitles(function(t){hitsOf(grItems().concat(t),s,done)})},browse:srcBrowse,
      onPick:function(v,it){if(it&&it.gid!=null){hq.value='';S.q='';pick(it.gid);return}hq.value=v;S.q=String(v).trim();S.offset=0;rows()}});
    hqKit.el.style.flex='1';
    hq.addEventListener('keydown',function(e){if(!e._sk&&isEnter(e)){e.preventDefault();hgo.click()}});
    var info=el('div','hint','');info.style.margin='6px 0';wrap.appendChild(info);
    var list=el('div','srclist');wrap.appendChild(list);
    var pager=el('div','row');pager.style.margin='6px 0';wrap.appendChild(pager);
    var prev=h('button',{type:'button','data-go':'hprev',text:tx('docs.srcidx.prev'),onclick:function(){S.offset=Math.max(0,S.offset-HPAGE);rows()}});
    var next=h('button',{type:'button','data-go':'hnext',text:tx('docs.srcidx.next'),onclick:function(){S.offset+=HPAGE;rows()}});pager.appendChild(prev);pager.appendChild(next);
    var reader=el('div','srcread');reader.hidden=true;wrap.appendChild(reader);
    function pick(id){S.group=id;S.offset=0;all(gbox,function(b){b.style.fontWeight=b.dataset.g===id?'bold':''});rows()}
    function all(n,f){var bs=n.querySelectorAll?n.querySelectorAll('button'):[];for(var i=0;i<bs.length;i++)f(bs[i])}
    api('/api/x/docs/history/groups',{}).then(function(j){gbox.textContent='';GR=j.ok?(j.groups||[]):[];hqKit.refresh();
      if(!j.ok){gbox.appendChild(el('p','hint',tx('docs.srcidx.none',{m:j.why||''})));return}
      var any=block(h('button',{type:'button',class:'link',text:tx('docs.srcidx.all'),onclick:function(){pick('')}}));any.dataset.g='';any.style.fontWeight='bold';gbox.appendChild(any);
      // every kind groups() returns, known kinds first with their own label; any other kind under its own name
      var KN={hand:'docs.srcidx.by.hand',topic:'docs.srcidx.by.topic',sub:'docs.srcidx.by.sub',site:'docs.srcidx.by.site',year:'docs.srcidx.by.year',lang:'docs.srcidx.by.lang',
        nation:'docs.srcidx.by.nation',access:'docs.srcidx.by.access',type:'docs.srcidx.by.type',issuer:'docs.srcidx.by.issuer'},kinds=['hand','topic','sub','nation','type','issuer','access','site','year','lang'];
      (j.groups||[]).forEach(function(g){var k=String(g.kind||'');if(k&&kinds.indexOf(k)<0)kinds.push(k)});
      kinds.forEach(function(kind){var gs=(j.groups||[]).filter(function(g){return g.kind===kind});if(!gs.length)return;
        var line=el('div','dl');line.dataset.kind=kind;line.appendChild(el('b',null,(KN[kind]?tx(KN[kind]):kind+':')+' '));
        gs.forEach(function(g){var b=h('button',{type:'button',class:'link',text:g.title+' ('+g.count+')',title:g.from&&g.to?g.from+' .. '+g.to:g.title,onclick:function(){pick(g.id)}});b.dataset.g=g.id;b.style.marginRight='10px';line.appendChild(b)});
        gbox.appendChild(line)})},fail);
    function rows(){info.textContent=tx('docs.working');reader.hidden=true;list.hidden=false;pager.hidden=false;
      api('/api/x/docs/history/rows',{group:S.group,q:S.q,offset:S.offset,limit:HPAGE},wn('docs.srcidx.title')).then(function(j){list.textContent='';
        if(!j.ok){info.textContent=tx('docs.srcidx.none',{m:j.why||''});return}
        var a=j.total?S.offset+1:0,b=Math.min(j.total,S.offset+j.rows.length);
        info.textContent=j.total?tx('docs.srcidx.range',{a:a,b:b,n:j.total}):tx('docs.srcidx.empty');
        prev.disabled=S.offset<=0;next.disabled=b>=j.total;
        j.rows.forEach(function(r){var d=el('div','dl srcrow');d.style.padding='2px 0';d.style.borderBottom='1px solid var(--line)';d.dataset.id=r.id;
          var u=r.url||r.archive;
          if(u)d.appendChild(h('a',{href:u,target:'_blank',rel:'noopener noreferrer',text:r.title,title:u}));else d.appendChild(el('span',null,r.title));
          if(r.hand){d.appendChild(document.createTextNode(' '));d.appendChild(el('span','badge',tx(r.hand==='first'?'docs.srcidx.hand.first':'docs.srcidx.hand.second')))}
          if(r.kind){d.appendChild(document.createTextNode(' '));d.appendChild(el('span','badge',r.kind))}
          // row meta: nation, topic, then what tells documents apart (designation, issuer, year, pages, the source it belongs to)
          var meta=[r.nation,r.topic,r.designation,r.issuer,r.year,r.pages?tx('docs.srcidx.npages',{n:r.pages}):'',r.parentTitle?tx('docs.srcidx.partof',{t:r.parentTitle}):'',
            r.rec==='index'||!r.rec?r.site:'',r.captured?tx('docs.srcidx.captured',{d:r.captured}):'',r.lang].filter(Boolean).join('  \u00b7  ');
          if(meta){d.appendChild(document.createTextNode('  '));d.appendChild(el('span','hint',meta))}
          if(r.archive&&r.url){d.appendChild(document.createTextNode('  '));d.appendChild(h('a',{href:r.archive,target:'_blank',rel:'noopener noreferrer',text:tx('docs.srcidx.archive'),title:r.archive}))}
          if(r.hasText){d.appendChild(document.createTextNode('  '));d.appendChild(h('button',{type:'button',class:'link','data-go':'htext',text:tx('docs.srcidx.saved'),onclick:function(){readText(r)}}))}
          list.appendChild(d)})
      },function(e){info.textContent=errT(e)})}
    function readText(r){info.textContent=tx('docs.working');
      api('/api/x/docs/history/text',{id:r.id}).then(function(j){reader.textContent='';list.hidden=true;pager.hidden=true;reader.hidden=false;
        info.textContent=tx('docs.srcidx.reading',{t:j.title});
        reader.appendChild(h('button',{type:'button','data-go':'hlist',text:tx('docs.srcidx.back'),onclick:function(){reader.hidden=true;list.hidden=false;pager.hidden=false;rows()}}));
        reader.appendChild(el('h3',null,j.title));
        var m=[j.captured?tx('docs.srcidx.captured',{d:j.captured}):''].filter(Boolean).join('');if(m)reader.appendChild(el('p','hint',m));
        if(j.url){var up=el('p');up.appendChild(h('a',{href:j.url,target:'_blank',rel:'noopener noreferrer',text:j.url}));reader.appendChild(up)}
        var pre=el('div','srctext',j.text);pre.style.whiteSpace='pre-wrap';pre.style.wordBreak='break-word';reader.appendChild(pre)
      },function(e){info.textContent=tx('docs.err',{m:e.message})})}
    rows();return wrap}
  // ---- Search inside the documents (the WW2 sources' page text). hs.ww2: 'full' = the search box; 'list' = one sentence saying where
  // the text comes from instead. Results: snippet, document, page, the scan's address, the source; a page reads here with its citation.
  var PPAGE=20,JOINPOLL=1000;
  function later(f,ms){if(typeof setTimeout==='function')setTimeout(f,ms)}
  // 'parts': the database is in pieces (as git holds it). Opening the Source index starts putting it together (/history/join); one line
  // says how far, polled each second (joinstatus, a POST: kept out of the job list with job:false); when done the search box replaces
  // it in place (no reload). Failure: the reason and Try again. Stop (/history/joinstop) is the same stop as Cancel on the job list's
  // row "Putting the historical index together": either way the poll sees state stopped, the line says so and Try again starts it
  // over. A join the user stopped is not started again by opening the Source index (D.joinStopped, or the state the status carried).
  function joinBox(wrap,pbox,hs){
    var line=el('p','hint srcjoin',tx('docs.srcidx.join.start'));pbox.appendChild(line);
    var stop=h('button',{type:'button','data-go':'jstop',text:tx('docs.srcidx.join.stop'),onclick:function(){stop.disabled=true;line.textContent=tx('docs.srcidx.join.stopping');
      api('/api/x/docs/history/joinstop',{},{job:false}).then(null,function(){stop.disabled=false})}});stop.hidden=true;pbox.appendChild(stop);
    var again=h('button',{type:'button','data-go':'jagain',text:tx('docs.srcidx.join.again'),onclick:function(){again.hidden=true;line.textContent=tx('docs.srcidx.join.start');step(true)}});again.hidden=true;pbox.appendChild(again);
    function stopped(){D.joinStopped=true;stop.hidden=true;stop.disabled=false;line.textContent=tx('docs.srcidx.join.stopped');again.hidden=false}
    function step(start){
      api(start?'/api/x/docs/history/join':'/api/x/docs/history/joinstatus',{},start?wn('docs.srcidx.join.name'):{job:false}).then(function(j){
        if(j.state==='running'){D.joinStopped=false;stop.hidden=!j.canStop;if(!stop.disabled)line.textContent=tx('docs.srcidx.join.progress',{a:j.doneMb||0,b:j.totalMb||0});later(function(){step(false)},JOINPOLL);return}
        stop.hidden=true;stop.disabled=false;
        if(j.state==='stopped'){stopped();return}
        if(j.state==='done'&&j.history&&j.history.ok&&j.history.ww2!=='parts'){D.joinStopped=false;if(D.st)D.st.history=j.history;pageSearch(wrap,j.history,pbox);return}
        if(j.state==='idle'&&!start){step(true);return}
        line.textContent=tx('docs.srcidx.join.failed',{m:j.why||j.state});again.hidden=false
      },function(e){stop.hidden=true;stop.disabled=false;if(e&&e.cancelled){stopped();return}line.textContent=tx('docs.srcidx.join.failed',{m:e.message});again.hidden=false})}
    step(!(D.joinStopped||(hs&&hs.join&&hs.join.state==='stopped')))}
  // the Source index rows by title, asked once (/history/titles) for both of its search boxes
  function kindName(k){var t=tx('docs.srcidx.by.'+k);return t!=='docs.srcidx.by.'+k?t.replace(/:\s*$/,''):k}
  // Browse of both Source index boxes: the folder the sources are read from (the WW2 sources folder, else the guide index folder; /where),
  // else the Historical Sources documents; the picked file's name (no extension) is what is searched
  var srcBrowse={mode:'file',start:function(){return String((D.where||{}).history||'')||underRoot(setDir('history'))},
    toValue:function(p){var b=String(p||'').replace(/[\\\/]+$/,'').split(/[\\\/]/).pop(),i=b.lastIndexOf('.');return i>0?b.slice(0,i):b}};
  function histTitles(cb){var x=D.ht;if(x&&x.items){cb(x.items);return}if(x){x.wait.push(cb);return}x=D.ht={items:null,wait:[cb]};
    function fin(a){x.items=a;var w=x.wait;x.wait=[];w.forEach(function(f){f(a)})}
    api('/api/x/docs/history/titles',{}).then(function(j){fin((j.rows||[]).map(function(r){var lab=r.d&&r.t.indexOf(r.d)<0?r.d+', '+r.t:r.t;
      return {label:lab,value:r.d||r.t,hint:[r.k,r.n,r.y].filter(Boolean).join('  \u00b7  '),rec:r.rec,id:r.id,lo:(lab+' '+r.k+' '+r.n+' '+r.tp+' '+(r.y||'')).toLowerCase()}}))},function(){D.ht=null;fin([])})}
  function pageSearch(wrap,hs,pbox){var P={q:'',offset:0,n:0};
    if(pbox)pbox.textContent='';else{pbox=el('div','srcpages');pbox.style.margin='8px 0';wrap.appendChild(pbox)}
    pbox.appendChild(el('h3',null,tx('docs.srcidx.pages.head')));
    if(hs.ww2==='parts'){joinBox(wrap,pbox,hs);return pbox}
    if(hs.ww2!=='full'){pbox.appendChild(el('p','hint',tx('docs.srcidx.pages.listonly')));return pbox}
    pbox.appendChild(el('p','hint',tx('docs.srcidx.pages.what',{n:hs.pages||0,c:hs.docs||0})));
    var prow=el('div','row');prow.style.flexWrap='wrap';pbox.appendChild(prow);
    var pq=h('input',{type:'search',placeholder:tx('docs.srcidx.pages.search'),'aria-label':tx('docs.srcidx.pages.search')});pq.style.flex='1';pq.style.minWidth='160px';prow.appendChild(pq);
    var pgo=h('button',{type:'button','data-go':'pgo',text:tx('docs.search.go'),onclick:function(){P.q=String(pq.value||'').trim();P.offset=0;pages()}});prow.appendChild(pgo);
    // searchKit: index = the documents (designation, title) and the other sources (/history/titles, once); Browse = the folder picker on
    // the folder the sources are read from (srcBrowse); a pick searches the page text for it
    function docItems(cb){histTitles(function(t){cb(t.filter(function(x){return x.rec==='document'}).concat(t.filter(function(x){return x.rec!=='document'})))})}
    var pqKit=searchKit(pq,{key:'docs.srcidx.pages.q',index:function(s,done){docItems(function(a){hitsOf(a,s,done)})},browse:srcBrowse,
      onPick:function(v){pq.value=v;P.q=String(v).trim();P.offset=0;pages()}});
    pqKit.el.style.flex='1';
    pq.addEventListener('keydown',function(e){if(!e._sk&&isEnter(e)){e.preventDefault();pgo.click()}});
    var pinfo=el('div','hint','');pinfo.style.margin='6px 0';pbox.appendChild(pinfo);
    var plist=el('div','srcpagelist');pbox.appendChild(plist);
    var ppager=el('div','row');ppager.style.margin='6px 0';ppager.hidden=true;pbox.appendChild(ppager);
    var pprev=h('button',{type:'button','data-go':'pprev',text:tx('docs.srcidx.prev'),onclick:function(){P.offset=Math.max(0,P.offset-PPAGE);pages()}});
    var pnext=h('button',{type:'button','data-go':'pnext',text:tx('docs.srcidx.next'),onclick:function(){P.offset+=PPAGE;pages()}});ppager.appendChild(pprev);ppager.appendChild(pnext);
    var preader=el('div','srcread');preader.hidden=true;pbox.appendChild(preader);
    function link(u,t){return h('a',{href:u,target:'_blank',rel:'noopener noreferrer',text:t,title:u})}
    function pages(){if(!P.q){pinfo.textContent='';plist.textContent='';ppager.hidden=true;return}
      pinfo.textContent=tx('docs.working');preader.hidden=true;plist.hidden=false;
      api('/api/x/docs/history/search',{q:P.q,offset:P.offset,limit:PPAGE},wn('docs.srcidx.pages.head')).then(function(j){plist.textContent='';
        if(!j.ok){pinfo.textContent=j.why||'';ppager.hidden=true;return}
        pinfo.textContent=j.total?tx('docs.srcidx.pages.sum',{n:j.total,q:P.q})+(j.capped?' '+tx('docs.srcidx.pages.capped'):''):tx('docs.srcidx.pages.none',{q:P.q});
        P.n=j.total;ppager.hidden=j.total<=PPAGE;pprev.disabled=P.offset<=0;pnext.disabled=P.offset+j.rows.length>=j.total;
        j.rows.forEach(function(r){var d=el('div','dl srcpage');d.style.padding='3px 0';d.style.borderBottom='1px solid var(--line)';d.dataset.id=r.id;
          var t=(r.doc.designation&&r.doc.title.indexOf(r.doc.designation)<0?r.doc.designation+', ':'')+r.doc.title;
          d.appendChild(el('b',null,t));d.appendChild(document.createTextNode('  '));
          d.appendChild(el('span','hint',[r.page!=null?tx('docs.srcidx.pages.page',{p:r.printed&&r.printed!==String(r.page)?r.page+' ('+r.printed+')':r.page}):'',r.doc.issuer,r.doc.year,r.doc.nation,r.tier].filter(Boolean).join('  \u00b7  ')));
          var sn=el('div',null,r.snippet);sn.style.margin='2px 0';d.appendChild(sn);
          var act=el('div','hint');
          act.appendChild(h('button',{type:'button',class:'link','data-go':'pread',text:tx('docs.srcidx.pages.read'),onclick:function(){readPage(r.id)}}));
          if(r.url){act.appendChild(document.createTextNode('  '));act.appendChild(link(r.url,tx('docs.srcidx.pages.scan')))}
          if(r.source&&r.source.url&&r.source.url!==r.doc.url){act.appendChild(document.createTextNode('  '));act.appendChild(link(r.source.url,tx('docs.srcidx.pages.from',{t:r.source.title})))}
          d.appendChild(act);plist.appendChild(d)})
      },function(e){pinfo.textContent=errT(e)})}
    function readPage(id){pinfo.textContent=tx('docs.working');
      api('/api/x/docs/history/text',{id:id}).then(function(j){preader.textContent='';plist.hidden=true;ppager.hidden=true;preader.hidden=false;pinfo.textContent='';
        var nav=el('div','row');
        nav.appendChild(h('button',{type:'button','data-go':'plist',text:tx('docs.srcidx.back'),onclick:function(){preader.hidden=true;plist.hidden=false;ppager.hidden=P.n<=PPAGE}}));
        if(j.prev)nav.appendChild(h('button',{type:'button','data-go':'pbefore',text:tx('docs.srcidx.prev'),onclick:function(){readPage(j.prev)}}));
        if(j.next)nav.appendChild(h('button',{type:'button','data-go':'pafter',text:tx('docs.srcidx.next'),onclick:function(){readPage(j.next)}}));
        preader.appendChild(nav);preader.appendChild(el('h3',null,j.title));
        preader.appendChild(el('p','hint',tx('docs.srcidx.pages.check')));
        if(j.citation)preader.appendChild(el('p','hint',tx('docs.srcidx.pages.cite',{t:j.citation})));
        if(j.url){var up=el('p');up.appendChild(link(j.url,tx('docs.srcidx.pages.scan')));preader.appendChild(up)}
        var pre=el('div','srctext',j.text);pre.style.whiteSpace='pre-wrap';pre.style.wordBreak='break-word';preader.appendChild(pre)
      },function(e){pinfo.textContent=tx('docs.err',{m:e.message})})}
    return pbox}

  // ---- links: inside a book a link to one of its chapters stays in the book (file.md#heading lands on the heading)
  function joinRel(from,rel){var parts=String(from||'').split('/');parts.pop();if(rel.charAt(0)==='/')parts=[];
    rel.split('/').forEach(function(x){if(!x||x==='.')return;if(x==='..')parts.pop();else parts.push(x)});return parts.join('/')}
  function bookHit(t,from){var bk=D.bk;if(D.mode!=='book'||!bk)return null;
    var m=/^([^#]*)(?:#(.*))?$/.exec(String(t)),fp=m[1],slug=m[2]||'',line=0,lm=/^(.*?\.md):(\d+)(?:-\d+)?$/i.exec(fp);
    if(lm){fp=lm[1];line=+lm[2]}
    if(/^[a-z]+:/i.test(fp))return null;
    var wants=fp?[joinRel(from,fp),joinRel('',fp)]:[from];
    for(var w=0;w<wants.length;w++)for(var i=0;i<bk.chapters.length;i++){var cp=bk.chapters[i].p;if(cp===wants[w]||cp===wants[w]+'.md')return {k:'book',set:bk.set,ci:i,slug:slug,line:line}}
    return null}
  function follow(t,from){var b=bookHit(t,from);if(b){nav(b);return}
    var m=/^([^#]*)(?:#(.*))?$/.exec(String(t));nav({k:'file',p:m[1]||from||'',line:0,from:m[1]?from:'',slug:m[2]||''})}

  // ---- inline text: code spans, document links, limits IDs, block refs
  var TOK=/\[([^\]]+)\]\(([^)\s]+)\)|((?:modweb|limits|codemap|gohweb|guide|refmods|plan|tools|techdoc)\/[\w.\/-]+\.md(?::\d+(?:-\d+)?)?)|\b([A-Z]{2,6}\d?-\d{1,4})\b|(\u2192\s*)([a-z][\w-]*\/[\w.-]+)/g;
  // with Advanced off a link is offered only when it lands on the start page or a book chapter; anything else is plain text
  function canFollow(target,from){if(D.adv)return true;
    var fp=String(target||'').replace(/#.*$/,'').replace(/:\d+(?:-\d+)?$/,'');if(/^[a-z]+:/i.test(fp))return false;
    var c=fp?[joinRel(from,fp),joinRel('',fp)]:[from];
    for(var i=0;i<c.length;i++)if(D.pub[c[i]]||D.pub[c[i]+'.md'])return true;
    return false}
  function docLink(text,target,from){if(!canFollow(target,from))return el('span',null,text);
    return h('button',{type:'button',class:'link',text:text,title:target,onclick:function(){follow(target,from)}})}
  function limLink(id){if(!D.adv)return el('span',null,id);return h('button',{type:'button',class:'link',text:id,title:id,onclick:function(){openLimit(id)}})}
  function plain(node,t){if(t)node.appendChild(document.createTextNode(t))}
  function words(node,t,from){var m,at=0;TOK.lastIndex=0;
    while((m=TOK.exec(t))){plain(node,t.slice(at,m.index));at=m.index+m[0].length;
      if(m[1]!=null){var u=m[2];
        if(/^https?:\/\//i.test(u))node.appendChild(h('a',{href:u,target:'_blank',rel:'noopener noreferrer',text:m[1],title:u}));
        else if(/^[a-z]+:/i.test(u))plain(node,m[1]);
        else node.appendChild(docLink(m[1],u,from))}
      else if(m[3]!=null)node.appendChild(docLink(m[3],m[3],from));
      else if(m[4]!=null){if(D.areas[m[4].replace(/\d?-\d+$/,'')])node.appendChild(limLink(m[4]));else plain(node,m[4])}
      else{plain(node,m[5]);node.appendChild(docLink(m[6],m[6],from))}}
    plain(node,t.slice(at))}
  function inline(node,t,from){t=String(t).replace(/\*\*/g,'');var parts=t.split(BT);
    if(parts.length%2===0){parts[parts.length-2]+=BT+parts.pop()}
    for(var i=0;i<parts.length;i++){var p=parts[i];if(i%2===0){words(node,p,from);continue}
      var c=el('code',null,p);
      if(SETRX.test(p)){var b=docLink('',p,from);b.appendChild(c);node.appendChild(b)}
      else if(LIMRX.test(p)&&D.areas[p.replace(/\d?-\d+$/,'').toUpperCase()]){var lb=limLink(p);lb.textContent='';lb.appendChild(c);node.appendChild(lb)}
      else node.appendChild(c)}
    return node}
  function cells(l){var s=l.trim().replace(/^\|/,'').replace(/\|$/,'').split('\\|').join('\u0001');return s.split('|').map(function(c){return c.split('\u0001').join('|').trim()})}
  function bare(t){return String(t).replace(/!?\[([^\]]*)\]\([^)]*\)/g,'$1').split(BT).join('').replace(/\*\*/g,'').trim()}
  // heading anchors as the guide writes them (lower case, punctuation dropped, spaces to dashes, repeats get -1, -2)
  function slugOf(t){t=bare(t).toLowerCase();try{t=t.replace(/[^\p{L}\p{N}\s_-]/gu,'')}catch(e){t=t.replace(/[^a-z0-9\s_-]/g,'')}return t.replace(/\s/g,'-')}

  // ---- markdown into a box: returns the headings (with anchors) and the line range of every block
  function renderMd(box,text,p,kids){var lines=String(text).split(/\r?\n/),n=lines.length,i=0,marks=[],heads=[],used={};
    function mark(node,a,b){marks.push({a:a,b:b,el:node});return node}
    while(i<n){var l=lines[i],m;
      if(l.trim().slice(0,3)===FENCE){var s=i,buf=[];i++;while(i<n&&lines[i].trim().slice(0,3)!==FENCE){buf.push(lines[i]);i++}i++;
        var pre=el('pre',null,buf.join('\n'));var ind=/^\s*/.exec(l)[0].length;if(ind)pre.style.marginLeft=(14+ind*8)+'px';box.appendChild(mark(pre,s+1,i));continue}
      // a whole-line HTML comment (edition markers, maintainer trace lines) is not text of the page
      if(/^\s*<!--.*-->\s*$/.test(l)){i++;continue}
      if((m=/^(#{1,6})\s+(.*)$/.exec(l))){var lv=m[1].length,ht=m[2].replace(/\s+#+\s*$/,''),hn=inline(el(lv<=1?'h2':lv===2?'h3':'h4'),ht,p),sg=slugOf(ht);
        if(used[sg]!=null){used[sg]++;sg=sg+'-'+used[sg]}else used[sg]=0;
        hn.dataset.slug=sg;heads.push({el:hn,lv:lv,slug:sg,text:bare(ht),line:i+1});box.appendChild(mark(hn,i+1,i+1));i++;continue}
      if(/^\s*\|.*\|\s*$/.test(l)&&i+1<n&&/^\s*\|[\s:|-]+\|\s*$/.test(lines[i+1])){var tb=el('table'),first=true;
        while(i<n&&/^\s*\|.*\|\s*$/.test(lines[i])){if(/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])){i++;continue}
          var tr=el('tr');cells(lines[i]).forEach(function(c){tr.appendChild(inline(el(first?'th':'td'),c,p))});tb.appendChild(mark(tr,i+1,i+1));first=false;i++}
        box.appendChild(tb);continue}
      if(/^\s*(?:-{3,}|\*{3,})\s*$/.test(l)){box.appendChild(el('hr'));i++;continue}
      if(!l.trim()){box.appendChild(el('div','dl sp'));i++;continue}
      var d=el('div','dl');
      if((m=/^([A-Z]{2,6}\d?-\d+) \| (.*)$/.exec(l))){d.className='dl lim';d.appendChild(el('b',null,m[1]));plain(d,' | ');inline(d,m[2],p)}
      else if((m=/^\s*>\s?(.*)$/.exec(l))){d.className='dl quote';d.style.borderLeft='3px solid var(--line)';d.style.paddingLeft='8px';inline(d,m[1],p)}
      else if((m=/^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l))){d.style.paddingLeft=(14+m[1].length*8)+'px';plain(d,(/\d/.test(m[2])?m[2]:'\u2022')+' ');inline(d,m[3],p)}
      else if((m=/^(\s*)([\w.-]+)(\s{2,}| \| |\s*$)(.*)$/.exec(l))&&Object.prototype.hasOwnProperty.call(kids,m[2])){plain(d,m[1]);d.appendChild(docLink(m[2],kids[m[2]],''));plain(d,m[3]);inline(d,m[4],p)}
      else if((m=/^(\s+)(\S.*)$/.exec(l))){d.style.paddingLeft=(14+m[1].length*8)+'px';inline(d,m[2],p)}
      else inline(d,l,p);
      box.appendChild(mark(d,i+1,i+1));i++}
    return {marks:marks,heads:heads}}

  // ---- one document alone
  function drawDoc(j,slug){view.textContent='';D.hit=null;
    crumb.textContent=j.p+(j.line?'  \u00b7  '+tx('docs.line',{n:j.line}):'');
    if(j.truncated)view.appendChild(el('p','err',tx('docs.trunc')));
    var r=renderMd(view,j.text,j.p,j.kids||{}),target=null;
    if(j.line)r.marks.some(function(m){if(j.line>=m.a&&j.line<=m.b){target=m.el;return true}return false});
    if(!target&&slug)target=findSlug(r.heads,slug);
    if(target){target.classList.add('hit');try{target.scrollIntoView({block:'center'})}catch(e){}}else view.scrollTop=0}

  out.refresh=function(){if(!D.loaded)loadStatus();else syncAdv()};
  // the shell opens a part (docs/<part>): its lists and its last document; before the status is here the status load opens it.
  // Project Notes with Advanced off: Modding, and the shell is told so
  out.view=function(p){p=String(p||'');if(!okPart(p))return;D.told=true;
    if(p==='project'&&!advNow()){p='modding';told(p)}
    if(!D.st||!D.st.found){D.part=p;LS.set('docs.part',p);return}
    syncAdv();if(p===D.part)return;
    partTo(p,'',false);openLast(true)};
  out.viewNow=function(){return D.part};
  out.focus=function(){sq.focus()};
  // links from other pages (page.js as2Link): docs:<path>[#line] and lim:<ID>. With Advanced off they open the reader's documents only
  // (openFile checks the resolved path; openLimit says the row is in the maintainer notes).
  out.go=function(p,line){nav({k:'file',p:String(p||''),line:line||0})};
  out.limit=function(id){openLimit(String(id||''))};
  return out};
`;
