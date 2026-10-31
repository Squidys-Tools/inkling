import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

// The worker process is stateless compute. The library process owns the queue
// and every write; it resolves asset paths inside the library before sending
// them, because bytes cross this boundary as base64 and originals can be 50 MB.

export const TEXT_MODEL = "nomic-embed-text-v1.5";
export const TEXT_DIMENSION = 768;

// The suffix marks vectors made with sharp's resize. Older image vectors carry another
// name, so search skips them and startup queues them to be embedded again.
export const IMAGE_MODEL = "nomic-embed-vision-v1.5-sharp";
export const IMAGE_DIMENSION = 768;

export class WorkerError extends Schema.TaggedError<WorkerError>()("WorkerError", {
  message: Schema.String,
}) {}

const Text = Schema.String;
const Path = { path: Text };

/** A WebP card image and the oriented size of what it was made from. */
export const Thumbnail = Schema.Struct({
  bytes: Schema.Uint8Array,
  width: Schema.NullOr(Schema.Number),
  height: Schema.NullOr(Schema.Number),
});
export type Thumbnail = typeof Thumbnail.Type;

export const Embedding = Schema.Struct({
  model: Text,
  bytes: Schema.Uint8Array,
  dimension: Schema.Number,
});
export type Embedding = typeof Embedding.Type;

/** What reading a PDF reports, in order: progress, the page-one thumbnail, then its text. */
export const PdfEvent = Schema.Union([
  Schema.TaggedStruct("Progress", { current: Schema.Number, total: Schema.Number, message: Text }),
  Schema.TaggedStruct("FirstPage", { thumbnail: Thumbnail }),
  Schema.TaggedStruct("Text", { text: Text, engine: Text, pageCount: Schema.Number }),
]);
export type PdfEvent = typeof PdfEvent.Type;

const ImageDimensions = Schema.Struct({ url: Text, width: Schema.Number, height: Schema.Number });
const SafeEmbed = Schema.Struct({
  kind: Schema.Literals(["iframe", "video", "audio"]),
  provider: Schema.Literals([
    "direct",
    "loom",
    "soundcloud",
    "spotify",
    "twitch",
    "vimeo",
    "youtube",
  ]),
  sourceUrl: Text,
  embedUrl: Text,
  title: Schema.optional(Text),
});
const XPost = Schema.Struct({
  provider: Schema.Literal("x"),
  postUrl: Text,
  postId: Text,
  embedHtml: Schema.optional(Text),
  authorName: Schema.optional(Text),
  authorUrl: Schema.optional(Text),
  authorHandle: Schema.optional(Text),
  text: Schema.optional(Text),
  publishedDate: Schema.optional(Schema.NullOr(Text)),
  width: Schema.optional(Schema.NullOr(Schema.Number)),
});

export const UrlArticle = Schema.Struct({
  sourceUrl: Text,
  fetchedUrl: Text,
  canonicalUrl: Text,
  title: Text,
  description: Text,
  author: Text,
  publishedDate: Schema.NullOr(Text),
  html: Text,
  text: Text,
  imageUrls: Schema.Array(Text),
  imageDimensions: Schema.Array(ImageDimensions),
  safeEmbeds: Schema.Array(SafeEmbed),
  extractor: Schema.Literals(["defuddle", "fallback"]),
  social: Schema.optional(XPost),
});
export type UrlArticle = typeof UrlArticle.Type;

const call = <
  const Tag extends string,
  Payload extends Schema.Struct.Fields,
  Success extends Schema.Top,
>(
  tag: Tag,
  payload: Payload,
  success: Success,
) => Rpc.make(tag, { payload, success, error: WorkerError });

export const WorkerRpcs = RpcGroup.make(
  call("recognizeImage", Path, Text),
  Rpc.make("readPdf", {
    payload: { ...Path, firstPageThumbnail: Schema.Boolean },
    success: PdfEvent,
    error: WorkerError,
    stream: true,
  }),
  call("pdfThumbnail", Path, Thumbnail),
  call("imageThumbnail", Path, Thumbnail),
  call("imagePalette", Path, Schema.Array(Text)),
  // Null when neither the system thumbnailer nor a local decoder can read the video.
  call("videoPoster", Path, Schema.NullOr(Thumbnail)),
  call("embedText", { text: Text }, Embedding),
  call("embedImage", Path, Embedding),
  // Never downloads models: a search must not wait on, or cause, network use.
  call("embedQuery", { text: Text }, Schema.Array(Schema.Number)),
  call("extractUrl", { url: Text }, UrlArticle),
);

/**
 * Windows and macOS posters come from the shell thumbnailer, which only main
 * can reach. The worker asks over its parent port and main answers in kind.
 */
// Ids are unique across worker restarts, so a reply meant for a dead worker cannot
// answer a new worker's request.
export type ShellThumbnailRequest = {
  type: "shell-thumbnail";
  id: string;
  path: string;
  edge: number;
};
export type ShellThumbnailReply = {
  type: "shell-thumbnail";
  id: string;
  png: Uint8Array | null;
};
