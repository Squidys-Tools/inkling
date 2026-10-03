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

  test("still allows HEAD, which fetch_http can answer", async () => {
    hops.length = 0;
    responder = () => reply(200, "");
    const response = await tauriFetch("https://example.com/ping", { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(hops).toHaveLength(1);
  });
});