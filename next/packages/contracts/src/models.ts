import { Schema } from "effect";

const Text = Schema.String;
const NullableText = Schema.NullOr(Schema.String);
const Millis = Schema.Number;
const Metadata = Schema.Record(Schema.String, Schema.Unknown);

// The fields a card draws from. Everything else in an item's metadata stays in
// the library process until the item view asks for the detail.
export const CardMetadata = Schema.Struct({
  tags: Schema.optional(Schema.Unknown),
  social: Schema.optional(Schema.Unknown),
  imageUrls: Schema.optional(Schema.Unknown),
  imageDimensions: Schema.optional(Schema.Unknown),
  mediaWidth: Schema.optional(Schema.Unknown),
  mediaHeight: Schema.optional(Schema.Unknown),
  mediaAspectRatio: Schema.optional(Schema.Unknown),
  pdfPageCount: Schema.optional(Schema.Unknown),
  durationSeconds: Schema.optional(Schema.Unknown),
  fileSizeBytes: Schema.optional(Schema.Unknown),
  readingMinutes: Schema.optional(Schema.Unknown),
});

const itemFields = {
  id: Text,
  // Older libraries hold kinds this build no longer writes, so reads keep any string.
  kind: Text,
  title: NullableText,
  description: NullableText,
  sourceUrl: NullableText,
  sourceLabel: NullableText,
  localAssetPath: NullableText,
  thumbnailPath: NullableText,
  palette: Schema.optional(Schema.Array(Text)),
  ocrText: Text,
  createdAt: Millis,
  archived: Schema.Boolean,
};

export const LibraryCard = Schema.Struct({
  ...itemFields,
  metadata: CardMetadata,
  hasArticleContent: Schema.Boolean,
});
export type LibraryCard = typeof LibraryCard.Type;

export const ItemDetail = Schema.Struct({
  ...itemFields,
  body: Text,
  bodyFormat: Text,
  metadata: Metadata,
  updatedAt: Millis,
});
export type ItemDetail = typeof ItemDetail.Type;

export const ItemContent = Schema.Struct({ id: Text, body: Text, bodyFormat: Text });
export type ItemContent = typeof ItemContent.Type;

export const CardPage = Schema.Struct({
  cards: Schema.Array(LibraryCard),
  // Opaque to the renderer; pass it back to read the next page.
  next: Schema.NullOr(Text),
  total: Schema.Number,
});
export type CardPage = typeof CardPage.Type;

/** A "smart" Space re-runs its saved query; a "regular" Space holds the items
 *  the user filed into it. Fixed at creation. */
export const SpaceKind = Schema.Literals(["smart", "regular"]);
export type SpaceKind = typeof SpaceKind.Type;
export const SpaceColor = Schema.Literals(["blue", "orange", "green", "pink", "purple", "yellow"]);
export type SpaceColor = typeof SpaceColor.Type;
export const SpaceQuery = Schema.Struct({
  text: Schema.optional(NullableText),
  kind: Schema.optional(NullableText),
  tag: Schema.optional(NullableText),
});
export type SpaceQuery = typeof SpaceQuery.Type;

export const Space = Schema.Struct({
  id: Text,
  name: Text,
  color: SpaceColor,
  query: SpaceQuery,
  kind: SpaceKind,
  position: Schema.Number,
  createdAt: Millis,
  updatedAt: Millis,
  /** Set for Regular Spaces only; a Smart Space has no stored membership to count. */
  itemCount: Schema.optional(Schema.Number),
});
export type Space = typeof Space.Type;

export const JobKind = Schema.String;
export const JobStatus = Schema.Literals(["pending", "processing", "completed", "failed"]);
export type JobStatus = typeof JobStatus.Type;

export const Job = Schema.Struct({
  id: Text,
  itemId: Text,
  kind: JobKind,
  status: JobStatus,
  retryCount: Schema.Number,
  maxRetries: Schema.Number,
  errorMessage: NullableText,
  createdAt: Millis,
  startedAt: Schema.NullOr(Millis),
  completedAt: Schema.NullOr(Millis),
  progressCurrent: Schema.Number,
  progressTotal: Schema.NullOr(Schema.Number),
  progressMessage: NullableText,
});
export type Job = typeof Job.Type;

export const LibraryStatus = Schema.Struct({
  databasePath: Text,
  fts5Enabled: Schema.Boolean,
  schemaVersion: Schema.Number,
  itemCount: Schema.Number,
});
export type LibraryStatus = typeof LibraryStatus.Type;

export const ExportReport = Schema.Struct({
  directory: Text,
  items: Schema.Number,
  archivedItems: Schema.Number,
  spaces: Schema.Number,
  assetFiles: Schema.Number,
  skippedAssets: Schema.Number,
  databaseBytes: Schema.Number,
  assetsBytes: Schema.Number,
});
export type ExportReport = typeof ExportReport.Type;

export const ImportReport = Schema.Struct({
  importedItems: Schema.Number,
  skippedDuplicateItems: Schema.Number,
  importedSpaces: Schema.Number,
  skippedDuplicateSpaces: Schema.Number,
  assetFiles: Schema.Number,
  unverifiedAssetFiles: Schema.Number,
});
export type ImportReport = typeof ImportReport.Type;

export const LastExport = Schema.Struct({ exportedAt: Millis, items: Schema.Number });
export type LastExport = typeof LastExport.Type;

/** What changed in the library. The renderer refetches only the named items. */
export const LibraryChange = Schema.Union([
  Schema.TaggedStruct("ItemsChanged", { ids: Schema.Array(Text) }),
  Schema.TaggedStruct("ItemsRemoved", { ids: Schema.Array(Text) }),
  Schema.TaggedStruct("SpacesChanged", {}),
  Schema.TaggedStruct("JobsChanged", { itemIds: Schema.Array(Text) }),
]);
export type LibraryChange = typeof LibraryChange.Type;
