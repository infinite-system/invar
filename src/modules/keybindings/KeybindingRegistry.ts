import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';

// Layered, intent-addressed keybinding resolution. Bindings are DATA (chord pattern or step list →
// action id, with optional context + guard); resolution is a pure lookup over layers where LATER
// layers shadow earlier ones (canonical floor ← platform overlays ← plugin defaults ← user
// rebinds). Multi-step chords are step-list data with a timeout — not bespoke state code.
// invariant: Bindings are intent addressed (keybindings.invariants.md)
// invariant: Resolution is layered and later layers shadow earlier (keybindings.invariants.md)
// invariant: Focus owns the keystroke (keybindings.invariants.md)
class $KeybindingRegistry {
  protected static get chordTimeoutMilliseconds(): number {
    return 2000;
  }

  /**
   * Decode-name normalization — the ONE place a byte-level naming artefact becomes the CHORD the
   * binding table speaks about. A terminal that sends the bare C0 byte for Ctrl+<letter> loses the
   * letter: 0x0A is Ctrl+J, but OpenTUI names that byte `linefeed`, so a `{ key: 'j', ctrl: true }`
   * pattern never matched it and the panel toggle silently did nothing on such terminals. Chord
   * patterns stay intent-addressed; the artefact is repaired here, not in every call site.
   * invariant: A terminal delivers encoded sequences not keys (keybindings.invariants.md)
   */
  protected normalizeChordEvent(event: ChordEvent): ChordEvent {
    if (event.name === 'linefeed' && !event.ctrl) {
      return { ...event, name: 'j', ctrl: true };
    }
    return event;
  }

  protected layers: Layer[] = [];
  protected nextLayerSequence = 0;
  protected guards = new Map<string, () => boolean>();
  protected pendingChord: {
    binding: Keybinding;
    stepIndex: number;
    armedAtMs: number;
  } | null = null;

  /** Bumped whenever layers change, so effective-binding hints recompute. */
  get revision() {
    return ref(0);
  }
  get chordArmed() {
    return shallowRef(false);
  }

  registerLayer(name: string, bindings: Keybinding[]): void {
    this.registerTieredLayer(name, bindings, name === 'user' ? 'user' : 'host');
  }

  // invariant: Plugin bindings cannot reserve chords (keybindings.invariants.md)
  registerPluginLayer(
    name: string,
    bindings: readonly Keybinding[],
  ): () => void {
    const reservedBinding = bindings.find(
      (binding) => binding.reserved || binding.reservedBecause,
    );
    if (reservedBinding) {
      throw new Error(
        `Plugin keybinding cannot reserve ${reservedBinding.action}`,
      );
    }
    return this.registerTieredLayer(name, bindings, 'plugin');
  }

  registerUserLayer(name: string, bindings: readonly Keybinding[]): () => void {
    return this.registerTieredLayer(name, bindings, 'user');
  }

