import type { LibraryChange } from "@inkling/contracts";
import { useEffect, useEffectEvent, useState } from "react";
import { type LibraryClient, libraryClient, onReconnect } from "../library/connection.ts";
import { errorMessage } from "../library/errors.ts";

type Settled<T> = { key: string; value: T } | { key: string; error: string };

/**
 * Loads `load(client)` for `key`, and again whenever a library change passes
 * `affects`, a restore replaces the library, or the library process restarts.
 * Only the newest request's answer is kept, so a slow earlier answer never
 * replaces a later one.
 */
export function useLibraryQuery<T>(
  key: string,
  load: (client: LibraryClient) => Promise<T>,
  affects: (change: LibraryChange) => boolean,
) {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const loadNow = useEffectEvent(load);
  const isAffected = useEffectEvent(affects);

  useEffect(() => {
    let active = true;
    let latest = 0;
    let stopChanges: (() => void) | undefined;
    const refresh = (client: LibraryClient) => {
      const request = ++latest;
      loadNow(client).then(
        (value) => {
          if (active && request === latest) setSettled({ key, value });
        },
        (error: unknown) => {
          if (active && request === latest) setSettled({ key, error: errorMessage(error) });
        },
      );
    };
    const follow = (client: LibraryClient) => {
      stopChanges?.();
      stopChanges = client.changes((change) => {
        if (change._tag === "LibraryReplaced" || isAffected(change)) refresh(client);
      });
      refresh(client);
    };
    libraryClient().then(
      (client) => {
        if (active) follow(client);
      },
      (error: unknown) => {
        if (active) setSettled({ key, error: errorMessage(error) });
      },
    );
    const stopReconnect = onReconnect((client) => {
      if (active) follow(client);
    });
    return () => {
      active = false;
      stopChanges?.();
      stopReconnect();
    };
  }, [key]);

  const current = settled?.key === key ? settled : null;
  return {
    value: current && "value" in current ? current.value : undefined,
    error: current && "error" in current ? current.error : null,
    loading: current === null,
  };
}
