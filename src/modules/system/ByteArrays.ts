import { Static } from 'ivue/extras';

/** Shared byte-array comparisons for storage, filesystem, and patch boundaries. */
class $ByteArrays {
  static equal(firstBytes: Uint8Array, secondBytes: Uint8Array): boolean {
    if (firstBytes.byteLength !== secondBytes.byteLength) return false;
    for (let byteIndex = 0; byteIndex < firstBytes.byteLength; byteIndex++) {
      if (firstBytes[byteIndex] !== secondBytes[byteIndex]) return false;
    }
    return true;
  }
}

export namespace ByteArrays {
  export const $Class = Static($ByteArrays);
  export let Class = $Class;
}
