import { homedir } from 'node:os';
import { join } from 'node:path';
import { Static } from 'ivue/extras';

class $VendorPaths {
  static get dataRoot(): string {
    const explicit = process.env.INVAR_DATA_HOME;
    if (explicit) return explicit;
    const xdgDataHome = process.env.XDG_DATA_HOME;
    return xdgDataHome
      ? join(xdgDataHome, 'invar')
      : join(homedir(), '.local', 'share', 'invar');
  }

  static get vendorsRoot(): string {
    return join(this.dataRoot, 'vendors');
  }

  static get installedRecord(): string {
    return join(this.vendorsRoot, 'installed.json');
  }
}

export namespace VendorPaths {
  export const $Class = Static($VendorPaths);
  export let Class = $Class;
}
