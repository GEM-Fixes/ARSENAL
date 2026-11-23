# arsenal-gui-use: Prepare ahead (slow first open)
When: "the page takes minutes the first time", a big mod was just picked, before a session that opens many pages.

## Why
The first open of a page on a big mod is slow once: the mod walk and the game view are built, then kept in the cache store. Prepare builds those answers ahead and says which are ready, missing or stale.

## Steps
1. State: `gui_call {route: "GET /api/x/prep/state", game: "as64"}` -> per section: ready / none / stale.
2. Build what is stale: `gui_call {route: "POST /api/x/prep/run", body: {sections: "stale"}}` (the picked mod is sent by itself). It is a background job: poll `prep/state`, not `prep/run`.
3. Stop: `POST /api/x/prep/stop`. Check cached against fresh: `POST /api/x/prep/check`. Clear: `POST /api/x/prep/clear` (the next open is slow again; ask first).
4. GUI: Help & Docs > Prepare (`gui_open {page: "prep"}`).
No CLI: the cache belongs to the GUI server.

## Per game
Sections are per game tab and per mod: preparing AS64 does not prepare GoH. AS64 and MoW:AS2 share the install but not the game view (as64 has extra layers).

## What goes wrong
- stale right after a write: correct, the write touched the mod; run `stale` again.
- prepare during another heavy job: both slow down (one server thread plus child tools).
- a section that never gets ready: read the job row's error, then call the page's own route by hand.

## Check
`prep/state` shows ready for the sections of the pages you will use; the page then opens in about a second.
