import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";
import {
  CardPage,
  ExportReport,
  ImportReport,
  ItemContent,
  ItemDetail,
  Job,
  LastExport,
  LibraryCard,
  LibraryChange,
  LibraryStatus,
  Space,
  SpaceColor,
  SpaceKind,
  SpaceQuery,
} from "./models.ts";

// The renderer shows `message` verbatim, so its wording is part of the contract.
export class LibraryError extends Schema.TaggedError<LibraryError>()("LibraryError", {
  message: Schema.String,
}) {}

const Text = Schema.String;
const OptionalText = Schema.optional(Schema.String);
const Metadata = Schema.Record(Schema.String, Schema.Unknown);
const ById = { id: Text };
const Ids = { ids: Schema.Array(Text) };
const call = <
  const Tag extends string,
  Payload extends Schema.Struct.Fields,
  Success extends Schema.Top,
>(
  tag: Tag,
  payload: Payload,
  success: Success,
) => Rpc.make(tag, { payload, success, error: LibraryError });

export const CreateNoteInput = Schema.Struct({
  title: OptionalText,
  body: Text,
  metadata: Schema.optional(Metadata),
});
export type CreateNoteInput = typeof CreateNoteInput.Type;

export const CreateQuoteInput = Schema.Struct({
  body: Text,
  attribution: OptionalText,
  sourceUrl: OptionalText,
  metadata: Schema.optional(Metadata),
});
export type CreateQuoteInput = typeof CreateQuoteInput.Type;

export const CaptureUrlInput = Schema.Struct({
  sourceUrl: Text,
  captureSource: OptionalText,
  title: OptionalText,
});
export type CaptureUrlInput = typeof CaptureUrlInput.Type;

export const SaveFileInput = Schema.Struct({
  fileName: Text,
  mimeType: Schema.optional(Schema.NullOr(Text)),
  kind: Schema.optional(Schema.NullOr(Text)),
  bytes: Schema.Uint8Array,
});
export type SaveFileInput = typeof SaveFileInput.Type;

export const UpdateItemInput = Schema.Struct({
  id: Text,
  title: OptionalText,
  description: OptionalText,
  body: OptionalText,
  bodyFormat: OptionalText,
  sourceUrl: OptionalText,
  sourceLabel: OptionalText,
  localAssetPath: OptionalText,
  thumbnailPath: OptionalText,
  metadata: Schema.optional(Metadata),
  metadataPatch: Schema.optional(Metadata),
  addTag: OptionalText,
});
export type UpdateItemInput = typeof UpdateItemInput.Type;

export const CreateSpaceInput = Schema.Struct({
  name: Text,
  color: Schema.optional(SpaceColor),
  query: Schema.optional(SpaceQuery),
  kind: Schema.optional(SpaceKind),
});
export type CreateSpaceInput = typeof CreateSpaceInput.Type;

export const UpdateSpaceInput = Schema.Struct({
  id: Text,
  name: OptionalText,
  color: Schema.optional(SpaceColor),
  query: Schema.optional(SpaceQuery),
  position: Schema.optional(Schema.Number),
});
export type UpdateSpaceInput = typeof UpdateSpaceInput.Type;

// The item view's record: the detail without its article HTML, which only the reader reads.
export const ItemRecord = Schema.Struct({
  ...ItemDetail.fields,
  hasArticleContent: Schema.Boolean,
});
export type ItemRecord = typeof ItemRecord.Type;

export const CardScope = Schema.Union([
  Schema.TaggedStruct("Active", {}),
  Schema.TaggedStruct("Archived", {}),
  Schema.TaggedStruct("Space", { spaceId: Text }),
]);
export type CardScope = typeof CardScope.Type;

export const LibraryRpcs = RpcGroup.make(
  call("status", {}, LibraryStatus),
  call("cards", { scope: CardScope, cursor: Schema.NullOr(Text), limit: Schema.Number }, CardPage),
  // Archived cards too: each card says which scope it belongs to. Deleted ids are absent.
  call("cardsById", Ids, Schema.Array(LibraryCard)),
  call("item", ById, Schema.NullOr(ItemRecord)),
  call("itemContent", ById, ItemContent),
  // The reader's sanitizer is the trust boundary for this HTML; null when the item has none.
  call("articleHtml", ById, Schema.NullOr(Text)),
  // `query` is plain text with no operators; a Smart Space's `kind` and `tag` are the structured filters.
  // `semantic: false` answers from text alone at once and starts the query's embedding
  // for the semantic pass that follows.
  call(
    "search",
    { query: Text, limit: Schema.Number, semantic: Schema.optional(Schema.Boolean) },
    Schema.Array(LibraryCard),
  ),
  call(
    "similar",
    { id: Text, by: Schema.Literals(["text", "image"]), limit: Schema.Number },
    Schema.Array(LibraryCard),
  ),

  call("createNote", CreateNoteInput.fields, ItemDetail),
  call("createQuote", CreateQuoteInput.fields, ItemDetail),
  call("captureUrl", CaptureUrlInput.fields, ItemDetail),
  call("saveFile", SaveFileInput.fields, ItemDetail),
  call("updateItem", UpdateItemInput.fields, LibraryCard),
  call("setArchived", { id: Text, archived: Schema.Boolean }, LibraryCard),
  call("deleteItem", ById, Schema.Void),

  call("spaces", {}, Schema.Array(Space)),
  call("createSpace", CreateSpaceInput.fields, Space),
  call("updateSpace", UpdateSpaceInput.fields, Space),
  call("deleteSpace", ById, Schema.Void),
  call("swapSpaces", { firstId: Text, secondId: Text }, Schema.Array(Space)),
  call("addToSpace", { spaceId: Text, itemId: Text }, Schema.Void),
  call("removeFromSpace", { spaceId: Text, itemId: Text }, Schema.Void),
  call("itemSpaces", { itemId: Text }, Schema.Array(Text)),

  call("jobsFor", { itemIds: Schema.Array(Text) }, Schema.Array(Job)),
  call("activeJobs", {}, Schema.Number),
  call("retryJob", { jobId: Text }, Schema.Boolean),
  call("runOcr", { itemId: Text }, Text),

  call("exportLibrary", { destination: Text, timezoneOffsetMinutes: Schema.Number }, ExportReport),
  call("importLibrary", { exportDirectory: Text }, ImportReport),
  call("lastExport", {}, Schema.NullOr(LastExport)),
  call("librarySize", { refresh: Schema.Boolean }, Schema.Number),
  call("onboardingCompleted", {}, Schema.Boolean),
  call("completeOnboarding", {}, Schema.Void),

  Rpc.make("changes", { success: LibraryChange, stream: true }),
);
