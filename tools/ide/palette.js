// ide palette: the GEM2 look as constants (colours read once from the Notepad++ theme "GEM2" by Tyler V., 2014: its
// C++ lexer styles and global styles). One source for the GUI editor CSS and the generated Notepad++ language.
// The theme file itself is not kept here. Hex without '#'.
// Author: Imperator_Aug (ARSENAL, ia-fa13e477)
module.exports = {
  name: 'GEM2',
  font: 'Consolas', fontSize: 11,
  bg: '1C1B1A',                 // text background
  fg: 'FFFFFF',                 // default text
  key: '93C763', keyBold: true, // instruction word: block and key names
  type: '63A6C7',               // type word: enum-like values, on/off, set/able
  number: 'FFCD22',
  string: 'FF8000',
  operator: 'E8E2B7',           // braces, parens
  preproc: 'A082BD',            // (include (define (mod, %params
  comment: '0080FF', commentBg: '282726',          // ; line comment
  blockComment: '00FF00', blockCommentBg: '282726',
  currentLine: '383838',
  selection: '004080',
  caret: 'C1CBD2',
  gutterFg: '81969A', gutterBg: '3F4B4E',
  foldBg: '343F41', foldFg: '6A8088',
  brace: '0080FF', badBraceFg: 'FFFFFF', badBraceBg: 'FF0000',
  smart: '0080FF',              // same-word highlight
  // marks (ours, chosen to read on the GEM2 background)
  error: 'FF5555', warn: 'FFCD22', info: '63A6C7',
  // words the theme itself listed for game files
  themeWords1: ['event', 'on', 'off', 'end'],
  themeWords2: ['able', 'set', 'begin'],
  // light variant for the switch in the status bar
  light: { bg: 'FFFFFF', fg: '1F2328', key: '1A7F37', type: '0550AE', number: '953800', string: 'A0460A', operator: '57606A',
    preproc: '8250DF', comment: '6E7781', commentBg: 'FFFFFF', currentLine: 'F2F4F7', selection: 'B6D7FF', caret: '1F2328',
    gutterFg: '8C959F', gutterBg: 'F6F8FA', brace: '0550AE', error: 'CF222E', warn: '9A6700', info: '0969DA' },
};
