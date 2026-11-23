# Chapter 5: The SDL Data Language

Nearly every data file in the game, from a rifle to a menu page to `mod.info`, is written in one small language, here called SDL. It has very few rules, but the rules are strict, and the game reacts to a mistake in one of two very different ways: it stops with an error, or it quietly ignores your line. Learning which mistakes do which saves hours.

The short way to find and fix such mistakes is [Check a mod, fix what the check finds, read the game log](p14-check-fix-read-log.md). This chapter explains the language those checks are about.

> **Encoding reminder.** Data files use CRLF line endings. The 64-bit build reads every string value as UTF-8, in data files and `.lng` localization files alike; identifiers and keywords must be plain ASCII. Original data is ASCII outside `;` comments, where some old cp1251 bytes remain; the game skips comments, so leave those bytes alone. An editor that silently converts the encoding or the line endings when you save can damage a file without any visible change. Check both after every save. Never save a data file as UTF-16, because the game refuses it outright.

## What you will learn

- How blocks, keys and values fit together.
- How strings, comments, numbers and escapes work.
- The difference between whole numbers and decimals, which is the most common cause of fatal errors.
- How `include`, `define` and macros work.
- What the game does with unknown keys, repeated keys and disabled blocks.
- Which mistakes are fatal, which are silent, and how to check a file before you start the game.

## 1. Blocks, keys and values

An SDL file is made of **blocks**. A block starts with `{`, has a name (the key) and some content, and ends with `}`. The content is one or more values and further blocks.

```
{rifle_stats
    {damage 12}
    {name "Example Rifle"}
    {sights
        {zoom 1.5}
        {range 400}
    }
}
```

Here `rifle_stats` is the file's outer block, `damage` holds the whole number 12, `name` holds a string, and `sights` holds two child blocks. (This example only shows the shape; it is not a real game file.) Which keys are valid is decided by whatever reads the file, not by the language. The language only decides what is well formed.

A few details that surprise newcomers:

- **Whitespace and line breaks are free.** `{damage 12}` and a version split over three lines mean the same.
- **The equals sign is whitespace.** `{damage = 12}` is read as `{damage 12}`, and a stray `=` anywhere is simply ignored. Do not rely on it for readability, because some tools and humans will take it for something more.
- **Block names are not always words.** Some files name an item with a string, such as `{"example_unit" {cost 5}}`.
- **Order often matters.** The reader processes the file from top to bottom. Never sort blocks or keys alphabetically, and do not reorder lists of event handlers.

## 2. Comments

A semicolon starts a comment that runs to the end of the line:

```
{damage 12}   ; the old value was 10
```

This is the only comment form. A hash sign is not a comment; outside a string it is an invalid character. A semicolon inside a quoted string is just text. To remove a whole block from a file, put `;` at the start of every line, because the other trick (`{##`, section 8) does not always remove it.

## 3. Words, strings and numbers

**Words.** An unquoted word starts with a letter or an underscore and may contain letters, digits and underscores. It ends at any other character. This is crucial: `foo-bar` is not one word. It is `foo`, a minus sign, and `bar`. A path such as `set/stuff/x.inc` is therefore not a word, and must be written as a string. Keep words plain ASCII: the bytes of a UTF-8 letter such as `é` or `ж` are not valid outside strings and comments, and they stop the reader.

**Strings.** Text in double quotes. A backslash always takes the next character with it, so `\"` does not end the string. A string may not contain a bare line break. The following escapes are decoded after reading:

| Written | Becomes |
|---|---|
| `\\` | a single backslash |
| `\"` | a double quote |
| `\n` | a line feed |
| `\r` | a carriage return |
| `\t` | a tab |

Any other backslash is kept as it is, so `"a\b"` stays as written. There is a trap: the replacements are done one after another over the whole string, so `"\\n"` (which you meant as a backslash followed by `n`) first becomes `\n` and then becomes a line feed. Avoid a backslash directly before `n`, `r`, `t` or `"` unless you mean the escape.

