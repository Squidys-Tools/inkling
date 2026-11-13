import { captureReceiverPorts } from "@inkling/contracts/capture";

export const TOKEN_KEY = "inkling.token";
export const PORT_KEY = "inkling.port";

export const receiverUrl = (port: number) => `http://127.0.0.1:${port}`;

/** The app's ports, the one that last answered first. A stored port outside the list is ignored. */
export function portsToTry(lastPort: unknown) {
  const known = captureReceiverPorts.find((port) => port === lastPort);
  return known === undefined
    ? captureReceiverPorts
    : [known, ...captureReceiverPorts.filter((port) => port !== known)];
}

export function isPairingToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-z\d]{32,128}$/iu.test(value);
}
