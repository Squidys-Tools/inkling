import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect } from "effect";
import { Reactivity } from "effect/reactivity";
import type { SqlClient } from "effect/sql/SqlClient";

// Reads a database file other than the library, such as an export, through its
// own client that closes when the read finishes.
export const withDatabaseFile = <A, E>(
  config: SqliteClient.SqliteClientConfig,
  read: (sql: SqlClient) => Effect.Effect<A, E>,
) =>
  SqliteClient.make(config).pipe(
    Effect.flatMap(read),
    Effect.scoped,
    Effect.provide(Reactivity.layer),
  );
