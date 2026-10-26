import { randomUUID } from "node:crypto";
import { Cause, Duration, Effect, Exit, PubSub } from "effect";
import { errorMessage } from "./errors.ts";
import { type Job, JOB_LEASE_MILLIS, JobQueue } from "./jobs.ts";

export type Processor<R> = (job: Job, workerId: string) => Effect.Effect<unknown, unknown, R>;

export type WorkerOptions<R> = {
  processors: Record<string, Processor<R>>;
  // A hung model, decoder, or fetch fails its job after this long instead of
  // holding the worker forever. Kinds without an entry get `defaultTimeout`.
  timeouts?: Partial<Record<string, Duration.Input>>;
  defaultTimeout?: Duration.Input;
  pollInterval?: Duration.Input;
  workerId?: string;
  // Runs when nothing is claimable, so backfills only queue work while the worker is free.
  onIdle?: () => Effect.Effect<unknown, unknown, R>;
};

export const makeWorker = Effect.fnUntraced(function* <R>({
  processors,
  timeouts = {},
  defaultTimeout = Duration.minutes(30),
  pollInterval = Duration.seconds(5),
  workerId = randomUUID(),
  onIdle,
}: WorkerOptions<R>) {
  const jobs = yield* JobQueue;
  const kinds = Object.keys(processors);

  const claim = Effect.gen(function* () {
    const claimed = yield* jobs.claimNext(workerId, kinds);
    if (claimed || !onIdle) return claimed;
    yield* onIdle().pipe(
      Effect.catchCause((cause) => Effect.logWarning("job backfill failed", cause)),
    );
    return yield* jobs.claimNext(workerId, kinds);
  });

  const heartbeat = (job: Job) =>
    jobs
      .renew(job.id, workerId)
      .pipe(Effect.ignore, Effect.delay(Duration.millis(JOB_LEASE_MILLIS / 2)), Effect.forever);

  const process = (job: Job) => {
    const duration = timeouts[job.kind] ?? defaultTimeout;
    return processors[job.kind](job, workerId).pipe(
      Effect.timeoutOrElse({
        duration,
        orElse: () =>
          Effect.fail(
            new Error(
              `${job.kind} timed out after ${Duration.format(Duration.fromInputUnsafe(duration))}`,
            ),
          ),
      }),
    );
  };

  // Interrupting the worker hands its current job back as pending, so quitting
  // mid-job neither strands it in processing nor spends one of its retries.
  // Only the processor is interruptible: a finished job always records its result.
  const runJob = (job: Job) =>
    Effect.uninterruptibleMask((restore) =>
      Effect.scoped(
        Effect.gen(function* () {
          yield* Effect.forkScoped(heartbeat(job));
          const exit = yield* Effect.exit(restore(process(job)));
          if (Exit.isSuccess(exit)) yield* jobs.complete(job.id, workerId);
          else if (!Cause.hasInterruptsOnly(exit.cause))
            yield* jobs.fail(job.id, workerId, errorMessage(Cause.squash(exit.cause)));
        }),
      ),
    ).pipe(Effect.onInterrupt(() => jobs.release(job.id, workerId).pipe(Effect.ignore)));

  const drain = Effect.gen(function* () {
    for (let job = yield* claim; job; job = yield* claim) yield* runJob(job);
  });

  const run = Effect.gen(function* () {
    const wake = yield* PubSub.subscribe(jobs.enqueued);
    const workQueued = Effect.gen(function* () {
      while (!(yield* PubSub.takeAll(wake)).some((kind) => kinds.includes(kind))) {}
    });
    yield* jobs.recoverExpired();
    while (true) {
      yield* drain.pipe(Effect.catchCause((cause) => Effect.logError("job worker failed", cause)));
      yield* Effect.raceFirst(workQueued, Effect.sleep(pollInterval));
    }
  });

  return { workerId, drain, run: Effect.scoped(run) };
});
