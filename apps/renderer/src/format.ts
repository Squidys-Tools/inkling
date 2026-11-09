export function formatByteSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

const dateFormatter = (options: Intl.DateTimeFormatOptions) => {
  let held: Intl.DateTimeFormat | undefined;
  return (value: number | string | Date) =>
    (held ??= new Intl.DateTimeFormat(undefined, options)).format(new Date(value));
};

export const dayAndMonth = dateFormatter({ month: "short", day: "numeric" });
export const dayMonthYear = dateFormatter({ month: "short", day: "numeric", year: "numeric" });
export const monthDayStamp = dateFormatter({ month: "short", day: "2-digit" });
export const fullDate = dateFormatter({ month: "long", day: "numeric", year: "numeric" });
