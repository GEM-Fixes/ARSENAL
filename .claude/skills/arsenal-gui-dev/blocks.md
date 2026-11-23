# arsenal-gui-dev: blocks and Arrange
When: adding a card, button, input, table, text, or moving one.

## Rule
- every control (button, input, select, textarea, canvas, table) and every text sits in a LEAF block.
- a block sits directly in a container block or the screen root; a leaf holds no blocks.
- a control, table, heading, label, `pre`, list, link is never a block itself: wrap it.

## Makers
- `blk(id, kids, {name, box, class, tag, attrs})`
- `fld(id, label, ctl, {req, title, chk, f, after})` labelled field
- `card(id, kids, {class, name})` (a `col` container)
- `asBlk(el, id, {name, box})`, `blkPut(container, el, before)`
- or `h(..., {blk: id, box: kind})`

## Ids
- lower case `a-z 0-9 . -`, starts with a letter or digit, at most 80: `^[a-z0-9][a-z0-9.-]{0,79}$`, unique in its screen.
- stable: the user's saved layout is keyed by the id; renaming one drops their arrangement of it.

## Containers
- carry `box`: `col | row | grid | cols | ncols`.
- a block with no visible text gets a `name` (shown in Arrange).
- insert a new element with `blkPut`, not `insertBefore` on a remembered sibling (the user may have moved it).

## Per game
Block ids are the same in all three game tabs; a card that cannot exist for a game stays a block holding the `na` text, so the layout does not shift.

## What goes wrong
- a button appended straight into a card: `test-blocks.js` "control not in a leaf block".
- two blocks with one id on a screen (often from a loop): add the row key to the id.
- a table as a block: wrap it in `blk(id, [table])`.
- id with upper case or underscore: refused by the pattern.

## Check
`node tools/gui/test/test-blocks.js` and the ext's `test.js` (it runs `blockcheck`); on screen: Arrange on, every new piece can be moved and hidden.
