import { Duration, Effect, Exit, Option } from "effect";
import { workerClient } from "./worker-client.ts";

// A busy worker, or one without models yet, must not hold up a search: past this
// wait, or on any failure, search ranks by text alone. With no worker it does so at once.
const queryWait = Duration.seconds(5);

export const queryVector = (text: string) => {
  const query = text.trim();
  if (!query) return Effect.succeed(null);
  return workerClient.pipe(
    Effect.flatMap((worker) =>
      worker.embedQuery({ text: query }).pipe(Effect.timeoutOption(queryWait)),
    ),
    Effect.exit,
    Effect.map((exit) => (Exit.isSuccess(exit) ? Option.getOrNull(exit.value) : null)),
  );
};
