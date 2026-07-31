const japanDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function japanDateKey(date = new Date()) {
  const parts = japanDateFormatter.formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function japanDateStart(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+09:00`).getTime();
}
