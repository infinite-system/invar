// Census: every key-name battery entry -> the exact byte form HarnessInput.key
// emits, or THROWS. Run: `bun census-522-key-byte-forms.ts /path/to/checkout`.
// Diffing its output between two checkouts proves whether an encoder change
// ALTERED an existing form (a differing line) or only ADDED forms (a line
// moving from THROWS to bytes). Output: one `name TAB form` line per entry.
const checkout = process.argv[2];
if (!checkout)
  throw new Error('usage: bun census-522-key-byte-forms.ts CHECKOUT_DIR');
const { HarnessInput } = await import(
  `${checkout}/scripts/harness/HarnessInput.ts`
);
const names: string[] = [];
const bases = [
  'Enter',
  'Tab',
  'Escape',
  'Backspace',
  'Space',
  'Up',
  'Down',
  'Left',
  'Right',
  'Home',
  'End',
  'Insert',
  'Delete',
  'PageUp',
  'PageDown',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
  'a',
  'z',
  'A',
  '[',
  ']',
  ',',
  '.',
  '1',
  '?',
  '-',
  '=',
];
const modifierSets = [
  '',
  'Shift',
  'Alt',
  'Control',
  'Control+Shift',
  'Control+Alt',
  'Alt+Shift',
  'Control+Alt+Shift',
];
for (const base of bases)
  for (const mods of modifierSets)
    names.push(mods === '' ? base : `${mods}+${base}`);
for (const name of names) {
  let form: string;
  try {
    form = JSON.stringify(HarnessInput.Class.key(name));
  } catch (thrown) {
    form = `THROWS: ${(thrown as Error).message}`;
  }
  console.log(`${name}\t${form}`);
}
