import { Schema } from "effect";
import { SpaceColor, SpaceKind } from "./models.ts";

// Argument schemas check shape only. Storage keeps the semantic checks (empty
// text, URL schemes, byte limits) so its messages stay the ones users see.
const Text = Schema.String;
const OptionalText = Schema.optional(Schema.String);
const NullableText = Schema.optional(Schema.NullOr(Schema.String));
const Metadata = Schema.Record(Schema.String, Schema.Unknown);
const SpaceQuery = Schema.Struct({ text: NullableText, kind: NullableText, tag: NullableText });

export const CreateNoteInput = Schema.Struct({
  title: OptionalText,
  body: Text,
  metadata: Schema.optional(Metadata),
});

export const CreateQuoteInput = Schema.Struct({
  body: Text,
  attribution: OptionalText,
  sourceUrl: OptionalText,
  metadata: Schema.optional(Metadata),
});

export const CaptureUrlInput = Schema.Struct({
  sourceUrl: Text,
  captureSource: OptionalText,
  title: OptionalText,
});

export const SaveFileInput = Schema.Struct({
  fileName: Text,
  mimeType: NullableText,
  kind: NullableText,
  // Structured clone moves a typed array as one block across IPC; storage
  // refuses anything else, such as a number array, with its own message.
  bytes: Schema.Unknown,
});

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

export const CreateSpaceInput = Schema.Struct({
  name: Text,
  color: Schema.optional(SpaceColor),
  query: Schema.optional(SpaceQuery),
  kind: Schema.optional(SpaceKind),
});

export const UpdateSpaceInput = Schema.Struct({
  id: Text,
  name: OptionalText,
  color: Schema.optional(SpaceColor),
  query: Schema.optional(SpaceQuery),
  position: Schema.optional(Schema.Number),
});

export type CreateNoteInput = typeof CreateNoteInput.Type;
export type CreateQuoteInput = typeof CreateQuoteInput.Type;
export type CaptureUrlInput = typeof CaptureUrlInput.Type;
export type SaveFileInput = typeof SaveFileInput.Type;
export type UpdateItemInput = typeof UpdateItemInput.Type;
export type CreateSpaceInput = typeof CreateSpaceInput.Type;
export type UpdateSpaceInput = typeof UpdateSpaceInput.Type;
