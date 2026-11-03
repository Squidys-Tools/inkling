import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { parseDeepLink } from "../../apps/desktop/src/capture/deep-link.ts";
import { validateCapturePayload } from "../../apps/desktop/src/capture/payload.ts";
import {
  buildImageCapturePayload,
  buildQuoteCapturePayload,
  buildUrlCapturePayload,
} from "./capture";
import {
  CaptureResponseError,
  buildCaptureDeepLink,
  loopbackHealth,
  postPayloadToLoopback,
} from "./transport";

describe("capture delivery", () => {
  test("every capture's link fallback reads back the same through the app's parser", () => {
    const page = buildUrlCapturePayload("https://example.com/article", "Saved page");
    const quote = buildQuoteCapturePayload("https://example.com/essay", "Keep this", "Essay");
    const image = buildImageCapturePayload(
      "https://example.com/post",
      "https://cdn.example.com/a.jpg",
      "A fox",
    );
    // The receiver validates a posted payload into this same capture, so both paths save alike.
    for (const payload of [page, quote, image]) {
      expect(parseDeepLink(buildCaptureDeepLink(payload))).toEqual(
        validateCapturePayload(Buffer.from(JSON.stringify(payload))),
      );
    }
    expect(parseDeepLink(buildCaptureDeepLink(quote))).toEqual({
      kind: "quote",
      url: "https://example.com/essay",
      selection: "Keep this",
      attribution: "Essay",
    });
  });

  test("posts the URL payload to the authenticated loopback endpoint and reads its health", async () => {
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
          body: chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined,
        };
        outgoing.writeHead(responseStatus).end();
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      await postPayloadToLoopback(baseUrl, token, payload);
      expect(request).toEqual({
        method: "POST",
        url: "/v1/captures",
        authorization: `Bearer ${token}`,
        body: payload,
      });

      expect(await loopbackHealth(baseUrl, token)).toBe("connected");

      responseStatus = 401;
      await expect(postPayloadToLoopback(baseUrl, token, payload)).rejects.toBeInstanceOf(
        CaptureResponseError,
      );
      expect(await loopbackHealth(baseUrl, token)).toBe("refused");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    expect(await loopbackHealth(baseUrl, token)).toBe("silent");
  });
});
