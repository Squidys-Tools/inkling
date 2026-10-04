import { describe, expect, mock, test } from "bun:test";

interface Hop {
  url: string;
  accept: string;
  userAgent: string;
  timeoutMs: number;
  maxBytes: number;
}

const hops: Hop[] = [];
let responder: (hop: Hop) => unknown = () => {
  throw new Error("no responder configured");
};

mock.module("@tauri-apps/api/core", () => ({
  invoke: async (command: string, args: Hop) => {
    if (command !== "fetch_http") throw new Error(`unexpected command ${command}`);
    hops.push(args);
    return responder(args);
  },
}));

const { tauriFetch } = await import("./tauriFetch");

function reply(status: number, body: string, headers: Record<string, string> = {}) {
  return { status, headers, body };
}

describe("tauriFetch", () => {
  test("returns a non-2xx response with its body instead of throwing it away", async () => {
    hops.length = 0;
    responder = () => reply(404, "<h1>Not found</h1>", { "content-type": "text/html" });
    const response = await tauriFetch("https://example.com/gone");
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("<h1>Not found</h1>");
    expect(response.headers.get("content-type")).toBe("text/html");
  });

  test("manual redirect returns the 3xx without requesting the destination", async () => {
    hops.length = 0;
    responder = () => reply(301, "", { location: "https://example.com/moved" });
    const response = await tauriFetch("https://example.com/start", { redirect: "manual" });
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://example.com/moved");
    expect(hops).toHaveLength(1);
  });

  test("follow walks each hop exactly once and resolves a relative location", async () => {
    hops.length = 0;
    responder = (hop) =>
      hop.url === "https://example.com/start"
        ? reply(302, "", { location: "/next" })
        : reply(200, "done", { "content-type": "text/html" });
    const response = await tauriFetch("https://example.com/start");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("done");
    expect(hops.map((hop) => hop.url)).toEqual([
      "https://example.com/start",
      "https://example.com/next",
    ]);
  });

  test("error redirect throws rather than following", async () => {
    hops.length = 0;
    responder = () => reply(302, "", { location: "https://example.com/next" });
    await expect(
      tauriFetch("https://example.com/start", { redirect: "error" }),
    ).rejects.toThrow(TypeError);
    expect(hops).toHaveLength(1);
  });

  test("a 204 is constructed with a null body", async () => {
    hops.length = 0;
    responder = () => reply(204, "");
    const response = await tauriFetch("https://example.com/empty");
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });

  test("a Request input's headers reach the hop, and init overrides them", async () => {
    hops.length = 0;
    responder = () => reply(200, "ok");
    await tauriFetch(
      new Request("https://example.com/h", { headers: { Accept: "text/html", "User-Agent": "probe/1" } }),
      { headers: { Accept: "application/json" } },
    );
    // fetch_http only carries Accept and User-Agent; the merged pair is what
    // must reflect the Request input plus the init override.
    expect(hops[0].accept).toBe("application/json");
    expect(hops[0].userAgent).toBe("probe/1");
    expect(hops[0].maxBytes).toBeGreaterThan(0);
  });

  test("falls back to the default agent and accept for a bare URL", async () => {
    hops.length = 0;
    responder = () => reply(200, "ok");
    await tauriFetch("https://example.com/bare");
    expect(hops[0].accept).toBe("*/*");
    expect(hops[0].userAgent).toBe("inkling/0.1 (+local article capture)");
  });

  test("refuses a method fetch_http cannot send instead of quietly GETting", async () => {
    hops.length = 0;
    responder = () => reply(200, "ok");
    await expect(
      tauriFetch("https://example.com/submit", { method: "POST", body: "a=1" }),
    ).rejects.toThrow(/cannot send POST/);
    // Nothing may reach the bridge: a silent GET would look like a capture
    // that quietly lost its body.
    expect(hops).toHaveLength(0);
  });

  test("refuses a POST carried on the Request input rather than the init", async () => {
    hops.length = 0;
    responder = () => reply(200, "ok");
    await expect(
      tauriFetch(new Request("https://example.com/submit", { method: "PUT" })),
    ).rejects.toThrow(/cannot send PUT/);
    expect(hops).toHaveLength(0);
  });

  test("refuses HEAD, which fetch_http cannot answer", async () => {
    // The Rust command calls `agent.get(...)` and takes no method argument, so
    // a HEAD here would come back as a full GET body. Returning that under a HEAD
    // request is worse than refusing, so only GET is admitted.
    hops.length = 0;
    responder = () => reply(200, "");
    await expect(
      tauriFetch("https://example.com/ping", { method: "HEAD" }),
    ).rejects.toThrow(/cannot send HEAD/);
    expect(hops).toHaveLength(0);
  });

  test("refuses a body instead of dropping it", async () => {
    hops.length = 0;
    responder = () => reply(200, "");
    await expect(
      tauriFetch("https://example.com/p", { body: "a=1" }),
    ).rejects.toThrow(/cannot send a body/);
    expect(hops).toHaveLength(0);
  });

  test("takes a Request's own signal when init omits one", async () => {
    hops.length = 0;
    responder = () => reply(200, "ok");
    const controller = new AbortController();
    controller.abort();
    const request = new Request("https://example.com/aborted", { signal: controller.signal });
    // Already-aborted is rejected before any hop is requested, which is the
    // behaviour worth pinning: the caller's own signal reaches the wrapper even
    // with no `init` to carry it.
    await expect(tauriFetch(request)).rejects.toThrow();
    expect(hops).toHaveLength(0);
  });

  test("a Request's redirect mode is honoured when init omits one", async () => {
    hops.length = 0;
    responder = () => reply(301, "", { location: "https://example.com/moved" });
    const request = new Request("https://example.com/start", { redirect: "manual" });
    const response = await tauriFetch(request);
    expect(response.status).toBe(301);
    expect(hops).toHaveLength(1);
  });

  test("follows a chain of exactly MAX_REDIRECTS hops", async () => {
    hops.length = 0;
    let served = 0;
    responder = () => {
      served += 1;
      return served <= 20
        ? reply(302, "", { location: `https://example.com/hop${served}` })
        : reply(200, "arrived");
    };
    const response = await tauriFetch("https://example.com/0");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("arrived");
    // 20 redirects plus the request that lands on the destination.
    expect(hops).toHaveLength(21);
  });

  test("still refuses a chain past the redirect limit", async () => {
    hops.length = 0;
    responder = () => reply(302, "", { location: "https://example.com/loop" });
    await expect(tauriFetch("https://example.com/0")).rejects.toThrow(/too many redirects/);
  });
});