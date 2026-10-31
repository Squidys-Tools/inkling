import { expect, test } from "bun:test";
import type { FailedCapture } from "@inkling/contracts/desktop";
import { downloadImage } from "./image-download.ts";
import { deepLinkInbox } from "./save.ts";

const link = (query: Record<string, string>) =>
  `inkling://capture?${new URLSearchParams(query).toString()}`;

test("links save in arrival order, an image that will not download keeps its page, and a failure does not stop the rest", async () => {
  const calls: unknown[] = [];
  const failures: FailedCapture[] = [];
  const library = {
    captureUrl: async (input: { sourceUrl: string }) => {
      calls.push(["captureUrl", input]);
      if (input.sourceUrl === "https://read-only.example/")
        throw new Error("The library is read-only.");
    },
    createQuote: async (input: unknown) => void calls.push(["createQuote", input]),
    saveFile: async (input: unknown) => void calls.push(["saveFile", input]),
  };
  const receive = deepLinkInbox({
    library: async () => library,
    downloadImage: async () => {
      throw new Error("HTTP 403");
    },
    onFailure: (failure) => failures.push(failure),
  });

  receive(link({ url: "https://example.com/essay", title: "Essay", selection: "Keep this" }));
  receive(link({ url: "https://example.com/post", image: "https://cdn.example.com/a.jpg" }));
  receive("inkling://open?url=https%3A%2F%2Fexample.com%2F");
  receive(link({ url: "https://read-only.example/" }));
  await receive(link({ url: "https://example.com/after", title: "After" }));

  expect(calls).toEqual([
    [
      "createQuote",
      {
        body: "Keep this",
        attribution: "Essay",
        sourceUrl: "https://example.com/essay",
        metadata: { captureSource: "browser extension" },
      },
    ],
    ["captureUrl", { sourceUrl: "https://example.com/post", captureSource: "browser extension" }],
    [
      "captureUrl",
      {
        sourceUrl: "https://read-only.example/",
        title: undefined,
        captureSource: "browser extension",
      },
    ],
    [
      "captureUrl",
      {
        sourceUrl: "https://example.com/after",
        title: "After",
        captureSource: "browser extension",
      },
    ],
  ]);
  expect(failures).toEqual([
    { url: "https://read-only.example/", message: "The library is read-only." },
  ]);
});

test("an image download checks every redirect hop, the content type and the size before saving", async () => {
  const requested: string[] = [];
  const respond = (responses: Record<string, () => Response>) => async (url: string) => {
    requested.push(url);
    return responses[url]();
  };
  // Bodies record their cancellation, since an unread one holds its connection open.
  const cancelled: string[] = [];
  const body = (name: string) =>
    new ReadableStream({
      pull: (controller) => controller.enqueue(new Uint8Array(1)),
      cancel: () => {
        cancelled.push(name);
      },
    });
  const redirect = (location: string) => () =>
    new Response(body(`redirect to ${location}`), { status: 302, headers: { location } });
  const lookup = async (hostname: string) => [
    { address: hostname.endsWith("nip.io") ? "127.0.0.1" : "93.184.215.14" },
  ];
  const image =
    (body: BodyInit, headers: Record<string, string> = {}) =>
    () =>
      new Response(body, { headers: { "content-type": "image/png", ...headers } });

  const saved = await downloadImage(
    "https://example.com/a",
    respond({
      "https://example.com/a": redirect("/photos/cat.png?size=large"),
      "https://example.com/photos/cat.png?size=large": image(new Uint8Array([1, 2, 3])),
    }),
    lookup,
  );
  expect(saved).toEqual({
    fileName: "cat.png",
    mimeType: "image/png",
    bytes: Buffer.from([1, 2, 3]),
  });

  requested.length = 0;
  await expect(
    downloadImage(
      "https://example.com/b",
      respond({ "https://example.com/b": redirect("http://192.168.1.1/admin.png") }),
      lookup,
    ),
  ).rejects.toThrow("public address");
  expect(requested).toEqual(["https://example.com/b"]);

  const oversized = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(8 * 1024 * 1024));
    },
  });
  await expect(
    downloadImage(
      "https://example.com/c",
      respond({ "https://example.com/c": image(oversized, { "content-length": "10" }) }),
      lookup,
    ),
  ).rejects.toThrow("larger than 50 MB");
  await expect(
    downloadImage(
      "https://example.com/d",
      respond({
        "https://example.com/d": () =>
          new Response(body("html page"), { headers: { "content-type": "text/html" } }),
      }),
      lookup,
    ),
  ).rejects.toThrow("not point to an image");

  // regression: a public-looking name that resolves to this machine reached it.
  requested.length = 0;
  await expect(
    downloadImage(
      "https://example.com/e",
      respond({ "https://example.com/e": redirect("https://127.0.0.1.nip.io/admin.png") }),
      lookup,
    ),
  ).rejects.toThrow("Private network");
  expect(requested).toEqual(["https://example.com/e"]);
  // regression: redirect and refused bodies were left unread and open.
  expect(cancelled).toEqual([
    "redirect to /photos/cat.png?size=large",
    "redirect to http://192.168.1.1/admin.png",
    "html page",
    "redirect to https://127.0.0.1.nip.io/admin.png",
  ]);
});
