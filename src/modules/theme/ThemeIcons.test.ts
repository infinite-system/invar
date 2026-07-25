import { expect, test } from "bun:test";
import { ThemeIcons } from "./ThemeIcons";

test("icon fallback ladder: nerd has glyphs, ascii uses markers", () => {
  const nerd = ThemeIcons.Class.iconSetFor("nerd");
  const ascii = ThemeIcons.Class.iconSetFor("ascii");
  expect(ThemeIcons.Class.iconFor(nerd, "x.ts", false).length).toBeGreaterThan(
    0,
  );
  expect(ThemeIcons.Class.iconFor(ascii, "sub", true, false)).toBe("+");
  expect(ThemeIcons.Class.iconFor(ascii, "sub", true, true)).toBe("-");
});

test("right dock affordance has one cell at every glyph tier", () => {
  expect(ThemeIcons.Class.rightDockIconFor("ascii")).toBe("R");
  for (const level of ["nerd", "unicode", "ascii"] as const) {
    expect([...ThemeIcons.Class.rightDockIconFor(level)].length).toBe(1);
  }
});

test("unicode icon set resolves known extension and falls back for unknown", () => {
  const unicodeSet = ThemeIcons.Class.iconSetFor("unicode");
  expect(ThemeIcons.Class.iconFor(unicodeSet, "main.ts", false)).toBe("◆");
  expect(ThemeIcons.Class.iconFor(unicodeSet, "weird.zzz", false)).toBe(
    unicodeSet.file,
  );
});

test("checkbox icons ladder: real glyphs on nerd/unicode, single-cell, ascii degrades", () => {
  expect(ThemeIcons.Class.checkboxIconsFor("ascii")).toEqual({
    unchecked: " ",
    checked: "x",
  });
  for (const level of ["unicode", "nerd"] as const) {
    const box = ThemeIcons.Class.checkboxIconsFor(level);
    expect([...box.unchecked].length).toBe(1); // single cell so the click hit-column stays fixed
    expect([...box.checked].length).toBe(1);
    expect(box.unchecked).not.toBe(box.checked); // the two states are visually distinct
  }
});

test("git action icons ladder: real glyphs on nerd/unicode, letters as the ascii fallback", () => {
  // Ascii is the graceful degrade: o / d / + / - so a no-nerd-font terminal still reads.
  expect(ThemeIcons.Class.actionIconsFor("ascii")).toEqual({
    open: "o",
    discard: "d",
    stage: "+",
    unstage: "-",
    preview: "p",
  });
  // Nerd + unicode are real single-cell glyphs (distinct from the letters).
  const unicode = ThemeIcons.Class.actionIconsFor("unicode");
  const nerd = ThemeIcons.Class.actionIconsFor("nerd");
  for (const level of [unicode, nerd]) {
    for (const glyph of [
      level.open,
      level.discard,
      level.stage,
      level.unstage,
    ]) {
      expect([...glyph].length).toBe(1); // exactly one code point -> one cell, hit-zones stay aligned
      expect("od+-".includes(glyph)).toBe(false); // not the ascii letters
    }
  }
});
