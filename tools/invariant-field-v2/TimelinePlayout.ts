import { Static } from 'ivue/extras';
import type {
  InvariantSnapshot,
  RankedRecord,
  TimelineEventType,
  TimelineRecordEvent,
} from './types';

class $TimelinePlayout {
  static eventsBetween(
    beforeSnapshot: InvariantSnapshot,
    afterSnapshot: InvariantSnapshot,
  ): TimelineRecordEvent[] {
    const beforeRecords = new Map(
      beforeSnapshot.records.map((record) => [record.stableIdentifier, record]),
    );
    const afterRecords = new Map(
      afterSnapshot.records.map((record) => [record.stableIdentifier, record]),
    );
    const events: TimelineRecordEvent[] = [];

    for (const afterRecord of afterSnapshot.records) {
      const beforeRecord = beforeRecords.get(afterRecord.stableIdentifier);
      if (!beforeRecord) {
        events.push(this.event('birth', null, afterRecord));
        continue;
      }
      if (afterRecord.radius < beforeRecord.radius) {
        events.push(this.event('strengthen', beforeRecord, afterRecord));
      } else if (afterRecord.radius > beforeRecord.radius) {
        events.push(this.event('weaken', beforeRecord, afterRecord));
      }
      if (
        afterRecord.rankComponents.rotPenalty >
        beforeRecord.rankComponents.rotPenalty
      ) {
        events.push(this.event('rot', beforeRecord, afterRecord));
      }
    }

    for (const beforeRecord of beforeSnapshot.records) {
      if (!afterRecords.has(beforeRecord.stableIdentifier)) {
        events.push(this.event('removed', beforeRecord, null));
      }
    }

    return events.sort(
      (leftEvent, rightEvent) =>
        this.EVENT_ORDER.indexOf(leftEvent.type) -
          this.EVENT_ORDER.indexOf(rightEvent.type) ||
        leftEvent.recordIdentifier.localeCompare(rightEvent.recordIdentifier),
    );
  }

  protected static event(
    type: TimelineEventType,
    beforeRecord: RankedRecord | null,
    afterRecord: RankedRecord | null,
  ): TimelineRecordEvent {
    return {
      type,
      recordIdentifier: (afterRecord ?? beforeRecord)!.stableIdentifier,
      beforeRecord,
      afterRecord,
    };
  }

  protected static get EVENT_ORDER(): readonly TimelineEventType[] {
    return ['birth', 'removed', 'strengthen', 'weaken', 'rot'];
  }
}

export namespace TimelinePlayout {
  export const $Class = Static($TimelinePlayout);
  export let Class = $Class;
}
