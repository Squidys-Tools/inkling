import { useRouter } from "@tanstack/react-router";

// Each item opened from another item's Similar tab is a history step of its own,
// so Back walks through them. Close skips them all: this counts, per history
// entry, how many such steps lie between it and the library. After a reload
// the count is gone, and Close steps back once.
const similarSteps = new Map<string, number>();

export function useItemNavigation() {
  const router = useRouter();
  const current = () => {
    const { __TSR_key: key, __TSR_index: index } = router.state.location.state;
    return { index, steps: (key && similarSteps.get(key)) || 0 };
  };
  return {
    /** Back to the library entry the first item opened from, where the grid kept its scroll. */
    close: () => {
      const { index, steps } = current();
      if (index > steps) router.history.go(-(steps + 1));
      else void router.navigate({ to: "/" });
    },
    openSimilar: (id: string) => {
      const { steps } = current();
      void router.navigate({ to: "/item/$id", params: { id } }).then(() => {
        const key = router.state.location.state.__TSR_key;
        if (key) similarSteps.set(key, steps + 1);
      });
    },
  };
}

/** Steps back to the page under this one, or to `fallback` when the app opened here. */
export function useStepBack() {
  const router = useRouter();
  return (fallback: () => void) => {
    if (router.state.location.state.__TSR_index > 0) router.history.back();
    else fallback();
  };
}
