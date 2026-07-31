import { Static } from 'ivue/extras';

/**
 * The instrument's own identity: what it is called, and where its own contract
 * lives. Server and browser both read these values from here, so the name in
 * the chrome and the path the scanner measures cannot drift apart.
 */
class $Instrument {
  static get NAME() {
    return 'Invariable representation instrument';
  }

  static get SHORT_NAME() {
    return 'Invariance Field';
  }

  static get EYEBROW() {
    return 'Invar developer instrument';
  }

  static get DOCUMENT_TITLE() {
    return 'Invar · Invariable representation instrument';
  }

  static get LEDE() {
    return 'Every dot is a recorded invariant. Radius is rank: evidence, generative power, enforcement, and survival pull a record toward reality, and nothing reaches it.';
  }

  static get CONTRACT_PATH() {
    return 'tools/invariant-field-v2/invariant-field.invariants.md';
  }

  static get LATTICE_PATH() {
    return 'tools/invariant-field-v2/invariant-field.lattice.md';
  }
}

export namespace Instrument {
  export const $Class = Static($Instrument);
  export let Class = $Class;
}
