import type { ItemRecord } from "@inkling/contracts";
import { useEffect } from "react";
import { libraryClient } from "../library/connection.ts";

// Once per item per session: a failed or empty run is not retried on every open.
const requested = new Set<string>();

/** Opening an image or PDF with no text and no OCR job asks the library to read it. */
export function useOcrOnOpen(detail: ItemRecord | null | undefined) {
  const id = detail?.id;
  const kind = detail?.kind.toLowerCase();
  const needsText = kind === "image" || kind === "pdf" ? !detail?.ocrText.trim() : false;
  useEffect(() => {
    if (!id || !needsText || requested.has(id)) return;
    requested.add(id);
    void libraryClient()
      .then(async (client) => {
        const jobs = await client.jobsFor({ itemIds: [id] });
        if (!jobs.some((job) => job.kind === "ocr_image" || job.kind === "ocr_pdf_page"))
          await client.runOcr({ itemId: id });
      })
      .catch(() => requested.delete(id));
  }, [id, needsText]);
}
