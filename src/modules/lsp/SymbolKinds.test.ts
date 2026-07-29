import { expect, test } from 'bun:test';
import { SymbolKinds } from './SymbolKinds';

test('every specified SymbolKind classifies into a symbol-class family', () => {
  // Spot checks across the families; the table is total over 1–26.
  expect(SymbolKinds.Class.symbolClassFor(5)).toBe('type'); // Class
  expect(SymbolKinds.Class.symbolClassFor(6)).toBe('callable'); // Method
  expect(SymbolKinds.Class.symbolClassFor(12)).toBe('callable'); // Function
  expect(SymbolKinds.Class.symbolClassFor(13)).toBe('value'); // Variable
  expect(SymbolKinds.Class.symbolClassFor(2)).toBe('module'); // Module
  expect(SymbolKinds.Class.symbolClassFor(11)).toBe('type'); // Interface
  expect(SymbolKinds.Class.symbolClassFor(1)).toBe('file'); // File
  for (let kind = 1; kind <= 26; kind += 1) {
    expect(SymbolKinds.Class.symbolClassFor(kind)).not.toBe('unclassified');
  }
});

test('a missing or unknown kind still classifies, never as nothing', () => {
  expect(SymbolKinds.Class.symbolClassFor(null)).toBe('unclassified');
  expect(SymbolKinds.Class.symbolClassFor(0)).toBe('unclassified');
  expect(SymbolKinds.Class.symbolClassFor(99)).toBe('unclassified');
});
