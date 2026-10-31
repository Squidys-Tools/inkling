import { expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";

class FakeProcess extends EventEmitter {
  sent: unknown[] = [];
  postMessage(message: unknown) {
    this.sent.push(message);
  }
  kill() {}
}
const forked: FakeProcess[] = [];
// The real module needs an Electron runtime; the supervisor only forks and listens.
mock.module("electron", () => ({
  utilityProcess: {
    fork: () => {
      const child = new FakeProcess();
      forked.push(child);
      return child;
    },
  },
}));
const { superviseUtilityProcess } = await import("./utility-process.ts");

// regression: a video poster answered for a crashed worker reached its replacement.
test("a reply goes only to the process that asked, never to its replacement", () => {
  const supervisor = superviseUtilityProcess({
    entry: "worker.mjs",
    args: [],
    serviceName: "test worker",
    onRestart: () => {},
    onGiveUp: () => {},
  });
  const replies: ((answer: unknown) => void)[] = [];
  supervisor.onMessage((_, reply) => replies.push(reply));
  const [first] = forked;
  first.emit("message", "asked before the crash");
  first.emit("exit", 1);
  const second = forked[1];
  second.emit("message", "asked after the restart");

  replies[0]("answer for the crashed process");
  replies[1]("answer for the new process");
  expect(first.sent).toEqual([]);
  expect(second.sent).toEqual(["answer for the new process"]);
});