  protected registerTieredLayer(
    name: string,
    bindings: readonly Keybinding[],
    tier: LayerTier,
  ): () => void {
    const sequence = this.nextLayerSequence++;
    const layer: Layer = {
      name,
      bindings: [...bindings],
      tier,
      sequence,
    };
    this.layers = [
      ...this.layers.filter((layer) => layer.name !== name),
      layer,
    ].sort(
      (left, right) =>
        this.tierPrecedence(left.tier) - this.tierPrecedence(right.tier) ||
        left.sequence - right.sequence,
    );
    this.revision.value += 1;
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      this.layers = this.layers.filter((candidate) => candidate !== layer);
      this.revision.value += 1;
    };
  }

  protected tierPrecedence(tier: LayerTier): number {
    if (tier === 'host') return 0;
    if (tier === 'plugin') return 1;
    return 2;
  }

  registerGuard(name: string, predicate: () => boolean): void {
    this.guards.set(name, predicate);
  }

  protected patternMatches(pattern: ChordPattern, event: ChordEvent): boolean {
    if (pattern.key !== event.name) return false;
    if ((pattern.ctrl ?? false) !== event.ctrl) return false;
    if ((pattern.alt ?? false) !== event.option) return false;
    if ((pattern.super ?? false) !== (event.super ?? false)) return false;
    if (pattern.shift !== undefined && pattern.shift !== event.shift)
      return false;
    return true;
  }

  protected guardPasses(binding: Keybinding): boolean {
    if (!binding.when) return true;
    const guard = this.guards.get(binding.when);
    return guard ? guard() : false;
  }

  protected inContext(binding: Keybinding, context: string): boolean {
    return (
      (binding.context ?? 'global') === 'global' || binding.context === context
    );
  }

  /**
   * Resolve one decoded key event in a context. Precedence: an in-flight chord's next step, then
   * (scanning layers LAST to first — later shadows earlier): guarded singles, unguarded singles,
   * then chord STARTS. Any non-matching event cancels a pending chord and resolves normally.
   */
  resolve(rawEvent: ChordEvent, context: string, nowMs: number): Resolution {
    const event = this.normalizeChordEvent(rawEvent);
    if (this.pendingChord) {
      const { binding, stepIndex, armedAtMs } = this.pendingChord;
      const keybindingRegistryClass = this
        .constructor as typeof $KeybindingRegistry;
      const expired =
        nowMs - armedAtMs > keybindingRegistryClass.chordTimeoutMilliseconds;
      const nextStep = binding.steps?.[stepIndex];
      if (!expired && nextStep && this.patternMatches(nextStep, event)) {
        if (stepIndex + 1 >= (binding.steps?.length ?? 0)) {
          this.pendingChord = null;
          this.chordArmed.value = false;
          return { action: binding.action, chordPending: false };
        }
        this.pendingChord = {
          binding,
          stepIndex: stepIndex + 1,
          armedAtMs: nowMs,
        };
        return { action: null, chordPending: true };
      }
      this.pendingChord = null; // wrong key or timeout breaks the chord; resolve this event normally
      this.chordArmed.value = false;
    }

    let matchedSingle: Keybinding | null = null;
    let matchedGuardedSingle: Keybinding | null = null;
    let matchedChordStart: Keybinding | null = null;
    for (
      let layerIndex = this.layers.length - 1;
      layerIndex >= 0;
      layerIndex--
    ) {
      const layer = this.layers[layerIndex];
      if (!layer) continue;
      for (const binding of layer.bindings) {
        if (!this.inContext(binding, context)) continue;
        if (
          binding.chord &&
          this.patternMatches(binding.chord, event) &&
          this.guardPasses(binding)
        ) {
          if (binding.when)
            matchedGuardedSingle = matchedGuardedSingle ?? binding;
          else matchedSingle = matchedSingle ?? binding;
        } else if (
          binding.steps?.[0] &&
          this.patternMatches(binding.steps[0], event) &&
          this.guardPasses(binding)
        ) {
          matchedChordStart = matchedChordStart ?? binding;
        }
      }
      // A hit in a later layer shadows everything earlier — stop at the first layer with any match.
      if (matchedGuardedSingle || matchedSingle || matchedChordStart) break;
    }
    if (matchedGuardedSingle)
      return { action: matchedGuardedSingle.action, chordPending: false };
    if (matchedSingle)
      return { action: matchedSingle.action, chordPending: false };
    if (matchedChordStart) {
      this.pendingChord = {
        binding: matchedChordStart,
        stepIndex: 1,
        armedAtMs: nowMs,
      };
      this.chordArmed.value = true;
      return { action: null, chordPending: true };
    }
    return { action: null, chordPending: false };
  }

  /**
   * Match a RESERVED-GLOBAL escape-hatch binding (e.g. quit) against a key, STATELESSLY — no chord
   * state is read or advanced, so this is safe to call at the top of the input router BEFORE the
   * normal resolve(), on every key, without disturbing an in-flight chord. Returns the action id or
   * null. Only single `chord` bindings marked `reserved` match (steps are excluded — the check must
   * be stateless). This is how a focused modal/search input lets quit PASS THROUGH instead of
   * swallowing it. invariant: Reserved global chords fire from any mode (keybindings.invariants.md)
   */
  resolveReservedGlobal(rawEvent: ChordEvent): string | null {
    const event = this.normalizeChordEvent(rawEvent);
    for (
      let layerIndex = this.layers.length - 1;
      layerIndex >= 0;
      layerIndex--
    ) {
      const layer = this.layers[layerIndex];
      if (!layer) continue;
      for (const binding of layer.bindings) {
        if (!binding.reserved || !binding.chord) continue;
        if (
          this.patternMatches(binding.chord, event) &&
          this.guardPasses(binding)
        )
          return binding.action;
      }
    }
    return null;
  }

  cancelChord(): void {
    this.pendingChord = null;
    this.chordArmed.value = false;
  }

  /**
   * The post-shadowing binding map: action id → the chord pattern(s) that reach it (for hints).
   *
   * Later layers overwrite earlier ones (= shadowing), with ONE exception: a chord that needs `super`
   * never displaces a floor chord. A super chord only exists when the terminal speaks the kitty
   * protocol AND the user is on a Cmd keyboard; the platform overlay is registered unconditionally, so
   * without this rule a Linux user's cheat-sheet would advertise `Cmd+P` for Go to File — a chord that
   * cannot arrive for them. Hints must name a chord the CURRENT session can deliver.
   * invariant: Advertised bindings are deliverable bindings (keybindings.invariants.md)
   * invariant: Modifier fidelity varies by protocol (keybindings.invariants.md)
   */
  effectiveBindings(context: string): Map<string, Keybinding> {
    void this.revision.value; // subscribe
    const effective = new Map<string, Keybinding>();
    for (const layer of this.layers) {
      for (const binding of layer.bindings) {
        if (!this.inContext(binding, context)) continue;
        const existing = effective.get(binding.action);
        if (
          existing &&
          this.requiresSuper(binding) &&
          !this.requiresSuper(existing)
        )
          continue;
        effective.set(binding.action, binding);
      }
    }
    return effective;
  }

  /** Whether reaching this binding needs the kitty-only `super` modifier (Cmd). */
  protected requiresSuper(binding: Keybinding): boolean {
    return Boolean(
      binding.chord?.super || binding.steps?.some((step) => step.super),
    );
  }

  /** User-facing hint for the binding that is actually effective after all overlays and rebinds. */
  bindingHint(action: string, context: string): string {
    const binding = this.effectiveBindings(context).get(action);
    const chordPatterns =
      binding?.steps ?? (binding?.chord ? [binding.chord] : []);
    return chordPatterns
      .map((chordPattern) => {
        const parts: string[] = [];
        if (chordPattern.ctrl) parts.push('Ctrl');
        if (chordPattern.alt) parts.push('Alt');
        if (chordPattern.shift) parts.push('Shift');
        if (chordPattern.super) parts.push('Cmd');
        const keyLabel =
          chordPattern.key === 'return'
            ? 'Enter'
            : chordPattern.key.length === 1
              ? chordPattern.key.toUpperCase()
              : chordPattern.key[0]!.toUpperCase() + chordPattern.key.slice(1);
        parts.push(keyLabel);
        return parts.join('+');
      })
      .join(' then ');
  }

  /**
   * The reserved-set audit: every binding the host claims AWAY from the focused surface, with the
   * problems that disqualify it. A reserved binding must carry a `reservedBecause` warrant and must
   * carry a modifier — an unmodified key is content in some focused surface, so the host may never
   * take one (this is the clause that rejects `Tab → focus.toggle`). A bare FUNCTION key is the one
   * bounded exception: it produces no character and is kept only as the deliverability fallback for
   * a total-loss action (quit), at the stated cost that a full-screen TUI binding the same F-key
   * loses it. See project.keyboard.md §5.
   * invariant: Focus owns the keystroke (keybindings.invariants.md)
   */
  reservedSetProblems(): string[] {
    const problems: string[] = [];
    for (const layer of this.layers) {
      for (const binding of layer.bindings) {
        if (!binding.reserved) continue;
        const chord = binding.chord;
        if (!chord) {
          problems.push(
            `${binding.action}: reserved without a single chord (the reserved check is stateless)`,
          );
          continue;
        }
        if (!binding.reservedBecause) {
          problems.push(
            `${binding.action} (${chord.key}): no reservedBecause warrant`,
          );
        }
        const isFunctionKey = /^f[0-9]{1,2}$/.test(chord.key);
        if (
          !chord.ctrl &&
          !chord.alt &&
          !chord.super &&
          !chord.shift &&
          !isFunctionKey
        ) {
          problems.push(
            `${binding.action} (${chord.key}): reserved chord carries no modifier`,
          );
        }
      }
    }
    return problems;
  }

  /** Every action bound with `super` must also be reachable without it (the canonical floor).
   *  invariant: The canonical layer is the floor (keybindings.invariants.md) */
  actionsMissingCanonicalFloor(): string[] {
    const superActions = new Set<string>();
    const floorActions = new Set<string>();
    for (const layer of this.layers) {
      for (const binding of layer.bindings) {
        const usesSuper =
          binding.chord?.super || binding.steps?.some((step) => step.super);
        (usesSuper ? superActions : floorActions).add(binding.action);
      }
    }
    return [...superActions].filter((action) => !floorActions.has(action));
  }
}

