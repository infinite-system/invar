import { describe, expect, it } from 'bun:test';
import {
  EditorSurfaceClaims,
  type EditorSurfaceClaim,
} from './EditorSurfaceClaims';

// A claim shaped like a read-only comparison: it replaces the text entirely.
function createReplacingClaim(identifier = 'test.comparison') {
  const claim = {
    identifier,
    occupyingEditorSurface: true,
    activeDocumentIsPresented: false,
    released: 0,
    release() {
      claim.released += 1;
      claim.occupyingEditorSurface = false;
    },
  };
  return claim;
}

// A claim shaped like a source|preview split: it occupies the surface but EMBEDS the real editor,
// so the active document is still presented and the keyboard follows which side has focus.
function createEmbeddingClaim(identifier = 'test.preview') {
  const claim = {
    identifier,
    occupyingEditorSurface: true,
    activeDocumentIsPresented: true,
    activeDocumentIsKeyboardTarget: true,
    released: 0,
    release() {
      claim.released += 1;
      claim.occupyingEditorSurface = false;
    },
  };
  return claim;
}

describe('EditorSurfaceClaims', () => {
  it('answers every capability YES while nothing claims the surface', () => {
    const claims = new EditorSurfaceClaims.Class();
    expect(claims.occupyingClaim).toBeNull();
    expect(claims.activeDocumentIsPresented).toBe(true);
    expect(claims.activeDocumentIsKeyboardTarget).toBe(true);
  });

  it('keeps answering YES for a registered claim that is not occupying', () => {
    const claims = new EditorSurfaceClaims.Class();
    const claim = createReplacingClaim();
    claim.occupyingEditorSurface = false;
    claims.register(claim);
    expect(claims.occupyingClaim).toBeNull();
    expect(claims.activeDocumentIsPresented).toBe(true);
    expect(claims.activeDocumentIsKeyboardTarget).toBe(true);
  });

  it('reports a replacing claim as neither presented nor the keyboard target', () => {
    const claims = new EditorSurfaceClaims.Class();
    const claim = createReplacingClaim();
    claims.register(claim);
    expect(claims.occupyingClaim?.identifier).toBe('test.comparison');
    expect(claims.activeDocumentIsPresented).toBe(false);
    expect(claims.activeDocumentIsKeyboardTarget).toBe(false);
  });

  // This is the case the old "is a diff showing?" question could not express, and the reason the
  // port has two customers rather than one renamed mode flag.
  it('reports an embedding claim as PRESENTED even while it occupies the surface', () => {
    const claims = new EditorSurfaceClaims.Class();
    const claim = createEmbeddingClaim();
    claims.register(claim);
    expect(claims.occupyingClaim?.identifier).toBe('test.preview');
    expect(claims.activeDocumentIsPresented).toBe(true);
    expect(claims.activeDocumentIsKeyboardTarget).toBe(true);
  });

  it('follows an embedding claim when its own pane takes the keyboard', () => {
    const claims = new EditorSurfaceClaims.Class();
    const claim = createEmbeddingClaim();
    claims.register(claim);
    claim.activeDocumentIsKeyboardTarget = false;
    expect(claims.activeDocumentIsPresented).toBe(true);
    expect(claims.activeDocumentIsKeyboardTarget).toBe(false);
  });

  it('defaults an omitted keyboard answer to the presentation answer', () => {
    const claims = new EditorSurfaceClaims.Class();
    const replacing: EditorSurfaceClaim = {
      identifier: 'test.replacing',
      occupyingEditorSurface: true,
      activeDocumentIsPresented: false,
      release() {},
    };
    claims.register(replacing);
    expect(claims.activeDocumentIsKeyboardTarget).toBe(false);
  });

  it('releases only the claims that are occupying the surface', () => {
    const claims = new EditorSurfaceClaims.Class();
    const occupying = createReplacingClaim('test.occupying');
    const idle = createReplacingClaim('test.idle');
    idle.occupyingEditorSurface = false;
    claims.register(occupying);
    claims.register(idle);
    claims.releaseOccupying();
    expect(occupying.released).toBe(1);
    expect(idle.released).toBe(0);
    expect(claims.occupyingClaim).toBeNull();
    expect(claims.activeDocumentIsPresented).toBe(true);
  });

  it('takes the first registered occupying claim as the precedence winner', () => {
    const claims = new EditorSurfaceClaims.Class();
    const first = createReplacingClaim('test.first');
    const second = createEmbeddingClaim('test.second');
    claims.register(first);
    claims.register(second);
    expect(claims.occupyingClaim?.identifier).toBe('test.first');
    expect(claims.activeDocumentIsPresented).toBe(false);
  });

  it('stops consulting a claim after its unregister handle runs', () => {
    const claims = new EditorSurfaceClaims.Class();
    const claim = createReplacingClaim();
    const unregister = claims.register(claim);
    expect(claims.activeDocumentIsPresented).toBe(false);
    unregister();
    expect(claims.occupyingClaim).toBeNull();
    expect(claims.activeDocumentIsPresented).toBe(true);
  });
});
