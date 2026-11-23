# tools: router. Full line of a tool: Grep `^name ` in tools/index. Read one group, never all
line form: name | run line | | what. test-all.sh, BUILDS.md (build cost log, Grep only). conventions: .claude/agents/tool-builder.md

group | holds | tools
front | front door and packaging | as2 dist QUICKSTART upgrade fix check release-check gen gui
lint | linters, checks, shared lib | lib lnglint lnglayout sdllint keylint fieldtypes ialint uilint binhdr refcheck humlint movlint fxlint milint doctor loccover strlint report-core lintrc expcheck registry lib/testfolders wouldload covlint shapecheck limmap defcheck roundtrip
port | GoH port, translation, assets | portdiff goh2as2 genstuffkeys portfix gohsample as2togoh pairdiff unitgroups donorpick donorfit artport xlate blen unitmod cards goh2as2 goh2as2-translate wpn valourk assetsame rzsys goh2as2-fit goh2as2/texcheck goh2as2/texconv goh2as2/fitbatch goh2as2/unitname nativepass unitbox portverdict portcensus native portlint portasset
run | games, proofs, logs, scores | batch golden logtriage testrun drift bootloop uidrive spotcheck snap preloadsweep prove edrun edrun-runlist edrun-pack edrun-cov crashwatch testmap score firecheck covcheck covreplay edrun-mindist covanm bootcheck exam testplan
maps | maps, missions | mapport mission-clone misdiff mapview map-clone botrecipe mapport/rebuild mapscen doctrine mapviz
mod | mod editing, load order, packing | modinfo vfs entityindex packer modswitch clone-entity overdiff statsheet build patch-entity newmod/lng-add conflicts mpsync lngsplit lngstd cardrename place-entity userdir pricecalc keyprof chains modmove verdiff lng soedit lib/model armorsim workshop
exe | exes, upstream | exever gamediff a private tool blogkeys
dev | dev: q, docs | q libapi scaffold mcp lsp owners wave rows2scn probekit cvarcheck determ gameprofile helpcheck

GoH use (2026-11-08, from each tool's source, [I]; not a group, a marker). goh-in = reads GoH data or the GoH install read only; goh-mod = lints, mounts or writes a mod for a GoH target; goh-run = launches or drives GoH; goh-guard = keeps GoH assets out of releases
goh-in | gamediff portdiff pairdiff goh2as2 gohsample unitgroups donorpick donorfit artport helmetport valourk wpn xlate assetsame cards mapport mapscen portfix unitmod exever a private tool blogkeys portcensus unitbox(--goh) clone-entity(--model-from)
goh-mod | lib/vfs(exe goh) sdllint keylint lnglint lng modinfo(--goh) wouldload refcheck binhdr modmove upgrade as2togoh check gen newmod map-clone mission-clone modswitch chains gui
goh-run | modmove(live) uidrive testrun snap edrun release-check
goh-guard | packer(gohguard) dist
games (2026-11-14): tools take `--exe as64|mowas_2|mowas2|goh` (lib/games) or their own game word; no --exe = as before. A game a tool cannot serve: one line, exit 2 (cited row). Each tool line names its games
- gemindex — offline search of the GEM External Index (9,346 links, 934 guides, 160 tools, 1,729 saved pages, 40 FAQ); search/show/sources/faq/tools/gaps/export/stats offline, scrape/wayback (public pages, robots.txt obeyed, one page at a time) and extract, bundle/scan for the release folder; search --game as2rel|gohrel (gohrel = goh, cta, gem2, all); data via --data/GEM_INDEX_DIR or gemindex/ beside the exe, never in repo; GUI page 'Guides and tools' (ext guides)
- doctrine — Men of War doctrine pack: list|show|voice|profile|gen|check; personas to bot.data.lua settings (vanilla 3 keys, a larger replacement bot script 18) [T]; GUI page 'Bot doctrine' (ext doctrine); run line: Grep `^doctrine ` in tools/index
