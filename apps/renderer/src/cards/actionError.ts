import { notifications, notifyError } from "../notifications/toasts.ts";

export const reportActionError = (message: string) => notifyError(message);
export const dismissActionError = () => notifications.dismiss("action-error");
