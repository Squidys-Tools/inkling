import { Effect, Schema } from "effect";
import { SqlError } from "effect/sql/SqlError";

// The renderer shows these messages verbatim, so their wording is part of the contract.
class StorageError extends Schema.TaggedError<StorageError>()("StorageError", {
  message: Schema.String,
}) {}

export const invalidInput = (detail: string) =>
  new StorageError({ message: `invalid storage input: ${detail}` });

export const itemNotFound = (id: unknown) =>
  new StorageError({ message: `item not found: ${String(id)}` });

export const spaceNotFound = (id: unknown) =>
  new StorageError({ message: `space not found: ${String(id)}` });

export const storageFailure = (message: string) => new StorageError({ message });

// Wraps a promise from node:fs, sharp, or a model so its rejection stays a typed failure.
export const attempt = <A>(evaluate: (signal: AbortSignal) => PromiseLike<A>) =>
  Effect.tryPromise({ try: evaluate, catch: (cause) => cause });

// SqlError's own message is a generic summary; the SQLite message is on its cause.
export function errorMessage(error: unknown): string {
  if (error instanceof SqlError) {
    const cause = error.reason.cause;
    return cause instanceof Error ? cause.message : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export function toError(error: unknown) {
  if (!(error instanceof SqlError)) return error;
  return new Error(errorMessage(error), { cause: error });
}
