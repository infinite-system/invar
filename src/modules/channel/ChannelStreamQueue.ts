class $ChannelStreamQueue implements AsyncIterable<Uint8Array> {
  protected readonly chunks: Uint8Array[] = [];
  protected waiter: ((result: IteratorResult<Uint8Array>) => void) | null =
    null;
  protected ended = false;
  protected failure: unknown = null;

  push(bytes: Uint8Array): void {
    if (this.ended) throw new Error('Channel stream is already closed');
    const chunk = bytes.slice();
    if (this.waiter) {
      const waiter = this.waiter;
      this.waiter = null;
      waiter({ value: chunk, done: false });
    } else {
      this.chunks.push(chunk);
    }
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.resolveWaiter();
  }

  fail(error: unknown): void {
    if (this.ended) return;
    this.failure = error;
    this.ended = true;
    this.resolveWaiter();
  }

  [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    return {
      next: () => this.next(),
    };
  }

  protected next(): Promise<IteratorResult<Uint8Array>> {
    const chunk = this.chunks.shift();
    if (chunk) return Promise.resolve({ value: chunk, done: false });
    if (this.failure) return Promise.reject(this.failure);
    if (this.ended) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve) => {
      this.waiter = resolve;
    });
  }

  protected resolveWaiter(): void {
    if (!this.waiter) return;
    const waiter = this.waiter;
    this.waiter = null;
    waiter({ value: undefined, done: true });
  }
}

export namespace ChannelStreamQueue {
  export const $Class = $ChannelStreamQueue;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
