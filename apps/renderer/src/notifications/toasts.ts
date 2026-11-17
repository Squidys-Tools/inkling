import { Toast } from "@base-ui/react/toast";
import type { Space } from "@inkling/contracts";
import type { CardView, ItemKind } from "../library/cardModel.ts";
import { errorMessage } from "../library/errors.ts";

/** What a notice is about, drawn beside its words: an item's picture or kind, or a Space's cover. */
export type NoticeSubject =
  | { _tag: "Item"; kind: ItemKind; image?: string }
  | { _tag: "Space"; space: Space };

export type NoticeData = {
  subject?: NoticeSubject;
  /** Changes on every add, so a notice shown again under the same id restarts its countdown. */
  shown: number;
};

export const itemSubject = (view: Pick<CardView, "kind" | "image">): NoticeSubject => ({
  _tag: "Item",
  kind: view.kind,
  image: view.image,
});

type Notice = {
  id?: string;
  description?: string;
  subject?: NoticeSubject;
  action?: { label: string; run: () => unknown | Promise<unknown> };
  onClose?: () => void;
};

export function createNotifications() {
  const manager = Toast.createToastManager<NoticeData>();
  const active = new Map<string, Notice>();
  const running = new Set<string>();
  let sequence = 0;
  function dismiss(id: string) {
    const notice = active.get(id);
    active.delete(id);
    notice?.onClose?.();
    manager.close(id);
  }
  function add(title: string, options: Notice, error: boolean) {
    const id = options.id ?? `notice-${sequence + 1}`;
    sequence++;
    active.delete(id);
    active.set(id, options);
    // Bound retained actions too, not just the number of painted toast roots.
    while (active.size > 3) dismiss(active.keys().next().value!);
    manager.add({
      id,
      title,
      description: options.description,
      type: error ? "error" : "success",
      priority: error ? "high" : "low",
      // Errors stay until dismissed; Undo stays a little longer than a plain notice.
      timeout: error ? 0 : options.action ? 8000 : 5000,
      data: { subject: options.subject, shown: sequence },
      onClose: () => {
        if (active.get(id) === options) {
          active.delete(id);
          options.onClose?.();
        }
      },
      actionProps: options.action
        ? { children: options.action.label, onClick: () => void runAction(id) }
        : undefined,
    });
    return id;
  }
  function notify(title: string, options: Notice = {}) {
    return add(title, options, false);
  }
  function notifyError(
    title: string,
    description?: string,
    id = "action-error",
    onClose?: () => void,
  ) {
    return add(title, { id, description, onClose }, true);
  }
  async function runAction(id: string) {
    const notice = active.get(id);
    const action = notice?.action;
    if (!action || running.has(id)) return;
    running.add(id);
    try {
      await action.run();
      if (active.get(id) === notice) dismiss(id);
    } catch (error) {
      notifyError(
        "Couldn’t complete this action",
        errorMessage(error),
        active.get(id) === notice ? id : `${id}:action-error`,
      );
    } finally {
      running.delete(id);
    }
  }
  return { manager, notify, notifyError, dismiss, runAction };
}

export const notifications = createNotifications();
export const { notify, notifyError } = notifications;