export namespace KeybindingRegistry {
  export const $Class = $KeybindingRegistry;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

/** A normalized chord pattern. ctrl/alt/super must match exactly (absent = required absent); shift
 *  left undefined is DON'T-CARE (movement actions read the event's shift as "extend"). */
export interface ChordPattern {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  super?: boolean;
}

export interface Keybinding {
  action: string;
  /** Single chord (exclusive with steps). */
  chord?: ChordPattern;
  /** Multi-step chord, e.g. Ctrl+X then Ctrl+C. */
  steps?: ChordPattern[];
  /** Focus context this binding applies in; 'global' applies everywhere. */
  context?: string;
  /** Named guard (host-registered predicate) that must be true for the binding to fire. */
  when?: string;
  /** A RESERVED-GLOBAL escape hatch (e.g. quit): fires from ANY mode — even while a modal/search
   *  input is focused — so the user is never trapped. Must be a single chord (no steps): the
   *  pass-through check is stateless. invariant: Reserved global chords fire from any mode. */
  reserved?: boolean;
  /** The WARRANT for a `reserved` claim, inline on the binding so the justification can never be
   *  separated from the theft it justifies. Names which admission clause admits it (trap avoidance
   *  or toggle symmetry) — see project.keyboard.md §2.
   *  invariant: Focus owns the keystroke (keybindings.invariants.md) */
  reservedBecause?: string;
}

/** The slice of a decoded key event that resolution needs. */
export interface ChordEvent {
  name: string;
  ctrl: boolean;
  shift: boolean;
  option: boolean;
  super?: boolean;
}

export interface Resolution {
  /** The action to dispatch, or null (no binding — the caller applies the context's default). */
  action: string | null;
  /** True when this event STARTED or ADVANCED a multi-step chord (caller shows the armed hint). */
  chordPending: boolean;
}

interface Layer {
  name: string;
  bindings: Keybinding[];
  tier: LayerTier;
  sequence: number;
}

type LayerTier = 'host' | 'plugin' | 'user';
