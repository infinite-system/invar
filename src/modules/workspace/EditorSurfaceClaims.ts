// The editor surface is a SLOT, not a fixed editor. A contribution may CLAIM it — a read-only
// comparison of two revisions, a rendered preview beside its source — and while a claim is up the
// host's own behaviour has to change. The host must never ask WHICH surface is up ("is a diff
// showing?"): that question names a plugin, and every new surface would add another name to every
// caller. It asks the claim the two questions its behaviour actually depends on, and a surface the
// host has never heard of answers them the same way.
//
// The questions are derived from the guard sites that existed before this port, not invented:
//   activeDocumentIsPresented   — the 8 mode checks in Workspace (language sync, size notice,
//                                 definition, hover, completion, diagnostics, and the two
//                                 content-type routers) plus 6 identical paint/chrome checks.
//   activeDocumentIsKeyboardTarget — the editor-context key, caret, and clipboard routing.
// A read-only comparison answers false to both. A source|preview split answers TRUE to the first —
// the real editor is embedded in its left pane — which is exactly the distinction the old
// "is a diff showing?" question could not express.
//
// invariant: The editor surface answers capabilities, not plugin modes (src/modules/workspace/workspace.invariants.md)
class $EditorSurfaceClaims {
  protected readonly claims = new Set<EditorSurfaceClaim>();

  register(claim: EditorSurfaceClaim): () => void {
    this.claims.add(claim);
    return () => this.claims.delete(claim);
  }

  /** The claim occupying the editor surface, or null while the active buffer's editor owns it.
   *  First claim wins, so registration order is the precedence order. */
  get occupyingClaim(): EditorSurfaceClaim | null {
    for (const claim of this.claims) {
      if (claim.occupyingEditorSurface) return claim;
    }
    return null;
  }

  /** Does the active tab's document remain the subject of the editor surface — is the text the user
   *  sees the active buffer's text? Answers TRUE with no claim up, so a plugin-free canvas keeps
   *  every capability. */
  get activeDocumentIsPresented(): boolean {
    return this.occupyingClaim?.activeDocumentIsPresented ?? true;
  }

  /** Does the active tab's editor own the keyboard and the caret? A claim that embeds the real
   *  editor answers by whether ITS embedded editor currently has focus. */
  get activeDocumentIsKeyboardTarget(): boolean {
    const claim = this.occupyingClaim;
    if (!claim) return true;
    return (
      claim.activeDocumentIsKeyboardTarget ?? claim.activeDocumentIsPresented
    );
  }

  /** Give the editor surface back to the active buffer — opening a real file, or switching tabs,
   *  replaces any transient surface. The claim tears down its own state; the host never writes it. */
  releaseOccupying(): void {
    for (const claim of this.claims) {
      if (claim.occupyingEditorSurface) claim.release();
    }
  }
}

export namespace EditorSurfaceClaims {
  export const $Class = $EditorSurfaceClaims;
  export let Class = $EditorSurfaceClaims;
  export type Model = InstanceType<typeof Class>;
}

/** A contribution's claim over the editor surface. Every member is a question about the CLAIM's own
 *  state — none of them names the host, the layout, or another claim. */
export interface EditorSurfaceClaim {
  /** Stable identity, for probes and status projection (never branched on by the host). */
  readonly identifier: string;
  /** True while this claim occupies the editor surface. */
  readonly occupyingEditorSurface: boolean;
  /** Is the active tab's document still the text on screen? */
  readonly activeDocumentIsPresented: boolean;
  /** Does the active tab's editor still own the keyboard? Omit to answer the same as
   *  `activeDocumentIsPresented` — a claim that fully replaces the text also takes the keys. */
  readonly activeDocumentIsKeyboardTarget?: boolean;
  /** Stop occupying the surface and drop the transient state behind it. */
  release(): void;
}
