// invariant: A runtime reading is a delta over a named window (src/modules/monitoring/monitoring.invariants.md)
// invariant: A missing process is gone not idle (src/modules/monitoring/monitoring.invariants.md)
export interface ProcessSampler {
  sample(processId: number): ProcessResourceSample | null;
}

export interface ProcessResourceSample {
  readonly processId: number;
  readonly atMilliseconds: number;
  readonly processorMicroseconds: number;
  readonly residentSetBytes: number;
}
