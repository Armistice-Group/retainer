// CSV cells for exports: quoted when needed, and text that a spreadsheet
// would run as a formula (=, +, -, @) gets a leading ' — numbers, including
// negative ones, are left alone.
const NUMBER = /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s =
    typeof value === "string"
      ? value
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !NUMBER.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",") + "\r\n";
}
