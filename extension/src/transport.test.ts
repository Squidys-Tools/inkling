import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { parseDeepLinkCaptureCore } from "../../src/lib/deepLinkCore.mjs";
import { buildUrlCapturePayload } from "./capture";
import { CaptureResponseError, buildCaptureDeepLink, postPayloadToLoopback } from "./transport";

describe("capture delivery", () => {
  test("deep-link fallback is accepted by the app's capture parser", () => {
    const payload = buildUrlCapturePayload("https://example.com/article", "Saved page");
    expect(parseDeepLinkCaptureCore(buildCaptureDeepLink(payload))).toEqual({
      kind: "url",
      url: "https://example.com/article",
      title: "Saved page",
    });
  });

  test("posts the URL payload to the authenticated loopback endpoint", async () => {
    const payload = buildUrlCapturePayload("https://example.com/article", "Saved page");
    const token = randomBytes(32).toString("hex");
    let responseStatus = 201;
    let request: { method?: string; url?: string; authorization?: string; body?: unknown } = {};
    const server = createServer((incoming, outgoing) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.on("end", () => {
        request = {
          method: incoming.method,
          url: incoming.url,
          authorization: incoming.headers.authorization,
          body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
        };
        outgoing.writeHead(responseStatus).end();
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("server did not bind");
      const baseUrl = `http://127.0.0.1:${address.port}`;
      await postPayloadToLoopback(baseUrl, token, payload);
      expect(request).toEqual({
        method: "POST",
        url: "/v1/captures",
        authorization: `Bearer ${token}`,
        body: payload,
      });

      responseStatus = 401;
      await expect(postPayloadToLoopback(baseUrl, token, payload)).rejects.toBeInstanceOf(
        CaptureResponseError,
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
