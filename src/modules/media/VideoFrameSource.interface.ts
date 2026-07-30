export interface VideoFrameSource {
  readFrameInto(target: Uint8Array): Promise<boolean>;
  dispose(): void;
}
