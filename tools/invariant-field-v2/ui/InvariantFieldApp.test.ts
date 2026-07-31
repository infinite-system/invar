import { describe, expect, test } from 'bun:test';
import { InvariantFieldApp } from './InvariantFieldApp';

class $StoppedInvariantFieldApp extends InvariantFieldApp.$Class {
  override async start() {}
}

describe('InvariantFieldApp', () => {
  test('starts with one empty reactive selection state', () => {
    const invariantFieldApp = new $StoppedInvariantFieldApp();
    expect(invariantFieldApp.isReady).toBe(false);
    expect(invariantFieldApp.selectedRecordIdentifier.value).toBeNull();
    expect(invariantFieldApp.selectedCompositionIdentifier.value).toBe('');
  });
});
