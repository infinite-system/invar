import { expect, test } from "bun:test";
import { Theme } from "./Theme";

test("theme toggles between the registered dark and light palettes", () => {
  const theme = new Theme.Class();
  expect(theme.paletteName.value).toBe("invar-dark");
  theme.toggleDark();
  expect(theme.paletteName.value).toBe("invar-light");
});
