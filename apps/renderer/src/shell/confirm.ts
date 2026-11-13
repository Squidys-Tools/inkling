export type ConfirmRequest = {
  message: string;
  detail?: string;
  confirmLabel: string;
  destructive?: boolean;
};

type Pending = ConfirmRequest & { answer: (confirmed: boolean) => void };

let pending: Pending | null = null;
const listeners = new Set<() => void>();

function publish(next: Pending | null) {
  pending = next;
  for (const listener of listeners) listener();
}

/**
 * Asks in the app's own dialog, which `ConfirmDialog` draws. A new question
 * while one is open answers the open one with Cancel, so no caller waits forever.
 */
export function confirm(request: ConfirmRequest) {
  return new Promise<boolean>((resolve) => {
    pending?.answer(false);
    publish({ ...request, answer: resolve });
  });
}

export function answerConfirm(confirmed: boolean) {
  const current = pending;
  if (!current) return;
  publish(null);
  current.answer(confirmed);
}

export const confirmRequests = {
  get: (): ConfirmRequest | null => pending,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
};