**Numbers.** A whole number is digits with an optional sign, such as `12` or `-3`. A decimal number has a dot, such as `1.5`, `0.25` or `5.`, and may have an exponent, such as `1e5`. Note the exceptions:

- A number must start with a digit. `.5` and `-.5` are not valid; write `0.5`.
- There is no suffix such as `f`. `1.5f` is the number 1.5 followed by the word `f`.
- Hexadecimal is written `0x1F` and counts as a whole number. A negative hex number such as `-0x10` cannot be read as one number, so avoid it.
- A number glued to letters splits: `5abc` is the number 5 followed by the word `abc`.

**Characters that are not valid.** A character such as `#`, `.`, `[`, `<` or `:` where a new item should start stops the reader with an error, and `-`, `.`, `/` and `:` end a word. Put such text in quotes.

### In Gates of Hell
<!-- goh: GHSDL-02 GHSDL-04 GHSDL-06 -->

Words, strings and escapes follow the same rules. Whole numbers are 64-bit there, so a value beyond the 32-bit range is not wrapped, and a hex number keeps its hex form when the game writes it back. Numbers read from text, such as a console value or a number inside a string, follow other rules: a leading `0` means octal, so `"010"` is 8 and `"08"` is 0, and text that is not a number reads as 0. Which data fields read their numbers that way is not confirmed, so do not pad numbers with zeros in a file meant for both games.

## 4. Whole numbers versus decimals

This single rule causes more fatal errors than any other.

- A field that wants a **whole number** accepts only a whole number. `5.0` is rejected, and so is the result of arithmetic such as `(+ 100 20)`.
- A field that wants a **decimal number** accepts both. `5` and `5.0` and `(+ 100 20)` all work.

When a field rejects a number, the game stops with an error that reads `Integer expected!`. When you are not sure which kind a field needs, copy the way the original files write it: if the original says `{charge 5}`, write `5`; if it says `{cost 5.5}`, a decimal is fine. The Part III reference pages give the type of each key, for example [Reference 2: entity definitions](r02-entity-definition.md).

In multiplayer unit entries, for instance, the keys `charge`, `level`, `order` and `icon` take whole numbers, while `cp`, `cost`, `score`, `fore` and `cw` take decimals. So `{charge 5.0}` is fatal and `{cost 5.0}` is fine (unconfirmed in play for each of these keys).

Other value kinds you will meet:

| Kind | How it is written |
|---|---|
| True or false | `{flag 1}`, `{flag 0}`, or the words `true` and `false`. A key written with no value, such as `{flag}`, means true |
| Names (enum) | A bare word or a string, compared without regard to case. An unknown name is silently treated as "none" |
| Position | Two or three numbers: `{pos 10 20 0.5}` |
| Colour | A name such as `red`, a hex code such as `FF8800` (exactly six or eight digits), or three or four decimal numbers in a string `"255 128 0"` |
| Range | Either a string `"min max"`, or one or two bare numbers meaning a centre and a spread. The two forms mean different things, so copy the form the original uses |
| Time | A number of seconds in most fields. A few fields (mainly in game rules) take whole milliseconds instead |
| Tag list | One string of words separated by spaces, or several strings (each string is then one tag). A word starting with `-` removes that tag. An initial `clear` empties the list first. Reading a tag list again adds to it |

Be careful with true-or-false: the word `no`, the word `off` and the string `"false"` can all be read as true. Use `0` and `1`. Giving a field more values than it reads produces a warning, not a stop.

### In Gates of Hell
<!-- goh: GHSDL-05 GHSDL-10 -->

Two value kinds behave differently:

- **Whole numbers out of range.** A whole-number field given a value below -2147483648 or above 4294967295 stops the game with `Integer expected!`. AS2 takes such a value without a message and wraps it, so a value that loads here can be fatal there.
- **Colours.** A hex colour may start with `0x` before its six or eight digits. A colour that cannot be read is no longer fatal: the game writes `Incorrect color definition: <text>` to the log and uses opaque black. A string with spaces is read as decimal `r g b` or `r g b a`.

