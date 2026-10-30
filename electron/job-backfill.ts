import { Effect } from "effect";
import {
  IMAGE_PALETTE_JOB,
  JobQueue,
  Library,
  PDF_THUMBNAIL_JOB,
  VIDEO_POSTER_JOB,
} from "./storage/library.ts";

type Candidates = (
  library: Library["Service"],
  cursor: number,
) => ReturnType<Library["Service"]["nextPdfThumbnailCandidate"]>;

// Each idle pass queues at most one backfill job, so a large library catches
// up a card at a time without crowding out new captures.
export function createBackfill(searchEnabled = false) {
  const scan = (kind: string, next: Candidates) => ({ kind, next, cursor: 0, done: false });
  const pdfThumbnails = scan(PDF_THUMBNAIL_JOB, (library, cursor) =>
    library.nextPdfThumbnailCandidate(cursor),
  );
  const scans = [
    scan(IMAGE_PALETTE_JOB, (library, cursor) => library.nextImagePaletteCandidate(cursor)),
    scan(VIDEO_POSTER_JOB, (library, cursor) => library.nextVideoPosterCandidate(cursor)),
    pdfThumbnails,
  ];

  const onIdle = Effect.fnUntraced(function* () {
    const library = yield* Library;
    const jobs = yield* JobQueue;
    for (const pass of scans) {
      if (pass === pdfThumbnails && searchEnabled) {
        const next = yield* library.nextSearchCandidate();
        if (next) {
          yield* jobs.enqueue(next.id, "generate_embedding");
          return;
        }
        const caption = yield* library.nextCaptionCandidate();
        if (caption) {
          yield* jobs.enqueue(caption.id, "caption_image");
          return;
        }
      }
      if (pass.done) continue;
      const next = yield* pass.next(library, pass.cursor);
      if (next) {
        yield* jobs.enqueue(next.id, pass.kind);
        pass.cursor = next.rowid;
        return;
      }
      pass.done = true;
    }
  });

  return {
    onIdle,
    rescanPdfThumbnails: () => {
      pdfThumbnails.cursor = 0;
      pdfThumbnails.done = false;
    },
  };
}
