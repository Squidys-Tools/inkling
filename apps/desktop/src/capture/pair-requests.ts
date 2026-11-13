import { randomBytes } from "node:crypto";

type PairRequest = { id: string; state: "pending" | "approved" | "denied"; cancel: () => void };

/**
 * The extension's requests to be handed the pairing token. One waits at a time:
 * a second request while the user is deciding cancels both, so another extension
 * cannot slip its own request under the user's click.
 */
export function createPairRequests(approve: (signal: AbortSignal) => Promise<boolean>) {
  let current: PairRequest | undefined;
  return {
    start() {
      if (current?.state === "pending") {
        current.state = "denied";
        current.cancel();
        return null;
      }
      const abort = new AbortController();
      const request: PairRequest = {
        id: randomBytes(16).toString("hex"),
        state: "pending",
        cancel: () => abort.abort(),
      };
      current = request;
      void approve(abort.signal).then(
        (approved) => {
          if (request.state === "pending") request.state = approved ? "approved" : "denied";
        },
        () => {
          request.state = "denied";
        },
      );
      return request.id;
    },
    /** The answer is read once: an approval hands the token over a single time. */
    read(id: string) {
      if (current?.id !== id) return null;
      const { state } = current;
      if (state !== "pending") current = undefined;
      return state;
    },
    cancel() {
      if (current?.state === "pending") current.state = "denied";
      current?.cancel();
    },
  };
}