## 5. Includes

An **include** pulls another file's text in at that point:

```
(include "/properties/tank.ext")
(include "common.inc")
```

Round brackets mark a "control list", a directive for the reader instead of data. The path is a string. A path with a leading slash counts from the `resource` level and applies the mod overlay (chapter [2](02-install-layout.md)). A path without a leading slash is counted from the folder of the file that contains the include, and each `../` climbs one folder. Capital letters and slash direction do not matter. If the file does not exist, the game stops with a fatal error. There is no protection against a file that includes itself, directly or through other files: the reader keeps opening it until the game dies, so check your includes. The reference entries [include of a template](r02-entity-definition.md#include-of-a-template) and [path forms](r01-mod-info-and-folder.md#path-forms) give the details.

An include can pass parameters, which section 7 explains.

## 6. Define and macros

A **define** gives a name to a piece of text:

```
(define "my_hit"
    {damage 12}
    {penetration 3}
)
```

A **macro call** then uses it, with the name in quotes inside round brackets:

```
{weapon
    ("my_hit")
}
```

When the game meets the call, it replaces it with the stored text, as if you had pasted it there. Facts to remember:

- A define must appear **before** it is used, in the same top-level file or in a file that file included. It is not visible in a sibling file.
- Names are exact: `"Armor"` and `"armor"` are two different names.
- Defining the same name again replaces the earlier text silently; the last one wins.
- The stored text is not checked when you define it. A mistake inside it shows up where the macro is used. Also, if you edit a define, you change every place that uses it.
- A missing name stops the game with `define not found`.
- A macro may call another macro. There is no guard against a macro that calls itself.

## 7. Macro parameters

A macro can take parameters. In the body, write a placeholder with a percent sign. In the call, supply the value:

```
(define "unit_cost"
    {cost %price}
    {cp %points}
)

{"example_unit"
    ("unit_cost" price(250) points(8))
}
```

Rules for named parameters:

- Write `price(250)` with **no space** between the name and the bracket. `price (250)` is an error (`'(' required`).
- A value runs to the first closing bracket, so it cannot itself contain a `)`. It may contain spaces, quotes and `(`.
- Replacement is done on the raw text, before the text is read, so it also affects text inside strings and comments. Placeholders with longer names are replaced first (`%cp` before `%c`). Capitals matter, so `%C` and `%c` are different.
- An unreplaced placeholder such as `%price` stays in the text and then produces a confusing error or a silently ignored key, so check your spelling.
- There are no default values. Each call must supply every parameter that the body uses.

There is also a positional form: `("name" args 1 "two" 3.5)`. The word `args` must be written in lower case. The values fill the placeholders `%0`, `%1`, `%2` in order.

A file can receive parameters as well. `(include "file.inc" size(3))` replaces `%size` throughout the text of that file.

## 8. Conditions, arithmetic and disabled blocks

**Conditions on game mode.** A `mod` control list includes its content only when a named condition is on:

```
(mod "mp"
    {max_players 8}
)
(mod not "mp"
    {max_players 1}
)
```

The names the engine supplies include `mp` and `coop` for multiplayer, `game:<map>` while a mission loads, and `dl_<difficulty>` for scene files. Names are case-sensitive. Nesting one `mod` inside another stops the game with `Nested mods not supported`.

**Arithmetic.** `(+ 1 2 3)`, `(- 10 4)`, `(* 2 3)` and `(/ 9 3)` calculate left to right with decimals. Division by zero is not checked. The result counts as a decimal, so it works only where a decimal is accepted (section 4). Arithmetic inside arithmetic is read correctly by plain decimal fields; in other places it can be misread (unconfirmed), so compute the number yourself and write it in when you can.

**Disabled blocks.** If the name of a block is written with an extra `#`, as in `{## old_unit ...}`, the block is "disabled". Readers of plain scripts skip it entirely. The loaders for the registered game data (section 9) read it but mark the item disabled, and whether a disabled unit is still buyable in play is not known (unconfirmed). If you want a block really gone, remove it or comment out every line with `;`. Two traps: a `#` glued to the name (`{#old ...}`) swallows the name into a tag, which is almost always a mistake, and a single `#` followed by a space (`{# old ...}`) is just an ordinary block.

### In Gates of Hell
<!-- goh: GHMIS-103 -->

A mission in Gates of Hell sees more condition names than `mp`, `coop` and `game:<map>`: `gametype:<type>`, `gameclass:<class>` and `training`. They stay on for the whole match, not only while it loads, so a `(mod "gametype:...")` list in a mission file works there and does nothing here. The game's own data also tests `hardcore`; when that one is on is not confirmed. Disabled blocks (`{##`) appear in its data as well.

## 9. How the game reads keys

The game has two kinds of reader, and they treat keys differently.

**Registered data** (the multiplayer rules, unit rosters, game presets and similar `.set` files) is read by one shared loader:

- **Key names are case-sensitive.** `{Cost 5}` is a different key from `{cost 5}`. The values of enums and tags are not case-sensitive, but key names are. Copy key names exactly from the originals.
- **Unknown keys are silently skipped.** If a key does not exist, or exists but sits in the wrong parent block, the game skips it without a message. A misspelling therefore looks exactly like "my change does nothing".
- **Extra values are tolerated with a warning.** A field given more values than it needs logs `Unread data detected in value of property "<path>"` and goes on.
- **Missing values are fatal.** `{cost}` with nothing after it stops the game (`Number expected!`), except for true-or-false fields, tag lists and ranges, which may omit the value.
- **Repeated keys.** A repeated simple field keeps the last value. Tag lists and flags merge. Named items in a list (such as `{"unit" {cost 9}}` appearing twice) merge into one item when the list is of the named kind, so a later block can change a single value of an earlier one (unconfirmed for each list). Do not delete duplicates automatically, because the order is meaningful.

**Hand-written readers** read entity definitions, templates, stuff files, interaction scripts and missions, each with its own vocabulary:

- **Key names are not case-sensitive** in definitions, templates and stuff files: `{Props}` and `{props}` are the same key.
- **Unknown keys depend on the block.** In a strict block, such as the top level of a definition, an unknown key stops the game with `unexpected token`. Other blocks quietly skip what they do not know.
- **They have extra features.** A stuff file, for example, can start with `{from "tags" ...}` to copy another item and then override parts of it. Chapter [6](06-data-keys-entities.md) and the reference pages explain each reader.

Defaults deserve a word: files carry no defaults of their own. A key you do not write keeps the game's built-in value, which may be a surprise if you assumed zero. The Part III reference pages give the value used when a key is absent wherever it is known. How `from` works in stuff files is the reference entry [from](r02-entity-definition.md#from).

### In Gates of Hell
<!-- goh: GHSDL-09 GHKEY-63 GHKEY-68 -->

The two kinds of reader are the same in Gates of Hell. An unknown key in a strict block probably stops the game with `Keyword expected!` there instead of `unexpected token`; some readers still use the old text, so search the log for both. `{from ...}` copies more in Gates of Hell: a weapon copy also takes the firing sounds, recoil, sway and several accuracy values of its base, and every copy starts with the base's extra tags, so a tag test inside the copy's own block already sees them. A weapon that leans on `from` can therefore act differently in the two games (chapter [9](09-weapons-ammo-damage.md#gates-of-hell-summary)).

## 10. What stops the game and what does not

| Problem | What happens |
|---|---|
| Missing `}` | Fatal, but reported at the end of the file (`Block terminator expected!`), far from the real mistake |
| Stray `)` | Silently ignored |
| Invalid character (such as `#` outside a string) | Fatal |
| A string missing its closing quote | Fatal |
| A whole number field given `5.0` | Fatal (`Integer expected!`) |
| Value missing from a numeric key | Fatal |
| `define` used before it exists | Fatal (`define not found`) |
| File named in `include` not found | Fatal |
| Placeholder `%name` not replaced | Usually a confusing error, sometimes silent |
| Unknown key in a strict block of a definition | Fatal (`unexpected token`) |
| Unknown, misspelled or wrong-case key in registered data | Silently skipped |
| Too many values | Warning in the log |

Every fatal error writes a block marked `Exception` in `game.log` and the game closes with the message "Program will be terminated". The block names the file, shows a few numbered lines around the position and marks where the reader gave up. Chapter [18](18-testing-and-logs.md) shows how to read it. A missing closing brace is the hardest to find, so keep your files short and indent consistently.

`mod.info` is no exception: every `mod.info` in the `mods` folder is read at start, and a broken one (for example with an unescaped quote) can stop the game even when that mod is not active. Unknown keys in `mod.info` are skipped silently (chapter [3](03-mod-folder-and-load-order.md)).

Two final facts about encoding: a UTF-8 byte-order mark at the start of a file is tolerated, while a UTF-16 or UTF-32 mark is fatal. And because no conversion takes place, the file's bytes go straight into the game, which reads string values as UTF-8: a string saved as cp1251 shows as boxes on screen, with no error in the log.

The log sections that matter here are in chapter [18](18-testing-and-logs.md#6-fatal-errors-and-warnings), and a game that closes while loading is covered by chapter [21](21-troubleshooting.md#4-symptom-the-game-closes-while-loading).

### In Gates of Hell
<!-- goh: GHSDL-08 GHSDL-09 GHSDL-10 GHSDL-13 GHVFS-29 GHLOG-07 -->

Most rows of the table hold in Gates of Hell. The differences:

| Problem | What happens in Gates of Hell |
|---|---|
| A broken `mod.info` | That mod is skipped with `Warning: failed to load mod <path>: <error>`; the game goes on |
| A colour that cannot be read | Warning `Incorrect color definition: <text>`, black is used |
| A whole number outside -2147483648 to 4294967295 | Fatal (`Integer expected!`) |
| A tag with non-ASCII letters longer than 127 bytes | Fatal (`Tag is too long`) |
| Unknown key in a strict block | Probably fatal with `Keyword expected!` |

Data files other than `mod.info` stay fatal on a syntax error, as here. In the error block the mark where the reader gave up is `«`, and every line of `game.log` starts with the time since start, as `[hh:mm:ss] `.

## 11. Editing safely

1. **Work on a copy in your own mod folder.** Never edit original files in the game folder.
2. **Make one change at a time** and keep the rest of the file byte-for-byte. Do not run a "reformat" or "sort" command on a data file.
3. **Keep the number style.** If a value is written `0.50` or `5.`, there is no reason to rewrite it. Never turn `5` into `5.0` or the other way round without checking the field.
4. **Keep the encoding and line endings.** Verify them after saving.
5. **Prefer a small override.** If a mechanism supports `from` or a repeated named item, use it instead of copying a whole file.
6. **Check before launching.** The checks run in seconds and catch most of the fatal mistakes in this chapter.

In the ARSENAL window, the Editor page (tab IDE) checks a data file as you type and when you save: a mark sits on the faulty line, F1 explains it in plain words, and Ctrl+. offers a fix where one is known. F12 (or Ctrl+click) jumps from an include, a macro call or an entity name to where it is defined; when a name is defined in several places it lets you pick one, and when no file defines it, it shows a card with what is known about it. Besides data files, the checks while you type also cover `.lng` and `.lua` files. The Editor keeps CRLF line endings, the byte-order mark and old comment bytes as they were. The Check page checks the whole mod at once.

On the command line:

```
ARSENAL sdllint mods/mymod --game <game folder>
ARSENAL keylint mods/mymod --game <game folder>
ARSENAL check mymod
```

`sdllint` follows the same reading rules as the game: it flags invalid characters, unbalanced braces, malformed defines, includes that cannot be found, nested `mod` lists and string values that are not UTF-8. `keylint` knows the key vocabulary and warns about unknown keys, wrong-case keys and decimals in whole-number fields, with a suggestion for the likely correct spelling, which the game itself will never do. `check` runs these and the other checkers together and gives one verdict. A `.lintrc` file in your mod folder can silence a finding you have decided to keep, with a reason (chapter [19](19-toolchain.md)).

### In Gates of Hell
<!-- goh: GHSDL-01 GHSDL-11 GHSDL-12 -->

The rules for editing safely are the same. Files saved by the Gates of Hell editor differ in small ways: coordinates are cut toward zero instead of rounded, so the last digit can differ (`1.2346` becomes `1.234`), and a string that is a plain word or a whole number of up to 18 digits is written without quotes. Do not take such differences for your own edits when you compare files. Under the Gates of Hell button the ARSENAL Editor opens Gates of Hell files too; the checks run from the command line or from the Check page:

```
ARSENAL sdllint "<mod folder>" --game "<Gates of Hell folder>" --exe goh
ARSENAL check "<mod folder>" --target goh --goh "<Gates of Hell folder>"
```

Under the Gates of Hell button the Check page reports what it finds, and its fix steps write a Gates of Hell patch mod (`fix --target goh`); the fixes that follow Assault Squad 2 rules are left out there, each with a line saying why.

## Gates of Hell: summary

The Gates of Hell notes in this book have not been tested in a running game. Check them in your own game before you depend on them.

| Section | Gates of Hell | In a few words |
|---|---|---|
| 1. Blocks, keys and values | same as far as mapped | Same blocks, keys and values |
| 2. Comments | same as far as mapped | `;` comments only |
| 3. Words, strings and numbers | [differs](#in-gates-of-hell) | 64-bit whole numbers; numbers read from text treat a leading `0` as octal |
| 4. Whole numbers versus decimals | [differs](#in-gates-of-hell-1) | Out-of-range whole numbers are fatal; a bad colour only warns |
| 5. Includes | same as far as mapped | Same include rules |
| 6. Define and macros | not mapped | |
| 7. Macro parameters | not mapped | |
| 8. Conditions, arithmetic and disabled blocks | [differs](#in-gates-of-hell-2) | Extra mission conditions `gametype:`, `gameclass:`, `training` |
| 9. How the game reads keys | [differs](#in-gates-of-hell-3) | `Keyword expected!`; `from` copies more |
| 10. What stops the game and what does not | [differs](#in-gates-of-hell-4) | Broken `mod.info` skipped; time stamp on every log line |
| 11. Editing safely | [differs](#in-gates-of-hell-5) | Its editor writes numbers and quotes differently; checks from the command line |

## Pitfalls

- **Unquoted paths.** Write every path as a string.
- **`5.0` in a whole-number field.** Fatal. Copy the way the original writes the number.
- **A space in `name (value)`.** Macro parameters need `name(value)` with no space.
- **Hash sign comments.** Only `;` comments.
- **Wrong-case or misplaced keys.** In registered data the game skips them silently; in a strict block of a definition an unknown key is fatal. Use `keylint`.
- **True or false as `"false"`, `no` or `off`.** All can read as true. Use `0` and `1`.
- **A define used before it exists, or in another file.** Fatal.
- **A file that includes itself.** The game dies.
- **Double-decoded backslashes.** `"\\n"` becomes a line feed.
- **Non-ASCII letters outside strings.** They stop the reader. Keep keys and words ASCII.
- **Encoding.** CRLF line endings; UTF-8 string values in data and `.lng` files alike; ASCII identifiers; leave old cp1251 comment bytes alone; never UTF-16.

## Next

Chapter [6](06-data-keys-entities.md) starts using this language on real data: how entity files and their keys are organized. If a word here was unfamiliar, see [22-glossary.md](22-glossary.md).
