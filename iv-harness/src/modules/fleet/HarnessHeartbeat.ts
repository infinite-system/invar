import { Static } from 'ivue/extras';
import { existsSync, statSync } from 'node:fs';

/**
 * Reads the fleet-watch heartbeat stamp. Freshness uses the same
 * threshold dispatch.sh enforces (stale > 3 minutes refuses launches).
 */
class $HarnessHeartbeat {
  static get FRESH_THRESHOLD_SECONDS(): number {
    return 180;
  }

  static read(heartbeatPath: string): HeartbeatNode {
    if (!existsSync(heartbeatPath)) {
      return {
        path: heartbeatPath,
        exists: false,
        ageSeconds: null,
        fresh: false,
      };
    }
    const ageSeconds = Math.floor(
      (Date.now() - statSync(heartbeatPath).mtimeMs) / 1000,
    );
    return {
      path: heartbeatPath,
      exists: true,
      ageSeconds,
      fresh: ageSeconds <= this.FRESH_THRESHOLD_SECONDS,
    };
  }
}

export namespace HarnessHeartbeat {
  export const $Class = Static($HarnessHeartbeat);
  export let Class = $Class;
}

export interface HeartbeatNode {
  path: string;
  exists: boolean;
  ageSeconds: number | null;
  fresh: boolean;
}
