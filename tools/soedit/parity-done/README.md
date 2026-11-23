# tools/soedit/parity-done: what each model-editor session built, row by row

`tools/soedit/parity.md` lists everything SOEdit does (one row per function, 12 groups). Each session of the built-in model
editor (contract: `tools/lib/model/edit/README.md`, "Parity record") writes one JSON file here per group it owns, so that no two
sessions edit `parity.md` at the same time.

## Files

One file per group: `FILE.json`, `PREF.json`, `MISC.json`, `TREE.json`, `BONE.json`, `VOL.json`, `OBST.json`, `PLY.json`,
`MAT.json`, `ANM.json`, `TL.json`, `VIEW.json`. Each holds every row ID of its group in `parity.md`, and nothing else:

```
{ "<ROW ID>": { "state": "done" | "partial" | "not owed" | "missing",
                "where": "<file>:<line or function>",       // where the replacement lives ("" when nothing was built)
                "test":  "<test file: test name>",            // the test that covers it ("" when none)
                "note":  "<plain words: what it does, what differs from SOEdit, what is left>" } }
```

States:

- **done**: the function works in the Models tab. A row SOEdit does wrongly (marked broken, or a save loss
  section 3) is done right, and the note says what differs.
- **partial**: some of it works; the note names the missing piece and who owns it.
- **not owed**: listed under "Not owed" in `parity.md` (greyed, no handler, dead, compiled out), or the note gives the reason.
  When something was built anyway, `where` and `test` say so.
- **missing**: nothing yet.

## How the coordinator merges them

1. Check each file: valid JSON, every row ID of the group present, no IDs from other groups, `state` one of the four.
   Example check (node only):
   `node -e "const fs=require('fs');const md=fs.readFileSync('tools/soedit/parity.md','utf8');for(const f of fs.readdirSync('tools/soedit/parity-done').filter(x=>x.endsWith('.json'))){const g=f.slice(0,-5),o=JSON.parse(fs.readFileSync('tools/soedit/parity-done/'+f,'utf8')),ids=[...md.matchAll(new RegExp('^[|] ('+g+'-[0-9]+) ','gm'))].map(m=>m[1]);console.log(g,'missing',ids.filter(i=>!o[i]),'extra',Object.keys(o).filter(i=>!ids.includes(i)))}"`
2. For each row, write `state` (and `where` when it is not empty) into the Replacement column of `parity.md` (the sixth
   column, between "State upstream" and "Notes", empty until now). Keep the row's other columns as they are.
3. Update the Counts section of `parity.md` from the states.
4. Leave the JSON files in place; a later session updates its own file and the merge runs again.

States are written by the session that built the rows, from its own tests. Nothing here claims a check in the game or in a
browser unless the note says so.
