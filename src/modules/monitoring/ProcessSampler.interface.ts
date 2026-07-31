export interface ProcessSampler {
  sample(processId: number): ProcessResourceSample | null;
}

export interface ProcessResourceSample {
  readonly processId: number;
  readonly atMilliseconds: number;
  readonly processorMicroseconds: number;
  readonly residentSetBytes: number;
}
