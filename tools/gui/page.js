// The GUI page: one string, served at GET /. No build step, no dependencies, no fixed paths. Plain `require`-able (the single exe bundles it as an asset).
// Rules for editing: no backtick and no dollar-brace inside the string (it is a String.raw template); build DOM with textContent, never innerHTML on data.
// Strings live in tools/gui/lang/<code>.json (en, ru, uk, zh); they are embedded in the page as the LANGS object. t(key, {name: value}) fills {name} slots.
// Author: Imperator_Aug (ARSENAL, ia-e050ab1a)
const ORDER = ['en', 'ru', 'uk', 'zh'];
const EXT = require('./ext');
const GROUPS = require('./groups');
const SETTINGS = require('./settings');
function loadLangs() {
  const o = {};
  for (const c of ORDER) o[c] = Object.assign({}, require('./lang/' + c + '.json'));   // literal-ish require so the exe bundler keeps the json assets
  for (const x of EXT) for (const c of ORDER) Object.assign(o[c], (x.lang && x.lang[c]) || {});   // GUI-EXT strings
  return o;
}
const TEMPLATE = String.raw`<!doctype html>
<html lang=en><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>A.R.S.E.N.A.L</title>
<style>
/* GT-37: colours are tokens; dark follows the OS unless the header switch says light or dark (data-theme on html) */
:root{color-scheme:light;--bg:#f4f5f7;--fg:#1c1f24;--card:#fff;--line:#d5d8de;--line2:#e6e8ec;--th:#eef0f3;--in:#fff;--inl:#b9bec7;--btn:#eceef2;--btnl:#9aa1ad;--hint:#666;--sel:#d9e6fb;--hov:#eef3fb;
 --acc:#2c6fd1;--err:#b3382c;--ok:#1d7a3b;--hd:#20242b;--hdfg:#e8eaee;--tab:#2f353f;--tabfg:#cfd4dc;--code:#eceef2;--pre:#f1f2f5;--soft:#fafafa;--ban:#f3f6fb;--banl:#c9d6ea;--who:#fffbe6;--whol:#e8d38a;--hbox:#fff4f2;--hboxl:#e3b4ad;--badge:#e1e4ea;--qp:#eef4ff;--chip:#e9ebef;--bad:#fff0ee;--link:#2a63c2;
 --hdl:#4a515d;--hdhint:#c9ced6;--hdbad:#ff9a8a;--pri:#2c6fd1;--prifg:#fff;--pril:#2257a8;--dan:#b3382c;--danl:#8c2b21;--okl:#2f9e55;--badl:#cc3333;--midl:#d6a400;--neul:#888888;--scrim:#0006;--shadow:#0005;
 --log:#14171c;--logfg:#d7dae0;--loge:#ff9a8a;--logq:#8fc7ff;--loga:#9be29b;--tip:#20242b;--tipfg:#fff;--tipl:#7b8494;--warnl:#e0a030;--warnfg:#7a4b00;--synk:#2257a8;--hit:#fff3b0;--hitl:#e0c040;
 --crash:#f6c9c3;--silent:#fbdcb5;--review:#fcf1b8;--cosm:#e9ebef;--goodbg:#c8ecd2;--infobg:#dbe7f7;--warnbg:#fdf3d0;--violbg:#e4d9fa;
 --lvbad:#e5484d;--lvwarn:#e0a030;--lvnote:#8a93a3;--lvok:#3fb27f;--lvsync:#c26be0;--lvinfo:#4aa3df;--lvfg:#111;
 --s1:#2c6fd1;--s2:#c0392b;--s3:#2e8b57;--s4:#b8860b;--s5:#7d3c98;--s6:#d35400;--s7:#16808a;--s8:#7f8c8d;--s9:#a04070;--s10:#4d6b1f;--s11:#34495e;--s12:#c2185b;
 --cthru:#d64541;--cbounce:#f0a830;--cstop:#2f6fc0;--cnone:#c9d2d8;--cline:#555555;--mmlo:#e8eef5;--mmhi:#162e54}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--bg:#16181c;--fg:#dde1e7;--card:#1f2328;--line:#3a4049;--line2:#2c3138;--th:#262b31;--in:#15181c;--inl:#4a515d;--btn:#2b3038;--btnl:#4f5763;--hint:#9aa3ad;--sel:#24406b;--hov:#252c37;
 --acc:#4b8ef0;--err:#ff8a7a;--ok:#5fd08a;--hd:#0f1114;--hdfg:#e8eaee;--tab:#262b33;--tabfg:#cfd4dc;--code:#2b3038;--pre:#1a1d22;--soft:#1c2026;--ban:#1c2533;--banl:#34465f;--who:#2b2716;--whol:#6b5d26;--hbox:#33201d;--hboxl:#6b3a33;--badge:#2f353f;--qp:#1a2638;--chip:#2f353f;--bad:#3a1f1c;--link:#7fb0ff;
 --hdl:#4a515d;--hdhint:#c9ced6;--hdbad:#ff9a8a;--pri:#2c6fd1;--prifg:#fff;--pril:#4b8ef0;--dan:#b3382c;--danl:#d4544a;--okl:#3fb56a;--badl:#e5605a;--midl:#d6a400;--neul:#6b7380;--scrim:#000a;--shadow:#000a;
 --log:#0c0e11;--logfg:#d7dae0;--loge:#ff9a8a;--logq:#8fc7ff;--loga:#9be29b;--tip:#2f353f;--tipfg:#f0f2f5;--tipl:#7b8494;--warnl:#c98a20;--warnfg:#e8b860;--synk:#8fb8ff;--hit:#4a4218;--hitl:#8a7420;
 --crash:#5c2a24;--silent:#553a1a;--review:#4a4218;--cosm:#2f353f;--goodbg:#1f4a2c;--infobg:#1f3350;--warnbg:#3d3519;--violbg:#3a2d5c;
 --lvbad:#e5484d;--lvwarn:#e0a030;--lvnote:#8a93a3;--lvok:#3fb27f;--lvsync:#c26be0;--lvinfo:#4aa3df;--lvfg:#111;
 --s1:#5b9bf0;--s2:#ef6b5b;--s3:#4cc38a;--s4:#e0b040;--s5:#b07ad0;--s6:#f08a40;--s7:#3fb8c4;--s8:#a5b0b3;--s9:#d07aa0;--s10:#8fb84a;--s11:#7f9bb8;--s12:#f06a9a;
 --cthru:#ef6b5b;--cbounce:#f0b040;--cstop:#5b9bf0;--cnone:#4a525c;--cline:#aab2bd;--mmlo:#1e2a38;--mmhi:#9cc4ff}}
:root[data-theme=dark]{color-scheme:dark;--bg:#16181c;--fg:#dde1e7;--card:#1f2328;--line:#3a4049;--line2:#2c3138;--th:#262b31;--in:#15181c;--inl:#4a515d;--btn:#2b3038;--btnl:#4f5763;--hint:#9aa3ad;--sel:#24406b;--hov:#252c37;
 --acc:#4b8ef0;--err:#ff8a7a;--ok:#5fd08a;--hd:#0f1114;--hdfg:#e8eaee;--tab:#262b33;--tabfg:#cfd4dc;--code:#2b3038;--pre:#1a1d22;--soft:#1c2026;--ban:#1c2533;--banl:#34465f;--who:#2b2716;--whol:#6b5d26;--hbox:#33201d;--hboxl:#6b3a33;--badge:#2f353f;--qp:#1a2638;--chip:#2f353f;--bad:#3a1f1c;--link:#7fb0ff;
 --hdl:#4a515d;--hdhint:#c9ced6;--hdbad:#ff9a8a;--pri:#2c6fd1;--prifg:#fff;--pril:#4b8ef0;--dan:#b3382c;--danl:#d4544a;--okl:#3fb56a;--badl:#e5605a;--midl:#d6a400;--neul:#6b7380;--scrim:#000a;--shadow:#000a;
 --log:#0c0e11;--logfg:#d7dae0;--loge:#ff9a8a;--logq:#8fc7ff;--loga:#9be29b;--tip:#2f353f;--tipfg:#f0f2f5;--tipl:#7b8494;--warnl:#c98a20;--warnfg:#e8b860;--synk:#8fb8ff;--hit:#4a4218;--hitl:#8a7420;
 --crash:#5c2a24;--silent:#553a1a;--review:#4a4218;--cosm:#2f353f;--goodbg:#1f4a2c;--infobg:#1f3350;--warnbg:#3d3519;--violbg:#3a2d5c;
 --lvbad:#e5484d;--lvwarn:#e0a030;--lvnote:#8a93a3;--lvok:#3fb27f;--lvsync:#c26be0;--lvinfo:#4aa3df;--lvfg:#111;
 --s1:#5b9bf0;--s2:#ef6b5b;--s3:#4cc38a;--s4:#e0b040;--s5:#b07ad0;--s6:#f08a40;--s7:#3fb8c4;--s8:#a5b0b3;--s9:#d07aa0;--s10:#8fb84a;--s11:#7f9bb8;--s12:#f06a9a;
 --cthru:#ef6b5b;--cbounce:#f0b040;--cstop:#5b9bf0;--cnone:#4a525c;--cline:#aab2bd;--mmlo:#1e2a38;--mmhi:#9cc4ff}
*{box-sizing:border-box}
body{margin:0;font:13px/1.35 system-ui,Segoe UI,sans-serif;color:var(--fg);background:var(--bg)}
.skip{position:absolute;left:-9999px;top:4px;z-index:50;background:var(--card);color:var(--fg);padding:4px 10px;border:2px solid var(--acc);border-radius:3px}.skip:focus{left:8px}
header{display:flex;gap:6px 10px;align-items:center;background:var(--hd);color:var(--hdfg);padding:5px 10px 0;position:sticky;top:0;z-index:5;flex-wrap:wrap}
/* header rows (the owner, 2026-11-19: a definitive transition between rows): row 1 (brand, games, mod, status, theme, language), the Quick
   Guided Task row, the tab band (tabs + sub-tabs). Each lower row spans the header edge to edge (the header padding cancelled), starts with
   a line in --hdl and has the same padding; the tab band has its own background (--tab) with the tabs in --hd, so it is set off from the rows
   above. The sub-tabs join the band (the row gap cancelled). The phone width rules repeat this with the phone padding (6px). */
header>#taskrow,header>nav,header>#subnav,header>#pagenav{flex:0 0 calc(100% + 20px);max-width:none;margin:0 -10px;padding:5px 10px}
/* the page pills are the last row of the header (they stay in view with it) and part of the tab band: the band background (--tab), like
   the sub-tabs; under a shown sub-tab row they start with a line in --hdl */
header>#pagenav{background:var(--tab);margin-top:-6px;padding:6px 10px 5px}header>#subnav:not([hidden])+#pagenav{border-top:1px solid var(--hdl)}
#hdlockhd label{display:inline-flex;align-items:center;gap:4px;cursor:pointer;white-space:nowrap}
/* header lock off (Settings, hdLock): the header scrolls away with the page; things that stick under it stick at the top */
body.hdfree header{position:static}body.hdfree{--hdh:0px}
header>#taskrow{border-top:1px solid var(--hdl)}
header>nav{border-top:1px solid var(--hdl);background:var(--tab);padding-bottom:0}
header>#subnav{background:var(--tab);margin-top:-6px;padding-top:6px}
/* the game warning (only when the folder is missing or wrong; the folder itself is on Settings) and the game runs chip by the game buttons */
#gamebar:empty,#runoff:empty{display:none}
#gamebar button{background:var(--tab);color:var(--tabfg);border:1px solid var(--hdl);padding:1px 8px;font-size:12px;margin-left:6px}
#runoff{font-size:11px;color:var(--hdhint);white-space:nowrap}#runoff [data-runoff=on]{color:var(--hdfg);font-weight:600}
/* the mod pill: the last folder name; the whole path while the Change picker is open */
#modchip[data-full="1"]{max-width:none;white-space:normal;overflow-wrap:anywhere}
#gameinfo .row{margin:4px 0}#gameinfo details{display:inline-block;margin-left:6px}
body.remote [data-gamechg]{display:none}
header b.brand{font-size:15px;margin-right:4px}
.hx{display:flex;gap:6px 10px;align-items:center;flex-wrap:wrap}
#games{display:flex;gap:2px}
#games button{background:var(--tab);color:var(--tabfg);border:1px solid var(--hdl);padding:3px 12px;cursor:pointer;font:inherit;font-weight:600}
#games button:first-child{border-radius:4px 0 0 4px}#games button:last-child{border-radius:0 4px 4px 0}
#games button[aria-selected=true]{background:var(--pri);border-color:var(--pri);color:var(--prifg)}
#hdmore{display:none;background:var(--tab);color:var(--tabfg);border:1px solid var(--hdl)}
#modchg{background:var(--tab);color:var(--tabfg);border:1px solid var(--hdl);padding:1px 8px;font-size:12px}
nav{display:flex;flex-wrap:wrap;gap:3px 2px;max-width:100%;flex-basis:100%}
nav button{background:var(--hd);color:var(--tabfg);border:0;padding:5px 10px;border-radius:3px 3px 0 0;cursor:pointer;font:inherit}
nav button[aria-selected=true]{background:var(--bg);color:var(--fg);font-weight:600}
nav kbd{opacity:.6;font-size:10px;margin-right:3px}
#subnav{display:flex;flex-wrap:wrap;gap:4px;flex-basis:100%;padding:1px 0 2px}#subnav[hidden]{display:none}
#subnav button{background:var(--hd);color:var(--tabfg);border:1px solid var(--hdl);border-radius:12px;padding:2px 12px;cursor:pointer;font:inherit}
#subnav button[aria-selected=true]{background:var(--bg);color:var(--fg);border-color:var(--bg);font-weight:600}
/* the third row (items of a sub-tab), above the page and outside the sticky header */
#pagenav{display:flex;flex-wrap:wrap;gap:4px;padding:8px 10px 0}#pagenav[hidden]{display:none}
#pagenav button{background:var(--hd);color:var(--tabfg);border:1px solid var(--hdl);border-radius:12px;padding:2px 12px;cursor:pointer;font:inherit}
#pagenav button[aria-selected=true]{background:var(--pri);color:var(--prifg);border-color:var(--pril);font-weight:600}
/* Advanced (Settings page): the chip shows while it is on and opens Settings; in-page folds marked adv show only while it is on, lines marked advoff only while it is off */
#advchip{background:var(--warnbg);color:var(--fg);border:1px solid var(--warnl);border-radius:9px;padding:0 8px;font-size:12px}#advchip[hidden]{display:none}
body:not(.advon) .adv:not(.advkeep){display:none}body.advon .advoff{display:none}
#gamebar,#modchip,#runstate{font-size:12px}
#gamebar .bad{color:var(--hdbad)}#gamebar .hint{color:var(--hdhint)}
#modchip{background:var(--tab);padding:2px 7px;border-radius:9px;max-width:28em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* the owner's community link (2026-11-10): a chip on the header, stays out of the "More" fold, shortens with an ellipsis when narrow */
#community{margin-left:auto;min-width:0;max-width:100%;display:inline-flex}
#community a{display:inline-block;background:var(--pri);color:var(--prifg);border:1px solid var(--pril);border-radius:9px;padding:1px 9px;font-size:12px;font-weight:600;text-decoration:none;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
#community a:hover{text-decoration:underline}#community a:focus-visible{outline:2px solid var(--hdfg);outline-offset:1px}
.prog{display:inline-flex;gap:6px;align-items:center}.prog[hidden]{display:none}.prog button[hidden]{display:none}
/* GT-38: at phone width the games, tabs, sub-tabs and third row are one line each that scrolls sideways; folder, language and theme fold behind "More" */
@media (max-width:700px){header{padding:4px 6px 0;gap:4px 6px}#hdmore{display:inline-block}header .hx{display:none}header.more .hx{display:flex;flex-basis:100%}header>#taskrow,header>nav,header>#subnav,header>#pagenav{flex:0 0 calc(100% + 12px);margin:0 -6px;padding:4px 6px}header>nav{padding-bottom:0}header>#subnav{margin-top:-4px}
 nav,#subnav,#pagenav,#games{flex-wrap:nowrap;overflow-x:auto;white-space:nowrap;scrollbar-width:thin}nav button,#subnav button,#pagenav button{flex:0 0 auto}nav kbd{display:none}#modchip{max-width:11em}#pagenav{padding:6px 6px 0}
 main{padding:6px}header>*{max-width:100%;min-width:0}#games{overflow-x:auto}.cols{grid-template-columns:minmax(0,1fr)!important}label.f{grid-template-columns:minmax(0,1fr)!important}}
main,#nabox{padding:10px;max-width:1500px}
section[hidden]{display:none}
h2{font-size:15px;margin:2px 0 8px}h3{font-size:13px;margin:0 0 6px}
.card{background:var(--card);border:1px solid var(--line);border-radius:4px;padding:8px 10px;margin-bottom:10px}
.cols{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:10px}
.row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:3px 0}
label.f{display:grid;grid-template-columns:9em minmax(0,1fr) auto;gap:6px;align-items:center;margin:2px 0}
label.f span.n{color:var(--hint)}label.f span.n.req::after{content:" *";color:var(--err)}
label.f.chk{grid-template-columns:max-content auto;justify-content:start}label.f.chk>input[type=checkbox],label.f.chk>input[type=radio]{justify-self:start;margin:0}
input[type=text],input[type=number],select,textarea{font:inherit;padding:3px 5px;border:1px solid var(--inl);border-radius:3px;min-width:0;width:100%;background:var(--in);color:var(--fg)}
input.bad,select.bad{border-color:var(--badl);background:var(--bad)}
textarea{font-family:Consolas,monospace;font-size:12px}
button{font:inherit;padding:3px 10px;border:1px solid var(--btnl);border-radius:3px;background:var(--btn);color:var(--fg);cursor:pointer}
button.primary{background:var(--pri);color:var(--prifg);border-color:var(--pril)}
button.danger{background:var(--dan);color:var(--prifg);border-color:var(--danl)}
button:disabled{opacity:.5;cursor:default}
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--acc);outline-offset:1px}
.hint{color:var(--hint);font-size:12px}.err{color:var(--err)}.ok{color:var(--ok)}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:2px 6px;border-bottom:1px solid var(--line2);vertical-align:top}
/* table headers stay in view: under the page header (--hdh = its height, set by hdhWatch) for a table in the page flow; at the top of
   its own box for a table inside a scrolling box (a box with no height limit gets one, or its header could never stay in view) */
th{background:var(--th);position:sticky;top:var(--hdh,34px);z-index:2}
.scroll th,dialog th,[style*=overflow] th{top:0}
html{scroll-padding-top:calc(var(--hdh,34px) + 4px)}
div[style*=overflow]:not([style*=max-height]){max-height:calc(100vh - var(--hdh,34px) - 12px)}
.scroll th{top:0}td.nw,th.nw{white-space:nowrap}
button.busy{opacity:.5}
tbody tr{cursor:pointer}tbody tr[aria-selected=true]{background:var(--sel)}tbody tr:hover{background:var(--hov)}
.scroll{max-height:60vh;overflow:auto;border:1px solid var(--line);background:var(--card)}
pre.log{margin:4px 0 0;background:var(--log);color:var(--logfg);padding:6px 8px;max-height:22em;overflow:auto;font:12px/1.3 Consolas,monospace;white-space:pre-wrap;word-break:break-all}
pre.log .e{color:var(--loge)}pre.log .q{color:var(--logq)}pre.log .a{color:var(--loga)}
.badge{display:inline-block;padding:0 6px;border-radius:8px;font-size:11px;background:var(--badge);margin-right:4px}
.badge[hidden]{display:none}
/* live page and LAN Remote (gui.js --dev, --remote; the QR code is drawn --lvfg on --prifg: near black on white in both themes, so cameras read it): Reconnecting in the header,
   the LAN Remote button in the header (PC page), the remote banner under the header (it stays in view on any screen size, sticky under the header), PC only controls gone on a remote device */
#livest{font-size:11px;background:var(--warnbg);color:var(--fg);border:1px solid var(--warnl);border-radius:9px;padding:0 7px}#livest[hidden]{display:none}
#rmban{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;background:var(--ban);border-bottom:1px solid var(--banl);padding:4px 10px;font-size:12px;position:sticky;top:var(--hdh,34px);z-index:4}#rmban[hidden]{display:none}
#rmban label{display:inline-flex;gap:4px;align-items:center;white-space:nowrap}
#rmbtn{background:var(--tab);color:var(--tabfg);border:1px solid var(--hdl);padding:1px 8px;font-size:12px;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}#rmbtn[hidden]{display:none}
#rmbtn .rmmark{margin-left:6px;padding:0 6px;border-radius:8px;border:1px solid var(--hdl);font-size:11px}#rmbtn .rmmark.on{background:var(--goodbg);color:var(--fg);border-color:var(--okl)}
#rmdlg .askb>p{margin:4px 0 8px}#rmdlg .askb label{display:inline-flex;gap:4px;align-items:center}#rmdlg .qrbox:empty{display:none}
body.remote button[data-run],body.remote button[data-launch],body.remote #modchg,body.remote #cancel,body.remote #arrbox,body.remote #pkuse{display:none}
.qrbox canvas{width:180px;height:180px;display:block;image-rendering:pixelated;border-radius:3px}.rmlink{overflow-wrap:anywhere;font-size:12px}
.badge.crash,.sev-crash{background:var(--crash)}.badge.silent,.sev-silent{background:var(--silent)}.badge.review,.sev-review{background:var(--review)}.badge.cosmetic,.sev-cosmetic{background:var(--cosm)}
.badge.good{background:var(--goodbg)}.badge.badx{background:var(--crash)}
.badge.desync{background:var(--crash)}.badge.info{background:var(--infobg)}
.doc .dl{white-space:pre-wrap;word-break:break-word;min-height:1em}.doc .dl.sp{height:6px;min-height:0}.doc .hit{background:var(--hit);outline:1px solid var(--hitl)}.doc .lim b{color:var(--warnfg)}
.doc pre{background:var(--pre);border:1px solid var(--line2);padding:6px 8px;overflow:auto;font:12px/1.35 Consolas,monospace;margin:6px 0}.doc code{background:var(--code);padding:0 3px;border-radius:3px;font:12px Consolas,monospace}
.doc th{position:static}.doc table{margin:6px 0;width:auto}.doc h2,.doc h3,.doc h4{margin:12px 0 4px}.doc button.link{padding:0}
.steps{display:flex;flex-wrap:wrap;gap:4px;padding:0;margin:6px 0;list-style:none;counter-reset:st}.steps li{counter-increment:st;padding:2px 8px;border-radius:10px;background:var(--chip);font-size:12px}.steps li::before{content:counter(st) ". "}.steps li.cur{background:var(--pri);color:var(--prifg)}.steps li.done{background:var(--goodbg)}
.wzstat{padding:4px 8px;margin:4px 0;border-left:4px solid var(--acc);background:var(--ban)}.wzstat.err{border-color:var(--badl)}.wzstat.ok{border-color:var(--okl)}
.wzsec{margin:8px 0}.wzsec h4{margin:4px 0}.fcard{margin:6px 0}.fcard .fx{margin:3px 0}.fcard ol{margin:2px 0 2px 18px;padding:0}label.pick{display:block;margin:2px 0 2px 12px}button.link{background:none;border:0;color:var(--link);text-decoration:underline;padding:0;cursor:pointer}pre .q{background:var(--hit)}details.adv>summary{cursor:pointer;margin:8px 0;font-weight:bold}
.verdict{padding:4px 8px;border-left:4px solid var(--neul);margin:3px 0;background:var(--soft)}.verdict.good{border-color:var(--okl)}.verdict.badx{border-color:var(--badl)}.verdict.mid{border-color:var(--midl)}
details{margin:2px 0}summary{cursor:pointer}
.tree{font:12px/1.35 Consolas,monospace}.tree details{margin-left:14px}.tree .k{color:var(--synk)}.tree .s{color:var(--warnfg)}.tree .v{color:var(--ok)}
.q-panel{border:2px solid var(--acc);background:var(--qp);padding:8px 10px;border-radius:4px;margin:6px 0}
.q-panel .opts{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
.q-panel button.dflt{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc)}
dialog{background:var(--card);color:var(--fg);border:1px solid var(--btnl);border-radius:5px;padding:0;width:min(46em,95vw)}
dialog::backdrop{background:var(--scrim)}
dialog .hd,dialog .ft{padding:6px 10px;display:flex;gap:6px;align-items:center}
dialog .askb{padding:4px 14px 8px;max-height:60vh;overflow:auto;overflow-wrap:anywhere}dialog .askb ul{margin:4px 0 8px;padding-left:20px}dialog .askb li{margin:2px 0}
dialog .list{height:22em;overflow:auto;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
dialog .it{padding:2px 10px;cursor:pointer;display:block}dialog .it[aria-selected=true]{background:var(--sel)}dialog .it:hover{background:var(--hov)}
#toast{position:fixed;right:12px;bottom:12px;background:var(--tip);color:var(--tipfg);border:1px solid var(--tipl);padding:6px 12px;border-radius:4px;display:none;max-width:30em;z-index:20}
#tip{position:fixed;z-index:60;display:none;background:var(--tip);color:var(--tipfg);padding:4px 8px;border-radius:4px;font-size:12px;line-height:1.35;max-width:28em;pointer-events:none;box-shadow:0 2px 8px var(--shadow)}
#tip kbd{margin-left:8px;padding:0 4px;border:1px solid var(--tipl);border-radius:3px;font:11px Consolas,monospace;color:var(--tipfg)}
footer{padding:6px 10px;color:var(--hint);font-size:12px}footer summary{display:inline-block;padding:0 8px;border:1px solid var(--btnl);border-radius:9px;font-weight:bold}
.head{padding:6px 10px;border-left:6px solid var(--neul);margin:4px 0;font-size:14px;background:var(--soft)}.head.good{border-color:var(--okl)}.head.badx{border-color:var(--badl)}.head.mid{border-color:var(--midl)}
.banner{padding:6px 10px;border:1px solid var(--banl);border-radius:4px;background:var(--ban);margin:4px 0}
.ftree{font:12px/1.45 Consolas,monospace;margin:4px 0}.ftree .hint{font-family:system-ui,sans-serif}
.card.who{background:var(--who);border-color:var(--whol)}
.hbox{border:1px solid var(--hboxl);background:var(--hbox);padding:6px 8px;border-radius:4px;margin:4px 0}
#gamebar details{display:inline-block}#gamebar summary{color:var(--hdhint)}
.badge.crash,.badge.silent,.badge.review,.badge.cosmetic,.badge.good,.badge.badx,.badge.desync,.badge.info,tr.sev-crash,tr.sev-silent,tr.sev-review,tr.sev-cosmetic{color:var(--fg)}
#pkerr{margin:0 10px 6px}#pkerr[hidden]{display:none}
/* blocks (plan/briefs/gui-blocks.md): a container wraps or stacks its blocks with a gap; a block never shrinks below its content
   (min-content, long words break), has no fixed width and is never positioned on top of a neighbour, so blocks cannot overlap */
.blk{box-sizing:border-box;max-width:100%;overflow-wrap:anywhere}
[hidden].blk,.blkoff{display:none!important}
.blc{display:flex;flex-direction:column;align-items:stretch;gap:8px}
.blc>*{margin-top:0;margin-bottom:0}
details.blc{display:block}details.blc>.blk{margin-top:6px}
.blc.box-row{flex-direction:row;flex-wrap:wrap;align-items:center;gap:6px 10px}
.blc.box-row>.blk{flex:0 1 auto;width:max-content;max-width:100%;min-width:min-content}
.blc.box-grid,.blc.box-cols{flex-direction:row;flex-wrap:wrap;align-items:flex-start;gap:10px}
.blc.box-grid>.blk{flex:1 1 18em;min-width:min-content}
.blc.box-cols>.blk{flex:2 1 18em;min-width:min-content}
.blc.box-cols>.blk:not(:last-child){flex:3 1 24em}
.blc.box-ncols{flex-direction:row;flex-wrap:wrap;align-items:flex-start;gap:10px}
.blc.box-ncols>.blk{flex:2 1 18em;min-width:min-content}
.blc.box-ncols>.blk~.blk{flex:3 1 24em}
.blc>.blkbar{flex:0 0 100%}
.blk>.blkbar{flex:0 0 100%}
.blk.row,.blk>.row{flex-wrap:wrap}
.blk.fld>label.f{margin:0;grid-template-columns:minmax(min-content,9em) minmax(8em,1fr) auto}
.blk.fld>label.f.chk{grid-template-columns:max-content auto;justify-content:start}
/* controls inside a block: plain lengths only. A percentage width, min-width or max-width on a control makes it count as 0 in its block's
   min-content size, so the block is sized too narrow and the text after the control spills over the next block. The block caps at 100%,
   the control does not; a field or text area fills its space with the stretch keyword (counted at its real size, never as a percentage) */
.blk select,.blk input[type=text],.blk input[type=number],.blk textarea{width:auto;min-width:8em;max-width:none}
.blk textarea,.blk.fld>label.f>select,.blk.fld>label.f>input[type=text],.blk.fld>label.f>input[type=number],.blk.fld>label.f>textarea{justify-self:stretch;width:-moz-available;width:-webkit-fill-available;width:stretch}
.box-row>.blk select,.box-row>.blk input[type=text],.box-row>.blk input[type=number],.blk.row>select,.blk.row>input[type=text],.blk.row>input[type=number]{width:auto}
/* a field in a row container is compact: label, control and unit side by side with a small gap, the leaf as wide as its content (it
   does not grow to fill the line), a tick box right before its text; a long label wraps only when the leaf would not fit the container */
.blc.box-row>.fld{flex:0 1 auto;width:max-content;max-width:100%;min-width:min-content}
.blc.box-row>.fld>label.f,.blc.box-row>.fld>label.f.chk{display:flex;flex-wrap:nowrap;align-items:center;gap:4px 6px;grid-template-columns:none}
.blc.box-row>.fld>label.f>*{flex:0 1 auto}
.blc.box-row>.fld>label.f>select,.blc.box-row>.fld>label.f>input[type=text],.blc.box-row>.fld>label.f>input[type=number],.blc.box-row>.fld>label.f>textarea{width:auto;justify-self:auto}
.blc.box-row>.fld>label.f.chk>input[type=checkbox],.blc.box-row>.fld>label.f.chk>input[type=radio]{order:-1}
.blc.box-row>.fld>label.f>span:empty{display:none}
/* old inline white-space:nowrap inside a block: wraps only when the block would otherwise be wider than its container */
.blk [style*=nowrap]{white-space:normal!important}
.arranging .blk{outline:1px dashed var(--acc);outline-offset:1px}
.arranging .blc{padding:4px;min-height:2.4em}
.arranging [data-blkinert]{opacity:.6}
.blkbar{display:flex;flex-wrap:wrap;gap:2px 4px;align-items:center;margin:0 0 3px;font-size:11px;font-weight:normal;box-sizing:border-box;max-width:100%;min-width:0}
summary .blkbar{display:inline-flex;margin:0 0 0 8px}
.blkbar .blkn{min-width:0;overflow-wrap:anywhere}
.blkbar{touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab}
/* pointer drag with a live preview: the lifted block leaves a placeholder of its size, a translucent copy follows the pointer (fixed,
   outside every screen, never a block), the containers that can take it are outlined; a keyboard move flashes the moved block */
.arrph{flex:0 0 auto;box-sizing:border-box;max-width:100%;border:2px dashed var(--acc);border-radius:4px;background:transparent}
.arrlift{display:none!important}
.arrghost{position:fixed;left:0;top:0;z-index:60;pointer-events:none;opacity:.65;box-sizing:border-box;overflow:hidden;background:var(--card);border:1px solid var(--acc);border-radius:4px}
.arrdragging .arrdrop{outline:2px solid var(--acc);outline-offset:2px}
body.arrdragging,body.arrdragging *{user-select:none;-webkit-user-select:none;cursor:grabbing}
.arrflash{outline:2px dashed var(--acc)!important;outline-offset:2px}
@media (prefers-reduced-motion:no-preference){.arrflash{animation:arrfl .7s ease-out}}
@keyframes arrfl{from{background:var(--ban)}}
.blkbar button{padding:0 6px;font-size:12px;line-height:1.5}
.blkbar button[data-blkact=drag]{cursor:grab}
.blkbar .blkn{color:var(--hint)}
.blkpanel{background:var(--ban);border:1px solid var(--banl);border-radius:4px;padding:6px 10px;margin:8px 10px 0;display:flex;flex-direction:column;gap:6px;position:sticky;top:var(--hdh,34px);z-index:4}
.blkpanel details>summary{font-size:12px}
.blkpanel[hidden]{display:none}
.blkpanel>.row{flex-wrap:wrap}
.blkpanel select,.blkpanel label{max-width:100%}
.blkpanel input[type=text]{width:auto;min-width:12em}
@media (max-width:700px){.blk.fld>label.f,.blk.fld>label.f.chk{grid-template-columns:minmax(0,1fr)}}
/* searchKit (owner 2026-11-19, every search or filter box): the box with Browse and History right beside it, the suggestion list under it
   (history first, then index hits, a "show more" row). Browse = the folder / file picker (dialog#pk). Contract: function searchKit, tools/gui/README.md */
.sk{position:relative;display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px;max-width:100%;min-width:0;vertical-align:middle}
.sk>input{flex:1 1 auto;min-width:6em}
.sk.sk-wide{display:flex;flex:1 1 auto;width:100%}.sk.sk-wide>input{width:auto!important}
.sk-btn{padding:1px 7px;font-size:12px;white-space:nowrap;flex:0 0 auto}
.sk-dd{position:absolute;left:0;top:100%;z-index:30;margin-top:2px;min-width:min(100%,22em);max-width:min(44em,94vw);max-height:min(50vh,26em);overflow:auto;background:var(--card);color:var(--fg);border:1px solid var(--btnl);border-radius:4px;box-shadow:0 4px 14px var(--shadow);padding:2px 0;text-align:left;font-weight:normal}
.sk-dd[hidden]{display:none}.sk-dd.sk-fix{position:fixed;margin:0;z-index:1000}.sk-dd.sk-up{box-shadow:0 -4px 14px var(--shadow)}
.sk-o{display:flex;gap:6px;align-items:baseline;padding:3px 8px;cursor:pointer;white-space:nowrap}
.sk-o[aria-selected=true]{background:var(--sel)}.sk-o:hover{background:var(--hov)}
.sk-lab{overflow:hidden;text-overflow:ellipsis;min-width:0}
.sk-tag{font-size:10px;padding:0 5px;border-radius:7px;background:var(--chip);color:var(--hint);flex:0 0 auto}
.sk-hint{color:var(--hint);font-size:12px;overflow:hidden;text-overflow:ellipsis;min-width:0}
.sk-x{margin-left:auto;padding:0 5px;font-size:11px;line-height:1.3;flex:0 0 auto}
.sk-clr{color:var(--link);font-size:12px}
.sk-note{padding:3px 8px;color:var(--hint);font-size:12px;white-space:normal}
@media (max-width:700px){.sk{flex-wrap:wrap}.sk>input{flex:1 1 100%}}
/* jump back bar (JUMPS): fixed at the bottom centre, shown while the jump list has an entry; under dialogs, the search lists and the map place picker */
#jmpbar{position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:45;display:flex;max-width:min(44em,calc(100vw - 16px));background:var(--tip);color:var(--tipfg);border:1px solid var(--tipl);border-radius:16px;box-shadow:0 2px 8px var(--shadow);overflow:hidden}#jmpbar[hidden]{display:none}
#jmpbar button{background:none;color:inherit;border:0;border-radius:0;font:inherit;cursor:pointer;padding:5px 10px;min-height:28px}#jmpbar button:hover{background:var(--hdl)}#jmpbar button:focus-visible{outline:2px solid var(--acc);outline-offset:-2px}
#jmpback{display:flex;gap:6px;align-items:center;min-width:0;flex:1 1 auto;text-align:left}#jmpback .jl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}#jmpback .jn{flex:0 0 auto;border:1px solid var(--tipl);border-radius:9px;padding:0 6px;font-size:11px}#jmpback .jn[hidden]{display:none}
#jmpbar #jmpx{flex:0 0 auto;border-left:1px solid var(--tipl)}#jmpbar button[hidden]{display:none}
/* current jobs (JOBS): #jobbtn is the left part of the same bar, #joblist opens above it (half the window at most, scrolls inside) */
#jobbtn{display:flex;gap:6px;align-items:center;min-width:0;flex:0 1 auto;text-align:left}#jobbtn:not([hidden])+#jmpback{border-left:1px solid var(--tipl)}
#jobbtn .jbl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}#jobbtn .jbx{flex:0 0 auto;white-space:nowrap;opacity:.85}#jobbtn .jbm{flex:0 0 auto;border:1px solid var(--tipl);border-radius:9px;padding:0 6px;font-size:11px}#jobbtn .jbm[hidden]{display:none}
#jmpbar .jlive{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
#joblist{position:fixed;left:50%;bottom:46px;transform:translateX(-50%);z-index:45;width:min(46em,calc(100vw - 16px));max-height:50vh;overflow:auto;box-sizing:border-box;background:var(--tip);color:var(--tipfg);border:1px solid var(--tipl);border-radius:8px;box-shadow:0 2px 8px var(--shadow)}#joblist[hidden]{display:none}
#joblist .jhd{display:flex;gap:10px;justify-content:space-between;align-items:center;padding:5px 10px;font-weight:600}
#joblist .jr{display:flex;flex-wrap:wrap;gap:3px 10px;align-items:center;padding:5px 10px;border-top:1px solid var(--tipl)}
#joblist .jrn{flex:1 1 12em;min-width:0;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#joblist .jrg,#joblist .jrs,#joblist .jrp,#joblist .jrst{flex:0 0 auto;font-size:12px;white-space:nowrap}#joblist .jrg{opacity:.85}
#joblist .jrw{flex:1 1 100%;font-size:12px;opacity:.85}#joblist .jrw:empty{display:none}
#joblist button{background:none;color:inherit;border:1px solid var(--tipl);border-radius:4px;font:inherit;cursor:pointer;padding:2px 8px;min-height:26px}#joblist button.jrn{border-color:transparent;text-decoration:underline}
#joblist button:hover{background:var(--hdl)}#joblist button:focus-visible{outline:2px solid var(--acc);outline-offset:-2px}#joblist button:disabled{opacity:.55;cursor:default;background:none}
#joblist button.danger{background:var(--dan);color:var(--prifg);border-color:var(--danl)}
body.jmpon{padding-bottom:46px}body.jmpon #toast{bottom:52px}
@media (max-width:700px){#jmpbar{bottom:6px}#jmpbar button{padding:8px 12px;min-height:36px}body.jmpon{padding-bottom:54px}body.jmpon #toast{bottom:56px}#joblist{bottom:50px}#joblist button{padding:6px 12px;min-height:36px}}
</style>
<a id=skip class=skip href=#main></a>
<header id=hdr>
<b class=brand>ARSENAL</b><div id=games role=tablist></div><span id=runoff></span><span id=modchip></span><button id=modchg aria-describedby=modchip></button>
<span id=runstate></span><span id=livest role=status hidden></span><button id=cancel hidden class=danger></button><button id=rmbtn type=button hidden aria-haspopup=dialog></button><button id=hdmore aria-expanded=false aria-controls=hdr></button>
<span id=gamebar></span><span class=hx><span id=hdlockhd></span><span id=themebox></span><span id=langbox></span></span>
<button id=advchip type=button hidden></button><span id=community></span>
<div id=taskrow></div><nav id=nav role=tablist></nav>
<div id=subnav role=tablist hidden></div>
<div id=pagenav role=tablist hidden></div>
</header>
<div id=rmban role=note hidden></div>
<main id=main tabindex=-1></main>
<div id=nabox hidden></div>
<footer><details id=footd><summary id=footq></summary><div id=foot></div></details></footer>
<dialog id=pk><div class=hd><button id=pkup></button><input id=pkpath type=text><button id=pkgo></button><button id=pkview type=button hidden></button><button id=pkx type=button style="margin-left:auto"></button></div>
<div class=hd style="padding-top:0"><input id=pkq type=search autocomplete=off style="flex:1"></div>
<div id=pkerr class=err role=alert hidden></div><div class=list id=pklist tabindex=0 role=listbox></div>
<div class=ft><span class=hint id=pkhint style="flex:1"></span><button id=pkuse class=primary></button><button id=pkno></button></div></dialog>
<div id=toast role=status></div>
<script>
(function(){
'use strict';
var $=function(i){return document.getElementById(i)};
// gui.js puts window.AS2CFG before this script: live (open the event stream), dev, remote (a LAN Remote page on another device: view only), rOn (LAN Remote is on)
var CFG=(typeof window!=='undefined'&&window.AS2CFG)||{},RMT=!!CFG.remote;
// h(tag,attrs,kids): attrs.blk = a block id (class blk, data-blk), attrs.box = col|row|grid|cols|ncols makes it a container block (blocks: see below)
function h(tag,attrs,kids){var e=document.createElement(tag);if(attrs)for(var k in attrs){var v=attrs[k];if(v==null||v===false||k==='blk'||k==='box')continue;if(k==='class')e.className=v;else if(k==='text')e.textContent=v;else if(k.slice(0,2)==='on')e.addEventListener(k.slice(2),v);else if(v===true)e.setAttribute(k,'');else e.setAttribute(k,v)}
 if(attrs&&attrs.blk!=null){e.setAttribute('data-blk',String(attrs.blk));e.className=(e.className?e.className+' ':'')+'blk'+(attrs.box?' blc box-'+attrs.box:'')}
 (kids||[]).forEach(function(c){if(c==null)return;e.appendChild(typeof c==='string'?document.createTextNode(c):c)});return e}
// Window settings (tools/gui/settings.js): the server keeps them in one file, because localStorage belongs to one origin and the port
// (part of the origin) changes on each start. SET = the server copy, read once before the first draw (setLoad); LS.get reads it first,
// then localStorage. LS.set writes both; the server gets the change a moment later (setPush, one POST for a burst of changes).
// Only the names the server accepts are sent (SETKEY); never a token, a key or a password (SETDENY).
var SETKEY=new RegExp(__SETKEY__),SETDENY=new RegExp(__SETDENY__,'i'),SET=null,SETP={},SETT=null,SETERR=false;
function setOk(K){return SETKEY.test(K)&&!SETDENY.test(K)}
function setSay(j){if(SETERR||!j||!j.key)return;SETERR=true;toast(tx(j.key,j.params||{}),9000)}
function setFlush(keep){clearTimeout(SETT);SETT=null;var b=SETP;SETP={};if(!Object.keys(b).length)return;
 try{fetch('/api/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({set:b}),keepalive:!!keep}).then(function(r){if(r.ok){SETERR=false;return}return r.json().then(setSay,function(){})}).catch(function(){})}catch(e){}}
function setPush(K,v){if(RMT||SET===null||!setOk(K))return;SETP[K]=v;clearTimeout(SETT);SETT=setTimeout(setFlush,400)}
var LS={get:function(k,d){var K='as2gui.'+k;if(SET&&Object.prototype.hasOwnProperty.call(SET,K))return SET[K];try{var v=localStorage.getItem(K);return v==null?d:JSON.parse(v)}catch(e){return d}},
 set:function(k,v){var K='as2gui.'+k;if(v===undefined)v=null;if(SET)SET[K]=v;try{localStorage.setItem(K,JSON.stringify(v))}catch(e){}setPush(K,v)}};
// j = GET /api/settings. An empty server file and values in this origin's localStorage (the first start after this change): push them up once
var SETFILE='',FIRSTRUN=false;   // FIRSTRUN: the server settings file was empty at load (a first start; never with settings kept in memory only, as in tests; the page goes to Settings only when no game folder is found either); SETFILE: where the server keeps them ('' = this run only); the Help page names it
function setLoad(j){if(!j||!j.settings||typeof j.settings!=='object')return;SET={};SETFILE=j.file||'';var s=j.settings;Object.keys(s).forEach(function(K){if(setOk(K))SET[K]=s[K]});
 if(j.empty){var up={},n=0;try{for(var i=0;i<localStorage.length;i++){var K=localStorage.key(i);if(!K||!setOk(K))continue;try{up[K]=JSON.parse(localStorage.getItem(K));SET[K]=up[K];n++}catch(e){}}}catch(e){}
  FIRSTRUN=!!SETFILE;if(n){SETP=up;setFlush()}}
 // the header lock: a server file from before this key takes this origin's value once; the server value is copied to this origin so the
 // next load here draws the header right before the settings arrive
 try{var HK='as2gui.hdlock';if(Object.prototype.hasOwnProperty.call(SET,HK))localStorage.setItem(HK,JSON.stringify(SET[HK]));
  else{var hv=localStorage.getItem(HK);if(hv!=null&&!j.empty){hv=JSON.parse(hv);SET[HK]=hv;setPush(HK,hv)}}}catch(e){}
 if(j.problem&&j.problem.key)toast(tx(j.problem.key,j.problem.params||{}),9000)}
if(typeof window!=='undefined'){window.as2Settings={flush:setFlush};if(window.addEventListener)window.addEventListener('pagehide',function(){setFlush(true)})}
// ---------- language: LANGS = {en,ru,uk,zh} from tools/gui/lang/*.json. Choice kept in a cookie (shared by every port, so it survives a restart on a new random port) and in localStorage; first start follows the OS/browser language.
var LANGS=__LANGS__;
function getCookie(){try{var m=/(?:^|;\s*)as2lang=([a-z]+)/.exec(document.cookie||'');return m?m[1]:null}catch(e){return null}}
function detectLang(){var l=[];try{l=(navigator.languages&&navigator.languages.length)?navigator.languages:[navigator.language]}catch(e){}
 for(var i=0;i<l.length;i++){var c=String(l[i]||'').toLowerCase().slice(0,2);if(LANGS[c])return c}return 'en'}
var LANG=getCookie();if(!LANGS[LANG])LANG=LS.get('lang',null);if(!LANGS[LANG])LANG=detectLang();
function setLang(c){if(!LANGS[c])return;LS.set('lang',c);setFlush(true);try{document.cookie='as2lang='+c+'; max-age=31536000; path=/; SameSite=Strict'}catch(e){}
 if(typeof location!=='undefined'&&location.reload)location.reload()}
function tx(k,p){if(p&&p.n!=null&&String(p.n)==='1'&&(LANGS[LANG][k+'.1']!=null||LANGS.en[k+'.1']!=null))k=k+'.1';var s=LANGS[LANG][k];if(s==null)s=LANGS.en[k];if(s==null)return k;return p?s.replace(/\{(\w+)\}/g,function(m,n){return p[n]==null?m:String(p[n])}):s}
// The owner's decision (2026-11-10): the AS64 community Discord, shown in the header on every page. Only a link the user may click,
// opened in a new browser tab; the page never fetches anything from it. The one outside address the page holds (test-gui2 allows it).
var COMMUNITY='https://discord.gg/pgmfaaBVbf';
function applyStatic(){[['cancel','cancel'],['foot','foot'],['footq','foot.q'],['pkup','pk.up'],['pkgo','pk.go'],['pkuse','pk.use'],['pkno','pk.cancel']].forEach(function(p){var e=$(p[0]);if(e)e.textContent=tx(p[1])});
 var a=$('pkpath');if(a)a.setAttribute('aria-label',tx('pk.path'));
 try{document.documentElement.setAttribute('lang',LANG)}catch(e){}
 var sk=$('skip');if(sk)sk.textContent=tx('hd.skip');
 var hm=$('hdmore');if(hm){hm.textContent=tx('hd.more');hm.title=tx('hd.more');hm.onclick=function(){var hd=$('hdr');if(!hd)return;var on=!hd.classList.contains('more');if(on)hd.classList.add('more');else hd.classList.remove('more');hm.setAttribute('aria-expanded',on?'true':'false')}}
 var cm=$('community');if(cm){cm.textContent='';cm.appendChild(h('a',{id:'communitylink',href:COMMUNITY,target:'_blank',rel:'noopener noreferrer',title:tx('hd.communityT'),text:tx('hd.community')}))}
 var mc=$('modchg');if(mc){mc.textContent=tx('mod.change');mc.title=tx('mod.changeT');mc.onclick=function(){changeMod()}}
 applyTheme(LS.get('theme','auto'));
 var hb=$('hdlockhd');if(hb){var hk=h('input',{type:'checkbox',onchange:function(){LS.set('hdlock',!!hk.checked);applyHdLock()}});hk.checked=hdLock();hb.textContent='';hb.appendChild(h('label',{title:tx('hd.lockT')},[hk,h('span',{text:tx('hd.lock')})]))}
 var tb=$('themebox');if(tb){var ts=h('select',{'aria-label':tx('theme.label'),title:tx('theme.label'),onchange:function(){LS.set('theme',ts.value);applyTheme(ts.value)}},['auto','light','dark'].map(function(v){return h('option',{value:v,text:tx('theme.'+v)})}));ts.value=LS.get('theme','auto');tb.textContent='';tb.appendChild(ts)}
 var lb=$('langbox');if(lb){var sel=h('select',{'aria-label':tx('lang.label'),title:tx('lang.label'),onchange:function(){setLang(sel.value)}},Object.keys(LANGS).map(function(c){return h('option',{value:c,text:LANGS[c]['lang.name']})}));sel.value=LANG;lb.textContent='';lb.appendChild(sel)}}
// GT-37: auto follows the OS (CSS prefers-color-scheme); light or dark is pinned on the html element
function applyTheme(v){try{var r=document.documentElement;if(v==='light'||v==='dark')r.setAttribute('data-theme',v);else if(r.removeAttribute)r.removeAttribute('data-theme')}catch(e){}themeFire()}
// W6: canvas and SVG drawing reads colour tokens at draw time (cssv) and redraws through onTheme(fn,key): fn runs after the header
// switch and after the OS light/dark change. A key replaces the earlier fn with the same key, so a page that redraws does not pile up
// listeners. Feature tests only (getComputedStyle, matchMedia), so the test fake DOM runs it as a no-op.
var THEMEFN=[];
function cssv(n,d){try{if(typeof getComputedStyle!=='function')return d||'';var v=String(getComputedStyle(document.documentElement).getPropertyValue(n)||'').trim();return v||d||''}catch(e){return d||''}}
function onTheme(fn,key){if(typeof fn!=='function')return function(){};if(key!=null)THEMEFN=THEMEFN.filter(function(x){return x.k!==key});var it={f:fn,k:key};THEMEFN.push(it);
 return function(){THEMEFN=THEMEFN.filter(function(x){return x!==it})}}
function themeFire(){(THEMEFN||[]).slice().forEach(function(x){try{x.f()}catch(e){}})}
if(typeof window!=='undefined'){window.onTheme=onTheme;window.cssv=cssv}
try{if(typeof window!=='undefined'&&typeof window.matchMedia==='function'){var mq=window.matchMedia('(prefers-color-scheme: dark)');
 if(mq&&mq.addEventListener)mq.addEventListener('change',themeFire);else if(mq&&mq.addListener)mq.addListener(themeFire)}}catch(e){}
applyStatic();applyHdLock();   // the header lock from this origin at once (the server value follows in setLoad)
function toast(m,ms){var t=$('toast');t.textContent=m;t.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(function(){t.style.display='none'},ms||3500)}
// IDE: one shared tooltip. tip(el,text,shortcut) shows what a control does and its key, on hover (after 450 ms) and on keyboard focus;
// Esc, leaving, blur and a click hide it. The text is also the accessible name when the control has no text of its own.
var TIP={el:null,t:0,of:null};
function tipHide(){clearTimeout(TIP.t);TIP.of=null;if(TIP.el)TIP.el.style.display='none'}
function tipShow(el){if(!el._tip||!el._tip[0])return;if(!TIP.el){TIP.el=h('div',{id:'tip',role:'tooltip'});document.body.appendChild(TIP.el)}
 var t=TIP.el;t.textContent='';t.appendChild(h('span',{text:el._tip[0]}));if(el._tip[1])t.appendChild(h('kbd',{text:el._tip[1]}));t.style.display='block';
 var r=el.getBoundingClientRect?el.getBoundingClientRect():{left:0,top:0,bottom:0},w=t.offsetWidth||0,th=t.offsetHeight||0,vw=(typeof window!=='undefined'&&window.innerWidth)||1200,vh=(typeof window!=='undefined'&&window.innerHeight)||800;
 var y=r.bottom+6;if(y+th>vh-4)y=Math.max(4,r.top-th-6);t.style.left=Math.max(4,Math.min(r.left,vw-w-4))+'px';t.style.top=y+'px';TIP.of=el}
function tip(el,text,shortcut){if(!el)return el;var first=!el._tip;el._tip=[String(text||''),shortcut?String(shortcut):''];
 if(!el.textContent&&el.setAttribute)el.setAttribute('aria-label',el._tip[0]);
 if(shortcut&&el.setAttribute)el.setAttribute('aria-keyshortcuts',String(shortcut).replace(/Ctrl/g,'Control'));
 if(!first||!el.addEventListener)return el;
 el.addEventListener('mouseenter',function(){clearTimeout(TIP.t);TIP.t=setTimeout(function(){tipShow(el)},450)});
 el.addEventListener('mouseleave',tipHide);el.addEventListener('blur',tipHide);el.addEventListener('mousedown',tipHide);
 el.addEventListener('focus',function(){var kb=true;try{kb=el.matches(':focus-visible')}catch(e){}if(kb)tipShow(el)});return el}
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&TIP.of)tipHide()},true);
if(typeof window!=='undefined')window.tip=tip;
function sep(p){return p.indexOf('\\')>=0?'\\':'/'}
function join(a,b){return a.replace(/[\\\/]+$/,'')+sep(a)+b}
// GX-next idiot pass: one wording for "game folder not set" (I-29); a POST started by a card button greys that card's buttons until the reply (double click, I-30)
var NOGAME=/^(the game folder is not set|the game folder was not found|no game folder found)/i;
var CLICKED=null;document.addEventListener('click',function(e){var t=e.target;while(t&&t.tagName!=='BUTTON')t=t.parentNode;CLICKED=t||null;setTimeout(function(){CLICKED=null},0)},true);
// JUMPS, the jump back bar (owner 2026-11-20): a floating bar at the bottom centre that shows once a click took the user somewhere else;
// each click on it goes back one jump, newest first. A jump is (a) a change of game, page, sub-tab, item or view: show, switchGame and
// viewSet report the place left (jmpIn / jmpOut), so every page gets it with no code of its own; (b) a position jump on the same page:
// a click (or Enter) starts a short watch, and when a scroll container (the window or any element) then moves by more than half its
// height without a wheel, touch or scroll key, the place of the click is kept. Not jumps: the user's own scrolling, typing, folds, a log
// that follows its end, a list that got shorter, and going back through the bar. In memory only, 30 places, no two equal in a row.
// For pages: JUMPS.mark(label) keeps the current place now (before a jump the watch cannot see), JUMPS.back(), JUMPS.clear(), JUMPS.size().
var JMP={st:[],w:null,busy:false,ready:false,depth:0,last:new WeakMap(),bar:null,rest:null,max:30};
function jmpWin(){return typeof window!=='undefined'?window:{}}
function jmpDoc(){return document.scrollingElement||document.documentElement||null}
function jmpTop(el){if(el&&el!==document)return el.scrollTop||0;var w=jmpWin(),d=jmpDoc();return w.pageYOffset||w.scrollY||(d&&d.scrollTop)||0}
function jmpView(el){var d=document.documentElement,v=el&&el!==document?el.clientHeight:(jmpWin().innerHeight||(d&&d.clientHeight));return v>0?v:600}
function jmpRoom(el){var d=el&&el!==document?el:jmpDoc();return d?(d.scrollHeight||0)-jmpView(el):0}
function jmpKey(){return GID+'|'+(S.cur||'')+'|'+((S.cur&&S.view&&S.view[S.cur])||'')}
function jmpId(p){return p.game+'|'+p.page+'|'+p.view}
// the title of the block a click was in: the nearest heading, fold summary or legend above it, inside the page
function jmpBlock(t){for(var i=0;t&&i<14&&t!==document.body;i++,t=t.parentNode){var ks=t.children||[];
  for(var j=0;j<ks.length&&j<4;j++)if(/^(H1|H2|H3|H4|SUMMARY|LEGEND)$/.test(ks[j].tagName||'')){var s=String(ks[j].textContent||'').replace(/\s+/g,' ').trim();if(s)return s.length>48?s.slice(0,47)+'…':s}
  if(t.tagName==='SECTION'&&t.getAttribute&&t.getAttribute('data-id')!=null)break}
 return ''}
function jmpHere(t,label){var v=(S.cur&&S.view&&S.view[S.cur])||'',path='';
 try{if(S.cur)path=pagePath(v?S.cur+'/'+v:S.cur)}catch(e){}
 return {game:GID,page:S.cur||'',view:v,path:path,block:label!=null?String(label):(t?jmpBlock(t):''),win:jmpTop(document),el:null,top:0}}
function jmpPush(p){if(!p||!p.page)return;var a=JMP.st,q=a[a.length-1];JMP.rest=null;
 if(q&&jmpId(q)===jmpId(p)&&q.el===p.el&&Math.abs(q.top-p.top)<4&&Math.abs(q.win-p.win)<4)return;
 a.push(p);if(a.length>JMP.max)a.shift();jmpDraw()}
function jmpBar(){if(JMP.bar)return JMP.bar;var b={};
 b.lab=h('span',{class:'jl'});b.n=h('span',{class:'jn',hidden:true});
 b.back=h('button',{type:'button',id:'jmpback',onclick:function(){jmpBack()}},[h('span',{'aria-hidden':'true',text:'←'}),b.lab,b.n]);
 b.x=h('button',{type:'button',id:'jmpx',text:'×',onclick:function(){jmpClear()}});
 // JOBS share the bar: #jobbtn on the left, the list above the bar, one polite line for a job that ended
 b.jl=h('span',{class:'jbl'});b.jx=h('span',{class:'jbx'});b.jm=h('span',{class:'jbm',hidden:true});
 b.job=h('button',{type:'button',id:'jobbtn','aria-expanded':'false','aria-controls':'joblist',hidden:true,onclick:function(){jobOpen(!JOB.open)}},[b.jl,b.jx,b.jm]);
 b.live=h('span',{id:'joblive',class:'jlive',role:'status','aria-live':'polite'});
 b.list=h('div',{id:'joblist',role:'list',hidden:true});
 b.el=h('div',{id:'jmpbar',role:'group',hidden:true},[b.job,b.back,b.x,b.live]);document.body.appendChild(b.list);document.body.appendChild(b.el);JMP.bar=b;return b}
function jmpInBar(t){var b=JMP.bar;if(!b)return false;for(;t;t=t.parentNode)if(t===b.el||t===b.list)return true;return false}
function jmpText(p){var s=String(p.path||p.page).split(' > ').join(' › ');if(p.game!==GID){var g=gOf(p.game);if(g&&g.name)s=g.name+' › '+s}
 return p.block?tx('jmp.toB',{p:s,b:p.block}):tx('jmp.to',{p:s})}
function jmpDraw(){var a=JMP.st,n=a.length,jn=JOB.ord.length;if(!n&&!jn&&!JMP.bar)return;var b=jmpBar();b.el.hidden=!n&&!jn;b.back.hidden=!n;b.x.hidden=!n;
 try{var bd=document.body;if(n||jn)bd.classList.add('jmpon');else bd.classList.remove('jmpon')}catch(e){}
 b.el.setAttribute('aria-label',n?tx('jmp.bar'):tx('job.bar'));jobDraw(b);
 if(!n)return;var s=jmpText(a[n-1]);b.lab.textContent=s;b.n.hidden=n<2;b.n.textContent=n>1?String(n):'';b.n.title=n>1?tx('jmp.left',{n:n}):'';
 b.back.title=tx('jmp.tip');b.back.setAttribute('aria-label',n>1?s+'. '+tx('jmp.left',{n:n}):s);
 b.x.title=tx('jmp.clear');b.x.setAttribute('aria-label',tx('jmp.clear'))}
function jmpSet(el,y){if(el)el.scrollTop=y;else{var w=jmpWin(),d=jmpDoc();if(typeof w.scrollTo==='function')w.scrollTo(w.pageXOffset||0,y);else if(d)d.scrollTop=y}JMP.last.set(el||document,y)}
// the page may still be drawing: wait (10 tries, 80 ms apart) until the window and the container are tall enough, then set both
function jmpScroll(p,k){var el=p.el&&p.el.isConnected!==false?p.el:null;
 if(k>=10||((p.win<3||jmpRoom(null)>=p.win-2)&&(!el||jmpRoom(el)>=p.top-2))){JMP.rest=null;jmpSet(null,p.win);if(el)jmpSet(el,p.top);return}
 setTimeout(function(){if(JMP.rest===p)jmpScroll(p,k+1)},80)}
function jmpBack(){var p=JMP.st.pop();jmpDrop();if(!p){jmpDraw();return false}JMP.busy=true;
 try{if(p.game!==GID&&gOf(p.game))switchGame(p.game,p.view?p.page+'/'+p.view:p.page);else if(jmpId(p)!==jmpKey())show(p.page,p.view||null)}catch(e){}
 JMP.busy=false;jmpDraw();JMP.rest=p;jmpScroll(p,0);return true}
function jmpClear(){JMP.st.length=0;JMP.rest=null;jmpDrop();jmpDraw()}
function jmpIn(){return JMP.depth++?null:jmpHere(null,'')}
function jmpOut(b){JMP.depth--;if(!b||!b.page||!JMP.ready||JMP.busy||jmpId(b)===jmpKey())return;jmpDrop();jmpPush(b)}
function jmpDrop(){var w=JMP.w;JMP.w=null;if(w){clearTimeout(w.t1);clearTimeout(w.t2)}}
// the end of a watch (fin) or a quiet moment in it: the container that moved furthest, by more than half its height, makes the jump
function jmpCheck(fin){var w=JMP.w;if(!w)return;if(jmpId(w.p)!==jmpKey()){jmpDrop();return}
 var best=null,br=0;w.seen.forEach(function(s){var now=jmpTop(s.el),end=now>=jmpRoom(s.el)-2;
  if(end&&(now<s.from||s.el!==document))return;   // a shorter list pulled the view up, or a log follows its end: not a jump
  var r=Math.abs(now-s.from)/Math.max(120,jmpView(s.el));if(r>br){br=r;best=s}});
 if(best&&br>0.5){var p=w.p;if(best.el===document)p.win=best.from;else{p.el=best.el;p.top=best.from}jmpDrop();jmpPush(p);return}
 if(fin)jmpDrop()}
function jmpArm(e){if(!JMP.ready||JMP.busy)return;var t=(e&&e.target)||null,n;if(jmpInBar(t))return;
 jmpCheck(true);var w={p:jmpHere(t),seen:[]};JMP.w=w;JMP.rest=null;
 JMP.last.set(document,w.p.win);for(n=t;n&&n!==document&&typeof n==='object';n=n.parentNode)if(n.scrollTop)JMP.last.set(n,n.scrollTop);
 w.t1=setTimeout(function(){if(JMP.w===w)jmpCheck(false)},400);w.t2=setTimeout(function(){if(JMP.w===w)jmpCheck(true)},1500)}
function jmpOnScroll(e){var el=e&&e.target;if(!el||typeof el!=='object')return;if(el===document.documentElement||el===document.body||el===jmpWin())el=document;
 var prev=JMP.last.get(el),cur=jmpTop(el);JMP.last.set(el,cur);var w=JMP.w;if(!w)return;
 for(var i=0;i<w.seen.length;i++)if(w.seen[i].el===el)break;
 if(i===w.seen.length)w.seen.push({el:el,from:prev==null?0:prev});
 clearTimeout(w.t1);w.t1=setTimeout(function(){if(JMP.w===w)jmpCheck(false)},160)}
function jmpOnKey(e){var k=e&&e.key,t=(e&&e.target)||null,tag=(t&&t.tagName)||'';
 if(k==='Enter'){if(!/^(BUTTON|A|SUMMARY|TEXTAREA)$/.test(tag)&&!(t&&t.isContentEditable))jmpArm(e);return}   // Enter on a button comes as a click
 if(/^(PageUp|PageDown|Home|End|ArrowUp|ArrowDown)$/.test(k||'')||(k===' '&&!/^(BUTTON|INPUT|TEXTAREA|SELECT|SUMMARY|A)$/.test(tag)))jmpDrop()}
document.addEventListener('click',jmpArm,true);document.addEventListener('scroll',jmpOnScroll,true);document.addEventListener('keydown',jmpOnKey,true);
document.addEventListener('wheel',jmpDrop,{capture:true,passive:true});document.addEventListener('touchmove',jmpDrop,{capture:true,passive:true});
document.addEventListener('mousedown',function(e){if(jmpInBar(e&&e.target))return;jmpCheck(true)},true);
if(typeof window!=='undefined')window.JUMPS={mark:function(label){jmpDrop();jmpPush(jmpHere(null,label==null?'':label))},back:jmpBack,clear:jmpClear,size:function(){return JMP.st.length}};
// JOBS, the current job list (README.md "JOBS", contract 1): every piece of work the page started (a request still open after 0.6 s, a
// run, work a page reports with JOBS.track) and every job the server lists (GET /api/jobs) is one row in #joblist, opened by #jobbtn in
// the footer bar (the bar of JUMPS). The server is asked every 1.5 s while anything is listed, every 15 s when idle; same id = same job:
// the server's state and progress win, the page's own name wins. Every request carries its id in the header x-arsenal-job.
// For pages: api(url, body, {what:'ready text'}) names a request; {job:false} keeps it out; a GET that is a poll goes into JOBSKIP.
// JOBS.track(promise, {what, page, cancel}) lists work that goes around api(); JOBS.fetch(url, init, opt) is fetch with the header and the list.
var JOB={m:{},ord:[],own:{},seen:{},subs:[],open:false,sq:0,fails:0,pollT:null,tickT:null,arm:'',armT:null,rows:{},wait:600,keep:10000,fast:1500,slow:15000};
// GET requests that are polls, never listed (a POST is always work). p tests the path, q the query; a row with both needs both.
// (a space after p: and q: on purpose: the page must not hold anything that reads like a drive path)
function jobT(f,ms){var t=setTimeout(f,ms);if(t&&t.unref)t.unref();return t}   // a job timer never keeps a test process alive
var JOBSKIP=[
 {p: /\/(status|progress|joblist|jobs)$/},
 {p: /\/(job|run)$/, q: /(^|&)id=/},
 {p: /^\/api\/(jobs|health|settings)$/},
 {q: /(^|&)wait=1(&|$)/}];
var JOBST={running:'job.s.running',done:'job.s.done',failed:'job.s.failed',cancelled:'job.s.cancelled',timeout:'job.s.timeout'};
// the names the server gives its background jobs (record field what); a key not in the language files shows as its last part
var JOBW=['job.w.mapviz','job.w.previews','job.w.guides','job.w.docsjoin','job.w.botmatch','job.w.mapslist','job.w.modcheck','job.w.spmis','job.w.task','job.w.step'];
var JOBGAME={as64:'AS64',mowas2:'MoW:AS2',goh:'Gates of Hell'};
function jobIsPoll(url,get){if(!get)return false;var u=String(url==null?'':url),i=u.indexOf('#');if(i>=0)u=u.slice(0,i);i=u.indexOf('?');
 var p=(i<0?u:u.slice(0,i)).replace(/^https?:\/\/[^\/]+/,''),q=i<0?'':u.slice(i+1);
 for(var k=0;k<JOBSKIP.length;k++){var r=JOBSKIP[k];if((!r.p||r.p.test(p))&&(!r.q||r.q.test(q)))return true}return false}
function jobNewId(c){var a='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',s=c||'x';for(var i=0;i<12;i++)s+=a.charAt(Math.floor(Math.random()*a.length));return s}
function jobCut(s,n){s=String(s==null?'':s).replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n-1)+'…':s}
// a page's name as the tabs show it: the last part of tab > sub-tab > item
function jobPg(p,v){var s='';try{if(p)s=pagePath(v?p+'/'+v:p)}catch(e){}s=String(s||p||'');var i=s.lastIndexOf(' > ');return i<0?s:s.slice(i+3)}
function jobBtnText(b){if(!b)return '';var s=jobCut(b.textContent,60);if(!s&&b.getAttribute)s=jobCut(b.getAttribute('aria-label')||b.getAttribute('title')||b.title||'',60);return s}
// "<page name>: <text of the clicked button>"; no button clicked: alt (a run's command) or "working"
function jobDefName(alt){var pg='',b=jobBtnText(CLICKED)||alt||tx('job.work');try{pg=jobPg(S.cur,S.cur&&S.view?S.view[S.cur]:'')}catch(e){}return jobCut(pg?tx('job.name',{p:pg,b:b}):b,60)}
function jobHere(){var o={page:'',view:'',game:''};try{o.page=S.cur||'';o.view=(S.cur&&S.view&&S.view[S.cur])||'';o.game=GID||''}catch(e){}return o}
function jobNew(o){return {id:String(o.id),kind:o.kind||'req',name:o.name||'',what:'',whatP:null,page:o.page||'',view:o.view||'',game:o.game||'',state:'running',stage:'',done:null,total:null,
 t0:Date.now(),t1:0,dur:null,canCancel:!!o.cancel,writes:false,cmd:o.cmd||'',mine:!!o.mine,srv:false,syn:false,stop:o.cancel||null,stopping:false,shown:false,fin:false,tm:null}}
function jobList(j){if(JOB.m[j.id]||j.fin)return;JOB.m[j.id]=j;JOB.ord.push(j.id);j.shown=true;jobChanged();jobKick(0)}
function jobDrop(id){if(!JOB.m[id])return;delete JOB.m[id];var i=JOB.ord.indexOf(id);if(i>=0)JOB.ord.splice(i,1);if(JOB.arm===id)JOB.arm=''}
function jobErrState(e){return e&&(e.key==='job.cancelled'||e.status===499||e.name==='AbortError')?'cancelled':'failed'}
function jobSay(j){try{if(JMP.bar)JMP.bar.live.textContent=tx('job.end',{name:jobName(j),state:tx(JOBST[j.state]||'job.s.done')})}catch(e){}}
// the page saw its own work end: a listed job shows how it ended for 10 s, then goes (the server keeps its copy as long)
function jobEnd(j,state){if(j.fin)return;j.fin=true;clearTimeout(j.tm);JOB.own[j.id]=Date.now();if(!j.shown)return;
 j.stopping=false;if(j.auto){jobDrop(j.id);jobChanged();return}if(j.state==='running'){j.state=state||'done';j.t1=Date.now();jobSay(j)}
 jobT(function(){if(JOB.m[j.id]===j){jobDrop(j.id);jobChanged()}},JOB.keep);jobChanged()}
// o: {what, page, cancel} (README); also id, kind, cmd, now (list at once), state(value) -> the end state of a resolved promise
function jobTrack(p,o){o=o||{};var at=jobHere(),j=jobNew({id:o.id||jobNewId('p'),kind:o.kind,name:o.what?jobCut(o.what,80):jobDefName(o.cmd),page:o.page!=null?o.page:at.page,view:o.page!=null?'':at.view,game:at.game,cancel:typeof o.cancel==='function'?o.cancel:null,cmd:o.cmd,mine:true});
 j.auto=!o.cmd&&!o.cancel&&(jobNavClick(CLICKED)||(!!o.get&&!jobBtnText(CLICKED)));   // a GET nobody clicked for (a page reading its data): drawn as one shared row, gone when it ends
 JOB.own[j.id]=0;if(o.now)jobList(j);else j.tm=jobT(function(){jobList(j)},JOB.wait);
 Promise.resolve(p).then(function(v){var s='done';try{if(o.state)s=o.state(v)||'done'}catch(e){}jobEnd(j,s)},function(e){jobEnd(j,jobErrState(e))});return p}
// fetch with the job header; listed under the rules of api(): pending 0.6 s, not a poll, not opt.job===false. Resolves and rejects as fetch does.
// a click in the header (game tab, page tab, sub page) only opens a page: what it reads is page data, not a job of its own
function jobNavClick(el){try{return !!(el&&el.closest&&el.closest('header'))}catch(e){return false}}
function jobFetch(url,init,opt){init=init||{};var id=jobNewId('x'),get=!init.method||String(init.method).toUpperCase()==='GET';
 try{init.headers=init.headers||{};init.headers['x-arsenal-job']=id}catch(e){}
 var p=fetch(url,init);
 // a POST may have started a background job on the server: read the server list soon after it answers, not at the next slow poll
 if(!get){var nud=function(){if(Date.now()-(JOB.nudT||0)<2000)return;JOB.nudT=Date.now();jobT(jobSync,300)};try{p.then(nud,nud)}catch(e2){}}
 if((opt&&opt.job===false)||jobIsPoll(url,get)){JOB.own[id]=0;var fin=function(){JOB.own[id]=Date.now()};try{p.then(fin,fin)}catch(e){}return p}
 jobTrack(p,{id:id,get:get,what:opt&&opt.what,state:function(r){return !r||r.ok?'done':r.status===499?'cancelled':'failed'}});return p}
function jobSec(j){var ms=j.dur!=null?j.dur:(j.state==='running'?Date.now():(j.t1||Date.now()))-j.t0;return Math.max(0,Math.round(ms/1000))}
function jobProg(j){if(j.total>0&&j.done!=null)return tx('job.of',{a:j.done,b:j.total});var s=j.stage||'';if(!s)return '';
 return jobCut(/^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/.test(s)&&(LANGS[LANG][s]!=null||LANGS.en[s]!=null)?tx(s,j.whatP||undefined):s,40)}
function jobName(j){if(j.mine&&j.name)return j.name;
 if(j.what){var s=tx(j.what,j.whatP||undefined);if(s===j.what){var i=s.lastIndexOf('.');if(i>=0&&i<s.length-1)s=s.slice(i+1)}return jobCut(s,80)}
 var pg=jobPg(j.page,'');if(j.kind==='run'&&j.cmd)return jobCut(pg?tx('job.name',{p:pg,b:j.cmd}):j.cmd,80);
 return pg?tx('job.other',{p:pg}):tx('job.req')}
function jobGame(id){var g=id?gOf(id):null;return g&&g.name?g.name:(JOBGAME[id]||'')}
// '' = can be stopped now; else why not (a language key), '-' while the server has not answered yet, 'fin' when it ended
function jobWhy(j){if(j.state!=='running')return 'fin';if(j.stop)return '';if(!j.srv)return !j.syn?'-':j.kind==='req'?'job.r.gone':'job.r.nostop';
 if(!j.canCancel)return j.kind==='req'?'job.r.nochild':'job.r.nostop';return ''}
function jobCancel(id){var j=JOB.m[id];if(!j||j.stopping||jobWhy(j))return false;j.stopping=true;if(JOB.arm===id)JOB.arm='';
 if(j.stop){try{j.stop()}catch(e){}jobChanged();return true}
 jobChanged();api('/api/cancel',{id:j.id},{job:false}).then(function(){jobKick(0)},function(e){j.stopping=false;
  toast(e&&e.key==='job.e.nostop'?tx('job.e.nostop'):tx('job.e.cancel',{m:(e&&(e.text||e.message))||''}));jobChanged();jobKick(0)});return true}
function jobArm(id){JOB.arm=id;clearTimeout(JOB.armT);JOB.armT=jobT(function(){if(JOB.arm===id){JOB.arm='';jobChanged()}},8000);jobChanged()}
// a job that writes into a mod is stopped by the second click only ("Stop anyway?": files already written stay)
function jobCancelClick(id){var j=JOB.m[id];if(!j||j.stopping||jobWhy(j))return;if(j.writes&&JOB.arm!==id){jobArm(id);return}jobCancel(id)}
function jobCanAll(){return JOB.ord.filter(function(id){var j=JOB.m[id];return !j.stopping&&!jobWhy(j)})}
function jobCancelAll(){var a=jobCanAll();if(a.some(function(id){return JOB.m[id].writes})&&JOB.arm!=='*'){jobArm('*');return}JOB.arm='';a.forEach(jobCancel)}
function jobGo(j){if(!j||!j.page)return;try{if(j.game&&j.game!==GID&&gOf(j.game))switchGame(j.game,j.view?j.page+'/'+j.view:j.page);else if(S.sec&&S.sec[j.page])show(j.page,j.view||null)}catch(e){}}
function jobCanGo(j){try{return !!j.page&&((j.game&&j.game!==GID&&!!gOf(j.game))||!!(S.sec&&S.sec[j.page]))}catch(e){return false}}
function jobOpen(v){JOB.open=!!v&&JOB.ord.length>0;JOB.arm='';jmpDraw()}
function jobSig(){return JSON.stringify(JOB.ord.map(function(id){var j=JOB.m[id];return [id,j.kind,j.state,j.stage,j.done,j.total,j.canCancel,j.writes,j.what,j.whatP,j.srv,j.syn,j.page,j.game,j.stopping]}))}
function jobChanged(){jmpDraw();jobTickOn();var l=null;JOB.subs.slice().forEach(function(f){try{f(l||(l=jobPub()))}catch(e){}})}
function jobPub(){return JOB.ord.map(function(id){var j=JOB.m[id];return {id:j.id,kind:j.kind,name:jobName(j),what:j.what,whatP:j.whatP,page:j.page,game:j.game,state:j.state,stage:j.stage,done:j.done,total:j.total,
 startedMs:j.t0,seconds:jobSec(j),canCancel:!jobWhy(j),writes:j.writes,cmd:j.cmd,mine:j.mine,server:j.srv,stopping:j.stopping}})}
// the bar button: the newest running job, its progress or seconds, +N for the others; nothing running: how the last one ended
function jobAutos(){return JOB.ord.map(function(id){return JOB.m[id]}).filter(function(j){return j.auto&&j.state==='running'})}
function jobBarText(b){var run=[],last=null,au=jobAutos();JOB.ord.forEach(function(id){var j=JOB.m[id];if(j.auto)return;if(j.state==='running')run.push(j);else if(!last||j.t1>=last.t1)last=j});
 if(au.length&&!run.length){run=[au[0]]}else if(au.length)run.unshift(au[0]);
 var j=run.length?run[run.length-1]:last,more=run.length>1?run.length-1:0,nm=j.auto?tx('job.load',{n:au.length}):jobName(j),x=run.length?(jobProg(j)||tx('job.sec',{s:jobSec(j)})):tx(JOBST[j.state]||'job.s.done');
 b.jl.textContent=nm;b.jx.textContent=x;b.jm.hidden=!more;b.jm.textContent=more?'+'+more:'';b.jm.title=more?tx('job.more',{n:more}):'';
 b.job.title=tx('job.tip');b.job.setAttribute('aria-label',tx('job.bar')+': '+nm+', '+x+(more?', '+tx('job.more',{n:more}):''))}
function jobRowText(j,r){r.sec.textContent=tx('job.sec',{s:jobSec(j)});r.prog.textContent=j.state==='running'?jobProg(j):''}
function jobRow(j){var why=jobWhy(j),nm=jobName(j),armed=JOB.arm===j.id,r={};
 r.name=jobCanGo(j)?h('button',{type:'button',class:'jrn','data-jgo':j.id,title:tx('job.go'),text:nm,onclick:function(){jobGo(j)}}):h('span',{class:'jrn',text:nm});
 r.sec=h('span',{class:'jrs'});r.prog=h('span',{class:'jrp'});jobRowText(j,r);
 var kids=[r.name,h('span',{class:'jrg',text:jobGame(j.game)}),r.sec,r.prog],note='';
 if(why==='fin')kids.push(h('span',{class:'jrst',text:tx(JOBST[j.state]||'job.s.done')}));
 else{var cb=h('button',{type:'button','data-jcancel':j.id,class:armed?'danger':null,text:j.stopping?tx('job.stopping'):armed?tx('job.sure'):tx('job.cancel'),onclick:function(){jobCancelClick(j.id)}});
  cb.setAttribute('aria-label',cb.textContent+': '+nm);
  if(j.stopping||why){cb.disabled=true;if(why&&why!=='-'&&!j.stopping){note=tx(why);cb.title=note}}else if(armed)note=tx('job.sureN');
  kids.push(cb)}
 kids.push(h('span',{class:'jrw',text:note}));
 r.el=h('div',{class:'jr',role:'listitem','data-job':j.id},kids);return r}
function jobDraw(b){var n=JOB.ord.length;b.job.hidden=!n;if(!n)JOB.open=false;b.job.setAttribute('aria-expanded',JOB.open?'true':'false');
 if(n)jobBarText(b);
 var L=b.list;JOB.rows={};if(!JOB.open){L.hidden=true;L.textContent='';return}
 var fa=document.activeElement,fk=null;try{if(fa&&fa.getAttribute)fk=fa.getAttribute('id')==='jobcancelall'?['id','jobcancelall']:fa.getAttribute('data-jcancel')!=null?['data-jcancel',fa.getAttribute('data-jcancel')]:fa.getAttribute('data-jgo')!=null?['data-jgo',fa.getAttribute('data-jgo')]:null}catch(e){}
 L.textContent='';L.hidden=false;L.setAttribute('aria-label',tx('job.bar'));
 var can=jobCanAll(),all=null,hd=[h('span',{text:tx('job.bar')})];
 if(can.length>1){all=h('button',{type:'button',id:'jobcancelall',class:JOB.arm==='*'?'danger':null,text:JOB.arm==='*'?tx('job.sure'):tx('job.all'),onclick:jobCancelAll});hd.push(all)}
 L.appendChild(h('div',{class:'jhd',role:'presentation'},hd));
 if(JOB.arm==='*')L.appendChild(h('div',{class:'jr',role:'presentation'},[h('span',{class:'jrw',text:tx('job.sureN')})]));
 for(var i=n-1;i>=0;i--){var j=JOB.m[JOB.ord[i]];if(j.auto)continue;var r=jobRow(j);JOB.rows[j.id]=r;L.appendChild(r.el)}
 var au=jobAutos();if(au.length){var ar={sec:h('span',{class:'jrs'}),prog:h('span',{class:'jrp'})};jobRowText(au[0],ar);JOB.rows[au[0].id]=ar;
  L.appendChild(h('div',{class:'jr',role:'listitem','data-jobauto':'1'},[h('span',{class:'jrn',text:tx('job.load',{n:au.length})}),ar.sec,h('span',{class:'jrw',text:tx('job.loadN')})]))}
 if(fk)try{var es=L.querySelectorAll('button');for(var k=0;k<es.length;k++)if(es[k].getAttribute(fk[0])===fk[1]){es[k].focus();break}}catch(e){}}
// seconds tick once a second while anything is listed
function jobTickOn(){if(JOB.tickT||!JOB.ord.length)return;JOB.tickT=jobT(function(){JOB.tickT=null;if(!JOB.ord.length||!JMP.bar)return;
 jobBarText(JMP.bar);for(var id in JOB.rows)if(JOB.m[id])jobRowText(JOB.m[id],JOB.rows[id]);jobTickOn()},1000)}
// one answer of GET /api/jobs. Returns true when the next read should come soon (a request of another window seen for the first time).
function jobMerge(L){var now=Date.now(),inL={},soon=false,k,sig=jobSig();
 for(k in JOB.own)if(JOB.own[k]&&now-JOB.own[k]>JOB.keep*2)delete JOB.own[k];
 (Array.isArray(L)?L:[]).forEach(function(s){if(!s||s.id==null)return;var id=String(s.id),j=JOB.m[id],kind=s.kind||'run',state=s.state||'running';inL[id]=1;
  if(!j){if(JOB.own[id]!=null)return;   // this page's own request or run that is not listed here (short, a poll, or already gone)
   // a request of another window: listed once two reads in a row saw it running, so its short ones never show
   if(kind==='req'){if(state!=='running')return;if(!JOB.seen[id]){JOB.seen[id]=1;soon=true;return}}
   j=jobNew({id:id,kind:kind});var st=+s.startedMs;if(st>0&&now>=st&&now-st<86400000)j.t0=st;JOB.m[id]=j;JOB.ord.push(id);j.shown=true}
  j.srv=true;j.syn=true;if(!j.mine)j.kind=kind;j.what=s.what?String(s.what):'';j.whatP=s.whatP&&typeof s.whatP==='object'?s.whatP:null;
  if(!j.page&&s.page)j.page=String(s.page);if(!j.game&&s.game)j.game=String(s.game);if(s.cmd&&!j.cmd)j.cmd=String(s.cmd);
  j.stage=s.stage==null?'':String(s.stage);j.done=typeof s.done==='number'?s.done:null;j.total=typeof s.total==='number'?s.total:null;j.writes=!!s.writes;if(!j.stop)j.canCancel=s.canCancel!==false;
  if(state!=='running'){var was=j.state;j.state=state;j.stopping=false;if(!j.t1)j.t1=now;if(+s.endedMs>0&&+s.startedMs>0&&s.endedMs>=s.startedMs)j.dur=s.endedMs-s.startedMs;if(was==='running')jobSay(j)}});
 for(k in JOB.seen)if(!inL[k])delete JOB.seen[k];
 JOB.ord.slice().forEach(function(id){var j=JOB.m[id];if(inL[id])return;j.syn=true;if(!j.srv)return;j.srv=false;if(!j.mine)jobDrop(id)});
 if(jobSig()!==sig)jobChanged();return soon}
function jobKick(ms){clearTimeout(JOB.pollT);JOB.pollT=jobT(jobSync,ms)}
function jobSync(){var my=++JOB.sq,soon=false,p;clearTimeout(JOB.pollT);JOB.pollT=jobT(jobSync,20000);   // an answer that never comes: ask again
 try{p=api('/api/jobs',undefined,{job:false})}catch(e){p=Promise.reject(e)}
 p.then(function(r){if(my!==JOB.sq)return;JOB.fails=0;soon=jobMerge(r&&r.jobs)},function(){if(my!==JOB.sq)return;
  // the server does not answer: after three tries the jobs only it knew are taken off the list
  if(++JOB.fails>=3){var ch=false;JOB.ord.slice().forEach(function(id){if(!JOB.m[id].mine){jobDrop(id);ch=true}});if(ch)jobChanged()}})
 .then(function(){if(my!==JOB.sq)return;
  // nothing listed and the window is hidden: the idle read stops; pageSeen() reads at once when the window is seen again
  if(!soon&&!JOB.ord.length&&pageHid()){clearTimeout(JOB.pollT);JOB.pollT=null;return}
  jobKick(soon||JOB.ord.length?JOB.fast:JOB.slow)})}
// the window is hidden (another browser tab, minimised): the idle reads wait. Back on the screen: the job list is read at once and
// the run line shows its seconds again, so nothing that started or ended meanwhile is missed
function pageHid(){try{return !!document.hidden}catch(e){return false}}
function pageSeen(){if(pageHid())return;jobKick(0);if(typeof runClock==='function')runClock();pollWake()}
// K5, one pause rule for a page's own poll (a read repeated while a job runs): pollLater(page, fn, ms) runs fn after ms only while the window
// is seen and that page is on screen (page '' = any page). Otherwise fn is parked and runs once when the window is seen again (pageSeen) or
// the page is next shown (show0), so a hidden page or window sends nothing and what ended meanwhile is read at the next look.
// Returns a handle for pollStop(handle) (the clearTimeout of a poll).
var POLLS=[];
function pollOn(pg){return !pageHid()&&(!pg||typeof S==='undefined'||!S.cur||S.cur===pg)}
function pollLater(pg,fn,ms){var o={pg:pg||'',fn:fn,t:null};o.t=setTimeout(function(){o.t=null;if(!pollOn(o.pg)){POLLS.push(o);return}fn()},ms);return o}
function pollStop(o){if(!o||typeof o!=='object')return;if(o.t!=null){clearTimeout(o.t);o.t=null}var i=POLLS.indexOf(o);if(i>=0)POLLS.splice(i,1)}
function pollWake(){if(!POLLS.length)return;var go=POLLS.filter(function(o){return pollOn(o.pg)});if(!go.length)return;POLLS=POLLS.filter(function(o){return go.indexOf(o)<0});
 go.forEach(function(o){try{o.fn()}catch(e){}})}
if(typeof window!=='undefined'){window.pollLater=pollLater;window.pollStop=pollStop}
document.addEventListener('visibilitychange',function(){if(pageHid()){if(typeof runClock==='function')runClock()}else pageSeen()});
document.addEventListener('keydown',function(e){if(!e||e.key!=='Escape'||!JOB.open)return;jobOpen(false);e._job=true;if(e.preventDefault)e.preventDefault();if(e.stopPropagation)e.stopPropagation();try{JMP.bar.job.focus()}catch(z){}},true);
var JOBS={list:jobPub,cancel:jobCancel,on:function(f){if(typeof f==='function')JOB.subs.push(f)},track:jobTrack,fetch:jobFetch,skip:JOBSKIP,sync:function(){jobKick(0)},
 // times in ms (wait 600, keep 10000, fast 1500, slow 15000): for tests
 tune:function(o){for(var k in o)if(typeof JOB[k]==='number'&&typeof o[k]==='number')JOB[k]=o[k]}};
if(typeof window!=='undefined')window.JOBS=JOBS;
jobKick(0);
function cardOf(el){while(el&&!(el.classList&&el.classList.contains('card')))el=el.parentNode;return el||null}
function holdCard(){var c=CLICKED&&cardOf(CLICKED),held=[];if(!c)return function(){};var bs=c.querySelectorAll('button');for(var i=0;i<bs.length;i++)if(!bs[i].disabled){bs[i].disabled=true;bs[i].dataset.apiBusy='1';held.push(bs[i])}
 return function(){held.forEach(function(b){delete b.dataset.apiBusy;b.disabled=b.dataset.blocked==='1'||b.dataset.cardBusy==='1'})}}
// game parity: every api() call says which game the page is on (x-arsenal-game = S.gameId; under GoH also x-arsenal-goh = the GoH folder, URI-encoded);
// the server reads it as ctx.gameId(), ctx.gohDir(). A URL that does not go through api() (img src, download link, EventSource) takes gq(url): ?gid=<id>[&goh=<dir>]
function gameHdr(o){o=o||{};try{if(GID){o['x-arsenal-game']=GID;var g=gOf(GID),d=g&&g.kind==='goh'?gohDir():'';if(d)o['x-arsenal-goh']=encodeURIComponent(d)}}catch(e){}return o}
function gq(url){var u=String(url==null?'':url),hs='',i=u.indexOf('#'),a=[];if(i>=0){hs=u.slice(i);u=u.slice(0,i)}
 try{if(GID){a.push('gid='+encodeURIComponent(GID));var g=gOf(GID),d=g&&g.kind==='goh'?gohDir():'';if(d)a.push('goh='+encodeURIComponent(d))}}catch(e){}
 if(!a.length)return u+hs;return u+(u.indexOf('?')<0?'?':/[?&]$/.test(u)?'':'&')+a.join('&')+hs}
if(typeof window!=='undefined'){window.gq=gq;window.gameHdr=gameHdr}
function api(url,body,opt){var rel=body===undefined?function(){}:holdCard(),init=body===undefined?{headers:gameHdr()}:{method:'POST',headers:gameHdr({'content-type':'application/json'}),body:JSON.stringify(body)};if(opt&&opt.signal)init.signal=opt.signal;
 var p=jobFetch(url,init,opt).then(function(r){return r.json().catch(function(){return {error:tx('api.badreply')}}).then(function(j){if(!r.ok){var er=new Error(NOGAME.test(j.error||'')?tx('game.notSet'):(j.error||('HTTP '+r.status)));er.status=r.status;
   // a server error may carry a translation key and its slots: pages show tx(e.key, e.params); e.text = that, or the message when the key is unknown here
   if(j&&j.key){er.key=j.key;er.params=j.params||{};er.text=(LANGS[LANG][j.key]!=null||LANGS.en[j.key]!=null)?tx(j.key,er.params):er.message;
    if(j.key==='job.cancelled'){er.message=er.text;er.cancelled=true}   // a request stopped from the job list (499): one plain "Stopped", not the raw server word
   }else er.text=er.message;er.reply=j;throw er}return j})});
 return p.then(function(j){rel();return j},function(e){rel();throw e})}
// modInfo(p): GET /api/mod of a mod folder. Two parts of the page that ask for the same folder (and game) while the answer is on its
// way share that one request; once it has answered nothing is kept, the next call asks the server again
var MODQ={};
function modInfo(p){var k;try{k=JSON.stringify(gameHdr())+'|'+p}catch(e){k='|'+p}if(MODQ[k])return MODQ[k];
 var q=api('/api/mod?dir='+encodeURIComponent(p)),end=function(){if(MODQ[k]===q)delete MODQ[k]};MODQ[k]=q;q.then(end,end);return q}
// W5 games (tools/gui/groups.js): GS = per game {dir, mod, roots, screen} in localStorage 'games'; GID = the current game ('gameId').
// The old keys (mod, game, roots, screen) seed the as64 entry once and are still written for as64, so pages and tools that read them keep working.
// S.mod, S.gameOv and S.roots read and write the current game's entry (S.gameOv = the AS2 install: under GoH it is the as64 folder results go to).
var GAMES=__GAMES__,GDEF=__GDEF__;
function gOf(id){for(var i=0;i<GAMES.length;i++)if(GAMES[i].id===id)return GAMES[i];return null}
var GS,GID;
// read again once the server settings are in (setLoad), before the first draw
function initGames(){GS=LS.get('games',null);if(!GS||typeof GS!=='object')GS={as64:{dir:LS.get('game',''),mod:LS.get('mod',''),roots:LS.get('roots',null),screen:LS.get('screen','')}};
 GAMES.forEach(function(g){if(!GS[g.id]||typeof GS[g.id]!=='object')GS[g.id]={dir:'',mod:'',roots:null,screen:''}});
 GID=LS.get('gameId',GDEF);if(!gOf(GID))GID=GDEF}
initGames();
function gsSave(){LS.set('games',GS)}
function as2Id(){return gOf(GID).kind==='goh'?GDEF:GID}
var S={cmds:{},health:{},game:{},goh:{},screens:{},cur:null};
Object.defineProperty(S,'mod',{enumerable:true,get:function(){return GS[GID].mod||''},set:function(v){GS[GID].mod=v||'';gsSave();if(GID===GDEF)LS.set('mod',v||'')}});
Object.defineProperty(S,'gameOv',{enumerable:true,get:function(){return GS[as2Id()].dir||''},set:function(v){GS[as2Id()].dir=v||'';gsSave();if(as2Id()===GDEF)LS.set('game',v||'')}});
Object.defineProperty(S,'roots',{enumerable:true,get:function(){return GS[GID].roots||null},set:function(v){GS[GID].roots=v;gsSave();if(GID===GDEF)LS.set('roots',v)}});
Object.defineProperty(S,'gameId',{enumerable:true,get:function(){return GID}});
function fmtBytes(n){return n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB'}

// ---------- the one active run ----------
var RUN=null;
function setRunUi(){var on=!!RUN;$('cancel').hidden=!on;$('runstate').textContent=on?tx('run.running',{cmd:RUN.cmd}):'';document.body.setAttribute('aria-busy',on?'true':'false');
 // a run in progress greys the run buttons but keeps them clickable: a click says why nothing starts (busyMsg). Only "blocked" (no --allow-launch) is truly disabled.
 var bs=document.querySelectorAll('button[data-run]');for(var i=0;i<bs.length;i++){bs[i].disabled=bs[i].dataset.blocked==='1'||bs[i].dataset.cardBusy==='1'||bs[i].dataset.apiBusy==='1';bs[i].className=bs[i].className.replace(/\s*busy\b/g,'')+(on?' busy':'');bs[i].setAttribute('aria-disabled',on?'true':'false')}
 if(S.wz)S.wz.upd()}
function busyMsg(){var m=tx('busy',{cmd:RUN?RUN.cmd:tx('busy.arun')});toast(m);return m}
// the seconds of the run line: once a second while the window is on the screen (runClock stops the timer while it is hidden and
// writes the line at once when it is seen again)
var RUNIV=null;
function runTick(){if(RUN)$('runstate').textContent=tx('run.runningS',{cmd:RUN.cmd,s:Math.round((Date.now()-RUN.t0)/1000)})}
function runClock(){if(pageHid()){if(RUNIV!=null&&typeof clearInterval==='function'){clearInterval(RUNIV);RUNIV=null}return}
 if(RUNIV==null){runTick();RUNIV=setInterval(runTick,1000);if(RUNIV==null)RUNIV=0}}
runClock();
function cancelRun(){if(!RUN)return;RUN.cancelling=true;if(RUN.id)api('/api/cancel',{id:RUN.id}).catch(function(e){toast(tx('cancel.err',{m:e.message}))});else toast(tx('cancel.soon'))}
$('cancel').onclick=cancelRun;
// GT-17: one progress row for long runs: what runs, seconds so far, the last line, and a Cancel button (default: cancel the active run).
// p=progress(); put p.el in the card; p.start(what[, cancelFn]); p.say(line); p.stop(). Ext pages: window.as2Progress()
function progress(){var t0=0,tm=null,what='',fn=null,st=h('span',{class:'hint','data-prog':'1'}),ln=h('span',{class:'hint'}),
  cb=h('button',{type:'button',class:'danger','data-pcancel':'1',text:tx('prog.cancel'),onclick:function(){cb.disabled=true;cb.textContent=tx('prog.cancelling');(fn||cancelRun)()}}),
  el=h('span',{class:'prog',hidden:true,role:'status'},[st,cb,ln]);
 function tick(){st.textContent=tx('prog.what',{what:what,s:Math.round((Date.now()-t0)/1000)})}
 return {el:el,start:function(w,f){what=w||'';fn=f||null;t0=Date.now();el.hidden=false;cb.disabled=false;cb.textContent=tx('prog.cancel');ln.textContent='';tick();clearTimeout(tm);tm=setInterval(tick,1000)},
  say:function(l){ln.textContent=l?tx('prog.line',{l:String(l).slice(0,140)}):''},
  stop:function(){clearTimeout(tm);tm=null;el.hidden=true}}}
if(typeof window!=='undefined')window.as2Progress=progress;
// POST /api/run, read the NDJSON events. on = {start, line(kind,text), end}. Resolves with the end event (or null when the server refused: the message went to on.line).
function streamRun(cmd,input,on,timeoutSec){
 if(RUN){busyMsg();return Promise.resolve(null)}
 RUN={cmd:cmd,id:null,t0:Date.now()};setRunUi();var endEv=null,jn=jobDefName(cmd),jend=null;
 return fetch('/api/run',{method:'POST',headers:gameHdr({'content-type':'application/json'}),body:JSON.stringify({cmd:cmd,input:input,timeoutSec:timeoutSec})}).then(function(r){
  if(!r.ok)return r.json().catch(function(){return {}}).then(function(j){on.line('e',tx(r.status===409?'run.busy':r.status===403?'run.refused':'run.error',{m:j.error||('HTTP '+r.status)}))});
  var rd=r.body.getReader(),td=new TextDecoder(),b='';
  function pump(){return rd.read().then(function(x){if(x.done)return;b+=td.decode(x.value,{stream:true});var n;
   while((n=b.indexOf('\n'))>=0){var l=b.slice(0,n);b=b.slice(n+1);if(!l)continue;var e;try{e=JSON.parse(l)}catch(z){on.line('e',tx('run.badevent',{m:l}));continue}
    if(e.t==='start'){RUN.id=e.id;
     // JOBS: the run is listed under its run id; Cancel there is the header's Cancel
     if(!jend&&e.id!=null){var rid=String(e.id);jobTrack(new Promise(function(res){jend=res}),{id:rid,kind:'run',what:jn,cmd:cmd,now:true,cancel:function(){if(RUN&&String(RUN.id)===rid)cancelRun()},state:function(s){return s}})}
     if(on.start)on.start(e);if(RUN.cancelling)api('/api/cancel',{id:e.id}).catch(function(){})}
    else if(e.t==='end'){endEv=e}else on.line(e.t==='err'?'e':'o',e.line)}
   return pump()})}
  return pump()}).catch(function(e){on.line('e',tx('run.conn',{m:e.message}))}).then(function(){var was=RUN;RUN=null;setRunUi();
  if(jend)jend(was&&was.cancelling?'cancelled':!endEv?'failed':endEv.timedOut?'timeout':endEv.code===0?'done':'failed');
  if(endEv&&on.end)on.end(endEv);return endEv});
}

// ---------- log pane ----------
// the pane follows its last line: the scroll to the end runs once per animation frame, not once per line (reading scrollHeight
// lays the whole pane out); with no requestAnimationFrame it runs at once
function mkLog(){var pre=h('pre',{class:'log',tabindex:'0',hidden:true,'aria-label':tx('log.aria')});var n=0,sp=false;
 function toEnd(){sp=false;pre.scrollTop=pre.scrollHeight}
 function endSoon(){if(typeof requestAnimationFrame!=='function'){toEnd();return}if(sp)return;sp=true;try{requestAnimationFrame(toEnd)}catch(e){toEnd()}}
 return {el:pre,clear:function(){pre.textContent='';n=0;pre.hidden=true},add:function(k,t,cls){pre.hidden=false;var s=h('div',{class:cls||(k==='e'?'e':''),text:t});pre.appendChild(s);if(++n>4000){pre.removeChild(pre.firstChild);n--}endSoon()},text:function(){return pre.textContent},lines:function(){var a=[];for(var i=0;i<pre.children.length;i++)a.push(pre.children[i].textContent);return a.join(String.fromCharCode(10))}}}

// ---------- generic JSON tree ----------
function tree(v,depth,key){
 var kk=key==null?[]:[h('span',{class:'k',text:key+': '})];
 if(v===null||typeof v!=='object'){var s=typeof v==='string'?(v.length>400?v.slice(0,400)+' ...':v):String(v);return h('div',{},kk.concat([h('span',{class:typeof v==='string'?'s':'v',text:typeof v==='string'?JSON.stringify(s):s})]))}
 var isA=Array.isArray(v),keys=isA?v.map(function(_,i){return i}):Object.keys(v);
 var d=h('details',{open:depth<1},[h('summary',{},kk.concat([h('span',{text:isA?'['+v.length+']':'{'+keys.length+'}'})]))]);
 keys.slice(0,200).forEach(function(k){d.appendChild(tree(v[k],depth+1,isA?'#'+k:k))});
 if(keys.length>200)d.appendChild(h('div',{class:'hint',text:tx('tree.more',{n:keys.length-200})}));
 return d}
function treeBox(v){return h('div',{class:'tree'},[tree(v,0,null)])}

// ---------- folder / file picker ----------
var PK={cb:null,mode:'dir',dir:null,sel:-1,items:[],shown:[]};
// recently picked folders and files (kept in this browser): listed first in the popup, found by its filter box, and offered while typing in path fields
function recGet(k){var a=LS.get('pk.recent.'+k,[]);return Array.isArray(a)?a:[]}
function recAdd(k,p){if(!p)return;var a=recGet(k).filter(function(x){return npath(x)!==npath(p)});a.unshift(p);LS.set('pk.recent.'+k,a.slice(0,12));recLists()}
function recLists(){try{['dir','file'].forEach(function(k){var d=$('rec'+k);if(!d){d=h('datalist',{id:'rec'+k});document.body.appendChild(d)}d.textContent='';recGet(k).forEach(function(p){d.appendChild(h('option',{value:p}))})})}catch(e){}}
function recField(inp,k){if(inp&&inp.setAttribute)inp.setAttribute('list','rec'+k);return inp}
// One look for waiting, results and "do it?" questions (owner 2026-11-11, "Clearer actions"). loading(el[,key]): one hint line while a
// card waits for the server. result(el,kind,text): kind ok|err|hint. askDo({title,lines,where,ok,danger}) -> Promise<bool>: a box with
// what will happen (a list), where, one confirm button and Cancel; Esc = Cancel; danger puts the focus on Cancel. Where the browser has
// no dialog element (and in the test DOM) it asks with window.confirm and the same text.
function loading(el,key){if(!el)return el;el.textContent='';el.appendChild(h('div',{class:'hint',text:tx(key||'ui.checking')}));return el}
function result(el,kind,text){if(!el)return el;el.className=kind||'hint';el.textContent=text==null?'':text;return el}
function askDo(o){o=o||{};var lines=(o.lines||[]).filter(Boolean),NL=String.fromCharCode(10);
 // no dialog element: ask at once and answer at once (then() runs its function right away), as window.confirm always did
 if(typeof HTMLDialogElement!=='function'){var t=[o.title].concat(lines);if(o.where)t.push(tx('ui.where',{dir:o.where}));var yes=true;try{if(window.confirm)yes=window.confirm(t.filter(Boolean).join(NL))}catch(e){}yes=!!yes;return {then:function(cb){cb(yes)}}}
 return new Promise(function(res){
  var d=$('ask');if(!d){d=h('dialog',{id:'ask'});document.body.appendChild(d)}
  var done=false;function fin(v){if(done)return;done=true;d.onclose=null;try{d.close()}catch(e){}res(v)}
  var ok=h('button',{type:'button',class:'primary',id:'askok',text:o.ok||tx('ui.doIt'),onclick:function(){fin(true)}}),no=h('button',{type:'button',id:'askno',text:tx('ui.cancel'),onclick:function(){fin(false)}});
  d.textContent='';d.setAttribute('aria-label',o.title||'');
  d.appendChild(h('div',{class:'hd'},[h('b',{text:o.title||''})]));
  var body=h('div',{class:'askb'});
  if(lines.length){var ul=h('ul');lines.forEach(function(l){ul.appendChild(h('li',{text:l}))});body.appendChild(ul)}
  if(o.where)body.appendChild(h('div',{class:'hint',text:tx('ui.where',{dir:o.where})}));
  d.appendChild(body);d.appendChild(h('div',{class:'ft'},[h('span',{style:'flex:1'}),ok,no]));
  d.onclose=function(){fin(false)};
  d.showModal();try{(o.danger?no:ok).focus()}catch(e){}})}
// opt.out (GT-22): picking a folder to write to; the start list puts home and the drives first and marks the game's folders.
// opt.view 'disk' (default: real folders, GET /api/ls) | 'data' (the page game's layered files: its paks and loose files with the current mod
// on top, as folders and files; GET /api/x/ide/vdir, read in pages; start and paths are game paths without resource/, e.g. map/single).
// opt.exts ['def','set']: only files with these extensions are listed (folders always). cb(path, entry): entry {view, path} and in the
// data view {key, name, where, layer, pak}. The data view needs the game folder: without it, or when the view cannot be read, the picker
// says so and shows the disk. A phone (RMT, view only) gets the data view (read routes) but not the disk.
function pick(mode,start,cb,opt){opt=opt||{};var data=opt.view==='data';if(RMT&&!data){toast(tx('rmt.viewOnly'));return}
 PK.cb=cb;PK.mode=mode;PK.out=!!opt.out;PK.view=data?'data':'disk';PK.game=opt.game&&typeof GID!=='undefined'&&opt.game!==GID?String(opt.game):'';PK.nomod=!!PK.game;PK.exts=Array.isArray(opt.exts)&&opt.exts.length?opt.exts.map(function(x){return String(x).replace(/^\./,'').toLowerCase()}):null;PK.first=true;
 $('pkuse').hidden=false;$('pkuse').textContent=tx(mode==='dir'?'pk.use':'pk.open');pkHint('');
 var q=$('pkq'),x=$('pkx');if(q){q.value='';q.setAttribute('placeholder',tx('pk.filter'));q.setAttribute('aria-label',tx('pk.filter'))}if(x){x.textContent=String.fromCharCode(215);x.setAttribute('aria-label',tx('pk.cancel'));x.setAttribute('title',tx('pk.cancel'))}
 $('pk').showModal();pkLoad(start||'');if(q&&q.focus)q.focus()}
// the hint line under the list (msg: a plain note, e.g. why the data view fell back to the disk) and the view switch button
function pkHint(msg){var d=PK.view==='data',v=$('pkview');$('pkhint').textContent=(msg?msg+'  ':'')+tx(d?'pk.hintData':PK.mode==='dir'?'pk.hintDir':'pk.hintFile');
 if(v){v.hidden=!!RMT;v.textContent=tx(d?'pk.toDisk':'pk.toData');v.setAttribute('title',tx(d?'pk.toDiskT':'pk.toDataT'))}}
function pkExtOk(n){if(!PK.exts)return true;var s=String(n||''),i=s.lastIndexOf('.');return i>0&&PK.exts.indexOf(s.slice(i+1).toLowerCase())>=0}
// recent picks are kept per view: a disk path and a game path never mix
function pkRec(){return (PK.view==='data'?'d':'')+(PK.mode==='dir'?'dir':'file')}
function pkLoad(dir){var my=PK.seq=(PK.seq||0)+1;if(PK.view==='data'){pkData(dir,my,0);return}var gf=curFolder(),pe=$('pkerr'),u='/api/ls?'+(PK.mode==='file'?'files=1&':'')+(dir?'dir='+encodeURIComponent(dir):'')+(gf&&!dir?'&game='+encodeURIComponent(gf):'')+(PK.out&&!dir?'&for=out':'');
 api(u).then(function(j){if(my!==PK.seq)return;if(pe){pe.hidden=true;pe.textContent=''}PK.dir=j.dir;$('pkpath').value=j.dir||'';PK.parent=j.parent;var items=[];
  if(!j.dir)j.roots.forEach(function(r){items.push({label:r.name+'   '+r.path+(r.game?'   '+tx('pk.gameRoot'):''),go:r.path,dir:true})});
  else{j.entries.forEach(function(e){items.push({label:e.name+(e.isMod?'   '+tx('pk.mod'):''),go:join(j.dir,e.name),dir:true})});(j.files||[]).forEach(function(f){if(pkExtOk(f))items.push({label:f,file:join(j.dir,f)})})}
  var q=$('pkq');if(q&&!PK.first)q.value='';
  PK.items=items;PK.sel=0;pkRender();PK.first=false}).catch(function(e){if(my!==PK.seq)return;if(!pe){toast(e.message);return}pe.hidden=false;pe.textContent=tx(e.status===404?'pk.notFound':'pk.cantRead',{p:dir||'',m:e.message})})}
// the data view: one folder of the layered game view (the server keeps the view it built: a first open after a start can take seconds,
// the list says "reading" meanwhile and the page stays usable). PKLIM rows per page; a "more" row reads the next page of the same list.
var PKLIM=2000,PKW={mine:'pk.wMine',othermod:'pk.wOther'};
function pkData(dir,my,off){var pe=$('pkerr'),d=String(dir||'').replace(/\\/g,'/');
 if(/^([A-Za-z]:|\/)/.test(d)){PK.view='disk';pkHint('');pkLoad(dir);return}   // a disk path typed in the path box: the disk view
 d=d.replace(/^\/+|\/+$/g,'').replace(/^resource(\/|$)/i,'');
 if(!off){PK.busy=true;PK.items=[];PK.dir=d;PK.parent=d?d.slice(0,Math.max(0,d.lastIndexOf('/'))):null;$('pkpath').value=d;if(pe){pe.hidden=true;pe.textContent=''}pkRender()}
 var u='/api/x/ide/vdir?'+(S.mod&&!PK.nomod?'mod='+encodeURIComponent(S.mod)+'&':'')+'dir='+encodeURIComponent(d)+'&lim='+PKLIM+(off?'&off='+off+'&ver='+encodeURIComponent(PK.ver||''):'');
 // another game's data (spec game): its id goes in the game header of this one request; the header's mod is not that game's, so it is left out
 var rq;if(PK.game){var g0=GID;GID=PK.game;try{rq=api(u)}finally{GID=g0}}else rq=api(u);
 rq.then(function(j){if(my!==PK.seq)return;j=j||{};
  if(!off&&(j.notes||[]).indexOf('no-game')>=0&&!(j.dirs||[]).length&&!(j.files||[]).length){pkFall(tx('pk.noData'));return}
  if(off&&j.ver&&j.ver!==PK.ver){pkData(d,my,0);return}   // the list was read again: start over
  PK.busy=false;PK.ver=j.ver||'';var items=off?PK.items.filter(function(x){return x.more==null}):[],pre=d?d+'/':'';
  (j.dirs||[]).forEach(function(n){items.push({label:n,go:pre+n,dir:true})});
  (j.files||[]).forEach(function(f){if(!pkExtOk(f.name))return;var w=PKW[f.where];
   items.push({label:f.name+(w?'   '+tx(w):''),file:pre+f.name,ent:{view:'data',path:pre+f.name,key:f.key,name:f.name,where:f.where||'',layer:f.layer||'',pak:f.pak||null}})});
  if(j.next!=null)items.push({label:tx('pk.moreRows',{n:Math.max(0,(+j.total||0)-j.next)}),more:j.next});
  var q=$('pkq');if(q&&!PK.first&&!off)q.value='';
  PK.items=items;if(!off)PK.sel=0;pkRender();PK.first=false}).catch(function(e){if(my!==PK.seq)return;
  if(S.mod&&!PK.nomod&&e.status===400&&!off){PK.nomod=true;pkData(d,my,0);return}   // the mod is refused (not a mod of this game): the game alone
  pkFall(tx('pk.noData')+' ('+e.message+')')})}
// the data view cannot be read: a plain note, then the disk at the mod (else the game folder, else the roots); a phone keeps the note only
function pkFall(msg){PK.busy=false;if(RMT){PK.items=[];pkRender();var pe=$('pkerr');if(pe){pe.hidden=false;pe.textContent=msg}return}
 PK.view='disk';pkHint(msg);pkLoad(S.mod||curFolder()||'')}
// what the list shows: recent picks first (on the first list of a popup, or when the filter text matches them), then the entries of the folder that match the filter
function pkShown(){var qe=$('pkq'),q=String(qe&&qe.value||'').trim().toLowerCase(),out=[],dv=PK.view==='data';
 if(q||PK.first)recGet(pkRec()).forEach(function(p){if(out.length>=6||(q&&p.toLowerCase().indexOf(q)<0))return;if(PK.mode!=='dir'&&!pkExtOk(p))return;
  out.push(PK.mode==='dir'?{label:p+'   '+tx('pk.recent'),go:p,dir:true,rec:true}:{label:p+'   '+tx('pk.recent'),file:p,rec:true,ent:dv?{view:'data',path:p,key:'resource/'+p,name:p.split('/').pop()}:null})});
 PK.items.forEach(function(it){if(!q||it.more!=null||it.label.toLowerCase().indexOf(q)>=0)out.push(it)});return out}
// one click opens a folder; a file is marked by one click and picked by a second one, Enter or the Open button
function pkRender(){var l=$('pklist');l.textContent='';PK.shown=pkShown();if(PK.sel>=PK.shown.length)PK.sel=PK.shown.length-1;if(PK.sel<0&&PK.shown.length)PK.sel=0;
 PK.shown.forEach(function(it,i){l.appendChild(h('div',{class:'it',role:'option','aria-selected':i===PK.sel?'true':'false',text:(it.dir?'[ ] ':'    ')+it.label,onclick:function(){PK.sel=i;if(it.dir||it.more!=null)pkOpen();else pkMark()},ondblclick:function(){PK.sel=i;if(!it.dir)pkOpen()}}))});
 if(!PK.shown.length)l.appendChild(h('div',{class:'hint',style:'padding:6px 10px',text:tx(PK.busy?'pk.reading':'pk.none')}));
 pkMark()}
// the marked row, without building the list again (a rebuilt row loses the second click of a double click)
function pkMark(){var l=$('pklist'),c=l.children||[];for(var i=0;i<c.length;i++)if(c[i].setAttribute&&i<PK.shown.length)c[i].setAttribute('aria-selected',i===PK.sel?'true':'false');
 var s=c[PK.sel];if(s&&s.scrollIntoView)s.scrollIntoView({block:'nearest'})}
function pkOpen(){var it=PK.shown[PK.sel];if(!it)return;if(it.more!=null){pkData(PK.dir,PK.seq=(PK.seq||0)+1,it.more);return}if(it.dir)pkLoad(it.go);else pkDone(it.file,it.ent)}
function pkDone(p,ent){recAdd(pkRec(),p);$('pk').close();var cb=PK.cb;PK.cb=null;
 if(!ent)ent=PK.view==='data'?{view:'data',path:p,key:'resource/'+p,name:String(p).split('/').pop()}:{view:'disk',path:p};if(cb)cb(p,ent)}
function pkKey(e,inList){var n=PK.shown.length;
 if(e.key==='ArrowDown'||(inList&&e.key==='j')){PK.sel=Math.min(n-1,PK.sel+1);pkMark();e.preventDefault()}
 else if(e.key==='ArrowUp'||(inList&&e.key==='k')){PK.sel=Math.max(0,PK.sel-1);pkMark();e.preventDefault()}
 else if(e.key==='Enter'){if(e.isComposing||e.keyCode===229)return;pkOpen();e.preventDefault()}
 else if(e.key==='Backspace'&&(inList||!e.target.value)){pkLoad(PK.parent||'');e.preventDefault()}}
$('pkup').onclick=function(){pkLoad(PK.parent||'')};
$('pkgo').onclick=function(){pkLoad($('pkpath').value.trim())};
$('pkpath').onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();pkLoad($('pkpath').value.trim())}};
$('pkuse').onclick=function(){if(PK.mode!=='dir'){var it=PK.shown[PK.sel];if(it)pkOpen();else toast(tx('pk.pickFirst'));return}if(PK.dir)pkDone(PK.dir);else toast(tx('pk.openFirst'))};
$('pkno').onclick=function(){$('pk').close()};
// game data <-> folders on disk (the data view opens at the top of the game's files, the disk at the mod, else the game folder)
if($('pkview'))$('pkview').onclick=function(){if(RMT)return;PK.view=PK.view==='data'?'disk':'data';PK.nomod=!!PK.game;PK.first=true;pkHint('');pkLoad(PK.view==='data'?'':(S.mod||curFolder()||''))};
if($('pkx'))$('pkx').onclick=function(){$('pk').close()};
$('pklist').onkeydown=function(e){pkKey(e,true)};
recLists();

// ---------- searchKit: manual browse + indexed search + history on every search or filter box ----------
// The owner (2026-11-19, no exceptions): "every single search bar in the gui needs to have; a manual browse, indexed search, and history list";
// then: "browse should always be a file directory browse" and "normal index search is what the search bar is for".
// So a box has exactly: the bar (index search while typing; ArrowDown on an empty box shows the first index rows; a "show more" row pages
// on), Browse (always the folder / file picker, searchKit.picker), History. No list popup.
// Contract (stable; full text in tools/gui/README.md, section searchKit):
//   var kit=searchKit(input,{
//     key:    'balance.q',                     // history bucket: LS 'sk.hist.<key>', newest first, at most 20, no duplicates (case blind)
//     index:  function(q,done){done([{label,value,hint}],more)},   // suggestions for the text (token mode: the word under the caret; '' when
//                                              // ArrowDown asks on an empty box) from an index the caller built ONCE; sync or async; answers to an
//                                              // older text are ignored; more = hits not sent (said in a note)
//     list:   function(done){done([{group,label,value,hint}],more)},  // older form: with no index, the kit filters these items as the index
//     browse: {mode:'file'|'dir', start:'path'|function(){return path}, view:'disk'|'data', exts:['def'], toValue:function(path,entry){},
//              out:false},                     // the picker (pick() above) opened where the box's things live; the pick (toValue's answer, default
//                                              // the path) goes into the box. No browse: the picker in file mode at the mod (else the game folder,
//                                              // else the roots), the base name (no extension) goes in. A function browse(done) is allowed only for a
//                                              // box that opens this same picker itself (done(value,item)).
//     onPick: function(value,item,from){},    // from = 'history'|'index'|'browse'. Default: input.value = value (token mode: only the word under the
//                                              // caret; a history pick replaces the whole text), then 'input' and 'change' events on the input
//     mode:   'replace'|'token',              // default replace
//     arrows: false,                           // optional: ArrowDown on a closed list is left to the page (the list it filters); default true
//     beside: true,                            // optional: the page draws its own index view right under the box (a pick list): typing shows only
//                                              // the matching history rows (index not asked), arrows and Enter stay with the page's list (they close
//                                              // the kit's list), the History button opens the full history with arrows and Enter; implies arrows:false
//     cap:    30                               // optional: index hits shown (the rest is counted)
//   });
//   kit.el (the wrapper: put it where the input stood; an input already in the page is wrapped in place), kit.remember(text), kit.refresh(),
//   kit.focus() (focus without opening the list), kit.close(), kit.isOpen(), kit.history(), kit.flush() (draw a pending list now: tests)
// The kit stores history itself on Enter, on a pick, on blur and on change (non-empty text). A key event it handled carries e._sk = 1,
// preventDefault and stopPropagation (a window or form around the box, e.g. the guided task's Enter = Next, never sees it), so a page's
// own keydown handler on the same box returns early (if(e._sk)return). An Enter the kit did not use bubbles as usual.
// The open list is position:fixed at the box (measured, so a transformed ancestor is allowed for), so a parent with overflow hidden does
// not cut it; it opens upward when there is more room above, and follows scroll and resize while open. Without getBoundingClientRect or
// window (test DOMs) it stays absolute under the box. Missing input, key or index (or list): a
// console error and a throw, so no box adopts it half way. Self-contained (h, tx, LS only; Browse calls searchKit.picker, which the page
// sets below; without it, as in ext test DOMs, Browse logs a console error): ext tests take its source from page.js
// (tools/gui/test/blockcheck.js kitSrc()). Lang keys sk.*, CSS classes .sk .sk-btn .sk-dd .sk-o (style block above).
function searchKit(input,o){o=o||{};var miss=[];
 if(!input||typeof input.addEventListener!=='function')miss.push('input');if(!o.key)miss.push('key');if(typeof o.index!=='function'&&typeof o.list!=='function')miss.push('index');
 if(miss.length){var msg='searchKit: missing '+miss.join(', ')+'. Every search or filter box needs a history key and an index (Browse is the file browser): tools/gui/README.md, searchKit';try{console.error(msg)}catch(e){}throw new Error(msg)}
 var D=document,N=searchKit.n=(searchKit.n||0)+1,uid='sk'+N,HK='sk.hist.'+o.key,MAXH=20,CAP=o.cap>0?o.cap:30,tok=o.mode==='token',X=String.fromCharCode(215),OPS=/[=<>~!]$/;
 var bes=!!o.beside,ARW=o.arrows!==false&&!bes,W=typeof window!=='undefined'&&window?window:null;
 var st={open:false,mode:'',act:-1,items:[],hits:[],more:0,cap:CAP,seq:0,pend:false,want:false,quiet:false,nofo:false,lis:false};
 // the older form list(done) with no index: its items (read once, again after refresh()) filtered by the text are the index
 var LC=null,LW=null;
 function lidx(q,done){q=String(q||'').toLowerCase();function go(){var out=[];for(var i=0;i<LC.l.length;i++)if(LC.l[i]&&(!q||LC.lo[i].indexOf(q)>=0))out.push(LC.l[i]);done(out,LC.more)}
  if(LC){go();return}if(LW){LW.push(go);return}LW=[go];
  o.list(function(l,more){l=Array.isArray(l)?l:[];LC={l:l,more:+more||0,lo:l.map(function(it){it=it||{};var s='';['label','value','hint','group'].forEach(function(k){if(it[k]!=null)s+=String(it[k])+' '});return s.toLowerCase()})};var w=LW||[];LW=null;w.forEach(function(f){f()})})}
 var IDX=typeof o.index==='function'?o.index:lidx;
 function pd(e){if(e&&e.preventDefault)e.preventDefault()}
 // a key the kit used: marked, no default, and it goes no further (a window around the box never sees it)
 function used(e){e._sk=1;pd(e);if(e.stopPropagation)e.stopPropagation()}
 function rmA(e,k){if(e.removeAttribute)e.removeAttribute(k);else e.setAttribute(k,'')}
 function raf(f){if(typeof requestAnimationFrame==='function')requestAnimationFrame(f);else setTimeout(f,0)}
 function hist(){var a=LS.get(HK,[]);return Array.isArray(a)?a.filter(function(x){return typeof x==='string'&&!!x}):[]}
 function remember(t){t=String(t==null?'':t).trim();if(!t)return;var lo=t.toLowerCase(),a=hist().filter(function(x){return x.toLowerCase()!==lo});a.unshift(t);LS.set(HK,a.slice(0,MAXH))}
 function forget(t){LS.set(HK,hist().filter(function(x){return x!==t}))}
 function fire(t){if(typeof input.dispatchEvent==='function'&&typeof Event==='function'){try{input.dispatchEvent(new Event(t,{bubbles:true}));return}catch(e){}}if(typeof input.fire==='function')input.fire(t)}
 // what the list searches for: the whole text, or in token mode the word under the caret ({s,e} its place in the text)
 function span(){var v=String(input.value==null?'':input.value);if(!tok)return {s:0,e:v.length,t:v.trim()};var c=typeof input.selectionStart==='number'?Math.min(input.selectionStart,v.length):v.length,s=c,e=c;
  while(s>0&&!/\s/.test(v.charAt(s-1)))s--;while(e<v.length&&!/\s/.test(v.charAt(e)))e++;return {s:s,e:e,t:v.slice(s,e)}}
 var bB=h('button',{type:'button','class':'sk-btn sk-browse',text:tx('sk.browse'),title:tx('sk.browseT'),'aria-haspopup':'dialog'}),
  bH=h('button',{type:'button','class':'sk-btn sk-hist',text:tx('sk.history'),title:tx('sk.historyT'),'aria-haspopup':'listbox','aria-expanded':'false','aria-controls':uid+'-l'}),
  dd=h('div',{'class':'sk-dd',id:uid+'-l',role:'listbox','aria-label':tx('sk.ddAria')}),wrap=h('span',{'class':'sk','data-sk':String(o.key)});
  // an input the page made full width (width:100% or flex:1 in its own style) keeps that width: the wrapper takes the row, the input fills it
  try{var ist=String(input.getAttribute&&input.getAttribute('style')||'').replace(/ /g,'');if(/width:100%|flex:1/.test(ist))wrap.className='sk sk-wide'}catch(e){}
 dd.hidden=true;if(input.parentNode)input.parentNode.insertBefore(wrap,input);wrap.appendChild(input);wrap.appendChild(bB);wrap.appendChild(bH);wrap.appendChild(dd);
 input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');input.setAttribute('aria-controls',uid+'-l');
 if(!input.getAttribute('autocomplete'))input.setAttribute('autocomplete','off');if(input.getAttribute('list'))rmA(input,'list');
 function setOpen(on){st.open=on;dd.hidden=!on;input.setAttribute('aria-expanded',on?'true':'false');bH.setAttribute('aria-expanded',on&&st.mode==='hist'?'true':'false');if(!on){st.act=-1;rmA(input,'aria-activedescendant')}follow(on)}
 // the open list sits fixed at the box (a parent with overflow hidden does not cut it): measured at 0,0 first, so the offset of a
 // containing block (a transformed ancestor) is taken off; below the box, or above it when there is little room below and more above
 function place(){if(!st.open||!W||typeof input.getBoundingClientRect!=='function'||typeof dd.getBoundingClientRect!=='function')return;
  var vh=+W.innerHeight||0,vw=+W.innerWidth||0;if(!vh||!vw)return;
  var r=input.getBoundingClientRect(),wr=typeof wrap.getBoundingClientRect==='function'?wrap.getBoundingClientRect():r,s=dd.style,below=vh-r.bottom-8,above=r.top-8,up=below<160&&above>below;
  dd.className='sk-dd sk-fix'+(up?' sk-up':'');s.maxHeight=Math.floor(Math.max(60,Math.min(up?above:below,416)))+'px';
  s.minWidth=Math.floor(Math.max(0,Math.min(wr.width||0,352,vw-16)))+'px';s.maxWidth=Math.floor(Math.min(704,vw-16))+'px';s.left='0px';s.top='0px';
  var d0=dd.getBoundingClientRect(),L=Math.max(8,Math.min(r.left,vw-8-(d0.width||0))),T=up?r.top-2-(d0.height||0):r.bottom+2;
  s.left=Math.round(L-(d0.left||0))+'px';s.top=Math.round(T-(d0.top||0))+'px'}
 var plq=false;function reflow(e){if(e&&e.target===dd)return;if(plq)return;plq=true;raf(function(){plq=false;place()})}
 // a press outside the box closes the list too: blur does not always come (the window was not focused, the box was hidden with its page)
 function away(e){var t=e&&e.target;if(t&&typeof wrap.contains==='function'&&wrap.contains(t))return;close()}
 function follow(on){if(!W||typeof W.addEventListener!=='function'||on===st.lis)return;st.lis=on;
  if(on){W.addEventListener('scroll',reflow,true);W.addEventListener('resize',reflow);W.addEventListener('mousedown',away,true)}else if(typeof W.removeEventListener==='function'){W.removeEventListener('scroll',reflow,true);W.removeEventListener('resize',reflow);W.removeEventListener('mousedown',away,true)}}
 function close(){st.want=false;if(st.open)setOpen(false)}
 function sched(){st.want=true;if(st.pend)return;st.pend=true;raf(function(){if(st.pend)build()})}
 // the rows: history (matching the text, marked recent, each with a remove x) and "clear history", then the index hits up to CAP
 // beside (typing): only the history rows that match typed text, no "clear", no index rows (the page's own list is the index view)
 function rows(){var hm=st.mode==='hist',sb=bes&&!hm,q=hm?'':String(input.value==null?'':input.value).trim().toLowerCase(),out=[];
  var hs=hist();if(!hm)hs=sb&&!q?[]:hs.filter(function(x){var l=x.toLowerCase();return !q||(l!==q&&l.indexOf(q)>=0)}).slice(0,q?5:8);
  hs.forEach(function(x){out.push({k:'hist',value:x,label:x})});if(hs.length&&!sb)out.push({k:'clear'});
  if(!hm&&!bes){st.hits.slice(0,st.cap).forEach(function(it){if(!it)return;var v=it.value!=null?String(it.value):String(it.label);out.push({k:'index',value:v,label:it.label!=null?String(it.label):v,hint:it.hint?String(it.hint):'',item:it})});
   var left=st.hits.length-st.cap;if(left>0)out.push({k:'more',left:left})}
  return out}
 function build(){st.pend=false;if(!st.want){if(st.open)setOpen(false);return}var its=rows();st.items=its;
  if(!its.length&&st.mode!=='hist'){setOpen(false);dd.textContent='';return}
  dd.textContent='';if(!its.length)dd.appendChild(h('div',{'class':'sk-note',text:tx('sk.noHist')}));
  its.forEach(function(it,i){var kids;
   if(it.k==='clear')kids=[h('span',{'class':'sk-clr',text:tx('sk.clear')})];
   else if(it.k==='more')kids=[h('span',{'class':'sk-clr',text:tx('sk.showMore',{n:Math.min(CAP,it.left),left:it.left})})];
   else{kids=[h('span',{'class':'sk-lab',text:it.label})];if(it.k==='hist')kids.unshift(h('span',{'class':'sk-tag',text:tx('sk.recent')}));if(it.hint)kids.push(h('span',{'class':'sk-hint',text:it.hint}));
    if(it.k==='hist')kids.push(h('button',{type:'button','class':'sk-x',tabindex:'-1',title:tx('sk.forget'),'aria-label':tx('sk.forget'),text:X,'data-skx':String(i)}))}
   dd.appendChild(h('div',{'class':'sk-o sk-'+it.k,id:uid+'-o'+i,role:'option','aria-selected':'false','data-ski':String(i)},kids))});
  var more=st.mode==='hist'||bes?0:(st.more||0);if(more>0)dd.appendChild(h('div',{'class':'sk-note',text:tx('sk.more',{n:more})}));
  if(st.act>=its.length)st.act=its.length-1;setOpen(true);place();mark()}
 function mark(){var ks=dd.children||[];for(var i=0;i<ks.length;i++){var k=ks[i],n=k.getAttribute?k.getAttribute('data-ski'):null;if(n==null)continue;k.setAttribute('aria-selected',+n===st.act?'true':'false');if(+n===st.act&&k.scrollIntoView)try{k.scrollIntoView({block:'nearest'})}catch(e){}}
  if(st.act>=0)input.setAttribute('aria-activedescendant',uid+'-o'+st.act);else rmA(input,'aria-activedescendant')}
 // a new text: ask the index (stale answers ignored by seq), draw in the next frame
 // all: ArrowDown on an empty box asks the index for '' (the first rows of the whole index, paged by the "show more" row)
 function update(all){st.mode='';st.act=-1;st.cap=CAP;var my=++st.seq,q=span().t;st.hits=[];st.more=0;sched();if((!q&&!all)||bes)return;
  try{IDX(q,function(l,more){if(my!==st.seq)return;st.hits=Array.isArray(l)?l:[];st.more=+more||0;sched()})}catch(e){try{console.error('searchKit '+o.key+': index failed: '+(e&&e.message||e))}catch(x){}}}
 function choose(i){var it=st.items[i];if(!it)return;if(it.k==='clear'){LS.set(HK,[]);st.act=-1;sched();return}if(it.k==='more'){st.cap+=CAP;sched();return}pick(it.value,it.k==='index'?it.item:null,it.k==='hist'?'history':'index')}
 function pick(v,item,from){v=String(v==null?'':v);close();st.seq++;
  if(typeof o.onPick==='function'){o.onPick(v,item||null,from);remember(v);return}
  var nv=v,cp=null;if(tok&&from!=='history'){var s=span(),full=String(input.value==null?'':input.value),rest=full.slice(s.e),tail=OPS.test(v)||/^\s/.test(rest)?'':' ';nv=full.slice(0,s.s)+v+tail+rest;cp=s.s+v.length+tail.length}
  st.quiet=true;try{input.value=nv;if(cp!=null&&typeof input.setSelectionRange==='function')try{input.setSelectionRange(cp,cp)}catch(e){}fire('input');fire('change')}finally{st.quiet=false}
  remember(nv);if(tok&&from!=='history'&&OPS.test(v)){focus();update()}}
 function focus(){st.nofo=true;try{if(input.focus)input.focus()}catch(e){}st.nofo=false}
 function up(t,a){while(t&&t!==dd){if(t.getAttribute&&t.getAttribute(a)!=null)return t;t=t.parentNode}return null}
 dd.addEventListener('mousedown',pd);bH.addEventListener('mousedown',pd);
 // pd: a box inside a <label> (form fields) would get the label's click and open the list again after the pick
 dd.addEventListener('click',function(e){pd(e);var x=up(e.target,'data-skx');if(x){var it=st.items[+x.getAttribute('data-skx')];if(it)forget(it.value);if(e.stopPropagation)e.stopPropagation();st.act=-1;sched();return}
  var r=up(e.target,'data-ski');if(r)choose(+r.getAttribute('data-ski'))});
 input.addEventListener('input',function(){if(!st.quiet)update()});
 input.addEventListener('focus',function(){if(!st.quiet&&!st.nofo)update()});
 input.addEventListener('click',function(){if(!st.open||tok)update()});
 input.addEventListener('blur',function(){close();remember(input.value)});
 input.addEventListener('change',function(){if(!st.quiet)remember(input.value)});
 input.addEventListener('keydown',function(e){var k=e.key;if(e.isComposing||e.keyCode===229)return;
  // beside, typing: arrows and Enter belong to the page's list under the box; the kit's history rows step aside
  if(bes&&st.mode!=='hist'&&(k==='ArrowDown'||k==='ArrowUp'||k==='Enter')){if(k==='Enter')remember(input.value);close();return}
  if(k==='ArrowDown'||k==='ArrowUp'){if(!st.open){if(k==='ArrowUp'||!ARW)return;update(true);st.act=0;used(e);return}
   var n=st.items.length;if(!n)return;st.act=k==='ArrowDown'?(st.act+1)%n:(st.act<=0?n-1:st.act-1);mark();used(e);return}
  if(k==='Enter'){if(st.open&&st.act>=0&&st.items[st.act]){used(e);choose(st.act);return}remember(input.value);close();return}
  if(k==='Escape'&&st.open){close();used(e)}});
 bH.addEventListener('click',function(){if(st.open&&st.mode==='hist'){close();return}st.seq++;st.mode='hist';st.act=-1;st.want=true;if(D.activeElement!==input)focus();build()});
 // Browse = always the folder / file picker (owner 2026-11-19: "browse should always be a file directory browse"). o.browse: a spec
 // {mode,start,view,exts,toValue,out}, or a function(done) of a box that opens the same picker itself; none = the default spec
 function bname(p){var s=String(p==null?'':p).replace(/[\\\/]+$/,''),b=s.slice(Math.max(s.lastIndexOf('/'),s.lastIndexOf('\\'))+1),i=b.lastIndexOf('.');return i>0?b.slice(0,i):b}
 function browse(){close();if(typeof o.browse==='function'){o.browse(function(v,item){pick(v,item,'browse')});return}
  var b=o.browse&&typeof o.browse==='object'?o.browse:null,P=searchKit.picker;
  if(typeof P!=='function'){try{console.error('searchKit '+o.key+': no file browser (searchKit.picker is not set on this page)')}catch(e){}return}
  var s=b?b.start:'';if(typeof s==='function'){try{s=s()}catch(e){s=''}}
  var sp={mode:b&&b.mode==='dir'?'dir':'file',start:s==null?'':String(s),view:b&&b.view==='data'?'data':'disk',exts:b&&Array.isArray(b.exts)?b.exts:null,out:!!(b&&b.out),def:!b};
  if(b&&b.game)sp.game=String(b.game);   // data view of another game than the header's (its id), e.g. the AS2 donor box on the GoH page
  P(sp,function(p,entry){
   var v=b&&typeof b.toValue==='function'?b.toValue(p,entry||null):b?p:bname(p);if(v==null||v==='')return;pick(v,entry||null,'browse')})}
 bB.addEventListener('click',browse);
 function refresh(){LC=null;if(st.open&&st.mode!=='hist')update()}
 var kit={el:wrap,input:input,remember:remember,refresh:refresh,focus:focus,close:close,isOpen:function(){return st.open},history:hist,flush:function(){if(st.pend)build()},items:function(){return st.items.slice()},browseButton:bB,historyButton:bH,list:dd,browse:browse};
 input._sk=kit;return kit}
if(typeof window!=='undefined')window.searchKit=searchKit;
// the kit's Browse: b = {mode,start,view,exts,out,def} (def: the box gave no browse). An empty disk start = the mod, else the game folder,
// else the roots. A phone (RMT, view only) has no disk: the default Browse shows the game data there, a box that asks for the disk is told.
searchKit.picker=function(b,done){var data=b.view==='data';if(RMT&&!data&&b.def)data=true;
 var s=b.start||'';if(!data&&!s)s=S.mod||curFolder()||'';pick(b.mode==='dir'?'dir':'file',s,done,{view:data?'data':'disk',exts:b.exts,out:b.out,game:b.game})};
// the folder popup's filter box: history (texts typed and paths picked), index = the entries of the folder on show plus the recent picks
// (built once per folder list), browse = the folder list itself under the box (Browse clears the filter and puts the focus in it)
var PKI={src:null,mode:'',a:[]};
function pkIdx(){var m=pkRec(),dm=PK.mode==='dir';if(PKI.src===PK.items&&PKI.mode===m)return PKI.a;var a=[];
 recGet(m).forEach(function(p){a.push({label:p,value:p,hint:tx('pk.recent'),go:dm?p:null,file:dm?null:p})});
 (PK.items||[]).forEach(function(it){if(it.more!=null)return;a.push({label:it.label,value:it.dir?it.go:it.file,hint:'',go:it.dir?it.go:null,file:it.dir?null:it.file,ent:it.ent||null})});
 a.forEach(function(x){x.lo=String(x.label).toLowerCase()});PKI={src:PK.items,mode:m,a:a};return a}
var PKK=$('pkq')?searchKit($('pkq'),{key:'pk.filter',arrows:false,
 index:function(q,done){q=q.toLowerCase();done(pkIdx().filter(function(x){return x.lo.indexOf(q)>=0}))},
 browse:function(){var q=$('pkq');q.value='';PK.sel=0;pkRender();var l=$('pklist');if(l&&l.focus)l.focus()},
 onPick:function(v,it){if(it&&it.go){pkLoad(it.go);return}if(it&&it.file){pkDone(it.file,it.ent);return}if(/[\\\/:]/.test(v)){pkLoad(v);return}$('pkq').value=v;PK.sel=0;pkRender()}}):null;
if(PKK&&PKK.el.style)PKK.el.style.flex='1';
// set after the kit: a browser runs a handler property in the place it was first set, and the kit marks the keys it took (e._sk)
if($('pkq')){$('pkq').oninput=function(){PK.sel=0;pkRender()};$('pkq').onkeydown=function(e){if(e._sk)return;pkKey(e,false)}}

// ---------- blocks: the unit of layout (contract: ----------
// A block is an element with class blk and data-blk=<id>, the id unique in its screen. A leaf block holds controls and content; a container
// block (class blc box-<col|row|grid|cols>) holds blocks only. h(tag,{blk:id,box:kind},kids) makes one; blk(), asBlk(), fld(), card() are
// short forms. Arrange (Tools & Settings > Settings, and Ctrl+K) moves a block before or after another one, or into another container of the same screen, and hides
// it; never a free position, so blocks cannot overlap. Each screen's arrangement ({o:{containerId:[block ids]},hid:[ids]}, '@' = the screen)
// is kept in the active named profile in the window settings ('layout'). blkApply(root) puts a screen back in the profile's arrangement:
// on load, on show, and (in a browser) after any redraw that adds blocks. Unknown ids are ignored; blocks the profile does not name keep
// their default place.
var BL={on:false,drag:null,moreShut:false};
// add class c to e (classList when the DOM has classList.add, else the className string: the small fake DOMs of ext tests)
function blkCls(e,c){if(e.classList&&typeof e.classList.add==='function')e.classList.add(c);else if((' '+(e.className||'')+' ').indexOf(' '+c+' ')<0)e.className=(e.className?e.className+' ':'')+c}
// box kinds: col, row, grid, cols (wide columns first, the last narrow), ncols (the first column narrow, the others wide)
function blkMark(e,id,box){if(!e)return e;e.setAttribute('data-blk',String(id));if(e.dataset&&e.dataset.blk==null)e.dataset.blk=String(id);blkCls(e,'blk');if(box){blkCls(e,'blc');blkCls(e,'box-'+(/^(col|row|grid|cols|ncols)$/.test(box)?box:'col'))}return e}
function blk(id,kids,o){o=o||{};var a={};Object.keys(o.attrs||{}).forEach(function(k){a[k]=o.attrs[k]});if(o['class'])a['class']=o['class'];var e=h(o.tag||'div',a,kids);if(o.name)e.setAttribute('data-blkname',o.name);return blkMark(e,id,o.box)}
function asBlk(e,id,o){o=o||{};if(e&&o.name)e.setAttribute('data-blkname',o.name);return blkMark(e,id,o.box)}
// a labelled control: o = {req, title, chk (a tick box row), f (data-f), after (an element after the control, e.g. a Browse button)}
function fld(id,label,ctl,o){o=o||{};return blk(id,[h('label',{'class':'f'+(o.chk?' chk':''),title:o.title||null,'data-f':o.f||null},[h('span',{'class':'n'+(o.req?' req':''),text:label,title:o.title||null}),ctl,o.after||h('span')])],{'class':'fld',name:label})}
function card(id,kids,o){o=o||{};return blk(id,kids,{box:'col','class':'card'+(o['class']?' '+o['class']:''),attrs:o.attrs,name:o.name})}
// insert e before ref when ref is still a child of c (a block may have been moved by the profile), else at the end of c
function blkPut(c,e,ref){if(ref&&ref.parentNode===c)c.insertBefore(e,ref);else c.appendChild(e);return e}
// blkDrop(root, ids): see blkDedup below
function isBlk(e){return !!(e&&e.dataset&&e.dataset.blk!=null)}
function isBox(e){return isBlk(e)&&!!e.classList&&e.classList.contains('blc')}
function isRoot(e){return !!(e&&e.dataset&&e.dataset.blkroot!=null)}
function kidsOf(c){var o=[],k=(c&&c.children)||[];for(var i=0;i<k.length;i++)o.push(k[i]);return o}
function blkKids(c){return kidsOf(c).filter(isBlk)}
function blkAll(r){return Array.prototype.slice.call(r.querySelectorAll('[data-blk]'))}
function blkRootOf(e){while(e&&!isRoot(e))e=e.parentNode;return e||null}
function blkBoxOf(b){var p=b&&b.parentNode;return p&&(isBox(p)||isRoot(p))?p:null}
function blkHas(a,b){while(b){if(b===a)return true;b=b.parentNode}return false}
function nextOf(e){var k=kidsOf(e.parentNode),i=k.indexOf(e);return k[i+1]||null}
function blkMap(r){var m={};blkAll(r).forEach(function(e){if(!m[e.dataset.blk])m[e.dataset.blk]=e});return m}
function boxKey(c){return isRoot(c)?'@':c.dataset.blk}
function blkOff(b){return b.classList.contains('blkoff')}
function blkAllRoots(fn){Object.keys(S.sec||{}).forEach(function(k){fn(S.sec[k])})}
// the profiles: LS 'layout' = {v:1, active:name, profiles:{name:{screens:{screenId:{o,hid}}}}}; always one active profile
function blkL(){var L=LS.get('layout',null);if(!L||typeof L!=='object'||!L.profiles||typeof L.profiles!=='object'||Array.isArray(L.profiles))L={v:1,active:'',profiles:{}};
 if(!L.profiles[L.active]||typeof L.profiles[L.active]!=='object'){var ks=Object.keys(L.profiles).filter(function(k){return L.profiles[k]&&typeof L.profiles[k]==='object'});L.active=ks.length?ks[0]:tx('blk.first');if(!ks.length)L.profiles[L.active]={screens:{}}}
 var p=L.profiles[L.active];if(!p.screens||typeof p.screens!=='object'||Array.isArray(p.screens))p.screens={};
 var ch=false;Object.keys(L.profiles).forEach(function(k){var q=L.profiles[k];if(q&&typeof q==='object'&&q.screens&&typeof q.screens==='object'&&!Array.isArray(q.screens)&&blkMigrate(q.screens))ch=true});if(ch)LS.set('layout',L);return L}
// W5 Make split: a profile saved while Make held new, gen and upgrade. Its upgrade blocks (ub, upadv, upgrade) go to the Upgrade or Port page (unless that
// page has its own layout), its New Mod blocks (new...) to Mods; both are taken out of make, so the move happens once. true = something changed
function blkMigrate(screens){if(!screens||typeof screens!=='object')return false;var mk=screens.make;if(!mk||typeof mk!=='object'||Array.isArray(mk))return false;
 var o=mk.o&&typeof mk.o==='object'&&!Array.isArray(mk.o)?mk.o:{},hid=Array.isArray(mk.hid)?mk.hid:[],UP=/^(ub|upadv|upgrade)(\.|$)/,NW=/^new(\.|$)/,ch=false;
 function arr(a){return Array.isArray(a)?a:[]}
 function has(re){return hid.some(function(x){return re.test(x)})||Object.keys(o).some(function(k){return re.test(k)||arr(o[k]).some(function(x){return re.test(x)})})}
 function strip(re){mk.hid=hid=hid.filter(function(x){return !re.test(x)});Object.keys(o).forEach(function(k){if(re.test(k))delete o[k];else if(Array.isArray(o[k]))o[k]=o[k].filter(function(x){return !re.test(x)})});ch=true}
 function into(sid,re,top){var e=screens[sid]&&typeof screens[sid]==='object'&&!Array.isArray(screens[sid])?screens[sid]:(screens[sid]={});
  e.o=e.o&&typeof e.o==='object'&&!Array.isArray(e.o)?e.o:{};e.hid=arr(e.hid);hid.forEach(function(x){if(re.test(x)&&e.hid.indexOf(x)<0)e.hid.push(x)});
  Object.keys(o).forEach(function(k){if(re.test(k)&&!e.o[k])e.o[k]=arr(o[k]).slice()});if(top){var t=arr(o['@']).filter(function(x){return x==='title'||re.test(x)});if(t.length>1&&!e.o['@'])e.o['@']=t}}
 if(has(UP)){if(!screens.upgrade)into('upgrade',UP,true);strip(UP)}
 if(has(NW)){into('mods',NW,false);strip(NW)}
 return ch}
function blkEntry(sid){var L=blkL(),e=L.profiles[L.active].screens[sid];return e&&typeof e==='object'?e:{}}
// the default place of each block, noted the first time it is seen (Reset puts it back there)
function blkHome(r){blkAll(r).forEach(function(e){if(e._bh)return;var p=blkBoxOf(e);e._bh={p:p?boxKey(p):null,i:p?blkKids(p).indexOf(e):0}})}
// put the blocks of c named in ids in that order; the blocks ids does not name keep their places
function blkOrder(c,ids){var ks=blkKids(c),slots=[],want=[];ks.forEach(function(k,i){if(ids.indexOf(k.dataset.blk)>=0)slots.push(i)});
 ids.forEach(function(id){for(var i=0;i<ks.length;i++)if(ks[i].dataset.blk===id&&want.indexOf(ks[i])<0){want.push(ks[i]);return}});
 if(want.length!==slots.length)return false;var fin=ks.slice();slots.forEach(function(s,j){fin[s]=want[j]});
 if(fin.every(function(k,i){return k===ks[i]}))return false;
 var ph=ks.map(function(k){var t=document.createTextNode('');c.insertBefore(t,k);return t});
 fin.forEach(function(k,i){c.insertBefore(k,ph[i])});ph.forEach(function(t){c.removeChild(t)});return true}
// two blocks with one id in a screen (it drew a block again while the user had moved the old copy elsewhere): the newer takes the older
// one's place (its place in the profile) and the older goes; blocks the user had moved into the older one move into the newer (or next
// to it), its own default blocks the newer did not draw again go with it. Two new blocks with one id (a screen fault): the last stays and
// r._blkdup notes the id (test/blockcheck.js reports it). fresh = the blocks not seen by an apply before (no _bh yet).
function blkDedup(r,fresh){var by={},ks=[];blkAll(r).forEach(function(e){var id=e.dataset.blk;if(!by[id]){by[id]=[];ks.push(id)}by[id].push(e)});
 ks.forEach(function(id){var l=by[id].filter(function(e){return blkHas(r,e)});if(l.length<2)return;
  var nw=l.filter(function(e){return fresh.indexOf(e)>=0}),od=l.filter(function(e){return fresh.indexOf(e)<0}),w;
  if(nw.length&&od.length){w=nw[nw.length-1];if(od[0]._bh)w._bh=od[0]._bh;if(!blkHas(w,od[0])&&od[0].parentNode)od[0].parentNode.insertBefore(w,od[0])}
  else{w=l[l.length-1];r._blkdup=(r._blkdup||[]).concat([id])}
  l.forEach(function(e){if(e===w||!e.parentNode||blkHas(e,w))return;
   if(isBox(e)){var own=[id].concat(blkAll(e).map(function(d){return d.dataset.blk}));
    blkAll(e).forEach(function(d){if(!blkHas(e,d)||!d._bh||d._bh.p==null||own.indexOf(d._bh.p)>=0||fresh.indexOf(d)>=0)return;
     if(isBox(w))w.appendChild(d);else if(w.parentNode)w.parentNode.insertBefore(d,nextOf(w))})}
   e.parentNode.removeChild(e)})})}
// remove the blocks with these ids (an id ending in * = every id starting with the rest) from a screen, wherever the profile put them.
// A screen calls it when it stops drawing a block (or redraws a container without a block it drew before): a copy the user had moved
// out of that container has no newer twin, so blkApply cannot know it is stale. Returns the count removed.
function blkDrop(r,ids){if(!r)return 0;ids=Array.isArray(ids)?ids:[ids];var n=0;
 blkAll(r).forEach(function(e){var id=e.dataset.blk;if(!blkHas(r,e)||!ids.some(function(x){x=String(x);return x.slice(-1)==='*'?id.indexOf(x.slice(0,-1))===0:id===x}))return;if(e.parentNode){e.parentNode.removeChild(e);n++}});return n}
function blkApply(r){if(!isRoot(r))return;var all=blkAll(r);if(!all.length)return;var fresh=all.filter(function(e){return !e._bh});blkHome(r);blkDedup(r,fresh);var m=blkMap(r);
 var E=blkEntry(r.dataset.blkroot),o=E.o&&typeof E.o==='object'?E.o:{},hid=Array.isArray(E.hid)?E.hid:[];
 Object.keys(o).forEach(function(cid){var c=cid==='@'?r:m[cid],ids=o[cid];if(!c||!(c===r||isBox(c))||!Array.isArray(ids))return;
  ids.forEach(function(id){var b=m[id];if(!b||b===c||b.parentNode===c||blkHas(b,c)||!blkBoxOf(b))return;c.appendChild(b)});
  blkOrder(c,ids)});
 Object.keys(m).forEach(function(id){var b=m[id],off=hid.indexOf(id)>=0;if(off!==blkOff(b)){if(off)b.classList.add('blkoff');else b.classList.remove('blkoff')}});
 if(BL.on){blkBars(r,true);if(S.sec[S.cur]===r)blkDrawHidden()}}
function blkRestore(r){var m=blkMap(r),by={};
 Object.keys(m).forEach(function(id){var b=m[id],hm=b._bh;b.classList.remove('blkoff');if(!hm||hm.p==null)return;var c=hm.p==='@'?r:m[hm.p];if(!c||blkHas(b,c))return;
  if(b.parentNode!==c)c.appendChild(b);(by[hm.p]=by[hm.p]||[]).push(b)});
 Object.keys(by).forEach(function(k){blkOrder(k==='@'?r:m[k],by[k].sort(function(a,b){return a._bh.i-b._bh.i}).map(function(b){return b.dataset.blk}))})}
// the screen as it is now, merged over the stored entry (containers not on screen now keep their lists, minus the blocks seen elsewhere)
function blkState(r,old){old=old||{};var o={},hid=[],m=blkMap(r),oo=old.o&&typeof old.o==='object'?old.o:{};
 Object.keys(oo).forEach(function(k){if(Array.isArray(oo[k])&&k!=='@'&&!m[k])o[k]=oo[k].filter(function(id){return !m[id]})});
 o['@']=blkKids(r).map(function(b){return b.dataset.blk});
 Object.keys(m).forEach(function(id){var b=m[id];if(isBox(b))o[id]=blkKids(b).map(function(x){return x.dataset.blk});if(blkOff(b))hid.push(id)});
 (Array.isArray(old.hid)?old.hid:[]).forEach(function(id){if(!m[id]&&hid.indexOf(id)<0)hid.push(id)});return {o:o,hid:hid}}
function blkStore(r){var L=blkL(),sc=L.profiles[L.active].screens,sid=r.dataset.blkroot;sc[sid]=blkState(r,sc[sid]);LS.set('layout',L)}
// Arrange mode: a bar on each block (handle, up, down, next box, hide); the block's own controls are inert
function blkHost(b){if(b.tagName==='DETAILS'){var k=kidsOf(b);for(var i=0;i<k.length;i++)if(k[i].tagName==='SUMMARY')return k[i]}return b}
function barOf(b){var k=kidsOf(blkHost(b));for(var i=0;i<k.length;i++)if(k[i].classList&&k[i].classList.contains('blkbar'))return k[i];return null}
// a block's name (bar, messages): data-blkname; its aria-label; its first heading, legend, summary or caption; its first label's first
// text; a table as "Table: <first header>"; the first control's aria-label, title, placeholder or button text; its first text alone; any
// aria-label inside; else the word for empty. Never several texts run together. At most 40 characters.
function blkIsTxt(n){return !!n&&(n.nodeType===3||n.tagName==='#TEXT')}
function blkTag(n){return String((n&&n.tagName)||'').toUpperCase()}
function blkIsBar(n){return !!(n&&n.classList&&typeof n.classList.contains==='function'&&n.classList.contains('blkbar'))}
function blkSkip(n){return blkIsBar(n)||/^(SELECT|TEXTAREA|SCRIPT|STYLE|OPTION|TEMPLATE)$/.test(blkTag(n))}
function blkNodes(e){return (e&&(e.childNodes||e.children))||[]}
function blkTx(n){return String((n.nodeValue!=null?n.nodeValue:n.textContent)||'').replace(/\s+/g,' ').trim()}
function blkFind(e,f){var k=blkNodes(e);for(var i=0;i<k.length;i++){var n=k[i];if(!n||blkIsBar(n))continue;if(f(n))return n;if(!blkIsTxt(n)&&!blkSkip(n)){var x=blkFind(n,f);if(x)return x}}return null}
function blkTexts(e){var o=[];(function w(x){var k=blkNodes(x);for(var i=0;i<k.length;i++){var n=k[i];if(blkIsTxt(n)){var t=blkTx(n);if(t)o.push(t)}else if(n&&!blkSkip(n))w(n)}})(e);return o.join(' ')}
function blkFirstTx(e){var t=blkFind(e,function(n){return blkIsTxt(n)&&!!blkTx(n)});return t?blkTx(t):''}
function blkAttr(e,k){return e&&e.getAttribute?e.getAttribute(k)||'':''}
function blkName(b){if(b._blkn)return b._blkn;var n=blkAttr(b,'data-blkname')||blkAttr(b,'aria-label'),x;
 if(!n){x=blkFind(b,function(e){return /^(H[1-6]|LEGEND|SUMMARY|CAPTION)$/.test(blkTag(e))&&!!blkTexts(e)});if(x)n=blkTexts(x)}
 if(!n){x=blkFind(b,function(e){return blkTag(e)==='LABEL'&&!!blkFirstTx(e)});if(x)n=blkFirstTx(x)}
 if(!n){x=blkFind(b,function(e){return blkTag(e)==='TABLE'});if(x){var th=blkFind(x,function(e){return blkTag(e)==='TH'&&!!blkTexts(e)});n=th?tx('blk.table',{name:blkTexts(th)}):tx('blk.tableN')}}
 if(!n){x=blkFind(b,function(e){var t=blkTag(e);return /^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(t)&&!(t==='INPUT'&&blkAttr(e,'type')==='hidden')});
  if(x)n=blkAttr(x,'aria-label')||blkAttr(x,'title')||blkAttr(x,'placeholder')||(blkTag(x)==='BUTTON'?blkTexts(x):'')}
 if(!n)n=blkFirstTx(b);
 if(!n&&b.querySelector){x=b.querySelector('[aria-label]');n=x?blkAttr(x,'aria-label'):''}
 n=String(n||'').replace(/\s+/g,' ').trim()||tx('blk.empty');return n.length>40?n.slice(0,39)+'...':n}
// shown on screen: neither e nor an element above it (up to the screen root) is hidden (attribute), hidden by the profile, or a closed
// details (for its content). Arrange never moves a block into a container that is not shown (it would seem to vanish)
// debug: as2Blocks.overlaps(root?) -> [{kind:'overlap', a, b, screen, where}] for visible boxes that intersect by more than 1px both ways
// where neither holds the other, checked between sibling blocks of each shown container and between the direct visible children of
// each shown leaf (text by Range rects), plus [{kind:'overflow', a, b:null, screen, by, scrolls}] for a leaf whose scrollWidth exceeds its
// clientWidth (scrolls = it has a scroll bar on purpose). No root = every screen not hidden. Cheap: one screen at a time is fine.
function blkRects(n){if(!n)return [];var q,o=[];
 if(blkIsTxt(n)){if(!blkTx(n)||!document.createRange)return [];var rg=document.createRange();rg.selectNodeContents(n);q=rg.getClientRects?rg.getClientRects():[];for(var i=0;i<q.length;i++)if(q[i].width>0&&q[i].height>0)o.push(q[i]);return o}
 if(!n.getBoundingClientRect)return [];var cs=window.getComputedStyle?window.getComputedStyle(n):null;if(cs&&(cs.display==='none'||cs.visibility==='hidden'||cs.position==='fixed'))return [];
 q=n.getBoundingClientRect();return q&&q.width>0&&q.height>0?[q]:[]}
function blkHit(a,b){return Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1}
function blkDesc(n){if(blkIsTxt(n))return 'text "'+blkTx(n).slice(0,40)+'"';var id=blkAttr(n,'id'),c=typeof n.className==='string'?n.className.trim():'';
 return (isBlk(n)?'block '+n.dataset.blk+' ':'')+blkTag(n).toLowerCase()+(id?'#'+id:'')+(c?'.'+c.split(/\s+/).join('.'):'')+(isBlk(n)?'':' "'+blkTexts(n).slice(0,30)+'"')}
function blkOverlaps(root){var rs=[],out=[];if(root)rs=[root];else blkAllRoots(function(x){if(!x.hidden)rs.push(x)});
 rs.forEach(function(r){if(!r)return;var sid=r.dataset?r.dataset.blkroot:'';
  function pairs(list,where){var L=list.map(function(n){return {n:n,q:blkRects(n)}}).filter(function(x){return x.q.length});
   for(var i=0;i<L.length;i++)for(var j=i+1;j<L.length;j++){var a=L[i],b=L[j];if(blkHas(a.n,b.n)||blkHas(b.n,a.n))continue;
    if(a.q.some(function(p){return b.q.some(function(q){return blkHit(p,q)})}))out.push({kind:'overlap',a:blkDesc(a.n),b:blkDesc(b.n),screen:sid,where:where})}}
  var bs=blkAll(r).filter(function(b){return blkShown(b,r)});
  [r].concat(bs.filter(isBox)).forEach(function(c){pairs(blkKids(c).filter(function(b){return blkShown(b,r)}),c===r?'@':c.dataset.blk)});
  bs.filter(function(b){return !isBox(b)}).forEach(function(b){var ks=[],k=blkNodes(b);for(var i=0;i<k.length;i++)if(k[i]&&(blkIsTxt(k[i])||!k[i].hidden))ks.push(k[i]);pairs(ks,b.dataset.blk);
   if(typeof b.scrollWidth==='number'&&typeof b.clientWidth==='number'&&b.clientWidth>0&&b.scrollWidth>b.clientWidth+1){var cs=window.getComputedStyle?window.getComputedStyle(b):null;
    out.push({kind:'overflow',a:blkDesc(b),b:null,screen:sid,by:b.scrollWidth-b.clientWidth,scrolls:!!(cs&&/auto|scroll/.test(cs.overflowX||''))})}})});
 return out}
function blkShown(e,r){for(var n=e;n&&n!==r;n=n.parentNode){if(n.hidden||(n.getAttribute&&n.getAttribute('hidden')!=null)||(n.classList&&n.classList.contains('blkoff'))||(blkTag(n)==='DETAILS'&&!n.open))return false}return true}
function blkBar(b){var nm=blkName(b);b._blkn=nm;
 function mk(act,sym,key){return h('button',{type:'button','class':'blkb','data-blkact':act,title:tx(key,{name:nm}),'aria-label':tx(key,{name:nm}),text:sym,onclick:function(e){if(e&&e.preventDefault)e.preventDefault();if(BL.eat){BL.eat=false;return}blkAct(b,act,e)}})}
 var hd=mk('drag','☰','blk.handle');   // dragged with pointer events (blkPdDown on the bar); no draggable attribute: a native drag would cancel the pointer stream
 hd.addEventListener('dragstart',function(e){BL.drag=b;try{e.dataTransfer.setData('text/plain',b.dataset.blk);e.dataTransfer.effectAllowed='move'}catch(x){}});
 hd.addEventListener('dragend',function(){BL.drag=null});
 hd.addEventListener('keydown',function(e){var k=e.key,d=k==='ArrowUp'||k==='ArrowLeft'?-1:k==='ArrowDown'||k==='ArrowRight'?1:0;if(!d)return;e.preventDefault();blkAct(b,d<0?'up':'down',e,'drag')});
 var bar=h('span',{'class':'blkbar',role:'group','aria-label':tx('blk.bar',{name:nm})},[hd,mk('up','↑','blk.up'),mk('down','↓','blk.down'),mk('box','⇄','blk.box'),mk('hide','✕','blk.hide'),h('span',{'class':'blkn',text:nm})]);bar.addEventListener('pointerdown',function(e){blkPdDown(b,e,bar)});return bar}
function blkBars(r,on){blkAll(r).forEach(function(b){var hs=blkHost(b),bar=barOf(b);
  if(!on){if(bar)hs.removeChild(bar)}else if(!bar){var nb=blkBar(b);if(hs===b)b.insertBefore(nb,b.firstChild||null);else hs.appendChild(nb)}
  kidsOf(b).forEach(function(k){if(!k.setAttribute||k.tagName==='#TEXT'||isBlk(k)||k.tagName==='SUMMARY'||(k.classList&&(k.classList.contains('blkbar')||k.classList.contains('arrph'))))return;
   if(on&&k.getAttribute('inert')==null){k.setAttribute('inert','');k.setAttribute('data-blkinert','1')}
   else if(!on&&k.getAttribute('data-blkinert')!=null){k.removeAttribute('inert');k.removeAttribute('data-blkinert')}})})}
function blkSay(m){var s=$('blkstat');if(s)s.textContent=m}
function blkAct(b,act,e,focusAct){var r=blkRootOf(b);if(!r||!BL.on)return;var nm=blkName(b);
 if(act==='up'||act==='down'){var c=blkBoxOf(b);if(!c)return;var ks=blkKids(c),d=act==='up'?-1:1,j=ks.indexOf(b)+d;while(j>=0&&j<ks.length&&blkOff(ks[j]))j+=d;
  if(j<0||j>=ks.length){blkSay(tx(d<0?'blk.first0':'blk.last0',{name:nm}));return}
  c.insertBefore(b,d<0?ks[j]:nextOf(ks[j]));blkSay(tx(d<0?'blk.movedUp':'blk.movedDown',{name:nm,other:blkName(ks[j])}))}
 else if(act==='box'){var bs=[r].concat(blkAll(r).filter(isBox)).filter(function(x){return x===blkBoxOf(b)||(!blkHas(b,x)&&blkShown(x,r))}),i=bs.indexOf(blkBoxOf(b));
  if(bs.length<2){blkSay(tx('blk.noBox'));return}var nc=bs[(i+(e&&e.shiftKey?-1:1)+bs.length)%bs.length];nc.appendChild(b);blkSay(tx('blk.movedBox',{name:nm,box:nc===r?tx('blk.screen'):blkName(nc)}))}
 else if(act==='hide'){b.classList.add('blkoff');blkSay(tx('blk.hidden',{name:nm}))}
 else return;
 if(act!=='hide')blkFlash(b);
 blkStore(r);blkDrawHidden();
 if(act==='hide'){var sb=$('blkhid'),x0=sb&&sb.querySelector('button[data-blkshow]');if(x0)x0.focus();return}
 var f=barOf(b),x=f&&f.querySelector('button[data-blkact='+(focusAct||act)+']');if(x)x.focus()}
// drag and drop: before or after the block under the pointer (halves along the container's direction), or into an empty part of a container
function blkTarget(e,r){var b=BL.drag;if(!b||blkRootOf(b)!==r)return null;var n=e.target;while(n&&n!==r&&!isBlk(n))n=n.parentNode;if(!n)return null;
 if(n===r)return {into:r};if(blkHas(b,n)||!blkShown(n,r))return null;if(isBox(n)&&e.target===n)return {into:n};
 var c=blkBoxOf(n);if(!c)return null;var q=n.getBoundingClientRect?n.getBoundingClientRect():null,after=false;
 if(q&&(q.width||q.height))after=c.classList.contains('box-row')?e.clientX>q.left+q.width/2:e.clientY>q.top+q.height/2;
 return {box:c,ref:n,after:after}}
// what a burst of DOM changes in a screen needs: 2 = an apply (blocks were added), 1 = bars and inert again while arranging (a redraw
// removed a bar with textContent='' or added content to a block), 0 = nothing (only bars came or went by Arrange itself)
function blkMut(rs){var k=0;for(var i=0;i<rs.length;i++){var a=rs[i].addedNodes||[],d=rs[i].removedNodes||[],j,n;
  for(j=0;j<a.length;j++){n=a[j];if(!n||blkIsBar(n)||blkIsPh(n))continue;if(k<1)k=1;if(!blkIsTxt(n)&&(isBlk(n)||(n.querySelector&&n.querySelector('[data-blk]'))))return 2}
  for(j=0;j<d.length;j++)if(blkIsBar(d[j])&&k<1)k=1}
 return k}
function blkWatch(r){if(typeof MutationObserver!=='function')return;var t=null,want=0;
 new MutationObserver(function(rs){var k=blkMut(rs);if(k<1||(k===1&&!BL.on))return;if(k>want)want=k;
  if(!t)t=setTimeout(function(){var w=want;t=null;want=0;if(w===2)blkApply(r);else if(BL.on)blkBars(r,true)},0)}).observe(r,{childList:true,subtree:true})}
function blkInitRoot(r){if(!r||r._blki)return;r._blki=1;
 if(blkKids(r).length){r.classList.add('blc');r.classList.add('box-col')}
 r.addEventListener('dragover',function(e){if(BL.on&&BL.drag&&blkTarget(e,r))e.preventDefault()});
 r.addEventListener('drop',function(e){if(!BL.on||!BL.drag)return;var t=blkTarget(e,r),b=BL.drag;BL.drag=null;if(!t)return;e.preventDefault();
  if(t.into)t.into.appendChild(b);else t.box.insertBefore(b,t.after?nextOf(t.ref):t.ref);blkStore(r);blkSay(tx('blk.dropped',{name:blkName(b)}))});
 blkWatch(r)}
// the Arrange panel above the page: profile, save as, rename, delete, export, import, reset, the hidden blocks of this screen
function blkPanel(){var p=$('blkpanel');if(p)return p;p=h('div',{id:'blkpanel','class':'blkpanel',role:'region',hidden:true});var mn=$('main');if(mn&&mn.parentNode)mn.parentNode.insertBefore(p,mn);else document.body.appendChild(p);return p}
function blkDrawPanel(){var p=blkPanel(),L=blkL(),was=$('blkmore');was=!!(was&&was.open);p.textContent='';p.setAttribute('aria-label',tx('blk.panel'));
 var sel=h('select',{id:'blkprof','aria-label':tx('blk.profile'),title:tx('blk.profile'),onchange:function(){blkUse(sel.value)}},Object.keys(L.profiles).map(function(n){return h('option',{value:n,text:n})}));sel.value=L.active;
 var nm=h('input',{type:'text',id:'blkname',autocomplete:'off',maxlength:'60','aria-label':tx('blk.name'),placeholder:tx('blk.name')});
 var bt=function(id,k,kt,fn,cls){return h('button',{type:'button',id:id,'class':cls||null,text:tx(k),title:tx(kt),onclick:fn})};
 var canEx=typeof Blob==='function'&&typeof window!=='undefined'&&window.URL&&typeof window.URL['createObjectURL']==='function',canIm=typeof FileReader==='function';
 var file=canIm?h('input',{type:'file',id:'blkfile',accept:'.json,application/json',hidden:true,'aria-label':tx('blk.import'),onchange:function(){blkImportFile(file)}}):null;
 // the first row (sticky with the panel): the page being arranged as its path in the tabs, the status line, Done; profiles fold away
 p.appendChild(h('div',{'class':'row'},[h('b',{id:'blkpath'}),h('span',{id:'blkstat','class':'hint',role:'status','aria-live':'polite'}),h('span',{style:'flex:1'}),bt('blkdone','blk.done','blk.doneT',function(){blkArrange(false)},'primary')]));
 p.appendChild(h('div',{'class':'hint',text:tx('blk.help')}));
 // the profiles fold opens by itself when there is more than one profile (no rule on names, so a language switch changes nothing);
 // open stays open across redraws, and a fold the user closed stays closed for the session (BL.moreShut)
 var more=!BL.moreShut&&(was||Object.keys(L.profiles).length>1);
 var fold=h('details',{id:'blkmore',open:more,ontoggle:function(){BL.moreShut=!fold.open}},[h('summary',{text:tx('blk.more')}),
  h('div',{'class':'row'},[h('label',{},[tx('blk.profile')+' ',sel]),nm,bt('blksave','blk.saveAs','blk.saveAsT',blkSaveAs),bt('blkren','blk.rename','blk.renameT',blkRename),bt('blkdel','blk.del','blk.delT',blkDelete,'danger'),
   canEx?bt('blkexp','blk.export','blk.exportT',blkExport):null,canIm?bt('blkimp','blk.import','blk.importT',function(){file.click()}):null,file]),
  h('div',{'class':'row'},[bt('blkrs','blk.resetScreen','blk.resetScreenT',blkResetScreen),bt('blkra','blk.resetAll','blk.resetAllT',blkResetAll,'danger')])]);
 p.appendChild(fold);p.appendChild(h('div',{id:'blkhid','class':'row'}));blkPath();blkDrawHidden()}
// the panel's first line names the page being arranged as a whole page, never one view (Arranging: Help & Docs > Docs), the same
// words as the Settings picker (pageOnlyPath); it follows the page while arranging
function blkPath(){var e=$('blkpath');if(e)e.textContent=tx('blk.titleP',{p:S.cur?pageOnlyPath(S.cur):''})}
function blkDrawHidden(){var d=$('blkhid');if(!d)return;d.textContent='';var r=S.sec&&S.sec[S.cur],hs=r?blkAll(r).filter(blkOff):[];
 d.appendChild(h('b',{text:tx('blk.hiddenH',{n:hs.length})}));if(!hs.length)d.appendChild(h('span',{'class':'hint',text:tx('blk.hiddenNone')}));
 hs.forEach(function(b){var nm=blkName(b);d.appendChild(h('button',{type:'button','data-blkshow':b.dataset.blk,text:tx('blk.show',{name:nm}),onclick:function(){b.classList.remove('blkoff');blkStore(r);blkDrawHidden();blkSay(tx('blk.shown',{name:nm}));
  var f=barOf(b),x=f&&f.querySelector('button[data-blkact=drag]');if(x)x.focus()}}))})}
function blkReapply(){blkAllRoots(function(r){blkRestore(r);blkApply(r)});if(BL.on)blkDrawPanel()}
function blkUse(n){var L=blkL();if(!L.profiles[n])return;L.active=n;LS.set('layout',L);blkReapply();blkSay(tx('blk.using',{name:n}))}
function blkNameIn(){var e=$('blkname'),v=e?String(e.value||'').trim():'';if(!v||v.length>60){blkSay(tx('blk.needName'));if(e&&e.focus)e.focus();return ''}return v}
function blkSaveAs(){var n=blkNameIn();if(!n)return;var L=blkL();
 function go(){var L2=blkL();L2.profiles[n]={screens:JSON.parse(JSON.stringify(L2.profiles[L2.active].screens||{}))};L2.active=n;LS.set('layout',L2);blkDrawPanel();blkSay(tx('blk.saved',{name:n}))}
 if(n===L.active){LS.set('layout',L);blkSay(tx('blk.saved',{name:n}));return}
 if(L.profiles[n]){askDo({title:tx('blk.saveAs'),lines:[tx('blk.overwrite',{name:n})],ok:tx('blk.saveAs'),danger:true}).then(function(y){if(y)go()});return}go()}
function blkRename(){var n=blkNameIn();if(!n)return;var L=blkL(),old=L.active;if(n===old)return;if(L.profiles[n]){blkSay(tx('blk.taken',{name:n}));return}
 L.profiles[n]=L.profiles[old];delete L.profiles[old];L.active=n;LS.set('layout',L);blkDrawPanel();blkSay(tx('blk.renamed',{old:old,name:n}))}
function blkDelete(){var n=blkL().active;askDo({title:tx('blk.del'),lines:[tx('blk.delQ',{name:n})],ok:tx('blk.del'),danger:true}).then(function(y){if(!y)return;var L=blkL();delete L.profiles[n];L.active='';LS.set('layout',blkL2(L));blkReapply();blkSay(tx('blk.deleted',{name:n}))})}
function blkL2(L){var ks=Object.keys(L.profiles);L.active=ks.length?ks[0]:tx('blk.first');if(!ks.length)L.profiles[L.active]={screens:{}};return L}
function blkResetScreen(){var r=S.sec&&S.sec[S.cur];if(!r)return;askDo({title:tx('blk.resetScreen'),lines:[tx('blk.resetScreenQ')],ok:tx('blk.resetScreen')}).then(function(y){if(!y)return;
 var L=blkL();delete L.profiles[L.active].screens[r.dataset.blkroot];LS.set('layout',L);blkRestore(r);blkDrawHidden();blkSay(tx('blk.resetDone'))})}
function blkResetAll(){askDo({title:tx('blk.resetAll'),lines:[tx('blk.resetAllQ',{name:blkL().active})],ok:tx('blk.resetAll'),danger:true}).then(function(y){if(!y)return;
 var L=blkL();L.profiles[L.active].screens={};LS.set('layout',L);blkReapply();blkSay(tx('blk.resetDone'))})}
// export = a JSON file the browser saves (as the Balance page saves its CSV); import = a JSON file the user picks, checked before use
function blkExport(){var L=blkL(),j=JSON.stringify({arsenalLayout:1,name:L.active,screens:L.profiles[L.active].screens||{}},null,1);
 try{var a=h('a',{href:window.URL['createObjectURL'](new Blob([j],{type:'application/json'})),download:'arsenal-layout-'+L.active.replace(/[^\w.-]+/g,'_')+'.json'});document.body.appendChild(a);a.click();document.body.removeChild(a);blkSay(tx('blk.exported'))}catch(e){blkSay(String(e&&e.message||e))}}
function blkParse(t){var j;try{j=JSON.parse(String(t==null?'':t).replace(/^﻿/,''))}catch(e){return null}
 if(!j||typeof j!=='object'||j.arsenalLayout!==1||!j.screens||typeof j.screens!=='object'||Array.isArray(j.screens))return null;
 var ids=function(a){return Array.isArray(a)?a.filter(function(x){return typeof x==='string'&&x.length>0&&x.length<=80}).slice(0,500):[]},sc={};
 Object.keys(j.screens).slice(0,100).forEach(function(k){var e=j.screens[k],o={};if(!/^[\w-]{1,40}$/.test(k)||!e||typeof e!=='object'||Array.isArray(e))return;
  if(e.o&&typeof e.o==='object'&&!Array.isArray(e.o))Object.keys(e.o).slice(0,300).forEach(function(c){if(c.length<=80&&Array.isArray(e.o[c]))o[c]=ids(e.o[c])});sc[k]={o:o,hid:ids(e.hid)}});
 blkMigrate(sc);var n=typeof j.name==='string'?j.name.replace(/\s+/g,' ').trim().slice(0,60):'';return {name:n||tx('blk.importedName'),screens:sc}}
function blkImport(text){var x=blkParse(text);if(!x){blkSay(tx('blk.badFile'));return false}
 function go(){var L=blkL();L.profiles[x.name]={screens:x.screens};L.active=x.name;LS.set('layout',L);blkReapply();blkSay(tx('blk.imported',{name:x.name}))}
 if(blkL().profiles[x.name])askDo({title:tx('blk.import'),lines:[tx('blk.overwrite',{name:x.name})],ok:tx('blk.import'),danger:true}).then(function(y){if(y)go()});else go();return true}
function blkImportFile(inp){var f=inp.files&&inp.files[0];if(!f)return;var rd=new FileReader();rd.onload=function(){blkImport(rd.result);inp.value=''};rd.onerror=function(){blkSay(tx('blk.badFile'))};rd.readAsText(f)}
function blkArrange(on){on=!!on;if(on===BL.on)return;if(!on)blkPdEnd(false);BL.on=on;BL.drag=null;var bd=document.body;if(on)bd.classList.add('arranging');else bd.classList.remove('arranging');
 blkAllRoots(function(r){blkBars(r,on)});var p=blkPanel();p.hidden=!on;if(on)blkDrawPanel();
 toast(tx(on?'blk.onSay':'blk.offSay'),on?6000:2500)}
// while arranging, a click inside a screen reaches only the block bars (and a summary, to open a fold); the inert attribute keeps the keyboard out
document.addEventListener('click',function(e){if(!BL.on)return;var n=e.target;while(n&&!isRoot(n)){if((n.classList&&n.classList.contains('blkbar'))||n.tagName==='SUMMARY')return;n=n.parentNode}if(!n)return;e.preventDefault();e.stopPropagation()},true);
// ---- pointer drag with a live preview (mouse, pen, touch). Press on a block's bar and move past BLT px: the block lifts (a translucent
// copy follows the pointer), a placeholder of its size takes its place at once and moves to where it would land: before the hovered
// block when the pointer is before its middle along the container (row kinds: left/right on the hovered line; col: above/below), else
// after it; over an empty part of a container at its end. Targets = the screen and its shown containers not inside the block (outlined).
// Release = drop at the placeholder and save as any move; Esc or release outside every target = back where it was, nothing saved. Near
// the top or bottom of the window the page scrolls. The placeholder (.arrph) and the copy (.arrghost, on body) are never blocks.
var BLT=6;
function blkIsPh(n){return !!(n&&n.classList&&typeof n.classList.contains==='function'&&(n.classList.contains('arrph')||n.classList.contains('arrghost')))}
function blkRowish(c){var l=c&&c.classList;return !!l&&(l.contains('box-row')||l.contains('box-grid')||l.contains('box-cols')||l.contains('box-ncols'))}
function blkRect(e){if(!e||!e.getBoundingClientRect)return null;var q=e.getBoundingClientRect();return q&&(q.width>0||q.height>0)?q:null}
function blkIn(q,x,y){return !!q&&x>=q.left&&x<=q.right&&y>=q.top&&y<=q.bottom}
function blkCalm(){try{return !window.matchMedia||window.matchMedia('(prefers-reduced-motion: reduce)').matches}catch(x){return true}}
// where block b would land at x,y among the targets cs: {c, ref (the block to go before) or null = at the end}; null = outside all
function blkSpot(b,x,y,cs){var c=null,i;for(i=0;i<cs.length;i++)if(blkIn(blkRect(cs[i]),x,y))c=cs[i];   // the last one = the deepest
 if(!c)return null;var ks=blkKids(c).filter(function(k){return k!==b&&!blkOff(k)&&!k.hidden}).map(function(k){return {k:k,q:blkRect(k)}}).filter(function(o){return o.q});
 if(blkRowish(c)){var ln=ks.filter(function(o){return y>=o.q.top&&y<=o.q.bottom});
  if(!ln.length){for(i=0;i<ks.length;i++)if(ks[i].q.top>y)return {c:c,ref:ks[i].k};return {c:c,ref:null}}
  for(i=0;i<ln.length;i++)if(x<ln[i].q.left+ln[i].q.width/2)return {c:c,ref:ln[i].k};
  var j=ks.indexOf(ln[ln.length-1]);return {c:c,ref:ks[j+1]?ks[j+1].k:null}}
 for(i=0;i<ks.length;i++)if(y<ks[i].q.top+ks[i].q.height/2)return {c:c,ref:ks[i].k};return {c:c,ref:null}}
// a copy of a block for the pointer: no ids, no block ids, no names (it lives on body, outside every screen)
function blkStrip(e){if(!e||!e.removeAttribute)return e;['id','data-blk','data-blkname','name','for','draggable'].forEach(function(k){if(e.getAttribute&&e.getAttribute(k)!=null)e.removeAttribute(k)});if(e.dataset&&e.dataset.blk!=null)delete e.dataset.blk;
 var k=e.children||[];for(var i=0;i<k.length;i++)blkStrip(k[i]);return e}
function blkPdDown(b,e,bar){BL.eat=false;if(!BL.on||BL.pd||!e||(e.pointerType==='mouse'&&e.button!=null&&e.button!==0))return;var r=blkRootOf(b);if(!r)return;
 BL.pd={b:b,r:r,bar:bar,x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY,id:e.pointerId,on:false}}
function blkPdMove(e){var p=BL.pd;if(!p||(p.id!=null&&e.pointerId!=null&&e.pointerId!==p.id))return;p.x=e.clientX;p.y=e.clientY;
 if(!p.on){if(Math.abs(p.x-p.x0)<BLT&&Math.abs(p.y-p.y0)<BLT)return;blkPdStart(p)}
 if(e.preventDefault)e.preventDefault();blkPdAt(p);blkPdScroll(p)}
function blkPdStart(p){var b=p.b,r=p.r,q=blkRect(b)||{left:p.x0,top:p.y0,width:0,height:0};p.on=true;p.dx=p.x0-q.left;p.dy=p.y0-q.top;
 var ph=h('div',{'class':'arrph','aria-hidden':'true'});if(q.width)ph.style.width=q.width+'px';if(q.height)ph.style.height=q.height+'px';b.parentNode.insertBefore(ph,b);p.ph=ph;
 var g=blkStrip(b.cloneNode?b.cloneNode(true):h('div',{text:blkName(b)}));g.className='arrghost';g.setAttribute('aria-hidden','true');g.setAttribute('inert','');
 if(q.width)g.style.width=q.width+'px';if(q.height)g.style.height=q.height+'px';document.body.appendChild(g);p.g=g;
 b.classList.add('arrlift');p.home={c:b.parentNode,ref:b};p.spot=p.home;
 p.cs=[r].concat(blkAll(r).filter(function(x){return isBox(x)&&!blkHas(b,x)&&blkShown(x,r)}));p.cs.forEach(function(c){c.classList.add('arrdrop')});
 document.body.classList.add('arrdragging');try{if(p.bar&&p.bar.setPointerCapture&&p.id!=null)p.bar.setPointerCapture(p.id)}catch(x){}
 blkSay(tx('blk.dragStart',{name:blkName(b)}))}
function blkPdAt(p){var g=p.g;if(g){g.style.left=(p.x-p.dx)+'px';g.style.top=(p.y-p.dy)+'px'}
 var s=blkSpot(p.b,p.x,p.y,p.cs);p.out=!s;if(!s)s=p.home;if(p.spot&&p.spot.c===s.c&&p.spot.ref===s.ref&&p.ph.parentNode===s.c)return;
 var ph=p.ph,old=ph.parentNode;p.spot=s;blkFlip(p,[old,s.c],function(){if(s.ref&&s.ref.parentNode===s.c)s.c.insertBefore(ph,s.ref);else s.c.appendChild(ph)})}
// the blocks around move to their new places smoothly (none when the user asks for reduced motion: placement only)
function blkFlip(p,cs,fn){if(blkCalm()){fn();return}var es=[];cs.forEach(function(c,i){if(c&&cs.indexOf(c)===i)es=es.concat(blkKids(c))});var a=es.map(blkRect);fn();
 es.forEach(function(e,i){var q=blkRect(e),o=a[i];if(!q||!o||!e.style)return;var dx=o.left-q.left,dy=o.top-q.top;if(!dx&&!dy)return;
  e.style.transition='none';e.style.transform='translate('+dx+'px,'+dy+'px)';blkRect(e);e.style.transition='transform .15s ease';e.style.transform='';(p.fl=p.fl||[]).push(e)})}
function blkPdScroll(p){var H=window.innerHeight||0,d=function(){return !H?0:p.y<40?-1:p.y>H-40?1:0};
 if(!d()){if(p.tm){clearInterval(p.tm);p.tm=null}return}
 if(!p.tm&&window.scrollBy)p.tm=setInterval(function(){if(BL.pd!==p||!d()){clearInterval(p.tm);p.tm=null;return}window.scrollBy(0,d()*14);blkPdAt(p)},30)}
function blkPdUp(e){var p=BL.pd;if(!p||(p.id!=null&&e&&e.pointerId!=null&&e.pointerId!==p.id))return;if(!p.on){BL.pd=null;return}
 if(e&&e.clientX!=null){p.x=e.clientX;p.y=e.clientY;blkPdAt(p)}blkPdEnd(!p.out)}
// end a drag: keep = drop at the placeholder and save; else back where it was, nothing saved
function blkPdEnd(keep){var p=BL.pd;BL.pd=null;if(!p||!p.on)return;var b=p.b,r=p.r,ph=p.ph,nm=blkName(b);
 if(p.tm){clearInterval(p.tm);p.tm=null}
 if(keep&&ph.parentNode)ph.parentNode.insertBefore(b,ph);
 if(ph.parentNode)ph.parentNode.removeChild(ph);if(p.g&&p.g.parentNode)p.g.parentNode.removeChild(p.g);b.classList.remove('arrlift');
 p.cs.forEach(function(c){c.classList.remove('arrdrop')});document.body.classList.remove('arrdragging');(p.fl||[]).forEach(function(x){x.style.transition='';x.style.transform=''});
 try{if(p.bar&&p.bar.releasePointerCapture&&p.id!=null)p.bar.releasePointerCapture(p.id)}catch(x){}
 BL.eat=true;setTimeout(function(){BL.eat=false},0);   // the click that follows the release is not a bar button press
 if(!keep){blkSay(tx('blk.dragCancel',{name:nm}));return}
 blkStore(r);blkDrawHidden();var c=blkBoxOf(b),ks=c?blkKids(c):[],nx=ks[ks.indexOf(b)+1]||null,bx=c===r?tx('blk.screen'):blkName(c);
 blkSay(nx?tx('blk.placedBefore',{name:nm,other:blkName(nx),box:bx}):tx('blk.placedEnd',{name:nm,box:bx}));
 var f=barOf(b),x=f&&f.querySelector('button[data-blkact=drag]');if(x&&x.focus)x.focus()}
// a keyboard or button move: the moved block shows the placeholder outline briefly where it went
function blkFlash(b){b.classList.add('arrflash');if(b._flt&&typeof clearTimeout==='function')clearTimeout(b._flt);b._flt=setTimeout(function(){b.classList.remove('arrflash');b._flt=0},700)}
document.addEventListener('pointermove',blkPdMove);document.addEventListener('pointerup',blkPdUp);document.addEventListener('pointercancel',function(){blkPdEnd(false)});
if(typeof window!=='undefined')window.as2Blocks={migrate:blkMigrate,blk:blk,asBlk:asBlk,fld:fld,card:card,put:blkPut,apply:blkApply,arrange:blkArrange,on:function(){return BL.on},parse:blkParse,'import':blkImport,state:blkState,restore:blkRestore,drop:blkDrop,name:blkName,shown:blkShown,overlaps:blkOverlaps};

// ---------- forms from the contract ----------
var DIRNAMES={mod:1,out:1,game:1,goh:1,root:1,with:1,logdir:1,patch:1,as2:1,pack:1,dir:1,profile:1};   // GT-28: dir (new mod folder) is a folder too; mapshot's profile is a folder
var OUTNAMES={out:1,dir:1};
// I-18: requiredWhen {field:value} = required only when every named input has that value (fix out: apply only)
function reqWhen(f,vals){var w=f.requiredWhen;return !!w&&Object.keys(w).every(function(k){return vals[k]===w[k]})}
function reqNow(f,vals){return f.required||(f.requiredUnless&&!vals[f.requiredUnless])||reqWhen(f,vals)}
// GX C7/G11: plain field names and tooltips; the tool's own field name and text stay in the tooltip. data-f = the contract field name (tests find fields by it)
var FL={dir:['fl.dir','fl.dirT'],name:['fl.name','fl.nameT'],desc:['fl.desc','fl.descT'],deps:['fl.deps','fl.depsT'],dryRun:['fl.dryRun','fl.dryRunT'],mod:['fl.mod','fl.modT'],to:['fl.to','fl.toT'],
 plan:['fl.plan','fl.planT'],out:['fl.out','fl.outT'],thenFix:['fl.thenFix','fl.thenFixT'],'export':['fl.export','fl.exportT'],as2:['fl.as2','fl.as2T'],goh:['fl.goh','fl.gohT'],'with':['fl.with','fl.withT'],exe:['fl.exe','fl.exeT'],game:['fl.game','fl.gameT'],
 only:['fl.only','fl.onlyT'],fast:['fl.fast','fl.fastT'],locs:['fl.locs','fl.locsT'],mode:['fl.mode','fl.modeT'],set:['fl.set','fl.setT'],link:['fl.link','fl.linkT'],force:['fl.force','fl.forceT'],dry:['fl.dry','fl.dryT'],
 yes:['fl.yes','fl.yesT'],map:['fl.map','fl.mapT'],inst:['fl.inst','fl.instT'],pairs:['fl.pairs','fl.pairsT'],unit:['fl.unit','fl.unitT'],army:['fl.army','fl.armyT'],entity:['fl.entity','fl.entityT'],donor:['fl.donor','fl.donorT'],
 noDeps:['fl.noDeps','fl.noDepsT'],askJson:['fl.askJson','fl.askJsonT'],noAsk:['fl.noAsk','fl.noAskT'],dropLimits:['fl.dropLimits','fl.dropLimitsT'],noTranslate:['fl.noTranslate','fl.noTranslateT']};
function flName(f){var k=FL.hasOwnProperty(f.name)&&FL[f.name];return k?tx(k[0]):f.name}
function flHint(f){var k=FL.hasOwnProperty(f.name)&&FL[f.name];return k?tx(k[1]):f.desc}
function flTip(f){return flHint(f)+'  ('+f.name+(f.desc?': '+f.desc:'')+')'}
// buildForm boxes that take the path or name of a thing that already exists get searchKit (owner 2026-11-19: every search box has a
// manual browse, an indexed search and a history list): history 'form.<field name>' (shared by every form with that field), index =
// the recent picks of the folder picker, this mod, the game folders and the installed mods (folders), the recent file picks (files), or the
// game's map / unit names (GET /api/x/pro/names) and installed mod names; Browse = the folder or file picker where those things live.
// Fields for new names, numbers and free text stay plain. fkKind -> 'dir'|'file'|'map'|'unit'|'modname'|'mods'|null
var FKMODNAME={uninstall:1,e2e:1,'dev-loop':1};   // their name field is a folder in the game's mods/ that exists (install's is a new one)
function fkKind(cmdId,f){if(f.type==='path')return DIRNAMES[f.name]?'dir':'file';if(f.type!=='str'&&f.type!=='list')return null;
 if(f.name==='map')return 'map';if(f.name==='donor'||f.name==='unit')return 'unit';if(f.name==='mods')return 'mods';
 if(f.name==='name'&&FKMODNAME[cmdId])return 'modname';return null}
// the last part of a path: a file without its extension, a folder (keep) as it is
function fkBase(p,keep){var s=String(p||'').replace(/[\\\/]+$/,''),b=s.slice(Math.max(s.lastIndexOf('/'),s.lastIndexOf('\\'))+1),i=b.lastIndexOf('.');return keep||i<=0?b:b.slice(0,i)}
function fkItem(v,g,hint){v=String(v||'');return {group:tx(g),label:v,value:v,hint:hint||'',lo:v.toLowerCase()}}
// the installed mods and the folders the GUI knows, read once per mod and game folder
var FKI={k:null,j:null,w:[]};
function fkInst(cb){var k=String(S.mod||'')+'|'+curFolder();if(FKI.k!==k)FKI={k:k,j:null,w:[]};if(FKI.j){cb(FKI.j);return}FKI.w.push(cb);if(FKI.w.length>1)return;var me=FKI;
 api('/api/installed').then(function(j){return j||{}},function(){return {}}).then(function(j){me.j=j;me.w.splice(0).forEach(function(f){f(j)})})}
function fkFolders(cb){fkInst(function(j){var a=[],seen={};function add(p,g){p=String(p||'');var n=npath(p);if(!p||seen[n])return;seen[n]=1;a.push(fkItem(p,g,p.replace(/[\\\/]+$/,'').split(/[\\\/]/).pop()))}
 recGet('dir').forEach(function(p){add(p,'fk.g.recent')});add(S.mod,'fk.g.mod');add(curFolder(),'fk.g.game');add(gameDir(),'fk.g.game');add(gohDir(),'fk.g.game');add(j.game,'fk.g.game');
 if(j.game)(j.mods||[]).forEach(function(m){add(String(j.game).replace(/[\\\/]+$/,'')+'/mods/'+m.name,'fk.g.mods')});cb(a)})}
function fkModNames(cb){fkInst(function(j){cb((j.mods||[]).map(function(m){return fkItem(m.name,'fk.g.mods')}))})}
// map and unit names of the game, read once per game folder (the Tools page's route; no list when that page is not there)
var FKN={k:null,d:null,w:[]};
function fkNames(cb){var k=curFolder();if(FKN.k!==k)FKN={k:k,d:null,w:[]};if(FKN.d){cb(FKN.d);return}FKN.w.push(cb);if(FKN.w.length>1)return;var me=FKN;
 api('/api/x/pro/names').then(function(j){return j||{}},function(){return {}}).then(function(j){
  me.d={map:(j.maps||[]).map(function(v){return fkItem(v,'fk.g.maps')}),unit:(j.names||[]).map(function(x){return fkItem(x.n,x.k==='unit'?'fk.g.units':'fk.g.stuff')})};me.w.splice(0).forEach(function(f){f(me.d)})})}
function fkSrc(kind,cb){if(kind==='dir')fkFolders(cb);else if(kind==='file')cb(recGet('file').map(function(p){return fkItem(p,'fk.g.recent')}));
 else if(kind==='modname'||kind==='mods')fkModNames(cb);else fkNames(function(d){cb(d[kind]||[])})}
function fkMake(inp,f,kind){if(typeof searchKit!=='function')return null;var kit=null,many=kind==='mods';
 function part(){var v=String(inp.value||'');return many?v.slice(v.lastIndexOf(',')+1).trim():v.trim()}
 function done2(){inp.dataset.manual='1';inp.classList.remove('bad');if(inp._after)inp._after()}
 var o={key:'form.'+f.name,
  index:function(q,done){q=String(many?part():q).toLowerCase();fkSrc(kind,function(a){var out=[],n=0;for(var i=0;i<a.length;i++)if(a[i].lo.indexOf(q)>=0){n++;if(out.length<40)out.push(a[i])}done(out,n-out.length)})},
  onPick:function(v,it,from){if(many&&from!=='history'){var cur=String(inp.value||''),c=cur.lastIndexOf(',');v=c<0?v:cur.slice(0,c+1)+v}inp.value=v;done2();if(kit&&v!==String(it&&it.value||''))kit.remember(v)}};
 // Browse (the picker) opens where the field's things live: a folder box where it points, a file box in the folder of its file (else the
 // mod), a map in the game data at map/ (the pick gives multi|single/<name>), a unit or donor in the game data at entity/ (.def .set .ext
 // files; the pick gives the file's base name), a mod name in the game's mods folder on disk (the pick gives the folder name)
 var GPATH=/^(map\/)?((multi|single)\/[^\/]+)/i;
 if(kind==='dir')o.browse={mode:'dir',start:function(){return inp.value.trim()},out:!!OUTNAMES[f.name]};
 else if(kind==='file')o.browse={mode:'file',exts:f.name==='pairs'?['json']:null,start:function(){var v=inp.value.trim(),own=inp._start&&inp.dataset.manual!=='1'?inp._start():'';return own||(/[\\\/]/.test(v)?parentOf(v):inp._start?inp._start():'')}};
 else if(kind==='map')o.browse={mode:'dir',view:'data',start:'map',toValue:function(p){var m=GPATH.exec(p);return m?m[2]:String(p).replace(/^map\//i,'')}};
 else if(kind==='unit')o.browse={mode:'file',view:'data',start:'entity',exts:['def','set','ext'],toValue:function(p){return fkBase(p)}};
 else o.browse={mode:'dir',start:function(){var g=curFolder();return g?join(g,'mods'):''},toValue:function(p){return fkBase(p,true)}};
 try{kit=searchKit(inp,o)}catch(e){return null}
 if(kit.el.classList)kit.el.classList.add('sk-wide');return kit}
// buildForm(cmd, presets, hide[, pfx]) -> {el, get(), setAuto(name,value), fields}. Blocks: el = container <pfx>.form, each field a leaf
// <pfx>.f.<name in lower case>, the fold of optional fields a container <pfx>.more (pfx defaults to the command id)
function buildForm(cmdId,presets,hide,pfx){pfx=pfx||cmdId;
 var c=S.cmds[cmdId],box=h('div',{blk:pfx+'.form',box:'col'}),more=h('details',{blk:pfx+'.more',box:'col'},[h('summary',{text:tx('form.more')})]),inputs={},fields={};
 (c.fields).forEach(function(f){
  if(hide&&hide.indexOf(f.name)>=0)return;
  var inp,row;
  if(f.type==='bool'){inp=h('input',{type:'checkbox','aria-label':flName(f)});if(presets&&presets[f.name]===true)inp.checked=true;row=h('label',{class:'f chk','data-f':f.name,title:flTip(f)},[h('span',{class:'n',text:flName(f),title:flTip(f)}),h('span',{},[inp,' ',h('span',{class:'hint',text:flHint(f)})])])}
  else{
   if(f.type==='enum'){inp=h('select',{onchange:function(){inp.dataset.manual='1'}},[h('option',{value:'',text:tx(f.required?'form.choose':'form.default')})].concat(f.values.map(function(v){return h('option',{value:v,text:gName(v)})})))}
   else if(f.type==='repeat'){inp=h('textarea',{rows:'2',placeholder:tx('form.oneper')})}
   else inp=h('input',{type:f.type==='int'?'number':'text',min:f.type==='int'?String(f.min==null?0:f.min):null,placeholder:f.type==='list'?'a,b,c':FL.hasOwnProperty(f.name)?flHint(f):f.desc,autocomplete:'off'});   // GT-26: plain words, the tool's own text stays in the tooltip
   if(presets&&presets[f.name]!=null)inp.value=presets[f.name];
   var btn=null,fk=fkKind(cmdId,f),kit=fk?fkMake(inp,f,fk):null;
   if(!kit&&f.type==='path'){var dir=!!DIRNAMES[f.name];recField(inp,dir?'dir':'file');btn=h('button',{type:'button',text:tx(dir?'btn.browse':'btn.pickfile'),title:f.desc,onclick:function(){pick(dir?'dir':'file',inp.value.trim()&&dir?inp.value.trim():'',function(p){inp.value=p;inp.dataset.manual='1';inp.classList.remove('bad');if(inp._after)inp._after()},{out:!!OUTNAMES[f.name]})}})}
   inp.setAttribute('title',flTip(f));
   row=h('label',{class:'f','data-f':f.name},[h('span',{class:'n'+(f.required||f.requiredUnless||f.requiredWhen?' req':''),text:flName(f),title:flTip(f)}),kit?kit.el:inp,btn||h('span')]);
   if(f.type==='path'||f.type==='str')inp.addEventListener('input',function(){inp.dataset.manual='1';inp.classList.remove('bad')});
  }
  inputs[f.name]=inp;fields[f.name]=f;(f.required||f.requiredUnless||f.requiredWhen||(presets&&presets[f.name]!=null)?box:more).appendChild(blk(pfx+'.f.'+f.name.toLowerCase(),[row],{'class':'fld'}))});
 if(more.children.length>1)box.appendChild(more);
 return {el:box,fields:fields,inputs:inputs,
  set:function(n,v,auto){var i=inputs[n];if(!i)return;if(auto&&i.dataset.manual==='1')return;if(i.type==='checkbox')i.checked=!!v;else i.value=v==null?'':v},
  get:function(){var o={};Object.keys(inputs).forEach(function(n){var f=fields[n],i=inputs[n],v;
   if(f.type==='bool'){if(i.checked)o[n]=true;return}v=i.value.trim();if(v==='')return;
   if(f.type==='int')o[n]=Number(v);else if(f.type==='list')o[n]=v.split(',').map(function(x){return x.trim()}).filter(Boolean);else if(f.type==='repeat')o[n]=v.split(/\r?\n/).map(function(x){return x.trim()}).filter(Boolean);else o[n]=v});return o},
  missing:function(extra){var o=Object.assign(this.get(),extra||{}),m=[];Object.keys(inputs).forEach(function(n){var f=fields[n];if(reqNow(f,o)&&(o[n]==null||o[n]===false)){m.push(n);if(inputs[n].classList)inputs[n].classList.add('bad')}});return m}}}

// ---------- run card: form + buttons + log + result ----------
// opt: {cmd, id, title, intro, presets, hide, buttons:[{label,extra,primary,danger,launch,confirm}], view(result,el,end), after(end), auto:{field:()=>value}}
// Blocks (automatic): the card is container <id> (id = opt.id or the command id) holding leaves <id>.title, .intro, .form (container),
// .btns, .stat, .cmdline, .res, .log. To add a part: blkPut(card.el, <a block>, card.btns) (never insertBefore: the profile may move btns)
function runCard(opt){var pf=opt.id||opt.cmd;
 var form=buildForm(opt.cmd,opt.presets,opt.hide,pf),log=mkLog(),res=h('div'),stat=h('span',{class:'hint'}),btns=h('div',{class:'row',blk:pf+'.btns'}),prg=progress();
 // E-30: the CLI line for these inputs comes from the server (pro ext POST /api/x/pro/cmdline, contract.buildArgv), so it can never drift from what Run does
 var ccOut=h('div',{class:'hint','data-cmdline':'1',hidden:true}),ccBtn=h('button',{type:'button','data-copycmd':'1',text:tx('run.copycmd'),title:tx('cc.copyT'),onclick:function(){
  var b=opt.buttons.filter(function(x){return x.primary})[0]||opt.buttons[0]||{},inp;ccOut.hidden=false;ccOut.textContent='';
  try{inp=Object.assign(form.get(),b.extra||{})}catch(e){ccOut.textContent=e.message;return}
  api('/api/x/pro/cmdline',{cmd:opt.cmd,input:inp}).then(function(j){var line=j&&j.node;if(!line){ccOut.textContent=tx('cc.none');return}
   var ta=h('input',{type:'text',readonly:true,value:line,style:'width:100%;font-family:monospace','aria-label':tx('run.copycmd')});
   function fb(){ccOut.insertBefore(document.createTextNode(tx('cc.nocopy')),ta);try{ta.focus();ta.select()}catch(e){}}
   ccOut.appendChild(ta);if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(line).then(function(){ccOut.insertBefore(document.createTextNode(tx('cc.copied')),ta)},fb);else fb()})
  .catch(function(e){ccOut.textContent=/404|not found/i.test(e.message)?tx('cc.none'):e.message})}});
 // GT-18/GT-28: opt.foldLog = the tool's raw lines sit behind a fold under the plain result
 var logBox=opt.foldLog?h('details',{'data-logfold':'1'},[h('summary',{text:tx('log.fold')}),log.el]):log.el;
 var resB=blk(pf+'.res',[res]),logB=blk(pf+'.log',[logBox]);
 var card=h('div',{class:'card',blk:pf,box:'col'},[blk(pf+'.title',[h('h3',{text:tx(opt.title)})]),opt.intro?h('div',{class:'hint',blk:pf+'.intro',text:tx(opt.intro)}):null,form.el,btns,h('div',{class:'row',blk:pf+'.stat'},[stat,prg.el,ccBtn]),blk(pf+'.cmdline',[ccOut]),resB,logB]);
 var api_={el:card,form:form,log:log,logBox:logBox,logB:logB,resB:resB,res:res,stat:stat,buttons:[],btns:btns,progress:prg};
 function go(b){
  var extra=Object.assign({},b.extra||{});
  // GT-26: the missing fields by their plain names, not the tool's argument names
  var miss=form.missing(extra);if(miss.length){stat.className='err';stat.textContent=tx('run.needed',{list:miss.map(function(n){return form.fields[n]?flName(form.fields[n]):n}).join(', ')});return}
  var input=Object.assign(form.get(),extra);
  // GT-11: a page may look the input over first (precheck -> Promise of '' or a message); a message stops the run
  if(opt.precheck&&!b.skipPre){stat.className='hint';stat.textContent=tx('run.prechecking');Promise.resolve(opt.precheck(input,b)).then(function(m){if(m){stat.className='err';stat.textContent=m;return}stat.textContent='';go(Object.assign({},b,{skipPre:true}))},function(){stat.textContent='';go(Object.assign({},b,{skipPre:true}))});return}
  if(!b.asked&&(input.force===true||b.confirm)){askDo({title:tx(b.label),lines:[b.confirm?tx(b.confirm):'',input.force===true?tx('force.confirm',{what:tx(b.label)}):''],danger:input.force===true}).then(function(yes){if(yes)go(Object.assign({},b,{skipPre:true,asked:true}))});return}   // overwrite: always ask (GX-next idiot pass)
  // this card's buttons stay disabled until its run ends (double click, I-30)
  function busy(on){api_.buttons.forEach(function(x){if(on)x.dataset.cardBusy='1';else delete x.dataset.cardBusy});setRunUi()}
  busy(true);log.clear();res.textContent='';stat.className='hint';stat.textContent=tx('run.running0');prg.start(tx(opt.title));
  if(opt.beforeRun)opt.beforeRun(api_,input);
  streamRun(opt.cmd,input,{line:function(k,t){if(opt.onLine&&opt.onLine(api_,k,t))return;log.add(k,t);if(t&&k!=='e'&&RUN)stat.textContent=tx('run.last',{l:String(t).replace(/^PROGRESS /,'').slice(0,140)})},start:function(e){if(opt.onStart)opt.onStart(api_,e)},end:function(e){}},b.timeoutSec).then(function(end){busy(false);prg.stop();
   var hb=humanBox(log.text()+' '+((end&&end.resultError)||''),parentOf(input.mod||input.dir||''));
   if(!end){stat.className='err';stat.textContent=tx('run.notrun');if(hb)res.appendChild(hb);return}
   var good=end.code===0&&!end.cancelled&&!end.timedOut;stat.className=good?'ok':'err';if(!good&&hb)res.appendChild(hb);
   stat.textContent=end.cancelled?tx('run.cancelled',{s:Math.round(end.ms/1000)}):end.timedOut?tx('run.timedout',{s:Math.round(end.ms/1000)}):tx('run.exit',{code:end.code,s:(end.ms/1000).toFixed(1)});
   if(end.resultError)res.appendChild(h('div',{class:'err',text:tx('run.noresult',{m:end.resultError})}));
   var sb=saidBox(log.lines());if(sb)res.appendChild(sb);
   if(opt.view&&end.result!=null)opt.view(end.result,res,end,api_);
   if(opt.after)opt.after(end,api_,input)},function(e){busy(false);prg.stop();stat.className='err';stat.textContent=String(e&&e.message||e)})}
 opt.buttons.forEach(function(b){var el=h('button',{type:'button',text:tx(b.label),'data-run':'1',class:b.primary?'primary':b.danger?'danger':'',title:b.title?tx(b.title):'',onclick:function(){if(RUN){busyMsg();return}go(b)}});
  if(b.launch){el.dataset.launch='1';el.dataset.tip=el.title;if(!S.health.allowLaunch){el.dataset.blocked='1';el.title=tx('run.blocked')}}
  if(b.primary)el.dataset.primary='1';btns.appendChild(el);api_.buttons.push(el)});
 api_.refresh=function(){if(opt.auto)Object.keys(opt.auto).forEach(function(n){form.set(n,opt.auto[n](),true)})};
 api_.refresh();setRunUi();return api_}

// ---------- result views ----------
var SEV=['crash','silent','review','cosmetic'];
function viewCheck(r,el){
 el.textContent='';var total=0,by={};(r.findings||[]).forEach(function(f){by[f.sev]=(by[f.sev]||0)+f.n;total+=f.n});
 headline(r,el,r.mod||S.mod,'');   // GT-18: the plain result first
 var sum=h('div',{class:'row'},[h('b',{text:tx('check.findings',{n:total})})].concat(SEV.map(function(s){return h('span',{class:'badge '+s,text:tx('sev.'+s)+' '+(by[s]||0)})})));el.appendChild(sum);
 (r.errors||[]).forEach(function(e){el.appendChild(h('div',{class:'err',text:tx('check.error',{m:e})}))});
 (r.notes||[]).forEach(function(n){el.appendChild(h('div',{class:'hint',text:n}))});
 (r.toolIssues||[]).forEach(function(x){el.appendChild(h('div',{class:x.kind==='reran'?'hint':'err',text:tx(x.kind==='reran'?'wz.toolReran':x.kind==='oom'?'wz.toolOom':'wz.toolErr',{tool:x.tool,m:x.text})}))});
 if(r.gated)el.appendChild(h('div',{class:'hint','data-gated-n':String(r.gated),text:tx('check.gatedN',{n:r.gated})}));
 if(r.merged)el.appendChild(h('div',{class:'hint','data-merged-n':String(r.merged),text:tx('check.mergedN',{m:r.merged})}));
 var rd=Object.keys(r.read||{});if(rd.length)el.appendChild(h('div',{class:'hint',text:tx('check.read')+rd.map(function(k){var x=r.read[k];return gName(k)+' '+tx('check.readN',{files:x.files,paks:x.paks})+(x.mounted?'':' '+tx('check.notmounted'))}).join(' | ')}));
 var filt=h('input',{type:'text',placeholder:tx('check.filter'),autocomplete:'off','aria-label':tx('check.filterAria')}),body=h('div');
 // GUI-LIM: limits row behind each finding (GET /api/limit): LM = {code: {lim:[ids],kind,class}|null}, null until the one fetch answers
 var LM=null,limSel=h('select',{'aria-label':tx('check.limFilterAria'),'data-lim-filter':'1'},[h('option',{value:'all',text:tx('check.limFAll')}),h('option',{value:'row',text:tx('check.limFRow')}),h('option',{value:'tool',text:tx('check.limFTool')}),h('option',{value:'none',text:tx('check.limFNone')})]),cnt=h('div',{class:'hint','data-lim-count':'1'});
 function limCat(f){var e=LM&&LM[f.code];return e&&e.lim&&e.lim.length?'row':e&&e.kind==='tool'?'tool':'none'}
 function limCell(f){var e=LM&&LM[f.code],td=h('td',{'data-lim':'1'});if(!LM)return td;
  if(limCat(f)==='row'){var det=h('div',{class:'hint','data-lim-detail':'1'});e.lim.forEach(function(id){td.appendChild(h('button',{type:'button','data-lim-id':id,text:id,onclick:function(ev){ev.stopPropagation();limOpen(id,det)}}));td.appendChild(document.createTextNode(' '))});td.appendChild(det)}
  else td.appendChild(h('span',{class:'hint','data-lim-label':limCat(f),text:tx(limCat(f)==='tool'?'check.limToolLbl':'check.limNone')}));
  return td}
 function limOpen(id,box){if(box.textContent){box.textContent='';return}box.textContent='...';
  api('/api/limit?id='+encodeURIComponent(id)).then(function(j){box.textContent='';var rw=j.row;
   if(!rw){box.appendChild(h('div',{text:id+' '+tx('check.limNoText')}))}
   else{box.appendChild(h('div',{},[h('b',{text:id+' '+rw.subject})]));box.appendChild(h('div',{text:tx('check.limLimit')+rw.limit}));box.appendChild(h('div',{text:tx('check.limEffect')+rw.effect}))}
   box.appendChild(h('div',{text:tx('check.limClass')+(j.class||'-')}))},function(e){box.textContent=tx('check.limErr',{m:String(e&&e.message||e)})})}
 function draw(){body.textContent='';var q=filt.value.trim().toLowerCase(),lf=limSel.value||'all',c={row:0,tool:0,none:0},nrows=0;
  (r.findings||[]).forEach(function(f){c[limCat(f)]++});
  SEV.forEach(function(s){var rows=(r.findings||[]).filter(function(f){return f.sev===s&&(!q||(f.code+' '+f.tool+' '+ckFiles(f)).toLowerCase().indexOf(q)>=0)&&(lf==='all'||limCat(f)===lf)});if(!rows.length)return;nrows+=rows.length;
   var t=h('table',{},[h('thead',{},[h('tr',{},[h('th',{text:tx('sev.'+s).toUpperCase()}),h('th',{text:tx('check.count')}),h('th',{text:tx('check.tool')}),h('th',{text:tx('check.limCol')}),h('th',{text:tx('check.examples')})])])]),tb=h('tbody');
   rows.sort(function(a,b){return b.n-a.n}).forEach(function(f){var c1=[h('div',{text:f.code})];if(f.gated&&f.note)c1.push(h('div',{class:'hint','data-gated':'1',text:tx('check.lowered',{m:noteTx(f.note)})}));
    tb.appendChild(h('tr',{class:'sev-'+s},[h('td',{},c1),h('td',{text:String(f.n)}),h('td',{text:f.tool}),limCell(f),h('td',{},(f.samples||[]).slice(0,3).map(function(x){return sampleBox(x,r.mod,f)}))]))});
   t.appendChild(tb);body.appendChild(t)});
  cnt.textContent=LM?tx('check.limCount',{shown:nrows,all:(r.findings||[]).length,row:c.row,tool:c.tool,none:c.none}):'';
  if(!body.children.length)body.appendChild(h('div',{class:'hint',text:tx(total?'check.nomatch':'check.nothing')}))}
 // searchKit: history, index = the finding codes and tools of this result (built once); Browse = a file of the checked mod (the picker):
 // the filter then keeps the findings with a sample in that file (the filter text also matches the sample files)
 function ckFiles(f){if(f._fl==null)f._fl=(f.samples||[]).map(function(x){var q=hitOf(x);return q.file+' '+(q.path||'')}).join(' ');return f._fl}
 var CKI=null;function ckItems(){if(CKI)return CKI;var seen={},a=[];(r.findings||[]).forEach(function(f){
   if(f.code&&!seen['c'+f.code]){seen['c'+f.code]=1;a.push({label:f.code,value:f.code,hint:f.tool+'  '+tx('sev.'+f.sev),group:tx('sev.'+f.sev)})}
   if(f.tool&&!seen['t'+f.tool]){seen['t'+f.tool]=1;a.push({label:f.tool,value:f.tool,hint:tx('check.tool'),group:tx('check.tool')})}});
  a.forEach(function(x){x.lo=String(x.label).toLowerCase()});return CKI=a}
 var ckit=searchKit(filt,{key:'check.filter',index:function(q,done){q=q.toLowerCase();done(ckItems().filter(function(x){return x.lo.indexOf(q)>=0}))},
  browse:{mode:'file',start:function(){return r.mod||S.mod||''},toValue:function(p){return fkBase(p,true)}}});
 filt.oninput=draw;filt.onkeydown=function(e){if(e._sk)return;if(e.key==='Escape'&&filt.value){filt.value='';draw();e.preventDefault();if(e.stopPropagation)e.stopPropagation()}};limSel.onchange=draw;el.appendChild(h('div',{class:'row'},[ckit.el,limSel]));el.appendChild(cnt);el.appendChild(body);draw();
 var lcodes=[];(r.findings||[]).forEach(function(f){if(lcodes.indexOf(f.code)<0)lcodes.push(f.code)});
 if(lcodes.length)api('/api/limit?codes='+encodeURIComponent(lcodes.join(','))).then(function(j){LM=j.codes||{};draw()},function(){})
 el.appendChild(h('div',{class:'hint',text:tx('check.lookup')}))}
// GX-next check-false: check --json sample extras in plain words. also = other linters on the same line, repeat = same code+line count, note = why a crash code was lowered or what folded in
function noteTx(n){return String(n||'').split('; ').map(function(p){var m;
  if(/^nothing in the mod uses this unit \(every def/.test(p))return tx('check.nUnusedDir');
  if(/^nothing in the mod uses this unit/.test(p))return tx('check.nUnused');
  if(/^another def with this name wins \(every def in this folder/.test(p))return tx('check.nRedefDir');   // tools/check/gate.js REDEF_NOTE
  if(/^another def with this name wins/.test(p))return tx('check.nRedef');
  if(/^not an entity def/.test(p))return tx('check.nNotEntity');
  if(/^nothing in the mod names this file/.test(p))return tx('check.nUnnamed');
  if((m=/^\+(\d+) macros? from the missing include/.exec(p)))return tx('check.nMacros',{n:m[1]});
  return p}).join('; ')}
function sampleBox(x,mod,row){var q=hitOf(x),kids=[hitLink(q,mod)];if(!x||typeof x!=='object')return kids[0];
 var top=h('div',{class:'row'},kids);if(x.repeat>1)top.appendChild(h('span',{class:'badge','data-repeat':String(x.repeat),title:tx('check.repeatT',{n:x.repeat}),text:tx('check.repeat',{n:x.repeat})}));
 var out=[top];if(x.also&&x.also.length)out.push(h('div',{class:'hint','data-also':'1',text:tx('check.alsoBy',{t:x.also.join(', ')})}));
 if(x.note&&!(row&&row.gated&&row.note===x.note))out.push(h('div',{class:'hint','data-note':'1',text:noteTx(x.note)}));
 return out.length===1?top:h('div',{},out)}
// GX B7/G8/S10: one plain verdict for the build the mod is made for (as64 first, else the first one the check gives [I]), the other builds folded, safe to share or not, a tag legend
function vcls(t){return /^LOADS/.test(t)?'good':/CRASH|FAIL|NOT|BROKEN|REFUSED/.test(t)?'badx':'mid'}
function noteHealth(mod,cls){if(!mod)return;var m=LS.get('health',{})||{};m[mod]=cls;LS.set('health',m)}
// GT-18: the check's own overall result (r.overall {target, verdict ok|crash|refused|unfinished, crash, silent, text}) comes first, in the page
// language; r.plain = the tool's plain lines (line 1 is overall.text, the rest one per finding). Older results without overall: the build verdict.
var OVCLS={ok:'good',crash:'badx',refused:'badx',unfinished:'mid'};
function gName(t){var g=gOf(t);return g?g.name:t}
function headline(r,el,mod,title){var ov=r.overall&&OVCLS[r.overall.verdict]?r.overall:null,ks=Object.keys(r.verdicts||{}),t=ov&&ov.target?ov.target:ks.indexOf('as64')>=0?'as64':(ks[0]||''),v=(r.verdicts||{})[t]||{},vt=String(v.verdict||'');
 var crash=(r.findings||[]).filter(function(f){return f.sev==='crash'}).reduce(function(a,f){return a+(f.n||0)},0),cls=ov?OVCLS[ov.verdict]:t?vcls(vt):'mid';
 var plain=ov?tx('hd.v.'+ov.verdict,{b:gName(t),n:ov.crash||crash}):!t?tx('hd.none'):cls==='good'?tx('hd.good',{b:gName(t)}):cls==='badx'?tx('hd.bad',{b:gName(t)}):tx('hd.mid',{b:gName(t)});
 var pl=(r.plain||[]).slice(ov?1:0).filter(Boolean);
 el.appendChild(h('div',{class:'head '+cls,'data-head':cls,'data-overall':ov?ov.verdict:null,title:title||null},[h('b',{text:plain}),
  ov&&LANG==='en'&&ov.text?h('div',{class:'hint',text:ov.text}):null,
  pl.length?h('ul',{'data-plain':'1',style:'margin:4px 0 0 18px;padding:0'},pl.slice(0,40).map(function(l){return h('li',{text:l})})):null,
  pl.length>40?h('div',{class:'hint',text:tx('tree.more',{n:pl.length-40})}):null,
  h('div',{class:'hint',text:t?gName(t)+': '+vt+'  '+(v.text||''):''})]));
 if(ov&&(ov.crash||0)>crash)crash=ov.crash;
 var safe=cls==='good'&&!crash;
 el.appendChild(h('div',{class:safe?'ok':'err','data-safe':safe?'1':'0'},[h('b',{text:tx(safe?'hd.safe':'hd.notyet')}),h('span',{text:'  '+(safe?tx('hd.safeT'):crash?tx('hd.crashN',{n:crash}):tx('hd.notyetT'))})]));
 if(!t||/UNKNOWN/.test(vt))el.appendChild(h('div',{class:'hint',text:tx(gameDir()?'hd.noexe':'hd.nogame')}));
 var rest=ks.filter(function(k){return k!==t});
 if(rest.length)el.appendChild(h('details',{},[h('summary',{text:tx('hd.others',{n:rest.length})})].concat(rest.map(function(k){var x=r.verdicts[k],s2=String(x.verdict||'');return h('div',{class:'verdict '+vcls(s2)},[h('b',{text:gName(k)+': '+s2}),h('span',{text:'  '+(x.text||'')})])}))));
 el.appendChild(h('details',{},[h('summary',{text:tx('hd.legend')}),h('div',{class:'hint',text:tx('hd.legendT')})]));
 noteHealth(mod,safe?'good':cls==='good'?'mid':cls)}
// GX C9: tool errors in plain words, with "Make a mod here" when the folder is missing or is no mod
function human(m){m=String(m||'');
 if(/has no mod\.info|no mod\.info|mod\.info (is )?missing/i.test(m))return {text:tx('err.nomodinfo'),make:true};
 if(/ENOENT|no such file or directory|does not exist|is not a folder/i.test(m))return {text:tx('err.nofolder'),make:true};
 if(/absolute path/i.test(m))return {text:tx('err.abs'),make:false};
 return null}
function humanBox(m,parent){var x=human(m);if(!x)return null;
 return h('div',{class:'hbox','data-human':'1'},[h('div',{text:x.text}),x.make?h('button',{type:'button',text:tx('err.make'),title:tx('err.makeT'),onclick:function(){newModAt(parent||'')}}):null])}
// GX: the tools' own plain lines (VERDICT, why:, To undo, note:, already in mods, played in place) pulled out of the log so they are not lost in it
var SAID=/^(VERDICT\b|why:|note:|To undo\b)|already in the game's mods folder|played in place/i;
function saidBox(text){var ls=String(text||'').split(/\r?\n/).map(function(l){return l.trim()}).filter(function(l){return l&&SAID.test(l)});if(!ls.length)return null;
 return h('div',{class:'said','data-said':'1'},[h('b',{text:tx('said.h')})].concat(ls.slice(0,30).map(function(l){return h('div',{class:/^VERDICT/i.test(l)?'ok':/^(why:|To undo)/i.test(l)?'hint':'',text:l})})))}
function reloadMods(){if(S.screens.mods&&S.screens.mods.reload)S.screens.mods.reload()}
function refreshBlocked(){var bs=document.querySelectorAll('button[data-launch]');for(var i=0;i<bs.length;i++){var b=bs[i];if(S.health.allowLaunch){b.dataset.blocked='0';b.title=b.dataset.tip||''}else{b.dataset.blocked='1';b.title=tx('run.blocked')}}setRunUi()}
// GUI-2: tables above the tree. Short top-level scalars as badges; each top-level array of plain objects as a table (key union of the first 50 rows, 8 columns, 100 rows); string arrays as a one-column table. Headers are the result's own keys.
function cellText(v){if(v===null||v===undefined)return '';var s=typeof v==='object'?JSON.stringify(v):String(v);return s.length>160?s.slice(0,160)+' ...':s}
function resultTables(r){var out=[];if(!r||typeof r!=='object'||Array.isArray(r))return out;
 var sc=Object.keys(r).filter(function(k){var v=r[k];return (typeof v==='string'&&v.length<=80)||typeof v==='number'||typeof v==='boolean'});
 if(sc.length)out.push(h('div',{class:'row'},sc.slice(0,12).map(function(k){return h('span',{class:'badge',text:k+': '+String(r[k])})})));
 Object.keys(r).forEach(function(k){var a=r[k];if(!Array.isArray(a)||!a.length)return;
  var objs=a.every(function(x){return x&&typeof x==='object'&&!Array.isArray(x)}),strs=a.every(function(x){return typeof x==='string'||typeof x==='number'});if(!objs&&!strs)return;
  var cols=[];if(objs)a.slice(0,50).forEach(function(x){Object.keys(x).forEach(function(c){if(cols.indexOf(c)<0&&cols.length<8)cols.push(c)})});else cols=[k];
  var t=h('table',{class:'rtab','data-key':k},[h('thead',{},[h('tr',{},cols.map(function(c){return h('th',{text:c})}))])]),tb=h('tbody');
  a.slice(0,100).forEach(function(x){tb.appendChild(h('tr',{},cols.map(function(c){return h('td',{text:cellText(objs?x[c]:x)})})))});t.appendChild(tb);
  out.push(h('div',{},[h('b',{text:k+' ('+a.length+(a.length>100?', 100 shown':'')+')'}),h('div',{class:'scroll'},[t])]))});
 return out}
function viewTree(title){return function(r,el){el.textContent='';el.appendChild(h('b',{text:tx(title)}));resultTables(r).forEach(function(x){el.appendChild(x)});el.appendChild(treeBox(r))}}
function viewEdrun(r,el){el.textContent='';el.appendChild(h('div',{},[h('b',{text:tx('edrun.out')}),h('span',{text:r.dir||''})]));
 el.appendChild(h('div',{class:'row'},(r.files||[]).slice(0,60).map(function(f){return h('span',{class:'badge',text:f})})));
 if(r.report!=null){el.appendChild(h('b',{text:'report.json'}));resultTables(Array.isArray(r.report)?{rows:r.report}:r.report).forEach(function(x){el.appendChild(x)});el.appendChild(treeBox(r.report))}else el.appendChild(h('div',{class:'hint',text:tx('edrun.noreport')}))}

// ---------- current mod + game ----------
function mpKey(){return GID===GDEF?'modByPage':'modByPage.'+GID}
function modKeep(){if(S.cur&&S.mod){var mp=LS.get(mpKey(),{})||{};mp[S.cur]=S.mod;LS.set(mpKey(),mp)}}
function setMod(p){S.mod=p||'';if(p)recAdd('dir',p);modKeep();drawChip();refreshAll()}
// the mod pill (the owner, 2026-11-19): the mod folder's last name only; the whole path in its title and aria-label, and in the pill while
// the Change picker is open (MODPK, cleared when the picker closes). No mod: "no mod chosen" as before
var MODPK=false;
function modBase(p){var a=String(p||'').replace(/[\\\/]+$/,'').split(/[\\\/]/);return a.pop()||String(p||'')}
function drawChip(){var c=$('modchip');if(!c)return;var full=S.mod||'',open=!!(full&&MODPK);
 c.textContent=full?tx('mod.chip',{p:open?full:modBase(full)}):tx('mod.none');c.title=full||tx('mod.chipTitle');
 c.setAttribute('aria-label',full?tx('mod.chipAria',{p:full}):tx('mod.none'));c.setAttribute('data-full',open?'1':'0')}
if($('pk')&&$('pk').addEventListener)$('pk').addEventListener('close',function(){if(MODPK){MODPK=false;drawChip()}});
// gameDir() = the AS2 install (as64 and MoW:AS2 share it; under GoH it is where results go). gohDir() = the GoH install. curFolder() = the current game's own folder.
function gameDir(){return S.gameOv||S.game.dir||''}
function gohDir(){return GS.goh.dir||(S.goh&&S.goh.dir)||''}
function curGame(){return gOf(GID)}
function curFolder(){return curGame().kind==='goh'?gohDir():gameDir()}
function codesTx(o){return o&&o.codes&&o.codes.length?o.codes.map(function(k){return tx('game.c.'+k)}).join('; '):((o&&o.problems)||[]).join('; ')}
function chkIn(o){if(GID!==GDEF)o.exe=curGame().target;if(curGame().kind==='goh'&&gohDir())o.goh=gohDir();return o}
// FIXGOH: the guided fix and the expert fix card under GoH. On: tools/fix/fix.js takes --target goh (--game = the GoH install, the GoH mod.info
// range, GHVFS-02 / PORT-46), so the one place to close it again is here. fixOn() = this game shows the fix steps; fixTarget() = the target the
// fix gets ('' = the tool's default as64); fixIn(o) = the target, and under GoH the GoH folder as --game (fix refuses an AS2 --game for goh)
var FIXGOH=true;
function fixOn(){return curGame().kind!=='goh'||FIXGOH}
function fixTarget(){return GID==='mowas2'?'mowas2':curGame().kind==='goh'&&FIXGOH?'goh':''}
function fixIn(o){var t=fixTarget();if(t)o.target=t;if(t==='goh'){if(gohDir())o.game=gohDir();else delete o.game}return o}
function changeMod(){if(RUN){busyMsg();return}var cf=curFolder(),st=S.mod?parentOf(S.mod):(cf?join(cf,'mods'):'');
 if(!RMT){MODPK=true;drawChip()}
 pick('dir',st,function(p){api('/api/mod?dir='+encodeURIComponent(p)).then(function(m){if(!m.hasInfo){toast(tx('mod.noInfo',{p:p}));return}setMod(p);reloadMods()}).catch(function(e){toast(e.message)})})}
// The game folder (the owner, 2026-11-19: "the game directory does not need to be in the header"): the whole line (the folder, where it
// was found, its problems, the places tried, Game folder... and Reset) is the Game folder card on Settings (GINFO, drawGameInfo); the header
// (#gamebar) shows only what is wrong (gameWarn: a short warning, the long words in its title) with a Game folder... button that opens that
// card (gameOpen); the game runs on/off note is a short chip by the game buttons (#runoff). A LAN Remote page sees the card, its change
// buttons are hidden (body.remote [data-gamechg]) and pick() refuses there anyway.
var GINFO=null;
function gameWarn(){var G=curGame(),g=S.game||{};
 if(G.kind==='goh'){var o=S.goh||{};if(!o.dir)return {c:'gohnone',t:tx('game.gohNone'),T:tx('game.gohNone')};if(o.ok===false)return {c:'gohbad',t:tx('game.hdBadGoh'),T:codesTx(o)};return null}
 if(!g.dir)return {c:'none',t:tx('game.none'),T:tx('game.notSet')};
 if(g.goh)return {c:'goh',t:tx('game.hdGoh'),T:tx('game.goh')};
 if(g.ok===false)return {c:'bad',t:tx('game.hdBad'),T:tx('game.notok',{m:codesTx(g)})};
 if(g.exes&&g.exes.length&&g.exes.indexOf(G.exe)<0)return {c:'noexe',t:tx('game.hdNoExe',{name:G.name}),T:tx('game.noExe',{exe:G.exe,name:G.name})};
 return null}
function gameOpen(){show('settings');var b=GINFO&&GINFO.el.querySelector('button');if(GINFO&&GINFO.el.scrollIntoView){try{GINFO.el.scrollIntoView({block:'center'})}catch(e){}}if(b&&b.focus)b.focus()}
function drawGame(){var g=$('gamebar'),w=gameWarn(),on=!!(S.health&&S.health.allowLaunch);
 if(g){g.textContent='';if(w){g.appendChild(h('span',{class:'bad','data-gamewarn':w.c,title:w.T,text:w.t}));g.appendChild(h('button',{type:'button','data-gameopen':'1',text:tx('game.folder'),title:tx('game.hdT'),onclick:gameOpen}))}}
 var ro=$('runoff');if(ro){ro.textContent='';ro.appendChild(h('span',{'data-runoff':on?'on':'off',title:tx(on?'game.on':'game.off'),text:tx(on?'game.onS':'game.offS')}));
  if(S.health&&S.health.demo)ro.appendChild(h('span',{class:'badge',text:tx('game.demo')}))}
 if(GINFO)GINFO.wait=false;drawGameInfo()}
// the Game folder card on Settings: the current game's folder (each game keeps its own; the AS2 install is shared by AS64 and MoW:AS2)
function drawGameInfo(){if(!GINFO||GINFO.wait)return;var g=GINFO.el,G=curGame(),line=h('div',{'class':'row'}),btns=h('div',{'class':'row'});g.textContent='';
 GINFO.h.textContent=tx('stg.game.h',{g:G.name});
 if(G.kind==='goh'){var o=S.goh||{};
  if(o.dir){line.appendChild(h('span',{'data-gohdir':'1',text:tx('game.gohIs',{dir:o.dir})}));if(o.ok===false)line.appendChild(h('span',{class:'err',text:'  '+codesTx(o)}))}
  else line.appendChild(h('span',{class:'err',text:tx('game.gohNone')}));
  btns.appendChild(h('button',{type:'button','data-gamechg':'1',text:tx('game.folder'),onclick:function(){pick('dir',gohDir(),function(p){GS.goh.dir=p;gsSave();loadGame()})}}));
  if(GS.goh.dir)btns.appendChild(h('button',{type:'button','data-gamechg':'1',text:tx('game.reset'),onclick:function(){GS.goh.dir='';gsSave();loadGame()}}));
  g.appendChild(line);g.appendChild(btns);g.appendChild(h('div',{'class':'hint'},[h('span',{'data-gohas2':'1',text:tx('game.gohAs2',{dir:gameDir()||tx('mods.gameUnknown')})})]));return}
 if(S.game.dir){line.appendChild(h('span',{text:tx('game.is',{dir:S.game.dir,src:S.game.source})}));if(S.game.goh)line.appendChild(h('span',{class:'err','data-goh':'1',text:'  '+tx('game.goh')}));else if(S.game.ok===false)line.appendChild(h('span',{class:'err',text:'  '+tx('game.notok',{m:codesTx(S.game)})}));
  if(!S.game.goh&&S.game.exes&&S.game.exes.length&&S.game.exes.indexOf(G.exe)<0)line.appendChild(h('span',{class:'err','data-noexe':'1',text:'  '+tx('game.noExe',{exe:G.exe,name:G.name})}))}
 else{line.appendChild(h('span',{class:'err',text:tx('game.none'),title:tx('game.notSet')}));if(S.game.tried&&S.game.tried.length)line.appendChild(h('details',{},[h('summary',{text:tx('game.tried',{n:S.game.tried.length})})].concat(S.game.tried.map(function(p){return h('div',{class:'hint',text:p})}))))}
 btns.appendChild(h('button',{type:'button','data-gamechg':'1',text:tx('game.folder'),onclick:function(){pick('dir',gameDir(),function(p){S.gameOv=p;loadGame()})}}));
 if(S.gameOv)btns.appendChild(h('button',{type:'button','data-gamechg':'1',text:tx('game.reset'),onclick:function(){S.gameOv='';loadGame()}}));
 g.appendChild(line);g.appendChild(btns)}
// lazy pages: "refresh every page" (a new mod, a new game folder) refreshes the page on screen now; every other page is only marked out of
// date (S.stale) and show0 refreshes it when it is next shown, so a page nobody opened asks the server nothing. A screen object with
// eager:true is refreshed while hidden (none needs it today). A page's init() runs at its first show (S.inited); Mods' runs at start
function refreshAll(){Object.keys(S.screens).forEach(function(k){var s=S.screens[k];if(!s||!s.refresh)return;if(k!==S.cur&&!s.eager){S.stale[k]=true;return}S.stale[k]=false;s.refresh()})}
function scrInit(k){var s=S.screens[k];if(!s||S.inited[k])return;S.inited[k]=true;if(s.init)s.init()}
// a game switch blanks the line at once (greyed "looking for the game folder"); only the reply to the newest call for the CURRENT game fills it
var GSEQ=0;
function gameWait(){var g=$('gamebar');if(g)g.textContent='';if(!GINFO)return;GINFO.wait=true;GINFO.h.textContent=tx('stg.game.h',{g:curGame().name});GINFO.el.textContent='';GINFO.el.appendChild(h('span',{class:'hint','data-gamewait':'1',text:tx('game.wait')}))}
function loadGame(){var seq=++GSEQ,gid=GID,q=[api('/api/game'+(S.gameOv?'?game='+encodeURIComponent(S.gameOv):''))];
 if(curGame().kind==='goh')q.push(api('/api/game?kind=goh'+(GS.goh.dir?'&game='+encodeURIComponent(GS.goh.dir):'')).catch(function(){return {codes:['none']}}));
 return Promise.all(q).then(function(a){if(seq!==GSEQ||gid!==GID)return;S.game=a[0];if(a[1])S.goh=a[1];drawGame();refreshAll()})}

// ---------- screens ----------
// T-GUI: core pages Mods (with the New Mod card on AS64), Generator (page id make), Upgrade or Port, Check, Play, Settings; Test run sits behind the
// Advanced switch (ADV; the switch is on the Settings page, kept in the window settings). Translate is a fold of the GoH unit page (xlateCard). Tabs: GUI-TABS below
var NAMES=[['mods','nav.mods'],['make','nav.make'],['upgrade','nav.upgrade'],['check','nav.check'],['play','nav.play'],['test','nav.test'],['settings','nav.settings']];
var ADV={};   // Test Run is a sub-tab of its own now (Test, Share & Play > Test Run), shown without Advanced
// a page that moved: the old Translate page (xlate) is the GoH unit page now, for saved screens, links and follow messages
function movedId(id){return refPg(id)==='xlate'?'goh':id}
var EXT_SCREENS={};
__EXTJS__
(__EXTNAV__).forEach(function(x){var i=-1;if(x.after)NAMES.forEach(function(n,j){if(n[0]===x.after)i=j});var e=[x.id,x.nav];if(x.first)NAMES.unshift(e);else if(i>=0)NAMES.splice(i+1,0,e);else NAMES.push(e);if(x.adv)ADV[x.id]=1});
function needMod(){return S.mod||''}

// 1 Mods
function screenMods(root){
 var mods=[],sel=-1,rootsBox=h('div',{class:'row'}),filt=h('input',{type:'text',placeholder:tx('mods.filter'),autocomplete:'off','aria-label':tx('mods.filterAria')}),tb=h('tbody'),info=h('div',{class:'card'},[h('div',{class:'hint',text:tx('mods.choose')})]),msg=h('div',{class:'hint'}),empty=h('div',{class:'card',hidden:true});
 var tbl=h('div',{class:'scroll',tabindex:'0',role:'listbox','aria-label':tx('mods.aria')},[h('table',{},[h('thead',{},[h('tr',{},[h('th',{text:tx('mods.mod')}),h('th',{text:tx('mods.folder')}),h('th',{class:'nw',title:tx('mods.worksT'),text:tx('mods.works')}),h('th',{class:'nw',title:tx('mods.inGameT'),text:tx('mods.inGame')}),h('th',{class:'nw',title:tx('mods.healthT'),text:tx('mods.health')}),h('th',{class:'nw',text:tx('mods.changed')})])]),tb])]);
 function worksTx(w){return tx(w==='as64'?'mods.wAs64':w==='classic'?'mods.wClassic':w==='goh'?'mods.wGoh':'mods.wNone')}
 function healthTx(c){return c==='good'?tx('mods.hGood'):c==='badx'?tx('mods.hBad'):c==='mid'?tx('mods.hMid'):tx('mods.hNone')}
 function vis(){var q=filt.value.trim().toLowerCase();return mods.filter(function(m){return !q||(m.name+' '+m.folder).toLowerCase().indexOf(q)>=0})}
 function draw(){tb.textContent='';var v=vis(),hl=LS.get('health',{})||{};v.forEach(function(m,i){var tr=h('tr',{'aria-selected':m.path===S.mod?'true':'false',role:'option',onclick:function(){choose(m)},ondblclick:function(){choose(m);show('check')}},[h('td',{text:m.name}),h('td',{text:m.folder}),h('td',{class:'nw',text:worksTx(m.worksOn)}),h('td',{class:'nw',text:tx(m.installed?'mods.yes':'mods.no')}),h('td',{class:'nw'},[h('span',{class:'badge '+(hl[m.path]||''),text:healthTx(hl[m.path])})]),h('td',{class:'nw',text:new Date(m.mtimeMs).toISOString().slice(0,10)})]);tb.appendChild(tr)});
  msg.textContent=tx('mods.count',{v:v.length,n:mods.length})}
 function choose(m){setMod(m.path);draw();showInfo(m.path)}
 function showInfo(p){modInfo(p).then(function(m){info.textContent='';
  info.appendChild(h('h3',{text:m.name||tx('mods.noname')}));info.appendChild(h('div',{class:'hint',text:m.path}));if(m.desc)info.appendChild(h('div',{text:m.desc}));
  info.appendChild(h('div',{text:tx('mods.files',{n:m.files+(m.truncated?'+':''),size:fmtBytes(m.bytes)})+(m.hasInfo?'':'  - '+tx('mods.noinfo'))}));
  if(m.note)info.appendChild(h('div',{class:'err','data-note':'1',text:tx('mods.tooMany',{n:m.files}),title:m.note}));
  var lm=mods.filter(function(x){return x.path===p})[0],hc=(LS.get('health',{})||{})[p];
  info.appendChild(h('div',{text:tx('mods.worksLine',{v:worksTx((m.works||{}).worksOn)})}));
  // GoH (gui.js worksOn, GHVFS-02 / GHNET-22): the mod.info range against the GoH version; Tags "develop" loads on any version
  var wk=m.works||{};if(curGame().kind==='goh'&&(wk.game||wk.min||wk.max||wk.develop))info.appendChild(h('div',{class:'hint','data-gohver':'1',text:tx(wk.develop?'mods.gohDev':'mods.gohVer',{g:wk.game||'?',min:wk.min||tx('mods.open'),max:wk.max||tx('mods.open')})}));
  if(lm)info.appendChild(h('div',{text:tx('mods.instLine',{v:tx(lm.installed?'mods.yes':'mods.no')})}));
  info.appendChild(h('div',{},[h('span',{text:tx('mods.healthLine')+' '}),h('span',{class:'badge '+(hc||''),text:healthTx(hc)})]));
  if(lm&&lm.ro)info.appendChild(h('div',{class:'hint',text:tx('mods.ro')}));
  var go=function(l,s,pri){return !INGAME[s]?null:h('button',{type:'button',text:tx(l),class:pri?'primary':'',onclick:function(){show(s)}})};
  info.appendChild(h('div',{class:'row'},[go('mods.goCheck','check',true),h('button',{type:'button',text:tx('mods.goBuild'),onclick:function(){newModAt('')}}),go('mods.goTest','play')]));
  if(m.modInfo)info.appendChild(h('details',{},[h('summary',{text:'mod.info'}),h('pre',{class:'log',text:m.modInfo})]))}).catch(function(e){info.textContent='';info.appendChild(h('div',{class:'err',text:e.message}));var hb=humanBox(e.message,parentOf(p));if(hb)info.appendChild(hb)})}
 function drawEmpty(why){empty.textContent='';empty.hidden=!why;if(!why)return;var g=curFolder();
  empty.appendChild(h('b',{text:tx(why)}));empty.appendChild(h('div',{class:'hint',text:tx('mods.where',{p:g?join(g,'mods'):tx('mods.gameUnknown')})}));
  empty.appendChild(h('div',{class:'row'},[g?h('button',{type:'button',class:'primary',text:tx('mods.useGame'),title:join(g,'mods'),onclick:function(){var p=join(g,'mods');S.roots=(S.roots||[]).filter(function(x){return x!==p}).concat([p]);load()}}):null,
   h('button',{type:'button',text:tx('mods.makeFirst'),onclick:function(){newModAt('')}})]))}
 function load(){mods=[];MIX=null;if(mkit)mkit.refresh();var roots=S.roots||[],pend=roots.length;rootsBox.textContent='';rootsBox.appendChild(h('b',{text:tx('mods.folders')}));
  roots.forEach(function(r){rootsBox.appendChild(h('span',{class:'badge',title:r,text:r.length>40?'...'+r.slice(-38):r},[h('button',{type:'button',text:'x',title:tx('mods.forget'),style:'margin-left:4px;padding:0 4px',onclick:function(){S.roots=roots.filter(function(x){return x!==r});load()}})]))});
  rootsBox.appendChild(h('button',{type:'button',text:tx('mods.add'),onclick:function(){pick('dir',roots[0]||'',function(p){S.roots=roots.concat([p]);load()})}}));
  rootsBox.appendChild(h('button',{type:'button',text:tx('mods.reload'),onclick:load}));
  if(!roots.length){draw();msg.textContent=tx('mods.nofolder');drawEmpty('mods.nofolder');nf.open=true;return}
  roots.forEach(function(r){api('/api/mods?dir='+encodeURIComponent(r)).then(function(j){j.mods.forEach(function(m){m.ro=!!j.readOnly;if(!mods.some(function(x){return x.path===m.path}))mods.push(m)})}).catch(function(e){var x=human(e.message);toast(r+': '+(x?x.text:e.message))}).then(function(){if(--pend===0){mods.sort(function(a,b){return b.mtimeMs-a.mtimeMs});MIX=null;if(mkit)mkit.refresh();draw();drawEmpty(mods.length?'':'mods.emptyHere');if(!mods.length)nf.open=true}})})}
 function mv(d){var v=vis();if(!v.length)return;var i=v.findIndex(function(m){return m.path===S.mod});i=Math.max(0,Math.min(v.length-1,i+d));choose(v[i]);var r=tb.children[i];if(r&&r.scrollIntoView)r.scrollIntoView({block:'nearest'})}
 tbl.onkeydown=function(e){if(e.key==='ArrowDown'||e.key==='j'){mv(1);e.preventDefault();e.stopPropagation()}else if(e.key==='ArrowUp'||e.key==='k'){mv(-1);e.preventDefault();e.stopPropagation()}else if(e.key==='Enter'&&S.mod){show('check')}};
 // GT-32: Esc clears the filter (and does not cancel a run while there is text to clear)
 // searchKit: history, index = mod names and folders (built once per list load); Browse = a mod folder on disk (the picker, in the folder of
 // the current mod, else the game's mods folder); a pick filters and chooses (a picked folder that is a listed mod is chosen)
 var MIX=null;function modItems(){if(MIX)return MIX;MIX=mods.map(function(m){var p=parentOf(m.path)||'';return {label:m.name||m.folder,value:m.name||m.folder,hint:m.folder,group:p,mod:m,lo:((m.name||'')+' '+m.folder).toLowerCase()}});return MIX}
 var mkit=searchKit(filt,{key:'mods.filter',arrows:false,index:function(q,done){q=q.toLowerCase();done(modItems().filter(function(x){return x.lo.indexOf(q)>=0}))},
  browse:{mode:'dir',start:function(){var g=curFolder();return parentOf(S.mod)||(g?join(g,'mods'):'')},toValue:function(p){return fkBase(p,true)}},
  onPick:function(v,it,from){var m=it&&it.mod;if(!m&&from==='browse'&&it&&it.path)mods.some(function(x){if(npath(x.path)===npath(it.path)){m=x;return true}});
   if(m&&from==='browse')v=m.name||m.folder;filt.value=v;draw();if(m)choose(m)}});
 filt.oninput=draw;filt.onkeydown=function(e){if(e._sk)return;if(e.key==='ArrowDown'){tbl.focus();mv(1);e.preventDefault()}else if(e.key==='Escape'&&filt.value){filt.value='';draw();e.preventDefault();if(e.stopPropagation)e.stopPropagation()}};
 root.appendChild(blk('title',[h('h2',{text:tx('nav.mods')})]));root.appendChild(blk('roots',[rootsBox]));root.appendChild(blk('empty',[empty]));
 root.appendChild(h('div',{blk:'cols',box:'cols'},[h('div',{blk:'list',box:'col'},[h('div',{class:'row',blk:'filter'},[mkit.el,msg]),blk('table',[tbl])]),blk('info',[info])]));
 // W5 Make split: the New Mod card under the list (every game: game parity), folded unless the list is empty or a folder was handed in (S.makeParent, newModAt)
 var nm=newModCard(),nf=h('details',{blk:'new.fold',box:'col'},[h('summary',{text:tx('mods.newH')}),nm.el]),nfWant=false;root.appendChild(nf);
 function nfOn(){var on=!!curGame();nf.hidden=!on;return on}
 function nfFocus(){var i=nm.form.inputs.dir;if(!i)return;try{if(i.scrollIntoView)i.scrollIntoView({block:'nearest'});i.focus()}catch(e){}}
 return {focus:function(){if(nfWant){nfWant=false;nfFocus();return}mkit.focus()},filter:filt,move:mv,reload:function(){load()},newMod:nm,
  refresh:function(){draw();var mp=S.makeParent;if(nfOn()){if(mp!=null){S.makeParent=null;nf.open=true;nfWant=true;if(mp)nm.fill(mp)}nm.refresh()}},init:function(){
   // GoH: the default roots come from /api/ls for the GoH folder (<GoH>/mods and the GoH Workshop 400750, listed read-only); no answer = <GoH>/mods
   if(!S.roots&&curGame().kind==='goh'){var gd=gohDir(),gdef=function(){if(gd)S.roots=[join(gd,'mods')];load()};
    api('/api/ls'+(gd?'?game='+encodeURIComponent(gd):'')).then(function(j){var rs=(j.roots||[]).filter(function(r){return r.name==='game mods'||r.readOnly}).map(function(r){return r.path});if(!rs.length)return gdef();S.roots=rs;load()}).catch(gdef)}
   else if(!S.roots){S.roots=[];api('/api/ls'+(S.gameOv?'?game='+encodeURIComponent(S.gameOv):'')).then(function(j){S.roots=(j.roots||[]).filter(function(r){return r.name==='game mods'||r.readOnly}).map(function(r){return r.path});load()}).catch(load)}else load();
   if(S.mod)showInfo(S.mod);else{info.textContent='';info.appendChild(h('div',{class:'hint',text:tx('mods.choose')}))}}}}

// GX G9/G14/G6/G8: file tree, next buttons, gen banner, upgrade summary
// game parity: a next step only to a page this game runs (an NA page, e.g. Play under GoH, gets no button)
function nextRow(ids){var M={check:['nx.check','check'],play:['nx.play','play'],mods:['nx.mods','mods']};ids=ids.filter(function(id){return !NA[M[id][1]]});
 return h('div',{class:'row','data-next':'1'},[h('b',{text:tx('nx.title')})].concat(ids.map(function(id,i){var x=M[id];return h('button',{type:'button',class:i?'':'primary',text:tx(x[0]),onclick:function(){show(x[1])}})})))}
function fileWhat(f){var b=String(f).toLowerCase().replace(/\/$/,'');
 return b==='mod.info'?tx('ft.modinfo'):b==='localization'?tx('ft.locdir'):/\.lng$/.test(b)?tx('ft.lng'):b==='.gitignore'?tx('ft.gitignore'):b==='readme.txt'?tx('ft.readme'):b==='resource'?tx('ft.resource'):b==='upgrade.md'?tx('ft.upgrade'):''}
function fileTree(list){var box=h('div',{class:'ftree','data-tree':'1'});
 (list||[]).forEach(function(f){var dir=/\/$/.test(f),parts=f.replace(/\/$/,'').split('/'),d=parts.length-1,w=fileWhat(f);
  box.appendChild(h('div',{style:'padding-left:'+(d*16)+'px'},[h('span',{text:parts[d]+(dir?'/':'')}),w?h('span',{class:'hint',text:'  - '+w}):null]))});
 if(!(list||[]).length)box.appendChild(h('div',{class:'hint',text:tx('ft.empty')}));return box}
function itemText(x){if(x==null)return '';if(typeof x!=='object')return String(x);
 return [x.file||x.key||x.path||'',x.msg||x.why||x.text||x.detail||x.code||''].filter(Boolean).join(': ')||JSON.stringify(x).slice(0,200)}
function genBanner(r,write){var b=h('div',{class:'banner','data-banner':'gen'}),o=r.ops||{},fl=r.files||[],sk=r.skipped||[],er=r.errors||[];
 b.appendChild(h('b',{text:tx(write?'gb.wrote':'gb.plan',{a:o.applied==null?0:o.applied,t:o.total==null?0:o.total,f:fl.length})}));
 if(r.out)b.appendChild(h('div',{class:'hint',text:tx('gb.out',{p:r.out})}));
 if(fl.length)b.appendChild(h('div',{class:'ftree'},fl.slice(0,40).map(function(x){return h('div',{text:'  '+(typeof x==='string'?x:itemText(x))})})));
 sk.forEach(function(x){b.appendChild(h('div',{class:'err',text:tx('gb.skip',{i:x.i==null?'?':x.i+1,op:x.op||'?',why:x.why||''})}))});
 er.forEach(function(e){b.appendChild(h('div',{class:'err',text:tx('gb.err',{m:itemText(e)})}))});
 if(!sk.length&&!er.length)b.appendChild(h('div',{class:'ok',text:tx('gb.clean')}));
 return b}
function upSummary(r,el){var a=(r.auto||[]).length,need=(r.review||[]).concat(r.cant||[]),w=((r.warn||{}).hit||[]);
 el.appendChild(h('div',{class:'head '+(need.length?'mid':'good'),'data-upsum':'1'},[h('b',{text:tx('ups.sum',{a:a,n:need.length,w:w.length})})]));
 if(!a&&!need.length&&!w.length){el.appendChild(h('div',{class:'ok',text:tx('ups.none')}));el.appendChild(nextRow(['play']))}
 if(need.length)el.appendChild(h('div',{},[h('b',{text:tx('ups.need')})].concat(need.slice(0,40).map(function(x){return h('div',{text:'- '+itemText(x)})}))));
 if(w.length)el.appendChild(h('div',{},[h('b',{text:tx('ups.warn')})].concat(w.slice(0,20).map(function(x){return h('div',{class:'hint',text:'- '+itemText(x)})}))));
 var notes=(r.notes||[]).concat((r.warn||{}).notes||[]);
 if(notes.length)el.appendChild(h('details',{},[h('summary',{text:tx('ups.notes',{n:notes.length})})].concat(notes.map(function(x){return h('div',{class:'hint',text:itemText(x)})}))))}
// GX C10/G12: the folder name ARSENAL new will make (tools/as2/door.js newMod: lowercase (GT-28), bad characters refused, trailing dot or space refused, spaces become _)
// goh = the GoH folder name rule on top: no '-', ASCII only (gohweb vfs/goh-modinfo-version-rule); spaces still become _
function cleanName(b,goh){b=String(b||'');if(!b.trim())return {err:tx('nw.prevNone')};if(/[\\\/:*?"<>|\x00-\x1f]/.test(b)||/[. ]$/.test(b))return {err:tx('nw.badName')};
 if(goh&&(/-/.test(b)||/[^\x20-\x7e]/.test(b)))return {err:tx('nw.badGoh')};return {name:b.replace(/\s+/g,'_').toLowerCase()}}
var SMP=[['rename-unit','smp.rename'],['change-price','smp.price'],['clone-unit','smp.clone'],['armor','smp.armor'],['squad','smp.squad'],['all','smp.all']];
// 2 Generator (page id make): gen from a spec, for all three games (Tools & Settings > Other Tools). W5 Make split: the New Mod card is on Mods (newModCard),
// the upgrade cards are on Upgrade or Port (screenUpgrade)
function screenMake(root){
 var spec=h('textarea',{rows:'18',spellcheck:'false','aria-label':tx('new.specAria')}),parent=h('input',{type:'text',autocomplete:'off','aria-label':tx('new.parent')}),name=h('input',{type:'text',value:'my_mod',autocomplete:'off','aria-label':tx('new.modname')});
 var target=h('select',{'aria-label':tx('new.target'),onchange:function(){target.dataset.manual='1'}},['as64','mowas2','goh'].map(function(t){return h('option',{value:t,text:gName(t)})})),force=h('input',{type:'checkbox','aria-label':tx('new.overwrite')}),sfile=h('input',{type:'text',placeholder:tx('new.sfile'),autocomplete:'off'});
 var log=mkLog(),res=h('div'),stat=h('span',{class:'hint'}),last=null,gprg=progress();
 var samp=h('select',{'aria-label':tx('new.sampleL'),title:tx('new.sampleL')},SMP.map(function(x){return h('option',{value:x[0],text:x[0]+' - '+tx(x[1])})}));
 // GX S7: the tool's own sample list (gen --sample list --json) adds its one-line description as a tooltip and any sample this page does not know yet
 var sampLoaded=false;samp.addEventListener('focus',function(){if(sampLoaded||RUN)return;sampLoaded=true;api('/api/run?stream=0',{cmd:'gen',input:{sample:true,sampleName:'list',json:true}}).then(function(j){var r=j.result;if(!r){try{r=JSON.parse(j.stdout)}catch(e){r=null}}if(!r||!r.samples)return;
  r.samples.forEach(function(x){var o=null;for(var i=0;i<samp.options.length;i++)if(samp.options[i].value===x.name)o=samp.options[i];if(!o){o=h('option',{value:x.name,text:x.name});samp.appendChild(o)}o.title=x.what||''})}).catch(function(){sampLoaded=false})});
 var where=h('div',{class:'hint'});
 function out(){return parent.value.trim()?join(parent.value.trim(),name.value.trim()):''}
 function showWhere(){where.textContent=out()?tx('new.where',{p:out()}):tx('new.wherenone')}
 parent.oninput=name.oninput=showWhere;
 function run(write,asked){
  if(RUN){stat.className='err';stat.textContent=busyMsg();return}
  if(!spec.value.trim()){stat.className='err';stat.textContent=tx('new.empty');return}
  if(write&&(!parent.value.trim()||!/^[\w .-]+$/.test(name.value.trim()))){stat.className='err';stat.textContent=tx('new.needparent');return}
  if(write&&force.checked&&!asked){askDo({title:tx('new.write'),lines:[tx('force.confirm',{what:tx('new.write')})],where:out(),danger:true}).then(function(yes){if(yes)run(write,true)});return}   // overwrite: always ask (GX-next idiot pass)
  log.clear();res.textContent='';stat.className='hint';stat.textContent=tx('new.saving');
  api('/api/spec',{name:'gui-new-mod',text:spec.value,json:/^\s*[\[{]/.test(spec.value)}).then(function(sp){
   if(sp.replaced)log.add('o',tx('new.specReplaced',{p:sp.path}));
   var input={spec:sp.path,target:target.value,json:true};if(gameDir())input.game=gameDir();if(curGame().kind==='goh'&&gohDir())input.goh=gohDir();if(out())input.out=out();   // plan gets the same out: the tool resolves it and writes nothing (without it gen printed <cwd>/gen-out/<name>)
   if(write){if(force.checked)input.force=true}else input.plan=true;
   stat.textContent=tx('run.running0');gprg.start('gen');
   var lines=0;return streamRun('gen',input,{line:function(k,t){lines++;log.add(k,t);if(k!=='e')gprg.say(t)}}).then(function(end){gprg.stop();
    if(!end){stat.className='err';stat.textContent=tx('run.notrun');return}
    var good=end.code===0&&!end.cancelled&&!end.timedOut;stat.className=good?'ok':'err';stat.textContent=end.cancelled?tx('new.cancelled'):end.timedOut?tx('new.timedout'):tx(write?'new.exitW':'new.exitP',{code:end.code,s:(end.ms/1000).toFixed(1)});
    if(!good){var hb=humanBox(log.text(),parent.value.trim());if(hb)res.appendChild(hb)}
    if(end.result!=null){res.appendChild(genBanner(end.result,write));res.appendChild(h('details',{'data-raw':'1'},[h('summary',{text:tx(write?'new.result':'new.plan')}),treeBox(end.result)]))}   // GT-28: the raw result once, folded
    if(good&&write){setMod(out());reloadMods();res.appendChild(h('div',{class:'row'},[h('span',{class:'ok',text:tx('new.written',{p:out()})}),h('button',{type:'button',class:'primary',text:tx('new.checkit'),onclick:function(){show('check')}}),INGAME.play?h('button',{type:'button',text:tx('nx.play'),onclick:function(){show('play')}}):null]))}})}).catch(function(e){gprg.stop();stat.className='err';stat.textContent=e.message})}
 root.appendChild(blk('title',[h('h2',{text:tx('nav.make')})]));
 // N2-3: what gen is, when to use it instead of Units, what each sample does, what gets written; Bot doctrine is something else
 var goPage=function(id,l){return h('button',{type:'button','data-go':id,text:tx(l),onclick:function(){if(S.sec[id])show(id);else toast(tx(l))}})},gpU=goPage('units','gi.units'),gpD=goPage('doctrine','gi.docGo');
 var giCard,giWhen;root.appendChild(giCard=card('gi',[blk('gi.title',[h('h3',{text:tx('gi.title')})]),h('div',{blk:'gi.what',text:tx('gi.what')}),blk('gi.when',[giWhen=h('div',{class:'hint',text:tx('gi.when')})]),
  h('div',{blk:'gi.samples',text:tx('gi.samples',{b:tx('new.sample')})}),blk('gi.list',[h('ul',{},SMP.map(function(x){return h('li',{text:x[0]+' - '+tx(x[1])})}))]),h('div',{class:'hint',blk:'gi.writes',text:tx('gi.writes')}),
  h('div',{class:'row',blk:'gi.btns'},[h('button',{type:'button',text:tx('gi.gloss'),onclick:function(){if(window.as2Help&&window.as2Help.glossary)window.as2Help.glossary('spec');else toast(tx('gi.gloss'))}}),gpU]),
  h('div',{class:'hint',blk:'gi.doc',text:tx('gi.doc')}),h('div',{class:'row',blk:'gi.docbtn'},[gpD])],{attrs:{'data-card':'gen-intro'}}));
 root.appendChild(h('div',{blk:'gen',box:'cols'},[
  card('spec',[blk('spec.title',[h('h3',{text:tx('new.h1')})]),h('div',{blk:'spec.tools',box:'row'},[h('div',{class:'row',blk:'spec.sample'},[samp,h('button',{type:'button','data-run':'1',text:tx('new.sample'),title:tx('new.sampleT'),onclick:function(){var sn=samp.value||'rename-unit';api('/api/run?stream=0',{cmd:'gen',input:{sample:true,sampleName:sn}}).then(function(j){var t=(j.lines||[]).filter(function(l){return l.s==='out'}).map(function(l){return l.line}).join('\n');if(!t.trim())throw new Error(tx('new.nosample'));spec.value=t+'\n';stat.textContent=tx('new.sampleFrom',{p:'gen --sample '+sn})}).catch(function(e){toast(e.message)})}})]),
   h('div',{class:'row',blk:'spec.file'},[sfile,h('button',{type:'button',text:tx('btn.pickfile'),onclick:function(){pick('file','',function(p){sfile.value=p;api('/api/text?path='+encodeURIComponent(p)).then(function(t){spec.value=t.text}).catch(function(e){toast(e.message)})})}}),h('button',{type:'button',text:tx('new.load'),onclick:function(){api('/api/text?path='+encodeURIComponent(sfile.value.trim())).then(function(t){spec.value=t.text}).catch(function(e){toast(e.message)})}})])]),blk('spec.text',[spec])]),
  h('div',{blk:'gen.side',box:'col'},[card('gen.opts',[blk('gen.title',[h('h3',{text:tx('new.h2')})]),
    fld('gen.target',tx('new.target'),target),
    fld('gen.parent',tx('new.parentL'),recField(parent,'dir'),{after:h('button',{type:'button',text:tx('btn.browse'),onclick:function(){pick('dir',parent.value.trim(),function(p){parent.value=p;showWhere()},{out:true})}})}),
    fld('gen.name',tx('new.nameL'),name),
    fld('gen.force',tx('new.overwrite'),h('span',{},[force,' ',h('span',{class:'hint',text:tx('new.force')})]),{chk:true}),
    blk('gen.where',[where]),
    h('div',{class:'row',blk:'gen.btns'},[h('button',{type:'button',text:tx('new.plan2'),'data-run':'1','data-primary':'1',class:'primary',onclick:function(){run(false)}}),h('button',{type:'button',text:tx('new.write'),'data-run':'1',onclick:function(){run(true)}})]),
    h('div',{class:'row',blk:'gen.stat'},[stat,gprg.el])]),
   card('gen.out',[blk('gen.res',[res]),blk('gen.log',[h('details',{'data-logfold':'1'},[h('summary',{text:tx('log.fold')}),log.el])])])])]));
 // a page link shows only where this game has the page (Units, Bot doctrine are as64 pages); so does the line that names the Units page
 function perGame(){var G=curGame();gpU.hidden=!INGAME.units;gpD.hidden=!INGAME.doctrine;giWhen.textContent=tx(INGAME.units?'gi.when':'gi.whenG');if(!target.dataset.manual)target.value=G.target}
 // S.makeParent: a folder handed in ("Make a mod here" on a game without the New Mod card) fills the parent folder
 return {refresh:function(){perGame();var mp=S.makeParent;if(mp!=null){S.makeParent=null;if(mp)parent.value=mp}
   // GT-28: the default place for a new mod is beside the current mod, never the game's own folder (Play installs a copy there)
   if(!parent.value&&S.mod&&!(gameDir()&&inside(S.mod,gameDir())))parent.value=parentOf(S.mod);showWhere()},init:function(){this.refresh()}}}

// 2b Upgrade or Port (Mods > Mods, every game): the easy card (an old mod to as64; not under GoH) and every upgrade setting (fold upadv, class adv:
// shown with Advanced; under GoH, where upgrade --to goh is the way, it is always shown and open: advkeep)
function screenUpgrade(root){
 root.appendChild(blk('title',[h('h2',{text:tx('nav.upgrade')})]));
 // game parity: donor and gohVersion (AS2 to GoH options) show under GoH only (upGohRows), goh is filled from the header's GoH folder
 var up=runCard({cmd:'upgrade',title:'up.title',intro:'up.intro',foldLog:true,hide:['plan','from','toBuild','carry','carryMax','dropDangling','mode','only','drop','patch','top','noLink'],presets:{plan:true},
  buttons:[{label:'up.preview',primary:true,extra:{plan:true},title:'up.previewT'},{label:'up.write',extra:{plan:false},confirm:'up.confirm',title:'up.writeT'}],
  beforeRun:function(c,input){if(input.plan)delete input.export;if(curGame().kind!=='goh'){delete input.donor;delete input.gohVersion}},   // --export needs a write; the preview leaves it out
  view:function(r,el){viewTree('up.result')(r,el);var t=h('div');upSummary(r,t);el.insertBefore(t,el.children[0]||null)},auto:{mod:needMod,to:function(){return curGame().kind==='goh'?'goh':GID==='mowas2'?'as64':''},goh:function(){return curGame().kind==='goh'?gohDir():''}},
  after:function(end,c,input){if(!input.plan&&input.out&&(end.code===0||end.code===3)&&!end.cancelled){setMod(input.out);reloadMods();c.res.appendChild(nextRow(['check','play']))}}});
 // GX upgrade G5/G14: the beginner card. as64 only, out folder made for you, Classic/Enhanced in one line; everything else under Advanced
 var ubMod=h('input',{type:'text',autocomplete:'off','aria-label':tx('ub.mod'),title:tx('ub.modT')}),ubOut=h('div',{class:'hint'}),ubMean=h('div',{class:'hint'});
 var ubMode=h('select',{'aria-label':tx('ub.mode'),title:tx('ub.modeT')},[h('option',{value:'enhanced',text:tx('ub.enh')}),h('option',{value:'classic',text:tx('ub.cls')})]);
 var ubLog=mkLog(),ubRes=h('div'),ubStat=h('span',{class:'hint'}),ubPrg=progress();
 function ubOutPath(){var m=ubMod.value.trim();if(!m)return '';var b=baseOf(m)+'_as64';
  return /[\\\/]workshop[\\\/]content[\\\/]/i.test(m)&&gameDir()?join(join(gameDir(),'mods'),b):join(parentOf(m)||m,b)}
 function ubShow(){ubOut.textContent=ubMod.value.trim()?tx('ub.out',{p:ubOutPath()}):tx('ub.needMod');ubMean.textContent=tx((ubMode.value||'enhanced')==='classic'?'ub.clsM':'ub.enhM')}
 ubMod.addEventListener('input',function(){ubMod.dataset.manual='1';ubShow()});ubMode.addEventListener('change',ubShow);
 function ubRun(write,asked){if(RUN){busyMsg();return}var m=ubMod.value.trim();if(!m){ubStat.className='err';ubStat.textContent=tx('ub.needMod');return}
  var o=ubOutPath(),input={mod:m,to:'as64',mode:ubMode.value||'enhanced'};if(write)input.out=o;else input.plan=true;
  if(write&&!asked){askDo({title:tx('ub.title'),lines:[tx('ub.confirm',{mod:m,out:o})],where:o}).then(function(yes){if(yes)ubRun(write,true)});return}
  ubLog.clear();ubRes.textContent='';ubStat.className='hint';ubStat.textContent=tx('run.running0');ubPrg.start(tx('ub.title'));
  streamRun('upgrade',input,{line:function(k,t){ubLog.add(k,t);if(t&&k!=='e')ubStat.textContent=tx('run.last',{l:String(t).slice(0,140)})}}).then(function(end){ubPrg.stop();
   if(!end){ubStat.className='err';ubStat.textContent=tx('run.notrun');return}
   var good=(end.code===0||end.code===3)&&!end.cancelled&&!end.timedOut;ubStat.className=good?'ok':'err';ubStat.textContent=tx('run.exit',{code:end.code,s:(end.ms/1000).toFixed(1)});
   if(!good){var hb=humanBox(ubLog.text(),parentOf(m));if(hb)ubRes.appendChild(hb)}
   var sb=saidBox(ubLog.lines());if(sb)ubRes.appendChild(sb);
   if(end.result!=null)upSummary(end.result,ubRes);
   if(good&&write){setMod(o);reloadMods();ubRes.appendChild(h('div',{class:'ok',text:tx('ub.done',{p:o})}));ubRes.appendChild(nextRow(['check','play']))}
   else if(good)ubRes.appendChild(h('div',{class:'hint',text:tx('ub.thenWrite')}))})}
 var ubCard=card('ub',[blk('ub.title',[h('h3',{text:tx('ub.title')})]),h('div',{class:'hint',blk:'ub.intro',text:tx('ub.intro')}),
  fld('ub.mod',tx('ub.mod'),recField(ubMod,'dir'),{req:true,title:tx('ub.modT'),after:h('button',{type:'button',text:tx('btn.browse'),onclick:function(){pick('dir',ubMod.value.trim(),function(p){ubMod.value=p;ubMod.dataset.manual='1';ubShow()})}})}),
  fld('ub.mode',tx('ub.mode'),ubMode,{title:tx('ub.modeT')}),blk('ub.mean',[ubMean]),blk('ub.out',[ubOut]),
  h('div',{class:'row',blk:'ub.btns'},[h('button',{type:'button','data-run':'1',text:tx('ub.preview'),title:tx('ub.previewT'),onclick:function(){ubRun(false)}}),h('button',{type:'button','data-run':'1',class:'primary',text:tx('ub.go'),title:tx('ub.goT'),onclick:function(){ubRun(true)}})]),
  h('div',{class:'row',blk:'ub.stat'},[ubStat,ubPrg.el]),h('div',{class:'hint advoff',blk:'ub.more',text:tx('ub.more')}),blk('ub.res',[ubRes]),blk('ub.log',[ubLog.el])],{attrs:{'data-card':'upgrade-easy'}});
 var upDet=h('details',{class:'adv',blk:'upadv',box:'col'},[h('summary',{text:tx('up.adv')}),up.el]);
 // game parity: under GoH the easy card (an old mod to an AS64 copy) is not the way; one plain line in its place points at upgrade --to goh below
 var ubNa=blk('ub.na',[],{name:tx('ub.title')});ubNa.hidden=true;
 root.appendChild(ubCard);root.appendChild(ubNa);root.appendChild(upDet);
 function upGohRows(on){['donor','gohVersion'].forEach(function(n){rowShow(up,n,on)})}
 function perGame(){var G=curGame();ubCard.hidden=G.kind==='goh';ubNa.hidden=G.kind!=='goh';ubNa.textContent='';if(G.kind==='goh')ubNa.appendChild(naCard('na.upgrade.easy.goh'));upGohRows(G.kind==='goh');if(G.kind==='goh'){upDet.open=true;upDet.classList.add('advkeep')}else upDet.classList.remove('advkeep')}
 return {refresh:function(){perGame();up.refresh();if(!ubMod.dataset.manual)ubMod.value=S.mod||'';ubShow()},init:function(){this.refresh()}}}

// W5 Make split: the New Mod card (ARSENAL new), on Mods > Mods of every game (screenMods folds it). {el, form, card, refresh, fill(parent)}
// game parity: target = curGame().target (sent only off AS64, so the AS64 call stays ARSENAL new <dir> as before); under GoH the GoH folder goes
// as --game and the folder name follows the GoH rule (cleanName goh). nwGame = one line naming the game the mod is made for (not under AS64)
function nwGoh(){return curGame().kind==='goh'}
function newModCard(){
 var nwPrev=h('div',{class:'hint','data-preview':'1'}),nwNext=h('div'),nwGame=h('div',{class:'hint','data-nwgame':'1',hidden:true});
 var nw=runCard({cmd:'new',title:'nw.title',intro:'nw.intro',hide:['game','dryRun','target'],foldLog:true,presets:{},buttons:[{label:'nw.dry',extra:{dryRun:true},title:'nw.dryT'},{label:'nw.go',primary:true,title:'nw.goT'}],auto:{},
  precheck:function(input){if(!nwGoh()||!input.dir)return '';var c=cleanName(baseOf(input.dir),true);return c.err||''},
  beforeRun:function(c,input){nwNext.textContent='';if(GID!==GDEF)input.target=curGame().target;if(nwGoh()&&gohDir())input.game=gohDir()},
  after:function(end,c,input){if(end.code!==0||end.cancelled||end.timedOut)return;
   if(input.dryRun){nwNext.appendChild(h('div',{class:'hint',text:tx('nw.dryDone')}));return}
   var cn=cleanName(baseOf(input.dir),nwGoh()),p=cn.name?join(parentOf(input.dir)||input.dir,cn.name):input.dir;setMod(p);reloadMods();
   api('/api/mod?dir='+encodeURIComponent(p)).then(function(m){nwNext.appendChild(h('b',{text:tx('nw.made',{p:p})}));if(m.note)nwNext.appendChild(h('div',{class:'err','data-note':'1',text:tx('mods.tooMany',{n:m.files}),title:m.note}));nwNext.appendChild(fileTree(m.tree));nwNext.appendChild(nextRow(['check','play','mods']))})
    .catch(function(e){nwNext.appendChild(h('div',{class:'err',text:e.message}))})}});
 function nwShow(){var i=nw.form.inputs.dir,d=i?i.value.trim():'';if(!d){nwPrev.className='hint';nwPrev.textContent=tx('nw.prevNone');return}
  if(!isAbs(d)){nwPrev.className='err';nwPrev.textContent=tx('err.abs');return}
  var c=cleanName(baseOf(d),nwGoh());nwPrev.className=c.err?'err':'ok';nwPrev.textContent=c.err||tx('nw.preview',{name:c.name,p:join(parentOf(d)||d,c.name)})}
 function nwGameShow(){var G=curGame();nwGame.hidden=GID===GDEF;nwGame.textContent=GID===GDEF?'':tx(G.kind==='goh'?'nw.forGoh':'nw.forG',{g:G.name,t:G.target})}
 if(nw.form.inputs.dir){nw.form.inputs.dir.addEventListener('input',nwShow);nw.form.inputs.dir._after=nwShow}
 blkPut(nw.el,blk('new.game',[nwGame]),nw.btns);blkPut(nw.el,blk('new.preview',[nwPrev]),nw.btns);blkPut(nw.el,blk('new.next',[nwNext]),nw.logB);   // logB = the block that holds the log (or its fold)
 return {el:nw.el,form:nw.form,card:nw,fill:function(p){nw.form.set('dir',join(p,'my_mod'));nwShow()},refresh:function(){nw.refresh();nwGameShow();nwShow()}}}
// "Make a mod here", "Make my first mod", the mod info Make button: opens and focuses the New Mod card on Mods (with <p>/my_mod when p is
// given) in every game that shows Mods; a game without the Mods page opens the Generator with p as its parent folder. S.makeParent carries p ("" = no folder)
function newModAt(p){S.makeParent=p||'';if(INGAME.mods&&S.sec.mods)show('mods');else show('make')}


// ---------- guided fix: 1 pick mod, 2 check, 3 review, 4 choose fixes, 5 apply into a NEW folder, 6 what changed ----------
// finding cards come from GET /api/explain (tools/lib/explain: what, why, fix steps, fixer). The out folder is never the source mod: checked here, in gui.js /api/run and in fix (outRefusal).
function npath(p){return String(p||'').replace(/[\\\/]+/g,'/').replace(/\/+$/,'').toLowerCase()}
function inside(a,b){var x=npath(a),y=npath(b);return !!x&&!!y&&(x===y||x.indexOf(y+'/')===0)}
function parentOf(p){var s=String(p||'').replace(/[\\\/]+$/,''),i=Math.max(s.lastIndexOf('/'),s.lastIndexOf('\\'));return i>0?s.slice(0,i):''}
function baseOf(p){var s=String(p||'').replace(/[\\\/]+$/,''),i=Math.max(s.lastIndexOf('/'),s.lastIndexOf('\\'));return s.slice(i+1)}
function isAbs(p){return /^([A-Za-z]:[\\\/]|\/|\\\\)/.test(p||'')}
function outProblem(out,mod){if(!out)return tx('wz.outNone');if(!isAbs(out))return tx('wz.outAbs');if(mod&&inside(out,mod))return tx('wz.outInMod');if(mod&&inside(mod,out))return tx('wz.outHoldsMod');
 var g=gameDir();if(g&&inside(out,g)&&!(inside(out,join(g,'mods'))&&npath(out)!==npath(join(g,'mods'))))return tx('wz.outInGame');
 // game parity: ARSENAL never writes into the GoH install (tools/lib/writeguard.js), mods folder included: a GoH fix goes to a folder outside it
 var gh=curGame().kind==='goh'?gohDir():'';if(gh&&inside(out,gh)&&!(inside(out,join(gh,'mods'))&&npath(out)!==npath(join(gh,'mods'))))return tx('wz.outInGoh');return ''}
function peekBtn(label,p,line){var view=h('pre',{class:'log',hidden:true});
 // IDE: the same place opens in the editor on the IDE page (the IDE tab) at that line (read-only there unless the file is in the picked mod)
 var ed=S.mod&&isAbs(p)?tip(h('button',{type:'button',class:'link','data-edit':'1',style:'margin-left:8px',text:tx('wz.edit'),onclick:function(){as2Edit({mod:S.mod,path:p},line||0,0)}}),tx('wz.editT')):null;
 return h('div',{},[h('button',{type:'button',class:'link',title:tx('wz.openT',{p:p}),text:label,onclick:function(){if(!view.hidden){view.hidden=true;return}
  api('/api/peek?path='+encodeURIComponent(p)+'&line='+(line||0)).then(function(j){view.textContent='';(j.lines||[]).forEach(function(l){view.appendChild(h('div',{class:l.n===line?'q':'',text:(l.n===line?'> ':'  ')+l.n+'  '+l.text}))});view.hidden=false})
   .catch(function(e){view.textContent=tx('wz.openErr',{m:e.message});view.hidden=false})}}),ed,view])}
// GUI-LOC: a hit = {file,line,msg,path} (check --locs; path = the file on disk or the virtual path of a pak entry, /api/peek reads both).
// old string samples ('a.def:3') still parse. every hit opens its lines; with a fix plan it says what fix will change there, else what to do by hand
var HPG=20;
function hitOf(x){if(x&&typeof x==='object')return {file:String(x.file||''),line:+x.line||0,msg:String(x.msg||''),path:x.path||'',text:x.text||''};
 var s=String(x),m=/^(.+?):(\d+)(?:\D|$)/.exec(s);return {file:m?m[1]:s,line:m?+m[2]:0,msg:'',path:'',text:s}}
function hitLabel(q){return q.text||(q.file+(q.line?':'+q.line:''))}
function hitLink(q,mod){var p=q.path||(isAbs(q.file)?q.file:mod?join(mod,q.file):'');
 return p&&/[\\\/.]/.test(q.file)?peekBtn(hitLabel(q),p,q.line):h('div',{text:hitLabel(q)})}
function normF(p){return String(p||'').replace(/\\/g,'/').replace(/^\/+/,'').replace(/^resource\//i,'').toLowerCase()}
function sameF(a,b){a=normF(a);b=normF(b);if(!a||!b)return false;return a===b||a.slice(-b.length-1)==='/'+b||b.slice(-a.length-1)==='/'+a}
// the fix plan's word on one hit: {fix:true,text} = fix will change it; {fix:false,text} = fix refuses it; null = plan does not cover it
function planFor(q,code,plan){if(!plan)return null;var i,j,c,t;
 for(i=0;i<(plan.changed||[]).length;i++){c=plan.changed[i];if(!sameF(c.file,q.file))continue;var ts=c.targets||[];
  for(j=0;j<ts.length;j++){t=ts[j];if(t.code===code&&(!q.line||!t.line||+t.line===q.line))return {fix:true,text:t.why||c.detail||c.kind}}
  if(!ts.length)return {fix:true,text:c.kind+': '+(c.detail||'')}}
 for(i=0;i<(plan.cant||[]).length;i++){c=plan.cant[i];if(sameF(c.key,q.file)&&(!q.line||!c.line||+c.line===q.line))return {fix:false,text:tx('wz.cantFix',{code:c.code,m:c.msg||''})}}
 return null}
function hitRow(q,f,e,mod,plan){var w=planFor(q,f.code,plan),man=(e&&e.fix&&e.fix[0])||tx('wz.manualNone');
 return h('div',{class:'hit','data-hit':q.file+':'+q.line},[hitLink(q,mod),q.msg?h('div',{class:'hint',text:q.msg}):null,
  h('div',{class:'fx '+(w&&w.fix?'ok':'hint'),text:w&&w.fix?tx('wz.fixWill',{t:w.text}):tx('wz.manual',{t:w?w.text:man})})])}
function whereList(f,e,mod,opt){opt=opt||{};var hs=[],seen={};
 (f.samples||[]).concat(e&&e.where?[e.where]:[]).forEach(function(x){var q=hitOf(x),k=q.file+':'+q.line+':'+q.msg;if(seen[k])return;seen[k]=1;hs.push(q)});
 if(!hs.length)return [h('div',{class:'hint',text:opt.fast?tx('wz.noWhere',{tool:f.tool||'?'}):tx('wz.noWhereFull',{tool:f.tool||'?'})})];
 var box=h('div',{class:'hits'}),pg=0,pages=Math.ceil(hs.length/HPG);
 function draw(){box.textContent='';hs.slice(pg*HPG,pg*HPG+HPG).forEach(function(q){box.appendChild(hitRow(q,f,e,mod,opt.plan))});
  var nav=[];if(pages>1)nav.push(h('button',{type:'button',text:tx('wz.pgPrev'),disabled:pg===0?'':null,onclick:function(){if(pg>0){pg--;draw()}}}),
   h('span',{class:'hint',text:tx('wz.page',{p:pg+1,n:pages})}),h('button',{type:'button',text:tx('wz.pgNext'),disabled:pg>=pages-1?'':null,onclick:function(){if(pg<pages-1){pg++;draw()}}}));
  if(f.n&&f.n>hs.length)nav.push(h('span',{class:'hint',text:tx('wz.hitsCap',{k:hs.length,n:f.n})}));
  if(nav.length)box.appendChild(h('div',{class:'row'},nav))}
 draw();return [box]}
// one finding card: what, where, why, how to fix, severity in plain words, fixer or "manual only"
// a block that opens and closes: head row (arrow + head parts) over a body. onT(open) hears every change
function foldBox(head,kids,open,attrs,onT){var body=h('div',{class:'fbody'},kids);body.hidden=!open;
 var car=h('button',{type:'button',class:'link fcar','aria-expanded':open?'true':'false',title:tx('wz.foldT'),text:open?'▾':'▸'});
 function flip(ev){var t=ev&&ev.target;if(t&&t!==car&&(t.tagName==='INPUT'||t.tagName==='BUTTON'||t.tagName==='LABEL'))return;
  body.hidden=!body.hidden;car.textContent=body.hidden?'▸':'▾';car.setAttribute('aria-expanded',body.hidden?'false':'true');if(onT)onT(!body.hidden);if(ev&&ev.stopPropagation)ev.stopPropagation()}
 car.addEventListener('click',flip);
 var hd=h('div',{class:'row fhead',style:'cursor:pointer'},[car].concat(head));hd.addEventListener('click',flip);
 return h('div',attrs||{class:'fold'},[hd,body])}
function xCard(f,e,mod,opt){var sev=f.sev||e.severity||'review';
 var head=[h('span',{class:'badge '+sev,title:e.impact||'',text:tx('sev.'+sev)}),h('b',{text:e.what||f.code}),
   h('span',{class:'hint',title:tx('wz.codeT'),text:f.code+(f.n?' x'+f.n:'')+(f.tool?' ['+f.tool+']':'')}),h('span',{class:'hint',title:tx('wz.tagT'),text:e.tag||''})];
 if(opt&&opt.fold)return foldBox(head,xBody(f,e,mod,opt),false,{class:'card fcard','data-code':f.code});
 return h('div',{class:'card fcard','data-code':f.code},[h('div',{class:'row'},head)].concat(xBody(f,e,mod,opt)))}
function xBody(f,e,mod,opt){
 return [
  h('div',{class:'fx'},[h('b',{text:tx('wz.where')})].concat(whereList(f,e,mod,opt))),
  h('div',{class:'fx'},[h('b',{text:tx('wz.why')}),h('span',{text:' '+(e.why||'')+' '}),h('span',{class:'hint',text:e.impact||''})]),
  e.limits&&e.limits.length?h('div',{class:'fx hint',title:tx('wz.limitsT'),text:tx('wz.limits',{ids:e.limits.join(', ')})}):null,
  h('div',{class:'fx'},[h('b',{text:tx('wz.how')}),h('ol',{},(e.fix||[]).map(function(s){return h('li',{text:s})}))]),
  h('div',{class:'fx '+(e.auto?'ok':'hint'),text:e.auto?tx(e.safe?'wz.autoSafe':'wz.autoRisky',{fixer:e.auto}):tx('wz.manualOnly')})]}
var WZS=['wz.s1','wz.s2','wz.s3','wz.s4','wz.sh','wz.s5','wz.s6'],WZT=['wz.s1T','wz.s2T','wz.s3T','wz.s4T','wz.shT','wz.s5T','wz.s6T'];
function wizard(){
 var W={check:null,cards:{},fixers:{},plan:null,items:[],picks:{},result:null,step:1,before:null};
 var steps=h('ol',{class:'steps'}),stat=h('div',{class:'wzstat',role:'status','aria-live':'polite'}),prog=h('div',{class:'hint wzprog'}),log=mkLog();
 var modLine=h('span',{}),fast=h('input',{type:'checkbox',title:tx('wz.fastT'),'aria-label':tx('wz.fast'),onchange:function(){fast.dataset.manual='1'}}),fastWhy=h('span',{class:'hint'});fast.checked=true;
 var bCheck=h('button',{type:'button',class:'primary','data-primary':'1',text:tx('wz.check'),onclick:function(){doCheck()}});
 var bMod=h('button',{type:'button',text:tx('wz.change'),title:tx('wz.changeT'),onclick:function(){show('mods')}});
 var findBox=h('div'),handN=h('span',{class:'hint','data-handn':'1'}),walkBox=h('div',{class:'card','data-walk':'1'}),bWalk=tip(h('button',{type:'button','data-walkbtn':'1',text:tx('wz.walk'),onclick:function(){startWalk()}}),tx('wz.walkT')),fixBox=h('div'),count=h('span',{class:'hint'}),partial=h('div',{class:'err'});
 var bAll=h('button',{type:'button',text:tx('wz.all'),title:tx('wz.allT'),onclick:function(){setAll(function(){return true})}});
 var bNone=h('button',{type:'button',text:tx('wz.none'),title:tx('wz.noneT'),onclick:function(){setAll(function(){return false})}});
 var bSafe=h('button',{type:'button',text:tx('wz.safeOnly'),title:tx('wz.safeOnlyT'),onclick:function(){setAll(function(it){return it.safe})}});
 var out=h('input',{type:'text',autocomplete:'off','aria-label':tx('wz.out'),title:tx('wz.outT'),oninput:function(){out.dataset.manual='1';upd()}}),outErr=h('div',{class:'err'});
 var bOut=h('button',{type:'button',text:tx('btn.browse'),title:tx('wz.outT'),onclick:function(){pick('dir',parentOf(out.value.trim())||parentOf(S.mod),function(p){out.value=npath(p)===npath(parentOf(S.mod))?join(p,baseOf(S.mod)+'_fixed'):p;out.dataset.manual='1';upd()},{out:true})}});
 var bApply=h('button',{type:'button',class:'danger',text:tx('wz.apply'),onclick:function(){doApply()}}),resBox=h('div');
 var bRe=h('button',{type:'button',text:tx('wz.recheck'),title:tx('wz.recheckT'),onclick:function(){doCheck(W.result&&W.result.out)}});
 // step 7 goes on to Test Run wherever this game lists it (Test, Share & Play > Test Run, no Advanced needed): the Test Plan page when the
 // game has it, else the Test Run page; neither: to Play; no Play either: no button.
 // testBtn() sets the label, the title and the target (data-go) together; the click opens exactly that target (applyAdv redraws it at once)
 var toTest=function(){return INGAME.testplan&&refOn('testplan')?'testplan':INGAME.test&&refOn('test')?'test':''},bTest=h('button',{type:'button','data-wznext':'1',onclick:function(){if(bTest.dataset.go)show(bTest.dataset.go)}});
 function testBtn(){var t=toTest();bTest.hidden=!t&&!INGAME.play;bTest.dataset.go=t||(INGAME.play?'play':'');bTest.textContent=tx(t?'wz.toTest':'nx.play');bTest.setAttribute('title',tx(t?'wz.toTestT':'wz.toPlayT'))}
 // blocks: the card is container wz; each step a container wz.s<n> with a heading leaf wz.s<n>.h; parts the code clears sit in a leaf of their own
 var sec=function(n,kids){return h('div',{class:'wzsec','data-step':String(n),blk:'wz.s'+n,box:'col'},[blk('wz.s'+n+'.h',[h('h4',{text:(n)+'. '+tx(WZS[n-1]),title:tx(WZT[n-1])})])].concat(kids))};
 var s1=sec(1,[h('div',{class:'row',blk:'wz.mod'},[modLine,bMod])]),
  s2=sec(2,[h('div',{class:'row',blk:'wz.run'},[h('label',{title:tx('wz.fastT')},[fast,' '+tx('wz.fast')]),bCheck,fastWhy])]),
  s3=sec(3,[h('div',{class:'hint',blk:'wz.s3.hint',text:tx('wz.s3H')}),blk('wz.find',[findBox])]),
  s4=sec(4,[h('div',{class:'hint',blk:'wz.s4.hint',text:tx('wz.s4H')}),h('div',{class:'row',blk:'wz.pick'},[bAll,bNone,bSafe,count]),blk('wz.partial',[partial]),blk('wz.fixes',[fixBox])]),
  sH=sec(5,[h('div',{class:'hint',blk:'wz.s5.hint',text:tx('wz.shH')}),h('div',{class:'row',blk:'wz.walkbtn'},[bWalk,handN]),blk('wz.walk',[walkBox])]),
  s5=sec(6,[h('div',{class:'hint',blk:'wz.s6.hint',text:tx('wz.s5H')}),fld('wz.out',tx('wz.out'),out,{req:true,title:tx('wz.outT'),after:bOut}),blk('wz.outerr',[outErr]),h('div',{class:'row',blk:'wz.apply'},[bApply])]),
  s6=sec(7,[blk('wz.res',[resBox]),h('div',{class:'row',blk:'wz.next'},[bRe,bTest])]);
 var card=h('div',{class:'card wizard',blk:'wz',box:'col'},[blk('wz.title',[h('h3',{text:tx('wz.title')})]),h('div',{class:'hint',blk:'wz.intro',text:tx('wz.intro')}),blk('wz.steps',[steps]),blk('wz.stat',[stat]),blk('wz.prog',[prog]),s1,s2,s3,s4,sH,s5,s6,blk('wz.log',[h('details',{'data-logfold':'1'},[h('summary',{text:tx('log.fold')}),log.el])])]);
 function say(k,p,cls){stat.className='wzstat '+(cls||'');stat.textContent=tx(k,p)}
 function dis(b,why){b.disabled=!!why;b.setAttribute('title',why||b.dataset.tip||'');b.setAttribute('aria-disabled',why?'true':'false')}
 function picked(){return W.items.filter(function(it){return W.picks[it.id]})}
 function kinds(){var k=[];picked().forEach(function(it){if(k.indexOf(it.kind)<0)k.push(it.kind)});return k}
 function canPick(){var c=S.cmds.fix;return !!(c&&c.fields.some(function(f){return f.name==='pick'}))}
 function setAll(fn){W.items.forEach(function(it){W.picks[it.id]=!!fn(it)});drawFixes();upd()}
 bCheck.dataset.tip=tx('wz.checkT');bApply.dataset.tip=tx('wz.applyT');
 function upd(){
  var mod=S.mod;modLine.textContent=mod?tx('wz.modIs',{p:mod}):tx('wz.modNone');
  // GX B10: a small mod (under 300 files) gets the full check by default, a big one the quick check; a tick by hand wins
  if(mod&&W.sizeFor!==mod&&!fast.dataset.manual){W.sizeFor=mod;modInfo(mod).then(function(m){if(fast.dataset.manual||S.mod!==mod)return;
   var small=!m.truncated&&m.files<300;fast.checked=!small;fastWhy.textContent=tx(small?'wz.fastSmall':'wz.fastBig',{n:m.files})}).catch(function(){})}
  // under GoH a default inside the GoH install would be refused (wz.outInGoh, writeguard): leave it empty, wz.outNone asks for one
  if(mod&&!out.dataset.manual){var dOut=join(parentOf(mod)||mod,baseOf(mod)+'_fixed'),gIn=curGame().kind==='goh'?gohDir():'';out.value=gIn&&inside(dOut,gIn)?'':dOut}
  var busy=RUN?tx('wz.busy'):'';
  dis(bCheck,!mod?tx('wz.needMod'):busy);
  var ni=W.items.length;[bAll,bNone,bSafe].forEach(function(b){dis(b,ni?'':tx('wz.noItems'))});
  var np=picked().length;count.textContent=ni?tx('wz.count',{n:np,m:ni}):'';
  partial.textContent='';if(!canPick()){var part=kinds().filter(function(k){return W.items.some(function(it){return it.kind===k&&!W.picks[it.id]})});if(part.length)partial.textContent=tx('wz.partial',{kinds:part.join(', ')})}
  var op=outProblem(out.value.trim(),mod);outErr.textContent=out.value.trim()?op:'';out.classList[op?'add':'remove']('bad');
  dis(bApply,!mod?tx('wz.needMod'):!W.check?tx('wz.needCheck'):!curFolder()?tx('wz.needGame'):!W.plan?tx('wz.needPlan'):!np?tx('wz.needPick'):op||busy);
  dis(bRe,!W.result?tx('wz.needApply'):busy);testBtn();
  W.step=!mod?1:!W.check?2:!W.plan&&!W.result?3:!W.result?(np?6:ni?4:5):7;
  steps.textContent='';for(var i=1;i<=7;i++)steps.appendChild(h('li',{class:i===W.step?'cur':i<W.step?'done':'',title:tx(WZT[i-1]),'aria-current':i===W.step?'step':null,text:tx(WZS[i-1])}));
  s3.hidden=!W.check;s4.hidden=!W.plan&&!W.result;sH.hidden=!W.check;s5.hidden=!W.plan;s6.hidden=!W.result;
  if(W.check){var hl=walkList(),hk={};hl.forEach(function(x){hk[x.f.code]=1});handN.textContent=hl.length?tx('wz.shN',{n:hl.length,k:Object.keys(hk).length,d:hl.filter(function(x){return W.walk&&W.walk.done[x.id]}).length}):tx('wz.walkNone');dis(bWalk,hl.length?'':tx('wz.walkNone'))}
  if(!RUN&&!stat.dataset.keep){if(!mod)say('wz.st.pick');else if(!W.check)say('wz.st.ready')}}
 function drawFindings(r){findBox.textContent='';var fs=(r.findings||[]).slice().sort(function(a,b){return SEV.indexOf(a.sev)-SEV.indexOf(b.sev)||b.n-a.n});
  headline(r,findBox,S.mod,tx('wz.verdictT'));   // GT-18: the plain result first
  (r.errors||[]).forEach(function(e){findBox.appendChild(h('div',{class:'err',text:tx('check.error',{m:e})}))});
  (r.notes||[]).forEach(function(n){findBox.appendChild(h('div',{class:'hint',text:n}))});
  (r.toolIssues||[]).forEach(function(x){if(x.kind==='reran'){findBox.appendChild(h('div',{class:'card hint','data-tool':x.tool,text:tx('wz.toolReran',{tool:x.tool})}));return}
   findBox.appendChild(h('div',{class:'card err','data-tool':x.tool},[h('div',{text:tx(x.kind==='oom'?'wz.toolOom':'wz.toolErr',{tool:x.tool,m:x.text})}),h('div',{class:'hint',text:tx('wz.toolHint',{tool:x.tool})}),
    h('button',{type:'button',text:tx('wz.toolRerun',{tool:x.tool}),onclick:function(){rerunTool(x.tool)}})]))});
  if(!fs.length)findBox.appendChild(h('div',{class:'ok',text:tx('wz.clean')}));
  // grouped by how bad it is (worst first), inside a group most frequent first; groups and cards open on a click
  var by={},ord=[];fs.forEach(function(f){var e=W.cards[f.code]||{what:f.code,fix:[],tag:''},sv=f.sev||e.severity||'review';if(!by[sv]){by[sv]=[];ord.push(sv)}by[sv].push({f:f,e:e})});
  W.gopen=W.gopen||{};
  ord.forEach(function(sv,i){var g=by[sv],n=g.reduce(function(s,x){return s+(x.f.n||0)},0),open=W.gopen[sv]!=null?W.gopen[sv]:(i===0||ord.length===1);
   findBox.appendChild(foldBox([h('span',{class:'badge '+sv,text:tx('sev.'+sv)}),h('b',{text:tx('wz.grp',{k:g.length,n:n})})],
    g.map(function(x){return xCard(x.f,x.e,S.mod,{fast:!!r.fast,plan:W.plan,fold:true})}),open,{class:'fold fgrp','data-sev':sv},function(o){W.gopen[sv]=o}))});
  drawWalk()}
 // one tool that failed (out of memory) rerun alone: its findings replace that tool's rows in the shown check
 function rerunTool(t){if(RUN){busyMsg();return}var input=chkIn({mod:S.mod,only:[t],jobs:1});if(S.gameOv)input.game=S.gameOv;
  run1('check',input,'wz.st.rerunTool',{tool:t}).then(function(r){if(!r||!W.check){upd();return}var c=W.check;
   c.findings=(c.findings||[]).filter(function(f){return f.tool!==t}).concat((r.findings||[]).filter(function(f){return f.tool===t}));
   c.toolIssues=(c.toolIssues||[]).filter(function(x){return x.tool!==t}).concat((r.toolIssues||[]).filter(function(x){return x.tool===t}));
   c.errors=(c.errors||[]).filter(function(e){return e.indexOf(t+':')!==0}).concat((r.errors||[]).filter(function(e){return e.indexOf(t+':')===0}));
   return explainCodes(c.findings.map(function(f){return f.code})).then(function(){drawFindings(c);delete stat.dataset.keep;say('wz.st.rerunDone',{tool:t},'ok');upd()})})}
 // walkthrough of the places no automatic fix covers: one place at a time, worst first, with its lines, the suggested change and a button to open it in the IDE
 function walkList(){var r=W.check,out=[];if(!r)return out;
  (r.findings||[]).slice().sort(function(a,b){return SEV.indexOf(a.sev)-SEV.indexOf(b.sev)||b.n-a.n}).forEach(function(f){var e=W.cards[f.code]||{what:f.code,fix:[],tag:''},seen={};
   (f.samples||[]).forEach(function(x){var q=hitOf(x),k=q.file+':'+q.line+':'+q.msg;if(seen[k])return;seen[k]=1;var w=planFor(q,f.code,W.plan);if(w&&w.fix)return;out.push({f:f,e:e,q:q,w:w,id:f.code+'|'+k})})});
  return out}
 function drawWalk(){walkBox.textContent='';var wk=W.walk;if(!wk||!wk.open){walkBox.hidden=true;return}walkBox.hidden=false;
  var L=walkList(),n=L.length;if(wk.i>=n)wk.i=Math.max(0,n-1);
  var close=h('button',{type:'button',class:'link',text:tx('wz.walkClose'),onclick:function(){wk.open=false;drawWalk()}});
  if(!n){walkBox.appendChild(h('div',{class:'row'},[h('span',{class:'ok',text:tx('wz.walkNone')}),close]));return}
  var it=L[wk.i],f=it.f,e=it.e,q=it.q,sev=f.sev||e.severity||'review',nd=L.filter(function(x){return wk.done[x.id]}).length;
  function go(i){wk.i=Math.max(0,Math.min(n-1,i));drawWalk()}
  function nextKind(){for(var j=wk.i+1;j<n;j++)if(L[j].f.code!==f.code){go(j);return}go(n-1)}
  function nextOpen(){for(var j=wk.i+1;j<n;j++)if(!wk.done[L[j].id]){go(j);return}go(wk.i+1)}
  var done=h('input',{type:'checkbox','data-walkdone':'1',title:tx('wz.walkDoneT')});done.checked=!!wk.done[it.id];
  done.addEventListener('change',function(){wk.done[it.id]=done.checked;walkSave();if(done.checked&&wk.i<n-1)nextOpen();else drawWalk();upd()});
  walkBox.appendChild(h('div',{class:'row'},[h('b',{'data-walkpos':'1',text:tx('wz.walkPos',{i:wk.i+1,n:n})}),
   h('button',{type:'button',text:tx('wz.walkPrev'),disabled:wk.i===0?'':null,onclick:function(){go(wk.i-1)}}),
   h('button',{type:'button',class:'primary',text:tx('wz.walkNext'),disabled:wk.i>=n-1?'':null,onclick:function(){go(wk.i+1)}}),
   tip(h('button',{type:'button',text:tx('wz.walkKind'),onclick:nextKind}),tx('wz.walkKindT')),
   h('label',{class:'pick'},[done,' ',tx('wz.walkDone')]),h('span',{class:'hint',text:tx('wz.walkLeft',{n:nd,m:n})}),close]));
  walkBox.appendChild(h('div',{class:'row'},[h('span',{class:'badge '+sev,title:e.impact||'',text:tx('sev.'+sev)}),h('b',{text:e.what||f.code}),h('span',{class:'hint',text:f.code+(f.tool?' ['+f.tool+']':'')})]));
  var link=hitLink(q,S.mod);walkBox.appendChild(h('div',{class:'fx'},[h('b',{text:tx('wz.where')}),link]));
  if(q.msg)walkBox.appendChild(h('div',{class:'fx'},[h('b',{text:tx('wz.walkMsg')}),h('span',{text:q.msg})]));
  if(e.why||e.impact)walkBox.appendChild(h('div',{class:'fx'},[h('b',{text:tx('wz.why')}),h('span',{text:' '+(e.why||'')+' '}),h('span',{class:'hint',text:e.impact||''})]));
  walkBox.appendChild(h('div',{class:'fx'},[h('b',{text:tx('wz.walkSug')}),it.w&&!it.w.fix?h('div',{class:'hint',text:it.w.text}):null,
   (e.fix||[]).length?h('ol',{},e.fix.map(function(s){return h('li',{text:s})})):h('span',{class:'hint',text:' '+tx('wz.manualNone')})]));
  walkBox.appendChild(h('div',{class:'hint',text:tx('wz.walkCap')}));
  // the lines of the place are shown at once (the same view a click on the file name opens)
  var b0=link.querySelector?link.querySelector('button'):null;if(b0)b0.click()}
 function walkKey(){return 'wz.done.'+String(S.mod||'').toLowerCase()}
 function walkLoad(){var d={};try{d=JSON.parse(localStorage.getItem(walkKey())||'{}')||{}}catch(e){d={}}return d}
 function walkSave(){try{var d={},k;for(k in W.walk.done)if(W.walk.done[k])d[k]=1;localStorage.setItem(walkKey(),JSON.stringify(d))}catch(e){}}
 function startWalk(){W.walk=W.walk||{i:0,done:walkLoad()};W.walk.open=true;drawWalk();upd()}
 function drawFixes(){fixBox.textContent='';var p=W.plan;if(!p)return;
  if(!W.items.length)fixBox.appendChild(h('div',{class:'hint',text:tx('wz.noAuto')}));
  // GoH: the fixers fix does not run there (fix.js GOH_SKIP) and those it runs with part of their rules (GOH_PART), each with the tool's own reason
  if((p.gohSkipped||[]).length)fixBox.appendChild(h('div',{class:'hint','data-key':'gohSkip'},[h('b',{text:tx('wz.gohSkip',{k:p.gohSkipped.map(function(x){return x.kind}).join(', ')})}),h('ul',{},p.gohSkipped.map(function(x){return h('li',{text:x.kind+': '+x.why})}))]));
  if((p.gohPart||[]).length)fixBox.appendChild(h('div',{class:'hint','data-key':'gohPart'},[h('b',{text:tx('wz.gohPart',{k:p.gohPart.map(function(x){return x.kind}).join(', ')})}),h('ul',{},p.gohPart.map(function(x){return h('li',{text:x.kind+': '+x.why})}))]));
  var by={};W.items.forEach(function(it){(by[it.kind]=by[it.kind]||[]).push(it)});
  W.fopen=W.fopen||{};var nk=Object.keys(by).length;
  // one block per kind of fix: a tick box for the whole kind in its head, a tick box per file inside
  Object.keys(by).sort(function(a,b){return by[b].length-by[a].length||(a<b?-1:1)}).forEach(function(k){var fx=W.fixers[k]||{},its=by[k],cbs=[];
   var all=h('input',{type:'checkbox','data-fixkind':k,title:tx('wz.kindT'),'aria-label':tx('wz.kindT')+' '+k}),cnt=h('span',{class:'hint'});
   function sync(){var n=its.filter(function(it){return W.picks[it.id]}).length;all.checked=n===its.length;all.indeterminate=n>0&&n<its.length;cnt.textContent=tx('wz.kindN',{n:n,m:its.length})}
   all.addEventListener('change',function(){var v=all.checked;its.forEach(function(it,i){W.picks[it.id]=v;cbs[i].checked=v});sync();upd()});
   var rows=its.map(function(it){var cb=h('input',{type:'checkbox','data-fix':it.id,title:tx('wz.pickT'),'aria-label':it.kind+' '+it.file,onchange:function(){W.picks[it.id]=cb.checked;sync();upd()}});cb.checked=!!W.picks[it.id];cbs.push(cb);
    return h('label',{class:'pick'},[cb,' ',h('span',{text:it.file}),h('span',{class:'hint',text:'  '+(it.detail||'')})])});
   sync();
   fixBox.appendChild(foldBox([all,h('b',{text:k}),h('span',{class:'badge '+(fx.safe?'good':'silent'),title:tx(fx.safe?'wz.safeT':'wz.riskyT'),text:tx(fx.safe?'wz.safe':'wz.risky')}),cnt,h('span',{class:'hint',text:fx.label||''})],
    rows,W.fopen[k]!=null?W.fopen[k]:(nk===1||its.length<=8),{class:'fold card fixgrp','data-kind':k},function(o){W.fopen[k]=o}))});
  // what fix refuses: one card per code with every place in it, all under one closed block
  var cg={},co=[];(p.cant||[]).forEach(function(c){var g=cg[c.code];if(!g){g=cg[c.code]={code:c.code,samples:[],n:0,msgs:{},tool:'fix',sev:'info'};co.push(g)}g.n++;g.msgs[c.msg||'']=1;
   if(g.samples.length<200){var key=c.key&&c.key!=='-'?c.key:'';g.samples.push(key?{file:key,line:c.line||0,msg:c.msg||''}:{file:'',line:0,msg:c.msg||'',text:' '})}});
  if(co.length){co.sort(function(a,b){return b.n-a.n});
   var cards=co.map(function(g){var ms=Object.keys(g.msgs),one=ms.length===1;if(one)g.samples.forEach(function(s){s.msg=''});g.samples=g.samples.filter(function(s){return s.file||s.msg});
    return xCard(g,Object.assign({},W.cards[g.code]||{what:g.code,fix:[],tag:''},{why:one?ms[0]:''}),S.mod,{fold:true})});
   fixBox.appendChild(foldBox([h('b',{text:tx('wz.cantGrp',{k:co.length,n:(p.cant||[]).length})})],cards,W.fopen['']!=null?W.fopen['']:co.length<=3,{class:'fold fgrp','data-cant':'1'},function(o){W.fopen['']=o}))}}
 function explainCodes(codes){codes=codes.filter(function(c,i){return c&&codes.indexOf(c)===i&&!W.cards[c]});if(!codes.length)return Promise.resolve();
  return api('/api/explain?codes='+encodeURIComponent(codes.join(','))+'&lang='+encodeURIComponent(LANG)).then(function(j){Object.keys(j.cards||{}).forEach(function(c){W.cards[c]=j.cards[c]});W.fixers=j.fixers||W.fixers}).catch(function(e){toast(e.message)})}
 function run1(cmd,input,k,p){stat.dataset.keep='1';say(k,p);prog.textContent='';log.add('o','> '+cmd);var on={},done=[];
  return streamRun(cmd,input,{line:function(kk,t){log.add(kk,t);var m=/^PROGRESS (start|done) (\S+(?: \(rerun alone\))?)(?: (\d+)s)?(.*)$/.exec(t||'');if(!m)return;
   if(m[1]==='start')on[m[2]]=1;else{delete on[m[2]];done.push(m[2]+' '+(m[3]||'0')+'s'+(/ERROR/.test(m[4])?' !':''))}
   prog.textContent=tx('wz.prog',{run:Object.keys(on).join(', ')||'-',done:done.length,last:done.slice(-3).join(', ')})}}).then(function(end){prog.textContent='';
  if(!end){say('wz.st.notrun',{cmd:cmd},'err');return null}
  if((end.code!==0&&!(cmd==='check'&&end.code===1&&end.result!=null))||end.cancelled||end.timedOut||end.result==null){say(end.cancelled?'wz.st.cancelled':'wz.st.failed',{cmd:cmd,code:end.code},'err');return null}return end.result})}
 function doCheck(withOut){if(RUN){busyMsg();return}if(!S.mod){upd();return}
  var input=chkIn({mod:S.mod});if(fast.checked)input.fast=true;if(S.gameOv)input.game=S.gameOv;if(withOut)input['with']=withOut;
  if(!withOut){W.walk={i:0,done:walkLoad(),open:false};W.check=null;W.plan=null;W.items=[];W.picks={};W.result=null;resBox.textContent=''}log.clear();upd();
  run1('check',input,withOut?'wz.st.rechecking':'wz.st.checking',{out:withOut}).then(function(r){if(!r){upd();return}
   var n=(r.findings||[]).reduce(function(s,f){return s+f.n},0);
   if(withOut){var b=W.before;resBox.appendChild(h('div',{class:n<b?'ok':'hint',text:tx('wz.after',{b:b,n:n})}));W.check=r;
    return explainCodes((r.findings||[]).map(function(f){return f.code})).then(function(){drawFindings(r);delete stat.dataset.keep;say('wz.st.rechecked',{b:b,n:n},'ok');upd()})}
   W.check=r;W.before=n;
   return explainCodes((r.findings||[]).map(function(f){return f.code})).then(function(){drawFindings(r);upd();
    if(!curFolder()){delete stat.dataset.keep;say('wz.st.noGame',{n:n},'err');upd();return}
    var op=outProblem(out.value.trim(),S.mod);if(op){delete stat.dataset.keep;say('wz.st.badOut',{m:op},'err');upd();return}
    return planNow(n)})})}
 function planNow(n){return run1('fix',fixIn({mod:S.mod,mode:'plan',out:out.value.trim(),game:gameDir()}),'wz.st.planning',{n:n}).then(function(p){
   if(!p){upd();return}W.plan=p;W.items=(p.changed||[]).map(function(c){return {id:c.kind+':'+c.file,kind:c.kind,file:c.file,detail:c.detail,safe:!!(W.fixers[c.kind]&&W.fixers[c.kind].safe)}});
   W.items.forEach(function(it){W.picks[it.id]=it.safe});
   return explainCodes((p.cant||[]).map(function(c){return c.code})).then(function(){W.items.forEach(function(it){it.safe=!!(W.fixers[it.kind]&&W.fixers[it.kind].safe);W.picks[it.id]=it.safe});
    drawFixes();if(W.check)drawFindings(W.check);delete stat.dataset.keep;say('wz.st.review',{n:n,m:W.items.length},'ok');upd()})})}
 function doApply(asked){if(RUN){busyMsg();return}var o=out.value.trim(),op=outProblem(o,S.mod);if(op){outErr.textContent=op;return}
  var its=picked();if(!its.length)return;var ks=kinds();
  var input=fixIn({mod:S.mod,mode:'apply',out:o,game:gameDir()});
  if(canPick())input.pick=its.map(function(it){return it.id});else input.only=ks;
  var all=canPick()?its.length:W.items.filter(function(it){return ks.indexOf(it.kind)>=0}).length;
  if(asked!==true){askDo({title:tx('wz.apply'),lines:tx('wz.confirm',{out:o,mod:S.mod,n:all,kinds:ks.join(', ')}).split(String.fromCharCode(10)),danger:true}).then(function(yes){if(yes)doApply(true)});return}
  run1('fix',input,'wz.st.applying',{out:o}).then(function(r){if(!r){upd();return}W.result=Object.assign({out:o},r);
   return explainCodes((r.cant||[]).map(function(c){return c.code})).then(function(){drawResult(r,o);delete stat.dataset.keep;say('wz.st.done',{n:(r.changed||[]).length,out:o},'ok');upd()})})}
 function drawResult(r,o){resBox.textContent='';
  var t=h('table',{class:'rtab','data-key':'changed'},[h('thead',{},[h('tr',{},[h('th',{text:tx('wz.kind')}),h('th',{text:tx('wz.file')}),h('th',{text:tx('wz.detail')})])])]),tb=h('tbody');
  (r.changed||[]).forEach(function(c){tb.appendChild(h('tr',{},[h('td',{text:c.kind}),h('td',{},[peekBtn(c.file,join(o,c.file),0)]),h('td',{text:c.detail||''})]))});t.appendChild(tb);
  resBox.appendChild(h('b',{text:tx('wz.changed',{n:(r.changed||[]).length,out:o})}));resBox.appendChild(h('div',{class:'scroll'},[t]));
  if(r.restore)resBox.appendChild(h('div',{class:'hint','data-key':'gohRestore',text:tx('wz.gohRestore',{n:r.restore.n,root:r.restore.root})}));   // GoH: written through lib/modwrite, restore points first
  (r.reverted||[]).forEach(function(x){resBox.appendChild(h('div',{class:'err',title:tx('wz.revertedT'),text:tx('wz.reverted',{file:x.file,why:x.why})}))});
  (r.cant||[]).forEach(function(c){resBox.appendChild(xCard({code:c.code,samples:[(c.key||'')+(c.line?':'+c.line:'')].filter(function(x){return x&&x!=='-'}),tool:'fix',sev:'info'},Object.assign({},W.cards[c.code]||{what:c.code,fix:[]},{why:c.msg||''}),S.mod))});
  resBox.appendChild(h('b',{text:tx('wz.next')}));
  resBox.appendChild(h('ol',{},[h('li',{text:tx('wz.next1',{mod:S.mod})}),h('li',{text:tx('wz.next2',{out:o})}),h('li',{text:tx('wz.next3')}),h('li',{text:tx('wz.next4')})]))}
 upd();
 return {el:card,upd:upd,W:W,out:out}}

// 3 Check (+ fix)
function screenCheck(root){
 var wz=wizard();S.wz=wz;
 var chk=runCard({cmd:'check',title:'check.title',intro:'check.intro',presets:{fast:true},hide:['quiet','timing','jobs'],foldLog:true,
  buttons:[{label:'check.run',primary:true,title:'check.runT'}],view:viewCheck,auto:{mod:needMod,game:function(){return S.gameOv},exe:function(){return GID===GDEF?'':curGame().target},goh:function(){return curGame().kind==='goh'?gohDir():''}}});
 var fixc=runCard({cmd:'fix',title:'fix.title',intro:'fix.intro',presets:{mode:'plan'},hide:['mods'],
  buttons:[{label:'fix.plan',title:'fix.planT'},{label:'fix.apply',extra:{mode:'apply'},danger:true,confirm:'fix.confirm',title:'fix.applyT'}],view:viewTree('fix.result'),auto:{mod:needMod,game:function(){return curFolder()},target:fixTarget}});
 root.appendChild(blk('title',[h('h2',{text:tx('nav.check')})]));root.appendChild(wz.el);
 root.appendChild(h('details',{class:'adv',blk:'adv',box:'col'},[h('summary',{title:tx('wz.advT'),text:tx('wz.adv')}),chk.el,fixc.el]));
 return {refresh:function(){fixc.el.hidden=!fixOn();wz.upd();chk.refresh();fixc.refresh()},focus:function(){}}}

// 4 Play: play (check, install, test match, boot verdict), install, uninstall. play starts the game unless dry: it needs --allow-launch like the other launchers
// GX G5/C12/S12: game runs on or off for this session only (POST /api/launch; never saved, the next start is off again)
function launchCard(){var cb=h('input',{type:'checkbox','data-launchsw':'1','aria-label':tx('lc.label')}),st=h('div',{class:'hint'});
 function draw(){cb.checked=!!S.health.allowLaunch;st.className=S.health.allowLaunch?'ok':'hint';st.textContent=tx(S.health.allowLaunch?'lc.on':'lc.off')}
 cb.addEventListener('change',function(){var want=!!cb.checked;
  function set(){api('/api/launch',{on:want}).then(function(j){S.health.allowLaunch=!!j.allowLaunch;draw();refreshBlocked();drawGame()}).catch(function(e){cb.checked=!want;toast(e.message)})}
  if(!want){set();return}
  askDo({title:tx('lc.title'),lines:[tx('lc.confirm')],danger:true}).then(function(yes){if(yes)set();else cb.checked=false})});
 draw();return {el:card('launch',[blk('launch.title',[h('h3',{text:tx('lc.title')})]),blk('launch.sw',[h('label',{},[cb,' '+tx('lc.label')])]),blk('launch.state',[st]),h('div',{class:'hint',blk:'launch.note',text:tx('lc.note')})]),draw:draw}}
// GX G13/N11: the dry run's own step line as a numbered list, plus what is put back
function playSteps(text,el){var l=String(text||'').split('\n').filter(function(x){return /^1\. /.test(x)})[0];if(!l)return;
 el.appendChild(h('b',{text:tx('ps.title')}));el.appendChild(h('ol',{'data-steps':'1'},l.split(/\s{2,}(?=\d+\. )/).map(function(x){return h('li',{text:x.replace(/^\d+\.\s*/,'')})})));
 el.appendChild(h('div',{class:'ok',text:tx('pe.restore')}))}
// N2-4: the test game copy (instance 1, never 0). Look first (modswitch dry run, reads only); "Make" (modswitch --seed 1) only after a look, with a confirm
function testProfileCard(){var st=h('div',{class:'hint'}),log=mkLog(),looked=false,mk,tp=progress();
 function run(cmd,input,then){if(RUN){busyMsg();return}log.clear();st.className='hint';st.textContent=tx('run.running0');tp.start(cmd);
  streamRun(cmd,input,{line:function(k,t){log.add(k,t);if(k!=='e')tp.say(t)}}).then(function(end){tp.stop();then(end,log.text())},function(){tp.stop()})}
 var look=h('button',{type:'button','data-run':'1','data-tp':'look',text:tx('tp.look'),title:tx('tp.lookT'),onclick:function(){var g=gameDir();if(!g){st.className='err';st.textContent=tx('game.notSet');return}
  run('testprofile',{game:g,inst:1},function(end,text){looked=true;mk.disabled=false;
   if(/no profile found/i.test(text)){st.className='err';st.textContent=tx('tp.none')}else if(end&&end.code===0){st.className='ok';st.textContent=tx('tp.ok')}else{st.className='err';st.textContent=tx('tp.fail')}})}});
 mk=h('button',{type:'button','data-run':'1','data-tp':'make',disabled:true,text:tx('tp.make'),title:tx('tp.makeT'),onclick:function(){if(!looked)return;askDo({title:tx('tp.make'),lines:[tx('tp.confirm')],danger:true}).then(function(yes){if(!yes)return;
  run('testprofile-seed',{seed:1},function(end){if(end&&end.code===0){st.className='ok';st.textContent=tx('tp.made')}else{st.className='err';st.textContent=tx('tp.fail')}})})}});
 return card('tp',[blk('tp.title',[h('h3',{text:tx('tp.title')})]),h('div',{class:'hint',blk:'tp.intro',text:tx('tp.intro')}),h('div',{class:'row',blk:'tp.btns'},[look,mk,tp.el]),blk('tp.state',[st]),blk('tp.log',[log.el])],{attrs:{'data-card':'testprofile'}})}
// N2-5: switching the mod on in the normal game is done in the game (Install only copies the folder)
function playYourselfCard(){return card('py',[blk('py.title',[h('h3',{text:tx('py.title')})]),blk('py.list',[h('ol',{},['py.s1','py.s2','py.s3','py.s4','py.s5','py.s6'].map(function(k){return h('li',{text:tx(k)})}))]),
 h('div',{class:'hint',blk:'py.note',text:tx('py.note')}),h('div',{class:'row',blk:'py.btns'},[h('button',{type:'button',text:tx('py.notShowing'),onclick:function(){if(window.as2Help&&window.as2Help.notShowing)window.as2Help.notShowing();else show('help')}})])],{attrs:{'data-card':'play-yourself'}})}
// game parity: show or hide one form row of a run card (the row that holds field n)
// a form field's row shown or hidden; a box with a search kit (buildForm) hides its kit wrapper with it, so the box's own parent says so too
function rowShow(c,n,on){var i=c.form.inputs[n],r=i&&i.parentNode;while(r&&!(r.dataset&&r.dataset.f===n))r=r.parentNode;if(r)r.hidden=!on;if(i&&i._sk&&i._sk.el)i._sk.el.hidden=!on}
// game parity: the cards of one game that have a part this game cannot run. MoW:AS2 has no -console, -control, -instance (TST-19 [I]):
// a real play needs instance 1 and the control pipe, so Play offers only the dry run and sends no --inst there; the test game copy is
// an instance profile, so it is a plain line there (naBox(key): the line in a named block, redrawn per game)
function naBox(id,name){var b=blk(id,[],{name:name});b.hidden=true;return {el:b,set:function(key){b.textContent='';b.hidden=!key;if(key)b.appendChild(naCard(key))}}}
function screenPlay(root){
 var lc=launchCard(),pyCard=playYourselfCard();
 var ins=runCard({cmd:'install',title:'ins.title',intro:'ins.intro',presets:{},hide:['dry'],
  buttons:[{label:'ins.dry',primary:true,extra:{dry:true},title:'ins.dryT'},{label:'ins.install',extra:{dry:false},confirm:'ins.confirm',title:'ins.installT'}],auto:{mod:needMod,game:function(){return S.gameOv}},
  after:function(end,c,input){if(!input.dry&&end.code===0){reloadMods();loadInst();c.res.appendChild(h('div',{class:'row','data-next':'1'},[h('b',{text:tx('nx.title')}),h('button',{type:'button',class:'primary',text:tx('py.how'),onclick:function(){if(pyCard.scrollIntoView)pyCard.scrollIntoView({behavior:'smooth'})}})]))}}});
 var rm=runCard({cmd:'uninstall',title:'rm.title',intro:'rm.intro',presets:{},
  buttons:[{label:'rm.remove',danger:true,extra:{yes:true},confirm:'rm.confirm',title:'rm.removeT'}],auto:{game:function(){return S.gameOv}},
  after:function(end){if(end.code===0){reloadMods();loadInst()}}});
 var plCmds=[];
 var pl=runCard({cmd:'play',title:'pl.title',intro:'pl.intro',presets:{},hide:['dry'],
  buttons:[{label:'pl.dry',primary:true,extra:{dry:true},title:'pl.dryT'},{label:'pl.go',launch:true,danger:true,extra:{dry:false},confirm:'pl.confirm',title:'pl.goT'}],auto:{mod:needMod,game:function(){return S.gameOv},exe:function(){return GID==='mowas2'&&gameDir()?join(gameDir(),'mowas_2.exe'):''}},
  // N2-19: the tool's "$ node ..." lines go under a "Show the commands" fold, not into the plain steps
  beforeRun:function(c,input){plCmds=[];if(GID==='mowas2'){delete input.inst;input.dry=true}},onLine:function(c,k,t){if(k!=='e'&&/^\s*\$ /.test(t||'')){plCmds.push(String(t).trim());return true}return false},
  after:function(end,c,input){if(input.dry)playSteps(c.log.text(),c.res);
   if(plCmds.length)c.res.appendChild(h('details',{'data-cmds':'1'},[h('summary',{text:tx('pc.show',{n:plCmds.length})}),h('pre',{class:'log',text:plCmds.join(String.fromCharCode(10))})]))}});
 // GX N10: the test map. Only 1v1_reloading_point has a boot baseline (tools/bootcheck/base), so it is the one offered [I]
 var mapSel=h('select',{'aria-label':tx('pm.label'),title:tx('pm.hint')},[h('option',{value:'',text:tx('pm.def')}),h('option',{value:'multi/1v1_reloading_point:combat',text:'1v1_reloading_point - '+tx('pm.base')})]);
 mapSel.addEventListener('change',function(){pl.form.set('map',mapSel.value)});
 blkPut(pl.el,fld('play.map',tx('pm.label'),mapSel),pl.btns);blkPut(pl.el,h('div',{class:'hint',blk:'play.maphint',text:tx('pm.hint')}),pl.btns);
 // GX G15: pick a mod ARSENAL installed (marked) instead of typing its folder name
 var rmSel=h('select',{'aria-label':tx('rm.pick'),title:tx('rm.pickT')}),rmNote=h('div',{class:'hint'});
 function loadInst(){api('/api/installed'+(S.gameOv?'?game='+encodeURIComponent(S.gameOv):'')).then(function(j){rmSel.textContent='';var mk=(j.mods||[]).filter(function(m){return m.marked});
  rmSel.appendChild(h('option',{value:'',text:tx(mk.length?'rm.choose':'rm.none')}));mk.forEach(function(m){rmSel.appendChild(h('option',{value:m.name,text:m.name}))});
  // GT-35: count the folders that hold mod.info, as the Mods page does
  var all=(j.mods||[]).filter(function(m){return m.hasInfo!==false}).length,noInfo=(j.mods||[]).length-all;
  rmNote.textContent=tx('rm.count',{n:mk.length,m:all})+(noInfo?'  '+tx('rm.noInfo',{n:noInfo}):'')}).catch(function(e){rmNote.textContent=e.message})}
 rmSel.addEventListener('change',function(){rm.form.set('name',rmSel.value)});
 blkPut(rm.el,fld('uninstall.pick',tx('rm.pick'),rmSel,{title:tx('rm.pickT')}),rm.form.el);blkPut(rm.el,blk('uninstall.note',[rmNote]),rm.form.el);
 var pe=card('steps',[blk('steps.title',[h('h3',{text:tx('pe.title')})]),blk('steps.list',[h('ol',{},['pe.s1','pe.s2','pe.s3','pe.s4','pe.s5','pe.s6'].map(function(k){return h('li',{text:tx(k)})}))]),
  h('div',{class:'ok',blk:'steps.restore',text:tx('pe.restore')}),h('div',{class:'hint',blk:'steps.inst',text:tx('pe.inst')}),h('div',{class:'hint',blk:'steps.verdict',text:tx('pe.verdict')}),h('div',{class:'hint',blk:'steps.map',text:tx('pe.map')})]);
 var tpc=testProfileCard(),tpNa=naBox('tp.na',tx('tp.title')),plNa=naBox('play.na',tx('pl.title'));blkPut(pl.el,plNa.el,pl.btns);
 root.appendChild(blk('title',[h('h2',{text:tx('nav.play')})]));root.appendChild(lc.el);root.appendChild(pe);root.appendChild(tpc);root.appendChild(tpNa.el);[pl,ins].forEach(function(c){root.appendChild(c.el)});root.appendChild(pyCard);root.appendChild(rm.el);
 function perGame(){var m=GID==='mowas2';tpc.hidden=m;tpNa.set(m?'na.play.tp.mowas2':'');plNa.set(m?'na.play.go.mowas2':'');rowShow(pl,'inst',!m);if(pl.buttons[1])pl.buttons[1].hidden=m}
 return {refresh:function(){perGame();lc.draw();pl.refresh();ins.refresh();rm.refresh()},init:function(){loadInst()},focus:function(){loadInst()}}}

// GT-11: prove builds its fixture for any name, so the page looks the unit and army up first (the Units page's search over the game and
// the picked mod). A card name is ASCII; a name the game does not have, or an army it does not have, stops the run with a plain line.
// When the lookup itself cannot answer (no Units page, no game data) the run goes ahead as before.
function proveCheck(input){var u=String(input.unit||'').trim(),a=String(input.army||'').trim();
 if(!u)return '';if(!/^[A-Za-z0-9_.\-]+$/.test(u))return tx('pv.badUnit',{u:u});
 var body={q:u,all:true,limit:20};if(input.game)body.game=input.game;if(S.mod)body.mod=S.mod;
 return api('/api/x/units/search',body).then(function(j){var rs=(j&&j.results)||[],am=((j&&j.armies)||[]).map(function(x){return String(x).toLowerCase()});
  if(!am.length)return '';   // no units read at all (no game data here): the lookup cannot answer, the run goes ahead
  var hit=rs.filter(function(x){return String(x.id||'').toLowerCase()===u.toLowerCase()});
  if(!hit.length)return tx('pv.noUnit',{u:u});
  if(a&&am.length&&am.indexOf(a.toLowerCase())<0)return tx('pv.noArmy',{a:a,list:am.join(', ')});
  return ''},function(){return ''})}
// 5 Test run. game parity: under MoW:AS2 edrun runs the MoW:AS2 editor (--exe mowas_2_ed.exe, an exe name beside --root, default the game)
// and prove the MoW:AS2 game (--exe <game>/mowas_2.exe: prove hands --exe to testrun as a path). Under AS64 nothing is added (the tools' own default)
function testExe(which,g){if(GID!=='mowas2')return '';if(which==='ed')return 'mowas_2_ed.exe';g=g||gameDir();return g?join(g,'mowas_2.exe'):'mowas_2.exe'}
// Unit pairs (Test Run): nobody writes pairs.json by hand. Two unit boxes (searchKit over POST /api/x/units/index, asked when a box is
// first used), the server suggests the full pair, the list is edited here and saved as a named pairs file whose path goes into the edrun
// card (onSaved(path)). Routes (tools/testplan/README.md, GUI routes; the page part owns them), all with {mod} and the game header:
//   POST /api/x/testplan/pairs/suggest {mod, shooter, foe?}       -> the pair, or {pair}; fields shooter, foe, dist (map units, 20 = 1 m), id
//   POST /api/x/testplan/pairs/describe {mod, pairs}              -> {pairs:[{id, text}]} (or the array), same order as sent
//   POST /api/x/testplan/pairs/check {mod, pairs}                 -> {pairs:[{id, status, notes, warns}]} (or the array), same order
//   GET  /api/x/testplan/pairs/lib?mod=                           -> {files:[{name, path, count}]} (or the array)
//   POST /api/x/testplan/pairs/lib {mod, op:'get'|'save'|'remove', name, pairs?} -> get {pairs, path}; save {path}
// A route that answers 404 (not built here) gives one plain line (pp.noRoute); the rest of the card stays usable. Without describe the
// sentence is built here from the unit index. One list per game (a pair names units of that game). Lang keys pp.*
function pairsCard(onSaved,onLib){
 var R='/api/x/testplan/pairs/',BY={},IX={sig:null,a:null,w:[]},libSig=null,RT={suggest:'pp.r.suggest',describe:'pp.r.describe',check:'pp.r.check',lib:'pp.r.lib',index:'pp.r.index'};
 function L(){return BY[GID]||(BY[GID]=[])}
 function body(o){o=o||{};o.mod=S.mod||'';return o}
 function sig(){return GID+'|'+(S.mod||'')+'|'+(S.gameOv||'')}
 function arr(j,k){return Array.isArray(j)?j:j&&Array.isArray(j[k])?j[k]:j&&Array.isArray(j.list)?j.list:[]}
 function kindW(k){var key='units.kind.'+k,t=tx(key);return t===key?String(k||''):t}
 function stem(p){var b=String(p||'').replace(/\\/g,'/').split('/').pop(),i=b.lastIndexOf('.');return i>0?b.slice(0,i):b}
 var st=h('div',{class:'hint',role:'status','data-ppstat':'1'}),list=h('div',{'data-pplist':'1'}),saved=h('div',{'data-ppsaved':'1'});
 function say(cls,text){st.className=cls;st.textContent=text||'';delete st.dataset.gone}
 // a failed request: 404 with no message key = the route is not built on this server (one plain line naming the part), else the server's
 // own words (a route that is there may answer 404 with a key, e.g. no such pairs file)
 function fail(e,what,el){el=el||st;el.className=e&&e.cancelled?'hint':'err';if(e&&e.status===404&&!e.key){el.textContent=tx('pp.noRoute',{what:tx(RT[what])});el.dataset.gone=what}else{el.textContent=(e&&(e.text||e.message))||String(e);delete el.dataset.gone}}
 // the unit index: every unit of the game and the mod by name (every language the index sends), id, army and kind; one request per game + mod
 function units(cb){var s=sig();if(IX.sig===s&&IX.a){cb(IX.a);return}IX.w.push(cb);if(IX.sig===s)return;IX.sig=s;IX.a=null;
  function end(a,good){if(IX.sig!==s)return;if(good)IX.a=a;else IX.sig=null;var w=IX.w;IX.w=[];w.forEach(function(f){f(a)});marks();if(good)draw()}
  function row(u){var nm=u.name||u.id,ns=u.names,al=!ns?'':Array.isArray(ns)?ns.join(' '):typeof ns==='object'?Object.keys(ns).map(function(k){return ns[k]}).join(' '):String(ns);
    return {label:nm,value:u.id,hint:u.id+'  '+(u.army||'')+' '+kindW(u.kind)+(u.period?' '+u.period:''),lo:(nm+' '+u.id+' '+(u.army||'')+' '+(u.kind||'')+' '+kindW(u.kind)+' '+al).toLowerCase()}}
  function bad(e){fail(e,'index');end([],false)}
  // a mod that replaces the buy lists (no multiplayer cards of its own) has an empty unit list: the units of the game are searched then,
  // and a unit only the mod has is typed by id or picked with Browse (its .def file)
  api('/api/x/units/index',body({}),{what:tx('pp.job.index')}).then(function(j){var a=((j&&j.units)||[]).map(row);if(a.length||!S.mod){end(a,true);return}
   api('/api/x/units/index',{mod:''},{what:tx('pp.job.index')}).then(function(g){end(((g&&g.units)||[]).map(row),true)},bad)},bad)}
 // every typed word must be in the unit's text (name, id, army, kind); the ones that start with the first word come first; at most 40
 function hits(a,q,done){var ws=String(q||'').trim().toLowerCase().split(/\s+/).filter(Boolean),f=[],l=[],n=0;
  for(var i=0;i<a.length;i++){var lo=a[i].lo,k=0;while(k<ws.length&&lo.indexOf(ws[k])>=0)k++;if(k<ws.length)continue;n++;if(!ws.length||lo.indexOf(ws[0])===0){if(f.length<40)f.push(a[i])}else if(l.length<40)l.push(a[i])}
  var o=f.concat(l).slice(0,40);done(o,n-o.length)}
 function unitOf(id){var a=IX.sig===sig()&&IX.a?IX.a:[],lo=String(id||'').toLowerCase();if(!lo)return null;for(var i=0;i<a.length;i++)if(String(a[i].value).toLowerCase()===lo)return a[i];return null}
 function nm(id){var u=unitOf(id);return u&&u.label!==String(id)?u.label+' ('+id+')':String(id)}
 // one unit box: the box holds the unit id (a pick puts it there); the line after it names the unit (name, army, kind) once the index knows the id
 function box(key,lab){var inp=h('input',{type:'text',autocomplete:'off','aria-label':tx(lab),title:tx('pp.boxT'),'data-pp':key}),who=h('span',{class:'hint','data-ppwho':key});
  function mark(){var u=unitOf(inp.value.trim());who.textContent=u?u.label+', '+u.hint.replace(/^\S+\s+/,''):''}
  var kit=searchKit(inp,{key:'test.pair.'+key,index:function(q,done){units(function(a){hits(a,q,done)})},browse:{mode:'file',view:'data',start:'entity',exts:['def'],toValue:stem}});
  inp.addEventListener('input',mark);inp.addEventListener('change',mark);
  return {inp:inp,kit:kit,mark:mark,el:fld('pairs.'+key,tx(lab),kit.el,{after:who,title:tx('pp.boxT')})}}
 var sh=box('shooter','pp.shooter'),tg=box('target','pp.target');
 function marks(){sh.mark();tg.mark()}
 function met(p){return Math.round((+p.dist||0)/20*10)/10}
 function local(p){return tx(+p.dist>0?'pp.sent':'pp.sent0',{a:nm(p.shooter),b:nm(p.foe),m:met(p)})}
 function entry(p){return {p:p,id:p.id?String(p.id):'',text:'',st:null}}
 // the identifier comes from the route (it follows the distance and the switches); the sentence is built here with the in-game names when the
 // unit list knows the shooter, else it is the route's
 function describe(es){if(!es.length)return Promise.resolve();
  return api(R+'describe',body({pairs:es.map(function(e){return e.p})})).then(function(j){arr(j,'pairs').forEach(function(d,i){var e=es[i];if(!e||!d)return;if(d.id){e.id=String(d.id);e.p.id=e.id}if(d.text&&!unitOf(e.p.shooter))e.text=String(d.text)});draw()},function(e){fail(e,'describe');draw()})}
 function add(rev){var a=sh.inp.value.trim(),b=tg.inp.value.trim();if(!a){say('err',tx('pp.needShooter'));return}if(rev&&!b){say('err',tx('pp.needTarget'));return}
  var q=rev?{shooter:b,foe:a}:b?{shooter:a,foe:b}:{shooter:a};say('hint',tx('pp.asking'));
  api(R+'suggest',body(q),{what:tx('pp.job.suggest')}).then(function(j){var p=j&&j.pair?j.pair:j;if(!p||typeof p!=='object'||!p.shooter){say('err',tx('pp.noPair'));return}
   var e=entry(p);if(!e.id&&j&&j.id)e.id=String(j.id);if(j&&j.text)e.text=String(j.text);L().push(e);sh.kit.remember(a);if(b)tg.kit.remember(b);say('ok',tx('pp.added',{id:e.id||p.shooter}));draw();return describe([e])},function(e){fail(e,'suggest')})}
 var flt=h('input',{type:'text',autocomplete:'off','aria-label':tx('pp.filter'),title:tx('pp.filterT'),placeholder:tx('pp.filter'),'data-pp':'filter'}),cnt=h('span',{class:'hint','data-ppcount':'1'});
 function lo(e){return (e.id+' '+(e.text||local(e.p))+' '+e.p.shooter+' '+(e.p.foe||'')).toLowerCase()}
 var fKit=searchKit(flt,{key:'test.pairs.filter',beside:true,index:function(q,done){q=String(q||'').toLowerCase();done(L().filter(function(e){return !q||lo(e).indexOf(q)>=0}).map(function(e){return {label:e.text||local(e.p),value:e.id||e.p.shooter,hint:e.id}}),0)},
  browse:{mode:'file',view:'data',start:'entity',exts:['def'],toValue:stem}});
 flt.addEventListener('input',function(){draw()});
 function sw(e,k,lab,tip){var c=h('input',{type:'checkbox','data-ppsw':k,'aria-label':tx(lab)});c.checked=!!e.p[k];c.addEventListener('change',function(){e.p[k]=!!c.checked;e.st=null;e.text='';draw();describe([e])});return h('label',{title:tx(tip)},[c,' '+tx(lab)])}
 function line(e){var p=e.p,d=h('input',{type:'number',min:'1',step:'1','aria-label':tx('pp.dist'),title:tx('pp.distT'),style:'width:5em','data-ppdist':'1'});d.value=String(met(p));
  d.addEventListener('change',function(){var v=Number(d.value);if(!(v>0)){d.value=String(met(p));return}p.dist=Math.round(v*20);e.st=null;e.text='';draw();describe([e])});
  var kids=[h('b',{'data-ppid':'1',text:e.id||tx('pp.noId'),title:tx('pp.idT')}),h('span',{'data-pptext':'1',text:e.text||local(p)}),h('label',{title:tx('pp.distT')},[tx('pp.dist')+' ',d,' '+tx('pp.m')]),sw(e,'foeFire','pp.foeFire','pp.foeFireT'),sw(e,'watch','pp.watch','pp.watchT')];
  if(e.st)kids.push(h('span',{class:/^(ok|pass|ready)$/i.test(e.st.status)?'ok':'err','data-ppst':'1',text:e.st.status+(e.st.note?': '+e.st.note:'')}));
  kids.push(h('button',{type:'button','data-pprm':'1',text:tx('pp.remove'),title:tx('pp.removeT'),onclick:function(){var a=L(),i=a.indexOf(e);if(i>=0)a.splice(i,1);draw()}}));
  return h('div',{class:'row','data-pair':e.id||''},kids)}
 function draw(){var a=L(),q=flt.value.trim().toLowerCase(),n=0;list.textContent='';
  a.forEach(function(e){if(q&&lo(e).indexOf(q)<0)return;n++;list.appendChild(line(e))});
  if(!a.length)list.appendChild(h('div',{class:'hint',text:tx('pp.empty')}));else if(!n)list.appendChild(h('div',{class:'hint',text:tx('pp.none')}));
  cnt.textContent=a.length?tx(q?'pp.countF':'pp.count',{n:a.length,m:n}):''}
 function check(){var a=L().slice();if(!a.length){say('err',tx('pp.needPairs'));return}say('hint',tx('pp.checking'));
  api(R+'check',body({pairs:a.map(function(e){return e.p})}),{what:tx('pp.job.check')}).then(function(j){var rs=arr(j,'pairs'),bad=0;
   a.forEach(function(e,i){var r=rs[i];if(e.id)for(var k=0;k<rs.length;k++)if(rs[k]&&rs[k].id===e.id){r=rs[k];break}if(!r){e.st=null;return}
    e.st={status:String(r.status||''),note:[].concat(r.notes||[],r.warns||[]).map(String).join('; ')};if(!/^(ok|pass|ready)$/i.test(e.st.status))bad++});
   draw();say(bad?'err':'ok',tx(bad?'pp.checkedBad':'pp.checked',{n:a.length,m:bad}))},function(e){fail(e,'check')})}
 var nameIn=h('input',{type:'text',autocomplete:'off','aria-label':tx('pp.name'),title:tx('pp.nameT'),placeholder:tx('pp.name'),'data-pp':'name'});
 function save(){var a=L(),n=nameIn.value.trim();if(!a.length){say('err',tx('pp.needPairs'));return}if(!n){say('err',tx('pp.needName'));if(nameIn.focus)nameIn.focus();return}if(!S.mod){say('err',tx('pp.needMod'));return}
  api(R+'lib',body({op:'save',name:n,pairs:a.map(function(e){return e.p})}),{what:tx('pp.job.save')}).then(function(j){var p=j&&(j.path||j.file)||'';if(p&&onSaved)onSaved(p);say('ok',tx(p?'pp.saved':'pp.savedNoPath',{name:n,path:p}));loadLib()},function(e){fail(e,'lib')})}
 function use(f){function go(){api(R+'lib',body({op:'get',name:f.name})).then(function(j){var ps=arr(j,'pairs');BY[GID]=ps.map(entry);nameIn.value=f.name;var p=(j&&j.path)||f.path||'';if(p&&onSaved)onSaved(p);say('ok',tx('pp.loaded',{name:f.name,n:ps.length}));draw();return describe(L().slice())},function(e){fail(e,'lib')})}
  if(L().length)askDo({title:tx('pp.load'),lines:[tx('pp.loadQ',{name:f.name})]}).then(function(y){if(y)go()});else go()}
 function drop(f){askDo({title:tx('pp.del'),lines:[tx('pp.delQ',{name:f.name})],danger:true}).then(function(y){if(!y)return;api(R+'lib',body({op:'remove',name:f.name})).then(function(){say('ok',tx('pp.deleted',{name:f.name}));loadLib()},function(e){fail(e,'lib')})})}
 // the saved pairs files of this mod (the state folder of the mod): asked at the page's first show and after a save, a remove, a mod or game change
 function loadLib(){libSig=sig();var s=libSig;saved.className='';saved.textContent='';delete saved.dataset.gone;if(!S.mod){saved.appendChild(h('div',{class:'hint',text:tx('pp.needMod')}));if(onLib)onLib(null);return}
  api(R+'lib?mod='+encodeURIComponent(S.mod)).then(function(j){if(s!==libSig)return;var fs=arr(j,'files');if(onLib)onLib({dir:j&&j.dir||'',files:fs});saved.textContent='';if(!fs.length){saved.appendChild(h('div',{class:'hint',text:tx('pp.noSaved')}));return}
   fs.forEach(function(f){if(typeof f==='string')f={name:f};var n=f.count!=null?f.count:Array.isArray(f.pairs)?f.pairs.length:f.pairs!=null?f.pairs:f.n;
    saved.appendChild(h('div',{class:'row','data-ppfile':f.name},[h('b',{text:f.name}),h('span',{class:'hint',text:n!=null?tx('pp.fileN',{n:n}):''}),
     h('button',{type:'button','data-ppload':'1',text:tx('pp.load'),title:tx('pp.loadT'),onclick:function(){use(f)}}),h('button',{type:'button','data-ppdel':'1',text:tx('pp.del'),title:tx('pp.delT'),onclick:function(){drop(f)}})]))})},
   function(e){if(s!==libSig)return;saved.textContent='';fail(e,'lib',saved);if(onLib)onLib(null)})}
 var bAdd=h('button',{type:'button',class:'primary','data-ppadd':'1',text:tx('pp.add'),title:tx('pp.addT'),onclick:function(){add(false)}}),
  bRev=h('button',{type:'button','data-pprev':'1',text:tx('pp.rev'),title:tx('pp.revT'),onclick:function(){add(true)}}),
  bChk=h('button',{type:'button','data-ppcheck':'1',text:tx('pp.check'),title:tx('pp.checkT'),onclick:check}),
  bSave=h('button',{type:'button','data-ppsave':'1',text:tx('pp.save'),title:tx('pp.saveT'),onclick:save}),gohLine=h('div',{class:'hint',blk:'pairs.goh',text:tx('pp.goh')});
 var el=card('pairs',[blk('pairs.title',[h('h3',{text:tx('pp.title')})]),h('div',{class:'hint',blk:'pairs.intro',text:tx('pp.intro')}),gohLine,sh.el,tg.el,h('div',{class:'row',blk:'pairs.add'},[bAdd,bRev]),blk('pairs.state',[st],{name:tx('pp.blk.state')}),
  h('div',{class:'row',blk:'pairs.filter','data-blkname':tx('pp.filter')},[fKit.el,cnt]),blk('pairs.list',[list],{name:tx('pp.blk.list')}),
  h('div',{class:'row',blk:'pairs.acts','data-blkname':tx('pp.save')},[bChk,nameIn,bSave]),blk('pairs.savedh',[h('b',{text:tx('pp.savedH')})]),blk('pairs.saved',[saved],{name:tx('pp.savedH')})],{attrs:{'data-card':'pairs'}});
 draw();
 return {el:el,init:function(){loadLib()},refresh:function(){gohLine.hidden=curGame().kind!=='goh';marks();draw();if(libSig!==null&&libSig!==sig())loadLib()}}}
function screenTest(root){
 var dry=runCard({cmd:'edrun',title:'ed.title',intro:'ed.intro',hide:['dry','root','exe','pipe','noPipe','ratio','fog','runId','map','inst','speed','mods','secs','check','noCheck'],presets:{pairs:'',out:''},
  buttons:[{label:'ed.dry',primary:true,extra:{dry:true}},{label:'ed.run',launch:true,extra:{dry:false},danger:true,confirm:'ed.confirm'}],view:viewEdrun,auto:{game:function(){return S.gameOv}},
  beforeRun:function(c,input){var x=testExe('ed');if(x){input.exe=x;input.dry=true}}});
 var pr=runCard({cmd:'prove',title:'pv.title',intro:'pv.intro',presets:{},hide:['plan','kind','mods','side','target','map','hold','stageAs','exe','control','controlRep','depth','games','enemy','tiny','addCards','units'],
  buttons:[{label:'pv.plan',primary:true,extra:{plan:true}},{label:'ed.run',launch:true,danger:true,extra:{plan:false},confirm:'pv.confirm'}],view:viewTree('pv.result'),auto:{game:function(){return gameDir()}},
  precheck:proveCheck,beforeRun:function(c,input){var x=testExe('pv',input.game);if(x){input.exe=x;input.plan=true}}});
 // The pairs file and the out folder of the edrun card fill themselves and say what they want (owner 2026-11-21: "pairs need to auto
 // fill and describe what file you are looking for"). Order for the pairs file: the file the picker just saved or loaded; else the newest
 // saved pairs file of this mod (GET pairs/lib: files[].mtimeMs); else the first game file Test Plan wrote (<state>/run/edrun/g1.json,
 // state = the folder above the lib's dir, seen with GET /api/ls); else empty. A value the user typed or picked (dataset.manual, not
 // empty) is never replaced: a line says so and offers the saved file. The line under the field names where the value came from.
 // The out folder fills with <state>/run/test-run. A picked or typed file is looked at with GET /api/peek: not a pairs file = one plain line.
 var pin=dry.form.inputs.pairs,oin=dry.form.inputs.out,PF={ready:null,state:'',dir:'',files:[],saved:{},seq:0,chk:0};
 var SRC={saved:'ed.src.saved',lib:'ed.src.lib',plan:'ed.src.plan',typed:'ed.src.typed',keep:'ed.src.keep',none:'ed.src.none',nomod:'ed.src.nomod'};
 var pDesc=h('div',{class:'hint','data-pairdesc':'1'}),pSrc=h('div',{class:'hint','data-pairsrc':'1'}),pBad=h('div',{class:'err','data-pairbad':'1',hidden:true}),
  oDesc=h('div',{class:'hint','data-outdesc':'1',text:tx('ed.outDesc')}),oSrc=h('div',{class:'hint','data-outsrc':'1'});pBad.hidden=true;
 function under(inp,kids){var r=inp;while(r&&!(r.dataset&&r.dataset.f))r=r.parentNode;var p=r&&r.parentNode;if(p)kids.forEach(function(k){p.appendChild(k)})}
 function sgn(){return GID+'|'+(S.mod||'')}
 function fillable(i){return !!i&&!(i.dataset.manual==='1'&&String(i.value||'').trim())}
 function put(i,v){i.value=v;delete i.dataset.manual;if(v)i.dataset.auto='1';else delete i.dataset.auto;if(i.classList)i.classList.remove('bad')}
 function src(key,name){pSrc.textContent='';pSrc.dataset.src=key||'';if(!key)return;pSrc.appendChild(h('span',{text:tx(SRC[key],{name:name||''})}));
  if(key==='keep')pSrc.appendChild(h('button',{type:'button',class:'link','data-pairuse':'1',text:tx('ed.src.use'),onclick:function(){var sv=PF.saved[sgn()];if(sv){put(pin,sv);src('saved',baseOf(sv));pBad.hidden=true}}}))}
 function desc(){pDesc.textContent=tx('ed.pairsDesc')+' '+(PF.dir?tx('ed.pairsDir',{dir:PF.dir}):tx('ed.pairsDirNone'))}
 function fillOut(){if(!oin||!fillable(oin))return;var v=PF.state?join(join(PF.state,'run'),'test-run'):'';put(oin,v);oSrc.textContent=v?tx('ed.outSrc'):''}
 function fillPairs(){if(!pin)return;var sv=PF.saved[sgn()]||'',s=++PF.seq;
  if(!fillable(pin)){var k=sv&&npath(sv)!==npath(pin.value)?'keep':'typed';if(pSrc.dataset.src!==k||k==='keep')src(k,baseOf(sv));return}
  pBad.hidden=true;if(sv){put(pin,sv);src('saved',baseOf(sv));return}
  var nw=null;PF.files.forEach(function(x){if(x&&x.path&&(!nw||(x.mtimeMs||0)>(nw.mtimeMs||0)))nw=x});
  if(nw){put(pin,nw.path);src('lib',nw.name||baseOf(nw.path));return}
  if(!PF.state){put(pin,'');src(S.mod?'none':'nomod');return}
  var d=join(join(PF.state,'run'),'edrun'),num=function(n){return Number(/\d+/.exec(n)[0])};
  api('/api/ls?dir='+encodeURIComponent(d)+'&files=1').then(function(j){return (j&&j.files||[]).filter(function(n){return /^g\d+\.json$/i.test(n)}).sort(function(a,b){return num(a)-num(b)})},function(){return []})
   .then(function(a){if(s!==PF.seq||!fillable(pin))return;if(a.length){put(pin,join(d,a[0]));src('plan',a[0])}else{put(pin,'');src('none')}})}
 // what the saved list answered (null: no mod, or the route is not there): a saved file that is gone from the list is forgotten
 function onLib(j){PF.ready=sgn();PF.dir=j&&j.dir||'';PF.state=PF.dir?parentOf(PF.dir):'';PF.files=j&&j.files||[];
  var sv=PF.saved[PF.ready];if(sv&&j&&!PF.files.some(function(x){return x&&x.path&&npath(x.path)===npath(sv)}))delete PF.saved[PF.ready];desc();fillPairs();fillOut()}
 // a pairs file is a JSON list of objects that each name a shooter and a foe (a {pairs:[..]} wrapper counts too). GET /api/peek gives the
 // first 40 lines: a short file is parsed whole, a long one is judged by how it starts
 function isPairs(j){var ls=j&&j.lines||[],t=ls.map(function(l){return l.text}).join('\n'),whole=j.total<=ls.length&&!ls.some(function(l){return l.text.length>=400});
  if(!whole)return /^\s*(\{\s*"pairs"\s*:\s*)?\[\s*\{/.test(t)&&/"shooter"\s*:/.test(t);
  try{var a=JSON.parse(t);if(a&&!Array.isArray(a))a=a.pairs;return Array.isArray(a)&&a.length>0&&a.every(function(p){return !!p&&typeof p==='object'&&typeof p.shooter==='string'&&typeof p.foe==='string'})}catch(e){return false}}
 function chkPairs(){if(!pin)return;var v=String(pin.value||'').trim(),s=++PF.chk;pBad.hidden=true;pBad.textContent='';if(!v)return;
  function no(key){if(s!==PF.chk)return;pBad.textContent=tx(key,{file:v});pBad.hidden=false;if(pin.classList)pin.classList.add('bad')}
  if(!/\.json$/i.test(v)){no('ed.pairsBad');return}
  api('/api/peek?path='+encodeURIComponent(v)).then(function(j){if(!isPairs(j))no('ed.pairsBad')},function(e){no(e&&e.status===404?'ed.pairsMissing':'ed.pairsBad')})}
 if(pin){under(pin,[pDesc,pSrc,pBad]);desc();src(S.mod?'none':'nomod');pin._start=function(){return PF.files.length?PF.dir:''};
  var typed=function(){delete pin.dataset.auto;src(String(pin.value||'').trim()?'typed':'')};
  pin.addEventListener('input',function(){typed();pBad.hidden=true});pin.addEventListener('change',chkPairs);pin._after=function(){typed();chkPairs()}}
 if(oin){under(oin,[oDesc,oSrc]);var oTyped=function(){delete oin.dataset.auto;oSrc.textContent=''};oin.addEventListener('input',oTyped);oin._after=oTyped}
 var pk=pairsCard(function(p){PF.saved[sgn()]=p;fillPairs()},onLib);
 // game parity: under MoW:AS2 a real editor run and a real prove run need their own instance and the control pipe (TST-19): edrun and prove
 // refuse them with exit 2, so the page keeps only the dry run and the plan there and says why in one line on each card. Under GoH neither
 // card can run at all (the GoH editor never starts the mission by itself; GoH has no control pipe): the cards stay, each with its line
 // and no buttons; the picker works there too, its saved pairs file is the list the player goes through
 var edNa=naBox('edrun.na',tx('ed.title')),pvNa=naBox('prove.na',tx('pv.title'));blkPut(dry.el,edNa.el,dry.btns);blkPut(pr.el,pvNa.el,pr.btns);
 function perGame(){var m=GID==='mowas2',g=curGame().kind==='goh';edNa.set(m?'na.test.edrun.mowas2':g?'na.test.edrun.goh':'');pvNa.set(m?'na.test.prove.mowas2':g?'na.test.prove.goh':'');
  [dry,pr].forEach(function(c){c.buttons.forEach(function(b,i){b.hidden=g||(m&&i===1)})})}
 root.appendChild(blk('title',[h('h2',{text:tx('ed.h2')})]));root.appendChild(h('div',{class:'card who',blk:'who'},[h('b',{text:tx('who.h')}),h('div',{text:tx('ed.who')})]));root.appendChild(pk.el);[dry,pr].forEach(function(c){root.appendChild(c.el)});
 return {refresh:function(){perGame();pk.refresh();dry.refresh();pr.refresh();if(PF.ready===sgn()){fillPairs();fillOut()}},init:function(){pk.init()}}}


// 6 Translate. The tool (goh2as2 --ask-json) prints one question per line and reads one answer line:
//   {"xlate":"question","v":1,"id","unit","key","class","stage":"engine|scale","goh","translated","range":{"p5","p95"},"scaled","donor","default","choices":["scale","translated","donor"],"rest_of_class":true}
//   {"id","choice","rest"}   rest:true = same choice for the rest of that class AND stage (the tool keeps it)
function xChoices(q){var c=q.choices&&q.choices.length?q.choices:['scale','translated','donor'];
 var M={scale:[tx('x.scale'),q.scaled,tx('x.scaleM')],translated:[tx('x.translated'),q.translated,tx('x.translatedM')],donor:[tx('x.donor'),q.donor,tx('x.donorM')]};
 return c.map(function(id){var m=M[id]||[id,'',''];return {id:id,label:m[0]+(m[1]==null||m[1]===''?'':': '+m[1]),meaning:m[2]}})}
// Translate numbers (W5: no page of its own; the GoH unit page mounts it as a fold where goh2as2 runs): xlateCard(opt) -> {el, card, refresh, keys(e)}.
// opt.auto = {field: fn} on top of game and goh. The host page calls refresh on its own refresh and passes its keys(e) on (the shell asks the current screen)
function xlateCard(opt){opt=opt||{};
 var qs=[],cur=null,panel=h('div'),rest=false;
 function ask(){panel.textContent='';if(!qs.length&&!cur){return}
  if(!cur)cur=qs.shift();var q=cur,opts=xChoices(q),dflt=q.default,rg=q.range||{};
  var chk=h('input',{type:'checkbox',id:'xrest','aria-label':tx('x.rest',{cls:q.class||'',stage:q.stage||''})});chk.checked=rest;chk.onchange=function(){rest=chk.checked};
  var line=function(a,b,c){return h('tr',{},[h('td',{class:'nw',text:a}),h('td',{class:'nw',text:b==null?'none':String(b)}),h('td',{class:'hint',text:c})])};
  var p=h('div',{class:'q-panel',role:'alertdialog','aria-label':tx('x.aria')},[
   h('b',{text:tx('x.question',{unit:q.unit||'?',key:q.key||'?',cls:q.class||'?',stage:q.stage||'?'})}),h('div',{text:q.stage==='engine'||q.stage==='scale'?tx('x.stage.'+q.stage):''}),
   h('table',{},[line(tx('x.l.goh'),q.goh,tx('x.l.gohM')),line(tx('x.translated'),q.translated,tx('x.l.transM')),
    line(tx('x.l.range'),(rg.p5==null?'?':rg.p5)+' .. '+(rg.p95==null?'?':rg.p95),tx('x.l.rangeM',{cls:q.class||'?'})),
    line(tx('x.scale'),q.scaled,tx('x.l.scaleM')),line(tx('x.donor'),q.donor,tx('x.l.donorM'))]),
   h('div',{class:'hint',text:qs.length?tx('x.waiting',{n:qs.length}):''}),
   h('div',{class:'opts'},opts.map(function(o,i){return h('button',{type:'button',class:o.id===dflt?'dflt':'',title:o.meaning,text:(i+1)+'. '+o.label+' - '+o.meaning+(o.id===dflt?'  '+tx('x.default'):''),onclick:function(){answer(o.id)}})})),
   h('label',{},[chk,' '+tx('x.rest',{cls:q.class||tx('x.thisclass')})])]);
  panel.appendChild(p);var f=p.querySelector('button.dflt')||p.querySelector('button');if(f)f.focus()}
 function answer(choice){if(!cur||!RUN||!RUN.id){toast(tx('x.gone'));cur=null;panel.textContent='';return}
  var q=cur;api('/api/answer',{id:RUN.id,answer:{id:q.id,choice:choice,rest:rest}}).then(function(){card.log.add('o',tx('x.answered',{id:q.id,choice:choice})+(rest?' '+tx('x.answeredRest',{cls:q.class||'class',stage:q.stage||''}):''),'q')}).catch(function(e){toast(tx('x.failed',{m:e.message}));card.log.add('e',tx('x.failed',{m:e.message}))});
  cur=null;rest=false;panel.textContent='';if(qs.length)ask()}
 var card=runCard({cmd:'translate',title:'tr.title',intro:'tr.intro',
  presets:{askJson:true},hide:['keys','nation','noKeylint','quiet'],
  buttons:[{label:'tr.go',primary:true},{label:'tr.noask',extra:{askJson:false,noAsk:true},title:'tr.noaskT'}],
  view:viewTree('tr.result'),auto:{game:function(){return S.gameOv},goh:function(){return gohDir()},exe:function(){return GID==='mowas2'?'mowas_2':''}},   // exe: the AS2 game the lookup reads (empty = the tool's own pick, as64 first); the user may pick mowas_2
  beforeRun:function(c,input){qs=[];cur=null;panel.textContent=''},
  onLine:function(c,k,t){if(k==='o'&&t.charAt(0)==='{'){var o;try{o=JSON.parse(t)}catch(e){return false}
    if(o&&o.xlate==='question'){c.log.add('o',tx('x.logq',{unit:o.unit||'',key:o.key||'',stage:o.stage||'',goh:o.goh,tr:o.translated,sc:o.scaled,donor:o.donor,def:o.default}),'q');qs.push(o);if(!cur)ask();return true}
    if(o&&o.xlate){c.log.add('o',t,'q');return true}}return false},
  after:function(){qs=[];cur=null;panel.textContent=''}});
 blkPut(card.el,blk('translate.ask',[panel]),card.btns);   // the card's own button row (a querySelector('.row') could find a row nested in the form)
 card.buttons.forEach(function(b){delete b.dataset.primary});   // Ctrl+Enter stays with the host page's own main button
 var box=h('div',{blk:'translate.box',box:'col'},[h('div',{class:'hint',blk:'translate.who',text:tx('tr.who')}),card.el,h('div',{class:'hint',blk:'translate.how'},[h('b',{text:tx('tr.how')+' '}),h('span',{text:tx('tr.howT')})])]);
 // every container carries a name (Arrange shows it; ext pages check it)
 (function nm(e){if(e.classList&&e.classList.contains('blc')&&!e.getAttribute('data-blkname'))e.setAttribute('data-blkname',tx(/\.more$/.test(e.getAttribute('data-blk')||'')?'form.more':'tr.title'));for(var i=0;i<(e.children||[]).length;i++)nm(e.children[i])})(box);
 // opt.auto {field: fn}: fills a field that is empty or still holds what was filled last (a value the user typed is kept); null = leave it
 var ao=opt.auto||{},filled={};
 function refresh(){card.refresh();Object.keys(ao).forEach(function(n){var i=card.form.inputs[n],v=ao[n]();if(!i||v==null)return;v=String(v);if(i.value===''||i.value===filled[n]){i.value=v;filled[n]=v}})}
 return {el:box,card:card,refresh:refresh,keys:function(e){if(!cur||/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)&&document.activeElement.id!=='xrest')return false;var q=cur,opts=xChoices(q);
   if(/^[1-9]$/.test(e.key)&&opts[+e.key-1]){answer(opts[+e.key-1].id);return true}
   if(e.key==='Enter'&&q.default&&!/^(BUTTON|TEXTAREA|INPUT)$/.test(document.activeElement.tagName)){answer(q.default);return true}
   if(e.key==='r'||e.key==='R'){var c=$('xrest');if(c&&document.activeElement.tagName!=='INPUT'){c.checked=!c.checked;rest=c.checked;return true}}return false}}}
if(typeof window!=='undefined')window.xlateCard=xlateCard;

// ---------- Settings (Tools & Settings > Settings): the Advanced switch with what it adds in this game, Arrange for a chosen page, where
// the window settings are kept. Theme and language stay in the header. Every part is a block.
function screenSettings(root){
 var ac=h('input',{type:'checkbox','aria-label':tx('adv.label'),onchange:function(){advSet(ac.checked)}});
 var addH=h('b'),adds=h('ul',{'data-advadds':'1'});
 root.appendChild(blk('title',[h('h2',{text:tx('nav.settings')})]));
 root.appendChild(blk('lead',[h('div',{'class':'hint',text:tx('stg.lead')})]));
 // the game folder of the current game (moved here from the header, 2026-11-19; drawGameInfo fills it, the header warning opens it)
 GINFO={el:h('div',{id:'gameinfo'}),h:h('h3',{id:'gameinfoh',text:tx('stg.game.h',{g:curGame().name})})};
 root.appendChild(card('game',[blk('game.h',[GINFO.h]),blk('game.p',[h('div',{'class':'hint',text:tx('stg.game.p')})]),blk('game.info',[GINFO.el])],{attrs:{id:'gamebox'}}));
 root.appendChild(card('adv',[blk('adv.h',[h('h3',{text:tx('adv.label')})]),blk('adv.sw',[h('label',{id:'advbox',title:tx('adv.hint')},[ac,' '+tx('stg.adv.sw')])]),
  blk('adv.p',[h('div',{'class':'hint',text:tx('stg.adv.p')})]),blk('adv.list',[addH,adds])]));
 var pick=h('select',{id:'arrpage','aria-label':tx('stg.arr.page')});
 var go=h('button',{type:'button',id:'arrgo','class':'primary',text:tx('blk.title'),onclick:function(){var p=pick.value;if(!S.sec[p])p=firstPage();show(p);blkArrange(true)}});
 root.appendChild(card('arr',[blk('arr.h',[h('h3',{text:tx('blk.switch')})]),blk('arr.p',[h('div',{'class':'hint',text:tx('blk.switchT')})]),fld('arr.pick',tx('stg.arr.page'),pick,{after:go})],{attrs:{id:'arrbox'}}));
 var where=h('div',{'class':'hint'});
 root.appendChild(card('where',[blk('where.h',[h('h3',{text:tx('stg.where.h')})]),blk('where.p',[where])]));
 // reset: the picker goes back to the page shown before Settings (on each visit); else it keeps the user's choice when it is still there
 function fill(reset){ac.checked=advOn();
  addH.textContent=tx('stg.adv.adds',{g:curGame().name});adds.textContent='';
  TABS.forEach(function(t){t.subs.forEach(function(s){s.refs.forEach(function(r){if(refAdv(r))adds.appendChild(h('li',{text:pagePath(r)}))})})});
  // the folds: every upgrade setting on Upgrade or Port (not under GoH, where that fold is always open) and the expert options on Check
  adds.appendChild(h('li',{text:tx(INGAME.upgrade&&curGame().kind!=='goh'?'stg.adv.foldsU':'stg.adv.folds')}));
  // the Editor's Code Pieces pane shows its not-tried pieces only with Advanced
  if(INGAME.ide)adds.appendChild(h('li',{text:tx('stg.adv.kit',{p:pagePath('ide')})}));
  var keep=pick.value,ps=shownPages(),dflt=S.prev&&ps.indexOf(S.prev)>=0?S.prev:firstPage();
  pick.textContent='';ps.forEach(function(p){pick.appendChild(h('option',{value:p,text:pageOnlyPath(p)}))});pick.value=reset||ps.indexOf(keep)<0?dflt:keep;
  where.textContent=SETFILE?tx('stg.file',{file:SETFILE}):tx('stg.fileNone');drawGameInfo()}
 fill(true);
 return {refresh:function(){fill(true)},fill:function(){fill(false)}}}

// ---------- shell ----------
function advOn(){return !!LS.get('adv',false)}
// header lock (Settings): on by default, the header with its tab rows stays in view while the page scrolls; off, it scrolls away
// the header lock (the Floating Header box in the header, #hdlockhd): on unless set off. Kept like every window setting (LS: the server file, so it survives a new port,
// and this origin's localStorage, read first at load so the header does not jump while the settings are on their way)
function hdLock(){return LS.get('hdlock',true)!==false}
function applyHdLock(){try{var bd=document.body;if(hdLock())bd.classList.remove('hdfree');else bd.classList.add('hdfree')}catch(e){}var b=$('hdlockhd'),c=b&&b.querySelector('input');if(c)c.checked=hdLock()}
// W5 GUI-TABS, nine-tab layout (2026-11-13): tools/gui/groups.js is the one table, tab > sub-tabs > refs (a ref = a page id or page/view,
// e.g. docs/engine). The header shows the three games; the tab row the current game's tabs only (a page that does not work for a game is
// not shown under it, not greyed); the sub-tab row (#subnav) shows when the tab has two or more sub-tabs on show; the third row
// (#pagenav, the last row of the sticky header) when the sub-tab has two or more items on show. The tab label always comes from
// the table. A ref whose page does not exist (yet) is dropped, so it never makes a tab, sub-tab or item.
// TABS = the current game's tabs in order ({id,key,label,subs:[{id,label,refs}],pages}), TABOF = page id to its tab, INGAME = the pages
// this game shows. A tab opens the item last used in it (sub.<tab>), a sub-tab the item last used in it (sub.<tab>-<sub>).
// Alt+key comes from the table (GT-27), never from the position; on the open tab it steps through its sub-tabs (one sub-tab: its items).
// Advanced (advOn) only adds items: ADV pages (core and ext adv:true, unless the game opens them) and ADVREF refs. It never adds a tab.
// A page with views has view(v) (show calls it) and tells the shell its own view changes with viewSet(page,v).
// NA = the pages this game lists but cannot run (groups.js game.na {page: reason lang key}): such a page keeps its place in the tabs, show()
// hides every screen and puts naCard(reason) in #nabox. An NA page is not in INGAME, so no "go to" button and no next step leads to it, and
// show() of it never switches to another game (gameFor skips a game where the page is NA).
var TABS=[],TABOF={},NAVK={},INGAME={},NA={},ADVREF=__ADVREF__;
function inNav(p){return !!INGAME[p]||!!NA[p]}
// naCard(key, params): one card "Not available in <game>: <reason>" (reason = tx(key, params)). Ext pages may use it for a card of their own
function naCard(key,params){return h('div',{class:'card','data-na':key||''},[h('b',{text:tx('na.line',{g:curGame().name,why:tx(key,params)})})])}
if(typeof window!=='undefined')window.naCard=naCard;
// game parity: a read-only look inside for the tests (test-gui2.js): the game table, the per-game state, the nav maps and a few calls
if(typeof window!=='undefined')window.__as2in={get GAMES(){return GAMES},get GS(){return GS},get INGAME(){return INGAME},get NA(){return NA},
 buildNav:function(){return buildNav()},gameFor:function(i){return gameFor(i)},show:function(i,v){return show(i,v)},setMod:function(p){return setMod(p)},refreshAll:function(){return refreshAll()},api:function(u,b,o){return api(u,b,o)},streamRun:function(c,i,on,t){return streamRun(c,i,on,t)},gq:gq,naCard:naCard,mkLog:function(){return mkLog()},modInfo:function(p){return modInfo(p)}};
function isAdv(p){return !!ADV[p]&&curGame().open.indexOf(p)<0}
function refPg(r){return String(r||'').split('/')[0]}
function refVw(r){r=String(r||'');var i=r.indexOf('/');return i<0?'':r.slice(i+1)}
function refAdv(r){return ADVREF.indexOf(r)>=0||isAdv(refPg(r))}
function refOn(r){return !refAdv(r)||advOn()}
// an item's name: <page>.view.<view> for a view (the page's own name until that key exists), else the page's nav key
function refLabel(r){var p=refPg(r),v=refVw(r);if(v){var k=p+'.view.'+v,s=tx(k);if(s!==k)return s}return tx(NAVK[p]||p)}
function buildTabs(){TABS=[];TABOF={};INGAME={};NA={};NAMES.forEach(function(n){NAVK[n[0]]=n[1]});var any={},na=curGame().na||{};
 GAMES.forEach(function(g){g.tabs.forEach(function(t){t.pages.forEach(function(p){any[p]=1})})});
 curGame().tabs.forEach(function(g){var t={id:g.id,key:g.key||'',label:g.label,subs:[],pages:[]};
  (g.subs||[]).forEach(function(s){var rs=(s.pages||[]).filter(function(r){return !!NAVK[refPg(r)]});if(!rs.length)return;t.subs.push({id:s.id,label:s.label,refs:rs});
   rs.forEach(function(r){var p=refPg(r);if(t.pages.indexOf(p)<0)t.pages.push(p);if(!TABOF[p])TABOF[p]=t;if(na.hasOwnProperty(p)&&na[p])NA[p]=String(na[p]);else INGAME[p]=1})});
  if(t.subs.length)TABS.push(t)});
 // a page in no game's list (a new ext page) gets a tab of its own under every game, so it is never lost
 NAMES.forEach(function(n){if(!any[n[0]]&&!TABOF[n[0]]){var t={id:n[0],key:'',label:n[1],subs:[{id:n[0],label:n[1],refs:[n[0]]}],pages:[n[0]]};TABS.push(t);TABOF[n[0]]=t;INGAME[n[0]]=1}})}
function tabById(id){for(var i=0;i<TABS.length;i++)if(TABS[i].id===id)return TABS[i];return null}
function subRefs(s){return s.refs.filter(refOn)}
function tabSubs(t){return t.subs.filter(function(s){return subRefs(s).length>0})}
function tabPages(t){var o=[];tabSubs(t).forEach(function(s){subRefs(s).forEach(function(r){var p=refPg(r);if(o.indexOf(p)<0)o.push(p)})});return o}
// where page p (in view v) sits: {t,s,r}; the ref of that view first, else the page's plain ref, else its first ref
function locOf(p,v){var t=TABOF[p],best=null;if(!t)return null;
 t.subs.forEach(function(s){s.refs.forEach(function(r){if(refPg(r)!==p)return;var sc=v&&r===p+'/'+v?3:r===p?2:1;if(!best||sc>best.sc)best={t:t,s:s,r:r,sc:sc}})});return best}
function curLoc(){return S.cur?locOf(S.cur,S.view[S.cur]):null}
// a page's place as words: tab > sub-tab > item, each part only where the table has a choice there, a repeated name once
function pagePath(r){var L=locOf(refPg(r),refVw(r)||S.view[refPg(r)]);if(!L)return refLabel(r);return pathOf(L,L.s.refs.length>1?refLabel(L.r):'')}
function pathOf(L,item){var o=[];[tx(L.t.label),L.t.subs.length>1?tx(L.s.label):'',item].forEach(function(x){if(x&&o[o.length-1]!==x)o.push(x)});return o.join(' > ')}
// a whole page, not one view (Arrange works per page): a page placed only by its views is named by the tab > sub-tab of its first ref
function pageOnlyPath(p){var L=locOf(p,'');if(!L)return refLabel(p);return pathOf(L,L.r===p&&L.s.refs.length>1?refLabel(p):'')}
function goRef(r){show(refPg(r),refVw(r)||null)}
function refIn(t,r){return tabSubs(t).some(function(s){return subRefs(s).indexOf(r)>=0})}
function openSub(t,s){var rs=subRefs(s);if(!rs.length)return;var last=LS.get('sub.'+t.id+'-'+s.id,'');goRef(rs.indexOf(last)>=0?last:rs[0])}
function openTab(t){var ss=tabSubs(t);if(!ss.length)return;var last=LS.get('sub.'+t.id,'');if(typeof last==='string'&&refIn(t,last)){goRef(last);return}openSub(t,ss[0])}
function tabKey(t){var ss=tabSubs(t),L=curLoc();if(!ss.length)return false;
 if(L&&L.t===t){if(ss.length>1){openSub(t,ss[(ss.indexOf(L.s)+1)%ss.length]);return true}
  var rs=subRefs(ss[0]);if(rs.length>1){goRef(rs[(rs.indexOf(L.r)+1)%rs.length]);return true}}
 openTab(t);return true}
// the page shown is remembered for its tab and for its sub-tab
function subKeep(){var L=curLoc();if(!L)return;LS.set('sub.'+L.t.id,L.r);LS.set('sub.'+L.t.id+'-'+L.s.id,L.r)}
function viewSet(p,v){var jb=jmpIn();try{viewSet0(p,v)}finally{jmpOut(jb)}}
function viewSet0(p,v){if(!p)return;S.view[p]=v?String(v):'';if(p!==S.cur)return;subKeep();drawTabs();if(BL.on)blkPath()}
if(typeof window!=='undefined')window.viewSet=viewSet;
function drawTabs(){var L=curLoc(),nav=$('nav').children;
 for(var i=0;i<nav.length;i++){var t=tabById(nav[i].dataset.id);nav[i].hidden=!(t&&tabSubs(t).length);
  var l=nav[i].querySelector('span');if(l&&t)l.textContent=tx(t.label);nav[i].setAttribute('aria-selected',t&&L&&t===L.t?'true':'false')}
 var sn=$('subnav'),ss=L?tabSubs(L.t):[];sn.textContent='';sn.hidden=ss.length<2;if(L)sn.setAttribute('aria-label',tx(L.t.label));
 if(ss.length>1)ss.forEach(function(s){sn.appendChild(h('button',{type:'button',role:'tab','data-id':s.id,'aria-selected':s===L.s?'true':'false',text:tx(s.label),onclick:function(){openSub(L.t,s)}}))});
 var pn=$('pagenav'),rs=L?subRefs(L.s):[];if(!pn)return;pn.textContent='';pn.hidden=rs.length<2;pn.setAttribute('aria-label',tx('nav.pagesAria'));
 if(rs.length>1)rs.forEach(function(r){pn.appendChild(h('button',{type:'button',role:'tab','data-id':r,'aria-selected':r===L.r?'true':'false',text:refLabel(r),onclick:function(){goRef(r)}}))})}
function buildNav(){buildTabs();var nav=$('nav');nav.textContent='';
 TABS.forEach(function(t){nav.appendChild(h('button',{type:'button',role:'tab','data-id':t.id,'aria-keyshortcuts':t.key?'Alt+'+t.key:null,onclick:function(){openTab(t)}},[t.key?h('kbd',{text:'Alt+'+t.key}):null,h('span',{text:tx(t.label)})]))});drawTabs();if(typeof window!=='undefined'&&window.TASK&&window.TASK.row)window.TASK.row()}
function drawGames(){var b=$('games');if(!b)return;b.textContent='';b.setAttribute('aria-label',tx('games.aria'));
 GAMES.forEach(function(g){b.appendChild(h('button',{type:'button',role:'tab','data-game':g.id,'aria-selected':g.id===GID?'true':'false',title:tx('game.t.'+g.id),onclick:function(){switchGame(g.id)}},[g.name]))})}
function firstPage(){if(INGAME.mods)return 'mods';var t=TABS[0];return t?(tabPages(t)[0]||t.pages[0]):'mods'}
// the pages of this game in tab order, Advanced ones only while it is on (the Arrange picker on Settings)
function shownPages(){var o=[];TABS.forEach(function(t){tabPages(t).forEach(function(p){if(o.indexOf(p)<0&&S.sec[p]&&!NA[p])o.push(p)})});return o}
// the game that shows a page: as64 first, then the others in header order
function gameFor(id){var o=[GDEF].concat(GAMES.map(function(g){return g.id}).filter(function(x){return x!==GDEF}));
 for(var i=0;i<o.length;i++){var g=gOf(o[i]);if(!(g.na&&g.na[id])&&g.tabs.some(function(t){return t.pages.indexOf(id)>=0}))return o[i]}return null}
// switchGame(id[, page]): the game's mod and folder come back as they were left; the page stays the same when that game has it (else its
// last page); page may be page/view. JUMPS keeps the place left (game, page, view), so its Back restores the old game and page
function switchGame(id,page){var jb=jmpIn();try{switchGame0(id,page)}finally{jmpOut(jb)}}
function switchGame0(id,page){if(!gOf(id))return;var prev=S.cur;
 if(id!==GID){if(S.cur)GS[GID].screen=S.cur;GID=id;LS.set('gameId',id);gsSave();drawGames();buildNav();drawChip();gameWait();
  var m=S.screens.mods;loadGame().then(function(){if(m&&m.init)m.init()}).catch(function(e){toast(e.message)})}
 // no page named: stay on the page the user is on, with its sub-tab and view (page pill), when this game runs it (in its tabs, not an NA
 // page); only when it does not, the page left behind in this game, then its first page
 var has=function(r){return !!r&&inNav(refPg(r))&&!!S.sec[refPg(r)]},p=page?movedId(page):'',v=null;
 if(!p&&prev){var q=movedId(prev);if(INGAME[refPg(q)]&&S.sec[refPg(q)]){p=q;if(q===prev&&S.view[prev])v=S.view[prev]}}
 if(!has(p))p=GS[GID].screen?movedId(GS[GID].screen):'';if(!has(p))p=firstPage();show(p,v)}
// Advanced: body class advon (in-page folds with class adv show only then), the header chip (opens Settings), the Settings switch.
// Turned off on an Advanced item: the first item of the same sub-tab, else of the same tab
function applyAdv(){applyHdLock();var on=advOn();var b=$('advbox'),c=b&&b.querySelector('input');if(c)c.checked=on;
 try{var bd=document.body;if(on)bd.classList.add('advon');else bd.classList.remove('advon')}catch(e){}
 var ch=$('advchip');if(ch){ch.hidden=!on;ch.textContent=tx('adv.chip');ch.title=tx('adv.chipT');ch.onclick=function(){show('settings')}}
 var L=curLoc();
 if(!on&&L&&!refOn(L.r)){var rs=subRefs(L.s),ss=tabSubs(L.t);if(rs.length)goRef(rs[0]);else if(ss.length)openSub(L.t,ss[0]);else show(firstPage())}
 else drawTabs();
 // the guided fix step 7 button follows the switch at once (label, title and target: Test Run with Advanced, else Play)
 if(S.wz&&S.wz.upd)S.wz.upd();
 var st=S.screens.settings;if(st&&st.fill)st.fill()}
// the Advanced switch (Settings, Ctrl+K): off at once; on asks first, every time, with what it adds and what it can do
function advSet(on){if(!on){LS.set('adv',false);applyAdv();return}if(advOn()){applyAdv();return}
 askDo({title:tx('adv.warnT'),lines:[tx('adv.warn1'),tx('adv.warn2'),tx('adv.warn3')],ok:tx('adv.warnOk')}).then(function(y){if(y)LS.set('adv',true);applyAdv()})}
// show(id[, view]): id may be page/view. S.prev = the page shown before Settings (the Arrange picker starts there)
// show, switchGame and viewSet are the places a page, sub-tab, item, view or game changes: each tells JUMPS where the user was (jmpIn / jmpOut)
function show(id,view){var jb=jmpIn();try{show0(id,view)}finally{jmpOut(jb)}}
function show0(id,view){
 if(typeof id==='string'&&movedId(id)!==id){id=movedId(id);view=null}
 if(view==null&&typeof id==='string'&&id.indexOf('/')>0){view=refVw(id);id=refPg(id)}
 // a page this game does not show: go to the game that has it (a link or a "next" button from another page)
 if(!inNav(id)&&S.sec[id]){var gid=gameFor(id);if(gid&&gid!==GID){var nm=gOf(gid).name;switchGame(gid,view?id+'/'+view:id);toast(tx('game.switched',{g:nm}));return}}
 if(!S.sec[id])return;
 if(id==='settings'&&S.cur&&S.cur!=='settings')S.prev=S.cur;
 if(view)S.view[id]=String(view);
 S.cur=id;LS.set('screen',id);GS[GID].screen=id;gsSave();followPost(id);subKeep();drawTabs();
 var na=NA[id]||'',nb=$('nabox');NAMES.forEach(function(n){S.sec[n[0]].hidden=n[0]!==id||!!na});
 // game parity: a page this game cannot run keeps its place in the tabs; its screen stays hidden and #nabox says why (naCard)
 if(nb){nb.textContent='';nb.hidden=!na;if(na)nb.appendChild(naCard(na))}
 if(na)return;
 // E-12: no mod picked yet: take the one last used on this page (a picked mod is never replaced; Ctrl+K offers the switch)
 var lm=lastModOf(id);if(!S.mod&&lm&&S.screens.mods){setMod(lm);toast(tx('kp.lastSet',{p:lm}))}
 var s=S.screens[id];if(view&&s&&typeof s.view==='function'){try{s.view(String(view))}catch(e){}}
 // S.same: this refresh is a plain return to a page that nothing marked out of date since its last refresh (a page may then skip a re-ask
 // whose answer cannot have changed); false for a first show, after a mod or game change, and for every refresh from refreshAll
 var same=S.stale[id]===false&&!!S.inited[id];scrInit(id);S.stale[id]=false;S.same=same;try{if(s&&s.refresh)s.refresh()}finally{S.same=false}pollWake();blkApply(S.sec[id]);if(BL.on){blkDrawHidden();blkPath()}if(s&&s.focus&&!document.querySelector('dialog[open]'))s.focus()}
function lastModOf(id){var m=LS.get(mpKey(),{})||{};return typeof m[id]==='string'?m[id]:''}
// E-12: Ctrl+K palette over pages and the common commands
function clickIn(sec,label){var r=S.sec[sec];if(!r)return false;var bs=r.querySelectorAll('button');for(var i=0;i<bs.length;i++)if(bs[i].textContent===tx(label)&&!bs[i].disabled){bs[i].click();return true}return false}
var KP={sel:0,items:[]};
// pages by their path in the tabs (every item on show in this game), then commands; Settings, Advanced and Arrange This Page last.
// An item whose own name is not the last part of its path (the IDE tab holds the Editor) carries that name too, so typing it finds it
function kpItems(){var a=[];TABS.forEach(function(t){tabSubs(t).forEach(function(s){subRefs(s).forEach(function(r){var pp=pagePath(r),own=refLabel(r),ps=pp.split(' > ');
  a.push({label:ps[ps.length-1]===own?tx('kp.page',{p:pp}):tx('kp.pageN',{p:pp,n:own}),go:function(){goRef(r)}})})})});
 if(INGAME.check)a.push({label:tx('kp.check'),go:function(){show('check');var b=S.sec.check.querySelector('button[data-primary]');if(b&&!b.disabled)b.click()}});
 if(INGAME.play){a.push({label:tx('kp.insDry'),go:function(){show('play');clickIn('play','ins.dry')}});
  a.push({label:tx('kp.playDry'),go:function(){show('play');clickIn('play','pl.dry')}})}
 GAMES.forEach(function(g){if(g.id!==GID)a.push({label:tx('kp.game',{g:g.name}),go:function(){switchGame(g.id)}})});
 var lm=lastModOf(S.cur);if(lm&&lm!==S.mod)a.push({label:tx('kp.lastMod',{p:lm}),go:function(){setMod(lm)}});
 if(S.sec.settings)a.push({label:tx('kp.settings'),go:function(){show('settings')}});
 a.push({label:tx('kp.adv'),go:function(){advSet(!advOn())}});
 a.push({label:tx(BL.on?'kp.arrOff':'kp.arr'),go:function(){blkArrange(!BL.on)}});
 // IDE: while the IDE page (the IDE tab) is open, its quick functions come first
 if(S.cur==='ide'&&typeof window!=='undefined'&&window.IDE&&window.IDE.palette){var ia=[];try{ia=window.IDE.palette()||[]}catch(e){}
  a=ia.map(function(x){return {label:x.label+(x.key?'   ('+x.key+')':''),go:x.run}}).concat(a)}
 return a}
function kpDraw(){var d=$('kpal'),q=d.querySelector('input').value.trim().toLowerCase(),l=d.querySelector('.list');l.textContent='';
 KP.items=kpItems().filter(function(x){return !q||x.label.toLowerCase().indexOf(q)>=0});if(KP.sel>=KP.items.length)KP.sel=KP.items.length-1;if(KP.sel<0)KP.sel=0;
 if(!KP.items.length)l.appendChild(h('div',{class:'hint',text:tx('kp.none')}));
 KP.items.forEach(function(x,i){l.appendChild(h('div',{class:'it',role:'option','aria-selected':i===KP.sel?'true':'false',text:x.label,onclick:function(){KP.sel=i;kpGo()}}))});
 var s=l.children[KP.sel];if(s&&s.scrollIntoView)s.scrollIntoView({block:'nearest'})}
function kpGo(){var x=KP.items[KP.sel];$('kpal').close();if(x&&!RUN)x.go();else if(x&&RUN)busyMsg()}
function kpKey(e,list){var k=e.key;if(k==='ArrowDown'||(list&&k==='j')){KP.sel=Math.min(KP.items.length-1,KP.sel+1);kpDraw();e.preventDefault()}else if(k==='ArrowUp'||(list&&k==='k')){KP.sel=Math.max(0,KP.sel-1);kpDraw();e.preventDefault()}else if(k==='Enter'){kpGo();e.preventDefault()}}
function openPal(){var d=$('kpal');if(!d){var inp=h('input',{type:'text',autocomplete:'off',placeholder:tx('kp.ph'),'aria-label':tx('kp.title'),style:'flex:1'});
  d=h('dialog',{id:'kpal','aria-label':tx('kp.title')},[h('div',{class:'hd'},[h('b',{text:tx('kp.title')}),inp]),h('div',{class:'list',role:'listbox',tabindex:'0',style:'height:16em'}),h('div',{class:'ft'},[h('span',{class:'hint',text:tx('kp.hint')})])]);
  document.body.appendChild(d);inp.oninput=function(){KP.sel=0;kpDraw()};inp.onkeydown=function(e){kpKey(e,false)};d.querySelector('.list').onkeydown=function(e){kpKey(e,true)}}
 if(d.open)return;d.querySelector('input').value='';KP.sel=0;kpDraw();d.showModal();d.querySelector('input').focus()}
// IDE links: one grammar for every "go there" (tools/ide/README.md): ide:<rel>[:line[:col]]  key:<game path>[:line[:col]]  docs:<path>[#line]  lim:<ID>  log:<line>  page:<id>[/<view>].
// URL form: #go= followed by the link. A link never holds a mod path: it means the picked mod.
function as2Edit(ref,line,col){if(!S.sec.ide)return false;if(typeof window!=='undefined'){window.IDE_PENDING=window.IDE_PENDING||[];window.IDE_PENDING.push({ref:ref,line:line||0,col:col||0})}show('ide');return true}
function as2Link(s){s=String(s||'');var m=/^([a-z]+):([\s\S]*)$/.exec(s);if(!m)return false;var k=m[1],r=m[2];
 if(k==='page'){r=movedId(r);var pp=refPg(r),pv=refVw(r),pg=gOf(gameFor(pp)||GID);if(!S.sec[pp]||((ADVREF.indexOf(r)>=0||(ADV[pp]&&pg.open.indexOf(pp)<0))&&!advOn()))return false;show(pp,pv||null);return true}
 if(k==='ide'||k==='key'){if(!S.sec.ide||typeof window==='undefined'||!window.IDE||!window.IDE.go)return false;if(S.cur!=='ide')show('ide');window.IDE.go(s);return true}
 if(k==='docs'||k==='lim'){var d=S.screens.docs;if(!d||!d.go)return false;show('docs');if(k==='lim')d.limit(r);else{var x=/^(.*?)(?:#(\d+))?$/.exec(r);d.go(x[1],x[2]?+x[2]:0)}return true}
 if(k==='log'){if(!S.sec.logs)return false;show('logs');return true}
 return false}
function goHash(){if(typeof location==='undefined')return;var m=/^#go=(.+)$/.exec(location.hash||'');if(!m)return;var s;try{s=decodeURIComponent(m[1])}catch(e){return}
 try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}as2Link(s)}
if(typeof window!=='undefined'){window.as2Link=as2Link;window.as2Edit=as2Edit;if(window.addEventListener)window.addEventListener('hashchange',goHash)}
// ---------- live page and LAN Remote (gui.js --dev / --remote; tools/gui/live.js, remote.js)
// One event stream per page (GET /api/live): reload = the code changed (screen and scroll are kept in sessionStorage across the reload);
// hello with a new boot = the server was restarted; follow = the PC page changed screen or a run ended (remote pages that follow redraw),
// or, to the PC page (from:"remote"), a remote device changed screen (the PC page follows it while its switch is on).
// No loops: a screen change made by following (LIVE.quiet) is never told on, nor the screen a page opens with (LIVE.ready false).
var LIVE={es:null,boot:null,t:0,n:0,quiet:false,ready:false};
function liveJ(m){try{return JSON.parse(m.data||'{}')||{}}catch(e){return {}}}
function liveSay(on,key){var e=$('livest');if(!e)return;e.textContent=tx(key||'live.down');e.title=tx('live.downT');e.hidden=!on}
function liveReload(){try{sessionStorage.setItem('as2gui.live',JSON.stringify({s:S.cur,y:window.scrollY||0}))}catch(e){}if(!RMT)setFlush(true);try{location.reload()}catch(e){}}
function liveRestore(){var v=null;try{v=JSON.parse(sessionStorage.getItem('as2gui.live')||'null');sessionStorage.removeItem('as2gui.live')}catch(e){}if(!v)return;
 if(v.s)v.s=movedId(v.s);if(v.s&&S.sec[v.s]&&v.s!==S.cur)show(v.s);if(v.y)setTimeout(function(){try{window.scrollTo(0,v.y)}catch(e){}},80)}
function liveInit(){if(!(CFG.live||(!RMT&&CFG.rOn))||(LIVE.es&&LIVE.es.readyState!==2)||typeof EventSource!=='function')return;var es;try{es=new EventSource('/api/live')}catch(e){return}LIVE.es=es;
 es.addEventListener('hello',function(m){var j=liveJ(m);if(LIVE.boot&&j.boot&&j.boot!==LIVE.boot){liveReload();return}LIVE.boot=j.boot;LIVE.n=0;liveSay(false)});
 es.addEventListener('reload',function(){liveReload()});
 es.addEventListener('follow',function(m){var j=liveJ(m);if(RMT)rmtFollow(j);else pcFollow(j)});
 // the browser retries by itself while the server is away; a refused stream (closed) is tried again later, a dead remote link stops
 es.onerror=function(){liveSay(true);if(es.readyState!==2)return;clearTimeout(LIVE.t);var wait=Math.min(30000,2000*Math.pow(2,LIVE.n++));
  LIVE.t=setTimeout(function(){fetch('/api/health').then(function(r){if(RMT&&r.status===403){liveSay(true,'rmt.dead');return}liveInit()},function(){liveInit()})},wait)}}
// the screen a user opened, told on: the PC page to the remote pages that follow it (POST /api/follow, only while LAN Remote is on); a
// remote page to the PC page (POST /api/follow/remote; the server drops it unless the PC switch Follow the remote device is on)
function followPost(id){if(LIVE.quiet||!id||(RMT?!LIVE.ready:!CFG.rOn))return;
 try{fetch(RMT?'/api/follow/remote':'/api/follow',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({screen:id})}).catch(function(){})}catch(e){}}
function quietShow(id){LIVE.quiet=true;try{show(id)}finally{LIVE.quiet=false}}
// a remote page follows the PC (switch in the banner, on by default, kept per device in its own localStorage): screen, redraw after a run
function rmtFollowOn(){try{return localStorage.getItem('as2gui.rfollow')!=='0'}catch(e){return true}}
function rmtFollow(j){if(!rmtFollowOn()||!j||j.from==='remote')return;if(j.screen)j.screen=movedId(j.screen);
 if(j.screen&&S.sec[j.screen]&&j.screen!==S.cur){quietShow(j.screen);return}
 if(j.ev==='run'){var sc=S.screens[S.cur];if(sc&&sc.refresh)try{sc.refresh()}catch(e){}}}
// the PC page follows a remote device (switch in the LAN Remote dialog, off by default, kept in the settings): screen only
function pcFollow(j){if(RMT||!j||j.from!=='remote'||!CFG.rOn||!pcFollowOn())return;if(j.screen)j.screen=movedId(j.screen);if(j.screen&&S.sec[j.screen]&&j.screen!==S.cur)quietShow(j.screen)}
// every remote device, whatever its screen size or kind (phone, tablet, another computer): banner (view only, Follow the PC switch),
// sticky under the header so it stays in view; the PC only controls are hidden by CSS (body.remote), the server refuses them anyway
function rmtInit(){if(!RMT)return;try{document.body.classList.add('remote')}catch(e){}var b=$('rmban');if(!b)return;b.hidden=false;b.textContent='';
 var fo=h('input',{type:'checkbox','aria-label':tx('rmt.follow'),onchange:function(){try{localStorage.setItem('as2gui.rfollow',fo.checked?'1':'0')}catch(e){}}});fo.checked=rmtFollowOn();
 b.appendChild(h('b',{text:tx('rmt.banner')}));b.appendChild(h('label',{title:tx('rmt.followT')},[fo,' '+tx('rmt.follow')]))}
// the PC: the LAN Remote button in the header (name + on/off mark) opens a dialog: the switch, QR code, link with Copy link, New link,
// the addresses of this PC, the status line, Follow the remote device, what another device can and cannot do. The header and dialogs are
// outside the block system rule 8): plain elements, the dialog built once on first open, on body (as askDo's box).
var RMD={d:null,sw:null,load:function(){}};
function pcFollowOn(){return LS.get('share.rmtFollowPc',false)===true}
function rmtMarkKey(){return CFG.rOn?(pcFollowOn()?'rmt.markFol':'rmt.markOn'):'rmt.markOff'}
function rmtMark(){var b=$('rmbtn');if(!b)return;var k=rmtMarkKey();b.textContent='';b.appendChild(document.createTextNode(tx('rmt.title')));
 b.appendChild(h('span',{'class':'rmmark'+(CFG.rOn?' on':''),'aria-hidden':'true',text:tx(k)}));b.title=tx('rmt.btnT');b.setAttribute('aria-label',tx('rmt.title')+' ('+tx(k)+')');
 b.setAttribute('aria-expanded',RMD.d&&RMD.d.open?'true':'false')}
function rmtBtn(){var b=$('rmbtn');if(!b||RMT)return;b.hidden=false;b.onclick=rmtOpen;rmtMark()}
function rmtOpen(){if(RMT)return;var d=RMD.d||rmtDlg();if(d.open)return;
 if(typeof d.showModal==='function')d.showModal();else d.open=true;rmtMark();RMD.load();try{RMD.sw.focus()}catch(e){}}
function rmtClose(){var d=RMD.d;if(!d||!d.open)return;try{if(typeof d.close==='function')d.close();else d.open=false}catch(e){d.open=false}rmtClosed()}
function rmtClosed(){rmtMark();var b=$('rmbtn');if(b&&b.focus)try{b.focus()}catch(e){}}
function rmtDlg(){
 var sw=h('input',{type:'checkbox','aria-label':tx('rmt.switch')}),link=h('code',{'class':'rmlink'}),qr=h('div',{'class':'qrbox',role:'img','aria-label':tx('rmt.qr')}),
  addrs=h('div',{'class':'hint'}),st=h('div',{'class':'hint',role:'status'}),
  cpb=h('button',{type:'button',text:tx('rmt.copy'),disabled:true}),nb=h('button',{type:'button',text:tx('rmt.newLink'),title:tx('rmt.newLinkT')}),
  fp=h('input',{type:'checkbox','aria-label':tx('rmt.followPc')}),d=h('dialog',{id:'rmdlg','aria-label':tx('rmt.title')});
 fp.checked=pcFollowOn();
 d.appendChild(h('div',{'class':'hd'},[h('b',{text:tx('rmt.title')}),h('button',{type:'button',id:'rmx',style:'margin-left:auto',title:tx('rmt.close'),'aria-label':tx('rmt.close'),text:String.fromCharCode(215),onclick:rmtClose})]));
 d.appendChild(h('div',{'class':'askb'},[h('p',{'class':'hint',text:tx('rmt.intro')}),
  h('div',{'class':'row'},[h('label',{},[sw,' '+tx('rmt.switch')])]),h('div',{'class':'row'},[cpb,nb]),
  h('div',{'class':'row'},[qr,h('div',{},[link,addrs])]),st,
  h('div',{'class':'row'},[h('label',{title:tx('rmt.followPcT')},[fp,' '+tx('rmt.followPc')])]),h('div',{'class':'hint',text:tx('rmt.followPcT')}),
  h('p',{text:tx('rmt.can')}),h('p',{text:tx('rmt.cannot')}),h('p',{'class':'hint',text:tx('rmt.fw')})]));
 d.appendChild(h('div',{'class':'ft'},[h('span',{style:'flex:1'}),h('button',{type:'button',id:'rmclose',text:tx('rmt.close'),onclick:rmtClose})]));
 d.addEventListener('close',rmtClosed);document.body.appendChild(d);RMD.d=d;RMD.sw=sw;RMD.fp=fp;
 fp.addEventListener('change',function(){LS.set('share.rmtFollowPc',fp.checked);setFlush();rmtMark()});
 function draw(j){if(!j||typeof j!=='object')return;sw.checked=!!j.on;CFG.rOn=!!j.on;rmtMark();if(j.on)liveInit();link.textContent=j.on?(j.link||''):'';cpb.disabled=!(j.on&&j.link);qr.textContent='';
  addrs.textContent=(j.addrs&&j.addrs.length)?tx('rmt.addrs',{a:j.addrs.join(', ')}):tx('rmt.noLan');
  st.textContent=(j.errors&&j.errors.length)?tx('rmt.err',{m:j.errors.join('; ')}):tx(j.on?'rmt.onSay':'rmt.offSay');
  if(j.on&&j.qr&&j.qr.rows){var n=j.qr.size+8,k=Math.max(2,Math.floor(360/n)),cv=h('canvas',{width:n*k,height:n*k}),g=cv.getContext&&cv.getContext('2d');qr.appendChild(cv);if(!g)return;
   var lt=cssv('--prifg'),dk=cssv('--lvfg');if(lt){g.fillStyle=lt;g.fillRect(0,0,n*k,n*k)}if(dk)g.fillStyle=dk;j.qr.rows.forEach(function(r,y){for(var x=0;x<r.length;x++)if(r.charAt(x)==='1')g.fillRect((x+4)*k,(y+4)*k,k,k)})}}
 function load(){api('/api/remote').then(draw).catch(function(e){st.textContent=e.message})}
 sw.addEventListener('change',function(){api('/api/remote',{on:sw.checked}).then(function(j){draw(j);if(j.on)followPost(S.cur)}).catch(function(e){sw.checked=!sw.checked;st.textContent=e.text||e.message})});
 nb.addEventListener('click',function(){api('/api/remote/newkey',{}).then(function(j){draw(j);toast(tx('rmt.newSaid'))}).catch(function(e){st.textContent=e.text||e.message})});
 cpb.addEventListener('click',function(){try{navigator.clipboard.writeText(link.textContent).then(function(){toast(tx('rmt.copied'))},function(){})}catch(e){}});
 RMD.load=load;return d}
S.sec={};S.view={};S.prev='';S.stale={};S.inited={};
var BUILD={mods:screenMods,make:screenMake,upgrade:screenUpgrade,check:screenCheck,play:screenPlay,test:screenTest,settings:screenSettings};
Object.keys(EXT_SCREENS).forEach(function(k){BUILD[k]=EXT_SCREENS[k]});
// --hdh: the page header's height, for sticky table headers (th) to sit right under it; follows wraps, the More fold and game switches
function hdhWatch(){var hd=$('hdr');if(!hd||!hd.getBoundingClientRect)return;
 function set(){try{document.documentElement.style.setProperty('--hdh',Math.round(hd.getBoundingClientRect().height)+'px')}catch(e){}}
 set();try{if(typeof ResizeObserver==='function')new ResizeObserver(set).observe(hd);else if(window.addEventListener)window.addEventListener('resize',set)}catch(e){}}
function buildUi(){var main=$('main'),fresh=FIRSTRUN||!GS[GID].screen&&!LS.get('screen','');drawGames();buildNav();hdhWatch();
 NAMES.forEach(function(n){
  var sec=h('section',{hidden:true,'data-id':n[0],'data-blkroot':n[0]});main.appendChild(sec);S.sec[n[0]]=sec;S.screens[n[0]]=BUILD[n[0]](sec);blkInitRoot(sec)});
 Object.keys(S.screens).forEach(function(k){if(k==='mods'||S.screens[k].eager)scrInit(k)});   // the mod list feeds the header (mod chip, reloadMods); the other pages start at their first show
 blkAllRoots(blkApply);
 // the Advanced switch and Arrange live on the Settings page (screenSettings); the header keeps the Advanced on chip (applyAdv)
 // the page comes back in the view last used in its tab (sub.<tab> holds page/view)
 var s=movedId(GS[GID].screen||(GID===GDEF?LS.get('screen',''):'')||'mods');
 // Prepare page first at start (setting prep.open, on unless unticked on that page); a reload within one browser session keeps the page the user was on
 var po=false;try{po=LS.get('prep.open',true)!==false&&!sessionStorage.getItem('as2gui.prepSeen');sessionStorage.setItem('as2gui.prepSeen','1')}catch(e){po=false}
 if(po&&S.sec.prep&&inNav('prep'))s='prep';
 // first run (fresh: no page saved before the pages started) and no game folder found: the Settings page (its Game folder card) is the setup page
 if(fresh&&!gameDir()&&S.sec.settings&&inNav('settings'))s='settings';
 if(!S.sec[s]||!inNav(s))s=firstPage();
 var sv=TABOF[s]?LS.get('sub.'+TABOF[s].id,''):'';setMod(S.mod);   // no page is on screen yet: every page is marked out of date, the show below refreshes the first one, once
 show(s,typeof sv==='string'&&refPg(sv)===s&&refVw(sv)?refVw(sv):null);modKeep();applyAdv();liveRestore();rmtInit();rmtBtn();liveInit();LIVE.ready=true}
document.addEventListener('keydown',function(e){
 if(e._job)return;   // Esc just closed the job list: it does not also cancel the run
 if($('pk').open)return;
 if(RMD.d&&RMD.d.open){if(e.key==='Escape'){rmtClose();e.preventDefault()}return}   // LAN Remote dialog: Esc closes it, nothing else reaches the page
 if((e.ctrlKey||e.metaKey)&&!e.altKey&&(e.key==='k'||e.key==='K')){openPal();e.preventDefault();return}
 if($('kpal')&&$('kpal').open)return;
 if(e.altKey&&/^[0-9]$/.test(e.key)){var kt=null;TABS.forEach(function(t){if(t.key===e.key)kt=t});if(kt&&tabKey(kt)){e.preventDefault();return}}   // GT-27: Alt+digit = the tab with that key in groups.js
 if(e.key==='Escape'&&BL.pd&&BL.pd.on){blkPdEnd(false);e.preventDefault();return}
 if(e.key==='Escape'&&BL.on&&!document.querySelector('dialog[open]')){blkArrange(false);e.preventDefault();return}
 if(e.key==='Escape'&&RUN){cancelRun();e.preventDefault();return}
 {var ks=S.screens[S.cur];if(ks&&typeof ks.keys==='function'&&ks.keys(e)){e.preventDefault();return}}   // a page's own keys (the GoH page's translate questions: 1-9, Enter, R)
 if(e.ctrlKey&&e.key==='Enter'){var b=S.sec[S.cur].querySelector('button[data-primary]');if(b&&!b.disabled){b.click();e.preventDefault()}return}
 // E-12: j/k move in the page's list (mods table, unit search rows) when not typing
 if((e.key==='j'||e.key==='k')&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)){var sc=S.screens[S.cur];if(sc&&sc.move){sc.move(e.key==='j'?1:-1);e.preventDefault();return}}
 if(e.key==='/'&&S.cur==='mods'&&!/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)){S.screens.mods.filter.focus();e.preventDefault()}});
// the command list (contract.describe(), fixed per release) is in the page: the same list GET /api/commands answers, without the request
var CMDS0=__CMDS__;
Promise.all([api('/api/health'),{commands:CMDS0},api('/api/settings').catch(function(){return null})]).then(function(a){
 setLoad(a[2]);applyHdLock();initGames();applyStatic();
 S.health=a[0];a[1].commands.forEach(function(c){S.cmds[c.id]=c});return loadGame()}).then(function(){buildUi();window.__as2gui=S;goHash();JMP.ready=true}).catch(function(e){$('main').textContent=tx('api.noback',{m:e.message})});
})();
</script>`;
// JSON inside a script element: "</" would end it, U+2028/9 break old parsers
const inScript = s => s.replace(/</g, '\\u003c').replace(new RegExp(String.fromCharCode(8232), 'g'), '\\u2028').replace(new RegExp(String.fromCharCode(8233), 'g'), '\\u2029');
module.exports = TEMPLATE.replace('__ADVREF__', () => JSON.stringify(GROUPS.ADVREF || [])).replace('__EXTJS__', () => EXT.filter(x => x.script).map(x => '// ext ' + x.id + '\n' + x.script).join('\n')).replace('__EXTNAV__', () => JSON.stringify(EXT.filter(x => x.script && x.nav).map(x => ({ id: x.id, nav: x.nav, adv: !!x.adv, after: x.after || null, first: !!x.first })))).replace('__GAMES__', () => JSON.stringify(GROUPS.GAMES)).replace('__GDEF__', () => JSON.stringify(GROUPS.DEFAULT)).replace('__SETKEY__', () => JSON.stringify(SETTINGS.KEY.source)).replace('__SETDENY__', () => JSON.stringify(SETTINGS.DENY.source)).replace('__CMDS__', () => inScript(JSON.stringify(require('./contract').describe()))).replace('__LANGS__', () => JSON.stringify(loadLangs()).replace(/</g, '\\u003c').replace(new RegExp(String.fromCharCode(8232), 'g'), '\\u2028').replace(new RegExp(String.fromCharCode(8233), 'g'), '\\u2029'));
