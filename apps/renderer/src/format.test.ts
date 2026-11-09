import { expect, test } from "bun:test";
import { dayAndMonth, dayMonthYear, formatByteSize, fullDate, monthDayStamp } from "./format.ts";

test.each([
  [1023, "1023 B"],
  [1024, "1.0 KB"],
  [10 * 1024, "10 KB"],
  [1.5 * 1024 ** 3, "1.5 GB"],
  [1024 ** 4 - 1, "1024 GB"],
  [2048 * 1024 ** 3, "2.0 TB"],
])("%p bytes read %p", (bytes, text) => {
  expect(formatByteSize(bytes)).toBe(text);
});

test("the shared date formats match the inline options they replaced", () => {
  const stamp = Date.UTC(2025, 0, 15, 12);
  expect(dayAndMonth(stamp)).toBe(
    new Date(stamp).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  );
  expect(dayMonthYear(stamp)).toBe(
    new Date(stamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  );
  expect(monthDayStamp(stamp)).toBe(
    new Date(stamp).toLocaleDateString(undefined, { month: "short", day: "2-digit" }),
  );
  expect(fullDate(stamp)).toBe(
    new Date(stamp).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
  );
});
