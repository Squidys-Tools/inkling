import type { DatabaseSync } from "node:sqlite";
import { extname } from "node:path";

export const SCREENSHOT_SOURCE_LABEL = "Screenshots";

const pad = (value: number) => String(value).padStart(2, "0");

// Windows "Screenshot 2026-11-15 114827", Android "Screenshot_2026-11-15-11-48-27-05_<hash>"
// and "Screenshot_20261115-114827", macOS "Screenshot 2026-11-15 at 11.48.27 PM".
const stamped =
  /(?<!\d)(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})(?:(?:[ _-]|\s+at\s+)(\d{1,2})[.:_-]?(\d{2})[.:_-]?(\d{2})(?!\d{2})(?:\s*([AP])\.?M\.?)?)?/i;

function dateFromName(fileName: string) {
  const match = stamped.exec(fileName);
  if (!match) return null;
  const [, year, month, day, rawHour, minute, second, meridiem] = match;
  if (+month < 1 || +month > 12 || +day < 1 || +day > 31) return null;
  const date = `${year}-${month}-${day}`;
  if (rawHour === undefined) return { date, time: null };
  let hour = +rawHour;
  if (meridiem) hour = (hour % 12) + (meridiem.toUpperCase() === "P" ? 12 : 0);
  if (hour > 23 || +minute > 59 || +second > 59) return { date, time: null };
  return { date, time: `${pad(hour)}.${minute}.${second}` };
}

/**
 * "Screenshot - 2026-11-15 11.48.27.png": the moment in the file's own name when it has one,
 * otherwise the local time it was saved. Pure, so the same row always gets the same title.
 */
export function screenshotTitle(fileName: string, savedAt: number) {
  const named = dateFromName(fileName);
  const saved = new Date(savedAt);
  const date =
    named?.date ?? `${saved.getFullYear()}-${pad(saved.getMonth() + 1)}-${pad(saved.getDate())}`;
  const time = named
    ? named.time
    : `${pad(saved.getHours())}.${pad(saved.getMinutes())}.${pad(saved.getSeconds())}`;
  const extension = extname(fileName).toLowerCase();
  return `Screenshot - ${date}${time ? ` ${time}` : ""}${extension}`;
}

/**
 * Retitles imported screenshots (marked by `screenshotHash`) still named after their file.
 * A title the user changed no longer equals the file name, so it is never touched, and a
 * second run finds nothing to do.
 */
export function tidyImportedScreenshots(db: DatabaseSync) {
  const rows = db
    .prepare(`SELECT id, created_at, file_name FROM (SELECT id, created_at, title, source_label,
        CASE WHEN json_valid(metadata) THEN json_extract(metadata, '$.fileName') END AS file_name,
        CASE WHEN json_valid(metadata) THEN json_extract(metadata, '$.screenshotHash') END AS hash
        FROM items)
      WHERE hash IS NOT NULL AND (title = file_name OR source_label IS NULL)`)
    .all() as { id: string; created_at: number; file_name: string | null }[];
  if (rows.length === 0) return;
  const retitle = db.prepare(
    "UPDATE items SET title = ? WHERE id = ? AND title = json_extract(metadata, '$.fileName')",
  );
  const label = db.prepare(
    "UPDATE items SET source_label = ? WHERE id = ? AND source_label IS NULL",
  );
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const row of rows) {
      if (row.file_name) retitle.run(screenshotTitle(row.file_name, row.created_at), row.id);
      label.run(SCREENSHOT_SOURCE_LABEL, row.id);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
