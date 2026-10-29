import { useEffect, useState } from "react";
import type { SearchAnnotation } from "@inkling/contracts";
import {
  getSearchAnnotation,
  isDesktopRuntime,
  listenForJobUpdates,
  removeSearchTag,
} from "../../lib/libraryApi";

export function SearchDetails({ id }: { id: string }) {
  const [annotation, setAnnotation] = useState<SearchAnnotation | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let cancelled = false;
    const refresh = () =>
      getSearchAnnotation(id)
        .then((value) => {
          if (!cancelled) setAnnotation(value);
        })
        .catch(() => {});
    void refresh();
    let remove: (() => void) | undefined;
    void listenForJobUpdates((payload) => {
      if (payload.itemId === id) void refresh();
    }).then((unsubscribe) => {
      if (cancelled) unsubscribe();
      else remove = unsubscribe;
    });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [id]);
  if (!annotation) return null;
  return (
    <section className="flex flex-col gap-2">
      <p className="m-0 text-[13px]/5 text-ink-soft">{annotation.caption}</p>
      <div className="flex flex-wrap gap-2">
        {annotation.tags.map((tag) => (
          <button
            key={tag}
            type="button"
            className="text-[13px]/4 text-muted hover:text-ink"
            aria-label={`Remove suggested tag ${tag}`}
            onClick={() => {
              setError(null);
              void removeSearchTag(id, tag)
                .then(setAnnotation)
                .catch(() => setError("That tag could not be removed. Try again."));
            }}
          >
            #{tag} ×
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="m-0 text-[12px] text-muted">
          {error}
        </p>
      )}
    </section>
  );
}
