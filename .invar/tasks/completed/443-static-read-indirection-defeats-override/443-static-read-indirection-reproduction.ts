/**
 * This script shows whether a Tooltip subclass can override its dwell time.
 * Run it with `bun .invar/tasks/in-progress/443-static-read-indirection-defeats-override/443-static-read-indirection-reproduction.ts`.
 * The constructor read must print 0.1. A self-reference read of 0.4 shows that the base class defeated the override.
 */
import { Tooltip } from '../../../../src/modules/ui/Tooltip';

class PinchedTooltip extends Tooltip.$Class {
  public static override get TOOLTIP_DWELL_SECONDS() {
    return 0.1;
  }

  readDwellSecondsThroughConstructor(): number {
    return (this.constructor as typeof PinchedTooltip).TOOLTIP_DWELL_SECONDS;
  }

  readObservedDwellSeconds(): number {
    return this.tooltipDwellSeconds;
  }
}

const pinchedTooltip = new PinchedTooltip();

console.log(
  `constructor read: ${pinchedTooltip.readDwellSecondsThroughConstructor()}`,
);
console.log(`observed read: ${pinchedTooltip.readObservedDwellSeconds()}`);
