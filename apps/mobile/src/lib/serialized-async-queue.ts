// From t3code's apps/mobile/src/lib/serialized-async-queue.ts (MIT, Copyright (c) 2026 T3 Tools Inc.).
/** Runs each operation after the previous one settles, whether it succeeded or failed. */
export class SerializedAsyncQueue {
  private tail: Promise<void> = Promise.resolve();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
