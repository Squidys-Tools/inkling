import { expect, test } from "bun:test";
import { frameMessage } from "./xFrameMessage.ts";

// The messages X's Tweet.html frame posted for a real post, in order.
const embed = (method: string, params: unknown[]) => ({
  "twttr.embed": { jsonrpc: "2.0", method, id: "embed-0", params },
});

test.each<[unknown, ReturnType<typeof frameMessage>]>([
  [embed("twttr.private.initialized", [{ data: { tweet_id: "20" } }]), null],
  [embed("twttr.private.results", [{ data: { tweet_id: "20" } }]), null],
  [
    embed("twttr.private.resize", [{ width: 535, height: 225, data: { tweet_id: "20" } }]),
    { height: 225 },
  ],
  [embed("twttr.private.rendered", [{ data: { tweet_id: "20" } }]), { outcome: "ready" }],
  [embed("twttr.private.no_results", [{ data: { tweet_id: "1" } }]), { outcome: "failed" }],
  [embed("twttr.private.resize", [{ height: 0 }]), null],
  [embed("twttr.private.resize", []), null],
  ["twttr.private.rendered", null],
  [{ method: "twttr.private.rendered" }, null],
])("reads X's frame message %#", (data, expected) => {
  expect(frameMessage(data)).toEqual(expected);
});
