import { test, expect } from "bun:test";
import { TextDocument } from "./TextDocument";

test("TextDocument splits text into lines and stamps a revision", () => {
  const document = new TextDocument.Class();
  const revisionBefore = document.revision.value;
  document.loadFromText("a\nb\nc");
  expect(document.lineCount).toBe(3);
  expect(document.line(1)).toBe("b");
  expect(document.revision.value).toBeGreaterThan(revisionBefore);
  expect(document.dirty.value).toBe(false);
});

test("TextDocument.slice returns only the requested window (flyweight read)", () => {
  const document = new TextDocument.Class();
  document.loadFromText(
    Array.from({ length: 1000 }, (_, index) => `line ${index}`).join("\n"),
  );
  const window = document.slice(500, 5);
  expect(window).toEqual([
    "line 500",
    "line 501",
    "line 502",
    "line 503",
    "line 504",
  ]);
});

test("TextDocument mutation marks dirty and bumps revision", () => {
  const document = new TextDocument.Class();
  document.loadFromText("x");
  const revisionBefore = document.revision.value;
  document.setLine(0, "y");
  expect(document.line(0)).toBe("y");
  expect(document.dirty.value).toBe(true);
  expect(document.revision.value).toBeGreaterThan(revisionBefore);
  document.markSaved();
  expect(document.dirty.value).toBe(false);
});

test("TextDocument maintains the full-document display width through localized edits", () => {
  const document = new TextDocument.Class();
  document.loadFromText("short\n中\twide\nmedium");
  expect(document.maximumLineWidth).toBe(8);

  document.setLine(1, "x");
  expect(document.maximumLineWidth).toBe(6);
  document.insertLine(1, "longest line");
  expect(document.maximumLineWidth).toBe(12);
  document.removeLine(1);
  expect(document.maximumLineWidth).toBe(6);
  document.replaceAll(["tiny", "a much wider replacement"]);
  expect(document.maximumLineWidth).toBe(24);
  document.restore(["restored"]);
  expect(document.maximumLineWidth).toBe(8);
});
